// Карта «Ситжес» — сырые данные (tools/sitges/raw/) → готовые к игре js/maps/sitges/data-*.js.
//   node tools/sitges/build.js
// Сначала скачать: node tools/sitges/download.js. Печатает только сводку (числа объектов, вершин, размеры, ориентиры).
//
// Порядок:
//   1. перевод в метры: UTM 31N → локальные координаты (поворот на ROT, начало — центр карты; js tools/sitges/geo.js);
//   2. границы (решение плана): запад — край гольфа Террамар, восток — мол марины Айгуадольс (+ запас), юг — море,
//      север — ж/д + 400 м, притянутые к ближайшей улице (граница идёт по улицам);
//   3. здания кадастра (части с этажностью) внутри границы, упрощение контуров, тип и название из OSM;
//   4. улицы, ж/д, берег и море, площадные объекты, ориентиры из OSM;
//   5. рельеф ICGC на сетке 10 м в локальных координатах (с запасом за границей — фон);
//   5а. участки кадастра (INSPIRE CP) у игровой области: внешние контуры, упрощённые — линия заборов;
//   5б. адреса кадастра (INSPIRE AD) к зданиям по кадастровому номеру — подписи над домами (отладка);
//   5в. крыши частей по плиткам ICGC (тип — лидар, цвет — ортофото; tools/sitges/read-roofs.js), точки OSM;
//   5г. калитки и ворота: входы кадастра, окна съездов по ортофото, служебные проезды (tools/sitges/read-gates.js);
//   6. запись data-geo.js (границы, ориентиры), data-osm.js, data-buildings.js, data-terrain.js, data-parcels.js,
//      data-addr.js, data-roofs.js, data-points.js, data-gates.js.
const fs = require('fs');
const path = require('path');
const G = require('./geo');
const U = require('./util');
const { readOSM, ROAD_CLASSES, SURFACES, AREA_KINDS, LINE_KINDS } = require('./read-osm');
const { readCatastro, readParcels, readAddresses, USES } = require('./read-catastro');
const { readDTM } = require('./read-dtm');
const { readRoofs, ROOF_TYPES, ROOF } = require('./read-roofs');
const { readGates, GATE } = require('./read-gates');

const CFG = {
  north: 400,        // граница на севере: ж/д + 400 м…
  snapWin: 150,      // …притянутая к улице не дальше ±150 м от этой линии
  keepWin: 90,       // продолжать ту же улицу, пока она не дальше 90 м от линии
  step: 10,          // шаг выборки границы вдоль x, м
  marinaPad: 25,     // запас за восточным краем марины
  seaPad: 150,       // море за самой южной точкой берега и молов
  dataPad: 200,      // площадные объекты и берег — с запасом за границей (фон)
  dtmPad: 500, dtmStep: 10, dtmQ: 0.2,   // рельеф: запас, шаг сетки, квант высоты, м
  minPartArea: 4,    // части зданий меньше (м²) — выбросить
  parcelPad: 40,     // участки — с вершиной не дальше стольких метров от игровой области
  parcelSimp: { minD: 0.6, tol: 0.3, angDeg: 10 },   // упрощение контура участка
};
const STREET_MAX = ROAD_CLASSES.indexOf('living_street');   // по каким улицам может идти граница (без автострад)

/* =====================================================================
   1–2. ГРАНИЦЫ
   ===================================================================== */
const osm = readOSM();
const loc = p => G.toLocal(p[0], p[1]);
// точки пересечения ломаных с вертикалью x = const (их z)
function crossZ(lines, x) {
  const out = [];
  for (const pts of lines) for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (a[0] === b[0] || (a[0] - x) * (b[0] - x) > 0) continue;
    out.push(a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]));
  }
  return out;
}
function layout() {
  const golf = osm.areas.filter(a => a.kind === 'golf').flatMap(a => a.ring.map(loc));
  const marina = osm.areas.filter(a => a.kind === 'marina').flatMap(a => a.ring.map(loc));
  // гольф — на +x (юго-запад): граница по его ближнему к городу краю
  const xMax = Math.min(...golf.map(p => p[0]));
  const xMin = Math.min(...marina.map(p => p[0])) - CFG.marinaPad;
  const xs = []; for (let x = xMin; x < xMax + CFG.step; x += CFG.step) xs.push(Math.min(x, xMax));
  // ж/д: самая «северная» колея основной линии на каждой вертикали; пропуски — по соседям
  const rails = osm.rails.filter(r => !r.service).map(r => r.pts.map(loc));
  const rz = xs.map(x => { const c = crossZ(rails, x); return c.length ? Math.max(...c) : NaN; });
  for (let k = 0; k < rz.length; k++) if (Number.isNaN(rz[k])) {
    let a = k; while (a >= 0 && Number.isNaN(rz[a])) a--;
    let b = k; while (b < rz.length && Number.isNaN(rz[b])) b++;
    rz[k] = a < 0 ? rz[b] : b >= rz.length ? rz[a] : rz[a] + (rz[b] - rz[a]) * (k - a) / (b - a);
  }
  // притяжка к улицам: на каждой вертикали — пересечение с улицей, ближайшее к линии ж/д + 400;
  // пока прежняя улица рядом (±12 м) и не ушла от линии дальше keepWin — идём по ней
  const streets = osm.roads.filter(r => ROAD_CLASSES.indexOf(r.cls) <= STREET_MAX && r.cls !== 'motorway' && !r.tunnel).map(r => r.pts.map(loc));
  let prev = null, snapped = 0;
  const bz = xs.map((x, k) => {
    const T = rz[k] + CFG.north, c = crossZ(streets, x).filter(z => Math.abs(z - T) <= CFG.snapWin);
    if (!c.length) { prev = null; return T; }
    let pick = null;
    if (prev !== null) {
      const near = c.filter(z => Math.abs(z - prev) < 12 && Math.abs(z - T) <= CFG.keepWin);
      if (near.length) pick = near.reduce((a, b) => (Math.abs(a - prev) < Math.abs(b - prev) ? a : b));
    }
    if (pick === null) pick = c.reduce((a, b) => (Math.abs(a - T) < Math.abs(b - T) ? a : b));
    snapped++; prev = pick; return pick;
  });
  const coastZ = osm.coast.flatMap(l => l.map(loc)).filter(p => p[0] >= xMin && p[0] <= xMax).map(p => p[1]);
  const zMin = Math.min(...coastZ, ...marina.map(p => p[1])) - CFG.seaPad, zMax = Math.max(...bz);
  return { xMin, xMax, zMin, zMax, xs, rz, bz, snapped };
}
// первый проход — с временным началом (41.233° с. ш., 1.806° в. д.), чтобы найти центр; второй — в итоговых координатах
G.setOrigin(...G.utm(41.233, 1.806));
{
  const L0 = layout(), cx = (L0.xMin + L0.xMax) / 2, cz = (L0.zMin + L0.zMax) / 2;
  G.setOrigin(...G.toUTM(cx, cz).map(Math.round));
}
const LY = layout();
const { xMin, xMax, zMin, zMax, xs, bz } = LY;
const boundZ = x => {
  const f = Math.max(0, Math.min(xs.length - 1, (x - xs[0]) / CFG.step)), k = Math.min(xs.length - 2, Math.floor(f));
  return bz[k] + (bz[k + 1] - bz[k]) * (f - k);
};
const inside = (x, z, m = 0) => x >= xMin - m && x <= xMax + m && z <= boundZ(x) + m && z >= zMin;
const RECT = [xMin - CFG.dataPad, xMax + CFG.dataPad, zMin, zMax + CFG.dataPad];
const inRect = p => p[0] >= RECT[0] && p[0] <= RECT[1] && p[1] >= RECT[2] && p[1] <= RECT[3];

