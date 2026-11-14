// Побережье — РАСКЛАДКА: зелень и сельские мелочи (после домов). Пятна леса по шуму — зонтичные сосны, выше по
// склонам ели; аллеи кипарисов вдоль отрезков дорог и кипарисы у ферм; оливковые рощи рядами на юго-восточных
// холмах; виноградники у винодельни — ряды шпалер по горизонталям склона (столбики через 4 м); круглые тюки сена
// на полях; редкие кусты у дорог. Всё не ближе обочины к дороге, не в воде и не в домах.
// Определяет: coastPlanNature.
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

function coastPlanNature(C) {
  const { rng, noise, ground, waterAt, roads, roadAt, roadDist, houses, pads, SITES, ZC, cellI, port, HX, HZ } = C;
  const R = (a, b) => a + (b - a) * rng();
  const [px, pz] = SITES.piazza;
  // занятость: клетки 3 м — дома, площадки, порт
  const OC = 3, occ = new Set(), ok = (x, z) => occ.has(Math.floor(x / OC) * 8192 + Math.floor(z / OC));
  const mark = (x, z, r) => { for (let a = Math.floor((x - r) / OC); a <= Math.floor((x + r) / OC); a++) for (let b = Math.floor((z - r) / OC); b <= Math.floor((z + r) / OC); b++) occ.add(a * 8192 + b); };
  for (const h of houses) mark(h.x, h.z, Math.hypot(h.w, h.d) / 2 + 1.5);
  for (const pd of pads) mark(pd.x, pd.z, pd.r + 4);
  for (const b of C.winery.blds) mark(b.x, b.z, Math.hypot(b.w, b.d) / 2 + 2);
  const free = (x, z, clear) => {
    if (Math.abs(x) > HX - 8 || Math.abs(z) > HZ - 8) return false;
    if (ok(x, z) || roadDist(x, z) < clear || roadAt(x, z)) return false;
    if (z - ZC[cellI(x)] < 30 || ground(x, z) < waterAt(x, z) + 1) return false;
    if (Math.max(port.x0 - x, 0, x - port.x1, port.z0 - z, z - port.z1) < 15) return false;
    return true;
  };
  const slope = (x, z) => Math.hypot(ground(x + 2, z) - ground(x - 2, z), ground(x, z + 2) - ground(x, z - 2)) / 4;
  const pines = [], firs = [], cypress = [], olives = [], bushes = [], vines = [], bales = [];
  const spaced = (list, x, z, d) => !list.some(t => Math.abs(t.x - x) < d && Math.abs(t.z - z) < d && Math.hypot(t.x - x, t.z - z) < d);

  /* ---------- пятна леса ---------- */
  const forest = (x, z) => noise(x / 170 + 3, z / 170 - 5) + 0.5 * noise(x / 60 - 7, z / 60 + 2);
  for (let t = 0; t < 26000 && pines.length + firs.length < 520; t++) {
    const x = R(-HX, HX), z = R(-HZ, HZ), f = forest(x, z);
    if (f < 0.32 || Math.hypot(x - px, z - pz) < 190 || !free(x, z, 9) || slope(x, z) > 0.8) continue;
    const h = ground(x, z), list = h > 55 && rng() < 0.7 ? firs : pines;
    if (!spaced(pines, x, z, 8) || !spaced(firs, x, z, 6)) continue;
    list.push({ x, z, s: R(0.8, 1.25), r: R(0, 6.3), lx: R(-0.06, 0.06), lz: R(-0.06, 0.06), c: rng() });
    mark(x, z, 1.5);
  }
  /* ---------- кипарисы: аллеи вдоль дорог и у ферм ---------- */
  const alley = (r, i0, n, sides, gap) => {
    for (let i = i0; i < Math.min(r.N - 1, i0 + n); i += gap) for (const s of sides) {
      const p = r.pts[i], o = r.core + 2.2 + R(-0.3, 0.3), x = p.x + p.nx * o * s, z = p.z + p.nz * o * s;
      if (!p.span && free(x, z, r.core + 1.2) && spaced(cypress, x, z, 4)) { cypress.push({ x, z, s: R(0.85, 1.2), c: rng() }); mark(x, z, 1); }
    }
  };
  const byId = id => roads.find(r => r.id === id);
  for (const [id, f0, n, sides] of [['serp', 0.12, 50, [1, -1]], ['serp', 0.36, 35, [1]], ['serp', 0.72, 60, [1, -1]], ['westN', 0.35, 45, [1, -1]],
    ['wineLink', 0.1, 40, [-1]], ['villN', 0, 40, [1, -1]], ['north', 0.55, 40, [-1]], ['east', 0.7, 30, [1]], ['amphLink', 0.3, 30, [1, -1]]]) {
    const r = byId(id); if (r) alley(r, Math.floor(r.N * f0), n, sides, 6 + Math.floor(R(0, 2)));
  }
  for (const h of houses) if (Math.hypot(h.x - px, h.z - pz) > 200 && rng() < 0.7) for (let k = 0; k < 3; k++) {
    const a = R(0, 6.3), d = Math.hypot(h.w, h.d) / 2 + R(3, 7), x = h.x + Math.cos(a) * d, z = h.z + Math.sin(a) * d;
    if (free(x, z, 4) && spaced(cypress, x, z, 3)) { cypress.push({ x, z, s: R(0.8, 1.15), c: rng() }); mark(x, z, 1); }
  }
  /* ---------- оливковые рощи: ряды ---------- */
  const grove = (cx, cz, L, W, rot, list, rowGap, gap, jit, test) => {
    const c = Math.cos(rot), s = Math.sin(rot);
    for (let a = -L / 2; a <= L / 2; a += gap) for (let b = -W / 2; b <= W / 2; b += rowGap) {
      const x = cx + a * c + b * s + R(-jit, jit), z = cz - a * s + b * c + R(-jit, jit);
      if (test(x, z)) list.push({ x, z, s: R(0.8, 1.2), r: R(0, 6.3), c: rng(), rot });
    }
  };
  for (const [cx, cz, L, W] of [[-300, -470, 110, 70], [-230, -360, 90, 60], [-380, -300, 80, 70], [-150, -250, 70, 50], [180, -420, 70, 55], [-250, 160, 80, 60]]) {
    grove(cx + R(-10, 10), cz + R(-10, 10), L, W, R(0, 3.14), olives, R(7.5, 9), R(6.5, 8), 0.9, (x, z) => free(x, z, 3.5) && slope(x, z) < 0.45);
  }
  for (const o of olives) mark(o.x, o.z, 1.6);
  /* ---------- виноградники: ряды шпалер по горизонталям склона ---------- */
  // столбик шпалеры: { x, z, ry — направление ряда, seg — длина лозы до следующего столбика (0 — последний в ряду) }
  const vineyard = (cx, cz, L, W) => {
    const gxs = ground(cx + 4, cz) - ground(cx - 4, cz), gzs = ground(cx, cz + 4) - ground(cx, cz - 4);
    // ряды вдоль горизонталей: направление ряда (sin rot, cos rot) перпендикулярно уклону (gxs, gzs)
    const rot = Math.atan2(-gzs, gxs) + R(-0.15, 0.15), c = Math.cos(rot), s = Math.sin(rot);
    for (let b = -W / 2; b <= W / 2; b += 3.2) {
      let prev = null;
      for (let a = -L / 2; a <= L / 2; a += 4) {
        const x = cx + a * s + b * c, z = cz + a * c - b * s;
        if (!free(x, z, 3) || slope(x, z) > 0.5) { prev = null; continue; }
        const v = { x, z, ry: rot, seg: 0 };
        if (prev) prev.seg = 4;
        vines.push(v); prev = v;
      }
    }
  };
  for (const [cx, cz, L, W] of [[300, 250, 70, 45], [380, 260, 60, 50], [390, 400, 70, 40], [270, 420, 55, 40], [225, 300, 50, 36], [420, 120, 50, 40], [160, -170, 55, 40]])
    vineyard(cx + R(-8, 8), cz + R(-8, 8), L, W);
  for (const v of vines) mark(v.x, v.z, 1.4);
  /* ---------- тюки сена на полях ---------- */
  for (let t = 0; t < 4000 && bales.length < 48; t++) {
    const x = R(-440, 440), z = R(-520, 600);
    if (forest(x, z) > 0.15 || !free(x, z, 7) || slope(x, z) > 0.18 || Math.hypot(x - px, z - pz) < 190) continue;
    const n = 2 + Math.floor(R(0, 4)), a0 = R(0, 6.3);
    for (let k = 0; k < n; k++) {
      const bx = x + Math.cos(a0 + k * 0.9) * k * 2.6, bz = z + Math.sin(a0 + k * 0.9) * k * 2.6;
      if (free(bx, bz, 6) && spaced(bales, bx, bz, 2)) { bales.push({ x: bx, z: bz, ry: R(0, 6.3) }); mark(bx, bz, 1.2); }
    }
  }
  /* ---------- кусты ---------- */
  for (let t = 0; t < 9000 && bushes.length < 420; t++) {
    const x = R(-HX, HX), z = R(-HZ, HZ), rd = roadDist(x, z);
    if (rd > 26 && forest(x, z) < 0.2 && rng() < 0.8) continue;
    if (!free(x, z, 5)) continue;
    bushes.push({ x, z, s: R(0.6, 1.5), c: rng() });
  }
  Object.assign(C, { pines, firs, cypress, olives, vines, bales, bushes });
}
