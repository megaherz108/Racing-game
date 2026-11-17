// Ситжес — РАСКЛАДКА: здания. После улиц (js/maps/sitges/roads.js): рельеф уже с выемками, ширины улиц известны.
//   Высоты — у каждой части кадастра: низ стен (под самой низкой точкой контура), крыша и уровень первого этажа
//     base = крыша − sitgesHeight(этажи): от него шейдер фасада (js/maps/sitges/facade.js) отсчитывает этажи.
//   Общие стены — ребро контура, вдоль которого встречно (ближе tol) идёт ребро соседней части, закрыто ею по её
//     высоте: рисуем только то, что выше (или ниже проезда соседа). Над соседом из другого дома — глухая стена
//     (брандмауэр), над своей частью — фасад с окнами.
//   Фасады к улице — открытые куски стен, перед которыми проезжая часть или тротуар: на первом этаже витрины и двери.
//   Проезды — части от 2 этажей, сквозь которые идёт проезжая улица (в OSM — короткий тоннель): низ поднят
//     на clear м над улицей, снизу — потолок, коллайдер — тоже от него.
// C.houses — части: { b, p, rings, y0, y1, base, pass, walls }; кусок стены — { ax, az, bx, bz, ua, ub, ga, gb,
//   lo, hi, nx, nz, kind }: концы, номер оконной оси на концах, земля у концов, низ и верх, нормаль наружу, вид.
//   C.houseAt(x, z) — часть дома под точкой (или undefined).
// Определяет: SITGES_H, SITGES_WALL, SITGES_SHOPS, sitgesPlanHouses.
// Использует: SITGES_DRIVE (js/maps/sitges/minimap.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const SITGES_H = {
  tol: 0.35,        // ребро соседа ближе стольких метров к прямой ребра и встречно (≤ 5,7°) — общая стена
  col: 3.1,         // шаг оконных осей вдоль стены, м (число осей на ребре — целое: окна не режутся углом)
  minCol: 1.7,      // ребро короче — без окон
  street: [0.6, 1.8], // фасад к улице: проезжая часть с тротуаром (запас sw) — на таком удалении перед стеной
  sw: 4.0,
  clear: 4.4,       // просвет проезда под домом над улицей, м
};
// вид куска стены (атрибут шейдера фасада): двор / глухая / к улице (жилой) / к улице (магазины); 4 — крыша
const SITGES_WALL = { yard: 0, blind: 1, street: 2, shops: 3, roof: 4 };
const SITGES_SHOPS = new Set(['4_2_retail', '4_1_office', '4_3_publicServices']);

