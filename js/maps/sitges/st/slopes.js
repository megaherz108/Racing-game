// Ситжес — этап 7, группа G: склоны и площади (план — docs/sitges/stage-7.md, архив группы — docs/sitges/st-g.md).
// Что входит (виды — по фото sv/slope, sv/steep, landmarks/church, landmarks/sebastia; числа — st-g.md):
//   • подпорные стены из бута на склонах: у наружного края тротуара (C.street.fronts, дуги углов — cornerFronts) и у края полотна без тротуара
//     (edges), где участок за линией выше тротуара на 0,6–5 м (рельеф 10 м сгладил террасы садов в откос 25–30 %).
//     Лицо стены — на out м ближе к улице, чем линия забора (забор стоит за ним, виден выше стены), верх — рельеф
//     в at м за линией, сглаженный; за стеной — терраса (настил на высоте верха до места, где рельеф выше, не дальше
//     deck м) со своей сеткой столкновений. Рельеф не меняется: дома, заборы и тротуары уже стоят по нему.
//     Проёмы — у калиток, ворот и дверей (занятость каркаса gate / car / door); у стен набережной D (ближе dWall м),
//     у домов (фасад и есть стена) и у пляжей — нет.
//   • стена площадки бастиона у церкви: откос рельефа перед бутовой стеной плиты (lm/church.js, x = −510,5) опущен
//     до нижней площади (stSlopeTerrain, из sitgesPlanTerrain после stPromTerrain) — стена видна во всю высоту.
//   • обрыв мыса у церкви и обрывы над пляжами (ступени выше 4,5 м, их D оставила G): треугольники рельефа круче
//     cliff.slope у моря — скальная «кожа» поверх рельефа со своей развёрткой (текстура не растянута), на текстуре
//     земли — цвет скалы (stSlopeGroundPaint из ground.js: вдали видна земля).
//   • мощёная площадь перед часовней Сант-Себастья (lm-e.md): заливка от точки по ровной земле до домов, проезжей
//     части, тротуаров, заборов и перепада — светлые плиты (c-08, c-15), поверхность S.walk.
//   • центры колец: круговое движение — замкнутая цепочка проезжих улиц (одна кольцевая улица или несколько) почти
//     круглая (4πA/P² ≥ ring.circ); остров — лучами от центра до проезжей части и тротуаров; газон, пальмы и кусты
//     (породы trees3d.js: sitgesTreeKit, свои материалы без растворения ближних), если на острове нет деревьев 4б.
//   • бассейны вилл: C.areas kind = 'pool' — плоская вода на уровне высшей точки рельефа под контуром и бортик
//     (каменная кромка; где земля ниже — стенка до земли). Решение пользователя: без чаши и геометрии внутри.
// Договор (docs/sitges/stage-7.md, «Каркас»):
//   stSlopeTerrain(C) — рельеф у бастиона (из sitgesPlanTerrain, после stPromTerrain).
//   plan(C, S) → C.street.groups.G: { walls: [{ pts: [[x, z, nx, nz, низ, верх]], a, dk: [настил до, м] }] (нормаль —
//     к участку, вид стены каркаса 7.2), cliff: [треугольник рельефа k·2 + t], plaza: [{ x0, z0, c, rows: [[j, i0, i1]] }],
//     rings: [{ x, z, r, poly: [[x, z]], palms: [[x, z, форма, h, r, ry]], bushes: [[x, z, h, r, ry]] }],
//     pools: [{ ring: [[x, z]], y, lo }], stats }.
//   build(K, S, L) — стены, настил, скалы, плиты, газон — S.mesh; пальмы и кусты — S.place; столкновения — S.collider,
//     поверхности — S.walk.
// Стены, скалы, площадь, газон, бассейны — неподвижные; пальмы — неподвижные (круг ствола); кусты — сбиваемые.
// Определяет: stSlopeCfg, stSlopeTerrain, stSlopeGroundPaint, SITGES_ST_G, stSlopeTreeMatsCache, stSlopeTreeMats,
//   stSlopeTexCache, stSlopeTex.
// Использует: clamp (js/core.js); Breeze (js/breeze.js); smooth01, mulberry32, stdMat (js/world.js); canvasTex
//   (js/maps/city/textures.js); sitgesSeg, sitgesInPoly (js/maps/sitges/geom.js); sitgesStWallLen
//   (js/maps/sitges/street.js); SITGES_TREE_KINDS, sitgesTreeKit, sitgesTreeMats (js/maps/sitges/trees3d.js); lmMat
//   (js/maps/sitges/landmarks3d.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const stSlopeCfg = {
  // подпорная стена: step — шаг точек, м; min…max — участок выше тротуара (верх − низ), м; at — верх стены: наибольший
  // рельеф в этих м за линией; out — лицо стены ближе к улице, чем линия (забор: цоколь от линии внутрь, столбы
  // и изгородь выступают до 0,08 м); t — толщина; bury — лицо ниже тротуара; cap — верх стены над террасой;
  // deck — терраса за стеной не дальше, м; minLen — стена короче — нет; dWall — у стен набережной D ближе — нет
  wall: { step: 1.5, min: 0.6, max: 5, at: [2, 2.5, 3], out: 0.12, t: 0.4, bury: 0.15, cap: 0.1, deck: 4, minLen: 4, dWall: 15, gap: 0.45 },
  // обрыв: уклон треугольника рельефа не меньше slope, не дальше sea м от моря; lift — кожа над рельефом, м
  cliff: { slope: 0.55, sea: 60, lift: 0.08, uv: 4, dWall: 9 },
  // бастион (lm-a.md, lm/church.js): откос перед стеной плиты x = −510,5 — до уровня площади
  // и продолжение стены на север от плиты до склона у домов (north: концы, верх — рельеф в at м за ней), без скал в box
  bastion: { x0: -513.5, x1: -503, blend: 6, z0: -212.5, z1: -173.5, zBlend: 3, y: 2.3,
    north: [[-510.5, -182.6], [-510.7, -173.5]], at: [3, 4, 5], box: [-516, -498, -216, -168] },
  // площади: заливка от точки seed на сетке c м — земля не дальше dy м по высоте от точки, перепад к соседней клетке
  // не больше step м, радиус R м
  plazas: [{ name: 'Sant Sebastià', seed: [-1035, -190], R: 48, dy: 1.6, step: 0.35 }],
  plazaCell: 1, plazaLift: 0.035,
  // кольца: замкнутая цепочка проезжих улиц не длиннее len м, не больше edges улиц, круглость ≥ circ, площадь ≥ area;
  // остров — лучами (rays) до проезжей части и тротуаров с шагом rayStep, не дальше rayMax
  ring: { len: 170, edges: 6, circ: 0.9, area: 80, rays: 24, rayStep: 0.2, rayMax: 40, minR: 1.6, lift: 0.05 },
  // бассейн: бортик шириной rim м, выше воды на rimH; вода над высшей точкой рельефа контура на lift
  pool: { rim: 0.3, rimH: 0.06, lift: 0.08, minA: 4 },
  colors: {
    // бут: раствор и камни (серо-бежевые, светлые, охристые, серые — sv/slope 07, 12; h-church-01)
    mortar: '#d6cdbd', stones: ['#c8bca6', '#b9ad97', '#d3c8b2', '#ab9f8b', '#c6b28e', '#b3aa9c'], cap: '#cfc4ae', deck: '#b8af9c', rock: '#aea18a', paving: '#c9c3b7', lawn: '#5a7d36',
    water: '#46b7d6', rim: '#e3ddd0',
  },
  rockPaint: [160, 148, 126],           // цвет скалы на текстуре земли (ground.js)
};

