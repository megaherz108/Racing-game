// Ситжес — этап 7, группа A: фонари (план — docs/sitges/stage-7.md, архив группы — docs/sitges/st-a.md).
// Вид — по фото (Street View raw/photos/street/A, sv/oldtown, sv/y1940, sv/slope, seafront/h-*night*; числа — st-a.md):
//   wall — старый город и узкие улицы центра без тротуара: чёрный кованый фонарь на кронштейне на стене к улице
//          (≈ 4 м над землёй), неподвижный, без столкновений;
//   pole — улицы кварталов и вилл: тонкий серый столб ≈ 5 м с одной плоской головой у бордюра (нет тротуара —
//          у края полотна), сбиваемый;
//   mast — променад (Passeig Marítim, Ribera) и широкие проспекты: светло-серая мачта 9 м, на проспектах одна голова
//          на кронштейне к дороге, на променаде со стороны моря — две (V), сбиваемая;
//   post — точки street_lamp OSM (6): чугунный столб ≈ 3,8 м с фонарём наверху (площадь у (−79, 172)), сбиваемый.
// Раскладка — по оси улиц (C.streets) с шагом по виду и ширине: одна сторона / обе в шахматном порядке; место —
// у бордюра на полосе тротуара этой улицы (S.onWalk), на стене (S.walls) или у края полотна; свободно — S.free,
// занято — S.reserve(…, 'A') малым кругом (места у бордюра нужны следующим группам). Числа — SITGES_LAMP.
// Ночь: стекло — S.glow, ореол и пятно света — S.lights (у сбитого гаснут), источников света нет.
// Договор (docs/sitges/stage-7.md, «Каркас»):
//   plan(C, S) — раскладка (js/maps/sitges/street.js, группы по порядку A → G): места — помощники S (C.street),
//     занятое — S.reserve(…, 'A'); вернуть данные группы (только данные, без функций) → C.street.groups.A.
//   build(K, S, L) — постройка (js/maps/sitges/street3d.js): S — помощники постройки (K.st), L — данные из plan.
// Свои глобальные имена — с префиксом stLamp… (после — node tools/deps.js --headers).
// Определяет: SITGES_LAMP, stLampPlan, stLampGeo, SITGES_ST_A.
// Использует: clamp (js/core.js); sitgesCells, sitgesSeg (js/maps/sitges/geom.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const SITGES_LAMP = {
  prom: ['Passeig Marítim', 'Passeig de la Ribera'],   // променад: мачты с двух сторон, со стороны моря — две головы
  wideW: 8.5,      // проезжая часть шире (м, tertiary / secondary) — проспект: мачты
  altW: 7,         // проезжая часть шире — столбы в шахматном порядке, иначе с одной стороны
  narrowSw: 1.2,   // тротуар уже (м) — фонарь на стене дома, если стена рядом
  step: { wall: 15, pole1: 24, pole2: 17, mast: 22, prom: 30 },   // шаг по оси улицы, м (в шахматном — между соседними)
  retry: 1.5, tries: 5,   // занято — сдвиг дальше по оси, м, и попыток
  curb: { pole: 0.45, mast: 0.6 },   // от бордюра вглубь тротуара, м
  edge: 0.3,       // нет тротуара: от края полотна внутрь, м
  r: { pole: 0.3, mast: 0.35, post: 0.35, wall: 0.2 },   // занятость, м
  osmGap: 12,      // от точки OSM обычный фонарь не ближе, м
  wallY: 4.0, wallMin: 3.0,   // высота кронштейна над землёй у стены; ниже — не ставить
  minLen: 12,      // улицы короче — без фонарей
  chunk: 240,      // квадрат экземпляров, м (крупнее, чем у мелочи: меньше вызовов отрисовки)
};

