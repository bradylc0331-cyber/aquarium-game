# 交接：背景畫面與羊群

> ## 先確認你在對的地方
>
> | | |
> |---|---|
> | **儲存庫** | `bradylc0331-cyber/aquarium-game` |
> | **分支** | `2-5d-character-motion` |
> | **專案** | 聖經樂園——兒童塗色紙掃描互動投影 |
>
> ```
> git remote -v                # 要看到 aquarium-game
> git branch --show-current    # 要看到 2-5d-character-motion
> ls display.html control.html src/movement.js   # 三個都要在
> npm test                     # 要看到 150 條全綠（不是 154，羊與紙偶關節刪掉之後降的）
> ```
>
> **這個資料夾裡沒有這個檔案就是走錯 repo，停下來問 Brady。** 別去猜「最接近的
> HANDOFF」——這個 repo 裡有四份交接文件，其他三份講的是別的事。

**寫於：** 2026-09-01。
**交給誰：** Brady（可能會轉給 Codex）。
**接回來給誰：** 做完之後交回原本那個 session 繼續處理角色演出。

---

## 1. 這份文件的範圍

**你要做的：** 背景畫面這一層，以及用 image2 生成的羊群怎麼接回畫面。

**不要碰的：** 角色的移動、掃描管線、控制台。那些是另一條線，正在處理中，
同時改會撞在一起。詳細清單在第 6 節。

## 2. 現在畫面是怎麼組起來的

每一幀的繪製順序寫在 `display.html` 的 `frame()`（約 287 行起），依序是：

```
drawBackground   ← 背景插畫 + 雲 + 光束 + 河面波光
drawCanopySway   ← 樹冠的陽光閃動
drawBubbles      ← 空氣中的光點微粒
角色（依 baseY 由小到大排序後逐一畫）
drawForeground   ← 前景草葉，疊在角色前方
```

**羊原本就插在「角色」那一層裡**，跟角色一起參與 baseY 排序，所以近的羊會蓋住
遠的角色。這個位置要保留——羊如果整批畫在角色之前或之後，景深就破了。

背景那一層全部在 `src/scene.js`：

| 函式 | 做什麼 |
|---|---|
| `drawBackground(ctx, w, h, t)` | 畫 `assets/backgrounds/bible-world.png`，cover 縮放置中裁切；載入失敗退回暖色漸層 |
| `drawRiverFlow` | 河面短波光，位置用**背景原圖比例**指定 |
| `drawForeground` | 前景草葉，跟著同一組陣風相位擺動 |
| `drawCanopySway` | 樹冠陽光閃動。位置是照背景美術量出來的，**換背景圖要重量** |
| `gustStrength(t)` | 全場共用的陣風強度 0.22～1.0，平滑不跳變 |
| `coverPoint(w, h, nx, ny)` | 把背景原圖的比例座標換成螢幕座標 |

`coverPoint` 是要釘住插畫上某個位置時用的工具。背景是 cover 裁切的，不同視窗比例
下裁掉的地方不一樣，直接寫死螢幕比例會跑掉；`coverPoint(w, h, 0.5, 0.62)` 拿到的
才是「原圖正中央偏下那個點」在當前畫面的位置。

## 3. 座標與 2.5D 的四個約定

這四條是角色與羊共用的，新的羊群要照著走，否則會跟角色格格不入。

**① 錨點是腳底，不是中心。** 物件的 `baseY` 是它站在地上的那條線。畫的時候自己
往上長，不要用中心點定位——中心點定位在縮放時腳會離地。

**② 可行走區。** `Movement.getWalkableArea(w, h)`（`src/movement.js:92`）回傳：

```
left:   w * 0.04      right:  w * 0.96
top:    h * 0.60      bottom: h * 0.93
```

`top` 取 0.60 是量出來的：插畫裡 0.45 那條線已經是遠處的山丘與城鎮，站上去會變成
「站在山上的巨人」。**這些比例綁定現在這張背景圖，換圖就要重量。**

**③ 越靠下越大。** 角色用 `depthScaleForY(baseY, top, bottom)`（`src/creature.js`），
在可行走區的頂端是 **0.78**、底端是 **1.05**，線性內插、夾在區間內不外插。
角色本身的目標高度是畫面高的 **20%～26%**。羊要自己算一份對應的景深縮放，
數值不必跟角色一樣，但**必須跟著 baseY 連續變化**，不能寫死尺寸——寫死的話在不同
解析度下會忽大忽小，也會跟背景裡畫好的那群羊對不上。

**④ 前後靠 baseY 排序。** `display.html:349` 把所有地面物件 `sort((a,b) => a.baseY - b.baseY)`
之後依序畫，所以 baseY 大的（靠近畫面下方＝離觀眾近）後畫、蓋在前面。

## 4. 羊被移除前的接點長什麼樣

舊的羊是**程式畫的向量圖**，已經在 commit `3e7ea6e` 整批刪掉。要看舊碼：

