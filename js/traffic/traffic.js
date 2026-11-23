// Городской трафик.
// Боты ездят по правым полосам дорожного графа города (раскладка города → world.trafficData):
// останавливаются на красный и жёлтый, на перекрёстках без светофора уступают поперечному потоку,
// кольцевые развязки объезжают, держа островок слева, держат дистанцию до машин впереди (и до игроков).
// Каждый бот — динамическое тело Rapier: пока он «в строю», скорость и поворот задаёт водитель-бот,
// поэтому удары по-честному передают импульс игрокам. После сильного удара бот теряет управление
// (становится обычным телом — может закрутиться и перевернуться) и через несколько секунд исчезает.
// Машины всегда держатся вокруг игроков: далёкие исчезают и появляются снова в 170–380 м от игроков (TRAFFIC_RING).
// Карта может задать свой трафик (world.traffic: типы, число машин по уровням, global, кольцо появления ring): на «Побережье» немного
// машин на всю карту — они не исчезают вдали, а заново появляются только разбитыми или застрявшими. На «Ситжесе» дома
// закрывают вид — кольцо ближе, а машина не появляется и не исчезает на виду у игрока (ring.hide, Traffic.seen).
// Прицеп (type.trailer, тележка трактора) — отдельное тело в общем списке (tc.lead — тягач, tc.trailer — прицеп):
// водитель им не управляет, тележка тянется за сцепкой (Traffic.follow, js/traffic/driver.js), появляется,
// исчезает и разбивается вместе с тягачом.
//
// Этот файл — объект Traffic: запуск, появление и исчезновение машин, удары, отрисовка (InstancedMesh по типам).
// Вождение ботов (полосы, уступить дорогу, светофоры, дистанция, preStep) — js/traffic/driver.js.
// Определяет: TRAFFIC_FAR, TRAFFIC_NEAR, TRAFFIC_SHADOW_R, TRAFFIC_RING, shadowBefore, shadowAfter, Traffic.
// Использует: CARS (js/data.js); clamp, QUAL (js/core.js); buildCarModel (js/car-models.js); scene (js/world.js); PH,
//   FIXED, cars, TRAFFIC_DRIVEN_GROUPS, ALL_GROUPS, flipKick (js/physics.js); buildTrafficGraph, tPieceAt, tPieceIdx
//   (js/traffic/graph.js); TRAFFIC_TYPES, buildTaxiModel, buildBusModel, buildTruckModel, mergeBakedParts, bakeModel
//   (js/traffic/models.js); cams (js/match.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

/* =====================================================================
   ТРАФИК
   ===================================================================== */
