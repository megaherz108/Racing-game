// Ситжес — РАСКЛАДКА: мелочи улиц, этап 7 (план — docs/sitges/stage-7.md, «Каркас»). После дверей (doors.js) — последний
// этап раскладки перед мини-картой. Каркас 7.0: линии мест, карта занятости, вызов групп A → G (js/maps/sitges/st/*.js,
// объекты SITGES_ST_A … SITGES_ST_G; у не готовой группы — ready: false — plan не вызывается, карта та же).
// Сначала занято то, что уже стоит: калитки и ворота со съездом (C.gates), двери (C.doors), стволы (C.trees), «зебры»
// и переходы OSM, стелы и навесы вывесок (C.signs), бордюр скруглённых углов. Группы занимают своё по порядку.
// C.street = S (в plan групп) — данные (хешируются __game.fingerprint) и помощники-функции:
//   curbs   — бордюр полос тротуара (C.walks): { ax, az, bx, bz, nx, nz, len, w0, w1, si, side, wi } — отрезок кромки
//             у проезжей части, нормаль от бордюра к дому, ширина тротуара на концах, улица (индекс в C.streets),
//             сторона (0 — левая), индекс в C.walks. Подряд идущие отрезки одной стороны — цепочка (S.along).
//   corners — бордюр тротуаров скруглённых углов (C.cornerWalks): те же поля, wi = −1 − индекс угла в C.corners.
//   fronts  — наружный край полос тротуара (линия забора / фасадов): те же поля, нормаль — к улице.
//   edges   — край полотна улиц без тротуара (проезжие и пешеходные, не мосты): { ax, az, bx, bz, nx, nz, len, si, i,
//             side } — нормаль наружу от оси, i — отрезок оси.
//   walls   — куски стен домов к улице (вид street / shops, не строения h.lm): { ax, az, bx, bz, nx, nz, len, ga, gb,
//             lo, hi, h, kind } — нормаль наружу, земля у концов, низ и верх стены, индекс в C.houses (для кронштейнов).
//   zebras  — «зебры» у концов улиц (их рисует roads3d.js): { si, x0, z0, zx, zz, hw, len, sw } — начало и направление
//             вдоль улицы, полуширина полос, длина, ширина тротуара.
//   occ     — занятость: [{ x, z, x2, z2, r, who }] — капсула (отрезок с радиусом; круг — x2 = x, z2 = z), who — кто
//             занял: gate, car, door, tree, zebra, cross, sign, corner или буква группы.
//   groups  — { A: данные группы или null, … }; stats — сводка (занятость по who, линии, готовые группы).
// Помощники (функции S; spot — место: { x, z, tx, tz, nx, nz, ry, f, w, seg, s, L }; ry — поворот, при котором +z
//   модели смотрит по нормали, w — ширина тротуара в точке):
//   S.at(seg, f, off) — точка на доле f отрезка, сдвиг off м по нормали.
//   S.along(segs, step, fn, { start, end, retry, off }) — вдоль цепочек отрезков с шагом step: fn(spot) → true —
//     поставлено (дальше шаг), иначе — дальше retry м; start — первый от начала цепочки, end — не ближе к концу;
//     off — сдвиг по нормали, м, или функция (seg, f) → м. Возвращает число поставленных.
//   S.reserve(x, z, r, who, x2, z2) — занять круг или капсулу; S.hits(x, z, r, skip, x2, z2) — что пересекает;
//     S.free(x, z, r, skip, x2, z2) — свободно ли; skip — who (строка, список или функция), которых не считать.
//   S.nearest(list, x, z, maxD) — ближайший отрезок списка ('curbs', 'corners', 'fronts', 'edges', 'walls') не дальше
//     maxD: { seg, d, f } или null; S.onWalk(x, z) — точка на полосе тротуара: { seg, f, d (от бордюра), w } или null.
//   S.carriage(x, z) — проезжая часть под точкой (C.carriageAt); S.oldTown(x, z) — в кругах старого города;
//   S.hash(x, z, k) — число 0…1 по месту (без R(): раскладка остального города не меняется).
// Помощники каркаса 7.1 (перенесены из групп A, B, C; неперечисляемые — отпечаток C.street тот же):
//   S.axis(st, s) — точка оси улицы st (C.streets) на длине s м: { x, z, tx, tz, hw, sw, i, t, deck } — касательная,
//     полуширина полотна, sw — меньшая из ширин тротуаров концов отрезка [левый, правый], отрезок оси i и доля t на нём,
//     deck — отрезок на мосту (v[i].deck). S.project(st, x, z) — длина s ближайшей к точке точки оси.
//   S.near(x, z, ax, az, r, half = 0, d = 0.6, n = 3) — ближайшее свободное место: сдвиги вдоль (ax, az) на 0, ±d …
//     ±n·d, капсула ±half вдоль оси радиусом r (S.free) → [x, z] или null.
//   S.wallFit(x, z, nx, nz, y, { up, down, r, gap }) — высота вещи на стене к улице (точка на стене, нормаль наружу,
//     желаемая высота y): под плитой балкона (C.balconies), если вещь (от y − down до y + up, вдоль стены r м) её задевает;
//     null — вывеска (C.signs, кроме стел) той же стены ближе gap м. По умолчанию — кронштейн фонаря A (0,1 / 0,8 / 0,35 / 0,6).
// Использует: clamp (js/core.js); sitgesCells, sitgesSeg, SITGES_SEG (js/maps/sitges/geom.js); SITGES_OLDTOWN
//   (js/maps/sitges/styles.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const SITGES_ST = {
  cell: 8,          // клетка сетки занятости и поиска отрезков, м
  gate: 0.6,        // калитка и ворота: полоса вдоль проёма (с улицы), радиус, м
  car: 6,           // ворота: съезд поперёк тротуара до бордюра — на столько м от проёма к улице
  door: 0.8,        // дверь: полоса вдоль проёма перед стеной, радиус
  tree: 0.7,        // ствол с лункой
  zebra: 1.0,       // «зебра»: заступ на тротуар за бордюр, м
  cross: 1.6,       // переход OSM: полуширина полосы поперёк улицы
  corner: 1.0,      // бордюр скруглённого угла: радиус полосы вдоль него (пандусы, переходы)
  sign: 0.4,        // стела и навес вывески: запас к полуширине
};
// порядок групп в раскладке и постройке (фиксирован; заготовки — js/maps/sitges/st/*.js)
const SITGES_ST_GROUPS = [SITGES_ST_A, SITGES_ST_B, SITGES_ST_C, SITGES_ST_D, SITGES_ST_E, SITGES_ST_F, SITGES_ST_G];
// группы, которые вызываются: готовые по порядку и отладочная window.SITGES_ST_DEMO (tools/sitges/street-debug.js)
function sitgesStGroups() {
  const out = SITGES_ST_GROUPS.filter(g => g.ready);
  if (typeof window !== 'undefined' && window.SITGES_ST_DEMO && window.SITGES_ST_DEMO.ready) out.push(window.SITGES_ST_DEMO);
  return out;
}

