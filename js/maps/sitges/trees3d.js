// Модели деревьев «Ситжеса» (этап 4б.3): 9 пород, 20 форм в mid-poly стиле игры (икосаэдры-комки, гранёные стволы,
// пальмовые листья лентами). Раскладка — js/maps/sitges/trees.js (4б.2); здесь же постройка sitgesBuildTrees (4б.4):
// ближние — полные модели у камеры каждого игрока, дальние — упрощённые, склеенные квадратами; столкновения стволов.
// Форма = две геометрии для InstancedMesh: ствол (материал коры) и крона (материал листвы с качанием Breeze.sway).
// Цвет — в вершинах (зелень темнее снизу, пятна платана, апельсины, сухие листья пальм); цвет экземпляра —
// множитель около белого (оттенок и яркость дерева), он не перекрашивает апельсины в зелёный.
// Масштаб — отдельно ствол и крона, без растягивания ствола в «бочку»:
//   • ствол — в долях высоты дерева h по всем осям (толщина растёт с высотой), матрица T · Ry · S(h, h, h);
//   • крона — по x, z в долях радиуса кроны r (|x|, |z| ≤ 1), по y в долях глубины кроны d (y от −1 до 0, верх кроны
//     = верх дерева), матрица T(верх ствола) · Ry · S(r, d, r); d = clamp(cd · r, dmin · h, dmax · h);
//   • верх ствола — top (доли h): у наклонных стволов крона едет вместе с ним.
// Матрицы считает sitgesTreeMats(); дальний упрощённый вариант (sitgesTreeFar) — икосаэдр по габаритам кроны (у пальм —
// звезда листьев) и трёхгранный ствол в тех же координатах, матрицы те же.
// Определяет: SITGES_TREE_KINDS, sitgesTreeKit, sitgesTreeMats, SITGES_TREE3D, SITGES_TREE_U, sitgesTreeCut,
//   SITGES_ICO, sitgesTreeFar, sitgesBuildTrees.
// Использует: clamp, QUAL (js/core.js); Breeze (js/breeze.js); stdMat, Breakables (js/world.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

// порода → формы; у формы: tr — радиус ствола у земли (доли h, для столкновений), top — верх ствола (доли h, x и z),
// cd, dmin, dmax — глубина кроны (см. шапку), leaf — материал листвы: leaf (обычная), tall (кипарис: качается
// только верх), palm (двусторонние листья пальм)
const SITGES_TREE_KINDS = {
  pine:     ['pine1', 'pine2'],          // пиния: высокий голый ствол, плоский зонтик / раздвоенный ствол
  aleppo:   ['aleppo1', 'aleppo2'],      // алеппская сосна: кривой наклонный ствол / высокая тонкая
  plane:    ['plane1', 'plane2'],        // платан: светлый пятнистый ствол, широкая крона / стриженый зонт
  celtis:   ['celtis1', 'celtis2', 'feather'], // каркас: взрослый / молодой; перистая крона (мелия, софора, жакаранда)
  palm:     ['canary', 'date', 'washington'],  // канарская финиковая / тонкая финиковая / вашингтония
  cypress:  ['cypress1', 'cypress2'],    // свеча / пламя
  orange:   ['orange1', 'orange2'],      // горький апельсин: круглый / шар на штамбе
  garden:   ['garden1', 'garden2'],      // олива / олеандр (розовые цветы)
  tamarisk: ['tamarisk1', 'tamarisk2'],  // наклонный корявый / раздвоенный
};