```bash
git show 25a041d:src/scene.js        # 刪除前的完整版本，羊在 173–316 行
git show 3e7ea6e -- src/scene.js display.html   # 看它原本怎麼接進畫面
```

舊的三個函式與它們的契約：

| 函式 | 簽章 | 契約 |
|---|---|---|
| `createSheep` | `(w, h, random) → sheep` | 回傳 `{x, baseY, direction, speed, mode, modeTime, width, height}` |
| `updateSheep` | `(sheep, dt, w, h, blockers, random)` | 推進一格；碰到 blocker 或走到邊緣就 `direction *= -1` |
| `drawSheep` | `(ctx, sheep, t, canvasHeight)` | 以 `sheep.x / sheep.baseY` 為腳底錨點畫出來 |

幾個實際量出來的數字，新版可以直接沿用：

- 生成位置：`x = w * (0.08 ~ 0.88)`、`baseY = h * (0.74 ~ 0.88)`
- 走動速度：`8 ~ 16`（px/秒，未乘景深）
- 尺寸基準：`width 56、height 44`，再乘 `h / 900`
- 巡走時 `mode` 在 `walking` / `grazing` 之間切換，吃草 2～5 秒、走動 5～11 秒

**一個當時就存在的不一致，新版建議修掉：** `updateSheep` 把 `baseY` 夾在
`h * 0.45 ~ h * 0.91`，但生成只用 `0.74 ~ 0.88`。0.45 那條線照第 3 節的說明已經是
遠處山丘，羊走上去一樣會變成「站在山上的巨羊」。**新版的夾限建議跟角色一致，
用 `getWalkableArea` 的 `top` / `bottom`**，不要沿用 0.45。

## 5. 接圖片版羊群需要做到什麼

用 image2 生成的羊是圖片，跟舊的向量畫法不同，但**接點契約不變**：畫面那一層只
需要一個有 `baseY` 的物件，加上一個「怎麼把它畫出來」的函式。

要做的事：

1. 圖檔放 `assets/` 底下（建議 `assets/sheep/`，跟 `backgrounds` / `characters` 同層）。
2. 在 `src/scene.js` 用跟 `bgImage` 一樣的方式非同步載入——**必須有載入失敗的退路**：
   現在背景載不到會退回漸層，畫面不開天窗，羊也要比照，載不到就不畫，不能讓整個
   `frame()` 拋例外（一拋就整場黑掉，活動當天沒有人能修）。
3. 導出 `createFlock` / `updateFlock` / `drawFlock`（名字自己定），在 `display.html`
   接回**角色那一層的排序裡**，不是背景層。
4. 羊**不要**被當成角色的避讓對象。現在 `Movement.steerCharacter(character, walkers, ...)`
   只吃角色；把羊塞進去會讓角色的繞路運算變重，而且羊會把角色逼到角落。羊自己
   避開角色就好（舊版就是這樣做的）。

## 6. 不要碰的東西

- **`src/movement.js`、`src/flight.js`** —— 角色移動與飛行。完全不要動。
- **`src/creature.js`** —— 角色演出。正在另一條線上處理（腰帶分岔的問題），會衝突。
- **掃描管線**：`markerDetect.js`、`homography.js`、`qrCode.js`、`extract.js`、
  `control.html`。跟畫面無關。
- **不要把 `getWalkableArea` 的比例改掉來遷就羊。** 那四個數字是照背景插畫量出來的，
  改了角色會站錯地方。羊要配合它，不是反過來。
- **分支只用 `2-5d-character-motion`**，不要開 PR，除非 Brady 明講。

## 7. 怎麼跑與怎麼驗

```bash
npm run serve      # http://localhost:8933，靜態檔案，不用編譯
npm test           # 現在是 150 條
```

用 **Chrome** 開 <http://localhost:8933/display.html>。
**不要按兩下直接開檔案**——`file://` 下 `getImageData` 會因為 canvas 跨來源汙染而丟
`SecurityError`，症狀是「背景出得來、人物一個都沒有」，很容易誤判成素材壞掉。

沒有掃描作品時畫面上會有示範角色，可以直接看景深對不對。投影分頁的除錯掛勾：

```js
__bibleDebug.characterCount()   // 場上幾位
__bibleDebug.positions()        // 每位的 x / baseY
```

**這個專案的測試品質是被嚴格審查過的。** 新增的羊如果有可測的邏輯（巡走、夾限、
景深縮放），要補測試，而且不要寫「把實作的算式抄過去當預期值」那種空測試——
斷言要是性質（例如「永遠不走出可行走區」「baseY 越大畫得越大」），不是公式複製。
已經被抓到過三次。

## 8. 交回來的時候附什麼

1. 改了哪些檔案、`npm test` 的最終條數。
2. 羊的 baseY 範圍與景深縮放範圍實際用了什麼數值。
3. 背景圖如果換了：`getWalkableArea` 的四個比例、`drawCanopySway` 的樹冠位置、
   `drawRiverFlow` 的河道位置**都要重量**，把新數值寫下來。
4. 一張 1280×720 的截圖，看得到羊跟角色的前後關係。
