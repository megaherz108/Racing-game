// Ситжес — РАСКЛАДКА: входные двери заведений (этап 6а.6, docs/sitges/stage-6a.md). После вывесок (signs.js, C.signs).
//   У каждой вывески заведения (доска, маркиза, флажок; не строения h.lm) — вход на той же стене: точка входа кадастра
//   (C.gateData.ent) в пределах ширины вывески ± entR м, иначе под серединой вывески. Дверь встаёт на ось первого
//   этажа целиком (номер оси — как у шейдера facade.js: ua…ub куска стены) и закрывает её витрину: на стене вида
//   street — ближайшая ось с витриной (хеш оси — как fHash в шейдере, float32), на стене shops — любая.
//   Отель (буквы) — парадный вход: стена его здания до земли — у точки входа кадастра, иначе под буквами (та же
//   нормаль), иначе к самой широкой улице; у отеля ещё козырёк с названием и ступенька (signs3d.js).
//   Одна дверь на заведение (флажок рядом с доской той же стены — без своей двери), на оси — не больше одной.
// C.doors — [{ x, y, z, nx, nz, w, h, type, dw, dh, text }]: x, z — середина проёма на плоскости стены, y — середина
//   проёма от уровня моря, nx, nz — наружная нормаль; w × h — проём (рама снаружи), закрывает витрину оси; type —
//   glass (стеклянная дверь магазина), wood (деревянная, старый город), double (двойная ресторана, бара, кафе), hotel
//   (двойная стеклянная отеля); dw × dh — полотно двери (остальное — стекло по бокам и над дверью); text — название
//   на козырьке отеля. C.doorStats — сводка (по видам, источник места: вход кадастра / под вывеской, пропуски).
// Определяет: SITGES_DOORS, sitgesPlanDoors.
// Использует: clamp (js/core.js); sitgesCells (js/maps/sitges/geom.js); SITGES_FLOOR (js/maps/sitges/plan.js);
//   SITGES_WALL (js/maps/sitges/houses.js); SITGES_OLDTOWN (js/maps/sitges/styles.js); SITGES_FAC
//   (js/maps/sitges/facade.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const SITGES_DOORS = {
  entR: 3,          // вход кадастра — в пределах ширины вывески ± entR м вдоль стены
  entD: 2.5,        // и не дальше от линии стены, м
  wallD: 0.6,       // вывеска (её место крепления) — не дальше от линии стены, м
  margin: 0.05,     // проём шире витрины шейдера на столько с каждой стороны (доли оси)
  top: 2.95,        // верх проёма над землёй (витрина шейдера — до SITGES_FAC.shopY[1]), м
  // полотно двери по виду: ширина, высота, м
  leaf: { glass: [1.0, 2.3], wood: [1.1, 2.4], double: [1.6, 2.4], hotel: [1.9, 2.5] },
  hotelMin: 3,      // стена парадного входа — не короче, м
};