function sitgesPlanHouses(C) {
  const { blds, ground, streets, carriageAt } = C, P = SITGES_H, W = SITGES_WALL;
  const houses = [];
  const st = { parts: 0, edges: 0, shared: 0, pieces: 0, blind: 0, street: 0, pass: 0, wallArea: 0, hidden: 0 };

  /* ---------- высоты на рельефе ---------- */
  blds.forEach((b, bi) => b.parts.forEach(p => {
    // низ стен — под самой низкой точкой контура, крыша — над серединой между низкой и высокой (на склоне дом
    // со стороны горы ниже), но не ниже 2,6 м над самой высокой
    const gs = p.rings[0].map(([x, z]) => ground(x, z)), g0 = Math.min(...gs), g1 = Math.max(...gs);
    const y1 = Math.max((g0 + g1) / 2 + p.h, g1 + 2.6);
    houses.push({ bi, b, p, rings: p.rings, y0: g0 - 0.5, y1, base: y1 - p.h, pass: false, walls: [] });
  }));

  /* ---------- проезды под домами ---------- */
  const inRing = (x, z, r) => {
    let ins = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, zi] = r[i], [xj, zj] = r[j];
      if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) ins = !ins;
    }
    return ins;
  };
  const HC = 32, hcell = new Map();
  houses.forEach(h => {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of h.rings[0]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    h.box = [x0, x1, z0, z1];
    for (let i = Math.floor(x0 / HC); i <= Math.floor(x1 / HC); i++) for (let j = Math.floor(z0 / HC); j <= Math.floor(z1 / HC); j++) {
      const k = i * 65536 + j; let l = hcell.get(k); if (!l) hcell.set(k, l = []); l.push(h);
    }
  });
  const houseAt = (x, z) => (hcell.get(Math.floor(x / HC) * 65536 + Math.floor(z / HC)) || []).find(h =>
    x > h.box[0] && x < h.box[1] && z > h.box[2] && z < h.box[3] && inRing(x, z, h.rings[0]) && !h.rings.slice(1).some(r => inRing(x, z, r)));
  for (const s of streets) {
    if (!SITGES_DRIVE.has(s.cls)) continue;
    for (let i = 0; i < s.v.length; i++) for (const f of i ? [0, 0.5] : [0]) {
      const q = s.v[i], a = f ? s.v[i - 1] : q, x = (q.x + a.x) / 2, z = (q.z + a.z) / 2, y = (q.y + a.y) / 2;
      const h = houseAt(x, z);
      if (!h || h.p.floors < 2) continue;
      h.passY = Math.max(h.passY ?? -Infinity, y + P.clear);
    }
  }
  for (const h of houses) if (h.passY !== undefined && h.passY < h.y1 - 2.5) { h.pass = true; h.y0 = h.passY; st.pass++; }

  /* ---------- рёбра и общие стены ---------- */
  const E = [], EC = 8, ecell = new Map();
  houses.forEach((h, hi) => h.rings.forEach((r, ri) => {
    // внешнее кольцо — против часовой (в осях x, z), дыры — по часовой; знак — по площади, на случай исключений
    let A = 0;
    for (let i = 0; i < r.length; i++) { const [ax, az] = r[i], [bx, bz] = r[(i + 1) % r.length]; A += ax * bz - bx * az; }
    const sgn = (ri === 0) === (A > 0) ? 1 : -1;
    for (let i = 0; i < r.length; i++) {
      const [ax, az] = r[i], [bx, bz] = r[(i + 1) % r.length], L = Math.hypot(bx - ax, bz - az);
      if (L < 0.01) continue;
      const e = { hi, ax, az, bx, bz, L, ux: (bx - ax) / L, uz: (bz - az) / L, nx: sgn * (bz - az) / L, nz: -sgn * (bx - ax) / L, cov: [] };
      E.push(e);
      for (let ci = Math.floor(Math.min(ax, bx) / EC); ci <= Math.floor(Math.max(ax, bx) / EC); ci++)
        for (let cj = Math.floor(Math.min(az, bz) / EC); cj <= Math.floor(Math.max(az, bz) / EC); cj++) {
          const k = ci * 65536 + cj; let l = ecell.get(k); if (!l) ecell.set(k, l = []); l.push(e);
        }
    }
  }));
  const seen = new Set();
  for (const e of E) {
    seen.clear();
    for (let ci = Math.floor(Math.min(e.ax, e.bx) / EC); ci <= Math.floor(Math.max(e.ax, e.bx) / EC); ci++)
      for (let cj = Math.floor(Math.min(e.az, e.bz) / EC); cj <= Math.floor(Math.max(e.az, e.bz) / EC); cj++)
        for (const f of ecell.get(ci * 65536 + cj) || []) {
          if (f.hi === e.hi || seen.has(f)) continue;
          seen.add(f);
          if (e.ux * f.ux + e.uz * f.uz > -0.995) continue;
          const d0 = (f.ax - e.ax) * -e.uz + (f.az - e.az) * e.ux, d1 = (f.bx - e.ax) * -e.uz + (f.bz - e.az) * e.ux;
          if (Math.abs(d0) > P.tol || Math.abs(d1) > P.tol) continue;
          const t0 = (f.ax - e.ax) * e.ux + (f.az - e.az) * e.uz, t1 = (f.bx - e.ax) * e.ux + (f.bz - e.az) * e.uz;
          const lo = Math.max(0, Math.min(t0, t1)), hi = Math.min(e.L, Math.max(t0, t1));
          if (hi - lo > 0.05) e.cov.push([lo, hi, houses[f.hi]]);
        }
  }

  /* ---------- куски стен ---------- */
  // перед стеной улица: проезжая часть с тротуаром в паре метров от фасада
  const facesStreet = (x, z, nx, nz) => P.street.some(d => !!carriageAt(x + nx * d, z + nz * d, null, P.sw));
  for (const e of E) {
    const h = houses[e.hi], shops = SITGES_SHOPS.has(h.b.use);
    st.edges++; st.wallArea += e.L * (h.y1 - h.y0);
    if (e.cov.length) st.shared++;
    // оконные оси: целое число на ребре; номер первой — свой у каждого ребра (по нему шейдер выбирает витрину / дверь)
    const n = e.L >= P.minCol ? Math.max(1, Math.round(e.L / P.col)) : 0, u0 = (st.edges * 37) % 509;
    // точки раздела по длине ребра
    const ts = [0, e.L];
    for (const [lo, hi] of e.cov) ts.push(lo, hi);
    ts.sort((a, b) => a - b);
    const out = [];
    for (let k = 0; k + 1 < ts.length; k++) {
      const t0 = ts[k], t1 = ts[k + 1];
      if (t1 - t0 < 0.02) continue;
      const tm = (t0 + t1) / 2, nb = e.cov.filter(c => c[0] <= tm && c[1] >= tm).map(c => c[2]);
      // по высоте: [y0, y1] минус отрезки соседей [y0, y1]
      let segs = [[h.y0, h.y1, null, null]];          // низ, верх, сосед снизу (над ним), сосед сверху (под ним)
      for (const o of nb) {
        const next = [];
        for (const s of segs) {
          if (o.y1 <= s[0] || o.y0 >= s[1]) { next.push(s); continue; }
          if (o.y0 > s[0]) next.push([s[0], o.y0, s[2], o]);
          if (o.y1 < s[1]) next.push([o.y1, s[1], o, s[3]]);
        }
        segs = next;
      }
      for (const [lo, hi, below, above] of segs) {
        if (hi - lo < 0.05) continue;
        if (above && !above.pass) continue;                         // ниже низа соседа на склоне — под землёй
        let kind;
        if (n === 0 || above) kind = W.blind;                       // узкий простенок; стена в проезде соседа
        else if (below) kind = below.bi === h.bi ? W.yard : W.blind; // над своей частью — фасад, над чужой — брандмауэр
        else kind = -1;                                             // открытая стена: к улице или во двор — ниже
        const prev = out[out.length - 1];
        if (prev && prev.lo === lo && prev.hi === hi && prev.k === kind && Math.abs(prev.t1 - t0) < 0.02) prev.t1 = t1;
        else out.push({ t0, t1, lo, hi, k: kind });
      }
    }
    for (const s of out) {
      st.hidden -= (s.t1 - s.t0) * (s.hi - s.lo);
      const ax = e.ax + e.ux * s.t0, az = e.az + e.uz * s.t0, bx = e.ax + e.ux * s.t1, bz = e.az + e.uz * s.t1;
      let kind = s.k;
      if (kind < 0) kind = facesStreet((ax + bx) / 2, (az + bz) / 2, e.nx, e.nz) ? (shops ? W.shops : W.street) : W.yard;
      if (kind === W.blind) st.blind++;
      if (kind === W.street || kind === W.shops) st.street++;
      h.walls.push({ ax, az, bx, bz, ua: u0 + s.t0 * n / e.L, ub: u0 + s.t1 * n / e.L, ga: ground(ax, az), gb: ground(bx, bz), lo: s.lo, hi: s.hi, nx: e.nx, nz: e.nz, kind });
      st.pieces++;
    }
  }
  st.hidden += st.wallArea;
  st.parts = houses.length;
  Object.assign(C, { houses, houseAt, houseStats: st });
}
