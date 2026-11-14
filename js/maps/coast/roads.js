// Побережье — РАСКЛАДКА: дороги. Асфальтовый серпантин от порта к пьяцце (2 полосы + земляные обочины), гравийные
// дороги по краям карты, кольцо вокруг деревни и связки (1,5 полосы), грунтовые тропы-срезки (1 полоса).
// Каждая дорога — сплайн по опорным точкам (сняты с согласованного эскиза), пересэмплированный через 2 м.
// Профиль высоты: рельеф под дорогой, сглаженный, с ограничением уклона; на перекрёстках дорога «прилипает» к уже
// посчитанной (порядок — по важности), на мостах — к настилу, на броде — к мелкому дну. Потом дороги вдавливаются
// в сетку высот H: полотно ровное поперёк, откосы тем шире, чем выше насыпь или глубже выемка; русло не трогается.
// Определяет: ROAD_KIND, coastPlanRoads.
// Использует: lerp, clamp (js/core.js); smooth01 (js/world.js); ellMetric (js/maps/coast/terrain.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

// w — ширина проезжей части, sh — обочина с каждой стороны, grade — предельный уклон, smooth — радиус сглаживания
// профиля (в точках по 2 м), prio — важность (асфальт рассчитывается первым, остальные к нему примыкают)
const ROAD_KIND = {
  asphalt: { w: 7, sh: 3.5, grade: 0.11, smooth: 9, prio: 3, kid: 1 },
  gravel: { w: 5.5, sh: 1, grade: 0.15, smooth: 6, prio: 2, kid: 2 },
  cobble: { w: 5, sh: 0.4, grade: 0.16, smooth: 4, prio: 2, kid: 3 },
  dirt: { w: 3.6, sh: 0.7, grade: 0.22, smooth: 4, prio: 1, kid: 4 },
};

