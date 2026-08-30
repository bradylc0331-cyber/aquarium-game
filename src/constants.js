// 全專案共用的畫布尺寸與校正墊版面常數。
// 校正墊、掃描時的透視校正、每種生物的畫布位置全部對齊同一份數字，才不會各自為政。
(function (root) {
  const CANVAS_W = 800;
  const CANVAS_H = 600;

  // 塗鴉紙要放進去的引導框，4:3 跟生物模板的 viewBox（400x300）成正比，
  // 縮放 1.5 倍剛好填滿，不會變形。
  const WORK_AREA = { x0: 100, y0: 75, x1: 700, y1: 525 };

  // 四個黑色方塊標記在「校正後畫布」座標系裡的中心點與邊長，框住 WORK_AREA 外圍。
  // 這四點同時也是 computeHomography 的目的地座標（dst）。
  const MARKER_INSET = 50;
  const MARKER_SIZE = 40;
  const MARKER_CANONICAL = {
    tl: [WORK_AREA.x0 - MARKER_INSET, WORK_AREA.y0 - MARKER_INSET],
    tr: [WORK_AREA.x1 + MARKER_INSET, WORK_AREA.y0 - MARKER_INSET],
    br: [WORK_AREA.x1 + MARKER_INSET, WORK_AREA.y1 + MARKER_INSET],
    bl: [WORK_AREA.x0 - MARKER_INSET, WORK_AREA.y1 + MARKER_INSET],
  };

  // 印刷時「校正墊」跟「生物塗色紙」共用的比例尺——兩張紙用同一個 mm/px，
  // 塗色紙的外框物理尺寸才會跟校正墊上的虛線引導框剛好一樣大，貼合對齊。
  const PRINT_MM_PER_PX = 0.23;

  const api = { CANVAS_W, CANVAS_H, MARKER_INSET, MARKER_SIZE, MARKER_CANONICAL, WORK_AREA, PRINT_MM_PER_PX };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AquariumConstants = api;
})(typeof window !== 'undefined' ? window : globalThis);
