const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  createArtworkId,
  createArtworkScanResult,
  createScannedArtworkMessage,
  isScannedArtworkMessage,
  createResetMessage,
  isResetMessage,
  submitScannedArtwork,
} = require('../src/artworkMessage.js');

test('作品 ID 隨拍攝時間改變，掃描訊息保留同一個 ID 與指定時間', () => {
  const firstId = createArtworkId(() => 1_700_000_000_000, () => 0.25);
  const secondId = createArtworkId(() => 1_700_000_000_001, () => 0.25);

  assert.notEqual(firstId, secondId);
  assert.match(firstId, /^art-[0-9a-z]+-[0-9a-z]{7}$/);

  const message = createScannedArtworkMessage({
    artworkId: firstId,
    speciesId: 'noah',
    textureDataURL: 'data:image/png;base64,AAAA',
    now: () => 1_700_000_000_123,
  });
  assert.equal(message.artworkId, firstId);
  assert.equal(message.ts, 1_700_000_000_123);
});

test('只接受具有效作品 ID、物種、PNG 圖片與有限時間的掃描訊息', () => {
  const validMessage = {
    type: 'creature-scanned',
    artworkId: 'art-loyw3v28-9000000',
    speciesId: 'noah-2',
    textureDataURL: 'data:image/png;base64,AAAA',
    ts: 1_700_000_000_123,
  };

  assert.equal(isScannedArtworkMessage(validMessage), true);
  assert.equal(isScannedArtworkMessage({ ...validMessage, artworkId: undefined }), false);
  assert.equal(isScannedArtworkMessage({ ...validMessage, artworkId: '     ' }), false);
  assert.equal(isScannedArtworkMessage({ ...validMessage, textureDataURL: 'data:image/jpeg;base64,AAAA' }), false);
});

test('成功拍攝只建立一次作品 ID，並放進完整掃描結果', () => {
  let createIdCalls = 0;
  const scanResult = createArtworkScanResult({
    speciesId: 'noah',
    dataURL: 'data:image/png;base64,WORK',
    createId: () => {
      createIdCalls++;
      return 'art-capture-a';
    },
  });

  assert.equal(createIdCalls, 1);
  assert.deepEqual(scanResult, {
    artworkId: 'art-capture-a',
    speciesId: 'noah',
    dataURL: 'data:image/png;base64,WORK',
  });
});

test('手動提交完整保留掃描結果的 ID、物種與圖片', () => {
  const sent = [];
  const scanResult = {
    artworkId: 'art-manual-a',
    speciesId: 'moses',
    dataURL: 'data:image/png;base64,MANUAL',
  };

  submitScannedArtwork(scanResult, {
    send: (message) => sent.push(message),
    now: () => 101,
  });

  assert.deepEqual(sent, [{
    type: 'creature-scanned',
    artworkId: 'art-manual-a',
    speciesId: 'moses',
    textureDataURL: 'data:image/png;base64,MANUAL',
    ts: 101,
  }]);
});

test('延遲提交 A 後即使最新掃描變成 B，計時器仍送出 A 的原始內容', () => {
  let timerCallback = null;
  let timerDelay = null;
  const sent = [];
  const workA = {
    artworkId: 'art-work-a',
    speciesId: 'david',
    dataURL: 'data:image/png;base64,WORK-A',
  };
  const workB = {
    artworkId: 'art-work-b',
    speciesId: 'daniel',
    dataURL: 'data:image/png;base64,WORK-B',
  };
  let latestScanResult = workA;

  submitScannedArtwork(latestScanResult, {
    delayMs: 45_000,
    setTimer: (callback, delayMs) => {
      timerCallback = callback;
      timerDelay = delayMs;
    },
    send: (message) => sent.push(message),
    now: () => 202,
  });
  latestScanResult = workB;

  assert.equal(timerDelay, 45_000);
  assert.deepEqual(sent, []);
  timerCallback();
  assert.deepEqual(sent, [{
    type: 'creature-scanned',
    artworkId: 'art-work-a',
    speciesId: 'david',
    textureDataURL: 'data:image/png;base64,WORK-A',
    ts: 202,
  }]);
  assert.equal(latestScanResult, workB);
});

test('清場訊息與作品訊息是兩個獨立型別，不會互相誤觸', () => {
  // 清場是不可回復的動作。型別分開，投影端才能各自驗證——
  // 一則壞掉或被竄改的作品訊息絕對不能意外把整場清掉。
  const reset = createResetMessage({ now: () => 1234 });

  assert.equal(isResetMessage(reset), true);
  assert.equal(isScannedArtworkMessage(reset), false, '清場訊息不該被當成作品');

  const artwork = createScannedArtworkMessage({
    artworkId: 'art-abc123',
    speciesId: 'noah',
    textureDataURL: 'data:image/png;base64,AAAA',
    now: () => 1,
  });
  assert.equal(isResetMessage(artwork), false, '作品訊息不該被當成清場指令');
});

test('isResetMessage 擋掉形狀不對的東西', () => {
  for (const bad of [
    null, undefined, 'scene-reset', 42, [],
    { type: 'scene-reset' },                  // 缺 ts
    { type: 'scene-reset', ts: NaN },
    { type: 'scene-reset', ts: 'now' },
    { type: 'creature-scanned', ts: 1 },
    [{ type: 'scene-reset', ts: 1 }],         // 陣列不算
  ]) {
    assert.equal(isResetMessage(bad), false, `不該接受 ${JSON.stringify(bad)}`);
  }
});
