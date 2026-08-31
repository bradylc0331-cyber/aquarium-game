const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  Creature,
  motionOffset,
  groundedMotionOffset,
  transitionOpacity,
  displaySize,
  depthScaleForY,
  gesturePose,
} = require('../src/creature.js');
const { getSpecies } = require('../src/species.js');
const Movement = require('../src/movement.js');

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

test('未知樣式會退回 fish', () => {
  const off = motionOffset('not-a-real-style', 1, { amplitude: 10, freq: 1, phase: 0 });
  const fishOff = motionOffset('fish', 1, { amplitude: 10, freq: 1, phase: 0 });
  assert.equal(off.yOffset, fishOff.yOffset);
});

function recordingCtx() {
  const calls = { scale: [], translate: [], fillText: [], strokeText: [], drawImage: 0, images: [] };
  const ctx = {
    globalAlpha: 1, fillStyle: '', strokeStyle: '', font: '', textAlign: '',
    textBaseline: '', lineWidth: 0,
    save() {}, restore() {}, translate(x, y) { calls.translate.push([x, y]); }, rotate() {},
    beginPath() {}, ellipse() {}, fill() {},
    strokeText(text) { calls.strokeText.push(text); },
    drawImage(...args) { calls.drawImage++; calls.images.push(args); },
    fillText(text) { calls.fillText.push(text); },
    scale(x, y) { calls.scale.push([x, y]); },
  };
  return { ctx, calls };
}

function makeCreature(overrides = {}) {
  const species = getSpecies('noah');
  return new Creature({
    artworkId: 'a1',
    image: { width: 220, height: 400 },
    species,
    canvasWidth: 1600,
    canvasHeight: 900,
    ...overrides,
  });
}

test('noFlip 人物向左移動時仍維持正向比例，不會被鏡射', () => {
  const { ctx, calls } = recordingCtx();
  const creature = makeCreature({ spawn: { x: 400, baseY: 700 } });
  creature.vx = -20;
  creature.opacity = 1;

  creature.draw(ctx, 0);

  assert.ok(calls.scale.length > 0);
  assert.ok(calls.scale[0][0] > 0, 'noFlip 人物向左移動時仍應維持正向比例');
});

test('地面角色整段動畫期間腳底完全不移動', () => {
  const creature = makeCreature({ spawn: { x: 400, baseY: 700 } });
  const baseYBefore = creature.baseY;

  // 走過一整段時間，包含招呼手勢播放與結束
  for (let t = 0; t < 3; t += 1 / 60) {
    creature.updateVisual(1 / 60);
    const { ctx } = recordingCtx();
    creature.draw(ctx, t);
    assert.equal(creature.baseY, baseYBefore, `t=${t.toFixed(2)} 時腳底位置被改動了`);
  }
});

test('進場後角色會播放一次招呼動作，然後停下來等下一次偶發動作', () => {
  const creature = makeCreature({ spawn: { x: 400, baseY: 700 } });
  assert.ok(creature.currentGesture, '新角色進場時應該帶著招呼動作');

  for (let i = 0; i < 100; i++) creature.updateVisual(1 / 60); // 約 1.67 秒
  assert.equal(creature.currentGesture, null, '招呼播完就該停下，不是一直揮手');
  assert.ok(creature.nextGestureAt > 0, '應該排定下一次偶發動作');
});

test('畫面上完全不寫字：角色本身就是畫面，名字留在孩子的圖畫紙上', () => {
  // 決定：螢幕上不顯示人物名稱。孩子會把自己的圖畫紙帶回去，名字在紙上；
  // 螢幕擠到 15 位時名字會互相遮擋（實測大衛的名字被但以理蓋掉、挪亞完全看不到），
  // 拿掉之後畫面乾淨，也不會有半截字。
  const { ctx, calls } = recordingCtx();
  const creature = makeCreature({ spawn: { x: 400, baseY: 700 } });
  creature.opacity = 1;

  // 待機與揮手兩種狀態都不能寫字
  creature.draw(ctx, 0);
  creature.gestureElapsed = 0;
  creature.gesture = 'wave';
  creature.draw(ctx, 0.4);

  assert.deepEqual(calls.fillText, [], `畫面上不應該有任何文字，實際畫了 ${JSON.stringify(calls.fillText)}`);
  assert.deepEqual(calls.strokeText, [], `也不應該有描邊文字，實際 ${JSON.stringify(calls.strokeText)}`);
});

test('進場淡入期間 opacity 從 0 升到 1，退場則降回 0', () => {
  const creature = makeCreature({ spawn: { x: 400, baseY: 700 } });
  assert.equal(creature.opacity, 0);
  creature.updateVisual(0.2);
  assert.ok(creature.opacity > 0 && creature.opacity < 1);
  creature.updateVisual(0.3);
  assert.equal(creature.opacity, 1);
  assert.equal(creature.state, 'active');

  creature.setTransition('exiting');
  creature.updateVisual(0.2);
  assert.ok(creature.opacity > 0 && creature.opacity < 1);
  creature.updateVisual(0.3);
  assert.equal(creature.opacity, 0);
});

