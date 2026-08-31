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

  // ---- 2.5D 紙偶：純函式區（可在 Node 測，不碰 canvas） ----

  // 地面角色的走路擺動。關鍵是 footYOffset 恆為 0——規格要求雙腳貼地，
  // 走路靠的是腿部關節旋轉（見 walkPose），不是整張紙上下抖。
  // 身體只允許極小幅度的重心傾斜與轉身時的水平壓縮。
  function groundedMotionOffset(t, params) {
    const step = Math.sin(params.freq * t + (params.phase || 0));
    return {
      footYOffset: 0,
      rotation: 0.012 * step,
      turnScaleX: 0.94 + 0.06 * Math.abs(step),
    };
  }

  // 依裁切後的可見人物比例換算顯示尺寸。以「高度」為基準，所以直式與橫式原稿
  // 都會落在同一個可辨識的高度範圍，不會因為原稿比例而忽大忽小。
  //
  // 目標高度取畫面高的 ~26%（規格要求的下限是 24%）。原本取到 34%，角色大到
  // 可行走的草地帶只擠得下 10 位，規格要求的 15 位達不到；而 34% 在畫面上也
  // 像是貼著鏡頭站，跟遠處的城鎮完全不成比例。26% 仍然看得清楚孩子的塗色。
  function displaySize(image, canvasWidth, canvasHeight, depthScale) {
    const targetHeight = Math.max(
      canvasHeight * 0.20,
      Math.min(canvasHeight * 0.26, canvasWidth * 0.15),
    );
    const height = Math.round(targetHeight * depthScale * 2) / 2;
    return { width: Math.round(height * image.width / image.height), height };
  }

  // 腳底越靠近畫面下方＝離觀眾越近＝畫得越大。夾在 [0,1] 之間，
  // 超出可行走區的值不外插，避免角色瞬間爆大或縮成一點。
  const MIN_DEPTH_SCALE = 0.78;
  const MAX_DEPTH_SCALE = 1.05;
  function depthScaleForY(baseY, top, bottom) {
    const portion = Math.max(0, Math.min(1, (baseY - top) / (bottom - top || 1)));
    return Math.round((MIN_DEPTH_SCALE + portion * (MAX_DEPTH_SCALE - MIN_DEPTH_SCALE)) * 100) / 100;
  }

  // 碰撞用的尺寸：取角色在**最近景**時的大小，跟腳底位置無關。
  //
  // 這件事必須跟繪製尺寸分開。繪製尺寸會隨景深變化（越靠畫面下方越大），
  // 若把它同時當成碰撞尺寸，角色往下走時體積會變大而突然「重疊」，
  // 於是每一幀都觸發完整的復位搜尋——實測會把畫面直接壓到 8fps。
  // 用最大值當碰撞尺寸是保守的：出生時檢查過的間距，之後不會因為走動而失效。
  function collisionSize(image, canvasWidth, canvasHeight) {
    return displaySize(image, canvasWidth, canvasHeight, MAX_DEPTH_SCALE);
  }

  function transitionOpacity(state, elapsed, seconds = 0.4) {
    const portion = Math.max(0, Math.min(1, elapsed / seconds));
    if (state === 'entering') return portion;
    if (state === 'exiting') return 1 - portion;
    return 1;
  }

  // 手勢只回傳「肢體角度」，永遠不回傳腳底位移——手勢不該把角色抬離地面。
  function gesturePose(kind, elapsed) {
    if (kind === 'raise-hands') {
      return { leftArmAngle: -0.55, rightArmAngle: 0.55, footYOffset: 0 };
    }
    if (kind === 'wave') {
      const wave = Math.sin(elapsed * Math.PI * 6);
      return { leftArmAngle: 0, rightArmAngle: -0.45 + wave * 0.18, footYOffset: 0 };
    }
    return { leftArmAngle: 0, rightArmAngle: 0, footYOffset: 0 };
  }

  // 畫布高度相對於設計解析度（1080p）的比例。角色尺寸與移動速度共用這個比例，
  // 換解析度時整個場景的視覺節奏才會一致。
  const DESIGN_CANVAS_HEIGHT = 1080;
  function speedScaleForCanvas(canvasHeight) {
    if (!Number.isFinite(canvasHeight) || canvasHeight <= 0) return 1;
    return canvasHeight / DESIGN_CANVAS_HEIGHT;
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
    constructor({
      artworkId, image, species, canvasWidth, canvasHeight, spawn, isDemo = false,
      groundTop, groundBottom,
    }) {
      this.artworkId = artworkId;
      this.image = image;
      this.species = species;
      this.canvasWidth = canvasWidth;
      this.canvasHeight = canvasHeight;
      this.isDemo = isDemo;

      const swim = species.swim;
      this.style = swim.style;
      this.speed = randRange(swim.speed) * (Math.random() < 0.5 ? 1 : -1);
      this.amplitude = randRange(swim.amplitude);
      this.freq = randRange(swim.freq);
      this.phase = Math.random() * Math.PI * 2;
      this.sizeScale = swim.sizeScale || 1;

      this.isGrounded = this.style === 'walk' || swim.grounded === true;
      // 景深縮放的參考帶必須跟可行走區一致，否則角色走到帶底時算出的縮放
      // 會落在區間外（被夾住），近景就不會變大。呼叫端（display.html）傳入
      // Movement.getWalkableArea 的上下緣；沒傳時用同一組預設值。
      this.groundTop = groundTop != null ? groundTop : canvasHeight * 0.60;
      this.groundBottom = groundBottom != null ? groundBottom : canvasHeight * 0.93;

      if (spawn) {
        this.x = spawn.x;
        this.baseY = spawn.baseY;
      } else {
        // 尚未接上移動控制器時（Task 6 之前）的後備：自行落在可行走帶內，
        // 讓頁面在整合完成前仍然跑得起來。
        const depthBand = this.isGrounded ? 0.70 + Math.random() * 0.17 : 0.25 + Math.random() * 0.6;
        this.baseY = depthBand * canvasHeight;
        this.x = Math.random() * canvasWidth;
      }

      this.targetX = this.x;
      this.targetY = this.baseY;
      this.vx = 0;
      this.vy = 0;
      // 速度要跟著畫布縮放，不能是固定的 px/s。角色的**尺寸**已經是依畫布高度
      // 計算的（displaySize 取畫面高度的 ~26%），速度若維持固定像素值，4K 上的
      // 角色看起來就只有 1080p 的一半速度——同樣一段路要走兩倍久。實測 4K 下
      // 三分鐘內有三位角色連一個目標都到不了，1080p 則全部都到得了。
      this.cruiseSpeed = (swim.speed[0] + swim.speed[1]) / 2 * speedScaleForCanvas(canvasHeight);

      this.state = 'entering';
      this.stateElapsed = 0;
      this.opacity = 0;
      // 每位新角色先打一次招呼，之後才進入低頻率的偶發動作循環。
      this.currentGesture = swim.gesture || null;
      this.gestureElapsed = 0;
      this.nextGestureAt = 8 + Math.random() * 12;

      const collision = collisionSize(image, canvasWidth, canvasHeight);
      this.width = collision.width;
      this.height = collision.height;
      this.refreshSize();
    }

    // width/height 是**碰撞**尺寸，固定不變（移動控制器讀的是這兩個）。
    // renderWidth/renderHeight 才隨景深變化，只影響畫面。
    refreshSize() {
      const scale = this.isGrounded
        ? depthScaleForY(this.baseY, this.groundTop, this.groundBottom)
        : 1;
      const size = displaySize(this.image, this.canvasWidth, this.canvasHeight, scale);
      this.renderWidth = size.width;
      this.renderHeight = size.height;
    }

    setTransition(state) {
      this.state = state;
      this.stateElapsed = 0;
    }

    // 由移動控制器（Movement.steerCharacter）餵進來的地面座標。
    // 這裡只接收結果，不自己決定方向——避免動畫與位移各算各的而互相拉扯。
    setMovement(next) {
      this.x = next.x;
      this.baseY = next.baseY;
      this.vx = next.vx;
      this.vy = next.vy;
      // 移動層放在角色身上的狀態要**整包**帶回來，下一幀 steerCharacter 才讀得到。
      // 只搬 x/baseY/vx/vy 的話，繞行方向的認定每一幀都會被丟掉，角色就退回
      // 「左一步右一步」的兩幀擺動——那個 bug 只會出現在瀏覽器裡，因為測試是
      // 直接用物件展開傳遞狀態的，看不到這一層。
      this.avoidHeadingX = next.avoidHeadingX;
      this.avoidHeadingY = next.avoidHeadingY;
      this.avoidScale = next.avoidScale;
      this.avoidHold = next.avoidHold;
      this.blocked = next.blocked;
      this.stalled = next.stalled;
      this.path = next.path;
      this.pathGoalX = next.pathGoalX;
      this.pathGoalY = next.pathGoalY;
      this.progressElapsed = next.progressElapsed;
      this.progressAnchorDistance = next.progressAnchorDistance;
      this.progressGoalX = next.progressGoalX;
      this.progressGoalY = next.progressGoalY;
      this.planAttempts = next.planAttempts;
      this.spreadAnchorX = next.spreadAnchorX;
      this.spreadAnchorY = next.spreadAnchorY;
      this.spread = next.spread;
    }

    updateVisual(dt) {
      this.stateElapsed += dt;
      this.opacity = transitionOpacity(this.state, this.stateElapsed);
      if (this.state === 'entering' && this.stateElapsed >= 0.4) this.state = 'active';

      this.refreshSize();

      this.gestureElapsed += dt;
      if (this.currentGesture && this.gestureElapsed >= 1.2) {
        this.currentGesture = null;
        this.gestureElapsed = 0;
        this.nextGestureAt = 8 + Math.random() * 12;
      } else if (!this.currentGesture) {
        this.nextGestureAt -= dt;
        if (this.nextGestureAt <= 0) {
          this.currentGesture = this.species.swim.gesture || null;
          this.gestureElapsed = 0;
        }
      }
    }

    update(dt, t) {
      // Task 6 接上 Movement 之前的後備水平漫遊。接上之後由 setMovement 覆寫位置，
      // 這裡就只剩動畫狀態要推進。
      if (!this.drivenByMovement) {
        this.x += this.speed * dt;
        const margin = this.width;
        if (this.speed > 0 && this.x - margin > this.canvasWidth) this.x = -margin;
        if (this.speed < 0 && this.x + margin < 0) this.x = this.canvasWidth + margin;
      }
      this.updateVisual(dt);
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
      const dx = -this.renderWidth / 2;
      const dy = -this.renderHeight / 2;
      const xScale = this.renderWidth / iw;
      const yScale = this.renderHeight / ih;
      const pose = walkPose(t, { freq: this.freq, phase: this.phase, maxAngle: rig.maxAngle });

      // 頭、身體、衣袍，以及腿部範圍以外的手杖／羊／魚保持完整。
      drawImagePart(ctx, image, 0, 0, iw, legTop + 1, dx, dy, this.renderWidth, (legTop + 1) * yScale);
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

    // 手臂：繞肩膀（rig 的 pivot）旋轉一塊切片。角度來自 gesturePose，
    // 腳底完全不受影響。
    drawArm(ctx, arm, angle) {
      if (!arm || !angle) return;
      const image = this.image;
      const iw = image.width;
      const ih = image.height;
      const dx = -this.renderWidth / 2;
      const dy = -this.renderHeight / 2;
      const xScale = this.renderWidth / iw;
      const yScale = this.renderHeight / ih;

      const sx = arm.x * iw;
      const sy = arm.y * ih;
      const sw = arm.width * iw;
      const sh = arm.height * ih;
      const pivotX = dx + (sx + sw * arm.pivotX) * xScale;
      const pivotY = dy + (sy + sh * arm.pivotY) * yScale;

      ctx.save();
      ctx.translate(pivotX, pivotY);
      ctx.rotate(angle);
      ctx.translate(-pivotX, -pivotY);
      drawImagePart(ctx, image, sx, sy, sw, sh,
        dx + sx * xScale, dy + sy * yScale, sw * xScale, sh * yScale);
      ctx.restore();
    }

    draw(ctx, t) {
      const grounded = this.isGrounded;
      const off = grounded
        ? groundedMotionOffset(t, { freq: this.freq, phase: this.phase })
        : motionOffset(this.style, t, { amplitude: this.amplitude, freq: this.freq, phase: this.phase });

      // 所有角色都以 baseY（腳底）為錨點——移動控制器給的就是地面座標。
      // 地面角色的 footYOffset 恆為 0；漂浮角色（天使）則整個往上浮一段再上下擺動，
      // 但錨點仍在地面，否則會被排到畫面外、名字也跟著被切掉。
      const hover = grounded ? 0 : this.amplitude;
      const y = grounded
        ? this.baseY - this.renderHeight / 2 + off.footYOffset
        : this.baseY - this.renderHeight / 2 - hover + off.yOffset;
      const facingRight = this.vx !== 0 ? this.vx > 0 : this.speed > 0;
      const opacity = this.opacity == null ? 1 : this.opacity;
      if (opacity <= 0) return;

      if (grounded) {
        ctx.save();
        ctx.globalAlpha = 0.2 * opacity;
        ctx.fillStyle = '#4c351d';
        ctx.beginPath();
        ctx.ellipse(this.x, this.baseY + 2, this.renderWidth * 0.3, Math.max(3, this.renderWidth * 0.055), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      const pose = gesturePose(this.currentGesture, this.gestureElapsed);
      const rig = this.species.swim.rig || {};

      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.translate(this.x, y);
      ctx.rotate(off.rotation * (facingRight ? 1 : -1));
      const flip = this.species.swim.noFlip ? 1 : (facingRight ? 1 : -1);
      const scaleX = grounded ? off.turnScaleX : off.scaleX;
      const scaleY = grounded ? 1 : off.scaleY;
      ctx.scale(flip * scaleX, scaleY);

      // 紙張厚度：兩層低透明度的偏移副本墊在底下，做出紙偶的邊緣層次。
      ctx.save();
      ctx.globalAlpha = 0.18 * opacity;
      for (const offset of [3, 1.5]) {
        ctx.drawImage(this.image, -this.renderWidth / 2 + offset, -this.renderHeight / 2 + offset,
          this.renderWidth, this.renderHeight);
      }
      ctx.restore();

      if (grounded) this.drawWalkingImage(ctx, t);
      else ctx.drawImage(this.image, -this.renderWidth / 2, -this.renderHeight / 2, this.renderWidth, this.renderHeight);

      this.drawArm(ctx, rig.leftArm, pose.leftArmAngle);
      this.drawArm(ctx, rig.rightArm, pose.rightArmAngle);
      ctx.restore();
    }
  }

  const api = {
    Creature,
    motionOffset,
    walkPose,
    groundedMotionOffset,
    displaySize,
    collisionSize,
    depthScaleForY,
    speedScaleForCanvas,
    transitionOpacity,
    gesturePose,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CreatureModule = api;
})(typeof window !== 'undefined' ? window : globalThis);
