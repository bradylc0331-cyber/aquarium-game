# Background Flock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add six animated Image 2 sheep across the grass and six animated Image 2 birds across the sky without changing character movement, flight, scanning, or controls.

**Architecture:** Keep animal state, asset loading, updates, and drawing in the existing `AquariumScene` UMD module. Birds remain a background layer; sheep become independent ground renderables merged with creatures only for `baseY` sorting, while sheep alone avoid character blockers. Generate four transparent raster assets with Image 2 and fail closed when an asset cannot load.

**Tech Stack:** Browser Canvas 2D, vanilla JavaScript UMD modules, Node.js built-in test runner, Image 2 transparent PNG generation, Chrome visual verification.

---

## File map

- Create `assets/sheep/sheep-walking.png`: warm, realistic illustrated sheep in a neutral walking pose.
- Create `assets/sheep/sheep-grazing.png`: the same sheep with its head down grazing.
- Create `assets/birds/bird-wings-up.png`: warm, realistic illustrated small bird with wings raised.
- Create `assets/birds/bird-wings-down.png`: the same bird with wings lowered or extended.
- Modify `src/scene.js`: load animal assets, create/update fixed flocks, calculate sheep depth, and draw raster animals.
- Modify `display.html`: instantiate/update the flocks, draw birds behind characters, and merge sheep into ground depth sorting.
- Modify `test/scene.test.js`: property tests for counts, bounds, depth, transitions, wrapping, phase variation, and fail-safe drawing.
- Modify `test/speciesAssets.test.js`: assert that all four raster files exist and are PNGs with non-zero size.

### Task 1: Generate and inspect Image 2 animal assets

**Files:**
- Create: `assets/sheep/sheep-walking.png`
- Create: `assets/sheep/sheep-grazing.png`
- Create: `assets/birds/bird-wings-up.png`
- Create: `assets/birds/bird-wings-down.png`

- [ ] **Step 1: Generate the walking sheep reference with Image 2**

Use the image generation tool with this exact prompt and save the result as `assets/sheep/sheep-walking.png`:

```text
Create one full-body adult white sheep as a high-quality realistic storybook illustration for a biblical pastoral landscape. Clean side profile facing right, all four hooves fully visible, calm natural walking stance, cream-white textured wool, warm brown-gray face and legs, anatomically believable proportions. Warm golden late-afternoon light comes from the upper left, with soft painted shading matching a detailed cinematic children's-book background. Isolate the sheep on a truly transparent background with clean antialiased edges. No grass, no ground, no shadow plane, no border, no text, no extra animal, no checkerboard pattern, no white backdrop. Keep generous transparent padding around the complete silhouette.
```

- [ ] **Step 2: Generate the grazing sheep from the approved reference**

Edit/reference `assets/sheep/sheep-walking.png` with this prompt and save the result as `assets/sheep/sheep-grazing.png`:

```text
Preserve the exact same sheep identity, wool color, warm upper-left golden lighting, realistic storybook rendering, side profile, scale, and transparent canvas. Change only the pose: the sheep stands naturally with its neck and head lowered to graze, while all four legs and the entire body remain fully visible. Truly transparent background; no grass, ground, shadow plane, border, text, extra animal, checkerboard, or white backdrop. Keep generous transparent padding around the complete silhouette.
```

- [ ] **Step 3: Generate the wings-up bird reference with Image 2**

Use this exact prompt and save the result as `assets/birds/bird-wings-up.png`:

```text
Create one small full-body swallow-like pastoral bird as a high-quality realistic storybook illustration for a biblical landscape. Side profile flying toward the right, wings raised in the upward wingbeat, tail and both wings fully visible, anatomically believable, warm brown and muted blue-gray feathers. Warm golden late-afternoon light comes from the upper left, with soft painted shading matching a detailed cinematic children's-book background. Isolate the bird on a truly transparent background with clean antialiased edges. No sky, cloud, branch, ground, shadow plane, border, text, extra bird, checkerboard pattern, or white backdrop. Keep generous transparent padding around the complete silhouette.
```

