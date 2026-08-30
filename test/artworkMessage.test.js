const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  createArtworkId,
  createScannedArtworkMessage,
  isScannedArtworkMessage,
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
