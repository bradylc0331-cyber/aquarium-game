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

  // ---------------------------------------------------------------------------
  // 固定位置取樣的極限：2026-09-02 實機量到 QR 其實落在標稱位置外 (+7.2, +5.0) px，
  // 垂直方向還被壓縮 8%。上面的 SEARCH_OFFSETS 最遠只到 ±3.0px，怎麼搜都搜不到，
  // 七位人物分數全部擠在 0.42~0.46（亂猜是 0.5）。成因還沒定案，
  // 但解碼器不該賭 QR 一定在標稱位置——它應該自己去找。
  //
  // 找法：QR 的三個定位圖案（finder pattern）本來就是為了被找到而設計的。
  // 它們四周有 1 個模組寬的分隔白邊，所以在二值化後是三個乾淨、獨立、
  // 邊長 7 個模組、填充率約 0.5 的方形黑塊。找到三個就能直接定出
  // 取樣格線的原點、兩軸方向與每軸的模組大小——偏移與壓扁一次解決。
  //
  // 找不到就退回上面那條固定位置的路徑，所以只會變好，不會退步。
  // ---------------------------------------------------------------------------

  function regionLuma(imageData, x0, y0, w, h) {
    const luma = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = ((y + y0) * imageData.width + (x + x0)) * 4;
        luma[y * w + x] = imageData.data[i] * 0.299 + imageData.data[i + 1] * 0.587 + imageData.data[i + 2] * 0.114;
      }
    }
    return luma;
  }

  // Otsu：不挑固定門檻，讓現場的照明自己決定黑白的分界。
  // 回傳的 t 的語意是「亮度 <= t 算暗」——純黑白的合成畫面會回傳剛好等於黑色的值，
  // 用 < 比較會把整張圖判成亮的，一個元件都找不到。
  function otsuThreshold(luma) {
    const hist = new Array(256).fill(0);
    for (const v of luma) hist[Math.max(0, Math.min(255, Math.round(v)))]++;
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sumB = 0, countB = 0, best = -1, threshold = 128;
    for (let t = 0; t < 256; t++) {
      countB += hist[t];
      if (!countB) continue;
      const countF = luma.length - countB;
      if (!countF) break;
      sumB += t * hist[t];
      const between = countB * countF * ((sumB / countB) - ((sum - sumB) / countF)) ** 2;
      if (between > best) { best = between; threshold = t; }
    }
    return threshold;
  }

  function darkComponents(luma, w, h, threshold) {
    const label = new Int32Array(w * h).fill(-1);
    const comps = [];
    const stack = [];
    for (let seed = 0; seed < w * h; seed++) {
      if (luma[seed] > threshold || label[seed] >= 0) continue;
      const id = comps.length;
      label[seed] = id;
      stack.length = 0;
      stack.push(seed);
      let n = 0, sx = 0, sy = 0, minX = w, maxX = -1, minY = h, maxY = -1;
      while (stack.length) {
        const p = stack.pop();
        const px = p % w, py = (p - px) / w;
        n++; sx += px; sy += py;
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const qx = px + dx, qy = py + dy;
            if (qx < 0 || qy < 0 || qx >= w || qy >= h) continue;
            const q = qy * w + qx;
            if (luma[q] <= threshold && label[q] < 0) { label[q] = id; stack.push(q); }
          }
        }
      }
      comps.push({ n, cx: sx / n, cy: sy / n, w: maxX - minX + 1, h: maxY - minY + 1 });
    }
    return comps;
  }

  // 三個定位圖案應該是等腰直角三角形的三個頂點，兩股長 14 個模組。
  // 除了大小、方正度、填充率，還要過這一關，才不會把旁邊的中文字當成定位圖案。
  function pickFinderTriple(candidates, moduleSize) {
    const expectedLeg = 14 * moduleSize;
    let best = null;
    for (let a = 0; a < candidates.length; a++) {
      for (let b = 0; b < candidates.length; b++) {
        for (let c = b + 1; c < candidates.length; c++) {
          if (a === b || a === c) continue;
          const corner = candidates[a];
          const v1 = [candidates[b].cx - corner.cx, candidates[b].cy - corner.cy];
          const v2 = [candidates[c].cx - corner.cx, candidates[c].cy - corner.cy];
          const l1 = Math.hypot(v1[0], v1[1]);
          const l2 = Math.hypot(v2[0], v2[1]);
          if (!l1 || !l2) continue;
          if (Math.abs(l1 - expectedLeg) > expectedLeg * 0.2) continue;
          if (Math.abs(l2 - expectedLeg) > expectedLeg * 0.2) continue;
          const perpendicular = Math.abs((v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2));
          const isoceles = Math.abs(l1 - l2) / ((l1 + l2) / 2);
          const error = perpendicular + isoceles;
          if (error > 0.25) continue;
          // 影像座標 y 朝下，tl->tr->bl 的外積為正
          const cross = v1[0] * v2[1] - v1[1] * v2[0];
          const tr = cross > 0 ? candidates[b] : candidates[c];
          const bl = cross > 0 ? candidates[c] : candidates[b];
          if (!best || error < best.error) {
            best = { error, tl: [corner.cx, corner.cy], tr: [tr.cx, tr.cy], bl: [bl.cx, bl.cy] };
          }
        }
      }
    }
    return best;
  }

  function locateFinders(imageData, area) {
    const moduleSize = area.size / (SIZE + QUIET * 2);
    // 搜尋範圍只比 QR 區大一圈。放太寬會開始把紙上其他東西當候選，
    // 而且「紙放反」這種情況本來就該讀不到，不該讓它有機會在整張紙上找。
    const margin = Math.round(area.size * 0.35);
    const x0 = Math.max(0, Math.round(area.x - margin));
    const y0 = Math.max(0, Math.round(area.y - margin));
    const x1 = Math.min(imageData.width - 1, Math.round(area.x + area.size + margin));
    const y1 = Math.min(imageData.height - 1, Math.round(area.y + area.size + margin));
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    if (w < area.size || h < area.size) return null;

    const luma = regionLuma(imageData, x0, y0, w, h);
    let min = 255, max = 0;
    for (const v of luma) { if (v < min) min = v; if (v > max) max = v; }
    if (max - min < 40) return null; // 整片白或整片黑，沒得找

    const comps = darkComponents(luma, w, h, otsuThreshold(luma));
    const candidates = comps.filter((c) => {
      const side = (c.w + c.h) / 2;
      const squareness = Math.min(c.w, c.h) / Math.max(c.w, c.h);
      const fill = c.n / (c.w * c.h);
      return side >= moduleSize * 5 && side <= moduleSize * 9.5
        && squareness >= 0.7 && fill >= 0.25 && fill <= 0.8;
    });
    if (candidates.length < 3) return null;
    // 候選太多代表這區塊很雜（例如把文字也算進來），交給幾何條件去挑，
    // 但要限制數量避免三重迴圈爆掉。
    const limited = candidates.slice(0, 12);
    const triple = pickFinderTriple(limited, moduleSize);
    if (!triple) return null;
    return {
      tl: [triple.tl[0] + x0, triple.tl[1] + y0],
      tr: [triple.tr[0] + x0, triple.tr[1] + y0],
      bl: [triple.bl[0] + x0, triple.bl[1] + y0],
    };
  }

  function bilinearLuma(imageData, fx, fy) {
    const { width, height, data } = imageData;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const at = (x, y) => {
      if (x < 0 || y < 0 || x >= width || y >= height) return 255;
      const i = (y * width + x) * 4;
      return data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    };
    return at(x0, y0) * (1 - tx) * (1 - ty) + at(x0 + 1, y0) * tx * (1 - ty)
      + at(x0, y0 + 1) * (1 - tx) * ty + at(x0 + 1, y0 + 1) * tx * ty;
  }

  // 用三個定位圖案張出來的格線取樣。dx/dy/sx/sy 是微調用的，正常情況都是 0/0/1/1。
  function sampleWithAnchors(imageData, anchors, dx, dy, sx, sy) {
    const ex = [(anchors.tr[0] - anchors.tl[0]) / 14, (anchors.tr[1] - anchors.tl[1]) / 14];
    const ey = [(anchors.bl[0] - anchors.tl[0]) / 14, (anchors.bl[1] - anchors.tl[1]) / 14];
    // 定位圖案中心在模組座標 (3.5, 3.5)；格子 c 的中心是 c + 0.5。
    const at = (u, v) => [
      anchors.tl[0] + dx + (u - 3.5) * ex[0] * sx + (v - 3.5) * ey[0] * sy,
      anchors.tl[1] + dy + (u - 3.5) * ex[1] * sx + (v - 3.5) * ey[1] * sy,
    ];
    const samples = [];
    let min = 255, max = 0;
    for (let row = 0; row < SIZE; row++) {
      samples[row] = [];
      for (let col = 0; col < SIZE; col++) {
        let sum = 0, count = 0;
        for (let jy = -1; jy <= 1; jy++) {
          for (let jx = -1; jx <= 1; jx++) {
            const [px, py] = at(col + 0.5 + jx * 0.25, row + 0.5 + jy * 0.25);
            sum += bilinearLuma(imageData, px, py);
            count++;
          }
        }
        const value = sum / count;
        samples[row][col] = value;
        if (value < min) min = value;
        if (value > max) max = value;
      }
    }
    return { samples, min, max };
  }

  const REFINE_SHIFTS = [-0.5, 0, 0.5];
  const REFINE_SCALES = [0.97, 1, 1.03];

  function matchWithAnchors(imageData, anchors, entries) {
    let best = bestMatch(sampleWithAnchors(imageData, anchors, 0, 0, 1, 1), entries);
    // 定位圖案的形心本來就有一點偏差（二值化、模糊、形心不等於幾何中心）。
    // 已經夠好就不要多花這 81 次取樣；不夠好才微調。
    if (best && best.score <= 0.08) return best;
    for (const dx of REFINE_SHIFTS) {
      for (const dy of REFINE_SHIFTS) {
        for (const sx of REFINE_SCALES) {
          for (const sy of REFINE_SCALES) {
            if (dx === 0 && dy === 0 && sx === 1 && sy === 1) continue;
            const candidate = bestMatch(sampleWithAnchors(imageData, anchors, dx, dy, sx, sy), entries);
            if (candidate && (!best || candidate.score < best.score)) best = candidate;
          }
        }
      }
    }
    return best;
  }

  function identify(imageData, area, entries) {
    // 先找定位圖案。找得到就用它張出來的格線——偏移與壓扁都不必猜。
    const anchors = locateFinders(imageData, area);
    if (anchors) {
      const located = matchWithAnchors(imageData, anchors, entries);
      if (located && located.score <= 0.24) return located;
    }

    // 找不到（或找到了卻對不上）才退回原本的固定位置取樣。
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

  const api = { SIZE, QUIET, matrixForText, svgMarkup, identify, locateFinders };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BibleQrCode = api;
})(typeof window !== 'undefined' ? window : globalThis);
