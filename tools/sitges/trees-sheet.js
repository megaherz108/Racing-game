// Карта «Ситжес» — лист проверки деревьев глазами (этап 4б.0): ортофото контрольных мест, поверх — кружки крон
// из js/maps/sitges/data-trees.js (радиус кроны, цвет по высоте) и деревья OSM (голубые крестики, для сверки).
// Модуль node, игра его не грузит.
//   node tools/sitges/trees-sheet.js [--json файл] [x z …]  → tools/sitges/raw/trees-sheet.png (по умолчанию — 8 мест)
//   --json — деревья из файла [{ x, z, h, r }] вместо data-trees.js (подбор порогов read-trees.js без build.js).
//     С полем k (порода, раскладка 4б.2: C.trees) — цвет по породе: пиния — тёмно-зелёный, алеппская — салатовый,
//     платан — белый, каркас — голубой, пальма — жёлтый, кипарис — пурпурный, апельсин — оранжевый, садовое — розовый,
//     тамариск — синий; p = street / fill (уличные) — центр крестиком, fill — чёрным.
//   --out имя.png — имя листа в raw/ (по умолчанию trees-sheet.png).
// Цвета по высоте: < 6 м — жёлтый, 6–10 — оранжевый, 10–15 — красный, ≥ 15 — пурпурный; вытянутые (el > 2,
//   изгородь или ряд) — белый пунктир. Север (UTM) — вверх: x игры растёт влево.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const G = require('./geo');
const U = require('./util');
const { readPNG, writePNG } = require('./png');

const load = (f, name) => { const ctx = {}; vm.runInNewContext(fs.readFileSync(path.join(G.OUT, f), 'utf8') + `;this.v=${name};`, ctx); return ctx.v; };
const geo = load('data-geo.js', 'SITGES_GEO');
G.setOrigin(...geo.origin);

let args = process.argv.slice(2), trees, outName = 'trees-sheet.png';
const oi = args.indexOf('--out');
if (oi >= 0) { outName = args[oi + 1]; args.splice(oi, 2); }
const ji = args.indexOf('--json');
if (ji >= 0) { trees = JSON.parse(fs.readFileSync(args[ji + 1], 'utf8')); args.splice(ji, 2); }
else {
  const T = load('data-trees.js', 'SITGES_TREES'), m = U.dec(T.m), p = U.dec(T.p);
  trees = [];
  let x = 0, z = 0;
  for (let i = 0; i < T.n; i++) { x += p[i * 2]; z += p[i * 2 + 1]; trees.push({ x: x / 10, z: z / 10, h: m[i * 6] / 10, r: m[i * 6 + 1] / 10, el: m[i * 6 + 2] / 10 }); }
}
// деревья OSM — из data-points.js
const P = load('data-points.js', 'SITGES_PTS'), pk = U.dec(P.m), pp = U.dec(P.p), osmTrees = [];
{ let x = 0, z = 0; for (let i = 0; i < pk.length; i++) { x += pp[i * 2]; z += pp[i * 2 + 1]; if (P.kinds[pk[i]] === 'tree') osmTrees.push([x / 10, z / 10]); } }

const nums = args.map(Number);
const SPOTS = nums.length >= 2 ? Array.from({ length: nums.length >> 1 }, (_, i) => [nums[2 * i], nums[2 * i + 1], `${nums[2 * i]} ${nums[2 * i + 1]}`])
  : [[1330, -60, 'Террамар, Balmes'], [1000, 60, 'Виньет'], [300, -40, 'Pg. Marítim'], [-560, -120, 'старый город'],
    [175, 420, 'Av. de Sofia'], [-560, 280, 'вокзал'], [-334, 520, 'Pg. de Vilafranca'], [-1450, -300, 'Айгуадольс']];