const r1 = v => Math.round(v * 10) / 10;
const morton = (x, z) => { let a = Math.floor((x + 4096) / 64), b = Math.floor((z + 4096) / 64), m = 0; for (let i = 0; i < 8; i++) m |= ((a >> i & 1) << (2 * i)) | ((b >> i & 1) << (2 * i + 1)); return m; };
const strTable = () => { const list = [], idx = new Map(); return { list, id: s => { if (!s) return 0; if (!idx.has(s)) { idx.set(s, list.length); list.push(s); } return idx.get(s) + 1; } }; };

/* =====================================================================
   3. ЗДАНИЯ
   ===================================================================== */
const cat = readCatastro();
const stat = { parts: cat.parts.length, noFloors: 0, tiny: 0, outside: 0, v0: 0, v1: 0, holes: 0 };
const byB = new Map();
for (const p of cat.parts) {
  if (p.floors < 1) { stat.noFloors++; continue; }
  const rings = p.rings.map(r => r.map(loc)), a = Math.abs(U.area(rings[0]));
  if (a < CFG.minPartArea) { stat.tiny++; continue; }
  if (!byB.has(p.bid)) byB.set(p.bid, []);
  byB.get(p.bid).push({ rings, floors: p.floors, below: p.below, a });
}
// OSM-здания: сетка 50 м для поиска контура, в который попадает центр здания кадастра
const osmB = osm.buildings.map(b => { const ring = b.ring.map(loc); return { ring, bb: U.bbox(ring), a: Math.abs(U.area(ring)), tags: b.tags }; });
const OG = new Map(), ok = (i, j) => i * 100000 + j;
osmB.forEach((b, n) => { for (let i = Math.floor(b.bb[0] / 50); i <= Math.floor(b.bb[1] / 50); i++) for (let j = Math.floor(b.bb[2] / 50); j <= Math.floor(b.bb[3] / 50); j++) { const k = ok(i, j); if (!OG.has(k)) OG.set(k, []); OG.get(k).push(n); } });
const osmAt = (x, z) => {
  let best = null;
  for (const n of OG.get(ok(Math.floor(x / 50), Math.floor(z / 50))) || []) {
    const b = osmB[n];
    if (x < b.bb[0] || x > b.bb[1] || z < b.bb[2] || z > b.bb[3] || !U.inPoly(x, z, b.ring)) continue;
    if (!best || b.a < best.a) best = b;
  }
  return best;
};
const osmType = t => t.amenity || t.tourism || (t.shop && 'shop') || (t.historic && 'historic') || (t.building !== 'yes' && t.building) || '';
const bTypes = strTable(), bNames = strTable();
const blds = [];
let osmMatched = 0;
for (const [bid, parts] of byB) {
  let A = 0, cx = 0, cz = 0;
  for (const p of parts) { const c = U.centroid(p.rings[0]); A += p.a; cx += c[0] * p.a; cz += c[1] * p.a; }
  cx /= A; cz /= A;
  if (!inside(cx, cz, -1)) { stat.outside++; continue; }
  const out = [];
  for (const p of parts) {
    const rs = [];
    p.rings.forEach((r, k) => {
      stat.v0 += r.length;
      let s = U.simplifyRing(r);
      if (!s || (k && Math.abs(U.area(s)) < CFG.minPartArea)) return;
      // внешнее кольцо — против часовой (площадь > 0), дыры — по часовой
      if ((U.area(s) > 0) !== (k === 0)) s = s.reverse();
      if (!k || rs.length) rs.push(s.map(q => [r1(q[0]), r1(q[1])]));
      if (k) stat.holes++;
    });
    if (!rs.length) continue;
    for (const r of rs) stat.v1 += r.length;
    out.push({ rings: rs, floors: p.floors, below: p.below });
  }
  if (!out.length) continue;
  const info = cat.buildings.get(bid) || { use: 0, year: 0 };
  const ob = osmAt(cx, cz);
  if (ob) osmMatched++;
  blds.push({ bid, cx, cz, parts: out, use: info.use, year: info.year, type: ob ? bTypes.id(osmType(ob.tags)) : 0, name: ob ? bNames.id(ob.tags.name || '') : 0 });
}
blds.sort((a, b) => morton(a.cx, a.cz) - morton(b.cx, b.cz));
const bStream = [], bRings = [];
for (const b of blds) {
  bStream.push(b.parts.length, b.use, b.year ? b.year - 1800 : 0, b.type, b.name);
  for (const p of b.parts) { bStream.push(p.floors, p.below, p.rings.length, ...p.rings.map(r => r.length)); bRings.push(...p.rings); }
}
const nParts = blds.reduce((s, b) => s + b.parts.length, 0);

