// Карта «Ситжес» — тип и цвет крыш частей зданий по плиткам ICGC (tools/sitges/raw/orto/, dsm/ — их качает
// download.js). Модуль node (require), игра его не грузит.
//   readRoofs(parts) — parts: [{ rings }] в локальных координатах игры (как в data-buildings.js);
//   → на каждую часть { type, ang, col: [r, g, b], cov, coh, tile, n }:
//     type — ROOF_TYPES: 0 нет данных, 1 плоская, 2 двускатная, 3 вальмовая, 4 односкатная, 5 скатная (форма неизвестна:
//       лидара нет, черепица по ортофото); ang — угол конька в осях игры (atan2(z, x), °, 0…180), у односкатной —
//       направление вниз по скату (0…360); col — медиана цвета крыши по ортофото; cov — доля точек с лидаром,
//       coh — доля наклонных точек, tile — доля черепичных точек, slope — средний уклон скатов, n — точек в контуре.
// Как: точки сетки 0,5 м внутри контура, отступив ROOF.inset от рёбер (свесы, деревья у стен, края карниза).
//   Высоты — модель «рельеф + здания» прибрежного лидара (dsm/, калибровка calib.json). В каждой точке — уклон
//   разностями на ±grad м; круче wall — край дома или стена соседа, не считаем. Наклонные точки (уклон ≥ tilt)
//   делятся на четыре сектора по направлению вниз по скату относительно длинной оси прямоугольника охвата контура.
//   Скатная — наклонных точек ≥ minCoh и медиана их уклона ≥ minSlope (плоские крыши — сток воды 1–3 %; ступени
//   квантования серого дают отдельные наклонные точки, но не большинство). Форма — по долям точек в секторах:
//   один — односкатная, два встречных — двускатная, иначе вальмовая.
//   Слой ориентаций склонов ICGC (model-orientacions) не берём: с градиентом высот он не сходится (сверено 2026-11-19).
const fs = require('fs');
const path = require('path');
const G = require('./geo');
const U = require('./util');
const { readPNG } = require('./png');

const ROOF_TYPES = ['none', 'flat', 'gable', 'hip', 'shed', 'pitched'];
const ROOF = {
  tile: 512, px: 0.5,        // плитки download.js: метров на плитку, метров на пиксель
  inset: 0.7, insetMin: 0.25, // отступ от рёбер контура; у маленьких частей — меньше
  minN: 8,                    // меньше точек — отступ уменьшается
  grad: 1.0,                  // база разностей для уклона в точке, ± м
  tilt: 0.1,                  // уклон точки — не меньше: наклонная…
  wall: 1.0,                  // …и не больше: круче — край дома, стена соседа, дерево (не крыша), точку пропускаем
  cov: 0.5,                   // доля точек с лидаром — меньше: решает ортофото
  minSlope: 0.15,             // медиана уклона наклонных точек (≈ 8,5°) — меньше: плоская (сток воды — 1–3 %)
  minCoh: 0.45,               // и наклонных точек среди точек с высотой хотя бы столько
  tileP: 0.45,                // доля черепичных точек, чтобы считать крышу черепичной (там, где лидара нет)
  shed: 0.72,                 // один сектор — столько наклонных точек: односкатная
  gable: 0.75, gableMin: 0.12, // два встречных сектора вместе — столько, каждый не меньше gableMin: двускатная
  cache: 24,                  // плиток в памяти (по две картинки)
};

/* ---------- плитки ---------- */
const tiles = new Map();
let CAL = null;
const calib = () => CAL || (CAL = (() => { const f = path.join(G.RAW, 'dsm', 'calib.json'); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {}; })());
function tileAt(e, n) {
  const e0 = Math.floor(e / ROOF.tile) * ROOF.tile, n0 = Math.floor(n / ROOF.tile) * ROOF.tile, key = e0 + '_' + n0;
  let t = tiles.get(key);
  if (t) { tiles.delete(key); tiles.set(key, t); return t; }
  const load = kind => {
    const f = path.join(G.RAW, kind, key + '.png');
    return fs.existsSync(f) ? readPNG(fs.readFileSync(f)) : null;
  };
  const o = load('orto'), d = load('dsm'), size = ROOF.tile / ROOF.px, cal = calib()[key];
  t = { e0, n0, size, orto: null, dsm: null };
  if (o) t.orto = o.data;
  if (d && cal) {
    // высота «рельеф + здания»: серый = a · h + b (dsm/calib.json, download.js); NaN — нет данных
    t.dsm = new Float32Array(size * size);
    for (let i = 0; i < size * size; i++) t.dsm[i] = d.data[i * 4 + 3] < 128 ? NaN : (d.data[i * 4] - cal[1]) / cal[0];
  }
  tiles.set(key, t);
  if (tiles.size > ROOF.cache) tiles.delete(tiles.keys().next().value);
  return t;
}
const pixel = (e, n) => {
  const t = tileAt(e, n), c = Math.floor((e - t.e0) / ROOF.px), r = t.size - 1 - Math.floor((n - t.n0) / ROOF.px);
  return { t, i: r * t.size + c };
};
const dsmAt = (e, n) => { const { t, i } = pixel(e, n); return t.dsm ? t.dsm[i] : NaN; };

