// Ситжес — ПОСТРОЙКА: порядок этапов и объект мира. Этапы 1–3 (docs/sitges-plan.md): рельеф ICGC, море, пляжи,
// волнорезы, понтоны марины, холмы-фон; улицы с тротуарами, мосты, ж/д; здания по контурам и этажности кадастра
// (этап 3: общие стены, фасад по этажам, проезды под домами).
// Этапы получают общий контекст K (деструктуризацией) и отдают новое через Object.assign(K, …):
//   sitgesBuildKit (здесь)       группа, сетка коллизий
//   sitgesBuildGround            земля, море, волнорезы, понтоны, фон (js/maps/sitges/ground.js)
//   sitgesBuildRoads             улицы, тротуары, мосты, ж/д, стены по границе (js/maps/sitges/roads3d.js)
//   (после тротуаров)            простые заборы по кромке тротуаров (js/maps/sitges/fences3d.js)
//   sitgesBuildBuildings         здания (js/maps/sitges/buildings.js)
//   sitgesBuildWorld (здесь)     склейка статики, теневые копии и объект мира: спавн, точки улиц, монеты
// Определяет: SITGES_LANE, SITGES_LOOK, SITGES_GREEN, buildSitges, sitgesBuildKit, sitgesBuildWorld.
// Использует: rand (js/core.js); StaticGrid, optimizeStatic, buildShadowProxies (js/world.js); WATER_U
//   (js/maps/city/textures.js); sitgesInPoly, sitgesSeg (js/maps/sitges/geom.js); sitgesRaster
//   (js/maps/sitges/terrain.js); sitgesBuildGround, SITGES_G (js/maps/sitges/ground.js); sitgesBuildRoads,
//   sitgesBuildMarks, sitgesBuildRoadMeshes (js/maps/sitges/roads3d.js); sitgesBuildWalks
//   (js/maps/sitges/walks3d.js); sitgesBuildFences (js/maps/sitges/fences3d.js); sitgesBuildRail
//   (js/maps/sitges/rail3d.js); sitgesBuildBuildings (js/maps/sitges/buildings.js); sitgesLabels
//   (js/maps/sitges/labels.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

// смещение машины от оси улицы при респауне, м
const SITGES_LANE = 1.6;
// свет карты: экспозиция (1 — как у пресета времени суток)
const SITGES_LOOK = { exposure: 0.85 };
// площадные объекты с травой (покрытие под колёсами)
const SITGES_GREEN = new Set(['park', 'garden', 'grass', 'golf', 'pitch', 'playground', 'cemetery', 'wood', 'scrub', 'farmland']);

function buildSitges(D) {
  const K = { D };
  sitgesBuildKit(K);
  sitgesBuildGround(K);
  sitgesBuildRoads(K);
  sitgesBuildWalks(K);
  sitgesBuildFences(K);
  sitgesBuildMarks(K);
  sitgesBuildRail(K);
  sitgesBuildRoadMeshes(K);
  sitgesBuildBuildings(K);
  return sitgesBuildWorld(K);
}

function sitgesBuildKit(K) {
  Object.assign(K, { group: new THREE.Group(), grid: new StaticGrid(10) });
}

