// Ситжес — ПОСТРОЙКА: заборы по видам, столбы, калитки и ворота (этапы 3б, 4а.4). После тротуаров (walks3d.js).
//   Где забор — раскладка (js/maps/sitges/fences.js: C.fences — куски по участкам вдоль кромки тротуаров и края
//   проезжей части; стиль куска f.style — fencestyle.js; проёмы C.gates — gates.js); здесь геометрия и столкновения.
//   Высота верха тротуара — из K.rk.edges (walks3d.js; те же массивы концов, что в C.fenceLine), у края проезжей
//   части — рельеф + подъём, у границы участка — рельеф.
//   Вид (по фото, docs/sitges/stage-4a.md): цоколь h0 по линии толщиной SITGES_FENCE.t (штукатурка белая / кремовая,
//   бутовый камень, кирпич, плитка, бетон) с шапкой; верх до h1 — вереск или ламели (две грани по середине цоколя),
//   сварная сетка, кованая решётка, у блоков перила (плоскость с альфой), изгородь — коробка листвы с неровным верхом
//   и кромкой листьев; решётка из блоков (только у строений, lm/em30.js) — две грани с альфой и шапка; глухая стена
//   и низкая стенка — цоколь на всю высоту. Столбы (кубы с шапкой) — где по стилю
//   (posts), через ≈ SITGES_FENCE3D.postEvery м, и по бокам каждого проёма; общий столб пары калитка + ворота — с
//   почтовым ящиком и номером дома. Проём: цоколя и верха нет, створка — на inset м глубже лица забора (ламели, доски,
//   лист, дверь — твёрдые, обе стороны; сетка и кованая — с альфой и рамой); над проёмом в глухой стене — перемычка.
//   Материалы (копилка улиц K.rk, квадраты SITGES_FENCE.chunk м со скрытием дальше far): fence-solid — атлас твёрдых
//   поверхностей (тень — теневые копии), fence-hedge — листва (тень — теневые копии), fence-alpha — атлас с альфой
//   (тени нет; вдали — дымка: alphaToCoverage при MSAA, без него — смешивание, 4а.7); текстуры — fencetex.js.
//   Ворота и калитки закрыты: столкновения — стенки высотой SITGES_FENCE.h1 с двух сторон цоколя по всей линии, через
//   проёмы тоже (как в 3б), торцы на концах сплошного забора.
//   Отладка — страница с ?fences: цоколь цветом вида верха (SITGES_FENCE_DBG), створки — цветом проёма (калитка —
//   малиновая, ворота по ортофото — голубые, по OSM и проездам — синие).
// rk.fenceStats — сводка раскладки C.fenceStats и постройки: geo = { posts, plates, leaves, hedgeKm, tris }, ms.
// Определяет: SITGES_FENCE_DBG, SITGES_FENCE3D, sitgesBuildFences.
// Использует: MAT, QUAL, clamp (js/core.js); SITGES_FENCE (js/maps/sitges/fences.js); SITGES_FSTYLE
//   (js/maps/sitges/fencestyle.js); SITGES_RB (js/maps/sitges/roads3d.js); sitgesFenceTextures, SITGES_FTEX
//   (js/maps/sitges/fencetex.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

// отладочный цвет цоколя по виду верха (?fences): вереск — охра, изгородь — зелёный, ламели — синий, сетка — бирюза,
// решётка — чёрный, глухая стена — белый, низкая стенка — жёлтый
const SITGES_FENCE_DBG = { lattice: 0xe0a0e0, heath: 0xb08040, hedge: 0x3f9a3a, slats: 0x4a6ab8, mesh: 0x2ab0b0, grille: 0x303030, wall: 0xffffff, low: 0xe8c838 };

