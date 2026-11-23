// Общая сцена карт и утилиты мира (шум, сетка коллизий, мини-карта, InstancedMesh)
// Определяет: scene, hemi, sun, SUN_OFFSET, aimSun, smooth01, mulberry32, shuffle, makeNoise, noiseTexture, dummy,
//   UNIT_BOX, FLAT_QUAD, inst, setInst, stdMat, StaticGrid, angLerp, Y_AXIS, BRK_G, BRK_FLY, BRK_HINGE, BRK_REST,
//   brkGround, waterLevel, Breakables, mmCanvas, FACADE, NIGHT_U, makeBuildingMaterial, CHUNK, chunkKey,
//   chunkBuckets, CHUNK_MIN_TRIS, geoTris, chunkOrAll, instChunks, optimizeStatic, DistCull, SHADOW_CELL,
//   SHADOW_ONLY, buildShadowProxies, SHADOW_PROXY_MAT, shadowProxyOf, dropShadowProxy, setInstQ, Decks.
// Использует: envTex, QUAL, rand, renderer, clamp, shared (js/core.js); EnvProbe (js/envprobe.js); world
//   (js/maps/registry.js); surfaceAt (js/physics.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

/* =====================================================================
   ОБЩАЯ СЦЕНА ДЛЯ КАРТ
   ===================================================================== */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fcbef);
scene.fog = new THREE.Fog(0x9fcbef, 110, 300);
scene.environment = envTex;
EnvProbe.attach(scene);                                 // свет окружения для матовых поверхностей (js/envprobe.js)
const hemi = new THREE.HemisphereLight(0xe2f0ff, 0x4d5b3c, 0.7);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff4e2, 2.4);
const SUN_OFFSET = new THREE.Vector3(-30, 90, -45);     // меняется со временем суток (js/sky.js)
sun.castShadow = QUAL.shadows;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 10, far: 280 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);
// тени считаются отдельно для каждой половины экрана вокруг машины игрока
function aimSun(x, y, z) {
  x = Math.round(x); z = Math.round(z);
  sun.target.position.set(x, y, z);
  sun.position.set(x, y, z).add(SUN_OFFSET);
  sun.target.updateMatrixWorld();
}

/* =====================================================================
   УТИЛИТЫ МИРА
   ===================================================================== */
const smooth01 = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function shuffle(arr, rng) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }
// гладкий value-noise, результат в [-1, 1]
function makeNoise(rng) {
  const perm = new Uint8Array(512), p = Array.from({ length: 256 }, (_, i) => i);
  shuffle(p, rng);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const hash = (x, y) => perm[(perm[x & 255] + y) & 255] / 255;
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
  };
}
function noiseTexture(size, base, spread, dots) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, size, size);
  for (let i = 0; i < dots; i++) {
    const v = (Math.random() - 0.5) * spread;
    x.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
    x.fillRect(Math.random() * size, Math.random() * size, rand(1, 3), rand(1, 3));
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}

// InstancedMesh-хелперы
const dummy = new THREE.Object3D();
const _col = new THREE.Color();
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const FLAT_QUAD = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
function inst(geo, mat, n, shadow = true) {
  const m = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
  m.count = n; m.castShadow = shadow; m.receiveShadow = true; m.frustumCulled = false;
  return m;
}
function setInst(m, i, x, y, z, sx, sy, sz, ry = 0, rx = 0, rz = 0) {
  dummy.position.set(x, y, z); dummy.rotation.set(rx, ry, rz); dummy.scale.set(sx, sy, sz);
  dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix);
}
const stdMat = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.85 }, o));

// Пространственная сетка статических препятствий (быстрый поиск коллизий на больших картах)
class StaticGrid {
  constructor(cell = 10) { this.cell = cell; this.cells = new Map(); this.qid = 0; this.out = []; }
  key(i, j) { return (i + 2048) * 4096 + (j + 2048); }
  insert(o, minX, maxX, minZ, maxZ) {
    const c = this.cell;
    for (let i = Math.floor(minX / c); i <= Math.floor(maxX / c); i++)
      for (let j = Math.floor(minZ / c); j <= Math.floor(maxZ / c); j++) {
        const k = this.key(i, j); let b = this.cells.get(k);
        if (!b) this.cells.set(k, b = []);
        b.push(o);
      }
    return o;
  }
  addBox(minX, maxX, minZ, maxZ, h = 99) { return this.insert({ box: true, minX, maxX, minZ, maxZ, h, q: 0 }, minX, maxX, minZ, maxZ); }
  addCircle(x, z, r, h = 99) { return this.insert({ box: false, x, z, r, h, q: 0 }, x - r, x + r, z - r, z + r); }
  // многоугольник pts = [[x, z], …] высотой h (контур здания реальной карты). Для поиска и простых проверок —
  // габаритный прямоугольник, коллайдер Rapier — точная призма (js/physics.js)
  addPoly(pts, h = 99) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of pts) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
    return this.insert({ box: true, minX, maxX, minZ, maxZ, h, q: 0, poly: pts }, minX, maxX, minZ, maxZ);
  }
  // повёрнутый прямоугольник w × d с центром (x, z), поворот rot — как rotation.y у меша. Для поиска и простых
  // проверок — его габаритный прямоугольник (minX…maxZ), коллайдер Rapier — точный (obb)
  addOBB(x, z, w, d, rot, h = 99) {
    const c = Math.cos(rot), s = Math.sin(rot), ex = Math.abs(c) * w / 2 + Math.abs(s) * d / 2, ez = Math.abs(s) * w / 2 + Math.abs(c) * d / 2;
    return this.insert({ box: true, minX: x - ex, maxX: x + ex, minZ: z - ez, maxZ: z + ez, h, q: 0, obb: { x, z, w, d, rot } }, x - ex, x + ex, z - ez, z + ez);
  }
  query(minX, maxX, minZ, maxZ) {
    const c = this.cell, out = this.out, q = ++this.qid;
    out.length = 0;
    for (let i = Math.floor(minX / c); i <= Math.floor(maxX / c); i++)
      for (let j = Math.floor(minZ / c); j <= Math.floor(maxZ / c); j++) {
        const b = this.cells.get(this.key(i, j));
        if (b) for (const o of b) if (o.q !== q) { o.q = q; out.push(o); }
      }
    return out;
  }
  hitsPoint(x, z, m) {
    return this.query(x - m, x + m, z - m, z + m).some(o => o.box
      ? x > o.minX - m && x < o.maxX + m && z > o.minZ - m && z < o.maxZ + m
      : Math.hypot(x - o.x, z - o.z) < o.r + m);
  }
}

