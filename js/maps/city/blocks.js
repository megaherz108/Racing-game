// Город — РАСКЛАДКА: застройка кварталов.
// cityPlanKit — списки объектов (towers, trees, solids…), хелперы (tower, solid, split, lotBlocked…), палитры PAL,
//   резерв кварталов под уникальные объекты (reserve) и функции застройки по районам: fillDowntown, fillCity,
//   fillOld (Старый город), fillPort, fillResort, fillSuburb, arch (здание-арка над срезкой).
// cityPlanFill — проходит по кварталам: тротуары, арки, уникальные объекты, вызов fill* по типу района.
// ВАЖНО: город детерминирован — зерно mulberry32 в cityPlanBase(), вызовы R() идут строго по порядку этапов.
//   Новый вызов R() или перестановка кода в середине раскладки меняет весь город после этого места.
//   Проверка: __game.fingerprint('city').dataHash до и после правки (js/selftest.js).
// Порядок этапов — в cityData() (js/maps/city/plan.js).
// Определяет: cityPlanKit, cityPlanFill.
// Использует: clamp, lerp (js/core.js); FACADE (js/world.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

function cityPlanKit(C) {
  const { R, pick, CURB, quayD, blockAt } = C;
  /* ---------- наполнение кварталов ---------- */
  const towers = [], caps = [], units = [], slants = [], spires = [], plain = [], roofs = [], neon = [], pools = [];
  const containers = [], solids = [], trees = [], palms = [], slabs = [], lamps = [], umbrellas = [];
  const domes = [], pyramids = [], rtanks = [], helipads = [], medians = [], alleys = [], landmarks = [], mmShapes = [];
  const keepOut = [];                                         // зоны, где не ставим фонари и деревья
  const avoid = [];                                           // зоны, где не ставим здания (эстакада, арки, проезды)
  // настилы: { kind: 'slab'|'wedge', p0, p1 ([x, y, z] верхней грани по оси), w, t, walk, mat, base, ext (удлинение концов), hidden }
  const deckPlan = [];
  const lanes = [];                                          // проезды-срезки под арками (заполняет arch())
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
  Object.assign(C, { towers, caps, units, slants, spires, plain, roofs, neon, pools, containers, solids, trees,
    palms, slabs, lamps, umbrellas, domes, pyramids, rtanks, helipads, medians, alleys, landmarks, mmShapes, keepOut,
    avoid, deckPlan, lanes, hits, blocked, PAL, fillDowntown, fillCity, fillOld, arch, specialData, fillPort,
    fillResort, fillSuburb });
}

function cityPlanFill(C) {
  const { CURB, parkBlock, blocks, slabs, landmarks, fillDowntown, fillCity, fillOld, arch, specialData, fillPort,
    fillResort, fillSuburb } = C;
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
}
