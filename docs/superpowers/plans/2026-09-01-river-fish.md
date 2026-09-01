# 河流游魚 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在背景河道加入四隻由 Image 2 生成素材驅動、低調循環游動的寫實插畫小魚。

**Architecture:** `src/scene.js` 會把既有河面波光的比例公式收斂成一個河道曲線 helper，魚群只保存沿曲線的進度與表現參數，座標每幀由 `coverPoint` 推導。 `display.html` 建立、更新並在背景完成後、其他動態前繪製魚，故不加入角色或羊的避讓與深度排序。

**Tech Stack:** 瀏覽器 Canvas 2D、原生 ES5 IIFE 模組、Node.js `node:test`、GPT Image 2 透明 PNG、Chrome/Playwright 驗收。

---

## File structure

- Create: `assets/fish/river-fish-swimming.png` — Image 2 產生的透明背景小魚主素材。
- Modify: `src/scene.js` — 載入並下採樣魚素材；河道曲線、四隻魚的 state、更新與繪製 API。
- Modify: `display.html` — 建立與更新魚群，在河面背景層繪製，並加入唯讀驗收掛勾。
- Modify: `test/scene.test.js` — 魚群行為、曲線、縮放與無素材繪製退路的單元測試。

### Task 1: 產生並驗收魚素材

**Files:**
- Create: `assets/fish/river-fish-swimming.png`

- [ ] **Step 1: 用 Image 2 產生一張透明背景主素材**

使用內建 `image_gen`，輸入下列提示；不要以 SVG、程式繪圖或網路圖片替代：

```text
One single small freshwater fish, full body in clean side profile, facing right. Soft realistic storybook illustration with hand-painted watercolor/gouache texture, warm sunset gold and silver-gray scales, subtle translucent fins, gentle natural anatomy. Isolated subject only on a true transparent background; no water, river, reflections, shadows, bubbles, plants, text, frame, border, white background, checkerboard, collage, or second fish. Match a warm biblical garden children’s projection background: quiet, delicate, low-saturation, not a photo, not cartoon, not vector art. Leave generous transparent padding around the complete fish.
```

- [ ] **Step 2: 存為指定 PNG 並人工檢查透明邊緣**

將 Image 2 結果存為 `assets/fish/river-fish-swimming.png`，用本機檢視工具確認：完整一隻側面魚、沒有底盒或白邊、非照片質感、沒有第二隻魚。

Run: `file assets/fish/river-fish-swimming.png`

Expected: 輸出含 `PNG image data`，且檔案大小大於 0。

- [ ] **Step 3: 提交獨立素材 commit**

```bash
git add assets/fish/river-fish-swimming.png
git commit -m "assets: add subtle river fish sprite"
```

### Task 2: 以測試先定義河道與游魚 API

**Files:**
- Modify: `test/scene.test.js:1-23, 50-60, 510-520`
- Modify: `src/scene.js:1-490`

- [ ] **Step 1: 匯入待實作 API 並寫失敗測試**

在既有解構匯入加入 `riverPoint`、`createRiverFish`、`updateRiverFish`、`drawRiverFish`。在檔案末尾加入下列測試；先不改 `src/scene.js`。

```js
test('河道曲線與四隻游魚固定使用背景比例座標', () => {
  const fish = createRiverFish();
  assert.equal(fish.length, 4);
  assert.ok(new Set(fish.map((item) => item.progress)).size === 4);
  assert.ok(new Set(fish.map((item) => item.speed)).size === 4);
  assert.ok(new Set(fish.map((item) => item.phase)).size === 4);

  for (let progress = 0; progress <= 1; progress += 0.05) {
    const point = riverPoint(progress);
    assert.ok(point.nx >= 0.54 && point.nx <= 0.71, `nx=${point.nx}`);
    assert.ok(point.ny >= 0.505 && point.ny <= 0.75, `ny=${point.ny}`);
  }
});

test('游魚長時間更新會循環且一直留在河道範圍', () => {
  const fish = createRiverFish();
  for (let frame = 0; frame < 5000; frame++) updateRiverFish(fish, 0.05);
  for (const item of fish) {
    assert.ok(Number.isFinite(item.progress) && item.progress >= 0 && item.progress < 1);
    assert.ok(Number.isFinite(item.phase));
    const point = riverPoint(item.progress);
    assert.ok(point.nx >= 0.54 && point.nx <= 0.71);
    assert.ok(point.ny >= 0.505 && point.ny <= 0.75);
  }
});

test('游魚繪製在素材缺失或受限 ctx 時安全略過', () => {
  const { ctx } = makeFakeCtx();
  const fish = createRiverFish();
  assert.doesNotThrow(() => drawRiverFish(ctx, fish, 1280, 720, 3));
  assert.doesNotThrow(() => drawRiverFish(ctx, fish, 1280, 720, 3, { riverFish: { id: 'fish' } }));
  assert.doesNotThrow(() => drawRiverFish({}, fish, 1280, 720, 3, { riverFish: { id: 'fish' } }));
});
```

