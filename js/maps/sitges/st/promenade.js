// Ситжес — этап 7, группа D: набережная (план — docs/sitges/stage-7.md, архив группы — docs/sitges/st-d.md).
// Что входит: подпорная стена между пляжем и променадом, лестницы и пандусы на пляж, ограда (по видам набережной),
// каменные скамьи с плиткой, мощение променада, черепичная кромка газона, души.
// Стена — по краю пляжей OSM (beach / sand) со стороны суши, где променад выше пляжа (лидар ICGC 50 см: ступень
// 1,3–3,8 м, пляж у стены 1,0–2,0 м над морем — st-d.md). Высота верха — рельеф в 5–12 м от края, низа — профиль пляжа.
// Рельеф (stPromTerrain, из sitgesPlanTerrain — js/maps/sitges/terrain.js, до улиц): пляж у стены опущен по профилю
// stPromCfg.beach; узлы ближе band м к стене с обеих сторон — на уровне пляжа (ровный низ у стены), за стеной до flat м —
// не ниже верха; ложбину за стеной (до flat м) накрывает настил (газон или мощение) со своей сеткой столкновений.
// Виды по участкам (stPromCfg.zone, по фото seafront/, sv/seafront, street/D): Ribera — белая балюстрада на стене,
// серая квадратная плитка; Passeig Marítim — кромка из черепицы на стене, газон, каменный валик с шарами на тумбах,
// узорная плитка у ограды и бетонная полоса; Sant Sebastià и восточнее — поручни из труб, светлый кирпич, бут.
// Спуски — где пешеходная дорожка OSM пересекает стену: ступени OSM (steps) — лестница поперёк стены, остальные —
// пандус вдоль стены (уклон 1 : 8), не влез — лестница.
// Договор (docs/sitges/stage-7.md, «Каркас»):
//   stPromTerrain(C) — раскладка стены и правка рельефа → C.prom = { walls: [{ pts: [[x, z, nx, nz, низ, верх]] }] }
//     (n — нормаль от пляжа к суше); вызывается из sitgesPlanTerrain после рельефа.
//   plan(C, S) → C.street.groups.D: { walls: [{ zone: [вид точки], pts, inE: [мощение до, м от стены], lawn: [газон до] }],
//     desc: [{ kind: 'stairs' | 'ramp', w: стена, a: длина вдоль стены, dir, x, z, nx, nz, low, top, len }],
//     gaps: [[стена, a0, a1, на линии ограды]], bench: [[x, z, ry, плитка]], shower: [[x, z, y]], stats }.
//   build(K, S, L) — меши (склейка по квадратам stPromCfg.chunk), экземпляры S.place, столкновения S.collider, S.walk.
// Стены, лестницы, пандусы, ограда и каменные скамьи — неподвижные; души — сбиваемые.
// Определяет: stPromCfg, stPromTerrain, stPromAt, SITGES_ST_D, stPromTexCache, stPromTex.
// Использует: clamp (js/core.js); smooth01, stdMat, mulberry32 (js/world.js); canvasTex (js/maps/city/textures.js);
//   sitgesBBox, sitgesInPoly, sitgesCells, sitgesSeg, SITGES_SEG (js/maps/sitges/geom.js); stFurnCfg
//   (js/maps/sitges/st/furniture.js); $ (js/ui.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const stPromCfg = {
  // вид участка по x: Ribera — от мыса с церковью до Calípolis, Marítim — дальше на запад, Sant Sebastià и восток
  zone: x => x > -30 ? 'mar' : x > -480 ? 'rib' : 'seb',
  // пляж у стены (лидар: 0,6–0,9 м в 5 м от воды, 1,0–1,5 в 15 м, 1,4–2,2 в 25–30 м): b0 + k·d, не выше max;
  // опускается ближе near м к стене полностью, до fade — плавно
  beach: { b0: 0.2, k: 0.07, max: 1.8, near: 20, fade: 32 },
  // step — шаг точек стены; min…max — ступень (выше — обрыв или склон, этап G); topIn — верх: рельеф в этих м от края;
  // band — узлы ближе к стене — на уровне низа; flat — за стеной до стольких м рельеф не ниже верха, deck — настил
  // (накрывает ложбину), raise — дальше рельеф прежний; ext — стена и настил за концом цепочки; t — толщина стены;
  // away — на 10 м в сушу от края море дальше хотя бы на столько (край вдоль берега)
  wall: { step: 2, min: 0.6, max: 4.5, topIn: [5, 12], band: 3.6, flat: 7.1, deck: 7.6, raise: 13, ext: 2, minLen: 10, join: 4.5, t: 0.45, bury: 0.5, away: 6 },
  lift: 0.025,                         // настил и мощение над рельефом (дорожки OSM — 0,03: они поверх)
  paveMax: 30,                         // мощение — до тротуара, проезжей части, дома или зелени, не дальше, м от стены
  endD: 3,                             // спуск — конец дорожки OSM ближе стольких м к стене
  tiles: 2.4,                          // Marítim: полоса узорной плитки у ограды, дальше бетон
  rail: { rib: 0.25, seb: 0.12 },      // ограда на стене: отступ от края, м
  balus: { h: 0.95, post: 3.0, n: 7 },  // балюстрада: высота, шаг тумб, балясин в пролёте
  roll: { post: 12, h: 0.55 },         // валик Marítim: шаг тумб с шарами, высота валика
  tube: { post: 2.0, h: 1.0 },         // поручни из труб
  stairs: { w: 2.4, rise: 0.17, tread: 0.3 },
  ramp: { w: 3.0, slope: 8, near: 6 }, // пандус: ширина, длина на метр высоты, не ближе near м к другому спуску
  chunk: 300, far: 900,                // склейка мешей по квадратам, м; квадрат скрыт дальше far м
  colors: {
    rib: { wall: '#cfc8ba', pave: '#9a9690', rail: '#f2efe8' },
    mar: { wall: '#d8c59a', pave: '#d9ccb2', rail: '#c9bfae', lawn: '#4f7134', conc: '#c9c6bf', tile: '#b5532e' },
    seb: { wall: '#d9cdb4', pave: '#dcd8d0', rail: '#e9eaea' },
    bench: ['#1d3f8f', '#4f8f2a'],      // плитка спинки: синяя с кремовой, зелёная с жёлтой (f-passeig-maritim-01, -02)
  },
};

