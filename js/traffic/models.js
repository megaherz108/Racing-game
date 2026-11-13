// Трафик — модели и типы машин.
// Модели такси, автобуса и грузовика из примитивов; остальные типы берут модели машин игроков (buildCarModel).
// bakeModel() «запекает» модель: кузов отдельно, остальное слито в одну геометрию с цветом/материалом в вершинах.
// TRAFFIC_TYPES — частота появления, скорость, разгон каждого типа.
// Определяет: canvasMat, addWheels, buildTaxiModel, buildBusModel, buildTruckModel, bakeModel, bakedPartsMaterial,
//   mergeBakedParts, CAR_PAINTS, TRAFFIC_TYPES.
// Использует: CARS (js/data.js); makeWheel, box, MAT (js/core.js); buildCarModel (js/car-models.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

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

