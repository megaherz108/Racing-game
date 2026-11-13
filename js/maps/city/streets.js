// Город — РАСКЛАДКА: улицы.
// cityPlanStreets — фонари вдоль дорог, набережная и пляж (пальмы, зонтики), деревья в парке и на окраинах,
//   ограждение канала, маяк, перекрёстки со светофорами (litNodes) и сбиваемая мелочь: гидранты, знаки,
//   летние кафе, скамейки и урны.
// ВАЖНО: город детерминирован — зерно mulberry32 в cityPlanBase(), вызовы R() идут строго по порядку этапов.
//   Новый вызов R() или перестановка кода в середине раскладки меняет весь город после этого места.
//   Проверка: __game.fingerprint('city').dataHash до и после правки (js/selftest.js).
// Порядок этапов — в cityData() (js/maps/city/plan.js).
// Определяет: cityPlanStreets.
// Использует: lerp (js/core.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

function cityPlanStreets(C) {
  const { R, BW, CANAL, PROM_Z, BRIDGES, coastD, quayD, district, HALVES, widthX, widthZ, nodes, roadSegs, parkBlock,
    blockAt, BEACH_Z, RING, parkPath, solids, trees, palms, lamps, umbrellas, landmarks, blocked } = C;
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
  Object.assign(C, { rails, lh, litNodes, hydrants, signs, tables, chairs, benches, bins, CAFE_COL });
}
