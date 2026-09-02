// 四個黑方塊在校正後應該都是 28x28 的正方形。量它們的實際外框，
// 上緣被壓扁就代表紙的前緣翹起來（或該處光學變形），而不是印錯。
const fs = require('fs'), zlib = require('zlib'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const C = require(path.join(ROOT, 'src/constants.js'));
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
const M = C.MARKER_CANONICAL;
console.log(`四個定位方塊（程式假設 ${C.MARKER_SIZE}x${C.MARKER_SIZE}px，中心在 inset ${C.MARKER_INSET}）：`);
for (const key of ['tl', 'tr', 'br', 'bl']) {
  const [cx, cy] = M[key];
  const R = 26;
  let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9, n = 0, sx = 0, sy = 0;
  for (let y = Math.max(0, cy - R); y <= Math.min(im.height - 1, cy + R); y++) {
    for (let x = Math.max(0, cx - R); x <= Math.min(im.width - 1, cx + R); x++) {
      if (im.gray[y * im.width + x] < 100) { n++; sx += x; sy += y;
        if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
    }
  }
  if (!n) { console.log(`  ${key}: 找不到`); continue; }
  console.log(`  ${key}: ${(maxx - minx + 1)}x${(maxy - miny + 1)}px  中心 (${(sx / n).toFixed(1)}, ${(sy / n).toFixed(1)})`
    + `  中心誤差 (${(sx / n - cx).toFixed(2)}, ${(sy / n - cy).toFixed(2)})`);
}
