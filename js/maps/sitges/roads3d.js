// Ситжес — ПОСТРОЙКА: улицы по раскладке (js/maps/sitges/roads.js и следующие этапы улиц).
//   sitgesBuildRoads — набор постройки K.rk (материалы, копилка геометрии по квадратам SITGES_RB.chunk м и материалам —
//     мало вызовов отрисовки; сетка столкновений тротуаров, поиск тротуаров, парапет) и полотно: лента по точкам улицы
//     чуть выше рельефа, текстура в мировых координатах (на перекрёстках ленты перекрываются без шва).
//   sitgesBuildMarks — разметка (ось двусторонних улиц, «зебры» за точками касания углов), мосты и путепроводы улиц
//     (настил Decks с парапетами).
//   sitgesBuildRoadMeshes — меши из копилки, блоки, сетка столкновений (world.meshColliders), walkAt.
// Между ними — тротуары (walks3d.js) и ж/д с границей (rail3d.js); порядок — в buildSitges() (js/maps/sitges/build.js):
// от него зависит порядок вершин в мешах (отпечаток мира).
// Определяет: SITGES_RB, sitgesRoadTextures, SITGES_RB_TILE, sitgesBuildRoads, sitgesBuildMarks,
//   sitgesBuildRoadMeshes.
// Использует: mulberry32 (js/world.js); Weather (js/weather.js); canvasTex (js/maps/city/textures.js); cobbleTexture
//   (js/maps/city/landmarks.js); sitgesCells (js/maps/sitges/geom.js); SITGES_R (js/maps/sitges/roads.js).
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
  // настил моста: толщина и высота перил; under — улица под перилами проходит под мостом, если просвет под настилом
  // где-то на её проезжей части не меньше under м, иначе это стык моста с улицей в одном уровне — там перил нет;
  // над проходящей под мостом улицей настил толщиной thin; piece — шаг проверки перил, м
  deck: { t: 0.9, thin: 0.5, parapet: 1.0, under: 2, piece: 0.5 },
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