const S = 360, M = 0.5, COLS = 4, ROWS = Math.ceil(SPOTS.length / COLS), W = S * COLS, H = S * ROWS;
const img = new Uint8Array(W * H * 3);
const tiles = new Map();
const orto = (e, n) => {
  const e0 = Math.floor(e / 512) * 512, n0 = Math.floor(n / 512) * 512, key = e0 + '_' + n0;
  if (!tiles.has(key)) { const f = path.join(G.RAW, 'orto', key + '.png'); tiles.set(key, fs.existsSync(f) ? readPNG(fs.readFileSync(f)) : null); }
  const t = tiles.get(key);
  if (!t) return [0, 0, 0];
  const c = Math.min(1023, Math.floor((e - e0) / 0.5)), r = 1023 - Math.min(1023, Math.floor((n - n0) / 0.5)), o = (r * 1024 + c) * 4;
  return [t.data[o], t.data[o + 1], t.data[o + 2]];
};
const KCOL = { pine: [0, 110, 0], aleppo: [130, 255, 70], plane: [255, 255, 255], celtis: [0, 220, 255], palm: [255, 230, 0],
  cypress: [255, 0, 255], orange: [255, 130, 0], garden: [255, 120, 160], tamarisk: [40, 60, 255] };
const hCol = h => h < 6 ? [255, 235, 0] : h < 10 ? [255, 140, 0] : h < 15 ? [255, 30, 30] : [255, 0, 255];
SPOTS.forEach(([cx, cz], s) => {
  const ox = (s % COLS) * S, oy = Math.floor(s / COLS) * S, half = S * M / 2;
  const toPix = (x, z) => [ox + (cx + half - x) / M, oy + (cz + half - z) / M];
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const x = cx + half - (i + 0.5) * M, z = cz + half - (j + 0.5) * M, [e, n] = G.toUTM(x, z), c = orto(e, n), o = ((oy + j) * W + ox + i) * 3;
    // ортофото приглушено, чтобы кружки читались
    img[o] = c[0] * 0.75; img[o + 1] = c[1] * 0.75; img[o + 2] = c[2] * 0.75;
  }
  const dot = (x, y, col) => { x = Math.round(x); y = Math.round(y); if (x < ox || y < oy || x >= ox + S || y >= oy + S) return; const o = (y * W + x) * 3; img[o] = col[0]; img[o + 1] = col[1]; img[o + 2] = col[2]; };
  for (const t of trees) {
    if (Math.abs(t.x - cx) > half + t.r || Math.abs(t.z - cz) > half + t.r) continue;
    const [px, py] = toPix(t.x, t.z), rp = t.r / M, col = t.k ? KCOL[t.k] : hCol(t.h), n = Math.max(12, Math.ceil(rp * 6));
    for (let k = 0; k < n; k++) {
      if (t.el > 2 && k % 4 > 1) continue;
      const a = k / n * Math.PI * 2;
      dot(px + Math.cos(a) * rp, py + Math.sin(a) * rp, t.el > 2 ? [255, 255, 255] : col);
      dot(px + Math.cos(a) * (rp - 1), py + Math.sin(a) * (rp - 1), t.el > 2 ? [255, 255, 255] : col);
    }
    dot(px, py, col); dot(px + 1, py, col); dot(px, py + 1, col); dot(px + 1, py + 1, col);
    if (t.p === 'street' || t.p === 'fill') for (let k = -3; k <= 3; k++) { const c2 = t.p === 'fill' ? [0, 0, 0] : col; dot(px + k, py + k, c2); dot(px + k, py - k, c2); }
  }
  if (!trees.length || !trees[0].k) for (const [x, z] of osmTrees) {
    const [px, py] = toPix(x, z);
    for (let k = -3; k <= 3; k++) { dot(px + k, py, [0, 230, 255]); dot(px, py + k, [0, 230, 255]); }
  }
});
const out = path.join(G.RAW, outName);
fs.writeFileSync(out, writePNG(W, H, img));
console.log('лист:', out, `(${SPOTS.length} мест по ${S * M} м: ${SPOTS.map(s => s[2]).join('; ')})`);
