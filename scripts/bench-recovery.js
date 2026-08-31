// 復位（recovery）與整場移動的效能量測。
//
// 規格裡的效能數字必須可以重跑驗證，不能是一次性寫死在文件裡的宣稱。
// 用法：node scripts/bench-recovery.js
const Movement = require('../src/movement.js');
const Creature = require('../src/creature.js');

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
  // 尺寸要用整合層實際使用的碰撞尺寸，不要寫死——尺寸公式一改，這裡就會失準。
  const size = Creature.collisionSize({ width: 220, height: 400 }, 1920, 1080);
  const characters = [];
  let placed = 0;
  // 入口一開始會擠不下，必須跟 display.html 一樣每一幀重試，否則只進得了幾位，
  // 量到的就不是「15 位在跑」的成本。
  const trySpawn = () => {
    while (placed < 15) {
      const spawn = Movement.findSafeSpawn(size, characters, area, random);
      if (!spawn) break;
      characters.push({
        id: `c${placed}`, ...spawn, ...size,
        targetX: area.left + random() * (area.right - area.left),
        targetY: area.top + random() * (area.bottom - area.top),
        cruiseSpeed: 40 + random() * 30, vx: 0, vy: 0,
      });
      placed++;
    }
  };
  const dt = 1 / 60;
  const frames = 600;
  const frameMs = [];
  let recoveries = 0;
  let blocked = 0;
  for (let f = 0; f < frames; f++) {
    const started = process.hrtime.bigint();
    trySpawn();
    for (let i = 0; i < characters.length; i++) {
      const before = characters[i];
      const others = characters.filter((c) => c !== before);
      if (!Movement.isSafe(before, others, area)) recoveries++;
      const next = Movement.steerCharacter(before, characters, area, dt);
      if (next.blocked) blocked++;
      characters[i] = next;
      // 要跟 display.html 一樣「到了目標或走不動就換目標」。少了 stalled 這一半，
      // 量到的會是一群卡住不動的角色的成本，那不是實際運行的樣子。
      if (Math.hypot(next.targetX - next.x, next.targetY - next.baseY) < 20 || next.stalled) {
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
  console.log(`  場上 ${characters.length} 位（目標 15）  每 frame avg ${s.avg.toFixed(3)}ms  ${fmt(s)}  (60fps 預算 16.7ms)`);
  console.log(`  ${frames} frames 內：觸發復位 ${recoveries} 次、回報 blocked ${blocked} 次`);
}

console.log('\n=== 繞路規劃（planPath）：只在偵測到卡住時才跑，不是每一幀 ===');
{
  const area = Movement.getWalkableArea(1920, 1080);
  const size = Creature.collisionSize({ width: 220, height: 400 }, 1920, 1080);
  // 最貴的情境：目標在河的另一側，必須把整個網格走完才找得到下緣那條窄走廊。
  const crosser = {
    id: 'crosser', x: 1450, baseY: 720, ...size,
    targetX: 406, targetY: 895, cruiseSpeed: 55, vx: 0, vy: 0,
  };
  const one = timed(() => Movement.planPath(crosser, [], area, crosser.targetX, crosser.targetY), 20);
  console.log(`  單次（過河，要窮盡網格）              ${fmt(one)}`);

  // 15 位散開、同一幀全部需要規劃的假想最壞情況。實際上各自的觀察窗是錯開的，
  // 不會同時發生；這裡量的是理論上限。
  const spread = [];
  for (let i = 0; i < 15; i++) {
    spread.push({ ...crosser, id: `c${i}`, x: 1450, baseY: 700 + i * 0.5 });
  }
  const all = timed(() => {
    for (const c of spread) Movement.planPath(c, [], area, c.targetX, c.targetY);
  }, 10);
  console.log(`  15 位同一幀全部規劃（理論上限）       ${fmt(all)}  (60fps 預算 16.7ms)`);
}

console.log('\n=== 挑可到達目標（chooseReachableTarget）：只在角色回報卡住時才跑 ===');
{
  const area = Movement.getWalkableArea(1920, 1080);
  const size = Creature.collisionSize({ width: 220, height: 400 }, 1920, 1080);
  const self = {
    id: 'picker', x: 1450, baseY: 720, ...size,
    targetX: 406, targetY: 895, cruiseSpeed: 55, vx: 0, vy: 0,
  };
  const one = timed(() => Movement.chooseReachableTarget(self, [self], area, Math.random), 20);
  console.log(`  單次                                  ${fmt(one)}`);
  console.log('  （與 planPath 共用同一趟 BFS，成本同級；抵達目標時走的是便宜的 chooseSafeTarget）');
}
