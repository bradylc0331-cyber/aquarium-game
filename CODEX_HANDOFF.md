# 聖經樂園改版：本地 Codex 交接說明

## 目前完成狀態

- 海洋主題已改為「聖經樂園」。
- 七位寫實黑白人物線稿：挪亞、摩西、大衛、但以理、約拿、牧羊人、天使。
- 完整 A4 橫式塗色紙，每張包含四角定位方塊及專屬 QR Code，不必裁剪。
- 控制台會逐張偵測 A4 四角、自動做透視拉正、辨識人物 QR，再套用對應遮罩。
- 作品穩定約一秒後自動拍攝，隨機等待 30–60 秒後進入投影場景。
- 地面人物使用左右腿分離的踏步動畫；天使使用飄浮動畫。
- 背景包含薄雲、暖金光束、河面流水波光、前景草葉擺動與光點。
- 人物按鈕、手動重新對位、手動拍攝及送出皆保留為現場備援。
- `node --test test/*.test.js`：32 項測試通過。

私人預覽：

- 首頁：`https://bible-wonderland-preview.bradylc0331.chatgpt.site`
- 展示：`https://bible-wonderland-preview.bradylc0331.chatgpt.site/display.html`
- 控制台：`https://bible-wonderland-preview.bradylc0331.chatgpt.site/control.html`
- A4 塗色紙：`https://bible-wonderland-preview.bradylc0331.chatgpt.site/templates/print.html`

## 本機啟動

```bash
npm test
npm run serve
```

接著開啟：

- `http://localhost:8933/display.html`
- `http://localhost:8933/control.html`
- `http://localhost:8933/templates/print.html`

攝影機權限需要透過 `localhost` 或 HTTPS 網址使用，不要直接以 `file://` 開啟 HTML。

## 下一步最重要的實體測試

1. 用 Chrome 將任一人物紙列印成 A4、橫向、100%／實際大小。
2. 確認 QR Code 與四角黑色方塊沒有被印表機裁掉。
3. 使用實際 Webcam 向下拍攝完整 A4，確認四周保留少量空白。
4. 測試紙張歪斜時能否自動拉正、QR 是否切換到正確人物。
5. 完成一次自動拍攝，確認去背結果、30–60 秒延遲與投影登場。
6. 依實際鏡頭與燈光調整 `control.html` 的偵測門檻、QR 容錯或自動拍攝閾值。

## 主要修改位置

- `src/qrCode.js`：離線 QR 產生及七種人物 QR 比對。
- `src/constants.js`：A4 橫式座標、四角定位、QR 與人物工作區。
- `control.html`：攝影機、自動四角對位、QR 辨識、自動拍攝。
- `templates/print.html`：七張完整 A4 QR 人物紙。
- `src/creature.js`：人物自然踏步及腿部切割動畫。
- `src/species.js`：七位人物資料與個別腿部骨架範圍。
- `src/scene.js`：背景、流水、風吹草動與光點。
- `SETUP.md`：活動現場架設與攝影機說明。

## 注意事項

- 目前修改尚未推回原 GitHub repo；下載的壓縮檔才是最新版。
- 網站透過同一瀏覽器的 `BroadcastChannel` 傳送作品，控制台與展示頁應開在同一台電腦、同一瀏覽器。
- 只能在 App／RTSP 中觀看的 IP Camera 不會直接出現在 Chrome 攝影機清單；USB UVC Webcam 可直接使用。
- `.openai/hosting.json` 與 `scripts/build-static.js` 是私人預覽網站的靜態建置設定，可保留。
