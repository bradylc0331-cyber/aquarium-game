const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getSkyArea, flyableBand, findSkySpawn, driftFlyer, SEPARATION_WIDTHS, PULSE_SCALE_MAX }
  = require('../src/flight.js');
const { motionOffset } = require('../src/creature.js');
const { getWalkableArea } = require('../src/movement.js');

function flyer(overrides = {}) {
  return {
    id: 'angel', x: 400, baseY: 260, width: 180, height: 320,
    cruiseSpeed: 40, driftDirection: 1, driftPhase: 0, driftElapsed: 0,
    isFlying: true, ...overrides,
  };
}

test('天空帶完全在可行走區上緣之上，天使不會飄到草地上', () => {
  // 這是整件事的重點：天使原本被地面控制器壓在草地上，跟大家擠在一起。
  for (const [w, h] of [[1920, 1080], [1280, 720], [3840, 2160], [1024, 768]]) {
    const sky = getSkyArea(w, h);
    const ground = getWalkableArea(w, h);
    assert.ok(
      sky.bottom < ground.top,
      `${w}x${h}：天空帶下緣 ${sky.bottom.toFixed(0)} 必須在可行走區上緣 ${ground.top.toFixed(0)} 之上`,
    );
    assert.ok(sky.top > 0, '上緣要留一點邊，不要貼著畫面頂端');
    assert.ok(sky.bottom > sky.top, '天空帶要有高度');
  }
});

// 飛行角色實際被畫出來的上下緣。**照 creature.js 的 draw 算**，不重述 flight.js
// 的公式——上一版的測試把 flyableBand 的算式抄過來當答案，等於拿自己驗自己：
// 那條算式漏算了半個身高，測試卻照樣綠燈，天使的光環在 1080p 下被畫面上緣切掉。
function drawnSpan(self, baseY, t) {
  const off = motionOffset('pulse', t, {
    amplitude: self.amplitude, freq: self.freq, phase: self.phase || 0,
  });
  const hover = self.amplitude; // draw(): 非 grounded 的 hover 就是 amplitude
  const y = baseY - self.renderHeight / 2 - hover + off.yOffset;
  const half = (self.renderHeight / 2) * off.scaleY;
  return { top: y - half, bottom: y + half };
}

// 掃過一整個週期取最壞值。用取樣而不是解析解，是為了讓 motionOffset 之後怎麼改
// （換波形、加項）這裡都還抓得到。
function worstDrawnSpan(self, baseY) {
  let top = Infinity;
  let bottom = -Infinity;
  for (let t = 0; t < 200; t += 0.01) {
    const span = drawnSpan(self, baseY, t);
    if (span.top < top) top = span.top;
    if (span.bottom > bottom) bottom = span.bottom;
  }
  return { top, bottom };
}

test('天使的頭不會被畫面上緣切掉——用真正的繪製幾何驗，不是重抄公式', () => {
  // 1080p 下實測到的天使尺寸（renderHeight 281、amplitude 23.3），其餘解析度等比例。
  for (const [w, h] of [[1920, 1080], [1280, 720], [3840, 2160], [1024, 768]]) {
    const area = getSkyArea(w, h);
    const angel = {
      renderHeight: 281 * h / 1080, height: 281 * h / 1080,
      amplitude: 23.3 * h / 1080, freq: 0.5, phase: 0.7,
    };
    const band = flyableBand(area, angel);
    assert.ok(band.bottom > band.top, `${w}x${h}：可用帶要有高度`);

    // 飄到最高處時，整張圖都還要在畫面裡。
    const worst = worstDrawnSpan(angel, band.top);
    assert.ok(
      worst.top >= 0,
      `${w}x${h}：最高點時圖的頂端落在 y=${worst.top.toFixed(1)}，被畫面上緣切掉了`,
    );
  }
});

