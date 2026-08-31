const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const {
  getWalkableArea,
  personalSpace,
  spacesOverlap,
  hitsObstacle,
  isSafe,
  findSafeSpawn,
  chooseSafeTarget,
  steerCharacter,
  recoveryGrid,
} = require('../src/movement.js');

function openArea(overrides = {}) {
  return {
    left: 0,
    right: 1000,
    top: 0,
    bottom: 800,
    obstacles: [],
    ...overrides,
  };
}

function character(overrides = {}) {
  return {
    id: 'self',
    x: 300,
    baseY: 600,
    width: 40,
    height: 80,
    targetX: 800,
    targetY: 600,
    cruiseSpeed: 100,
    vx: 0,
    vy: 0,
    ...overrides,
  };
}

function sequence(values, fallback = 0.5) {
  let index = 0;
  const random = () => {
    const value = index < values.length ? values[index] : fallback;
    index++;
    return value;
  };
  random.calls = () => index;
  return random;
}

test('getWalkableArea 回傳 1600x900 精確邊界、障礙，並按畫面比例正規化', () => {
  assert.deepEqual(getWalkableArea(1600, 900), {
    left: 64,
    right: 1536,
    top: 405,
    bottom: 819,
    obstacles: [
      { x: 848, y: 432, width: 208, height: 207 },
      { x: 992, y: 594, width: 256, height: 162 },
    ],
  });
  assert.deepEqual(getWalkableArea(800, 450), {
    left: 32,
    right: 768,
    top: 202.5,
    bottom: 409.5,
    obstacles: [
      { x: 424, y: 216, width: 104, height: 103.5 },
      { x: 496, y: 297, width: 128, height: 81 },
    ],
  });
});

test('getWalkableArea 對非有限正尺寸立即失敗', () => {
  for (const [width, height] of [[0, 900], [-1, 900], [NaN, 900], [1600, Infinity]]) {
    assert.throws(() => getWalkableArea(width, height), RangeError);
  }
});

test('personalSpace 是腳下的地面足跡：以腳底為中心的扁橢圓，且不改動角色', () => {
  const small = { x: 120, baseY: 300, width: 100, height: 200 };
  const large = { x: 400, baseY: 700, width: 200, height: 300 };
  const before = structuredClone(small);

  // 中心就是腳底（baseY），不是身體中段——碰撞看的是腳踩在哪裡
  assert.deepEqual(personalSpace(small), {
    centerX: 120,
    centerY: 300,
    radiusX: 52,
    radiusY: 20.8,
  });
  assert.deepEqual(personalSpace(large), {
    centerX: 400,
    centerY: 700,
    radiusX: 98,
    radiusY: 39.2,
  });
  assert.deepEqual(small, before);
});

test('足跡不得凸出可行走區——上下緣與左右緣用同一套判準', () => {
  // 改用地面足跡之後橢圓以 baseY 為中心，若 y 軸只比 baseY 而不算 radiusY，
  // 足跡會凸出上下緣（凸進河流或畫面外），而 x 軸卻有 radiusX 邊距，兩軸不一致。
  const area = openArea();
  const self = character();
  const space = personalSpace(self);

  assert.equal(isSafe({ ...self, baseY: area.top }, [], area), false, '貼著上緣時足跡會凸出去');
  assert.equal(isSafe({ ...self, baseY: area.bottom }, [], area), false, '貼著下緣時足跡會凸出去');
  assert.equal(isSafe({ ...self, baseY: area.top + space.radiusY }, [], area), true);
  assert.equal(isSafe({ ...self, baseY: area.bottom - space.radiusY }, [], area), true);

  // 跟 x 軸完全對稱
  assert.equal(isSafe({ ...self, x: area.left }, [], area), false);
  assert.equal(isSafe({ ...self, x: area.left + space.radiusX }, [], area), true);

  // steerCharacter 回傳的位置也必須守住同一條線
  const outside = character({ x: -50, baseY: area.top - 50 });
  const result = steerCharacter(outside, [outside], area, 0.1);
  const resultSpace = personalSpace(result);
  assert.ok(resultSpace.centerY - resultSpace.radiusY >= area.top - 1e-9, '復位後足跡不得凸出上緣');
  assert.ok(resultSpace.centerX - resultSpace.radiusX >= area.left - 1e-9, '復位後足跡不得凸出左緣');
});

test('地面足跡不隨角色身高改變——高矮角色只要腳的寬度一樣就佔一樣的地', () => {
  const short = personalSpace({ x: 0, baseY: 0, width: 100, height: 120 });
  const tall = personalSpace({ x: 0, baseY: 0, width: 100, height: 400 });
  assert.deepEqual(short, tall, '身高不該影響地面足跡，否則高個子會佔掉不合理的地面');
});

