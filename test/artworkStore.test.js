const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  createArtworkStore, createNullStore, selectRestorable, idsToPrune, DEFAULT_KEEP,
} = require('../src/artworkStore.js');

function record(id, ts) {
  return {
    type: 'creature-scanned',
    artworkId: id,
    speciesId: 'noah',
    textureDataURL: 'data:image/png;base64,AAAA',
    ts,
  };
}

test('還原順序由舊到新——順序錯了 FIFO 就會擠掉錯的人', () => {
  // CharacterManager 是 FIFO：先進場的先被擠掉。還原時如果由新到舊送進去，
  // 接下來新掃描的作品會擠掉**最新**的那幾張，而不是最舊的那幾張，
  // 剛畫完的孩子會眼睜睜看著自己的作品先消失。
  const shuffled = [record('c', 300), record('a', 100), record('d', 400), record('b', 200)];

  const restored = selectRestorable(shuffled, 10);

  assert.deepEqual(restored.map((r) => r.artworkId), ['a', 'b', 'c', 'd']);
});

test('只還原最新的 N 張，且留下的是最新的那幾張', () => {
  const records = [];
  for (let i = 0; i < 40; i++) records.push(record(`w${i}`, i));

  const restored = selectRestorable(records, 15);

  assert.equal(restored.length, 15);
  assert.equal(restored[0].artworkId, 'w25', '要留最新的 15 張');
  assert.equal(restored[14].artworkId, 'w39');
});

test('idsToPrune 挑出的是「不會被還原的那些」，且與 selectRestorable 不重疊', () => {
  const records = [];
  for (let i = 0; i < 25; i++) records.push(record(`w${i}`, i));

  const kept = new Set(selectRestorable(records, 15).map((r) => r.artworkId));
  const stale = idsToPrune(records, 15);

  assert.equal(stale.length, 10);
  for (const id of stale) assert.ok(!kept.has(id), `${id} 同時被列為保留與刪除`);
  assert.equal(kept.size + stale.length, records.length, '每一張不是留就是刪，不能有漏網的');
});

test('壞掉或缺 ts 的紀錄要被濾掉，不能讓它們排到最前面', () => {
  // ts 不是有限數字時，排序會把它們甩到不確定的位置，還原順序就亂了。
  const records = [record('good', 100), { artworkId: 'bad' }, null, record('ok', 200)];

  const restored = selectRestorable(records, 10);

  assert.deepEqual(restored.map((r) => r.artworkId), ['good', 'ok']);
});

test('沒有 IndexedDB 時退回空實作，不能讓掃描或投影壞掉', async () => {
  // 私密視窗、被政策擋掉、或非瀏覽器環境。存不了就是存不了，
  // 但活動要照常進行，只是少了重新整理後還原的能力。
  const store = createArtworkStore({ indexedDB: null });

  assert.equal(store.available, false);
  assert.equal(await store.save(record('x', 1)), false);
  assert.deepEqual(await store.loadAll(), []);
  assert.equal(await store.prune(), 0);
  assert.equal(await store.clear(), false);
});

test('createNullStore 的介面跟真的 store 一模一樣', () => {
  // 介面對不上的話，沒有 IndexedDB 的環境會在呼叫時才炸——而那是活動當下。
  const real = createArtworkStore({ indexedDB: { open() { return {}; } } });
  const nul = createNullStore('測試');

  for (const key of ['save', 'loadAll', 'prune', 'clear']) {
    assert.equal(typeof real[key], 'function', `真 store 缺少 ${key}`);
    assert.equal(typeof nul[key], 'function', `空 store 缺少 ${key}`);
  }
  assert.equal(nul.available, false);
});

test('開啟資料庫失敗時所有操作都安靜地降級，不往外拋', async () => {
  // 存檔失敗不該讓正在進行的掃描中斷——孩子的紙已經還回去了，
  // 重掃一次的成本比「這一張沒存到」高得多。
  const brokenFactory = {
    open() {
      const request = { onerror: null, onsuccess: null, onupgradeneeded: null, error: new Error('壞了') };
      setTimeout(() => request.onerror && request.onerror(), 0);
      return request;
    },
  };
  const store = createArtworkStore({ indexedDB: brokenFactory });

  assert.equal(store.available, true, '有 factory 就會嘗試，失敗是執行期的事');
  assert.equal(await store.save(record('x', 1)), false);
  assert.deepEqual(await store.loadAll(), []);
  assert.equal(await store.prune(), 0);
});

test('保留數量預設就是畫面上的上限', () => {
  assert.equal(DEFAULT_KEEP, 15);
});
