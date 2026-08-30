const { test } = require('node:test');
const assert = require('node:assert/strict');
const { motionOffset } = require('../src/creature.js');

test('fish 樣式：t=0 且 phase=0 時沒有垂直位移，尾巴縮放在 1 附近', () => {
  const off = motionOffset('fish', 0, { amplitude: 20, freq: 2, phase: 0 });
  assert.equal(off.yOffset, 0);
  assert.equal(off.scaleX, 1);
});

test('pulse（水母）鐘罩縮放要在合理範圍內脈動，不會縮到 0 或爆大', () => {
  for (let t = 0; t < 10; t += 0.3) {
    const off = motionOffset('pulse', t, { amplitude: 30, freq: 1, phase: 0 });
    assert.ok(off.scaleY > 0.7 && off.scaleY < 1.3, `scaleY out of range at t=${t}: ${off.scaleY}`);
  }
});

test('arc（海豚）的垂直位移永遠 <= 0，模擬躍出水面又下潛，不會鑽到缸底以下拱起', () => {
  for (let t = 0; t < 10; t += 0.1) {
    const off = motionOffset('arc', t, { amplitude: 60, freq: 1.2, phase: 0.3 });
    assert.ok(off.yOffset <= 1e-9, `yOffset should stay <= 0 at t=${t}, got ${off.yOffset}`);
  }
});

test('未知樣式要退回 fish 的行為，不能整個沒有位移', () => {
  const off = motionOffset('not-a-real-style', 1, { amplitude: 10, freq: 1, phase: 0 });
  const fishOff = motionOffset('fish', 1, { amplitude: 10, freq: 1, phase: 0 });
  assert.equal(off.yOffset, fishOff.yOffset);
});