test('可行走區容得下規格要求的 15 位角色', () => {
  // 這是規格「畫面最多同時顯示 15 位角色」與「安全間距不得互相接觸」能否同時成立的守衛。
  // 用整個人形當碰撞範圍時一排只塞得下約 10 位，15 位永遠達不到。
  const area = getWalkableArea(1920, 1080);
  const placed = [];
  const size = { width: 211, height: 383 }; // Task 4 尺寸公式下的近景角色
  for (let row = 0; row < 12 && placed.length < 15; row++) {
    for (let col = 0; col < 12 && placed.length < 15; col++) {
      const baseY = area.top + (row + 0.5) * ((area.bottom - area.top) / 6);
      const x = area.left + (col + 0.5) * ((area.right - area.left) / 10);
      const candidate = { ...size, x, baseY };
      if (baseY > area.bottom || x > area.right) continue;
      if (isSafe(candidate, placed, area)) placed.push(candidate);
    }
  }
  assert.equal(placed.length, 15, `可行走區只放得下 ${placed.length} 位，規格要求 15 位`);
});

test('personalSpace 拒絕缺漏、非有限或非正的必要幾何', () => {
  for (const value of [null, {}, { x: 0, baseY: 0, width: 0, height: 10 },
    { x: 0, baseY: NaN, width: 10, height: 10 }]) {
    assert.throws(() => personalSpace(value), TypeError);
  }
});

test('spacesOverlap 把橢圓外框剛好接觸視為碰撞', () => {
  const a = { centerX: 0, centerY: 0, radiusX: 10, radiusY: 20 };
  const touching = { centerX: 20, centerY: 0, radiusX: 10, radiusY: 5 };
  const separate = { centerX: 20.01, centerY: 0, radiusX: 10, radiusY: 5 };

  assert.equal(spacesOverlap(a, touching), true);
  assert.equal(spacesOverlap(a, separate), false);
});

test('hitsObstacle 偵測橢圓與矩形重疊，含相切', () => {
  const ellipse = { centerX: 20, centerY: 20, radiusX: 10, radiusY: 5 };
  assert.equal(hitsObstacle(ellipse, { x: 30, y: 10, width: 10, height: 20 }), true);
  assert.equal(hitsObstacle(ellipse, { x: 31, y: 10, width: 10, height: 20 }), false);
  assert.equal(hitsObstacle(ellipse, { x: 15, y: 18, width: 2, height: 2 }), true);
});

test('isSafe 拒絕越界、障礙與角色重疊，且不改動任何輸入', () => {
  const area = openArea({
    left: 50,
    right: 500,
    top: 300,
    bottom: 700,
    obstacles: [{ x: 250, y: 400, width: 50, height: 100 }],
  });
  const existing = [character({ id: 'other', x: 400, baseY: 600 })];
  const safe = character({ x: 150, baseY: 600 });
  const snapshot = structuredClone({ area, existing, safe });

  assert.equal(isSafe(safe, existing, area), true);
  assert.equal(isSafe(character({ x: 75, baseY: 600 }), existing, area), false);
  assert.equal(isSafe(character({ x: 150, baseY: 299 }), existing, area), false);
  assert.equal(isSafe(character({ x: 150, baseY: 701 }), existing, area), false);
  assert.equal(isSafe(character({ x: 240, baseY: 500 }), existing, area), false);
  assert.equal(isSafe(character({ x: 400, baseY: 600 }), existing, area), false);
  assert.deepEqual({ area, existing, safe }, snapshot);
});

test('findSafeSpawn 依序探索左、右、下邊緣並只回傳安全出生點', () => {
  const area = openArea({ right: 200, bottom: 100 });
  const size = { width: 20, height: 20 };
  const random = sequence([0.5]);

  const spawn = findSafeSpawn(size, [], area, random);

  assert.deepEqual(spawn, { x: 18.4, baseY: 50 });
  assert.equal(isSafe({ ...size, ...spawn }, [], area), true);
  assert.equal(random.calls(), 1);
});

test('findSafeSpawn 在 90 次都無安全位置時回傳 null，不縮小角色或容許重疊', () => {
  const area = openArea({ right: 30, bottom: 100 });
  const random = sequence([], 0.5);
  const size = { width: 20, height: 20 };

  assert.equal(findSafeSpawn(size, [], area, random), null);
  assert.equal(random.calls(), 90);
  assert.deepEqual(size, { width: 20, height: 20 });
});

