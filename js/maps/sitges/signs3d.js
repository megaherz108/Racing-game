// Ситжес — ПОСТРОЙКА: вывески заведений геометрией (этап 6а.3, docs/sitges/stage-6a.md). После балконов и карнизов
//   (facades3d.js), до мешей улиц (sitgesBuildRoadMeshes): геометрия идёт в копилку улиц K.rk (склейка квадратами
//   SITGES_SIGN3D.chunk м со скрытием дальше far — как заборы, world.cullView).
//   Раскладка — C.signs (js/maps/sitges/signs.js, договор в stage-6a.md), надписи — атлас sitgesSignAtlas()
//   (js/maps/sitges/signtex.js): ключ ячейки — key вывески + ступень пропорций (одна надпись на стенах разной длины
//   не растягивается больше чем на ≈ 10 %).
//   Формы: доска — короб глубиной board.d от стены (бока — цвет кромки ячейки); флажок — двусторонний короб
//   поперёк стены на кронштейне; маркиза — наклонный тент от стены к фестону (полосы — верх ячейки, фестон с надписью —
//   низ, зубцы прозрачные), щёки по бокам, изнанка темнее; крест аптеки — три коробки (стойка и два плеча) на
//   кронштейне, светятся; буквы отеля — плоскость с alphaTest (изнанка тёмная), над плоской крышей — рама и ножки;
//   стела — короб поперёк улицы (читается с дороги в обе стороны) на ножке, в сетке столкновений (OBB). Навес АЗС —
//   не строится (заправки за границей карты, раскладка их не даёт).
//   Материал один (MAT['sign'], под двумя ключами копилки: 'sign' — ближние, 'sign-far' — буквы отелей, видны
//   дальше): map — атлас, emissiveMap — его маска свечения, свечение × NIGHT_U (как окна в facade.js), источников
//   света нет. Металл и корпуса — белая ячейка атласа '__solid' с цветом вершин. Тени не отбрасывают.
// Видеопамять атласа — шапка signtex.js: сейчас один лист 2048² при строке 32 px (26,7 МБ); 48 px — два листа (53,3 МБ),
//   по кадрам на 7–40 м разница мала (6а.3).
// K.signStats — сводка раскладки C.signStats и постройки: tris, cells, px, size, ms.
// Определяет: SITGES_SIGN3D, sitgesBuildSigns.
// Использует: MAT (js/core.js); NIGHT_U (js/world.js); SITGES_SIGNS (js/maps/sitges/signs.js); SITGES_SIGN,
//   sitgesSignAtlas (js/maps/sitges/signtex.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const SITGES_SIGN3D = {
  chunk: 160, far: { near: 160, letters: 420 },   // квадраты, м; дальше far от камеры не рисуются
  step: 1.2,              // ступень пропорций w / h для ячеек атласа (одна надпись на досках разной длины)
  glow: 1.5,              // яркость свечения ночью (× NIGHT_U)
  board: { d: 0.1 },      // глубина короба доски от стены, м
  blade: { d: 0.08, bar: 0.04 },   // толщина флажка; сечение кронштейна, м
  cross: { d: 0.12, bar: 0.05 },
  awning: { under: 0x8a8a8a, cheek: 0.6 },  // тон изнанки; щека — доля фестона под тентом
  letters: { rail: 0.06, post: 0.05, every: 1.6, back: 0x2e2e2e },
  totem: { d: 0.32, leg: [0.3, 0.22] },
  metal: 0x34363a, body: 0x45494f,
};