- [ ] **Step 4: Generate the wings-down bird from the approved reference**

Edit/reference `assets/birds/bird-wings-up.png` with this prompt and save the result as `assets/birds/bird-wings-down.png`:

```text
Preserve the exact same bird identity, feather colors, body angle, warm upper-left golden lighting, realistic storybook rendering, side profile, scale, and transparent canvas. Change only the wingbeat: both wings are lowered or nearly level in a natural downstroke, with the entire wings, tail, and body fully visible. Truly transparent background; no sky, cloud, branch, ground, shadow plane, border, text, extra bird, checkerboard, or white backdrop. Keep generous transparent padding around the complete silhouette.
```

- [ ] **Step 5: Inspect all assets before using them**

Open all four PNGs at original resolution and reject/regenerate any image that has an opaque background, clipped hoof/wing/tail, mismatched identity between poses, inconsistent light direction, embedded text, extra animals, or visible checkerboard pixels.

- [ ] **Step 6: Commit the approved raster assets**

```bash
git add assets/sheep/sheep-walking.png assets/sheep/sheep-grazing.png assets/birds/bird-wings-up.png assets/birds/bird-wings-down.png
git commit -m "assets: add Image 2 sheep and bird poses"
```

### Task 2: Define flock state with property-first tests

**Files:**
- Modify: `test/scene.test.js`
- Modify: `src/scene.js`

- [ ] **Step 1: Add failing tests for fixed counts, valid ground placement, and continuous sheep depth**

Replace the existing `src/scene.js` destructuring import and add these tests to `test/scene.test.js`:

```js
const {
  createBubbles, updateBubbles, drawBubbles, drawBackground, drawForeground,
  createSheepFlock, sheepScaleForY,
} = require('../src/scene.js');

test('羊群固定六隻、橫向展開，而且每一隻都站在可行走草地內', () => {
  const area = { left: 40, right: 960, top: 600, bottom: 930 };
  const flock = createSheepFlock(1000, 1000, () => 0.5);
  assert.equal(flock.length, 6);
  assert.ok(flock.every((sheep) => sheep.x >= area.left && sheep.x <= area.right));
  assert.ok(flock.every((sheep) => sheep.baseY >= area.top && sheep.baseY <= area.bottom));
  const sortedX = flock.map((sheep) => sheep.x).sort((a, b) => a - b);
  assert.ok(sortedX[5] - sortedX[0] > 700, '六隻羊必須橫跨大部分草地');
});

test('羊越靠近畫面下方越大，而且景深縮放沒有跳階', () => {
  const samples = [600, 650, 700, 750, 800, 850, 900].map((y) => sheepScaleForY(y, 600, 930));
  for (let i = 1; i < samples.length; i++) {
    assert.ok(samples[i] > samples[i - 1]);
    assert.ok(samples[i] - samples[i - 1] < 0.1, '相鄰深度不能突然放大');
  }
});
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `node --test test/scene.test.js`

Expected: FAIL because `createSheepFlock` and `sheepScaleForY` are not exported.

- [ ] **Step 3: Implement fixed sheep creation and depth scaling in `src/scene.js`**

Add these constants and functions before the module export:

```js
const SHEEP_X_RATIOS = [0.10, 0.27, 0.42, 0.59, 0.75, 0.90];
const SHEEP_Y_RATIOS = [0.84, 0.78, 0.86, 0.76, 0.83, 0.79];

function sheepScaleForY(baseY, top, bottom) {
  const span = Math.max(1, bottom - top);
  const depth = Math.max(0, Math.min(1, (baseY - top) / span));
  return 0.72 + depth * 0.33;
}