test('chooseSafeTarget 排除 self 並選出安全內部目標', () => {
  const self = character({ x: 40, baseY: 40, width: 20, height: 20 });
  const area = openArea({ right: 200, bottom: 100 });
  const random = sequence([0.5, 0.5]);

  const target = chooseSafeTarget(self, [self], area, random);

  assert.deepEqual(target, { targetX: 100, targetY: 50 });
  assert.equal(isSafe({ ...self, x: target.targetX, baseY: target.targetY }, [], area), true);
});

test('chooseSafeTarget 在 60 次失敗後保留目前座標等待', () => {
  const self = character({ x: 15, baseY: 50, width: 20, height: 20 });
  const area = openArea({ right: 30, bottom: 100 });
  const random = sequence([], 0.5);

  assert.deepEqual(chooseSafeTarget(self, [self], area, random), {
    targetX: 15,
    targetY: 50,
  });
  assert.equal(random.calls(), 120);
});

test('steerCharacter 朝目標產生速度，垂直地面移動較慢且不改動輸入', () => {
  const self = character({ targetX: 400, targetY: 700 });
  const characters = [self];
  const snapshot = structuredClone({ self, characters });

  const result = steerCharacter(self, characters, openArea(), 0.1);

  assert.ok(result.x > self.x);
  assert.ok(result.baseY > self.baseY);
  assert.ok(Math.abs(result.vy) < Math.abs(result.vx));
  assert.ok(['x', 'baseY', 'vx', 'vy'].every((key) => Number.isFinite(result[key])));
  assert.notEqual(result, self);
  assert.deepEqual({ self, characters }, snapshot);
});

test('steerCharacter 預見鄰居後先減速或側移，最終不重疊', () => {
  const self = character();
  const neighbor = character({ id: 'neighbor', x: 390, targetX: 390 });
  const characters = [self, neighbor];

  const result = steerCharacter(self, characters, openArea(), 0.1);

  assert.ok(result.x < 310 || result.baseY !== 600);
  assert.equal(spacesOverlap(personalSpace(result), personalSpace(neighbor)), false);
});

test('steerCharacter 預見障礙後側移或減速，不會走進障礙', () => {
  const self = character();
  const area = openArea({ obstacles: [{ x: 360, y: 500, width: 100, height: 200 }] });

  const result = steerCharacter(self, [self], area, 0.1);

  assert.ok(result.x < 310 || result.baseY !== 600);
  assert.equal(hitsObstacle(personalSpace(result), area.obstacles[0]), false);
});

test('steerCharacter 將位置限制在邊界，沒有安全前進路徑時保持安全靜止', () => {
  // 停在足跡剛好貼齊右邊界的位置：再往右就會出界，所以應該原地不動。
  const maxX = openArea().right - personalSpace(character()).radiusX;
  const atEdge = character({ x: maxX, targetX: 1200 });
  const edgeResult = steerCharacter(atEdge, [atEdge], openArea(), 1);
  assert.equal(edgeResult.x, maxX);
  assert.equal(edgeResult.vx, 0);

  const blocked = character({ x: 300, targetX: 800 });
  const area = openArea({ obstacles: [{ x: 331, y: 0, width: 669, height: 800 }] });
  const blockedResult = steerCharacter(blocked, [blocked], area, 1);
  assert.equal(isSafe(blockedResult, [], area), true);
  assert.ok(blockedResult.x === blocked.x || blockedResult.baseY !== blocked.baseY);
});

test('steerCharacter 將起始越界位置投影到存在的安全位置', () => {
  const self = character({ x: -100, baseY: 900 });
  const area = openArea();

  const result = steerCharacter(self, [self], area, 0.1);

  assert.equal(isSafe(result, [], area), true);
  assert.ok(result.x >= area.left + personalSpace(self).radiusX);
  assert.ok(result.baseY <= area.bottom);
});

test('steerCharacter 從初始角色重疊狀態做 deterministic 安全分離', () => {
  const self = character();
  const neighbor = character({
    id: 'neighbor',
    x: self.x,
    baseY: self.baseY,
    width: 180,
    height: 280,
  });
  const characters = [self, neighbor];
  const snapshot = structuredClone(characters);

  const result = steerCharacter(self, characters, openArea(), 0.1);

  assert.equal(isSafe(result, [neighbor], openArea()), true);
  assert.equal(spacesOverlap(personalSpace(result), personalSpace(neighbor)), false);
  assert.deepEqual(characters, snapshot);
});

test('steerCharacter 從初始障礙交疊狀態投影到障礙外的安全位置', () => {
  const self = character();
  const obstacle = { x: 200, y: 400, width: 200, height: 300 };
  const area = openArea({ obstacles: [obstacle] });

  const result = steerCharacter(self, [self], area, 0.1);

  assert.equal(isSafe(result, [], area), true);
  assert.equal(hitsObstacle(personalSpace(result), obstacle), false);
});

