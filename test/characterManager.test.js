const { test } = require('node:test');
const assert = require('node:assert/strict');
const { CharacterManager } = require('../src/characterManager.js');

function makeCharacter(work) {
  return {
    artworkId: work.artworkId,
    speciesId: work.speciesId,
    state: 'active',
    setTransition(state) {
      this.state = state;
    },
  };
}

function makeWork(number, speciesId = 'noah') {
  return { artworkId: `art-${number}`, speciesId };
}

test('constructor 套用預設上限與退場時間，並要求 createCharacter 為函式', () => {
  const manager = new CharacterManager({ createCharacter: makeCharacter });
  assert.equal(manager.maxCharacters, 15);
  assert.equal(manager.exitSeconds, 0.4);

  for (const createCharacter of [undefined, null, 'factory', {}]) {
    assert.throws(
      () => new CharacterManager({ createCharacter }),
      { name: 'TypeError', message: 'createCharacter must be a function' },
    );
  }
});

test('constructor 拒絕非有限正整數的 maxCharacters', () => {
  for (const maxCharacters of [0, -1, 1.5, NaN, Infinity, -Infinity]) {
    assert.throws(
      () => new CharacterManager({ maxCharacters, createCharacter: makeCharacter }),
      { name: 'RangeError', message: 'maxCharacters must be a finite positive integer' },
    );
  }
});

test('constructor 拒絕負數或非有限的 exitSeconds', () => {
  for (const exitSeconds of [-0.1, NaN, Infinity, -Infinity]) {
    assert.throws(
      () => new CharacterManager({ exitSeconds, createCharacter: makeCharacter }),
      { name: 'RangeError', message: 'exitSeconds must be finite and non-negative' },
    );
  }
});

test('exitSeconds 為 0 時 update(0) 立即完成所有已排隊退場', () => {
  const manager = new CharacterManager({
    maxCharacters: 1,
    exitSeconds: 0,
    createCharacter: makeCharacter,
  });
  for (let number = 1; number <= 3; number++) manager.enqueue(makeWork(number));

  manager.update(0);

  assert.deepEqual(manager.renderable.map((character) => character.artworkId), ['art-3']);
  assert.equal(manager.pendingCount, 0);
});

test('極小但大於 0 的 exitSeconds 不會被 update(0) 當成立即退場', () => {
  const manager = new CharacterManager({
    maxCharacters: 1,
    exitSeconds: Number.EPSILON,
    createCharacter: makeCharacter,
  });
  manager.enqueue(makeWork(1));
  manager.enqueue(makeWork(2));

  manager.update(0);
  assert.deepEqual(manager.renderable.map((character) => character.artworkId), ['art-1']);
  assert.equal(manager.pendingCount, 1);

  manager.update(Number.EPSILON);
  assert.deepEqual(manager.renderable.map((character) => character.artworkId), ['art-2']);
  assert.equal(manager.pendingCount, 0);
});

test('前 15 件作品依 FIFO 順序全部進場，且不超過上限', () => {
  const manager = new CharacterManager({ createCharacter: makeCharacter });

  for (let number = 1; number <= 15; number++) {
    assert.equal(manager.enqueue(makeWork(number)), 'accepted');
  }

  assert.deepEqual(manager.renderable.map((character) => character.artworkId),
    Array.from({ length: 15 }, (_, index) => `art-${index + 1}`));
  assert.equal(manager.renderable.length, 15);
  assert.equal(manager.pendingCount, 0);
});

test('第 16、17 件作品等待最舊角色依序退場後，以 FIFO 順序補入', () => {
  const manager = new CharacterManager({ createCharacter: makeCharacter });
  for (let number = 1; number <= 16; number++) manager.enqueue(makeWork(number));

  assert.equal(manager.renderable.length, 15);
  assert.equal(manager.renderable[0].state, 'exiting');
  assert.ok(manager.renderable.slice(1).every((character) => character.state === 'active'));
  assert.equal(manager.pendingCount, 1);

  manager.enqueue(makeWork(17));
  manager.update(0.4);
  assert.deepEqual(manager.renderable.map((character) => character.artworkId),
    Array.from({ length: 15 }, (_, index) => `art-${index + 2}`));
  assert.equal(manager.pendingCount, 1);

  manager.update(0.4);
  assert.deepEqual(manager.renderable.map((character) => character.artworkId),
    Array.from({ length: 15 }, (_, index) => `art-${index + 3}`));
  assert.equal(manager.renderable.length, 15);
  assert.equal(manager.pendingCount, 0);
});

