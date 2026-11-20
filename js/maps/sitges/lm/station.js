// Ситжес — достопримечательность: вокзал (Estació de Sitges, 1932) (этап 6, docs/sitges/stage-5.md, архив — lm-c.md).
// Вид по фото (raw/photos/landmarks/station, modern/e-station-01): белая штукатурка, жёлтые лопатки, пояса и цоколь,
// окна в жёлтых обрамлениях с арочным верхом, парапет с тумбами, аттик с часами посередине фасада к площади; со стороны
// путей — навес над платформой на столбах (часть 9 кадастра). Корпуса — по частям кадастра (высоты из него).
// Здесь же — помощники группы C (рынок, вокзал, Прадо, Эль Ретиро; предложение — перенести в каркас):
//   lmCEdges(ring) — рёбра контура с внешней нормалью; lmCOpen(C, x, z, e, y) — стена открыта на высоте y (снаружи нет
//   дома выше); lmCWin(g, M, e, x, z, y, w, h, o) — окно (тёмный проём + обрамление + подоконник, арочный верх);
//   lmCPart(K, g, h, o) — часть кадастра целиком: стены, цоколь, лопатки, окна по этажам, карниз, парапет, крыша,
//   столкновение.
// Определяет: lmCEdges, lmCOpen, lmCWin, lmCPart, SITGES_LM_STATION.
// Использует: lmExtrude, lmArch, lmBox, lmPrism, lmInset, lmRoof, lmFrame, lmCollide, lmMat, lmCyl, lmCollideBox
//   (js/maps/sitges/landmarks3d.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

