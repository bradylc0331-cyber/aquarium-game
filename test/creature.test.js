const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Creature, motionOffset, walkPose } = require('../src/creature.js');

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

test('未知樣式會退回 fish，人物 noFlip 也不會因移動方向被鏡射', () => {
  const off = motionOffset('not-a-real-style', 1, { amplitude: 10, freq: 1, phase: 0 });
  const fishOff = motionOffset('fish', 1, { amplitude: 10, freq: 1, phase: 0 });
  assert.equal(off.yOffset, fishOff.yOffset);

  const scales = [];
  const fakeCtx = {
    save() {}, translate() {}, rotate() {}, drawImage() {}, restore() {},
    scale(x, y) { scales.push([x, y]); },
  };
  Creature.prototype.draw.call({
    style: 'glide', amplitude: 0, freq: 1, phase: 0,
    baseY: 100, speed: -20, x: 80, width: 50, height: 90,
    image: {}, species: { swim: { noFlip: true } },
  }, fakeCtx, 0);
  assert.ok(scales[0][0] > 0, 'noFlip 人物向左移動時仍應維持正向比例');
});

test('walk 樣式人物只會往上踏步，不會沉進地面', () => {
  for (let t = 0; t < 5; t += 0.05) {
    const off = motionOffset('walk', t, { amplitude: 5, freq: 6, phase: 0.4 });
    assert.ok(off.yOffset <= 0 && off.yOffset >= -5.001);
    assert.ok(Math.abs(off.rotation) < 0.02);
  }
});

test('自然踏步時左右腿角度相反，半個週期後交換前後腳', () => {
  const a = walkPose(0.25, { freq: Math.PI * 2, phase: 0, maxAngle: 0.1 });
  const b = walkPose(0.75, { freq: Math.PI * 2, phase: 0, maxAngle: 0.1 });
  assert.equal(a.leftAngle, -a.rightAngle);
  assert.equal(b.leftAngle, -b.rightAngle);
  assert.ok(a.leftFront);
  assert.ok(!b.leftFront);
  assert.ok(a.leftAngle > 0 && b.leftAngle < 0);
});
