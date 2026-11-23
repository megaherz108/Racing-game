// Ситжес — этап 7, группа E: пляж (план — docs/sitges/stage-7.md, архив группы — docs/sitges/st-e.md).
// Что входит (вид — по фото: Street View raw/photos/street/E, D/04, Commons street/E/commons — st-e.md):
//   лежаки и зонты рядами у стены набережной (прокат: белая рама, синий матрас, зонт из синих и белых клиньев — парами
//   под зонтом; у пляжных клубов — белые лежаки и белые квадратные зонты F), пляжные бары (чирингито: белый киоск
//   с синей полосой и навесом, деревянный настил со столиками; клуб — настил шире под белой перголой), вышки спасателей
//   (жёлтая будка на белом основании, флагшток с зелёным флагом), волейбол (сетка на двух столбах, разметка лентой),
//   лодки на песке (парк катамаранов и швертботов клуба на пляже Fragata — фото Commons c13, c14, SV 09; водные
//   велосипеды у баров — c29), свои зонты и полотенца отдыхающих (летний вид, c01, c19).
// Где: стены набережной группы D (C.street.groups.D.walls — ряды вдоль стены в сторону моря, спуски D заняты), пляжи
//   OSM (C.areas beach / sand), до воды — S.coastD. Бары — у стел пляжных заведений 6а (C.signs, form 'totem'): заведение
//   за стелой со стороны моря, на песке. Рельеф не правится.
// Мелкое (лежаки, зонты, водные велосипеды, столики) — сбиваемое; бары, вышки, волейбол, лодки клуба — неподвижные.
// Случайного нет: S.hash по месту.
// Договор (docs/sitges/stage-7.md, «Каркас»):
//   plan(C, S) → C.street.groups.E: { lounger: [[x, z, ry, вид]], umbrella: [[x, z, ry, вид]], own: [[x, z, ry, цвет]],
//     bar: [[x, z, ry, вид, y]], deck: [[x, z, ry, вид]], table: [[x, z, ry]], chair: [[x, z, ry]], tower: [[x, z, ry]],
//     court: [[x, z, ry]], boat: [[x, z, ry, вид, цвет]], pedalo: [[x, z, ry]], stats }.
//   build(K, S, L) — экземпляры S.place (модели stBeachModels), настил — S.walk, ночные огни баров — S.lights.
// Определяет: stBeachCfg, SITGES_ST_E, stBeachModels.
// Использует: sitgesBBox, sitgesArea, sitgesInPoly, sitgesCells, sitgesSeg (js/maps/sitges/geom.js); stTerrModels
//   (js/maps/sitges/st/terraces.js); sitgesStWallLen, sitgesStWallAt (js/maps/sitges/street.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const stBeachCfg = {
  // прокат у стены: участки (концессии) длиной block м с проходом gap; сдан с долей rent; клуб — ближе club м к бару-клубу;
  // пары лежаков под зонтом через pitch м вдоль стены (клуб — pitchClub), ряды через row м от first м от стены,
  // рядов rows[0]…rows[1] (по хешу участка); центр пары не ближе water м к воде; каждый aisle-й шаг — проход к воде
  rent: { block: 40, gap: 6, p: 0.72, club: 70, pitch: 4.0, pitchClub: 4.8, first: 4.2, row: 5.0, rows: [2, 5], water: 11, aisle: 6, r: 1.5 },
  // лежак: смещение к морю от зонта, половина расстояния между лежаками пары
  lounger: { sea: 0.55, side: 0.42 },
  // свои зонты отдыхающих: сетка step м, доля p, полоса от воды water[0]…water[1] м, свободный круг r
  own: { step: 4.5, p: 0.16, water: [5, 30], r: 1.7, wall: 3 },
  // бар: стела 6а → луч в сторону моря до песка (ray м); киоск w × d, настил впереди deck м (клуб — шире); от стены back м;
  // до воды не ближе water м; виды заведений с баром на пляже
  bar: { ray: 60, back: 1.2, water: 6, cats: ['restaurant', 'cafe', 'bar', 'club', 'fastfood', 'icecream'], dedupe: 25,
    kiosk: [{ w: 6, d: 4 }, { w: 8, d: 4.5 }], deck: [{ w: 7, d: 4.5 }, { w: 12, d: 6.5 }] },
  // вышка: на пляже площадью от area м² — по одной на span м вдоль пляжа, от воды water м; занятое (бар) не ближе clear м
  tower: { area: 2500, span: 380, water: [11, 24], best: 16, r: 2.6, clear: 7, wall: 4 },
  // волейбол: на пляже площадью от area м² (вторая — от area2), площадка len × wid м вдоль берега, до воды ≥ water, до
  // стены ≥ wall
  court: { area: 9000, area2: 18000, len: 18, wid: 10, water: 6, wall: 5, best: 20 },
  // лодки клуба (Fragata, фото Commons c13, c14, SV 09): парк в круге at ± r, ряды поперёк берега, катамараны с долей cat;
  // водные велосипеды (c29) — по n у каждого бара, у воды
  boats: { parks: [{ at: [-448, -178], r: 26 }], col: 3.2, row: 6.6, water: 6, cat: 0.55, pedalo: { n: 4, step: 2.4, water: 5 } },
  colors: {
    own: [0xd8352a, 0xf08a1c, 0xf2d230, 0x3aa856, 0x2b7fd0, 0xe0559a, 0x2fb3b0, 0x7a4fc0, 0xf4f0e8],  // c01: красный, оранжевый, жёлтый, зелёный, синий, розовый, бирюза, фиолетовый, белый
    dinghy: [0xf2f1ec, 0x2f6fb5, 0xc9362e, 0xe8c533],                                                  // c14: белый, синий, красный, жёлтый
  },
  glow: { color: 0xffd29a, size: 1.3, poolColor: 0xffc27a, pool: 4 },
};