const SITGES_FENCE3D = {
  yc: 0.05,               // толщина шапки цоколя, м
  stretch: 2.1,           // штукатурка растягивается по вертикали до стольких раз (одна грань до 2,6 м)
  post: 0.3, postStone: 0.36,   // ширина столба (каменного), м
  postOut: 0.05,          // столб выступает из цоколя с каждой стороны, м
  postCap: [0.035, 0.06], // шапка столба: выступ, толщина, м
  postEvery: 2.75,        // шаг столбов по стилю, м (2,5–3 м по фото)
  postTop: 0.06,          // столб выше верха забора, м (у глухой и низкой стенки — wallTop)
  wallTop: 0.1,
  inset: 0.05,            // створка глубже лица забора, м
  leaf: [1.2, 2.1, 2.2],  // высота створки ≈ верх забора + 0,1: не ниже; калитка не выше; ворота не выше, м
  door: 2.05,             // дверь старого города, м
  frame: 0.05,            // рама сетчатых и кованых створок, м
  lintel: 0.15,           // перемычка над проёмом глухой стены — если стена выше створки на столько, м
  rail: 0.95,             // решётка ниже — перила блоков (трубы), выше — кованая
  // изгородь: лицо выступает на front м (волной), задняя грань — на back м за цоколем; верх волной wave м; шаг
  // разбиения step м; кромка листьев — от fringe[0] м ниже верха до fringe[1] м выше
  hedge: { front: [0.02, 0.08], back: 0.32, wave: [0.07, 0.045], step: 1.5, fringe: [0.1, 0.22] },
  // шапка цоколя по виду цоколя; базовый тон цоколя (белая и кремовая штукатурка — SITGES_FSTYLE.baseColor)
  cap: { white: 0xdcd8d0, cream: 0xd8ccb4, rubble: 0xd6cdbb, brick: 0xa8684a, tile: 0xd6c6a6, concrete: 0xc6c4be },
  band: { white: 'plaster', cream: 'plaster', rubble: 'rubble', brick: 'brick', tile: 'tile', concrete: 'concrete' },
  postBand: { plaster: 'plaster', stone: 'rubble', brick: 'brick' },
};