let _sitgesTreeKit = null;
// → { forms: { id: { id, trunk, crown, mat, tr, top, cd, dmin, dmax, tris } }, mats: { bark, leaf, tall, palm } }
// Геометрии и материалы общие (userData.shared) — не уничтожать.
function sitgesTreeKit() {
  if (_sitgesTreeKit) return _sitgesTreeKit;
  const V = THREE.Vector3, Y = new V(0, 1, 0);
  let seed = 1;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const hash = (x, y, z) => { const s = Math.sin(Math.round(x * 1e3) * 12.9898 + Math.round(y * 1e3) * 78.233 + Math.round(z * 1e3) * 37.719) * 43758.5453; return s - Math.floor(s); };
  const C = hex => new THREE.Color(hex);

  // цвет по треугольникам: base · (1 ± vary) · градиент по высоте (низ темнее: lo у y0, 1 у y1)
  function paint(g, col, { vary = 0.08, lo = 1, y0 = -1, y1 = 0 } = {}) {
    if (g.index) g = g.toNonIndexed();
    g.deleteAttribute('uv');
    const p = g.attributes.position, n = p.count, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 3) {
      const y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
      const t = Math.min(1, Math.max(0, (y - y0) / (y1 - y0)));
      const k = (lo + (1 - lo) * t) * (1 + (rnd() * 2 - 1) * vary);
      for (let j = 0; j < 3; j++) { c[(i + j) * 3] = col.r * k; c[(i + j) * 3 + 1] = col.g * k; c[(i + j) * 3 + 2] = col.b * k; }
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    if (!g.attributes.normal) g.computeVertexNormals();
    return g;
  }
  // комок листвы: икосаэдр с неровной поверхностью (сдвиг по хешу положения — швы граней не расходятся)
  function blob(x, y, z, sx, sy, sz, det, col, o = {}) {
    const g = new THREE.IcosahedronGeometry(1, det), p = g.attributes.position, j = o.jit ?? 0.18;
    for (let i = 0; i < p.count; i++) {
      const k = 1 + (hash(p.getX(i), p.getY(i), p.getZ(i)) * 2 - 1) * j;
      p.setXYZ(i, p.getX(i) * k * sx + x, p.getY(i) * k * sy + y, p.getZ(i) * k * sz + z);
    }
    const out = paint(g, col, Object.assign({ lo: 0.62 }, o));
    out.userData.lump = [x, y, z, sx, sy, sz, col.r, col.g, col.b, o.lo ?? 0.62];   // для дальнего варианта кроны
    return out;
  }
  // ветка / кусок ствола от a до b (радиусы ra, rb), без торцов
  function limb(a, b, ra, rb, col, seg = 5, hs = 1, o = {}) {
    a = new V(...a); b = new V(...b);
    const d = b.clone().sub(a), L = d.length();
    const g = new THREE.CylinderGeometry(rb, ra, L * 1.04, seg, hs, true);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, d.normalize()));
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    return paint(g, col, Object.assign({ vary: 0.1, y0: 0, y1: 1, lo: 0.8 }, o));
  }
  // цепочка кусков ствола по точкам, радиус от r0 до r1
  const chain = (pts, r0, r1, col, seg = 5, o) => pts.slice(1).map((b, i) =>
    limb(pts[i], b, r0 + (r1 - r0) * i / (pts.length - 1), r0 + (r1 - r0) * (i + 1) / (pts.length - 1), col, seg, 1, o));
  // мелкие точки (плоды, цветы) по поверхности эллипсоида кроны: тетраэдры
  function dots(n, cx, cy, cz, sx, sy, sz, size, col, minY = -0.3) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, u = minY + rnd() * (0.95 - minY), w = Math.sqrt(1 - u * u) * 1.03;
      const g = new THREE.TetrahedronGeometry(size).rotateY(rnd() * 3).rotateX(rnd() * 3);
      g.scale(1, sy / sx, 1);
      g.translate(cx + Math.cos(a) * w * sx, cy + u * 1.03 * sy, cz + Math.sin(a) * w * sz);
      out.push(paint(g, col, { vary: 0.1 }));
    }
    return out;
  }
  // перистый лист пальмы — сложенная лента из 6 треугольников: от (0, y0, 0) по азимуту az, длина L, подъём rise,
  // провис droop (координаты кроны), ширина W
  function frond(az, y0, L, rise, droop, W, col, colTip) {
    const ca = Math.cos(az), sa = Math.sin(az), P = [], ts = [0, 0.45, 1], ws = [0.04, W, 0];
    for (let i = 0; i < 3; i++) {
      const t = ts[i], h = L * t, y = y0 + rise * t - droop * t * t, w = ws[i] * L, f = w * 0.35;
      // центр (жилка) и края (ниже жилки — лист сложен «домиком»)
      P.push([[ca * h, y, sa * h], [ca * h - sa * w, y - f, sa * h + ca * w], [ca * h + sa * w, y - f, sa * h - ca * w]]);
    }
    const pos = [], q = (a, b, c) => pos.push(...a, ...b, ...c);
    for (let i = 0; i < 2; i++) {
      const [c0, l0, r0] = P[i], [c1, l1, r1] = P[i + 1];
      q(c0, l0, c1); q(c0, c1, r0);
      if (i === 0) { q(l0, l1, c1); q(r0, c1, r1); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    const c = new Float32Array(pos.length), cb = col, ct = colTip || col;
    for (let i = 0; i < pos.length / 3; i++) {
      const t = Math.min(1, Math.hypot(pos[i * 3], pos[i * 3 + 2]) / L), k = 0.85 + rnd() * 0.15;
      c[i * 3] = (cb.r + (ct.r - cb.r) * t) * k; c[i * 3 + 1] = (cb.g + (ct.g - cb.g) * t) * k; c[i * 3 + 2] = (cb.b + (ct.b - cb.b) * t) * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return g;
  }
  // веер вашингтонии: черешок до r0, дальше полукруглая пластина из 4 треугольников, слегка вогнутая
  function fan(az, y0, r0, R, tilt, col) {
    const ca = Math.cos(az), sa = Math.sin(az), pos = [];
    const at = (d, side, dy) => [ca * d - sa * side, y0 + d * tilt + dy, sa * d + ca * side];
    const o = at(r0, 0, 0), rim = [];
    for (let k = 0; k <= 4; k++) {
      const a = (k / 4 - 0.5) * Math.PI * 0.9;
      rim.push(at(r0 + Math.cos(a) * R, Math.sin(a) * R, -Math.cos(a) * R * 0.25 + Math.abs(Math.sin(a)) * R * 0.2));
    }
    for (let k = 0; k < 4; k++) pos.push(...o, ...rim[k], ...rim[k + 1]);
    // черешок — узкий треугольник от центра
    pos.push(...at(0, -0.02, 0), ...at(0, 0.02, 0), ...o);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return paint(g, col, { vary: 0.12 });
  }
  // рыхлая крона: комки [x, y, z, sx, sy, sz] и ветки к ним от верха ствола — в координатах кроны, поэтому ветка
  // соединена с комком при любых h и r (ветки в долях h кончались бы мимо комков)
  const loose = (specs, col, bark, jit = 0.25) => [...specs.map(([x, y, z, sx, sy, sz]) => blob(x, y, z, sx, sy, sz, 0, col, { jit })),
    ...specs.filter(([x, , z]) => Math.hypot(x, z) > 0.15).map(([x, y, z]) => limb([0, -0.9, 0], [x * 0.9, y, z * 0.9], 0.035, 0.015, bark, 4, 1, { lo: 1 }))];
  const merge = parts => { const g = mergeGeometries(parts.flat()); g.userData.shared = true; return g; };

  /* ---------- цвета ---------- */
  const BARK = C(0x6b4a2f), BARK_PINE = C(0x7a5236), BARK_GREY = C(0x5b544b), BARK_DARK = C(0x8a8478),
    BARK_PALM = C(0x7e6448), BARK_OLIVE = C(0x7a6e5c), PLANE_A = C(0xc9c2a2), PLANE_B = C(0x8f8a6a);
  const G_PINE = C(0x445f2a), G_ALEP = C(0x5f7a38), G_PLANE = C(0x5d8a35), G_CELT = C(0x3f6a2a), G_FEATH = C(0x7c9d48),
    G_PALM = C(0x5a7f30), G_DATE = C(0x7f9257), G_WASH = C(0x6fa543), G_CYPR = C(0x2c4a24), G_ORANGE = C(0x2f5c24),
    G_OLIVE = C(0x7f9061), G_OLEAN = C(0x4a7a32), G_TAMAR = C(0x8a9c6c), DRY = C(0x9a7b4c), ORANGE = C(0xec7a12),
    PINK = C(0xe0709a);

  /* ---------- формы ---------- */
  const F = {};
  // lumps — комки кроны [x, y, z, sx, sy, sz, r, g, b, lo] (из blob): по ним строится дальний вариант (sitgesTreeFar)
  const form = (id, meta, trunk, crown) => { F[id] = Object.assign({ id, top: [0, 0], leaf: 'leaf' }, meta,
    { trunk: merge(trunk), crown: merge(crown), lumps: crown.flat().filter(g => g.userData.lump).map(g => g.userData.lump) }); };

  // пиния: высокий голый ствол чуть вбок, плоский зонтик из трёх комков
  form('pine1', { tr: 0.022, top: [0.05, 0.01], cd: 0.5, dmin: 0.15, dmax: 0.4 },
    [chain([[0, -0.03, 0], [0.02, 0.5, 0], [0.05, 0.9, 0.01]], 0.022, 0.012, BARK_PINE),
      limb([0.04, 0.78, 0.01], [0.15, 0.92, 0.06], 0.01, 0.005, BARK_PINE, 4), limb([0.045, 0.8, 0], [-0.06, 0.93, -0.05], 0.009, 0.005, BARK_PINE, 4)],
    [blob(0, -0.5, 0, 0.95, 0.5, 0.9, 1, G_PINE), blob(0.5, -0.6, 0.3, 0.5, 0.33, 0.5, 0, G_PINE), blob(-0.45, -0.62, -0.35, 0.5, 0.3, 0.45, 0, G_PINE)]);
  // пиния с раздвоенным стволом: крона из двух шапок
  form('pine2', { tr: 0.024, cd: 0.55, dmin: 0.15, dmax: 0.42 },
    [chain([[0, -0.03, 0], [0.01, 0.5, 0]], 0.024, 0.018, BARK_PINE), chain([[0.01, 0.48, 0], [0.12, 0.72, 0.03], [0.17, 0.9, 0.04]], 0.015, 0.009, BARK_PINE),
      chain([[0.01, 0.48, 0], [-0.1, 0.7, -0.02], [-0.16, 0.88, -0.02]], 0.014, 0.008, BARK_PINE)],
    [blob(0.38, -0.5, 0.08, 0.62, 0.5, 0.68, 1, G_PINE), blob(-0.45, -0.55, -0.05, 0.55, 0.45, 0.58, 0, G_PINE), blob(-0.05, -0.62, -0.5, 0.45, 0.32, 0.42, 0, G_PINE)]);
  // алеппская сосна: кривой наклонный ствол, рыхлая крона из отдельных комков
  form('aleppo1', { tr: 0.02, top: [0.2, 0.02], cd: 0.75, dmin: 0.25, dmax: 0.55 },
    [chain([[0, -0.03, 0], [0.06, 0.3, 0], [0.15, 0.55, 0.03], [0.2, 0.82, 0.02]], 0.02, 0.008, BARK_PINE)],
    loose([[0, -0.4, 0, 0.55, 0.4, 0.5], [0.5, -0.55, 0.2, 0.45, 0.33, 0.4], [-0.45, -0.5, -0.25, 0.45, 0.38, 0.45],
      [-0.05, -0.78, -0.55, 0.4, 0.22, 0.35], [-0.3, -0.25, 0.4, 0.4, 0.25, 0.4]], G_ALEP, BARK_PINE));
  // алеппская сосна высокая и тонкая: крона ярусами по верхней трети
  form('aleppo2', { tr: 0.016, top: [0.04, 0], cd: 1.1, dmin: 0.3, dmax: 0.6 },
    [chain([[0, -0.03, 0], [-0.03, 0.4, 0.02], [0.02, 0.75, 0], [0.04, 0.95, 0]], 0.016, 0.006, BARK_PINE)],
    loose([[0, -0.25, 0, 0.6, 0.28, 0.55], [0.35, -0.52, 0.1, 0.48, 0.28, 0.42], [-0.32, -0.68, -0.2, 0.45, 0.27, 0.42],
      [0.25, -0.86, 0.3, 0.36, 0.16, 0.32]], G_ALEP, BARK_PINE));
  // платан: светлый пятнистый ствол, три толстые ветви, широкая круглая крона
  const planeBark = (pts, r0, r1, hs = 3) => pts.slice(1).map((b, i) => {
    const g = limb(pts[i], b, r0, r1, PLANE_A, 6, hs, { vary: 0, lo: 1 }), c = g.attributes.color;
    // пятна: каждый треугольник — светлый крем или серо-оливковый
    for (let k = 0; k < c.count; k += 3) { const s = rnd() < 0.45 ? PLANE_B : PLANE_A, m = 0.9 + rnd() * 0.15; for (let j = 0; j < 3; j++) c.setXYZ(k + j, s.r * m, s.g * m, s.b * m); }
    return g;
  });
  form('plane1', { tr: 0.034, cd: 1.3, dmin: 0.35, dmax: 0.7 },
    [planeBark([[0, -0.03, 0], [0, 0.42, 0]], 0.034, 0.028), planeBark([[0, 0.4, 0], [0.13, 0.75, 0.05]], 0.02, 0.011, 2),
      planeBark([[0, 0.4, 0], [-0.11, 0.72, -0.06]], 0.019, 0.01, 1), planeBark([[0, 0.4, 0], [0.0, 0.8, 0.12]], 0.017, 0.009, 1)],
    [blob(0, -0.5, 0, 0.95, 0.5, 0.95, 1, G_PLANE), blob(0.48, -0.42, 0.35, 0.52, 0.38, 0.5, 0, G_PLANE), blob(-0.5, -0.58, -0.3, 0.5, 0.38, 0.5, 0, G_PLANE)]);
  // платан стриженый над тротуаром: короткий ствол, четыре ветви, плоский зонт
  form('plane2', { tr: 0.036, cd: 0.9, dmin: 0.3, dmax: 0.55 },
    [planeBark([[0, -0.03, 0], [0, 0.45, 0]], 0.036, 0.03),
      ...[0, 1, 2, 3].map(k => planeBark([[0, 0.43, 0], [Math.cos(k * 1.6 + 0.3) * 0.16, 0.72, Math.sin(k * 1.6 + 0.3) * 0.16]], 0.017, 0.01, 1))],
    [blob(0.05, -0.5, 0, 1, 0.48, 0.92, 1, G_PLANE, { jit: 0.12 }), blob(-0.5, -0.5, 0.25, 0.48, 0.34, 0.52, 0, G_PLANE)]);
  // каркас: тёмная гладкая кора, крона темнее и уже платана
  form('celtis1', { tr: 0.028, cd: 1.4, dmin: 0.4, dmax: 0.72 },
    [chain([[0, -0.03, 0], [0, 0.45, 0]], 0.028, 0.022, BARK_DARK, 6), limb([0, 0.43, 0], [0.1, 0.78, 0.04], 0.015, 0.008, BARK_DARK, 5),
      limb([0, 0.43, 0], [-0.08, 0.76, -0.05], 0.014, 0.008, BARK_DARK, 5)],
    [blob(0, -0.5, 0, 0.9, 0.5, 0.85, 1, G_CELT), blob(0.3, -0.72, -0.32, 0.6, 0.3, 0.55, 0, G_CELT)]);
  // каркас молодой: тонкий прямой ствол, маленькая круглая крона
  form('celtis2', { tr: 0.022, cd: 1.6, dmin: 0.4, dmax: 0.6 },
    [chain([[0, -0.03, 0], [0, 0.55, 0], [0.01, 0.8, 0]], 0.022, 0.01, BARK_DARK, 5)],
    [blob(0, -0.5, 0, 0.95, 0.5, 0.95, 1, G_CELT, { jit: 0.14 })]);
  // перистая крона (мелия, софора, жакаранда): ствол развилкой, светлая рыхлая крона-зонт из мелких комков
  form('feather', { tr: 0.026, cd: 1.0, dmin: 0.3, dmax: 0.6 },
    [chain([[0, -0.03, 0], [0, 0.45, 0], [0.01, 0.74, 0]], 0.026, 0.014, BARK_GREY, 5)],
    loose([[0, -0.3, 0, 0.45, 0.3, 0.45], ...[0, 1, 2, 3, 4].map(k => [Math.cos(k * 1.26) * 0.58, -0.5 + (k % 2) * 0.1, Math.sin(k * 1.26) * 0.58, 0.42, 0.3, 0.42])],
      G_FEATH, BARK_GREY, 0.3));
  // канарская финиковая пальма: толстый ствол (Ø ≈ 0,07 h) с «ананасом» наверху, пышная крона в два яруса
  const palmTrunk = (pts, r0, r1, seg) => chain(pts, r0, r1, BARK_PALM, seg).map(g => {
    // кольца старых черешков: полосы темнее через одну
    const c = g.attributes.color, p = g.attributes.position;
    for (let k = 0; k < c.count; k++) { const m = (Math.floor(p.getY(k) * 60) % 2) ? 0.8 : 1; c.setXYZ(k, c.getX(k) * m, c.getY(k) * m, c.getZ(k) * m); }
    return g;
  });
  form('canary', { tr: 0.034, top: [0.01, 0], cd: 0.9, dmin: 0.12, dmax: 0.45, leaf: 'palm' },
    [palmTrunk([[0, -0.03, 0], [0.005, 0.5, 0], [0.01, 0.9, 0]], 0.034, 0.03, 7), limb([0.01, 0.88, 0], [0.01, 0.97, 0], 0.04, 0.03, BARK_PALM, 7)],
    [blob(0, -0.32, 0, 0.22, 0.16, 0.22, 0, C(0x6b6a35)),
      ...Array.from({ length: 12 }, (_, k) => frond(k * 0.524 + 0.2, -0.3, 1.0, 0.35 - (k % 2) * 0.15, 0.75, 0.16, G_PALM, C(0x6f8c3c))),
      ...Array.from({ length: 8 }, (_, k) => frond(k * 0.785, -0.32, 0.95, 0.1, 1.05, 0.15, G_PALM.clone().lerp(DRY, 0.3), DRY))]);
  // тонкая финиковая: изогнутый тонкий ствол, серо-зелёные жёсткие листья торчком
  form('date', { tr: 0.016, top: [0.1, 0], cd: 0.9, dmin: 0.12, dmax: 0.4, leaf: 'palm' },
    [palmTrunk([[0, -0.03, 0], [0.03, 0.35, 0], [0.075, 0.7, 0], [0.1, 0.97, 0]], 0.016, 0.013, 6)],
    [blob(0, -0.38, 0, 0.16, 0.14, 0.16, 0, C(0x6b6a35)),
      ...Array.from({ length: 12 }, (_, k) => frond(k * 0.524 + (k % 2) * 0.2, -0.36, 1.0, 0.55 - (k % 3) * 0.25, 0.85, 0.1, G_DATE, C(0x8b9a62)))]);
  // вашингтония: прямой тонкий ствол, «юбка» сухих листьев, маленькая крона из вееров
  form('washington', { tr: 0.018, cd: 0.95, dmin: 0.1, dmax: 0.35, leaf: 'palm' },
    [palmTrunk([[0, -0.03, 0], [0, 0.5, 0], [0, 0.95, 0]], 0.019, 0.016, 6)],
    [paint(new THREE.CylinderGeometry(0.27, 0.13, 0.55, 7, 1, true).translate(0, -0.68, 0), C(0x6e5a40), { vary: 0.15, lo: 0.7 }),
      blob(0, -0.38, 0, 0.2, 0.14, 0.2, 0, C(0x6a6a3a)),
      ...Array.from({ length: 12 }, (_, k) => fan(k * 0.524 + (k % 2) * 0.25, -0.38, 0.35, 0.5, 0.6 - (k % 3) * 0.45, G_WASH))]);
  // кипарис: узкая тёмная свеча (тело вращения); второй — шире, верх пламенем вбок
  const lathe = (prof, seg, col, shear = 0) => {
    const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), seg).toNonIndexed(), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const k = 1 + (hash(p.getX(i), p.getY(i), p.getZ(i)) * 2 - 1) * 0.12, y = p.getY(i);
      p.setXYZ(i, p.getX(i) * k + shear * (y + 1) * (y + 1), y, p.getZ(i) * k);
    }
    return paint(g, col, { lo: 0.7 });
  };
  form('cypress1', { tr: 0.02, cd: 7, dmin: 0.7, dmax: 0.93, leaf: 'tall' },
    [chain([[0, -0.03, 0], [0, 0.35, 0]], 0.02, 0.012, BARK, 5)],
    [lathe([[0, -1], [0.7, -0.93], [1, -0.68], [0.92, -0.42], [0.66, -0.2], [0.3, -0.05], [0, 0]], 7, G_CYPR)]);
  form('cypress2', { tr: 0.024, cd: 5, dmin: 0.65, dmax: 0.9, leaf: 'tall' },
    [chain([[0, -0.03, 0], [0, 0.4, 0]], 0.024, 0.014, BARK, 5)],
    [lathe([[0, -1], [0.85, -0.9], [1, -0.62], [0.88, -0.38], [0.55, -0.16], [0.18, -0.03], [0, 0]], 7, G_CYPR, 0.12)]);
  // горький апельсин: низкий, круглая плотная крона с оранжевыми точками; второй — стриженый шар на штамбе
  form('orange1', { tr: 0.04, cd: 1.6, dmin: 0.5, dmax: 0.75 },
    [chain([[0, -0.03, 0], [0, 0.35, 0]], 0.04, 0.032, BARK_GREY, 5), limb([0, 0.33, 0], [0.12, 0.6, 0.04], 0.02, 0.012, BARK_GREY, 4),
      limb([0, 0.33, 0], [-0.1, 0.58, -0.05], 0.02, 0.012, BARK_GREY, 4)],
    [blob(0, -0.5, 0, 1, 0.5, 1, 1, G_ORANGE, { jit: 0.14 }), ...dots(14, 0, -0.5, 0, 1, 0.5, 1, 0.09, ORANGE)]);
  form('orange2', { tr: 0.03, cd: 2, dmin: 0.4, dmax: 0.5 },
    [chain([[0, -0.03, 0], [0, 0.62, 0]], 0.03, 0.025, BARK_GREY, 5)],
    [blob(0, -0.5, 0, 1, 0.5, 1, 1, G_ORANGE, { jit: 0.08 }), ...dots(10, 0, -0.5, 0, 1, 0.5, 1, 0.1, ORANGE)]);
  // садовое: олива — корявые стволы веером, серо-зелёная комковатая крона
  form('garden1', { tr: 0.05, top: [0.02, 0], cd: 0.8, dmin: 0.35, dmax: 0.55 },
    [chain([[0, -0.03, 0], [0.07, 0.35, 0.03], [0.15, 0.7, 0]], 0.05, 0.018, BARK_OLIVE, 5),
      chain([[0, -0.03, 0], [-0.06, 0.33, -0.05], [-0.13, 0.68, 0.02]], 0.045, 0.016, BARK_OLIVE, 5),
      limb([0, -0.03, 0], [0.02, 0.66, -0.12], 0.04, 0.015, BARK_OLIVE, 5)],
    [blob(0, -0.5, 0, 0.82, 0.45, 0.8, 1, G_OLIVE, { jit: 0.22 }), blob(0.55, -0.62, 0.15, 0.42, 0.3, 0.42, 0, G_OLIVE, { jit: 0.25 }),
      blob(-0.5, -0.6, 0.3, 0.42, 0.32, 0.4, 0, G_OLIVE, { jit: 0.25 }), blob(0.05, -0.68, -0.55, 0.4, 0.28, 0.4, 0, G_OLIVE, { jit: 0.25 })]);
  // олеандр (и вообще садовое деревце-куст): несколько стволиков, крона от низа, розовые цветы
  form('garden2', { tr: 0.03, cd: 1.3, dmin: 0.55, dmax: 0.8 },
    [...[0, 1, 2, 3].map(k => limb([0, -0.03, 0], [Math.cos(k * 1.7) * 0.1, 0.5, Math.sin(k * 1.7) * 0.1], 0.022, 0.012, BARK_GREY, 4))],
    [blob(0, -0.45, 0, 0.8, 0.45, 0.78, 1, G_OLEAN), blob(0.5, -0.7, 0.2, 0.48, 0.3, 0.45, 0, G_OLEAN), blob(-0.45, -0.72, -0.25, 0.5, 0.28, 0.48, 0, G_OLEAN),
      ...dots(10, 0, -0.5, 0, 0.85, 0.48, 0.85, 0.08, PINK, 0)]);
  // тамариск: корявый ствол сильно вбок (от ветра с моря), рыхлая серо-зелёная крона
  form('tamarisk1', { tr: 0.045, top: [0.4, 0.04], cd: 0.8, dmin: 0.4, dmax: 0.55 },
    [chain([[0, -0.03, 0], [0.12, 0.25, 0.02], [0.28, 0.46, 0], [0.4, 0.62, 0.04]], 0.045, 0.014, BARK_GREY, 5)],
    loose([[0.05, -0.45, 0, 0.55, 0.38, 0.5], [0.5, -0.6, 0.15, 0.45, 0.3, 0.45], [-0.45, -0.55, -0.15, 0.48, 0.32, 0.45],
      [-0.15, -0.72, 0.45, 0.4, 0.25, 0.4], [0.15, -0.7, -0.5, 0.4, 0.25, 0.4]], G_TAMAR, BARK_GREY, 0.3));
  form('tamarisk2', { tr: 0.05, cd: 0.8, dmin: 0.4, dmax: 0.55 },
    [chain([[0, -0.03, 0], [0.1, 0.3, 0.02], [0.2, 0.55, 0], [0.26, 0.68, 0.03]], 0.035, 0.012, BARK_GREY, 5),
      chain([[0, -0.03, 0], [-0.08, 0.28, 0.04], [-0.16, 0.5, 0.02], [-0.22, 0.64, 0.06]], 0.033, 0.011, BARK_GREY, 5)],
    [blob(0.45, -0.5, 0, 0.5, 0.36, 0.5, 0, G_TAMAR, { jit: 0.3 }), blob(-0.45, -0.5, 0.05, 0.5, 0.36, 0.5, 0, G_TAMAR, { jit: 0.3 }),
      blob(0, -0.4, 0.1, 0.42, 0.3, 0.42, 0, G_TAMAR, { jit: 0.3 }), blob(0.05, -0.68, -0.45, 0.42, 0.25, 0.4, 0, G_TAMAR, { jit: 0.3 }),
      blob(-0.1, -0.7, 0.5, 0.4, 0.25, 0.4, 0, G_TAMAR, { jit: 0.3 })]);

  /* ---------- материалы ---------- */
  // качание: размах верха кроны в метрах (не зависит от размера дерева), высота кроны в координатах геометрии −1…0
  const leafMat = (amp, base, o = {}) => Breeze.sway(stdMat(0xffffff, Object.assign({ flatShading: true, vertexColors: true, roughness: 0.9 }, o)), amp, -1, 0, base);
  const mats = {
    bark: stdMat(0xffffff, { flatShading: true, vertexColors: true, roughness: 0.95 }),
    leaf: leafMat(0.28, 0.5),
    tall: leafMat(0.4, 0.05),
    palm: leafMat(0.45, 0.25, { side: THREE.DoubleSide, roughness: 0.8 }),
  };
  for (const m of Object.values(mats)) m.userData.shared = true;
  for (const f of Object.values(F)) {
    f.mat = mats[f.leaf];
    f.tris = { trunk: f.trunk.attributes.position.count / 3, crown: f.crown.attributes.position.count / 3 };
  }
  return (_sitgesTreeKit = { forms: F, mats });
}

