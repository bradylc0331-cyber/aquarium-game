(function (root) {
  const VERTICAL_SPEED_FACTOR = 0.55;
  const COLLISION_EPSILON = 1e-12;

  function finite(value) {
    return Number.isFinite(value);
  }

  function getWalkableArea(width, height) {
    if (!finite(width) || width <= 0 || !finite(height) || height <= 0) {
      throw new RangeError('width and height must be finite positive numbers');
    }

    return {
      left: width * 0.04,
      right: width * 0.96,
      top: height * 0.45,
      bottom: height * 0.91,
      obstacles: [
        { x: width * 0.53, y: height * 0.48, width: width * 0.13, height: height * 0.23 },
        { x: width * 0.62, y: height * 0.66, width: width * 0.16, height: height * 0.18 },
      ],
    };
  }

  function personalSpace(character) {
    if (
      !character
      || !finite(character.x)
      || !finite(character.baseY)
      || !finite(character.width)
      || character.width <= 0
      || !finite(character.height)
      || character.height <= 0
    ) {
      throw new TypeError('character requires finite x/baseY and positive width/height');
    }

    const gap = Math.max(10, character.width * 0.07);
    return {
      centerX: character.x,
      centerY: character.baseY - character.height * 0.48,
      radiusX: character.width * 0.5 + gap,
      radiusY: character.height * 0.48 + gap,
    };
  }

  function validateSpace(space) {
    if (
      !space
      || !finite(space.centerX)
      || !finite(space.centerY)
      || !finite(space.radiusX)
      || space.radiusX <= 0
      || !finite(space.radiusY)
      || space.radiusY <= 0
    ) {
      throw new TypeError('space requires a finite center and positive radii');
    }
  }

  function spacesOverlap(a, b) {
    validateSpace(a);
    validateSpace(b);
    const normalizedX = (a.centerX - b.centerX) / (a.radiusX + b.radiusX);
    const normalizedY = (a.centerY - b.centerY) / (a.radiusY + b.radiusY);
    return normalizedX * normalizedX + normalizedY * normalizedY <= 1 + COLLISION_EPSILON;
  }

  function validateObstacle(obstacle) {
    if (
      !obstacle
      || !finite(obstacle.x)
      || !finite(obstacle.y)
      || !finite(obstacle.width)
      || obstacle.width < 0
      || !finite(obstacle.height)
      || obstacle.height < 0
    ) {
      throw new TypeError('obstacle requires finite non-negative rectangle geometry');
    }
  }

  function hitsObstacle(space, obstacle) {
    validateSpace(space);
    validateObstacle(obstacle);
    const closestX = Math.max(obstacle.x, Math.min(space.centerX, obstacle.x + obstacle.width));
    const closestY = Math.max(obstacle.y, Math.min(space.centerY, obstacle.y + obstacle.height));
    const normalizedX = (space.centerX - closestX) / space.radiusX;
    const normalizedY = (space.centerY - closestY) / space.radiusY;
    return normalizedX * normalizedX + normalizedY * normalizedY <= 1 + COLLISION_EPSILON;
  }

  function validateArea(area) {
    if (
      !area
      || !finite(area.left)
      || !finite(area.right)
      || area.right <= area.left
      || !finite(area.top)
      || !finite(area.bottom)
      || area.bottom < area.top
      || !Array.isArray(area.obstacles)
    ) {
      throw new TypeError('area requires finite ordered bounds and an obstacles array');
    }
    for (const obstacle of area.obstacles) validateObstacle(obstacle);
  }

  function isSafe(candidate, existing, area) {
    if (!Array.isArray(existing)) throw new TypeError('existing must be an array');
    validateArea(area);
    const space = personalSpace(candidate);

    if (
      space.centerX - space.radiusX < area.left
      || space.centerX + space.radiusX > area.right
      || candidate.baseY < area.top
      || candidate.baseY > area.bottom
    ) return false;

    if (area.obstacles.some((obstacle) => hitsObstacle(space, obstacle))) return false;
    return !existing.some((character) => spacesOverlap(space, personalSpace(character)));
  }

  function validateSize(size) {
    if (
      !size
      || !finite(size.width)
      || size.width <= 0
      || !finite(size.height)
      || size.height <= 0
    ) {
      throw new TypeError('size requires finite positive width and height');
    }
  }

  function nextRandom(random) {
    const value = random();
    if (!finite(value) || value < 0 || value >= 1) {
      throw new RangeError('random must return a finite number in [0, 1)');
    }
    return value;
  }

  function findSafeSpawn(size, existing, area, random = Math.random) {
    validateSize(size);
    if (!Array.isArray(existing)) throw new TypeError('existing must be an array');
    validateArea(area);
    if (typeof random !== 'function') throw new TypeError('random must be a function');

    const dimensions = personalSpace({ x: 0, baseY: 0, width: size.width, height: size.height });
    const minX = area.left + dimensions.radiusX;
    const maxX = area.right - dimensions.radiusX;

    for (let attempt = 0; attempt < 90; attempt++) {
      const value = nextRandom(random);
      let x;
      let baseY;
      if (attempt % 3 === 0) {
        x = minX;
        baseY = area.top + value * (area.bottom - area.top);
      } else if (attempt % 3 === 1) {
        x = maxX;
        baseY = area.top + value * (area.bottom - area.top);
      } else {
        x = minX <= maxX ? minX + value * (maxX - minX) : (area.left + area.right) / 2;
        baseY = area.bottom;
      }

      const candidate = { x, baseY, width: size.width, height: size.height };
      if (isSafe(candidate, existing, area)) return { x, baseY };
    }
    return null;
  }

  function chooseSafeTarget(self, characters, area, random = Math.random) {
    personalSpace(self);
    if (!Array.isArray(characters)) throw new TypeError('characters must be an array');
    validateArea(area);
    if (typeof random !== 'function') throw new TypeError('random must be a function');

    const dimensions = personalSpace(self);
    const minX = area.left + dimensions.radiusX;
    const maxX = area.right - dimensions.radiusX;
    const others = characters.filter((character) => character !== self);

    for (let attempt = 0; attempt < 60; attempt++) {
      const horizontal = nextRandom(random);
      const vertical = nextRandom(random);
      const targetX = minX <= maxX
        ? minX + horizontal * (maxX - minX)
        : (area.left + area.right) / 2;
      const targetY = area.top + vertical * (area.bottom - area.top);
      const candidate = { ...self, x: targetX, baseY: targetY };
      if (isSafe(candidate, others, area)) return { targetX, targetY };
    }

    return { targetX: self.x, targetY: self.baseY };
  }

  function clampPosition(character, area) {
    const dimensions = personalSpace(character);
    const minX = area.left + dimensions.radiusX;
    const maxX = area.right - dimensions.radiusX;
    return {
      x: minX <= maxX
        ? Math.max(minX, Math.min(character.x, maxX))
        : (area.left + area.right) / 2,
      baseY: Math.max(area.top, Math.min(character.baseY, area.bottom)),
    };
  }

  function pathIsSafe(self, others, area, endX, endY) {
    const distance = Math.hypot(endX - self.x, endY - self.baseY);
    const dimensions = personalSpace(self);
    const stepLength = Math.max(1, Math.min(dimensions.radiusX, dimensions.radiusY) * 0.45);
    const steps = Math.max(1, Math.ceil(distance / stepLength));

    for (let step = 1; step <= steps; step++) {
      const portion = step / steps;
      const candidate = {
        ...self,
        x: self.x + (endX - self.x) * portion,
        baseY: self.baseY + (endY - self.baseY) * portion,
      };
      if (!isSafe(candidate, others, area)) return false;
    }
    return true;
  }

  function threatDirection(self, others, area, endX, endY) {
    const future = { ...self, x: endX, baseY: endY };
    const futureSpace = personalSpace(future);
    for (const character of others) {
      const otherSpace = personalSpace(character);
      if (spacesOverlap(futureSpace, otherSpace)) {
        return { x: otherSpace.centerX - self.x, y: otherSpace.centerY - personalSpace(self).centerY };
      }
    }
    for (const obstacle of area.obstacles) {
      if (hitsObstacle(futureSpace, obstacle)) {
        return {
          x: obstacle.x + obstacle.width / 2 - self.x,
          y: obstacle.y + obstacle.height / 2 - personalSpace(self).centerY,
        };
      }
    }
    return null;
  }

  function steerCharacter(self, characters, area, dt) {
    personalSpace(self);
    if (!Array.isArray(characters)) throw new TypeError('characters must be an array');
    validateArea(area);
    if (!finite(dt) || dt < 0) throw new RangeError('dt must be finite and non-negative');
    if (!finite(self.cruiseSpeed) || self.cruiseSpeed <= 0) {
      throw new RangeError('cruiseSpeed must be finite and positive');
    }
    if (!finite(self.targetX) || !finite(self.targetY)) {
      throw new TypeError('targetX and targetY must be finite');
    }

    const others = characters.filter((character) => character !== self);
    for (const character of others) personalSpace(character);
    if (dt === 0) return { ...self, x: self.x, baseY: self.baseY, vx: 0, vy: 0 };

    const dx = self.targetX - self.x;
    const dy = self.targetY - self.baseY;
    const distance = Math.hypot(dx, dy);
    if (distance === 0) return { ...self, x: self.x, baseY: self.baseY, vx: 0, vy: 0 };

    const desiredVx = dx / distance * self.cruiseSpeed;
    const desiredVy = dy / distance * self.cruiseSpeed * VERTICAL_SPEED_FACTOR;
    const lookAhead = Math.max(dt, 0.75);
    const predicted = clampPosition({
      ...self,
      x: self.x + desiredVx * lookAhead,
      baseY: self.baseY + desiredVy * lookAhead,
    }, area);
    const threatened = !pathIsSafe(self, others, area, predicted.x, predicted.baseY);
    const threat = threatened ? threatDirection(self, others, area, predicted.x, predicted.baseY) : null;

    const options = [];
    if (threatened) {
      const desiredLength = Math.hypot(desiredVx, desiredVy) || 1;
      const perpendicularX = -desiredVy / desiredLength;
      const perpendicularY = desiredVx / desiredLength;
      const cross = threat ? desiredVx * threat.y - desiredVy * threat.x : 0;
      const firstSide = cross > 0 ? -1 : 1;
      for (const side of [firstSide, -firstSide]) {
        options.push({
          vx: desiredVx * 0.3 + perpendicularX * self.cruiseSpeed * 0.7 * side,
          vy: desiredVy * 0.3 + perpendicularY * self.cruiseSpeed * VERTICAL_SPEED_FACTOR * 0.7 * side,
        });
      }
      options.push({ vx: desiredVx * 0.2, vy: desiredVy * 0.2 });
    } else {
      options.push({ vx: desiredVx, vy: desiredVy });
    }
    options.push({ vx: 0, vy: 0 });

    for (const velocity of options) {
      const unclamped = {
        ...self,
        x: self.x + velocity.vx * dt,
        baseY: self.baseY + velocity.vy * dt,
      };
      const position = clampPosition(unclamped, area);
      if (!pathIsSafe(self, others, area, position.x, position.baseY)) continue;
      return {
        ...self,
        x: position.x,
        baseY: position.baseY,
        vx: (position.x - self.x) / dt,
        vy: (position.baseY - self.baseY) / dt,
      };
    }

    return { ...self, x: self.x, baseY: self.baseY, vx: 0, vy: 0 };
  }

  const api = {
    getWalkableArea,
    personalSpace,
    spacesOverlap,
    hitsObstacle,
    isSafe,
    findSafeSpawn,
    chooseSafeTarget,
    steerCharacter,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Movement = api;
})(typeof window !== 'undefined' ? window : globalThis);
