// Побережье — РАСКЛАДКА: рельеф. Море с пляжем и мысом маяка на юге, холмы (случайные «бугры» разного размера,
// высоты и вытянутости + шум), петляющая река с запада на восток с заводью и песчаным островом, брод через остров,
// обрыв-трамплин на южном берегу, ровная площадка порта, горные склоны у краёв карты.
// Итог — сетка высот H с шагом STEP и ground(x, z); дороги позже «вдавливаются» в ту же сетку.
// Уровень воды по месту — waterAt(x, z): река течёт с запада на восток и стоит выше моря (wlAt).
// Определяет: ellMetric, RELIEF, coastPlanTerrain.
// Использует: clamp, lerp (js/core.js); smooth01 (js/world.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

// «расстояние» до эллипса E = {x, z, a, b, c, s}: < 1 — внутри, 1 — на краю
const ellMetric = (E, x, z) => {
  const dx = x - E.x, dz = z - E.z, u = dx * E.c + dz * E.s, v = -dx * E.s + dz * E.c;
  return Math.sqrt((u / E.a) ** 2 + (v / E.b) ** 2);
};

// Множитель перепадов высот суши (холмы, общий подъём к северу и югу, шум); пляж, русло, обрыв и предгорья у краёв
// карты от него не зависят. 0,7 — деревня ≈ 50 м над морем, южные холмы ≈ 25 м
const RELIEF = 0.7;
function coastPlanTerrain(C) {
  const { rng, noise, HX, HZ, SITES } = C;
  // сетка чуть шире границ: физика снимает рельеф на 12 м за краем
  const STEP = 2, EX = HX + 16, EZ = HZ + 16, NX = Math.round(2 * EX / STEP) + 1, NZ = Math.round(2 * EZ / STEP) + 1;
  const gx = i => -EX + i * STEP, gz = j => -EZ + j * STEP;
  const cellI = x => clamp(Math.round((x + EX) / STEP), 0, NX - 1), cellJ = z => clamp(Math.round((z + EZ) / STEP), 0, NZ - 1);
  const g2 = (d, s) => Math.exp(-d * d / (2 * s * s));
  const ell = (x, z, a, b, rot) => ({ x, z, a, b, c: Math.cos(rot), s: Math.sin(rot) });

  /* ---------- берег моря ---------- */
  // линия берега (z воды) для каждого x: неровная, с мысом маяка на юго-западе и прямой бетонной кромкой у порта
  const P = SITES.port, QUAY = P.z0 - 2;
  const portMask = x => smooth01((Math.min(x - P.x0, P.x1 - x) + 30) / 30);
  const coastZ = x => lerp(-632 + 9 * noise(x / 140, 3.1) + 4 * noise(x / 40, 7.7) - 70 * g2(x - SITES.lighthouse[0], 34), QUAY, portMask(x));
  const ZC = new Float32Array(NX);
  for (let i = 0; i < NX; i++) ZC[i] = coastZ(gx(i));

  /* ---------- река ---------- */
  // опорные точки с запада (+X) на восток (−X) — по эскизу: излучины разного размера, без ровного шага;
  // середина (заводь с островом) не сдвигается
  // на западе — большая петля к северу, дальше почти прямой плёс, заводь, глубокая излучина к югу и мелкие изгибы на востоке
  const RC = [[560, -60], [505, -48], [470, -20], [452, 25], [420, 62], [372, 70], [335, 48], [318, 10], [300, -30], [262, -48], [214, -44],
    [185, -30], [150, -36], [110, -28], [70, -4], [30, -14], [-31, -10], [-80, -22], [-110, -40], [-150, -74], [-200, -82], [-238, -60],
    [-250, -25], [-272, 8], [-310, 18], [-350, 8], [-372, -12], [-400, -18], [-445, -4], [-490, 12], [-530, 4], [-560, -2]];
  const MID = RC.findIndex(p => p[0] === -31);
  const ctrl = RC.map(([x, z], i) => i < 2 || i > RC.length - 3 || i === MID ? [x, z] : [x + (rng() - 0.5) * 8, z + (rng() - 0.5) * 10]);
  const curve = new THREE.CatmullRomCurve3(ctrl.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const wlAt = x => 7.5 + 1.5 * clamp(x / HX, -1, 1);          // уровень реки: 9 м на западе → 6 м на востоке
  const nR = Math.round(curve.getLength() / 2);
  const riverPts = curve.getSpacedPoints(nR).map((v, i) => ({ x: v.x, z: v.z, i, hw: 13 + 4 * noise(i / 45, 17.3), wl: wlAt(v.x) }));
  riverPts.forEach((p, i) => {
    const a = riverPts[Math.max(0, i - 1)], b = riverPts[Math.min(nR, i + 1)], L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    p.tx = (b.x - a.x) / L; p.tz = (b.z - a.z) / L; p.nx = p.tz; p.nz = -p.tx;
  });
  // заводь вокруг острова, сам остров, брод через остров (юг → остров → север)
  const [ix, iz] = SITES.island;
  const lagoon = ell(ix, iz, 44, 34, 0.25), island = ell(ix + 4, iz + 2, 21, 10, 0.3);
  const ford = { x: ix - 5, z0: -58, z1: 34, w: 9 };
  // обрыв-трамплин: кромка на южном берегу заводи, прыжок — через остров на северный берег
  const cliff = (() => {
    let fx = -0.62, fz = 0.78; const l = Math.hypot(fx, fz); fx /= l; fz /= l;
    let x = island.x, z = island.z;
    while (ellMetric(lagoon, x, z) < 1.02) { x -= fx; z -= fz; }
    return { x, z, fx, fz, h: wlAt(x) + 12.5, len: 140, half: 40 };
  })();

  /* ---------- холмы ---------- */
  // три главных холма по эскизу (деревня, амфитеатр, винодельня) и случайные бугры по всей суше
  const hills = [
    { x: SITES.piazza[0], z: SITES.piazza[1], sx: 105, sz: 95, rot: 0.4, h: 30 },
    { x: SITES.amphi[0], z: SITES.amphi[1], sx: 60, sz: 52, rot: 1.1, h: 36 },
    { x: SITES.winery[0] + 25, z: SITES.winery[1] + 10, sx: 90, sz: 70, rot: 0.2, h: 15 },
  ];
  const nearRiver = (x, z) => Math.min(...ctrl.map(([cx, cz]) => Math.hypot(x - cx, z - cz)));
  for (let t = 0; t < 600 && hills.length < 62; t++) {
    const x = (rng() * 2 - 1) * 470, z = -560 + rng() * 1240;
    const sx = 24 + 80 * rng(), sz = sx * (0.4 + 0.6 * rng()), rot = rng() * Math.PI, h = (6 + 26 * rng() ** 1.4) * (rng() < 0.14 ? -0.45 : 1);
    if (nearRiver(x, z) < 70 || z < coastZ(x) + 90) continue;
    hills.push({ x, z, sx, sz, rot, h });
  }
  const HL = new Float32Array(NX * NZ);
  for (const hl of hills) {
    const c = Math.cos(hl.rot), s = Math.sin(hl.rot), R = 3 * Math.max(hl.sx, hl.sz);
    const i0 = cellI(hl.x - R), i1 = cellI(hl.x + R), j0 = cellJ(hl.z - R), j1 = cellJ(hl.z + R);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const dx = gx(i) - hl.x, dz = gz(j) - hl.z, u = dx * c + dz * s, v = -dx * s + dz * c;
      HL[j * NX + i] += hl.h * Math.exp(-(u * u / (2 * hl.sx * hl.sx) + v * v / (2 * hl.sz * hl.sz)));
    }
  }

  /* ---------- расстояние до русла ---------- */
  const RR = 130, RD = new Float32Array(NX * NZ).fill(1e9), RI = new Int32Array(NX * NZ);
  for (const p of riverPts) {
    const i0 = cellI(p.x - RR), i1 = cellI(p.x + RR), j0 = cellJ(p.z - RR), j1 = cellJ(p.z + RR);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * NX + i, d = Math.hypot(gx(i) - p.x, gz(j) - p.z);
      if (d < RD[k]) { RD[k] = d; RI[k] = p.i; }
    }
  }

  /* ---------- сетка высот ---------- */
  const H = new Float32Array(NX * NZ);
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const x = gx(i), z = gz(j), k = j * NX + i, s = z - ZC[i];
    let h;
    if (s < 0) {
      // море: мелководье у пляжа, дальше дно уходит вниз; у причалов порта — сразу глубоко
      h = lerp(-0.45 - 4.6 * smooth01(-s / 42) + 0.35 * noise(x / 20, z / 20), -5, portMask(x));
    } else {
      // суша: пляж, к югу — подъём на прибрежные холмы, к северу — на холмы деревни; поверх — бугры и шум
      const land = smooth01((s - 30) / 90);
      const south = 24 * smooth01((s - 25) / 280), north = 14 + 26 * smooth01((z - 60) / 440);
      const trend = lerp(south, north, smooth01((z + 230) / 240));
      h = 1.25 * smooth01(s / 22) + land * RELIEF * (trend + HL[k] + 5.5 * noise(x / 120, z / 120) + 2.4 * noise(x / 42 + 5, z / 42 - 2))
        + 0.6 * noise(x / 12, z / 12) * smooth01(s / 10);
    }
    // предгорья у краёв карты — плавный подъём к хребту-фону (кроме ущелий, где река входит и уходит); у моря ниже
    const dE = Math.max(x - (HX - 75), -x - (HX - 75), z - (HZ - 120));
    if (dE > -110) {
      const gorge = smooth01((RD[k] - 30) / 60), shore = smooth01((s + 60) / 260), e = smooth01((dE + 110) / 185);
      h += (62 * e * e + 16 * noise(x / 45, z / 45) * e) * gorge * shore;
    }
    // русло реки: дно, низкие берега, пойма — и плавный переход к холмам
    const rd = RD[k];
    if (rd < RR) {
      const p = riverPts[RI[k]], wl = p.wl, hw = p.hw;
      const vh = rd < hw ? wl - 0.15 - 1.35 * (1 - (rd / hw) ** 2) : wl - 0.15 + 1.15 * smooth01((rd - hw) / 7);
      h = lerp(vh, Math.max(h, wl + 1), smooth01((rd - hw - 7) / 75));
    }
    // заводь и песчаный остров
    const wl = wlAt(x), el = ellMetric(lagoon, x, z);
    if (el < 1.15) h = lerp(h, Math.min(h, wl - 1.3), 1 - smooth01((el - 0.7) / 0.45));
    const ei = ellMetric(island, x, z);
    if (ei < 1.5) h = Math.max(h, wl + 1.45 - 2.75 * smooth01((ei - 0.5) / 0.95) + 0.25 * noise(x / 6, z / 6) * (1 - smooth01(ei)));
    // брод: мелкое каменистое дно поперёк заводи (машина не тонет, но теряет скорость)
    const fdx = Math.abs(x - ford.x);
    if (fdx < ford.w && z > ford.z0 - 10 && z < ford.z1 + 10) {
      const fh = wl - 0.24, m = smooth01((ford.w - fdx) / 4) * smooth01((z - ford.z0 + 10) / 10) * smooth01((ford.z1 + 10 - z) / 10);
      if (h < fh) h = lerp(h, fh, m);
    }
    // обрыв: высокий берег, который круто обрывается к заводи
    const cu = (x - cliff.x) * cliff.fx + (z - cliff.z) * cliff.fz, cv = (x - cliff.x) * cliff.fz - (z - cliff.z) * cliff.fx;
    if (cu <= 0 && cu > -cliff.len - 60 && Math.abs(cv) < cliff.half + 20) {
      const t = cliff.h + 0.02 * cu, m = smooth01((cliff.half - Math.abs(cv)) / 18) * smooth01((cu + cliff.len + 60) / 60);
      h += Math.max(0, (t - h) * m);
    }
    // ровная площадка порта; к югу от кромки причала — глубокая вода
    if (z >= QUAY) {
      const dx = Math.max(P.x0 - x, 0, x - P.x1), dz = Math.max(P.z0 - z, 0, z - P.z1), m = 1 - smooth01(Math.hypot(dx, dz) / 30);
      if (m > 0) h = lerp(h, 1.7, m);
    }
    H[k] = h;
  }

  // вершина холма деревни — пологое плато: дома и улочки не карабкаются по крутым склонам
  {
    const [px, pz] = SITES.piazza, VH = H[cellJ(pz) * NX + cellI(px)], R0 = 125, R1 = 230;
    for (let j = cellJ(pz - R1); j <= cellJ(pz + R1); j++) for (let i = cellI(px - R1); i <= cellI(px + R1); i++) {
      const x = gx(i), z = gz(j), d = Math.hypot(x - px, z - pz); if (d > R1) continue;
      const m = 1 - smooth01((d - R0) / (R1 - R0)), t = VH - 0.045 * d - 0.00012 * d * d + 1.6 * noise(x / 45, z / 45);
      H[j * NX + i] = lerp(H[j * NX + i], t, m * 0.92);
    }
  }
  const ground = (x, z) => {
    const fx = clamp((x + EX) / STEP, 0, NX - 1.0001), fz = clamp((z + EZ) / STEP, 0, NZ - 1.0001);
    const i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j, k = j * NX + i;
    const a = H[k], b = H[k + 1], c = H[k + NX], d = H[k + NX + 1];
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
  };
  // уровень воды в точке: река (с заводью) — свой уровень, юг карты — море (0), иначе воды нет
  const riverAt = (x, z) => {
    const k = cellJ(z) * NX + cellI(x);
    return RD[k] < riverPts[RI[k]].hw + 30 || ellMetric(lagoon, x, z) < 1.3;
  };
  const waterAt = (x, z) => riverAt(x, z) ? wlAt(x) : z < -380 ? 0 : -Infinity;

  Object.assign(C, { STEP, EX, EZ, NX, NZ, gx, gz, cellI, cellJ, H, ground, ZC, coastZ, QUAY, portMask, riverPts, RD, RI, RR,
    wlAt, riverAt, waterAt, lagoon, island, ford, cliff, hills, port: P });
}
