// Физика на Rapier: класс Car, cars, stepWorld, readInput, FIXED, accum, simTime.
// Движение считает 3D-движок Rapier с raycast-подвеской. Библиотека загружается в index.html и лежит в window.RAPIER.
// Определяет: GRAV, RT, simTime, PH, qrot, GROUND_GROUPS, TRAFFIC_DRIVEN_GROUPS, ALL_GROUPS, buildPhysics,
//   resetPhysicsObjects, ensurePhysics, surfaceAt, Car, cars, BRK_FX, breakAgents, knockBreakables, DMG_SCALE,
//   FLIP_DV, FRONT_DMG, FLIP_LIE, FLIP_WINDOW, PUSH, hitZone, flipKick, contactPoint, rivalKnock, pushContacts,
//   handleContacts, NO_INPUT, readInput, FIXED, accum, brkTick, stepWorld.
// Использует: derive, PLAYER_COLORS, LIN_DAMP, NITRO, HANDLING, FLIP_REWARD, KO_REWARD (js/data.js); QUAL, MAT, lerp,
//   clamp, rand (js/core.js); buildCarModel, disposeTree (js/car-models.js); scene, shadowProxyOf, smooth01,
//   waterLevel, dropShadowProxy (js/world.js); world (js/maps/registry.js); smoke, sparks, wheelFx (js/effects.js);
//   CarFx (js/carfx.js); Sound (js/audio.js); Traffic (js/traffic/traffic.js); countdown (js/match.js); addCoins,
//   notify, keys (js/ui.js); Feel (js/feel.js); Stunts (js/stunts.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.

/* =====================================================================
   НАСТРОЙКИ RAPIER-ФИЗИКИ
   ===================================================================== */
const GRAV = 14;                // «аркадная» гравитация, м/с²
const RT = {
  hfStep: 2,                    // шаг сетки высот рельефа, м
  restLen: [0.26, 0.38],        // длина хода подвески: [низкие машины, высокие]
  sagFrac: 0.38,                // доля хода, на которую машина проседает в покое (задаёт жёсткость)
  dampComp: 0.45,               // демпфирование сжатия (доля от критического)
  dampRelax: 0.65,              // демпфирование отбоя
  gripScale: 1.0,               // множитель сцепления шин относительно «Управления»
  frontGrip: 1.05,              // перед держит чуть лучше зада → лёгкая недостаточная поворачиваемость
  sideStiff: 1.0,               // жёсткость бокового трения шин
  rearDrive: 0.7,               // доля тяги на заднюю ось (остальное — на переднюю)
  rollRes: 1.8,                 // качение накатом, м/с²
  airDrag: 0.002,               // аэродинамика накатом, 1/м (на 250 км/ч сброс газа тормозит ≈ 1 g)
  comY: 0.25,                   // высота центра масс в радиусах колеса: почти у земли, иначе при аркадном
                                // сцеплении (до 2g) машины опрокидываются в каждом повороте
  rollInertia: 1.6,             // запас инерции по крену — меньше опрокидываний
  airDamp: 1.2,                 // гашение вращения по крену/тангажу в полёте, 1/с
  uprightTime: 2.5,             // через сколько секунд перевёрнутая машина сама встанет на колёса
  staticFriction: 0.35,         // трение кузова о стены, деревья и другие машины
  restitution: 0.15,
  dmgThreshold: 0.6,            // Δv за шаг (м/с), с которой контакт считается ударом
};

let simTime = 0;
const _q = new THREE.Quaternion(), _v = new THREE.Vector3();

/* =====================================================================
   МИР RAPIER: рельеф, стены, статические препятствия
   ===================================================================== */
const PH = { rw: null, events: null, map: null, info: new Map(), brk: [], barrels: [] };

// поворот вектора кватернионом Rapier ({x,y,z,w})
function qrot(q, x, y, z) {
  const tx = 2 * (q.y * z - q.z * y), ty = 2 * (q.z * x - q.x * z), tz = 2 * (q.x * y - q.y * x);
  return [x + q.w * tx + (q.y * tz - q.z * ty), y + q.w * ty + (q.z * tx - q.x * tz), z + q.w * tz + (q.x * ty - q.y * tx)];
}

