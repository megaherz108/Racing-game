// Ситжес — ПОСТРОЙКА: улицы и железная дорога по раскладке js/maps/sitges/roads.js.
//   Полотно — лента по точкам улицы чуть выше рельефа, текстура в мировых координатах (на перекрёстках ленты
//     перекрываются без шва): асфальт, плитка, брусчатка, бетон, грунт; велодорожки — красноватый асфальт.
//   Тротуары — приподнятые на бордюр полосы плитки «панот» с гранитной кромкой; на перекрёстках обрезаны по проезжей
//     части другой улицы (край ищется делением пополам — косые углы ровные). Верх и бордюр — сетка столкновений
//     Rapier (world.meshColliders, js/physics.js): колесо на бордюре подпрыгивает.
//   Разметка — прерывистая ось двусторонних улиц (кроме перекрёстков), «зебры» у концов улиц с тротуарами.
//   Мосты и путепроводы — настил (Decks) с парапетами (выемки с откосами под ними — в раскладке).
//   Ж/д — балласт со шпалами, рельсы, ограда вдоль путей (кроме промежутков между соседними путями).
//   Граница игровой области на суше — каменная стена; где через неё уходит улица — бетонные блоки.
//   Лестницы перекрыты тумбами.
// Геометрия копится по квадратам SITGES_RB.chunk м и материалам (мало вызовов отрисовки).
// Порядок этапов — в buildSitges() (js/maps/sitges/build.js).
// Определяет: SITGES_RB, sitgesRoadTextures, SITGES_RB_TILE, sitgesBuildRoads.
// Использует: clamp (js/core.js); mulberry32 (js/world.js); Weather (js/weather.js); canvasTex
//   (js/maps/city/textures.js); cobbleTexture (js/maps/city/landmarks.js); SITGES_GEO (js/maps/sitges/data-geo.js);
//   SITGES_R (js/maps/sitges/roads.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const SITGES_RB = {
  chunk: 600,
  curb: 0.14,          // высота бордюра, м
  edge: 0.18,          // гранитная кромка тротуара, м
  // подъём над рельефом и приоритет (кто выше — тот виден на перекрёстке)
  lift: { drive: 0.05, paved: 0.045, ped: 0.04, flat: 0.03 },
  dash: [3, 5],        // штрих и промежуток оси, м
  zebra: { len: 3, stripe: 0.5, step: 1.0 },
  rail: { bed: 0.35, half: 2.2, top: 1.5, gauge: 0.72, h: 0.16, fence: 3.3, fenceH: 1.8 },
  deck: { t: 0.9, parapet: 1.0 },
  wall: { h: 1.2, t: 0.5, off: 9 },   // стена по границе: высота, толщина, отступ от линии границы на севере
};

// текстуры: размер плитки в метрах — SITGES_RB_TILE
function sitgesRoadTextures() {
  const rng = mulberry32(2026);
  const cv = (w, h, base) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = base; x.fillRect(0, 0, w, h); return [c, x]; };
  const dots = (x, w, h, n, a, s0, s1) => {
    for (let i = 0; i < n; i++) {
      const s = s0 + rng() * (s1 - s0);
      x.fillStyle = rng() < 0.5 ? `rgba(255,255,255,${rng() * a})` : `rgba(0,0,0,${rng() * a})`;
      x.fillRect(rng() * w, rng() * h, s, s);
    }
  };
  // асфальт: 6 м
  const [ac, ax] = cv(256, 256, '#59585a');
  dots(ax, 256, 256, 14000, 0.16, 1, 2.2);
  for (let i = 0; i < 6; i++) { ax.fillStyle = `rgba(0,0,0,${0.04 + rng() * 0.05})`; ax.fillRect(rng() * 220, rng() * 220, 20 + rng() * 50, 14 + rng() * 40); }
  // плитка (paving_stones): 2 м, прямоугольники 20 × 40 см вразбежку
  const [pc, px] = cv(256, 256, '#7d766c');
  for (let r = 0; r < 10; r++) for (let c = -1; c < 7; c++) {
    const l = 0.62 + rng() * 0.08;
    px.fillStyle = `rgb(${200 * l + 20 | 0},${190 * l + 18 | 0},${176 * l + 14 | 0})`;
    px.fillRect(c * 51.2 + (r % 2) * 25.6 + 1.5, r * 25.6 + 1.5, 48.2, 22.6);
  }
  dots(px, 256, 256, 3000, 0.08, 1, 2);
  // тротуар «панот»: 1,2 м — 6 × 6 плиток 20 см, у каждой четыре круглые «пастилки»
  const [tc, tx] = cv(256, 256, '#8e8a83');
  const T = 256 / 6;
  for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) {
    const l = 0.74 + rng() * 0.05;
    tx.fillStyle = `rgb(${215 * l + 30 | 0},${210 * l + 28 | 0},${200 * l + 26 | 0})`;
    tx.fillRect(c * T + 1, r * T + 1, T - 2, T - 2);
    tx.fillStyle = 'rgba(0,0,0,0.10)';
    for (const [a, b] of [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]]) { tx.beginPath(); tx.arc(c * T + a * T, r * T + b * T, T * 0.14, 0, Math.PI * 2); tx.fill(); }
  }
  dots(tx, 256, 256, 2500, 0.06, 1, 2);
  // грунт: 4 м
  const [dc, dx] = cv(256, 256, '#a8946f');
  dots(dx, 256, 256, 9000, 0.2, 1, 3);
  // бетон и камень стен: 4 м — блоки известняка
  const [wc, wx] = cv(256, 256, '#a39886');
  for (let r = 0; r < 8; r++) for (let c = -1; c < 5; c++) {
    const l = 0.8 + rng() * 0.15;
    wx.fillStyle = `rgb(${200 * l | 0},${186 * l | 0},${160 * l | 0})`;
    wx.fillRect(c * 64 + (r % 2) * 32 + 2, r * 32 + 2, 60, 28);
  }
  dots(wx, 256, 256, 5000, 0.12, 1, 3);
  // балласт со шпалами: u — поперёк (вся ширина насыпи), v — вдоль, 2,4 м (4 шпалы)
  const [bc, bx] = cv(128, 256, '#857b70');
  dots(bx, 128, 256, 6000, 0.28, 1, 3);
  for (let k = 0; k < 4; k++) { bx.fillStyle = '#b9b4ab'; bx.fillRect(128 * 0.2, k * 64 + 22, 128 * 0.6, 20); bx.fillStyle = 'rgba(0,0,0,.25)'; bx.fillRect(128 * 0.2, k * 64 + 40, 128 * 0.6, 3); }
  // ограда ж/д: 2,5 × 1,8 м — бетонный цоколь, столбы, сетка-рабица (прозрачность — alphaTest)
  const fc = document.createElement('canvas'); fc.width = 128; fc.height = 96;
  const fx = fc.getContext('2d');
  fx.strokeStyle = 'rgba(70,82,74,1)'; fx.lineWidth = 1.3;
  for (let i = -96; i < 128 + 96; i += 9) { fx.beginPath(); fx.moveTo(i, 0); fx.lineTo(i + 96, 96); fx.stroke(); fx.beginPath(); fx.moveTo(i, 96); fx.lineTo(i + 96, 0); fx.stroke(); }
  fx.fillStyle = '#4c5a50'; fx.fillRect(0, 0, 6, 96); fx.fillRect(0, 0, 128, 4);
  fx.fillStyle = '#b5ada0'; fx.fillRect(0, 84, 128, 12);
  const tex = (c, o = {}) => { const t = canvasTex(c); t.generateMipmaps = true; Object.assign(t, o); return t; };
  return {
    asphalt: tex(ac), paving: tex(pc), sett: cobbleTexture(), dirt: tex(dc), panot: tex(tc), stone: tex(wc), ballast: tex(bc), fence: tex(fc),
  };
}
// размер плитки текстуры, м (мировые координаты → uv)
const SITGES_RB_TILE = { asphalt: 6, paving: 2, sett: 2.5, dirt: 4, panot: 1.2, stone: 4 };

