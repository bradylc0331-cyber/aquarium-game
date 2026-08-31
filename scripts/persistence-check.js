// 作品持久化的驗收：掃描進來的作品在投影分頁重新整理之後要能找回來。
//
// 這件事只有真的重新載入一次才驗得到——單元測試驗得了排序與降級邏輯，
// 驗不到「IndexedDB 真的寫進去、真的讀得回來、還原的順序真的正確」。
//
// 用法：node scripts/persistence-check.js [port]
const { spawn } = require('node:child_process');
const path = require('node:path');

const PORT = Number(process.argv[2]) || 8932;
const ROOT = path.resolve(__dirname, '..');

function resolvePlaywright() {
  for (const candidate of ['playwright', '/opt/node22/lib/node_modules/playwright']) {
    try { return require(candidate); } catch (e) { /* 換下一個 */ }
  }
  console.error('找不到 playwright。這個驗收需要瀏覽器。');
  process.exit(2);
  return null;
}

// 在頁面裡送出 N 張合成的作品，走的是跟 control.html 完全相同的訊息通道。
const INJECT = (count) => {
  const channel = new BroadcastChannel('jeju-aquarium-game');
  const ids = [];
  const species = ['noah', 'moses', 'david', 'daniel', 'jonah', 'shepherd', 'angel'];
  for (let i = 0; i < count; i++) {
    const canvas = document.createElement('canvas');
    canvas.width = 60; canvas.height = 90;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = `hsl(${(i * 47) % 360} 70% 55%)`;
    ctx.fillRect(4, 4, 52, 82);
    const artworkId = `check-${String(i).padStart(2, '0')}-${Date.now()}`;
    ids.push(artworkId);
    channel.postMessage({
      type: 'creature-scanned',
      artworkId,
      speciesId: species[i % species.length],
      textureDataURL: canvas.toDataURL('image/png'),
      ts: Date.now() + i,
    });
  }
  return ids;
};

