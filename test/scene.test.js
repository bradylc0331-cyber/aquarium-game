const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  createBubbles,
  updateBubbles,
  drawBubbles,
  drawBackground,
  drawForeground,
  createSheepFlock,
  sheepScaleForY,
} = require('../src/scene.js');

// 用 Proxy 假裝一個 CanvasRenderingContext2D：任何方法呼叫都是 no-op，
// 任何屬性讀寫都直接接受。目的不是驗證畫面長怎樣（那要真的瀏覽器），
// 是抓「呼叫到不存在的 ctx API / 變數打錯字」這種低級錯誤。
function makeFakeCtx() {
  const calls = [];
  const gradientStub = { addColorStop() {} };
  const handler = {
    get(target, prop) {
      if (prop === 'createLinearGradient') return () => gradientStub;
      if (typeof prop === 'string' && /^(save|restore|beginPath|closePath|moveTo|lineTo|quadraticCurveTo|bezierCurveTo|arc|ellipse|fill|stroke|fillRect|scale|translate|rotate)$/.test(prop)) {
        return (...args) => { calls.push([prop, args]); };
      }
      return target[prop];
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  };
  return { ctx: new Proxy({}, handler), calls };
}

test('氣泡飄到畫面上緣時要回收到底部重生，不能飄出去消失不見', () => {
  const bubbles = createBubbles(400, 300, 5);
  bubbles[0].y = 2;
  bubbles[0].speed = 100;
  updateBubbles(bubbles, 1, 400, 300);
  assert.ok(bubbles[0].y > 250, `應該被重置到接近底部，got ${bubbles[0].y}`);
});

test('背景／薄雲／光束／光點繪製函式在假的 ctx 上跑過一輪不能丟例外', () => {
  const { ctx } = makeFakeCtx();
  const bubbles = createBubbles(800, 600, 10);
  assert.doesNotThrow(() => {
    drawBackground(ctx, 800, 600, 1.23);
    drawBubbles(ctx, bubbles);
    drawForeground(ctx, 800, 600, 1.23);
  });
});

const { gustStrength, drawCanopySway } = require('../src/scene.js');

test('陣風強度平滑且限制在 0 到 1', () => {
  let previous = gustStrength(0);
  for (let t = 0; t < 60; t += 0.05) {
    const strength = gustStrength(t);
    assert.ok(strength >= 0 && strength <= 1, `t=${t} 時強度 ${strength} 超出範圍`);
    assert.ok(Math.abs(strength - previous) < 0.1, `t=${t} 時陣風跳變太劇烈`);
    previous = strength;
  }
});

test('樹冠微風覆層畫得出來', () => {
  const { ctx } = makeFakeCtx();
  assert.doesNotThrow(() => drawCanopySway(ctx, 1600, 900, 2));
});

test('羊群固定六隻、橫向展開，而且每一隻都站在可行走草地內', () => {
  const area = { left: 40, right: 960, top: 600, bottom: 930 };
  const flock = createSheepFlock(1000, 1000, () => 0.5);
  assert.equal(flock.length, 6);
  assert.ok(flock.every((sheep) => sheep.x >= area.left && sheep.x <= area.right));
  assert.ok(flock.every((sheep) => sheep.baseY >= area.top && sheep.baseY <= area.bottom));
  const sortedX = flock.map((sheep) => sheep.x).sort((a, b) => a - b);
  assert.ok(sortedX[5] - sortedX[0] > 700, '六隻羊必須橫跨大部分草地');
});

test('羊群工廠使用注入亂數且每隻羊都有完整可行走狀態', () => {
  const sequence = [0, 0.25, 0.5, 0.75, 1, 0.1, 0.3, 0.6, 0.9, 0.2, 0.4, 0.8];
  const makeSequenceRandom = () => {
    let index = 0;
    return () => sequence[index++];
  };
  const firstFlock = createSheepFlock(1000, 1000, makeSequenceRandom());
  const secondFlock = createSheepFlock(1000, 1000, makeSequenceRandom());
  const fixedFlock = createSheepFlock(1000, 1000, () => 0);

  assert.deepEqual(firstFlock, secondFlock);
  assert.notDeepEqual(firstFlock, fixedFlock);
  for (const sheep of firstFlock) {
    assert.ok(Number.isFinite(sheep.speed) && sheep.speed >= 8 && sheep.speed <= 16);
    assert.ok(sheep.mode === 'walking' || sheep.mode === 'grazing');
    assert.ok(Number.isFinite(sheep.modeTime) && sheep.modeTime > 0);
    if (sheep.mode === 'grazing') {
      assert.ok(sheep.modeTime >= 2 && sheep.modeTime <= 5);
    } else {
      assert.ok(sheep.modeTime >= 5 && sheep.modeTime <= 11);
    }
    assert.ok(sheep.direction === 1 || sheep.direction === -1);
    assert.ok(Number.isFinite(sheep.width) && sheep.width > 0);
    assert.ok(Number.isFinite(sheep.height) && sheep.height > 0);
    assert.ok(Number.isFinite(sheep.phase));
  }
  assert.ok(firstFlock.some((sheep) => sheep.direction === 1));
  assert.ok(firstFlock.some((sheep) => sheep.direction === -1));
  assert.ok(firstFlock.some((sheep) => sheep.mode === 'grazing'));
  assert.ok(firstFlock.some((sheep) => sheep.mode === 'walking'));
  assert.ok(new Set(firstFlock.map((sheep) => sheep.phase)).size > 3);
});

test('羊越靠近畫面下方越大，而且景深縮放沒有跳階', () => {
  const samples = [600, 650, 700, 750, 800, 850, 900].map((y) => sheepScaleForY(y, 600, 930));
  for (let i = 1; i < samples.length; i++) {
    assert.ok(samples[i] > samples[i - 1]);
    assert.ok(samples[i] - samples[i - 1] < 0.1, '相鄰深度不能突然放大');
  }
});

test('羊景深縮放在草地範圍外也會夾住且保持單調', () => {
  const top = 600;
  const bottom = 930;
  const topScale = sheepScaleForY(top, top, bottom);
  const bottomScale = sheepScaleForY(bottom, top, bottom);
  assert.equal(sheepScaleForY(top - 100, top, bottom), topScale);
  assert.equal(sheepScaleForY(bottom + 100, top, bottom), bottomScale);

  let previous = topScale;
  for (let y = top - 200; y <= bottom + 200; y += 5) {
    const scale = sheepScaleForY(y, top, bottom);
    assert.ok(scale >= 0.72 && scale <= 1.05);
    assert.ok(scale >= previous);
    previous = scale;
  }
});
