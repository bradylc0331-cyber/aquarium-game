// 驗證：改用「找到的定位圖案」建立取樣格線，分數會變多少？
const fs = require('fs'), zlib = require('zlib'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const C = require(path.join(ROOT, 'src/constants.js'));
const Qr = require(path.join(ROOT, 'src/qrCode.js'));
const Species = require(path.join(ROOT, 'src/species.js'));
function decodePNG(file) {
  const buf = fs.readFileSync(file); let pos = 8, w = 0, h = 0, ctype = 0; const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString('ascii', pos + 4, pos + 8);
    const d = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ctype = d[9]; }
    else if (type === 'IDAT') idat.push(d); else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[ctype], raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * ch;
  const out = new Uint8Array(w * h * ch); let prev = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = new Uint8Array(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0, b = prev[i], c2 = i >= ch ? prev[i - ch] : 0; let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c2, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c2);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c2); }
      cur[i] = v & 255;
    }
    out.set(cur, y * stride); prev = cur;
  }
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) gray[i] = ch >= 3 ? out[i*ch]*0.299 + out[i*ch+1]*0.587 + out[i*ch+2]*0.114 : out[i*ch];
  return { width: w, height: h, gray };
}
const im = decodePNG(`${ROOT}/output/qr-dump/warped.png`);
const bil = (fx, fy) => {
  const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
  const at = (x, y) => (x < 0 || y < 0 || x >= im.width || y >= im.height) ? 255 : im.gray[y * im.width + x];
  return at(x0,y0)*(1-tx)*(1-ty) + at(x0+1,y0)*tx*(1-ty) + at(x0,y0+1)*(1-tx)*ty + at(x0+1,y0+1)*tx*ty;
};
// 上一步量到的三個 finder 中心
const TL = [390.31, 31.07], TR = [423.76, 30.28], BL = [389.01, 62.28];
const S = Qr.SIZE;
const P = (col, row) => [
  TL[0] + (col - 3.5) / 14 * (TR[0] - TL[0]) + (row - 3.5) / 14 * (BL[0] - TL[0]),
  TL[1] + (col - 3.5) / 14 * (TR[1] - TL[1]) + (row - 3.5) / 14 * (BL[1] - TL[1]),
];
const samples = []; let min = 255, max = 0;
for (let r = 0; r < S; r++) { samples[r] = [];
  for (let c = 0; c < S; c++) {
    // 用模組中心附近 3x3 平均（半徑 0.25 模組）
    let sum = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const [px, py] = P(c + 0.5 + dx * 0.25, r + 0.5 + dy * 0.25); sum += bil(px, py); n++;
    }
    const v = sum / n; samples[r][c] = v;
    if (v < min) min = v; if (v > max) max = v;
  } }
const t = (min + max) / 2;
const results = Species.SPECIES.map((sp) => {
  const exp = Qr.matrixForText(`BIBLE:${sp.id.toUpperCase()}`);
  let bad = 0;
  for (let r = 0; r < S; r++) for (let c = 0; c < S; c++) if ((samples[r][c] < t) !== exp[r][c]) bad++;
  return { name: sp.name, id: sp.id, score: bad / (S * S) };
}).sort((a, b) => a.score - b.score);
console.log(`對比 ${(max - min).toFixed(0)}，門檻 0.24`);
for (const r of results) console.log(`  ${r.score <= 0.24 ? '✓' : ' '} ${r.name.padEnd(4)} ${r.score.toFixed(3)}`);
console.log(`\n第一名與第二名差距：${(results[1].score - results[0].score).toFixed(3)}（越大越不會認錯人）`);

// ---- 再加一層局部微調：以 finder 格線為起點，微搜尋平移與每軸尺度 ----
const scoreGrid = (dx, dy, sx, sy) => {
  const Pm = (u, v) => {
    const ex = [(TR[0] - TL[0]) / 14, (TR[1] - TL[1]) / 14];
    const ey = [(BL[0] - TL[0]) / 14, (BL[1] - TL[1]) / 14];
    return [
      TL[0] + dx + (u - 3.5) * ex[0] * sx + (v - 3.5) * ey[0] * sy,
      TL[1] + dy + (u - 3.5) * ex[1] * sx + (v - 3.5) * ey[1] * sy,
    ];
  };
  const sm = []; let mn = 255, mx = 0;
  for (let r = 0; r < S; r++) { sm[r] = [];
    for (let c = 0; c < S; c++) {
      let sum = 0, n = 0;
      for (let dy2 = -1; dy2 <= 1; dy2++) for (let dx2 = -1; dx2 <= 1; dx2++) {
        const [px, py] = Pm(c + 0.5 + dx2 * 0.25, r + 0.5 + dy2 * 0.25); sum += bil(px, py); n++;
      }
      const v = sum / n; sm[r][c] = v; if (v < mn) mn = v; if (v > mx) mx = v;
    } }
  const th = (mn + mx) / 2;
  return Species.SPECIES.map((sp) => {
    const exp = Qr.matrixForText(`BIBLE:${sp.id.toUpperCase()}`);
    let bad = 0;
    for (let r = 0; r < S; r++) for (let c = 0; c < S; c++) if ((sm[r][c] < th) !== exp[r][c]) bad++;
    return { name: sp.name, score: bad / (S * S) };
  }).sort((a, b) => a.score - b.score);
};
let bestRef = null;
for (let dx = -1.5; dx <= 1.5; dx += 0.25)
  for (let dy = -1.5; dy <= 1.5; dy += 0.25)
    for (let sx = 0.96; sx <= 1.04; sx += 0.01)
      for (let sy = 0.96; sy <= 1.04; sy += 0.01) {
        const r = scoreGrid(dx, dy, sx, sy);
        if (!bestRef || r[0].score < bestRef.r[0].score) bestRef = { dx, dy, sx, sy, r };
      }
console.log(`\n加上局部微調後（平移 ${bestRef.dx}, ${bestRef.dy}；尺度 ${bestRef.sx.toFixed(2)}, ${bestRef.sy.toFixed(2)}）：`);
for (const r of bestRef.r) console.log(`  ${r.score <= 0.24 ? '✓' : ' '} ${r.name.padEnd(4)} ${r.score.toFixed(3)}`);
console.log(`第一名與第二名差距：${(bestRef.r[1].score - bestRef.r[0].score).toFixed(3)}`);

// ---- 最後一關：用實機照片跑「產品裡真正的 identify()」 ----
const imgData = { width: im.width, height: im.height, data: new Uint8ClampedArray(im.width * im.height * 4) };
for (let i = 0; i < im.width * im.height; i++) {
  const g = Math.round(im.gray[i]);
  imgData.data[i * 4] = imgData.data[i * 4 + 1] = imgData.data[i * 4 + 2] = g;
  imgData.data[i * 4 + 3] = 255;
}
const ENTRIES = Species.SPECIES.map((sp) => ({ id: sp.id, text: `BIBLE:${sp.id.toUpperCase()}` }));
const anchors = Qr.locateFinders(imgData, C.QR_AREA);
console.log('\n定位圖案：', anchors ? JSON.stringify(anchors) : '找不到');
const t0 = process.hrtime.bigint();
const real = Qr.identify(imgData, C.QR_AREA, ENTRIES);
const ms = Number(process.hrtime.bigint() - t0) / 1e6;
console.log(`產品的 identify()：${real ? `${real.id} score ${real.score.toFixed(3)}` : 'null（讀不到）'}  耗時 ${ms.toFixed(1)}ms`);
