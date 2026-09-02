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

// 以下三條用**產品真正的幾何**：校正後畫布 800x566、QR_AREA 70px。
// 29 個模組擠在 70px 裡＝每個模組只有 2.41px。上面那條舊測試用的是 116px
// （4px/模組），比產品寬鬆，量不到真實régime 下的行為。
const { CANVAS_W, CANVAS_H, QR_AREA } = require('../src/constants.js');

const ENTRIES = ['noah', 'moses', 'david', 'daniel', 'jonah', 'shepherd', 'angel']
  .map((id) => ({ id, text: `BIBLE:${id.toUpperCase()}` }));

// 把某個人物的 QR 畫進校正後畫布，並整體平移 (offsetX, offsetY) 像素。
// 平移就是在模擬「四角偵測有誤差」——角點偏一點，拉正後的取樣格線就整個錯位。
function canonicalSheetWithQr(id, offsetX = 0, offsetY = 0) {
  const data = new Uint8ClampedArray(CANVAS_W * CANVAS_H * 4).fill(255);
  const matrix = matrixForText(`BIBLE:${id.toUpperCase()}`);
  const total = SIZE + QUIET * 2;
  const moduleSize = QR_AREA.size / total;
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      if (!matrix[row][col]) continue;
      const x0 = QR_AREA.x + offsetX + (col + QUIET) * moduleSize;
      const y0 = QR_AREA.y + offsetY + (row + QUIET) * moduleSize;
      for (let y = Math.floor(y0); y < Math.ceil(y0 + moduleSize); y++) {
        for (let x = Math.floor(x0); x < Math.ceil(x0 + moduleSize); x++) {
          if (x < 0 || y < 0 || x >= CANVAS_W || y >= CANVAS_H) continue;
          const i = (y * CANVAS_W + x) * 4;
          data[i] = data[i + 1] = data[i + 2] = 12;
        }
      }
    }
  }
  return { width: CANVAS_W, height: CANVAS_H, data };
}

test('產品幾何（QR 只有 70px、每模組 2.41px）下七位人物都認得出來', () => {
  for (const entry of ENTRIES) {
    const result = identify(canonicalSheetWithQr(entry.id), QR_AREA, ENTRIES);
    assert.ok(result, `${entry.id} 讀不到`);
    assert.equal(result.id, entry.id);
  }
});

test('取樣格線錯位一個模組以內仍要讀得出來——四角偵測本來就有誤差', () => {
  // 為什麼需要這條：這個解碼器是照固定位置取樣的，不找定位圖案。
  // 實測（720p、模糊+雜訊）相機畫面裡的角點只要偏 2px，拉正後就錯位約 0.6 個
  // 模組，原本的實作從 22/28 掉到 8/28（±3px）。角點是黑方塊的 flood-fill 形心，
  // 現場的陰影、反光、紙沒攤平都很容易造成這種誤差。
  //
  // 每個模組 2.41px，所以 ±2.4px 就是整整一個模組。
  for (const offset of [-2.4, -1.8, -1.2, -0.6, 0.6, 1.2, 1.8, 2.4]) {
    for (const [dx, dy] of [[offset, 0], [0, offset], [offset, offset]]) {
      const result = identify(canonicalSheetWithQr('jonah', dx, dy), QR_AREA, ENTRIES);
      assert.ok(result, `偏移 (${dx}, ${dy}) 讀不到`);
      assert.equal(result.id, 'jonah', `偏移 (${dx}, ${dy}) 認錯人`);
    }
  }
});

test('偏移搜尋不得製造假辨識：沒有 QR 或整片白就要回 null', () => {
  // 搜尋會試上百個位置，等於給了 121 次機會去湊出一個「像」的圖樣。
  // 認錯人物比讀不到嚴重得多——孩子的畫會變成別人——所以這條要一起釘住。
  const blank = { width: CANVAS_W, height: CANVAS_H, data: new Uint8ClampedArray(CANVAS_W * CANVAS_H * 4).fill(255) };
  assert.equal(identify(blank, QR_AREA, ENTRIES), null, '整片白紙不該認出人物');

  // 紙放反（旋轉 180°）：四個角仍然對稱、homography 仍然算得出來，
  // 但 QR 會落在別的地方。這種情況必須讀不到，不能亂猜一個。
  const upsideDown = canonicalSheetWithQr('jonah');
  const flipped = new Uint8ClampedArray(upsideDown.data.length);
  for (let y = 0; y < CANVAS_H; y++) {
    for (let x = 0; x < CANVAS_W; x++) {
      const from = ((CANVAS_H - 1 - y) * CANVAS_W + (CANVAS_W - 1 - x)) * 4;
      const to = (y * CANVAS_W + x) * 4;
      for (let c = 0; c < 4; c++) flipped[to + c] = upsideDown.data[from + c];
    }
  }
  assert.equal(
    identify({ width: CANVAS_W, height: CANVAS_H, data: flipped }, QR_AREA, ENTRIES), null,
    '紙放反時不該猜出一個人物',
  );
});
