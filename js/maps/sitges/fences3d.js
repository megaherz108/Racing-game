// Ситжес — ПОСТРОЙКА: простые заборы (этап 3б; виды по фото и районам — этап 4а). После тротуаров (walks3d.js).
//   Линия — наружная кромка тротуаров и углов (K.rk.edges), а у проезжих улиц без тротуара — край проезжей части.
//   Забор стоит там, где за линией участок кадастра (не сельский), но не дом (фасад вплотную — старый город), не
//   другая улица, тротуар, дорожка или вода. Решение — по кускам ≈ 1 м; куски вдоль кромки сцеплены в цепочки,
//   дыры короче SITGES_FENCE.gap заполняются, огрызки короче minRun убираются.
//   Вид один: белый оштукатуренный цоколь h0 с серой шапкой, над ним тёмная решётка до h1 (текстура с альфой, столбы
//   в текстуре через 2,5 м). Геометрия — в копилку улиц (K.rk: quad, склейка по квадратам), столкновения — стенки
//   высотой h1 с двух сторон цоколя в сетке тротуаров (cquad).
// Определяет: SITGES_FENCE, sitgesFenceTextures, sitgesBuildFences.
// Использует: MAT (js/core.js); canvasTex (js/maps/city/textures.js); sitgesCells, sitgesBBox, sitgesInPoly,
//   sitgesSeg (js/maps/sitges/geom.js); sitgesInFillet (js/maps/sitges/corners.js); SITGES_RB
//   (js/maps/sitges/roads3d.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const SITGES_FENCE = {
  h0: 1.0,          // цоколь, м (над тротуаром)
  h1: 2.0,          // верх решётки, м
  t: 0.22,          // толщина цоколя, м
  cap: 0.03,        // шапка цоколя выступает с каждой стороны, м
  bay: 2.5,         // пролёт решётки (столбы в текстуре), м
  // меши квадратами chunk м; дальше far м от камеры не рисуются (решётка вдали всё равно растворяется в мипмапах)
  chunk: 160, far: { plaster: 350, grille: 140 },
  step: 1.0,        // кусок решения «забор / нет», м
  gap: 1.6,         // дыру короче — заполнить
  minRun: 2.4,      // забор короче — не ставить
  lot: [0.4, 1.2, 2.2],   // участок ищется за линией на таких расстояниях
  house: [0.15, 0.6, 1.2], // дом ближе — забора нет (фасад вплотную)
};

