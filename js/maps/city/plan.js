// Город на острове (≈ 2 × 2 км) — РАСКЛАДКА: cityData() считает данные карты (без 3D) по этапам.
//
// Остров разрезан каналом (z ≈ 0) на две половины:
//   север — Деловая часть: Даунтаун в центре, Порт и промзона на западе (гавань, краны, контейнеры), жилые кварталы;
//   юг — Курортная часть: Городской парк с холмами и трамплинами, набережная с отелями и пляжем, пригород.
// На северо-востоке — Старый город: брусчатка, ряды узких домов, кривые переулки, рыночная площадь.
// Уникальные объекты (телебашня, стадион, ратуша, пирс с колесом обозрения…) строит js/maps/city/landmarks.js.
// Через канал — 5 мостов: «горбатые» автомобильные — проспекты x = ±400 и крайние улицы x = ±820 (уже, одна полоса
//   в каждую сторону), разводной мост-трамплин посередине (x = 0).
//
// Этапы делят общий контекст C (Object.assign в конце каждого этапа):
//   cityPlanBase (здесь)      константы, берег, районы, дорожная сеть, кварталы, рельеф, дорожки парка
//   cityPlanKit (blocks)      списки объектов, хелперы застройки (tower, solid…), функции fill*, резерв под памятники
//   cityPlanInfra (infra)     эстакада, проезды-срезки, кривые переулки, бульвары, памятники вне кварталов, пирс
//   cityPlanFill (blocks)     тротуары и застройка каждого квартала
//   cityPlanPort (infra)      портовые краны, мосты, разводной мост, трамплины в парке
//   cityPlanStreets (streets) фонари, пальмы, деревья, ограждения, маяк, светофоры, знаки, кафе, скамейки
//   cityPlanOverpass (overpass) трюки на эстакаде: кикеры, вылеты, крыши с монетами, разрыв, съезды, трафик (без R())
//   cityPlanJumps (jumps)     места для длинных прыжков: стальные листы на улицах, дюны на пляже (без R())
//   cityPlanMinimap (здесь)   мини-карта и итоговый объект данных (его читают buildCity() и трафик)
// ВАЖНО: город детерминирован — зерно mulberry32 в cityPlanBase(), вызовы R() идут строго по порядку этапов.
//   Новый вызов R() или перестановка кода в середине раскладки меняет весь город после этого места.
//   Проверка: __game.fingerprint('city').dataHash до и после правки (js/selftest.js).
// Определяет: cityData, cityPlanBase, cityPlanMinimap.
// Использует: lerp, clamp (js/core.js); mulberry32, makeNoise, smooth01, mmCanvas (js/world.js); cityPlanKit,
//   cityPlanFill (js/maps/city/blocks.js); cityPlanInfra, cityPlanPort (js/maps/city/infra.js); cityPlanStreets
//   (js/maps/city/streets.js); cityPlanOverpass, OV_ST (js/maps/city/overpass.js); cityPlanJumps
//   (js/maps/city/jumps.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

/* =====================================================================
   ГОРОД НА ОСТРОВЕ — РАСКЛАДКА
   ===================================================================== */
function cityData() {
  const C = {};
  cityPlanBase(C);
  cityPlanKit(C);
  cityPlanInfra(C);
  cityPlanFill(C);
  cityPlanPort(C);
  cityPlanStreets(C);
  cityPlanOverpass(C);
  cityPlanJumps(C);
  return cityPlanMinimap(C);
}

function cityPlanBase(C) {
  const rng = mulberry32(20261112), R = () => rng();
  const pick = arr => arr[Math.floor(R() * arr.length)];
  const WATER = -0.45, BOUNDS = 1000, BW = 30, CURB = 0.15;
  const CANAL = 30;                                           // полуширина канала
  const BASIN = { x0: -1100, x1: -640, z0: 150, z1: 250 };    // портовая гавань (открыта в море на западе)
  const PARK = { x0: -280, x1: 280, z0: -500, z1: -140 };
  const PC = [0, -320];                                       // центр парка (фонтан)
  const PROM_Z = -760;                                        // набережная вдоль пляжа
  const BRIDGES = [-820, -400, 0, 400, 820], DRAW_X = 0;     // x мостов через канал
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
    // ширина — как у улицы, которую мост продолжает (проспект 20 м, обычная улица 14 м)
    segs.push({ x0: bx, z0: 40, x1: bx, z1: -40, w: a.wx, dir: 'z', a, b, kind: bx === DRAW_X ? 'draw' : 'bridge' });
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
  Object.assign(C, { rng, R, pick, WATER, BOUNDS, BW, CURB, CANAL, BASIN, PARK, PC, PROM_Z, BRIDGES, DRAW_X, OLD,
    coastD, quayD, district, HALVES, widthX, widthZ, nodes, segs, roadSegs, parkBlock, blocks, blockAt, BEACH_Z,
    ground, RING, parkPath });
}

function cityPlanMinimap(C) {
  const { WATER, BOUNDS, CURB, CANAL, BASIN, PARK, PC, PROM_Z, BRIDGES, DRAW_X, coastD, quayD, district, nodes, segs,
    roadSegs, parkBlock, blocks, blockAt, BEACH_Z, ground, parkPath, towers, caps, units, slants, spires, plain,
    roofs, neon, pools, containers, solids, trees, palms, slabs, lamps, umbrellas, domes, pyramids, rtanks, helipads,
    medians, alleys, landmarks, mmShapes, deckPlan, lanes, OV, ovRuns, ovPillars, ovArcs, cranes, rails, lh,
    litNodes, hydrants, signs, tables, chairs, benches, bins, CAFE_COL, coinFixed, ovTraffic, ovMarks, ovCleared, dune } = C;
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
  // съезды посередине и «недострой» (разрыв настила — видна улица под ним)
  m.ctx.lineCap = 'butt'; m.ctx.beginPath();
  for (const x of OV_ST.exits) { m.ctx.moveTo(m.X(x), m.Z(OV.Z - OV.W / 2)); m.ctx.lineTo(m.X(x), m.Z(OV_ST.exitZ)); }
  m.ctx.stroke();
  m.ctx.fillStyle = '#5d6168'; m.rect(-OV_ST.gap.x, OV_ST.gap.x, OV.Z - OV.W / 2, OV.Z + OV.W / 2);
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
    hydrants, signs, tables, chairs, benches, bins, cafeColors: CAFE_COL, coinFixed, ovTraffic, ovMarks, ovCleared, dune };
}
