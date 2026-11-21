// Ситжес — РАСКЛАДКА: мелочи улиц, этап 7 (план — docs/sitges/stage-7.md, «Каркас»). После дверей (doors.js) — последний
// этап раскладки перед мини-картой. Каркас 7.0: линии мест, карта занятости, вызов групп A → G (js/maps/sitges/st/<группа>.js,
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
// Помощники каркаса 7.2 (из группы F; тоже неперечисляемые):
//   S.probe(x, z, nx, nz, g0, o) — луч от стены по нормали «до чего свободно»: { U, why, ped } — U — последняя свободная
//     точка, м; why: house (дом), road (проезжая часть, угол; пешеходная улица — не конец, ped = true), fence (забор),
//     drop (перепад рельефа больше drop от высоты g0 или вода), open (до max); o — { step, max, start, drop, sea }
//     вместо SITGES_ST.probe.
//   S.fenceCut(x0, z0, x1, z1) — отрезок пересекает забор (C.fences); S.coastD(x, z, R) — до линии берега (C.coast), ≤ R.
//   skip в S.hits / S.free — функция получает и сам элемент занятости: skip(who, o) — исключения по месту (кронштейн
//     высоко на стене, своя дверь); зовётся только для пересекающих.
// Стена (7.2, из группы D; глобальные функции — рельеф у стены правится до улиц, из sitgesPlanTerrain):
//   вид — { pts: [[x, z, nx, nz, низ, верх]], a: [длина до точки] }, нормаль — к верхней стороне.
//   sitgesStWallLen(pts) → a; sitgesStWallAt(w, a) — точка на длине a: { x, z, nx, nz, foot, top, i, t }.
//   sitgesStWallNear(T, walls, R, ext) — ближайший отрезок стены у узлов сетки рельефа (C.terra) ближе R м: Map узел →
//     { d, s (со знаком по нормали), foot, top, inside (напротив стены или за концом не дальше ext) }.
//   sitgesStWallGround(T, near, { band, flat, raise, lowFoot, rest }) — ложбина у стены (узлы ближе band — на низ; её
//     накрывает настил группы) и подъём за стеной (до flat — не ниже верха, до raise — плавно); lowFoot, rest — правила
//     нижней стороны (у D — профиль пляжа). → { band, up }.
// Определяет: SITGES_ST, SITGES_ST_GROUPS, sitgesStGroups, sitgesStHash, sitgesStWallLen, sitgesStWallAt,
//   sitgesStWallNear, sitgesStWallGround, sitgesZebras, sitgesPlanStreet.
// Использует: clamp (js/core.js); smooth01 (js/world.js); sitgesCells, sitgesSeg, SITGES_SEG
//   (js/maps/sitges/geom.js); SITGES_WALL (js/maps/sitges/houses.js); SITGES_OLDTOWN (js/maps/sitges/styles.js);
//   SITGES_ST_A (js/maps/sitges/st/lamps.js); SITGES_ST_B (js/maps/sitges/st/marks.js); SITGES_ST_C
//   (js/maps/sitges/st/furniture.js); SITGES_ST_D (js/maps/sitges/st/promenade.js); SITGES_ST_E
//   (js/maps/sitges/st/beach.js); SITGES_ST_F (js/maps/sitges/st/terraces.js); SITGES_ST_G
//   (js/maps/sitges/st/slopes.js); SITGES_RB (js/maps/sitges/roads3d.js).
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
  // луч от стены S.probe (7.2): шаг, дальше max м — открыто, первая точка в start м; перепад рельефа больше drop м
  // или земля ниже sea м — конец (drop)
  probe: { step: 0.25, max: 8, start: 0.3, drop: 0.6, sea: 0.2 },
};
// порядок групп в раскладке и постройке (фиксирован; заготовки — js/maps/sitges/st/<группа>.js)
const SITGES_ST_GROUPS = [SITGES_ST_A, SITGES_ST_B, SITGES_ST_C, SITGES_ST_D, SITGES_ST_E, SITGES_ST_F, SITGES_ST_G];
// группы, которые вызываются: готовые по порядку и отладочная window.SITGES_ST_DEMO (tools/sitges/street-debug.js)
function sitgesStGroups() {
  const out = SITGES_ST_GROUPS.filter(g => g.ready);
  if (typeof window !== 'undefined' && window.SITGES_ST_DEMO && window.SITGES_ST_DEMO.ready) out.push(window.SITGES_ST_DEMO);
  return out;
}

