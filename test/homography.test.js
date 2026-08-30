const { test } = require('node:test');
const assert = require('node:assert/strict');
const { computeHomography, invertHomography, applyHomography } = require('../src/homography.js');

function assertClose(actual, expected, tol, msg) {
  assert.ok(Math.abs(actual - expected) < tol, `${msg}: got ${actual}, expected ~${expected}`);
}

test('identity mapping: 同一組四點對應到自己，套用後應不變', () => {
  const pts = [[0, 0], [100, 0], [100, 100], [0, 100]];
  const H = computeHomography(pts, pts);
  for (const [x, y] of pts) {
    const [X, Y] = applyHomography(H, x, y);
    assertClose(X, x, 1e-6, 'x');
    assertClose(Y, y, 1e-6, 'y');
  }
});

test('平移＋縮放：四個角點套用後落在預期的矩形角落', () => {
  const src = [[0, 0], [10, 0], [10, 10], [0, 10]];
  const dst = [[5, 5], [25, 5], [25, 25], [5, 25]]; // 放大 2 倍再平移 (5,5)
  const H = computeHomography(src, dst);
  for (let i = 0; i < 4; i++) {
    const [X, Y] = applyHomography(H, src[i][0], src[i][1]);
    assertClose(X, dst[i][0], 1e-6, `point ${i} x`);
    assertClose(Y, dst[i][1], 1e-6, `point ${i} y`);
  }
});

test('透視變形：任意四邊形對應到標準矩形，來回都要對得回去', () => {
  const dstCanonical = [[0, 0], [800, 0], [800, 600], [0, 600]];
  // 模擬攝影機斜看紙張看到的四邊形（不是正矩形）
  const srcCamera = [[60, 40], [590, 15], [610, 470], [30, 455]];

  const H = computeHomography(srcCamera, dstCanonical); // camera -> canonical
  for (let i = 0; i < 4; i++) {
    const [X, Y] = applyHomography(H, srcCamera[i][0], srcCamera[i][1]);
    assertClose(X, dstCanonical[i][0], 1e-3, `camera->canonical point ${i} x`);
    assertClose(Y, dstCanonical[i][1], 1e-3, `camera->canonical point ${i} y`);
  }

  const invH = invertHomography(H); // canonical -> camera，warp 取樣時要用這個方向
  for (let i = 0; i < 4; i++) {
    const [x, y] = applyHomography(invH, dstCanonical[i][0], dstCanonical[i][1]);
    assertClose(x, srcCamera[i][0], 1e-3, `canonical->camera point ${i} x`);
    assertClose(y, srcCamera[i][1], 1e-3, `canonical->camera point ${i} y`);
  }
});

test('中心點也要映射到中心附近（不是只有角點對，中間跟著歪掉）', () => {
  const dstCanonical = [[0, 0], [800, 0], [800, 600], [0, 600]];
  const srcCamera = [[60, 40], [590, 15], [610, 470], [30, 455]];
  const H = computeHomography(srcCamera, dstCanonical);
  const cameraCenterX = (60 + 590 + 610 + 30) / 4;
  const cameraCenterY = (40 + 15 + 470 + 455) / 4;
  const [X, Y] = applyHomography(H, cameraCenterX, cameraCenterY);
  assert.ok(X > 300 && X < 500, `center X should land near canonical middle, got ${X}`);
  assert.ok(Y > 200 && Y < 400, `center Y should land near canonical middle, got ${Y}`);
});

test('共線的四點求不出解，要丟錯誤而不是回傳垃圾矩陣', () => {
  const collinear = [[0, 0], [1, 1], [2, 2], [3, 3]];
  const dst = [[0, 0], [100, 0], [100, 100], [0, 100]];
  assert.throws(() => computeHomography(collinear, dst));
});
