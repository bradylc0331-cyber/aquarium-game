// 塗色紙下緣「經文帶」的版面計算，列印頁與測試共用同一份。
//
// 為什麼要獨立成模組：這段算式如果各抄一份，測試驗的就是測試自己的算式，
// 列印頁怎麼改都不會被發現——那種測試比沒有更糟，因為它看起來是綠的。
(function (root) {
  const C = typeof module !== 'undefined' && module.exports
    ? require('./constants.js')
    : root.AquariumConstants;

  const VERSE_SIZE_MAX = 17;
  const VERSE_SIZE_MIN = 11;
  const VERSE_REF_SIZE = 12;

  // 經文印在版面下緣的整寬帶上——標題列右側被 QR（x=365 起）夾住只剩 283px，
  // 一整句放不下，下緣才有完整的 800px 可用。
  //
  // 但下緣**也是兩個定位方塊所在的位置**。字級寫死的話，只要有人換一句長一點的
  // 經文就會壓到方塊上，那張紙就再也掃不出來，而且要列印之後才會發現。
  // 所以字級自動縮到放得下為止。中文字寬約等於字級；出處是數字與英文夾雜，抓 0.6 倍。
  function layoutVerseBand(species) {
    const markerEdge = C.MARKER_INSET + C.MARKER_SIZE / 2;
    const refWidth = species.verseRef.length * VERSE_REF_SIZE * 0.6;
    const refX = C.CANVAS_W - markerEdge - 8;
    const left = markerEdge + 8;
    const right = refX - refWidth - 12;
    const glyphs = species.verse.length + 2; // 連同前後的引號
    const fontSize = Math.max(
      VERSE_SIZE_MIN,
      Math.min(VERSE_SIZE_MAX, (right - left) / glyphs),
    );
    return {
      centerX: (left + right) / 2,
      refX,
      fontSize: Number(fontSize.toFixed(2)),
      width: glyphs * fontSize,
      left,
      right,
      markerEdge,
    };
  }

  const api = { layoutVerseBand, VERSE_SIZE_MAX, VERSE_SIZE_MIN, VERSE_REF_SIZE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PrintLayout = api;
})(typeof window !== 'undefined' ? window : globalThis);
