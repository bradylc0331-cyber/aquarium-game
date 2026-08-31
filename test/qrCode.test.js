const { test } = require('node:test');
const assert = require('node:assert/strict');
const { matrixForText, identify, SIZE, QUIET } = require('../src/qrCode.js');

test('七種人物 QR 都是不同的 21x21 Version 1 圖樣', () => {
  const ids = ['NOAH', 'MOSES', 'DAVID', 'DANIEL', 'JONAH', 'SHEPHERD', 'ANGEL'];
  const serialized = ids.map((id) => JSON.stringify(matrixForText(`BIBLE:${id}`)));
  assert.equal(new Set(serialized).size, ids.length);
  for (const value of serialized) assert.equal(JSON.parse(value).length, SIZE);
});

test('從校正後的模擬照片可比對出人物 QR', () => {
  const area = { x: 20, y: 10, size: 116 };
  const width = 160, height = 140;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  const matrix = matrixForText('BIBLE:JONAH');
  const total = SIZE + QUIET * 2;
  const moduleSize = area.size / total;
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      if (!matrix[row][col]) continue;
      const x0 = Math.floor(area.x + (col + QUIET) * moduleSize);
      const y0 = Math.floor(area.y + (row + QUIET) * moduleSize);
      const x1 = Math.ceil(area.x + (col + QUIET + 1) * moduleSize);
      const y1 = Math.ceil(area.y + (row + QUIET + 1) * moduleSize);
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = (y * width + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = 12;
      }
    }
  }
  const result = identify({ width, height, data }, area, [
    { id: 'noah', text: 'BIBLE:NOAH' },
    { id: 'jonah', text: 'BIBLE:JONAH' },
    { id: 'angel', text: 'BIBLE:ANGEL' },
  ]);
  assert.ok(result);
  assert.equal(result.id, 'jonah');
  assert.ok(result.score < 0.05);
});
