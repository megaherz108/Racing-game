// Городской трафик.
// Боты ездят по правым полосам дорожного графа города (js/maps/city.js → world.trafficData):
// останавливаются на красный и жёлтый, на перекрёстках без светофора уступают поперечному потоку,
// кольцевые развязки объезжают, держа островок слева, держат дистанцию до машин впереди (и до игроков).
// Каждый бот — динамическое тело Rapier: пока он «в строю», скорость и поворот задаёт водитель-бот,
// поэтому удары по-честному передают импульс игрокам. После сильного удара бот теряет управление
// (становится обычным телом — может закрутиться и перевернуться) и через несколько секунд исчезает.
// Машины всегда держатся вокруг игроков: далёкие исчезают и появляются снова в 170–380 м от игроков.
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.

/* =====================================================================
   СВЕТОФОРЫ (общие для визуала карты и ботов)
   ===================================================================== */
// с: по оси z 11 зелёный + 2 жёлтый, 1 с все красные, затем то же по оси x
const LIGHT_CYCLE = 28;
function trafficLight(x, z, axis, t) {
  const c = ((t + x * 0.37 + z * 0.11) % LIGHT_CYCLE + LIGHT_CYCLE) % LIGHT_CYCLE;   // у каждого перекрёстка своя фаза
  if (axis === 'z') return c < 11 ? 'g' : c < 13 ? 'y' : 'r';
  return c < 14 ? 'r' : c < 25 ? 'g' : c < 27 ? 'y' : 'r';
}

/* =====================================================================
   МОДЕЛИ: такси, автобус, грузовик (остальные — модели машин игроков)
   ===================================================================== */
function canvasMat(w, h, draw, basic = false) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return basic ? new THREE.MeshBasicMaterial({ map: t }) : new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 });
}
function addWheels(root, list, rim = 0xb9bec6) {
  for (const [z, r, w, track] of list) for (const side of [1, -1]) {
    const pivot = new THREE.Group(); pivot.position.set(side * track, r, z); root.add(pivot);
    pivot.add(makeWheel(r, w, side, rim));
  }
}
function buildTaxiModel() {
  const def = CARS.find(c => c.id === 'corolla'), m = buildCarModel(def, 0xf2c230), g = def.geo;
  const sign = canvasMat(128, 32, (x, w, h) => {
    x.fillStyle = '#fff6d0'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#1b1b1b'; x.font = 'bold 26px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('TAXI', w / 2, h / 2 + 1);
  }, true);
  box(0.7, 0.22, 0.28, sign, 0, 1.52, -0.42, m.body);
  const checker = canvasMat(64, 8, (x, w, h) => { for (let i = 0; i < 16; i++) { x.fillStyle = (i % 2) ? '#111' : '#f2c230'; x.fillRect(i * 4, 0, 4, 4); x.fillStyle = (i % 2) ? '#f2c230' : '#111'; x.fillRect(i * 4, 4, 4, 4); } });
  box(g.W + 0.02, 0.12, 2.6, checker, 0, 0.74, -0.1, m.body);
  return { root: m.root, paint: m.paint, dims: { L: g.L, W: g.W, H: g.H } };
}
function buildBusModel(color) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const paint = new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.45 });
  const white = MAT.plate;
  box(2.5, 2.55, 11, paint, 0, 1.8, 0, body);
  box(2.52, 0.95, 9.3, MAT.glass, 0, 2.38, -0.55, body);
  box(2.3, 1.55, 0.06, MAT.glass, 0, 2.15, 5.51, body);
  box(2.3, 0.9, 0.06, MAT.glass, 0, 2.5, -5.51, body);
  box(2.4, 0.12, 10.6, white, 0, 3.12, 0, body);
  box(1.4, 0.32, 2.6, MAT.trim, 0, 3.3, -1.2, body);
  box(1.7, 0.3, 0.05, MAT.amber, 0, 2.86, 5.54, body);
  for (const dz of [4.2, -0.4]) box(0.06, 2.1, 1.3, MAT.glass, -1.27, 1.6, dz, body);         // двери справа по ходу
  for (const s of [1, -1]) {
    box(0.36, 0.2, 0.05, MAT.head, s * 0.86, 0.95, 5.53, body);
    box(0.24, 0.42, 0.05, MAT.tail, s * 1.02, 1.05, -5.53, body);
  }
  box(2.5, 0.38, 0.16, MAT.black, 0, 0.62, 5.56, body);
  box(2.5, 0.38, 0.16, MAT.black, 0, 0.62, -5.56, body);
  box(0.52, 0.12, 0.03, MAT.plate, 0, 0.9, -5.6, body);
  addWheels(root, [[3.7, 0.52, 0.32, 1.02], [-3.3, 0.52, 0.32, 1.02]]);
  return { root, paint, dims: { L: 11.2, W: 2.5, H: 3.4 } };
}
function buildTruckModel(color) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const paint = new THREE.MeshStandardMaterial({ color, metalness: 0.4, roughness: 0.4 });
  const cargo = new THREE.MeshStandardMaterial({ color: 0xf0efe9, roughness: 0.7 });
  box(1.2, 0.3, 7.6, MAT.black, 0, 0.75, 0.25, body);                 // рама
  box(2.4, 2.25, 2.2, paint, 0, 1.85, 3.0, body);                     // кабина
  box(2.2, 0.95, 0.05, MAT.glass, 0, 2.42, 4.12, body);
  box(2.42, 0.75, 1.1, MAT.glass, 0, 2.45, 3.25, body);
  box(1.6, 0.55, 0.05, MAT.black, 0, 1.25, 4.12, body);
  box(2.4, 0.3, 0.22, MAT.black, 0, 0.78, 4.2, body);
  for (const s of [1, -1]) {
    box(0.3, 0.18, 0.05, MAT.head, s * 0.92, 1.25, 4.13, body);
    box(0.2, 0.3, 0.05, MAT.tail, s * 1.1, 1.2, -3.86, body);
    box(0.06, 0.26, 0.2, MAT.black, s * 1.28, 2.4, 3.9, body);         // зеркала
  }
  box(2.5, 2.8, 5.8, cargo, 0, 2.3, -0.9, body);                      // фургон
  box(2.52, 0.45, 5.6, paint, 0, 1.6, -0.9, body);
  box(0.52, 0.12, 0.03, MAT.plate, 0, 0.95, -3.83, body);
  addWheels(root, [[3.0, 0.5, 0.3, 0.98], [-1.9, 0.5, 0.36, 0.98], [-3.0, 0.5, 0.36, 0.98]]);
  return { root, paint, dims: { L: 8.3, W: 2.5, H: 3.7 } };
}