function coastPlanRoads(C) {
  const { H, NX, NZ, gx, gz, cellI, cellJ, ground, RD, RI, riverPts, lagoon, island, ford, cliff, wlAt, pads, extraRoads } = C;
  const L = d => [cliff.x - cliff.fx * d, cliff.z - cliff.fz * d];       // точка на прямом разгоне к обрыву за d м до кромки
  // опорные точки: [x, z], +X — запад, +Z — север
  const DEFS = [
    // серпантин: из порта три петли по южным холмам, каменный мост на западе, две петли и вход в деревню с юго-запада
    { id: 'serp', kind: 'asphalt', bridge: 'stone', pts: [[-152, -592], [-150, -556], [-128, -530], [-80, -522], [-20, -528], [40, -520], [88, -508],
      [108, -490], [92, -474], [50, -468], [-10, -456], [-70, -446], [-122, -436], [-150, -420], [-140, -400], [-100, -386], [-40, -372], [20, -352],
      [80, -330], [130, -305], [175, -270], [210, -225], [232, -170], [242, -120], [242, -80], [238, -46], [236, -20], [238, 20], [248, 60],
      [262, 100], [266, 130], [248, 152], [205, 160], [150, 172], [100, 186], [74, 204], [82, 226], [118, 240], [150, 262], [158, 292],
      [140, 320], [105, 345], [70, 375], [45, 405], [25, 428]] },
    // гравий: западная (маяк → мост), к винодельне и под горы, северная, восточная через акведук, центральная через деревянный мост
    { id: 'west', kind: 'gravel', pts: [[328, -668], [356, -640], [392, -600], [418, -548], [426, -490], [414, -430], [430, -370], [420, -300],
      [392, -240], [350, -190], [300, -150], [266, -128], [244, -112]] },
    { id: 'westN', kind: 'gravel', pts: [[238, 20], [270, 42], [300, 90], [318, 150], [340, 210], [338, 270], [333, 326], [345, 380], [372, 430],
      [398, 490], [392, 550], [360, 600], [300, 630]] },
    { id: 'north', kind: 'gravel', pts: [[300, 630], [230, 648], [160, 640], [90, 655], [20, 640], [-50, 652], [-120, 636], [-190, 646], [-260, 622],
      [-320, 590], [-372, 548], [-404, 490], [-410, 430]] },
    { id: 'east', kind: 'gravel', bridge: 'aqueduct', pts: [[-262, -590], [-300, -572], [-350, -540], [-392, -500], [-418, -440], [-410, -380],
      [-428, -320], [-420, -250], [-402, -190], [-392, -140], [-386, -100], [-385, -60], [-385, -20], [-385, 20], [-384, 60], [-388, 95],
      [-400, 135], [-405, 185], [-385, 240], [-352, 285], [-331, 326], [-350, 370], [-392, 400], [-410, 430]] },
    { id: 'center', kind: 'gravel', bridge: 'wood', pts: [[-60, -377], [-90, -320], [-130, -270], [-165, -215], [-182, -160], [-180, -115],
      [-178, -79], [-176, -40], [-165, 0], [-140, 50], [-110, 110], [-80, 170], [-55, 230], [-35, 290], [-28, 340]] },
    { id: 'ring', kind: 'gravel', closed: true, pts: [[137, 436], [115, 517], [38, 546], [-43, 543], [-82, 473], [-101, 392], [-33, 346], [40, 316], [103, 365]] },
    { id: 'villN', kind: 'gravel', pts: [[38, 546], [30, 590], [20, 640]] },
    { id: 'wineLink', kind: 'gravel', pts: [[137, 436], [200, 425], [262, 395], [318, 350], [333, 326]] },
    { id: 'amphLink', kind: 'gravel', pts: [[-101, 392], [-160, 380], [-230, 360], [-290, 340], [-331, 326]] },
    // грунтовые тропы: срезки между петлями, к броду через остров, к обрыву, по пляжу, через виноградники и оливы
    { id: 'cut1', kind: 'dirt', pts: [[-20, -528], [-14, -492], [-10, -457]] },
    { id: 'cut2', kind: 'dirt', pts: [[40, -464], [52, -410], [42, -344]] },
    { id: 'cut3', kind: 'dirt', pts: [[-70, -446], [-88, -418], [-100, -387]] },
    { id: 'ford', kind: 'dirt', ford: true, pts: [[-15, -364], [-25, -300], [-48, -235], [-40, -170], [-30, -120], [ford.x, -80], [ford.x, -58],
      [ford.x, -10], [ford.x, 34], [-45, 80], [-60, 130], [-58, 180], [-55, 230]] },
    { id: 'cliff', kind: 'dirt', pts: [[105, -318], [118, -280], [105, -215], L(140), L(80), L(30), L(0.5)] },
    { id: 'beach', kind: 'dirt', pts: [[-45, -603], [10, -612], [80, -606], [150, -614], [220, -618], [280, -640], [326, -664]] },
    { id: 'vine1', kind: 'dirt', pts: [[338, 270], [300, 262], [262, 280], [230, 268], [200, 282], [158, 292]] },
    { id: 'vine2', kind: 'dirt', pts: [[345, 380], [392, 350], [420, 300], [430, 240], [410, 190]] },
    { id: 'olive', kind: 'dirt', pts: [[-350, -540], [-300, -505], [-250, -520], [-200, -500], [-145, -497], [-100, -522]] },
    { id: 'amphAq', kind: 'dirt', pts: [[-331, 326], [-300, 270], [-318, 200], [-345, 140], [-368, 95], [-386, 72]] },
    { id: 'neForest', kind: 'dirt', pts: [[-220, 358], [-190, 300], [-160, 240], [-120, 190], [-82, 168]] },
    { id: 'westLink', kind: 'dirt', pts: [[150, 172], [195, 205], [245, 225], [300, 215], [340, 210]] },
    { id: 'eastHill', kind: 'dirt', pts: [[-418, -440], [-370, -400], [-320, -370], [-260, -360], [-200, -330], [-130, -270]] },
    { id: 'riverS', kind: 'dirt', pts: [[240, -110], [190, -116], [140, -96], [92, -84], L(80)] },
    // улочки деревни из брусчатки (js/maps/coast/sites.js)
    ...extraRoads,
  ];

  /* ---------- сплайны ---------- */
  const SP = 2;
  const channel = (x, z) => {                      // в русле или в заводи (не на острове) — сюда дороги не вдавливаются
    const k = cellJ(z) * NX + cellI(x);
    return (RD[k] < riverPts[RI[k]].hw + 3 || ellMetric(lagoon, x, z) < 1.02) && ellMetric(island, x, z) > 1;
  };
  const roads = DEFS.map(d => {
    const K = ROAD_KIND[d.kind];
    const curve = new THREE.CatmullRomCurve3(d.pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), !!d.closed, 'centripetal');
    const n = Math.max(2, Math.round(curve.getLength() / SP));
    const pts = curve.getSpacedPoints(n).map(v => ({ x: v.x, z: v.z, h: ground(v.x, v.z) }));
    if (d.closed) pts.pop();
    const N = pts.length;
    pts.forEach((p, i) => {
      const a = pts[d.closed ? (i - 1 + N) % N : Math.max(0, i - 1)], b = pts[d.closed ? (i + 1) % N : Math.min(N - 1, i + 1)];
      const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      p.tx = (b.x - a.x) / l; p.tz = (b.z - a.z) / l; p.nx = p.tz; p.nz = -p.tx;
      p.wet = channel(p.x, p.z);
    });
    const w = d.w || K.w;                         // ширину можно задать дороге отдельно (переулки уже улиц)
    return Object.assign({}, K, d, { pts, N, w, hw: w / 2, core: w / 2 + K.sh, pins: new Map(), spans: [] });
  });

  /* ---------- переправы: мосты, акведук, брод ---------- */
  for (const r of roads) {
    const P = r.pts, wetIdx = P.map((p, i) => p.wet ? i : -1).filter(i => i >= 0);
    if (!wetIdx.length) continue;
    if (!r.bridge && !r.ford) { console.warn('Дорога', r.id, 'пересекает реку без переправы'); continue; }
    if (r.ford) {
      // брод: по воде — каменистое дно на 0,24 м под водой; на острове — по рельефу
      for (const i of wetIdx) r.pins.set(i, wlAt(P[i].x) - 0.24);
      continue;
    }
    let i0 = wetIdx[0], i1 = wetIdx[wetIdx.length - 1];
    const wl = wlAt(P[(i0 + i1) >> 1].x);
    let type = r.bridge, deck;
    if (type === 'aqueduct') {
      // акведук перекрывает всю долину: от склона до склона на высоте ~13 м над рекой (не длиннее 90 м в каждую сторону)
      const top = wl + 13;
      while (i0 > 0 && P[i0].h < top - 0.8 && (i1 + i0) / 2 - i0 < 45) i0--;
      while (i1 < P.length - 1 && P[i1].h < top - 0.8 && i1 - (i1 + i0) / 2 < 45) i1++;
      deck = () => top;
    } else {
      // каменный или деревянный мост: опоры на берегах, горб над водой
      i0 = Math.max(0, i0 - 4); i1 = Math.min(P.length - 1, i1 + 4);
      const clear = type === 'stone' ? 4.6 : 3.2, ea = Math.max(P[i0].h, wl + 2.2), eb = Math.max(P[i1].h, wl + 2.2);
      const hump = Math.max(0, wl + clear - (ea + eb) / 2);
      deck = t => lerp(ea, eb, t) + hump * Math.sin(Math.PI * t);
    }
    for (let i = i0; i <= i1; i++) { P[i].h = deck((i - i0) / Math.max(1, i1 - i0)); P[i].span = true; r.pins.set(i, P[i].h); }
    r.spans.push({ type, i0, i1, wl });
  }

  /* ---------- профили ---------- */
  // точки уже рассчитанных дорог — для примыкания на перекрёстках
  const done = new Map(), CELLP = 8, keyP = (x, z) => Math.floor(x / CELLP) * 4096 + Math.floor(z / CELLP);
  const near = (x, z, R) => {
    let best = null, bd = R;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const q of done.get(keyP(x + a * CELLP, z + b * CELLP)) || []) {
      const d = Math.hypot(q.p.x - x, q.p.z - z) - q.r.core;
      if (d < bd) { bd = d; best = q; }
    }
    return best;
  };
  const order = roads.slice().sort((a, b) => b.prio - a.prio);
  for (const r of order) {
    const P = r.pts, N = P.length;
    // на ровной площадке (пьяцца, дворы) — её высота; где дорога заходит на уже рассчитанную — высота той дороги
    P.forEach((p, i) => { for (const pd of pads) if (Math.hypot(p.x - pd.x, p.z - pd.z) < pd.r + 1) r.pins.set(i, pd.h); });
    P.forEach((p, i) => { if (!p.span && !r.pins.has(i)) { const q = near(p.x, p.z, 0.5); if (q) r.pins.set(i, q.p.h); } });
    const idx = i => r.closed ? (i + N) % N : clamp(i, 0, N - 1);
    for (let pass = 0; pass < 6; pass++) {
      const src = P.map(p => p.h);
      for (let i = 0; i < N; i++) {
        let s = 0; for (let k = -r.smooth; k <= r.smooth; k++) s += src[idx(i + k)];
        P[i].h = s / (2 * r.smooth + 1);
      }
      for (const [i, v] of r.pins) P[i].h = v;
    }
    // предельный уклон: проход вперёд и назад (закреплённые точки не двигаются)
    const g = r.grade * SP;
    for (const dir of [1, -1]) for (let s = 0; s < N; s++) {
      const i = dir > 0 ? s : N - 1 - s, j = i - dir;
      if (j < 0 || j >= N || r.pins.has(i)) continue;
      P[i].h = clamp(P[i].h, P[j].h - g, P[j].h + g);
    }
    // возле закреплённых точек — плавный подход к ним (после ограничения уклона могли остаться ступеньки)
    for (const [i, v] of r.pins) {
      const d = v - P[i].h; if (Math.abs(d) < 1e-3) continue;
      for (let k = -10; k <= 10; k++) { const j = idx(i + k); if (!r.pins.has(j)) P[j].h += d * (1 - Math.abs(k) / 11); }
      P[i].h = v;
    }
    for (let i = 0; i < N; i++) P[i].slope = (P[idx(i + 1)].h - P[idx(i - 1)].h) / (2 * SP);
    for (const p of P) { const k = keyP(p.x, p.z); let a = done.get(k); if (!a) done.set(k, a = []); a.push({ p, r }); }
  }

  /* ---------- вдавливание в рельеф ---------- */
  // для каждой клетки — ближайшая точка дороги: высота полотна (с поправкой на уклон вдоль дороги), ширина, вид
  const N2 = NX * NZ, RDd = new Float32Array(N2).fill(1e9), RHh = new Float32Array(N2), RCo = new Float32Array(N2), RHw = new Float32Array(N2),
    RKind = new Uint8Array(N2), RWater = new Uint8Array(N2);
  for (const r of roads) {
    const R = r.core + 30;
    for (const p of r.pts) {
      if (p.span) continue;
      const i0 = cellI(p.x - R), i1 = cellI(p.x + R), j0 = cellJ(p.z - R), j1 = cellJ(p.z + R);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const k = j * NX + i, dx = gx(i) - p.x, dz = gz(j) - p.z, d = Math.hypot(dx, dz);
        if (d >= RDd[k]) continue;
        RDd[k] = d; RHh[k] = p.h + (dx * p.tx + dz * p.tz) * p.slope; RCo[k] = r.core; RHw[k] = r.hw; RKind[k] = r.kid; RWater[k] = r.ford ? 1 : 0;
      }
    }
  }
  for (let k = 0; k < N2; k++) {
    if (RDd[k] > 1e8) continue;
    const i = k % NX, j = (k / NX) | 0, x = gx(i), z = gz(j);
    if (!RWater[k] && channel(x, z)) continue;                   // русло и заводь не засыпаем
    const h0 = H[k], bw = clamp(Math.abs(RHh[k] - h0) * 1.8, 5, 30), t = smooth01((RDd[k] - RCo[k]) / bw);
    if (t < 1) H[k] = lerp(RHh[k], h0, t);
  }
  // ровные площадки — поверх дорог (дороги на них уже прижаты к той же высоте); покрытие — как у площадки
  for (const pd of pads) {
    const R = pd.r + 30, kid = ROAD_KIND[pd.kind].kid;
    for (let j = cellJ(pd.z - R); j <= cellJ(pd.z + R); j++) for (let i = cellI(pd.x - R); i <= cellI(pd.x + R); i++) {
      const k = j * NX + i, d = Math.hypot(gx(i) - pd.x, gz(j) - pd.z), bw = clamp(Math.abs(pd.h - H[k]) * 1.8, 4, 30), t = smooth01((d - pd.r) / bw);
      if (t >= 1 || channel(gx(i), gz(j))) continue;
      H[k] = lerp(pd.h, H[k], t);
      if (d < pd.r) { RDd[k] = 0; RCo[k] = pd.r; RHw[k] = pd.r; RKind[k] = kid; }
    }
  }
  // покрытие под колесом: вид дороги в клетке (0 — не дорога) и обочина
  const roadAt = (x, z) => {
    const k = cellJ(z) * NX + cellI(x), d = RDd[k];
    if (d > RCo[k]) return null;
    return { kind: ['', 'asphalt', 'gravel', 'cobble', 'dirt'][RKind[k]], shoulder: d > RHw[k] + 0.3 };
  };
  Object.assign(C, { roads, roadAt, roadDist: (x, z) => RDd[cellJ(z) * NX + cellI(x)], channel });
}
