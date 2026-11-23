// Ситжес — дорожный граф для трафика (js/traffic/), шаг 8.0 этапа 8 (план — docs/sitges/stage-8.md). Строится при первом
// заезде с трафиком из готовой раскладки улиц (C.streets: ось после сдвига, полуширина проезжей части hw, высота y,
// односторонки ±1); раскладку не меняет, случайностей нет. Формат — как у «Побережья» (js/maps/coast/trafficnet.js):
// водитель js/traffic/driver.js работает с ним без переделки.
//   Улицы с трафиком: проезжие классов SITGES_NET.prio (без living_street, служебных, пешеходных, треков). Без трафика
//     также участки уже minW (медиана ширины проезжей части), тупики (обрезаются до перекрёстка, повторно) и всё вне
//     самой большой сильно связной части графа — «ловушки» односторонок (въехать можно, выехать нельзя).
//   Узлы: вершина OSM, где сходятся ≥ 2 улиц с трафиком (или улица сама с собой), и концы улиц; узлы, соединённые
//     участком короче merge, — один перекрёсток. Кольца — центры колец этапа 7G (C.street.groups.G.rings): улицы
//     кольца (все точки почти на одном расстоянии от центра) — один узел round с радиусом полосы (середина кольца).
//   Полосы — ломаная через step м: односторонка — по оси, двусторонняя — справа от оси на ¼ ширины проезжей части.
//     Начало и конец — у края перекрёстка: дальше полуширины других рукавов и касаний скруглённых углов C.corners;
//     у кольца — за его проезжей частью.
//   Высота hy — высота оси (полотно, настилы мостов, путепроводы и спуски под них — этап 2); скорость vprof —
//     по классу (на узких и брусчатке — slow), в повороте — по радиусу, с запасом на торможение перед ним.
//   Главная дорога узла — по классу (prio), при равном — сквозная; въезд со STOP / «уступи» этапа 7B (точки OSM) —
//     второстепенный (e.sign: 'stop' — водитель останавливается полностью). Светофоры OSM (2) — узлу sig с фазой
//     phase(grp, t), рёбрам группа фаз grp 0/1 (пары встречных рукавов); n.lit («Город», оси x / z) не ставится.
//   Запреты: Hummer (W 2,2) — не на самые узкие улицы (hummer: двусторонние уже two, односторонки уже one; maxW);
//     автобусам и грузовикам — только широкие дороги (wide: классы cls, двусторонние не уже minW, односторонки не уже
//     minW1, без поворотов круче minR; иначе noLong). Перила моста над полосой (коллайдер — от низа настила, js/maps/sitges/roads3d.js) — ниже clearDeck — e.blocked. Подграф каждой машины
//     (Hummer, длинные) тоже сильно связный — рёбра вне его самой большой части ей запрещаются.
//   Предметы на проезжей части (столбики, «столы», террасы, стволы, дома над проездами): где полоса их задевает
//     (с запасом в полуширину самой широкой допущенной машины), ось участка плавно сдвигается вбок (до shift м,
//     не за бордюр); что осталось — в отчёте (blocked). Проезд под домом или мостом ниже 4 м — длинным нельзя.
//   Повороты (e.turns, шаг 8.2): у каждого въезда — кривая через перекрёсток, кузов вдоль которой не задевает бордюр
//     и дома (иначе — лучшая из запасных), радиус для скорости, запрет разворота на другую проезжую часть и длинным.
// sitgesTrafficGraph(C, grid, ground, walkAt, decks) → { nodes, edges, report, dropped }; grid — сетка неподвижных
//   препятствий построенного мира (world.grid), ground — world.ground, walkAt — высота тротуара (world.walkAt; без неё
//   бордюры не проверяются), decks — настилы мостов (world.decks; без них низкий просвет под мостом не виден).
//   Подключение к трафику (world.trafficGraph) — шаг 8.1.
// Отладка: tools/sitges/traffic-debug.js (сводка и схема сверху).
// Определяет: SITGES_NET, sitgesNetSCC, sitgesTrafficGraph.
// Использует: clamp (js/core.js); trafficGraphReport (js/maps/coast/trafficnet.js); sitgesInPoly, sitgesSeg
//   (js/maps/sitges/geom.js); stMarkSignal (js/maps/sitges/st/marks.js); tPiece, tPieceAt, turnPiece, tPieceMinR
//   (js/traffic/graph.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const SITGES_NET = {
  prio: { secondary: 4, tertiary: 3, unclassified: 2, residential: 1 },   // классы с трафиком; главная — больший
  minW: 5,            // проезжая часть участка уже (медиана), м — без трафика
  step: 2,            // точки полосы, м
  merge: 6,           // узлы, соединённые участком короче, — один перекрёсток, м
  minLoop: 40,        // участок-петля (из узла в него же) короче — без трафика, м
  // отступ полосы от узла: проходной узел (2 рукава) — pass; перекрёсток — полуширина других рукавов + pad и касание
  // угла + tan, не дальше max; на участке остаётся не меньше keep м
  trim: { pass: 1, pad: 1, tan: 0.5, max: 18, keep: 4 },
  // кольцо: улица кольца — не длиннее len, все точки не дальше out м от острова и в полосе spread м по расстоянию до
  // центра; полоса въезда кончается за проезжей частью кольца + pad; скорость на кольце — по радиусу, не выше vMax
  ring: { len: 170, out: 25, spread: 4, pad: 1.5, vMax: 6.5 },
  v: { secondary: 11, tertiary: 8.5, unclassified: 8.5, residential: 8.5 },   // м/с (≈ 40 / 30 км/ч)
  slow: 6.5, slowW: 6, slowSurf: ['paving_stones', 'sett', 'cobblestone', 'unhewn_cobblestone'],   // узкие и брусчатка
  aLat: 2.2, decel: 2,   // боковое ускорение в повороте и торможение перед ним, м/с² (как «Побережье»)
  // широкие дороги (автобусы, грузовики): двусторонние классов cls, проезжая часть ≥ minW, радиус полосы ≥ minR
  wide: { cls: ['secondary', 'tertiary'], minW: 7, minW1: 6, minR: 12, W: 2.5 },
  // самые узкие улицы (проезжая часть двусторонней уже two, односторонки уже one, м) — maxW: Hummer нельзя,
  // Aventador (2,03) — можно
  hummer: { W: 2.2, two: 6.5, one: 5.75, maxW: 2.1 },
  carW: 1.94,         // самая широкая машина, кроме Hummer (X5)
  margin: 0.1,        // запас до предмета сверх полуширины машины, м
  shift: 2,           // объезд предметов: сдвиг оси не больше, м
  clearCar: 2.4, clearLong: 4,   // дом над проездом: низ выше полосы меньше — нельзя никому / длинным
  clearDeck: 2,       // перила моста над полосой: низ выше меньше — нельзя никому (Hummer — верх коллайдера 1,81 м)
  cross: { dy: 1.5, end: 3 },   // пересечение осей без общей вершины OSM: на одном уровне (высоты ближе dy), не у концов улиц
  sign: 45,           // STOP / «уступи»: до конца полосы не дальше, м
  stopGap: 2.4,       // конец полосы (там стоит центр ждущей машины) — не ближе к оси другого въезда в узел, м
  signal: 35,         // светофор OSM — узел не дальше, м
  // повороты (e.turns): кузов W × L (X5) через step м вдоль кривой, тротуар — выше земли на curb м, до столба не ближе
  // pole м (водитель срезает поворот, целясь вперёд); запасные кривые —
  // кубические с касательными handles (доли хорды); R — наименьший радиус для скорости (√(2,2 · 3,5) ≈ 2,8 м/с);
  // longW × longL — автобус (длинным нельзя, если задевает дом или столб)
  turn: { W: 1.94, L: 4.9, step: 1, curb: 0.08, pole: 0.25, R: 3.5, longW: 2.5, longL: 11.2,
    handles: [[0.4, 0.4], [0.25, 0.25], [0.55, 0.55], [0.55, 0.25], [0.25, 0.55], [0.15, 0.15], [0.7, 0.7]],
    uturn: [3.5, 4.5, 6] },   // разворот: радиус полукруга, м
};

