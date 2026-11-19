// Ситжес — РАСКЛАДКА: улицы и ж/д — уровни (после склейки и ширин, js/maps/sitges/roads.js).
//   Ровное полотно (sitgesEvenRoads) — до профилей: рельеф игровой сетки под улицами и путями сглажен (горбы лидара
//     убраны).
//   Профили: высота точек по рельефу; мосты OSM — настил по прямой между «плечами» подходов, подходы ниже — насыпь.
//   Пересечения с ж/д: в одном уровне — переезд (C.xings); мост / тоннель (по OSM) — путепровод (C.unders): верхняя
//     линия на пролёте — настил по прямой между высотами краёв, нижняя опускается под него (просвет clear) с уклоном
//     grade; в рельефе под ней — выемка с откосами (bank). Рельеф игровой сетки меняется здесь, до домов.
// Определяет: sitgesPlanLevels, sitgesEvenRoads.
// Использует: clamp (js/core.js); smooth01 (js/world.js); sitgesCells, sitgesSeg, SITGES_SEG
//   (js/maps/sitges/geom.js); SITGES_T (js/maps/sitges/terrain.js); SITGES_R (js/maps/sitges/roads.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

function sitgesPlanLevels(C) {
  const { streets, tracks, terra: T } = C, P = SITGES_R;
  /* ---------- профили: высота по рельефу, мосты OSM — по прямой между «плечами» подходов ---------- */
  // концы моста OSM в рельефе 10 м лежат уже на склоне балки / выемки под ним: настил по ним провисал на 1–4 м.
  // Плечо — от конца моста наружу, пока рельеф поднимается круче approach.rise (не дальше approach.ext м); настил —
  // по прямой между плечами, подходы ниже этой прямой — насыпь (q.fill, рельеф поднимается ниже, после выемок)
  const { ground } = C, AP = P.approach;
  const profile = line => {
    const v = line.v;
    for (const q of v) { q.y = ground(q.x, q.z); q.deck = false; q.fill = false; }
    for (let i = 0; i < v.length - 1;) {
      if (!v[i].br) { i++; continue; }
      let j = i; while (j < v.length - 1 && v[j].br) j++;
      let a = i, b = j;
      while (a > 0 && !v[a - 1].br && !v[a - 1].deck && v[i].s - v[a - 1].s <= AP.ext &&
        v[a - 1].y - v[a].y > AP.rise * (v[a].s - v[a - 1].s)) a--;
      while (b < v.length - 1 && !v[b].br && v[b + 1].s - v[j].s <= AP.ext &&
        v[b + 1].y - v[b].y > AP.rise * (v[b + 1].s - v[b].s)) b++;
      const ya = v[a].y, yb = v[b].y, L = Math.max(1e-6, v[b].s - v[a].s);
      for (let k = a; k <= b; k++) {
        const y = ya + (yb - ya) * (v[k].s - v[a].s) / L;
        if (k >= i && k < j) { v[k].y = y; v[k].deck = true; }
        else if (y > v[k].y + 0.02) { v[k].y = y; v[k].fill = true; }
      }
      i = j;
    }
  };
  streets.forEach(profile); tracks.forEach(profile);

  /* ---------- пересечения улиц с путями ---------- */
  // точка пересечения отрезков (a0 a1) и (b0 b1): параметры t, u
  const cross = (a0, a1, b0, b1) => {
    const dx = a1.x - a0.x, dz = a1.z - a0.z, ex = b1.x - b0.x, ez = b1.z - b0.z, den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-9) return null;
    const qx = b0.x - a0.x, qz = b0.z - a0.z, t = (qx * ez - qz * ex) / den, u = (qx * dz - qz * dx) / den;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [t, u] : null;
  };
  const railCells = sitgesCells(64);
  tracks.forEach((tr, ti) => tr.v.forEach((q, i) => {
    if (i === tr.v.length - 1) return;
    const b = tr.v[i + 1];
    railCells.add(Math.min(q.x, b.x), Math.max(q.x, b.x), Math.min(q.z, b.z), Math.max(q.z, b.z), [ti, i]);
  }));
  const xings = [], unders = [];
  for (const st of streets) {
    if (!st.drive && st.cls !== 'pedestrian') continue;            // тропинки и лестницы — не через пути
    const v = st.v;
    for (let i = 0; i + 1 < v.length; i++) {
      const a = v[i], b = v[i + 1], found = new Set();
      railCells.each(Math.min(a.x, b.x), Math.max(a.x, b.x), Math.min(a.z, b.z), Math.max(a.z, b.z), list => {
        for (const [ti, k] of list) {
          const id = ti * 1e5 + k;
          if (found.has(id)) continue;
          found.add(id);
          const tr = tracks[ti], c = tr.v[k], d = tr.v[k + 1], h = cross(a, b, c, d);
          if (!h) continue;
          const [t, u] = h, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
          const sr = a.s + (b.s - a.s) * t, sl = c.s + (d.s - c.s) * u;
          const roadUp = a.br, roadDown = a.tn || c.br;
          if (!roadUp && !roadDown) { xings.push({ x, z, st, sr, tr, sl, tx: d.x - c.x, tz: d.z - c.z }); continue; }
          unders.push({ x, z, up: roadUp ? st : tr, sUp: roadUp ? sr : sl, low: roadUp ? tr : st, sLow: roadUp ? sl : sr });
        }
      });
    }
  }

  /* ---------- путепроводы: верх — настил на пролёте, низ — спуск под него ---------- */
  const yAt = (line, s) => {
    const v = line.v;
    let i = 0; while (i < v.length - 2 && v[i + 1].s < s) i++;
    const a = v[i], b = v[i + 1], t = clamp((s - a.s) / Math.max(1e-6, b.s - a.s), 0, 1);
    return a.y + (b.y - a.y) * t;
  };
  const halfOf = (line, s) => {
    if (!line.v[0].hw) return P.railHalf;
    const v = line.v; let i = 0; while (i < v.length - 1 && v[i + 1].s < s) i++;
    return v[i].hw + Math.max(v[i].sw[0], v[i].sw[1]);
  };
  for (const U of unders) {
    // пролёт верхней линии: нижняя линия с запасом span с каждой стороны (косое пересечение — шире)
    const half = halfOf(U.low, U.sLow) + P.span;
    const lv = U.low.v, uv = U.up.v;
    let i = 0; while (i < lv.length - 2 && lv[i + 1].s < U.sLow) i++;
    let j = 0; while (j < uv.length - 2 && uv[j + 1].s < U.sUp) j++;
    const ldx = lv[i + 1].x - lv[i].x, ldz = lv[i + 1].z - lv[i].z, udx = uv[j + 1].x - uv[j].x, udz = uv[j + 1].z - uv[j].z;
    const sin = Math.abs(ldx * udz - ldz * udx) / (Math.hypot(ldx, ldz) * Math.hypot(udx, udz) || 1);
    // откос выемки (если нижнюю линию придётся опускать) — тоже под настилом
    const dip0 = Math.max(0, yAt(U.low, U.sLow) - (yAt(U.up, U.sUp) - P.clear));
    const spanH = (half + 0.3 + dip0 / P.bank) / Math.max(0.35, sin);
    U.s0 = Math.max(0, U.sUp - spanH); U.s1 = Math.min(uv[uv.length - 1].s, U.sUp + spanH);
  }
  // верх: прямая между высотами краёв пролёта (на мосту OSM она уже такая); пролёты над соседними путями — один
  for (const up of new Set(unders.map(U => U.up))) {
    const list = unders.filter(U => U.up === up).sort((a, b) => a.s0 - b.s0), groups = [];
    for (const U of list) {
      const g = groups[groups.length - 1];
      if (g && U.s0 <= g.s1) { g.s1 = Math.max(g.s1, U.s1); g.list.push(U); } else groups.push({ s0: U.s0, s1: U.s1, list: [U] });
    }
    for (const g of groups) {
      // края пролёта: продлить до ближайших точек, чтобы настил начинался в точке ломаной
      const v = up.v;
      let a = 0; while (a < v.length - 1 && v[a + 1].s <= g.s0) a++;
      let b = v.length - 1; while (b > 0 && v[b - 1].s >= g.s1) b--;
      g.s0 = v[a].s; g.s1 = v[b].s;
      const y0 = v[a].y, y1 = v[b].y;
      for (let k = a; k <= b; k++) { v[k].y = y0 + (y1 - y0) * (v[k].s - g.s0) / Math.max(1e-6, g.s1 - g.s0); v[k].deck = k < b; }
      for (const U of g.list) { U.s0 = g.s0; U.s1 = g.s1; U.yUp = yAt(up, U.sUp); }
    }
  }
  // низ: не выше «верх − clear» под пролётом, дальше — с уклоном grade к рельефу
  for (const U of unders) {
    const g = U.low.v[0].hw ? P.grade.road : P.grade.rail, top = U.yUp - P.clear;
    const reach = (halfOf(U.up, U.sUp) + P.span) * 1.5;
    U.dip = Math.max(0, yAt(U.low, U.sLow) - top);
    for (const q of U.low.v) {
      const lim = top + Math.max(0, Math.abs(q.s - U.sLow) - reach) * g;
      if (q.y > lim) { q.y = lim; q.cut = true; }
    }
  }

  /* ---------- насыпи и выемки: рельеф игровой сетки под линиями ---------- */
  const { X0, Z0, NX, NZ, S, H } = T, cuts = [];
  // sgn −1 — насыпь подходов к мостам (точки q.fill): рельеф поднимается до полотна, за краем — откос
  // approach.fillBank; sgn +1 — выемка под путепроводом (q.cut): рельеф опускается, откос bank. Насыпи — до выемок:
  // выемка под путепроводом сильнее насыпи
  const reshape = (line, halfAt, sgn) => {
    const v = line.v, bank = sgn < 0 ? P.approach.fillBank : P.bank;
    for (let i = 0; i + 1 < v.length; i++) {
      const a = v[i], b = v[i + 1];
      if (sgn < 0 ? a.deck || (!a.fill && !b.fill) : !a.cut && !b.cut) continue;
      // высота полотна над рельефом (насыпь) или рельефа над полотном (выемка): от края откос bank м на метр
      const ga = ground(a.x, a.z), gb = ground(b.x, b.z), ha = halfAt(a), hb = halfAt(b);
      const h = sgn < 0 ? Math.max(a.y - ga, b.y - gb, 0) : Math.max(ga - a.y, gb - b.y, 0);
      const hm = Math.max(ha, hb) + 0.3 + h / bank + S;
      const i0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - hm - X0) / S)), i1 = Math.min(NX - 1, Math.ceil((Math.max(a.x, b.x) + hm - X0) / S));
      const j0 = Math.max(0, Math.floor((Math.min(a.z, b.z) - hm - Z0) / S)), j1 = Math.min(NZ - 1, Math.ceil((Math.max(a.z, b.z) + hm - Z0) / S));
      for (let jj = j0; jj <= j1; jj++) for (let ii = i0; ii <= i1; ii++) {
        const d = sitgesSeg(X0 + ii * S, Z0 + jj * S, a.x, a.z, b.x, b.z), t = SITGES_SEG.t, hh = ha + (hb - ha) * t;
        const k = jj * NX + ii, y = a.y + (b.y - a.y) * t + sgn * Math.max(0, d - hh - 0.3) * bank;
        if (sgn < 0 ? y > H[k] : y < H[k]) H[k] = y;
      }
    }
    if (sgn > 0 && !cuts.includes(line)) cuts.push(line);
  };
  const half = q => q.hw + Math.max(q.sw[0], q.sw[1]), railHalf = () => P.railHalf;
  for (const st of streets) if (st.v.some(q => q.fill)) reshape(st, half, -1);
  for (const tr of tracks) if (tr.v.some(q => q.fill)) reshape(tr, railHalf, -1);
  for (const st of streets) if (st.v.some(q => q.cut)) reshape(st, half, 1);
  for (const tr of tracks) if (tr.v.some(q => q.cut)) reshape(tr, railHalf, 1);
  // настил продлевается, пока под концом рельеф ниже полотна (выемка улицы под коротким мостом шире него вместе
  // с откосами): конец настила — снова на рельефе; не дальше approach.ext м с каждой стороны
  const sinks = q => ground(q.x, q.z) < q.y - 0.15;
  for (const line of [...streets, ...tracks]) {
    const v = line.v;
    for (let i = 0; i < v.length - 1; i++) {
      if (!v[i].deck || (i > 0 && v[i - 1].deck)) continue;
      let j = i; while (j < v.length - 1 && v[j].deck) j++;
      for (let k = i; k > 0 && sinks(v[k]) && v[i].s - v[k - 1].s <= P.approach.ext; k--) v[k - 1].deck = true;
      for (let k = j; k < v.length - 1 && sinks(v[k]) && v[k + 1].s - v[j].s <= P.approach.ext; k++) v[k].deck = true;
      while (i < v.length - 1 && v[i].deck) i++;
    }
  }
  // после выемок — высоты точек на рельефе заново (кроме настилов)
  for (const line of [...streets, ...tracks]) for (const q of line.v) if (!q.deck) q.y = ground(q.x, q.z);

  Object.assign(C.roadStats, { xings: xings.length, unders: unders.length, dips: unders.map(U => +U.dip.toFixed(1)) });
  Object.assign(C, { xings, unders, cuts });
}

