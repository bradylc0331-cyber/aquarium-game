const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  CANVAS_W, CANVAS_H, WORK_AREA, MARKER_CANONICAL, MARKER_SIZE, QR_AREA, PRINT_MM_PER_PX,
} = require('../src/constants.js');

test('完整校正畫布是 A4 橫式比例，列印寬度為 297mm', () => {
  assert.ok(Math.abs(CANVAS_W / CANVAS_H - 297 / 210) < 0.003);
  assert.ok(Math.abs(CANVAS_W * PRINT_MM_PER_PX - 297) < 0.01);
  assert.ok(Math.abs(CANVAS_H * PRINT_MM_PER_PX - 210) < 0.2);
});

test('四個定位方塊、QR 與 4:3 人物區都完整位於 A4 內', () => {
  const half = MARKER_SIZE / 2;
  for (const [x, y] of Object.values(MARKER_CANONICAL)) {
    assert.ok(x - half >= 0 && x + half <= CANVAS_W);
    assert.ok(y - half >= 0 && y + half <= CANVAS_H);
  }
  assert.ok(QR_AREA.x >= 0 && QR_AREA.y >= 0);
  assert.ok(QR_AREA.x + QR_AREA.size <= CANVAS_W && QR_AREA.y + QR_AREA.size <= CANVAS_H);
  assert.equal((WORK_AREA.x1 - WORK_AREA.x0) / (WORK_AREA.y1 - WORK_AREA.y0), 4 / 3);
  assert.ok(QR_AREA.y + QR_AREA.size < WORK_AREA.y0, 'QR 不可壓到人物塗色區');
});
