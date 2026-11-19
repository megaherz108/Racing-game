// Ситжес — РАСКЛАДКА: где забор (этап 3б; в раскладке с 4а.1 — чтобы места ворот были известны до постройки
// тротуаров). После тротуаров (js/maps/sitges/walks.js) и домов (houses.js: C.houseAt).
//   Линия — наружная кромка тротуаров (C.walks: O0–O1; углы C.cornerWalks: кольцо Ou), а у проезжих улиц с шириной
//   по участкам (K.cw) без тротуара — край проезжей части (hw + 0,12 м). Мосты и настилы — без заборов.
//   Забор стоит там, где за линией участок кадастра (не сельский), но не дом (фасад вплотную — старый город), не
//   другая улица, тротуар, дорожка или вода. Решение — по кускам ≈ 1 м; куски вдоль кромки сцеплены в цепочки
//   (конец одного отрезка линии — начало следующего, ± 5 см), дыры короче SITGES_FENCE.gap заполняются, огрызки
//   короче minRun убираются.
// C.fenceLine — отрезки линии: { A, B, n, kind } — концы [x, z], нормаль к кварталу; kind: 'walk' (полоса: A, B —
//   те же массивы, что O0, O1 в C.walks), 'corner' (угол: Ou колец C.cornerWalks), 'curb' (край проезжей части).
// C.fences — заборы: { P, N, at } — точки ломаной [x, z] (концы забора и стыки отрезков линии), нормаль к кварталу
//   в каждой (в стыках — средняя, единичная), at[k] = [номер отрезка C.fenceLine, t] — откуда точка: высоту верха
//   тротуара по нему берёт постройка (js/maps/sitges/fences3d.js). Этап 4а дополнит участком, стилем и воротами.
// C.fenceStats — { runs, km, edges, chains, no: { причина: кусков }, ms }.
// Определяет: SITGES_FENCE, sitgesPlanFences.
// Использует: sitgesCells, sitgesBBox, sitgesInPoly, sitgesSeg (js/maps/sitges/geom.js); sitgesInFillet
//   (js/maps/sitges/corners.js).
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

