// Ситжес — РАСКЛАДКА: улицы и ж/д — склейка и ширины (первый этап улиц). После рельефа (js/maps/sitges/terrain.js).
//   Склейка — участки одной улицы (OSM режет их на перекрёстках и мостах), сходящиеся концами по двое, — в одну
//     ломаную; точки через ≤ SITGES_R.step м (sitgesRoadPt), у каждого отрезка — флаги «мост» / «тоннель».
//   Ширина «от забора до забора»: в каждой точке луч поперёк улицы до стены здания и до границы участка кадастра
//     с обеих сторон (медиана по соседним точкам). Внутри — тротуары по норме класса, проезжая часть — остаток (не уже
//     полос старой нормы, если влезает до фасадов, — старый город; не шире cwMax); участков нет — норма cw.
//     Тротуар — что осталось до границы, не шире нормы класса; уже minWalk — улица в одном уровне от стены до стены.
//     Дом на границе своего участка ближе face м от края мостовой — тротуар до стены (набережная Pg. de la Ribera,
//     2026-11-20: полоса между мостовой и домами — общая земля, не палисадник; без этого — пустая полоса и забор).
//     Ось OSM сдвигается к середине между границами (shift).
// Следующие этапы улиц (порядок — sitgesData() в js/maps/sitges/plan.js): ровное полотно и уровни (levels.js),
// скруглённые углы (corners.js), проезжая часть под точкой (carriage.js), тротуары с обрезкой (walks.js).
// SITGES_R — настройки всех этапов улиц.
// Определяет: SITGES_R, sitgesRoadPt, sitgesPlanStreets.
// Использует: clamp (js/core.js); sitgesCells, sitgesBBox, sitgesInPoly (js/maps/sitges/geom.js); SITGES_DRIVE
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
  // тротуар до фасада: где дом стоит на границе своего участка (участок начинается не дальше faceLot м перед стеной;
  // палисадник — нет), тротуар идёт от края мостовой до стены, если она не дальше стольких метров (по классу; шире
  // нормы sw и у классов без тротуара) — набережная Pg. de la Ribera: living_street 5 м и residential с тротуаром 2,4 м,
  // дома в 5–9 м от края, между ними — тротуар с террасами (без этого — пустая полоса и забор у кромки)
  face: { secondary: 12, tertiary: 12, unclassified: 12, residential: 12, living_street: 12 }, faceLot: 1,
  // ось к середине между границами: не дальше max м, у концов улицы — на taper м; одна сторона открыта, другая ближе
  // половины нормы cw — от неё, не дальше open м
  shift: { max: 1.5, open: 2.5, taper: 12 },
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
  // гребни под проезжей частью (sitgesRoadRidges, levels.js): узел не выше среднего соседей напротив больше чем на
  // eps м, но не ниже исходного больше чем на cap м; узлы — до pad м за краем проезжей части (и асфальта углов);
  // passes — сколько раз
  ridge: { eps: 0.02, cap: 0.5, pad: 0.5, passes: 12 },
  // ровное полотно: рельеф под улицами (проезжая часть и тротуары) и путями сглажен — в лидаре 10 м горбы 0,2–1,4 м
  // на 10–20 м, настоящий асфальт ровный. Среднее по узлам полотна в круге rad·sigma м (вес — Гаусс sigma м,
  // соседи выше / ниже на range м и больше не берутся: улица уровнем выше на склоне не тянет к себе); за краем
  // полотна — переход к рельефу на edge м; passes — сколько раз
  even: { sigma: 6, rad: 2, range: 4, edge: 4, passes: 2 },
};

// точка улицы через ≤ step м; у точки — флаги отрезка, который из неё выходит; nd — исходная вершина (узел), k — её
// ключ; ox, oz — положение до сдвига оси к середине между участками.
// Все поля — сразу и в одном порядке: точки улиц читают очень часто (carriageAt), разные «формы» объектов
// замедляют чтение в 2–3 раза
const sitgesRoadPt = (x, z, br, tn, k, nd) => ({ x, z, ox: x, oz: z, br, tn, k, nd, tx: 0, tz: 0, s: 0, hw: 0, sw: null, fac: null, lot: null, y: 0, deck: false, cut: false });

