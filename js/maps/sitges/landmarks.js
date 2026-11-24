// Ситжес — РАСКЛАДКА: достопримечательности (этапы 5–6, docs/sitges/stage-5.md). После домов (houses.js), до стилей
// фасадов (styles.js): балконы и карнизы на зданиях строений не ставятся.
//   SITGES_LM — список строений: id, icon (значок на мини-карте — эмодзи, data.mmMarks → drawMarks в js/ui.js),
//   здания кадастра (bld — регулярное выражение по названию здания из OSM / кадастра,
//   at — точки [x, z] внутри зданий; можно оба), объект строения из js/maps/sitges/lm/<файл>.js:
//     { ready, plan(C, L), build(K, L, group) } — ready: false — заготовка, дом кадастра остаётся как был.
//   У готового строения части его зданий помечаются h.lm = id: их не строят buildings.js (стены, крыша, коллайдер)
//   и styles.js (балконы, карнизы) — модель и столкновения даёт build() (js/maps/sitges/landmarks3d.js).
//   Соседи считают общие стены по частям кадастра как раньше: модель должна закрывать контур части кадастра хотя бы
//   до её высоты у общей стены (иначе в соседе дыра).
// C.landmarks — [{ id, def, bis, parts, rings, bb: [x0, x1, z0, z1], cx, cz, g, top, ready }]: parts — части C.houses
//   (rings, y0 — низ стен, y1 — верх стен, top — верх крыши, base — уровень первого этажа, p.floors, b — здание),
//   rings — внешние контуры частей, g — земля в центре рамки, top — самый высокий верх кадастра.
//   plan(C, L) — своя раскладка строения (площадь, лестницы, точки), результат класть в L.
//   fences(C, L) — заборы и проёмы своих участков: sitgesLandmarkFences(C) после калиток (sitgesPlanGates), до деревьев
//   и мелочей улиц (они обходят проёмы). Помощники (C.fences — fences.js, C.gates — gates.js):
//     lmFenceAt(C, x, z) → индекс куска C.fences, ближайшего к точке (−1 — нет ближе 6 м);
//     lmFencePoint(f, s) → { x, z, n, len } — точка куска на расстоянии s м от начала, n — нормаль к участку, len — длина;
//     lmFenceSplit(C, fi, s) → индекс нового куска — хвоста от излома, ближайшего к s (−1 — нельзя); проёмы хвоста
//       переносятся, на месте разреза — разрез по участкам (cut);
//     lmGateSet(C, gi, { s, w, leaf }) — сдвинуть проём вдоль своего куска, сменить ширину и створку (x, z, n — заново).
// Определяет: SITGES_LM, sitgesPlanLandmarks, sitgesLandmarkFences, lmFenceAt, lmFencePoint, lmFenceSplit, lmGateSet.
// Использует: sitgesBBox (js/maps/sitges/geom.js); SITGES_LM_CHURCH (js/maps/sitges/lm/church.js); SITGES_LM_TOWNHALL
//   (js/maps/sitges/lm/townhall.js); SITGES_LM_MERCATVELL (js/maps/sitges/lm/mercatvell.js); SITGES_LM_MARICEL
//   (js/maps/sitges/lm/maricel.js); SITGES_LM_CAUFERRAT (js/maps/sitges/lm/cauferrat.js); SITGES_LM_MIRAMAR
//   (js/maps/sitges/lm/miramar.js); SITGES_LM_MARKET (js/maps/sitges/lm/market.js); SITGES_LM_STATION
//   (js/maps/sitges/lm/station.js); SITGES_LM_PRADO (js/maps/sitges/lm/prado.js); SITGES_LM_RETIRO
//   (js/maps/sitges/lm/retiro.js); SITGES_LM_TERRAMAR (js/maps/sitges/lm/terramar.js); SITGES_LM_VINYET
//   (js/maps/sitges/lm/vinyet.js); SITGES_LM_CLOT (js/maps/sitges/lm/clot.js); SITGES_LM_SEBASTIA
//   (js/maps/sitges/lm/sebastia.js); SITGES_LM_MARINA (js/maps/sitges/lm/marina.js); SITGES_LM_CANROBERT
//   (js/maps/sitges/lm/canrobert.js); SITGES_LM_BENAPRES (js/maps/sitges/lm/benapres.js); SITGES_LM_EM30
//   (js/maps/sitges/lm/em30.js); $ (js/ui.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

