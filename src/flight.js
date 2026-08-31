// 會飛的角色（天使）在天空帶自由飄移。
//
// 為什麼不共用地面那套移動控制器：天空裡沒有障礙物、沒有河流、沒有窄走廊，
// 也不需要景深足跡。地面控制器整套（扇形閃避、網格 BFS 繞路、卡住偵測）
// 是為了解決地面的問題而存在的，套到天空上只會讓天使被壓回草地——那正是
// 目前的狀況：天使跟大家擠在同一條草地上。
//
// 飛行只需要三件事：在天空帶裡飄、碰到邊緣轉回來、彼此不要疊在一起。
(function (root) {
  // 天空帶：上緣留一點邊不要貼著畫面頂端，下緣停在可行走區上緣之上，
  // 免得天使飄到一半又跟地面角色重疊。
  const SKY_TOP = 0.06;
  const SKY_BOTTOM = 0.42;
  // 飄移速度相對於角色巡航速度的比例。天使是飄的，不是走的，慢一點比較好看。
  const DRIFT_SPEED_FACTOR = 0.75;
  // 垂直飄移相對水平的比例：天使主要是橫向飄，上下只是輕微起伏。
  const VERTICAL_DRIFT_FACTOR = 0.22;
  // 兩位天使的水平間距至少要有這麼多個身寬，否則會看起來疊在一起。
  const SEPARATION_WIDTHS = 1.15;

  function finite(value) {
    return Number.isFinite(value);
  }

  // 飛行角色的圖是**以 baseY 為中心**往上下各畫一半，再整個往上浮 amplitude
  // 並上下擺動（見 creature.js 的 draw）。所以能用的 baseY 範圍不是天空帶本身，
  // 要再往下讓出「半個身高 + 浮起與擺動」的空間，否則天使的頭會被畫面上緣切掉。
  // 實測 1080p 下天使身高約 290px：baseY=171 時頭頂落在 y=4，整個上半身不見了。
  function flyableBand(area, self) {
    const height = finite(self.renderHeight) ? self.renderHeight : self.height;
    const half = (finite(height) ? height : 0) / 2;
    const swing = (finite(self.amplitude) ? self.amplitude : half * 0.12) * 2;
    const top = area.top + half + swing;
    const bottom = area.bottom;
    return { top: Math.min(top, bottom), bottom: Math.max(top, bottom) };
  }

  function getSkyArea(width, height) {
    if (!finite(width) || width <= 0 || !finite(height) || height <= 0) {
      throw new RangeError('width and height must be finite positive numbers');
    }
    return {
      left: 0,
      right: width,
      top: height * SKY_TOP,
      bottom: height * SKY_BOTTOM,
    };
  }

  // 找一個不跟其他飛行角色重疊的入場位置。找不到就回傳 null，
  // 讓呼叫端把作品留在 pending 等空間——跟地面的規則一致。
  function findSkySpawn(size, existing, area, random = Math.random) {
    const others = Array.isArray(existing) ? existing.filter((c) => c && c.isFlying) : [];
    const halfWidth = size.width / 2;
    const minX = area.left + halfWidth;
    const maxX = area.right - halfWidth;
    if (minX > maxX) return null;

    const band = flyableBand(area, size);
    for (let attempt = 0; attempt < 40; attempt++) {
      const value = random();
      const along = finite(value) ? Math.min(1, Math.max(0, value)) : 0.5;
      const vertical = attempt % 2 === 0 ? 0.25 : 0.65;
      const x = minX + along * (maxX - minX);
      const baseY = band.top + vertical * (band.bottom - band.top);
      const clear = others.every(
        (other) => Math.abs(other.x - x) >= (size.width + other.width) / 2 * SEPARATION_WIDTHS,
      );
      if (clear) return { x, baseY };
    }
    return null;
  }

  // 一幀的飄移。回傳的形狀跟 Movement.steerCharacter 一樣，
  // 整合層才能用同一個 setMovement 收回去。
  function driftFlyer(self, others, area, dt) {
    if (!finite(dt) || dt < 0) throw new RangeError('dt must be finite and non-negative');
    if (!finite(self.cruiseSpeed) || self.cruiseSpeed <= 0) {
      throw new RangeError('cruiseSpeed must be finite and positive');
    }

    const speed = self.cruiseSpeed * DRIFT_SPEED_FACTOR;
    let direction = self.driftDirection === -1 ? -1 : 1;
    const halfWidth = self.width / 2;
    const minX = area.left + halfWidth;
    const maxX = area.right - halfWidth;

    // 太靠近別的天使就往反方向讓開——只看水平距離，天空裡不需要精確的碰撞。
    for (const other of others) {
      if (other === self) continue;
      const gap = Math.abs(other.x - self.x);
      const needed = (self.width + other.width) / 2 * SEPARATION_WIDTHS;
      if (gap < needed) {
        direction = other.x > self.x ? -1 : 1;
        break;
      }
    }

    let x = self.x + speed * direction * dt;
    // 碰到左右邊緣就轉回來，不是停在那裡。
    if (x < minX) { x = minX; direction = 1; }
    if (x > maxX) { x = maxX; direction = -1; }

    // 緩慢的上下起伏：用位置與時間推出來的正弦，不需要額外狀態。
    const band = flyableBand(area, self);
    const span = band.bottom - band.top;
    const middle = band.top + span / 2;
    const phase = finite(self.driftPhase) ? self.driftPhase : 0;
    const elapsed = (finite(self.driftElapsed) ? self.driftElapsed : 0) + dt;
    const targetY = middle + Math.sin(elapsed * 0.18 + phase) * (span * 0.32);
    const baseY = self.baseY + (targetY - self.baseY)
      * Math.min(1, dt * speed * VERTICAL_DRIFT_FACTOR / Math.max(1, span * 0.1));

    return {
      ...self,
      x,
      baseY: Math.min(band.bottom, Math.max(band.top, baseY)),
      vx: (x - self.x) / (dt || 1),
      vy: (baseY - self.baseY) / (dt || 1),
      driftDirection: direction,
      driftElapsed: elapsed,
      blocked: false,
      stalled: false,
    };
  }

  const api = {
    getSkyArea,
    flyableBand,
    findSkySpawn,
    driftFlyer,
    SKY_TOP,
    SKY_BOTTOM,
    SEPARATION_WIDTHS,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Flight = api;
})(typeof window !== 'undefined' ? window : globalThis);
