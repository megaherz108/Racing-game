// Карта: город на острове (≈ 2 × 2 км)
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.
//
// Остров разрезан каналом (z ≈ 0) на две половины:
//   север — Деловая часть: Даунтаун в центре, Порт и промзона на западе (гавань, краны, контейнеры), жилые кварталы;
//   юг — Курортная часть: Городской парк с холмами и трамплинами, набережная с отелями и пляжем, пригород.
// На северо-востоке — Старый город: брусчатка, ряды узких домов, кривые переулки, рыночная площадь.
// Уникальные объекты (телебашня, стадион, ратуша, пирс с колесом обозрения…) строит js/maps/city-landmarks.js.
// Через канал — 3 моста: два «горбатых» автомобильных (x = ±400) и разводной мост-трамплин посередине (x = 0).
// Генерация детерминирована (фиксированное зерно), поэтому город одинаковый при каждом запуске.

/* =====================================================================
   КАРТА 1: ГОРОД НА ОСТРОВЕ — РАСКЛАДКА
   ===================================================================== */
function cityData() {
  const rng = mulberry32(20261112), R = () => rng();
  const pick = arr => arr[Math.floor(R() * arr.length)];
  const WATER = -0.45, BOUNDS = 1000, BW = 30, CURB = 0.15;
  const CANAL = 30;                                           // полуширина канала
  const BASIN = { x0: -1100, x1: -640, z0: 150, z1: 250 };    // портовая гавань (открыта в море на западе)
  const PARK = { x0: -280, x1: 280, z0: -500, z1: -140 };
  const PC = [0, -320];                                       // центр парка (фонтан)
  const PROM_Z = -760;                                        // набережная вдоль пляжа
  const BRIDGES = [-400, 0, 400], DRAW_X = 0;
  const OLD = { x0: 400, z0: 520 };                           // Старый город: северо-восток острова
  // объединённые кварталы (внутренние улицы убраны): под стадион
  const MERGED = [{ x0: 600, x1: 700, z0: 360, z1: 520 }];

  // берег: «скруглённый квадрат» с неровностями; >0 — суша (метры до берега)
  const coastR = th => 920 + 30 * Math.sin(3 * th + 0.5) + 18 * Math.sin(7 * th + 1.3) + 8 * Math.sin(13 * th + 2.1);
  const coastD = (x, z) => coastR(Math.atan2(z, x)) - Math.pow(x ** 4 + z ** 4, 0.25);
  // расстояние до кромки канала или гавани (>0 — суша)
  const quayD = (x, z) => {
    const bx = Math.max(BASIN.x0 - x, x - BASIN.x1), bz = Math.max(BASIN.z0 - z, z - BASIN.z1);
    const bd = bx > 0 && bz > 0 ? Math.hypot(bx, bz) : Math.max(bx, bz);
    return Math.min(Math.abs(z) - CANAL, bd);
  };
  const district = (x, z) => {
    if (z > 0) {
      if (x < -440) return 'port';
      if (x > OLD.x0 && z > OLD.z0) return 'oldtown';
      if (Math.abs(x) <= 330 && z < 540) return 'downtown';
      return 'city';
    }
    if (x > PARK.x0 && x < PARK.x1 && z > PARK.z0 && z < PARK.z1) return 'park';
    if (z < -600) return 'resort';
    return 'suburb';
  };

  /* ---------- дорожная сеть: у каждой половины своя сетка, связаны мостами ---------- */
  const HALVES = [
    { id: 'N', xs: [-820, -720, -560, -480, -400, -320, -240, -160, -80, 0, 80, 160, 240, 320, 400, 500, 600, 700, 820],
      zs: [40, 120, 200, 280, 360, 440, 520, 620, 720, 820], wide: { x: [0, -400, 400], z: [280] } },
    { id: 'S', xs: [-820, -700, -560, -400, -280, -140, 0, 140, 280, 400, 560, 700, 820],
      zs: [-760, -620, -500, -380, -260, -140, -40], wide: { x: [0, -400, 400], z: [] } },
  ];
  const widthX = (H, x) => H.wide.x.includes(x) ? 20 : 14;
  const widthZ = (H, z) => z === PROM_Z ? 22 : H.wide.z.includes(z) ? 20 : 14;
  const okPoint = (x, z) => coastD(x, z) > 24 && quayD(x, z) > 5;
  const inPark = (x, z) => x > PARK.x0 + 1 && x < PARK.x1 - 1 && z > PARK.z0 + 1 && z < PARK.z1 - 1;
  const inMerged = (x, z) => MERGED.find(m => x > m.x0 + 1 && x < m.x1 - 1 && z > m.z0 + 1 && z < m.z1 - 1);
  const nodes = new Map(), segs = [];
  const node = (H, x, z) => {
    const k = x + ',' + z; let n = nodes.get(k);
    if (!n) nodes.set(k, n = { x, z, deg: 0, wx: widthX(H, x), wz: widthZ(H, z) });
    return n;
  };
  function addSeg(H, x0, z0, x1, z1, w) {
    for (let t = 0; t <= 8; t++) if (!okPoint(lerp(x0, x1, t / 8), lerp(z0, z1, t / 8))) return;
    if (inPark((x0 + x1) / 2, (z0 + z1) / 2) || inMerged((x0 + x1) / 2, (z0 + z1) / 2)) return;
    const a = node(H, x0, z0), b = node(H, x1, z1);
    a.deg++; b.deg++;
    segs.push({ x0, z0, x1, z1, w, dir: x0 === x1 ? 'z' : 'x', a, b, kind: 'road' });
  }
  for (const H of HALVES) {
    for (const x of H.xs) for (let j = 0; j + 1 < H.zs.length; j++) addSeg(H, x, H.zs[j], x, H.zs[j + 1], widthX(H, x));
    for (const z of H.zs) for (let i = 0; i + 1 < H.xs.length; i++) addSeg(H, H.xs[i], z, H.xs[i + 1], z, widthZ(H, z));
  }
  const roadSegs = segs.slice();
  for (const bx of BRIDGES) {
    const a = nodes.get(bx + ',40'), b = nodes.get(bx + ',-40');
    if (!a || !b) continue;
    a.deg++; b.deg++;
    segs.push({ x0: bx, z0: 40, x1: bx, z1: -40, w: 20, dir: 'z', a, b, kind: bx === DRAW_X ? 'draw' : 'bridge' });
  }

  /* ---------- кварталы ---------- */
  const parkBlock = { x0: PARK.x0 + 7, x1: PARK.x1 - 7, z0: PARK.z0 + 7, z1: PARK.z1 - 7, cx: PC[0], cz: PC[1], type: 'park' };
  const blocks = [parkBlock];
  for (const H of HALVES) {
    H.cells = [];
    for (let i = 0; i + 1 < H.xs.length; i++) {
      H.cells.push([]);
      for (let j = 0; j + 1 < H.zs.length; j++) {
        const xa = H.xs[i], xb = H.xs[i + 1], za = H.zs[j], zb = H.zs[j + 1];
        const mg = inMerged((xa + xb) / 2, (za + zb) / 2);
        if (mg) {
          if (!mg.block) {
            const mb = mg.block = { x0: mg.x0 + widthX(H, mg.x0) / 2, x1: mg.x1 - widthX(H, mg.x1) / 2, z0: mg.z0 + widthZ(H, mg.z0) / 2, z1: mg.z1 - widthZ(H, mg.z1) / 2 };
            mb.cx = (mb.x0 + mb.x1) / 2; mb.cz = (mb.z0 + mb.z1) / 2; mb.type = district(mb.cx, mb.cz);
            blocks.push(mb);
          }
          H.cells[i].push(mg.block); continue;
        }
        const b = { x0: xa + widthX(H, xa) / 2, x1: xb - widthX(H, xb) / 2, z0: za + widthZ(H, za) / 2, z1: zb - widthZ(H, zb) / 2 };
        b.cx = (b.x0 + b.x1) / 2; b.cz = (b.z0 + b.z1) / 2; b.type = district(b.cx, b.cz);
        if (b.type === 'park') { H.cells[i].push(parkBlock); continue; }
        const ok = [[b.x0, b.z0], [b.x1, b.z0], [b.x0, b.z1], [b.x1, b.z1], [b.cx, b.cz]].every(([x, z]) => coastD(x, z) > BW + 2 && quayD(x, z) > 2);
        H.cells[i].push(ok ? b : null);
        if (ok) blocks.push(b);
      }
    }
  }
  const cellIdx = (arr, v) => { if (v < arr[0] || v >= arr[arr.length - 1]) return -1; let i = 0; while (arr[i + 1] <= v) i++; return i; };
  const blockAt = (x, z) => {
    const H = z >= 0 ? HALVES[0] : HALVES[1], i = cellIdx(H.xs, x), j = cellIdx(H.zs, z);
    if (i < 0 || j < 0) return null;
    const b = H.cells[i][j];
    return b && x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 ? b : null;
  };

  /* ---------- рельеф ---------- */
  const HILLS = [[-175, -235, 55, 7.5], [175, -240, 48, 6], [-160, -420, 62, 9], [150, -425, 50, 6.5], [-40, -445, 32, 4], [80, -205, 30, 3.5]];
  const hills = (x, z) => {
    let h = 0;
    for (const [hx, hz, r, a] of HILLS) { const d2 = ((x - hx) ** 2 + (z - hz) ** 2) / (r * r); if (d2 < 9) h += a * Math.exp(-d2 * 1.4); }
    return h;
  };
  const dn = makeNoise(mulberry32(99));
  const BEACH_Z = PROM_Z - 16;                                // южнее — песчаный пляж с дюнами
  const ground = (x, z) => {
    const cd = coastD(x, z), qd = quayD(x, z);
    let g = 0;
    if (cd < BW) g = cd >= 0 ? -0.6 * (1 - cd / BW) : Math.max(-7, -0.6 + cd * 0.12);
    if (qd < 0) g = Math.min(g, -Math.min(6, 0.6 - qd * 3));
    if (g < 0) return g;
    if (z < BEACH_Z) return 1.3 * Math.max(0, dn(x / 26, z / 26)) * smooth01((cd - BW - 5) / 25) * smooth01((BEACH_Z - z) / 14);
    const b = blockAt(x, z);
    if (!b) return 0;
    if (b.lane && x > b.lane.x0 && x < b.lane.x1) return 0;          // проезд-срезка сквозь квартал
    const e = Math.min(x - b.x0, b.x1 - x, z - b.z0, b.z1 - z);
    let h = CURB * smooth01(e / 0.6);
    if (b.type === 'park') h += hills(x, z) * smooth01((e - 4) / 30);
    return h;
  };

  // дорожки парка: кольцо-эллипс и четыре луча к фонтану
  const RING = { cx: PC[0], cz: PC[1], rx: 200, rz: 125 };
  const SPOKES = [[0, -147, 0, -295], [0, -493, 0, -345], [-273, -320, -25, -320], [25, -320, 273, -320]];
  const segDist = (x, z, ax, az, bx, bz) => {
    const dx = bx - ax, dz = bz - az, t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
    return Math.hypot(x - ax - dx * t, z - az - dz * t);
  };
  const parkPath = (x, z) => {
    const u = (x - RING.cx) / RING.rx, v = (z - RING.cz) / RING.rz, r = Math.hypot(u, v) || 1e-6;
    const grad = Math.hypot(u / RING.rx, v / RING.rz) / r;
    let d = Math.abs(r - 1) / grad;
    for (const s of SPOKES) d = Math.min(d, segDist(x, z, ...s));
    return Math.min(d, Math.max(0, Math.hypot(x - PC[0], z - PC[1]) - 25));
  };

  /* ---------- наполнение кварталов ---------- */
  const towers = [], caps = [], units = [], slants = [], spires = [], plain = [], roofs = [], neon = [], pools = [];
  const containers = [], solids = [], trees = [], palms = [], slabs = [], lamps = [], umbrellas = [];
  const domes = [], pyramids = [], rtanks = [], helipads = [], medians = [], alleys = [], landmarks = [], mmShapes = [];
  const keepOut = [];                                         // зоны, где не ставим фонари и деревья
  const avoid = [];                                           // зоны, где не ставим здания (эстакада, арки, проезды)
  // настилы: { kind: 'slab'|'wedge', p0, p1 ([x, y, z] верхней грани по оси), w, t, walk, mat, base, ext (удлинение концов), hidden }
  const deckPlan = [];
  const hits = (r, list, m = 0) => list.some(a => r[0] < a[1] + m && r[1] > a[0] - m && r[2] < a[3] + m && r[3] > a[2] - m);
  const hitsAvoid = (x, z, w, d) => hits([x - w / 2, x + w / 2, z - d / 2, z + d / 2], avoid, 0.5);
  const blocked = (x, z, m = 0) => keepOut.some(k => x > k[0] - m && x < k[1] + m && z > k[2] - m && z < k[3] + m);
  const snap = h => Math.max(6.6, Math.round(h / 3.3) * 3.3);
  const split = (a0, a1, minS, maxS) => {
    const L = a1 - a0, n = Math.max(1, Math.round(L / (minS + R() * (maxS - minS)))), out = [];
    for (let k = 0; k < n; k++) out.push([a0 + L * k / n, a0 + L * (k + 1) / n]);
    return out;
  };
  const solid = (x, z, w, d, h) => solids.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h });
  // корпус с окнами + парапет (+ техника на крыше)
  // st — стиль фасада (FACADE в js/world.js)
  function tower(x, z, w, d, h, color, y = CURB, roofKit = true, st = FACADE.punched) {
    towers.push({ x, y, z, w, h, d, color, st });
    caps.push({ x, y: y + h, z, w: w + 0.3, h: 0.55, d: d + 0.3 });
    if (roofKit && w > 10 && d > 10) {
      const n = 1 + Math.floor(R() * 3);
      for (let u = 0; u < n; u++) units.push({ x: x + (R() - 0.5) * (w - 5), y: y + h + 0.55, z: z + (R() - 0.5) * (d - 5), w: 1.5 + R() * 2.5, h: 1 + R() * 1.5, d: 1.5 + R() * 2.5 });
    }
  }
  const PAL = {
    downtown: [0x8fa3b8, 0x6f8499, 0xa9b6c2, 0x5d6d7e, 0xc2c9cf, 0x7b8fa6, 0x9eb0bf, 0x4e5d6c, 0xb8aa95, 0xd9d4c8],
    city: [0xd9cbb4, 0xb8c4cc, 0x9aa7b3, 0xc98f6b, 0xe8e2d6, 0x7d8a96, 0xa9b8a0, 0xd6b38a, 0x8e9fb0, 0xc7c0b5, 0xb07a5e, 0x6f7f8f],
    hotel: [0xf4c6d6, 0xbfe7e2, 0xf7e3b5, 0xfafafa, 0xf6cfae, 0xc9dff7, 0xe9d4f2, 0xd8f2c9],
    house: [0xe8dcc4, 0xd9c2a5, 0xc7d4dc, 0xe6d2d2, 0xd4dcc4, 0xf2ead8, 0xcfd8e6],
    roof: [0xa84b32, 0x8c4030, 0x5a5f66, 0x6b4a3a, 0x3f4650, 0x9a5a3c],
    shed: [0x9aa3ab, 0xb7b1a3, 0x8a96a0, 0xc2b8a3, 0x7f8b7a, 0xa8a196],
    cont: [0xc0392b, 0x2e6da4, 0x2f8f5b, 0xd98c1f, 0x7d4fa0, 0x8a8f96, 0xd6c13a, 0x1f7f86, 0xb5562d, 0xe8e8e2],
    neon: [0xff3fa4, 0x2ff0ff, 0xffe14a, 0x6aff6a, 0xff8a2a, 0xb36bff],
    old: [0xe3a857, 0xd9654b, 0x5fa8a0, 0xe8c9a0, 0xb5543c, 0xf0dcb0, 0x8fb3c9, 0xd98f8f, 0xc9b26b, 0x9cc28a, 0xf2efe6],
  };

  /* ---------- уникальные объекты в кварталах ---------- */
  // fill — квартал всё равно застраивается, кроме прямоугольника reserve
  const reserve = (x, z, kind, opts = {}) => {
    const b = blockAt(x, z);
    if (!b || b.special || b.type === 'park') return null;
    b.special = Object.assign({ kind }, opts);
    if (opts.fill) b.special.reserve = [b.cx - opts.rw, b.cx + opts.rw, b.cz - opts.rd, b.cz + opts.rd];
    return b;
  };
  reserve(41.5, 238.5, 'statue');           // золотая машина-памятник
  reserve(-41.5, 400, 'tvtower');
  reserve(120, 320, 'twist');               // закрученный небоскрёб
  reserve(451.5, 321.5, 'cityhall');
  reserve(650, 440, 'stadium');
  reserve(-640, 400, 'tanks');              // нефтебаза
  reserve(550, 670, 'market');              // рыночная площадь Старого города
  reserve(-480, -320, 'church', { fill: true, rw: 20, rd: 27 });
  reserve(630, -320, 'watertower', { fill: true, rw: 12, rd: 12 });

  // участки квартала: весь квартал или две половины по сторонам проезда-срезки
  const lotRects = (b, inset) => b.lane
    ? [[b.x0 + inset, b.lane.x0 - 1.5, b.z0 + inset, b.z1 - inset], [b.lane.x1 + 1.5, b.x1 - inset, b.z0 + inset, b.z1 - inset]]
    : [[b.x0 + inset, b.x1 - inset, b.z0 + inset, b.z1 - inset]];
  // кривой переулок — ломаная; дом не должен её задевать
  const alleyHit = (al, x, z, w, d) => al.pts.some(([px, pz]) => {
    const dx = Math.max(Math.abs(px - x) - w / 2, 0), dz = Math.max(Math.abs(pz - z) - d / 2, 0);
    return dx * dx + dz * dz < (al.w / 2 + 1.2) ** 2;
  });
  const lotBlocked = (b, x, z, w, d) => hitsAvoid(x, z, w, d) || (b.alley && alleyHit(b.alley, x, z, w, d))
    || (b.special?.reserve && hits([x - w / 2, x + w / 2, z - d / 2, z + d / 2], [b.special.reserve], 1));
  function fillDowntown(b) {
    const f = 1 - clamp(Math.hypot(b.cx, b.cz - 300) / 420, 0, 1);
    for (const [rx0, rx1, rz0, rz1] of lotRects(b, 4)) for (const [x0, x1] of split(rx0, rx1, 26, 44)) for (const [z0, z1] of split(rz0, rz1, 26, 44)) {
      const w = x1 - x0 - 3 - R() * 5, d = z1 - z0 - 3 - R() * 5, x = (x0 + x1) / 2, z = (z0 + z1) / 2;
      const h = snap(Math.max(30, (30 + 150 * f * f) * (0.55 + R() * 0.6))), color = pick(PAL.downtown);
      const st = pick([FACADE.glass, FACADE.glass, FACADE.glass, FACADE.ribbon, FACADE.strips, FACADE.punched]);
      const kind = h > 60 ? pick(['box', 'box', 'tiers', 'tiers', 'spire', 'slant', 'podium', 'dome', 'pyramid']) : pick(['box', 'box', 'slant', 'pyramid', 'podium']);
      if (lotBlocked(b, x, z, w, d)) continue;
      let top = h;
      if (kind === 'tiers') {
        const h1 = snap(h * 0.55), h2 = snap(h * 0.28), h3 = snap(h * 0.17);
        tower(x, z, w, d, h1, color, CURB, false, st);
        tower(x, z, w * 0.76, d * 0.76, h2, color, CURB + h1 + 0.55, false, st);
        tower(x, z, w * 0.52, d * 0.52, h3, color, CURB + h1 + h2 + 1.1, true, st);
        top = h1 + h2 + h3 + 1.65;
      } else if (kind === 'spire') {
        tower(x, z, w, d, h, color, CURB, false, st);
        tower(x, z, w * 0.45, d * 0.45, 6.6, color, CURB + h + 0.55, false, st);
        spires.push({ x, y: CURB + h + 7.7, z, r: Math.min(w, d) * 0.07 + 0.4, h: h * 0.25 });
        top = h + 8 + h * 0.25;
      } else if (kind === 'slant') {
        const sh = Math.min(w, d) * (0.35 + R() * 0.3);
        towers.push({ x, y: CURB, z, w, h, d, color, st });
        slants.push({ x, y: CURB + h, z, w, h: sh, d, color, st, ry: Math.floor(R() * 4) * Math.PI / 2 });
        top = h + sh;
      } else if (kind === 'podium') {
        // широкий стилобат в 3 этажа и башня поуже, смещённая к краю
        const hp = 9.9, ox = (R() - 0.5) * w * 0.25, oz = (R() - 0.5) * d * 0.25;
        tower(x, z, w, d, hp, pick(PAL.city), CURB, false, FACADE.punched);
        tower(x + ox, z + oz, w * 0.6, d * 0.6, Math.max(9.9, h - hp - 0.55), color, CURB + hp + 0.55, true, st);
      } else if (kind === 'dome') {
        tower(x, z, w, d, h, color, CURB, false, st);
        const r = Math.min(w, d) * 0.34;
        domes.push({ x, y: CURB + h + 0.55, z, r });
        spires.push({ x, y: CURB + h + 0.55 + r * 0.88, z, r: 0.25, h: r * 0.7 });
        top = h + r * 1.6;
      } else if (kind === 'pyramid') {
        tower(x, z, w, d, h, color, CURB, false, st);
        const ph = Math.min(w, d) * (0.4 + R() * 0.4);
        pyramids.push({ x, y: CURB + h + 0.55, z, w: w * 0.92, h: ph, d: d * 0.92, color: pick([0x5f6d78, 0x6fae95, 0x3d4550, 0xb08d57]) });
        top = h + ph;
      } else {
        const pad = h > 70 && w > 18 && d > 18 && R() < 0.4;
        tower(x, z, w, d, h, color, CURB, !pad, st);
        if (pad) helipads.push({ x, y: CURB + h + 0.55, z, r: Math.min(w, d) * 0.33 });
        else if (R() < 0.35) { spires.push({ x: x + (R() - 0.5) * w * 0.4, y: CURB + h + 0.55, z: z + (R() - 0.5) * d * 0.4, r: 0.3, h: 10 + R() * 20 }); top = h + 25; }
      }
      solid(x, z, w, d, top + 1);
    }
  }
  function fillCity(b) {
    const dc = clamp(Math.hypot(b.cx, b.cz - 300) / 800, 0, 1);
    for (const [rx0, rx1, rz0, rz1] of lotRects(b, 3.5)) {
      const xs = split(rx0, rx1, 18, 30), zs = split(rz0, rz1, 18, 30);
      xs.forEach(([x0, x1], i) => zs.forEach(([z0, z1], j) => {
        const inner = i > 0 && i < xs.length - 1 && j > 0 && j < zs.length - 1, x = (x0 + x1) / 2, z = (z0 + z1) / 2;
        if (R() < (inner ? 0.5 : 0.07)) {
          const tx = x + (R() - 0.5) * 6, tz = z + (R() - 0.5) * 6;
          if (!lotBlocked(b, tx, tz, 4, 4)) trees.push([tx, tz, 0.9 + R() * 0.5]);
          return;
        }
        const w = x1 - x0 - 1 - R() * 3, d = z1 - z0 - 1 - R() * 3, h = snap(lerp(44, 13, dc) * (0.35 + R() * 0.8));
        const bx = x + (R() - 0.5) * (x1 - x0 - w) * 0.8, bz = z + (R() - 0.5) * (z1 - z0 - d) * 0.8;
        const st = pick([FACADE.punched, FACADE.punched, FACADE.punched, FACADE.ribbon, FACADE.old, FACADE.strips]);
        if (lotBlocked(b, bx, bz, w, d)) return;
        const hip = h < 25 && R() < 0.18;                    // вальмовая крыша
        tower(bx, bz, w, d, h, pick(PAL.city), CURB, !hip, st);
        if (hip) pyramids.push({ x: bx, y: CURB + h + 0.55, z: bz, w: w + 0.2, h: Math.min(w, d) * 0.3, d: d + 0.2, color: pick(PAL.roof) });
        else if (h < 45 && w > 9 && d > 9 && R() < 0.25)       // деревянный бак для воды на крыше
          rtanks.push({ x: bx + (R() - 0.5) * (w - 6), y: CURB + h + 0.55, z: bz + (R() - 0.5) * (d - 6), s: 0.85 + R() * 0.4 });
        solid(bx, bz, w, d, h + (hip ? 6 : 0.7));
      }));
    }
  }
  // Старый город: ряды узких домов по периметру квартала, внутри — дворик
  function fillOld(b) {
    const dep = 10 + R() * 3, ins = 3;
    const rows = [
      ['x', b.x0 + ins, b.x1 - ins, b.z0 + ins + dep / 2], ['x', b.x0 + ins, b.x1 - ins, b.z1 - ins - dep / 2],
      ['z', b.z0 + ins + dep + 0.5, b.z1 - ins - dep - 0.5, b.x0 + ins + dep / 2], ['z', b.z0 + ins + dep + 0.5, b.z1 - ins - dep - 0.5, b.x1 - ins - dep / 2],
    ];
    for (const [ax, a0, a1, c] of rows) {
      let a = a0;
      while (a1 - a > 4) {
        let wd = 6 + R() * 5;
        if (a1 - a - wd < 5) wd = a1 - a;
        const m = a + wd / 2, x = ax === 'x' ? m : c, z = ax === 'x' ? c : m;
        const w = ax === 'x' ? wd - 0.15 : dep, d = ax === 'x' ? dep : wd - 0.15;
        a += wd;
        if (lotBlocked(b, x, z, w, d)) continue;
        const h = snap(6.6 + R() * 9.9), pitched = R() < 0.65;
        tower(x, z, w, d, h, pick(PAL.old), CURB, false, FACADE.old);
        if (pitched) roofs.push({ x, y: CURB + h + 0.55, z, w: (ax === 'x' ? d : w) + 0.6, h: 2.4 + R() * 1.6, d: (ax === 'x' ? w : d) + 0.2, color: pick(PAL.roof), ry: ax === 'x' ? Math.PI / 2 : 0 });
        solid(x, z, w, d, h + (pitched ? 4.5 : 1));
      }
    }
    for (let k = 0; k < 3; k++) {
      const tx = b.cx + (R() - 0.5) * (b.x1 - b.x0 - 2 * dep - 14), tz = b.cz + (R() - 0.5) * (b.z1 - b.z0 - 2 * dep - 14);
      if (!lotBlocked(b, tx, tz, 3, 3)) trees.push([tx, tz, 0.8 + R() * 0.4]);
    }
  }
  // здание-арка над проездом-срезкой: два крыла и перемычка на высоте 7,6 м — сквозь неё проезжают на полной скорости
  function arch(b) {
    const L = b.lane, dt = b.type === 'downtown', AH = 7.6, st = dt ? FACADE.glass : pick([FACADE.punched, FACADE.ribbon, FACADE.strips]);
    const wg = Math.min(Math.min(L.x0 - b.x0, b.x1 - L.x1) - 4, 10 + R() * 6), D = 18 + R() * 8;
    const zc = b.cz + (R() - 0.5) * Math.max(0, b.z1 - b.z0 - D - 30);
    const h = snap(dt ? 40 + R() * 70 : 16 + R() * 22), color = pick(dt ? PAL.downtown : PAL.city);
    for (const sd of [-1, 1]) { const x = b.cx + sd * (5 + wg / 2); tower(x, zc, wg, D, h, color, CURB, true, st); solid(x, zc, wg, D, h + 1); }
    towers.push({ x: b.cx, y: AH, z: zc, w: 10.02, h: CURB + h - AH, d: D, color, st });
    caps.push({ x: b.cx, y: CURB + h, z: zc, w: 10.3, h: 0.55, d: D + 0.3 });
    // перемычка — коллайдер Rapier без отдельного визуала (её рисует корпус выше)
    deckPlan.push({ kind: 'slab', p0: [b.cx, CURB + h, zc - D / 2], p1: [b.cx, CURB + h, zc + D / 2], w: 10.2, t: CURB + h - AH, walk: false, hidden: true });
    for (let k = -1; k <= 1; k++) neon.push({ x: b.cx, y: AH - 0.12, z: zc + k * D / 3, w: 6, h: 0.1, d: 0.6, color: 0xfff1c4 });
    avoid.push([b.cx - 5 - wg - 2, b.cx + 5 + wg + 2, zc - D / 2 - 2, zc + D / 2 + 2], [L.x0 - 1, L.x1 + 1, b.z0, b.z1]);
    keepOut.push([L.x0 - 2, L.x1 + 2, b.z0 - 3, b.z0 + 3], [L.x0 - 2, L.x1 + 2, b.z1 - 3, b.z1 + 3]);
    lanes.push(L);
  }
  // деревья вдоль краёв площади вокруг уникального объекта, значок на мини-карте
  function specialData(b, sp) {
    const hw = (b.x1 - b.x0) / 2 - 6, hd = (b.z1 - b.z0) / 2 - 6, x = b.cx, z = b.cz, k = sp.kind;
    if (['statue', 'tvtower', 'twist', 'market', 'cityhall'].includes(k))
      for (const [tx, tz] of [[x - hw, z - hd], [x + hw, z - hd], [x - hw, z + hd], [x + hw, z + hd]]) trees.push([tx, tz, 1.0]);
    if (k === 'statue' || k === 'market' || k === 'tvtower')
      for (const [tx, tz] of [[x - hw * 0.5, z - hd], [x + hw * 0.5, z - hd], [x - hw * 0.5, z + hd], [x + hw * 0.5, z + hd]]) trees.push([tx, tz, 0.9]);
    const mm = { statue: ['r', 15, 9], tvtower: ['c', 15], twist: ['c', 20], cityhall: ['r', 66, 42], stadium: ['e', 41, 64], church: ['r', 15, 44],
      watertower: ['c', 7], tanks: ['r', 92, 50], market: ['c', 5] }[k];
    if (mm) mmShapes.push([mm[0], x, z + (k === 'cityhall' ? 0 : 0), mm[1], mm[2]]);
  }
  function warehouse(x, z, w, d) {
    const h = 7 + R() * 4, color = pick(PAL.shed), along = w >= d;
    plain.push({ x, y: CURB, z, w, h, d, color });
    roofs.push({ x, y: CURB + h, z, w: along ? d + 0.6 : w + 0.6, h: 2.6 + R() * 1.4, d: along ? w + 0.6 : d + 0.6, color: pick(PAL.roof), ry: along ? Math.PI / 2 : 0 });
    // ворота вдоль длинной стороны
    const L = along ? w : d, n = Math.max(1, Math.floor(L / 14));
    for (let k = 0; k < n; k++) {
      const o = -L / 2 + (k + 0.5) * L / n;
      for (const s of [1, -1]) {
        if (along) plain.push({ x: x + o, y: CURB, z: z + s * (d / 2 + 0.12), w: 4.5, h: 4.8, d: 0.3, color: 0x3b3f44 });
        else plain.push({ x: x + s * (w / 2 + 0.12), y: CURB, z: z + o, w: 0.3, h: 4.8, d: 4.5, color: 0x3b3f44 });
      }
    }
    solid(x, z, w, d, h + 3);
  }
  function fillPort(b) {
    const nearWater = quayD(b.cx, b.cz) < 120;
    if (nearWater || R() < 0.45) {
      // контейнерный терминал: «бухты» 3×4 штабеля, между ними проезды
      const x0 = b.x0 + 5, x1 = b.x1 - 5, z0 = b.z0 + 5, z1 = b.z1 - 5, BWD = 3 * 13.4 - 1.2, BD = 4 * 2.5, LX = 9, LZ = 8;
      const nx = Math.max(1, Math.floor((x1 - x0 + LX) / (BWD + LX))), nz = Math.max(1, Math.floor((z1 - z0 + LZ) / (BD + LZ)));
      const ox = x0 + ((x1 - x0) - (nx * BWD + (nx - 1) * LX)) / 2, oz = z0 + ((z1 - z0) - (nz * BD + (nz - 1) * LZ)) / 2;
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        const bx = ox + i * (BWD + LX), bz = oz + j * (BD + LZ);
        let top = 0;
        for (let a = 0; a < 3; a++) for (let c = 0; c < 4; c++) {
          const n = R() < 0.12 ? 0 : 1 + Math.floor(R() * R() * 4.4);
          for (let k = 0; k < n; k++) containers.push({ x: bx + a * 13.4 + 6.1, y: CURB + k * 2.6, z: bz + c * 2.5 + 1.22, color: pick(PAL.cont) });
          top = Math.max(top, n);
        }
        if (top) solid(bx + BWD / 2, bz + BD / 2, BWD, BD, top * 2.6);
      }
    } else {
      const zs = b.z1 - b.z0 > 70 ? split(b.z0 + 4, b.z1 - 4, 30, 40) : [[b.z0 + 4, b.z1 - 4]];
      for (const [z0, z1] of zs) warehouse(b.cx, (z0 + z1) / 2, b.x1 - b.x0 - 10 - R() * 12, Math.min(z1 - z0 - 8, 22 + R() * 10));
    }
  }
  function fillResort(b) {
    // отели фасадом к морю (на юг), неоновые вывески на крышах, бассейны и пальмы во дворах
    for (const [x0, x1] of split(b.x0 + 4, b.x1 - 4, 34, 50)) {
      const w = x1 - x0 - 6 - R() * 5, d = 18 + R() * 8, x = (x0 + x1) / 2, z = b.z0 + 5 + d / 2, h = snap(22 + R() * 52);
      tower(x, z, w, d, h, pick(PAL.hotel), CURB, true, pick([FACADE.ribbon, FACADE.ribbon, FACADE.punched, FACADE.strips]));
      solid(x, z, w, d, h + 4);
      const c = pick(PAL.neon);
      neon.push({ x, y: CURB + h + 0.55, z: z - d / 2 + 0.5, w: w * (0.45 + R() * 0.3), h: 3 + R() * 1.5, d: 0.5, color: c });
      neon.push({ x: x + (R() < 0.5 ? -1 : 1) * (w / 2 - 0.2), y: CURB + h * 0.3, z: z - d / 2 - 0.25, w: 0.5, h: h * 0.6, d: 0.5, color: c });
      const pz = z + d / 2 + 12;
      if (pz + 4 < b.z1 - 4) { pools.push({ x: x + (R() - 0.5) * 8, y: CURB, z: pz, w: 12 + R() * 6, h: 0.08, d: 7 }); }
      for (let k = 0; k < 3; k++) palms.push([x0 + 3 + R() * (x1 - x0 - 6), b.z1 - 5 - R() * 10, 0.85 + R() * 0.35, R() * 6.28]);
    }
  }
  function fillSuburb(b) {
    for (const [x0, x1] of split(b.x0 + 3.5, b.x1 - 3.5, 20, 28)) for (const [z0, z1] of split(b.z0 + 3.5, b.z1 - 3.5, 20, 28)) {
      const x = (x0 + x1) / 2, z = (z0 + z1) / 2;
      if (lotBlocked(b, x, z, 16, 13)) continue;
      if (R() < 0.12) { trees.push([x, z, 1 + R() * 0.5]); continue; }
      const w = 9 + R() * 6, d = 8 + R() * 4, h = 3.5 + R() * 3.5, along = w >= d;
      plain.push({ x, y: CURB, z, w, h, d, color: pick(PAL.house) });
      roofs.push({ x, y: CURB + h, z, w: (along ? d : w) + 0.8, h: 2.2 + R() * 1.4, d: (along ? w : d) + 0.8, color: pick(PAL.roof), ry: along ? Math.PI / 2 : 0 });
      solid(x, z, w, d, h + 3);
      if (R() < 0.7) {
        const tx = x + (R() < 0.5 ? -1 : 1) * (w / 2 + 3), tz = z + (R() - 0.5) * 6;
        if (Math.abs(tx - x) < (x1 - x0) / 2 - 1) trees.push([tx, tz, 0.8 + R() * 0.4]);
      }
    }
  }
  /* ---------- эстакада ---------- */
  // U-образная эстакада на опорах над улицами x = ±320 и z = 520 опоясывает Даунтаун.
  // Въезды — пандусы от набережной канала: улицы x = ±320 между z = 40 и 120 целиком стали пандусами.
  const OV = { H: 9, W: 16, R: 28, X: 320, Z: 520, Z0: 47, Z1: 113 };
  const ovRuns = [[-OV.X, OV.Z1, -OV.X, OV.Z - OV.R], [-OV.X + OV.R, OV.Z, OV.X - OV.R, OV.Z], [OV.X, OV.Z - OV.R, OV.X, OV.Z1]];
  const ovPillars = [], ovArcs = [];
  const ovRails = (x0, z0, x1, z1, y0, y1, ext = 0) => {      // ограждения по обеим сторонам настила
    const L = Math.hypot(x1 - x0, z1 - z0), dx = (x1 - x0) / L, dz = (z1 - z0) / L, nx = dz, nz = -dx, o = OV.W / 2 + 0.2;
    for (const sd of [1, -1]) deckPlan.push({ kind: 'slab', p0: [x0 + nx * o * sd, y0 + 1.05, z0 + nz * o * sd], p1: [x1 + nx * o * sd, y1 + 1.05, z1 + nz * o * sd],
      w: 0.4, t: 1.4, walk: false, mat: 'rail', ext });
  };
  for (const [x0, z0, x1, z1] of ovRuns) {
    const L = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(L / 40);
    for (let k = 0; k < n; k++) {
      const ax = lerp(x0, x1, k / n), az = lerp(z0, z1, k / n), bx = lerp(x0, x1, (k + 1) / n), bz = lerp(z0, z1, (k + 1) / n);
      deckPlan.push({ kind: 'slab', p0: [ax, OV.H, az], p1: [bx, OV.H, bz], w: OV.W, t: 1.2, mat: 'ovdeck' });
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
        deckPlan.push({ kind: 'slab', p0: [u[0], OV.H + 1.05, u[1]], p1: [v[0], OV.H + 1.05, v[1]], w: 0.4, t: 1.4, walk: false, mat: 'rail', ext: 0.15 });
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
  const lanes = [];
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

  for (const b of blocks) {
    const inner = b.type === 'suburb' || b.type === 'resort' || b.type === 'park';
    const sp = b.special, plaza = sp && !sp.fill;
    const sideColor = plaza ? 0xd2cbbd : { downtown: 0xc9c4ba, port: 0x9d9d98, city: 0xbdb9b0, suburb: 0xc4c0b6, resort: 0xe0d6c2, oldtown: 0xb9ae9c }[b.type];
    if (b.lane) {
      const L = b.lane;
      slabs.push({ x: (b.x0 + L.x0) / 2, z: b.cz, w: L.x0 - b.x0, d: b.z1 - b.z0, y: 0, h: CURB, color: sideColor },
        { x: (L.x1 + b.x1) / 2, z: b.cz, w: b.x1 - L.x1, d: b.z1 - b.z0, y: 0, h: CURB, color: sideColor });
      arch(b);
    } else if (b.type !== 'park') slabs.push({ x: b.cx, z: b.cz, w: b.x1 - b.x0, d: b.z1 - b.z0, y: 0, h: CURB, color: sideColor });
    if (inner && b.type !== 'park' && !plaza) slabs.push({ x: b.cx, z: b.cz, w: b.x1 - b.x0 - 7, d: b.z1 - b.z0 - 7, y: 0, h: CURB + 0.02, color: b.type === 'resort' ? 0x79a85a : 0x6a9a48 });
    if (sp) { landmarks.push(Object.assign({ x: b.cx, z: b.cz }, sp)); specialData(b, sp); }
    if (plaza) continue;
    ({ downtown: fillDowntown, city: fillCity, port: fillPort, resort: fillResort, suburb: fillSuburb, oldtown: fillOld })[b.type]?.(b);
  }
  // тротуар вокруг парка
  { const p = parkBlock, t = 3.5;
    slabs.push({ x: p.cx, z: p.z0 + t / 2, w: p.x1 - p.x0, d: t, y: 0, h: CURB, color: 0xc4c0b6 }, { x: p.cx, z: p.z1 - t / 2, w: p.x1 - p.x0, d: t, y: 0, h: CURB, color: 0xc4c0b6 },
      { x: p.x0 + t / 2, z: (p.z0 + p.z1) / 2, w: t, d: p.z1 - p.z0, y: 0, h: CURB, color: 0xc4c0b6 }, { x: p.x1 - t / 2, z: (p.z0 + p.z1) / 2, w: t, d: p.z1 - p.z0, y: 0, h: CURB, color: 0xc4c0b6 }); }

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
  // точки задаются как [x, y, z] верхней грани по оси дороги
  const DW = 22;
  for (const bx of BRIDGES) {
    if (bx === DRAW_X) continue;
    // плавный «горб»: на гребне на скорости больше ~95 км/ч машина отрывается от земли
    const Y = z => 0.03 + 4.2 * (1 + Math.cos(Math.PI * z / 33)) / 2;
    for (let z = 33; z > -33; z -= 3) {
      const z2 = z - 3;
      deckPlan.push({ kind: 'slab', p0: [bx, Y(z), z], p1: [bx, Y(z2), z2], w: DW, t: 1.2, mat: 'deck' });
      for (const s of [1, -1]) deckPlan.push({ kind: 'slab', p0: [bx + s * 11.3, Y(z) + 1.05, z], p1: [bx + s * 11.3, Y(z2) + 1.05, z2], w: 0.4, t: 1.4, walk: false, mat: 'rail' });
    }
    for (const z of [-17, 17]) plain.push({ x: bx, y: -7, z, w: DW - 4, h: 7 + 4.2 * (1 + Math.cos(Math.PI * z / 33)) / 2 - 1.1, d: 3, color: 0x9b9a94 });
    keepOut.push([bx - 14, bx + 14, -48, 48]);
  }
  // разводной мост: обе половины подняты — трамплин через канал (разрыв 24 м, нужно ~95 км/ч)
  for (const s of [1, -1]) {
    const pts = [[33, 0.03], [28, 0.7], [13, 6.23], [12, 6.6]];
    const mats = ['steel', 'steel', 'hazard'];
    for (let k = 0; k < 3; k++) {
      const [za, ya] = pts[k], [zb, yb] = pts[k + 1];
      deckPlan.push({ kind: 'slab', p0: [DRAW_X, ya, s * za], p1: [DRAW_X, yb, s * zb], w: DW, t: 1.0, mat: mats[k] });
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

  /* ---------- фонари вдоль дорог ---------- */
  for (const s of roadSegs) {
    const along = s.dir === 'z', a0 = along ? s.z0 : s.x0, a1 = along ? s.z1 : s.x1, c = along ? s.x0 : s.z0, off = s.w / 2 + 1.4;
    const start = a0 + (along ? s.a.wz : s.a.wx) / 2 + 10, end = a1 - (along ? s.b.wz : s.b.wx) / 2 - 10;
    for (let a = start; a <= end; a += 32) for (const side of [1, -1]) {
      const x = along ? c + side * off : a, z = along ? a : c + side * off;
      if (blocked(x, z, 1) || coastD(x, z) < BW || quayD(x, z) < 0.8) continue;
      lamps.push([x, z, along ? (side > 0 ? Math.PI : 0) : (side > 0 ? Math.PI / 2 : -Math.PI / 2)]);
    }
  }

  /* ---------- набережная, пляж, пальмы, зонтики ---------- */
  for (let x = -900; x <= 900; x += 20) {
    const z = PROM_Z - 11 - 4.5;
    if (coastD(x, z) > BW + 5 && !blocked(x, z, 3)) palms.push([x + (R() - 0.5) * 3, z, 0.95 + R() * 0.3, R() * 6.28]);
  }
  for (let t = 0, n = 0; t < 3000 && n < 170; t++) {
    const x = (R() * 2 - 1) * 900, z = BEACH_Z - 8 - R() * 130, cd = coastD(x, z);
    if (cd < 14 || blocked(x, z, 4)) continue;
    if (R() < 0.35) palms.push([x, z, 0.8 + R() * 0.4, R() * 6.28]);
    else { umbrellas.push([x, z, Math.floor(R() * 6)]); n++; }
  }
  // пальмы на набережной курортной части вдоль канала
  for (let x = -900; x <= 900; x += 24) {
    const z = -CANAL - 1.6;                                   // на тротуаре между дорогой (−33) и кромкой канала (−30)
    if (!blocked(x, z, 2) && coastD(x, z) > BW + 4) palms.push([x, z, 0.9 + R() * 0.25, R() * 6.28]);
  }

  /* ---------- деревья: парк и окраины ---------- */
  for (let t = 0, n = 0; t < 4000 && n < 520; t++) {
    const x = lerp(parkBlock.x0 + 6, parkBlock.x1 - 6, R()), z = lerp(parkBlock.z0 + 6, parkBlock.z1 - 6, R());
    if (parkPath(x, z) < 6 || blocked(x, z, 3)) continue;
    trees.push([x, z, 0.85 + R() * 0.7]); n++;
  }
  const nearLine = (x, z) => {
    const H = z >= 0 ? HALVES[0] : HALVES[1];
    if (z >= Math.min(...H.zs) - 10 && z <= Math.max(...H.zs) + 10 && H.xs.some(l => Math.abs(x - l) < widthX(H, l) / 2 + 4)) return true;
    return x >= H.xs[0] - 10 && x <= H.xs[H.xs.length - 1] + 10 && H.zs.some(l => Math.abs(z - l) < widthZ(H, l) / 2 + 4);
  };
  for (let t = 0, n = 0; t < 12000 && n < 1500; t++) {
    const x = (R() * 2 - 1) * 980, z = (R() * 2 - 1) * 980;
    if (coastD(x, z) < 20 || quayD(x, z) < 8 || z < BEACH_Z + 4 || blockAt(x, z) || district(x, z) === 'port' || nearLine(x, z) || blocked(x, z, 3)) continue;
    trees.push([x, z, 0.9 + R() * 0.7]); n++;
  }

  // ограждение вдоль канала (кроме порта и мостов)
  const rails = [];
  for (const s of [1, -1]) for (let x = -990; x < 990; x += 20) {
    const xm = x + 10, z = s * (CANAL + 0.7);
    if (s > 0 && xm < -440) continue;
    if (BRIDGES.some(bx => Math.abs(xm - bx) < 26) || coastD(x, z) < 6 || coastD(x + 20, z) < 6) continue;
    rails.push([xm, z]);
  }

  // маяк на юго-восточном мысу
  let lh = [700, -700];
  { const th = -0.75; for (let r = 700; r < 1100; r += 0.5) { const x = Math.cos(th) * r, z = Math.sin(th) * r; if (coastD(x, z) < 9) { lh = [x, z]; break; } } }

  // перекрёстки со светофорами: четырёхсторонние, где хотя бы одна улица — широкий проспект (кроме кольцевых развязок)
  const roundKeys = new Set(landmarks.filter(l => l.kind === 'roundabout').map(l => l.x + ',' + l.z));
  const litNodes = [...nodes.values()].filter(n => n.deg >= 4 && (n.wx >= 20 || n.wz >= 20) && !roundKeys.has(n.x + ',' + n.z));

  /* ---------- уличная мелочь: гидранты, дорожные знаки, летние кафе, скамейки и урны ---------- */
  // всё это сбивается машиной (Breakables в js/world.js)
  const hydrants = [], signs = [], tables = [], chairs = [], benches = [], bins = [];
  // точка на тротуаре: не в запретной зоне, не у воды и не внутри здания (r — радиус свободного места)
  const freeSpot = (x, z, r) => !blocked(x, z, r) && coastD(x, z) > BW + 1 && quayD(x, z) > 1.5
    && !solids.some(o => x > o.minX - r && x < o.maxX + r && z > o.minZ - r && z < o.maxZ + r);
  // знак: ry — куда смотрит лицевая сторона; type: 0 — «Стоп», 1 — «Уступи дорогу», 2 — ограничение скорости, 3 — парковка, 4 — пешеходный переход
  const sign = (x, z, fx, fz, type) => { if (freeSpot(x, z, 0.3)) signs.push([x, z, Math.atan2(fx, fz), type]); };
  // перекрёстки без светофоров: на въездах со второстепенной улицы — «Стоп» (крестовина) или «Уступи дорогу» (Т-образный)
  const litKeys = new Set(litNodes.map(n => n.x + ',' + n.z)), adj = new Map();
  for (const sg of roadSegs) for (const [n, d] of [[sg.a, sg.dir === 'z' ? '+z' : '+x'], [sg.b, sg.dir === 'z' ? '-z' : '-x']]) {
    let a = adj.get(n); if (!a) adj.set(n, a = new Set()); a.add(d);
  }
  for (const n of nodes.values()) {
    const k = n.x + ',' + n.z, a = adj.get(n);
    if (n.deg < 3 || litKeys.has(k) || roundKeys.has(k) || !a) continue;
    const minor = n.wx < n.wz ? 'z' : n.wz < n.wx ? 'x' : R() < 0.5 ? 'z' : 'x', type = n.deg >= 4 ? 0 : 1;
    const ox = n.wx / 2 + 1.4, oz = n.wz / 2 + 1.4;
    // правостороннее движение: знак справа по ходу (при взгляде вдоль +Z справа −X), лицом к подъезжающим
    if (minor === 'z') {
      if (a.has('-z')) sign(n.x - ox, n.z - oz, 0, -1, type);
      if (a.has('+z')) sign(n.x + ox, n.z + oz, 0, 1, type);
    } else {
      if (a.has('-x')) sign(n.x - ox, n.z + oz, -1, 0, type);
      if (a.has('+x')) sign(n.x + ox, n.z - oz, 1, 0, type);
    }
  }
  const CAFE_P = { oldtown: 0.45, resort: 0.5, downtown: 0.15, city: 0.12 };
  const CAFE_COL = [[0xf2efe6, 0xc0392b], [0x30343a, 0x2e6da4], [0xe8e2d6, 0x2f8f5b], [0x30343a, 0xd98c1f], [0xf2efe6, 0x30343a], [0xd9cbb4, 0x8a5a33]];
  for (const sg of roadSegs) {
    if (sg.ramp) continue;
    const along = sg.dir === 'z', a0 = along ? sg.z0 : sg.x0, a1 = along ? sg.z1 : sg.x1, c = along ? sg.x0 : sg.z0;
    const start = a0 + (along ? sg.a.wz : sg.a.wx) / 2 + 10, end = a1 - (along ? sg.b.wz : sg.b.wx) / 2 - 10;
    if (end - start < 20) continue;
    const at = (a, side, off) => along ? [c + side * (sg.w / 2 + off), a] : [a, c + side * (sg.w / 2 + off)];
    // гидранты: посередине между фонарями, через пролёт, стороны чередуются
    for (let a = start + 16, k = 0; a <= end - 4; a += 64, k++) {
      const [x, z] = at(a, k % 2 ? 1 : -1, 0.8);
      if (freeSpot(x, z, 0.4)) hydrants.push([x, z]);
    }
    // знаки в начале квартала справа по ходу: ограничение скорости или парковка (в каждом направлении)
    for (const dir of [1, -1]) {
      if (R() < 0.5) continue;
      const fx = along ? 0 : dir, fz = along ? dir : 0, rx = -fz, rz = fx;        // (rx, rz) — направо по ходу
      const a = dir > 0 ? start - 4 : end + 4, side = along ? Math.sign(rx) : Math.sign(rz);
      const [x, z] = at(a, side, 0.9);
      sign(x, z, -fx, -fz, R() < 0.55 ? 2 : 3);
    }
    // летние кафе: 2–3 столика со стульями вдоль тротуара, иногда с зонтиками
    for (let a = start + 48; a <= end - 6; a += 64) for (const side of [1, -1]) {
      const [x, z] = at(a, side, 2.3), p = blockAt(x, z) ? CAFE_P[district(x, z)] || 0 : 0;   // только на тротуаре квартала
      if (R() >= p) continue;
      const n = 2 + (R() < 0.5 ? 1 : 0), col = Math.floor(R() * CAFE_COL.length), parasol = R() < 0.45, umb = Math.floor(R() * 6);
      const ux = along ? 0 : 1, uz = along ? 1 : 0;               // вдоль дороги
      const spots = [];
      for (let t = 0; t < n; t++) {
        const o = (t - (n - 1) / 2) * 2.7, tx = x + ux * o, tz = z + uz * o;
        if (!freeSpot(tx, tz, 1.1)) { spots.length = 0; break; }
        spots.push([tx, tz]);
      }
      for (const [tx, tz] of spots) {
        tables.push([tx, tz, col]);
        for (const s2 of [1, -1]) chairs.push([tx + ux * s2 * 0.78, tz + uz * s2 * 0.78, Math.atan2(-ux * s2, -uz * s2) + (R() - 0.5) * 0.5, col]);
        if (parasol) umbrellas.push([tx, tz, umb]);
      }
    }
  }
  // парк: скамейки вдоль кольцевой дорожки лицом к ней, рядом урны
  for (let k = 0; k < 44; k++) {
    const t = (k + 0.5) / 44 * Math.PI * 2, ct = Math.cos(t), st = Math.sin(t);
    const nx0 = ct / RING.rx, nz0 = st / RING.rz, nl = Math.hypot(nx0, nz0), nx = nx0 / nl, nz = nz0 / nl;
    const out = k % 2 ? 1 : -1, x = RING.cx + RING.rx * ct + nx * 5 * out, z = RING.cz + RING.rz * st + nz * 5 * out;
    if (blocked(x, z, 2)) continue;
    benches.push([x, z, Math.atan2(-nx * out, -nz * out)]);
    if (k % 3 === 0) bins.push([x - nz * 1.5, z + nx * 1.5]);
  }
  // набережная: скамейки между пальмами лицом к морю, урны
  for (let x = -890, k = 0; x <= 890; x += 40, k++) {
    const z = PROM_Z - 11 - 2.6;
    if (!freeSpot(x, z, 1.2) || coastD(x, z) < BW + 5) continue;
    benches.push([x, z, Math.PI]);
    if (k % 2 === 0) bins.push([x + 1.6, z]);
  }

  /* ---------- мини-карта ---------- */
  const MM = BOUNDS, m = mmCanvas(MM, 1024);
  const img = m.ctx.createImageData(1024, 1024);
  for (let py = 0; py < 1024; py++) for (let px = 0; px < 1024; px++) {
    const [x, z] = m.world(px, py), cd = coastD(x, z), qd = quayD(x, z), o = (py * 1024 + px) * 4;
    let c;
    if (cd < 0 || qd < 0) c = cd > -14 && qd > -6 ? [62, 140, 190] : [42, 111, 158];
    else if (cd < 16 || z < BEACH_Z) c = [226, 210, 164];
    else { const dt = district(x, z); c = dt === 'port' ? [150, 152, 150] : dt === 'park' ? (parkPath(x, z) < 3.5 ? [214, 196, 150] : [96, 152, 66]) : [112, 152, 76]; }
    img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
  }
  m.ctx.putImageData(img, 0, 0);
  m.ctx.fillStyle = '#5d6168';
  for (const s of segs) {
    if (s.kind === 'draw') { m.rect(s.x0 - 10, s.x0 + 10, 12, 40); m.rect(s.x0 - 10, s.x0 + 10, -40, -12); continue; }
    const hw = s.w / 2;
    m.rect(Math.min(s.x0, s.x1) - hw, Math.max(s.x0, s.x1) + hw, Math.min(s.z0, s.z1) - hw, Math.max(s.z0, s.z1) + hw);
  }
  for (const b of blocks) {
    if (b.type === 'park') continue;
    m.ctx.fillStyle = b.special && !b.special.fill ? '#cfc8b8' : { downtown: '#b4afa5', port: '#9a9a96', city: '#a8a59b', suburb: '#93ad7c', resort: '#cdbf9f', oldtown: '#bcae96' }[b.type];
    m.rect(b.x0, b.x1, b.z0, b.z1);
  }
  m.ctx.fillStyle = '#5d6168';
  for (const L of lanes) m.rect(L.x0, L.x1, L.z0, L.z1);
  m.ctx.strokeStyle = '#8c8173'; m.ctx.lineCap = 'round';
  for (const al of alleys) {
    m.ctx.lineWidth = al.w * m.sc; m.ctx.beginPath();
    al.pts.forEach(([x, z], k) => k ? m.ctx.lineTo(m.X(x), m.Z(z)) : m.ctx.moveTo(m.X(x), m.Z(z)));
    m.ctx.stroke();
  }
  m.ctx.fillStyle = '#6a9a48';
  for (const o of medians) m.rect(o.x - o.w / 2, o.x + o.w / 2, o.z - o.d / 2, o.z + o.d / 2);
  m.ctx.fillStyle = '#3a3e47';
  for (const s of solids) m.rect(s.minX, s.maxX, s.minZ, s.maxZ);
  // эстакада поверх зданий
  m.ctx.strokeStyle = '#d7d2c4'; m.ctx.lineWidth = OV.W * m.sc; m.ctx.lineJoin = 'round';
  m.ctx.beginPath(); m.ctx.moveTo(m.X(-OV.X), m.Z(OV.Z0));
  for (const p of [[-OV.X, OV.Z - OV.R], ...ovArcs[0], [OV.X - OV.R, OV.Z], ...ovArcs[1], [OV.X, OV.Z0]]) m.ctx.lineTo(m.X(p[0]), m.Z(p[1]));
  m.ctx.stroke();
  // уникальные объекты: r — прямоугольник, c — круг, e — эллипс, w — деревянный настил
  for (const [t, x, z, a, b2] of mmShapes) {
    m.ctx.fillStyle = t === 'w' ? '#a8865c' : t === 'c' && a < 5 ? '#6a9a48' : '#3a3e47';
    if (t === 'c') m.dot(x, z, a * m.sc);
    else if (t === 'e') { m.ctx.beginPath(); m.ctx.ellipse(m.X(x), m.Z(z), a * m.sc, b2 * m.sc, 0, 0, Math.PI * 2); m.ctx.fill(); }
    else m.rect(x - a / 2, x + a / 2, z - b2 / 2, z + b2 / 2);
  }
  m.ctx.fillStyle = '#4b8bc0'; m.dot(PC[0], PC[1], 8 * m.sc);
  m.ctx.fillStyle = '#e8402f'; m.dot(lh[0], lh[1], 6 * m.sc);

  return { WATER, BOUNDS, CURB, CANAL, BASIN, PARK, PC, PROM_Z, BEACH_Z, BRIDGES, DRAW_X, coastD, quayD, district, ground, parkPath, blockAt,
    OV, ovRuns, ovPillars, litNodes, lanes, alleys, medians, landmarks, domes, pyramids, rtanks, helipads, segs, roadSegs, nodes: [...nodes.values()], blocks, parkBlock, towers, caps, units, slants, spires, plain, roofs, neon, pools, containers, solids,
    trees, palms, slabs, lamps, umbrellas, rails, cranes, deckPlan, lighthouse: lh, minimap: m.c, mmExt: MM, mmBg: '#2a6f9e',
    hydrants, signs, tables, chairs, benches, bins, cafeColors: CAFE_COL };
}

/* =====================================================================
   ТЕКСТУРЫ ДОРОГ (Canvas)
   ===================================================================== */
const ROAD_TILE = 12;   // метров дороги на один повтор текстуры разметки
function asphaltCanvas(w, h, base = '#3d4148', dots = 0.12) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, w, h);
  const n = Math.floor(w * h * dots);
  for (let i = 0; i < n; i++) {
    const v = (Math.random() - 0.5) * 0.16;
    x.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
    x.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  return [c, x];
}
function canvasTex(c, wrapS = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = wrapS ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}
// разметка полос: u — поперёк дороги (0…1 = вся ширина W), v — вдоль (ROAD_TILE м)
function laneTexture(W, type) {
  const PX = 512, [c, x] = asphaltCanvas(PX, PX), k = PX / W, vk = PX / ROAD_TILE;
  const line = (u, wM, color, dash) => {
    x.fillStyle = color;
    if (!dash) x.fillRect((u - wM / 2) * k, 0, wM * k, PX);
    else for (let v = 0; v < ROAD_TILE; v += 6) x.fillRect((u - wM / 2) * k, v * vk, wM * k, 3 * vk);
  };
  const WHITE = '#e9e9e2', YEL = '#e8b923';
  line(0.45, 0.15, WHITE); line(W - 0.45, 0.15, WHITE);              // края
  if (type === 'street') line(W / 2, 0.14, WHITE, true);             // прерывистая по центру
  else {
    line(W / 2 - 0.18, 0.13, YEL); line(W / 2 + 0.18, 0.13, YEL);    // двойная сплошная
    const lane = (W / 2 - 0.5) / 2;
    line(W / 2 - lane, 0.13, WHITE, true); line(W / 2 + lane, 0.13, WHITE, true);
  }
  return canvasTex(c, false);
}
// «зебра»: одна полоса + промежуток (повторяется поперёк дороги каждые 1,8 м)
function zebraTexture() {
  const [c, x] = asphaltCanvas(64, 128);
  x.fillStyle = '#ecece6'; x.fillRect(4, 8, 28, 112);
  return canvasTex(c);
}
function hazardTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#f2c230'; x.fillRect(0, 0, 64, 64);
  x.fillStyle = '#1b1b1b';
  for (let i = -64; i < 128; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 16, 0); x.lineTo(i + 80, 64); x.lineTo(i + 64, 64); x.fill(); }
  const t = canvasTex(c); t.repeat.set(1, 1);
  return t;
}
// дорожные знаки в один ряд (по 128 px): 0 — «Стоп», 1 — «Уступи дорогу», 2 — «40», 3 — парковка, 4 — пешеходный переход.
// Вне формы знака — прозрачно (alphaTest вырезает силуэт).
const SIGN_N = 5;
function signAtlas() {
  const S = 128, c = document.createElement('canvas'); c.width = S * SIGN_N; c.height = S;
  const x = c.getContext('2d');
  const poly = (cx, cy, r, n, rot) => { x.beginPath(); for (let k = 0; k < n; k++) { const a = rot + k * Math.PI * 2 / n; x.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a)); } x.closePath(); };
  const text = (t, cx, cy, size, col) => { x.fillStyle = col; x.font = `bold ${size}px Arial, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(t, cx, cy); };
  // «Стоп»: красный восьмиугольник с белой каймой
  poly(64, 64, 62, 8, Math.PI / 8); x.fillStyle = '#fff'; x.fill();
  poly(64, 64, 55, 8, Math.PI / 8); x.fillStyle = '#c8201e'; x.fill();
  text('STOP', 64, 66, 32, '#fff');
  // «Уступи дорогу»: перевёрнутый треугольник
  x.save(); x.translate(S, 0);
  poly(64, 52, 66, 3, Math.PI / 2); x.fillStyle = '#c8201e'; x.fill();
  poly(64, 52, 42, 3, Math.PI / 2); x.fillStyle = '#fff'; x.fill();
  x.restore();
  // ограничение скорости
  x.save(); x.translate(S * 2, 0);
  x.beginPath(); x.arc(64, 64, 62, 0, Math.PI * 2); x.fillStyle = '#c8201e'; x.fill();
  x.beginPath(); x.arc(64, 64, 48, 0, Math.PI * 2); x.fillStyle = '#fff'; x.fill();
  text('40', 64, 67, 52, '#111');
  x.restore();
  // парковка
  x.save(); x.translate(S * 3, 0);
  x.fillStyle = '#fff'; x.fillRect(4, 4, 120, 120); x.fillStyle = '#1f5fbf'; x.fillRect(10, 10, 108, 108);
  text('P', 64, 68, 84, '#fff');
  x.restore();
  // пешеходный переход: синий квадрат, белый треугольник, «зебра»
  x.save(); x.translate(S * 4, 0);
  x.fillStyle = '#fff'; x.fillRect(4, 4, 120, 120); x.fillStyle = '#1f5fbf'; x.fillRect(10, 10, 108, 108);
  poly(64, 74, 50, 3, -Math.PI / 2); x.fillStyle = '#fff'; x.fill();
  x.fillStyle = '#111'; for (let k = 0; k < 4; k++) x.fillRect(38 + k * 14, 86, 8, 12);
  x.beginPath(); x.arc(64, 52, 6, 0, Math.PI * 2); x.fill(); x.fillRect(60, 58, 8, 22);
  x.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}
// материал знака: номер знака в атласе берётся из атрибута экземпляра aSign.
// back — оборотная сторона: серая, но с тем же силуэтом (из альфа-канала атласа)
function signMaterial(tex, back) {
  const m = new THREE.MeshStandardMaterial(back ? { color: 0x8a9098, map: tex, alphaTest: 0.5, roughness: 0.5, metalness: 0.5 } : { map: tex, alphaTest: 0.5, roughness: 0.55 });
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aSign;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>\nvMapUv.x = (vMapUv.x + aSign) / ${SIGN_N}.0;`);
    if (back) sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', 'diffuseColor.a *= texture2D( map, vMapUv ).a;');
  };
  m.customProgramCacheKey = () => back ? 'sign-back' : 'sign-front';
  return m;
}
function pavingTexture() {
  const [c, x] = asphaltCanvas(128, 128, '#b9b4a8', 0.08);
  x.strokeStyle = 'rgba(0,0,0,0.18)'; x.lineWidth = 2;
  for (let i = 0; i <= 128; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 128); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(128, i); x.stroke(); }
  return canvasTex(c);
}
function ribTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 8;
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 64, 8);
  x.fillStyle = 'rgba(0,0,0,0.22)'; for (let i = 0; i < 64; i += 4) x.fillRect(i, 0, 1.5, 8);
  return canvasTex(c);
}