test('steerCharacter 以 Number.MIN_VALUE recovery 時仍回傳有限速度與安全位置', () => {
  const self = character({ x: -100, baseY: 900 });
  const area = openArea();

  const result = steerCharacter(self, [self], area, Number.MIN_VALUE);

  assert.ok(['x', 'baseY', 'vx', 'vy'].every((key) => Number.isFinite(result[key])));
  assert.equal(isSafe(result, [], area), true);
});

// 這組幾何是 off-axis recovery 的 regression 守衛。
//
// O_init 蓋住整個左半邊，self 起點在裡面（初始重疊，允許往外離開）。右半邊只留一條
// y ∈ (150, 405) 的自由帶，且這條帶子與 O_init 直接相連，所以從起點有一整片直線可達、
// 完全不碰「非初始障礙」的安全區。
//
// 但這條帶子刻意避開所有「從 anchor 出發的固定射線」會落到的點：
//   水平 [1,0]              → baseY 恆為 400，橢圓下緣 410 > 405，戳進 O_bottom
//   反對角 [√½,-√½]         → 走到 x > 670 時 baseY 已 ≤ 219.8，橢圓上緣戳進 O_top
//   主對角 [√½,√½]          → baseY 只會 > 400，永遠落在帶子下方
//   垂直與向左的四條        → 一路留在 O_init 內
//   target 方向             → 指向右下 (960,700)，同樣落在帶子下方
//
// 因此安全出口只存在於非 0°／45° 的斜向；任何「固定角度射線」的搜尋都會漏掉它。
function offAxisPocketArea() {
  return {
    left: 0,
    right: 1000,
    top: 0,
    bottom: 800,
    obstacles: [
      { x: 0, y: 0, width: 640, height: 800 },
      { x: 640, y: 0, width: 360, height: 150 },
      { x: 640, y: 405, width: 360, height: 395 },
    ],
  };
}

test('recovery 找得到只在斜向開口外的安全點，不得誤報 blocked', () => {
  const area = offAxisPocketArea();
  const self = character({ x: 500, baseY: 400, targetX: 960, targetY: 700 });

  // 前提一：起點確實不安全，而且自由帶內真的存在大量安全點（不是單點巧合）。
  assert.equal(isSafe(self, [], area), false);
  let safeSamples = 0;
  for (let x = 645; x <= 970; x += 5) {
    for (let baseY = 150; baseY <= 405; baseY += 5) {
      if (isSafe({ ...self, x, baseY }, [], area)) safeSamples++;
    }
  }
  assert.ok(safeSamples > 500, `自由帶應有大片安全區，實際取樣到 ${safeSamples} 點`);

  const result = steerCharacter(self, [self], area, 0.1);

  assert.equal(result.blocked, false, '存在可達安全點時不得回報 blocked');
  assert.equal(isSafe(result, [], area), true);
  assert.ok(['x', 'baseY', 'vx', 'vy'].every((key) => Number.isFinite(result[key])));
});

// 牆上開一道 110px 的縫，右側是整片開闊安全區。起點在左半邊的大障礙內（初始重疊）。
// 這是 recovery 最容易錯的形狀：窄通道的入口節點很容易先被某條斜邊擋到，
// 如果搜尋在驗證邊之前就把節點記成「已訪問」，整條通道會被永久丟棄而誤報 blocked。
function narrowGapArea() {
  return {
    left: 0,
    right: 1000,
    top: 0,
    bottom: 800,
    obstacles: [
      { x: 0, y: 0, width: 400, height: 800 },
      { x: 400, y: 0, width: 60, height: 93 },
      { x: 400, y: 203, width: 60, height: 597 },
    ],
  };
}

test('通道入口先被擋住的邊碰到時，不得被永久丟棄（visited 必須在驗證之後才標記）', () => {
  // 這組幾何是外部審查用隨機搜尋 minimize 出來的：它是目前唯一能區分
  // 「邊驗證通過才標記 visited」與「先標記再驗證」的形狀。
  //
  // 先標記的版本會把某個節點在被擋住的邊碰到時就丟掉，之後即使有合法的邊
  // 走得到它也不再展開，於是整條出路消失、誤報 blocked。改動 BFS 記帳順序
  // 的人如果沒有這個測試，會無聲地把那個 bug 放回來。
  const area = {
    left: 0,
    right: 1179,
    top: 0,
    bottom: 586,
    obstacles: [
      { x: 579, y: 324, width: 636, height: 177 },
      { x: 959, y: 521, width: 60, height: 120 },
      { x: 1005, y: 357, width: 538, height: 282 },
    ],
  };
  const self = {
    id: 'self', x: 1136, baseY: 584, width: 10, height: 60,
    targetX: 943, targetY: 468, cruiseSpeed: 100, vx: 0, vy: 0,
  };

  assert.equal(isSafe(self, [], area), false, '起點必須不安全');

  const result = steerCharacter(self, [self], area, 0.1);

  assert.equal(result.blocked, false, '這個位置走得出去，不得誤報 blocked');
  assert.equal(isSafe(result, [], area), true);
});

