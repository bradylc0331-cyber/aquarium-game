// 用真的攝影機診斷「QR 讀不到」。
//
// 為什麼要一支腳本：這個問題只在實機發生，而人工複製貼上 console 片段既慢又容易
// 出錯。這支腳本直接開一個瀏覽器、接上真的鏡頭、跑完整條對位流程，然後把
// **每一個關卡的數字**印出來——取景比例、四角形心、QR 對比、七位人物各自的比對
// 分數與最佳偏移。看數字就知道卡在哪一關，不必再猜。
//
// 用法（要在有攝影機的那台機器上跑）：
//   npm run serve          # 另一個終端機視窗
//   node scripts/qr-diagnose.js
//
// 預設會開一個看得見的瀏覽器視窗（macOS 第一次要允許攝影機權限）。
// 跑完會自己關掉。加 --headless 可以不開視窗，但 macOS 可能拿不到鏡頭權限。
const path = require('node:path');

const PORT = Number(process.env.PORT || 8933);
const HEADLESS = process.argv.includes('--headless');
// 沒有實體鏡頭時用假的裝置跑一遍，只為了確認這支腳本本身沒壞（數字會是無意義的）。
const FAKE = process.argv.includes('--fake-camera');
const CAMERA_HINT = (process.argv.find((a) => a.startsWith('--camera=')) || '').split('=')[1] || '';

function resolvePlaywright() {
  for (const candidate of ['playwright', '/opt/node22/lib/node_modules/playwright']) {
    try { return require(candidate); } catch (e) { /* 換下一個 */ }
  }
  console.error('找不到 playwright。請先 npm i -D playwright（或 npx playwright install chromium）。');
  process.exit(2);
  return null;
}

