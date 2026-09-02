const { test } = require('node:test');
const assert = require('node:assert/strict');
const { detectCorners } = require('../src/markerDetect.js');

// 純資料物件即可，detectCorners 只用得到 width/height/data，不需要真的 DOM ImageData
function makeWhiteImage(width, height) {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  return { width, height, data };
}

function drawBlackSquare(image, cx, cy, size) {
  const half = size / 2;
  for (let y = Math.round(cy - half); y < Math.round(cy + half); y++) {
    for (let x = Math.round(cx - half); x < Math.round(cx + half); x++) {
      if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue;
      const i = (y * image.width + x) * 4;
      image.data[i] = 0; image.data[i + 1] = 0; image.data[i + 2] = 0; image.data[i + 3] = 255;
    }
  }
}

test('四個角都印了黑方塊時，抓到的重心要接近方塊中心', () => {
  const W = 800, H = 600;
  const img = makeWhiteImage(W, H);
  const expected = { tl: [60, 60], tr: [W - 60, 60], br: [W - 60, H - 60], bl: [60, H - 60] };
  for (const [x, y] of Object.values(expected)) drawBlackSquare(img, x, y, 50);

  const corners = detectCorners(img, { threshold: 90 });
  assert.ok(corners, '應該要偵測到全部四個角');
  for (const key of ['tl', 'tr', 'br', 'bl']) {
    const [x, y] = corners[key];
    const [ex, ey] = expected[key];
    assert.ok(Math.abs(x - ex) < 3, `${key} x got ${x} expected ~${ex}`);
    assert.ok(Math.abs(y - ey) < 3, `${key} y got ${y} expected ~${ey}`);
  }
});

test('缺一個角時要回傳 null，不能給假座標', () => {
  const W = 800, H = 600;
  const img = makeWhiteImage(W, H);
  drawBlackSquare(img, 60, 60, 50);
  drawBlackSquare(img, W - 60, 60, 50);
  drawBlackSquare(img, W - 60, H - 60, 50);
  // 故意不畫 bl
  const corners = detectCorners(img, { threshold: 90 });
  assert.equal(corners, null);
});

test('畫面中央出現大片深色（例如小朋友的手影）不該被誤認成角落標記', () => {
  const W = 800, H = 600;
  const img = makeWhiteImage(W, H);
  const expected = { tl: [60, 60], tr: [W - 60, 60], br: [W - 60, H - 60], bl: [60, H - 60] };
  for (const [x, y] of Object.values(expected)) drawBlackSquare(img, x, y, 50);
  // 中央一大片深色，離四個搜尋窗都夠遠，不該干擾偵測
  drawBlackSquare(img, W / 2, H / 2, 120);

  const corners = detectCorners(img, { threshold: 90 });
  assert.ok(corners);
  for (const key of ['tl', 'tr', 'br', 'bl']) {
    const [x, y] = corners[key];
    const [ex, ey] = expected[key];
    assert.ok(Math.abs(x - ex) < 3 && Math.abs(y - ey) < 3, `${key} got [${x},${y}]`);
  }
});

test('深色的塗色跑進搜尋窗時，要抓靠角落的黑方塊，不是抓最大的那塊', () => {
  // 2026-09-02 實機：大衛那張紙塗得又深又滿（紫上衣、深綠裙），
  // 右下搜尋窗裡衣服的色塊比 10mm 的黑方塊大得多，於是被當成角點，
  // 右下角被判在 (367, 298)——畫面正中央——拉正後整張圖扭曲變形。
  //
  // 挑「最大的深色塊」這個規則對淺色鉛筆稿沒事，但塗得濃的作品必然踩到。
  // 角標是印在紙的四個角上的，所以要挑**最靠角落**的那一塊。
  const W = 640, H = 480;
  const img = makeWhiteImage(W, H);
  const expected = { tl: [61, 46], tr: [621, 52], br: [620, 430], bl: [66, 436] };
  for (const [x, y] of Object.values(expected)) drawBlackSquare(img, x, y, 20);
  // 小朋友塗的深色衣服，落在右下搜尋窗內、面積是黑方塊的十幾倍
  drawBlackSquare(img, 367, 298, 70);

  const corners = detectCorners(img, { threshold: 90, windowFrac: 0.46 });
  assert.ok(corners, '四個角都在，不該回 null');
  for (const key of ['tl', 'tr', 'br', 'bl']) {
    const [x, y] = corners[key];
    const [ex, ey] = expected[key];
    assert.ok(Math.abs(x - ex) < 3 && Math.abs(y - ey) < 3,
      `${key} 抓到 [${x.toFixed(0)}, ${y.toFixed(0)}]，應該是 [${ex}, ${ey}]`);
  }
});

test('四個角都被濃塗色包圍時也要挑對——四個象限各放一塊大色塊', () => {
  const W = 640, H = 480;
  const img = makeWhiteImage(W, H);
  const expected = { tl: [61, 46], tr: [621, 52], br: [620, 430], bl: [66, 436] };
  for (const [x, y] of Object.values(expected)) drawBlackSquare(img, x, y, 20);
  for (const [x, y] of [[220, 180], [430, 175], [400, 300], [230, 310]]) drawBlackSquare(img, x, y, 60);

  const corners = detectCorners(img, { threshold: 90, windowFrac: 0.46 });
  assert.ok(corners);
  for (const key of ['tl', 'tr', 'br', 'bl']) {
    const [x, y] = corners[key];
    const [ex, ey] = expected[key];
    assert.ok(Math.abs(x - ex) < 3 && Math.abs(y - ey) < 3,
      `${key} 抓到 [${x.toFixed(0)}, ${y.toFixed(0)}]，應該是 [${ex}, ${ey}]`);
  }
});
