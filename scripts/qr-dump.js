// qr-diagnose 的下一層：把「相機到底拍到什麼」存成圖，並做一個決定性的對照實驗。
//
// 要回答的問題：QR 讀不到，是因為
//   (A) 800px 校正畫布把細節縮掉了 —— 那就改成直接從原始畫面取樣，程式改一改就好；
//   (B) 鏡頭本來就沒拍到那個細節（模組 0.9mm、C270 定焦）—— 那只能把 QR 印大。
//
// 作法：同一張畫面，用兩條路徑取樣同一個 QR，比分數。
//   路徑 1：warp 成 800x566 再取樣（＝目前 identify() 走的路）
//   路徑 2：用 homography 直接把 21x21 個模組中心點映射回原始畫面取樣（零重採樣損失）
//
// 順便存四張圖到 output/qr-dump/，還有量「應該用哪組角點」——
// 目前 app 是在 640 寬的縮圖上找角點再乘 2，這裡把全解析度的角點也一起印出來比。
//
// 用法：
//   node scripts/qr-dump.js --camera=C270
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.PORT || 8933);
const CAMERA_HINT = (process.argv.find((a) => a.startsWith('--camera=')) || '').split('=')[1] || '';
const OUT_DIR = path.join(__dirname, '..', 'output', 'qr-dump');

function resolvePlaywright() {
  const candidates = [
    'playwright',
    path.join(process.env.HOME || '', '.local/pw/node_modules/playwright'),
    '/opt/node22/lib/node_modules/playwright',
  ];
  for (const c of candidates) {
    try { return require(c); } catch (e) { /* 換下一個 */ }
  }
  console.error('找不到 playwright。試過：\n  ' + candidates.join('\n  '));
  process.exit(2);
}

