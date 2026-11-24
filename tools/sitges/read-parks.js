// Карта «Ситжес» — парки (план парка Can Robert, шаг П0): контур, рельеф по территориальному лидару ICGC 50 см
// и покрытие по ортофото. Модуль node (require), игра его не грузит. Плитки качает download.js (только у рамок
// парков из PARKS): dtm/ — рельеф без зданий и деревьев 50 см 2021–2023, srf/ — поверхность 1 м (рельеф + здания
// + растительность), orto25/ — ортофото 25 см 2024; калибровки dtm/calib.json, srf/calib.json (серый = a · h + b
// у каждой плитки свой). Маска крон — alc/ (высоты растительности 1 м, плитки 512 м всего города).
//   PARKS — список парков; parkWays() — их контуры OSM в UTM; parkTiles() — плитки PARK.tile м у рамок
//   (для download.js); readParks() — разбор (локальные координаты — G.ORIGIN уже задан):
//   → [{ id, name, ring, frame: [x0, z0, nx, nz] (узлы сетки высот), h: Float32Array (по z, в строке по x),
//        cover: { x0, z0, w, d, c: Uint8Array (класс клетки 1 м, CLS) }, decks, spots (из PARKS), stat }]
// Как:
//   1. Рамка — описанный прямоугольник контура в осях игры + PARK.pad, кратный PARK.step.
//   2. Высота узла — среднее пикселей dtm/ в квадрате шага вокруг узла (лидар 50 см, без зданий, деревьев и мостика).
//   3. Покрытие клетки 1 м внутри контура: крона (alc/ выше PARK.canopy) → хвоя, если пятно крон больше
//      PARK.palm м² (сосны), иначе класс соседей (пальмы на газоне); остальное — по цвету ортофото: зелень
//      g = G − (R + B)/2 — газон (поливной, искусственный) или сухая трава; серое, белое и красная плитка — мощение;
//      прочее — песок (сауло). Затем мажоритарный фильтр 3 × 3 против крапа.
//   4. Мостик (OSM highway=footway, bridge=yes внутри контура): ось и высота настила — по полосе «поверхность srf/ 1 м
//      выше рельефа dtm/, не крона (alc/)» поперёк линии OSM (она неточна); см. deckOf().
const fs = require('fs');
const path = require('path');
const G = require('./geo');
const U = require('./util');

