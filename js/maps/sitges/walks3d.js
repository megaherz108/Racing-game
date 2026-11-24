// Ситжес — ПОСТРОЙКА: тротуары по раскладке (C.walks — js/maps/sitges/walks.js; C.corners — corners.js).
//   Полосы — плитка «панот» на бордюре с гранитной кромкой; верх от уровня дороги у бордюра, к фасаду — вслед
//     за рельефом, не круче 15 %; бордюр, наружная стенка (где нет фасада вплотную), торцы на обрезке.
//   Скруглённые углы — асфальт веером до дуги, тротуар полосой между дугами r и r − w или до острого угла, концы —
//     точно сечения полос.
//   Верх и бордюр — сетка столкновений Rapier (набор K.rk: cquad), верх — поиск тротуаров (addWalk → world.walkAt).
//   Наружная кромка (полосы и углы) — в K.rk.edges: { A, B, ya, yb, n, st, deck } — отрезок [x, z], высота верха
//     тротуара на концах, нормаль к кварталу; концы A, B — те же массивы, что в раскладке (O0 / O1 полос, Ou колец
//     C.cornerWalks): по ним fences3d.js находит высоту для отрезков C.fenceLine.
// Определяет: SITGES_DROP, sitgesBuildWalks.
// Использует: MAT, clamp (js/core.js); sitgesCells, sitgesSeg, SITGES_SEG (js/maps/sitges/geom.js); SITGES_R
//   (js/maps/sitges/roads.js); SITGES_RB (js/maps/sitges/roads3d.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

// съезд у ворот (4а.5): бордюр на ширине ворот — dropTo м над дорогой, скосы по skew м с боков; пандус — полоса
// ramp м у бордюра (на узком тротуаре — не шире rampMax его ширины)
const SITGES_DROP = { dropTo: 0.03, skew: 0.6, ramp: 0.6, rampMax: 0.6 };

