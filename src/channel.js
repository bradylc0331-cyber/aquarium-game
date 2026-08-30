// control.html 掃描完一隻生物之後，要把它送到 display.html（通常是拖到電視上的另一個視窗）。
// 兩邊都是同一份靜態網站、同源，BroadcastChannel 就夠用，不需要任何 server。
// 萬一瀏覽器沒有 BroadcastChannel（很舊的 Safari），退回用 localStorage + storage 事件。
(function (root) {
  const CHANNEL_NAME = 'jeju-aquarium-game';

  function createChannel() {
    const listeners = new Set();
    let bc = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        bc = new BroadcastChannel(CHANNEL_NAME);
        bc.onmessage = (ev) => listeners.forEach((fn) => fn(ev.data));
      }
    } catch (e) {
      bc = null;
    }

    function onStorage(ev) {
      if (ev.key !== CHANNEL_NAME || !ev.newValue) return;
      try {
        listeners.forEach((fn) => fn(JSON.parse(ev.newValue)));
      } catch (e) { /* 忽略壞掉的訊息 */ }
    }
    if (!bc && typeof window !== 'undefined') {
      window.addEventListener('storage', onStorage);
    }

    return {
      send(data) {
        if (bc) {
          bc.postMessage(data);
        } else if (typeof localStorage !== 'undefined') {
          localStorage.setItem(CHANNEL_NAME, JSON.stringify({ ...data, _t: Date.now() }));
        }
      },
      onMessage(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      close() {
        if (bc) bc.close();
        if (!bc && typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
        listeners.clear();
      },
    };
  }

  const api = { createChannel, CHANNEL_NAME };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AquariumChannel = api;
})(typeof window !== 'undefined' ? window : globalThis);