/* =====================================================================
   4. OSM: улицы, ж/д, берег, море, площадные объекты, линии, ориентиры
   ===================================================================== */
const roadNames = strTable();
const roads = [];
let roadLen = 0;
for (const r of osm.roads) {
  const pts = r.pts.map(loc);
  const keepSeg = (a, b) => inside(a[0], a[1], 8) && inside(b[0], b[1], 8);
  for (const piece of U.splitLine(pts, keepSeg)) {
    const s = U.simplifyLine(piece, 0.3).map(q => [r1(q[0]), r1(q[1])]);
    let len = 0; for (let i = 1; i < s.length; i++) len += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]);
    if (len < 2) continue;
    roadLen += len;
    roads.push({ ...r, pts: s, len });
  }
}
roads.sort((a, b) => morton(...a.pts[0]) - morton(...b.pts[0]));
const rStream = [];
for (const r of roads) rStream.push(ROAD_CLASSES.indexOf(r.cls), SURFACES.indexOf(r.surface), r.oneway, (r.bridge ? 1 : 0) | (r.tunnel ? 2 : 0), r.layer,
  Math.round(r.width * 10), r.lanes, roadNames.id(r.name), r.pts.length);

const clipLine = (pts, tol) => U.splitLine(pts.map(loc), (a, b) => inRect(a) && inRect(b)).map(l => U.simplifyLine(l, tol).map(q => [r1(q[0]), r1(q[1])])).filter(l => l.length > 1);
const rails = [];
for (const r of osm.rails) for (const l of clipLine(r.pts, 0.3)) rails.push({ pts: l, flags: (r.bridge ? 1 : 0) | (r.tunnel ? 2 : 0) | (r.service ? 4 : 0) });
const coast = osm.coast.flatMap(l => clipLine(l, 0.4));
// море: самый длинный кусок берега в пределах RECT по x, замкнутый по низу прямоугольника (в OSM суша слева от линии)
let sea = null;
{
  const band = p => p[0] >= RECT[0] && p[0] <= RECT[1];
  const pieces = osm.coast.flatMap(l => U.splitLine(l.map(loc), (a, b) => band(a) && band(b)));
  const main = pieces.reduce((a, b) => (a && a.length > b.length ? a : b), null);
  if (main) {
    const edge = p => (Math.abs(p[0] - RECT[0]) < Math.abs(p[0] - RECT[1]) ? RECT[0] : RECT[1]);
    const f = main[0], l = main[main.length - 1], zb = RECT[2] - 50;
    const ring = [[edge(f), f[1]], ...main, [edge(l), l[1]], [edge(l), zb], [edge(f), zb]];
    sea = U.simplifyLine(U.clipPolyRect(ring, [RECT[0], RECT[1], RECT[2], RECT[3]]) || [], 0.4).map(q => [r1(q[0]), r1(q[1])]);
    if (sea.length < 3 || U.area(sea) === 0) sea = null;
  }
}
const areas = [];
const areaNames = strTable();
for (const a of osm.areas) {
  let ring = a.ring.map(loc);
  if (a.kind === 'pool') { const c = U.centroid(ring); if (!inside(c[0], c[1])) continue; }
  else { ring = U.clipPolyRect(ring, RECT); if (!ring) continue; }
  ring = U.simplifyRing(ring, { minD: 0.8, tol: 0.4, angDeg: 5 });
  if (!ring) continue;
  areas.push({ kind: a.kind, ring: ring.map(q => [r1(q[0]), r1(q[1])]), name: a.name });
}
if (sea) areas.push({ kind: 'sea', ring: sea, name: '' });
areas.sort((a, b) => morton(...a.ring[0]) - morton(...b.ring[0]));
const lines = [];
for (const l of osm.lines) for (const p of clipLine(l.pts, 0.4)) lines.push({ kind: l.kind, pts: p });

const pois = [];
for (const p of osm.pois) {
  const [x, z] = loc(p.p);
  if (!inRect([x, z])) continue;
  if (pois.some(q => q[0] === p.name && q[1] === p.type && Math.hypot(q[2] - x, q[3] - z) < 60)) continue;
  pois.push([p.name, p.type, Math.round(x), Math.round(z)]);
}

/* =====================================================================
   5. РЕЛЬЕФ
   ===================================================================== */
