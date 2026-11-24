// Ситжес — покрытие парков (план парка Can Robert — docs/sitges/park-canrobert.md, шаг П2): цвет земли по классам
//   растра 1 м (SITGES_PARKS, data-parks.js: песок-сауло, газон, сухая трава, хвоя, мощение) поверх цвета park, зоны
//   поливных газонов и красного покрытия (руками по фото и ортофото — SITGES_PARK_COVER.zones), дорожки парка краской
//   вместо 3D-ленты плитки, вид покрытия под колёсами и цвета на мини-карте.
//   sitgesParkCover(C, pk) — классы клеток с зонами (Uint8Array по растру парка, коды PC) и куски дорожек парка
//     (по улицам C.streets: тот же шаг кусков, что у ленты в roads3d.js); кэш на парк (C не меняется).
//   sitgesParkGround(K, mat) — из sitgesBuildGround (ground.js): текстура парка SITGES_PARK_COVER.ppm пикс/м (классы
//     с шумом и мягкими границами — сдвиг шумом и билинейка по клеткам; дорожки — маской), подмешивается в шейдер земли
//     mat по мировым координатам (uv земли → x, z); K.parkSkip — куски улиц, которые лента не рисует (их нарисовала
//     земля), K.parkKind — вид покрытия под колёсами (surfaceKind в build.js, js/effects.js, js/audio-env.js).
//   sitgesParkMinimap(C, ctx, X, Z) — из sitgesPlanMinimap (minimap.js, после площадных объектов sitgesPaint): классы цветом с отмывкой рельефа парка
//     по сетке лидара (рельеф мини-карты — ICGC 5 м, низин парка на нём нет).
// Определяет: SITGES_PARK_COVER, SITGES_PC, sitgesParkCoverCache, sitgesParkCover, sitgesParkGround,
//   sitgesParkMinimap.
// Использует: clamp (js/core.js); makeNoise, mulberry32 (js/world.js); sitgesInPoly, sitgesSeg
//   (js/maps/sitges/geom.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

