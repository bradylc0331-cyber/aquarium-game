# Bible Wonderland 2.5D Character and Environment Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display up to 15 independently scanned, fully colored Bible characters as grounded 2.5D paper puppets that roam the walkable scene without touching, replace the oldest character when a 16th arrives, and coexist with calm river, foliage, and sheep animation.

**Architecture:** Keep image extraction in the control page, add a validated artwork message boundary, and move population/FIFO and movement/collision logic into small testable modules. `display.html` remains the browser composition root; `Creature` owns one paper puppet's visual state, while `CharacterManager`, `Movement`, and `AquariumScene` own population, navigation, and environment state respectively.

**Tech Stack:** Vanilla JavaScript UMD modules, Canvas 2D, BroadcastChannel/localStorage fallback, Node.js built-in test runner, local Python HTTP server, Chrome with USB UVC Webcam.

---

## Execution precondition

The extracted source at `/Users/brady/Downloads/aquarium-game` has no `.git` directory. Before the first commit step, restore these files into the original Git repository or explicitly initialize a repository after user approval. Do not silently initialize Git. Until then, run every test step but record commit steps as pending.

## File responsibility map

- Create `src/artworkMessage.js`: create artwork IDs and validate/construct `creature-scanned` messages.
- Create `src/characterManager.js`: enforce the 15-character FIFO, duplicate rejection, and exit/entry queue.
- Create `src/movement.js`: walkable bounds, obstacle tests, spawn search, goal selection, and soft collision avoidance.
- Modify `src/creature.js`: grounded 2.5D puppet rendering, size from visible texture, gestures, transitions, labels, and movement integration.
- Modify `src/species.js`: per-character arm/leg rig and gesture metadata.
- Modify `src/scene.js`: normalized walkable region, river/tree obstacles, gusting foliage, and sheep state machine.
- Modify `control.html`: attach one stable artwork ID to each captured work and reject unusable extractions before sending.
- Modify `display.html`: compose the new modules, maintain at most 15 renderable characters, depth-sort, and render names only.
- Create `test/artworkMessage.test.js`, `test/characterManager.test.js`, and `test/movement.test.js`.
- Modify `test/creature.test.js`, `test/scene.test.js`, and `test/extract.test.js`.
- Modify `SETUP.md`: document 15-character replacement and the physical A4/Webcam acceptance run.

### Task 1: Stable artwork identity and message validation

**Files:**
- Create: `src/artworkMessage.js`
- Create: `test/artworkMessage.test.js`
- Modify: `control.html:391-437`
- Modify: `display.html:29-35`

- [ ] **Step 1: Write the failing message-contract tests**

Create `test/artworkMessage.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  createArtworkId,
  createScannedArtworkMessage,
  isScannedArtworkMessage,
} = require('../src/artworkMessage.js');

test('每次作品建立不同 ID，同一作品重送時保留原 ID', () => {
  const first = createArtworkId(() => 1000, () => 0.123456);
  const second = createArtworkId(() => 1001, () => 0.123456);
  assert.notEqual(first, second);
  const msg = createScannedArtworkMessage({
    artworkId: first,
    speciesId: 'david',
    textureDataURL: 'data:image/png;base64,AAAA',
    now: () => 2000,
  });
  assert.equal(msg.artworkId, first);
  assert.equal(msg.ts, 2000);
});

test('訊息必須含作品 ID、已知格式 speciesId 與 PNG data URL', () => {
  const valid = createScannedArtworkMessage({
    artworkId: 'art-1000-abc',
    speciesId: 'noah',
    textureDataURL: 'data:image/png;base64,AAAA',
    now: () => 1000,
  });
  assert.equal(isScannedArtworkMessage(valid), true);
  assert.equal(isScannedArtworkMessage({ ...valid, artworkId: '' }), false);
  assert.equal(isScannedArtworkMessage({ ...valid, textureDataURL: 'paper.jpg' }), false);
});
```

- [ ] **Step 2: Run the focused test and verify the missing module failure**

Run: `node --test test/artworkMessage.test.js`

Expected: FAIL with `Cannot find module '../src/artworkMessage.js'`.

- [ ] **Step 3: Implement the message module**

Create `src/artworkMessage.js`:

```js
(function (root) {
  function createArtworkId(now = Date.now, random = Math.random) {
    const time = Number(now()).toString(36);
    const entropy = Math.floor(random() * 0x100000000).toString(36).padStart(7, '0');
    return `art-${time}-${entropy}`;
  }

  function createScannedArtworkMessage({ artworkId, speciesId, textureDataURL, now = Date.now }) {
    return {
      type: 'creature-scanned',
      artworkId,
      speciesId,
      textureDataURL,
      ts: Number(now()),
    };
  }

  function isScannedArtworkMessage(value) {
    return Boolean(
      value &&
      value.type === 'creature-scanned' &&
      typeof value.artworkId === 'string' && value.artworkId.length >= 6 &&
      /^[a-z][a-z0-9-]*$/i.test(value.speciesId || '') &&
      typeof value.textureDataURL === 'string' &&
      value.textureDataURL.startsWith('data:image/png;base64,') &&
      Number.isFinite(value.ts)
    );
  }

  const api = { createArtworkId, createScannedArtworkMessage, isScannedArtworkMessage };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ArtworkMessage = api;
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Give each capture one ID and reuse it through delayed submission**

In `control.html`, make `scanWarpedFrame()` create `artworkId` once and return it with the data URL:

```js
const artworkId = ArtworkMessage.createArtworkId();
lastScanResult = {
  artworkId,
  dataURL: resultCanvas.toDataURL('image/png'),
  speciesId: species.id,
};
```

Change `sendToScene()` and both manual/automatic callers to pass the complete scan result:

```js
function sendToScene(species, scanResult, source) {
  channel.send(ArtworkMessage.createScannedArtworkMessage({
    artworkId: scanResult.artworkId,
    speciesId: species.id,
    textureDataURL: scanResult.dataURL,
  }));
  addLog(`${new Date().toLocaleTimeString('zh-TW')} — ${source === 'auto' ? '自動登場' : '手動送出'} ${species.emoji} ${species.name}`);
}

