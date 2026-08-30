// 把 species.js 裡同一份 shape 資料，同時轉成「列印線稿」跟「內部遮罩」兩種 SVG。
// 兩者共用同一組座標，遮罩才會跟印出來給小朋友著色的線稿完全對得上。
(function (root) {
  const AquariumConstants = typeof module !== 'undefined' && module.exports
    ? require('./constants.js')
    : root.AquariumConstants;

  function attrsToString(attrs) {
    return Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ');
  }

  function outlineStyle(shape) {
    const w = shape.type === 'line' ? (shape.lineWidth || 16) : 6;
    return `fill="none" stroke="#111111" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;
  }

  function maskStyle(shape) {
    if (shape.type === 'line') {
      const w = shape.lineWidth || 16;
      return `fill="none" stroke="#ffffff" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;
    }
    return `fill="#ffffff" stroke="none"`;
  }

  function shapeToElement(shape, styleAttrs) {
    return `<${shape.tag} ${attrsToString(shape.attrs)} ${styleAttrs}/>`;
  }

  // species.viewBox（400x300）內的形狀，套上把它擺進 WORK_AREA 的 transform 字串
  function placementTransform() {
    const { WORK_AREA } = AquariumConstants;
    const scale = (WORK_AREA.x1 - WORK_AREA.x0) / 400; // 跟 (y1-y0)/300 相等，viewBox 是同比例的 4:3
    return `translate(${WORK_AREA.x0} ${WORK_AREA.y0}) scale(${scale})`;
  }

  function bodyMarkup(species, mode) {
    const styleFn = mode === 'mask' ? maskStyle : outlineStyle;
    return species.shapes.map((s) => shapeToElement(s, styleFn(s))).join('\n');
  }

  // 生物自己的 400x300 座標系內的線稿/遮罩片段（列印生物紙時用，不含 WORK_AREA 偏移）
  function speciesFragmentSVG(species, mode) {
    return `<g>${bodyMarkup(species, mode)}</g>`;
  }

  // 生物原生 viewBox 尺寸（400x300）的完整遮罩 SVG——不套 WORK_AREA 偏移。
  // 用在還沒有小朋友掃描結果時的預設示範生物（display.html 開場先游幾隻墊場）。
  function nativeMaskSVG(species) {
    const [, , vw, vh] = species.viewBox.split(' ').map(Number);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${vw}" height="${vh}" viewBox="${species.viewBox}">` +
      `<rect width="100%" height="100%" fill="#000000"/>${bodyMarkup(species, 'mask')}</svg>`;
  }

  // 完整 800x600 校正後畫布座標系裡的遮罩：黑底 + 白色生物形狀，擺在 WORK_AREA 內
  function canonicalMaskSVG(species) {
    const { CANVAS_W, CANVAS_H } = AquariumConstants;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_W}" height="${CANVAS_H}" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}">` +
      `<rect width="100%" height="100%" fill="#000000"/>` +
      `<g transform="${placementTransform()}">${bodyMarkup(species, 'mask')}</g>` +
      `</svg>`;
  }

  // 完整 800x600 校正後畫布座標系裡的線稿預覽（控制台上給工作人員核對用）
  function canonicalOutlineSVG(species) {
    const { CANVAS_W, CANVAS_H } = AquariumConstants;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_W}" height="${CANVAS_H}" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}">` +
      `<g transform="${placementTransform()}">${bodyMarkup(species, 'outline')}</g>` +
      `</svg>`;
  }

  function rasterizeSVGToCanvas(svgString, width, height) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas);
      };
      img.onerror = (e) => reject(new Error('SVG 轉點陣失敗: ' + e));
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);
    });
  }

  const api = {
    speciesFragmentSVG,
    canonicalMaskSVG,
    canonicalOutlineSVG,
    nativeMaskSVG,
    placementTransform,
    rasterizeSVGToCanvas,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SvgRaster = api;
})(typeof window !== 'undefined' ? window : globalThis);
