// 把「顏色影像」跟「黑白遮罩」合成一張透明背景的生物貼圖，再裁到剛好的大小。
// 純資料運算（吃/吐 {width,height,data} 這種 ImageData 形狀的物件），Node 可測，
// 瀏覽器那邊要真的畫到 canvas 上時再包成 `new ImageData(...)`。
(function (root) {
  // 遮罩的灰階亮度直接當作 alpha：邊緣的反鋸齒灰階會變成柔和的半透明邊，不用額外處理。
  function applyMaskToImageData(colorImageData, maskImageData) {
    const { width, height } = colorImageData;
    const out = new Uint8ClampedArray(width * height * 4);
    const c = colorImageData.data, m = maskImageData.data;
    for (let i = 0; i < width * height; i++) {
      const ci = i * 4;
      const alpha = (m[ci] + m[ci + 1] + m[ci + 2]) / 3; // 遮罩是灰階，三個 channel 應該相同
      out[ci] = c[ci];
      out[ci + 1] = c[ci + 1];
      out[ci + 2] = c[ci + 2];
      out[ci + 3] = alpha;
    }
    return { width, height, data: out };
  }

  function boundingBoxOfAlpha(imageData, threshold) {
    const t = threshold == null ? 8 : threshold;
    const { width, height, data } = imageData;
    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const a = data[(y * width + x) * 4 + 3];
        if (a > t) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < minX || maxY < minY) return null; // 整張都是透明的，代表遮罩或顏色資料是空的
    return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  }

  function cropImageData(imageData, box, padding) {
    const pad = padding || 0;
    const { width: srcW, height: srcH, data: src } = imageData;
    const x0 = Math.max(0, box.x - pad);
    const y0 = Math.max(0, box.y - pad);
    const x1 = Math.min(srcW, box.x + box.width + pad);
    const y1 = Math.min(srcH, box.y + box.height + pad);
    const w = x1 - x0, h = y1 - y0;
    const out = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      const srcRowStart = ((y + y0) * srcW + x0) * 4;
      const dstRowStart = y * w * 4;
      out.set(src.subarray(srcRowStart, srcRowStart + w * 4), dstRowStart);
    }
    return { width: w, height: h, data: out };
  }

  function solidColorImageData(width, height, [r, g, b]) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b; data[i * 4 + 3] = 255;
    }
    return { width, height, data };
  }

  // 掃描品質判定：在作品進入場景之前先擋下明顯不能用的結果。
  //
  // 這一關的意義是「壞掉的掃描不該占名額」——場上滿 15 位時，一張沒對準的紙
  // 若被當成作品收下，會把某個小朋友的作品擠掉。所以寧可請他重拍一次。
  function assessExtraction(imageData) {
    const box = boundingBoxOfAlpha(imageData, 24);
    if (!box) return { ok: false, reason: 'empty' };

    const canvasArea = imageData.width * imageData.height;
    const boxArea = box.width * box.height;

    // 幾乎鋪滿整張畫布 = 遮罩沒對準，把白紙本身當成人物了。
    // 這一項要先判：整片白紙同時也會通過下面的面積門檻。
    if (
      box.width / imageData.width > 0.96
      && box.height / imageData.height > 0.96
    ) {
      return { ok: false, reason: 'paper-background' };
    }

    // 面積太小或高度不足：孩子還沒塗、紙沒對準，或只掃到人物的一小截。
    if (boxArea / canvasArea < 0.08 || box.height / imageData.height < 0.35) {
      return { ok: false, reason: 'too-small' };
    }

    return { ok: true, box };
  }

  const api = {
    applyMaskToImageData, boundingBoxOfAlpha, cropImageData, solidColorImageData, assessExtraction,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Extract = api;
})(typeof window !== 'undefined' ? window : globalThis);
