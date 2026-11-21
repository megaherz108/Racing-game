// Ситжес — этап 7, группа F: террасы (план — docs/sitges/stage-7.md, архив группы — docs/sitges/st-f.md).
// Что входит: столики, стулья, зонты, кадки и штендеры у заведений с едой и напитками (C.signs: ресторан, кафе, бар,
// мороженое; пекарня и фастфуд — малые, по хешу; клуб — нет); вынос маркиз над террасой 3–5 м — данные awn,
// рисует signs3d.js (вывески строятся раньше мелочей улиц, раскладка к тому времени готова).
// Место — перед стеной вывески: лучи по нормали от стены (у краёв и посередине доски) до дома напротив, проезжей
// части, забора, перепада или воды → глубина U; терраса — от стены на T = U − проход (тротуар у мостовой — 1,5 м;
// пешеходная улица — половина ширины без 0,75 м: проход посередине; площадь, променад — до 5 м). Проход к двери
// заведения (C.doors) свободен (полоса занята 'F'). Столики рядами: узкая терраса — у стены, стулья по бокам
// («бистро»); шире — ряды, стулья лицом друг к другу (у части — по четыре). Зонты — между парами столиков, где нет
// маркизы над рядом. Кадки — по бокам террасы, на набережной ещё ряд у бордюра (кадры 02, 04 Ribera); штендер —
// у прохода к двери. Вид — по кадрам Street View (raw/photos/sv/signs, sv/oldtown, sv/seafront; разбор — st-f.md):
// набережная — плетёные стулья, белые столы, белые ящики с кустами, большие квадратные зонты; старый город —
// алюминиевые стулья, круглые столики, глиняные горшки.
// Договор (docs/sitges/stage-7.md, «Каркас»):
//   plan(C, S) — раскладка (js/maps/sitges/street.js, группы по порядку A → G): места — помощники S (C.street),
//     занятое — S.reserve(…, 'F'); вернуть данные группы (только данные, без функций) → C.street.groups.F:
//     { table: [[x, z, ry, вид, цвет]], chair: [[x, z, ry, вид, цвет]], parasol: [[x, z, ry, цвет]],
//       planter: [[x, z, ry, вид]], board: [[x, z, ry]], awn: [[индекс в C.signs, вынос, перепад]], stats } —
//     ry: +z модели — «лицо» (стул — куда смотрит сидящий); вид стола 0 — квадратный, 1 — круглый; стула 0 —
//     алюминиевый, 1 — плетёный; кадки 0 — белый ящик, 1 — бетонная чаша, 2 — глиняный горшок; цвет — индекс
//     в stTerrCfg.colors.<вид>; awn — маркиза: вынос от стены, м, и перепад от крепления до верха фестона, м.
//   build(K, S, L) — постройка (js/maps/sitges/street3d.js): S — помощники постройки (K.st), L — данные из plan.
// Всё сбиваемое (стулья, столы и зонты лёгкие — улетают; кадки тяжёлые). Случайного нет: S.hash по месту.
// Определяет: stTerrCfg, SITGES_ST_F, stTerrTents, stTerrModels.
// Использует: clamp (js/core.js); sitgesCells, sitgesSeg (js/maps/sitges/geom.js); SITGES_SIGNS
//   (js/maps/sitges/signs.js); frame (js/main.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const stTerrCfg = {
  // виды вывесок: терраса всегда / малая по хешу (доля) / нет
  cats: { restaurant: 1, cafe: 1, bar: 1, icecream: 1, bakery: 0.5, fastfood: 0.5 },
  generic: 0.5,          // типовая вывеска («Bar», «Restaurant») — терраса с такой долей
  probe: { step: 0.25, max: 8, start: 0.3, drop: 0.6, sea: 0.2 },   // лучи от стены; перепад рельефа и вода — конец
  pass: 1.5,             // проход у бордюра, м
  lane: 0.75,            // пешеходная улица: от середины до террасы, м
  maxT: 5, minT: 0.8,    // глубина террасы, м
  maxOpen: 6.5,          // на открытой площадке набережной (Costa Dorada: под маркизой и под зонтами)
  half: [1.2, 5],        // полуширина вдоль стены, м: полуширина вывески + wide (набережная, старый город, остальное)
  wide: [1.4, 0.7, 0.3],
  rayStep: 1.0, rayMin: 1.0,   // лучи вдоль стены через столько м; крайний короче rayMin — терраса уже
  door: 0.6,             // полуширина прохода к двери, м
  crossD: 1.8,           // переход OSM: у бордюра на столько м свободно, дальше к стене — можно террасу
  row: 1.9, wall: 0.3,   // шаг рядов; от стены до спинки стула первого ряда
  col: [1.6, 2.1],       // шаг столиков вдоль стены: на двоих / на четверых
  bistro: 1.9,           // узкая терраса (T < 2): столик у стены, стулья по бокам, шаг
  four: 0.35,            // доля заведений со столиками на четверых
  small: 2,              // малая терраса (пекарня, фастфуд) — не больше столиков
  parasol: { size: 2.5, minT: 1.6 },
  // кадки: по бокам террасы в side м; ряд у бордюра (в curb м от него, шаг step), если проход до террасы ≥ pass; на тротуаре
  // набережной шире wideU терраса короче на row — под ряд кадок (кадры 02, 04 Ribera)
  planter: { side: 0.45, step: 2.6, curb: 0.45, pass: 1.2, wideU: 5, row: 0.9 },
  // тент бара на набережной: доля, ширина, вынос, высота фестона, под доской на under м (без доски — y над землёй), gap — wallFit
  // minDrop — тент под доской почти плоский (складные локти), перепад не меньше
  tent: { p: 0.7, w: [2.4, 8], d: 4, h: 0.3, under: 0.12, y: 3.0, gap: 0.3, minDrop: 0.12 },
  board: 0.75,           // доля заведений со штендером
  // маркиза над террасой: вынос (на открытой площади — open, дальше зонты), наклон (перепад / вынос) не круче slope,
  // низ фестона над землёй — low, не ниже clear; до бордюра не ближе curb
  awn: { minT: 1.5, max: 5, open: 3.5, slope: 0.35, minDrop: 0.3, clear: 2.2, low: 2.4, curb: 0.6 },
  seaR: 130,             // набережная: берег ближе стольких метров перед фасадом
  // ночные огни под маркизой и тентом: ореол на below м ниже изнанки, пятно радиусом pool; шире wide м — два
  glow: { color: 0xffd29a, size: 1.2, poolColor: 0xffc27a, pool: 2.6, below: 0.15, wide: 5 },
  colors: {
    chair0: [0xa9adb1, 0x2b2b2d, 0xeeeeea, 0x7fbfae, 0x3d6e99, 0xb33a35, 0xd8a640],   // алюминий, чёрный, белый, мята, синий, красный, жёлтый
    chair1: [0xb58b5a, 0x8a6a48, 0xd9c3a0],                                          // плетёные
    table: [0xf1efe8, 0xb9bcbe, 0x6e4b33, 0x2c2c2e],                                 // белый, серый, дерево, чёрный
    parasol: [0xf3f0e6, 0xe9dcc0, 0xf3f0e6, 0x2f5d8a, 0xb5463a],
    tent: [0xe8dcc0, 0xe2b33c, 0xf2f0ea, 0x2f6b4a, 0x24406b, 0x7a2630, 0xe2b33c],              // кремовый, жёлтый, белый, зелёный, синий, бордовый
  },
};

