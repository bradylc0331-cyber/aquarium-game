const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  createBubbles,
  updateBubbles,
  drawBubbles,
  drawBackground,
  drawForeground,
  createSheepFlock,
  sheepScaleForY,
  updateSheepFlock,
  createBirdFlock,
  updateBirdFlock,
  rasterizeRuntimeSprite,
  drawSheep,
  drawBirdFlock,
  riverPoint,
  riverHalfWidth,
  RIVER_PATH,
  RIVER_FISH_RANGE,
  riverTangentAngle,
  normalizeRiverFishProgress,
  createRiverFish,
  updateRiverFish,
  drawRiverFish,
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
      if (typeof prop === 'string' && /^(save|restore|beginPath|closePath|moveTo|lineTo|quadraticCurveTo|bezierCurveTo|arc|ellipse|fill|stroke|fillRect|drawImage|scale|translate|rotate)$/.test(prop)) {
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

test('羊群更新會把超出草地的高度夾回範圍', () => {
  const area = { left: 40, right: 960, top: 600, bottom: 930 };
  const sheep = createSheepFlock(1000, 1000, () => 0.5)[0];
  sheep.baseY = area.bottom + 120;

  updateSheepFlock([sheep], 0, area);

  assert.equal(sheep.baseY, area.bottom);
});

test('走動的羊會前進，吃草的羊保持原地', () => {
  const area = { left: 40, right: 960, top: 600, bottom: 930 };
  const [walking, grazing] = createSheepFlock(1000, 1000, () => 0.5);
  walking.x = 400;
  walking.direction = 1;
  walking.mode = 'walking';
  walking.modeTime = 10;
  grazing.x = 600;
  grazing.mode = 'grazing';
  grazing.modeTime = 10;
  const walkingStart = walking.x;
  const grazingStart = grazing.x;

  updateSheepFlock([walking, grazing], 0.5, area);

  assert.ok(walking.x > walkingStart);
  assert.equal(grazing.x, grazingStart);
});

test('飛鳥固定六隻、分布在天空，而且振翅相位不同', () => {
  const birds = createBirdFlock(1000, 800);
  assert.equal(birds.length, 6);
  assert.ok(birds.every((bird) => bird.y > 40 && bird.y < 320));
  assert.ok(new Set(birds.map((bird) => bird.phase)).size > 3);
});

test('第一幀的六隻飛鳥都完整落在畫布內', () => {
  const width = 1280;
  const height = 720;
  const birds = createBirdFlock(width, height);
  const { ctx, calls } = makeFakeCtx();
  drawBirdFlock(ctx, birds, 0, height, { birdUp: { id: 'up' }, birdDown: { id: 'down' } });

  const rectangles = [];
  let translateX = 0;
  let mirrored = false;
  for (const [name, args] of calls) {
    if (name === 'translate') {
      [translateX] = args;
      mirrored = false;
    } else if (name === 'scale' && args[0] < 0) {
      mirrored = true;
    } else if (name === 'drawImage') {
      const [, localX, , drawnWidth] = args;
      rectangles.push(mirrored
        ? [translateX - localX - drawnWidth, translateX - localX]
        : [translateX + localX, translateX + localX + drawnWidth]);
    }
  }

  assert.equal(rectangles.length, 6);
  assert.ok(rectangles.every(([left, right]) => left >= 0 && right <= width));
  assert.equal(birds.filter((bird) => bird.direction === 1).length, 3);
  assert.equal(birds.filter((bird) => bird.direction === -1).length, 3);
});

test('飛鳥離開一側後從另一側回到天空，不會永遠消失', () => {
  const bird = createBirdFlock(1000, 800)[0];
  bird.direction = 1;
  bird.x = 1100;
  updateBirdFlock([bird], 0.1, 1000, 800);
  assert.ok(bird.x < 0);
  assert.ok(bird.y > 0 && bird.y < 320);
});

test('天空中的飛鳥會往宣告方向前進且持續振翅', () => {
  const bird = createBirdFlock(1000, 800)[1];
  bird.x = 400;
  bird.direction = 1;
  const phaseStart = bird.phase;
  const xStart = bird.x;

  updateBirdFlock([bird], 0.25, 1000, 800);

  assert.ok(bird.phase > phaseStart);
  assert.ok(bird.x > xStart);
});

test('羊遇到角色後會持續遠離，不會在 blocker 旁每幀來回翻向', () => {
  const area = { left: 40, right: 960, top: 600, bottom: 930 };
  const sheep = createSheepFlock(1000, 1000, () => 0.5)[0];
  const blocker = { x: 510, baseY: sheep.baseY, width: 100 };
  const blockerBefore = { ...blocker };
  sheep.x = 500;
  sheep.speed = 20;
  sheep.direction = 1;
  sheep.mode = 'walking';
  sheep.modeTime = 10;

  updateSheepFlock([sheep], 0.05, area, [blocker]);
  assert.equal(sheep.direction, -1, '第一次接近角色時應該轉向');
  const xAfterTurn = sheep.x;
  for (let frame = 0; frame < 20; frame++) {
    updateSheepFlock([sheep], 0.05, area, [blocker]);
    assert.equal(sheep.direction, -1, `第 ${frame + 1} 幀不應再次翻向`);
  }

  assert.ok(xAfterTurn - sheep.x > 10, '轉向後應該明顯走離角色');
  assert.ok(Number.isFinite(sheep.x));
  assert.ok(sheep.x >= area.left && sheep.x <= area.right);
  assert.deepEqual(blocker, blockerBefore, '羊的避讓不應改動角色狀態');
});

test('羊群在視窗放大與縮小後保留橫向及深度分布', () => {
  const grownArea = { left: 77, right: 1843, top: 648, bottom: 1004 };
  const grown = createSheepFlock(1280, 720, () => 0.5);
  const grownXBefore = grown.map((sheep) => sheep.x);
  const grownYBefore = grown.map((sheep) => sheep.baseY);

  updateSheepFlock(grown, 0, grownArea);

  assert.ok(grown.every((sheep, index) => sheep.x > grownXBefore[index]));
  assert.ok(grown.every((sheep, index) => sheep.baseY > grownYBefore[index]));
  assert.ok(grown.every((sheep) => sheep.x >= grownArea.left && sheep.x <= grownArea.right));
  assert.ok(grown.every((sheep) => sheep.baseY >= grownArea.top && sheep.baseY <= grownArea.bottom));
  assert.equal(new Set(grown.map((sheep) => sheep.x)).size, grown.length);
  assert.equal(new Set(grown.map((sheep) => sheep.baseY)).size, grown.length);

  const shrunkenArea = { left: 51, right: 1229, top: 432, bottom: 670 };
  const shrunken = createSheepFlock(1920, 1080, () => 0.5);
  const shrunkenXBefore = shrunken.map((sheep) => sheep.x);
  const shrunkenYBefore = shrunken.map((sheep) => sheep.baseY);

  updateSheepFlock(shrunken, 0, shrunkenArea);

  assert.ok(shrunken.every((sheep, index) => sheep.x < shrunkenXBefore[index]));
  assert.ok(shrunken.every((sheep, index) => sheep.baseY < shrunkenYBefore[index]));
  assert.ok(shrunken.every((sheep) => sheep.x >= shrunkenArea.left && sheep.x <= shrunkenArea.right));
  assert.ok(shrunken.every((sheep) => sheep.baseY >= shrunkenArea.top && sheep.baseY <= shrunkenArea.bottom));
  assert.equal(new Set(shrunken.map((sheep) => sheep.x)).size, shrunken.length);
  assert.equal(new Set(shrunken.map((sheep) => sheep.baseY)).size, shrunken.length);
});

test('飛鳥在視窗縮放時重設天空高度與入場位置', () => {
  const grown = createBirdFlock(1280, 720);
  const grownHomeY = grown.map((bird) => bird.homeY);
  const grownX = grown[1].x;

  updateBirdFlock(grown, 0, 1920, 1080);

  assert.ok(grown.every((bird, index) => bird.homeY > grownHomeY[index]));
  assert.ok(grown.every((bird) => bird.homeY > 50 && bird.homeY < 350));
  assert.ok(grown[1].x > grownX);
  assert.ok(grown.every((bird) => Number.isFinite(bird.x) && Number.isFinite(bird.y) && Number.isFinite(bird.phase)));

  const shrunken = createBirdFlock(1920, 1080);
  const farRightLeftMover = shrunken[5];
  updateBirdFlock(shrunken, 0.05, 1280, 720);

  assert.ok(shrunken.every((bird) => bird.homeY > 40 && bird.homeY < 240));
  assert.ok(farRightLeftMover.x <= 1400, '縮小後的左飛鳥要立即回到可進場的右側');
  assert.ok(shrunken.every((bird) => Number.isFinite(bird.x) && Number.isFinite(bird.y) && Number.isFinite(bird.phase)));
});

test('飛鳥在 production dt 會從兩端回來且維持有限狀態', () => {
  const [rightBird, leftBird] = createBirdFlock(1000, 800);
  rightBird.direction = 1;
  rightBird.x = 1060;
  leftBird.direction = -1;
  leftBird.x = -60;
  const rightPhase = rightBird.phase;
  const leftPhase = leftBird.phase;

  updateBirdFlock([rightBird, leftBird], 0.05, 1000, 800);

  assert.ok(rightBird.x < 0);
  assert.ok(leftBird.x > 1000);
  assert.notEqual(rightBird.phase, rightPhase);
  assert.notEqual(leftBird.phase, leftPhase);
  assert.ok([rightBird, leftBird].every((bird) => Number.isFinite(bird.x) && Number.isFinite(bird.y) && Number.isFinite(bird.phase)));
});

test('同尺寸更新也會把吃草與走動的羊夾回草地左右邊界', () => {
  const area = { left: 40, right: 960, top: 600, bottom: 930 };
  const [grazing, walking] = createSheepFlock(1000, 1000, () => 0.5);
  grazing.x = -60;
  grazing.mode = 'grazing';
  grazing.modeTime = 10;
  walking.x = 1001;
  walking.mode = 'walking';
  walking.modeTime = 10;

  updateSheepFlock([grazing, walking], 0, area);

  assert.ok(grazing.x >= area.left && grazing.x <= area.right);
  assert.ok(walking.x >= area.left && walking.x <= area.right);
});

test('resize 保留每隻羊在原草地內的相對橫向與深度位置', () => {
  const captureRelativePositions = (flock, area) => flock.map((sheep) => ({
    x: (sheep.x - area.left) / (area.right - area.left),
    depth: (sheep.baseY - area.top) / (area.bottom - area.top),
  }));
  const assertRelativePositions = (flock, area, before) => {
    flock.forEach((sheep, index) => {
      const x = (sheep.x - area.left) / (area.right - area.left);
      const depth = (sheep.baseY - area.top) / (area.bottom - area.top);
      assert.ok(Math.abs(x - before[index].x) < 1e-10, `第 ${index + 1} 隻羊的橫向比例改變了`);
      assert.ok(Math.abs(depth - before[index].depth) < 1e-10, `第 ${index + 1} 隻羊的深度比例改變了`);
    });
  };

  const oldSmallArea = { left: 51.2, right: 1228.8, top: 432, bottom: 669.6 };
  const largeArea = { left: 76.8, right: 1843.2, top: 648, bottom: 1004.4 };
  const growing = createSheepFlock(1280, 720, () => 0.5);
  const growingBefore = captureRelativePositions(growing, oldSmallArea);
  updateSheepFlock(growing, 0, largeArea);
  assertRelativePositions(growing, largeArea, growingBefore);
  assert.equal(new Set(growing.map((sheep) => sheep.x)).size, growing.length);
  assert.equal(new Set(growing.map((sheep) => sheep.baseY)).size, growing.length);

  const oldLargeArea = { left: 76.8, right: 1843.2, top: 648, bottom: 1004.4 };
  const smallArea = { left: 51.2, right: 1228.8, top: 432, bottom: 669.6 };
  const shrinking = createSheepFlock(1920, 1080, () => 0.5);
  const shrinkingBefore = captureRelativePositions(shrinking, oldLargeArea);
  updateSheepFlock(shrinking, 0, smallArea);
  assertRelativePositions(shrinking, smallArea, shrinkingBefore);
  assert.ok(shrinking.every((sheep) => sheep.x >= smallArea.left && sheep.x <= smallArea.right));
  assert.ok(shrinking.every((sheep) => sheep.baseY >= smallArea.top && sheep.baseY <= smallArea.bottom));
});

test('runtime sprite rasterization 只畫一次、保留比例，且不會超過寬度上限', () => {
  const draws = [];
  const rasterContext = {
    drawImage(...args) {
      draws.push(args);
    },
  };
  const documentLike = {
    createElement(tag) {
      assert.equal(tag, 'canvas');
      return {
        width: 0,
        height: 0,
        getContext() {
          return rasterContext;
        },
      };
    },
  };
  const source = { width: 640, height: 320 };

  const runtimeSprite = rasterizeRuntimeSprite(source, 320, documentLike);

  assert.equal(runtimeSprite.width, 320);
  assert.equal(runtimeSprite.height, 160);
  assert.deepEqual(draws, [[source, 0, 0, 320, 160]]);
});

test('runtime sprite rasterization 對不支援與拋例外的畫布回傳 null', () => {
  const source = { width: 640, height: 320 };
  const sourceWithThrowingWidth = {
    get width() { throw new Error('source unavailable'); },
    height: 320,
  };

  assert.equal(rasterizeRuntimeSprite(null, 320, null), null);
  assert.equal(rasterizeRuntimeSprite(sourceWithThrowingWidth, 320, null), null);
  assert.equal(rasterizeRuntimeSprite(source, 320, null), null);
  assert.equal(rasterizeRuntimeSprite(source, 320, {
    get createElement() { throw new Error('factory getter unavailable'); },
  }), null);
  assert.equal(rasterizeRuntimeSprite(source, 320, { createElement() { throw new Error('no canvas'); } }), null);
  assert.equal(rasterizeRuntimeSprite(source, 320, {
    createElement() {
      return { getContext() { throw new Error('no context'); } };
    },
  }), null);
  assert.equal(rasterizeRuntimeSprite(source, 320, {
    createElement() {
      return {
        getContext() {
          return { drawImage() { throw new Error('draw failed'); } };
        },
      };
    },
  }), null);
});

test('沒有已載入動物圖片時繪製函式不會讓 Node frame 崩潰', () => {
  const { ctx } = makeFakeCtx();
  const sheep = createSheepFlock(1000, 800, () => 0.5)[0];
  const birds = createBirdFlock(1000, 800);

  assert.doesNotThrow(() => drawSheep(ctx, sheep, 1.2, 800));
  assert.doesNotThrow(() => drawBirdFlock(ctx, birds, 1.2, 800));
});

test('飛鳥振翅使用各自影格，且下拍只在 local X 加上量測的註冊偏移', () => {
  const { ctx, calls } = makeFakeCtx();
  const images = { birdUp: { id: 'up' }, birdDown: { id: 'down' } };
  const commonBird = {
    x: 300,
    y: 120,
    direction: 1,
    width: 100,
    height: 50,
    flapSpeed: 5,
  };

  drawBirdFlock(ctx, [{ ...commonBird, phase: Math.PI / 2 }], 0, 800, images);
  drawBirdFlock(ctx, [{ ...commonBird, phase: -Math.PI / 2 }], 0, 800, images);

  const draws = calls.filter(([name]) => name === 'drawImage').map(([, args]) => args);
  assert.equal(draws.length, 2);
  assert.equal(draws[0][0], images.birdUp);
  assert.equal(draws[1][0], images.birdDown);
  assert.ok(Math.abs((draws[1][1] - draws[0][1]) + 4.9) < 1e-9);
  assert.equal(draws[0][2], draws[1][2]);
});

test('動物偏好影格不可用時會退回另一個已載入的姿勢', () => {
  const { ctx, calls } = makeFakeCtx();
  const walking = { id: 'walking' };
  const birdUp = { id: 'up' };
  const sheep = {
    x: 300,
    baseY: 700,
    direction: -1,
    mode: 'grazing',
    width: 80,
    height: 60,
    phase: 0,
  };
  const bird = {
    x: 200,
    y: 100,
    direction: -1,
    width: 60,
    height: 40,
    phase: -Math.PI / 2,
  };

  drawSheep(ctx, sheep, 0, 800, { sheepWalking: walking, sheepGrazing: null });
  drawBirdFlock(ctx, [bird], 0, 800, { birdUp, birdDown: null });

  const sources = calls.filter(([name]) => name === 'drawImage').map(([, args]) => args[0]);
  assert.deepEqual(sources, [walking, birdUp]);
});


// 河道幾何一律從 src/scene.js 匯出的常數推導。測試裡不要再抄任何座標數字——
// 上一版就是把公式算出來的值抄成期望值，所以魚整段游在草地上時測試照樣全綠。
const FISH_START = RIVER_FISH_RANGE.start;
const FISH_END = RIVER_FISH_RANGE.end;
const RIVER_NX = RIVER_PATH.map(([nx]) => nx);
const RIVER_NY = RIVER_PATH.map(([, ny]) => ny);
const NX_MIN = Math.min(...RIVER_NX), NX_MAX = Math.max(...RIVER_NX);
const NY_MIN = Math.min(...RIVER_NY), NY_MAX = Math.max(...RIVER_NY);
const inFishStretch = (v) => v >= FISH_START - 1e-12 && v <= FISH_END + 1e-12;

test('河流小魚固定四隻，且各自有不同的游動狀態', () => {
  const fish = createRiverFish();
  const { ctx, calls } = makeFakeCtx();
  const image = { id: 'river-fish', width: 1024, height: 1024 };
  drawRiverFish(ctx, fish, 1280, 720, 0, { riverFish: image });
  const draws = calls.filter(([name]) => name === 'drawImage').map(([, args]) => args);
  const dimensions = draws.map((args) => args.slice(7, 9));

  assert.equal(fish.length, 4);
  assert.equal(new Set(fish.map((item) => item.progress)).size, 4);
  assert.ok(fish.every((item) => inFishStretch(item.progress)));
  assert.equal(new Set(fish.map((item) => item.speed)).size, 4);
  assert.equal(new Set(fish.map((item) => item.phase)).size, 4);
  assert.ok(fish.every((item) => item.direction === 1 || item.direction === -1));
  assert.deepEqual(dimensions, [[36, 18], [40, 20], [44, 22], [48, 24]]);
  assert.ok(draws.every((args) => {
    assert.equal(args.length, 9);
    const [, sx, sy, sw, sh] = args;
    return Number.isFinite(sx) && Number.isFinite(sy) && Number.isFinite(sw) && Number.isFinite(sh)
      && sx >= 0 && sy >= 0 && sw > 0 && sh > 0 && sx + sw <= image.width && sy + sh <= image.height;
  }));
  assert.ok(draws.every((args) => {
    const [, sx, sy, sw, sh] = args;
    const epsilon = 1e-12;
    return Math.abs(sx - image.width * 0.20) <= epsilon
      && Math.abs(sy - image.height * 0.34) <= epsilon
      && Math.abs(sw - image.width * 0.60) <= epsilon
      && Math.abs(sh - image.height * 0.28) <= epsilon;
  }), '每隻魚都必須使用核准的 sprite crop 比例');
  assert.deepEqual(fish.map((item) => item.opacity), [0.58, 0.62, 0.66, 0.70]);
  assert.equal(new Set(fish.map((item) => item.opacity)).size, 4);
  assert.ok(fish.every((item) => item.opacity >= 0.58 && item.opacity <= 0.70));
});

test('河流小魚依河道切線旋轉，逆流魚先旋轉再鏡像', () => {
  const fish = createRiverFish();
  const { ctx, calls } = makeFakeCtx();
  const image = { id: 'river-fish', width: 1024, height: 1024 };

  drawRiverFish(ctx, fish, 1280, 720, 0, { riverFish: image });

  const rotations = calls.filter(([name]) => name === 'rotate').map(([, args]) => args[0]);
  assert.equal(rotations.length, 4);
  // 期望值由「河道路徑本身」推導：取前後兩點，換算成螢幕像素方向再取角度。
  // 不抄實作的算式——抄了就變成把實作重寫一次，實作錯了測試也跟著錯。
  const scaleFor = (w, h) => Math.max(w / 1672, h / 941);
  for (let i = 0; i < fish.length; i++) {
    const p = normalizeRiverFishProgress(fish[i].progress);
    const a = riverPoint(Math.max(FISH_START, p - 0.01));
    const b = riverPoint(Math.min(FISH_END, p + 0.01));
    const k = scaleFor(1280, 720);
    const expected = Math.atan2((b.ny - a.ny) * 941 * k, (b.nx - a.nx) * 1672 * k);
    assert.ok(Math.abs(rotations[i] - expected) < 1e-9,
      `第 ${i} 隻魚的角度 ${rotations[i]} 與河道實際走向 ${expected} 不符`);
  }

  const reverseIndex = fish.findIndex((item) => item.direction < 0);
  const translateIndices = calls.reduce((indices, [name], index) => {
    if (name === 'translate') indices.push(index);
    return indices;
  }, []);
  const reverseTranslate = translateIndices[reverseIndex];
  assert.ok(Number.isInteger(reverseTranslate));
  assert.equal(calls[reverseTranslate + 1][0], 'rotate');
  assert.equal(calls[reverseTranslate + 2][0], 'scale');
  assert.equal(calls[reverseTranslate + 2][1][0], -1);
});

test('河道控制點是照背景插畫量出來的那一組，換背景圖必須重量', () => {
  // 這是一組 golden 值。它守的是「有人改了河道座標卻沒重新對圖」——
  //
  // **它驗不到的事：這些座標到底有沒有對準畫上的河。**
  // 那件事只有把魚畫在背景上看才驗得出來。上一版的測試全綠，魚卻整段游在
  // 右岸草地上，就是因為當時的斷言只是把公式算出來的數字抄成期望值。
  // 改動河道之後請截圖確認，不要只看測試綠燈。
  assert.equal(RIVER_PATH.length, 10);
  assert.deepEqual(RIVER_PATH, [
    [0.493, 0.536, 0.0025],
    [0.515, 0.567, 0.0035],
    [0.538, 0.596, 0.0042],
    [0.555, 0.624, 0.0050],
    [0.568, 0.648, 0.0060],
    [0.580, 0.672, 0.0075],
    [0.609, 0.696, 0.0100],
    [0.640, 0.717, 0.0140],
    [0.671, 0.732, 0.0175],
    [0.703, 0.748, 0.0195],
  ]);
  // 河道必須單調往右下、且越下游越寬，否則魚會倒退或忽大忽小
  for (let i = 1; i < RIVER_PATH.length; i++) {
    assert.ok(RIVER_PATH[i][0] > RIVER_PATH[i - 1][0], `控制點 ${i} 沒有往右`);
    assert.ok(RIVER_PATH[i][1] > RIVER_PATH[i - 1][1], `控制點 ${i} 沒有往下`);
    assert.ok(RIVER_PATH[i][2] >= RIVER_PATH[i - 1][2], `控制點 ${i} 的河寬變窄了`);
  }
});

test('魚的活動河段落在河面最寬的下游，且整段都在河道帶內', () => {
  // 上游窄到螢幕上不足 10px，折線只要差幾像素魚就上岸；下游寬，容錯大。
  const startHalf = riverHalfWidth(FISH_START);
  const endHalf = riverHalfWidth(FISH_END);
  assert.ok(startHalf >= 0.008, `魚的上游端河寬只有 ${startHalf}，太窄`);
  assert.ok(endHalf > startHalf, '下游應該比上游寬');
  const fish = createRiverFish();
  for (let frame = 0; frame < 3000; frame++) {
    updateRiverFish(fish, 1 / 60);
    for (const item of fish) assert.ok(inFishStretch(item.progress));
  }
});

test('河道曲線的多個正規化點都落在河面範圍', () => {
  for (const progress of [0, 0.08, 0.2, 0.35, 0.5, 0.7, 0.85, 1]) {
    const { nx, ny } = riverPoint(progress);
    assert.ok(nx >= NX_MIN - 1e-9 && nx <= NX_MAX + 1e-9, `progress=${progress} 的 nx=${nx}`);
    assert.ok(ny >= NY_MIN - 1e-9 && ny <= NY_MAX + 1e-9, `progress=${progress} 的 ny=${ny}`);
  }
});

test('河流小魚長時間更新後仍保持有限狀態並貼著河道', () => {
  const fish = createRiverFish();

  for (let frame = 0; frame < 5000; frame++) updateRiverFish(fish, 0.05);

  for (const item of fish) {
    assert.ok(Number.isFinite(item.progress) && inFishStretch(item.progress));
    assert.ok(Number.isFinite(item.phase));
    const { nx, ny } = riverPoint(item.progress);
    assert.ok(nx >= riverPoint(FISH_START).nx - 1e-9 && nx <= riverPoint(FISH_END).nx + 1e-9);
    assert.ok(ny >= riverPoint(FISH_START).ny - 1e-9 && ny <= riverPoint(FISH_END).ny + 1e-9);
  }
});

test('魚游到河段兩端要折返，不能繞回另一端——繞回就是憑空消失又出現', () => {
  // 分頁被瀏覽器背景節流之後回來，一次 dt 可能跨過整段河，所以大步長也要正確折返。
  const forward = createRiverFish()[0];
  forward.progress = FISH_END - 0.01;
  forward.speed = 0.02;
  forward.direction = 1;
  updateRiverFish([forward], 1);
  assert.ok(inFishStretch(forward.progress), `折返後 ${forward.progress} 跑出河段`);
  assert.equal(forward.direction, -1, '撞到下游端點要轉頭往上游');
  assert.ok(forward.progress < FISH_END, '折返後不該還黏在端點');

  const reverse = createRiverFish()[1];
  reverse.progress = FISH_START + 0.01;
  reverse.speed = 0.02;
  reverse.direction = -1;
  updateRiverFish([reverse], 1);
  assert.ok(inFishStretch(reverse.progress));
  assert.equal(reverse.direction, 1, '撞到上游端點要轉頭往下游');
});

test('魚的位置永遠連續——長時間更新中不得出現任何瞬移', () => {
  // 這條是「不要憑空出現又消失」的直接守則。繞回式的實作會在端點跳一整段，
  // 這裡就會紅。
  const fish = createRiverFish();
  const dt = 1 / 60;
  let previous = fish.map((item) => item.progress);
  for (let frame = 0; frame < 20000; frame++) {
    updateRiverFish(fish, dt);
    fish.forEach((item, i) => {
      const moved = Math.abs(item.progress - previous[i]);
      // 一幀最多只能移動「速度 × dt」的量，折返時只會更小
      assert.ok(moved <= item.speed * dt + 1e-9,
        `第 ${frame} 幀第 ${i} 隻魚瞬移了 ${moved.toFixed(4)}`);
      previous[i] = item.progress;
    });
  }
});

test('注入的河岸／上游進度會被夾回河段，繪製也不接受', () => {
  assert.equal(normalizeRiverFishProgress(FISH_START), FISH_START);
  assert.equal(normalizeRiverFishProgress(FISH_END), FISH_END);
  // 夾住，不是繞回：超出下游端就停在下游端，不會跑到上游去
  assert.equal(normalizeRiverFishProgress(FISH_END + 0.2), FISH_END);
  assert.equal(normalizeRiverFishProgress(-0.05), FISH_START);
  assert.equal(normalizeRiverFishProgress(Number.NaN), FISH_START);

  const fish = createRiverFish();
  fish[0].progress = 0.05;
  fish[1].progress = 0.95;
  fish[0].phase = 0;
  fish[1].phase = 0;
  updateRiverFish(fish.slice(0, 2), 0);
  assert.ok(inFishStretch(fish[0].progress));
  assert.ok(inFishStretch(fish[1].progress));

  const { ctx, calls } = makeFakeCtx();
  const image = { id: 'river-fish', width: 1024, height: 1024 };
  drawRiverFish(ctx, fish.slice(0, 2), 1280, 720, 0, { riverFish: image });
  const translates = calls.filter(([name]) => name === 'translate').map(([, args]) => args);
  assert.equal(translates.length, 2);
  for (let i = 0; i < translates.length; i++) {
    const { ny } = riverPoint(normalizeRiverFishProgress(i === 0 ? 0.05 : 0.95));
    const scale = Math.max(1280 / 1672, 720 / 941);
    const expectedY = (720 - 941 * scale) / 2 + ny * 941 * scale;
    assert.ok(Math.abs(translates[i][1] - expectedY) < 1e-9);
    assert.ok(ny >= riverPoint(FISH_START).ny - 1e-9 && ny <= riverPoint(FISH_END).ny + 1e-9);
  }
});

test('繪製前會獨立把注入的越界進度夾回河段', () => {
  const fish = createRiverFish().slice(0, 2).map((item, index) => ({
    ...item,
    progress: index === 0 ? 0.05 : 0.95,
    phase: 0,
  }));
  const { ctx, calls } = makeFakeCtx();
  const image = { id: 'river-fish', width: 1024, height: 1024 };
  drawRiverFish(ctx, fish, 1280, 720, 0, { riverFish: image });
  const translates = calls.filter(([name]) => name === 'translate').map(([, args]) => args);
  assert.equal(translates.length, fish.length);

  const scale = Math.max(1280 / 1672, 720 / 941);
  for (let i = 0; i < fish.length; i++) {
    const progress = normalizeRiverFishProgress(fish[i].progress);
    const { ny } = riverPoint(progress);
    const expectedY = (720 - 941 * scale) / 2 + ny * 941 * scale;
    assert.ok(ny >= riverPoint(FISH_START).ny - 1e-9 && ny <= riverPoint(FISH_END).ny + 1e-9);
    assert.ok(Math.abs(translates[i][1] - expectedY) < 1e-9);
  }
});

test('河流小魚在缺素材、假的與受限 ctx 上繪製都安全', () => {
  const fish = createRiverFish();
  const { ctx } = makeFakeCtx();
  const image = { id: 'river-fish', width: 1024, height: 1024 };
  const restrictedCtx = { save() {}, restore() {}, translate() {}, scale() {}, drawImage() { throw new Error('draw failed'); } };

  assert.doesNotThrow(() => drawRiverFish(ctx, fish, 1280, 720, 1.2));
  assert.doesNotThrow(() => drawRiverFish({}, fish, 1280, 720, 1.2, { riverFish: image }));
  assert.doesNotThrow(() => drawRiverFish(ctx, fish, 1280, 720, 1.2, { riverFish: image }));
  assert.doesNotThrow(() => drawRiverFish(restrictedCtx, fish, 1280, 720, 1.2, { riverFish: image }));

  const invalid = makeFakeCtx();
  assert.doesNotThrow(() => drawRiverFish(invalid.ctx, fish, 1280, 720, 1.2, {
    riverFish: { id: 'invalid-fish', width: 0, height: 1024 },
  }));
  assert.equal(invalid.calls.length, 0);
});

test('河流小魚的 ctx capability getter 拋錯時會安全略過', () => {
  const fish = createRiverFish();
  const throwingSave = new Proxy({}, {
    get(_, property) {
      if (property === 'save') throw new Error('save getter failed');
      return () => {};
    },
  });
  const throwingDrawImage = new Proxy({}, {
    get(_, property) {
      if (property === 'drawImage') throw new Error('drawImage getter failed');
      return () => {};
    },
  });
  const throwingRotateGetter = new Proxy({}, {
    get(_, property) {
      if (property === 'rotate') throw new Error('rotate getter failed');
      return () => {};
    },
  });
  const images = { riverFish: { id: 'river-fish', width: 1024, height: 1024 } };

  assert.doesNotThrow(() => drawRiverFish(throwingSave, fish, 1280, 720, 1.2, images));
  assert.doesNotThrow(() => drawRiverFish(throwingDrawImage, fish, 1280, 720, 1.2, images));
  assert.doesNotThrow(() => drawRiverFish(throwingRotateGetter, fish, 1280, 720, 1.2, images));

  const rotateCalls = [];
  const throwingRotateMethod = {
    save() { rotateCalls.push('save'); },
    restore() { rotateCalls.push('restore'); },
    translate() { rotateCalls.push('translate'); },
    rotate() { rotateCalls.push('rotate'); throw new Error('rotate method failed'); },
    scale() { rotateCalls.push('scale'); },
    drawImage() { rotateCalls.push('drawImage'); },
  };
  assert.doesNotThrow(() => drawRiverFish(throwingRotateMethod, fish, 1280, 720, 1.2, images));
  assert.equal(rotateCalls.includes('drawImage'), false);
});

test('河流小魚素材 getter 拋錯時安全略過且不繪製', () => {
  const fish = createRiverFish();
  const { ctx, calls } = makeFakeCtx();
  const images = new Proxy({}, {
    get(_target, property) {
      if (property === 'riverFish') throw new Error('unavailable image');
      return undefined;
    },
  });

  assert.doesNotThrow(() => drawRiverFish(ctx, fish, 1280, 720, 3, images));
  assert.equal(calls.length, 0);
});

test('河流小魚在 resize 後仍用 coverPoint 對齊同一條河道', () => {
  const fish = createRiverFish();
  fish.forEach((item) => { item.phase = 0; });
  const image = { id: 'river-fish', width: 1024, height: 1024 };
  const first = makeFakeCtx();
  const second = makeFakeCtx();

  drawRiverFish(first.ctx, fish, 1280, 720, 0, { riverFish: image });
  drawRiverFish(second.ctx, fish, 720, 1280, 0, { riverFish: image });

  const translatedAt = (calls, w, h) => calls.filter(([name]) => name === 'translate').map(([, [x, y]], index) => {
    const { nx, ny } = riverPoint(fish[index].progress);
    const iw = 1672;
    const ih = 941;
    const scale = Math.max(w / iw, h / ih);
    return { x, y, expectedX: (w - iw * scale) / 2 + nx * iw * scale, expectedY: (h - ih * scale) / 2 + ny * ih * scale };
  });

  const landscape = translatedAt(first.calls, 1280, 720);
  const portrait = translatedAt(second.calls, 720, 1280);
  assert.equal(landscape.length, fish.length);
  assert.equal(portrait.length, fish.length);
  assert.ok(1280 / 941 > 720 / 1672, 'portrait viewport 必須覆蓋高度主導的 cover 分支');

  for (const point of [...landscape, ...portrait]) {
    assert.ok(Math.abs(point.x - point.expectedX) < 1e-9);
    assert.ok(Math.abs(point.y - point.expectedY) < 1e-9);
  }
});

test('河流魚 Image 2 素材存在、非空且是有效 PNG', () => {
  const asset = fs.readFileSync(path.join(__dirname, '..', 'assets', 'fish', 'river-fish-swimming.png'));

  assert.ok(asset.length > 24);
  assert.equal(asset.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(asset.subarray(12, 16).toString('ascii'), 'IHDR');
  assert.ok(asset.readUInt32BE(16) > 0);
  assert.ok(asset.readUInt32BE(20) > 0);
});

test('河流小魚繪製各有一個淡漣漪，且缺失或失敗的漣漪 API 不會破壞 frame', () => {
  const fish = createRiverFish();
  const image = { id: 'river-fish', width: 1024, height: 1024 };
  const complete = makeFakeCtx();

  drawRiverFish(complete.ctx, fish, 1280, 720, 2, { riverFish: image });
  for (const method of ['drawImage', 'ellipse', 'stroke']) {
    assert.equal(complete.calls.filter(([name]) => name === method).length, 4, `${method} 必須每隻各一次`);
  }
  assert.equal(complete.calls.filter(([name]) => name === 'save').length, 4);
  assert.equal(complete.calls.filter(([name]) => name === 'restore').length, 4);

  const limitedCalls = [];
  const noRippleCtx = {
    save() { limitedCalls.push('save'); }, restore() { limitedCalls.push('restore'); },
    translate() {}, scale() {}, drawImage() {},
  };
  assert.doesNotThrow(() => drawRiverFish(noRippleCtx, fish, 1280, 720, 2, { riverFish: image }));
  assert.equal(limitedCalls.filter((name) => name === 'save').length, limitedCalls.filter((name) => name === 'restore').length);

  const throwingRippleCalls = [];
  const throwingRippleCtx = new Proxy({
    save() { throwingRippleCalls.push('save'); }, restore() { throwingRippleCalls.push('restore'); },
    translate() {}, scale() {}, drawImage() {}, beginPath() {}, stroke() {},
  }, {
    get(target, property) {
      if (property === 'ellipse') throw new Error('ellipse unavailable');
      return target[property];
    },
  });
  assert.doesNotThrow(() => drawRiverFish(throwingRippleCtx, fish, 1280, 720, 2, { riverFish: image }));
  assert.equal(throwingRippleCalls.filter((name) => name === 'save').length, throwingRippleCalls.filter((name) => name === 'restore').length);
});