test('recovery 走得過窄縫，能離開起點所在的大障礙', () => {
  const area = narrowGapArea();
  const self = character({ x: 77, baseY: 60, targetX: 900, targetY: 400 });

  assert.equal(isSafe(self, [], area), false, '起點必須不安全，否則根本不會進入 recovery');

  const result = steerCharacter(self, [self], area, 0.1);

  assert.equal(result.blocked, false, '縫是走得過去的，不得回報 blocked');
  assert.equal(isSafe(result, [], area), true);
  // BFS 取的是最近的安全節點，所以正確答案是「站在縫裡」而不是「衝到牆右側」。
  // 關鍵是它必須離開起點所在的大障礙、進到縫的位置，代表通道沒有被丟棄。
  assert.ok(result.x > 400, `應該走進縫的位置，實際落在 x=${result.x}`);
  assert.ok(result.baseY > 93 && result.baseY < 250, `應該落在縫的高度，實際 baseY=${result.baseY}`);
});

test('recovery 繞行時起點必須不安全，且回傳點是經合法路徑可達的', () => {
  // 牆把場地切成左右兩半，只在下方留一個開口；起點埋在左半邊的障礙裡。
  const area = openArea({
    obstacles: [
      { x: 0, y: 0, width: 400, height: 800 },
      { x: 400, y: 0, width: 60, height: 520 },
      { x: 400, y: 640, width: 60, height: 160 },
    ],
  });
  const self = character({ x: 200, baseY: 700, targetX: 900, targetY: 700 });

  assert.equal(isSafe(self, [], area), false, '起點必須不安全，否則走的是正常操舵路徑而非 recovery');

  const result = steerCharacter(self, [self], area, 0.1);

  assert.equal(result.blocked, false);
  assert.equal(isSafe(result, [], area), true);
  for (const obstacle of area.obstacles) {
    assert.equal(hitsObstacle(personalSpace(result), obstacle), false);
  }
});

test('recovery 不得穿越非初始障礙：牆完全封死時只能回報 blocked', () => {
  // x∈[640,680] 是一道上下貫通、完全密封的牆。牆的右側有大片安全區，
  // 但物理上到不了。若路徑驗證失效，角色會直接瞬移穿牆。
  const area = openArea({
    obstacles: [
      { x: 0, y: 0, width: 640, height: 800 },
      { x: 640, y: 0, width: 40, height: 800 },
    ],
  });
  const self = character({ x: 300, baseY: 400, targetX: 960, targetY: 400 });

  let safeBeyond = 0;
  for (let x = 700; x <= 990; x += 5) {
    for (let baseY = 5; baseY <= 795; baseY += 5) {
      if (isSafe({ ...self, x, baseY }, [], area)) safeBeyond++;
    }
  }
  assert.ok(safeBeyond > 1000, '牆的另一側確實有大片安全區（但到不了）');

  const result = steerCharacter(self, [self], area, 0.1);

  assert.equal(result.blocked, true, '密封牆後方到不了，只能 blocked');
  assert.ok(result.x < 640, `不得跨到牆的另一側，實際 x=${result.x}`);
});

test('recovery 不得穿越非初始角色：由角色排成的牆同樣擋得住', () => {
  // 左半邊被障礙完全封死（起點在裡面，屬於初始重疊，可以往外走），
  // 唯一的安全區在角色牆的右側。若「不得穿越角色」的檢查失效，
  // 角色會直接瞬移穿過整道人牆——所以這裡必須斷言 blocked。
  const area = openArea({ obstacles: [{ x: 0, y: 0, width: 600, height: 800 }] });
  const self = character({ x: 300, baseY: 400, targetX: 960, targetY: 400 });
  const wall = [];
  for (let baseY = -100; baseY <= 900; baseY += 30) {
    wall.push(character({ id: `wall${baseY}`, x: 660, baseY, width: 40, height: 80 }));
  }
  const characters = [self, ...wall];
  const others = wall;

  let safeBeyond = 0;
  for (let x = 720; x <= 990; x += 5) {
    for (let baseY = 20; baseY <= 780; baseY += 5) {
      if (isSafe({ ...self, x, baseY }, others, area)) safeBeyond++;
    }
  }
  assert.ok(safeBeyond > 1000, `牆右側確實有大片安全區（實際 ${safeBeyond} 點）但到不了`);

  const result = steerCharacter(self, characters, area, 0.1);

  assert.equal(result.blocked, true, '人牆後方到不了，只能 blocked');
  assert.ok(result.x < 660, `不得穿過角色牆，實際 x=${result.x}`);
});

