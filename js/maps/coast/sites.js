// Побережье — РАСКЛАДКА: места (до дорог). Ровные площадки, которые вдавливаются в рельеф вместе с дорогами
// (пьяцца, двор церкви, двор винодельни, вершина с амфитеатром, мыс маяка); кривые улочки из брусчатки от пьяццы
// к кольцевой дороге с переулками и тупиком; расстановка порта (пирс, причал, лодки, краны, контейнеры, склад,
// ящики), маяка, винодельни (корпуса, бочки) и руин амфитеатра (ярусы с проходами, колонны); пять зон захвата.
// Определяет: coastPlanSites.
// Использует: lerp (js/core.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

function coastPlanSites(C) {
  const { rng, ground, SITES, port, QUAY } = C;
  const R = (a, b) => a + (b - a) * rng();
  const [px, pz] = SITES.piazza, [wx, wz] = SITES.winery, [ax, az] = SITES.amphi;
  /* ---------- ровные площадки ---------- */
  const pad = (id, x, z, r, kind, h = ground(x, z)) => ({ id, x, z, r, kind, h });
  const piazza = pad('piazza', px, pz, 17, 'cobble');
  const church = { x: px - 6, z: pz + 40, rot: 0.06, w: 12, d: 25 };   // фасадом на юг, к пьяцце
  const pads = [piazza, pad('church', church.x, church.z, 19, 'cobble', piazza.h + 0.3), pad('winery', wx, wz, 24, 'gravel'),
    pad('amphi', ax, az, 36, 'dirt'), pad('lighthouse', SITES.lighthouse[0] - 3, SITES.lighthouse[1] + 6, 10, 'dirt')];

  /* ---------- улочки деревни ---------- */
  // от края пьяццы к точкам кольцевой дороги; середина каждой улочки смещена в сторону — улицы кривые
  const RING = { W: [137, 436], NW: [115, 517], NE: [-43, 543], E: [-82, 473], SE: [-33, 346], S: [40, 316] };
  const street = (id, to, w, wob = 8) => {
    const [tx, tz] = to, dx = tx - px, dz = tz - pz, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, nx = uz, nz = -ux;
    const pts = [[px + ux * 12, pz + uz * 12]];
    for (const f of [0.3, 0.55, 0.78]) { const o = R(-wob, wob); pts.push([px + dx * f + nx * o, pz + dz * f + nz * o]); }
    pts.push(to);
    return { id, kind: 'cobble', w, pts };
  };
  const streets = [street('stW', RING.W, 5.2), street('stNW', RING.NW, 4.6), street('stNE', RING.NE, 4.6, 6), street('stE', RING.E, 5),
    street('stSE', RING.SE, 4.4), street('stS', RING.S, 4.2)];
  // переулки между улочками (на 55–65 % пути) и тупик
  const mid = (s, f) => { const i = Math.min(s.pts.length - 2, Math.floor(f * (s.pts.length - 1))), t = f * (s.pts.length - 1) - i, a = s.pts[i], b = s.pts[i + 1]; return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)]; };
  const lane = (id, a, b, w = 3.6) => { const m = [(a[0] + b[0]) / 2 + R(-6, 6), (a[1] + b[1]) / 2 + R(-6, 6)]; return { id, kind: 'cobble', w, pts: [a, m, b] }; };
  const S = Object.fromEntries(streets.map(s => [s.id, s]));
  const lanes = [lane('lnW', mid(S.stW, 0.6), mid(S.stNW, 0.55)), lane('lnE', mid(S.stE, 0.62), mid(S.stSE, 0.6)), lane('lnS', mid(S.stSE, 0.45), mid(S.stS, 0.5), 3.4)];
  const e0 = mid(S.stE, 0.4);
  lanes.push({ id: 'deadEnd', kind: 'cobble', w: 3.4, pts: [e0, [e0[0] + R(-4, 4), e0[1] + 22], [e0[0] + R(-8, 8), e0[1] + 42]] });

  /* ---------- порт ---------- */
  const yardH = 1.7, pier = { x: SITES.pierX, z0: QUAY + 1, z1: -714, w: 12, h: yardH };
  const jetty = { x: -62, z0: QUAY + 1, z1: -662, w: 4, h: 1.25 };
  const boats = [[-56.5, -641, 0.1], [-56.5, -654, -0.06], [-67.5, -648, 0.04], [-123, -652, 0], [-139, -672, 0.05], [-123.5, -694, -0.03], [-210, -640, 1.2]]
    .map(([x, z, rot], i) => ({ x, z, rot, len: R(6.5, 9), color: [0xd8d2c4, 0x2f6fa8, 0xb8452f, 0xe0b44c, 0x3f8a5a][i % 5], ph: R(0, 6) }));
  const cranes = [{ x: -222, z: QUAY + 6, rot: Math.PI }, { x: -252, z: QUAY + 6, rot: Math.PI - 0.25 }];
  const containers = [];
  const CC = [0xb5523b, 0x2f6fa8, 0xc79a3a, 0x3f8a5a, 0x8a3a2f, 0x6a6f78, 0xd0c8b8];
  for (const [bx, bz] of [[-180, -606], [-206, -590], [-236, -604], [-182, -574]]) for (let row = 0; row < 2; row++) for (let col = 0; col < 3; col++) {
    const n = Math.floor(R(0, 3.4));
    for (let k = 0; k < n; k++) containers.push({ x: bx - col * 12.6, z: bz + row * 2.6, y: yardH + k * 2.6, color: CC[Math.floor(rng() * CC.length)] });
  }
  const warehouse = { x: -78, z: -582, w: 34, d: 17, h: 9, rot: 0.02 };
  const crates = [];
  for (const [cx, cz, n] of [[-113, -616, 6], [-150, -612, 5], [-96, -600, 4], [-160, -590, 4]])
    for (let k = 0; k < n; k++) crates.push({ x: cx + R(-4, 4), z: cz + R(-3, 3), rot: R(0, 1.5), s: R(0.85, 1.25), stack: rng() < 0.3 });
  const lighthouse = { x: SITES.lighthouse[0], z: SITES.lighthouse[1], h: 22 };

  /* ---------- винодельня ---------- */
  // двор на дороге: корпуса по бокам (запад/восток), амбар за двором; бочки вдоль стен
  const winery = { x: wx, z: wz, blds: [{ x: wx + 19, z: wz - 2, w: 26, d: 10, rot: Math.PI / 2 + 0.03, h: 5.2 }, { x: wx - 18, z: wz + 3, w: 22, d: 9, rot: Math.PI / 2 - 0.05, h: 4.4 },
    { x: wx + 15, z: wz + 24, w: 16, d: 10, rot: 0.12, h: 6.5 }] };
  // бочки: ряды вдоль корпусов и кучки посреди двора — их можно растолкать
  const barrels = [];
  for (let k = 0; k < 16; k++) {
    const side = k < 9 ? 1 : -1, t = (k % 9) / 8;
    barrels.push({ x: wx + side * (side > 0 ? 12.5 : 11.8) + R(-0.5, 0.5), z: wz - 11 + t * 22 + R(-0.4, 0.4) });
  }
  for (const [cx, cz] of [[wx + 6, wz - 6], [wx - 5, wz + 8]]) for (let k = 0; k < 5; k++) barrels.push({ x: cx + Math.cos(k * 1.3) * 1.1 * (k ? 1 : 0), z: cz + Math.sin(k * 1.3) * 1.1 * (k ? 1 : 0) });

  /* ---------- амфитеатр ---------- */
  // ярусы-ступени по дуге вокруг арены, проходы там, где подходят дороги и тропа; часть ярусов разрушена
  const amphi = { x: ax, z: az, floor: 15, tiers: [], cols: [] };
  // углы проходов (x = cos a, z = sin a): восточная дорога с севера и с юга, связка с запада, тропа к акведуку
  const gaps = [1.98, -2.05, 0.33, -1.07];
  for (let t = 0; t < 5; t++) {
    const r = 17 + t * 2.6;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 15) {
      const ac = a + Math.PI / 30;
      if (gaps.some(g => Math.abs(((ac - g + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.24)) continue;
      if (rng() < 0.12 + t * 0.05) continue;                              // обрушенные куски, наверху — чаще
      amphi.tiers.push({ x: ax + Math.cos(ac) * r, z: az + Math.sin(ac) * r, w: 2.5, d: 2 * Math.PI * r / 30 + 0.3, rot: -ac, h: 0.55 * (t + 1) + R(-0.15, 0.1) });
    }
  }
  for (let k = 0; k < 9; k++) {
    const a = k * 0.75 + R(-0.2, 0.2), r = 32.5;
    if (gaps.some(g => Math.abs(((a - g + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.3)) continue;
    amphi.cols.push({ x: ax + Math.cos(a) * r, z: az + Math.sin(a) * r, h: rng() < 0.5 ? R(1.2, 3) : R(4.5, 6.5) });
  }

  /* ---------- зоны захвата (для будущего режима «Захват точек») ---------- */
  const zones = [
    { id: 1, name: 'Пьяцца', x: px, z: pz, r: 16 },
    { id: 2, name: 'Край пирса', x: pier.x, z: pier.z1 + 9, r: 8 },
    { id: 3, name: 'Амфитеатр', x: ax, z: az, r: 15 },
    { id: 4, name: 'Двор винодельни', x: wx, z: wz, r: 14 },
    { id: 5, name: 'Остров', x: C.island.x, z: C.island.z, r: 16 },
  ];
  Object.assign(C, { pads, church, extraRoads: [...streets, ...lanes], pier, jetty, boats, cranes, containers, warehouse, crates, lighthouse,
    winery, barrels, amphi, zones });
}
