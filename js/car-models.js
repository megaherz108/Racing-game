// Mid-poly модели машин из примитивов
// Определяет: buildCarModel, STYLE, carNarrow, taperMesh, carFaces, disposeTree.
// Использует: MAT, extrude, lowerShape, box, polyShape, beam, lerp, clamp, mergeByMaterial, makeWheel, cyl
//   (js/core.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

/* =====================================================================
   CAR MODELS (mid-poly из примитивов)
   ===================================================================== */
// opts.lacquer — краска с лаковым слоем (clearcoat): резкий блик поверх мягкого металлика, как у настоящей краски.
//   Дороже обычной (второй слой бликов в каждом пикселе кузова), поэтому только у машин игроков, не у трафика.
// opts.bumpers — передний и задний бамперы отдельными группами (их может оторвать ударом, js/carfx.js)
function buildCarModel(def, paintHex, opts = {}) {
  const g = def.geo;
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const paint = opts.lacquer
    ? new THREE.MeshPhysicalMaterial({ color: paintHex, metalness: 0.45, roughness: 0.42, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.2 })
    : new THREE.MeshStandardMaterial({ color: paintHex, metalness: 0.5, roughness: 0.3, envMapIntensity: 1.1 });
  const bump = opts.bumpers ? { f: new THREE.Group(), r: new THREE.Group() } : { f: body, r: body };
  if (opts.bumpers) body.add(bump.f, bump.r);
  const pillarMat = g.pillar === 'black' ? MAT.black : paint;

  // кузов
  // archLift — центр арки выше оси колеса; bodyL — длина низа кузова без бамперов (по умолчанию L)
  const arches = [
    { z: g.axR, r: g.rR + g.archPad, cy: g.rR + (g.archLift || 0) },
    { z: g.axF, r: g.rF + g.archPad, cy: g.rF + (g.archLift || 0) },
  ];
  extrude(lowerShape(g.bodyL || g.L, g.bottomY, arches, g.top), g.W, paint, g.bevel, body);
  // днище (тёмное), чтобы не просвечивало
  box(g.W - 0.3, 0.06, g.L - 0.5, MAT.black, 0, g.bottomY + 0.02, 0, body);

  // остекление + крыша + стойки
  const gh = g.gh;
  taperMesh(g, extrude(polyShape(gh), g.ghW, MAT.glass, 0.02, body));
  const [r1, r2] = [gh[1], gh[2]];
  taperMesh(g, extrude(polyShape([[r1[0] + 0.03, r1[1] - 0.02], [r1[0] + 0.03, r1[1] + 0.05], [r2[0] - 0.03, r2[1] + 0.05], [r2[0] - 0.03, r2[1] - 0.02]]),
    g.ghW + 0.06, paint, 0.02, body));
  const px = g.ghW / 2 + 0.012, pxy = y => px * carNarrow(g, y);
  for (const s of [1, -1]) {
    beam([s * pxy(gh[0][1]), gh[0][1], gh[0][0]], [s * pxy(gh[1][1]), gh[1][1], gh[1][0]], 0.07, pillarMat, body);
    beam([s * pxy(gh[3][1]), gh[3][1], gh[3][0]], [s * pxy(gh[2][1]), gh[2][1], gh[2][0]], 0.09, pillarMat, body);
    for (const bz of g.bPillars) {
      const t = (gh[0][0] - bz) / (gh[0][0] - gh[3][0]);
      const by = lerp(gh[0][1], gh[3][1], t);
      const ty = lerp(gh[1][1], gh[2][1], clamp((gh[1][0] - bz) / (gh[1][0] - gh[2][0]), 0, 1));
      const bp = box(0.06, ty - by + 0.02, 0.1, pillarMat, s * (pxy(by) + pxy(ty)) / 2, (ty + by) / 2, bz, body);
      bp.rotation.z = s * Math.atan2(pxy(by) - pxy(ty), ty - by);   // с завалом боковин стойка наклонена внутрь
    }
    // зеркала
    const mz = gh[0][0] - 0.22, my = gh[0][1] + 0.1;
    box(0.2, 0.05, 0.06, MAT.black, s * (g.W / 2 + 0.02), my - 0.02, mz, body);
    box(0.09, 0.12, 0.17, paint, s * (g.W / 2 + 0.12), my + 0.02, mz, body);
  }

  // стилевые детали
  STYLE[g.style](g, body, paint, bump);
  if (opts.bumpers) for (const k of ['f', 'r']) {
    mergeByMaterial(bump[k], true);
    bump[k].traverse(o => { if (o.isMesh) o.userData.keep = true; });   // бамперы не склеиваются с кузовом
  }
  mergeByMaterial(body, true);           // ~30 деталей кузова → по одному мешу на материал

  // колёса
  const wheels = [];
  for (const [axZ, r, front] of [[g.axF, g.rF, true], [g.axR, g.rR, false]]) {
    for (const side of [1, -1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * g.track, r, axZ);
      root.add(pivot);
      const spin = makeWheel(r, g.ww, side, g.rim, g.steelRim);
      pivot.add(spin);
      wheels.push({ pivot, spin, front, r });
    }
  }
  return { root, body, wheels, paint, bumpers: opts.bumpers ? bump : null };
}