// Цвета — sRGB по летним кадрам Street View парка (raw/photos/street/park-canrobert/, 2026-07 и 2025-10) и среднему
// ортофото 2024 по классам, делённые на 1,27: на солнце (экспозиция карты 0,85, тонкоррекция) текстура земли выходит
// в кадре в ≈ 1,27 раза светлее (замер кадров П2). Откуда каждое число — docs/sitges/park-canrobert.md, «Итоги П2».
const SITGES_PARK_COVER = {
  ppm: 4,                       // текстура парка, пикселей на метр (клетка растра — 1 м)
  warp: [0.8, 2.7],             // сдвиг границ классов шумом: амплитуда, м; размер пятна, м
  edge: 1.8,                    // резкость границы классов (1 — билинейка на 1 м; больше — уже переход)
  dilate: 2,                    // текстура заходит за контур на столько клеток
  grain: [2, 0.24],             // зерно вблизи (мельче пикселя текстуры): плитка шума, м; размах яркости
  col: {
    sand: [142, 128, 105],      // сауло на солнце (180, 163, 133): аллея кадра 16 (2026-07) (186, 169, 140), кадр 04 (161, 144, 119)
    lawnHi: [115, 128, 58],     // поливной газон летом, кадр 16 (2026-07): светлые пятна — верхняя четверть зелени (150, 166, 78)
    lawnLo: [80, 95, 35],       //   тёмные — нижняя четверть (104, 122, 45); середина — медиана (133, 150, 63)
    dry: [126, 109, 68],        // сухая трава откосов: кадр 16 (2026-07), сухостой (160, 139, 86)
    dryGreen: [86, 96, 46],     //   зелёные пятна — зелень у земли на кадрах 15 (2025-10) и 09 (108, 118, 58)
    pine: [120, 92, 63],        // хвоя под соснами: кадр 17 (2026-07), опад на солнце (161, 122, 83) и (129, 106, 79)
    pineLo: [82, 70, 54],       //   бурая земля в тени — ортофото класса хвоя (97, 87, 62)
    paved: [132, 121, 106],     // бетон дорожек: кадры 09 (168, 153, 134) и 08 (151, 136, 113)
    pink: [164, 124, 108],      // красный асфальт на западе: кадр 10 (201, 162, 143), плитка там же (190, 149, 137)
  },
  // зоны: lawn — сухая трава и хвоя внутри становятся газоном (летом полив); red — песок и мощение внутри — красный
  // асфальт; paved — дорожки внутри бетонные (бетон запылён сауло — на ортофото не отличить: тёплота как у песка).
  // ring — контур, line + w — полоса ± w м у ломаной. Координаты игры, по ортофото 2024 и кадрам Street View
  zones: [
    { k: 'lawn', name: 'вход с Pg. de Vilafranca, пальмы вдоль променада', ring: [[-294, 476], [-330, 476], [-330, 580], [-294, 580]] },
    { k: 'lawn', name: 'ряд пальм у диагональной аллеи от входа', line: [[-198, 573], [-264, 550]], w: 6 },
    { k: 'lawn', name: 'откос у детской в низине, север', ring: [[-133, 571], [-212, 569], [-222, 576], [-215, 591], [-140, 593]] },
    { k: 'lawn', name: 'откос у детской в низине, юг', ring: [[-140, 546], [-200, 548], [-205, 535], [-140, 532]] },
    { k: 'paved', name: 'бетонная дорожка вдоль навеса у собачьей площадки (кадры 08, 09)', ring: [[-8, 571], [-78, 571], [-78, 588], [-8, 588]] },
    { k: 'red', name: 'запад у Víctor Balaguer: красный асфальт и велодорожка (кадр 10)', ring: [[201, 575], [60, 577], [-8, 582], [-8, 605], [201, 605]] },
  ],
  cycleLawn: 6,                 // газон вдоль велодорожек парка (cycleway OSM): ± м от оси
  // дорожки парка: какие улицы — классы OSM; бетон — доля мощения в полосе вдоль куска ≥ paved (сглажено по ± near
  // кусков); шаг швов бетона и ступеней, м; кромка — полоса мягкого края, м
  path: { cls: new Set(['footway', 'path', 'cycleway', 'steps', 'track']), paved: 0.45, near: 2, joint: 2, step: 1.4, soft: 0.8 },
  // вид под колёсами по коду PC (звук и пыль — js/audio-env.js, js/effects.js)
  kind: ['', 'dirt', 'grass', 'grass', 'dirt', 'paving', 'asphalt', 'grass'],
  // мини-карта: цвета кодов PC (светлее текстуры — как вся мини-карта)
  mm: ['', '#e2d3b0', '#8fbf63', '#c5bd88', '#a9ab7c', '#d9d3c7', '#e3c2b4', '#86b25e'],
  mmShade: 0.07,                // отмывка: перепад высот на 6 м → яркость
};
// коды классов покрытия после зон: 0 вне, 1 песок, 2 газон, 3 сухая трава, 4 хвоя, 5 мощение, 6 красный асфальт,
// 7 газон под кронами (хвоя в зоне полива)
const SITGES_PC = { out: 0, sand: 1, lawn: 2, dry: 3, pine: 4, paved: 5, pink: 6, lawnPine: 7 };

