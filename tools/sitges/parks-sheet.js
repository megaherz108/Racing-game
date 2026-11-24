// Карта «Ситжес» — лист проверки парков глазами (план парка Can Robert, П0): по js/maps/sitges/data-parks.js
// и плиткам ICGC парка (dtm/, srf/, orto25/ — download.js). Модуль node, игра его не грузит.
//   node tools/sitges/parks-sheet.js [id]   → tools/sitges/raw/parks-sheet-<id>.png (по умолчанию — первый парк)
// Полосы сверху вниз (0,5 м на пиксель, север UTM ≈ вверх, x игры растёт влево):
//   1. рельеф: отмывка лидара 50 см (свет с северо-запада), цвет — высота; жёлтые изолинии через 1 м — по сетке 2,5 м
//      из данных (должны лечь на отмывку), белый — контур, пурпурный — ось настила мостика (точки по соседям — жёлтые);
//   2. покрытие из данных поверх ортофото: песок — оранжевый, газон — ярко-зелёный, сухая трава — оливковый,
//      хвоя — тёмно-зелёный, мощение — голубой;
//   3. высота поверхности над рельефом (srf − dtm, 1 м): чёрный < 0,3 м, синий → зелёный → красный до 6 м;
//   4. ортофото 25 см с местами объектов (spots из данных: номер — порядок в списке, см. вывод в консоли);
//   5. увеличенные кадры объектов (0,25 м на пиксель, 67,5 м) — ортофото, поверх контур места.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const G = require('./geo');
const U = require('./util');
const { writePNG } = require('./png');
const { samplers } = require('./read-parks');

const load = (f, name) => { const ctx = {}; vm.runInNewContext(fs.readFileSync(path.join(G.OUT, f), 'utf8') + `;this.v=${name};`, ctx); return ctx.v; };
const geo = load('data-geo.js', 'SITGES_GEO'), P = load('data-parks.js', 'SITGES_PARKS');
G.setOrigin(...geo.origin);
const pk = process.argv[2] ? P.list.find(p => p.id === process.argv[2]) : P.list[0];
if (!pk) throw new Error('нет парка ' + process.argv[2]);
const S = samplers();

/* ---------- распаковка данных ---------- */
const pts = s => { const v = U.dec(s), out = []; let x = 0, z = 0; for (let i = 0; i < v.length; i += 2) { x += v[i]; z += v[i + 1]; out.push([x / 10, z / 10]); } return out; };
const ring = pts(pk.ring);
const g = pk.grid, gh = new Float32Array(g.nx * g.nz), res = U.dec(g.h);
for (let j = 0, k = 0; j < g.nz; j++) for (let i = 0; i < g.nx; i++, k++)
  gh[k] = res[k] + (i && j ? gh[k - 1] + gh[k - g.nx] - gh[k - g.nx - 1] : i ? gh[k - 1] : j ? gh[k - g.nx] : 0);
for (let k = 0; k < gh.length; k++) gh[k] *= g.q;
const hAt = (x, z) => {
  const fi = Math.max(0, Math.min(g.nx - 1.001, (x - g.x0) / g.step)), fj = Math.max(0, Math.min(g.nz - 1.001, (z - g.z0) / g.step));
  const i = Math.floor(fi), j = Math.floor(fj), a = fi - i, b = fj - j, q = (ii, jj) => gh[jj * g.nx + ii];
  return (q(i, j) * (1 - a) + q(i + 1, j) * a) * (1 - b) + (q(i, j + 1) * (1 - a) + q(i + 1, j + 1) * a) * b;
};
const cv = pk.cover, cls = new Uint8Array(cv.w * cv.d), runs = U.dec(cv.c);
for (let r = 0, k = 0; r < runs.length; r += 2) cls.fill(runs[r], k, k += runs[r + 1] + 1);
const clsAt = (x, z) => { const i = Math.floor((x - cv.x0) / cv.cell), j = Math.floor((z - cv.z0) / cv.cell); return i < 0 || j < 0 || i >= cv.w || j >= cv.d ? 0 : cls[j * cv.w + i]; };
const decks = pk.decks.map(d => ({ p: pts(d.p), m: U.dec(d.m) }));
const spots = pk.spots || [];

/* ---------- холст ---------- */
const M = 0.5, X1 = g.x0 + (g.nx - 1) * g.step, Z1 = g.z0 + (g.nz - 1) * g.step;
const PW = Math.round((X1 - g.x0) / M), PH = Math.round((Z1 - g.z0) / M);
const CROP = 270, CM = 0.25, CPR = Math.floor(PW / CROP), crops = spots.filter(s => s.crop !== false);
const W = PW, H = PH * 4 + Math.ceil(crops.length / CPR) * CROP;
const img = new Uint8Array(W * H * 3);
const put = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= W || y >= H) return; img.set(c.map(v => Math.max(0, Math.min(255, v))), (y * W + x) * 3); };
const CLS_COL = [null, [240, 150, 40], [40, 230, 40], [150, 150, 40], [20, 90, 30], [80, 200, 255]];
const SPOT_COL = [[255, 40, 40], [255, 255, 0], [0, 255, 255], [255, 0, 255], [255, 140, 0], [0, 255, 100], [255, 255, 255], [120, 120, 255], [255, 120, 180], [160, 255, 60]];
// цифры 3 × 5 (для номеров мест), масштаб 2
const FONT = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001', '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111'];
const text = (x, y, s, c) => [...String(s)].forEach((ch, n) => { const f = FONT[+ch]; for (let r = 0; r < 5; r++) for (let q = 0; q < 3; q++) if (f[r * 3 + q] === '1') for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) put(x + n * 8 + q * 2 + a, y + r * 2 + b, c); });

