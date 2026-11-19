// Карта «Ситжес» — данные для мест калиток и ворот (этап 4а.3): входы кадастра, окна-кандидаты съездов по ортофото,
// пересечения служебных проездов OSM с границей участка. Модуль node (require), игра его не грузит.
//   readGates({ parcels, parts, roads, addresses }) — всё в локальных координатах игры, кроме addresses (UTM):
//     parcels — участки build.js в порядке data-parcels.js: [{ ring, rustic, ref }]; parts — контуры частей домов
//     (внешние кольца); roads — улицы OSM build.js [{ cls, pts }]; addresses — readAddresses().list (ref, x, y, spec);
//   → { ent: [{ p, x, z }], win: [{ p, x, z, sc }], svc: [{ p, x, z }], stat }; p — индекс участка в parcels.
// Линию забора знает только игра (кромка тротуара, js/maps/sitges/fences.js), здесь — только границы участков:
//   ent — точки входов кадастра типа Entrance (портал) с их участком (по кадастровому номеру; у номера несколько
//     контуров — ближайший); калитку на заборе ставит игра проекцией (js/maps/sitges/gates.js).
//   win — окна GATE.win м вдоль рёбер участка, обращённых наружу (снаружи в 1 м — не другой участок): за окном
//     в глубину d0…d1 м двор по ортофото ICGC «мощёный» (не зелёный, не тёмный — тень и кроны, не голубой — бассейн),
//     дома ближе clear м нет; оценка sc — доля мощёных точек (0…1). Окна с sc ≥ thr, лучшие на участке (не ближе
//     win м друг к другу, не больше maxWin). Выбор лучшего окна на фронте — в игре, по проекции на забор участка.
//     Порог и окно — проба 4а.0 (docs/sitges/stage-4a.md): точных ≈ 35 % против ≈ 10 % у случайной точки — подсказка.
//   svc — пересечения highway=service с границей участка (въезд во двор, парковку; точно, но мало).
// Ворота OSM (barrier=gate и др.) — уже в data-points.js (вид gate), их проецирует игра.
const fs = require('fs');
const path = require('path');
const G = require('./geo');
const U = require('./util');
const { readPNG } = require('./png');

const GATE = {
  tile: 512, px: 0.5,         // плитки ортофото download.js (orto/): метров на плитку, метров на пиксель
  step: 0.5,                  // шаг точек вдоль границы участка, м
  win: 3.5,                   // ширина окна, м
  d0: 1, d1: 6, dStep: 0.5,   // глубина двора за окном, м
  clear: 5,                   // дом ближе — окна нет
  out: 1,                     // точка снаружи участка (в стольких м) — не в другом участке: ребро обращено наружу
  bend: 25,                   // окно не на углу участка: направления рёбер в окне расходятся не больше, °
  thr: 0.6,                   // окна с оценкой меньше не берём (игра берёт с тем же порогом)
  maxWin: 6,                  // окон на участок не больше
  exg: 18, dark: 75,          // зелень: 2g − r − b ≥ exg; темнее dark (среднее по каналам) — тень, кроны
};

/* ---------- ортофото ---------- */
const tiles = new Map();
function rgb(x, z) {
  const [e, n] = G.toUTM(x, z), e0 = Math.floor(e / GATE.tile) * GATE.tile, n0 = Math.floor(n / GATE.tile) * GATE.tile, key = e0 + '_' + n0;
  let t = tiles.get(key);
  if (!t) {
    const f = path.join(G.RAW, 'orto', key + '.png');
    t = { e0, n0, o: fs.existsSync(f) ? readPNG(fs.readFileSync(f)).data : null };
    tiles.set(key, t);
    if (tiles.size > 24) tiles.delete(tiles.keys().next().value);
  }
  if (!t.o) return null;
  const S = GATE.tile / GATE.px, c = Math.floor((e - t.e0) / GATE.px), r = S - 1 - Math.floor((n - t.n0) / GATE.px), i = (r * S + c) * 4;
  return t.o[i + 3] > 127 ? [t.o[i], t.o[i + 1], t.o[i + 2]] : null;
}
// 1 — мощение (асфальт, плитка, бетон, гравий), 0 — зелень, тень, бассейн; NaN — нет снимка
const paved = c => {
  if (!c) return NaN;
  const [r, g, b] = c;
  if (2 * g - r - b >= GATE.exg || (r + g + b) / 3 < GATE.dark || (b > g + 8 && b > r + 20)) return 0;
  return 1;
};

/* ---------- сетка по клеткам ---------- */
function cells(size) {
  const m = new Map(), k = (i, j) => i * 65536 + j;
  return {
    add(bb, o) {
      for (let i = Math.floor(bb[0] / size); i <= Math.floor(bb[1] / size); i++)
        for (let j = Math.floor(bb[2] / size); j <= Math.floor(bb[3] / size); j++) { const q = k(i, j); if (!m.has(q)) m.set(q, []); m.get(q).push(o); }
    },
    at(x, z) { return m.get(k(Math.floor(x / size), Math.floor(z / size))) || []; },
  };
}