const SITGES_ST_F = {
  id: 'F', name: 'террасы', ready: true,

  plan(C, S) {
    const F = stTerrCfg, P = F.probe, r2 = v => Math.round(v * 100) / 100;
    const out = { table: [], chair: [], parasol: [], planter: [], board: [], awn: [], tent: [],
      stats: { signs: 0, venues: 0, terraces: 0, bistro: 0, rows: 0, noRoom: 0, noDoor: 0, skipGeneric: 0, skipSmall: 0, awn: 0, awnLow: 0, tentSkip: 0,
        stop: {}, tableBusy: 0 } };
    const st = out.stats;

    /* ---------- заборы и берег по клеткам ---------- */
    const fcell = sitgesCells(16);
    for (const f of C.fences || []) for (let k = 1; k < f.P.length; k++) {
      const a = f.P[k - 1], b = f.P[k];
      fcell.add(Math.min(a[0], b[0]), Math.max(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[1], b[1]), [a, b]);
    }
    const cross = (ax, az, bx, bz, cx, cz, dx, dz) => {
      const d1 = (bx - ax) * (cz - az) - (bz - az) * (cx - ax), d2 = (bx - ax) * (dz - az) - (bz - az) * (dx - ax);
      const d3 = (dx - cx) * (az - cz) - (dz - cz) * (ax - cx), d4 = (dx - cx) * (bz - cz) - (dz - cz) * (bx - cx);
      return d1 * d2 < 0 && d3 * d4 < 0;
    };
    const fenceCut = (x0, z0, x1, z1) => {
      let hit = false;
      fcell.each(Math.min(x0, x1), Math.max(x0, x1), Math.min(z0, z1), Math.max(z0, z1), l => {
        if (!hit) for (const [a, b] of l) if (cross(x0, z0, x1, z1, a[0], a[1], b[0], b[1])) { hit = true; break; }
      });
      return hit;
    };
    const ccell = sitgesCells(64);
    for (const l of C.coast || []) for (let i = 1; i < l.length; i++) { const a = l[i - 1], b = l[i]; ccell.add(Math.min(a[0], b[0]), Math.max(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[1], b[1]), [a, b]); }
    const coastD = (x, z, R) => {
      let d = R;
      ccell.each(x - R, x + R, z - R, z + R, list => { for (const [a, b] of list) d = Math.min(d, sitgesSeg(x, z, a[0], a[1], b[0], b[1])); });
      return d;
    };

    /* ---------- луч от стены: до чего свободно ---------- */
    // → { U, why: house | road | fence | drop | open, ped } — ped: по пути была пешеходная улица
    const probe = (bx, bz, nx, nz, g0) => {
      let px = bx + nx * (P.start - P.step), pz = bz + nz * (P.start - P.step), ped = false;
      for (let v = P.start; v <= P.max; v += P.step) {
        const x = bx + nx * v, z = bz + nz * v;
        const stop = why => ({ U: v - P.step, why, ped });
        if (C.houseAt(x, z)) return stop('house');
        const c = S.carriage(x, z);
        if (c) { if (c.corner || c.st.cls !== 'pedestrian') return stop('road'); ped = true; }
        const g = C.ground(x, z);
        if (g < P.sea || Math.abs(g - g0) > P.drop) return stop('drop');
        if (fenceCut(px, pz, x, z)) return stop('fence');
        px = x; pz = z;
      }
      return { U: P.max, why: 'open', ped };
    };
    // свободно ли место: занятость всех групп, кроме кронштейнов фонарей на стене (малый круг у стены — высоко)
    // и полосы перед своей дверью (её проход — своя полоса 'F' шириной 2 · door, столики не ближе door + 0,7 к оси)
    let own = null;                                       // середина полосы своей двери
    const freeAt = (x, z, r, x2 = x, z2 = z, wx = 0, wz = 0, nx = 0, nz = 0) => {
      for (const o of S.hits(x, z, r, null, x2, z2)) {
        if (o.who === 'A' && o.r <= 0.2 && (o.x - wx) * nx + (o.z - wz) * nz < 0.6) continue;
        if (o.who === 'door' && own && Math.hypot((o.x + o.x2) / 2 - own[0], (o.z + o.z2) / 2 - own[1]) < 0.5) continue;
        // переход OSM — капсула поперёк улицы до стены: у стены, дальше crossD от бордюра, терраса не мешает
        if (o.who === 'cross') { const w = S.onWalk(x, z), w2 = S.onWalk(x2, z2); if (w && w2 && Math.min(w.d, w2.d) - r > F.crossD) continue; }
        return false;
      }
      return true;
    };
    const take = (x, z, r, x2 = x, z2 = z) => S.reserve(x, z, r, 'F', x2, z2);
    const ok = (x, z) => !C.houseAt(x, z) && !(c => c && (c.corner || c.st.cls !== 'pedestrian'))(S.carriage(x, z));

    /* ---------- вывески заведений с едой и напитками ---------- */
    const list = [];
    C.signs.forEach((s, i) => {
      if (!F.cats[s.cat] || !['board', 'awning', 'blade'].includes(s.form)) return;
      list.push(i);
    });
    // одно заведение — одна терраса: флажок рядом с доской или маркизой того же текста не считается
    const main = list.filter(i => {
      const s = C.signs[i];
      if (s.form !== 'blade') return true;
      return !list.some(j => j !== i && C.signs[j].form !== 'blade' && C.signs[j].text === s.text && Math.hypot(C.signs[j].x - s.x, C.signs[j].z - s.z) < 6);
    });
    // сначала заведения с названием, потом типовые
    main.sort((a, b) => (C.signs[a].generic - C.signs[b].generic) || a - b);
    st.signs = main.length;

    for (const i of main) {
      const s = C.signs[i], nx = s.nx, nz = s.nz, ux = nz, uz = -nx;
      const k = F.cats[s.cat];
      if (s.generic && S.hash(s.x, s.z, 40) > F.generic) { st.skipGeneric++; continue; }
      if (k < 1 && S.hash(s.x, s.z, 41) > k) { st.skipSmall++; continue; }
      st.venues++;
      const small = k < 1;
      const off = s.form === 'board' ? 0.06 : 0, bx = s.x - nx * off, bz = s.z - nz * off;
      const g0 = C.ground(bx + nx * 0.5, bz + nz * 0.5);
      const sea = nz < -0.3 && coastD(bx, bz, F.seaR) < F.seaR, town = S.oldTown(bx, bz);
      // вдоль стены: полуширина вывески с запасом (набережная — терраса во весь фасад, кадры 02, 04, 07)
      const half = clamp((s.form === 'blade' ? 1.6 : s.w) / 2 + (sea ? F.wide[0] : town ? F.wide[1] : F.wide[2]), F.half[0], F.half[1]);
      // лучи через ≈ 1 м вдоль стены; крайние, упёршиеся сразу (соседний дом выступает, забор), — терраса уже:
      // границы lo … hi (от середины вывески вдоль стены)
      const nR = Math.max(3, Math.ceil((2 * half - 0.6) / F.rayStep) + 1), rays = [];
      for (let k = 0; k < nR; k++) {
        const u = -half + 0.3 + (2 * half - 0.6) * k / (nR - 1);
        rays.push(Object.assign({ u }, probe(bx + ux * u, bz + uz * u, nx, nz, g0)));
      }
      let a0 = 0, a1 = nR - 1;
      while (a0 < a1 && rays[a0].U < F.rayMin) a0++;
      while (a1 > a0 && rays[a1].U < F.rayMin) a1--;
      const lo = a0 ? (rays[a0 - 1].u + rays[a0].u) / 2 : -half, hi = a1 < nR - 1 ? (rays[a1].u + rays[a1 + 1].u) / 2 : half;
      let U = Infinity, why = 'open', ped = false;
      for (let k = a0; k <= a1; k++) { const r = rays[k]; if (r.U < U) { U = r.U; why = r.why; } ped = ped || r.ped; }
      st.stop[why] = (st.stop[why] || 0) + 1;
      let T;
      if (why === 'road') T = U - F.pass - (sea && U >= F.planter.wideU ? F.planter.row : 0);
      else if (why === 'house') T = U < 2.5 ? 0 : Math.min(U / 2 - F.lane, 3);
      else if (why === 'open') T = sea ? F.maxOpen : F.maxT;
      else T = U - 1.0;
      T = Math.min(T, why === 'open' && sea ? F.maxOpen : F.maxT);
      const P2 = (u, v) => [bx + ux * u + nx * v, bz + uz * u + nz * v];

      // дверь заведения: на той же стене, в пределах террасы ± 1,5 м
      let ud = null;
      for (const d of C.doors) {
        const dx = d.x - bx, dz = d.z - bz;
        if (Math.abs(dx * nx + dz * nz) > 0.6 || d.nx * nx + d.nz * nz < 0.9) continue;
        const u = dx * ux + dz * uz;
        if (u > lo - 1.5 && u < hi + 1.5 && (ud === null || Math.abs(u) < Math.abs(ud))) ud = u;
      }
      if (ud === null) { ud = (lo + hi) / 2; st.noDoor++; own = null; } else own = P2(ud, 0.6);
      const depth = Math.max(T, 0) + 0.3;
      const [dx0, dz0] = P2(ud, 0.4), [dx1, dz1] = P2(ud, Math.max(depth, 1));
      take(dx0, dz0, F.door, dx1, dz1);

      // маркиза: вынос над террасой
      let awnD = 0;
      if (s.form === 'awning' && T >= F.awn.minT) {
        const A = F.awn, Aw = SITGES_SIGNS.awning;
        let d = Math.min(T + 0.3, why === 'open' ? A.open : A.max);
        if (why === 'road') d = Math.min(d, U - A.curb);
        const yA = s.y + s.h / 2 + Aw.drop;              // крепление у стены
        const [ox, oz] = P2(0, d), go = Math.max(C.ground(ox, oz), g0) + 0.15;
        const dropMax = yA - s.h - go - A.clear;
        if (d > Aw.d + 0.2 && dropMax >= A.minDrop) {
          // фестон низко над террасой (кадры 01, 02, 07: ≈ 2,3–2,5 м), наклон не круче slope
          const drop = clamp(dropMax + A.clear - A.low, A.minDrop, Math.min(dropMax, d * A.slope));
          out.awn.push([i, r2(d), r2(drop)]); st.awn++; awnD = d;
        } else if (d > Aw.d + 0.2) st.awnLow++;
      }
      // тент над террасой бара набережной без маркизы (ряд тентов Ribera, кадр 02): под своей доской, место на стене —
      // S.wallFit (плиты балконов над ним, чужие вывески той же стены); низ фестона не ниже clear
      if (sea && s.form !== 'awning' && T >= 2 && S.hash(bx, bz, 52) < F.tent.p) {
        const A = F.tent, w = clamp(hi - lo, A.w[0], A.w[1]), uc = clamp((lo + hi) / 2, lo + w / 2, hi - w / 2);
        const [wx, wz] = P2(uc, 0), gw = Math.max(g0, C.ground(wx + nx * 0.5, wz + nz * 0.5));
        const want = Math.min(s.form === 'board' ? s.y - s.h / 2 - A.under : gw + A.y, gw + A.y);
        const y = S.wallFit(wx, wz, nx, nz, want, { up: 0.05, down: 0.9, r: w / 2 + 0.35, gap: A.gap });
        let d = Math.min(T + 0.3, A.d, why === 'road' ? U - F.awn.curb : Infinity);
        const [ox, oz] = P2(uc, d), go = Math.max(C.ground(ox, oz), g0) + 0.15;
        const dropMax = y === null ? -1 : y - A.h - go - F.awn.clear;
        if (y !== null && dropMax >= A.minDrop && d >= 2) {
          const drop = clamp(dropMax + F.awn.clear - F.awn.low, A.minDrop, Math.min(dropMax, d * F.awn.slope));
          out.tent.push([r2(wx), r2(wz), r2(y), r2(nx), r2(nz), r2(w), r2(d), r2(drop), Math.floor(S.hash(bx, bz, 53) * F.colors.tent.length)]);
          awnD = d;
        } else st.tentSkip++;
      }

      const h = S.hash(bx, bz, 42);
      const chairKind = sea ? (h < 0.6 ? 1 : 0) : (town ? (h < 0.15 ? 1 : 0) : (h < 0.3 ? 1 : 0));
      const ch = S.hash(bx, bz, 43), chairCol = Math.floor(ch * F.colors['chair' + chairKind].length);
      const tableCol = sea && S.hash(bx, bz, 44) < 0.7 ? 0 : Math.floor(S.hash(bx, bz, 45) * F.colors.table.length);
      const tableKind = town || T < 2 ? (S.hash(bx, bz, 46) < 0.7 ? 1 : 0) : (S.hash(bx, bz, 46) < 0.25 ? 1 : 0);
      const parCol = Math.floor(S.hash(bx, bz, 47) * F.colors.parasol.length);
      const ry0 = Math.atan2(nx, nz), ryU = Math.atan2(ux, uz);
      const inDoor = u => Math.abs(u - ud) < F.door + 0.7;
      // места столиков вдоль стены: от прохода к двери в обе стороны с шагом step, пока влезают в полуширину
      const cols = (step, w) => {
        const out = [];
        for (const sg of [-1, 1]) for (let k = 0; ; k++) {
          const u = ud + sg * (F.door + 0.1 + w / 2 + k * step);
          if (u < lo + w / 2 - 0.2 || u > hi - w / 2 + 0.2) { if (sg * (u - (lo + hi) / 2) < 0) continue; break; }
          out.push(u);
        }
        return out.sort((a, b) => Math.abs(a - ud) - Math.abs(b - ud) || a - b);
      };
      let nT = 0;
      const maxT = small ? F.small : Infinity;
      const tables = [];                                  // [u, v] — для зонтов
      const chair = (x, z, fx, fz) => out.chair.push([r2(x), r2(z), r2(Math.atan2(fx, fz)), chairKind, chairCol]);

      if (T >= F.minT && T < 2) {
        // узкая: столик у стены, стулья по бокам вдоль стены
        const v = 0.45;
        for (const u of cols(F.bistro, 1.6)) {
          if (nT >= maxT) break;
          const [x, z] = P2(u, v), [xa, za] = P2(u - 0.6, v), [xb, zb] = P2(u + 0.6, v);
          if (!ok(xa, za) || !ok(xb, zb) || !freeAt(xa, za, 0.38, xb, zb, bx, bz, nx, nz)) { st.tableBusy++; continue; }
          take(xa, za, 0.38, xb, zb);
          out.table.push([r2(x), r2(z), r2(ry0), 1, tableCol]);
          chair(xa, za, ux, uz); chair(xb, zb, -ux, -uz);
          nT++;
        }
        if (nT) st.bistro++;
      } else if (T >= 2) {
        const four = !small && S.hash(bx, bz, 48) < F.four, col = four ? F.col[1] : F.col[0];
        const rows = Math.max(1, Math.floor((T - F.wall) / F.row));
        const us = cols(col, four ? 1.6 : 0.7).sort((a, b) => a - b);
        for (let r = 0; r < rows; r++) {
          const v = F.wall + F.row / 2 + r * F.row;
          for (const u of us) {
            if (nT >= maxT) break;
            const [x, z] = P2(u, v), [xa, za] = P2(u, v - 0.62), [xb, zb] = P2(u, v + 0.62);
            if (!ok(xa, za) || !ok(xb, zb) || !ok(...P2(u - 0.62, v)) || !ok(...P2(u + 0.62, v))) { st.tableBusy++; continue; }
            if (four ? !freeAt(x, z, 0.9, x, z, bx, bz, nx, nz) : !freeAt(xa, za, 0.3, xb, zb, bx, bz, nx, nz)) { st.tableBusy++; continue; }
            if (four) take(x, z, 0.9); else take(xa, za, 0.3, xb, zb);
            out.table.push([r2(x), r2(z), r2(ry0), tableKind, tableCol]);
            chair(xa, za, nx, nz); chair(xb, zb, -nx, -nz);
            if (four) { const [xc, zc] = P2(u - 0.62, v), [xe, ze] = P2(u + 0.62, v); chair(xc, zc, ux, uz); chair(xe, ze, -ux, -uz); }
            tables.push([u, v, r]);
            nT++;
          }
        }
        if (nT) st.rows++;
        // зонты: между парами столиков ряда, где над рядом нет маркизы
        if (!small && T >= F.parasol.minT) {
          for (let r = 0; r < rows; r++) {
            const row = tables.filter(t => t[2] === r);
            if (!row.length || awnD >= row[0][1] + 0.6) continue;
            for (let j = 0; j < row.length; j += 2) {
              const u = j + 1 < row.length && row[j + 1][0] - row[j][0] < col * 1.5 ? (row[j][0] + row[j + 1][0]) / 2 : row[j][0];
              const [x, z] = P2(u, row[j][1]);
              if (!S.free(x, z, 0.12, 'F')) continue;
              out.parasol.push([r2(x), r2(z), r2(ry0), parCol]);
            }
          }
        }
      }
      if (nT) st.terraces++; else if (T < F.minT) st.noRoom++;
      // отладка: window.__terrLog = [] до раскладки — по заведению: лучи, глубина, границы, дверь, столиков, маркиза
      if (typeof window !== 'undefined' && window.__terrLog) window.__terrLog.push({ i, text: s.text, form: s.form, x: r2(bx), z: r2(bz), U, why, T: r2(T), lo: r2(lo), hi: r2(hi), ud: r2(ud), nT, awnD: r2(awnD), sea, town });

      // кадки: по бокам террасы; на набережной у бордюра ещё ряд (кадры 02, 04 Ribera), если проход остаётся
      if (nT) {
        const kind = sea ? 0 : town ? 2 : (S.hash(bx, bz, 49) < 0.5 ? 1 : 0);
        const vs = Math.min(T, 2.2) - 0.55;
        for (const sg of [-1, 1]) {
          const [x, z] = P2(sg < 0 ? lo - F.planter.side : hi + F.planter.side, Math.max(0.5, vs));
          if (!ok(x, z) || !freeAt(x, z, 0.45, x, z, bx, bz, nx, nz)) continue;
          take(x, z, 0.45);
          out.planter.push([r2(x), r2(z), r2(ry0), kind]);
        }
        if (sea && why === 'road' && U - T >= F.planter.curb + 0.5 + F.planter.pass && T >= 2) {
          const v = U - F.planter.curb, n = Math.max(1, Math.floor((hi - lo) / F.planter.step));
          for (let c = 0; c < n; c++) {
            const u = lo + F.planter.step / 2 + c * F.planter.step + (hi - lo - n * F.planter.step) / 2;
            if (inDoor(u)) continue;
            const [x, z] = P2(u, v);
            if (!ok(x, z) || !freeAt(x, z, 0.5)) continue;
            take(x, z, 0.5);
            out.planter.push([r2(x), r2(z), r2(ryU), 0]);
          }
        }
      }

      // штендер у прохода к двери
      if (S.hash(bx, bz, 50) < F.board && U >= 1.6) {
        const sg = S.hash(bx, bz, 51) < 0.5 ? -1 : 1, u = ud + sg * (F.door + 0.35);
        let v = nT && U - (T + 0.35) >= 1.4 ? T + 0.35 : 0.35;
        if (!nT && why === 'road' && U < 2.4) v = 0.3;
        const [x, z] = P2(u, v);
        if (ok(x, z) && freeAt(x, z, 0.3, x, z, bx, bz, nx, nz)) { take(x, z, 0.3); out.board.push([r2(x), r2(z), r2(ryU)]); }
      }
    }
    st.table = out.table.length; st.chair = out.chair.length; st.parasol = out.parasol.length;
    st.planter = out.planter.length; st.board = out.board.length; st.tent = out.tent.length;
    return out;
  },

  build(K, S, L) {
    if (!L) return;
    const M = stTerrModels(S), F = stTerrCfg, Cl = F.colors;
    const light = (mass, cy, kind, o = {}) => Object.assign({ mass, cy, lie: 1.45, light: true, kind }, o);
    for (const k of [0, 1]) {
      S.place(M.chair[k], L.chair.filter(c => c[3] === k).map(([x, z, ry, , c]) => ({ x, z, ry, color: Cl['chair' + k][c] })),
        { brk: light(k ? 8 : 5, 0.45, k ? 'wood' : 'metal'), hit: { r: 0.25, h: 0.9 } });
      S.place(M.table[k], L.table.filter(t => t[3] === k).map(([x, z, ry, , c]) => ({ x, z, ry, color: Cl.table[c] })),
        { brk: light(16, 0.5, 'metal'), hit: { r: k ? 0.32 : 0.38, h: 0.75 } });
    }
    S.place(M.parasol, L.parasol.map(([x, z, ry, c]) => ({ x, z, ry, color: Cl.parasol[c] })),
      { brk: light(14, 1.3, 'wood', { lie: 1.5 }), hit: { r: 0.1, h: 2.6 } });
    for (const k of [0, 1, 2]) {
      S.place(M.planter[k], L.planter.filter(p => p[3] === k).map(([x, z, ry]) => ({ x, z, ry })),
        { brk: { mass: k === 2 ? 40 : 140, anchor: 0.5, minSpeed: 1, cy: 0.3, lie: 1.5, light: k === 2, kind: 'plastic' }, hit: { r: k === 0 ? 0.5 : 0.4, h: 0.6 } });
    }
    S.place(M.board, L.board.map(([x, z, ry]) => ({ x, z, ry })), { brk: light(6, 0.45, 'wood'), hit: { r: 0.25, h: 0.95 } });
    stTerrTents(K, S, L.tent || []);
    // ночью под вынесенной маркизой и тентом — тёплый ореол у изнанки и пятно света на террасе (без источников света)
    const G = F.glow, lights = [], signs = K.D.C.signs;
    for (const [i, d, drop] of L.awn) {
      const s = signs[i], yA = s.y + s.h / 2 + SITGES_SIGNS.awning.drop, ux = s.nz, uz = -s.nx, n = s.w > G.wide ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const u = n > 1 ? (k ? 1 : -1) * s.w / 4 : 0, x = s.x + s.nx * d * 0.55 + ux * u, z = s.z + s.nz * d * 0.55 + uz * u;
        lights.push({ x, y: yA - drop * 0.55 - G.below, z, r: G.pool });
      }
    }
    for (const [x0, z0, y, nx, nz, w, d, drop] of L.tent || []) lights.push({ x: x0 + nx * d * 0.55, y: y - drop * 0.55 - G.below, z: z0 + nz * d * 0.55, r: G.pool });
    S.lights(lights, { color: G.color, size: G.size, poolColor: G.poolColor });
  },
};

