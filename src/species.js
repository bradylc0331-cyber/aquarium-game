// 海洋生物模板：每種生物只用一份 shape 資料，同時產生「列印線稿」跟「內部遮罩」，
// 兩者不會走鐘（見 svgRaster.js）。viewBox 統一 0 0 400 300，置中於工作區。
(function (root) {
  function starPoints(cx, cy, outerR, innerR, spikes) {
    const pts = [];
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const angle = (Math.PI / spikes) * i - Math.PI / 2;
      pts.push(`${(cx + r * Math.cos(angle)).toFixed(1)},${(cy + r * Math.sin(angle)).toFixed(1)}`);
    }
    return pts.join(' ');
  }

  const SPECIES = [
    {
      id: 'clownfish',
      name: '小丑魚',
      emoji: '🐠',
      viewBox: '0 0 400 300',
      shapes: [
        { tag: 'ellipse', attrs: { cx: 190, cy: 150, rx: 110, ry: 72 }, type: 'region' },
        { tag: 'polygon', attrs: { points: '292,150 380,95 380,205' }, type: 'region' },
        { tag: 'polygon', attrs: { points: '150,80 190,25 225,80' }, type: 'region' },
        { tag: 'polygon', attrs: { points: '170,205 135,262 215,232' }, type: 'region' },
      ],
      swim: { style: 'fish', speed: [55, 85], amplitude: [16, 26], freq: [1.6, 2.2], sizeScale: 0.85 },
    },
    {
      id: 'turtle',
      name: '海龜',
      emoji: '🐢',
      viewBox: '0 0 400 300',
      shapes: [
        { tag: 'ellipse', attrs: { cx: 210, cy: 155, rx: 105, ry: 82 }, type: 'region' },
        { tag: 'ellipse', attrs: { cx: 95, cy: 145, rx: 38, ry: 27 }, type: 'region' },
        { tag: 'polygon', attrs: { points: '150,95 95,45 185,80' }, type: 'region' },
        { tag: 'polygon', attrs: { points: '150,215 95,268 185,232' }, type: 'region' },
        { tag: 'polygon', attrs: { points: '270,90 335,55 290,120' }, type: 'region' },
        { tag: 'polygon', attrs: { points: '270,220 335,258 290,188' }, type: 'region' },
      ],
      swim: { style: 'glide', speed: [16, 26], amplitude: [6, 10], freq: [0.6, 0.9], sizeScale: 1.0 },
    },
    {
      id: 'jellyfish',
      name: '水母',
      emoji: '🪼',
      viewBox: '0 0 400 300',
      shapes: [
        { tag: 'path', attrs: { d: 'M 110,120 A 100,88 0 0 1 310,120 Q 312,175 210,180 Q 108,175 110,120 Z' }, type: 'region' },
        { tag: 'path', attrs: { d: 'M 150,178 C 140,215 165,235 155,270' }, type: 'line', lineWidth: 14 },
        { tag: 'path', attrs: { d: 'M 190,180 C 185,220 205,245 195,282' }, type: 'line', lineWidth: 14 },
        { tag: 'path', attrs: { d: 'M 230,180 C 240,218 218,242 232,278' }, type: 'line', lineWidth: 14 },
        { tag: 'path', attrs: { d: 'M 265,175 C 280,210 258,232 272,264' }, type: 'line', lineWidth: 14 },
      ],
      swim: { style: 'pulse', speed: [10, 18], amplitude: [30, 45], freq: [0.5, 0.8], sizeScale: 0.9 },
    },
    {
      id: 'dolphin',
      name: '海豚',
      emoji: '🐬',
      viewBox: '0 0 400 300',
      shapes: [
        { tag: 'ellipse', attrs: { cx: 190, cy: 150, rx: 140, ry: 46, transform: 'rotate(-8 190 150)' }, type: 'region' },
        { tag: 'polygon', attrs: { points: '178,108 198,55 222,110' }, type: 'region' },
        { tag: 'polygon', attrs: { points: '325,145 392,115 390,180' }, type: 'region' },
        { tag: 'polygon', attrs: { points: '140,178 112,222 172,200' }, type: 'region' },
      ],
      swim: { style: 'arc', speed: [95, 140], amplitude: [55, 80], freq: [1.0, 1.4], sizeScale: 1.05 },
    },
    {
      id: 'octopus',
      name: '章魚',
      emoji: '🐙',
      viewBox: '0 0 400 300',
      shapes: [
        { tag: 'ellipse', attrs: { cx: 200, cy: 108, rx: 92, ry: 70 }, type: 'region' },
        { tag: 'path', attrs: { d: 'M 128,150 C 100,190 120,230 88,272' }, type: 'line', lineWidth: 20 },
        { tag: 'path', attrs: { d: 'M 160,168 C 140,208 160,238 138,280' }, type: 'line', lineWidth: 20 },
        { tag: 'path', attrs: { d: 'M 200,175 C 200,215 200,248 200,286' }, type: 'line', lineWidth: 20 },
        { tag: 'path', attrs: { d: 'M 240,168 C 260,208 240,238 262,280' }, type: 'line', lineWidth: 20 },
        { tag: 'path', attrs: { d: 'M 272,150 C 300,190 280,230 312,272' }, type: 'line', lineWidth: 20 },
      ],
      swim: { style: 'drift', speed: [12, 22], amplitude: [10, 16], freq: [0.4, 0.7], sizeScale: 0.9 },
    },
    {
      id: 'starfish',
      name: '海星',
      emoji: '⭐',
      viewBox: '0 0 400 300',
      shapes: [
        { tag: 'polygon', attrs: { points: starPoints(200, 150, 115, 48, 5) }, type: 'region' },
      ],
      swim: { style: 'crawl', speed: [4, 9], amplitude: [3, 5], freq: [0.2, 0.3], sizeScale: 0.8 },
    },
  ];

  function getSpecies(id) {
    return SPECIES.find((s) => s.id === id) || null;
  }

  const api = { SPECIES, getSpecies };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Species = api;
})(typeof window !== 'undefined' ? window : globalThis);
