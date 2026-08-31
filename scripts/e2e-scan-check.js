// 掃描管線端對端檢查的執行器。開一個無頭瀏覽器載入 e2e-scan-check.html，
// 把結果印到 stdout，全部通過才回傳 0。
//
// 需要 Playwright 與一個 Chromium。這台機器上：
//   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
// 用法：node scripts/e2e-scan-check.js [port]
const { spawn } = require('node:child_process');
const path = require('node:path');

const PORT = Number(process.argv[2]) || 8931;
const ROOT = path.resolve(__dirname, '..');

function resolvePlaywright() {
  for (const candidate of ['playwright', '/opt/node22/lib/node_modules/playwright']) {
    try { return require(candidate); } catch (e) { /* 換下一個 */ }
  }
  console.error('找不到 playwright。這個檢查需要瀏覽器，不在 npm test 的零相依範圍內。');
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
    await page.goto(`http://127.0.0.1:${PORT}/scripts/e2e-scan-check.html`);
    await page.waitForFunction(() => window.__e2e, { timeout: 120000 });
    const report = await page.evaluate(() => window.__e2e);
    console.log(report);
    if (errors.length) console.error('頁面錯誤：', errors.slice(0, 3));
    const failed = /失敗 (\d+)/.exec(report);
    process.exitCode = (failed && Number(failed[1]) > 0) || errors.length ? 1 : 0;
  } catch (error) {
    console.error('端對端檢查執行失敗：', error.message);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    stop();
  }
})();
