// 水族箱背景：漸層海水、光束、氣泡、珊瑚、海草。純視覺，故意不做得太精緻，
// 效能與可維護性優先——這是投影在電視上跑一整個下午的活動用畫面。
(function (root) {
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
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    for (const b of bubbles) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBackground(ctx, w, h, t) {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#1a4f9c');
    grad.addColorStop(0.5, '#0d3b8c');
    grad.addColorStop(1, '#04184f');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // 從上方灑下來的光束，慢慢左右飄
    ctx.save();
    ctx.globalAlpha = 0.10;
    ctx.fillStyle = '#bfe6ff';
    for (let i = 0; i < 5; i++) {
      const baseX = (w / 5) * i + Math.sin(t * 0.15 + i) * 40;
      ctx.beginPath();
      ctx.moveTo(baseX - 40, 0);
      ctx.lineTo(baseX + 40, 0);
      ctx.lineTo(baseX + 140, h * 0.8);
      ctx.lineTo(baseX - 140, h * 0.8);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawRocksAndCoral(ctx, w, h) {
    const groundY = h * 0.88;
    ctx.save();
    ctx.fillStyle = '#173a63';
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, groundY + 30);
    for (let x = 0; x <= w; x += w / 10) {
      ctx.lineTo(x, groundY + Math.sin(x * 0.02) * 18);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    function coralBranch(x, y, colorA, colorB, scale) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      const grad = ctx.createLinearGradient(0, 0, 0, -80);
      grad.addColorStop(0, colorA);
      grad.addColorStop(1, colorB);
      ctx.strokeStyle = grad;
      ctx.lineCap = 'round';
      const branch = (bx, by, angle, len, depth) => {
        if (depth <= 0) return;
        const ex = bx + Math.cos(angle) * len;
        const ey = by + Math.sin(angle) * len;
        ctx.lineWidth = depth * 2.2;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        branch(ex, ey, angle - 0.4, len * 0.72, depth - 1);
        branch(ex, ey, angle + 0.45, len * 0.7, depth - 1);
      };
      branch(0, 0, -Math.PI / 2, 34, 4);
      ctx.restore();
    }

    coralBranch(w * 0.08, groundY + 10, '#ff6ec7', '#c93bd1', 1.0);
    coralBranch(w * 0.85, groundY + 6, '#ffb14e', '#ff6f61', 0.85);
    coralBranch(w * 0.93, groundY + 20, '#8a5cff', '#c893ff', 0.6);
  }

  function drawSeaweed(ctx, w, h, t) {
    const groundY = h * 0.9;
    const patches = [w * 0.18, w * 0.42, w * 0.68, w * 0.78];
    ctx.save();
    for (let i = 0; i < patches.length; i++) {
      const bx = patches[i];
      for (let s = -1; s <= 1; s += 2) {
        const sway = Math.sin(t * 0.9 + i * 1.3) * 20;
        ctx.strokeStyle = `rgba(80, 200, 140, ${0.55 + 0.15 * s})`;
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(bx + s * 10, groundY);
        ctx.quadraticCurveTo(bx + s * 10 + sway, groundY - 60, bx + s * 14 + sway * 0.6, groundY - 120);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  const api = { createBubbles, updateBubbles, drawBubbles, drawBackground, drawRocksAndCoral, drawSeaweed };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AquariumScene = api;
})(typeof window !== 'undefined' ? window : globalThis);
