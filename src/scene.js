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

  function createSheep(w, h, random = Math.random) {
    const scale = h / 900;
    return {
      // 撒得開一點。全部擠在同一小段草地上會疊成一坨白影，反而比不畫還糟。
      x: w * (0.08 + random() * 0.80),
      // 只放在較近的前景帶：放遠了會小到看不出腿和頭，變成畫面上的幾顆白蛋，
      // 背景插畫裡本來就畫了一群遠處的羊，那一段交給美術就好。
      baseY: h * (0.74 + random() * 0.14),
      direction: random() < 0.5 ? -1 : 1,
      speed: 8 + random() * 8,
      mode: random() < 0.5 ? 'walking' : 'grazing',
      modeTime: 2 + random() * 6,
      // 讓羊也能被當成「別擋我」的對象傳給其他羊，避免整群疊在一起
      width: 56 * scale,
      height: 44 * scale,
    };
  }

  // 羊走一段、停下來低頭吃一會兒草，碰到角色或走到草地邊緣就轉向。
  // 它只做簡化避碰（不穿過角色），不參與角色之間的完整避碰運算。
  function updateSheep(sheep, dt, w, h, characters, random = Math.random) {
    sheep.modeTime -= dt;
    if (sheep.modeTime <= 0) {
      sheep.mode = sheep.mode === 'walking' ? 'grazing' : 'walking';
      sheep.modeTime = sheep.mode === 'grazing' ? 2 + random() * 3 : 5 + random() * 6;
    }
    sheep.baseY = Math.max(h * 0.45, Math.min(h * 0.91, sheep.baseY));
    if (sheep.mode !== 'walking') return;

    const nextX = sheep.x + sheep.direction * sheep.speed * dt;
    const blocked = characters.some((character) => (
      Math.abs(character.x - nextX) < character.width * 0.65
      && Math.abs(character.baseY - sheep.baseY) < character.height * 0.25
    ));
    if (blocked || nextX < w * 0.04 || nextX > w * 0.96) sheep.direction *= -1;
    else sheep.x = nextX;
  }

  // 羊的大小要跟著景深走（越靠畫面下方越近、越大），而且要對得上背景插畫裡
  // 那幾隻畫好的羊——尺寸寫死的話在不同解析度下會忽大忽小，也會跟背景格格不入。
  function sheepScale(sheep, h) {
    const depth = Math.max(0, Math.min(1, (sheep.baseY - h * 0.45) / (h * 0.46)));
    return (h / 900) * (0.72 + depth * 0.62);
  }

  function drawSheep(ctx, sheep, t, canvasHeight) {
    const h = canvasHeight || 900;
    const scale = sheepScale(sheep, h);
    const bob = sheep.mode === 'walking' ? Math.sin(t * 5) * 1.5 : 0;
    const headDrop = sheep.mode === 'grazing' ? 13 : 0;
    const facing = sheep.direction < 0 ? -1 : 1;

    ctx.save();
    ctx.translate(sheep.x, sheep.baseY + bob * scale);
    ctx.scale(facing * scale, scale);

    // 落在草地上的淡影子，讓羊看起來是站在地上而不是浮著
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#4c351d';
    ctx.beginPath();
    ctx.ellipse(2, 1, 26, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 腿：要夠深夠粗才看得出來是羊而不是一顆白蛋
    ctx.strokeStyle = '#6b5335';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    for (const legX of [-15, -7, 8, 15]) {
      ctx.beginPath();
      ctx.moveTo(legX, -10);
      ctx.lineTo(legX + (sheep.mode === 'walking' ? Math.sin(t * 5 + legX) * 3 : 0), 0);
      ctx.stroke();
    }

    // 羊毛：取背景插畫的暖白，不是純白，才不會在夕陽色調裡跳出來。
    // 輪廓要有足夠對比，否則在亮草地上整隻糊掉。
    ctx.fillStyle = '#f4ecd8';
    ctx.strokeStyle = 'rgba(107, 83, 53, 0.85)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.ellipse(0, -22, 28, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 背上一點暖陰影，讓羊毛看起來有體積而不是一片白
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#c8ac82';
    ctx.beginPath();
    ctx.ellipse(-4, -15, 20, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 頭與耳朵
    ctx.fillStyle = '#7d6446';
    ctx.beginPath();
    ctx.ellipse(27, -25 + headDrop, 10, 12, 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(20, -33 + headDrop * 0.7, 6, 3.5, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
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

  const api = {
    createBubbles, updateBubbles, drawBubbles, drawBackground, drawRiverFlow, drawForeground,
    gustStrength, createSheep, updateSheep, drawSheep, drawCanopySway,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AquariumScene = api;
})(typeof window !== 'undefined' ? window : globalThis);