// «Запекание» модели: все меши сливаются по материалу в несколько геометрий (≈10 вызовов отрисовки на машину
// вместо ~60). Колёса запекаются вместе с кузовом — у ботов они не крутятся.
function bakeModel(root, paint) {
  root.updateMatrixWorld(true);
  const groups = new Map();
  const keyOf = m => m.map || m.isMeshBasicMaterial ? m.uuid
    : [m.color.getHex(), m.emissive.getHex(), m.metalness, m.roughness, m.transparent, m.side].join('|');
  root.traverse(o => {
    if (!o.isMesh) return;
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.clearGroups(); g.applyMatrix4(o.matrixWorld);
    const isPaint = o.material === paint, k = isPaint ? 'paint' : keyOf(o.material);
    let e = groups.get(k);
    if (!e) groups.set(k, e = { mat: o.material, paint: isPaint, geos: [] });
    e.geos.push(g);
  });
  return [...groups.values()].map(e => {
    const geo = mergeGeometries(e.geos); geo.computeBoundingSphere();
    for (const g of e.geos) g.dispose();
    return { geo, mat: e.mat, paint: e.paint };
  });
}

// Все детали без текстуры (стекло, хром, шины, фары…) сливаются в одну геометрию: цвет, шероховатость,
// металличность и свечение каждого материала переносятся в атрибуты вершин, а общий материал читает их в шейдере.
// Внешний вид тот же, а машина трафика рисуется за 2 вызова (кузов + остальное) вместо ~11.
let _bakedMat = null;
function bakedPartsMaterial() {
  if (_bakedMat) return _bakedMat;
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true });
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec2 aRM; attribute vec3 aEm; varying vec2 vRM; varying vec3 vEm;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vRM = aRM; vEm = aEm;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 vRM; varying vec3 vEm;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = vRM.x;`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor = vRM.y;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance = vEm;`);
  };
  return _bakedMat = m;
}
function mergeBakedParts(parts) {
  const ok = p => !p.paint && p.mat.isMeshStandardMaterial && !p.mat.map && !p.mat.transparent && !p.mat.flatShading &&
    p.mat.side === THREE.FrontSide && (p.mat.envMapIntensity ?? 1) === 1;
  const plain = parts.filter(ok);
  if (plain.length < 2) return parts;
  const geos = plain.map(p => {
    const g = p.geo.clone(), n = g.attributes.position.count, M = p.mat;
    const col = new Float32Array(n * 3), rm = new Float32Array(n * 2), em = new Float32Array(n * 3);
    const e = M.emissive.clone().multiplyScalar(M.emissiveIntensity);
    for (let i = 0; i < n; i++) {
      col[i * 3] = M.color.r; col[i * 3 + 1] = M.color.g; col[i * 3 + 2] = M.color.b;
      rm[i * 2] = M.roughness; rm[i * 2 + 1] = M.metalness;
      em[i * 3] = e.r; em[i * 3 + 1] = e.g; em[i * 3 + 2] = e.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aRM', new THREE.BufferAttribute(rm, 2));
    g.setAttribute('aEm', new THREE.BufferAttribute(em, 3));
    return g;
  });
  const geo = mergeGeometries(geos); geo.computeBoundingSphere();
  for (const g of geos) g.dispose();
  return [...parts.filter(p => !ok(p)), { geo, mat: bakedPartsMaterial(), paint: false }];
}

/* =====================================================================
   ТИПЫ МАШИН
   ===================================================================== */
const CAR_PAINTS = [0xeef1f5, 0x1b1d22, 0x8e959e, 0xc81f2d, 0x1e3566, 0x2f6b4a, 0xb9bec6, 0x6e1322, 0xd8d2c4, 0x3b5f8a, 0x4a4f57, 0x7a5a3c];
// w — частота появления, vmax — крейсерская скорость (м/с), accel — разгон (м/с²)
const TRAFFIC_TYPES = [
  { id: 'corolla', w: 16, vmax: 13, mass: 1300, accel: 2.6, paints: CAR_PAINTS },
  { id: 'accord', w: 12, vmax: 13.5, mass: 1450, accel: 2.6, paints: CAR_PAINTS },
  { id: 'x5', w: 9, vmax: 13.5, mass: 2100, accel: 2.4, paints: CAR_PAINTS },
  { id: 'hummer', w: 4, vmax: 12, mass: 2900, accel: 2.0, paints: [0x56613a, 0xcbb487, 0x1b1d22, 0xeef1f5] },
  { id: 'aventador', w: 3, vmax: 15, mass: 1600, accel: 3.5, paints: [0x86cf12, 0xff7400, 0xf2c230, 0xc81f2d] },
  { id: 'taxi', w: 15, vmax: 14, mass: 1300, accel: 2.8, paints: [0xf2c230] },
  { id: 'bus', w: 7, vmax: 9.5, mass: 9000, accel: 1.3, paints: [0x2f8f5b, 0xd23a2f, 0x2a5bd7, 0xf2c230] },
  { id: 'truck', w: 9, vmax: 10.5, mass: 7000, accel: 1.5, paints: [0xd23a2f, 0x2a5bd7, 0x2f8f5b, 0xff8a2a, 0x6b6f74] },
];

/* =====================================================================
   ДОРОЖНЫЙ ГРАФ
   ===================================================================== */
// lanes — смещения полос от оси дороги вправо по ходу движения (0 — ближняя к центру)
function buildTrafficGraph(td) {
  const nodes = new Map(), edges = [];
  for (const n of td.nodes) if (n.deg > 0) nodes.set(n.x + ',' + n.z, { x: n.x, z: n.z, wx: n.wx, wz: n.wz, out: [], occ: new Set(), lit: td.lit.has(n.x + ',' + n.z), round: 0 });
  for (const r of td.rounds) { const n = nodes.get(r.x + ',' + r.z); if (n) n.round = r.r + 2.4; }
  for (const s of td.segs) {
    if (s.kind === 'draw' || s.ramp) continue;               // разводной мост и пандусы эстакады — не для трафика
    const a = nodes.get(s.x0 + ',' + s.z0), b = nodes.get(s.x1 + ',' + s.z1);
    if (!a || !b) continue;
    for (const [A, B] of [[a, b], [b, a]]) {
      const dx = B.x - A.x, dz = B.z - A.z, len = Math.hypot(dx, dz);
      const lanes = s.w >= 22 ? [3.2, 7.6] : s.w >= 20 ? [2.9, 6.9] : [3.5];
      const e = { A, B, fx: dx / len, fz: dz / len, len, axis: s.dir, lanes, bridge: s.kind === 'bridge' };
      A.out.push(e); edges.push(e);
    }
  }
  // начало и конец полосы — у краёв перекрёстков (за «зеброй»)
  const off = (n, e) => (e.axis === 'z' ? n.wz : n.wx) / 2 + (n.out.length >= 3 ? 4.6 : 1.2);
  for (const e of edges) { e.s0 = off(e.A, e); e.s1 = e.len - off(e.B, e); }
  return { nodes: [...nodes.values()], edges: edges.filter(e => e.s1 - e.s0 > 6) };
}
const lanePoint = (e, l, s) => [e.A.x + e.fx * s - e.fz * e.lanes[l], e.A.z + e.fz * s + e.fx * e.lanes[l]];

// участок маршрута — ломаная с накопленной длиной
function tPiece(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, len: cum[cum.length - 1] };
}
function tPieceAt(p, s, out) {
  s = clamp(s, 0, p.len);
  let i = 1;
  while (i < p.pts.length - 1 && p.cum[i] < s) i++;
  const a = p.pts[i - 1], b = p.pts[i], L = p.cum[i] - p.cum[i - 1] || 1, t = (s - p.cum[i - 1]) / L;
  out[0] = a[0] + (b[0] - a[0]) * t; out[1] = a[1] + (b[1] - a[1]) * t; out[2] = (b[0] - a[0]) / L; out[3] = (b[1] - a[1]) / L;
  return out;
}
// проекция точки на ломаную (ищем рядом с текущим положением s)
function tPieceProject(p, x, z, s) {
  let i = 1; while (i < p.pts.length - 1 && p.cum[i] < s) i++;
  let best = s, bd = Infinity;
  for (let k = Math.max(1, i - 1); k <= Math.min(p.pts.length - 1, i + 2); k++) {
    const a = p.pts[k - 1], b = p.pts[k], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
    const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / L2, 0, 1), px = a[0] + dx * t, pz = a[1] + dz * t, d = (px - x) ** 2 + (pz - z) ** 2;
    if (d < bd) { bd = d; best = p.cum[k - 1] + Math.sqrt(L2) * t; }
  }
  return [best, Math.sqrt(bd)];
}
// путь через перекрёсток: кривая Безье, а на кольцевой развязке — дуга с островком слева
function turnPiece(e, l, ne, nl) {
  const P0 = lanePoint(e, l, e.s1), P2 = lanePoint(ne, nl, ne.s0), B = e.B, pts = [P0];
  if (B.round) {
    const a0 = Math.atan2(P0[1] - B.z, P0[0] - B.x), a2 = Math.atan2(P2[1] - B.z, P2[0] - B.x);
    let a1 = a2; while (a1 > a0 - 0.6) a1 -= Math.PI * 2;      // угол убывает — центр слева по ходу
    for (let a = a0 - 0.3; a > a1 + 0.3; a -= 0.22) pts.push([B.x + Math.cos(a) * B.round, B.z + Math.sin(a) * B.round]);
  } else {
    const dot = e.fx * ne.fx + e.fz * ne.fz, det = e.fx * ne.fz - e.fz * ne.fx, mx = (P0[0] + P2[0]) / 2, mz = (P0[1] + P2[1]) / 2;
    let P1;
    if (dot < -0.9) P1 = [mx + e.fx * 10, mz + e.fz * 10];                       // разворот в тупике
    else if (Math.abs(det) < 0.1) P1 = [mx, mz];                                   // прямо
    else { const dx = P2[0] - P0[0], dz = P2[1] - P0[1], t = (dx * ne.fz - dz * ne.fx) / det; P1 = [P0[0] + e.fx * t, P0[1] + e.fz * t]; }
    for (let k = 1; k < 10; k++) {
      const t = k / 10, u = 1 - t;
      pts.push([u * u * P0[0] + 2 * u * t * P1[0] + t * t * P2[0], u * u * P0[1] + 2 * u * t * P1[1] + t * t * P2[1]]);
    }
  }
  pts.push(P2);
  return tPiece(pts);
}