function sitgesBuildWorld(K) {
  const { D, group, grid, decks, landLod, rockLod, roadLod, seaMesh, walkAt, meshColliders } = K, C = D.C, T = C.terra;
  optimizeStatic(group);
  buildShadowProxies(group);
  // подписи адресов над домами (js/maps/sitges/labels.js): строятся при первом включении, после склейки статики
  const labels = sitgesLabels(C, group);

  // точка внутри здания или ближе m к его стене
  const inPoly = sitgesInPoly;
  const nearEdge = (x, z, r, m) => r.some(([ax, az], i) => { const [bx, bz] = r[(i + 1) % r.length]; return sitgesSeg(x, z, ax, az, bx, bz) < m; });
  const blocked = (x, z, m = 0) => grid.query(x - m, x + m, z - m, z + m).some(o => o.poly && (inPoly(x, z, o.poly) || (m > 0 && nearEdge(x, z, o.poly, m))));

  // точки проезжих улиц через ~4 м (без служебных проездов): респаун, монеты
  const pts = [];
  for (const st of C.streets) {
    if (!st.drive || st.cls === 'service') continue;
    const v = st.v;
    for (let i = 0; i + 1 < v.length; i++) {
      const a = v[i], b = v[i + 1], L = b.s - a.s;
      if (L < 0.01) continue;
      const tx = (b.x - a.x) / L, tz = (b.z - a.z) / L;
      for (let s = 0; s < L; s += 4) {
        const x = a.x + tx * s, z = a.z + tz * s;
        if (D.inside(x, z) && !blocked(x, z, 1.2)) pts.push({ x, z, tx, tz, hw: a.hw, r: st });
      }
    }
  }
  // старт: середина набережной Passeig de la Ribera (широкая, дома с одной стороны, пляж с другой), лицом к церкви
  const prom = pts.filter(q => /Ribera/.test(q.r.name));
  const s0 = prom.length ? prom[prom.length >> 1] : pts[pts.length >> 1];
  const church = D.pois.find(p => p.type === 'church' && /Bartomeu/.test(p.name)) || { x: 0, z: 0 };
  const fw = (church.x - s0.x) * s0.tx + (church.z - s0.z) * s0.tz >= 0 ? 1 : -1, hs = Math.atan2(s0.tx * fw, s0.tz * fw);
  const spawns = [1, -1].map(s => [s0.x - s0.tz * 1.9 * s, s0.z + s0.tx * 1.9 * s, hs]);

  // покрытие под колёсами (js/effects.js, js/audio-env.js): море и кромка — мокро; улица — её покрытие, тротуар —
  // плитка; пляж — песок, гряда — камень и грунт; парки — трава, остальная земля — грунт
  const green = sitgesRaster(C.areas.filter(a => SITGES_GREEN.has(a.kind)).map(a => a.ring), T.X0, T.Z0, T.S, T.NX, T.NZ);
  const surfaceKind = (x, z) => {
    if (!T.inGrid(x, z)) return 'dirt';
    const k = T.cell(x, z);
    if (T.sea[k] || (T.H[k] < 1.5 && T.dSea[k] < 4 && !T.thin[k])) return 'wet';
    const c = C.carriageAt(x, z);
    if (c) return K.roadSurf(c.st);
    if (walkAt(x, z) > -Infinity) return 'paving';
    if (T.thin[k]) return 'dirt';
    if (T.beach[k]) return 'sand';
    return green[k] ? 'grass' : 'dirt';
  };
  return {
    id: 'sitges', group, grid, decks, meshColliders, barrels: [], ground: D.ground, waterAt: D.waterAt, water: 0, surfaceKind,
    surface: (x, z, y = Infinity) => { const w = walkAt(x, z); return Math.max(D.ground(x, z), decks.surface(x, z, y), w <= y ? w : -Infinity); },
    bounds: Math.max(D.HX, D.HZ), boundsX: D.HX, boundsZ: D.HZ, hfStep: T.S,
    sky: 0xcfdfec, fog: [300, 3200], far: 3200, near: 0.3,
    // свет (этап 4): белые стены и светлая черепица пересвечивались — экспозиция ниже и тонкоррекция, как на
    // «Побережье» (js/sky.js, js/core.js). Силу солнца и заполняющего света не задаём: карта ездится в любое время
    // суток, а look их заменяет, а не умножает
    look: { exposure: SITGES_LOOK.exposure, grade: true },
    coinCount: 80, spawns,
    // сводки постройки (tools/sitges/check.js)
    stats: { roads: K.roadsStats, bld: K.bldStats }, walkAt, roadLod,
    // ближайшая точка улицы; направление — вдоль улицы
    roadPoint(x, z, p) {
      let best = pts[0], bd = Infinity;
      for (const q of pts) { const d = (q.x - x) ** 2 + (q.z - z) ** 2; if (d < bd) { bd = d; best = q; } }
      const s = p === 0 ? 1 : -1, o = Math.min(SITGES_LANE, best.hw * 0.5) * s;
      return [best.x - best.tz * o, best.z + best.tx * o, Math.atan2(best.tx, best.tz)];
    },
    coinSpot() {
      const q = pts[Math.floor(Math.random() * pts.length)], o = rand(-1, 1) * Math.max(0, q.hw - 1.2);
      return [q.x - q.tz * o, q.z + q.tx * o];
    },
    // камера не уходит в стены узких улиц (js/match.js)
    occludes(x, y, z) { return grid.query(x, x, z, z).some(o => o.poly && y < o.y1 && y > o.y0 && inPoly(x, z, o.poly)); },
    minimap: D.minimap, mmExt: D.mmExt, mmExtZ: D.mmExtZ, mmBg: D.mmBg,
    reset() {},
    update(dt, t) { seaMesh.position.y = Math.sin(t * 0.7) * 0.04; WATER_U.uTime.value = t; labels.update(t); },
    // перед отрисовкой каждой половины экрана: подробность земли по расстоянию до камеры, валуны — только вблизи
    cullView(x, z) {
      for (const L of landLod) {
        const d = Math.hypot(L.x - x, L.z - z) - L.r;
        let on = 0; for (let q = 0; q < L.lods.length; q++) if (d > L.lods[q].from) on = q;
        for (let q = 0; q < L.lods.length; q++) L.lods[q].mesh.visible = q === on;
      }
      for (const R of rockLod) R.mesh.visible = Math.hypot(R.x - x, R.z - z) - R.r < SITGES_G.rockFar;
      for (const L of roadLod) L.mesh.visible = Math.hypot(L.x - x, L.z - z) - L.r < L.far;   // заборы
    },
  };
}
