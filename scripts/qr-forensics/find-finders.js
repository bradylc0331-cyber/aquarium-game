// 直接在校正後畫面裡找 QR 的三個定位圖案（finder pattern），
// 得到 QR 真正的位置、尺度、旋轉，不靠比對分數猜。
const fs = require('fs'), zlib = require('zlib'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const C = require(path.join(ROOT, 'src/constants.js'));
const Qr = require(path.join(ROOT, 'src/qrCode.js'));
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
// 搜尋範圍：QR_AREA 外擴 25px
const A = C.QR_AREA;
const X0 = Math.max(0, A.x - 25), X1 = Math.min(im.width - 1, A.x + A.size + 25);
const Y0 = 0, Y1 = Math.min(im.height - 1, A.y + A.size + 25);
const W = X1 - X0 + 1, Hh = Y1 - Y0 + 1;
const sub = new Float32Array(W * Hh);
for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) sub[y * W + x] = im.gray[(y + Y0) * im.width + (x + X0)];
// Otsu
const hist = new Array(256).fill(0);
for (const v of sub) hist[Math.max(0, Math.min(255, Math.round(v)))]++;
let total = sub.length, sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
let sumB = 0, wB = 0, best = 0, thr = 128;
for (let t = 0; t < 256; t++) {
  wB += hist[t]; if (!wB) continue; const wF = total - wB; if (!wF) break;
  sumB += t * hist[t];
  const between = wB * wF * ((sumB / wB) - ((sum - sumB) / wF)) ** 2;
  if (between > best) { best = between; thr = t; }
}
const dark = new Uint8Array(W * Hh);
for (let i = 0; i < sub.length; i++) dark[i] = sub[i] < thr ? 1 : 0;
// 連通元件
const label = new Int32Array(W * Hh).fill(-1);
const comps = [];
for (let i = 0; i < W * Hh; i++) {
  if (!dark[i] || label[i] >= 0) continue;
  const id = comps.length, stack = [i]; label[i] = id;
  let n = 0, sx = 0, sy = 0, minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
  while (stack.length) {
    const p = stack.pop(), px = p % W, py = (p - px) / W;
    n++; sx += px; sy += py;
    if (px < minx) minx = px; if (px > maxx) maxx = px;
    if (py < miny) miny = py; if (py > maxy) maxy = py;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const qx = px + dx, qy = py + dy;
      if (qx < 0 || qy < 0 || qx >= W || qy >= Hh) continue;
      const q = qy * W + qx;
      if (dark[q] && label[q] < 0) { label[q] = id; stack.push(q); }
    }
  }
  comps.push({ n, cx: sx / n + X0, cy: sy / n + Y0, w: maxx - minx + 1, h: maxy - miny + 1 });
}
const nominalModule = A.size / (Qr.SIZE + Qr.QUIET * 2);
// finder 外環：邊長約 7 個模組、方形、填充率約 0.5
const finders = comps.filter((c) => {
  const side = (c.w + c.h) / 2;
  const squareness = Math.min(c.w, c.h) / Math.max(c.w, c.h);
  const fill = c.n / (c.w * c.h);
  return side > nominalModule * 5 && side < nominalModule * 9.5 && squareness > 0.8 && fill > 0.3 && fill < 0.75;
});
console.log(`門檻 ${thr}，找到 ${comps.length} 個暗塊，其中像 finder 的有 ${finders.length} 個：`);
for (const f of finders) console.log(`  中心 (${f.cx.toFixed(2)}, ${f.cy.toFixed(2)})  ${f.w}x${f.h}px  填充 ${(f.n / (f.w * f.h)).toFixed(2)}`);
if (finders.length < 3) { console.log('不到三個，無法定位'); process.exit(0); }
// 三個 finder 的預期位置（canonical）
const exp = {
  tl: [A.x + (Qr.QUIET + 3.5) * nominalModule, A.y + (Qr.QUIET + 3.5) * nominalModule],
  tr: [A.x + (Qr.QUIET + Qr.SIZE - 3.5) * nominalModule, A.y + (Qr.QUIET + 3.5) * nominalModule],
  bl: [A.x + (Qr.QUIET + 3.5) * nominalModule, A.y + (Qr.QUIET + Qr.SIZE - 3.5) * nominalModule],
};
// 依相對位置指派
const byY = [...finders].sort((a, b) => a.cy - b.cy);
const top2 = byY.slice(0, 2).sort((a, b) => a.cx - b.cx);
const obs = { tl: top2[0], tr: top2[1], bl: byY[byY.length - 1] };
console.log('\n預期 vs 實測（校正後座標）：');
for (const k of ['tl', 'tr', 'bl']) {
  console.log(`  ${k}: 預期 (${exp[k][0].toFixed(2)}, ${exp[k][1].toFixed(2)})  實測 (${obs[k].cx.toFixed(2)}, ${obs[k].cy.toFixed(2)})  差 (${(obs[k].cx - exp[k][0]).toFixed(2)}, ${(obs[k].cy - exp[k][1]).toFixed(2)})`);
}
const expSpanX = exp.tr[0] - exp.tl[0], obsSpanX = obs.tr.cx - obs.tl.cx;
const expSpanY = exp.bl[1] - exp.tl[1], obsSpanY = obs.bl.cy - obs.tl.cy;
console.log(`\n尺度：X 方向 ${(obsSpanX / expSpanX).toFixed(4)}、Y 方向 ${(obsSpanY / expSpanY).toFixed(4)}`);
console.log(`旋轉：上緣 ${(Math.atan2(obs.tr.cy - obs.tl.cy, obs.tr.cx - obs.tl.cx) * 180 / Math.PI).toFixed(2)}°、`
  + `左緣 ${(Math.atan2(obs.bl.cx - obs.tl.cx, obs.bl.cy - obs.tl.cy) * -180 / Math.PI).toFixed(2)}°`);
const mX = obsSpanX / (Qr.SIZE - 7), mY = obsSpanY / (Qr.SIZE - 7);
console.log(`實測模組大小：X ${mX.toFixed(3)}px、Y ${mY.toFixed(3)}px（程式假設 ${nominalModule.toFixed(3)}）`);
console.log(`實測 QR 左上角（含靜區）：(${(obs.tl.cx - (Qr.QUIET + 3.5) * mX).toFixed(2)}, ${(obs.tl.cy - (Qr.QUIET + 3.5) * mY).toFixed(2)})，程式假設 (${A.x}, ${A.y})`);