/* ---------- раскладка ---------- */
function stLampPlan(C, S) {
  const P = SITGES_LAMP, out = { wall: [], pole: [], mast: [], post: [], stats: {} };
  const r2 = v => Math.round(v * 100) / 100;
  const osm = ((C.points && C.points.lamp) || []).map(([x, z]) => [x, z]);
  const nearOsm = (x, z) => osm.some(([ox, oz]) => Math.hypot(x - ox, z - oz) < P.osmGap);
  const why = {};
  const fail = k => { why[k] = (why[k] || 0) + 1; return false; };

  // точки OSM — первыми, как есть
  for (const [x, z] of osm) {
    if (!S.free(x, z, P.r.post)) fail('osm-busy');
    S.reserve(x, z, P.r.post, 'A');
    out.post.push([r2(x), r2(z)]);
  }

  // точка на оси улицы: s — м от начала → { x, z, tx, tz, hw, sw, deck, vi }
  const axis = (st, s) => {
    const v = st.v;
    let j = 0; while (j < v.length - 2 && v[j + 1].s < s) j++;
    const a = v[j], b = v[j + 1], t = clamp((s - a.s) / Math.max(1e-6, b.s - a.s), 0, 1);
    const L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, tx: (b.x - a.x) / L, tz: (b.z - a.z) / L,
      hw: a.hw + (b.hw - a.hw) * t, sw: [Math.min(a.sw[0], b.sw[0]), Math.min(a.sw[1], b.sw[1])], deck: a.deck || b.deck };
  };
  // наружу от оси на сторону side (как края полотна в street.js)
  const sideN = (A, side) => { const sg = side ? -1 : 1; return [-A.tz * sg, A.tx * sg]; };

  // у бордюра своей улицы: столб / мачта
  const atCurb = (st, si, A, side, kind) => {
    if (A.sw[side] < 0.9) return fail(kind + '-nowalk');
    const [nx, nz] = sideN(A, side), d = A.hw + P.curb[kind];
    const x = A.x + nx * d, z = A.z + nz * d, w = S.onWalk(x, z);
    if (!w || w.seg.si !== si) return fail(kind + '-offwalk');
    if (nearOsm(x, z)) return fail('osm-near');
    if (!S.free(x, z, P.r[kind])) return fail(kind + '-busy');
    S.reserve(x, z, P.r[kind], 'A');
    return { x, z, ry: Math.atan2(nx, nz) };
  };
  // у края полотна без тротуара: столб на асфальте у ограды
  const atEdge = (st, A, side) => {
    const [nx, nz] = sideN(A, side), d = A.hw - P.edge;
    const x = A.x + nx * d, z = A.z + nz * d;
    if (C.carriageAt(x, z, st)) return fail('edge-cross');
    if (C.houseAt(x, z)) return fail('edge-house');
    if (nearOsm(x, z)) return fail('osm-near');
    if (!S.free(x, z, P.r.pole)) return fail('edge-busy');
    S.reserve(x, z, P.r.pole, 'A');
    return { x, z, ry: Math.atan2(nx, nz) };
  };
  // плиты балконов и вывески на стенах (кроме стел) — по клеткам: фонарь не в плите и не в вывеске
  const onWall = sitgesCells(8);
  for (const b of C.balconies || []) onWall.add(Math.min(b.ax, b.bx), Math.max(b.ax, b.bx), Math.min(b.az, b.bz), Math.max(b.az, b.bz), { b });
  for (const g of C.signs || []) if (g.form !== 'totem') onWall.add(g.x - g.w / 2, g.x + g.w / 2, g.z - g.w / 2, g.z + g.w / 2, { g });
  // высота кронштейна у стены (x, z, нормаль nx, nz): под плитой балкона, если она мешает; null — вывеска рядом
  const wallFit = (x, z, nx, nz, y) => {
    let ok = true;
    for (let pass = 0; pass < 3; pass++) {           // опустились под плиту — проверить плиту ниже
      let moved = false;
      onWall.each(x - 1, x + 1, z - 1, z + 1, l => {
        for (const o of l) {
          if (o.g) {
            const g = o.g;
            if (g.nx * nx + g.nz * nz > 0.7 && Math.hypot(g.x - x, g.z - z) < g.w / 2 + 0.6 && Math.abs(g.y - y + 0.35) < g.h / 2 + 0.6) ok = false;
            continue;
          }
          const b = o.b;
          if (b.nx * nx + b.nz * nz < 0.7 || sitgesSeg(x, z, b.ax, b.az, b.bx, b.bz) > 0.35) continue;
          if (y + 0.1 > b.y - b.t - 0.05 && y - 0.8 < b.y + 1.1) { y = b.y - b.t - 0.12; moved = true; }
        }
      });
      if (!moved) break;
    }
    return ok ? y : null;
  };
  // на стене дома к улице у края тротуара (или полотна)
  const atWall = (st, A, side) => {
    const [nx, nz] = sideN(A, side), d = A.hw + A.sw[side] + 0.4;
    const n = S.nearest('walls', A.x + nx * d, A.z + nz * d, 2.5);
    if (!n) return fail('wall-none');
    const w = n.seg;
    if (w.nx * nx + w.nz * nz > -0.7 || n.f < 0.06 || n.f > 0.94 || w.len < 1.5) return fail('wall-bad');
    const x = w.ax + (w.bx - w.ax) * n.f, z = w.az + (w.bz - w.az) * n.f, g = w.ga + (w.gb - w.ga) * n.f;
    let y = g + P.wallY;
    if (y > w.hi - 0.4) y = w.hi - 0.4;
    y = wallFit(x, z, w.nx, w.nz, y);
    if (y === null) return fail('wall-sign');
    if (y - g < P.wallMin) return fail('wall-low');
    if (nearOsm(x, z)) return fail('osm-near');
    if (!S.free(x + w.nx * 0.5, z + w.nz * 0.5, P.r.wall, ['door', 'gate'])) return fail('wall-busy');
    S.reserve(x + w.nx * 0.3, z + w.nz * 0.3, P.r.wall, 'A');
    return { x, z, ry: Math.atan2(w.nx, w.nz), y };
  };

  C.streets.forEach((st, si) => {
    if (!(st.drive || st.cls === 'pedestrian') || st.cls === 'service' || st.cls === 'track' || st.len < P.minLen) return;
    const v = st.v, n = v.length;
    let hw = 0, sw0 = 0, sw1 = 0, old = 0, tx = 0;
    for (const a of v) { hw += a.hw; sw0 += a.sw[0]; sw1 += a.sw[1]; tx += a.tx; if (S.oldTown(a.x, a.z)) old++; }
    hw /= n; sw0 /= n; sw1 /= n;
    const W = hw * 2, wide = sw0 >= sw1 ? 0 : 1;      // сторона с более широким тротуаром
    const prom = P.prom.includes(st.name);
    const mast = !prom && (st.cls === 'tertiary' || st.cls === 'secondary') && W >= P.wideW && Math.max(sw0, sw1) >= 1.5;
    const center = old > n / 2 || (!prom && !mast && Math.max(sw0, sw1) < P.narrowSw);
    // ряды: [сторона (−1 — по очереди), шаг, начало, вид]
    let rows;
    // променад: со стороны моря (море — к −z; нормаль стороны 0 по z = tx) — две головы; с другой — одна, только
    // на проезжем Passeig Marítim (tertiary): на Ribera со стороны домов — террасы, мачт на фото нет
    const sea = tx < 0 ? 0 : 1;
    if (prom) rows = [[sea, P.step.prom, P.step.prom / 2, 'prom'], ...(st.cls === 'tertiary' ? [[1 - sea, P.step.prom, P.step.prom, 'mast']] : [])];
    else if (mast) rows = [[-1, P.step.mast, P.step.mast / 2, 'mast']];
    else if (center) rows = [[-1, P.step.wall, P.step.wall / 2, 'wall']];
    else if (W >= P.altW) rows = [[-1, P.step.pole2, P.step.pole2 / 2, 'pole']];
    else rows = [[wide, P.step.pole1, P.step.pole1 / 2, 'pole']];
    for (const [side0, step, start, kind] of rows) {
      let k = 0;
      for (let s = start; s <= st.len - 4; s += step, k++) {
        const side = side0 < 0 ? (k + si) % 2 : side0;
        let got = null, kk = kind;
        for (let t = 0; t < P.tries && !got; t++) {
          const A = axis(st, s + t * P.retry);
          if (A.deck) break;
          if (kind === 'wall') {
            if (S.oldTown(A.x, A.z) || A.sw[side] < P.narrowSw) got = atWall(st, A, side);
            if (!got && A.sw[side] >= 0.9) { got = atCurb(st, si, A, side, 'pole'); kk = 'pole'; }
            else if (!got && A.sw[side] < 0.3 && !S.oldTown(A.x, A.z)) { got = atEdge(st, A, side); kk = 'pole'; }
          } else if (kind === 'pole') {
            got = A.sw[side] >= 0.9 ? atCurb(st, si, A, side, 'pole') : A.sw[side] < 0.3 ? atEdge(st, A, side) : fail('pole-thin');
          } else got = atCurb(st, si, A, side, 'mast');
          if (!got) continue;
          if (kk === 'wall') out.wall.push([r2(got.x), r2(got.z), r2(got.ry), r2(got.y)]);
          else if (kk === 'pole') out.pole.push([r2(got.x), r2(got.z), r2(got.ry)]);
          else out.mast.push([r2(got.x), r2(got.z), r2(got.ry), kind === 'prom' ? 2 : 1]);
        }
      }
    }
  });
  out.stats = { wall: out.wall.length, pole: out.pole.length, mast: out.mast.length, post: out.post.length, why };
  return out;
}

