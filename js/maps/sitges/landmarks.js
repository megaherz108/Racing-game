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
// Определяет: SITGES_LM, sitgesPlanLandmarks.
// Использует: sitgesBBox (js/maps/sitges/geom.js); SITGES_LM_CHURCH (js/maps/sitges/lm/church.js); SITGES_LM_TOWNHALL
//   (js/maps/sitges/lm/townhall.js); SITGES_LM_MERCATVELL (js/maps/sitges/lm/mercatvell.js); SITGES_LM_MARICEL
//   (js/maps/sitges/lm/maricel.js); SITGES_LM_CAUFERRAT (js/maps/sitges/lm/cauferrat.js); SITGES_LM_MIRAMAR
//   (js/maps/sitges/lm/miramar.js); SITGES_LM_MARKET (js/maps/sitges/lm/market.js); SITGES_LM_STATION
//   (js/maps/sitges/lm/station.js); SITGES_LM_PRADO (js/maps/sitges/lm/prado.js); SITGES_LM_RETIRO
//   (js/maps/sitges/lm/retiro.js); SITGES_LM_TERRAMAR (js/maps/sitges/lm/terramar.js); SITGES_LM_VINYET
//   (js/maps/sitges/lm/vinyet.js); SITGES_LM_CLOT (js/maps/sitges/lm/clot.js); SITGES_LM_SEBASTIA
//   (js/maps/sitges/lm/sebastia.js); SITGES_LM_MARINA (js/maps/sitges/lm/marina.js); $ (js/ui.js).
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
