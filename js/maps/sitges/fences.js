// Ситжес — РАСКЛАДКА: где забор (этап 3б; в раскладке с 4а.1 — чтобы места ворот были известны до постройки
// тротуаров) и за каким участком (4а.2). После тротуаров (js/maps/sitges/walks.js), домов (houses.js: C.houseAt)
// и стилей фасадов (styles.js); стиль забора — следующий этап, js/maps/sitges/fencestyle.js.
//   Линия — наружная кромка тротуаров (C.walks: O0–O1; углы C.cornerWalks: кольцо Ou), а у проезжих улиц с шириной
//   по участкам (K.cw) без тротуара — край проезжей части (hw + 0,12 м). Мосты и настилы — без заборов.
//   Забор стоит там, где за линией участок кадастра (не сельский), но не дом (фасад вплотную — старый город), не
//   другая улица, тротуар, дорожка или вода, и не узкая полоса перед домом от 3 этажей (витрины, крыльцо). Решение —
//   по кускам ≈ 1 м; кусок помнит участок за линией (самый маленький из вложенных). Участок без домов — без забора
//   (4а.2: сквер, газон, пустырь у кольца, откос ж/д): зелень OSM за линией, ж/д ближе rail м или ни одного дома
//   ближе site м к участку; иначе (стройплощадка между домами, общий двор комплекса) — с забором. Куски вдоль кромки
//   сцеплены в цепочки (конец одного отрезка линии — начало следующего, ± 5 см), дыры короче SITGES_FENCE.gap
//   заполняются, огрызки короче minRun убираются; забор режется по границам участков (куски короче minLot —
//   к соседу).
// C.fenceLine — отрезки линии: { A, B, n, kind } — концы [x, z], нормаль к кварталу; kind: 'walk' (полоса: A, B —
//   те же массивы, что O0, O1 в C.walks), 'corner' (угол: Ou колец C.cornerWalks), 'curb' (край проезжей части).
// C.fences — заборы: { P, N, at, lot, run, cut, s } — точки ломаной [x, z] (концы забора и стыки отрезков линии),
//   нормаль к кварталу в каждой (в стыках — средняя, единичная), at[k] = [номер отрезка C.fenceLine, t] — откуда
//   точка: высоту верха тротуара по нему берёт постройка (js/maps/sitges/fences3d.js); lot — участок (индекс
//   в C.parcels), run — номер сплошного забора (до разреза по участкам), cut — [начало, конец]: разрез (там забор
//   продолжается соседним куском), s — расстояние от начала сплошного забора, м. Стиль (style) — fencestyle.js.
// C.fenceLots — участки за заборами: { [индекс в C.parcels]: { bi — главное здание участка (индекс в C.blds), у пустого
//   — ближайшее (−1 — нет), empty — своих домов нет } }.
// C.fenceStats — { runs, km, edges, chains, lots, pieces, no: { причина: кусков }, bare: { причина: [участков, км] },
//   ms }; bare — участки без домов, с которых снят забор (км — до заполнения дыр).
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
  front: [1.5, 2.0, 2.5],  // дом от frontFloors этажей ближе — забора нет (витрины, крыльцо, терраса кафе)
  frontFloors: 3,
  minLot: 1.5,      // кусок участка в заборе короче — к соседнему участку
  // участок без своих домов — без забора, если: за линией (в 3 м) зелень OSM на доле green длины; ж/д ближе rail м;
  // ни одного дома ближе site м к контуру участка (иначе — стройплощадка или общий двор комплекса: забор есть)
  greenKinds: ['park', 'grass', 'playground', 'wood', 'scrub', 'garden'], green: 0.3, rail: 15, site: 4,
};

