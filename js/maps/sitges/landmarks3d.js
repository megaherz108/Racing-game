// Ситжес — ПОСТРОЙКА: достопримечательности (этапы 5–6, docs/sitges/stage-5.md) и общий набор помощников для их
// моделей (js/maps/sitges/lm/<id>.js). Раскладка — C.landmarks (js/maps/sitges/landmarks.js).
//   sitgesBuildLandmarks(K): у каждого готового строения (L.ready) — своя группа, def.build(K, L, group); меши
//   из помощников ниже — обычные (optimizeStatic() склеит их по материалу и квадрату, тень — теневые копии);
//   анимированное помечать userData.dynamic. Столкновения — lmCollide / lmCollideBox (призмы в сетке K.grid).
//   Сводка — K.lmStats: { id: треугольников } (world.stats.lm, tools/sitges/check.js).
// Помощники (координаты игры, y — абсолютная высота; развёртка текстур — в метрах, LMK.uv м на повтор):
//   lmMat(hex, { tex, rough, metal, side, alpha }) — общий материал (кэш, userData.shared); tex — 'stone' (тёсаный
//     камень), 'rubble' (бут), 'tile' (черепица рядами), 'plaster' (штукатурка), 'brick'; цвет умножает текстуру.
//   lmBox(parent, mat, w, h, d, x, y, z, rot) — ящик, центр низа в (x, y, z), поворот rot как rotation.y.
//   lmPrism(parent, mat, ring, y0, y1, { cap, bottom }) — стены по контуру [[x, z], …] от y0 до y1 и крышка.
//   lmCyl(parent, mat, r, h, x, y, z, { seg, top, cap }) — цилиндр / конус (top — радиус верха), низ в y.
//   lmExtrude(parent, mat, shape, depth, x, y, z, rot) — плоская фигура THREE.Shape (в плоскости x–y) толщиной depth,
//     ось z фигуры — вдоль нормали стены (rot как rotation.y); lmArch(w, h, spring) — арка (прямые бока до spring,
//     полукруг или стрельчатая при spring < 0: −1 — готика).
//   lmFrame(ring) — наименьший повёрнутый прямоугольник контура: { cx, cz, ux, uz (длинная ось), vx, vz, len, wid,
//     rot (rotation.y, при котором локальная x меша — вдоль длинной оси), at(u, v) → [x, z] }.
//   lmRoof(parent, mat, F, y, { kind: 'gable' | 'hip' | 'pyramid' | 'flat', pitch, over }) — крыша над рамкой F.
//   lmInset(ring, d) — контур, сдвинутый внутрь на d (d < 0 — наружу); lmAlong(a, b, n, fn) — n точек на отрезке.
//   lmCollide(K, ring, y0, y1), lmCollideBox(K, x, z, w, d, rot, y0, y1) — столкновения.
// Определяет: LMK, lmTex, lmMat, lmBox, lmPrism, lmCyl, lmArch, lmExtrude, lmFrame, lmRoof, lmInset, lmAlong,
//   lmCollide, lmCollideBox, sitgesBuildLandmarks.
// Использует: canvasTex (js/maps/city/textures.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const LMK = {
  uv: 2,            // метров на повтор текстуры
  tris: 40000,      // бюджет треугольников на строение (сводка K.lmStats — следить)
};

