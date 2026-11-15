// Побережье — дорожный граф для трафика (js/traffic/): строится из сплайнов дорог (js/maps/coast/roads.js) при первом
// заезде с трафиком, раскладку карты не трогает (rng() не вызывается). Светофоров нет.
//   Дороги: асфальт, гравий, брусчатка; грунтовые тропы и тупик в деревне — без трафика.
//   Узлы: конец дороги, подходящий к другой дороге, «прилипает» к её ближайшей точке (Т-образный перекрёсток), близкие
//   узлы сливаются; пьяцца — кольцо вокруг фонтана (между фонтаном и ящиками рынка); пролёт акведука — отдельное ребро
//   с одной полосой посередине, по нему едут по очереди (narrow), широким машинам туда нельзя (maxW).
//   Рёбра — направленные, у каждого одна полоса: ломаная через 2 м, смещённая вправо по ходу (asphalt 1,75 м, гравий
//   1,35, брусчатка 1,1). Переулки уже 4,6 м — одностороннее движение посередине.
//   На каждую точку полосы: высота полотна (hy) и предельная скорость (vprof) — по радиусу поворота, с запасом на
//   торможение перед следующим поворотом.
//   Главная дорога на перекрёстке — с большим приоритетом (асфальт > гравий > брусчатка), при равном — сквозная.
//   Объезд препятствий: где на полосу попадает неподвижный предмет карты (ярус амфитеатра, угол церкви), ось обеих
//   полос плавно сдвигается вбок (до 4 м), пока полосы не станут свободны; что осталось — в отчёте (blocked).
// coastTrafficNetDebug(world, on) — граф линиями в 3D (цвет — предельная скорость) и отчёт в консоль.
// Определяет: COAST_TRAFFIC_LANE, coastTrafficGraph, trafficGraphReport, coastTrafficNetDebug.
// Использует: scene (js/world.js); tPiece (js/traffic/graph.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

// смещение полосы от оси дороги и приоритет на перекрёстке по виду дороги
const COAST_TRAFFIC_LANE = { asphalt: { off: 1.75, prio: 3 }, gravel: { off: 1.35, prio: 2 }, cobble: { off: 1.1, prio: 1 } };