const PARKS = [
  // Parc de Can Robert: полоса между Víctor Balaguer и ж/д от Pg. de Vilafranca до Av. de Sofia
  // spots — места объектов в координатах игры (П0, 2026-11-24): k — вид; ring — контур, p — точка; src — откуда
  // (orto — ортофото 25 см 2024, lidar — рельеф 50 см и поверхность 1 м, osm — контур OSM как есть); q — 1 уверенно,
  // 0 — оценка ±3 м (часть сторон не видна). Подробности и фото — docs/sitges/park-canrobert.md, «Итоги П0».
  { id: 'canrobert', name: 'Parc de Can Robert', way: 144382810, spots: [
    // сетчатый забор: уверенно видны восток x ≈ −74 и северо-западная диагональ; поилка OSM (dog=yes) — (−48, 562)
    { k: 'dog', ring: [[-70.5, 579], [-53, 570], [-42, 566.5], [-40, 547], [-74, 548], [-74, 578.5]], src: 'orto', q: 0 },
    // плоская крыша ≈ 3 м на стойках, шесть пролётов
    { k: 'shelter', ring: [[-24.5, 566.8], [-49.7, 566.8], [-49.7, 572.8], [-24.5, 572.8]], src: 'orto', q: 1 },
    // белая сцена на 14,2 м; ступени по ≈ 0,3 м до 15,4 м — полосой ≈ 3 м с севера (z 572,5…575,5) и востока
    // (x −97…−103); с запада — уступ 0,8 м до 15,0 м по x ≈ −83
    { k: 'amphi', ring: [[-83, 572.5], [-97, 572.5], [-93, 549], [-83, 549]], src: 'lidar', q: 1 },
    // детская в низине: деревянный штакетник (на ортофото — тёмная линия), снаряды в лидаре 1,5–2,6 м
    { k: 'play', ring: [[-142, 561.8], [-170, 568.8], [-198, 561.3], [-197, 553.8], [-176, 554.4], [-142, 557]], src: 'orto', q: 1 },
    // вторая детская (OSM 887009260 — не ошибка: забор и снаряды на ортофото 2024); юг под кронами — оценка
    { k: 'play2', ring: [[12, 577.2], [0.5, 576.6], [-0.5, 561], [8, 559], [24, 566]], src: 'orto', q: 0 },
    { k: 'pitch', ring: [[-9, 580], [-23, 580], [-24, 557], [-9, 556]], src: 'osm', q: 1 },
    // белая площадка у Av. de Sofia: тени перекладин на ортофото, предметы 1,3–1,7 м в лидаре — вероятно калистеника
    { k: 'calis', ring: [[159, 584.4], [144.4, 585.9], [141.6, 575.6], [156.9, 573.1]], src: 'orto', q: 0 },
    { k: 'letters', ring: [[-305, 518], [-308, 531], [-310, 531], [-307, 518]], src: 'osm', q: 1 },
    // бронзовая фигура на кубе (sv 10): одиночный предмет ≈ 1,5 м у входа с Víctor Balaguer — вероятно
    { k: 'figure', p: [80, 598.5], src: 'lidar', q: 0 },
  ] },
];
const PARK = {
  tile: 128,                 // плитки dtm/, srf/, orto25/ (мельче городских 512 м: серый растянут по плитке — ступень тоньше)
  pad: 15,                   // рамка = контур + pad, м (сшивка П1 — внутри контура, запас — на сверку)
  step: 2.5, q: 0.05,        // сетка высот: шаг, квант, м
  cell: 1,                   // растр покрытия, м
  canopy: 2.0,               // крона — растительность alc/ выше, м…
  canopyGreen: 2,            // …и зелёная на ортофото (g ≥): в alc/ есть и настил мостика, и навес
  palm: 40,                  // пятно крон меньше, м², — одиночное дерево на газоне: под ним класс соседей
  // цвет клетки — среднее 4 × 4 пикселей ортофото 25 см: светлота l = (R + G + B)/3, зелень g = G − (R + B)/2,
  // тёплота w = (R − B)/l (пробы 2026-11-24: сауло 0,21, сухая трава 0,40–0,46, белый бетон 0,08, газон поля g 24)
  shadow: 85,                // l ниже — тень кроны или стены: класс соседей
  lawn: 15,                  // g не меньше — газон (зелёный: искусственный, поливной)
  grey: 0.13,                // w меньше — серое: бетон, асфальт, белые бортики
  red: 0.35,                 // (R − G)/l не меньше — красная плитка, велодорожка, черепица
  dry: 0.30,                 // w не меньше — сухая трава (оливково-бурая), иначе песок-сауло
  // мостик: полоса настила — поверхность выше рельефа на deckMin…deckMax м и не зелёная на ортофото (g < deckGreen:
  // alc/ здесь не помогает — в нём и настил, и навес), ширина полосы deckWidth м; поиск поперёк оси OSM ±deckSearch м,
  // шаг середины к соседней станции ≤ deckJump м
  deckMin: 1.5, deckMax: 6, deckGreen: 3, deckWidth: [1, 4.5], deckSearch: 14, deckJump: 1.2, deckOut: 0.5,
  deckGap: 6,                // столько станций подряд без полосы — настил кончился (дальше — кроны, не он)
};
const CLS = ['out', 'sand', 'lawn', 'dry', 'pine', 'paved'];
const KINDS = { dtm: 0.5, srf: 1, orto25: 0.25 };   // вид плиток парка → метров на пиксель (download.js)

