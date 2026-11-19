// Ситжес — РАСКЛАДКА: тротуары с обрезкой (после проезжей части, js/maps/sitges/carriage.js). Тротуар — полоса между
// проезжей частью и фасадом / забором с каждой стороны проезжей улицы (ширина q.sw из roads.js). На перекрёстках
// обрезается по проезжей части другой улицы (край — делением пополам отдельно по внутренней и внешней кромке: косые
// углы ровные); у скруглённых углов (C.corners) — по точке касания, по длине дуги улицы: дальше угловой кусок (его
// строит walks3d.js), стык без ступеньки и торца. Обрезок короче 1,6 м между двумя проезжими частями — не тротуар.
// C.walks — куски полос: { st, side, i, I0, I1, O0, O1, cutStart, cutEnd }: улица, сторона (0 — левая), отрезок
//   оси i…i+1, внутренний (у бордюра) и наружный край в начале и в конце ([x, z]), торец в начале / в конце.
//   Наружный край — линия забора; вместе с наружным краем углов (C.cornerWalks) — вся кромка тротуаров.
// C.cornerWalks — тротуары скруглённых углов (точки колец, концы — сечения полос), параллельно C.corners.
// Определяет: sitgesPlanWalks.
// Использует: clamp (js/core.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

function sitgesPlanWalks(C) {
  const offs = (q, d) => [q.x - q.tz * d, q.z + q.tx * d];   // d > 0 — сторона 0 (левая)
  // точка внутри проезжей части другой улицы или в зоне скруглённого угла этой стороны улицы (до касания — там
  // тротуар угла); только среди cand / candC — соседей текущего отрезка тротуара
  let cand = [], candC = [], curSide = 0;
  const cornersNear = (x0, x1, z0, z1) => {
    const out = new Set();
    for (let ci = Math.floor(x0 / 16); ci <= Math.floor(x1 / 16); ci++)
      for (let cj = Math.floor(z0 / 16); cj <= Math.floor(z1 / 16); cj++) for (const c of C.cornersAt(ci * 16 + 1, cj * 16 + 1)) out.add(c);
    return [...out];
  };
  // зона угла — по длине дуги улицы: от узла (и чуть за него) до касания X.s; угловой кусок начинается ровно там же
  // (его концы — сечения полосы при X.s), поэтому стык без ступеньки и торцевой стенки
  const inZone = (st, s) => {
    for (const c of candC) for (const X of [c.a, c.b]) {
      // рукав без тротуара угла (w = 0) полосу не режет: её обрезает проезжая часть другой улицы
      if (X.st !== st || X.side !== curSide || X.w <= 0) continue;
      const sJ = st.v[X.i].s, al = (s - sJ) * X.dir;
      if (al >= (X.s - sJ) * X.dir) continue;
      // за узел — на wz + 1,5 м (огрызки полосы у перекрёстка), но не на рукав с другим углом этой же стороны
      if (al >= 0) return true;
      const twin = candC.some(c2 => [c2.a, c2.b].some(Y => Y !== X && Y.st === st && Y.side === curSide && Y.i === X.i && Y.dir === -X.dir && Y.w > 0));
      if (!twin && al >= -(X.wz + 1.5)) return true;
    }
    return false;
  };
  // граница зоны угла рядом с s (для точной обрезки и без торца) — её s, иначе null
  const zoneEdge = (st, s) => {
    for (const c of candC) for (const X of [c.a, c.b]) if (X.st === st && X.side === curSide && X.w > 0 && Math.abs(s - X.s) < 0.05) return X.s;
    return null;
  };
  const inOther = (st, x, z, s) => {
    if (candC.length && inZone(st, s)) return true;
    for (const [o, i] of cand) {
      const a = o.v[i], b = o.v[i + 1], dx = b.x - a.x, dz = b.z - a.z, LL = dx * dx + dz * dz || 1;
      const t0 = ((x - a.x) * dx + (z - a.z) * dz) / LL;
      // конец улицы обрезан поперёк, без полукруга: иначе широкая улица (пешеходная, hw 4 м), кончающаяся в узле,
      // откусывает край тротуара соседней
      if ((t0 < 0 && i === 0) || (t0 > 1 && i === o.v.length - 2)) continue;
      const t = clamp(t0, 0, 1), ex = x - a.x - dx * t, ez = z - a.z - dz * t, hw = a.hw + (b.hw - a.hw) * t;
      if (ex * ex + ez * ez < hw * hw) return true;
    }
    return false;
  };
  const walks = [];
  for (const st of C.streets) {
    if (!st.drive) continue;
    const v = st.v;
    for (const side of [0, 1]) {
      const sg = side ? -1 : 1;
      curSide = side;
      // точки внутреннего (у бордюра) и внешнего края на отрезке i при параметре t
      const edge = (i, t, outer) => {
        const a = v[i], b = v[i + 1];
        const [ax, az] = offs(a, sg * (a.hw + (outer ? a.sw[side] : 0.05))), [bx, bz] = offs(b, sg * (b.hw + (outer ? b.sw[side] : 0.05)));
        return [ax + (bx - ax) * t, az + (bz - az) * t];
      };
      const mid = (i, t) => {
        const a = v[i], b = v[i + 1], w = (a.sw[side] + b.sw[side]) / 2;
        const [ax, az] = offs(a, sg * (a.hw + w * 0.5)), [bx, bz] = offs(b, sg * (b.hw + w * 0.5));
        return [ax + (bx - ax) * t, az + (bz - az) * t];
      };
      const sAt = (i, t) => v[i].s + (v[i + 1].s - v[i].s) * t;
      // граница «свободно / занято» между t0 (свободно) и t1 — делением пополам по краю outer; у границы зоны угла —
      // точно по её s
      const cutT = (i, t0, t1, outer) => {
        const free0 = !inOther(st, ...edge(i, t0, outer), sAt(i, t0)), free1 = !inOther(st, ...edge(i, t1, outer), sAt(i, t1));
        if (free0 === free1) return free0 ? t1 : t0;
        let lo = t0, hi = t1;
        for (let k = 0; k < 9; k++) { const m = (lo + hi) / 2; if (!inOther(st, ...edge(i, m, outer), sAt(i, m)) === free0) lo = m; else hi = m; }
        const t = (lo + hi) / 2, sz = candC.length ? zoneEdge(st, sAt(i, t)) : null;
        return sz === null ? t : clamp((sz - v[i].s) / Math.max(1e-6, v[i + 1].s - v[i].s), 0, 1);
      };
      let cont = -1;                                       // отрезок, на котором полоса дошла до конца без обрезки
      for (let i = 0; i + 1 < v.length; i++) {
        const a = v[i], b = v[i + 1];
        if (a.sw[side] <= 0 && b.sw[side] <= 0) continue;
        const [p0x, p0z] = offs(a, sg * (a.hw + a.sw[side])), [p1x, p1z] = offs(b, sg * (b.hw + b.sw[side]));
        const bx0 = Math.min(a.x, b.x, p0x, p1x), bx1 = Math.max(a.x, b.x, p0x, p1x), bz0 = Math.min(a.z, b.z, p0z, p1z), bz1 = Math.max(a.z, b.z, p0z, p1z);
        cand = C.carriageNear(bx0, bx1, bz0, bz1, st);
        candC = cornersNear(bx0, bx1, bz0, bz1).filter(c => (c.a.st === st && c.a.side === side) || (c.b.st === st && c.b.side === side));
        const L = Math.hypot(b.x - a.x, b.z - a.z), n0 = cand.length || candC.length ? Math.max(1, Math.ceil(L)) : 1;
        // куски по ≈ 1 м; границы зон углов (касания) — тоже границы кусков: иначе короткий свободный кусок у вершины
        // улицы (касание в 0,3 м от неё) проверялся бы по середине занятого куска и пропадал — щель у стыка
        const br = []; for (let k = 0; k <= n0; k++) br.push(k / n0);
        for (const c of candC) for (const X of [c.a, c.b]) {
          if (X.st !== st || X.side !== side || X.w <= 0) continue;
          const t = (X.s - a.s) / Math.max(1e-6, b.s - a.s);
          if (t > 1e-3 && t < 1 - 1e-3) br.push(t);
        }
        br.sort((p, q) => p - q);
        for (let k = br.length - 1; k > 0; k--) if (br[k] - br[k - 1] < 1e-4) br.splice(k, 1);
        const n = br.length - 1, md = k => (br[k] + br[k + 1]) / 2;
        // свободные куски (по середине полосы)
        const free = []; for (let k = 0; k < n; k++) free.push(!inOther(st, ...mid(i, md(k)), sAt(i, md(k))));
        for (let k = 0; k < n;) {
          if (!free[k]) { k++; continue; }
          let e = k; while (e < n && free[e]) e++;
          // отрезок свободен от br[k] до br[e]; края уточнить по внутренней и внешней кромке отдельно — от середины
          // крайнего свободного куска до конца соседнего занятого (граница может лежать и в том, и в другом); конец
          // отрезка внутри зоны угла (граница — в крайнем куске до его середины) — тоже искать
          const z0 = k === 0 && candC.length > 0 && inZone(st, a.s), z1 = e === n && candC.length > 0 && inZone(st, b.s);
          const tI0 = k ? cutT(i, md(k), br[k - 1], false) : z0 ? cutT(i, md(0), 0, false) : 0;
          const tO0 = k ? cutT(i, md(k), br[k - 1], true) : z0 ? cutT(i, md(0), 0, true) : 0;
          const tI1 = e < n ? cutT(i, md(e - 1), br[e + 1], false) : z1 ? cutT(i, md(n - 1), 1, false) : 1;
          const tO1 = e < n ? cutT(i, md(e - 1), br[e + 1], true) : z1 ? cutT(i, md(n - 1), 1, true) : 1;
          const nx2 = v[i + 2];
          // торец — где полоса обрезана, кроме стыка с угловым куском
          const atC = t => candC.length > 0 && zoneEdge(st, sAt(i, t)) !== null;
          const cutStart = (k > 0 || z0 || cont !== i - 1) && !atC(tI0), cutEnd = (e < n || z1 || !nx2 || (b.sw[side] <= 0 && nx2.sw[side] <= 0)) && !atC(tI1);
          const k0 = k;
          if (e === n && !z1) cont = i;
          k = e;
          // обрезок короче 1,6 м, зажатый между проезжими частями с обеих сторон, — не тротуар (островок на развилке);
          // кусок между двумя углами (короткий рукав) — тротуар
          if (k0 > 0 && e < n && (br[e] - br[k0]) * L < 1.6 && !atC(tI0) && !atC(tI1)) continue;
          // углы: внутренний / внешний край в начале и в конце
          const I0 = edge(i, tI0, false), O0 = edge(i, tO0, true), I1 = edge(i, tI1, false), O1 = edge(i, tO1, true);
          walks.push({ st, side, i, I0, I1, O0, O1, cutStart, cutEnd });
        }
      }
    }
  }
  C.walks = walks;

  /* ---------- скруглённые углы: тротуар между дугами (точки колец; строит walks3d.js) ---------- */
  // C.cornerWalks[i] — для угла C.corners[i]: { N, EA, EB, Q, ring } — число кусков дуги; концы (бордюр I и наружный
  //   край O) — точно сечения прямых полос при s касания; вершина острого наружного угла Q (или null); ring[k],
  //   k = 0…N — { f, e, w, I, Ou }: доля дуги, направление от центра, ширина тротуара, бордюр и наружный край
  //   (вместе с O0–O1 полос — кромка тротуаров, линия забора: js/maps/sitges/fences.js)
  const cornerWalk = c => {
    const N = Math.max(3, Math.ceil(Math.abs(c.da) * c.r / 0.8));
    // дуга подправляется сдвигом, плавно меняющимся от одного конца к другому
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
    const ring = [];
    for (let k = 0; k <= N; k++) {
      const f = k / N, an = c.a0 + c.da * f, e = [Math.cos(an), Math.sin(an)], w = c.a.w + (c.b.w - c.a.w) * f;
      const ai = arcAt(k, c.r), I = [ai[0] + dIa[0] + (dIb[0] - dIa[0]) * f, ai[1] + dIa[1] + (dIb[1] - dIa[1]) * f];
      let Ou;
      if (Q) Ou = k <= kq ? [EA.O[0] + (Q[0] - EA.O[0]) * k / kq, EA.O[1] + (Q[1] - EA.O[1]) * k / kq]
        : [Q[0] + (EB.O[0] - Q[0]) * (k - kq) / (N - kq), Q[1] + (EB.O[1] - Q[1]) * (k - kq) / (N - kq)];
      else { const ao = arcAt(k, Math.max(0, c.r - w)); Ou = [ao[0] + dOa[0] + (dOb[0] - dOa[0]) * f, ao[1] + dOa[1] + (dOb[1] - dOa[1]) * f]; }
      ring.push({ f, e, w, I, Ou });
    }
    return { N, EA, EB, Q, ring };
  };
  C.cornerWalks = C.corners.map(cornerWalk);
}