const dtm = readDTM();
const T0 = [Math.floor((xMin - CFG.dtmPad) / 10) * 10, Math.floor(zMin / 10) * 10];
const TNX = Math.ceil((xMax + CFG.dtmPad - T0[0]) / CFG.dtmStep) + 1, TNZ = Math.ceil((zMax + CFG.dtmPad - T0[1]) / CFG.dtmStep) + 1;
const hq = new Int32Array(TNX * TNZ);
let hMin = Infinity, hMax = -Infinity;
for (let j = 0; j < TNZ; j++) for (let i = 0; i < TNX; i++) {
  const h = dtm.at(...G.toUTM(T0[0] + i * CFG.dtmStep, T0[1] + j * CFG.dtmStep));
  hMin = Math.min(hMin, h); hMax = Math.max(hMax, h);
  hq[j * TNX + i] = Math.round(h / CFG.dtmQ);
}
// остатки от плоскости по трём соседям: h(i,j) − (h(i−1,j) + h(i,j−1) − h(i−1,j−1)); на краях — от одного соседа
const res = [];
for (let j = 0; j < TNZ; j++) for (let i = 0; i < TNX; i++) {
  const k = j * TNX + i;
  const pred = i && j ? hq[k - 1] + hq[k - TNX] - hq[k - TNX - 1] : i ? hq[k - 1] : j ? hq[k - TNX] : 0;
  res.push(hq[k] - pred);
}

/* =====================================================================
   5а. УЧАСТКИ КАДАСТРА
   ===================================================================== */
const pcl = readParcels();
const pStat = { v0: 0, v1: 0, holes: 0, outside: 0, rustic: 0 };
const parcels = [];
for (const p of pcl.parcels) {
  const ring = p.rings[0].map(loc);
  pStat.holes += p.rings.length - 1;                 // дыры не нужны: их края — края соседних участков
  if (!ring.some(q => inside(q[0], q[1], CFG.parcelPad))) { pStat.outside++; continue; }
  pStat.v0 += ring.length;
  // огромные сельские участки — по прямоугольнику данных
  let s = U.clipPolyRect(ring, RECT);
  s = s && U.simplifyRing(s, CFG.parcelSimp);
  if (!s) continue;
  if (U.area(s) < 0) s = s.reverse();
  pStat.v1 += s.length;
  if (p.rustic) pStat.rustic++;
  parcels.push({ ring: s.map(q => [r1(q[0]), r1(q[1])]), rustic: p.rustic, c: U.centroid(s), ref: p.ref });
}
parcels.sort((a, b) => morton(...a.c) - morton(...b.c));

/* =====================================================================
   5б. АДРЕСА
   ===================================================================== */
// название кадастра « CL JOSEP SOLER I CARTRO» → «C/ Josep Soler i Cartro»: тип улицы — сокращением, слова — с заглавной
const STREET_TYPE = { CL: 'C/', AV: 'Av.', PZ: 'Pl.', PS: 'Pg.', PJ: 'Ptge.', CR: 'Ctra.', CM: 'Camí', CJ: 'Carreró',
  UR: 'Urb.', TR: 'Trav.', LG: '', DS: '', PQ: 'Parc', AU: 'Autovia' };
const SMALL = new Set(['DE', 'DEL', 'DELS', 'LA', 'LES', 'EL', 'ELS', 'I', 'D', 'L', 'A', 'AL', 'Y', 'LOS', 'LAS']);
function prettyStreet(raw) {
  const w = raw.trim().split(/\s+/), t = w[0] in STREET_TYPE ? STREET_TYPE[w.shift()] : '';
  const name = w.map((x, i) => i && SMALL.has(x) ? x.toLowerCase() : x[0] + x.slice(1).toLowerCase()).join(' ');
  return (t ? t + ' ' : '') + name;
}
// номер дома → целое: номер · 32 + буква (A = 1 … Z = 26); 0 — без номера («S-N»)
const numCode = s => { const m = /^(\d+)([A-Z]?)/.exec(s); return m ? +m[1] * 32 + (m[2] ? m[2].charCodeAt(0) - 64 : 0) : 0; };
const ad = readAddresses();
const adNames = strTable(), byRef = new Map();
for (const a of ad.list) { if (!byRef.has(a.ref)) byRef.set(a.ref, []); byRef.get(a.ref).push(a); }
const aStat = { all: ad.list.length, blds: 0, used: 0, noNum: 0 };
const aStream = [];
for (const b of blds) {
  // по улицам: [улиц, затем на улицу: название, номеров, номера по возрастанию]
  const st = new Map();
  for (const a of byRef.get(b.bid) || []) {
    const id = adNames.id(prettyStreet(ad.streets.get(a.street) || '')), n = numCode(a.num);
    if (!st.has(id)) st.set(id, new Set());
    st.get(id).add(n);
    aStat.used++; if (!n) aStat.noNum++;
  }
  if (st.size) aStat.blds++;
  aStream.push(st.size);
  for (const [id, ns] of st) aStream.push(id, ns.size, ...[...ns].sort((p, q) => p - q));
  // точка подписи — вход первого адреса (у кадастра — на линии фасада), дм
  if (st.size) { const q = loc([byRef.get(b.bid)[0].x, byRef.get(b.bid)[0].y]); aStream.push(Math.round(q[0] * 10), Math.round(q[1] * 10)); }
}

/* =====================================================================
   5в. КРЫШИ (ортофото и лидар ICGC, tools/sitges/read-roofs.js) И ТОЧКИ OSM
   ===================================================================== */
