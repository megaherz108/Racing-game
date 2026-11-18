// Ситжес — РАСКЛАДКА: улицы и железная дорога. После рельефа (js/maps/sitges/terrain.js), до мини-карты.
//   Склейка — участки одной улицы (OSM режет их на перекрёстках и мостах), сходящиеся концами по двое, — в одну
//     ломаную; точки через ≤ SITGES_R.step м, у каждого отрезка — флаги «мост» / «тоннель».
//   Ширина «от забора до забора»: в каждой точке луч поперёк улицы до стены здания и до границы участка кадастра
//     с обеих сторон (медиана по соседним точкам). Внутри — тротуары по норме класса, проезжая часть — остаток (не уже
//     полос старой нормы, если влезает до фасадов, — старый город; не шире cwMax); участков нет — норма cw.
//     Тротуар — что осталось до границы, не шире нормы класса; уже minWalk — улица в одном уровне от стены до стены.
//   Пересечения с ж/д: в одном уровне — переезд; мост / тоннель (по OSM) — путепровод: верхняя линия на пролёте —
//     настил по прямой между высотами краёв, нижняя опускается под него (просвет clear) с уклоном grade; в рельефе
//     под ней — выемка с откосами (bank). Рельеф игровой сетки меняется здесь, до домов.
//   Ровное полотно (sitgesEvenRoads) — до профилей: рельеф сетки под улицами и путями сглажен (горбы лидара убраны).
//   carriageAt(x, z) — проезжая часть под точкой: покрытие, обрезка тротуаров на перекрёстках, монеты.
// Определяет: SITGES_R, sitgesPlanRoads, sitgesEvenRoads.
// Использует: clamp (js/core.js); smooth01 (js/world.js); SITGES_T (js/maps/sitges/terrain.js); SITGES_DRIVE
//   (js/maps/sitges/minimap.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const SITGES_R = {
  // lane, park — полоса и парковка вдоль односторонки: проезжая часть не уже этого, если влезает до фасадов
  // (старый город); cw — [односторонка, двусторонняя]: ширина, если участков рядом нет; cwMax — шире не бывает;
  // swN — тротуар по норме (от забора до забора: тротуары, проезжая часть — остаток); sw — тротуар не шире
  // (0 — мостовая в одном уровне); w — ширина, если она не от полос; surf — покрытие, если в OSM не указано
  cls: {
    secondary: { lane: 3.3, park: 2.2, cw: [7.0, 8.0], cwMax: [9, 12], swN: 2.5, sw: 3.5, surf: 'asphalt' },
    tertiary: { lane: 3.1, park: 2.2, cw: [6.5, 7.4], cwMax: [8, 10], swN: 2.2, sw: 3.0, surf: 'asphalt' },
    unclassified: { lane: 3.0, park: 0, cw: [5.5, 6.5], cwMax: [7, 8], swN: 1.8, sw: 2.0, surf: 'asphalt' },
    residential: { lane: 2.9, park: 2.0, cw: [6.0, 7.0], cwMax: [7, 9], swN: 1.9, sw: 2.4, surf: 'asphalt' },
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
  swMin: 1.2,         // тесно: тротуары ужимаются до стольких метров ради проезжей части по норме cw
  shift: { max: 1.5, taper: 12 },   // ось к середине между границами: не дальше max м, у концов улицы — на taper м
  // скруглённые углы: r — радиус бордюра по классу, м; касание не дальше dMax м от K и не дальше доли share рукава
  // до соседнего узла; look — направление рукава по точке не ближе стольких метров; угол между рукавами — в пределах
  // [minAng, maxAng] (рад); far — K дальше от узла — не угол
  // rMin — меньше не скругляем; snap — конец улицы ближе к отрезку другой — узел; ringMin — кольцевые улицы короче
  // (круговое движение) без углов; dev — касание дальше от настоящего бордюра (рукав круто изгибается) — угол острый
  corner: { r: { secondary: 7, tertiary: 6, unclassified: 5, residential: 5, living_street: 4, service: 3.5 }, dMax: 10,
    share: 0.48, look: 6, minAng: 0.2, maxAng: 2.8, far: 25, rMin: 0.3, snap: 0.6, ringMin: 150, dev: 0.5 },
  ray: 30,            // фасад дальше — нет фасада
  longTunnel: 60,     // тоннели длиннее — настоящие (в рельефе их нет): не рисуем
  clear: 5.4,         // путепровод: от верха настила до дороги / рельсов под ним, м
  grade: { road: 0.1, rail: 0.03 },   // уклон спуска под путепровод
  railHalf: 2.4,      // полуширина выемки под путь, м
  span: 3,            // настил шире нижней линии на столько метров с каждой стороны
  bank: 0.9,          // откос выемки, м на м
  // подходы к мостам OSM: плечо — пока рельеф к краю моста поднимается круче rise м на м, не дальше ext м;
  // насыпь под подходом — откос fillBank м на м
  approach: { rise: 0.04, ext: 25, fillBank: 0.35 },
  // ровное полотно: рельеф под улицами (проезжая часть и тротуары) и путями сглажен — в лидаре 10 м горбы 0,2–1,4 м
  // на 10–20 м, настоящий асфальт ровный. Среднее по узлам полотна в круге rad·sigma м (вес — Гаусс sigma м,
  // соседи выше / ниже на range м и больше не берутся: улица уровнем выше на склоне не тянет к себе); за краем
  // полотна — переход к рельефу на edge м; passes — сколько раз
  even: { sigma: 6, rad: 2, range: 4, edge: 4, passes: 2 },
};