/* ==================== раскладка: стена и рельеф (из sitgesPlanTerrain) ==================== */
function stPromTerrain(C) {
  const T = C.terra, P = stPromCfg, W = P.wall, Bp = P.beach, { H, sea, thin, dSea, beach, NX, NZ, S: GS, X0, Z0 } = T;
  const prof = d => Math.min(Bp.max, Bp.b0 + Bp.k * d);
  const beaches = C.areas.filter(a => a.kind === 'beach' || a.kind === 'sand'), boxes = beaches.map(a => sitgesBBox(a.ring));
  const inBeach = (x, z) => beaches.some((a, i) => { const b = boxes[i]; return x >= b[0] && x <= b[1] && z >= b[2] && z <= b[3] && sitgesInPoly(x, z, a.ring); });
  const isSea = (x, z) => C.waterAt(x, z) === 0, dS = (x, z) => dSea[T.cell(x, z)];

  /* ---------- точки края пляжей со стороны суши: где ступень — стена ---------- */
  let chains = [];
  for (const a of beaches) {
    const r = a.ring.slice();
    if (r.length > 3 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) r.pop();
    const pts = [];
    for (let i = 0; i < r.length; i++) {
      const [ax, az] = r[i], [bx, bz] = r[(i + 1) % r.length], L = Math.hypot(bx - ax, bz - az);
      if (L < 0.05) continue;
      let nx = -(bz - az) / L, nz = (bx - ax) / L;
      if (sitgesInPoly((ax + bx) / 2 + nx * 0.3, (az + bz) / 2 + nz * 0.3, r)) { nx = -nx; nz = -nz; }
      const m = Math.max(1, Math.ceil(L / W.step));
      for (let k = 0; k < m; k++) {
        const f = (k + 0.5) / m, x = ax + (bx - ax) * f, z = az + (bz - az) * f;
        // за краем суша (не море, не другой пляж), и край — вдоль берега: от него в сушу море дальше (у корней
        // волнорезов и вокруг построек на пляже край идёт поперёк берега — там стены нет)
        const land = !isSea(x + nx * 3, z + nz * 3) && !inBeach(x + nx * 3, z + nz * 3) && !isSea(x + nx * 8, z + nz * 8) && !inBeach(x + nx * 8, z + nz * 8)
          && dS(x, z) >= 3 && dS(x + nx * 10, z + nz * 10) - dS(x, z) >= W.away;
        const hs = [];
        for (let d = W.topIn[0]; d <= W.topIn[1]; d++) hs.push(C.ground(x + nx * d, z + nz * d));
        const top = hs.sort((u, v) => u - v)[hs.length >> 1];          // медиана: за променадом бывает склон
        const foot = prof(dS(x - nx, z - nz)), st = top - foot;
        pts.push({ x, z, nx, nz, foot, top, ok: land && st >= W.min && st <= W.max });
      }
    }
    let i0 = pts.findIndex(p => !p.ok), cur = null;
    if (i0 < 0) i0 = 0;
    for (let q = 0; q < pts.length; q++) {
      const p = pts[(i0 + q) % pts.length];
      if (!p.ok) { cur = null; continue; }
      if (!cur) chains.push(cur = []);
      cur.push(p);
    }
  }
  // цепочки соседних пляжей, сходящиеся концами, — одна стена
  const end = (c, e) => e ? c[c.length - 1] : c[0];
  for (let merged = true; merged;) {
    merged = false;
    for (let i = 0; i < chains.length && !merged; i++) for (let j = 0; j < chains.length && !merged; j++) {
      if (i === j) continue;
      const a = chains[i], b = chains[j];
      for (const ea of [1, 0]) for (const eb of [0, 1]) {
        const p = end(a, ea), q = end(b, eb);
        if (merged || Math.hypot(p.x - q.x, p.z - q.z) > W.join || p.nx * q.nx + p.nz * q.nz < 0.3) continue;
        chains[i] = (ea ? a : a.slice().reverse()).concat(eb ? b.slice().reverse() : b); chains.splice(j, 1); merged = true;
      }
    }
  }
  // верх — медиана по 5 точкам; нормаль — по соседям (сглаженная), длина вдоль
  const walls = [];
  for (const c of chains) {
    let len = 0;
    for (let i = 1; i < c.length; i++) len += Math.hypot(c[i].x - c[i - 1].x, c[i].z - c[i - 1].z);
    if (len < W.minLen || c.length < 3) continue;
    const tops = c.map((p, i) => { const w = c.slice(Math.max(0, i - 2), i + 3).map(q => q.top).sort((u, v) => u - v); return w[w.length >> 1]; });
    const pts = c.map((p, i) => {
      const a = c[Math.max(0, i - 2)], b = c[Math.min(c.length - 1, i + 2)], L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      let nx = -(b.z - a.z) / L, nz = (b.x - a.x) / L;
      if (nx * p.nx + nz * p.nz < 0) { nx = -nx; nz = -nz; }
      return [p.x, p.z, nx, nz, p.foot, Math.max(tops[i], p.foot + W.min)];
    });
    walls.push({ pts });
  }

  /* ---------- рельеф у стены: ближайший отрезок стены у каждого узла ---------- */
  const near = new Map();
  for (const w of walls) {
    const p = w.pts, n = p.length;
    for (let i = 0; i + 1 < n; i++) {
      const [ax, az, anx, anz, af, at] = p[i], [bx, bz, bnx, bnz, bf, bt] = p[i + 1];
      const L = Math.hypot(bx - ax, bz - az) || 1e-6, R = Bp.fade;
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - R - X0) / GS)), i1 = Math.min(NX - 1, Math.ceil((Math.max(ax, bx) + R - X0) / GS));
      const j0 = Math.max(0, Math.floor((Math.min(az, bz) - R - Z0) / GS)), j1 = Math.min(NZ - 1, Math.ceil((Math.max(az, bz) + R - Z0) / GS));
      for (let j = j0; j <= j1; j++) for (let ii = i0; ii <= i1; ii++) {
        const k = j * NX + ii, x = X0 + ii * GS, z = Z0 + j * GS;
        const tr = ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / (L * L), t = clamp(tr, 0, 1);
        const cx = ax + (bx - ax) * t, cz = az + (bz - az) * t, d = Math.hypot(x - cx, z - cz);
        const o = near.get(k);
        if (o && o.d <= d) continue;
        const nx = anx + (bnx - anx) * t, nz = anz + (bnz - anz) * t;
        // за концом цепочки — не дальше ext м (там ещё стена и настил)
        const over = tr < 0 && i === 0 ? -tr * L : tr > 1 && i + 2 === n ? (tr - 1) * L : 0;
        near.set(k, { d, s: (x - cx) * nx + (z - cz) * nz, foot: af + (bf - af) * t, top: at + (bt - at) * t, inside: over <= W.ext && (t > 0 && t < 1 || over > 0 || d < 0.5 * GS) });
      }
    }
  }
  let low = 0, band = 0, up = 0;
  for (const [k, o] of near) {
    if (sea[k] || thin[k]) continue;
    const h = H[k];
    if (o.inside && Math.abs(o.s) <= W.band) { H[k] = o.s <= 0 ? Math.min(h, o.foot, prof(dSea[k])) : o.foot; band++; }
    else if (o.inside && o.s > 0 && o.s <= W.raise) { const v = Math.max(h, o.top + (h - o.top) * smooth01((o.s - W.flat) / (W.raise - W.flat))); if (v > h) up++; H[k] = v; }
    else if (o.s < 0 && (beach[k] || o.inside)) {
      const p = prof(dSea[k]), w = 1 - smooth01((o.d - Bp.near) / (Bp.fade - Bp.near));
      if (h > p && w > 0) { H[k] = h - (h - p) * w; low++; }
    }
  }
  let len = 0;
  for (const w of walls) for (let i = 1; i < w.pts.length; i++) len += Math.hypot(w.pts[i][0] - w.pts[i - 1][0], w.pts[i][1] - w.pts[i - 1][1]);
  C.prom = { walls, stats: { walls: walls.length, len: Math.round(len), low, band, up } };
}

// точка стены на длине a (м вдоль): { x, z, nx, nz, foot, top, i, t } — по точкам w.pts и длинам w.a (за концами — продолжение)
function stPromAt(w, a) {
  const p = w.pts, A = w.a, n = p.length;
  let i = 0;
  if (a >= A[n - 1]) i = n - 2;
  else if (a > 0) { let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (A[m] <= a) lo = m; else hi = m; } i = lo; }
  const q = p[i], r = p[i + 1], L = A[i + 1] - A[i] || 1e-6, t = (a - A[i]) / L, u = clamp(t, 0, 1);
  let nx = q[2] + (r[2] - q[2]) * u, nz = q[3] + (r[3] - q[3]) * u;
  const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
  return { x: q[0] + (r[0] - q[0]) * t, z: q[1] + (r[1] - q[1]) * t, nx, nz, foot: q[4] + (r[4] - q[4]) * u, top: q[5] + (r[5] - q[5]) * u, i, t: u };
}