// Группы столкновений Rapier: (членство << 16) | фильтр. Рельеф — в группе 2. Машины трафика, пока ими управляет
// бот, не сталкиваются с рельефом: высоту им задаёт водитель (js/traffic.js). Контакт «кузов — карта высот» —
// самая дорогая часть физики, а бот на дороге и так едет по поверхности. Разбитая машина снова падает на землю.
const GROUND_GROUPS = 0x0002ffff, TRAFFIC_DRIVEN_GROUPS = 0x0001fffd, ALL_GROUPS = 0xffffffff;
function buildPhysics() {
  if (PH.rw) { PH.rw.free(); PH.events.free(); }
  const R = RAPIER, rw = new R.World({ x: 0, y: -GRAV, z: 0 });
  rw.timestep = FIXED;
  // World.step() этой сборки Rapier после каждого шага вызывает mapNewSoftBodies(): перебор всех ~10 000 коллайдеров
  // в поисках новых (≈0,8 мс на шаг — втрое дольше самой физики). Тела и коллайдеры у нас появляются и исчезают
  // только при старте заезда, поэтому перебор нужен, лишь когда их число изменилось.
  if (typeof rw.mapNewSoftBodies === 'function') {
    const mapAll = rw.mapNewSoftBodies.bind(rw);
    let nb = -1, nc = -1;
    rw.mapNewSoftBodies = () => {
      const b = rw.bodies.len(), c = rw.colliders.len();
      if (b !== nb || c !== nc) { nb = b; nc = c; mapAll(); }
    };
  }
  PH.rw = rw; PH.events = new R.EventQueue(true); PH.map = world;
  PH.info = new Map(); PH.brk = []; PH.barrels = [];
  const fixed = rw.createRigidBody(R.RigidBodyDesc.fixed());
  const addStatic = (desc, kind = 'static') => {
    const c = rw.createCollider(desc.setFriction(RT.staticFriction).setRestitution(RT.restitution), fixed);
    PH.info.set(c.handle, { kind });
    return c;
  };

  // рельеф: карта высот, снятая с world.ground() (Rapier: строки — Z, столбцы — X, хранение по столбцам).
  // Карта может быть прямоугольной: world.boundsX / world.boundsZ (по умолчанию обе — world.bounds).
  const BX = world.boundsX ?? world.bounds, BZ = world.boundsZ ?? world.bounds, st = world.hfStep || RT.hfStep;
  const nx = Math.ceil(2 * (BX + 12) / st), nz = Math.ceil(2 * (BZ + 12) / st), Nx = nx + 1, Nz = nz + 1, sx = nx * st, sz = nz * st;
  const hs = new Float32Array(Nx * Nz);
  for (let xi = 0; xi < Nx; xi++) for (let zi = 0; zi < Nz; zi++)
    hs[zi + xi * Nz] = world.ground(-sx / 2 + xi * st, -sz / 2 + zi * st);
  const ground = addStatic(R.ColliderDesc.heightfield(nz, nx, hs, { x: sx, y: 1, z: sz }, R.HeightFieldFlags.FIX_INTERNAL_EDGES), 'ground');
  ground.setFriction(0.8);
  ground.setCollisionGroups(GROUND_GROUPS);

  // настилы (мосты, трамплины, эстакады): наклонные плиты и клинья поверх рельефа
  if (world.decks) for (const d of world.decks.list) {
    const kind = d.walk ? 'deck' : 'static';
    if (d.shape === 'wedge') addStatic(R.ColliderDesc.convexHull(d.points), kind);
    else addStatic(R.ColliderDesc.cuboid(d.half[0], d.half[1], d.half[2])
      .setTranslation(d.center.x, d.center.y, d.center.z).setRotation({ x: d.quat.x, y: d.quat.y, z: d.quat.z, w: d.quat.w }), kind);
  }

  // сетки треугольников карты (тротуары с бордюрами «Ситжеса»): { v: Float32Array xyz, i: Uint32Array }
  if (world.meshColliders) for (const m of world.meshColliders) addStatic(R.ColliderDesc.trimesh(m.v, m.i), 'deck');

  // невидимые стены по краю карты
  for (const [x, z, hx, hz] of [[BX + 2, 0, 2, BZ + 4], [-BX - 2, 0, 2, BZ + 4], [0, BZ + 2, BX + 4, 2], [0, -BZ - 2, BX + 4, 2]])
    addStatic(R.ColliderDesc.cuboid(hx, 120, hz).setTranslation(x, 0, z));

  // препятствия из сетки коллизий карты: коробки — кубоиды, круги — цилиндры от земли до высоты h
  const seen = new Set();
  for (const cell of world.grid.cells.values()) for (const o of cell) {
    if (seen.has(o)) continue; seen.add(o);
    if (o.poly) {
      // контур здания (реальная карта): выпуклый — выпуклая оболочка призмы; невыпуклый — призма из треугольников
      // (стены и обе крышки). Начало коллайдера — в первой вершине: float32 на краю карты в 2 км точнее.
      // Высоты низа и крыши — o.y0 / o.y1, если карта их задала (как у меша), иначе от земли под контуром
      const P = o.poly, n = P.length, gs = o.y1 === undefined ? P.map(([x, z]) => world.ground(x, z)) : null;
      const [ox, oz] = P[0], y0 = gs ? Math.min(...gs) - 1.5 : o.y0, y1 = gs ? Math.max(...gs) + Math.min(o.h, 300) : o.y1;
      const v = new Float32Array(n * 6);
      P.forEach(([x, z], i) => v.set([x - ox, y0, z - oz, x - ox, y1, z - oz], i * 6));
      let convex = true;
      for (let i = 0, sg = 0; i < n && convex; i++) {
        const a = P[i], b = P[(i + 1) % n], c = P[(i + 2) % n];
        const cr = Math.sign((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]));
        if (cr) { if (sg && cr !== sg) convex = false; sg = cr; }
      }
      let desc = convex ? R.ColliderDesc.convexHull(v) : null;
      if (!desc) {
        const idx = [];
        for (let i = 0; i < n; i++) { const a = 2 * i, b = 2 * ((i + 1) % n); idx.push(a, b, b + 1, a, b + 1, a + 1); }
        for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(P.map(([x, z]) => new THREE.Vector2(x, z)), []))
          idx.push(2 * i + 1, 2 * j + 1, 2 * k + 1, 2 * i, 2 * k, 2 * j);
        desc = R.ColliderDesc.trimesh(v, new Uint32Array(idx));
      }
      addStatic(desc.setTranslation(ox, 0, oz));
    } else if (o.obb) {
      // повёрнутый прямоугольник (дома деревни на побережье): кубоид, повёрнутый вокруг вертикали
      const { x, z, w, d, rot } = o.obb, c = Math.cos(rot), s = Math.sin(rot);
      const gs = [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([a, b]) => world.ground(x + a * w / 2 * c + b * d / 2 * s, z - a * w / 2 * s + b * d / 2 * c));
      const y0 = Math.min(...gs) - 1.5, y1 = world.ground(x, z) + Math.min(o.h, 300);
      addStatic(R.ColliderDesc.cuboid(w / 2, (y1 - y0) / 2, d / 2).setTranslation(x, (y0 + y1) / 2, z).setRotation({ x: 0, y: Math.sin(rot / 2), z: 0, w: Math.cos(rot / 2) }));
    } else if (o.box) {
      const cx = (o.minX + o.maxX) / 2, cz = (o.minZ + o.maxZ) / 2;
      const gs = [world.ground(o.minX, o.minZ), world.ground(o.maxX, o.minZ), world.ground(o.minX, o.maxZ), world.ground(o.maxX, o.maxZ), world.ground(cx, cz)];
      const y0 = Math.min(...gs) - 1.5, y1 = world.ground(cx, cz) + Math.min(o.h, 300);
      addStatic(R.ColliderDesc.cuboid((o.maxX - o.minX) / 2, (y1 - y0) / 2, (o.maxZ - o.minZ) / 2).setTranslation(cx, (y0 + y1) / 2, cz));
    } else if (!o.brk && Math.abs(o.h / o.r - 1.4 / 0.95) < 0.01) {
      // валун лесной карты (в сетке он записан кругом r = 0.95·s, h = 1.4·s): выпуклый эллипсоид,
      // через мелкие камни можно переехать, крупные работают как стена
      const s = o.r / 0.95, cy = world.ground(o.x, o.z) - 0.25 * s, pts = [];
      for (let i = 0; i <= 6; i++) for (let j = 0; j < 10; j++) {
        const th = Math.PI * i / 6, ph = Math.PI * 2 * j / 10;
        pts.push(Math.sin(th) * Math.cos(ph) * 1.1 * s, Math.cos(th) * 0.85 * s, Math.sin(th) * Math.sin(ph) * 1.1 * s);
      }
      addStatic(R.ColliderDesc.convexHull(new Float32Array(pts)).setTranslation(o.x, cy, o.z));
    } else {
      const g = world.ground(o.x, o.z), y0 = g - 1.5, y1 = g + Math.min(o.h, 300);
      const c = addStatic(R.ColliderDesc.cylinder((y1 - y0) / 2, o.r).setTranslation(o.x, (y0 + y1) / 2, o.z), o.brk ? 'brk' : 'static');
      if (o.brk) { o.col = c; PH.brk.push({ o, c }); c.setEnabled(!o.brk.broken); }
    }
  }

  // бочки: лёгкие динамические цилиндры, которые не опрокидываются (как в 2D-версии)
  for (const b of world.barrels) {
    const body = rw.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(b.x, world.ground(b.x, b.z) + 0.5, b.z)
      .enabledRotations(false, true, false).setLinearDamping(0.6).setAngularDamping(1.5));
    const c = rw.createCollider(R.ColliderDesc.cylinder(0.5, b.r).setMass(1 / b.invMass).setFriction(0.3).setRestitution(0.3), body);
    PH.info.set(c.handle, { kind: 'barrel', b });
    PH.barrels.push({ b, body });
  }

  // world.reset() (новый заезд) должен возвращать и тела Rapier
  if (!world.__rapierReset) {
    const w = world, orig = w.reset;
    w.reset = function () { if (orig) orig.call(this); if (PH.map === w) resetPhysicsObjects(); };
    w.__rapierReset = true;
  }
}
function resetPhysicsObjects() {
  for (const { o, c } of PH.brk) c.setEnabled(!o.brk.broken);
  for (const { b, body } of PH.barrels) {
    body.setTranslation({ x: b.x, y: world.ground(b.x, b.z) + 0.5, z: b.z }, true);
    body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true); body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }
}
function ensurePhysics() { if (PH.map !== world) buildPhysics(); }
// высота поверхности под точкой: рельеф или настил (мост, трамплин), не выше y
const surfaceAt = (x, z, y = Infinity) => world.surface ? world.surface(x, z, y) : world.ground(x, z);

