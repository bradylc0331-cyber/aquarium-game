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

  function identify(imageData, area, entries) {
    const total = SIZE + QUIET * 2;
    const moduleSize = area.size / total;
    const samples = [];
    let min = 255, max = 0;
    for (let row = 0; row < SIZE; row++) {
      samples[row] = [];
      for (let col = 0; col < SIZE; col++) {
        const x = Math.round(area.x + (col + QUIET + 0.5) * moduleSize);
        const y = Math.round(area.y + (row + QUIET + 0.5) * moduleSize);
        const luma = luminanceAt(imageData, x, y, Math.max(0, Math.floor(moduleSize * 0.18)));
        samples[row][col] = luma;
        min = Math.min(min, luma);
        max = Math.max(max, luma);
      }
    }
    if (max - min < 70) return null;
    const threshold = (min + max) / 2;
    let best = null;
    for (const entry of entries) {
      const expected = matrixForText(entry.text);
      let mismatch = 0;
      for (let row = 0; row < SIZE; row++) {
        for (let col = 0; col < SIZE; col++) {
          if ((samples[row][col] < threshold) !== expected[row][col]) mismatch++;
        }
      }
      const score = mismatch / (SIZE * SIZE);
      if (!best || score < best.score) best = { id: entry.id, text: entry.text, score };
    }
    return best && best.score <= 0.24 ? best : null;
  }

  const api = { SIZE, QUIET, matrixForText, svgMarkup, identify };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BibleQrCode = api;
})(typeof window !== 'undefined' ? window : globalThis);
