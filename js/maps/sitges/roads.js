// Ситжес — РАСКЛАДКА: улицы и железная дорога. После рельефа (js/maps/sitges/terrain.js), до мини-карты.
//   Склейка — участки одной улицы (OSM режет их на перекрёстках и мостах), сходящиеся концами по двое, — в одну
//     ломаную; точки через ≤ SITGES_R.step м, у каждого отрезка — флаги «мост» / «тоннель».
//   Ширина — проезжая часть по классу (полосы, парковка у односторонки), но не шире промежутка между фасадами:
//     в каждой точке луч поперёк улицы до ближайшей стены здания с обеих сторон (медиана по соседним точкам).
//     Тротуар — что осталось до фасада, не шире нормы класса; уже minWalk — улица в одном уровне от стены до стены.
//   Пересечения с ж/д: в одном уровне — переезд; мост / тоннель (по OSM) — путепровод: верхняя линия на пролёте —
//     настил по прямой между высотами краёв, нижняя опускается под него (просвет clear) с уклоном grade; в рельефе
//     под ней — выемка с откосами (bank). Рельеф игровой сетки меняется здесь, до домов.
//   carriageAt(x, z) — проезжая часть под точкой: покрытие, обрезка тротуаров на перекрёстках, монеты.
// Определяет: SITGES_R, sitgesPlanRoads.
// Использует: clamp (js/core.js); SITGES_DRIVE (js/maps/sitges/minimap.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const SITGES_R = {
  // lane — ширина полосы, м; park — парковка вдоль односторонки; sw — тротуар до стольких метров (0 — мостовая
  // в одном уровне); w — ширина, если она не от полос; surf — покрытие, если в OSM не указано
  cls: {
    secondary: { lane: 3.3, park: 2.2, sw: 3.5, surf: 'asphalt' },
    tertiary: { lane: 3.1, park: 2.2, sw: 3.0, surf: 'asphalt' },
    unclassified: { lane: 3.0, park: 0, sw: 2.0, surf: 'asphalt' },
    residential: { lane: 2.9, park: 2.0, sw: 2.4, surf: 'asphalt' },
    living_street: { w: 5, sw: 0, surf: 'paving_stones' },
    service: { w: 4, sw: 0, surf: 'asphalt' },
    pedestrian: { w: 8, sw: 0, surf: 'paving_stones' },
    track: { w: 3, sw: 0, surf: 'compacted', flat: true },
    footway: { w: 2, sw: 0, surf: 'paving_stones', flat: true },
    path: { w: 1.5, sw: 0, surf: 'compacted', flat: true },
    cycleway: { w: 2.2, sw: 0, surf: 'asphalt', flat: true },
    steps: { w: 2, sw: 0, surf: 'paving_stones', flat: true },
  },
  step: 5,            // точки улиц — не реже, м
  minHalf: 1.4,       // проезжая часть не уже 2,8 м (дальше — стены домов)
  minWalk: 0.9,       // тротуар уже — не делаем
  ray: 30,            // фасад дальше — нет фасада
  longTunnel: 60,     // тоннели длиннее — настоящие (в рельефе их нет): не рисуем
  clear: 5.4,         // путепровод: от верха настила до дороги / рельсов под ним, м
  grade: { road: 0.1, rail: 0.03 },   // уклон спуска под путепровод
  railHalf: 2.4,      // полуширина выемки под путь, м
  span: 3,            // настил шире нижней линии на столько метров с каждой стороны
  bank: 0.9,          // откос выемки, м на м
};