function queueAutomaticSubmission(species, scanResult) {
  const delayMs = AutoCapture.randomDelayMs(30, 60);
  const delaySeconds = Math.round(delayMs / 1000);
  pendingAutoCount++;
  addLog(`${new Date().toLocaleTimeString('zh-TW')} — 等待 ${delaySeconds} 秒 ${species.emoji} ${species.name}`);
  setTimeout(() => {
    pendingAutoCount--;
    sendToScene(species, scanResult, 'auto');
  }, delayMs);
}

// captureAutomatically()
queueAutomaticSubmission(species, result);

// sendBtn.onclick
sendToScene(species, lastScanResult, 'manual');
```

Add `<script src="src/artworkMessage.js"></script>` before `channel.js` in both `control.html` and `display.html`.

- [ ] **Step 5: Run the message test and full baseline suite**

Run: `node --test test/artworkMessage.test.js && npm test`

Expected: message tests PASS and the full suite reports 34 passing tests with zero failures.

- [ ] **Step 6: Commit after the project is restored to Git**

```bash
git add src/artworkMessage.js test/artworkMessage.test.js control.html display.html
git commit -m "feat: add stable scanned artwork identity"
```

### Task 2: Fifteen-character FIFO manager with queued transitions

**Files:**
- Create: `src/characterManager.js`
- Create: `test/characterManager.test.js`

- [ ] **Step 1: Write failing FIFO, duplicate, and transition tests**

Create `test/characterManager.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { CharacterManager } = require('../src/characterManager.js');

function payload(n, speciesId = 'david') {
  return { artworkId: `art-${n}`, speciesId, textureDataURL: 'data:image/png;base64,AAAA', ts: n };
}

function createCharacter(work) {
  return {
    artworkId: work.artworkId,
    state: 'entering',
    opacity: 0,
    setTransition(state) { this.state = state; },
  };
}

test('最多 15 位，第 16 位等待第 1 位淡出後才進場', () => {
  const manager = new CharacterManager({ maxCharacters: 15, exitSeconds: 0.4, createCharacter });
  for (let i = 1; i <= 15; i++) manager.enqueue(payload(i));
  assert.equal(manager.renderable.length, 15);

  manager.enqueue(payload(16));
  assert.equal(manager.renderable.length, 15);
  assert.equal(manager.renderable[0].state, 'exiting');
  assert.equal(manager.pendingCount, 1);

  manager.update(0.4);
  assert.equal(manager.renderable.length, 15);
  assert.equal(manager.renderable[0].artworkId, 'art-2');
  assert.equal(manager.renderable[14].artworkId, 'art-16');
});

test('第 17 位接著替換第 2 位', () => {
  const manager = new CharacterManager({ maxCharacters: 15, exitSeconds: 0.4, createCharacter });
  for (let i = 1; i <= 17; i++) manager.enqueue(payload(i));
  manager.update(0.4);
  manager.update(0.4);
  assert.deepEqual(manager.renderable.map((c) => c.artworkId),
    Array.from({ length: 15 }, (_, i) => `art-${i + 3}`));
});

