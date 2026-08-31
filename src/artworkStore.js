// 掃描進來的作品存在這台電腦的 IndexedDB 裡，投影分頁重新整理之後可以還原。
//
// 為什麼需要：在這之前作品只活在 display.html 的記憶體裡。活動進行到一半
// 不小心按到 F5、瀏覽器當掉、或電腦休眠喚醒後分頁被回收，孩子畫的東西就
// 全部消失，而且沒有任何補救方式——原始的塗色紙已經還給孩子了。
//
// 存的就是通過驗證的那一則訊息本身（type / artworkId / speciesId /
// textureDataURL / ts），還原時再用同一個 isScannedArtworkMessage 驗一次，
// 走的是跟即時掃描完全相同的那條路，不另外開一條分支。
(function (root) {
  const DB_NAME = 'bible-wonderland';
  const DB_VERSION = 1;
  const STORE_NAME = 'artworks';
  // 預設只留最新的 15 張——就是畫面上同時容得下的數量。存更多也還原不出來。
  const DEFAULT_KEEP = 15;

  // 還原時要送進場的作品，**由舊到新**排好。
  //
  // 順序很重要：CharacterManager 是 FIFO，先進場的先被擠掉。如果還原時順序
  // 顛倒，接下來新掃描的作品會先擠掉最新的那幾張，而不是最舊的那幾張。
  function selectRestorable(records, keep = DEFAULT_KEEP) {
    if (!Array.isArray(records)) return [];
    const limit = Number.isInteger(keep) && keep > 0 ? keep : DEFAULT_KEEP;
    return records
      .filter((record) => record && Number.isFinite(record.ts))
      .slice()
      .sort((a, b) => a.ts - b.ts)
      .slice(-limit);
  }

  // 超出保留數量的舊作品，回傳它們的 id 讓呼叫端刪掉。
  function idsToPrune(records, keep = DEFAULT_KEEP) {
    if (!Array.isArray(records)) return [];
    const kept = new Set(selectRestorable(records, keep).map((record) => record.artworkId));
    return records
      .filter((record) => record && record.artworkId && !kept.has(record.artworkId))
      .map((record) => record.artworkId);
  }

  // 沒有 IndexedDB（私密視窗、被政策擋掉、或非瀏覽器環境）時用的空實作。
  // 存不了就是存不了，但**絕對不能讓掃描或投影因此壞掉**——活動照常進行，
  // 只是少了重新整理後還原的能力。
  function createNullStore(reason) {
    return {
      available: false,
      reason,
      async save() { return false; },
      async loadAll() { return []; },
      async prune() { return 0; },
      async clear() { return false; },
    };
  }

  function createArtworkStore(options = {}) {
    const factory = options.indexedDB
      || (typeof indexedDB !== 'undefined' ? indexedDB : null);
    if (!factory) return createNullStore('這個環境沒有 IndexedDB');

    const keep = Number.isInteger(options.keep) && options.keep > 0 ? options.keep : DEFAULT_KEEP;
    const dbName = options.dbName || DB_NAME;
    let opening = null;

    function open() {
      if (opening) return opening;
      opening = new Promise((resolve, reject) => {
        const request = factory.open(dbName, DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'artworkId' });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('開啟 IndexedDB 失敗'));
        request.onblocked = () => reject(new Error('IndexedDB 被其他分頁擋住'));
      });
      return opening;
    }

    function run(mode, work) {
      return open().then((db) => new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        let result;
        try {
          result = work(store);
        } catch (error) {
          reject(error);
          return;
        }
        tx.oncomplete = () => resolve(result && result.value !== undefined ? result.value : result);
        tx.onerror = () => reject(tx.error || new Error('IndexedDB 交易失敗'));
        tx.onabort = () => reject(tx.error || new Error('IndexedDB 交易被中止'));
      }));
    }

    return {
      available: true,
      keep,

      // 存一張作品。配額滿了或寫入失敗都只回報 false，不往外拋——
      // 存檔失敗不該讓正在進行的掃描中斷。
      async save(record) {
        try {
          await run('readwrite', (store) => { store.put(record); });
          return true;
        } catch (error) {
          return false;
        }
      },

      async loadAll() {
        try {
          const request = await run('readonly', (store) => store.getAll());
          return Array.isArray(request) ? request : (request && request.result) || [];
        } catch (error) {
          return [];
        }
      },

      // 把超出保留數量的舊作品刪掉，回傳刪了幾張。
      async prune() {
        try {
          const records = await this.loadAll();
          const stale = idsToPrune(records, keep);
          if (stale.length === 0) return 0;
          await run('readwrite', (store) => { for (const id of stale) store.delete(id); });
          return stale.length;
        } catch (error) {
          return 0;
        }
      },

      async clear() {
        try {
          await run('readwrite', (store) => { store.clear(); });
          return true;
        } catch (error) {
          return false;
        }
      },
    };
  }

  const api = {
    createArtworkStore,
    createNullStore,
    selectRestorable,
    idsToPrune,
    DB_NAME,
    STORE_NAME,
    DEFAULT_KEEP,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ArtworkStore = api;
})(typeof window !== 'undefined' ? window : globalThis);
