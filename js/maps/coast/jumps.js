// Побережье — места для длинных прыжков (js/jumps.js): раскладка coastPlanJumps (после природы, перед мини-картой)
// и постройка coastBuildJumps (из coastBuildCrossings, до decks.build).
//   Обрушенный мост — старый каменный мост рядом с акведуком, средний пролёт рухнул: с одного берега устой-трамплин,
//   на другом — уцелевшая половина свода как посадочный спуск, в реке — обломок опоры.
//   Сходни на тюках сена — доски, положенные на штабель тюков на краю поля; разгон с дороги, посадка на ровное поле.
// Этап не вызывает rng(): остальная карта от него не меняется. Места подобраны перебором (ровный берег, нет
// деревьев и домов на разбеге и посадке); кусты и тюки на этих полосах убираются.
// Определяет: COAST_JUMPS, coastPlanJumps, coastBuildJumps.
// Использует: stdMat, noiseTexture, inst, setInst (js/world.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const COAST_JUMPS = {
  // обрушенный мост: точка реки riverPts[i], s — с какого берега разбег (±1 по нормали к реке)
  ruin: { i: 272, s: 1, ramp: 10, lip: 2.8, rise: 2.0, land: 12, landH: 2.2, w: 7 },
  // скирды: кромка (x, z), h — направление прыжка (как Car.h: вперёд = (sin h, cos h)); L — разгон, H — высота
  hay: [{ x: 197, z: -334, h: 1.963 }, { x: -295, z: 62, h: 1.963 }],
  hayRamp: { L: 9, H: 1.6, w: 4.6 },
};

function coastPlanJumps(C) {
  const { riverPts, ground, bushes, bales } = C;
  const R = COAST_JUMPS.ruin, p = riverPts[R.i], a = riverPts[R.i - 8], b = riverPts[R.i + 8];
  const L = Math.hypot(b.x - a.x, b.z - a.z), nx = -(b.z - a.z) / L * R.s, nz = (b.x - a.x) / L * R.s;
  const at = k => [p.x + nx * k, p.z + nz * k];          // k > 0 — берег разбега, k < 0 — берег посадки
  const lipK = p.hw + 1.5, farK = -(p.hw + 2);
  const [sx, sz] = at(lipK + R.ramp), [lx, lz] = at(lipK), [fx, fz] = at(farK), [ex, ez] = at(farK - R.land);
  const gs = ground(sx, sz), gl = ground(...at(p.hw + 3)), gf = ground(...at(-(p.hw + 3))), ge = ground(ex, ez);
  const top = Math.max(gl + R.lip, gs + R.rise), ftop = gf + R.landH;
  const jumps = {
    ruin: {
      ramp: { p0: [sx, gs + 0.02, sz], p1: [lx, top, lz], base: Math.min(p.wl, gl) - 1.2 },
      land: { p0: [fx, ftop, fz], p1: [ex, ge + 0.02, ez], base: Math.min(p.wl, ge) - 1.2 },
      pier: { x: p.x, z: p.z, y0: p.wl - 1.5, y1: p.wl + 1.1, dx: nx, dz: nz },
      w: R.w,
    },
    hay: COAST_JUMPS.hay.map(h => {
      const dx = Math.sin(h.h), dz = Math.cos(h.h), H = COAST_JUMPS.hayRamp;
      const x0 = h.x - dx * H.L, z0 = h.z - dz * H.L;
      const g0 = ground(x0, z0), g1 = ground(h.x, h.z);
      return { p0: [x0, g0 + 0.02, z0], p1: [h.x, g1 + H.H, h.z], base: Math.min(g0, g1) - 0.4, w: H.w, dx, dz };
    }),
  };
  // полосы разбега и посадки: [x, z, dx, dz, от, до] — кусты и тюки на них убираются
  const strips = [[p.x, p.z, nx, nz, farK - 60, lipK + 70], ...jumps.hay.map(j => [j.p1[0], j.p1[2], j.dx, j.dz, -70, 70])];
  const onStrip = o => strips.some(([x, z, dx, dz, k0, k1]) => {
    const rx = o.x - x, rz = o.z - z, k = rx * dx + rz * dz;
    return k > k0 && k < k1 && Math.abs(rx * dz - rz * dx) < 6;
  });
  for (const arr of [bushes, bales]) for (let i = arr.length - 1; i >= 0; i--) if (onStrip(arr[i])) arr.splice(i, 1);
  Object.assign(C, { jumps });
}