test('相同人物可重複，不同作品 ID 都保留；相同作品 ID 被去重', () => {
  const manager = new CharacterManager({ maxCharacters: 15, exitSeconds: 0.4, createCharacter });
  assert.equal(manager.enqueue(payload(1, 'moses')), 'accepted');
  assert.equal(manager.enqueue(payload(2, 'moses')), 'accepted');
  assert.equal(manager.enqueue(payload(1, 'moses')), 'duplicate');
  assert.equal(manager.renderable.length, 2);
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `node --test test/characterManager.test.js`

Expected: FAIL with `Cannot find module '../src/characterManager.js'`.

- [ ] **Step 3: Implement the bounded FIFO state machine**

Create `src/characterManager.js` with this public API and behavior:

```js
(function (root) {
  class CharacterManager {
    constructor({ maxCharacters = 15, exitSeconds = 0.4, createCharacter }) {
      this.maxCharacters = maxCharacters;
      this.exitSeconds = exitSeconds;
      this.createCharacter = createCharacter;
      this.renderable = [];
      this.pending = [];
      this.seenIds = new Set();
      this.exitElapsed = 0;
    }

    get pendingCount() { return this.pending.length; }

    enqueue(work) {
      if (!work || !work.artworkId || this.seenIds.has(work.artworkId)) return 'duplicate';
      this.seenIds.add(work.artworkId);
      this.pending.push(work);
      this.drainPending();
      this.startOldestExit();
      return 'accepted';
    }

    drainPending() {
      while (this.pending.length && this.renderable.length < this.maxCharacters) {
        const character = this.createCharacter(this.pending[0]);
        if (!character) return;
        this.pending.shift();
        this.renderable.push(character);
      }
    }

    startOldestExit() {
      if (!this.pending.length || this.renderable.length < this.maxCharacters) return;
      if (this.renderable[0].state === 'exiting') return;
      this.renderable[0].setTransition('exiting');
      this.exitElapsed = 0;
    }

    update(dt) {
      if (this.renderable[0] && this.renderable[0].state === 'exiting') {
        this.exitElapsed += dt;
        if (this.exitElapsed >= this.exitSeconds) {
          this.renderable.shift();
          this.exitElapsed = 0;
        }
      }
      this.drainPending();
      this.startOldestExit();
    }
  }

  const api = { CharacterManager };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CharacterManagerModule = api;
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run FIFO tests**

Run: `node --test test/characterManager.test.js`

Expected: 3 tests PASS; no renderable snapshot ever contains more than 15 entries.

- [ ] **Step 5: Commit after Git restoration**

```bash
git add src/characterManager.js test/characterManager.test.js
git commit -m "feat: enforce fifteen-character FIFO"
```

### Task 3: Walkable region, safe spawn, and soft collision avoidance

**Files:**
- Create: `src/movement.js`
- Create: `test/movement.test.js`

- [ ] **Step 1: Write failing geometry and movement tests**

Create `test/movement.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  getWalkableArea,
  personalSpace,
  spacesOverlap,
  findSafeSpawn,
  chooseSafeTarget,
  steerCharacter,
} = require('../src/movement.js');

test('可行走區留在草地並排除中央河道', () => {
  const area = getWalkableArea(1600, 900);
  assert.equal(area.bounds.top, 405);
  assert.equal(area.bounds.bottom, 819);
  assert.equal(area.obstacles.length, 2);
});

test('角色安全範圍使用可見尺寸外擴，接觸時判定重疊', () => {
  const a = personalSpace({ x: 300, baseY: 700, width: 180, height: 280 });
  const b = personalSpace({ x: 450, baseY: 700, width: 180, height: 280 });
  assert.equal(spacesOverlap(a, b), true);
  b.cx = 560;
  assert.equal(spacesOverlap(a, b), false);
});

test('安全出生點不與既有角色或河道相交', () => {
  const area = getWalkableArea(1600, 900);
  const existing = [{ x: 120, baseY: 700, width: 180, height: 280 }];
  const spawn = findSafeSpawn({ width: 180, height: 280 }, existing, area, () => 0.9);
  assert.ok(spawn);
  assert.equal(spacesOverlap(personalSpace({ ...spawn, width: 180, height: 280 }), personalSpace(existing[0])), false);
});

test('預測碰撞時先減速並產生遠離鄰居的方向', () => {
  const self = { x: 400, baseY: 700, width: 180, height: 280, vx: 40, vy: 0, targetX: 800, targetY: 700, cruiseSpeed: 40 };
  const neighbor = { x: 535, baseY: 700, width: 180, height: 280, vx: -20, vy: 0 };
  const next = steerCharacter(self, [self, neighbor], getWalkableArea(1600, 900), 0.1);
  assert.ok(next.vx < self.vx);
  assert.ok(next.x < self.x + self.vx * 0.1);
});

test('新目標位於可行走區且不落入河道', () => {
  const area = getWalkableArea(1600, 900);
  const self = { x: 300, baseY: 700, width: 180, height: 280 };
  const target = chooseSafeTarget(self, [self], area, () => 0.1);
  assert.ok(target);
  assert.ok(target.targetX >= area.bounds.left && target.targetX <= area.bounds.right);
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `node --test test/movement.test.js`

Expected: FAIL with `Cannot find module '../src/movement.js'`.

- [ ] **Step 3: Implement normalized geometry and separation steering**

Create `src/movement.js`. Use normalized scene geometry so resizing retains the same paths:

```js
(function (root) {
  function getWalkableArea(width, height) {
    return {
      bounds: { left: width * 0.04, right: width * 0.96, top: height * 0.45, bottom: height * 0.91 },
      obstacles: [
        { x: width * 0.53, y: height * 0.48, width: width * 0.13, height: height * 0.23 },
        { x: width * 0.62, y: height * 0.66, width: width * 0.16, height: height * 0.18 },
      ],
    };
  }

  function personalSpace(c) {
    const gap = Math.max(10, c.width * 0.07);
    return {
      cx: c.x,
      cy: c.baseY - c.height * 0.48,
      rx: c.width * 0.5 + gap,
      ry: c.height * 0.48 + gap,
    };
  }

  function spacesOverlap(a, b) {
    const dx = a.cx - b.cx;
    const dy = a.cy - b.cy;
    const rx = a.rx + b.rx;
    const ry = a.ry + b.ry;
    return (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1;
  }

  function hitsObstacle(space, obstacle) {
    const nearestX = Math.max(obstacle.x, Math.min(space.cx, obstacle.x + obstacle.width));
    const nearestY = Math.max(obstacle.y, Math.min(space.cy, obstacle.y + obstacle.height));
    const dx = (space.cx - nearestX) / space.rx;
    const dy = (space.cy - nearestY) / space.ry;
    return dx * dx + dy * dy <= 1;
  }

  function isSafe(candidate, existing, area) {
    const space = personalSpace(candidate);
    const { bounds } = area;
    if (candidate.x - space.rx < bounds.left || candidate.x + space.rx > bounds.right) return false;
    if (candidate.baseY < bounds.top || candidate.baseY > bounds.bottom) return false;
    if (area.obstacles.some((o) => hitsObstacle(space, o))) return false;
    return existing.every((other) => !spacesOverlap(space, personalSpace(other)));
  }

  function findSafeSpawn(size, existing, area, random = Math.random) {
    const sides = ['left', 'right', 'bottom'];
    for (let attempt = 0; attempt < 90; attempt++) {
      const side = sides[attempt % sides.length];
      const y = area.bounds.top + random() * (area.bounds.bottom - area.bounds.top);
      const x = side === 'left' ? area.bounds.left + size.width * 0.6
        : side === 'right' ? area.bounds.right - size.width * 0.6
          : area.bounds.left + random() * (area.bounds.right - area.bounds.left);
      const candidate = { x, baseY: side === 'bottom' ? area.bounds.bottom : y, ...size };
      if (isSafe(candidate, existing, area)) return { x: candidate.x, baseY: candidate.baseY };
    }
    return null;
  }

  function chooseSafeTarget(self, characters, area, random = Math.random) {
    const others = characters.filter((c) => c !== self);
    for (let attempt = 0; attempt < 60; attempt++) {
      const candidate = {
        ...self,
        x: area.bounds.left + random() * (area.bounds.right - area.bounds.left),
        baseY: area.bounds.top + random() * (area.bounds.bottom - area.bounds.top),
      };
      if (isSafe(candidate, others, area)) return { targetX: candidate.x, targetY: candidate.baseY };
    }
    return { targetX: self.x, targetY: self.baseY };
  }

  function steerCharacter(self, characters, area, dt) {
    let desiredX = self.targetX - self.x;
    let desiredY = self.targetY - self.baseY;
    const distance = Math.hypot(desiredX, desiredY) || 1;
    desiredX = desiredX / distance * self.cruiseSpeed;
    desiredY = desiredY / distance * self.cruiseSpeed * 0.45;
    for (const other of characters) {
      if (other === self) continue;
      if (spacesOverlap(personalSpace({ ...self, x: self.x + desiredX * 0.45, baseY: self.baseY + desiredY * 0.45 }), personalSpace(other))) {
        const away = self.x <= other.x ? -1 : 1;
        desiredX = desiredX * 0.2 + away * self.cruiseSpeed * 0.55;
        desiredY *= 0.2;
      }
    }
    const predicted = { ...self, x: self.x + desiredX * 0.45, baseY: self.baseY + desiredY * 0.45 };
    if (!isSafe(predicted, characters.filter((c) => c !== self), area)) {
      desiredX *= -0.35;
      desiredY *= -0.35;
    }
    const next = { ...self, vx: desiredX, vy: desiredY };
    next.x = Math.max(area.bounds.left, Math.min(area.bounds.right, self.x + desiredX * dt));
    next.baseY = Math.max(area.bounds.top, Math.min(area.bounds.bottom, self.baseY + desiredY * dt));
    return next;
  }

  const api = { getWalkableArea, personalSpace, spacesOverlap, hitsObstacle, isSafe, findSafeSpawn, chooseSafeTarget, steerCharacter };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Movement = api;
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run movement tests against the checked-in background geometry**

Run: `node --test test/movement.test.js`

Expected: 4 tests PASS. Keep the public function signatures unchanged.

- [ ] **Step 5: Commit after Git restoration**

```bash
git add src/movement.js test/movement.test.js
git commit -m "feat: add safe roaming and collision avoidance"
```

### Task 4: Grounded 2.5D paper puppet, gestures, and name-only label

**Files:**
- Modify: `src/creature.js:6-199`
- Modify: `src/species.js:26-177`
- Modify: `test/creature.test.js`

- [ ] **Step 1: Replace obsolete vertical-bob expectations with grounded puppet tests**

Replace the existing `require('../src/creature.js')` destructuring with the following single import, then replace the obsolete grounded-bobbing test and append the new cases:

```js
const {
  Creature,
  motionOffset,
  walkPose,
  groundedMotionOffset,
  transitionOpacity,
  displaySize,
  depthScaleForY,
  gesturePose,
  drawCharacterName,
} = require('../src/creature.js');

test('地面人物走路時腳底不產生垂直位移', () => {
  for (let t = 0; t < 5; t += 0.05) {
    const off = groundedMotionOffset(t, { freq: 6, phase: 0.4 });
    assert.equal(off.footYOffset, 0);
    assert.ok(Math.abs(off.rotation) <= 0.012);
  }
});

test('顯示尺寸根據裁切後可見圖片，人物高度至少是場景高度 24%', () => {
  assert.deepEqual(displaySize({ width: 210, height: 420 }, 1600, 900, 1), { width: 152, height: 304 });
  assert.deepEqual(displaySize({ width: 420, height: 210 }, 1600, 900, 1), { width: 608, height: 304 });
});

test('遠景與近景尺寸維持可辨識的 2.5D 範圍', () => {
  assert.equal(depthScaleForY(405, 405, 819), 0.78);
  assert.equal(depthScaleForY(819, 405, 819), 1.05);
});

test('進場與退場透明度不超出 0 到 1', () => {
  assert.equal(transitionOpacity('entering', 0), 0);
  assert.equal(transitionOpacity('entering', 0.4), 1);
  assert.equal(transitionOpacity('exiting', 0.4), 0);
});

test('招呼手勢只回傳肢體角度，不改腳底位置', () => {
  const pose = gesturePose('wave', 0.2);
  assert.ok(Math.abs(pose.rightArmAngle) > 0.1);
  assert.equal(pose.footYOffset, 0);
});

test('角色標籤只畫人物名稱', () => {
  const labels = [];
  const ctx = {
    save() {}, restore() {}, strokeText() {},
    fillText(text) { labels.push(text); },
  };
  drawCharacterName(ctx, '大衛', 100, 200, 24, 1);
  assert.deepEqual(labels, ['大衛']);
});
```

- [ ] **Step 2: Run focused tests and verify the new exports are missing**

Run: `node --test test/creature.test.js`

Expected: FAIL because the new grounded-puppet helpers are not exported.

- [ ] **Step 3: Add pure pose, size, and transition helpers**

In `src/creature.js`, add and export these helpers:

```js
function groundedMotionOffset(t, params) {
  const step = Math.sin(params.freq * t + (params.phase || 0));
  return { footYOffset: 0, rotation: 0.012 * step, turnScaleX: 0.94 + 0.06 * Math.abs(step) };
}

function displaySize(image, canvasWidth, canvasHeight, depthScale) {
  const targetHeight = Math.max(canvasHeight * 0.24, Math.min(canvasHeight * 0.34, canvasWidth * 0.19));
  const height = Math.round(targetHeight * depthScale * 2) / 2;
  return { width: Math.round(height * image.width / image.height), height };
}

function depthScaleForY(baseY, top, bottom) {
  const p = Math.max(0, Math.min(1, (baseY - top) / (bottom - top || 1)));
  return Math.round((0.78 + p * 0.27) * 100) / 100;
}

function transitionOpacity(state, elapsed, seconds = 0.4) {
  const p = Math.max(0, Math.min(1, elapsed / seconds));
  if (state === 'entering') return p;
  if (state === 'exiting') return 1 - p;
  return 1;
}

function gesturePose(kind, elapsed) {
  const wave = Math.sin(elapsed * Math.PI * 6);
  if (kind === 'raise-hands') return { leftArmAngle: -0.55, rightArmAngle: 0.55, footYOffset: 0 };
  if (kind === 'wave') return { leftArmAngle: 0, rightArmAngle: -0.45 + wave * 0.18, footYOffset: 0 };
  return { leftArmAngle: 0, rightArmAngle: 0, footYOffset: 0 };
}

function drawCharacterName(ctx, name, x, y, fontSize, opacity) {
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.font = `600 ${fontSize}px -apple-system, "PingFang TC", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(255,255,255,0.88)';
  ctx.fillStyle = '#5d3d21';
  ctx.strokeText(name, x, y);
  ctx.fillText(name, x, y);
  ctx.restore();
}
```

- [ ] **Step 4: Extend character rig metadata without changing printable shapes**

Add this exact normalized metadata near the top of `src/species.js`, then merge it into each species after `SPECIES` is declared. These regions match the checked-in 400×300 character art and do not change printable shapes or scanned pixels:

```js
const PUPPET_RIGS = {
  noah: {
    gesture: 'wave',
    leftArm: { x: 0.24, y: 0.36, width: 0.22, height: 0.36, pivotX: 0.78, pivotY: 0.12 },
    rightArm: { x: 0.55, y: 0.36, width: 0.22, height: 0.36, pivotX: 0.22, pivotY: 0.12 },
  },
  moses: {
    gesture: 'wave',
    leftArm: { x: 0.26, y: 0.36, width: 0.20, height: 0.34, pivotX: 0.78, pivotY: 0.12 },
    rightArm: { x: 0.56, y: 0.36, width: 0.20, height: 0.34, pivotX: 0.22, pivotY: 0.12 },
  },
  david: {
    gesture: 'wave',
    leftArm: { x: 0.27, y: 0.36, width: 0.19, height: 0.34, pivotX: 0.78, pivotY: 0.12 },
    rightArm: { x: 0.56, y: 0.36, width: 0.20, height: 0.34, pivotX: 0.22, pivotY: 0.12 },
  },
  daniel: {
    gesture: 'raise-hands',
    leftArm: { x: 0.25, y: 0.36, width: 0.21, height: 0.36, pivotX: 0.78, pivotY: 0.12 },
    rightArm: { x: 0.55, y: 0.36, width: 0.21, height: 0.36, pivotX: 0.22, pivotY: 0.12 },
  },
  jonah: {
    gesture: 'wave',
    leftArm: { x: 0.25, y: 0.36, width: 0.21, height: 0.35, pivotX: 0.78, pivotY: 0.12 },
    rightArm: { x: 0.55, y: 0.36, width: 0.21, height: 0.35, pivotX: 0.22, pivotY: 0.12 },
  },
  shepherd: {
    gesture: 'wave',
    leftArm: { x: 0.23, y: 0.36, width: 0.21, height: 0.36, pivotX: 0.78, pivotY: 0.12 },
    rightArm: { x: 0.53, y: 0.36, width: 0.21, height: 0.36, pivotX: 0.22, pivotY: 0.12 },
  },
  angel: {
    gesture: 'raise-hands',
    leftArm: { x: 0.20, y: 0.34, width: 0.27, height: 0.34, pivotX: 0.82, pivotY: 0.18 },
    rightArm: { x: 0.53, y: 0.34, width: 0.27, height: 0.34, pivotX: 0.18, pivotY: 0.18 },
  },
};

for (const species of SPECIES) {
  const puppet = PUPPET_RIGS[species.id];
  species.swim.gesture = puppet.gesture;
  species.swim.rig = { ...(species.swim.rig || {}), leftArm: puppet.leftArm, rightArm: puppet.rightArm };
}
```

- [ ] **Step 5: Refactor `Creature` around a foot anchor and movement state**

Change the constructor to accept `{ artworkId, image, species, canvasWidth, canvasHeight, spawn, isDemo = false }`. Store `x`, `baseY`, `targetX`, `targetY`, `vx`, `vy`, `cruiseSpeed` (the midpoint of `species.swim.speed`), `state`, `stateElapsed`, `currentGesture`, `gestureElapsed`, `nextGestureAt`, and `opacity`. Initialize `targetX`/`targetY` to the spawn point. Compute `width`/`height` through `displaySize(image, canvasWidth, canvasHeight, depthScaleForY(baseY, canvasHeight * 0.45, canvasHeight * 0.91))`, and refresh that depth-dependent size during `updateVisual()`.

```js
setTransition(state) {
  this.state = state;
  this.stateElapsed = 0;
}

setMovement(next) {
  this.x = next.x;
  this.baseY = next.baseY;
  this.vx = next.vx;
  this.vy = next.vy;
}

updateVisual(dt) {
  this.stateElapsed += dt;
  this.opacity = transitionOpacity(this.state, this.stateElapsed);
  if (this.state === 'entering' && this.stateElapsed >= 0.4) this.state = 'active';

  const nextSize = displaySize(
    this.image,
    this.canvasWidth,
    this.canvasHeight,
    depthScaleForY(this.baseY, this.canvasHeight * 0.45, this.canvasHeight * 0.91),
  );
  this.width = nextSize.width;
  this.height = nextSize.height;

  this.gestureElapsed += dt;
  if (this.currentGesture && this.gestureElapsed >= 1.2) {
    this.currentGesture = null;
    this.gestureElapsed = 0;
    this.nextGestureAt = 8 + Math.random() * 12;
  } else if (!this.currentGesture) {
    this.nextGestureAt -= dt;
    if (this.nextGestureAt <= 0) {
      this.currentGesture = this.species.swim.gesture;
      this.gestureElapsed = 0;
    }
  }
}
```

Initialize `currentGesture = species.swim.gesture`, `gestureElapsed = 0`, and `nextGestureAt = 8 + Math.random() * 12` so every new character greets once, then gestures only occasionally. Grounded drawing must call `groundedMotionOffset()` instead of the legacy `motionOffset('walk', ...)`, guaranteeing a zero foot offset.

Draw the shadow first, draw two low-alpha offset silhouette copies to suggest paper thickness, then draw body/legs/arm slices around their rig pivots. Apply a small `turnScaleX` rather than a full 3D model. Keep `baseY` unchanged throughout walking and gestures.

- [ ] **Step 6: Draw only the role name below the feet**

At the end of `Creature.draw()`, call the label helper with only `this.species.name`:

```js
drawCharacterName(
  ctx,
  this.species.name,
  this.x,
  this.baseY + 10,
  Math.max(16, this.width * 0.12),
  this.opacity,
);
```

Do not concatenate gesture state or action text to this label.

- [ ] **Step 7: Run creature tests**

Run: `node --test test/creature.test.js`

Expected: all creature tests PASS, including exact zero foot vertical displacement.

- [ ] **Step 8: Commit after Git restoration**

```bash
git add src/creature.js src/species.js test/creature.test.js
git commit -m "feat: render grounded 2.5d paper puppets"
```

### Task 5: Animated river, gusting foliage, and walking/grazing sheep

**Files:**
- Modify: `src/scene.js:14-164`
- Modify: `test/scene.test.js`

- [ ] **Step 1: Add failing deterministic environment-state tests**

First extend `makeFakeCtx()` so its method regular expression includes `ellipse`, then append to `test/scene.test.js`:

```js
/^(save|restore|beginPath|closePath|moveTo|lineTo|quadraticCurveTo|bezierCurveTo|arc|ellipse|fill|stroke|fillRect|scale|translate|rotate)$/
```

```js
const { createSheep, updateSheep, gustStrength, drawSheep, drawCanopySway } = require('../src/scene.js');

test('羊會在 walking 與 grazing 間切換且不走出草地', () => {
  const sheep = createSheep(1600, 900, () => 0.5);
  sheep.modeTime = 0.01;
  updateSheep(sheep, 0.02, 1600, 900, [], () => 0.5);
  assert.equal(sheep.mode, 'grazing');
  for (let i = 0; i < 1000; i++) updateSheep(sheep, 0.016, 1600, 900, [], () => 0.5);
  assert.ok(sheep.x >= 64 && sheep.x <= 1536);
});

test('陣風強度保持平滑且限制在 0 到 1', () => {
  for (let t = 0; t < 60; t += 0.1) {
    const strength = gustStrength(t);
    assert.ok(strength >= 0 && strength <= 1);
  }
});

test('羊的 walking 與 grazing 畫面都可繪製', () => {
  const { ctx } = makeFakeCtx();
  const sheep = createSheep(1600, 900, () => 0.5);
  assert.doesNotThrow(() => drawSheep(ctx, sheep, 1));
  sheep.mode = 'grazing';
  assert.doesNotThrow(() => drawSheep(ctx, sheep, 2));
});

test('樹冠微風覆層可在 Canvas 上繪製', () => {
  const { ctx } = makeFakeCtx();
  assert.doesNotThrow(() => drawCanopySway(ctx, 1600, 900, 2));
});
```

- [ ] **Step 2: Run scene tests and verify missing exports**

Run: `node --test test/scene.test.js`

Expected: FAIL because the new environment functions are not exported.

- [ ] **Step 3: Add deterministic sheep and gust state**

Add these functions to `src/scene.js` and export them:

```js
function gustStrength(t) {
  const pulse = Math.max(0, Math.sin(t * 0.23 - 1.2));
  return Math.min(1, 0.22 + pulse * pulse * 0.78);
}

function createSheep(w, h, random = Math.random) {
  return {
    x: w * (0.12 + random() * 0.22),
    baseY: h * (0.67 + random() * 0.16),
    direction: random() < 0.5 ? -1 : 1,
    speed: 8 + random() * 8,
    mode: 'walking',
    modeTime: 5 + random() * 5,
  };
}

function updateSheep(sheep, dt, w, h, characters, random = Math.random) {
  sheep.modeTime -= dt;
  if (sheep.modeTime <= 0) {
    sheep.mode = sheep.mode === 'walking' ? 'grazing' : 'walking';
    sheep.modeTime = sheep.mode === 'grazing' ? 2 + random() * 3 : 5 + random() * 6;
  }
  if (sheep.mode !== 'walking') return;
  const nextX = sheep.x + sheep.direction * sheep.speed * dt;
  const blocked = characters.some((c) => Math.abs(c.x - nextX) < c.width * 0.65 && Math.abs(c.baseY - sheep.baseY) < c.height * 0.25);
  if (blocked || nextX < w * 0.04 || nextX > w * 0.96) sheep.direction *= -1;
  else sheep.x = nextX;
  sheep.baseY = Math.max(h * 0.45, Math.min(h * 0.91, sheep.baseY));
}

function drawSheep(ctx, sheep, t) {
  const bob = sheep.mode === 'walking' ? Math.sin(t * 5) * 1.5 : 0;
  const headDrop = sheep.mode === 'grazing' ? 13 : 0;
  const facing = sheep.direction < 0 ? -1 : 1;
  ctx.save();
  ctx.translate(sheep.x, sheep.baseY + bob);
  ctx.scale(facing, 1);
  ctx.fillStyle = '#f7f1dc';
  ctx.strokeStyle = '#6b543b';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, -22, 28, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#594630';
  for (const legX of [-14, 10]) {
    ctx.beginPath();
    ctx.moveTo(legX, -9);
    ctx.lineTo(legX + (sheep.mode === 'walking' ? Math.sin(t * 5 + legX) * 3 : 0), 0);
    ctx.stroke();
  }
  ctx.fillStyle = '#6b543b';
  ctx.beginPath();
  ctx.ellipse(27, -25 + headDrop, 10, 12, 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCanopySway(ctx, w, h, t) {
  const gust = gustStrength(t);
  const clusters = [
    { x: 0.13, y: 0.33, rx: 0.055, ry: 0.045, phase: 0 },
    { x: 0.20, y: 0.29, rx: 0.065, ry: 0.052, phase: 1.1 },
    { x: 0.84, y: 0.31, rx: 0.060, ry: 0.048, phase: 2.0 },
    { x: 0.91, y: 0.37, rx: 0.050, ry: 0.042, phase: 2.8 },
  ];
  ctx.save();
  ctx.fillStyle = 'rgba(84, 112, 45, 0.16)';
  for (const leaf of clusters) {
    const sway = Math.sin(t * 1.1 + leaf.phase) * w * 0.004 * (0.6 + gust);
    ctx.beginPath();
    ctx.ellipse(w * leaf.x + sway, h * leaf.y, w * leaf.rx, h * leaf.ry, sway / 180, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
```

- [ ] **Step 4: Render sheep and apply gust strength to leaves**

Call `drawCanopySway()` after the background image and river but before characters. Multiply existing foreground grass `sway` by `0.65 + gustStrength(t) * 0.8` and keep river speed at the current calm `t * 0.035` rate. `Movement.getWalkableArea()` remains the single source of truth for river/tree collision geometry; `display.html` passes characters into `updateSheep()` and uses the same movement-area snapshot for character navigation.

- [ ] **Step 5: Run scene tests and full suite**

Run: `node --test test/scene.test.js && npm test`

Expected: all scene tests and the full suite PASS.

- [ ] **Step 6: Commit after Git restoration**

```bash
git add src/scene.js test/scene.test.js
git commit -m "feat: animate river foliage and sheep"
```

### Task 6: Compose population, movement, depth, and environment in display.html

**Files:**
- Modify: `display.html:29-174`
- Modify: `src/movement.js`
- Modify: `test/movement.test.js`

- [ ] **Step 1: Add a failing stable depth-sort test**

Append to `test/movement.test.js`:

```js
const { sortByDepth } = require('../src/movement.js');

test('腳底較高的角色先畫，較靠近畫面下方的角色最後畫', () => {
  const chars = [{ artworkId: 'front', baseY: 800 }, { artworkId: 'back', baseY: 500 }];
  assert.deepEqual(sortByDepth(chars).map((c) => c.artworkId), ['back', 'front']);
  assert.deepEqual(chars.map((c) => c.artworkId), ['front', 'back'], '不可改動 FIFO 原陣列');
});
```

- [ ] **Step 2: Implement and export non-mutating depth sort**

Add to `src/movement.js`:

```js
function sortByDepth(characters) {
  return characters.slice().sort((a, b) => a.baseY - b.baseY);
}
```

Run: `node --test test/movement.test.js`

Expected: all movement tests PASS.

- [ ] **Step 3: Load modules in dependency order**

In `display.html`, place these before `channel.js`:

```html
<script src="src/artworkMessage.js"></script>
<script src="src/movement.js"></script>
<script src="src/characterManager.js"></script>
<script src="src/creature.js"></script>
<script src="src/scene.js"></script>
```

- [ ] **Step 4: Replace the raw array and `MAX_CREATURES = 40` with CharacterManager**

Build a `createCharacter(work)` callback that resolves the species, computes a safe spawn through `Movement.findSafeSpawn()`, and constructs `Creature`. If there is no safe spawn, keep the work pending rather than shrinking or overlapping existing characters.

```js
const manager = new CharacterManagerModule.CharacterManager({
  maxCharacters: 15,
  exitSeconds: 0.4,
  createCharacter(work) {
    const species = Species.getSpecies(work.speciesId);
    const spawn = Movement.findSafeSpawn(
      work.displaySize,
      manager.renderable,
      Movement.getWalkableArea(canvas.width, canvas.height),
    );
    if (!species || !spawn) return null;
    return new CreatureModule.Creature({ ...work, species, canvasWidth: canvas.width, canvasHeight: canvas.height, spawn });
  },
});
```

The Task 2 `drainPending()` contract already keeps a work item at the head of `pending` when `createCharacter()` returns `null`; do not add `null` to `renderable`.

Route demo textures through the same manager so they count toward the same 15-character FIFO:

```js
async function seedDemoCreatures() {
  for (const species of Species.SPECIES) {
    const image = await makeDemoTexture(species);
    if (!image) continue;
    manager.enqueue({
      artworkId: `demo-${species.id}`,
      speciesId: species.id,
      image,
      displaySize: CreatureModule.displaySize(image, canvas.width, canvas.height, 1),
      ts: 0,
      isDemo: true,
    });
  }
}
```

- [ ] **Step 5: Validate incoming messages before loading images**

Replace the current message handler with:

```js
channel.onMessage((msg) => {
  if (!ArtworkMessage.isScannedArtworkMessage(msg)) return;
  const species = Species.getSpecies(msg.speciesId);
  if (!species) return;
  const img = new Image();
  img.onload = () => {
    const result = manager.enqueue({ ...msg, image: img, displaySize: CreatureModule.displaySize(img, canvas.width, canvas.height, 1) });
    if (result !== 'accepted') return;
    showToast(`${species.emoji} ${species.name}來到聖經樂園了！`);
  };
  img.onerror = () => showToast('作品圖片讀取失敗，請重新掃描');
  img.src = msg.textureDataURL;
});
```

- [ ] **Step 6: Update and draw in the correct order**

Each frame:

1. Resize-aware `area = Movement.getWalkableArea(canvas.width, canvas.height)`.
2. `manager.update(dt)`.
3. When a character is within 24 px of its target, replace its target through `Movement.chooseSafeTarget()`; then call `Movement.steerCharacter()` for each active grounded character using an immutable snapshot.
4. Call `updateVisual(dt)` for all characters.
5. Update sheep with the same character snapshot.
6. Draw background and river.
7. Draw sheep and `Movement.sortByDepth(manager.renderable)` characters.
8. Draw foreground grass last.

The draw list may include one fading oldest character but may never exceed 15 entries. Demo characters receive stable IDs such as `demo-noah`; they count toward the same 15 and are replaced before later real scans because they entered first.

- [ ] **Step 7: Handle resize without teleporting or overlapping**

On resize, scale each character's `x`, `baseY`, `targetX`, and `targetY` by the old/new canvas ratios, then clamp to the new walkable bounds. Run one separation pass; if a valid position cannot be found, keep that character stationary and retry on subsequent frames.

- [ ] **Step 8: Run unit tests and smoke-load the display page**

Run:

```bash
npm test
npm run serve
```

Open `http://localhost:8933/display.html`.

Expected: tests pass; console has no uncaught error; exactly seven demo characters appear initially, names contain no action text, and all remain separated for five minutes.

- [ ] **Step 9: Commit after Git restoration**

```bash
git add display.html src/movement.js test/movement.test.js
git commit -m "feat: compose bounded roaming scene"
```

### Task 7: Reject unusable extraction before it consumes a scene slot

**Files:**
- Modify: `src/extract.js:6-65`
- Modify: `test/extract.test.js`
- Modify: `control.html:391-417`

- [ ] **Step 1: Add failing extraction-quality tests**

Append to `test/extract.test.js`:

```js
const { assessExtraction } = require('../src/extract.js');

test('空白或人物太小的去背結果不得送入場景', () => {
  const blank = makeImage(100, 100, () => [255, 255, 255, 0]);
  assert.deepEqual(assessExtraction(blank), { ok: false, reason: 'empty' });

  const tiny = makeImage(100, 100, (x, y) => (x >= 48 && x <= 51 && y >= 48 && y <= 51)
    ? [10, 10, 10, 255] : [255, 255, 255, 0]);
  assert.deepEqual(assessExtraction(tiny), { ok: false, reason: 'too-small' });
});

test('正常人物遮罩通過，且白紙背景不得成為不透明外框', () => {
  const person = makeImage(100, 100, (x, y) => (x >= 25 && x <= 74 && y >= 10 && y <= 94)
    ? [180, 80, 40, 255] : [255, 255, 255, 0]);
  const quality = assessExtraction(person);
  assert.equal(quality.ok, true);
  assert.deepEqual(quality.box, { x: 25, y: 10, width: 50, height: 85 });
});
```

- [ ] **Step 2: Implement explicit extraction quality rules**

Add and export:

```js
function assessExtraction(imageData) {
  const box = boundingBoxOfAlpha(imageData, 24);
  if (!box) return { ok: false, reason: 'empty' };
  const canvasArea = imageData.width * imageData.height;
  const boxArea = box.width * box.height;
  if (boxArea / canvasArea < 0.08 || box.height / imageData.height < 0.35) {
    return { ok: false, reason: 'too-small' };
  }
  if (box.width / imageData.width > 0.96 && box.height / imageData.height > 0.96) {
    return { ok: false, reason: 'paper-background' };
  }
  return { ok: true, box };
}
```

- [ ] **Step 3: Gate `scanWarpedFrame()` on the quality result**

Replace the direct bounding-box call with:

```js
const quality = Extract.assessExtraction(merged);
if (!quality.ok) {
  const messages = {
    empty: '沒有辨識到人物，請重新對位',
    'too-small': '人物太小或不完整，請讓 A4 完整進入鏡頭',
    'paper-background': '仍偵測到白色紙張背景，請重新對位後拍攝',
  };
  setScanStatus('err', messages[quality.reason]);
  return null;
}
const cropped = Extract.cropImageData(merged, quality.box, 6);
```

Because a failed scan returns `null`, it creates no artwork ID, sends no message, occupies no slot, and evicts nobody.

- [ ] **Step 4: Run extraction and full tests**

Run: `node --test test/extract.test.js && npm test`

Expected: extraction tests PASS and the full suite has zero failures.

- [ ] **Step 5: Commit after Git restoration**

```bash
git add src/extract.js test/extract.test.js control.html
git commit -m "fix: reject unusable scanned character images"
```

### Task 8: Browser, capacity, and physical A4/Webcam acceptance

**Files:**
- Modify: `SETUP.md`
- Verify: `control.html`, `display.html`, `templates/print.html`

- [ ] **Step 1: Run the complete automated suite**

Run: `npm test`

Expected: all legacy and new tests PASS with zero failures, skips, or cancellations.

- [ ] **Step 2: Run a browser capacity simulation**

Start `npm run serve`, open `display.html` and `control.html` in the same Chrome profile, then use the control-page send path to submit 17 distinct artwork IDs. Record screenshots after items 15, 16, and 17.

Expected:

- At item 15, the scene contains 15 names and no visible overlaps.
- Item 16 waits while item 1 fades out; the rendered count stays at 15 or fewer.
- After transition, item 16 is present and item 1 is absent.
- After item 17, item 2 is absent.
- Replaying item 17's exact message does not create another character.
- Two Moses artworks with different IDs both remain visible.

- [ ] **Step 3: Run a ten-minute motion observation**

Observe a full 15-character scene for ten minutes at the actual projector resolution.

Expected:

- Characters roam across the walkable grass region, turn before edges, and never cross the river/tree obstacles.
- Visible character safety outlines never touch.
- Grounded feet do not bob vertically during walking, waving, or hand raising.
- Names contain only `挪亞`, `摩西`, `大衛`, `但以理`, `約拿`, `牧羊人`, or `天使`.
- River, leaves, and sheep animate calmly; sheep does not pass through a character.
- Browser console remains free of uncaught exceptions.

- [ ] **Step 4: Print and scan two differently colored copies of the same role**

From `templates/print.html`, print the same role twice on A4 landscape at 100%/actual size. Color the two sheets differently. With a USB UVC Webcam, scan each sheet through the automatic path.

Expected:

- Four corner markers and QR stay inside the printer's printable area.
- Both scans identify the same role but receive different artwork IDs.
- Both characters appear simultaneously with their own exact colors and brush strokes.
- Neither output contains a white paper rectangle.
- The role name appears once below each character; no action label appears.

- [ ] **Step 5: Run the 16th-character replacement with real scans**

Scan enough printed sheets to reach 15, note the oldest artwork, then scan one more.

Expected: the oldest artwork fades out first, the new work enters from a safe edge, the scene never shows more than 15 characters, and no existing work is evicted when a scan fails.

- [ ] **Step 6: Run the 30-minute stability check**

Leave the full scene and both Chrome tabs open for 30 minutes while scanning at least five replacements.

Expected: animation stays smooth at the target projector resolution, memory does not show continuous unbounded growth in Chrome Task Manager, pending replacements drain, and control/display communication continues working.

- [ ] **Step 7: Document the physical setup and observed thresholds**

Add a `15 位角色與替換測試` section to `SETUP.md` recording:

- printer model, paper setting, scale, and whether margins clipped markers;
- Webcam model, resolution, mounting height, and lighting;
- successful marker/QR distance range;
- actual character count and replacement order;
- any calibrated detection thresholds changed in `control.html`.

- [ ] **Step 8: Final verification commit after Git restoration**

```bash
git add SETUP.md
git commit -m "docs: add fifteen-character physical acceptance run"
git status --short
```

Expected: `git status --short` is empty after all implementation commits.
