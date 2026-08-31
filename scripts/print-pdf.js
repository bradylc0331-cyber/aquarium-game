// 把 templates/print.html 轉成可以直接送印的 PDF。
//
// 為什麼要一支腳本而不是叫使用者自己在瀏覽器按列印：列印比例是這整套掃描的地基
// （四角方塊中心距離必須是 273mm），瀏覽器的列印對話框很容易把「符合頁面」留著，
// 縮個 96% 就全毀。這裡直接用 A4 橫式、零邊界、不縮放輸出，印的時候只要選
// 「實際大小」就好。
//
// 用法：node scripts/print-pdf.js [輸出路徑]
const { spawn } = require('node:child_process');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const OUT = process.argv[2] || path.join(ROOT, 'out', '聖經樂園-塗色紙.pdf');
const PORT = 8991;

function resolvePlaywright() {
  for (const candidate of ['playwright', '/opt/node22/lib/node_modules/playwright']) {
    try { return require(candidate); } catch (e) { /* 換下一個 */ }
  }
  console.error('找不到 playwright。這支腳本需要瀏覽器，不在 npm test 的零相依範圍內。');
  process.exit(2);
  return null;
}

(async () => {
  const { chromium } = resolvePlaywright();
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'],
    { cwd: ROOT, stdio: 'ignore' });
  const stop = () => { try { server.kill(); } catch (e) { /* 已經結束了 */ } };
  process.on('exit', stop);
  await new Promise((resolve) => setTimeout(resolve, 1200));

  let browser;
  try {
    browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`http://127.0.0.1:${PORT}/templates/print.html`, { waitUntil: 'networkidle' });
    // 每個人物一頁；等到頁數對得上人物數，才確定 SVG 都畫完了。
    const sheets = await page.evaluate(() => document.querySelectorAll('.sheet').length);
    const species = await page.evaluate(() => window.Species.SPECIES.length);
    if (sheets !== species) throw new Error(`頁數 ${sheets} 對不上人物數 ${species}`);
    if (errors.length) throw new Error(`頁面錯誤：${errors.slice(0, 3).join(' / ')}`);

    await page.pdf({
      path: OUT,
      width: '297mm',
      height: '210mm',
      printBackground: true,
      scale: 1,
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
    });
    console.log(`已輸出 ${sheets} 頁：${OUT}`);
  } catch (error) {
    console.error('產生 PDF 失敗：', error.message);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    stop();
  }
})();