test('薄牆也擋得住：路徑要逐段取樣，不能只檢查每一格的端點', () => {
  // 牆比「一格 grid edge 的長度」還薄。如果路徑檢查只看每條 edge 的終點，
  // 角色會直接從牆的一側跳到另一側（穿隧）；只有沿線逐段取樣才擋得住。
  // 要讓「取樣密度」真的有意義，一格 grid edge 必須長到足以跨過整個足跡加上牆。
  // 大場地配小角色時網格會被預算放粗，正是這種情況。
  const W = 4000;
  const H = 3000;
  const self = character({ x: 300, baseY: H / 2, width: 20, height: 80, targetX: W - 100, targetY: H / 2 });
  const probeArea = openArea({ right: W, bottom: H });
  const anchorX = 300;
  const { stepX } = recoveryGrid(self, probeArea, { x: anchorX, baseY: H / 2 });
  const space = personalSpace(self);

  // 牆連同兩側的足跡半徑構成一段「禁區」。要測得到取樣密度，禁區必須完整落在
  // 相鄰兩個格點之間——這樣「只檢查端點」的版本會一步跨過去，逐段取樣的版本才擋得住。
  const wallThickness = Math.min(20, (stepX - 2 * space.radiusX) * 0.6);
  assert.ok(wallThickness >= 1, '前提：網格要夠粗，禁區才塞得進一格之內');
  const midpoint = anchorX + stepX * 10.5;          // 第 10 與第 11 個格點的正中間
  const wallX = midpoint - wallThickness / 2;

  const sealed = openArea({
    right: W,
    bottom: H,
    obstacles: [
      // 牆的左側全部封死，所以不存在「還沒到牆就找到安全點」的捷徑，
      // 否則兩個版本都會停在牆前面，斷言就變成恆真。
      { x: 0, y: 0, width: wallX, height: H },                   // 起點所在（初始重疊）
      { x: wallX, y: 0, width: wallThickness, height: H },       // 薄牆，上下貫通
    ],
  });

  let safeBeyond = 0;
  for (let x = wallX + 200; x <= W - 100; x += 40) {
    for (let baseY = 100; baseY <= H - 100; baseY += 40) {
      if (isSafe({ ...self, x, baseY }, [], sealed)) safeBeyond++;
    }
  }
  assert.ok(safeBeyond > 500, `薄牆後方確實有大片安全區（實際 ${safeBeyond} 點）`);

  const result = steerCharacter(self, [self], sealed, 0.1);

  assert.ok(
    result.x < wallX,
    `不得跳過薄牆（牆在 x=${wallX}、厚 ${wallThickness.toFixed(1)}，實際落在 x=${result.x.toFixed(1)}）`,
  );
});

test('15 位角色真的進得了場：邊緣入口會隨著角色走開而空出來', () => {
  // 「可行走區塞得下 15 位」是用密鋪證明的，但實際進場只走 findSafeSpawn 的邊緣入口。
  // 一開始邊緣會擠不下，必須確認角色漫遊之後入口會空出來、等待中的作品進得來——
  // 否則場上永遠停在十幾位，規格的 15 位是達不到的。
  const area = getWalkableArea(1920, 1080);
  let seed = 20260831;
  const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const size = { width: 211, height: 383 };
  const characters = [];
  let placed = 0;
  let fullAtFrame = null;

  for (let frame = 0; frame < 900; frame++) { // 15 秒
    while (placed < 15) {
      const spawn = findSafeSpawn(size, characters, area, random);
      if (!spawn) break;
      characters.push({
        id: `c${placed}`, ...spawn, ...size,
        targetX: area.left + random() * (area.right - area.left),
        targetY: area.top + random() * (area.bottom - area.top),
        cruiseSpeed: 40 + random() * 30, vx: 0, vy: 0,
      });
      placed++;
    }
    if (placed === 15 && fullAtFrame === null) fullAtFrame = frame;
    for (let i = 0; i < characters.length; i++) {
      characters[i] = steerCharacter(characters[i], characters, area, 1 / 60);
    }
  }

  assert.equal(characters.length, 15, `場上只有 ${characters.length} 位，規格要求 15 位`);
  assert.ok(fullAtFrame !== null && fullAtFrame < 600, `太久才滿員（frame ${fullAtFrame}）`);
  for (let i = 0; i < characters.length; i++) {
    const others = characters.filter((c) => c !== characters[i]);
    assert.equal(isSafe(characters[i], others, area), true, `第 ${i} 位跑到不合法的位置`);
  }
});

