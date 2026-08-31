const { test } = require('node:test');
const assert = require('node:assert/strict');
const { applyMaskToImageData, boundingBoxOfAlpha, cropImageData, solidColorImageData } = require('../src/extract.js');

function makeImage(width, height, fillFn) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = fillFn(x, y);
      const i = (y * width + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
    }
  }
  return { width, height, data };
}

test('applyMaskToImageData：遮罩白色區塊變成不透明，黑色背景變成全透明', () => {
  const color = solidColorImageData(4, 4, [200, 50, 50]);
  const mask = makeImage(4, 4, (x, y) => (x < 2 ? [255, 255, 255, 255] : [0, 0, 0, 255]));
  const out = applyMaskToImageData(color, mask);
  const idxOpaque = (0 * 4 + 0) * 4;
  const idxTransparent = (0 * 4 + 2) * 4;
  assert.equal(out.data[idxOpaque + 3], 255);
  assert.equal(out.data[idxTransparent + 3], 0);
  assert.equal(out.data[idxOpaque], 200, '顏色要來自 color 影像，不是遮罩');
});

test('boundingBoxOfAlpha：抓得到不透明像素構成的最小外框', () => {
  const img = makeImage(10, 10, (x, y) => (x >= 3 && x <= 5 && y >= 2 && y <= 4 ? [1, 1, 1, 255] : [0, 0, 0, 0]));
  const box = boundingBoxOfAlpha(img);
  assert.deepEqual(box, { x: 3, y: 2, width: 3, height: 3 });
});

test('boundingBoxOfAlpha：整張透明時回傳 null，不能假裝找到框', () => {
  const img = makeImage(5, 5, () => [0, 0, 0, 0]);
  assert.equal(boundingBoxOfAlpha(img), null);
});

test('cropImageData：裁出來的內容跟原圖對應像素一致', () => {
  const img = makeImage(6, 6, (x, y) => [x * 10, y * 10, 0, 255]);
  const cropped = cropImageData(img, { x: 2, y: 1, width: 2, height: 2 });
  assert.equal(cropped.width, 2);
  assert.equal(cropped.height, 2);
  // 裁出來左上角應該對應原圖 (2,1)
  assert.equal(cropped.data[0], 20);
  assert.equal(cropped.data[1], 10);
});

const { assessExtraction } = require('../src/extract.js');

test('空白的去背結果不得送入場景', () => {
  const blank = makeImage(100, 100, () => [255, 255, 255, 0]);
  assert.deepEqual(assessExtraction(blank), { ok: false, reason: 'empty' });
});

test('人物太小或不完整不得送入場景', () => {
  // 只有中央幾個像素：孩子還沒塗，或紙沒對準
  const tiny = makeImage(100, 100, (x, y) => (x >= 48 && x <= 51 && y >= 48 && y <= 51)
    ? [10, 10, 10, 255] : [255, 255, 255, 0]);
  assert.deepEqual(assessExtraction(tiny), { ok: false, reason: 'too-small' });

  // 面積夠但高度不足（例如只掃到腳）——人物不完整，一樣要擋
  const shortStrip = makeImage(100, 100, (x, y) => (y >= 70 && y <= 90)
    ? [10, 10, 10, 255] : [255, 255, 255, 0]);
  assert.equal(assessExtraction(shortStrip).ok, false);
  assert.equal(assessExtraction(shortStrip).reason, 'too-small');
});

test('整片白紙背景被當成人物時要擋下來', () => {
  // 遮罩沒對準，整張紙都變成不透明——送進場景會是一大塊白色方塊
  const wholePaper = makeImage(100, 100, () => [250, 250, 250, 255]);
  assert.deepEqual(assessExtraction(wholePaper), { ok: false, reason: 'paper-background' });
});

test('正常人物通過，並回傳可直接裁切的外框', () => {
  const person = makeImage(100, 100, (x, y) => (x >= 25 && x <= 74 && y >= 10 && y <= 94)
    ? [180, 80, 40, 255] : [255, 255, 255, 0]);
  const quality = assessExtraction(person);

  assert.equal(quality.ok, true);
  assert.deepEqual(quality.box, { x: 25, y: 10, width: 50, height: 85 });
});

test('assessExtraction 不改動輸入影像', () => {
  const person = makeImage(60, 60, (x, y) => (x >= 15 && x <= 44 && y >= 5 && y <= 55)
    ? [1, 2, 3, 255] : [0, 0, 0, 0]);
  const before = Uint8ClampedArray.from(person.data);
  assessExtraction(person);
  assert.deepEqual(person.data, before);
});
