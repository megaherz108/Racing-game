// Ситжес — этап 7, группа C: уличная мебель (план — docs/sitges/stage-7.md, архив группы — docs/sitges/st-c.md).
// Что входит: скамейки, столбики, фонтанчики, фонтан, стоянки мотороллеров (с мотороллерами), шлагбаумы и цепи (цепей
// в карте нет). Мусорок нет — решение пользователя. Каменные скамьи с плиткой на Passeig Marítim — группа D.
// Места — точки OSM (C.points) и одно правило: ряды столбиков на въездах в пешеходные улицы старого города
// с проезжих улиц. Вид — по кадрам Street View (raw/photos/street/C, st-c.md): скамья — деревянные рейки на серой
// стальной раме; столбик на пешеходной улице — серый цилиндр с кольцом (Parellades), на тротуаре — тонкий чёрный;
// фонтанчик — зелёный столбик; мотороллеры — рядом под углом к бордюру на проезжей части.
// Договор (docs/sitges/stage-7.md, «Каркас»):
//   plan(C, S) — раскладка (js/maps/sitges/street.js, группы по порядку A → G): места — помощники S (C.street),
//     занятое — S.reserve(…, 'C'); вернуть данные группы (только данные, без функций) → C.street.groups.C:
//     { bench: [[x, z, ry, вид]], bollard: [[x, z, вид]], water: [[x, z, ry]], fountain: [[x, z]],
//       moto: [[x, z, ry, цвет]], gate: [[x, z, ry]], stats } — ry: +z модели — «лицо»; вид скамьи 0 — дерево,
//       1 — камень; вид столбика 0 — серый, 1 — чёрный; цвет — индекс в stFurnCfg.moto.colors.
//   build(K, S, L) — постройка (js/maps/sitges/street3d.js): S — помощники постройки (K.st), L — данные из plan.
// Мелкое — сбиваемое (скамьи, столбики, фонтанчики, мотороллеры, шлагбаумы); фонтан и каменная скамья — неподвижные.
// Случайного нет: где нужно разнообразие — S.hash по месту.
// Определяет: stFurnCfg, SITGES_ST_C, stFurnModels.
// Использует: clamp (js/core.js); frame (js/main.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const stFurnCfg = {
  bench: { half: 0.75, r: 0.4, wallD: 10, cluster: 15 },
  // Pg. de la Ribera у пляжа Sant Sebastià… (кадр 05): каменные блоки вместо деревянных скамей — круги [x, z, r]
  stone: [[0, -95, 30]],
  noBench: /Passeig Marítim/,              // каменные скамьи с плиткой — группа D (набережная)
  bollard: { r: 0.15, step: 1.6, maxW: 9, minLen: 12 },
  // центр за кругами SITGES_OLDTOWN: Parellades (кадр 08), Sant Francesc, Jesús, Joan Tarrida, Santa Tecla — круги [x, z, r]
  center: [[-430, 100, 300]],
  moto: { step: 0.95, road: 0.95, walk: 1.0, angle: 0.45, min: 3, max: 7, r: 0.42,
    colors: [0xf0f0ee, 0x1d1d1f, 0x8c9094, 0xb02a2a, 0x2b4a7a, 0xd8d0bc, 0x3d6b4a, 0xc8c8c8] },
  water: { r: 0.25 },
  fountain: { r: 1.3 },
  gate: { arm: 4 },
};