/* ==================== группа D ==================== */
const SITGES_ST_D = {
  id: 'D', name: 'набережная', ready: true,

  plan(C, S) {
    const P = stPromCfg, W = P.wall, r2 = v => Math.round(v * 100) / 100, walls = (C.prom && C.prom.walls) || [];
    const greens = C.areas.filter(a => a.kind === 'park' || a.kind === 'garden' || a.kind === 'grass'), gb = greens.map(a => sitgesBBox(a.ring));
    const inGreen = (x, z) => greens.some((a, i) => { const b = gb[i]; return x >= b[0] && x <= b[1] && z >= b[2] && z <= b[3] && sitgesInPoly(x, z, a.ring); });
    const inHouse = (x, z) => C.partCells.at(x, z).some(o => x >= o.bb[0] && x <= o.bb[1] && z >= o.bb[2] && z <= o.bb[3] && sitgesInPoly(x, z, o.r));
    const out = { walls: [], desc: [], gaps: [], paths: [], bench: [], shower: [], stats: {} };

    /* ---------- стены: вид по точкам, газон, мощение ---------- */
    walls.forEach(w0 => {
      const p = w0.pts, a = [0];
      for (let i = 1; i < p.length; i++) a.push(a[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
      const zone = p.map(q => P.zone(q[0]));
      // газон Marítim: настил, дальше — пока зелень OSM (не дальше 20 м); ограда — на его краю
      const lawn = p.map((q, i) => {
        if (zone[i] !== 'mar') return 0;
        let e = W.deck;
        for (let o = W.deck; o <= 20 && inGreen(q[0] + q[2] * o, q[1] + q[3] * o); o += 0.5) e = o;
        return e;
      });
      // мощение: от газона (или стены) до проезжей части, тротуара, дома, воды, зелени — не дальше paveMax
      const raw = p.map((q, i) => {
        const o0 = Math.max(W.deck, lawn[i]);
        let e = o0;
        for (let o = o0; o <= P.paveMax; o += 0.5) {
          const x = q[0] + q[2] * o, z = q[1] + q[3] * o;
          if (S.carriage(x, z) || S.onWalk(x, z) || inHouse(x, z) || C.waterAt(x, z) === 0 || (o > o0 + 1 && inGreen(x, z))) break;
          e = o;
        }
        return e;
      });
      // без пилы: минимум по ±2 точкам, потом среднее по ±1
      const mn = raw.map((v, i) => Math.min(...raw.slice(Math.max(0, i - 2), i + 3)));
      const inE = mn.map((v, i) => { const s = mn.slice(Math.max(0, i - 1), i + 2); return r2(Math.max(W.deck, lawn[i], s.reduce((x, y) => x + y, 0) / s.length)); });
      out.walls.push({ zone, pts: p.map(q => q.map(r2)), a: a.map(r2), lawn: lawn.map(r2), inE });
    });
    const LW = out.walls;

    /* ---------- спуски: пешеходные дорожки OSM через стену ---------- */
    const segs = sitgesCells(16);
    LW.forEach((w, wi) => w.pts.forEach((q, i) => {
      if (i + 1 >= w.pts.length) return;
      const r = w.pts[i + 1];
      segs.add(Math.min(q[0], r[0]), Math.max(q[0], r[0]), Math.min(q[1], r[1]), Math.max(q[1], r[1]), [wi, i]);
    }));
    // пересечение отрезков a–b (дорожка) и c–d (стена) → доли [u, v] или null
    const cross = (ax, az, bx, bz, cx, cz, dx, dz) => {
      const ex = bx - ax, ez = bz - az, fx = dx - cx, fz = dz - cz, den = ex * fz - ez * fx;
      if (Math.abs(den) < 1e-9) return null;
      const u = ((cx - ax) * fz - (cz - az) * fx) / den, v = ((cx - ax) * ez - (cz - az) * ex) / den;
      return u >= 0 && u <= 1 && v >= 0 && v <= 1 ? [u, v] : null;
    };
    // пересечения дорожки с линиями стен, сдвинутыми на off(w, i) м по нормали
    const hits = (ax, az, bx, bz, off) => {
      const res = [], seen = new Set();
      segs.each(Math.min(ax, bx) - 21, Math.max(ax, bx) + 21, Math.min(az, bz) - 21, Math.max(az, bz) + 21, l => {
        for (const [wi, i] of l) {
          const k = wi * 65536 + i;
          if (seen.has(k)) continue;
          seen.add(k);
          const w = LW[wi], q = w.pts[i], r = w.pts[i + 1], oq = off(w, i), or = off(w, i + 1);
          if (oq === null || or === null) continue;
          const h = cross(ax, az, bx, bz, q[0] + q[2] * oq, q[1] + q[3] * oq, r[0] + r[2] * or, r[1] + r[3] * or);
          if (h) res.push({ wi, i, u: h[0], a: w.a[i] + (w.a[i + 1] - w.a[i]) * h[1] });
        }
      });
      return res;
    };
    const ways = C.streets.filter(st => !st.drive && /^(footway|steps|path|pedestrian|track)$/.test(st.cls));
    const cand = [], railX = [];
    for (const st of ways) for (let i = 0; i + 1 < st.v.length; i++) {
      const A = st.v[i], B = st.v[i + 1];
      for (const h of hits(A.x, A.z, B.x, B.z, () => 0)) {
        const q = LW[h.wi].pts[h.i], L = Math.hypot(B.x - A.x, B.z - A.z) || 1;
        let dx = (B.x - A.x) / L, dz = (B.z - A.z) / L;          // направление дорожки к морю (против нормали стены)
        if (dx * q[2] + dz * q[3] > 0) { dx = -dx; dz = -dz; }
        cand.push({ ...h, st, steps: st.cls === 'steps', dx, dz });
      }
      for (const h of hits(A.x, A.z, B.x, B.z, (w, j) => w.zone[j] === 'mar' ? w.lawn[j] : null)) railX.push(h);
    }
    // дорожка кончается у стены (OSM обрывает их у края пляжа): конец ближе endD м, последний отрезок — к морю
    for (const st of ways) for (const e of [0, 1]) {
      if (cand.some(c => c.st === st)) break;
      const v = e ? st.v[st.v.length - 1] : st.v[0], u = e ? st.v[st.v.length - 2] : st.v[1], L = Math.hypot(v.x - u.x, v.z - u.z) || 1;
      let best = null;
      segs.each(v.x - 4, v.x + 4, v.z - 4, v.z + 4, l => {
        for (const [wi, i] of l) {
          const w = LW[wi], q = w.pts[i], r = w.pts[i + 1], d = sitgesSeg(v.x, v.z, q[0], q[1], r[0], r[1]), t = SITGES_SEG.t;
          if (d < P.endD && (!best || d < best.d)) best = { d, wi, i, a: w.a[i] + (w.a[i + 1] - w.a[i]) * t, q };
        }
      });
      if (!best) continue;
      const dx = (v.x - u.x) / L, dz = (v.z - u.z) / L;
      if (dx * best.q[2] + dz * best.q[3] > -0.4) continue;
      cand.push({ wi: best.wi, i: best.i, a: best.a, st, steps: st.cls === 'steps', dx, dz });
    }
    // одна дорожка — один спуск: ближе 8 м на той же стене — тот же (ступени важнее)
    cand.sort((p, q) => (q.steps - p.steps) || p.wi - q.wi || p.a - q.a);
    const used = [];
    for (const c of cand) if (!used.some(u => u.wi === c.wi && Math.abs(u.a - c.a) < 8)) used.push(c);
    used.sort((p, q) => p.wi - q.wi || p.a - q.a);
    // касательная стены у точки i (в сторону роста длины a)
    const tanAt = (w, i) => { const j = Math.min(i, w.pts.length - 2), q = w.pts[j], r = w.pts[j + 1], l = Math.hypot(r[0] - q[0], r[1] - q[1]) || 1; return [(r[0] - q[0]) / l, (r[1] - q[1]) / l]; };
    const SP = P.stairs, RP = P.ramp, stat = { stairs: 0, ramps: 0, skip: 0 };
    for (const c of used) {
      const w = LW[c.wi], A = w.a[w.a.length - 1], at = stPromAt(w, c.a), drop = at.top - at.foot;
      const others = out.desc.filter(d => d.w === c.wi);
      let kind = c.steps || c.st.surf !== 'concrete' ? 'stairs' : 'ramp', dir = 0, len = 0;
      if (kind === 'ramp') {
        len = Math.max(4, drop * RP.slope);
        const [tx, tz] = tanAt(w, at.i), pref = c.dx * tx + c.dz * tz >= 0 ? 1 : -1;
        for (const d of [pref, -pref]) {
          const a1 = c.a + d * len, lo = Math.min(c.a, a1) - RP.near, hi = Math.max(c.a, a1) + RP.near;
          if (a1 < 1 || a1 > A - 1 || others.some(o => o.a1 > lo && o.a0 < hi)) continue;
          const e = stPromAt(w, a1);
          if (C.waterAt(e.x - e.nx * (RP.w + 0.6), e.z - e.nz * (RP.w + 0.6)) === 0) continue;
          dir = d; break;
        }
        if (!dir) kind = 'stairs';
      }
      if (kind === 'stairs') {
        len = Math.max(2, Math.ceil(drop / SP.rise)) * SP.tread;
        if (C.waterAt(at.x - at.nx * (len + 0.5), at.z - at.nz * (len + 0.5)) === 0 || others.some(o => o.a1 > c.a - SP.w && o.a0 < c.a + SP.w)) { stat.skip++; continue; }
      }
      const a0 = kind === 'ramp' ? Math.min(c.a, c.a + dir * len) : c.a - SP.w / 2, a1 = kind === 'ramp' ? Math.max(c.a, c.a + dir * len) : c.a + SP.w / 2;
      out.desc.push({ kind, w: c.wi, a: r2(c.a), dir, a0: r2(a0), a1: r2(a1), x: r2(at.x), z: r2(at.z), nx: r2(at.nx), nz: r2(at.nz), low: r2(at.foot), top: r2(at.top), len: r2(len) });
      stat[kind === 'ramp' ? 'ramps' : 'stairs']++;
      // проём в ограде на стене (Ribera, Sant Sebastià): у лестницы — её ширина, у пандуса — верхний конец
      const g0 = kind === 'ramp' ? (dir > 0 ? c.a : c.a - RP.w - 0.4) : c.a - SP.w / 2 - 0.2, g1 = kind === 'ramp' ? (dir > 0 ? c.a + RP.w + 0.4 : c.a) : c.a + SP.w / 2 + 0.2;
      out.gaps.push([c.wi, r2(g0), r2(g1), 0]);
      // занято: лестница — поперёк стены на пляж, пандус — вдоль стены
      if (kind === 'stairs') S.reserve(at.x - at.nx * len / 2, at.z - at.nz * len / 2, SP.w / 2 + 0.3, 'D', at.x - at.nx * len, at.z - at.nz * len);
      else for (let s = a0; s < a1; s += 4) {
        const e = stPromAt(w, s), f = stPromAt(w, Math.min(a1, s + 4)), o = RP.w / 2 + 0.25;
        S.reserve(e.x - e.nx * o, e.z - e.nz * o, RP.w / 2 + 0.3, 'D', f.x - f.nx * o, f.z - f.nz * o);
      }
    }
    // Marítim: проём в валике, где дорожка пересекает линию ограды; от проёма к спуску — дорожка по газону
    for (const h of railX) {
      if (out.gaps.some(g => g[0] === h.wi && g[3] === 1 && Math.abs((g[1] + g[2]) / 2 - h.a) < 4)) continue;
      out.gaps.push([h.wi, r2(h.a - 1.6), r2(h.a + 1.6), 1]);
      const d = out.desc.find(e => e.w === h.wi && Math.abs(e.a - h.a) < 12);
      if (d) out.paths.push([h.wi, r2(h.a), r2(d.kind === 'ramp' ? (d.dir > 0 ? d.a0 + RP.w / 2 : d.a1 - RP.w / 2) : d.a)]);
    }

    /* ---------- каменные скамьи Passeig Marítim (точки OSM) и души ---------- */
    const nearWall = (x, z, R) => {
      let best = null;
      LW.forEach((w, wi) => w.pts.forEach((q, i) => {
        const d = Math.hypot(x - q[0], z - q[1]);
        if (d < R && (!best || d < best.d)) best = { d, wi, i, q, s: (x - q[0]) * q[2] + (z - q[1]) * q[3] };
      }));
      return best;
    };
    const pts = C.points || {};
    // точки — те, что группа C отдала D (бордюр Passeig Marítim ближе 8 м: stFurnCfg.noBench)
    for (const [x, z] of pts.bench || []) {
      const cb = S.nearest('curbs', x, z, 8), b = nearWall(x, z, 45);
      if (!cb || !stFurnCfg.noBench.test(C.streets[cb.seg.si].name || '') || !b) continue;
      out.bench.push([r2(x), r2(z), r2(Math.atan2(-b.q[2], -b.q[3])), out.bench.length % 2]);
      S.reserve(x, z, 1.4, 'D');
    }
    for (const [x0, z0] of pts.shower || []) {
      let x = x0, z = z0;
      const b = nearWall(x, z, 10);
      if (b && b.s < 0) {                                  // у стены — вплотную к ней
        const w = LW[b.wi], [tx, tz] = tanAt(w, b.i), e = stPromAt(w, w.a[b.i] + (x - b.q[0]) * tx + (z - b.q[1]) * tz);
        x = e.x - e.nx * 1.0; z = e.z - e.nz * 1.0;
      }
      const sp = S.near(x, z, 1, 0, 0.7, 0, 0.6, 4) || [x, z];
      out.shower.push([r2(sp[0]), r2(sp[1])]);
      S.reserve(sp[0], sp[1], 0.7, 'D');
    }
    let len = 0;
    for (const w of LW) len += w.a[w.a.length - 1];
    out.stats = { walls: LW.length, len: Math.round(len), ...stat, gaps: out.gaps.length, paths: out.paths.length, bench: out.bench.length, shower: out.shower.length };
    return out;
  },

  build(K, S, L) {
    if (!L || !L.walls.length) return;
    const P = stPromCfg, W = P.wall, CO = P.colors, lift = P.lift, D = K.D, g = (x, z) => D.ground(x, z), T = stPromTex();
    const st = K.stStats.D || (K.stStats.D = { n: 0, tris: 0, meshes: 0, brk: 0, lights: 0 });
    const mat = (hex, map, o = {}) => { const m = stdMat(hex, Object.assign({ map, roughness: 0.92 }, o)); m.userData.shared = true; return m; };
    const M = {
      wall_rib: mat('#ffffff', T.ashlar), wall_mar: mat('#ffffff', T.plaster), wall_seb: mat('#ffffff', T.rubble),
      pave_rib: mat('#ffffff', T.squares), pave_seb: mat('#ffffff', T.bricks), tile: mat('#ffffff', T.hydraulic), conc: mat('#ffffff', T.concrete),
      lawn: mat('#ffffff', T.lawn, { roughness: 1 }), coping: mat('#ffffff', T.coping, { alphaTest: 0.5, side: THREE.DoubleSide }),
      white: S.mat(CO.rib.rail, { roughness: 0.8 }), roll: S.mat(CO.mar.rail, { roughness: 0.9 }), steel: S.mat(CO.seb.rail, { roughness: 0.35, metalness: 0.7 }),
      step: mat('#ffffff', T.ashlar), ramp: mat('#ffffff', T.concrete),
    };
    const shadow = new Set(['wall_rib', 'wall_mar', 'wall_seb', 'white', 'roll', 'steel', 'step', 'ramp']);

    /* ---------- копилка мешей по квадратам и материалам ---------- */
    const bufs = new Map();
    const poly = (mk, vs, uv, hint) => {                // вершины [x, y, z] по кругу, uv [[u, v]], hint — куда нормаль
      const [a, b, c] = vs;
      let nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      const l = Math.hypot(nx, ny, nz);
      if (l < 1e-9) return;
      nx /= l; ny /= l; nz /= l;
      if (nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) { vs = vs.slice().reverse(); uv = uv.slice().reverse(); nx = -nx; ny = -ny; nz = -nz; }
      const cx = vs.reduce((s, v) => s + v[0], 0) / vs.length, cz = vs.reduce((s, v) => s + v[2], 0) / vs.length;
      const key = mk + '|' + Math.floor(cx / P.chunk) + ',' + Math.floor(cz / P.chunk);
      let B = bufs.get(key);
      if (!B) bufs.set(key, B = { mk, p: [], n: [], u: [], i: [] });
      const o = B.p.length / 3;
      vs.forEach((v, k) => { B.p.push(v[0], v[1], v[2]); B.n.push(nx, ny, nz); B.u.push(uv[k][0], uv[k][1]); });
      for (let k = 1; k + 1 < vs.length; k++) B.i.push(o, o + k, o + k + 1);
    };
    const UP = [0, 1, 0];
    // своя сетка столкновений и поверхности
    const cv = [], ci = [];
    const cquad = (a, b, c, d) => { const o = cv.length / 3; cv.push(...a, ...b, ...c, ...d); ci.push(o, o + 1, o + 2, o, o + 2, o + 3); };
    // брус вдоль ломаной: a, b — [x, z, низ], нормаль (nx, nz) к суше, h — высота, hw — полутолщина; верх и две грани
    const beam = (mk, a, b, h, hw, uA = 0, uB = 1) => {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 0.02) return;
      const px = -(b[1] - a[1]) / L * hw, pz = (b[0] - a[0]) / L * hw;
      const A0 = [a[0] + px, a[1] + pz], A1 = [a[0] - px, a[1] - pz], B0 = [b[0] + px, b[1] + pz], B1 = [b[0] - px, b[1] - pz];
      poly(mk, [[A0[0], a[2] + h, A0[1]], [B0[0], b[2] + h, B0[1]], [B1[0], b[2] + h, B1[1]], [A1[0], a[2] + h, A1[1]]], [[uA, 0], [uB, 0], [uB, 1], [uA, 1]], UP);
      for (const [E, F, sg] of [[A0, B0, 1], [A1, B1, -1]])
        poly(mk, [[E[0], a[2], E[1]], [F[0], b[2], F[1]], [F[0], b[2] + h, F[1]], [E[0], a[2] + h, E[1]]], [[uA, 0], [uB, 0], [uB, h], [uA, h]], [px * sg, 0, pz * sg]);
    };
    const gapAt = (wi, a, line) => L.gaps.some(G => G[0] === wi && G[3] === line && a > G[1] && a < G[2]);
    const posts = { bal: [], balu: [], roll: [], ball: [], tube: [] };

    /* ---------- стены, кромка, настил, мощение, ограда ---------- */
    L.walls.forEach((w, wi) => {
      const p = w.pts, n = p.length, A = w.a;
      // продолжение за концами на ext м (там ещё ложбина в рельефе — stPromTerrain)
      const ext = (q, r, d) => { const l = Math.hypot(q[0] - r[0], q[1] - r[1]) || 1; return [q[0] + (q[0] - r[0]) / l * d, q[1] + (q[1] - r[1]) / l * d, q[2], q[3], q[4], q[5]]; };
      const pts = [ext(p[0], p[1], W.ext), ...p, ext(p[n - 1], p[n - 2], W.ext)], aa = [-W.ext, ...A, A[n - 1] + W.ext];
      const idx = k => clamp(k - 1, 0, n - 1);                   // точка pts → индекс в w.* (вид, газон, мощение)
      const at = (k, o) => [pts[k][0] + pts[k][2] * o, pts[k][1] + pts[k][3] * o];
      for (let k = 0; k + 1 < pts.length; k++) {
        const q = pts[k], r = pts[k + 1], zone = w.zone[idx(k)], a0 = aa[k], a1 = aa[k + 1], am = (a0 + a1) / 2;
        const fq = q[4] - W.bury, fr = r[4] - W.bury, tq = q[5], tr = r[5], nh = [-(q[2] + r[2]) / 2, 0, -(q[3] + r[3]) / 2];
        // лицо стены (к морю)
        const wk = 'wall_' + zone;
        poly(wk, [[q[0], fq, q[1]], [r[0], fr, r[1]], [r[0], tr, r[1]], [q[0], tq, q[1]]], [[a0 / 3, fq / 3], [a1 / 3, fr / 3], [a1 / 3, tr / 3], [a0 / 3, tq / 3]], nh);
        // столкновения: лицо до верха ограды на стене (в проёмах — до верха стены), настил
        const rh = zone === 'mar' || gapAt(wi, am, 0) ? 0.05 : zone === 'rib' ? P.balus.h : P.tube.h;
        cquad([q[0], q[4] - 1, q[1]], [r[0], r[4] - 1, r[1]], [r[0], tr + rh, r[1]], [q[0], tq + rh, q[1]]);
        const [qx, qz] = at(k, W.deck), [rx, rz] = at(k + 1, W.deck);
        cquad([q[0], tq + lift, q[1]], [r[0], tr + lift, r[1]], [rx, tr + lift, rz], [qx, tq + lift, qz]);
        S.walk([[q[0], q[1]], [r[0], r[1]], [rx, rz], [qx, qz]], [tq + lift, tr + lift, tr + lift, tq + lift]);
        // настил и мощение: ряды поперёк; до deck — ровно на верху стены (над ложбиной), дальше — по рельефу
        const yAt = (x, z, o, top) => (o <= W.deck + 0.01 ? Math.max(top, g(x, z)) : g(x, z)) + lift;
        const strip = (mk, o0q, o1q, o0r, o1r, size, du = 0) => {
          const m = Math.max(1, Math.ceil(Math.max(o1q - o0q, o1r - o0r) / 2.2)), rows = [];
          for (let j = 0; j <= m; j++) {
            const oq = o0q + (o1q - o0q) * j / m, or = o0r + (o1r - o0r) * j / m;
            const [x0, z0] = at(k, oq), [x1, z1] = at(k + 1, or);
            rows.push([[x0, yAt(x0, z0, oq, tq), z0, oq], [x1, yAt(x1, z1, or, tr), z1, or]]);
          }
          for (let j = 0; j < m; j++) {
            const [A0, B0] = rows[j], [A1, B1] = rows[j + 1];
            poly(mk, [A0.slice(0, 3), B0.slice(0, 3), B1.slice(0, 3), A1.slice(0, 3)],
              [[a0 / size, (A0[3] - du) / size], [a1 / size, (B0[3] - du) / size], [a1 / size, (B1[3] - du) / size], [a0 / size, (A1[3] - du) / size]], UP);
          }
        };
        const eq = w.inE[idx(k)], er = w.inE[idx(k + 1)];
        if (zone === 'mar') {
          const lq = w.lawn[idx(k)], lr = w.lawn[idx(k + 1)];
          strip('lawn', 0, W.deck, 0, W.deck, 4);
          const tq2 = Math.min(eq, lq + P.tiles), tr2 = Math.min(er, lr + P.tiles);
          strip('tile', lq, tq2, lr, tr2, 1);
          if (eq > tq2 + 0.3 || er > tr2 + 0.3) strip('conc', tq2, Math.max(eq, tq2), tr2, Math.max(er, tr2), 4);
          // кромка из черепицы: скат от газона к краю и фестон над лицом стены (у спусков — нет)
          if (!gapAt(wi, am, 0)) {
          const c0q = at(k, 0.4), c0r = at(k + 1, 0.4), c1q = at(k, -0.07), c1r = at(k + 1, -0.07);
          poly('coping', [[c0q[0], tq + lift + 0.03, c0q[1]], [c0r[0], tr + lift + 0.03, c0r[1]], [c1r[0], tr - 0.08, c1r[1]], [c1q[0], tq - 0.08, c1q[1]]], [[a0 / 0.5, 0], [a1 / 0.5, 0], [a1 / 0.5, 0.6], [a0 / 0.5, 0.6]], [nh[0], 1.5, nh[2]]);
          poly('coping', [[c1q[0], tq - 0.08, c1q[1]], [c1r[0], tr - 0.08, c1r[1]], [c1r[0], tr - 0.2, c1r[1]], [c1q[0], tq - 0.2, c1q[1]]], [[a0 / 0.5, 0.6], [a1 / 0.5, 0.6], [a1 / 0.5, 1], [a0 / 0.5, 1]], nh);
          }
          // валик на краю газона (в проёмах дорожек — нет): основание и труба
          if (!gapAt(wi, am, 1)) {
            const [x0, z0] = at(k, lq), [x1, z1] = at(k + 1, lr), y0 = g(x0, z0) + lift, y1 = g(x1, z1) + lift;
            beam('roll', [x0, z0, y0], [x1, z1, y1], 0.16, 0.2);
            beam('roll', [x0, z0, y0 + 0.16], [x1, z1, y1 + 0.16], P.roll.h - 0.16, 0.15);
            cquad([x0, y0 - 0.5, z0], [x1, y1 - 0.5, z1], [x1, y1 + P.roll.h, z1], [x0, y0 + P.roll.h, z0]);
          }
        } else {
          strip('pave_' + zone, 0, W.deck, 0, W.deck, 1.6);
          if (eq > W.deck + 0.3 || er > W.deck + 0.3) strip('pave_' + zone, W.deck, Math.max(W.deck, eq), W.deck, Math.max(W.deck, er), 1.6);
          // ограда на стене: балюстрада (цоколь и поручень) или две трубы
          if (!gapAt(wi, am, 0)) {
            const o = P.rail[zone], [x0, z0] = at(k, o), [x1, z1] = at(k + 1, o);
            if (zone === 'rib') {
              beam('white', [x0, z0, tq + lift], [x1, z1, tr + lift], 0.16, 0.17);
              beam('white', [x0, z0, tq + P.balus.h - 0.12], [x1, z1, tr + P.balus.h - 0.12], 0.12, 0.17);
            } else {
              beam('steel', [x0, z0, tq + P.tube.h - 0.05], [x1, z1, tr + P.tube.h - 0.05], 0.05, 0.03);
              beam('steel', [x0, z0, tq + 0.5], [x1, z1, tr + 0.5], 0.04, 0.02);
            }
          }
        }
      }
      // тумбы и мелочь ограды — по длине стены с шагом, не в проёмах
      const L0 = -W.ext, L1 = A[n - 1] + W.ext;
      const along = (step, line, fn) => { for (let s = L0 + step / 2; s < L1; s += step) if (!gapAt(wi, s, line)) fn(stPromAt(w, s), s); };
      along(P.balus.post, 0, (e, s) => {
        const zi = P.zone(e.x);
        if (zi === 'rib') {
          const o = P.rail.rib, ry = Math.atan2(e.nx, e.nz);
          posts.bal.push({ x: e.x + e.nx * o, z: e.z + e.nz * o, y: e.top + lift, ry });
          for (let j = 1; j <= P.balus.n; j++) {
            const s2 = s + P.balus.post * j / (P.balus.n + 1);
            if (s2 > L1 || gapAt(wi, s2, 0)) continue;
            const f = stPromAt(w, s2);
            posts.balu.push({ x: f.x + f.nx * o, z: f.z + f.nz * o, y: f.top + lift + 0.16, ry });
          }
        }
      });
      along(P.tube.post, 0, e => {
        if (P.zone(e.x) !== 'seb') return;
        posts.tube.push({ x: e.x + e.nx * P.rail.seb, z: e.z + e.nz * P.rail.seb, y: e.top + lift });
      });
      along(P.roll.post, 1, (e, s) => {
        if (P.zone(e.x) !== 'mar') return;
        const k = clamp(e.i + (e.t > 0.5 ? 1 : 0), 0, n - 1), o = w.lawn[k], x = e.x + e.nx * o, z = e.z + e.nz * o;
        posts.roll.push({ x, z, y: g(x, z) + lift, ry: Math.atan2(e.nx, e.nz) });
      });
    });

    /* ---------- дорожки по газону к спускам (Marítim) ---------- */
    for (const [wi, ag, ad] of L.paths) {
      const w = L.walls[wi], e = stPromAt(w, ag), f = stPromAt(w, ad), k = clamp(e.i + (e.t > 0.5 ? 1 : 0), 0, w.lawn.length - 1);
      const ax = e.x + e.nx * w.lawn[k], az = e.z + e.nz * w.lawn[k], bx = f.x + f.nx * 0.3, bz = f.z + f.nz * 0.3;
      const Ld = Math.hypot(bx - ax, bz - az) || 1, px = -(bz - az) / Ld, pz = (bx - ax) / Ld, hw = 1.0;
      const ya = Math.max(e.top, g(ax, az)) + lift + 0.006, yb = f.top + lift + 0.006;
      poly('tile', [[ax + px * hw, ya, az + pz * hw], [bx + px * hw, yb, bz + pz * hw], [bx - px * hw, yb, bz - pz * hw], [ax - px * hw, ya, az - pz * hw]], [[0, 0], [Ld, 0], [Ld, 2], [0, 2]], UP);
    }

    /* ---------- лестницы и пандусы ---------- */
    let nStairs = 0, nRamps = 0;
    for (const d of L.desc) {
      const w = L.walls[d.w], cheek = P.zone(d.x) === 'rib' ? 'white' : 'step';
      if (d.kind === 'stairs') {
        const SP = P.stairs, N = Math.max(2, Math.round(d.len / SP.tread)), h = (d.top - d.low) / N, hw = SP.w / 2;
        const tx = -d.nz, tz = d.nx, pt = (o, s) => [d.x + d.nx * o + tx * s, d.z + d.nz * o + tz * s];
        for (let j = 0; j < N; j++) {
          const o0 = -j * SP.tread, o1 = -(j + 1) * SP.tread, y0 = d.top - j * h + lift, y1 = d.top - (j + 1) * h + lift;
          const a = pt(o0, -hw), b = pt(o0, hw), c = pt(o1, hw), e = pt(o1, -hw);
          poly('step', [[a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]]], [[0, y0], [SP.w, y0], [SP.w, y1], [0, y1]], [-d.nx, 0, -d.nz]);
          poly('step', [[a[0], y1, a[1]], [b[0], y1, b[1]], [c[0], y1, c[1]], [e[0], y1, e[1]]], [[0, 0], [SP.w, 0], [SP.w, SP.tread], [0, SP.tread]], UP);
        }
        // щёки: от пляжа до ската + 0,3 м
        const lo = -N * SP.tread;
        for (const sg of [-1, 1]) for (const s of [hw, hw + 0.25]) {
          const a = pt(0, sg * s), b = pt(lo, sg * s);
          poly(cheek, [[a[0], d.low - 0.4, a[1]], [b[0], d.low - 0.4, b[1]], [b[0], d.low + 0.3, b[1]], [a[0], d.top + 0.3, a[1]]], [[0, 0], [-lo, 0], [-lo, 1], [0, 1]], [tx * sg * (s > hw ? 1 : -1), 0, tz * sg * (s > hw ? 1 : -1)]);
        }
        for (const sg of [-1, 1]) {
          const a = pt(0, sg * hw), b = pt(lo, sg * hw), c = pt(lo, sg * (hw + 0.25)), e = pt(0, sg * (hw + 0.25));
          poly(cheek, [[a[0], d.top + 0.3, a[1]], [b[0], d.low + 0.3, b[1]], [c[0], d.low + 0.3, c[1]], [e[0], d.top + 0.3, e[1]]], [[0, 0], [1, 0], [1, 1], [0, 1]], UP);
          const f = pt(lo, sg * hw), q2 = pt(lo, sg * (hw + 0.25));
          poly(cheek, [[f[0], d.low - 0.4, f[1]], [q2[0], d.low - 0.4, q2[1]], [q2[0], d.low + 0.3, q2[1]], [f[0], d.low + 0.3, f[1]]], [[0, 0], [1, 0], [1, 1], [0, 1]], [-d.nx, 0, -d.nz]);
          cquad([a[0], d.low - 0.5, a[1]], [b[0], d.low - 0.5, b[1]], [b[0], d.low + 0.3, b[1]], [a[0], d.top + 0.3, a[1]]);
        }
        const a = pt(0, -hw), b = pt(0, hw), c = pt(lo, hw), e = pt(lo, -hw);
        cquad([a[0], d.top + lift, a[1]], [b[0], d.top + lift, b[1]], [c[0], d.low + lift, c[1]], [e[0], d.low + lift, e[1]]);
        S.walk([[a[0], a[1]], [b[0], b[1]], [c[0], c[1]], [e[0], e[1]]], [d.top + lift, d.top + lift, d.low + lift, d.low + lift]);
        nStairs++;
      } else {
        // пандус вдоль стены: верх у дорожки (d.a), вниз на d.len м; плита, наружная стенка с парапетом
        const RP = P.ramp, aEnd = d.a + d.dir * d.len, m = Math.max(2, Math.ceil(d.len / 2)), yEnd = stPromAt(w, aEnd).foot;
        const rows = [];
        for (let j = 0; j <= m; j++) {
          const s = d.a + (aEnd - d.a) * j / m, e = stPromAt(w, s), y = d.top + (yEnd - d.top) * j / m + lift;
          rows.push({ s, y, i: [e.x - e.nx * 0.02, e.z - e.nz * 0.02], o: [e.x - e.nx * RP.w, e.z - e.nz * RP.w], o2: [e.x - e.nx * (RP.w + 0.3), e.z - e.nz * (RP.w + 0.3)], foot: e.foot, nx: e.nx, nz: e.nz });
        }
        for (let j = 0; j < m; j++) {
          const A0 = rows[j], A1 = rows[j + 1];
          poly('ramp', [[A0.i[0], A0.y, A0.i[1]], [A1.i[0], A1.y, A1.i[1]], [A1.o[0], A1.y, A1.o[1]], [A0.o[0], A0.y, A0.o[1]]], [[A0.s / 4, 0], [A1.s / 4, 0], [A1.s / 4, RP.w / 4], [A0.s / 4, RP.w / 4]], UP);
          for (const [E0, E1, sg] of [['o', 'o', 1], ['o2', 'o2', -1]])
            poly('step', [[A0[E0][0], A0.foot - 0.4, A0[E0][1]], [A1[E1][0], A1.foot - 0.4, A1[E1][1]], [A1[E1][0], A1.y + 0.9, A1[E1][1]], [A0[E0][0], A0.y + 0.9, A0[E0][1]]],
              [[A0.s / 3, 0], [A1.s / 3, 0], [A1.s / 3, 1], [A0.s / 3, 1]], [A0.nx * sg, 0, A0.nz * sg]);
          poly('step', [[A0.o[0], A0.y + 0.9, A0.o[1]], [A1.o[0], A1.y + 0.9, A1.o[1]], [A1.o2[0], A1.y + 0.9, A1.o2[1]], [A0.o2[0], A0.y + 0.9, A0.o2[1]]], [[0, 0], [1, 0], [1, 1], [0, 1]], UP);
          cquad([A0.i[0], A0.y, A0.i[1]], [A1.i[0], A1.y, A1.i[1]], [A1.o[0], A1.y, A1.o[1]], [A0.o[0], A0.y, A0.o[1]]);
          cquad([A0.o[0], A0.foot - 0.5, A0.o[1]], [A1.o[0], A1.foot - 0.5, A1.o[1]], [A1.o[0], A1.y + 0.9, A1.o[1]], [A0.o[0], A0.y + 0.9, A0.o[1]]);
          S.walk([A0.i, A1.i, A1.o, A0.o], [A0.y, A1.y, A1.y, A0.y]);
        }
        // торец стенки у верхнего конца
        const E = rows[0];
        poly('step', [[E.o[0], E.foot - 0.4, E.o[1]], [E.o2[0], E.foot - 0.4, E.o2[1]], [E.o2[0], E.y + 0.9, E.o2[1]], [E.o[0], E.y + 0.9, E.o[1]]], [[0, 0], [1, 0], [1, 1], [0, 1]], [-d.dir * -E.nz, 0, -d.dir * E.nx]);
        nRamps++;
      }
    }

    /* ---------- меши из копилки ---------- */
    for (const B of bufs.values()) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(B.p, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(B.n, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(B.u, 2));
      geo.setIndex(B.i);
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, M[B.mk]);
      mesh.castShadow = shadow.has(B.mk); mesh.receiveShadow = true;
      K.group.add(mesh);
      const s = geo.boundingSphere;
      K.roadLod.push({ mesh, x: s.center.x, z: s.center.z, r: s.radius, far: P.far });
      st.meshes++; st.tris += B.i.length / 3;
    }
    S.collider(cv, ci);

    /* ---------- тумбы, балясины, шары, стойки (экземпляры) ---------- */
    const lathe = (pr, seg = 8) => new THREE.LatheGeometry(pr.map(([r, y]) => new THREE.Vector2(r, y)), seg);
    S.place([{ geo: new THREE.BoxGeometry(0.3, P.balus.h, 0.3).translate(0, P.balus.h / 2, 0), mat: M.white }], posts.bal);
    S.place([{ geo: lathe([[0.001, 0], [0.06, 0], [0.06, 0.06], [0.04, 0.12], [0.075, 0.33], [0.035, 0.55], [0.06, 0.6], [0.06, 0.67], [0.001, 0.67]], 6), mat: M.white }], posts.balu);
    S.place([{ geo: new THREE.BoxGeometry(0.44, 0.62, 0.44).translate(0, 0.31, 0), mat: M.roll }, { geo: new THREE.BoxGeometry(0.52, 0.08, 0.52).translate(0, 0.66, 0), mat: M.roll },
      { geo: new THREE.SphereGeometry(0.2, 10, 7).translate(0, 0.9, 0), mat: M.roll }], posts.roll);
    S.place([{ geo: new THREE.CylinderGeometry(0.03, 0.03, P.tube.h, 6).translate(0, P.tube.h / 2, 0), mat: M.steel }], posts.tube);

    /* ---------- каменные скамьи с плиткой (неподвижные) ---------- */
    if (L.bench.length) {
      const stone = S.mat('#d6d0c4', { roughness: 0.9 });
      const body = [
        new THREE.BoxGeometry(2.5, 0.12, 0.62).translate(0, 0.46, 0.05),          // сиденье
        new THREE.BoxGeometry(0.34, 0.75, 0.66).translate(-1.32, 0.375, 0.05),     // боковины с подлокотниками
        new THREE.BoxGeometry(0.34, 0.75, 0.66).translate(1.32, 0.375, 0.05),
        new THREE.BoxGeometry(0.3, 0.4, 0.4).translate(-0.45, 0.2, 0.05), new THREE.BoxGeometry(0.3, 0.4, 0.4).translate(0.45, 0.2, 0.05),
        new THREE.BoxGeometry(2.4, 0.62, 0.14).translate(0, 0.83, -0.28),          // спинка
        new THREE.BoxGeometry(2.7, 0.1, 0.2).translate(0, 1.17, -0.28),
      ];
      const geo = mergeGeometries(body.map(b => b.toNonIndexed()));
      L.bench.forEach((b, i) => {
        const tile = new THREE.MeshStandardMaterial({ map: T.bench[b[3]], roughness: 0.3 });
        tile.userData.shared = true;
        S.place([{ geo, mat: stone }, { geo: new THREE.PlaneGeometry(1.9, 0.42).translate(0, 0.86, -0.209), mat: tile, shadow: false }],
          [{ x: b[0], z: b[1], ry: b[2] }], { box: { w: 2.7, d: 0.75, h: 1.2 } });
      });
    }

    /* ---------- души у спусков (сбиваемые) ---------- */
    if (L.shower.length) {
      const steel = S.mat('#c8ccd0', { roughness: 0.3, metalness: 0.8 }), wood = S.mat('#8a6a48', { roughness: 0.9 });
      S.place([
        { geo: new THREE.CylinderGeometry(0.06, 0.07, 2.3, 8).translate(0, 1.15, 0), mat: steel },
        { geo: new THREE.CylinderGeometry(0.03, 0.03, 0.45, 6).rotateX(Math.PI / 2).translate(0, 2.25, 0.22), mat: steel },
        { geo: new THREE.CylinderGeometry(0.09, 0.05, 0.06, 8).translate(0, 2.2, 0.42), mat: steel },
        { geo: new THREE.BoxGeometry(1.0, 0.05, 1.0).translate(0, 0.025, 0.25), mat: wood, shadow: false },
      ], L.shower.map(([x, z]) => ({ x, z, ry: ((Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1) * Math.PI * 2 })),
      { brk: { mass: 70, anchor: 1, minSpeed: 2, cy: 1.1, lie: 1.4, kind: 'metal' }, hit: { r: 0.12, h: 2.3 } });
    }
    st.n += L.walls.length + nStairs + nRamps;
  },
};

