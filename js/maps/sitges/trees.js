// Ситжес — РАСКЛАДКА: деревья (этап 4б.2, после калиток js/maps/sitges/gates.js). Кроны из лидара (data-trees.js,
// 4б.0) → место, порода и размер каждого дерева (правила и таблица «улица → порода» — 4б.1, docs/sitges/stage-4b.md).
//   1. Разбор: вытянутые кроны (el > SITGES_TREE.row) — ряд, делится на несколько деревьев вдоль ближайшей улицы;
//      радиус ≥ grove — роща, пятно заполняется деревьями по шестиугольной сетке.
//   2. Место: уличное — только если центр кроны над тротуаром (C.walks, C.cornerWalks) или проезжей частью
//      (carriageAt); ствол — в лунке у бордюра. На улицах без уличных деревьев (таблица, старый город, улицы без
//      тротуара) дерево над улицей — сад за забором: ствол за наружный край тротуара / проезжей части. Иначе — парк
//      или лес OSM, первая линия у моря (пляж рядом), старый город (SITGES_OLDTOWN), сад участка.
//   3. Порода: улица — по таблице (вторая порода — доля mix), без строки — по классу улицы; сады — доли по районам
//      с подсказкой формы кроны (узкая высокая → кипарис, небольшая высоко → пальма, широкая → сосна); парки — доли.
//   4. Лунки с шагом fill на улицах таблицы, где лидар молодых деревьев не нашёл.
//   Не на проезжей части, не в частях домов (C.partCells), не в бассейнах и воде, не в проёмах калиток (C.gates).
// Без R(): выбор — по хешу координат (sitgesTreeHash), раскладка остального города не меняется.
// C.trees — [{ x, z, y, f, k, h, r, ry, c, p }]: основание ствола, форма (id из SITGES_TREE_KINDS), порода, высота,
//   радиус кроны, поворот, оттенок 0…1, место (street / fill / garden / park / sea / old). C.treeStats — счёт.
// Определяет: SITGES_TREE, sitgesTreeHash, sitgesPlanTrees.
// Использует: clamp (js/core.js); SITGES_TREES (js/maps/sitges/data-trees.js); sitgesCells, sitgesInPoly, sitgesBBox
//   (js/maps/sitges/geom.js); sitgesDec (js/maps/sitges/plan.js); SITGES_OLDTOWN (js/maps/sitges/styles.js);
//   SITGES_FSTYLE (js/maps/sitges/fencestyle.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const SITGES_TREE = {
  row: 2.2,            // вытянутость больше — ряд сросшихся крон: делить вдоль улицы
  grove: 12,           // радиус кроны не меньше — роща
  kerb: 0.75,          // ствол уличного дерева — от бордюра, м (не дальше половины тротуара)
  behind: 1.3,         // ствол садового дерева над улицей — за краем тротуара / проезжей части, м
  seaNear: 35,         // пляж ближе — первая линия у моря
  // улица → { k: [порода, вторая], mix: доля второй, form: форма по породе, young: молодые (размер по месту),
  //   size: [h0, h1, r0, r1] — размер по месту (4б.1), fill: шаг лунок, м; none: уличных нет (сады)
  streets: {
    'Avinguda de Sofia': { k: ['plane', 'pine'], mix: 0.1, form: { plane: 'plane1' }, fill: 9, fillSize: [6, 9, 2.5, 3.5] },
    'Passeig de Vilafranca': { k: ['palm', 'celtis'], mix: 0.35, form: { palm: 'date' } },
    'Passeig Marítim': { k: ['palm', 'tamarisk'], mix: 0.25, form: { palm: ['date', 'date', 'date', 'washington'] }, size: [9, 14, 2.5, 3] },
    'Passeig de la Ribera': { k: ['palm'], form: { palm: ['canary', 'canary', 'washington'] }, size: [10, 15, 3.5, 4.2] },
    'Carrer de Balmes': { k: ['plane'], form: { plane: 'plane2' } },
    'Passeig del Doctor Caietà Benaprés': { k: ['plane'], form: { plane: 'plane2' } },
    'Avinguda de Navarra': { k: ['pine', 'aleppo'], mix: 0.4 },
    'Avinguda de Nostra Senyora del Vinyet': { k: ['aleppo', 'pine'], mix: 0.4 },
    'Avinguda de Ronda': { k: ['aleppo'] },
    'Carrer de Ramon de Dalmases': { k: ['palm', 'celtis'], mix: 0.3, form: { palm: 'date' }, fill: 10, fillSize: [5, 8, 2.2, 2.8] },
    'Carrer del Mestre Manuel Torrens': { k: ['celtis'] },
    "Carrer d'en Pepe de Garraf": { k: ['celtis'], form: { celtis: 'celtis1' } },
    "Carrer de l'Abadessa Maria Lluïsa de Dalmau": { k: ['celtis'], young: true, fill: 8 },
    'Carrer de Salvador Soler i Forment': { k: ['celtis'], young: true, fill: 8 },
    'Avinguda del Camí dels Capellans': { k: ['celtis', 'aleppo'], mix: 0.15, young: true, fill: 9 },
    'Carrer de Jacint Picas i Cardó': { k: ['celtis'], form: { celtis: 'feather' } },
    'Avinguda de les Flors': { k: ['celtis'], form: { celtis: 'feather' } },
    'Carrer Joan Maragall': { k: ['celtis'], form: { celtis: 'celtis1' } },
    'Avinguda de Francesc Macià': { k: ['celtis'], form: { celtis: 'celtis1' } },
    'Carretera de les Costes': { k: ['celtis', 'orange'], mix: 0.3, form: { orange: 'orange2' } },
    'Carrer de Josep Carbonell i Gener': { k: ['cypress', 'celtis'], mix: 0.4 },
    "Carrer d'Àngel Guimerà": { k: ['celtis'], form: { celtis: 'feather' } },
    "Carrer d'Aiguadolç": { k: ['aleppo'], form: { aleppo: 'aleppo2' } },
    'Passeig de les Drassanes': { k: ['garden'], form: { garden: 'garden1' } },
    "Avinguda d'Emerencià Roig i Raventós": { none: true },
    "Carrer de l'Illa de Cuba": { none: true }, 'Carrer de Sant Isidre': { none: true },
    "Carrer d'Arcadi Mas i Fontdevila": { none: true }, 'Carrer de Rafael Llopart': { none: true },
    'Carrer de Roma': { none: true }, "Carrer d'Anselm Clavé": { none: true }, 'Passeig de Vilanova': { none: true },
  },
  // сады по районам (зоны — SITGES_FSTYLE.zones): доли [сосны, пальмы, кипарис, садовое]
  gardens: { terramar: [35, 20, 10, 35], vinyet: [30, 20, 15, 35], centre: [20, 40, 5, 35], east: [30, 35, 5, 30], marina: [30, 35, 5, 30] },
  oleander: { terramar: 0.55, vinyet: 0.45, centre: 0.4, east: 0.3, marina: 0.3 },   // доля олеандра среди низкого садового
  parks: [60, 15, 0, 25],
  parkKinds: ['park', 'garden', 'playground', 'golf', 'pitch'], woodKinds: ['wood', 'scrub'],
};