/* =====================================================================
   МАШИНА
   ===================================================================== */
class Car {
  constructor(def, p) {
    ensurePhysics();
    this.def = def; this.p = p; this.isCar = true;
    Object.assign(this, derive(def.stats));
    const g = def.geo, R = RAPIER, rw = PH.rw, m = this.mass;
    this.L = g.L; this.W = g.W; this.H = g.H; this.wb = g.axF - g.axR; this.g = g;
    this.cr = g.W / 2;
    const span = g.L - g.W; this.cOff = [-span / 2, 0, span / 2];
    this.model = buildCarModel(def, def.paints[p], { lacquer: QUAL.lacquer, bumpers: true });   // лак (кроме «Минимума») и отрываемые бамперы
    scene.add(this.model.root);
    // свои задние фонари: стоп-сигналы разгораются при торможении (общий MAT.tail — у трафика)
    this.tailMat = MAT.tail.clone(); this.tailMat.userData = {};
    this.model.root.traverse(o => { if (o.material === MAT.tail) o.material = this.tailMat; });
    this.fx = new CarFx(this);             // фонари заднего хода, ореолы, след фонарей, бамперы (js/carfx.js)
    const mk = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.75, 4), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[p] }));
    mk.rotation.x = Math.PI; mk.layers.set(p + 1); this.model.root.add(mk); this.marker = mk;
    this.shadowProxy = shadowProxyOf(this.model.root);   // тень машины — одним мешем вместо полутора десятков (js/world.js)

    // кузов: начало координат тела совпадает с началом модели (уровень земли под колёсами)
    this.body = rw.createRigidBody(R.RigidBodyDesc.dynamic().setCcdEnabled(true).setAngularDamping(0.3).setLinearDamping(LIN_DAMP).setCanSleep(false));
    // низ коллайдера — не ниже осей колёс: низкие машины не садятся «на брюхо» на гребнях рельефа
    const rAvg = (g.rF + g.rR) / 2, by = Math.max(g.bottomY, rAvg * 0.95), top = g.H * 0.92, hh = (top - by) / 2, hb = top - by;
    const I = [m / 12 * (hb * hb + g.L * g.L), m / 12 * (g.W * g.W + g.L * g.L), m / 12 * (g.W * g.W + hb * hb) * RT.rollInertia];
    this.collider = rw.createCollider(R.ColliderDesc.roundCuboid(g.W / 2 - 0.05, hh - 0.05, g.L / 2 - 0.05, 0.05).setTranslation(0, by + hh, 0)
      .setMassProperties(m, { x: 0, y: rAvg * RT.comY - (by + hh), z: 0 }, { x: I[0], y: I[1], z: I[2] }, { x: 0, y: 0, z: 0, w: 1 })
      .setFriction(RT.staticFriction).setRestitution(RT.restitution)
      .setActiveEvents(R.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(m * RT.dmgThreshold / FIXED), this.body);
    PH.info.set(this.collider.handle, { kind: 'car', car: this });

    // колёса: лучи подвески из точек крепления вниз
    const v = this.veh = rw.createVehicleController(this.body);
    v.indexUpAxis = 1; v.setIndexForwardAxis = 2;
    const rest = lerp(RT.restLen[0], RT.restLen[1], clamp((g.bottomY - 0.16) / 0.4, 0, 1));
    const sag = rest * RT.sagFrac, k = GRAV / (4 * sag);
    this.rest = rest; this.sag = sag;
    this.wheels = [];
    for (const [axZ, r, front] of [[g.axF, g.rF, true], [g.axR, g.rR, false]]) for (const side of [1, -1]) {
      const i = this.wheels.length, connY = r + rest - sag;   // в покое колесо стоит там же, где на модели
      v.addWheel({ x: side * g.track, y: connY, z: axZ }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, rest, r);
      v.setWheelSuspensionStiffness(i, k);
      v.setWheelSuspensionCompression(i, RT.dampComp * 2 * Math.sqrt(k) / 2);
      v.setWheelSuspensionRelaxation(i, RT.dampRelax * 2 * Math.sqrt(k) / 2);
      v.setWheelMaxSuspensionTravel(i, rest);
      v.setWheelMaxSuspensionForce(i, m * GRAV * 8);
      v.setWheelSideFrictionStiffness(i, RT.sideStiff);
      this.wheels.push({ front, r, connY, side, z: axZ, contact: false });
    }
    this.baseGrip = this.grip / GRAV * RT.gripScale;     // «Управление» → коэффициент трения шин
    this.speedMul = 1; this.markerLift = 0;
  }

  // поставить машину в точку (без ремонта)
  place(x, z, h, yHint = Infinity) {
    const R = RAPIER, b = this.body;
    if (b.bodyType() !== R.RigidBodyType.Dynamic) b.setBodyType(R.RigidBodyType.Dynamic, true);
    b.setLinearDamping(LIN_DAMP); b.setAngularDamping(0.3);
    let gy = -1e9;
    for (const wl of this.wheels) { const [wx, wz] = this.local(wl.side * this.g.track, wl.z, h, x, z); gy = Math.max(gy, surfaceAt(wx, wz, yHint)); }
    b.setTranslation({ x, y: gy + 0.08, z }, true);
    b.setRotation({ x: 0, y: Math.sin(h / 2), z: 0, w: Math.cos(h / 2) }, true);
    b.setLinvel({ x: 0, y: 0, z: 0 }, true); b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.x = x; this.z = z; this.h = h; this.y = gy + 0.08;
    this.vx = this.vz = this.vy = this.w = 0; this.vf = this.vl = 0; this.steer = 0; this.thr = 0; this.hb = false;
    this.grounded = true; this.contacts = 4; this.upY = 1; this.flipT = 0; this.airVy = 0;
    this.drown = 0; this.skidPrev = [null, null];
    this.placeN = (this.placeN || 0) + 1;     // счётчик переносов: прыжок, прерванный переносом, не считается (js/jumps.js)
    this.touchT = this.shoveT = this.dazeT = this.knockCd = 0;
    this.touchAt = -1;                        // когда последний раз касалась соперника (simTime): передача бомбы, js/bomb.js
  }
  fullReset(x, z, h) {
    this.place(x, z, h);
    this.hp = this.maxHp; this.broken = 0;
    this.nitro = NITRO.start; this.boosting = false; this.hitTime = -9;
    this.hitDv = 0; this.hitDvFront = 0; this.flipPaid = false; this.hitX = x; this.hitZ = z; this.lastHitBy = null; this.lastHitTime = -9;
    this.shake = 0; this.smokeAcc = 0;
    this.markerLift = 0;                      // метка над машиной выше (над горячей бомбой, js/bomb.js)
    this.speedMul = 1;                        // множитель разгона и максималки (у кого горячая бомба — больше, js/bomb.js)
  }
  // вернуть на ближайшую дорогу
  toRoad() {
    let [x, z, h] = world.roadPoint(this.x, this.z, this.p);
    const o = cars[1 - this.p];
    if (o && Math.hypot(o.x - x, o.z - z) < 5) { x += Math.sin(h) * 9; z += Math.cos(h) * 9; }
    this.place(x, z, h, this.y + 1.5);       // на своём уровне: под эстакадой — на землю, на ней — на настил
  }
  // Мелкая вода (брод): глубина d под машиной меньше той, на которой она тонет. Вода тормозит машину (сильнее на
  // скорости) и разлетается брызгами от передних колёс. Только на картах с уровнем воды по месту (world.waterAt).
  wade(dt, d) {
    this.wadeD = d > 0.04 ? d : 0;
    const spd = Math.hypot(this.vx, this.vz);
    if (!this.wadeD || spd < 0.5) return;
    const k = Math.min(1, d / 0.3), dv = Math.min(spd, k * (1.5 + 0.022 * spd * spd) * dt), lv = this.body.linvel();
    this.body.setLinvel({ x: lv.x - this.vx / spd * dv, y: lv.y, z: lv.z - this.vz / spd * dv }, true);
    this.sprayAcc = (this.sprayAcc || 0) + dt * Math.min(60, spd * 3) * k * QUAL.fx;
    for (; this.sprayAcc > 1; this.sprayAcc--) {
      const side = Math.random() < 0.5 ? -1 : 1, [x, z] = this.local(side * this.W * 0.5, this.L * 0.38), s = Math.sin(this.h), c = Math.cos(this.h);
      const out = rand(1, 3) + spd * 0.12;               // веер воды в стороны и вперёд
      smoke.spawn(x, this.y - 0.2, z, this.vx * 0.55 + c * side * out, rand(2, 4) + spd * 0.08, this.vz * 0.55 - s * side * out,
        0.4, rand(1.6, 2.6), rand(0.5, 0.9), 0xeaf4ff, 0.55, 9);
    }
  }
  circle(i) { const o = this.cOff[i]; return [this.x + Math.sin(this.h) * o, this.z + Math.cos(this.h) * o]; }
  local(lx, lz, h = this.h, x = this.x, z = this.z) { const s = Math.sin(h), c = Math.cos(h); return [x + c * lx + s * lz, z - s * lx + c * lz]; }

  // управление до шага Rapier: руль, газ/тормоз, ручник, ассистент стабилизации
  control(dt, inp) {
    const v = this.veh, H = HANDLING, m = this.mass;
    if (this.drown > 0) {
      // тонущая машина — кинематическое тело, плавно погружается к уровню под водой
      const p = this.body.translation();
      this.body.setNextKinematicTranslation({ x: p.x, y: p.y + (this.drownW - 1.1 - p.y) * Math.min(1, dt * 1.2), z: p.z });
      return;
    }
    const vf = this.vf, spd = Math.abs(vf), sgn = vf >= 0 ? 1 : -1;
    const thr = (inp.up ? 1 : 0) - (inp.down ? 1 : 0), sIn = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    this.thr = thr; this.hb = inp.hb && this.grounded;
    const sRate = sIn === 0 || Math.sign(sIn) !== Math.sign(this.steer) ? H.steerReturn : H.steerIn;
    this.steer += (sIn - this.steer) * Math.min(1, dt * sRate);

    // угол колёс: на скорости меньше, для контррулёжки в заносе — полный
    const bodySlip = Math.atan2(Math.abs(this.vl), Math.max(spd, 0.5));
    const speedLock = H.lock / (1 + spd / H.lockSpeed);
    const counter = sgn > 0 && Math.abs(this.vl) > 0.5 && Math.sign(-this.steer) === Math.sign(this.vl);
    const maxSteer = counter ? lerp(speedLock, H.lock, smooth01(bodySlip / 0.45)) : speedLock;
    const delta = -this.steer * maxSteer;                  // >0 — колёса влево (+X)
    this.delta = delta;

    // нитро: пока держат кнопку и газ, шкала тратится, разгон и максималка выше
    this.boosting = !!inp.nitro && thr > 0 && this.nitro > (this.boosting ? 0 : NITRO.minStart);
    if (this.boosting) this.nitro = Math.max(0, this.nitro - dt / NITRO.dur);
    const nb = this.boosting ? 1 : 0;
    // тяга и тормоза
    const bf = (this.broken > 0 ? 0.7 : 1) * this.speedMul, maxS = this.maxSpeed * bf * (1 + NITRO.top * nb), acc = this.accel * H.accelMul * bf * (1 + NITRO.accel * nb);
    let drive = 0, brake = 0;
    if (thr > 0) {
      if (vf < -0.5) brake = H.brake;
      else if (vf < maxS) drive = acc * (1 - 0.55 * Math.max(0, vf) / maxS);
      else brake = RT.rollRes + RT.airDrag * vf * vf;      // быстрее максималки (после нитро) — сопротивление воздуха
    } else if (thr < 0) {
      if (vf > 0.5) brake = H.brake;
      else if (vf > -maxS * 0.4) drive = -acc * 0.6;
    } else brake = spd < 1 && !(this.touchT > 0) ? H.brake : RT.rollRes + RT.airDrag * vf * vf;   // почти стоим — держим на месте (если не толкают)
    // толкотня (PUSH): машину толкают в борт или корму — тормоз слабее, на малой скорости шины почти не держат
    const shoved = this.shoveT > 0;
    if (shoved) brake = Math.min(brake, PUSH.brake);
    const bImp = m * brake * dt / 4;                        // тормоз в Rapier — предельный импульс за шаг на колесо
    // боковое трение шин (жёсткость: какую долю бокового скольжения шина гасит за шаг) — тягу вперёд не трогает,
    // поэтому зажатая в борт машина может уехать газом
    const side = RT.sideStiff * (shoved ? lerp(PUSH.side, 1, smooth01((Math.hypot(vf, this.vl) - PUSH.sideSpd[0]) / (PUSH.sideSpd[1] - PUSH.sideSpd[0]))) : 1);
    const sideChanged = side !== this.sideK; this.sideK = side;
    const grip = this.baseGrip * (this.broken > 0 ? 0.9 : 1);
    for (let i = 0; i < 4; i++) {
      const wl = this.wheels[i], rearHb = !wl.front && this.hb;
      v.setWheelSteering(i, wl.front ? delta : 0);
      v.setWheelEngineForce(i, drive === 0 ? 0 : m * drive * (wl.front ? 1 - RT.rearDrive : RT.rearDrive) / 2);
      v.setWheelBrake(i, drive !== 0 && !rearHb ? 0 : rearHb ? Math.max(bImp, m * H.hbDecel * dt / 2) : bImp);
      v.setWheelFrictionSlip(i, grip * (wl.front ? RT.frontGrip : rearHb ? H.hbRearGrip : 1));
      if (sideChanged) v.setWheelSideFrictionStiffness(i, side);
    }

    // ассистент стабилизации: тянет рыскание к «поворот без скольжения», не круче предела сцепления
    const b = this.body, av = b.angvel();
    if (this.contacts >= 2 && !this.hb && spd > 1) {
      const wKin = vf * Math.tan(delta) / this.wb;
      const wGrip = this.grip * H.assistGrip / Math.max(spd, 1);
      // после удара соперника и пока толкают — ассистент слабеет: машину можно развернуть ударом в угол
      const k = Math.min(1, dt * (H.assist + this.stability * H.assistPerStab)) * (shoved || this.dazeT > 0 ? PUSH.assist : 1);
      av.y += (clamp(wKin, -wGrip, wGrip) - av.y) * k;
    }
    // в полёте гасим кувырки — машина чаще приземляется на колёса (но не сразу после удара-опрокидывания)
    if (this.contacts === 0 && !(this.tumble > 0)) { const d = Math.exp(-RT.airDamp * dt); av.x *= d; av.z *= d; }
    b.setAngvel(av, true);
    v.updateVehicle(dt);
  }

  // считать состояние после шага Rapier в поля, которыми пользуются камера, HUD, звук и эффекты
  sync(dt) {
    const b = this.body, t = b.translation(), q = b.rotation(), lv = b.linvel();
    this.x = t.x; this.y = t.y; this.z = t.z;
    const [fx, , fz] = qrot(q, 0, 0, 1);
    this.h = Math.atan2(fx, fz);
    this.upY = qrot(q, 0, 1, 0)[1];
    const s = Math.sin(this.h), c = Math.cos(this.h);
    this.vx = lv.x; this.vz = lv.z;
    const prevVy = this.vy; this.vy = lv.y;
    this.vf = lv.x * s + lv.z * c; this.vl = lv.x * c - lv.z * s;
    this.w = b.angvel().y;
    let n = 0; for (let i = 0; i < 4; i++) { const on = this.veh.wheelIsInContact(i); this.wheels[i].contact = on; if (on) n++; }
    const wasAir = !this.grounded;
    this.contacts = this.drown > 0 ? 4 : n;
    this.grounded = this.contacts > 0;
    if (!this.grounded) this.airVy = Math.min(this.airVy, prevVy);
    else if (wasAir) {                                     // приземление
      const impact = -this.airVy;
      if (impact > 6) { this.shake = Math.min(1, this.shake + impact / 25); this.hitX = this.x; this.hitZ = this.z; Sound.land(this.p, impact); }
      if (impact > 13) this.hitDv += (impact - 13) * 0.7 + 2.5;
      this.airVy = 0;
    }
    // перевёрнутая машина сама встаёт на колёса
    if (this.drown <= 0 && this.upY < 0.35 && Math.hypot(lv.x, lv.y, lv.z) < 3) this.flipT += dt; else this.flipT = 0;
    // бонус за переворот: машина легла на бок или крышу вскоре после удара соперника — ему FLIP_REWARD.
    // Один раз за переворот: flipPaid сбрасывается, только когда машина снова стоит на колёсах
    if (this.upY > 0.8) this.flipPaid = false;
    if (this.flipT > FLIP_LIE && !this.flipPaid) {
      this.flipPaid = true;
      const att = this.lastHitBy;
      if (att && simTime - this.lastHitTime < FLIP_WINDOW) {
        addCoins(att.p, FLIP_REWARD); notify(att.p, `ПЕРЕВОРОТ! +${FLIP_REWARD}`, 'gold', true); Sound.coin(att.p);
      }
    }
    if (this.flipT > RT.uprightTime) {
      this.place(this.x, this.z, this.h, this.y + 1.5);
      notify(this.p, 'Машина поставлена на колёса', 'good');
    }
  }

  // dir — направление силы удара (необязательно, см. hitZone())
  registerHit(dv, other, px, pz, dir) {
    this.hitDv += dv;
    if (hitZone(this.body, px, pz, this.W / 2, this.L / 2, dir) === 'front') this.hitDvFront += dv;   // удар передом — урон меньше
    if (dv > 1) this.hitTime = simTime;              // для трюков: удар обрывает занос и «впритирку»
    if (dv > 0.6) { this.hitX = px; this.hitZ = pz; }
    if (other && other.isCar && dv > 1) { this.lastHitBy = other; this.lastHitTime = simTime; }
  }

  postStep(dt) {
    if (this.flipCd > 0) this.flipCd -= dt;
    if (this.tumble > 0) this.tumble -= dt;
    if (this.touchT > 0) this.touchT -= dt;
    if (this.shoveT > 0) this.shoveT -= dt;
    if (this.dazeT > 0) this.dazeT -= dt;
    if (this.knockCd > 0) this.knockCd -= dt;
    if (this.hitDv > 2.5) {
      const strength = this.hitDv;
      Sound.impact(strength, this.p);
      for (let k = 0; k < Math.min(26, 3 + strength * 1.2); k++)
        sparks.spawn(this.hitX, this.y + rand(0.4, 1.0), this.hitZ, rand(-6, 6), rand(1, 6), rand(-6, 6), 0.35, 0.05, rand(0.25, 0.55), 0xffb040, 1, 14);
      this.shake = Math.min(1, this.shake + strength / 18);
      Feel.impact(this, strength, this.lastHitBy && simTime - this.lastHitTime < 0.1);
      if (this.drown <= 0) this.fx.hit(strength, this.hitX, this.hitZ);
      Stunts.crash(this.p);
      if (this.broken <= 0 && this.drown <= 0) {
        // доля удара, пришедшаяся в нос, получает урон ×FRONT_DMG (приземление и удары в борт/корму — полный)
        const k = 1 - (1 - FRONT_DMG) * Math.min(1, this.hitDvFront / strength);
        this.hp -= (strength - 2.5) * 2.1 * k;
        if (this.hp <= 0) {
          this.hp = 0; this.broken = 5;
          notify(this.p, 'ПОЛОМКА! −30% скорости', 'bad');
          const att = this.lastHitBy;
          if (att && simTime - this.lastHitTime < 1.0) { addCoins(att.p, KO_REWARD); notify(att.p, `НОКАУТ! +${KO_REWARD}`, 'gold', true); Sound.ko(att.p); Feel.ko(att.p, this.p); }
        }
      }
    }
    this.hitDv = this.hitDvFront = 0;
    if (this.broken > 0) {
      this.broken -= dt;
      if (this.broken <= 0) { this.broken = 0; this.hp = this.maxHp; this.fx.repair(); notify(this.p, 'Машина починена', 'good'); }
    }
    // вода: машина тонет, через 5 с возвращается на дорогу. Уровень воды может зависеть от места (река выше моря):
    // waterLevel() в js/world.js
    const wl = waterLevel(this.x, this.z);
    if (wl !== null && this.drown <= 0 && this.grounded && world.ground(this.x, this.z) < wl - 0.35 && this.y < wl) {
      this.drown = 5; this.drownW = wl;
      const R = RAPIER;
      this.body.setBodyType(R.RigidBodyType.KinematicPositionBased, true);
      Sound.splash(this.p);
      notify(this.p, 'В ВОДЕ! Возврат через 5 с', 'bad');
      for (let k = 0; k < 24; k++) smoke.spawn(this.x + rand(-1.5, 1.5), wl + 0.3, this.z + rand(-1.5, 1.5), rand(-3, 3), rand(2, 6), rand(-3, 3), 0.8, 2.6, 0.9, 0xe8f4ff, 0.8, 6);
    } else if (world.waterAt && wl !== null && this.drown <= 0 && this.grounded && this.y < wl + 1.2) this.wade(dt, wl - surfaceAt(this.x, this.z, this.y));   // на настиле над водой (понтон) — сухо
    else this.wadeD = 0;
    if (this.drown > 0) {
      this.drown -= dt;
      if (this.drown <= 0) { this.toRoad(); notify(this.p, 'Машина возвращена на дорогу', 'good'); }
    }
  }

  visual(dt) {
    const m = this.model, b = this.body, t = b.translation(), q = b.rotation();
    m.root.position.set(t.x, t.y + (this.drown > 0 ? Math.sin(simTime * 3) * 0.06 : 0), t.z);
    m.root.quaternion.set(q.x, q.y, q.z, q.w);
    // косметический крен кузова от ускорений (центр масс у земли, поэтому сама физика кузов почти не кренит)
    const acc = (this.vf - (this.prevVf ?? this.vf)) / Math.max(dt, 1e-3); this.prevVf = this.vf;
    this.roll = lerp(this.roll || 0, this.grounded ? clamp(this.vf * this.w * 0.004, -0.06, 0.06) : 0, Math.min(1, dt * 6));
    this.pitch = lerp(this.pitch || 0, this.grounded ? clamp(-acc * 0.003, -0.04, 0.04) : 0, Math.min(1, dt * 6));
    m.body.rotation.set(this.pitch, 0, this.roll);
    // стоп-сигналы: торможение или ручник; фонари заднего хода — едем назад (js/carfx.js)
    const braking = this.hb || (this.thr < 0 && this.vf > 0.5) || (this.thr > 0 && this.vf < -0.5);
    this.fx.update(dt, braking, this.thr < 0 && this.vf <= 0.5);
    for (let i = 0; i < 4; i++) {
      const wh = m.wheels[i], wl = this.wheels[i];
      const len = this.drown > 0 ? this.rest : this.veh.wheelSuspensionLength(i) ?? this.rest;
      wh.pivot.position.y = wl.connY - len;
      wh.pivot.rotation.y = wl.front ? this.veh.wheelSteering(i) || 0 : 0;
      wh.spin.rotation.x += (this.hb && !wl.front ? 0 : this.vf) * dt / wh.r;
    }
    this.marker.position.set(0, this.H + 1.1 + this.markerLift + Math.sin(performance.now() / 300) * 0.12, 0);
    this.marker.quaternion.copy(_q.copy(m.root.quaternion).invert());     // маркер всегда вертикален
    this.marker.rotateY(performance.now() / 500); this.marker.rotateX(Math.PI);

    // дым из-под капота: чем меньше прочность, тем гуще и темнее (лёгкий пар → серый дым → чёрный с искрами при поломке)
    const hpFrac = this.hp / this.maxHp;
    const rate = this.drown > 0 ? 0 : this.broken > 0 ? 16 : hpFrac < 0.3 ? 7 : hpFrac < 0.55 ? 2.5 : 0;
    this.smokeAcc += rate * dt;
    const engZ = this.g.rearEngine ? -1.4 : this.L * 0.32;      // мотор сзади (geo.rearEngine) — дым над моторным отсеком
    while (this.smokeAcc >= 1) {
      this.smokeAcc -= 1;
      const [sx, sz] = this.local(rand(-0.3, 0.3), engZ);
      const dark = this.broken > 0, light = !dark && hpFrac >= 0.3;
      smoke.spawn(sx, this.y + this.H * 0.75, sz, this.vx * 0.3 + rand(-0.4, 0.4), rand(1.2, 2.2), this.vz * 0.3 + rand(-0.4, 0.4),
        dark ? 0.7 : 0.5, dark ? 2.8 : light ? 1.5 : 2.0, dark ? 1.6 : 1.2, dark ? 0x3a3a3a : light ? 0xdedede : 0x8a8a8a, dark ? 0.5 : light ? 0.22 : 0.38);
      if (dark && Math.random() < 0.25) sparks.spawn(sx, this.y + this.H * 0.7, sz, rand(-1, 1), rand(1, 3), rand(-1, 1), 0.5, 0.1, 0.4, 0xff6a1a, 0.9, 2);
    }
    // задние колёса: следы шин (занос — на любом покрытии, колея — на траве и песке), дым шин цвета покрытия,
    // пыль, брызги (js/effects.js → wheelFx)
    const speed = Math.hypot(this.vx, this.vz);
    const skidding = speed > 3 && (Math.abs(this.vl) > 2.2 || (this.hb && Math.abs(this.vf) > 3));
    for (let k2 = 0; k2 < 2; k2++) {
      const wl = this.wheels[2 + k2];
      if (this.drown <= 0 && wl.contact) {
        const [wx, wz] = this.local(wl.side * this.g.track, this.g.axR), wy = surfaceAt(wx, wz, this.y + 0.8);
        wheelFx(this, k2, wx, wy, wz, wy - world.ground(wx, wz) > 0.3, skidding, speed, dt);
      } else this.skidPrev[k2] = null;
    }
    this.shake = Math.max(0, this.shake - dt * 2.5);
  }
  dispose() {
    this.fx.dispose();
    dropShadowProxy(this.shadowProxy);
    scene.remove(this.model.root); disposeTree(this.model.root);
    if (PH.rw && PH.rw.getRigidBody(this.body.handle)) {
      PH.info.delete(this.collider.handle);
      PH.rw.removeVehicleController(this.veh);
      PH.rw.removeRigidBody(this.body);
    }
  }
}