/* ==================== классы с зонами и куски дорожек ==================== */
const sitgesParkCoverCache = new WeakMap();
function sitgesParkCover(C, pk) {
  if (sitgesParkCoverCache.has(pk)) return sitgesParkCoverCache.get(pk);
  const P = SITGES_PARK_COVER, PC = SITGES_PC, V = pk.cover, src = pk.classes;
  const map = src.map(n => PC[n] || 0);                 // класс данных → код PC
  let bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
  for (const [x, z] of pk.ring) { bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); bz0 = Math.min(bz0, z); bz1 = Math.max(bz1, z); }
  const inBox = (x, z, m = 0) => x >= bx0 - m && x <= bx1 + m && z >= bz0 - m && z <= bz1 + m;
  const inside = (x, z) => inBox(x, z) && sitgesInPoly(x, z, pk.ring);
  // улицы-дорожки парка: не проезжие, класс из списка, не настил (мостик — шаг П3)
  const isPath = st => !st.drive && P.path.cls.has(st.cls) && st.surf !== 'wood';
  // зоны: велодорожки парка — полосы газона
  const zones = P.zones.map(z => ({ ...z, segs: z.line ? z.line.slice(1).map((b, i) => [...z.line[i], ...b]) : null }));
  for (const st of C.streets) if (st.cls === 'cycleway' && st.v.some(q => inside(q.x, q.z))) {
    const segs = [];
    for (let i = 0; i + 1 < st.v.length; i++) segs.push([st.v[i].x, st.v[i].z, st.v[i + 1].x, st.v[i + 1].z]);
    zones.push({ k: 'lawn', name: 'вдоль велодорожки', segs, w: P.cycleLawn });
  }
  const inZone = (zn, x, z) => zn.segs ? zn.segs.some(s => sitgesSeg(x, z, s[0], s[1], s[2], s[3]) < zn.w) : sitgesInPoly(x, z, zn.ring);
  const cls = new Uint8Array(V.w * V.d), cnt = new Uint32Array(8);
  for (let j = 0; j < V.d; j++) for (let i = 0; i < V.w; i++) {
    const k = j * V.w + i, x = V.x0 + (i + 0.5) * V.cell, z = V.z0 + (j + 0.5) * V.cell;
    let c = map[pk.cover.c[k]];
    if (c) for (const zn of zones) {
      if (zn.k === 'paved') continue;
      if (zn.k === 'lawn' ? c !== PC.dry && c !== PC.pine : c !== PC.sand && c !== PC.paved) continue;
      if (!inZone(zn, x, z)) continue;
      c = zn.k === 'red' ? PC.pink : c === PC.pine ? PC.lawnPine : PC.lawn;
      break;
    }
    cls[k] = c; cnt[c]++;
  }
  const at = (x, z) => {
    const i = Math.floor((x - V.x0) / V.cell), j = Math.floor((z - V.z0) / V.cell);
    return i < 0 || j < 0 || i >= V.w || j >= V.d ? 0 : cls[j * V.w + i];
  };
  // куски дорожек: шаг кусков — как у ленты улицы (sitgesBuildRoads, roads3d.js): ≤ 2,5 м вдоль отрезка
  const runs = [];
  for (const st of C.streets) {
    if (!isPath(st) || !st.v.some(q => inBox(q.x, q.z, 30))) continue;
    const pcs = [];
    for (let i = 0; i + 1 < st.v.length; i++) {
      const a = st.v[i], b = st.v[i + 1], n = Math.max(1, Math.ceil((b.s - a.s) / 2.5));
      if (a.deck) { pcs.push(null); continue; }
      for (let k = 1; k <= n; k++) {
        const f0 = (k - 1) / n, f1 = k / n, mx = a.x + (b.x - a.x) * (f0 + f1) / 2, mz = a.z + (b.z - a.z) * (f0 + f1) / 2;
        if (!inside(mx, mz)) { pcs.push(null); continue; }
        const ax = a.x + (b.x - a.x) * f0, az = a.z + (b.z - a.z) * f0, bx = a.x + (b.x - a.x) * f1, bz = a.z + (b.z - a.z) * f1;
        const hw = a.hw + (b.hw - a.hw) * (f0 + f1) / 2;
        // доля мощения в полосе ± (hw + 0,5) м
        const L = Math.hypot(bx - ax, bz - az) || 1, ux = (bx - ax) / L, uz = (bz - az) / L;
        let pv = 0, all = 0, red = 0;
        for (let s = 0.25; s < L; s += 0.5) for (let o = -hw - 0.5; o <= hw + 0.5; o += 0.5) {
          const c = at(ax + ux * s - uz * o, az + uz * s + ux * o);
          if (!c) continue;
          all++; if (c === PC.paved) pv++; if (c === PC.pink) red++;
        }
        const pz = zones.some(zn => zn.k === 'paved' && inZone(zn, mx, mz));
        pcs.push({ ax, az, bx, bz, hw, pv: pz ? 1 : all ? pv / all : 0, red: all ? red / all : 0 });
      }
    }
    // вид куска: ступени; красный асфальт (зона red); бетон — доля мощения, сглаженная по соседям; иначе сауло
    for (let q = 0; q < pcs.length; q++) {
      const p = pcs[q]; if (!p) continue;
      let s = 0, n = 0, r = 0;
      for (let d = -P.path.near; d <= P.path.near; d++) { const o = pcs[q + d]; if (o) { s += o.pv; r += o.red; n++; } }
      p.t = st.cls === 'steps' ? 'steps' : r / n >= 0.3 ? 'pink' : s / n >= P.path.paved ? 'paved' : 'sand';
    }
    // подряд идущие куски одного вида — ломаная
    let cur = null;
    for (const p of pcs) {
      if (!p) { cur = null; continue; }
      if (!cur || cur.t !== p.t) { cur = { t: p.t, cls: st.cls, hw: p.hw, pts: [[p.ax, p.az]] }; runs.push(cur); }
      cur.pts.push([p.bx, p.bz]);
    }
  }
  const len = {};
  for (const r of runs) for (let i = 1; i < r.pts.length; i++) len[r.t] = (len[r.t] || 0) + Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]);
  const all = cnt.reduce((s, v, i) => s + (i ? v : 0), 0);
  const stats = { cells: Object.fromEntries(Object.keys(PC).map(n => [n, +(100 * cnt[PC[n]] / all).toFixed(1)]).filter(([n]) => n !== 'out')), paths: Object.fromEntries(Object.entries(len).map(([k, v]) => [k, Math.round(v)])) };
  const res = { cls, at, runs, isPath, inside, stats };
  sitgesParkCoverCache.set(pk, res);
  return res;
}