// Интерполяция углов по кратчайшей дуге
const angLerp = (a, b, t) => a + (((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI) * t;

// Разрушаемые объекты (фонари, светофоры, деревья, знаки, мебель кафе…): у каждого объекта общая матрица
// для нескольких InstancedMesh. Пока объект цел, он — препятствие в сетке коллизий (и коллайдер Rapier).
// Удар быстрой машиной ломает объект (knockBreakables() в js/physics.js): лёгкие предметы улетают и кувыркаются,
// тяжёлые (столбы, деревья) ломаются у основания и падают, проскальзывая основанием по земле.
// Обломки — простая собственная физика (центр масс + поворот), без тел Rapier: с машинами они больше не сталкиваются,
// но лёгкие обломки можно пнуть ещё раз.
const _bq = new THREE.Quaternion(), _bq2 = new THREE.Quaternion(), _be = new THREE.Euler(), _bax = new THREE.Vector3(), _bpos = new THREE.Vector3(),
  _bu = new THREE.Vector3(), _bsc = new THREE.Vector3(), _bm = new THREE.Matrix4(), _bm2 = new THREE.Matrix4(), Y_AXIS = new THREE.Vector3(0, 1, 0);
const BRK_G = 14;                                   // гравитация обломков (как GRAV в физике)
const BRK_FLY = 1, BRK_HINGE = 2, BRK_REST = 3;     // режимы обломка: полёт, опора на землю, покой
// высота поверхности под обломком: рельеф или настил (мост) не выше y
const brkGround = (x, z, y) => typeof surfaceAt === 'function' ? surfaceAt(x, z, y + 0.5) : world.ground(x, z);
// Уровень воды в точке: одно число на всю карту (world.water; null — воды нет) или по месту (world.waterAt(x, z) —
// река в холмах выше моря; там, где воды нет, waterAt возвращает -Infinity)
const waterLevel = (x, z) => world.waterAt ? world.waterAt(x, z) : world.water;
class Breakables {
  // meshes — InstancedMesh (один экземпляр на объект) или { mesh, per, loc: [Matrix4] } — несколько экземпляров
  //   на объект со своими локальными матрицами (например, три лампы светофора).
  // Параметры (масштаб объекта s умножает mass на s³, anchor на s², minSpeed и cy на s):
  //   mass — масса, кг: машина теряет долю скорости mass / (M + mass) (закон сохранения импульса);
  //   anchor — сколько ещё скорости (м/с) уходит на то, чтобы вырвать объект из земли;
  //   minSpeed — медленнее этого объект не ломается, а работает как стена;
  //   dmg — доля потерянной скорости, которая идёт в урон машине;
  //   cy — высота центра масс над основанием, м; lie — угол от вертикали, под которым упавший объект лежит;
  //   light — лёгкий предмет: улетает и кувыркается, его можно пнуть снова; иначе падает, переламываясь у основания;
  //   kind — материал для звука и частиц ('metal', 'wood', 'plastic', 'post'); onBreak(it) — дополнительный эффект.
  constructor(meshes, o = {}) {
    this.meshes = meshes.map(m => m.isInstancedMesh ? { mesh: m, per: 1, loc: null } : m);
    this.o = Object.assign({ mass: 100, anchor: 0, minSpeed: 0, dmg: 0, cy: 1, lie: 1.5, light: false, kind: 'metal', onBreak: null }, o);
    this.items = []; this.active = []; this.debris = [];
  }
  // e: { s — масштаб, rx/rz — наклон (как в setInst), loc — локальные матрицы по индексу меша (или null),
  //   mass, anchor, minSpeed, cy — свои значения объекта (как есть, без умножения на масштаб) вместо общих }
  add(grid, x, y, z, ry = 0, r = 0.2, h = 2, e = {}) {
    const O = this.o, s = e.s || 1;
    const it = { i: this.items.length, owner: this, x, y, z, ry, rx: e.rx || 0, rz: e.rz || 0, s, loc: e.loc || null,
      mass: e.mass ?? O.mass * s ** 3, anchor: e.anchor ?? O.anchor * s * s, minSpeed: e.minSpeed ?? O.minSpeed * s,
      cy: e.cy ?? O.cy * s, cLie: Math.cos(O.lie),
      broken: false, mode: 0, act: false, kick: 0, p: null, v: null, q: null, w: null, pv: null };
    this.items.push(it);
    if (grid) it.cell = grid.addCircle(x, z, r, h); if (it.cell) it.cell.brk = it;
    this.write(it);
    return it;
  }
  write(it) {
    if (!it.broken) {
      _bq.setFromEuler(_be.set(it.rx, it.ry, it.rz));
      _bm.compose(_bpos.set(it.x, it.y, it.z), _bq, _bsc.setScalar(it.s));
    } else {
      _bpos.set(0, -it.cy, 0).applyQuaternion(it.q).add(it.p);      // основание = центр масс − cy вдоль оси объекта
      _bm.compose(_bpos, it.q, _bsc.setScalar(it.s));
    }
    this.meshes.forEach((E, mi) => {
      const m = E.mesh;
      for (let k = 0; k < E.per; k++) {
        const loc = E.loc ? E.loc[k] : it.loc && it.loc[mi];
        m.setMatrixAt(it.i * E.per + k, loc ? _bm2.multiplyMatrices(_bm, loc) : _bm);
      }
      m.instanceMatrix.needsUpdate = true;
      // обломок улетел за границу чанка — расширяем ограничивающую сферу, иначе его отсечёт камера
      const bs = m.boundingSphere;
      if (it.broken && bs) { const d = bs.center.distanceTo(it.p) + it.cy * 2 + 1; if (d > bs.radius) bs.radius = d; }
    });
  }
  // сломать объект: (nx, nz) — направление удара, vn — скорость удара, (vx, vz) — скорость машины после удара
  knock(it, nx, nz, vn, vx, vz) {
    const O = this.o;
    if (!it.p) { it.p = new THREE.Vector3(); it.v = new THREE.Vector3(); it.q = new THREE.Quaternion(); it.w = new THREE.Vector3(); it.pv = new THREE.Vector3(); }
    it.broken = true; it.kick = 0.4;
    it.q.setFromEuler(_be.set(it.rx, it.ry, it.rz));
    it.pv.set(it.x, it.y, it.z);
    it.p.set(0, it.cy, 0).applyQuaternion(it.q).add(it.pv);
    const vt = vx * nx + vz * nz, tx = vx - nx * vt, tz = vz - nz * vt;      // касательная составляющая скорости машины
    if (O.light) {
      // лёгкий предмет отлетает быстрее машины и кувыркается
      const k = rand(1.05, 1.35), spin = Math.min(14, 2 + vn * 0.5);
      it.v.set(nx * vn * k + tx * 0.5, 1.2 + vn * rand(0.12, 0.28), nz * vn * k + tz * 0.5);
      it.w.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(spin);
      it.w.x += nz * spin * 0.5; it.w.z -= nx * spin * 0.5;
      it.mode = BRK_FLY;
    } else {
      // тяжёлый объект ломается у основания: основание отбрасывает вперёд, верх заваливается в сторону удара
      it.v.set(nx * vn * 0.5 + tx * 0.3, Math.max(0, (vn - 12) * 0.15), nz * vn * 0.5 + tz * 0.3);
      const wt = 0.5 + vn * 0.4 / it.cy;
      it.w.set(nz * wt, rand(-0.5, 0.5), -nx * wt);
      it.mode = it.v.y > 0 ? BRK_FLY : BRK_HINGE;
    }
    if (!it.act) { it.act = true; this.active.push(it); }
    if (O.light && !this.debris.includes(it)) this.debris.push(it);
    if (O.onBreak) O.onBreak(it, vn);
  }
  // пнуть лежащий (или летящий) лёгкий обломок: (vx, vz) — скорость машины, (nx, nz) — от машины к обломку
  kickDebris(it, vx, vz, nx, nz, speed) {
    it.kick = 0.35;
    it.v.set(vx * rand(0.9, 1.2) + nx * 1.5, 1 + speed * rand(0.1, 0.22), vz * rand(0.9, 1.2) + nz * 1.5);
    it.w.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(Math.min(12, 2 + speed * 0.4));
    it.p.y += 0.05; it.mode = BRK_FLY;
    if (!it.act) { it.act = true; this.active.push(it); }
  }
  spin(it, h) {
    const w = it.w.length();
    if (w > 1e-5) { it.q.premultiply(_bq2.setFromAxisAngle(_bax.copy(it.w).divideScalar(w), w * h)).normalize(); }
  }
  step(it, h) {
    const O = this.o;
    if (it.kick > 0) it.kick -= h;
    if (it.mode === BRK_FLY) {
      it.v.y -= BRK_G * h;
      it.p.addScaledVector(it.v, h);
      this.spin(it, h);
      it.w.multiplyScalar(Math.exp(-0.3 * h));
      _bu.set(0, 1, 0).applyQuaternion(it.q);
      const r = it.cy * Math.max(Math.abs(_bu.y), it.cLie), g = brkGround(it.p.x, it.p.z, it.p.y);
      if (it.p.y < g + r) {
        it.p.y = g + r;
        if (it.v.y < -3) {                                                // отскок
          it.v.y *= -0.3; it.v.x *= 0.75; it.v.z *= 0.75; it.w.multiplyScalar(0.7);
        } else {                                                          // лёг на землю — дальше опирается на неё
          it.v.y = 0; it.mode = BRK_HINGE;
          it.pv.copy(it.p).addScaledVector(_bu, -it.cy * (_bu.y >= 0 ? 1 : -1));
          it.pv.y = g;
        }
      }
      return;
    }
    // опора на землю: точка опоры скользит с трением, сила тяжести заваливает объект набок
    _bu.set(0, 1, 0).applyQuaternion(it.q);
    const sg = _bu.y >= 0 ? 1 : -1;
    const ux = _bu.x * sg, uy = _bu.y * sg, uz = _bu.z * sg, hl = Math.hypot(ux, uz);
    // ось, вокруг которой объект заваливается; пока он стоит ровно — по направлению вращения
    let ax, az;
    if (hl > 1e-3) { ax = uz / hl; az = -ux / hl; }
    else { const wl = Math.hypot(it.w.x, it.w.z); ax = wl > 1e-5 ? it.w.x / wl : 1; az = wl > 1e-5 ? it.w.z / wl : 0; }
    const lying = uy <= it.cLie + 1e-3;
    if (!lying) {
      const wa = it.w.x * ax + it.w.z * az + 0.75 * BRK_G / it.cy * hl * h;
      it.w.set(ax * wa, it.w.y * Math.exp(-3 * h), az * wa);
    }
    const f = Math.exp(-(lying ? 5 : O.light ? 3.5 : 2.5) * h);
    it.v.x *= f; it.v.z *= f;
    it.pv.x += it.v.x * h; it.pv.z += it.v.z * h;
    this.spin(it, h);
    _bu.set(0, 1, 0).applyQuaternion(it.q).multiplyScalar(sg);
    if (_bu.y < it.cLie) {
      // упал: ставим ровно на угол лёжа и гасим вращение (с небольшим отскоком)
      const back = Math.acos(clamp(it.cLie, -1, 1)) - Math.acos(clamp(_bu.y, -1, 1));
      it.q.premultiply(_bq2.setFromAxisAngle(_bax.set(ax, 0, az), back)).normalize();
      const wa = it.w.x * ax + it.w.z * az;
      if (wa > 1.2) it.w.set(-ax * wa * 0.25, 0, -az * wa * 0.25); else it.w.set(0, 0, 0);
      _bu.set(0, 1, 0).applyQuaternion(it.q).multiplyScalar(sg);
    }
    if (lying) it.w.multiplyScalar(Math.exp(-8 * h));
    // основание съехало с уступа (бордюр, край моста) — снова в полёт
    const gp = brkGround(it.pv.x, it.pv.z, it.pv.y);
    if (it.pv.y - gp > 0.4) { it.mode = BRK_FLY; it.v.y = 0; }
    else it.pv.y = gp;
    it.p.copy(it.pv).addScaledVector(_bu, it.cy);
    const still = it.w.lengthSq() < 0.09 && it.v.x * it.v.x + it.v.z * it.v.z < 0.04;
    if (still && (lying || (O.light && _bu.y > 0.96))) it.mode = BRK_REST;
  }
  update(dt) {
    for (let k = this.active.length - 1; k >= 0; k--) {
      const it = this.active[k];
      for (let t = dt; t > 1e-4; t -= 1 / 60) this.step(it, Math.min(t, 1 / 60));
      this.write(it);
      if (it.mode === BRK_REST) { it.act = false; this.active.splice(k, 1); }
    }
  }
  reset() {
    this.active.length = 0; this.debris.length = 0;
    for (const it of this.items) if (it.broken) { it.broken = false; it.mode = 0; it.act = false; this.write(it); }
    for (const E of this.meshes) if (E.mesh.boundingSphere) E.mesh.computeBoundingSphere(), E.mesh.boundingSphere.radius += E.pad || 6;
  }
}

// Канвас мини-карты: +X рисуется слева (как видит камера, смотрящая вдоль +Z), +Z — вверх.
// Картинка охватывает x и z от −ext до ext; у вытянутой карты по z можно взять меньше — extZ (канвас тогда
// ниже ширины, а мир отдаёт его как world.mmExtZ; по умолчанию квадрат)
function mmCanvas(ext, size = 512, extZ = ext) {
  const c = document.createElement('canvas'); c.width = size; c.height = Math.round(size * extZ / ext);
  const ctx = c.getContext('2d'), sc = size / (2 * ext);
  const X = x => (ext - x) * sc, Z = z => (extZ - z) * sc;
  return {
    c, ctx, sc, ext, extZ, X, Z,
    rect: (minX, maxX, minZ, maxZ) => ctx.fillRect(X(maxX), Z(maxZ), (maxX - minX) * sc, (maxZ - minZ) * sc),
    dot: (x, z, r) => { ctx.beginPath(); ctx.arc(X(x), Z(z), r, 0, Math.PI * 2); ctx.fill(); },
    world: (px, py) => [ext - (px + 0.5) / sc, extZ - (py + 0.5) / sc],
  };
}

// Материал зданий: окна рисуются процедурно в шейдере по мировым координатам,
// поэтому одна InstancedMesh даёт дома любой высоты без растяжения текстуры.
// Стили фасада (атрибут aStyle у экземпляра): 0 — обычные окна, 1 — стеклянный фасад, 2 — ленточные окна,
// 3 — старинные узкие окна, 4 — вертикальные ленты. Без атрибута — стиль 0.
const FACADE = { punched: 0, glass: 1, ribbon: 2, old: 3, strips: 4 };
// «Ночность» сцены: 0 — день, 1 — ночь (js/sky.js). Ночью окна зданий и витрины светятся.
const NIGHT_U = { value: 0 };
function makeBuildingMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0.05 });
  m.onBeforeCompile = sh => {
    sh.uniforms.uNight = NIGHT_U;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aStyle;
        varying vec3 vBPos;
        varying vec3 vBNrm;
        varying float vStyle;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 bwp = vec4(transformed, 1.0);
        vec3 bwn = objectNormal;
        #ifdef USE_INSTANCING
          bwp = instanceMatrix * bwp;
          bwn = mat3(instanceMatrix) * bwn;
        #endif
        vBPos = (modelMatrix * bwp).xyz;
        vBNrm = normalize(mat3(modelMatrix) * bwn);
        vStyle = aStyle;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vBPos;
        varying vec3 vBNrm;
        varying float vStyle;
        uniform float uNight;
        float bWin = 0.0, bLit = 0.0, bGlass = 0.0, bH = 0.0, bShop = 0.0;
        void bWindows() {
          vec3 an = abs(vBNrm);
          float wall = 1.0 - step(0.5, an.y);
          float u = an.x > an.z ? vBPos.z : vBPos.x;
          float y = vBPos.y;
          float fl = (y - 0.12) / 3.3, fy = fract(fl);
          int st = int(vStyle + 0.5);
          float upper, cw = 2.8;
          if (st == 1) {                 // стеклянный фасад: панели 1,6 м с тонкими импостами
            cw = 1.6; float fx = fract(u / cw);
            upper = step(0.035, fx) * step(fx, 0.965) * step(0.07, fy) * step(fy, 0.93);
            bGlass = 1.0;
          } else if (st == 2) {          // ленточные окна во всю ширину этажа
            cw = 3.6; upper = step(0.34, fy) * step(fy, 0.8);
          } else if (st == 3) {          // старинные узкие высокие окна
            cw = 2.3; float fx = fract(u / cw);
            upper = step(0.32, fx) * step(fx, 0.64) * step(0.2, fy) * step(fy, 0.8);
          } else if (st == 4) {          // вертикальные ленты
            cw = 2.2; float fx = fract(u / cw);
            upper = step(0.3, fx) * step(fx, 0.72) * step(0.04, fy);
          } else {
            float fx = fract(u / cw);
            upper = step(0.18, fx) * step(fx, 0.82) * step(0.3, fy) * step(fy, 0.84);
          }
          upper *= step(3.6, y);
          float fx2 = fract(u / 6.0);
          float shop = step(0.06, fx2) * step(fx2, 0.94) * step(0.55, y) * step(y, 3.0);
          bWin = wall * max(upper, shop);
          bShop = wall * shop * (1.0 - upper);
          float id = floor(u / cw) * 7.13 + floor(fl) * 3.71 + floor(an.x > an.z ? vBPos.x : vBPos.z) * 0.37;
          bH = fract(sin(id) * 43758.5453);
          bLit = step(0.8, bH);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        bWindows();
        vec3 bWinCol = mix(vec3(0.09, 0.14, 0.21), vec3(0.75, 0.68, 0.48), bLit * 0.3);
        // стекло слегка окрашено цветом здания — стеклянные башни не одинаковые
        bWinCol = mix(bWinCol, mix(vec3(0.14, 0.24, 0.33), diffuseColor.rgb * 0.55, 0.35), bGlass);
        diffuseColor.rgb = mix(diffuseColor.rgb, bWinCol, bWin);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        // ночью горит примерно половина окон (тёплый или холодный свет) и все витрины
        if (uNight > 0.001) {
          float on = step(0.62 - uNight * 0.2, bH);
          vec3 lamp = mix(vec3(1.0, 0.72, 0.42), vec3(0.62, 0.78, 1.0), step(0.82, fract(bH * 17.3)));
          totalEmissiveRadiance += bWin * uNight * lamp * (on * (0.38 + fract(bH * 5.1) * 0.5) * (1.0 - bShop) + bShop * 1.1);
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.08 - bGlass * 0.04, bWin);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor = mix(metalnessFactor, 0.55 + bGlass * 0.25, bWin);`);
  };
  return m;
}


/* =====================================================================
   ЧАНКИ: отсечение невидимого на больших картах
   ===================================================================== */
// Объекты раскладываются по квадратам CHUNK×CHUNK м. Каждый квадрат — своя InstancedMesh с ограничивающей сферой,
// поэтому Three.js не рисует (и не считает тени) для квадратов вне поля зрения камеры.
const CHUNK = 300;
const chunkKey = (x, z) => Math.floor(x / CHUNK) * 1000 + Math.floor(z / CHUNK);
function chunkBuckets(items, xz) {
  const m = new Map();
  for (const it of items) {
    const [x, z] = xz(it), k = chunkKey(x, z);
    let a = m.get(k); if (!a) m.set(k, a = []);
    a.push(it);
  }
  return [...m.values()];
}
// Лёгкие категории (мало треугольников на весь город: бордюры, крыши, контейнеры, стулья…) выгоднее рисовать
// одной InstancedMesh на всю карту: отсечение по чанкам экономит копейки вершин, а стоит десятков вызовов отрисовки.
const CHUNK_MIN_TRIS = 4000;          // выше — лишние вершины обходятся видеокарте дороже сэкономленных вызовов (замерено)
const geoTris = g => (g.index ? g.index.count : g.attributes.position.count) / 3;
function chunkOrAll(items, xz, trisPerItem) {
  return trisPerItem * items.length <= CHUNK_MIN_TRIS ? (items.length ? [items] : []) : chunkBuckets(items, xz);
}
// fill(mesh, i, item) заполняет матрицу (и цвет) экземпляра
// attr(item) — необязательный стиль фасада экземпляра (атрибут aStyle, см. makeBuildingMaterial)
function instChunks(group, geo, mat, items, xz, fill, shadow = true, attr = null) {
  const out = [];
  for (const arr of chunkOrAll(items, xz, geoTris(geo))) {
    let g = geo;
    if (attr) { g = geo.clone(); g.setAttribute('aStyle', new THREE.InstancedBufferAttribute(new Float32Array(arr.map(attr)), 1)); }
    const m = new THREE.InstancedMesh(g, mat, arr.length);
    m.castShadow = shadow; m.receiveShadow = true;
    arr.forEach((it, i) => fill(m, i, it));
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
    group.add(m); out.push(m);
  }
  return out;
}
/* ---------- оптимизация статичной части карты ---------- */
// Вызывается в конце постройки карты. Объекты с userData.dynamic (вода, колесо обозрения…) и всё внутри них не трогаются.
// 1) Обычные (не instanced) меши склеиваются в один меш на чанк и материал — меньше вызовов отрисовки.
// 2) Матрицы неподвижных объектов считаются один раз: Three.js больше не обходит тысячи объектов карты
//    перед каждой отрисовкой (а их две на кадр — по одной на половину экрана).
const _osInv = new THREE.Matrix4(), _osM = new THREE.Matrix4(), _osV = new THREE.Vector3();
function optimizeStatic(group) {
  group.updateMatrixWorld(true);
  _osInv.copy(group.matrixWorld).invert();
  const cand = [];
  const walk = o => {
    if (o.userData.dynamic) return;
    if (o.isMesh && !o.isInstancedMesh && !Array.isArray(o.material) && o.matrixWorld.determinant() > 0 && !o.userData.keep) cand.push(o);
    for (const c of o.children) walk(c);
  };
  for (const c of group.children) walk(c);
  const buckets = new Map();
  for (const o of cand) {
    const g = o.geometry;
    if (!g.boundingSphere) g.computeBoundingSphere();
    _osV.copy(g.boundingSphere.center).applyMatrix4(o.matrixWorld);
    const sig = Object.keys(g.attributes).sort().map(k => k + g.attributes[k].itemSize).join(',');
    const key = [chunkKey(_osV.x, _osV.z), o.material.uuid, o.castShadow, o.receiveShadow, o.renderOrder, o.layers.mask, o.visible, sig].join('|');
    let b = buckets.get(key); if (!b) buckets.set(key, b = []);
    b.push(o);
  }
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    const geos = list.map(o => {
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      g.morphAttributes = {}; g.clearGroups();
      g.applyMatrix4(_osM.multiplyMatrices(_osInv, o.matrixWorld));
      return g;
    });
    const geo = mergeGeometries(geos);
    for (const g of geos) g.dispose();
    if (!geo) continue;                                   // несовместимые атрибуты — оставляем как было
    geo.computeBoundingSphere();
    const f = list[0], m = new THREE.Mesh(geo, f.material);
    m.castShadow = f.castShadow; m.receiveShadow = f.receiveShadow; m.renderOrder = f.renderOrder; m.layers.mask = f.layers.mask;
    for (const o of list) o.removeFromParent();
    group.add(m);
  }
  // пустые после склейки группы больше не нужны
  for (const c of [...group.children]) if (!c.isMesh && !c.isPoints && !c.isLine && !c.userData.dynamic && c.children.length === 0 && c.type === 'Group') c.removeFromParent();
  // заморозка матриц: у поддеревьев без динамики
  group.updateMatrixWorld(true);
  const hasDynamic = o => o.userData.dynamic || o.children.some(hasDynamic);
  const freeze = o => { o.matrixAutoUpdate = false; o.matrixWorldAutoUpdate = false; for (const c of o.children) freeze(c); };
  group.matrixAutoUpdate = false;
  for (const c of group.children) if (!hasDynamic(c)) freeze(c);
}

// Дальность прорисовки мелочи (гидранты, стулья, знаки…): чанк такого объекта не рисуется, если ближайшая
// его точка дальше far от камеры. На таком расстоянии предмет — пара пикселей в тумане, а вызов отрисовки он стоит.
class DistCull {
  constructor() { this.list = []; }
  add(mesh, far) { this.list.push({ mesh, far }); }
  update(x, z) {
    for (const { mesh: m, far } of this.list) {
      const s = m.boundingSphere;
      if (!s) continue;
      const d = Math.hypot(s.center.x - x, s.center.z - z) - s.radius;
      m.visible = d < far;
    }
  }
}

/* ---------- теневые копии неподвижных объектов ---------- */
// В проходе теней Three.js рисует каждый отбрасывающий тень меш отдельным вызовом, причём чанк 300 × 300 м — целиком,
// хотя карта теней покрывает 140 × 140 м: около сотни вызовов и ~100 тыс. треугольников на каждую половину экрана.
// Для тени же не нужны ни материалы, ни экземпляры — только треугольники. Поэтому после постройки карты геометрия
// всех неподвижных объектов, отбрасывающих тень, собирается в один меш на клетку SHADOW_CELL × SHADOW_CELL м
// (только координаты вершин), а у самих объектов castShadow выключается. Копии видны только в проходе теней
// (SHADOW_ONLY), в кадр они не попадают. Сбиваемые объекты (skip) и всё с userData.dynamic тень отбрасывают сами.
const SHADOW_CELL = 150;
const SHADOW_ONLY = [];                     // объекты, которые видны только в проходе теней
{
  const sm = renderer.shadowMap, render = sm.render;
  sm.render = function (lights, scn, cam) {
    for (const o of SHADOW_ONLY) o.visible = true;
    try { render.call(this, lights, scn, cam); } finally { for (const o of SHADOW_ONLY) o.visible = false; }
  };
}
const _spM = new THREE.Matrix4(), _spI = new THREE.Matrix4(), _spInv = new THREE.Matrix4(), _spC = new THREE.Vector3();
function buildShadowProxies(group, skip = () => false) {
  if (!QUAL.shadows) return null;                 // теней нет (качество «Минимум») — и копии не нужны
  group.updateMatrixWorld(true);
  _spInv.copy(group.matrixWorld).invert();
  const buckets = new Map(), taken = [];
  // треугольники меша в его собственных координатах: Float32Array по 9 чисел
  const localTris = g => {
    const p = g.attributes.position, ix = g.index, n = ix ? ix.count : p.count, out = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) { const v = ix ? ix.getX(k) : k; out[k * 3] = p.getX(v); out[k * 3 + 1] = p.getY(v); out[k * 3 + 2] = p.getZ(v); }
    return out;
  };
  const bucket = (x, z, dbl) => {
    const key = Math.floor(x / SHADOW_CELL) * 4096 + Math.floor(z / SHADOW_CELL) + (dbl ? 0.5 : 0);
    let b = buckets.get(key); if (!b) buckets.set(key, b = { dbl, a: [] });
    return b.a;
  };
  // добавить треугольники L[from…to) с матрицей m в массив out (зеркальная матрица — обход вершин наоборот)
  const put = (out, L, from, to, m) => {
    const e = m.elements, flip = m.determinant() < 0;
    for (let t = from; t < to; t += 9) for (let k = 0; k < 3; k++) {
      const o = t + (flip ? 2 - k : k) * 3, x = L[o], y = L[o + 1], z = L[o + 2];
      out.push(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]);
    }
  };
  const walk = o => {
    if (o.userData.dynamic || !o.visible) return;
    const mat = o.material;
    if (o.isMesh && o.castShadow && !skip(o) && mat && !Array.isArray(mat) && !mat.transparent && !(mat.alphaTest > 0)) {
      const g = o.geometry, L = localTris(g), dbl = mat.side !== THREE.FrontSide;
      _spM.multiplyMatrices(_spInv, o.matrixWorld);
      if (o.isInstancedMesh) {
        if (!g.boundingSphere) g.computeBoundingSphere();
        for (let i = 0; i < o.count; i++) {
          o.getMatrixAt(i, _spI); _spI.premultiply(_spM);
          _spC.copy(g.boundingSphere.center).applyMatrix4(_spI);
          put(bucket(_spC.x, _spC.z, dbl), L, 0, L.length, _spI);
        }
      } else {
        const e = _spM.elements;                              // склеенный меш чанка — по клеткам раскладываем треугольники
        for (let t = 0; t < L.length; t += 9) {
          const cx = (L[t] + L[t + 3] + L[t + 6]) / 3, cy = (L[t + 1] + L[t + 4] + L[t + 7]) / 3, cz = (L[t + 2] + L[t + 5] + L[t + 8]) / 3;
          put(bucket(e[0] * cx + e[4] * cy + e[8] * cz + e[12], e[2] * cx + e[6] * cy + e[10] * cz + e[14], dbl), L, t, t + 9, _spM);
        }
      }
      taken.push(o);
    }
    for (const c of o.children) walk(c);
  };
  for (const c of group.children) walk(c);
  const root = new THREE.Group(); root.visible = false;
  const mats = [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })];
  let tris = 0;
  for (const b of buckets.values()) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(b.a, 3)); geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, mats[b.dbl ? 1 : 0]); m.castShadow = true; m.receiveShadow = false;
    root.add(m); tris += b.a.length / 9;
  }
  for (const o of taken) o.castShadow = false;
  group.add(root);
  root.traverse(o => { o.matrixAutoUpdate = false; o.matrixWorldAutoUpdate = false; o.matrixWorld.copy(group.matrixWorld); });
  root.userData.stats = { from: taken.length, cells: root.children.length, tris };
  SHADOW_ONLY.push(root);
  return root;
}
// Теневая копия подвижного объекта (машина игрока — полтора десятка мешей): всё, что отбрасывает тень внутри root,
// одной геометрией в его координатах; копия едет вместе с root. Колёса в ней стоят в исходном положении — в тени
// их вращение и ход подвески не разглядеть. Убрать: dropShadowProxy().
const SHADOW_PROXY_MAT = shared(new THREE.MeshBasicMaterial());
function shadowProxyOf(root) {
  if (!QUAL.shadows) return null;
  root.updateMatrixWorld(true);
  _spInv.copy(root.matrixWorld).invert();
  const geos = [], taken = [];
  root.traverse(o => {
    if (!o.isMesh || !o.castShadow || o.isInstancedMesh || Array.isArray(o.material)) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
    g.morphAttributes = {}; g.clearGroups();
    g.applyMatrix4(_spM.multiplyMatrices(_spInv, o.matrixWorld));
    geos.push(g); taken.push(o);
  });
  const geo = geos.length ? mergeGeometries(geos) : null;
  for (const g of geos) g.dispose();
  if (!geo) return null;
  for (const o of taken) o.castShadow = false;
  const m = new THREE.Mesh(geo, SHADOW_PROXY_MAT); m.castShadow = true; m.receiveShadow = false; m.visible = false;
  root.add(m); SHADOW_ONLY.push(m);
  return m;
}
function dropShadowProxy(m) { const i = SHADOW_ONLY.indexOf(m); if (i >= 0) SHADOW_ONLY.splice(i, 1); }

const _cm = new THREE.Matrix4(), _cq = new THREE.Quaternion(), _cv = new THREE.Vector3(), _cs = new THREE.Vector3();
function setInstQ(m, i, pos, quat, sx, sy, sz) { _cm.compose(pos, quat, _cs.set(sx, sy, sz)); m.setMatrixAt(i, _cm); }

/* =====================================================================
   НАСТИЛЫ: мосты, трамплины, эстакады
   ===================================================================== */
// Плита задаётся осевой линией верхней грани p0 → p1 ([x, y, z]), шириной w и толщиной t.
// Клин — сплошной трамплин от земли (p0) до кромки (p1). walk = false — ограждение (не поверхность для езды).
// Rapier строит из них коллайдеры, а world.surface() отдаёт высоту настила для респауна и следов шин.
class Decks {
  constructor() { this.list = []; this.grid = new StaticGrid(16); }
  _base(p0, p1, w, o) {
    const [x0, y0, z0] = p0, [x1, y1, z1] = p1;
    const dx = x1 - x0, dz = z1 - z0, dy = y1 - y0, Lh = Math.hypot(dx, dz), L = Math.hypot(Lh, dy);
    const d = { p0, p1, w, dirx: dx / Lh, dirz: dz / Lh, Lh, L, dy, walk: o.walk !== false, mat: o.mat || 'deck', hidden: !!o.hidden };
    d.yaw = Math.atan2(d.dirx, d.dirz); d.pitch = -Math.atan2(dy, Lh);
    d.quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(d.pitch, d.yaw, 0, 'YXZ'));
    const nx = d.dirz * w / 2, nz = -d.dirx * w / 2;
    const xs = [x0 + nx, x0 - nx, x1 + nx, x1 - nx], zs = [z0 + nz, z0 - nz, z1 + nz, z1 - nz];
    this.grid.insert(d, Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs));
    this.list.push(d);
    return d;
  }
  slab(p0, p1, w, t, o = {}) {
    const d = this._base(p0, p1, w, o);
    d.shape = 'slab'; d.t = t; d.half = [w / 2, t / 2, d.L / 2];
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(d.quat);
    d.center = new THREE.Vector3((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2).addScaledVector(up, -t / 2);
    return d;
  }
  // клин: низ на уровне base (по умолчанию чуть ниже начала), верх — от p0 до p1
  wedge(p0, p1, w, base = Math.min(p0[1], p1[1]) - 0.4, o = {}) {
    const d = this._base(p0, p1, w, o);
    d.shape = 'wedge';
    const nx = d.dirz * w / 2, nz = -d.dirx * w / 2, P = [];
    for (const [p, top] of [[p0, p0[1]], [p1, p1[1]]]) for (const s of [1, -1]) {
      P.push(p[0] + nx * s, top, p[2] + nz * s);
      P.push(p[0] + nx * s, base, p[2] + nz * s);
    }
    d.points = new Float32Array(P); d.base = base;
    return d;
  }
  // высота верхней грани настила в точке (или -Infinity, если точка не на нём). Допуск 0,1 м по длине: плиты
  // моста на изгибе стыкуются по хорде, и на внешней стороне стыка остаётся щель — точка в ней «проваливалась» к земле
  top(d, x, z) {
    const rx = x - d.p0[0], rz = z - d.p0[2], s = rx * d.dirx + rz * d.dirz, lat = rx * d.dirz - rz * d.dirx;
    if (s < -0.1 || s > d.Lh + 0.1 || Math.abs(lat) > d.w / 2) return -Infinity;
    return d.p0[1] + d.dy * clamp(s, 0, d.Lh) / d.Lh;
  }
  // самая высокая поверхность для езды не выше y + 0.6
  surface(x, z, y = Infinity) {
    let best = -Infinity;
    for (const d of this.grid.query(x, x, z, z)) {
      if (!d.walk) continue;
      const h = this.top(d, x, z);
      if (h > best && h <= y + 0.6) best = h;
    }
    return best;
  }
  // визуал: плиты — InstancedMesh по материалам, клинья — общая геометрия
  build(group, mats) {
    const unit = new THREE.BoxGeometry(1, 1, 1);
    const byMat = {};
    for (const d of this.list) if (d.shape === 'slab' && !d.hidden) (byMat[d.mat] = byMat[d.mat] || []).push(d);
    for (const [k, arr] of Object.entries(byMat))
      instChunks(group, unit, mats[k] || mats.deck, arr, d => [d.center.x, d.center.z], (m, i, d) => setInstQ(m, i, d.center, d.quat, d.w, d.t, d.L));
    // клинья: одна геометрия на материал (трамплины парка, пандусы эстакады)
    const wedgesByMat = {};
    for (const d of this.list) if (d.shape === 'wedge' && !d.hidden) (wedgesByMat[d.mat] = wedgesByMat[d.mat] || []).push(d);
    for (const [mk, wedges] of Object.entries(wedgesByMat)) {
      const pos = [];
      // вершины клина: 0..3 — начало (верх/низ, сторона +/-), 4..7 — конец
      const F = [[0, 4, 6], [0, 6, 2], [4, 5, 7], [4, 7, 6], [0, 1, 5], [0, 5, 4], [2, 6, 7], [2, 7, 3], [0, 2, 3], [0, 3, 1], [1, 3, 7], [1, 7, 5]];
      const V = (P, i) => new THREE.Vector3(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
      for (const d of wedges) {
        const c = new THREE.Vector3(); for (let i = 0; i < 8; i++) c.add(V(d.points, i)); c.multiplyScalar(1 / 8);
        for (let [a, b, k] of F) {
          const A = V(d.points, a), B = V(d.points, b), C = V(d.points, k);
          // разворачиваем треугольник наружу от центра клина
          const n = e1.subVectors(B, A).cross(e2.subVectors(C, A));
          if (n.dot(e2.copy(A).add(B).add(C).multiplyScalar(1 / 3).sub(c)) < 0) [b, k] = [k, b];
          for (const v of [a, b, k]) pos.push(d.points[v * 3], d.points[v * 3 + 1], d.points[v * 3 + 2]);
        }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, mats[mk] || mats.wedge || mats.deck); mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
    }
  }
}
