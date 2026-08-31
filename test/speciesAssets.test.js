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
