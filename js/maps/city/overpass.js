// Город — РАСКЛАДКА: трюки на эстакаде (последний этап перед мини-картой).
// OV_ST — параметры: кикеры на ногах эстакады, «недострой» (разрыв настила), съезды посередине.
//   Вылетов на поворотах нет намеренно: машина, скользящая по ограждению дуги, вылетала бы в вырез по касательной —
//   в дома соседних кварталов; сплошное ограждение доводит её по дуге.
// ovStuntCuts(OV) — прямоугольники, где у эстакады нет ограждения (cuts) и настила (holes); их читает cityPlanInfra.
// ovSpans(...) — части отрезка вне прямоугольников (для ограждения, настила и разметки).
// cityPlanOverpass — вычищает посадочные кварталы и полосы под съездами, ставит трамплины, трюковые дома с плоской
//   крышей (скрытая плита Decks: world.surface() знает крышу), спуски с крыш, монеты (coinFixed), съезды, разрыв,
//   данные трафика на эстакаде (ovTraffic).
// ВАЖНО: этап не вызывает R(), а вычищает уже построенное — поэтому остальной город от него не меняется.
//   Западная половина задаётся числами, восточная — зеркально (x → −x).
// Определяет: OV_ST, ovSpans, ovKick, ovStuntCuts, cityPlanOverpass.
// Использует: lerp (js/core.js); FACADE (js/world.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const OV_ST = {
  // кикер на ноге эстакады: клин под углом ang к оси, кромка lat м от оси (за краем настила), начало — во внешней
  // полосе (≥ 5 м от оси: полосы трафика — 3,5 м), высота кромки h над настилом
  kick: { ang: 20 * Math.PI / 180, L: 10, W: 4.5, h: 1.5, lat: 10.6 },
  // кикеры: dir — куда едем (+1 на север), lip — z кромки, roof — крыша посадки по z, h — высота дома
  legs: [{ dir: 1, lip: 280, roof: [293, 350], h: 6.6, col: 3 }, { dir: -1, lip: 443, roof: [370, 430], h: 6.6, col: 8 }],
  // крыша посадки по x (от оси ноги наружу) и спуск с неё на улицу x = ±400
  roofX: [11, 40], downX: 70,
  // «недострой»: нет настила при |x| < gap на z = 520, перед разрывом — клинья длиной ramp и высотой h
  gap: { x: 10, ramp: 8, h: 1.2 },
  exits: [-160, 160], exitZ: 447,         // съезды вдоль улиц x = ±160: от южного края пролёта до z = exitZ
};

// части отрезка (ax, az) → (bx, bz) вне прямоугольников [x0, x1, z0, z1]: список [t0, t1] (доли длины)
function ovSpans(ax, az, bx, bz, rects) {
  let spans = [[0, 1]];
  const dx = bx - ax, dz = bz - az;
  for (const [x0, x1, z0, z1] of rects) {
    let t0 = 0, t1 = 1, out = false;                        // Лианг — Барски: где отрезок внутри прямоугольника
    for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dz, az - z0], [dz, z1 - az]]) {
      if (p === 0) { if (q < 0) out = true; continue; }
      const r = q / p;
      if (p < 0) t0 = Math.max(t0, r); else t1 = Math.min(t1, r);
    }
    if (out || t0 >= t1) continue;
    spans = spans.flatMap(([a, b]) => [[a, Math.min(b, t0)], [Math.max(a, t1), b]].filter(([u, v]) => v - u > 1e-6));
  }
  const L = Math.hypot(dx, dz);
  return spans.filter(([a, b]) => (b - a) * L > 0.5);
}

// геометрия кикера на ноге эстакады со стороны s (−1 — запад): кромка p1, начало p0, направление d
function ovKick(OV, s, k) {
  const K = OV_ST.kick, d = [s * Math.sin(K.ang), k.dir * Math.cos(K.ang)];
  const p1 = [s * (OV.X + K.lat), k.lip], p0 = [p1[0] - d[0] * K.L, p1[1] - d[1] * K.L];
  const zs = [p0[1], p1[1]].flatMap(z => [z - K.W / 2 * Math.abs(d[0]), z + K.W / 2 * Math.abs(d[0])]);
  const xa = s * (OV.X + 7.4), xb = s * (OV.X + 9.2);
  return { d, p0, p1, h: K.h, L: K.L, W: K.W, cut: [Math.min(xa, xb), Math.max(xa, xb), Math.min(...zs) - 1, Math.max(...zs) + 1] };
}

// где у эстакады нет ограждения (cuts) и настила (holes)
function ovStuntCuts(OV) {
  const cuts = [], holes = [], G = OV_ST.gap, edge = OV.Z - OV.W / 2 - 0.2;
  for (const s of [-1, 1]) {
    for (const k of OV_ST.legs) cuts.push(ovKick(OV, s, k).cut);
  }
  for (const x of OV_ST.exits) cuts.push([x - 8.5, x + 8.5, edge - 1, edge + 1]);     // южное ограждение над съездом
  holes.push([-G.x, G.x, OV.Z - 12, OV.Z + 12]); cuts.push([-G.x, G.x, OV.Z - 12, OV.Z + 12]);
  return { cuts, holes };
}

