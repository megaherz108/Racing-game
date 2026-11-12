// Mid-poly модели машин из примитивов
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

/* =====================================================================
   CAR MODELS (mid-poly из примитивов)
   ===================================================================== */
function buildCarModel(def, paintHex) {
  const g = def.geo;
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const paint = new THREE.MeshStandardMaterial({ color: paintHex, metalness: 0.5, roughness: 0.3, envMapIntensity: 1.1 });
  const pillarMat = g.pillar === 'black' ? MAT.black : paint;

  // кузов
  const arches = [
    { z: g.axR, r: g.rR + g.archPad, cy: g.rR },
    { z: g.axF, r: g.rF + g.archPad, cy: g.rF },
  ];
  extrude(lowerShape(g.L, g.bottomY, arches, g.top), g.W, paint, g.bevel, body);
  // днище (тёмное), чтобы не просвечивало
  box(g.W - 0.3, 0.06, g.L - 0.5, MAT.black, 0, g.bottomY + 0.02, 0, body);

  // остекление + крыша + стойки
  const gh = g.gh;
  extrude(polyShape(gh), g.ghW, MAT.glass, 0.02, body);
  const [r1, r2] = [gh[1], gh[2]];
  extrude(polyShape([[r1[0] + 0.03, r1[1] - 0.02], [r1[0] + 0.03, r1[1] + 0.05], [r2[0] - 0.03, r2[1] + 0.05], [r2[0] - 0.03, r2[1] - 0.02]]),
    g.ghW + 0.06, paint, 0.02, body);
  const px = g.ghW / 2 + 0.012;
  for (const s of [1, -1]) {
    beam([s * px, gh[0][1], gh[0][0]], [s * px, gh[1][1], gh[1][0]], 0.07, pillarMat, body);
    beam([s * px, gh[3][1], gh[3][0]], [s * px, gh[2][1], gh[2][0]], 0.09, pillarMat, body);
    for (const bz of g.bPillars) {
      const t = (gh[0][0] - bz) / (gh[0][0] - gh[3][0]);
      const by = lerp(gh[0][1], gh[3][1], t);
      const ty = lerp(gh[1][1], gh[2][1], clamp((gh[1][0] - bz) / (gh[1][0] - gh[2][0]), 0, 1));
      box(0.06, ty - by + 0.02, 0.1, pillarMat, s * px, (ty + by) / 2, bz, body);
    }
    // зеркала
    const mz = gh[0][0] - 0.22, my = gh[0][1] + 0.1;
    box(0.2, 0.05, 0.06, MAT.black, s * (g.W / 2 + 0.02), my - 0.02, mz, body);
    box(0.09, 0.12, 0.17, paint, s * (g.W / 2 + 0.12), my + 0.02, mz, body);
  }

  // стилевые детали
  STYLE[g.style](g, body, paint);

  // колёса
  const wheels = [];
  for (const [axZ, r, front] of [[g.axF, g.rF, true], [g.axR, g.rR, false]]) {
    for (const side of [1, -1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * g.track, r, axZ);
      root.add(pivot);
      const spin = makeWheel(r, g.ww, side, g.rim);
      pivot.add(spin);
      wheels.push({ pivot, spin, front, r });
    }
  }
  return { root, body, wheels, paint };
}