- [ ] **Step 2: 執行單測，確認 API 尚未存在而失敗**

Run: `node --test test/scene.test.js`

Expected: FAIL，訊息指出 `createRiverFish is not a function`（或相同的未匯出 API 錯誤）；既有測試仍不可被刪除或改弱。

- [ ] **Step 3: 實作最小河道、魚 state 與更新程式**

在 `src/scene.js`、`drawRiverFlow` 前加入共用曲線；並把 `drawRiverFlow` 內的 `nx`／`ny` 公式換成 `riverPoint(p)`：

```js
function riverPoint(progress) {
  const p = ((Number.isFinite(progress) ? progress : 0) % 1 + 1) % 1;
  return {
    nx: 0.555 + p * 0.135 + Math.sin(p * Math.PI * 2) * 0.012,
    ny: 0.505 + p * 0.245,
  };
}

const RIVER_FISH_LAYOUT = [
  [0.08, 0.011, 1, 0.00],
  [0.31, 0.008, -1, 1.37],
  [0.58, 0.010, 1, 2.71],
  [0.84, 0.007, -1, 4.08],
];

function createRiverFish() {
  return RIVER_FISH_LAYOUT.map(([progress, speed, direction, phase], index) => ({
    progress, speed, direction, phase,
    width: 18 + index * 2.6,
    height: 9 + index * 1.1,
    opacity: 0.22 + index * 0.035,
  }));
}

function updateRiverFish(fish, dt) {
  if (!Array.isArray(fish) || !Number.isFinite(dt)) return;
  for (const item of fish) {
    if (!item || !Number.isFinite(item.progress) || !Number.isFinite(item.speed)
      || !Number.isFinite(item.direction) || !Number.isFinite(item.phase)) continue;
    item.progress = ((item.progress + item.direction * item.speed * dt) % 1 + 1) % 1;
    item.phase += dt * (1.5 + item.speed * 28);
  }
}
```

- [ ] **Step 4: 載入並下採樣 Image 2 魚素材**

擴充 `animalImages` 與 `loadAnimalImages`，沿用已驗證的 `loadRuntimeAnimalImage`，不保留大型來源影像：

```js
const animalImages = {
  sheepWalking: null,
  sheepGrazing: null,
  birdUp: null,
  birdDown: null,
  riverFish: null,
};

function loadAnimalImages() {
  if (typeof Image === 'undefined') return;
  loadRuntimeAnimalImage('sheepWalking', 'assets/sheep/sheep-walking.png', 320);
  loadRuntimeAnimalImage('sheepGrazing', 'assets/sheep/sheep-grazing.png', 320);
  loadRuntimeAnimalImage('birdUp', 'assets/birds/bird-wings-up.png', 192);
  loadRuntimeAnimalImage('birdDown', 'assets/birds/bird-wings-down.png', 192);
  loadRuntimeAnimalImage('riverFish', 'assets/fish/river-fish-swimming.png', 144);
}
```

- [ ] **Step 5: 實作安全的低調水下繪製**

在 `drawBirdFlock` 後加入下列函式。繪製時只接受已載入的 `images.riverFish`；每隻魚先用 `riverPoint` 再 `coverPoint` 取座標，使用 `save`／`restore` 保護透明度與鏡像。水紋只以低 alpha 橢圓表現，沒有魚素材時不畫任何替代形狀。

