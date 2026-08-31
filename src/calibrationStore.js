// 校正結果（homography 矩陣）存在這台電腦的 localStorage 裡。
// 只要攝影機跟平台沒有被移動，校正一次可以一直用到活動結束。
(function (root) {
  const KEY = 'jeju-aquarium-game:calibration';

  function saveCalibration({ H, invH, corners, cameraLabel, layout }) {
    const record = { H, invH, corners, cameraLabel: cameraLabel || null, layout: layout || null, savedAt: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(record));
    return record;
  }

  function loadCalibration() {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function clearCalibration() {
    localStorage.removeItem(KEY);
  }

  const api = { saveCalibration, loadCalibration, clearCalibration };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CalibrationStore = api;
})(typeof window !== 'undefined' ? window : globalThis);