// набор постройки улиц: материалы, копилка геометрии по квадратам и материалам, сетка столкновений тротуаров, поиск
// тротуаров, полотно улиц. Набор — K.rk; им пользуются walks3d.js, rail3d.js и сборка мешей sitgesBuildRoadMeshes()
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
  // lod — материалы мелкими квадратами со скрытием вдали: { mat: [квадрат, дальность] } (заборы, fences3d.js; балконы,
  // facades3d.js)
  const buckets = new Map(), lod = {};
  const bucket = (mat, x, z) => {
    const ch = lod[mat] ? lod[mat][0] : P.chunk, i = Math.floor(x / ch), j = Math.floor(z / ch), k = mat + '|' + i + ',' + j;
    let b = buckets.get(k);
    if (!b) buckets.set(k, b = { mat, pos: [], nor: [], uv: [], col: [], x: (i + 0.5) * ch, z: (j + 0.5) * ch, ch });
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
  const walks = sitgesCells(8);
  // ys — высоты углов (съезд у ворот, walks3d.js): тогда высота под точкой — по треугольнику, иначе y на весь кусок
  const addWalk = (pts, y, ys) => {
    const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]);
    walks.add(Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs), ys ? { pts, y, ys } : { pts, y });
  };
  const offs = (q, d) => [q.x - q.tz * d, q.z + q.tx * d];   // d > 0 — сторона 0 (левая)
  const DK = P.deck;
  // solid — столкновения (у настила ж/д их нет: под ним проезжая часть). Коллайдер — только на высоте стенки
  // (от низа настила до верха перил, y0 / y1 в сетке): под мостом проезжают игроки и трафик
  // dt — толщина настила (наружная грань стенки закрывает его бок)
  const parapet = (ax, az, ay, bx, bz, by, nx, nz, solid = true, dt = DK.t) => {
    // стенка толщиной 0,3 м над настилом: две грани и верх
    const t = 0.3, ox = nx * t, oz = nz * t;
    wallQuad('stone', ax, az, ay - dt, ay + DK.parapet, bx, bz, by - dt, by + DK.parapet, nx, nz, 0xd8d0c0);
    wallQuad('stone', ax - ox, az - oz, ay, ay + DK.parapet, bx - ox, bz - oz, by, by + DK.parapet, -nx, -nz, 0xd8d0c0);
    quad('stone', [[ax, ay + DK.parapet, az], [bx, by + DK.parapet, bz], [bx - ox, by + DK.parapet, bz - oz], [ax - ox, ay + DK.parapet, az - oz]], UP, 0xe8e0d0);
    const cx = (ax + bx) / 2 - ox / 2, cz = (az + bz) / 2 - oz / 2, L = Math.hypot(bx - ax, bz - az);
    if (solid && L > 0.2) Object.assign(grid.addOBB(cx, cz, t, L, Math.atan2(bx - ax, bz - az), Math.max(ay, by) + DK.parapet - g(cx, cz)),
      { y0: Math.min(ay, by) - dt, y1: Math.max(ay, by) + DK.parapet });
  };

  const cnt = { ribbon: 0, walk: 0, corner: 0, dash: 0, zebra: 0, deck: 0, fence: 0, wall: 0 };
  // casts — материалы, чьи меши отбрасывают тень (теневые копии, js/world.js); apart — материалы чужих этапов (балконы,
  // facades3d.js): в сводку улиц не идут
  K.rk = { MAT, surfOf, buckets, lod, casts: new Set(['stone', 'plaster']), apart: new Set(), quad, gn, UP, wallQuad, cmesh, cquad, walks, addWalk, offs, parapet, cnt, blocks: [] };

  /* ---------- полотно улиц ---------- */
  // дорожки внутри парков нарисованы на земле (сауло, бетон — js/maps/sitges/parkcover.js): там ленты нет
  const parkSkip = K.parkSkip;
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
        const q = at(k / n), B = row(q), nn = deck ? UP : gn(q.x, q.z), mid = parkSkip && at((k - 0.5) / n);
        if (!mid || !parkSkip(st, mid.x, mid.z, deck)) for (let c = 0; c < m; c++) quad(mat, [A[c], B[c], B[c + 1], A[c + 1]], nn, c0);
        A = B;
      }
      cnt.ribbon++;
    }
  }
}

