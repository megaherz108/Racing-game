// Ситжес — ПОСТРОЙКА: порядок этапов и объект мира. Этап 1 (docs/sitges-plan.md): рельеф ICGC, море, пляжи,
// волнорезы, понтоны марины, холмы-фон; здания — призмы по контурам кадастра на рельефе, столкновения с ними.
// Этапы получают общий контекст K (деструктуризацией) и отдают новое через Object.assign(K, …):
//   sitgesBuildKit (здесь)       группа, сетка коллизий
//   sitgesBuildGround            земля, море, волнорезы, понтоны, фон (js/maps/sitges/ground.js)
//   sitgesBuildBuildings         здания (js/maps/sitges/buildings.js)
//   sitgesBuildWorld (здесь)     склейка статики, теневые копии и объект мира: спавн, точки улиц, монеты
// Определяет: SITGES_LANE, buildSitges, sitgesBuildKit, sitgesBuildWorld.
// Использует: rand (js/core.js); StaticGrid, optimizeStatic, buildShadowProxies (js/world.js); WATER_U
//   (js/maps/city/textures.js); SITGES_MM (js/maps/sitges/minimap.js); sitgesBuildGround, SITGES_G
//   (js/maps/sitges/ground.js); sitgesBuildBuildings (js/maps/sitges/buildings.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

// смещение машины от оси улицы при респауне, м
const SITGES_LANE = 1.6;

function buildSitges(D) {
  const K = { D };
  sitgesBuildKit(K);
  sitgesBuildGround(K);
  sitgesBuildBuildings(K);
  return sitgesBuildWorld(K);
}

function sitgesBuildKit(K) {
  Object.assign(K, { group: new THREE.Group(), grid: new StaticGrid(10) });
}

function sitgesBuildWorld(K) {
  const { D, group, grid, decks, landLod, rockLod, seaMesh } = K, T = D.C.terra;
  optimizeStatic(group);
  buildShadowProxies(group);

  // точка внутри здания или ближе m к его стене
  const inPoly = (x, z, r) => {
    let ins = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, zi] = r[i], [xj, zj] = r[j];
      if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) ins = !ins;
    }
    return ins;
  };
  const nearEdge = (x, z, r, m) => r.some(([ax, az], i) => {
    const [bx, bz] = r[(i + 1) % r.length], dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz;
    const t = L ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L)) : 0;
    return Math.hypot(x - ax - t * dx, z - az - t * dz) < m;
  });
  const blocked = (x, z, m = 0) => grid.query(x - m, x + m, z - m, z + m).some(o => o.poly && (inPoly(x, z, o.poly) || (m > 0 && nearEdge(x, z, o.poly, m))));

  // точки проезжих улиц через ~4 м (без служебных проездов): респаун, монеты
  const W = SITGES_MM.road, pts = [];
  for (const r of D.drive) {
    if (r.cls === 'service') continue;
    const hw = (r.width || W[r.cls][0]) / 2;
    for (let i = 1; i < r.pts.length; i++) {
      const [ax, az] = r.pts[i - 1], [bx, bz] = r.pts[i], L = Math.hypot(bx - ax, bz - az);
      if (L < 0.01) continue;
      const tx = (bx - ax) / L, tz = (bz - az) / L;
      for (let s = 0; s < L; s += 4) {
        const x = ax + tx * s, z = az + tz * s;
        if (D.inside(x, z) && !blocked(x, z, 1.2)) pts.push({ x, z, tx, tz, hw, r });
      }
    }
  }
  // старт: середина набережной Passeig de la Ribera (широкая, дома с одной стороны, пляж с другой), лицом к церкви
  const prom = pts.filter(q => /Ribera/.test(q.r.name));
  const s0 = prom.length ? prom[prom.length >> 1] : pts[pts.length >> 1];
  const church = D.pois.find(p => p.type === 'church' && /Bartomeu/.test(p.name)) || { x: 0, z: 0 };
  const fw = (church.x - s0.x) * s0.tx + (church.z - s0.z) * s0.tz >= 0 ? 1 : -1, hs = Math.atan2(s0.tx * fw, s0.tz * fw);
  const spawns = [1, -1].map(s => [s0.x - s0.tz * 1.9 * s, s0.z + s0.tx * 1.9 * s, hs]);

  // покрытие под колёсами (js/effects.js, js/audio-env.js): море и кромка — мокро, пляж — песок, гряда — камень и грунт;
  // остальное пока асфальт (покрытия улиц — этап 2)
  const surfaceKind = (x, z) => {
    if (!T.inGrid(x, z)) return 'asphalt';
    const k = T.cell(x, z);
    if (T.sea[k] || (T.H[k] < 1.5 && T.dSea[k] < 4 && !T.thin[k])) return 'wet';
    if (T.thin[k]) return 'dirt';
    return T.beach[k] ? 'sand' : 'asphalt';
  };
  return {
    id: 'sitges', group, grid, decks, barrels: [], ground: D.ground, waterAt: D.waterAt, water: 0, surfaceKind,
    surface: (x, z, y = Infinity) => Math.max(D.ground(x, z), decks.surface(x, z, y)),
    bounds: Math.max(D.HX, D.HZ), boundsX: D.HX, boundsZ: D.HZ, hfStep: T.S,
    sky: 0xcfdfec, fog: [300, 3200], far: 3200, near: 0.3,
    coinCount: 80, spawns,
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
    occludes(x, y, z) { return grid.query(x, x, z, z).some(o => o.poly && y < o.y1 && inPoly(x, z, o.poly)); },
    minimap: D.minimap, mmExt: D.mmExt, mmExtZ: D.mmExtZ, mmBg: D.mmBg,
    reset() {},
    update(dt, t) { seaMesh.position.y = Math.sin(t * 0.7) * 0.04; WATER_U.uTime.value = t; },
    // перед отрисовкой каждой половины экрана: подробность земли по расстоянию до камеры, валуны — только вблизи
    cullView(x, z) {
      for (const L of landLod) {
        const d = Math.hypot(L.x - x, L.z - z) - L.r;
        let on = 0; for (let q = 0; q < L.lods.length; q++) if (d > L.lods[q].from) on = q;
        for (let q = 0; q < L.lods.length; q++) L.lods[q].mesh.visible = q === on;
      }
      for (const R of rockLod) R.mesh.visible = Math.hypot(R.x - x, R.z - z) - R.r < SITGES_G.rockFar;
    },
  };
}
