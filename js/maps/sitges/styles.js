// Ситжес — РАСКЛАДКА: стили фасадов зданий (этап 4). После домов (js/maps/sitges/houses.js): стиль — по году
// постройки и этажности кадастра, по тому, стоит ли дом вплотную к соседям, и по району; цвет стен и ставен —
// из палитры стиля по номеру здания (без R(): здание всегда того же цвета). Палитры и доли — по фото-образцам
// (docs/sitges/photos.md, Street View sv/old … y2000, seafront; таблица — docs/sitges/stage-4.md).
// Стиль (номер = индекс в SITGES_STYLES) уходит в шейдер фасада атрибутом aSty (js/maps/sitges/facade.js): вид ставен,
// размер окон, цоколь, балконы. Балконы — правило по номеру оконной оси и этажа (целые числа), одно
// на раскладку и шейдер: sitgesBalcony() — там, где плита балкона, окно рисуется дверью.
// b.style = { id, wall: THREE.Color, shut } у каждого здания C.blds; сводка — C.styleStats.
// Балконы и карнизы (4.4) — раскладка здесь же (sitgesPlanFacades, после стилей), геометрия — js/maps/sitges/facades3d.js.
// Определяет: SITGES_SHUTTERS, SITGES_STYLES, SITGES_OLDTOWN, sitgesBalcony, sitgesPlanStyles, SITGES_PLAIN,
//   SITGES_BALC, sitgesPlanFacades.
// Использует: SITGES_FLOOR (js/maps/sitges/plan.js); SITGES_WALL (js/maps/sitges/houses.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

// цвета ставен (sRGB): номер — в атрибуте; жалюзи-створки — 0…4, роллеты — 5…7
const SITGES_SHUTTERS = [0x3d6b45, 0x2d4a3c, 0x2f5d8c, 0x5b3b25, 0xeeece6, 0xd8cfbd, 0xf0eee8, 0xa9a69e];
// стили: wall — палитра стен; shut — [номер цвета ставен, доля] (тип ставен: 1 — створки по бокам окна,
// 2 — роллет сверху, 0 — нет); win — окно в оси (доли ширины) и по высоте над полом этажа, м; frame — обрамление
// окна (пока не рисуется: дорого в шейдере, этап 4); plinth — высота цоколя, м; bal — балконы: 0 нет, 1 по осям (все этажи), 2 только второй этаж,
// 3 все оси всех этажей; balK — из 5 осей с балконом (для bal = 1). Геометрия (4.4, по листам sv/old-1, y1940-1,
// y1975-1): slab — плита балкона: d — вынос, t — толщина, м; run — соседние оси одной плитой (иначе у каждой
// двери своя); solid — доля зданий (%) со сплошным ограждением вместо решётки. cornice — карниз по верху открытых
// стен под плоской крышей: [вынос, высота], м (нет — без карниза)
const SITGES_STYLES = [
  { name: 'old', wall: [0xf2efe6, 0xeadfc6, 0xe3cfa5, 0xd9c09a, 0xf0e6d2], shutType: 1, shut: [[0, 35], [3, 30], [2, 20], [1, 15]],
    win: [0.33, 0.67], winY: [0.3, 2.55], frame: 1, plinth: 0.7, bal: 1, balK: 4,
    slab: { d: 0.65, t: 0.12, run: 0, solid: 0 }, cornice: [0.32, 0.26] },
  { name: 'eixample', wall: [0xe8d8b8, 0xead7b0, 0xf1e4cc, 0xe5c9a0, 0xe9cfc0, 0xf3ede2], shutType: 1, shut: [[0, 50], [1, 15], [2, 15], [3, 10], [4, 10]],
    win: [0.32, 0.68], winY: [0.45, 2.5], frame: 1, plinth: 0.8, bal: 2, balK: 5,
    slab: { d: 0.75, t: 0.14, run: 1, solid: 0 }, cornice: [0.4, 0.3] },
  { name: 'villa', wall: [0xf4f1ea, 0xefe3cc, 0xf0d9c0, 0xe6d1a8], shutType: 1, shut: [[0, 45], [4, 25], [3, 30]],
    win: [0.3, 0.7], winY: [0.8, 2.3], frame: 1, plinth: 0.5, bal: 0, balK: 0, cornice: [0.3, 0.22] },
  { name: 'block60', wall: [0xf2f1ec, 0xeeeae0, 0xe9e4d8, 0xf0ede4], shutType: 2, shut: [[6, 50], [5, 40], [7, 10]],
    win: [0.2, 0.8], winY: [0.8, 2.3], frame: 0, plinth: 1.0, bal: 1, balK: 3,
    slab: { d: 1.0, t: 0.18, run: 1, solid: 60 } },
  { name: 'block80', wall: [0xf4f2ee, 0xe9e2d3, 0xd9c3a3, 0xf0ebe0], shutType: 2, shut: [[5, 50], [6, 30], [7, 20]],
    win: [0.22, 0.78], winY: [0.8, 2.3], frame: 0, plinth: 0.6, bal: 3, balK: 5,
    slab: { d: 1.5, t: 0.2, run: 1, solid: 40 } },
  { name: 'modern', wall: [0xe6dfd2, 0xd8d4cc, 0xb86f50, 0xf2f0eb], shutType: 0, shut: [[7, 100]],
    win: [0.15, 0.85], winY: [0.5, 2.5], frame: 0, plinth: 0, bal: 0, balK: 0 },
  { name: 'house', wall: [0xf3f1ec, 0xece4d4, 0xf0e8d6], shutType: 2, shut: [[6, 50], [5, 30], [0, 20]],
    win: [0.3, 0.7], winY: [0.8, 2.2], frame: 0, plinth: 0.6, bal: 0, balK: 0 },
  { name: 'white', wall: [0xf7f6f2, 0xf3f2ee, 0xf5f2ea], shutType: 1, shut: [[2, 50], [0, 40], [3, 10]],
    win: [0.36, 0.64], winY: [0.8, 2.2], frame: 0, plinth: 0.5, bal: 1, balK: 1,
    slab: { d: 0.6, t: 0.12, run: 0, solid: 0 } },
];// старый город (Casc Antic у церкви) и Сант-Себастья: круги в координатах игры [x, z, радиус]
const SITGES_OLDTOWN = [[-565, -120, 190], [-420, -40, 110], [-820, -60, 120]];