function sitgesPlanStreets(C) {
  const { roads, rails, blds, parcels } = C, P = SITGES_R;
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
  const pt = sitgesRoadPt;
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
    const cells = sitgesCells(EC);
    for (const r of rings) for (let i = 0; i < r.length; i++) {
      const [ax, az] = r[i], [bx, bz] = r[(i + 1) % r.length];
      cells.add(Math.min(ax, bx), Math.max(ax, bx), Math.min(az, bz), Math.max(az, bz), [ax, az, bx - ax, bz - az]);
    }
    return cells;
  };
  const walls = edgeGrid(blds.flatMap(b => b.parts.flatMap(p => p.rings)));
  const lots = edgeGrid(parcels.map(p => p.ring));
  // участки по клеткам (для «точка внутри участка»)
  const lotCells = sitgesCells(32);
  for (const p of parcels) { p.bb = sitgesBBox(p.ring); lotCells.add(...p.bb, p); }
  const lotAt = (x, z) => {
    for (const p of lotCells.at(x, z))
      if (x >= p.bb[0] && x <= p.bb[1] && z >= p.bb[2] && z <= p.bb[3] && sitgesInPoly(x, z, p.ring)) return p;
    return null;
  };
  const seen = new Set();
  const ray = (edges, x, z, dx, dz) => {
    let best = Infinity;
    seen.clear();
    for (let t = 0; t <= P.ray + EC; t += EC / 2) {
      const k = edges.key(x + dx * t, z + dz * t);
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
  const wst = { pts: 0, lot: 0, inLot: 0, fallback: 0, shifted: 0, open: 0, face: 0, faceFill: 0 };
  for (const st of streets) {
    const { K, v, oneway } = st;
    if (st.flat) { for (const q of v) { q.hw = K.w / 2; q.sw = [0, 0]; } continue; }
    // фасады; участки — если точка оси не внутри участка (улица по частной земле или сдвиг OSM — не в счёт)
    const face = P.face[st.cls] || 0, byLot = !!K.cw || face > 0;
    const L = v.map(q => ray(walls, q.x, q.z, -q.tz, q.tx)), R = v.map(q => ray(walls, q.x, q.z, q.tz, -q.tx));
    const own = v.map(q => byLot && !!lotAt(q.x, q.z));
    const PL = v.map((q, i) => own[i] ? NaN : byLot ? ray(lots, q.x, q.z, -q.tz, q.tx) : Infinity);
    const PR = v.map((q, i) => own[i] ? NaN : byLot ? ray(lots, q.x, q.z, q.tz, -q.tx) : Infinity);
    const d = v.map((q, i) => ({ l: median(L, i), r: median(R, i), pl: median(PL, i), pr: median(PR, i) }));
    // ось — к середине между границами (ось OSM сдвинута от неё в среднем на ≈ 1 м): сдвиг до shift.max, у концов
    // улицы (узлы перекрёстков) и на мостах / в тоннелях — плавно до нуля; улицы, где не помещаются полосы старой
    // нормы и два узких тротуара (старый город), не сдвигаются
    if (K.cw) {
      const S = P.shift, narrow = (oneway ? K.lane + K.park : 2 * K.lane) + 2 * P.swMin, raw = d.map((e, i) => {
        const bl = Math.min(e.l, e.pl), br = Math.min(e.r, e.pr), q = v[i];
        if ((!fin(bl) && !fin(br)) || q.br || q.tn || (i && (v[i - 1].br || v[i - 1].tn))) return 0;
        const taper = clamp(Math.min(q.s, st.len - q.s) / S.taper, 0, 1);
        // одна сторона открыта (ни стен, ни участков на ray м), другая ближе половины нормы cw — ось от неё в открытую
        // сторону (Av. de Sofia у (177, 465): край участка разделительной полосы в 1,1 м от оси OSM — иначе проезжая
        // часть сжималась до minHalf)
        if (!fin(bl) || !fin(br)) {
          const need = K.cw[oneway ? 0 : 1] / 2, b = fin(bl) ? bl : br;
          if (b >= need) return 0;
          wst.open++;
          return (fin(bl) ? -1 : 1) * Math.min(need - b, S.open) * taper;
        }
        if (bl + br < narrow) return 0;
        return clamp((bl - br) / 2, -S.max, S.max) * taper;
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
    const o = oneway ? 0 : 1, G = v.map(() => [0, 0]);   // G — от края мостовой до границы улицы с каждой стороны
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
      // тротуар: до границы улицы, не шире нормы класса; граница не найдена — по норме; на мостах — узкий;
      // дом на границе участка (f — фасад) не дальше face м от края мостовой — до стены
      const side = (b, f) => {
        const g = fin(b) ? b - q.hw : 0;
        if (face && fin(f) && f - b <= P.faceLot && g >= P.minWalk && g <= face && g > K.sw) { wst.face++; return g; }
        const s = Math.min(K.sw, fin(b) ? g : K.swN || K.sw); return s >= P.minWalk ? s : 0;
      };
      q.sw = q.br ? [Math.min(1.5, K.sw), Math.min(1.5, K.sw)] : [side(bl, l), side(br, r)];
      G[i] = [fin(bl) ? bl - q.hw : 0, fin(br) ? br - q.hw : 0];
    });
    // тротуар до стены: провал в 1–2 точки между расширенными соседями (там фасад глубже — пустой участок, проезд во
    // двор) — до меньшего из соседей, но не дальше границы улицы (иначе между широкими кусками «зуб», забор по его контуру)
    // У конца улицы (узел, улица дальше — другой записью) — по одному соседу
    if (face) for (const sd of [0, 1]) {
      const w = v.map(q => q.sw[sd]), N = v.length, wide = k => k < 0 || k >= N ? Infinity : w[k] > K.sw ? w[k] : 0;
      for (let i = 0; i < N; i++) for (const n of [1, 2]) {
        const a = wide(i - 1), b = wide(i + n);
        if (i + n > N || !a || !b || (a === Infinity && b === Infinity)) continue;
        const m = Math.min(a, b);
        let ok = true;
        for (let k = i; k < i + n; k++) if (w[k] >= m || v[k].br || G[k][sd] < P.minWalk) ok = false;
        if (ok) for (let k = i; k < i + n; k++) { v[k].sw[sd] = Math.max(w[k], Math.min(m, G[k][sd])); wst.faceFill++; }
      }
    }
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

  Object.assign(C, { streets, tracks, roadStats: { width: wst, streets: streets.length, tracks: tracks.length } });
}
