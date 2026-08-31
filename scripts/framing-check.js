// 驗證 SETUP.md 寫的「紙至少要佔畫面寬度 50%」是不是真的。
// 直接合成一張「白紙 + 四個黑方塊」的畫面餵給 detectCorners，逐步縮小紙張佔比，
// 找出偵測開始失敗的臨界點。不靠算式，靠實測。
//
// SETUP.md 的「攝影機架設」給的取景建議就是從這裡量出來的。
// 改動 markerDetect 的門檻或 constants 的方塊尺寸，就重跑這支確認建議還成立。
// 用法：node scripts/framing-check.js
const C = require('../src/constants.js');
const { detectCorners } = require('../src/markerDetect.js');

function synth(frameW, frameH, fraction) {
  const data = new Uint8ClampedArray(frameW * frameH * 4);
  data.fill(255);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  // 灰色桌面，紙才不會跟背景連成一片
  for (let i = 0; i < data.length; i += 4) { data[i] = 150; data[i + 1] = 150; data[i + 2] = 150; }

  const paperW = frameW * fraction;
  const scale = paperW / C.CANVAS_W;
  const paperH = C.CANVAS_H * scale;
  const ox = (frameW - paperW) / 2;
  const oy = (frameH - paperH) / 2;
  if (paperH > frameH) return null; // 紙比畫面高，這個佔比不可能

  const put = (x, y, v) => {
    const xi = Math.round(x), yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= frameW || yi >= frameH) return;
    const i = (yi * frameW + xi) * 4;
    data[i] = data[i + 1] = data[i + 2] = v;
  };
  // 白紙
  for (let y = 0; y < paperH; y++) for (let x = 0; x < paperW; x++) put(ox + x, oy + y, 255);
  // 四個黑方塊
  const half = (C.MARKER_SIZE * scale) / 2;
  for (const key of ['tl', 'tr', 'br', 'bl']) {
    const [mx, my] = C.MARKER_CANONICAL[key];
    const cx = ox + mx * scale, cy = oy + my * scale;
    for (let y = -half; y <= half; y += 0.5) for (let x = -half; x <= half; x += 0.5) put(cx + x, cy + y, 0);
  }
  return { imageData: { width: frameW, height: frameH, data }, scale, ox, oy };
}

for (const [name, W, H] of [['720p', 1280, 720], ['1080p', 1920, 1080], ['4K', 3840, 2160]]) {
  let lastOk = null;
  const rows = [];
  for (let f = 0.90; f >= 0.20; f -= 0.02) {
    const s = synth(W, H, f);
    if (!s) continue;
    const got = detectCorners(s.imageData);
    let err = null;
    if (got) {
      err = 0;
      for (const key of ['tl', 'tr', 'br', 'bl']) {
        const [mx, my] = C.MARKER_CANONICAL[key];
        const ex = s.ox + mx * s.scale, ey = s.oy + my * s.scale;
        err = Math.max(err, Math.hypot(got[key][0] - ex, got[key][1] - ey));
      }
      lastOk = { f, err, markerPx: C.MARKER_SIZE * s.scale };
    }
    rows.push({ f: f.toFixed(2), ok: !!got, err: err === null ? '-' : err.toFixed(2) });
  }
  const firstFail = rows.find((r) => !r.ok);
  console.log(`${name.padEnd(6)} 最小可偵測佔比 ${lastOk ? (lastOk.f * 100).toFixed(0) + '%' : '無'}` +
    `（方塊 ${lastOk ? lastOk.markerPx.toFixed(1) : '-'}px，角點誤差 ${lastOk ? lastOk.err.toFixed(2) : '-'}px）` +
    `  首次失敗於 ${firstFail ? firstFail.f : '未失敗'}`);
}