// балкон у оси col на этаже j (0 — первый над нижним), вид стены — к улице; seed — номер здания
function sitgesBalcony(S, col, j, seed) {
  if (!S.bal || j < 0) return false;
  if (S.bal === 2) return j === 0;
  if (S.bal === 3) return true;
  return (col * 7 + seed) % 5 < S.balK;
}

function sitgesPlanStyles(C) {
  const { blds, houses } = C;
  const st = {};
  // по зданию: самая высокая часть, стоит ли вплотную к другому зданию (у части есть общая стена с чужой частью)
  const info = blds.map(() => ({ floors: 0, attached: false }));
  for (const h of houses) {
    const I = info[h.bi];
    I.floors = Math.max(I.floors, h.p.floors);
    if (h.attached) I.attached = true;
  }
  blds.forEach((b, bi) => {
    const I = info[bi], y = b.year, f = I.floors;
    // центр здания — по первой части
    const r = b.parts[0].rings[0], x = r.reduce((s, p) => s + p[0], 0) / r.length, z = r.reduce((s, p) => s + p[1], 0) / r.length;
    const old = SITGES_OLDTOWN.some(([cx, cz, rr]) => (x - cx) ** 2 + (z - cz) ** 2 < rr * rr);
    let name;
    if (y && y >= 2000) name = 'modern';
    else if (y && y >= 1975) name = f >= 3 ? 'block80' : 'house';
    else if (y && y >= 1940) name = f >= 3 ? 'block60' : old ? 'white' : 'house';
    else if (old) name = f <= 2 ? 'white' : 'old';
    else if (y && y < 1900) name = 'old';
    else if (!I.attached && f <= 3) name = 'villa';
    else if (y) name = 'eixample';
    else name = f >= 4 ? 'block60' : 'house';
    // Айгуадольс (марина): белые дома с синими акцентами
    if (x < -1300 && (name === 'house' || name === 'villa')) name = 'white';
    const id = SITGES_STYLES.findIndex(s => s.name === name), S = SITGES_STYLES[id];
    // цвет стен — из палитры по номеру здания; ставни — по долям
    const wall = new THREE.Color(S.wall[(bi * 7 + 3) % S.wall.length]);
    const roll = (bi * 37 + 11) % 100;
    let acc = 0, shut = S.shut[0][0];
    for (const [k, p] of S.shut) { acc += p; if (roll < acc) { shut = k; break; } }
    b.style = { id, wall, shut };
    st[name] = (st[name] || 0) + 1;
  });
  Object.assign(C, { styleStats: st });
}

// склады и сельские постройки: стиль в шейдере — modern (js/maps/sitges/buildings.js, SITGES_BCOLORS), без балконов
const SITGES_PLAIN = new Set(['2_agriculture', '3_industrial']);
// балконы и карнизы (4.4): плита шире двери на ext с каждой стороны, м; ниже minY над землёй — не ставить; решётка
// цвета ставен (если ставни тёмные) у доли railShut %, иначе чёрная; у блоков — доля белых решёток railWhite %
const SITGES_BALC = { ext: 0.35, minY: 2.5, railShut: 30, railWhite: 30, iron: 0x2a2c2c, white: 0xe6e4de };

