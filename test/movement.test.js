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
  chooseReachableTarget,
  planPath,
  steerCharacter,
  recoveryGrid,
  segmentSampleStep,
  NEIGHBOR_OFFSETS,
  EDGE_BAND_RADII,
  VERTICAL_SPEED_FACTOR,
  AVOID_SLOW_SCALE,
  RECOVERY_MAX_NODES,
} = require('../src/movement.js');
const { displaySize, speedScaleForCanvas } = require('../src/creature.js');
const { SPECIES } = require('../src/species.js');

// 產品裡每位人物的實際巡航速度（1080p 下是 11~27 px/s）。
//
// 測試一定要用這組數字。先前長時間測試用的是 40~70、過河用 55、邊界用 120，
// 全都是產品永遠不會進入的區間——而卡住偵測的門檻是「自由行走距離的比例」，
// 跟速度成正比，所以測試跑在 3 倍速下，卡住比實際容易偵測得多。
// 真正的後果：同一個 seed 在測試速度下量到 7.8 秒的困住，在真實速度下是 29 秒。
function realCruiseSpeeds(canvasHeight) {
  return SPECIES.map((s) => (s.swim.speed[0] + s.swim.speed[1]) / 2 * speedScaleForCanvas(canvasHeight));
}

// 直線走得到嗎——用足跡沿線取樣，跟實作的判準一致。
function pathReaches(self, area, target) {
  for (let t = 0; t <= 1; t += 0.02) {
    const probe = {
      ...self,
      x: self.x + (target.targetX - self.x) * t,
      baseY: self.baseY + (target.targetY - self.baseY) * t,
    };
    if (!isSafe(probe, [], area)) return false;
  }
  return true;
}

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

test('getWalkableArea 按畫面比例正規化，且上緣落在草地而不是遠山', () => {
  const big = getWalkableArea(1600, 900);
  const small = getWalkableArea(800, 450);

  // 上緣必須明顯低於畫面中線——0.45 那條線在背景插畫裡已經是遠處山丘與城鎮，
  // 角色站上去會變成站在山上的巨人。
  assert.ok(big.top / 900 >= 0.55, `上緣 ${big.top / 900} 太高，會讓角色站到遠景`);
  assert.equal(big.top, 540);
  assert.equal(big.bottom, 837);
  assert.equal(big.left, 64);
  assert.equal(big.right, 1536);

  // 兩個障礙：前景左右兩棵大橄欖樹的樹幹。
  //
  // **草地上沒有河**——河在畫面中段的遠景，角色走的前景草地上沒有水。
  // 先前這裡有兩塊「河流」障礙，是照整張插畫的印象加的，沒有對著角色實際
  // 走的那條草地量：它們擋掉一大片能走的草地，還夾出一條 28px 高的死巷，
  // 有角色走進去之後連續 294 秒出不來。
  assert.equal(big.obstacles.length, 2);

  // 障礙的位置也要釘住，不能只釘數量——只驗數量的話，把兩塊縮成 0x0
  // 或搬到別的地方測試都不會發現。
  const [leftTrunk, rightTrunk] = big.obstacles;
  assert.ok(Math.abs(leftTrunk.x / 1600 - 0.05) < 1e-9, '左樹幹的左緣');
  assert.ok(Math.abs(leftTrunk.width / 1600 - 0.11) < 1e-9, '左樹幹的寬度');
  assert.ok(Math.abs(rightTrunk.x / 1600 - 0.88) < 1e-9, '右樹幹的左緣');
  assert.ok(Math.abs(rightTrunk.width / 1600 - 0.10) < 1e-9, '右樹幹的寬度');
  for (const trunk of big.obstacles) {
    assert.ok(trunk.height > 0 && trunk.width > 0, '樹幹要有實際大小');
    assert.ok(trunk.y < big.bottom && trunk.y + trunk.height > big.top, '樹幹要跟草地帶重疊');
  }

  // 完全按畫面比例縮放
  assert.equal(small.top / 450, big.top / 900);
  assert.equal(small.bottom / 450, big.bottom / 900);
  assert.equal(small.left / 800, big.left / 1600);
  assert.equal(small.obstacles.length, big.obstacles.length);
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

  // 下緣同樣要守住（只測上緣的話，clampPosition 少內縮一邊也抓不到）
  const belowFloor = character({ x: area.right + 50, baseY: area.bottom + 50 });
  const floorResult = steerCharacter(belowFloor, [belowFloor], area, 0.1);
  const floorSpace = personalSpace(floorResult);
  assert.ok(floorSpace.centerY + floorSpace.radiusY <= area.bottom + 1e-9, '復位後足跡不得凸出下緣');
  assert.ok(floorSpace.centerX + floorSpace.radiusX <= area.right + 1e-9, '復位後足跡不得凸出右緣');
});

