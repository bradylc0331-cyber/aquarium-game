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

test('personalSpace 以裁切後可見角色與最小間距計算，且不改動角色', () => {
  const small = { x: 120, baseY: 300, width: 100, height: 200 };
  const large = { x: 400, baseY: 700, width: 200, height: 300 };
  const before = structuredClone(small);

  assert.deepEqual(personalSpace(small), {
    centerX: 120,
    centerY: 204,
    radiusX: 60,
    radiusY: 106,
  });
  assert.deepEqual(personalSpace(large), {
    centerX: 400,
    centerY: 556,
    radiusX: 114,
    radiusY: 158,
  });
  assert.deepEqual(small, before);
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

  assert.deepEqual(spawn, { x: 20, baseY: 50 });
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
  const atEdge = character({ x: 970, targetX: 1200 });
  const edgeResult = steerCharacter(atEdge, [atEdge], openArea(), 1);
  assert.equal(edgeResult.x, 970);
  assert.equal(edgeResult.vx, 0);

  const blocked = character({ x: 300, targetX: 800 });
  const area = openArea({ obstacles: [{ x: 331, y: 0, width: 669, height: 800 }] });
  const blockedResult = steerCharacter(blocked, [blocked], area, 1);
  assert.equal(isSafe(blockedResult, [], area), true);
  assert.ok(blockedResult.x === blocked.x || blockedResult.baseY !== blocked.baseY);
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