/* ==================== рельеф: откос перед стеной бастиона (из sitgesPlanTerrain) ==================== */
function stSlopeTerrain(C) {
  const T = C.terra, B = stSlopeCfg.bastion, { NX, NZ, S: GS, X0, Z0, H, sea } = T;
  let n = 0;
  const i0 = Math.max(0, Math.floor((B.x0 - X0) / GS)), i1 = Math.min(NX - 1, Math.ceil((B.x1 + B.blend - X0) / GS));
  const j0 = Math.max(0, Math.floor((B.z0 - B.zBlend - Z0) / GS)), j1 = Math.min(NZ - 1, Math.ceil((B.z1 + B.zBlend - Z0) / GS));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const k = j * NX + i, x = X0 + i * GS, z = Z0 + j * GS;
    if (sea[k] || x < B.x0) continue;
    // доля «опустить»: 1 у стены, к площади и к краям по z — плавно к прежнему
    const fx = x <= B.x1 ? 1 : 1 - smooth01((x - B.x1) / B.blend);
    const fz = z < B.z0 ? 1 - smooth01((B.z0 - z) / B.zBlend) : z > B.z1 ? 1 - smooth01((z - B.z1) / B.zBlend) : 1;
    const f = fx * fz;
    if (f <= 0 || H[k] <= B.y) continue;
    H[k] = H[k] - (H[k] - B.y) * f; n++;
  }
  C.slopeTerrain = { bastion: n };
}

/* ==================== текстура земли: скалы обрывов (из ground.js) ==================== */
function stSlopeGroundPaint(ctx, X, Z, C) {
  const L = C.street && C.street.groups && C.street.groups.G;
  if (!L || !L.cliff) return;
  const T = C.terra, { NX, S: GS, X0, Z0 } = T, [r, g, b] = stSlopeCfg.rockPaint, rng = mulberry32(77);
  for (const id of L.cliff) {
    const k = id >> 1, i = k % NX, j = (k / NX) | 0, f = 0.85 + rng() * 0.25;
    ctx.fillStyle = `rgb(${r * f | 0},${g * f | 0},${b * f | 0})`;
    ctx.fillRect(X(X0 + (i - 0.1) * GS), Z(Z0 + (j - 0.1) * GS), X(X0 + (i + 1.2) * GS) - X(X0 + i * GS), Z(Z0 + (j + 1.2) * GS) - Z(Z0 + j * GS));
  }
}

