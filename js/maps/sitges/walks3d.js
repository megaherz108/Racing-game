// Ситжес — ПОСТРОЙКА: тротуары по раскладке (C.walks — js/maps/sitges/walks.js; C.corners — corners.js).
//   Полосы — плитка «панот» на бордюре с гранитной кромкой; верх от уровня дороги у бордюра, к фасаду — вслед
//     за рельефом, не круче 15 %; бордюр, наружная стенка (где нет фасада вплотную), торцы на обрезке.
//   Скруглённые углы — асфальт веером до дуги, тротуар полосой между дугами r и r − w или до острого угла, концы —
//     точно сечения полос.
//   Верх и бордюр — сетка столкновений Rapier (набор K.rk: cquad), верх — поиск тротуаров (addWalk → world.walkAt).
//   Наружная кромка (полосы и углы) — в K.rk.edges: { A, B, ya, yb, n, st, deck } — отрезок [x, z], высота верха
//     тротуара на концах, нормаль к кварталу; по ней ставит заборы fences3d.js.
// Определяет: sitgesBuildWalks.
// Использует: MAT, clamp (js/core.js); SITGES_R (js/maps/sitges/roads.js); SITGES_RB (js/maps/sitges/roads3d.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

function sitgesBuildWalks(K) {
  const { D, group, grid, decks, rk } = K, C = D.C, P = SITGES_RB, R = SITGES_R, g = D.ground;
  const { MAT, surfOf, buckets, quad, gn, UP, wallQuad, cmesh, cquad, walks, addWalk, offs, parapet, cnt, blocks } = rk;
  const edges = rk.edges = [];
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
    quad('panot', [v3(I0, top(I0)), v3(I1, top(I1)), v3(E1, top(E1)), v3(E0, top(E0))], nn, 0xdedad2);
    quad('panot', [v3(E0, top(E0)), v3(E1, top(E1)), v3(O1, top(O1)), v3(O0, top(O0))], nn, 0xffffff);
    // бордюр (лицом к дороге)
    const [nx, nz] = [sg * a.tz, -sg * a.tx];
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
  for (const c of C.corners) {
    const [mat, tint] = surfOf(c.a.st), lift = mat === 'asphalt' ? P.lift.drive : P.lift.paved, lw = P.lift.drive;
    const N = Math.max(3, Math.ceil(Math.abs(c.da) * c.r / 0.8));
    // асфальт угла заходит на 0,4 м внутрь проезжих частей (лента улицы у узла не точно по бордюрной линии)
    const m = 0.4, Kx = [c.K[0] - (c.a.n[0] + c.b.n[0]) * m, c.K[1] - (c.a.n[1] + c.b.n[1]) * m];
    const yK = g(Kx[0], Kx[1]) + lift, nn = gn(c.K[0], c.K[1]);
    const v3a = p => [p[0], g(p[0], p[1]) + lift, p[1]];
    // концы углового куска — точно сечения прямых полос тротуара при s касания (как edge() у полос): дуга
    // подправляется сдвигом, плавно меняющимся от одного конца к другому
    const endOf = X => {
      const v = X.st.v, sg = X.side ? -1 : 1;
      let i = 0; while (i < v.length - 2 && v[i + 1].s < X.s) i++;
      const a = v[i], b = v[i + 1], t = clamp((X.s - a.s) / Math.max(1e-6, b.s - a.s), 0, 1);
      const L2 = (p, q) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
      // наружный край — по ширине угла X.w (у полосы там та же ширина; рукав без полосы за касанием — 0)
      return { I: L2(offs(a, sg * (a.hw + 0.05)), offs(b, sg * (b.hw + 0.05))), O: L2(offs(a, sg * (a.hw + X.w)), offs(b, sg * (b.hw + X.w))) };
    };
    const EA = endOf(c.a), EB = endOf(c.b);
    const arcAt = (k, rr) => { const an = c.a0 + c.da * k / N; return [c.O[0] + Math.cos(an) * rr, c.O[1] + Math.sin(an) * rr]; };
    const sub = (p, q) => [p[0] - q[0], p[1] - q[1]];
    const dIa = sub(EA.I, arcAt(0, c.r)), dIb = sub(EB.I, arcAt(N, c.r));
    const dOa = sub(EA.O, arcAt(0, Math.max(0, c.r - c.a.w))), dOb = sub(EB.O, arcAt(N, Math.max(0, c.r - c.b.w)));
    // острый наружный угол: пересечение наружных краёв полос (по направлениям рукавов), вершина Q — на своём кольце
    let Q = null, kq = 0;
    if (c.sharp) {
      const den = c.a.u[0] * c.b.u[1] - c.a.u[1] * c.b.u[0];
      Q = c.sharp;
      if (Math.abs(den) > 1e-6) {
        const t = ((EB.O[0] - EA.O[0]) * c.b.u[1] - (EB.O[1] - EA.O[1]) * c.b.u[0]) / den, q = [EA.O[0] + c.a.u[0] * t, EA.O[1] + c.a.u[1] * t];
        if (Math.hypot(q[0] - c.sharp[0], q[1] - c.sharp[1]) < 1.5) Q = q;
      }
      const L1 = Math.hypot(Q[0] - EA.O[0], Q[1] - EA.O[1]), L2 = Math.hypot(EB.O[0] - Q[0], EB.O[1] - Q[1]);
      kq = clamp(Math.round(N * L1 / Math.max(1e-6, L1 + L2)), 1, N - 1);
    }
    const TA_ = X => [X.T[0] - X.n[0] * m, X.T[1] - X.n[1] * m];
    const dA = Math.hypot(EA.O[0] - EA.I[0], EA.O[1] - EA.I[1]), dB = Math.hypot(EB.O[0] - EB.I[0], EB.O[1] - EB.I[1]);
    quad(mat, [v3a(Kx), v3a(TA_(c.a)), v3a(EA.I), v3a(Kx)], nn, tint);
    quad(mat, [v3a(Kx), v3a(EB.I), v3a(TA_(c.b)), v3a(Kx)], nn, tint);
    const ring = k => {
      const f = k / N, an = c.a0 + c.da * f, e = [Math.cos(an), Math.sin(an)], w = c.a.w + (c.b.w - c.a.w) * f;
      const ai = arcAt(k, c.r), I = [ai[0] + dIa[0] + (dIb[0] - dIa[0]) * f, ai[1] + dIa[1] + (dIb[1] - dIa[1]) * f];
      let Ou;
      if (Q) Ou = k <= kq ? [EA.O[0] + (Q[0] - EA.O[0]) * k / kq, EA.O[1] + (Q[1] - EA.O[1]) * k / kq]
        : [Q[0] + (EB.O[0] - Q[0]) * (k - kq) / (N - kq), Q[1] + (EB.O[1] - Q[1]) * (k - kq) / (N - kq)];
      else { const ao = arcAt(k, Math.max(0, c.r - w)); Ou = [ao[0] + dOa[0] + (dOb[0] - dOa[0]) * f, ao[1] + dOa[1] + (dOb[1] - dOa[1]) * f]; }
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
  }
}