const TRAFFIC_FAR = 170, TRAFFIC_NEAR = 140;              // дальше FAR от обоих игроков — без физики, ближе NEAR — снова с физикой
const TRAFFIC_SHADOW_R = 105;                              // в карту теней попадают машины ближе этого к игроку (она 140 × 140 м вокруг него)
// кольцо появления вокруг игроков (карта может задать своё — world.traffic.ring): появляются в min…max м от игроков,
// дальше drop — исчезают (и появляются снова), лишние (игроки съехались) уходят в запас дальше over; hide — не
// появляться и не исчезать на виду у камеры игрока (дома между ними — world.occludes)
const TRAFFIC_RING = { min: 170, max: 380, drop: 400, over: 300, hide: false };
// меш «только для теней»: в обычном проходе у него 0 экземпляров, в проходе теней — машины вокруг игрока
const _shadowOnlyMat = new THREE.MeshBasicMaterial();
function shadowBefore() { this.count = this.userData.n; }
function shadowAfter() { this.count = 0; }
const _tq = new THREE.Quaternion(), _te = new THREE.Euler(0, 0, 0, 'YXZ'), _tp = [0, 0, 0, 0];
const _tv = new THREE.Vector3(), _tone = new THREE.Vector3(1, 1, 1), _tfr = new THREE.Frustum(), _tpm = new THREE.Matrix4(), _tsph = new THREE.Sphere();
const Traffic = {
  list: [], trailers: [], graph: null, templates: {}, world: null, ring: TRAFFIC_RING, timer: 0, count: 0, target: 0, _cand: [], _cw: [], hash: new Map(), _near: [],
  // отрисовка: на каждый тип машины — InstancedMesh кузова и остального (2 вызова отрисовки на тип вместо ≈11 на машину)
  // с общим буфером матриц, цвет кузова — цвет экземпляра; плюс отдельный меш для карты теней (см. cullView)
  batches: [],

  template(id) {
    if (this.templates[id]) return this.templates[id];
    let m;
    const T = this.types || TRAFFIC_TYPES, tp = T.find(t => t.id === id) || T.map(t => t.trailer).find(t => t && t.id === id);
    if (tp && tp.model) m = tp.model();                       // своя модель типа (js/traffic/models-rural.js)
    else if (id === 'taxi') m = buildTaxiModel();
    else if (id === 'bus') m = buildBusModel(0xffffff);
    else if (id === 'truck') m = buildTruckModel(0xffffff);
    else { const def = CARS.find(c => c.id === id); const cm = buildCarModel(def, 0xffffff); m = { root: cm.root, paint: cm.paint, dims: { L: def.geo.L, W: def.geo.W, H: def.geo.H } }; }
    const t = { parts: mergeBakedParts(bakeModel(m.root, m.paint)), dims: m.dims, paintBase: m.paint };
    // для карты теней материалы не важны: вся машина — одна геометрия (только позиции)
    t.shadowGeo = mergeGeometries(t.parts.map(p => { const g = new THREE.BufferGeometry(); g.setAttribute('position', p.geo.attributes.position); return g; }));
    m.root.traverse(o => { if (o.geometry) o.geometry.dispose(); });   // материалы остаются — ими пользуются запечённые части
    return this.templates[id] = t;
  },

  // count — число машин из настройки (TRAFFIC_LEVELS), level — её id; у карты со своим трафиком число — cfg.count[level]
  start(w, count, level) {
    this.clear();
    const cfg = w.traffic;
    if (cfg) count = cfg.count[level] || 0;
    if (!count || !(w.trafficData || w.trafficGraph)) return;
    this.world = w; this.global = !!(cfg && cfg.global); this.types = cfg ? cfg.types : TRAFFIC_TYPES;
    this.ring = Object.assign({}, TRAFFIC_RING, cfg && cfg.ring);
    if (!w.__trafficGraph) w.__trafficGraph = w.trafficGraph ? w.trafficGraph() : buildTrafficGraph(w.trafficData);
    this.graph = w.__trafficGraph;
    for (const n of this.graph.nodes) n.occ.clear();
    for (const e of this.graph.edges) if (e.narrow) e.narrow.n = 0;
    // count — число машин вокруг игроков, когда они рядом; разъехавшимся игрокам нужно вдвое больше,
    // чтобы плотность вокруг каждого не падала (см. postStep), поэтому создаём запас ×2. На всю карту — без запаса
    this.count = this.target = count;
    const T = this.types, total = T.reduce((s, t) => s + t.w, 0), used = new Map();
    for (let i = 0; i < (this.global ? count : count * 2); i++) {
      let r = Math.random() * total, type = T[0];
      for (const t of T) { if (r < t.w) { type = t; break; } r -= t.w; }
      if (type.max && (used.get(type) || 0) >= type.max) type = T.find(t => !t.max) || type;   // тракторов — не больше max
      used.set(type, (used.get(type) || 0) + 1);
      const tc = this.create(type);
      if (type.trailer) this.attach(tc);
      if (i >= count) this.kill(tc);
      else if (!this.respawn(tc, this.global ? 60 : 30, this.ring.max)) this.respawn(tc, 30, 1e9);
    }
    this.buildBatches();
  },

  // InstancedMesh для всех машин каждого типа (вместимость — число машин этого типа в запасе)
  buildBatches() {
    const byType = new Map();
    for (const tc of this.list) { let a = byType.get(tc.type.id); if (!a) byType.set(tc.type.id, a = []); a.push(tc); }
    for (const [id, list] of byType) {
      const T = this.template(id), n = list.length;
      const paint = T.paintBase.clone(); paint.color.setHex(0xffffff);      // цвет кузова — instanceColor
      let matrix = null;
      const meshes = T.parts.map(p => {
        const m = new THREE.InstancedMesh(p.geo, p.paint ? paint : p.mat, n);
        if (matrix) m.instanceMatrix = matrix; else matrix = m.instanceMatrix;
        if (p.paint) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
        // в обычном проходе — только машины в кадре; тени отбрасывает отдельный меш shadow (ниже)
        m.castShadow = false; m.receiveShadow = true; m.frustumCulled = false;   // отсечение — своё, в cullView()
        m.count = 0; m.visible = false; m.matrixAutoUpdate = false;
        scene.add(m);
        return m;
      });
      const shadow = new THREE.InstancedMesh(T.shadowGeo, _shadowOnlyMat, n);
      shadow.castShadow = true; shadow.receiveShadow = false; shadow.frustumCulled = false; shadow.matrixAutoUpdate = false;
      shadow.count = 0; shadow.userData.n = 0; shadow.onBeforeShadow = shadowBefore; shadow.onAfterShadow = shadowAfter;
      scene.add(shadow);
      const colorMesh = meshes.find(m => m.instanceColor);
      this.batches.push({ list, meshes, shadow, paint, matrix, color: colorMesh ? colorMesh.instanceColor : null, R: Math.hypot(T.dims.L, T.dims.H) / 2 + 0.5 });
    }
  },

  create(type) {
    const T = this.template(type.id), R = RAPIER, rw = PH.rw, { L, W, H } = T.dims;
    const color = new THREE.Color(type.paints[Math.floor(Math.random() * type.paints.length)]);
    const mat = new THREE.Matrix4();
    const body = rw.createRigidBody(R.RigidBodyDesc.dynamic().lockRotations().setCanSleep(false).setTranslation(0, -200, 0));
    const r = Math.min(0.3, W * 0.12), hh = (H - 0.2) / 2;
    const collider = rw.createCollider(R.ColliderDesc.roundCuboid(W / 2 - r, hh - r, L / 2 - r, r).setTranslation(0, hh + 0.03, 0)
      .setMass(type.mass).setFriction(0).setRestitution(0.1)
      .setActiveEvents(R.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(type.mass * 1.2 / FIXED), body);
    // stopOff — насколько раньше конца полосы машина встаёт центром (js/traffic/driver.js). Граф со стоп-линией у конца
    // полосы (stopFront, «Ситжес»: конец полосы — в 1 м от края чужой проезжей части) — нос у линии; иначе («Город»,
    // «Побережье») центр — у конца полосы, нос — на 2–2,5 м дальше, а длинная машина (автобус, грузовик) — носом там же
    const front = this.graph && this.graph.stopFront;
    const tc = { type, color, mat, body, collider, L, W, H, stopOff: front ? L / 2 - 0.3 : Math.max(0, L / 2 - 2.5), mass: type.mass, vmax: type.vmax * (0.9 + Math.random() * 0.2), accel: type.accel,
      v: 0, h: 0, x: 0, z: 0, y: 0, roll: 0, slope: 0, hold: null, dead: true, tick: Math.random() < 0.5 ? 1 : 0, wreck: false, wreckT: 0, flipCd: 0, stuckT: 0, ghostT: 0, obs: Infinity, scan: Math.floor(Math.random() * 3), far: false, q: new THREE.Quaternion(), waitT: 0 };
    PH.info.set(collider.handle, { kind: 'traffic', tc });
    this.list.push(tc);
    return tc;
  },

  clear() {
    for (const B of this.batches) {
      for (const m of [...B.meshes, B.shadow]) { scene.remove(m); m.dispose(); }
      B.paint.dispose();
    }
    this.batches = [];
    for (const tc of this.list) {
      if (PH.rw && PH.rw.getRigidBody(tc.body.handle) === tc.body) { PH.info.delete(tc.collider.handle); PH.rw.removeRigidBody(tc.body); }
    }
    this.list = []; this.trailers = []; this.graph = null; this.world = null; this.global = false; this.types = null;
  },

  // сетка 48×48 м для поиска соседей: перестраивается каждый шаг управления в preStep
  buildHash() {
    const H = this.hash;
    for (const a of H.values()) a.length = 0;
    for (const o of this.list) {
      if (o.dead) continue;
      const k = ((Math.floor(o.x / 48) + 512) << 10) | (Math.floor(o.z / 48) + 512);
      let a = H.get(k); if (!a) H.set(k, a = []); a.push(o);
    }
  },
  // боты в клетках вокруг точки (r=1 — не меньше 48 м во все стороны); возвращает общий массив
  nearby(x, z, r = 1) {
    const out = this._near, H = this.hash, cx = Math.floor(x / 48) + 512, cz = Math.floor(z / 48) + 512;
    out.length = 0;
    for (let i = cx - r; i <= cx + r; i++) for (let j = cz - r; j <= cz + r; j++) {
      const a = H.get((i << 10) | j);
      if (a) for (const o of a) out.push(o);
    }
    return out;
  },

  // игрок, вокруг которого машин меньше всего (разъехавшиеся игроки получают трафик поровну)
  spawnAnchor() {
    let best = cars[0], bn = Infinity;
    for (const c of cars) {
      let n = Math.random() * 0.5;                            // случайный выбор при равенстве
      for (const o of this.list) if (!o.dead && (o.x - c.x) ** 2 + (o.z - c.z) ** 2 < this.ring.drop ** 2) n++;
      if (n < bn) { bn = n; best = c; }
    }
    return best;
  },

  // поставить бота на свободную полосу в кольце minD…maxD вокруг игрока. Полоса выбирается с весом по длине
  // (иначе районы с крупными кварталами и длинными улицами получают меньше машин на метр дороги);
  // едущему игроку машины ставятся в основном впереди — сзади они быстро отстанут и исчезнут
  // На всю карту (global) — в любом месте графа не ближе minD к игрокам (maxD не важен), кроме узких участков и рёбер,
  // куда этой машине нельзя
  respawn(tc, minD, maxD) {
    if (tc.node) { tc.node.occ.delete(tc); tc.node = null; }
    this.release(tc);
    const glob = this.global, P = glob ? null : this.spawnAnchor(), E = this.graph.edges, cand = this._cand, cw = this._cw;
    cand.length = cw.length = 0;
    let tot = 0;
    for (const e of E) {
      if (tc.L > 6 && (e.B.round || e.A.round)) continue;
      if (e.narrow || tc.W > (e.maxW || 99) || (e.noLong && tc.type.long)) continue;
      if (!glob) {
        const d = Math.hypot((e.A.x + e.B.x) / 2 - P.x, (e.A.z + e.B.z) / 2 - P.z), h = e.len / 2;
        if (d + h < minD || d - h > maxD) continue;
      }
      tot += (e.s1 - e.s0) * e.lanes.length; cand.push(e); cw.push(tot);
    }
    const sp = glob ? 0 : Math.hypot(P.vx || 0, P.vz || 0);
    for (let k = 0; k < 40 && cand.length; k++) {
      const r = Math.random() * tot;
      let lo = 0, hi = cw.length - 1;
      while (lo < hi) { const m = (lo + hi) >> 1; if (cw[m] < r) lo = m + 1; else hi = m; }
      const e = cand[lo], l = Math.floor(Math.random() * e.lanes.length), piece = e.lp[l];
      const s = Math.random() * Math.max(0, piece.len - 2);
      tPieceAt(piece, s, _tp);
      const x = _tp[0], z = _tp[1];
      if (!glob) {
        const dP = Math.hypot(x - P.x, z - P.z);
        if (dP < minD || dP > maxD) continue;
        if (sp > 8 && ((x - P.x) * P.vx + (z - P.z) * P.vz) / (dP * sp) < -0.2 && Math.random() < 0.75) continue;
      }
      let dmin = Infinity; for (const c of cars) dmin = Math.min(dmin, Math.hypot(c.x - x, c.z - z));
      if (dmin < minD) continue;
      if (this.list.some(o => o !== tc && !o.dead && (o.x - x) ** 2 + (o.z - z) ** 2 < 13 * 13)) continue;
      if (this.ring.hide && this.seen(x, e.hy ? e.hy[tPieceIdx(piece, s)] : this.world.ground(x, z), z)) continue;
      this.place(tc, e, l, s, dmin > TRAFFIC_FAR);
      return true;
    }
    this.kill(tc);
    return false;
  },

  // точку (x, y, z) видит камера какого-нибудь игрока: она в кадре и между ними нет дома (world.occludes — через 3 м
  // на отрезке от камеры до крыши машины)
  seen(x, y, z) {
    const w = this.world;
    if (!w.occludes) return false;
    for (let i = 0; i < cars.length; i++) {
      const cam = cams[i];
      cam.updateMatrixWorld();
      _tfr.setFromProjectionMatrix(_tpm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
      _tsph.center.set(x, y + 1, z); _tsph.radius = 3;
      if (!_tfr.intersectsSphere(_tsph)) continue;
      const p = cam.position, dx = x - p.x, dy = y + 1.4 - p.y, dz = z - p.z, n = Math.ceil(Math.hypot(dx, dz) / 3);
      let hid = false;
      for (let k = 1; k < n && !hid; k++) hid = w.occludes(p.x + dx * k / n, p.y + dy * k / n, p.z + dz * k / n);
      if (!hid) return true;
    }
    return false;
  },

  // прицеп тягачу: своё тело и своя модель, в запасе, пока тягач не поставлен на дорогу
  attach(lead) {
    const tl = this.create(lead.type.trailer);
    tl.lead = lead; lead.trailer = tl; this.trailers.push(tl);
    tl.kind = 'trailer';
    // тягач и его прицеп не толкают друг друга (группы решателя Rapier: членство << 16 | фильтр) — в крутом
    // развороте тележка может задеть трактор, и удар разбил бы обоих. С остальными оба сталкиваются как обычно
    lead.collider.setSolverGroups((0x0004 << 16) | (0xffff & ~0x0008));
    tl.collider.setSolverGroups((0x0008 << 16) | (0xffff & ~0x0004));
    this.kill(tl);
    return tl;
  },
  // поставить прицеп за тягачом: ось — на полосе тягача позади него (или по прямой, если полоса только началась)
  placeTrailer(tl) {
    const L = tl.lead, T = tl.type, back = L.L / 2 + T.gap + T.bar;
    if (L.piece && L.s >= back) { tPieceAt(L.piece, L.s - back, _tp); tl.ax = _tp[0]; tl.az = _tp[1]; }
    else { tl.ax = L.x - Math.sin(L.h) * back; tl.az = L.z - Math.cos(L.h) * back; }
    tl.h = L.h; tl.x = tl.ax; tl.z = tl.az; tl.y = this.world.surface(tl.x, tl.z, L.y + 1.5);
    const b = tl.body;
    b.setEnabled(true);
    b.lockRotations(true, true); tl.collider.setFriction(0); b.setLinearDamping(0); b.setAngularDamping(0);
    tl.collider.setCollisionGroups(TRAFFIC_DRIVEN_GROUPS); b.setGravityScale(0, true);
    b.setTranslation({ x: tl.x, y: tl.y + 0.05, z: tl.z }, true);
    _tq.setFromEuler(_te.set(0, tl.h, 0)); b.setRotation({ x: _tq.x, y: _tq.y, z: _tq.z, w: _tq.w }, true);
    b.setLinvel({ x: 0, y: 0, z: 0 }, true); b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    Object.assign(tl, { dead: false, wreck: false, wreckT: 0, v: 0, far: L.far });
    tl.q.copy(_tq);
    if (tl.far) b.setEnabled(false);
    tl.mat.compose(_tv.set(tl.x, tl.y + 0.05, tl.z), _tq, _tone);
  },

  // поставить бота на полосу l ребра e в s м от её начала; far — без тела Rapier (далеко от игроков)
  place(tc, e, l, s, far) {
    const piece = e.lp[l];
    tPieceAt(piece, s, _tp);
    const x = _tp[0], z = _tp[1], hdg = Math.atan2(_tp[2], _tp[3]);
    this.release(tc);
    if (tc.node) { tc.node.occ.delete(tc); tc.node = null; }
    this.enterEdge(tc, e, l, s);
    // высота: у кривых дорог — подсказка из профиля (на акведуке настил, а не дно долины под ним)
    const hint = e.hy ? e.hy[tPieceIdx(piece, s)] + 1.5 : e.bridge || e.ov ? Infinity : 1;
    const y = this.world.surface ? this.world.surface(x, z, hint) : this.world.ground(x, z);
    tc.h = hdg; tc.x = x; tc.z = z; tc.y = y; tc.roll = 0;
    const b = tc.body;
    b.setEnabled(true);
    b.lockRotations(true, true); tc.collider.setFriction(0); b.setLinearDamping(0); b.setAngularDamping(0);
    // пока машиной управляет бот: без гравитации и без контакта с рельефом — высоту задаёт preStep()
    tc.collider.setCollisionGroups(TRAFFIC_DRIVEN_GROUPS); b.setGravityScale(0, true);
    b.setTranslation({ x, y: y + 0.05, z }, true);
    _tq.setFromEuler(_te.set(0, tc.h, 0)); b.setRotation({ x: _tq.x, y: _tq.y, z: _tq.z, w: _tq.w }, true);
    b.setLinvel({ x: 0, y: 0, z: 0 }, true); b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    // начальная скорость — не выше предела поворота в этом месте (кривые полосы Побережья)
    const v0 = Math.min(tc.vmax * 0.6, e.vprof ? e.vprof[tPieceIdx(piece, s)] : Infinity);
    Object.assign(tc, { dead: false, wreck: false, wreckT: 0, v: v0, stuckT: 0, pushT: 0, ghostT: 0, waitT: 0, obs: Infinity, far });
    if (tc.far) { tc.q.copy(_tq); b.setEnabled(false); }
    tc.mat.compose(_tv.set(x, y + 0.05, z), _tq, _tone);
    if (tc.trailer) this.placeTrailer(tc.trailer);
  },

  // убрать бота в запас (невидим, тело выключено)
  kill(tc) {
    if (tc.node) { tc.node.occ.delete(tc); tc.node = null; }
    this.release(tc);
    tc.dead = true; tc.far = false; tc.body.setEnabled(false);
    if (tc.trailer && !tc.trailer.dead) this.kill(tc.trailer);
  },

  wreck(tc, why) {
    if (tc.wreck) return;
    tc.wreck = true; tc.wreckT = 0; tc.why = why;               // why — причина (для проверки js/traffic/test.js)
    if (tc.node) { tc.node.occ.delete(tc); tc.node = null; }
    this.release(tc);
    tc.body.lockRotations(false, true);
    tc.collider.setCollisionGroups(ALL_GROUPS); tc.body.setGravityScale(1, true);   // обычное тело: падает и лежит на земле
    tc.collider.setFriction(0.7);
    tc.body.setLinearDamping(0.3); tc.body.setAngularDamping(0.5);
    // тягач и прицеп разбиваются вместе
    if (tc.trailer && !tc.trailer.dead) this.wreck(tc.trailer, why);
    if (tc.lead) this.wreck(tc.lead, why);
  },

  // сильный удар: бот теряет управление; боковой — ещё и опрокидывает (flipKick из js/physics.js)
  hit(tc, dv, other, getPt) {
    if (tc.dead || dv < 1.6) return;
    if (other.kind === 'ground' || other.kind === 'deck') return;
    if (other.kind === 'traffic' && (other.tc === tc.lead || other.tc === tc.trailer)) return;   // своя сцепка
    const th = other.kind === 'car' ? 1.8 : other.kind === 'traffic' ? 5.5 : 12;
    if (!tc.wreck && dv > th) { tc.whyBy = other.tc || null; this.wreck(tc, 'удар: ' + (other.kind === 'traffic' ? other.tc.type.id : other.kind) + ' ' + dv.toFixed(1)); }
    if (tc.wreck && dv > 3 && !(tc.flipCd > 0)) {
      const p = getPt();
      if (flipKick(tc.body, dv - 1.5, p[0], p[1], tc.W / 2, tc.L / 2)) tc.flipCd = 1;
    }
  },

  postStep(dt) {
    if (!this.list.length) return;
    this.timer += dt;
    const check = this.timer > 0.5;
    if (check) this.timer = 0;
    let alive = 0, spawned = 0;
    if (check) {
      // разъехавшимся игрокам — до вдвое больше машин: круги вокруг них уже не перекрываются (на всю карту — всегда count)
      const dP = cars.length > 1 ? Math.hypot(cars[0].x - cars[1].x, cars[0].z - cars[1].z) : 0;
      this.target = this.global ? this.count : Math.round(this.count * (1 + clamp((dP - 200) / 600, 0, 1)));
      for (const tc of this.list) if (!tc.dead && !tc.lead) alive++;
    }
    for (const tc of this.list) {
      if (tc.flipCd > 0) tc.flipCd -= dt;
      if (tc.lead) {                                         // прицеп живёт и появляется вместе с тягачом
        if (tc.wreck && !tc.dead) { const t = tc.body.translation(); tc.x = t.x; tc.z = t.z; tc.y = t.y; }
        continue;
      }
      if (tc.dead) {
        // не больше 12 появлений за проверку, чтобы не было рывков
        if (check && alive < this.target && spawned++ < 12 && this.respawn(tc, this.global ? 150 : this.ring.min, this.ring.max)) alive++;
        continue;
      }
      if (tc.wreck) {
        const t = tc.body.translation(); tc.x = t.x; tc.z = t.z; tc.y = t.y;
        tc.wreckT += dt;
      }
      if (!check) continue;
      let dmin = Infinity; for (const c of cars) dmin = Math.min(dmin, Math.hypot(c.x - tc.x, c.z - tc.z));
      // далеко от игроков, разбит или утонул — появляется снова в другом месте
      // машин больше нормы (игроки съехались) — лишние дальние уходят в запас
      // на виду у игрока (ring.hide) — не исчезает, пока не уедет вдвое дальше
      const R = this.ring, hold = R.hide && dmin < R.drop * 2 && dmin > R.over && this.seen(tc.x, tc.y, tc.z);
      if (!this.global && alive > this.target && dmin > R.over && !hold) { this.kill(tc); alive--; }
      // застрял (стоит в пробке или упёрся в неподвижное) дольше 45 с вдали от игроков — тоже
      else if ((!this.global && dmin > R.drop && !hold) || (tc.wreck && (tc.wreckT > 25 || (tc.wreckT > 9 && dmin > 40) || tc.y < -3)) || ((tc.stuckT > 45 || tc.pushT > 45) && dmin > 60))
        this.respawn(tc, this.global ? 150 : R.min, R.max);
    }
  },

  // перед отрисовкой экрана игрока (камера cam, игрок в x, z): в буферы экземпляров попадают только машины,
  // которые видит эта камера, плюс ближние (их тени могут упасть в кадр). Дальше R не рисуем: это трафик вокруг
  // другого игрока, почти растворённый в тумане. R — из настройки качества (на «Минимуме» ближе). Без теней
  // (качество «Минимум») теневые меши пусты.
  cullView(cam, x, z, R = QUAL.trafficR) {
    cam.updateMatrixWorld();
    _tfr.setFromProjectionMatrix(_tpm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const R2 = R * R, S2 = QUAL.shadows ? TRAFFIC_SHADOW_R * TRAFFIC_SHADOW_R : -1;
    for (const B of this.batches) {
      const M = B.matrix.array, C = B.color && B.color.array, SM = B.shadow.instanceMatrix.array;
      let k = 0, ks = 0;
      for (const tc of B.list) {
        if (tc.dead) continue;
        const d2 = (tc.x - x) ** 2 + (tc.z - z) ** 2;
        if (d2 < S2) tc.mat.toArray(SM, ks++ * 16);                 // тень
        if (d2 > R2) continue;
        _tsph.center.set(tc.x, tc.y + tc.H / 2, tc.z); _tsph.radius = B.R;
        if (!_tfr.intersectsSphere(_tsph)) continue;
        tc.mat.toArray(M, k * 16);                                  // в кадре
        if (C) tc.color.toArray(C, k * 3);
        k++;
      }
      for (const m of B.meshes) { m.count = k; m.visible = k > 0; }
      if (k) { B.matrix.needsUpdate = true; if (B.color) B.color.needsUpdate = true; }
      B.shadow.userData.n = ks; B.shadow.count = 0; B.shadow.visible = ks > 0;
      if (ks) B.shadow.instanceMatrix.needsUpdate = true;
    }
  },

  visual() {
    for (const tc of this.list) {
      if (tc.dead) continue;
      if (tc.far) { tc.mat.compose(_tv.set(tc.x, tc.y, tc.z), tc.q, _tone); continue; }
      const t = tc.body.translation(), q = tc.body.rotation();
      tc.mat.compose(_tv.set(t.x, t.y, t.z), _tq.set(q.x, q.y, q.z, q.w), _tone);
    }
  },
};
