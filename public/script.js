(function () {
  "use strict";

  // Firebase Initialization
  const firebaseConfig = {
    apiKey: "AIzaSyD_kYlx-zjZx0oOlbYbMcEFI6gmOfhXbKQ",
    authDomain: "graphapp-cd650.firebaseapp.com",
    projectId: "graphapp-cd650",
    storageBucket: "graphapp-cd650.firebasestorage.app",
    messagingSenderId: "84865314952",
    appId: "1:84865314952:web:e12cd12ff312b1e0546f3d",
    measurementId: "G-JQSMVMQ36G"
  };
  firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();

  const csvInput = document.getElementById("csvInput");

  const excelOptions = document.getElementById("excelOptions");
  const sheetSelect = document.getElementById("sheetSelect");
  const tableSelect = document.getElementById("tableSelect");
  const tablePreview = document.getElementById("tablePreview");
  const chartType = document.getElementById("chartType");
  const legendPosition = document.getElementById("legendPosition");
  const reverseXAxis = document.getElementById("reverseXAxis");
  const xColumn = document.getElementById("xColumn");
  const yColumnContainer = document.getElementById("yColumnContainer");
  const chartTitle = document.getElementById("chartTitle");
  const xLabel = document.getElementById("xLabel");
  const yLabel = document.getElementById("yLabel");
  const yLabelRight = document.getElementById("yLabelRight");
  const drawButton = document.getElementById("drawButton");
  const savePngButton = document.getElementById("savePngButton");
  const savePdfButton = document.getElementById("savePdfButton");
  const saveXlsxButton = document.getElementById("saveXlsxButton");
  const saveXlsmButton = document.getElementById("saveXlsmButton");
  const message = document.getElementById("message");
  const canvas = document.getElementById("chartCanvas");
  const ctx = canvas.getContext("2d");
  
  const aiModelSelect = document.getElementById("aiModelSelect");
  const customModelInput = document.getElementById("customModelInput");
  const aiAnalyzeButton = document.getElementById("aiAnalyzeButton");
  const aiResultArea = document.getElementById("aiResultArea");
  const aiResultContent = document.getElementById("aiResultContent");

  const loginButton = document.getElementById("loginButton");
  const logoutButton = document.getElementById("logoutButton");
  const userNameDisplay = document.getElementById("userNameDisplay");

  const billingArea = document.getElementById("billingArea");
  const freeUsageDisplay = document.getElementById("freeUsageDisplay");
  const creditDisplay = document.getElementById("creditDisplay");
  const chargeButton = document.getElementById("chargeButton");

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("payment") === "success") {
    setTimeout(() => {
      setMessage("決済が完了し、チケットがチャージされました！");
      window.history.replaceState({}, document.title, "/");
    }, 500);
  }
  async function getToken() {
    return auth.currentUser ? await auth.currentUser.getIdToken() : null;
  }
  async function fetchUserStatus() {
    const token = await getToken();
    if (!token) {
      if (billingArea) billingArea.style.display = "none";
      return;
    }
    try {
      const response = await fetch("/api/user-status", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        if (freeUsageDisplay) freeUsageDisplay.textContent = data.dailyCount;
        if (creditDisplay) creditDisplay.textContent = data.extraCredits;
        if (billingArea) billingArea.style.display = "block";
      }
    } catch (e) {
      console.error("Failed to fetch user status", e);
    }
  }

  // 画面に戻ってきたときにチケット残高を自動更新する
  window.addEventListener("focus", () => {
    if (auth.currentUser) fetchUserStatus();
  });
  if (chargeButton) {
    chargeButton.addEventListener("click", async () => {
      const token = await getToken();
      if (!token) return;
      chargeButton.disabled = true;
      chargeButton.textContent = "読み込み中...";
      try {
        const response = await fetch("/api/create-checkout-session", {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.url) {
          window.open(data.url, '_blank');
          setMessage("決済画面を別タブで開きました。完了後、この画面に戻ると自動でチケットが反映されます。");
        } else {
          setMessage("エラー: " + (data.error || "決済画面に移動できませんでした"));
        }
      } catch (e) {
        setMessage("エラー: " + e.message);
      } finally {
        chargeButton.disabled = false;
        chargeButton.textContent = "🎟 200円で50回分チャージ";
      }
    });
  }

  auth.onAuthStateChanged(async (user) => {
    if (user) {
      userNameDisplay.textContent = user.displayName || "User";
      userNameDisplay.style.display = "inline";
      loginButton.style.display = "none";
      logoutButton.style.display = "inline-block";
      fetchUserStatus();
    } else {
      userNameDisplay.style.display = "none";
      loginButton.style.display = "inline-block";
      logoutButton.style.display = "none";
      fetchUserStatus();
    }
  });

  loginButton.addEventListener("click", () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch((error) => {
      console.error("Login failed:", error);
      setMessage("ログインに失敗しました: " + error.message);
    });
  });

  logoutButton.addEventListener("click", () => {
    auth.signOut();
  });

  const savedModel = localStorage.getItem("gemini_api_model");
  if (savedModel) {
    aiModelSelect.value = savedModel;
    if (savedModel === "custom") {
      customModelInput.classList.remove("hidden");
    }
  }
  
  const savedCustomModel = localStorage.getItem("gemini_custom_model");
  if (savedCustomModel) customModelInput.value = savedCustomModel;

  aiModelSelect.addEventListener("change", () => {
    localStorage.setItem("gemini_api_model", aiModelSelect.value);
    if (aiModelSelect.value === "custom") {
      customModelInput.classList.remove("hidden");
    } else {
      customModelInput.classList.add("hidden");
    }
  });

  customModelInput.addEventListener("change", () => {
    localStorage.setItem("gemini_custom_model", customModelInput.value.trim());
  });

  let dataStores = [];
  let nextStoreId = 1;
  let currentFileName = "chart";
  let hasChart = false;
  let excelWorkbook = null;

  drawEmpty();

  csvInput.addEventListener("change", async () => {
    const file = csvInput.files && csvInput.files[0];
    if (!file) {
      return;
    }

    try {
      resetLoadedData();
      currentFileName = cleanFileName(file.name.replace(/\.[^.]+$/, "") || "chart");
      if (isExcelFile(file.name)) {
        excelWorkbook = await parseExcelWorkbook(await file.arrayBuffer());
        excelWorkbook.sheets.forEach((sheet) => {
          if (sheet.tables && sheet.tables.length > 0) {
            // 複数表がある場合、最後の1つは「シート全体」のデータなので除外する（重複を防ぐため）
            const tablesToLoad = sheet.tables.length > 1 ? sheet.tables.slice(0, -1) : sheet.tables;
            
            tablesToLoad.forEach((table, index) => {
              const tableName = tablesToLoad.length > 1 ? `${sheet.name} - 表${index + 1}` : sheet.name;
              applyTable(table.data, `${tableName} を読み込みました。`, `${currentFileName} - ${tableName}`);
            });
          }
        });
      } else {
        const text = await file.text();
        const parsed = parseCsv(text);
        applyTable(parsed, `CSVファイル (${currentFileName}) を読み込みました。`, currentFileName);
      }
      
      if (dataStores.length > 0 && seriesContainer.children.length === 0) {
        addSeriesCard(dataStores[0].id);
      }
    } catch (err) {
      setMessage(`エラー: ${err.message}`);
    }
  });

  const addSeriesBtn = document.getElementById("addSeriesBtn");
  const seriesContainer = document.getElementById("seriesContainer");
  if (addSeriesBtn) {
    addSeriesBtn.addEventListener("click", () => addSeriesCard());
  }

  [chartType, legendPosition, reverseXAxis, chartTitle, xLabel, yLabel, yLabelRight].forEach((control) => {
    if (control) {
      control.addEventListener("change", () => {
        if (dataStores.length) {
          drawChart();
        }
      });
    }
  });

  drawButton.addEventListener("click", drawChart);

  aiAnalyzeButton.addEventListener("click", async () => {
    const token = await getToken();
    if (!token) {
      setMessage("※ AI機能を利用するにはログインしてください。");
      return;
    }
    if (!hasChart) {
      setMessage("先にグラフを作成してください。");
      return;
    }

    aiResultArea.classList.remove("hidden");
    aiResultContent.innerHTML = "<span class='loading-dots'>AIがグラフを分析しています</span>";
    aiAnalyzeButton.disabled = true;
    setMessage("");

    try {
      const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
      const base64Data = dataUrl.split(",")[1];

      const promptText = `あなたはプロのデータアナリストです。添付されたグラフ画像を分析し、データから読み取れる傾向や特徴について洞察を提供してください。
グラフタイトル: ${chartTitle.value}
X軸: ${xLabel.value}
Y軸: ${yLabel.value}
グラフ種類: ${chartType.options[chartType.selectedIndex].text}
凡例の位置: ${legendPosition.options[legendPosition.selectedIndex].text}

回答はMarkdown形式で、重要なポイントは箇条書きなどを使って分かりやすく解説してください。`;

      const requestBody = {
        contents: [
          {
            role: "user",
            parts: [
              { text: promptText },
              {
                inlineData: {
                  mimeType: "image/jpeg",
                  data: base64Data
                }
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 4096
        }
      };

      let selectedModel = aiModelSelect.value;
      if (selectedModel === "custom") {
        selectedModel = customModelInput.value.trim();
        if (!selectedModel) {
          throw new Error("カスタムモデル名を入力してください。");
        }
      }

      const response = await fetch(`/api/gemini`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          prompt: requestBody,
          model: selectedModel
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "API呼び出しに失敗しました。");
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "分析結果を取得できませんでした。";
      
      aiResultContent.innerHTML = parseSimpleMarkdown(text);
      
    } catch (error) {
      aiResultContent.innerHTML = `<span style="color: var(--danger)">エラー: ${error.message}</span>`;
    } finally {
      aiAnalyzeButton.disabled = false;
      fetchUserStatus();
    }
  });

  function parseSimpleMarkdown(text) {
    return text
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/^### (.*$)/gim, "<h4>$1</h4>")
      .replace(/^## (.*$)/gim, "<h3>$1</h3>")
      .replace(/^# (.*$)/gim, "<h2>$1</h2>")
      .replace(/^\- (.*$)/gim, "<li>$1</li>")
      .replace(/<\/li>\n<li>/gim, "</li><li>")
      .replace(/(<li>.*<\/li>)/gim, "<ul>$1</ul>")
      .replace(/\n/g, "<br>");
  }

  savePngButton.addEventListener("click", () => {
    const link = document.createElement("a");
    link.download = `${currentFileName}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  });

  savePdfButton.addEventListener("click", () => {
    const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
    const pdfBytes = createPdfWithJpeg(dataUrl, canvas.width, canvas.height);
    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    const link = document.createElement("a");
    link.download = `${currentFileName}.pdf`;
    link.href = URL.createObjectURL(blob);
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  });

  saveXlsxButton.addEventListener("click", () => {
    saveExcelWorkbook("xlsx");
  });

  saveXlsmButton.addEventListener("click", () => {
    saveExcelWorkbook("xlsm");
  });

  function enableControls(enabled) {
    [chartType, legendPosition, reverseXAxis, chartTitle, xLabel, yLabel, yLabelRight, drawButton, aiAnalyzeButton, addSeriesBtn].forEach((control) => {
      if (control) control.disabled = !enabled;
    });
  }

  function resetLoadedData() {
    excelWorkbook = null;
    dataStores = [];
    nextStoreId = 1;
    hasChart = false;
    enableControls(false);
    setSaveButtons(false);
    seriesContainer.innerHTML = "";

  }

  function applyTable(parsedRaw, summaryText, sourceName) {
    const parsed = normalizeTable(parsedRaw);
    if (parsed.length < 2) {
      throw new Error("見出し行とデータ行が必要です。");
    }

    const headers = parsed[0].map((value, index) => String(value).replace(/^\uFEFF/, "").trim() || `列${index + 1}`);
    const rows = parsed.slice(1).filter((row) => row.some((value) => String(value).trim() !== ""));
    
    handleDataLoaded(summaryText, headers, rows, sourceName);
  }

  function handleDataLoaded(summaryText, headers, rows, sourceName) {
    if (!rows || rows.length === 0) return;
    
    const storeId = "store_" + (nextStoreId++);
    dataStores.push({ id: storeId, name: sourceName || currentFileName, headers, rows });
    
    enableControls(true);
    hasChart = false;
    setSaveButtons(false);
    
    setMessage("");

    // Excelファイルで複数シートがある場合、すべての読み込みが終わってから最初のカードを作成するため、
    // ここでの自動生成は行いません（csvInputのイベントリスナー側で生成します）。
  }

  function addSeriesCard(defaultStoreId = null) {
    if (dataStores.length === 0) return;
    const storeId = defaultStoreId || dataStores[0].id;
    const ds = dataStores.find(d => d.id === storeId);
    if (!ds) return;
    
    const card = document.createElement("div");
    card.className = "series-card";
    
    const headerDiv = document.createElement("div");
    headerDiv.className = "series-header";
    headerDiv.textContent = "データ系列";
    const removeBtn = document.createElement("button");
    removeBtn.className = "series-remove-btn";
    removeBtn.textContent = "×";
    removeBtn.onclick = () => { card.remove(); drawChart(); };
    headerDiv.appendChild(removeBtn);
    
    const row1 = document.createElement("div");
    row1.className = "series-row";
    const srcSelect = document.createElement("select");
    srcSelect.className = "series-source";
    dataStores.forEach(d => {
      srcSelect.add(new Option(d.name, d.id));
    });
    srcSelect.value = storeId;
    const l1 = document.createElement("span"); l1.className = "series-label"; l1.textContent = "データ元:";
    row1.appendChild(l1);
    row1.appendChild(srcSelect);
    
    const row2 = document.createElement("div");
    row2.className = "series-row";
    const xSelect = document.createElement("select");
    xSelect.className = "series-x";
    const l2 = document.createElement("span"); l2.className = "series-label"; l2.textContent = "X列:";
    row2.appendChild(l2);
    row2.appendChild(xSelect);

    const row3 = document.createElement("div");
    row3.className = "series-row";
    const ySelect = document.createElement("select");
    ySelect.className = "series-y";
    const l3 = document.createElement("span"); l3.className = "series-label"; l3.textContent = "Y列:";
    row3.appendChild(l3);
    row3.appendChild(ySelect);
    
    const row4 = document.createElement("div");
    row4.className = "series-row series-sub-row";
    const axisSelect = document.createElement("select");
    axisSelect.className = "series-axis";
    axisSelect.add(new Option("左軸", "left"));
    axisSelect.add(new Option("右軸", "right"));
    const l4 = document.createElement("span"); l4.className = "series-label"; l4.textContent = "表示軸:";
    row4.appendChild(l4);
    row4.appendChild(axisSelect);

    const row6 = document.createElement("div");
    row6.className = "series-row";
    const trendSelect = document.createElement("select");
    trendSelect.className = "series-trend";
    trendSelect.add(new Option("近似(なし)", "none"));
    trendSelect.add(new Option("線形", "linear"));
    trendSelect.add(new Option("指数", "exponential"));
    trendSelect.add(new Option("対数", "logarithmic"));
    trendSelect.add(new Option("累乗", "power"));
    trendSelect.add(new Option("多項式", "polynomial"));
    const l6 = document.createElement("span"); l6.className = "series-label"; l6.textContent = "近似直線:";
    row6.appendChild(l6);
    row6.appendChild(trendSelect);
    
    card.appendChild(headerDiv);
    card.appendChild(row1);
    card.appendChild(row2);
    card.appendChild(row3);
    card.appendChild(row4);
    card.appendChild(row6);
    seriesContainer.appendChild(card);
    
    const updateCols = () => {
      const selectedDs = dataStores.find(d => d.id === srcSelect.value);
      xSelect.innerHTML = "";
      ySelect.innerHTML = "";
      if (selectedDs) {
        selectedDs.headers.forEach((h, i) => {
          xSelect.add(new Option(h, String(i)));
          ySelect.add(new Option(h, String(i)));
        });
        xSelect.value = "0";
        ySelect.value = String(Math.min(1, selectedDs.headers.length - 1));
      }
    };
    
    const syncLabels = (changedEl) => {
      const ds = dataStores.find(d => d.id === srcSelect.value);
      if (!ds) return;
      
      // xLabelは1つ目の系列のX列に合わせる
      if ((changedEl === xSelect || changedEl === srcSelect) && seriesContainer.children[0] === card) {
        xLabel.value = ds.headers[Number(xSelect.value)] || "X";
      }
      
      // yLabelは選択された軸に合わせて更新
      if (changedEl === ySelect || changedEl === axisSelect || changedEl === srcSelect) {
        // 全系列の中で、自分がその軸を使っている最初の系列かどうか判定
        const allCards = Array.from(seriesContainer.children);
        const myAxis = axisSelect.value;
        const firstCardOfThisAxis = allCards.find(c => c.querySelector(".series-axis").value === myAxis);
        
        if (firstCardOfThisAxis === card) {
          const label = ds.headers[Number(ySelect.value)] || "Y";
          if (myAxis === "left") yLabel.value = label;
          else yLabelRight.value = label;
        }
      }
    };

    updateCols();
    srcSelect.addEventListener("change", () => { updateCols(); syncLabels(srcSelect); drawChart(); });
    
    [xSelect, ySelect, axisSelect, trendSelect].forEach(el => {
      el.addEventListener("change", () => {
        syncLabels(el);
        drawChart();
      });
    });
    
    syncLabels(srcSelect);
    drawChart();
  }

  const COLORS = ["#2563eb", "#dc2626", "#16a34a", "#ca8a04", "#9333ea", "#0891b2", "#ea580c"];
  let currentChartSeries = [];

  function drawChart() {
    try {
      if (dataStores.length === 0 || seriesContainer.children.length === 0) {
        throw new Error("データ系列を追加してください。");
      }

      const allSeries = [];
      let colorIndex = 0;
      
      Array.from(seriesContainer.children).forEach(card => {
        const srcId = card.querySelector(".series-source").value;
        const xIdx = Number(card.querySelector(".series-x").value);
        const yIdx = Number(card.querySelector(".series-y").value);
        const axis = card.querySelector(".series-axis").value;
        const trend = card.querySelector(".series-trend").value;
        
        const ds = dataStores.find(d => d.id === srcId);
        if (!ds) return;
        
        const legend = ds.headers[yIdx] || `系列${allSeries.length + 1}`;
        
        const points = [];
        ds.rows.forEach(row => {
          const xRaw = String(row[xIdx] ?? "").trim();
          const xVal = parseNumber(row[xIdx]);
          const yVal = parseNumber(row[yIdx]);
          if (Number.isFinite(yVal) && xRaw !== "") {
            points.push({ xRaw: xRaw, x: chartType.value === "scatter" ? xVal : xRaw, y: yVal });
          }
        });
        
        if (points.length > 0) {
          allSeries.push({
            name: legend,
            sourceId: srcId,
            xIndex: xIdx,
            yIndex: yIdx,
            color: COLORS[colorIndex % COLORS.length],
            points: points,
            axis: axis,
            trendType: trend
          });
          colorIndex++;
        }
      });

      if (allSeries.length === 0) {
        throw new Error("選択されたY列に数値データが見つかりません。");
      }

      const leftSeries = allSeries.filter(s => s.axis === "left");
      if (!yLabel.value && leftSeries.length > 0) {
         yLabel.value = leftSeries[0].name;
      }
      const rightSeries = allSeries.filter(s => s.axis === "right");
      if (!yLabelRight.value && rightSeries.length > 0) {
         yLabelRight.value = rightSeries[0].name;
      }

      if (chartType.value === "scatter") {
        allSeries.forEach(s => {
           s.points = s.points.filter(p => Number.isFinite(p.x));
        });
        if (allSeries.every(s => s.points.length === 0)) {
          throw new Error("散布図ではX列も数値にしてください。");
        }
        renderScatter(allSeries.filter(s => s.points.length > 0));
      } else if (chartType.value === "bar") {
        renderBar(allSeries);
      } else {
        renderLine(allSeries);
      }

      currentChartSeries = allSeries;
      hasChart = true;
      setSaveButtons(true);
      setMessage("");
    } catch (error) {
      hasChart = false;
      setSaveButtons(false);
      setMessage(error.message);
    }
  }

  function setSaveButtons(enabled) {
    [savePngButton, savePdfButton, saveXlsxButton, saveXlsmButton].forEach((button) => {
      button.disabled = !enabled;
    });
  }

  function renderFrame(titleText) {
    clearCanvas();
    const plot = { left: 96, top: 40, right: canvas.width - 96, bottom: canvas.height - 120 };
    ctx.fillStyle = "#000000";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 24px 'Times New Roman', Times, serif";
    
    // 論文風に下部にタイトルを配置。プレフィックス「図: 」を付ける
    const textToDraw = titleText ? `図: ${titleText}` : "図: グラフ";
    ctx.fillText(textToDraw, canvas.width / 2, canvas.height - 24);
    
    return plot;
  }

  function drawLegend(plot, seriesList) {
    const trendlineMap = {
      linear: "線形近似",
      exponential: "指数近似",
      logarithmic: "対数近似",
      power: "累乗近似",
      polynomial: "多項式近似"
    };

    const items = [];
    seriesList.forEach(s => {
      items.push({ name: s.name, type: chartType.value, color: s.color });
      if (s.trendType && s.trendType !== "none") {
        const trendName = trendlineMap[s.trendType] || "近似曲線";
        items.push({ name: `${s.name} (${trendName})`, type: "trendline", color: s.color });
      }
    });

    ctx.save();
    ctx.font = "14px 'Times New Roman', Times, serif";
    let maxWidth = 0;
    items.forEach(item => {
      const w = ctx.measureText(item.name).width;
      if (w > maxWidth) maxWidth = w;
    });

    const boxWidth = maxWidth + 60;
    const boxHeight = items.length * 24 + 16;
    
    let boxX, boxY;
    switch (legendPosition.value) {
      case "top-left":
        boxX = plot.left + 12;
        boxY = plot.top + 12;
        break;
      case "bottom-right":
        boxX = plot.right - boxWidth - 12;
        boxY = plot.bottom - boxHeight - 12;
        break;
      case "bottom-left":
        boxX = plot.left + 12;
        boxY = plot.bottom - boxHeight - 12;
        break;
      case "top-right":
      default:
        boxX = plot.right - boxWidth - 12;
        boxY = plot.top + 12;
        break;
    }

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);

    ctx.fillStyle = "#000000";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    
    items.forEach((item, i) => {
      const itemY = boxY + 20 + i * 24;
      const textX = boxX + 44;
      ctx.fillStyle = "#000000";
      ctx.fillText(item.name, textX, itemY);

      const symX = boxX + 22;
      if (item.type === "scatter") {
        drawPoint(symX, itemY, item.color, 4);
      } else if (item.type === "line") {
        ctx.beginPath();
        ctx.moveTo(symX - 12, itemY);
        ctx.lineTo(symX + 12, itemY);
        ctx.strokeStyle = item.color;
        ctx.lineWidth = 2;
        ctx.stroke();
        drawPoint(symX, itemY, "#ffffff", 3, item.color);
      } else if (item.type === "bar") {
        ctx.fillStyle = item.color;
        ctx.fillRect(symX - 8, itemY - 6, 16, 12);
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(symX - 8, itemY - 6, 16, 12);
      } else if (item.type === "trendline") {
        ctx.beginPath();
        ctx.moveTo(symX - 12, itemY);
        ctx.lineTo(symX + 12, itemY);
        ctx.strokeStyle = item.color;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });
    ctx.restore();
  }

  function getScaleForAxis(seriesList, axis) {
    const axisSeries = seriesList.filter(s => s.axis === axis);
    if (axisSeries.length === 0) return null;
    const ys = [];
    axisSeries.forEach(s => s.points.forEach(p => ys.push(p.y)));
    return makeScale(ys);
  }

  function renderLine(seriesList) {
    const plot = renderFrame(chartTitle.value);
    
    const yScaleLeft = getScaleForAxis(seriesList, "left");
    const yScaleRight = getScaleForAxis(seriesList, "right");
    const yScalePrimary = yScaleLeft || yScaleRight;
    
    // Assume all series share the same X raw labels (use the first one's X raw)
    const xLabels = seriesList[0].points.map(point => point.xRaw);
    drawAxes(plot, yScaleLeft, yScaleRight, xLabels);

    const xAt = (index, length) => {
      if (length <= 1) {
        return (plot.left + plot.right) / 2;
      }
      const ratio = index / (length - 1);
      const effectiveRatio = (reverseXAxis && reverseXAxis.checked) ? (1 - ratio) : ratio;
      return plot.left + effectiveRatio * (plot.right - plot.left);
    };
    const yAt = (value, axis) => {
      const scale = axis === "right" && yScaleRight ? yScaleRight : yScalePrimary;
      return plot.bottom - ((value - scale.min) / (scale.max - scale.min)) * (plot.bottom - plot.top);
    };

    let anyTrend = false;

    seriesList.forEach(series => {
      ctx.beginPath();
      series.points.forEach((point, index) => {
        const x = xAt(index, series.points.length);
        const y = yAt(point.y, series.axis);
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.strokeStyle = series.color;
      ctx.lineWidth = 2;
      ctx.stroke();

      series.points.forEach((point, index) => drawPoint(xAt(index, series.points.length), yAt(point.y, series.axis), "#ffffff", 5, series.color));
      
      const scaleToUse = series.axis === "right" && yScaleRight ? yScaleRight : yScalePrimary;
      const hasTrend = calculateAndDrawTrendline(series.points, plot, null, scaleToUse, series.color, series.trendType);
      if (hasTrend) anyTrend = true;
    });

    drawLegend(plot, seriesList);
  }

  function renderScatter(seriesList) {
    const plot = renderFrame(chartTitle.value);
    
    const allXs = [];
    seriesList.forEach(s => s.points.forEach(p => allXs.push(p.x)));
    const xScale = makeScale(allXs);

    const yScaleLeft = getScaleForAxis(seriesList, "left");
    const yScaleRight = getScaleForAxis(seriesList, "right");
    const yScalePrimary = yScaleLeft || yScaleRight;
    
    drawAxes(plot, yScaleLeft, yScaleRight, makeTickLabels(xScale), xScale);

    let anyTrend = false;

    seriesList.forEach(series => {
      series.points.forEach((point) => {
        const ratio = (point.x - xScale.min) / (xScale.max - xScale.min);
        const effectiveRatio = (reverseXAxis && reverseXAxis.checked) ? (1 - ratio) : ratio;
        const x = plot.left + effectiveRatio * (plot.right - plot.left);
        const scale = series.axis === "right" && yScaleRight ? yScaleRight : yScalePrimary;
        const y = plot.bottom - ((point.y - scale.min) / (scale.max - scale.min)) * (plot.bottom - plot.top);
        drawPoint(x, y, series.color, 5, series.color);
      });
      
      const scaleToUse = series.axis === "right" && yScaleRight ? yScaleRight : yScalePrimary;
      const hasTrend = calculateAndDrawTrendline(series.points, plot, xScale, scaleToUse, series.color, series.trendType);
      if (hasTrend) anyTrend = true;
    });
    
    drawLegend(plot, seriesList);
  }

  function renderBar(seriesList) {
    const plot = renderFrame(chartTitle.value);
    
    const getBarScale = (axis) => {
      const scale = getScaleForAxis(seriesList, axis);
      if (scale) scale.min = Math.min(0, scale.min);
      return scale;
    };
    const yScaleLeft = getBarScale("left");
    const yScaleRight = getBarScale("right");
    const yScalePrimary = yScaleLeft || yScaleRight;
    
    const xLabels = seriesList[0].points.map(point => point.xRaw);
    drawAxes(plot, yScaleLeft, yScaleRight, xLabels);

    const gap = 8;
    const numPoints = seriesList[0].points.length;
    const numSeries = seriesList.length;
    const clusterWidth = Math.max(8, (plot.right - plot.left) / numPoints - gap);
    const barWidth = clusterWidth / numSeries;

    seriesList.forEach((series, sIndex) => {
      const scale = series.axis === "right" && yScaleRight ? yScaleRight : yScalePrimary;
      const zeroY = plot.bottom - ((0 - scale.min) / (scale.max - scale.min)) * (plot.bottom - plot.top);
      
      series.points.forEach((point, index) => {
        const ratio = (index + 0.5) / numPoints;
        const effectiveRatio = (reverseXAxis && reverseXAxis.checked) ? (1 - ratio) : ratio;
        const clusterCenter = plot.left + effectiveRatio * (plot.right - plot.left);
        const barCenter = clusterCenter - (clusterWidth / 2) + (sIndex * barWidth) + (barWidth / 2);
        
        const y = plot.bottom - ((point.y - scale.min) / (scale.max - scale.min)) * (plot.bottom - plot.top);
        const top = Math.min(y, zeroY);
        const height = Math.abs(zeroY - y);
        
        ctx.fillStyle = series.color;
        ctx.fillRect(barCenter - barWidth / 2, top, barWidth, Math.max(1, height));
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(barCenter - barWidth / 2, top, barWidth, Math.max(1, height));
      });
    });

    drawLegend(plot, seriesList);
  }

  function drawAxes(plot, yScaleLeft, yScaleRight, xLabels, xScale) {
    const drawYAxis = (scale, isRight) => {
      if (!scale) return;
      const yStep = scale.step || ((scale.max - scale.min) / 5);
      const yTicks = Math.max(1, Math.round((scale.max - scale.min) / yStep));
      
      ctx.font = "16px 'Times New Roman', Times, serif";
      ctx.fillStyle = "#000000";
      ctx.textAlign = isRight ? "left" : "right";
      ctx.textBaseline = "middle";
      
      for (let index = 0; index <= yTicks; index += 1) {
        const value = scale.min + index * yStep;
        const y = plot.bottom - (index / yTicks) * (plot.bottom - plot.top);
        
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const tickX = isRight ? plot.right : plot.left;
        const tickDir = isRight ? -6 : 6;
        ctx.moveTo(tickX, y);
        ctx.lineTo(tickX + tickDir, y);
        ctx.stroke();
        
        const textX = isRight ? plot.right + 10 : plot.left - 10;
        ctx.fillText(formatNumber(value), textX, y);
      }
      
      const labelText = isRight ? yLabelRight.value : yLabel.value;
      if (labelText) {
        ctx.save();
        ctx.fillStyle = "#000000";
        ctx.font = "700 18px 'Times New Roman', Times, serif";
        ctx.translate(isRight ? plot.right + 60 : plot.left - 60, (plot.top + plot.bottom) / 2);
        ctx.rotate(isRight ? Math.PI / 2 : -Math.PI / 2);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(labelText, 0, 0);
        ctx.restore();
      }
    };

    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.rect(plot.left, plot.top, plot.right - plot.left, plot.bottom - plot.top);
    ctx.stroke();

    drawYAxis(yScaleLeft, false);
    drawYAxis(yScaleRight, true);

    const maxLabels = Math.min(8, xLabels.length);
    const labelStep = Math.max(1, Math.ceil(xLabels.length / maxLabels));
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let index = 0; index < xLabels.length; index += labelStep) {
      const ratio = xScale
        ? (xLabels[index] - xScale.min) / (xScale.max - xScale.min)
        : index / Math.max(1, xLabels.length - 1);
      const effectiveRatio = (reverseXAxis && reverseXAxis.checked) ? (1 - ratio) : ratio;
      const x = plot.left + effectiveRatio * (plot.right - plot.left);
        
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, plot.bottom);
      ctx.lineTo(x, plot.bottom - 6);
      ctx.moveTo(x, plot.top);
      ctx.lineTo(x, plot.top + 6);
      ctx.stroke();
      
      drawRotatedLabel(String(xLabels[index]), x, plot.bottom + 10);
    }

    ctx.save();
    ctx.fillStyle = "#000000";
    ctx.font = "700 18px 'Times New Roman', Times, serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(xLabel.value || "X", (plot.left + plot.right) / 2, canvas.height - 70);
    ctx.restore();
  }

  function drawRotatedLabel(text, x, y) {
    const value = text.length > 14 ? `${text.slice(0, 13)}...` : text;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-Math.PI / 5);
    ctx.fillText(value, 0, 0);
    ctx.restore();
  }

  function drawPoint(x, y, fillColor, radius, strokeColor) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.strokeStyle = strokeColor || "#000000";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  function drawEmpty(text) {
    clearCanvas();
    ctx.fillStyle = "#000000";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 24px 'Times New Roman', Times, serif";
    ctx.fillText(text || "CSVまたはExcelを読み込むとグラフを作成できます。", canvas.width / 2, canvas.height / 2);
  }

  function clearCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function parseCsv(text) {
    const rowsOut = [];
    let row = [];
    let value = "";
    let inQuotes = false;

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      const next = text[index + 1];

      if (char === '"' && inQuotes && next === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        row.push(value);
        value = "";
      } else if ((char === "\n" || char === "\r") && !inQuotes) {
        if (char === "\r" && next === "\n") {
          index += 1;
        }
        row.push(value);
        rowsOut.push(row);
        row = [];
        value = "";
      } else {
        value += char;
      }
    }

    if (value !== "" || row.length) {
      row.push(value);
      rowsOut.push(row);
    }

    return rowsOut;
  }

  function normalizeTable(table) {
    const source = table
      .map((row) => row.map((value) => String(value ?? "").trim()))
      .filter((row) => row.some((value) => value !== ""));
    if (source.length < 2) {
      return source;
    }

    const dataStart = source.findIndex((row) => countNumericCells(row) >= 2 && !isSummaryRow(row));
    if (dataStart <= 0) {
      return source;
    }

    const headerRows = source
      .slice(0, dataStart)
      .filter((row) => countFilledCells(row) > 1);
    const effectiveHeaderRows = headerRows.length ? headerRows : [source[dataStart - 1]];
    const width = Math.max(...source.map((row) => row.length));
    const mergedHeaders = [];

    for (let columnIndex = 0; columnIndex < width; columnIndex += 1) {
      const parts = [];
      effectiveHeaderRows.forEach((row) => {
        const value = row[columnIndex] || "";
        if (value && parts[parts.length - 1] !== value) {
          parts.push(value);
        }
      });
      mergedHeaders[columnIndex] = parts.join(" / ") || `列${columnIndex + 1}`;
    }

    const bodyRows = source
      .slice(dataStart)
      .filter((row) => !isSummaryRow(row))
      .map((row) => {
        const next = Array.from({ length: width }, (_, index) => row[index] ?? "");
        return trimTrailingEmpty(next);
      })
      .filter((row) => row.some((value) => value !== ""));

    return [trimTrailingEmpty(mergedHeaders), ...bodyRows];
  }

  function detectTableCandidates(rawTable) {
    const source = rawTable
      .map((row) => row.map((value) => String(value ?? "").trim()))
      .filter((row) => row.some((value) => value !== ""));
    const candidates = [];
    let index = 0;

    while (index < source.length) {
      while (index < source.length && (countNumericCells(source[index]) < 2 || isSummaryRow(source[index]))) {
        index += 1;
      }
      if (index >= source.length) {
        break;
      }

      const dataStart = index;
      while (index < source.length && (countNumericCells(source[index]) >= 2 || isSummaryRow(source[index]))) {
        index += 1;
      }
      const dataEnd = index;
      const headerStart = findHeaderStart(source, dataStart);
      const normalized = normalizeTable(source.slice(headerStart, dataEnd));
      addTableCandidate(candidates, normalized, headerStart, dataStart, dataEnd);
    }

    const wholeSheet = normalizeTable(source);
    addTableCandidate(candidates, wholeSheet, 0, 0, source.length);
    return candidates;
  }

  function findHeaderStart(rows, dataStart) {
    let headerStart = dataStart;
    for (let index = dataStart - 1; index >= 0 && dataStart - index <= 6; index -= 1) {
      if (countNumericCells(rows[index]) >= 2 && !isSummaryRow(rows[index])) {
        break;
      }
      if (countFilledCells(rows[index]) >= 1) {
        headerStart = index;
      }
    }
    return headerStart;
  }

  function addTableCandidate(candidates, table, headerStart, dataStart, dataEnd) {
    if (table.length < 2 || table[0].length < 2 || !table.slice(1).some((row) => countNumericCells(row) >= 1)) {
      return;
    }

    const signature = JSON.stringify(table);
    if (candidates.some((candidate) => candidate.signature === signature)) {
      return;
    }

    candidates.push({
      data: table,
      signature,
      label: `表${candidates.length + 1}: ${table.length - 1}行 x ${table[0].length}列 (Excel ${dataStart + 1}-${dataEnd}行付近)`
    });
  }

  function countFilledCells(row) {
    return row.filter((value) => String(value ?? "").trim() !== "").length;
  }

  function countNumericCells(row) {
    return row.filter((value) => Number.isFinite(parseNumber(value))).length;
  }

  function isSummaryRow(row) {
    const label = String(row[0] ?? "").trim();
    return label === "平均" || label === "標準偏差";
  }

  function isExcelFile(fileName) {
    const lowerName = fileName.toLowerCase();
    if (lowerName.endsWith(".xls")) {
      throw new Error("古い.xls形式は未対応です。.xlsx形式で保存し直して読み込んでください。");
    }
    return lowerName.endsWith(".xlsx") || lowerName.endsWith(".xlsm");
  }

  async function parseExcelWorkbook(arrayBuffer) {
    const entries = await unzipXlsx(arrayBuffer);
    const relsXml = textEntry(entries, "_rels/.rels");
    const workbookPath = normalizeZipPath(findOfficeDocumentPath(relsXml) || "xl/workbook.xml");
    const workbookXml = textEntry(entries, workbookPath);
    const workbookDir = workbookPath.includes("/") ? workbookPath.slice(0, workbookPath.lastIndexOf("/")) : "";
    const workbookRelsPath = `${workbookDir}/_rels/${workbookPath.split("/").pop()}.rels`;
    const workbookRels = parseRelationships(textEntry(entries, workbookRelsPath));
    const workbookDoc = parseXml(workbookXml);
    const sheetNodes = Array.from(workbookDoc.getElementsByTagName("sheet"));
    if (!sheetNodes.length) {
      throw new Error("Excelファイルにシートが見つかりません。");
    }

    const sharedStrings = parseSharedStrings(entries.get("xl/sharedStrings.xml") || "");
    const sheets = sheetNodes.map((sheet, index) => {
      const relId = sheet.getAttribute("r:id") || sheet.getAttribute("id");
      const sheetTarget = workbookRels.get(relId);
      if (!sheetTarget) {
        return null;
      }
      const sheetPath = resolveZipPath(workbookDir, sheetTarget);
      const rawTable = parseSheetXml(textEntry(entries, sheetPath), sharedStrings);
      const tables = detectTableCandidates(rawTable);
      return {
        name: sheet.getAttribute("name") || `Sheet${index + 1}`,
        rawTable,
        tables
      };
    }).filter(Boolean);

    if (!sheets.some((sheet) => sheet.tables.length)) {
      throw new Error("Excel内にグラフ化できる表候補が見つかりません。");
    }

    return {
      fileName: currentFileName,
      sheets: sheets.filter((sheet) => sheet.tables.length)
    };
  }

  async function unzipXlsx(arrayBuffer) {
    const data = new Uint8Array(arrayBuffer);
    const view = new DataView(arrayBuffer);
    const eocdOffset = findEndOfCentralDirectory(data);
    const totalEntries = view.getUint16(eocdOffset + 10, true);
    const centralDirOffset = view.getUint32(eocdOffset + 16, true);
    const decoder = new TextDecoder("utf-8");
    const entries = new Map();
    let offset = centralDirOffset;

    for (let index = 0; index < totalEntries; index += 1) {
      if (view.getUint32(offset, true) !== 0x02014b50) {
        throw new Error("Excelファイルの構造を読み取れません。");
      }

      const method = view.getUint16(offset + 10, true);
      const compressedSize = view.getUint32(offset + 20, true);
      const fileNameLength = view.getUint16(offset + 28, true);
      const extraLength = view.getUint16(offset + 30, true);
      const commentLength = view.getUint16(offset + 32, true);
      const localHeaderOffset = view.getUint32(offset + 42, true);
      const nameBytes = data.slice(offset + 46, offset + 46 + fileNameLength);
      const name = decoder.decode(nameBytes);
      const normalizedName = normalizeZipPath(name);
      offset += 46 + fileNameLength + extraLength + commentLength;
      if (!normalizedName.endsWith(".xml") && !normalizedName.endsWith(".rels")) {
        continue;
      }

      const localNameLength = view.getUint16(localHeaderOffset + 26, true);
      const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
      const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const compressed = data.slice(dataStart, dataStart + compressedSize);
      if (method !== 0 && method !== 8) {
        throw new Error("このExcelファイルの圧縮形式には対応していません。");
      }
      const bytes = method === 0 ? compressed : await inflateRaw(compressed);
      entries.set(normalizedName, decoder.decode(bytes));
    }

    return entries;
  }

  function findEndOfCentralDirectory(data) {
    for (let index = data.length - 22; index >= Math.max(0, data.length - 66000); index -= 1) {
      if (data[index] === 0x50 && data[index + 1] === 0x4b && data[index + 2] === 0x05 && data[index + 3] === 0x06) {
        return index;
      }
    }
    throw new Error("Excelファイルの終端情報が見つかりません。");
  }

  async function inflateRaw(bytes) {
    if (typeof DecompressionStream === "undefined") {
      throw new Error("このブラウザではExcelファイルの展開に対応していません。最新版のChromeまたはEdgeで開いてください。");
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  function textEntry(entries, path) {
    const value = entries.get(normalizeZipPath(path));
    if (value === undefined) {
      throw new Error(`Excelファイル内の${path}を読み込めません。`);
    }
    return value;
  }

  function parseXml(text) {
    const doc = new DOMParser().parseFromString(text, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) {
      throw new Error("Excelファイル内のXMLを読み込めません。");
    }
    return doc;
  }

  function findOfficeDocumentPath(relsXml) {
    const doc = parseXml(relsXml);
    const relationships = doc.getElementsByTagName("Relationship");
    for (const relationship of relationships) {
      if ((relationship.getAttribute("Type") || "").endsWith("/officeDocument")) {
        return relationship.getAttribute("Target");
      }
    }
    return "";
  }

  function parseRelationships(relsXml) {
    const doc = parseXml(relsXml);
    const result = new Map();
    for (const relationship of doc.getElementsByTagName("Relationship")) {
      result.set(relationship.getAttribute("Id"), relationship.getAttribute("Target"));
    }
    return result;
  }

  function parseSharedStrings(xmlText) {
    if (!xmlText) {
      return [];
    }
    const doc = parseXml(xmlText);
    return Array.from(doc.getElementsByTagName("si")).map((item) => {
      const textNodes = item.getElementsByTagName("t");
      return Array.from(textNodes)
        .filter((node) => {
          const parentName = node.parentNode ? node.parentNode.nodeName.toLowerCase() : "";
          return parentName !== "rph";
        })
        .map((node) => node.textContent || "")
        .join("");
    });
  }

  function parseSheetXml(xmlText, sharedStrings) {
    const doc = parseXml(xmlText);
    const output = [];
    for (const row of doc.getElementsByTagName("row")) {
      const rowIndex = Math.max(0, Number(row.getAttribute("r") || output.length + 1) - 1);
      const values = [];
      for (const cell of row.getElementsByTagName("c")) {
        const ref = cell.getAttribute("r") || "";
        const columnIndex = ref ? columnNameToIndex(ref.replace(/[0-9]/g, "")) : values.length;
        values[columnIndex] = readCellValue(cell, sharedStrings);
      }
      output[rowIndex] = trimTrailingEmpty(values).map((value) => value ?? "");
    }
    applyMergedCells(output, doc);
    return output
      .map((row) => trimTrailingEmpty(row || []).map((value) => value ?? ""))
      .filter((row) => row.some((value) => String(value).trim() !== ""));
  }

  function applyMergedCells(rows, doc) {
    for (const mergeCell of doc.getElementsByTagName("mergeCell")) {
      const ref = mergeCell.getAttribute("ref") || "";
      const [startRef, endRef] = ref.split(":");
      if (!startRef || !endRef) {
        continue;
      }

      const start = parseCellRef(startRef);
      const end = parseCellRef(endRef);
      const value = rows[start.row]?.[start.column] ?? "";
      if (value === "") {
        continue;
      }

      for (let rowIndex = start.row; rowIndex <= end.row; rowIndex += 1) {
        rows[rowIndex] = rows[rowIndex] || [];
        for (let columnIndex = start.column; columnIndex <= end.column; columnIndex += 1) {
          if (rows[rowIndex][columnIndex] === undefined || rows[rowIndex][columnIndex] === "") {
            rows[rowIndex][columnIndex] = value;
          }
        }
      }
    }
  }

  function parseCellRef(ref) {
    const column = ref.replace(/[0-9]/g, "");
    const row = ref.replace(/[A-Z]/gi, "");
    return {
      column: columnNameToIndex(column.toUpperCase()),
      row: Math.max(0, Number(row) - 1)
    };
  }

  function readCellValue(cell, sharedStrings) {
    const type = cell.getAttribute("t");
    if (type === "inlineStr") {
      return Array.from(cell.getElementsByTagName("t")).map((node) => node.textContent || "").join("");
    }

    const valueNode = cell.getElementsByTagName("v")[0];
    const raw = valueNode ? valueNode.textContent || "" : "";
    if (type === "s") {
      return sharedStrings[Number(raw)] ?? "";
    }
    if (type === "b") {
      return raw === "1" ? "TRUE" : "FALSE";
    }
    return raw;
  }

  function columnNameToIndex(name) {
    let index = 0;
    for (const char of name) {
      index = index * 26 + char.charCodeAt(0) - 64;
    }
    return Math.max(0, index - 1);
  }

  function trimTrailingEmpty(values) {
    let end = values.length;
    while (end > 0 && (values[end - 1] === undefined || values[end - 1] === "")) {
      end -= 1;
    }
    return values.slice(0, end);
  }

  function normalizeZipPath(path) {
    return String(path || "").replace(/^\/+/, "").replace(/\\/g, "/");
  }

  function resolveZipPath(baseDir, target) {
    const normalizedTarget = normalizeZipPath(target);
    if (normalizedTarget.startsWith("xl/")) {
      return normalizedTarget;
    }
    const parts = `${baseDir}/${normalizedTarget}`.split("/");
    const resolved = [];
    for (const part of parts) {
      if (!part || part === ".") {
        continue;
      }
      if (part === "..") {
        resolved.pop();
      } else {
        resolved.push(part);
      }
    }
    return resolved.join("/");
  }

  function parseNumber(value) {
    if (value === null || value === undefined) {
      return NaN;
    }
    const cleaned = String(value).replace(/,/g, "").trim();
    if (!cleaned) {
      return NaN;
    }
    return Number(cleaned);
  }

  function makeScale(values) {
    let rawMin = Math.min(...values);
    let rawMax = Math.max(...values);
    if (!Number.isFinite(rawMin) || !Number.isFinite(rawMax)) {
      rawMin = 0;
      rawMax = 1;
    }
    
    if (rawMin === rawMax) {
      if (rawMin === 0) {
        rawMin = 0; rawMax = 10;
      } else {
        const pad = Math.abs(rawMin) * 0.1;
        rawMin -= pad;
        rawMax += pad;
      }
    } else {
      const range = rawMax - rawMin;
      let padMin = rawMin === 0 ? 0 : range * 0.05;
      let padMax = rawMax === 0 ? 0 : range * 0.05;
      if (rawMin > 0 && rawMin - padMin < 0) padMin = rawMin;
      if (rawMax < 0 && rawMax + padMax > 0) padMax = -rawMax;
      rawMin -= padMin;
      rawMax += padMax;
    }

    const targetTicks = 5;
    const roughStep = (rawMax - rawMin) / targetTicks;
    const mag = Math.pow(10, Math.floor(Math.log10(roughStep)));
    const normalizedStep = roughStep / mag;
    
    let niceStep;
    if (normalizedStep < 1.5) niceStep = 1 * mag;
    else if (normalizedStep < 2.5) niceStep = 2 * mag;
    else if (normalizedStep < 3.5) niceStep = 2.5 * mag;
    else if (normalizedStep < 7.5) niceStep = 5 * mag;
    else niceStep = 10 * mag;
    
    const min = Math.floor(rawMin / niceStep) * niceStep;
    const max = Math.ceil(rawMax / niceStep) * niceStep;
    
    return { min, max, step: niceStep };
  }

  function makeTickLabels(scale) {
    const step = scale.step || ((scale.max - scale.min) / 5);
    const ticks = Math.round((scale.max - scale.min) / step);
    return Array.from({ length: ticks + 1 }, (_, index) => {
      const value = scale.min + index * step;
      return formatNumber(value);
    });
  }

  function formatNumber(value) {
    if (value === 0) return "0";
    const abs = Math.abs(value);

    if (abs >= 1e15 || abs < 1e-15) {
      return value.toExponential(2);
    }

    const prefixes = [
      { unit: "T", power: 1e12 },
      { unit: "G", power: 1e9 },
      { unit: "M", power: 1e6 },
      { unit: "k", power: 1e3 },
      { unit: "", power: 1 },
      { unit: "m", power: 1e-3 },
      { unit: "μ", power: 1e-6 },
      { unit: "n", power: 1e-9 },
      { unit: "p", power: 1e-12 }
    ];

    for (let i = 0; i < prefixes.length; i++) {
      // Allow a small margin for floating point inaccuracies
      if (abs >= prefixes[i].power * 0.999999) {
        const scaled = value / prefixes[i].power;
        return Number(scaled.toFixed(2)).toString() + prefixes[i].unit;
      }
    }

    return Number(value.toFixed(2)).toString();
  }

  function setMessage(text) {
    message.textContent = text || "";
  }

  function cleanFileName(name) {
    return name.replace(/[\\/:*?"<>|]/g, "_");
  }

  function saveExcelWorkbook(extension) {
    try {
      if (!hasChart || currentChartSeries.length === 0) {
        throw new Error("先にグラフを作成してください。");
      }
      
      const megaHeaders = [];
      const maxLength = Math.max(...currentChartSeries.map(s => s.points.length));
      const megaRows = Array.from({ length: maxLength }, () => []);
      
      currentChartSeries.forEach(s => {
        megaHeaders.push(s.name + "_X");
        megaHeaders.push(s.name);
      });
      
      for (let i = 0; i < maxLength; i++) {
        const row = [];
        currentChartSeries.forEach(s => {
          if (i < s.points.length) {
            row.push(s.points[i].x);
            row.push(s.points[i].y);
          } else {
            row.push("");
            row.push("");
          }
        });
        megaRows[i] = row;
      }

      const chartConfig = {
        series: currentChartSeries,
        chartType: chartType.value,
        title: chartTitle.value,
        xLabel: xLabel.value,
        yLabel: yLabel.value,
        rowCount: maxLength
      };

      const workbookBytes = createExcelWorkbook(extension, chartConfig, megaHeaders, megaRows);
      const type = extension === "xlsm"
        ? "application/vnd.ms-excel.sheet.macroEnabled.12"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      const blob = new Blob([workbookBytes], { type });
      const link = document.createElement("a");
      link.download = `${currentFileName}.${extension}`;
      link.href = URL.createObjectURL(blob);
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      setMessage("");
    } catch (error) {
      setMessage(error.message);
    }
  }

  function createExcelWorkbook(extension, chartConfig, megaHeaders, megaRows) {
    const isMacroEnabled = extension === "xlsm";
    const sheetXml = createWorksheetXml(megaHeaders, megaRows);
    const workbookContentType = isMacroEnabled
      ? "application/vnd.ms-excel.sheet.macroEnabled.main+xml"
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml";

    return createZip({
      "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="${workbookContentType}"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>
  <Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>
</Types>`,
      "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
      "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="グラフ" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`,
      "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`,
      "xl/worksheets/sheet1.xml": sheetXml,
      "xl/worksheets/_rels/sheet1.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>
</Relationships>`,
      "xl/drawings/drawing1.xml": createDrawingXmlForChart(megaHeaders.length),
      "xl/drawings/_rels/drawing1.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart1.xml"/>
</Relationships>`,
      "xl/charts/chart1.xml": createChartXml(chartConfig)
    });
  }

  function createWorksheetXml(tableHeaders, tableRows) {
    const allRows = [tableHeaders, ...tableRows];
    const maxColumns = Math.max(1, ...allRows.map((row) => row.length));
    const dataRows = allRows.map((row, rowIndex) => {
      const cells = [];
      for (let columnIndex = 0; columnIndex < maxColumns; columnIndex += 1) {
        const value = row[columnIndex] ?? "";
        if (String(value).trim() === "") {
          continue;
        }
        const cellRef = `${columnIndexToName(columnIndex)}${rowIndex + 1}`;
        cells.push(createCellXml(cellRef, value, rowIndex === 0));
      }
      return `<row r="${rowIndex + 1}">${cells.join("")}</row>`;
    }).join("");
    const lastRef = `${columnIndexToName(Math.max(maxColumns - 1, 0))}${allRows.length}`;

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dimension ref="A1:${lastRef}"/>
  <sheetViews><sheetView workbookViewId="0"/></sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols>${Array.from({ length: maxColumns }, (_, index) => `<col min="${index + 1}" max="${index + 1}" width="16" customWidth="1"/>`).join("")}</cols>
  <sheetData>${dataRows}</sheetData>
  <drawing r:id="rId1"/>
</worksheet>`;
  }

  function createCellXml(cellRef, value, isHeader) {
    const text = String(value);
    const number = parseNumber(text);
    if (!isHeader && Number.isFinite(number)) {
      return `<c r="${cellRef}"><v>${number}</v></c>`;
    }
    return `<c r="${cellRef}" t="inlineStr"><is><t>${escapeXml(text)}</t></is></c>`;
  }

  function createDrawingXmlForChart(columnCount) {
    const startColumn = Math.max(0, Math.min(columnCount + 1, 12));
    const widthEmu = 900 * 9525;
    const heightEmu = 570 * 9525;
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart">
  <xdr:oneCellAnchor>
    <xdr:from>
      <xdr:col>${startColumn}</xdr:col>
      <xdr:colOff>0</xdr:colOff>
      <xdr:row>1</xdr:row>
      <xdr:rowOff>0</xdr:rowOff>
    </xdr:from>
    <xdr:ext cx="${widthEmu}" cy="${heightEmu}"/>
    <xdr:graphicFrame>
      <xdr:nvGraphicFramePr>
        <xdr:cNvPr id="2" name="グラフ"/>
        <xdr:cNvGraphicFramePr/>
      </xdr:nvGraphicFramePr>
      <xdr:xfrm>
        <a:off x="0" y="0"/>
        <a:ext cx="0" cy="0"/>
      </xdr:xfrm>
      <a:graphic>
        <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">
          <c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId1"/>
        </a:graphicData>
      </a:graphic>
    </xdr:graphicFrame>
    <xdr:clientData/>
  </xdr:oneCellAnchor>
</xdr:wsDr>`;
  }

  function createChartXml(config) {
    const { series, chartType, title, xLabel, yLabel, rowCount } = config;
    const sheetName = "グラフ";
    
    const titleText = escapeXml(title || "グラフ");
    const xTitleText = escapeXml(xLabel || "X");
    const yTitleText = escapeXml(yLabel || "Y");

    let plotXml = "";
    
    const excelTrendMap = {
      linear: "linear",
      exponential: "exp",
      logarithmic: "log",
      power: "power",
      polynomial: "poly"
    };

    const seriesNodes = series.map((s, sIdx) => {
      // In the mega-table, each series takes 2 columns (X and Y).
      // So sIdx * 2 is X column, sIdx * 2 + 1 is Y column.
      const xCol = columnIndexToName(sIdx * 2);
      const yCol = columnIndexToName(sIdx * 2 + 1);
      
      const xRange = `='${sheetName}'!$${xCol}$2:$${xCol}$${s.points.length + 1}`;
      const yRange = `='${sheetName}'!$${yCol}$2:$${yCol}$${s.points.length + 1}`;
      
      const seriesName = escapeXml(s.name);
      const colorHex = COLORS[sIdx % COLORS.length].replace('#', '');
      
      const sTrendType = s.trendType;
      const trendNode = (sTrendType && sTrendType !== "none" && excelTrendMap[sTrendType]) ? 
        `<c:trendline>
          <c:trendlineType val="${excelTrendMap[sTrendType]}"/>
          ${sTrendType === "polynomial" ? '<c:order val="2"/>' : ''}
          <c:dispEq val="0"/>
          <c:dispRSqr val="0"/>
        </c:trendline>` : "";

      if (chartType === "bar") {
        return `
        <c:ser>
          <c:idx val="${sIdx}"/>
          <c:order val="${sIdx}"/>
          <c:tx><c:v>${seriesName}</c:v></c:tx>
          <c:spPr><a:solidFill><a:srgbClr val="${colorHex}"/></a:solidFill></c:spPr>
          <c:cat><c:strRef><c:f>${xRange}</c:f></c:strRef></c:cat>
          <c:val><c:numRef><c:f>${yRange}</c:f></c:numRef></c:val>
          ${trendNode}
        </c:ser>`;
      } else {
        const spPr = chartType === "line" 
          ? `<c:spPr><a:ln><a:solidFill><a:srgbClr val="${colorHex}"/></a:solidFill></a:ln></c:spPr>` 
          : `<c:spPr><a:ln><a:noFill/></a:ln></c:spPr>`;
        const marker = `<c:marker><c:symbol val="circle"/><c:size val="5"/><c:spPr><a:solidFill><a:srgbClr val="${colorHex}"/></a:solidFill><a:ln><a:solidFill><a:srgbClr val="${colorHex}"/></a:solidFill></a:ln></c:spPr></c:marker>`;
        return `
        <c:ser>
          <c:idx val="${sIdx}"/>
          <c:order val="${sIdx}"/>
          <c:tx><c:v>${seriesName}</c:v></c:tx>
          ${spPr}
          ${marker}
          <c:xVal><c:numRef><c:f>${xRange}</c:f></c:numRef></c:xVal>
          <c:yVal><c:numRef><c:f>${yRange}</c:f></c:numRef></c:yVal>
          ${trendNode}
        </c:ser>`;
      }
    }).join("");

    if (chartType === "bar") {
      plotXml = `
      <c:barChart>
        <c:barDir val="col"/>
        <c:grouping val="clustered"/>
        <c:varyColors val="0"/>
        ${seriesNodes}
        <c:axId val="1"/>
        <c:axId val="2"/>
      </c:barChart>`;
    } else {
      const scatterStyle = chartType === "line" ? "lineMarker" : "marker";
      plotXml = `
      <c:scatterChart>
        <c:scatterStyle val="${scatterStyle}"/>
        <c:varyColors val="0"/>
        ${seriesNodes}
        <c:axId val="1"/>
        <c:axId val="2"/>
      </c:scatterChart>`;
    }

    const xAxisType = chartType === "bar" ? "c:catAx" : "c:valAx";
    const axesXml = `
      <${xAxisType}>
        <c:axId val="1"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="b"/>
        <c:majorGridlines><c:spPr><a:ln><a:noFill/></a:ln></c:spPr></c:majorGridlines>
        <c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/>
          <a:p><a:pPr><a:defRPr sz="1200" b="0"/></a:pPr><a:r><a:t>${xTitleText}</a:t></a:r></a:p>
          <a:p><a:pPr><a:defRPr sz="1400" b="1"/></a:pPr><a:r><a:t>図: ${titleText}</a:t></a:r></a:p>
        </c:rich></c:tx>
        <c:layout/>
        <c:overlay val="0"/>
        </c:title>
        <c:numFmt formatCode="General" sourceLinked="1"/>
        <c:majorTickMark val="in"/>
        <c:minorTickMark val="none"/>
        <c:tickLblPos val="nextTo"/>
        <c:spPr><a:ln><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:ln></c:spPr>
        <c:txPr>
          <a:bodyPr/>
          <a:lstStyle/>
          <a:p><a:pPr><a:defRPr sz="1100"/></a:pPr><a:endParaRPr/></a:p>
        </c:txPr>
        <c:crossAx val="2"/>
        <c:crosses val="autoZero"/>
      </${xAxisType}>
      <c:valAx>
        <c:axId val="2"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="l"/>
        <c:majorGridlines><c:spPr><a:ln><a:noFill/></a:ln></c:spPr></c:majorGridlines>
        <c:title><c:tx><c:rich><a:bodyPr rot="-5400000" vert="horz"/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1200" b="0"/></a:pPr><a:r><a:t>${yTitleText}</a:t></a:r></a:p></c:rich></c:tx>
        <c:layout/>
        <c:overlay val="0"/>
        </c:title>
        <c:numFmt formatCode="General" sourceLinked="1"/>
        <c:majorTickMark val="in"/>
        <c:minorTickMark val="none"/>
        <c:tickLblPos val="nextTo"/>
        <c:spPr><a:ln><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:ln></c:spPr>
        <c:txPr>
          <a:bodyPr/>
          <a:lstStyle/>
          <a:p><a:pPr><a:defRPr sz="1100"/></a:pPr><a:endParaRPr/></a:p>
        </c:txPr>
        <c:crossAx val="1"/>
        <c:crosses val="autoZero"/>
      </c:valAx>
    `;

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <c:chart>
    <c:plotArea>
      <c:spPr>
        <a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>
        <a:ln><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:ln>
      </c:spPr>
      ${plotXml}
      ${axesXml}
    </c:plotArea>
    <c:legend>
      <c:legendPos val="tr"/>
      <c:spPr>
        <a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>
        <a:ln><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:ln>
      </c:spPr>
    </c:legend>
  </c:chart>
</c:chartSpace>`;
  }

  function createZip(files) {
    const encoder = new TextEncoder();
    const entries = Object.entries(files).map(([name, content]) => ({
      name,
      data: content instanceof Uint8Array ? content : encoder.encode(content)
    }));
    const parts = [];
    const centralParts = [];
    let offset = 0;
    const now = new Date();
    const dosTime = ((now.getHours() & 31) << 11) | ((now.getMinutes() & 63) << 5) | ((Math.floor(now.getSeconds() / 2)) & 31);
    const dosDate = (((now.getFullYear() - 1980) & 127) << 9) | (((now.getMonth() + 1) & 15) << 5) | (now.getDate() & 31);

    entries.forEach((entry) => {
      const nameBytes = encoder.encode(entry.name);
      const crc = crc32(entry.data);
      const localHeader = new Uint8Array(30 + nameBytes.length);
      const localView = new DataView(localHeader.buffer);
      localView.setUint32(0, 0x04034b50, true);
      localView.setUint16(4, 20, true);
      localView.setUint16(10, dosTime, true);
      localView.setUint16(12, dosDate, true);
      localView.setUint32(14, crc, true);
      localView.setUint32(18, entry.data.length, true);
      localView.setUint32(22, entry.data.length, true);
      localView.setUint16(26, nameBytes.length, true);
      localHeader.set(nameBytes, 30);
      parts.push(localHeader, entry.data);

      const centralHeader = new Uint8Array(46 + nameBytes.length);
      const centralView = new DataView(centralHeader.buffer);
      centralView.setUint32(0, 0x02014b50, true);
      centralView.setUint16(4, 20, true);
      centralView.setUint16(6, 20, true);
      centralView.setUint16(12, dosTime, true);
      centralView.setUint16(14, dosDate, true);
      centralView.setUint32(16, crc, true);
      centralView.setUint32(20, entry.data.length, true);
      centralView.setUint32(24, entry.data.length, true);
      centralView.setUint16(28, nameBytes.length, true);
      centralView.setUint32(42, offset, true);
      centralHeader.set(nameBytes, 46);
      centralParts.push(centralHeader);
      offset += localHeader.length + entry.data.length;
    });

    const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
    const endHeader = new Uint8Array(22);
    const endView = new DataView(endHeader.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(8, entries.length, true);
    endView.setUint16(10, entries.length, true);
    endView.setUint32(12, centralSize, true);
    endView.setUint32(16, offset, true);
    return concatBytes([...parts, ...centralParts, endHeader]);
  }

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  const CRC_TABLE = (() => {
    const table = [];
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      table[index] = value >>> 0;
    }
    return table;
  })();

  function concatBytes(chunks) {
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    chunks.forEach((chunk) => {
      result.set(chunk, offset);
      offset += chunk.length;
    });
    return result;
  }

  function dataUrlToBytes(dataUrl) {
    const base64 = dataUrl.split(",")[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  function columnIndexToName(index) {
    let value = index + 1;
    let name = "";
    while (value > 0) {
      const remainder = (value - 1) % 26;
      name = String.fromCharCode(65 + remainder) + name;
      value = Math.floor((value - 1) / 26);
    }
    return name;
  }

  function escapeXml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeHtml(value) {
    return escapeXml(value).replace(/'/g, "&#39;");
  }

  function createPdfWithJpeg(dataUrl, imageWidth, imageHeight) {
    const base64 = dataUrl.split(",")[1];
    const binary = atob(base64);
    const imageBytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      imageBytes[index] = binary.charCodeAt(index);
    }

    const pageWidth = 842;
    const pageHeight = 595;
    const margin = 36;
    const maxWidth = pageWidth - margin * 2;
    const maxHeight = pageHeight - margin * 2;
    const scale = Math.min(maxWidth / imageWidth, maxHeight / imageHeight);
    const drawWidth = imageWidth * scale;
    const drawHeight = imageHeight * scale;
    const drawX = (pageWidth - drawWidth) / 2;
    const drawY = (pageHeight - drawHeight) / 2;

    const imageCommand = `q\n${drawWidth.toFixed(2)} 0 0 ${drawHeight.toFixed(2)} ${drawX.toFixed(2)} ${drawY.toFixed(2)} cm\n/Im0 Do\nQ`;
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
      `<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>\nstream\n${binary}\nendstream`,
      `<< /Length ${imageCommand.length} >>\nstream\n${imageCommand}\nendstream`
    ];

    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    objects.forEach((object, index) => {
      offsets.push(pdf.length);
      pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xrefOffset = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (let index = 1; index <= objects.length; index += 1) {
      pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    const bytes = new Uint8Array(pdf.length);
    for (let index = 0; index < pdf.length; index += 1) {
      bytes[index] = pdf.charCodeAt(index) & 0xff;
    }
    return bytes;
  }

  function calculateAndDrawTrendline(points, plot, xScale, yScale, color, type) {
    if (!type || type === "none" || points.length < 2) return false;

    const numericPoints = points.map((p, i) => ({
      x: Number.isFinite(p.x) ? p.x : i,
      y: p.y
    }));

    let fn = null;
    let n = numericPoints.length;

    if (type === "linear") {
      let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
      numericPoints.forEach(p => {
        sumX += p.x; sumY += p.y; sumXY += p.x * p.y; sumXX += p.x * p.x;
      });
      const denominator = (n * sumXX - sumX * sumX);
      if (Math.abs(denominator) < 1e-10) return;
      const slope = (n * sumXY - sumX * sumY) / denominator;
      const intercept = (sumY - slope * sumX) / n;
      fn = (x) => slope * x + intercept;
    } else if (type === "exponential") {
      let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
      const validPoints = numericPoints.filter(p => p.y > 0);
      n = validPoints.length;
      if (n < 2) return;
      validPoints.forEach(p => {
        const ly = Math.log(p.y);
        sumX += p.x; sumY += ly; sumXY += p.x * ly; sumXX += p.x * p.x;
      });
      const denominator = (n * sumXX - sumX * sumX);
      if (Math.abs(denominator) < 1e-10) return;
      const b = (n * sumXY - sumX * sumY) / denominator;
      const a = Math.exp((sumY - b * sumX) / n);
      fn = (x) => a * Math.exp(b * x);
    } else if (type === "logarithmic") {
      let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
      const validPoints = numericPoints.filter(p => p.x > 0);
      n = validPoints.length;
      if (n < 2) return;
      validPoints.forEach(p => {
        const lx = Math.log(p.x);
        sumX += lx; sumY += p.y; sumXY += lx * p.y; sumXX += lx * lx;
      });
      const denominator = (n * sumXX - sumX * sumX);
      if (Math.abs(denominator) < 1e-10) return;
      const b = (n * sumXY - sumX * sumY) / denominator;
      const a = (sumY - b * sumX) / n;
      fn = (x) => a + b * Math.log(x);
    } else if (type === "power") {
      let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
      const validPoints = numericPoints.filter(p => p.x > 0 && p.y > 0);
      n = validPoints.length;
      if (n < 2) return;
      validPoints.forEach(p => {
        const lx = Math.log(p.x);
        const ly = Math.log(p.y);
        sumX += lx; sumY += ly; sumXY += lx * ly; sumXX += lx * lx;
      });
      const denominator = (n * sumXX - sumX * sumX);
      if (Math.abs(denominator) < 1e-10) return;
      const b = (n * sumXY - sumX * sumY) / denominator;
      const a = Math.exp((sumY - b * sumX) / n);
      fn = (x) => a * Math.pow(x, b);
    } else if (type === "polynomial") {
      let sumX = 0, sumXX = 0, sumXXX = 0, sumXXXX = 0;
      let sumY = 0, sumXY = 0, sumXXY = 0;
      numericPoints.forEach(p => {
        const x2 = p.x * p.x;
        sumX += p.x; sumXX += x2; sumXXX += x2 * p.x; sumXXXX += x2 * x2;
        sumY += p.y; sumXY += p.x * p.y; sumXXY += x2 * p.y;
      });
      const det = n * (sumXX * sumXXXX - sumXXX * sumXXX) - sumX * (sumX * sumXXXX - sumXXX * sumXX) + sumXX * (sumX * sumXXX - sumXX * sumXX);
      if (Math.abs(det) < 1e-10) return;
      const detA = sumY * (sumXX * sumXXXX - sumXXX * sumXXX) - sumX * (sumXY * sumXXXX - sumXXY * sumXXX) + sumXX * (sumXY * sumXXX - sumXXY * sumXX);
      const detB = n * (sumXY * sumXXXX - sumXXX * sumXXY) - sumY * (sumX * sumXXXX - sumXXX * sumXX) + sumXX * (sumX * sumXXY - sumXX * sumXY);
      const detC = n * (sumXX * sumXXY - sumXY * sumXXX) - sumX * (sumX * sumXXY - sumXY * sumXX) + sumY * (sumX * sumXXX - sumXX * sumXX);
      const a = detA / det;
      const b = detB / det;
      const c = detC / det;
      fn = (x) => a + b * x + c * x * x;
    }

    if (!fn) return;

    ctx.save();
    ctx.beginPath();
    const segments = 200;
    const minX = Math.min(...numericPoints.map(p => p.x));
    const maxX = Math.max(...numericPoints.map(p => p.x));
    
    let started = false;
    for (let i = 0; i <= segments; i++) {
      const xVal = minX + (maxX - minX) * (i / segments);
      if (type === "logarithmic" || type === "power") {
          if (xVal <= 0) continue;
      }
      const yVal = fn(xVal);
      if (!Number.isFinite(yVal)) continue;

      let drawX, drawY;
      if (xScale) {
         const ratio = (xVal - xScale.min) / (xScale.max - xScale.min);
         const effectiveRatio = (reverseXAxis && reverseXAxis.checked) ? (1 - ratio) : ratio;
         drawX = plot.left + effectiveRatio * (plot.right - plot.left);
      } else {
         const ratio = (xVal - 0) / (points.length - 1);
         const effectiveRatio = (reverseXAxis && reverseXAxis.checked) ? (1 - ratio) : ratio;
         drawX = plot.left + effectiveRatio * (plot.right - plot.left);
      }
      drawY = plot.bottom - ((yVal - yScale.min) / (yScale.max - yScale.min)) * (plot.bottom - plot.top);
      
      // Prevent drawing way out of bounds
      if (drawY < plot.top - 1000 || drawY > plot.bottom + 1000) continue;
      
      if (!started) {
        ctx.moveTo(drawX, drawY);
        started = true;
      } else {
        ctx.lineTo(drawX, drawY);
      }
    }
    
    ctx.strokeStyle = color || "#000000";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.stroke();
    ctx.restore();
    return true;
  }
})();