function sitgesBuildRoads(K) {
  const { D, group, grid, decks } = K, C = D.C, P = SITGES_RB, R = SITGES_R, g = D.ground;
  const TX = sitgesRoadTextures();
  const M = (map, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ map, roughness: 0.9, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }, o));
  const MAT = {
    asphalt: Weather.wet(M(TX.asphalt, { roughness: 0.88 }), 0.9),
    paving: Weather.wet(M(TX.paving), 0.7),
    sett: Weather.wet(M(TX.sett), 0.7),
    dirt: M(TX.dirt, { roughness: 1 }),
    panot: Weather.wet(M(TX.panot, { polygonOffset: false }), 0.6),
    white: M(null, { roughness: 0.7, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
    stone: M(TX.stone, { polygonOffset: false }),
    ballast: M(TX.ballast, { roughness: 1, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x8a8580, roughness: 0.35, metalness: 0.8 }),
    fence: new THREE.MeshStandardMaterial({ map: TX.fence, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 }),
  };
  // покрытие OSM → материал и оттенок
  const SURF = {
    asphalt: ['asphalt', 0xffffff, 'asphalt'], paving_stones: ['paving', 0xffffff, 'paving'], concrete: ['stone', 0xe8e6e0, 'paving'],
    sett: ['sett', 0xffffff, 'cobble'], cobblestone: ['sett', 0xf0e8dc, 'cobble'], compacted: ['dirt', 0xffffff, 'dirt'],
    gravel: ['dirt', 0xd8d6d0, 'dirt'], unpaved: ['dirt', 0xffffff, 'dirt'], dirt: ['dirt', 0xe0d0b8, 'dirt'], ground: ['dirt', 0xe0d0b8, 'dirt'],
    sand: ['dirt', 0xfff0d0, 'sand'], grass: ['dirt', 0xc8d8a0, 'grass'], wood: ['paving', 0xc8a080, 'paving'], metal: ['stone', 0xc0c4c8, 'paving'],
  };
  const surfOf = st => SURF[st.surf] || SURF.asphalt;

  /* ---------- копилка геометрии по квадратам и материалам ---------- */
  const buckets = new Map();
  const bucket = (mat, x, z) => {
    const k = mat + '|' + Math.floor(x / P.chunk) + ',' + Math.floor(z / P.chunk);
    let b = buckets.get(k);
    if (!b) buckets.set(k, b = { mat, pos: [], nor: [], uv: [], col: [] });
    return b;
  };
  const col = new THREE.Color();
  // четырёхугольник: вершины [x, y, z]; n — нормаль (для всех), uv — по мировым x, z (tile м) или явные
  const quad = (mat, p, n, c = 0xffffff, uvs = null) => {
    const b = bucket(mat, p[0][0], p[0][2]), tile = SITGES_RB_TILE[mat] || 4;
    col.setHex(c);
    // порядок обхода — лицом к нормали
    const ex = p[1][0] - p[0][0], ey = p[1][1] - p[0][1], ez = p[1][2] - p[0][2], fx = p[2][0] - p[0][0], fy = p[2][1] - p[0][1], fz = p[2][2] - p[0][2];
    const flip = (ey * fz - ez * fy) * n[0] + (ez * fx - ex * fz) * n[1] + (ex * fy - ey * fx) * n[2] < 0;
    const order = flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
    for (const i of order) {
      const q = p[i];
      b.pos.push(q[0], q[1], q[2]); b.nor.push(n[0], n[1], n[2]); b.col.push(col.r, col.g, col.b);
      if (uvs) b.uv.push(uvs[i][0], uvs[i][1]); else b.uv.push(q[0] / tile, q[2] / tile);
    }
  };
  // нормаль рельефа
  const gn = (x, z) => { const hx = (g(x + 1, z) - g(x - 1, z)) / 2, hz = (g(x, z + 1) - g(x, z - 1)) / 2, l = Math.hypot(hx, 1, hz); return [-hx / l, 1 / l, -hz / l]; };
  const UP = [0, 1, 0];
  // вертикальная стенка от (a, ya0…ya1) до (b, yb0…yb1), нормаль — в сторону s (вектор)
  const wallQuad = (mat, ax, az, ya0, ya1, bx, bz, yb0, yb1, nx, nz, c, uvMode) => {
    const L = Math.hypot(bx - ax, bz - az), tile = SITGES_RB_TILE[mat] || 4;
    const u0 = (ax * 0.7 + az * 0.7) / tile, u1 = u0 + L / tile;
    const uvs = uvMode === 'fence' ? [[0, 0], [L / 2.5, 0], [L / 2.5, 1], [0, 1]] : [[u0, ya0 / tile], [u1, yb0 / tile], [u1, yb1 / tile], [u0, ya1 / tile]];
    quad(mat, [[ax, ya0, az], [bx, yb0, bz], [bx, yb1, bz], [ax, ya1, az]], [nx, 0, nz], c, uvs);
  };
  // сетка столкновений тротуаров (Rapier trimesh) по квадратам
  const cmesh = new Map();
  const ctri = (a, b, c) => {
    const k = Math.floor(a[0] / P.chunk) + ',' + Math.floor(a[2] / P.chunk);
    let m = cmesh.get(k);
    if (!m) cmesh.set(k, m = { v: [], i: [] });
    const o = m.v.length / 3;
    m.v.push(...a, ...b, ...c); m.i.push(o, o + 1, o + 2);
  };
  const cquad = (a, b, c, d) => { ctri(a, b, c); ctri(a, c, d); };
  // поиск тротуаров для world.surface() и покрытия: кусок — четырёхугольник [x, z]×4 и высота верха
  const WC = 8, walks = new Map();
  const addWalk = (pts, y) => {
    const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]), o = { pts, y };
    for (let i = Math.floor(Math.min(...xs) / WC); i <= Math.floor(Math.max(...xs) / WC); i++)
      for (let j = Math.floor(Math.min(...zs) / WC); j <= Math.floor(Math.max(...zs) / WC); j++) {
        const k = i * 65536 + j;
        if (!walks.has(k)) walks.set(k, []);
        walks.get(k).push(o);
      }
  };

  /* ---------- полотно улиц ---------- */
  const offs = (q, d) => [q.x - q.tz * d, q.z + q.tx * d];   // d > 0 — сторона 0 (левая)
  let nRibbon = 0;
  for (const st of C.streets) {
    const [mat, tint] = surfOf(st), v = st.v;
    const lift = st.drive ? (mat === 'asphalt' ? P.lift.drive : P.lift.paved) : st.cls === 'pedestrian' ? P.lift.ped : P.lift.flat;
    const c0 = st.cls === 'cycleway' && mat === 'asphalt' ? 0xc07060 : tint;
    for (let i = 0; i + 1 < v.length; i++) {
      const a = v[i], b = v[i + 1], deck = a.deck;
      // вдоль — куски не длиннее шага сетки рельефа, поперёк — через ≤ 2,5 м: лента не проваливается под рельеф
      const n = Math.max(1, Math.ceil((b.s - a.s) / 2.5)), hwm = Math.max(a.hw, b.hw), m = hwm > 2.6 ? 4 : 2;
      const at = f => {
        const tx = a.tx + (b.tx - a.tx) * f, tz = a.tz + (b.tz - a.tz) * f, l = Math.hypot(tx, tz) || 1;
        return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, tx: tx / l, tz: tz / l, hw: a.hw + (b.hw - a.hw) * f, y: a.y + (b.y - a.y) * f };
      };
      const row = q => { const r = []; for (let k = 0; k <= m; k++) { const [x, z] = offs(q, (2 * k / m - 1) * q.hw); r.push([x, (deck ? q.y : g(x, z)) + lift, z]); } return r; };
      let A = row(at(0));
      for (let k = 1; k <= n; k++) {
        const q = at(k / n), B = row(q), nn = deck ? UP : gn(q.x, q.z);
        for (let c = 0; c < m; c++) quad(mat, [A[c], B[c], B[c + 1], A[c + 1]], nn, c0);
        A = B;
      }
      nRibbon++;
    }
  }

  /* ---------- тротуары: полоса между проезжей частью и фасадом, на бордюре ---------- */
  // точка внутри проезжей части другой улицы
  // (только среди отрезков cand — соседей текущего отрезка тротуара)
  let cand = [];
  const inOther = (st, x, z) => {
    for (const [o, i] of cand) {
      const a = o.v[i], b = o.v[i + 1], dx = b.x - a.x, dz = b.z - a.z, LL = dx * dx + dz * dz || 1;
      const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / LL, 0, 1), ex = x - a.x - dx * t, ez = z - a.z - dz * t, hw = a.hw + (b.hw - a.hw) * t;
      if (ex * ex + ez * ez < hw * hw) return true;
    }
    return false;
  };
  let nWalk = 0;
  for (const st of C.streets) {
    if (!st.drive) continue;
    const v = st.v, lift = P.lift.drive;
    for (const side of [0, 1]) {
      const sg = side ? -1 : 1;
      // точки внутреннего (у бордюра) и внешнего края на отрезке i при параметре t
      const edge = (i, t, outer) => {
        const a = v[i], b = v[i + 1];
        const [ax, az] = offs(a, sg * (a.hw + (outer ? a.sw[side] : 0.05))), [bx, bz] = offs(b, sg * (b.hw + (outer ? b.sw[side] : 0.05)));
        return [ax + (bx - ax) * t, az + (bz - az) * t];
      };
      const mid = (i, t) => {
        const a = v[i], b = v[i + 1], w = (a.sw[side] + b.sw[side]) / 2;
        const [ax, az] = offs(a, sg * (a.hw + w * 0.5)), [bx, bz] = offs(b, sg * (b.hw + w * 0.5));
        return [ax + (bx - ax) * t, az + (bz - az) * t];
      };
      // граница «свободно / занято» между t0 (свободно) и t1 — делением пополам по краю outer
      const cutT = (i, t0, t1, outer) => {
        const free0 = !inOther(st, ...edge(i, t0, outer)), free1 = !inOther(st, ...edge(i, t1, outer));
        if (free0 === free1) return free0 ? t1 : t0;
        let lo = t0, hi = t1;
        for (let k = 0; k < 7; k++) { const m = (lo + hi) / 2; if (!inOther(st, ...edge(i, m, outer)) === free0) lo = m; else hi = m; }
        return (lo + hi) / 2;
      };
      let cont = -1;                                       // отрезок, на котором полоса дошла до конца без обрезки
      for (let i = 0; i + 1 < v.length; i++) {
        const a = v[i], b = v[i + 1];
        if (a.sw[side] <= 0 && b.sw[side] <= 0) continue;
        const [p0x, p0z] = offs(a, sg * (a.hw + a.sw[side])), [p1x, p1z] = offs(b, sg * (b.hw + b.sw[side]));
        cand = C.carriageNear(Math.min(a.x, b.x, p0x, p1x), Math.max(a.x, b.x, p0x, p1x), Math.min(a.z, b.z, p0z, p1z), Math.max(a.z, b.z, p0z, p1z), st);
        const L = Math.hypot(b.x - a.x, b.z - a.z), n = cand.length ? Math.max(1, Math.ceil(L)) : 1;
        // свободные куски по 1 м (по середине полосы)
        const free = []; for (let k = 0; k < n; k++) free.push(!inOther(st, ...mid(i, (k + 0.5) / n)));
        for (let k = 0; k < n;) {
          if (!free[k]) { k++; continue; }
          let e = k; while (e < n && free[e]) e++;
          // отрезок свободен от k/n до e/n; края уточнить по внутренней и внешней кромке отдельно
          const tI0 = k ? cutT(i, k / n, (k - 1) / n, false) : 0, tO0 = k ? cutT(i, k / n, (k - 1) / n, true) : 0;
          const tI1 = e < n ? cutT(i, (e - 1) / n, e / n, false) : 1, tO1 = e < n ? cutT(i, (e - 1) / n, e / n, true) : 1;
          const nx2 = v[i + 2], cutStart = k > 0 || cont !== i - 1, cutEnd = e < n || !nx2 || (b.sw[side] <= 0 && nx2.sw[side] <= 0);
          if (e === n) cont = i;
          k = e;
          // углы: внутренний / внешний край в начале и в конце
          const I0 = edge(i, tI0, false), O0 = edge(i, tO0, true), I1 = edge(i, tI1, false), O1 = edge(i, tO1, true);
          // гранитная кромка у бордюра и плитка за ней
          const wI = (a.sw[side] + b.sw[side]) / 2, fe = Math.min(1, P.edge / Math.max(0.2, wI));
          const lerp2 = (p, r, f) => [p[0] + (r[0] - p[0]) * f, p[1] + (r[1] - p[1]) * f];
          const E0 = lerp2(I0, O0, fe), E1 = lerp2(I1, O1, fe);
          // верх: от уровня дороги у бордюра; к фасаду поднимается вслед за рельефом, но не круче 15 %
          const q = a.deck ? a : null, yq = p => q ? q.y + lift : g(p[0], p[1]) + lift;
          const y = p => yq(p);
          const yI0 = yq(I0), yI1 = yq(I1), wd = Math.max(0.5, (a.sw[side] + b.sw[side]) / 2);
          const yO = (O, yi) => q ? yi : clamp(g(O[0], O[1]) + lift, yi, yi + 0.15 * wd);
          const yO0 = yO(O0, yI0), yO1 = yO(O1, yI1);
          const top = p => (p === I0 ? yI0 : p === I1 ? yI1 : p === O0 ? yO0 : p === O1 ? yO1 : p === E0 ? yI0 + (yO0 - yI0) * fe : yI1 + (yO1 - yI1) * fe) + P.curb;
          const nn = a.deck ? UP : gn(a.x, a.z);
          const v3 = (p, yy) => [p[0], yy, p[1]];
          quad('panot', [v3(I0, top(I0)), v3(I1, top(I1)), v3(E1, top(E1)), v3(E0, top(E0))], nn, 0xdedad2);
          quad('panot', [v3(E0, top(E0)), v3(E1, top(E1)), v3(O1, top(O1)), v3(O0, top(O0))], nn, 0xffffff);
          // бордюр (лицом к дороге)
          const [nx, nz] = [sg * a.tz, -sg * a.tx];
          wallQuad('panot', I0[0], I0[1], y(I0) - 0.02, top(I0), I1[0], I1[1], y(I1) - 0.02, top(I1), nx, nz, 0xd6d2ca);
          // наружный край — где за тротуаром нет фасада вплотную
          if (!(a.fac && a.fac[side] < a.hw + a.sw[side] + 0.6)) wallQuad('panot', O0[0], O0[1], y(O0) - 0.3, top(O0), O1[0], O1[1], y(O1) - 0.3, top(O1), -nx, -nz, 0xb8b4ac);
          // торцы на обрезке
          if (cutStart) wallQuad('panot', I0[0], I0[1], y(I0) - 0.02, top(I0), O0[0], O0[1], y(O0) - 0.02, top(O0), -a.tx, -a.tz, 0xd6d2ca);
          if (cutEnd) wallQuad('panot', I1[0], I1[1], y(I1) - 0.02, top(I1), O1[0], O1[1], y(O1) - 0.02, top(O1), a.tx, a.tz, 0xd6d2ca);
          // столкновения: верх и бордюр
          const c3 = (p, yy) => [p[0], yy, p[1]];
          cquad(c3(I0, top(I0)), c3(I1, top(I1)), c3(O1, top(O1)), c3(O0, top(O0)));
          cquad(c3(I0, y(I0) - 0.1), c3(I1, y(I1) - 0.1), c3(I1, top(I1)), c3(I0, top(I0)));
          if (cutStart) cquad(c3(I0, y(I0) - 0.1), c3(O0, y(O0) - 0.1), c3(O0, top(O0)), c3(I0, top(I0)));
          if (cutEnd) cquad(c3(I1, y(I1) - 0.1), c3(O1, y(O1) - 0.1), c3(O1, top(O1)), c3(I1, top(I1)));
          addWalk([I0, I1, O1, O0], top(I0));
          nWalk++;
        }
      }
    }
  }

  /* ---------- разметка: ось двусторонних улиц, «зебры» у перекрёстков ---------- */
  let nDash = 0, nZebra = 0;
  const AXIS = new Set(['secondary', 'tertiary', 'unclassified', 'residential']);
  for (const st of C.streets) {
    if (!st.drive || st.oneway || !AXIS.has(st.cls) || st.surf !== 'asphalt') continue;
    const v = st.v, [dl, gl] = P.dash;
    for (let i = 0; i + 1 < v.length; i++) {
      const a = v[i], b = v[i + 1], L = b.s - a.s;
      if ((a.hw + b.hw) / 2 < 2.7) continue;
      for (let s0 = Math.ceil(a.s / (dl + gl)) * (dl + gl); s0 < b.s; s0 += dl + gl) {
        const t0 = (s0 - a.s) / L, t1 = Math.min(1, (s0 + dl - a.s) / L);
        const x0 = a.x + (b.x - a.x) * t0, z0 = a.z + (b.z - a.z) * t0, x1 = a.x + (b.x - a.x) * t1, z1 = a.z + (b.z - a.z) * t1;
        if (C.carriageAt((x0 + x1) / 2, (z0 + z1) / 2, st, 1)) continue;          // на перекрёстке — без оси
        const ux = (b.x - a.x) / L, uz = (b.z - a.z) / L, w = 0.06, y = p => (a.deck ? a.y + (b.y - a.y) * p : 0) + P.lift.drive + 0.012;
        const ya = a.deck ? y(t0) : g(x0, z0) + P.lift.drive + 0.012, yb = a.deck ? y(t1) : g(x1, z1) + P.lift.drive + 0.012;
        quad('white', [[x0 - uz * w, ya, z0 + ux * w], [x1 - uz * w, yb, z1 + ux * w], [x1 + uz * w, yb, z1 - ux * w], [x0 + uz * w, ya, z0 - ux * w]], UP, 0xe8e4d8, [[0, 0], [0, 0], [0, 0], [0, 0]]);
        nDash++;
      }
    }
  }
  // «зебра»: конец улицы с тротуарами упирается в другую улицу — переход за её тротуаром
  for (const st of C.streets) {
    if (!st.drive || st.cls === 'service' || st.len < 30) continue;
    const v = st.v;
    for (const end of [0, 1]) {
      const E = end ? v[v.length - 1] : v[0], q0 = end ? v[v.length - 2] : v[1];
      if (!(E.sw[0] > 0 && E.sw[1] > 0) || E.deck) continue;
      const O = C.carriageAt(E.x, E.z, st);
      if (!O) continue;
      const ow = O.st.v[O.i], margin = Math.max(ow.sw[0], ow.sw[1]) + 0.5;
      // идти от конца, пока точка в проезжей части другой улицы или её тротуаре
      const dir = [(q0.x - E.x), (q0.z - E.z)], dl = Math.hypot(...dir), ux = dir[0] / dl, uz = dir[1] / dl;
      let s = 0;
      while (s < 25 && C.carriageAt(E.x + ux * s, E.z + uz * s, st, margin)) s += 0.5;
      if (s >= 25 || s + 4 > st.len / 2) continue;
      const Z = P.zebra, x0 = E.x + ux * (s + 0.6), z0 = E.z + uz * (s + 0.6), hw = E.hw - 0.4;
      for (let c = -hw + Z.stripe / 2; c <= hw - Z.stripe / 2; c += Z.step) {
        const cx = x0 - uz * c, cz = z0 + ux * c, w = Z.stripe / 2;
        const p = (f, o) => { const x = cx + ux * f - uz * o, z = cz + uz * f + ux * o; return [x, g(x, z) + P.lift.drive + 0.012, z]; };
        quad('white', [p(0, -w), p(Z.len, -w), p(Z.len, w), p(0, w)], UP, 0xeeeae0, [[0, 0], [0, 0], [0, 0], [0, 0]]);
      }
      nZebra++;
    }
  }

  /* ---------- мосты и путепроводы улиц: настил, парапеты ---------- */
  const DK = P.deck;
  let nDeck = 0;
  // solid — столкновения (у настила ж/д их нет: под ним проезжая часть, а коллайдер стенки — столб от земли)
  const parapet = (ax, az, ay, bx, bz, by, nx, nz, solid = true) => {
    // стенка толщиной 0,3 м над настилом: две грани и верх
    const t = 0.3, ox = nx * t, oz = nz * t;
    wallQuad('stone', ax, az, ay - DK.t, ay + DK.parapet, bx, bz, by - DK.t, by + DK.parapet, nx, nz, 0xd8d0c0);
    wallQuad('stone', ax - ox, az - oz, ay, ay + DK.parapet, bx - ox, bz - oz, by, by + DK.parapet, -nx, -nz, 0xd8d0c0);
    quad('stone', [[ax, ay + DK.parapet, az], [bx, by + DK.parapet, bz], [bx - ox, by + DK.parapet, bz - oz], [ax - ox, ay + DK.parapet, az - oz]], UP, 0xe8e0d0);
    const cx = (ax + bx) / 2 - ox / 2, cz = (az + bz) / 2 - oz / 2, L = Math.hypot(bx - ax, bz - az);
    if (solid && L > 0.2) grid.addOBB(cx, cz, t, L, Math.atan2(bx - ax, bz - az), Math.max(ay, by) + DK.parapet - g(cx, cz));
  };
  for (const st of C.streets) {
    const v = st.v;
    for (let i = 0; i + 1 < v.length; i++) {
      const a = v[i], b = v[i + 1];
      if (!a.deck) continue;
      const wa = a.hw + Math.max(a.sw[0], a.sw[1]) + 0.3, wb = b.hw + Math.max(b.sw[0], b.sw[1]) + 0.3;
      decks.slab([a.x, a.y + P.lift.drive, a.z], [b.x, b.y + P.lift.drive, b.z], 2 * Math.max(wa, wb), DK.t);
      // боковины настила и низ
      for (const sg of [1, -1]) {
        const [ax, az] = offs(a, sg * wa), [bx, bz] = offs(b, sg * wb);
        parapet(ax, az, a.y + P.lift.drive, bx, bz, b.y + P.lift.drive, sg * -a.tz, sg * a.tx);
      }
      const [lx0, lz0] = offs(a, wa), [rx0, rz0] = offs(a, -wa), [lx1, lz1] = offs(b, wb), [rx1, rz1] = offs(b, -wb);
      quad('stone', [[lx0, a.y - DK.t, lz0], [lx1, b.y - DK.t, lz1], [rx1, b.y - DK.t, rz1], [rx0, a.y - DK.t, rz0]], [0, -1, 0], 0xb0a898);
      nDeck++;
    }
  }

  /* ---------- железная дорога ---------- */
  const RL = P.rail;
  // все отрезки путей — для поиска соседнего пути у ограды
  const TC = 16, tcell = new Map();
  for (const tr of C.tracks) tr.v.forEach((q, i) => {
    if (i === tr.v.length - 1) return;
    const b = tr.v[i + 1];
    for (let ci = Math.floor(Math.min(q.x, b.x) / TC); ci <= Math.floor(Math.max(q.x, b.x) / TC); ci++)
      for (let cj = Math.floor(Math.min(q.z, b.z) / TC); cj <= Math.floor(Math.max(q.z, b.z) / TC); cj++) {
        const k = ci * 65536 + cj;
        if (!tcell.has(k)) tcell.set(k, []);
        tcell.get(k).push([q, b]);
      }
  });
  const trackDist = (x, z) => {
    let best = Infinity;
    for (let ci = Math.floor((x - 4) / TC); ci <= Math.floor((x + 4) / TC); ci++)
      for (let cj = Math.floor((z - 4) / TC); cj <= Math.floor((z + 4) / TC); cj++)
        for (const [a, b] of tcell.get(ci * 65536 + cj) || []) {
          const dx = b.x - a.x, dz = b.z - a.z, LL = dx * dx + dz * dz || 1, t = clamp(((x - a.x) * dx + (z - a.z) * dz) / LL, 0, 1);
          best = Math.min(best, Math.hypot(x - a.x - dx * t, z - a.z - dz * t));
        }
    return best;
  };
  let nFence = 0;
  for (const tr of C.tracks) {
    const v = tr.v;
    for (let i = 0; i + 1 < v.length; i++) {
      const a = v[i], b = v[i + 1], deck = a.deck;
      const ya = (deck ? a.y : g(a.x, a.z)) + RL.bed, yb = (deck ? b.y : g(b.x, b.z)) + RL.bed;
      // насыпь: верх (балласт со шпалами) и откосы
      const [la, lza] = offs(a, RL.top), [ra, rza] = offs(a, -RL.top), [lb, lzb] = offs(b, RL.top), [rb, rzb] = offs(b, -RL.top);
      const va = a.s / 2.4, vb = b.s / 2.4;
      quad('ballast', [[la, ya, lza], [lb, yb, lzb], [rb, yb, rzb], [ra, ya, rza]], UP, 0xffffff, [[0.12, va], [0.12, vb], [0.88, vb], [0.88, va]]);
      for (const sg of [1, -1]) {
        const [xa, za] = offs(a, sg * RL.top), [xb, zb] = offs(b, sg * RL.top), [Xa, Za] = offs(a, sg * RL.half), [Xb, Zb] = offs(b, sg * RL.half);
        const ga = deck ? a.y - 0.1 : g(Xa, Za) - 0.1, gb = deck ? b.y - 0.1 : g(Xb, Zb) - 0.1;
        quad('ballast', [[xa, ya, za], [xb, yb, zb], [Xb, gb, Zb], [Xa, ga, Za]], UP, 0xe0dcd6, [[0.12, va], [0.12, vb], [0, vb], [0, va]]);
      }
      // рельсы: брусок 7 × 16 см
      for (const sg of [1, -1]) {
        const [xa, za] = offs(a, sg * RL.gauge), [xb, zb] = offs(b, sg * RL.gauge), w = 0.035, nx = -a.tz * w, nz = a.tx * w;
        const ta = ya + RL.h, tb = yb + RL.h;
        quad('steel', [[xa - nx, ta, za - nz], [xb - nx, tb, zb - nz], [xb + nx, tb, zb + nz], [xa + nx, ta, za + nz]], UP);
        wallQuad('steel', xa + nx, za + nz, ya, ta, xb + nx, zb + nz, yb, tb, -a.tz, a.tx);
        wallQuad('steel', xa - nx, za - nz, ya, ta, xb - nx, zb - nz, yb, tb, a.tz, -a.tx);
      }
      // на путепроводе — настил и парапеты
      if (deck) {
        for (const sg of [1, -1]) {
          const [ax, az] = offs(a, sg * (RL.half + 0.3)), [bx, bz] = offs(b, sg * (RL.half + 0.3));
          if (trackDist((ax + bx) / 2, (az + bz) / 2) < RL.half) continue;     // соседний путь на том же мосту
          parapet(ax, az, a.y, bx, bz, b.y, sg * -a.tz, sg * a.tx, false);
        }
        const [lx0, lz0] = offs(a, RL.half + 0.3), [rx0, rz0] = offs(a, -RL.half - 0.3), [lx1, lz1] = offs(b, RL.half + 0.3), [rx1, rz1] = offs(b, -RL.half - 0.3);
        quad('stone', [[lx0, a.y - DK.t, lz0], [lx1, b.y - DK.t, lz1], [rx1, b.y - DK.t, rz1], [rx0, a.y - DK.t, rz0]], [0, -1, 0], 0xb0a898);
        quad('stone', [[lx0, a.y - 0.05, lz0], [lx1, b.y - 0.05, lz1], [rx1, b.y - 0.05, rz1], [rx0, a.y - 0.05, rz0]], UP, 0x9a9488);
        continue;
      }
      // ограда по обе стороны, кроме промежутков между соседними путями и проезжей части
      for (const sg of [1, -1]) {
        const [xa, za] = offs(a, sg * RL.fence), [xb, zb] = offs(b, sg * RL.fence), mx = (xa + xb) / 2, mz = (za + zb) / 2;
        if (trackDist(mx, mz) < RL.fence - 0.3 || C.carriageAt(mx, mz, null, 1.5) || D.waterAt(mx, mz) > -1) continue;
        if (b.deck || (i > 0 && v[i - 1].deck)) continue;
        const ga = g(xa, za), gb = g(xb, zb);
        wallQuad('fence', xa, za, ga - 0.05, ga + RL.fenceH, xb, zb, gb - 0.05, gb + RL.fenceH, sg * -a.tz, sg * a.tx, 0xffffff, 'fence');
        const L = Math.hypot(xb - xa, zb - za);
        if (L > 0.2) grid.addOBB(mx, mz, 0.2, L, Math.atan2(xb - xa, zb - za), RL.fenceH + Math.max(ga, gb) - g(mx, mz));
        nFence++;
      }
    }
  }

  /* ---------- лестницы: тумбы на концах ---------- */
  const bollards = [];
  for (const st of C.streets) {
    if (st.cls !== 'steps') continue;
    const v = st.v;
    for (const end of [0, 1]) {
      const E = end ? v[v.length - 1] : v[0], N = end ? v[v.length - 2] : v[1], L = Math.hypot(N.x - E.x, N.z - E.z) || 1;
      const ux = (N.x - E.x) / L, uz = (N.z - E.z) / L, d = Math.min(0.8, L / 2);
      for (const c of [-0.8, 0, 0.8]) bollards.push([E.x + ux * d - uz * c, E.z + uz * d + ux * c]);
    }
  }

  /* ---------- граница игровой области на суше ---------- */
  const WL = P.wall, rect = C.rect, G = SITGES_GEO.north;
  const border = [];
  for (let k = 0; k < C.north.length; k++) border.push([G.x0 + k * G.step, C.north[k] + WL.off]);
  border.sort((p, q) => p[0] - q[0]);
  const bx0 = rect[0] - 1.5, bx1 = rect[1] + 1.5;
  const line = [[bx0, rect[2]], [bx0, C.northAt(rect[0]) + WL.off], ...border.filter(p => p[0] > bx0 && p[0] < bx1), [bx1, C.northAt(rect[1]) + WL.off], [bx1, rect[2]]];
  const blocks = [];
  let nWall = 0;
  for (let k = 0; k + 1 < line.length; k++) {
    const [ax0, az0] = line[k], [bx2, bz2] = line[k + 1], L = Math.hypot(bx2 - ax0, bz2 - az0), n = Math.max(1, Math.ceil(L / 5));
    for (let s = 0; s < n; s++) {
      const ax = ax0 + (bx2 - ax0) * s / n, az = az0 + (bz2 - az0) * s / n, bx = ax0 + (bx2 - ax0) * (s + 1) / n, bz = az0 + (bz2 - az0) * (s + 1) / n;
      const mx = (ax + bx) / 2, mz = (az + bz) / 2, ga = g(ax, az), gb = g(bx, bz);
      if (D.waterAt(mx, mz) > -1 || Math.min(ga, gb) < 0.2) continue;              // в море стены нет
      const l = Math.hypot(bx - ax, bz - az), nx = (bz - az) / l, nz = -(bx - ax) / l;
      if (C.carriageAt(mx, mz, null, 2)) { blocks.push([mx, mz, Math.atan2(bx - ax, bz - az), l]); continue; }   // улица уходит за границу
      const t = WL.t / 2;
      for (const sg of [1, -1]) wallQuad('stone', ax + nx * t * sg, az + nz * t * sg, ga - 0.4, ga + WL.h, bx + nx * t * sg, bz + nz * t * sg, gb - 0.4, gb + WL.h, nx * sg, nz * sg, 0xd8ccb4);
      quad('stone', [[ax + nx * t, ga + WL.h, az + nz * t], [bx + nx * t, gb + WL.h, bz + nz * t], [bx - nx * t, gb + WL.h, bz - nz * t], [ax - nx * t, ga + WL.h, az - nz * t]], UP, 0xe8dcc4);
      grid.addOBB(mx, mz, WL.t, l, Math.atan2(bx - ax, bz - az), WL.h + Math.max(ga, gb) - g(mx, mz));
      nWall++;
    }
  }

  /* ---------- меши ---------- */
  let tris = 0;
  for (const b of buckets.values()) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, MAT[b.mat]);
    mesh.receiveShadow = true;
    mesh.castShadow = b.mat === 'stone';
    mesh.userData.keep = true;
    group.add(mesh);
    tris += b.pos.length / 9;
  }
  // тумбы: один InstancedMesh, столкновения — круги
  if (bollards.length) {
    const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.11, 0.13, 0.9, 8), new THREE.MeshStandardMaterial({ color: 0x3a3c3e, roughness: 0.6, metalness: 0.4 }), bollards.length);
    const m4 = new THREE.Matrix4();
    bollards.forEach(([x, z], k) => { im.setMatrixAt(k, m4.makeTranslation(x, g(x, z) + 0.45, z)); grid.addCircle(x, z, 0.13, 0.9); });
    im.castShadow = im.receiveShadow = true; im.userData.keep = true; im.computeBoundingSphere();
    group.add(im);
  }
  // бетонные блоки (New Jersey) поперёк улиц на границе
  if (blocks.length) {
    const shape = new THREE.Shape([[-0.3, 0], [0.3, 0], [0.3, 0.08], [0.12, 0.25], [0.1, 0.8], [-0.1, 0.8], [-0.12, 0.25], [-0.3, 0.08]].map(([x, y]) => new THREE.Vector2(x, y)));
    const bg = new THREE.ExtrudeGeometry(shape, { depth: 2, bevelEnabled: false }); bg.translate(0, 0, -1);
    const list = [];
    for (const [mx, mz, rot, l] of blocks) {
      const n = Math.max(1, Math.round(l / 2));
      for (let q = 0; q < n; q++) {
        const f = (q + 0.5) / n - 0.5, x = mx + Math.sin(rot) * f * l, z = mz + Math.cos(rot) * f * l;
        list.push([x, z, rot]);
      }
      grid.addOBB(mx, mz, 0.6, l, rot, 0.8);
    }
    const im = new THREE.InstancedMesh(bg, new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: 0.85 }), list.length);
    const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3(1, 1, 1), cc = new THREE.Color();
    list.forEach(([x, z, rot], k) => {
      im.setMatrixAt(k, m4.compose(new THREE.Vector3(x, g(x, z), z), qt.setFromAxisAngle(up, rot), sc));
      im.setColorAt(k, cc.setHex(k % 2 ? 0xe8e4dc : 0xc8402c));
    });
    im.castShadow = im.receiveShadow = true; im.userData.keep = true; im.computeBoundingSphere();
    group.add(im);
  }
  const meshColliders = [...cmesh.values()].map(m => ({ v: new Float32Array(m.v), i: new Uint32Array(m.i) }));

  // тротуар под точкой: высота верха или −∞
  const inQuad = (x, z, p) => {
    let pos = 0, neg = 0;
    for (let k = 0; k < 4; k++) {
      const [ax, az] = p[k], [bx, bz] = p[(k + 1) % 4], c = (bx - ax) * (z - az) - (bz - az) * (x - ax);
      if (c > 0) pos++; else if (c < 0) neg++;
    }
    return !(pos && neg);
  };
  const walkAt = (x, z) => {
    const list = walks.get(Math.floor(x / WC) * 65536 + Math.floor(z / WC));
    if (list) for (const o of list) if (inQuad(x, z, o.pts)) return o.y;
    return -Infinity;
  };
  Object.assign(K, {
    meshColliders, walkAt, roadSurf: st => surfOf(st)[2],
    roadsStats: { ribbon: nRibbon, walk: nWalk, dash: nDash, zebra: nZebra, deck: nDeck, fence: nFence, wall: nWall, blocks: blocks.length, bollards: bollards.length, tris, meshes: buckets.size, colliders: meshColliders.reduce((s, m) => s + m.i.length / 3, 0) },
  });
}