const STYLE = {
  sedan(g, body, paint, bp) {
    const fz = g.L / 2, W = g.W;
    const long = g.L > 4.7;               // Accord
    const fFace = long ? 2.47 : 2.24, rFace = long ? -2.45 : -2.22;
    // фары
    for (const s of [1, -1]) {
      const hl = box(long ? 0.52 : 0.44, long ? 0.09 : 0.12, 0.22, MAT.head, s * (W / 2 - 0.34), long ? 0.69 : 0.70, fFace - 0.08, body);
      hl.rotation.x = -0.5;
      box(0.1, 0.07, 0.1, MAT.amber, s * (W / 2 - 0.08), long ? 0.66 : 0.67, fFace - 0.09, body);
      box(long ? 0.46 : 0.38, long ? 0.11 : 0.14, 0.08, MAT.tail, s * (W / 2 - 0.3), long ? 0.83 : 0.82, rFace - 0.05, body);
      // ручки дверей
      for (const dz of [0.35, -0.75]) box(0.03, 0.035, 0.18, MAT.chrome, s * (W / 2 + 0.01), 0.86, dz + (long ? 0.05 : 0), body);
    }
    // решётка и бамперы
    box(long ? 1.0 : 0.72, long ? 0.14 : 0.1, 0.08, MAT.black, 0, long ? 0.53 : 0.55, fFace + 0.04, bp.f);
    if (long) box(1.0, 0.035, 0.09, MAT.chrome, 0, 0.62, fFace + 0.045, bp.f);
    box(1.35, 0.08, 0.06, MAT.black, 0, 0.31, fFace - 0.02, bp.f);
    box(0.5, 0.12, 0.03, MAT.plate, 0, 0.42, fFace + 0.06, bp.f);
    box(0.5, 0.12, 0.03, MAT.plate, 0, 0.62, rFace - 0.07, bp.r);
    box(1.6, 0.1, 0.06, MAT.black, 0, 0.36, rFace - 0.05, bp.r);
    if (long) {
      box(0.8, 0.03, 0.08, MAT.chrome, 0, 0.83, rFace - 0.05, body);
      for (const s of [1, -1]) beam([s * (g.ghW / 2 + 0.03), 0.99, 1.0], [s * (g.ghW / 2 + 0.03), 0.99, -1.75], 0.03, MAT.chrome, body);
    }
    // выхлоп
    const ex = cyl(0.045, 0.045, 0.2, 8, MAT.chrome, body); ex.rotation.x = Math.PI / 2; ex.position.set(-0.55, 0.3, rFace - 0.04);
  },

  suv(g, body, paint, bp) {
    const W = g.W, fFace = 2.48, rFace = -2.46;
    // «ноздри» BMW
    for (const s of [1, -1]) {
      box(0.29, 0.25, 0.05, MAT.chrome, s * 0.17, 0.80, fFace + 0.05, body);
      box(0.23, 0.19, 0.06, MAT.black, s * 0.17, 0.80, fFace + 0.06, body);
      const hl = box(0.44, 0.1, 0.22, MAT.head, s * 0.62, 0.92, fFace - 0.06, body); hl.rotation.x = -0.6;
      box(0.16, 0.06, 0.05, MAT.amber, s * 0.66, 0.6, fFace + 0.03, body);
      box(0.44, 0.12, 0.08, MAT.tail, s * 0.66, 1.03, rFace - 0.06, body);
      // пластиковые накладки порогов
      box(0.04, 0.16, 1.9, MAT.black, s * (W / 2 + 0.012), 0.5, 0.04, body);
      // рейлинги
      const rx = s * (g.ghW / 2 - 0.12);
      box(0.05, 0.05, 2.2, MAT.trim, rx, 1.79, -0.85, body);
      for (const lz of [0.15, -1.85]) box(0.06, 0.08, 0.1, MAT.trim, rx, 1.74, lz, body);
      for (const dz of [0.25, -0.85]) box(0.03, 0.04, 0.2, MAT.chrome, s * (W / 2 + 0.01), 1.1, dz, body);
    }
    box(1.4, 0.13, 0.06, MAT.black, 0, 0.55, fFace + 0.02, bp.f);
    box(0.48, 0.11, 0.03, MAT.plate, 0, 0.66, fFace + 0.07, bp.f);
    box(1.8, 0.16, 0.06, MAT.black, 0, 0.55, rFace - 0.05, bp.r);
    box(0.5, 0.12, 0.03, MAT.plate, 0, 0.82, rFace - 0.08, bp.r);
    box(1.5, 0.04, 0.3, paint, 0, 1.72, -2.12, body).rotation.x = 0.12;    // спойлер на крыше
    for (const s of [1, -1]) { const ex = cyl(0.05, 0.05, 0.15, 10, MAT.chrome, body); ex.rotation.x = Math.PI / 2; ex.position.set(s * 0.6, 0.47, rFace - 0.04); }
  },

  hummer(g, body, paint, bp) {
    const W = g.W, fFace = 2.35, rFace = -2.35;
    // решётка с вертикальными прорезями
    box(1.75, 0.34, 0.05, MAT.black, 0, 0.88, fFace + 0.02, body);
    for (let i = -3; i <= 3; i++) box(0.07, 0.34, 0.07, paint, i * 0.14, 0.88, fFace + 0.03, body);
    for (const s of [1, -1]) {
      const hl = cyl(0.11, 0.11, 0.08, 16, MAT.head, body); hl.rotation.x = Math.PI / 2; hl.position.set(s * 0.72, 0.9, fFace + 0.04);
      const ring = cyl(0.14, 0.14, 0.05, 16, MAT.chrome, body); ring.rotation.x = Math.PI / 2; ring.position.set(s * 0.72, 0.9, fFace + 0.025);
      box(0.12, 0.08, 0.05, MAT.amber, s * 0.98, 0.9, fFace + 0.03, body);
      box(0.16, 0.16, 0.06, MAT.tail, s * 0.92, 1.05, rFace - 0.04, body);
      // расширители арок
      for (const az of [g.axF, g.axR]) {
        const ar = g.rF + g.archPad;
        box(0.16, 0.1, ar * 2 + 0.25, MAT.black, s * (W / 2 + 0.05), 1.0, az, body);
        box(0.16, 0.36, 0.1, MAT.black, s * (W / 2 + 0.05), 0.82, az + ar + 0.12, body);
        box(0.16, 0.36, 0.1, MAT.black, s * (W / 2 + 0.05), 0.82, az - ar - 0.12, body);
      }
      // большие зеркала
      box(0.06, 0.26, 0.2, MAT.black, s * (W / 2 + 0.16), 1.55, 0.6, body);
    }
    // перегородка лобового стекла
    beam([0, g.gh[0][1], g.gh[0][0] + 0.01], [0, g.gh[1][1], g.gh[1][0] + 0.01], 0.07, paint, body);
    // силовые бамперы, лебёдка
    box(W + 0.12, 0.26, 0.3, MAT.black, 0, 0.62, fFace + 0.1, bp.f);
    box(0.5, 0.18, 0.2, MAT.trim, 0, 0.62, fFace + 0.32, bp.f);
    for (const s of [1, -1]) box(0.08, 0.14, 0.12, MAT.amber, s * 0.75, 0.62, fFace + 0.27, bp.f);
    box(W + 0.12, 0.24, 0.26, MAT.black, 0, 0.62, rFace - 0.08, bp.r);
    box(0.5, 0.12, 0.03, MAT.plate, 0, 0.82, rFace - 0.04, body);
    // запаска
    const sp = cyl(0.42, 0.42, 0.3, 18, MAT.tire, body); sp.rotation.x = Math.PI / 2; sp.position.set(-0.45, 1.25, rFace - 0.2);
    const sr = cyl(0.25, 0.25, 0.32, 12, MAT.trim, body); sr.rotation.x = Math.PI / 2; sr.position.copy(sp.position);
    // антенна
    const ant = cyl(0.012, 0.012, 1.3, 4, MAT.black, body); ant.position.set(-0.98, 1.98, -2.2);
    // люки/канистры на крыше
    box(1.1, 0.12, 1.1, MAT.trim, 0, 2.0, -0.9, body);
  },

  super(g, body, paint, bp) {
    const W = g.W, fFace = 2.42, rFace = -2.40;
    // моторный отсек с жалюзи
    extrude(polyShape(g.engine), g.ghW + 0.2, paint, 0.03, body);
    for (let i = 0; i < 5; i++) {
      const t = 0.15 + i * 0.16;
      box(g.ghW * 0.82, 0.03, 0.09, MAT.black, 0, lerp(1.13, 0.97, t) + 0.04, lerp(-0.5, -2.12, t), body);
    }
    for (const s of [1, -1]) {
      // Y-образные фары
      beam([s * 0.88, 0.57, 2.17], [s * 0.42, 0.62, 2.3], 0.05, MAT.head, body);
      beam([s * 0.62, 0.6, 2.24], [s * 0.52, 0.44, 2.36], 0.045, MAT.head, body);
      // воздухозаборники
      box(0.55, 0.16, 0.06, MAT.black, s * 0.62, 0.32, fFace - 0.0, body);
      box(0.26, 0.06, 0.5, MAT.black, s * 0.78, 0.95, -1.1, body);
      // Y-образные фонари
      beam([s * 0.95, 0.80, -2.36], [s * 0.5, 0.80, -2.42], 0.06, MAT.tail, body);
      beam([s * 0.75, 0.80, -2.39], [s * 0.88, 0.64, -2.42], 0.05, MAT.tail, body);
      // стойки антикрыла
      box(0.04, 0.2, 0.12, MAT.black, s * 0.45, 1.04, -2.02, body);
    }
    // боковые треугольные воздухозаборники (сквозная плоская призма, видна с обеих сторон)
    extrude(polyShape([[-0.2, 0.42], [-0.9, 0.42], [-0.9, 0.84]]), W + 0.025, MAT.black, 0, body);
    box(1.85, 0.04, 0.32, MAT.black, 0, 0.17, fFace - 0.1, bp.f);            // сплиттер
    box(0.7, 0.12, 0.05, MAT.black, 0, 0.33, fFace + 0.01, bp.f);
    box(1.7, 0.04, 0.36, paint, 0, 1.16, -2.04, body).rotation.x = 0.08;      // антикрыло
    box(1.7, 0.36, 0.06, MAT.black, 0, 0.6, rFace - 0.03, bp.r);              // задняя решётка
    box(1.6, 0.12, 0.3, MAT.black, 0, 0.22, rFace + 0.05, bp.r);              // диффузор
    const ex = cyl(0.12, 0.12, 0.16, 6, MAT.chrome, body); ex.rotation.x = Math.PI / 2; ex.position.set(0, 0.42, rFace - 0.04);
  },

  // Golf GTI: короткий хэтчбек, толстая задняя стойка, красная полоса через решётку
  hatch(g, body, paint, bp) {
    const W = g.W, [fFace, rFace] = carFaces(g);
    // толстая задняя стойка: сплошной блок в цвет кузова поверх бокового стекла
    extrude(polyShape([[-1.0, 0.99], [-1.12, 1.37], [-1.54, 1.355], [-1.92, 1.0]]), g.ghW + 0.03, paint, 0.01, body);
    for (const s of [1, -1]) {
      const hl = box(0.42, 0.1, 0.22, MAT.head, s * (W / 2 - 0.33), 0.69, fFace - 0.1, body); hl.rotation.x = -0.5;
      box(0.09, 0.06, 0.1, MAT.amber, s * (W / 2 - 0.09), 0.64, fFace - 0.1, body);
      box(0.5, 0.13, 0.08, MAT.tail, s * (W / 2 - 0.3), 0.87, rFace - 0.02, body);
      for (const dz of [0.25, -0.85]) box(0.03, 0.035, 0.18, MAT.chrome, s * (W / 2 + 0.01), 0.86, dz, body);
      box(0.04, 0.1, 1.6, MAT.black, s * (W / 2 + 0.01), 0.33, -0.06, body);              // пороги
      box(0.18, 0.07, 0.05, MAT.head, s * 0.62, 0.4, fFace + 0.01, bp.f);                  // противотуманки
      const ex = cyl(0.045, 0.045, 0.18, 8, MAT.chrome, body); ex.rotation.x = Math.PI / 2; ex.position.set(s * 0.55, 0.3, rFace - 0.03);
    }
    const gr = box(0.62, 0.08, 0.2, MAT.black, 0, 0.7, fFace - 0.1, body); gr.rotation.x = -0.5;   // узкая решётка между фар
    box(1.3, 0.022, 0.05, MAT.tail, 0, 0.615, fFace - 0.0, body);                            // красная полоса GTI
    box(1.0, 0.16, 0.06, MAT.black, 0, 0.42, fFace + 0.0, bp.f);                             // сотовый воздухозаборник
    box(0.5, 0.11, 0.03, MAT.plate, 0, 0.53, fFace + 0.01, bp.f);
    box(1.45, 0.05, 0.12, MAT.black, 0, 0.32, fFace - 0.06, bp.f);                          // губа
    box(0.5, 0.11, 0.03, MAT.plate, 0, 0.66, rFace - 0.02, body);
    box(1.65, 0.12, 0.06, MAT.black, 0, 0.4, rFace - 0.03, bp.r);
    box(1.3, 0.04, 0.26, paint, 0, 1.39, -1.7, body).rotation.x = 0.15;                     // спойлер над пятой дверью
  },

  // Lada Niva (по чертежу 21214): нос-«лопата» с круглыми фарами в чёрной панели, капот с подъёмом к стеклу,
  // широкая задняя стойка со скруглённым углом крыши, расширители арок, пластиковые бамперы
  niva(g, body, paint, bp) {
    const W = g.W, [fFace, rFace] = carFaces(g), sx = W / 2 + 0.003;
    // задняя стойка и угол крыши — сплошной блок в цвет кузова поверх бокового стекла
    taperMesh(g, extrude(polyShape([[-1.28, 1.12], [-1.28, 1.635], [-1.43, 1.635], [-1.50, 1.60], [-1.575, 1.52], [-1.67, 1.12]]),
      g.ghW + 0.03, paint, 0.012, body));
    // заднее стекло на наклонной двери: чёрный уплотнитель + стекло
    const ra = Math.atan2(0.09, 0.37), rz = -1.64 - 0.012, ry = 1.315;
    box(1.24, 0.44, 0.012, MAT.black, 0, ry, rz + 0.004, body).rotation.x = ra;
    box(1.14, 0.37, 0.012, MAT.glass, 0, ry, rz - 0.002, body).rotation.x = ra;
    beam([0.02, 1.19, -1.675], [0.4, 1.42, -1.62], 0.014, MAT.black, body);                 // дворник
    // нос: чёрная панель во всю ширину, решётка из планок, круглые фары
    box(1.53, 0.26, 0.03, MAT.black, 0, 0.69, fFace + 0.005, body);
    for (let i = 0; i < 5; i++) box(0.9, 0.018, 0.02, MAT.trim, 0, 0.6 + i * 0.045, fFace + 0.025, body);
    box(0.05, 0.09, 0.02, MAT.chrome, 0, 0.69, fFace + 0.036, body);                       // ладья
    for (const s of [1, -1]) {
      const ring = cyl(0.105, 0.105, 0.03, 18, MAT.chrome, body); ring.rotation.x = Math.PI / 2; ring.position.set(s * 0.62, 0.675, fFace + 0.025);
      const hl = cyl(0.088, 0.088, 0.03, 18, MAT.head, body); hl.rotation.x = Math.PI / 2; hl.position.set(s * 0.62, 0.675, fFace + 0.032);
      box(0.19, 0.065, 0.03, MAT.amber, s * 0.62, 0.885, fFace + 0.0, body);               // указатели поворота над фарами
      box(0.02, 0.04, 0.11, MAT.amber, s * sx, 0.88, 1.5, body);                          // боковой повторитель
      // задние фонари: красный, оранжевый, белый (задний ход)
      box(0.19, 0.13, 0.05, MAT.tail, s * 0.665, 0.815, rFace + 0.005, body);
      box(0.19, 0.07, 0.05, MAT.amber, s * 0.665, 0.715, rFace + 0.005, body);
      box(0.19, 0.06, 0.05, MAT.plate, s * 0.665, 0.65, rFace + 0.005, body);
      // дверь: швы и ручка
      box(0.006, 0.64, 0.012, MAT.black, s * sx, 0.8, 0.53, body);
      box(0.006, 0.64, 0.012, MAT.black, s * sx, 0.8, -0.44, body);
      box(0.006, 0.012, 0.97, MAT.black, s * sx, 0.48, 0.045, body);
      box(0.03, 0.035, 0.16, MAT.chrome, s * (W / 2 + 0.012), 1.03, -0.32, body);
      box(0.01, 0.025, 2.3, MAT.black, s * (W / 2 - 0.04), 1.135, -0.44, body);           // уплотнитель по низу окон
      // жалюзи вытяжки на задней стойке
      for (let k = 0; k < 3; k++) {
        const vy = 1.5 - k * 0.055, v = box(0.012, 0.022, 0.11, MAT.black, s * ((g.ghW + 0.03) / 2 * carNarrow(g, vy) + 0.004), vy, -1.43 - k * 0.03, body);
        v.rotation.x = -0.35;
      }
      box(0.01, 0.03, 0.1, MAT.chrome, s * sx, 0.88, -1.45, body);                          // шильдик 4×4
      // водостоки над дверями
      box(0.025, 0.025, 1.65, paint, s * ((g.ghW + 0.06) / 2 * carNarrow(g, 1.6) + 0.004), 1.6, -0.56, body);
      // расширители арок
      for (const az of [g.axF, g.axR]) {
        const r0 = g.rF + g.archPad, cy = g.rF + g.archLift, sh = new THREE.Shape();
        sh.absarc(az, cy, r0 + 0.055, -0.08, Math.PI + 0.08, false);
        sh.absarc(az, cy, r0, Math.PI + 0.08, -0.08, true);
        extrude(sh, 0.07, paint, 0.008, body).position.x = s * (W / 2 - 0.005);
      }
      box(0.04, 0.24, 0.02, MAT.black, s * g.track, 0.3, g.axR - 0.4, body);              // задние брызговики
    }
    for (const s of [1, -1]) box(0.5, 0.012, 0.012, MAT.black, s * 0.27, 1.2, 0.67, body);  // дворники
    // бамперы
    box(W + 0.04, 0.13, 0.215, MAT.trim, 0, 0.475, 1.728, bp.f);
    box(0.52, 0.11, 0.012, MAT.plate, 0, 0.455, 1.84, bp.f);
    box(1.5, 0.12, 0.05, MAT.black, 0, 0.36, 1.64, bp.f);
    box(W + 0.02, 0.12, 0.15, MAT.trim, 0, 0.485, -1.775, bp.r);
    box(1.5, 0.12, 0.05, MAT.black, 0, 0.37, -1.72, bp.r);
    box(0.68, 0.045, 0.012, MAT.black, 0, 0.885, rFace - 0.004, body);                    // надпись «НИВА 4×4»
    box(0.52, 0.11, 0.012, MAT.plate, 0, 0.74, rFace - 0.004, body);
    const ex = cyl(0.03, 0.03, 0.16, 8, MAT.trim, body); ex.rotation.x = Math.PI / 2; ex.position.set(-0.5, 0.33, -1.74);
  },

  // Mustang: «акулий» нос с большой решёткой, вытянутый капот с вентиляцией, фастбэк, три полосы фонарей
  muscle(g, body, paint, bp) {
    const W = g.W, [fFace, rFace] = carFaces(g);
    // нос наклонён вперёд: поверхность между первыми двумя точками профиля (+ фаска)
    const [[z0, y0], [z1, y1]] = g.top, noseZ = y => z0 + (y - y0) / (y1 - y0) * (z1 - z0) + g.bevel;
    const gr = box(1.05, 0.26, 0.05, MAT.black, 0, 0.53, noseZ(0.53) + 0.015, body); gr.rotation.x = Math.atan2(z1 - z0, y1 - y0);
    box(1.4, 0.05, 0.1, MAT.black, 0, 0.31, noseZ(0.31) - 0.03, bp.f);
    box(0.5, 0.11, 0.03, MAT.plate, 0, 0.4, noseZ(0.4) + 0.02, bp.f);
    // чёрная панель между фонарями
    box(1.5, 0.24, 0.03, MAT.black, 0, 0.74, rFace - 0.012, body);
    for (const s of [1, -1]) {
      const hl = box(0.46, 0.08, 0.22, MAT.head, s * (W / 2 - 0.36), 0.77, fFace - 0.1, body); hl.rotation.x = -0.6;
      box(0.06, 0.12, 0.04, MAT.head, s * (W / 2 - 0.42), 0.5, noseZ(0.5) + 0.02, bp.f);                // вертикальные ходовые огни
      box(0.28, 0.03, 0.4, MAT.black, s * 0.4, 0.88, 1.5, body).rotation.x = 0.06;        // жабры на капоте
      for (let i = 0; i < 3; i++) box(0.09, 0.2, 0.04, MAT.tail, s * (0.4 + i * 0.14), 0.74, rFace - 0.035, body);
      box(0.03, 0.035, 0.16, MAT.chrome, s * (W / 2 + 0.01), 0.84, -0.2, body);
      box(0.04, 0.1, 1.7, MAT.black, s * (W / 2 + 0.01), 0.3, -0.05, body);
      for (const ex0 of [0.5, 0.64]) { const ex = cyl(0.05, 0.05, 0.18, 10, MAT.chrome, body); ex.rotation.x = Math.PI / 2; ex.position.set(s * ex0, 0.3, rFace - 0.03); }
    }
    box(0.5, 0.11, 0.03, MAT.plate, 0, 0.55, rFace - 0.03, bp.r);
    box(1.7, 0.1, 0.06, MAT.black, 0, 0.38, rFace - 0.03, bp.r);
    box(1.62, 0.04, 0.16, paint, 0, 1.0, -2.3, body).rotation.x = 0.2;                     // «утиный хвост»
  },

  // WRX STI: седан с воздухозаборником на капоте, большим антикрылом и брызговиками
  rally(g, body, paint, bp) {
    const W = g.W, [fFace, rFace] = carFaces(g);
    for (const s of [1, -1]) {
      const hl = box(0.46, 0.1, 0.22, MAT.head, s * (W / 2 - 0.34), 0.7, fFace - 0.08, body); hl.rotation.x = -0.5;
      box(0.3, 0.14, 0.05, MAT.black, s * 0.62, 0.42, fFace - 0.035, bp.f);
      box(0.14, 0.08, 0.04, MAT.head, s * 0.62, 0.42, fFace + 0.0, bp.f);                   // противотуманки
      box(0.44, 0.13, 0.08, MAT.tail, s * (W / 2 - 0.3), 0.84, rFace - 0.03, body);
      for (const dz of [0.4, -0.7]) box(0.03, 0.035, 0.18, MAT.chrome, s * (W / 2 + 0.01), 0.87, dz, body);
      box(0.04, 0.1, 1.7, MAT.black, s * (W / 2 + 0.01), 0.35, 0.05, body);
      for (const az of [g.axF, g.axR]) box(g.ww + 0.06, 0.24, 0.02, MAT.black, s * g.track, 0.2, az - g.rF - 0.12, body);   // брызговики
      // антикрыло на стойках
      box(0.05, 0.22, 0.08, MAT.black, s * 0.5, 1.1, -1.95, body);
      box(0.03, 0.12, 0.32, paint, s * 0.78, 1.2, -2.0, body);
      for (const ex0 of [0.42, 0.56]) { const ex = cyl(0.05, 0.05, 0.18, 10, MAT.chrome, body); ex.rotation.x = Math.PI / 2; ex.position.set(s * ex0, 0.3, rFace - 0.03); }
    }
    box(1.56, 0.04, 0.3, paint, 0, 1.24, -2.0, body).rotation.x = 0.1;
    box(0.62, 0.17, 0.08, MAT.black, 0, 0.53, fFace + 0.02, bp.f);                          // шестигранная решётка
    box(0.5, 0.11, 0.03, MAT.plate, 0, 0.42, fFace + 0.03, bp.f);
    box(1.5, 0.05, 0.12, MAT.black, 0, 0.32, fFace - 0.06, bp.f);
    // воздухозаборник интеркулера на капоте
    box(0.52, 0.1, 0.42, paint, 0, 0.89, 1.55, body).rotation.x = 0.1;
    box(0.42, 0.05, 0.04, MAT.black, 0, 0.91, 1.77, body);
    box(0.5, 0.11, 0.03, MAT.plate, 0, 0.62, rFace - 0.03, bp.r);
    box(1.6, 0.12, 0.06, MAT.black, 0, 0.38, rFace - 0.03, bp.r);
  },

  // Porsche 911: круглые фары на крыльях, покатая крыша до самой кормы, жалюзи над мотором, сплошная полоса фонарей
  sport(g, body, paint, bp) {
    const W = g.W, [fFace, rFace] = carFaces(g), e = g.engine;
    extrude(polyShape(e), g.ghW + 0.1, paint, 0.03, body);                                 // крышка мотора
    for (let i = 0; i < 5; i++) {
      const t = 0.12 + i * 0.17;
      box(g.ghW * 0.6, 0.02, 0.08, MAT.black, 0, lerp(e[0][1], e[1][1], t) + 0.035, lerp(e[0][0], e[1][0], t), body);
    }
    box(1.3, 0.03, 0.2, paint, 0, 0.97, -2.0, body).rotation.x = 0.12;                      // выдвижной спойлер
    for (const s of [1, -1]) {
      // «лягушачьи глаза»: круглые фары в выступах крыльев
      const ax = Math.PI / 2 - 0.25, hx = s * (W / 2 - 0.32), dy = Math.sin(0.25), dz = Math.cos(0.25);
      const hous = cyl(0.15, 0.15, 0.36, 18, paint, body); hous.rotation.x = ax; hous.position.set(hx, 0.72, 1.78);
      const hl = cyl(0.125, 0.125, 0.04, 18, MAT.head, body); hl.rotation.x = ax; hl.position.set(hx, 0.72 + dy * 0.18, 1.78 + dz * 0.18);
      box(0.32, 0.12, 0.05, MAT.black, s * 0.6, 0.38, fFace - 0.03, bp.f);                  // боковые воздухозаборники
      box(0.24, 0.025, 0.05, MAT.head, s * 0.6, 0.46, fFace - 0.02, bp.f);
      box(0.03, 0.03, 0.15, MAT.chrome, s * (W / 2 + 0.01), 0.8, -0.15, body);
      box(0.04, 0.1, 1.5, MAT.black, s * (W / 2 + 0.01), 0.27, 0.05, body);
      const ex = cyl(0.06, 0.06, 0.16, 10, MAT.chrome, body); ex.rotation.x = Math.PI / 2; ex.position.set(s * 0.55, 0.3, rFace - 0.03);
    }
    box(0.6, 0.12, 0.05, MAT.black, 0, 0.36, fFace - 0.0, bp.f);
    box(0.5, 0.11, 0.03, MAT.plate, 0, 0.36, fFace + 0.03, bp.f);
    box(1.6, 0.04, 0.24, MAT.black, 0, 0.22, fFace - 0.1, bp.f);
    box(W - 0.2, 0.045, 0.05, MAT.tail, 0, 0.74, rFace - 0.015, body);                      // фонари — одна полоса
    box(W - 0.3, 0.07, 0.03, MAT.black, 0, 0.66, rFace - 0.01, body);
    box(0.5, 0.11, 0.03, MAT.plate, 0, 0.52, rFace - 0.03, bp.r);
    box(1.6, 0.1, 0.06, MAT.black, 0, 0.35, rFace - 0.03, bp.r);
  },
};
// Завал боковин (g.tumble): остекление сужается кверху — от линии окон (gh[0]) до крыши (gh[1]) на долю tumble.
// carNarrow — множитель ширины на высоте y; taperMesh — сузить так готовый меш (координаты — в системе кузова).
function carNarrow(g, y) {
  if (!g.tumble) return 1;
  const y0 = g.gh[0][1], y1 = g.gh[1][1];
  return 1 - g.tumble * clamp((y - y0) / (y1 - y0), 0, 1);
}
function taperMesh(g, m) {
  if (!g.tumble) return m;
  const p = m.geometry.attributes.position;
  for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) * carNarrow(g, p.getY(i) + m.position.y));
  p.needsUpdate = true; m.geometry.computeVertexNormals();
  return m;
}

// передняя и задняя поверхности кузова по Z: крайние точки профиля плюс фаска выдавливания (она раздувает контур)
function carFaces(g) {
  let f = -Infinity, r = Infinity;
  for (const [z] of g.top) { f = Math.max(f, z); r = Math.min(r, z); }
  return [f + g.bevel, r - g.bevel];
}

function disposeTree(o) {
  o.traverse(c => {
    if (c.geometry) c.geometry.dispose();
    if (c.material && !c.material.userData.shared) c.material.dispose();
  });
}

