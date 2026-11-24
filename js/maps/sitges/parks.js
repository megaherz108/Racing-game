// Ситжес — РАСКЛАДКА: парки (план парка Can Robert — docs/sitges/park-canrobert.md, шаг П1 — рельеф).
//   sitgesParkTerrain(C) — из sitgesPlanTerrain после stSlopeTerrain, до улиц: внутри контура парка высоты игровой
//     сетки берутся из сетки 2,5 м по лидару 50 см (SITGES_PARKS, data-parks.js) вместо сглаженного ICGC 5–10 м.
//     От края — отступ: у контура (edge м) и у осей проезжих / пешеходных улиц и путей (road / rail м — их полотно,
//     тротуары, заборы и откосы стоят по прежнему рельефу: sitgesEvenRoads сглаживает узлы ближе hw + sw + 4 м к оси);
//     дальше — плавная сшивка за blend м (доля лидара smooth01). Под мостиком — низина лидара (настил — шаг П3).
//     Узлы сетки парка и игровой сетки совпадают (обе кратны 2,5 м) — выборка билинейкой на случай другого шага.
//   C.parks — для следующих шагов (П2 покраска, П3 строение): контур, сетка высот, растр покрытия, настилы мостиков,
//     места объектов; heightAt / coverAt — выборка по точке.
// Определяет: SITGES_PARK, sitgesParkUnpack, sitgesParkTerrain.
// Использует: clamp (js/core.js); smooth01 (js/world.js); SITGES_PARKS (js/maps/sitges/data-parks.js); sitgesInPoly,
//   sitgesSeg (js/maps/sitges/geom.js); sitgesDec (js/maps/sitges/plan.js); SITGES_DRIVE (js/maps/sitges/minimap.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const SITGES_PARK = {
  edge: 2,      // от контура парка внутрь — прежний рельеф, м
  road: 13,     // от оси проезжей / пешеходной улицы OSM — прежний рельеф, м (Víctor Balaguer: hw 4,5 + тротуар 2,4 + 4
                //   сглаживания полотна + сдвиг оси)
  rail: 9,      // от оси пути — прежний рельеф, м (полуширина выемки 2,4 + 4 сглаживания + ограда)
  blend: 9,     // сшивка: доля лидара растёт от 0 до 1 за столько метров
};

// распаковка парка из SITGES_PARKS (формат — шапка data-parks.js)
function sitgesParkUnpack(pk, classes) {
  const pts = s => { const d = sitgesDec(s), out = []; let x = 0, z = 0; for (let i = 0; i + 1 < d.length; i += 2) { x += d[i]; z += d[i + 1]; out.push([x / 10, z / 10]); } return out; };
  const ring = pts(pk.ring);
  // сетка высот: остатки от плоскости по трём соседям (на краях — от одного), квант q
  const G = pk.grid, r = sitgesDec(G.h), q = new Int32Array(G.nx * G.nz), H = new Float32Array(G.nx * G.nz);
  for (let j = 0, k = 0; j < G.nz; j++) for (let i = 0; i < G.nx; i++, k++) {
    const pred = i && j ? q[k - 1] + q[k - G.nx] - q[k - G.nx - 1] : i ? q[k - 1] : j ? q[k - G.nx] : 0;
    q[k] = pred + r[k]; H[k] = q[k] * G.q;
  }
  const grid = { x0: G.x0, z0: G.z0, step: G.step, nx: G.nx, nz: G.nz, H, x1: G.x0 + (G.nx - 1) * G.step, z1: G.z0 + (G.nz - 1) * G.step };
  const heightAt = (x, z) => {
    const fx = clamp((x - G.x0) / G.step, 0, G.nx - 1.0001), fz = clamp((z - G.z0) / G.step, 0, G.nz - 1.0001);
    const i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j, k = j * G.nx + i;
    return (H[k] * (1 - tx) + H[k + 1] * tx) * (1 - tz) + (H[k + G.nx] * (1 - tx) + H[k + G.nx + 1] * tx) * tz;
  };
  // покрытие: серии [класс, длина − 1]
  const V = pk.cover, c = new Uint8Array(V.w * V.d), runs = sitgesDec(V.c);
  for (let n = 0, k = 0; n + 1 < runs.length; n += 2) { c.fill(runs[n], k, k + runs[n + 1] + 1); k += runs[n + 1] + 1; }
  const cover = { x0: V.x0, z0: V.z0, cell: V.cell, w: V.w, d: V.d, c };
  const coverAt = (x, z) => {
    const i = Math.floor((x - V.x0) / V.cell), j = Math.floor((z - V.z0) / V.cell);
    return i < 0 || j < 0 || i >= V.w || j >= V.d ? 0 : c[j * V.w + i];
  };
  // настилы мостиков: ось, высота, м, источник (1 — замер, 0 — по соседям, 2 — конец на земле)
  const decks = pk.decks.map(d => ({ osm: d.osm, p: pts(d.p), h: sitgesDec(d.h).map(v => v / 10), m: sitgesDec(d.m) }));
  return { id: pk.id, name: pk.name, osm: pk.osm, ring, grid, cover, classes, decks, spots: pk.spots, heightAt, coverAt };
}