/* ---------- прямоугольник охвата наименьшей площади: угол длинной оси ---------- */
function obb(r) {
  let best = null;
  for (let i = 0; i < r.length; i++) {
    const [ax, az] = r[i], [bx, bz] = r[(i + 1) % r.length], L = Math.hypot(bx - ax, bz - az);
    if (L < 0.5) continue;
    const ux = (bx - ax) / L, uz = (bz - az) / L;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const [x, z] of r) { const u = x * ux + z * uz, v = -x * uz + z * ux; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const A = (u1 - u0) * (v1 - v0);
    if (!best || A < best.A) best = { A, ang: Math.atan2(uz, ux), L: u1 - u0, W: v1 - v0 };
  }
  if (best.W > best.L) best = { ...best, ang: best.ang + Math.PI / 2, L: best.W, W: best.L };
  return best;
}

/* ---------- одна часть ---------- */
function roofOf(rings) {
  const utm = rings.map(r => r.map(([x, z]) => G.toUTM(x, z))), outer = utm[0];
  const bb = U.bbox(outer), box = obb(rings[0]);
  const c = Math.cos(G.ROT), s = Math.sin(G.ROT);
  const edgeDist = (e, n) => {
    let d = Infinity;
    for (const r of utm) for (let i = 0; i < r.length; i++) d = Math.min(d, U.segDist([e, n], r[i], r[(i + 1) % r.length]));
    return d;
  };
  const sample = inset => {
    const pts = [];
    for (let e = Math.floor(bb[0] / ROOF.px) * ROOF.px + ROOF.px / 2; e < bb[1]; e += ROOF.px)
      for (let n = Math.floor(bb[2] / ROOF.px) * ROOF.px + ROOF.px / 2; n < bb[3]; n += ROOF.px) {
        if (!U.inPoly(e, n, outer) || utm.slice(1).some(h => U.inPoly(e, n, h))) continue;
        if (edgeDist(e, n) < inset) continue;
        pts.push([e, n]);
      }
    return pts;
  };
  let pts = sample(ROOF.inset);
  if (pts.length < ROOF.minN) pts = sample(ROOF.insetMin);
  const res = { type: 0, ang: 0, col: [0, 0, 0], cov: 0, coh: 0, tile: 0, n: pts.length };
  if (!pts.length) return res;
  const R = [], Gc = [], B = [];
  const sec = [0, 0, 0, 0], mags = [];
  let cov = 0, coh = 0, tile = 0, dx = 0, dz = 0, steep = 0;
  for (const [e, n] of pts) {
    const { t, i } = pixel(e, n);
    if (t.orto && t.orto[i * 4 + 3] > 127) {
      const r = t.orto[i * 4], g = t.orto[i * 4 + 1], b = t.orto[i * 4 + 2];
      R.push(r); Gc.push(g); B.push(b);
      // черепица: красно-оранжевая (r заметно больше g и b)
      if (r - b > 35 && r > g * 1.12 && r > 70) tile++;
    }
    const hgt = t.dsm ? t.dsm[i] : NaN;
    if (Number.isNaN(hgt)) continue;
    cov++;
    // уклон в точке разностями на ±grad м (точки снаружи контура тоже годятся — край отступа inset ≥ grad не нужен)
    const G2 = ROOF.grad, ge = (dsmAt(e + G2, n) - dsmAt(e - G2, n)) / (2 * G2), gn = (dsmAt(e, n + G2) - dsmAt(e, n - G2)) / (2 * G2);
    const mag = Math.hypot(ge, gn);
    if (!(mag <= ROOF.wall)) { steep++; continue; }
    if (mag < ROOF.tilt) continue;
    coh++; mags.push(mag);
    // направление вниз по скату: вектор UTM (−ge, −gn) → оси игры (как toLocal)
    const de = -ge / mag, dn = -gn / mag;
    const lx = -(de * c + dn * s), lz = -de * s + dn * c, la = Math.atan2(lz, lx);
    sec[((Math.round((la - box.ang) / (Math.PI / 2)) % 4) + 4) % 4]++;
    dx += lx; dz += lz;
  }
  const med = v => { if (!v.length) return 0; v.sort((p, q) => p - q); return v[v.length >> 1]; };
  res.col = [med(R), med(Gc), med(B)];
  res.tile = R.length ? tile / R.length : 0;
  res.cov = cov / pts.length;
  res.coh = cov > steep ? coh / (cov - steep) : 0;
  res.slope = mags.length >= 4 ? med(mags) : cov > steep ? 0 : NaN;
  const deg = v => ((v * 180 / Math.PI) % 360 + 360) % 360;
  const ridge = a => deg(a) % 180;
  const share = sec.map(v => v / Math.max(1, coh));
  if (res.cov < ROOF.cov || Number.isNaN(res.slope)) {
    // лидара нет: решает цвет
    res.type = !R.length ? 0 : res.tile >= ROOF.tileP ? 5 : 1;
    res.ang = ridge(box.ang);
    return res;
  }
  if (res.slope < ROOF.minSlope || res.coh < ROOF.minCoh) { res.type = 1; res.ang = ridge(box.ang); return res; }
  const mx = Math.max(...share);
  if (mx >= ROOF.shed) { res.type = 4; res.ang = deg(Math.atan2(dz, dx)); }
  else if (share[1] + share[3] >= ROOF.gable && Math.min(share[1], share[3]) >= ROOF.gableMin) { res.type = 2; res.ang = ridge(box.ang); }
  else if (share[0] + share[2] >= ROOF.gable && Math.min(share[0], share[2]) >= ROOF.gableMin) { res.type = 2; res.ang = ridge(box.ang + Math.PI / 2); }
  else { res.type = 3; res.ang = ridge(box.ang); }
  return res;
}

function readRoofs(parts) {
  const out = parts.map(p => roofOf(p.rings));
  tiles.clear();
  return out;
}

module.exports = { readRoofs, ROOF_TYPES, ROOF };