const SITGES_ST_E = {
  id: 'E', name: 'пляж', ready: true,

  plan(C, S) {
    const E = stBeachCfg, r2 = v => Math.round(v * 100) / 100, h = S.hash;
    const out = { lounger: [], umbrella: [], own: [], bar: [], deck: [], table: [], chair: [], tower: [], court: [], boat: [], pedalo: [],
      stats: { beaches: 0, blocks: 0, rented: 0, units: 0, bars: 0, barSkip: 0, towers: 0, courts: 0, boats: 0, pedalos: 0, own: 0 } };
    const st = out.stats, D = C.street.groups.D || { walls: [], desc: [] };

    /* ---------- пляжи, вода, стены ---------- */
    const beaches = C.areas.filter(a => a.kind === 'beach' || a.kind === 'sand').map(a => ({ ring: a.ring, bb: sitgesBBox(a.ring), area: Math.abs(sitgesArea(a.ring)) }));
    st.beaches = beaches.length;
    const beachOf = (x, z) => beaches.find(b => x >= b.bb[0] && x <= b.bb[1] && z >= b.bb[2] && z <= b.bb[3] && sitgesInPoly(x, z, b.ring));
    const water = (x, z) => S.coastD(x, z, 60);
    const sand = (x, z, w = 0) => !!beachOf(x, z) && C.ground(x, z) > 0.2 && water(x, z) >= w;
    const walls = D.walls.map(w => ({ pts: w.pts, a: w.a || sitgesStWallLen(w.pts) }));
    const wallC = sitgesCells(32);
    walls.forEach(w => { for (let i = 1; i < w.pts.length; i++) { const p = w.pts[i - 1], q = w.pts[i]; wallC.add(Math.min(p[0], q[0]), Math.max(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[1], q[1]), [p, q]); } });
    const wallD = (x, z, R = 30) => {
      let d = R;
      wallC.each(x - R, x + R, z - R, z + R, l => { for (const [p, q] of l) d = Math.min(d, sitgesSeg(x, z, p[0], p[1], q[0], q[1])); });
      return d;
    };
    // к морю: против роста расстояния до берега (у стены — от стены)
    const seaDir = (x, z) => {
      const gx = water(x + 1, z) - water(x - 1, z), gz = water(x, z + 1) - water(x, z - 1), l = Math.hypot(gx, gz);
      return l > 1e-6 ? [-gx / l, -gz / l] : [0, -1];
    };
    const ryOf = (sx, sz) => Math.atan2(sx, sz);
    const take = (x, z, r, x2 = x, z2 = z) => S.reserve(x, z, r, 'E', x2, z2);
    // прямоугольник len (вдоль t) × wid (вдоль s) вокруг (x, z): углы и середины сторон на песке, до воды ≥ w, до стены ≥ wd
    const rectOk = (x, z, tx, tz, sx, sz, len, wid, w, wd) => {
      for (const a of [-0.5, 0, 0.5]) for (const b of [-0.5, 0, 0.5]) {
        const px = x + tx * a * len + sx * b * wid, pz = z + tz * a * len + sz * b * wid;
        if (!sand(px, pz, w) || (wd && wallD(px, pz, wd) < wd)) return false;
      }
      return true;
    };

    /* ---------- бары у стел пляжных заведений ---------- */
    const B = E.bar, bars = [];
    for (const s of C.signs) {
      if (s.form !== 'totem' || !B.cats.includes(s.cat)) continue;
      // от стелы в сторону заведения (против нормали стелы) до первого песка; нет — от стелы к морю (стела стоит
      // у тротуара по одному из 16 направлений от заведения — не всегда со стороны пляжа)
      let hit = null;
      for (const [ux, uz] of [[-s.nx, -s.nz], seaDir(s.x, s.z)]) {
        for (let d = 0; d <= B.ray && !hit; d += 0.5) {
          const x = s.x + ux * d, z = s.z + uz * d;
          if (sand(x, z) && wallD(x, z, B.back) >= B.back) hit = [x, z];
        }
        if (hit) break;
      }
      if (!hit || bars.some(b => Math.hypot(b.x - hit[0], b.z - hit[1]) < B.dedupe)) { st.barSkip++; continue; }
      const club = s.cat === 'club' || /beach\s*club|beso/i.test(s.text || '') ? 1 : 0, K = B.kiosk[club], Dk = B.deck[club];
      const [sx, sz] = wallD(hit[0], hit[1], 12) < 12 ? (() => { const w = nearestWall(hit[0], hit[1]); return w ? [-w.nx, -w.nz] : seaDir(...hit); })() : seaDir(...hit);
      const tx = -sz, tz = sx, depth = K.d + Dk.d, wid = Math.max(K.w, Dk.w);
      let placed = null;
      for (let sh = 0; sh <= 6 && !placed; sh += 1) {
        const cx = hit[0] + sx * (depth / 2 + sh), cz = hit[1] + sz * (depth / 2 + sh);
        if (!rectOk(cx, cz, tx, tz, sx, sz, wid, depth, B.water, 0)) continue;
        if (!S.free(cx, cz, depth / 2 + 0.3, null, cx, cz) || !S.free(cx - tx * wid / 2, cz - tz * wid / 2, depth / 2, null, cx + tx * wid / 2, cz + tz * wid / 2)) continue;
        placed = [cx, cz];
      }
      if (!placed) { st.barSkip++; continue; }
      const [cx, cz] = placed, ry = ryOf(sx, sz);
      take(cx - tx * wid / 2, cz - tz * wid / 2, depth / 2 + 0.5, cx + tx * wid / 2, cz + tz * wid / 2);
      const kx = cx - sx * (depth / 2 - K.d / 2), kz = cz - sz * (depth / 2 - K.d / 2);       // киоск — к стене
      const dx = cx + sx * (depth / 2 - Dk.d / 2), dz = cz + sz * (depth / 2 - Dk.d / 2);      // настил — к морю
      const y = Math.max(...[[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([a, b]) => C.ground(dx + tx * a * Dk.w / 2 + sx * b * Dk.d / 2, dz + tz * a * Dk.w / 2 + sz * b * Dk.d / 2)));
      out.bar.push([r2(kx), r2(kz), r2(ry), club, r2(y)]);
      out.deck.push([r2(dx), r2(dz), r2(ry), club, r2(y)]);
      bars.push({ x: cx, z: cz, sx, sz, club, text: s.text });
      // столики на настиле: по ряду вдоль киоска, стулья по бокам
      const n = club ? 4 : 2, rowsT = club ? 2 : 1;
      for (let j = 0; j < rowsT; j++) for (let i = 0; i < n; i++) {
        const u = (i - (n - 1) / 2) * (Dk.w / n), v = -Dk.d / 2 + 1.4 + j * 2.6, x = dx + tx * u + sx * v, z = dz + tz * u + sz * v;
        out.table.push([r2(x), r2(z), r2(ry)]);
        for (const sg of [-1, 1]) out.chair.push([r2(x + tx * sg * 0.62), r2(z + tz * sg * 0.62), r2(ry - sg * Math.PI / 2)]);
      }
      st.bars++;
    }
    function nearestWall(x, z) {
      let best = null, bd = Infinity;
      for (const w of walls) for (let i = 1; i < w.pts.length; i++) {
        const p = w.pts[i - 1], q = w.pts[i], d = sitgesSeg(x, z, p[0], p[1], q[0], q[1]);
        if (d < bd) { bd = d; best = { nx: p[2], nz: p[3] }; }
      }
      return best;
    }

    /* ---------- лодки клуба на пляже Fragata ---------- */
    const Bt = E.boats;
    for (const park of Bt.parks) {
      const [px, pz] = park.at, [sx, sz] = seaDir(px, pz), tx = -sz, tz = sx, ry = ryOf(sx, sz);
      for (let v = -park.r; v <= park.r; v += Bt.row) for (let u = -park.r; u <= park.r; u += Bt.col) {
        if (Math.hypot(u, v) > park.r) continue;
        const x = px + tx * u + sx * v, z = pz + tz * u + sz * v;
        const cat = h(x, z, 31) < Bt.cat ? 1 : 0, half = cat ? 2.6 : 2.1;
        if (!sand(x + sx * half, z + sz * half, Bt.water) || !sand(x - sx * half, z - sz * half)) continue;
        if (!S.free(x - sx * half, z - sz * half, 1.3, null, x + sx * half, z + sz * half)) continue;
        take(x - sx * half, z - sz * half, 1.3, x + sx * half, z + sz * half);
        out.boat.push([r2(x), r2(z), r2(ry + (h(x, z, 32) - 0.5) * 0.12), cat, Math.floor(h(x, z, 33) * E.colors.dinghy.length)]);
        st.boats++;
      }
    }

    /* ---------- волейбол и вышки: по пляжам вдоль длинной стороны ---------- */
    const Tw = E.tower, Ct = E.court;
    for (const b of beaches) {
      if (b.area < Tw.area) continue;
      const alongX = b.bb[1] - b.bb[0] >= b.bb[3] - b.bb[2], lo = alongX ? b.bb[0] : b.bb[2], hi = alongX ? b.bb[1] : b.bb[3];
      const cand = [];
      for (let x = Math.ceil(b.bb[0] / 3) * 3; x <= b.bb[1]; x += 3) for (let z = Math.ceil(b.bb[2] / 3) * 3; z <= b.bb[3]; z += 3) {
        if (!sitgesInPoly(x, z, b.ring) || C.ground(x, z) <= 0.2) continue;
        cand.push({ x, z, w: water(x, z), k: alongX ? x : z });
      }
      // волейбол: в средней и в дальних четвертях пляжа (вторая площадка — у большого)
      const nC = b.area >= Ct.area2 ? 2 : b.area >= Ct.area ? 1 : 0;
      for (let i = 0; i < nC; i++) {
        const mid = lo + (hi - lo) * (nC === 1 ? 0.5 : i ? 0.72 : 0.28);
        const list = cand.filter(c => c.w >= Ct.water + Ct.wid / 2).sort((p, q) => Math.abs(p.k - mid) + Math.abs(p.w - Ct.best) * 2 - Math.abs(q.k - mid) - Math.abs(q.w - Ct.best) * 2);
        for (const c of list.slice(0, 400)) {
          const [sx, sz] = seaDir(c.x, c.z), tx = -sz, tz = sx;
          if (!rectOk(c.x, c.z, tx, tz, sx, sz, Ct.len, Ct.wid, Ct.water, Ct.wall)) continue;
          if (!S.free(c.x - tx * Ct.len / 2, c.z - tz * Ct.len / 2, Ct.wid / 2, null, c.x + tx * Ct.len / 2, c.z + tz * Ct.len / 2)) continue;
          take(c.x - tx * Ct.len / 2, c.z - tz * Ct.len / 2, Ct.wid / 2, c.x + tx * Ct.len / 2, c.z + tz * Ct.len / 2);
          out.court.push([r2(c.x), r2(c.z), r2(ryOf(sx, sz))]); st.courts++;
          break;
        }
      }
      // вышки: по одной на span м вдоль пляжа, ближе к середине своего отрезка
      const nT = Math.max(1, Math.round((hi - lo) / Tw.span));
      for (let i = 0; i < nT; i++) {
        const mid = lo + (hi - lo) * (i + 0.5) / nT;
        const list = cand.filter(c => c.w >= Tw.water[0] && c.w <= Tw.water[1]).sort((p, q) => Math.abs(p.k - mid) + Math.abs(p.w - Tw.best) * 3 - Math.abs(q.k - mid) - Math.abs(q.w - Tw.best) * 3);
        for (const c of list.slice(0, 200)) {
          if (wallD(c.x, c.z, Tw.wall) < Tw.wall || !S.free(c.x, c.z, Tw.clear)) continue;
          take(c.x, c.z, Tw.r);
          const [sx, sz] = seaDir(c.x, c.z);
          out.tower.push([r2(c.x), r2(c.z), r2(ryOf(sx, sz))]); st.towers++;
          break;
        }
      }
    }

    /* ---------- прокат: пары лежаков под зонтом рядами у стены ---------- */
    const R = E.rent, Lg = E.lounger;
    walls.forEach(w => {
      const Ltot = w.a[w.a.length - 1];
      for (let a0 = 3; a0 + 10 <= Ltot - 3; a0 += R.block + R.gap) {
        const a1 = Math.min(a0 + R.block, Ltot - 3), P0 = sitgesStWallAt(w, (a0 + a1) / 2);
        st.blocks++;
        if (h(P0.x, P0.z, 41) >= R.p) continue;
        st.rented++;
        const club = bars.some(b => b.club && Math.hypot(b.x - P0.x, b.z - P0.z) < R.club) ? 1 : 0;
        const rows = R.rows[0] + Math.floor(h(P0.x, P0.z, 42) * (R.rows[1] - R.rows[0] + 1));
        const pitch = club ? R.pitchClub : R.pitch;
        let k = 0;
        for (let a = a0 + pitch / 2; a <= a1 - pitch / 2; a += pitch, k++) {
          if (k % R.aisle === R.aisle - 1) continue;                     // проход к воде
          const P = sitgesStWallAt(w, a), sx = -P.nx, sz = -P.nz, tx = -sz, tz = sx, ry = ryOf(sx, sz);
          for (let j = 0; j < rows; j++) {
            const o = R.first + j * R.row, x = P.x + sx * o, z = P.z + sz * o;
            if (!sand(x, z, R.water) || !sand(x + sx * 1.5, z + sz * 1.5) || !S.free(x, z, R.r)) continue;
            take(x, z, R.r);
            out.umbrella.push([r2(x), r2(z), r2(ry + h(x, z, 43) * 0.8), club]);
            for (const sg of [-1, 1]) {
              const lx = x + tx * sg * Lg.side + sx * Lg.sea, lz = z + tz * sg * Lg.side + sz * Lg.sea;
              out.lounger.push([r2(lx), r2(lz), r2(ry + (h(lx, lz, 44) - 0.5) * 0.1), club]);
            }
            st.units++;
          }
        }
      }
    });

    /* ---------- водные велосипеды у баров ---------- */
    const Pd = Bt.pedalo;
    for (const b of bars) {
      let d = 0;
      while (d < 60 && water(b.x + b.sx * d, b.z + b.sz * d) > Pd.water + 1) d += 1;
      const tx = -b.sz, tz = b.sx;
      for (let i = 0; i < Pd.n; i++) {
        const u = (i - (Pd.n - 1) / 2) * Pd.step + 6, x = b.x + b.sx * d + tx * u, z = b.z + b.sz * d + tz * u;
        if (!sand(x, z, 2.5) || !S.free(x, z, 1.1)) continue;
        take(x, z, 1.1);
        out.pedalo.push([r2(x), r2(z), r2(Math.atan2(b.sx, b.sz) + (h(x, z, 51) - 0.5) * 0.3)]); st.pedalos++;
      }
    }

    /* ---------- свои зонты и полотенца отдыхающих ---------- */
    const O = E.own;
    for (const b of beaches) {
      for (let gx = Math.ceil(b.bb[0] / O.step) * O.step; gx <= b.bb[1]; gx += O.step) for (let gz = Math.ceil(b.bb[2] / O.step) * O.step; gz <= b.bb[3]; gz += O.step) {
        if (h(gx, gz, 61) >= O.p) continue;
        const x = gx + (h(gx, gz, 62) - 0.5) * O.step * 0.8, z = gz + (h(gx, gz, 63) - 0.5) * O.step * 0.8;
        if (!sitgesInPoly(x, z, b.ring) || C.ground(x, z) <= 0.2) continue;
        const w = water(x, z);
        if (w < O.water[0] || w > O.water[1] || wallD(x, z, O.wall) < O.wall || !S.free(x, z, O.r)) continue;
        take(x, z, O.r * 0.8);
        const [sx, sz] = seaDir(x, z);
        out.own.push([r2(x), r2(z), r2(ryOf(sx, sz) + (h(x, z, 64) - 0.5) * 1.2), Math.floor(h(x, z, 65) * E.colors.own.length)]);
        st.own++;
      }
    }
    return out;
  },

  build(K, S, L) {
    if (!L) return;
    const M = stBeachModels(S), F = stTerrModels(S), Cl = stBeachCfg.colors, G = stBeachCfg.glow, Bc = stBeachCfg.bar;
    const light = (mass, cy, kind, o = {}) => Object.assign({ mass, cy, lie: 1.45, light: true, kind }, o);
    // бары: настил — поверхность (S.walk, без своих столкновений: 0,2 м — машина въезжает), киоск — ящик
    for (const [x, z, ry, club, y] of L.deck) {
      const D = Bc.deck[club], c = Math.cos(ry), s = Math.sin(ry), top = y + 0.2;
      const pt = (u, v) => [x + u * c + v * s, z - u * s + v * c];
      S.walk([pt(-D.w / 2, -D.d / 2), pt(D.w / 2, -D.d / 2), pt(D.w / 2, D.d / 2), pt(-D.w / 2, D.d / 2)], top);
    }
    for (const club of [0, 1]) {
      const kk = Bc.kiosk[club];
      S.place(M.kiosk[club], L.bar.filter(b => b[3] === club).map(([x, z, ry]) => ({ x, z, ry })), { box: { w: kk.w, d: kk.d, h: 3.2 } });
      S.place(M.deck[club], L.deck.filter(b => b[3] === club).map(([x, z, ry, , y]) => ({ x, z, ry, y })));
    }
    // пергола клуба над настилом: столбы — круги в сетке
    const perg = L.deck.filter(b => b[3] === 1);
    for (const [x, z, ry] of perg) for (const [u, v] of M.pergolaPosts) S.circle(x + u * Math.cos(ry) + v * Math.sin(ry), z - u * Math.sin(ry) + v * Math.cos(ry), 0.12, 2.8);
    S.place(F.table[0], L.table.map(([x, z, ry]) => ({ x, z, ry })), { brk: light(16, 0.5, 'metal'), hit: { r: 0.38, h: 0.75 } });
    S.place(F.chair[0], L.chair.map(([x, z, ry]) => ({ x, z, ry })), { brk: light(5, 0.45, 'metal'), hit: { r: 0.25, h: 0.9 } });
    // ночью у бара — тёплый ореол под навесом и пятно света на настиле
    S.lights(L.bar.map(([x, z, ry, club, y]) => {
      const d = Bc.kiosk[club].d / 2 + 0.9, lx = x + Math.sin(ry) * d, lz = z + Math.cos(ry) * d;
      return { x: lx, y: y + 2.5, z: lz, gx: lx + Math.sin(ry) * 1.2, gz: lz + Math.cos(ry) * 1.2, r: G.pool };
    }), { color: G.color, size: G.size, poolColor: G.poolColor });

    // прокат: лежаки (синие — прокат, белые — клуб), зонты (сине-белые клинья — прокат, белые квадратные F — клуб)
    for (const v of [0, 1]) {
      S.place(M.lounger[v], L.lounger.filter(l => l[3] === v).map(([x, z, ry]) => ({ x, z, ry })), { brk: light(9, 0.25, 'plastic', { lie: 0.3 }), hit: { r: 0.45, h: 0.6 } });
      S.place(v ? F.parasol : M.umbrella, L.umbrella.filter(u => u[3] === v).map(([x, z, ry]) => ({ x, z, ry })), { brk: light(10, 1.2, 'wood', { lie: 1.5 }), hit: { r: 0.1, h: 2.4 } });
    }
    // свои зонты с полотенцем — цветом экземпляра
    S.place(M.own, L.own.map(([x, z, ry, c]) => ({ x, z, ry, color: Cl.own[c] })), { brk: light(6, 1.1, 'plastic', { lie: 1.5 }), hit: { r: 0.1, h: 2.2 } });
    // вышки спасателей
    S.place(M.tower, L.tower.map(([x, z, ry]) => ({ x, z, ry })), { box: { w: 2.4, d: 2.4, h: 3.1 } });
    // волейбол: сетка без столкновений, столбы — круги
    S.place(M.court, L.court.map(([x, z, ry]) => ({ x, z, ry })));
    for (const [x, z, ry] of L.court) for (const sg of [-1, 1]) S.circle(x + sg * M.courtPole * Math.sin(ry), z + sg * M.courtPole * Math.cos(ry), 0.1, 2.5);
    // лодки клуба (неподвижные): катамараны и швертботы по цветам
    S.place(M.cat, L.boat.filter(b => b[3] === 1).map(([x, z, ry]) => ({ x, z, ry })), { box: { w: 2.4, d: 5.2, h: 1.2 } });
    Cl.dinghy.forEach((col, c) => S.place(M.dinghy(col), L.boat.filter(b => b[3] === 0 && b[4] === c).map(([x, z, ry]) => ({ x, z, ry })), { box: { w: 1.4, d: 4.2, h: 0.9 } }));
    // водные велосипеды — тяжёлые сбиваемые
    S.place(M.pedalo, L.pedalo.map(([x, z, ry]) => ({ x, z, ry })), { brk: { mass: 90, cy: 0.4, lie: 1.2, light: false, kind: 'plastic' }, hit: { r: 0.9, h: 1.1 } });
  },
};

// Модели пляжа (свои координаты: основание y = 0, «лицо» — к +z, к морю). Mid-poly: ящики, конусы, цилиндры.
function stBeachModels(S) {
  const Bx = (w, h, d, x = 0, y = 0, z = 0, rx = 0, ry = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rx) g.rotateX(rx);
    if (ry) g.rotateY(ry);
    return g.translate(x, y, z);
  };
  const Cy = (rt, rb, h, seg, x = 0, y = 0, z = 0, open = true) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open).translate(x, y, z);
  const mg = list => mergeGeometries(list.map(g => g.index ? g.toNonIndexed() : g));
  const white = S.mat(0xf4f3ee, { roughness: 0.6 }), blue = S.mat(0x1f5fa8, { roughness: 0.7 }), metal = S.mat(0xa4a8ab, { roughness: 0.4, metalness: 0.5 });
  const dark = S.mat(0x26292c, { roughness: 0.6 }), wood = S.mat(0x9b7a52, { roughness: 0.85 });

  /* лежак проката (D/04, c02, SV 03): белая рама, синий матрас; клуб (c27) — белый с бежевым матрасом; ноги к +z */
  const frame = mg([Bx(0.66, 0.05, 1.25, 0, 0.32, 0.3), Bx(0.66, 0.05, 0.72, 0, 0.48, -0.55, 0.5), Bx(0.62, 0.26, 0.05, 0, 0.16, 0.8), Bx(0.62, 0.3, 0.05, 0, 0.15, -0.45)]);
  const pad = mg([Bx(0.6, 0.05, 1.2, 0, 0.37, 0.3), Bx(0.6, 0.05, 0.66, 0, 0.53, -0.53, 0.5)]);
  const lounger = [[{ geo: frame, mat: white }, { geo: pad, mat: blue }], [{ geo: frame, mat: white }, { geo: pad, mat: S.mat(0xe6dcc4, { roughness: 0.8 }) }]];

  /* зонт проката: 8 клиньев, синие и белые через один (D/04, c02), шест; диаметр 2,1 м */
  const wedge = i => new THREE.ConeGeometry(1.05, 0.38, 1, 1, true, i * Math.PI / 4, Math.PI / 4).translate(0, 2.3, 0);
  const umbrella = [{ geo: mg([0, 2, 4, 6].map(wedge)), mat: blue, shadow: true }, { geo: mg([1, 3, 5, 7].map(wedge)), mat: white },
    { geo: mg([Cy(0.022, 0.022, 2.5, 5, 0, 1.2, 0), Cy(0.04, 0.04, 0.1, 5, 0, 2.52, 0, false)]), mat: metal }];

  /* свой зонт с полотенцем (c01, c19): купол цветом экземпляра, шест тёмный, полотенце сбоку */
  const own = [{ geo: mg([new THREE.ConeGeometry(0.95, 0.35, 8, 1, true).translate(0, 2.05, 0), Bx(0.8, 0.012, 1.7, 0.75, 0.01, 0.4)]), mat: S.mat(0xffffff, { roughness: 0.7 }) },
    { geo: Cy(0.018, 0.018, 2.15, 4, 0, 1.02, 0), mat: S.mat(0x3a3a3c, { roughness: 0.5 }) }];

  /* киоск-чирингито (SV 08, Commons c11, c12): белая коробка, синяя полоса поверху, плоская крыша с выносом, прилавок
     с тёмным окном к морю, навес синий; клуб — шире */
  const kiosk = [0, 1].map(club => {
    const { w, d } = stBeachCfg.bar.kiosk[club], hh = 2.8;
    return [
      { geo: mg([Bx(w, hh, d, 0, hh / 2, 0), Bx(w + 0.6, 0.15, d + 0.6, 0, hh + 0.08, 0)]), mat: white },
      { geo: mg([Bx(w + 0.04, 0.45, d + 0.04, 0, hh - 0.3, 0), Bx(w * 0.92, 0.04, 1.5, 0, hh - 0.55, d / 2 + 0.68, 0.32)]), mat: blue },
      { geo: mg([Bx(w * 0.8, 1.0, 0.06, 0, 1.6, d / 2 + 0.01)]), mat: dark },
      { geo: mg([Bx(w * 0.84, 0.08, 0.45, 0, 1.08, d / 2 + 0.2)]), mat: wood },
    ];
  });
  /* настил: доски на брусьях, высота 0,2 м; у клуба — белая пергола над ним (SV 12: белые арки Beso) */
  const pergolaPosts = [];
  const deck = [0, 1].map(club => {
    const { w, d } = stBeachCfg.bar.deck[club], parts = [{ geo: mg([Bx(w, 0.6, d, 0, -0.1, 0)]), mat: wood }];
    if (club) {
      const posts = [], top = [];
      for (const u of [-w / 2 + 0.2, -w / 6, w / 6, w / 2 - 0.2]) for (const v of [-d / 2 + 0.2, d / 2 - 0.2]) { posts.push(Bx(0.16, 2.8, 0.16, u, 1.4, v)); pergolaPosts.push([u, v]); }
      for (const v of [-d / 2 + 0.2, d / 2 - 0.2]) top.push(Bx(w, 0.22, 0.16, 0, 2.85, v));
      for (let u = -w / 2 + 0.4; u <= w / 2 - 0.3; u += 0.6) top.push(Bx(0.08, 0.1, d, u, 3.0, 0));
      parts.push({ geo: mg([...posts, ...top]), mat: white });
    }
    return parts;
  });

  /* вышка спасателей (SV 11, 06): белое основание, жёлтая будка с тёмным окном, белая крыша, флагшток с зелёным флагом */
  const tower = [
    { geo: mg([Bx(2.4, 1.0, 2.4, 0, 0.5, 0), Bx(2.5, 0.12, 2.3, 0, 2.98, 0)]), mat: white },
    { geo: mg([Bx(2.0, 1.9, 1.8, 0, 1.95, -0.1)]), mat: S.mat(0xf0c21c, { roughness: 0.6 }) },
    { geo: mg([Bx(2.02, 0.5, 1.82, 0, 2.35, -0.1)]), mat: dark },
    { geo: mg([Cy(0.04, 0.04, 6, 5, 1.05, 3, -0.95)]), mat: metal },
    { geo: mg([Bx(0.02, 0.6, 0.9, 1.05, 5.6, -0.48)]), mat: S.mat(0x2aa24a, { roughness: 0.8 }) },
  ];

  /* волейбол (c18, c22): площадка 16 × 8 вдоль берега (ось x модели), сетка поперёк — вдоль z, столбы в P м от середины;
     сетка 9,5 × 1 м с белой лентой, разметка синей лентой */
  const P = 5, L = 16, W = 8;
  const court = [
    { geo: mg([Cy(0.05, 0.05, 2.55, 6, 0, 1.27, -P), Cy(0.05, 0.05, 2.55, 6, 0, 1.27, P)]), mat: metal },
    { geo: mg([Bx(0.015, 0.9, P * 2 - 0.2, 0, 1.95, 0)]), mat: S.mat(0x1c1d20, { roughness: 0.9, transparent: true, opacity: 0.55 }), shadow: false },
    { geo: mg([Bx(0.03, 0.07, P * 2 - 0.2, 0, 2.43, 0)]), mat: white },
    { geo: mg([Bx(L, 0.012, 0.06, 0, 0.01, -W / 2), Bx(L, 0.012, 0.06, 0, 0.01, W / 2), Bx(0.06, 0.012, W, -L / 2, 0.01, 0), Bx(0.06, 0.012, W, L / 2, 0.01, 0)]), mat: blue, shadow: false },
  ];

  /* катамаран клуба (c13, c14, SV 09, 12): два белых корпуса на тележке, тёмная сетка, мачта 8,5 м с гиком; нос к морю */
  const hull = (x, len, w, hh) => new THREE.CylinderGeometry(w, w * 0.6, len, 6, 1, false).rotateX(Math.PI / 2).scale(1, hh / w, 1).translate(x, 0.55, 0);
  const cat = [
    { geo: mg([hull(-1.0, 5.0, 0.26, 0.3), hull(1.0, 5.0, 0.26, 0.3)]), mat: white },
    { geo: mg([Bx(2.0, 0.05, 2.4, 0, 0.78, -0.6)]), mat: S.mat(0x1f3550, { roughness: 0.9 }) },
    { geo: mg([Cy(0.045, 0.06, 8.5, 5, 0, 5.0, 0.0), Bx(0.06, 0.06, 2.6, 0, 1.6, -1.3), Bx(2.2, 0.06, 0.06, 0, 0.8, 0.6), Bx(2.2, 0.06, 0.06, 0, 0.8, -1.6)]), mat: metal },
    { geo: mg([Bx(0.1, 0.25, 0.1, -1.0, 0.12, 1.4), Bx(0.1, 0.25, 0.1, 1.0, 0.12, 1.4), Bx(0.1, 0.25, 0.1, -1.0, 0.12, -1.6), Bx(0.1, 0.25, 0.1, 1.0, 0.12, -1.6)]), mat: dark },
  ];
  /* швертбот: корпус цветом, белая палуба, мачта 6 м */
  const dinghy = col => [
    { geo: mg([new THREE.CylinderGeometry(0.7, 0.4, 4.0, 6, 1, false).rotateX(Math.PI / 2).scale(1, 0.4, 1).translate(0, 0.42, 0)]), mat: S.mat(col, { roughness: 0.55 }) },
    { geo: mg([Bx(1.1, 0.04, 2.6, 0, 0.7, -0.3)]), mat: white },
    { geo: mg([Cy(0.035, 0.045, 6.0, 5, 0, 3.7, 0.5), Bx(0.05, 0.05, 2.2, 0, 1.4, -0.6)]), mat: metal },
  ];

  /* водный велосипед (c29): два жёлтых поплавка, белое сиденье со спинкой */
  const pedalo = [
    { geo: mg([Bx(0.5, 0.45, 3.4, -0.75, 0.25, 0), Bx(0.5, 0.45, 3.4, 0.75, 0.25, 0)]), mat: S.mat(0xf2c814, { roughness: 0.5 }) },
    { geo: mg([Bx(1.9, 0.12, 1.4, 0, 0.55, -0.2), Bx(1.5, 0.5, 0.1, 0, 0.85, -0.85, -0.25)]), mat: white },
  ];

  return { lounger, umbrella, own, kiosk, deck, pergolaPosts, tower, court, courtPole: P, cat, dinghy, pedalo };
}
