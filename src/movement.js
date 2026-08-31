(function (root) {
  const VERTICAL_SPEED_FACTOR = 0.55;
  // 閃避時的轉向扇形（度）。由小到大試，讓角色盡量貼著原本的方向繞過去，
  // 一路試到 180°（原路折返），死路裡的角色才有退路。
  //
  // 誠實說明它的份量：真正解掉「整場凍住」的是下面三件事——認定繞行方向、
  // 要求實際位移、以及 stalled 訊號。扇形本身是防禦縱深。實測 4000 組隨機
  // 單角色場景找不到任何一組「只有 ±90° 會卡住、完整扇形走得出去」；20 組
  // 解析度×seed 的整場掃描裡，兩者的差異也是隨場景互有高低的雜訊。
  // 留著是因為可行走區的障礙是照背景圖量出來的，換背景就會變，多幾個角度
  // 對沒測過的地形比較耐撞；但不要宣稱是它修好了凍結。
  const AVOID_TURN_ANGLES = [15, 30, 45, 60, 90, 120, 150, 180];
  // 規格要求的「優先減速」用的速率。
  const AVOID_SLOW_SCALE = 0.2;
  // 威脅解除後認定方向再保留這麼久（秒），避免在障礙轉角處反覆換邊。
  const AVOID_COMMIT_SECONDS = 1.5;
  // 一個方向要算「走得動」，實際位移至少要有預期位移的這個比例。
  // 低於這個比例代表位移被邊界 clamp 吃掉了，換下一個方向。
  const MIN_PROGRESS_FRACTION = 0.5;
  const COLLISION_EPSILON = 1e-12;

  // 地面足跡的寬度相對角色可見寬度的比例（腳站的範圍比整個人窄）。
  const FOOTPRINT_WIDTH_FACTOR = 0.42;
  // 地面上的圓在 2.5D 俯角下被壓扁的比例。
  //
  // 試過拉到 0.7 想讓垂直方向拉開一點，但可行走區的高度有限，垂直間距一變大
  // 容量就從 15 位掉到 6 位，直接違反規格。畫面上看到的「疊成一柱」其實是
  // findSafeSpawn 把角色都放在同一條邊緣線上造成的，不是壓扁比例的問題——
  // 角色開始漫遊後就會散開。所以這裡維持 0.4。
  const GROUND_PERSPECTIVE = 0.4;

  // 復位搜尋（recoverSafePosition）的有限搜尋空間定義。
  // 步長取角色安全橢圓短半徑的一半：夠細，鑽得過只有角色寬度的縫隙。
  const RECOVERY_STEP_FACTOR = 0.5;
  // 步長下限，避免極小角色算出趨近 0 的步長讓網格爆炸。抬升時兩軸等比，
  // 上限則交給節點預算與 RECOVERY_ABSOLUTE_MAX_STEP，不另設固定天花板——
  // 固定天花板會在大角色上把兩軸比例夾歪。
  const RECOVERY_MIN_STEP = 6;
  // 節點預算。復位是在動畫 frame 內同步跑的，必須有上限；超過就讓步長變粗，
  // 而不是讓搜尋無限展開。
  const RECOVERY_MAX_NODES = 6000;
  // 步長放粗的絕對上限。沒有這個上限，極端輸入（例如面積大到 nodeCount 永遠超標）
  // 會讓放粗迴圈跑不完。到頂之後就接受節點數超標，讓 BFS 自己被 nodeCount 收斂。
  const RECOVERY_ABSOLUTE_MAX_STEP = 4096;
  const NEIGHBOR_OFFSETS = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ];

  function finite(value) {
    return Number.isFinite(value);
  }

  function getWalkableArea(width, height) {
    if (!finite(width) || width <= 0 || !finite(height) || height <= 0) {
      throw new RangeError('width and height must be finite positive numbers');
    }

    // 這些比例是照 assets/backgrounds/bible-world.png 量出來的，換背景圖要重量。
    //
    // top 取 0.60 而不是更高：0.45 那條線在插畫裡已經是遠處的山丘與城鎮，
    // 角色站上去會變成「站在山上的巨人」，透視完全不對。0.60 才是近景草地的起點。
    return {
      left: width * 0.04,
      right: width * 0.96,
      top: height * 0.60,
      bottom: height * 0.93,
      obstacles: [
        // 河流：從右上斜切到中央，用兩塊矩形近似它在草地帶內的部分
        { x: width * 0.60, y: height * 0.58, width: width * 0.10, height: height * 0.16 },
        { x: width * 0.63, y: height * 0.70, width: width * 0.14, height: height * 0.14 },
        // 前景的兩棵大橄欖樹樹幹：角色不但不該穿過，還會被錯誤地畫在樹前面
        { x: width * 0.05, y: height * 0.62, width: width * 0.11, height: height * 0.30 },
        { x: width * 0.88, y: height * 0.62, width: width * 0.10, height: height * 0.30 },
      ],
    };
  }

  // 角色的碰撞範圍是**腳下的地面足跡**，不是整個人形。
  //
  // 這是 2.5D 場景的標準做法：角色站在地面上，會不會撞在一起取決於腳踩的位置，
  // 而不是上半身在畫面上有沒有重疊——不同景深的角色本來就會前後遮擋，那是景深，
  // 不是碰撞。用整個人形當碰撞範圍會讓可行走區一排只容得下約 10 位角色，
  // 規格要求的 15 位永遠達不到。
  //
  // 地面上的圓形足跡在 2.5D 俯角下看起來是壓扁的橢圓，所以 radiusY 由 radiusX
  // 乘上透視壓縮比得到，而不是由角色身高得到。
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
    const radiusX = character.width * FOOTPRINT_WIDTH_FACTOR + gap;
    return {
      centerX: character.x,
      centerY: character.baseY,
      radiusX,
      radiusY: radiusX * GROUND_PERSPECTIVE,
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

    // 兩軸都以「足跡整個在可行走區內」為準。改用地面足跡之後橢圓就是以 baseY
    // 為中心，若 y 軸只比 baseY 而不算 radiusY，足跡會凸出上下緣——凸進河流或
    // 畫面外——而 x 軸卻有 radiusX 邊距，兩軸語意不一致。
    if (
      space.centerX - space.radiusX < area.left
      || space.centerX + space.radiusX > area.right
      || space.centerY - space.radiusY < area.top
      || space.centerY + space.radiusY > area.bottom
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
    // 足跡整個要在區內，所以 y 也要內縮一個 radiusY——直接用 area.bottom 當出生點，
    // 足跡會凸出下緣而永遠判為不安全，那條邊緣就等於白試。
    const minY = area.top + dimensions.radiusY;
    const maxY = area.bottom - dimensions.radiusY;
    const spanY = Math.max(0, maxY - minY);

    // 入口取「靠近邊緣的一條帶」，不是邊界上的單一條線。
    //
    // 只取單一條線的話，只要有障礙剛好壓在那條線上（例如前景樹幹貼著畫面左右緣），
    // 那一整條邊的入口就 100% 失效——實測左右緣各 0/401 個位置可用，於是場上
    // 永遠湊不滿 15 位，而且舊角色被淘汰後新角色補不進來，人數只會愈來愈少。
    const spanX = Math.max(0, maxX - minX);
    const edgeBandX = Math.min(spanX * 0.25, dimensions.radiusX * 6);
    const edgeBandY = Math.min(spanY * 0.5, dimensions.radiusY * 6);

    for (let attempt = 0; attempt < 90; attempt++) {
      const along = nextRandom(random);
      const inward = nextRandom(random);
      let x;
      let baseY;
      if (attempt % 3 === 0) {
        x = minX + inward * edgeBandX;
        baseY = minY + along * spanY;
      } else if (attempt % 3 === 1) {
        x = maxX - inward * edgeBandX;
        baseY = minY + along * spanY;
      } else {
        x = minX <= maxX ? minX + along * spanX : (area.left + area.right) / 2;
        baseY = maxY - inward * edgeBandY;
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
    const minY = area.top + dimensions.radiusY;
    const maxY = area.bottom - dimensions.radiusY;
    const others = characters.filter((character) => character !== self);

    for (let attempt = 0; attempt < 60; attempt++) {
      const horizontal = nextRandom(random);
      const vertical = nextRandom(random);
      const targetX = minX <= maxX
        ? minX + horizontal * (maxX - minX)
        : (area.left + area.right) / 2;
      const targetY = minY <= maxY
        ? minY + vertical * (maxY - minY)
        : (area.top + area.bottom) / 2;
      const candidate = { ...self, x: targetX, baseY: targetY };
      if (isSafe(candidate, others, area)) return { targetX, targetY };
    }

    return { targetX: self.x, targetY: self.baseY };
  }

  function clampPosition(character, area) {
    const dimensions = personalSpace(character);
    const minX = area.left + dimensions.radiusX;
    const maxX = area.right - dimensions.radiusX;
    const minY = area.top + dimensions.radiusY;
    const maxY = area.bottom - dimensions.radiusY;
    return {
      x: minX <= maxX
        ? Math.max(minX, Math.min(character.x, maxX))
        : (area.left + area.right) / 2,
      baseY: minY <= maxY
        ? Math.max(minY, Math.min(character.baseY, maxY))
        : (area.top + area.bottom) / 2,
    };
  }

  // 沿線取樣的間距，路徑檢查與復位搜尋共用同一條規則——這是**一條**規格，
  // 抄成兩份就會各自漂移。必須明顯小於足跡的**短軸直徑**，否則整個足跡可能從
  // 兩個取樣點之間穿過去，薄牆就擋不住了。0.45 半徑 = 0.225 直徑，有四倍餘裕。
  function segmentSampleStep(dimensions) {
    return Math.max(1, Math.min(dimensions.radiusX, dimensions.radiusY) * 0.45);
  }

  function pathIsSafe(self, others, area, endX, endY) {
    const distance = Math.hypot(endX - self.x, endY - self.baseY);
    const dimensions = personalSpace(self);
    const steps = Math.max(1, Math.ceil(distance / segmentSampleStep(dimensions)));

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

  // 復位途中「不准碰到」的東西。
  //
  // 從 anchor 出發時就已經重疊的角色與障礙要排除掉——卡在障礙裡的角色本來就得先從
  // 裡面走出來，把它們算成阻擋等於宣告永遠無解。其餘的角色與障礙一律不得穿越。
  // 角色在復位期間不會移動，所以這裡先把要比對的橢圓算好，避免熱迴圈重複配置。
  function recoveryGuards(anchor, self, others, area) {
    const anchorSpace = personalSpace({ ...self, x: anchor.x, baseY: anchor.baseY });
    return {
      characterSpaces: others
        .map(personalSpace)
        .filter((space) => !spacesOverlap(anchorSpace, space)),
      obstacles: area.obstacles.filter((obstacle) => !hitsObstacle(anchorSpace, obstacle)),
    };
  }

  // 逐段取樣檢查一條直線位移，確認它沒有碰到 guards 裡的任何角色或障礙。
  function segmentIsClear(from, to, self, dimensions, guards) {
    const distance = Math.hypot(to.x - from.x, to.baseY - from.baseY);
    const stepLength = segmentSampleStep(dimensions);
    const steps = Math.max(1, Math.ceil(distance / stepLength));

    for (let step = 1; step <= steps; step++) {
      const portion = step / steps;
      const space = personalSpace({
        ...self,
        x: from.x + (to.x - from.x) * portion,
        baseY: from.baseY + (to.baseY - from.baseY) * portion,
      });
      if (guards.characterSpaces.some((other) => spacesOverlap(space, other))) return false;
      if (guards.obstacles.some((obstacle) => hitsObstacle(space, obstacle))) return false;
    }
    return true;
  }

  // 復位搜尋的有限搜尋空間：解析度（步長）與網格座標範圍。
  //
  // 步長由角色安全橢圓的短半徑決定——要比角色本身細，才鑽得過只有角色寬度的縫隙。
  // 但整個網格的節點數必須落在 RECOVERY_MAX_NODES 以內：復位是在動畫 frame 內同步
  // 跑完的，大畫面配上很小的角色會讓節點數爆炸，此時寧可把步長放粗。
  //
  // 這裡回傳的 nodeCount 是**實際會走到的網格大小**（含邊界外那一圈 margin），
  // BFS 直接拿它當上限，所以「窮盡整個搜尋空間」是真的窮盡，不會在還沒走完時
  // 就被一個對不上的預算數字切斷。
  // 步長分 X／Y 兩軸。地面足跡是壓扁的橢圓（寬遠大於高），用單一步長會顧此失彼：
  // 取寬的那軸會粗到跨過上下的窄縫，取高的那軸則讓水平方向的節點數暴增。
  // 兩軸各自對應自己的半徑，網格形狀才跟角色形狀一致。
  function recoveryGrid(self, area, anchor) {
    const dimensions = personalSpace(self);
    let stepX = dimensions.radiusX * RECOVERY_STEP_FACTOR;
    let stepY = dimensions.radiusY * RECOVERY_STEP_FACTOR;

    // 抬到最小步長之上時**兩軸等比**抬——只夾單軸會把網格形狀弄歪，
    // 導致小角色的垂直步長反而比自己的足跡還粗。
    const smallest = Math.min(stepX, stepY);
    if (smallest > 0 && smallest < RECOVERY_MIN_STEP) {
      const lift = RECOVERY_MIN_STEP / smallest;
      stepX *= lift;
      stepY *= lift;
    }

    // 網格多留一圈（-1 / +1），讓 clamp 後的邊界位置也走得到。
    const boundsFor = (sx, sy) => {
      const minGx = Math.ceil((area.left - anchor.x) / sx) - 1;
      const maxGx = Math.floor((area.right - anchor.x) / sx) + 1;
      const minGy = Math.ceil((area.top - anchor.baseY) / sy) - 1;
      const maxGy = Math.floor((area.bottom - anchor.baseY) / sy) + 1;
      return {
        minGx, maxGx, minGy, maxGy,
        nodeCount: (maxGx - minGx + 1) * (maxGy - minGy + 1),
      };
    };

    // 超出預算時兩軸等比放粗，維持網格與角色的形狀比例。
    // 上限也要等比套用：只夾住先觸頂的那一軸，另一軸會繼續長，比例就跑掉了。
    let bounds = boundsFor(stepX, stepY);
    while (
      bounds.nodeCount > RECOVERY_MAX_NODES
      && Math.max(stepX, stepY) < RECOVERY_ABSOLUTE_MAX_STEP
    ) {
      const largest = Math.max(stepX, stepY);
      const growth = Math.min(1.25, RECOVERY_ABSOLUTE_MAX_STEP / largest);
      if (growth <= 1) break;
      stepX *= growth;
      stepY *= growth;
      bounds = boundsFor(stepX, stepY);
    }

    return { stepX, stepY, ...bounds };
  }

  // 有限解析度的 8-neighbor BFS。
  //
  // 語意（重要）：`blocked: true` 的意思是「在這個網格解析度下，沒有一條不穿越其他
  // 角色或障礙的路徑可以走到安全節點」，**不是**數學上證明連續空間中不存在安全點。
  // 連續空間的不存在性無法用有限搜尋證明；規格與測試都以此解析度為準。
  function recoverSafePosition(self, others, area) {
    const anchor = clampPosition(self, area);
    const resultAt = (position) => ({
      ...self,
      x: position.x,
      baseY: position.baseY,
      vx: 0,
      vy: 0,
      blocked: false,
    });
    if (isSafe({ ...self, x: anchor.x, baseY: anchor.baseY }, others, area)) return resultAt(anchor);

    const guards = recoveryGuards(anchor, self, others, area);
    const dimensions = personalSpace(self);
    // 網格座標的有限範圍：涵蓋整個可行走區域。沒有這個界線，BFS 會往區域外無限展開，
    // 而那些格子 clamp 後全部擠在同一批邊界點上，白白吃掉預算、漏掉區域內真正的安全點。
    const { stepX, stepY, minGx, maxGx, minGy, maxGy, nodeCount } = recoveryGrid(self, area, anchor);
    const positionAt = (gx, gy) => clampPosition({
      ...self,
      x: anchor.x + gx * stepX,
      baseY: anchor.baseY + gy * stepY,
    }, area);

    // 以網格座標去重（不是以 clamp 後的位置），確保邊界格仍能各自往外展開。
    const visited = new Set(['0,0']);
    let frontier = [{ gx: 0, gy: 0, position: anchor }];
    let expanded = 0;

    while (frontier.length > 0 && expanded <= nodeCount) {
      const nextFrontier = [];
      let best = null;

      for (const node of frontier) {
        expanded++;
        for (const [dx, dy] of NEIGHBOR_OFFSETS) {
          const gx = node.gx + dx;
          const gy = node.gy + dy;
          if (gx < minGx || gx > maxGx || gy < minGy || gy > maxGy) continue;
          const key = `${gx},${gy}`;
          if (visited.has(key)) continue;

          const position = positionAt(gx, gy);
          // 只有「這條邊真的走得過去」才算拜訪過。若在驗證前就標記 visited，
          // 一個先被擋住的邊會把該節點連同它後面整片區域永久丟掉——即使稍後
          // 有另一條合法的邊走得到它。
          //
          // 注意：這是**防禦性不變式，目前量測不到行為差異**。把這兩行對調後，
          // 55,000 個隨機場景（含障礙與角色、各種尺寸）沒有任何一個的結果不同，
          // 連回傳位置都一樣——因為 8-connectivity 提供了足夠多的平行路徑，
          // 丟掉單一節點幾乎不會切斷搜尋。所以沒有測試守得住這個順序。
          // 但它在原理上仍然是錯的（節點被丟了就不再考慮），改動 neighbor 順序
          // 或連通度時就可能浮現，成本又是零，因此保持正確的寫法。
          if (!segmentIsClear(node.position, position, self, dimensions, guards)) continue;
          visited.add(key);

          if (isSafe({ ...self, x: position.x, baseY: position.baseY }, others, area)) {
            // 同一層裡挑歐氏距離最近的，復位才不會無謂地跳很遠。
            const distance = Math.hypot(position.x - anchor.x, position.baseY - anchor.baseY);
            if (!best || distance < best.distance) best = { position, distance };
          } else {
            nextFrontier.push({ gx, gy, position });
          }
        }
      }

      if (best) return resultAt(best.position);
      frontier = nextFrontier;
    }

    return { ...resultAt(anchor), blocked: true };
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
    if (!isSafe(self, others, area)) return recoverSafePosition(self, others, area);
    if (dt === 0) {
      return { ...self, x: self.x, baseY: self.baseY, vx: 0, vy: 0, blocked: false };
    }

    const dx = self.targetX - self.x;
    const dy = self.targetY - self.baseY;
    const distance = Math.hypot(dx, dy);
    if (distance === 0) {
      return { ...self, x: self.x, baseY: self.baseY, vx: 0, vy: 0, blocked: false };
    }

    // 速度一律由「單位方向 + 速率」組出來，不要直接旋轉速度向量：vy 帶著
    // VERTICAL_SPEED_FACTOR 的壓縮，旋轉速度向量會把這個各向異性攪亂，
    // 轉出來的方向就不是想要的那個角度了。
    const dirX = dx / distance;
    const dirY = dy / distance;
    const velocityAlong = (ux, uy, speedScale) => ({
      vx: ux * self.cruiseSpeed * speedScale,
      vy: uy * self.cruiseSpeed * VERTICAL_SPEED_FACTOR * speedScale,
    });

    const desired = velocityAlong(dirX, dirY, 1);
    const lookAhead = Math.max(dt, 0.75);
    const predicted = clampPosition({
      ...self,
      x: self.x + desired.vx * lookAhead,
      baseY: self.baseY + desired.vy * lookAhead,
    }, area);
    const threatened = !pathIsSafe(self, others, area, predicted.x, predicted.baseY);
    const threat = threatened ? threatDirection(self, others, area, predicted.x, predicted.baseY) : null;

    // 繞行要**認定一個絕對方向並走一段**，不能每一幀重算。
    //
    // 只記「往哪一邊繞」是不夠的。角色被擠到貼著障礙側面時，扇形裡那兩個
    // ±90° 的選項都是相對**目標方向**旋轉出來的，不是相對障礙表面，所以兩個
    // 都還帶著一點指向障礙的分量。於是 +1 那個把角色推進牆裡（不安全）、
    // -1 那個往外一點（安全），下一幀角色退開了一點 +1 又變安全——就成了
    // 兩幀極限環：實測 x 釘在 333.1、y 在 619.54 與 620.45 之間來回，
    // 側別自始至終都是 1，跑十秒完全沒繞過去。
    //
    // 記住選定的那個**絕對單位方向**並優先沿用，角色才會沿直線走出一段
    // 足以脫離障礙的位移，而不是在原地抖。
    const heading = finite(self.avoidHeadingX) && finite(self.avoidHeadingY)
      ? { ux: self.avoidHeadingX, uy: self.avoidHeadingY, scale: self.avoidScale }
      : null;
    let avoidHold = Math.max(0, (finite(self.avoidHold) ? self.avoidHold : 0) - dt);

    const options = [];
    if (threatened) {
      // 認定中的繞行方向優先沿用，而且**不設時限**：只要還在閃避、而且這個方向
      // 還走得通，就一直走下去。設 1.5 秒時限試過，繞不完一個 200px 高的障礙就
      // 到期重挑，角色會在障礙前面來回遊走十秒也過不去。改由「方向本身走不通」
      // 或「不再需要閃避」來結束認定，才是真的沿著障礙走過去。
      if (heading && finite(heading.scale)) {
        options.push({ ...velocityAlong(heading.ux, heading.uy, heading.scale), ...heading });
      }

      // 規格：「優先減速，其次改變方向」。減速排在轉向之前——但只有在
      // 「減速真的解得開」時才算數：拿整個 look-ahead 區間去驗，而不是只驗
      // 這一幀那 0.33px 的一小步。只驗一小步的話，角色會用 0.2 倍速一路蹭到
      // 貼著障礙為止，那不是減速禮讓，那是慢動作撞牆。
      const slow = velocityAlong(dirX, dirY, AVOID_SLOW_SCALE);
      const slowAhead = clampPosition({
        ...self,
        x: self.x + slow.vx * lookAhead,
        baseY: self.baseY + slow.vy * lookAhead,
      }, area);
      if (pathIsSafe(self, others, area, slowAhead.x, slowAhead.baseY)) {
        options.push({ ...slow, ux: dirX, uy: dirY, scale: AVOID_SLOW_SCALE, fresh: true });
      }

      // 轉向扇形，由小角度往大角度試，角色才會盡量沿著原本要去的方向繞過去。
      // 舊版只有固定的 ±90° 兩條支線；三條路（目標方向與兩條垂直線）同時被擋住
      // 時就沒有別的選擇，只能停下來——而輸入每一幀都一樣，所以是**永久**停住。
      // 實測一位沒有鄰居的角色在 36 個取樣方向中有 19 個可走的情況下照樣凍結，
      // 整場 15 位最後全部靜止、30 秒總位移 0.000px。
      const cross = threat ? desired.vx * threat.y - desired.vy * threat.x : 0;
      const firstSide = cross > 0 ? -1 : 1;
      for (const degrees of AVOID_TURN_ANGLES) {
        for (const side of [firstSide, -firstSide]) {
          const radians = (degrees * Math.PI / 180) * side;
          const cos = Math.cos(radians);
          const sin = Math.sin(radians);
          const ux = dirX * cos - dirY * sin;
          const uy = dirX * sin + dirY * cos;
          options.push({ ...velocityAlong(ux, uy, 1), ux, uy, scale: 1, fresh: true });
        }
      }
    } else {
      options.push(desired);
    }
    options.push({ vx: 0, vy: 0, stop: true });

    for (const velocity of options) {
      const unclamped = {
        ...self,
        x: self.x + velocity.vx * dt,
        baseY: self.baseY + velocity.vy * dt,
      };
      const position = clampPosition(unclamped, area);
      if (!pathIsSafe(self, others, area, position.x, position.baseY)) continue;

      // 一個方向「安全」還不夠，得真的走得動。方向指向可行走區邊界時 clamp 會把
      // 位移吃掉，結果是安全的、也不等於原位（差在浮點尾數），角色卻幾乎沒動：
      // 實測認定方向是正上方 (-0.02, -1.00) 的角色貼在上緣，十秒只走了 11.9px，
      // 每一幀都「有移動」所以停滯也偵測不到。要求實際位移至少是預期的一半，
      // 走不動的方向就會被跳過，換扇形裡下一個真的走得出去的方向。
      const intended = Math.hypot(velocity.vx * dt, velocity.vy * dt);
      const achieved = Math.hypot(position.x - self.x, position.baseY - self.baseY);
      if (intended > 0 && achieved < intended * MIN_PROGRESS_FRACTION) continue;
      // 沿用認定方向時 hold 繼續遞減；重新挑到一個方向時才補滿計時。
      // 沒在繞行（一路暢通或停住）就把認定清掉。
      // 選到閃避方向就記住它。沒在閃避（一路暢通）時不要馬上忘掉——威脅常常
      // 只是短暫消失一兩幀，立刻清掉會讓角色在障礙的轉角處反覆換邊。
      // 留 AVOID_COMMIT_SECONDS 的餘裕，過了才真的放掉。
      const chosenAvoid = finite(velocity.ux) && finite(velocity.uy);
      const keepPrevious = !chosenAvoid && heading !== null && avoidHold > 0;
      return {
        ...self,
        x: position.x,
        baseY: position.baseY,
        vx: (position.x - self.x) / dt,
        vy: (position.baseY - self.baseY) / dt,
        blocked: false,
        avoidHeadingX: chosenAvoid ? velocity.ux : (keepPrevious ? heading.ux : undefined),
        avoidHeadingY: chosenAvoid ? velocity.uy : (keepPrevious ? heading.uy : undefined),
        avoidScale: chosenAvoid ? velocity.scale : (keepPrevious ? heading.scale : undefined),
        avoidHold: chosenAvoid ? AVOID_COMMIT_SECONDS : (keepPrevious ? avoidHold : 0),
        // 扇形搜尋讓凍結變得很少見，但不可能保證絕不發生（角色可能安全地卡在
        // 一個所有方向都被擋住的口袋裡）。stalled 就是給整合層的訊號：這一位
        // 走不動了，換一個目標再試。這跟 blocked 是不同的事——blocked 是
        // 「找不到任何安全點」，stalled 的角色本身是安全的，只是去不了目標。
        stalled: velocity.stop === true,
      };
    }

    return recoverSafePosition(self, others, area);
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
    // 以下匯出給測試釘住規格明文要求的性質；正式流程不需要直接呼叫。
    recoveryGrid,
    segmentSampleStep,
    NEIGHBOR_OFFSETS,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Movement = api;
})(typeof window !== 'undefined' ? window : globalThis);
