# 聖經樂園改版計畫（給 Codex 執行用）

## 這份文件是什麼

`aquarium-game` 這個 repo 現在是一個「小朋友塗色 → 掃描 → 投影進虛擬水族箱」的教會兒童活動網站，
主題是海洋生物。這份文件是把它**改成聖經主題**的完整規格：聖經人物取代海洋生物、聖經場景
（用 GPT Image 生成美術）取代水族箱。目的是讓 Codex（或任何接手的工程師/agent）不需要跟原作者
再對話，照這份文件就能動手做。

**Repo**：`https://github.com/bradylc0331-cyber/aquarium-game`（`main` 分支，目前已有可運作的
海洋生物版本）。開工前先 clone 下來，跑一次 `npm test` 確認 22 個測試全過，再跑
`npm run serve` 實際點開 `index.html` / `control.html` / `display.html` 感受一下現況，
再開始改。

## 整體判斷：哪些東西不用動

這是主題換皮，不是重寫。以下模組是**跟海洋/聖經主題無關的純邏輯**，直接沿用，不要因為
「換主題」就順手重構或改名，那只會增加風險又沒有實質好處：

| 檔案 | 為什麼不用動 |
|---|---|
| `src/homography.js` | 3x3 透視變換數學，跟畫面內容無關 |
| `src/markerDetect.js` | 校正墊角標偵測，跟畫面內容無關 |
| `src/extract.js` | 用遮罩去背/裁切像素，跟畫面內容無關 |
| `src/constants.js` | 校正墊版面常數，跟畫面內容無關 |
| `src/channel.js` | 跨分頁傳資料，跟畫面內容無關 |
| `src/calibrationStore.js` | 校正矩陣存 localStorage，跟畫面內容無關 |
| `src/svgRaster.js` | 把「形狀資料」轉成線稿/遮罩的機制，聖經人物一樣是「形狀資料」，機制不用換 |
| `src/creature.js` 的核心結構 | `Creature` class 跟 `motionOffset()` 的參數化動作系統本來就是通用的（見下方「動作行為」章節），只需要新增/調整幾個 style，不用重寫 |

**唯一需要換內容（不是換架構）的地方是：**

1. `src/species.js` 的資料內容（海洋生物 → 聖經人物）——**模組名稱、匯出的 API
   （`Species`、`getSpecies`、`SPECIES`）建議保留不變**，只換陣列裡的資料。這是「一個模板系統
   裡放什麼模板」的差異，不是不同的抽象，硬要改名只會讓 `svgRaster.js`／`creature.js`／
   `control.html`／`display.html`／`templates/print.html` 裡一堆 `Species.xxx` 的呼叫全部要跟著
   動，徒增改錯的風險。
2. `src/scene.js` 的背景畫法（程式畫的海水漸層/珊瑚/海草 → 貼一張 GPT Image 生成的聖經場景圖 +
   疊加動態特效）。
3. `display.html` / `control.html` / `templates/print.html` 裡的**文案**（「選生物種類」→
   「選聖經人物」之類）。
4. 一個新的美術素材：`assets/backgrounds/bible-world.jpg`（GPT Image 生成，見下方）。

## 主題設計決策（原作者未及與需求方確認，先照這個做，之後要換隨時可調）

因為需求方還沒回覆細節就要交給 Codex 做，這裡先訂出一組合理的預設，**全部集中在
`src/species.js` 的資料跟一張背景圖，之後要換人物或換場景都只改這兩處，不用動邏輯**：

- **場景**：不綁定單一聖經故事（不是只做「挪亞方舟」或只做「出埃及記」），而是一個通用的
  「聖經樂園」風景——類似水族箱「很多種海洋生物共游一缸」的邏輯，換成「很多位聖經人物共同
  出現在同一個聖經時代風景裡」。好處：主日學每週想放不同人物都可以，不用每次重做場景。
  如果之後想指定成單一故事（例如專門做挪亞方舟），只要換掉背景圖跟人物清單即可，架構不變。
- **人物名單**（7 位，涵蓋舊約新約，給小朋友的形象都設計得溫和不嚇人，避免暴力/黑暗畫面）：
  1. 挪亞 Noah
  2. 摩西 Moses
  3. 大衛 David
  4. 但以理 Daniel
  5. 約拿 Jonah
  6. 牧羊人 Shepherd（代表詩篇 23 篇/降生故事，不特指某個人名，兼容性最高）
  7. 天使 Angel
- **動作比喻**：海洋生物是「游動」，人物換成「安靜地出現、緩緩走動/飄浮，帶著光暈」——細節
  見下方「動作行為」。