// матрицы ствола (mT) и кроны (mC) дерева формы f: основание (x, y, z), высота h, радиус кроны r, поворот ry
const _stv = new THREE.Vector3();
function sitgesTreeMats(f, x, y, z, h, r, ry, mT, mC) {
  const c = Math.cos(ry), s = Math.sin(ry), d = Math.min(f.dmax * h, Math.max(f.dmin * h, f.cd * r));
  mT.makeRotationY(ry).scale(_stv.set(h, h, h)).setPosition(x, y, z);
  const lx = f.top[0] * h, lz = f.top[1] * h;
  mC.makeRotationY(ry).scale(_stv.set(r, d, r)).setPosition(x + lx * c + lz * s, y + h, z - lx * s + lz * c);
}

// Постройка (4б.4): деревья раскладки C.trees (js/maps/sitges/trees.js) в два слоя по расстоянию до камеры:
//   • ближние (ближе near м) — полные модели: у каждого игрока свой набор InstancedMesh ствола и кроны на форму
//     (≈ 40 вызовов на половину экрана, второй набор скрыт); набор — деревья в near + margin м от камеры игрока,
//     пересобирается, когда камера сдвинулась на margin м (cullView); тень — только от ближних (крона качается
//     вместе с тенью через swayDepth; стволы в тени почти ничего не стоят);
//   • дальние — упрощённые (sitgesTreeFar: крона из комков самой формы икосаэдрами, у мелких — один икосаэдр, у пальм —
//     8 листьев; ствол — трёхгранная призма; без апельсинов и цветов), склеены квадратами chunk м в один меш (вызов
//     на квадрат), цвет запечён, без тени и качания; деревья ниже small м видны до farSmall, прочие — до far.
//   Граница — в шейдере (sitgesTreeCut): на полосе near·(1 − band) … near обе модели растворяются друг в друге узором
//   точек экрана (TREE_FADE, discard); ближе полосы дальние схлопываются, дальше — ближние. Ближние, которые до
//   пересборки не могут попасть в полосу, — в слое «ядро» без discard (ранняя отбраковка по глубине работает).
//   Пороги по качеству — QUAL.trees = [near, far].
//   Столкновения: крупные — неподвижные круги ствола в сетке (радиус tr·h); мелкие (породы brk.kinds и все ниже
//   brk.h м) — сбиваемые (Breakables): матрицы пишутся в общие массивы, ближний набор берёт их оттуда, дальний
//   вариант сбитого дерева прячется (дальность в aTree = −1).
// Группа помечена userData.dynamic: optimizeStatic и теневые копии её не трогают.
const SITGES_TREE3D = {
  near: 120, band: 1 / 6, margin: 15, far: 1000, farSmall: 400, small: 7, cell: 40, chunk: 320,
  brk: { h: 6.5, kinds: ['orange', 'garden'] },
};
const SITGES_TREE_U = { uView: { value: new THREE.Vector2() }, uNear: { value: 1e9 }, uBand: { value: 1 } };
// граница ближних и дальних (far — склеенные дальние с атрибутом aTree = x, z положения части дерева, дальность).
// На полосе uNear − uBand … uNear рисуются обе модели и растворяются друг в друге узором точек экрана (шум IGN со
// сдвигом по хешу дерева): ближняя оставляет пиксели с p < vFade, дальняя — с p ≥ vFade, вместе — ровно один раз.
// vFade — доля ближней (1 ближе полосы, 0 дальше); положение части дерева у ближней и дальней одно и то же
// (верх ствола для кроны, основание для ствола), поэтому хеш и доля совпадают.
function sitgesTreeCut(mat, far) {
  if (mat.userData.cut) return mat;
  const prev = mat.onBeforeCompile, sway = !!mat.userData.swayDepth, OFF = 'gl_Position = vec4( 0.0, 0.0, -2.0, 1.0 );';
  const pos = far ? 'aTree.xy' : '( modelMatrix * instanceMatrix[ 3 ] ).xz';
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    sh.uniforms.uView = SITGES_TREE_U.uView; sh.uniforms.uNear = SITGES_TREE_U.uNear; sh.uniforms.uBand = SITGES_TREE_U.uBand;
    const vary = 'varying float vFade;\nvarying float vSeed;\n';
    sh.vertexShader = 'uniform vec2 uView;\nuniform float uNear;\nuniform float uBand;\n' + vary + (far ? 'attribute vec3 aTree;\n' : '') +
      sh.vertexShader.replace('#include <fog_vertex>', `#include <fog_vertex>
      vFade = 1.0; vSeed = 0.0;
      ${far ? '' : '#ifdef USE_INSTANCING'}
      {
        vec2 tp = ${pos}; float dv = distance( tp, uView );
        vFade = clamp( ( uNear - dv ) / uBand, 0.0, 1.0 );
        vec2 hq = fract( tp * vec2( 0.1031, 0.1030 ) ); hq += dot( hq, hq.yx + 33.33 ); vSeed = fract( ( hq.x + hq.y ) * hq.x );
        if ( ${far ? 'dv < uNear - uBand || dv > aTree.z' : 'dv > uNear'} ) ${OFF}
      }
      ${far ? '' : '#endif'}`);
    sh.fragmentShader = vary + sh.fragmentShader.replace('void main() {', `void main() {
      #ifdef TREE_FADE
      if ( vFade > 0.001 && vFade < 0.999 ) {
        float pd = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) + vSeed ) );
        if ( pd ${far ? '<' : '>='} vFade ) discard;
      }
      #endif`);
  };
  mat.customProgramCacheKey = () => 'sitTreeCut2' + (far ? 'F' : 'N') + (sway ? 'S' : '');
  mat.userData.cut = true;
  return mat;
}
// дальний вариант формы (в координатах её геометрий): вершины кроны (первые nc), затем ствола.
// Крона — комки самой формы (до 4 крупнейших) икосаэдрами, цвет по вершинам, как у полной модели (низ темнее,
// разброс); у пальм — 8 листьев из двух отрезков с провисом (обе стороны); ствол — трёхгранная призма.
const SITGES_ICO = (() => { const t = (1 + Math.sqrt(5)) / 2, l = Math.hypot(1, t);
  return { v: [-1, t, 0, 1, t, 0, -1, -t, 0, 1, -t, 0, 0, -1, t, 0, 1, t, 0, -1, -t, 0, 1, -t, t, 0, -1, t, 0, 1, -t, 0, -1, -t, 0, 1].map(v => v / l),
    i: [0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8, 3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1] }; })();