function sitgesPlanFences(C) {
  const { streets, walks, corners, cornerWalks, parcels, houseAt, carriageAt, cornersAt, inside, waterAt } = C;
  const F = SITGES_FENCE, t0 = performance.now();
  const offs = (q, d) => [q.x - q.tz * d, q.z + q.tx * d];   // d > 0 — сторона 0 (левая)

  /* ---------- что за линией ---------- */
  // участки кадастра (не сельские) по клеткам
  const lots = sitgesCells(32);
  for (const p of parcels) if (!p.rustic) { const bb = sitgesBBox(p.ring); lots.add(...bb, { r: p.ring, bb }); }
  const inLot = (x, z) => lots.at(x, z).some(o => x >= o.bb[0] && x <= o.bb[1] && z >= o.bb[2] && z <= o.bb[3] && sitgesInPoly(x, z, o.r));
  // дорожки, лестницы, велодорожки (не проезжие и не пешеходные улицы — их знает C.carriageAt)
  const paths = sitgesCells(16);
  for (const st of streets) {
    if (st.drive || st.cls === 'pedestrian') continue;
    for (let i = 0; i + 1 < st.v.length; i++) {
      const a = st.v[i], b = st.v[i + 1], m = Math.max(a.hw, b.hw) + 1;
      paths.add(Math.min(a.x, b.x) - m, Math.max(a.x, b.x) + m, Math.min(a.z, b.z) - m, Math.max(a.z, b.z) + m, [a, b]);
    }
  }
  const onPath = (x, z) => paths.at(x, z).some(([a, b]) => sitgesSeg(x, z, a.x, a.z, b.x, b.z) < Math.max(a.hw, b.hw) + 0.6);
  // тротуар (любой улицы) под точкой — куски полос и углов, как их строит walks3d.js (поиск world.walkAt)
  const pieces = sitgesCells(8);
  const addPiece = pts => {
    const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]);
    pieces.add(Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs), pts);
  };
  for (const W of walks) addPiece([W.I0, W.I1, W.O1, W.O0]);
  for (const { N, ring } of cornerWalks)
    for (let k = 1; k <= N; k++) { const A = ring[k - 1], B = ring[k]; if (!(A.w < 0.05 && B.w < 0.05)) addPiece([A.I, B.I, B.Ou, A.Ou]); }
  const inTri = (x, z, a, b, c) => {
    const d0 = (b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]), d1 = (c[0] - b[0]) * (z - b[1]) - (c[1] - b[1]) * (x - b[0]);
    const d2 = (a[0] - c[0]) * (z - c[1]) - (a[1] - c[1]) * (x - c[0]);
    return !((d0 < 0 || d1 < 0 || d2 < 0) && (d0 > 0 || d1 > 0 || d2 > 0));
  };
  const onWalk = (x, z) => pieces.at(x, z).some(p => inTri(x, z, p[0], p[1], p[2]) || inTri(x, z, p[0], p[2], p[3]));
  const onRoad = (x, z, m) => !!carriageAt(x, z, null, m) || cornersAt(x, z).some(c => sitgesInFillet(c, x, z));
  const why = { lot: 0, house: 0, road: 0, walk: 0, path: 0, water: 0 };
  // забор в точке (x, z) линии с нормалью n к кварталу
  const want = (x, z, n) => {
    if (!inside(x, z) || waterAt(x, z) > -1) { why.water++; return false; }
    if (!F.lot.some(d => inLot(x + n[0] * d, z + n[1] * d))) { why.lot++; return false; }
    if (F.house.some(d => houseAt(x + n[0] * d, z + n[1] * d))) { why.house++; return false; }
    const bx = x + n[0] * 0.5, bz = z + n[1] * 0.5;
    if (onRoad(bx, bz, 0.3) || onRoad(x, z, 0)) { why.road++; return false; }
    if (onWalk(bx, bz)) { why.walk++; return false; }
    if (onPath(x, z) || onPath(bx, bz)) { why.path++; return false; }
    return true;
  };

  /* ---------- линия: кромка тротуаров и край проезжей части без тротуара ---------- */
  // порядок отрезков — как раньше в постройке (полосы, углы, края проезжей части): от него зависит склейка цепочек
  const line = [];
  for (const W of walks) {
    const a = W.st.v[W.i], sg = W.side ? -1 : 1;
    if (a.deck) continue;
    const nx = sg * a.tz, nz = -sg * a.tx;
    line.push({ A: W.O0, B: W.O1, n: [-nx, -nz], kind: 'walk' });
  }
  for (const { N, ring } of cornerWalks) {
    for (let k = 1; k <= N; k++) {
      const A = ring[k - 1], B = ring[k];
      if (A.w < 0.05 && B.w < 0.05) continue;
      const em = [(A.e[0] + B.e[0]) / 2, (A.e[1] + B.e[1]) / 2];
      line.push({ A: A.Ou, B: B.Ou, n: [-em[0], -em[1]], kind: 'corner' });
    }
  }
  for (const st of streets) {
    if (!st.drive || !st.K.cw || st.flat) continue;
    const v = st.v;
    for (const side of [0, 1]) {
      const sg = side ? -1 : 1;
      for (let i = 0; i + 1 < v.length; i++) {
        const a = v[i], b = v[i + 1];
        if (a.sw[side] > 0 || b.sw[side] > 0 || a.deck || b.deck || a.br || a.tn) continue;
        line.push({ A: offs(a, sg * (a.hw + 0.12)), B: offs(b, sg * (b.hw + 0.12)), n: [-sg * a.tz, sg * a.tx], kind: 'curb' });
      }
    }
  }

  /* ---------- куски ≈ 1 м и решение ---------- */
  const on = [], len = [];
  for (const e of line) {
    const L = Math.hypot(e.B[0] - e.A[0], e.B[1] - e.A[1]), k = Math.max(1, Math.round(L / F.step)), o = [];
    for (let j = 0; j < k; j++) {
      const t = (j + 0.5) / k;
      o.push(L > 0.01 && want(e.A[0] + (e.B[0] - e.A[0]) * t, e.A[1] + (e.B[1] - e.A[1]) * t, e.n));
    }
    on.push(o); len.push(L);
  }

  /* ---------- цепочки: конец одного отрезка — начало следующего (± 5 см) ---------- */
  const key = p => Math.round(p[0] * 20) + ',' + Math.round(p[1] * 20);
  const byStart = new Map(), hasPrev = new Set(), next = new Array(line.length).fill(-1);
  line.forEach((e, i) => { const k = key(e.A); if (!byStart.has(k)) byStart.set(k, i); });
  line.forEach((e, i) => { const nx = byStart.get(key(e.B)); if (nx !== undefined && nx !== i) { next[i] = nx; hasPrev.add(nx); } });
  const used = new Set(), chains = [];
  const chain = i0 => { const ch = []; for (let i = i0; i >= 0 && !used.has(i); i = next[i]) { used.add(i); ch.push(i); } return ch; };
  for (let i = 0; i < line.length; i++) if (!hasPrev.has(i) && !used.has(i)) chains.push(chain(i));
  for (let i = 0; i < line.length; i++) if (!used.has(i)) chains.push(chain(i));   // замкнутые кольца

  /* ---------- дыры и огрызки, ломаные заборов ---------- */
  const fences = [], stat = { runs: 0, len: 0 };
  for (const ch of chains) {
    // куски цепочки по порядку: { e — номер отрезка, t0, t1, len, on }
    const pc = [];
    for (const e of ch) {
      const k = on[e].length;
      for (let j = 0; j < k; j++) pc.push({ e, t0: j / k, t1: (j + 1) / k, len: len[e] / k, on: on[e][j] });
    }
    // дыры короче gap между заборами — заполнить; заборы короче minRun — убрать
    const runs = v => { const r = []; for (let i = 0; i < pc.length;) { if (pc[i].on !== v) { i++; continue; } let j = i, l = 0; while (j < pc.length && pc[j].on === v) l += pc[j++].len; r.push([i, j, l]); i = j; } return r; };
    for (const [i, j, l] of runs(false)) if (i > 0 && j < pc.length && l < F.gap) for (let q = i; q < j; q++) pc[q].on = true;
    for (const [i, j, l] of runs(true)) if (l < F.minRun) for (let q = i; q < j; q++) pc[q].on = false;
    for (const [i, j, l] of runs(true)) { fences.push(polyline(pc.slice(i, j))); stat.runs++; stat.len += l; }
  }

  // точки забора: куски одного отрезка линии — одной гранью (точки только на стыках отрезков и концах забора)
  function polyline(pc) {
    const P = [], N = [], at = [];
    const pt = (e, t) => { const { A, B } = line[e]; return [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t]; };
    pc.forEach((c, k) => {
      if (!k) { P.push(pt(c.e, c.t0)); at.push([c.e, c.t0]); N.push(line[c.e].n.slice()); }
      else if (c.e !== pc[k - 1].e) { const n = N[N.length - 1], m = line[c.e].n; n[0] += m[0]; n[1] += m[1]; }
      if (k + 1 < pc.length && pc[k + 1].e === c.e) return;
      P.push(pt(c.e, c.t1)); at.push([c.e, c.t1]); N.push(line[c.e].n.slice());
    });
    for (const n of N) { const l = Math.hypot(n[0], n[1]) || 1; n[0] /= l; n[1] /= l; }
    return { P, N, at };
  }

  Object.assign(C, {
    fenceLine: line, fences,
    fenceStats: { runs: stat.runs, km: Math.round(stat.len) / 1000, edges: line.length, chains: chains.length, no: why, ms: Math.round(performance.now() - t0) },
  });
}