## 美術素材：GPT Image 生成場景

> 原本規劃用 Gemini，需求方後來改指定用 **GPT Image**（OpenAI 的圖片生成模型，需求方稱
> 「GPT Image 2」；OpenAI API 目前的生圖模型代號是 `gpt-image-1`——實作時如果 OpenAI 已經
> 推出更新版本的模型代號，以 [OpenAI 官方 Image API 文件](https://platform.openai.com/docs/guides/image-generation)
> 當下列出的最新型號為準，不用糾結名稱字面）。下面流程整體邏輯跟原本 Gemini 版一樣，
> 只是生圖的工具跟 API 換掉。

### 為什麼只需要一張圖，不需要一堆圖層

現有的水族箱背景是純程式畫的（漸層＋程式畫的珊瑚/海草/光束/氣泡）。聖經樂園改成：

1. 用 GPT Image 生成**一張**完整的靜態場景插畫（山丘、橄欖樹、遠方城鎮、河流、羊群、天空——
   細節都畫在這張圖裡），當作 `<canvas>` 的滿版背景圖（cover 方式縮放置中，見下方程式片段）。
2. 動態效果**不是**靠多張圖或影片，是跟水族箱氣泡/光束一樣，在這張靜態圖「上面」疊加程式
   畫的動畫圖層：飄動的雲、掃過的光束、緩緩上升的光點微粒、偶爾飛過的鴿子。這個做法現有
   `src/scene.js` 已經示範過一次（`drawBackground` 的光束、`createBubbles`/`drawBubbles`），
   照抄那個模式改色調跟形狀即可，**不需要额外的影片或多層透明素材，也不需要即時呼叫 AI**。

這樣做的好處：GPT Image 只需要出**一張圖**、不需要去背/透明圖層這種對生成式模型來說不穩定的
要求，落地風險最低，效果又跟水族箱那套一致（有做過、有驗證過）。

### 怎麼拿到這張圖（兩條路，先做 A，B 是加分項）

**A. 手動生成（預設做法，馬上能做，不需要任何 API 金鑰）**

1. 打開 ChatGPT（內建 GPT Image 生圖）或 OpenAI 的圖片生成介面。
2. 貼上面的 prompt（可依實際生成結果微調用詞）：

   ```
   A warm, gentle children's storybook illustration of a peaceful biblical-era landscape
   at golden hour. Rolling green hills, olive trees, a few sheep grazing, a winding river,
   a small distant hillside town with flat-roofed stone houses, soft warm sunlight rays
   coming through gentle clouds, a calm blue sky. Soft watercolor / gouache painting style,
   warm and inviting, no people, no text, no watermark, wide 16:9 landscape composition,
   suitable for a children's church event background.
   ```

3. 挑一張滿意的，下載存成 `assets/backgrounds/bible-world.jpg`（或 `.png`），放進 repo。
4. 如果想要「雲層可以自己飄」的加強版，可以額外生成一張「只有雲跟天空、其他都不畫」的圖，
   但這是加分項，MVP 不需要，先用程式畫的雲（見下方）就好。

**B. 程式自動呼叫 GPT Image API（加分項，之後有 API 金鑰再做）**

寫一支一次性腳本 `scripts/generate-background.js`（Node，用官方 `openai` npm 套件），
從環境變數讀 `OPENAI_API_KEY`（**絕對不要把金鑰寫進程式碼或 commit 進 repo**，用本機
`.env`，並把 `.env` 加進 `.gitignore`），呼叫一次 Images API 生成上面那個 prompt，
把結果存到 `assets/backgrounds/bible-world.jpg`。範例：

```js
// scripts/generate-background.js
import fs from 'node:fs';
import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const prompt = `A warm, gentle children's storybook illustration of a peaceful
biblical-era landscape at golden hour. Rolling green hills, olive trees, a few
sheep grazing, a winding river, a small distant hillside town with flat-roofed
stone houses, soft warm sunlight rays coming through gentle clouds, a calm blue
sky. Soft watercolor / gouache painting style, warm and inviting, no people, no
text, no watermark, wide 16:9 landscape composition, suitable for a children's
church event background.`;

const result = await client.images.generate({
  model: 'gpt-image-1', // 依 OpenAI 當下文件的最新生圖模型代號調整
  prompt,
  size: '1536x1024', // 16:9 系寬幅，實際可用尺寸以 API 文件為準
});

const base64 = result.data[0].b64_json;
fs.writeFileSync('assets/backgrounds/bible-world.jpg', Buffer.from(base64, 'base64'));
console.log('已產生 assets/backgrounds/bible-world.jpg');
```

這支腳本只是「產生素材」用的工具，不需要在活動當天執行，也**絕對不要在瀏覽器端呼叫**
（瀏覽器端呼叫會把金鑰曝露在前端程式碼裡，公開 repo 絕對不能這樣做——`control.html`／
`display.html` 全程都不應該出現任何 API 金鑰或直接呼叫 OpenAI API 的程式碼）。

### `src/scene.js` 要怎麼改

把 `drawBackground` 從畫漸層改成貼圖＋cover 縮放，並在讀圖失敗（例如檔案還沒放進去）時
退回原本的漸層當保底，不要讓畫面整個壞掉：

```js
let bgImage = null;
let bgFailed = false;
const bgImg = new Image();
bgImg.onload = () => { bgImage = bgImg; };
bgImg.onerror = () => { bgFailed = true; };
bgImg.src = 'assets/backgrounds/bible-world.jpg';

function drawBackground(ctx, w, h, t) {
  if (bgImage) {
    // cover 縮放：短邊對齊，長邊裁切置中，圖片才不會被拉伸變形
    const scale = Math.max(w / bgImage.width, h / bgImage.height);
    const dw = bgImage.width * scale, dh = bgImage.height * scale;
    ctx.drawImage(bgImage, (w - dw) / 2, (h - dh) / 2, dw, dh);
  } else {
    // 圖還沒載入完成，或載入失敗：保底漸層，畫面不會開天窗
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#fbe8c6');
    grad.addColorStop(1, '#f3c98a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }
  // 光束、雲、粒子等動態層照舊疊在這張圖上面（下面繼續）
}
```

原本 `drawRocksAndCoral` / `drawSeaweed` 這兩個「程式畫地景細節」的函式**直接刪掉、
`display.html` 也拿掉呼叫**——山丘/橄欖樹/城鎮這些細節已經畫在 GPT Image 生成的圖裡了，
程式端不需要再畫一次前景地景。保留：

- `drawBackground`（改成貼圖，如上）
- 光束效果（`drawBackground` 裡原本那段 `globalAlpha` 光束迴圈，顏色從藍白改成暖金色，
  更符合「陽光灑落」的聖經場景感）
- `createBubbles`/`updateBubbles`/`drawBubbles`：整組邏輯不用改，只是語意跟顏色從「氣泡」
  換成「漂浮的光點微粒」——`fillStyle` 從白色系改成暖黃/金色半透明（例如
  `rgba(255,230,160,0.5)`），變數名稱可留著不強制改，畢竟就是同一種「緩緩上升的小圓點粒子」
  視覺效果。
- 新增一個「偶爾飛過的鴿子」效果（可選，加分項）：用一個獨立的 `Creature`（沿用
  `creature.js`，`style: 'arc'`，速度調快、不循環出現太頻繁）畫一隻簡單的鴿子剪影飛過畫面，
  呼應和平/聖靈的意象，不需要跟掃描出來的人物混在同一個陣列，用一個獨立的計時器偶爾
  spawn 一隻、飛出畫面後銷毀即可。

## 人物模板：`src/species.js` 資料怎麼改

跟原本魚/海龜/水母一樣的資料格式（`ellipse`/`polygon`/`path`，`type: 'region'|'line'`），
`viewBox` 一樣固定 `'0 0 400 300'`，`svgRaster.js`／`extract.js`／校正流程完全不用動，
换的只是陣列內容。下面給兩個完整範例（挪亞、天使），建立好「長袍人形」跟「翅膀+光環」
兩種可重複利用的畫法，其餘 5 位人物照同樣手法延伸（給了簡短規格，實際座標微調交給
實作時肉眼調整，反正就是幾個橢圓/多邊形/曲線组合，跟原本 6 種海洋生物的做法一模一樣）：

```js
{
  id: 'noah',
  name: '挪亞',
  emoji: '🛶', // Unicode 沒有「聖經人物」的 emoji，用故事相關物件的 emoji 代替即可
  viewBox: '0 0 400 300',
  shapes: [
    { tag: 'ellipse', attrs: { cx: 200, cy: 70, rx: 30, ry: 32 }, type: 'region' },   // 頭
    { tag: 'ellipse', attrs: { cx: 200, cy: 98, rx: 22, ry: 16 }, type: 'region' },   // 鬍子
    { tag: 'polygon', attrs: { points: '150,110 250,110 280,265 120,265' }, type: 'region' }, // 長袍
    { tag: 'path', attrs: { d: 'M 278,120 L 278,272' }, type: 'line', lineWidth: 8 }, // 手杖
  ],
  swim: { style: 'glide', speed: [14, 22], amplitude: [5, 8], freq: [0.5, 0.8], sizeScale: 1.0, noFlip: true },
},
{
  id: 'angel',
  name: '天使',
  emoji: '🕊️',
  viewBox: '0 0 400 300',
  shapes: [
    { tag: 'path', attrs: { d: 'M 174,55 A 26,10 0 1 1 226,55 A 26,10 0 1 1 174,55 Z' }, type: 'line', lineWidth: 6 }, // 光環
    { tag: 'ellipse', attrs: { cx: 200, cy: 82, rx: 26, ry: 28 }, type: 'region' },   // 頭
    { tag: 'polygon', attrs: { points: '160,115 240,115 262,252 138,252' }, type: 'region' }, // 長袍
    { tag: 'polygon', attrs: { points: '160,120 88,88 128,182' }, type: 'region' },   // 左翅膀
    { tag: 'polygon', attrs: { points: '240,120 312,88 272,182' }, type: 'region' },  // 右翅膀
  ],
  swim: { style: 'pulse', speed: [8, 14], amplitude: [18, 26], freq: [0.4, 0.6], sizeScale: 1.0, noFlip: true },
},
```

其餘 5 位，照上面「長袍人形」的骨架（頭橢圓＋長袍多邊形＋一個代表物件），換道具跟比例即可：

| 人物 | emoji | 代表道具（畫成一個 line 或小 polygon） | 建議 `swim.style` |
|---|---|---|---|
| 摩西 Moses | 🔥（燃燒的荊棘）| 石版（小長方形 polygon）或手杖 | `glide`（緩慢、穩重） |
| 大衛 David | 👑 | 甩石索（一段弧線 `path`，`type:'line'`） | `fish` 重新調快一點，代表年輕有活力 |
| 但以理 Daniel | 🦁 | 站姿，旁邊可加一隻簡化的獅子輪廓（額外一組 shapes，選配） | `glide` |
| 約拿 Jonah | 🐳 | 站姿，可選配一隻大魚剪影在旁邊 | `drift` |
| 牧羊人 Shepherd | 🐑 | 牧羊杖（彎鉤形 `path`，`type:'line'`） | `glide` |

## 動作行為：`creature.js` 只需要一個小改動

現有 5 種 `motionOffset` 樣式（`fish`／`glide`／`pulse`／`arc`／`drift`／`crawl`）本來就是
「水平前進＋不同的垂直擺動／縮放呼吸」的參數化系統，剛好可以套用在人物「走動／飄浮」上，
**不需要新增動作邏輯**，只要對應到上面表格裡建議的 `style` 即可（`pulse` 拿來做天使的
光暈式輕輕漂浮飄動，`glide` 拿來做人物穩重地走動，效果自然合理）。

唯一需要新增的：人物是「有正面方向的人形」，鏡像翻轉（現有 `Creature.draw()` 面朝左/右時
會左右鏡射整張貼圖）套用在人臉上會很奇怪（例如挪亞的臉會被鏡像翻過去）。加一個
`noFlip` 旗標，在 `Creature.draw()` 裡判斷：

```js
// creature.js 的 draw() 內，原本：
// ctx.scale((facingRight ? 1 : -1) * off.scaleX, off.scaleY);
// 改成：
const flip = this.species.swim.noFlip ? 1 : (facingRight ? 1 : -1);
ctx.scale(flip * off.scaleX, off.scaleY);
```

`noFlip: true` 的人物永遠面朝同一個方向（畫的時候就把人物設計成「側身走路」或「正面站立」都
可以，正面站立最保險，不會有鏡像不鏡像的問題）。海洋生物那 6 種不用加這個旗標，維持原樣。

## 文案更新（純字串，直接找取代即可）

| 檔案 | 舊文案 | 新文案（範例，可微調） |
|---|---|---|
| `index.html` | 🐠 塗鴉水族館 / 小朋友的畫，游進虛擬水族箱 | 📖 塗鴉聖經樂園 / 小朋友畫的聖經人物，走進聖經樂園 |
| `index.html` | 🖥️ 開啟水族箱畫面 | 🖥️ 開啟聖經樂園畫面 |
| `control.html` | 🎨 塗鴉水族館・掃描控制台 | 🎨 塗鴉聖經樂園・掃描控制台 |
| `control.html` | ① 選生物種類 | ① 選聖經人物 |
| `control.html` scanStatus 文案 | 掃到了！... | 掃到了！...（文意不用改，主詞從「生物」換「人物」即可）|
| `display.html` toast | `${emoji} 新的${name}游進來了！` | `${emoji} ${name}來到聖經樂園了！` |
| `display.html` hint | 按 F11 進入全螢幕投影到電視 | 不變 |
| `templates/print.html` | 校正墊 / 生物塗色紙 / 把小朋友的塗色紙放在這個框框裡 | 校正墊字樣不變；「生物塗色紙」→「聖經人物塗色紙」；引導框文字可留白不強改 |
| `SETUP.md` / `README.md` | 提到「海洋生物」「水族箱」的敘述 | 換成「聖經人物」「聖經樂園」，並把美術素材那段換成上面的 GPT Image 生成流程 |

`display.html` 開場的 `DEMO_COLORS`（示範生物預設配色）也要換成 7 個新 id
（`noah`／`moses`／`david`／`daniel`／`jonah`／`shepherd`／`angel`），配色建議走柔和溫暖色系
（膚色/米色/暖棕/淺金），不要用海洋生物那種高飽和螢光色，跟聖經樂園的暖色調背景比較搭。

## 測試要跟著改的地方

現有 22 個 Node 測試裡，**只有一個檔案寫死了海洋生物的 id**，其餘都是資料無關的純邏輯測試：

- `test/svgRaster.test.js` 裡 `getSpecies('clownfish')` 要改成新資料裡實際存在的 id，
  例如 `getSpecies('noah')`。
- `test/homography.test.js`、`test/markerDetect.test.js`、`test/extract.test.js`、
  `test/creature.test.js`、`test/scene.test.js` 都是測純數學/純邏輯，**不用改**，改完
  `species.js` 之後直接 `npm test` 應該全過，只有上面那一個 id 要修。

改完之後照原本的流程再跑一次瀏覽器煙霧測試（開 `display.html` 確認新人物有游/走出來、
背景圖有正確載入且鋪滿畫面、`control.html` 的即時對位預覽疊的外框是新人物的線稿、
`templates/print.html` 印出來的是新人物線稿），截圖確認畫面觀感。

## 給 Codex 的執行順序 checklist

1. `git clone` repo，跑 `npm test`（應全過）、`npm run serve` 看一下現況。
2. 準備背景圖：先用上面 A 方案手動生成 `assets/backgrounds/bible-world.jpg` 放進 repo
   （沒有圖也可以先跳過，用保底漸層開發，圖之後補都不影響其他工作）。
3. 改 `src/species.js`：換成本文件列的 7 位聖經人物資料。
4. 改 `src/creature.js`：`draw()` 加 `noFlip` 判斷（見上方 diff）。
5. 改 `src/scene.js`：`drawBackground` 改貼圖+cover 縮放+保底漸層；刪掉
   `drawRocksAndCoral`/`drawSeaweed` 的呼叫；氣泡改暖色調光點微粒；光束改暖色調。
6. 改 `display.html`：拿掉 `AquariumScene.drawRocksAndCoral`/`drawSeaweed` 的呼叫、
   `DEMO_COLORS` 換 7 個新 id 配色、toast 文案、標題文案。
7. 改 `control.html` / `index.html` / `templates/print.html`：上面文案表列的字串取代。
8. 修 `test/svgRaster.test.js` 裡的 id，跑 `npm test` 全過。
9. 瀏覽器煙霧測試 + 截圖確認觀感，尤其確認背景圖 cover 縮放沒有變形、人物線稿與遮罩對得上。
10. 更新 `README.md`／`SETUP.md` 的主題敘述與美術素材取得步驟。
11.（加分項）寫 `scripts/generate-background.js`，用 `OPENAI_API_KEY` 環境變數自動生成背景圖，
    金鑰不進 repo。

## 有疑慮就先照這樣做，之後可以再調的地方

- 人物名單（7 位）、場景是不是要綁定某個特定故事（例如只做「挪亞方舟」），這些都是需求方
  還沒最終拍板、由本文件先做出合理預設的地方。實作時如果需求方後來給了明確指定的故事/人物，
  改的地方就只有 `src/species.js` 的資料跟 `assets/backgrounds/` 的圖，架構完全不用重做。
- 動態效果目前只設計「靜態圖 + 程式疊加動畫層」；如果之後想要更豐富的視覺（例如真的多層
  視差雲、或找設計師另外畫透明雲層素材），一樣是在 `src/scene.js` 裡加圖層，不影響其他模組。