// one — одна крона-икосаэдр по габаритам (мелкие деревья: комки вдали не различить, а треугольников вчетверо меньше)
function sitgesTreeFar(f, one = false) {
  const key = one ? 'far1' : 'far';
  if (f[key]) return f[key];
  const avg = g => { const c = g.attributes.color.array, s = [0, 0, 0]; for (let i = 0; i < c.length; i += 3) { s[0] += c[i]; s[1] += c[i + 1]; s[2] += c[i + 2]; } return s.map(v => v * 3 / c.length); };
  f.crown.computeBoundingBox(); f.trunk.computeBoundingBox();
  const b = f.crown.boundingBox, cc = avg(f.crown), tc = avg(f.trunk), pos = [], col = [], idx = [];
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const hx = (b.max.x - b.min.x) / 2, hy = (b.max.y - b.min.y) / 2, hz = (b.max.z - b.min.z) / 2;
  const shade = (y, c, lo = 0.7) => { const k = (lo + (1 - lo) * Math.min(1, Math.max(0, (y - b.min.y) / (2 * hy || 1)))) * (0.92 + 0.16 * rnd()); col.push(c[0] * k, c[1] * k, c[2] * k); };
  if (f.leaf === 'palm') {                         // 8 листьев: от центра вверх-вбок, потом вниз к кончику
    const yh = b.max.y - 0.5 * hy, R = Math.max(hx, hz) * 0.95, ym = b.max.y - 0.15 * hy, yt = b.min.y + 0.5 * hy;
    pos.push(0, yh, 0); shade(yh, cc);
    for (let k = 0; k < 8; k++) {
      const a = (k + 0.5 * (k & 1)) / 8 * Math.PI * 2, w = 0.16, o = pos.length / 3;
      for (const [d, y, da] of [[0.5, ym, w], [0.5, ym, -w], [1, yt, 0]]) { pos.push(Math.cos(a + da) * R * d, y, Math.sin(a + da) * R * d); shade(y, cc); }
      idx.push(0, o, o + 1, 0, o + 1, o, o, o + 2, o + 1, o, o + 1, o + 2);
    }
  } else if (f.lumps.length && !one) {                     // комки формы — икосаэдры (как у полной модели, без дробления)
    const L = f.lumps.slice().sort((p, q) => q[3] * q[4] * q[5] - p[3] * p[4] * p[5]).slice(0, 4), V = SITGES_ICO.v;
    for (const [x, y, z, sx, sy, sz, r, g, bb, lo] of L) {
      const o = pos.length / 3, k = 1.04, rot = rnd() * Math.PI, c = Math.cos(rot), s = Math.sin(rot);
      for (let i = 0; i < 12; i++) {
        const vx = V[i * 3] * sx * k, vy = V[i * 3 + 1] * sy * k, vz = V[i * 3 + 2] * sz * k, yy = y + vy;
        pos.push(x + vx * c - vz * s, yy, z + vx * s + vz * c); shade(yy, [r, g, bb], lo);
      }
      for (const j of SITGES_ICO.i) idx.push(o + j);
    }
  } else {                                         // одна крона: икосаэдр по габаритам кроны
    const cx = (b.min.x + b.max.x) / 2, cy = (b.min.y + b.max.y) / 2, cz = (b.min.z + b.max.z) / 2, V = SITGES_ICO.v;
    for (let i = 0; i < 12; i++) { const y = cy + V[i * 3 + 1] * hy; pos.push(cx + V[i * 3] * hx, y, cz + V[i * 3 + 2] * hz); shade(y, cc); }
    idx.push(...SITGES_ICO.i);
  }
  const nc = pos.length / 3, top = f.trunk.boundingBox.max.y * 0.95, r0 = f.tr, r1 = f.tr * 0.55;
  for (let k = 0; k < 3; k++) {                    // ствол: трёхгранная призма от земли до верха ствола
    const a = k * Math.PI * 2 / 3, c = Math.cos(a), s = Math.sin(a);
    pos.push(c * r0, 0, s * r0, f.top[0] + c * r1, top, f.top[1] + s * r1); col.push(...tc, ...tc);
    const a0 = nc + 2 * k, b0 = nc + 2 * ((k + 1) % 3);
    idx.push(a0, a0 + 1, b0, a0 + 1, b0 + 1, b0);
  }
  return (f[key] = { pos, col, idx, nc });
}

