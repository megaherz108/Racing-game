// Ситжес — достопримечательность: площадь с памятником доктору Рамону Бенапресу на Passeig Marítim (у корня
// волнореза, ≈ (961, −220)). Полукруглая площадь на уровне променада; по её краю — подпорная стенка с газоном
// и кустами; снаружи дуги — пандус без ступеней от променада вниз к пляжу; за нижним концом пандуса — карман пляжа
// до стены набережной. Источники: Street View 2017 (1 Passeig del Doctor Gaietà Benaprés), ортофото ICGC 2024,
// лидар ICGC 50 см (площадь 5,4 м; дорожка по дуге — плавно 5,2 → 2,3 м за ≈ 34 м, 8 %; край пандуса — по краю
// пляжа OSM). Без строения здесь стояли обрывки стены набережной (группа D этапа 7) по краю пляжа OSM — газонный
// выступ на 4,6 м с земляными боками посреди пандуса (скриншот пользователя 2026-11-24).
// Углы — в градусах вокруг центра c: atan2(z − cz, x − cx), 270° — к морю, 180° — на восток (−x).
//   plan(): точки стен набережной (C.prom.walls) ближе cut.r к центру в секторе cut.a — это край пляжа вдоль пандуса:
//     они уходят из стен (оставшиеся куски короче W.minLen — тоже) и становятся наружным краем пандуса (L.bz.out).
//     Пандус — от конца соседней стены D (a0, с её продолжением W.ext) до a1, где он выходит на уровень пляжа.
//     Рельеф (C.terra.H): площадь ровно на уровне променада (медиана по полукругу со стороны суши); узлы у стенки
//     (band м) со стороны площади, под пандусом у края, в кармане и у прямой стенки — на уровне пляжа (как ложбина
//     за стеной набережной: их накрывают настилы со своей сеткой столкновений); под серединой пандуса — чуть ниже
//     него; у верха пандуса со стороны променада — вровень с верхом пандуса (там была ложбина и подъём срезанной
//     стены D).
//   build(): мощение площади лучами из центра (до газона, тротуара, полотна, мощения группы D, кармана), настилы
//     у стенки и у прямой стенки, стенка с парапетом и тумбами с шарами (как валик Passeig Marítim), газон с кустами,
//     пандус (бетон) с наружной стенкой и парапетом там, где пляж ниже, прямая стенка к стене набережной, памятник
//     (две ступени, столб из бута, карниз, табличка к улице, камни и агавы наверху). Столкновения — своя сетка
//     (K.meshColliders), поверхности для колёс, деревьев и мелочей улиц — K.rk.addWalk (до деревьев и этапа 7).
// Материалы: штукатурка, бетон и газон набережной (stPromTex), камень, бут, табличка, зелень (lmMat).
// Определяет: SITGES_LM_BENAPRES, lmBenapresMatsCache, lmBenapresMats.
// Использует: clamp (js/core.js); stdMat (js/world.js); sitgesInPoly (js/maps/sitges/geom.js); stPromCfg, stPromTex
//   (js/maps/sitges/st/promenade.js); lmBox, lmCyl, lmCollideBox, lmMat (js/maps/sitges/landmarks3d.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const SITGES_LM_BENAPRES = {
  ready: true,
  c: [961.2, -220.5],      // центр полукруга: дуга газона OSM (полумесяц) и край площади по лидару
  rw: 10.2,                // радиус подпорной стенки площади, м
  mon: [960.8, -219.4],    // памятник — по ортофото (тень столба)
  cut: { r: 20.5, a: [175, 330] },   // точки стен набережной ближе r м в секторе a (°) — край пандуса, а не стена
  a1: 317,                 // низ пандуса: уровень пляжа (лидар — 2,3 м у 317°)
  a2: 340,                 // конец дуги стенки; дальше — прямая стенка к стене набережной
  band: 2.6,               // узлы рельефа ближе к стенке, к краю пандуса, к прямой стенке — на уровне пляжа
  deck: 5.2,               // настил у прямой стенки со стороны суши, м: накрывает опущенные узлы (вся площадь — тоже настил)
  back: 4,                 // и назад от её начала (клин между кругом площади и стенкой), м
  under: 0.1,              // рельеф площади — на столько ниже её настила (мощение не мерцает над узлами рельефа)
  sink: 0.3,               // рельеф под серединой пандуса — ниже него (лента дорожки OSM по рельефу не проступает)
  blend: 15,               // верх пандуса: за столько градусов поперечный уклон (площадь → стена D) сходит на нет
  par: { h: 0.55, w: 0.4, post: 6 },  // парапет: высота, толщина, шаг тумб с шарами по дуге
  drop: 0.5,               // парапет на краю пандуса — где пляж ниже пандуса больше чем на столько
  hedge: [2.2, 0.4],       // газон с кустами: от и до, м внутрь от стенки
  lift: 0.025,             // мощение и настилы над рельефом (как у набережной)
  liftOut: 0.012,          // мощение за кругом площади — ниже мощения и газона группы D (где они перекрываются — их видно)
  // памятник (Street View 2017: человек рядом ≈ 1,7 м): ступени, столб, карниз, табличка
  mon3: { steps: [3.4, 2.6], step: 0.3, shaft: [1.4, 3.0], cap: [1.65, 0.15], plaque: [0.6, 0.8, 1.9] },

  plan(C, L) {
    const P = this, T = C.terra, { NX, NZ, S, X0, Z0, H, dSea } = T, W = stPromCfg.wall, Bp = stPromCfg.beach;
    const [cx, cz] = P.c, rw = P.rw, D2R = Math.PI / 180;
    const ang = (x, z) => { const a = Math.atan2(z - cz, x - cx) / D2R; return a < 0 ? a + 360 : a; };
    const rad = (x, z) => Math.hypot(x - cx, z - cz);
    const pt = (a, r) => [cx + Math.cos(a * D2R) * r, cz + Math.sin(a * D2R) * r];
    Object.assign(L, { cx, cz, bb: [cx - 20, cx + 20, cz - 18, cz + 10] });
    if (!C.prom) return;

    /* ---------- стены набережной у площади: край пляжа вдоль пандуса ---------- */
    const out = [], kept = [];
    const wlen = p => { let s = 0; for (let i = 1; i < p.length; i++) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return s; };
    for (const w of C.prom.walls) {
      let run = [];
      const flush = () => { if (run.length >= 3 && wlen(run) >= W.minLen) kept.push(Object.assign({}, w, { pts: run })); run = []; };
      for (const q of w.pts) {
        const a = ang(q[0], q[1]), r = rad(q[0], q[1]);
        if (r < P.cut.r && a > P.cut.a[0] && a < P.cut.a[1]) { out.push([a, r, q[4]]); flush(); } else run.push(q);
      }
      flush();
    }
    // концы оставшихся стен (с продолжением W.ext, как их строит группа D): у верха пандуса и у кармана
    let lo = null, hi = null;
    for (const w of kept) for (const e of [0, 1]) {
      const p = e ? w.pts[w.pts.length - 1] : w.pts[0], q = e ? w.pts[w.pts.length - 2] : w.pts[1], l = Math.hypot(p[0] - q[0], p[1] - q[1]) || 1;
      const x = p[0] + (p[0] - q[0]) / l * W.ext, z = p[1] + (p[1] - q[1]) / l * W.ext, r = rad(x, z), a = ang(x, z);
      if (r > P.cut.r + 3) continue;
      const o = { x, z, r, a, top: p[5], foot: p[4], nx: p[2], nz: p[3] };
      if (a > 120 && a < 240 && (!lo || r < lo.r)) lo = o;
      if ((a > 300 || a < 30) && (!hi || r < hi.r)) hi = o;
    }
    if (!out.length || !lo || !hi) return;            // данные другие — площадь не строится, стены D как были
    C.prom.walls = kept;

    const a0 = lo.a, a1 = P.a1, a2 = P.a2;
    out.push([a0, lo.r, lo.foot]);
    out.sort((p, q) => p[0] - q[0]);
    const outAt = (a, k) => {
      if (a <= out[0][0]) return out[0][k];
      for (let i = 1; i < out.length; i++) if (a <= out[i][0]) { const p = out[i - 1], q = out[i], f = (a - p[0]) / (q[0] - p[0] || 1); return p[k] + (q[k] - p[k]) * f; }
      return out[out.length - 1][k];
    };
    const rOut = a => outAt(a, 1);

    /* ---------- уровни ---------- */
    const hs = [];
    for (let a = 30; a <= 150; a += 10) { const [x, z] = pt(a, rw - 1); hs.push(C.ground(x, z)); }
    hs.sort((p, q) => p - q);
    const py = hs[hs.length >> 1], yLo = lo.top, y0 = py, yEnd = outAt(a1, 2);
    // высота пандуса: по углу от уровня площади (y0) до пляжа (yEnd); у верха — ещё поперечный уклон к верху стены D
    // у её конца (yLo: рельеф 10 м там ниже), за blend° сходит на нет
    const yRamp = (a, r) => {
      if (a >= a1) return yEnd;
      const yl = y0 + (yEnd - y0) * clamp((a - a0) / (a1 - a0), 0, 1), f = clamp((a - a0) / P.blend, 0, 1);
      return yl + (yLo - py) * clamp((r - rw) / (lo.r - rw), 0, 1) * (1 - f);
    };

    /* ---------- прямая стенка к стене набережной и карман пляжа ---------- */
    const A2 = pt(a2, rw), E = [hi.x, hi.z], cl = Math.hypot(E[0] - A2[0], E[1] - A2[1]) || 1;
    const cdx = (E[0] - A2[0]) / cl, cdz = (E[1] - A2[1]) / cl, cs = -cdz > 0 ? 1 : -1, cnx = -cdz * cs, cnz = cdx * cs;   // n — в сушу (+z)
    const conn = { ax: A2[0], az: A2[1], bx: E[0], bz: E[1], dx: cdx, dz: cdz, nx: cnx, nz: cnz, len: cl };
    const cAt = (x, z) => [((x - A2[0]) * cdx + (z - A2[1]) * cdz) / cl, (x - A2[0]) * cnx + (z - A2[1]) * cnz];   // доля вдоль, м в сушу
    const bay = [];
    for (let a = a1; a < a2; a += 2) bay.push(pt(a, rw));
    bay.push(A2, E, [E[0] - hi.nx * 6, E[1] - hi.nz * 6], pt(a1, rOut(a1) + 1.5));

    /* ---------- рельеф ---------- */
    const foot = k => Math.min(H[k], Bp.max, Bp.b0 + Bp.k * dSea[k]);
    const R = P.cut.r + 4, n = { flat: 0, low: 0, ramp: 0, up: 0 };
    const set = (k, y, key) => { if (Math.abs(H[k] - y) > 1e-3) { H[k] = y; n[key]++; } };
    for (let j = Math.max(0, Math.ceil((cz - R - Z0) / S)); j <= Math.min(NZ - 1, Math.floor((cz + R - Z0) / S)); j++)
      for (let i = Math.max(0, Math.ceil((cx - R - X0) / S)); i <= Math.min(NX - 1, Math.floor((cx + R - X0) / S)); i++) {
        const x = X0 + i * S, z = Z0 + j * S, k = j * NX + i, r = rad(x, z), a = ang(x, z), walled = a >= a0 && a <= a2;
        const [ct, cd] = cAt(x, z);
        if (r < rw - P.band) set(k, py - P.under, 'flat');                                 // площадь — под настилом
        else if (r < rw && walled) set(k, a < a1 ? Math.min(H[k], yRamp(a, rw) - 0.05) : foot(k), 'low');   // у стенки — под настил
        else if (r >= rw && a >= a0 && a < a1 && r <= rOut(a) + 0.3) {                      // под пандусом:
          const top = (a - a0) * D2R * r <= P.band;                                         // у верха — вровень (рядом мощение
          set(k, top ? yRamp(a, r) - 0.05 : rOut(a) - r < P.band ? foot(k) : Math.min(H[k], yRamp(a, r) - P.sink), 'ramp');   // по рельефу), у края — пляж
        }
        else if (sitgesInPoly(x, z, bay) || (ct > -0.05 && ct < 1.05 && cd >= 0 && cd < P.band)) set(k, foot(k), 'low');   // карман, у прямой стенки
        else if (r < rw) set(k, py - P.under, 'flat');                                     // площадь со стороны суши
        else if (a > a0 - 25 && a < a0 && r <= lo.r + 0.5) set(k, yRamp(a0, r) - 0.02, 'up');   // у верха пандуса — вровень с ним
      }

    L.g = py;
    L.bz = { py, a0, a1, a2, y0, yEnd, lo, hi, out, conn, bay, rOut, yRamp, cAt, ang, rad, pt,
      stats: { cut: out.length - 1, walls: kept.length, nodes: n, py: +py.toFixed(2), top: [+yLo.toFixed(2), +yEnd.toFixed(2)], a0: +a0.toFixed(1) } };
  },

  build(K, L, group) {
    const Z = L.bz;
    if (!Z) return;
    const P = this, C = K.D.C, g = K.D.ground, lift = P.lift, rw = P.rw, D2R = Math.PI / 180, M = lmBenapresMats(), UP = [0, 1, 0];
    const { py, a0, a1, a2, rOut, yRamp, cAt, ang, rad, pt, conn, bay, lo } = Z;
    const yP = py + lift, ph = P.par.h, pw = P.par.w;

    /* ---------- копилки мешей и сетка столкновений ---------- */
    const bufs = new Map();
    const buf = (key, mat, shadow) => { if (!bufs.has(key)) bufs.set(key, { mat, shadow, v: [], uv: [], i: [] }); };
    buf('pave', M.conc, false); buf('ramp', M.conc, false); buf('lawn', M.lawn, false); buf('wall', M.wall, true); buf('stone', M.stone, true);
    // многоугольник vs ([x, y, z] по кругу) с uv; обход — лицом к hint
    const poly = (key, vs, uv, hint) => {
      const b = bufs.get(key), [A, B, Q] = vs;
      const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = Q[0] - A[0], vy = Q[1] - A[1], vz = Q[2] - A[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (nx * nx + ny * ny + nz * nz < 1e-12) return;
      const flip = nx * hint[0] + ny * hint[1] + nz * hint[2] < 0, o = b.v.length / 3;
      vs.forEach((p, k) => { b.v.push(p[0], p[1], p[2]); b.uv.push(uv[k][0], uv[k][1]); });
      for (let k = 1; k + 1 < vs.length; k++) flip ? b.i.push(o, o + k + 1, o + k) : b.i.push(o, o + k, o + k + 1);
    };
    const flat = (key, vs, size) => poly(key, vs, vs.map(p => [p[0] / size, p[2] / size]), UP);
    const cv = [], ci = [];
    const cquad = (a, b, c, d) => { const o = cv.length / 3; cv.push(...a, ...b, ...c, ...d); ci.push(o, o + 1, o + 2, o, o + 2, o + 3); };
    // стенка вдоль отрезка p–q ([x, z]) от низа y0 до верха y1 (числа или [в p, в q]), лицом к n; s0 — длина у p (развёртка)
    const face = (key, p, q, y0, y1, n, s0 = 0, size = 3) => {
      const [b0, b1] = Array.isArray(y0) ? y0 : [y0, y0], [t0, t1] = Array.isArray(y1) ? y1 : [y1, y1], s1 = s0 + Math.hypot(q[0] - p[0], q[1] - p[1]);
      poly(key, [[p[0], b0, p[1]], [q[0], b1, q[1]], [q[0], t1, q[1]], [p[0], t0, p[1]]],
        [[s0 / size, b0 / size], [s1 / size, b1 / size], [s1 / size, t1 / size], [s0 / size, t0 / size]], [n[0], 0, n[1]]);
      return s1;
    };
    const walk = (pts, ys) => K.rk.addWalk(pts, Math.max(...ys), ys);

    /* ---------- мощение площади: лучи из центра (до опор — walkAt ещё без настилов этого строения) ---------- */
    const Dg = C.street && C.street.groups && C.street.groups.D;
    const dW = ((Dg && Dg.walls) || []).filter(w => w.pts.some(q => rad(q[0], q[1]) < 45)), ext = stPromCfg.wall.ext;
    const dCover = (x, z) => dW.some(w => {                    // мощение, газон, настил группы D
      for (let i = 0; i + 1 < w.pts.length; i++) {
        const q = w.pts[i], r = w.pts[i + 1], l = Math.hypot(r[0] - q[0], r[1] - q[1]) || 1, tx = (r[0] - q[0]) / l, tz = (r[1] - q[1]) / l;
        const s = (x - q[0]) * tx + (z - q[1]) * tz, s0 = i === 0 ? -ext : 0, s1 = i + 2 === w.pts.length ? l + ext : l;
        if (s < s0 || s > s1) continue;
        const o = (x - q[0]) * q[2] + (z - q[1]) * q[3];
        if (o > 0 && o < Math.max(w.inE[i], w.inE[i + 1])) return true;
      }
      return false;
    });
    // 1 — тротуар, полотно, мощение D (наше мощение заходит под них: оно ниже), 2 — карман, прямая стенка
    const stop = (x, z) => {
      if (K.walkAt(x, z) > -Infinity || C.carriageAt(x, z) || dCover(x, z)) return 1;
      if (sitgesInPoly(x, z, bay)) return 2;
      const [t, d] = cAt(x, z);
      return t > -0.05 && t < 1.05 && d < 0.05 ? 2 : 0;
    };
    // площадь (круг до стенки) и настил у прямой стенки — ровно на уровне площади, дальше — по рельефу
    const onDeck = (x, z) => {
      const [t, d] = cAt(x, z);
      return rad(x, z) <= rw + 0.01 || (t >= -P.back / conn.len - 0.01 && t <= 1.01 && d >= -0.01 && d <= P.deck + 0.01);
    };
    const yAt = (x, z) => onDeck(x, z) ? yP : g(x, z) + P.liftOut;
    const rays = [];
    const stepA = (from, to, max) => { const m = Math.max(1, Math.ceil((to - from) / max)), l = []; for (let k = 0; k <= m; k++) l.push(from + (to - from) * k / m); return l; };
    for (const a of stepA(a0, a2, 3)) rays.push([a, rw - P.hedge[0]]);
    for (const a of stepA(a2, a0 + 360, 2)) {
      let r = 0.5;
      let why = 0;
      for (; r < 24; r += 0.25) { const [x, z] = pt(a, r); if ((why = stop(x, z)) || (r > lo.r && (a % 360) > 150)) break; }
      rays.push([a, Math.max(0.5, why === 1 ? r + 0.3 : r - 0.1)]);
    }
    const rows = 12;
    for (let k = 0; k + 1 < rays.length; k++) {
      const [aa, ra] = rays[k], [ab, rb] = rays[k + 1];
      if (ab - aa < 1e-6) continue;
      const P0 = f => { const [x, z] = pt(aa, ra * f); return [x, yAt(x, z), z]; }, P1 = f => { const [x, z] = pt(ab, rb * f); return [x, yAt(x, z), z]; };
      for (let j = 0; j < rows; j++) {
        const f0 = j / rows, f1 = (j + 1) / rows;
        if (j === 0) { const c = [P.c[0], yAt(P.c[0], P.c[1]), P.c[1]]; flat('pave', [c, P0(f1), P1(f1)], 4); }
        else flat('pave', [P0(f0), P1(f0), P1(f1), P0(f1)], 4);
      }
    }

    /* ---------- настил: вся площадь (круг до стенки) и полоса у прямой стенки ---------- */
    const arcA = stepA(a0, a2, 2), diskA = stepA(0, 360, 6), cRing = [0, rw / 2, rw];
    for (let k = 0; k + 1 < diskA.length; k++) for (let j = 0; j + 1 < cRing.length; j++) {
      const q = [pt(diskA[k], cRing[j]), pt(diskA[k + 1], cRing[j]), pt(diskA[k + 1], cRing[j + 1]), pt(diskA[k], cRing[j + 1])];
      cquad(...q.map(([x, z]) => [x, yP, z])); walk(q, [yP, yP, yP, yP]);
    }
    {
      const ax = conn.ax - conn.dx * P.back, az = conn.az - conn.dz * P.back;
      const q = [[ax, az], [conn.bx, conn.bz], [conn.bx + conn.nx * P.deck, conn.bz + conn.nz * P.deck], [ax + conn.nx * P.deck, az + conn.nz * P.deck]];
      cquad(...q.map(([x, z]) => [x, yP, z])); walk(q, [yP, yP, yP, yP]);
    }

    /* ---------- газон с кустами у стенки ---------- */
    const [h0, h1] = P.hedge, shrubs = [];
    for (let k = 0; k + 1 < arcA.length; k++) {
      const a = arcA[k], b = arcA[k + 1], y = yP + 0.004;
      flat('lawn', [[...pt(a, rw - h0)], [...pt(b, rw - h0)], [...pt(b, rw - h1)], [...pt(a, rw - h1)]].map(([x, z]) => [x, y, z]), 4);
    }
    for (let s = 1.2, L0 = (a2 - a0) * D2R * (rw - 1.3); s < L0; s += 2.4) {
      const a = a0 + s / ((rw - 1.3) * D2R), [x, z] = pt(a, rw - 1.3), h = 0.5 + 0.25 * Math.abs(Math.sin(x * 12.9898 + z * 78.233));
      shrubs.push(new THREE.IcosahedronGeometry(0.55, 0).scale(1, h / 0.55, 1).translate(x, yP + h * 0.75, z));
    }

    /* ---------- стенка площади: лицо, парапет, тумбы с шарами ---------- */
    let s = 0;
    for (let k = 0; k + 1 < arcA.length; k++) {
      const a = arcA[k], b = arcA[k + 1], pa = pt(a, rw), pb = pt(b, rw), ia = pt(a, rw - pw), ib = pt(b, rw - pw);
      const bot = t => t < a1 ? yRamp(t, rw) + lift - 0.02 : Math.min(...[0.3, 0.9].map(o => g(...pt(t, rw + o)))) - 0.5;
      const ba = bot(a), bb = bot(b), m = (a + b) / 2, n = [Math.cos(m * D2R), Math.sin(m * D2R)];
      s = face('wall', pa, pb, [ba, bb], yP + ph, n, s);
      face('stone', ia, ib, yP, yP + ph, [-n[0], -n[1]], s, 2);
      flat('stone', [[pa[0], yP + ph, pa[1]], [pb[0], yP + ph, pb[1]], [ib[0], yP + ph, ib[1]], [ia[0], yP + ph, ia[1]]], 2);
      cquad([pa[0], Math.min(ba, bb) - 0.5, pa[1]], [pb[0], Math.min(ba, bb) - 0.5, pb[1]], [pb[0], yP + ph, pb[1]], [pa[0], yP + ph, pa[1]]);
    }
    const posts = [];
    for (let s2 = P.par.post / 2, L0 = (a2 - a0) * D2R * rw; s2 < L0; s2 += P.par.post) posts.push(pt(a0 + s2 / (rw * D2R), rw - pw / 2));

    /* ---------- прямая стенка к стене набережной ---------- */
    {
      const A = [conn.ax, conn.az], B = [conn.bx, conn.bz], IA = [A[0] + conn.nx * pw, A[1] + conn.nz * pw], IB = [B[0] + conn.nx * pw, B[1] + conn.nz * pw];
      const bot = Math.min(...[0, 0.5, 1].map(t => g(A[0] + (B[0] - A[0]) * t - conn.nx * 0.7, A[1] + (B[1] - A[1]) * t - conn.nz * 0.7))) - 0.5;
      face('wall', A, B, bot, yP + ph, [-conn.nx, -conn.nz], 0);
      face('stone', IA, IB, yP, yP + ph, [conn.nx, conn.nz], 0, 2);
      flat('stone', [[A[0], yP + ph, A[1]], [B[0], yP + ph, B[1]], [IB[0], yP + ph, IB[1]], [IA[0], yP + ph, IA[1]]], 2);
      cquad([A[0], bot - 0.5, A[1]], [B[0], bot - 0.5, B[1]], [B[0], yP + ph, B[1]], [A[0], yP + ph, A[1]]);
      posts.push([B[0] + conn.nx * pw / 2 - conn.dx * 0.3, B[1] + conn.nz * pw / 2 - conn.dz * 0.3]);
    }

    /* ---------- пандус: плита, наружная стенка, парапет где пляж ниже ---------- */
    const rA = stepA(a0, a1, 2), rm = Math.max(2, Math.ceil((Math.max(...rA.map(rOut)) - rw) / 2));
    const rr = (a, j) => rw + (rOut(a) - rw) * j / rm, ry = (a, r) => yRamp(a, r) + lift;
    let so = 0, nRamp = 0;
    for (let k = 0; k + 1 < rA.length; k++) {
      const a = rA[k], b = rA[k + 1];
      for (let j = 0; j < rm; j++) {
        const q = [pt(a, rr(a, j)), pt(b, rr(b, j)), pt(b, rr(b, j + 1)), pt(a, rr(a, j + 1))];
        const ys = [ry(a, rr(a, j)), ry(b, rr(b, j)), ry(b, rr(b, j + 1)), ry(a, rr(a, j + 1))];
        const vs = q.map(([x, z], i) => [x, ys[i], z]);
        flat('ramp', vs, 4); cquad(...vs); walk(q, ys); nRamp++;
      }
      // наружный край: стенка до пляжа, парапет — где пляж ниже на drop
      const oa = pt(a, rOut(a)), ob = pt(b, rOut(b)), ya = ry(a, rOut(a)), yb = ry(b, rOut(b));
      const gOut = t => Math.min(...[0.3, 1.0].map(o => g(...pt(t, rOut(t) + o))));
      const ga = gOut(a), gb = gOut(b), para = Math.min(ya - ga, yb - gb) > P.drop, top = para ? ph : 0;
      const m = (a + b) / 2, n = [Math.cos(m * D2R), Math.sin(m * D2R)];
      so = face('wall', oa, ob, [ga - 0.5, gb - 0.5], [ya + top, yb + top], n, so);
      if (para) {
        const ia = pt(a, rOut(a) - pw), ib = pt(b, rOut(b) - pw);
        face('stone', ia, ib, [ya, yb], [ya + ph, yb + ph], [-n[0], -n[1]], so, 2);
        flat('stone', [[oa[0], ya + ph, oa[1]], [ob[0], yb + ph, ob[1]], [ib[0], yb + ph, ib[1]], [ia[0], ya + ph, ia[1]]], 2);
      }
      cquad([oa[0], Math.min(ga, gb) - 1, oa[1]], [ob[0], Math.min(ga, gb) - 1, ob[1]], [ob[0], yb + Math.max(top, 0.3), ob[1]], [oa[0], ya + Math.max(top, 0.3), oa[1]]);
    }

    /* ---------- памятник: ступени, столб из бута, карниз, табличка к улице, камни и агавы ---------- */
    const [mx, mz] = P.mon, Q = P.mon3, am = ((a0 + a2) / 2 + 180) * D2R, rot = Math.atan2(Math.cos(am), Math.sin(am));   // лицо — к улице
    const fx = Math.sin(rot), fz = Math.cos(rot), sx = Math.cos(rot), sz = -Math.sin(rot);   // вперёд (к улице), вбок
    let y = yP;
    for (const w of Q.steps) { lmBox(group, M.stone, w, Q.step, w, mx, y, mz, rot); y += Q.step; }
    lmBox(group, M.rubble, Q.shaft[0], Q.shaft[1], Q.shaft[0], mx, y, mz, rot);
    const yTop = y + Q.shaft[1];
    lmBox(group, M.stone, Q.cap[0], Q.cap[1], Q.cap[0], mx, yTop, mz, rot);
    const [pw2, ph2, py2] = Q.plaque, fo = Q.shaft[0] / 2 + 0.02;
    lmBox(group, M.plaque, pw2, ph2, 0.04, mx + fx * fo, yP + py2 - ph2 / 2, mz + fz * fo, rot);
    const yC = yTop + Q.cap[1];
    for (const [u, v, w, h, d, r] of [[-0.3, -0.2, 0.6, 0.45, 0.5, 0.4], [0.32, 0.25, 0.5, 0.35, 0.55, -0.3], [0.1, -0.35, 0.45, 0.3, 0.4, 0.9]])
      lmBox(group, M.rubble, w, h, d, mx + sx * u + fx * v, yC, mz + sz * u + fz * v, rot + r);
    for (const [u, v, h] of [[0.35, -0.3, 0.7], [-0.4, 0.3, 0.55], [0.05, 0.4, 0.6], [-0.1, -0.05, 0.85]])
      lmCyl(group, M.green, 0.32, h, mx + sx * u + fx * v, yC + 0.2, mz + sz * u + fz * v, { seg: 5, top: 0.03 });
    lmCollideBox(K, mx, mz, Q.steps[0], Q.steps[0], rot, yP - 1, yTop + 0.5);

    /* ---------- тумбы с шарами, кусты ---------- */
    for (const [x, z] of posts) {
      lmBox(group, M.stone, 0.46, ph + 0.1, 0.46, x, yP, z, 0);
      lmBox(group, M.stone, 0.54, 0.08, 0.54, x, yP + ph + 0.1, z, 0);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 7), M.stone);
      ball.position.set(x, yP + ph + 0.38, z); ball.castShadow = ball.receiveShadow = true; group.add(ball);
    }
    if (shrubs.length) {
      const m = new THREE.Mesh(mergeGeometries(shrubs.map(q => q.toNonIndexed())), M.green);
      m.castShadow = m.receiveShadow = true; group.add(m);
    }

    /* ---------- меши копилок, сетка столкновений ---------- */
    for (const [key, b] of bufs) {
      if (!b.i.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(b.v, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      geo.setIndex(b.i); geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, b.mat); m.name = 'benapres-' + key; m.castShadow = b.shadow; m.receiveShadow = true; group.add(m);
    }
    K.meshColliders.push({ v: new Float32Array(cv), i: new Uint32Array(ci), walk: true });
    Z.stats.build = { rays: rays.length, ramp: nRamp, posts: posts.length, shrubs: shrubs.length };
  },
};

/* ---------- материалы: набережная (stPromTex) и камень строений (lmMat) ---------- */
let lmBenapresMatsCache = null;
function lmBenapresMats() {
  if (lmBenapresMatsCache) return lmBenapresMatsCache;
  const T = stPromTex(), CO = stPromCfg.colors;
  const m = (map, o = {}) => { const x = stdMat('#ffffff', Object.assign({ map, roughness: 0.92 }, o)); x.userData.shared = true; return x; };
  return lmBenapresMatsCache = {
    wall: m(T.plaster), conc: m(T.concrete), lawn: m(T.lawn, { roughness: 1 }),
    stone: lmMat(CO.mar.rail, { tex: 'stone' }), rubble: lmMat('#cdc3b0', { tex: 'rubble' }),
    plaque: lmMat('#3a3934', { rough: 0.5 }), green: lmMat('#466f30', { rough: 1 }),
  };
}