/* ==================== постройка: текстура парка, подмес в шейдер земли, вид под колёсами ==================== */
function sitgesParkGround(K, mat) {
  const C = K.D.C, T = C.terra, P = SITGES_PARK_COVER, PC = SITGES_PC, parks = C.parks || [];
  Object.assign(K, { parkSkip: null, parkKind: () => null, parkCoverStats: [] });
  if (!parks.length) return mat;
  const noise = makeNoise(mulberry32(2411)), CO = P.col;
  // цвет класса c в точке: n1 — пятна ≈ 2 м, n2 — ≈ 7 м, g — зерно −1…1; out — rgb 0…255
  const col = (c, n1, n2, g, out) => {
    let r, gg, b, f = 1;
    const mix = (a, bb, t) => { r = a[0] + (bb[0] - a[0]) * t; gg = a[1] + (bb[1] - a[1]) * t; b = a[2] + (bb[2] - a[2]) * t; };
    switch (c) {
      case PC.sand: mix(CO.sand, CO.sand, 0); f = 1 + 0.05 * n2 + 0.035 * n1 + 0.06 * g - (g > 0.94 ? 0.12 : 0); break;
      case PC.lawn: case PC.lawnPine:
        mix(CO.lawnLo, CO.lawnHi, clamp(0.5 + 0.55 * n1 + 0.3 * n2, 0, 1)); f = (1 + 0.07 * g) * (c === PC.lawnPine ? 0.84 : 1); break;
      case PC.dry: {
        const t = clamp((n2 * 0.7 + n1 * 0.45 - 0.1) / 0.35, 0, 1);
        mix(CO.dry, CO.dryGreen, t * t * (3 - 2 * t) * 0.8); f = 1 + 0.08 * g + 0.04 * n1; break;
      }
      case PC.pine: mix(CO.pine, CO.pineLo, clamp(0.45 + 0.6 * n1 + 0.25 * n2, 0, 1)); f = 1 + 0.1 * g; break;
      case PC.paved: mix(CO.paved, CO.paved, 0); f = 1 + 0.03 * n2 + 0.025 * g; break;
      case PC.pink: mix(CO.pink, CO.pink, 0); f = 1 + 0.035 * n2 + 0.03 * g; break;
      default: r = gg = b = 0;
    }
    out[0] = r * f; out[1] = gg * f; out[2] = b * f;
  };
  const PATH = { sand: PC.sand, paved: PC.paved, steps: PC.paved, pink: PC.pink };
  const texs = [], kinds = [];
  for (const pk of parks) {
    const V = pk.cover, cov = sitgesParkCover(C, pk), ppm = P.ppm;
    // классы для текстуры — с запасом dilate клеток за контур (иначе по краю проступает цвет park текстуры земли:
    // она 1 пикс/м и размыта); клетка вне контура берёт частый класс соседей
    const cls = cov.cls.slice();
    for (let pass = 0; pass < P.dilate; pass++) {
      const src = cls.slice(), n = new Uint8Array(8);
      for (let j = 0; j < V.d; j++) for (let i = 0; i < V.w; i++) {
        if (src[j * V.w + i]) continue;
        n.fill(0); let best = 0;
        for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
          const ii = i + a, jj = j + b;
          if (ii < 0 || jj < 0 || ii >= V.w || jj >= V.d) continue;
          const c = src[jj * V.w + ii]; if (c && ++n[c] > n[best]) best = c;
        }
        cls[j * V.w + i] = best;
      }
    }
    const W = V.w * V.cell * ppm, H = V.d * V.cell * ppm, X = x => (x - V.x0) * ppm, Z = z => (z - V.z0) * ppm;
    // маска дорожек: r — сауло, g — бетон и ступени, b — красный асфальт (сложение — 'lighter'); швы — вторая маска
    const mk = document.createElement('canvas'); mk.width = W; mk.height = H;
    const mx = mk.getContext('2d', { willReadFrequently: true });
    mx.fillStyle = '#000'; mx.fillRect(0, 0, W, H);
    mx.globalCompositeOperation = 'lighter'; mx.lineCap = mx.lineJoin = 'round';
    const jk = document.createElement('canvas'); jk.width = W; jk.height = H;
    const jx = jk.getContext('2d', { willReadFrequently: true });
    jx.fillStyle = '#000'; jx.fillRect(0, 0, W, H); jx.strokeStyle = '#fff';
    const CH = { sand: [255, 0, 0], paved: [0, 255, 0], steps: [0, 255, 0], pink: [0, 0, 255] };
    for (const r of cov.runs) {
      const [cr, cg, cb] = CH[r.t];
      mx.strokeStyle = `rgba(${cr},${cg},${cb},0.5)`;
      for (const w of [2 * r.hw + P.path.soft, 2 * r.hw]) {
        mx.lineWidth = w * ppm; mx.beginPath();
        r.pts.forEach(([x, z], i) => (i ? mx.lineTo(X(x), Z(z)) : mx.moveTo(X(x), Z(z))));
        mx.stroke();
      }
      // швы бетона и кромки ступеней поперёк дорожки
      if (r.t === 'sand' || r.t === 'pink') continue;
      const stp = r.t === 'steps' ? P.path.step : P.path.joint;
      jx.lineWidth = r.t === 'steps' ? 2 : 1;
      let carry = stp / 2;
      for (let i = 1; i < r.pts.length; i++) {
        const [ax, az] = r.pts[i - 1], [bx, bz] = r.pts[i], L = Math.hypot(bx - ax, bz - az);
        if (L < 1e-3) continue;
        const ux = (bx - ax) / L, uz = (bz - az) / L;
        for (let s = carry; s < L; s += stp) {
          const x = ax + ux * s, z = az + uz * s;
          jx.beginPath(); jx.moveTo(X(x - uz * r.hw), Z(z + ux * r.hw)); jx.lineTo(X(x + uz * r.hw), Z(z - ux * r.hw)); jx.stroke();
          carry = s + stp - L;
        }
        if (carry < 0) carry = 0;
      }
    }
    const md = mx.getImageData(0, 0, W, H).data, jd = jx.getImageData(0, 0, W, H).data;
    // текстура: классы клеток со сдвигом границ шумом и узкой билинейкой, поверх — дорожки по маске
    const data = new Uint8Array(W * H * 4), KS = 2, kw = Math.ceil(W / KS), kd = Math.ceil(H / KS), kind = new Uint8Array(kw * kd);
    const c4 = [0, 0, 0], acc = [0, 0, 0], tmp = [0, 0, 0], [wa, ws] = P.warp, E = P.edge;
    const sharp = t => { t = clamp((t - 0.5) * E + 0.5, 0, 1); return t * t * (3 - 2 * t); };
    const cw = new Float32Array(8);
    let seed = 1;
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
      const x = V.x0 + (px + 0.5) / ppm, z = V.z0 + (py + 0.5) / ppm;
      const wx = x + wa * noise(x / ws, z / ws), wz = z + wa * noise(x / ws + 31.7, z / ws + 11.3);
      const fx = (wx - V.x0) / V.cell - 0.5, fz = (wz - V.z0) / V.cell - 0.5;
      const i = Math.floor(fx), j = Math.floor(fz), tx = sharp(fx - i), tz = sharp(fz - j);
      const n1 = noise(x / 2.1, z / 2.1), n2 = noise(x / 7.3 + 5.1, z / 7.3 + 2.9);
      seed = (seed * 1103515245 + 12345) >>> 0; const g = ((seed >>> 8) & 0xffff) / 32768 - 1;
      acc[0] = acc[1] = acc[2] = 0;
      let a = 0, best = 0, bw = -1;
      cw.fill(0);
      for (let q = 0; q < 4; q++) {
        const ii = i + (q & 1), jj = j + (q >> 1);
        const w = ((q & 1) ? tx : 1 - tx) * ((q >> 1) ? tz : 1 - tz);
        if (w <= 0 || ii < 0 || jj < 0 || ii >= V.w || jj >= V.d) continue;
        const c = cls[jj * V.w + ii];
        if (c) cw[c] += w;
      }
      for (let c = 1; c < 8; c++) if (cw[c] > 0) {
        col(c, n1, n2, g, tmp);
        acc[0] += tmp[0] * cw[c]; acc[1] += tmp[1] * cw[c]; acc[2] += tmp[2] * cw[c]; a += cw[c];
        if (cw[c] > bw) { bw = cw[c]; best = c; }
      }
      if (a > 0) { c4[0] = acc[0] / a; c4[1] = acc[1] / a; c4[2] = acc[2] / a; }
      // дорожки
      const o = (py * W + px) * 4, ms = md[o] / 255, mp = md[o + 1] / 255, mr = md[o + 2] / 255, m = Math.min(1, ms + mp + mr);
      if (m > 0) {
        const tot = ms + mp + mr;
        let r = 0, gg = 0, b = 0;
        if (ms) { col(PC.sand, n1, n2, g, tmp); r += tmp[0] * ms; gg += tmp[1] * ms; b += tmp[2] * ms; }
        if (mp) { col(PC.paved, n1, n2, g, tmp); const jf = 1 - 0.22 * jd[o] / 255; r += tmp[0] * mp * jf; gg += tmp[1] * mp * jf; b += tmp[2] * mp * jf; }
        if (mr) { col(PC.pink, n1, n2, g, tmp); r += tmp[0] * mr; gg += tmp[1] * mr; b += tmp[2] * mr; }
        r /= tot; gg /= tot; b /= tot;
        if (a > 0) { c4[0] += (r - c4[0]) * m; c4[1] += (gg - c4[1]) * m; c4[2] += (b - c4[2]) * m; } else { c4[0] = r; c4[1] = gg; c4[2] = b; }
        a = Math.max(a, m);
        if (m >= 0.5) best = ms >= mp && ms >= mr ? PATH.sand : mp >= mr ? PATH.paved : PATH.pink;
      }
      data[o] = clamp(c4[0], 0, 255); data[o + 1] = clamp(c4[1], 0, 255); data[o + 2] = clamp(c4[2], 0, 255); data[o + 3] = a > 0 ? clamp(a, 0, 1) * 255 : 0;
      // вид под колёсами — только внутри контура (за ним — как было: улица, тротуар, земля)
      if (px % KS === 0 && py % KS === 0) kind[(py / KS) * kw + px / KS] = a >= 0.5 && cov.at(x, z) ? best : 0;
    }
    // кромка текстуры — прозрачная (за рамкой — земля как была: зажим к краю)
    for (let px = 0; px < W; px++) { data[px * 4 + 3] = 0; data[((H - 1) * W + px) * 4 + 3] = 0; }
    for (let py = 0; py < H; py++) { data[py * W * 4 + 3] = 0; data[(py * W + W - 1) * 4 + 3] = 0; }
    const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.colorSpace = THREE.SRGBColorSpace; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter; tex.anisotropy = 8; tex.needsUpdate = true;
    texs.push({ tex, x0: V.x0, z0: V.z0, w: V.w * V.cell, d: V.d * V.cell });
    kinds.push({ pk, cov, kind, kw, kd, step: 1 / (ppm / KS), x0: V.x0, z0: V.z0 });
  }

  /* ---------- подмес в шейдер земли: цвет текстуры парка по мировым x, z (из uv земли) ---------- */
  // зерно: повторяющийся шум 128 × 128 (плитка grain[0] м), вдали — среднее по мип-уровням
  const GS = 128, gd = new Uint8Array(GS * GS * 4), grng = mulberry32(77), gv = new Float32Array(GS * GS);
  for (let k = 0; k < GS * GS; k++) gv[k] = grng();
  for (let y = 0; y < GS; y++) for (let x = 0; x < GS; x++) {
    const v = (2 * gv[y * GS + x] + gv[y * GS + (x + 1) % GS] + gv[((y + 1) % GS) * GS + x]) / 4, o = (y * GS + x) * 4;
    gd[o] = gd[o + 1] = gd[o + 2] = v * 255; gd[o + 3] = 255;
  }
  const grain = new THREE.DataTexture(gd, GS, GS, THREE.RGBAFormat, THREE.UnsignedByteType);
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping; grain.generateMipmaps = true; grain.minFilter = THREE.LinearMipmapLinearFilter;
  grain.magFilter = THREE.LinearFilter; grain.anisotropy = 8; grain.needsUpdate = true;
  const [gTile, gAmp] = P.grain;
  const land = new THREE.Vector4(T.X0, T.Z0, T.X1 - T.X0, T.Z1 - T.Z0);
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey;
  mat.onBeforeCompile = (sh, r) => {
    if (prev && prev !== THREE.Material.prototype.onBeforeCompile) prev(sh, r);
    sh.uniforms.uPkLand = { value: land }; sh.uniforms.uPkGrain = { value: grain };
    let decl = 'uniform vec4 uPkLand;\nuniform sampler2D uPkGrain;\n', code = '';
    texs.forEach((t, n) => {
      sh.uniforms['uPkMap' + n] = { value: t.tex };
      sh.uniforms['uPkBox' + n] = { value: new THREE.Vector4(t.x0, t.z0, 1 / t.w, 1 / t.d) };
      decl += `uniform sampler2D uPkMap${n};\nuniform vec4 uPkBox${n};\n`;
      code += `{ vec4 pc = texture2D( uPkMap${n}, ( pkW - uPkBox${n}.xy ) * uPkBox${n}.zw ); sampledDiffuseColor.rgb = mix( sampledDiffuseColor.rgb, pc.rgb * pkG, pc.a ); }\n`;
    });
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + decl)
      .replace('#include <map_fragment>', `#ifdef USE_MAP
        vec4 sampledDiffuseColor = texture2D( map, vMapUv );
        vec2 pkW = uPkLand.xy + vMapUv * uPkLand.zw;
        float pkG = ${(1 - gAmp / 2).toFixed(3)} + ${gAmp.toFixed(3)} * texture2D( uPkGrain, pkW * ${(1 / gTile).toFixed(4)} ).r;
        ${code}
        diffuseColor *= sampledDiffuseColor;
      #endif`);
  };
  mat.customProgramCacheKey = () => 'park' + texs.length + (prevKey && prevKey !== THREE.Material.prototype.customProgramCacheKey ? prevKey.call(mat) : '');
  mat.needsUpdate = true;

  /* ---------- для ленты улиц и покрытия под колёсами ---------- */
  // кусок улицы st в точке q (середина куска ленты) нарисован землёй парка — ленту не строить
  K.parkSkip = (st, x, z, deck) => !deck && kinds.some(k => k.cov.isPath(st) && k.cov.inside(x, z));
  // вид покрытия в точке (st — улица под колесом: только дорожки парка) или null
  K.parkKind = (x, z, st) => {
    for (const k of kinds) {
      if (st && !k.cov.isPath(st)) continue;
      const i = Math.floor((x - k.x0) / k.step), j = Math.floor((z - k.z0) / k.step);
      if (i < 0 || j < 0 || i >= k.kw || j >= k.kd) continue;
      const c = k.kind[j * k.kw + i];
      if (c) return P.kind[c];
    }
    return null;
  };
  K.parkCoverStats = kinds.map(k => ({ id: k.pk.id, ...k.cov.stats, tex: [k.kw * 2, k.kd * 2] }));
  return mat;
}

