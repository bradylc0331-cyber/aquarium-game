(function (root) {
  const ENTROPY_SPACE = 36 ** 7;

  function createArtworkId(now = Date.now, random = Math.random) {
    const timestamp = Number(now()).toString(36);
    const randomValue = Number(random());
    const entropyNumber = Number.isFinite(randomValue)
      ? Math.min(ENTROPY_SPACE - 1, Math.max(0, Math.floor(randomValue * ENTROPY_SPACE)))
      : 0;
    const entropy = entropyNumber.toString(36).padStart(7, '0');
    return `art-${timestamp}-${entropy}`;
  }

  function createArtworkScanResult({ speciesId, dataURL, createId = createArtworkId }) {
    return {
      artworkId: createId(),
      speciesId,
      dataURL,
    };
  }

  function createScannedArtworkMessage({ artworkId, speciesId, textureDataURL, now = Date.now }) {
    return {
      type: 'creature-scanned',
      artworkId,
      speciesId,
      textureDataURL,
      ts: Number(now()),
    };
  }

  function submitScannedArtwork(scanResult, {
    send,
    now = Date.now,
    setTimer,
    delayMs = 0,
  }) {
    const message = createScannedArtworkMessage({
      artworkId: scanResult.artworkId,
      speciesId: scanResult.speciesId,
      textureDataURL: scanResult.dataURL,
      now,
    });
    if (typeof setTimer === 'function') {
      return setTimer(() => send(message), delayMs);
    }
    send(message);
    return message;
  }

  function isScannedArtworkMessage(value) {
    return Boolean(
      value
      && typeof value === 'object'
      && !Array.isArray(value)
      && value.type === 'creature-scanned'
      && typeof value.artworkId === 'string'
      && value.artworkId.trim().length >= 6
      && typeof value.speciesId === 'string'
      && /^[a-z][a-z0-9-]*$/i.test(value.speciesId)
      && typeof value.textureDataURL === 'string'
      && value.textureDataURL.startsWith('data:image/png;base64,')
      && Number.isFinite(value.ts)
    );
  }

  const api = {
    createArtworkId,
    createArtworkScanResult,
    createScannedArtworkMessage,
    isScannedArtworkMessage,
    submitScannedArtwork,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ArtworkMessage = api;
})(typeof window !== 'undefined' ? window : globalThis);
