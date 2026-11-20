// Город — РАСКЛАДКА: инфраструктура.
// cityPlanInfra — U-образная эстакада (OV, настилы deckPlan, опоры), проезды-срезки под арками, кривые переулки,
//   бульвары, брусчатка Старого города, кольцевые развязки, триумфальная арка, статуи, корабль, пирс.
// cityPlanPort — портовые краны, «горбатые» мосты, разводной мост-трамплин, трамплины в парке.
// ВАЖНО: город детерминирован — зерно mulberry32 в cityPlanBase(), вызовы R() идут строго по порядку этапов.
//   Новый вызов R() или перестановка кода в середине раскладки меняет весь город после этого места.
//   Проверка: __game.fingerprint('city').dataHash до и после правки (js/selftest.js).
// Порядок этапов — в cityData() (js/maps/city/plan.js).
// Определяет: cityPlanInfra, cityPlanPort.
// Использует: lerp (js/core.js); shuffle (js/world.js); ovStuntCuts, ovSpans (js/maps/city/overpass.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

function cityPlanInfra(C) {
  const { rng, R, pick, BOUNDS, PARK, PC, PROM_Z, OLD, coastD, HALVES, nodes, roadSegs, blocks, ground, containers,
    solids, trees, medians, alleys, landmarks, mmShapes, keepOut, avoid, deckPlan, hits, PAL } = C;
  /* ---------- эстакада ---------- */
  // U-образная эстакада на опорах над улицами x = ±320 и z = 520 опоясывает Даунтаун.
  // Въезды — пандусы от набережной канала: улицы x = ±320 между z = 40 и 120 целиком стали пандусами.
  const OV = { H: 9, W: 16, R: 28, X: 320, Z: 520, Z0: 47, Z1: 113 };
  const ovRuns = [[-OV.X, OV.Z1, -OV.X, OV.Z - OV.R], [-OV.X + OV.R, OV.Z, OV.X - OV.R, OV.Z], [OV.X, OV.Z - OV.R, OV.X, OV.Z1]];
  const ovPillars = [], ovArcs = [];
  // трюки (js/maps/city/overpass.js): где ограждение вырезано под трамплины и съезды (cuts) и где нет настила (holes)
  const ST = ovStuntCuts(OV);
  const rail = (ax, az, bx, bz, y0, y1, ext) => {               // плита ограждения без вырезанных кусков
    for (const [t0, t1] of ovSpans(ax, az, bx, bz, ST.cuts)) deckPlan.push({ kind: 'slab', p0: [lerp(ax, bx, t0), lerp(y0, y1, t0) + 1.05, lerp(az, bz, t0)],
      p1: [lerp(ax, bx, t1), lerp(y0, y1, t1) + 1.05, lerp(az, bz, t1)], w: 0.4, t: 1.4, walk: false, mat: 'rail', ext });
  };
  const ovRails = (x0, z0, x1, z1, y0, y1, ext = 0) => {      // ограждения по обеим сторонам настила
    const L = Math.hypot(x1 - x0, z1 - z0), dx = (x1 - x0) / L, dz = (z1 - z0) / L, nx = dz, nz = -dx, o = OV.W / 2 + 0.2;
    for (const sd of [1, -1]) rail(x0 + nx * o * sd, z0 + nz * o * sd, x1 + nx * o * sd, z1 + nz * o * sd, y0, y1, ext);
  };
  for (const [x0, z0, x1, z1] of ovRuns) {
    const L = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(L / 40);
    for (let k = 0; k < n; k++) {
      const ax = lerp(x0, x1, k / n), az = lerp(z0, z1, k / n), bx = lerp(x0, x1, (k + 1) / n), bz = lerp(z0, z1, (k + 1) / n);
      for (const [t0, t1] of ovSpans(ax, az, bx, bz, ST.holes))
        deckPlan.push({ kind: 'slab', p0: [lerp(ax, bx, t0), OV.H, lerp(az, bz, t0)], p1: [lerp(ax, bx, t1), OV.H, lerp(az, bz, t1)], w: OV.W, t: 1.2, mat: 'ovdeck' });
      ovRails(ax, az, bx, bz, OV.H, OV.H, 0.1);
    }
    // опоры по оси улицы; перекрёстки под эстакадой остаются свободными
    const along = x0 === x1 ? 'z' : 'x', nodesOn = along === 'z' ? HALVES[0].zs : HALVES[0].xs;
    for (let t = 13; t < L - 5; t += 26) {
      const px = lerp(x0, x1, t / L), pz = lerp(z0, z1, t / L), a = along === 'z' ? pz : px;
      if (nodesOn.some(v => Math.abs(v - a) < 14)) continue;
      ovPillars.push({ x: px, z: pz, along });
    }
  }
  // повороты: дуги радиусом R из 8 плит (плиты удлинены, чтобы снаружи поворота не было щелей)
  for (const [cx, cz, a0, a1] of [[-OV.X + OV.R, OV.Z - OV.R, Math.PI, Math.PI / 2], [OV.X - OV.R, OV.Z - OV.R, Math.PI / 2, 0]]) {
    const P = (a, r = OV.R) => [cx + r * Math.cos(a), cz + r * Math.sin(a)], pts = [];
    for (let k = 0; k < 8; k++) {
      const ka = lerp(a0, a1, k / 8), kb = lerp(a0, a1, (k + 1) / 8), p = P(ka), q = P(kb);
      deckPlan.push({ kind: 'slab', p0: [p[0], OV.H, p[1]], p1: [q[0], OV.H, q[1]], w: OV.W, t: 1.2, mat: 'ovdeck', ext: 1.6 });
      for (const r of [OV.R + OV.W / 2 + 0.2, OV.R - OV.W / 2 - 0.2]) {
        const u = P(ka, r), v = P(kb, r);
        rail(u[0], u[1], v[0], v[1], OV.H, OV.H, 0.15);
      }
      pts.push(p);
    }
    pts.push(P(a1)); ovArcs.push(pts);
    const mid = P((a0 + a1) / 2); ovPillars.push({ x: mid[0], z: mid[1], along: 'd' });
    const xs = [cx, P(a0)[0], P(a1)[0]];
    avoid.push([Math.min(...xs) - OV.W / 2 - 2, Math.max(...xs) + OV.W / 2 + 2, cz - OV.W / 2 - 2, OV.Z + OV.W / 2 + 2]);
  }
  // пандусы-въезды (насыпь с ограждением) и полосатый щит на торце пандуса со стороны перекрёстка
  for (const x of [-OV.X, OV.X]) {
    deckPlan.push({ kind: 'wedge', p0: [x, 0.02, OV.Z0], p1: [x, OV.H, OV.Z1], w: OV.W, mat: 'ramp', base: -0.4 });
    ovRails(x, OV.Z0, x, OV.Z1, 0.02, OV.H);
    deckPlan.push({ kind: 'slab', p0: [x, OV.H - 1.25, OV.Z1 + 0.05], p1: [x, OV.H - 1.25, OV.Z1 + 0.4], w: OV.W, t: OV.H - 1.3, walk: false, mat: 'hazard' });
    keepOut.push([x - 11, x + 11, 34, 126]);
  }
  for (const sg of roadSegs) if (sg.dir === 'z' && Math.abs(sg.x0) === OV.X && sg.z0 === 40 && sg.z1 === 120) sg.ramp = true;
  for (const p of ovPillars) keepOut.push([p.x - 2, p.x + 2, p.z - 2, p.z + 2]);

  /* ---------- проезды-срезки с арками ---------- */
  {
    const cand = shuffle(blocks.filter(b => (b.type === 'downtown' || b.type === 'city') && !b.special && b.x1 - b.x0 > 55 && b.z1 - b.z0 > 55 && !hits([b.x0, b.x1, b.z0, b.z1], avoid)), rng);
    let nd = 0, nc = 0;
    for (const b of cand) if (b.type === 'downtown' ? nd++ < 5 : nc++ < 7) b.lane = { x0: b.cx - 5, x1: b.cx + 5, z0: b.z0, z1: b.z1 };
  }

  /* ---------- кривые переулки сквозь кварталы ---------- */
  // плавная кривая (Catmull-Rom) от одной улицы до противоположной, на уровне тротуара, мощёная брусчаткой
  {
    const cand = shuffle(blocks.filter(b => !b.lane && !b.special && (b.type === 'oldtown' || b.type === 'city') && b.z1 - b.z0 > 55 && b.x1 - b.x0 > 55), rng);
    let no = 0, nc = 0;
    for (const b of cand) {
      if (b.type === 'oldtown' ? no++ >= 8 : nc++ >= 6) continue;
      const alongZ = R() < 0.5, [a0, a1, c0, c1] = alongZ ? [b.z0, b.z1, b.x0, b.x1] : [b.x0, b.x1, b.z0, b.z1];
      const L = a1 - a0, mid = (c0 + c1) / 2, cw = c1 - c0, s0 = mid + (R() - 0.5) * cw * 0.35, s1 = mid + (R() - 0.5) * cw * 0.35;
      const ctrl = [[s0, a0], [s0, a0 + 8], [mid + (R() - 0.5) * cw * 0.45, a0 + L * 0.36], [mid + (R() - 0.5) * cw * 0.45, a0 + L * 0.64], [s1, a1 - 8], [s1, a1]];
      const curve = new THREE.CatmullRomCurve3(ctrl.map(([c, a]) => alongZ ? new THREE.Vector3(c, 0, a) : new THREE.Vector3(a, 0, c)));
      b.alley = { w: 5.5, pts: curve.getPoints(40).map(v => [v.x, v.z]) };
      alleys.push(b.alley);
      for (const [px, pz] of [b.alley.pts[0], b.alley.pts[b.alley.pts.length - 1]]) keepOut.push([px - 5, px + 5, pz - 5, pz + 5]);
    }
  }

  /* ---------- бульвары с аллеей посередине ---------- */
  for (const sg of roadSegs) {
    if (!((sg.dir === 'x' && sg.z0 === 280) || (sg.dir === 'z' && sg.x0 === 0 && sg.z0 >= 120))) continue;
    const along = sg.dir === 'z', c = along ? sg.x0 : sg.z0;
    const a0 = (along ? sg.z0 : sg.x0) + (along ? sg.a.wz : sg.a.wx) / 2 + 3, a1 = (along ? sg.z1 : sg.x1) - (along ? sg.b.wz : sg.b.wx) / 2 - 3;
    if (a1 - a0 < 10) continue;
    medians.push({ x: along ? c : (a0 + a1) / 2, z: along ? (a0 + a1) / 2 : c, w: along ? 2.4 : a1 - a0, d: along ? a1 - a0 : 2.4 });
    for (let a = a0 + 6; a < a1 - 4; a += 14) trees.push([along ? c : a, along ? a : c, 0.7 + R() * 0.15, 0.36]);
  }
  // старый город: брусчатка на улицах
  for (const sg of roadSegs) if ((sg.x0 + sg.x1) / 2 > OLD.x0 && (sg.z0 + sg.z1) / 2 > OLD.z0) sg.cobble = true;
  for (const n of nodes.values()) if (n.x > OLD.x0 && n.z > OLD.z0) n.cobble = true;

  /* ---------- уникальные объекты вне кварталов ---------- */
  // кольцевые развязки с монументами
  landmarks.push({ kind: 'roundabout', x: 0, z: 280, r: 4.5, mon: 'globe' }, { kind: 'roundabout', x: 0, z: -620, r: 4, mon: 'obelisk' });
  mmShapes.push(['c', 0, 280, 4.5], ['c', 0, -620, 4]);
  // триумфальная арка над северной дорожкой парка
  { const gz = PARK.z1 - 25, gy = ground(0, gz);
    landmarks.push({ kind: 'gate', x: 0, z: gz, y: gy });
    keepOut.push([-14, 14, gz - 8, gz + 8]); mmShapes.push(['r', -8.25, gz, 4.5, 5.6], ['r', 8.25, gz, 4.5, 5.6]); }
  // статуи вокруг фонтана в парке
  ['raise', 'point', 'stand', 'point'].forEach((pose, k) => {
    const a = Math.PI / 4 + k * Math.PI / 2, x = PC[0] + Math.cos(a) * 17, z = PC[1] + Math.sin(a) * 17;
    landmarks.push({ kind: 'figure', x, z, ry: Math.atan2(PC[0] - x, PC[1] - z) + Math.PI, s: 1.5, pose });
  });
  // грузовое судно у причала гавани: корпус — коллизия, контейнеры на палубе
  { const sx = -850, sz = 200;
    landmarks.push({ kind: 'ship', x: sx, z: sz });
    solids.push({ minX: sx - 77, maxX: sx + 55, minZ: sz - 11, maxZ: sz + 11, h: 12.5 });
    for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) {
      const n = 1 + Math.floor(R() * 3);
      for (let k = 0; k < n; k++) containers.push({ x: sx - 44 + i * 13.4, y: 6.15 + k * 2.6, z: sz - 3.75 + j * 2.5, color: pick(PAL.cont) });
    } }
  // пирс с колесом обозрения у курортной набережной
  { const px = 300, z0 = PROM_Z - 11 - 8, zr = z0 - 12, Hd = 2.4;
    let zc = z0 - 60; for (let z = z0; z > -1100; z -= 1) if (coastD(px, z) < 0) { zc = z; break; }
    const zEnd = Math.max(zc - 70, -BOUNDS + 45);              // площадка не должна заходить за край карты
    deckPlan.push({ kind: 'wedge', p0: [px, ground(px, z0) + 0.03, z0], p1: [px, Hd, zr], w: 12, mat: 'pier', base: -0.6 });
    deckPlan.push({ kind: 'slab', p0: [px, Hd, zr], p1: [px, Hd, zEnd + 15], w: 12, t: 0.6, mat: 'pier' });
    deckPlan.push({ kind: 'slab', p0: [px, Hd, zEnd + 15], p1: [px, Hd, zEnd - 25], w: 44, t: 0.6, mat: 'pier' });
    const rail = (x0, z0_, x1, z1_, y0 = Hd, y1 = Hd) => deckPlan.push({ kind: 'slab', p0: [x0, y0 + 1.0, z0_], p1: [x1, y1 + 1.0, z1_], w: 0.3, t: 1.2, walk: false, mat: 'rail' });
    for (const sd of [-1, 1]) {
      rail(px + sd * 6.1, zr, px + sd * 6.1, zEnd + 15);
      rail(px + sd * 6.1, z0, px + sd * 6.1, zr, ground(px, z0), Hd);
      rail(px + sd * 22.1, zEnd + 15, px + sd * 22.1, zEnd - 25);
      rail(px + sd * 6.1, zEnd + 15.1, px + sd * 22.1, zEnd + 15.1);
    }
    rail(px - 22.1, zEnd - 25.1, px + 22.1, zEnd - 25.1);
    landmarks.push({ kind: 'pier', x: px, zr, zEnd, zw: zEnd - 5, y: Hd });
    keepOut.push([px - 24, px + 24, zEnd - 30, z0 + 8]);
    mmShapes.push(['w', px, (z0 + zEnd - 25) / 2, 12, z0 - zEnd + 25], ['w', px, zEnd - 5, 44, 40]); }
  Object.assign(C, { OV, ovRuns, ovPillars, ovArcs });
}