test('每一位聖經人物都有手臂關節與招呼動作，且不影響列印線稿', () => {
  const { SPECIES } = require('../src/species.js');
  for (const species of SPECIES) {
    assert.ok(species.swim.gesture, `${species.id} 缺少招呼動作`);
    assert.ok(species.swim.rig && species.swim.rig.leftArm && species.swim.rig.rightArm,
      `${species.id} 缺少手臂關節資料`);
    for (const arm of [species.swim.rig.leftArm, species.swim.rig.rightArm]) {
      for (const key of ['x', 'y', 'width', 'height', 'pivotX', 'pivotY']) {
        assert.ok(arm[key] >= 0 && arm[key] <= 1, `${species.id} 的 ${key} 應是 0~1 的比例`);
      }
    }
    // 關節資料掛在 swim 上，不碰 shapes——列印線稿與掃描遮罩完全不受影響
    assert.ok(Array.isArray(species.shapes) && species.shapes.length > 0);
  }
});

test('地面人物走路時腳底完全不產生垂直位移', () => {
  // 規格：地面角色雙腳貼地，不使用整體上下抖動模擬走路。
  // 腳底位移必須是「剛好 0」，不是「很小」——只要不是 0，長時間看就是整張紙在震。
  for (let t = 0; t < 5; t += 0.05) {
    const off = groundedMotionOffset(t, { freq: 6, phase: 0.4 });
    assert.equal(off.footYOffset, 0);
    assert.ok(Math.abs(off.rotation) <= 0.012);
    assert.ok(off.turnScaleX >= 0.94 && off.turnScaleX <= 1.0);
  }
});

test('地面角色的動態來自 2.5D 縮放擺動，不是上下抖動', () => {
  // 腿部關節旋轉已經拿掉：掃描稿沒有乾淨的腿部分界，切開再轉會讓腳分岔。
  // 動態改由整體縱向縮放提供，錨點在腳底，所以 footYOffset 仍然恆為 0。
  let min = Infinity, max = -Infinity, sum = 0, n = 0;
  for (let t = 0; t < 4; t += 0.01) {
    const off = groundedMotionOffset(t, { freq: 6, phase: 0.4 });
    assert.equal(off.footYOffset, 0);
    min = Math.min(min, off.swayScaleY);
    max = Math.max(max, off.swayScaleY);
    sum += off.swayScaleY;
    n++;
  }
  assert.ok(max - min > 0.02, `擺動幅度只有 ${(max - min).toFixed(4)}，畫面上看不出角色在動`);
  assert.ok(min >= 0.95 && max <= 1.05, `擺動超出合理範圍 ${min}~${max}，紙偶會像在抽搐`);
  assert.ok(Math.abs(sum / n - 1) < 0.01, '擺動平均值要接近 1，否則角色整體會偏高或偏矮');
});

test('地面角色的身體一次畫完，不再切成腿部切片各自旋轉', () => {
  // 這是拿掉走路動畫的核心理由：孩子畫的腿沒有乾淨的左右分界，
  // 在 legTop 以下切兩塊各自旋轉，腳看起來會分岔。
  const { ctx, calls } = recordingCtx();
  const creature = makeCreature({ spawn: { x: 400, baseY: 700 } });
  creature.opacity = 1;
  creature.currentGesture = null; // 手臂不動，只看身體怎麼畫
  creature.draw(ctx, 0.3);

  // 紙張厚度兩層 + 身體本體一次 = 3 次繪製，不該再出現局部切片
  assert.equal(calls.images.length, 3, `身體應該一次畫完，實際畫了 ${calls.images.length} 次`);
  for (const args of calls.images) {
    assert.equal(args.length, 5,
      `不該再有取局部來源矩形的切片繪製：${JSON.stringify(args.slice(1))}`);
  }
});

test('地面角色縮放擺動時，腳底仍然牢牢釘在 baseY', () => {
  // 縮放的錨點是角色中心，所以垂直位置必須跟著 swayScaleY 一起換算；
  // 少了這一步，角色會隨著擺動一下離地、一下陷進草裡。
  const creature = makeCreature({ spawn: { x: 400, baseY: 700 } });
  creature.opacity = 1;
  for (let t = 0; t < 2; t += 1 / 60) {
    const { ctx, calls } = recordingCtx();
    creature.draw(ctx, t);
    const translateY = calls.translate[0][1];
    const scaleY = calls.scale[0][1];
    const footY = translateY + (creature.renderHeight / 2) * scaleY;
    assert.ok(Math.abs(footY - creature.baseY) < 0.001,
      `t=${t.toFixed(2)} 腳底畫在 ${footY}，應該貼在 ${creature.baseY}`);
  }
});

