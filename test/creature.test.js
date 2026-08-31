const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  Creature,
  motionOffset,
  walkPose,
  groundedMotionOffset,
  transitionOpacity,
  displaySize,
  depthScaleForY,
  gesturePose,
  drawCharacterName,
} = require('../src/creature.js');
const { getSpecies } = require('../src/species.js');

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
  const calls = { scale: [], fillText: [], drawImage: 0 };
  const ctx = {
    globalAlpha: 1, fillStyle: '', strokeStyle: '', font: '', textAlign: '',
    textBaseline: '', lineWidth: 0,
    save() {}, restore() {}, translate() {}, rotate() {},
    beginPath() {}, ellipse() {}, fill() {}, strokeText() {},
    drawImage() { calls.drawImage++; },
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

test('畫面上只寫人物名稱，不含動作文字', () => {
  const { ctx, calls } = recordingCtx();
  const creature = makeCreature({ spawn: { x: 400, baseY: 700 } });
  creature.opacity = 1;
  creature.currentGesture = 'wave';

  creature.draw(ctx, 0.2);

  assert.deepEqual(calls.fillText, ['挪亞'], '正在揮手時畫出來的仍然只有名字');
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

test('顯示尺寸依裁切後可見圖片計算，且人物高度足以辨識塗色', () => {
  // 直式與橫式的原稿都要換算到同一個目標高度，不因原稿比例而忽大忽小。
  assert.deepEqual(displaySize({ width: 210, height: 420 }, 1600, 900, 1), { width: 152, height: 304 });
  assert.deepEqual(displaySize({ width: 420, height: 210 }, 1600, 900, 1), { width: 608, height: 304 });
  // 高度至少要有場景高度的 24%，小朋友才看得清楚自己畫的細節
  assert.ok(displaySize({ width: 210, height: 420 }, 1600, 900, 1).height >= 900 * 0.24);
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

test('角色標籤只畫人物名稱，不含任何動作文字', () => {
  const labels = [];
  const ctx = {
    save() {}, restore() {}, strokeText() {},
    fillText(text) { labels.push(text); },
  };
  drawCharacterName(ctx, '大衛', 100, 200, 24, 1);
  assert.deepEqual(labels, ['大衛']);

  // 即使角色正在揮手，畫出來的仍然只有名字
  labels.length = 0;
  drawCharacterName(ctx, '天使', 10, 20, 18, 0.5);
  assert.deepEqual(labels, ['天使']);
});

test('自然踏步時左右腿角度相反，半個週期後交換前後腳', () => {
  const a = walkPose(0.25, { freq: Math.PI * 2, phase: 0, maxAngle: 0.1 });
  const b = walkPose(0.75, { freq: Math.PI * 2, phase: 0, maxAngle: 0.1 });
  assert.equal(a.leftAngle, -a.rightAngle);
  assert.equal(b.leftAngle, -b.rightAngle);
  assert.ok(a.leftFront);
  assert.ok(!b.leftFront);
  assert.ok(a.leftAngle > 0 && b.leftAngle < 0);
});