function cityPlanPort(C) {
  const { PC, BRIDGES, DRAW_X, coastD, ground, plain, solids, keepOut, deckPlan, segs } = C;
  /* ---------- порт: краны у воды ---------- */
  const cranes = [];
  // za — нога у воды, zb — дальняя нога, zBack…zTip — стрела (над водой со стороны zTip)
  const CRANES = [
    ...[-860, -790, -720, -650, -580, -510].map(x => [x, 30.9, 49.6, 60, -24]),
    ...[-860, -790, -720, -680].map(x => [x, 147.5, 131, 124, 192]),
    ...[-860, -790, -720, -680].map(x => [x, 252.5, 269, 276, 208]),
  ];
  CRANES.forEach(([cx, za, zb, zBack, zTip], k) => {
    if (coastD(cx - 8, zb) < 12 || coastD(cx - 8, za) < 8) return;
    const H = 28, color = k % 3 === 1 ? 0x2f6fb0 : 0xc8452e, zm = (za + zb) / 2, L = Math.abs(zb - za);
    const P = (x, y, z, w, h, d, c = color) => plain.push({ x, y, z, w, h, d, color: c });
    for (const lx of [cx - 7, cx + 7]) {
      for (const lz of [za, zb]) { P(lx, 0, lz, 1.2, H, 1.2); solids.push({ minX: lx - 0.7, maxX: lx + 0.7, minZ: lz - 0.7, maxZ: lz + 0.7, h: H }); }
      P(lx, H - 1.6, zm, 1.2, 1.6, L + 1.2);
      P(lx, H, zb, 0.8, 10, 0.8);
    }
    for (const lz of [za, zb]) P(cx, H - 1.6, lz, 15.2, 1.6, 1.2);
    P(cx, H + 9, zb, 15, 0.8, 0.8);
    P(cx, H + 0.2, (zBack + zTip) / 2, 2.6, 2.0, Math.abs(zTip - zBack));
    P(cx, H + 2.2, zb + Math.sign(zb - za) * 3, 7, 4.5, 8, 0xe8e8e4);
    P(cx + 2.2, H - 3.2, za - Math.sign(zb - za) * 4, 2.2, 2.6, 2.6, 0x30343a);
    cranes.push([cx, zm]);
    keepOut.push([cx - 12, cx + 12, Math.min(za, zb) - 3, Math.max(za, zb) + 3]);
  });

  /* ---------- мосты (настилы) ---------- */
  // точки задаются как [x, y, z] верхней грани по оси дороги; ширина настила — ширина улицы моста + 2 м
  for (const bx of BRIDGES) {
    if (bx === DRAW_X) continue;
    const DW = segs.find(s => s.kind === 'bridge' && s.x0 === bx).w + 2, RX = DW / 2 + 0.3;
    // плавный «горб»: на гребне на скорости больше ~95 км/ч машина отрывается от земли
    const Y = z => 0.03 + 4.2 * (1 + Math.cos(Math.PI * z / 33)) / 2;
    for (let z = 33; z > -33; z -= 3) {
      const z2 = z - 3;
      deckPlan.push({ kind: 'slab', p0: [bx, Y(z), z], p1: [bx, Y(z2), z2], w: DW, t: 1.2, mat: 'deck' });
      for (const s of [1, -1]) deckPlan.push({ kind: 'slab', p0: [bx + s * RX, Y(z) + 1.05, z], p1: [bx + s * RX, Y(z2) + 1.05, z2], w: 0.4, t: 1.4, walk: false, mat: 'rail' });
    }
    for (const z of [-17, 17]) plain.push({ x: bx, y: -7, z, w: DW - 4, h: 7 + 4.2 * (1 + Math.cos(Math.PI * z / 33)) / 2 - 1.1, d: 3, color: 0x9b9a94 });
    keepOut.push([bx - DW / 2 - 3, bx + DW / 2 + 3, -48, 48]);
  }
  // разводной мост: обе половины подняты — трамплин через канал (разрыв 24 м, нужно ~95 км/ч)
  for (const s of [1, -1]) {
    const pts = [[33, 0.03], [28, 0.7], [13, 6.23], [12, 6.6]];
    const mats = ['steel', 'steel', 'hazard'];
    for (let k = 0; k < 3; k++) {
      const [za, ya] = pts[k], [zb, yb] = pts[k + 1];
      deckPlan.push({ kind: 'slab', p0: [DRAW_X, ya, s * za], p1: [DRAW_X, yb, s * zb], w: 22, t: 1.0, mat: mats[k] });
      if (k < 2) for (const q of [1, -1]) deckPlan.push({ kind: 'slab', p0: [DRAW_X + q * 11.3, ya + 1.05, s * za], p1: [DRAW_X + q * 11.3, yb + 1.05, s * zb], w: 0.4, t: 1.4, walk: false, mat: 'rail' });
    }
    // башни механизма подъёма по бокам
    for (const q of [1, -1]) deckPlan.push({ kind: 'slab', p0: [DRAW_X + q * 14, 12, s * 32.4], p1: [DRAW_X + q * 14, 12, s * 22], w: 4, t: 19, walk: false, mat: 'tower' });
  }
  keepOut.push([DRAW_X - 18, DRAW_X + 18, -48, 48]);

  /* ---------- трамплины в парке ---------- */
  const RAMPS = [[-108, -320, -1, 0, 2.2], [108, -320, 1, 0, 2.2], [0, -250, 0, 1, 2.6], [0, -392, 0, -1, 2.6], [-60, -196, 0, 1, 1.8], [60, -444, 0, -1, 1.8]];
  for (const [x, z, dx, dz, H] of RAMPS) {
    const L = 11, x1 = x + dx * L, z1 = z + dz * L;
    deckPlan.push({ kind: 'wedge', p0: [x, ground(x, z) + 0.02, z], p1: [x1, ground(x1, z1) + H, z1], w: 7, mat: 'wedge', base: Math.min(ground(x, z), ground(x1, z1)) - 0.4 });
    keepOut.push([Math.min(x, x1) - 5, Math.max(x, x1) + 5, Math.min(z, z1) - 5, Math.max(z, z1) + 5]);
  }
  keepOut.push([PC[0] - 27, PC[0] + 27, PC[1] - 27, PC[1] + 27]);
  Object.assign(C, { cranes });
}