const SITGES_ST_C = {
  id: 'C', name: 'уличная мебель', ready: true,

  plan(C, S) {
    const F = stFurnCfg, P = C.points || {}, r2 = v => Math.round(v * 100) / 100;
    const out = { bench: [], bollard: [], water: [], fountain: [], moto: [], gate: [],
      stats: { benchSkip: 0, benchD: 0, bollardSkip: 0, entries: 0, entrySkip: 0, motoBays: 0, waterSkip: 0, gateSkip: 0 } };
    const st = out.stats, sName = si => (si !== undefined && C.streets[si] && C.streets[si].name) || '';
    // свободное место рядом: сдвиги вдоль (ax, az) на 0, ±d, ±2d…; капсула ±half вдоль оси → [x, z] или null
    const near = (x, z, ax, az, r, half = 0, d = 0.6, n = 3) => {
      for (let k = 0; k <= n * 2; k++) {
        const u = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * d, px = x + ax * u, pz = z + az * u;
        if (S.free(px - ax * half, pz - az * half, r, null, px + ax * half, pz + az * half)) return [px, pz];
      }
      return null;
    };
    const take = (x, z, r, ax = 0, az = 0, half = 0) => S.reserve(x - ax * half, z - az * half, r, 'C', x + ax * half, z + az * half);
    const onWalkSpot = (x, z) => {           // точка на тротуаре или у бордюра со стороны дороги → { seg, f, d, w }
      const w = S.onWalk(x, z);
      if (w) return w;
      const cb = S.nearest('curbs', x, z, 1.6);
      if (!cb) return null;
      const s = cb.seg, d = (x - s.ax) * s.nx + (z - s.az) * s.nz;
      return d < 0 ? { seg: s, f: cb.f, d: 0, w: s.w0 + (s.w1 - s.w0) * cb.f } : null;
    };

    /* ---------- скамейки ---------- */
    const bp = P.bench || [];
    bp.forEach(([x0, z0], bi) => {
      const cb = S.nearest('curbs', x0, z0, 8);
      if (cb && F.noBench.test(sName(cb.seg.si))) { st.benchD++; return; }
      let x = x0, z = z0, ry = null;
      const w = onWalkSpot(x0, z0);
      if (w && w.w >= 1.2) {                 // на тротуаре: спиной к линии забора, лицом к улице (кадр 01, Sant Honorat)
        const s = w.seg, d = clamp(w.d, Math.min(0.6, w.w / 2), Math.max(0.6, w.w - 0.4)), sp = S.at(s, w.f, d);
        x = sp.x; z = sp.z; ry = Math.atan2(-s.nx, -s.nz);
      } else {
        const wl = S.nearest('walls', x0, z0, F.bench.wallD) || S.nearest('fronts', x0, z0, F.bench.wallD);
        const c = S.carriage(x0, z0);
        if (c && !c.corner && c.st.cls === 'pedestrian') {
          // на пешеходной улице: вдоль её оси, спиной к ближнему дому (кадр 04, Port d'Alegre — лицом к морю)
          const a = c.st.v[c.i], b = c.st.v[c.i + 1], L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
          let fx = -(b.z - a.z) / L, fz = (b.x - a.x) / L;
          const sg = wl ? fx * wl.seg.nx + fz * wl.seg.nz : S.hash(x0, z0, 10) - 0.5;
          if (sg < 0) { fx = -fx; fz = -fz; }
          ry = Math.atan2(fx, fz);
        } else if (wl) ry = Math.atan2(wl.seg.nx, wl.seg.nz);   // спиной к дому
        else {                               // в сквере: лицом к середине группы скамеек
          let cx = 0, cz = 0, n = 0;
          for (const [x1, z1] of bp) if (Math.hypot(x1 - x0, z1 - z0) < F.bench.cluster) { cx += x1; cz += z1; n++; }
          cx /= n; cz /= n;
          ry = n >= 3 && Math.hypot(cx - x0, cz - z0) > 0.5 ? Math.atan2(cx - x0, cz - z0) : S.hash(x0, z0, 11) * Math.PI * 2;
        }
      }
      const ax = Math.cos(ry), az = -Math.sin(ry), H = F.bench.half;
      const p = near(x, z, ax, az, F.bench.r, H, 0.8, 2);
      if (!p) { st.benchSkip++; return; }
      take(p[0], p[1], F.bench.r, ax, az, H);
      const stone = F.stone.some(([cx, cz, r]) => Math.hypot(x0 - cx, z0 - cz) < r) ? 1 : 0;
      out.bench.push([r2(p[0]), r2(p[1]), r2(ry), stone]);
    });

    /* ---------- столбики: точки OSM ---------- */
    const bol = [];
    for (const [x, z] of P.bollard || []) {
      if (bol.some(([x1, z1]) => Math.hypot(x1 - x, z1 - z) < 0.5)) continue;
      const c = S.carriage(x, z), cb = S.nearest('curbs', x, z, 1.2);
      // на проезжей части обычной улицы, далеко от бордюра — неточная точка OSM, не ставим
      if (c && c.st.drive && !/pedestrian|living_street|service/.test(c.st.cls) && !cb && !c.corner) { st.bollardSkip++; continue; }
      if (!S.free(x, z, F.bollard.r)) { st.bollardSkip++; continue; }
      take(x, z, F.bollard.r);
      const kind = S.onWalk(x, z) ? 1 : 0;   // на тротуаре — чёрный тонкий (paving-02, кадр 15), иначе серый (кадр 08)
      bol.push([x, z]); out.bollard.push([r2(x), r2(z), kind]);
    }
    const nOsm = out.bollard.length;

    /* ---------- столбики: въезды в пешеходные улицы старого города ---------- */
    C.streets.forEach(sT => {
      if (sT.cls !== 'pedestrian' || sT.len < F.bollard.minLen) return;
      const v = sT.v;
      for (const end of [0, 1]) {
        const E = end ? v[v.length - 1] : v[0];
        if (!S.oldTown(E.x, E.z) && !F.center.some(([cx, cz, r]) => Math.hypot(E.x - cx, E.z - cz) < r)) continue;
        const O = C.carriageAt(E.x, E.z, sT) || C.carriageAt(E.x, E.z, sT, 2);
        if (!O || !O.st.drive || O.st.cls === 'pedestrian') continue;
        const ow = O.st.v[O.i], margin = Math.max(ow.sw[0], ow.sw[1]) + 0.3;
        // идти от конца, пока под точкой проезжая часть (с тротуаром) проезжей улицы
        const q0 = end ? v[v.length - 2] : v[1], dl = Math.hypot(q0.x - E.x, q0.z - E.z) || 1;
        const ux = (q0.x - E.x) / dl, uz = (q0.z - E.z) / dl;
        let s = 0;
        const driveAt = (x, z) => { const c = C.carriageAt(x, z, sT, margin); return c && c.st.drive && c.st.cls !== 'pedestrian'; };
        while (s < 20 && driveAt(E.x + ux * s, E.z + uz * s)) s += 0.25;
        s += 0.6;
        if (s >= 20 || s + 3 > sT.len) { st.entrySkip++; continue; }
        const sa = end ? sT.len - s : s;
        let j = 0; while (j < v.length - 2 && v[j + 1].s < sa) j++;
        const a = v[j], b = v[j + 1], t = clamp((sa - a.s) / Math.max(1e-6, b.s - a.s), 0, 1);
        const L = Math.hypot(b.x - a.x, b.z - a.z) || 1, tx = (b.x - a.x) / L, tz = (b.z - a.z) / L;
        const cx = a.x + (b.x - a.x) * t, cz = a.z + (b.z - a.z) * t, hw = a.hw + (b.hw - a.hw) * t;
        const W = 2 * hw - 0.6;
        if (W > F.bollard.maxW || W < 1.5) { st.entrySkip++; continue; }   // площадь или щель
        const n = Math.max(2, Math.round(W / F.bollard.step) + 1);
        let k0 = 0;
        for (let k = 0; k < n; k++) {
          const u = -W / 2 + W * k / (n - 1), x = cx - tz * u, z = cz + tx * u;
          if (driveAt(x, z) || !S.free(x, z, F.bollard.r)) continue;
          take(x, z, F.bollard.r); out.bollard.push([r2(x), r2(z), 0]); k0++;
        }
        if (k0) st.entries++; else st.entrySkip++;
      }
    });
    st.bollardOsm = nOsm; st.bollardEntry = out.bollard.length - nOsm;

    /* ---------- фонтанчики (drinking_water и water_tap — часто одна точка) ---------- */
    const wp = [];
    for (const k of ['drinking_water', 'water_tap']) for (const [x, z] of P[k] || []) if (!wp.some(([x1, z1]) => Math.hypot(x1 - x, z1 - z) < 1.5)) wp.push([x, z]);
    for (const [x0, z0] of wp) {
      let x = x0, z = z0, ry, ax = 1, az = 0;
      const w = onWalkSpot(x0, z0);
      if (w && w.w >= 0.9) {                 // на тротуаре — у бордюра лицом к тротуару (кадр 15, Pg. Marítim)
        const s = w.seg, sp = S.at(s, w.f, clamp(w.d, 0.4, Math.max(0.4, w.w - 0.4)));
        x = sp.x; z = sp.z; ry = Math.atan2(s.nx, s.nz); ax = sp.tx; az = sp.tz;
      } else {
        const wl = S.nearest('walls', x0, z0, 6) || S.nearest('fronts', x0, z0, 6);
        ry = wl ? Math.atan2(wl.seg.nx, wl.seg.nz) : S.hash(x0, z0, 12) * Math.PI * 2;
      }
      const p = near(x, z, ax, az, F.water.r, 0, 0.7, 2);
      if (!p) { st.waterSkip++; continue; }
      take(p[0], p[1], F.water.r);
      out.water.push([r2(p[0]), r2(p[1]), r2(ry)]);
    }

    /* ---------- фонтан ---------- */
    for (const [x, z] of P.fountain || []) { take(x, z, F.fountain.r); out.fountain.push([r2(x), r2(z)]); }

    /* ---------- стоянки мотороллеров: ряд под углом к бордюру ---------- */
    const M = F.moto;
    for (const [x0, z0] of P.motorcycle_parking || []) {
      let ln = S.nearest('curbs', x0, z0, 5), road = true;
      if (!ln) ln = S.nearest('edges', x0, z0, 5);
      if (!ln) continue;
      // нормаль: у бордюра — к дому, у края полотна — наружу; «лицо» ряда — от проезжей части (кадр 09)
      const s = ln.seg, d = (x0 - s.ax) * s.nx + (z0 - s.az) * s.nz;
      let off = -M.road;                     // на дороге у бордюра или у края полотна
      if (s.w0 !== undefined && d > 0 && s.w0 + (s.w1 - s.w0) * ln.f >= 2.6) { off = M.walk; road = false; }  // на широком тротуаре
      const n = M.min + Math.floor(S.hash(x0, z0, 13) * (M.max - M.min + 1));
      const tx = (s.bx - s.ax) / s.len, tz = (s.bz - s.az) / s.len;
      const px = s.ax + (s.bx - s.ax) * ln.f, pz = s.az + (s.bz - s.az) * ln.f;
      const ca = Math.cos(M.angle), sa = Math.sin(M.angle), fx = s.nx * ca + tx * sa, fz = s.nz * ca + tz * sa;
      const ry = Math.atan2(fx, fz);
      let got = 0;
      for (let k = 0; k < n; k++) {
        const u = (k - (n - 1) / 2) * M.step, x = px + tx * u + s.nx * off, z = pz + tz * u + s.nz * off;
        if (!S.free(x, z, M.r)) continue;
        if (road && !S.carriage(x, z)) continue;
        take(x, z, M.r);
        out.moto.push([r2(x), r2(z), r2(ry + (S.hash(x, z, 14) - 0.5) * 0.16), Math.floor(S.hash(x, z, 15) * M.colors.length)]);
        got++;
      }
      if (got) st.motoBays++;
    }

    /* ---------- шлагбаумы: стрела поперёк проезда, стойка у края ---------- */
    for (const [x0, z0] of P.lift_gate || []) {
      const c = S.carriage(x0, z0);
      if (!c || c.corner) { st.gateSkip++; continue; }
      const a = c.st.v[c.i], b = c.st.v[c.i + 1], L = Math.hypot(b.x - a.x, b.z - a.z) || 1, tx = (b.x - a.x) / L, tz = (b.z - a.z) / L;
      const hw = a.hw + (b.hw - a.hw) * c.t, ex = -tz, ez = tx;       // ex — поперёк улицы
      const cx = a.x + (b.x - a.x) * c.t, cz = a.z + (b.z - a.z) * c.t, A = F.gate.arm;
      // стойка у края полотна со стороны точки, середина стрелы — на A/2 ближе к оси
      const side = ((x0 - cx) * ex + (z0 - cz) * ez) >= 0 ? 1 : -1, e = Math.max(0, hw - 0.3) - A / 2;
      const x = cx + ex * side * e, z = cz + ez * side * e;
      // +x модели — к стойке: x-ось модели (cos ry, −sin ry) = (ex, ez)·side
      const ry = Math.atan2(-ez * side, ex * side);
      take(x, z, 0.3, ex, ez, A / 2 + 0.3);
      out.gate.push([r2(x), r2(z), r2(ry)]);
    }
    st.chains = (P.chain || []).length;
    return out;
  },

  build(K, S, L) {
    if (!L) return;
    const M = stFurnModels(S), F = stFurnCfg;
    const items = (list, f) => list.map(f);
    S.place(M.bench, items(L.bench.filter(b => !b[3]), ([x, z, ry]) => ({ x, z, ry })),
      { brk: { mass: 60, anchor: 0.6, cy: 0.45, lie: 1.3, light: true, kind: 'wood' }, hit: { r: 0.6, h: 0.9 } });
    S.place(M.stone, items(L.bench.filter(b => b[3]), ([x, z, ry]) => ({ x, z, ry })), { box: { w: 1.9, d: 0.55, h: 0.5 } });
    S.place(M.bollardGrey, items(L.bollard.filter(b => !b[2]), ([x, z]) => ({ x, z })),
      { brk: { mass: 25, minSpeed: 1, cy: 0.4, lie: 1.45, light: true, kind: 'post' }, hit: { r: 0.12, h: 0.8 } });
    S.place(M.bollardBlack, items(L.bollard.filter(b => b[2]), ([x, z]) => ({ x, z })),
      { brk: { mass: 15, minSpeed: 1, cy: 0.45, lie: 1.45, light: true, kind: 'post' }, hit: { r: 0.08, h: 0.9 } });
    S.place(M.water, items(L.water, ([x, z, ry]) => ({ x, z, ry })),
      { brk: { mass: 90, anchor: 1, minSpeed: 2, cy: 0.6, lie: 1.5, kind: 'metal' }, hit: { r: 0.18, h: 1.2 } });
    S.place(M.fountain, items(L.fountain, ([x, z]) => ({ x, z })), { hit: { r: 1.25, h: 0.6 } });
    S.place(M.moto, items(L.moto, ([x, z, ry, c]) => ({ x, z, ry, color: F.moto.colors[c] })),
      { brk: { mass: 110, cy: 0.5, lie: 1.4, light: true, kind: 'metal' }, hit: { r: 0.5, h: 1.1 } });
    S.place(M.gate, items(L.gate, ([x, z, ry]) => ({ x, z, ry })),
      { brk: { mass: 30, cy: 0.9, lie: 1.5, light: true, kind: 'metal' }, hit: { r: 1.7, h: 1.2 } });
  },
};

