// 聖經樂園背景：GPT Image 場景圖、暖金陽光、緩慢飄動的薄雲與光點微粒。
// 靜態圖載入前或載入失敗時會退回暖色漸層，活動畫面不會開天窗。
(function (root) {
  let bgImage = null;
  let bgFailed = false;

  if (typeof Image !== 'undefined') {
    const bgImg = new Image();
    bgImg.onload = () => { bgImage = bgImg; };
    bgImg.onerror = () => { bgFailed = true; };
    bgImg.src = 'assets/backgrounds/bible-world.png';
  }

  // 只保留供每幀繪製的小型 canvas；原始 Image 2 母圖在轉檔後不再被持有。
  const animalImages = {
    sheepWalking: null,
    sheepGrazing: null,
    birdUp: null,
    birdDown: null,
    riverFish: null,
  };

  function rasterizeRuntimeSprite(source, maxWidth, documentLike) {
    let sourceWidth;
    let sourceHeight;
    try {
      sourceWidth = source && source.width;
      sourceHeight = source && source.height;
    } catch (_) {
      return null;
    }
    if (!source || !Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight)
      || sourceWidth <= 0 || sourceHeight <= 0 || !Number.isFinite(maxWidth) || maxWidth < 1) return null;

    try {
      let documentToUse = documentLike;
      if (documentToUse === undefined) {
        documentToUse = typeof document === 'undefined' ? null : document;
      }
      if (!documentToUse || typeof documentToUse.createElement !== 'function') return null;
      const drawnWidth = Math.floor(Math.min(sourceWidth, maxWidth));
      const drawnHeight = Math.max(1, Math.round(drawnWidth * sourceHeight / sourceWidth));
      if (drawnWidth < 1 || !Number.isFinite(drawnHeight)) return null;
      const canvas = documentToUse.createElement('canvas');
      if (!canvas || typeof canvas.getContext !== 'function') return null;
      canvas.width = drawnWidth;
      canvas.height = drawnHeight;
      const context = canvas.getContext('2d');
      if (!context || typeof context.drawImage !== 'function') return null;
      context.drawImage(source, 0, 0, drawnWidth, drawnHeight);
      return canvas;
    } catch (_) {
      return null;
    }
  }

  function loadRuntimeAnimalImage(key, path, maxWidth) {
    let source = null;
    const release = () => {
      const loaded = source;
      source = null;
      if (!loaded) return;
      try { loaded.onload = null; } catch (_) { /* detached when supported */ }
      try { loaded.onerror = null; } catch (_) { /* detached when supported */ }
    };
    const settle = (runtimeSprite) => {
      animalImages[key] = runtimeSprite;
      release();
    };

    try {
      source = new Image();
      source.onload = () => settle(rasterizeRuntimeSprite(source, maxWidth));
      source.onerror = () => settle(null);
      source.src = path;
    } catch (_) {
      settle(null);
    }
  }

  function loadAnimalImages() {
    if (typeof Image === 'undefined') return;
    loadRuntimeAnimalImage('sheepWalking', 'assets/sheep/sheep-walking.png', 320);
    loadRuntimeAnimalImage('sheepGrazing', 'assets/sheep/sheep-grazing.png', 320);
    loadRuntimeAnimalImage('birdUp', 'assets/birds/bird-wings-up.png', 192);
    loadRuntimeAnimalImage('birdDown', 'assets/birds/bird-wings-down.png', 192);
    loadRuntimeAnimalImage('riverFish', 'assets/fish/river-fish-swimming.png', 144);
  }

  loadAnimalImages();

  function createBubbles(w, h, count) {
    const bubbles = [];
    for (let i = 0; i < count; i++) {
      bubbles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 2 + Math.random() * 5,
        speed: 15 + Math.random() * 25,
        wobble: Math.random() * Math.PI * 2,
      });
    }
    return bubbles;
  }

  function updateBubbles(bubbles, dt, w, h) {
    for (const b of bubbles) {
      b.y -= b.speed * dt;
      b.wobble += dt * 2;
      b.x += Math.sin(b.wobble) * 8 * dt;
      if (b.y < -10) {
        b.y = h + 10;
        b.x = Math.random() * w;
      }
    }
  }

  function drawBubbles(ctx, bubbles) {
    ctx.save();
    ctx.fillStyle = 'rgba(255, 228, 150, 0.46)';
    ctx.strokeStyle = 'rgba(255, 246, 210, 0.62)';
    ctx.shadowColor = 'rgba(255, 210, 105, 0.7)';
    ctx.shadowBlur = 8;
    for (const b of bubbles) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCloud(ctx, x, y, scale, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#fff8e8';
    const puffs = [
      [-38, 7, 24], [-15, -4, 31], [13, 0, 27], [37, 9, 21], [0, 14, 42],
    ];
    for (const [px, py, r] of puffs) {
      ctx.beginPath();
      ctx.arc(x + px * scale, y + py * scale, r * scale, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function coverPoint(w, h, nx, ny) {
    const iw = bgImage ? bgImage.width : 1672;
    const ih = bgImage ? bgImage.height : 941;
    const scale = Math.max(w / iw, h / ih);
    const ox = (w - iw * scale) / 2;
    const oy = (h - ih * scale) / 2;
    return [ox + nx * iw * scale, oy + ny * ih * scale];
  }

  function normalizedProgress(progress) {
    if (!Number.isFinite(progress)) return 0;
    const normalized = progress % 1;
    return normalized < 0 ? normalized + 1 : normalized;
  }

  // 河流上的所有動態元素共用這條原圖座標曲線，cover 裁切後仍能貼著河面。
  // 河道中心線與河寬：照 assets/backgrounds/bible-world.png **量出來**的控制點，
  // 座標是背景原圖的比例（0~1）。**換背景圖一定要重量。**
  //
  // 舊版是一條手寫的正弦公式，往右的斜率只有真正河道的一半
  // （真實 dnx/dny ≈ 1.05，公式是 0.55），所以它從城鎮那邊斜切過真正的河，
  // 中段整條落在右岸草地上——魚就在草地上游。2026-09-01 實機發現。
  //
  // 當時的測試沒抓到，因為它斷言的是「nx 落在 0.54~0.71」這種由錯誤公式反推的
  // 數字盒，而不是「這些點在圖上是不是水」。這種測試永遠不會紅。
  const RIVER_PATH = [
    // [nx, ny, halfWidth]
    // 2026-09-01 由 river-calibrate.html 實機描出河岸輪廓後對接兩臂求得的中心線。
    // 河道是會回彎的：往右下 → 折回左 → 再往右下，不是一條直斜線。
    // **換背景圖必須用 river-calibrate.html 重描。**
    [0.577, 0.577, 0.0110],
    [0.607, 0.604, 0.0180],
    [0.604, 0.625, 0.0250],
    [0.561, 0.647, 0.0290],
    [0.561, 0.683, 0.0330],
    [0.606, 0.706, 0.0330],
    [0.663, 0.735, 0.0260],
    [0.694, 0.758, 0.0150],
  ];

  // progress 0~1 沿著折線等分內插（每段長度相近，不另外做弧長參數化）。
  function riverSample(progress) {
    // 這裡要**夾住**不是取模：normalizedProgress(1) 會變成 0，
    // riverPoint(1) 就會回傳河的起點而不是終點，色帶與水光都會多出一條斜線。
    const raw = Number.isFinite(progress) ? progress : 0;
    const p = raw < 0 ? 0 : (raw > 1 ? 1 : raw);
    const span = RIVER_PATH.length - 1;
    const scaled = Math.min(span - 1e-9, p * span);
    const i = Math.floor(scaled);
    const t = scaled - i;
    const a = RIVER_PATH[i];
    const b = RIVER_PATH[i + 1];
    return {
      nx: a[0] + (b[0] - a[0]) * t,
      ny: a[1] + (b[1] - a[1]) * t,
      halfWidth: a[2] + (b[2] - a[2]) * t,
    };
  }

  function riverPoint(progress) {
    const { nx, ny } = riverSample(progress);
    return { nx, ny };
  }

  function riverHalfWidth(progress) {
    return riverSample(progress).halfWidth;
  }

  // 沿著背景原圖中央的河道畫短波光；位置使用原圖比例，cover 裁切時仍能貼著河面。
  function drawRiverFlow(ctx, w, h, t) {
    ctx.save();
    ctx.globalAlpha = 0.32;
    ctx.strokeStyle = '#fff4c8';
    ctx.lineWidth = Math.max(1.2, h / 650);
    ctx.lineCap = 'round';
    for (let i = 0; i < 12; i++) {
      const p = normalizedProgress(i / 12 + t * 0.035);
      const { nx, ny } = riverPoint(p);
      const halfWidth = riverHalfWidth(p);
      const [x1, y1] = coverPoint(w, h, nx - halfWidth, ny);
      const [xm, ym] = coverPoint(w, h, nx, ny + 0.0025);
      const [x2, y2] = coverPoint(w, h, nx + halfWidth, ny);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo(xm, ym, x2, y2);
      ctx.stroke();
    }
    ctx.restore();
  }

  const RIVER_FISH_LAYOUT = [
    [0.14, 0.018, 1, 0.2, 36, 18, 0.58],
    [0.40, 0.023, -1, 1.7, 40, 20, 0.62],
    [0.66, 0.015, 1, 3.4, 44, 22, 0.66],
    [0.90, 0.021, -1, 5.1, 48, 24, 0.70],
  ];

  // 魚只在河面最寬、最確定的那一段活動。上游窄到螢幕上不足 10px，
  // 與其把折線修到完美，不如讓魚待在容錯大的地方——折線還有幾像素誤差也不會上岸。
  const RIVER_FISH_PROGRESS_START = 0.06;
  const RIVER_FISH_PROGRESS_END = 0.95;
  const RIVER_FISH_PROGRESS_SPAN = RIVER_FISH_PROGRESS_END - RIVER_FISH_PROGRESS_START;

  // 把進度收進安全河段。**用夾住，不是繞回**——繞回會讓游到下游端點的魚
  // 瞬間傳送回上游，畫面上就是憑空消失又出現。魚到端點要轉頭（見 reflectProgress）。
  function normalizeRiverFishProgress(progress) {
    if (!Number.isFinite(progress)) return RIVER_FISH_PROGRESS_START;
    if (progress < RIVER_FISH_PROGRESS_START) return RIVER_FISH_PROGRESS_START;
    if (progress > RIVER_FISH_PROGRESS_END) return RIVER_FISH_PROGRESS_END;
    return progress;
  }

  // 碰到河段兩端就折返，游動因此是連續的：位置不跳、朝向跟著翻。
  // 迴圈是為了容忍一次 dt 就跨過整段的大步長（分頁被背景節流後回來會發生）。
  function reflectProgress(value, direction) {
    let p = value;
    let dir = direction;
    for (let guard = 0; guard < 8; guard++) {
      if (p > RIVER_FISH_PROGRESS_END) { p = 2 * RIVER_FISH_PROGRESS_END - p; dir = -1; }
      else if (p < RIVER_FISH_PROGRESS_START) { p = 2 * RIVER_FISH_PROGRESS_START - p; dir = 1; }
      else break;
    }
    return { progress: normalizeRiverFishProgress(p), direction: dir };
  }

  // 背景原圖的長寬比。nx/ny 是**比例**座標，兩軸的實際像素尺度不同，
  // 算螢幕上的角度一定要各自乘回去，否則魚會比河道更「往下栽」。
  const BG_ASPECT = 1672 / 941;

  function riverTangentAngle(progress) {
    const p = normalizeRiverFishProgress(progress);
    const step = 0.01;
    const a = riverPoint(Math.max(RIVER_FISH_PROGRESS_START, p - step));
    const b = riverPoint(Math.min(RIVER_FISH_PROGRESS_END, p + step));
    return Math.atan2(b.ny - a.ny, (b.nx - a.nx) * BG_ASPECT);
  }

  // Image 2 母圖是 1:1 方形；只取魚身內容區，排除透明 padding 與 halo。
  const RIVER_FISH_SPRITE_CROP = Object.freeze({ x: 0.20, y: 0.34, width: 0.60, height: 0.28 });

  function createRiverFish() {
    return RIVER_FISH_LAYOUT.map(([progress, speed, direction, phase, width, height, opacity]) => ({
      progress: normalizeRiverFishProgress(progress), speed, direction, phase, width, height, opacity,
    }));
  }

  function updateRiverFish(fish, dt) {
    if (!Array.isArray(fish) || !Number.isFinite(dt)) return;
    for (const item of fish) {
      try {
        if (!item || !Number.isFinite(item.speed) || item.speed < 0
          || !Number.isFinite(item.phase) || (item.direction !== 1 && item.direction !== -1)) continue;
        const currentProgress = normalizeRiverFishProgress(item.progress);
        const progressStep = item.speed * dt;
        const phaseStep = (0.8 + item.speed * 16) * dt;
        if (!Number.isFinite(progressStep) || !Number.isFinite(phaseStep)) continue;
        const next = reflectProgress(currentProgress + item.direction * progressStep, item.direction);
        item.progress = next.progress;
        item.direction = next.direction;
        item.phase = normalizedProgress((item.phase / (Math.PI * 2)) + phaseStep / (Math.PI * 2)) * Math.PI * 2;
      } catch (_) {
        // 壞掉的外部狀態不能中斷同一幀其他魚的更新。
      }
    }
  }

  function drawRiverFish(ctx, fish, w, h, t, images = animalImages) {
    let image;
    let imageWidth;
    let imageHeight;
    try {
      if (!ctx || !Array.isArray(fish) || !images || !Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0
        || typeof ctx.save !== 'function' || typeof ctx.restore !== 'function' || typeof ctx.translate !== 'function'
        || typeof ctx.rotate !== 'function' || typeof ctx.scale !== 'function' || typeof ctx.drawImage !== 'function') return;
      image = images.riverFish;
      imageWidth = image && image.width;
      imageHeight = image && image.height;
    } catch (_) {
      return;
    }
    const crop = RIVER_FISH_SPRITE_CROP;
    if (!image || !Number.isFinite(imageWidth) || !Number.isFinite(imageHeight)
      || imageWidth <= 0 || imageHeight <= 0
      || !crop || !Number.isFinite(crop.x) || !Number.isFinite(crop.y)
      || !Number.isFinite(crop.width) || !Number.isFinite(crop.height)
      || crop.x < 0 || crop.y < 0 || crop.width <= 0 || crop.height <= 0
      || crop.x + crop.width > 1 || crop.y + crop.height > 1) return;

    const sourceX = imageWidth * crop.x;
    const sourceY = imageHeight * crop.y;
    const sourceWidth = imageWidth * crop.width;
    const sourceHeight = imageHeight * crop.height;
    if (![sourceX, sourceY, sourceWidth, sourceHeight].every(Number.isFinite)
      || sourceX < 0 || sourceY < 0 || sourceWidth <= 0 || sourceHeight <= 0
      || sourceX + sourceWidth > imageWidth || sourceY + sourceHeight > imageHeight) return;

    const canvasScale = h / 720;
    const time = Number.isFinite(t) ? t : 0;
    for (const item of fish) {
      let saved = false;
      try {
        if (!item || !Number.isFinite(item.progress) || !Number.isFinite(item.phase) || !Number.isFinite(item.width)
          || !Number.isFinite(item.height) || !Number.isFinite(item.opacity) || item.width <= 0 || item.height <= 0) continue;
        const { nx, ny } = riverPoint(normalizeRiverFishProgress(item.progress));
        const [x, y] = coverPoint(w, h, nx, ny);
        // 景深看的是「離觀眾多遠」，也就是 ny：越靠畫面下方越近、越大。
        // 不能用河寬當比例尺——這條河中段最寬，但中段並不是離觀眾最近的地方。
        const nyHere = riverPoint(item.progress).ny;
        const nyNear = riverPoint(RIVER_FISH_PROGRESS_END).ny;
        const nyFar = riverPoint(RIVER_FISH_PROGRESS_START).ny;
        const t = nyNear === nyFar ? 1 : (nyHere - nyFar) / (nyNear - nyFar);
        const depth = 0.55 + 0.45 * Math.max(0, Math.min(1, t));
        const drawnWidth = item.width * canvasScale * depth;
        const drawnHeight = item.height * canvasScale * depth;
        if (!Number.isFinite(drawnWidth) || !Number.isFinite(drawnHeight) || drawnWidth <= 0 || drawnHeight <= 0) continue;

        const opacity = Math.max(0, Math.min(1, item.opacity));
        ctx.save();
        saved = true;
        ctx.globalAlpha = opacity;
        ctx.translate(x, y + Math.sin(time * 1.8 + item.phase) * 1.6 * canvasScale);
        ctx.rotate(riverTangentAngle(item.progress));
        if (item.direction < 0) ctx.scale(-1, 1);
        ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight,
          -drawnWidth / 2, -drawnHeight / 2, drawnWidth, drawnHeight);

        // Sprite 預設朝右，尾端放在 local 左側；鏡像後仍會留在游動方向的後方。
        if (typeof ctx.beginPath === 'function' && typeof ctx.ellipse === 'function' && typeof ctx.stroke === 'function') {
          const ripplePulse = 0.12 + (Math.sin(time * 2.4 + item.phase) + 1) * 0.03;
          ctx.globalAlpha = opacity * ripplePulse;
          ctx.strokeStyle = '#fff0c8';
          ctx.lineWidth = 0.7 * canvasScale;
          ctx.beginPath();
          ctx.ellipse(-drawnWidth * 0.43, drawnHeight * 0.10, drawnWidth * 0.19, drawnHeight * 0.17, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      } catch (_) {
        // 單一素材或 canvas 操作失敗時，其他魚仍可繼續繪製。
      } finally {
        if (saved) {
          try { ctx.restore(); } catch (_) { /* nothing left to restore safely */ }
        }
      }
    }
  }

  // 前景草葉以同一陣風相位緩慢左右擺動，疊在人物前方會更有景深。
  function drawForeground(ctx, w, h, t) {
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 0; i < 46; i++) {
      const x = (i + 0.35) / 46 * w;
      const baseY = h + 2;
      const bladeHeight = h * (0.018 + ((i * 17) % 13) / 650);
      // 前景草的擺動跟樹冠共用同一個陣風強度，起風時整個畫面的風向感才一致。
      const gust = 0.65 + gustStrength(t) * 0.8;
      const sway = Math.sin(t * 1.25 + i * 0.38) * bladeHeight * 0.24 * gust;
      ctx.strokeStyle = i % 3 === 0 ? 'rgba(78, 103, 38, 0.42)' : 'rgba(121, 133, 53, 0.34)';
      ctx.lineWidth = Math.max(1.2, h / 560);
      ctx.beginPath();
      ctx.moveTo(x, baseY);
      ctx.quadraticCurveTo(x + sway * 0.35, baseY - bladeHeight * 0.55, x + sway, baseY - bladeHeight);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBackground(ctx, w, h, t) {
    if (bgImage) {
      // cover 縮放：短邊對齊，長邊裁切置中，避免背景被拉伸變形。
      const scale = Math.max(w / bgImage.width, h / bgImage.height);
      const dw = bgImage.width * scale;
      const dh = bgImage.height * scale;
      ctx.drawImage(bgImage, (w - dw) / 2, (h - dh) / 2, dw, dh);
    } else {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#a9d7e6');
      grad.addColorStop(0.48, '#fbe8c6');
      grad.addColorStop(1, '#d9ae68');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }

    // 圖片失敗時保底漸層會持續顯示；變數保留供現場除錯時快速判斷載入狀態。
    if (bgFailed) ctx.canvas && ctx.canvas.setAttribute && ctx.canvas.setAttribute('data-background-fallback', 'true');

    // 高空薄雲用很低的透明度緩緩橫移，不遮住背景細節。
    const cloudSpan = w + 360;
    drawCloud(ctx, ((t * 5.5) % cloudSpan) - 180, h * 0.12, 1.15, 0.14);
    drawCloud(ctx, w - ((t * 3.8 + 210) % cloudSpan), h * 0.24, 0.82, 0.10);

    // 暖金色光束從上方慢慢掃過，與背景的黃昏陽光融合。
    ctx.save();
    ctx.globalAlpha = 0.085;
    ctx.fillStyle = '#ffe5a0';
    for (let i = 0; i < 5; i++) {
      const baseX = (w / 5) * i + Math.sin(t * 0.15 + i) * 40;
      ctx.beginPath();
      ctx.moveTo(baseX - 36, 0);
      ctx.lineTo(baseX + 36, 0);
      ctx.lineTo(baseX + 150, h * 0.82);
      ctx.lineTo(baseX - 150, h * 0.82);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    drawRiverFlow(ctx, w, h, t);
  }

  // 陣風：平時是微風（0.22），偶爾拱起一次比較明顯但短暫的陣風。
  // 用 sin 的正半波再平方，讓起風與收風都是平滑的，不會突然跳一下。
  function gustStrength(t) {
    const pulse = Math.max(0, Math.sin(t * 0.23 - 1.2));
    return Math.min(1, 0.22 + pulse * pulse * 0.78);
  }

  // 樹冠微風。背景是一張畫好的插畫，沒辦法真的讓每片葉子動，所以改用「陽光在
  // 擺動的葉隙間閃動」來表現風：在樹冠位置疊一層很淡的暖色高光，隨風左右飄移。
  //
  // 疊綠色會變成一塊看得出來的綠斑（試過，很醜）；暖色高光才會被讀成陽光，
  // 跟這張夕陽插畫的光線一致。位置是照背景美術的樹冠量出來的，換背景圖要重量。
  const CANOPIES = [
    { x: 0.17, y: 0.26, rx: 0.150, ry: 0.135, phase: 0 },   // 左側大橄欖樹
    { x: 0.28, y: 0.56, rx: 0.045, ry: 0.045, phase: 1.1 }, // 左中小樹
    { x: 0.75, y: 0.54, rx: 0.050, ry: 0.045, phase: 2.0 }, // 右中小樹
    { x: 0.93, y: 0.57, rx: 0.075, ry: 0.115, phase: 2.8 }, // 右側大橄欖樹
  ];

  function drawCanopySway(ctx, w, h, t) {
    const gust = gustStrength(t);
    ctx.save();
    for (const leaf of CANOPIES) {
      const sway = Math.sin(t * 1.1 + leaf.phase) * w * 0.004 * (0.6 + gust);
      // 陣風越強，葉隙開得越多，透進來的光就越亮
      ctx.fillStyle = `rgba(255, 238, 176, ${(0.05 + gust * 0.05).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(w * leaf.x + sway, h * leaf.y, w * leaf.rx, h * leaf.ry, sway / 180, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  const SHEEP_X_RATIOS = [0.10, 0.27, 0.42, 0.59, 0.75, 0.90];
  const SHEEP_Y_RATIOS = [0.84, 0.78, 0.86, 0.76, 0.83, 0.79];

  function sheepScaleForY(baseY, top, bottom) {
    const span = Math.max(1, bottom - top);
    const depth = Math.max(0, Math.min(1, (baseY - top) / span));
    return 0.72 + depth * 0.33;
  }

  function walkableBoundsFor(w, h) {
    return { left: w * 0.04, right: w * 0.96, top: h * 0.60, bottom: h * 0.93 };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function createSheepFlock(w, h, random = Math.random) {
    const bounds = walkableBoundsFor(w, h);
    return SHEEP_X_RATIOS.map((nx, i) => ({
      kind: 'sheep',
      x: w * nx,
      baseY: h * SHEEP_Y_RATIOS[i],
      direction: i % 2 === 0 ? 1 : -1,
      speed: 8 + random() * 8,
      mode: i % 3 === 0 ? 'grazing' : 'walking',
      modeTime: i % 3 === 0 ? 2 + random() * 3 : 5 + random() * 6,
      width: 78,
      height: 58,
      phase: i * 1.17,
      walkableBounds: { ...bounds },
    }));
  }

  function drawSheep(ctx, sheep, t, canvasHeight, images = animalImages) {
    if (!ctx || !sheep || !images || typeof ctx.save !== 'function' || typeof ctx.restore !== 'function'
      || typeof ctx.translate !== 'function' || typeof ctx.scale !== 'function' || typeof ctx.drawImage !== 'function'
      || !Number.isFinite(sheep.x) || !Number.isFinite(sheep.baseY) || !Number.isFinite(sheep.width)
      || !Number.isFinite(sheep.height) || sheep.width <= 0 || sheep.height <= 0
      || !Number.isFinite(canvasHeight) || canvasHeight <= 0) return;

    const grazing = sheep.mode === 'grazing';
    const image = grazing
      ? (images.sheepGrazing || images.sheepWalking)
      : (images.sheepWalking || images.sheepGrazing);
    if (!image) return;

    const canvasScale = canvasHeight / 800;
    const depthScale = sheepScaleForY(sheep.baseY, canvasHeight * 0.60, canvasHeight * 0.93);
    const drawnWidth = sheep.width * canvasScale * depthScale;
    const drawnHeight = sheep.height * canvasScale * depthScale;
    const phase = Number.isFinite(sheep.phase) ? sheep.phase : 0;
    const time = Number.isFinite(t) ? t : 0;
    let saved = false;
    try {
      ctx.save();
      saved = true;
      ctx.translate(sheep.x, sheep.baseY);
      if (sheep.direction < 0) ctx.scale(-1, 1);
      if (!grazing && typeof ctx.rotate === 'function') ctx.rotate(Math.sin(time * 6 + phase) * 0.035);
      ctx.drawImage(image, -drawnWidth / 2, -drawnHeight, drawnWidth, drawnHeight);
    } catch (_) {
      // Canvas 不可用或圖片解碼失敗時略過單幀，不能中斷整個動畫。
    } finally {
      if (saved) {
        try { ctx.restore(); } catch (_) { /* nothing left to restore safely */ }
      }
    }
  }

  function sheepHitsBlocker(sheep, nextX, blocker) {
    if (!blocker || !Number.isFinite(blocker.x) || !Number.isFinite(blocker.baseY)) return false;
    const horizontal = Math.max(34, ((blocker.width || 80) + sheep.width) * 0.35);
    const vertical = Math.max(18, sheep.height * 0.42);
    const nextDistance = Math.abs(nextX - blocker.x);
    return nextDistance < horizontal
      && Math.abs(sheep.baseY - blocker.baseY) < vertical
      && nextDistance < Math.abs(sheep.x - blocker.x);
  }

  function rebaseSheepForArea(sheep, area) {
    const previous = sheep.walkableBounds;
    if (!previous) {
      sheep.walkableBounds = { ...area };
      return;
    }
    const resized = previous.left !== area.left || previous.right !== area.right
      || previous.top !== area.top || previous.bottom !== area.bottom;
    if (!resized) return;
    const xRatio = (sheep.x - previous.left) / Math.max(1, previous.right - previous.left);
    const depth = (sheep.baseY - previous.top) / Math.max(1, previous.bottom - previous.top);
    sheep.x = area.left + clamp(xRatio, 0, 1) * (area.right - area.left);
    sheep.baseY = area.top + clamp(depth, 0, 1) * (area.bottom - area.top);
    sheep.walkableBounds = { ...area };
  }

  function updateSheepFlock(flock, dt, area, blockers = [], random = Math.random) {
    for (const sheep of flock) {
      rebaseSheepForArea(sheep, area);
      sheep.x = clamp(sheep.x, area.left, area.right);
      sheep.baseY = clamp(sheep.baseY, area.top, area.bottom);
      sheep.modeTime -= dt;
      if (sheep.modeTime <= 0) {
        sheep.mode = sheep.mode === 'walking' ? 'grazing' : 'walking';
        sheep.modeTime = sheep.mode === 'grazing' ? 2 + random() * 3 : 5 + random() * 6;
      }
      if (sheep.mode !== 'walking') continue;
      const nextX = sheep.x + sheep.direction * sheep.speed * dt;
      const hitsEdge = nextX < area.left || nextX > area.right;
      const hitsCharacter = blockers.some((blocker) => sheepHitsBlocker(sheep, nextX, blocker));
      if (hitsEdge || hitsCharacter) {
        sheep.direction *= -1;
        sheep.x = Math.max(area.left, Math.min(area.right, sheep.x));
      } else {
        sheep.x = nextX;
      }
    }
  }

  const BIRD_LAYOUT = [
    [0.06, 0.18, 1], [0.20, 0.24, 1], [0.34, 0.16, 1],
    [0.66, 0.22, -1], [0.80, 0.14, -1], [0.94, 0.25, -1],
  ];

  function createBirdFlock(w, h) {
    return BIRD_LAYOUT.map(([nx, ny, direction], i) => ({
      x: w * nx, y: h * ny, homeY: h * ny, direction,
      speed: 18 + i * 2.4,
      width: 42 - (i % 3) * 4,
      height: 27 - (i % 3) * 2,
      phase: i * 1.31,
      flapSpeed: 4.6 + (i % 3) * 0.55,
      viewportWidth: w,
      viewportHeight: h,
    }));
  }

  function rebaseBirdForViewport(bird, w, h) {
    if (bird.viewportWidth === w && bird.viewportHeight === h) return false;
    bird.x = bird.x / bird.viewportWidth * w;
    bird.y = bird.y / bird.viewportHeight * h;
    bird.homeY = bird.homeY / bird.viewportHeight * h;
    bird.viewportWidth = w;
    bird.viewportHeight = h;
    return true;
  }

  function updateBirdFlock(flock, dt, w, h) {
    const margin = Math.max(50, w * 0.06);
    for (const bird of flock) {
      if (rebaseBirdForViewport(bird, w, h)) {
        if (bird.direction > 0 && bird.x < -margin) bird.x = -margin;
        if (bird.direction < 0 && bird.x > w + margin) bird.x = w + margin;
      }
      bird.phase += bird.flapSpeed * dt;
      bird.x += bird.direction * bird.speed * dt;
      bird.y = Math.max(h * 0.06, Math.min(h * 0.32, bird.homeY + Math.sin(bird.phase * 0.45) * h * 0.008));
      if (bird.direction > 0 && bird.x > w + margin) bird.x = -margin;
      if (bird.direction < 0 && bird.x < -margin) bird.x = w + margin;
    }
  }

  function birdFrameOffsetX(isDownstroke, drawnWidth) {
    return isDownstroke ? -0.049 * drawnWidth : 0;
  }

  function drawBirdFlock(ctx, flock, t, canvasHeight, images = animalImages) {
    if (!ctx || !Array.isArray(flock) || !images || typeof ctx.save !== 'function' || typeof ctx.restore !== 'function'
      || typeof ctx.translate !== 'function' || typeof ctx.scale !== 'function' || typeof ctx.drawImage !== 'function'
      || !Number.isFinite(canvasHeight) || canvasHeight <= 0) return;

    const canvasScale = canvasHeight / 800;
    for (const bird of flock) {
      if (!bird || !Number.isFinite(bird.x) || !Number.isFinite(bird.y) || !Number.isFinite(bird.width)
        || !Number.isFinite(bird.height) || bird.width <= 0 || bird.height <= 0) continue;
      const isDownstroke = Math.sin(Number.isFinite(bird.phase) ? bird.phase : 0) < 0;
      const image = isDownstroke
        ? (images.birdDown || images.birdUp)
        : (images.birdUp || images.birdDown);
      if (!image) continue;

      const drawnWidth = bird.width * canvasScale;
      const drawnHeight = bird.height * canvasScale;
      const localX = -drawnWidth / 2 + birdFrameOffsetX(isDownstroke, drawnWidth);
      let saved = false;
      try {
        ctx.save();
        saved = true;
        ctx.translate(bird.x, bird.y);
        if (bird.direction < 0) ctx.scale(-1, 1);
        // 偏移在鏡射用的 local transform 內，雙方向都對齊同一個翼根。
        ctx.drawImage(image, localX, -drawnHeight / 2, drawnWidth, drawnHeight);
      } catch (_) {
        // 單隻失敗不能拖垮整個群集或 requestAnimationFrame。
      } finally {
        if (saved) {
          try { ctx.restore(); } catch (_) { /* nothing left to restore safely */ }
        }
      }
    }
  }

  const api = {
    createBubbles, updateBubbles, drawBubbles, drawBackground, drawRiverFlow, drawForeground,
    riverPoint, riverHalfWidth, riverTangentAngle, RIVER_PATH, reflectProgress,
    RIVER_FISH_RANGE: { start: RIVER_FISH_PROGRESS_START, end: RIVER_FISH_PROGRESS_END }, createRiverFish, updateRiverFish, drawRiverFish, normalizeRiverFishProgress,
    gustStrength, drawCanopySway, createSheepFlock, sheepScaleForY, updateSheepFlock,
    createBirdFlock, updateBirdFlock, rasterizeRuntimeSprite, drawSheep, drawBirdFlock,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AquariumScene = api;
})(typeof window !== 'undefined' ? window : globalThis);
