// Рендерер, общие материалы и хелперы для моделей
// Определяет: QUAL, renderer, pmrem, envTex, clamp, lerp, rand, shared, MAT, box, cyl, beam, extrude, polyShape,
//   lowerShape, mergeByMaterial, makeWheel.
// Использует: QUALITY, save (js/data.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

/* =====================================================================
   RENDERER
   ===================================================================== */
const QUAL = QUALITY[save.quality];                 // настройка качества (js/data.js) — читается при загрузке страницы
const renderer = new THREE.WebGLRenderer({ antialias: QUAL.aa });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5) * QUAL.scale);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = QUAL.shadows;           // на «Минимуме» выключено: шейдеры собираются без выборки тени
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.prepend(renderer.domElement);

const pmrem = new THREE.PMREMGenerator(renderer);
const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

/* =====================================================================
   HELPERS
   ===================================================================== */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);

function shared(m) { m.userData.shared = true; return m; }
const MAT = {
  glass: shared(new THREE.MeshStandardMaterial({ color: 0x1d2d3e, metalness: 0.6, roughness: 0.06 })),
  black: shared(new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.7, metalness: 0.1 })),
  trim: shared(new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.5, metalness: 0.3 })),
  chrome: shared(new THREE.MeshStandardMaterial({ color: 0xe6e9ee, metalness: 1, roughness: 0.15 })),
  tire: shared(new THREE.MeshStandardMaterial({ color: 0x18191b, roughness: 0.92 })),
  head: shared(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2d6, emissiveIntensity: 1.8, roughness: 0.2 })),
  tail: shared(new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff1c1c, emissiveIntensity: 1.6, roughness: 0.3 })),
  amber: shared(new THREE.MeshStandardMaterial({ color: 0x553300, emissive: 0xff9a1a, emissiveIntensity: 1.2 })),
  plate: shared(new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.5 })),
};

function box(w, h, d, mat, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m;
}
function cyl(rt, rb, h, seg, mat, parent) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.castShadow = true; parent.add(m); return m;
}
function beam(a, b, t, mat, parent) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const dir = B.clone().sub(A); const len = dir.length();
  const m = new THREE.Mesh(new THREE.BoxGeometry(t, t, len), mat);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.normalize());
  m.castShadow = true; parent.add(m); return m;
}
// Профиль (z,y) → вытягивание по ширине (ось X машины)
function extrude(shape, width, mat, bevel, parent) {
  const depth = Math.max(0.01, width - bevel * 2);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 12,
  });
  geo.translate(0, 0, -depth / 2);
  geo.rotateY(-Math.PI / 2);
  const m = new THREE.Mesh(geo, mat); m.castShadow = true; parent.add(m); return m;
}
function polyShape(pts) {
  const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  s.closePath(); return s;
}
// Нижняя часть кузова с колёсными арками
function lowerShape(L, bottomY, arches, top) {
  const s = new THREE.Shape();
  s.moveTo(-L / 2 + 0.05, bottomY);
  for (const a of arches) {
    const al = Math.asin(clamp((bottomY - a.cy) / a.r, -0.95, 0.95));
    const dx = a.r * Math.cos(al);
    s.lineTo(a.z - dx, bottomY);
    s.absarc(a.z, a.cy, a.r, Math.PI - al, al, true);
    s.lineTo(a.z + dx, bottomY);
  }
  s.lineTo(L / 2 - 0.05, bottomY);
  for (const [z, y] of top) s.lineTo(z, y);
  s.closePath();
  return s;
}

// Склеить все меши внутри group в один меш на материал (координаты — в системе group).
// Внешний вид не меняется, а вызовов отрисовки — в разы меньше. disposeOld — освободить исходные геометрии
// (только если они больше никем не используются). Меши с зеркальной матрицей и мультиматериалом не трогаем.
const _mbInv = new THREE.Matrix4(), _mbM = new THREE.Matrix4();
function mergeByMaterial(group, disposeOld = false) {
  group.updateMatrixWorld(true);
  _mbInv.copy(group.matrixWorld).invert();
  const old = [];
  group.traverse(o => {
    if (o === group || !o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || Array.isArray(o.material) || o.userData.keep) return;
    if (o.matrixWorld.determinant() <= 0) return;
    old.push(o);
  });
  if (old.length < 2) return group;
  const buckets = new Map();
  for (const o of old) {
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    g.morphAttributes = {};
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.clearGroups();
    g.applyMatrix4(_mbM.multiplyMatrices(_mbInv, o.matrixWorld));
    const key = o.material.uuid + (o.castShadow ? 's' : '') + (o.receiveShadow ? 'r' : '') + (o.layers.mask);
    let b = buckets.get(key);
    if (!b) buckets.set(key, b = { mat: o.material, cast: o.castShadow, recv: o.receiveShadow, layers: o.layers.mask, geos: [] });
    b.geos.push(g);
    o.removeFromParent();
    if (disposeOld) o.geometry.dispose();
  }
  for (const b of buckets.values()) {
    const geo = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos);
    if (b.geos.length > 1) for (const g of b.geos) g.dispose();
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, b.mat);
    m.castShadow = b.cast; m.receiveShadow = b.recv; m.layers.mask = b.layers;
    group.add(m);
  }
  return group;
}

function makeWheel(r, w, side, rimColor) {
  const spin = new THREE.Group();
  const rimMat = new THREE.MeshStandardMaterial({ color: rimColor, metalness: 0.85, roughness: 0.3 });
  const tire = cyl(r, r, w, 22, MAT.tire, spin); tire.rotation.z = Math.PI / 2;
  const rim = cyl(r * 0.64, r * 0.64, w + 0.012, 16, rimMat, spin); rim.rotation.z = Math.PI / 2;
  const hub = cyl(r * 0.15, r * 0.15, w + 0.05, 8, MAT.trim, spin); hub.rotation.z = Math.PI / 2;
  for (let k = 0; k < 3; k++) {
    const sp = box(0.03, r * 1.22, r * 0.14, rimMat, side * (w / 2 + 0.008), 0, 0, spin);
    sp.rotation.x = k * Math.PI / 3;
  }
  return mergeByMaterial(spin, true);            // шина, диск со спицами, ступица — 3 меша вместо 6
}

