const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

const fs = require('fs');

// 環境変数の読み込み
dotenv.config();

// Firebase Adminの初期化（トークン検証・DBアクセス用）
const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
if (fs.existsSync(serviceAccountPath)) {
  const serviceAccount = require(serviceAccountPath);
  initializeApp({
    credential: cert(serviceAccount),
    projectId: 'graphapp-cd650'
  });
} else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    initializeApp({
      credential: cert(serviceAccount),
      projectId: 'graphapp-cd650'
    });
  } catch (error) {
    console.error('環境変数 FIREBASE_SERVICE_ACCOUNT のパースに失敗しました:', error);
    initializeApp({ projectId: 'graphapp-cd650' });
  }
} else {
  initializeApp({
    projectId: 'graphapp-cd650'
  });
  console.warn('\n⚠️ 警告: serviceAccountKey.json も FIREBASE_SERVICE_ACCOUNT も見つかりません。Firestoreにアクセスできません。\n');
}

const db = getFirestore();

const app = express();
const PORT = process.env.PORT || 3000;

// Stripeの初期化
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Webhookエンドポイント（express.json()より前に定義し、rawボディを取得する）
app.post('/api/webhook', express.raw({type: 'application/json'}), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook Error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // 決済完了イベントを処理
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const uid = session.client_reference_id;
    if (uid) {
      try {
        const userRef = db.collection('users').doc(uid);
        const doc = await userRef.get();
        let credits = 50; // 200円で50回分チャージ
        if (doc.exists) {
          const data = doc.data();
          credits = (data.extraCredits || 0) + 50;
        }
        await userRef.set({ extraCredits: credits }, { merge: true });
      } catch (e) {
        console.error('Firestore Error in Webhook:', e);
      }
    }
  }
  res.json({received: true});
});

// ミドルウェアの設定
app.use(cors());
app.use(express.json());

// ユーザーステータス取得エンドポイント
app.get('/api/user-status', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: '認証エラー' });
  try {
    const decodedToken = await getAuth().verifyIdToken(authHeader.split('Bearer ')[1]);
    const doc = await db.collection('users').doc(decodedToken.uid).get();
    let data = doc.exists ? doc.data() : { dailyCount: 0, extraCredits: 0, usageDate: '' };
    const today = new Date().toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' });
    if (data.usageDate !== today) data.dailyCount = 0;
    res.json({ dailyCount: data.dailyCount || 0, extraCredits: data.extraCredits || 0, MAX_DAILY_USAGE: 3 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Checkoutセッション作成エンドポイント
app.post('/api/create-checkout-session', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: '認証エラー' });
  try {
    const decodedToken = await getAuth().verifyIdToken(authHeader.split('Bearer ')[1]);
    const domain = req.headers.origin || 'http://localhost:3000';
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: { currency: 'jpy', product_data: { name: 'AI分析チャージ（50回分）' }, unit_amount: 200 },
        quantity: 1,
      }],
      mode: 'payment',
      client_reference_id: decodedToken.uid,
      success_url: `${domain}/?payment=success`,
      cancel_url: `${domain}/?payment=cancel`,
    });
    res.json({ url: session.url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// publicフォルダの中身（静的ファイル）を配信する
app.use(express.static(path.join(__dirname, 'public')));

// Gemini APIへのプロキシ用エンドポイント
app.post('/api/gemini', async (req, res) => {
    // Firebaseの認証トークン確認
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: '認証されていません。' });
    }
    const idToken = authHeader.split('Bearer ')[1];
    
    let uid;
    try {
        const decodedToken = await getAuth().verifyIdToken(idToken);
        uid = decodedToken.uid;
    } catch (error) {
        console.error('Auth Error:', error);
        return res.status(401).json({ error: '無効なトークンです。ログインし直してください。' });
    }

    // 利用回数（クォータ）のチェック
    const MAX_DAILY_USAGE = 3;
    // 日本時間での今日の日付文字列を取得 (例: "2026/6/17")
    const today = new Date().toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' });
    const userRef = db.collection('users').doc(uid);

    try {
        const doc = await userRef.get();
        let usageData = { dailyCount: 0, usageDate: today, extraCredits: 0 };

        if (doc.exists) {
            const data = doc.data();
            usageData.extraCredits = data.extraCredits || 0;
            if (data.usageDate === today) {
                usageData.dailyCount = data.dailyCount;
            }
        }

        if (usageData.dailyCount >= MAX_DAILY_USAGE) {
            if (usageData.extraCredits > 0) {
                // チケットを消費して許可
                usageData.extraCredits -= 1;
            } else {
                return res.status(429).json({ error: `本日の無料枠（${MAX_DAILY_USAGE}回）に達しました。追加チャージをご利用ください。` });
            }
        } else {
            // 無料枠を消費
            usageData.dailyCount += 1;
        }

        // 保存
        usageData.usageDate = today;
        await userRef.set(usageData, { merge: true });

    } catch (error) {
        console.error('Firestore Error:', error);
        return res.status(500).json({ error: 'データベースの確認中にエラーが発生しました。' });
    }

    const { prompt, model } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: 'サーバーにAPIキーが設定されていません。' });
    }

    try {
        // バックエンドからGemini APIを呼び出す
        // Node 18+なのでグローバルのfetchが使えます
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(prompt)
            }
        );

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || "Gemini APIの呼び出しに失敗しました。");
        }

        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// サーバー起動
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
