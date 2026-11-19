// Ситжес — РАСКЛАДКА: скруглённые углы перекрёстков (после уровней, js/maps/sitges/levels.js).
//   Узел — исходная вершина OSM, где сходятся ≥ 3 рукавов (проезжие и пешеходные улицы; проходящая улица — два
//   рукава) или 2 рукава разных улиц (стык под углом); конец улицы на середине отрезка другой — тоже узел (точка
//   вставляется). У пары соседних рукавов — бордюрные линии, их пересечение K, дуга радиуса r по классу (касания TA,
//   TB, центр O в квартале). Тротуар угла — полоса между дугами r и r − w или до острого угла sharp (дом в углу,
//   тротуар шире r); асфальт — от K до дуги (sitgesInFillet). Пропуски с причинами — C.cornerLog, сводка — C.cornerStats.
// C.corners: { K, O, r, d, a0, da, th, sharp, bb, a, b }; a / b — рукава { st, i, dir, side, u, n, w, wz, T, s }.
// C.cornersAt(x, z) — углы клетки 16 м с точкой.
// Определяет: sitgesPlanCorners, sitgesInFillet.
// Использует: clamp (js/core.js); sitgesSeg, SITGES_SEG, sitgesCells, sitgesInPoly (js/maps/sitges/geom.js);
//   SITGES_R, sitgesRoadPt (js/maps/sitges/roads.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