const STYLE = {
  sedan(g, body, paint) {
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
    box(long ? 1.0 : 0.72, long ? 0.14 : 0.1, 0.08, MAT.black, 0, long ? 0.53 : 0.55, fFace + 0.04, body);
    if (long) box(1.0, 0.035, 0.09, MAT.chrome, 0, 0.62, fFace + 0.045, body);
    box(1.35, 0.08, 0.06, MAT.black, 0, 0.31, fFace - 0.02, body);
    box(0.5, 0.12, 0.03, MAT.plate, 0, 0.42, fFace + 0.06, body);
    box(0.5, 0.12, 0.03, MAT.plate, 0, 0.62, rFace - 0.07, body);
    box(1.6, 0.1, 0.06, MAT.black, 0, 0.36, rFace - 0.05, body);
    if (long) {
      box(0.8, 0.03, 0.08, MAT.chrome, 0, 0.83, rFace - 0.05, body);
      for (const s of [1, -1]) beam([s * (g.ghW / 2 + 0.03), 0.99, 1.0], [s * (g.ghW / 2 + 0.03), 0.99, -1.75], 0.03, MAT.chrome, body);
    }
    // выхлоп
    const ex = cyl(0.045, 0.045, 0.2, 8, MAT.chrome, body); ex.rotation.x = Math.PI / 2; ex.position.set(-0.55, 0.3, rFace - 0.04);
  },

  suv(g, body, paint) {
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
    box(1.4, 0.13, 0.06, MAT.black, 0, 0.55, fFace + 0.02, body);
    box(0.48, 0.11, 0.03, MAT.plate, 0, 0.66, fFace + 0.07, body);
    box(1.8, 0.16, 0.06, MAT.black, 0, 0.55, rFace - 0.05, body);
    box(0.5, 0.12, 0.03, MAT.plate, 0, 0.82, rFace - 0.08, body);
    box(1.5, 0.04, 0.3, paint, 0, 1.72, -2.12, body).rotation.x = 0.12;    // спойлер на крыше
    for (const s of [1, -1]) { const ex = cyl(0.05, 0.05, 0.15, 10, MAT.chrome, body); ex.rotation.x = Math.PI / 2; ex.position.set(s * 0.6, 0.47, rFace - 0.04); }
  },

  hummer(g, body, paint) {
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
    box(W + 0.12, 0.26, 0.3, MAT.black, 0, 0.62, fFace + 0.1, body);
    box(0.5, 0.18, 0.2, MAT.trim, 0, 0.62, fFace + 0.32, body);
    for (const s of [1, -1]) box(0.08, 0.14, 0.12, MAT.amber, s * 0.75, 0.62, fFace + 0.27, body);
    box(W + 0.12, 0.24, 0.26, MAT.black, 0, 0.62, rFace - 0.08, body);
    box(0.5, 0.12, 0.03, MAT.plate, 0, 0.82, rFace - 0.04, body);
    // запаска
    const sp = cyl(0.42, 0.42, 0.3, 18, MAT.tire, body); sp.rotation.x = Math.PI / 2; sp.position.set(-0.45, 1.25, rFace - 0.2);
    const sr = cyl(0.25, 0.25, 0.32, 12, MAT.trim, body); sr.rotation.x = Math.PI / 2; sr.position.copy(sp.position);
    // антенна
    const ant = cyl(0.012, 0.012, 1.3, 4, MAT.black, body); ant.position.set(-0.98, 1.98, -2.2);
    // люки/канистры на крыше
    box(1.1, 0.12, 1.1, MAT.trim, 0, 2.0, -0.9, body);
  },

  super(g, body, paint) {
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
    box(1.85, 0.04, 0.32, MAT.black, 0, 0.17, fFace - 0.1, body);            // сплиттер
    box(0.7, 0.12, 0.05, MAT.black, 0, 0.33, fFace + 0.01, body);
    box(1.7, 0.04, 0.36, paint, 0, 1.16, -2.04, body).rotation.x = 0.08;      // антикрыло
    box(1.7, 0.36, 0.06, MAT.black, 0, 0.6, rFace - 0.03, body);              // задняя решётка
    box(1.6, 0.12, 0.3, MAT.black, 0, 0.22, rFace + 0.05, body);              // диффузор
    const ex = cyl(0.12, 0.12, 0.16, 6, MAT.chrome, body); ex.rotation.x = Math.PI / 2; ex.position.set(0, 0.42, rFace - 0.04);
  },
};

function disposeTree(o) {
  o.traverse(c => {
    if (c.geometry) c.geometry.dispose();
    if (c.material && !c.material.userData.shared) c.material.dispose();
  });
}