// grid — сетка неподвижных препятствий построенного мира (StaticGrid, js/world.js)
function coastTrafficGraph(C, grid) {
  const { roads, pads } = C;
  const piazza = pads.find(p => p.id === 'piazza');
  const A_LAT = 2.2, DECEL = 2;                       // боковое ускорение в повороте и торможение перед ним, м/с²
  const ROUND = 7.5;                                  // радиус кольца на пьяцце (фонтан 3,6 м, ящики рынка с 10,8 м)
  const use = roads.filter(r => COAST_TRAFFIC_LANE[r.kind] && r.id !== 'deadEnd');
  // переулки: одностороннее движение; +1 — по ходу опорных точек, −1 — против
  const ONEWAY = { stSE: -1, stS: 1, lnW: 1, lnE: 1, lnS: 1 };

  /* ---------- узлы ---------- */
  // кандидаты в узлы: { x, z, splits: [{ r, i }], round, dead }
  const cand = [];
  const nearestOn = (x, z, skip) => {
    let best = null, bd = Infinity;
    for (const q of use) {
      if (q === skip) continue;
      const lim = Math.max(4, q.hw + 2.5);
      for (let j = 0; j < q.N; j++) {
        const d = Math.hypot(q.pts[j].x - x, q.pts[j].z - z);
        if (d < lim && d < bd) { bd = d; best = { r: q, i: j }; }
      }
    }
    return best;
  };
  for (const r of use) {
    if (r.closed) continue;
    for (const i of [0, r.N - 1]) {
      const p = r.pts[i];
      if (piazza && Math.hypot(p.x - piazza.x, p.z - piazza.z) < piazza.r + 1) {
        cand.push({ x: piazza.x, z: piazza.z, splits: [{ r, i }], round: ROUND });
        continue;
      }
      const h = nearestOn(p.x, p.z, r);
      if (h) cand.push({ x: h.r.pts[h.i].x, z: h.r.pts[h.i].z, splits: [{ r, i }, h], prio: Math.max(r.prio, h.r.prio) });
      else cand.push({ x: p.x, z: p.z, splits: [{ r, i }], dead: true });
    }
  }
  // перекрёстки «крест-накрест»: дороги пересекаются серединами (серпантин и кольцо у деревни). Концы дорог
  // (±4 точки) уже обработаны выше; на разной высоте (мост над дорогой) — не перекрёсток
  const xcross = (a, b) => {
    const A = a.pts, B = b.pts, CH = 20;
    for (let i0 = 0; i0 + 1 < A.length; i0 += CH) {
      const ia = Math.min(A.length - 1, i0 + CH);
      let ax0 = Infinity, ax1 = -Infinity, az0 = Infinity, az1 = -Infinity;
      for (let i = i0; i <= ia; i++) { ax0 = Math.min(ax0, A[i].x); ax1 = Math.max(ax1, A[i].x); az0 = Math.min(az0, A[i].z); az1 = Math.max(az1, A[i].z); }
      for (let j0 = 0; j0 + 1 < B.length; j0 += CH) {
        const jb = Math.min(B.length - 1, j0 + CH);
        let ok = false;
        for (let j = j0; j <= jb && !ok; j++) ok = B[j].x > ax0 - 1 && B[j].x < ax1 + 1 && B[j].z > az0 - 1 && B[j].z < az1 + 1;
        if (!ok) continue;
        for (let i = Math.max(i0, 4); i < Math.min(ia, A.length - 5); i++) for (let j = Math.max(j0, 4); j < Math.min(jb, B.length - 5); j++) {
          const p = A[i], q = A[i + 1], r = B[j], s = B[j + 1];
          const d = (q.x - p.x) * (s.z - r.z) - (q.z - p.z) * (s.x - r.x);
          if (Math.abs(d) < 1e-9) continue;
          const t = ((r.x - p.x) * (s.z - r.z) - (r.z - p.z) * (s.x - r.x)) / d, u = ((r.x - p.x) * (q.z - p.z) - (r.z - p.z) * (q.x - p.x)) / d;
          if (t < 0 || t > 1 || u < 0 || u > 1 || Math.abs(p.h - r.h) > 3) continue;
          cand.push({ x: p.x, z: p.z, splits: [{ r: a, i }, { r: b, i: j }] });
        }
      }
    }
  };
  for (let a = 0; a < use.length; a++) for (let b = a + 1; b < use.length; b++) xcross(use[a], use[b]);
  // пролёт акведука — отдельное узкое ребро: узлы на его концах
  for (const r of use) for (const sp of r.spans) if (sp.type === 'aqueduct')
    for (const i of [sp.i0, sp.i1]) cand.push({ x: r.pts[i].x, z: r.pts[i].z, splits: [{ r, i }], gate: true });
  // близкие кандидаты (≤ 8 м) — один узел; положение — точка самой важной дороги
  const nodes = [];
  for (const c of cand) {
    let n = nodes.find(n => !c.gate && !n.gate && Math.hypot(n.x - c.x, n.z - c.z) < 8);
    if (!n) { nodes.push(n = { x: c.x, z: c.z, splits: [], round: c.round || 0, roundV: 4.2, roundM: 0.15, dead: !!c.dead, gate: !!c.gate, out: [], occ: new Set(), lit: false }); }
    else { n.dead = n.dead && c.dead; if (c.round) n.round = c.round; }
    for (const s of c.splits) if (!n.splits.some(t => t.r === s.r && Math.abs(t.i - s.i) < 5)) n.splits.push(s);
  }
  for (const n of nodes) if (!n.round) {
    let bp = -1;
    for (const s of n.splits) if (s.r.prio > bp) { bp = s.r.prio; n.x = s.r.pts[s.i].x; n.z = s.r.pts[s.i].z; }
  }

  /* ---------- участки дорог между узлами ---------- */
  const segs = [];
  for (const r of use) {
    const sp = [];
    for (const n of nodes) for (const s of n.splits) if (s.r === r) sp.push({ i: s.i, n });
    sp.sort((a, b) => a.i - b.i);
    if (sp.length < (r.closed ? 1 : 2)) { console.warn('Трафик: у дороги', r.id, 'нет узлов'); continue; }
    const cnt = r.closed ? sp.length : sp.length - 1;
    for (let k = 0; k < cnt; k++) {
      const a = sp[k], b = sp[(k + 1) % sp.length], idx = [];
      for (let i = a.i; ; i = (i + 1) % r.N) { idx.push(i); if (i === b.i || idx.length > r.N) break; }
      if (idx.length < 3) continue;
      const pts = idx.map(i => r.pts[i]);
      const narrow = pts.slice(1, -1).every(p => p.span) && r.spans.some(s => s.type === 'aqueduct' && idx[1] >= s.i0 && idx[idx.length - 2] <= s.i1);
      segs.push({ r, A: a.n, B: b.n, pts, narrow, bridge: pts.some(p => p.span) });
    }
  }
  // степень узла — сколько участков в нём сходится (для отступа полосы от перекрёстка)
  for (const n of nodes) { n.deg = 0; n.hwMax = 0; n.narrowNear = false; }
  for (const s of segs) for (const n of [s.A, s.B]) { n.deg++; n.hwMax = Math.max(n.hwMax, s.r.hw); if (s.narrow) n.narrowNear = true; }
  // главная дорога в узле: наибольший приоритет, при равном — сквозная (узел не на её конце)
  for (const n of nodes) {
    const P = s => COAST_TRAFFIC_LANE[s.r.kind].prio;
    let pm = 0; for (const s of n.splits) pm = Math.max(pm, P(s));
    let main = n.splits.filter(s => P(s) === pm);
    const thru = main.filter(s => s.r.closed || (s.i > 0 && s.i < s.r.N - 1));
    if (thru.length) main = thru;
    n.major = new Set(main.map(s => s.r));
  }
  const trimAt = (n, s) => n.round ? 1 : n.dead ? 8 : n.narrowNear ? 5 : n.deg >= 3 ? n.hwMax + 2.5 : 1.5;

  /* ---------- объезд неподвижных препятствий ---------- */
  // точка (x, z) ближе m к препятствию сетки (сбиваемое не в счёт — его сносят)
  const hits = (x, z, m) => {
    if (!grid) return false;
    for (const it of grid.query(x - m - 1, x + m + 1, z - m - 1, z + m + 1)) {
      if (it.brk) continue;
      if (it.obb) {
        const o = it.obb, c = Math.cos(o.rot), s = Math.sin(o.rot), dx = x - o.x, dz = z - o.z;
        if (Math.abs(dx * c - dz * s) < o.w / 2 + m && Math.abs(dx * s + dz * c) < o.d / 2 + m) return true;
      } else if (it.r != null) { if (Math.hypot(x - it.x, z - it.z) < it.r + m) return true; }
      else if (x > it.minX - m && x < it.maxX + m && z > it.minZ - m && z < it.maxZ + m) return true;
    }
    return false;
  };
  // запас: полуширина самой широкой машины, которой можно на этот участок, + 0,1 м
  const marginOf = sg => sg.narrow ? 0.75 : sg.r.kind === 'cobble' ? 0.8 : 1.05;
  const offsOf = sg => sg.narrow || ONEWAY[sg.r.id] ? [0] : [COAST_TRAFFIC_LANE[sg.r.kind].off, -COAST_TRAFFIC_LANE[sg.r.kind].off];
  const clear = (sg, p, d) => offsOf(sg).every(o => !hits(p.x - p.tz * (d + o), p.z + p.tx * (d + o), marginOf(sg)));
  const blocked = [];
  for (const sg of segs) {
    const n = sg.pts.length, need = new Float32Array(n);
    let any = false;
    for (let i = 0; i < n; i++) {
      if (clear(sg, sg.pts[i], 0)) continue;
      for (let k = 1; k <= 16; k++) {
        const d = k * 0.25;
        if (clear(sg, sg.pts[i], d)) { need[i] = d; break; }
        if (clear(sg, sg.pts[i], -d)) { need[i] = -d; break; }
      }
      any = true;
    }
    if (!any) continue;
    // плавно: наибольший сдвиг в окне ±6 точек (12 м), потом среднее по ±5 — съезд в сторону и обратно без рывка
    const R1 = 6, R2 = 5, wide = new Float32Array(n);
    for (let i = 0; i < n; i++) for (let k = Math.max(0, i - R1); k <= Math.min(n - 1, i + R1); k++) if (Math.abs(need[k]) > Math.abs(wide[i])) wide[i] = need[k];
    sg.shift = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0, c = 0;
      for (let k = Math.max(0, i - R2); k <= Math.min(n - 1, i + R2); k++) { s += wide[k]; c++; }
      sg.shift[i] = s / c;
    }
    for (let i = 0; i < n; i++) if (!clear(sg, sg.pts[i], sg.shift[i])) blocked.push(`${sg.r.id} (${sg.pts[i].x | 0}, ${sg.pts[i].z | 0})`);
  }

  /* ---------- направленные рёбра с полосой ---------- */
  const edges = [];
  const mkEdge = (sg, dir, off, mutex) => {
    const src = dir > 0 ? sg.pts : sg.pts.slice().reverse(), A = dir > 0 ? sg.A : sg.B, B = dir > 0 ? sg.B : sg.A;
    let t0 = Math.ceil(trimAt(A, sg) / 2), t1 = Math.ceil(trimAt(B, sg) / 2);
    // короткий участок между близкими перекрёстками: отступы поровну урезаются, чтобы осталось хотя бы 3 точки
    const room = src.length - 3;
    if (t0 + t1 > room) { const k = Math.max(0, room) / (t0 + t1); t0 = Math.floor(t0 * k); t1 = Math.floor(t1 * k); }
    const P = src.slice(t0, src.length - t1);
    if (P.length < 3) return null;
    // сдвиг оси (объезд препятствий) — вдоль участка, для обратного направления — с конца
    const sh = sg.shift ? (dir > 0 ? sg.shift : sg.shift.slice().reverse()).slice(t0, src.length - t1) : null;
    const pts = P.map((p, i) => { const o = dir * off + (sh ? sh[i] : 0); return [p.x - p.tz * o, p.z + p.tx * o]; });
    const piece = tPiece(pts), n = pts.length;
    // радиус поворота по точкам ±3 (6 м) → предельная скорость; потом обратный проход: успеть затормозить
    const vprof = new Float32Array(n), hy = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      hy[i] = P[i].h;
      const a = pts[Math.max(0, i - 3)], b = pts[i], c = pts[Math.min(n - 1, i + 3)];
      const ab = Math.hypot(b[0] - a[0], b[1] - a[1]), bc = Math.hypot(c[0] - b[0], c[1] - b[1]), ac = Math.hypot(c[0] - a[0], c[1] - a[1]);
      const ar = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
      const R = ar > 1e-6 ? ab * bc * ac / (4 * ar) : 1e9;
      vprof[i] = Math.min(30, Math.sqrt(A_LAT * R));
    }
    for (let i = n - 2; i >= 0; i--) vprof[i] = Math.min(vprof[i], Math.sqrt(vprof[i + 1] ** 2 + 2 * DECEL * (piece.cum[i + 1] - piece.cum[i])));
    const tan = (i, j) => { const dx = pts[j][0] - pts[i][0], dz = pts[j][1] - pts[i][1], l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; };
    const [ix, iz] = tan(0, Math.min(2, n - 1)), [ex, ez] = tan(Math.max(0, n - 3), n - 1);
    const e = { A, B, road: sg.r, kind: sg.r.kind, lanes: [off], lp: [piece], hy, vprof, ix, iz, ex, ez, fx: ix, fz: iz, s0: 0, s1: piece.len, len: piece.len,
      bridge: sg.bridge, narrow: mutex, dir, maxW: mutex ? 1.6 : 9, noLong: sg.r.kind === 'cobble', major: B.major.has(sg.r), rev: null };
    // пролёт моста на полосе (для проверки поведения): от и до, м от начала полосы
    const si = []; P.forEach((p, i) => { if (p.span) si.push(i); });
    if (si.length) e.span = { type: sg.r.bridge, s0: piece.cum[si[0]], s1: piece.cum[si[si.length - 1]] };
    A.out.push(e); edges.push(e);
    return e;
  };
  for (const sg of segs) {
    const L = COAST_TRAFFIC_LANE[sg.r.kind];
    if (sg.narrow) {
      const mutex = { n: 0, dir: 0 };
      const f = mkEdge(sg, 1, 0, mutex), b = mkEdge(sg, -1, 0, mutex);
      if (f && b) { f.rev = b; b.rev = f; }
    } else if (ONEWAY[sg.r.id]) mkEdge(sg, ONEWAY[sg.r.id], 0, null);
    else {
      const f = mkEdge(sg, 1, L.off, null), b = mkEdge(sg, -1, L.off, null);
      if (f && b) { f.rev = b; b.rev = f; }
    }
  }
  const G = { nodes: nodes.filter(n => n.out.length || edges.some(e => e.B === n)), edges, coast: true };
  G.report = trafficGraphReport(G);
  G.report.shifted = segs.filter(s => s.shift).map(s => s.r.id);
  G.report.blocked = [...new Set(blocked)].slice(0, 10);
  return G;
}