const allParts = blds.flatMap(b => b.parts);
const haveTiles = ['orto', 'dsm'].every(k => fs.existsSync(path.join(G.RAW, k)));
const roofs = haveTiles ? readRoofs(allParts) : null;
const rfStat = { types: ROOF_TYPES.map(() => 0), lidar: 0, slopes: [] };
const rfStream = [];
if (roofs) for (const r of roofs) {
  rfStat.types[r.type]++;
  if (r.cov >= ROOF.cov) rfStat.lidar++;
  if (r.slope >= 0) rfStat.slopes.push(r.slope);
  // [тип, угол / 3°, цвет по 5 бит на канал]
  rfStream.push(r.type, Math.round(r.ang / 3) % 120, r.col[0] >> 3, r.col[1] >> 3, r.col[2] >> 3);
}
// точки OSM (магазины и кафе — витрины; деревья, фонари, переходы, светофоры, ворота — на будущие этапы)
const PT_KINDS = ['shop', 'tree', 'lamp', 'crossing', 'signals', 'gate'];
const FRONT = /^(cafe|restaurant|bar|pub|fast_food|ice_cream|pharmacy|bank|bureau_de_change|post_office|nightclub|clinic|dentist|veterinary)$/;
const ptKind = t => t.shop || t.office || t.craft || FRONT.test(t.amenity || '') ? 'shop'
  : t.natural === 'tree' ? 'tree' : t.highway === 'street_lamp' ? 'lamp' : t.highway === 'crossing' ? 'crossing'
  : t.highway === 'traffic_signals' ? 'signals' : /^(gate|lift_gate|sliding_gate|swing_gate)$/.test(t.barrier || '') ? 'gate' : null;
const pts = [];
if (fs.existsSync(path.join(G.RAW, 'points.json'))) {
  for (const e of JSON.parse(fs.readFileSync(path.join(G.RAW, 'points.json'), 'utf8')).elements) {
    if (e.type !== 'node' || !e.tags) continue;
    const k = ptKind(e.tags);
    if (!k) continue;
    const [x, z] = loc(G.utm(e.lat, e.lon));
    if (inside(x, z, 20)) pts.push({ k: PT_KINDS.indexOf(k), x: r1(x), z: r1(z) });
  }
}
pts.sort((a, b) => a.k - b.k || morton(a.x, a.z) - morton(b.x, b.z));

/* =====================================================================
   5г. КАЛИТКИ И ВОРОТА (tools/sitges/read-gates.js): входы кадастра, окна съездов по ортофото, служебные проезды
   ===================================================================== */
const gates = readGates({ parcels, parts: allParts.map(p => p.rings[0]), roads, addresses: ad.list });
// по участку, внутри — по положению: разности номеров участков маленькие
const byLot = l => l.map(g => ({ ...g, x: r1(g.x), z: r1(g.z) })).sort((a, b) => a.p - b.p || morton(a.x, a.z) - morton(b.x, b.z));
const gEnt = byLot(gates.ent), gWin = byLot(gates.win), gSvc = byLot(gates.svc);
const lotDelta = l => l.map((g, i) => g.p - (i ? l[i - 1].p : 0));

/* =====================================================================
   6. ЗАПИСЬ
   ===================================================================== */
const date = f => fs.statSync(path.join(G.RAW, f)).mtime.toISOString().slice(0, 10);
const dOSM = date('osm.json'), dCat = date('catastro.zip'), dDTM = date('dtm5.asc'), dPcl = date('parcels.zip'), dAd = date('addresses.zip');
const LIC_OSM = `// © участники OpenStreetMap (www.openstreetmap.org/copyright), лицензия ODbL 1.0 — этот файл данных остаётся открытым.`;
const LIC_CAT = `// Fuente: Dirección General del Catastro (INSPIRE Buildings, муниципалитет 08270 Sitges).`;
const LIC_ICGC = `// Institut Cartogràfic i Geològic de Catalunya (ICGC), CC BY 4.0.`;
const COMMON = [
  '// Файл написан скриптом tools/sitges/build.js — руками не править, не читать целиком (см. CLAUDE.md).',
  `// Координаты — локальные метры игры: ETRS89 / UTM 31N (EPSG:25831), поворот на ${(G.ROT * 180 / Math.PI).toFixed(1)}° (берег вдоль x),`,
  `//   начало — UTM ${G.ORIGIN[0]} E, ${G.ORIGIN[1]} N (центр карты); +z — от моря в сушу, +x — вдоль берега на юго-запад.`,
  '// Строки чисел — sitgesDec() (js/maps/sitges/plan.js): целые в зигзаге, по 5 бит на символ алфавита A–Z a–z 0–9 - _',
  '//   (бит 0x20 — «дальше ещё символ»). Точки — дециметры, разности от предыдущей точки потока (и через границы объектов).',
];
const tail = '// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.\n// Порядок загрузки задаётся в index.html.\n';
const sizes = [];
function write(name, head, defs, body) {
  const txt = [...head, ...COMMON, `// Определяет: ${defs}.`].join('\n') + '\n' + tail + body;
  fs.mkdirSync(G.OUT, { recursive: true });
  fs.writeFileSync(path.join(G.OUT, name), txt);
  sizes.push([name, Buffer.byteLength(txt)]);
}
const J = v => JSON.stringify(v);

