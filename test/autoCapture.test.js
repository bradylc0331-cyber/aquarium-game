const { test } = require('node:test');
const assert = require('node:assert/strict');
const { measureInkRatio, randomDelayMs, StableArtworkDetector } = require('../src/autoCapture.js');

function image(width, height, rgb) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = 255;
  }
  return { width, height, data };
}

test('measureInkRatio 能分辨白色校正墊與彩色作品', () => {
  const mask = image(12, 12, [255, 255, 255]);
  assert.equal(measureInkRatio(image(12, 12, [250, 250, 250]), mask, 1), 0);
  assert.equal(measureInkRatio(image(12, 12, [180, 70, 50]), mask, 1), 1);
});

test('穩定作品只觸發一次，拿走後才會重新待機', () => {
  const detector = new StableArtworkDetector({ stableFrames: 3, removalFrames: 2 });
  assert.equal(detector.update(0.03), null);
  assert.equal(detector.update(0.031), null);
  assert.equal(detector.update(0.032), null);
  assert.equal(detector.update(0.031), 'capture');
  assert.equal(detector.update(0.03), null);
  assert.equal(detector.update(0), null);
  assert.equal(detector.update(0), 'removed');
  assert.equal(detector.state, 'ready');
  detector.markCaptured();
  assert.equal(detector.state, 'waiting-removal');
});

test('登場延遲固定落在 30–60 秒範圍', () => {
  assert.equal(randomDelayMs(30, 60, () => 0), 30000);
  assert.equal(randomDelayMs(30, 60, () => 1), 60000);
  assert.equal(randomDelayMs(30, 60, () => 0.5), 45000);
});