// сводка по графу: узлы по степеням, длина полос, тупики, связность (из любого ребра можно доехать до любого,
// как ездит водитель: без разворота, кроме тупиков)
function trafficGraphReport(G) {
  const { nodes, edges } = G, id = new Map(edges.map((e, k) => [e, k]));
  const next = e => { let o = e.B.out.filter(o => o !== e.rev); if (!o.length) o = e.B.out; return o; };
  // компоненты сильной связности (Косараю) на графе «ребро → следующие рёбра»
  const order = [], seen = new Uint8Array(edges.length);
  for (let s = 0; s < edges.length; s++) {
    if (seen[s]) continue;
    const st = [[s, 0]]; seen[s] = 1;
    while (st.length) {
      const top = st[st.length - 1], nx = next(edges[top[0]]);
      if (top[1] < nx.length) { const k = id.get(nx[top[1]++]); if (!seen[k]) { seen[k] = 1; st.push([k, 0]); } }
      else { order.push(top[0]); st.pop(); }
    }
  }
  const prev = edges.map(() => []);
  edges.forEach((e, k) => { for (const o of next(e)) prev[id.get(o)].push(k); });
  const comp = new Int32Array(edges.length).fill(-1);
  let nc = 0;
  for (let q = order.length - 1; q >= 0; q--) {
    const s = order[q]; if (comp[s] >= 0) continue;
    const st = [s]; comp[s] = nc;
    while (st.length) { const k = st.pop(); for (const p of prev[k]) if (comp[p] < 0) { comp[p] = nc; st.push(p); } }
    nc++;
  }
  const size = new Array(nc).fill(0); for (const c of comp) size[c]++;
  const big = size.indexOf(Math.max(...size));
  const cut = edges.filter((e, k) => comp[k] !== big).map(e => e.road ? e.road.id : '?');
  const deg = {}; for (const n of nodes) { const d = n.round ? 'кольцо' : n.out.length; deg[d] = (deg[d] || 0) + 1; }
  let len = 0, vmin = Infinity; for (const e of edges) { len += e.len; if (e.vprof) for (const v of e.vprof) vmin = Math.min(vmin, v); }
  return { nodes: nodes.length, edges: edges.length, laneKm: +(len / 1000).toFixed(2), byOut: deg, dead: nodes.filter(n => n.dead).length,
    narrow: edges.filter(e => e.narrow).length, vmin: +vmin.toFixed(1), components: nc, outside: [...new Set(cut)] };
}