// «Зебры»: конец улицы с тротуарами упирается в другую улицу — переход за её тротуаром (поперёк оси улицы в её точке
// на середине полос; ось у узла изгибается — сдвиг к середине между границами). Раньше считалось в roads3d.js —
// арифметика та же. → [{ si, x0, z0, zx, zz, hw, len, sw }]
function sitgesZebras(C) {
  const Z = SITGES_RB.zebra, out = [];
  C.streets.forEach((st, si) => {
    if (!st.drive || st.cls === 'service' || st.len < 30) return;
    const v = st.v;
    for (const end of [0, 1]) {
      const E = end ? v[v.length - 1] : v[0], q0 = end ? v[v.length - 2] : v[1];
      if (!(E.sw[0] > 0 && E.sw[1] > 0) || E.deck) continue;
      const O = C.carriageAt(E.x, E.z, st);
      if (!O) continue;
      const ow = O.st.v[O.i], margin = Math.max(ow.sw[0], ow.sw[1]) + 0.5;
      // идти от конца, пока точка в проезжей части другой улицы или её тротуаре
      const dir = [(q0.x - E.x), (q0.z - E.z)], dl = Math.hypot(...dir), ux = dir[0] / dl, uz = dir[1] / dl;
      let s = 0;
      while (s < 25 && C.carriageAt(E.x + ux * s, E.z + uz * s, st, margin)) s += 0.5;
      // скруглённые углы у этого конца: переход — сразу за точками касания (между прямыми участками бордюра)
      const ei = end ? v.length - 1 : 0;
      for (const c of C.cornersAt(E.x, E.z)) for (const X of [c.a, c.b]) if (X.st === st && X.i === ei) s = Math.max(s, end ? st.len - X.s : X.s);
      if (s >= 25 || s + 4 > st.len / 2) continue;
      const sm = s + 0.6 + Z.len / 2, sa = end ? st.len - sm : sm;
      let j = 0; while (j < v.length - 2 && v[j + 1].s < sa) j++;
      const qa = v[j], qb = v[j + 1], tq = clamp((sa - qa.s) / Math.max(1e-6, qb.s - qa.s), 0, 1);
      const tl = Math.hypot(qb.x - qa.x, qb.z - qa.z) || 1, sgn = end ? -1 : 1;
      const zx = (qb.x - qa.x) / tl * sgn, zz = (qb.z - qa.z) / tl * sgn;
      const x0 = qa.x + (qb.x - qa.x) * tq - zx * Z.len / 2, z0 = qa.z + (qb.z - qa.z) * tq - zz * Z.len / 2, hw = qa.hw + (qb.hw - qa.hw) * tq - 0.4;
      out.push({ si, x0, z0, zx, zz, hw, len: Z.len, sw: Math.max(qa.sw[0], qa.sw[1]) });
    }
  });
  return out;
}

