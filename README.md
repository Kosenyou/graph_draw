# グラフ作成 Ver1.0

CSVまたはExcelファイルを読み込み、折れ線グラフ・散布図・棒グラフを作成して、PNG、PDF、XLSX、XLSMで保存できます。

## 使い方

1. `index.html` を開きます。
2. `CSV / Excel読み込み` からCSV、`.xlsx`、`.xlsm` ファイルを選択します。
3. Excelの場合はシートと表候補を選びます。
4. グラフ種類、X列、Y列を選びます。
5. `グラフ作成` を押します。
6. `PNG保存`、`PDF保存`、`XLSX保存`、`XLSM保存` で保存します。

## Excel出力について

- XLSX / XLSM出力では、読み込んだ表データと現在表示中のグラフ画像を1つのシートに保存します。
- XLSM出力はマクロ有効ブック形式ですが、マクロ本体は含めません。

## 読み込みファイルについて

- 1行目を列名として扱います。
- Excelファイルはシート一覧を表示し、選んだシートの表候補を読み込みます。
- 1シート内に複数の表がある場合は、数値データのまとまりから表候補を自動検出します。
- Excelの結合セルと複数段見出しは、各段の見出しを `/` でつないだ列名として読み込みます。
- `平均`、`標準偏差` 行はグラフ用のデータ点から外します。
- 古い `.xls` 形式は未対応です。Excelで `.xlsx` として保存し直してください。
- Y列は数値が必要です。
- 散布図ではX列も数値が必要です。

## システム構成（Technology Stack）

このアプリは以下の技術を用いて構築されています。エンジニアがコードレビューや開発を引き継ぐ際の参考にしてください。

* **フロントエンド (Frontend)**
  * HTML5 / CSS3 (Vanilla)
  * Vanilla JavaScript
  * Chart.js (グラフ描画)
  * SheetJS (Excelファイルのパース・出力)
* **バックエンド (Backend)**
  * Node.js / Express
  * `server.js` にてAPIエンドポイントと静的ファイルの配信を担当
* **インフラ・デプロイ (Infrastructure)**
  * Render (Web Serviceとしてデプロイ)
* **認証・データベース (Auth & DB)**
  * Firebase Authentication (Googleログイン)
  * Firestore (ユーザーのチケット残高、利用日時の管理をバックエンドから実行)
* **決済システム (Payments)**
  * Stripe Checkout (都度課金によるチケットチャージ)
  * Stripe Webhook (`/api/webhook` で支払い完了を受け取りFirestoreを更新)
* **AI機能 (AI API)**
  * Google Gemini API (`/api/gemini` を経由してバックエンドから安全に呼び出し)
# graph_draw
