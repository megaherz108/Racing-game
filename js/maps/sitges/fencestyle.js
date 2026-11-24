// Ситжес — РАСКЛАДКА: стиль забора у каждого участка (этап 4а.2). После заборов (js/maps/sitges/fences.js: C.fences
// с участком lot, C.fenceLots — главное здание участка) и стилей фасадов (styles.js: b.style).
//   Класс участка — по главному зданию: old (старый город), oldvilla (до 1940, отдельно стоящая), villa (1940–1999,
//   до 2 этажей), block (от 3 этажей), modern (с 2000); у пустого участка (стройплощадка) — по ближайшему дому.
//   Район — по x (вдоль берега): Террамар, Виньет, центр, восток, Айгуадольс. Доли видов верха и цоколя — по классу,
//   с поправками района (SITGES_FSTYLE; таблица и обоснование по ≈ 60 кадрам — docs/sitges/stage-4a.md, 4а.2).
//   Выбор — по хешу контура участка (координаты кольца, не R()): участок всегда того же стиля. Соседи по забору
//   (разрез cut) с главным зданием того же года и стиля фасада — один комплекс: стиль по меньшему хешу.
// f.style = { base, top, h0, h1, posts, color } у каждого забора C.fences: цоколь — white, cream (штукатурка), rubble
//   (бутовый камень), brick, tile (бежевая плитка), concrete; верх — heath (вереск), hedge (изгородь), slats (ламели),
//   mesh (сварная сетка), grille (кованая решётка, у блоков — перила), wall (глухая стена, h0 = h1 = 2–2,5 м), low
//   (низкая стенка без верха, h0 = h1 ≈ 1 м), lattice (решётка из блоков — только у строений, def.fences);
//   h0 — верх цоколя, h1 — верх забора над тротуаром, м; posts — столбы: none, plaster (в цвет цоколя), stone, brick;
//   color — цвет верха (у wall и low — цоколя), 0xRRGGBB.
// C.fenceLotCls — { [участок]: класс (по корню комплекса) } — для створок ворот (js/maps/sitges/gates.js).
// Сводка — C.fenceStyleStats: { top: { вид: км }, base: { вид: км }, cls: { класс: км }, zone: { район: км },
//   lots, clusters, joined }.
// Определяет: SITGES_FSTYLE, sitgesFenceHash, sitgesPlanFenceStyles.
// Использует: SITGES_STYLES, SITGES_OLDTOWN (js/maps/sitges/styles.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const SITGES_FSTYLE = {
  // районы по x (больше порога): +x — к Террамару, −x — к марине
  zones: [['terramar', 900], ['vinyet', 150], ['centre', -600], ['east', -1300], ['marina', -Infinity]],
  // доли верха по классу участка, %
  top: {
    old:      { wall: 70, low: 10, grille: 15, hedge: 5 },
    oldvilla: { heath: 25, hedge: 25, grille: 25, wall: 20, mesh: 5 },
    villa:    { heath: 35, hedge: 30, wall: 10, slats: 10, mesh: 7, grille: 5, low: 3 },
    block:    { hedge: 50, grille: 20, heath: 16, low: 7, wall: 7 },
    modern:   { slats: 40, mesh: 15, heath: 15, hedge: 15, wall: 10, grille: 5 },
  },
  // доли цоколя по классу, %
  base: {
    old:      { white: 80, rubble: 20 },
    oldvilla: { white: 45, rubble: 30, cream: 20, brick: 5 },
    villa:    { white: 58, rubble: 16, cream: 12, brick: 10, tile: 4 },
    block:    { white: 50, cream: 25, rubble: 17, tile: 5, brick: 3 },
    modern:   { white: 60, concrete: 12, tile: 10, cream: 10, rubble: 8 },
  },
  // поправки района (множители долей)
  zoneTop: {
    terramar: { heath: 1.4, hedge: 1.1, wall: 0.6 },
    vinyet:   { heath: 1.2, wall: 1.3 },
    centre:   { hedge: 1.2 },
    east:     { hedge: 1.4, heath: 0.6, grille: 1.3 },
    marina:   { slats: 1.8, low: 2, heath: 0.8, hedge: 0.7 },
  },
  zoneBase: {
    terramar: { brick: 2.5, cream: 1.5 },
    east:     { rubble: 1.5, cream: 1.3 },
    marina:   { tile: 2, rubble: 1.5 },
  },
  // высоты: h0 — верх цоколя, h1 — верх забора (у wall, low — одна высота), м; rail — перила у блоков: h1 = h0 + …
  h0: { heath: [0.5, 0.7, 0.9, 1.0], hedge: [0.4, 0.6, 0.8], slats: [0.4, 0.6, 0.9], mesh: [0.3, 0.5, 0.8], grille: [0.6, 0.8, 1.0] },
  h1: { heath: [1.8, 1.9, 2.0], hedge: [1.8, 2.0, 2.2, 2.5], slats: [1.8, 2.0], mesh: [1.6, 1.8, 2.0], grille: [1.8, 2.0, 2.2] },
  wall: [2.0, 2.2, 2.5], low: [0.6, 0.8, 1.0], rail: [0.7, 0.9],
  // цвета: цоколь (у wall и low — цвет забора); верх — [цвет, доля]
  baseColor: { white: 0xf0ede6, cream: 0xe6d8bc, rubble: 0xb5a993, brick: 0xb0623f, tile: 0xd2b48c, concrete: 0xb9b7b0 },
  color: {
    heath: [[0x7d6a4f, 40], [0x8c7656, 35], [0x6e604c, 25]],
    hedge: [[0x3d5c2c, 40], [0x4a6a34, 35], [0x34502a, 25]],
    slats: [[0xebebe6, 60], [0x3b3f42, 30], [0x7a4a30, 10]],
    slatsModern: [[0x3b3f42, 60], [0xebebe6, 40]],
    mesh: [[0x2e3a33, 45], [0x3a3c3c, 35], [0xe6e6e0, 20]],
    grille: [[0x26292a, 70], [0xe6e4de, 20], [0x2d4a3c, 10]],
  },
};