// граф линиями в 3D: полосы (красный — медленно, зелёный — быстро), узлы — столбики; повторный вызов с on=false убирает
function coastTrafficNetDebug(w, on = true) {
  if (w.__netDbg) { scene.remove(w.__netDbg); w.__netDbg.traverse(o => { if (o.geometry) o.geometry.dispose(); }); w.__netDbg = null; }
  if (!on) return null;
  const G = w.__trafficGraph || (w.__trafficGraph = w.trafficGraph());
  const pos = [], col = [], g = new THREE.Group();
  const c = new THREE.Color();
  for (const e of G.edges) {
    const P = e.lp[0].pts;
    for (let i = 1; i < P.length; i++) for (const k of [i - 1, i]) {
      const y = e.hy ? e.hy[k] : w.ground(P[k][0], P[k][1]);
      pos.push(P[k][0], y + 0.4, P[k][1]);
      c.setHSL(Math.min(1, (e.vprof ? e.vprof[k] : 10) / 14) * 0.33, 1, e.narrow ? 0.75 : 0.5); col.push(c.r, c.g, c.b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false })));
  for (const n of G.nodes) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 6, 6), new THREE.MeshBasicMaterial({ color: n.dead ? 0xff2020 : n.round ? 0x20a0ff : n.gate ? 0xffffff : 0xffd020 }));
    m.position.set(n.x, w.ground(n.x, n.z) + 3, n.z); g.add(m);
  }
  g.renderOrder = 10; scene.add(g); w.__netDbg = g;
  console.log('Граф трафика:', JSON.stringify(G.report));
  return G.report;
}
