// Ситжес — достопримечательность: дворец Марисель (Palau de Maricel) (этап 5, docs/sitges/stage-5.md, архив — lm-b.md).
// Два здания кадастра по обе стороны Carrer de Fonollar: 251 (Марисель де Терра, 20 частей) и безымянное 235 (Марисель
// де Мар, 12 частей, на скале у моря) — его plan() забирает себе (пометка h.lm, части в L.parts). Над улицей — галерея-мост
// (часть с h.pass: проезд под ней свободен), у моста — белая башенка с зубцами. Вид по фото (raw/photos/landmarks/maricel):
// белая «рваная» штукатурка, окна в каменных (песчаник) обрамлениях — крестовые, готические, ряды арочек под карнизом,
// черепичные свесы; к морю — бутовый низ на скале, арки, белые балюстрады террас, круглая башня на восточном углу.
// Помощники группы B (Марисель, Кау-Ферран, Мирамар; предложение — перенести в каркас):
//   lmBEdges(ring) — рёбра контура с внешней нормалью (nx, nz), поворотом rot и точкой at(t);
//   lmBOpen(C, x, z, e, y) — снаружи ребра на высоте y нет дома (стена видна);
//   lmBSolid(g, mat, rings, y0, y1, { cap, bottom, walls }) — призма по контуру с дырами (дворы): стены дыр смотрят в двор;
//   lmBExt(g, mat, shape, depth, x, y, z, rot) — как lmExtrude, дуги грубее;
//   lmBWin(g, M, e, x, z, y, w, h, kind, o) — окно: kind 'rect' | 'cross' | 'gothic' | 'arch' | 'twin' | 'loggia';
//     o.shut — ставни (M.shut), o.bal — балкон (M.iron, M.trim), o.out — вынос;
//   lmBBal(g, mat, a, b, y, e) — балюстрада на отрезке; lmBMerlons(g, mat, a, b, y, e) — зубцы-ступеньки;
//   lmBPart(K, g, h, o) — часть кадастра целиком: стены (с бутовым низом под первым этажом), окна по этажам на открытых
//     стенах, свес / карниз, верх (parapet, bal, merlon, roof), крыша, столкновение.
// Определяет: lmBEdges, lmBOpen, lmBSolid, lmBExt, lmBWin, lmBBal, lmBMerlons, lmBPart, SITGES_LM_MARICEL.
// Использует: sitgesBBox, sitgesInPoly (js/maps/sitges/geom.js); lmBox, lmArch, lmInset, lmFrame, lmRoof, lmCollide,
//   lmMat, lmCyl (js/maps/sitges/landmarks3d.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