function sitgesBuildFences(K) {
  const { D, rk } = K, C = D.C, F = SITGES_FENCE, Q = SITGES_FENCE3D, g = D.ground, t0 = performance.now();
  const { MAT, UP, cquad, cnt, edges, lod, casts } = rk;
  const TX = sitgesFenceTextures(), UV = TX.uv, REP = SITGES_FTEX.rep;
  lod['fence-solid'] = [F.chunk, F.far.solid]; lod['fence-hedge'] = [F.chunk, F.far.hedge]; lod['fence-alpha'] = [F.chunk, F.far.alpha];
  casts.add('fence-solid'); casts.add('fence-hedge');
  MAT['fence-solid'] = new THREE.MeshStandardMaterial({ name: 'fence-solid', map: TX.solid, roughness: 0.9, vertexColors: true });
  MAT['fence-hedge'] = new THREE.MeshStandardMaterial({ name: 'fence-hedge', map: TX.hedge, roughness: 0.95, vertexColors: true });
  // Прутья вдали (4а.7): с MSAA — alphaToCoverage (дымка по доле покрытия; смешивание Custom ONE / ZERO — то же
  // непрозрачное, но в three 0.160 у NormalBlending альфа на выходе = 1 и покрытие было бы полным); без MSAA —
  // полупрозрачный (смешивание по альфе, глубина пишется; alphaHash шумел и вблизи). Мипмапы атласа — свои
  // (fencetex.js, sitgesAlphaMips).
  const FA = SITGES_FTEX, a2c = !!QUAL.aa;
  MAT['fence-alpha'] = new THREE.MeshStandardMaterial({ name: 'fence-alpha', map: TX.alpha, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.3, vertexColors: true,
    ...(a2c ? { alphaToCoverage: true, alphaTest: FA.alphaCut, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.ZeroFactor } : { transparent: true, alphaTest: FA.alphaCut }) });
  let nq = 0;
  const quad = (...a) => { nq++; rk.quad(...a); };

  /* ---------- высота верха тротуара на концах отрезков линии ---------- */
  const lift = SITGES_RB.lift.drive, byA = new Map();
  for (const e of edges) byA.set(e.A, e);
  let lost = 0;
  const ys = C.fenceLine.map(l => {
    if (l.kind === 'lot') return [g(l.A[0], l.A[1]), g(l.B[0], l.B[1])];   // граница участка — по рельефу
    const e = l.kind === 'curb' ? null : byA.get(l.A);
    if (e && e.B === l.B) return [e.ya, e.yb];
    if (l.kind !== 'curb') lost++;
    return [g(l.A[0], l.A[1]) + lift, g(l.B[0], l.B[1]) + lift];
  });
  if (lost) console.error(`Ситжес, заборы: у ${lost} отрезков кромки нет высоты тротуара (rk.edges)`);

  /* ---------- грани ---------- */
  // вертикальная грань a → b (точки [x, z]) от ya0…ya1 до yb0…yb1 по полосе твёрдого атласа с повтором по вертикали:
  // одинаковая высота на концах — куски по band.m от низа (рисунок без швов), иначе — поровну
  const face = (band, a, b, ya0, ya1, yb0, yb1, n, c, ua, ub) => {
    const B = UV[band], hA = ya1 - ya0, hB = yb1 - yb0, dv0 = (B.v1 - B.v0) / B.m;
    if (hA < 1e-3 && hB < 1e-3) return;
    // штукатурка однородна: растянуть по вертикали до Q.stretch раз — меньше граней
    const sc = band === 'plaster' ? clamp(Math.max(hA, hB) / B.m, 1, Q.stretch) : 1, m = B.m * sc, dv = dv0 / sc;
    if (Math.abs(hA - hB) < 0.01) {
      for (let y = 0; y < hA - 1e-3; y += m) {
        const y1 = Math.min(hA, y + m), v1 = B.v0 + (y1 - y) * dv;
        quad('fence-solid', [[a[0], ya0 + y, a[1]], [b[0], yb0 + y, b[1]], [b[0], yb0 + y1, b[1]], [a[0], ya0 + y1, a[1]]], n, c,
          [[ua, B.v0], [ub, B.v0], [ub, v1], [ua, v1]]);
      }
      return;
    }
    const k = Math.max(1, Math.ceil(Math.max(hA, hB) / m - 0.01));
    for (let i = 0; i < k; i++)
      quad('fence-solid', [[a[0], ya0 + hA * i / k, a[1]], [b[0], yb0 + hB * i / k, b[1]], [b[0], yb0 + hB * (i + 1) / k, b[1]], [a[0], ya0 + hA * (i + 1) / k, a[1]]], n, c,
        [[ua, B.v0], [ub, B.v0], [ub, B.v0 + hB / k * dv], [ua, B.v0 + hA / k * dv]]);
  };
  // грань по полосе атласа с альфой «от верха» (верх грани — верх полосы)
  const faceTop = (band, a, b, ya0, ya1, yb0, yb1, n, c, ua, ub) => {
    const B = UV[band], dv = (B.v1 - B.v0) / B.m, v = h => Math.max(B.v0, B.v1 - h * dv);
    quad('fence-alpha', [[a[0], ya0, a[1]], [b[0], yb0, b[1]], [b[0], yb1, b[1]], [a[0], ya1, a[1]]], n, c,
      [[ua, v(ya1 - ya0)], [ub, v(yb1 - yb0)], [ub, B.v1], [ua, B.v1]]);
  };
  // горизонтальная или узкая грань (шапки, торцы): кусок полосы штукатурки
  const PL = UV.plaster, dvp = (PL.v1 - PL.v0) / PL.m;
  const flat = (p, n, c, ua, ub, h = 0.06) => quad('fence-solid', p, n, c, [[ua, PL.v0], [ub, PL.v0], [ub, PL.v0 + h * dvp], [ua, PL.v0 + h * dvp]]);

  /* ---------- постройка ---------- */
  const T = F.t, dbg = typeof location !== 'undefined' && /[?&]fences\b/.test(location.search);
  const gatesOf = new Map();
  for (const gt of C.gates || []) { if (!gatesOf.has(gt.f)) gatesOf.set(gt.f, []); gatesOf.get(gt.f).push(gt); }
  const geo = { posts: 0, plates: 0, leaves: 0, hedgeKm: 0, tris: 0 };
  cnt.yard = 0;
  C.fences.forEach((f, fi) => { buildPiece(f, fi); collide(f); });

  function buildPiece({ P, N, at, cut, s: runS, style }, fi) {
    const Y = at.map(([e, t]) => ys[e][0] + (ys[e][1] - ys[e][0]) * t), S = [0];
    for (let k = 1; k < P.length; k++) S.push(S[k - 1] + Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]));
    const L = S[S.length - 1];
    if (L < 1e-3) return;
    // точка на расстоянии s от начала куска (за концами — продолжение крайнего отрезка): положение, верх тротуара,
    // нормаль к участку
    const segOf = s => { let k = 0; while (k + 2 < P.length && S[k + 1] < s) k++; return k; };
    const pt = (s, k = segOf(s)) => {
      const t = (s - S[k]) / Math.max(1e-6, S[k + 1] - S[k]), tc = clamp(t, 0, 1);
      const nx = N[k][0] + (N[k + 1][0] - N[k][0]) * tc, nz = N[k][1] + (N[k + 1][1] - N[k][1]) * tc, l = Math.hypot(nx, nz) || 1;
      return { x: P[k][0] + (P[k + 1][0] - P[k][0]) * t, z: P[k][1] + (P[k + 1][1] - P[k][1]) * t, y: Y[k] + (Y[k + 1] - Y[k]) * t, n: [nx / l, nz / l] };
    };
    const off = (p, d) => [p.x + p.n[0] * d, p.z + p.n[1] * d];
    // точки разбиения s0…s1: изломы ломаной и (step) куски не длиннее step
    const marks = (s0, s1, step) => {
      const m = [s0];
      for (let k = 1; k + 1 < P.length; k++) if (S[k] > s0 + 1e-3 && S[k] < s1 - 1e-3) m.push(S[k]);
      m.push(s1);
      if (!step) return m;
      const out = [s0];
      for (let i = 1; i < m.length; i++) {
        const n = Math.max(1, Math.ceil((m[i] - m[i - 1]) / step - 0.01));
        for (let j = 1; j <= n; j++) out.push(m[i - 1] + (m[i] - m[i - 1]) * j / n);
      }
      return out;
    };
    // пары соседних точек разбиения: (pa, pb, sa, sb, nf — нормаль к улице, nb — к участку)
    const each = (s0, s1, step, fn) => {
      const m = marks(s0, s1, step);
      for (let i = 0; i + 1 < m.length; i++) {
        const sa = m[i], sb = m[i + 1], k = segOf((sa + sb) / 2), pa = pt(sa, k), pb = pt(sb, k);
        let nx = pa.n[0] + pb.n[0], nz = pa.n[1] + pb.n[1];
        const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
        fn(pa, pb, sa, sb, [-nx, 0, -nz], [nx, 0, nz]);
      }
    };
    const u = s => (runS + s) / REP;

    const top = style.top, H0 = style.h0, H1 = style.h1, isWall = top === 'wall' || top === 'low';
    const band = Q.band[style.base] || 'plaster', plain = style.base === 'white' || style.base === 'cream';
    const tint = dbg ? SITGES_FENCE_DBG[top] : plain ? SITGES_FSTYLE.baseColor[style.base] : 0xffffff;
    const capC = Q.cap[style.base] || Q.cap.white, yc = Q.yc;

    // цоколь (или перемычка) от ya / yb + y0 до + y1: лицо, задняя грань (низ — под землю участка), шапка (кромка —
    // только к улице)
    const plinth = (pa, pb, sa, sb, nf, nb, y0, y1, low) => {
      const ua = u(sa), ub = u(sb), a = [pa.x, pa.z], b = [pb.x, pb.z], a1 = off(pa, T), b1 = off(pb, T);
      face(band, a, b, pa.y + y0, pa.y + y1, pb.y + y0, pb.y + y1, nf, tint, ua, ub);
      const gA = low ? Math.min(pa.y, g(a1[0], a1[1])) - 0.3 : pa.y + y0, gB = low ? Math.min(pb.y, g(b1[0], b1[1])) - 0.3 : pb.y + y0;
      face(band, a1, b1, gA, pa.y + y1, gB, pb.y + y1, nb, tint, ua, ub);
      const cA = off(pa, -F.cap), cB = off(pb, -F.cap), dA = off(pa, T + F.cap), dB = off(pb, T + F.cap), ta = pa.y + y1, tb = pb.y + y1;
      flat([[cA[0], ta + yc, cA[1]], [cB[0], tb + yc, cB[1]], [dB[0], tb + yc, dB[1]], [dA[0], ta + yc, dA[1]]], UP, capC, ua, ub, T);
      flat([[cA[0], ta - 0.01, cA[1]], [cB[0], tb - 0.01, cB[1]], [cB[0], tb + yc, cB[1]], [cA[0], ta + yc, cA[1]]], nf, capC, ua, ub);
    };
    // торец цоколя в точке s; dir — наружу (−1 — к началу куска)
    const endCap = (s, dir, y1) => {
      const p = pt(s), b = off(p, T), gb = Math.min(p.y, g(b[0], b[1])) - 0.3, k = segOf(s);
      const tx = P[k + 1][0] - P[k][0], tz = P[k + 1][1] - P[k][1], l = Math.hypot(tx, tz) || 1;
      face(band, [p.x, p.z], b, p.y - 0.05, p.y + y1, gb, p.y + y1, [dir * tx / l, 0, dir * tz / l], tint, 0, T / REP);
    };

    /* проёмы на куске: [a, b], высота створки */
    const ops = (gatesOf.get(fi) || []).map(gt => {
      const lh = gt.leaf.type === 'door' ? Q.door : clamp(H1 + 0.1, Q.leaf[0], gt.kind === 'car' ? Q.leaf[2] : Q.leaf[1]);
      return { a: gt.s - gt.w / 2, b: gt.s + gt.w / 2, gt, lh };
    }).sort((p, q) => p.a - q.a);
    const spans = [];
    let s0 = 0;
    for (const o of ops) { if (o.a > s0 + 1e-3) spans.push({ s0, s1: o.a }); spans.push({ s0: o.a, s1: o.b, o }); s0 = o.b; }
    if (L > s0 + 1e-3) spans.push({ s0, s1: L });

    for (const sp of spans) {
      if (sp.o) { opening(sp.o); continue; }
      if (sp.s0 > 0 && sp.s1 < L && sp.s1 - sp.s0 < 0.5) continue;   // между проёмами — общий столб
      // цоколь и верх
      each(sp.s0, sp.s1, 0, (pa, pb, sa, sb, nf, nb) => {
        plinth(pa, pb, sa, sb, nf, nb, -0.05, H0, true);
        if (isWall || top === 'hedge') return;
        const ya = pa.y + H0 + yc, yb = pb.y + H0 + yc, ua = u(sa), ub = u(sb);
        if (top === 'lattice') {
          // решётка из блоков: грани с альфой по обеим сторонам цоколя (в просветы видна дальняя), шапка сверху
          faceTop('lattice', off(pa, 0.02), off(pb, 0.02), ya, pa.y + H1, yb, pb.y + H1, nf, style.color, ua, ub);
          faceTop('lattice', off(pa, T - 0.02), off(pb, T - 0.02), ya, pa.y + H1, yb, pb.y + H1, nb, style.color, ua, ub);
          plinth(pa, pb, sa, sb, nf, nb, H1, H1 + 0.06, false);
        } else if (top === 'heath' || top === 'slats') {
          face(top, off(pa, T / 2 - 0.015), off(pb, T / 2 - 0.015), ya, pa.y + H1, yb, pb.y + H1, nf, style.color, ua, ub);
          face(top, off(pa, T / 2 + 0.015), off(pb, T / 2 + 0.015), ya, pa.y + H1, yb, pb.y + H1, nb, style.color, ua, ub);
        } else {
          const bd = top === 'mesh' ? 'mesh' : H1 - H0 < Q.rail ? 'rail' : 'wrought';
          faceTop(bd, off(pa, T / 2), off(pb, T / 2), ya, pa.y + H1, yb, pb.y + H1, nf, style.color, ua, ub);
        }
      });
      if (top === 'hedge') hedge(sp);
      // торцы на концах сплошного забора (на разрезе по участкам забор продолжается соседним куском)
      if (sp.s0 === 0 && !cut[0]) endCap(0, -1, H0);
      if (sp.s1 === L && !cut[1]) endCap(L, 1, H0);
    }

    // изгородь: коробка листвы над цоколем — лицо волной (выступ), верх волной, задняя грань; кромка листьев сверху
    function hedge(sp) {
      const HG = Q.hedge, wave = s => H1 + HG.wave[0] * Math.sin(s * 2.3 + 1) + HG.wave[1] * Math.sin(s * 5.1 + 2);
      const fr = s => -(HG.front[0] + (HG.front[1] - HG.front[0]) * (0.5 + 0.5 * Math.sin(s * 1.7))), back = T + HG.back;
      const tl = SITGES_FTEX.hedge, c = style.color;
      // у проёма изгородь кончается у столба
      const h0 = sp.s0 > 0 ? sp.s0 + Q.post : 0, h1 = sp.s1 < L ? sp.s1 - Q.post : L;
      if (h1 - h0 < 0.3) return;
      each(h0, h1, HG.step, (pa, pb, sa, sb, nf, nb) => {
        const ra = runS + sa, rb = runS + sb, ya = pa.y + H0 + yc, yb = pb.y + H0 + yc, ta = pa.y + wave(ra), tb = pb.y + wave(rb);
        const fa = off(pa, fr(ra)), fb = off(pb, fr(rb)), ka = off(pa, back), kb = off(pb, back);
        const uv = (y0, y1, z0, z1) => [[ra / tl, y0 / tl], [rb / tl, z0 / tl], [rb / tl, z1 / tl], [ra / tl, y1 / tl]];
        quad('fence-hedge', [[fa[0], ya, fa[1]], [fb[0], yb, fb[1]], [fb[0], tb, fb[1]], [fa[0], ta, fa[1]]], nf, c, uv(ya, ta, yb, tb));
        quad('fence-hedge', [[fa[0], ta, fa[1]], [fb[0], tb, fb[1]], [kb[0], tb, kb[1]], [ka[0], ta, ka[1]]], UP, c,
          [[ra / tl, 0], [rb / tl, 0], [rb / tl, (back - fr(rb)) / tl], [ra / tl, (back - fr(ra)) / tl]]);
        quad('fence-hedge', [[ka[0], ya, ka[1]], [kb[0], yb, kb[1]], [kb[0], tb, kb[1]], [ka[0], ta, ka[1]]], nb, c, uv(ya, ta, yb, tb));
        const ea = off(pa, fr(ra) + 0.1), eb = off(pb, fr(rb) + 0.1);
        faceTop('fringe', ea, eb, ta - HG.fringe[0], ta + HG.fringe[1], tb - HG.fringe[0], tb + HG.fringe[1], nf, c, ra / REP, rb / REP);
        geo.hedgeKm += (sb - sa) / 1000;
      });
      // торцы у проёмов и на концах забора
      for (const [s, dir] of [[h0, -1], [h1, 1]]) {
        if ((s === 0 && cut[0]) || (s === L && cut[1])) continue;
        const p = pt(s), k = segOf(s), tx = P[k + 1][0] - P[k][0], tz = P[k + 1][1] - P[k][1], l = Math.hypot(tx, tz) || 1, r = runS + s;
        const a = off(p, fr(r)), b = off(p, back), y0 = p.y + H0 + yc, y1 = p.y + wave(r);
        quad('fence-hedge', [[a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]]], [dir * tx / l, 0, dir * tz / l], c,
          [[0, y0 / tl], [(back - fr(r)) / tl, y0 / tl], [(back - fr(r)) / tl, y1 / tl], [0, y1 / tl]]);
      }
    }

    // проём: створка на inset глубже лица (порог — по тротуару), перемычка в глухой стене
    function opening(o) {
      const { gt, lh } = o, w = gt.w, lf = gt.leaf.type;
      const lc = dbg ? (gt.kind === 'wicket' ? 0xff30c0 : gt.src === 'win' ? 0x20d0ff : 0x3050ff) : gt.leaf.color;
      const D = SITGES_FTEX.misc.door, MS = UV.misc, du = (D[1] - D[0]) / TX.W, dvm = (MS.v1 - MS.v0) / MS.m;
      const fw = Q.frame, open = lf === 'mesh' || lf === 'wrought';
      each(o.a, o.b, 0, (pa, pb, sa, sb, nf, nb) => {
        const ya = pa.y - 0.02, yb = pb.y - 0.02, ta = pa.y + lh, tb = pb.y + lh, ua = (sa - o.a) / REP, ub = (sb - o.a) / REP;
        const la = off(pa, Q.inset), lb = off(pb, Q.inset), ka = off(pa, Q.inset + 0.03), kb = off(pb, Q.inset + 0.03);
        if (lf === 'door') {
          const u0 = D[0] / TX.W + (sa - o.a) / w * du, u1 = D[0] / TX.W + (sb - o.a) / w * du, v1 = MS.v0 + Q.door * dvm;
          quad('fence-solid', [[la[0], ya, la[1]], [lb[0], yb, lb[1]], [lb[0], tb, lb[1]], [la[0], ta, la[1]]], nf, lc, [[u0, MS.v0], [u1, MS.v0], [u1, v1], [u0, v1]]);
          face('wood', ka, kb, ya, ta, yb, tb, nb, lc, ua, ub);
        } else if (!open) {
          face(lf, la, lb, ya, ta, yb, tb, nf, lc, ua, ub);
          face(lf, ka, kb, ya, ta, yb, tb, nb, lc, ua, ub);
        } else {
          faceTop(lf, la, lb, ya + fw, ta - fw, yb + fw, tb - fw, nf, lc, ua, ub);
          // рама: верх и низ (лицо и обратная сторона)
          const fa = off(pa, Q.inset - 0.012), fb = off(pb, Q.inset - 0.012), ga = off(pa, Q.inset + 0.012), gb = off(pb, Q.inset + 0.012);
          for (const [y0, z0] of [[ya + 0.04, yb + 0.04], [ta - fw, tb - fw]]) {
            face('sheet', fa, fb, y0, y0 + fw, z0, z0 + fw, nf, lc, ua, ub);
            face('sheet', ga, gb, y0, y0 + fw, z0, z0 + fw, nb, lc, ua, ub);
          }
        }
        // перемычка над проёмом глухой стены
        if (top === 'wall' && H1 - lh > Q.lintel) {
          plinth(pa, pb, sa, sb, nf, nb, lh, H1, false);
          const a1 = off(pa, T), b1 = off(pb, T);
          flat([[pa.x, ta, pa.z], [pb.x, tb, pb.z], [b1[0], tb, b1[1]], [a1[0], ta, a1[1]]], [0, -1, 0], tint, u(sa), u(sb), T);
        }
      });
      // стойки рамы по краям сетчатой и кованой створки
      if (open) for (const [sa, sb] of [[o.a, o.a + fw], [o.b - fw, o.b]]) {
        const pa = pt(sa), pb = pt(sb);
        for (const [d, n] of [[Q.inset - 0.012, -1], [Q.inset + 0.012, 1]])
          face('sheet', off(pa, d), off(pb, d), pa.y, pa.y + lh, pb.y, pb.y + lh, [n * pa.n[0], 0, n * pa.n[1]], lc, 0, fw / REP);
      }
      geo.leaves++;
    }

    /* столбы: по бокам проёмов (общий в паре — с почтовым ящиком и номером дома), по стилю — через ≈ postEvery м */
    const posts = [];
    const gpKind = style.posts !== 'none' ? style.posts : style.base === 'rubble' ? 'stone' : style.base === 'brick' ? 'brick' : 'plaster';
    for (let i = 0; i < ops.length; i++) {
      const o = ops[i], nx = ops[i + 1], pv = ops[i - 1], h = Math.max(H1, o.lh) + Q.postTop;
      if (!(pv && o.a - pv.b < 0.5)) posts.push({ s: o.a - Q.post / 2, w: Q.post, h, kind: gpKind });
      if (nx && nx.a - o.b < 0.5) posts.push({ s: (o.b + nx.a) / 2, w: nx.a - o.b, h: Math.max(h, Math.max(H1, nx.lh) + Q.postTop), kind: 'plaster', plate: o.gt.pair >= 0 });
      else posts.push({ s: o.b + Q.post / 2, w: Q.post, h, kind: gpKind });
    }
    if (style.posts !== 'none' && top !== 'hedge') {
      const n = Math.max(1, Math.round(L / Q.postEvery)), sp = L / n, w = style.posts === 'stone' ? Q.postStone : Q.post;
      const h = H1 + (isWall ? Q.wallTop : Q.postTop);
      for (let i = cut[0] ? 1 : 0; i <= n; i++) {
        const s = i * sp;
        if (ops.some(o => s > o.a - Q.post - w / 2 - 0.15 && s < o.b + Q.post + w / 2 + 0.15)) continue;
        posts.push({ s, w, h, kind: style.posts });
      }
    }
    for (const p of posts) post(p);

    // столб: куб поперёк цоколя (с выступом postOut с каждой стороны) и шапка
    function post({ s, w, h, kind, plate }) {
      const c = pt(s), n = c.n, t = [-n[1], n[0]], d0 = -Q.postOut, d1 = T + Q.postOut;
      const at = (l, d) => [c.x + t[0] * l + n[0] * d, c.z + t[1] * l + n[1] * d];
      const bd = Q.postBand[kind] || 'plaster', pc = dbg ? tint : kind === 'plaster' ? (plain ? tint : SITGES_FSTYLE.baseColor.white) : 0xffffff;
      const yf = c.y - 0.1, bk = at(0, d1), yk = Math.min(c.y, g(bk[0], bk[1])) - 0.3, yt = c.y + h, uo = ((s * 0.37) % 1 + 1) % 1;
      const L0 = at(-w / 2, d0), R0 = at(w / 2, d0), L1 = at(-w / 2, d1), R1 = at(w / 2, d1), dd = (d1 - d0) / REP;
      if (plate) {
        // лицо общего столба: картинка misc (вариант по месту)
        const MS = UV.misc, pl = SITGES_FTEX.misc.plate[Math.floor(uo * 2)], v1 = MS.v0 + Math.min(1, (yt - yf) / MS.m) * (MS.v1 - MS.v0);
        quad('fence-solid', [[L0[0], yf, L0[1]], [R0[0], yf, R0[1]], [R0[0], yt, R0[1]], [L0[0], yt, L0[1]]], [-n[0], 0, -n[1]], pc,
          [[pl[0] / TX.W, MS.v0], [pl[1] / TX.W, MS.v0], [pl[1] / TX.W, v1], [pl[0] / TX.W, v1]]);
        geo.plates++;
      } else face(bd, L0, R0, yf, yt, yf, yt, [-n[0], 0, -n[1]], pc, uo, uo + w / REP);
      face(bd, R1, L1, yk, yt, yk, yt, [n[0], 0, n[1]], pc, uo, uo + w / REP);
      face(bd, R0, R1, yf, yt, yk, yt, [t[0], 0, t[1]], pc, uo, uo + dd);
      face(bd, L1, L0, yk, yt, yf, yt, [-t[0], 0, -t[1]], pc, uo, uo + dd);
      // шапка
      const e = Q.postCap[0], ch = Q.postCap[1], cc = kind === 'stone' ? Q.cap.rubble : kind === 'brick' ? Q.cap.brick : capC;
      const A = at(-w / 2 - e, d0 - e), B = at(w / 2 + e, d0 - e), Cc = at(w / 2 + e, d1 + e), Dd = at(-w / 2 - e, d1 + e);
      flat([[A[0], yt + ch, A[1]], [B[0], yt + ch, B[1]], [Cc[0], yt + ch, Cc[1]], [Dd[0], yt + ch, Dd[1]]], UP, cc, uo, uo + w / REP, T);
      for (const [p, q, nn] of [[A, B, [-n[0], 0, -n[1]]], [B, Cc, [t[0], 0, t[1]]], [Dd, A, [-t[0], 0, -t[1]]]])
        flat([[p[0], yt, p[1]], [q[0], yt, q[1]], [q[0], yt + ch, q[1]], [p[0], yt + ch, p[1]]], nn, cc, uo, uo + w / REP);
      geo.posts++;
    }
  }

  // столкновения (как в 3б): стенки высотой h1 с двух сторон цоколя по всей линии (проёмы закрыты), торцы на концах
  function collide({ P, N, at, cut }) {
    const Y = at.map(([e, t]) => ys[e][0] + (ys[e][1] - ys[e][0]) * t), H1 = F.h1;
    const off = (k, d) => [P[k][0] + N[k][0] * d, P[k][1] + N[k][1] * d];
    for (let k = 0; k + 1 < P.length; k++) {
      const a = P[k], b = P[k + 1], ya = Y[k], yb = Y[k + 1];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-3) continue;
      const ab = off(k, T), bb = off(k + 1, T);
      const gbA = Math.min(ya, g(ab[0], ab[1])) - 0.3, gbB = Math.min(yb, g(bb[0], bb[1])) - 0.3;
      cquad([a[0], ya - 0.1, a[1]], [b[0], yb - 0.1, b[1]], [b[0], yb + H1, b[1]], [a[0], ya + H1, a[1]]);
      cquad([ab[0], gbA, ab[1]], [bb[0], gbB, bb[1]], [bb[0], yb + H1, bb[1]], [ab[0], ya + H1, ab[1]]);
      cnt.yard++;
    }
    for (const k of [0, P.length - 1]) {
      if (cut && cut[k ? 1 : 0]) continue;
      const a = P[k], b = off(k, T), y = Y[k], gb = Math.min(y, g(b[0], b[1])) - 0.3;
      cquad([a[0], y - 0.1, a[1]], [b[0], gb, b[1]], [b[0], y + H1, b[1]], [a[0], y + H1, a[1]]);
    }
  }
  // сводка раскладки и постройки (ms — раскладка + постройка)
  geo.tris = nq * 2; geo.hedgeKm = Math.round(geo.hedgeKm * 10) / 10;
  rk.fenceStats = { ...C.fenceStats, geo, ms: C.fenceStats.ms + Math.round(performance.now() - t0) };
}