function sitgesPlanRoads(C) {
  const { roads, rails, blds, terra: T } = C, P = SITGES_R;
  const key = p => Math.round(p[0] * 10) * 1e6 + Math.round(p[1] * 10);
  const plen = p => { let s = 0; for (let i = 1; i < p.length; i++) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return s; };

  /* ---------- склейка участков в ломаные ---------- */
  // w: { pts, sb (мост на отрезке), st (тоннель), a (свойства) }. Концы двух участков сходятся в узле, где больше
  // ничего не сходится и не проходит, и same(a, b) — склеить
  const chainUp = (ways, same) => {
    const use = new Map();
    for (const w of ways) w.pts.forEach((p, i) => { const k = key(p); use.set(k, (use.get(k) || 0) + (i === 0 || i === w.pts.length - 1 ? 1 : 2)); });
    const ends = new Map(), live = new Set(ways);
    const addEnd = (k, w) => { if (!ends.has(k)) ends.set(k, []); ends.get(k).push(w); };
    for (const w of ways) { addEnd(key(w.pts[0]), w); addEnd(key(w.pts[w.pts.length - 1]), w); }
    const rev = w => ({ ...w, pts: w.pts.slice().reverse(), sb: w.sb.slice().reverse(), st: w.st.slice().reverse(), a: { ...w.a, oneway: -w.a.oneway } });
    for (const [k, list] of ends) {
      if (list.length !== 2 || use.get(k) !== 2) continue;
      let [a, b] = list;
      if (a === b || !live.has(a) || !live.has(b) || !same(a.a, b.a)) continue;
      if (key(a.pts[a.pts.length - 1]) !== k) a = rev(a);
      if (key(b.pts[0]) !== k) b = rev(b);
      if (a.a.oneway && b.a.oneway && a.a.oneway !== b.a.oneway) continue;   // встречные односторонки — разные улицы
      const m = { pts: a.pts.concat(b.pts.slice(1)), sb: a.sb.concat(b.sb), st: a.st.concat(b.st), a: a.a };
      live.delete(list[0]); live.delete(list[1]); live.add(m);
      // в списках других концов заменить склеенные участки новой ломаной
      for (const e of [key(m.pts[0]), key(m.pts[m.pts.length - 1])]) {
        const L = ends.get(e);
        if (L) for (let q = 0; q < L.length; q++) if (L[q] === list[0] || L[q] === list[1]) L[q] = m;
      }
      list.length = 0;
    }
    return [...live];
  };
  // точки через ≤ step м; у точки — флаги отрезка, который из неё выходит
  const resample = w => {
    const v = [];
    for (let i = 0; i + 1 < w.pts.length; i++) {
      const [ax, az] = w.pts[i], [bx, bz] = w.pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / P.step));
      for (let k = 0; k < n; k++) v.push({ x: ax + (bx - ax) * k / n, z: az + (bz - az) * k / n, br: w.sb[i], tn: w.st[i] });
    }
    const [lx, lz] = w.pts[w.pts.length - 1];
    v.push({ x: lx, z: lz, br: false, tn: false });
    // направление и длина дуги
    let s = 0;
    for (let i = 0; i < v.length; i++) {
      const a = v[Math.max(0, i - 1)], b = v[Math.min(v.length - 1, i + 1)], L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      v[i].tx = (b.x - a.x) / L; v[i].tz = (b.z - a.z) / L;
      if (i) s += Math.hypot(v[i].x - v[i - 1].x, v[i].z - v[i - 1].z);
      v[i].s = s;
    }
    return v;
  };

  /* ---------- улицы ---------- */
  const ways = roads.filter(r => P.cls[r.cls] && !(r.tunnel && plen(r.pts) > P.longTunnel) && r.pts.length > 1)
    .map(r => ({ pts: r.pts, sb: r.pts.slice(1).map(() => r.bridge), st: r.pts.slice(1).map(() => r.tunnel), a: r }));
  const streets = chainUp(ways, (a, b) => a.cls === b.cls && a.name === b.name && !a.oneway === !b.oneway && a.surface === b.surface)
    .map(w => {
      const r = w.a, K = P.cls[r.cls], drive = SITGES_DRIVE.has(r.cls);
      const surf = r.surface && r.surface !== 'other' ? r.surface : K.surf;
      return { cls: r.cls, name: r.name, oneway: r.oneway, surf, drive, flat: !!K.flat, K, v: resample(w), len: plen(w.pts) };
    });

  /* ---------- фасады: луч поперёк улицы до стены здания ---------- */
  const EC = 16, edges = new Map();
  for (const b of blds) for (const p of b.parts) for (const r of p.rings) for (let i = 0; i < r.length; i++) {
    const [ax, az] = r[i], [bx, bz] = r[(i + 1) % r.length];
    for (let ci = Math.floor(Math.min(ax, bx) / EC); ci <= Math.floor(Math.max(ax, bx) / EC); ci++)
      for (let cj = Math.floor(Math.min(az, bz) / EC); cj <= Math.floor(Math.max(az, bz) / EC); cj++) {
        const k = ci * 65536 + cj;
        if (!edges.has(k)) edges.set(k, []);
        edges.get(k).push([ax, az, bx - ax, bz - az]);
      }
  }
  const seen = new Set();
  const ray = (x, z, dx, dz) => {
    let best = Infinity;
    seen.clear();
    for (let t = 0; t <= P.ray + EC; t += EC / 2) {
      const k = Math.floor((x + dx * t) / EC) * 65536 + Math.floor((z + dz * t) / EC);
      if (seen.has(k)) continue;
      seen.add(k);
      const list = edges.get(k);
      if (list) for (const [ax, az, ex, ez] of list) {
        // x + dx·t = ax + ex·u, z + dz·t = az + ez·u
        const den = dx * ez - dz * ex;
        if (Math.abs(den) < 1e-9) continue;
        const qx = ax - x, qz = az - z, tt = (qx * ez - qz * ex) / den, u = (qx * dz - qz * dx) / den;
        if (tt > 0.05 && u >= 0 && u <= 1 && tt < best) best = tt;
      }
      if (best < t) break;
    }
    return best > P.ray ? Infinity : best;
  };
  const median = (a, i) => { const w = a.slice(Math.max(0, i - 2), i + 3).sort((p, q) => p - q); return w[w.length >> 1]; };
  for (const st of streets) {
    const { K, v, oneway } = st;
    if (st.flat) { for (const q of v) { q.hw = K.w / 2; q.sw = [0, 0]; } continue; }
    const W0 = K.w || ((oneway ? 1 : 2) * K.lane + (oneway ? K.park : 0));
    const L = v.map(q => ray(q.x, q.z, -q.tz, q.tx)), R = v.map(q => ray(q.x, q.z, q.tz, -q.tx));
    v.forEach((q, i) => {
      const l = median(L, i), r = median(R, i);
      q.hw = Math.max(P.minHalf, Math.min(W0 / 2, l, r));
      // тротуар: до фасада, не шире нормы класса; на мостах — узкий
      const side = d => { const s = Math.min(K.sw, d - q.hw); return s >= P.minWalk ? s : 0; };
      q.sw = q.br ? [Math.min(1.5, K.sw), Math.min(1.5, K.sw)] : [side(l), side(r)];
      q.fac = [l, r];
    });
    // сгладить скачки ширины (соседние точки)
    const hw = v.map(q => q.hw);
    v.forEach((q, i) => { q.hw = (hw[Math.max(0, i - 1)] + 2 * hw[i] + hw[Math.min(v.length - 1, i + 1)]) / 4; });
  }

  /* ---------- железная дорога ---------- */
  const railWays = rails.filter(r => !r.tunnel && r.pts.length > 1)
    .map(r => ({ pts: r.pts, sb: r.pts.slice(1).map(() => r.bridge), st: r.pts.slice(1).map(() => false), a: { siding: r.siding, oneway: 0 } }));
  const tracks = chainUp(railWays, (a, b) => a.siding === b.siding).map(w => ({ siding: w.a.siding, v: resample(w), len: plen(w.pts) }));

  /* ---------- профили: высота по рельефу, мосты OSM — по прямой между краями ---------- */
  const { ground } = C;
  const profile = line => {
    const v = line.v;
    for (const q of v) { q.y = ground(q.x, q.z); q.deck = false; }
    for (let i = 0; i < v.length - 1;) {
      if (!v[i].br) { i++; continue; }
      let j = i; while (j < v.length - 1 && v[j].br) j++;
      for (let k = i; k <= j; k++) { v[k].y = v[i].y + (v[j].y - v[i].y) * (v[k].s - v[i].s) / Math.max(1e-6, v[j].s - v[i].s); v[k].deck = k < j; }
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
  const RC = 64, railCells = new Map();
  tracks.forEach((tr, ti) => tr.v.forEach((q, i) => {
    if (i === tr.v.length - 1) return;
    const b = tr.v[i + 1];
    for (let ci = Math.floor(Math.min(q.x, b.x) / RC); ci <= Math.floor(Math.max(q.x, b.x) / RC); ci++)
      for (let cj = Math.floor(Math.min(q.z, b.z) / RC); cj <= Math.floor(Math.max(q.z, b.z) / RC); cj++) {
        const k = ci * 65536 + cj;
        if (!railCells.has(k)) railCells.set(k, []);
        railCells.get(k).push([ti, i]);
      }
  }));
  const xings = [], unders = [];
  for (const st of streets) {
    if (!st.drive && st.cls !== 'pedestrian') continue;            // тропинки и лестницы — не через пути
    const v = st.v;
    for (let i = 0; i + 1 < v.length; i++) {
      const a = v[i], b = v[i + 1], found = new Set();
      for (let ci = Math.floor(Math.min(a.x, b.x) / RC); ci <= Math.floor(Math.max(a.x, b.x) / RC); ci++)
        for (let cj = Math.floor(Math.min(a.z, b.z) / RC); cj <= Math.floor(Math.max(a.z, b.z) / RC); cj++)
          for (const [ti, k] of railCells.get(ci * 65536 + cj) || []) {
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

  /* ---------- выемки: рельеф игровой сетки опускается под нижние линии ---------- */
  const { X0, Z0, NX, NZ, S, H } = T, cuts = [];
  const carve = (line, halfAt) => {
    const v = line.v;
    for (let i = 0; i + 1 < v.length; i++) {
      const a = v[i], b = v[i + 1];
      if (!a.cut && !b.cut) continue;
      // откос: от края выемки вверх P.bank м на метр, пока не встретит рельеф
      const ha = halfAt(a), hb = halfAt(b), dip = Math.max(ground(a.x, a.z) - a.y, ground(b.x, b.z) - b.y, 0);
      const hm = Math.max(ha, hb) + 0.3 + dip / P.bank + S;
      const i0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - hm - X0) / S)), i1 = Math.min(NX - 1, Math.ceil((Math.max(a.x, b.x) + hm - X0) / S));
      const j0 = Math.max(0, Math.floor((Math.min(a.z, b.z) - hm - Z0) / S)), j1 = Math.min(NZ - 1, Math.ceil((Math.max(a.z, b.z) + hm - Z0) / S));
      const dx = b.x - a.x, dz = b.z - a.z, LL = dx * dx + dz * dz || 1;
      for (let jj = j0; jj <= j1; jj++) for (let ii = i0; ii <= i1; ii++) {
        const x = X0 + ii * S, z = Z0 + jj * S, t = clamp(((x - a.x) * dx + (z - a.z) * dz) / LL, 0, 1);
        const d = Math.hypot(x - a.x - dx * t, z - a.z - dz * t), hh = ha + (hb - ha) * t;
        const k = jj * NX + ii, y = a.y + (b.y - a.y) * t + Math.max(0, d - hh - 0.3) * P.bank;
        if (y < H[k]) H[k] = y;
      }
    }
    cuts.push(line);
  };
  for (const st of streets) if (st.v.some(q => q.cut)) carve(st, q => q.hw + Math.max(q.sw[0], q.sw[1]));
  for (const tr of tracks) if (tr.v.some(q => q.cut)) carve(tr, () => P.railHalf);
  // после выемок — высоты точек на рельефе заново (кроме настилов)
  for (const line of [...streets, ...tracks]) for (const q of line.v) if (!q.deck) q.y = ground(q.x, q.z);

  /* ---------- проезжая часть под точкой ---------- */
  const CC = 16, carr = new Map();
  for (const st of streets) {
    if (!st.drive && st.cls !== 'pedestrian') continue;
    st.v.forEach((a, i) => {
      if (i === st.v.length - 1) return;
      const b = st.v[i + 1], m = Math.max(a.hw, b.hw);
      for (let ci = Math.floor((Math.min(a.x, b.x) - m) / CC); ci <= Math.floor((Math.max(a.x, b.x) + m) / CC); ci++)
        for (let cj = Math.floor((Math.min(a.z, b.z) - m) / CC); cj <= Math.floor((Math.max(a.z, b.z) + m) / CC); cj++) {
          const k = ci * 65536 + cj;
          if (!carr.has(k)) carr.set(k, []);
          carr.get(k).push([st, i]);
        }
    });
  }
  // { st, i, t, d } — улица и место на ней, d — расстояние от оси; skip — эту улицу не считать; m — запас, м
  const carriageAt = (x, z, skip = null, m = 0) => {
    const list = carr.get(Math.floor(x / CC) * 65536 + Math.floor(z / CC));
    if (!list) return null;
    let best = null, bk = Infinity;
    for (const [st, i] of list) {
      if (st === skip) continue;
      const a = st.v[i], b = st.v[i + 1], dx = b.x - a.x, dz = b.z - a.z, LL = dx * dx + dz * dz || 1;
      const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / LL, 0, 1), d = Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
      const hw = a.hw + (b.hw - a.hw) * t + m;
      if (d < hw && d / hw < bk) { bk = d / hw; best = { st, i, t, d }; }
    }
    return best;
  };

  // отрезки проезжей части других улиц (не skip), задевающие прямоугольник: [[st, i], …]
  const carriageNear = (minX, maxX, minZ, maxZ, skip = null) => {
    const out = [], got = new Set();
    for (let ci = Math.floor(minX / CC); ci <= Math.floor(maxX / CC); ci++)
      for (let cj = Math.floor(minZ / CC); cj <= Math.floor(maxZ / CC); cj++)
        for (const e of carr.get(ci * 65536 + cj) || []) {
          const [st, i] = e;
          if (st === skip || got.has(e)) continue;
          got.add(e);
          const a = st.v[i], b = st.v[i + 1], m = Math.max(a.hw, b.hw);
          if (Math.min(a.x, b.x) - m > maxX || Math.max(a.x, b.x) + m < minX || Math.min(a.z, b.z) - m > maxZ || Math.max(a.z, b.z) + m < minZ) continue;
          out.push(e);
        }
    return out;
  };

  Object.assign(C, { streets, tracks, xings, unders, cuts, carriageAt, carriageNear,
    roadStats: { streets: streets.length, tracks: tracks.length, xings: xings.length, unders: unders.length, dips: unders.map(U => +U.dip.toFixed(1)) } });
}