let cars = [];

// Сбиваемые объекты (столбы, светофоры, деревья, знаки, мебель…). Быстрая машина ломает объект и теряет скорость:
// долю mass / (M + mass) по закону сохранения импульса плюс «прочность крепления» anchor — поэтому стулья и знаки
// почти не тормозят, фонарь заметно, а толстое дерево гасит бо́льшую часть скорости. Медленнее minSpeed объект
// не ломается: машина упирается в коллайдер Rapier, как в стену. Ломают объекты и машины трафика.
const BRK_FX = {
  metal: (x, y, z) => { for (let k = 0; k < 12; k++) sparks.spawn(x, y + rand(0.5, 1.5), z, rand(-5, 5), rand(1, 5), rand(-5, 5), 0.35, 0.05, rand(0.2, 0.5), 0xffc060, 1, 14); },
  wood: (x, y, z, it) => {
    for (let k = 0; k < 16; k++) smoke.spawn(x + rand(-1.2, 1.2) * it.s, y + it.cy * rand(1, 1.6), z + rand(-1.2, 1.2) * it.s, rand(-3, 3), rand(0, 3), rand(-3, 3),
      rand(0.25, 0.45), 0.2, rand(0.8, 1.5), k % 4 ? 0x4f7d2e : 0x7a5a36, 0.95, 6);
  },
};
const _agents = [];
// участники столкновений: машины игроков и трафик (центры кругов вдоль кузова, радиус — полуширина)
function breakAgents() {
  _agents.length = 0;
  for (const c of cars) if (c.drown <= 0) _agents.push({ car: c, body: c.body, mass: c.mass, x: c.x, y: c.y, z: c.z, h: c.h, half: (c.L - c.W) / 2, r: c.cr, n: 3 });
  for (const tc of Traffic.list) {
    if (tc.dead || tc.far) continue;                         // далёкие боты едут без физики (см. Traffic.preStep)
    const t = tc.body.translation(), [fx, , fz] = qrot(tc.body.rotation(), 0, 0, 1), half = Math.max(0, (tc.L - tc.W) / 2);
    _agents.push({ tc, body: tc.body, mass: tc.mass, x: t.x, y: t.y, z: t.z, h: Math.atan2(fx, fz), half, r: tc.W / 2, n: Math.max(3, Math.ceil(tc.L / tc.W) + 1) });
  }
  return _agents;
}
function knockBreakables(dt) {
  const brks = world.breakables;
  if (!brks || !brks.length) return;
  const loose = brks.filter(B => B.debris.length);        // наборы, где есть лежащие лёгкие обломки
  for (const a of breakAgents()) {
    const lv = a.body.linvel(), speed = Math.hypot(lv.x, lv.z), reach = a.r + speed * dt * 2 + 0.1;
    const sh = Math.sin(a.h), ch = Math.cos(a.h);
    let changed = false;
    for (let i = 0; i < a.n; i++) {
      const off = a.n > 1 ? -a.half + 2 * a.half * i / (a.n - 1) : 0, cx = a.x + sh * off, cz = a.z + ch * off;
      for (const o of world.grid.query(cx - reach - 1, cx + reach + 1, cz - reach - 1, cz + reach + 1)) {
        const it = o.brk;
        if (!it || it.broken) continue;
        if (a.y > it.y + o.h) continue;                         // перелетели сверху
        const dx = o.x - cx, dz = o.z - cz, d = Math.hypot(dx, dz);
        if (d >= reach + o.r || d < 1e-6) continue;
        const nx = dx / d, nz = dz / d, vn = lv.x * nx + lv.z * nz, B = it.owner, O = B.o;
        if (vn <= Math.max(it.minSpeed, 0.3)) continue;
        // потеря скорости: импульс (доля массы) + вырвать из земли; не больше 85% скорости удара
        const loss = Math.min(vn * 0.85, vn * it.mass / (a.mass + it.mass) + Math.min(it.anchor, vn * 0.6));
        lv.x -= nx * loss; lv.z -= nz * loss; changed = true;
        B.knock(it, nx, nz, vn, lv.x, lv.z);
        if (it.cell && it.cell.col) it.cell.col.setEnabled(false);
        const c = a.car;
        if (!c) continue;
        c.shake = Math.min(1, c.shake + Math.min(0.6, 0.05 + loss / 14));
        if (O.dmg > 0) c.registerHit(loss * O.dmg, null, o.x, o.z);
        if (BRK_FX[O.kind]) BRK_FX[O.kind](o.x, it.y, o.z, it);
        Sound.crash(c.p, O.kind, vn, O.snd);
        Stunts.smash(c.p, it.mass);
      }
      // лёгкие обломки на земле можно пнуть ещё раз
      if (speed > 3) for (const B of loose) {
        for (const it of B.debris) {
          if (it.kick > 0 || Math.abs(it.p.y - a.y - 0.5) > 1.6) continue;
          const dx = it.p.x - cx, dz = it.p.z - cz, d = Math.hypot(dx, dz);
          if (d >= a.r + 0.35 || d < 1e-6) continue;
          const nx = dx / d, nz = dz / d, vr = (lv.x - it.v.x) * nx + (lv.z - it.v.z) * nz;
          if (vr < 1.5) continue;
          B.kickDebris(it, lv.x, lv.z, nx, nz, speed);
          const f = it.mass / (a.mass + it.mass);
          lv.x -= nx * vr * f; lv.z -= nz * vr * f; changed = true;
          if (a.car && it.mass > 10) Sound.crash(a.car.p, B.o.kind, vr * 0.5);
        }
      }
    }
    if (changed) a.body.setLinvel(lv, true);
  }
}