// 在頁面裡跑的診斷。回傳純資料，不改動頁面任何狀態。
function inPageDiagnose() {
  const video = document.getElementById('video');
  const corrected = document.getElementById('correctedCanvas');
  if (!video || !video.videoWidth) return { error: '攝影機還沒出畫面' };

  // 1) 取景：從原始畫面直接跑四角偵測
  const raw = document.createElement('canvas');
  raw.width = video.videoWidth;
  raw.height = video.videoHeight;
  raw.getContext('2d').drawImage(video, 0, 0);
  const frame = raw.getContext('2d').getImageData(0, 0, raw.width, raw.height);
  const corners = MarkerDetect.detectCorners(frame);

  const out = {
    frame: { width: raw.width, height: raw.height, aspect: raw.width / raw.height },
    cornersFound: !!corners,
  };
  if (corners) {
    const xs = ['tl', 'tr', 'br', 'bl'].map((k) => corners[k][0]);
    const ys = ['tl', 'tr', 'br', 'bl'].map((k) => corners[k][1]);
    // 方塊中心距離換算回整張紙：中心距 / 紙寬 = (800-64)/800 = 0.92，高度同理
    out.markerSpan = { x: Math.max(...xs) - Math.min(...xs), y: Math.max(...ys) - Math.min(...ys) };
    out.paperFraction = {
      width: out.markerSpan.x / 0.92 / raw.width,
      height: out.markerSpan.y / 0.8869 / raw.height,
    };
    out.margins = {
      top: Math.min(...ys),
      bottom: raw.height - Math.max(...ys),
      left: Math.min(...xs),
      right: raw.width - Math.max(...xs),
    };
    out.corners = corners;
  }

  // 2) QR：直接在「已經拉正的畫面」上比對，並掃描最佳偏移
  const img = corrected.getContext('2d').getImageData(0, 0, corrected.width, corrected.height);
  const AREA = AquariumConstants.QR_AREA;
  const S = BibleQrCode.SIZE;
  const Q = BibleQrCode.QUIET;
  const moduleSize = AREA.size / (S + Q * 2);
  out.qr = { moduleSize };

  const luma = (x, y) => {
    if (x < 0 || y < 0 || x >= img.width || y >= img.height) return 255;
    const i = (y * img.width + x) * 4;
    return img.data[i] * 0.299 + img.data[i + 1] * 0.587 + img.data[i + 2] * 0.114;
  };
  const grab = (offsetX, offsetY) => {
    const samples = [];
    let min = 255;
    let max = 0;
    for (let row = 0; row < S; row++) {
      samples[row] = [];
      for (let col = 0; col < S; col++) {
        const v = luma(
          Math.round(AREA.x + offsetX + (col + Q + 0.5) * moduleSize),
          Math.round(AREA.y + offsetY + (row + Q + 0.5) * moduleSize),
        );
        samples[row][col] = v;
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    return { samples, min, max };
  };
  const scoreOf = (grabbed, text) => {
    const expected = BibleQrCode.matrixForText(text);
    const threshold = (grabbed.min + grabbed.max) / 2;
    let mismatch = 0;
    for (let row = 0; row < S; row++) {
      for (let col = 0; col < S; col++) {
        if ((grabbed.samples[row][col] < threshold) !== expected[row][col]) mismatch++;
      }
    }
    return mismatch / (S * S);
  };

  const nominal = grab(0, 0);
  out.qr.contrast = nominal.max - nominal.min;
  out.qr.scores = [];
  for (const species of Species.SPECIES) {
    let best = { score: 1, offsetX: 0, offsetY: 0 };
    for (let offsetY = -4; offsetY <= 4; offsetY += 0.5) {
      for (let offsetX = -4; offsetX <= 4; offsetX += 0.5) {
        const score = scoreOf(grab(offsetX, offsetY), `BIBLE:${species.id.toUpperCase()}`);
        if (score < best.score) best = { score, offsetX, offsetY };
      }
    }
    out.qr.scores.push({ id: species.id, name: species.name, ...best });
  }
  out.qr.scores.sort((a, b) => a.score - b.score);

  const entries = Species.SPECIES.map((s) => ({ id: s.id, text: `BIBLE:${s.id.toUpperCase()}` }));
  out.qr.identify = BibleQrCode.identify(img, AREA, entries);
  // 有沒有偏移搜尋，決定了這支程式是修正前還是修正後的版本
  out.qr.hasOffsetSearch = /SEARCH_OFFSETS/.test(BibleQrCode.identify.toString())
    || typeof BibleQrCode.identify === 'function' && BibleQrCode.identify.length === 3;
  return out;
}

(async () => {
  const { chromium } = resolvePlaywright();
  const browser = await chromium.launch({
    headless: HEADLESS,
    args: [
      '--use-fake-ui-for-media-stream', // 自動同意網頁的攝影機權限請求
      ...(FAKE ? ['--use-fake-device-for-media-stream'] : []),
    ],
  });
  const context = await browser.newContext({ permissions: ['camera'] });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  try {
    await page.goto(`http://localhost:${PORT}/control.html`, { waitUntil: 'domcontentloaded' });

    // 選攝影機。有多台的話挑名字含 CAMERA_HINT 的（預設挑第一台實體鏡頭）。
    await page.waitForFunction(() => {
      const select = document.getElementById('cameraSelect');
      return select && select.options.length > 0;
    }, { timeout: 20000 });
    const chosen = await page.evaluate((hint) => {
      const select = document.getElementById('cameraSelect');
      const options = [...select.options];
      const match = hint
        ? options.find((o) => o.textContent.toUpperCase().includes(hint.toUpperCase()))
        : options[0];
      if (match) select.value = match.value;
      return match ? match.textContent : null;
    }, CAMERA_HINT);
    console.log(`攝影機：${chosen || '(選不到，用預設)'}`);
    await page.click('#startCameraBtn');

    // 等畫面出來，再等自動對位找到四角
    await page.waitForFunction(() => {
      const v = document.getElementById('video');
      return v && v.videoWidth > 0;
    }, { timeout: 20000 });
    console.log('攝影機已開，等待自動對位…（請把塗色紙放到鏡頭下）');
    await page.waitForFunction(
      () => document.getElementById('calibrationStatus').textContent.includes('已自動找到'),
      { timeout: 45000 },
    ).catch(() => console.log('⚠ 45 秒內沒有自動對位成功，還是先把數字印出來'));
    await page.waitForTimeout(1500); // 讓預覽穩定幾幀

    const report = await page.evaluate(inPageDiagnose);
    if (report.error) throw new Error(report.error);

    const statuses = await page.evaluate(() => ({
      calibration: document.getElementById('calibrationStatus').textContent.trim(),
      auto: document.getElementById('autoStatus').textContent.trim(),
      scan: document.getElementById('scanStatus').textContent.trim(),
      autoOn: document.getElementById('autoModeToggle').checked,
    }));

    const pct = (v) => `${(v * 100).toFixed(1)}%`;
    console.log('\n================ 診斷結果 ================\n');
    console.log('【狀態列】');
    console.log(`  自動模式開關：${statuses.autoOn ? '已開啟' : '✗ 沒開'}`);
    console.log(`  校正：${statuses.calibration}`);
    console.log(`  自動：${statuses.auto}`);
    console.log(`  掃描：${statuses.scan}`);

    console.log('\n【① 取景】');
    console.log(`  畫面 ${report.frame.width}x${report.frame.height}（比例 ${report.frame.aspect.toFixed(3)}）`);
    if (!report.cornersFound) {
      console.log('  ✗ 四角偵測失敗——先解決這一項，後面都不用看');
    } else {
      const maxFraction = (report.frame.height / report.frame.width) * (800 / 566);
      console.log(`  紙佔畫面：寬 ${pct(report.paperFraction.width)}、高 ${pct(report.paperFraction.height)}`);
      console.log(`  這個畫面比例的上限是 ${pct(maxFraction)}（超過高度就爆框、上下方塊被切）`);
      console.log(`  四周留白：上 ${report.margins.top.toFixed(0)}px、下 ${report.margins.bottom.toFixed(0)}px、`
        + `左 ${report.margins.left.toFixed(0)}px、右 ${report.margins.right.toFixed(0)}px`);
      const tooFull = report.paperFraction.width > maxFraction * 0.95;
      const tight = Math.min(report.margins.top, report.margins.bottom) < report.frame.height * 0.06;
      console.log(`  判定：${tooFull || tight ? '✗ 太滿，鏡頭要拉高' : '✓ 取景 OK'}`);
    }

    console.log('\n【② QR】');
    console.log(`  校正後每個模組 ${report.qr.moduleSize.toFixed(2)}px`);
    console.log(`  對比 ${report.qr.contrast.toFixed(0)}（<70 會直接放棄，代表反光／過曝／太暗）`);
    console.log('  七位人物的最佳比對分數（越小越像，門檻 0.24）：');
    for (const s of report.qr.scores) {
      const mark = s.score <= 0.24 ? '✓' : ' ';
      console.log(`    ${mark} ${s.name.padEnd(4)} ${s.score.toFixed(3)}  @偏移 (${s.offsetX}, ${s.offsetY})`);
    }
    console.log(`  identify() 實際回傳：${report.qr.identify ? `${report.qr.identify.id} score ${report.qr.identify.score.toFixed(3)}` : 'null（讀不到）'}`);

    console.log('\n【判讀】');
    const best = report.qr.scores[0];
    if (!report.cornersFound) {
      console.log('  → 四角偵測失敗，拉正的畫面是舊的或空的，QR 的數字都不算數。');
      console.log('     先確認：紙有沒有在鏡頭下、四個黑方塊有沒有被遮住、照明夠不夠。');
    } else if (!statuses.autoOn) {
      console.log('  → 「啟用自動拍攝與延遲登場」沒有勾。QR 讀得到也不會拍。');
    } else if (report.qr.contrast < 70) {
      console.log('  → 對比不足。QR 上有反光或整片過曝／過暗。移開直射光源，或調偵測門檻。');
    } else if (best.score <= 0.24 && !report.qr.identify) {
      console.log('  → 找得到正確答案，但 identify() 沒回傳，代表**偏移搜尋還沒生效**。');
      console.log(`     最佳偏移是 (${best.offsetX}, ${best.offsetY})。請 git pull 後 Cmd-R 重新整理。`);
    } else if (best.score <= 0.24) {
      console.log(`  → QR 讀得到（${best.name}）。問題不在 QR，往下一關看。`);
    } else if (best.score < 0.4) {
      console.log('  → 接近但不夠。多半是取景太滿造成四角形心偏掉，或紙沒攤平。先拉高鏡頭。');
    } else {
      console.log('  → 差很遠。優先確認：紙有沒有放反 180°（QR 要在畫面上方）、');
      console.log('     列印是不是 100% 實際大小、QR 有沒有被手或陰影蓋住。');
    }
    if (errors.length) console.log('\n【頁面 JS 錯誤】\n  ' + errors.slice(0, 3).join('\n  '));
    console.log('\n==========================================\n');
  } catch (error) {
    console.error('診斷失敗：', error.message);
    if (errors.length) console.error('頁面錯誤：', errors.slice(0, 3));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