function sitgesPlanStreet(C) {
  const P = SITGES_ST, W = SITGES_WALL, sIdx = new Map(C.streets.map((st, i) => [st, i]));
  const seg = (ax, az, bx, bz, ox, oz, e) => {     // отрезок с нормалью в сторону точки (ox, oz)
    const len = Math.hypot(bx - ax, bz - az) || 1e-6;
    let nx = -(bz - az) / len, nz = (bx - ax) / len;
    if ((ox - ax) * nx + (oz - az) * nz < 0) { nx = -nx; nz = -nz; }
    return Object.assign({ ax, az, bx, bz, nx, nz, len }, e);
  };

  /* ---------- линии мест ---------- */
  const curbs = [], fronts = [], corners = [], edges = [], walls = [];
  C.walks.forEach((w, wi) => {
    const si = sIdx.get(w.st), w0 = Math.hypot(w.O0[0] - w.I0[0], w.O0[1] - w.I0[1]), w1 = Math.hypot(w.O1[0] - w.I1[0], w.O1[1] - w.I1[1]);
    const mx = (w.O0[0] + w.O1[0]) / 2, mz = (w.O0[1] + w.O1[1]) / 2, ix = (w.I0[0] + w.I1[0]) / 2, iz = (w.I0[1] + w.I1[1]) / 2;
    curbs.push(seg(w.I0[0], w.I0[1], w.I1[0], w.I1[1], mx, mz, { w0, w1, si, side: w.side, wi }));
    fronts.push(seg(w.O0[0], w.O0[1], w.O1[0], w.O1[1], ix, iz, { w0, w1, si, side: w.side, wi }));
  });
  (C.cornerWalks || []).forEach((cw, ci) => {
    const c = C.corners[ci], si = sIdx.get(c.a.st);
    for (let k = 0; k < cw.ring.length - 1; k++) {
      const A = cw.ring[k], B = cw.ring[k + 1];
      if (A.w < 0.3 || B.w < 0.3) continue;
      corners.push(seg(A.I[0], A.I[1], B.I[0], B.I[1], (A.Ou[0] + B.Ou[0]) / 2, (A.Ou[1] + B.Ou[1]) / 2, { w0: A.w, w1: B.w, si, side: c.a.side, wi: -1 - ci }));
    }
  });
  C.streets.forEach((st, si) => {
    if (!st.drive && st.cls !== 'pedestrian') return;
    const v = st.v;
    for (let i = 0; i + 1 < v.length; i++) {
      const a = v[i], b = v[i + 1];
      if (a.deck) continue;
      for (const side of [0, 1]) {
        if (a.sw[side] > 0 || b.sw[side] > 0) continue;
        const sg = side ? -1 : 1, ox = (a.x + b.x) / 2, oz = (a.z + b.z) / 2;
        const ax = a.x - a.tz * a.hw * sg, az = a.z + a.tx * a.hw * sg, bx = b.x - b.tz * b.hw * sg, bz = b.z + b.tx * b.hw * sg;
        const e = seg(ax, az, bx, bz, ox, oz, { si, i, side });
        e.nx = -e.nx; e.nz = -e.nz;                  // наружу от оси
        edges.push(e);
      }
    }
  });
  C.houses.forEach((h, hi) => {
    if (h.lm) return;
    for (const w of h.walls) if (w.kind === W.street || w.kind === W.shops) {
      const len = Math.hypot(w.bx - w.ax, w.bz - w.az);
      if (len > 0.3) walls.push({ ax: w.ax, az: w.az, bx: w.bx, bz: w.bz, nx: w.nx, nz: w.nz, len, ga: w.ga, gb: w.gb, lo: w.lo, hi: w.hi, h: hi, kind: w.kind });
    }
  });
  const zebras = sitgesZebras(C);

  /* ---------- поиск отрезков по клеткам ---------- */
  const lists = { curbs, corners, fronts, edges, walls }, idx = {};
  const cellsOf = name => {
    if (idx[name]) return idx[name];
    const g = idx[name] = sitgesCells(P.cell);
    for (const s of lists[name]) g.add(Math.min(s.ax, s.bx), Math.max(s.ax, s.bx), Math.min(s.az, s.bz), Math.max(s.az, s.bz), s);
    return g;
  };
  const nearest = (name, x, z, maxD = 5) => {
    const g = cellsOf(name), got = new Set();
    let best = null, bd = maxD;
    g.each(x - maxD, x + maxD, z - maxD, z + maxD, l => {
      for (const s of l) {
        if (got.has(s)) continue;
        got.add(s);
        const d = sitgesSeg(x, z, s.ax, s.az, s.bx, s.bz);
        if (d <= bd) { bd = d; best = { seg: s, d, f: SITGES_SEG.t }; }
      }
    });
    return best;
  };
  const onWalk = (x, z) => {
    const g = cellsOf('curbs'), got = new Set();
    let out = null;
    g.each(x - 6, x + 6, z - 6, z + 6, l => {
      for (const s of l) {
        if (out || got.has(s)) continue;
        got.add(s);
        const f = ((x - s.ax) * (s.bx - s.ax) + (z - s.az) * (s.bz - s.az)) / (s.len * s.len);
        if (f < 0 || f > 1) continue;
        const d = (x - s.ax) * s.nx + (z - s.az) * s.nz, w = s.w0 + (s.w1 - s.w0) * f;
        if (d >= 0 && d <= w) out = { seg: s, f, d, w };
      }
    });
    return out;
  };

  /* ---------- места вдоль линий ---------- */
  const at = (s, f, off = 0) => {
    const tx = (s.bx - s.ax) / s.len, tz = (s.bz - s.az) / s.len;
    return { x: s.ax + (s.bx - s.ax) * f + s.nx * off, z: s.az + (s.bz - s.az) * f + s.nz * off, tx, tz, nx: s.nx, nz: s.nz,
      ry: Math.atan2(s.nx, s.nz), f, w: s.w0 === undefined ? 0 : s.w0 + (s.w1 - s.w0) * f, seg: s };
  };
  const along = (segs, step, fn, { start = step / 2, end = 0.5, retry = 1, off = 0 } = {}) => {
    let n = 0;
    for (let i = 0; i < segs.length;) {
      let j = i + 1;                               // цепочка: следующий начинается там, где кончился предыдущий
      while (j < segs.length && Math.hypot(segs[j].ax - segs[j - 1].bx, segs[j].az - segs[j - 1].bz) < 0.15) j++;
      let L = 0; for (let k = i; k < j; k++) L += segs[k].len;
      let s = start, k = i, s0 = 0;
      while (s <= L - end) {
        while (k < j - 1 && s > s0 + segs[k].len) { s0 += segs[k].len; k++; }
        const f = clamp((s - s0) / segs[k].len, 0, 1), sp = at(segs[k], f, typeof off === 'function' ? off(segs[k], f) : off);
        sp.s = s; sp.L = L;
        if (fn(sp)) { n++; s += step; } else s += retry;
      }
      i = j;
    }
    return n;
  };

  /* ---------- занятость ---------- */
  const occ = [], occCells = sitgesCells(P.cell);
  const reserve = (x, z, r, who, x2 = x, z2 = z) => {
    const o = { x, z, x2, z2, r, who };
    occ.push(o);
    occCells.add(Math.min(x, x2) - r, Math.max(x, x2) + r, Math.min(z, z2) - r, Math.max(z, z2) + r, o);
    return o;
  };
  // расстояние между отрезками a–b и c–d (концы-точки — вырожденные отрезки)
  const segSeg = (ax, az, bx, bz, cx, cz, dx, dz) => {
    const ux = bx - ax, uz = bz - az, vx = dx - cx, vz = dz - cz, den = ux * vz - uz * vx;
    if (Math.abs(den) > 1e-9) {
      const t = ((cx - ax) * vz - (cz - az) * vx) / den, u = ((cx - ax) * uz - (cz - az) * ux) / den;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0;
    }
    return Math.min(sitgesSeg(ax, az, cx, cz, dx, dz), sitgesSeg(bx, bz, cx, cz, dx, dz), sitgesSeg(cx, cz, ax, az, bx, bz), sitgesSeg(dx, dz, ax, az, bx, bz));
  };
  const hits = (x, z, r = 0, skip = null, x2 = x, z2 = z) => {
    const no = skip == null ? null : typeof skip === 'function' ? skip : Array.isArray(skip) ? w => skip.includes(w) : w => w === skip;
    const out = [], got = new Set();
    occCells.each(Math.min(x, x2) - r, Math.max(x, x2) + r, Math.min(z, z2) - r, Math.max(z, z2) + r, l => {
      for (const o of l) {
        if (got.has(o)) continue;
        got.add(o);
        if (no && no(o.who)) continue;
        if (segSeg(x, z, x2, z2, o.x, o.z, o.x2, o.z2) < r + o.r) out.push(o);
      }
    });
    return out;
  };
  const free = (x, z, r = 0, skip = null, x2 = x, z2 = z) => hits(x, z, r, skip, x2, z2).length === 0;

  /* ---------- уже занято ---------- */
  for (const g of C.gates || []) {                  // калитки и ворота: полоса вдоль проёма с улицы; у ворот — съезд
    const tx = -g.nz, tz = g.nx, h = g.w / 2, ox = g.x - g.nx * 0.4, oz = g.z - g.nz * 0.4;
    reserve(ox - tx * h, oz - tz * h, P.gate, 'gate', ox + tx * h, oz + tz * h);
    if (g.kind === 'car') reserve(g.x, g.z, h + 0.3, 'car', g.x - g.nx * P.car, g.z - g.nz * P.car);
  }
  for (const d of C.doors || []) {                  // двери: полоса перед проёмом
    const tx = -d.nz, tz = d.nx, h = d.w / 2, ox = d.x + d.nx * 0.6, oz = d.z + d.nz * 0.6;
    reserve(ox - tx * h, oz - tz * h, P.door, 'door', ox + tx * h, oz + tz * h);
  }
  for (const t of C.trees || []) if (t.p === 'street' || t.p === 'fill' || onWalk(t.x, t.z)) reserve(t.x, t.z, P.tree, 'tree');
  for (const Zb of zebras) {                         // «зебра»: поперёк улицы от тротуара до тротуара
    const cx = Zb.x0 + Zb.zx * Zb.len / 2, cz = Zb.z0 + Zb.zz * Zb.len / 2, e = Zb.hw + 0.4 + Zb.sw + P.zebra;
    reserve(cx + Zb.zz * e, cz - Zb.zx * e, Zb.len / 2 + 0.3, 'zebra', cx - Zb.zz * e, cz + Zb.zx * e);
  }
  for (const [x, z] of (C.points && C.points.crossing) || []) {   // переходы OSM: поперёк улицы, у угла — кругом
    const c = C.carriageAt(x, z);
    if (!c || c.corner) { reserve(x, z, P.cross + 1, 'cross'); continue; }
    const a = c.st.v[c.i], b = c.st.v[c.i + 1], L = Math.hypot(b.x - a.x, b.z - a.z) || 1, tx = (b.x - a.x) / L, tz = (b.z - a.z) / L;
    const e = a.hw + Math.max(a.sw[0], a.sw[1]) + 0.5;
    reserve(x - tz * e, z + tx * e, P.cross, 'cross', x + tz * e, z - tx * e);
  }
  for (const s of C.signs || []) if (s.form === 'totem' || s.form === 'canopy') reserve(s.x, s.z, s.w / 2 + P.sign, 'sign');
  for (const s of corners) reserve(s.ax, s.az, P.corner, 'corner', s.bx, s.bz);

  /* ---------- ось улицы (7.1) ---------- */
  // точка оси улицы st на длине s (м от начала; вне 0…st.len — у конца): поиск отрезка делением пополам
  const axis = (st, s) => {
    const v = st.v;
    s = clamp(s, 0, st.len);
    let lo = 0, hi = v.length - 2;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (v[m].s <= s) lo = m; else hi = m - 1; }
    const a = v[lo], b = v[lo + 1], t = clamp((s - a.s) / Math.max(1e-6, b.s - a.s), 0, 1), dl = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, tx: (b.x - a.x) / dl, tz: (b.z - a.z) / dl, hw: a.hw + (b.hw - a.hw) * t,
      sw: [Math.min(a.sw[0], b.sw[0]), Math.min(a.sw[1], b.sw[1])], i: lo, t, deck: !!a.deck };
  };
  // длина s ближайшей к (x, z) точки оси улицы st
  const project = (st, x, z) => {
    const v = st.v;
    let best = 0, bd = Infinity;
    for (let i = 0; i + 1 < v.length; i++) {
      const a = v[i], b = v[i + 1], dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1e-9;
      const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / L2, 0, 1), px = a.x + dx * t - x, pz = a.z + dz * t - z, d = px * px + pz * pz;
      if (d < bd) { bd = d; best = a.s + (b.s - a.s) * t; }
    }
    return best;
  };

  /* ---------- свободное место рядом (7.1) ---------- */
  // сдвиги вдоль (ax, az) на 0, −d, +d, −2d, +2d … до ±n·d; капсула ±half вдоль оси радиусом r → [x, z] или null
  const near = (x, z, ax, az, r, half = 0, d = 0.6, n = 3) => {
    for (let k = 0; k <= n * 2; k++) {
      const u = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * d, px = x + ax * u, pz = z + az * u;
      if (free(px - ax * half, pz - az * half, r, null, px + ax * half, pz + az * half)) return [px, pz];
    }
    return null;
  };

  /* ---------- плиты балконов и вывески на стенах (7.1) ---------- */
  // клетки: плиты C.balconies и вывески C.signs (кроме стел) — строятся при первом вызове wallFit
  let onWall = null;
  const wallCells = () => {
    if (onWall) return onWall;
    onWall = sitgesCells(8);
    for (const b of C.balconies || []) onWall.add(Math.min(b.ax, b.bx), Math.max(b.ax, b.bx), Math.min(b.az, b.bz), Math.max(b.az, b.bz), { b });
    for (const g of C.signs || []) if (g.form !== 'totem') onWall.add(g.x - g.w / 2, g.x + g.w / 2, g.z - g.w / 2, g.z + g.w / 2, { g });
    return onWall;
  };
  // высота вещи на стене в точке (x, z) с нормалью (nx, nz), желаемая — y: вещь по высоте от y − down до y + up, вдоль
  // стены — r м до плиты; плита балкона мешает — опустить под неё (до трёх плит подряд); вывеска той же стены ближе
  // gap м (вдоль от края, по высоте от середины вещи) — null
  const wallFit = (x, z, nx, nz, y, { up = 0.1, down = 0.8, r = 0.35, gap = 0.6 } = {}) => {
    const W = wallCells(), mid = (down - up) / 2;
    let ok = true;
    for (let pass = 0; pass < 3; pass++) {           // опустились под плиту — проверить плиту ниже
      let moved = false;
      W.each(x - 1, x + 1, z - 1, z + 1, l => {
        for (const o of l) {
          if (o.g) {
            const g = o.g;
            if (g.nx * nx + g.nz * nz > 0.7 && Math.hypot(g.x - x, g.z - z) < g.w / 2 + gap && Math.abs(g.y - y + mid) < g.h / 2 + gap) ok = false;
            continue;
          }
          const b = o.b;
          if (b.nx * nx + b.nz * nz < 0.7 || sitgesSeg(x, z, b.ax, b.az, b.bx, b.bz) > r) continue;
          if (y + up > b.y - b.t - 0.05 && y - down < b.y + 1.1) { y = b.y - b.t - up - 0.02; moved = true; }
        }
      });
      if (!moved) break;
    }
    return ok ? y : null;
  };

  /* ---------- группы A → G ---------- */
  const S = C.street = {
    curbs, corners, fronts, edges, walls, zebras, occ, groups: {}, stats: null,
    at, along, reserve, hits, free, onWalk, nearest,
    carriage: (x, z) => C.carriageAt(x, z),
    oldTown: (x, z) => SITGES_OLDTOWN.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r),
    hash: (x, z, k = 0) => {
      let h = Math.imul(Math.round(x * 10), 73856093) ^ Math.imul(Math.round(z * 10), 19349663) ^ Math.imul(k + 1, 83492791);
      h = Math.imul(h ^ (h >>> 13), 0x5bd1e995); h ^= h >>> 15;
      return (h >>> 0) / 4294967296;
    },
  };
  // помощники 7.1 — неперечисляемые: отпечаток (__game.fingerprint) пишет и имена функций, C.street не меняется
  for (const [k, fn] of Object.entries({ axis, project, near, wallFit })) Object.defineProperty(S, k, { value: fn });
  const base = occ.length;
  for (const g of SITGES_ST_GROUPS) S.groups[g.id] = null;
  for (const g of sitgesStGroups()) S.groups[g.id] = g.plan(C, S) || {};
  const byWho = {};
  for (const o of occ) byWho[o.who] = (byWho[o.who] || 0) + 1;
  S.stats = { occ: byWho, base, curbs: curbs.length, corners: corners.length, fronts: fronts.length, edges: edges.length, walls: walls.length,
    zebras: zebras.length, ready: sitgesStGroups().map(g => g.id) };
}
