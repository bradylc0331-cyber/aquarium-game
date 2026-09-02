// 開發用靜態伺服器。跟 python3 -m http.server 的差別只有一件事：
// **一律 no-store**。
//
// 為什麼要換掉 python：2026-09-02 修好 qrCode.js 之後，實機測試「還是沒有」，
// 查了才發現瀏覽器載的是快取裡的舊 src/qrCode.js —— python 只送 Last-Modified，
// Chrome 用啟發式快取決定不重新驗證，於是改了程式卻測到舊版本，白繞一圈。
// 現場投影不靠這支（用 npm run build 出的靜態檔），所以開發期直接關掉快取最省事。
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.PORT || 8933);
const ROOT = path.join(__dirname, '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const target = path.join(ROOT, url === '/' ? 'index.html' : url);
  // 不准跳出專案目錄
  if (!path.resolve(target).startsWith(path.resolve(ROOT) + path.sep)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  fs.readFile(target, (err, body) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    }).end(body);
  });
}).listen(PORT, () => {
  console.log(`聖經樂園開發伺服器：http://localhost:${PORT}/control.html （快取已關閉）`);
});