function createSheepFlock(w, h, random = Math.random) {
  return SHEEP_X_RATIOS.map((nx, i) => ({
    kind: 'sheep',
    x: w * nx,
    baseY: h * SHEEP_Y_RATIOS[i],
    direction: i % 2 === 0 ? 1 : -1,
    speed: 8 + random() * 8,
    mode: i % 3 === 0 ? 'grazing' : 'walking',
    modeTime: i % 3 === 0 ? 2 + random() * 3 : 5 + random() * 6,
    width: 78,
    height: 58,
    phase: i * 1.17,
  }));
}
```

Export both functions through `api`.

- [ ] **Step 4: Run the focused tests and verify they pass**

Run: `node --test test/scene.test.js`

Expected: all scene tests PASS, including the new creation and depth tests.

- [ ] **Step 5: Commit the state foundation**

```bash
git add src/scene.js test/scene.test.js
git commit -m "test: define fixed flock placement and sheep depth"
```

### Task 3: Implement sheep movement and bird flight state

**Files:**
- Modify: `test/scene.test.js`
- Modify: `src/scene.js`

- [ ] **Step 1: Add failing tests for sheep state changes and safe reversal**

Extend the `src/scene.js` destructuring import with `updateSheepFlock`, `createBirdFlock`, and `updateBirdFlock`, then add:

```js
test('羊會在吃草與走動間切換，走動時碰到邊界或角色就轉向', () => {
  const area = { left: 40, right: 960, top: 600, bottom: 930 };
  const sheep = createSheepFlock(1000, 1000, () => 0.5)[0];
  sheep.mode = 'grazing';
  sheep.modeTime = 0.01;
  updateSheepFlock([sheep], 0.02, area, [], () => 0.5);
  assert.equal(sheep.mode, 'walking');

  sheep.x = area.right - 1;
  sheep.direction = 1;
  sheep.mode = 'walking';
  sheep.modeTime = 10;
  updateSheepFlock([sheep], 1, area, [], () => 0.5);
  assert.equal(sheep.direction, -1);
  assert.ok(sheep.x <= area.right);

  sheep.x = 500;
  sheep.direction = 1;
  updateSheepFlock([sheep], 0.1, area, [{ x: 505, baseY: sheep.baseY, width: 100 }], () => 0.5);
  assert.equal(sheep.direction, -1);
});
```

- [ ] **Step 2: Add failing tests for the fixed bird flock, varied phases, and wraparound**

```js
test('飛鳥固定六隻、分布在天空，而且振翅相位不同', () => {
  const birds = createBirdFlock(1000, 800);
  assert.equal(birds.length, 6);
  assert.ok(birds.every((bird) => bird.y > 40 && bird.y < 320));
  assert.ok(new Set(birds.map((bird) => bird.phase)).size > 3);
});

test('飛鳥離開一側後從另一側回到天空，不會永遠消失', () => {
  const bird = createBirdFlock(1000, 800)[0];
  bird.direction = 1;
  bird.x = 1100;
  updateBirdFlock([bird], 0.1, 1000, 800);
  assert.ok(bird.x < 0);
  assert.ok(bird.y > 0 && bird.y < 320);
});
```

- [ ] **Step 3: Run the focused tests and verify they fail**

Run: `node --test test/scene.test.js`

Expected: FAIL because flock update functions are not implemented.

- [ ] **Step 4: Implement sheep updates and blocker reversal**

```js
function sheepHitsBlocker(sheep, nextX, blocker) {
  if (!blocker || !Number.isFinite(blocker.x) || !Number.isFinite(blocker.baseY)) return false;
  const horizontal = Math.max(34, ((blocker.width || 80) + sheep.width) * 0.35);
  const vertical = Math.max(18, sheep.height * 0.42);
  return Math.abs(nextX - blocker.x) < horizontal
    && Math.abs(sheep.baseY - blocker.baseY) < vertical;
}