/* ==================== группа G ==================== */
const SITGES_ST_G = {
  id: 'G', name: 'склоны и площади', ready: true,

  /* ---------- раскладка ---------- */
  plan(C, S) {
    const P = stSlopeCfg, T = C.terra, g = C.ground;
    const stats = {};
    const houseAt = (x, z) => !!C.houseAt(x, z);
    const drive = (x, z) => { const c = S.carriage(x, z); return !!(c && (c.corner || c.st.drive)); };
    const road = (x, z) => !!S.carriage(x, z) || !!S.onWalk(x, z);
    const cellOf = (x, z) => T.inGrid(x, z) ? T.cell(x, z) : -1;
    const isBeach = (x, z) => { const k = cellOf(x, z); return k >= 0 && (T.beach[k] || T.sea[k]); };
    // отрезки стен набережной D (рядом с ними своих стен и скал нет)
    const dSegs = [];
    for (const w of (C.prom && C.prom.walls) || []) for (let i = 1; i < w.pts.length; i++) dSegs.push([w.pts[i - 1][0], w.pts[i - 1][1], w.pts[i][0], w.pts[i][1]]);
    const nearD = (x, z, R) => dSegs.some(s => x > Math.min(s[0], s[2]) - R && x < Math.max(s[0], s[2]) + R && z > Math.min(s[1], s[3]) - R && z < Math.max(s[1], s[3]) + R && sitgesSeg(x, z, s[0], s[1], s[2], s[3]) < R);

    /* ---------- подпорные стены ---------- */
    const W = P.wall, walls = [], gapWho = ['gate', 'car', 'door'];
    const spot = (x, z, lx, lz) => {
      if (nearD(x, z, W.dWall) || isBeach(x + lx * 2, z + lz * 2)) return null;
      if (houseAt(x + lx * 0.8, z + lz * 0.8) || houseAt(x + lx * 2.2, z + lz * 2.2)) return null;  // фасад — сам стена
      if (road(x + lx * 1.5, z + lz * 1.5)) return null;                                           // за линией — другая улица
      if (S.hits(x, z, W.gap).some(o => gapWho.includes(o.who))) return null;                        // калитка, ворота, дверь
      const foot = g(x - lx * 0.3, z - lz * 0.3);
      let top = -Infinity;
      for (const d of W.at) top = Math.max(top, g(x + lx * d, z + lz * d));
      if (top - foot < W.min) return null;
      return [x, z, lx, lz, foot, Math.min(top, foot + W.max)];
    };
    const runs = [];
    for (const [list, sg] of [['fronts', -1], ['cornerFronts', -1], ['edges', 1]]) {
      let run = [], end = null;
      const flush = () => { if (run.length) runs.push(run); run = []; };
      for (const s of S[list]) {
        if (!end || Math.hypot(s.ax - end[0], s.az - end[1]) > 0.05) flush();
        end = [s.bx, s.bz];
        const n = Math.max(1, Math.round(s.len / W.step));
        for (let k = 0; k < n; k++) {
          const f = (k + 0.5) / n, p = spot(s.ax + (s.bx - s.ax) * f, s.az + (s.bz - s.az) * f, sg * s.nx, sg * s.nz);
          if (p) run.push(p); else flush();
        }
      }
      flush();
    }
    let wLen = 0, hSum = 0;
    for (const r of runs) {
      let len = 0;
      for (let i = 1; i < r.length; i++) len += Math.hypot(r[i][0] - r[i - 1][0], r[i][1] - r[i - 1][1]);
      if (len + W.step < W.minLen) continue;
      // концы — на полшага дальше (стена от конца до конца прогона), верх — медиана по 5 точкам, не ниже низ + min
      const ext = (p, q) => { const dx = p[0] - q[0], dz = p[1] - q[1], l = Math.hypot(dx, dz) || 1, e = W.step / 2; return [p[0] + dx / l * e, p[1] + dz / l * e, ...p.slice(2)]; };
      const R = r.length > 1 ? [ext(r[0], r[1]), ...r, ext(r[r.length - 1], r[r.length - 2])] : r;
      const tops = R.map((p, i) => { const w = R.slice(Math.max(0, i - 2), i + 3).map(q => q[5]).sort((u, v) => u - v); return Math.max(w[w.length >> 1], p[4] + W.min); });
      const pts = R.map((p, i) => [p[0], p[1], p[2], p[3], p[4], tops[i]]);
      // терраса за стеной: до места, где рельеф не ниже верха (дом, улица, вода — конец), не дальше deck м
      const dk = pts.map(p => {
        let d = W.t + 0.25;
        for (; d < W.deck; d += 0.25) {
          const x = p[0] + p[2] * d, z = p[1] + p[3] * d;
          if (g(x, z) >= p[5] - 0.03) break;
          if (houseAt(x, z) || road(x, z) || isBeach(x, z)) { d -= 0.25; break; }
        }
        return Math.max(W.t, Math.min(W.deck, d));
      });
      walls.push({ pts, a: sitgesStWallLen(pts), dk });
      wLen += len + W.step;
      for (const p of pts) hSum += p[5] - p[4];
      for (let i = 1; i < pts.length; i++) S.reserve(pts[i - 1][0], pts[i - 1][1], 0.3, 'G', pts[i][0], pts[i][1]);
    }
    // стена бастиона к северу от плиты (lm/church.js) — тот же вид, нормаль к террасе (−x)
    {
      const Bq = P.bastion, [[ax, az], [bx, bz]] = Bq.north, n = Math.max(2, Math.round(Math.hypot(bx - ax, bz - az) / W.step) + 1);
      const pts = [];
      for (let q = 0; q < n; q++) {
        const f = q / (n - 1), x = ax + (bx - ax) * f, z = az + (bz - az) * f, foot = g(x + 0.3, z);
        let top = -Infinity;
        for (const d of Bq.at) top = Math.max(top, g(x - d, z));
        pts.push([x, z, -1, 0, foot, Math.max(top, foot + W.min)]);
      }
      const dk = pts.map(p => { let d = W.t + 0.25; while (d < W.deck + 2 && g(p[0] - d, p[1]) < p[5] - 0.03 && !houseAt(p[0] - d, p[1])) d += 0.25; return d; });
      walls.push({ pts, a: sitgesStWallLen(pts), dk, kind: 'bastion' });
      wLen += Math.hypot(bx - ax, bz - az);
    }
    stats.walls = walls.length; stats.wallLen = Math.round(wLen);
    stats.wallH = walls.length ? +(hSum / walls.reduce((s, w) => s + w.pts.length, 0)).toFixed(2) : 0;

    /* ---------- обрывы: треугольники рельефа круче slope у моря ---------- */
    const CL = P.cliff, { NX, NZ, S: GS, X0, Z0, H, sea, beach, dSea } = T, cliff = [];
    for (let j = 0; j + 1 < NZ; j++) for (let i = 0; i + 1 < NX; i++) {
      const k = j * NX + i, k01 = k + NX, k10 = k + 1, k11 = k + NX + 1;
      if (dSea[k] > CL.sea) continue;
      const tris = [[k, k01, k10, (H[k10] - H[k]) / GS, (H[k01] - H[k]) / GS], [k01, k11, k10, (H[k11] - H[k01]) / GS, (H[k11] - H[k10]) / GS]];
      tris.forEach(([a, b, c, gx, gz], t) => {
        if (Math.hypot(gx, gz) < CL.slope) return;
        if ((sea[a] && sea[b] && sea[c]) || beach[a] + beach[b] + beach[c] >= 2) return;
        const xa = X0 + (a % NX) * GS, za = Z0 + ((a / NX) | 0) * GS, xb = X0 + (b % NX) * GS, zb = Z0 + ((b / NX) | 0) * GS, xc = X0 + (c % NX) * GS, zc = Z0 + ((c / NX) | 0) * GS;
        const cx = (xa + xb + xc) / 3, cz = (za + zb + zc) / 3;
        const bb = P.bastion.box;
        if (cx > bb[0] && cx < bb[1] && cz > bb[2] && cz < bb[3]) return;      // бастион: стены
        if (houseAt(cx, cz) || road(cx, cz) || nearD(cx, cz, CL.dWall)) return;
        cliff.push(k * 2 + t);
      });
    }
    stats.cliff = cliff.length;

    /* ---------- площади: заливка от точки ---------- */
    const plaza = [], c0 = P.plazaCell;
    for (const Q of P.plazas) {
      const [sx, sz] = Q.seed, g0 = g(sx, sz), N = Math.ceil(Q.R / c0), D = 2 * N + 1, x0 = sx - N * c0, z0 = sz - N * c0;
      const st = new Uint8Array(D * D);                // 0 — не смотрели, 1 — площадь, 2 — нет, 3 — дорожка (через неё дальше, не мостить)
      const at = (i, j) => [x0 + (i + 0.5) * c0, z0 + (j + 0.5) * c0];
      const ok = (i, j, pi, pj) => {
        const [x, z] = at(i, j), [px, pz] = at(pi, pj), h = g(x, z);
        if (Math.hypot(x - sx, z - sz) > Q.R || Math.abs(h - g0) > Q.dy || Math.abs(h - g(px, pz)) > Q.step) return 0;
        if (houseAt(x, z) || drive(x, z) || S.onWalk(x, z) || isBeach(x, z) || C.waterAt(x, z) === 0 || S.fenceCut(px, pz, x, z)) return 0;
        return S.carriage(x, z) ? 3 : 1;
      };
      const stack = [[N, N]];
      st[N * D + N] = 1;
      while (stack.length) {
        const [i, j] = stack.pop();
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const a = i + di, b = j + dj;
          if (a < 0 || b < 0 || a >= D || b >= D || st[b * D + a]) continue;
          const v = ok(a, b, i, j);
          st[b * D + a] = v || 2;
          if (v) stack.push([a, b]);
        }
      }
      const rows = [];
      let cells = 0;
      for (let j = 0; j < D; j++) for (let i = 0; i < D; i++) {
        if (st[j * D + i] !== 1) continue;
        let e = i; while (e + 1 < D && st[j * D + e + 1] === 1) e++;
        rows.push([j, i, e]); cells += e - i + 1; i = e;
      }
      plaza.push({ name: Q.name, x0, z0, c: c0, rows });
      // занято: площадь (кругом по клеткам строк) — для колец и бассейнов дальше не нужно, A–F уже стоят
      stats['plaza ' + Q.name] = cells;
    }

    /* ---------- центры колец ---------- */
    const RG = P.ring, adj = new Map(), key = q => q.k !== undefined ? 'k' + q.k : Math.round(q.x * 2) + ',' + Math.round(q.z * 2);
    C.streets.forEach((st, i) => {
      if (!st.drive || st.len > RG.len) return;
      const v = st.v, a = key(v[0]), b = key(v[v.length - 1]);
      for (const [u, w, d] of [[a, b, 1], [b, a, -1]]) { if (!adj.has(u)) adj.set(u, []); adj.get(u).push({ i, to: w, d }); }
    });
    const cyc = [], seen = new Set();
    const loopPoly = path => { const out = []; for (const e of path) { const v = C.streets[e.i].v, s = e.d > 0 ? v : v.slice().reverse(); for (let k = 0; k + 1 < s.length; k++) out.push([s[k].x, s[k].z]); } return out; };
    const dfs = (start, u, path, L) => {
      if (path.length >= RG.edges || L > RG.len) return;
      for (const e of adj.get(u) || []) {
        if (path.some(p => p.i === e.i)) continue;
        const L2 = L + C.streets[e.i].len;
        if (e.to !== start) { dfs(start, e.to, [...path, e], L2); continue; }
        if (L2 > RG.len) continue;
        const all = [...path, e], id = all.map(p => p.i).sort((a, b) => a - b).join('-');
        if (seen.has(id)) continue;
        seen.add(id);
        const Pl = loopPoly(all);
        let A = 0, Pm = 0, cx = 0, cz = 0;
        for (let k = 0; k < Pl.length; k++) { const [xa, za] = Pl[k], [xb, zb] = Pl[(k + 1) % Pl.length]; A += xa * zb - xb * za; Pm += Math.hypot(xb - xa, zb - za); cx += xa; cz += za; }
        A = Math.abs(A) / 2; cx /= Pl.length; cz /= Pl.length;
        if (A >= RG.area && 4 * Math.PI * A / (Pm * Pm) >= RG.circ) cyc.push({ x: cx, z: cz, A, id });
      }
    };
    for (const u of [...adj.keys()].sort()) dfs(u, u, [], 0);
    cyc.sort((a, b) => a.A - b.A);
    const rings = [], kit = SITGES_TREE_KINDS.palm;
    for (const c of cyc) {
      if (rings.some(r => Math.hypot(r.x - c.x, r.z - c.z) < 8) || !C.inside(c.x, c.z)) continue;
      if (road(c.x, c.z) || houseAt(c.x, c.z)) continue;
      const poly = [];
      let rMin = Infinity, rSum = 0;
      for (let k = 0; k < RG.rays; k++) {
        const an = k / RG.rays * Math.PI * 2, dx = Math.cos(an), dz = Math.sin(an);
        let d = 0;
        while (d < RG.rayMax && !road(c.x + dx * (d + RG.rayStep), c.z + dz * (d + RG.rayStep)) && !houseAt(c.x + dx * (d + RG.rayStep), c.z + dz * (d + RG.rayStep))) d += RG.rayStep;
        d = Math.max(0, d - 0.05);
        poly.push([c.x + dx * d, c.z + dz * d]); rMin = Math.min(rMin, d); rSum += d;
      }
      const rm = rSum / RG.rays;
      if (rm < RG.minR || rMin < 0.5) continue;
      // деревья 4б на острове — свои пальмы не ставим (газон и кусты — да)
      const own = (C.trees || []).some(t => Math.hypot(t.x - c.x, t.z - c.z) < rm && sitgesInPoly(t.x, t.z, poly));
      const palms = [], bushes = [], hs = (k) => S.hash(c.x, c.z, k);
      if (!own && rMin >= 1.2) {
        // пальмы: в центре одна (r < 6 м) или группа из трёх; порода — по месту
        const n = rMin < 6 ? 1 : 3, rr = n === 1 ? 0 : Math.min(rMin * 0.35, 3);
        for (let q = 0; q < n; q++) {
          const an = hs(1) * 6.283 + q * 2.094, f = kit[Math.floor(hs(2 + q) * kit.length) % kit.length];
          palms.push([c.x + Math.cos(an) * rr, c.z + Math.sin(an) * rr, f, 6 + hs(5 + q) * 4, 2.6 + hs(8 + q) * 1, hs(11 + q) * 6.283]);
        }
      }
      // кусты кольцом на 0,6 радиуса острова (по лучу — своё расстояние), шаг ≈ 2,5 м
      const nb = Math.max(4, Math.min(16, Math.round(2 * Math.PI * rm * 0.6 / 2.5)));
      if (rMin >= 1.0) for (let q = 0; q < nb; q++) {
        const kk = Math.round(q / nb * RG.rays) % RG.rays, [px, pz] = poly[kk], f = 0.6;
        const x = c.x + (px - c.x) * f, z = c.z + (pz - c.z) * f;
        if (palms.some(p => Math.hypot(p[0] - x, p[1] - z) < 1.5)) continue;
        bushes.push([x, z, 1.1 + hs(20 + q) * 0.5, 0.8 + hs(40 + q) * 0.3, hs(60 + q) * 6.283]);
      }
      for (const p of palms) S.reserve(p[0], p[1], 0.5, 'G');
      for (const b of bushes) S.reserve(b[0], b[1], b[3], 'G');
      rings.push({ x: c.x, z: c.z, r: +rm.toFixed(2), poly, palms, bushes });
    }
    stats.rings = rings.length; stats.palms = rings.reduce((s, r) => s + r.palms.length, 0); stats.bushes = rings.reduce((s, r) => s + r.bushes.length, 0);

    /* ---------- бассейны ---------- */
    const PL = P.pool, pools = [];
    for (const a of C.areas) {
      if (a.kind !== 'pool') continue;
      const r = a.ring.slice();
      if (r.length > 3 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) r.pop();
      if (r.length < 3) continue;
      let A = 0, cx = 0, cz = 0;
      for (let k = 0; k < r.length; k++) { const [xa, za] = r[k], [xb, zb] = r[(k + 1) % r.length]; A += xa * zb - xb * za; cx += xa; cz += za; }
      cx /= r.length; cz /= r.length;
      if (Math.abs(A) / 2 < PL.minA || !C.inside(cx, cz) || houseAt(cx, cz)) continue;
      if (A < 0) r.reverse();                         // обход против часовой (в координатах x, z) — для бортика наружу
      let hi = g(cx, cz), lo = hi;
      for (const [x, z] of r) { const h = g(x, z); hi = Math.max(hi, h); lo = Math.min(lo, h); }
      pools.push({ ring: r, y: +(hi + PL.lift).toFixed(3), lo: +lo.toFixed(3) });
    }
    stats.pools = pools.length;
    return { walls, cliff, plaza, rings, pools, stats };
  },

  /* ---------- постройка ---------- */
  build(K, S, L) {
    if (!L || !L.walls) return;
    const P = stSlopeCfg, Cc = P.colors, C = K.D.C, T = C.terra, g = K.D.ground, X = stSlopeTex();
    const mat = (tex, hex, o = {}) => { const m = stdMat(hex, Object.assign({ map: tex, roughness: 0.92 }, o)); m.userData.shared = true; return m; };
    const M = {
      rubble: mat(X.rubble, 0xffffff), cap: S.mat(Cc.cap, { roughness: 0.9 }), deck: S.mat(Cc.deck, { roughness: 0.95 }),
      rock: mat(X.rock, 0xffffff, { vertexColors: true }), paving: mat(X.paving, 0xffffff), lawn: mat(X.lawn, 0xffffff, { roughness: 1 }),
      water: S.mat(Cc.water, { roughness: 0.08, metalness: 0.05 }), rim: S.mat(Cc.rim, { roughness: 0.85 }),
    };
    const cv = [], ci = [];                               // сетка столкновений группы (одна)
    const colQuad = (a, b, c, d) => { const o = cv.length / 3; cv.push(...a, ...b, ...c, ...d); ci.push(o, o + 1, o + 2, o, o + 2, o + 3); };

    /* ---------- подпорные стены ---------- */
    const W = P.wall, U = 2;                              // развёртка бута: 2 м на повтор (текстура 512 px)
    const faceW = S.mesh('wall', M.rubble, { chunk: 320, far: 450 }), top = S.mesh('cap', M.cap, { chunk: 320, far: 450 });
    const deck = S.mesh('deck', M.deck, { chunk: 320, far: 450, uv: false, shadow: false });
    // стена бастиона — тем же бутом, что плита церкви (lm/church.js: lmMat 0xd2bc95, развёртка LMK.uv = 2 м)
    const faceB = S.mesh('bastion', lmMat(0xd2bc95, { tex: 'rubble' }), { chunk: 320, far: 900 });
    let nW = 0;
    for (const w of L.walls) {
      const p = w.pts, n = p.length, face = w.kind === 'bastion' ? faceB : faceW;
      // низ — поверхность у линии со стороны улицы (тротуар, полотно); верх — из раскладки
      const pt = p.map((q, i) => {
        const [x, z, lx, lz] = q, foot = S.y(x - lx * 0.3, z - lz * 0.3), tp = Math.max(q[5], foot + W.min);
        const F = [x - lx * W.out, z - lz * W.out], B = [x + lx * W.t, z + lz * W.t], Dk = [x + lx * w.dk[i], z + lz * w.dk[i]];
        return { F, B, Dk, foot, top: tp, a: w.a[i], lx, lz, gD: g(Dk[0], Dk[1]) };
      });
      for (let i = 0; i + 1 < n; i++) {
        const A = pt[i], Bq = pt[i + 1], yA = A.top + W.cap, yB = Bq.top + W.cap;
        const fA = A.foot - W.bury, fB = Bq.foot - W.bury, uA = A.a / U, uB = Bq.a / U;
        const nx = -(A.lx + Bq.lx) / 2, nz = -(A.lz + Bq.lz) / 2;          // лицо — к улице
        face.poly([[A.F[0], fA, A.F[1]], [Bq.F[0], fB, Bq.F[1]], [Bq.F[0], yB, Bq.F[1]], [A.F[0], yA, A.F[1]]],
          [[uA, fA / U], [uB, fB / U], [uB, yB / U], [uA, yA / U]], [nx, 0, nz]);
        top.poly([[A.F[0], yA, A.F[1]], [Bq.F[0], yB, Bq.F[1]], [Bq.B[0], yB, Bq.B[1]], [A.B[0], yA, A.B[1]]], [[uA, 0], [uB, 0], [uB, 0.25], [uA, 0.25]], [0, 1, 0]);
        top.poly([[A.B[0], A.top, A.B[1]], [Bq.B[0], Bq.top, Bq.B[1]], [Bq.B[0], yB, Bq.B[1]], [A.B[0], yA, A.B[1]]], [[uA, 0], [uB, 0], [uB, 0.1], [uA, 0.1]], [-nx, 0, -nz]);
        colQuad([A.F[0], fA, A.F[1]], [Bq.F[0], fB, Bq.F[1]], [Bq.F[0], yB, Bq.F[1]], [A.F[0], yA, A.F[1]]);
        colQuad([A.F[0], yA, A.F[1]], [Bq.F[0], yB, Bq.F[1]], [Bq.B[0], yB, Bq.B[1]], [A.B[0], yA, A.B[1]]);
        // терраса: от тыла стены до места, где рельеф выше; край — стенкой до земли
        if (w.dk[i] > W.t + 0.05 || w.dk[i + 1] > W.t + 0.05) {
          deck.poly([[A.B[0], A.top, A.B[1]], [Bq.B[0], Bq.top, Bq.B[1]], [Bq.Dk[0], Bq.top, Bq.Dk[1]], [A.Dk[0], A.top, A.Dk[1]]], null, [0, 1, 0]);
          colQuad([A.B[0], A.top, A.B[1]], [Bq.B[0], Bq.top, Bq.B[1]], [Bq.Dk[0], Bq.top, Bq.Dk[1]], [A.Dk[0], A.top, A.Dk[1]]);
          if (A.gD < A.top - 0.05 || Bq.gD < Bq.top - 0.05)
            deck.poly([[A.Dk[0], Math.min(A.gD, A.top) - 0.1, A.Dk[1]], [Bq.Dk[0], Math.min(Bq.gD, Bq.top) - 0.1, Bq.Dk[1]], [Bq.Dk[0], Bq.top, Bq.Dk[1]], [A.Dk[0], A.top, A.Dk[1]]], null, [-nx, 0, -nz]);
        }
      }
      // торцы: стена и терраса — до земли
      for (const [Q, sg] of [[pt[0], -1], [pt[n - 1], 1]]) {
        const tx = sg * -Q.lz, tz = sg * Q.lx, y = Q.top + W.cap, gb = Math.min(g(Q.B[0], Q.B[1]), Q.foot) - W.bury;
        face.poly([[Q.F[0], Q.foot - W.bury, Q.F[1]], [Q.B[0], gb, Q.B[1]], [Q.B[0], y, Q.B[1]], [Q.F[0], y, Q.F[1]]], [[0, 0], [W.t / U, 0], [W.t / U, y / U], [0, y / U]], [tx, 0, tz]);
        if (Q.Dk[0] !== Q.B[0] || Q.Dk[1] !== Q.B[1])
          deck.poly([[Q.B[0], gb, Q.B[1]], [Q.Dk[0], Math.min(Q.gD, Q.top) - 0.1, Q.Dk[1]], [Q.Dk[0], Q.top, Q.Dk[1]], [Q.B[0], Q.top, Q.B[1]]], null, [tx, 0, tz]);
      }
      nW++;
    }

    /* ---------- обрывы: скальная кожа ---------- */
    const { NX, S: GS, X0, Z0, H } = T, CL = P.cliff, rock = S.mesh('rock', M.rock, { chunk: 320, far: 900, color: true });
    for (const id of L.cliff) {
      const k = id >> 1, t = id & 1, i = k % NX, j = (k / NX) | 0;
      const ids = t ? [[i, j + 1], [i + 1, j + 1], [i + 1, j]] : [[i, j], [i, j + 1], [i + 1, j]];
      const vs = ids.map(([a, b]) => [X0 + a * GS, H[b * NX + a] + CL.lift, Z0 + b * GS]);
      const gx = t ? (vs[1][1] - vs[0][1]) / GS : (vs[2][1] - vs[0][1]) / GS, gz = t ? (vs[1][1] - vs[2][1]) / GS : (vs[1][1] - vs[0][1]) / GS;
      const ax = Math.abs(gx) >= Math.abs(gz);
      const uv = vs.map(v => [(ax ? v[2] : v[0]) / CL.uv, v[1] / CL.uv]);
      const f = 0.9 + 0.14 * S.hash(vs[0][0], vs[0][2], 7);
      rock.poly(vs, uv, [0, 1, 0], [f, f * 0.97, f * 0.93]);
    }

    /* ---------- площадь ---------- */
    const pave = S.mesh('paving', M.paving, { chunk: 320, far: 600, shadow: false });
    let plazaQ = 0;
    for (const Q of L.plaza) {
      const c = Q.c, lift = P.plazaLift;
      for (const [j, i0, i1] of Q.rows) for (let a = i0; a <= i1; a += 2) {
        const b = Math.min(i1, a + 1), xa = Q.x0 + a * c, xb = Q.x0 + (b + 1) * c, za = Q.z0 + j * c, zb = za + c;
        const ys = [[xa, za], [xb, za], [xb, zb], [xa, zb]].map(([x, z]) => g(x, z) + lift);
        const vs = [[xa, ys[0], za], [xb, ys[1], za], [xb, ys[2], zb], [xa, ys[3], zb]];
        pave.poly(vs, vs.map(v => [v[0] / 2.4, v[2] / 2.4]), [0, 1, 0]);
        S.walk([[xa, za], [xb, za], [xb, zb], [xa, zb]], ys);
        plazaQ++;
      }
    }

    /* ---------- центры колец: газон, пальмы, кусты ---------- */
    const RG = P.ring, lawn = S.mesh('lawn', M.lawn, { chunk: 320, far: 600, shadow: false });
    const palmItems = new Map(), bushItems = [];
    for (const r of L.rings) {
      const n = r.poly.length, fr = [0, 0.4, 0.75, 1];
      const ring = f => r.poly.map(([x, z]) => { const px = r.x + (x - r.x) * f, pz = r.z + (z - r.z) * f; return [px, g(px, pz) + RG.lift, pz]; });
      const R = fr.map(ring);
      for (let q = 1; q < fr.length; q++) for (let k = 0; k < n; k++) {
        const a = R[q - 1][k], b = R[q - 1][(k + 1) % n], c = R[q][(k + 1) % n], d = R[q][k];
        lawn.poly(q === 1 ? [a, c, d] : [a, b, c, d], (q === 1 ? [a, c, d] : [a, b, c, d]).map(v => [v[0] / 3, v[2] / 3]), [0, 1, 0]);
      }
      for (const p of r.palms) { if (!palmItems.has(p[2])) palmItems.set(p[2], []); palmItems.get(p[2]).push(p); }
      for (const b of r.bushes) bushItems.push(b);
    }
    // ствол и крона с запечённой матрицей; качание кроны — по её высотам после запекания
    const stSlopeTreeParts = (f, mT, mC) => {
      const crown = f.crown.clone().applyMatrix4(mC);
      crown.computeBoundingBox();
      return [{ geo: f.trunk.clone().applyMatrix4(mT), mat: stSlopeTreeMats() }, { geo: crown, mat: stSlopeTreeMats(f.leaf, crown.boundingBox.min.y, crown.boundingBox.max.y) }];
    };
    const kit = sitgesTreeKit(), mT = new THREE.Matrix4(), mC = new THREE.Matrix4();
    // пальмы и кусты: ствол и крона формы по sitgesTreeMats для «среднего» размера запечены в копию геометрии (у сбиваемых
    // S.place не берёт loc при per = 1), размер — масштабом экземпляра
    for (const [fid, list] of palmItems) {
      const f = kit.forms[fid], h0 = 8, r0 = 3.1;
      sitgesTreeMats(f, 0, 0, 0, h0, r0, 0, mT, mC);
      S.place([...stSlopeTreeParts(f, mT, mC)],
        list.map(p => ({ x: p[0], z: p[1], y: g(p[0], p[1]), ry: p[5], s: p[3] / h0 })), { hit: { r: 0.35, h: 4 }, far: 500 });
    }
    if (bushItems.length) {
      const f = kit.forms.garden2, h0 = 1.3, r0 = 0.95;
      sitgesTreeMats(f, 0, 0, 0, h0, r0, 0, mT, mC);
      S.place([...stSlopeTreeParts(f, mT, mC)],
        bushItems.map(b => ({ x: b[0], z: b[1], y: g(b[0], b[1]), ry: b[4], s: b[2] / h0 })),
        { brk: { mass: 40, minSpeed: 1, cy: 0.5, lie: 1.3, light: true, kind: 'wood' }, hit: { r: 0.45, h: 1.1 }, far: 400 });
    }

    /* ---------- бассейны: вода и бортик ---------- */
    const PL = P.pool, water = S.mesh('water', M.water, { chunk: 320, far: 600, uv: false, shadow: false });
    const rim = S.mesh('rim', M.rim, { chunk: 320, far: 450, uv: false });
    for (const pool of L.pools) {
      const r = pool.ring, n = r.length, y = pool.y, yr = y + PL.rimH;
      const tri = THREE.ShapeUtils.triangulateShape(r.map(([x, z]) => new THREE.Vector2(x, z)), []);
      const Wv = water.at(r[0][0], r[0][1]);
      for (const [a, b, c] of tri) Wv.poly([[r[a][0], y, r[a][1]], [r[b][0], y, r[b][1]], [r[c][0], y, r[c][1]]], null, [0, 1, 0]);
      // бортик: наружу на rim м (нормаль ребра — от контура; обход против часовой, внутрь — слева)
      const out = r.map((p, k) => {
        const q0 = r[(k + n - 1) % n], q1 = r[(k + 1) % n];
        const e0 = [p[0] - q0[0], p[1] - q0[1]], e1 = [q1[0] - p[0], q1[1] - p[1]], l0 = Math.hypot(...e0) || 1, l1 = Math.hypot(...e1) || 1;
        let nx = e0[1] / l0 + e1[1] / l1, nz = -e0[0] / l0 - e1[0] / l1;
        const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
        const s = Math.min(2, 1 / Math.max(0.3, (nx * e1[1] - nz * e1[0]) / l1));
        return [p[0] + nx * PL.rim * s, p[1] + nz * PL.rim * s];
      });
      const Rv = rim.at(r[0][0], r[0][1]);
      for (let k = 0; k < n; k++) {
        const k1 = (k + 1) % n, A = r[k], B = r[k1], Ao = out[k], Bo = out[k1];
        Rv.poly([[A[0], yr, A[1]], [B[0], yr, B[1]], [Bo[0], yr, Bo[1]], [Ao[0], yr, Ao[1]]], null, [0, 1, 0]);
        Rv.poly([[A[0], y - 0.3, A[1]], [B[0], y - 0.3, B[1]], [B[0], yr, B[1]], [A[0], yr, A[1]]], null, [(A[0] + B[0]) / 2 - (Ao[0] + Bo[0]) / 2, 0, (A[1] + B[1]) / 2 - (Ao[1] + Bo[1]) / 2]);
        const ga = g(Ao[0], Ao[1]), gb = g(Bo[0], Bo[1]);
        if (ga < yr - 0.02 || gb < yr - 0.02)
          Rv.poly([[Ao[0], Math.min(ga, yr) - 0.1, Ao[1]], [Bo[0], Math.min(gb, yr) - 0.1, Bo[1]], [Bo[0], yr, Bo[1]], [Ao[0], yr, Ao[1]]], null, [(Ao[0] + Bo[0]) / 2 - (A[0] + B[0]) / 2, 0, (Ao[1] + Bo[1]) / 2 - (A[1] + B[1]) / 2]);
      }
    }

    S.collider(cv, ci);
    S.flush();
    S.count(nW + L.cliff.length + plazaQ + L.rings.length + L.pools.length);
  },
};