function sitgesParkTerrain(C) {
  const T = C.terra, { NX, NZ, S, X0, Z0, H, sea } = T, P = SITGES_PARK;
  const parks = SITGES_PARKS.list.map(pk => sitgesParkUnpack(pk, SITGES_PARKS.classes));
  const stats = [];
  for (const pk of parks) {
    const { ring, grid: G } = pk;
    let bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
    for (const [x, z] of ring) { bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); bz0 = Math.min(bz0, z); bz1 = Math.max(bz1, z); }
    // оси улиц и путей у парка (отрезки, задевающие рамку контура с запасом)
    const M = Math.max(P.road, P.rail) + P.blend, segs = [];
    const addLine = (pts, keep) => {
      for (let n = 0; n + 1 < pts.length; n++) {
        const [ax, az] = pts[n], [bx, bz] = pts[n + 1];
        if (Math.max(ax, bx) < bx0 - M || Math.min(ax, bx) > bx1 + M || Math.max(az, bz) < bz0 - M || Math.min(az, bz) > bz1 + M) continue;
        segs.push([ax, az, bx, bz, keep]);
      }
    };
    for (const r of C.roads) if (!r.tunnel && (SITGES_DRIVE.has(r.cls) || r.cls === 'pedestrian')) addLine(r.pts, P.road);
    for (const r of C.rails) if (!r.tunnel) addLine(r.pts, P.rail);
    const i0 = Math.max(0, Math.ceil((Math.max(bx0, G.x0) - X0) / S)), i1 = Math.min(NX - 1, Math.floor((Math.min(bx1, G.x1) - X0) / S));
    const j0 = Math.max(0, Math.ceil((Math.max(bz0, G.z0) - Z0) / S)), j1 = Math.min(NZ - 1, Math.floor((Math.min(bz1, G.z1) - Z0) / S));
    let n = 0, full = 0, sum = 0, max = 0, up = 0, down = 0;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * NX + i, x = X0 + i * S, z = Z0 + j * S;
      if (sea[k] || !sitgesInPoly(x, z, ring)) continue;
      // доля лидара: от контура
      let dEdge = Infinity;
      for (let a = 0, b = ring.length - 1; a < ring.length; b = a++) dEdge = Math.min(dEdge, sitgesSeg(x, z, ring[b][0], ring[b][1], ring[a][0], ring[a][1]));
      let w = smooth01((dEdge - P.edge) / P.blend);
      // и от осей улиц и путей
      for (const [ax, az, bx, bz, keep] of segs) {
        if (w <= 0) break;
        w = Math.min(w, smooth01((sitgesSeg(x, z, ax, az, bx, bz) - keep) / P.blend));
      }
      if (w <= 0) continue;
      const dh = (pk.heightAt(x, z) - H[k]) * w;
      H[k] += dh; n++;
      if (w >= 1) full++;
      sum += Math.abs(dh); max = Math.max(max, Math.abs(dh));
      if (dh > 0) up = Math.max(up, dh); else down = Math.max(down, -dh);
    }
    stats.push({ id: pk.id, nodes: n, full, meanDh: +(sum / Math.max(1, n)).toFixed(2), maxDh: +max.toFixed(2), up: +up.toFixed(2), down: +down.toFixed(2) });
  }
  Object.assign(C, { parks, parkStats: stats });
}