// Раскладка балконов и карнизов (после стилей). Балконы — на кусках стен к улице (street, shops) на этажах ≥ 2
// строго по sitgesBalcony(): ось col — целая часть aFac.x (w.ua…w.ub), окно оси целиком на куске, дверь в шейдере —
// на той же оси. Плита — верхом на полу этажа j (base + ground + j·h). Карниз — по верху открытых стен (не глухих)
// под плоской крышей у стилей с cornice: под парапетом, на высоте пола над последним этажом.
// C.balconies — { ax, az, bx, bz, nx, nz, y, d, t, solid, wall: hex, rail: hex } (a, b — концы плиты у стены);
// C.cornices — { ax, az, bx, bz, nx, nz, y, d, h, wall: hex } (y — верх карниза); сводка — C.facStats.
function sitgesPlanFacades(C) {
  const { houses } = C, F = SITGES_FLOOR, W = SITGES_WALL, B = SITGES_BALC;
  const balconies = [], cornices = [];
  const st = { balconies: 0, doors: 0, solid: 0, cornices: 0, corniceLen: 0, byStyle: {} };
  for (const h of houses) {
    const b = h.b, bi = h.bi, S = SITGES_STYLES[b.style.id];
    if (SITGES_PLAIN.has(b.use)) continue;
    const wall = b.style.wall.getHex();
    // ограждение здания: сплошное или решётка (её цвет)
    const solid = S.slab && (bi * 13 + 5) % 100 < S.slab.solid;
    const shutDark = b.style.shut <= 3 && S.shutType === 1;
    const rail = solid ? wall : shutDark && (bi * 29 + 7) % 100 < B.railShut ? SITGES_SHUTTERS[b.style.shut]
      : S.shutType === 2 && (bi * 17 + 3) % 100 < B.railWhite ? B.white : B.iron;
    const upper = h.p.floors - 1;                                  // этажей над первым
    for (const w of h.walls) {
      const L = Math.hypot(w.bx - w.ax, w.bz - w.az), du = w.ub - w.ua;
      if (L < 0.5 || du <= 0) continue;
      const m = L / du, ux = (w.bx - w.ax) / L, uz = (w.bz - w.az) / L;
      // точка стены по номеру оси u
      const at = u => [w.ax + ux * (u - w.ua) * m, w.az + uz * (u - w.ua) * m];
      const gAt = u => w.ga + (w.gb - w.ga) * (u - w.ua) / du;
      /* ---------- карниз ---------- */
      if (S.cornice && w.kind !== W.blind && h.roof.kind === 'flat' && !h.pass && Math.abs(w.hi - h.y1) < 0.05) {
        const y = h.y1 - F.parapet;
        if (y - Math.max(w.ga, w.gb) > 2.5) {
          cornices.push({ ax: w.ax, az: w.az, bx: w.bx, bz: w.bz, nx: w.nx, nz: w.nz, y, d: S.cornice[0], h: S.cornice[1], wall });
          st.cornices++; st.corniceLen += L;
        }
      }
      /* ---------- балконы ---------- */
      if (!S.slab || (w.kind !== W.street && w.kind !== W.shops)) continue;
      const [x0, x1] = S.win, ext = B.ext / m;                     // в долях оси
      for (let j = 0; j < upper; j++) {
        const y = h.base + F.ground + j * F.h;
        if (y < w.lo - 0.01 || y + 2.4 > w.hi) continue;           // дверь не вся на этом куске стены
        // оси с балконом: окно целиком на куске, над землёй не ниже minY
        const cols = [];
        for (let c = Math.ceil(w.ua - x0 - 1e-6); c + x1 <= w.ub + 1e-6; c++) {
          if (c + x0 < w.ua - 1e-6) continue;
          if (!sitgesBalcony(S, c, j, bi)) continue;
          if (y - Math.max(gAt(c + x0), gAt(c + x1)) < B.minY) continue;
          cols.push(c);
        }
        st.doors += cols.length;
        // плиты: у run — подряд идущие оси одной плитой
        for (let k = 0; k < cols.length;) {
          let e = k;
          if (S.slab.run) while (e + 1 < cols.length && cols[e + 1] === cols[e] + 1) e++;
          const u0 = Math.max(w.ua + 0.05 / m, cols[k] + x0 - ext), u1 = Math.min(w.ub - 0.05 / m, cols[e] + x1 + ext);
          const [ax, az] = at(u0), [bx, bz] = at(u1);
          balconies.push({ ax, az, bx, bz, nx: w.nx, nz: w.nz, y, d: S.slab.d, t: S.slab.t, solid, wall, rail });
          st.balconies++; if (solid) st.solid++;
          st.byStyle[S.name] = (st.byStyle[S.name] || 0) + 1;
          k = e + 1;
        }
      }
    }
  }
  st.corniceLen = Math.round(st.corniceLen);
  Object.assign(C, { balconies, cornices, facStats: st });
}
