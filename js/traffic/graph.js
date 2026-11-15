// Трафик — светофоры и дорожный граф.
// trafficLight(x, z, axis, t) — фаза светофора (общая для визуала карты и ботов).
// buildTrafficGraph(world.trafficData) — полосы и перекрёстки для ботов; участки маршрута: tPiece, tPieceIdx, tPieceAt, tPieceMinR,
//   tPieceProject, turnPiece (повороты — кривые Безье, на кольце — дуга).
// Определяет: LIGHT_CYCLE, trafficLight, buildTrafficGraph, lanePoint, tPiece, tPieceIdx, tPieceAt, tPieceProject,
//   tPieceMinR, turnPiece.
// Использует: clamp (js/core.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

/* =====================================================================
   СВЕТОФОРЫ (общие для визуала карты и ботов)
   ===================================================================== */
// с: по оси z 11 зелёный + 2 жёлтый, 1 с все красные, затем то же по оси x
const LIGHT_CYCLE = 28;
function trafficLight(x, z, axis, t) {
  const c = ((t + x * 0.37 + z * 0.11) % LIGHT_CYCLE + LIGHT_CYCLE) % LIGHT_CYCLE;   // у каждого перекрёстка своя фаза
  if (axis === 'z') return c < 11 ? 'g' : c < 13 ? 'y' : 'r';
  return c < 14 ? 'r' : c < 25 ? 'g' : c < 27 ? 'y' : 'r';
}

/* =====================================================================
   ДОРОЖНЫЙ ГРАФ
   ===================================================================== */
// lanes — смещения полос от оси дороги вправо по ходу движения (0 — ближняя к центру)
function buildTrafficGraph(td) {
  const nodes = new Map(), edges = [];
  for (const n of td.nodes) if (n.deg > 0) nodes.set(n.x + ',' + n.z, { x: n.x, z: n.z, wx: n.wx, wz: n.wz, out: [], occ: new Set(), lit: td.lit.has(n.x + ',' + n.z), round: 0 });
  for (const r of td.rounds) { const n = nodes.get(r.x + ',' + r.z); if (n) n.round = r.r + 2.4; }
  const addSeg = (s, a, b, ov = false) => {
    if (!a || !b) return;
    for (const [A, B] of [[a, b], [b, a]]) {
      const dx = B.x - A.x, dz = B.z - A.z, len = Math.hypot(dx, dz);
      const lanes = s.w >= 22 ? [3.2, 7.6] : s.w >= 20 ? [2.9, 6.9] : [3.5];
      const e = { A, B, fx: dx / len, fz: dz / len, len, axis: s.dir, lanes, bridge: s.kind === 'bridge', ov };
      A.out.push(e); edges.push(e);
    }
  };
  for (const s of td.segs) {
    if (s.kind === 'draw' || s.ramp) continue;               // разводной мост и пандусы эстакады — отдельно (ниже) или без трафика
    addSeg(s, nodes.get(s.x0 + ',' + s.z0), nodes.get(s.x1 + ',' + s.z1));
  }
  // эстакада: свои узлы над наземными перекрёстками (ключи 'ov:x,z'), без светофоров; рёбра — пандусы и настил
  if (td.ov) {
    for (const n of td.ov.nodes) nodes.set(n.key, { x: n.x, z: n.z, wx: n.wx, wz: n.wz, out: [], occ: new Set(), lit: false, round: 0 });
    for (const s of td.ov.segs) addSeg(s, nodes.get(s.a), nodes.get(s.b), true);
  }
  // начало и конец полосы — у краёв перекрёстков (за «зеброй»)
  const off = (n, e) => (e.axis === 'z' ? n.wz : n.wx) / 2 + (n.out.length >= 3 ? 4.6 : 1.2);
  for (const e of edges) { e.s0 = off(e.A, e); e.s1 = e.len - off(e.B, e); }
  const ok = edges.filter(e => e.s1 - e.s0 > 6);
  // общий вид ребра (как у кривых дорог Побережья, js/maps/coast/trafficnet.js): полоса — ломаная lp[l],
  // касательные на въезде (ix, iz) и на выезде (ex, ez); у прямых улиц города они совпадают с направлением ребра
  for (const e of edges) { e.ix = e.ex = e.fx; e.iz = e.ez = e.fz; e.lp = e.lanes.map((_, l) => tPiece([lanePoint(e, l, e.s0), lanePoint(e, l, e.s1)])); }
  return { nodes: [...nodes.values()], edges: ok };
}
const lanePoint = (e, l, s) => [e.A.x + e.fx * s - e.fz * e.lanes[l], e.A.z + e.fz * s + e.fx * e.lanes[l]];