write('data-geo.js', [
  '// Карта «Ситжес» — ДАННЫЕ: привязка, границы, ориентиры.',
  `// Источник: OpenStreetMap (Overpass, скачано ${dOSM}); границы считает tools/sitges/build.js.`, LIC_OSM,
  '// SITGES_GEO: origin — UTM центра карты, rot — поворот, °; rect — [xMin, xMax, zMin, zMax] игровой области;',
  '//   north — граница на севере: { x0, step, z: строка разностей z (дм) } — z(x0 + k·step); data — прямоугольник',
  '//   площадных объектов и берега (с запасом за границей); pois — ориентиры [название, тип, x, z].',
], 'SITGES_GEO', `const SITGES_GEO = {
  origin: ${J(G.ORIGIN)}, rot: ${(G.ROT * 180 / Math.PI).toFixed(2)}, crs: 'EPSG:25831',
  rect: ${J([xMin, xMax, zMin, zMax].map(r1))}, data: ${J(RECT.map(r1))},
  north: { x0: ${r1(xs[0])}, step: ${CFG.step}, z: '${U.enc(bz.map((z, k) => Math.round(z * 10) - (k ? Math.round(bz[k - 1] * 10) : 0)))}' },
  pois: ${J(pois)},
};
`);

write('data-osm.js', [
  '// Карта «Ситжес» — ДАННЫЕ OpenStreetMap: улицы, ж/д, берег, площадные объекты, линии.',
  `// Источник: OpenStreetMap через Overpass API, скачано ${dOSM}.`, LIC_OSM,
  '// SITGES_OSM:',
  '//   roadClasses, surfaces, areaKinds, lineKinds, roadNames, areaNames — таблицы кодов (название: индекс + 1, 0 — нет);',
  '//   roads — { m: на каждую улицу 9 чисел [класс, покрытие, односторонка (1, −1, 0), флаги (1 мост, 2 тоннель),',
  '//     слой, ширина дм (0 — не указана), полос, название, точек], p: точки };',
  '//   rails — { m: [флаги (1 мост, 2 тоннель, 4 подъездной путь), точек], p }; coast — { m: [точек], p } (суша слева);',
  '//   areas — { m: [вид, название, точек], p } (вид sea — море, замкнутое по низу прямоугольника data);',
  '//   lines — { m: [вид, точек], p } (пирсы, ручьи, обрывы).',
], 'SITGES_OSM', `const SITGES_OSM = {
  roadClasses: ${J(ROAD_CLASSES)},
  surfaces: ${J(SURFACES)},
  areaKinds: ${J([...AREA_KINDS, 'sea'])},
  lineKinds: ${J(LINE_KINDS)},
  roadNames: ${J(roadNames.list)},
  areaNames: ${J(areaNames.list)},
  roads: { m: '${U.enc(rStream)}', p: '${U.encPoints(roads.map(r => r.pts))}' },
  rails: { m: '${U.enc(rails.flatMap(r => [r.flags, r.pts.length]))}', p: '${U.encPoints(rails.map(r => r.pts))}' },
  coast: { m: '${U.enc(coast.map(l => l.length))}', p: '${U.encPoints(coast)}' },
  areas: { m: '${U.enc(areas.flatMap(a => [[...AREA_KINDS, 'sea'].indexOf(a.kind), areaNames.id(a.name), a.ring.length]))}', p: '${U.encPoints(areas.map(a => a.ring))}' },
  lines: { m: '${U.enc(lines.flatMap(l => [LINE_KINDS.indexOf(l.kind), l.pts.length]))}', p: '${U.encPoints(lines.map(l => l.pts))}' },
};
`);

write('data-buildings.js', [
  '// Карта «Ситжес» — ДАННЫЕ: здания (части зданий кадастра с этажностью; тип и название — из OSM).',
  `// Источник: кадастр Испании INSPIRE BU (ATOM, архив обновлён ${dCat}); OpenStreetMap (скачано ${dOSM}).`, LIC_CAT, LIC_OSM,
  '// SITGES_BLD: uses — назначение по кадастру; types, names — из OSM (индекс + 1, 0 — нет);',
  '//   m — поток целых: на здание [частей, назначение, год постройки − 1800 (0 — нет), тип, название],',
  '//     следом на каждую его часть [этажей над землёй, под землёй, колец, точек в каждом кольце…];',
  '//   p — точки колец по порядку (первое кольцо части — внешнее, против часовой в осях x, z; дальше — дворы-дыры).',
], 'SITGES_BLD', `const SITGES_BLD = {
  n: ${blds.length}, parts: ${nParts},
  uses: ${J(USES)},
  types: ${J(bTypes.list)},
  names: ${J(bNames.list)},
  m: '${U.enc(bStream)}',
  p: '${U.encPoints(bRings)}',
};
`);

write('data-terrain.js', [
  '// Карта «Ситжес» — ДАННЫЕ: рельеф (модель рельефа без зданий и деревьев, MET 5 × 5 м, пересчитана на сетку 10 м).',
  `// Источник: ICGC, WCS icc_mdt (покрытие met5), скачано ${dDTM}.`, LIC_ICGC,
  '// SITGES_DTM: x0, z0 — угол сетки; step — шаг, м; nx × nz узлов (строки по z, в строке — по x); q — квант высоты, м;',
  '//   h — строка остатков: h(i, j) − (h(i−1, j) + h(i, j−1) − h(i−1, j−1)) в квантах (на краях — от одного соседа).',
], 'SITGES_DTM', `const SITGES_DTM = {
  x0: ${T0[0]}, z0: ${T0[1]}, step: ${CFG.dtmStep}, nx: ${TNX}, nz: ${TNZ}, q: ${CFG.dtmQ},
  h: '${U.enc(res)}',
};
`);

