// Ситжес — РАСКЛАДКА: где забор (этап 3б; в раскладке с 4а.1 — чтобы места ворот были известны до постройки
// тротуаров) и за каким участком (4а.2). После тротуаров (js/maps/sitges/walks.js), домов (houses.js: C.houseAt)
// и стилей фасадов (styles.js); стиль забора — следующий этап, js/maps/sitges/fencestyle.js.
//   Линия — наружная кромка тротуаров (C.walks: O0–O1; углы C.cornerWalks: кольцо Ou), а у проезжих и пешеходных
//   улиц без тротуара — край полотна (hw + 0,12 м; до 2026-11-20 — только у улиц с шириной по участкам K.cw; середина
//   улицы внутри участка — внутренняя дорога порта или комплекса: без забора, причина inner); граница участка, открытая наружу (снаружи
//   нет соседнего участка, а до улицы, тротуара или дорожки ≤ 10 м — линии: проезд без тротуара, полоса до дорожки) —
//   сама граница (kind 'lot', высота — по рельефу). Мосты и настилы — без заборов.
//   Забор стоит там, где за линией участок кадастра (не сельский; дальше 2,2 м — если до него ни улицы, ни зоны OSM:
//   полоса без участка между тротуаром и оградой; участка нет, но в yard м вглубь раньше улицы и зон OSM — отдельный дом:
//   общий двор комплекса без участка, 2026-11-20), но не дом (фасад вплотную — старый город), не
//   другая улица, тротуар, дорожка (только уходящая в квартал, не вдоль кромки) или вода, и не узкая полоса перед домом от 3 этажей (витрины, крыльцо). Решение —
//   по кускам ≈ 1 м; кусок помнит участок за линией (самый маленький из вложенных). Участок без домов — без забора
//   (4а.2: сквер, газон, пустырь у кольца, откос ж/д): зелень OSM за линией, ж/д ближе rail м или ни одного дома
//   ближе site м к участку; иначе (стройплощадка между домами, общий двор комплекса) — с забором. Куски вдоль кромки
//   сцеплены в цепочки (общий конец отрезков линии ± 5 см; отрезок бывает развёрнут; у кольца квартала начало —
//   с начала забора), дыры короче SITGES_FENCE.gap заполняются (вокруг угла, если дыра только из-за «нет участка», —
//   короче cornerGap; с глубоким двором за ней — короче yardGap), огрызки короче minRun убираются; забор режется по границам участков (куски короче minLot —
//   к соседу). Концы (2026-11-20, дыры у домов и на углах): забор, оборванный домом, доводится до ближайшей точки его
//   стены (≤ close м); концы соседних заборов сводятся: на углу — до пересечения линий (≤ join м: участок не доходит
//   до угла), иначе перемычкой от конца к концу (≤ chord м: острый угол развилки, разрыв линии).
//   Такие отрезки идут не вдоль линии — проёмов на них нет (gates.js).
// C.fenceLine — отрезки линии: { A, B, n, kind } — концы [x, z], нормаль к кварталу; kind: 'walk' (полоса: A, B —
//   те же массивы, что O0, O1 в C.walks), 'corner' (угол: Ou колец C.cornerWalks), 'curb' (край полотна улицы без тротуара),
//   'lot' (граница участка); у 'corner' — ring: номер кольца в C.cornerWalks, у 'curb' — cd: от края до середины
//   улицы, м.
// C.fenceWhy — для отладки и проверки (tools/sitges/fence-debug.js, check.js): у каждого отрезка C.fenceLine — массив
//   кусков ≈ 1 м: причина «забора нет» до заполнения дыр (ключ fenceStats.no или 'bare' — участок без домов) или null —
//   забор нужен.
// C.fences — заборы: { P, N, at, lot, run, cut, s } — точки ломаной [x, z] (концы забора и стыки отрезков линии),
//   нормаль к кварталу в каждой (в стыках — средняя, единичная), at[k] = [номер отрезка C.fenceLine, t] — откуда
//   точка: высоту верха тротуара по нему берёт постройка (js/maps/sitges/fences3d.js; у точек доводки и сведения —
//   at конца); lot — участок (индекс
//   в C.parcels), run — номер сплошного забора (до разреза по участкам), cut — [начало, конец]: разрез (там забор
//   продолжается соседним куском), s — расстояние от начала сплошного забора, м. Стиль (style) — fencestyle.js.
// C.fenceLots — участки за заборами: { [индекс в C.parcels]: { bi — главное здание участка (индекс в C.blds), у пустого
//   — ближайшее (−1 — нет), empty — своих домов нет } }.
// C.fenceStats — { runs, km, edges, chains, lots, pieces, yards (кусков за общим двором), towns (кусков без забора: дальний участок перед домом центра), no: { причина: кусков }, bare: { причина: [участков, км] },
//   ends: { corners, cornersM, yards, yardsM, house, houseM, joins, chords, joinM }, ms }; bare — участки без домов, с которых снят забор (км — до заполнения
//   дыр); ends — заполненные дыры вокруг углов, доводки до стены дома и сведения концов (число, из них перемычек,
//   и метры).
// Определяет: SITGES_FENCE, sitgesPlanFences.
// Использует: sitgesCells, sitgesBBox, sitgesInPoly, sitgesSeg (js/maps/sitges/geom.js); sitgesInFillet
//   (js/maps/sitges/corners.js); SITGES_OLDTOWN, SITGES_STYLES (js/maps/sitges/styles.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const SITGES_FENCE = {
  h1: 2.0,          // высота стенок столкновений, м
  t: 0.22,          // толщина цоколя, м
  cap: 0.03,        // шапка цоколя выступает с каждой стороны, м
  // меши квадратами chunk м; дальше far м от камеры не рисуются (fences3d.js: твёрдый атлас, изгородь, атлас с альфой —
  // сетка и решётки вдали всё равно растворяются в мипмапах)
  chunk: 160, far: { solid: 350, hedge: 350, alpha: 140 },
  step: 1.0,        // кусок решения «забор / нет», м
  gap: 1.6,         // дыру короче — заполнить
  cornerGap: 25,    // дыру вокруг угла (есть дуга угла) только из-за «нет участка» короче — заполнить (участок отступил
                    // от угла: Av. Vinyet 44)
  minRun: 2.4,      // забор короче — не ставить
  // участок ищется за линией на таких расстояниях; дальше lotFar м — только если до него нет улицы, тротуара, дорожки и
  // зоны OSM, кроме бассейна (полоса без участка между тротуаром и оградой — Francesc Armengol: забор у тротуара)
  lot: [0.4, 1.2, 2.2, 3.2, 4.2, 5.2, 6.2, 7.6, 9], lotFar: 2.2,
  // дорожка снимает забор, только если в pathNear м от точки уходит в квартал глубже pathIn м (вдоль кромки, конец
  // перехода у угла — нет); у границы участка дорожка с углом к ней ≤ pathAlong° — вдоль (велодорожка у тротуара)
  pathIn: 1.0, pathNear: 3, pathAlong: 25,
  yard: 20,         // участка за линией нет, но в yard м вглубь — дом раньше улицы и зон OSM: общий двор комплекса, забор есть
  yardNot: ['old', 'eixample'],   // стили домов центра — у них двора без участка и палисадника за общей полосой не бывает
  townLook: 15,     // дальний участок (> lotFar) в старом городе: первый дом в стольких метрах за его границей в стиле центра — забора нет
  yardGap: 25, yardFar: 60,  // дыру между заборами короче yardGap, где так же дом в yardFar м (глубокий двор), — заполнить
  house: [0.15, 0.6, 1.2], // дом ближе — забора нет (фасад вплотную)
  front: [1.5, 2.0, 2.5],  // дом от frontFloors этажей ближе — забора нет (витрины, крыльцо, терраса кафе)
  frontFloors: 3,
  minLot: 1.5,      // кусок участка в заборе короче — к соседнему участку
  // граница участка, открытая наружу (проезд без тротуара, пустая полоса): куски по edgeStep м; линия ближе edgeNear м
  // (у границы или наружу до edgeLook м) — там уже решает она (за дорожкой вдоль границы — только ближе edgeAlong м);
  // ж/д ближе edgeRail м — своя ограда (rail3d.js)
  edgeStep: 2, edgeNear: 1.5, edgeLook: 10, edgeRail: 8, edgeAlong: 3,
  close: 2.8,       // забор, оборванный домом (house, front), доводится до стены дома не дальше close м
  // концы соседних заборов сводятся: до пересечения линий, если продление каждого ≤ join м (угол без скругления,
  // участок не доходит до угла); иначе перемычкой от конца к концу ≤ chord м (острый угол развилки, разрыв линии)
  join: 7, chord: 6,
  // участок без своих домов — без забора, если: за линией (в 3 м) зелень OSM на доле green длины; ж/д ближе rail м;
  // ни одного дома ближе site м к контуру участка (иначе — стройплощадка или общий двор комплекса: забор есть)
  greenKinds: ['park', 'grass', 'playground', 'wood', 'scrub', 'garden'], green: 0.3, rail: 15, site: 4,
};