// участок маршрута — ломаная с накопленной длиной
function tPiece(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, len: cum[cum.length - 1] };
}
// номер отрезка ломаной, на котором лежит s (первый i с cum[i] ≥ s; двоичный поиск — полосы Побережья длиной до 1 км)
function tPieceIdx(p, s) {
  const c = p.cum;
  let lo = 1, hi = c.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (c[m] < s) lo = m + 1; else hi = m; }
  return lo;
}
function tPieceAt(p, s, out) {
  s = clamp(s, 0, p.len);
  const i = tPieceIdx(p, s);
  const a = p.pts[i - 1], b = p.pts[i], L = p.cum[i] - p.cum[i - 1] || 1, t = (s - p.cum[i - 1]) / L;
  out[0] = a[0] + (b[0] - a[0]) * t; out[1] = a[1] + (b[1] - a[1]) * t; out[2] = (b[0] - a[0]) / L; out[3] = (b[1] - a[1]) / L;
  return out;
}
// проекция точки на ломаную (ищем рядом с текущим положением s)
function tPieceProject(p, x, z, s) {
  const i = tPieceIdx(p, s);
  let best = s, bd = Infinity;
  for (let k = Math.max(1, i - 1); k <= Math.min(p.pts.length - 1, i + 2); k++) {
    const a = p.pts[k - 1], b = p.pts[k], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
    const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / L2, 0, 1), px = a[0] + dx * t, pz = a[1] + dz * t, d = (px - x) ** 2 + (pz - z) ** 2;
    if (d < bd) { bd = d; best = p.cum[k - 1] + Math.sqrt(L2) * t; }
  }
  return [best, Math.sqrt(bd)];
}
// наименьший радиус кривизны участка (по тройкам соседних точек), м
function tPieceMinR(p) {
  let R = Infinity;
  const P = p.pts;
  for (let i = 1; i + 1 < P.length; i++) {
    const a = P[i - 1], b = P[i], c = P[i + 1];
    const ab = Math.hypot(b[0] - a[0], b[1] - a[1]), bc = Math.hypot(c[0] - b[0], c[1] - b[1]), ac = Math.hypot(c[0] - a[0], c[1] - a[1]);
    const ar = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
    if (ar > 1e-6) R = Math.min(R, ab * bc * ac / (4 * ar));
  }
  return R;
}
// путь через перекрёсток: кривая Безье, а на кольцевой развязке — дуга с островком слева
function turnPiece(e, l, ne, nl) {
  const a = e.lp[l].pts, P0 = a[a.length - 1], P2 = ne.lp[nl].pts[0], B = e.B, pts = [P0];
  if (B.round) {
    const a0 = Math.atan2(P0[1] - B.z, P0[0] - B.x), a2 = Math.atan2(P2[1] - B.z, P2[0] - B.x);
    // m — насколько раньше съезда кончается дуга (рад): у тесного кольца пьяццы (рынок по краю) съезд почти радиальный
    const m = B.roundM || 0.3;
    let a1 = a2; while (a1 > a0 - 2 * m) a1 -= Math.PI * 2;    // угол убывает — центр слева по ходу
    for (let a = a0 - m; a > a1 + m; a -= 0.22) pts.push([B.x + Math.cos(a) * B.round, B.z + Math.sin(a) * B.round]);
  } else {
    const dot = e.ex * ne.ix + e.ez * ne.iz, det = e.ex * ne.iz - e.ez * ne.ix, mx = (P0[0] + P2[0]) / 2, mz = (P0[1] + P2[1]) / 2;
    let P1;
    if (dot < -0.9) P1 = [mx + e.ex * 10, mz + e.ez * 10];                       // разворот в тупике
    else if (Math.abs(det) < 0.1) P1 = [mx, mz];                                   // прямо
    else { const dx = P2[0] - P0[0], dz = P2[1] - P0[1], t = (dx * ne.iz - dz * ne.ix) / det; P1 = [P0[0] + e.ex * t, P0[1] + e.ez * t]; }
    for (let k = 1; k < 10; k++) {
      const t = k / 10, u = 1 - t;
      pts.push([u * u * P0[0] + 2 * u * t * P1[0] + t * t * P2[0], u * u * P0[1] + 2 * u * t * P1[1] + t * t * P2[1]]);
    }
  }
  pts.push(P2);
  return tPiece(pts);
}

