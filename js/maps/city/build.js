// Город на острове — ПОСТРОЙКА: buildCity(D) делает из данных cityData() 3D-сцену, коллизии и интерфейс мира.
// Этапы делят общий контекст K (в нём D — данные раскладки):
//   cityBuildKit (здесь)            group, grid (StaticGrid), brkChunks() — сбиваемые объекты по чанкам
//   cityBuildGround (ground)        рельеф, вода, дороги, переулки, бульвары, тротуары, площадь с фонтаном
//   cityBuildBuildings (buildings)  здания, крыши, контейнеры, мосты и трамплины (Decks)
//   cityBuildLights (props)         светофоры
//   cityBuildStructures (buildings) уникальные объекты (landmarks.js), опоры эстакады, стенки и ограждение канала
//   cityBuildProps (props)          деревья, пальмы, фонари с ночными огнями, зонтики, гидранты, знаки, кафе, маяк
//   cityBuildWorld (здесь)          склейка статики (optimizeStatic) и объект мира: ground, surface, roadPoint…
// Порядок этапов влияет на склейку мешей: проверка — __game.fingerprint('city').worldHash (js/selftest.js).
// Определяет: buildCity, cityBuildKit, cityBuildWorld.
// Использует: clamp, rand, lerp (js/core.js); StaticGrid, UNIT_BOX, setInst, DistCull, geoTris, CHUNK_MIN_TRIS,
//   chunkOrAll, Breakables, optimizeStatic, buildShadowProxies (js/world.js); WATER_U (js/maps/city/textures.js);
//   cityBuildGround, LAND_LOD_FAR (js/maps/city/ground.js); cityBuildBuildings, cityBuildStructures
//   (js/maps/city/buildings.js); cityBuildLights, cityBuildProps (js/maps/city/props.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

/* =====================================================================
   ГОРОД НА ОСТРОВЕ — ПОСТРОЙКА
   ===================================================================== */
function buildCity(D) {
  const K = { D };
  cityBuildKit(K);
  cityBuildGround(K);
  cityBuildBuildings(K);
  cityBuildLights(K);
  cityBuildStructures(K);
  cityBuildProps(K);
  return cityBuildWorld(K);
}

function cityBuildKit(K) {
  const group = new THREE.Group(), grid = new StaticGrid(12);
  const box1 = UNIT_BOX;                                      // единичный куб с основанием в y = 0
  const colorBox = (m, i, o) => { setInst(m, i, o.x, o.y, o.z, o.w, o.h, o.d, o.ry || 0); m.setColorAt(i, _col.setHex(o.color)); };
  const xzOf = o => [o.x, o.z];
  // Разрушаемые объекты по чанкам: на каждый чанк — свои InstancedMesh и свой Breakables.
  // parts: [{ geo, mat, shadow, per, loc, attr: [имя, item => число] }], place(B, item, i) добавляет объект в B.
  const brks = [], dist = new DistCull();
  // opts.far — дальность прорисовки мелких объектов (м), см. DistCull в js/world.js
  function brkChunks(items, parts, opts, place, pad = 8) {
    const tris = parts.reduce((s, pt) => s + geoTris(pt.geo) * (pt.per || 1), 0);
    const whole = tris * items.length <= CHUNK_MIN_TRIS;      // одна InstancedMesh на весь город — дальность не нужна
    for (const arr of chunkOrAll(items, xzOf, tris)) {
      const meshes = parts.map(pt => {
        let g = pt.geo;
        if (pt.attr) { g = g.clone(); g.setAttribute(pt.attr[0], new THREE.InstancedBufferAttribute(new Float32Array(arr.map(pt.attr[1])), 1)); }
        const m = new THREE.InstancedMesh(g, pt.mat, arr.length * (pt.per || 1));
        m.castShadow = pt.shadow !== false; m.receiveShadow = true;
        return pt.per ? { mesh: m, per: pt.per, loc: pt.loc } : m;
      });
      const B = new Breakables(meshes, opts);
      arr.forEach((o, i) => place(B, o, i));
      for (const E of B.meshes) {
        const m = E.mesh; E.pad = pad;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
        m.computeBoundingSphere(); m.boundingSphere.radius += pad; group.add(m);
        if (opts.far && !whole) dist.add(m, opts.far);
      }
      brks.push(B);
    }
  }
  Object.assign(K, { group, grid, box1, colorBox, xzOf, brks, dist, brkChunks });
}

