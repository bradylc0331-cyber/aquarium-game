const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { SPECIES } = require('../src/species.js');

function pngSize(file) {
  const data = fs.readFileSync(file);
  assert.equal(data.toString('ascii', 1, 4), 'PNG', `${file} 不是 PNG`);
  return [data.readUInt32BE(16), data.readUInt32BE(20)];
}

test('七位人物都有 4:3 寫實線稿與對齊的 400x300 掃描遮罩', () => {
  assert.equal(SPECIES.length, 7);
  for (const species of SPECIES) {
    const art = path.resolve(__dirname, '..', species.art);
    const mask = path.resolve(__dirname, '..', species.mask);
    assert.ok(fs.existsSync(art), `${species.id} 缺少線稿`);
    assert.ok(fs.existsSync(mask), `${species.id} 缺少遮罩`);
    const [artWidth, artHeight] = pngSize(art);
    assert.equal(artWidth / artHeight, 4 / 3, `${species.id} 線稿不是 4:3`);
    assert.deepEqual(pngSize(mask), [400, 300], `${species.id} 遮罩尺寸錯誤`);
  }
});

test('四張核准的羊與飛鳥 Image 2 PNG 母圖存在且是有效 PNG', () => {
  const approvedSprites = [
    'assets/sheep/sheep-walking.png',
    'assets/sheep/sheep-grazing.png',
    'assets/birds/bird-wings-up.png',
    'assets/birds/bird-wings-down.png',
  ];

  for (const relativePath of approvedSprites) {
    const file = path.resolve(__dirname, '..', relativePath);
    assert.ok(fs.existsSync(file), `${relativePath} 缺少核准母圖`);
    assert.ok(fs.statSync(file).size > 1024, `${relativePath} 檔案過小`);
    assert.equal(fs.readFileSync(file).toString('ascii', 1, 4), 'PNG', `${relativePath} 不是 PNG`);
  }
});