test('clampPosition 的 y 內縮：起點遠在區外時，夾回來的位置足跡仍完整在區內', () => {
  // clampPosition 是復位的起點（anchor）。它若沒有內縮 radiusY，anchor 會落在
  // 足跡凸出上下緣的位置上，導致本來走得到安全點的場景被誤報 blocked。
  const area = openArea({ top: 100, bottom: 300 });
  const self = character({ x: 500, baseY: -5000, targetX: 500, targetY: 200 });
  const space = personalSpace(self);

  const result = steerCharacter(self, [self], area, 0.1);

  assert.equal(result.blocked, false, '空曠場地不該回報 blocked');
  assert.ok(result.baseY - space.radiusY >= area.top - 1e-9,
    `夾回來的位置足跡凸出上緣（baseY=${result.baseY}, radiusY=${space.radiusY}）`);
  assert.ok(result.baseY + space.radiusY <= area.bottom + 1e-9, '夾回來的位置足跡凸出下緣');
  assert.equal(isSafe(result, [], area), true);
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
  // 用 Task 4 實際的尺寸公式，不要寫死——尺寸一改就會失去意義
  const size = displaySize({ width: 220, height: 400 }, 1920, 1080, 1);
  const placed = [];
  for (let baseY = area.top; baseY <= area.bottom; baseY += 6) {
    for (let x = area.left; x <= area.right; x += 6) {
      if (placed.length >= 15) break;
      const candidate = { ...size, x, baseY };
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

test('findSafeSpawn 從靠近邊緣的位置進場，且只回傳安全出生點', () => {
  const area = openArea({ right: 200, bottom: 100 });
  const size = { width: 20, height: 20 };
  const spawn = findSafeSpawn(size, [], area, sequence([], 0.5));

  assert.ok(spawn, '空場地一定要找得到入口');
  assert.equal(isSafe({ ...size, ...spawn }, [], area), true);

  // 「從場景邊緣進入」要用**絕對尺度**驗，不能拿實作自己的比例當門檻。
  // 舊寫法是 `x - radiusX <= left + 0.30 * 寬` 對上實作的 0.25 倍帶寬，代數上
  // 恆真；下緣那條 0.5 對 0.5 更是永遠成立。結果把入口帶整個換成全場（等於
  // 完全沒有邊緣行為）測試照樣全綠。
  //
  // 改成量「離最近邊界有幾個自己的足跡半徑」，並且同時釘住那個倍數本身很小。
  // 兩條合起來才擋得住「把帶放寬到整個場地」這種改動。
  assert.ok(EDGE_BAND_RADII <= 4, `入口帶不得超過 4 個足跡半徑（目前 ${EDGE_BAND_RADII}）`);

  for (const [W, H] of [[1920, 1080], [1280, 720], [3840, 2160], [800, 600]]) {
    const walkable = getWalkableArea(W, H);
    const walkableSize = displaySize({ width: 220, height: 400 }, W, H, 1.05);
    const space = personalSpace({ x: 0, baseY: 0, ...walkableSize });
    let seed = 5;
    const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

    for (let i = 0; i < 400; i++) {
      const point = findSafeSpawn(walkableSize, [], walkable, random);
      assert.ok(point, `${W}x${H}：空場地一定要找得到入口`);
      // 四個方向各自換算成「幾個足跡半徑」，取最近的那一邊。
      const radii = Math.min(
        (point.x - space.radiusX - walkable.left) / space.radiusX,
        (walkable.right - space.radiusX - point.x) / space.radiusX,
        (point.baseY - space.radiusY - walkable.top) / space.radiusY,
        (walkable.bottom - space.radiusY - point.baseY) / space.radiusY,
      );
      assert.ok(
        radii <= EDGE_BAND_RADII + 1e-9,
        `${W}x${H}：出生點離最近邊界 ${radii.toFixed(2)} 個足跡半徑，超出入口帶`,
      );
    }
  }
});

test('障礙壓在邊界線上時，那一整條邊的入口不能整個失效', () => {
  // 這是實際踩到的坑：前景樹幹貼著畫面左右緣，剛好蓋住原本「單一條出生線」，
  // 於是左右兩邊的入口 100% 失效，場上永遠湊不滿 15 位。
  const area = openArea({
    right: 1000,
    bottom: 400,
    obstacles: [
      { x: 0, y: 0, width: 120, height: 400 },      // 貼著左緣
      { x: 880, y: 0, width: 120, height: 400 },    // 貼著右緣
    ],
  });
  const size = { width: 40, height: 80 };
  let seed = 7;
  const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

  const placed = [];
  for (let i = 0; i < 6; i++) {
    const spawn = findSafeSpawn(size, placed, area, random);
    if (!spawn) break;
    placed.push({ ...size, ...spawn });
  }
  assert.ok(placed.length >= 4, `邊緣被障礙壓住時仍應找得到入口，實際只放進 ${placed.length} 位`);
  for (const c of placed) {
    assert.equal(isSafe(c, placed.filter((o) => o !== c), area), true);
  }
});

test('findSafeSpawn 在 90 次都無安全位置時回傳 null，不縮小角色或容許重疊', () => {
  const area = openArea({ right: 30, bottom: 100 });
  const random = sequence([], 0.5);
  const size = { width: 20, height: 20 };

  assert.equal(findSafeSpawn(size, [], area, random), null);
  assert.equal(random.calls(), 180, '90 次嘗試、每次取兩個隨機數');
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
  // 舊寫法只斷言 |vy| < |vx|。這個場景的 dx 與 dy 相等，所以把 VERTICAL_SPEED_FACTOR
  // 改成 1、垂直完全不減速，兩者仍差 5.7e-13（純浮點抵消誤差），斷言照樣成立。
  // 要驗的是**比例**：dx 與 dy 相等時，vy/vx 必須正好等於那個係數。
  assert.ok(Math.abs(result.vy) < Math.abs(result.vx));
  // 兩條缺一不可。只比對 vy/vx 與匯入的常數是自我循環的——改常數會同時改動
  // 斷言的兩邊，係數設成 1（垂直完全不減速）照樣會過。所以先獨立釘住
  // 「這個係數必須小於 1」，再確認它真的被套用了。
  assert.ok(VERTICAL_SPEED_FACTOR < 1, '垂直移動必須比水平慢');
  assert.ok(
    Math.abs(Math.abs(result.vy / result.vx) - VERTICAL_SPEED_FACTOR) < 1e-9,
    `vy/vx 應為 ${VERTICAL_SPEED_FACTOR}，實際 ${Math.abs(result.vy / result.vx)}`,
  );
  assert.ok(['x', 'baseY', 'vx', 'vy'].every((key) => Number.isFinite(result[key])));
  assert.notEqual(result, self);
  assert.deepEqual({ self, characters }, snapshot);
});

test('steerCharacter 遇到擋路的鄰居會真的繞過去，不是停在原地', () => {
  // 舊版斷言是 `result.x < 310 || result.baseY !== 600`：原地停住就滿足前半，
  // 所以整段柔性避碰程式碼刪掉測試照樣全綠。要驗的是**真的繞過去了**，
  // 也就是最後越過鄰居、抵達目標，而不是「有做了某件不是全速前進的事」。
  const neighbor = character({ id: 'neighbor', x: 390, targetX: 390, cruiseSpeed: 1 });
  const area = openArea();
  let self = character({ targetX: 700, targetY: 600 });

  const startX = self.x;
  for (let frame = 0; frame < 600; frame++) {
    const characters = [self, neighbor];
    const next = steerCharacter(self, characters, area, 1 / 60);
    self = { ...self, ...next };
    assert.equal(
      spacesOverlap(personalSpace(self), personalSpace(neighbor)), false,
      `第 ${frame} 幀與鄰居重疊`,
    );
  }

  assert.ok(
    self.x > neighbor.x + personalSpace(neighbor).radiusX,
    `必須繞過鄰居（鄰居在 x=${neighbor.x}，10 秒後只走到 x=${self.x.toFixed(1)}，起點 ${startX}）`,
  );
});

test('steerCharacter 遇到擋路的障礙會真的繞過去，不是停在原地', () => {
  // 同上：原地不動也能滿足舊的 disjunctive 斷言。這裡要求角色實際走到障礙的另一側。
  const obstacle = { x: 360, y: 500, width: 100, height: 200 };
  const area = openArea({ obstacles: [obstacle] });
  let self = character({ targetX: 700, targetY: 600 });

  for (let frame = 0; frame < 600; frame++) {
    const next = steerCharacter(self, [self], area, 1 / 60);
    self = { ...self, ...next };
    assert.equal(
      hitsObstacle(personalSpace(self), obstacle), false,
      `第 ${frame} 幀走進障礙`,
    );
  }

  assert.ok(
    self.x > obstacle.x + obstacle.width,
    `必須繞過障礙（障礙右緣 x=${obstacle.x + obstacle.width}，10 秒後只走到 x=${self.x.toFixed(1)}）`,
  );
});

test('單獨一位角色也不得永久卡死：三條固定射線全被擋住時仍要找到出路', () => {
  // 這條在驗的是舊控制器的死法：它只試「朝目標」與其 ±90° 三條固定支線，
  // 三條都被擋住就落到 {vx:0, vy:0} 永遠停住——輸入每一幀都一樣，所以是永久的。
  //
  // 夾具是**合成**的朝北開口在南的 U 形凹槽，不是正式場地。舊版用的是河流時代
  // 錄下來的一組座標，今天量起來四周 36/36 個方向都是通的、角色也從不 threatened，
  // 整條測試已經退化成「一個自由的角色會動」——前提沒了，斷言就沒有意義。
  const self = {
    id: 'solo', x: 500, baseY: 700, targetX: 500, targetY: 480,
    width: 160, height: 290, cruiseSpeed: 55, vx: 0, vy: 0,
  };
  // 足跡半徑跟實作同一套公式，凹槽才會剛好貼著角色。
  const radiusX = self.width * 0.42 + Math.max(10, self.width * 0.07);
  const radiusY = radiusX * 0.4;
  const CLEAR = 12; // 牆離足跡的空隙：角色站著是安全的，一往那個方向走就撞牆
  const THICK = 40;
  const area = {
    left: 0, right: 1000, top: 0, bottom: 1000,
    obstacles: [
      // 北（正對目標）
      { x: self.x - radiusX - CLEAR - THICK, y: self.baseY - radiusY - CLEAR - THICK,
        width: (radiusX + CLEAR + THICK) * 2, height: THICK },
      // 東（目標方向 +90°）
      { x: self.x + radiusX + CLEAR, y: self.baseY - radiusY - CLEAR - THICK,
        width: THICK, height: (radiusY + CLEAR + THICK) * 2 },
      // 西（目標方向 -90°）
      { x: self.x - radiusX - CLEAR - THICK, y: self.baseY - radiusY - CLEAR - THICK,
        width: THICK, height: (radiusY + CLEAR + THICK) * 2 },
    ],
  };

  const probeDistance = CLEAR + 8; // 剛好越過空隙碰到牆
  const probe = (degrees) => {
    const radians = (degrees * Math.PI) / 180;
    return isSafe({
      ...self,
      x: self.x + Math.cos(radians) * probeDistance,
      baseY: self.baseY + Math.sin(radians) * probeDistance,
    }, [], area);
  };

  // 前提：角色本身安全（走的不是復位路徑）。
  assert.equal(isSafe(self, [], area), true, '前提：角色站著要是安全的');
  // 前提：舊控制器會試的那三條射線**全部**被擋住。這才是這條測試存在的理由。
  for (const [label, degrees] of [['朝目標', -90], ['目標 +90°', 0], ['目標 -90°', 180]]) {
    assert.equal(probe(degrees), false, `前提：${label} 必須被擋住`);
  }
  // 前提：但確實還有別的路可以出去，而且不是四通八達——是一個真的凹槽。
  let safeDirections = 0;
  for (let degrees = 0; degrees < 360; degrees += 10) if (probe(degrees)) safeDirections++;
  assert.ok(
    safeDirections > 0 && safeDirections < 12,
    `前提：要是一個真的凹槽——有出路但不多（實際 ${safeDirections}/36）`,
  );

  const dt = 1 / 60;
  const first = steerCharacter(self, [self], area, dt);
  assert.equal(first.blocked, false);
  assert.ok(
    Math.hypot(first.x - self.x, first.baseY - self.baseY) > 0,
    `三條固定射線全被擋住，但還有 ${safeDirections}/36 條路，卻一步都沒動`,
  );

  // 光是「動了」還不夠——要真的走出凹槽並且繞到目標。實測 6.2 秒脫困、30 秒內抵達。
  const pocketBottom = area.obstacles[1].y + area.obstacles[1].height;
  let current = { ...self };
  let escapedAt = null;
  let arrivedAt = null;
  for (let frame = 0; frame < 60 * 30; frame++) {
    current = { ...current, ...steerCharacter(current, [current], area, dt) };
    if (escapedAt === null && current.baseY > pocketBottom) escapedAt = frame / 60;
    if (arrivedAt === null
      && Math.hypot(current.targetX - current.x, current.targetY - current.baseY) < radiusX) {
      arrivedAt = frame / 60;
    }
  }
  assert.ok(escapedAt !== null && escapedAt < 15, `30 秒內沒走出凹槽（脫困時間 ${escapedAt}）`);
  assert.ok(arrivedAt !== null, '走出凹槽之後仍然沒有繞到目標');
});

test('長時間運行後角色仍在移動、也還到得了目標，不會整場凍住', () => {
  // 規格要角色「在整個可行走區自由移動」。單看一幀永遠看不出凍結：卡住的角色
  // 每一幀都回傳安全、blocked=false 的合法結果，只是位置再也不變。
  // 只有把整個迴圈跑起來、量最後一段時間的實際位移，才驗得到這條規格。
  //
  // 量的是角色**實際走到過的範圍**（bounding box），不是路徑長也不是頭尾直線距離。
  // 三種度量都試過，只有這個對：
  //   - 頭尾直線距離：繞一圈回到附近的正常漫遊會被誤判成卡住。
  //   - 路徑長：這是上一版用的，錯得最嚴重——原地高頻抖動的路徑長**特別大**。
  //     實測有角色 30 秒走了 1013px，卻從頭到尾沒離開過 10x14px 的範圍；
  //     另一位走了 994px，範圍只有 0.9x8.8px。路徑長全部 >200px，測試全綠。
  //   - 走過的範圍：抖動的角色範圍必然很小，繞圈的角色範圍很大，分得開。
  //
  // 視窗取 30 秒而不是 10 秒：實測 15 位擠在 356px 高的草地上，任何一位都可能
  // 有某個 10 秒視窗只走 74px——那是規格允許的「暫時過於擁擠就降速等空間」，
  // 不是卡死。但沒有任何一位會連續 30 秒走不動。多解析度、多 seed 一起跑，
  // 免得又是挑到剛好會過的那一組。
  const dt = 1 / 60;
  // 五分鐘，不是 90 秒。90 秒會漏掉真正的問題：實測有角色從第 73 秒才開始
  // 卡住、連續困了 59 秒，而 90 秒的測試在第 90 秒就收工，最後 30 秒的視窗
  // 還被前半段的正常移動稀釋掉，看起來完全正常。把 5400 改成 7200 就會紅。
  const frames = 18000;             // 300 秒
  // 範圍與踱步比值量**整段**，不是最後 30 秒。
  //
  // 切一個視窗來量是脆弱的：切在哪裡會決定看不看得到問題，而且邊緣值會因為
  // 剛好卡在視窗邊界而擦邊失敗（實測有角色最後 30 秒的範圍是 59px，門檻 60）。
  // 整段量沒有這個問題，門檻也可以拉到有意義的高度。
  const measureFrom = 0;
  // 三個門檻都是量出來的，不是猜的。八組解析度×seed 全掃的結果：
  //   走過的範圍最小 90px、每組至少 12/15 位抵達過目標、全場至少 33 次抵達、
  //   「路徑長 / 範圍」最大 7.2。
  // 對照壞掉的版本：範圍 0～44px、比值 58～184。中間空得很開，門檻取在中間。
  // 整段（五分鐘）走過的範圍，以角色**自己的足跡半徑**為單位。
  //
  // 不能用固定像素：所有東西都隨畫布縮放，1280x720 下健康的角色是 136~461px，
  // 1920x1080 下是 230~934px，同一個固定門檻對其中一邊一定是錯的。
  // 換算成足跡半徑之後，八組實測的分布是 1.9~9.4 倍（多數在 7 以上，尾端到 1.9），
  // 而真正卡死的角色整段下來不到 0.5 倍。門檻取 1.5：低於實測尾端、
  // 仍遠高於卡死的量級。
  const MIN_EXTENT_RADII = 1.5;
  // 路徑長 ÷ 走過的範圍：原地踱步的話這個值會很大。
  //
  // 八組實測的分布是 3.9~11.4，只有一組例外：3840x2160 seed=777777 有一位
  // 角色是 27.5。查過原因——牠待在河右緣（0.77）與右邊那棵橄欖樹左緣（0.88）
  // 之間的口袋裡，那塊地扣掉足跡直徑只剩 105px 的活動空間，佔全場安全點的 8%。
  // 這是**已知的殘留問題，記在這裡而不是把門檻調到看不見**：真正的解法是把
  // 障礙物對回背景美術（河流在草地帶裡到底佔多寬要重新量），那是另一件事。
  const MAX_PACING_RATIO = 30;
  const MIN_ARRIVED = 10;         // 15 位裡至少幾位抵達過目標
  const MIN_TOTAL_ARRIVALS = 25;
  // 「連續困在小框裡」最多可以持續幾秒，以及全程佔比的上限。
  //
  // 全程逐幀盯著，不事後切視窗——視窗切在哪裡會決定看不看得到問題。
  // 注意這裡**不能**因為回報了 stalled 就歸零：稀疏的 stalled（每兩秒一次）
  // 會把計時器一直重設，量到的最大值永遠停在 2 秒，而實際上是 15~26 秒。
  // 說了「我走不動」不等於脫困。
  //
  // 門檻是量出來的，而且要誠實說明它涵蓋的是**壅塞**而不是凍結：
  // 規格允許「暫時過於擁擠就降速等空間」。八組實測（真實速度）：
  //   3840x2160  卡住時間佔比 3~5%   最長一次 6.8~8.6 秒
  //   1920x1080  佔比 11~21%         最長 11.9~18.0 秒
  //   1280x720 / 1024x768  佔比 25~37%  最長 19.4~26.4 秒
  // 解析度愈小愈擠（角色是畫面高度的固定比例，小畫面的絕對空間就少）。
  // 真正壞掉的版本是「走了自由行走距離的 68% 卻沒離開過比腳還小的框」，
  // 跟這裡的 37~55%、且最終都會脫困，是不同量級。
  const CONFINE_BOX = 15;
  const MAX_CONFINED_SECONDS = 40;
  const MAX_CONFINED_FRACTION = 0.5;

  // 解析度與 seed 是從 20 組全掃裡挑**最難**的那幾組釘住的，不是挑會過的。
  // 全掃結果：每位角色最後 30 秒最少走 263px、全場最少抵達 12 次。
  for (const [[W, H], initialSeed] of [
    [[1920, 1080], 1], [[1920, 1080], 777777],
    [[1280, 720], 1], [[1280, 720], 42],
    [[3840, 2160], 1], [[3840, 2160], 777777],
    [[1024, 768], 1], [[1024, 768], 42],
  ]) {
    {
      const area = getWalkableArea(W, H);
      let seed = initialSeed;
      const random = () => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed / 2147483648;
      };
      const size = displaySize({ width: 220, height: 400 }, W, H, 1.05);
      const characters = [];
      // 換目標走的是 display.html 用的同一條路徑：chooseSafeTarget 會挑一個
      // 本身安全的點。純隨機挑點會挑到別人身上或障礙裡，那是測試自己造出來的
      // 不可達目標，不是實作的問題。
      // 換目標走的是 display.html 用的同一套規則：
      //   - 抵達目標：隨便挑一個安全點就好（便宜）。
      //   - 回報卡住：要挑一個**走得到**的點。只保證安全的話，河對岸的點會被
      //     一選再選，角色朝著到不了的地方撞、卡住、再換一個對岸的點，原地打轉。
      const retarget = (character, crowd, stalled) => ({
        ...character,
        ...(stalled
          ? chooseReachableTarget(character, crowd, area, random)
          : chooseSafeTarget(character, crowd, area, random)),
      });
      const speeds = realCruiseSpeeds(H);
      const extent = new Map();
      const arrivalsPer = new Map();
      const confinement = new Map();
      let worstConfined = { id: null, seconds: 0, at: 0 };
      let arrivals = 0;

      for (let frame = 0; frame < frames; frame++) {
        while (characters.length < 15) {
          const spawn = findSafeSpawn(size, characters, area, random);
          if (!spawn) break;
          characters.push(retarget({
            id: `c${characters.length}`, ...spawn, ...size,
            targetX: spawn.x, targetY: spawn.baseY,
            // 速度跟 Creature 一樣依畫布縮放，否則 4K 下量到的是「角色只有一半
            // 視覺速度」的假象，不是實作真正的行為。
            cruiseSpeed: speeds[characters.length % speeds.length], vx: 0, vy: 0,
          }, characters, false));
        }

        for (let i = 0; i < characters.length; i++) {
          const before = characters[i];
          const next = steerCharacter(before, characters, area, dt);
          characters[i] = { ...before, ...next };
          if (frame >= measureFrom) {
            const box = extent.get(before.id)
              || { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, path: 0 };
            box.x0 = Math.min(box.x0, next.x); box.x1 = Math.max(box.x1, next.x);
            box.y0 = Math.min(box.y0, next.baseY); box.y1 = Math.max(box.y1, next.baseY);
            box.path += Math.hypot(next.x - before.x, next.baseY - before.baseY);
            extent.set(before.id, box);
          }
          // 全程盯著「有沒有人被困在原地」。
          //
          // 只有**真的走出這個小框**才算脫困。先前這裡寫成「回報了 stalled 或
          // 走出框」都歸零——那是自我否定的：稀疏的 stalled（每兩秒一次）會把
          // 計時器一直重設，量到的最大值永遠停在 2 秒左右，而實際上角色連續
          // 困了 15~29 秒。回報 stalled 只是「說了自己走不動」，不是脫困；
          // 整合層換了目標卻還是出不去，那就是還困著。
          const watch = confinement.get(before.id)
            || { x: next.x, baseY: next.baseY, seconds: 0, confinedFrames: 0, frames: 0 };
          watch.frames++;
          const strayed = Math.hypot(next.x - watch.x, next.baseY - watch.baseY) > CONFINE_BOX;
          if (strayed) {
            watch.x = next.x; watch.baseY = next.baseY; watch.seconds = 0;
          } else {
            watch.seconds += dt;
            // 只有連續困住超過幾秒才算「卡住」——每個人都會有一兩秒的停頓。
            if (watch.seconds > 3) watch.confinedFrames++;
            if (watch.seconds > worstConfined.seconds) {
              worstConfined = { id: before.id, seconds: watch.seconds, at: frame / 60 };
            }
          }
          confinement.set(before.id, watch);

          const reached = Math.hypot(next.targetX - next.x, next.targetY - next.baseY) < 20;
          if (reached) {
            arrivals++;
            arrivalsPer.set(before.id, (arrivalsPer.get(before.id) || 0) + 1);
          }
          // 整合層（display.html）的行為：到了目標、或是回報走不動，就換新目標。
          if (reached || next.stalled) {
            characters[i] = retarget(characters[i], characters, next.stalled === true);
          }
        }
      }

      const label = `${W}x${H} seed=${initialSeed}`;
      assert.equal(characters.length, 15, `${label}：前提是 15 位都要進得了場`);

      // 最重要的一條：全程都不准有人被困住又不吭聲。
      // 這個判準直接對應故障本身，不受「視窗切在哪裡」影響。
      assert.ok(
        worstConfined.seconds <= MAX_CONFINED_SECONDS,
        `${label}：${worstConfined.id} 連續 ${worstConfined.seconds.toFixed(1)} 秒`
          + ` 困在 ${CONFINE_BOX}px 內（第 ${worstConfined.at.toFixed(0)} 秒）`,
      );

      // 單次卡多久是很吵的尾端統計（實測同一組設定換個尺寸就在 22~39 秒之間跳），
      // 所以另外看整場的佔比：偶爾塞車可以，整場有一半時間動不了就不行。
      const confinedFractions = characters.map((c) => {
        const watch = confinement.get(c.id);
        return watch && watch.frames > 0 ? watch.confinedFrames / watch.frames : 0;
      });
      const stuckMost = confinedFractions.filter((f) => f > MAX_CONFINED_FRACTION).length;
      assert.equal(
        stuckMost, 0,
        `${label}：有 ${stuckMost}/15 位整場超過一半的時間卡住`
          + `（各自佔比 ${confinedFractions.map((f) => (f * 100).toFixed(0) + '%').join(', ')}）`,
      );

      // 每一位在整段五分鐘裡都必須真的跑過一片地方，不是在原地抖。
      const boxes = characters.map((c) => extent.get(c.id));
      const spans = boxes.map((b) => (b ? Math.hypot(b.x1 - b.x0, b.y1 - b.y0) : 0));
      const footprint = personalSpace({ x: 0, baseY: 0, ...size }).radiusX;
      const idle = spans.filter((d) => d < footprint * MIN_EXTENT_RADII).length;
      assert.equal(
        idle, 0,
        `${label}：整段有 ${idle}/15 位困在原地`
          + `（各自走過的範圍 ${spans.map((d) => (d / footprint).toFixed(1)).join(', ')} 個足跡半徑`
          + `，門檻 ${MIN_EXTENT_RADII}）`,
      );

      // 走了很多路卻只在一小塊地方繞，就是踱步。這個比值直接分得開兩種情況：
      // 正常漫遊的角色路徑長跟範圍是同一個量級，踱步的角色路徑長是範圍的幾十倍。
      const ratios = boxes.map((b, i) => (b ? b.path / Math.max(spans[i], 1) : 0));
      const pacing = ratios.filter((r) => r > MAX_PACING_RATIO).length;
      assert.equal(
        pacing, 0,
        `${label}：有 ${pacing}/15 位在原地踱步`
          + `（路徑長÷範圍 ${ratios.map((r) => r.toFixed(1)).join(', ')}）`,
      );

      // 光是「有在動」還不夠——角色要真的抵達得了目標，才代表牠們是朝著目標移動。
      // 不要求 15 位全部抵達：河流只留下緣一條窄走廊，過河會塞車，某幾位在
      // 90 秒內排不到很正常（實測最差 12/15）。真正壞掉的版本會遠低於這個數。
      const arrived = characters.filter((c) => arrivalsPer.get(c.id)).length;
      assert.ok(
        arrived >= MIN_ARRIVED,
        `${label}：90 秒內只有 ${arrived}/15 位抵達過目標`,
      );
      assert.ok(
        arrivals >= MIN_TOTAL_ARRIVALS,
        `${label}：90 秒內全場只抵達目標 ${arrivals} 次，太少`,
      );
    }
  }
});

test('貼著邊界又去不了目標時要回報 stalled，不能用被 clamp 掉的位移假裝在走', () => {
  // 方向指向可行走區外時，clamp 會把位移幾乎全部吃掉。這種選項「安全」也「不等於
  // 原位」（差在浮點尾數），若照單全收，角色就會以每秒 2.5px 的速度永遠蹭下去，
  // 而且 stalled 一次都不回報——整合層永遠不知道要幫牠換目標。
  const area = getWalkableArea(1920, 1080);
  const size = { width: 160, height: 300 };
  const space = personalSpace({ x: 0, baseY: 0, ...size });
  let self = {
    id: 'edge', x: 900, baseY: area.top + space.radiusY, ...size,
    targetX: 880, targetY: area.top - 400, // 目標在可行走區外的正上方
    cruiseSpeed: 60, vx: 0, vy: 0,
  };
  assert.equal(isSafe(self, [], area), true, '前提：起點要是安全的');

  const dt = 1 / 60;
  const frames = 120; // 2 秒，剛好是一個觀察窗
  let travelled = 0;
  let reportedStall = false;
  for (let frame = 0; frame < frames; frame++) {
    const next = steerCharacter(self, [self], area, dt);
    travelled += Math.hypot(next.x - self.x, next.baseY - self.baseY);
    if (next.stalled) reportedStall = true;
    self = { ...self, ...next };
  }

  const freeTravel = 60 * (frames * dt);
  assert.ok(
    reportedStall || travelled > freeTravel * 0.1,
    `要嘛真的走得動、要嘛回報 stalled，不能兩者皆非`
      + `（2 秒只走了 ${travelled.toFixed(1)}px，自由行走應有 ${freeTravel}px，stalled 從未回報）`,
  );
});

test('完全動不了的角色要立刻回報 stalled，不必等觀察窗跑完', () => {
  // 四面被封死、但自己站的位置是安全的：這不是 blocked（找得到安全點，就是牠自己），
  // 而是「這一幀連一步都踏不出去」。這種情況要當下就回報，不能等兩秒的觀察窗——
  // 也不能拿「規劃到一條路」把訊號蓋掉，那條路牠根本踏不出第一步。
  const size = { width: 60, height: 120 };
  const space = personalSpace({ x: 0, baseY: 0, ...size });
  const cx = 500;
  const cy = 400;
  // 圍出一個剛好容得下足跡的小口袋
  // 空隙只比足跡大一點點：角色站著是安全的，但一幀的位移（cruiseSpeed 100
  // 在 1/60 秒下約 1.67px）一定會撞上，所有方向都走不了。
  const gapX = space.radiusX + 0.5;
  const gapY = space.radiusY + 0.5;
  const area = openArea({
    obstacles: [
      { x: 0, y: 0, width: cx - gapX, height: 800 },              // 左
      { x: cx + gapX, y: 0, width: 1000 - (cx + gapX), height: 800 }, // 右
      { x: cx - gapX, y: 0, width: 2 * gapX, height: cy - gapY },  // 上
      { x: cx - gapX, y: cy + gapY, width: 2 * gapX, height: 800 - (cy + gapY) }, // 下
    ],
  });
  const self = {
    id: 'boxed', x: cx, baseY: cy, ...size,
    targetX: 950, targetY: 400, cruiseSpeed: 100, vx: 0, vy: 0,
  };

  assert.equal(isSafe(self, [], area), true, '前提：角色自己站的位置是安全的');

  const result = steerCharacter(self, [self], area, 1 / 60);

  assert.equal(result.blocked, false, '找得到安全點（就是牠自己），所以不是 blocked');
  assert.equal(result.x, self.x, '前提：這一幀確實動不了');
  assert.equal(result.baseY, self.baseY, '前提：這一幀確實動不了');
  assert.equal(result.stalled, true, '動不了就要當下回報 stalled');
});

test('復位、dt=0、已在目標上時 stalled 都要清乾淨，不能殘留', () => {
  // stalled 的語意是「安全但去不了目標」。剛被復位搬到新位置的角色、
  // 以及已經站在目標上的角色，都不符合這個描述。殘留的 stalled=true 會讓
  // 整合層每一幀都重挑目標（一次最多 60 次 isSafe 探測），而且會照著一條
  // 從舊位置規劃出來的路走。
  const area = openArea();
  const stale = {
    id: 'stale', x: 500, baseY: 400, width: 40, height: 80,
    targetX: 800, targetY: 400, cruiseSpeed: 100, vx: 0, vy: 0,
    stalled: true, path: [{ x: 10, baseY: 10 }], pathGoalX: 1, pathGoalY: 2, planAttempts: 2,
  };

  // dt = 0
  const still = steerCharacter(stale, [stale], area, 0);
  assert.equal(still.stalled, false, 'dt=0 時不該回報 stalled');

  // 已經站在目標上
  const arrived = steerCharacter({ ...stale, targetX: stale.x, targetY: stale.baseY }, [stale], area, 0.1);
  assert.equal(arrived.stalled, false, '站在目標上不是「去不了」');

  // 復位：起點在障礙裡，一定會走復位那條路
  const trapped = {
    ...stale,
    x: 100, baseY: 100,
  };
  const blocking = openArea({ obstacles: [{ x: 0, y: 0, width: 300, height: 300 }] });
  assert.equal(isSafe(trapped, [], blocking), false, '前提：起點必須不安全，才會進入復位');
  const recovered = steerCharacter(trapped, [trapped], blocking, 0.1);
  assert.equal(recovered.stalled, false, '剛復位的角色不該帶著殘留的 stalled');
  assert.equal(recovered.path, null, '復位後舊的路要丟掉——那是從舊位置算的');
  assert.equal(recovered.planAttempts, 0, '復位後規劃次數要歸零');
});

test('接近邊界時要提前轉向，不是全速撞上去再卡在牆上', () => {
  // 規格：「接近邊界時提前轉向」。
  //
  // 原本永遠做不到：預測點先被 clamp 回可行走區才拿去檢查安全，而可行走區是
  // 凸的，區內兩點的連線永遠在區內——邊界因此永遠無法讓 threatened 成立，
  // 整組閃避扇形對邊界根本不會被評估。
  //
  // 場地要**沒有任何障礙**：用真實的可行走區會被右邊那棵橄欖樹先擋下來，
  // 角色因為避開樹而轉向，看起來像是通過了，其實根本沒碰到邊界這條路徑。
  // （這個測試的第一版就是這樣寫的，把邊界判斷整個關掉照樣全綠。）
  const area = openArea({ right: 1200, bottom: 800 });
  const size = { width: 60, height: 120 };
  const space = personalSpace({ x: 0, baseY: 0, ...size });
  const maxX = area.right - space.radiusX;
  let self = {
    id: 'runner', x: 200, baseY: 400, ...size,
    targetX: 5000, targetY: 400, // 目標遠在區外的正右方
    cruiseSpeed: 120, vx: 0, vy: 0,
  };

  const dt = 1 / 60;
  const frames = 1800;
  let stalls = 0;
  let verticalTravel = 0;
  for (let frame = 0; frame < frames; frame++) {
    const next = steerCharacter(self, [self], area, dt);
    if (next.stalled) stalls++;
    verticalTravel += Math.abs(next.baseY - self.baseY);
    self = { ...self, ...next };
  }

  // 撞牆卡死的版本：從不轉向、1318/1800 幀回報 stalled。
  // 會轉向的版本：9 次。中間空得很開。
  assert.ok(
    stalls < frames * 0.2,
    `貼著邊界空轉太久（${frames} 幀中 ${stalls} 幀回報 stalled，邊界在 x=${maxX.toFixed(0)}）`,
  );
  assert.ok(
    verticalTravel > space.radiusY,
    `碰到邊界時要沿著它轉開，實際垂直方向只移動了 ${verticalTravel.toFixed(1)}px`,
  );
});

test('規格的「優先減速」：純減速就解得開時不該無謂側移', () => {
  // 規格：「預測短時間內會與其他角色相交時，優先減速，其次改變方向」。
  // 這條之前完全沒有測試——把整個減速選項刪掉，51 個測試照樣全綠。
  const area = openArea();
  const self = character({ targetX: 800, targetY: 600 });
  // 正前方一位幾乎不動的鄰居：減速就能維持安全距離，不需要轉向。
  const neighbor = character({ id: 'neighbor', x: 390, targetX: 390, cruiseSpeed: 1 });

  const result = steerCharacter(self, [self, neighbor], area, 0.1);

  assert.equal(result.baseY, self.baseY, `應該純減速，不該側移（baseY 從 ${self.baseY} 變成 ${result.baseY}）`);
  assert.ok(result.vx > 0, '應該仍朝目標前進，只是慢下來');
  assert.ok(
    Math.abs(result.vx - self.cruiseSpeed * AVOID_SLOW_SCALE) < 1e-9,
    `速度應為 cruiseSpeed x ${AVOID_SLOW_SCALE}，實際 ${result.vx}`,
  );
  assert.ok(AVOID_SLOW_SCALE < 1, '減速的意思是要比原速慢');
});

// 兩瓣地圖：一道到頂到底、沒有缺口的隔牆把場地切成東西兩半，角色在西側。
// 東側的每一個點都「安全」，但一個都到不了——這正是規格禁止 chooseSafeTarget
// 的情境，也是唯一能分辨兩個函式的地形。
//
// 為什麼不用正式場地：正式場地已經是一個沒有內部通道問題的凸矩形，7198 個安全點
// 裡直線到不了的是 0 個，任何「安全的點」都同時是「走得到的點」，兩個函式在上面
// 表現完全一樣。舊版這條測試就是拿正式場地寫的，前提句寫著「直線到西岸必須被河
// 擋住」，但河早就拿掉了，那個探測點 (276.8, 700) 其實落在左邊那棵橄欖樹的樹幹裡
// ——不是「對岸」，是一個根本不合法的位置。於是把整個函式換成
// `return chooseSafeTarget(...)`（也就是規格明文禁止的那種行為）仍然 150/150 全綠。
function twoLobeArea(size) {
  const W = 1600;
  const H = 1000;
  const WALL_X = 800;
  const WALL_T = 90;
  return {
    W, H, WALL_X, WALL_T,
    area: {
      left: 0, right: W, top: 0, bottom: H,
      obstacles: [{ x: WALL_X, y: 0, width: WALL_T, height: H }],
    },
    isEast: (x) => x > WALL_X + WALL_T,
    self: {
      id: 'west', x: 300, baseY: 500, ...size,
      targetX: 300, targetY: 500, cruiseSpeed: 16, vx: 0, vy: 0,
    },
  };
}

test('chooseReachableTarget 回傳的目標一定走得到，而不是只保證安全', () => {
  const size = displaySize({ width: 220, height: 400 }, 1920, 1080, 1.05);
  const { area, isEast, self } = twoLobeArea(size);

  // 前提一：起點安全，而且東側確實是「安全但到不了」，不是「不合法」。
  assert.equal(isSafe(self, [], area), true, '前提：起點要安全');
  assert.equal(
    isSafe({ ...self, x: 1200, baseY: 500 }, [], area), true,
    '前提：東側的點本身必須是安全的，否則分辨不出「安全」與「走得到」',
  );
  assert.equal(
    pathReaches(self, area, { targetX: 1200, targetY: 500 }), false,
    '前提：直線過不去',
  );
  // planPath 回傳非 null 不代表「到得了目標」——它回的是**最接近目標的可達節點**。
  // 所以可達性要看終點落在哪一側，不能只看 plan !== null（舊版就是這樣寫的）。
  const probe = planPath(self, [], area, 1200, 500);
  assert.ok(
    probe === null || !isEast(probe[probe.length - 1].x),
    '前提：繞路也過不去，路徑終點不該出現在東側',
  );

  const makeRandom = (initial) => {
    let seed = initial;
    return () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  };

  const DRAWS = 400;
  let safeSidePicks = 0;
  let reachableSidePicks = 0;
  const safeRandom = makeRandom(20260901);
  const reachableRandom = makeRandom(20260901);
  for (let i = 0; i < DRAWS; i++) {
    if (isEast(chooseSafeTarget(self, [self], area, safeRandom).targetX)) safeSidePicks++;

    const target = chooseReachableTarget(self, [self], area, reachableRandom);
    assert.equal(
      isSafe({ ...self, x: target.targetX, baseY: target.targetY }, [], area), true,
      `目標本身要安全（${target.targetX.toFixed(0)}, ${target.targetY.toFixed(0)}）`,
    );
    if (isEast(target.targetX)) reachableSidePicks++;
  }

  // 前提二：夾具真的有鑑別力。chooseSafeTarget 要**經常**挑到過不去的東側，
  // 否則這條測試只是在驗一個不會發生的情境——舊版就是死在這一點上。
  assert.ok(
    safeSidePicks >= DRAWS * 0.1,
    `前提：chooseSafeTarget 要經常挑到到不了的東側（實際 ${safeSidePicks}/${DRAWS}）`,
  );
  // 真正的要求。
  assert.equal(
    reachableSidePicks, 0,
    `chooseReachableTarget 挑了 ${reachableSidePicks}/${DRAWS} 個到不了的目標`,
  );
});

test('沒有「夠遠」的可達點時，退而求其次取最遠的**可達**點', () => {
  // 角色被關在一個小口袋裡：口袋內每個點都比 radiusX*2 近，所以「夠遠」的候選是空的。
  // 三種做法都量過，這是唯一對的：
  //   - 退回 chooseSafeTarget：回傳只保證安全、不保證到得了的點（規格禁止）。
  //     實測被圍住的角色連續 40 次拿到的目標，planPath 一條路都規劃不出來。
  //   - 保留原目標：角色不再重新挑方向，抱著到不了的目標不放，
  //     實測 1024x768 下有角色 93% 的時間卡住、單次最長 228 秒。
  //   - 取最遠的可達點：仍然走得到，只是近一點。
  const size = { width: 60, height: 120 };
  const space = personalSpace({ x: 0, baseY: 0, ...size });
  const cx = 500;
  const cy = 400;
  // 口袋比角色大一些，但整個都在 radiusX*2 的範圍內
  const halfW = space.radiusX * 1.6;
  const halfH = space.radiusY * 1.6;
  const area = openArea({
    obstacles: [
      { x: 0, y: 0, width: cx - halfW, height: 800 },
      { x: cx + halfW, y: 0, width: 1000 - (cx + halfW), height: 800 },
      { x: cx - halfW, y: 0, width: 2 * halfW, height: cy - halfH },
      { x: cx - halfW, y: cy + halfH, width: 2 * halfW, height: 800 - (cy + halfH) },
    ],
  });
  const self = {
    id: 'pocket', x: cx, baseY: cy, ...size,
    targetX: 950, targetY: 400, cruiseSpeed: 16, vx: 0, vy: 0,
  };
  assert.equal(isSafe(self, [], area), true, '前提：角色自己的位置是安全的');

  const target = chooseReachableTarget(self, [self], area, () => 0.5);

  assert.ok(Number.isFinite(target.targetX) && Number.isFinite(target.targetY));
  // 關鍵：回傳的點必須真的走得到，不能是口袋外面那個「安全但到不了」的原目標。
  assert.equal(
    isSafe({ ...self, x: target.targetX, baseY: target.targetY }, [], area), true,
    '回傳的點要安全',
  );
  assert.ok(
    pathReaches(self, area, target),
    `回傳的點要走得到（${target.targetX.toFixed(0)}, ${target.targetY.toFixed(0)}）`,
  );
  assert.notEqual(target.targetX, 950, '不得回傳口袋外那個到不了的原目標');
});

test('繞得過中間有缺口的長牆——只靠貪婪避讓永遠找不到那個缺口', () => {
  // 用**合成**的場地，不是正式的可行走區。
  //
  // 正式場地拿掉那兩塊不該存在的河流障礙之後，剩下的兩棵樹幹是從草地帶上緣
  // 貫穿到下緣的，角色根本不會需要繞過它們——換句話說，正式場地已經退化成
  // 一個沒有內部障礙的矩形。但繞路規劃這個能力還是要有測試守著：背景圖會換，
  // 障礙也會跟著改。所以這裡自己造一道有缺口的長牆。
  const area = openArea({
    right: 1400, bottom: 900,
    obstacles: [
      // 一道幾乎貫穿的牆，缺口開在最下面
      { x: 640, y: 0, width: 120, height: 700 },
    ],
  });
  const size = { width: 90, height: 180 };
  const space = personalSpace({ x: 0, baseY: 0, ...size });
  let self = {
    id: 'detour', x: 300, baseY: 300, ...size,
    targetX: 1100, targetY: 300, cruiseSpeed: 16, vx: 0, vy: 0,
  };
  assert.equal(isSafe(self, [], area), true, '前提：起點安全');
  assert.equal(
    isSafe({ ...self, x: self.targetX, baseY: self.targetY }, [], area), true,
    '前提：目標安全',
  );
  // 前提：直線過不去，一定得往下繞到缺口
  assert.equal(pathReaches(self, area, { targetX: self.targetX, targetY: self.targetY }), false,
    '前提：直線必須被牆擋住');

  const dt = 1 / 60;
  let arrivedAt = -1;
  let lowest = self.baseY;
  for (let frame = 0; frame < 60 * 240; frame++) {
    self = { ...self, ...steerCharacter(self, [self], area, dt) };
    lowest = Math.max(lowest, self.baseY);
    assert.equal(isSafe(self, [], area), true, `第 ${frame} 幀走到不合法的位置`);
    if (Math.hypot(self.targetX - self.x, self.targetY - self.baseY) < 20) {
      arrivedAt = frame / 60;
      break;
    }
  }

  assert.ok(arrivedAt >= 0,
    `240 秒內沒有繞過去（最後停在 ${self.x.toFixed(0)}, ${self.baseY.toFixed(0)}）`);
  // 缺口在牆的下方，所以路上一定得下到那個高度
  assert.ok(lowest > 700 - space.radiusY,
    `路上必須下到缺口的高度（缺口上緣 700，實際最低只到 ${lowest.toFixed(0)}）`);
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

test('多障礙夾出的狹道也走得出去，不得誤報 blocked', () => {
  // 這組幾何是外部審查用隨機搜尋 minimize 出來的窄道案例。
  //
  // 註記：它**不是** `visited.add` 記帳順序的回歸測試。那個順序在目前的
  // 8-connectivity 下量測不到行為差異（見 src/movement.js 裡的說明），
  // 沒有任何測試守得住它——之前這個測試的名稱宣稱守得住，是錯的。
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
  //
  // 舊寫法斷言 `result.x > 400`，但這一格場地裡任何安全點的 x 最小就是
  // 400 + radiusX = 426.8，所以只要結果是安全的就必然成立——等於沒有斷言。
  // 改成跟窮舉出來的**真正最近安全點**比對距離，這才是規格說的「取最近的」。
  const space = personalSpace(self);
  let nearest = null;
  for (let x = 0; x <= 1000; x += 2) {
    for (let baseY = 0; baseY <= 800; baseY += 2) {
      if (!isSafe({ ...self, x, baseY }, [], area)) continue;
      const distance = Math.hypot(x - self.x, baseY - self.baseY);
      if (!nearest || distance < nearest.distance) nearest = { x, baseY, distance };
    }
  }
  assert.ok(nearest, '前提：這個場地要真的存在安全點');

  const achieved = Math.hypot(result.x - self.x, result.baseY - self.baseY);
  // 有限解析度的網格取不到連續空間的最佳解，容差抓一個格步長。
  const tolerance = Math.max(space.radiusX, space.radiusY) * 2;
  assert.ok(
    achieved <= nearest.distance + tolerance,
    `復位應取最近的安全點：窮舉最近 ${nearest.distance.toFixed(1)}px`
      + `（${nearest.x}, ${nearest.baseY}），實際跑了 ${achieved.toFixed(1)}px`,
  );
  assert.ok(result.baseY > 93 && result.baseY < 250, `應該落在縫的高度，實際 baseY=${result.baseY}`);
});

test('已經安全但被 clamp 過的角色要留在原地，不得被推開一格', () => {
  // 規格：復位取的是**最近**的安全點。角色已經安全時，最近的安全點就是牠自己。
  // 少了「anchor 本身安全就直接回傳」這一步，角色會被推到網格上的鄰近節點——
  // 位置合法，但每次觸發都平白位移一格。
  const area = openArea();
  const self = character({ x: 500, baseY: 400, targetX: 500, targetY: 400 });
  assert.equal(isSafe(self, [], area), true, '前提：起點要是安全的');

  const result = steerCharacter(self, [self], area, 0.1);

  assert.equal(result.x, self.x);
  assert.equal(result.baseY, self.baseY);
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

test('沿線取樣的間距必須小於足跡短軸直徑，否則足跡會從兩點之間漏過去', () => {
  // 這條是取樣密度的規格底線：相鄰兩個取樣點之間的距離若大於等於足跡的短軸
  // 直徑，就存在一整片「兩點都沒踩到、但足跡實際會壓上去」的區域，薄牆就穿得過去。
  // 下方的橫向薄牆測試示範了它的行為後果；這裡把常數本身釘住，讓任何把間距
  // 放粗的改動（不論倍率）都在單元層就被擋下來，不必等剛好挑中會穿隧的場地尺寸。
  for (const width of [4, 20, 40, 120, 400]) {
    const space = personalSpace(character({ width, height: width * 2 }));
    const shortDiameter = 2 * Math.min(space.radiusX, space.radiusY);
    const step = segmentSampleStep(space);
    assert.ok(step > 0, `width=${width}：取樣間距必須為正`);
    assert.ok(
      step < shortDiameter,
      `width=${width}：取樣間距 ${step.toFixed(2)} 必須小於短軸直徑 ${shortDiameter.toFixed(2)}`,
    );
  }
});

test('垂直方向的薄牆同樣擋得住——短軸就是 Y 軸，取樣密度要跟得上', () => {
  // 既有的薄牆測試是左右向的，檢查的是 stepX。但地面足跡是壓扁的橢圓，**短軸是 Y**，
  // 上下方向才是最容易漏掉的那一軸：格點間距與足跡高度的比值在這裡最大。
  const W = 4000;
  const H = 3000;
  const startY = 300;
  const self = character({
    x: W / 2, baseY: startY, width: 20, height: 80,
    targetX: W / 2, targetY: H - 200,
  });
  const probeArea = openArea({ right: W, bottom: H });
  const anchor = { x: W / 2, baseY: startY };
  const { stepY } = recoveryGrid(self, probeArea, anchor);
  const space = personalSpace(self);

  // 牆加上兩側的足跡短半徑要整段塞進相鄰兩個格點之間，
  // 「只檢查格點端點」的版本才會一步跨過去，逐段取樣的版本才擋得住。
  const wallThickness = Math.min(20, (stepY - 2 * space.radiusY) * 0.6);
  assert.ok(wallThickness >= 1, '前提：垂直步長要夠粗，禁區才塞得進一格之內');
  const midpointY = startY + stepY * 10.5;
  const wallY = midpointY - wallThickness / 2;

  const sealed = openArea({
    right: W,
    bottom: H,
    obstacles: [
      // 牆上方整片封死：不能存在「還沒到牆就找到安全點」的捷徑，
      // 否則穿隧與不穿隧的版本都會停在牆前面，斷言就恆真了。
      { x: 0, y: 0, width: W, height: wallY },
      { x: 0, y: wallY, width: W, height: wallThickness },
    ],
  });

  assert.equal(isSafe(self, [], sealed), false, '前提：起點必須不安全，才會真的進入復位');

  let safeBeyond = 0;
  for (let x = 100; x <= W - 100; x += 40) {
    for (let baseY = wallY + 200; baseY <= H - 100; baseY += 40) {
      if (isSafe({ ...self, x, baseY }, [], sealed)) safeBeyond++;
    }
  }
  assert.ok(safeBeyond > 500, `牆下方確實有大片安全區（實際 ${safeBeyond} 點）`);

  const result = steerCharacter(self, [self], sealed, 0.1);

  assert.ok(
    result.baseY < wallY,
    `不得跳過橫向薄牆（牆在 y=${wallY.toFixed(1)}、厚 ${wallThickness.toFixed(1)}，`
      + `實際落在 y=${result.baseY.toFixed(1)}）`,
  );
});

test('正常前進也不能穿隧：一幀跨得過的薄牆，路徑檢查要沿線攔下來', () => {
  // 兩個薄牆測試守的都是**復位搜尋**的路徑檢查。前進路徑走的是另一條程式碼
  // （pathIsSafe），同樣是逐段取樣，同樣會穿隧：只要一幀的位移大於「牆 + 兩側足跡」，
  // 只檢查終點的版本就會直接出現在牆的另一側。這裡用高速角色把那一幀撐大。
  const wallX = 600;
  const wallThickness = 10;
  const area = openArea({
    right: 2000,
    obstacles: [{ x: wallX, y: 0, width: wallThickness, height: 800 }],
  });
  const self = character({
    x: 500, baseY: 400, width: 20, height: 80,
    targetX: 1900, targetY: 400, cruiseSpeed: 1500,
  });
  const space = personalSpace(self);

  // 前提一：起點是安全的，所以走的是正常前進、不是復位。
  assert.equal(isSafe(self, [], area), true);
  // 前提二：一幀的位移真的大於「牆 + 兩側足跡」，終點會落在牆的另一側且安全。
  const dt = 0.1;
  const stride = self.cruiseSpeed * dt;
  assert.ok(
    stride > wallThickness + 2 * space.radiusX,
    `一幀位移 ${stride} 必須跨得過整段禁區`,
  );
  assert.equal(isSafe({ ...self, x: self.x + stride }, [], area), true, '終點本身是安全的');

  const result = steerCharacter(self, [self], area, dt);

  assert.ok(
    result.x + space.radiusX <= wallX,
    `不得穿過薄牆（牆在 x=${wallX}，實際落在 x=${result.x.toFixed(1)}）`,
  );
});

test('復位鄰居是 8-connected，四個斜向都在', () => {
  // 規格明文要求 8-neighbor。改成 4-neighbor 時，多數場地仍然找得到路（只是繞遠），
  // 只有「唯一出口是斜向開口」的少數場地才會誤報 blocked——測過的隨機場地裡
  // 2576 個只有 2 個會露餡。這種機率不適合靠隨機測試守，直接把常數釘住。
  const expected = [];
  for (const dx of [-1, 0, 1]) {
    for (const dy of [-1, 0, 1]) {
      if (dx !== 0 || dy !== 0) expected.push(`${dx},${dy}`);
    }
  }
  const actual = NEIGHBOR_OFFSETS.map(([dx, dy]) => `${dx},${dy}`);

  assert.equal(actual.length, 8, '必須恰好 8 個方向，不重不漏');
  assert.deepEqual([...actual].sort(), expected.sort());
});

test('15 位角色真的進得了場——多個 seed 與解析度都要成立，不能靠挑 seed', () => {
  // 這一條守的是「入口機制」而不是「容量」。容量早就夠（密鋪可放 30 位以上），
  // 但只要有障礙壓在出生線上（例如前景樹幹貼著畫面左右緣），那一整條邊的入口
  // 就會 100% 失效，場上永遠湊不滿 15 位，舊角色被淘汰後也補不回來。
  //
  // 單一 seed 的測試在這裡沒有意義：實測換 seed 有一半會紅。所以多 seed 多解析度。
  function fillScene(width, height, seed) {
    const area = getWalkableArea(width, height);
    const size = displaySize({ width: 220, height: 400 }, width, height, 1.05);
    let state = seed;
    const random = () => { state = (state * 1103515245 + 12345) % 2147483648; return state / 2147483648; };
    const characters = [];
    let placed = 0;

    for (let frame = 0; frame < 1200; frame++) { // 20 秒
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
      for (let i = 0; i < characters.length; i++) {
        characters[i] = steerCharacter(characters[i], characters, area, 1 / 60);
        const c = characters[i];
        if (Math.hypot(c.targetX - c.x, c.targetY - c.baseY) < 20) {
          const target = chooseSafeTarget(c, characters, area, random);
          characters[i] = { ...c, targetX: target.targetX, targetY: target.targetY };
        }
      }
    }
    return characters;
  }

  for (const [width, height] of [[1920, 1080], [1280, 720]]) {
    for (const seed of [1, 2, 3, 424242, 99999]) {
      const characters = fillScene(width, height, seed);
      assert.equal(
        characters.length, 15,
        `${width}x${height} seed=${seed}：場上只有 ${characters.length} 位，規格要求 15 位`,
      );
      const area = getWalkableArea(width, height);
      for (const c of characters) {
        const others = characters.filter((o) => o !== c);
        assert.equal(isSafe(c, others, area), true, `${width}x${height} seed=${seed}：有角色在不合法位置`);
      }
    }
  }
});

test('入口擠不下時作品要等得到位子：角色走開後入口才空出來', () => {
  // 規格的驗收條目是「邊緣入口一開始擠不下，但角色漫遊後入口會空出來，
  // 等待中的作品陸續進場」。
  //
  // 舊版測試證不到這件事：實測它的場景在 frame 0 就進了 14 位、frame 1 就滿 15 位，
  // 入口從來沒擠過，`fullAtFrame < 900` 這個斷言不可能失敗（全掃 60 組最慢也只有
  // frame 25）。這裡改成先用一排靜止的「路障角色」把入口帶塞住，讓前幾位真的
  // 進不來，再確認牠們最終等到位子。
  const area = getWalkableArea(1920, 1080);
  let seed = 20260831;
  const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const size = displaySize({ width: 220, height: 400 }, 1920, 1080, 1.05);
  const space = personalSpace({ x: 0, baseY: 0, ...size });

  // 用 findSafeSpawn 自己把入口塞到滿：一直放，放到它回傳 null 為止。
  // 這樣「入口飽和」是由實作自己定義的，不必人工猜哪裡算入口帶。
  const characters = [];
  while (true) {
    const spawn = findSafeSpawn(size, characters, area, random);
    if (!spawn) break;
    characters.push({
      id: `blocker${characters.length}`, ...spawn, ...size,
      targetX: spawn.x, targetY: spawn.baseY,
      cruiseSpeed: 30 + random() * 20, vx: 0, vy: 0,
    });
  }

  // 前提：真的塞滿了，而且塞進去的數量是合理的（不是一個都放不進去）。
  assert.ok(characters.length >= 5, `前提：入口至少要放得下幾位（實際 ${characters.length}）`);
  assert.equal(
    findSafeSpawn(size, characters, area, random), null,
    '前提：入口要真的被塞住，才測得到「等位子」',
  );

  // 把佔住入口的角色叫到場地中央——入口帶就該空出來，等待中的作品才進得來。
  const centerX = (area.left + area.right) / 2;
  const centerY = (area.top + area.bottom) / 2;
  for (const character of characters) {
    character.targetX = centerX;
    character.targetY = centerY;
  }

  let admitted = 0;
  let firstAdmissionFrame = null;
  for (let frame = 0; frame < 1800; frame++) {
    while (admitted < 5) {
      const spawn = findSafeSpawn(size, characters, area, random);
      if (!spawn) break;
      if (firstAdmissionFrame === null) firstAdmissionFrame = frame;
      characters.push({
        id: `late${admitted}`, ...spawn, ...size,
        targetX: spawn.x, targetY: spawn.baseY,
        cruiseSpeed: 40 + random() * 30, vx: 0, vy: 0,
      });
      admitted++;
    }
    for (let i = 0; i < characters.length; i++) {
      const next = steerCharacter(characters[i], characters, area, 1 / 60);
      characters[i] = { ...characters[i], ...next };
      if (next.stalled) {
        characters[i] = { ...characters[i], ...chooseSafeTarget(characters[i], characters, area, random) };
      }
    }
  }

  assert.ok(firstAdmissionFrame !== null && firstAdmissionFrame > 0,
    '前提：第一位必須是「等了一段時間」才進得來，不能第 0 幀就進場');
  assert.equal(admitted, 5, `等待中的作品只進了 ${admitted}/5 位，入口沒有空出來`);
  for (const character of characters) {
    const others = characters.filter((c) => c !== character);
    assert.equal(isSafe(character, others, area), true, `${character.id} 跑到不合法的位置`);
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
    assert.ok(grid.nodeCount <= RECOVERY_MAX_NODES, `width=${width}：節點數 ${grid.nodeCount} 超出預算`);

    // 解析度必須比足跡細，否則整個足跡塞得進兩個格點之間，只有角色寬度的
    // 縫隙就會被當成走不過去（實測把步長放粗 4 倍，一組 61 個連續空間裡確實
    // 走得過的縫隙，誤報 blocked 從 32 個增加到 50 個）。
    assert.ok(
      grid.stepX < 2 * space.radiusX && grid.stepY < 2 * space.radiusY,
      `width=${width}：步長 ${grid.stepX.toFixed(1)}/${grid.stepY.toFixed(1)}`
        + ` 必須細於足跡直徑 ${(2 * space.radiusX).toFixed(1)}/${(2 * space.radiusY).toFixed(1)}`,
    );
  }

  // 大畫面配極小角色：純看角色半徑會讓節點數爆炸，必須自動放粗步長
  const tiny = character({ width: 6, height: 10 });
  const hugeArea = openArea({ right: 4000, bottom: 3000 });
  const tinyGrid = recoveryGrid(tiny, hugeArea, { x: 2000, baseY: 1500 });
  assert.ok(tinyGrid.nodeCount <= RECOVERY_MAX_NODES, `節點數 ${tinyGrid.nodeCount} 超出預算`);
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