// Названия — как в кадастре / OSM (C.blds[i].name); точки — координаты игры внутри здания
const SITGES_LM = [
  // этап 5 — мыс и старый город
  { id: 'church', icon: '⛪', name: 'Sant Bartomeu i Santa Tecla', bld: /^Sant Bartomeu i Santa Tecla$/, def: SITGES_LM_CHURCH },
  { id: 'townhall', icon: '🏛️', name: 'Ajuntament de Sitges', bld: /^Ajuntament de Sitges$/, def: SITGES_LM_TOWNHALL },
  { id: 'mercatvell', icon: '🧺', name: 'Mercat Vell', bld: /^Mercat Vell$/, def: SITGES_LM_MERCATVELL },
  { id: 'maricel', icon: '🏰', name: 'Palau de Maricel', bld: /^Palau de Maricel$/, def: SITGES_LM_MARICEL },
  { id: 'cauferrat', icon: '🎨', name: 'Museu del Cau Ferrat', bld: /^Museu del Cau Ferrat$/, def: SITGES_LM_CAUFERRAT },
  { id: 'miramar', icon: '🖼️', name: 'Edifici Miramar', bld: /^Edifici Miramar$/, def: SITGES_LM_MIRAMAR },
  // этап 6 — центр и окраины
  { id: 'market', icon: '🛒', name: 'Mercat Municipal de Sitges', bld: /^Mercat Municipal de Sitges$/, def: SITGES_LM_MARKET },
  { id: 'station', icon: '🚉', name: 'Estació de Sitges', bld: /^Estació de Sitges$/, def: SITGES_LM_STATION },
  { id: 'prado', icon: '🎭', name: 'Casino Prado', bld: /^Casino Prado$/, def: SITGES_LM_PRADO },
  { id: 'retiro', icon: '🎬', name: 'El Retiro', bld: /^el Retiro$/, def: SITGES_LM_RETIRO },
  { id: 'terramar', icon: '🏨', name: 'Hotel Terramar', bld: /^Hotel Terramar$/, def: SITGES_LM_TERRAMAR },
  { id: 'vinyet', icon: '🔔', name: 'Santuari del Vinyet', bld: /^Santuari Nostra Senyora del Vinyet$/, def: SITGES_LM_VINYET },
  { id: 'clot', icon: '🗼', name: 'Torre del Clot dels Frares', at: [[1752, 962]], def: SITGES_LM_CLOT },
  { id: 'sebastia', icon: '🕊️', name: 'Sant Sebastià', bld: /^Sant Sebastià$/, def: SITGES_LM_SEBASTIA },
  { id: 'marina', icon: '⚓', name: "Port d'Aiguadolç", at: [], def: SITGES_LM_MARINA },
  { id: 'canrobert', icon: '🌳', name: 'Parc de Can Robert', at: [], def: SITGES_LM_CANROBERT },
  { id: 'benapres', icon: '🗿', name: 'Monument al doctor Benaprés', at: [], def: SITGES_LM_BENAPRES },
  // дом, где жил создатель игры (2026-11-24): модель, балконы и заборы квартала по фото
  { id: 'em30', icon: '🏠', name: "C/ Enric Morera 30", at: [[892, -22]], def: SITGES_LM_EM30 },
];

