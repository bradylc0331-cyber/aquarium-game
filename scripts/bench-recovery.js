// 復位（recovery）與整場移動的效能量測。
//
// 規格裡的效能數字必須可以重跑驗證，不能是一次性寫死在文件裡的宣稱。
// 用法：node scripts/bench-recovery.js
const Movement = require('../src/movement.js');

function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    med: sorted[Math.floor(sorted.length / 2)],
    max: sorted[sorted.length - 1],
    avg: samples.reduce((a, b) => a + b, 0) / samples.length,
  };
}

function timed(fn, runs) {
  fn(); // 熱身
  const samples = [];
  for (let i = 0; i < runs; i++) {
    const started = process.hrtime.bigint();
    fn();
    samples.push(Number(process.hrtime.bigint() - started) / 1e6);
  }
  return stats(samples);
}

const fmt = (s) => `med ${s.med.toFixed(2)}ms  max ${s.max.toFixed(2)}ms`;

function character(overrides) {
  return {
    id: 'self', x: 300, baseY: 400, width: 40, height: 80,
    targetX: 900, targetY: 600, cruiseSpeed: 100, vx: 0, vy: 0, ...overrides,
  };
}

console.log('=== 單一角色最壞情況：整個場地被障礙蓋滿，必須窮盡網格才能宣告 blocked ===');
for (const [label, W, H, w, h] of [
  ['可行走區 1920x1080 / 角色 40x80', 1920, 1080, 40, 80],
  ['全畫面 1920x1080 / 角色 40x80', 1920, 1080, 40, 80],
  ['全畫面 1920x1080 / 角色 211x383', 1920, 1080, 211, 383],
  ['全畫面 1920x1080 / 角色 6x10', 1920, 1080, 6, 10],
  ['全畫面 3840x2160 / 角色 40x80', 3840, 2160, 40, 80],
]) {
  const base = label.startsWith('可行走區')
    ? Movement.getWalkableArea(W, H)
    : { left: 0, right: W, top: 0, bottom: H, obstacles: [] };
  const area = { ...base, obstacles: [{ x: 0, y: 0, width: W, height: H }] };
  const self = character({ x: W / 2, baseY: (area.top + area.bottom) / 2, width: w, height: h });
  const result = timed(() => Movement.steerCharacter(self, [self], area, 0.1), 15);
  console.log(`  ${label.padEnd(34)} ${fmt(result)}`);
}

console.log('\n=== 15 位角色同時陷入最壞情況（同一 frame 內全部窮盡搜尋）===');
for (const [label, w, h] of [['角色 40x80', 40, 80], ['角色 211x383', 211, 383]]) {
  const W = 1920, H = 1080;
  const area = { left: 0, right: W, top: 0, bottom: H, obstacles: [{ x: 0, y: 0, width: W, height: H }] };
  const crowd = [];
  for (let i = 0; i < 15; i++) crowd.push(character({ id: `c${i}`, x: W / 2 + i * 2, baseY: H / 2, width: w, height: h }));
  const result = timed(() => {
    for (const c of crowd) Movement.steerCharacter(c, crowd, area, 0.1);
  }, 10);
  console.log(`  ${label.padEnd(34)} ${fmt(result)}`);
}

console.log('\n=== 正常運行：1920x1080、實際可行走區、15 位角色漫遊 600 frames ===');
{
  const area = Movement.getWalkableArea(1920, 1080);
  let seed = 424242;
  const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const characters = [];
  for (let i = 0; i < 15; i++) {
    const size = { width: 211, height: 383 };
    const spawn = Movement.findSafeSpawn(size, characters, area, random);
    if (!spawn) break;
    characters.push({
      id: `c${i}`, ...spawn, ...size,
      targetX: area.left + random() * (area.right - area.left),
      targetY: area.top + random() * (area.bottom - area.top),
      cruiseSpeed: 40 + random() * 30, vx: 0, vy: 0,
    });
  }
  const dt = 1 / 60;
  const frames = 600;
  const frameMs = [];
  let recoveries = 0;
  let blocked = 0;
  for (let f = 0; f < frames; f++) {
    const started = process.hrtime.bigint();
    for (let i = 0; i < characters.length; i++) {
      const before = characters[i];
      const others = characters.filter((c) => c !== before);
      if (!Movement.isSafe(before, others, area)) recoveries++;
      const next = Movement.steerCharacter(before, characters, area, dt);
      if (next.blocked) blocked++;
      characters[i] = next;
      if (Math.hypot(next.targetX - next.x, next.targetY - next.baseY) < 20) {
        characters[i] = {
          ...next,
          targetX: area.left + random() * (area.right - area.left),
          targetY: area.top + random() * (area.bottom - area.top),
        };
      }
    }
    frameMs.push(Number(process.hrtime.bigint() - started) / 1e6);
  }
  const s = stats(frameMs);
  console.log(`  場上 ${characters.length} 位  每 frame avg ${s.avg.toFixed(3)}ms  ${fmt(s)}  (60fps 預算 16.7ms)`);
  console.log(`  ${frames} frames 內：觸發復位 ${recoveries} 次、回報 blocked ${blocked} 次`);
}
