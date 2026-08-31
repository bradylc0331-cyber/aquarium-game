// 自動拍攝的純邏輯：判斷人物遮罩內是否出現穩定的塗色紙，並產生 30–60 秒登場延遲。
(function (root) {
  function measureInkRatio(imageData, maskImageData, stride = 6) {
    if (!imageData || !maskImageData || imageData.width !== maskImageData.width || imageData.height !== maskImageData.height) {
      throw new Error('自動拍攝偵測需要相同尺寸的畫面與遮罩');
    }
    let ink = 0;
    let samples = 0;
    const step = Math.max(1, Math.floor(stride));
    for (let y = 0; y < imageData.height; y += step) {
      for (let x = 0; x < imageData.width; x += step) {
        const i = (y * imageData.width + x) * 4;
        if (maskImageData.data[i] < 128) continue;
        samples++;
        const r = imageData.data[i];
        const g = imageData.data[i + 1];
        const b = imageData.data[i + 2];
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        // 黑色線稿或彩色筆跡都算「有作品」；白紙與輕微光影不算。
        if (max < 205 || max - min > 26) ink++;
      }
    }
    return samples ? ink / samples : 0;
  }

  function randomDelayMs(minSeconds = 30, maxSeconds = 60, random = Math.random) {
    const min = Math.max(0, Number(minSeconds) || 0);
    const max = Math.max(min, Number(maxSeconds) || min);
    return Math.round((min + random() * (max - min)) * 1000);
  }

  class StableArtworkDetector {
    constructor(options = {}) {
      this.presentThreshold = options.presentThreshold || 0.018;
      this.absentThreshold = options.absentThreshold || 0.008;
      this.stableFramesNeeded = options.stableFrames || 8;
      this.removalFramesNeeded = options.removalFrames || 6;
      this.maxStableDelta = options.maxStableDelta || 0.004;
      this.reset();
    }

    reset() {
      this.state = 'ready';
      this.previousRatio = null;
      this.stableFrames = 0;
      this.removalFrames = 0;
    }

    markCaptured() {
      this.state = 'waiting-removal';
      this.stableFrames = 0;
      this.removalFrames = 0;
    }

    update(ratio) {
      if (this.state === 'waiting-removal') {
        if (ratio < this.absentThreshold) this.removalFrames++;
        else this.removalFrames = 0;
        if (this.removalFrames >= this.removalFramesNeeded) {
          this.reset();
          return 'removed';
        }
        return null;
      }

      const stable = this.previousRatio !== null && Math.abs(ratio - this.previousRatio) <= this.maxStableDelta;
      this.stableFrames = ratio >= this.presentThreshold && stable ? this.stableFrames + 1 : 0;
      this.previousRatio = ratio;
      if (this.stableFrames >= this.stableFramesNeeded) {
        this.markCaptured();
        return 'capture';
      }
      return null;
    }
  }

  const api = { measureInkRatio, randomDelayMs, StableArtworkDetector };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AutoCapture = api;
})(typeof window !== 'undefined' ? window : globalThis);
