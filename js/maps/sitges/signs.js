// Ситжес — РАСКЛАДКА: вывески заведений (этап 6а.1). После балконов и карнизов (sitgesPlanFacades, styles.js):
//   заведение OSM (js/maps/sitges/data-venues.js) → ближайший кусок фасада к улице (вид street / shops, не строение
//   h.lm) не дальше snap м → проекция на стену → форма по виду (таблица «Виды вывесок», docs/sitges/stage-6a.md):
//   ресторан, кафе — доска, на набережной и в старом городе — маркиза; бар, клуб, банк — доска + флажок; аптека —
//   доска «Farmàcia» + крест на углу дома или у края доски; супермаркет — широкая доска, в отдельном здании ещё стела
//   у улицы; заправка — навес над точкой и стела; отель — буквы над плоской крышей (на краю, у фасада к морю или
//   к самой широкой улице) или под карнизом скатной.
//   Высота — над витриной (SITGES_FAC.shopY) и ниже пола второго этажа и плиты балкона (C.balconies) над вывеской;
//   на стене вида street центр доски сдвигается на ось с витриной (не на ось двери — как шейдер facade.js).
//   Типовые — на кусках вида shops без заведения рядом: места через slot м, есть ли вывеска и какая — по хешу места
//   и району (старый город и набережная — бары, рестораны, кафе; остальное — лавки), без R().
//   В старом городе доски меньше (town). Части строений h.lm заведений не получают; у строений свои вывески —
//   SITGES_SIGNS.lm (рынок, Прадо, Террамар — по кадрам 6а.4).
// C.signs — [{ x, y, z, nx, nz, w, h, form, cat, text, brand, generic, key }] (договор docs/sitges/stage-6a.md):
//   x, z — середина лица у доски, букв и стелы, у флажка, креста и маркизы — место крепления на стене (лицо
//   выступает по нормали: флажок и крест — на SITGES_SIGNS.blade.out, маркиза — на awning.d); у навеса — середина
//   навеса; y — середина лица от уровня моря; nx, nz — наружная нормаль стены; key — form|cat|brand|text.
//   C.signStats — сводка (по формам, видам, типовые, пропуски по причинам).
// Определяет: SITGES_SIGNS, sitgesVenues, sitgesPlanSigns.
// Использует: clamp (js/core.js); SITGES_VENUES (js/maps/sitges/data-venues.js); sitgesCells, sitgesBBox,
//   sitgesInPoly, sitgesSeg, SITGES_SEG (js/maps/sitges/geom.js); sitgesDec, sitgesPts, SITGES_FLOOR
//   (js/maps/sitges/plan.js); SITGES_WALL (js/maps/sitges/houses.js); SITGES_OLDTOWN (js/maps/sitges/styles.js);
//   SITGES_FAC (js/maps/sitges/facade.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const SITGES_SIGNS = {
  snap: 15,          // заведение дальше от куска фасада к улице — без вывески, м
  inR: 40,           // точка внутри дома — фасад того же здания не дальше, м
  tries: 3,          // место занято или тесно — следующий по близости кусок (не больше стольких)
  bldR: 9,           // здание заведения — под точкой или не дальше, м
  open: 6,           // открытая стена своего здания — перед ней нет домов ближе, м
  minL: 1.4,         // кусок стены короче — не для вывески
  gap: 0.15,         // над витриной (верх SITGES_FAC.shopY) до низа вывески, м
  clear: 2.5,        // низ вывески не ниже стольких метров над землёй
  overlap: 0.4,      // когда тесно — на столько вывеска может заходить на верх витрины, м
  front: [0.6, 1.8, 3, 5, 8, 11, 14], // открытая стена (yard): мостовая или тротуар на таком удалении перед ней, раньше дома
  floorGap: 0.12,    // от верха вывески до пола второго этажа (base + SITGES_FLOOR.ground) и до низа плиты балкона
  minH: 0.38,        // лицо ниже — не влезает, пропуск
  edge: 0.25,        // от края куска стены
  sep: 0.4,          // между вывесками на одной стене
  // доска: высота лица; ширина = text · ch + pad (не уже min, не шире max и куска)
  board: { h: 0.6, ch: 0.34, pad: 0.6, min: 1.4, max: 7.5 },
  wide: { h: 0.9, ch: 0.55, pad: 1.2, min: 3.5, max: 14 },     // супермаркет
  // старый город (SITGES_OLDTOWN): таблички меньше — по кадрам 6а.4 (Karmela, El Cable, Izarra) там нет широких коробов
  town: { h: 0.45, ch: 0.27, pad: 0.4, min: 1.0, max: 3.6 },
  awning: { h: 0.32, d: 1.3, min: 2.4, max: 8, drop: 0.55 },   // маркиза: фестон h, вынос d; верх у стены на drop выше фестона
  blade: { w: 0.62, h: 0.62, out: 0.75, tall: [0.42, 1.25] },   // флажок: лицо w × h, середина в out м от стены; клуб — высокий
  cross: { w: 0.75, h: 0.75, out: 0.55 },
  letters: { ch: 0.62, roof: [0.9, 2.2], eave: 0.7, inset: 0.5, lift: 0.15, // отель: высота букв над плоской крышей — от этажности
    // буквы над входом (низ второго этажа), а не на крыше — по кадрам 6а.4: { название: высота букв }
    low: { Calipolis: 1.0 } },
  totem: { w: 1.4, h: 3.2, foot: 0.6, back: 2.2, side: 2.5 },  // стела: лицо, низ лица над землёй, от бордюра назад, вбок от доски
  canopy: { w: 14, h: 0.8, y: 5.2 },                            // навес АЗС: кромка w × h, середина на y над землёй
  maxText: 24,       // длиннее — режем по « - », « | », « (»
  seaR: 130,         // набережная: берег ближе стольких метров перед фасадом
  near: 12,          // типовой вывески нет ближе стольких метров к вывеске заведения
  slot: 8.5,         // шаг мест типовых вывесок вдоль куска вида shops, м
  // типовые: доля мест с вывеской и [текст, вид, вес] по району
  generic: {
    p: 0.6,
    town: [['Bar', 'bar', 18], ['Restaurant', 'restaurant', 18], ['Cafè', 'cafe', 8], ['Tapes', 'bar', 6], ['Gelats', 'icecream', 6],
      ['Souvenirs', 'shop', 8], ['Botiga', 'shop', 8], ['Bodega', 'shop', 4], ['Forn', 'bakery', 4], ['Moda', 'shop', 5]],
    sea: [['Restaurant', 'restaurant', 30], ['Bar', 'bar', 20], ['Cafè', 'cafe', 10], ['Gelats', 'icecream', 8], ['Cocteleria', 'bar', 6],
      ['Souvenirs', 'shop', 6]],
    town2: [['Bar', 'bar', 14], ['Forn', 'bakery', 10], ['Fruiteria', 'shop', 10], ['Perruqueria', 'shop', 10], ['Botiga', 'shop', 10],
      ['Bodega', 'shop', 6], ['Ferreteria', 'shop', 5], ['Papereria', 'shop', 5], ['Cafè', 'cafe', 8], ['Restaurant', 'restaurant', 8],
      ['Carnisseria', 'shop', 4], ['Merceria', 'shop', 3], ['Immobiliària', 'shop', 5]],
  },
  // вывески строений (части h.lm — их своих вывесок раскладка не ставит; кадры 6а.4, docs/sitges/stage-6a.md):
  //   id — строение SITGES_LM; стена — у частей с этажностью ≥ floors (top — только самые высокие), открытая (перед ней
  //   нет дома в 2 м), длиной ≥ ширины вывески; лучшая — по направлению dir (нормаль к нему) или к самой широкой улице
  //   (street); y — середина лица над полом части (top — на столько ниже верха стен), out — от стены до лица; ширина —
  //   знаков × h × ch. Цвета — SITGES_BRANDS (ключи строений: mercat, prado, terramar).
  lm: [
    // рынок: белые буквы на тёмном выносном поясе над стеклянным первым этажом к Artur Carbonell (пояс — base + 4,2…5,0,
    // лицо в 1,8 м от стены, js/maps/sitges/lm/market.js); Mercadona внутри — снаружи её вывески на кадрах нет
    { id: 'market', text: 'mercat sitges', brand: 'mercat', cat: 'shop', form: 'letters', dir: [0, -1], floors: 5, y: 4.6, h: 0.5, out: 1.83, ch: 0.55 },
    // Прадо: надпись на светлой панели над аркой входа (кадр Commons «Façana del Prado Suburense»); посередине стены
    // у модели балкон — панель на доле at длины стены
    { id: 'prado', text: 'PRADO SUBURENSE', brand: 'prado', cat: 'shop', form: 'board', street: true, floors: 2, y: 4.0, h: 0.5, out: 0.08, ch: 0.5, at: 0.28 },
    // Террамар: тёмные буквы на белом парапете верхнего уровня к морю (кадр Street View с набережной; парапет 0,75 м над
    // верхом стен, вынос пояса 0,25 м — js/maps/sitges/lm/terramar.js); top < 0 — выше верха стен
    { id: 'terramar', text: 'TERRAMAR', brand: 'terramar', cat: 'hotel', form: 'letters', dir: [0, -1], top: -0.38, h: 0.62, out: 0.3, ch: 0.62 },
  ],
  // надпись бренда (нет — название OSM)
  brandText: { mercadona: 'Mercadona', caprabo: 'Caprabo', lidl: 'Lidl', aldi: 'ALDI', dia: 'Dia', bonpreu: 'Bonpreu',
    consum: 'Consum', supercor: 'Supercor', caixabank: 'CaixaBank', bbva: 'BBVA', sabadell: 'Sabadell', santander: 'Santander',
    repsol: 'Repsol', q8: 'Q8', 365: '365', clarel: 'Clarel', womensecret: "women'secret" },
};