/* ---------- материалы и текстуры ---------- */
const _lmMats = new Map(), _lmTex = new Map();
// текстуры canvas 256 px на LMK.uv м, серые (цвет даёт материал)
function lmTex(kind) {
  if (_lmTex.has(kind)) return _lmTex.get(kind);
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
  const x = c.getContext('2d'), rnd = (() => { let s = 1234567; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  const g = v => { const q = Math.round(255 * v); return `rgb(${q},${q},${q})`; };
  const speck = (n, a, b) => { for (let i = 0; i < n; i++) { x.fillStyle = g(a + rnd() * (b - a)); x.fillRect(rnd() * N, rnd() * N, 2, 2); } };
  x.fillStyle = g(0.92); x.fillRect(0, 0, N, N);
  if (kind === 'stone' || kind === 'brick') {
    // ряды блоков: камень 0,5 × 1 м, кирпич 0,075 × 0,25 м (на 2 м — 26 рядов)
    const rows = kind === 'stone' ? 4 : 26, cols = kind === 'stone' ? 2 : 8, rh = N / rows, cw = N / cols;
    for (let r = 0; r < rows; r++) for (let k = -1; k < cols; k++) {
      const off = r % 2 ? cw / 2 : 0;
      x.fillStyle = g(kind === 'stone' ? 0.8 + rnd() * 0.17 : 0.72 + rnd() * 0.22);
      x.fillRect(k * cw + off + 1, r * rh + 1, cw - 2, rh - 2);
    }
    speck(1500, 0.6, 0.95);
  } else if (kind === 'rubble') {
    for (let i = 0; i < 260; i++) {
      const cx = rnd() * N, cy = rnd() * N, r = 6 + rnd() * 14;
      x.fillStyle = g(0.6 + rnd() * 0.35); x.beginPath(); x.ellipse(cx, cy, r * (1 + rnd() * 0.6), r, rnd() * 3, 0, 7); x.fill();
    }
  } else if (kind === 'tile') {
    // черепица: ряды 0,3 м с тенью снизу, желобки 0,2 м
    const rh = N / 7, cw = N / 10;
    for (let r = 0; r < 7; r++) {
      const grd = x.createLinearGradient(0, r * rh, 0, (r + 1) * rh);
      grd.addColorStop(0, g(1)); grd.addColorStop(0.8, g(0.85)); grd.addColorStop(1, g(0.5));
      x.fillStyle = grd; x.fillRect(0, r * rh, N, rh);
      for (let k = 0; k < 10; k++) { x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(k * cw + (r % 2) * cw / 2, r * rh, 2, rh); }
    }
    speck(800, 0.7, 1);
  } else speck(4000, 0.82, 1);                                  // plaster
  const t = canvasTex(c);
  t.userData.shared = true;
  _lmTex.set(kind, t);
  return t;
}
function lmMat(hex, o = {}) {
  const key = [hex, o.tex || '', o.rough ?? 0.85, o.metal ?? 0, o.side || 0, o.alpha || 0].join('|');
  let m = _lmMats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: hex, roughness: o.rough ?? 0.85, metalness: o.metal ?? 0, map: o.tex ? lmTex(o.tex) : null,
      side: o.side || THREE.FrontSide, transparent: !!o.alpha, opacity: o.alpha || 1 });
    m.userData.shared = true;
    _lmMats.set(key, m);
  }
  return m;
}

