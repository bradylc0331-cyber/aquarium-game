// 全專案共用的 A4 QR 塗色紙與掃描座標常數。
// 列印、四角對位、QR 辨識、人物遮罩全部共用同一座標系，避免畫面彼此錯位。
(function (root) {
  // 整張 A4 橫式紙張的校正後座標系（297:210）。800px 對應 297mm。
  const CANVAS_W = 800;
  const CANVAS_H = 566;

  // 塗鴉紙要放進去的引導框，4:3 跟生物模板的 viewBox（400x300）成正比，
  // 縮放 1.5 倍剛好填滿，不會變形。
  // 上方保留 QR 與人物名稱；人物區仍維持 600x450（4:3），原有遮罩不會變形。
  const WORK_AREA = { x0: 100, y0: 92, x1: 700, y1: 542 };

  // 四個黑色方塊標記在「校正後畫布」座標系裡的中心點與邊長，框住 WORK_AREA 外圍。
  // 這四點同時也是 computeHomography 的目的地座標（dst）。
  // 四個定位方塊直接印在每張 A4 人物紙上，不再需要另外裁紙或使用校正墊。
  const MARKER_INSET = 32;
  const MARKER_SIZE = 28;
  const MARKER_CANONICAL = {
    tl: [MARKER_INSET, MARKER_INSET],
    tr: [CANVAS_W - MARKER_INSET, MARKER_INSET],
    br: [CANVAS_W - MARKER_INSET, CANVAS_H - MARKER_INSET],
    bl: [MARKER_INSET, CANVAS_H - MARKER_INSET],
  };

  const QR_AREA = { x: 365, y: 8, size: 70 };

  // A4 橫式紙張的實體比例尺：800px 剛好對應 297mm。
  const PRINT_MM_PER_PX = 297 / CANVAS_W;

  const api = { CANVAS_W, CANVAS_H, MARKER_INSET, MARKER_SIZE, MARKER_CANONICAL, QR_AREA, WORK_AREA, PRINT_MM_PER_PX };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AquariumConstants = api;
})(typeof window !== 'undefined' ? window : globalThis);
