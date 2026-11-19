// Ситжес — ПОСТРОЙКА: железная дорога, граница игровой области (набор K.rk — roads3d.js).
//   Ж/д — балласт со шпалами, рельсы, на путепроводах настил и парапеты; ограда вдоль путей, кроме промежутков между
//   соседними путями, проезжей части и воды. Граница на суше — каменная стена; где через неё уходит улица — бетонные
//   блоки (rk.blocks). Меши блоков — в sitgesBuildRoadMeshes().
// Определяет: sitgesBuildRail.
// Использует: MAT (js/core.js); SITGES_GEO (js/maps/sitges/data-geo.js); sitgesCells, sitgesSeg
//   (js/maps/sitges/geom.js); SITGES_R (js/maps/sitges/roads.js); SITGES_RB (js/maps/sitges/roads3d.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

function sitgesBuildRail(K) {
  const { D, group, grid, decks, rk } = K, C = D.C, P = SITGES_RB, R = SITGES_R, g = D.ground;
  const { MAT, surfOf, buckets, quad, gn, UP, wallQuad, cmesh, cquad, walks, addWalk, offs, parapet, cnt, blocks } = rk;
  const DK = P.deck;
  /* ---------- железная дорога ---------- */
  const RL = P.rail;
  // все отрезки путей — для поиска соседнего пути у ограды
  const tcell = sitgesCells(16);
  for (const tr of C.tracks) tr.v.forEach((q, i) => {
    if (i === tr.v.length - 1) return;
    const b = tr.v[i + 1];
    tcell.add(Math.min(q.x, b.x), Math.max(q.x, b.x), Math.min(q.z, b.z), Math.max(q.z, b.z), [q, b]);
  });
  const trackDist = (x, z) => {
    let best = Infinity;
    tcell.each(x - 4, x + 4, z - 4, z + 4, list => { for (const [a, b] of list) best = Math.min(best, sitgesSeg(x, z, a.x, a.z, b.x, b.z)); });
    return best;
  };
  for (const tr of C.tracks) {
    const v = tr.v;
    for (let i = 0; i + 1 < v.length; i++) {
      const a = v[i], b = v[i + 1], deck = a.deck;
      const ya = (deck ? a.y : g(a.x, a.z)) + RL.bed, yb = (deck ? b.y : g(b.x, b.z)) + RL.bed;
      // насыпь: верх (балласт со шпалами) и откосы
      const [la, lza] = offs(a, RL.top), [ra, rza] = offs(a, -RL.top), [lb, lzb] = offs(b, RL.top), [rb, rzb] = offs(b, -RL.top);
      const va = a.s / 2.4, vb = b.s / 2.4;
      quad('ballast', [[la, ya, lza], [lb, yb, lzb], [rb, yb, rzb], [ra, ya, rza]], UP, 0xffffff, [[0.12, va], [0.12, vb], [0.88, vb], [0.88, va]]);
      for (const sg of [1, -1]) {
        const [xa, za] = offs(a, sg * RL.top), [xb, zb] = offs(b, sg * RL.top), [Xa, Za] = offs(a, sg * RL.half), [Xb, Zb] = offs(b, sg * RL.half);
        const ga = deck ? a.y - 0.1 : g(Xa, Za) - 0.1, gb = deck ? b.y - 0.1 : g(Xb, Zb) - 0.1;
        quad('ballast', [[xa, ya, za], [xb, yb, zb], [Xb, gb, Zb], [Xa, ga, Za]], UP, 0xe0dcd6, [[0.12, va], [0.12, vb], [0, vb], [0, va]]);
      }
      // рельсы: брусок 7 × 16 см
      for (const sg of [1, -1]) {
        const [xa, za] = offs(a, sg * RL.gauge), [xb, zb] = offs(b, sg * RL.gauge), w = 0.035, nx = -a.tz * w, nz = a.tx * w;
        const ta = ya + RL.h, tb = yb + RL.h;
        quad('steel', [[xa - nx, ta, za - nz], [xb - nx, tb, zb - nz], [xb + nx, tb, zb + nz], [xa + nx, ta, za + nz]], UP);
        wallQuad('steel', xa + nx, za + nz, ya, ta, xb + nx, zb + nz, yb, tb, -a.tz, a.tx);
        wallQuad('steel', xa - nx, za - nz, ya, ta, xb - nx, zb - nz, yb, tb, a.tz, -a.tx);
      }
      // на путепроводе — настил и парапеты
      if (deck) {
        for (const sg of [1, -1]) {
          const [ax, az] = offs(a, sg * (RL.half + 0.3)), [bx, bz] = offs(b, sg * (RL.half + 0.3));
          if (trackDist((ax + bx) / 2, (az + bz) / 2) < RL.half) continue;     // соседний путь на том же мосту
          parapet(ax, az, a.y, bx, bz, b.y, sg * -a.tz, sg * a.tx, false);
        }
        const [lx0, lz0] = offs(a, RL.half + 0.3), [rx0, rz0] = offs(a, -RL.half - 0.3), [lx1, lz1] = offs(b, RL.half + 0.3), [rx1, rz1] = offs(b, -RL.half - 0.3);
        quad('stone', [[lx0, a.y - DK.t, lz0], [lx1, b.y - DK.t, lz1], [rx1, b.y - DK.t, rz1], [rx0, a.y - DK.t, rz0]], [0, -1, 0], 0xb0a898);
        quad('stone', [[lx0, a.y - 0.05, lz0], [lx1, b.y - 0.05, lz1], [rx1, b.y - 0.05, rz1], [rx0, a.y - 0.05, rz0]], UP, 0x9a9488);
        continue;
      }
      // ограда по обе стороны, кроме промежутков между соседними путями и проезжей части
      for (const sg of [1, -1]) {
        const [xa, za] = offs(a, sg * RL.fence), [xb, zb] = offs(b, sg * RL.fence), mx = (xa + xb) / 2, mz = (za + zb) / 2;
        if (trackDist(mx, mz) < RL.fence - 0.3 || C.carriageAt(mx, mz, null, 1.5) || D.waterAt(mx, mz) > -1) continue;
        if (b.deck || (i > 0 && v[i - 1].deck)) continue;
        const ga = g(xa, za), gb = g(xb, zb);
        wallQuad('fence', xa, za, ga - 0.05, ga + RL.fenceH, xb, zb, gb - 0.05, gb + RL.fenceH, sg * -a.tz, sg * a.tx, 0xffffff, 'fence');
        const L = Math.hypot(xb - xa, zb - za);
        if (L > 0.2) grid.addOBB(mx, mz, 0.2, L, Math.atan2(xb - xa, zb - za), RL.fenceH + Math.max(ga, gb) - g(mx, mz));
        cnt.fence++;
      }
    }
  }

  /* ---------- граница игровой области на суше ---------- */
  const WL = P.wall, rect = C.rect, G = SITGES_GEO.north;
  const border = [];
  for (let k = 0; k < C.north.length; k++) border.push([G.x0 + k * G.step, C.north[k] + WL.off]);
  border.sort((p, q) => p[0] - q[0]);
  const bx0 = rect[0] - 1.5, bx1 = rect[1] + 1.5;
  const line = [[bx0, rect[2]], [bx0, C.northAt(rect[0]) + WL.off], ...border.filter(p => p[0] > bx0 && p[0] < bx1), [bx1, C.northAt(rect[1]) + WL.off], [bx1, rect[2]]];
  for (let k = 0; k + 1 < line.length; k++) {
    const [ax0, az0] = line[k], [bx2, bz2] = line[k + 1], L = Math.hypot(bx2 - ax0, bz2 - az0), n = Math.max(1, Math.ceil(L / 5));
    for (let s = 0; s < n; s++) {
      const ax = ax0 + (bx2 - ax0) * s / n, az = az0 + (bz2 - az0) * s / n, bx = ax0 + (bx2 - ax0) * (s + 1) / n, bz = az0 + (bz2 - az0) * (s + 1) / n;
      const mx = (ax + bx) / 2, mz = (az + bz) / 2, ga = g(ax, az), gb = g(bx, bz);
      if (D.waterAt(mx, mz) > -1 || Math.min(ga, gb) < 0.2) continue;              // в море стены нет
      const l = Math.hypot(bx - ax, bz - az), nx = (bz - az) / l, nz = -(bx - ax) / l;
      if (C.carriageAt(mx, mz, null, 2)) { blocks.push([mx, mz, Math.atan2(bx - ax, bz - az), l]); continue; }   // улица уходит за границу
      const t = WL.t / 2;
      for (const sg of [1, -1]) wallQuad('stone', ax + nx * t * sg, az + nz * t * sg, ga - 0.4, ga + WL.h, bx + nx * t * sg, bz + nz * t * sg, gb - 0.4, gb + WL.h, nx * sg, nz * sg, 0xd8ccb4);
      quad('stone', [[ax + nx * t, ga + WL.h, az + nz * t], [bx + nx * t, gb + WL.h, bz + nz * t], [bx - nx * t, gb + WL.h, bz - nz * t], [ax - nx * t, ga + WL.h, az - nz * t]], UP, 0xe8dcc4);
      grid.addOBB(mx, mz, WL.t, l, Math.atan2(bx - ax, bz - az), WL.h + Math.max(ga, gb) - g(mx, mz));
      cnt.wall++;
    }
  }
}