/* ---------- контуры и плитки ---------- */
let osmCache = null;
const osmEls = () => osmCache || (osmCache = JSON.parse(fs.readFileSync(path.join(G.RAW, 'osm.json'), 'utf8')).elements);
// контуры парков из OSM в UTM: [{ ...park, utm: [[e, n]…] }]
function parkWays() {
  const els = osmEls();
  return PARKS.map(p => {
    const w = els.find(e => e.type === 'way' && e.id === p.way);
    if (!w) throw new Error(`парк ${p.id}: в osm.json нет way ${p.way}`);
    const utm = w.geometry.map(q => G.utm(q.lat, q.lon));
    if (utm.length > 1 && utm[0][0] === utm[utm.length - 1][0] && utm[0][1] === utm[utm.length - 1][1]) utm.pop();
    return { ...p, utm };
  });
}
// рамка в осях игры: [x0, z0, nx, nz] узлов сетки высот
function frameOf(ring) {
  const [a, b, c, d] = U.bbox(ring), s = PARK.step;
  const x0 = Math.floor((a - PARK.pad) / s) * s, z0 = Math.floor((c - PARK.pad) / s) * s;
  return [x0, z0, Math.ceil((b + PARK.pad - x0) / s) + 1, Math.ceil((d + PARK.pad - z0) / s) + 1];
}
// плитки UTM, кратные PARK.tile, задевающие рамку какого-нибудь парка (проба точками через 4 м)
function parkTiles() {
  const geo = fs.readFileSync(path.join(G.OUT, 'data-geo.js'), 'utf8');
  G.setOrigin(...JSON.parse(geo.match(/origin: (\[[^\]]*\])/)[1]));
  const T = PARK.tile, out = new Map();
  for (const p of parkWays()) {
    const [x0, z0, nx, nz] = frameOf(p.utm.map(q => G.toLocal(...q))), x1 = x0 + (nx - 1) * PARK.step, z1 = z0 + (nz - 1) * PARK.step;
    for (let x = x0; x <= x1 + 2; x += 2) for (let z = z0; z <= z1 + 2; z += 2) {
      const [e, n] = G.toUTM(Math.min(x, x1), Math.min(z, z1)), k = [Math.floor(e / T) * T, Math.floor(n / T) * T];
      out.set(k.join('_'), k);
    }
  }
  return [...out.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

/* ---------- выборка из плиток ---------- */
const readCal = k => { const f = path.join(G.RAW, k, 'calib.json'); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {}; };
// sampler(вид, плитка м, м/пикс, калибровка?) → (e, n) → значение пикселя: высота (с калибровкой) или [R, G, B]; NaN / null — нет
function sampler(kind, tile, px, cal) {
  const { readPNG } = require('./png'), size = tile / px, cache = new Map();
  const get = (e0, n0) => {
    const key = e0 + '_' + n0;
    if (!cache.has(key)) {
      const f = path.join(G.RAW, kind, key + '.png');
      cache.set(key, fs.existsSync(f) && (!cal || cal[key]) ? readPNG(fs.readFileSync(f)).data : null);
    }
    return cache.get(key);
  };
  return (e, n) => {
    const e0 = Math.floor(e / tile) * tile, n0 = Math.floor(n / tile) * tile, d = get(e0, n0);
    if (!d) return cal ? NaN : null;
    const c = Math.min(size - 1, Math.floor((e - e0) / px)), r = size - 1 - Math.min(size - 1, Math.floor((n - n0) / px)), o = (r * size + c) * 4;
    if (cal) { const k = cal[e0 + '_' + n0]; return d[o + 3] < 128 ? NaN : (d[o] - k[1]) / k[0]; }
    return d[o + 3] < 128 ? null : [d[o], d[o + 1], d[o + 2]];
  };
}
function samplers() {
  return {
    dtm: sampler('dtm', PARK.tile, KINDS.dtm, readCal('dtm')),
    srf: sampler('srf', PARK.tile, KINDS.srf, readCal('srf')),
    alc: sampler('alc', 512, 0.5, readCal('alc')),
    orto: sampler('orto25', PARK.tile, KINDS.orto25),
    orto50: sampler('orto', 512, 0.5),
  };
}
const haveParkTiles = () => ['dtm', 'srf'].every(k => fs.existsSync(path.join(G.RAW, k, 'calib.json')))
  && ['orto25', 'alc'].every(k => fs.existsSync(path.join(G.RAW, k)));

// зелень ортофото g = G − (R + B)/2 — среднее по квадрату ±r м (пиксели 25 см)
function greenAt(S, x, z, r) {
  let s = 0, c = 0;
  for (let dz = -r + 0.125; dz < r; dz += 0.25) for (let dx = -r + 0.125; dx < r; dx += 0.25) {
    const v = S.orto(...G.toUTM(x + dx, z + dz));
    if (v) { s += v[1] - (v[0] + v[2]) / 2; c++; }
  }
  return c ? s / c : 0;
}

/* ---------- разбор ---------- */
// класс клетки по цвету (CLS), 0 — тень (решат соседи)
function classify([r, g, b]) {
  const l = (r + g + b) / 3, gr = g - (r + b) / 2, w = (r - b) / l;
  if (l < PARK.shadow) return 0;
  if (gr >= PARK.lawn) return 2;
  if (w < PARK.grey || (r - g) / l >= PARK.red) return 5;
  return w >= PARK.dry ? 3 : 1;
}
function readParks() {
  const S = samplers(), loc = q => G.toLocal(...q), out = [];
  const els = osmEls();
  for (const p of parkWays()) {
    const ring = p.utm.map(loc), frame = frameOf(ring), [x0, z0, nx, nz] = frame, st = PARK.step;
    // 2. высоты
    const h = new Float32Array(nx * nz);
    let miss = 0;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      let s = 0, n = 0;
      for (let dz = -1; dz <= 1; dz += 0.5) for (let dx = -1; dx <= 1; dx += 0.5) {
        const v = S.dtm(...G.toUTM(x0 + i * st + dx, z0 + j * st + dz));
        if (!Number.isNaN(v)) { s += v; n++; }
      }
      h[j * nx + i] = n ? s / n : NaN;
      if (!n) miss++;
    }
    // дыры (нет лидара) — от ближних соседей
    for (let pass = 0; miss && pass < 50; pass++) for (let k = 0; k < h.length; k++) if (Number.isNaN(h[k])) {
      const i = k % nx, j = (k / nx) | 0, nb = [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]].filter(([a, b]) => a >= 0 && b >= 0 && a < nx && b < nz).map(([a, b]) => h[b * nx + a]).filter(v => !Number.isNaN(v));
      if (nb.length) { h[k] = nb.reduce((s, v) => s + v, 0) / nb.length; miss--; }
    }
    // 3. покрытие
    const cx0 = x0, cz0 = z0, w = Math.round((nx - 1) * st / PARK.cell), d = Math.round((nz - 1) * st / PARK.cell);
    const raw = new Uint8Array(w * d), canopy = new Uint8Array(w * d), inside = new Uint8Array(w * d);
    for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) {
      const x = cx0 + (i + 0.5) * PARK.cell, z = cz0 + (j + 0.5) * PARK.cell, k = j * w + i;
      if (!U.inPoly(x, z, ring)) continue;
      const [e, n] = G.toUTM(x, z), a = S.alc(e, n);
      if (a >= PARK.canopy && greenAt(S, x, z, 0.5) >= PARK.canopyGreen) { canopy[k] = 1; raw[k] = 4; continue; }
      // среднее 4 × 4 пикселей ортофото 25 см
      let r = 0, g = 0, b = 0, c = 0;
      for (let dz = -0.375; dz < 0.5; dz += 0.25) for (let dx = -0.375; dx < 0.5; dx += 0.25) {
        const v = S.orto(...G.toUTM(x + dx, z + dz)) || S.orto50(...G.toUTM(x + dx, z + dz));
        if (v) { r += v[0]; g += v[1]; b += v[2]; c++; }
      }
      raw[k] = c ? classify([r / c, g / c, b / c]) : 1;
      inside[k] = 1;
    }
    // пятна крон: маленькие (пальмы, одиночные деревья на газоне) → класс соседей
    const seen = new Uint8Array(w * d), small = [];
    for (let k = 0; k < w * d; k++) if (canopy[k] && !seen[k]) {
      const comp = [k]; seen[k] = 1;
      for (let q = 0; q < comp.length; q++) {
        const c = comp[q], i = c % w, j = (c / w) | 0;
        for (const [a, b] of [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]]) if (a >= 0 && b >= 0 && a < w && b < d && canopy[b * w + a] && !seen[b * w + a]) { seen[b * w + a] = 1; comp.push(b * w + a); }
      }
      if (comp.length * PARK.cell * PARK.cell < PARK.palm) small.push(...comp);
    }
    for (const k of small) raw[k] = 0;
    // заливка класса соседей: тени и маленькие пятна крон
    const holes = [...small]; for (let k = 0; k < w * d; k++) if (inside[k] && !raw[k]) holes.push(k);
    for (let pass = 0, left = holes.length; left && pass < 30; pass++) {
      const next = raw.slice();
      for (const k of holes) if (!raw[k]) {
        const i = k % w, j = (k / w) | 0, cnt = new Uint16Array(CLS.length);
        for (let b = j - 1; b <= j + 1; b++) for (let a = i - 1; a <= i + 1; a++) if (a >= 0 && b >= 0 && a < w && b < d && raw[b * w + a]) cnt[raw[b * w + a]]++;
        // хвоя голосует последней: тень кроны лежит на земле вокруг, а не под ней
        let best = 0; for (const c of [1, 2, 3, 5]) if (cnt[c] > cnt[best]) best = c;
        if (!best && cnt[4]) best = 4;
        if (best) { next[k] = best; left--; }
      }
      raw.set(next);
    }
    for (const k of holes) if (!raw[k]) raw[k] = 3;
    // мажоритарный фильтр 3 × 3 (вне контура не трогаем)
    const c8 = raw.slice();
    for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) {
      const k = j * w + i;
      if (!raw[k]) continue;
      const cnt = new Uint16Array(CLS.length);
      for (let b = Math.max(0, j - 1); b <= Math.min(d - 1, j + 1); b++) for (let a = Math.max(0, i - 1); a <= Math.min(w - 1, i + 1); a++) cnt[raw[b * w + a]]++;
      let best = raw[k]; for (let c = 1; c < CLS.length; c++) if (cnt[c] > cnt[best]) best = c;
      c8[k] = cnt[best] >= 5 ? best : raw[k];
    }
    // 4. мостик: footway с bridge=yes, середина внутри контура
    const decks = [];
    for (const e of els) {
      if (e.type !== 'way' || !e.tags || e.tags.bridge !== 'yes' || !/^(footway|path|cycleway)$/.test(e.tags.highway || '')) continue;
      const pts = e.geometry.map(q => loc(G.utm(q.lat, q.lon))), c = U.centroid(pts.length > 2 ? pts : [...pts, pts[0]]);
      if (!U.inPoly(pts[pts.length >> 1][0], pts[pts.length >> 1][1], ring) && !U.inPoly(c[0], c[1], ring)) continue;
      decks.push(deckOf(e.id, pts, S));
    }
    const cnt = new Array(CLS.length).fill(0); for (const v of c8) cnt[v]++;
    let hMin = Infinity, hMax = -Infinity; for (const v of h) { hMin = Math.min(hMin, v); hMax = Math.max(hMax, v); }
    out.push({ id: p.id, name: p.name, way: p.way, ring, frame, h, cover: { x0: cx0, z0: cz0, w, d, c: c8 }, decks, spots: p.spots || [],
      stat: { cells: cnt, hMin, hMax, miss } });
  }
  return out;
}
// настил мостика: ось OSM неточна (северный конец Can Robert — на ≈ 10 м в стороне), поэтому ось ведём по лидару.
// Станции через 1 м вдоль линии OSM; на каждой поперёк ±deckSearch м — полосы «srf − dtm в [deckMin, deckMax], не крона
// (зелень ортофото)»; от станции с самой ходовой полосой идём в обе стороны, беря полосу ближе deckJump м к прошлой середине,
// пока пропуск не длиннее deckGap станций.
// Высота настила — медиана поверхности в полосе; где полосы нет (крона над настилом) — по соседям; концы — на земле.
function deckOf(id, pts, S) {
  const st = [];
  let along = 0;
  for (let s = 1; s < pts.length; s++) {
    const [a, b] = [pts[s - 1], pts[s]], L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
    for (let t = s === 1 ? 0 : 1; t <= L; t += 1) {
      const x = a[0] + ux * t, z = a[1] + uz * t, runs = [];
      let run = null;
      for (let o = -PARK.deckSearch; o <= PARK.deckSearch + 1e-6; o += 0.5) {
        const px = x - uz * o, pz = z + ux * o, [e, n] = G.toUTM(px, pz), g = S.dtm(e, n), f = S.srf(e, n), dh = f - g;
        const hit = dh >= PARK.deckMin && dh <= PARK.deckMax && greenAt(S, px, pz, 0.5) < PARK.deckGreen;
        if (hit) { if (!run) runs.push(run = { a: o, b: o, f: [] }); run.b = o; run.f.push(f); } else run = null;
      }
      st.push({ s: along + t, x, z, nx: -uz, nz: ux, runs: runs.filter(r => r.b - r.a >= PARK.deckWidth[0] && r.b - r.a <= PARK.deckWidth[1]) });
    }
    along += L;
  }
  // старт — середина полосы, чаще всего встречающаяся (корзины 1 м)
  const hist = new Map();
  for (const q of st) for (const r of q.runs) { const k = Math.round((r.a + r.b) / 2); hist.set(k, (hist.get(k) || 0) + 1); }
  const mode = [...hist].sort((p, q) => q[1] - p[1])[0];
  const out = st.map(q => ({ s: q.s, off: NaN, deck: NaN, ground: NaN, x: q.x, z: q.z }));
  if (mode) {
    const i0 = st.findIndex(q => q.runs.some(r => Math.abs((r.a + r.b) / 2 - mode[0]) <= 0.5));
    for (const dir of [1, -1]) {
      let prev = mode[0], miss = 0;
      for (let i = i0; i >= 0 && i < st.length; i += dir) {
        let best = null;
        for (const r of st[i].runs) { const c = (r.a + r.b) / 2; if (Math.abs(c - prev) <= Math.min(3, PARK.deckJump + 0.3 * miss) && (!best || Math.abs(c - prev) < Math.abs((best.a + best.b) / 2 - prev))) best = r; }
        if (!best) { if (++miss > PARK.deckGap) break; continue; }
        miss = 0; prev = (best.a + best.b) / 2;
        const f = best.f.slice().sort((p, q) => p - q);
        out[i].off = prev; out[i].deck = f[f.length >> 1];
      }
    }
  }
  // смещение и настил в пропусках — по соседям (на концах — ближайшее известное)
  const fill = key => {
    const known = out.map((q, i) => [i, q[key]]).filter(([, v]) => !Number.isNaN(v));
    if (!known.length) return;
    out.forEach((q, i) => {
      if (!Number.isNaN(q[key])) return;
      const lo = known.filter(([k]) => k < i).pop(), hi = known.find(([k]) => k > i);
      q[key] = !lo ? hi[1] : !hi ? lo[1] : lo[1] + (hi[1] - lo[1]) * (i - lo[0]) / (hi[0] - lo[0]);
      q.filled = 1;
    });
  };
  // выбросы настила (ветви над ним, перила соседней полосы): дальше deckOut м от медианы окна ±4 м — в пропуск
  const med = out.map((q, i) => { const w = out.slice(Math.max(0, i - 4), i + 5).map(r => r.deck).filter(v => !Number.isNaN(v)).sort((a, b) => a - b); return w.length >= 3 ? w[w.length >> 1] : NaN; });
  out.forEach((q, i) => { if (!Number.isNaN(q.deck) && (Number.isNaN(med[i]) || Math.abs(q.deck - med[i]) > PARK.deckOut)) q.deck = NaN; });
  // концы — на земле у концов линии OSM (там мостик сходит на дорожку): между ними и замеренной серединой — пандус
  for (const q of [out[0], out[out.length - 1]]) {
    if (Number.isNaN(q.off)) q.off = 0;
    if (Number.isNaN(q.deck)) { q.deck = S.dtm(...G.toUTM(q.x, q.z)); q.end = 1; }
  }
  fill('off'); fill('deck');
  // сгладить: скользящее среднее ±2 м (концы на месте)
  const raw = out.map(q => q.deck);
  for (let i = 1; i < out.length - 1; i++) { const w = raw.slice(Math.max(0, i - 2), i + 3); out[i].deck = w.reduce((a, b) => a + b, 0) / w.length; }
  for (let i = 0; i < out.length; i++) {
    const q = out[i], n = st[i];
    if (!Number.isNaN(q.off)) { q.x += n.nx * q.off; q.z += n.nz * q.off; }
    q.ground = S.dtm(...G.toUTM(q.x, q.z));
  }
  return { id, osm: pts, len: along, found: out.filter(q => !q.filled).length, prof: out };
}

module.exports = { PARKS, PARK, CLS, KINDS, parkWays, parkTiles, frameOf, readParks, haveParkTiles, samplers };
