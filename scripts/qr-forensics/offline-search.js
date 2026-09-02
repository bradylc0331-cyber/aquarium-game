// 用存下來的 frame.png + report.json 的角點，離線把 QR 的真實位置與尺度找出來。
const fs = require('fs'), zlib = require('zlib'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const Homography = require(path.join(ROOT, 'src/homography.js'));
const Qr = require(path.join(ROOT, 'src/qrCode.js'));
const Species = require(path.join(ROOT, 'src/species.js'));
const C = require(path.join(ROOT, 'src/constants.js'));

function decodePNG(file) {
  const buf = fs.readFileSync(file);
  let pos = 8, w = 0, h = 0, depth = 0, ctype = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; ctype = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (depth !== 8) throw new Error('只支援 8-bit');
  const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[ctype];
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const out = new Uint8Array(w * h * ch);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = new Uint8Array(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0;
      let v = line[i];
      if (filter === 1) v += a; else if (filter === 2) v += b; else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      cur[i] = v & 255;
    }
    out.set(cur, y * stride); prev = cur;
  }
  // 轉灰階
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (ch >= 3) gray[i] = out[i * ch] * 0.299 + out[i * ch + 1] * 0.587 + out[i * ch + 2] * 0.114;
    else gray[i] = out[i * ch];
  }
  return { width: w, height: h, gray };
}

const img = decodePNG(path.join(ROOT, 'output/qr-dump/frame.png'));
const report = JSON.parse(fs.readFileSync(path.join(ROOT, 'output/qr-dump/report.json'), 'utf8'));
const corners = report.corners.full;
const M = C.MARKER_CANONICAL, A = C.QR_AREA;
const H = Homography.computeHomography([corners.tl, corners.tr, corners.br, corners.bl], [M.tl, M.tr, M.br, M.bl]);
const invH = Homography.invertHomography(H);

const sample = (fx, fy) => {
  const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
  const at = (x, y) => (x < 0 || y < 0 || x >= img.width || y >= img.height) ? 255 : img.gray[y * img.width + x];
  return at(x0, y0) * (1 - tx) * (1 - ty) + at(x0 + 1, y0) * tx * (1 - ty)
    + at(x0, y0 + 1) * (1 - tx) * ty + at(x0 + 1, y0 + 1) * tx * ty;
};

const S = Qr.SIZE, Q = Qr.QUIET;
const baseModule = A.size / (S + Q * 2);
// 取樣：QR 左上角（含靜區）在 canonical 的位置 (ox,oy)，每模組 m canonical px
const grab = (ox, oy, m) => {
  const s = []; let min = 255, max = 0;
  for (let r = 0; r < S; r++) { s[r] = [];
    for (let c = 0; c < S; c++) {
      const cx = ox + (c + Q + 0.5) * m, cy = oy + (r + Q + 0.5) * m;
      const [fx, fy] = Homography.applyHomography(invH, cx, cy);
      const v = sample(fx, fy);
      s[r][c] = v; if (v < min) min = v; if (v > max) max = v;
    } }
  return { s, min, max };
};
const matrices = Species.SPECIES.map(sp => ({ sp, m: Qr.matrixForText(`BIBLE:${sp.id.toUpperCase()}`) }));
const score = (g, mat) => {
  const t = (g.min + g.max) / 2; let bad = 0;
  for (let r = 0; r < S; r++) for (let c = 0; c < S; c++) if ((g.s[r][c] < t) !== mat[r][c]) bad++;
  return bad / (S * S);
};

let best = null;
for (let m = baseModule * 0.88; m <= baseModule * 1.14; m += baseModule * 0.01) {
  for (let oy = A.y - 6; oy <= A.y + 16; oy += 0.25) {
    for (let ox = A.x - 6; ox <= A.x + 20; ox += 0.25) {
      const g = grab(ox, oy, m);
      if (g.max - g.min < 40) continue;
      for (const { sp, m: mat } of matrices) {
        const sc = score(g, mat);
        if (!best || sc < best.score) best = { score: sc, id: sp.id, name: sp.name, ox: +ox.toFixed(2), oy: +oy.toFixed(2), module: +m.toFixed(3), contrast: +(g.max - g.min).toFixed(0) };
      }
    }
  }
}
console.log('目前程式假設：QR 左上角 canonical (%s, %s)、每模組 %s px', A.x, A.y, baseModule.toFixed(3));
console.log('全域搜尋最佳：', JSON.stringify(best));
if (best) {
  console.log('→ 位移 (%s, %s) canonical px  =  (%s, %s) mm',
    (best.ox - A.x).toFixed(2), (best.oy - A.y).toFixed(2),
    ((best.ox - A.x) * C.PRINT_MM_PER_PX).toFixed(2), ((best.oy - A.y) * C.PRINT_MM_PER_PX).toFixed(2));
  console.log('→ 模組尺寸比例 %s（實際 QR 邊長 %s canonical px，程式假設 %s）',
    (best.module / baseModule).toFixed(4), (best.module * (S + Q * 2)).toFixed(2), A.size);
}
