// Ситжес — РАСКЛАДКА: места калиток и ворот на заборах (этап 4а.3). После заборов (js/maps/sitges/fences.js:
// C.fences с участком lot, C.fenceLots) и их стилей (fencestyle.js: f.style, C.fenceLotCls). Данные — C.gateData
// (data-gates.js, конвейер tools/sitges/read-gates.js) и ворота OSM C.points.gate (data-points.js).
//   Фронт участка — его куски заборов. Проём (калитка, ворота) — на одном куске, не ближе end м к концу забора
//   (на разрезе по участкам — можно вплотную), к дуге угла и к отрезку не вдоль линии (доводка до стены дома,
//   ступенька между концами — fences.js), не через излом линии круче bend°; в запретном месте — сдвиг вдоль забора
//   не дальше shift м, иначе проёма нет. Проёмы не перекрываются.
//   Калитка (wicket, 1 м) — ближайшая к точке входа кадастра (Entrance своего участка) точка фронта: вход ≤ near м
//   от забора — src 'ent', near…far м — 'entFar' (вход у двери дома); калиток на участок — по одной на wicketPer м
//   фронта, не ближе wicketGap м друг к другу. Нет входа — нет калитки.
//   Ворота (car, 3–3,5 м): ворота OSM (barrier=gate…) ≤ snap м от забора — src 'osm' (у любого участка за забором);
//   служебный проезд OSM через границу участка — 'svc'; иначе у участка с домом и фронтом ≥ minFront м — окно
//   съезда по ортофото с лучшей оценкой (≥ thr) из проецирующихся на фронт ближе win м — 'win'. Ворота в ≤ pair м
//   от калитки участка — вплотную к ней через общий столб post м (пара, как на большинстве фото).
//   Створка leaf — одна на участок, по хешу контура (sitgesFenceHash, не R()): у ламелей — ламели цвета забора; иначе
//   по классу участка (old — дерево, у калитки — дверь; oldvilla — кованая, дерево; modern — ламели) и виду верха.
// C.gates — [{ x, z, n, w, kind: 'wicket' | 'car', leaf: { type, color }, parcel, src, f, s, pair }]: середина проёма
//   на линии забора, нормаль к участку, ширина, м; f — индекс в C.fences, s — середина от начала куска, м; pair —
//   индекс парного проёма в C.gates (−1 — нет). leaf.type: slats (ламели), wood (доски), wrought (кованая решётка),
//   mesh (сварная сетка), sheet (глухой лист), door (деревянная дверь старого города — только калитка).
// C.fenceStats.gates — сводка: участков с забором, калиток и ворот (по источникам), доли участков, пары, ширины, створки.
// Определяет: SITGES_GATE, sitgesPlanGates.
// Использует: sitgesCells, sitgesSeg, SITGES_SEG (js/maps/sitges/geom.js); sitgesFenceHash
//   (js/maps/sitges/fencestyle.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const SITGES_GATE = {
  wicket: 1.0,          // ширина калитки, м
  car: 3.5, carNarrow: 3.0, narrowFront: 10,   // ширина ворот; у фронта короче narrowFront — узкие
  post: 0.4,            // общий столб пары калитка + ворота, м
  near: 2.5, far: 12,   // вход кадастра ближе near — калитка у входа; near…far — ближайшая точка фронта
  wicketPer: 15, wicketGap: 4,
  minFront: 8,          // ворота по ортофото — у участков с фронтом не меньше
  win: 4,               // окно съезда — не дальше от забора своего участка, м
  snap: 3,              // ворота OSM, служебный проезд — не дальше от забора, м
  pair: 6,              // ворота ближе к калитке (просвет) — вплотную к ней
  end: 1,               // не ближе к концу забора и к дуге угла, м
  bend: 12,             // проём через излом линии — не круче, °
  shift: 3,             // проём в запретном месте — сдвиг вдоль забора не дальше, м
  gap: 0.2,             // просвет между проёмами (кроме пары), м
  // створка: по классу участка (если есть) или виду верха забора, доли %
  leafCls: { old: { wood: 100 }, oldvilla: { wrought: 60, wood: 40 }, modern: { slats: 60, sheet: 20, mesh: 20 } },
  leafTop: {
    heath: { slats: 40, wood: 35, wrought: 15, sheet: 10 }, hedge: { slats: 40, wood: 30, wrought: 20, sheet: 10 },
    mesh: { mesh: 70, slats: 30 }, grille: { wrought: 80, mesh: 20 }, wall: { wood: 50, sheet: 50 }, low: { wrought: 50, mesh: 50 },
  },
  leafColor: {
    slats: [[0x3b3f42, 60], [0xebebe6, 40]], wood: [[0x7a4a30, 60], [0x5e3a26, 40]], wrought: [[0x26292a, 75], [0xe6e4de, 25]],
    mesh: [[0x2e3a33, 60], [0x3a3c3c, 40]], sheet: [[0x3b3f42, 50], [0xebebe6, 30], [0x2d4a3c, 20]],
    door: [[0x2f4f7a, 35], [0x2f5a3a, 30], [0x6a4028, 35]],
  },
};