// Ровное полотно (SITGES_R.even): рельеф игровой сетки C.terra.H под улицами (проезжими и пешеходными, кроме тропинок
// и лестниц) и путями сглаживается до профилей, мостов и выемок — по нему потом лягут полотно, тротуары и физика.
// Узел «полотна» — не дальше полуширины с тротуарами от оси отрезка (мосты OSM — нет: под ними свой рельеф);
// новое значение — взвешенное среднее узлов полотна вокруг (Гаусс по расстоянию × вес по разнице высот), за краем
// полотна — плавно к старому рельефу. Море и волнорезы не трогаем, суша у воды — не ниже берега (как в terrain.js).
function sitgesEvenRoads(C) {
  const { streets, tracks } = C;
  const { X0, Z0, NX, NZ, S, H, sea, thin, dSea } = C.terra, E = SITGES_R.even, T = SITGES_T, N = NX * NZ;
  const t0 = performance.now(), core = new Uint8Array(N), wt = new Float32Array(N);
  const mark = (a, b, half) => {
    const hm = half + E.edge;
    const i0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - hm - X0) / S)), i1 = Math.min(NX - 1, Math.ceil((Math.max(a.x, b.x) + hm - X0) / S));
    const j0 = Math.max(0, Math.floor((Math.min(a.z, b.z) - hm - Z0) / S)), j1 = Math.min(NZ - 1, Math.ceil((Math.max(a.z, b.z) + hm - Z0) / S));
    const dx = b.x - a.x, dz = b.z - a.z, LL = dx * dx + dz * dz || 1, h2 = half * half, m2 = hm * hm;
    for (let j = j0; j <= j1; j++) for (let i = i0, k = j * NX + i0; i <= i1; i++, k++) {
      if (core[k]) continue;
      const px = X0 + i * S - a.x, pz = Z0 + j * S - a.z, t = clamp((px * dx + pz * dz) / LL, 0, 1);
      const ex = px - dx * t, ez = pz - dz * t, d2 = ex * ex + ez * ez;
      if (d2 <= h2) { core[k] = 1; wt[k] = 1; } else if (d2 < m2) wt[k] = Math.max(wt[k], smooth01(1 - (Math.sqrt(d2) - half) / E.edge));
    }
  };
  for (const st of streets) {
    if ((!st.drive && st.cls !== 'pedestrian') || st.flat) continue;
    const v = st.v;
    for (let i = 0; i + 1 < v.length; i++) {
      if (v[i].br) continue;
      const a = v[i], b = v[i + 1];
      mark(a, b, Math.max(a.hw + Math.max(a.sw[0], a.sw[1]), b.hw + Math.max(b.sw[0], b.sw[1])));
    }
  }
  for (const tr of tracks) for (let i = 0; i + 1 < tr.v.length; i++) if (!tr.v[i].br) mark(tr.v[i], tr.v[i + 1], SITGES_R.railHalf);
  for (let k = 0; k < N; k++) if (sea[k] || thin[k]) { core[k] = 0; wt[k] = 0; }
  // ядро: веса Гаусса по смещению (di, dj) в круге
  const R = Math.ceil(E.rad * E.sigma / S), offs = [], gw = [];
  for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) {
    const d2 = (di * di + dj * dj) * S * S;
    if (d2 > (E.rad * E.sigma) ** 2) continue;
    offs.push(dj * NX + di); gw.push(Math.exp(-d2 / (2 * E.sigma * E.sigma)));
  }
  const lo = Int32Array.from(offs), gwf = Float32Array.from(gw), M = lo.length;
  // узлы ближе R к краю сетки (это запас за игровым прямоугольником) не трогаем — без проверок границ в цикле
  const list = [];
  for (let j = R; j < NZ - R; j++) for (let i = R, k = j * NX + R; i < NX - R; i++, k++) if (wt[k] > 0) list.push(k);
  const out = new Float32Array(list.length), ir2 = 1 / (E.range * E.range);
  for (let pass = 0; pass < E.passes; pass++) {
    for (let n = 0; n < list.length; n++) {
      const k = list[n], h0 = H[k];
      let sw = 0, sh = 0;
      for (let m = 0; m < M; m++) {
        const q = k + lo[m];
        if (!core[q]) continue;
        const hq = H[q], dh = hq - h0, f = 1 - dh * dh * ir2;
        if (f <= 0) continue;
        const w = gwf[m] * f * f;
        sw += w; sh += w * hq;
      }
      out[n] = sw > 0 ? h0 + (sh / sw - h0) * wt[k] : h0;
    }
    for (let n = 0; n < list.length; n++) H[list[n]] = out[n];
  }
  for (const k of list) H[k] = Math.max(H[k], Math.min(T.shoreMax, T.shore0 + T.shoreRise * dSea[k]));
  C.evenStats = { ms: Math.round(performance.now() - t0), nodes: list.length, core: core.reduce((s, c) => s + c, 0), taps: gw.length };
}
