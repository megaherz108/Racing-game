// Побережье — ПОСТРОЙКА: порядок этапов и объект мира.
// Этапы получают общий контекст K (деструктуризацией) и отдают новое через Object.assign(K, …):
//   coastBuildKit (здесь)        группа, сетка коллизий, дальность прорисовки мелочи
//   coastBuildGround             земля чанками с уровнями подробности, море, река (js/maps/coast/ground.js)
//   coastBuildRoads              полотна дорог: асфальт с обочинами, гравий, грунт (js/maps/coast/roads3d.js)
//   coastBuildStructures         дома, церковь, пьяцца, порт, маяк, бочки винодельни, амфитеатр (js/maps/coast/structures.js)
//   coastBuildProps              деревья, шпалеры, тюки сена, ящики (сбиваемые), кусты (js/maps/coast/props.js)
//   coastBuildMarket             рынок на пьяцце: прилавки, ящики с фруктами, столики кафе (js/maps/coast/market.js)
//   coastBuildCrossings          мосты, акведук с воротами, трамплин обрыва; все настилы (js/maps/coast/crossings.js)
//   coastBuildBackdrop           горный хребет за краем карты (js/maps/coast/backdrop.js)
//   coastBuildLife               чайки и дым из труб (js/maps/coast/life.js)
//   coastBuildWorld (здесь)      склейка статики, теневые копии и объект мира: ground, surface, waterAt, roadPoint…
// Определяет: buildCoast, coastBuildKit, coastBuildWorld.
// Использует: clamp, rand (js/core.js); StaticGrid, DistCull, Decks, geoTris, CHUNK_MIN_TRIS, chunkOrAll, Breakables,
//   optimizeStatic, buildShadowProxies (js/world.js); WATER_U (js/maps/city/textures.js); ellMetric
//   (js/maps/coast/terrain.js); coastBuildGround (js/maps/coast/ground.js); coastBuildRoads
//   (js/maps/coast/roads3d.js); coastBuildStructures (js/maps/coast/structures.js); coastBuildProps
//   (js/maps/coast/props.js); coastBuildMarket (js/maps/coast/market.js); coastBuildCrossings
//   (js/maps/coast/crossings.js); coastBuildBackdrop (js/maps/coast/backdrop.js); coastBuildLife
//   (js/maps/coast/life.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

function buildCoast(D) {
  const K = { D };
  coastBuildKit(K);
  coastBuildGround(K);
  coastBuildRoads(K);
  coastBuildStructures(K);
  coastBuildProps(K);
  coastBuildMarket(K);
  coastBuildCrossings(K);
  coastBuildBackdrop(K);
  coastBuildLife(K);
  return coastBuildWorld(K);
}

