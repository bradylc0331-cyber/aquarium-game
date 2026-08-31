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
      const sway = Math.sin(t * 1.25 + i * 0.38) * bladeHeight * 0.24;
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

  const api = { createBubbles, updateBubbles, drawBubbles, drawBackground, drawRiverFlow, drawForeground };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AquariumScene = api;
})(typeof window !== 'undefined' ? window : globalThis);