function sitgesPlanFences(C) {
  const { streets, walks, cornerWalks, parcels, houses, partCells, areas, rails, houseAt, carriageAt, cornersAt, inside, waterAt } = C;
  const F = SITGES_FENCE, t0 = performance.now();
  const offs = (q, d) => [q.x - q.tz * d, q.z + q.tx * d];   // d > 0 — сторона 0 (левая)

  /* ---------- что за линией ---------- */
  // участки кадастра (не сельские) по клеткам; под точкой — самый маленький (дом-участок внутри общего двора)
  const area = r => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return Math.abs(a) / 2; };
  const lots = sitgesCells(32);
  parcels.forEach((p, i) => { if (!p.rustic) { const bb = sitgesBBox(p.ring); lots.add(...bb, { i, r: p.ring, bb, A: area(p.ring) }); } });
  const lotsAt = (x, z) => lots.at(x, z).filter(o => x >= o.bb[0] && x <= o.bb[1] && z >= o.bb[2] && z <= o.bb[3] && sitgesInPoly(x, z, o.r));
  const lotAt = (x, z) => { let b = null; for (const o of lotsAt(x, z)) if (!b || o.A < b.A) b = o; return b ? b.i : -1; };
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
  const why = { lot: 0, house: 0, road: 0, walk: 0, path: 0, water: 0, front: 0 };
  // забор в точке (x, z) линии с нормалью n к кварталу: участок за линией (индекс в parcels) или −1 — забора нет
  const want = (x, z, n) => {
    if (!inside(x, z) || waterAt(x, z) > -1) { why.water++; return -1; }
    let lot = -1;
    for (const d of F.lot) if ((lot = lotAt(x + n[0] * d, z + n[1] * d)) >= 0) break;
    if (lot < 0) { why.lot++; return -1; }
    if (F.house.some(d => houseAt(x + n[0] * d, z + n[1] * d))) { why.house++; return -1; }
    const bx = x + n[0] * 0.5, bz = z + n[1] * 0.5;
    if (onRoad(bx, bz, 0.3) || onRoad(x, z, 0)) { why.road++; return -1; }
    if (onWalk(bx, bz)) { why.walk++; return -1; }
    if (onPath(x, z) || onPath(bx, bz)) { why.path++; return -1; }
    if (F.front.some(d => { const h = houseAt(x + n[0] * d, z + n[1] * d); return h && h.p.floors >= F.frontFloors; })) { why.front++; return -1; }
    return lot;
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
  const on = [], lotOf = [], len = [];
  for (const e of line) {
    const L = Math.hypot(e.B[0] - e.A[0], e.B[1] - e.A[1]), k = Math.max(1, Math.round(L / F.step)), o = [], q = [];
    for (let j = 0; j < k; j++) {
      const t = (j + 0.5) / k, p = L > 0.01 ? want(e.A[0] + (e.B[0] - e.A[0]) * t, e.A[1] + (e.B[1] - e.A[1]) * t, e.n) : -1;
      o.push(p >= 0); q.push(p);
    }
    on.push(o); lotOf.push(q); len.push(L);
  }

  /* ---------- участки за линией: свои дома; пустые — без забора ---------- */
  // дом — на всех участках, внутри которых центр его части (вложенные тоже); главное здание участка — самая большая
  // из частей, чей самый маленький участок — этот
  const built = new Set(), own = new Map();
  for (const h of houses) {
    const r = h.rings[0], cx = r.reduce((s, p) => s + p[0], 0) / r.length, cz = r.reduce((s, p) => s + p[1], 0) / r.length;
    const ls = lotsAt(cx, cz);
    if (!ls.length) continue;
    let m = ls[0];
    for (const o of ls) { built.add(o.i); if (o.A < m.A) m = o; }
    const a = area(r), cur = own.get(m.i);
    if (!cur || a > cur.a) own.set(m.i, { bi: h.bi, a });
  }
  // пустые участки за линией: длина, доля зелени OSM за линией (в 3 м), ж/д рядом
  const GREEN = new Set(F.greenKinds);
  const green = areas.filter(a => GREEN.has(a.kind) && a.ring && a.ring.length > 2).map(a => ({ r: a.ring, bb: sitgesBBox(a.ring) }));
  const greenAt = (x, z) => green.some(o => x >= o.bb[0] && x <= o.bb[1] && z >= o.bb[2] && z <= o.bb[3] && sitgesInPoly(x, z, o.r));
  const railC = sitgesCells(32), RD = F.rail;
  for (const r of rails) for (let i = 0; i + 1 < r.pts.length; i++) {
    const a = r.pts[i], b = r.pts[i + 1];
    railC.add(Math.min(a[0], b[0]) - RD, Math.max(a[0], b[0]) + RD, Math.min(a[1], b[1]) - RD, Math.max(a[1], b[1]) + RD, [a, b]);
  }
  const nearRail = (x, z) => railC.at(x, z).some(([a, b]) => sitgesSeg(x, z, a[0], a[1], b[0], b[1]) < RD);
  const empty = new Map();
  line.forEach((e, i) => lotOf[i].forEach((p, j) => {
    if (p < 0 || built.has(p)) return;
    const k = lotOf[i].length, t = (j + 0.5) / k, x = e.A[0] + (e.B[0] - e.A[0]) * t, z = e.A[1] + (e.B[1] - e.A[1]) * t;
    const o = empty.get(p) || { l: 0, g: 0, rail: false };
    o.l += len[i] / k;
    if (greenAt(x + e.n[0] * 3, z + e.n[1] * 3)) o.g += len[i] / k;
    if (!o.rail && nearRail(x, z)) o.rail = true;
    empty.set(p, o);
  }));
  // здание ближайшего к контуру пустого участка дома не дальше site м (−1 — нет)
  const nearHouse = p => {
    const r = parcels[p].ring, D = F.site;
    let best = D, bi = -1;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const a = r[j], b = r[i], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2));
      for (let s = 0; s <= n; s++) {
        const x = a[0] + (b[0] - a[0]) * s / n, z = a[1] + (b[1] - a[1]) * s / n;
        for (const o of partCells.at(x, z)) {
          if (x < o.bb[0] - D || x > o.bb[1] + D || z < o.bb[2] - D || z > o.bb[3] + D) continue;
          for (let u = 0, v = o.r.length - 1; u < o.r.length; v = u++) {
            const d = sitgesSeg(x, z, o.r[v][0], o.r[v][1], o.r[u][0], o.r[u][1]);
            if (d < best) { best = d; bi = houses[o.k].bi; }
          }
        }
      }
    }
    return bi;
  };
  const lotInfo = new Map(), bare = new Set(), bareSt = { green: [0, 0], rail: [0, 0], vacant: [0, 0] };
  for (const [p, o] of empty) {
    const kind = o.g > o.l * F.green ? 'green' : o.rail ? 'rail' : null, bi = kind ? -1 : nearHouse(p);
    if (kind || bi < 0) { const k = kind || 'vacant'; bare.add(p); bareSt[k][0]++; bareSt[k][1] += o.l; }
    else lotInfo.set(p, { bi, empty: true });
  }
  for (let i = 0; i < line.length; i++) for (let j = 0; j < lotOf[i].length; j++) if (bare.has(lotOf[i][j])) { on[i][j] = false; lotOf[i][j] = -1; }
  // главное здание участка; у общего двора (дома только во вложенных участках) — самое большое из вложенных
  const lotOwner = p => {
    if (lotInfo.has(p)) return lotInfo.get(p);
    let o = own.get(p);
    if (!o) for (const [q, w] of own) if (q !== p && (!o || w.a > o.a) && sitgesInPoly(parcels[q].ring[0][0], parcels[q].ring[0][1], parcels[p].ring)) o = w;
    const r = { bi: o ? o.bi : -1, empty: false };
    lotInfo.set(p, r);
    return r;
  };

  /* ---------- цепочки: конец одного отрезка — начало следующего (± 5 см) ---------- */
  const key = p => Math.round(p[0] * 20) + ',' + Math.round(p[1] * 20);
  const byStart = new Map(), hasPrev = new Set(), next = new Array(line.length).fill(-1);
  line.forEach((e, i) => { const k = key(e.A); if (!byStart.has(k)) byStart.set(k, i); });
  line.forEach((e, i) => { const nx = byStart.get(key(e.B)); if (nx !== undefined && nx !== i) { next[i] = nx; hasPrev.add(nx); } });
  const used = new Set(), chains = [];
  const chain = i0 => { const ch = []; for (let i = i0; i >= 0 && !used.has(i); i = next[i]) { used.add(i); ch.push(i); } return ch; };
  for (let i = 0; i < line.length; i++) if (!hasPrev.has(i) && !used.has(i)) chains.push(chain(i));
  for (let i = 0; i < line.length; i++) if (!used.has(i)) chains.push(chain(i));   // замкнутые кольца

  /* ---------- дыры и огрызки, ломаные заборов, разрез по участкам ---------- */
  const fences = [], stat = { runs: 0, len: 0, pieces: 0 }, fenceLots = {};
  for (const ch of chains) {
    // куски цепочки по порядку: { e — номер отрезка, t0, t1, len, on, lot }
    const pc = [];
    for (const e of ch) {
      const k = on[e].length;
      for (let j = 0; j < k; j++) pc.push({ e, t0: j / k, t1: (j + 1) / k, len: len[e] / k, on: on[e][j], lot: lotOf[e][j] });
    }
    // дыры короче gap между заборами — заполнить; заборы короче minRun — убрать
    const runs = v => { const r = []; for (let i = 0; i < pc.length;) { if (pc[i].on !== v) { i++; continue; } let j = i, l = 0; while (j < pc.length && pc[j].on === v) l += pc[j++].len; r.push([i, j, l]); i = j; } return r; };
    for (const [i, j, l] of runs(false)) if (i > 0 && j < pc.length && l < F.gap) for (let q = i; q < j; q++) pc[q].on = true;
    for (const [i, j, l] of runs(true)) if (l < F.minRun) for (let q = i; q < j; q++) pc[q].on = false;
    for (const [i, j, l] of runs(true)) { cutRun(pc.slice(i, j), stat.runs); stat.runs++; stat.len += l; }
  }

  // сплошной забор — кусками по участкам: у заполненных кусков (дыр) участок соседа; кусок участка короче minLot —
  // к соседнему (к предыдущему, в начале — к следующему)
  function cutRun(pc, run) {
    for (const c of pc) if (!c.on) c.lot = -1;
    let last = -1;
    for (const c of pc) if (c.lot >= 0) last = c.lot; else c.lot = last;
    last = -1;
    for (let i = pc.length - 1; i >= 0; i--) if (pc[i].lot >= 0) last = pc[i].lot; else pc[i].lot = last;
    let parts;
    for (;;) {
      parts = [];
      for (let i = 0; i < pc.length;) { let j = i, l = 0; while (j < pc.length && pc[j].lot === pc[i].lot) l += pc[j++].len; parts.push([i, j, l]); i = j; }
      const k = parts.findIndex(p => p[2] < F.minLot);
      if (k < 0 || parts.length < 2) break;
      const to = pc[parts[k ? k - 1 : 1][0]].lot;
      for (let q = parts[k][0]; q < parts[k][1]; q++) pc[q].lot = to;
    }
    let s = 0;
    parts.forEach(([i, j, l], k) => {
      const f = polyline(pc.slice(i, j)), lot = pc[i].lot;
      Object.assign(f, { lot, run, cut: [k > 0, k + 1 < parts.length], s: Math.round(s * 100) / 100 });
      fences.push(f); stat.pieces++;
      if (lot >= 0 && !fenceLots[lot]) fenceLots[lot] = lotOwner(lot);
      s += l;
    });
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

  for (const k in bareSt) bareSt[k][1] = Math.round(bareSt[k][1]) / 1000;
  Object.assign(C, {
    fenceLine: line, fences, fenceLots,
    fenceStats: { runs: stat.runs, km: Math.round(stat.len) / 1000, edges: line.length, chains: chains.length,
      lots: Object.keys(fenceLots).length, pieces: stat.pieces, no: why, bare: bareSt, ms: Math.round(performance.now() - t0) },
  });
}