write('data-parcels.js', [
  '// Карта «Ситжес» — ДАННЫЕ: участки кадастра (внешние контуры) у игровой области — линия заборов и ширина улиц.',
  `// Источник: кадастр Испании INSPIRE CP (ATOM, архив обновлён ${dPcl}).`, LIC_CAT.replace('INSPIRE Buildings', 'INSPIRE Cadastral Parcels'),
  '// SITGES_PCL: n — участков; m — поток целых: на участок [точек, флаги (1 — сельский)];',
  '//   p — точки контуров (против часовой в осях x, z), без дыр; сельские участки-дороги (номер ≥ 9000) выброшены.',
], 'SITGES_PCL', `const SITGES_PCL = {
  n: ${parcels.length},
  m: '${U.enc(parcels.flatMap(p => [p.ring.length, p.rustic ? 1 : 0]))}',
  p: '${U.encPoints(parcels.map(p => p.ring))}',
};
`);

write('data-addr.js', [
  '// Карта «Ситжес» — ДАННЫЕ: адреса зданий (улица и номера домов) — подписи над домами для отладки стиля города.',
  `// Источник: кадастр Испании INSPIRE AD (ATOM, архив обновлён ${dAd}); к зданию — по кадастровому номеру участка.`,
  LIC_CAT.replace('INSPIRE Buildings', 'INSPIRE Addresses'),
  '// SITGES_ADR: streets — названия улиц (индекс + 1); m — поток целых: на каждое здание в порядке SITGES_BLD',
  '//   [улиц, затем на улицу: название, номеров, номера по возрастанию; если улиц > 0 — x, z входа первого адреса, дм];',
  '//   номер — номер · 32 + буква (A = 1 … Z = 26), 0 — без номера.',
], 'SITGES_ADR', `const SITGES_ADR = {
  streets: ${J(adNames.list)},
  m: '${U.enc(aStream)}',
};
`);

if (roofs) write('data-roofs.js', [
  '// Карта «Ситжес» — ДАННЫЕ: крыши частей зданий — тип по уклонам лидара, цвет по ортофото.',
  `// Источник: ICGC — ортофото 25 см 2024 (WMS orto-territorial), модель «рельеф + здания» прибрежного лидара 50 см 2024`,
  `//   (WMS elevacions-litoral), скачано ${date('orto')}; разбор — tools/sitges/read-roofs.js.`, LIC_ICGC,
  `// SITGES_ROOF: types — ${J(ROOF_TYPES)} (none — нет данных, pitched — скатная по цвету черепицы, лидара нет);`,
  '//   m — поток целых: на каждую часть в порядке SITGES_BLD [тип, угол / 3° (у односкатной — направление вниз',
  '//   по скату, 0…360°; у остальных — линия конька, 0…180°; atan2(z, x) в осях игры), R, G, B по 5 бит].',
], 'SITGES_ROOF', `const SITGES_ROOF = {
  types: ${J(ROOF_TYPES)},
  m: '${U.enc(rfStream)}',
};
`);

write('data-points.js', [
  '// Карта «Ситжес» — ДАННЫЕ: точки OSM — магазины и кафе (витрины), деревья, фонари, переходы, светофоры, ворота.',
  `// Источник: OpenStreetMap (Overpass, скачано ${fs.existsSync(path.join(G.RAW, 'points.json')) ? date('points.json') : '—'}).`, LIC_OSM,
  `// SITGES_PTS: kinds — ${J(PT_KINDS)}; m — вид каждой точки (по порядку, сгруппированы по виду); p — точки.`,
], 'SITGES_PTS', `const SITGES_PTS = {
  kinds: ${J(PT_KINDS)},
  m: '${U.enc(pts.map(p => p.k))}',
  p: '${U.encPoints([pts.map(p => [p.x, p.z])])}',
};
`);

write('data-gates.js', [
  '// Карта «Ситжес» — ДАННЫЕ: места калиток и ворот (этап 4а.3) — входы кадастра, окна съездов по ортофото,',
  '//   служебные проезды OSM через границу участка. На заборы их ставит игра (js/maps/sitges/gates.js).',
  `// Источник: кадастр Испании INSPIRE AD (архив обновлён ${dAd}); ICGC — ортофото 25 см 2024 (скачано`,
  `//   ${haveTiles ? date('orto') : '—'}); OpenStreetMap (скачано ${dOSM}). Разбор — tools/sitges/read-gates.js.`,
  LIC_CAT.replace('INSPIRE Buildings', 'INSPIRE Addresses'), LIC_ICGC, LIC_OSM,
  '// SITGES_GATES: winW — ширина окна, м; thr — порог оценки окна; участок — индекс в SITGES_PCL; списки отсортированы по участку, m — разности номеров участков:',
  '//   ent — входы кадастра типа Entrance { m: [Δучастка], p: точки };',
  `//   win — окна ${GATE.win} м вдоль границы участка с самым мощёным двором { m: [Δучастка, оценка %], p: середины окон };`,
  '//   svc — пересечения highway=service с границей участка { m: [Δучастка], p }.',
], 'SITGES_GATES', `const SITGES_GATES = {
  winW: ${GATE.win}, thr: ${GATE.thr},
  ent: { m: '${U.enc(lotDelta(gEnt))}', p: '${U.encPoints([gEnt.map(g => [g.x, g.z])])}' },
  win: { m: '${U.enc(lotDelta(gWin).flatMap((d, i) => [d, Math.round(gWin[i].sc * 100)]))}', p: '${U.encPoints([gWin.map(g => [g.x, g.z])])}' },
  svc: { m: '${U.enc(lotDelta(gSvc))}', p: '${U.encPoints([gSvc.map(g => [g.x, g.z])])}' },
};
`);

/* =====================================================================
   СВОДКА
   ===================================================================== */