/* =====================================================================
   ТРАФИК
   ===================================================================== */
const TRAFFIC_FAR = 170, TRAFFIC_NEAR = 140;              // дальше FAR от обоих игроков — без физики, ближе NEAR — снова с физикой
const TRAFFIC_SHADOW_R = 105;                              // в карту теней попадают машины ближе этого к игроку (она 140 × 140 м вокруг него)
// меш «только для теней»: в обычном проходе у него 0 экземпляров, в проходе теней — машины вокруг игрока
const _shadowOnlyMat = new THREE.MeshBasicMaterial();
function shadowBefore() { this.count = this.userData.n; }
function shadowAfter() { this.count = 0; }
const _tq = new THREE.Quaternion(), _te = new THREE.Euler(0, 0, 0, 'YXZ'), _tp = [0, 0, 0, 0];
const _tv = new THREE.Vector3(), _tone = new THREE.Vector3(1, 1, 1), _tfr = new THREE.Frustum(), _tpm = new THREE.Matrix4(), _tsph = new THREE.Sphere();
const Traffic = {
  list: [], graph: null, templates: {}, world: null, timer: 0, count: 0, target: 0, _cand: [], _cw: [], hash: new Map(), _near: [],
  // отрисовка: на каждый тип машины — InstancedMesh кузова и остального (2 вызова отрисовки на тип вместо ≈11 на машину)
  // с общим буфером матриц, цвет кузова — цвет экземпляра; плюс отдельный меш для карты теней (см. cullView)
  batches: [],

  template(id) {
    if (this.templates[id]) return this.templates[id];
    let m;
    if (id === 'taxi') m = buildTaxiModel();
    else if (id === 'bus') m = buildBusModel(0xffffff);
    else if (id === 'truck') m = buildTruckModel(0xffffff);
    else { const def = CARS.find(c => c.id === id); const cm = buildCarModel(def, 0xffffff); m = { root: cm.root, paint: cm.paint, dims: { L: def.geo.L, W: def.geo.W, H: def.geo.H } }; }
    const t = { parts: mergeBakedParts(bakeModel(m.root, m.paint)), dims: m.dims, paintBase: m.paint };
    // для карты теней материалы не важны: вся машина — одна геометрия (только позиции)
    t.shadowGeo = mergeGeometries(t.parts.map(p => { const g = new THREE.BufferGeometry(); g.setAttribute('position', p.geo.attributes.position); return g; }));
    m.root.traverse(o => { if (o.geometry) o.geometry.dispose(); });   // материалы остаются — ими пользуются запечённые части
    return this.templates[id] = t;
  },

  start(w, count) {
    this.clear();
    if (!w.trafficData || !count) return;
    this.world = w;
    if (!w.__trafficGraph) w.__trafficGraph = buildTrafficGraph(w.trafficData);
    this.graph = w.__trafficGraph;
    for (const n of this.graph.nodes) n.occ.clear();
    // count — число машин вокруг игроков, когда они рядом; разъехавшимся игрокам нужно вдвое больше,
    // чтобы плотность вокруг каждого не падала (см. postStep), поэтому создаём запас ×2
    this.count = this.target = count;
    const total = TRAFFIC_TYPES.reduce((s, t) => s + t.w, 0);
    for (let i = 0; i < count * 2; i++) {
      let r = Math.random() * total, type = TRAFFIC_TYPES[0];
      for (const t of TRAFFIC_TYPES) { if (r < t.w) { type = t; break; } r -= t.w; }
      const tc = this.create(type);
      if (i >= count) this.kill(tc);
      else if (!this.respawn(tc, 30, 380)) this.respawn(tc, 30, 1e9);
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
    const tc = { type, color, mat, body, collider, L, W, H, mass: type.mass, vmax: type.vmax * (0.9 + Math.random() * 0.2), accel: type.accel,
      v: 0, h: 0, x: 0, z: 0, y: 0, dead: true, tick: Math.random() < 0.5 ? 1 : 0, wreck: false, wreckT: 0, flipCd: 0, stuckT: 0, ghostT: 0, obs: Infinity, scan: Math.floor(Math.random() * 3), far: false, q: new THREE.Quaternion(), waitT: 0 };
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
    this.list = []; this.graph = null; this.world = null;
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
      for (const o of this.list) if (!o.dead && (o.x - c.x) ** 2 + (o.z - c.z) ** 2 < 400 * 400) n++;
      if (n < bn) { bn = n; best = c; }
    }
    return best;
  },

  // поставить бота на свободную полосу в кольце minD…maxD вокруг игрока. Полоса выбирается с весом по длине
  // (иначе районы с крупными кварталами и длинными улицами получают меньше машин на метр дороги);
  // едущему игроку машины ставятся в основном впереди — сзади они быстро отстанут и исчезнут
  respawn(tc, minD, maxD) {
    if (tc.node) { tc.node.occ.delete(tc); tc.node = null; }
    const P = this.spawnAnchor(), E = this.graph.edges, cand = this._cand, cw = this._cw;
    cand.length = cw.length = 0;
    let tot = 0;
    for (const e of E) {
      if (tc.L > 6 && (e.B.round || e.A.round)) continue;
      const d = Math.hypot((e.A.x + e.B.x) / 2 - P.x, (e.A.z + e.B.z) / 2 - P.z), h = e.len / 2;
      if (d + h < minD || d - h > maxD) continue;
      tot += (e.s1 - e.s0) * e.lanes.length; cand.push(e); cw.push(tot);
    }
    const sp = Math.hypot(P.vx || 0, P.vz || 0);
    for (let k = 0; k < 40 && cand.length; k++) {
      const r = Math.random() * tot;
      let lo = 0, hi = cw.length - 1;
      while (lo < hi) { const m = (lo + hi) >> 1; if (cw[m] < r) lo = m + 1; else hi = m; }
      const e = cand[lo], l = Math.floor(Math.random() * e.lanes.length);
      const s = e.s0 + Math.random() * (e.s1 - e.s0 - 2), [x, z] = lanePoint(e, l, s);
      const dP = Math.hypot(x - P.x, z - P.z);
      if (dP < minD || dP > maxD) continue;
      if (sp > 8 && ((x - P.x) * P.vx + (z - P.z) * P.vz) / (dP * sp) < -0.2 && Math.random() < 0.75) continue;
      let dmin = Infinity; for (const c of cars) dmin = Math.min(dmin, Math.hypot(c.x - x, c.z - z));
      if (dmin < minD) continue;
      if (this.list.some(o => o !== tc && !o.dead && (o.x - x) ** 2 + (o.z - z) ** 2 < 13 * 13)) continue;
      this.enterEdge(tc, e, l, s - e.s0);
      const y = this.world.surface ? this.world.surface(x, z, e.bridge ? Infinity : 1) : this.world.ground(x, z);
      tc.h = Math.atan2(e.fx, e.fz); tc.x = x; tc.z = z; tc.y = y;
      const b = tc.body;
      b.setEnabled(true);
      b.lockRotations(true, true); tc.collider.setFriction(0); b.setLinearDamping(0); b.setAngularDamping(0);
      // пока машиной управляет бот: без гравитации и без контакта с рельефом — высоту задаёт preStep()
      tc.collider.setCollisionGroups(TRAFFIC_DRIVEN_GROUPS); b.setGravityScale(0, true);
      b.setTranslation({ x, y: y + 0.05, z }, true);
      _tq.setFromEuler(_te.set(0, tc.h, 0)); b.setRotation({ x: _tq.x, y: _tq.y, z: _tq.z, w: _tq.w }, true);
      b.setLinvel({ x: 0, y: 0, z: 0 }, true); b.setAngvel({ x: 0, y: 0, z: 0 }, true);
      Object.assign(tc, { dead: false, wreck: false, wreckT: 0, v: tc.vmax * 0.6, stuckT: 0, ghostT: 0, waitT: 0, obs: Infinity, far: dmin > TRAFFIC_FAR });
      if (tc.far) { tc.q.copy(_tq); b.setEnabled(false); }
      tc.mat.compose(_tv.set(x, y + 0.05, z), _tq, _tone);
      return true;
    }
    this.kill(tc);
    return false;
  },

  // убрать бота в запас (невидим, тело выключено)
  kill(tc) {
    if (tc.node) { tc.node.occ.delete(tc); tc.node = null; }
    tc.dead = true; tc.far = false; tc.body.setEnabled(false);
  },

  // въезд на полосу: строим участок и сразу выбираем, куда повернём на следующем перекрёстке
  enterEdge(tc, e, l, s) {
    tc.e = e; tc.l = l; tc.kind = 'lane'; tc.s = s; tc.goYellow = false;
    tc.piece = tPiece([lanePoint(e, l, e.s0), lanePoint(e, l, e.s1)]);
    let opts = e.B.out.filter(o => o.B !== e.A);
    if (!opts.length) opts = e.B.out;                         // тупик — разворот
    // автобусы и грузовики не заезжают на кольцевые развязки: длинный кузов задевает островок
    if (tc.L > 6) { const o2 = opts.filter(o => !o.B.round); if (o2.length) opts = o2; }
    let total = 0;
    const ws = opts.map(o => { const st = Math.abs(e.fx * o.fz - e.fz * o.fx) < 0.1; const w = st ? 3 : 1.5; total += w; return w; });
    let r = Math.random() * total, ne = opts[0];
    for (let i = 0; i < opts.length; i++) { if (r < ws[i]) { ne = opts[i]; break; } r -= ws[i]; }
    const cr = e.fx * ne.fz - e.fz * ne.fx, dot = e.fx * ne.fx + e.fz * ne.fz;
    // правый поворот — в крайнюю правую полосу, левый — в ближнюю к центру, прямо — в ту же
    tc.ne = ne; tc.nl = ne.lanes.length === 1 ? 0 : cr > 0.5 ? 1 : cr < -0.5 ? 0 : Math.min(l, 1);
    tc.turnV = e.B.round ? 6.5 : dot < -0.9 ? 4 : cr > 0.5 ? 5.5 : cr < -0.5 ? 7.5 : 99;
    tc.isLeft = !e.B.round && cr < -0.5 && dot > -0.9;
  },

  enterTurn(tc, s) {
    const node = tc.e.B;
    tc.kind = 'turn'; tc.s = s; tc.piece = turnPiece(tc.e, tc.l, tc.ne, tc.nl);
    tc.node = node; node.occ.add(tc);
  },

  // перекрёсток без светофора занят поперечным потоком (на кольце — любым другим въездом)
  blocked(tc) {
    const n = tc.e.B;
    if (n.out.length <= 2) return false;
    for (const o of n.occ) if (o !== tc && !o.wreck && this.conflicts(tc, o)) return true;
    // очерёдность: кто долго ждёт на поперечном въезде, того пропускаем (иначе плотный поток
    // по главной навсегда запирает второстепенную дорогу)
    if (!n.lit) for (const o of this.nearby(n.x, n.z))
      if (o.waitT > 5 && o.waitT > tc.waitT && o !== tc && !o.dead && !o.wreck && o.kind === 'lane' && o.e.B === n && this.conflicts(tc, o)) return true;
    return false;
  },
  // пути двух машин через перекрёсток пересекаются: поперечный поток; встречный, если кто-то
  // из двоих поворачивает налево; на кольце — любые разные въезды
  conflicts(tc, o) {
    if (tc.e.B.round) return o.e !== tc.e;
    const opp = o.e.fx * tc.e.fx + o.e.fz * tc.e.fz < -0.9;
    return o.e.axis !== tc.e.axis || (opp && (o.isLeft || tc.isLeft));
  },

  // поворот налево уступает встречным, которые едут прямо или направо
  oncoming(tc) {
    const B = tc.e.B;
    for (const o of this.nearby(B.x, B.z, 2)) {
      if (o === tc || o.dead || o.wreck || o.isLeft || o.e.fx * tc.e.fx + o.e.fz * tc.e.fz > -0.9) continue;
      if (o.kind === 'lane' && o.e.B === B && o.piece.len - o.s < 45 && o.v > 0.5 && !o.waiting) return true;
      if (o.kind === 'turn' && o.node === B) return true;
    }
    return false;
  },

  // не въезжать на перекрёсток, если за ним нет места: выезд занят стоящей очередью
  // (иначе машина застрянет посреди перекрёстка и запрёт поперечный поток)
  exitBlocked(tc) {
    let need = tc.L + 2.5;
    const near = this.nearby(tc.e.B.x, tc.e.B.z);
    for (const o of near)
      if (o !== tc && !o.dead && !o.wreck && o.kind === 'turn' && o.ne === tc.ne && o.nl === tc.nl) need += o.L + 2.5;
    for (const o of near)
      if (o !== tc && !o.dead && !o.wreck && o.kind === 'lane' && o.e === tc.ne && o.l === tc.nl && o.v < 3 && o.s - o.L / 2 < need) return true;
    return false;
  },

  // ближайшее препятствие впереди (бот или игрок) по ходу движения
  scanAhead(tc) {
    const fx = Math.sin(tc.h), fz = Math.cos(tc.h);
    let best = Infinity, by = null;
    // на перекрёстке смотрим вдоль траектории поворота, а не по лучу: луч на дуге «задевает» машины,
    // стоящие у стоп-линий соседних полос, и бот замирает посреди перекрёстка
    const P = tc.kind === 'turn' ? tc.piece : null;
    let ex = 0, ez = 0, efx = 0, efz = 0;
    if (P) { const a = P.pts[P.pts.length - 2], b = P.pts[P.pts.length - 1]; ex = b[0]; ez = b[1]; efx = tc.ne.fx; efz = tc.ne.fz; }
    const test = (o, ox, oz, ohw, ohl) => {
      const dx = ox - tc.x, dz = oz - tc.z;
      let fwd = dx * fx + dz * fz, lat;
      if (P ? dx * dx + dz * dz > 45 * 45 : fwd <= 0 || fwd > 40) return;
      if (P) {
        let bs = -1, bd = Infinity;
        for (let k = 1; k < P.pts.length; k++) {
          if (P.cum[k] < tc.s) continue;
          const a = P.pts[k - 1], b = P.pts[k], sx = b[0] - a[0], sz = b[1] - a[1], L2 = sx * sx + sz * sz || 1;
          const u = clamp(((ox - a[0]) * sx + (oz - a[1]) * sz) / L2, 0, 1), d = (a[0] + sx * u - ox) ** 2 + (a[1] + sz * u - oz) ** 2;
          if (d < bd) { bd = d; bs = P.cum[k - 1] + Math.sqrt(L2) * u; }
        }
        if (bs < 0) return;
        const ax = ox - ex, az = oz - ez, past = ax * efx + az * efz;
        if (bs >= P.len - 0.01 && past > 0) { fwd = P.len - tc.s + past; lat = ax * efz - az * efx; }   // за перекрёстком — по выездной полосе
        else { fwd = bs - tc.s; lat = Math.sqrt(bd); if (fwd <= 0) return; }
      } else lat = dx * fz - dz * fx;
      if (Math.abs(lat) < tc.W / 2 + ohw + 0.4 && fwd - tc.L / 2 - ohl < best) { best = fwd - tc.L / 2 - ohl; by = o; }
    };
    if (!(tc.ghostT > 0)) for (const o of this.nearby(tc.x, tc.z)) if (o !== tc && !o.dead) test(o, o.x, o.z, o.W / 2, (o.L + o.W) / 4);
    for (const c of cars) test(c, c.x, c.z, c.W / 2, (c.L + c.W) / 4);
    tc.obsBy = by;
    return best;
  },

  preStep(dt) {
    if (!this.list.length) return;
    const w = this.world;
    dt *= 2;                                                  // каждый бот управляется через шаг (60 Гц)
    this.buildHash();
    for (const tc of this.list) {
      if (tc.dead || tc.wreck || (tc.tick ^= 1)) continue;
      const b = tc.body, far = tc.far;
      if (!far) { const t = b.translation(); tc.x = t.x; tc.z = t.z; tc.y = t.y; }
      // продвижение по участку маршрута — по фактическому положению тела
      let [s, dev] = tPieceProject(tc.piece, tc.x, tc.z, tc.s);
      if (dev > 4.5 && !far) { this.wreck(tc); continue; }   // машину вытолкнули с полосы — потеряла управление
      tc.s = Math.max(tc.s, s);
      if (tc.s >= tc.piece.len - 0.05) {
        const over = tc.s - tc.piece.len;
        if (tc.kind === 'lane') this.enterTurn(tc, over);
        else { tc.node.occ.delete(tc); tc.node = null; this.enterEdge(tc, tc.ne, tc.nl, over); }
      }
      // целевая скорость
      const dEnd = tc.piece.len - tc.s;
      let vT = tc.vmax;
      if (tc.kind === 'turn') vT = Math.min(vT, tc.turnV);
      else {
        if (tc.turnV < 99) vT = Math.min(vT, Math.sqrt(tc.turnV * tc.turnV + 2 * 2.5 * dEnd));
        const B = tc.e.B;
        let stop = false;
        if (B.lit) {
          const st = trafficLight(B.x, B.z, tc.e.axis, simTime);
          // на жёлтый едет, только если уже не успевает остановиться
          if (st === 'g') tc.goYellow = false;
          else if (st === 'y' && !tc.goYellow && dEnd < tc.v * tc.v / 10 + 2) tc.goYellow = true;
          stop = st === 'r' && !tc.goYellow || st === 'y' && !tc.goYellow;
        }
        if (!stop && dEnd < 12) stop = this.blocked(tc) || (tc.isLeft && this.oncoming(tc)) || (B.out.length > 2 && this.exitBlocked(tc));
        if (stop) vT = Math.min(vT, dEnd < 0.6 ? 0 : Math.sqrt(2 * 6 * (dEnd - 0.5)));
        tc.waiting = stop;
        tc.waitT = stop && !B.lit && dEnd < 3 ? tc.waitT + dt : 0;    // сколько стоит первым у нерегулируемого перекрёстка
        // подъезжая, заранее занимаем перекрёсток — иначе две машины с разных сторон въедут одновременно
        if (B.out.length > 2) {
          if (!stop && dEnd < 9 && !tc.node) { tc.node = B; B.occ.add(tc); }
          else if (stop && tc.node === B) { B.occ.delete(tc); tc.node = null; }
        }
      }
      if ((tc.scan = (tc.scan + 1) % 2) === 0) tc.obs = this.scanAhead(tc);
      vT = Math.min(vT, tc.obs < 3.5 ? 0 : Math.sqrt(2 * 7 * (tc.obs - 3.5)));
      tc.v = tc.v < vT ? Math.min(vT, tc.v + tc.accel * dt) : Math.max(vT, tc.v - 9 * dt);
      // взаимная блокировка (два бота упёрлись друг в друга) — ненадолго перестаёт замечать других ботов;
      // в очереди за стоящей машиной или игроком просто ждёт
      if (tc.v < 0.3 && !tc.waiting) tc.stuckT += dt; else tc.stuckT = 0;
      const ob = tc.obsBy;
      if (tc.stuckT > 5 && ob && ob.type && (ob.obsBy === tc || (ob.kind === 'turn' && ob.stuckT > 3))) { tc.ghostT = 2; tc.stuckT = 0; }
      if (tc.ghostT > 0) tc.ghostT -= dt;
      // руль: целимся в точку чуть впереди на маршруте
      tPieceAt(tc.piece, tc.s + 2.5 + tc.v * 0.25, _tp);
      let dx = _tp[0] - tc.x, dz = _tp[1] - tc.z;
      const dl = Math.hypot(dx, dz);
      if (dl > 0.3) { dx /= dl; dz /= dl; tc.h = angLerp(tc.h, Math.atan2(dx, dz), Math.min(1, dt * 8)); }
      else { dx = Math.sin(tc.h); dz = Math.cos(tc.h); }
      // наклон по рельефу (горбатые мосты)
      const fx = Math.sin(tc.h), fz = Math.cos(tc.h), hl = tc.L * 0.4;
      const yF = w.surface(tc.x + fx * hl, tc.z + fz * hl, tc.y + 1.5), yB = w.surface(tc.x - fx * hl, tc.z - fz * hl, tc.y + 1.5);
      const slope = (yF - yB) / (hl * 2);
      _tq.setFromEuler(_te.set(-Math.atan(slope), tc.h, 0));
      // физический LOD: вдали от обоих игроков бот едет без тела Rapier — просто по маршруту
      // (столкнуться там не с кем, а 180 живых тел заметно нагружают физику)
      let dmin = Infinity; for (const c of cars) dmin = Math.min(dmin, (c.x - tc.x) ** 2 + (c.z - tc.z) ** 2);
      if (far) {
        tc.x += dx * tc.v * dt; tc.z += dz * tc.v * dt; tc.y = w.surface(tc.x, tc.z, tc.y + 1.5);
        tc.q.copy(_tq);
        if (dmin < TRAFFIC_NEAR * TRAFFIC_NEAR) {
          tc.far = false; b.setEnabled(true);
          b.setTranslation({ x: tc.x, y: tc.y + 0.05, z: tc.z }, true);
          b.setRotation({ x: _tq.x, y: _tq.y, z: _tq.z, w: _tq.w }, true);
          b.setLinvel({ x: dx * tc.v, y: 0, z: dz * tc.v }, true); b.setAngvel({ x: 0, y: 0, z: 0 }, true);
        }
        continue;
      }
      if (dmin > TRAFFIC_FAR * TRAFFIC_FAR) { tc.far = true; tc.q.copy(_tq); b.setEnabled(false); continue; }
      // высота: тянемся к поверхности дороги (рельеф или настил моста) — с рельефом тело не сталкивается
      const gy = w.surface(tc.x, tc.z, tc.y + 1.5);
      b.setRotation({ x: _tq.x, y: _tq.y, z: _tq.z, w: _tq.w }, true);
      b.setLinvel({ x: dx * tc.v, y: slope * tc.v + clamp((gy - tc.y) * 8, -12, 6), z: dz * tc.v }, true);
    }
  },

  wreck(tc) {
    if (tc.wreck) return;
    tc.wreck = true; tc.wreckT = 0;
    if (tc.node) { tc.node.occ.delete(tc); tc.node = null; }
    tc.body.lockRotations(false, true);
    tc.collider.setCollisionGroups(ALL_GROUPS); tc.body.setGravityScale(1, true);   // обычное тело: падает и лежит на земле
    tc.collider.setFriction(0.7);
    tc.body.setLinearDamping(0.3); tc.body.setAngularDamping(0.5);
  },

  // сильный удар: бот теряет управление; боковой — ещё и опрокидывает (flipKick из js/physics.js)
  hit(tc, dv, other, getPt) {
    if (tc.dead || dv < 1.6) return;
    if (other.kind === 'ground' || other.kind === 'deck') return;
    const th = other.kind === 'car' ? 1.8 : other.kind === 'traffic' ? 5.5 : 12;
    if (!tc.wreck && dv > th) this.wreck(tc);
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
      // разъехавшимся игрокам — до вдвое больше машин: круги вокруг них уже не перекрываются
      const dP = cars.length > 1 ? Math.hypot(cars[0].x - cars[1].x, cars[0].z - cars[1].z) : 0;
      this.target = Math.round(this.count * (1 + clamp((dP - 200) / 600, 0, 1)));
      for (const tc of this.list) if (!tc.dead) alive++;
    }
    for (const tc of this.list) {
      if (tc.flipCd > 0) tc.flipCd -= dt;
      if (tc.dead) {
        // не больше 12 появлений за проверку, чтобы не было рывков
        if (check && alive < this.target && spawned++ < 12 && this.respawn(tc, 170, 380)) alive++;
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
      if (alive > this.target && dmin > 300) { this.kill(tc); alive--; }
      else if (dmin > 400 || (tc.wreck && (tc.wreckT > 25 || (tc.wreckT > 9 && dmin > 40) || tc.y < -3)) || (tc.stuckT > 45 && dmin > 60))
        this.respawn(tc, 170, 380);
    }
  },

  // перед отрисовкой экрана игрока (камера cam, игрок в x, z): в буферы экземпляров попадают только машины,
  // которые видит эта камера, плюс ближние (их тени могут упасть в кадр). Дальше R не рисуем: это трафик вокруг
  // другого игрока, почти растворённый в тумане.
  cullView(cam, x, z, R = 520) {
    cam.updateMatrixWorld();
    _tfr.setFromProjectionMatrix(_tpm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const R2 = R * R, S2 = TRAFFIC_SHADOW_R * TRAFFIC_SHADOW_R;
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