// Тенты баров набережной (L.tent): своя склеенная геометрия квадратами 160 м (как S.place — скрытие дальше 300 м,
// K.roadLod), цвет в вершинах; неподвижные, без столкновений (выше 2,2 м), тень — теневыми копиями. В сводку группы
// (K.stStats.F) — штуки, треугольники, меши.
function stTerrTents(K, S, list) {
  if (!list.length) return;
  const F = stTerrCfg, CH = 160, mat = S.mat(0xffffff, { vertexColors: true, roughness: 0.85 }), st = K.stStats[S.cur], c = new THREE.Color();
  const chunks = new Map();
  for (const t of list) { const k = Math.floor(t[0] / CH) * 65536 + Math.floor(t[1] / CH); if (!chunks.has(k)) chunks.set(k, []); chunks.get(k).push(t); }
  for (const arr of chunks.values()) {
    const pos = [], nrm = [], col = [];
    const quad = (p, n, k) => {                     // p — 4 точки по кругу, n — нормаль, k — множитель цвета
      for (const i of [0, 1, 2, 0, 2, 3]) { pos.push(...p[i]); nrm.push(...n); col.push(c.r * k, c.g * k, c.b * k); }
    };
    for (const [x, z, y, nx, nz, w, d, drop, ci] of arr) {
      c.set(F.colors.tent[ci]);
      const rx = nz, rz = -nx, hw = w / 2, yT = y - drop, h = F.tent.h, L = Math.hypot(d, drop);
      const W = s => [x + rx * hw * s, y, z + rz * hw * s], O = (s, yy) => [x + nx * d + rx * hw * s, yy, z + nz * d + rz * hw * s];
      const up = [nx * drop / L, d / L, nz * drop / L];
      quad([W(-1), W(1), O(1, yT), O(-1, yT)], up, 1);                               // верх
      quad([W(1), W(-1), O(-1, yT), O(1, yT)], up.map(v => -v), 0.72);                // изнанка
      quad([O(-1, yT), O(1, yT), O(1, yT - h), O(-1, yT - h)], [nx, 0, nz], 0.9);       // фестон
      quad([O(1, yT), O(-1, yT), O(-1, yT - h), O(1, yT - h)], [-nx, 0, -nz], 0.7);
      for (const sg of [-1, 1]) {                                                    // щёки у фестона
        const a = O(sg, yT), b = O(sg, yT - h), e = [x + nx * (d - 0.6) + rx * hw * sg, yT + drop * 0.6 / d, z + nz * (d - 0.6) + rz * hw * sg];
        quad([a, e, e, b], [rx * sg, 0, rz * sg], 0.85); quad([e, a, b, b], [-rx * sg, 0, -rz * sg], 0.7);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const m = new THREE.Mesh(g, mat);
    m.castShadow = true; m.receiveShadow = true;
    K.group.add(m);
    g.computeBoundingSphere();
    K.roadLod.push({ mesh: m, x: g.boundingSphere.center.x, z: g.boundingSphere.center.z, r: g.boundingSphere.radius, far: SITGES_ST3D.far });
    if (st) { st.meshes++; st.tris += pos.length / 9; }
  }
  if (st) st.n += list.length;
}

// Модели группы (основание в y = 0, «лицо» к +z). Части — { geo, mat, shadow } для S.place; цвет экземпляра
// умножает все части (тёмные части почти не меняются).
function stTerrModels(S) {
  const B = (w, h, d, x = 0, y = 0, z = 0, rx = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rx) g.rotateX(rx);
    return g.translate(x, y, z);
  };
  const Cy = (rt, rb, h, seg, x = 0, y = 0, z = 0, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open).translate(x, y, z);
  const mg = list => mergeGeometries(list.map(g => g.index ? g.toNonIndexed() : g));
  const white = S.mat(0xffffff, { roughness: 0.55 }), metal = S.mat(0x8d9196, { roughness: 0.4, metalness: 0.6 });
  const dark = S.mat(0x2a2b2d, { roughness: 0.5, metalness: 0.4 });

  /* стулья: алюминиевый (Karmela, Sant Pau — тонкие ножки, рейки) и плетёный с подлокотниками (Costa Dorada) */
  const legs = (h, t, sx, sz) => [-1, 1].flatMap(a => [-1, 1].map(b => B(t, h, t, a * sx, h / 2, b * sz)));
  const chair0 = [{ geo: mg([B(0.42, 0.03, 0.42, 0, 0.46, 0), B(0.42, 0.3, 0.025, 0, 0.7, -0.22, -0.12), ...legs(0.45, 0.025, 0.19, 0.19), B(0.025, 0.47, 0.025, -0.19, 0.69, -0.2), B(0.025, 0.47, 0.025, 0.19, 0.69, -0.2)]), mat: white }];
  const chair1 = [{ geo: mg([B(0.52, 0.1, 0.5, 0, 0.42, 0), B(0.52, 0.42, 0.07, 0, 0.68, -0.23, -0.1), B(0.06, 0.2, 0.46, -0.24, 0.57, 0), B(0.06, 0.2, 0.46, 0.24, 0.57, 0)]), mat: white },
    { geo: mg(legs(0.38, 0.04, 0.22, 0.21)), mat: dark }];

  /* столы: квадратный 0,7 м и круглый 0,6 м на одной ножке с крестовиной */
  const foot = [Cy(0.035, 0.035, 0.72, 6, 0, 0.36, 0, true), B(0.5, 0.03, 0.06, 0, 0.015, 0), B(0.06, 0.03, 0.5, 0, 0.015, 0)];
  const table0 = [{ geo: mg([B(0.7, 0.035, 0.7, 0, 0.745, 0)]), mat: white }, { geo: mg(foot), mat: dark }];
  const table1 = [{ geo: mg([Cy(0.3, 0.3, 0.03, 12, 0, 0.745, 0)]), mat: white }, { geo: mg(foot), mat: dark }];

  /* зонт: квадратный купол 2,5 м (Costa Dorada), шест, наконечник */
  const P = stTerrCfg.parasol.size, cr = P / Math.SQRT2;
  const dome = new THREE.ConeGeometry(cr, 0.45, 4, 1).rotateY(Math.PI / 4).translate(0, 2.5, 0);
  const parasol = [{ geo: mg([dome, B(P, 0.18, 0.012, 0, 2.2, P / 2), B(P, 0.18, 0.012, 0, 2.2, -P / 2), B(0.012, 0.18, P, P / 2, 2.2, 0), B(0.012, 0.18, P, -P / 2, 2.2, 0)]), mat: white },
    { geo: mg([Cy(0.025, 0.025, 2.72, 6, 0, 1.36, 0, true), Cy(0.05, 0.05, 0.12, 6, 0, 2.78, 0), B(0.45, 0.06, 0.45, 0, 0.03, 0)]), mat: S.mat(0xd8d4cc, { roughness: 0.5, metalness: 0.3 }) }];

  /* кадки: белый ящик с кустом (Ribera, Mascaron), бетонная чаша (Sant Pau), глиняный горшок (старый город) */
  const bush = (sx, sy, sz, y) => new THREE.IcosahedronGeometry(1, 1).scale(sx, sy, sz).translate(0, y, 0);
  const green = S.mat(0x4f7a3a, { roughness: 0.9 });
  const planter0 = [{ geo: mg([B(1.0, 0.45, 0.42, 0, 0.225, 0)]), mat: S.mat(0xeeece6, { roughness: 0.8 }) },
    { geo: mg([bush(0.5, 0.32, 0.24, 0.66)]), mat: green }];
  const planter1 = [{ geo: mg([Cy(0.42, 0.28, 0.36, 10, 0, 0.18, 0)]), mat: S.mat(0xb7b2a8, { roughness: 0.95 }) },
    { geo: mg([bush(0.3, 0.42, 0.3, 0.62)]), mat: green }];
  const planter2 = [{ geo: mg([Cy(0.26, 0.19, 0.5, 10, 0, 0.25, 0)]), mat: S.mat(0xb5603a, { roughness: 0.9 }) },
    { geo: mg([bush(0.3, 0.3, 0.3, 0.72)]), mat: green }];

  /* штендер «домиком» (Tagliatella, Sant Pau): две доски с тёмным лицом в деревянной раме */
  const a = 0.2, faces = [], frame = [];
  for (const sg of [1, -1]) {
    const tilt = g => g.rotateX(sg * a).translate(0, 0, sg * 0.1);
    faces.push(tilt(B(0.5, 0.7, 0.02, 0, 0.48, 0)));
    frame.push(tilt(B(0.58, 0.06, 0.03, 0, 0.86, 0)), tilt(B(0.58, 0.06, 0.03, 0, 0.1, 0)), tilt(B(0.04, 0.86, 0.03, -0.27, 0.45, 0)), tilt(B(0.04, 0.86, 0.03, 0.27, 0.45, 0)));
  }
  const board = [{ geo: mg(faces), mat: S.mat(0x1f2322, { roughness: 0.9 }) }, { geo: mg(frame), mat: S.mat(0x8a6544, { roughness: 0.8 }) }];

  return { chair: [chair0, chair1], table: [table0, table1], parasol, planter: [planter0, planter1, planter2], board };
}