function sitgesFenceTextures() {
  // решётка 2,5 × 1 м: рама, вертикальные прутья через 12 см, столб у левого края (прозрачность — alphaTest)
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const x = c.getContext('2d'), m = '#2a302c';
  x.fillStyle = m;
  for (let u = 6; u < 256; u += 12.3) x.fillRect(u, 0, 3, 128);
  x.fillRect(0, 0, 256, 7); x.fillRect(0, 112, 256, 6);
  x.fillStyle = '#353c37'; x.fillRect(0, 0, 11, 128);
  // штукатурка: белая с лёгкими пятнами, 2 м
  const p = document.createElement('canvas'); p.width = p.height = 128;
  const y = p.getContext('2d');
  y.fillStyle = '#eeeae2'; y.fillRect(0, 0, 128, 128);
  let s = 7;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 2600; i++) { y.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '90,80,60'},${rnd() * 0.07})`; y.fillRect(rnd() * 128, rnd() * 128, 1 + rnd() * 3, 1 + rnd() * 3); }
  const tex = cv => { const t = canvasTex(cv); t.generateMipmaps = true; return t; };
  return { grille: tex(c), plaster: tex(p) };
}

function sitgesBuildFences(K) {
  const { D, rk } = K, C = D.C, F = SITGES_FENCE, g = D.ground, t0 = performance.now();
  const { MAT, quad, UP, cquad, walks, cnt, offs, edges, lod } = rk;
  lod.plaster = [F.chunk, F.far.plaster]; lod.grille = [F.chunk, F.far.grille];
  const TX = sitgesFenceTextures();
  MAT.plaster = new THREE.MeshStandardMaterial({ name: 'fence-plaster', map: TX.plaster, roughness: 0.92, vertexColors: true });
  MAT.grille = new THREE.MeshStandardMaterial({ name: 'fence-grille', map: TX.grille, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.3, vertexColors: true });

  /* ---------- что за линией ---------- */
  // участки кадастра (не сельские) по клеткам
  const lots = sitgesCells(32);
  for (const p of C.parcels) if (!p.rustic) { const bb = sitgesBBox(p.ring); lots.add(...bb, { r: p.ring, bb }); }
  const inLot = (x, z) => lots.at(x, z).some(o => x >= o.bb[0] && x <= o.bb[1] && z >= o.bb[2] && z <= o.bb[3] && sitgesInPoly(x, z, o.r));
  // дорожки, лестницы, велодорожки (не проезжие и не пешеходные улицы — их знает C.carriageAt)
  const paths = sitgesCells(16);
  for (const st of C.streets) {
    if (st.drive || st.cls === 'pedestrian') continue;
    for (let i = 0; i + 1 < st.v.length; i++) {
      const a = st.v[i], b = st.v[i + 1], m = Math.max(a.hw, b.hw) + 1;
      paths.add(Math.min(a.x, b.x) - m, Math.max(a.x, b.x) + m, Math.min(a.z, b.z) - m, Math.max(a.z, b.z) + m, [a, b]);
    }
  }
  const onPath = (x, z) => paths.at(x, z).some(([a, b]) => sitgesSeg(x, z, a.x, a.z, b.x, b.z) < Math.max(a.hw, b.hw) + 0.6);
  // тротуар (любой улицы) под точкой — те же куски, что у walkAt
  const inTri = (x, z, a, b, c) => {
    const d0 = (b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]), d1 = (c[0] - b[0]) * (z - b[1]) - (c[1] - b[1]) * (x - b[0]);
    const d2 = (a[0] - c[0]) * (z - c[1]) - (a[1] - c[1]) * (x - c[0]);
    return !((d0 < 0 || d1 < 0 || d2 < 0) && (d0 > 0 || d1 > 0 || d2 > 0));
  };
  const onWalk = (x, z) => walks.at(x, z).some(o => inTri(x, z, o.pts[0], o.pts[1], o.pts[2]) || inTri(x, z, o.pts[0], o.pts[2], o.pts[3]));
  const onRoad = (x, z, m) => !!C.carriageAt(x, z, null, m) || C.cornersAt(x, z).some(c => sitgesInFillet(c, x, z));
  const why = { lot: 0, house: 0, road: 0, walk: 0, path: 0, water: 0 };
  // забор в точке (x, z) линии с нормалью n к кварталу
  const want = (x, z, n) => {
    if (!D.inside(x, z) || D.waterAt(x, z) > -1) { why.water++; return false; }
    if (!F.lot.some(d => inLot(x + n[0] * d, z + n[1] * d))) { why.lot++; return false; }
    if (F.house.some(d => C.houseAt(x + n[0] * d, z + n[1] * d))) { why.house++; return false; }
    const bx = x + n[0] * 0.5, bz = z + n[1] * 0.5;
    if (onRoad(bx, bz, 0.3) || onRoad(x, z, 0)) { why.road++; return false; }
    if (onWalk(bx, bz)) { why.walk++; return false; }
    if (onPath(x, z) || onPath(bx, bz)) { why.path++; return false; }
    return true;
  };

  /* ---------- линия: кромка тротуаров и край проезжей части без тротуара ---------- */
  const lift = SITGES_RB.lift.drive;
  const line = edges.filter(e => !e.deck).map(e => ({ A: e.A, B: e.B, ya: e.ya, yb: e.yb, n: e.n }));
  for (const st of C.streets) {
    if (!st.drive || !st.K.cw || st.flat) continue;
    const v = st.v;
    for (const side of [0, 1]) {
      const sg = side ? -1 : 1;
      for (let i = 0; i + 1 < v.length; i++) {
        const a = v[i], b = v[i + 1];
        if (a.sw[side] > 0 || b.sw[side] > 0 || a.deck || b.deck || a.br || a.tn) continue;
        const A = offs(a, sg * (a.hw + 0.12)), B = offs(b, sg * (b.hw + 0.12));
        line.push({ A, B, ya: g(A[0], A[1]) + lift, yb: g(B[0], B[1]) + lift, n: [-sg * a.tz, sg * a.tx] });
      }
    }
  }

  /* ---------- куски ≈ 1 м и решение ---------- */
  for (const e of line) {
    const L = Math.hypot(e.B[0] - e.A[0], e.B[1] - e.A[1]), k = Math.max(1, Math.round(L / F.step));
    e.L = L; e.on = [];
    for (let j = 0; j < k; j++) {
      const t = (j + 0.5) / k;
      e.on.push(L > 0.01 && want(e.A[0] + (e.B[0] - e.A[0]) * t, e.A[1] + (e.B[1] - e.A[1]) * t, e.n));
    }
  }

  /* ---------- цепочки: конец одного отрезка — начало следующего (± 5 см) ---------- */
  const key = p => Math.round(p[0] * 20) + ',' + Math.round(p[1] * 20);
  const byStart = new Map(), hasPrev = new Set();
  for (const e of line) { const k = key(e.A); if (!byStart.has(k)) byStart.set(k, e); }
  for (const e of line) { const nx = byStart.get(key(e.B)); if (nx && nx !== e) { e.next = nx; hasPrev.add(nx); } }
  const used = new Set(), chains = [];
  const walk = e0 => { const ch = []; for (let e = e0; e && !used.has(e); e = e.next) { used.add(e); ch.push(e); } return ch; };
  for (const e of line) if (!hasPrev.has(e) && !used.has(e)) chains.push(walk(e));
  for (const e of line) if (!used.has(e)) chains.push(walk(e));   // замкнутые кольца

  /* ---------- сглаживание и постройка ---------- */
  const H0 = F.h0, H1 = F.h1, T = F.t;
  const stat = { runs: 0, len: 0 };
  cnt.yard = 0;
  for (const ch of chains) {
    // куски цепочки по порядку: { e, t0, t1, len, on }
    const pc = [];
    for (const e of ch) {
      const k = e.on.length;
      for (let j = 0; j < k; j++) pc.push({ e, t0: j / k, t1: (j + 1) / k, len: e.L / k, on: e.on[j] });
    }
    // дыры короче gap между заборами — заполнить; заборы короче minRun — убрать
    const runs = on => { const r = []; for (let i = 0; i < pc.length;) { if (pc[i].on !== on) { i++; continue; } let j = i, l = 0; while (j < pc.length && pc[j].on === on) l += pc[j++].len; r.push([i, j, l]); i = j; } return r; };
    for (const [i, j, l] of runs(false)) if (i > 0 && j < pc.length && l < F.gap) for (let q = i; q < j; q++) pc[q].on = true;
    for (const [i, j, l] of runs(true)) if (l < F.minRun) for (let q = i; q < j; q++) pc[q].on = false;
    for (const [i, j, l] of runs(true)) { buildRun(pc.slice(i, j)); stat.runs++; stat.len += l; }
  }

  function buildRun(pc) {
    // точки линии и высота верха тротуара, нормаль к кварталу в каждой (в стыках — средняя)
    const P = [], Y = [], N = [];
    const at = (e, t) => [e.A[0] + (e.B[0] - e.A[0]) * t, e.A[1] + (e.B[1] - e.A[1]) * t];
    // куски одного отрезка кромки — одной гранью (точки только на стыках отрезков и концах забора)
    pc.forEach((c, k) => {
      if (!k) { P.push(at(c.e, c.t0)); Y.push(c.e.ya + (c.e.yb - c.e.ya) * c.t0); N.push(c.e.n.slice()); }
      else if (c.e !== pc[k - 1].e) { const n = N[N.length - 1]; n[0] += c.e.n[0]; n[1] += c.e.n[1]; }
      if (k + 1 < pc.length && pc[k + 1].e === c.e) return;
      P.push(at(c.e, c.t1)); Y.push(c.e.ya + (c.e.yb - c.e.ya) * c.t1); N.push(c.e.n.slice());
    });
    for (const n of N) { const l = Math.hypot(n[0], n[1]) || 1; n[0] /= l; n[1] /= l; }
    const off = (k, d) => [P[k][0] + N[k][0] * d, P[k][1] + N[k][1] * d];
    let u = 0;
    for (let k = 0; k + 1 < P.length; k++) {
      const a = P[k], b = P[k + 1], ya = Y[k], yb = Y[k + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 1e-3) continue;
      const ab = off(k, T), bb = off(k + 1, T), am = off(k, T / 2), bm = off(k + 1, T / 2);
      const nf = [-(N[k][0] + N[k + 1][0]) / 2, 0, -(N[k][1] + N[k + 1][1]) / 2], nb = [-nf[0], 0, -nf[2]];
      const gbA = Math.min(ya, g(ab[0], ab[1])) - 0.3, gbB = Math.min(yb, g(bb[0], bb[1])) - 0.3;
      const u0 = u / 2, u1 = (u + L) / 2;
      // цоколь: лицевая сторона (к улице), задняя (к участку), шапка
      quad('plaster', [[a[0], ya - 0.05, a[1]], [b[0], yb - 0.05, b[1]], [b[0], yb + H0, b[1]], [a[0], ya + H0, a[1]]], nf, 0xffffff,
        [[u0, 0], [u1, 0], [u1, (H0 + 0.05) / 2], [u0, (H0 + 0.05) / 2]]);
      quad('plaster', [[ab[0], gbA, ab[1]], [bb[0], gbB, bb[1]], [bb[0], yb + H0, bb[1]], [ab[0], ya + H0, ab[1]]], nb, 0xf2efe8,
        [[u0, 0], [u1, 0], [u1, (yb + H0 - gbB) / 2], [u0, (ya + H0 - gbA) / 2]]);
      const cA = off(k, -F.cap), cB = off(k + 1, -F.cap), dA = off(k, T + F.cap), dB = off(k + 1, T + F.cap), yc = 0.05;
      quad('plaster', [[cA[0], ya + H0 + yc, cA[1]], [cB[0], yb + H0 + yc, cB[1]], [dB[0], yb + H0 + yc, dB[1]], [dA[0], ya + H0 + yc, dA[1]]], UP, 0xb8b2a8,
        [[u0, 0], [u1, 0], [u1, 0.12], [u0, 0.12]]);
      quad('plaster', [[cA[0], ya + H0 - 0.01, cA[1]], [cB[0], yb + H0 - 0.01, cB[1]], [cB[0], yb + H0 + yc, cB[1]], [cA[0], ya + H0 + yc, cA[1]]], nf, 0xc8c2b8,
        [[u0, 0], [u1, 0], [u1, 0.03], [u0, 0.03]]);
      // решётка над цоколем (по середине толщины), пролёт — F.bay
      quad('grille', [[am[0], ya + H0 + yc, am[1]], [bm[0], yb + H0 + yc, bm[1]], [bm[0], yb + H1, bm[1]], [am[0], ya + H1, am[1]]], nf, 0xffffff,
        [[u / F.bay, 0], [(u + L) / F.bay, 0], [(u + L) / F.bay, 1], [u / F.bay, 1]]);
      // столкновения: стенки высотой h1 с двух сторон цоколя
      cquad([a[0], ya - 0.1, a[1]], [b[0], yb - 0.1, b[1]], [b[0], yb + H1, b[1]], [a[0], ya + H1, a[1]]);
      cquad([ab[0], gbA, ab[1]], [bb[0], gbB, bb[1]], [bb[0], yb + H1, bb[1]], [ab[0], ya + H1, ab[1]]);
      u += L;
      cnt.yard++;
    }
    // торцы цоколя
    for (const k of [0, P.length - 1]) {
      const k2 = k ? k - 1 : 1, tx = P[k][0] - P[k2][0], tz = P[k][1] - P[k2][1], l = Math.hypot(tx, tz) || 1, nn = [tx / l, 0, tz / l];
      const a = P[k], b = off(k, T), y = Y[k], gb = Math.min(y, g(b[0], b[1])) - 0.3;
      quad('plaster', [[a[0], y - 0.05, a[1]], [b[0], gb, b[1]], [b[0], y + H0, b[1]], [a[0], y + H0, a[1]]], nn, 0xe8e4dc,
        [[0, 0], [T / 2, 0], [T / 2, 0.5], [0, 0.5]]);
      cquad([a[0], y - 0.1, a[1]], [b[0], gb, b[1]], [b[0], y + H1, b[1]], [a[0], y + H1, a[1]]);
    }
  }
  rk.fenceStats = { runs: stat.runs, km: Math.round(stat.len) / 1000, edges: line.length, chains: chains.length, no: why, ms: Math.round(performance.now() - t0) };
}