/* ---------- помощники группы B ---------- */
function lmBEdges(ring) {
  let area = 0; const n = ring.length, out = [];
  for (let i = 0; i < n; i++) { const a = ring[i], b = ring[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  const s = area > 0 ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 0.3) continue;
    const dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len;
    out.push({ a, b, len, dx, dz, nx: dz * s, nz: -dx * s, rot: Math.atan2(-dz, dx),
      at: t => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] });
  }
  return out;
}
function lmBOpen(C, x, z, e, y) {
  const h = C.houseAt(x + e.nx * 0.7, z + e.nz * 0.7);
  return !h || h.top < y;
}
function lmBSolid(g, mat, rings, y0, y1, { cap = true, bottom = false, walls = true } = {}) {
  const pos = [], uv = [], idx = [], U = LMK.uv;
  const sgn = r => { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1]; } return a; };
  if (walls) rings.forEach((ring, ri) => {
    // наружу у внешнего контура, в двор — у дыр
    const out = (sgn(ring) > 0) !== (ri > 0);
    let s = 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]), k = pos.length / 3;
      pos.push(a[0], y0, a[1], b[0], y0, b[1], b[0], y1, b[1], a[0], y1, a[1]);
      uv.push(s / U, y0 / U, (s + L) / U, y0 / U, (s + L) / U, y1 / U, s / U, y1 / U);
      if (out) idx.push(k, k + 2, k + 1, k, k + 3, k + 2); else idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
      s += L;
    }
  });
  const flat = rings.flat();
  const tri = THREE.ShapeUtils.triangulateShape(rings[0].map(([x, z]) => new THREE.Vector2(x, z)),
    rings.slice(1).map(r => r.map(([x, z]) => new THREE.Vector2(x, z))));
  const lid = (y, up) => {
    const k = pos.length / 3;
    for (const [x, z] of flat) { pos.push(x, y, z); uv.push(x / U, z / U); }
    for (const [a, b, c] of tri) {
      const A = flat[a], B = flat[b], Cc = flat[c], isUp = (B[0] - A[0]) * (Cc[1] - A[1]) - (B[1] - A[1]) * (Cc[0] - A[0]) < 0;
      if (isUp === up) idx.push(k + a, k + b, k + c); else idx.push(k + a, k + c, k + b);
    }
  };
  if (cap) lid(y1, true);
  if (bottom) lid(y0, false);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx); geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = m.receiveShadow = true;
  g.add(m);
  return m;
}
// как lmExtrude, но дуги грубее (3 деления на четверть — вдвое меньше треугольников; окон сотни)
function lmBExt(g, mat, shape, depth, x, y, z, rot) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 3 });
  geo.translate(0, 0, -depth / 2);
  const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / LMK.uv, uv.getY(i) / LMK.uv);
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = m.receiveShadow = true;
  m.position.set(x, y, z); m.rotation.y = rot;
  g.add(m);
  return m;
}
// окно на стене e в точке (x, z), низ проёма y; M = { win, trim, shut, iron }
function lmBWin(g, M, e, x, z, y, w, h, kind = 'rect', o = {}) {
  const d = o.out ?? 0, fr = o.frame ?? 0.2;
  const P = k => [x + e.nx * (d + k), z + e.nz * (d + k)];
  const box = (m, bw, bh, bd, k, yy, du = 0) => { const [px, pz] = P(k); lmBox(g, m, bw, bh, bd, px + e.dx * du, yy, pz + e.dz * du, e.rot); };
  const ext = (m, shape, k, yy, du = 0) => { const [px, pz] = P(k); lmBExt(g, m, shape, 0.12, px + e.dx * du, yy, pz + e.dz * du, e.rot); };
  if (kind === 'gothic' || kind === 'arch') {
    const pointed = kind === 'gothic';
    if (M.trim && fr) ext(M.trim, lmArch(w + 2 * fr, h + fr, { pointed }), 0.04, y - fr * 0.6);
    ext(M.win, lmArch(w, h, { pointed }), 0.08, y);
  } else if (kind === 'twin') {
    // две стрельчатые створки с колонкой в прямоугольной раме (Кау-Ферран)
    if (M.trim) box(M.trim, w + 2 * fr, h + 2 * fr, 0.14, 0.04, y - fr);
    const hw = w * 0.42;
    ext(M.win, lmArch(hw, h, { pointed: true }), 0.12, y, -w * 0.25);
    ext(M.win, lmArch(hw, h, { pointed: true }), 0.12, y, w * 0.25);
  } else if (kind === 'loggia') {
    // ряд арочек под карнизом: w — ширина ряда, по арке на ≈ 1,1 м
    const n = Math.max(1, Math.round(w / 1.1)), aw = (w / n) * 0.62;
    if (M.trim) box(M.trim, w + 0.3, 0.16, 0.3, 0.1, y - 0.16);
    for (let i = 0; i < n; i++) {
      const du = (i + 0.5) * w / n - w / 2;
      ext(M.win, lmArch(aw, h), 0.08, y, du);
    }
  } else {
    if (M.trim && fr) box(M.trim, w + 2 * fr, h + 2 * fr, 0.14, 0.04, y - fr);
    box(M.win, w, h, 0.1, 0.07, y);
    if (kind === 'cross' && M.trim) {
      box(M.trim, 0.1, h, 0.08, 0.13, y);
      box(M.trim, w, 0.1, 0.08, 0.13, y + h * 0.62);
    }
  }
  if (o.sill && M.trim) box(M.trim, w + 0.4, 0.1, 0.3, 0.12, y - fr - 0.1);
  if (o.shut && M.shut) for (const s of [-1, 1]) box(M.shut, w * 0.5, h, 0.06, 0.16, y, s * (w * 0.75 + 0.02));
  if (o.bal && M.iron) {
    // балкон на консоли: плита, перила (поручень, низ, стойки)
    const bw = o.bal === true ? w + 0.7 : o.bal, dep = 0.75;
    if (M.trim) box(M.trim, bw, 0.14, dep, dep / 2, y - 0.14);
    const fy = y, rh = 0.95;
    box(M.iron, bw, 0.05, 0.05, dep, fy + rh);
    box(M.iron, bw, 0.04, 0.04, dep, fy + 0.1);
    const n = Math.max(3, Math.round(bw / 0.25));
    for (let i = 0; i <= n; i++) box(M.iron, 0.025, rh, 0.025, dep, fy, -bw / 2 + bw * i / n);
    for (const s of [-1, 1]) {
      for (let k = 1; k <= 3; k++) box(M.iron, 0.025, rh, 0.025, dep * k / 4, fy, s * bw / 2);
      box(M.iron, 0.05, 0.05, dep, dep / 2, fy + rh, s * bw / 2);
    }
  }
}
// балюстрада на отрезке a → b (низ y), со стороны e (вынос наружу 0); балясины 0,33 м, тумбы через ≈ 3 м
function lmBBal(g, mat, a, b, y, e, o = {}) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len < 0.6) return;
  const rot = e.rot, cx = (a[0] + b[0]) / 2 - e.nx * 0.12, cz = (a[1] + b[1]) / 2 - e.nz * 0.12, H = o.h ?? 0.95;
  lmBox(g, mat, len, 0.14, 0.32, cx, y, cz, rot);
  lmBox(g, mat, len, 0.12, 0.34, cx, y + H - 0.12, cz, rot);
  const n = Math.floor(len / 0.33), seg = Math.max(1, Math.round(len / 3));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, x = a[0] + (b[0] - a[0]) * t - e.nx * 0.12, z = a[1] + (b[1] - a[1]) * t - e.nz * 0.12;
    lmBox(g, mat, 0.13, H - 0.26, 0.13, x, y + 0.14, z, rot + Math.PI / 4);
  }
  for (let i = 0; i <= seg; i++) {
    const t = i / seg, x = a[0] + (b[0] - a[0]) * t - e.nx * 0.12, z = a[1] + (b[1] - a[1]) * t - e.nz * 0.12;
    lmBox(g, mat, 0.36, H + 0.05, 0.36, x, y, z, rot);
  }
}
// зубцы-ступеньки (каталонская готика Марисель) по отрезку
function lmBMerlons(g, mat, a, b, y, e, o = {}) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]), step = o.step ?? 1.1, n = Math.max(1, Math.round(len / step));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, x = a[0] + (b[0] - a[0]) * t - e.nx * 0.2, z = a[1] + (b[1] - a[1]) * t - e.nz * 0.2;
    lmBox(g, mat, step * 0.55, 0.45, 0.4, x, y, z, e.rot);
    lmBox(g, mat, step * 0.3, 0.3, 0.4, x, y + 0.45, z, e.rot);
  }
}
// o: { M: { wall, trim, win, roof, base, bal, shut, iron }, top: 'eave' | 'parapet' | 'bal' | 'merlon' | 'roof',
//   kinds: [этаж 0, средние, верхний] (вид окна или 'loggia'), ww, wh, step, plinth (бутовый низ ниже первого этажа),
//   corn (каменный карниз: вынос), quoins (каменные лопатки на углах), shut, bal (fn(e, f, i, n) → ширина балкона / true),
//   skip (fn(e) → не ставить окна), pitch, eaveOver, whTop (высота окон верхнего этажа), groundBig, sill, parapet }
function lmBPart(K, g, h, o) {
  const C = K.D.C, M = o.M, ring = h.rings[0], floors = Math.max(1, h.p.floors), y1 = h.y1;
  const base = Math.max(h.y0, Math.min(h.base, y1 - floors * 2.6)), fh = (y1 - base) / floors;
  const sloped = h.roof && (h.roof.kind === 'hip' || h.roof.kind === 'gable' || h.roof.kind === 'pyramid');
  const top = o.top === 'roof' && !sloped ? 'eave' : (o.top || (sloped ? 'roof' : 'eave'));
  const par = top === 'parapet' ? (o.parapet ?? 0.8) : top === 'merlon' ? 0.35 : 0;
  // стены: бутовый низ (на скале) и штукатурка выше
  const pl = o.plinth && base - h.y0 > 1.2 && M.base ? base - 0.3 : h.y0;
  if (pl > h.y0) lmBSolid(g, M.base, h.rings.map(r => lmInset(r, -0.08)), h.y0, pl, { cap: false });
  lmBSolid(g, M.wall, h.rings, pl, y1 + par, { cap: top !== 'eave', bottom: h.pass });
  if (top === 'eave') {
    // черепичный свес по краю и плоская кровля
    const ov = o.eaveOver ?? 0.45;
    lmBSolid(g, M.roof, [lmInset(ring, -ov), ...h.rings.slice(1).map(r => lmInset(r, ov))], y1 - 0.05, y1 + 0.28, { bottom: true });
  }
  if (o.corn) lmBSolid(g, M.trim, [lmInset(ring, -o.corn), ...h.rings.slice(1).map(r => lmInset(r, o.corn))], y1 - 0.45, y1 - 0.05, { bottom: true });
  const kinds = o.kinds || ['rect', 'rect', 'rect'], ww = o.ww ?? 1.0, wh = o.wh ?? Math.min(2.0, fh * 0.55), step = o.step ?? 3.2;
  for (const ring2 of h.rings.slice(0, 1)) for (const e of lmBEdges(ring2)) {
    const [mx, mz] = e.at(0.5);
    const openTop = lmBOpen(C, mx, mz, e, y1 + 0.5);
    if (top === 'bal' && openTop) lmBBal(g, M.bal, e.a, e.b, y1, e);
    if (top === 'merlon' && openTop) lmBMerlons(g, M.wall, e.a, e.b, y1 + par, e);
    if (o.quoins && e.len > 2 && lmBOpen(C, mx, mz, e, y1 - 1))
      for (const t of [0, 1]) {
        const [qx, qz] = e.at(t), s = t ? -1 : 1;
        lmBox(g, M.trim, 0.6, y1 - base + 0.4, 0.14, qx + e.dx * s * 0.3 + e.nx * 0.05, base - 0.4, qz + e.dz * s * 0.3 + e.nz * 0.05, e.rot);
      }
    if (o.skip && o.skip(e, h)) continue;
    if (e.len < ww + 0.8) continue;
    const n = Math.max(1, Math.floor((e.len - 0.6) / step));
    for (let f = 0; f < floors; f++) {
      const kind = f === 0 ? kinds[0] : f === floors - 1 && floors > 2 ? kinds[2] : kinds[1];
      if (!kind) continue;
      const fy = base + f * fh;
      if (kind === 'loggia') {
        const lw = Math.min(e.len - 1.2, 9), lh = Math.min(1.3, fh * 0.45), ly = fy + fh - lh - 0.6;
        if (lw > 1.5 && lmBOpen(C, mx, mz, e, ly)) lmBWin(g, M, e, mx, mz, ly, lw, lh, 'loggia');
        continue;
      }
      const big = f === 0 && o.groundBig, topF = f === floors - 1 && floors > 2 && o.whTop;
      const w = big ? ww * 1.5 : ww, hh = big ? Math.min(fh - 0.5, wh * 1.5) : topF ? o.whTop : wh, wy = fy + (fh - hh) * (big ? 0.2 : 0.5);
      for (let i = 0; i < n; i++) {
        const [x, z] = e.at((i + 0.5) / n);
        if (!lmBOpen(C, x, z, e, wy)) continue;
        const bal = o.bal ? o.bal(e, f, i, n, h) : false;
        lmBWin(g, M, e, x, z, wy, w, hh, typeof kind === 'function' ? kind(e, f, i) : kind, { shut: o.shut && f > 0, bal, sill: o.sill });
      }
    }
  }
  if (top === 'roof') {
    const F = lmFrame(ring);
    lmRoof(g, M.roof, F, y1, { kind: h.roof.kind === 'gable' ? 'gable' : 'hip', pitch: o.pitch ?? 24, over: o.eaveOver ?? 0.6 });
    // карниз под свесом
    lmBSolid(g, M.trim, [lmInset(ring, -0.2)], y1 - 0.3, y1, { cap: false, bottom: true });
  }
  lmCollide(K, ring, h.pass ? h.y0 : h.y0 - 1, y1 + par);
}