function sitgesPlanCorners(C) {
  const { streets, partCells } = C, P = SITGES_R, pt = sitgesRoadPt;
  /* ---------- скруглённые углы перекрёстков ---------- */
  // Узел — исходная вершина OSM, где сходятся ≥ 3 рукавов (проезжие и пешеходные улицы; проходящая улица — два
  // рукава) или 2 рукава разных улиц (стык под углом); конец улицы на середине отрезка другой — тоже узел (точка
  // вставляется). Рукава — по углу; у пары соседних — бордюрные линии (ось, сдвинутая на hw к углу), их пересечение
  // K (острый угол), дуга радиуса r, касающаяся обеих в TA и TB (центр O — внутри квартала). Тротуар угла — полоса
  // между дугами r и r − w (w — ширина тротуаров рукавов, от одного к другому, не больше r; нет тротуара — 0, тогда
  // только асфальт); асфальт — от K до дуги. r — по классу, меньше на острых углах (касание не дальше доли рукава
  // до соседнего узла), не меньше rMin; если дуга заходит в дом — r меньше, а у самого дома — угол острый.
  // Пропуск: узлы на мостах и путепроводах, круговое движение, пешеходные улицы, углы шире maxAng (прямая сторона
  // Т-перекрёстка) и уже minAng.
  const CR = P.corner, corners = [];
  {
    const arms = streets.filter(st => (st.drive || st.cls === 'pedestrian') && !st.flat);
    // Конец улицы на середине отрезка другой улицы без общей вершины (упрощение ломаных в конвейере убирает вершины
    // на прямой) — в ту улицу вставляется точка-узел. По положению до сдвига оси.
    // сетка отрезков рукавов по положению до сдвига оси (заново после вставки узлов)
    let segs = null;
    // точка на проезжей части улицы, кроме A и B (по текущему положению оси)
    const onOther = (x, z, A, B) => segs.at(x, z).some(([o, i]) => {
      if (o === A || o === B || !o.drive) return false;
      const a = o.v[i], b = o.v[i + 1]; if (!b) return false;
      return sitgesSeg(x, z, a.x, a.z, b.x, b.z) < a.hw + (b.hw - a.hw) * SITGES_SEG.t;
    });
    // точка на пешеходной улице (по положению до сдвига)
    const onPed = (x, z) => segs.at(x, z).some(([o, i]) => {
      if (o.cls !== 'pedestrian') return false;
      const a = o.v[i], b = o.v[i + 1]; if (!b) return false;
      return sitgesSeg(x, z, a.ox, a.oz, b.ox, b.oz) < a.hw;
    });
    const fillSegs = () => {
      segs = sitgesCells(16);
      for (const st of arms) st.v.forEach((a, i) => {
        if (i === st.v.length - 1) return;
        const b = st.v[i + 1], m = 3 + Math.max(a.hw, b.hw);
        segs.add(Math.min(a.ox, b.ox) - m, Math.max(a.ox, b.ox) + m, Math.min(a.oz, b.oz) - m, Math.max(a.oz, b.oz) + m, [st, i]);
      });
    };
    {
      fillSegs();
      const ins = new Map();
      for (const st of arms) for (const ei of [0, st.v.length - 1]) {
        // ближайший отрезок — на каждой улице свой (в узле могут сходиться концы нескольких улиц, и все они лежат
        // на проходящей)
        const E = st.v[ei], best = new Map();
        for (const [o, i] of segs.at(E.ox, E.oz)) {
          if (o === st && (i === ei || i === ei - 1)) continue;
          const a = o.v[i], b = o.v[i + 1], dx = b.ox - a.ox, dz = b.oz - a.oz, LL = dx * dx + dz * dz || 1;
          const t = clamp(((E.ox - a.ox) * dx + (E.oz - a.oz) * dz) / LL, 0, 1), d = Math.hypot(E.ox - a.ox - dx * t, E.oz - a.oz - dz * t);
          if (d < CR.snap && (!best.has(o) || d < best.get(o).d)) best.set(o, { i, t, d, L: Math.sqrt(LL) });
        }
        for (const [o, { i, t, L }] of best) {
          if (o.v.some(q => q.nd && q.k === E.k)) continue;                    // уже общая вершина
          if (t * L < 0.3 || (1 - t) * L < 0.3) { const q = o.v[t * L < 0.3 ? i : i + 1]; if (!q.nd) { q.k = E.k; q.nd = true; } continue; }
          if (!ins.has(o)) ins.set(o, []);
          if (!ins.get(o).some(e => e.k === E.k)) ins.get(o).push({ i, t, k: E.k });
        }
      }
      const lerp = (a, b, t) => a + (b - a) * t;
      let nIns = 0;
      for (const [o, list] of ins) {
        list.sort((p, q) => q.i - p.i || q.t - p.t);
        for (const { i, t, k } of list) {
          const a = o.v[i], b = o.v[i + 1], q = pt(lerp(a.x, b.x, t), lerp(a.z, b.z, t), a.br, a.tn, k, true);
          q.ox = lerp(a.ox, b.ox, t); q.oz = lerp(a.oz, b.oz, t);
          const tx = lerp(a.tx, b.tx, t), tz = lerp(a.tz, b.tz, t), l = Math.hypot(tx, tz) || 1;
          q.tx = tx / l; q.tz = tz / l; q.s = lerp(a.s, b.s, t); q.hw = lerp(a.hw, b.hw, t); q.y = lerp(a.y, b.y, t);
          q.sw = [lerp(a.sw[0], b.sw[0], t), lerp(a.sw[1], b.sw[1], t)]; q.fac = a.fac; q.lot = a.lot; q.deck = a.deck; q.cut = a.cut && b.cut;
          o.v.splice(i + 1, 0, q);
          nIns++;
        }
      }
      C.cornerSnap = nIns;
      fillSegs();
    }
    const nodes = new Map();
    for (const st of arms) {
      // короткая кольцевая улица — круговое движение (свой рисунок, не углы)
      const v = st.v, ring = Math.hypot(v[0].x - v[v.length - 1].x, v[0].z - v[v.length - 1].z) < 0.5;
      if (ring && st.len < CR.ringMin) continue;
      v.forEach((q, i) => {
        if (!q.nd) return;
        if (!nodes.has(q.k)) nodes.set(q.k, []);
        if (i > 0) nodes.get(q.k).push({ st, i, dir: -1 });
        if (i < v.length - 1) nodes.get(q.k).push({ st, i, dir: 1 });
      });
    }
    // узлы каждой улицы по длине дуги — сколько рукаву до соседнего узла
    const junctionS = new Map();
    // узел: ≥ 3 рукавов или 2 рукава разных улиц (стык под углом — скругляется внутренний угол)
    const isNode = list => list.length >= 3 || (list.length === 2 && list[0].st !== list[1].st);
    for (const list of nodes.values()) if (isNode(list)) for (const a of list) {
      if (!junctionS.has(a.st)) junctionS.set(a.st, new Set());
      junctionS.get(a.st).add(a.st.v[a.i].s);
    }
    // точка внутри дома (дуга забора не должна заходить в дом)
    const inHouse = (x, z) => partCells.at(x, z).some(o => x >= o.bb[0] && x <= o.bb[1] && z >= o.bb[2] && z <= o.bb[3] && sitgesInPoly(x, z, o.r));
    const cst = { nodes: 0, pairs: 0, made: 0, skipAng: 0, skipWalk: 0, skipFar: 0, skipHouse: 0, skipBend: 0, shrunk: 0, offStrip: 0, sharp: 0 };
    const LOG = C.cornerLog = [], log = (list, why) => { const q = list[0].st.v[list[0].i]; LOG.push({ x: q.x, z: q.z, why }); };
    for (const list of nodes.values()) {
      if (!isNode(list)) continue;
      const bad = a => { const q = a.st.v[a.i], p = a.st.v[a.i + a.dir]; return q.deck || q.cut || q.br || q.tn || p.br || p.tn || p.deck || p.cut; };
      if (list.some(bad)) { log(list, 'мост'); continue; }
      cst.nodes++;
      // рукав: точка q не ближе CR.look м от узла (бордюрная линия идёт через её бордюр), направление — от q к точке
      // ещё на CR.look дальше (у узла ось изгибается: сдвиг к середине между границами); сколько до соседнего узла
      for (const a of list) {
        const v = a.st.v, q0 = v[a.i], far = (from, L) => {
          let j = from;
          while (j > 0 && j < v.length - 1 && Math.abs(v[j].s - v[from].s) < L) j += a.dir;
          return j;
        };
        const j = far(a.i + a.dir, CR.look - Math.abs(v[a.i + a.dir].s - q0.s)), j2 = far(j, CR.look);
        const p0 = j2 !== j && Math.abs(v[j2].s - v[j].s) > 2 ? v[j] : q0, p1 = j2 !== j && Math.abs(v[j2].s - v[j].s) > 2 ? v[j2] : v[j];
        const dx = p1.x - p0.x, dz = p1.z - p0.z, l = Math.hypot(dx, dz) || 1;
        a.u = [dx / l, dz / l]; a.ang = Math.atan2(dz, dx); a.q = v[j];
        let avail = a.dir > 0 ? a.st.len - q0.s : q0.s;
        for (const s of junctionS.get(a.st) || []) if (s !== q0.s && (s - q0.s) * a.dir > 0) avail = Math.min(avail, Math.abs(s - q0.s));
        a.avail = avail;
      }
      list.sort((p, q) => p.ang - q.ang);
      for (let n = 0; n < list.length; n++) {
        const A = list[n], B = list[(n + 1) % list.length];
        let th = B.ang - A.ang; if (th <= 0) th += Math.PI * 2;
        cst.pairs++;
        if (th > CR.maxAng || th < CR.minAng) { cst.skipAng++; log([A], th > CR.maxAng ? 'прямо' : 'острый'); continue; }
        // стороны: у A — левая по ходу от узла (к B), у B — правая (к A); в индексах улицы — 0 / 1
        const sA = A.dir > 0 ? 0 : 1, sB = B.dir > 0 ? 1 : 0;
        let uA = A.u, uB = B.u, nA = [-uA[1], uA[0]], nB = [uB[1], -uB[0]];
        // пешеходная улица (без бордюров) — угол не скругляется; тротуара на этой стороне нет — w = 0 (только асфальт)
        if (A.st.cls === 'pedestrian' || B.st.cls === 'pedestrian') { cst.skipWalk++; log([A], 'пешеходная'); continue; }
        // оба рукава — одна улица (внутренняя сторона её изгиба, третья улица примыкает с другой стороны) — не угол
        if (A.st === B.st) { cst.skipAng++; log([A], 'изгиб улицы'); continue; }
        // ширина тротуара рукава — медиана по точкам за look м от узла (ближе к узлу луч до забора уходит в проём
        // другой улицы и тротуар выходит шире); той же шириной потом выравнивается полоса до касания — стык ровный
        const wRef = (X, sd) => {
          const v = X.st.v, s0 = v[X.i].s, lim = Math.min(CR.look + 12, X.avail - CR.look), list = [];
          for (let j = X.i + X.dir; j >= 0 && j < v.length; j += X.dir) {
            const dd = Math.abs(v[j].s - s0);
            if (dd > lim) break;
            if (dd >= CR.look) list.push(v[j].sw[sd]);
          }
          if (!list.length) return X.q.sw[sd];
          list.sort((p, q) => p - q);
          return list[list.length >> 1];
        };
        let wA = wRef(A, sA), wB = wRef(B, sB);
        // бордюрные линии (точка pX и направление uX от узла) и их пересечение K
        let pA = [A.q.x + nA[0] * A.q.hw, A.q.z + nA[1] * A.q.hw], pB = [B.q.x + nB[0] * B.q.hw, B.q.z + nB[1] * B.q.hw];
        const J = A.st.v[A.i];
        let den, K, tan, kA, kB, thR = th;
        const cross = () => {
          den = uA[0] * uB[1] - uA[1] * uB[0];
          if (Math.abs(den) < 1e-6) return false;
          const t = ((pB[0] - pA[0]) * uB[1] - (pB[1] - pA[1]) * uB[0]) / den;
          K = [pA[0] + uA[0] * t, pA[1] + uA[1] * t];
          tan = Math.tan(thR / 2);
          kA = (K[0] - J.x) * uA[0] + (K[1] - J.z) * uA[1]; kB = (K[0] - J.x) * uB[0] + (K[1] - J.z) * uB[1];
          return Math.hypot(K[0] - J.x, K[1] - J.z) <= CR.far;
        };
        if (!cross()) { cst.skipFar++; log([A], 'K далеко'); continue; }
        // радиус: по классу (больший из двух); касание не дальше dMax от K и не дальше доли рукава до соседнего узла
        const rCls = Math.max(CR.r[A.st.cls] || CR.r.residential, CR.r[B.st.cls] || CR.r.residential);
        const rLim = () => Math.min(rCls, Math.min(CR.dMax, A.avail * CR.share - kA, B.avail * CR.share - kB) * tan);
        let r = rLim();
        if (r < CR.rMin) { cst.skipFar++; log([A], 'r мал'); LOG[LOG.length - 1].d = [A.avail, B.avail, kA, kB, th].map(v => +v.toFixed(1)); continue; }
        const geo = rr => {
          const d = rr / tan;
          const TA = [K[0] + uA[0] * d, K[1] + uA[1] * d], TB = [K[0] + uB[0] * d, K[1] + uB[1] * d];
          const O = [TA[0] + nA[0] * rr, TA[1] + nA[1] * rr];
          // дуга от TA до TB вокруг O (короткая)
          const a0 = Math.atan2(TA[1] - O[1], TA[0] - O[0]);
          let da = Math.atan2(TB[1] - O[1], TB[0] - O[0]) - a0;
          while (da > Math.PI) da -= Math.PI * 2;
          while (da < -Math.PI) da += Math.PI * 2;
          return { d, TA, TB, O, a0, da };
        };
        let g = geo(r);
        // ближайшая к P точка оси рукава (от узла, до 30 м): длина дуги, направление от узла, полуширина
        const axisNear = (X, P) => {
          const v = X.st.v, s0 = v[X.i].s;
          let best = null;
          for (let j = X.i; Math.abs(v[j].s - s0) <= 30; j += X.dir) {
            const k = j + X.dir;
            if (k < 0 || k >= v.length) break;
            const a = v[j], b = v[k], dx = b.x - a.x, dz = b.z - a.z, LL = dx * dx + dz * dz || 1, l = Math.sqrt(LL);
            const t = clamp(((P[0] - a.x) * dx + (P[1] - a.z) * dz) / LL, 0, 1), x = a.x + dx * t, z = a.z + dz * t, d = Math.hypot(P[0] - x, P[1] - z);
            if (!best || d < best.d) best = { d, x, z, u: [dx / l, dz / l], hw: a.hw + (b.hw - a.hw) * t, s: a.s + (b.s - a.s) * t };
          }
          return best;
        };
        // Уточнение: ось у узла изгибается (сдвиг к середине между границами, изгиб улицы), прямая через точки в 6–12 м
        // от узла проходит мимо настоящего бордюра у касания. Бордюрная линия — касательная к бордюру в точке оси,
        // ближайшей к касанию; три прохода (и заново после каждого уменьшения r).
        const refine = () => {
          for (let it = 0; it < 3; it++) {
            const ta = axisNear(A, g.TA), tb = axisNear(B, g.TB);
            if (!ta || !tb) return;
            const keep = [uA, uB, nA, nB, pA, pB, thR, K, den, tan, kA, kB];
            const dAng = (u0, u1) => Math.atan2(u0[0] * u1[1] - u0[1] * u1[0], u0[0] * u1[0] + u0[1] * u1[1]);
            thR = thR - dAng(uA, ta.u) + dAng(uB, tb.u);
            uA = ta.u; uB = tb.u; nA = [-uA[1], uA[0]]; nB = [uB[1], -uB[0]];
            pA = [ta.x + nA[0] * ta.hw, ta.z + nA[1] * ta.hw]; pB = [tb.x + nB[0] * tb.hw, tb.z + nB[1] * tb.hw];
            const r2 = thR > CR.minAng * 0.5 && thR < Math.PI * 0.97 && cross() ? Math.min(r, rLim()) : 0;
            if (r2 < CR.rMin) { [uA, uB, nA, nB, pA, pB, thR, K, den, tan, kA, kB] = keep; return; }
            r = r2; g = geo(r);
          }
        };
        refine();
        // угол без тротуаров посреди пешеходной улицы (площадь) — асфальт туда не заливаем
        if (wA <= 0 && wB <= 0) {
          const am = g.a0 + g.da / 2;
          if (onPed(g.O[0] + Math.cos(am) * r, g.O[1] + Math.sin(am) * r)) { cst.skipWalk++; log([A], 'площадь'); continue; }
        }
        // дуга забора (r − w) и середина полосы — не в доме
        const hits = gg => {
          for (let k = 0; k <= 8; k++) {
            const an = gg.a0 + gg.da * k / 8, ww = wA + (wB - wA) * k / 8, c = Math.cos(an), s = Math.sin(an);
            const r0 = Math.max(0, r - ww), r1 = Math.max(0, r - ww / 2), x1 = gg.O[0] + c * r1, z1 = gg.O[1] + s * r1;
            if (inHouse(gg.O[0] + c * r0, gg.O[1] + s * r0) || inHouse(x1, z1) || inHouse(gg.O[0] + c * r, gg.O[1] + s * r)) return true;
            // тротуар угла на проезжей части третьей улицы (развязки, параллельные проезды)
            if (k > 0 && k < 8 && onOther(x1, z1, A.st, B.st)) return true;
          }
          return false;
        };
        // дуга заходит в дом — r меньше; не помогло и до rMin — угол остаётся острым (дом стоит на углу)
        let shrunk = false;
        while (r > CR.rMin && hits(g)) { r = Math.max(CR.rMin, r * 0.75); g = geo(r); refine(); shrunk = true; }
        if (hits(g)) { cst.skipHouse++; log([A], 'дом или чужая улица'); continue; }
        if (shrunk) cst.shrunk++;
        // длина дуги улицы в точке касания (угловой кусок встык с прямой полосой); касание далеко от настоящего
        // бордюра (рукав круто изгибается, касание за узлом) — угол не получится ровным, остаётся острым
        const nTA = axisNear(A, g.TA), nTB = axisNear(B, g.TB);
        const devA = Math.abs(nTA.d - nTA.hw), devB = Math.abs(nTB.d - nTB.hw);
        if (Math.max(devA, devB) > CR.dev) { cst.skipBend++; log([A], 'кривой рукав'); LOG[LOG.length - 1].d = [devA, devB].map(v => +v.toFixed(2)); continue; }
        const s1 = nTA.s, s2 = nTB.s;
        // полоса тротуара сразу за касанием лежит на проезжей части третьей улицы (развилка, короткая перемычка) —
        // прямой полосы там нет, и тротуар угла с этой стороны — островок посреди дороги: ширина 0 (только асфальт)
        const stripOff = (X, sd, w, s) => {
          if (w <= 0) return false;
          const v = X.st.v, sg = sd ? -1 : 1;
          return [0.5, 1.5].some(e => {
            const ss = clamp(s + X.dir * e, 0, X.st.len);
            let j = 0; while (j < v.length - 2 && v[j + 1].s < ss) j++;
            const a = v[j], b = v[j + 1], t = clamp((ss - a.s) / Math.max(1e-6, b.s - a.s), 0, 1), d = sg * (a.hw + (b.hw - a.hw) * t + w / 2);
            return onOther(a.x + (b.x - a.x) * t - a.tz * d, a.z + (b.z - a.z) * t + a.tx * d, A.st, B.st);
          });
        };
        const offA = stripOff(A, sA, wA, s1), offB = stripOff(B, sB, wB, s2);
        // ширина угла — у первой точки полосы за касанием (и не ближе look от узла): до неё полоса выравнивается
        // этой шириной (level), дальше идёт своей — без косого перехода сразу за углом
        const wAt = (X, sd, s, w0) => {
          const v = X.st.v, s0 = v[X.i].s, dT = Math.max(CR.look, (s - s0) * X.dir);
          for (let j = X.i; j >= 0 && j < v.length; j += X.dir) if ((v[j].s - s0) * X.dir > dT) return v[j].br ? w0 : v[j].sw[sd];
          return w0;
        };
        wA = offA ? 0 : wAt(A, sA, s1, wA);
        wB = offB ? 0 : wAt(B, sB, s2, wB);
        if (offA || offB) cst.offStrip++;
        // наружный край угла: дуга r − w (будущий забор) или острый угол Q — пересечение наружных краёв рукавов, если
        // в углу стоит дом (иначе между дугой и домом виден голый грунт) или тротуар шире r (дуга r − w не выходит)
        const wMax = Math.max(wA, wB);
        let sharp = null;
        if (wMax > 0) {
          const oA = [g.TA[0] + nA[0] * wA, g.TA[1] + nA[1] * wA], oB = [g.TB[0] + nB[0] * wB, g.TB[1] + nB[1] * wB];
          const tq = ((oB[0] - oA[0]) * uB[1] - (oB[1] - oA[1]) * uB[0]) / den, Q = [oA[0] + uA[0] * tq, oA[1] + uA[1] * tq];
          const am = g.a0 + g.da / 2, rm = Math.max(0, r - (wA + wB) / 2), M = [g.O[0] + Math.cos(am) * rm, g.O[1] + Math.sin(am) * rm];
          const at = (P, R, f) => [P[0] + (R[0] - P[0]) * f, P[1] + (R[1] - P[1]) * f];
          // острый угол не должен лечь на проезжую часть третьей улицы (развязки, островки)
          const free = Math.hypot(Q[0] - K[0], Q[1] - K[1]) < 4 * wMax + 2 &&
            ![at(M, Q, 0.5), Q, at(oA, Q, 0.5), at(oB, Q, 0.5)].some(P => onOther(P[0], P[1], A.st, B.st));
          // по ширине (тротуар шире r) — только у настоящих углов: r ≥ 1 м и тротуар с обеих сторон
          if (free && ((wMax > r - 0.3 && r >= 1 && wA > 0 && wB > 0) || [0.35, 0.65, 0.95].some(f => inHouse(...at(M, Q, f))))) sharp = Q;
        }
        // без острого угла дуга r − w должна выходить: тротуар угла не шире r
        const cw2 = w => sharp ? w : Math.min(w, r);
        const cA = cw2(wA), cB = cw2(wB);
        // полоса тротуара от узла до касания (и точка за ним) — той же шириной, что угловой кусок
        const level = (X, sd, w, s) => {
          const v = X.st.v, s0 = v[X.i].s, dT = Math.max(CR.look, (s - s0) * X.dir);
          for (let j = X.i; j >= 0 && j < v.length; j += X.dir) {
            if (v[j].br) break;
            v[j].sw[sd] = w;
            if ((v[j].s - s0) * X.dir > dT) break;
          }
        };
        // (рукав без полосы за касанием — не трогать: там тротуар обрезан проезжей частью)
        if (!offA) level(A, sA, cA, s1);
        if (!offB) level(B, sB, cB, s2);
        corners.push({
          K, O: g.O, r, d: g.d, a0: g.a0, da: g.da, th: thR, sharp,
          // wz — ширина обрезки прямой полосы тротуара за узлом
          a: { st: A.st, i: A.i, dir: A.dir, side: sA, u: uA, n: nA, w: cA, wz: Math.max(cA, A.st.v[A.i].sw[sA]), T: g.TA, s: s1 },
          b: { st: B.st, i: B.i, dir: B.dir, side: sB, u: uB, n: nB, w: cB, wz: Math.max(cB, B.st.v[B.i].sw[sB]), T: g.TB, s: s2 },
        });
        cst.made++;
        if (sharp) cst.sharp++;
      }
    }
    C.cornerStats = cst;
  }
  // клетки углов: асфальт угла (carriageAt) и обрезка тротуаров (walks.js)
  const cornerCells = sitgesCells(16);
  for (const c of corners) {
    const xs = [c.K[0], c.a.T[0], c.b.T[0], c.O[0]], zs = [c.K[1], c.a.T[1], c.b.T[1], c.O[1]], m = Math.max(c.a.w, c.b.w) + 2;
    c.bb = [Math.min(...xs) - m, Math.max(...xs) + m, Math.min(...zs) - m, Math.max(...zs) + m];
    cornerCells.add(...c.bb, c);
  }
  Object.assign(C, { corners, cornersAt: cornerCells.at });
}

// асфальт скруглённого угла c под точкой: за обоими бордюрами, вне круга r, не дальше касаний
function sitgesInFillet(c, x, z) {
  const px = x - c.K[0], pz = z - c.K[1];
  if (px * c.a.n[0] + pz * c.a.n[1] < 0 || px * c.b.n[0] + pz * c.b.n[1] < 0) return false;
  if (px * c.a.u[0] + pz * c.a.u[1] > c.d || px * c.b.u[0] + pz * c.b.u[1] > c.d) return false;
  return Math.hypot(x - c.O[0], z - c.O[1]) >= c.r;
}