// разметка (ось, «зебры»), мосты и путепроводы улиц — после тротуаров (порядок геометрии в копилке)
function sitgesBuildMarks(K) {
  const { D, group, grid, decks, rk } = K, C = D.C, P = SITGES_RB, R = SITGES_R, g = D.ground;
  const { MAT, surfOf, buckets, quad, gn, UP, wallQuad, cmesh, cquad, walks, addWalk, offs, parapet, cnt, blocks } = rk;
  /* ---------- разметка: ось двусторонних улиц, «зебры» у перекрёстков ---------- */
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
        cnt.dash++;
      }
    }
  }
  // «зебра»: конец улицы с тротуарами упирается в другую улицу — переход за её тротуаром (места — sitgesZebras(),
  // js/maps/sitges/street.js: C.street.zebras)
  const Z = P.zebra;
  for (const { x0, z0, zx, zz, hw } of C.street.zebras) {
    for (let c = -hw + Z.stripe / 2; c <= hw - Z.stripe / 2; c += Z.step) {
      const cx = x0 - zz * c, cz = z0 + zx * c, w = Z.stripe / 2;
      const p = (f, o) => { const x = cx + zx * f - zz * o, z = cz + zz * f + zx * o; return [x, g(x, z) + P.lift.drive + 0.012, z]; };
      quad('white', [p(0, -w), p(Z.len, -w), p(Z.len, w), p(0, w)], UP, 0xeeeae0, [[0, 0], [0, 0], [0, 0], [0, 0]]);
    }
    cnt.zebra++;
  }

  /* ---------- мосты и путепроводы улиц: настил, парапеты ---------- */
  const DK = P.deck;
  // линия перил участка a → b (сторона sg): концы и высоты настила
  const rail = (a, b, sg) => {
    const wa = a.hw + Math.max(a.sw[0], a.sw[1]) + 0.3, wb = b.hw + Math.max(b.sw[0], b.sw[1]) + 0.3;
    const [ax, az] = offs(a, sg * wa), [bx, bz] = offs(b, sg * wb);
    return { ax, az, ay: a.y + P.lift.drive, bx, bz, by: b.y + P.lift.drive, L: Math.hypot(bx - ax, bz - az) };
  };
  // точки перил через piece м: что под ними — проезжая часть другой улицы (carriageAt) и просвет под настилом
  const railPts = (r, own, fn) => {
    const n = Math.max(1, Math.ceil(r.L / DK.piece));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n, x = r.ax + (r.bx - r.ax) * t, z = r.az + (r.bz - r.az) * t, c = C.carriageAt(x, z, own);
      fn(k, n, c, c ? r.ay + (r.by - r.ay) * t - DK.t - g(x, z) : 0);
    }
  };
  // улицы под перилами: наибольший просвет под настилом над проезжей частью каждой (мост × улица). Меньше under —
  // стык моста с улицей в одном уровне (конец моста на перекрёстке, мостик у дороги): перила там стояли бы поперёк улицы
  const under = new Map();
  for (const st of C.streets) {
    const v = st.v;
    for (let i = 0; i + 1 < v.length; i++) if (v[i].deck) for (const sg of [1, -1]) railPts(rail(v[i], v[i + 1], sg), st, (k, n, c, cl) => {
      if (!c) return;
      let m = under.get(st); if (!m) under.set(st, m = new Map());
      m.set(c.st, Math.max(m.get(c.st) ?? -Infinity, cl));
    });
  }
  cnt.railCut = 0; cnt.deckThin = 0;
  for (const st of C.streets) {
    const v = st.v, U = under.get(st);
    for (let i = 0; i + 1 < v.length; i++) {
      const a = v[i], b = v[i + 1];
      if (!a.deck) continue;
      const wa = a.hw + Math.max(a.sw[0], a.sw[1]) + 0.3, wb = b.hw + Math.max(b.sw[0], b.sw[1]) + 0.3;
      // перила — кусками, без мест над улицей в одном уровне с настилом (cut); над улицей, проходящей под мостом, —
      // настил тоньше (thin): просвет под ним — по рельефу, а он в выемках у мостов не глубже ≈ 2,5 м
      const R = [1, -1].map(sg => ({ r: rail(a, b, sg), sg, cut: null })); let thin = false;
      if (U) for (const S of R) railPts(S.r, st, (k, n, c) => {
        if (!c) return;
        if (U.get(c.st) < DK.under) (S.cut || (S.cut = new Uint8Array(n)))[k] = 1; else thin = true;
      });
      const t = thin ? DK.thin : DK.t;
      if (thin) cnt.deckThin++;
      decks.slab([a.x, a.y + P.lift.drive, a.z], [b.x, b.y + P.lift.drive, b.z], 2 * Math.max(wa, wb), t);
      for (const { r, sg, cut } of R) {
        const nx = sg * -a.tz, nz = sg * a.tx;
        if (!cut) { parapet(r.ax, r.az, r.ay, r.bx, r.bz, r.by, nx, nz, true, t); continue; }
        cnt.railCut++;
        const at = u => [r.ax + (r.bx - r.ax) * u, r.az + (r.bz - r.az) * u, r.ay + (r.by - r.ay) * u];
        for (let k = 0, n = cut.length; k < n; k++) {
          if (cut[k]) continue;
          let j = k; while (j + 1 < n && !cut[j + 1]) j++;
          const [x0, z0, y0] = at(k / n), [x1, z1, y1] = at((j + 1) / n);
          parapet(x0, z0, y0, x1, z1, y1, nx, nz, true, t);
          k = j;
        }
      }
      // низ настила
      const [lx0, lz0] = offs(a, wa), [rx0, rz0] = offs(a, -wa), [lx1, lz1] = offs(b, wb), [rx1, rz1] = offs(b, -wb);
      quad('stone', [[lx0, a.y - t, lz0], [lx1, b.y - t, lz1], [rx1, b.y - t, rz1], [rx0, a.y - t, rz0]], [0, -1, 0], 0xb0a898);
      cnt.deck++;
    }
  }
}

