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
