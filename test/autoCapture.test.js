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

test('換上第二張紙時要能再次自動拍攝——不能因為沒看到「空白畫面」就永遠卡住', () => {
  // 實機驗收踩到的：第一張自動拍完之後，第二張怎麼放都不會拍。
  // 原因是回到待機的唯一條件是「遮罩區域接近全白」，而換紙的過程中那個條件
  // 從來不成立（舊紙還在或新紙已經放上），偵測器就永久停在 waiting-removal。
  const detector = new StableArtworkDetector({ stableFrames: 3, removalFrames: 2, sheetAbsentChecks: 2 });

  // 第一張：放好、穩定、拍下
  detector.noteSheetCheck(true);
  assert.equal(detector.update(0.050), null);
  assert.equal(detector.update(0.050), null);
  assert.equal(detector.update(0.050), null);
  assert.equal(detector.update(0.050), 'capture');

  // 換紙：紙被拿起來，四角偵測不到（跟桌面顏色無關）
  detector.noteSheetCheck(false);
  detector.noteSheetCheck(false);
  assert.equal(detector.update(0.30), 'removed', '四角不見了就代表紙離開了鏡頭，應該回到待機');
  assert.equal(detector.state, 'ready');

  // 第二張：放好、穩定，必須拍得到
  detector.noteSheetCheck(true);
  assert.equal(detector.update(0.052), null);
  assert.equal(detector.update(0.052), null);
  assert.equal(detector.update(0.052), null);
  assert.equal(detector.update(0.052), 'capture', '第二張放穩了就該拍');
});

test('深色桌面上把紙拿走一樣要回到待機——不能只認得白色桌面', () => {
  // measureInkRatio 在木桌／深色桌墊上算出來的 ink ratio 是 1.0，
  // 永遠低不過 absentThreshold。所以「紙拿走了沒」不能只靠顏色判斷。
  const detector = new StableArtworkDetector({ stableFrames: 2, removalFrames: 2, sheetAbsentChecks: 2 });
  detector.noteSheetCheck(true);
  detector.update(0.05);
  detector.update(0.05);
  assert.equal(detector.update(0.05), 'capture');

  // 紙拿走了，鏡頭下是深色桌面 → ratio 高得離譜，但四角也不見了
  detector.noteSheetCheck(false);
  detector.noteSheetCheck(false);
  assert.equal(detector.update(1.0), 'removed', '深色桌面的高 ratio 不該擋住回到待機');
});

test('同一張紙還在鏡頭下時，絕對不會被重複拍第二次', () => {
  // 這是 waiting-removal 這個狀態原本的用意，修好換紙之後也必須維持。
  const detector = new StableArtworkDetector({ stableFrames: 2, removalFrames: 2, sheetAbsentChecks: 2 });
  detector.noteSheetCheck(true);
  detector.update(0.05);
  detector.update(0.05);
  assert.equal(detector.update(0.05), 'capture');

  // 紙沒動、四角一直都在：餵 50 幀都不該再拍一次
  for (let i = 0; i < 50; i++) {
    detector.noteSheetCheck(true);
    assert.equal(detector.update(0.05), null, `第 ${i} 幀不該重複拍攝`);
  }
  assert.equal(detector.state, 'waiting-removal');
});

test('四角只是短暫被手遮住時不算「紙已拿走」，避免同一張被拍兩次', () => {
  const detector = new StableArtworkDetector({ stableFrames: 2, removalFrames: 2, sheetAbsentChecks: 3 });
  detector.noteSheetCheck(true);
  detector.update(0.05);
  detector.update(0.05);
  assert.equal(detector.update(0.05), 'capture');

  // 手掃過去，連續兩次沒看到四角，但門檻是三次
  detector.noteSheetCheck(false);
  detector.noteSheetCheck(false);
  assert.equal(detector.update(0.05), null, '還沒到門檻就不該回到待機');
  // 手移開，四角又出現 → 計數要歸零
  detector.noteSheetCheck(true);
  detector.noteSheetCheck(false);
  detector.noteSheetCheck(false);
  assert.equal(detector.update(0.05), null, '中間看到過四角，計數應該重來');
});

test('登場延遲固定落在 30–60 秒範圍', () => {
  assert.equal(randomDelayMs(30, 60, () => 0), 30000);
  assert.equal(randomDelayMs(30, 60, () => 1), 60000);
  assert.equal(randomDelayMs(30, 60, () => 0.5), 45000);
});