// заведения из SITGES_VENUES: [{ cat, name, brand, terrace, contour, cuisine, x, z }]
function sitgesVenues() {
  if (typeof SITGES_VENUES === 'undefined') return [];
  const V = SITGES_VENUES, m = sitgesDec(V.m), [P] = sitgesPts(V.p, [V.n]), out = [];
  for (let i = 0, k = 0; i < m.length; i += 5, k++) out.push({ cat: V.cats[m[i]], name: m[i + 1] ? V.names[m[i + 1] - 1] : '',
    brand: m[i + 2] ? V.brands[m[i + 2] - 1] : null, terrace: !!(m[i + 3] & 1), contour: !!(m[i + 3] & 2),
    cuisine: m[i + 4] ? V.cuisines[m[i + 4] - 1] : '', x: P[k][0], z: P[k][1] });
  return out;
}

function sitgesPlanSigns(C) {
  const { houses, balconies, coast, carriageAt, ground } = C, S = SITGES_SIGNS, W = SITGES_WALL, F = SITGES_FLOOR, A = SITGES_FAC;
  const venues = sitgesVenues(), signs = [];
  // маркиза (на набережной и в старом городе) и флажок — у каких видов
  const AWN = new Set(['restaurant', 'cafe', 'icecream']), BLADE = new Set(['bar', 'club', 'bank']);
  const st = { venues: venues.length, placed: 0, generic: 0, byForm: {}, byCat: {}, skip: { far: 0, tight: 0, busy: 0, lm: 0, noWall: 0 }, miss: [] };
  const miss = (v, why) => { st.skip[why]++; st.miss.push([why, v.cat, v.name || v.brand, Math.round(v.x), Math.round(v.z)]); };
  const f32 = Math.fround;
  // хеш как в шейдере фасада (fHash, js/maps/sitges/facade.js) — в float32
  const fHash = n => { n = f32(n * f32(0.1031)); n = f32(n - Math.floor(n)); n = f32(n * f32(n + f32(33.33))); n = f32(n * f32(n + n)); return n - Math.floor(n); };
  // хеш места (для типовых): целые дециметры → [0, 1)
  const hash2 = (x, z, s) => { let h = (Math.round(x * 10) * 73856093) ^ (Math.round(z * 10) * 19349663) ^ (s * 83492791); h = Math.imul(h ^ (h >>> 13), 0x5bd1e995); h ^= h >>> 15; return (h >>> 0) / 4294967296; };

  /* ---------- куски фасада к улице ---------- */
  // тротуары по клеткам: перед открытой стеной (вид yard) широкий тротуар или променад — тоже фасад к улице
  // (houses.js считает улицей только мостовую в 0,6–1,8 м от стены: на набережной Ribera фасады — «двор»)
  const wcell = sitgesCells(16);
  for (const q of C.walks) { const r = [q.I0, q.I1, q.O1, q.O0], b = sitgesBBox(r); wcell.add(b[0], b[1], b[2], b[3], r); }
  const onWalk = (x, z) => wcell.at(x, z).some(r => sitgesInPoly(x, z, r));
  const openFront = (w, x, z) => {
    for (const d of S.front) {
      const px = x + w.nx * d, pz = z + w.nz * d, h = C.houseAt(px, pz);
      if (h) return false;
      if (carriageAt(px, pz) || onWalk(px, pz)) return true;
    }
    return false;
  };
  const pieces = [], pcell = sitgesCells(16);
  houses.forEach((h, hi) => {
    for (const w of h.walls) {
      const L = Math.hypot(w.bx - w.ax, w.bz - w.az);
      if (L < S.minL) continue;
      if (w.kind !== W.street && w.kind !== W.shops) {
        // открытая стена до земли, перед серединой и четвертями — тротуар или мостовая, без домов между
        if (w.kind !== W.yard || h.lm || w.lo > Math.min(w.ga, w.gb) + 0.5) continue;
        if (![0.25, 0.5, 0.75].every(f => openFront(w, w.ax + (w.bx - w.ax) * f, w.az + (w.bz - w.az) * f))) continue;
      }
      const p = { h, hi, w, L, ux: (w.bx - w.ax) / L, uz: (w.bz - w.az) / L, used: [] };
      pieces.push(p);
      pcell.add(Math.min(w.ax, w.bx), Math.max(w.ax, w.bx), Math.min(w.az, w.bz), Math.max(w.az, w.bz), p);
    }
  });
  // куски ближе R по возрастанию расстояния: [{ p, t, d }] (t — проекция точки, м от начала куска)
  const nearPieces = (x, z, R, ok = () => true) => {
    const seen = new Set(), out = [];
    pcell.each(x - R, x + R, z - R, z + R, list => {
      for (const p of list) {
        if (seen.has(p) || !ok(p)) continue;
        seen.add(p);
        const d = sitgesSeg(x, z, p.w.ax, p.w.az, p.w.bx, p.w.bz);
        if (d < R) out.push({ p, t: SITGES_SEG.t * p.L, d });
      }
    });
    return out.sort((a, b) => a.d - b.d);
  };
  const nearestPiece = (x, z, R, ok) => nearPieces(x, z, R, ok)[0] || null;
  // плиты балконов по клеткам
  const bcell = sitgesCells(16);
  for (const b of balconies) bcell.add(Math.min(b.ax, b.bx) - 1, Math.max(b.ax, b.bx) + 1, Math.min(b.az, b.bz) - 1, Math.max(b.az, b.bz) + 1, b);
  // берег по клеткам (набережная)
  const ccell = sitgesCells(64);
  for (const l of coast) for (let i = 1; i < l.length; i++) { const a = l[i - 1], b = l[i]; ccell.add(Math.min(a[0], b[0]), Math.max(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[1], b[1]), [a, b]); }
  const coastD = (x, z, R) => {
    let d = R;
    ccell.each(x - R, x + R, z - R, z + R, list => { for (const [a, b] of list) d = Math.min(d, sitgesSeg(x, z, a[0], a[1], b[0], b[1])); });
    return d;
  };
  const oldTown = (x, z) => SITGES_OLDTOWN.some(([cx, cz, r]) => (x - cx) ** 2 + (z - cz) ** 2 < r * r);
  // набережная: фасад смотрит к морю (−z) и берег перед ним ближе seaR
  const seaFront = p => p.w.nz < -0.5 && coastD((p.w.ax + p.w.bx) / 2, (p.w.az + p.w.bz) / 2, S.seaR) < S.seaR;

  // точка куска на расстоянии t от начала; земля перед стеной на отрезке [t0, t1] — самая высокая (рельеф с улицами,
  // не по концам куска: у длинной стены на склоне линейная земля врёт на метр)
  const at = (p, t) => [p.w.ax + p.ux * t, p.w.az + p.uz * t];
  const gMax = (p, t0, t1) => {
    let g = -Infinity;
    for (let k = 0; k <= 4; k++) { const [x, z] = at(p, t0 + (t1 - t0) * k / 4); g = Math.max(g, ground(x + p.w.nx * 0.5, z + p.w.nz * 0.5), ground(x + p.w.nx * 1.5, z + p.w.nz * 1.5)); }
    return g;
  };
  // ось первого этажа на расстоянии t: витрина, дверь или окно (как шейдер: kind shops — всё витрины)
  const axisKind = (p, t) => {
    if (p.w.kind === W.shops) return 'shop';
    const col = Math.floor(p.w.ua + (p.w.ub - p.w.ua) * t / p.L), hh = fHash(f32(f32(col * f32(1.37)) + f32(f32(p.h.base) * f32(0.71))));
    return hh < A.shopP ? 'shop' : hh < A.shopP + 0.25 ? 'door' : 'win';
  };
  // верх свободной полосы над витриной на отрезке [t0, t1]: пол второго этажа, низ плит балконов
  const ceilAt = (p, t0, t1, out) => {
    let top = Math.min(p.h.base + F.ground, p.w.hi) - S.floorGap;
    const [x0, z0] = at(p, t0), [x1, z1] = at(p, t1);
    bcell.each(Math.min(x0, x1), Math.max(x0, x1), Math.min(z0, z1), Math.max(z0, z1), list => {
      for (const b of list) {
        if (b.nx * p.w.nx + b.nz * p.w.nz < 0.9) continue;
        // плита у этой стены (по нормали ближе 0,3 м) и перекрывает отрезок вдоль
        if (Math.abs((b.ax - p.w.ax) * p.w.nx + (b.az - p.w.az) * p.w.nz) > 0.3) continue;
        const ta = (b.ax - p.w.ax) * p.ux + (b.az - p.w.az) * p.uz, tb = (b.bx - p.w.ax) * p.ux + (b.bz - p.w.az) * p.uz;
        if (Math.max(ta, tb) < t0 - out || Math.min(ta, tb) > t1 + out) continue;
        top = Math.min(top, b.y - b.t - S.floorGap);
      }
    });
    return top;
  };
  // свободное место на куске: центр tc ширины w → сдвинутый центр или null
  const fit = (p, tc, w) => {
    const lo = S.edge + w / 2, hi = p.L - S.edge - w / 2;
    if (hi < lo) return null;
    const cands = [clamp(tc, lo, hi)];
    for (const [a, b] of p.used) cands.push(a - S.sep - w / 2, b + S.sep + w / 2);
    let best = null;
    for (const c of cands) {
      if (c < lo - 1e-6 || c > hi + 1e-6) continue;
      if (p.used.some(([a, b]) => c + w / 2 + S.sep > a && c - w / 2 - S.sep < b)) continue;
      if (best === null || Math.abs(c - tc) < Math.abs(best - tc)) best = c;
    }
    return best;
  };
  const shortText = t => {
    if (t.length <= S.maxText) return t;
    const c = t.split(/ - | \| | \(|, /)[0].trim();
    return c.length >= 3 ? c : t;
  };
  const push = (o, generic) => {
    o.brand = o.brand || null;
    o.generic = generic;
    o.key = [o.form, o.cat, o.brand || '', o.text].join('|');
    signs.push(o);
    st.byForm[o.form] = (st.byForm[o.form] || 0) + 1;
    const k = (generic ? 'типовая ' : '') + o.cat;
    st.byCat[k] = (st.byCat[k] || 0) + 1;
  };
  const r2 = v => Math.round(v * 100) / 100;
  // лицо на стене: середина отрезка [tc − w/2, tc + w/2], y — середина, чуть перед стеной (off)
  const onWall = (p, tc, off, y, w, h, form, cat, text, brand) => {
    const [x, z] = at(p, tc);
    return { x: r2(x + p.w.nx * off), y: r2(y), z: r2(z + p.w.nz * off), nx: r2(p.w.nx), nz: r2(p.w.nz), w: r2(w), h: r2(h), form, cat, text, brand };
  };

  /* ---------- доска (маркиза) с флажком и крестом у куска p, около t ---------- */
  // form 'blade' — только флажок (бар в плотном ряду заведений, где доске места нет).
  // вернёт true, если поставлена, иначе причину: 'tight' (не влезает по высоте или длине) или 'busy' (место занято)
  const placeFront = (p, t, v, form, text, generic, extra) => {
    const big = v.cat === 'supermarket', only = form === 'blade';
    const town = !big && oldTown((p.w.ax + p.w.bx) / 2, (p.w.az + p.w.bz) / 2);
    const B = form === 'awning' ? S.awning : only ? S.blade : big ? S.wide : town ? S.town : S.board;
    const len = Math.min(text.length, S.maxText);
    let w = only ? 0 : form === 'awning' ? clamp(Math.max(len * S.board.ch + 1.2, p.L * 0.5), B.min, B.max) : clamp(len * B.ch + B.pad, B.min, B.max);
    w = Math.min(w, p.L - 2 * S.edge);
    if (!only && w < Math.min(B.min, 1.0)) return 'tight';
    if (only) extra = 'blade';
    // на стене street — центр на ось с витриной, если она в паре метров
    let tc = t;
    if (p.w.kind === W.street && axisKind(p, t) !== 'shop') {
      for (let k = 1; k <= 8; k++) {
        const a = t + k * 0.4, b = t - k * 0.4;
        if (a < p.L && axisKind(p, a) === 'shop') { tc = a; break; }
        if (b > 0 && axisKind(p, b) === 'shop') { tc = b; break; }
      }
    }
    // флажок и крест — сбоку от доски: место под них тоже
    const side = extra ? (extra === 'cross' ? S.cross.w : S.blade.w) + 0.3 : 0;
    const c = fit(p, tc, w + side);
    if (c === null) return 'busy';
    const t0 = c - (w + side) / 2, t1 = c + (w + side) / 2, tb = t0 + w / 2;
    const g = gMax(p, t0, t1);
    // верх витрины как в шейдере: shopY над землёй, но ниже пола второго этажа на 0,5 м; не ниже клиренса над тротуаром
    const shopTop = Math.min(g + A.shopY[1], p.h.base + F.ground - 0.5), low = Math.max(g + S.clear, p.w.lo + 0.3);
    let bottom = Math.max(shopTop + S.gap, low);
    const top = ceilAt(p, t0, t1, form === 'awning' ? S.awning.d : 0.8);
    // тесно (уклон, низкие плиты балконов) — вывеска заходит на верх витрины, не больше overlap
    if (top - bottom < B.h) bottom = Math.max(Math.min(bottom, top - B.h), shopTop - S.overlap, low);
    // полоса над витриной: не уже minH (у маркизы фестон ниже — он висит перед витриной)
    if (top - bottom < S.minH) return 'tight';
    const h = Math.min(B.h, top - bottom);
    p.used.push([t0, t1]);
    if (form === 'awning') {
      // крепление у стены — не выше top и не выше bottom + 0,8; фестон на drop ниже крепления
      const fh = S.awning.h, attach = Math.min(top, bottom + 0.8);
      push(onWall(p, tb, 0, attach - S.awning.drop - fh / 2, w, fh, 'awning', v.cat, text, v.brand), generic);
    } else if (!only) push(onWall(p, tb, 0.06, bottom + h / 2, w, h, 'board', v.cat, text, v.brand), generic);
    if (extra) {
      const E = extra === 'cross' ? S.cross : S.blade, tall = extra === 'blade' && v.cat === 'club';
      const ew = tall ? S.blade.tall[0] : E.w, eh0 = tall ? S.blade.tall[1] : E.h, eh = Math.min(eh0, top - bottom);
      if (eh >= S.minH) push(onWall(p, t0 + w + side / 2, 0, bottom + eh / 2, ew, eh, extra, v.cat, extra === 'cross' ? '' : text, v.brand), generic);
    }
    return true;
  };

  /* ---------- своё здание без фасада к улице: открытые стены во двор-площадь ---------- */
  // здание заведения: под точкой или в паре шагов от неё
  const bldOf = (x, z) => {
    let h = C.houseAt(x, z);
    for (let r = 3; !h && r <= S.bldR; r += 3) for (let k = 0; k < 8 && !h; k++) h = C.houseAt(x + r * Math.cos(k * Math.PI / 4), z + r * Math.sin(k * Math.PI / 4));
    return h && !h.lm ? h : null;
  };
  // стены здания bi до земли, перед которыми ни одного дома ближе open м: куски (как pieces, свои used), по зданию
  const openCache = new Map();
  const ownOpen = bi => {
    if (openCache.has(bi)) return openCache.get(bi);
    const out = [];
    houses.forEach((h, hi) => {
      if (h.bi !== bi || h.lm) return;
      for (const w of h.walls) {
        const L = Math.hypot(w.bx - w.ax, w.bz - w.az);
        if (L < S.minL || w.kind === W.blind || w.lo > Math.min(w.ga, w.gb) + 0.5) continue;
        const free = [0.25, 0.5, 0.75].every(f => [1, 3, S.open].every(d => !C.houseAt(w.ax + (w.bx - w.ax) * f + w.nx * d, w.az + (w.bz - w.az) * f + w.nz * d)));
        if (!free) continue;
        const p = pieces.find(q => q.w === w) || { h, hi, w, L, ux: (w.bx - w.ax) / L, uz: (w.bz - w.az) / L, used: [] };
        out.push(p);
      }
    });
    openCache.set(bi, out);
    return out;
  };
  const byDist = (list, x, z) => list.map(p => ({ p, d: sitgesSeg(x, z, p.w.ax, p.w.az, p.w.bx, p.w.bz), t: SITGES_SEG.t * p.L })).sort((a, b) => a.d - b.d);

  /* ---------- заведения OSM ---------- */
  const okPiece = p => !p.h.lm;
  const placed = [];
  for (const v of venues) {
    const text0 = v.brand && S.brandText[v.brand] ? (v.brand === 'carrefour' && /carrefour/i.test(v.name) ? v.name : S.brandText[v.brand]) : v.name;
    const text = shortText(text0 || '');
    if (v.cat === 'fuel') {
      // навес над точкой, кромка — к ближайшей улице; стела у края
      const q = nearestPiece(v.x, v.z, 40, okPiece), g = ground(v.x, v.z);
      const nx = q ? q.p.w.nx : 0, nz = q ? q.p.w.nz : -1;
      push({ x: r2(v.x), y: r2(g + S.canopy.y), z: r2(v.z), nx: r2(nx), nz: r2(nz), w: S.canopy.w, h: S.canopy.h, form: 'canopy', cat: 'fuel', text, brand: v.brand }, false);
      const tx = v.x + nx * (S.canopy.w / 2 + 2) - nz * 4, tz = v.z + nz * (S.canopy.w / 2 + 2) + nx * 4;
      push({ x: r2(tx), y: r2(ground(tx, tz) + S.totem.foot + S.totem.h / 2), z: r2(tz), nx: r2(nx), nz: r2(nz), w: S.totem.w, h: S.totem.h, form: 'totem', cat: 'fuel', text, brand: v.brand }, false);
      placed.push(v); st.placed++;
      continue;
    }
    const inLm = C.houseAt && C.houseAt(v.x, v.z);
    if (inLm && inLm.lm) { miss(v, 'lm'); continue; }
    if (v.cat === 'hotel') { const r = placeHotel(v, text); if (r === true) { placed.push(v); st.placed++; } else miss(v, r); continue; }
    // точка внутри дома (большой магазин, точка посреди контура) — фасад того же здания до inR м, иначе ближайший до snap
    const own = inLm ? nearPieces(v.x, v.z, S.inR, p => p.h.bi === inLm.bi && okPiece(p)) : [];
    let cand = (own.length ? own : nearPieces(v.x, v.z, S.snap, okPiece)).slice(0, S.tries);
    // нет фасада к улице рядом — открытые стены своего здания (магазин во дворе-площади, на парковке)
    const bh = cand.length ? null : bldOf(v.x, v.z);
    if (bh) cand = byDist(ownOpen(bh.bi), v.x, v.z).slice(0, S.tries);
    if (!cand.length) { miss(v, 'far'); continue; }
    let ok = 'far', q = null;
    for (q of cand) {
      const p = q.p, mx = (p.w.ax + p.w.bx) / 2, mz = (p.w.az + p.w.bz) / 2;
      const touristy = oldTown(mx, mz) || seaFront(p);
      let form = 'board', extra = null, txt = text;
      if (AWN.has(v.cat) && touristy) form = 'awning';
      if (BLADE.has(v.cat)) extra = 'blade';
      if (v.cat === 'pharmacy') { txt = 'Farmàcia'; extra = 'cross'; }
      ok = placeFront(p, q.t, v, form, txt, false, extra);
      // маркиза не влезла — доска; не влезло — следующий кусок
      if (ok !== true && form === 'awning') ok = placeFront(p, q.t, v, 'board', txt, false, extra);
      if (ok === true) break;
    }
    // бар, клуб, банк: доске места нет — только флажок
    if (ok !== true && BLADE.has(v.cat)) for (q of cand) if ((ok = placeFront(q.p, q.t, v, 'blade', text, false)) === true) break;
    if (ok !== true) { miss(v, ok); continue; }
    const p = q.p;
    if (v.cat === 'supermarket' && !p.h.attached && !p.h.shared) placeTotem(p, q.t, v, text);
    placed.push(v); st.placed++;
  }

  /* ---------- отель: буквы ---------- */
  function placeHotel(v, text) {
    // здание: под точкой или с ближайшим куском фасада ≤ 25 м
    const h0 = bldOf(v.x, v.z), q0 = h0 ? null : nearestPiece(v.x, v.z, 25, okPiece);
    const bi = h0 ? h0.bi : q0 && q0.p.h.bi;
    if (bi === undefined || bi === null) return 'far';
    // кусок: к морю (на набережной) лучше, иначе к самой широкой улице; длинный лучше; нет фасада к улице —
    // открытые стены здания (отель во втором ряду: буквы над крышей видны издали)
    let best = null, bs = -Infinity;
    const mine = pieces.filter(p => p.h.bi === bi);
    for (const p of mine.some(p => p.L >= 4 && Math.abs(p.w.hi - p.h.y1) <= 0.6) ? mine : ownOpen(bi)) {
      if (p.h.bi !== bi || p.h.lm || p.L < 4 || Math.abs(p.w.hi - p.h.y1) > 0.6) continue;
      const mx = (p.w.ax + p.w.bx) / 2, mz = (p.w.az + p.w.bz) / 2;
      const c = carriageAt(mx + p.w.nx * 6, mz + p.w.nz * 6, null, 4), wide = c ? 2 * c.st.v[c.i].hw : 0;
      const s = (seaFront(p) ? 100 : 0) + wide * 3 + Math.min(p.L, 30) + p.h.y1 * 0.2;
      if (s > bs) { bs = s; best = p; }
    }
    if (!best) return 'noWall';
    const p = best, h = p.h, L = S.letters, low = L.low[text];
    if (low) {
      // над входом: по низу второго этажа, перед стеной (первый этаж закрыт изгородью сада)
      const w = Math.min(text.length * low * L.ch, p.L - 2 * S.edge);
      push(onWall(p, p.L / 2, 0.1, h.base + F.ground + 0.15 + low / 2, w, low, 'letters', 'hotel', text, v.brand), false);
      return true;
    }
    const flat = h.roof.kind === 'flat', fl = h.p.floors;
    const lh = flat ? clamp(0.45 + 0.17 * fl, L.roof[0], L.roof[1]) : L.eave;
    const w = Math.min(text.length * lh * L.ch, p.L - 2 * S.edge);
    if (w < 1.5) return 'tight';
    const tc = p.L / 2;
    // над плоской крышей — на краю (чуть внутрь), под скатной — на фасаде под карнизом
    const y = flat ? h.y1 + L.lift + lh / 2 : p.w.hi - 0.35 - lh / 2;
    push(onWall(p, tc, flat ? -L.inset : 0.08, y, w, lh, 'letters', 'hotel', text, v.brand), false);
    return true;
  }

  /* ---------- стела супермаркета у улицы ---------- */
  function placeTotem(p, t, v, text) {
    // от стены по нормали до проезжей части; стела — back м до бордюра, сбоку от доски
    const T = S.totem, tc = clamp(t + T.side * (t < p.L / 2 ? -1 : 1), 0, p.L), [x0, z0] = at(p, tc);
    let d = 0;
    for (let s = 1; s <= 40; s += 0.5) if (carriageAt(x0 + p.w.nx * s, z0 + p.w.nz * s)) { d = s; break; }
    if (!d) return;
    const dd = Math.max(1.5, d - T.back), x = x0 + p.w.nx * dd, z = z0 + p.w.nz * dd;
    push({ x: r2(x), y: r2(ground(x, z) + T.foot + T.h / 2), z: r2(z), nx: r2(p.w.nx), nz: r2(p.w.nz), w: T.w, h: T.h, form: 'totem', cat: 'supermarket', text, brand: v.brand }, false);
  }

  /* ---------- вывески строений ---------- */
  st.lm = 0;
  for (const E of S.lm) {
    let parts = houses.filter(h => h.lm === E.id && h.p.floors >= (E.floors || 0));
    if (E.top) { const t = Math.max(...parts.map(h => h.y1)); parts = parts.filter(h => h.y1 > t - 0.5); }
    const w = E.text.length * E.h * E.ch;
    let best = null, bs = -Infinity;
    for (const h of parts) for (const wl of h.walls) {
      const L = Math.hypot(wl.bx - wl.ax, wl.bz - wl.az), mx = (wl.ax + wl.bx) / 2, mz = (wl.az + wl.bz) / 2;
      // перед стеной дом — не годится, кроме нижнего уступа того же строения (террасы Террамара)
      const y = E.top ? h.y1 - E.top : h.base + E.y, f = C.houseAt(mx + wl.nx * 2, mz + wl.nz * 2);
      if (L < w + 2 * S.edge || (f && !(f.lm === E.id && f.y1 < y - E.h))) continue;
      let sc = L;
      if (E.dir) sc += (wl.nx * E.dir[0] + wl.nz * E.dir[1]) * 100;
      if (E.street) { const c = carriageAt(mx + wl.nx * 6, mz + wl.nz * 6, null, 4); sc += c ? 2 * c.st.v[c.i].hw * 3 : 0; }
      if (sc > bs) { bs = sc; best = { h, w: wl, L, ux: (wl.bx - wl.ax) / L, uz: (wl.bz - wl.az) / L, used: [], y }; }
    }
    if (!best) { st.miss.push(['lm', E.id, E.text]); continue; }
    push(onWall(best, clamp(best.L * (E.at ?? 0.5), w / 2 + S.edge, best.L - w / 2 - S.edge), E.out, best.y, w, E.h, E.form, E.cat, E.text, E.brand), false);
    st.lm++;
  }

  /* ---------- типовые: куски вида shops без заведения рядом ---------- */
  const scell = sitgesCells(32);
  for (const s of signs) scell.add(s.x - S.near, s.x + S.near, s.z - S.near, s.z + S.near, s);
  const G = S.generic, pick = (list, u) => {
    const tot = list.reduce((a, e) => a + e[2], 0);
    let acc = 0;
    for (const e of list) { acc += e[2] / tot; if (u < acc) return e; }
    return list[list.length - 1];
  };
  for (const p of pieces) {
    if (p.w.kind !== W.shops || p.h.lm) continue;
    const n = Math.max(1, Math.round(p.L / S.slot));
    for (let k = 0; k < n; k++) {
      const tc = (k + 0.5) * p.L / n, [x, z] = at(p, tc);
      if (hash2(x, z, 1) > G.p) continue;
      if (scell.at(x, z).some(s => (s.x - x) ** 2 + (s.z - z) ** 2 < S.near * S.near)) continue;
      const sea = seaFront(p), town = oldTown(x, z);
      const [text, cat] = pick(sea ? G.sea : town ? G.town : G.town2, hash2(x, z, 2));
      const form = AWN.has(cat) && (sea || town) && hash2(x, z, 3) < 0.6 ? 'awning' : 'board';
      const extra = cat === 'bar' && hash2(x, z, 4) < 0.5 ? 'blade' : null;
      const n0 = signs.length;
      if (placeFront(p, tc, { cat, brand: null }, form, text, true, extra) === true || (form === 'awning' && placeFront(p, tc, { cat, brand: null }, 'board', text, true, extra) === true)) {
        st.generic++;
        for (let i = n0; i < signs.length; i++) scell.add(signs[i].x - S.near, signs[i].x + S.near, signs[i].z - S.near, signs[i].z + S.near, signs[i]);
      }
    }
  }
  st.signs = signs.length;
  Object.assign(C, { signs, signStats: st });
}