```js
function drawRiverFish(ctx, fish, w, h, t, images = animalImages) {
  if (!ctx || !Array.isArray(fish) || !images || !images.riverFish
    || typeof ctx.save !== 'function' || typeof ctx.restore !== 'function'
    || typeof ctx.translate !== 'function' || typeof ctx.scale !== 'function'
    || typeof ctx.drawImage !== 'function' || !Number.isFinite(w) || !Number.isFinite(h)
    || w <= 0 || h <= 0) return;
  for (const item of fish) {
    if (!item || !Number.isFinite(item.progress) || !Number.isFinite(item.width)
      || !Number.isFinite(item.height) || !Number.isFinite(item.opacity)) continue;
    const point = riverPoint(item.progress);
    const [x, y] = coverPoint(w, h, point.nx, point.ny);
    const scale = h / 720;
    const width = item.width * scale;
    const height = item.height * scale;
    let saved = false;
    try {
      ctx.save();
      saved = true;
      ctx.globalAlpha = item.opacity;
      ctx.translate(x, y + Math.sin((Number.isFinite(t) ? t : 0) * 1.8 + item.phase) * scale * 1.8);
      if (item.direction < 0) ctx.scale(-1, 1);
      ctx.drawImage(images.riverFish, -width / 2, -height / 2, width, height);
      if (typeof ctx.beginPath === 'function' && typeof ctx.ellipse === 'function'
        && typeof ctx.stroke === 'function') {
        ctx.globalAlpha = item.opacity * 0.20;
        ctx.strokeStyle = '#fff0c0';
        ctx.lineWidth = Math.max(0.5, scale * 0.7);
        ctx.beginPath();
        ctx.ellipse(-width * 0.72, height * 0.42, width * 0.32, Math.max(0.8, height * 0.14), 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    } catch (_) {
      // 單幀素材或 Canvas 失敗時略過，背景動畫不能中斷。
    } finally {
      if (saved) {
        try { ctx.restore(); } catch (_) { /* no state left to restore safely */ }
      }
    }
  }
}
```

- [ ] **Step 6: 匯出 API 並執行完整測試**

在既有 `api` 物件加入：

```js
riverPoint, createRiverFish, updateRiverFish, drawRiverFish,
```

Run: `npm test`

Expected: PASS，新增魚測試與既有所有測試均通過。

- [ ] **Step 7: 提交程式與測試 commit**

```bash
git add src/scene.js test/scene.test.js
git commit -m "feat: add subtle river fish animation"
```

### Task 3: 接入投影畫面並以 Chrome 驗收

**Files:**
- Modify: `display.html:32-42, 96-104, 260-304`
- Create: `artifacts/river-fish-1280x720.png`

- [ ] **Step 1: 建立魚群並加入唯讀驗收掛勾**

在 `birdFlock` 建立後加入：

```js
const riverFish = AquariumScene.createRiverFish();
```

在 `window.__bibleDebug` 補上不可變更魚 state 的讀取器：

```js
riverFishPositions: () => riverFish.map((fish) => ({
  progress: fish.progress,
  direction: fish.direction,
  phase: fish.phase,
})),
```

- [ ] **Step 2: 在 frame 內更新並放入水面圖層**

在既有鳥群更新後加入：

```js
AquariumScene.updateRiverFish(riverFish, dt);
```

在 `drawBackground` 後、`drawCanopySway` 前加入：

```js
AquariumScene.drawRiverFish(ctx, riverFish, canvas.width, canvas.height, elapsed);
```

這個順序使魚位於背景河面波光之後，並被後續樹冠、光點、飛鳥、羊與角色覆蓋；不要把魚加入 `grounded` 或 `walkers`。

- [ ] **Step 3: 執行完整自動測試**

Run: `npm test`

Expected: PASS，無失敗、無跳過既有測試。

- [ ] **Step 4: 使用 Chrome 在實際畫布驗收與截圖**

開啟 `http://localhost:8933/display.html`，設定 viewport 為 1280×720，執行：

```js
window.__bibleDebug.flockCounts()
window.__bibleDebug.riverFishPositions()
```

Expected: `flockCounts()` 回傳 `{ sheep: 6, birds: 6 }`，`riverFishPositions()` 回傳四筆有限數值；等待約 2 秒後再讀一次，至少一筆 `progress` 改變。確認 Network 中 `assets/fish/river-fish-swimming.png` 為 200，沒有素材 404（favicon 例外），保存 `artifacts/river-fish-1280x720.png`。人工檢查四隻魚在河面、無白邊／底盒，且不遮住羊、飛鳥或角色。

- [ ] **Step 5: 提交畫面接入與驗收證據**

```bash
git add display.html artifacts/river-fish-1280x720.png
git commit -m "feat: show river fish behind foreground life"
```

## Final verification

- [ ] `git diff --check` 無輸出。
- [ ] `npm test` 完整通過。
- [ ] 以 fresh-context reviewer 檢查 `src/scene.js`、`display.html`、`test/scene.test.js` 與畫面證據，確認沒有改動角色、飛行、掃描或控制台邏輯。
- [ ] 回報時附上測試輸出、魚素材 HTTP 200、四筆 debug state 與 [1280×720 截圖](/Users/brady/Downloads/aquarium-game/.worktrees/opus5-cloud-handoff/artifacts/river-fish-1280x720.png)。

