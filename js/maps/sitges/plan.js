// Ситжес — РАСКЛАДКА: распаковка данных карты и порядок этапов. Реальный город Ситжес (Каталония) от гольфа
// Террамар до марины Айгуадольс. Данные (js/maps/sitges/data-*.js) готовит конвейер tools/sitges/ из OSM,
// кадастра и рельефа ICGC — здесь их только распаковываем; случайностей в раскладке нет.
//   sitgesPlanBase (здесь)       границы, улицы, ж/д, берег, площадные объекты, здания, участки, рельеф ICGC, ориентиры
//   sitgesPlanTerrain            игровая сетка высот, море, берег, пляжи, волнорезы (js/maps/sitges/terrain.js)
//   sitgesPlanRoads              ширины улиц, тротуары, путепроводы и выемки под ними (js/maps/sitges/roads.js)
//   sitgesPlanHouses             высоты домов на рельефе, общие стены, фасады к улице, проезды (js/maps/sitges/houses.js)
//   sitgesPlanMinimap            мини-карта и текстура земли (js/maps/sitges/minimap.js)
// Оси: +z — от моря в сушу (верх мини-карты), +x — вдоль берега на юго-запад (Террамар), −x — к марине.
// Этапы 1–3 (docs/sitges-plan.md): рельеф, море, улицы и ж/д; здания по контурам и этажности кадастра.
// Определяет: SITGES_ABC, sitgesDec, sitgesPts, SITGES_FLOOR, sitgesHeight, sitgesData, sitgesPlanBase.
// Использует: SITGES_GEO (js/maps/sitges/data-geo.js); SITGES_OSM (js/maps/sitges/data-osm.js); SITGES_BLD
//   (js/maps/sitges/data-buildings.js); SITGES_DTM (js/maps/sitges/data-terrain.js); SITGES_PCL
//   (js/maps/sitges/data-parcels.js); sitgesPlanTerrain (js/maps/sitges/terrain.js); sitgesPlanRoads
//   (js/maps/sitges/roads.js); sitgesPlanMinimap, SITGES_DRIVE (js/maps/sitges/minimap.js); sitgesPlanHouses
//   (js/maps/sitges/houses.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

/* =====================================================================
   РАСПАКОВКА СТРОК (формат — tools/sitges/util.js, enc())
   ===================================================================== */
const SITGES_ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
// строка → массив целых: зигзаг, по 5 бит на символ, бит 0x20 — «дальше ещё символ»
function sitgesDec(s) {
  const T = sitgesDec.T || (sitgesDec.T = (() => { const t = new Int8Array(128); for (let i = 0; i < 64; i++) t[SITGES_ABC.charCodeAt(i)] = i; return t; })());
  const out = []; let v = 0, k = 1;
  for (let i = 0; i < s.length; i++) {
    const c = T[s.charCodeAt(i)];
    v += (c & 31) * k;
    if (c & 32) k *= 32; else { out.push(v % 2 ? -(v + 1) / 2 : v / 2); v = 0; k = 1; }
  }
  return out;
}
// поток точек (дециметры, разности от предыдущей точки) → массивы [[x, z], …] по числам точек counts
function sitgesPts(s, counts) {
  const d = sitgesDec(s), out = [];
  let i = 0, x = 0, z = 0;
  for (const n of counts) {
    const r = new Array(n);
    for (let k = 0; k < n; k++) { x += d[i++]; z += d[i++]; r[k] = [x / 10, z / 10]; }
    out.push(r);
  }
  return out;
}

/* =====================================================================
   ВЫСОТА ЗДАНИЙ
   ===================================================================== */
// по этажности кадастра: первый этаж выше (магазины, подъезды), сверху — парапет плоской крыши
const SITGES_FLOOR = { h: 3.0, ground: 4.0, parapet: 0.6 };
const sitgesHeight = floors => SITGES_FLOOR.ground + (floors - 1) * SITGES_FLOOR.h + SITGES_FLOOR.parapet;

/* =====================================================================
   КАРТА «СИТЖЕС»
   ===================================================================== */
function sitgesData() {
  const C = {};
  sitgesPlanBase(C);
  sitgesPlanTerrain(C);
  sitgesPlanRoads(C);
  sitgesPlanHouses(C);
  sitgesPlanMinimap(C);
  const { HX, HZ, rect, north, northAt, inside, roads, drive, blds, pois, minimap, mmExt, mmExtZ, mmBg, ground, waterAt } = C;
  // отрезки дорог по ~20 м — для превью режима на экране выбора (js/ui.js)
  const roadSegs = [];
  for (const st of C.streets) if (st.drive) for (let i = 1; i < st.v.length; i++) roadSegs.push({ x0: st.v[i - 1].x, z0: st.v[i - 1].z, x1: st.v[i].x, z1: st.v[i].z });
  return { HX, HZ, rect, north, northAt, inside, roads, drive, blds, pois, minimap, mmExt, mmExtZ, mmBg, ground, waterAt, roadSegs, C };
}

