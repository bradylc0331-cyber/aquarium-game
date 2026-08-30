// 3x3 投影變換（homography）：4 組對應點求解、反矩陣、單點/整張影像套用。
// 純數學，不碰 DOM，Node 與瀏覽器都能用。
(function (root) {
  function solveLinearSystem(A, b) {
    const n = A.length;
    const M = A.map((row, i) => row.concat([b[i]]));
    for (let col = 0; col < n; col++) {
      let pivot = col;
      for (let row = col + 1; row < n; row++) {
        if (Math.abs(M[row][col]) > Math.abs(M[pivot][col])) pivot = row;
      }
      if (pivot !== col) [M[col], M[pivot]] = [M[pivot], M[col]];
      const pv = M[col][col];
      if (Math.abs(pv) < 1e-12) throw new Error('homography: singular system (共線或重複點無法求解)');
      for (let row = 0; row < n; row++) {
        if (row === col) continue;
        const factor = M[row][col] / pv;
        for (let k = col; k <= n; k++) M[row][k] -= factor * M[col][k];
      }
    }
    return M.map((row, i) => row[n] / row[i]);
  }

  // src[i] = [x,y] 對應到 dst[i] = [X,Y]，四組點，回傳長度 9 的矩陣（h33 固定為 1）
  function computeHomography(src, dst) {
    if (src.length !== 4 || dst.length !== 4) throw new Error('computeHomography 需要剛好 4 組對應點');
    const A = [];
    const b = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = src[i];
      const [X, Y] = dst[i];
      A.push([x, y, 1, 0, 0, 0, -x * X, -y * X]);
      b.push(X);
      A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]);
      b.push(Y);
    }
    const h = solveLinearSystem(A, b);
    return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
  }

  function invertHomography(H) {
    const [a, b, c, d, e, f, g, h, i] = H;
    const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
    if (Math.abs(det) < 1e-12) throw new Error('invertHomography: 矩陣不可逆');
    const invDet = 1 / det;
    return [
      (e * i - f * h) * invDet, (c * h - b * i) * invDet, (b * f - c * e) * invDet,
      (f * g - d * i) * invDet, (a * i - c * g) * invDet, (c * d - a * f) * invDet,
      (d * h - e * g) * invDet, (b * g - a * h) * invDet, (a * e - b * d) * invDet,
    ];
  }

  function applyHomography(H, x, y) {
    const w = H[6] * x + H[7] * y + H[8];
    return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
  }

  // 用反矩陣做 dest -> source 的反向取樣，避免正向 warp 出現空洞。雙線性內插。
  function warpPerspectiveImageData(srcImageData, invH, destW, destH) {
    const sw = srcImageData.width;
    const sh = srcImageData.height;
    const src = srcImageData.data;
    const out = new Uint8ClampedArray(destW * destH * 4);
    for (let Y = 0; Y < destH; Y++) {
      for (let X = 0; X < destW; X++) {
        const [x, y] = applyHomography(invH, X, Y);
        const di = (Y * destW + X) * 4;
        if (x < 0 || y < 0 || x > sw - 1 || y > sh - 1) continue;
        const x0 = Math.floor(x), y0 = Math.floor(y);
        const x1 = Math.min(x0 + 1, sw - 1), y1 = Math.min(y0 + 1, sh - 1);
        const fx = x - x0, fy = y - y0;
        for (let ch = 0; ch < 4; ch++) {
          const v00 = src[(y0 * sw + x0) * 4 + ch];
          const v10 = src[(y0 * sw + x1) * 4 + ch];
          const v01 = src[(y1 * sw + x0) * 4 + ch];
          const v11 = src[(y1 * sw + x1) * 4 + ch];
          const v0 = v00 + (v10 - v00) * fx;
          const v1 = v01 + (v11 - v01) * fx;
          out[di + ch] = v0 + (v1 - v0) * fy;
        }
      }
    }
    return new ImageData(out, destW, destH);
  }

  const api = { computeHomography, invertHomography, applyHomography, warpPerspectiveImageData };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Homography = api;
})(typeof window !== 'undefined' ? window : globalThis);