// удары: события сил контакта Rapier → Δv кузова → урон (как impulse/mass в 2D-версии)
const DMG_SCALE = { car: 1, traffic: 0.8, static: 0.5, ground: 0.5, deck: 0.5, brk: 0.5, barrel: 0.15 };
// с какого Δv (м/с) боковой удар опрокидывает машину: о другую машину — легче, о стену — только сильный
const FLIP_DV = { car: 6, traffic: 6, static: 10 };
// удар передом: доля урона по прочности (0,7 — на 30% меньше, чем в борт или корму)
const FRONT_DMG = 0.7;
// бонус за переворот соперника (FLIP_REWARD в js/data.js): машина пролежала на боку или крыше FLIP_LIE с,
// а соперник бил её не раньше FLIP_WINDOW с назад
const FLIP_LIE = 0.3, FLIP_WINDOW = 3;
// Толкотня машин игроков. Раньше стоящую машину было не сдвинуть: без газа она сама вставала на тормоз 30 м/с²,
// а шины держали 21–28 м/с² вбок — втрое больше, чем тянет мотор соперника (6–9 м/с²). В «Захвате точек» игроки
// упирались друг в друга и стояли. Теперь: касание соперника снимает автотормоз; машину, которую толкают в борт или
// корму, шины на малой скорости почти не держат; удар отбрасывает (сильнее всего — в борт); после удара ассистент
// стабилизации ненадолго слабеет, и машину можно развернуть. Значения можно менять из консоли: PUSH.side = 0.05
const PUSH = {
  hold: 0.25,            // сколько секунд после касания действует толкотня
  side: 0.015,           // доля бокового трения шин у машины, которую толкают в борт или корму…
  sideSpd: [5, 12],      // …на скорости до 5 м/с; к 12 м/с — обычное трение (в гонке борт о борт шины держат)
  brake: 6,              // предел тормоза, пока толкают, м/с²
  knockMin: 1.5,         // Δv удара соперника (м/с), с которого добавляется отбрасывание
  knock: 0.6,            // добавка скорости — доля превышения knockMin…
  knockMax: 6,           // …но не больше, м/с
  knockZone: { side: 1, rear: 0.7, front: 0.5 },   // множитель по месту удара: в борт — полный
  daze: 0.8,             // на сколько секунд после удара ассистент стабилизации слабеет…
  assist: 0.15,          // …до этой доли
};