/* ==================== материалы деревьев колец (без растворения ближних) ==================== */
// у общих материалов набора sitgesTreeKit() — растворение ближних моделей вдали (sitgesTreeCut, trees3d.js): здесь
// свои, с тем же качанием листвы (как в sitgesTreeKit)
const stSlopeTreeMatsCache = new Map();
// материал листвы leaf ('leaf' | 'tall' | 'palm') с качанием между высотами y0…y1 запечённой кроны (у набора — −1…0);
// без leaf — кора
function stSlopeTreeMats(leaf, y0, y1) {
  const key = leaf ? leaf + y0.toFixed(2) + y1.toFixed(2) : 'bark';
  let m = stSlopeTreeMatsCache.get(key);
  if (m) return m;
  const SW = { leaf: [0.28, 0.5], tall: [0.4, 0.05], palm: [0.45, 0.25] };
  if (!leaf) m = stdMat(0xffffff, { flatShading: true, vertexColors: true, roughness: 0.95 });
  else m = Breeze.sway(stdMat(0xffffff, Object.assign({ flatShading: true, vertexColors: true, roughness: 0.9 }, leaf === 'palm' ? { side: THREE.DoubleSide, roughness: 0.8 } : {})), SW[leaf][0], y0, y1, SW[leaf][1]);
  m.userData.shared = true;
  stSlopeTreeMatsCache.set(key, m);
  return m;
}