test('天使飄到最低處時，整張圖仍在草地上緣之上——不會壓到地面角色', () => {
  for (const [w, h] of [[1920, 1080], [1280, 720], [3840, 2160], [1024, 768]]) {
    const area = getSkyArea(w, h);
    const ground = getWalkableArea(w, h);
    const angel = {
      renderHeight: 281 * h / 1080, height: 281 * h / 1080,
      amplitude: 23.3 * h / 1080, freq: 0.5, phase: 0.7,
    };
    const band = flyableBand(area, angel);
    const worst = worstDrawnSpan(angel, band.bottom);
    assert.ok(
      worst.bottom < ground.top,
      `${w}x${h}：最低點時圖的底端 ${worst.bottom.toFixed(0)} 已經進到草地（上緣 ${ground.top.toFixed(0)}）`,
    );
  }
});

test('flight.js 抄的 PULSE_SCALE_MAX 要跟 creature.js 的真值一致', () => {
  // flight.js 為了不依賴載入順序，自己寫了一份 pulse 的 scaleY 上限。
  // 這裡直接拿真的 motionOffset 掃一輪，確認那份副本沒有走鐘。
  let maxScaleY = -Infinity;
  for (let t = 0; t < 200; t += 0.01) {
    const off = motionOffset('pulse', t, { amplitude: 10, freq: 0.5, phase: 0 });
    if (off.scaleY > maxScaleY) maxScaleY = off.scaleY;
  }
  assert.ok(
    PULSE_SCALE_MAX >= maxScaleY - 1e-9,
    `flight.js 的 PULSE_SCALE_MAX=${PULSE_SCALE_MAX} 已經小於實際的 ${maxScaleY.toFixed(4)}`,
  );
});

test('pulse 的 yOffset 擺幅不超過 amplitude——flyableBand 讓出的 2×amplitude 才夠', () => {
  let maxAbs = 0;
  for (let t = 0; t < 200; t += 0.01) {
    const off = motionOffset('pulse', t, { amplitude: 10, freq: 0.5, phase: 0 });
    maxAbs = Math.max(maxAbs, Math.abs(off.yOffset));
  }
  assert.ok(maxAbs <= 10 + 1e-9, `yOffset 擺幅 ${maxAbs.toFixed(3)} 已經超過 amplitude`);
});

test('getSkyArea 對非有限正尺寸立即失敗', () => {
  for (const bad of [[0, 100], [100, 0], [NaN, 100], [100, Infinity], [-5, 100]]) {
    assert.throws(() => getSkyArea(bad[0], bad[1]), RangeError);
  }
});

test('飄移會沿水平方向前進，並且始終留在天空帶內', () => {
  const area = getSkyArea(1920, 1080);
  let self = flyer({ x: 300 });
  const startX = self.x;
  for (let frame = 0; frame < 60 * 60; frame++) { // 一分鐘
    self = { ...self, ...driftFlyer(self, [self], area, 1 / 60) };
    const band = flyableBand(area, self);
    assert.ok(
      self.baseY >= band.top - 1e-6 && self.baseY <= band.bottom + 1e-6,
      `第 ${frame} 幀飄出可用帶（y=${self.baseY.toFixed(1)}，帶 ${band.top.toFixed(0)}~${band.bottom.toFixed(0)}）`,
    );
    assert.ok(Number.isFinite(self.x) && Number.isFinite(self.baseY));
  }
  assert.notEqual(self.x, startX, '一分鐘後應該移動過');
});

test('碰到左右邊緣要轉回來，不是停在牆上', () => {
  const area = getSkyArea(1200, 800);
  let self = flyer({ x: area.right - 100, driftDirection: 1, width: 180 });
  let reversed = false;
  for (let frame = 0; frame < 60 * 30; frame++) {
    const next = driftFlyer(self, [self], area, 1 / 60);
    if (next.driftDirection === -1) reversed = true;
    self = { ...self, ...next };
    assert.ok(self.x + self.width / 2 <= area.right + 1e-6, '不得超出右緣');
    assert.ok(self.x - self.width / 2 >= area.left - 1e-6, '不得超出左緣');
  }
  assert.ok(reversed, '碰到右緣之後應該轉向');
});

