const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  CANVAS_W, CANVAS_H, WORK_AREA, MARKER_CANONICAL, MARKER_INSET, MARKER_SIZE, QR_AREA, PRINT_MM_PER_PX,
} = require('../src/constants.js');
const { SPECIES } = require('../src/species.js');
const { layoutVerseBand, VERSE_SIZE_MIN, VERSE_SIZE_MAX } = require('../src/printLayout.js');

test('完整校正畫布是 A4 橫式比例，列印寬度為 297mm', () => {
  assert.ok(Math.abs(CANVAS_W / CANVAS_H - 297 / 210) < 0.003);
  assert.ok(Math.abs(CANVAS_W * PRINT_MM_PER_PX - 297) < 0.01);
  assert.ok(Math.abs(CANVAS_H * PRINT_MM_PER_PX - 210) < 0.2);
});

test('四個定位方塊、QR 與 4:3 人物區都完整位於 A4 內', () => {
  const half = MARKER_SIZE / 2;
  for (const [x, y] of Object.values(MARKER_CANONICAL)) {
    assert.ok(x - half >= 0 && x + half <= CANVAS_W);
    assert.ok(y - half >= 0 && y + half <= CANVAS_H);
  }
  assert.ok(QR_AREA.x >= 0 && QR_AREA.y >= 0);
  assert.ok(QR_AREA.x + QR_AREA.size <= CANVAS_W && QR_AREA.y + QR_AREA.size <= CANVAS_H);
  assert.equal((WORK_AREA.x1 - WORK_AREA.x0) / (WORK_AREA.y1 - WORK_AREA.y0), 4 / 3);
  assert.ok(QR_AREA.y + QR_AREA.size < WORK_AREA.y0, 'QR 不可壓到人物塗色區');
});

test('每位人物都有經文與出處，且經文不會壓到下緣的定位方塊', () => {
  // 塗色紙上不再寫「聖經人物塗色紙」——那件事看紙就知道了；改成印出這位人物
  // 最為人熟知的話語，孩子塗色的時候順便看到。
  //
  // 要守的是版面安全：經文印在版面下緣的整寬帶上，而下緣**就是兩個定位方塊
  // 所在的位置**。經文的文字框在垂直方向本來就跟方塊重疊（基線 y=558、字級 17，
  // 文字框約 y 545–562；方塊是 y 520–548），所以擋住它們的只有水平間距。
  // 方塊被蓋到，那張紙就再也掃不出來，而且要列印之後才會發現。
  //
  // 座標一律取自 constants.js 的方塊定義，**不從 layoutVerseBand 自己的回傳值
  // 推導**——拿受測函式的輸出當作標準答案，等於什麼都沒驗。
  const half = MARKER_SIZE / 2;
  const bottomMarkers = [MARKER_CANONICAL.bl, MARKER_CANONICAL.br]
    .map(([x]) => ({ x0: x - half, x1: x + half }));

  const clearsMarkers = (label, band) => {
    const x0 = band.centerX - band.width / 2;
    const x1 = band.centerX + band.width / 2;
    assert.ok(x0 >= 0 && x1 <= CANVAS_W, `${label}：經文超出紙張（${x0.toFixed(0)}~${x1.toFixed(0)}）`);
    for (const marker of bottomMarkers) {
      assert.ok(
        x1 <= marker.x0 || x0 >= marker.x1,
        `${label}：經文 ${x0.toFixed(0)}~${x1.toFixed(0)} 壓到定位方塊 ${marker.x0}~${marker.x1}`,
      );
    }
    assert.ok(
      band.refX <= CANVAS_W - half - MARKER_INSET + half,
      `${label}：出處 x=${band.refX} 落在紙張邊緣之外`,
    );
    assert.ok(x1 <= band.refX, `${label}：經文右緣 ${x1.toFixed(0)} 疊到出處 ${band.refX}`);
  };

  for (const species of SPECIES) {
    assert.ok(species.verse && species.verse.length > 0, `${species.name} 缺少經文`);
    assert.ok(species.verseRef && species.verseRef.length > 0, `${species.name} 缺少經文出處`);
    clearsMarkers(species.name, layoutVerseBand(species));
  }
});

test('經文字級會自動縮到放得下，寫死字級的版面會被擋下來', () => {
  // 現有七句都不算長，字級寫死也剛好放得下——所以光用現有資料驗不到自動縮排。
  // 這裡用一句刻意加長的經文：正確的實作會把字級縮小，寫死字級的實作會讓
  // 文字直接輾過下緣的定位方塊。
  const half = MARKER_SIZE / 2;
  const longVerse = {
    name: '（測試用）',
    verse: '耶和華是我的牧者我必不致缺乏他使我躺臥在青草地上領我在可安歇的水邊他使我的靈魂甦醒',
    verseRef: '詩篇 23:1-3',
  };
  const band = layoutVerseBand(longVerse);

  assert.ok(
    band.fontSize < VERSE_SIZE_MAX,
    `長經文必須自動縮小字級（實際 ${band.fontSize}，上限 ${VERSE_SIZE_MAX}）`,
  );
  assert.ok(
    band.fontSize >= VERSE_SIZE_MIN,
    `字級不得縮到低於下限 ${VERSE_SIZE_MIN}（實際 ${band.fontSize}）`,
  );

  const x0 = band.centerX - band.width / 2;
  const x1 = band.centerX + band.width / 2;
  for (const [x] of [MARKER_CANONICAL.bl, MARKER_CANONICAL.br]) {
    assert.ok(
      x1 <= x - half || x0 >= x + half,
      `縮小後仍壓到定位方塊：經文 ${x0.toFixed(0)}~${x1.toFixed(0)}、方塊 ${x - half}~${x + half}`,
    );
  }
});