function sitgesPlanDoors(C) {
  const { houses, signs, gateData, ground, carriageAt } = C, D = SITGES_DOORS, W = SITGES_WALL, A = SITGES_FAC, F = SITGES_FLOOR;
  const doors = [], st = { doors: 0, byType: {}, src: { ent: 0, sign: 0, street: 0 }, skip: { noWall: 0, noAxis: 0, busy: 0, lm: 0 } };
  const f32 = Math.fround;
  // хеш как в шейдере фасада (fHash, js/maps/sitges/facade.js) — в float32
  const fHash = n => { n = f32(n * f32(0.1031)); n = f32(n - Math.floor(n)); n = f32(n * f32(n + f32(33.33))); n = f32(n * f32(n + n)); return n - Math.floor(n); };
  const oldTown = (x, z) => SITGES_OLDTOWN.some(([cx, cz, r]) => (x - cx) ** 2 + (z - cz) ** 2 < r * r);

  /* ---------- стены первого этажа до земли и входы по клеткам ---------- */
  const wcell = sitgesCells(16), walls = [];
  houses.forEach(h => {
    for (const w of h.walls) {
      if (w.kind === W.blind || w.kind > W.shops || w.lo > Math.min(w.ga, w.gb) + 0.6 || w.ub - w.ua < 0.9) continue;
      const L = Math.hypot(w.bx - w.ax, w.bz - w.az);
      const q = { h, w, L, ux: (w.bx - w.ax) / L, uz: (w.bz - w.az) / L, used: new Set() };
      walls.push(q);
      wcell.add(Math.min(w.ax, w.bx) - 1, Math.max(w.ax, w.bx) + 1, Math.min(w.az, w.bz) - 1, Math.max(w.az, w.bz) + 1, q);
    }
  });
  const ecell = sitgesCells(16);
  for (const e of gateData.ent) ecell.add(e.x, e.x, e.z, e.z, e);
  const tOf = (q, x, z) => (x - q.w.ax) * q.ux + (z - q.w.az) * q.uz;
  const dOf = (q, x, z) => (x - q.w.ax) * q.w.nx + (z - q.w.az) * q.w.nz;   // от линии стены наружу
  // стена под точкой крепления вывески: та же нормаль, точка у линии стены и в её пределах
  const wallAt = (x, z, nx, nz) => {
    let best = null, bd = D.wallD;
    for (const q of wcell.at(x, z)) {
      if (q.w.nx * nx + q.w.nz * nz < 0.95) continue;
      const t = tOf(q, x, z), d = Math.abs(dOf(q, x, z));
      if (t < -0.3 || t > q.L + 0.3 || d >= bd) continue;
      bd = d; best = q;
    }
    return best;
  };
  // входы кадастра у стены q на отрезке [t0, t1]: → t ближайшего к tc
  const entOn = (q, t0, t1, tc) => {
    let best = null;
    const [x0, z0] = [q.w.ax + q.ux * t0, q.w.az + q.uz * t0], [x1, z1] = [q.w.ax + q.ux * t1, q.w.az + q.uz * t1];
    ecell.each(Math.min(x0, x1) - D.entD, Math.max(x0, x1) + D.entD, Math.min(z0, z1) - D.entD, Math.max(z0, z1) + D.entD, list => {
      for (const e of list) {
        const t = tOf(q, e.x, e.z), d = dOf(q, e.x, e.z);
        if (t < t0 || t > t1 || d < -D.entD || d > D.entD) continue;
        if (best === null || Math.abs(t - tc) < Math.abs(best - tc)) best = t;
      }
    });
    return best;
  };
  // ось первого этажа: номер col на расстоянии t; витрина ли там (как шейдер: shops — все, street — по хешу)
  const uAt = (q, t) => q.w.ua + (q.w.ub - q.w.ua) * t / q.L;
  const shopAxis = (q, col) => q.w.kind === W.shops || (q.w.kind === W.street && fHash(f32(f32(col * f32(1.37)) + f32(f32(q.h.base) * f32(0.71)))) < A.shopP);
  // ось целиком в куске (витрина 0,12…0,88 оси) и свободна
  const axisOk = (q, col) => !q.used.has(col) && col + A.shop[0] >= Math.min(q.w.ua, q.w.ub) - 1e-6 && col + A.shop[1] <= Math.max(q.w.ua, q.w.ub) + 1e-6;
  // ближайшая к t подходящая ось: сначала с витриной, потом любая (до 2 осей в сторону)
  const pickAxis = (q, t) => {
    const u = uAt(q, t), c0 = Math.floor(u);
    const order = [0, 1, -1, 2, -2].map(k => c0 + k).sort((a, b) => Math.abs(a + 0.5 - u) - Math.abs(b + 0.5 - u));
    return order.find(c => axisOk(q, c) && shopAxis(q, c)) ?? order.find(c => axisOk(q, c) && Math.abs(c + 0.5 - u) < 1.5) ?? null;
  };
  const r2 = v => Math.round(v * 100) / 100;
  // дверь на оси col стены q
  const place = (q, col, type, text) => {
    const per = q.L / Math.abs(q.w.ub - q.w.ua);                     // ширина оси, м
    const tc = (col + 0.5 - q.w.ua) / (q.w.ub - q.w.ua) * q.L;
    const x = q.w.ax + q.ux * tc, z = q.w.az + q.uz * tc;
    const g = Math.max(ground(x + q.w.nx * 0.5, z + q.w.nz * 0.5), q.w.ga + (q.w.gb - q.w.ga) * tc / q.L);
    const top = Math.min(g + D.top, q.h.base + F.ground - 0.4);
    const w = (A.shop[1] - A.shop[0] + 2 * D.margin) * per, h = top - g;
    const [dw0, dh0] = D.leaf[type];
    const dw = Math.min(dw0, w - 0.2), dh = Math.min(dh0, h - 0.1);
    if (h < 2.1) return false;
    q.used.add(col);
    doors.push({ x: r2(x), y: r2(g + h / 2), z: r2(z), nx: r2(q.w.nx), nz: r2(q.w.nz), w: r2(w), h: r2(h), type, dw: r2(dw), dh: r2(dh), text: text || '' });
    st.doors++; st.byType[type] = (st.byType[type] || 0) + 1;
    return true;
  };
  const typeOf = (s, x, z) => {
    if (s.cat === 'hotel') return 'hotel';
    const plain = ['supermarket', 'pharmacy', 'bank', 'convenience', 'fastfood'].includes(s.cat);
    if (oldTown(x, z) && !plain) return 'wood';
    return ['restaurant', 'bar', 'club', 'cafe'].includes(s.cat) ? 'double' : 'glass';
  };

  /* ---------- заведения ---------- */
  // доски и маркизы раньше флажков: флажок рядом с доской того же заведения своей двери не получает
  const order = signs.map((s, i) => i).sort((a, b) => (signs[a].form === 'blade') - (signs[b].form === 'blade'));
  const done = [];   // [x, z, nx, nz] поставленных дверей заведений
  for (const i of order) {
    const s = signs[i];
    if (!['board', 'awning', 'blade', 'letters'].includes(s.form)) continue;
    const behind = C.houseAt(s.x - s.nx * 0.4, s.z - s.nz * 0.4) || C.houseAt(s.x, s.z);
    if (behind && behind.lm) { st.skip.lm++; continue; }
    if (s.form === 'letters') { hotel(s, behind); continue; }
    if (s.form === 'blade' && done.some(([x, z, nx, nz]) => nx * s.nx + nz * s.nz > 0.95 && (x - s.x) ** 2 + (z - s.z) ** 2 < 6 * 6)) continue;
    const ax = s.form === 'board' ? s.x - s.nx * 0.06 : s.x, az = s.form === 'board' ? s.z - s.nz * 0.06 : s.z;
    const q = wallAt(ax, az, s.nx, s.nz);
    if (!q) { st.skip.noWall++; continue; }
    const tc = tOf(q, ax, az), half = s.form === 'blade' ? 1 : s.w / 2;
    const te = entOn(q, tc - half - D.entR, tc + half + D.entR, tc);
    const col = pickAxis(q, te ?? tc);
    if (col === null) { st.skip.noAxis++; continue; }
    if (!place(q, col, typeOf(s, ax, az))) { st.skip.noAxis++; continue; }
    st.src[te !== null ? 'ent' : 'sign']++;
    done.push([ax, az, s.nx, s.nz]);
  }

  /* ---------- отель: парадный вход ---------- */
  function hotel(s, hs) {
    if (!hs) { st.skip.noWall++; return; }
    // стены здания до земли: к улице или с той же нормалью, что буквы (здание — под буквами или за ними)
    const mine = walls.filter(q => q.h.bi === hs.bi && q.L >= D.hotelMin && (q.w.kind !== W.yard || q.w.nx * s.nx + q.w.nz * s.nz > 0.95));
    if (!mine.length) { st.skip.noWall++; return; }
    let pick = null, src = 'street';
    // точка входа кадастра у одной из стен
    for (const q of mine) {
      const te = entOn(q, 0, q.L, q.L / 2);
      if (te !== null) { pick = [q, te]; src = 'ent'; break; }
    }
    // под буквами — та же нормаль, ближе к ним
    if (!pick) {
      const same = mine.filter(q => q.w.nx * s.nx + q.w.nz * s.nz > 0.95).sort((a, b) => Math.abs(dOf(a, s.x, s.z)) - Math.abs(dOf(b, s.x, s.z)));
      if (same.length) { pick = [same[0], clamp(tOf(same[0], s.x, s.z), 0, same[0].L)]; src = 'sign'; }
    }
    // к самой широкой улице
    if (!pick) {
      let bs = -Infinity;
      for (const q of mine) {
        const mx = (q.w.ax + q.w.bx) / 2, mz = (q.w.az + q.w.bz) / 2, c = carriageAt(mx + q.w.nx * 6, mz + q.w.nz * 6, null, 4);
        const sc = (c ? 2 * c.st.v[c.i].hw : 0) * 3 + Math.min(q.L, 20);
        if (sc > bs) { bs = sc; pick = [q, q.L / 2]; }
      }
    }
    const [q, t] = pick, col = pickAxis(q, t);
    if (col === null || !place(q, col, 'hotel', s.text)) { st.skip.noAxis++; return; }
    st.src[src]++;
  }

  Object.assign(C, { doors, doorStats: st });
}
