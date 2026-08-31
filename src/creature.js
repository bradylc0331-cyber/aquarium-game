// 人物的移動／飄浮行為。座標計算（motionOffset）是純函式，可以在 Node 測；
// 真的畫到 canvas 上的部分需要 CanvasRenderingContext2D，只能在瀏覽器跑。
(function (root) {
  // 依照 species.swim.style，給定經過的時間 t（秒）跟該人物的個體參數，
  // 回傳「疊加在等速水平前進之上」的位移／旋轉／縮放偏移量。
  function motionOffset(style, t, params) {
    const amp = params.amplitude, freq = params.freq, phase = params.phase || 0;
    switch (style) {
      case 'walk': { // 人物：腳踩地面前進，只有很小的踏步起伏與身體重心擺動
        const step = Math.sin(freq * t + phase);
        return {
          yOffset: -Math.abs(step) * amp,
          rotation: 0.012 * Math.sin(freq * t * 0.5 + phase),
          scaleX: 1,
          scaleY: 1 + 0.008 * Math.abs(step),
        };
      }
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

  function walkPose(t, params) {
    const step = Math.sin(params.freq * t + (params.phase || 0));
    const maxAngle = params.maxAngle == null ? 0.105 : params.maxAngle;
    return {
      step,
      leftAngle: step * maxAngle,
      rightAngle: -step * maxAngle,
      leftFront: step >= 0,
    };
  }

  function drawImagePart(ctx, image, sx, sy, sw, sh, dx, dy, dw, dh) {
    if (sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0) return;
    ctx.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
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

      this.isGrounded = this.style === 'walk' || swim.grounded === true;
      // 走路人物只出現在草坡／道路所在的下半部；遠處人物較小，形成自然景深。
      const depthBand = this.isGrounded
        ? 0.70 + Math.random() * 0.17
        : 0.25 + Math.random() * 0.6;
      this.baseY = depthBand * canvasHeight;
      this.depthScale = this.isGrounded
        ? 0.72 + ((depthBand - 0.70) / 0.17) * 0.34
        : 0.6 + depthBand * 0.6;

      const aspect = image.height / image.width;
      const baseWidth = Math.max(78, Math.min(132, canvasHeight * 0.115));
      this.width = baseWidth * this.sizeScale * this.depthScale;
      this.height = this.width * aspect;

      this.x = Math.random() * canvasWidth;
    }

    update(dt, t) {
      this.x += this.speed * dt;
      const margin = this.width;
      if (this.speed > 0 && this.x - margin > this.canvasWidth) this.x = -margin;
      if (this.speed < 0 && this.x + margin < 0) this.x = this.canvasWidth + margin;
    }

    drawWalkingImage(ctx, t) {
      const image = this.image;
      const iw = image.width;
      const ih = image.height;
      const rig = this.species.swim.rig || { legLeft: 0.34, legRight: 0.66, legTop: 0.74 };
      const legLeft = Math.max(0, Math.min(iw, rig.legLeft * iw));
      const legRight = Math.max(legLeft, Math.min(iw, rig.legRight * iw));
      const legTop = Math.max(0, Math.min(ih, rig.legTop * ih));
      const legMiddle = (legLeft + legRight) / 2;
      const dx = -this.width / 2;
      const dy = -this.height / 2;
      const xScale = this.width / iw;
      const yScale = this.height / ih;
      const pose = walkPose(t, { freq: this.freq, phase: this.phase, maxAngle: rig.maxAngle });

      // 頭、身體、衣袍，以及腿部範圍以外的手杖／羊／魚保持完整。
      drawImagePart(ctx, image, 0, 0, iw, legTop + 1, dx, dy, this.width, (legTop + 1) * yScale);
      drawImagePart(ctx, image, 0, legTop, legLeft + 1, ih - legTop,
        dx, dy + legTop * yScale, (legLeft + 1) * xScale, (ih - legTop) * yScale);
      drawImagePart(ctx, image, legRight - 1, legTop, iw - legRight + 1, ih - legTop,
        dx + (legRight - 1) * xScale, dy + legTop * yScale,
        (iw - legRight + 1) * xScale, (ih - legTop) * yScale);

      const drawLeg = (sx, sw, angle) => {
        const pivotX = dx + (sx + sw / 2) * xScale;
        const pivotY = dy + legTop * yScale;
        ctx.save();
        ctx.translate(pivotX, pivotY);
        ctx.rotate(angle);
        ctx.translate(-pivotX, -pivotY);
        drawImagePart(ctx, image, sx, legTop, sw, ih - legTop,
          dx + sx * xScale, pivotY, sw * xScale, (ih - legTop) * yScale);
        ctx.restore();
      };

      // 往後的腿先畫、往前的腿後畫，交會時仍有自然的前後層次。
      if (pose.leftFront) {
        drawLeg(legMiddle, legRight - legMiddle, pose.rightAngle);
        drawLeg(legLeft, legMiddle - legLeft, pose.leftAngle);
      } else {
        drawLeg(legLeft, legMiddle - legLeft, pose.leftAngle);
        drawLeg(legMiddle, legRight - legMiddle, pose.rightAngle);
      }
    }

    draw(ctx, t) {
      const off = motionOffset(this.style, t, { amplitude: this.amplitude, freq: this.freq, phase: this.phase });
      // grounded 人物的 baseY 是腳底位置；其他角色仍以圖片中心為定位點。
      const y = this.isGrounded
        ? this.baseY - this.height / 2 + off.yOffset
        : this.baseY + off.yOffset;
      const facingRight = this.speed > 0;

      if (this.isGrounded) {
        ctx.save();
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = '#4c351d';
        ctx.beginPath();
        ctx.ellipse(this.x, this.baseY + 2, this.width * 0.3, Math.max(3, this.width * 0.055), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      ctx.save();
      ctx.translate(this.x, y);
      ctx.rotate(off.rotation * (facingRight ? 1 : -1));
      const flip = this.species.swim.noFlip ? 1 : (facingRight ? 1 : -1);
      ctx.scale(flip * off.scaleX, off.scaleY);
      if (this.style === 'walk') this.drawWalkingImage(ctx, t);
      else ctx.drawImage(this.image, -this.width / 2, -this.height / 2, this.width, this.height);
      ctx.restore();
    }
  }

  const api = { Creature, motionOffset, walkPose };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CreatureModule = api;
})(typeof window !== 'undefined' ? window : globalThis);
