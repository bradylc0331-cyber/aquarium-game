const { test } = require('node:test');
const assert = require('node:assert/strict');
const { canonicalMaskSVG, canonicalOutlineSVG, placementTransform } = require('../src/svgRaster.js');
const { getSpecies } = require('../src/species.js');
const { CANVAS_W, CANVAS_H, WORK_AREA } = require('../src/constants.js');

test('placementTransform 用 1.5 倍縮放把 400x300 的生物擺進 WORK_AREA（4:3 同比例不變形）', () => {
  const scale = (WORK_AREA.x1 - WORK_AREA.x0) / 400;
  assert.equal(scale, (WORK_AREA.y1 - WORK_AREA.y0) / 300, 'x/y 縮放比例要一樣，不然生物會被壓扁或拉長');
  const t = placementTransform();
  assert.match(t, new RegExp(`scale\\(${scale}\\)`));
});

test('canonicalMaskSVG 尺寸是完整畫布，背景黑、生物白', () => {
  const fish = getSpecies('clownfish');
  const svg = canonicalMaskSVG(fish);
  assert.match(svg, new RegExp(`width="${CANVAS_W}" height="${CANVAS_H}"`));
  assert.match(svg, /fill="#000000"/);
  assert.match(svg, /fill="#ffffff"|stroke="#ffffff"/);
});

test('每一種生物的遮罩跟線稿都要能產生、形狀數量一致', () => {
  const { SPECIES } = require('../src/species.js');
  for (const species of SPECIES) {
    const mask = canonicalMaskSVG(species);
    const outline = canonicalOutlineSVG(species);
    const tagCount = (svg) => (svg.match(/<(ellipse|polygon|path)/g) || []).length;
    assert.equal(tagCount(mask), species.shapes.length, `${species.id} 遮罩形狀數量對不上`);
    assert.equal(tagCount(outline), species.shapes.length, `${species.id} 線稿形狀數量對不上`);
  }
});

test('未知物種 id 找不到時回傳 null，不是丟例外或給假資料', () => {
  assert.equal(getSpecies('unknown-species'), null);
});
