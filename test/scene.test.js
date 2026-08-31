const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createBubbles, updateBubbles, drawBubbles, drawBackground, drawForeground } = require('../src/scene.js');

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

const {
  createSheep, updateSheep, gustStrength, drawSheep, drawCanopySway,
} = require('../src/scene.js');

test('羊會在走動與吃草之間切換，且永遠不走出草地', () => {
  const sheep = createSheep(1600, 900, () => 0.5);
  const startMode = sheep.mode;
  sheep.modeTime = 0.01;
  updateSheep(sheep, 0.02, 1600, 900, [], () => 0.5);
  assert.notEqual(sheep.mode, startMode, 'modeTime 到了就該在走動與吃草之間切換');
  assert.ok(['walking', 'grazing'].includes(sheep.mode));

  // 長時間跑下來仍要留在可行走的草地範圍內，不會走出畫面
  for (let i = 0; i < 2000; i++) updateSheep(sheep, 0.016, 1600, 900, [], () => 0.5);
  assert.ok(sheep.x >= 1600 * 0.04 && sheep.x <= 1600 * 0.96, `羊走到 x=${sheep.x}`);
  assert.ok(sheep.baseY >= 900 * 0.45 && sheep.baseY <= 900 * 0.91);
});

test('羊碰到角色會轉向，不會穿過角色', () => {
  const sheep = createSheep(1600, 900, () => 0.5);
  sheep.mode = 'walking';
  sheep.modeTime = 999;
  sheep.direction = 1;
  const blocker = { x: sheep.x + 6, baseY: sheep.baseY, width: 120, height: 240 };

  updateSheep(sheep, 0.016, 1600, 900, [blocker], () => 0.5);

  assert.equal(sheep.direction, -1, '前方有角色時應該轉向');
});

test('陣風強度平滑且限制在 0 到 1', () => {
  let previous = gustStrength(0);
  for (let t = 0; t < 60; t += 0.05) {
    const strength = gustStrength(t);
    assert.ok(strength >= 0 && strength <= 1, `t=${t} 時強度 ${strength} 超出範圍`);
    assert.ok(Math.abs(strength - previous) < 0.1, `t=${t} 時陣風跳變太劇烈`);
    previous = strength;
  }
});

test('羊的走動與吃草兩種姿態都畫得出來', () => {
  const { ctx } = makeFakeCtx();
  const sheep = createSheep(1600, 900, () => 0.5);
  assert.doesNotThrow(() => drawSheep(ctx, sheep, 1));
  sheep.mode = 'grazing';
  assert.doesNotThrow(() => drawSheep(ctx, sheep, 2));
});

test('羊要看得出是羊：四條腿、離開身體的頭、蓬鬆的毛邊', () => {
  // 之前的版本是「一個光滑橢圓 + 貼在邊上的深色團塊 + 兩根短刺」，在草地上
  // 遠看就是一顆白蛋。這裡把三個讓牠讀得出是羊的特徵釘住。
  const { ctx, calls } = makeFakeCtx();
  const sheep = createSheep(1600, 900, () => 0.5);
  sheep.mode = 'walking';
  drawSheep(ctx, sheep, 1, 900);

  // 1. 毛邊要蓬鬆：用一圈二次曲線鼓出來，不是一個光滑橢圓。
  const curves = calls.filter(([op]) => op === 'quadraticCurveTo').length;
  assert.ok(curves >= 8, `羊毛輪廓要由多段曲線構成才蓬鬆（實際 ${curves} 段）`);

  // 2. 四條腿，而且要有長度——短到看不見等於沒有。腿是「畫到地面（y=0）」的線段，
  //    脖子則是從身體畫到頭，用終點高度分得開。
  const segments = [];
  for (let i = 0; i < calls.length - 1; i++) {
    if (calls[i][0] === 'moveTo' && calls[i + 1][0] === 'lineTo') {
      const [x0, y0] = calls[i][1];
      const [x1, y1] = calls[i + 1][1];
      segments.push({ x1, y1, length: Math.hypot(x1 - x0, y1 - y0) });
    }
  }
  const legs = segments.filter((seg) => Math.abs(seg.y1) < 1e-9 && seg.length >= 8);
  assert.equal(legs.length, 4, `要有四條看得見、踩到地面的腿（實際 ${legs.length} 條）`);

  // 脖子：頭要用一段脖子接在身體上，不是直接黏在身體邊緣。
  const neck = segments.filter((seg) => Math.abs(seg.y1) >= 1e-9 && seg.length >= 5);
  assert.equal(neck.length, 1, `頭要用一段脖子接上（實際 ${neck.length} 段）`);

  // 3. 頭要離開身體：頭的圓心必須在身體橢圓的水平半徑之外，
  //    否則整團連在一起，讀不出哪裡是頭。
  const ellipses = calls.filter(([op]) => op === 'ellipse').map(([, a]) => a);
  const body = ellipses.find((a) => a[2] >= 15 && a[3] >= 5 && a[3] <= 10); // 影子
  assert.ok(body, '前提：找得到地面陰影，代表參數順序沒變');
  const head = ellipses.find((a) => a[0] > 26 && a[2] >= 6 && a[2] <= 9);
  assert.ok(head, `頭要畫在身體水平半徑（26）之外，實際的橢圓：${JSON.stringify(ellipses.map((a) => a.slice(0, 4)))}`);
});

test('吃草時頭要伸到身體前方的地面，不是縮在肚子底下', () => {
  const { ctx, calls } = makeFakeCtx();
  const sheep = createSheep(1600, 900, () => 0.5);
  sheep.mode = 'grazing';
  drawSheep(ctx, sheep, 1, 900);

  // 頭（半徑 7.5 x 9.5 的那個橢圓）要同時在身體前方、而且靠近地面（y 接近 0）。
  const head = calls
    .filter(([op]) => op === 'ellipse')
    .map(([, a]) => a)
    .find((a) => Math.abs(a[2] - 7.5) < 0.01);
  assert.ok(head, '找不到頭部橢圓');
  assert.ok(head[0] > 26, `吃草時頭要在身體前方（x=${head[0]}）`);
  assert.ok(head[1] > -15, `吃草時頭要靠近地面（y=${head[1]}，地面是 0）`);
});

test('樹冠微風覆層畫得出來', () => {
  const { ctx } = makeFakeCtx();
  assert.doesNotThrow(() => drawCanopySway(ctx, 1600, 900, 2));
});