function sitgesPlanLandmarks(C) {
  const { blds, houses, houseAt } = C, landmarks = [];
  for (const e of SITGES_LM) {
    const bis = new Set();
    if (e.bld) blds.forEach((b, bi) => { if (e.bld.test(b.name)) bis.add(bi); });
    for (const [x, z] of e.at || []) { const h = houseAt(x, z); if (h) bis.add(h.bi); }
    const parts = houses.filter(h => bis.has(h.bi)), rings = parts.map(h => h.rings[0]);
    const bb = rings.length ? rings.map(sitgesBBox).reduce((a, q) => [Math.min(a[0], q[0]), Math.max(a[1], q[1]), Math.min(a[2], q[2]), Math.max(a[3], q[3])])
      : (e.at && e.at.length ? [e.at[0][0], e.at[0][0], e.at[0][1], e.at[0][1]] : [0, 0, 0, 0]);
    const cx = (bb[0] + bb[1]) / 2, cz = (bb[2] + bb[3]) / 2;
    const def = e.def || { ready: false }, ready = !!def.ready;
    const L = { id: e.id, name: e.name, icon: e.icon, def, ready, bis: [...bis], parts, rings, bb, cx, cz,
      g: C.ground(cx, cz),
      top: parts.reduce((m, h) => Math.max(m, h.top), -Infinity) };
    if (ready) { for (const h of parts) h.lm = e.id; if (def.plan) def.plan(C, L); }
    landmarks.push(L);
  }
  Object.assign(C, { landmarks });
}

// заборы строений: после калиток, до деревьев (см. шапку)
function sitgesLandmarkFences(C) {
  for (const L of C.landmarks) if (L.ready && L.def.fences) L.def.fences(C, L);
}

/* ---------- помощники заборов строений ---------- */
function lmFenceAt(C, x, z) {
  let best = -1, bd = 6;
  C.fences.forEach((f, i) => {
    for (let k = 1; k < f.P.length; k++) {
      const [ax, az] = f.P[k - 1], [bx, bz] = f.P[k], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)), d = Math.hypot(ax + dx * t - x, az + dz * t - z);
      if (d < bd) { bd = d; best = i; }
    }
  });
  return best;
}
function lmFencePoint(f, s) {
  const S = [0];
  for (let k = 1; k < f.P.length; k++) S.push(S[k - 1] + Math.hypot(f.P[k][0] - f.P[k - 1][0], f.P[k][1] - f.P[k - 1][1]));
  let k = 0;
  while (k + 2 < f.P.length && S[k + 1] < s) k++;
  const t = Math.max(0, Math.min(1, (s - S[k]) / Math.max(1e-6, S[k + 1] - S[k]))), a = f.P[k], b = f.P[k + 1];
  const nx = f.N[k][0] + (f.N[k + 1][0] - f.N[k][0]) * t, nz = f.N[k][1] + (f.N[k + 1][1] - f.N[k][1]) * t, l = Math.hypot(nx, nz) || 1;
  return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, n: [nx / l, nz / l], len: S[S.length - 1] };
}
function lmFenceSplit(C, fi, s) {
  const f = C.fences[fi], S = [0];
  for (let k = 1; k < f.P.length; k++) S.push(S[k - 1] + Math.hypot(f.P[k][0] - f.P[k - 1][0], f.P[k][1] - f.P[k - 1][1]));
  let k = -1;
  for (let i = 1; i + 1 < f.P.length; i++) if (k < 0 || Math.abs(S[i] - s) < Math.abs(S[k] - s)) k = i;
  if (k < 0) return -1;
  const at = S[k], ti = C.fences.length;
  C.fences.push(Object.assign({}, f, { P: f.P.slice(k), N: f.N.slice(k), at: f.at.slice(k), cut: [true, f.cut[1]],
    s: Math.round((f.s + at) * 100) / 100, style: Object.assign({}, f.style) }));
  Object.assign(f, { P: f.P.slice(0, k + 1), N: f.N.slice(0, k + 1), at: f.at.slice(0, k + 1), cut: [f.cut[0], true] });
  for (const g of C.gates || []) if (g.f === fi && g.s > at) { g.f = ti; g.s -= at; }
  return ti;
}
function lmGateSet(C, gi, o) {
  const g = C.gates[gi];
  if (o.s != null) g.s = o.s;
  if (o.w != null) g.w = o.w;
  if (o.leaf) g.leaf = o.leaf;
  const p = lmFencePoint(C.fences[g.f], g.s);
  Object.assign(g, { x: p.x, z: p.z, n: p.n });
}