function sitgesPlanFences(C) {
  const { streets, walks, cornerWalks, parcels, houses, partCells, areas, rails, blds, houseAt, carriageAt, cornersAt, inside, waterAt } = C;
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
  const pathSegs = (x, z) => paths.at(x, z).filter(([a, b]) => sitgesSeg(x, z, a.x, a.z, b.x, b.z) < Math.max(a.hw, b.hw) + 0.6);
  const onPath = (x, z) => pathSegs(x, z).length > 0;
  // дорожка у (x, z) уходит в квартал: в pathNear м от точки линии (x0, z0) ось глубже pathIn м по нормали n. Вдоль
  // кромки (велодорожка, тротуар отдельной линией OSM: Pg. Vilanova 30, 38D) или обрываясь у неё (конец перехода
  // у угла) — забор не снимает
  const pathInto = (x, z, x0, z0, n) => pathSegs(x, z).some(([a, b]) => {
    const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1, R = F.pathNear;
    // часть отрезка в круге R: t1…t2 (не пересекает — ближайшая точка)
    const ox = a.x - x0, oz = a.z - z0, pb = (ox * dx + oz * dz) / l2, D = pb * pb - (ox * ox + oz * oz - R * R) / l2;
    let t1 = Math.max(0, Math.min(1, -pb)), t2 = t1;
    if (D > 0) { t1 = Math.max(0, -pb - Math.sqrt(D)); t2 = Math.min(1, -pb + Math.sqrt(D)); if (t1 > t2) t1 = t2 = Math.max(0, Math.min(1, -pb)); }
    const dep = t => (ox + dx * t) * n[0] + (oz + dz * t) * n[1];
    return Math.max(dep(t1), dep(t2)) > F.pathIn;
  });
  // дорожка у (x, z) поперёк направления с нормалью n (угол с ним > pathAlong)
  const pathAcross = (x, z, n) => pathSegs(x, z).some(([a, b]) => {
    const dx = b.x - a.x, dz = b.z - a.z;
    return Math.abs(dx * n[1] - dz * n[0]) / (Math.hypot(dx, dz) || 1) < Math.cos(F.pathAlong * Math.PI / 180);
  });
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
  const GREEN = new Set(F.greenKinds);
  const green = areas.filter(a => GREEN.has(a.kind) && a.ring && a.ring.length > 2).map(a => ({ r: a.ring, bb: sitgesBBox(a.ring) }));
  const greenAt = (x, z) => green.some(o => x >= o.bb[0] && x <= o.bb[1] && z >= o.bb[2] && z <= o.bb[3] && sitgesInPoly(x, z, o.r));
  const zones = sitgesCells(32);
  for (const a of areas) if (a.kind !== 'pool' && a.ring && a.ring.length > 2) { const bb = sitgesBBox(a.ring); zones.add(...bb, { r: a.ring, bb }); }
  const zoneAt = (x, z) => zones.at(x, z).some(o => x >= o.bb[0] && x <= o.bb[1] && z >= o.bb[2] && z <= o.bb[3] && sitgesInPoly(x, z, o.r));
  const railC = sitgesCells(32), RD = F.rail;
  for (const r of rails) for (let i = 0; i + 1 < r.pts.length; i++) {
    const a = r.pts[i], b = r.pts[i + 1];
    railC.add(Math.min(a[0], b[0]) - RD, Math.max(a[0], b[0]) + RD, Math.min(a[1], b[1]) - RD, Math.max(a[1], b[1]) + RD, [a, b]);
  }
  const nearRail = (x, z, R = RD) => railC.at(x, z).some(([a, b]) => sitgesSeg(x, z, a[0], a[1], b[0], b[1]) < R);
  const why = { lot: 0, inner: 0, house: 0, road: 0, walk: 0, path: 0, water: 0, front: 0 };
  let wy = null;   // причина последнего «забора нет» (ключ why)
  // общий двор комплекса без участка кадастра (у домов участок = контур дома; Pg. Vilanova 30, бульвар к югу): идя от
  // линии в квартал до yard м, раньше улицы, тротуара, дорожки, зоны OSM, воды и ж/д упёрлись в дом — участок этого дома;
  // только вне старого города (SITGES_OLDTOWN) и отдельно стоящий дом не в стиле центра (старый город, Эйшампле):
  // пустой треугольник у угла, площадь у набережной (−470, −136) — мостовая, не двор
  const TOWN = new Set(F.yardNot);
  // в старом городе (SITGES_OLDTOWN) первый дом за границей участка (от dl м вглубь, до townLook м) — в стиле центра;
  // вне старого города не смотрим: большие дома за оградой усадьбы в Террамаре (у (1657, −402)) — тоже «центр» по стилю
  let towns = 0;
  const townAhead = (x, z, n, dl) => {
    if (!SITGES_OLDTOWN.some(([cx, cz, rr]) => (x - cx) ** 2 + (z - cz) ** 2 < rr * rr)) return false;
    for (let d = dl; d <= dl + F.townLook; d += 1) {
      const h = houseAt(x + n[0] * d, z + n[1] * d);
      if (h) return TOWN.has(SITGES_STYLES[blds[h.bi].style.id].name);
    }
    return false;
  };
  let yards = 0;
  // есть ли часть дома, чья рамка задевает отрезок пробы (x, z) → (x1, z1) (без неё проход вглубь не нужен)
  const partNear = (x, z, x1, z1) => {
    const b0 = Math.min(x, x1), b1 = Math.max(x, x1), b2 = Math.min(z, z1), b3 = Math.max(z, z1);
    for (let f = 0; f <= 1; f += 0.25)
      for (const o of partCells.at(x + (x1 - x) * f, z + (z1 - z) * f)) if (o.bb[0] <= b1 && o.bb[1] >= b0 && o.bb[2] <= b3 && o.bb[3] >= b2) return true;
    return false;
  };
  const yardLot = (x, z, n, D = F.yard) => {
    if (SITGES_OLDTOWN.some(([cx, cz, rr]) => (x - cx) ** 2 + (z - cz) ** 2 < rr * rr) || !partNear(x, z, x + n[0] * D, z + n[1] * D)) return -1;
    for (let d = 0.5, i = 0; d <= D; d += 1, i++) {
      const lx = x + n[0] * d, lz = z + n[1] * d;
      if (!inside(lx, lz) || waterAt(lx, lz) > -1 || onRoad(lx, lz, 0) || onWalk(lx, lz) || pathInto(lx, lz, x, z, n) || nearRail(lx, lz, 3)) return -1;
      const h = houseAt(lx, lz);
      // зоны OSM (сквер, школа, стоянка) — крупные: через 3 м и там, где дом (проверка дорогая)
      if ((h || i % 3 === 0) && zoneAt(lx, lz)) return -1;
      if (h) return h.attached || TOWN.has(SITGES_STYLES[blds[h.bi].style.id].name) ? -1 : lotAt(lx, lz);
    }
    return -1;
  };
  // забор в точке (x, z) линии с нормалью n к кварталу: участок за линией (индекс в parcels) или −1 — забора нет
  const want = (x, z, n, kind, cd) => {
    if (!inside(x, z) || waterAt(x, z) > -1) { why[wy = 'water']++; return -1; }
    let lot = -1, dl = 0;
    for (const d of F.lot) if ((lot = lotAt(x + n[0] * d, z + n[1] * d)) >= 0) { dl = d; break; }
    // дальний участок: между ним и линией (от lotFar м, через 1 м) — ни улицы, ни тротуара, ни дорожки, ни зоны OSM
    for (let d = F.lotFar + 0.5; lot >= 0 && d < dl; d += 1) {
      const lx = x + n[0] * d, lz = z + n[1] * d;
      if (onRoad(lx, lz, 0) || onWalk(lx, lz) || onPath(lx, lz) || zoneAt(lx, lz)) lot = -1;
    }
    // дальний участок со своей линией границы (kind 'lot': между тротуаром и участком дорожка) — забор там, не здесь
    if (lot >= 0 && dl > F.lotFar && kind !== 'lot' && crossEdge(x + n[0] * 0.3, z + n[1] * 0.3, x + n[0] * (dl + 0.3), z + n[1] * (dl + 0.3))) lot = -1;
    // дальний участок перед домом центра (стили yardNot: старый город, Эйшампле; первый дом в townLook м за границей
    // участка) — площадка или терраса, открытая к улице, не палисадник (Pg. Ribera 14)
    if (lot >= 0 && dl > F.lotFar && townAhead(x, z, n, dl)) { lot = -1; towns++; }
    if (lot < 0 && (lot = yardLot(x, z, n)) >= 0) yards++;
    if (lot < 0) { why[wy = 'lot']++; return -1; }
    // край полотна улицы, чья середина (cd м от края) внутри участка, — внутренняя дорога порта, кемпинга, комплекса
    if (cd && lotAt(x - n[0] * cd, z - n[1] * cd) >= 0) { why[wy = 'inner']++; return -1; }
    if (F.house.some(d => houseAt(x + n[0] * d, z + n[1] * d))) { why[wy = 'house']++; return -1; }
    const bx = x + n[0] * 0.5, bz = z + n[1] * 0.5;
    const edge = kind === 'lot';   // граница участка: проезд и дорожка вплотную снаружи — забор есть
    if (edge ? onRoad(bx, bz, 0) : onRoad(bx, bz, 0.3) || onRoad(x, z, 0)) { why[wy = 'road']++; return -1; }
    if (onWalk(bx, bz)) { why[wy = 'walk']++; return -1; }
    if ((!edge && pathInto(x, z, x, z, n)) || pathInto(bx, bz, x, z, n)) { why[wy = 'path']++; return -1; }
    if (F.front.some(d => { const h = houseAt(x + n[0] * d, z + n[1] * d); return h && h.p.floors >= F.frontFloors; })) { why[wy = 'front']++; return -1; }
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
  cornerWalks.forEach(({ N, ring }, ri) => {
    for (let k = 1; k <= N; k++) {
      const A = ring[k - 1], B = ring[k];
      if (A.w < 0.05 && B.w < 0.05) continue;
      const em = [(A.e[0] + B.e[0]) / 2, (A.e[1] + B.e[1]) / 2];
      line.push({ A: A.Ou, B: B.Ou, n: [-em[0], -em[1]], kind: 'corner', ring: ri });
    }
  });
  for (const st of streets) {
    if (!(st.drive || st.cls === 'pedestrian') || st.flat) continue;
    const v = st.v;
    for (const side of [0, 1]) {
      const sg = side ? -1 : 1;
      for (let i = 0; i + 1 < v.length; i++) {
        const a = v[i], b = v[i + 1];
        if (a.sw[side] > 0 || b.sw[side] > 0 || a.deck || b.deck || a.br || a.tn) continue;
        line.push({ A: offs(a, sg * (a.hw + 0.12)), B: offs(b, sg * (b.hw + 0.12)), n: [-sg * a.tz, sg * a.tx], kind: 'curb', cd: (a.hw + b.hw) / 2 + 0.12 });
      }
    }
  }
  // граница участка, открытая наружу (Escriptor Josep Roig 28: бок квартала к проезду без тротуара): снаружи нет
  // соседнего участка (и сельского), воды, ж/д, а идя наружу, раньше линии (ближе edgeNear м — там решает кромка
  // тротуара или край улицы) и другого участка встречаем улицу, тротуар или дорожку не дальше edgeLook м (задние
  // границы во дворах квартала — без забора: с улицы не видны)
  {
    const lc = sitgesCells(16), R = F.edgeNear;
    for (const e of line) lc.add(Math.min(e.A[0], e.B[0]) - R, Math.max(e.A[0], e.B[0]) + R, Math.min(e.A[1], e.B[1]) - R, Math.max(e.A[1], e.B[1]) + R, e);
    const nearLine = (x, z) => lc.at(x, z).some(e => sitgesSeg(x, z, e.A[0], e.A[1], e.B[0], e.B[1]) < R);
    const any = sitgesCells(32);
    for (const p of parcels) { const bb = sitgesBBox(p.ring); any.add(...bb, { r: p.ring, bb }); }
    const inAny = (x, z) => any.at(x, z).some(o => x >= o.bb[0] && x <= o.bb[1] && z >= o.bb[2] && z <= o.bb[3] && sitgesInPoly(x, z, o.r));
    const open = (x, z, m) => {
      if (nearLine(x, z) || nearRail(x, z, F.edgeRail)) return false;
      const qx = x + m[0] * 0.6, qz = z + m[1] * 0.6;
      if (!inside(qx, qz) || waterAt(qx, qz) > -1 || inAny(qx, qz) || houseAt(qx, qz)) return false;
      // дорожка вдоль границы (велодорожка у тротуара) — проход, только если линия тротуара за ней не ближе edgeAlong м
      // (иначе решает линия, и забор один — у тротуара: Pg. Vilanova у (−265, 314))
      let along = false;
      for (let d = 0.6; d <= F.edgeLook; d += 1) {
        const px = x + m[0] * d, pz = z + m[1] * d;
        if (nearLine(px, pz)) return along && d > F.edgeAlong;
        if (onRoad(px, pz, 0) || onWalk(px, pz)) return true;
        if (onPath(px, pz)) { if (pathAcross(px, pz, m)) return true; along = true; }
        if (d > 0.6 && inAny(px, pz)) return along;
      }
      return along;
    };
    const S = F.edgeStep;
    for (const p of parcels) {
      if (p.rustic) continue;
      const r = p.ring;
      for (let i = 0; i < r.length; i++) {
        const a = r[i], b = r[(i + 1) % r.length], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
        if (L < 0.3) continue;
        // нормаль внутрь участка
        let n = [-dz / L, dx / L];
        const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
        if (!sitgesInPoly(mx + n[0] * 0.2, mz + n[1] * 0.2, r)) n = [-n[0], -n[1]];
        const k = Math.max(1, Math.round(L / S)), pts = [];
        for (let j = 0; j <= k; j++) pts.push(j === 0 ? a : j === k ? b : [a[0] + dx * j / k, a[1] + dz * j / k]);
        for (let j = 0; j < k; j++) {
          const A = pts[j], B = pts[j + 1];
          if (open((A[0] + B[0]) / 2, (A[1] + B[1]) / 2, [-n[0], -n[1]])) line.push({ A, B, n, kind: 'lot' });
        }
      }
    }
  }

  // отрезки границ участков (kind 'lot') по клеткам: забор у тротуара перед такой границей не нужен (want)
  const lotEdges = sitgesCells(16);
  for (const e of line) if (e.kind === 'lot') lotEdges.add(Math.min(e.A[0], e.B[0]), Math.max(e.A[0], e.B[0]), Math.min(e.A[1], e.B[1]), Math.max(e.A[1], e.B[1]), e);
  const cr = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  function crossEdge(x0, z0, x1, z1) {
    const P = [x0, z0], Q = [x1, z1];
    const hit = e => cr(P, Q, e.A) * cr(P, Q, e.B) <= 0 && cr(e.A, e.B, P) * cr(e.A, e.B, Q) <= 0;
    return [P, Q, [(x0 + x1) / 2, (z0 + z1) / 2]].some(p => lotEdges.at(p[0], p[1]).some(hit));
  }

  /* ---------- куски ≈ 1 м и решение ---------- */
  const on = [], lotOf = [], len = [], whyOf = [];
  for (const e of line) {
    const L = Math.hypot(e.B[0] - e.A[0], e.B[1] - e.A[1]), k = Math.max(1, Math.round(L / F.step)), o = [], q = [], w = [];
    for (let j = 0; j < k; j++) {
      wy = null;
      const t = (j + 0.5) / k, p = L > 0.01 ? want(e.A[0] + (e.B[0] - e.A[0]) * t, e.A[1] + (e.B[1] - e.A[1]) * t, e.n, e.kind, e.cd) : -1;
      o.push(p >= 0); q.push(p); w.push(wy);
    }
    on.push(o); lotOf.push(q); len.push(L); whyOf.push(w);
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
  for (let i = 0; i < line.length; i++) for (let j = 0; j < lotOf[i].length; j++) if (bare.has(lotOf[i][j])) { on[i][j] = false; lotOf[i][j] = -1; whyOf[i][j] = 'bare'; }
  // главное здание участка; у общего двора (дома только во вложенных участках) — самое большое из вложенных
  const lotOwner = p => {
    if (lotInfo.has(p)) return lotInfo.get(p);
    let o = own.get(p);
    if (!o) for (const [q, w] of own) if (q !== p && (!o || w.a > o.a) && sitgesInPoly(parcels[q].ring[0][0], parcels[q].ring[0][1], parcels[p].ring)) o = w;
    const r = { bi: o ? o.bi : -1, empty: false };
    lotInfo.set(p, r);
    return r;
  };

  /* ---------- цепочки: отрезки с общим концом (± 5 см) подряд ---------- */
  // направление отрезка в цепочке может быть обратным (rev): кольцо угла бывает записано навстречу полосам тротуара
  // (Av. Vinyet 44 — без разворота дуга угла была отдельной цепочкой: дыры через неё не заполнялись, а сама она
  // короче minRun выбрасывалась). Сначала — продолжение в том же направлении, потом — развёрнутый отрезок.
  const key = p => Math.round(p[0] * 20) + ',' + Math.round(p[1] * 20);
  const ends = new Map();   // ключ точки → [[отрезок, 0 — начало A / 1 — конец B]]
  line.forEach((e, i) => { for (const [p, s] of [[e.A, 0], [e.B, 1]]) { const k = key(p); if (!ends.has(k)) ends.set(k, []); ends.get(k).push([i, s]); } });
  const used = new Set(), chains = [];
  // следующий неиспользованный отрезок в точке p: fwd — к нему идём вперёд (ждём его начало), иначе назад (его конец)
  const step = (p, fwd) => {
    let r = null;
    for (const [j, s] of ends.get(key(p)) || []) {
      if (used.has(j)) continue;
      if (s === (fwd ? 0 : 1)) return [j, false];
      if (!r) r = [j, true];
    }
    return r;
  };
  for (let i = 0; i < line.length; i++) {
    if (used.has(i)) continue;
    used.add(i);
    const ch = [[i, false]];
    for (let p = line[i].B, n; (n = step(p, true));) { used.add(n[0]); ch.push(n); p = n[1] ? line[n[0]].A : line[n[0]].B; }
    for (let p = line[i].A, n; (n = step(p, false));) { used.add(n[0]); ch.unshift(n); p = n[1] ? line[n[0]].B : line[n[0]].A; }
    // кольцо (квартал целиком): конец последнего отрезка — начало первого
    const [f0, r0] = ch[0], [f1, r1] = ch[ch.length - 1];
    ch.ring = ch.length > 2 && key(r0 ? line[f0].B : line[f0].A) === key(r1 ? line[f1].A : line[f1].B);
    chains.push(ch);
  }

  /* ---------- дыры и огрызки, ломаные заборов, разрез по участкам ---------- */
  const fences = [], stat = { runs: 0, len: 0, pieces: 0, house: 0, houseLen: 0, joins: 0, joinLen: 0, chords: 0, corners: 0, cornerLen: 0, yardHoles: 0, yardLen: 0 }, fenceLots = {};
  for (const ch of chains) {
    // куски цепочки по порядку: { e — номер отрезка, t0, t1, len, on, lot }
    const pc = [];
    for (const [e, rev] of ch) {
      const k = on[e].length;
      for (let q = 0; q < k; q++) {
        const j = rev ? k - 1 - q : q, t0 = j / k, t1 = (j + 1) / k;
        pc.push({ e, t0: rev ? t1 : t0, t1: rev ? t0 : t1, len: len[e] / k, on: on[e][j], lot: lotOf[e][j], why: whyOf[e][j] });
      }
    }
    // у кольца начало — с начала забора (иначе дыра на стыке начала и конца кольца не заполняется)
    if (ch.ring) { const s0 = pc.findIndex((c, q) => c.on && !pc[(q + pc.length - 1) % pc.length].on); if (s0 > 0) pc.push(...pc.splice(0, s0)); }
    // дыры между заборами короче gap — заполнить; вокруг угла (с дугой угла) только из-за «нет участка» — короче
    // cornerGap; заборы короче minRun — убрать
    const runs = v => { const r = []; for (let i = 0; i < pc.length;) { if (pc[i].on !== v) { i++; continue; } let j = i, l = 0; while (j < pc.length && pc[j].on === v) l += pc[j++].len; r.push([i, j, l]); i = j; } return r; };
    const aroundCorner = (i, j) => { let c = false; for (let q = i; q < j; q++) { if (pc[q].why !== 'lot') return false; if (line[pc[q].e].kind === 'corner') c = true; } return c; };
    // дыра только из-за «нет участка», за которой глубокий общий двор (дом в yardFar м вглубь от каждого куска)
    const deepYard = (i, j) => {
      for (let q = i; q < j; q++) {
        const c = pc[q], e = line[c.e], t = (c.t0 + c.t1) / 2;
        if (c.why !== 'lot' || yardLot(e.A[0] + (e.B[0] - e.A[0]) * t, e.A[1] + (e.B[1] - e.A[1]) * t, e.n, F.yardFar) < 0) return false;
      }
      return true;
    };
    for (const [i, j, l] of runs(false)) {
      // у кольца хвост (после разворота pc[0] — начало забора) — тоже дыра между заборами
      if (i === 0 || (j === pc.length && !ch.ring)) continue;
      const fill = l < F.gap ? 'gap' : l < F.cornerGap && aroundCorner(i, j) ? 'corner' : l < F.yardGap && deepYard(i, j) ? 'yard' : null;
      if (!fill) continue;
      if (fill === 'corner') { stat.corners++; stat.cornerLen += l; }
      if (fill === 'yard') { stat.yardHoles++; stat.yardLen += l; }
      for (let q = i; q < j; q++) pc[q].on = true;
    }
    for (const [i, j, l] of runs(true)) if (l < F.minRun) for (let q = i; q < j; q++) pc[q].on = false;
    // конец забора, за которым дом (house, front), — доводится до стены (ends: [начало, конец])
    const byHouse = c => !!c && (c.why === 'house' || c.why === 'front');
    for (const [i, j, l] of runs(true)) { cutRun(pc.slice(i, j), stat.runs, [byHouse(pc[i - 1]), byHouse(pc[j])]); stat.runs++; stat.len += l; }
  }

  // сплошной забор — кусками по участкам: у заполненных кусков (дыр) участок соседа; кусок участка короче minLot —
  // к соседнему (к предыдущему, в начале — к следующему)
  function cutRun(pc, run, ends) {
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
      const f = polyline(pc.slice(i, j), [!k && ends[0], k + 1 === parts.length && ends[1]]), lot = pc[i].lot;
      Object.assign(f, { lot, run, cut: [k > 0, k + 1 < parts.length], s: Math.round(s * 100) / 100 });
      fences.push(f); stat.pieces++;
      if (lot >= 0 && !fenceLots[lot]) fenceLots[lot] = lotOwner(lot);
      s += l;
    });
  }

  // точки забора: куски одного отрезка линии — одной гранью (точки только на стыках отрезков и концах забора)
  function polyline(pc, ends) {
    const P = [], N = [], at = [];
    const pt = (e, t) => { const { A, B } = line[e]; return [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t]; };
    pc.forEach((c, k) => {
      if (!k) { P.push(pt(c.e, c.t0)); at.push([c.e, c.t0]); N.push(line[c.e].n.slice()); }
      else if (c.e !== pc[k - 1].e) { const n = N[N.length - 1], m = line[c.e].n; n[0] += m[0]; n[1] += m[1]; }
      if (k + 1 < pc.length && pc[k + 1].e === c.e) return;
      P.push(pt(c.e, c.t1)); at.push([c.e, c.t1]); N.push(line[c.e].n.slice());
    });
    for (const n of N) { const l = Math.hypot(n[0], n[1]) || 1; n[0] /= l; n[1] /= l; }
    const f = { P, N, at, closed: [false, false] };
    if (ends[0]) f.closed[0] = toHouse(P, N, at, 0);
    if (ends[1]) f.closed[1] = toHouse(P, N, at, 1);
    return f;
  }

  /* ---------- концы заборов: до стены дома, сведение соседних концов ---------- */
  // продлить ломаную с конца (end: 0 — начало, 1 — конец) до точки Q с высотой тротуара конца (at); own — у отрезка
  // к Q своя нормаль (он идёт не вдоль линии): на изломе повторная точка с ней
  // ref — куда смотрит нормаль отрезка (по умолчанию — к телу забора, против направления наружу от конца)
  function extend(P, N, at, end, Q, own, ref) {
    const k = end ? P.length - 1 : 0, E = P[k], dx = Q[0] - E[0], dz = Q[1] - E[1], l = Math.hypot(dx, dz);
    let n = N[k];
    if (own && l > 1e-3) {
      const q = end ? P[k - 1] : P[1], o = ref || [q[0] - E[0], q[1] - E[1]];
      n = [-dz / l, dx / l];
      if (n[0] * o[0] + n[1] * o[1] < 0) n = [-n[0], -n[1]];
    }
    // излом — в 1 см от конца к Q (у отрезка нулевой длины gates.js не увидел бы излома); в начало — unshift: сначала
    // точка излома, потом Q
    const add = own ? [[[E[0] + dx / l * 0.01, E[1] + dz / l * 0.01], n], [Q, n.slice()]] : [[Q, n.slice()]];
    for (const [p, m] of add) {
      if (end) { P.push(p); N.push(m); at.push(at[k]); } else { P.unshift(p); N.unshift(m); at.unshift(at[0]); }
    }
  }
  // забор, оборванный домом: от конца — к ближайшей точке стены дома за линией (не к улице и не назад вдоль забора)
  function toHouse(P, N, at, end) {
    if (P.length < 2) return false;
    const k = end ? P.length - 1 : 0, E = P[k], n = N[k], R = F.close;
    const q = end ? P[k - 1] : P[1], ol = Math.hypot(E[0] - q[0], E[1] - q[1]) || 1, o = [(E[0] - q[0]) / ol, (E[1] - q[1]) / ol];
    let best = R, H = null;
    partCells.each(E[0] - R, E[0] + R, E[1] - R, E[1] + R, l => {
      for (const p of l) {
        if (E[0] < p.bb[0] - R || E[0] > p.bb[1] + R || E[1] < p.bb[2] - R || E[1] > p.bb[3] + R) continue;
        for (let u = 0, v = p.r.length - 1; u < p.r.length; v = u++) {
          const a = p.r[v], b = p.r[u], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
          const t = Math.min(1, Math.max(0, ((E[0] - a[0]) * dx + (E[1] - a[1]) * dz) / L2)), x = a[0] + dx * t, z = a[1] + dz * t;
          const d = Math.hypot(x - E[0], z - E[1]);
          if (d >= best) continue;
          if ((x - E[0]) * n[0] + (z - E[1]) * n[1] < -0.1 || (x - E[0]) * o[0] + (z - E[1]) * o[1] < -0.3) continue;
          best = d; H = [x, z];
        }
      }
    });
    if (!H) return false;
    if (best >= 0.05) { extend(P, N, at, end, H, true); stat.house++; stat.houseLen += best; }   // best > 0,05 > 1 см
    return true;
  }
  // свести концы соседних заборов (не разрезы и не доведённые до дома): угол — продлить оба до пересечения линий
  // (≤ join м); если пересечения нет или оно дальше — перемычка от конца к концу (≤ chord м, концы смотрят друг на
  // друга: острый угол развилки, разрыв линии, ступенька). Продление — не по улице, тротуару, дорожке, зоне OSM, дому.
  const fenceLen = f => { let L = 0; for (let k = 1; k < f.P.length; k++) L += Math.hypot(f.P[k][0] - f.P[k - 1][0], f.P[k][1] - f.P[k - 1][1]); return L; };
  function joinEnds() {
    const J = F.join, CH = F.chord, ends = [], cells = sitgesCells(8);
    fences.forEach((f, fi) => {
      for (const end of [0, 1]) {
        if (f.cut[end] || f.closed[end]) continue;
        const k = end ? f.P.length - 1 : 0, E = f.P[k], q = end ? f.P[k - 1] : f.P[1], l = Math.hypot(E[0] - q[0], E[1] - q[1]);
        if (l < 0.3) continue;
        const o = { fi, end, E, d: [(E[0] - q[0]) / l, (E[1] - q[1]) / l], n: f.N[k] };
        ends.push(o); cells.add(E[0] - J, E[0] + J, E[1] - J, E[1] + J, o);
      }
    });
    // отрезок A→B (сдвинут на 0,3 м к участку) не по улице, тротуару, дорожке, зоне OSM, дому
    // (to — до какой доли длины: у угла последние 0,3 м не смотрим — точка пересечения лежит на кромке соседнего
    // тротуара; угол проверяется отдельно точкой внутрь по обеим нормалям)
    const free = (x, z) => !(onRoad(x, z, 0) || onWalk(x, z) || onPath(x, z) || zoneAt(x, z) || houseAt(x, z));
    const clear = (A, B, n, to = 1) => {
      const L = Math.hypot(B[0] - A[0], B[1] - A[1]), m = Math.max(1, Math.ceil(L / 0.4));
      for (let i = 1; i <= m; i++) {
        const t = Math.min(i / m, to);
        if (!free(A[0] + (B[0] - A[0]) * t + n[0] * 0.3, A[1] + (B[1] - A[1]) * t + n[1] * 0.3)) return false;
      }
      return true;
    };
    // нормаль перемычки a→b — к участку (как у конца a)
    const chordN = (a, b) => {
      const dx = b.E[0] - a.E[0], dz = b.E[1] - a.E[1], l = Math.hypot(dx, dz) || 1;
      const n = [-dz / l, dx / l];
      return n[0] * a.n[0] + n[1] * a.n[1] < 0 ? [-n[0], -n[1]] : n;
    };
    const cand = [], seen = new Set();
    for (const a of ends) for (const b of cells.at(a.E[0], a.E[1])) {
      if (b === a || (b.fi === a.fi && b.end === a.end)) continue;
      const pk = a.fi < b.fi ? a.fi * 2 + a.end + ',' + (b.fi * 2 + b.end) : b.fi * 2 + b.end + ',' + (a.fi * 2 + a.end);
      if (seen.has(pk)) continue;
      seen.add(pk);
      const wx = b.E[0] - a.E[0], wz = b.E[1] - a.E[1], gap = Math.hypot(wx, wz);
      if (gap > J * 1.5 || gap < 0.02) continue;
      // у одного забора — только если перемычка заметно короче самого забора (не замыкать огрызок в кольцо)
      if (a.fi === b.fi && gap > 0.3 * fenceLen(fences[a.fi])) continue;
      const cr = a.d[0] * b.d[1] - a.d[1] * b.d[0];
      // угол: оба до пересечения линий; пересечение чуть позади конца (≤ 1 м) — перемычкой
      let past = false;
      if (gap >= 1 && Math.abs(cr) > 0.35) {
        const sa = (wx * b.d[1] - wz * b.d[0]) / cr, sb = (wx * a.d[1] - wz * a.d[0]) / cr;
        past = Math.min(sa, sb) < -0.05 && Math.min(sa, sb) >= -1 && Math.max(sa, sb) <= J;
        if (sa >= -0.05 && sb >= -0.05 && sa <= J && sb <= J) {
          const X = [a.E[0] + a.d[0] * Math.max(0, sa), a.E[1] + a.d[1] * Math.max(0, sa)];
          const ta = 1 - 0.3 / Math.max(0.3, sa), tb = 1 - 0.3 / Math.max(0.3, sb);
          if (clear(a.E, X, a.n, ta) && clear(b.E, X, b.n, tb) && free(X[0] + (a.n[0] + b.n[0]) * 0.4, X[1] + (a.n[1] + b.n[1]) * 0.4)) {
            cand.push({ a, b, X, c: Math.max(sa, sb) }); continue;
          }
        }
      }
      // перемычка a → b: концы рядом или смотрят друг на друга
      if (gap > CH) continue;
      if (gap >= 1 && !past && (a.d[0] * wx + a.d[1] * wz < 0.2 * gap || -(b.d[0] * wx + b.d[1] * wz) < 0.2 * gap)) continue;
      const n = chordN(a, b);
      if (clear(a.E, b.E, n)) cand.push({ a, b, chord: n, c: gap });
    }
    cand.sort((p, q) => p.c - q.c);
    const used = new Set();
    for (const { a, b, X, chord } of cand) {
      const ka = a.fi * 2 + a.end, kb = b.fi * 2 + b.end;
      if (used.has(ka) || used.has(kb)) continue;
      used.add(ka); used.add(kb);
      const ext = (o, Q, own, ref) => {
        const f = fences[o.fi], l = Math.hypot(Q[0] - o.E[0], Q[1] - o.E[1]);
        if (l > 0.02) { extend(f.P, f.N, f.at, o.end, Q.slice(), own, ref); if (!o.end) f.s = Math.round((f.s - l) * 100) / 100; }
        stat.joinLen += l;
      };
      if (chord) { ext(a, b.E, true, chord); stat.chords++; }
      else { ext(a, X, false); ext(b, X, false); }
      stat.joins++;
    }
  }

  joinEnds();
  for (const f of fences) delete f.closed;
  for (const k in bareSt) bareSt[k][1] = Math.round(bareSt[k][1]) / 1000;
  Object.assign(C, {
    fenceLine: line, fences, fenceLots, fenceWhy: whyOf,
    fenceStats: { runs: stat.runs, km: Math.round(stat.len) / 1000, edges: line.length, chains: chains.length,
      lots: Object.keys(fenceLots).length, pieces: stat.pieces, yards, towns, no: why, bare: bareSt,
      ends: { corners: stat.corners, cornersM: Math.round(stat.cornerLen), yards: stat.yardHoles, yardsM: Math.round(stat.yardLen), house: stat.house, houseM: Math.round(stat.houseLen), joins: stat.joins, chords: stat.chords, joinM: Math.round(stat.joinLen) },
      ms: Math.round(performance.now() - t0) },
  });
}