function sitgesPlanRoads(C) {
  const { roads, rails, blds, parcels, terra: T } = C, P = SITGES_R;
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
  // точки через ≤ step м; у точки — флаги отрезка, который из неё выходит; nd — исходная вершина (узел), k — её ключ;
  // ox, oz — положение до сдвига оси к середине между участками.
  // Все поля — сразу и в одном порядке: точки улиц читают очень часто (carriageAt), разные «формы» объектов
  // замедляют чтение в 2–3 раза
  const pt = (x, z, br, tn, k, nd) => ({ x, z, ox: x, oz: z, br, tn, k, nd, tx: 0, tz: 0, s: 0, hw: 0, sw: null, fac: null, lot: null, y: 0, deck: false, cut: false });
  const resample = w => {
    const v = [];
    for (let i = 0; i + 1 < w.pts.length; i++) {
      const [ax, az] = w.pts[i], [bx, bz] = w.pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / P.step));
      for (let k = 0; k < n; k++) v.push(pt(ax + (bx - ax) * k / n, az + (bz - az) * k / n, w.sb[i], w.st[i], k ? 0 : key(w.pts[i]), !k));
    }
    const [lx, lz] = w.pts[w.pts.length - 1];
    v.push(pt(lx, lz, false, false, key(w.pts[w.pts.length - 1]), true));
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

  /* ---------- фасады и участки: луч поперёк улицы до стены здания и до границы участка ---------- */
  const EC = 16;
  // рёбра контуров → клетки EC м: [ax, az, ex, ez]
  const edgeGrid = rings => {
    const map = new Map();
    for (const r of rings) for (let i = 0; i < r.length; i++) {
      const [ax, az] = r[i], [bx, bz] = r[(i + 1) % r.length];
      for (let ci = Math.floor(Math.min(ax, bx) / EC); ci <= Math.floor(Math.max(ax, bx) / EC); ci++)
        for (let cj = Math.floor(Math.min(az, bz) / EC); cj <= Math.floor(Math.max(az, bz) / EC); cj++) {
          const k = ci * 65536 + cj;
          if (!map.has(k)) map.set(k, []);
          map.get(k).push([ax, az, bx - ax, bz - az]);
        }
    }
    return map;
  };
  const walls = edgeGrid(blds.flatMap(b => b.parts.flatMap(p => p.rings)));
  const lots = edgeGrid(parcels.map(p => p.ring));
  // участки по клеткам (для «точка внутри участка»)
  const PCs = 32, lotCells = new Map();
  for (const p of parcels) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of p.ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    p.bb = [x0, x1, z0, z1];
    for (let ci = Math.floor(x0 / PCs); ci <= Math.floor(x1 / PCs); ci++)
      for (let cj = Math.floor(z0 / PCs); cj <= Math.floor(z1 / PCs); cj++) {
        const k = ci * 65536 + cj;
        if (!lotCells.has(k)) lotCells.set(k, []);
        lotCells.get(k).push(p);
      }
  }
  const inPoly = (x, z, r) => {
    let c = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [ax, az] = r[i], [bx, bz] = r[j];
      if ((az > z) !== (bz > z) && x < ax + (bx - ax) * (z - az) / (bz - az)) c = !c;
    }
    return c;
  };
  const lotAt = (x, z) => {
    for (const p of lotCells.get(Math.floor(x / PCs) * 65536 + Math.floor(z / PCs)) || [])
      if (x >= p.bb[0] && x <= p.bb[1] && z >= p.bb[2] && z <= p.bb[3] && inPoly(x, z, p.ring)) return p;
    return null;
  };
  const seen = new Set();
  const ray = (edges, x, z, dx, dz) => {
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
  // медиана по 5 соседним точкам (NaN — точка не в счёт; все NaN — Infinity)
  const median = (a, i) => {
    const w = a.slice(Math.max(0, i - 2), i + 3).filter(x => x === x).sort((p, q) => p - q);
    return w.length ? w[w.length >> 1] : Infinity;
  };
  const fin = Number.isFinite;
  const wst = { pts: 0, lot: 0, inLot: 0, fallback: 0, shifted: 0 };
  for (const st of streets) {
    const { K, v, oneway } = st;
    if (st.flat) { for (const q of v) { q.hw = K.w / 2; q.sw = [0, 0]; } continue; }
    // фасады; участки — если точка оси не внутри участка (улица по частной земле или сдвиг OSM — не в счёт)
    const L = v.map(q => ray(walls, q.x, q.z, -q.tz, q.tx)), R = v.map(q => ray(walls, q.x, q.z, q.tz, -q.tx));
    const own = v.map(q => !!K.cw && !!lotAt(q.x, q.z));
    const PL = v.map((q, i) => own[i] ? NaN : K.cw ? ray(lots, q.x, q.z, -q.tz, q.tx) : Infinity);
    const PR = v.map((q, i) => own[i] ? NaN : K.cw ? ray(lots, q.x, q.z, q.tz, -q.tx) : Infinity);
    const d = v.map((q, i) => ({ l: median(L, i), r: median(R, i), pl: median(PL, i), pr: median(PR, i) }));
    // ось — к середине между границами (ось OSM сдвинута от неё в среднем на ≈ 1 м): сдвиг до shift.max, у концов
    // улицы (узлы перекрёстков) и на мостах / в тоннелях — плавно до нуля; улицы, где не помещаются полосы старой
    // нормы и два узких тротуара (старый город), не сдвигаются
    if (K.cw) {
      const S = P.shift, narrow = (oneway ? K.lane + K.park : 2 * K.lane) + 2 * P.swMin, raw = d.map((e, i) => {
        const bl = Math.min(e.l, e.pl), br = Math.min(e.r, e.pr), q = v[i];
        if (!fin(bl) || !fin(br) || bl + br < narrow || q.br || q.tn || (i && (v[i - 1].br || v[i - 1].tn))) return 0;
        return clamp((bl - br) / 2, -S.max, S.max) * clamp(Math.min(q.s, st.len - q.s) / S.taper, 0, 1);
      });
      const off = raw.map((_, i) => { let s = 0, n = 0; for (let k = Math.max(0, i - 2); k <= Math.min(v.length - 1, i + 2); k++) { s += raw[k]; n++; } return s / n; });
      off[0] = off[v.length - 1] = 0;
      v.forEach((q, i) => {
        const o = off[i];
        if (!o) return;
        q.x -= q.tz * o; q.z += q.tx * o;
        const e = d[i]; e.l -= o; e.pl -= o; e.r += o; e.pr += o;
        if (Math.abs(o) > 0.3) wst.shifted++;
      });
      // направление и длина дуги — заново
      let s = 0;
      for (let i = 0; i < v.length; i++) {
        const a = v[Math.max(0, i - 1)], b = v[Math.min(v.length - 1, i + 1)], Ln = Math.hypot(b.x - a.x, b.z - a.z) || 1;
        v[i].tx = (b.x - a.x) / Ln; v[i].tz = (b.z - a.z) / Ln;
        if (i) s += Math.hypot(v[i].x - v[i - 1].x, v[i].z - v[i - 1].z);
        v[i].s = s;
      }
      st.len = s;
    }
    const o = oneway ? 0 : 1;
    v.forEach((q, i) => {
      const { l, r, pl, pr } = d[i];
      q.fac = [l, r]; q.lot = [pl, pr];
      // граница улицы с каждой стороны — ближайшее из фасада и забора
      const bl = Math.min(l, pl), br = Math.min(r, pr);
      if (!K.cw) {                                            // ширина не от полос (служебные, жилые зоны)
        q.hw = Math.max(P.minHalf, Math.min(K.w / 2, bl, br));
      } else {
        // от забора до забора (одна сторона открыта — как другая): тротуары по норме swN, проезжая часть — остаток;
        // тесно — сначала проезжая часть по норме cw, тротуары ужимаются до swMin; не уже полос старой нормы
        // (если влезает до фасадов — старый город) и не шире cwMax; границ нет — норма cw
        const W = fin(bl) && fin(br) ? bl + br : fin(bl) ? 2 * bl : fin(br) ? 2 * br : Infinity;
        const cwMin = oneway ? K.lane + K.park : 2 * K.lane;
        const cw = fin(W) ? clamp(Math.max(W - 2 * K.swN, Math.min(K.cw[o], W - 2 * P.swMin)), cwMin, K.cwMax[o]) : K.cw[o];
        q.hw = Math.max(P.minHalf, Math.min(cw / 2, bl, br));
        wst.pts++;
        if (own[i]) wst.inLot++;
        if (fin(pl) || fin(pr)) wst.lot++; else if (!fin(W)) wst.fallback++;
      }
      // тротуар: до границы улицы, не шире нормы класса; граница не найдена — по норме; на мостах — узкий
      const side = b => { const s = Math.min(K.sw, fin(b) ? b - q.hw : K.swN || K.sw); return s >= P.minWalk ? s : 0; };
      q.sw = q.br ? [Math.min(1.5, K.sw), Math.min(1.5, K.sw)] : [side(bl), side(br)];
    });
    // одиночный провал тротуара (луч задел угол участка) или одиночный кусок посреди «без тротуара» — убрать
    for (const sd of [0, 1]) {
      const w0 = v.map(q => q.sw[sd]);
      for (let i = 1; i + 1 < v.length; i++) {
        if (v[i].br) continue;
        if (!w0[i] && w0[i - 1] > 0 && w0[i + 1] > 0) v[i].sw[sd] = Math.min(w0[i - 1], w0[i + 1]);
        else if (w0[i] > 0 && !w0[i - 1] && !w0[i + 1]) v[i].sw[sd] = 0;
      }
    }
    // сгладить скачки ширины (соседние точки)
    const hw = v.map(q => q.hw);
    v.forEach((q, i) => { q.hw = (hw[Math.max(0, i - 1)] + 2 * hw[i] + hw[Math.min(v.length - 1, i + 1)]) / 4; });
  }

  /* ---------- железная дорога ---------- */
  const railWays = rails.filter(r => !r.tunnel && r.pts.length > 1)
    .map(r => ({ pts: r.pts, sb: r.pts.slice(1).map(() => r.bridge), st: r.pts.slice(1).map(() => false), a: { siding: r.siding, oneway: 0 } }));
  const tracks = chainUp(railWays, (a, b) => a.siding === b.siding).map(w => ({ siding: w.a.siding, v: resample(w), len: plen(w.pts) }));

  /* ---------- ровное полотно: рельеф игровой сетки под улицами и путями сглажен ---------- */
  sitgesEvenRoads(C, streets, tracks);

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
  // насыпи подходов к мостам (до выемок: выемка под путепроводом сильнее насыпи): рельеф поднимается до полотна,
  // за краем — откос fillBank
  const fill = (line, halfAt) => {
    const v = line.v, FB = P.approach.fillBank;
    for (let i = 0; i + 1 < v.length; i++) {
      const a = v[i], b = v[i + 1];
      if (a.deck || (!a.fill && !b.fill)) continue;
      const ha = halfAt(a), hb = halfAt(b), up = Math.max(a.y - ground(a.x, a.z), b.y - ground(b.x, b.z), 0);
      const hm = Math.max(ha, hb) + 0.3 + up / FB + S;
      const i0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - hm - X0) / S)), i1 = Math.min(NX - 1, Math.ceil((Math.max(a.x, b.x) + hm - X0) / S));
      const j0 = Math.max(0, Math.floor((Math.min(a.z, b.z) - hm - Z0) / S)), j1 = Math.min(NZ - 1, Math.ceil((Math.max(a.z, b.z) + hm - Z0) / S));
      const dx = b.x - a.x, dz = b.z - a.z, LL = dx * dx + dz * dz || 1;
      for (let jj = j0; jj <= j1; jj++) for (let ii = i0; ii <= i1; ii++) {
        const x = X0 + ii * S, z = Z0 + jj * S, t = clamp(((x - a.x) * dx + (z - a.z) * dz) / LL, 0, 1);
        const d = Math.hypot(x - a.x - dx * t, z - a.z - dz * t), hh = ha + (hb - ha) * t;
        const k = jj * NX + ii, y = a.y + (b.y - a.y) * t - Math.max(0, d - hh - 0.3) * FB;
        if (y > H[k]) H[k] = y;
      }
    }
  };
  for (const st of streets) if (st.v.some(q => q.fill)) fill(st, q => q.hw + Math.max(q.sw[0], q.sw[1]));
  for (const tr of tracks) if (tr.v.some(q => q.fill)) fill(tr, () => P.railHalf);
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
    if (!cuts.includes(line)) cuts.push(line);
  };
  for (const st of streets) if (st.v.some(q => q.cut)) carve(st, q => q.hw + Math.max(q.sw[0], q.sw[1]));
  for (const tr of tracks) if (tr.v.some(q => q.cut)) carve(tr, () => P.railHalf);
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
    const SG = 16, segs = new Map(), cell = (x, z) => Math.floor(x / SG) * 65536 + Math.floor(z / SG);
    // точка на пешеходной улице (по положению до сдвига; сетка отрезков — до вставки узлов, индексы не нужны)
    // точка на проезжей части улицы, кроме A и B (по текущему положению оси)
    const onOther = (x, z, A, B) => (segs.get(cell(x, z)) || []).some(([o, i]) => {
      if (o === A || o === B || !o.drive) return false;
      const a = o.v[i], b = o.v[i + 1]; if (!b) return false;
      const dx = b.x - a.x, dz = b.z - a.z, LL = dx * dx + dz * dz || 1, t = clamp(((x - a.x) * dx + (z - a.z) * dz) / LL, 0, 1);
      return Math.hypot(x - a.x - dx * t, z - a.z - dz * t) < a.hw + (b.hw - a.hw) * t;
    });
    const onPed = (x, z) => (segs.get(cell(x, z)) || []).some(([o, i]) => {
      if (o.cls !== 'pedestrian') return false;
      const a = o.v[i], b = o.v[i + 1]; if (!b) return false;
      const dx = b.ox - a.ox, dz = b.oz - a.oz, LL = dx * dx + dz * dz || 1, t = clamp(((x - a.ox) * dx + (z - a.oz) * dz) / LL, 0, 1);
      return Math.hypot(x - a.ox - dx * t, z - a.oz - dz * t) < a.hw;
    });
    const fillSegs = () => {
      segs.clear();
      for (const st of arms) st.v.forEach((a, i) => {
        if (i === st.v.length - 1) return;
        const b = st.v[i + 1], m = 3 + Math.max(a.hw, b.hw);
        for (let ci = Math.floor((Math.min(a.ox, b.ox) - m) / SG); ci <= Math.floor((Math.max(a.ox, b.ox) + m) / SG); ci++)
          for (let cj = Math.floor((Math.min(a.oz, b.oz) - m) / SG); cj <= Math.floor((Math.max(a.oz, b.oz) + m) / SG); cj++) {
            const k = ci * 65536 + cj;
            if (!segs.has(k)) segs.set(k, []);
            segs.get(k).push([st, i]);
          }
      });
    };
    {
      fillSegs();
      const ins = new Map();
      for (const st of arms) for (const ei of [0, st.v.length - 1]) {
        // ближайший отрезок — на каждой улице свой (в узле могут сходиться концы нескольких улиц, и все они лежат
        // на проходящей)
        const E = st.v[ei], best = new Map();
        for (const [o, i] of segs.get(cell(E.ox, E.oz)) || []) {
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
    const BC = 32, bCells = new Map();
    for (const b of blds) for (const p of b.parts) {
      const r = p.rings[0];
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const [x, z] of r) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      const o = { r, bb: [x0, x1, z0, z1] };
      for (let ci = Math.floor(x0 / BC); ci <= Math.floor(x1 / BC); ci++)
        for (let cj = Math.floor(z0 / BC); cj <= Math.floor(z1 / BC); cj++) {
          const k = ci * 65536 + cj;
          if (!bCells.has(k)) bCells.set(k, []);
          bCells.get(k).push(o);
        }
    }
    const inHouse = (x, z) => (bCells.get(Math.floor(x / BC) * 65536 + Math.floor(z / BC)) || [])
      .some(o => x >= o.bb[0] && x <= o.bb[1] && z >= o.bb[2] && z <= o.bb[3] && inPoly(x, z, o.r));
    const cst = { nodes: 0, pairs: 0, made: 0, skipAng: 0, skipWalk: 0, skipFar: 0, skipHouse: 0, shrunk: 0 };
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
        if (Math.max(devA, devB) > CR.dev) { cst.skipBend = (cst.skipBend || 0) + 1; log([A], 'кривой рукав'); LOG[LOG.length - 1].d = [devA, devB].map(v => +v.toFixed(2)); continue; }
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
        if (offA || offB) cst.offStrip = (cst.offStrip || 0) + 1;
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
        if (sharp) cst.sharp = (cst.sharp || 0) + 1;
      }
    }
    C.cornerStats = cst;
  }
  // клетки углов: асфальт угла (carriageAt) и обрезка тротуаров (roads3d.js)
  const cornerCells = new Map();
  for (const c of corners) {
    const xs = [c.K[0], c.a.T[0], c.b.T[0], c.O[0]], zs = [c.K[1], c.a.T[1], c.b.T[1], c.O[1]], m = Math.max(c.a.w, c.b.w) + 2;
    c.bb = [Math.min(...xs) - m, Math.max(...xs) + m, Math.min(...zs) - m, Math.max(...zs) + m];
    for (let ci = Math.floor(c.bb[0] / 16); ci <= Math.floor(c.bb[1] / 16); ci++)
      for (let cj = Math.floor(c.bb[2] / 16); cj <= Math.floor(c.bb[3] / 16); cj++) {
        const k = ci * 65536 + cj;
        if (!cornerCells.has(k)) cornerCells.set(k, []);
        cornerCells.get(k).push(c);
      }
  }
  // асфальт угла: за обоими бордюрами, вне круга r, не дальше касаний
  const inFillet = (c, x, z) => {
    const px = x - c.K[0], pz = z - c.K[1];
    if (px * c.a.n[0] + pz * c.a.n[1] < 0 || px * c.b.n[0] + pz * c.b.n[1] < 0) return false;
    if (px * c.a.u[0] + pz * c.a.u[1] > c.d || px * c.b.u[0] + pz * c.b.u[1] > c.d) return false;
    return Math.hypot(x - c.O[0], z - c.O[1]) >= c.r;
  };
  const NONE = [];
  const cornersAt = (x, z) => cornerCells.get(Math.floor(x / 16) * 65536 + Math.floor(z / 16)) || NONE;

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
  // { st, i, t, d, corner } — улица и место на ней, d — расстояние от оси, corner — асфальт скруглённого угла;
  // skip — эту улицу не считать; m — запас, м (вызывается очень часто: индексные циклы, без лишних объектов)
  const carriageAt = (x, z, skip = null, m = 0) => {
    const list = carr.get(Math.floor(x / CC) * 65536 + Math.floor(z / CC));
    if (list) {
      let best = null, bk = Infinity;
      for (let n = 0; n < list.length; n++) {
        const st = list[n][0], i = list[n][1];
        if (st === skip) continue;
        const a = st.v[i], b = st.v[i + 1], dx = b.x - a.x, dz = b.z - a.z, LL = dx * dx + dz * dz || 1;
        const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / LL, 0, 1), d = Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
        const hw = a.hw + (b.hw - a.hw) * t + m;
        if (d < hw && d / hw < bk) { bk = d / hw; best = { st, i, t, d, corner: null }; }
      }
      if (best) return best;
    }
    // асфальт скруглённого угла
    const cs = cornerCells.get(Math.floor(x / 16) * 65536 + Math.floor(z / 16));
    if (cs) for (let n = 0; n < cs.length; n++) {
      const c = cs[n];
      if (c.a.st !== skip && c.b.st !== skip && inFillet(c, x, z)) return { st: c.a.st, i: Math.min(c.a.i, c.a.st.v.length - 2), t: 0, d: 0, corner: c };
    }
    return null;
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

  Object.assign(C, { streets, tracks, xings, unders, cuts, corners, cornersAt, carriageAt, carriageNear,
    roadStats: { width: wst, streets: streets.length, tracks: tracks.length, xings: xings.length, unders: unders.length, dips: unders.map(U => +U.dip.toFixed(1)) } });
}

// Ровное полотно (SITGES_R.even): рельеф игровой сетки C.terra.H под улицами (проезжими и пешеходными, кроме тропинок
// и лестниц) и путями сглаживается до профилей, мостов и выемок — по нему потом лягут полотно, тротуары и физика.
// Узел «полотна» — не дальше полуширины с тротуарами от оси отрезка (мосты OSM — нет: под ними свой рельеф);
// новое значение — взвешенное среднее узлов полотна вокруг (Гаусс по расстоянию × вес по разнице высот), за краем
// полотна — плавно к старому рельефу. Море и волнорезы не трогаем, суша у воды — не ниже берега (как в terrain.js).
function sitgesEvenRoads(C, streets, tracks) {
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