test('單次 update 的剩餘時間會繼續驅動下一個排隊退場', () => {
  const manager = new CharacterManager({
    maxCharacters: 2,
    createCharacter: makeCharacter,
  });
  for (let number = 1; number <= 4; number++) manager.enqueue(makeWork(number));

  manager.update(0.8);

  assert.deepEqual(manager.renderable.map((character) => character.artworkId), ['art-3', 'art-4']);
  assert.equal(manager.pendingCount, 0);
});

test('八次 0.05 秒更新會精確完成一次 0.4 秒退場', () => {
  const manager = new CharacterManager({ maxCharacters: 1, createCharacter: makeCharacter });
  manager.enqueue(makeWork(1));
  manager.enqueue(makeWork(2));

  for (let count = 0; count < 7; count++) manager.update(0.05);
  assert.deepEqual(manager.renderable.map((character) => character.artworkId), ['art-1']);

  manager.update(0.05);
  assert.deepEqual(manager.renderable.map((character) => character.artworkId), ['art-2']);
  assert.equal(manager.pendingCount, 0);
});

test('單次 1.2 秒更新會精確完成三次 0.4 秒排隊退場', () => {
  const manager = new CharacterManager({ maxCharacters: 1, createCharacter: makeCharacter });
  for (let number = 1; number <= 4; number++) manager.enqueue(makeWork(number));

  manager.update(1.2);

  assert.deepEqual(manager.renderable.map((character) => character.artworkId), ['art-4']);
  assert.equal(manager.pendingCount, 0);
});

test('相同物種的不同作品 ID 可獨立進場，缺少或重複作品 ID 永久拒絕', () => {
  const manager = new CharacterManager({ maxCharacters: 2, createCharacter: makeCharacter });
  const firstMoses = makeWork('moses-a', 'moses');
  const secondMoses = makeWork('moses-b', 'moses');

  assert.equal(manager.enqueue(firstMoses), 'accepted');
  assert.equal(manager.enqueue(secondMoses), 'accepted');
  assert.equal(manager.enqueue(firstMoses), 'duplicate');
  assert.equal(manager.enqueue({ speciesId: 'moses' }), 'duplicate');
  assert.equal(manager.enqueue(makeWork('moses-c', 'moses')), 'accepted');
  manager.update(0.4);
  assert.equal(manager.enqueue({ ...firstMoses }), 'duplicate');
  assert.deepEqual(manager.renderable.map((character) => character.artworkId),
    ['art-moses-b', 'art-moses-c']);
  assert.equal(manager.seenIds.size, 3);
});

test('滿載退場後 factory 暫無安全出生點時保留 pending，之後 update 會重試', () => {
  let spawnAvailable = true;
  let factoryCalls = 0;
  const manager = new CharacterManager({
    maxCharacters: 2,
    createCharacter(work) {
      factoryCalls++;
      return spawnAvailable ? makeCharacter(work) : null;
    },
  });

  assert.equal(manager.enqueue(makeWork(1)), 'accepted');
  assert.equal(manager.enqueue(makeWork(2)), 'accepted');
  assert.equal(manager.enqueue(makeWork(3)), 'accepted');
  assert.equal(factoryCalls, 2);
  assert.equal(manager.pendingCount, 1);
  assert.equal(manager.renderable[0].state, 'exiting');

  spawnAvailable = false;
  manager.update(0.4);
  assert.equal(factoryCalls, 3);
  assert.equal(manager.pendingCount, 1);
  assert.deepEqual(manager.renderable.map((character) => character.artworkId), ['art-2']);
  assert.ok(manager.renderable.every((character) => character !== null));

  spawnAvailable = true;
  manager.update(0.1);

  assert.equal(factoryCalls, 4);
  assert.equal(manager.pendingCount, 0);
  assert.deepEqual(manager.renderable.map((character) => character.artworkId), ['art-2', 'art-3']);
  assert.ok(manager.renderable.every((character) => character !== null));
});
