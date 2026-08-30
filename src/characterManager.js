(function (root) {
  class CharacterManager {
    constructor({ maxCharacters = 15, exitSeconds = 0.4, createCharacter } = {}) {
      if (typeof createCharacter !== 'function') {
        throw new TypeError('createCharacter must be a function');
      }
      if (!Number.isInteger(maxCharacters) || maxCharacters <= 0) {
        throw new RangeError('maxCharacters must be a finite positive integer');
      }
      if (!Number.isFinite(exitSeconds) || exitSeconds < 0) {
        throw new RangeError('exitSeconds must be finite and non-negative');
      }

      this.maxCharacters = maxCharacters;
      this.exitSeconds = exitSeconds;
      this.createCharacter = createCharacter;
      this.renderable = [];
      this.pending = [];
      this.seenIds = new Set();
      this.exitingCharacter = null;
      this.exitElapsed = 0;
    }

    get pendingCount() {
      return this.pending.length;
    }

    enqueue(work) {
      const artworkId = work && work.artworkId;
      // Artwork schema validation belongs upstream; this API treats a missing ID as duplicate.
      if (!artworkId || this.seenIds.has(artworkId)) return 'duplicate';

      this.seenIds.add(artworkId);
      this.pending.push(work);
      this.drainPending();
      return 'accepted';
    }

    drainPending() {
      while (this.pending.length > 0 && this.renderable.length < this.maxCharacters) {
        const character = this.createCharacter(this.pending[0]);
        if (character == null) break;
        this.pending.shift();
        this.renderable.push(character);
      }
      this.startOldestExit();
    }

    startOldestExit() {
      if (
        this.exitingCharacter
        || this.pending.length === 0
        || this.renderable.length < this.maxCharacters
        || this.renderable.length === 0
      ) return;

      this.exitingCharacter = this.renderable[0];
      this.exitElapsed = 0;
      this.exitingCharacter.setTransition('exiting');
    }

    update(dt) {
      let remaining = Number.isFinite(dt) && dt > 0 ? dt : 0;

      if (!this.exitingCharacter) this.drainPending();

      while (this.exitingCharacter) {
        const timeNeeded = Math.max(0, this.exitSeconds - this.exitElapsed);
        const epsilon = Number.EPSILON * 8 * Math.max(
          remaining,
          timeNeeded,
          this.exitSeconds,
          this.exitElapsed,
        );
        if (remaining + epsilon < timeNeeded) {
          this.exitElapsed += remaining;
          return;
        }

        remaining = Math.max(0, remaining - timeNeeded);
        this.renderable.shift();
        this.exitingCharacter = null;
        this.exitElapsed = 0;
        this.drainPending();
      }
    }
  }

  const api = { CharacterManager };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CharacterManagerModule = api;
})(typeof window !== 'undefined' ? window : globalThis);