// хеш контура участка (координаты в дециметрах — как в данных): стабилен, пока не поменялся кадастр
function sitgesFenceHash(ring) {
  let h = 2166136261;
  for (const [x, z] of ring) { h = Math.imul(h ^ Math.round(x * 10), 16777619); h = Math.imul(h ^ Math.round(z * 10), 16777619); }
  return h >>> 0;
}

function sitgesPlanFenceStyles(C) {
  const { fences, fenceLots, parcels, blds, houses } = C, S = SITGES_FSTYLE;
  // этажность здания — по самой высокой части
  const floors = new Map();
  for (const h of houses) floors.set(h.bi, Math.max(floors.get(h.bi) || 0, h.p.floors));
  // класс, год и стиль главного здания участка
  const lotKey = {}, lotCls = {};
  for (const p in fenceLots) {
    const { bi, empty } = fenceLots[p], b = bi >= 0 ? blds[bi] : null;
    let cls = 'villa', key = '';
    if (b) {
      const name = SITGES_STYLES[b.style.id].name, f = floors.get(bi) || 1, y = b.year;
      const r = b.parts[0].rings[0], x = r.reduce((s, q) => s + q[0], 0) / r.length, z = r.reduce((s, q) => s + q[1], 0) / r.length;
      const old = SITGES_OLDTOWN.some(([cx, cz, rr]) => (x - cx) ** 2 + (z - cz) ** 2 < rr * rr);
      if (old && (name === 'old' || name === 'white')) cls = 'old';
      else if (y >= 2000) cls = 'modern';
      else if (f >= 3 || name === 'block60' || name === 'block80') cls = 'block';
      else if (y && y < 1940) cls = 'oldvilla';
      if (y && !empty) key = y + '|' + name;
    }
    lotCls[p] = cls; lotKey[p] = key;
  }
  // комплексы: соседи по разрезу забора с тем же годом и стилем — одно множество (корень — меньший хеш)
  const hash = {}, root = {};
  for (const p in fenceLots) { hash[p] = sitgesFenceHash(parcels[p].ring); root[p] = p; }
  const find = p => { while (root[p] !== p) p = root[p] = root[root[p]]; return p; };
  let joined = 0;
  for (let i = 0; i + 1 < fences.length; i++) {
    const a = fences[i], b = fences[i + 1];
    if (a.run !== b.run || !a.cut[1] || a.lot < 0 || b.lot < 0 || a.lot === b.lot) continue;
    if (!lotKey[a.lot] || lotKey[a.lot] !== lotKey[b.lot]) continue;
    const ra = find(String(a.lot)), rb = find(String(b.lot));
    if (ra === rb) continue;
    if (hash[ra] <= hash[rb]) root[rb] = ra; else root[ra] = rb;
    joined++;
  }

  // случайное число 0…1 по хешу и номеру броска (перемешивание murmur3)
  const rnd = (h, k) => {
    let x = (h + Math.imul(k + 1, 0x9e3779b9)) >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x85ebca6b); x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
    return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
  };
  const pick = (w, mul, r) => {
    let sum = 0;
    const ks = Object.keys(w).map(k => { const v = w[k] * ((mul && mul[k]) || 1); sum += v; return [k, v]; });
    let acc = 0;
    for (const [k, v] of ks) { acc += v / sum; if (r < acc) return k; }
    return ks[ks.length - 1][0];
  };
  const pickColor = (list, r) => { let sum = 0, acc = 0; for (const c of list) sum += c[1]; for (const c of list) { acc += c[1] / sum; if (r < acc) return c[0]; } return list[0][0]; };
  const of = (list, r) => list[Math.min(list.length - 1, Math.floor(r * list.length))];

  // стиль участка (по корню комплекса); район — по средней точке заборов участка
  const lotX = {};
  for (const f of fences) if (f.lot >= 0) { const o = lotX[f.lot] || (lotX[f.lot] = [0, 0]); o[0] += f.P[0][0] + f.P[f.P.length - 1][0]; o[1] += 2; }
  const zoneOf = x => S.zones.find(([, t]) => x > t)[0];
  const styleOf = {}, lotZone = {};
  for (const p in fenceLots) {
    const rp = find(p), h = hash[rp], cls = lotCls[rp], x = lotX[rp] ? lotX[rp][0] / lotX[rp][1] : 0, zone = zoneOf(x);
    lotZone[p] = zone;
    const top = pick(S.top[cls], S.zoneTop[zone], rnd(h, 0)), base = pick(S.base[cls], S.zoneBase[zone], rnd(h, 1));
    let h0, h1, color;
    if (top === 'wall' || top === 'low') { h0 = h1 = of(S[top], rnd(h, 2)); color = S.baseColor[base]; }
    else {
      h0 = of(S.h0[top], rnd(h, 2));
      h1 = top === 'grille' && cls === 'block' ? h0 + of(S.rail, rnd(h, 3)) : of(S.h1[top], rnd(h, 3));
      color = pickColor(top === 'slats' && cls === 'modern' ? S.color.slatsModern : S.color[top], rnd(h, 4));
    }
    // столбы: у камня и кирпича — свои; у решётки и сетки старых вилл — каменные; вереск, ламели, решётка, сетка —
    // через раз в цвет цоколя; изгородь и стены — без столбов
    let posts = 'none';
    if (base === 'rubble') posts = 'stone';
    else if (base === 'brick') posts = 'brick';
    else if ((top === 'grille' || top === 'mesh') && cls === 'oldvilla') posts = rnd(h, 5) < 0.6 ? 'stone' : 'plaster';
    else if (top === 'heath' || top === 'slats' || top === 'grille' || top === 'mesh') posts = rnd(h, 5) < 0.5 ? 'plaster' : 'none';
    styleOf[p] = { base, top, h0: Math.round(h0 * 100) / 100, h1: Math.round(h1 * 100) / 100, posts, color };
  }
  const st = { top: {}, base: {}, cls: {}, zone: {}, lots: Object.keys(fenceLots).length, clusters: 0, joined };
  for (const p in fenceLots) if (find(p) === p) st.clusters++;
  const add = (o, k, v) => { o[k] = (o[k] || 0) + v; };
  for (const f of fences) {
    f.style = styleOf[f.lot] || { base: 'white', top: 'grille', h0: 1, h1: 2, posts: 'none', color: S.color.grille[0][0] };
    let L = 0;
    for (let k = 0; k + 1 < f.P.length; k++) L += Math.hypot(f.P[k + 1][0] - f.P[k][0], f.P[k + 1][1] - f.P[k][1]);
    add(st.top, f.style.top, L); add(st.base, f.style.base, L);
    if (f.lot >= 0) { add(st.cls, lotCls[find(String(f.lot))], L); add(st.zone, lotZone[f.lot], L); }
  }
  for (const g of [st.top, st.base, st.cls, st.zone]) for (const k in g) g[k] = Math.round(g[k]) / 1000;
  const fenceLotCls = {};
  for (const p in fenceLots) fenceLotCls[p] = lotCls[find(p)];
  Object.assign(C, { fenceStyleStats: st, fenceLotCls });
}