const km = v => (v / 1000).toFixed(1);
console.log(`Начало координат: UTM ${G.ORIGIN.join(' / ')}, поворот ${(G.ROT * 180 / Math.PI).toFixed(1)}°`);
console.log(`Игровая область: x ${xMin.toFixed(0)}…${xMax.toFixed(0)}, z ${zMin.toFixed(0)}…${zMax.toFixed(0)} (${km(xMax - xMin)} × ${km(zMax - zMin)} км); граница на севере притянута к улицам в ${LY.snapped} из ${xs.length} точек`);
console.log(`Здания кадастра: частей ${stat.parts} (без надземных этажей ${stat.noFloors}, мельче ${CFG.minPartArea} м² ${stat.tiny}); зданий вне границы ${stat.outside}`);
console.log(`  на карте: зданий ${blds.length}, частей ${nParts}, дворов-дыр ${stat.holes}; OSM-тип найден у ${osmMatched}; вершин было ${stat.v0}, стало ${stat.v1} (−${(100 - 100 * stat.v1 / stat.v0).toFixed(0)} %)`);
const fl = {}; for (const b of blds) for (const p of b.parts) fl[p.floors] = (fl[p.floors] || 0) + 1;
console.log('  этажность частей:', Object.entries(fl).map(([k, v]) => k + ':' + v).join(' '));
console.log(`OSM: улиц ${roads.length} (${km(roadLen)} км), ж/д ${rails.length}, берег ${coast.length}, площадных ${areas.length}${sea ? ' (с морем)' : ' (МОРЕ НЕ ПОСТРОЕНО)'}, линий ${lines.length}, ориентиров ${pois.length}`);
console.log(`Участки кадастра: ${pcl.stat.all} (дорог и ручьёв сельского кадастра ${pcl.stat.publicRustic}, вне области ${pStat.outside}); на карте ${parcels.length} (сельских ${pStat.rustic}), дыр выброшено ${pStat.holes}; вершин было ${pStat.v0}, стало ${pStat.v1}`);
console.log(`Адреса кадастра: ${aStat.all}, к зданиям на карте ${aStat.used} (без номера ${aStat.noNum}); с адресом ${aStat.blds} зданий из ${blds.length}, улиц ${adNames.list.length}`);
if (roofs) {
  console.log(`Крыши: ${ROOF_TYPES.map((t, i) => t + ' ' + rfStat.types[i]).join(', ')}; с лидаром ${rfStat.lidar} из ${roofs.length}`);
  // распределение уклонов (сколько частей с уклоном в корзине) — порог ROOF.minSlope должен лечь в провал
  const bins = [0, 0.03, 0.06, 0.09, 0.12, 0.16, 0.2, 0.25, 0.3, 0.4, 0.6, Infinity], hist = bins.slice(1).map(() => 0);
  for (const v of rfStat.slopes) hist[bins.findIndex((b, i) => v >= b && v < bins[i + 1])]++;
  console.log('  уклоны:', hist.map((n, i) => `${bins[i]}…${bins[i + 1]}: ${n}`).join(', '));
}
else console.log('Крыши: нет плиток orto/ и dsm/ — запусти download.js (data-roofs.js не записан)');
console.log(`Точки OSM: ${PT_KINDS.map((k, i) => k + ' ' + pts.filter(p => p.k === i).length).join(', ')}`);
console.log(`Калитки и ворота: входов Entrance ${gates.stat.ent} (без участка на карте ${gates.stat.entNoParcel}); окон съездов ${gates.stat.win} у ${gates.stat.winLots} участков${gates.stat.noTiles ? ' (НЕТ ПЛИТОК orto/)' : ''}; служебных проездов через границу ${gates.stat.svc}`);
console.log(`Рельеф: ${TNX} × ${TNZ} узлов по ${CFG.dtmStep} м, высоты ${hMin.toFixed(1)}…${hMax.toFixed(1)} м; в исходнике ${dtm.W} × ${dtm.H}, клеток без данных ${dtm.nodata}`);
console.log('Файлы:', sizes.map(([n, s]) => `${n} ${(s / 1024).toFixed(0)} КБ`).join(', '), `— всего ${(sizes.reduce((s, [, v]) => s + v, 0) / 1048576).toFixed(2)} МБ`);

// сверка с замерами плана (docs/sitges-plan.md): координаты плана — от 41.233° / 1.806°, x на восток, z на юг
const PLAN = [['церковь', /^Sant Bartomeu i Santa Tecla$/, 470, -185], ['ратуша', /^Ajuntament de Sitges$/, 490, -230],
  ['вокзал', /^Sitges$/, 310, -670, 'station'], ['рынок', /^Mercat Municipal/, 220, -655], ['Казино Прадо', /^Casino Prado$/, 380, -560],
  ['отель Террамар', /^Hotel Terramar$/, -1570, 855], ['Виньет', /^Santuari.*Vinyet/, -1170, -25]];
const found = PLAN.map(([n, re, px, pz, ty]) => { const q = pois.find(p => re.test(p[0]) && (!ty || p[1] === ty)); return q && { n, px, pz, x: q[2], z: q[3] }; }).filter(Boolean);
console.log('Ориентиры (игра x, z) и расстояния: игра / план, м');
for (const f of found) console.log(`  ${f.n}: ${f.x}, ${f.z}`);
for (let i = 0; i < found.length; i++) for (let j = i + 1; j < found.length; j++) {
  const a = found[i], b = found[j], dg = Math.hypot(a.x - b.x, a.z - b.z), dp = Math.hypot(a.px - b.px, a.pz - b.pz);
  if (Math.abs(dg - dp) > 25 || (i < 2 && j > 3)) console.log(`  ${a.n} — ${b.n}: ${dg.toFixed(0)} / ${dp.toFixed(0)}`);
}