/* ---------- геометрия ---------- */
const _lmAdd = (parent, geo, mat) => {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
};
function lmBox(parent, mat, w, h, d, x, y, z, rot = 0) {
  const geo = new THREE.BoxGeometry(w, h, d), uv = geo.attributes.uv, U = LMK.uv;
  // грани: ±x (d × h), ±y (w × d), ±z (w × h) — по 4 вершины
  const size = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * size[f][0] / U, uv.getY(i) * size[f][1] / U); }
  const m = _lmAdd(parent, geo, mat);
  m.position.set(x, y + h / 2, z); m.rotation.y = rot;
  return m;
}
function lmPrism(parent, mat, ring, y0, y1, { cap = true, bottom = false } = {}) {
  const pos = [], uv = [], idx = [], U = LMK.uv, n = ring.length;
  let area = 0;
  for (let i = 0; i < n; i++) { const a = ring[i], b = ring[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  const ccw = area > 0;                                         // в плоскости x–z
  let s = 0;
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]), k = pos.length / 3;
    pos.push(a[0], y0, a[1], b[0], y0, b[1], b[0], y1, b[1], a[0], y1, a[1]);
    uv.push(s / U, y0 / U, (s + L) / U, y0 / U, (s + L) / U, y1 / U, s / U, y1 / U);
    // наружу: при обходе против часовой (x–z, ось y вверх) грань a→b смотрит наружу с обходом k, k+2, k+1
    if (ccw) idx.push(k, k + 2, k + 1, k, k + 3, k + 2); else idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
    s += L;
  }
  const tri = THREE.ShapeUtils.triangulateShape(ring.map(([x, z]) => new THREE.Vector2(x, z)), []);
  const lid = (y, up) => {
    const k = pos.length / 3;
    for (const [x, z] of ring) { pos.push(x, y, z); uv.push(x / U, z / U); }
    for (const [a, b, c] of tri) {
      const A = ring[a], B = ring[b], Cc = ring[c], isUp = (B[0] - A[0]) * (Cc[1] - A[1]) - (B[1] - A[1]) * (Cc[0] - A[0]) < 0;
      if (isUp === up) idx.push(k + a, k + b, k + c); else idx.push(k + a, k + c, k + b);
    }
  };
  if (cap) lid(y1, true);
  if (bottom) lid(y0, false);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx); geo.computeVertexNormals();
  // нормали стен — плоские: вершины граней не общие, computeVertexNormals даёт нормаль грани
  return _lmAdd(parent, geo, mat);
}
function lmCyl(parent, mat, r, h, x, y, z, { seg = 16, top = r, cap = true } = {}) {
  const geo = new THREE.CylinderGeometry(top, r, h, seg, 1, !cap), uv = geo.attributes.uv, U = LMK.uv, per = 2 * Math.PI * Math.max(r, top);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * per / U, uv.getY(i) * h / U);
  const m = _lmAdd(parent, geo, mat);
  m.position.set(x, y + h / 2, z);
  return m;
}
// арка шириной w, высотой h; spring — высота пят (по умолчанию h − w/2 — полукруг); pointed — стрельчатая
function lmArch(w, h, { spring, pointed = false } = {}) {
  const s = new THREE.Shape(), r = w / 2;
  const sp = spring ?? (pointed ? h - w * 0.87 : h - r);
  s.moveTo(-r, 0); s.lineTo(r, 0); s.lineTo(r, sp);
  if (pointed) {
    // два круга радиуса w с центрами на противоположных пятах
    const steps = 8;
    for (let i = 1; i <= steps; i++) { const a = (Math.PI / 3) * i / steps; s.lineTo(-r + w * Math.cos(a), sp + w * Math.sin(a) * (h - sp) / (w * 0.866)); }
    for (let i = steps - 1; i >= 0; i--) { const a = (Math.PI / 3) * i / steps; s.lineTo(r - w * Math.cos(a), sp + w * Math.sin(a) * (h - sp) / (w * 0.866)); }
  } else s.absarc(0, sp, r, 0, Math.PI, false);
  s.lineTo(-r, 0);
  return s;
}
function lmExtrude(parent, mat, shape, depth, x, y, z, rot = 0) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 8 });
  geo.translate(0, 0, -depth / 2);
  const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / LMK.uv, uv.getY(i) / LMK.uv);
  const m = _lmAdd(parent, geo, mat);
  m.position.set(x, y, z); m.rotation.y = rot;
  return m;
}