/* ==================== текстуры набережной (один раз на страницу) ==================== */
let stPromTexCache = null;
function stPromTex() {
  if (stPromTexCache) return stPromTexCache;
  const rng = mulberry32(714), C = stPromCfg.colors;
  const cv = (w, h, base) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); if (base) { x.fillStyle = base; x.fillRect(0, 0, w, h); } return [c, x]; };
  const shade = (hex, f) => { const c = new THREE.Color(hex).multiplyScalar(f); return '#' + c.getHexString(); };
  const tex = (c, o = {}) => { const t = canvasTex(c); t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; if (o.clampT) { t.wrapT = THREE.ClampToEdgeWrapping; t.flipY = false; } t.userData = { shared: true }; return t; };
  const grain = (x, w, h, n, a) => { for (let i = 0; i < n; i++) { x.fillStyle = rng() < 0.5 ? `rgba(255,255,255,${rng() * a})` : `rgba(0,0,0,${rng() * a})`; x.fillRect(rng() * w, rng() * h, 1 + rng() * 2, 1 + rng() * 2); } };
  // тёсаный камень (Ribera, ступени): блоки 0,75 × 0,375 м на 3 м (256 px)
  const [ca, xa] = cv(256, 256, shade(C.rib.wall, 0.8));
  for (let r = 0; r < 8; r++) for (let c = -1; c < 4; c++) { xa.fillStyle = shade(C.rib.wall, 0.92 + rng() * 0.12); xa.fillRect(c * 64 + (r % 2) * 32 + 2, r * 32 + 2, 60, 28); }
  grain(xa, 256, 256, 3000, 0.08);
  // штукатурка Marítim: охра с потёками
  const [cp, xp] = cv(256, 256, C.mar.wall);
  for (let i = 0; i < 40; i++) { xp.fillStyle = `rgba(90,70,40,${0.03 + rng() * 0.05})`; xp.fillRect(rng() * 256, rng() * 256, 4 + rng() * 30, 20 + rng() * 90); }
  grain(xp, 256, 256, 4000, 0.06);
  // бут (Sant Sebastià, восток): неровные камни
  const [cr, xr] = cv(256, 256, shade(C.seb.wall, 0.62));
  for (let i = 0; i < 70; i++) {
    const x = rng() * 256, y = rng() * 256, rw = 14 + rng() * 22, rh = 9 + rng() * 14;
    xr.fillStyle = shade(C.seb.wall, 0.85 + rng() * 0.25);
    for (const dx of [-256, 0, 256]) for (const dy of [-256, 0, 256]) { xr.beginPath(); xr.ellipse(x + dx, y + dy, rw, rh, rng() * 0.6, 0, Math.PI * 2); xr.fill(); }
  }
  grain(xr, 256, 256, 3000, 0.08);
  // серая квадратная плитка Ribera 0,4 м: 4 × 4 на 1,6 м
  const [cs, xs] = cv(256, 256, shade(C.rib.pave, 0.7));
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { xs.fillStyle = shade(C.rib.pave, 0.9 + rng() * 0.15); xs.fillRect(c * 64 + 1, r * 64 + 1, 62, 62); }
  grain(xs, 256, 256, 2500, 0.07);
  // светлый кирпич Sant Sebastià 0,2 × 0,1 м вперевязку: на 1,6 м
  const [cb, xb] = cv(256, 256, shade(C.seb.pave, 0.75));
  for (let r = 0; r < 16; r++) for (let c = -1; c < 8; c++) { xb.fillStyle = shade(C.seb.pave, 0.86 + rng() * 0.18); xb.fillRect(c * 32 + (r % 2) * 16 + 1, r * 16 + 1, 30, 14); }
  grain(xb, 256, 256, 2500, 0.06);
  // узорная гидравлическая плитка Marítim 0,25 м с рельефом (f-passeig-maritim-02): на 1 м — 4 × 4
  const [ch, xh] = cv(256, 256, C.mar.pave);
  xh.lineWidth = 2;
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    const x0 = c * 64, y0 = r * 64;
    xh.fillStyle = shade(C.mar.pave, 0.95 + rng() * 0.08); xh.fillRect(x0 + 1, y0 + 1, 62, 62);
    xh.strokeStyle = 'rgba(80,60,40,0.28)';
    xh.beginPath(); xh.moveTo(x0 + 32, y0 + 6); xh.lineTo(x0 + 58, y0 + 32); xh.lineTo(x0 + 32, y0 + 58); xh.lineTo(x0 + 6, y0 + 32); xh.closePath(); xh.stroke();
    xh.strokeRect(x0 + 20, y0 + 20, 24, 24);
    xh.strokeStyle = 'rgba(255,255,255,0.35)';
    xh.beginPath(); xh.moveTo(x0 + 6, y0 + 6); xh.lineTo(x0 + 20, y0 + 20); xh.moveTo(x0 + 58, y0 + 6); xh.lineTo(x0 + 44, y0 + 20);
    xh.moveTo(x0 + 6, y0 + 58); xh.lineTo(x0 + 20, y0 + 44); xh.moveTo(x0 + 58, y0 + 58); xh.lineTo(x0 + 44, y0 + 44); xh.stroke();
  }
  grain(xh, 256, 256, 2000, 0.05);
  // бетон Marítim: светлый, швы через 2 м (на 4 м — 256 px)
  const [cc, xc] = cv(256, 256, C.mar.conc);
  grain(xc, 256, 256, 6000, 0.06);
  xc.fillStyle = 'rgba(0,0,0,0.12)'; xc.fillRect(0, 0, 256, 2); xc.fillRect(0, 128, 256, 2); xc.fillRect(0, 0, 2, 256); xc.fillRect(128, 0, 2, 256);
  // газон: пятна на 4 м
  const [cl, xl] = cv(128, 128, C.mar.lawn);
  for (let i = 0; i < 900; i++) { xl.fillStyle = rng() < 0.5 ? `rgba(120,150,80,${rng() * 0.2})` : `rgba(30,60,20,${rng() * 0.25})`; xl.fillRect(rng() * 128, rng() * 128, 2 + rng() * 4, 2 + rng() * 4); }
  // черепичная кромка: желобчатая черепица, внизу фестон (прозрачное — вырез); 0,5 м = 2 черепицы
  const [ct, xt] = cv(128, 64);
  for (let k = 0; k < 2; k++) {
    const x0 = k * 64, grd = xt.createLinearGradient(x0, 0, x0 + 64, 0);
    grd.addColorStop(0, shade(C.mar.tile, 0.65)); grd.addColorStop(0.5, shade(C.mar.tile, 1.1)); grd.addColorStop(1, shade(C.mar.tile, 0.65));
    xt.fillStyle = grd;
    xt.beginPath(); xt.moveTo(x0, 0); xt.lineTo(x0 + 64, 0); xt.lineTo(x0 + 64, 40); xt.arc(x0 + 32, 40, 32, 0, Math.PI); xt.closePath(); xt.fill();
  }
  // плитка спинки скамьи: клетки 0,14 м (14 × 3 на 1,9 × 0,42 м), в клетке — два треугольника по диагонали.
  // Синяя с кремовой — «вертушка» (диагональ поворачивается в блоке 2 × 2, f-passeig-maritim-01), зелёная с жёлтой —
  // все клетки одинаково (пила, f-passeig-maritim-02)
  const bench = C.bench.map((col, k) => {
    const Q = 28, [c, x] = cv(14 * Q, 3 * Q, k ? '#e3d36a' : '#efe4c8');
    x.fillStyle = col;
    for (let i = 0; i < 14; i++) for (let j = 0; j < 3; j++) {
      const X = i * Q, Y = j * Q, r = k ? 0 : (i % 2) + 2 * (j % 2);     // какой угол клетки — цветной треугольник
      const P4 = [[X, Y], [X + Q, Y], [X + Q, Y + Q], [X, Y + Q]], a = [0, 1, 3, 2][r];
      x.beginPath(); x.moveTo(...P4[a]); x.lineTo(...P4[(a + 1) % 4]); x.lineTo(...P4[(a + 3) % 4]); x.fill();
      x.strokeStyle = 'rgba(255,255,255,0.5)'; x.lineWidth = 1; x.strokeRect(X + 0.5, Y + 0.5, Q - 1, Q - 1);
    }
    return tex(c);
  });
  return stPromTexCache = {
    ashlar: tex(ca), plaster: tex(cp), rubble: tex(cr), squares: tex(cs), bricks: tex(cb), hydraulic: tex(ch), concrete: tex(cc), lawn: tex(cl),
    coping: tex(ct, { clampT: true }), bench,
  };
}