function sitgesBuildWalks(K) {
  const { D, group, grid, decks, rk } = K, C = D.C, P = SITGES_RB, R = SITGES_R, g = D.ground;
  const { MAT, surfOf, buckets, quad, gn, UP, wallQuad, cmesh, cquad, walks, addWalk, offs, parapet, cnt, blocks } = rk;
  const edges = rk.edges = [];
  /* ---------- съезды у ворот (4а.5): опущенный бордюр и пандус ---------- */
  // Ворота kind 'car' (C.gates — js/maps/sitges/gates.js) на кромке полос: на ширине ворот бордюр низкий (dropTo),
  // по skew м с боков — скос к обычному; полоса ramp м у бордюра — пандус к обычному верху. Положение вдоль — s, м по
  // касательной ворот от их середины: у соседних полос в общей точке s одно, стык ровный. Ворота, чей съезд не лежит
  // целиком на полосах (угол, край проезжей части без тротуара, настил), — без съезда.
  const DR = SITGES_DROP, dep = P.curb - DR.dropTo, drops = new Map();
  const dst = rk.dropStats = { gates: 0, ramps: 0, noWalk: 0, partial: 0 };   // без съезда: нет полосы; полосы не целиком (угол)
  {
    const cells = sitgesCells(16);
    for (const W of C.walks) {
      const { O0, O1 } = W;
      if (!W.st.v[W.i].deck) cells.add(Math.min(O0[0], O1[0]), Math.max(O0[0], O1[0]), Math.min(O0[1], O1[1]), Math.max(O0[1], O1[1]), W);
    }
    for (const G of C.gates || []) {
      if (G.kind !== 'car') continue;
      dst.gates++;
      const a = G.w / 2, b = a + DR.skew, n = G.n, T = [-n[1], n[0]], hit = [];
      let cover = 0;
      cells.each(G.x - b - 1, G.x + b + 1, G.z - b - 1, G.z + b + 1, l => {
        for (const W of l) {
          if (hit.some(h => h.W === W)) continue;
          const v0 = W.st.v[W.i], sg = W.side ? -1 : 1;
          if (-sg * v0.tz * n[0] + sg * v0.tx * n[1] < 0.9) continue;   // нормаль к кварталу — как у ворот
          const s0 = (W.O0[0] - G.x) * T[0] + (W.O0[1] - G.z) * T[1], s1 = (W.O1[0] - G.x) * T[0] + (W.O1[1] - G.z) * T[1];
          const lo = Math.max(-b, Math.min(s0, s1)), hi = Math.min(b, Math.max(s0, s1)), ov = hi - lo;
          if (ov <= 0.01 || Math.abs(s1 - s0) <= 0.01) continue;
          // кромка полосы на участке съезда — на линии ворот (± 0,3 м)
          const d0 = (W.O0[0] - G.x) * n[0] + (W.O0[1] - G.z) * n[1], d1 = (W.O1[0] - G.x) * n[0] + (W.O1[1] - G.z) * n[1];
          const dAt = s => d0 + (d1 - d0) * (s - s0) / (s1 - s0);
          if (Math.abs(dAt(lo)) > 0.3 || Math.abs(dAt(hi)) > 0.3) continue;
          hit.push({ W, s0, s1, a, b }); cover += ov;
        }
      });
      if (cover < 2 * b - 0.05) { dst[cover > 0 ? 'partial' : 'noWalk']++; continue; }
      dst.ramps++;
      for (const h of hit) { let l = drops.get(h.W); if (!l) drops.set(h.W, l = []); l.push(h); }
    }
  }
  // глубина опускания бордюра в точке t (0…1 вдоль полосы) и изломы профиля вдоль полосы
  const sinkAt = (L, t) => {
    let d = 0;
    for (const { s0, s1, a, b } of L) {
      const s = Math.abs(s0 + (s1 - s0) * t);
      d = Math.max(d, s <= a ? 1 : s >= b ? 0 : (b - s) / (b - a));
    }
    return d * dep;
  };
  const sinkBreaks = L => {
    const ts = [0, 1];
    for (const { s0, s1, a, b } of L) for (const s of [-b, -a, a, b]) { const t = (s - s0) / (s1 - s0); if (t > 1e-4 && t < 1 - 1e-4) ts.push(t); }
    return ts.sort((x, z) => x - z).filter((t, k, A) => !k || t - A[k - 1] > 1e-4);
  };

  /* ---------- тротуары: полосы по C.walks (обрезка — в раскладке, js/maps/sitges/walks.js), на бордюре ---------- */
  const lift = P.lift.drive;
  for (const W of C.walks) {
    const { st, side, i, I0, I1, O0, O1, cutStart, cutEnd } = W, v = st.v, a = v[i], b = v[i + 1], sg = side ? -1 : 1;
    // гранитная кромка у бордюра и плитка за ней
    const wI = (a.sw[side] + b.sw[side]) / 2, fe = Math.min(1, P.edge / Math.max(0.2, wI));
    const lerp2 = (p, r, f) => [p[0] + (r[0] - p[0]) * f, p[1] + (r[1] - p[1]) * f];
    const E0 = lerp2(I0, O0, fe), E1 = lerp2(I1, O1, fe);
    // верх: от уровня дороги у бордюра; к фасаду поднимается вслед за рельефом, но не круче 15 %
    const q = a.deck ? a : null, yq = p => q ? q.y + lift : g(p[0], p[1]) + lift;
    const y = p => yq(p);
    const yI0 = yq(I0), yI1 = yq(I1), wd = Math.max(0.5, (a.sw[side] + b.sw[side]) / 2);
    const yO = (O, yi) => q ? yi : clamp(g(O[0], O[1]) + lift, yi, yi + 0.15 * wd);
    const yO0 = yO(O0, yI0), yO1 = yO(O1, yI1);
    const top = p => (p === I0 ? yI0 : p === I1 ? yI1 : p === O0 ? yO0 : p === O1 ? yO1 : p === E0 ? yI0 + (yO0 - yI0) * fe : yI1 + (yO1 - yI1) * fe) + P.curb;
    const nn = a.deck ? UP : gn(a.x, a.z);
    const v3 = (p, yy) => [p[0], yy, p[1]];
    const [nx, nz] = [sg * a.tz, -sg * a.tx];
    const L = drops.get(W);
    if (L) {
      // съезд у ворот: полоса кусками вдоль (изломы профиля) и поперёк (кромка, край пандуса); верх, бордюр, торцы
      // и столкновения — по тем же точкам
      const wR = Math.max(0.2, wI), uR = Math.min(DR.ramp, DR.rampMax * wR) / wR;
      const us = [0, fe, uR, 1].sort((x, z) => x - z).filter((u, k, A) => !k || u - A[k - 1] > 1e-4);
      const ts = sinkBreaks(L), sk = ts.map(t => sinkAt(L, t));
      const pt = (t, u) => lerp2(lerp2(I0, I1, t), lerp2(O0, O1, t), u);
      const ht = (k, u) => {
        const t = ts[k], yi = yI0 + (yI1 - yI0) * t, yo = yO0 + (yO1 - yO0) * t;
        return yi + (yo - yi) * u + P.curb - sk[k] * Math.max(0, 1 - u / uR);
      };
      for (let k = 0; k + 1 < ts.length; k++) {
        const t0 = ts[k], t1 = ts[k + 1];
        for (let j = 0; j + 1 < us.length; j++) {
          const u0 = us[j], u1 = us[j + 1];
          const A0 = v3(pt(t0, u0), ht(k, u0)), B0 = v3(pt(t1, u0), ht(k + 1, u0)), B1 = v3(pt(t1, u1), ht(k + 1, u1)), A1 = v3(pt(t0, u1), ht(k, u1));
          quad('panot', [A0, B0, B1, A1], nn, u1 <= fe + 1e-4 ? 0xdedad2 : 0xffffff);
          cquad(A0, B0, B1, A1);
        }
        const Ia = pt(t0, 0), Ib = pt(t1, 0), ya = y(Ia), yb = y(Ib);
        wallQuad('panot', Ia[0], Ia[1], ya - 0.02, ht(k, 0), Ib[0], Ib[1], yb - 0.02, ht(k + 1, 0), nx, nz, 0xd6d2ca);
        cquad(v3(Ia, ya - 0.1), v3(Ib, yb - 0.1), v3(Ib, ht(k + 1, 0)), v3(Ia, ht(k, 0)));
        // поиск тротуаров: пандус и остальное, с высотами углов
        const Ra = pt(t0, uR), Rb = pt(t1, uR), Oa = pt(t0, 1), Ob = pt(t1, 1);
        addWalk([Ia, Ib, Rb, Ra], ht(k, 0), [ht(k, 0), ht(k + 1, 0), ht(k + 1, uR), ht(k, uR)]);
        if (uR < 1 - 1e-4) addWalk([Ra, Rb, Ob, Oa], ht(k, uR), [ht(k, uR), ht(k + 1, uR), ht(k + 1, 1), ht(k, 1)]);
      }
      const cap = (k, t, s) => {
        for (let j = 0; j + 1 < us.length; j++) {
          const p0 = pt(t, us[j]), p1 = pt(t, us[j + 1]);
          wallQuad('panot', p0[0], p0[1], y(p0) - 0.02, ht(k, us[j]), p1[0], p1[1], y(p1) - 0.02, ht(k, us[j + 1]), s * a.tx, s * a.tz, 0xd6d2ca);
          cquad(v3(p0, y(p0) - 0.1), v3(p1, y(p1) - 0.1), v3(p1, ht(k, us[j + 1])), v3(p0, ht(k, us[j])));
        }
      };
      if (cutStart) cap(0, 0, -1);
      if (cutEnd) cap(ts.length - 1, 1, 1);
      if (!(a.fac && a.fac[side] < a.hw + a.sw[side] + 0.6)) wallQuad('panot', O0[0], O0[1], y(O0) - 0.3, top(O0), O1[0], O1[1], y(O1) - 0.3, top(O1), -nx, -nz, 0xb8b4ac);
      edges.push({ A: O0, B: O1, ya: top(O0), yb: top(O1), n: [-nx, -nz], st, deck: !!a.deck });
      cnt.walk++;
      continue;
    }
    quad('panot', [v3(I0, top(I0)), v3(I1, top(I1)), v3(E1, top(E1)), v3(E0, top(E0))], nn, 0xdedad2);
    quad('panot', [v3(E0, top(E0)), v3(E1, top(E1)), v3(O1, top(O1)), v3(O0, top(O0))], nn, 0xffffff);
    // бордюр (лицом к дороге)
    wallQuad('panot', I0[0], I0[1], y(I0) - 0.02, top(I0), I1[0], I1[1], y(I1) - 0.02, top(I1), nx, nz, 0xd6d2ca);
    // наружный край — где за тротуаром нет фасада вплотную
    if (!(a.fac && a.fac[side] < a.hw + a.sw[side] + 0.6)) wallQuad('panot', O0[0], O0[1], y(O0) - 0.3, top(O0), O1[0], O1[1], y(O1) - 0.3, top(O1), -nx, -nz, 0xb8b4ac);
    // торцы на обрезке
    if (cutStart) wallQuad('panot', I0[0], I0[1], y(I0) - 0.02, top(I0), O0[0], O0[1], y(O0) - 0.02, top(O0), -a.tx, -a.tz, 0xd6d2ca);
    if (cutEnd) wallQuad('panot', I1[0], I1[1], y(I1) - 0.02, top(I1), O1[0], O1[1], y(O1) - 0.02, top(O1), a.tx, a.tz, 0xd6d2ca);
    // столкновения: верх и бордюр
    const c3 = (p, yy) => [p[0], yy, p[1]];
    cquad(c3(I0, top(I0)), c3(I1, top(I1)), c3(O1, top(O1)), c3(O0, top(O0)));
    cquad(c3(I0, y(I0) - 0.1), c3(I1, y(I1) - 0.1), c3(I1, top(I1)), c3(I0, top(I0)));
    if (cutStart) cquad(c3(I0, y(I0) - 0.1), c3(O0, y(O0) - 0.1), c3(O0, top(O0)), c3(I0, top(I0)));
    if (cutEnd) cquad(c3(I1, y(I1) - 0.1), c3(O1, y(O1) - 0.1), c3(O1, top(O1)), c3(I1, top(I1)));
    addWalk([I0, I1, O1, O0], top(I0));
    edges.push({ A: O0, B: O1, ya: top(O0), yb: top(O1), n: [-nx, -nz], st, deck: !!a.deck });
    cnt.walk++;
  }

  /* ---------- скруглённые углы: асфальт до дуги, тротуар полосой между дугами r и r − w ---------- */
  C.corners.forEach((c, ci) => {
    const [mat, tint] = surfOf(c.a.st), lift = mat === 'asphalt' ? P.lift.drive : P.lift.paved, lw = P.lift.drive;
    // точки колец (бордюр, наружный край), концы и вершина острого угла — из раскладки (js/maps/sitges/walks.js)
    const { N, EA, EB, Q, ring: RG } = C.cornerWalks[ci];
    // асфальт угла заходит внутрь проезжих частей (лента улицы у узла не точно по бордюрной линии): на 0,4 м, а если
    // K лежит дальше от края проезжей части рукава (рукав у узла изгибается — Montornés Pino × Av. de Sofia у (191, 472),
    // 0,85 м), — на эту щель с запасом, иначе между лентами и асфальтом угла видна земля
    const gapTo = X => {
      const v = X.st.v; let d = Infinity;
      for (let i = Math.max(0, X.i - 3); i < Math.min(v.length - 1, X.i + 4); i++) {
        const a = v[i], b = v[i + 1], s = sitgesSeg(c.K[0], c.K[1], a.x, a.z, b.x, b.z);
        d = Math.min(d, s - (a.hw + (b.hw - a.hw) * SITGES_SEG.t));
      }
      return d;
    };
    const m = clamp(Math.max(gapTo(c.a), gapTo(c.b)) + 0.5, 0.4, 2.5), Kx =[c.K[0] - (c.a.n[0] + c.b.n[0]) * m, c.K[1] - (c.a.n[1] + c.b.n[1]) * m];
    const yK = g(Kx[0], Kx[1]) + lift, nn = gn(c.K[0], c.K[1]);
    const v3a = p => [p[0], g(p[0], p[1]) + lift, p[1]];
    const TA_ = X => [X.T[0] - X.n[0] * m, X.T[1] - X.n[1] * m];
    const dA = Math.hypot(EA.O[0] - EA.I[0], EA.O[1] - EA.I[1]), dB = Math.hypot(EB.O[0] - EB.I[0], EB.O[1] - EB.I[1]);
    quad(mat, [v3a(Kx), v3a(TA_(c.a)), v3a(EA.I), v3a(Kx)], nn, tint);
    quad(mat, [v3a(Kx), v3a(EB.I), v3a(TA_(c.b)), v3a(Kx)], nn, tint);
    const ring = k => {
      const { f, e, w, I, Ou } = RG[k];
      // гранитная кромка — как у полос (P.edge от ширины тротуара), у острого угла шире пропорционально
      const dist = Math.hypot(Ou[0] - I[0], Ou[1] - I[1]), dEnd = dA + (dB - dA) * f;
      const fe = Math.min(1, P.edge / Math.max(0.2, w * dist / Math.max(1e-3, dEnd)));
      const E = [I[0] + (Ou[0] - I[0]) * fe, I[1] + (Ou[1] - I[1]) * fe];
      const yI = g(I[0], I[1]) + lw, yO = clamp(g(Ou[0], Ou[1]) + lw, yI, yI + 0.15 * Math.max(0.5, w));
      return { e, w, I, Ou, E, yI, yO, yE: yI + (yO - yI) * fe };
    };
    const v3 = (p, y) => [p[0], y, p[1]], T = P.curb;
    let A = ring(0);
    for (let k = 1; k <= N; k++) {
      const B = ring(k), em = [(A.e[0] + B.e[0]) / 2, (A.e[1] + B.e[1]) / 2];
      // асфальт: веер из K, поперёк — через ≤ 2,5 м по рельефу (крупный треугольник уходит под рельеф)
      const M = Math.max(1, Math.ceil(Math.max(Math.hypot(A.I[0] - Kx[0], A.I[1] - Kx[1]), Math.hypot(B.I[0] - Kx[0], B.I[1] - Kx[1])) / 2.5));
      const fan = (P2, f) => { const x = Kx[0] + (P2[0] - Kx[0]) * f, z = Kx[1] + (P2[1] - Kx[1]) * f; return [x, f ? g(x, z) + lift : yK, z]; };
      for (let j = 0; j < M; j++) {
        const f0 = j / M, f1 = (j + 1) / M;
        quad(mat, j ? [fan(A.I, f0), fan(A.I, f1), fan(B.I, f1), fan(B.I, f0)] : [fan(A.I, 0), fan(A.I, f1), fan(B.I, f1), fan(A.I, 0)], nn, tint);
      }
      // нет тротуара на обоих концах куска — только асфальт (без бордюра)
      if (A.w < 0.05 && B.w < 0.05) { A = B; continue; }
      // верх: гранитная кромка у бордюра и плитка
      quad('panot', [v3(A.I, A.yI + T), v3(B.I, B.yI + T), v3(B.E, B.yE + T), v3(A.E, A.yE + T)], nn, 0xdedad2);
      quad('panot', [v3(A.E, A.yE + T), v3(B.E, B.yE + T), v3(B.Ou, B.yO + T), v3(A.Ou, A.yO + T)], nn, 0xffffff);
      // бордюр по дуге — лицом к дороге (от центра); наружный край — к кварталу
      wallQuad('panot', A.I[0], A.I[1], A.yI - 0.02, A.yI + T, B.I[0], B.I[1], B.yI - 0.02, B.yI + T, em[0], em[1], 0xd6d2ca);
      if (Q || c.r - Math.max(c.a.w, c.b.w) > 0.3) wallQuad('panot', A.Ou[0], A.Ou[1], A.yO - 0.3, A.yO + T, B.Ou[0], B.Ou[1], B.yO - 0.3, B.yO + T, -em[0], -em[1], 0xb8b4ac);
      // столкновения: верх и бордюр
      cquad(v3(A.I, A.yI + T), v3(B.I, B.yI + T), v3(B.Ou, B.yO + T), v3(A.Ou, A.yO + T));
      cquad(v3(A.I, A.yI - 0.1), v3(B.I, B.yI - 0.1), v3(B.I, B.yI + T), v3(A.I, A.yI + T));
      addWalk([A.I, B.I, B.Ou, A.Ou], A.yI + T);
      edges.push({ A: A.Ou, B: B.Ou, ya: A.yO + T, yb: B.yO + T, n: [-em[0], -em[1]], st: c.a.st, deck: false });
      A = B;
    }
    cnt.corner++;
  });
}