// Куда пришёлся удар: 'side' — борт, 'front' — нос, 'rear' — корма. hw/hl — половины ширины и длины.
// Без dir — по точке (px, pz): граница чуть сдвинута в пользу борта (0,8); точка в центре кузова (контакт не нашёлся) — борт.
// С dir (направление силы удара в мировых осях, maxForceDirection() Rapier) — по нему: сила вдоль кузова — нос или
// корма (по точке), поперёк или вертикально — борт. Направление надёжнее точки: при таране носом Rapier часто отдаёт
// точку в переднем углу, а угол лежит на границе зон.
function hitZone(body, px, pz, hw, hl, dir) {
  const t = body.translation(), q = body.rotation();
  const [fx, , fz] = qrot(q, 0, 0, 1), [lx, , lz] = qrot(q, 1, 0, 0);
  const rx = px - t.x, rz = pz - t.z, lat = rx * lx + rz * lz, lon = rx * fx + rz * fz;
  if (dir) {
    const df = Math.abs(dir.x * fx + dir.z * fz), dl = Math.abs(dir.x * lx + dir.z * lz);
    return df > dl && df > 0.3 ? (lon > 0 ? 'front' : 'rear') : 'side';
  }
  return Math.abs(lat) / hw >= 0.8 * Math.abs(lon) / hl ? 'side' : lon > 0 ? 'front' : 'rear';
}