/* ==================== текстуры (один раз на страницу) ==================== */
let stSlopeTexCache = null;
function stSlopeTex() {
  if (stSlopeTexCache) return stSlopeTexCache;
  const rng = mulberry32(731), Cc = stSlopeCfg.colors;
  const cv = (w, h, base) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = base; x.fillRect(0, 0, w, h); return [c, x]; };
  // цвет холста — в sRGB, как записан (THREE.Color хранит линейный)
  const col = (hex, f, dr = 0, dg = 0, db = 0) => { const v = parseInt(hex.slice(1), 16), ch = (s, d) => clamp(((v >> s) & 255) * f + d, 0, 255) | 0; return `rgb(${ch(16, dr)},${ch(8, dg)},${ch(0, db)})`; };
  const tex = c => { const t = canvasTex(c); t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.userData = { shared: true }; return t; };
  const grain = (x, w, h, n, a) => { for (let i = 0; i < n; i++) { x.fillStyle = rng() < 0.5 ? `rgba(255,255,255,${rng() * a})` : `rgba(0,0,0,${rng() * a})`; x.fillRect(rng() * w, rng() * h, 1 + rng() * 2, 1 + rng() * 2); } };
  // бут (sv/slope 12, 07; h-church-01): серо-бежевые и охристые камни 0,12–0,35 м в светлом растворе, 2 м на 512 px
  const [cr, xr] = cv(512, 512, Cc.mortar);
  for (let i = 0; i < 520; i++) {
    const x = rng() * 512, y = rng() * 512, rw = 12 + rng() * 34, rh = 9 + rng() * 20, rot = (rng() - 0.5) * 0.5;
    const fill = col(Cc.stones[Math.floor(rng() * Cc.stones.length)], 0.9 + rng() * 0.16);
    for (const dx of [-512, 0, 512]) for (const dy of [-512, 0, 512]) {
      xr.fillStyle = 'rgba(70,60,50,0.22)'; xr.beginPath(); xr.ellipse(x + dx + 1.5, y + dy + 2.5, rw, rh, rot, 0, Math.PI * 2); xr.fill();
      xr.fillStyle = fill; xr.beginPath(); xr.ellipse(x + dx, y + dy, rw, rh, rot, 0, Math.PI * 2); xr.fill();
    }
  }
  grain(xr, 512, 512, 9000, 0.08);
  // скала мыса (landmarks/sebastia c-18, church game-01): серо-бежевый известняк глыбами, слабые пласты, трещины;
  // 4 м на 256 px
  const [ck, xk] = cv(256, 256, col(Cc.rock, 1));
  for (let i = 0; i < 140; i++) {
    const cx = rng() * 256, cy = rng() * 256, r = 8 + rng() * 26, n = 5 + Math.floor(rng() * 3), sh = 0.86 + rng() * 0.24, ochre = rng() < 0.3 ? 10 : 0;
    const pts = Array.from({ length: n }, (_, q) => { const a = q / n * Math.PI * 2 + rng() * 0.6, rr = r * (0.6 + rng() * 0.5); return [Math.cos(a) * rr, Math.sin(a) * rr * 0.6]; });
    for (const dx of [-256, 0, 256]) for (const dy of [-256, 0, 256]) {
      xk.fillStyle = 'rgba(50,42,34,0.18)'; xk.beginPath(); pts.forEach(([px, py], q) => q ? xk.lineTo(cx + dx + px + 1.5, cy + dy + py + 2.5) : xk.moveTo(cx + dx + px + 1.5, cy + dy + py + 2.5)); xk.fill();
      xk.fillStyle = col(Cc.rock, sh, ochre, ochre * 0.5, -ochre * 0.6); xk.beginPath(); pts.forEach(([px, py], q) => q ? xk.lineTo(cx + dx + px, cy + dy + py) : xk.moveTo(cx + dx + px, cy + dy + py)); xk.fill();
    }
  }
  for (let i = 0; i < 60; i++) {
    xk.strokeStyle = `rgba(40,30,20,${0.15 + rng() * 0.25})`; xk.lineWidth = 1 + rng() * 1.5;
    let x = rng() * 256, y = rng() * 256; xk.beginPath(); xk.moveTo(x, y);
    for (let q = 0; q < 4; q++) { x += (rng() - 0.5) * 20; y += 4 + rng() * 14; xk.lineTo(x, y); }
    xk.stroke();
  }
  grain(xk, 256, 256, 5000, 0.12);
  // плиты площади (c-08, c-15): светлые 0,6 × 0,3 м вперевязку, 2,4 м на 256 px
  const [cp, xp] = cv(256, 256, col(Cc.paving, 0.8));
  for (let r = 0; r < 8; r++) for (let c = -1; c < 4; c++) { xp.fillStyle = col(Cc.paving, 0.93 + rng() * 0.1); xp.fillRect(c * 64 + (r % 2) * 32 + 1, r * 32 + 1, 62, 30); }
  grain(xp, 256, 256, 3500, 0.06);
  // газон острова: 3 м на 128 px
  const [cl, xl] = cv(128, 128, Cc.lawn);
  for (let i = 0; i < 1100; i++) { xl.fillStyle = rng() < 0.5 ? `rgba(130,160,80,${rng() * 0.25})` : `rgba(25,55,15,${rng() * 0.3})`; xl.fillRect(rng() * 128, rng() * 128, 2 + rng() * 4, 2 + rng() * 4); }
  return stSlopeTexCache = { rubble: tex(cr), rock: tex(ck), paving: tex(cp), lawn: tex(cl) };
}
