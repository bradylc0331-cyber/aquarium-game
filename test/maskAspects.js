// 從實際出貨的遮罩檔算出「裁切後的長寬比」——也就是角色進場時真正的碰撞比例。
//
// 為什麼要真的解 PNG，而不是在測試裡寫死一個數字：容納 15 位角色這條規格對長寬比
// 很敏感（實測 aspect 0.8 就已經在門檻邊、0.85 連 15 位都放不進去），而長寬比是
// **美術檔決定的**。寫死數字的話，哪天有人重畫一張比較胖的遮罩，測試照樣綠燈，
// 壞掉的地方會出現在活動當天的大螢幕上。
//
// 遮罩全部是 8-bit 灰階、非交錯的 PNG（尺寸與格式由 test/speciesAssets.test.js 釘住）。
const fs = require('node:fs');
const zlib = require('node:zlib');
const path = require('node:path');
const { SPECIES } = require('../src/species.js');

function grayPixels(file) {
  const data = fs.readFileSync(file);
  const width = data.readUInt32BE(16);
  const height = data.readUInt32BE(20);
  if (data[24] !== 8 || data[25] !== 0 || data[28] !== 0) {
    throw new Error(`${file}：預期 8-bit 灰階非交錯 PNG`);
  }
  const chunks = [];
  let offset = 8;
  while (offset < data.length) {
    const length = data.readUInt32BE(offset);
    if (data.toString('ascii', offset + 4, offset + 8) === 'IDAT') {
      chunks.push(data.subarray(offset + 8, offset + 8 + length));
    }
    offset += 12 + length;
  }
  const raw = zlib.inflateSync(Buffer.concat(chunks));
  const out = Buffer.alloc(width * height);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    for (let x = 0; x < width; x++) {
      const value = raw[pos++];
      const a = x > 0 ? out[y * width + x - 1] : 0;
      const b = y > 0 ? out[(y - 1) * width + x] : 0;
      const c = (x > 0 && y > 0) ? out[(y - 1) * width + x - 1] : 0;
      let restored;
      if (filter === 0) restored = value;
      else if (filter === 1) restored = value + a;
      else if (filter === 2) restored = value + b;
      else if (filter === 3) restored = value + ((a + b) >> 1);
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        restored = value + (pa <= pb && pa <= pc ? a : (pb <= pc ? b : c));
      } else throw new Error(`未知的 PNG filter ${filter}`);
      out[y * width + x] = restored & 0xff;
    }
  }
  return { width, height, pixels: out };
}

// 門檻 20 跟 display.html 進場時用的 Extract.boundingBoxOfAlpha 一致。
function maskAspect(file, threshold = 20) {
  const { width, height, pixels } = grayPixels(file);
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[y * width + x] > threshold) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < x0) throw new Error(`${file}：遮罩整片是空的`);
  return (x1 - x0 + 1) / (y1 - y0 + 1);
}

// 走地面的人物才算——天使在天上，不佔草地的位子。
function groundedSpecies() {
  return SPECIES.filter((s) => s.swim.style === 'walk' || s.swim.grounded === true);
}

function aspectsOf(list) {
  return list.map((s) => ({
    id: s.id,
    aspect: maskAspect(path.resolve(__dirname, '..', s.mask)),
  }));
}

module.exports = { maskAspect, groundedSpecies, aspectsOf };