function sitgesBuildSigns(K) {
  const { D, rk, grid } = K, C = D.C, P = SITGES_SIGN3D, S = SITGES_SIGNS, t0 = performance.now();
  if (!C.signs || !C.signs.length) return;
  const { MAT, lod } = rk;

  /* ---------- атлас: ячейка на ключ + ступень пропорций ---------- */
  const faceH = s => s.form === 'awning' ? s.h / SITGES_SIGN.awningVal : s.h;   // у маркизы ячейка — тент + фестон
  const items = new Map(), cellOf = [];
  for (const s of C.signs) {
    const a = s.w / faceH(s), k = s.key + '#' + Math.round(Math.log(a) / Math.log(P.step));
    if (!items.has(k)) items.set(k, { key: k, text: s.text, cat: s.cat, brand: s.brand, form: s.form, aspect: a });
    cellOf.push(k);
  }
  const A = sitgesSignAtlas([...items.values()]), du = 1 / A.size[0], dv = 1 / A.size[1];
  const so = A.uv.get('__solid'), SOLID = [(so[0] + so[2]) / 2, (so[1] + so[3]) / 2];

  const mat = new THREE.MeshStandardMaterial({ name: 'sign', map: A.map, emissiveMap: A.glow, emissive: 0xffffff, alphaTest: 0.5,
    roughness: 0.55, metalness: 0.05, vertexColors: true });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uNight = NIGHT_U;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance *= uNight * ${P.glow.toFixed(2)};`);
  };
  MAT.sign = MAT['sign-far'] = mat;
  lod.sign = [P.chunk, P.far.near]; lod['sign-far'] = [P.chunk, P.far.letters];
  rk.apart.add('sign'); rk.apart.add('sign-far');

  /* ---------- грани ---------- */
  let tris = 0;
  const UP = [0, 1, 0];
  const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
  const neg = v => [-v[0], -v[1], -v[2]];
  // прямоугольник: центр c, полуоси ax («вправо» для смотрящего на лицо) и ay («вверх»), нормаль n; uv — ячейка
  // [u0, v0, u1, v1] (u0 — слева) или точка [u, v] (сплошной цвет)
  const rect = (key, c, ax, ay, n, col, uv) => {
    const p = [add(add(c, ax, -1), ay, -1), add(add(c, ax), ay, -1), add(add(c, ax), ay), add(add(c, ax, -1), ay)];
    const q = uv.length === 2 ? [uv, uv, uv, uv] : [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]];
    rk.quad(key, p, n, col, q);
    tris += 2;
  };
  // короб: центр c, оси R (ширина w, «вправо» у лица), U (высота h), N (глубина d, лицо — +N); front / back — uv
  // лица и тыла (тыл читается правильно: его «вправо» — −R), side — uv боков; back === null — тыла нет (к стене)
  const box = (key, c, R, U, N, w, h, d, col, front, back, side, sideCol = col) => {
    const hw = w / 2, hh = h / 2, hd = d / 2, aR = R.map(v => v * hw), aU = U.map(v => v * hh), aN = N.map(v => v * hd);
    rect(key, add(c, aN), aR, aU, N, col, front);
    if (back) rect(key, add(c, aN, -1), neg(aR), aU, neg(N), col, back);
    rect(key, add(c, aR), aN, aU, R, sideCol, side);
    rect(key, add(c, aR, -1), aN, aU, neg(R), sideCol, side);
    rect(key, add(c, aU), aR, aN, U, sideCol, side);
    rect(key, add(c, aU, -1), aR, aN, neg(U), sideCol, side);
  };
  // брус металла от точки a до b (по горизонтали или вертикали), сечение t
  const bar = (key, a, b, t, col = P.metal) => {
    const v = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(...v);
    if (L < 1e-3) return;
    const N = v.map(x => x / L), c = add(a, v, 0.5);
    const R = Math.abs(N[1]) > 0.9 ? [1, 0, 0] : UP, U = [N[1] * R[2] - N[2] * R[1], N[2] * R[0] - N[0] * R[2], N[0] * R[1] - N[1] * R[0]];
    box(key, c, R, U, N, t, t, L, col, SOLID, SOLID, SOLID);
  };
  // точка ячейки: доли (fu, fv) от левого нижнего угла; кромка — на полпикселя внутрь
  const at = (uv, fu, fv) => [uv[0] + (uv[2] - uv[0]) * fu, uv[1] + (uv[3] - uv[1]) * fv];
  const edge = uv => [uv[0] + 0.5 * du, (uv[1] + uv[3]) / 2];

  /* ---------- вывески ---------- */
  const cnt = { board: 0, blade: 0, awning: 0, cross: 0, letters: 0, totem: 0, skip: 0 };
  C.signs.forEach((s, i) => {
    const uv = A.uv.get(cellOf[i]);
    const N = [s.nx, 0, s.nz], R = [s.nz, 0, -s.nx];   // наружу от стены; «вправо» для смотрящего на стену
    const f = s.form;
    if (f === 'board') {
      // лицо раскладки — в 0,06 м перед стеной: короб от стены на board.d
      const d = P.board.d, w0 = [s.x - s.nx * 0.06, s.y, s.z - s.nz * 0.06];
      box('sign', add(w0, N, d / 2), R, UP, N, s.w, s.h, d, 0xffffff, uv, null, edge(uv));
    } else if (f === 'blade' || f === 'cross') {
      // поперёк стены: лицо смотрит вдоль стены (R), «вправо» у лица — к стене (−N); середина — в out м от стены
      const E = f === 'blade' ? S.blade : S.cross, Q = f === 'blade' ? P.blade : P.cross;
      const c = [s.x + s.nx * E.out, s.y, s.z + s.nz * E.out], RR = neg(N);
      if (f === 'blade') {
        box('sign', c, RR, UP, R, s.w, s.h, Q.d, 0xffffff, uv, uv, edge(uv));
        // кронштейн над флажком от стены до внешнего края, планка на стене
        const y = s.y + s.h / 2 + Q.bar / 2 + 0.02;
        bar('sign', [s.x, y, s.z], [s.x + s.nx * (E.out + s.w / 2), y, s.z + s.nz * (E.out + s.w / 2)], Q.bar);
        bar('sign', [s.x + s.nx * 0.02, s.y - s.h / 2, s.z + s.nz * 0.02], [s.x + s.nx * 0.02, y + 0.06, s.z + s.nz * 0.02], Q.bar);
      } else {
        // крест (как в атласе: сторона sz = 0,96 клетки, плечо a = sz / 3): стойка и два плеча, бока — зелёные
        const sz = 0.96 * Math.min(s.w, s.h), a = sz / 3, mid = at(uv, 0.5, 0.5);
        const sub = (dx, dy, w, h) => [...at(uv, 0.5 + (dx - w / 2) / s.w, 0.5 + (dy - h / 2) / s.h), ...at(uv, 0.5 + (dx + w / 2) / s.w, 0.5 + (dy + h / 2) / s.h)];
        const part = (dx, dy, w, h) => box('sign', add(c, RR, dx), RR, UP, R, w, h, Q.d, 0xffffff, sub(dx, dy, w, h), sub(-dx, dy, w, h), mid);
        part(0, 0, a, sz);
        const aw = (sz - a) / 2;
        for (const k of [-1, 1]) part(k * (a / 2 + aw / 2), 0, aw, a);
        // кронштейн от стены до ближнего плеча
        bar('sign', [s.x, s.y, s.z], [s.x + s.nx * (E.out - sz / 2), s.y, s.z + s.nz * (E.out - sz / 2)], Q.bar);
      }
    } else if (f === 'awning') {
      // тент от стены (верх — на drop выше фестона) к фестону на выносе d; ячейка: низ awningVal — фестон
      const Aw = S.awning, fv = SITGES_SIGN.awningVal, hw = s.w / 2;
      const yT = s.y + s.h / 2, yA = yT + Aw.drop, yB = s.y - s.h / 2;
      const w0 = [s.x, yA, s.z], o0 = [s.x + s.nx * Aw.d, yT, s.z + s.nz * Aw.d];
      const L = Math.hypot(Aw.d, Aw.drop), nUp = [s.nx * Aw.drop / L, Aw.d / L, s.nz * Aw.drop / L];
      const vF = at(uv, 0, fv)[1];
      const top = [[s.x - R[0] * hw, yA, s.z - R[2] * hw], [s.x + R[0] * hw, yA, s.z + R[2] * hw], [o0[0] + R[0] * hw, yT, o0[2] + R[2] * hw], [o0[0] - R[0] * hw, yT, o0[2] - R[2] * hw]];
      // верх тента: у стены — верх ячейки, у фестона — граница полос и фестона
      rk.quad('sign', top, nUp, 0xffffff, [[uv[0], uv[3]], [uv[2], uv[3]], [uv[2], vF], [uv[0], vF]]);
      rk.quad('sign', top, neg(nUp), P.awning.under, [[uv[0], uv[3]], [uv[2], uv[3]], [uv[2], vF], [uv[0], vF]]);
      // фестон: лицо и изнанка
      const fc = [o0[0], (yT + yB) / 2, o0[2]], aR = R.map(v => v * hw), aU = [0, s.h / 2, 0];
      rect('sign', fc, aR, aU, N, 0xffffff, [uv[0], uv[1], uv[2], vF]);
      rect('sign', fc, neg(aR), aU, neg(N), P.awning.under, [uv[0], uv[1], uv[2], vF]);
      // щёки по бокам: треугольник под тентом (цвет первой полосы), обе стороны
      const stripe = [uv[0] + 2 * du, (vF + uv[3]) / 2], yC = yT - s.h * P.awning.cheek;
      for (const k of [-1, 1]) {
        const ex = R[0] * hw * k, ez = R[2] * hw * k;
        const tri = [[s.x + ex, yA, s.z + ez], [o0[0] + ex, yT, o0[2] + ez], [o0[0] + ex, yC, o0[2] + ez], [s.x + ex, yC + 0.15, s.z + ez]];
        for (const sg of [1, -1]) rk.quad('sign', tri, [R[0] * k * sg, 0, R[2] * k * sg], sg > 0 ? 0xffffff : P.awning.under, [stripe, stripe, stripe, stripe]);
      }
      tris += 10;
    } else if (f === 'letters') {
      // над плоской крышей точка раскладки внутри дома (в 0,5 м от края), под карнизом — перед стеной
      const roof = !!(C.houseAt && C.houseAt(s.x, s.z)), Lt = P.letters;
      const c = [s.x, s.y, s.z], aR = R.map(v => v * s.w / 2), aU = [0, s.h / 2, 0];
      rect('sign-far', c, aR, aU, N, 0xffffff, uv);
      rect('sign-far', add(c, N, -0.02), neg(aR), aU, neg(N), Lt.back, uv);
      if (roof) {
        // рама: брус под буквами и ножки до крыши (крыша — на S.letters.lift ниже низа букв)
        const yb = s.y - s.h / 2, y1 = yb - S.letters.lift, back = add(c, N, -0.08);
        const n = Math.max(2, Math.round(s.w / Lt.every) + 1);
        bar('sign-far', [back[0] - aR[0], yb - Lt.rail / 2, back[2] - aR[2]], [back[0] + aR[0], yb - Lt.rail / 2, back[2] + aR[2]], Lt.rail);
        for (let k = 0; k < n; k++) {
          const t = (2 * k / (n - 1) - 1) * 0.92, px = back[0] + aR[0] * t, pz = back[2] + aR[2] * t;
          bar('sign-far', [px, y1 - 0.05, pz], [px, yb + s.h * 0.75, pz], Lt.post);
        }
      }
    } else if (f === 'totem') {
      // стела поперёк улицы: лицо смотрит вдоль стены (R) — читается с дороги в обе стороны
      const Q = P.totem, RR = neg(N), c = [s.x, s.y, s.z];
      box('sign', c, RR, UP, R, s.w, s.h, Q.d, 0xffffff, uv, uv, edge(uv));
      const yb = s.y - s.h / 2, g = D.ground(s.x, s.z);
      box('sign', [s.x, (yb + g - 0.3) / 2, s.z], RR, UP, R, Q.leg[0], yb - g + 0.3, Q.leg[1], P.body, SOLID, SOLID, SOLID);
      grid.addOBB(s.x, s.z, Q.d, s.w, Math.atan2(s.nx, s.nz), s.y + s.h / 2 - g);
    } else { cnt.skip++; return; }
    cnt[f]++;
  });
  Object.assign(K, { signStats: { ...C.signStats, built: cnt, tris, cells: items.size, px: A.px, size: A.size, ms: Math.round(performance.now() - t0) } });
}
