// 生物的游動行為。座標計算（motionOffset）是純函式，可以在 Node 測；
// 真的畫到 canvas 上的部分需要 CanvasRenderingContext2D，只能在瀏覽器跑。
(function (root) {
  // 依照 species.swim.style，給定經過的時間 t（秒）跟該生物的個體參數，
  // 回傳「疊加在等速水平前進之上」的位移／旋轉／縮放偏移量。
  function motionOffset(style, t, params) {
    const amp = params.amplitude, freq = params.freq, phase = params.phase || 0;
    switch (style) {
      case 'pulse': // 水母：主要垂直漂浮，鐘罩會脈動
        return {
          yOffset: amp * Math.sin(freq * t + phase),
          rotation: 0,
          scaleX: 1,
          scaleY: 1 + 0.12 * Math.sin(freq * t * 2.4 + phase),
        };
      case 'crawl': // 海星：幾乎不動，貼著缸底緩慢挪動
        return {
          yOffset: amp * 0.2 * Math.sin(freq * t + phase),
          rotation: 0.05 * Math.sin(freq * t * 0.5 + phase),
          scaleX: 1,
          scaleY: 1,
        };
      case 'drift': { // 章魚：緩慢漂浮，觸手方向的搖擺用旋轉表示
        const dy = amp * Math.sin(freq * t + phase);
        return {
          yOffset: dy,
          rotation: 0.12 * Math.sin(freq * t * 0.7 + phase),
          scaleX: 1,
          scaleY: 1,
        };
      }
      case 'glide': { // 海龜：慢速滑行，輕微上下起伏，方向跟位移連動小幅度傾斜
        const dy = amp * Math.sin(freq * t + phase);
        const slope = amp * freq * Math.cos(freq * t + phase);
        return { yOffset: dy, rotation: Math.atan(slope / 60) * 0.4, scaleX: 1, scaleY: 1 };
      }
      case 'arc': { // 海豚：大幅度弧線衝刺，像在跳躍
        const dy = -Math.abs(amp * Math.sin(freq * t + phase)); // 只往上拱，像躍出水面又下潛
        const slope = -amp * freq * Math.cos(freq * t + phase);
        return { yOffset: dy, rotation: Math.atan(slope / 80), scaleX: 1, scaleY: 1 };
      }
      case 'fish':
      default: { // 一般魚類：S 形游動 + 尾巴擺動造成的輕微縮放
        const dy = amp * Math.sin(freq * t + phase);
        const slope = amp * freq * Math.cos(freq * t + phase);
        return {
          yOffset: dy,
          rotation: Math.atan(slope / 60) * 0.6,
          scaleX: 1 + 0.05 * Math.sin(freq * t * 4 + phase),
          scaleY: 1,
        };
      }
    }
  }

  function randRange([min, max]) {
    return min + Math.random() * (max - min);
  }

  class Creature {
    constructor({ image, species, canvasWidth, canvasHeight }) {
      this.image = image;
      this.species = species;
      this.canvasWidth = canvasWidth;
      this.canvasHeight = canvasHeight;

      const swim = species.swim;
      this.style = swim.style;
      this.speed = randRange(swim.speed) * (Math.random() < 0.5 ? 1 : -1);
      this.amplitude = randRange(swim.amplitude);
      this.freq = randRange(swim.freq);
      this.phase = Math.random() * Math.PI * 2;
      this.sizeScale = swim.sizeScale || 1;

      const depthBand = 0.25 + Math.random() * 0.6; // 缸內深淺，順便決定畫面比例大小
      this.baseY = depthBand * canvasHeight;
      this.depthScale = 0.6 + depthBand * 0.6;

      const aspect = image.height / image.width;
      this.width = 90 * this.sizeScale * this.depthScale;
      this.height = this.width * aspect;

      this.x = Math.random() * canvasWidth;
    }

    update(dt, t) {
      this.x += this.speed * dt;
      const margin = this.width;
      if (this.speed > 0 && this.x - margin > this.canvasWidth) this.x = -margin;
      if (this.speed < 0 && this.x + margin < 0) this.x = this.canvasWidth + margin;
    }

    draw(ctx, t) {
      const off = motionOffset(this.style, t, { amplitude: this.amplitude, freq: this.freq, phase: this.phase });
      const y = this.baseY + off.yOffset;
      const facingRight = this.speed > 0;

      ctx.save();
      ctx.translate(this.x, y);
      ctx.rotate(off.rotation * (facingRight ? 1 : -1));
      ctx.scale((facingRight ? 1 : -1) * off.scaleX, off.scaleY);
      ctx.drawImage(this.image, -this.width / 2, -this.height / 2, this.width, this.height);
      ctx.restore();
    }
  }

  const api = { Creature, motionOffset };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CreatureModule = api;
})(typeof window !== 'undefined' ? window : globalThis);