function inPageDump() {
  const { MARKER_CANONICAL, QR_AREA, CANVAS_W, CANVAS_H } = AquariumConstants;
  const S = BibleQrCode.SIZE;
  const Q = BibleQrCode.QUIET;
  const video = document.getElementById('video');
  if (!video || !video.videoWidth) return { error: '攝影機還沒出畫面' };

  const raw = document.createElement('canvas');
  raw.width = video.videoWidth;
  raw.height = video.videoHeight;
  const rctx = raw.getContext('2d', { willReadFrequently: true });
  rctx.drawImage(video, 0, 0);
  const frame = rctx.getImageData(0, 0, raw.width, raw.height);

  // ---- 兩種角點：全解析度 vs app 實際用的 640 縮圖 ----
  const cornersFull = MarkerDetect.detectCorners(frame);
  const threshold = Number(document.getElementById('thresholdSlider').value);
  const small = document.createElement('canvas');
  const k = 640 / raw.width;
  small.width = Math.round(raw.width * k);
  small.height = Math.round(raw.height * k);
  const sctx = small.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(video, 0, 0, small.width, small.height);
  const sframe = sctx.getImageData(0, 0, small.width, small.height);
  const cornersSmall = MarkerDetect.detectCorners(sframe, { threshold, windowFrac: 0.46 });
  let cornersApp = null;
  if (cornersSmall) {
    cornersApp = {};
    const sx = raw.width / small.width;
    const sy = raw.height / small.height;
    for (const [key, [x, y]] of Object.entries(cornersSmall)) cornersApp[key] = [x * sx, y * sy];
  }
  if (!cornersFull) return { error: '全解析度找不到四角' };

  const cornerDelta = cornersApp
    ? Object.fromEntries(['tl', 'tr', 'br', 'bl'].map((key) => [key, [
        +(cornersApp[key][0] - cornersFull[key][0]).toFixed(2),
        +(cornersApp[key][1] - cornersFull[key][1]).toFixed(2),
      ]]))
    : null;

  const dst = [MARKER_CANONICAL.tl, MARKER_CANONICAL.tr, MARKER_CANONICAL.br, MARKER_CANONICAL.bl];
  const src = [cornersFull.tl, cornersFull.tr, cornersFull.br, cornersFull.bl];
  const H = Homography.computeHomography(src, dst);
  const invH = Homography.invertHomography(H);

  // ---- 原始畫面上的雙線性取樣 ----
  const sampleRaw = (fx, fy) => {
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const at = (x, y) => {
      if (x < 0 || y < 0 || x >= frame.width || y >= frame.height) return 255;
      const i = (y * frame.width + x) * 4;
      return frame.data[i] * 0.299 + frame.data[i + 1] * 0.587 + frame.data[i + 2] * 0.114;
    };
    return at(x0, y0) * (1 - tx) * (1 - ty) + at(x0 + 1, y0) * tx * (1 - ty)
      + at(x0, y0 + 1) * (1 - tx) * ty + at(x0 + 1, y0 + 1) * tx * ty;
  };

  const moduleSize = QR_AREA.size / (S + Q * 2);
  // 一個 canonical px 在原始畫面上等於幾 px（拿 QR 中心附近量）
  const c0 = Homography.applyHomography(invH, QR_AREA.x + QR_AREA.size / 2, QR_AREA.y + QR_AREA.size / 2);
  const c1 = Homography.applyHomography(invH, QR_AREA.x + QR_AREA.size / 2 + 1, QR_AREA.y + QR_AREA.size / 2);
  const framePxPerCanonical = Math.hypot(c1[0] - c0[0], c1[1] - c0[1]);
  const moduleInFramePx = moduleSize * framePxPerCanonical;

  const grabRaw = (offsetX, offsetY, radius) => {
    const samples = [];
    let min = 255, max = 0;
    for (let row = 0; row < S; row++) {
      samples[row] = [];
      for (let col = 0; col < S; col++) {
        const cx = QR_AREA.x + offsetX + (col + Q + 0.5) * moduleSize;
        const cy = QR_AREA.y + offsetY + (row + Q + 0.5) * moduleSize;
        let sum = 0, count = 0;
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const [fx, fy] = Homography.applyHomography(invH, cx + dx * 0.3, cy + dy * 0.3);
            sum += sampleRaw(fx, fy);
            count++;
          }
        }
        const v = sum / count;
        samples[row][col] = v;
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    return { samples, min, max };
  };

  const warped = Homography.warpPerspectiveImageData(frame, invH, CANVAS_W, CANVAS_H);
  const grabWarped = (offsetX, offsetY) => {
    const samples = [];
    let min = 255, max = 0;
    for (let row = 0; row < S; row++) {
      samples[row] = [];
      for (let col = 0; col < S; col++) {
        const x = Math.round(QR_AREA.x + offsetX + (col + Q + 0.5) * moduleSize);
        const y = Math.round(QR_AREA.y + offsetY + (row + Q + 0.5) * moduleSize);
        const i = (y * warped.width + x) * 4;
        const v = warped.data[i] * 0.299 + warped.data[i + 1] * 0.587 + warped.data[i + 2] * 0.114;
        samples[row][col] = v;
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    return { samples, min, max };
  };

  const scoreOf = (grabbed, text) => {
    const expected = BibleQrCode.matrixForText(text);
    const threshold2 = (grabbed.min + grabbed.max) / 2;
    let mismatch = 0;
    for (let row = 0; row < S; row++) {
      for (let col = 0; col < S; col++) {
        if ((grabbed.samples[row][col] < threshold2) !== expected[row][col]) mismatch++;
      }
    }
    return mismatch / (S * S);
  };

  // 每個偏移只取樣一次，七個人物共用（先前寫成每人各掃一遍，會白算七倍）
  const searchBest = (grab) => {
    const best = new Map(Species.SPECIES.map((sp) => [sp.id, { score: 1, offsetX: 0, offsetY: 0, contrast: 0 }]));
    for (let oy = -4; oy <= 4; oy += 0.5) {
      for (let ox = -4; ox <= 4; ox += 0.5) {
        const g = grab(ox, oy);
        const contrast = g.max - g.min;
        for (const sp of Species.SPECIES) {
          const score = scoreOf(g, `BIBLE:${sp.id.toUpperCase()}`);
          const cur = best.get(sp.id);
          if (score < cur.score) best.set(sp.id, { score, offsetX: ox, offsetY: oy, contrast });
        }
      }
    }
    return Species.SPECIES
      .map((sp) => ({ id: sp.id, name: sp.name, ...best.get(sp.id) }))
      .sort((a, b) => a.score - b.score);
  };

  const nominalWarped = grabWarped(0, 0);
  const nominalRaw = grabRaw(0, 0, 1);

  // ---- 銳利度：QR 區域在原始畫面上的 Laplacian 變異數 ----
  const qrCornerA = Homography.applyHomography(invH, QR_AREA.x, QR_AREA.y);
  const qrCornerB = Homography.applyHomography(invH, QR_AREA.x + QR_AREA.size, QR_AREA.y + QR_AREA.size);
  const bx0 = Math.max(1, Math.floor(Math.min(qrCornerA[0], qrCornerB[0])));
  const by0 = Math.max(1, Math.floor(Math.min(qrCornerA[1], qrCornerB[1])));
  const bx1 = Math.min(frame.width - 2, Math.ceil(Math.max(qrCornerA[0], qrCornerB[0])));
  const by1 = Math.min(frame.height - 2, Math.ceil(Math.max(qrCornerA[1], qrCornerB[1])));
  let lapSum = 0, lapSqSum = 0, lapN = 0;
  for (let y = by0; y <= by1; y++) {
    for (let x = bx0; x <= bx1; x++) {
      const lap = -4 * sampleRaw(x, y) + sampleRaw(x - 1, y) + sampleRaw(x + 1, y)
        + sampleRaw(x, y - 1) + sampleRaw(x, y + 1);
      lapSum += lap; lapSqSum += lap * lap; lapN++;
    }
  }
  const lapVar = lapN ? lapSqSum / lapN - (lapSum / lapN) ** 2 : 0;

  // ---- 出圖 ----
  const toURL = (canvas) => canvas.toDataURL('image/png');
  const warpedCanvas = document.createElement('canvas');
  warpedCanvas.width = CANVAS_W; warpedCanvas.height = CANVAS_H;
  warpedCanvas.getContext('2d').putImageData(warped, 0, 0);

  const ZOOM = 8;
  // (a) identify() 真正看到的：從 800px 校正畫布切下來放大
  const cropWarped = document.createElement('canvas');
  cropWarped.width = QR_AREA.size * ZOOM; cropWarped.height = QR_AREA.size * ZOOM;
  const cw = cropWarped.getContext('2d');
  cw.imageSmoothingEnabled = false;
  cw.drawImage(warpedCanvas, QR_AREA.x, QR_AREA.y, QR_AREA.size, QR_AREA.size,
    0, 0, cropWarped.width, cropWarped.height);

  // (b) 相機真正拍到的：直接從原始畫面用 homography 取樣
  const cropRaw = document.createElement('canvas');
  cropRaw.width = QR_AREA.size * ZOOM; cropRaw.height = QR_AREA.size * ZOOM;
  const crctx = cropRaw.getContext('2d');
  const crImg = crctx.createImageData(cropRaw.width, cropRaw.height);
  for (let v = 0; v < cropRaw.height; v++) {
    for (let u = 0; u < cropRaw.width; u++) {
      const [fx, fy] = Homography.applyHomography(invH, QR_AREA.x + u / ZOOM, QR_AREA.y + v / ZOOM);
      const g = Math.max(0, Math.min(255, sampleRaw(fx, fy)));
      const i = (v * cropRaw.width + u) * 4;
      crImg.data[i] = crImg.data[i + 1] = crImg.data[i + 2] = g;
      crImg.data[i + 3] = 255;
    }
  }
  crctx.putImageData(crImg, 0, 0);

  // (c) 標準答案：分數最好的那個人物，照同樣尺度畫出來
  const rawResults = searchBest((ox, oy) => grabRaw(ox, oy, 1));
  const warpedResults = searchBest(grabWarped);
  const expectedCanvas = document.createElement('canvas');
  expectedCanvas.width = QR_AREA.size * ZOOM; expectedCanvas.height = QR_AREA.size * ZOOM;
  const ex = expectedCanvas.getContext('2d');
  ex.fillStyle = '#fff'; ex.fillRect(0, 0, expectedCanvas.width, expectedCanvas.height);
  const expectedMatrix = BibleQrCode.matrixForText(`BIBLE:${rawResults[0].id.toUpperCase()}`);
  ex.fillStyle = '#000';
  for (let row = 0; row < S; row++) {
    for (let col = 0; col < S; col++) {
      if (!expectedMatrix[row][col]) continue;
      ex.fillRect((col + Q) * moduleSize * ZOOM, (row + Q) * moduleSize * ZOOM,
        moduleSize * ZOOM, moduleSize * ZOOM);
    }
  }

  return {
    frame: { width: raw.width, height: raw.height },
    corners: { full: cornersFull, app: cornersApp, delta: cornerDelta },
    geometry: {
      moduleSizeCanonical: +moduleSize.toFixed(3),
      framePxPerCanonical: +framePxPerCanonical.toFixed(3),
      moduleInFramePx: +moduleInFramePx.toFixed(2),
      qrBoxInFrame: [bx1 - bx0, by1 - by0],
    },
    sharpness: { laplacianVariance: +lapVar.toFixed(1) },
    contrast: {
      warpedNominal: +(nominalWarped.max - nominalWarped.min).toFixed(1),
      rawNominal: +(nominalRaw.max - nominalRaw.min).toFixed(1),
    },
    scores: { warped: warpedResults, raw: rawResults },
    images: {
      'frame.png': toURL(raw),
      'warped.png': toURL(warpedCanvas),
      'qr-from-warped.png': toURL(cropWarped),
      'qr-from-camera.png': toURL(cropRaw),
      'qr-expected.png': toURL(expectedCanvas),
    },
  };
}

(async () => {
  const { chromium } = resolvePlaywright();
  const browser = await chromium.launch({ headless: false, args: ['--use-fake-ui-for-media-stream'] });
  const page = await (await browser.newContext({ permissions: ['camera'] })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  try {
    await page.goto(`http://localhost:${PORT}/control.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      const s = document.getElementById('cameraSelect');
      return s && s.options.length > 0;
    }, { timeout: 20000 });
    const chosen = await page.evaluate((hint) => {
      const s = document.getElementById('cameraSelect');
      const m = hint ? [...s.options].find((o) => o.textContent.toUpperCase().includes(hint.toUpperCase())) : s.options[0];
      if (m) s.value = m.value;
      return m ? m.textContent : null;
    }, CAMERA_HINT);
    console.log(`攝影機：${chosen || '(選不到，用預設)'}`);
    await page.click('#startCameraBtn');
    await page.waitForFunction(() => {
      const v = document.getElementById('video');
      return v && v.videoWidth > 0;
    }, { timeout: 30000 });
    console.log('攝影機已開，等待自動對位…（塗色紙放著不用動）');
    await page.waitForFunction(
      () => document.getElementById('calibrationStatus').textContent.includes('已自動找到'),
      { timeout: 45000 },
    ).catch(() => console.log('⚠ 45 秒沒自動對位成功，還是先把數字印出來'));
    await page.waitForTimeout(1500);

    const r = await page.evaluate(inPageDump);
    if (r.error) throw new Error(r.error);

    fs.mkdirSync(OUT_DIR, { recursive: true });
    for (const [name, url] of Object.entries(r.images)) {
      fs.writeFileSync(path.join(OUT_DIR, name), Buffer.from(url.split(',')[1], 'base64'));
    }
    const { images, ...report } = r;
    fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));

    console.log('\n============ QR DUMP ============\n');
    console.log(`畫面 ${r.frame.width}x${r.frame.height}`);
    console.log('\n【幾何】');
    console.log(`  每個模組：校正後 ${r.geometry.moduleSizeCanonical}px、原始畫面 ${r.geometry.moduleInFramePx}px`);
    console.log(`  QR 在原始畫面上佔 ${r.geometry.qrBoxInFrame[0]}x${r.geometry.qrBoxInFrame[1]} px`);
    console.log(`  銳利度（Laplacian 變異數，越大越銳利）：${r.sharpness.laplacianVariance}`);
    console.log('\n【角點：全解析度 vs app 用的 640 縮圖】');
    if (r.corners.delta) {
      for (const [k2, d] of Object.entries(r.corners.delta)) console.log(`  ${k2}: 差 (${d[0]}, ${d[1]}) px`);
    } else {
      console.log('  640 縮圖找不到四角（app 的偵測路徑會失敗）');
    }
    console.log('\n【對照實驗：同一張畫面，兩條取樣路徑】');
    console.log(`  路徑1 warp 成 800px 再取樣（＝現在的 identify()）  對比 ${r.contrast.warpedNominal}`);
    for (const s of r.scores.warped.slice(0, 3)) {
      console.log(`     ${s.name.padEnd(4)} ${s.score.toFixed(3)} @(${s.offsetX}, ${s.offsetY})`);
    }
    console.log(`  路徑2 直接從原始畫面取樣（零重採樣）              對比 ${r.contrast.rawNominal}`);
    for (const s of r.scores.raw.slice(0, 3)) {
      console.log(`     ${s.name.padEnd(4)} ${s.score.toFixed(3)} @(${s.offsetX}, ${s.offsetY})`);
    }
    console.log('\n【判讀】');
    const bw = r.scores.warped[0], br = r.scores.raw[0];
    if (br.score <= 0.24 && bw.score > 0.24) {
      console.log('  → 資訊在原始畫面裡，是 800px 校正畫布縮掉的。改成直接從原始畫面取樣就能修，不用重印。');
    } else if (br.score > 0.4) {
      console.log('  → 兩條路徑都接近亂猜，代表鏡頭根本沒拍到 QR 的細節（模組太小／失焦）。');
      console.log('     這是硬體/尺寸問題，改程式救不回來——要把 QR 印大或把鏡頭拉近。');
    } else {
      console.log('  → 原始畫面稍微好一點但還是不夠，兩邊都要動：QR 放大 + 取樣改走原始畫面。');
    }
    if (errors.length) console.log('\n【頁面錯誤】\n  ' + errors.slice(0, 3).join('\n  '));
    console.log(`\n圖存在：${OUT_DIR}`);
    console.log('\n=================================\n');
  } catch (e) {
    console.error('失敗：', e.message);
    if (errors.length) console.error('頁面錯誤：', errors.slice(0, 3));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