function coastBuildKit(K) {
  const group = new THREE.Group(), grid = new StaticGrid(10), dist = new DistCull(), decks = new Decks(), brks = [];
  // Сбиваемые объекты по чанкам (как в городе): на каждый чанк — свои InstancedMesh и свой Breakables.
  // parts: [{ geo, mat, shadow, per, loc }], place(B, item, i) добавляет объект; opts.far — дальность прорисовки мелочи
  function brkChunks(items, parts, opts, place, pad = 8) {
    if (!items.length) return;
    const tris = parts.reduce((s, pt) => s + geoTris(pt.geo) * (pt.per || 1), 0), whole = tris * items.length <= CHUNK_MIN_TRIS;
    for (const arr of chunkOrAll(items, o => [o.x, o.z], tris)) {
      const meshes = parts.map(pt => {
        const m = new THREE.InstancedMesh(pt.geo, pt.mat, arr.length * (pt.per || 1));
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
  Object.assign(K, { group, grid, dist, decks, brks, brkChunks });
}

function coastBuildWorld(K) {
  const { D, group, grid, dist, decks, brks, landLod, sea, worldBarrels, boatG, life } = K;
  const { C } = D;
  optimizeStatic(group);
  const brkMeshes = new Set();
  for (const B of brks) for (const E of B.meshes) brkMeshes.add(E.mesh);
  buildShadowProxies(group, o => brkMeshes.has(o));

  /* ---------- интерфейс мира ---------- */
  const surface = (x, z, y = Infinity) => Math.max(D.ground(x, z), decks.surface(x, z, y));
  // покрытие под колесом (пыль, брызги, следы — js/effects.js; звук — js/audio-env.js)
  // дороги: асфальт; обочины, гравий и тропы — грунт (пыль); брусчатка; вне дорог — трава, песок, у воды — мокро
  const surfaceKind = (x, z) => {
    const h = D.ground(x, z), wl = D.waterAt(x, z);
    if (h < wl + 0.3) return 'wet';
    const rd = C.roadAt(x, z);
    if (rd) return rd.kind === 'asphalt' ? (rd.shoulder ? 'dirt' : 'asphalt') : rd.kind === 'cobble' ? 'cobble' : 'dirt';
    if (z - C.ZC[C.cellI(x)] < 26 || ellMetric(C.island, x, z) < 1 || (wl > 0.5 && h < wl + 1.2)) return 'sand';
    if (Math.max(C.port.x0 - x, 0, x - C.port.x1, C.port.z0 - 2 - z, z - C.port.z1) < 2) return 'paving';
    return 'grass';
  };
  // точки дорог для респауна и монет (без пролётов мостов, кроме каменного)
  const roadPts = [];
  for (const r of C.roads) {
    const skip = new Set();
    for (const sp of r.spans) if (sp.type !== 'stone') for (let i = sp.i0 - 2; i <= sp.i1 + 2; i++) skip.add(i);
    r.pts.forEach((p, i) => { if (!skip.has(i)) roadPts.push({ p, r }); });
  }
  const mainPts = roadPts.filter(q => q.r.kind !== 'dirt');
  // фоновые звуки (js/audio-env.js): море и чайки у берега, порт, колокола у церкви, деревня, птицы и листва в лесу;
  // цикады в оливах, соснах и виноградниках, журчание реки, собаки у ферм, скрип лодок в порту, ветер на высотах
  const [vx, vz] = C.SITES.piazza, pc = [(C.port.x0 + C.port.x1) / 2, (C.port.z0 + C.port.z1) / 2];
  // цикады: сколько деревьев и шпалер в клетке 40 × 40 м (с соседними клетками)
  const CG = 40, CNX = Math.ceil(2 * D.HX / CG) + 1, CNZ = Math.ceil(2 * D.HZ / CG) + 1, cic = new Float32Array(CNX * CNZ);
  const cgi = (x, z) => clamp(Math.floor((z + D.HZ) / CG), 0, CNZ - 1) * CNX + clamp(Math.floor((x + D.HX) / CG), 0, CNX - 1);
  for (const [list, k] of [[C.olives, 1], [C.pines, 1], [C.cypress, 0.6], [C.vines, 0.15]]) for (const o of list) cic[cgi(o.x, o.z)] += k;
  const cicAt = (x, z) => {
    let n = 0;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) n += cic[cgi(x + a * CG, z + b * CG)] * (a || b ? 0.5 : 1);
    return clamp(n / 14, 0, 1);
  };
  const farms = C.houses.filter(h => !h.fisher && Math.hypot(h.x - vx, h.z - vz) > 230 && Math.hypot(h.x - pc[0], h.z - pc[1]) > 180);
  const soundAt = (x, z, o) => {
    const s = z - C.ZC[C.cellI(x)], sea = clamp(1 - (s - 10) / 190, 0, 1), dv = Math.hypot(x - vx, z - vz), dp = Math.hypot(x - pc[0], z - pc[1]);
    const wood = clamp(C.noise(x / 170 + 3, z / 170 - 5) * 2, 0, 1);
    o.sea = sea; o.gulls = Math.max(sea * 0.7, clamp(1 - dp / 220, 0, 1));
    o.ship = clamp(1 - dp / 260, 0, 1) * 0.5;
    o.bells = clamp(1 - dv / 320, 0, 1) * 0.9;
    o.hum = 0.04 + clamp(1 - dv / 200, 0, 1) * 0.18 + clamp(1 - dp / 200, 0, 1) * 0.15;
    o.birds = 0.45 + wood * 0.5; o.leaves = 0.25 + wood * 0.6;
    o.cicadas = Math.max(cicAt(x, z), 0.25 * clamp((dv - 120) / 80, 0, 1)) * (1 - sea * 0.8);
    const k = C.cellJ(z) * C.NX + C.cellI(x), rd = C.RD[k] < 1e8 ? C.RD[k] - C.riverPts[C.RI[k]].hw : 1e9;
    o.river = clamp(1 - rd / 90, 0, 1);
    let df = 1e9; for (const f of farms) df = Math.min(df, Math.hypot(f.x - x, f.z - z));
    o.dogs = clamp(1 - df / 170, 0, 1) * 0.9;
    o.creak = clamp(1 - dp / 150, 0, 1);
    o.wind = (0.1 + clamp((D.ground(x, z) - 30) / 40, 0, 1) * 0.7) * (1 - 0.6 * clamp(1 - dv / 160, 0, 1));   // в деревне дома укрывают
    return o;
  };
  // старт: серпантин у выезда из порта, лицом на север (к холмам)
  const serp = C.roads.find(r => r.id === 'serp'), s0 = serp.pts[16], hs = Math.atan2(s0.tx, s0.tz);
  const spawns = [1, -1].map(s => [s0.x + s0.nx * 1.9 * s, s0.z + s0.nz * 1.9 * s, hs]);
  return {
    id: 'coast', group, grid, decks, barrels: worldBarrels, ground: D.ground, surface, surfaceKind, soundAt, waterAt: D.waterAt, water: 0,
    bounds: D.HZ, boundsX: D.HX, boundsZ: D.HZ, hfStep: 2,
    // свет и даль: всегда золотой час, солнце низко над морем с юго-запада. Туман длинный — с холмов видна вся карта
    // и горы вокруг, дальние хребты тонут в дымке
    tod: 'golden', sunOff: [70, 26, -72], sky: 0xf2d2a6, fog: [250, 3000], far: 3000, near: 0.3,
    // ветер с моря на север (кроны, дым, облака) и тени облаков, бегущие по земле (js/breeze.js)
    wind: [-0.35, 1], clouds: { k: 0.42, size: 190, speed: 6 },
    coinCount: 90, spawns,
    // ближайшая точка асфальта или гравия; направление — вдоль дороги, к пьяцце
    roadPoint(x, z, p) {
      let best = mainPts[0], bd = Infinity;
      for (const q of mainPts) { const d = (q.p.x - x) ** 2 + (q.p.z - z) ** 2; if (d < bd) { bd = d; best = q; } }
      const { p: rp, r } = best, [px, pz] = D.C.SITES.piazza, fw = (px - rp.x) * rp.tx + (pz - rp.z) * rp.tz >= 0 ? 1 : -1;
      const lane = r.kind === 'asphalt' ? 1.8 : 0.8, s = (p === 0 ? 1 : -1) * fw;
      return [rp.x + rp.nx * lane * s, rp.z + rp.nz * lane * s, Math.atan2(rp.tx * fw, rp.tz * fw)];
    },
    // монеты: на дорогах (на тропах реже), на пролёте моста — на настиле
    coinSpot() {
      const q = roadPts[Math.floor(Math.random() * roadPts.length)], o = rand(-q.r.hw + 0.8, q.r.hw - 0.8);
      const x = q.p.x + q.p.nx * o, z = q.p.z + q.p.nz * o;
      return q.p.span ? [x, z, q.p.h] : [x, z];
    },
    minimap: D.minimap, mmExt: D.mmExt, mmBg: D.mmBg,
    breakables: brks,
    // зоны захвата для будущего режима «Захват точек» (js/maps/coast/sites.js)
    zones: C.zones,
    reset() {
      for (const b of brks) b.reset();
      for (const b of worldBarrels) { b.x = b.home[0]; b.z = b.home[1]; b.vx = b.vz = b.w = 0; b.h = 0; }
      life.reset();
    },
    update(dt, t) {
      sea.position.y = Math.sin(t * 0.7) * 0.04; WATER_U.uTime.value = t;
      for (const b of brks) b.update(dt);
      // бочки (тела Rapier двигают b.x, b.z) и лодки, качающиеся на волнах
      for (const b of worldBarrels) { b.h += Math.hypot(b.vx, b.vz) * dt * 0.6; b.mesh.position.set(b.x, D.ground(b.x, b.z) + 0.5, b.z); b.mesh.rotation.y = b.h; }
      life.update(dt, t);
      for (const { g, b } of boatG) { g.position.y = 0.12 + Math.sin(t * 1.1 + b.ph) * 0.12; g.rotation.z = Math.sin(t * 0.9 + b.ph) * 0.06; g.rotation.x = Math.sin(t * 0.7 + b.ph * 2) * 0.03; }
    },
    // перед отрисовкой каждой половины экрана: подробность земли по расстоянию и дальность мелочи
    cullView(x, z) {
      dist.update(x, z);
      for (const L of landLod) {
        const d = Math.hypot(L.x - x, L.z - z) - L.r;
        let on = 0; for (let q = 0; q < L.lods.length; q++) if (d > L.lods[q].from) on = q;
        for (let q = 0; q < L.lods.length; q++) L.lods[q].mesh.visible = q === on;
      }
    },
  };
}