// Плоские прямоугольники (дороги, переходы, тротуары) сливаются в одну геометрию на чанк и материал.
// mode: 'lane' — разметка вдоль, 'zebra' — поперечные полосы, 'world' — текстура по мировым координатам
function flatChunks(group, mat, quads, shadow = false) {
  for (const arr of chunkBuckets(quads, q => [q.cx, q.cz])) {
    const P = [], N = [], U = [], I = [];
    arr.forEach((q, k) => {
      const hl = q.len / 2, hw = q.wid / 2;
      for (const [a, l] of [[-hw, -hl], [hw, -hl], [hw, hl], [-hw, hl]]) {
        const x = q.dir === 'z' ? q.cx + a : q.cx + l, z = q.dir === 'z' ? q.cz + l : q.cz - a;
        P.push(x, q.y, z); N.push(0, 1, 0);
        if (q.mode === 'lane') U.push((a + hw) / q.wid, (l + hl) / ROAD_TILE);
        else if (q.mode === 'zebra') U.push((a + hw) / 1.8, (l + hl) / q.len);
        else U.push(x / (q.tile || 8), z / (q.tile || 8));
      }
      const o = k * 4; I.push(o, o + 2, o + 1, o, o + 3, o + 2);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    g.setIndex(I); g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, mat); mesh.receiveShadow = true; mesh.castShadow = shadow;
    group.add(mesh);
  }
}

/* =====================================================================
   КАРТА 1: ГОРОД НА ОСТРОВЕ — ПОСТРОЙКА
   ===================================================================== */
function buildCity(D) {
  const group = new THREE.Group(), grid = new StaticGrid(12);
  const box1 = UNIT_BOX;                                      // единичный куб с основанием в y = 0
  const colorBox = (m, i, o) => { setInst(m, i, o.x, o.y, o.z, o.w, o.h, o.d, o.ry || 0); m.setColorAt(i, _col.setHex(o.color)); };
  const xzOf = o => [o.x, o.z];
  // Разрушаемые объекты по чанкам: на каждый чанк — свои InstancedMesh и свой Breakables.
  // parts: [{ geo, mat, shadow, per, loc, attr: [имя, item => число] }], place(B, item, i) добавляет объект в B.
  const brks = [], dist = new DistCull();
  // opts.far — дальность прорисовки мелких объектов (м), см. DistCull в js/world.js
  function brkChunks(items, parts, opts, place, pad = 8) {
    const tris = parts.reduce((s, pt) => s + geoTris(pt.geo) * (pt.per || 1), 0);
    const whole = tris * items.length <= CHUNK_MIN_TRIS;      // одна InstancedMesh на весь город — дальность не нужна
    for (const arr of chunkOrAll(items, xzOf, tris)) {
      const meshes = parts.map(pt => {
        let g = pt.geo;
        if (pt.attr) { g = g.clone(); g.setAttribute(pt.attr[0], new THREE.InstancedBufferAttribute(new Float32Array(arr.map(pt.attr[1])), 1)); }
        const m = new THREE.InstancedMesh(g, pt.mat, arr.length * (pt.per || 1));
        m.castShadow = pt.shadow !== false; m.receiveShadow = true;
        return pt.per ? { mesh: m, per: pt.per, loc: pt.loc } : m;
      });
      const B = new Breakables(meshes, opts);
      arr.forEach((o, i) => place(B, o, i));
      for (const E of B.meshes) {
        const m = E.mesh; E.pad = pad;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
        m.computeBoundingSphere(); m.boundingSphere.radius += pad; group.add(m);
        if (opts.far && !whole) dist.add(m, opts.far);
      }
      brks.push(B);
    }
  }

  /* ---------- рельеф по чанкам ---------- */
  const nz = makeNoise(mulberry32(7));
  const cGrass = new THREE.Color(0x6c9a45), cPark = new THREE.Color(0x5f9d3f), cSand = new THREE.Color(0xe6d6a6), cPath = new THREE.Color(0xd2bf8e),
    cPort = new THREE.Color(0x8f918f), cDeep = new THREE.Color(0xb59f72), cQuay = new THREE.Color(0x5a5b58);
  const landMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  const P = D.PARK;
  for (let cx = -1050; cx < 1050; cx += CHUNK) for (let cz = -1050; cz < 1050; cz += CHUNK) {
    const fine = cx < P.x1 && cx + CHUNK > P.x0 && cz < P.z1 && cz + CHUNK > P.z0;
    const seg = fine ? 150 : 60;
    const g = new THREE.PlaneGeometry(CHUNK, CHUNK, seg, seg); g.rotateX(-Math.PI / 2); g.translate(cx + CHUNK / 2, 0, cz + CHUNK / 2);
    const pos = g.attributes.position, cols = new Float32Array(pos.count * 3);
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), z = pos.getZ(k), cd = D.coastD(x, z), qd = D.quayD(x, z), b = D.blockAt(x, z);
      let y = D.ground(x, z);
      // под дорогами и тротуарами рельеф чуть ниже: иначе трава проступает у бордюров и мерцает под плитами
      if (y >= 0 && z >= D.BEACH_Z && !(b && b.type === 'park')) y = -0.04;
      pos.setY(k, y);
      if (cd < 0) _col.copy(cDeep).multiplyScalar(clamp(1 + cd * 0.025, 0.45, 1));
      else if (qd < 0) _col.copy(cQuay);
      else if (cd < 16 || z < D.BEACH_Z) _col.copy(cSand).multiplyScalar(0.95 + nz(x / 9, z / 9) * 0.05);
      else {
        const dt = D.district(x, z);
        if (dt === 'port') _col.copy(cPort).multiplyScalar(0.95 + nz(x / 12, z / 12) * 0.05);
        else if (dt === 'park') { _col.copy(cPark).multiplyScalar(0.9 + nz(x / 14, z / 14) * 0.1); _col.lerp(cPath, 1 - smooth01((D.parkPath(x, z) - 2.6) / 1.4)); }
        else _col.copy(cGrass).multiplyScalar(0.88 + nz(x / 18, z / 18) * 0.12);
      }
      cols[k * 3] = _col.r; cols[k * 3 + 1] = _col.g; cols[k * 3 + 2] = _col.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    g.computeVertexNormals(); g.computeBoundingSphere();
    const land = new THREE.Mesh(g, landMat); land.receiveShadow = true; group.add(land);
  }
  const water = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), stdMat(0x2477b5, { roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.86 }));
  water.rotation.x = -Math.PI / 2; water.position.y = D.WATER; water.userData.dynamic = true; group.add(water);

  /* ---------- дороги ---------- */
  const mats = {
    street: new THREE.MeshStandardMaterial({ map: laneTexture(14, 'street'), roughness: 0.92 }),
    avenue: new THREE.MeshStandardMaterial({ map: laneTexture(20, 'avenue'), roughness: 0.92 }),
    prom: new THREE.MeshStandardMaterial({ map: laneTexture(22, 'avenue'), roughness: 0.92 }),
    zebra: new THREE.MeshStandardMaterial({ map: zebraTexture(), roughness: 0.9 }),
    plain: new THREE.MeshStandardMaterial({ map: noiseTexture(256, '#3d4148', 0.15, 9000), roughness: 0.92 }),
    paving: new THREE.MeshStandardMaterial({ map: pavingTexture(), roughness: 0.95 }),
  };
  mats.lane10 = new THREE.MeshStandardMaterial({ map: laneTexture(10, 'street'), roughness: 0.92 });
  mats.ov = new THREE.MeshStandardMaterial({ map: laneTexture(16, 'avenue'), roughness: 0.9 });
  const cobbleTex = cobbleTexture();
  mats.cobble = new THREE.MeshStandardMaterial({ map: cobbleTex, roughness: 0.95 });
  const Q = { street: [], avenue: [], prom: [], zebra: [], plain: [], paving: [], lane10: [], ov: [], cobble: [] };
  const Y = 0.02;
  for (const n of D.nodes) if (n.deg > 0) (n.cobble ? Q.cobble : Q.plain).push({ cx: n.x, cz: n.z, dir: 'z', len: n.wz, wid: n.wx, y: Y, mode: 'world', tile: n.cobble ? 4 : 8 });
  for (const s of D.roadSegs) {
    const along = s.dir === 'z', c = along ? s.x0 : s.z0;
    let a = (along ? s.z0 : s.x0) + (along ? s.a.wz : s.a.wx) / 2, b = (along ? s.z1 : s.x1) - (along ? s.b.wz : s.b.wx) / 2;
    if (s.cobble) {                 // брусчатка Старого города, без разметки
      Q.cobble.push({ cx: along ? c : (a + b) / 2, cz: along ? (a + b) / 2 : c, dir: s.dir, len: b - a, wid: s.w, y: Y, mode: 'world', tile: 4 });
      continue;
    }
    const put = (list, a0, a1, mode) => {
      const m = (a0 + a1) / 2;
      list.push({ cx: along ? c : m, cz: along ? m : c, dir: s.dir, len: a1 - a0, wid: s.w, y: Y, mode });
    };
    if (s.a.deg >= 3) { put(Q.zebra, a, a + 4, 'zebra'); a += 4; }
    if (s.b.deg >= 3) { put(Q.zebra, b - 4, b, 'zebra'); b -= 4; }
    put(s.w >= 22 ? Q.prom : s.w >= 20 ? Q.avenue : Q.street, a, b, 'lane');
  }
  // мощёные кромки канала и деревянный настил набережной
  for (const s of [1, -1]) for (let x = -1000; x < 1000; x += 50) {
    const z = s * (D.CANAL + 1.5);
    if (D.coastD(x, z) > 4 && D.coastD(x + 50, z) > 4) Q.paving.push({ cx: x + 25, cz: z, dir: 'x', len: 50, wid: 3, y: Y, mode: 'world', tile: 4 });
  }
  for (let x = -1000; x < 1000; x += 50) {
    const z = D.PROM_Z - 11 - 4;
    if (D.coastD(x, z) > D.CANAL + 2 && D.coastD(x + 50, z) > D.CANAL + 2) Q.paving.push({ cx: x + 25, cz: z, dir: 'x', len: 50, wid: 8, y: Y, mode: 'world', tile: 4 });
  }
  // проезды-срезки сквозь кварталы и разметка на эстакаде
  for (const L of D.lanes) Q.lane10.push({ cx: (L.x0 + L.x1) / 2, cz: (L.z0 + L.z1) / 2, dir: 'z', len: L.z1 - L.z0, wid: L.x1 - L.x0, y: Y, mode: 'lane' });
  for (const [x0, z0, x1, z1] of D.ovRuns)
    Q.ov.push({ cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, dir: x0 === x1 ? 'z' : 'x', len: Math.hypot(x1 - x0, z1 - z0), wid: D.OV.W, y: D.OV.H + 0.02, mode: 'lane' });
  for (const k of Object.keys(Q)) flatChunks(group, mats[k], Q[k]);
  // кривые переулки: лента по ломаной поверх тротуара
  for (const al of D.alleys) {
    const P = [], U = [], N = [], I = [], hw = al.w / 2, y = D.CURB + 0.035, pts = al.pts;
    pts.forEach(([x, z], i) => {
      const [ax, az] = pts[Math.max(0, i - 1)], [bx, bz] = pts[Math.min(pts.length - 1, i + 1)];
      const L = Math.hypot(bx - ax, bz - az) || 1, nx = (bz - az) / L, nzz = -(bx - ax) / L;
      for (const sd of [1, -1]) { const px = x + nx * hw * sd, pz = z + nzz * hw * sd; P.push(px, y, pz); U.push(px / 4, pz / 4); N.push(0, 1, 0); }
      if (i > 0) { const o = (i - 1) * 2; I.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
    });
    // треугольники должны смотреть вверх
    const e1x = P[3] - P[0], e1z = P[5] - P[2], e2x = P[6] - P[0], e2z = P[8] - P[2];
    if (e1z * e2x - e1x * e2z < 0) for (let k = 0; k < I.length; k += 3) [I[k + 1], I[k + 2]] = [I[k + 2], I[k + 1]];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I); g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, mats.cobble); mesh.receiveShadow = true; group.add(mesh);
  }
  // разделительные полосы бульваров: бордюр + газон, деревья добавлены в список деревьев
  instChunks(group, box1, stdMat(0xb7b2a6, { roughness: 0.9 }), D.medians, xzOf, (m, i, o) => setInst(m, i, o.x, 0, o.z, o.w, 0.32, o.d), false);
  instChunks(group, box1, stdMat(0x5f9a41, { roughness: 1 }), D.medians, xzOf, (m, i, o) => setInst(m, i, o.x, 0, o.z, o.w - 0.5, 0.36, o.d - 0.5), false);
  for (const o of D.medians) grid.addBox(o.x - o.w / 2, o.x + o.w / 2, o.z - o.d / 2, o.z + o.d / 2, 0.35);

  /* ---------- тротуары и газоны кварталов ---------- */
  instChunks(group, box1, stdMat(0xffffff, { roughness: 0.9 }), D.slabs, xzOf, colorBox, false);
  // площадь с фонтаном в центре парка
  {
    const [x, z] = D.PC, y = D.ground(x, z);
    const plaza = new THREE.Mesh(new THREE.CylinderGeometry(25, 25, 0.6, 40), new THREE.MeshStandardMaterial({ map: pavingTexture(), roughness: 0.95 }));
    plaza.position.set(x, y - 0.27, z); plaza.receiveShadow = true; group.add(plaza);
    const stone = stdMat(0xbab3a6), wMat = stdMat(0x4aa3d8, { roughness: 0.1, metalness: 0.2 });
    const f = new THREE.Group(); f.position.set(x, y, z);
    const parts = [[7, 7.3, 0.9, 32, stone, 0.45], [6.6, 6.6, 0.1, 32, wMat, 0.8], [0.8, 1.1, 3.2, 10, stone, 1.6], [2.4, 0.6, 0.5, 14, stone, 3.3], [0.35, 0.5, 2.0, 8, stone, 4.4], [1.2, 0.3, 0.3, 12, stone, 5.4]];
    for (const [rt, rb, h, seg, mat, yy] of parts) { const c = cyl(rt, rb, h, seg, mat, f); c.position.y = yy; c.receiveShadow = true; }
    group.add(f);
    grid.addCircle(x, z, 7.3, 1.4);
  }

  /* ---------- здания ---------- */
  const bMat = makeBuildingMaterial();
  const facade = o => o.st || 0;
  instChunks(group, box1, bMat, D.towers, xzOf, colorBox, true, facade);
  const slantGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  { const p = slantGeo.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) > 0.9 && p.getX(i) > 0) p.setY(i, 0.02); slantGeo.computeVertexNormals(); }
  instChunks(group, slantGeo, bMat, D.slants, xzOf, colorBox, true, facade);
  // купола, пирамидальные и вальмовые крыши, баки для воды, вертолётные площадки
  instChunks(group, new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), stdMat(0x6fae95, { metalness: 0.45, roughness: 0.5 }), D.domes, xzOf,
    (m, i, o) => setInst(m, i, o.x, o.y, o.z, o.r, o.r * 0.9, o.r));
  instChunks(group, new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0), stdMat(0xffffff, { roughness: 0.6, flatShading: true }), D.pyramids, xzOf, colorBox);
  const tankGeo = mergeGeometries([
    ...[[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]].map(([a, b]) => new THREE.BoxGeometry(0.16, 2, 0.16).translate(a, 1, b)),
    new THREE.CylinderGeometry(1.45, 1.45, 2.6, 14).translate(0, 3.3, 0), new THREE.ConeGeometry(1.55, 0.9, 14).translate(0, 5.05, 0)]);
  instChunks(group, tankGeo, stdMat(0x7a5a3c, { roughness: 0.85 }), D.rtanks, xzOf, (m, i, o) => setInst(m, i, o.x, o.y, o.z, o.s, o.s, o.s, o.x));
  instChunks(group, new THREE.CylinderGeometry(1, 1, 0.15, 32).translate(0, 0.075, 0), new THREE.MeshStandardMaterial({ map: helipadTexture(), roughness: 0.8 }), D.helipads, xzOf,
    (m, i, o) => setInst(m, i, o.x, o.y, o.z, o.r, 1, o.r), false);
  instChunks(group, box1, stdMat(0x5b6068, { roughness: 0.8 }), D.caps, xzOf, (m, i, o) => setInst(m, i, o.x, o.y, o.z, o.w, o.h, o.d));
  instChunks(group, box1, stdMat(0x9aa0a6, { roughness: 0.6, metalness: 0.3 }), D.units, xzOf, (m, i, o) => setInst(m, i, o.x, o.y, o.z, o.w, o.h, o.d));
  instChunks(group, new THREE.ConeGeometry(1, 1, 8).translate(0, 0.5, 0), stdMat(0xc9ced4, { metalness: 0.8, roughness: 0.3 }), D.spires, xzOf,
    (m, i, o) => setInst(m, i, o.x, o.y, o.z, o.r, o.h, o.r));
  instChunks(group, box1, stdMat(0xffffff, { roughness: 0.8 }), D.plain, xzOf, colorBox);
  const prismGeo = new THREE.CylinderGeometry(1, 1, 1, 3).rotateX(-Math.PI / 2).translate(0, 0.5, 0).scale(1 / Math.sqrt(3), 1 / 1.5, 1);
  instChunks(group, prismGeo, stdMat(0xffffff, { roughness: 0.75, flatShading: true }), D.roofs, xzOf, colorBox);
  instChunks(group, box1, new THREE.MeshBasicMaterial({ color: 0xffffff }), D.neon, xzOf, colorBox, false);
  instChunks(group, box1, stdMat(0x3fb7e8, { roughness: 0.05, metalness: 0.1 }), D.pools, xzOf, (m, i, o) => setInst(m, i, o.x, o.y, o.z, o.w, o.h + 0.05, o.d), false);
  for (const s of D.solids) grid.addBox(s.minX, s.maxX, s.minZ, s.maxZ, s.h);

  /* ---------- контейнеры ---------- */
  const contGeo = new THREE.BoxGeometry(12.2, 2.6, 2.44).translate(0, 1.3, 0);
  instChunks(group, contGeo, stdMat(0xffffff, { map: ribTexture(), roughness: 0.7, metalness: 0.2 }), D.containers, xzOf,
    (m, i, o) => { setInst(m, i, o.x, o.y, o.z, 1, 1, 1); m.setColorAt(i, _col.setHex(o.color)); });

  /* ---------- мосты, трамплины ---------- */
  const decks = new Decks();
  for (const p of D.deckPlan) {
    const o = { walk: p.walk, mat: p.mat, hidden: p.hidden };
    let p0 = p.p0, p1 = p.p1;
    if (p.ext) {      // удлинить плиту по оси на ext с каждого конца (стыки дуг)
      const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2], L = Math.hypot(dx, dz), k = p.ext / L;
      p0 = [p0[0] - dx * k, p0[1] - dy * k, p0[2] - dz * k]; p1 = [p1[0] + dx * k, p1[1] + dy * k, p1[2] + dz * k];
    }
    if (p.kind === 'wedge') decks.wedge(p0, p1, p.w, p.base, o); else decks.slab(p0, p1, p.w, p.t, o);
  }
  const haz = hazardTexture(); haz.repeat.set(4, 1);
  decks.build(group, {
    deck: stdMat(0x45494f, { roughness: 0.9 }), rail: stdMat(0xd8dde3, { metalness: 0.5, roughness: 0.4 }), steel: stdMat(0x5a7184, { metalness: 0.6, roughness: 0.5 }),
    hazard: stdMat(0xffffff, { map: haz, roughness: 0.6 }), tower: stdMat(0x8d8f93, { roughness: 0.85 }), wedge: stdMat(0xc96a2b, { roughness: 0.7 }),
    ramp: stdMat(0x9a978f, { roughness: 0.9 }), pier: stdMat(0x9b7b56, { roughness: 0.9 }), ovdeck: stdMat(0xa29f97, { roughness: 0.9, emissive: 0x3a3833 }),   // снизу на настил почти не падает свет — подсвечиваем
  });

  /* ---------- светофоры ---------- */
  // на каждом углу — столб с головой, обращённой к подъезжающим справа машинам (правостороннее движение).
  // Светофор сбивается; у сбитого лампы гаснут.
  const heads = [];
  for (const n of D.litNodes) {
    const ox = n.wx / 2 + 1.6, oz = n.wz / 2 + 1.6;
    heads.push({ x: n.x - ox, z: n.z - oz, axis: 'z', fx: 0, fz: -1, n }, { x: n.x + ox, z: n.z + oz, axis: 'z', fx: 0, fz: 1, n },
      { x: n.x - ox, z: n.z + oz, axis: 'x', fx: -1, fz: 0, n }, { x: n.x + ox, z: n.z - oz, axis: 'x', fx: 1, fz: 0, n });
  }
  const bulbLoc = [0, 1, 2].map(k => new THREE.Matrix4().makeTranslation(0, 4.33 - k * 0.4, 0.17));
  brkChunks(heads, [
    { geo: new THREE.CylinderGeometry(0.09, 0.11, 4.6, 6).translate(0, 2.3, 0), mat: stdMat(0x3a3e44, { metalness: 0.5, roughness: 0.5 }) },
    { geo: new THREE.BoxGeometry(0.42, 1.3, 0.3).translate(0, 3.9, 0), mat: stdMat(0x23262b, { roughness: 0.6 }) },
    { geo: new THREE.SphereGeometry(0.13, 10, 8), mat: new THREE.MeshBasicMaterial({ color: 0xffffff }), shadow: false, per: 3, loc: bulbLoc },
  ], { mass: 240, anchor: 2.5, minSpeed: 3, dmg: 0.4, cy: 2.5, lie: 1.52, kind: 'metal', far: 320 }, (B, h, i) => {
    h.y = D.ground(h.x, h.z);
    h.brk = B.add(grid, h.x, h.y, h.z, Math.atan2(h.fx, h.fz), 0.2, 4.6);
    h.bulbs = B.meshes[2].mesh; h.bi = i * 3;
  });
  // цвета ламп [красная, жёлтая, зелёная] для каждого сигнала; off — сбитый светофор
  const LIGHT_ON = { r: [0xff2a1a, 0x3a2a08, 0x0d2a12], y: [0x3a1410, 0xffc21a, 0x0d2a12], g: [0x3a1410, 0x3a2a08, 0x2aff5a], off: [0x2a1a18, 0x2a2418, 0x182a1c] };
  const updateLights = () => {
    for (const h of heads) {
      const st = h.brk.broken ? 'off' : trafficLight(h.n.x, h.n.z, h.axis, simTime);
      if (st === h.st) continue;
      h.st = st;
      for (let k = 0; k < 3; k++) h.bulbs.setColorAt(h.bi + k, _col.setHex(LIGHT_ON[st][k]));
      h.bulbs.instanceColor.needsUpdate = true;
    }
  };
  updateLights();

  /* ---------- уникальные объекты (js/maps/city-landmarks.js) ---------- */
  const marks = buildCityLandmarks(D.landmarks, { group, grid, decks, D });

  /* ---------- опоры эстакады ---------- */
  const OVH = D.OV.H - 1.2;
  instChunks(group, new THREE.CylinderGeometry(0.85, 1.0, 1, 12).translate(0, 0.5, 0), stdMat(0xa3a19a, { roughness: 0.9 }), D.ovPillars, xzOf,
    (m, i, o) => setInst(m, i, o.x, 0, o.z, 1, OVH, 1));
  // ригель поперёк настила
  instChunks(group, box1, stdMat(0x9c9a93, { roughness: 0.9 }), D.ovPillars, xzOf,
    (m, i, o) => setInst(m, i, o.x, OVH - 1.1, o.z, D.OV.W - 2, 1.1, 2.2, o.along === 'z' ? 0 : o.along === 'x' ? Math.PI / 2 : Math.PI / 4));
  for (const p of D.ovPillars) grid.addCircle(p.x, p.z, 1.0, OVH - 0.3);

  /* ---------- ограждение канала ---------- */
  const railItems = D.rails.map(([x, z]) => ({ x, y: 0, z }));
  instChunks(group, box1, stdMat(0xd8dde3, { metalness: 0.5, roughness: 0.4 }), railItems, xzOf, (m, i, o) => setInst(m, i, o.x, 0.75, o.z, 20, 0.14, 0.14));
  instChunks(group, box1, stdMat(0x7f858c, { metalness: 0.4, roughness: 0.5 }), railItems, xzOf, (m, i, o) => setInst(m, i, o.x, 0, o.z, 20, 0.12, 0.3));
  for (const [x, z] of D.rails) grid.addBox(x - 10, x + 10, z - 0.25, z + 0.25, 1.0);
  // стенки набережной канала и гавани
  const walls = [];
  for (const s of [1, -1]) for (let x = -1000; x < 1000; x += 40) if (D.coastD(x + 20, s * D.CANAL) > 0) walls.push({ x: x + 20, z: s * (D.CANAL - 0.5), w: 40, d: 1 });
  const B = D.BASIN;
  for (let x = -1000; x < B.x1; x += 40) for (const z of [B.z0 - 0.5, B.z1 + 0.5]) { const xx = Math.min(x + 20, B.x1 - 20); if (D.coastD(xx, z) > 0) walls.push({ x: xx, z: z + (z < B.z0 ? 1 : -1), w: 40, d: 1 }); }
  walls.push({ x: B.x1 - 0.5, z: (B.z0 + B.z1) / 2, w: 1, d: B.z1 - B.z0 });
  instChunks(group, box1, stdMat(0x8b877d, { roughness: 0.95 }), walls, xzOf, (m, i, o) => setInst(m, i, o.x, -6.5, o.z, o.w, 6.5, o.d), false);

  /* ---------- деревья и пальмы ---------- */
  // ломаются только на скорости (порог растёт с размером дерева) и гасят заметную часть скорости машины
  const trees = D.trees.map(([x, z, s, ty], i) => ({ x, z, s, i, y: ty ?? Math.max(0, D.ground(x, z)) }));
  brkChunks(trees, [
    { geo: new THREE.CylinderGeometry(0.22, 0.3, 2.4, 6).translate(0, 1.2, 0), mat: stdMat(0x6b4a2f, { flatShading: true }) },
    { geo: new THREE.IcosahedronGeometry(1.9, 0), mat: stdMat(0xffffff, { flatShading: true, roughness: 0.9 }) },
  ], { mass: 350, anchor: 3.5, minSpeed: 6, dmg: 0.55, cy: 2.6, lie: 1.1, kind: 'wood' }, (B, o, i) => {
    _cq.setFromAxisAngle(Y_AXIS, o.i * 1.3);
    const crown = new THREE.Matrix4().compose(_cv.set(0, 3.5, 0), _cq, _cs.set(1.1, 0.9 + (o.i % 5) * 0.06, 1.1));
    B.add(grid, o.x, o.y, o.z, 0, 0.4 * o.s + 0.1, 6, { s: o.s, loc: [null, crown] });
    B.meshes[1].mesh.setColorAt(i, _col.setHSL(0.25 + (o.i % 7) * 0.012, 0.5, 0.26 + (o.i % 3) * 0.04));
  }, 12);
  const palms = D.palms.map(([x, z, s, r], i) => ({ x, z, s, r, i, y: D.ground(x, z) - 0.1, lx: Math.sin(r) * 0.12, lz: Math.cos(r) * 0.12 }));
  const frondGeo = mergeGeometries(Array.from({ length: 8 }, (_, k) =>
    new THREE.BoxGeometry(0.9, 0.06, 3.6).translate(0, 0, 1.8).rotateX(0.38 + (k % 2) * 0.2).rotateY(k * Math.PI / 4).translate(0, 7.4, 0)));
  brkChunks(palms, [
    { geo: new THREE.CylinderGeometry(0.17, 0.3, 7.5, 7).translate(0, 3.75, 0), mat: stdMat(0x8a6a48, { flatShading: true }) },
    { geo: frondGeo, mat: stdMat(0xffffff, { flatShading: true, roughness: 0.85 }) },
  ], { mass: 260, anchor: 2.6, minSpeed: 5, dmg: 0.5, cy: 4, lie: 1.45, kind: 'wood' }, (B, o, i) => {
    B.add(grid, o.x, o.y, o.z, o.r, 0.32 * o.s, 7, { s: o.s, rx: o.lx, rz: o.lz });
    B.meshes[1].mesh.setColorAt(i, _col.setHSL(0.28 + (o.i % 5) * 0.015, 0.55, 0.28 + (o.i % 3) * 0.03));
  }, 14);

  /* ---------- сбиваемые мелкие объекты ---------- */
  // фонари
  const lamps = D.lamps.map(([x, z, ry]) => ({ x, z, ry }));
  brkChunks(lamps, [
    { geo: new THREE.CylinderGeometry(0.1, 0.15, 7, 6).translate(0, 3.5, 0), mat: stdMat(0x50555c, { metalness: 0.6, roughness: 0.4 }) },
    { geo: new THREE.BoxGeometry(2.2, 0.16, 0.4).translate(1.0, 7, 0), mat: stdMat(0x6a7078, { metalness: 0.5, roughness: 0.4 }) },
    { geo: new THREE.BoxGeometry(0.62, 0.06, 0.3).translate(1.75, 6.9, 0), mat: Sky.mats.bulb, shadow: false },      // плафон: ночью светится
  ], { mass: 200, anchor: 2, minSpeed: 2.5, dmg: 0.4, cy: 3.5, lie: 1.5, kind: 'metal', far: 320 }, (B, o) => { o.brk = B.add(grid, o.x, D.ground(o.x, o.z), o.z, o.ry, 0.22, 7); }, 10);
  // ночные огни фонарей: ореол у плафона (Points — всегда лицом к камере) и световое пятно на асфальте.
  // Видны только вечером и ночью; у сбитого фонаря гаснут (проверка раз в 0,4 с).
  const nightGroup = new THREE.Group(); nightGroup.visible = false; group.add(nightGroup);
  const lampFx = [];
  for (const arr of chunkBuckets(lamps, xzOf)) {
    const pos = new Float32Array(arr.length * 3);
    const pools = new THREE.InstancedMesh(FLAT_QUAD, Sky.mats.pool, arr.length);
    arr.forEach((o, i) => {
      o.bx = o.x + Math.cos(o.ry) * 1.75; o.bz = o.z - Math.sin(o.ry) * 1.75; o.by = D.ground(o.x, o.z) + 6.85;
      pos.set([o.bx, o.by, o.bz], i * 3);
      setInst(pools, i, o.bx, D.ground(o.bx, o.bz) + 0.09, o.bz, 13, 1, 13);
    });
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const halos = new THREE.Points(geo, Sky.mats.halo);
    pools.receiveShadow = false; pools.renderOrder = 1; pools.computeBoundingSphere(); halos.renderOrder = 2;
    nightGroup.add(pools, halos);
    lampFx.push({ arr, pools, pos: geo.attributes.position, geo });
  }
  let lampCheck = 0;
  const updateLampFx = dt => {
    if (!nightGroup.visible || (lampCheck -= dt) > 0) return;
    lampCheck = 0.4;
    for (const F of lampFx) {
      let ch = false;
      F.arr.forEach((o, i) => {
        const dark = o.brk.broken;
        if (dark === !!o.dark) return;
        o.dark = dark; ch = true;
        F.pos.setY(i, dark ? -1e4 : o.by);
        setInst(F.pools, i, o.bx, D.ground(o.bx, o.bz) + 0.09, o.bz, dark ? 0 : 13, 1, dark ? 0 : 13);
      });
      if (ch) { F.pos.needsUpdate = true; F.pools.instanceMatrix.needsUpdate = true; }
    }
  };
  // пляжные и уличные зонтики
  const UMB = [0xe8402f, 0x2f8fe8, 0xf2c230, 0x38b26a, 0xf07ab0, 0xffffff];
  const umbrellas = D.umbrellas.map(([x, z, c]) => ({ x, z, c }));
  brkChunks(umbrellas, [
    { geo: new THREE.CylinderGeometry(0.05, 0.05, 2.4, 5).translate(0, 1.2, 0), mat: stdMat(0xe8e8e8) },
    { geo: new THREE.ConeGeometry(1.5, 0.6, 10).translate(0, 2.5, 0), mat: stdMat(0xffffff, { roughness: 0.8 }) },
  ], { mass: 8, light: true, cy: 1.6, lie: 1.35, kind: 'plastic', far: 240 }, (B, o, i) => {
    B.add(grid, o.x, D.ground(o.x, o.z) - 0.2, o.z, 0, 0.3, 2.6);
    B.meshes[1].mesh.setColorAt(i, _col.setHex(UMB[o.c]));
  });
  // пожарные гидранты: сбитый гидрант бьёт фонтаном воды
  const geysers = [];
  const hydrants = D.hydrants.map(([x, z]) => ({ x, z }));
  brkChunks(hydrants, [{
    geo: mergeGeometries([
      new THREE.CylinderGeometry(0.2, 0.2, 0.06, 10).translate(0, 0.03, 0), new THREE.CylinderGeometry(0.13, 0.15, 0.55, 10).translate(0, 0.3, 0),
      new THREE.SphereGeometry(0.14, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.57, 0),
      new THREE.CylinderGeometry(0.05, 0.05, 0.42, 6).rotateZ(Math.PI / 2).translate(0, 0.4, 0), new THREE.CylinderGeometry(0.06, 0.06, 0.2, 6).rotateX(Math.PI / 2).translate(0, 0.4, 0.12)]),
    mat: stdMat(0xc8281e, { roughness: 0.5, metalness: 0.3 }), shadow: false,
  }], { mass: 110, anchor: 1.2, minSpeed: 2, dmg: 0.25, cy: 0.3, lie: 1.5, light: true, kind: 'metal', far: 170,
    onBreak: it => { geysers.push({ x: it.x, y: it.y, z: it.z, t: 7, acc: 0 }); if (geysers.length > 3) geysers.shift(); },
  }, (B, o) => B.add(grid, o.x, D.ground(o.x, o.z), o.z, 0, 0.2, 0.8));
  const updateGeysers = dt => {
    for (let k = geysers.length - 1; k >= 0; k--) {
      const g = geysers[k];
      g.t -= dt; g.acc += dt * 26 * Math.min(1, g.t / 2);
      for (; g.acc >= 1; g.acc--) smoke.spawn(g.x + rand(-0.1, 0.1), g.y + 0.3, g.z + rand(-0.1, 0.1), rand(-0.7, 0.7), rand(8, 11.5), rand(-0.7, 0.7), 0.25, 1.0, 1.3, 0xbfdcf2, 0.5, 14);
      if (g.t <= 0) geysers.splice(k, 1);
    }
  };
  // дорожные знаки: атлас из 5 знаков, номер знака — атрибут экземпляра aSign
  const signTex = signAtlas();
  const signs = D.signs.map(([x, z, ry, t]) => ({ x, z, ry, t }));
  brkChunks(signs, [
    { geo: new THREE.CylinderGeometry(0.035, 0.035, 2.6, 6).translate(0, 1.3, -0.04), mat: stdMat(0x8c9198, { metalness: 0.6, roughness: 0.4 }), shadow: false },
    { geo: new THREE.PlaneGeometry(0.72, 0.72).translate(0, 2.25, 0), mat: signMaterial(signTex, false), attr: ['aSign', o => o.t], shadow: false },
    { geo: new THREE.PlaneGeometry(0.72, 0.72).rotateY(Math.PI).translate(0, 2.25, -0.012), mat: signMaterial(signTex, true), attr: ['aSign', o => o.t], shadow: false },
  ], { mass: 25, anchor: 0.5, cy: 1.4, lie: 1.52, light: true, kind: 'metal', far: 240 }, (B, o) => B.add(grid, o.x, D.ground(o.x, o.z), o.z, o.ry, 0.1, 2.7));
  // летние кафе: столики и стулья (цвета — свои у каждого кафе)
  const tables = D.tables.map(([x, z, c]) => ({ x, z, c })), chairs = D.chairs.map(([x, z, ry, c]) => ({ x, z, ry, c }));
  brkChunks(tables, [{
    geo: mergeGeometries([new THREE.CylinderGeometry(0.45, 0.45, 0.04, 16).translate(0, 0.74, 0), new THREE.CylinderGeometry(0.03, 0.03, 0.72, 6).translate(0, 0.37, 0),
      new THREE.CylinderGeometry(0.24, 0.26, 0.03, 12).translate(0, 0.015, 0)]),
    mat: stdMat(0xffffff, { roughness: 0.5, metalness: 0.2 }),
  }], { mass: 18, cy: 0.45, lie: 1.25, light: true, kind: 'plastic', far: 170 }, (B, o, i) => {
    B.add(grid, o.x, D.ground(o.x, o.z), o.z, 0, 0.45, 0.8);
    B.meshes[0].mesh.setColorAt(i, _col.setHex(D.cafeColors[o.c][0]));
  });
  brkChunks(chairs, [{
    geo: mergeGeometries([new THREE.BoxGeometry(0.42, 0.04, 0.42).translate(0, 0.45, 0), new THREE.BoxGeometry(0.42, 0.4, 0.04).translate(0, 0.67, -0.19),
      ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => new THREE.BoxGeometry(0.035, 0.45, 0.035).translate(a * 0.18, 0.225, b * 0.18))]),
    mat: stdMat(0xffffff, { roughness: 0.6 }), shadow: false,
  }], { mass: 6, cy: 0.45, lie: 1.2, light: true, kind: 'plastic', far: 170 }, (B, o, i) => {
    B.add(grid, o.x, D.ground(o.x, o.z), o.z, o.ry, 0.28, 0.9);
    B.meshes[0].mesh.setColorAt(i, _col.setHex(D.cafeColors[o.c][1]));
  });
  // скамейки и урны в парке и на набережной
  const benches = D.benches.map(([x, z, ry]) => ({ x, z, ry })), bins = D.bins.map(([x, z]) => ({ x, z }));
  brkChunks(benches, [{
    geo: mergeGeometries([new THREE.BoxGeometry(1.7, 0.06, 0.44).translate(0, 0.44, 0), new THREE.BoxGeometry(1.7, 0.36, 0.05).translate(0, 0.72, -0.21),
      ...[-0.7, 0.7].map(a => new THREE.BoxGeometry(0.07, 0.44, 0.44).translate(a, 0.22, 0))]),
    mat: stdMat(0x8a5a33, { roughness: 0.85 }),
  }], { mass: 70, anchor: 0.6, cy: 0.45, lie: 1.3, light: true, kind: 'wood', far: 170 }, (B, o) => B.add(grid, o.x, D.ground(o.x, o.z), o.z, o.ry, 0.6, 0.9));
  brkChunks(bins, [{ geo: new THREE.CylinderGeometry(0.26, 0.22, 0.85, 10).translate(0, 0.425, 0), mat: stdMat(0x2f4f3a, { roughness: 0.6, metalness: 0.3 }), shadow: false }],
    { mass: 20, cy: 0.42, lie: 1.57, light: true, kind: 'plastic', far: 170 }, (B, o) => B.add(grid, o.x, D.ground(o.x, o.z), o.z, 0, 0.28, 0.9));

  /* ---------- маяк ---------- */
  {
    const [x, z] = D.lighthouse, y = D.ground(x, z), g = new THREE.Group(); g.position.set(x, y, z);
    for (let k = 0; k < 4; k++) { const c = cyl(2.6 - k * 0.25, 2.85 - k * 0.25, 4.5, 16, stdMat(k % 2 ? 0xf2f2f2 : 0xd23a2f), g); c.position.y = 2.25 + k * 4.5; }
    const gal = cyl(2.4, 2.4, 0.35, 16, MAT.trim, g); gal.position.y = 18.2;
    const lan = cyl(1.3, 1.3, 2, 10, MAT.head, g); lan.position.y = 19.4;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.8, 1.8, 10), stdMat(0xd23a2f)); cap.position.y = 21.3; g.add(cap);
    group.add(g);
    grid.addCircle(x, z, 3, 22);
  }

  // склейка статичных мешей по чанкам и заморозка матриц (js/world.js)
  optimizeStatic(group);

  /* ---------- интерфейс мира ---------- */
  const roads = D.roadSegs.filter(s => !s.ramp);        // на пандусах эстакады не респауним
  const total = roads.reduce((s, r) => s + Math.abs(r.x1 - r.x0) + Math.abs(r.z1 - r.z0), 0);
  const surface = (x, z, y = Infinity) => Math.max(D.ground(x, z), decks.surface(x, z, y));
  return {
    id: 'city', group, grid, decks, barrels: [], ground: D.ground, surface, water: D.WATER, bounds: D.BOUNDS, hfStep: 2,
    sky: 0x9fd3f7, fog: [280, 760], coinCount: 100,
    // старт на набережной канала у подножия западного пандуса, лицом к эстакаде (на север);
    // направо по набережной — разводной мост-трамплин
    spawns: [[-316.5, 38, 0], [-323.5, 38, 0]],
    // ближайшая точка на дороге; направление — к центру острова
    roadPoint(x, z, p) {
      let best = null, bd = Infinity;
      for (const s of roads) {
        const px = s.dir === 'z' ? s.x0 : clamp(x, Math.min(s.x0, s.x1), Math.max(s.x0, s.x1));
        const pz = s.dir === 'z' ? clamp(z, Math.min(s.z0, s.z1), Math.max(s.z0, s.z1)) : s.z0;
        const d = (px - x) ** 2 + (pz - z) ** 2;
        if (d < bd) { bd = d; best = [px, pz, s]; }
      }
      const [px, pz, s] = best;
      const h = s.dir === 'z' ? (pz > 0 ? Math.PI : 0) : (px > 0 ? -Math.PI / 2 : Math.PI / 2);
      const lane = p === 0 ? 3.5 : -3.5;
      return [px + Math.cos(h) * lane, pz - Math.sin(h) * lane, h];
    },
    coinSpot() {
      const r = Math.random();
      if (r < 0.1) {          // на дорожках парка
        const t = Math.random() * Math.PI * 2;
        return [D.PC[0] + Math.cos(t) * 200, D.PC[1] + Math.sin(t) * 125];
      }
      if (r < 0.18) {         // на пляже
        for (let k = 0; k < 30; k++) { const x = rand(-850, 850), z = rand(D.BEACH_Z - 90, D.BEACH_Z - 8); if (D.coastD(x, z) > 18) return [x, z]; }
      }
      if (r < 0.26) {         // на эстакаде
        const [x0, z0, x1, z1] = D.ovRuns[Math.floor(Math.random() * D.ovRuns.length)], t = Math.random(), o = rand(-5, 5);
        return x0 === x1 ? [x0 + o, lerp(z0, z1, t), D.OV.H] : [lerp(x0, x1, t), z0 + o, D.OV.H];
      }
      if (r < 0.31 && D.lanes.length) {   // в проездах под арками
        const L = D.lanes[Math.floor(Math.random() * D.lanes.length)];
        return [(L.x0 + L.x1) / 2 + rand(-2, 2), rand(L.z0 + 3, L.z1 - 3)];
      }
      if (r < 0.36 && D.alleys.length) {  // в кривых переулках
        const al = D.alleys[Math.floor(Math.random() * D.alleys.length)], p = al.pts[2 + Math.floor(Math.random() * (al.pts.length - 4))];
        return [p[0], p[1], D.CURB];
      }
      let a = Math.random() * total;
      for (const s of roads) {
        const L = Math.abs(s.x1 - s.x0) + Math.abs(s.z1 - s.z0);
        if (a > L) { a -= L; continue; }
        const t = a / L, o = rand(-s.w / 2 + 2, s.w / 2 - 2);
        return s.dir === 'z' ? [s.x0 + o, lerp(s.z0, s.z1, t)] : [lerp(s.x0, s.x1, t), s.z0 + o];
      }
      return [0, 170];
    },
    occludes(x, y, z) { return grid.query(x, x, z, z).some(o => o.box && y < o.h && x > o.minX && x < o.maxX && z > o.minZ && z < o.maxZ); },
    minimap: D.minimap, mmExt: D.mmExt, mmBg: D.mmBg,
    breakables: brks,
    reset() { for (const b of brks) b.reset(); geysers.length = 0; },
    update(dt, t) { water.position.y = D.WATER + Math.sin(t * 0.8) * 0.03; for (const b of brks) b.update(dt); updateGeysers(dt); marks.update(dt, t); updateLights(); updateLampFx(dt); },
    // вечером и ночью включаются огни фонарей (js/sky.js)
    setNight(k) { nightGroup.visible = k > 0; lampCheck = 0; },
    // перед отрисовкой каждой половины экрана: дальность прорисовки мелочи от камеры (x, z)
    cullView(x, z) { dist.update(x, z); },
    // дорожный граф для трафика (js/traffic.js)
    trafficData: { nodes: D.nodes, segs: D.segs, rounds: D.landmarks.filter(l => l.kind === 'roundabout'), lit: new Set(D.litNodes.map(n => n.x + ',' + n.z)) },
  };
}