/* ==================== мини-карта: классы цветом с отмывкой рельефа парка ==================== */
function sitgesParkMinimap(C, ctx, X, Z) {
  const P = SITGES_PARK_COVER;
  for (const pk of C.parks || []) {
    const V = pk.cover, cov = sitgesParkCover(C, pk), cv = document.createElement('canvas');
    cv.width = V.w; cv.height = V.d;
    const cx = cv.getContext('2d'), img = cx.createImageData(V.w, V.d), d = img.data;
    const rgb = P.mm.map(h => h ? [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)] : null);
    for (let j = 0; j < V.d; j++) for (let i = 0; i < V.w; i++) {
      const k = j * V.w + i, c = cov.cls[k];
      if (!c) continue;
      const x = V.x0 + (i + 0.5) * V.cell, z = V.z0 + (j + 0.5) * V.cell;
      // свет — как у отмывки мини-карты (с +x, +z), перепад на 6 м
      const sh = clamp(1 + (pk.heightAt(x + 3, z) - pk.heightAt(x - 3, z) + pk.heightAt(x, z + 3) - pk.heightAt(x, z - 3)) * P.mmShade, 0.72, 1.2);
      d[k * 4] = clamp(rgb[c][0] * sh, 0, 255); d[k * 4 + 1] = clamp(rgb[c][1] * sh, 0, 255); d[k * 4 + 2] = clamp(rgb[c][2] * sh, 0, 255); d[k * 4 + 3] = 255;
    }
    cx.putImageData(img, 0, 0);
    // клетка (i, j) → пиксели мини-карты: X и Z линейны (оси могут быть перевёрнуты)
    const sx = X(V.x0 + V.cell) - X(V.x0), sz = Z(V.z0 + V.cell) - Z(V.z0);
    ctx.save(); ctx.translate(X(V.x0), Z(V.z0)); ctx.scale(sx, sz); ctx.imageSmoothingEnabled = true;
    ctx.drawImage(cv, 0, 0);
    ctx.restore();
  }
}
