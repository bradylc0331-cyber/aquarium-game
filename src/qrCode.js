// 固定版 QR Code（Version 1-L、英數模式）產生器，以及校正後畫面中的七種人物 QR 比對。
// 活動現場不需要網路或第三方 CDN；只辨識本專案自己印出的 QR，速度比通用解碼器更穩定。
(function (root) {
  const SIZE = 21;
  const QUIET = 4;
  const ALPHANUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

  function appendBits(bits, value, count) {
    for (let i = count - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  }

  function gfMultiply(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11d);
      if ((y >>> i) & 1) z ^= x;
    }
    return z;
  }

  function reedSolomonGenerator(degree) {
    let result = [1];
    let rootValue = 1;
    for (let i = 0; i < degree; i++) {
      const next = new Array(result.length + 1).fill(0);
      for (let j = 0; j < result.length; j++) {
        next[j] ^= result[j];
        next[j + 1] ^= gfMultiply(result[j], rootValue);
      }
      result = next;
      rootValue = gfMultiply(rootValue, 2);
    }
    return result;
  }

  function reedSolomonRemainder(data, degree) {
    const generator = reedSolomonGenerator(degree);
    const result = new Array(degree).fill(0);
    for (const byte of data) {
      const factor = byte ^ result[0];
      result.shift();
      result.push(0);
      for (let i = 0; i < degree; i++) result[i] ^= gfMultiply(generator[i + 1], factor);
    }
    return result;
  }

  function dataCodewords(text) {
    const value = String(text).toUpperCase();
    if (value.length > 25 || [...value].some((c) => !ALPHANUM.includes(c))) {
      throw new Error('QR Version 1-L 只支援最多 25 個英數字元');
    }
    const bits = [];
    appendBits(bits, 0x2, 4); // alphanumeric mode
    appendBits(bits, value.length, 9);
    for (let i = 0; i + 1 < value.length; i += 2) {
      appendBits(bits, ALPHANUM.indexOf(value[i]) * 45 + ALPHANUM.indexOf(value[i + 1]), 11);
    }
    if (value.length % 2) appendBits(bits, ALPHANUM.indexOf(value[value.length - 1]), 6);
    const capacity = 19 * 8;
    appendBits(bits, 0, Math.min(4, capacity - bits.length));
    while (bits.length % 8) bits.push(0);
    const bytes = [];
    for (let i = 0; i < bits.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
      bytes.push(b);
    }
    for (let pad = 0; bytes.length < 19; pad++) bytes.push(pad % 2 === 0 ? 0xec : 0x11);
    return bytes;
  }

  function matrixForText(text) {
    const data = dataCodewords(text);
    const all = data.concat(reedSolomonRemainder(data, 7));
    const modules = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
    const isFunction = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
    const setFunction = (x, y, dark) => {
      if (x >= 0 && y >= 0 && x < SIZE && y < SIZE) {
        modules[y][x] = !!dark;
        isFunction[y][x] = true;
      }
    };

    for (let i = 0; i < SIZE; i++) {
      setFunction(6, i, i % 2 === 0);
      setFunction(i, 6, i % 2 === 0);
    }
    const finder = (cx, cy) => {
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          const dist = Math.max(Math.abs(dx), Math.abs(dy));
          setFunction(cx + dx, cy + dy, dist !== 2 && dist !== 4);
        }
      }
    };
    finder(3, 3);
    finder(SIZE - 4, 3);
    finder(3, SIZE - 4);

    const drawFormatBits = (mask) => {
      const formatData = (1 << 3) | mask; // EC level L = 01
      let rem = formatData;
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ (((rem >>> 9) & 1) * 0x537);
      const bits = ((formatData << 10) | rem) ^ 0x5412;
      const bit = (i) => ((bits >>> i) & 1) !== 0;
      for (let i = 0; i <= 5; i++) setFunction(8, i, bit(i));
      setFunction(8, 7, bit(6));
      setFunction(8, 8, bit(7));
      setFunction(7, 8, bit(8));
      for (let i = 9; i < 15; i++) setFunction(14 - i, 8, bit(i));
      for (let i = 0; i < 8; i++) setFunction(SIZE - 1 - i, 8, bit(i));
      for (let i = 8; i < 15; i++) setFunction(8, SIZE - 15 + i, bit(i));
      setFunction(8, SIZE - 8, true);
    };
    drawFormatBits(0);

    const dataBits = [];
    for (const byte of all) appendBits(dataBits, byte, 8);
    let bitIndex = 0;
    for (let right = SIZE - 1; right >= 1; right -= 2) {
      if (right === 6) right--;
      const upward = ((right + 1) & 2) === 0;
      for (let vert = 0; vert < SIZE; vert++) {
        const y = upward ? SIZE - 1 - vert : vert;
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          if (isFunction[y][x]) continue;
          let dark = bitIndex < dataBits.length ? dataBits[bitIndex] !== 0 : false;
          bitIndex++;
          if ((x + y) % 2 === 0) dark = !dark; // mask pattern 0
          modules[y][x] = dark;
        }
      }
    }
    if (bitIndex !== dataBits.length) throw new Error(`QR 資料模組數量錯誤：${bitIndex}/${dataBits.length}`);
    return modules;
  }

  function svgMarkup(text, x, y, size) {
    const matrix = matrixForText(text);
    const total = SIZE + QUIET * 2;
    const moduleSize = size / total;
    let rects = `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="#fff"/>`;
    for (let row = 0; row < SIZE; row++) {
      for (let col = 0; col < SIZE; col++) {
        if (!matrix[row][col]) continue;
        rects += `<rect x="${x + (col + QUIET) * moduleSize}" y="${y + (row + QUIET) * moduleSize}" width="${moduleSize + 0.02}" height="${moduleSize + 0.02}" fill="#000"/>`;
      }
    }
    return rects;
  }

  function luminanceAt(imageData, x, y, radius) {
    const { width, height, data } = imageData;
    let sum = 0, count = 0;
    for (let py = Math.max(0, y - radius); py <= Math.min(height - 1, y + radius); py++) {
      for (let px = Math.max(0, x - radius); px <= Math.min(width - 1, x + radius); px++) {
        const i = (py * width + px) * 4;
        sum += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        count++;
      }
    }
    return count ? sum / count : 255;
  }

  // 這個解碼器是「照固定位置取樣」——不找定位圖案，直接假設 QR 就在 area 裡。
  // 好處是快又穩定；代價是它對**取樣格線的位置**極度敏感。
  //
  // 實測（720p、輕微模糊與雜訊、紙佔畫面寬 80%，四角改用帶誤差的座標）：
  //
  //   角點誤差 ±0px  成功 28/28（最差 score 0.025）
  //   角點誤差 ±1px  成功 28/28（最差 score 0.218 ← 已經貼著 0.24 門檻）
  //   角點誤差 ±2px  成功 22/28
  //   角點誤差 ±3px  成功  8/28
  //   角點誤差 ±4px  成功  4/28
  //
  // 也就是相機畫面裡的角點只要偏 2px，QR 就讀不到了。角點是黑方塊的 flood-fill
  // 形心，現場的陰影、反光、紙沒完全攤平都很容易造成 2px 的偏移——這個餘裕
  // 在真實硬體上是不夠的（校正後每個模組只有 2.41px，2px 相機誤差約等於
  // 0.6 個模組，整張取樣格線就錯位了）。
  //
  // 所以：標稱位置先試一次（快，正常情況就在這裡結束）；讀不到才在附近搜尋
  // 幾個次像素偏移，把餘裕買回來。只有失敗時才付這個成本。
  const SEARCH_OFFSETS = [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8, 2.4, -2.4, 3.0, -3.0];

  function sampleAt(imageData, area, offsetX, offsetY) {
    const total = SIZE + QUIET * 2;
    const moduleSize = area.size / total;
    const radius = Math.max(0, Math.floor(moduleSize * 0.18));
    const samples = [];
    let min = 255, max = 0;
    for (let row = 0; row < SIZE; row++) {
      samples[row] = [];
      for (let col = 0; col < SIZE; col++) {
        const x = Math.round(area.x + offsetX + (col + QUIET + 0.5) * moduleSize);
        const y = Math.round(area.y + offsetY + (row + QUIET + 0.5) * moduleSize);
        const luma = luminanceAt(imageData, x, y, radius);
        samples[row][col] = luma;
        if (luma < min) min = luma;
        if (luma > max) max = luma;
      }
    }
    return { samples, min, max };
  }

  // 七個人物的樣板是固定的，但搜尋會把 bestMatch 叫上百次。
  // 不快取的話 matrixForText（含 Reed-Solomon）會被重算幾百遍，
  // 最壞情況實測 22.8ms → 快取後 4.3ms。
  const matrixCache = new Map();
  function cachedMatrix(text) {
    let matrix = matrixCache.get(text);
    if (!matrix) {
      matrix = matrixForText(text);
      matrixCache.set(text, matrix);
    }
    return matrix;
  }

  function bestMatch(sampled, entries) {
    if (sampled.max - sampled.min < 70) return null;
    const threshold = (sampled.min + sampled.max) / 2;
    let best = null;
    for (const entry of entries) {
      const expected = cachedMatrix(entry.text);
      let mismatch = 0;
      for (let row = 0; row < SIZE; row++) {
        for (let col = 0; col < SIZE; col++) {
          if ((sampled.samples[row][col] < threshold) !== expected[row][col]) mismatch++;
        }
      }
      const score = mismatch / (SIZE * SIZE);
      if (!best || score < best.score) best = { id: entry.id, text: entry.text, score };
    }
    return best;
  }

  function identify(imageData, area, entries) {
    const direct = bestMatch(sampleAt(imageData, area, 0, 0), entries);
    if (direct && direct.score <= 0.24) return direct;

    // 標稱位置讀不到才搜尋。回傳分數最好的那個偏移。
    let best = direct;
    for (const offsetY of SEARCH_OFFSETS) {
      for (const offsetX of SEARCH_OFFSETS) {
        if (offsetX === 0 && offsetY === 0) continue;
        const candidate = bestMatch(sampleAt(imageData, area, offsetX, offsetY), entries);
        if (candidate && (!best || candidate.score < best.score)) {
          best = candidate;
          if (best.score === 0) return best; // 完全吻合，不必再找
        }
      }
    }
    return best && best.score <= 0.24 ? best : null;
  }

  const api = { SIZE, QUIET, matrixForText, svgMarkup, identify };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BibleQrCode = api;
})(typeof window !== 'undefined' ? window : globalThis);