function updateSheepFlock(flock, dt, area, blockers, random = Math.random) {
  for (const sheep of flock) {
    sheep.baseY = Math.max(area.top, Math.min(area.bottom, sheep.baseY));
    sheep.modeTime -= dt;
    if (sheep.modeTime <= 0) {
      sheep.mode = sheep.mode === 'walking' ? 'grazing' : 'walking';
      sheep.modeTime = sheep.mode === 'grazing' ? 2 + random() * 3 : 5 + random() * 6;
    }
    if (sheep.mode !== 'walking') continue;
    const nextX = sheep.x + sheep.direction * sheep.speed * dt;
    const hitsEdge = nextX < area.left || nextX > area.right;
    const hitsCharacter = blockers.some((blocker) => sheepHitsBlocker(sheep, nextX, blocker));
    if (hitsEdge || hitsCharacter) {
      sheep.direction *= -1;
      sheep.x = Math.max(area.left, Math.min(area.right, sheep.x));
    } else {
      sheep.x = nextX;
    }
  }
}
```

- [ ] **Step 5: Implement fixed bird creation, wing phase, and wraparound**

```js
const BIRD_LAYOUT = [
  [-0.08, 0.18, 1], [0.14, 0.24, 1], [0.34, 0.16, 1],
  [0.66, 0.22, -1], [0.84, 0.14, -1], [1.08, 0.25, -1],
];

function createBirdFlock(w, h) {
  return BIRD_LAYOUT.map(([nx, ny, direction], i) => ({
    x: w * nx,
    y: h * ny,
    homeY: h * ny,
    direction,
    speed: 18 + i * 2.4,
    width: 42 - (i % 3) * 4,
    height: 27 - (i % 3) * 2,
    phase: i * 1.31,
    flapSpeed: 4.6 + (i % 3) * 0.55,
  }));
}

function updateBirdFlock(flock, dt, w, h) {
  const margin = Math.max(50, w * 0.06);
  for (const bird of flock) {
    bird.phase += bird.flapSpeed * dt;
    bird.x += bird.direction * bird.speed * dt;
    bird.y = Math.max(h * 0.06, Math.min(h * 0.32, bird.homeY + Math.sin(bird.phase * 0.45) * h * 0.008));
    if (bird.direction > 0 && bird.x > w + margin) bird.x = -margin;
    if (bird.direction < 0 && bird.x < -margin) bird.x = w + margin;
  }
}
```

Export `updateSheepFlock`, `createBirdFlock`, and `updateBirdFlock`.

- [ ] **Step 6: Run the focused tests and verify they pass**

Run: `node --test test/scene.test.js`

Expected: all scene state tests PASS.

- [ ] **Step 7: Commit animal state updates**

```bash
git add src/scene.js test/scene.test.js
git commit -m "feat: animate sheep grazing and birds flying"
```

### Task 4: Load and draw raster animals with failure-safe behavior

**Files:**
- Modify: `src/scene.js`
- Modify: `test/scene.test.js`
- Modify: `test/speciesAssets.test.js`

- [ ] **Step 1: Add asset existence tests**

Append to `test/speciesAssets.test.js`:

```js
test('Image 2 羊與飛鳥的四張透明 PNG 素材都存在且不是空檔', () => {
  const files = [
    'assets/sheep/sheep-walking.png',
    'assets/sheep/sheep-grazing.png',
    'assets/birds/bird-wings-up.png',
    'assets/birds/bird-wings-down.png',
  ];
  for (const relative of files) {
    const filename = path.join(__dirname, '..', relative);
    assert.ok(fs.existsSync(filename), `missing ${relative}`);
    assert.ok(fs.statSync(filename).size > 1024, `${relative} is unexpectedly small`);
    assert.equal(fs.readFileSync(filename).subarray(1, 4).toString('ascii'), 'PNG');
  }
});
```

- [ ] **Step 2: Add a fail-safe draw test**

Extend the `src/scene.js` destructuring import with `drawSheep` and `drawBirdFlock`. In `makeFakeCtx`, replace the method-name regular expression with the following so raster drawing is recorded as a no-op:

```js
/^(save|restore|beginPath|closePath|moveTo|lineTo|quadraticCurveTo|bezierCurveTo|arc|ellipse|fill|stroke|fillRect|drawImage|scale|translate|rotate)$/
```

Then add:

```js
test('動物素材尚未載入或全部失敗時繪製函式不能讓整個 frame 中斷', () => {
  const { ctx } = makeFakeCtx();
  const sheep = createSheepFlock(1280, 720, () => 0.5)[0];
  const birds = createBirdFlock(1280, 720);
  assert.doesNotThrow(() => drawSheep(ctx, sheep, 1.2, 720));
  assert.doesNotThrow(() => drawBirdFlock(ctx, birds, 1.2, 720));
});
```

- [ ] **Step 3: Run the focused tests and verify drawing fails before implementation**

Run: `node --test test/scene.test.js test/speciesAssets.test.js`

Expected: FAIL because `drawSheep` and `drawBirdFlock` are missing.

- [ ] **Step 4: Add non-throwing asset loading in `src/scene.js`**

```js
const animalImages = { sheepWalking: null, sheepGrazing: null, birdUp: null, birdDown: null };