test('recovery 的搜尋空間有限：兩軸步長比例跟足跡一致，節點數不超出預算', () => {
  const anchor = { x: 500, baseY: 400 };

  // 網格形狀要跟足跡形狀一致：兩軸步長的比例必須等於兩軸半徑的比例。
  // 若只夾單軸（例如把 stepY 抬到下限、stepX 不動），網格會被弄歪，
  // 小角色的垂直步長反而比自己的足跡還粗。
  for (const width of [4, 20, 40, 120, 400]) {
    const sample = character({ width, height: width * 2 });
    const space = personalSpace(sample);
    const grid = recoveryGrid(sample, getWalkableArea(1920, 1080), anchor);
    const stepRatio = grid.stepX / grid.stepY;
    const radiusRatio = space.radiusX / space.radiusY;
    assert.ok(
      Math.abs(stepRatio - radiusRatio) < 1e-6,
      `width=${width}：步長比 ${stepRatio.toFixed(3)} 應等於半徑比 ${radiusRatio.toFixed(3)}`,
    );
    assert.ok(grid.nodeCount <= 6000, `width=${width}：節點數 ${grid.nodeCount} 超出預算`);
  }

  // 大畫面配極小角色：純看角色半徑會讓節點數爆炸，必須自動放粗步長
  const tiny = character({ width: 6, height: 10 });
  const hugeArea = openArea({ right: 4000, bottom: 3000 });
  const tinyGrid = recoveryGrid(tiny, hugeArea, { x: 2000, baseY: 1500 });
  assert.ok(tinyGrid.nodeCount <= 6000, `節點數 ${tinyGrid.nodeCount} 超出預算`);
  assert.ok(
    tinyGrid.stepX > recoveryGrid(tiny, openArea(), anchor).stepX,
    '大場地時步長要放粗',
  );
});

test('同一層有多個安全點時取歐氏距離最近的那個', () => {
  // 網格兩軸步長不同（足跡是扁的，stepX > stepY），所以同一層裡「往右一格」
  // 比「往下一格」遠。這裡把障礙擺成：往右一格與往下一格都安全，但往右比較遠。
  //
  // 掃描順序是先水平再垂直，所以「掃到第一個安全點就回傳」會拿到比較遠的那個；
  // 只有真的比較過距離才會挑到往下那一格。
  const area = openArea();
  const self = character({ x: 500, baseY: 400, targetX: 900, targetY: 400 });
  const anchor = { x: self.x, baseY: self.baseY };
  const { stepX, stepY } = recoveryGrid(self, area, anchor);
  assert.ok(stepX > stepY * 1.5, '前提：水平步長明顯大於垂直步長');

  const space = personalSpace(self);
  // 障礙要碰得到起點，但碰不到右鄰與下鄰。右鄰足跡左緣在 (左緣 + stepX)、
  // 下鄰足跡上緣在 (上緣 + stepY)，所以障礙的右下角要落在那兩條線內側一點點。
  const obstacleRight = self.x - space.radiusX + stepX - 2;
  const obstacleBottom = self.baseY - space.radiusY + stepY - 2;
  const obstacle = {
    x: obstacleRight - 12,
    y: obstacleBottom - 8,
    width: 12,
    height: 8,
  };
  const withObstacle = openArea({ obstacles: [obstacle] });

  assert.equal(isSafe(self, [], withObstacle), false, '起點必須不安全');
  const right = { ...self, x: self.x + stepX, baseY: self.baseY };
  const down = { ...self, x: self.x, baseY: self.baseY + stepY };
  assert.equal(isSafe(right, [], withObstacle), true, '前提：往右一格是安全的');
  assert.equal(isSafe(down, [], withObstacle), true, '前提：往下一格是安全的');

  const result = steerCharacter(self, [self], withObstacle, 0.1);

  assert.equal(isSafe(result, [], withObstacle), true);
  const moved = Math.hypot(result.x - self.x, result.baseY - self.baseY);
  assert.ok(
    moved < stepX,
    `應該挑最近的那一格（位移 ${moved.toFixed(2)}，往右那格是 ${stepX.toFixed(2)}）`,
  );
});