/* ---------- Марисель ---------- */
const SITGES_LM_MARICEL = {
  ready: true,
  // забрать Марисель де Мар (здание 235, без названия в кадастре) — по точке внутри корпуса над морем
  plan(C, L) {
    const h0 = C.houseAt(-630, -203);
    if (!h0 || L.bis.includes(h0.bi)) return;
    const extra = C.houses.filter(h => h.bi === h0.bi);
    for (const h of extra) h.lm = L.id;
    L.bis.push(h0.bi); L.parts.push(...extra); L.rings.push(...extra.map(h => h.rings[0]));
    L.bb = L.rings.map(sitgesBBox).reduce((a, q) => [Math.min(a[0], q[0]), Math.max(a[1], q[1]), Math.min(a[2], q[2]), Math.max(a[3], q[3])]);
    L.cx = (L.bb[0] + L.bb[1]) / 2; L.cz = (L.bb[2] + L.bb[3]) / 2; L.g = C.ground(L.cx, L.cz);
    L.top = L.parts.reduce((m, h) => Math.max(m, h.top), -Infinity);
    L.mar = h0.bi;
  },
  build(K, L, group) {
    const M = {
      wall: lmMat(0xf4f1ea, { tex: 'plaster' }), trim: lmMat(0xcaa673, { tex: 'stone' }), win: lmMat(0x2a2d31, { rough: 0.4 }),
      roof: lmMat(0xa95c3c, { tex: 'tile' }), base: lmMat(0xb9a78a, { tex: 'rubble' }),
    };
    M.bal = M.wall;
    const at = (x, z) => L.parts.find(h => sitgesInPoly(x, z, h.rings[0]));
    const tower = at(-607, -205.2), mirador = at(-623.3, -169.5), plaza = at(-605.3, -175.4), corner = at(-650, -207);
    const sea = e => e.nz < -0.5;
    for (const h of L.parts) {
      const mar = h.bi === L.mar;
      if (h.pass) {
        // галерея-мост над Fonollar: арочные окна к улице, низ — каменная арка, зубцы
        lmBPart(K, group, h, { M, top: 'merlon', kinds: ['arch'], ww: 0.9, wh: Math.min(1.6, h.y1 - h.y0 - 1.2), step: 1.6 });
        for (const e of lmBEdges(h.rings[0])) if (e.len > 2.5 && Math.abs(e.nz) < 0.6) {
          const [x, z] = e.at(0.5);
          lmBox(group, M.trim, e.len + 0.1, 0.45, 0.2, x + e.nx * 0.08, h.y0, z + e.nz * 0.08, e.rot);
        }
        continue;
      }
      if (h === tower) {
        lmBPart(K, group, h, { M, top: 'merlon', kinds: ['arch', 'gothic', 'gothic'], ww: 1.0, wh: 1.8, step: 2.6 });
        continue;
      }
      if (mar) {
        // к морю: бутовый низ на скале, арки внизу, балюстрады террас
        lmBPart(K, group, h, { M, plinth: true, top: h.roof.kind === 'hip' ? 'roof' : 'bal', ww: 1.1, wh: 1.7, step: 3.0,
          kinds: [(e) => sea(e) ? 'arch' : 'gothic', 'cross', 'arch'], groundBig: true, sill: true });
        continue;
      }
      const tall = h.p.floors >= 3 && h.roof.kind !== 'hip';
      lmBPart(K, group, h, { M, top: h === plaza || h.roof.kind === 'hip' ? 'roof' : 'eave', ww: 1.05, wh: 1.7, step: 3.4,
        kinds: ['gothic', 'cross', tall ? 'loggia' : 'cross'], sill: true, eaveOver: h === plaza ? 0.9 : 0.45 });
    }
    // мирадор: открытая беседка на столбах над башней
    if (mirador) {
      const r = mirador.rings[0], y = mirador.y1 + 0.28;
      for (const p of lmInset(r, 0.3)) lmBox(group, M.wall, 0.45, 2.4, 0.45, p[0], y, p[1]);
      for (const e of lmBEdges(r)) lmBBal(group, M.bal, e.a, e.b, y, e, { h: 0.8 });
      lmBSolid(group, M.roof, [lmInset(r, -0.4)], y + 2.4, y + 2.65, { bottom: true });
    }
    // круглая башня на восточном углу Марисель де Мар, к морю (макет cm-16); центр — у стыка с Кау-Ферран, но не в нём
    if (corner) {
      const p = [-653.8, -209.8];
      const r = 1.6, y0 = corner.y0, y1 = corner.y1 + 1.6;
      lmCyl(group, M.base, r + 0.1, Math.max(0.5, corner.base - y0), p[0], y0, p[1], { seg: 14 });
      lmCyl(group, M.wall, r, y1 - corner.base, p[0], corner.base, p[1], { seg: 14 });
      lmCyl(group, M.trim, r + 0.25, 0.3, p[0], y1, p[1], { seg: 14 });
      for (let k = 0; k < 8; k++) {
        const a = k / 8 * Math.PI * 2;
        lmBox(group, M.wall, 0.5, 0.55, 0.3, p[0] + Math.cos(a) * (r + 0.05), y1 + 0.3, p[1] + Math.sin(a) * (r + 0.05), -a + Math.PI / 2);
      }
      for (let f = 1; f < 4; f++) {
        const yy = corner.base + (y1 - corner.base) * f / 4 - 0.6;
        for (const a of [-2.2, -1.6, -1.0]) lmBox(group, M.win, 0.5, 1.2, 0.3, p[0] + Math.cos(a) * r, yy, p[1] + Math.sin(a) * r, -a + Math.PI / 2);
      }
      lmCollide(K, [[p[0] - r, p[1] - r], [p[0] + r, p[1] - r], [p[0] + r, p[1] + r], [p[0] - r, p[1] + r]], y0 - 1, y1);
    }
  },
};