/* ---------- помощники группы C ---------- */
function lmCEdges(ring) {
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
function lmCOpen(C, x, z, e, y) {
  const h = C.houseAt(x + e.nx * 0.7, z + e.nz * 0.7);
  return !h || h.top < y;
}
// окно на стене: M = { win, trim, sill }; o = { arch, frame (ширина обрамления), out (вынос) }
function lmCWin(g, M, e, x, z, y, w, h, o = {}) {
  const fr = o.frame ?? 0.18, d = o.out ?? 0;
  const px = (k) => [x + e.nx * (d + k), z + e.nz * (d + k)];
  if (o.arch) {
    if (M.trim) { const [ax, az] = px(0.05); lmExtrude(g, M.trim, lmArch(w + 2 * fr, h + fr), 0.1, ax, y - fr * 0.5, az, e.rot); }
    const [bx, bz] = px(0.08); lmExtrude(g, M.win, lmArch(w, h), 0.1, bx, y, bz, e.rot);
  } else {
    if (M.trim) { const [ax, az] = px(0.05); lmBox(g, M.trim, w + 2 * fr, h + 2 * fr, 0.1, ax, y - fr, az, e.rot); }
    const [bx, bz] = px(0.08); lmBox(g, M.win, w, h, 0.1, bx, y, bz, e.rot);
  }
  if (M.sill) { const [sx, sz] = px(0.1); lmBox(g, M.sill, w + 0.3, 0.12, 0.25, sx, y - (o.arch ? fr * 0.5 : fr) - 0.12, sz, e.rot); }
}
// o: { wall, trim, plinth, win, roof, cap (материалы); plinthH, pil (шаг лопаток, 0 — нет), step, ww, wh, arch, garch (арки первого этажа),
//   ground: 'door' | 'win' | 'shop' | 'none', belt (материал межэтажного пояса), corn (вынос карниза), parapet (высота), roofKind (вместо h.roof.kind), pitch, skipWin(e, i, n, f) — пропустить окно пролёта i этажа f }
function lmCPart(K, g, h, o) {
  const C = K.D.C, ring = h.rings[0], base = h.base, y1 = h.y1, floors = Math.max(1, h.p.floors), fh = (y1 - base) / floors;
  const M = { win: o.win, trim: o.trim, sill: o.trim };
  const rk = o.roofKind || (h.roof && h.roof.kind), sloped = rk === 'gable' || rk === 'hip' || rk === 'pyramid';
  const par = sloped ? 0 : (o.parapet ?? 0.9);
  lmPrism(g, o.wall, ring, h.y0, y1 + par);
  if (o.plinthH) lmPrism(g, o.plinth || o.trim, lmInset(ring, -0.06), h.y0, base + o.plinthH, { cap: false });
  if (o.corn) lmPrism(g, o.cap || o.trim, lmInset(ring, -o.corn), y1 - 0.35, y1, { bottom: true });
  if (o.belt) for (let f = 1; f < floors; f++) lmPrism(g, o.belt, lmInset(ring, -0.07), base + f * fh - 0.15, base + f * fh + 0.2, { cap: false, bottom: true });
  if (par && o.cap) lmPrism(g, o.cap, lmInset(ring, -0.08), y1 + par - 0.15, y1 + par + 0.05);
  for (const e of lmCEdges(ring)) {
    const [mx, mz] = e.at(0.5);
    if (!lmCOpen(C, mx, mz, e, base + 1)) {
      // глухая общая стена: окна только выше соседа
      if (!lmCOpen(C, mx, mz, e, y1 - 0.5)) continue;
    }
    if (o.pil) {
      const n = Math.max(1, Math.round(e.len / o.pil));
      for (let i = 0; i <= n; i++) {
        const [x, z] = e.at(i / n);
        if (!lmCOpen(C, x - e.dx * 0.3 * Math.sign(i - 0.5), z - e.dz * 0.3 * Math.sign(i - 0.5), e, y1)) continue;
        lmBox(g, o.trim, 0.55, y1 + par - h.y0 - 0.1, 0.16, x + e.nx * 0.08, h.y0, z + e.nz * 0.08, e.rot);
      }
    }
    const step = o.step || 3.2, ww = o.ww || 1.1, wh = o.wh || Math.min(1.9, fh * 0.55);
    // с лопатками — по окну в пролёте между ними, без — с шагом step
    const n = o.pil ? Math.max(1, Math.round(e.len / o.pil)) * Math.max(1, Math.round(o.pil / step)) * (e.len > ww + 1 ? 1 : 0)
      : Math.floor((e.len - 0.8) / step) || (e.len > ww + 1 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const [x, z] = e.at((i + 0.5) / n);
      for (let f = 0; f < floors; f++) {
        const fy = base + f * fh;
        if (o.skipWin && o.skipWin(e, i, n, f)) continue;
        if (f === 0 && o.ground && o.ground !== 'win') {
          if (o.ground === 'none') continue;
          if (!lmCOpen(C, x, z, e, fy + 0.2)) continue;
          if (o.ground === 'door' && i % 2 === 0) lmCWin(g, M, e, x, z, fy + 0.05, Math.min(1.6, step * 0.5), Math.min(fh - 0.6, 3.2), { arch: o.garch ?? o.arch });
          else if (o.ground === 'door') lmCWin(g, M, e, x, z, fy + 0.9, ww, Math.min(wh + 0.3, fh - 1.4), { arch: o.garch ?? o.arch });
          continue;
        }
        const wy = fy + (fh - wh) * 0.55;
        if (!lmCOpen(C, x, z, e, wy)) continue;
        lmCWin(g, M, e, x, z, wy, ww, wh, { arch: o.arch });
      }
    }
    if (o.ground === 'shop' && e.len > 3 && lmCOpen(C, mx, mz, e, base + 0.5)) {
      lmBox(g, o.win, e.len - 1.2, Math.min(fh - 0.8, 3.4), 0.12, mx + e.nx * 0.07, base + 0.1, mz + e.nz * 0.07, e.rot);
    }
  }
  if (sloped) lmRoof(g, o.roof, lmFrame(ring), y1, { kind: rk, pitch: o.pitch ?? 22, over: 0.5 });
  lmCollide(K, ring, h.pass ? h.y0 : h.y0 - 1, y1 + par);
}

/* ---------- вокзал ---------- */
const SITGES_LM_STATION = {
  ready: true,
  plan(C, L) {},
  build(K, L, group) {
    const wall = lmMat(0xf1ede2, { tex: 'plaster' }), yel = lmMat(0xe3b552, { tex: 'plaster' }), win = lmMat(0x23272b, { rough: 0.35 }),
      roof = lmMat(0xa9573a, { tex: 'tile' }), metal = lmMat(0x4d5358, { rough: 0.5, metal: 0.4 }), cap = lmMat(0xd9d2c2, { tex: 'stone' });
    const P = L.parts, st = { wall, trim: yel, plinth: yel, cap, win, roof, plinthH: 0.9, pil: 4.2, step: 4.2, ww: 1.15, arch: true, belt: yel, corn: 0.25, parapet: 1.0 };
    // навес (часть 9): столбы по внешнему краю, тонкая кровля
    const canopy = P.find(h => lmFrame(h.rings[0]).len > 30 && h.p.floors === 1);
    for (const h of P) {
      if (h === canopy) continue;
      lmCPart(K, group, h, Object.assign({}, st, { ground: h.p.floors > 1 ? 'door' : 'win', parapet: h.p.floors > 1 ? 1.0 : 0.7 }));
    }
    if (canopy) {
      const F = lmFrame(canopy.rings[0]), y = canopy.y1, g0 = canopy.base;
      // внешний край навеса — дальний от главного корпуса
      const main = P.filter(h => h !== canopy).reduce((a, h) => a.p.floors >= h.p.floors ? a : h);
      const Fm = lmFrame(main.rings[0]), sv = Math.sign((Fm.cx - F.cx) * F.vx + (Fm.cz - F.cz) * F.vz) || 1;
      const n = Math.round(F.len / 5.5);
      for (let i = 0; i <= n; i++) {
        const [x, z] = F.at(-F.len / 2 + 0.4 + (F.len - 0.8) * i / n, -sv * (F.wid / 2 - 0.4));
        lmCyl(group, metal, 0.12, y - g0, x, g0, z, { seg: 8 });
        lmCollideBox(K, x, z, 0.4, 0.4, 0, g0 - 1, y);
      }
      const [bx, bz] = F.at(0, -sv * (F.wid / 2 - 0.4));
      lmBox(group, metal, F.len, 0.25, 0.3, bx, y - 0.4, bz, F.rot);           // балка по столбам
      lmBox(group, metal, F.len + 0.6, 0.15, F.wid + 0.6, F.cx, y - 0.15, F.cz, F.rot);   // кровля
    }
    // аттик с часами — посередине длинного фасада главного корпуса, к площади (−z)
    const main = P.filter(h => h !== canopy && h.p.floors > 1).reduce((a, h) => lmFrame(a.rings[0]).len * a.p.floors >= lmFrame(h.rings[0]).len * h.p.floors ? a : h);
    const Fm = lmFrame(main.rings[0]), sgn = Fm.vz < 0 ? 1 : -1;
    const [ax, az] = Fm.at(0, sgn * (Fm.wid / 2)), ay = main.y1 + 1.0, nx = Fm.vx * sgn, nz = Fm.vz * sgn;
    lmBox(group, wall, 4.2, 2.2, 0.6, ax - nx * 0.2, ay - 0.1, az - nz * 0.2, Fm.rot);
    lmBox(group, yel, 4.6, 0.25, 0.75, ax - nx * 0.2, ay + 2.05, az - nz * 0.2, Fm.rot);
    lmBox(group, yel, 1.6, 0.9, 0.5, ax - nx * 0.2, ay + 2.25, az - nz * 0.2, Fm.rot);
    for (const [m, r, d, k] of [[yel, 0.78, 0.1, 0.1], [wall, 0.62, 0.12, 0.17]]) {
      const c = lmCyl(group, m, r, d, ax + nx * k, ay + 0.9 - d / 2, az + nz * k, { seg: 16 });
      c.position.y = ay + 0.95; c.rotation.order = 'YXZ'; c.rotation.set(Math.PI / 2, Fm.rot, 0);
    }
  },
};