function sitgesPlanBase(C) {
  const G = SITGES_GEO, O = SITGES_OSM, B = SITGES_BLD, T = SITGES_DTM, PL = SITGES_PCL;
  const rect = G.rect, HX = Math.max(-rect[0], rect[1]), HZ = Math.max(-rect[2], rect[3]);
  // граница на севере: z(x) по точкам через step м
  const north = [];
  { let z = 0; for (const d of sitgesDec(G.north.z)) north.push((z += d) / 10); }
  const northAt = x => {
    const f = Math.max(0, Math.min(north.length - 1, (x - G.north.x0) / G.north.step)), k = Math.min(north.length - 2, Math.floor(f));
    return north[k] + (north[k + 1] - north[k]) * (f - k);
  };
  const inside = (x, z, m = 0) => x >= rect[0] - m && x <= rect[1] + m && z >= rect[2] && z <= northAt(x) + m;

  // поток «m» по n чисел на объект → массивы полей
  const rows = (s, n) => { const d = sitgesDec(s), out = []; for (let i = 0; i < d.length; i += n) out.push(d.slice(i, i + n)); return out; };
  // улицы: класс, покрытие, односторонка, мост/тоннель, слой, ширина, полосы, название
  const rm = rows(O.roads.m, 9), rp = sitgesPts(O.roads.p, rm.map(r => r[8]));
  const roads = rm.map((r, i) => ({
    cls: O.roadClasses[r[0]], surface: O.surfaces[r[1]], oneway: r[2], bridge: !!(r[3] & 1), tunnel: !!(r[3] & 2),
    layer: r[4], width: r[5] / 10, lanes: r[6], name: r[7] ? O.roadNames[r[7] - 1] : '', pts: rp[i],
  }));
  // проезжие улицы (без тротуаров, тропинок и лестниц)
  const drive = roads.filter(r => SITGES_DRIVE.has(r.cls) && !r.tunnel);
  const railM = rows(O.rails.m, 2), railP = sitgesPts(O.rails.p, railM.map(r => r[1]));
  const rails = railM.map((r, i) => ({ bridge: !!(r[0] & 1), tunnel: !!(r[0] & 2), siding: !!(r[0] & 4), pts: railP[i] }));
  const coast = sitgesPts(O.coast.p, sitgesDec(O.coast.m));
  const am = rows(O.areas.m, 3), ap = sitgesPts(O.areas.p, am.map(a => a[2]));
  const areas = am.map((a, i) => ({ kind: O.areaKinds[a[0]], name: a[1] ? O.areaNames[a[1] - 1] : '', ring: ap[i] }));
  const lm = rows(O.lines.m, 2), lp = sitgesPts(O.lines.p, lm.map(l => l[1]));
  const lines = lm.map((l, i) => ({ kind: O.lineKinds[l[0]], pts: lp[i] }));

  // здания: [частей, назначение, год, тип, название], затем на часть [этажей, подземных, колец, точек…]
  const bm = sitgesDec(B.m), counts = [], blds = [];
  for (let i = 0; i < bm.length;) {
    const np = bm[i], b = { use: B.uses[bm[i + 1]], year: bm[i + 2] ? bm[i + 2] + 1800 : 0, type: bm[i + 3] ? B.types[bm[i + 3] - 1] : '',
      name: bm[i + 4] ? B.names[bm[i + 4] - 1] : '', parts: [] };
    i += 5;
    for (let p = 0; p < np; p++) {
      const floors = bm[i], below = bm[i + 1], nr = bm[i + 2];
      b.parts.push({ floors, below, nr, h: sitgesHeight(floors) });
      for (let k = 0; k < nr; k++) counts.push(bm[i + 3 + k]);
      i += 3 + nr;
    }
    blds.push(b);
  }
  const bp = sitgesPts(B.p, counts);
  let ri = 0;
  for (const b of blds) for (const p of b.parts) { p.rings = bp.slice(ri, ri + p.nr); ri += p.nr; delete p.nr; }

  // участки кадастра: внешний контур (против часовой), сельский ли
  const pm = rows(PL.m, 2), pp = sitgesPts(PL.p, pm.map(r => r[0]));
  const parcels = pm.map((r, i) => ({ ring: pp[i], rustic: !!(r[1] & 1) }));

  // рельеф ICGC: высота в узлах сетки и билинейная выборка (мини-карта); игровая сетка — js/maps/sitges/terrain.js
  const H = new Float32Array(T.nx * T.nz);
  {
    const r = sitgesDec(T.h), q = new Int32Array(T.nx * T.nz);
    for (let j = 0, k = 0; j < T.nz; j++) for (let i = 0; i < T.nx; i++, k++) {
      const pred = i && j ? q[k - 1] + q[k - T.nx] - q[k - T.nx - 1] : i ? q[k - 1] : j ? q[k - T.nx] : 0;
      q[k] = pred + r[k]; H[k] = q[k] * T.q;
    }
  }
  const terrainAt = (x, z) => {
    const fx = Math.max(0, Math.min(T.nx - 1.001, (x - T.x0) / T.step)), fz = Math.max(0, Math.min(T.nz - 1.001, (z - T.z0) / T.step));
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, k = j * T.nx + i;
    return (H[k] * (1 - tx) + H[k + 1] * tx) * (1 - tz) + (H[k + T.nx] * (1 - tx) + H[k + T.nx + 1] * tx) * tz;
  };
  const pois = G.pois.map(([name, type, x, z]) => ({ name, type, x, z }));
  const dtm = { H, nx: T.nx, nz: T.nz, x0: T.x0, z0: T.z0, step: T.step };
  Object.assign(C, { rect, HX, HZ, north, northAt, inside, roads, drive, rails, coast, areas, lines, blds, parcels, terrainAt, dtm, pois });
}