function loadAnimalImage(key, src) {
  if (typeof Image === 'undefined') return;
  const image = new Image();
  image.onload = () => { animalImages[key] = image; };
  image.onerror = () => { animalImages[key] = null; };
  image.src = src;
}

loadAnimalImage('sheepWalking', 'assets/sheep/sheep-walking.png');
loadAnimalImage('sheepGrazing', 'assets/sheep/sheep-grazing.png');
loadAnimalImage('birdUp', 'assets/birds/bird-wings-up.png');
loadAnimalImage('birdDown', 'assets/birds/bird-wings-down.png');
```

- [ ] **Step 5: Add foot-anchored sheep drawing and phased bird drawing**

```js
function drawSheep(ctx, sheep, t, canvasHeight) {
  const image = sheep.mode === 'grazing'
    ? (animalImages.sheepGrazing || animalImages.sheepWalking)
    : (animalImages.sheepWalking || animalImages.sheepGrazing);
  if (!image) return;
  const scale = (canvasHeight / 900) * sheepScaleForY(sheep.baseY, canvasHeight * 0.60, canvasHeight * 0.93);
  const width = sheep.width * scale;
  const height = sheep.height * scale;
  const sway = sheep.mode === 'walking' ? Math.sin(t * 5 + sheep.phase) * 0.025 : 0;
  ctx.save();
  ctx.translate(sheep.x, sheep.baseY);
  ctx.rotate(sway);
  ctx.scale(sheep.direction, 1);
  ctx.drawImage(image, -width / 2, -height, width, height);
  ctx.restore();
}