test('顯示尺寸依裁切後可見圖片計算，且人物高度足以辨識塗色', () => {
  // 直式與橫式的原稿都要換算到同一個目標高度，不因原稿比例而忽大忽小。
  assert.deepEqual(displaySize({ width: 210, height: 420 }, 1600, 900, 1), { width: 117, height: 234 });
  assert.deepEqual(displaySize({ width: 420, height: 210 }, 1600, 900, 1), { width: 468, height: 234 });
  // 高度至少要有場景高度的 24%，小朋友才看得清楚自己畫的細節。
  // 上限也要顧：太大時可行走的草地帶擠不下規格要求的 15 位。
  const height = displaySize({ width: 210, height: 420 }, 1600, 900, 1).height;
  assert.ok(height >= 900 * 0.24, `高度 ${height} 低於場景高度的 24%`);
  assert.ok(height <= 900 * 0.28, `高度 ${height} 過大，草地帶會擠不下 15 位`);
});

test('遠景與近景尺寸維持可辨識的 2.5D 景深範圍', () => {
  assert.equal(depthScaleForY(405, 405, 819), 0.78);
  assert.equal(depthScaleForY(819, 405, 819), 1.05);
  // 中間值要單調遞增，景深才不會忽前忽後
  assert.ok(depthScaleForY(600, 405, 819) > depthScaleForY(500, 405, 819));
  // 超出範圍要夾住，不得外插成負值或爆大
  assert.equal(depthScaleForY(0, 405, 819), 0.78);
  assert.equal(depthScaleForY(9999, 405, 819), 1.05);
});

test('進場與退場透明度不超出 0 到 1', () => {
  assert.equal(transitionOpacity('entering', 0), 0);
  assert.equal(transitionOpacity('entering', 0.4), 1);
  assert.equal(transitionOpacity('entering', 99), 1);
  assert.equal(transitionOpacity('exiting', 0), 1);
  assert.equal(transitionOpacity('exiting', 0.4), 0);
  assert.equal(transitionOpacity('exiting', 99), 0);
  assert.equal(transitionOpacity('active', 5), 1);
});

test('招呼手勢只回傳肢體角度，不改腳底位置', () => {
  const wave = gesturePose('wave', 0.2);
  assert.ok(Math.abs(wave.rightArmAngle) > 0.1);
  assert.equal(wave.footYOffset, 0);

  const raise = gesturePose('raise-hands', 0.2);
  assert.ok(raise.leftArmAngle < 0 && raise.rightArmAngle > 0, '舉手時兩隻手往相反方向抬起');
  assert.equal(raise.footYOffset, 0);

  // 沒有手勢時是中性姿勢，腳底一樣不動
  const none = gesturePose(null, 0.2);
  assert.equal(none.leftArmAngle, 0);
  assert.equal(none.rightArmAngle, 0);
  assert.equal(none.footYOffset, 0);
});



test('setMovement 要把移動層的整包狀態帶回角色，否則繞行認定每幀被丟掉', () => {
  // display.html 是把 Creature 實例直接餵給 steerCharacter 的，所以 steerCharacter
  // 寫在回傳值上的狀態必須經由 setMovement 回到實例上。這裡不逐一列舉欄位——
  // 那樣以後新增欄位一樣會漏。改成比對兩條軌跡：一條走 Creature.setMovement，
  // 一條走純物件展開（測試裡慣用的傳遞方式）。兩者必須完全一致。
  // 正式的可行走區拿掉那兩塊不該存在的河流障礙之後，就是一個沒有內部障礙的
  // 矩形，走直線不會觸發閃避——而不觸發閃避的話，這個測試比對的兩條軌跡
  // 本來就會一樣，等於什麼都沒驗。所以自己放一塊障礙在路中間。
  const base = Movement.getWalkableArea(1600, 900);
  const area = {
    ...base,
    obstacles: [{
      x: (base.left + base.right) / 2 - 60,
      y: base.top,
      width: 120,
      height: (base.bottom - base.top) * 0.6,
    }],
  };
  const creature = makeCreature({ spawn: { x: area.left + 60, baseY: area.bottom - 40 } });
  creature.targetX = area.right - 60;
  creature.targetY = area.top + 40;
  creature.cruiseSpeed = 60;

  let plain = {
    id: 'plain',
    x: creature.x, baseY: creature.baseY,
    width: creature.width, height: creature.height,
    targetX: creature.targetX, targetY: creature.targetY,
    cruiseSpeed: creature.cruiseSpeed, vx: 0, vy: 0,
  };

  const dt = 1 / 60;
  for (let frame = 0; frame < 600; frame++) {
    creature.setMovement(Movement.steerCharacter(creature, [creature], area, dt));
    plain = { ...plain, ...Movement.steerCharacter(plain, [plain], area, dt) };
    assert.ok(
      Math.abs(creature.x - plain.x) < 1e-9 && Math.abs(creature.baseY - plain.baseY) < 1e-9,
      `第 ${frame} 幀分歧：Creature (${creature.x.toFixed(3)}, ${creature.baseY.toFixed(3)})`
        + ` vs 純物件 (${plain.x.toFixed(3)}, ${plain.baseY.toFixed(3)})`,
    );
  }

  // 前提：這一段路真的有觸發繞行，否則兩條軌跡本來就一樣，比對是空的。
  assert.ok(
    Number.isFinite(creature.avoidHeadingX) || Number.isFinite(plain.avoidHeadingX),
    '前提：這條路徑上要真的有進入閃避，測試才有意義',
  );
});
