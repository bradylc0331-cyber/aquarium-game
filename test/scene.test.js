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
  updateSheepFlock,
  createBirdFlock,
  updateBirdFlock,
  rasterizeRuntimeSprite,
  drawSheep,
  drawBirdFlock,
  riverPoint,
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

test('河流小魚固定四隻，且各自有不同的游動狀態', () => {
  const fish = createRiverFish();

  assert.equal(fish.length, 4);
  assert.equal(new Set(fish.map((item) => item.progress)).size, 4);
  assert.equal(new Set(fish.map((item) => item.speed)).size, 4);
  assert.equal(new Set(fish.map((item) => item.phase)).size, 4);
  assert.ok(fish.every((item) => item.direction === 1 || item.direction === -1));
});

test('河道曲線的多個正規化點都落在河面範圍', () => {
  for (const progress of [0, 0.08, 0.2, 0.35, 0.5, 0.7, 0.85, 1]) {
    const { nx, ny } = riverPoint(progress);
    assert.ok(nx >= 0.54 && nx <= 0.71, `progress=${progress} 的 nx=${nx}`);
    assert.ok(ny >= 0.505 && ny <= 0.75, `progress=${progress} 的 ny=${ny}`);
  }
});

test('河流小魚長時間更新後仍保持有限狀態並貼著河道', () => {
  const fish = createRiverFish();

  for (let frame = 0; frame < 5000; frame++) updateRiverFish(fish, 0.05);

  for (const item of fish) {
    assert.ok(Number.isFinite(item.progress) && item.progress >= 0 && item.progress < 1);
    assert.ok(Number.isFinite(item.phase));
    const { nx, ny } = riverPoint(item.progress);
    assert.ok(nx >= 0.54 && nx <= 0.71);
    assert.ok(ny >= 0.505 && ny <= 0.75);
  }
});

test('河流小魚在缺素材、假的與受限 ctx 上繪製都安全', () => {
  const fish = createRiverFish();
  const { ctx } = makeFakeCtx();
  const restrictedCtx = { save() {}, restore() {}, translate() {}, scale() {}, drawImage() { throw new Error('draw failed'); } };

  assert.doesNotThrow(() => drawRiverFish(ctx, fish, 1280, 720, 1.2));
  assert.doesNotThrow(() => drawRiverFish({}, fish, 1280, 720, 1.2, { riverFish: { id: 'river-fish' } }));
  assert.doesNotThrow(() => drawRiverFish(ctx, fish, 1280, 720, 1.2, { riverFish: { id: 'river-fish' } }));
  assert.doesNotThrow(() => drawRiverFish(restrictedCtx, fish, 1280, 720, 1.2, { riverFish: { id: 'river-fish' } }));
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
  const images = { riverFish: { id: 'river-fish' } };

  assert.doesNotThrow(() => drawRiverFish(throwingSave, fish, 1280, 720, 1.2, images));
  assert.doesNotThrow(() => drawRiverFish(throwingDrawImage, fish, 1280, 720, 1.2, images));
});