function coastBuildJumps(K, mats) {
  const { D, decks } = K, J = D.C.jumps;
  mats.hay = stdMat(0xffffff, { map: noiseTexture(256, '#cfae5c', 0.35, 4100), roughness: 1 });
  const r = J.ruin;
  decks.wedge(r.ramp.p0, r.ramp.p1, r.w, r.ramp.base, { mat: 'stone' });
  decks.wedge(r.land.p0, r.land.p1, r.w, r.land.base, { mat: 'stone' });
  // парапеты по краям уцелевших половин: верх на 0,7 м выше настила
  for (const s of [r.ramp, r.land]) {
    const dx = s.p1[0] - s.p0[0], dz = s.p1[2] - s.p0[2], L = Math.hypot(dx, dz), ox = dz / L * (r.w / 2 - 0.25), oz = -dx / L * (r.w / 2 - 0.25);
    for (const q of [1, -1])
      decks.slab([s.p0[0] + ox * q, s.p0[1] + 0.7, s.p0[2] + oz * q], [s.p1[0] + ox * q, s.p1[1] + 0.7, s.p1[2] + oz * q], 0.5, 1.3, { mat: 'rock', walk: false });
  }
  // обломок средней опоры в реке и рухнувшие блоки кладки у её подножия
  const pr = r.pier, ax = pr.dz, az = -pr.dx;                // ax, az — вдоль течения
  decks.slab([pr.x - pr.dx * 1.5, pr.y1, pr.z - pr.dz * 1.5], [pr.x + pr.dx * 1.5, pr.y1, pr.z + pr.dz * 1.5], r.w - 1, pr.y1 - pr.y0, { mat: 'rock', walk: false });
  for (const [k, l, y, tilt] of [[4.5, 1.5, 0.3, 0.5], [-5, -2, 0.1, -0.7], [8, -1, -0.2, 0.3]]) {
    const x = pr.x + pr.dx * k + ax * l, z = pr.z + pr.dz * k + az * l, yy = pr.y0 + 1.4 + y;
    decks.slab([x - ax * 1.2, yy - tilt, z - az * 1.2], [x + ax * 1.2, yy + tilt, z + az * 1.2], 1.8, 1.2, { mat: 'rock', walk: false });
  }
  // сходни на тюках: по скрытому клину ездят, видны доски настила и штабель тюков под верхним краем
  const { group } = K, ground = D.C.ground, bales = [];
  for (const h of J.hay) {
    decks.wedge(h.p0, h.p1, h.w, h.base, { hidden: true });
    const [x0, y0, z0] = h.p0, [x1, y1, z1] = h.p1, Lh = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(h.dx, h.dz);
    const board = new THREE.Mesh(new THREE.BoxGeometry(h.w, 0.14, Math.hypot(Lh, y1 - y0)), mats.wood);
    board.position.set((x0 + x1) / 2, (y0 + y1) / 2 - 0.07, (z0 + z1) / 2);
    board.rotation.set(-Math.atan2(y1 - y0, Lh), yaw, 0, 'YXZ');
    board.castShadow = board.receiveShadow = true; group.add(board);
    // два яруса тюков 2,4 × 0,8 × 1,15 м: нижний — под последними 4,8 м, верхний — под последними 2,4 м
    for (const [s0, n, lvl] of [[Lh - 4.8, 2, 0], [Lh - 2.4, 1, 1]]) for (let i = 0; i < n; i++) for (let j = 0; j < 4; j++) {
      const s = s0 + 1.2 + i * 2.4, l = (j - 1.5) * 1.15, x = x0 + h.dx * s + h.dz * l, z = z0 + h.dz * s - h.dx * l;
      bales.push([x, Math.min(ground(x, z), y1 - 1.6) + 0.4 + lvl * 0.8, z, yaw]);
    }
  }
  const m = inst(new THREE.BoxGeometry(2.35, 0.78, 1.1), mats.hay, bales.length);
  bales.forEach(([x, y, z, ry], i) => setInst(m, i, x, y, z, 1, 1, 1, ry));
  m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); group.add(m);
}