(async () => {
  const { chromium } = resolvePlaywright();
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'],
    { cwd: ROOT, stdio: 'ignore' });
  const stop = () => { try { server.kill(); } catch (e) { /* 已經結束 */ } };
  process.on('exit', stop);
  await new Promise((resolve) => setTimeout(resolve, 1200));

  let browser;
  let failures = 0;
  const check = (ok, label, detail) => {
    if (!ok) failures++;
    console.log(`${ok ? '✓' : '✗'} ${label}${detail ? `  ${detail}` : ''}`);
  };

  try {
    browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    const url = `http://127.0.0.1:${PORT}/display.html`;

    // 等示範人物**全部**放完再看，否則只抓到放到一半的畫面，
    // 「只有示範人物」這句話就是恆真的，等於沒驗。
    const settle = async (target) => {
      let previous = -1;
      for (let i = 0; i < 40; i++) {
        await target.waitForTimeout(300);
        const now = await target.evaluate(() => window.__bibleDebug.characterCount());
        if (now === previous && now > 0) return now;
        previous = now;
      }
      return previous;
    };

    await page.goto(url);
    await page.waitForFunction(() => window.__bibleDebug && window.__bibleDebug.characterCount() > 0,
      { timeout: 20000 });
    await settle(page);
    const demoOnly = await page.evaluate(() => window.__bibleDebug.artworkIds());
    check(demoOnly.length >= 5 && demoOnly.every((id) => id.startsWith('demo-')),
      '第一次開啟只有示範人物', `場上 ${demoOnly.length} 位`);

    const injected = await page.evaluate(INJECT, 6);
    await page.waitForFunction(
      (ids) => ids.every((id) => window.__bibleDebug.artworkIds().includes(id)),
      injected, { timeout: 20000 },
    );
    check(true, '6 張作品進場', injected.length + ' 張');
    // 給 IndexedDB 的寫入一點時間落地
    await page.waitForTimeout(1200);

    // --- 重新整理，這就是重點 ---
    await page.reload();
    await page.waitForFunction(() => window.__bibleDebug && window.__bibleDebug.characterCount() > 0,
      { timeout: 20000 });
    await page.waitForTimeout(1500);
    const afterReload = await page.evaluate(() => window.__bibleDebug.artworkIds());

    const recovered = injected.filter((id) => afterReload.includes(id));
    check(recovered.length === injected.length, '重新整理後作品全部找回來',
      `${recovered.length}/${injected.length}`);

    // 還原的順序要由舊到新——FIFO 才會先擠掉最舊的那一張
    const positions = injected.map((id) => afterReload.indexOf(id));
    const ordered = positions.every((p, i) => i === 0 || p > positions[i - 1]);
    check(ordered, '還原順序由舊到新（FIFO 才不會擠錯人）', JSON.stringify(positions));

    // 示範人物不該把還原回來的真作品擠掉
    check(afterReload.length <= 15, '總數不超過 15 位', `實際 ${afterReload.length}`);

    // 超過上限時只留最新的 15 張——存不下的舊作品要被清掉，不能無限長大。
    // 斷言看的是**資料庫內容**與「還原總數」，不是「場上人數」：入口一開始
    // 擠不下，還原回來的作品會在 pending 排隊等位子，那是正常行為，
    // 拿場上人數當標準會變成在測進場速度而不是測持久化。
    const many = await page.evaluate(INJECT, 20);
    await page.waitForTimeout(2500);
    const savedIds = await page.evaluate(() => window.__bibleDebug.savedIds());
    check(savedIds.length === 15, '資料庫只留 15 張', `實際 ${savedIds.length}`);
    const newestFive = many.slice(-5);
    check(newestFive.every((id) => savedIds.includes(id)), '留下來的是最新的那幾張',
      newestFive.filter((id) => !savedIds.includes(id)).join(',') || '全在');
    check(!savedIds.includes(injected[0]), '最舊的那一張已經被清掉', injected[0]);

    await page.reload();
    await page.waitForFunction(() => window.__bibleDebug && window.__bibleDebug.characterCount() > 0,
      { timeout: 20000 });
    await page.waitForTimeout(3000);
    const onStage = await page.evaluate(() => window.__bibleDebug.artworkIds());
    const waiting = await page.evaluate(() => window.__bibleDebug.pendingCount());
    const restoredReal = onStage.filter((id) => !id.startsWith('demo-')).length + waiting;
    check(restoredReal === 15, '15 張全部還原（場上 + 排隊中）',
      `場上 ${onStage.length - onStage.filter((id) => id.startsWith('demo-')).length} + 排隊 ${waiting}`);
    check(onStage.length <= 15, '場上不超過 15 位', `實際 ${onStage.length}`);

    // 沒有 IndexedDB 的環境（私密視窗類比）也要開得起來
    const strict = await browser.newContext({ viewport: { width: 800, height: 600 } });
    const blocked = await strict.newPage();
    await blocked.addInitScript(() => {
      Object.defineProperty(window, 'indexedDB', { get() { return undefined; } });
    });
    const pageErrors = [];
    blocked.on('pageerror', (e) => pageErrors.push(String(e)));
    await blocked.goto(url);
    await blocked.waitForFunction(() => window.__bibleDebug && window.__bibleDebug.characterCount() > 0,
      { timeout: 20000 });
    check(pageErrors.length === 0, '沒有 IndexedDB 時畫面照常運作',
      pageErrors.length ? pageErrors[0] : '無錯誤');
    await strict.close();
  } catch (error) {
    failures++;
    console.error('驗收執行失敗：', error.message);
  } finally {
    if (browser) await browser.close();
    stop();
  }

  console.log(failures === 0 ? '\n全部通過' : `\n有 ${failures} 項failed`);
  process.exitCode = failures === 0 ? 0 : 1;
})();