function sitgesBuildTrees(K) {
  const { D, group, grid, walkAt } = K, C = D.C, kit = sitgesTreeKit(), P = SITGES_TREE3D, list = C.trees, N = list.length;
  const [near0, far] = QUAL.trees || [P.near, P.far], farSmall = far * P.farSmall / P.far, CH = P.chunk, CS = P.cell;
  const root = new THREE.Group(); root.name = 'trees'; root.userData.dynamic = true;
  const forms = Object.values(kit.forms), fIdx = new Map(forms.map((f, k) => [f.id, k]));
  const bark = sitgesTreeCut(kit.mats.bark, false);
  for (const k of ['leaf', 'tall', 'palm']) sitgesTreeCut(kit.mats[k], false);

  /* ---------- матрицы и цвета всех деревьев ---------- */
  const MT = new Float32Array(N * 16), MC = new Float32Array(N * 16), CT = new Float32Array(N * 3), CC = new Float32Array(N * 3);
  const form = new Uint8Array(N), cap = new Int32Array(forms.length), Y = new Float32Array(N);
  const mT = new THREE.Matrix4(), mC = new THREE.Matrix4();
  list.forEach((t, i) => {
    const f = kit.forms[t.f], k = fIdx.get(t.f), w = walkAt ? walkAt(t.x, t.z) : -Infinity;
    const y = Y[i] = Math.max(D.ground(t.x, t.z) - 0.12, w - 0.05);
    sitgesTreeMats(f, t.x, y, t.z, t.h, t.r, t.ry, mT, mC);
    mT.toArray(MT, i * 16); mC.toArray(MC, i * 16);
    const b = 0.86 + 0.18 * t.c, hu = (t.c * 7.3) % 1 - 0.5, bt = 0.9 + 0.12 * t.c;   // яркость и лёгкий сдвиг оттенка
    CC[i * 3] = b * (1 + 0.06 * hu); CC[i * 3 + 1] = b; CC[i * 3 + 2] = b * (1 - 0.08 * hu);
    CT[i * 3] = CT[i * 3 + 1] = CT[i * 3 + 2] = bt;
    form[i] = k; cap[k]++;
  });

  /* ---------- ближние: у каждого игрока свой набор — InstancedMesh ствола и кроны на форму ---------- */
  // в наборе два слоя: ядро (до границы полосы растворения при любом сдвиге камеры до пересборки — материал без
  // discard, ранняя отбраковка по глубине работает) и полоса (материал с растворением TREE_FADE)
  const fadeOf = new Map(), withFade = mat => {
    let m = fadeOf.get(mat);
    if (!m) {
      m = mat.clone(); m.onBeforeCompile = mat.onBeforeCompile; m.customProgramCacheKey = mat.customProgramCacheKey;
      m.defines = Object.assign({}, mat.defines, { TREE_FADE: 1 }); m.userData = mat.userData; fadeOf.set(mat, m);
    }
    return m;
  };
  const sets = [0, 1].map(() => ({ L: [{ T: [], C: [] }, { T: [], C: [] }], mark: new Int32Array(N), slot: new Int32Array(N), lay: new Uint8Array(N), stamp: 0, cam: null }));
  for (const S of sets) forms.forEach((f, k) => {
    if (!cap[k]) return;
    S.L.forEach((Y2, band) => {
      for (const [geo, mat0, arr] of [[f.trunk, bark, Y2.T], [f.crown, f.mat, Y2.C]]) {
        const mat = band ? withFade(mat0) : mat0, m = new THREE.InstancedMesh(geo, mat, cap[k]);
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap[k] * 3), 3).setUsage(THREE.DynamicDrawUsage);
        m.count = 0; m.visible = false; m.frustumCulled = false; m.castShadow = m.receiveShadow = true;
        if (mat0 !== bark) m.customDepthMaterial = mat0.userData.swayDepth;
        arr[k] = m; root.add(m);
      }
    });
  });
  // сетка ячеек CS м: номера деревьев подряд по ячейкам
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const t of list) { x0 = Math.min(x0, t.x); z0 = Math.min(z0, t.z); x1 = Math.max(x1, t.x); z1 = Math.max(z1, t.z); }
  const gx = Math.floor((x1 - x0) / CS) + 1, gz = Math.floor((z1 - z0) / CS) + 1, cellOf = i => Math.floor((list[i].x - x0) / CS) * gz + Math.floor((list[i].z - z0) / CS);
  const start = new Int32Array(gx * gz + 1), order = new Int32Array(N), cnt = [new Int32Array(forms.length), new Int32Array(forms.length)];
  for (let i = 0; i < N; i++) start[cellOf(i) + 1]++;
  for (let c = 0; c < gx * gz; c++) start[c + 1] += start[c];
  { const fill = start.slice(0, gx * gz); for (let i = 0; i < N; i++) order[fill[cellOf(i)]++] = i; }
  const range = (a, n) => { if (a.addUpdateRange) { a.clearUpdateRanges(); a.addUpdateRange(0, n * a.itemSize); } a.needsUpdate = true; };
  const put = (S, i) => {                          // дерево i → его место в мешах своей формы и слоя набора S
    const f = form[i], k = S.slot[i], Y2 = S.L[S.lay[i]];
    const tm = Y2.T[f].instanceMatrix.array, cm = Y2.C[f].instanceMatrix.array, tc = Y2.T[f].instanceColor.array, cc = Y2.C[f].instanceColor.array;
    for (let q = 0; q < 16; q++) { tm[k * 16 + q] = MT[i * 16 + q]; cm[k * 16 + q] = MC[i * 16 + q]; }
    for (let q = 0; q < 3; q++) { tc[k * 3 + q] = CT[i * 3 + q]; cc[k * 3 + q] = CC[i * 3 + q]; }
  };
  let near = near0;
  function rebuild(S) {                            // деревья в near + margin м от камеры набора
    const c = S.cam, R = near + P.margin, R2 = R * R, st = ++S.stamp, nb = Math.max(0, near * (1 - P.band) - P.margin), nb2 = nb * nb;
    cnt[0].fill(0); cnt[1].fill(0);
    const i0 = Math.max(0, Math.floor((c[0] - R - x0) / CS)), i1 = Math.min(gx - 1, Math.floor((c[0] + R - x0) / CS));
    const j0 = Math.max(0, Math.floor((c[1] - R - z0) / CS)), j1 = Math.min(gz - 1, Math.floor((c[1] + R - z0) / CS));
    for (let gi = i0; gi <= i1; gi++) for (let gj = j0; gj <= j1; gj++) {
      const cell = gi * gz + gj;
      for (let q = start[cell]; q < start[cell + 1]; q++) {
        const i = order[q], dx = list[i].x - c[0], dz = list[i].z - c[1], d2 = dx * dx + dz * dz;
        if (d2 > R2) continue;
        const b = d2 > nb2 ? 1 : 0;
        S.mark[i] = st; S.lay[i] = b; S.slot[i] = cnt[b][form[i]]++; put(S, i);
      }
    }
    S.L.forEach((Y2, b) => Y2.T.forEach((m, f) => {
      if (!m) return;
      for (const M of [m, Y2.C[f]]) { M.count = cnt[b][f]; if (cnt[b][f]) { range(M.instanceMatrix, cnt[b][f]); range(M.instanceColor, cnt[b][f]); } }
    }));
  }

  /* ---------- дальние: склеенные квадратами CH м ---------- */
  const farMat = sitgesTreeCut(stdMat(0xffffff, { flatShading: true, vertexColors: true, roughness: 0.9 }), true);
  farMat.defines = Object.assign(farMat.defines || {}, { TREE_FADE: 1 });
  farMat.name = 'tree-far';
  const byChunk = new Map(), farOf = new Int32Array(N * 3), farMeshes = [];
  list.forEach((t, i) => { const key = Math.floor(t.x / CH) + ',' + Math.floor(t.z / CH); let L = byChunk.get(key); if (!L) byChunk.set(key, L = []); L.push(i); });
  let farTris = 0;
  for (const [key, L] of byChunk) {
    let nv = 0, ni = 0;
    const farG = i => sitgesTreeFar(forms[form[i]], list[i].h < P.small);
    for (const i of L) { const g = farG(i); nv += g.pos.length / 3; ni += g.idx.length; }
    const pos = new Float32Array(nv * 3), col = new Float32Array(nv * 3), at = new Float32Array(nv * 3), idx = new (nv > 65535 ? Uint32Array : Uint16Array)(ni);
    let v = 0, q = 0;
    for (const i of L) {
      const t = list[i], g = farG(i), lim = t.h < P.small ? farSmall : far;
      farOf[i * 3] = farMeshes.length; farOf[i * 3 + 1] = v; farOf[i * 3 + 2] = g.pos.length / 3;
      for (const j of g.idx) idx[q++] = v + j;
      for (let j = 0; j < g.pos.length / 3; j++, v++) {
        const crown = j < g.nc, e = crown ? MC : MT, o = i * 16, tint = crown ? CC : CT;
        const x = g.pos[j * 3], y = g.pos[j * 3 + 1], z = g.pos[j * 3 + 2];
        pos[v * 3] = e[o] * x + e[o + 4] * y + e[o + 8] * z + e[o + 12];
        pos[v * 3 + 1] = e[o + 1] * x + e[o + 5] * y + e[o + 9] * z + e[o + 13];
        pos[v * 3 + 2] = e[o + 2] * x + e[o + 6] * y + e[o + 10] * z + e[o + 14];
        for (let c = 0; c < 3; c++) col[v * 3 + c] = g.col[j * 3 + c] * tint[i * 3 + c];
        at[v * 3] = e[o + 12]; at[v * 3 + 1] = e[o + 14]; at[v * 3 + 2] = lim;   // положение части — как у экземпляра
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aTree', new THREE.BufferAttribute(at, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, farMat); m.receiveShadow = true;
    const [ci, cj] = key.split(',').map(Number);
    farMeshes.push({ mesh: m, x: (ci + 0.5) * CH, z: (cj + 0.5) * CH, r: CH * 0.71 + 10 });
    root.add(m); farTris += ni / 3;
  }
  const farLim = (i, lim) => {                     // спрятать (−1) или вернуть дальний вариант дерева i
    const M = farMeshes[farOf[i * 3]].mesh, a = M.geometry.attributes.aTree, v0 = farOf[i * 3 + 1];
    for (let v = v0; v < v0 + farOf[i * 3 + 2]; v++) a.array[v * 3 + 2] = lim;
    a.needsUpdate = true;
  };

  /* ---------- столкновения: крупные — столбы, мелкие — сбиваемые ---------- */
  const brkKinds = new Set(P.brk.kinds), itemTree = [], moved = new Set(), hidden = new Set();
  const proxy = A => ({ mesh: { setMatrixAt(k, m) { const i = itemTree[k]; m.toArray(A, i * 16); moved.add(i); }, instanceMatrix: {}, boundingSphere: null }, per: 1, loc: null });
  const B = new Breakables([proxy(MT), proxy(MC)], { mass: 180, anchor: 2, minSpeed: 4, dmg: 0.3, cy: 2.2, lie: 1.35, kind: 'wood',
    onBreak: it => { const i = itemTree[it.i]; hidden.add(i); farLim(i, -1); } });
  const base = new THREE.Matrix4(), inv = new THREE.Matrix4(), qI = new THREE.Quaternion(), vP = new THREE.Vector3(), vS = new THREE.Vector3();
  let nStat = 0;
  list.forEach((t, i) => {
    const r = Math.max(0.12, kit.forms[t.f].tr * t.h) + 0.03;
    if (brkKinds.has(t.k) || t.h < P.brk.h) {
      const s = t.h / 5;
      inv.copy(base.compose(vP.set(t.x, Y[i], t.z), qI, vS.setScalar(s))).invert();
      itemTree.push(i);
      B.add(grid, t.x, Y[i], t.z, 0, r, t.h, { s, loc: [inv.clone().multiply(mT.fromArray(MT, i * 16)), inv.clone().multiply(mC.fromArray(MC, i * 16))] });
    } else { grid.addCircle(t.x, t.z, r, t.h); nStat++; }
  });
  moved.clear();

  /* ---------- каждый кадр ---------- */
  // перед отрисовкой половины экрана p: граница слоёв, набор ближних игрока p (другой скрыт), квадраты дальних
  K.treeCull = (x, z, p = 0) => {
    SITGES_TREE_U.uView.value.set(x, z); SITGES_TREE_U.uNear.value = near; SITGES_TREE_U.uBand.value = near * P.band;
    const S = sets[p] || sets[0];
    if (!S.cam || Math.hypot(S.cam[0] - x, S.cam[1] - z) > P.margin) { S.cam = [x, z]; rebuild(S); }
    for (const Q of sets) for (const Y2 of Q.L) for (const arr of [Y2.T, Y2.C]) for (const m of arr) if (m) m.visible = Q === S && m.count > 0;
    for (const F of farMeshes) { const d = Math.hypot(F.x - x, F.z - z); F.mesh.visible = d - F.r < far && d + F.r > near * (1 - P.band); }
  };
  // сбитые деревья: новые матрицы — в ближние наборы
  K.treeUpdate = dt => {
    B.update(dt);
    if (!moved.size) return;
    for (const i of moved) for (const S of sets) if (S.cam && S.mark[i] === S.stamp) {
      put(S, i);
      const Y2 = S.L[S.lay[i]];
      for (const M of [Y2.T[form[i]], Y2.C[form[i]]]) { if (M.instanceMatrix.clearUpdateRanges) M.instanceMatrix.clearUpdateRanges(); M.instanceMatrix.needsUpdate = true; }
    }
    moved.clear();
  };
  K.treeReset = () => { B.reset(); for (const i of hidden) farLim(i, list[i].h < P.small ? farSmall : far); hidden.clear(); K.treeUpdate(0); };
  // отладка и замеры: другая граница слоёв (м) — наборы пересоберутся на следующем кадре
  K.treeTune = n => { near = n; for (const S of sets) S.cam = null; };
  K.treeBrk = B;
  group.add(root);
  let nearTris = 0; for (let i = 0; i < N; i++) { const f = forms[form[i]]; nearTris += f.tris.trunk + f.tris.crown; }
  K.treeStats = { n: N, near: near0, far, farMeshes: farMeshes.length, farTris, tris: nearTris, brk: B.items.length, posts: nStat };
}
