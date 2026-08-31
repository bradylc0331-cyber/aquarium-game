# 塗鴉聖經樂園 Bible Wonderland Game

給教會兒童活動使用的互動網站：小朋友替完整身體的聖經人物線稿塗色，攝影機偵測作品穩定後自動拍攝，並在 30–60 秒後讓作品出現在投影中的聖經樂園。整套系統是純瀏覽器網頁、零建置、零後端依賴；一台筆電、一台投影電視和一台向下拍攝的攝影機即可運作。

## 這是怎麼運作的

1. **A4 QR 塗色紙**：從 `templates/print.html` 印出七位人物的完整 A4 橫式寫實黑白線稿。每張紙包含專屬 QR Code 與四個定位方塊，不用裁剪。
2. **自動對位與辨識**：攝影機逐張偵測 A4 四角、拉正透視，再從 QR 自動判斷是哪位人物；人物按鈕與手動重新對位仍保留作為備援。
3. **自動拍攝**：控制台會辨識對應人物遮罩內的線稿或色彩；作品穩定約一秒便自動拍攝、去背和裁切。同一張作品只拍一次，拿走後才會偵測下一張。
4. **延遲登場**：拍攝完成後隨機等待 30–60 秒，再自動傳到聖經樂園；手動掃描與送出按鈕仍保留作為現場備援。
5. **聖經樂園**：另一個分頁常駐投影暖色聖經時代風景，收到新人物後讓左右腿交替自然踏步（天使飄浮），並疊加薄雲、陽光、流水與風吹草動。

系統不需要 AI 即時辨識自由塗鴉。穩定度來自「固定線稿模板 + 定位標記透視校正」；活動現場不會呼叫任何外部 API。

## 內建人物

| id | 人物 | 動作風格 |
|---|---|---|
| `noah` | 挪亞 | 穩重緩行 |
| `moses` | 摩西 | 穩重緩行 |
| `david` | 大衛 | 較有活力的移動 |
| `daniel` | 但以理 | 穩重緩行 |
| `jonah` | 約拿 | 緩慢踏步 |
| `shepherd` | 牧羊人 | 穩重緩行 |
| `angel` | 天使 | 輕柔飄浮 |

人物資料集中在 `src/species.js`，每位人物包含正式線稿 `art`、掃描遮罩 `mask`、動作參數與簡化備援形狀。列印、即時對位與掃描都引用同一組素材；正式圖片讀取失敗時仍可退回幾何線稿，不會讓活動流程中斷。

## 檔案地圖

| 檔案 | 用途 |
|---|---|
| `index.html` | 首頁，連到投影、控制台與列印頁 |
| `display.html` | 聖經樂園投影畫面 |
| `control.html` | 攝影機、A4 自動對位、QR 辨識、掃描與送出控制台 |
| `templates/print.html` | 列印七張完整 A4 QR 人物塗色紙 |
| `assets/backgrounds/bible-world.png` | GPT Image 生成的聖經時代場景背景 |
| `assets/characters/*.png` | GPT Image 生成的七位寫實黑白塗色線稿 |
| `assets/masks/*.png` | 由線稿封閉輪廓產生的 400x300 掃描遮罩 |
| `src/species.js` | 人物形狀、名稱與動作參數 |
| `src/svgRaster.js` | 從同一份形狀資料產生列印線稿和掃描遮罩 |
| `src/homography.js` | 3x3 透視變換、反矩陣與影像攤平 |
| `src/markerDetect.js` | 偵測每張 A4 的四角黑色定位標記 |
| `src/qrCode.js` | 離線產生與辨識七組人物 QR Code |
| `src/extract.js` | 依遮罩去背、裁切塗色內容 |
| `src/creature.js` | 人物移動與 canvas 繪製；保留通用動作系統 |
| `src/scene.js` | 背景圖 cover 縮放、薄雲、暖金光束、河面波光與前景草葉 |
| `src/channel.js` | 控制台和投影分頁之間的 `BroadcastChannel` 包裝 |
| `src/calibrationStore.js` | 將校正矩陣存入 `localStorage` |
| `src/autoCapture.js` | 作品出現／移除判斷、穩定防重複拍攝與 30–60 秒延遲 |
| `scripts/generate-character-masks.py` | 更換人物線稿後重新產生對齊遮罩 |

## 背景美術

專案已包含 `assets/backgrounds/bible-world.png`。它是一張完整的 16:9 靜態場景，程式只在上面疊加動態特效；活動當天不需要圖片生成服務或 API 金鑰。

若要重新生成背景，可在 ChatGPT 的圖片生成功能貼上以下提示，挑選成品後覆蓋同一路徑。請保留「無人物、無文字」限制，以免和小朋友掃描進來的人物競爭視覺焦點。

```text
A warm, gentle children's storybook illustration of a peaceful biblical-era
landscape at golden hour. Rolling green hills, olive trees, a few sheep grazing,
a winding river, a small distant hillside town with flat-roofed stone houses,
soft warm sunlight rays coming through gentle clouds, and a calm blue sky.
Soft watercolor and gouache painting style, warm and inviting, wide 16:9
landscape composition with a calm uncluttered foreground, no people, no text,
no watermark, suitable for a children's church event background.
```

`src/scene.js` 使用 cover 規則等比例鋪滿畫面。圖片仍在載入或讀取失敗時，會先顯示暖色漸層，因此不會出現空白畫面。若另做 API 產圖工具，金鑰只能由 `OPENAI_API_KEY` 環境變數讀取，不能放在 HTML、前端 JavaScript 或版本庫中；可用尺寸與模型名稱請以 [OpenAI Image API 官方文件](https://platform.openai.com/docs/guides/image-generation) 為準。

## 本機測試

```bash
npm test
npm run serve
```

啟動後開啟 `http://localhost:8933`。Node 測試涵蓋 A4 比例、QR 圖樣與辨識、透視數學、角標偵測、遮罩裁切、人物動作與場景繪製。

### 掃描管線的端對端檢查

```bash
node scripts/e2e-scan-check.js
```

上面那些單元測試是**各測各的**，沒有任何一個驗證它們串起來會動——而串起來才是現場
真正跑的東西。這個檢查補的就是這一段：合成一張「印好、塗過色、又被斜著拍下來」的
照片，然後跑完整條真正的管線（偵測四角 → 求 homography → 反投影拉正 → 讀 QR →
套遮罩 → 掃描品質判定），確認七位人物在正拍與斜拍下都認得出來。

需要瀏覽器（canvas / Image），所以不放進 `npm test`——那一組刻意維持零相依。

攝影機權限、實際列印比例與跨分頁傳送仍需依 [`SETUP.md`](SETUP.md) 做現場煙霧測試。

## 現場架設

見 [`SETUP.md`](SETUP.md)。