// Модели группы (основание в y = 0, «лицо» к +z). Части — { geo, mat, shadow } для S.place.
function stFurnModels(S) {
  const B = (w, h, d, x = 0, y = 0, z = 0, rx = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rx) g.rotateX(rx);
    return g.translate(x, y, z);
  };
  const Cy = (rt, rb, h, seg, x = 0, y = 0, z = 0, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open).translate(x, y, z);
  const mg = list => mergeGeometries(list.map(g => g.index ? g.toNonIndexed() : g));
  const steel = S.mat(0xa4a9ad, { roughness: 0.45, metalness: 0.6 }), wood = S.mat(0x7d5a3a, { roughness: 0.85 });
  const dark = S.mat(0x1b1b1c, { roughness: 0.6 }), white = S.mat(0xffffff, { roughness: 0.4, metalness: 0.1 });

  /* скамья (кадр 01): рейки сиденья и спинки, две боковины с подлокотниками */
  const slats = [], frame = [];
  for (const z of [-0.14, -0.03, 0.08, 0.19]) slats.push(B(1.8, 0.035, 0.09, 0, 0.44, z));
  for (const y of [0.6, 0.74]) slats.push(B(1.8, 0.1, 0.03, 0, y, -0.24 - (y - 0.6) * 0.25, -0.25));
  for (const x of [-0.78, 0.78]) {
    frame.push(B(0.045, 0.42, 0.045, x, 0.21, 0.19), B(0.045, 0.86, 0.045, x, 0.43, -0.24, -0.12),
      B(0.045, 0.04, 0.48, x, 0.41, -0.02), B(0.045, 0.04, 0.44, x, 0.64, 0.02));
  }
  const bench = [{ geo: mg(slats), mat: wood }, { geo: mg(frame), mat: steel }];

  /* каменная скамья (кадр 05, Pg. de la Ribera): бутовое основание и плита */
  const stone = [{ geo: mg([B(1.7, 0.38, 0.42, 0, 0.19, 0)]), mat: S.mat(0xb3a68e, { roughness: 0.95 }) },
    { geo: mg([B(1.9, 0.08, 0.55, 0, 0.42, 0)]), mat: S.mat(0xd9cfba, { roughness: 0.9 }) }];

  /* столбики: серый цилиндр с кольцом (кадр 08) и тонкий чёрный с шаром (paving-02, кадр 15) */
  const bollardGrey = [{ geo: mg([Cy(0.1, 0.1, 0.72, 10, 0, 0.36, 0, true), Cy(0.112, 0.112, 0.05, 10, 0, 0.62), Cy(0.07, 0.1, 0.07, 10, 0, 0.755)]),
    mat: S.mat(0x9a9d9f, { roughness: 0.4, metalness: 0.6 }) }];
  const bollardBlack = [{ geo: mg([Cy(0.055, 0.065, 0.82, 8, 0, 0.41, 0, true), new THREE.SphereGeometry(0.07, 8, 4).translate(0, 0.84, 0)]),
    mat: S.mat(0x1c1c1c, { roughness: 0.5, metalness: 0.4 }) }];

  /* фонтанчик (кадр 15): зелёный столбик с крышкой и носиком, решётка стока */
  const water = [{ geo: mg([B(0.22, 1.1, 0.2, 0, 0.55, 0), B(0.27, 0.06, 0.25, 0, 1.13, 0), B(0.05, 0.05, 0.12, 0, 0.98, 0.15)]),
    mat: S.mat(0x3b6e48, { roughness: 0.55, metalness: 0.3 }) },
  { geo: mg([B(0.5, 0.03, 0.34, 0, 0.015, 0.3)]), mat: dark, shadow: false }];

  /* фонтан (без кадра): каменная чаша, вода, столбик с верхней чашей */
  const fountain = [{ geo: mg([Cy(1.2, 1.25, 0.5, 20, 0, 0.25), Cy(0.13, 0.18, 1.05, 10, 0, 0.75), Cy(0.45, 0.18, 0.18, 12, 0, 1.3)]),
    mat: S.mat(0xcfc3a8, { roughness: 0.9 }) },
  { geo: mg([Cy(1.08, 1.08, 0.02, 20, 0, 0.44), Cy(0.4, 0.4, 0.02, 12, 0, 1.38)]), mat: S.mat(0x4f7f8f, { roughness: 0.1, metalness: 0.2 }), shadow: false }];

  /* мотороллер (кадры 03, 09): цвет корпуса — цвет экземпляра (белый материал), тёмные части цвет почти не меняет */
  const body = mg([B(0.34, 0.08, 0.5, 0, 0.3, 0.05), B(0.36, 0.3, 0.66, 0, 0.5, -0.4), B(0.36, 0.6, 0.1, 0, 0.58, 0.45, -0.25),
    B(0.17, 0.14, 0.12, 0, 1.0, 0.58), B(0.14, 0.06, 0.3, 0, 0.45, 0.62)]);
  const moto = [{ geo: body, mat: white },
    { geo: mg([Cy(0.21, 0.21, 0.09, 10, 0, 0, 0).rotateZ(Math.PI / 2).translate(0, 0.21, 0.62), Cy(0.21, 0.21, 0.09, 10, 0, 0, 0).rotateZ(Math.PI / 2).translate(0, 0.21, -0.62),
      B(0.3, 0.1, 0.62, 0, 0.7, -0.35), B(0.07, 0.48, 0.07, 0, 0.84, 0.52), B(0.62, 0.045, 0.045, 0, 1.08, 0.5)]), mat: dark }];

  /* шлагбаум: стрела 4 м с красными полосами поперёк проезда, стойка на +x (у края полотна) */
  const A = stFurnCfg.gate.arm, bands = [];
  for (let k = 0; k < 5; k++) bands.push(B(0.4, 0.085, 0.065, -A / 2 + 0.3 + k * 0.85, 0.95, 0));
  const gate = [{ geo: mg([B(A, 0.08, 0.06, 0, 0.95, 0), B(0.3, 1.0, 0.3, A / 2 + 0.15, 0.5, 0)]), mat: S.mat(0xf2f2f0, { roughness: 0.5 }) },
    { geo: mg([...bands, B(0.32, 0.08, 0.32, A / 2 + 0.15, 1.04, 0)]), mat: S.mat(0xc2262b, { roughness: 0.5 }) }];

  return { bench, stone, bollardGrey, bollardBlack, water, fountain, moto, gate };
}
