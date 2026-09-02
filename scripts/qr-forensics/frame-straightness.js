// 印在紙上的 WORK_AREA 細框在校正後應該是完美的直線矩形 (100,92)-(700,542)。
// 量它彎不彎、位置對不對，就能分辨「鏡頭桶狀變形」與「單純印偏」。
const fs = require('fs'), zlib = require('zlib'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
function decodePNG(file) {
  const buf = fs.readFileSync(file); let pos = 8, w = 0, h = 0, ctype = 0; const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ctype = data[9]; }
    else if (type === 'IDAT') idat.push(data); else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[ctype], raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * ch;
  const out = new Uint8Array(w * h * ch); let prev = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = new Uint8Array(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0; let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      cur[i] = v & 255;
    }
    out.set(cur, y * stride); prev = cur;
  }
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) gray[i] = ch >= 3 ? out[i*ch]*0.299 + out[i*ch+1]*0.587 + out[i*ch+2]*0.114 : out[i*ch];
  return { width: w, height: h, gray };
}
const im = decodePNG(`${ROOT}/output/qr-dump/warped.png`);
const at = (x, y) => im.gray[Math.round(y) * im.width + Math.round(x)];

// 沿 x 掃描，在 [y0,y1] 找最暗的 y（細框線），用亮度加權求次像素位置
function traceH(xs, y0, y1) {
  const pts = [];
  for (const x of xs) {
    let bestY = -1, bestV = 255;
    for (let y = y0; y <= y1; y++) { const v = at(x, y); if (v < bestV) { bestV = v; bestY = y; } }
    if (bestV > 200) continue; // 這一列沒找到線
    let num = 0, den = 0;
    for (let y = Math.max(y0, bestY - 3); y <= Math.min(y1, bestY + 3); y++) {
      const wgt = Math.max(0, 235 - at(x, y)); num += wgt * y; den += wgt;
    }
    pts.push([x, den ? num / den : bestY, bestV]);
  }
  return pts;
}
function traceV(ys, x0, x1) {
  const pts = [];
  for (const y of ys) {
    let bestX = -1, bestV = 255;
    for (let x = x0; x <= x1; x++) { const v = at(x, y); if (v < bestV) { bestV = v; bestX = x; } }
    if (bestV > 200) continue;
    let num = 0, den = 0;
    for (let x = Math.max(x0, bestX - 3); x <= Math.min(x1, bestX + 3); x++) {
      const wgt = Math.max(0, 235 - at(x, y)); num += wgt * x; den += wgt;
    }
    pts.push([y, den ? num / den : bestX, bestV]);
  }
  return pts;
}
function fitAndReport(name, pts, expected) {
  if (pts.length < 10) { console.log(`${name}: 找不到線（只有 ${pts.length} 點）`); return; }
  const n = pts.length;
  const sx = pts.reduce((a, p) => a + p[0], 0) / n, sy = pts.reduce((a, p) => a + p[1], 0) / n;
  let num = 0, den = 0;
  for (const [x, y] of pts) { num += (x - sx) * (y - sy); den += (x - sx) ** 2; }
  const slope = num / den, intercept = sy - slope * sx;
  let maxDev = 0, devAt = 0;
  const devs = [];
  for (const [x, y] of pts) { const d = y - (slope * x + intercept); devs.push([x, d]); if (Math.abs(d) > Math.abs(maxDev)) { maxDev = d; devAt = x; } }
  const mid = devs[Math.floor(devs.length / 2)];
  console.log(`${name}: 實測位置 ${sy.toFixed(2)}（程式假設 ${expected}，差 ${(sy - expected).toFixed(2)}px）`
    + ` 斜率 ${slope.toFixed(5)} 直線殘差最大 ${maxDev.toFixed(2)}px @${devAt} 中點殘差 ${mid[1].toFixed(2)}px`);
  const sampled = devs.filter((_, i) => i % Math.max(1, Math.floor(devs.length / 9)) === 0);
  console.log('   彎曲形狀（沿線的殘差）：' + sampled.map(([x, d]) => `${Math.round(x)}:${d >= 0 ? '+' : ''}${d.toFixed(1)}`).join('  '));
}
const xs = []; for (let x = 120; x <= 680; x += 5) xs.push(x);
const ys = []; for (let y = 110; y <= 520; y += 5) ys.push(y);
console.log('=== 印在紙上的引導框（校正後應該是 (100,92)-(700,542) 的完美矩形）===');
fitAndReport('上邊 y', traceH(xs, 80, 104), 92);
fitAndReport('下邊 y', traceH(xs, 530, 554), 542);
fitAndReport('左邊 x', traceV(ys, 88, 112), 100);
fitAndReport('右邊 x', traceV(ys, 688, 712), 700);