// Опрокидывание: сильный удар в борт закручивает кузов вокруг продольной оси (ударенный борт идёт вверх)
// и немного подбрасывает. Центр масс у машин специально низкий, поэтому без этого толчка они почти не переворачиваются.
// excess — превышение порога Δv; hw/hl — половины ширины и длины. Возвращает true, если удар пришёлся в борт.
function flipKick(body, excess, px, pz, hw, hl) {
  if (hitZone(body, px, pz, hw, hl) !== 'side') return false;               // удар в нос или корму — не опрокидываем
  const t = body.translation(), q = body.rotation();
  const [fx, , fz] = qrot(q, 0, 0, 1), [lx, , lz] = qrot(q, 1, 0, 0);
  const lat = (px - t.x) * lx + (pz - t.z) * lz;
  const w = Math.min(7.5, 2.8 + excess * 0.8);
  const cy = fz * lx - fx * lz;                                             // y-компонента f × l
  const s = Math.sign(lat * cy) || 1;
  const av = body.angvel(), lv = body.linvel();
  body.setAngvel({ x: av.x + fx * w * s, y: av.y, z: av.z + fz * w * s }, true);
  body.setLinvel({ x: lv.x, y: Math.max(lv.y, 0) + Math.min(4, 1 + excess * 0.3), z: lv.z }, true);
  return true;
}
// точка касания двух коллайдеров [x, z, нормаль] или null. solver — только настоящее касание (точки, которые решатель
// использует), без «предсказанных» контактов на подлёте
function contactPoint(c1, c2, solver) {
  let pt = null;
  PH.rw.contactPair(c1, c2, (mf, flipped) => {
    if (pt || mf.numContacts() === 0 || (solver && mf.numSolverContacts() === 0)) return;
    const a = flipped ? c2 : c1, lp = mf.localContactPoint1(0), t = a.translation();
    const [x, , z] = qrot(a.rotation(), lp.x, lp.y, lp.z);
    pt = [t.x + x, t.z + z, mf.normal()];        // нормаль — в мировых осях, знак не важен (см. hitZone())
  });
  return pt;
}
// Отбрасывание (PUSH): удар соперника добавляет машине скорость от него — импульс в точке удара, поэтому удар
// в угол ещё и закручивает. raw — Δv удара по Rapier: тяжёлая машина бьёт лёгкую сильнее. Один раз за удар (knockCd).
function rivalKnock(car, other, raw, p, dir) {
  if (car.knockCd > 0 || car.drown > 0) return;
  const zone = hitZone(car.body, p[0], p[1], car.W / 2, car.L / 2, dir);
  const dv = Math.min(PUSH.knockMax, (raw - PUSH.knockMin) * PUSH.knock) * PUSH.knockZone[zone];
  let dx = car.x - other.x, dz = car.z - other.z;
  const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
  const t = car.body.translation(), J = car.mass * dv;
  car.body.applyImpulseAtPoint({ x: dx * J, y: 0, z: dz * J }, { x: p[0], y: t.y + 0.1, z: p[1] }, true);
  car.knockCd = 0.3; car.dazeT = PUSH.daze;
}
// Касания машин игроков (каждый шаг): касание снимает автотормоз (touchT), касание в борт или корму — ещё и
// ослабляет шины (shoveT). Пару, которая заведомо далеко, у Rapier не спрашиваем.
function pushContacts() {
  for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
    const a = cars[i], b = cars[j];
    if (a.drown > 0 || b.drown > 0 || Math.abs(a.x - b.x) + Math.abs(a.z - b.z) > a.L + b.L) continue;
    const p = contactPoint(a.collider, b.collider, true);
    if (!p) continue;
    for (const c of [a, b]) {
      c.touchT = PUSH.hold; c.touchAt = simTime;
      if (hitZone(c.body, p[0], p[1], c.W / 2, c.L / 2, p[2]) !== 'front') c.shoveT = PUSH.hold;   // по нормали: точка часто в углу носа
    }
  }
}
function handleContacts() {
  PH.events.drainContactForceEvents(ev => {
    const i1 = PH.info.get(ev.collider1()), i2 = PH.info.get(ev.collider2());
    if (!i1 || !i2) return;
    const F = ev.totalForceMagnitude() * FIXED;              // импульс за шаг
    const c1 = PH.rw.getCollider(ev.collider1()), c2 = PH.rw.getCollider(ev.collider2());
    let pt = null;
    const getPt = (x, z) => pt || (pt = contactPoint(c1, c2) || [x, z]);
    for (const [me, other] of [[i1, i2], [i2, i1]]) {
      if (me.kind === 'traffic') { Traffic.hit(me.tc, F / me.tc.mass, other, () => getPt(me.tc.x, me.tc.z)); continue; }
      if (me.kind !== 'car') continue;
      const car = me.car, raw = F / car.mass, dv = raw * (DMG_SCALE[other.kind] ?? 0.5);
      if (dv < 0.3) continue;
      const p = getPt(car.x, car.z);
      car.registerHit(dv, other.kind === 'car' ? other.car : null, p[0], p[1], ev.maxForceDirection());
      if (other.kind === 'car' && raw > PUSH.knockMin) rivalKnock(car, other.car, raw, p, ev.maxForceDirection());
      const th = FLIP_DV[other.kind];
      if (th && raw > th && !(car.flipCd > 0) && car.drown <= 0 && flipKick(car.body, raw - th, p[0], p[1], car.W / 2, car.L / 2)) {
        car.flipCd = 1; car.tumble = 1.6;
      }
    }
  });
}