test('安全區只在遠處角落時仍找得到，不得因為預算被浪費而誤報 blocked', () => {
  // 這一題守的是網格上下界：BFS 的節點預算是照可行走區大小算的，
  // 若允許往場外展開，那些格子 clamp 後全部擠在同一批邊界點上，
  // 會把預算吃光，於是明明走得到的遠處安全區被誤判成 blocked。
  const area = openArea({
    right: 1600,
    bottom: 1000,
    obstacles: [
      { x: 0, y: 0, width: 1400, height: 1000 },  // 起點在裡面（初始重疊，允許離開）
      { x: 1400, y: 0, width: 200, height: 700 }, // 只在右下角留一個口袋
    ],
  });
  const self = character({ x: 100, baseY: 500, targetX: 1500, targetY: 900 });

  assert.equal(isSafe(self, [], area), false);
  const result = steerCharacter(self, [self], area, 0.1);

  assert.equal(result.blocked, false, '右下角口袋走得到，不得回報 blocked');
  assert.equal(isSafe(result, [], area), true);
  assert.ok(result.x > 1400, `應該抵達右下角口袋，實際 x=${result.x}`);
});

test('recovery 的網格範圍剛好涵蓋可行走區，不往場外無限展開', () => {
  const area = openArea({ right: 1000, bottom: 800 });
  const anchor = { x: 500, baseY: 400 };
  const grid = recoveryGrid(character(), area, anchor);

  // 網格最遠只多留一圈，讓 clamp 後的邊界位置走得到；再多就是浪費預算
  const leftmost = anchor.x + grid.minGx * grid.stepX;
  const rightmost = anchor.x + grid.maxGx * grid.stepX;
  const topmost = anchor.baseY + grid.minGy * grid.stepY;
  const bottommost = anchor.baseY + grid.maxGy * grid.stepY;

  assert.ok(leftmost <= area.left && leftmost > area.left - 2 * grid.stepX,
    `左界 ${leftmost} 應剛好蓋過 ${area.left} 一圈`);
  assert.ok(rightmost >= area.right && rightmost < area.right + 2 * grid.stepX,
    `右界 ${rightmost} 應剛好蓋過 ${area.right} 一圈`);
  assert.ok(topmost <= area.top && topmost > area.top - 2 * grid.stepY);
  assert.ok(bottommost >= area.bottom && bottommost < area.bottom + 2 * grid.stepY);
});

test('recovery 在完全封閉的大場地仍在 frame 預算內結束', () => {
  // 這是最壞情況：必須把整個網格窮盡才能宣告 blocked。
  const area = openArea({ right: 1920, bottom: 1080, obstacles: [{ x: 0, y: 0, width: 1920, height: 1080 }] });
  const self = character({ x: 900, baseY: 540, targetX: 1800, targetY: 1000 });

  const started = process.hrtime.bigint();
  const result = steerCharacter(self, [self], area, 0.1);
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

  assert.equal(result.blocked, true, '完全封閉時應窮盡搜尋後回報 blocked');
  assert.ok(elapsedMs < 60, `單一角色最壞情況復位耗時 ${elapsedMs.toFixed(1)}ms，超出可接受範圍`);
});

test('blocked 只標記真正無安全點的結果，下一次安全更新會清除 stale marker', () => {
  const self = character();
  const fullyBlocked = openArea({
    obstacles: [{ x: 0, y: 0, width: 1000, height: 800 }],
  });

  const blockedResult = steerCharacter(self, [self], fullyBlocked, 0.1);
  assert.equal(blockedResult.blocked, true);
  assert.equal(isSafe(blockedResult, [], fullyBlocked), false);

  const safeResult = steerCharacter(blockedResult, [blockedResult], openArea(), 0.1);
  assert.equal(isSafe(safeResult, [], openArea()), true);
  assert.equal(safeResult.blocked, false);
});

test('steerCharacter 對 dt、速度與 malformed state fail fast，合法輸出不產生 NaN', () => {
  const valid = character();
  for (const dt of [-1, NaN, Infinity]) {
    assert.throws(() => steerCharacter(valid, [valid], openArea(), dt), RangeError);
  }
  assert.throws(
    () => steerCharacter(character({ cruiseSpeed: 0 }), [], openArea(), 0.1),
    RangeError,
  );
  assert.throws(
    () => steerCharacter(character({ targetX: undefined }), [], openArea(), 0.1),
    TypeError,
  );

  const result = steerCharacter(valid, [valid], openArea(), 0);
  assert.ok(['x', 'baseY', 'vx', 'vy'].every((key) => Number.isFinite(result[key])));
});

test('瀏覽器載入 movement.js 時暴露 window.Movement UMD API', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/movement.js'), 'utf8');
  const context = { window: {} };
  vm.runInNewContext(source, context);

  assert.equal(typeof context.window.Movement.getWalkableArea, 'function');
  assert.equal(typeof context.window.Movement.steerCharacter, 'function');
});
