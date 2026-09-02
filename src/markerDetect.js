// 每張 A4 塗色紙四角黑色方塊偵測：在畫面四個象限的搜尋窗內找**最靠角落**的深色
// 連通區塊，求其重心當作角點座標。
//
// 為什麼是「最靠角落」而不是「最大」：角標是印在紙的四個角上的，位置固定；
// 但塗得濃的作品（2026-09-02 實機的大衛：紫上衣、深綠裙）會在搜尋窗裡留下
// 比 10mm 角標大十幾倍的色塊。挑最大的就會挑到衣服——那次右下角被判在畫面
// 正中央 (367, 298)，拉正後整張圖扭曲。淺色鉛筆稿碰不到這個問題，濃塗色必踩。只在「校正」這個動作按下時跑一次，不是每幀都跑，
// 自動對位時會先把攝影畫面縮小並限速執行，因此不需要 OpenCV。
(function (root) {
  const CORNERS = ['tl', 'tr', 'br', 'bl'];

  function luminance(data, i) {
    return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }

  // 在 [x0,x1) x [y0,y1) 窗內找深色連通區塊，回傳最靠近 corner 的那塊的重心。
  // corner 省略時退回舊行為（挑最大的），方便單獨測試這支函式。
  function findDarkBlobCentroid(imageData, x0, y0, x1, y1, threshold, corner) {
    const { width, data } = imageData;
    const w = x1 - x0, h = y1 - y0;
    const visited = new Uint8Array(w * h);
    let best = null;

    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const li = (y - y0) * w + (x - x0);
        if (visited[li]) continue;
        const idx = (y * width + x) * 4;
        if (luminance(data, idx) >= threshold) { visited[li] = 1; continue; }

        // flood fill 這一塊連通區
        const stack = [[x, y]];
        visited[li] = 1;
        let count = 0, sumX = 0, sumY = 0;
        let minX = x, maxX = x, minY = y, maxY = y;
        while (stack.length) {
          const [cx, cy] = stack.pop();
          count++; sumX += cx; sumY += cy;
          if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
          const neighbors = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
          for (const [nx, ny] of neighbors) {
            if (nx < x0 || nx >= x1 || ny < y0 || ny >= y1) continue;
            const nli = (ny - y0) * w + (nx - x0);
            if (visited[nli]) continue;
            const nIdx = (ny * width + nx) * 4;
            if (luminance(data, nIdx) >= threshold) { visited[nli] = 1; continue; }
            visited[nli] = 1;
            stack.push([nx, ny]);
          }
        }

        const windowArea = w * h;
        const bboxW = maxX - minX + 1, bboxH = maxY - minY + 1;
        const aspect = bboxW / bboxH;
        const fillRatio = count / (bboxW * bboxH);
        const tooSmall = count < windowArea * 0.002;
        const tooBig = count > windowArea * 0.6;
        const notSquareish = aspect < 0.4 || aspect > 2.5;
        const notSolid = fillRatio < 0.5; // 方塊應該填得很實心，排除細長陰影/邊線
        if (tooSmall || tooBig || notSquareish || notSolid) continue;
        const centroidX = sumX / count, centroidY = sumY / count;
        if (!corner) {
          if (!best || count > best.count) best = { count, cx: centroidX, cy: centroidY };
          continue;
        }
        // 比的是「離角落多遠」。距離一樣時（幾乎不會發生）挑大的，比較像實心方塊。
        const distance = Math.hypot(centroidX - corner[0], centroidY - corner[1]);
        if (!best || distance < best.distance || (distance === best.distance && count > best.count)) {
          best = { count, distance, cx: centroidX, cy: centroidY };
        }
      }
    }
    return best ? [best.cx, best.cy] : null;
  }

  // 回傳 { tl, tr, br, bl } 四個 [x,y]，任一角找不到就回傳 null
  function detectCorners(imageData, opts) {
    const { width, height } = imageData;
    const threshold = (opts && opts.threshold) != null ? opts.threshold : 90;
    const windowFrac = (opts && opts.windowFrac) != null ? opts.windowFrac : 0.35;
    const ww = Math.round(width * windowFrac);
    const wh = Math.round(height * windowFrac);

    const windows = {
      tl: [0, 0, ww, wh],
      tr: [width - ww, 0, width, wh],
      br: [width - ww, height - wh, width, height],
      bl: [0, height - wh, ww, height],
    };
    // 每個搜尋窗「靠外」的那個角，就是要比距離的基準點
    const anchors = {
      tl: [0, 0],
      tr: [width, 0],
      br: [width, height],
      bl: [0, height],
    };

    const result = {};
    for (const key of CORNERS) {
      const [x0, y0, x1, y1] = windows[key];
      const centroid = findDarkBlobCentroid(imageData, x0, y0, x1, y1, threshold, anchors[key]);
      if (!centroid) return null;
      result[key] = centroid;
    }
    return result;
  }

  const api = { detectCorners, findDarkBlobCentroid };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MarkerDetect = api;
})(typeof window !== 'undefined' ? window : globalThis);