// меши из копилки, блоки, сетка столкновений тротуаров, walkAt
function sitgesBuildRoadMeshes(K) {
  const { D, group, grid, decks, rk } = K, C = D.C, P = SITGES_RB, R = SITGES_R, g = D.ground;
  const { MAT, surfOf, buckets, quad, gn, UP, wallQuad, cmesh, cquad, walks, addWalk, offs, parapet, cnt, blocks } = rk;
  /* ---------- меши ---------- */
  let tris = 0, meshes = 0;
  const roadLod = [];   // меши, скрываемые вдали (world.cullView): { mesh, x, z, r, far }
  for (const b of buckets.values()) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, MAT[b.mat]);
    mesh.receiveShadow = true;
    mesh.castShadow = rk.casts.has(b.mat);
    mesh.userData.keep = true;
    group.add(mesh);
    if (rk.lod[b.mat]) roadLod.push({ mesh, x: b.x, z: b.z, r: b.ch * 0.71, far: rk.lod[b.mat][1] });
    if (!rk.apart.has(b.mat)) { tris += b.pos.length / 9; meshes++; }
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
  // walk — тротуар: машины трафика за его бордюр не цепляются (js/physics.js), как за рельеф — высоту им задаёт водитель
  const meshColliders = [...cmesh.values()].map(m => ({ v: new Float32Array(m.v), i: new Uint32Array(m.i), walk: true }));

  // тротуар под точкой: высота верха или −∞. Кусок — два треугольника (0, 1, 2) и (0, 2, 3), как у меша и сетки
  // столкновений: у острых углов четырёхугольник бывает невыпуклым, проверка «все стороны с одного боку» его теряла
  const inTri = (x, z, a, b, c) => {
    const d0 = (b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]), d1 = (c[0] - b[0]) * (z - b[1]) - (c[1] - b[1]) * (x - b[0]);
    const d2 = (a[0] - c[0]) * (z - c[1]) - (a[1] - c[1]) * (x - c[0]);
    return !((d0 < 0 || d1 < 0 || d2 < 0) && (d0 > 0 || d1 > 0 || d2 > 0));
  };
  const inQuad = (x, z, p) => inTri(x, z, p[0], p[1], p[2]) || inTri(x, z, p[0], p[2], p[3]);
  // высота в треугольнике (a, b, c) с высотами (ya, yb, yc)
  const triY = (x, z, a, b, c, ya, yb, yc) => {
    const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    if (Math.abs(d) < 1e-9) return ya;
    const l0 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (z - c[1])) / d, l1 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (z - c[1])) / d;
    return l0 * ya + l1 * yb + (1 - l0 - l1) * yc;
  };
  const walkAt = (x, z) => {
    for (const o of walks.at(x, z)) {
      const p = o.pts;
      if (!o.ys) { if (inQuad(x, z, p)) return o.y; continue; }
      const h = o.ys;
      if (inTri(x, z, p[0], p[1], p[2])) return triY(x, z, p[0], p[1], p[2], h[0], h[1], h[2]);
      if (inTri(x, z, p[0], p[2], p[3])) return triY(x, z, p[0], p[2], p[3], h[0], h[2], h[3]);
    }
    return -Infinity;
  };
  Object.assign(K, {
    meshColliders, walkAt, roadLod, roadSurf: st => surfOf(st)[2],
    roadsStats: { ...cnt, fences: rk.fenceStats, drops: rk.dropStats, blocks: blocks.length, tris, meshes, colliders: meshColliders.reduce((s, m) => s + m.i.length / 3, 0) },
  });
}