/* ---------- контуры ---------- */
function lmFrame(ring) {
  let best = null;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 0.5) continue;
    const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const [x, z] of ring) { const u = x * ux + z * uz, v = -x * uz + z * ux; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const area = (u1 - u0) * (v1 - v0);
    if (!best || area < best.area) best = { area, ux, uz, u0, u1, v0, v1 };
  }
  let { ux, uz, u0, u1, v0, v1 } = best;
  if (u1 - u0 < v1 - v0) { [ux, uz] = [-uz, ux]; [u0, u1, v0, v1] = [v0, v1, -u1, -u0]; }   // длинная ось — u
  const vx = -uz, vz = ux, uc = (u0 + u1) / 2, vc = (v0 + v1) / 2;
  const at = (u, v) => [ux * (uc + u) + vx * (vc + v), uz * (uc + u) + vz * (vc + v)];
  const [cx, cz] = at(0, 0);
  return { cx, cz, ux, uz, vx, vz, len: u1 - u0, wid: v1 - v0, rot: Math.atan2(-uz, ux), at };
}
// крыша над рамкой F (lmFrame или свой { cx, cz, ux, uz, vx, vz, len, wid }) с карнизом на высоте y
function lmRoof(parent, mat, F, y, { kind = 'hip', pitch = 25, over = 0.4 } = {}) {
  const L = F.len / 2 + over, W = F.wid / 2 + over, t = Math.tan(pitch * Math.PI / 180), H = W * t;
  const P = (u, v, h) => [F.cx + F.ux * u + F.vx * v, y + h, F.cz + F.uz * u + F.vz * v];
  let tris;
  if (kind === 'flat') {
    tris = [[P(-L, -W, 0), P(L, -W, 0), P(L, W, 0)], [P(-L, -W, 0), P(L, W, 0), P(-L, W, 0)]];
  } else if (kind === 'gable') {
    const a = P(-L, -W, 0), b = P(L, -W, 0), c = P(L, W, 0), d = P(-L, W, 0), r0 = P(-L, 0, H), r1 = P(L, 0, H);
    tris = [[a, r0, r1], [a, r1, b], [c, r1, r0], [c, r0, d], [b, r1, c], [d, r0, a]];
  } else {
    const k = kind === 'pyramid' ? 0 : Math.max(0, L - W), r0 = P(-k, 0, H), r1 = P(k, 0, H);
    const a = P(-L, -W, 0), b = P(L, -W, 0), c = P(L, W, 0), d = P(-L, W, 0);
    tris = [[a, r0, r1], [a, r1, b], [b, r1, c], [c, r1, r0], [c, r0, d], [d, r0, a]];
  }
  const pos = [], uv = [], U = LMK.uv, cs = Math.cos(pitch * Math.PI / 180);
  for (const t3 of tris) {
    // развёртка: u — вдоль карниза, v — по скату (ряды черепицы параллельны карнизу)
    for (const p of t3) pos.push(...p);
    const [p0, p1, p2] = t3, ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2], bx = p2[0] - p0[0], by = p2[1] - p0[1], bz = p2[2] - p0[2];
    let fx = ay * bz - az * by, fz = ax * by - ay * bx;
    const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
    for (const p of t3) uv.push((p[0] * -fz + p[2] * fx) / U, (p[0] * fx + p[2] * fz) / cs / U);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  // обход: нормали вверх — проверка по каждому треугольнику
  const P3 = geo.attributes.position;
  for (let i = 0; i < P3.count; i += 3) {
    const ax = P3.getX(i), az = P3.getZ(i), bx = P3.getX(i + 1), bz = P3.getZ(i + 1), cx = P3.getX(i + 2), cz = P3.getZ(i + 2);
    const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    if (ny < 0) for (const A of [P3, geo.attributes.uv]) { const s = A.itemSize; for (let q = 0; q < s; q++) { const t1 = A.array[(i + 1) * s + q]; A.array[(i + 1) * s + q] = A.array[(i + 2) * s + q]; A.array[(i + 2) * s + q] = t1; } }
  }
  geo.computeVertexNormals();
  return _lmAdd(parent, geo, mat);
}
// контур, сдвинутый внутрь на d (по биссектрисам; для выпуклых и мягко невыпуклых контуров)
function lmInset(ring, d) {
  const n = ring.length;
  let area = 0;
  for (let i = 0; i < n; i++) { const a = ring[i], b = ring[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  const s = area > 0 ? 1 : -1;
  return ring.map((p, i) => {
    const a = ring[(i + n - 1) % n], b = ring[(i + 1) % n];
    const n1 = norm(p[0] - a[0], p[1] - a[1]), n2 = norm(b[0] - p[0], b[1] - p[1]);
    // внутренняя нормаль ребра (против часовой — влево)
    const i1 = [-n1[1] * s, n1[0] * s], i2 = [-n2[1] * s, n2[0] * s], m = norm(i1[0] + i2[0], i1[1] + i2[1]);
    const k = d / Math.max(0.3, m[0] * i1[0] + m[1] * i1[1]);
    return [p[0] + m[0] * k, p[1] + m[1] * k];
  });
  function norm(x, z) { const l = Math.hypot(x, z) || 1; return [x / l, z / l]; }
}
function lmAlong(a, b, n, fn) {
  for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; fn(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, i); }
}

/* ---------- столкновения ---------- */
function lmCollide(K, ring, y0, y1) { return Object.assign(K.grid.addPoly(ring, y1 - y0), { y0, y1 }); }
function lmCollideBox(K, x, z, w, d, rot, y0, y1) {
  const c = Math.cos(rot), s = Math.sin(rot), ring = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]
    .map(([u, v]) => [x + u * c + v * s, z - u * s + v * c]);
  return lmCollide(K, ring, y0, y1);
}

/* ---------- постройка ---------- */
function sitgesBuildLandmarks(K) {
  const stats = {};
  for (const L of K.D.C.landmarks) {
    if (!L.ready || !L.def.build) continue;
    const g = new THREE.Group();
    g.name = 'lm-' + L.id;
    L.def.build(K, L, g);
    K.group.add(g);
    let tris = 0;
    g.traverse(o => { if (o.isMesh) { const G = o.geometry; tris += (G.index ? G.index.count : G.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1); } });
    stats[L.id] = Math.round(tris);
  }
  Object.assign(K, { lmStats: stats });
}