test('兩位天使靠太近時會互相讓開，不會疊成一團', () => {
  const area = getSkyArea(1920, 1080);
  let a = flyer({ id: 'a', x: 900, driftDirection: 1 });
  let b = flyer({ id: 'b', x: 960, driftDirection: -1 });
  const needed = (a.width + b.width) / 2 * SEPARATION_WIDTHS;
  assert.ok(Math.abs(a.x - b.x) < needed, '前提：一開始要真的太近');

  for (let frame = 0; frame < 60 * 20; frame++) {
    const crowd = [a, b];
    const na = driftFlyer(a, crowd, area, 1 / 60);
    const nb = driftFlyer(b, crowd, area, 1 / 60);
    a = { ...a, ...na };
    b = { ...b, ...nb };
  }
  assert.ok(
    Math.abs(a.x - b.x) >= needed * 0.9,
    `二十秒後應該分開（實際間距 ${Math.abs(a.x - b.x).toFixed(0)}，需要 ${needed.toFixed(0)}）`,
  );
});

test('findSkySpawn 只挑天空帶內、且不跟其他天使重疊的位置', () => {
  const area = getSkyArea(1920, 1080);
  const size = { width: 180, height: 320 };
  let seed = 7;
  const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

  const placed = [];
  for (let i = 0; i < 4; i++) {
    const spawn = findSkySpawn(size, placed, area, random);
    if (!spawn) break;
    assert.ok(spawn.baseY >= area.top && spawn.baseY <= area.bottom, '出生點要在天空帶內');
    assert.ok(spawn.x - size.width / 2 >= area.left - 1e-6, '不得超出左緣');
    assert.ok(spawn.x + size.width / 2 <= area.right + 1e-6, '不得超出右緣');
    for (const other of placed) {
      assert.ok(
        Math.abs(other.x - spawn.x) >= (size.width + other.width) / 2 * SEPARATION_WIDTHS,
        '新出生點不得跟已在場的天使重疊',
      );
    }
    placed.push({ ...size, ...spawn, isFlying: true });
  }
  assert.ok(placed.length >= 2, `天空放得下至少兩位（實際 ${placed.length}）`);
});

test('天空塞滿時回傳 null，讓作品留在 pending 等空間', () => {
  // 跟地面同一套規則：找不到位子就等，不縮小也不重疊。
  const area = getSkyArea(400, 1080); // 很窄的天空
  const size = { width: 180, height: 320 };
  const packed = [];
  for (let x = area.left + 90; x <= area.right - 90; x += 20) {
    packed.push({ x, baseY: 200, ...size, isFlying: true });
  }
  assert.equal(findSkySpawn(size, packed, area, () => 0.5), null);
});

test('driftFlyer 對 dt 與速度 fail fast，且不改動輸入', () => {
  const area = getSkyArea(1920, 1080);
  const self = flyer();
  const snapshot = structuredClone(self);

  for (const dt of [-1, NaN, Infinity]) {
    assert.throws(() => driftFlyer(self, [self], area, dt), RangeError);
  }
  assert.throws(() => driftFlyer(flyer({ cruiseSpeed: 0 }), [], area, 0.1), RangeError);

  driftFlyer(self, [self], area, 0.1);
  assert.deepEqual(self, snapshot, 'driftFlyer 不得改動傳進來的角色');
});

test('飛行角色不回報 blocked 或 stalled——天空裡沒有東西擋得住牠', () => {
  const area = getSkyArea(1920, 1080);
  const result = driftFlyer(flyer(), [flyer()], area, 1 / 60);
  assert.equal(result.blocked, false);
  assert.equal(result.stalled, false);
});