const NO_INPUT = { up: false, down: false, left: false, right: false, hb: false, nitro: false };
function readInput(p) {
  // Ctrl не используем: Ctrl + W (газ Игрока 1) закрывает вкладку браузера
  if (cars.length === 1) return {      // одиночная езда: WASD и стрелки управляют одной машиной
    up: keys.has('KeyW') || keys.has('ArrowUp'), down: keys.has('KeyS') || keys.has('ArrowDown'),
    left: keys.has('KeyA') || keys.has('ArrowLeft'), right: keys.has('KeyD') || keys.has('ArrowRight'),
    hb: keys.has('Space') || keys.has('ShiftRight') || keys.has('Numpad0'), nitro: keys.has('ShiftLeft') || keys.has('Slash') };
  if (p === 0) return { up: keys.has('KeyW'), down: keys.has('KeyS'), left: keys.has('KeyA'), right: keys.has('KeyD'), hb: keys.has('Space'), nitro: keys.has('ShiftLeft') };
  return { up: keys.has('ArrowUp'), down: keys.has('ArrowDown'), left: keys.has('ArrowLeft'), right: keys.has('ArrowRight'),
    hb: keys.has('ShiftRight') || keys.has('Numpad0'), nitro: keys.has('Slash') };
}

const FIXED = 1 / 120;
let accum = 0, brkTick = 0;
function stepWorld(dt) {
  ensurePhysics();
  simTime += dt;
  const live = countdown <= 0;
  for (const c of cars) c.control(dt, live ? readInput(c.p) : NO_INPUT);
  Traffic.preStep(dt);
  // сбиваемые объекты — через шаг (60 Гц): за 1/60 с машина проезжает не больше 1,5 м, а запас «дотягивания» в
  // knockBreakables растёт вместе с dt, так что ничего не проскакивает
  if ((brkTick ^= 1)) knockBreakables(dt * 2);
  PH.rw.step(PH.events);
  handleContacts();
  pushContacts();
  Traffic.postStep(dt);
  for (const { b, body } of PH.barrels) {
    const t = body.translation(), v = body.linvel();
    b.x = t.x; b.z = t.z; b.vx = v.x; b.vz = v.z;
  }
  for (const c of cars) c.sync(dt);
  for (const c of cars) c.postStep(dt);
}