/* ---------- модели (свои координаты: основание в y = 0, +z — от дороги к дому; у стены +z — наружу) ---------- */
function stLampGeo() {
  const T = THREE, M = new T.Matrix4();
  const at = (g, x, y, z, rx = 0, ry = 0, rz = 0) => g.applyMatrix4(M.makeRotationFromEuler(new T.Euler(rx, ry, rz)).setPosition(x, y, z));
  const box = (w, h, d, x, y, z, rx, ry, rz) => at(new T.BoxGeometry(w, h, d), x, y, z, rx, ry, rz);
  const cyl = (r0, r1, h, seg, x, y, z, rx, ry, rz) => at(new T.CylinderGeometry(r0, r1, h, seg), x, y, z, rx, ry, rz);
  const merge = list => mergeGeometries(list.map(g => { g.deleteAttribute('uv'); return g; }));
  // фонарь-«фарол»: квадратный, сужается книзу, шатёр-крышка с шишкой; y = 0 — низ
  const lantern = (y0, z0) => ({
    frame: [cyl(0.05, 0.08, 0.06, 4, 0, y0 + 0.03, z0, 0, Math.PI / 4),
      cyl(0.02, 0.22, 0.16, 4, 0, y0 + 0.47, z0, 0, Math.PI / 4),
      cyl(0.035, 0.035, 0.1, 6, 0, y0 + 0.6, z0)],
    glass: cyl(0.17, 0.11, 0.34, 4, 0, y0 + 0.23, z0, 0, Math.PI / 4),
  });

  // wall: стенная пластина, горизонтальный прут 0,75 м с завитком-подкосом, подвес и фонарь под концом
  const wl = lantern(-0.72, 0.68);
  const wall = {
    iron: merge([box(0.14, 0.42, 0.03, 0, -0.12, 0.015), box(0.035, 0.035, 0.74, 0, 0, 0.37),
      box(0.03, 0.03, 0.62, 0, -0.2, 0.25, -0.62), at(new T.TorusGeometry(0.1, 0.014, 4, 8, Math.PI * 1.5), 0, -0.08, 0.5, 0, Math.PI / 2),
      cyl(0.012, 0.012, 0.1, 4, 0, -0.06, 0.68), ...wl.frame]),
    glass: wl.glass,
    head: [0, -0.5, 0.68],   // центр стекла: ореол
  };
  // pole: тонкий столб 5 м, верх чуть изогнут к дороге, плоская круглая голова с наклоном
  const pole = {
    body: merge([cyl(0.045, 0.065, 5.0, 6, 0, 2.5, 0), cyl(0.035, 0.035, 0.34, 6, 0, 5.08, -0.12, -0.75),
      cyl(0.2, 0.17, 0.09, 10, 0, 5.24, -0.28, 0.22)]),
    glass: cyl(0.16, 0.16, 0.02, 10, 0, 5.185, -0.29, 0.22),
    head: [0, 5.12, -0.3],
  };
  // mast: мачта 9 м, кронштейн к дороге (−z) с плоской головой; prom — второй кронштейн к морю/дому (+z), «V»
  const arm = sg => [box(0.06, 0.06, 1.35, 0, 8.95 + 0.12, -0.62 * sg, sg * 0.18), box(0.3, 0.09, 0.62, 0, 9.18, -1.45 * sg, sg * 0.1)];
  const mast = {
    body: merge([cyl(0.07, 0.13, 9.0, 8, 0, 4.5, 0), cyl(0.18, 0.18, 0.5, 8, 0, 0.25, 0), ...arm(1)]),
    body2: merge([cyl(0.07, 0.13, 9.0, 8, 0, 4.5, 0), cyl(0.18, 0.18, 0.5, 8, 0, 0.25, 0), ...arm(1), ...arm(-1)]),
    glass: box(0.24, 0.02, 0.52, 0, 9.125, -1.45, 0.1),
    glass2: merge([box(0.24, 0.02, 0.52, 0, 9.125, -1.45, 0.1), box(0.24, 0.02, 0.52, 0, 9.125, 1.45, -0.1)]),
    head: [[0, 9.05, -1.45], [0, 9.05, 1.45]],
  };
  // post: чугунный столб с цоколем и кольцами, фонарь сверху
  const pl = lantern(3.25, 0);
  const post = {
    body: merge([cyl(0.2, 0.24, 0.55, 8, 0, 0.275, 0), cyl(0.12, 0.17, 0.25, 8, 0, 0.67, 0), cyl(0.055, 0.085, 2.45, 8, 0, 2.0, 0),
      cyl(0.1, 0.1, 0.06, 8, 0, 1.2, 0), cyl(0.1, 0.06, 0.2, 8, 0, 3.15, 0), ...pl.frame]),
    glass: pl.glass,
    head: [0, 3.48, 0],
  };
  return { wall, pole, mast, post };
}