// полоса: (x, z) игры → пиксель; fn(x, z) → цвет
function band(oy, fn) {
  for (let j = 0; j < PH; j++) for (let i = 0; i < PW; i++) {
    const x = X1 - (i + 0.5) * M, z = Z1 - (j + 0.5) * M;
    put(i, oy + j, fn(x, z));
  }
  return (x, z) => [(X1 - x) / M, oy + (Z1 - z) / M];
}
const line = (to, a, b, c) => { const [p, q] = [to(...a), to(...b)], n = Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1])) + 1; for (let k = 0; k <= n; k++) put(p[0] + (q[0] - p[0]) * k / n, p[1] + (q[1] - p[1]) * k / n, c); };
const poly = (to, r, c, closed = true) => { for (let i = 0; i + (closed ? 0 : 1) < r.length; i++) line(to, r[i], r[(i + 1) % r.length], c); };
const orto = (x, z) => S.orto(...G.toUTM(x, z)) || S.orto50(...G.toUTM(x, z)) || [0, 0, 0];
const dtm = (x, z) => S.dtm(...G.toUTM(x, z));
const overlay = to => {
  poly(to, ring, [255, 255, 255]);
  for (const d of decks) d.p.forEach((q, i) => { const [a, b] = to(...q); for (let u = -1; u <= 1; u++) for (let v = -1; v <= 1; v++) put(a + u, b + v, d.m[i] === 1 ? [255, 0, 255] : [255, 255, 0]); });
};

// 1. рельеф
const [hLo, hHi] = [Math.min(...gh), Math.max(...gh)];
const to1 = band(0, (x, z) => {
  const h = dtm(x, z), hx = dtm(x - 0.5, z) - dtm(x + 0.5, z), hz = dtm(x, z + 0.5) - dtm(x, z - 0.5);
  const sh = Math.max(0.15, Math.min(1.2, 0.75 + (hx + hz) * 0.8)), t = (h - hLo) / (hHi - hLo);
  return [sh * (90 + 150 * t), sh * (150 + 40 * (1 - Math.abs(t - 0.5) * 2)), sh * (200 - 150 * t)];
});
for (let j = 0; j < PH; j++) for (let i = 1; i < PW; i++) {
  const x = X1 - (i + 0.5) * M, z = Z1 - (j + 0.5) * M, a = Math.floor(hAt(x, z)), b = Math.floor(hAt(x + M, z)), c = Math.floor(hAt(x, z + M));
  if (a !== b || a !== c) put(i, j, [255, 255, 0]);
}
overlay(to1);
// 2. покрытие
const to2 = band(PH, (x, z) => { const o = orto(x, z), k = clsAt(x, z); return k ? o.map((v, n) => v * 0.45 + CLS_COL[k][n] * 0.55) : o.map(v => v * 0.6); });
poly(to2, ring, [255, 255, 255]);
// 3. srf − dtm
const to3 = band(PH * 2, (x, z) => { const [e, n] = G.toUTM(x, z), d = S.srf(e, n) - S.dtm(e, n), v = Math.max(0, Math.min(1, d / 6)); return d < 0.3 ? [25, 25, 25] : [255 * Math.min(1, v * 2), 255 * (1 - Math.abs(v - 0.5) * 2), 255 * Math.max(0, 1 - v * 2)]; });
overlay(to3);
// 4. ортофото и места объектов
const to4 = band(PH * 3, orto);
overlay(to4);
const drawSpot = (to, s, c, num) => {
  if (s.ring) poly(to, s.ring, c);
  if (s.line) poly(to, s.line, c, false);
  const at = s.p || U.centroid(s.ring || s.line);
  const [a, b] = to(...at); for (let u = -3; u <= 3; u++) { put(a + u, b, c); put(a, b + u, c); }
  if (num !== undefined) text(a + 5, b + 4, num, c);
};
spots.forEach((s, n) => drawSpot(to4, s, SPOT_COL[n % SPOT_COL.length], n));
// 5. кадры
crops.forEach((s, n) => {
  const ox = (n % CPR) * CROP, oy = PH * 4 + Math.floor(n / CPR) * CROP, [cx, cz] = s.p || U.centroid(s.ring || s.line), half = CROP * CM / 2;
  for (let j = 0; j < CROP; j++) for (let i = 0; i < CROP; i++) put(ox + i, oy + j, orto(cx + half - (i + 0.5) * CM, cz + half - (j + 0.5) * CM));
  const to = (x, z) => { const p = [ox + (cx + half - x) / CM, oy + (cz + half - z) / CM]; return p; };
  const k = spots.indexOf(s), c = SPOT_COL[k % SPOT_COL.length];
  // только внутри кадра
  const save = put;
  drawSpot((x, z) => { const p = to(x, z); return [Math.max(ox, Math.min(ox + CROP - 1, p[0])), Math.max(oy, Math.min(oy + CROP - 1, p[1]))]; }, s, c);
  text(ox + 4, oy + 4, k, c);
  for (let i = 0; i < CROP; i++) { save(ox + i, oy, [0, 0, 0]); save(ox, oy + i, [0, 0, 0]); }
});

const out = path.join(G.RAW, `parks-sheet-${pk.id}.png`);
fs.writeFileSync(out, writePNG(W, H, img));
console.log('лист:', out, `(${W} × ${H}; рамка x ${g.x0}…${X1}, z ${g.z0}…${Z1})`);
spots.forEach((s, n) => console.log(`  ${n}: ${s.k} — ${s.name || ''} ${(s.p || U.centroid(s.ring || s.line)).map(v => v.toFixed(1)).join(', ')}`));