function sitgesPlanGates(C) {
  const { fences, fenceLine, fenceLots, fenceLotCls, parcels, gateData, points } = C, G = SITGES_GATE, t0 = performance.now();
  const cosB = Math.cos(G.bend * Math.PI / 180);

  /* ---------- куски заборов: длина по ломаной, запретные места ---------- */
  // у куска: S[k] — расстояние точки k от начала, lo / hi — допустимые края проёма, ban — запретные отрезки [a, b]
  const info = fences.map(f => {
    const { P, at, cut } = f, S = [0];
    for (let k = 1; k < P.length; k++) S.push(S[k - 1] + Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]));
    const L = S[S.length - 1], ban = [];
    for (let k = 0; k + 1 < P.length; k++) {
      const e = fenceLine[at[k + 1][0]];
      if (e.kind === 'corner') { ban.push([S[k] - G.end, S[k + 1] + G.end]); continue; }
      // отрезок не вдоль своей линии — доводка забора до стены дома, ступенька между концами (fences.js)
      const ux = P[k + 1][0] - P[k][0], uz = P[k + 1][1] - P[k][1], vx = e.B[0] - e.A[0], vz = e.B[1] - e.A[1], l = Math.hypot(ux, uz) * Math.hypot(vx, vz);
      if (l > 1e-9 && Math.abs(ux * vx + uz * vz) / l < cosB) ban.push([S[k] - G.end, S[k + 1] + G.end]);
    }
    for (let k = 1; k + 1 < P.length; k++) {
      const a = P[k - 1], b = P[k], c = P[k + 1], ux = b[0] - a[0], uz = b[1] - a[1], vx = c[0] - b[0], vz = c[1] - b[1];
      const l = Math.hypot(ux, uz) * Math.hypot(vx, vz);
      if (l > 1e-9 && (ux * vx + uz * vz) / l < cosB) ban.push([S[k], S[k]]);
    }
    return { S, L, lo: cut[0] ? 0.05 : G.end, hi: L - (cut[1] ? 0.05 : G.end), ban, open: [] };
  });
  // точка куска на расстоянии s от начала: положение и нормаль к участку
  const pointAt = (fi, s) => {
    const { P, N } = fences[fi], S = info[fi].S;
    let k = 0;
    while (k + 2 < P.length && S[k + 1] < s) k++;
    const t = Math.max(0, Math.min(1, (s - S[k]) / Math.max(1e-6, S[k + 1] - S[k])));
    const nx = N[k][0] + (N[k + 1][0] - N[k][0]) * t, nz = N[k][1] + (N[k + 1][1] - N[k][1]) * t, l = Math.hypot(nx, nz) || 1;
    return { x: P[k][0] + (P[k + 1][0] - P[k][0]) * t, z: P[k][1] + (P[k + 1][1] - P[k][1]) * t, n: [nx / l, nz / l] };
  };
  // проём [s − w/2, s + w/2] на куске fi помещается: в пределах lo…hi, не на запретном месте, не на других проёмах
  const fits = (fi, s, w, skip) => {
    const I = info[fi], a = s - w / 2, b = s + w / 2;
    if (a < I.lo || b > I.hi) return false;
    if (I.ban.some(([p, q]) => b > p && a < q)) return false;
    return !I.open.some(o => o !== skip && b > o.a - G.gap && a < o.b + G.gap);
  };
  // ближайшее к s место, где проём помещается (сдвиг ≤ shift), или null
  const place = (fi, s, w) => {
    for (let d = 0; d <= G.shift + 1e-6; d += 0.25) {
      if (fits(fi, s + d, w)) return s + d;
      if (d && fits(fi, s - d, w)) return s - d;
    }
    return null;
  };

  /* ---------- фронт участков и проекция точки на него ---------- */
  const front = new Map();   // участок → { fs: [индексы кусков], len }
  const segs = sitgesCells(8);
  fences.forEach((f, fi) => {
    if (f.lot < 0) return;
    const o = front.get(f.lot) || { fs: [], len: 0 };
    o.fs.push(fi); o.len += info[fi].L; front.set(f.lot, o);
    for (let k = 0; k + 1 < f.P.length; k++) {
      const a = f.P[k], b = f.P[k + 1];
      segs.add(Math.min(a[0], b[0]) - 1, Math.max(a[0], b[0]) + 1, Math.min(a[1], b[1]) - 1, Math.max(a[1], b[1]) + 1, { fi, k });
    }
  });
  const proj = (fi, x, z) => {
    const { P } = fences[fi], S = info[fi].S;
    let best = null;
    for (let k = 0; k + 1 < P.length; k++) {
      const d = sitgesSeg(x, z, P[k][0], P[k][1], P[k + 1][0], P[k + 1][1]);
      if (!best || d < best.d) best = { fi, d, s: S[k] + (S[k + 1] - S[k]) * SITGES_SEG.t };
    }
    return best;
  };
  // ближайшая точка фронта участка p (null — у участка нет забора)
  const projLot = (p, x, z) => {
    const o = front.get(p);
    if (!o) return null;
    let best = null;
    for (const fi of o.fs) { const q = proj(fi, x, z); if (!best || q.d < best.d) best = q; }
    return best;
  };
  // ближайший забор вообще (поиск в квадрате ± R по клеткам 8 м)
  const projAny = (x, z, R) => {
    let best = null;
    const seen = new Set();
    for (let dx = -R; dx <= R + 7.99; dx += 8) for (let dz = -R; dz <= R + 7.99; dz += 8)
      for (const { fi } of segs.at(x + Math.min(dx, R), z + Math.min(dz, R))) {
        if (seen.has(fi)) continue;
        seen.add(fi);
        const q = proj(fi, x, z);
        if (q.d <= R && (!best || q.d < best.d)) best = q;
      }
    return best;
  };

  /* ---------- створка участка: по хешу контура ---------- */
  const rnd = (h, k) => {
    let x = (h + Math.imul(k + 1, 0x9e3779b9)) >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x85ebca6b); x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
    return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
  };
  // выбор по долям: w — { ключ: доля } или [[значение, доля], …]
  const pick = (w, r) => {
    const ks = Array.isArray(w) ? w : Object.entries(w).map(([k, v]) => [k, v]);
    let sum = 0, acc = 0;
    for (const [, v] of ks) sum += v;
    for (const [k, v] of ks) { acc += v / sum; if (r < acc) return k; }
    return ks[ks.length - 1][0];
  };
  const leafOf = (p, fi, kind) => {
    const st = fences[fi].style, cls = (fenceLotCls && fenceLotCls[p]) || 'villa', h = sitgesFenceHash(parcels[p].ring);
    let type;
    if (st.top === 'slats') type = 'slats';
    else type = pick(G.leafCls[cls] || G.leafTop[st.top] || G.leafTop.heath, rnd(h, 10));
    if (kind === 'wicket' && cls === 'old' && type === 'wood') type = 'door';
    const color = st.top === 'slats' && type === 'slats' ? st.color : pick(G.leafColor[type], rnd(h, 11));
    return { type, color };
  };

  /* ---------- проёмы ---------- */
  const gates = [];
  const add = (p, fi, s, w, kind, src) => {
    const q = pointAt(fi, s), g = { x: q.x, z: q.z, n: q.n, w, kind, leaf: leafOf(p, fi, kind), parcel: p, src, f: fi, s, pair: -1 };
    info[fi].open.push({ a: s - w / 2, b: s + w / 2, g });
    gates.push(g);
    return g;
  };
  const st = { wicket: { ent: 0, entFar: 0 }, entNoFence: 0, entFar: 0, entNoPlace: 0, car: { osm: 0, svc: 0, win: 0 },
    osmPts: 0, osmOff: 0, svcOff: 0, winElig: 0, winNone: 0, carNoPlace: 0, pairs: 0 };

  // калитки: входы участка по расстоянию до фронта
  const entBy = new Map();
  for (const e of gateData.ent) {
    const q = projLot(e.p, e.x, e.z);
    if (!q) { st.entNoFence++; continue; }
    if (q.d > G.far) { st.entFar++; continue; }
    if (!entBy.has(e.p)) entBy.set(e.p, []);
    entBy.get(e.p).push(q);
  }
  const wickets = new Map();   // участок → калитки
  for (const [p, qs] of [...entBy].sort((a, b) => a[0] - b[0])) {
    qs.sort((a, b) => a.d - b.d || a.fi - b.fi || a.s - b.s);
    const max = Math.max(1, Math.floor(front.get(p).len / G.wicketPer)), mine = [];
    for (const q of qs) {
      if (mine.length >= max) break;
      if (mine.some(g => g.f === q.fi && Math.abs(g.s - q.s) < G.wicketGap)) continue;
      const s = place(q.fi, q.s, G.wicket);
      if (s === null) { st.entNoPlace++; continue; }
      const src = q.d <= G.near ? 'ent' : 'entFar';
      mine.push(add(p, q.fi, s, G.wicket, 'wicket', src)); st.wicket[src]++;
    }
    if (mine.length) wickets.set(p, mine);
  }

  // ворота-кандидаты по участкам: { fi, s, src, sc }
  const cand = new Map();
  const push = (p, c) => { if (!cand.has(p)) cand.set(p, []); cand.get(p).push(c); };
  for (const [x, z] of points.gate || []) {
    st.osmPts++;
    const q = projAny(x, z, G.snap);
    if (!q) { st.osmOff++; continue; }
    push(fences[q.fi].lot, { fi: q.fi, s: q.s, src: 'osm', sc: 2 });
  }
  for (const e of gateData.svc) {
    const q = projLot(e.p, e.x, e.z);
    if (!q || q.d > G.snap) { st.svcOff++; continue; }
    push(e.p, { fi: q.fi, s: q.s, src: 'svc', sc: 1.5 });
  }
  for (const e of gateData.win) {
    const L = fenceLots[e.p];
    if (e.sc < gateData.thr || !L || L.empty || L.bi < 0 || !front.has(e.p) || front.get(e.p).len < G.minFront) continue;
    const q = projLot(e.p, e.x, e.z);
    if (!q || q.d > G.win) continue;
    push(e.p, { fi: q.fi, s: q.s, src: 'win', sc: e.sc });
  }
  for (const p in fenceLots) {
    const L = fenceLots[p];
    if (!L.empty && L.bi >= 0 && front.has(+p) && front.get(+p).len >= G.minFront) { st.winElig++; if (!cand.has(+p)) st.winNone++; }
  }
  // на участок одни ворота: лучший кандидат, который помещается (OSM — раньше служебного проезда, тот — раньше окна)
  for (const [p, cs] of [...cand].sort((a, b) => a[0] - b[0])) {
    cs.sort((a, b) => b.sc - a.sc || a.fi - b.fi || a.s - b.s);
    const w = front.get(p).len < G.narrowFront ? G.carNarrow : G.car, ws = wickets.get(p) || [];
    let done = false;
    for (const c of cs) {
      // калитка рядом (просвет ≤ pair) — ворота вплотную к ней через общий столб, со стороны кандидата; не влезает —
      // с другой стороны; иначе — как есть
      const wk = ws.find(g => g.f === c.fi && Math.abs(g.s - c.s) - (g.w + w) / 2 <= G.pair);
      let s = null;
      if (wk) {
        const sg = c.s >= wk.s ? 1 : -1, off = wk.w / 2 + G.post + w / 2;
        for (const d of [sg, -sg]) if (s === null && fits(c.fi, wk.s + d * off, w)) s = wk.s + d * off;
      }
      const paired = s !== null;
      if (s === null) s = place(c.fi, c.s, w);
      if (s === null) continue;
      const g = add(p, c.fi, s, w, 'car', c.src);
      if (paired) { g.pair = gates.indexOf(wk); wk.pair = gates.length - 1; st.pairs++; }
      st.car[c.src]++; done = true;
      break;
    }
    if (!done) st.carNoPlace++;
  }

  /* ---------- сводка ---------- */
  const lots = Object.keys(fenceLots).length, carLots = new Set(), wLots = new Set(), widths = {}, leaves = {};
  for (const g of gates) {
    (g.kind === 'car' ? carLots : wLots).add(g.parcel);
    widths[g.w] = (widths[g.w] || 0) + 1;
    const k = g.kind + ':' + g.leaf.type;
    leaves[k] = (leaves[k] || 0) + 1;
  }
  const pct = v => Math.round(v / Math.max(1, lots) * 1000) / 10;
  C.gates = gates;
  C.fenceStats.gates = {
    lots, wickets: gates.filter(g => g.kind === 'wicket').length, wicketLots: wLots.size, wicketPct: pct(wLots.size),
    wicketSrc: st.wicket, entNoFence: st.entNoFence, entFar: st.entFar, entNoPlace: st.entNoPlace,
    cars: gates.filter(g => g.kind === 'car').length, carLots: carLots.size, carPct: pct(carLots.size), carSrc: st.car,
    osmPts: st.osmPts, osmOff: st.osmOff, svcOff: st.svcOff, winElig: st.winElig, winNone: st.winNone, carNoPlace: st.carNoPlace,
    pairs: st.pairs, widths, leaves, ms: Math.round(performance.now() - t0),
  };
}