// Компоненты сильной связности графа «ребро → следующие рёбра» так, как выбирает водитель (js/traffic/driver.js,
// enterEdge): без разворота (кроме тупика), только куда машине можно (ok), длинная (long) — мимо колец, если можно.
// → { comp: Map(ребро → номер), big: номер самой большой, n: число компонент }
function sitgesNetSCC(edges, ok, long) {
  const E = edges.filter(ok), id = new Map(E.map((e, k) => [e, k]));
  const next = e => {
    let o = e.B.out.filter(x => (e.rev ? x !== e.rev : x.B !== e.A) && ok(x));
    if (!o.length) o = e.B.out.filter(ok);
    if (long) { const o2 = o.filter(x => !x.B.round); if (o2.length) o = o2; }
    return o;
  };
  const nx = E.map(next), order = [], seen = new Uint8Array(E.length);
  for (let s = 0; s < E.length; s++) {
    if (seen[s]) continue;
    const st = [[s, 0]]; seen[s] = 1;
    while (st.length) {
      const top = st[st.length - 1], L = nx[top[0]];
      if (top[1] < L.length) { const k = id.get(L[top[1]++]); if (!seen[k]) { seen[k] = 1; st.push([k, 0]); } }
      else { order.push(top[0]); st.pop(); }
    }
  }
  const prev = E.map(() => []);
  E.forEach((e, k) => { for (const o of nx[k]) prev[id.get(o)].push(k); });
  const comp = new Int32Array(E.length).fill(-1);
  let n = 0;
  for (let q = order.length - 1; q >= 0; q--) {
    const s = order[q]; if (comp[s] >= 0) continue;
    const st = [s]; comp[s] = n;
    while (st.length) { const k = st.pop(); for (const p of prev[k]) if (comp[p] < 0) { comp[p] = n; st.push(p); } }
    n++;
  }
  // самая большая — по длине полос
  const size = new Array(n).fill(0);
  E.forEach((e, k) => { size[comp[k]] += e.len; });
  const big = n ? size.indexOf(Math.max(...size)) : -1;
  return { comp: new Map(E.map((e, k) => [e, comp[k]])), big, n };
}