function drawBirdFlock(ctx, flock, t, canvasHeight) {
  for (const bird of flock) {
    const wingUp = Math.sin(bird.phase) >= 0;
    const image = wingUp
      ? (animalImages.birdUp || animalImages.birdDown)
      : (animalImages.birdDown || animalImages.birdUp);
    if (!image) continue;
    const scale = canvasHeight / 900;
    const width = bird.width * scale;
    const height = bird.height * scale;
    ctx.save();
    ctx.translate(bird.x, bird.y);
    ctx.scale(bird.direction, 1);
    ctx.drawImage(image, -width / 2, -height / 2, width, height);
    ctx.restore();
  }
}
```

Export `drawSheep` and `drawBirdFlock`.

- [ ] **Step 6: Run the focused tests and verify they pass**

Run: `node --test test/scene.test.js test/speciesAssets.test.js`

Expected: all focused tests PASS.

- [ ] **Step 7: Commit raster loading and drawing**

```bash
git add src/scene.js test/scene.test.js test/speciesAssets.test.js
git commit -m "feat: draw failure-safe Image 2 animal sprites"
```

### Task 5: Wire birds and sheep into the display layers

**Files:**
- Modify: `display.html`

- [ ] **Step 1: Instantiate both fixed flocks next to the existing bubbles**

```js
const bubbles = AquariumScene.createBubbles(canvas.width, canvas.height, 40);
const sheepFlock = AquariumScene.createSheepFlock(canvas.width, canvas.height);
const birdFlock = AquariumScene.createBirdFlock(canvas.width, canvas.height);
```

- [ ] **Step 2: Expose read-only debug evidence**

Add these methods to `window.__bibleDebug`:

```js
flockCounts: () => ({ sheep: sheepFlock.length, birds: birdFlock.length }),
sheepPositions: () => sheepFlock.map((sheep) => ({ x: sheep.x, baseY: sheep.baseY, mode: sheep.mode })),
birdPositions: () => birdFlock.map((bird) => ({ x: bird.x, y: bird.y, phase: bird.phase })),
```

- [ ] **Step 3: Update animal state after character movement**

```js
AquariumScene.updateSheepFlock(sheepFlock, dt, walkable, walkers);
AquariumScene.updateBirdFlock(birdFlock, dt, canvas.width, canvas.height);
AquariumScene.updateBubbles(bubbles, dt, canvas.width, canvas.height);
```

- [ ] **Step 4: Draw birds behind every character**

Place this after bubbles and before ground sorting:

```js
AquariumScene.drawBirdFlock(ctx, birdFlock, elapsed, canvas.height);
```

- [ ] **Step 5: Merge sheep and characters only at the depth-sorting boundary**

Replace the current grounded loop with:

```js
const grounded = [
  ...creatures.map((item) => ({ kind: 'creature', baseY: item.baseY, item })),
  ...sheepFlock.map((item) => ({ kind: 'sheep', baseY: item.baseY, item })),
].sort((a, b) => a.baseY - b.baseY);

for (const entry of grounded) {
  if (entry.kind === 'sheep') {
    AquariumScene.drawSheep(ctx, entry.item, elapsed, canvas.height);
    continue;
  }
  entry.item.update(dt, elapsed);
  entry.item.draw(ctx, elapsed);
}
```

Do not pass `sheepFlock` to `Movement.steerCharacter`; only `updateSheepFlock` receives `walkers`.

- [ ] **Step 6: Run the full automated suite**

Run: `npm test`

Expected: 161 tests, all PASS, zero failures.

- [ ] **Step 7: Commit display integration**

```bash
git add display.html
git commit -m "feat: layer birds behind characters and depth-sort sheep"
```

### Task 6: Browser verification and final evidence

**Files:**
- Create: `artifacts/background-flock-1280x720.png`

- [ ] **Step 1: Start the static server**

Run: `npm run serve`

Expected: the server listens on `http://localhost:8933`.

- [ ] **Step 2: Open the display in Chrome at exactly 1280×720**

Open `http://localhost:8933/display.html`, set the viewport to 1280×720, and wait until all four animal assets have loaded.

- [ ] **Step 3: Verify counts and movement numerically**

In the page console run:

```js
__bibleDebug.flockCounts()
```

Expected:

```js
{ sheep: 6, birds: 6 }
```

Capture `__bibleDebug.sheepPositions()` and `__bibleDebug.birdPositions()`, wait three seconds, capture them again, and verify at least one sheep or grazing mode changed and every bird advanced horizontally while remaining above the grass.

- [ ] **Step 4: Inspect layer order and asset quality**

Confirm visually that sheep in front of a character cover the character's lower body, sheep behind a character are covered by it, all birds stay behind flying characters, transparent edges contain no box or checkerboard, and all twelve animals remain legible without blocking the main character area.

- [ ] **Step 5: Save the required screenshot**

Save a 1280×720 screenshot to `artifacts/background-flock-1280x720.png` with six sheep, six birds, and at least one demo character visible.

- [ ] **Step 6: Run final automated verification**

Run: `npm test`

Expected: 161 tests, all PASS, zero failures.

- [ ] **Step 7: Commit the screenshot evidence**

```bash
git add artifacts/background-flock-1280x720.png
git commit -m "test: capture background flock visual evidence"
```