function cityBuildWorld(K) {
  const { D, group, grid, brks, dist, water, decks, updateLights, marks, nightGroup, updateLampFx, resetLampCheck,
    geysers, updateGeysers, landLod } = K;
  // склейка статичных мешей по чанкам и заморозка матриц (js/world.js)
  optimizeStatic(group);
  // тени неподвижных объектов — одним мешем на клетку карты; сбиваемые объекты отбрасывают тень сами
  const brkMeshes = new Set();
  for (const B of brks) for (const E of B.meshes) brkMeshes.add(E.mesh);
  buildShadowProxies(group, o => brkMeshes.has(o));

  /* ---------- интерфейс мира ---------- */
  const roads = D.roadSegs.filter(s => !s.ramp);        // на пандусах эстакады не респауним
  const total = roads.reduce((s, r) => s + Math.abs(r.x1 - r.x0) + Math.abs(r.z1 - r.z0), 0);
  const surface = (x, z, y = Infinity) => Math.max(D.ground(x, z), decks.surface(x, z, y));
  // покрытие под колесом (пыль, брызги, цвет дыма и следов — js/effects.js): дороги — асфальт, кварталы — плитка,
  // в Старом городе улицы — брусчатка; газоны и парк — трава, дорожки парка — грунт, берег — песок, у самой воды — мокрый песок
  const surfaceKind = (x, z) => {
    const cd = D.coastD(x, z);
    if (cd < 16 || z < D.BEACH_Z) return cd < 12 ? 'wet' : 'sand';          // вода начинается при cd ≈ 7,5 м
    const b = D.blockAt(x, z);
    if (!b) return D.district(x, z) === 'oldtown' ? 'cobble' : 'asphalt';      // улицы Старого города мощёные
    if (b.lane && x > b.lane.x0 && x < b.lane.x1) return 'asphalt';
    if (b.type === 'park') return D.parkPath(x, z) < 3 ? 'dirt' : 'grass';
    if ((b.type === 'suburb' || b.type === 'resort') && !(b.special && !b.special.fill) &&
      Math.min(x - b.x0, b.x1 - x, z - b.z0, b.z1 - z) > 3.6) return 'grass';
    return 'paving';
  };
  // фоновые звуки района (js/audio-env.js): веса в точке. Район опрашивается в пяти точках вокруг,
  // поэтому на границах районов звук меняется плавно; волны — по расстоянию до моря и до кромки канала
  const AMB = {
    port: { hum: 0.45, gulls: 1, ship: 1, horns: 0.2 }, downtown: { hum: 1, horns: 1, echo: 0.12 }, city: { hum: 0.65, horns: 0.5, birds: 0.15 },
    oldtown: { hum: 0.35, bells: 1, birds: 0.35, horns: 0.15 }, park: { hum: 0.15, birds: 1, leaves: 1 },
    resort: { hum: 0.25, birds: 0.4, gulls: 0.5, leaves: 0.3 }, suburb: { hum: 0.25, birds: 0.7, leaves: 0.5 },
  };
  const AMB_PTS = [[0, 0], [45, 0], [-45, 0], [0, 45], [0, -45]];
  const soundAt = (x, z, o) => {
    for (const [ox, oz] of AMB_PTS) { const a = AMB[D.district(x + ox, z + oz)]; for (const k in a) o[k] += a[k] / AMB_PTS.length; }
    const sea = clamp(1 - (D.coastD(x, z) - 8) / 110, 0, 1), quay = clamp(1 - (D.quayD(x, z) - 3) / 35, 0, 1);
    o.sea = Math.max(sea, quay * 0.45); o.gulls = Math.max(o.gulls, sea * 0.8);
    return o;
  };
  return {
    id: 'city', group, grid, decks, barrels: [], ground: D.ground, surface, surfaceKind, soundAt, geysers, water: D.WATER, bounds: D.BOUNDS, hfStep: 2,
    sky: 0x9fd3f7, fog: [280, 760], coinCount: 100,
    // монеты на постоянных местах: дуги над трамплинами эстакады и крыши посадки (js/maps/city/overpass.js)
    coinFixed: D.coinFixed,
    // старт на набережной канала у подножия западного пандуса, лицом к эстакаде (на север);
    // направо по набережной — разводной мост-трамплин
    spawns: [[-316.5, 38, 0], [-323.5, 38, 0]],
    // ближайшая точка на дороге; направление — к центру острова
    roadPoint(x, z, p) {
      let best = null, bd = Infinity;
      for (const s of roads) {
        const px = s.dir === 'z' ? s.x0 : clamp(x, Math.min(s.x0, s.x1), Math.max(s.x0, s.x1));
        const pz = s.dir === 'z' ? clamp(z, Math.min(s.z0, s.z1), Math.max(s.z0, s.z1)) : s.z0;
        const d = (px - x) ** 2 + (pz - z) ** 2;
        if (d < bd) { bd = d; best = [px, pz, s]; }
      }
      const [px, pz, s] = best;
      const h = s.dir === 'z' ? (pz > 0 ? Math.PI : 0) : (px > 0 ? -Math.PI / 2 : Math.PI / 2);
      const lane = p === 0 ? 3.5 : -3.5;
      return [px + Math.cos(h) * lane, pz - Math.sin(h) * lane, h];
    },
    coinSpot() {
      const r = Math.random();
      if (r < 0.1) {          // на дорожках парка
        const t = Math.random() * Math.PI * 2;
        return [D.PC[0] + Math.cos(t) * 200, D.PC[1] + Math.sin(t) * 125];
      }
      if (r < 0.18) {         // на пляже
        for (let k = 0; k < 30; k++) { const x = rand(-850, 850), z = rand(D.BEACH_Z - 90, D.BEACH_Z - 8); if (D.coastD(x, z) > 18) return [x, z]; }
      }
      if (r < 0.26) {         // на эстакаде
        const [x0, z0, x1, z1] = D.ovRuns[Math.floor(Math.random() * D.ovRuns.length)], t = Math.random(), o = rand(-5, 5);
        return x0 === x1 ? [x0 + o, lerp(z0, z1, t), D.OV.H] : [lerp(x0, x1, t), z0 + o, D.OV.H];
      }
      if (r < 0.31 && D.lanes.length) {   // в проездах под арками
        const L = D.lanes[Math.floor(Math.random() * D.lanes.length)];
        return [(L.x0 + L.x1) / 2 + rand(-2, 2), rand(L.z0 + 3, L.z1 - 3)];
      }
      if (r < 0.36 && D.alleys.length) {  // в кривых переулках
        const al = D.alleys[Math.floor(Math.random() * D.alleys.length)], p = al.pts[2 + Math.floor(Math.random() * (al.pts.length - 4))];
        return [p[0], p[1], D.CURB];
      }
      let a = Math.random() * total;
      for (const s of roads) {
        const L = Math.abs(s.x1 - s.x0) + Math.abs(s.z1 - s.z0);
        if (a > L) { a -= L; continue; }
        const t = a / L, o = rand(-s.w / 2 + 2, s.w / 2 - 2);
        return s.dir === 'z' ? [s.x0 + o, lerp(s.z0, s.z1, t)] : [lerp(s.x0, s.x1, t), s.z0 + o];
      }
      return [0, 170];
    },
    occludes(x, y, z) { return grid.query(x, x, z, z).some(o => o.box && y < o.h && x > o.minX && x < o.maxX && z > o.minZ && z < o.maxZ); },
    minimap: D.minimap, mmExt: D.mmExt, mmBg: D.mmBg,
    breakables: brks,
    reset() { for (const b of brks) b.reset(); geysers.length = 0; },
    update(dt, t) { water.position.y = D.WATER + Math.sin(t * 0.8) * 0.03; WATER_U.uTime.value = t; for (const b of brks) b.update(dt); updateGeysers(dt); marks.update(dt, t); updateLights(); updateLampFx(dt); },
    // вечером и ночью включаются огни фонарей (js/sky.js)
    setNight(k) { nightGroup.visible = k > 0; resetLampCheck(); },
    // перед отрисовкой каждой половины экрана: дальность прорисовки мелочи от камеры (x, z)
    // и подробность земли парка: дальние чанки — грубой сеткой (LAND_LOD_FAR, js/maps/city/ground.js)
    cullView(x, z) {
      dist.update(x, z);
      for (const L of landLod) { const far = Math.hypot(L.x - x, L.z - z) - L.r > LAND_LOD_FAR; L.hi.visible = !far; L.lo.visible = far; }
    },
    // дорожный граф для трафика (js/traffic.js)
    trafficData: { nodes: D.nodes, segs: D.segs, rounds: D.landmarks.filter(l => l.kind === 'roundabout'), lit: new Set(D.litNodes.map(n => n.x + ',' + n.z)),
      ov: D.ovTraffic },
  };
}