// хеш точки (дм) и соли → 0…1
function sitgesTreeHash(x, z, s = 0) {
  const v = Math.sin(Math.round(x * 10) * 12.9898 + Math.round(z * 10) * 78.233 + s * 37.719) * 43758.5453;
  return v - Math.floor(v);
}

function sitgesPlanTrees(C) {
  const { walks, cornerWalks, corners, carriageAt, carriageNear, partCells, areas, gates, ground, waterAt, inside } = C;
  const P = SITGES_TREE, H = sitgesTreeHash, T = SITGES_TREES;
  const zoneOf = x => SITGES_FSTYLE.zones.find(([, t]) => x > t)[0];
  const oldAt = (x, z) => SITGES_OLDTOWN.some(([cx, cz, rr]) => (x - cx) ** 2 + (z - cz) ** 2 < rr * rr);

  /* ---------- исходные кроны ---------- */
  const src = [];
  {
    const p = sitgesDec(T.p), m = sitgesDec(T.m), nm = m.length / T.n;
    let x = 0, z = 0;
    for (let i = 0; i < T.n; i++) {
      x += p[2 * i]; z += p[2 * i + 1];
      const o = i * nm;
      src.push({ x: x / 10, z: z / 10, h: m[o] / 10, r: m[o + 1] / 10, el: m[o + 2] / 10, fl: m[o + 3] / 100, gp: m[o + 4] / 100 });
    }
  }

  /* ---------- сетки: тротуары, части домов, бассейны, парки, пляжи, калитки ---------- */
  const inTri = (x, z, a, b, c) => {
    const d0 = (b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]), d1 = (c[0] - b[0]) * (z - b[1]) - (c[1] - b[1]) * (x - b[0]);
    const d2 = (a[0] - c[0]) * (z - c[1]) - (a[1] - c[1]) * (x - c[0]);
    return !((d0 < 0 || d1 < 0 || d2 < 0) && (d0 > 0 || d1 > 0 || d2 > 0));
  };
  const pieces = sitgesCells(8);
  const addPiece = (pts, W, st) => {
    const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]);
    pieces.add(Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs), { pts, W, st });
  };
  for (const W of walks) addPiece([W.I0, W.I1, W.O1, W.O0], W, W.st);
  cornerWalks.forEach(({ N, ring }, ci) => {
    for (let k = 1; k <= N; k++) { const A = ring[k - 1], B = ring[k]; if (!(A.w < 0.05 && B.w < 0.05)) addPiece([A.I, B.I, B.Ou, A.Ou], null, corners[ci] && corners[ci].a.st); }
  });
  const walkAt = (x, z) => { for (const p of pieces.at(x, z)) { const q = p.pts; if (inTri(x, z, q[0], q[1], q[2]) || inTri(x, z, q[0], q[2], q[3])) return p; } return null; };
  const inPart = (x, z, m = 0) => partCells.at(x, z).some(o => x >= o.bb[0] - m && x <= o.bb[1] + m && z >= o.bb[2] - m && z <= o.bb[3] + m &&
    (sitgesInPoly(x, z, o.r) || (m > 0 && [[m, 0], [-m, 0], [0, m], [0, -m]].some(([a, b]) => sitgesInPoly(x + a, z + b, o.r)))));
  const polys = kinds => {
    const S = new Set(kinds), cells = sitgesCells(32);
    for (const a of areas) if (S.has(a.kind) && a.ring && a.ring.length > 2) { const bb = sitgesBBox(a.ring); cells.add(...bb, { r: a.ring, bb, kind: a.kind }); }
    return (x, z) => { for (const o of cells.at(x, z)) if (x >= o.bb[0] && x <= o.bb[1] && z >= o.bb[2] && z <= o.bb[3] && sitgesInPoly(x, z, o.r)) return o.kind; return null; };
  };
  const poolAt = polys(['pool', 'water']), parkAt = polys([...P.parkKinds, ...P.woodKinds, 'cemetery']), beachAt = polys(['beach', 'sand']);
  const seaFront = (x, z) => { const d = P.seaNear; return !!(beachAt(x, z) || beachAt(x, z - d) || beachAt(x + d * 0.7, z - d * 0.7) || beachAt(x - d * 0.7, z - d * 0.7)); };
  const gateCells = sitgesCells(16);
  for (const g of gates) gateCells.add(g.x - g.w, g.x + g.w, g.z - g.w, g.z + g.w, g);
  const inGate = (x, z) => gateCells.at(x, z).some(g => Math.hypot(x - g.x, z - g.z) < g.w / 2 + 1.2);
  const wet = (x, z) => { const w = waterAt(x, z); return w > -Infinity && ground(x, z) < w + 0.3; };
  const bad = (x, z) => !inside(x, z) || wet(x, z) || inPart(x, z, 0.4) || poolAt(x, z) || inGate(x, z);

  // направление ближайшей проезжей части (для рядов) или null
  const streetDir = (x, z, R) => {
    let best = null, bd = R;
    for (const [st, i] of carriageNear(x - R, x + R, z - R, z + R)) {
      const a = st.v[i], b = st.v[i + 1], dx = b.x - a.x, dz = b.z - a.z, LL = dx * dx + dz * dz || 1;
      const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / LL, 0, 1), d = Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
      if (d < bd) { bd = d; best = [dx / Math.sqrt(LL), dz / Math.sqrt(LL)]; }
    }
    return best;
  };

  /* ---------- 1. ряды и рощи → отдельные кроны ---------- */
  const cand = [], stat = { rows: 0, groves: 0 };
  for (const s of src) {
    if (s.r >= P.grove) {                                   // роща: шестиугольная сетка в круге
      stat.groves++;
      // сетка повёрнута на угол по хешу рощи, узлы сдвинуты на ±0,35 шага — сверху не видно правильных рядов
      const sp = clamp(s.r / 3, 5, 8), rr = sp * 0.62, ga = H(s.x, s.z, 7) * Math.PI, gc = Math.cos(ga), gs = Math.sin(ga);
      for (let j = -Math.ceil(s.r / sp); j <= Math.ceil(s.r / sp); j++) for (let i = -Math.ceil(s.r / sp); i <= Math.ceil(s.r / sp); i++) {
        const ux = (i + (j & 1) * 0.5) * sp, uz = j * sp * 0.866, ox = ux * gc - uz * gs, oz = ux * gs + uz * gc;
        if (ox * ox + oz * oz > (s.r - rr * 0.5) ** 2) continue;
        const x = s.x + ox + (H(s.x + ox, s.z + oz, 1) - 0.5) * sp * 0.7, z = s.z + oz + (H(s.x + ox, s.z + oz, 2) - 0.5) * sp * 0.7;
        cand.push({ x, z, h: s.h * (0.7 + 0.3 * H(x, z, 3)), r: rr * (0.85 + 0.3 * H(x, z, 4)), el: 1, fl: s.fl, gp: s.gp, grove: true });
      }
      continue;
    }
    if (s.el > P.row) {                                     // ряд вдоль ближайшей улицы
      stat.rows++;
      const n = Math.min(6, Math.round(s.el)), a = s.r * Math.sqrt(s.el), b = s.r / Math.sqrt(s.el);
      const dir = streetDir(s.x, s.z, 25) || (() => { const ang = H(s.x, s.z, 5) * Math.PI; return [Math.cos(ang), Math.sin(ang)]; })();
      const ri = Math.max(b, a / n) * 1.05;
      for (let k = 0; k < n; k++) {
        const o = -a + a * (2 * k + 1) / n, x = s.x + dir[0] * o, z = s.z + dir[1] * o;
        cand.push({ x, z, h: s.h * (0.85 + 0.15 * H(x, z, 6)), r: ri, el: 1, fl: s.fl, gp: s.gp });
      }
      continue;
    }
    cand.push(s);
  }

  /* ---------- 2–3. место и порода ---------- */
  const trees = [], streetIdx = sitgesCells(16);
  const pickW = (w, u) => { let s = 0; for (const v of w) s += v; u *= s; for (let i = 0; i < w.length; i++) { if ((u -= w[i]) < 0) return i; } return w.length - 1; };
  const oneOf = (v, u) => Array.isArray(v) ? v[Math.min(v.length - 1, Math.floor(u * v.length))] : v;
  // форма породы по размеру (если таблица не задала)
  const formOf = (k, t, u, want) => {
    if (want) return oneOf(want, u);
    switch (k) {
      case 'pine': return u < 0.25 ? 'pine2' : 'pine1';
      case 'aleppo': return t.h > 10 && t.r < 3.5 ? 'aleppo2' : 'aleppo1';
      case 'plane': return u < 0.5 ? 'plane1' : 'plane2';
      case 'celtis': return t.h < 6.5 ? 'celtis2' : u < 0.15 ? 'feather' : 'celtis1';
      case 'palm': return t.r > 3.5 ? 'canary' : u < 0.3 ? 'washington' : 'date';
      case 'cypress': return u < 0.8 ? 'cypress1' : 'cypress2';
      case 'orange': return u < 0.6 ? 'orange1' : 'orange2';
      case 'tamarisk': return u < 0.6 ? 'tamarisk1' : 'tamarisk2';
      default: return 'garden1';
    }
  };
  // садовое / парковое дерево по долям [сосны, пальмы, кипарис, садовое] с подсказкой формы кроны
  const groupKind = (t, w, zone) => {
    const u = H(t.x, t.z, 10), v = H(t.x, t.z, 11);
    if (t.grove) return u < 0.65 ? 'aleppo' : 'pine';
    if (t.r < 1.5 && t.h > 6 && w[2] > 0) return 'cypress';                      // узкая высокая
    if (t.r >= 1.5 && t.r <= 3 && t.h > 8 && u < 0.7 && w[1] > 0) return 'palm'; // небольшая крона высоко
    if (t.r > 4 && t.h > 7 && u < 0.75) return v < 0.55 ? 'aleppo' : 'pine';     // широкая
    if (t.h < 5) return u < 0.8 ? 'garden' : (w[2] > 0 && t.r < 1.8 ? 'cypress' : 'garden');
    const ww = w.slice();
    if (t.r > 2.2) ww[2] = 0;                                                     // кипарис — только узкий
    if (t.r > 4.5) ww[1] = 0;
    const g = pickW(ww, u);
    return g === 0 ? (v < 0.5 ? 'aleppo' : 'pine') : g === 1 ? 'palm' : g === 2 ? 'cypress' : 'garden';
  };
  const add = (t, x, z, k, f, h, r, place) => {
    // размеры по форме: кипарис узкий, пальмы не мельче фото, садовое невысокое
    if (k === 'cypress') r = clamp(r, 0.7, 1.8), h = Math.max(h, 5);
    if (k === 'palm') { r = clamp(r, f === 'washington' ? 2 : 2.4, 4.2); h = Math.max(h, 6); }
    if (k === 'orange') { h = clamp(h, 3, 5.5); r = clamp(r, 1.2, 2.4); }
    if (f === 'garden2') { h = clamp(h, 3, 6); r = clamp(r, 1.5, 3); }
    if (f === 'garden1') { h = clamp(h, 3.5, 9); r = clamp(r, 2, 5); }
    if (f === 'celtis2') r = clamp(r, 1.3, 2.5);
    r = Math.min(r, h * 0.8);
    const tr = { x, z, y: ground(x, z), f, k, h: Math.round(h * 10) / 10, r: Math.round(r * 10) / 10, ry: H(x, z, 20) * Math.PI * 2, c: H(x, z, 21), p: place };
    trees.push(tr);
    if (place === 'street' || place === 'fill') streetIdx.add(x - 1, x + 1, z - 1, z + 1, tr);
    return tr;
  };
  // крупное лиственное в саду (магнолия, фикус) — модель каркаса, олива и олеандр — садовые
  const gardenForm = (t, zone) => t.h > 9 && t.r > 3 ? ['celtis', 'celtis1'] : H(t.x, t.z, 12) < (t.h < 5.5 ? P.oleander[zone] : 0.15) ? ['garden', 'garden2'] : ['garden', 'garden1'];
  const placeGroup = (t, x, z, place) => {
    const zone = zoneOf(x), w = place === 'park' ? (parkAt(x, z) === 'cemetery' ? [10, 5, 60, 25] : P.woodKinds.includes(parkAt(x, z)) ? [90, 0, 0, 10] : P.parks)
      : place === 'old' ? [10, 40, 5, 45] : P.gardens[zone];
    if (place === 'sea') {                                   // первая линия: пальмы и тамариски
      const k = t.h < 6 && H(x, z, 13) < 0.5 ? 'tamarisk' : 'palm';
      return add(t, x, z, k, formOf(k, t, H(x, z, 14)), t.h, t.r, place);
    }
    let k = groupKind(t, w, zone), f;
    if (k === 'garden') [k, f] = gardenForm(t, zone);
    return add(t, x, z, k, f || formOf(k, t, H(x, z, 14)), t.h, t.r, place);
  };
  // сторона дерева от оси улицы st у отрезка i: единичный вектор от оси к точке (по хешу, если на оси)
  const away = (st, i, x, z) => {
    const a = st.v[i], b = st.v[i + 1] || a, dx = b.x - a.x, dz = b.z - a.z, LL = Math.hypot(dx, dz) || 1;
    const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / (LL * LL), 0, 1), px = a.x + dx * t, pz = a.z + dz * t;
    let nx = -dz / LL, nz = dx / LL;
    const s = (x - px) * nx + (z - pz) * nz;
    if (Math.abs(s) < 0.3 ? H(x, z, 15) < 0.5 : s < 0) { nx = -nx; nz = -nz; }
    return { px, pz, nx, nz, hw: a.hw + ((b.hw || a.hw) - a.hw) * t };
  };
  // кусок тротуара W: точка у бордюра (k = kerb) или за наружным краем (behind) против точки (x, z)
  const onWalkPiece = (W, x, z, mode) => {
    const ix = W.I1[0] - W.I0[0], iz = W.I1[1] - W.I0[1], LL = ix * ix + iz * iz || 1;
    const t = clamp(((x - W.I0[0]) * ix + (z - W.I0[1]) * iz) / LL, 0.05, 0.95);
    const Ix = W.I0[0] + ix * t, Iz = W.I0[1] + iz * t, Ox = W.O0[0] + (W.O1[0] - W.O0[0]) * t, Oz = W.O0[1] + (W.O1[1] - W.O0[1]) * t;
    const w = Math.hypot(Ox - Ix, Oz - Iz) || 1, ux = (Ox - Ix) / w, uz = (Oz - Iz) / w;
    if (mode === 'kerb') { const d = Math.min(P.kerb, w / 2); return [Ix + ux * d, Iz + uz * d, w]; }
    return [Ox + ux * P.behind, Oz + uz * P.behind, w];
  };
  // тротуар той же улицы у отрезка i, ближайший к точке
  const walksOf = new Map();
  for (const W of walks) { let L = walksOf.get(W.st); if (!L) walksOf.set(W.st, L = []); L.push(W); }
  const nearWalk = (st, i, x, z) => {
    let best = null, bd = Infinity;
    for (const W of walksOf.get(st) || []) {
      if (Math.abs(W.i - i) > 1) continue;
      const d = Math.min(Math.hypot(W.I0[0] - x, W.I0[1] - z), Math.hypot(W.I1[0] - x, W.I1[1] - z), Math.hypot((W.I0[0] + W.I1[0]) / 2 - x, (W.I0[1] + W.I1[1]) / 2 - z));
      if (d < bd) { bd = d; best = W; }
    }
    return best;
  };
  const cnt = { drop: 0, moved: 0 };
  const streetTree = (t, x, z, st, row) => {
    const sp = row || {};
    let k, f, h = t.h, r = t.r;
    if (row) {
      k = sp.k.length > 1 && H(x, z, 16) < (sp.mix || 0) ? sp.k[1] : sp.k[0];
      f = formOf(k, t, H(x, z, 17), sp.form && sp.form[k]);
      if (sp.size && k === sp.k[0]) { h = sp.size[0] + (sp.size[1] - sp.size[0]) * H(x, z, 18); r = sp.size[2] + (sp.size[3] - sp.size[2]) * H(x, z, 19); }
      if (sp.young && k === 'celtis') { h = clamp(h, 4, 6.5); r = clamp(r, 1.5, 2.2); f = 'celtis2'; }
    } else {
      const zone = zoneOf(x);
      k = st.cls === 'secondary' || st.cls === 'tertiary' ? (zone === 'terramar' || zone === 'vinyet' ? 'aleppo' : 'plane') : 'celtis';
      if (seaFront(x, z)) k = t.h < 6 && H(x, z, 13) < 0.4 ? 'tamarisk' : 'palm';
      f = formOf(k, t, H(x, z, 17));
    }
    if (k === 'plane' || k === 'celtis') r = Math.min(r, h * 0.5, 6);   // крона над улицей — не шире стриженой
    return add(t, x, z, k, f, h, r, 'street');
  };

  for (const t of cand) {
    const { x, z } = t;
    if (!inside(x, z) || wet(x, z)) { cnt.drop++; continue; }
    const wp = walkAt(x, z), cr = wp ? null : carriageAt(x, z);
    const st = wp ? wp.st : cr && cr.st;
    if (st && (st.drive || st.cls === 'pedestrian')) {
      const row = st.name && P.streets[st.name], old = oldAt(x, z);
      const hasWalk = (walksOf.get(st) || []).length > 0;
      const street = !(row && row.none) && !old && hasWalk && st.drive;
      let W = wp && wp.W, px, pz;
      if (street && !W && cr) W = nearWalk(st, cr.i, x, z);
      if (street && W) {
        [px, pz] = onWalkPiece(W, x, z, 'kerb');
        if (!bad(px, pz) && !carriageAt(px, pz)) { streetTree(t, px, pz, st, row && !row.none ? row : null); continue; }
      } else if (street && wp && !W) {                        // тротуар скруглённого угла — ствол на месте
        if (!bad(x, z)) { streetTree(t, x, z, st, row && !row.none ? row : null); continue; }
      }
      if (old && st.cls === 'pedestrian') {                   // площади и улочки старого города — апельсины
        if (!bad(x, z)) { add(t, x, z, 'orange', formOf('orange', t, H(x, z, 14)), t.h, t.r, 'old'); continue; }
      }
      // сад за забором: ствол за наружный край тротуара или проезжей части
      if (W || wp) { const P2 = W ? onWalkPiece(W, x, z, 'behind') : null; if (P2) [px, pz] = P2; }
      if (px === undefined || bad(px, pz) || carriageAt(px, pz) || walkAt(px, pz)) {
        const i = wp && wp.W ? wp.W.i : cr ? cr.i : 0, A = away(st, Math.min(i, st.v.length - 2), x, z);
        const w = W ? Math.max(...[W.I0, W.O0].map(p => Math.hypot(p[0] - A.px, p[1] - A.pz))) : A.hw;
        px = A.px + A.nx * (w + P.behind); pz = A.pz + A.nz * (w + P.behind);
      }
      if (bad(px, pz) || carriageAt(px, pz) || walkAt(px, pz)) { cnt.drop++; continue; }
      cnt.moved++;
      placeGroup(t, px, pz, old ? 'old' : 'garden');
      continue;
    }
    if (bad(x, z) || walkAt(x, z)) { cnt.drop++; continue; }
    const park = parkAt(x, z);
    placeGroup(t, x, z, park ? 'park' : seaFront(x, z) ? 'sea' : oldAt(x, z) ? 'old' : 'garden');
  }

  /* ---------- уличные: слияние дублей (две вершины одной кроны у одной лунки) ---------- */
  {
    const gone = new Set();
    for (const t of trees) {
      if (t.p !== 'street' || gone.has(t)) continue;
      for (const o of streetIdx.at(t.x, t.z)) if (o !== t && !gone.has(o) && Math.hypot(o.x - t.x, o.z - t.z) < 3 && o.h <= t.h) gone.add(o);
    }
    if (gone.size) { const keep = trees.filter(t => !gone.has(t)); trees.length = 0; trees.push(...keep); cnt.merged = gone.size; }
  }

  /* ---------- 4. лунки с шагом по улицам таблицы ---------- */
  const near = (x, z, d) => { for (const o of streetIdx.at(x, z)) if (Math.hypot(o.x - x, o.z - z) < d) return true;
    for (const L of [[x + d, z], [x - d, z], [x, z + d], [x, z - d]]) for (const o of streetIdx.at(...L)) if (Math.hypot(o.x - x, o.z - z) < d) return true; return false; };
  for (const [st, list] of walksOf) {
    const row = st.name && P.streets[st.name];
    if (!row || !row.fill) continue;
    for (const side of [0, 1]) {
      const L = list.filter(W => W.side === side).sort((a, b) => a.i - b.i);
      let s = H(st.v[0].x, st.v[0].z, 30 + side) * row.fill;   // фаза шага
      for (const W of L) {
        const len = Math.hypot(W.I1[0] - W.I0[0], W.I1[1] - W.I0[1]);
        for (; s < len; s += row.fill) {
          const t = s / len;
          const x0 = W.I0[0] + (W.I1[0] - W.I0[0]) * t, z0 = W.I0[1] + (W.I1[1] - W.I0[1]) * t;
          const [x, z, w] = onWalkPiece(W, x0, z0, 'kerb');
          if (w < 1.4 || (W.cutStart && t < 0.25) || (W.cutEnd && t > 0.75)) continue;
          if (bad(x, z) || carriageAt(x, z, null, 0.4) || near(x, z, row.fill * 0.6)) continue;
          const sz = row.fillSize || [4, 6, 1.5, 2.1], k = row.k[0];
          const h = sz[0] + (sz[1] - sz[0]) * H(x, z, 32), r = sz[2] + (sz[3] - sz[2]) * H(x, z, 33);
          const f = k === 'celtis' ? 'celtis2' : formOf(k, { h, r }, H(x, z, 34), row.form && row.form[k]);
          add({ x, z, h, r }, x, z, k, f, h, r, 'fill');
        }
        s -= len;
      }
    }
  }

  /* ---------- счёт ---------- */
  const treeStats = { n: trees.length, src: src.length, rows: stat.rows, groves: stat.groves, drop: cnt.drop, moved: cnt.moved, merged: cnt.merged || 0, kind: {}, place: {}, form: {} };
  for (const t of trees) {
    treeStats.kind[t.k] = (treeStats.kind[t.k] || 0) + 1;
    treeStats.place[t.p] = (treeStats.place[t.p] || 0) + 1;
    treeStats.form[t.f] = (treeStats.form[t.f] || 0) + 1;
  }
  Object.assign(C, { trees, treeStats });
}