// число 0…1 по месту (x, z с точностью 0,1 м) и ключу k — вместо R() в раскладке и постройке мелочей (S.hash, K.st.hash)
function sitgesStHash(x, z, k = 0) {
  let h = Math.imul(Math.round(x * 10), 73856093) ^ Math.imul(Math.round(z * 10), 19349663) ^ Math.imul(k + 1, 83492791);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/* ---------- стена: ломаная + низ / верх + нормаль (7.2, из группы D) ---------- */
// Стена — { pts: [[x, z, nx, nz, низ, верх]], a: [длина от начала до точки] }; нормаль — к верхней стороне (суша
// у набережной). Рельеф у стены — до улиц (из sitgesPlanTerrain), поэтому помощники — глобальные функции, не S.
// длины вдоль ломаной pts → a
function sitgesStWallLen(pts) {
  const a = [0];
  for (let i = 1; i < pts.length; i++) a.push(a[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return a;
}
// точка стены на длине a (м вдоль): { x, z, nx, nz, foot, top, i, t } — по точкам w.pts и длинам w.a (за концами — продолжение)
function sitgesStWallAt(w, a) {
  const p = w.pts, A = w.a, n = p.length;
  let i = 0;
  if (a >= A[n - 1]) i = n - 2;
  else if (a > 0) { let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (A[m] <= a) lo = m; else hi = m; } i = lo; }
  const q = p[i], r = p[i + 1], L = A[i + 1] - A[i] || 1e-6, t = (a - A[i]) / L, u = clamp(t, 0, 1);
  let nx = q[2] + (r[2] - q[2]) * u, nz = q[3] + (r[3] - q[3]) * u;
  const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
  return { x: q[0] + (r[0] - q[0]) * t, z: q[1] + (r[1] - q[1]) * t, nx, nz, foot: q[4] + (r[4] - q[4]) * u, top: q[5] + (r[5] - q[5]) * u, i, t: u };
}
// ближайший отрезок стены у каждого узла сетки рельефа T (C.terra) ближе R м к стенам walls (нужны только pts):
// Map индекс узла → { d — до стены, s — со знаком по нормали (> 0 — верхняя сторона), foot, top — низ и верх стены
// напротив, inside — напротив стены или за её концом не дальше ext м }
function sitgesStWallNear(T, walls, R, ext) {
  const { NX, NZ, S: GS, X0, Z0 } = T, near = new Map();
  for (const w of walls) {
    const p = w.pts, n = p.length;
    for (let i = 0; i + 1 < n; i++) {
      const [ax, az, anx, anz, af, at] = p[i], [bx, bz, bnx, bnz, bf, bt] = p[i + 1];
      const L = Math.hypot(bx - ax, bz - az) || 1e-6;
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - R - X0) / GS)), i1 = Math.min(NX - 1, Math.ceil((Math.max(ax, bx) + R - X0) / GS));
      const j0 = Math.max(0, Math.floor((Math.min(az, bz) - R - Z0) / GS)), j1 = Math.min(NZ - 1, Math.ceil((Math.max(az, bz) + R - Z0) / GS));
      for (let j = j0; j <= j1; j++) for (let ii = i0; ii <= i1; ii++) {
        const k = j * NX + ii, x = X0 + ii * GS, z = Z0 + j * GS;
        const tr = ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / (L * L), t = clamp(tr, 0, 1);
        const cx = ax + (bx - ax) * t, cz = az + (bz - az) * t, d = Math.hypot(x - cx, z - cz);
        const o = near.get(k);
        if (o && o.d <= d) continue;
        const nx = anx + (bnx - anx) * t, nz = anz + (bnz - anz) * t;
        // за концом цепочки — не дальше ext м (там ещё стена и настил)
        const over = tr < 0 && i === 0 ? -tr * L : tr > 1 && i + 2 === n ? (tr - 1) * L : 0;
        near.set(k, { d, s: (x - cx) * nx + (z - cz) * nz, foot: af + (bf - af) * t, top: at + (bt - at) * t, inside: over <= ext && (t > 0 && t < 1 || over > 0 || d < 0.5 * GS) });
      }
    }
  }
  return near;
}
// рельеф у стены по near (sitgesStWallNear): сетка 2,5 м не держит отвесную ступень, поэтому узлы ближе band м к стене
// с обеих сторон — на уровне низа (ложбину за стеной накрывает настил группы на верху стены, со своими столкновениями
// и S.walk), за стеной до flat м — не ниже верха, дальше до raise м — плавно к прежнему. lowFoot(k, h, n) — высота
// узла нижней стороны в полосе band (по умолчанию min(h, низ)); rest(k, h, n) — остальные узлы near (своё правило
// нижней стороны). Море и мелководье (T.sea, T.thin) не трогаются. → { band, up } — узлов в полосе и поднятых
function sitgesStWallGround(T, near, { band, flat, raise, lowFoot = (k, h, n) => Math.min(h, n.foot), rest = null }) {
  const { H, sea, thin } = T;
  let nb = 0, up = 0;
  for (const [k, n] of near) {
    if (sea[k] || thin[k]) continue;
    const h = H[k];
    if (n.inside && Math.abs(n.s) <= band) { H[k] = n.s <= 0 ? lowFoot(k, h, n) : n.foot; nb++; }
    else if (n.inside && n.s > 0 && n.s <= raise) { const v = Math.max(h, n.top + (h - n.top) * smooth01((n.s - flat) / (raise - flat))); if (v > h) up++; H[k] = v; }
    else if (rest) rest(k, h, n);
  }
  return { band: nb, up };
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
        if (segSeg(x, z, x2, z2, o.x, o.z, o.x2, o.z2) >= r + o.r || no && no(o.who, o)) continue;
        out.push(o);
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

  /* ---------- заборы, берег, луч от стены (7.2, из группы F) ---------- */
  // клетки отрезков заборов C.fences и берега C.coast — строятся при первом вызове
  let fenceC = null, coastC = null;
  const fenceCells = () => {
    if (fenceC) return fenceC;
    fenceC = sitgesCells(16);
    for (const f of C.fences || []) for (let k = 1; k < f.P.length; k++) {
      const a = f.P[k - 1], b = f.P[k];
      fenceC.add(Math.min(a[0], b[0]), Math.max(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[1], b[1]), [a, b]);
    }
    return fenceC;
  };
  // отрезки a–b и c–d пересекаются (строго: касание концом не считается)
  const crosses = (ax, az, bx, bz, cx, cz, dx, dz) => {
    const d1 = (bx - ax) * (cz - az) - (bz - az) * (cx - ax), d2 = (bx - ax) * (dz - az) - (bz - az) * (dx - ax);
    const d3 = (dx - cx) * (az - cz) - (dz - cz) * (ax - cx), d4 = (dx - cx) * (bz - cz) - (dz - cz) * (bx - cx);
    return d1 * d2 < 0 && d3 * d4 < 0;
  };
  // отрезок (x0, z0)–(x1, z1) пересекает забор
  const fenceCut = (x0, z0, x1, z1) => {
    let hit = false;
    fenceCells().each(Math.min(x0, x1), Math.max(x0, x1), Math.min(z0, z1), Math.max(z0, z1), l => {
      if (!hit) for (const [a, b] of l) if (crosses(x0, z0, x1, z1, a[0], a[1], b[0], b[1])) { hit = true; break; }
    });
    return hit;
  };
  // расстояние до линии берега, не больше R
  const coastD = (x, z, R) => {
    if (!coastC) {
      coastC = sitgesCells(64);
      for (const l of C.coast || []) for (let i = 1; i < l.length; i++) { const a = l[i - 1], b = l[i]; coastC.add(Math.min(a[0], b[0]), Math.max(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[1], b[1]), [a, b]); }
    }
    let d = R;
    coastC.each(x - R, x + R, z - R, z + R, list => { for (const [a, b] of list) d = Math.min(d, sitgesSeg(x, z, a[0], a[1], b[0], b[1])); });
    return d;
  };
  // луч от стены (x, z) по нормали (nx, nz) с шагом step от start до max м: до чего свободно → { U, why, ped } — U — последняя
  // свободная точка, why: house (дом), road (проезжая часть, угол), fence (забор), drop (перепад рельефа больше drop
  // от g0 или земля ниже sea — вода), open (свободно до max); ped — по пути была пешеходная улица (не конец)
  const probe = (x, z, nx, nz, g0, o = {}) => {
    const { step, max, start, drop, sea } = Object.assign({}, P.probe, o);
    let px = x + nx * (start - step), pz = z + nz * (start - step), ped = false;
    for (let v = start; v <= max; v += step) {
      const qx = x + nx * v, qz = z + nz * v;
      const stop = why => ({ U: v - step, why, ped });
      if (C.houseAt(qx, qz)) return stop('house');
      const c = C.carriageAt(qx, qz);
      if (c) { if (c.corner || c.st.cls !== 'pedestrian') return stop('road'); ped = true; }
      const g = C.ground(qx, qz);
      if (g < sea || Math.abs(g - g0) > drop) return stop('drop');
      if (fenceCut(px, pz, qx, qz)) return stop('fence');
      px = qx; pz = qz;
    }
    return { U: max, why: 'open', ped };
  };

  /* ---------- группы A → G ---------- */
  const S = C.street = {
    curbs, corners, fronts, edges, walls, zebras, occ, groups: {}, stats: null,
    at, along, reserve, hits, free, onWalk, nearest,
    carriage: (x, z) => C.carriageAt(x, z),
    oldTown: (x, z) => SITGES_OLDTOWN.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r),
    hash: sitgesStHash,
  };
  // помощники 7.1 и 7.2 — неперечисляемые: отпечаток (__game.fingerprint) пишет и имена функций, C.street не меняется
  for (const [k, fn] of Object.entries({ axis, project, near, wallFit, fenceCut, coastD, probe })) Object.defineProperty(S, k, { value: fn });
  const base = occ.length;
  for (const g of SITGES_ST_GROUPS) S.groups[g.id] = null;
  for (const g of sitgesStGroups()) S.groups[g.id] = g.plan(C, S) || {};
  const byWho = {};
  for (const o of occ) byWho[o.who] = (byWho[o.who] || 0) + 1;
  S.stats = { occ: byWho, base, curbs: curbs.length, corners: corners.length, fronts: fronts.length, edges: edges.length, walls: walls.length,
    zebras: zebras.length, ready: sitgesStGroups().map(g => g.id) };
}
