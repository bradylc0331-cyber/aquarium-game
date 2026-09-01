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

    let documentToUse = documentLike;
    if (documentToUse === undefined) {
      try {
        documentToUse = typeof document === 'undefined' ? null : document;
      } catch (_) {
        return null;
      }
    }
    if (!documentToUse || typeof documentToUse.createElement !== 'function') return null;

    try {
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

  // 沿著背景原圖中央的河道畫短波光；位置使用原圖比例，cover 裁切時仍能貼著河面。
  function drawRiverFlow(ctx, w, h, t) {
    ctx.save();
    ctx.globalAlpha = 0.32;
    ctx.strokeStyle = '#fff4c8';
    ctx.lineWidth = Math.max(1.2, h / 650);
    ctx.lineCap = 'round';
    for (let i = 0; i < 12; i++) {
      const p = (i / 12 + t * 0.035) % 1;
      const ny = 0.505 + p * 0.245;
      const nx = 0.555 + p * 0.135 + Math.sin(p * Math.PI * 2) * 0.012;
      const halfWidth = 0.006 + p * 0.022;
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
    [-0.08, 0.18, 1], [0.14, 0.24, 1], [0.34, 0.16, 1],
    [0.66, 0.22, -1], [0.84, 0.14, -1], [1.08, 0.25, -1],
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
    gustStrength, drawCanopySway, createSheepFlock, sheepScaleForY, updateSheepFlock,
    createBirdFlock, updateBirdFlock, rasterizeRuntimeSprite, drawSheep, drawBirdFlock,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AquariumScene = api;
})(typeof window !== 'undefined' ? window : globalThis);