function sitgesTrafficGraph(C, grid, ground, walkAt, decks) {
  const N = SITGES_NET, T = N.trim;
  const use = C.streets.filter(st => st.drive && N.prio[st.cls] && !st.flat);
  const km = m => +(m / 1000).toFixed(2);
  const dropped = [];                                  // [{ st, s0, s1, why }] — для схемы и сводки
  const R = { streetKm: km(use.reduce((s, st) => s + st.len, 0)) };

  /* ---------- ось улицы на длине дуги s ---------- */
  const axisAt = (st, s) => {
    const v = st.v;
    let lo = 0, hi = v.length - 1;
    s = clamp(s, 0, v[hi].s);
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (v[m].s <= s) lo = m; else hi = m; }
    const a = v[lo], b = v[hi], t = clamp((s - a.s) / (b.s - a.s || 1), 0, 1);
    let tx = a.tx + (b.tx - a.tx) * t, tz = a.tz + (b.tz - a.tz) * t;
    const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, tx, tz, hw: a.hw + (b.hw - a.hw) * t, y: a.y + (b.y - a.y) * t,
      deck: a.deck && (t < 1 || b.deck), surf: st.surf };
  };
  const median = a => { const b = a.slice().sort((p, q) => p - q); return b.length ? b[b.length >> 1] : 0; };

  /* ---------- кольца (центры этапа 7G) ---------- */
  const G7 = C.street && C.street.groups && C.street.groups.G;
  const rings = [], ringOf = new Map(), ringKey = new Map();
  for (const r of (G7 && G7.rings) || []) {
    const parts = use.filter(st => {
      if (ringOf.has(st) || st.len > N.ring.len) return false;
      let lo = Infinity, hi = -Infinity;
      for (const q of st.v) { const d = Math.hypot(q.x - r.x, q.z - r.z); lo = Math.min(lo, d); hi = Math.max(hi, d); }
      return hi < r.r + N.ring.out && hi - lo < N.ring.spread;
    });
    if (!parts.length) { rings.push({ x: r.x, z: r.z, skip: 'нет улиц с трафиком' }); continue; }
    let sd = 0, nd = 0, sw = 0, bad = 0, two = 0;
    const cover = new Set();
    for (const st of parts) {
      for (const q of st.v) {
        const dx = q.x - r.x, dz = q.z - r.z;
        sd += Math.hypot(dx, dz); sw += q.hw; nd++;
        cover.add(Math.floor((Math.atan2(dz, dx) + Math.PI) / (Math.PI / 18)));
      }
      // водитель едет по кольцу с убывающим углом atan2(z, x) (js/traffic/graph.js, turnPiece) — сверить с OSM
      if (!st.oneway) { two++; continue; }
      let turn = 0;
      for (const q of st.v) turn += ((q.x - r.x) * q.tz - (q.z - r.z) * q.tx) * st.oneway;
      if (turn > 0) bad++;
    }
    const Rl = sd / nd, ring = { x: r.x, z: r.z, island: r.r, R: +Rl.toFixed(2), hw: sw / nd, parts, wrongDir: bad, twoWay: two, cover: cover.size * 10, arms: 0 };
    const node = { x: r.x, z: r.z, round: ring.R, roundV: Math.min(N.ring.vMax, Math.sqrt(N.aLat * ring.R)), roundM: ring.R < 8 ? 0.2 : 0.3, ring };
    ring.node = node;
    for (const st of parts) { ringOf.set(st, ring); for (const q of st.v) if (q.nd) ringKey.set(q.k, ring); }
    rings.push(ring);
  }

  /* ---------- узлы: вершины OSM, общие для улиц с трафиком, и концы улиц ---------- */
  const at = new Map();                                // ключ вершины → [{ st, i }]
  for (const st of use) if (!ringOf.has(st)) st.v.forEach((q, i) => {
    if (!q.nd) return;
    if (!at.has(q.k)) at.set(q.k, []);
    at.get(q.k).push({ st, i });
  });
  /* ---------- пересечения без общей вершины OSM ---------- */
  // Оси двух улиц пересекаются на одном уровне (высоты оси расходятся меньше cross.dy), но общей вершины OSM там нет —
  // без узла полосы проходили друг сквозь друга и машины сталкивались на полном ходу (Carrer del Camí del Coll ×
  // Carrer d'en Pepe de Garraf у (1214, 592)). Обеим улицам — общий узел (ключ X…) в ближайшей к пересечению точке оси;
  // у концов улиц (ближе cross.end) не ищем: там примыкание, а не пересечение. Раскладку не меняет.
  const xKey = new Map(), crossings = [];             // улица → Map(индекс точки оси → ключ узла пересечения)
  {
    const L = use.filter(st => !ringOf.has(st)), cells = new Map(), C0 = 25;
    // отрезки осей — в клетки 25 м (каждый отрезок — во все клетки своей рамки)
    L.forEach((st, a) => { for (let i = 1; i < st.v.length; i++) {
      const p = st.v[i - 1], q = st.v[i];
      for (let cx = Math.floor(Math.min(p.x, q.x) / C0); cx <= Math.floor(Math.max(p.x, q.x) / C0); cx++)
        for (let cz = Math.floor(Math.min(p.z, q.z) / C0); cz <= Math.floor(Math.max(p.z, q.z) / C0); cz++) {
          const k = cx * 100003 + cz; if (!cells.has(k)) cells.set(k, []); cells.get(k).push(a, i);
        }
    } });
    const nearest = (st, x, z) => { let bi = 0, bd = Infinity; st.v.forEach((q, i) => { const d = (q.x - x) ** 2 + (q.z - z) ** 2; if (d < bd) { bd = d; bi = i; } }); return bi; };
    const hits = [];
    for (const list of cells.values()) for (let m = 0; m < list.length; m += 2) for (let n = m + 2; n < list.length; n += 2) {
      const a = list[m], b = list[n];
      if (a === b) continue;
      const P = L[a].v, Q = L[b].v, i = list[m + 1], j = list[n + 1], p0 = P[i - 1], p1 = P[i], q0 = Q[j - 1], q1 = Q[j];
      const rx = p1.x - p0.x, rz = p1.z - p0.z, sx = q1.x - q0.x, sz = q1.z - q0.z, den = rx * sz - rz * sx;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((q0.x - p0.x) * sz - (q0.z - p0.z) * sx) / den, u = ((q0.x - p0.x) * rz - (q0.z - p0.z) * rx) / den;
      if (t < 0 || t > 1 || u < 0 || u > 1) continue;
      const sa = p0.s + (p1.s - p0.s) * t, sb = q0.s + (q1.s - q0.s) * u;
      if (sa < N.cross.end || sa > P[P.length - 1].s - N.cross.end || sb < N.cross.end || sb > Q[Q.length - 1].s - N.cross.end) continue;
      if (Math.abs(p0.y + (p1.y - p0.y) * t - q0.y - (q1.y - q0.y) * u) > N.cross.dy) continue;
      const x = p0.x + rx * t, z = p0.z + rz * t;
      if (!hits.some(h => h.a === Math.min(a, b) && h.b === Math.max(a, b) && Math.hypot(h.x - x, h.z - z) < 3)) hits.push({ a: Math.min(a, b), b: Math.max(a, b), x, z });
    }
    for (const { a, b, x, z } of hits) {
      const A = L[a], B = L[b], ia = nearest(A, x, z), ib = nearest(B, x, z), qa = A.v[ia], qb = B.v[ib];
      // общий узел: вершина OSM одной из улиц (если есть), иначе новый ключ; уже общая вершина — пересечение учтено
      if (qa.nd && qb.nd) continue;
      const k = qa.nd ? qa.k : qb.nd ? qb.k : 'X' + crossings.length;
      if (!at.has(k)) at.set(k, []);
      for (const [st, i, q] of [[A, ia, qa], [B, ib, qb]]) {
        if (q.nd) continue;
        if (!xKey.has(st)) xKey.set(st, new Map());
        xKey.get(st).set(i, k); at.get(k).push({ st, i });
      }
      crossings.push({ x, z, streets: [A.name || A.cls, B.name || B.cls], k });
    }
  }
  const keyOf = (st, i) => (xKey.has(st) && xKey.get(st).get(i)) || st.v[i].k;
  const isNode = (st, i) => {
    const q = st.v[i], k = keyOf(st, i);
    return i === 0 || i === st.v.length - 1 || ringKey.has(k) || at.get(k).length >= 2;
  };
  // участки улиц между узлами
  let segs = [];
  for (const st of use) {
    if (ringOf.has(st)) continue;
    const idx = [];
    st.v.forEach((q, i) => { if ((q.nd || keyOf(st, i) !== q.k) && isNode(st, i)) idx.push(i); });
    for (let k = 0; k + 1 < idx.length; k++) {
      const i0 = idx[k], i1 = idx[k + 1], v = st.v;
      const ws = []; for (let i = i0; i <= i1; i++) ws.push(2 * v[i].hw);
      segs.push({ st, i0, i1, ka: keyOf(st, i0), kb: keyOf(st, i1), s0: v[i0].s, s1: v[i1].s, len: v[i1].s - v[i0].s, w: median(ws) });
    }
  }
  // слияние узлов: участок короче merge — внутри перекрёстка; кольцо — один узел
  const par = new Map();
  const idOf = k => ringKey.has(k) ? 'R' + rings.indexOf(ringKey.get(k)) : k;
  const find = k => { let r = k; while (par.has(r) && par.get(r) !== r) r = par.get(r); let c = k; while (c !== r) { const n = par.get(c); par.set(c, r); c = n; } return r; };
  const union = (a, b) => {
    const ra = find(a), rb = find(b);
    if (ra === rb) return;
    if (typeof rb === 'string') par.set(ra, rb); else par.set(rb, ra);   // кольцо поглощает
  };
  for (const s of segs) if (s.len < N.merge) union(idOf(s.ka), idOf(s.kb));
  const nodeMap = new Map(), keyPos = new Map();
  for (const [k, list] of at) keyPos.set(k, list[0].st.v[list[0].i]);
  const nodeOf = k => {
    const id = find(idOf(k));
    let n = nodeMap.get(id);
    if (!n) {
      const rg = typeof id === 'string' ? rings[+id.slice(1)] : null;
      n = rg ? rg.node : { x: 0, z: 0, round: 0 };
      Object.assign(n, { id, keys: [], arms: [], out: [], occ: new Set(), lit: false, dead: false, gate: false, deg: 0, major: null, sig: null });
      nodeMap.set(id, n);
    }
    return n;
  };
  for (const s of segs) {
    s.A = nodeOf(s.ka); s.B = nodeOf(s.kb);
    for (const [n, k] of [[s.A, s.ka], [s.B, s.kb]]) if (!n.round && !n.keys.includes(k)) n.keys.push(k);
  }
  for (const n of nodeMap.values()) if (!n.round) {
    let x = 0, z = 0;
    for (const k of n.keys) { const p = keyPos.get(k); x += p.x; z += p.z; }
    n.x = x / n.keys.length; n.z = z / n.keys.length;
  }
  const drop = (s, why) => dropped.push({ st: s.st, s0: s.s0, s1: s.s1, why, len: s.len });
  segs = segs.filter(s => {
    if (s.A === s.B && s.len < Math.max(N.merge, N.minLoop)) { if (s.len >= N.merge) drop(s, 'петля'); return false; }   // внутри перекрёстка
    if (s.w < N.minW) { drop(s, 'узкая'); return false; }
    return true;
  });
  // тупики: участок, у которого узел ни с чем больше не связан, — без трафика (повторно, пока есть)
  for (let pass = 0; pass < 50; pass++) {
    const deg = new Map();
    for (const s of segs) for (const n of [s.A, s.B]) deg.set(n, (deg.get(n) || 0) + 1);
    const before = segs.length;
    segs = segs.filter(s => {
      if ((deg.get(s.A) === 1 && !s.A.round) || (deg.get(s.B) === 1 && !s.B.round)) { drop(s, 'тупик'); return false; }
      return true;
    });
    if (segs.length === before) break;
  }
  for (const s of segs) { s.A.arms.push({ s, end: 0 }); s.B.arms.push({ s, end: 1 }); }
  for (const n of nodeMap.values()) n.deg = n.arms.length;

  /* ---------- главная дорога узла ---------- */
  for (const n of nodeMap.values()) {
    if (!n.deg) continue;
    let pm = 0; for (const a of n.arms) pm = Math.max(pm, N.prio[a.s.st.cls]);
    const main = n.arms.filter(a => N.prio[a.s.st.cls] === pm), cnt = new Map();
    for (const a of main) cnt.set(a.s.st, (cnt.get(a.s.st) || 0) + 1);
    const thru = [...cnt.keys()].filter(st => cnt.get(st) >= 2);
    n.major = new Set(thru.length ? thru : cnt.keys());
  }

  /* ---------- предметы на проезжей части ---------- */
  const inside = (x, z, P, m) => {
    if (sitgesInPoly(x, z, P)) return true;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) if (sitgesSeg(x, z, P[j][0], P[j][1], P[i][0], P[i][1]) < m) return true;
    return false;
  };
  // настил моста над полосой (x, z, y) ниже clearLong: верх плиты выше полосы больше чем на 0,5 м, низ (верх − толщина)
  // — ниже y + clearLong (Av. de Navarra под Passeig de Vilanova: просвет 2–3 м, автобус упирался в плиту)
  const deckLow = (x, z, y) => {
    if (!decks) return false;
    for (const d of decks.grid.query(x, x, z, z)) {
      const h = decks.top(d, x, z);
      if (h > y + 0.5 && h - (d.t || 0) < y + N.clearLong) return true;
    }
    return false;
  };
  // предмет ближе m к точке (x, z) полосы на высоте y: 1 — нельзя никому, 2 — только длинным (низкий проезд под домом)
  const hit = (x, z, m, y) => {
    if (!grid) return 0;
    let res = 0;
    for (const it of grid.query(x - m - 1, x + m + 1, z - m - 1, z + m + 1)) {
      if (it.brk) continue;                                       // сбиваемое сносят
      if (x < it.minX - m || x > it.maxX + m || z < it.minZ - m || z > it.maxZ + m) { if (it.box) continue; }
      // предмет с высотами низа и верха (дом над проездом, перила моста): полоса над ним или далеко под ним — мимо
      if (it.y1 !== undefined && (it.y1 < y + 0.2 || it.y0 > y + N.clearLong)) continue;
      const low = it.y0 !== undefined && it.y0 > y + (it.poly ? N.clearCar : N.clearDeck);   // проезд под ним — только не длинным
      if (it.poly) {
        if (!inside(x, z, it.poly, m)) continue;
        if (low) { res = 2; continue; }
        return 1;
      }
      // столб, ящик, ствол: от земли на h (как коллайдер, js/physics.js); полоса выше его верха (настил) — мимо
      const cx = it.obb ? it.obb.x : it.r != null && !it.box ? it.x : (it.minX + it.maxX) / 2, cz = it.obb ? it.obb.z : it.r != null && !it.box ? it.z : (it.minZ + it.maxZ) / 2;
      if (ground && y > ground(cx, cz) + it.h + 0.3) continue;
      if (it.obb) {
        const o = it.obb, c = Math.cos(o.rot), s = Math.sin(o.rot), dx = x - o.x, dz = z - o.z;
        if (Math.abs(dx * c - dz * s) < o.w / 2 + m && Math.abs(dx * s + dz * c) < o.d / 2 + m) { if (low) { res = 2; continue; } return 1; }
      } else if (!it.box && it.r != null) { if (Math.hypot(x - it.x, z - it.z) < it.r + m) return 1; }
      else return 1;
    }
    return res;
  };

  /* ---------- отступ полосы от узла ---------- */
  const trimAt = (n, s, end) => {
    const st = s.st, sEnd = end ? s.s1 : s.s0, sg = end ? -1 : 1;
    if (n.round) {
      const lim = n.ring.R + n.ring.hw + N.ring.pad;
      for (let d = 0; d <= s.len; d += 0.5) { const p = axisAt(st, sEnd + sg * d); if (Math.hypot(p.x - n.x, p.z - n.z) >= lim) return d; }
      return s.len;
    }
    if (n.deg <= 2) return T.pass;
    const i = end ? s.i1 : s.i0, k = st.v[i].k;
    let t = 0;
    for (const a of n.arms) if (a.s !== s) t = Math.max(t, a.s.st.v[a.end ? a.s.i1 : a.s.i0].hw + T.pad);
    // касания скруглённых углов у этого узла на этом рукаве
    const q = st.v[i];
    for (const c of C.cornersAt(q.x, q.z)) for (const X of [c.a, c.b])
      if (X.st === st && X.st.v[X.i].k === k && (X.s - q.s) * sg > 0) t = Math.max(t, Math.abs(X.s - q.s) + T.tan);
    // слитый перекрёсток: от своей вершины до центра узла
    if (n.keys.length > 1) t = Math.max(t, Math.hypot(q.x - n.x, q.z - n.z) * 0.5);
    return Math.min(t, T.max);
  };
  // отступы у обоих концов участка (одни для обоих направлений); на участке остаётся не меньше keep м
  for (const s of segs) {
    let ta = trimAt(s.A, s, 0), tb = trimAt(s.B, s, 1);
    if (ta + tb > s.len - T.keep) { const k = Math.max(0, s.len - T.keep) / (ta + tb); ta *= k; tb *= k; }
    s.ta = ta; s.tb = tb;
  }

  /* ---------- ширина, запреты, сдвиг оси ---------- */
  const blocked = [];
  let shifted = 0, lowPts = 0;
  for (const s of segs) {
    const st = s.st, two = !st.oneway;
    s.hummer = s.w >= (two ? N.hummer.two : N.hummer.one);
    s.wideCand = N.wide.cls.includes(st.cls) && s.w >= (two ? N.wide.minW : N.wide.minW1);
    s.slow = s.w < N.slowW || N.slowSurf.includes(st.surf);
    // точки участка через step м и сдвиг оси в них
    const n = Math.max(2, Math.ceil(s.len / N.step) + 1), P = [];
    for (let k = 0; k < n; k++) P.push(axisAt(st, s.s0 + s.len * k / (n - 1)));
    s.P = P;
    const m = (s.wideCand ? N.wide.W : s.hummer ? N.hummer.W : N.carW) / 2 + N.margin;
    const offs = p => two ? [p.hw / 2, -p.hw / 2] : [0];
    const room = (p, d) => offs(p).every(o => Math.abs(o + d) <= Math.max(0, p.hw - N.carW / 2));
    const clear = (p, d) => offs(p).every(o => hit(p.x - p.tz * (o + d), p.z + p.tx * (o + d), m, p.y) !== 1);
    const need = new Float32Array(n);
    let any = false;
    // только сама полоса (между отступами от узлов): в перекрёстке едут по кривой поворота
    const inLane = i => { const u = s.len * i / (n - 1); return u >= s.ta - 1 && u <= s.len - s.tb + 1; };
    for (let i = 0; i < n; i++) {
      const p = P[i];
      if (!inLane(i) || clear(p, 0)) continue;
      any = true;
      for (let k = 1; k * 0.25 <= N.shift; k++) {
        const d = k * 0.25;
        if (room(p, d) && clear(p, d)) { need[i] = d; break; }
        if (room(p, -d) && clear(p, -d)) { need[i] = -d; break; }
      }
    }
    if (any) {
      // плавно: наибольший сдвиг в окне ±6 точек, потом среднее по ±5 (как «Побережье»)
      const R1 = 6, R2 = 5, wide = new Float32Array(n);
      for (let i = 0; i < n; i++) for (let k = Math.max(0, i - R1); k <= Math.min(n - 1, i + R1); k++) if (Math.abs(need[k]) > Math.abs(wide[i])) wide[i] = need[k];
      s.shift = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        let a = 0, c = 0;
        for (let k = Math.max(0, i - R2); k <= Math.min(n - 1, i + R2); k++) { a += wide[k]; c++; }
        s.shift[i] = a / c;
      }
      shifted++;
      for (let i = 0; i < n; i++) if (inLane(i) && !clear(P[i], s.shift[i])) { s.blocked = true; blocked.push([+P[i].x.toFixed(1), +P[i].z.toFixed(1), st.name || st.cls]); }
    }
    // низкий проезд под домом или настилом моста (низ плиты ниже clearLong над полосой) — длинным нельзя
    for (let i = 0; i < n; i++) if (inLane(i)) for (const o of offs(P[i])) {
      const x = P[i].x - P[i].tz * o, z = P[i].z + P[i].tx * o;
      if (hit(x, z, 0.1, P[i].y) === 2 || deckLow(x, z, P[i].y)) { s.low = true; lowPts++; }
    }
  }

  /* ---------- направленные рёбра ---------- */
  const edges = [];
  const mkEdge = (s, dir) => {
    const st = s.st, A = dir > 0 ? s.A : s.B, B = dir > 0 ? s.B : s.A;
    const t0 = dir > 0 ? s.ta : s.tb, t1 = dir > 0 ? s.tb : s.ta;
    const L = s.len - t0 - t1, n = Math.max(3, Math.ceil(L / N.step) + 1);
    const pts = [], hy = new Float32Array(n), P = [];
    let deck = false;
    for (let k = 0; k < n; k++) {
      const u = dir > 0 ? t0 + L * k / (n - 1) : s.len - t0 - L * k / (n - 1);   // от начала участка
      const p = axisAt(st, s.s0 + u);
      let sh = 0;
      if (s.shift) { const f = u / s.len * (s.P.length - 1), i = Math.min(s.P.length - 2, Math.floor(f)); sh = s.shift[i] + (s.shift[i + 1] - s.shift[i]) * (f - i); }
      const o = (st.oneway ? 0 : dir * p.hw / 2) + sh;
      pts.push([p.x - p.tz * o, p.z + p.tx * o]); hy[k] = p.y; P.push(p);
      if (p.deck) deck = true;
    }
    const piece = tPiece(pts), vprof = new Float32Array(n);
    const vCap = s.slow ? N.slow : N.v[st.cls];
    let minR = Infinity;
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 3)], b = pts[i], c = pts[Math.min(n - 1, i + 3)];
      const ab = Math.hypot(b[0] - a[0], b[1] - a[1]), bc = Math.hypot(c[0] - b[0], c[1] - b[1]), ac = Math.hypot(c[0] - a[0], c[1] - a[1]);
      const ar = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
      const Rr = ar > 1e-6 ? ab * bc * ac / (4 * ar) : 1e9;
      if (i >= 3 && i < n - 3) minR = Math.min(minR, Rr);
      vprof[i] = Math.min(vCap, Math.sqrt(N.aLat * Rr));
    }
    for (let i = n - 2; i >= 0; i--) vprof[i] = Math.min(vprof[i], Math.sqrt(vprof[i + 1] ** 2 + 2 * N.decel * (piece.cum[i + 1] - piece.cum[i])));
    const tan = (i, j) => { const dx = pts[j][0] - pts[i][0], dz = pts[j][1] - pts[i][1], l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; };
    const [ix, iz] = tan(0, Math.min(2, n - 1)), [ex, ez] = tan(Math.max(0, n - 3), n - 1);
    const e = { A, B, st, seg: s, cls: st.cls, name: st.name, lanes: [st.oneway ? 0 : s.w / 4], lp: [piece], hy, vprof, ix, iz, ex, ez, fx: ix, fz: iz,
      s0: 0, s1: piece.len, len: piece.len, bridge: deck, narrow: null, dir, sgn: dir, w: s.w, slow: s.slow, minR,
      maxW: s.hummer ? 9 : N.hummer.maxW, noLong: !s.wideCand || minR < N.wide.minR || !!s.low, major: false, rev: null, sign: null, grp: -1, blocked: !!s.blocked,
      // начало и конец полосы — длина дуги улицы (для знаков и схемы)
      sa: s.s0 + (dir > 0 ? t0 : s.len - t0), sb: s.s0 + (dir > 0 ? s.len - t1 : t1) };
    const di = []; P.forEach((p, i) => { if (p.deck) di.push(i); });
    if (di.length) e.span = { type: 'deck', s0: piece.cum[di[0]], s1: piece.cum[di[di.length - 1]] };
    A.out.push(e); edges.push(e);
    return e;
  };
  for (const s of segs) {
    if (s.st.oneway) mkEdge(s, s.st.oneway);
    else { const f = mkEdge(s, 1), b = mkEdge(s, -1); f.rev = b; b.rev = f; }
  }

  /* ---------- STOP и «уступи» этапа 7B: въезд второстепенный ---------- */
  const signs = { stop: [0, 0], give_way: [0, 0], miss: [] };
  const project = (st, x, z) => {
    let best = 0, bd = Infinity;
    for (let i = 0; i + 1 < st.v.length; i++) {
      const a = st.v[i], b = st.v[i + 1], dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1;
      const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / L2, 0, 1), d = (a.x + dx * t - x) ** 2 + (a.z + dz * t - z) ** 2;
      if (d < bd) { bd = d; best = a.s + (b.s - a.s) * t; }
    }
    return best;
  };
  const byStreet = new Map();
  for (const e of edges) { if (!byStreet.has(e.st)) byStreet.set(e.st, []); byStreet.get(e.st).push(e); }
  for (const kind of ['stop', 'give_way']) for (const [x, z, d] of (C.points && C.points[kind]) || []) {
    signs[kind][1]++;
    const c = C.carriageAt(x, z);
    if (!c || c.corner || !c.st.drive) { signs.miss.push([x, z, kind, 'не на улице']); continue; }
    const st = c.st, s0 = project(st, x, z), p0 = axisAt(st, s0);
    const sgn = d == null ? (st.oneway < 0 ? -1 : 1) : (Math.sin(d) * p0.tx + Math.cos(d) * p0.tz >= 0 ? 1 : -1);
    // ребро этой улицы в ту же сторону, чей узел ближе всех впереди (не дальше N.sign): точка знака OSM бывает и за
    // концом полосы — у стоп-линии в отступе перекрёстка
    let best = null, bd = Infinity;
    for (const e of byStreet.get(st) || []) {
      if (e.sgn !== sgn) continue;
      const ahead = ((e.dir > 0 ? e.seg.s1 : e.seg.s0) - s0) * sgn;
      if (ahead >= -1 && ahead < N.sign && ahead < bd) { bd = ahead; best = e; }
    }
    if (!best) { signs.miss.push([x, z, kind, 'нет полосы']); continue; }
    best.sign = kind; signs[kind][0]++;
  }
  for (const e of edges) e.major = !!(e.B.major && e.B.major.has(e.st)) && !e.sign;

  /* ---------- светофоры OSM: перекрёсток (группы рукавов) или переход посреди улицы ---------- */
  // У перекрёстка (узел ≥ 3 рукавов не дальше N.signal): n.sig = { x, z, phase }, у въездов grp — группа 0: улица,
  // где стоит голова светофора 7B (иначе главная), и встречные ей, группа 1 — остальные; фаза — phase(grp, simTime)
  // (stMarkSignal, js/maps/sitges/st/marks.js — та же, что у ламп). Посреди улицы (пешеходный переход): у рёбер этой
  // улицы рядом e.light — длина полосы до светофора, м (фаза 0 — машинам, 1 — пешеходам; водитель такие пока не знает —
  // их нет)
  const lights = [];
  const lanePos = (e, x, z) => {
    const P = e.lp[0].pts;
    let best = null, bd = Infinity;
    for (let i = 1; i < P.length; i++) {
      const a = P[i - 1], b = P[i], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
      const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / L2, 0, 1), d = Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z);
      if (d < bd) { bd = d; best = e.lp[0].cum[i - 1] + Math.sqrt(L2) * t; }
    }
    return [best, bd];
  };
  for (const [x, z] of (C.points && C.points.signals) || []) {
    let n = null, bd = N.signal;
    for (const m of nodeMap.values()) { if (m.deg < 3 || m.round) continue; const d = Math.hypot(m.x - x, m.z - z); if (d < bd) { bd = d; n = m; } }
    const near = edges.map(e => [e, ...lanePos(e, x, z)]).filter(([e, s, d]) => d < 8 && s > 0.5 && s < e.len - 0.5);
    if (!n && near.length) {
      for (const [e, s] of near) e.light = +s.toFixed(1);
      lights.push({ x, z, kind: 'переход', edges: near.map(([e, s]) => `${e.name || e.cls} ${e.dir > 0 ? '+' : '−'} ${s.toFixed(0)} м`) });
      continue;
    }
    if (!n) { lights.push({ x, z, miss: true }); continue; }
    const inc = edges.filter(e => e.B === n), head = C.carriageAt(x, z);
    const ref = (head && inc.find(e => e.st === head.st)) || inc.find(e => e.major) || inc[0];
    for (const e of inc) e.grp = e === ref || e.st === ref.st || e.ex * ref.ex + e.ez * ref.ez < -0.5 ? 0 : 1;
    n.sig = { x, z, phase: stMarkSignal };
    lights.push({ x, z, kind: 'перекрёсток', node: [+n.x.toFixed(1), +n.z.toFixed(1)], in: inc.length, g0: inc.filter(e => e.grp === 0).length, g1: inc.filter(e => e.grp === 1).length });
  }

  /* ---------- стоп-линия не на чужой полосе (улицы сходятся «игреком») ---------- */
  // Машина у конца полосы стоит центром на её конце (js/traffic/driver.js), нос — в перекрёстке. Где улицы сходятся под
  // острым углом, конец полосы — рядом с другим въездом в этот узел: машина на нём видит ждущую
  // как препятствие (водитель смотрит вперёд в полосе W/2 + W/2 + 0,4 м от своей оси) и стоит, а та ждёт её — обе
  // навсегда (Carrer de Joan Ramon Benaprès → Carretera de les Costes у (−749, 224)). Конец полосы отодвигается назад
  // по точкам, пока до оси чужой полосы не станет stopGap м; на полосе остаётся не меньше trim.keep м.
  const SG = N.stopGap;
  const clash = (e, k) => {
    const C = e.lp[0].pts[k];
    for (const o of edges) {
      if (o === e || o.B !== e.B) continue;
      const Q = o.lp[0].pts;
      for (let i = 1; i < Q.length; i++) if (sitgesSeg(C[0], C[1], Q[i - 1][0], Q[i - 1][1], Q[i][0], Q[i][1]) < SG) return o;
    }
    return null;
  };
  const stopMoved = [];
  for (const e of edges) {
    const P = e.lp[0].pts, cum = e.lp[0].cum;
    let k = P.length - 1;
    const o = clash(e, k);
    if (!o) continue;
    while (k > 2 && cum[k - 1] >= T.keep && clash(e, k - 1)) k--;
    if (k > 2 && cum[k - 1] >= T.keep) k--;
    const cut = e.len - cum[k];
    if (cut < 0.1) continue;
    e.lp[0] = tPiece(P.slice(0, k + 1)); e.hy = e.hy.slice(0, k + 1); e.vprof = e.vprof.slice(0, k + 1);
    e.len = e.s1 = e.lp[0].len; e.sb -= e.dir * cut;
    const Q = e.lp[0].pts, a = Q[Math.max(0, Q.length - 3)], b = Q[Q.length - 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    e.ex = (b[0] - a[0]) / l; e.ez = (b[1] - a[1]) / l;
    if (e.span) { e.span.s1 = Math.min(e.span.s1, e.len); if (e.span.s0 >= e.span.s1) delete e.span; }
    stopMoved.push([Math.round(e.B.x), Math.round(e.B.z), `${e.name || e.cls} ← ${o.name || o.cls}`, +cut.toFixed(1)]);
  }

  /* ---------- сильная связность: без «ловушек» ---------- */
  const unlink = gone => {
    for (const e of gone) { const o = e.A.out, i = o.indexOf(e); if (i >= 0) o.splice(i, 1); }
    for (const e of edges) if (e.rev && gone.has(e.rev)) e.rev = null;
  };
  const traps = [];
  let all = edges.slice();
  for (let pass = 0; pass < 8; pass++) {
    const S = sitgesNetSCC(all, () => true, false);
    if (S.n <= 1) break;
    const gone = new Set(all.filter(e => S.comp.get(e) !== S.big));
    // ловушки — куски вне большой части: где и сколько
    const byComp = new Map();
    for (const e of gone) { const c = S.comp.get(e); if (!byComp.has(c)) byComp.set(c, { x: 0, z: 0, n: 0, m: 0 }); const b = byComp.get(c); b.x += (e.A.x + e.B.x) / 2; b.z += (e.A.z + e.B.z) / 2; b.n++; b.m += e.len; }
    for (const b of byComp.values()) traps.push({ x: Math.round(b.x / b.n), z: Math.round(b.z / b.n), m: Math.round(b.m) });
    for (const e of gone) dropped.push({ st: e.st, s0: Math.min(e.sa, e.sb), s1: Math.max(e.sa, e.sb), why: 'ловушка', len: e.len, edge: true });
    unlink(gone);
    all = all.filter(e => !gone.has(e));
  }
  // подграфы машин: Hummer (maxW) и длинные (noLong) — тоже сильно связные; что вне — им нельзя
  const sub = (ok, ban, long) => {
    let cut = 0, first = null;
    for (let pass = 0; pass < 20; pass++) {
      const S = sitgesNetSCC(all, ok, long);
      if (first === null) first = S.n;
      if (S.n <= 1) break;
      for (const e of all) if (ok(e) && S.comp.get(e) !== S.big) { ban(e); cut += e.len; }
    }
    return { comps: first, cutKm: km(cut) };
  };
  const wideCand = km(all.filter(e => !e.noLong).reduce((a, e) => a + e.len, 0));
  const hum = sub(e => e.maxW >= N.hummer.W, e => { e.maxW = N.hummer.maxW; }, false);
  const lng = sub(e => !e.noLong, e => { e.noLong = true; }, true);

  /* ---------- повороты: кривая через перекрёсток, не задевающая бордюр и дома ---------- */
  // У въезда e.turns: Map(выезд → { p, R, ban, noLong }) — водитель (js/traffic/driver.js, enterEdge) берёт кривую p
  // вместо turnPiece. Квадратичная кривая turnPiece (как у «Побережья») остаётся, если кузов X5 вдоль неё не задевает
  // бордюр тротуара (walkAt выше земли) и предметы сетки (дом, столб); иначе — лучшая из кубических с разной длиной
  // касательных (меньше всего точек кузова на тротуаре, дом и столб — втрое хуже). Квадратичная с вершиной позади
  // въезда или за выездом (полосы сходятся под тупым углом со сдвигом) — петля, у разворота — «иголка»: их не берём.
  // R — радиус для скорости в повороте, не меньше turn.R: на изломе улицы в узле с двумя рукавами (концы полос в 1 м
  // от узла) радиус кривой — доли метра, машины ползли 0,3 м/с. ban — разворот на другую проезжую часть той же улицы
  // (не своё rev): водитель берёт его, только если больше некуда; так же — obj: кузов задевает дом или столб при любой
  // кривой. noLong — автобус вдоль кривой задевает дом или столб.
  const TN = N.turn, tq = [0, 0, 0, 0], corners = [[-1, -1], [-1, 1], [1, -1], [1, 1], [0, 1], [0, -1], [-1, 0], [1, 0]];
  // столбы (круги сетки, в том числе сбиваемые с коллайдером — знак, фонарь, светофор у угла: машина в повороте едет
  // медленнее, чем нужно, чтобы его сбить; лёгкие — стулья, лежаки — без коллайдера, их сбивает) — точно по прямоугольнику
  // кузова с центром (x, z) и направлением (ux, uz): тонкий столб проскакивает между точками кузова
  const poleIn = (x, z, ux, uz, W, L, y) => {
    if (!grid) return false;
    const R = L / 2 + 1;
    for (const it of grid.query(x - R, x + R, z - R, z + R)) {
      if (it.r == null || it.poly || it.obb || (it.brk && it.brk.owner.o.light)) continue;
      if (it.y1 !== undefined ? it.y1 < y + 0.2 || it.y0 > y + 2 : y > ground(it.x, it.z) + it.h + 0.3) continue;
      const dx = it.x - x, dz = it.z - z, a = clamp(dx * ux + dz * uz, -L / 2, L / 2), b = clamp(dx * uz - dz * ux, -W / 2, W / 2);
      if (Math.hypot(dx - ux * a - uz * b, dz - uz * a + ux * b) < it.r + TN.pole) return true;
    }
    return false;
  };
  // точек кузова W × L на тротуаре (1) и на предметах (3; столб — 3 за положение) вдоль кривой p; objOnly — только
  // предметы
  const foot = (p, W, L, y0, y1, objOnly) => {
    let n = 0;
    for (let s = 0; s <= p.len + 0.01; s += TN.step) {
      tPieceAt(p, s, tq);
      const x = tq[0], z = tq[1], ux = tq[2], uz = tq[3], y = y0 + (y1 - y0) * s / (p.len || 1);
      if (poleIn(x, z, ux, uz, W, L, y)) n += 3;
      for (const [a, b] of corners) {
        const px = x + uz * a * W / 2 + ux * b * L / 2, pz = z - ux * a * W / 2 + uz * b * L / 2, h = hit(px, pz, 0.05, y);
        if (h === 1 || (objOnly && h === 2)) n += 3;
        else if (!objOnly && walkAt) { const wy = walkAt(px, pz); if (wy > ground(px, pz) + TN.curb && wy < y + 1) n++; }
      }
    }
    return n;
  };
  const bez = (P0, d0, P2, d2, a, b) => {
    const c0 = [P0[0] + d0[0] * a, P0[1] + d0[1] * a], c1 = [P2[0] - d2[0] * b, P2[1] - d2[1] * b], pts = [];
    for (let k = 0; k <= 12; k++) {
      const t = k / 12, u = 1 - t, A = u * u * u, B = 3 * u * u * t, Cc = 3 * u * t * t, D = t * t * t;
      pts.push([A * P0[0] + B * c0[0] + Cc * c1[0] + D * P2[0], A * P0[1] + B * c0[1] + Cc * c1[1] + D * P2[1]]);
    }
    return tPiece(pts);
  };
  // разворот: полукруг радиуса r влево (или вправо, если выезд правее) от конца въезда, затем кубическая к началу выезда
  const uturn = (P0, fx, fz, P2, ix, iz, r) => {
    const sd = (P2[0] - P0[0]) * fz - (P2[1] - P0[1]) * fx >= -0.5 ? 1 : -1, nx = fz * sd, nz = -fx * sd;   // к выезду
    const cx = P0[0] + nx * r, cz = P0[1] + nz * r, pts = [];
    for (let k = 0; k <= 12; k++) { const a = Math.PI * k / 12; pts.push([cx - nx * r * Math.cos(a) + fx * r * Math.sin(a), cz - nz * r * Math.cos(a) + fz * r * Math.sin(a)]); }
    const A = pts[pts.length - 1], h = Math.max(1, Math.hypot(P2[0] - A[0], P2[1] - A[1]) / 3);
    const tail = bez(A, [-fx, -fz], P2, [ix, iz], h, h).pts;
    return tPiece(pts.concat(tail.slice(1)));
  };
  const TS = { n: 0, curved: 0, curb: 0, obj: 0, ban: 0, noLong: 0 };
  for (const e of all) {
    if (e.B.round) continue;
    e.turns = new Map();
    const P0 = e.lp[0].pts[e.lp[0].pts.length - 1], y0 = e.hy[e.hy.length - 1];
    for (const ne of e.B.out) {
      if (ne === e.rev) continue;
      TS.n++;
      const P2 = ne.lp[0].pts[0], y1 = ne.hy[0], d = Math.hypot(P2[0] - P0[0], P2[1] - P0[1]);
      const dot = e.ex * ne.ix + e.ez * ne.iz, det = e.ex * ne.iz - e.ez * ne.ix;
      const T = { p: turnPiece(e, 0, ne, 0), R: 0, ban: dot < -0.9, noLong: false };
      if (T.ban) TS.ban++;
      // петля квадратичной кривой: вершина (пересечение касательных) позади конца въезда или за началом выезда
      let loop = false;
      if (!T.ban && Math.abs(det) >= 0.1) {
        const t = ((P2[0] - P0[0]) * ne.iz - (P2[1] - P0[1]) * ne.ix) / det, P1x = P0[0] + e.ex * t, P1z = P0[1] + e.ez * t;
        loop = t <= 0 || (P2[0] - P1x) * ne.ix + (P2[1] - P1z) * ne.iz <= 0;
      }
      // квадратичная кривая разворота turnPiece — «иголка» туда и обратно по одной линии: тоже не берём
      let best = loop || T.ban ? Infinity : foot(T.p, TN.W, TN.L, y0, y1);
      // запасные: обычный поворот — кубические кривые; разворот (на другую проезжую часть, обе половины разделённой дороги
      // обрезаны краем карты в одном узле) — полукруг радиуса r в сторону выезда и подход к нему
      if (best > 0 || T.ban || tPieceMinR(T.p) < TN.R) {
        const p0 = T.p, U = dot < -0.5;
        for (const h of U ? TN.uturn : TN.handles) {
          const p = U ? uturn(P0, e.ex, e.ez, P2, ne.ix, ne.iz, h) : bez(P0, [e.ex, e.ez], P2, [ne.ix, ne.iz], h[0] * d, h[1] * d), f = foot(p, TN.W, TN.L, y0, y1);
          if (f < best || (f === best && tPieceMinR(p) > tPieceMinR(T.p))) { best = f; T.p = p; }
        }
        if (T.p !== p0) TS.curved++;
      }
      if (best > 0 && best < Infinity) { TS.curb++; if (foot(T.p, TN.W, TN.L, y0, y1, true)) { T.obj = true; TS.obj++; } }
      T.R = Math.max(tPieceMinR(T.p), TN.R);
      if (!e.noLong && !ne.noLong && foot(T.p, TN.longW, TN.longL, y0, y1, true)) { T.noLong = true; TS.noLong++; }
      e.turns.set(ne, T);
    }
  }

  const nodes = [...nodeMap.values()].filter(n => n.out.length || all.some(e => e.B === n));
  // stopFront — машина встаёт у конца полосы носом, а не центром (js/traffic/traffic.js, stopOff): конец полосы — в 1 м
  // от края проезжей части другой улицы, нос в 2 м дальше был бы уже на её полосе
  const G = { nodes, edges: all, dropped, sitges: true, stopFront: true };

  /* ---------- сводка ---------- */
  const sumKm = (list, f = () => true) => km(list.filter(f).reduce((a, e) => a + e.len, 0));
  const dkm = why => km(dropped.filter(d => d.why === why).reduce((a, d) => a + d.len, 0));
  const ringArms = rg => all.filter(e => e.B === rg.node).length;
  G.report = Object.assign(trafficGraphReport(G), {
    streetKm: R.streetKm,
    keptKm: km(segs.reduce((a, s) => a + s.len, 0)),
    dropped: { 'узкая': dkm('узкая'), 'тупик': dkm('тупик'), 'петля': dkm('петля'), 'ловушка (полосы)': dkm('ловушка') },
    traps,
    oneway: sumKm(all, e => !e.rev), twoWay: sumKm(all, e => !!e.rev),
    slowKm: sumKm(all, e => e.slow),
    wide: { candKm: wideCand, km: sumKm(all, e => !e.noLong), comps: lng.comps, cutKm: lng.cutKm, minW: N.wide.minW, minR: N.wide.minR, low: lowPts },
    hummer: { noKm: sumKm(all, e => e.maxW < N.hummer.W), comps: hum.comps, cutKm: hum.cutKm },
    rings: rings.map(r => r.skip ? r : { x: Math.round(r.x), z: Math.round(r.z), R: r.R, island: r.island, parts: r.parts.length, in: ringArms(r),
      out: r.node.out.length, wrongDir: r.wrongDir, twoWay: r.twoWay, cover: r.cover }),
    signs: { stop: signs.stop.join('/'), give_way: signs.give_way.join('/'), miss: signs.miss.map(m => m.map(v => typeof v === 'number' ? Math.round(v) : v).join(' ')) },
    lights,
    major: { minor: all.filter(e => !e.major && (e.B.deg > 2)).length, signed: all.filter(e => e.sign).length },
    shifted, blocked: blocked.slice(0, 12), blockedN: blocked.length,
    turns: TS, stopMoved, crossings: crossings.map(c => `${c.streets.join(' × ')} (${Math.round(c.x)}, ${Math.round(c.z)})`),
  });
  return G;
}