/* =====================================================================
   ЭТАП РАСКЛАДКИ
   ===================================================================== */
function cityPlanOverpass(C) {
  const { CURB, ground, PAL, OV, deckPlan, tower, solids, helipads, alleys, roadSegs } = C;
  const H = OV.H, coinFixed = [];
  const all = ['towers', 'caps', 'units', 'slants', 'spires', 'plain', 'roofs', 'neon', 'pools', 'domes', 'pyramids', 'rtanks', 'helipads',
    'containers', 'solids', 'trees', 'palms', 'lamps', 'umbrellas', 'hydrants', 'signs', 'tables', 'chairs', 'benches', 'bins'];
  const cleared = [];
  // убрать всё, что стоит в прямоугольнике (центр объекта внутри); массивы меняются на месте
  const clear = (x0, x1, z0, z1) => {
    const r = [Math.min(x0, x1), Math.max(x0, x1), Math.min(z0, z1), Math.max(z0, z1)];
    cleared.push(r);
    const inside = o => {
      const [x, z] = Array.isArray(o) ? o : o.minX !== undefined ? [(o.minX + o.maxX) / 2, (o.minZ + o.maxZ) / 2] : [o.x, o.z];
      return x > r[0] && x < r[1] && z > r[2] && z < r[3];
    };
    for (const k of all) { const a = C[k]; if (!a) continue; const keep = a.filter(o => !inside(o)); a.length = 0; a.push(...keep); }
    // кривой переулок через вычищенный квартал больше не нужен
    for (let i = alleys.length - 1; i >= 0; i--) if (alleys[i].pts.some(([x, z]) => x > r[0] && x < r[1] && z > r[2] && z < r[3])) alleys.splice(i, 1);
  };
  const M = (s, x) => s < 0 ? x : -x;          // зеркало для восточной половины: числа заданы для западной (s = −1)

  // дуга монет над прыжком: старт с кромки (x, y, z) по горизонтали d с наклоном pitch, скорость v (g = 14, как GRAV)
  const coinArc = (x, y, z, d, pitch, v, ts) => {
    const vh = v * Math.cos(pitch), vy = v * Math.sin(pitch);
    for (const t of ts) coinFixed.push([x + d[0] * vh * t, y + 0.5 + vy * t - 7 * t * t - 1.1, z + d[1] * vh * t]);
  };
  // трюковый дом: плоская крыша без техники, коллизия ровно по крыше, скрытая плита — поверхность для следов и респауна
  const stuntHouse = (x0, x1, z0, z1, h, color, st) => {
    const x = (x0 + x1) / 2, z = (z0 + z1) / 2, w = Math.abs(x1 - x0), d = Math.abs(z1 - z0), top = CURB + h + 0.55;
    tower(x, z, w, d, h, color, CURB, false, st);
    solids.push({ minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1), h: top - ground(x, z) });
    deckPlan.push({ kind: 'slab', p0: [Math.min(x0, x1), top, z], p1: [Math.max(x0, x1), top, z], w: d, t: 0.4, hidden: true });
    return top;
  };
  // спуск с крыши: клин от края крыши (xe, top) до уровня тротуара у края квартала (xb)
  const descent = (xe, xb, z0, z1, top) =>
    deckPlan.push({ kind: 'wedge', p0: [xe, top, (z0 + z1) / 2], p1: [xb, CURB + 0.02, (z0 + z1) / 2], w: Math.abs(z1 - z0), mat: 'ramp' });
  const wedge = (p0, p1, y0, y1, w, mat = 'wedge') => deckPlan.push({ kind: 'wedge', p0: [p0[0], y0, p0[1]], p1: [p1[0], y1, p1[1]], w, mat });

  for (const s of [-1, 1]) {
    /* ---------- кикеры на ногах и посадочные крыши ---------- */
    for (const k of OV_ST.legs) {
      const g = ovKick(OV, s, k), [rz0, rz1] = k.roof, [ra, rb] = OV_ST.roofX;
      const x0 = s * (OV.X + ra), x1 = s * (OV.X + rb), xb = s * (OV.X + OV_ST.downX);
      clear(s * (OV.X + 10), xb + s * 1.5, rz0 - 2, rz1 + 2);
      wedge(g.p0, g.p1, H, H + g.h, g.W);
      const top = stuntHouse(x0, x1, rz0, rz1, k.h, PAL.city[k.col], FACADE.punched);
      descent(x1, xb, rz0, rz1, top);
      const pitch = Math.atan2(g.h, g.L);
      coinArc(g.p1[0], H + g.h, g.p1[1], g.d, pitch, 30, [0.15, 0.35, 0.55, 0.75]);
      // на крыше: три монеты там, куда садятся на 25–40 м/с, и вертолётная «Н» как мишень
      const land = t => [g.p1[0] + g.d[0] * t, g.p1[1] + g.d[1] * t];
      for (const t of [32, 42, 52]) { const [x, z] = land(t); coinFixed.push([x, top, z]); }
      const [hx, hz] = land(42); helipads.push({ x: hx, y: top, z: hz, r: 6 });
    }
    /* ---------- съезд посередине: пандус вдоль улицы x = ±160 ---------- */
    {
      const x = M(s, OV_ST.exits[0]), z0 = OV_ST.exitZ, z1 = OV.Z - OV.W / 2;
      clear(x - 10, x + 10, z0 - 2, z1 + 1);
      deckPlan.push({ kind: 'wedge', p0: [x, 0.02, z0], p1: [x, H, z1], w: OV.W, mat: 'ramp', base: -0.4 });
      for (const sd of [1, -1]) deckPlan.push({ kind: 'slab', p0: [x + sd * (OV.W / 2 + 0.2), 1.07, z0], p1: [x + sd * (OV.W / 2 + 0.2), H + 1.05, z1],
        w: 0.4, t: 1.4, walk: false, mat: 'rail' });
      // полосатый щит на торце пандуса под настилом (со стороны перекрёстка)
      deckPlan.push({ kind: 'slab', p0: [x, H - 1.25, z1 + 0.05], p1: [x, H - 1.25, z1 + 0.4], w: OV.W, t: H - 1.3, walk: false, mat: 'hazard' });
      for (const sg of roadSegs) if (sg.dir === 'z' && sg.x0 === x && sg.z0 === 440 && sg.z1 === 520) sg.ramp = true;
    }
  }

  /* ---------- «недострой»: разрыв настила на северном пролёте ---------- */
  {
    const G = OV_ST.gap, z = OV.Z;
    for (const s of [-1, 1]) {
      wedge([s * (G.x + G.ramp), z], [s * G.x, z], H, H + G.h, OV.W);
      // торец плиты — полосатый щит; из него торчит арматура
      deckPlan.push({ kind: 'slab', p0: [s * (G.x + 0.02), H - 0.02, z], p1: [s * (G.x - 0.25), H - 0.02, z], w: OV.W - 0.4, t: 1.15, walk: false, mat: 'hazard' });
      for (let k = -3; k <= 3; k++) {
        const len = 0.9 + ((k * 7 + 9) % 5) * 0.25;
        deckPlan.push({ kind: 'slab', p0: [s * G.x, H - 0.45, z + k * 2.1], p1: [s * (G.x - len), H - 0.45 - len * 0.15, z + k * 2.1], w: 0.12, t: 0.12, walk: false, mat: 'steel' });
      }
    }
    // монеты над разрывом — по дуге прыжка с 32 м/с
    coinArc(-G.x, H + G.h, z, [1, 0], Math.atan2(G.h, G.ramp), 32, [0.2, 0.36, 0.52]);
  }

  /* ---------- трафик на эстакаде ---------- */
  // узлы эстакады — со своими ключами (над наземными перекрёстками); маршрут на каждой половине:
  // набережная (±320, 40) → верх пандуса → угол → съезд (±160, 520) → улица (±160, 440). Отрезок между съездами — только для игроков.
  const ovNodes = [], ovSegs = [];
  for (const s of [-1, 1]) {
    const X = s * OV.X, E = M(s, OV_ST.exits[0]);
    const top = { key: `ov:${X},${OV.Z1}`, x: X, z: OV.Z1, wx: 16, wz: 16 }, cor = { key: `ov:${X},${OV.Z}`, x: X, z: OV.Z, wx: 2 * OV.R, wz: 2 * OV.R };
    const ex = { key: `ov:${E},${OV.Z}`, x: E, z: OV.Z, wx: 16, wz: 16 };
    ovNodes.push(top, cor, ex);
    const seg = (a, b, ax, az, bx, bz) => ovSegs.push({ a, b, x0: ax, z0: az, x1: bx, z1: bz, w: OV.W, dir: ax === bx ? 'z' : 'x' });
    seg(`${X},40`, top.key, X, 40, X, OV.Z1);
    seg(top.key, cor.key, X, OV.Z1, X, OV.Z);
    seg(cor.key, ex.key, X, OV.Z, E, OV.Z);
    seg(ex.key, `${E},440`, E, OV.Z, E, 440);
  }

  // разметка полос на эстакаде — без разрыва
  const holes = ovStuntCuts(OV).holes, ovMarks = [];
  for (const [x0, z0, x1, z1] of C.ovRuns) for (const [t0, t1] of ovSpans(x0, z0, x1, z1, holes))
    ovMarks.push([lerp(x0, x1, t0), lerp(z0, z1, t0), lerp(x0, x1, t1), lerp(z0, z1, t1)]);

  Object.assign(C, { coinFixed, ovTraffic: { nodes: ovNodes, segs: ovSegs }, ovMarks, ovCleared: cleared });
}
