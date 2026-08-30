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
