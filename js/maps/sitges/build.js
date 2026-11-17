// Ситжес — ПОСТРОЙКА: порядок этапов и объект мира. Этап 0 (docs/sitges-plan.md): плоская земля с картинкой
// мини-карты вместо текстуры, здания — призмы по контурам кадастра, столкновения с ними.
// Этапы получают общий контекст K (деструктуризацией) и отдают новое через Object.assign(K, …):
//   sitgesBuildKit (здесь)       группа, сетка коллизий
//   sitgesBuildGround (здесь)    земля: прямоугольник с картинкой мини-карты, вокруг — море и суша цветом
//   sitgesBuildBuildings         здания (js/maps/sitges/buildings.js)
//   sitgesBuildWorld (здесь)     склейка статики, теневые копии и объект мира: спавн, точки улиц, монеты
// Определяет: SITGES_LANE, buildSitges, sitgesBuildKit, sitgesBuildGround, sitgesBuildWorld.
// Использует: rand (js/core.js); StaticGrid, optimizeStatic, buildShadowProxies (js/world.js); SITGES_MM
//   (js/maps/sitges/minimap.js); sitgesBuildBuildings (js/maps/sitges/buildings.js).
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

function sitgesBuildGround(K) {
  const { D, group } = K, E = D.mmExt, EZ = D.mmExtZ, FAR = 6000;
  // картинка мини-карты на плоскости: px = 0 — x = +E, верх картинки — z = +EZ (поворот на 180° вокруг вертикали)
  const tex = new THREE.CanvasTexture(D.minimap);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(2 * E, 2 * EZ), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
  plane.rotation.set(-Math.PI / 2, 0, Math.PI); plane.receiveShadow = true; plane.userData.keep = true;
  group.add(plane);
  // вокруг — без наложения: юг — море, север — суша, по бокам — море ниже линии берега у края картинки
  const sea = D.C.areas.find(a => a.kind === 'sea');
  const coastAt = side => {
    if (!sea) return -EZ;
    const xe = side > 0 ? Math.max(...sea.ring.map(p => p[0])) : Math.min(...sea.ring.map(p => p[0]));
    return Math.max(-EZ, Math.min(EZ, Math.max(...sea.ring.filter(p => Math.abs(p[0] - xe) < 1).map(p => p[1]))));
  };
  const seaMat = new THREE.MeshStandardMaterial({ color: SITGES_MM.sea, roughness: 0.3 });
  const landMat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(...SITGES_MM.land.map(v => v / 255), THREE.SRGBColorSpace), roughness: 1 });
  const quad = (x0, x1, z0, z1, mat) => {
    if (x1 <= x0 || z1 <= z0) return;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat);
    m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2); m.receiveShadow = true;
    group.add(m);
  };
  quad(-FAR, FAR, -FAR, -EZ, seaMat); quad(-FAR, FAR, EZ, FAR, landMat);
  for (const s of [1, -1]) {
    const zc = coastAt(s), [x0, x1] = s > 0 ? [E, FAR] : [-FAR, -E];
    quad(x0, x1, -EZ, zc, seaMat); quad(x0, x1, zc, EZ, landMat);
  }
}

function sitgesBuildWorld(K) {
  const { D, group, grid } = K;
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

  return {
    id: 'sitges', group, grid, barrels: [], ground: () => 0, water: null,
    bounds: Math.max(D.HX, D.HZ), boundsX: D.HX, boundsZ: D.HZ, hfStep: 10,
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
    occludes(x, y, z) { return grid.query(x, x, z, z).some(o => o.poly && y < o.h && inPoly(x, z, o.poly)); },
    minimap: D.minimap, mmExt: D.mmExt, mmExtZ: D.mmExtZ, mmBg: D.mmBg,
    reset() {},
    update() {},
  };
}