/* ---------- постройка ---------- */
const SITGES_ST_A = {
  id: 'A', name: 'фонари', ready: true,
  plan(C, S) { return stLampPlan(C, S); },
  build(K, S, L) {
    const G = stLampGeo();
    // цвета — по фото: кованое железо чёрное, столбы кварталов серые, мачты светло-серые, чугун тёмный
    const iron = S.mat(0x1c1c1c, { roughness: 0.6, metalness: 0.4 }), grey = S.mat(0x7a7e84, { roughness: 0.55, metalness: 0.5 });
    const light = S.mat(0x9fa3a8, { roughness: 0.5, metalness: 0.55 }), cast = S.mat(0x2c312f, { roughness: 0.6, metalness: 0.4 });
    const warm = S.glow(0xb8b6ac, 0xffe2a8), white = S.glow(0xc8ccd0, 0xfff4e0);
    const BRK = { anchor: 2, minSpeed: 2.5, lie: 1.5, kind: 'metal', snd: 'glass' };
    const all = [];                                // огни всех видов — одним вызовом (2 меша на квадрат)
    const lights = (items, head, r) => {           // ореол у стекла, пятно света радиусом r — вниз и к дороге
      for (const it of items) {
        const c = Math.cos(it.ry), s = Math.sin(it.ry), hs = Array.isArray(head[0]) ? head.slice(0, it.heads || 1) : [head];
        for (const [hx, hy, hz] of hs) {
          const pz = hz + Math.sign(hz) * 1.0;
          all.push({ x: it.x + hx * c + hz * s, y: it.y + hy, z: it.z - hx * s + hz * c, gx: it.x + hx * c + pz * s, gz: it.z - hx * s + pz * c, r, it: it.brk });
        }
      }
    };
    const CH = SITGES_LAMP.chunk;

    const wall = L.wall.map(([x, z, ry, y]) => ({ x, z, ry, y }));
    S.place([{ geo: G.wall.iron, mat: iron }, { geo: G.wall.glass, mat: warm, shadow: false }], wall, { far: 260, chunk: CH });
    lights(wall, G.wall.head, 3.8);

    const pole = L.pole.map(([x, z, ry]) => ({ x, z, ry }));
    S.place([{ geo: G.pole.body, mat: grey }, { geo: G.pole.glass, mat: white, shadow: false }], pole,
      { brk: Object.assign({ mass: 110, cy: 2.5, dmg: 0.3 }, BRK), hit: { r: 0.12, h: 5 }, far: 320, chunk: CH });
    lights(pole, G.pole.head, 5);

    for (const heads of [1, 2]) {
      const mast = L.mast.filter(m => m[3] === heads).map(([x, z, ry]) => ({ x, z, ry, heads }));
      S.place([{ geo: heads === 2 ? G.mast.body2 : G.mast.body, mat: light }, { geo: heads === 2 ? G.mast.glass2 : G.mast.glass, mat: white, shadow: false }], mast,
        { brk: Object.assign({ mass: 220, cy: 4, dmg: 0.4 }, BRK), hit: { r: 0.18, h: 9 }, far: 420, chunk: CH });
      lights(mast, G.mast.head, 6);
    }

    const post = L.post.map(([x, z]) => ({ x, z, ry: 0 }));
    S.place([{ geo: G.post.body, mat: cast }, { geo: G.post.glass, mat: warm, shadow: false }], post,
      { brk: Object.assign({ mass: 160, cy: 1.6, dmg: 0.35 }, BRK), hit: { r: 0.2, h: 3.8 }, far: 320 });
    lights(post, G.post.head, 4.5);
    S.lights(all, { size: 2.8 });
  },
};
