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
      // 連續幾次「四角偵測不到」才算紙已經離開鏡頭。這個計數走的是四角偵測
      // 的節奏（約 650ms 一次），不是預覽的 140ms，所以次數不能跟 removalFrames
      // 混用——3 次大約 2 秒，換紙時紙一定被遮住或拿起超過這個時間，而手短暫
      // 掃過鏡頭則不會。
      this.sheetAbsentChecksNeeded = options.sheetAbsentChecks || 3;
      this.reset();
    }

    reset() {
      this.state = 'ready';
      this.previousRatio = null;
      this.stableFrames = 0;
      this.removalFrames = 0;
      this.absentChecks = 0;
      this.sheetAbsent = false;
    }

    markCaptured() {
      this.state = 'waiting-removal';
      this.stableFrames = 0;
      this.removalFrames = 0;
      this.absentChecks = 0;
      this.sheetAbsent = false;
    }

    // 由控制台在「真的跑過一次四角偵測」時呼叫，present 就是有沒有找到四角。
    // 不要在被節流跳過的那些 tick 呼叫——那代表「這次沒看」，不是「沒看到」。
    noteSheetCheck(present) {
      if (present) {
        this.absentChecks = 0;
        this.sheetAbsent = false;
        return;
      }
      this.absentChecks++;
      if (this.absentChecks >= this.sheetAbsentChecksNeeded) this.sheetAbsent = true;
    }

    update(ratio) {
      if (this.state === 'waiting-removal') {
        // 「作品已經離開」有兩種訊號，成立一種就夠：
        //
        // ① 四角偵測不到 —— 紙不在鏡頭下。這條與桌面顏色無關，是主要依據。
        // ② 遮罩區域接近全白 —— 紙還在但上面沒有作品。這條只在鏡頭下是白色
        //    表面時才成立，木桌或深色桌墊算出來的 ink ratio 會是 1.0，
        //    永遠低不過門檻。原本只有這一條，所以第一張拍完之後就再也回不到
        //    待機，第二張怎麼放都不會拍（實機驗收踩到的）。
        if (this.sheetAbsent) {
          this.reset();
          return 'removed';
        }
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