function readGates({ parcels, parts, roads, addresses }) {
  const stat = { ent: 0, entNoParcel: 0, win: 0, winLots: 0, svc: 0, noTiles: !fs.existsSync(path.join(G.RAW, 'orto')) };
  const pg = cells(32);
  parcels.forEach((p, i) => { if (!p.rustic) pg.add(U.bbox(p.ring), { i, r: p.ring, bb: U.bbox(p.ring) }); });
  const inParcel = (x, z, skip) => pg.at(x, z).some(o => o.i !== skip && x >= o.bb[0] && x <= o.bb[1] && z >= o.bb[2] && z <= o.bb[3] && U.inPoly(x, z, o.r));
  const hg = cells(32);
  for (const r of parts) { const bb = U.bbox(r); hg.add(bb, { r, bb }); }
  const houseAt = (x, z) => hg.at(x, z).some(o => x >= o.bb[0] && x <= o.bb[1] && z >= o.bb[2] && z <= o.bb[3] && U.inPoly(x, z, o.r));
  const ringDist = (x, z, r) => { let d = Infinity; for (let i = 0, j = r.length - 1; i < r.length; j = i++) d = Math.min(d, U.segDist([x, z], r[j], r[i])); return d; };

  /* ---------- входы кадастра (Entrance) → участок по кадастровому номеру ---------- */
  const byRef = new Map();
  parcels.forEach((p, i) => { if (p.rustic) return; if (!byRef.has(p.ref)) byRef.set(p.ref, []); byRef.get(p.ref).push(i); });
  const ent = [];
  for (const a of addresses) {
    if (a.spec !== 'Entrance') continue;
    const [x, z] = G.toLocal(a.x, a.y), cand = byRef.get(a.ref);
    if (!cand) { stat.entNoParcel++; continue; }
    let p = cand[0];
    if (cand.length > 1) { let bd = Infinity; for (const i of cand) { const d = U.inPoly(x, z, parcels[i].ring) ? 0 : ringDist(x, z, parcels[i].ring); if (d < bd) { bd = d; p = i; } } }
    ent.push({ p, x, z });
  }
  stat.ent = ent.length;

  /* ---------- окна-кандидаты съездов по ортофото ---------- */
  const win = [];
  if (!stat.noTiles) parcels.forEach((P, pi) => {
    if (P.rustic) return;
    const r = P.ring, ccw = U.area(r) > 0;
    // точки по периметру через step м: позиция, направление ребра, внутренняя нормаль, оценка (−1 — нельзя)
    const pts = [];
    for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 1e-3) continue;
      const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L, nx = ccw ? -tz : tz, nz = ccw ? tx : -tx;   // нормаль внутрь
      const m = Math.max(1, Math.round(L / GATE.step));
      for (let j = 0; j < m; j++) {
        const t = (j + 0.5) / m, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
        let sc = -1;
        if (!inParcel(x - nx * GATE.out, z - nz * GATE.out, pi)) {
          let hit = false;
          for (let d = GATE.dStep; d <= GATE.clear && !hit; d += GATE.dStep) hit = houseAt(x + nx * d, z + nz * d);
          if (!hit) {
            let n = 0, s = 0;
            for (let d = GATE.d0; d <= GATE.d1; d += GATE.dStep) {
              const q = [x + nx * d, z + nz * d];
              if (!U.inPoly(q[0], q[1], r)) continue;   // узкий участок: за ним уже не двор
              const v = paved(rgb(q[0], q[1]));
              if (v === v) { n++; s += v; }
            }
            if (n >= 4) sc = s / n;
          }
        }
        pts.push({ x, z, tx, tz, sc });
      }
    }
    const W = Math.round(GATE.win / GATE.step), N = pts.length, cb = Math.cos(GATE.bend * Math.PI / 180), cand = [];
    if (N < W) return;
    for (let i = 0; i < N; i++) {
      const c = pts[(i + (W >> 1)) % N];
      let s = 0, ok = true;
      for (let j = 0; j < W && ok; j++) {
        const q = pts[(i + j) % N];
        if (q.sc < 0 || q.tx * c.tx + q.tz * c.tz < cb) ok = false; else s += q.sc;
      }
      if (ok && s / W >= GATE.thr) cand.push({ x: c.x, z: c.z, sc: s / W });
    }
    // лучшие окна, не ближе win м друг к другу
    cand.sort((a, b) => b.sc - a.sc);
    let k = 0;
    for (const c of cand) {
      if (k >= GATE.maxWin) break;
      if (win.some(w => w.p === pi && Math.hypot(w.x - c.x, w.z - c.z) < GATE.win)) continue;
      win.push({ p: pi, x: c.x, z: c.z, sc: c.sc }); k++;
    }
    if (k) stat.winLots++;
  });
  stat.win = win.length;
  tiles.clear();

  /* ---------- служебные проезды OSM через границу участка ---------- */
  const svc = [];
  const cross = (a, b, c, d) => {
    const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]], den = r[0] * s[1] - r[1] * s[0];
    if (Math.abs(den) < 1e-9) return null;
    const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [a[0] + r[0] * t, a[1] + r[1] * t] : null;
  };
  for (const rd of roads) {
    if (rd.cls !== 'service') continue;
    for (let i = 0; i + 1 < rd.pts.length; i++) {
      const a = rd.pts[i], b = rd.pts[i + 1], seen = new Set();
      for (let x = Math.min(a[0], b[0]); x <= Math.max(a[0], b[0]) + 32; x += 32)
        for (let z = Math.min(a[1], b[1]); z <= Math.max(a[1], b[1]) + 32; z += 32)
          for (const o of pg.at(Math.min(x, Math.max(a[0], b[0])), Math.min(z, Math.max(a[1], b[1])))) {
            if (seen.has(o.i)) continue;
            seen.add(o.i);
            for (let u = 0, v = o.r.length - 1; u < o.r.length; v = u++) {
              const q = cross(a, b, o.r[v], o.r[u]);
              if (q && !svc.some(s => s.p === o.i && Math.hypot(s.x - q[0], s.z - q[1]) < 2)) svc.push({ p: o.i, x: q[0], z: q[1] });
            }
          }
    }
  }
  stat.svc = svc.length;
  return { ent, win, svc, stat };
}

module.exports = { readGates, GATE };
