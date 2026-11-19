// Ситжес — ПОСТРОЙКА: простые заборы (этап 3б; виды по фото и районам — этап 4а). После тротуаров (walks3d.js).
//   Где забор — раскладка (js/maps/sitges/fences.js: C.fences — ломаные по кромке тротуаров и краю проезжей части,
//   C.fenceLine — отрезки линии); здесь только геометрия и столкновения. Высота верха тротуара — из K.rk.edges
//   (walks3d.js; отрезок кромки — те же массивы концов, что в C.fenceLine), у края проезжей части — рельеф + подъём.
//   Вид один: белый оштукатуренный цоколь h0 с серой шапкой, над ним тёмная решётка до h1 (текстура с альфой, столбы
//   в текстуре через 2,5 м; настройки SITGES_FENCE — в fences.js). Геометрия — в копилку улиц (K.rk: quad, склейка
//   по квадратам), столкновения — стенки высотой h1 с двух сторон цоколя в сетке тротуаров (cquad). Забор разрезан
//   по участкам (cut): на разрезе торца нет, текстура идёт дальше (f.s). Стиль участка (f.style, fencestyle.js) пока
//   не рисуется (виды — этап 4а.4); отладка — страница с ?fences: цоколь цветом вида верха (SITGES_FENCE_DBG),
//   высоты h0 / h1 стиля, у глухой и низкой стенки без решётки, проёмы калиток и ворот (C.gates, gates.js) —
//   цветные столбики с перекладиной; столкновения те же.
// Определяет: SITGES_FENCE_DBG, sitgesFenceTextures, sitgesBuildFences.
// Использует: MAT (js/core.js); canvasTex (js/maps/city/textures.js); SITGES_FENCE (js/maps/sitges/fences.js);
//   SITGES_RB (js/maps/sitges/roads3d.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

// отладочный цвет цоколя по виду верха (?fences): вереск — охра, изгородь — зелёный, ламели — синий, сетка — бирюза,
// решётка — чёрный, глухая стена — белый, низкая стенка — жёлтый
const SITGES_FENCE_DBG = { heath: 0xb08040, hedge: 0x3f9a3a, slats: 0x4a6ab8, mesh: 0x2ab0b0, grille: 0x303030, wall: 0xffffff, low: 0xe8c838 };

function sitgesFenceTextures() {
  // решётка 2,5 × 1 м: рама, вертикальные прутья через 12 см, столб у левого края (прозрачность — alphaTest)
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const x = c.getContext('2d'), m = '#2a302c';
  x.fillStyle = m;
  for (let u = 6; u < 256; u += 12.3) x.fillRect(u, 0, 3, 128);
  x.fillRect(0, 0, 256, 7); x.fillRect(0, 112, 256, 6);
  x.fillStyle = '#353c37'; x.fillRect(0, 0, 11, 128);
  // штукатурка: белая с лёгкими пятнами, 2 м
  const p = document.createElement('canvas'); p.width = p.height = 128;
  const y = p.getContext('2d');
  y.fillStyle = '#eeeae2'; y.fillRect(0, 0, 128, 128);
  let s = 7;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 2600; i++) { y.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '90,80,60'},${rnd() * 0.07})`; y.fillRect(rnd() * 128, rnd() * 128, 1 + rnd() * 3, 1 + rnd() * 3); }
  const tex = cv => { const t = canvasTex(cv); t.generateMipmaps = true; return t; };
  return { grille: tex(c), plaster: tex(p) };
}

function sitgesBuildFences(K) {
  const { D, rk } = K, C = D.C, F = SITGES_FENCE, g = D.ground, t0 = performance.now();
  const { MAT, quad, UP, cquad, cnt, edges, lod } = rk;
  lod.plaster = [F.chunk, F.far.plaster]; lod.grille = [F.chunk, F.far.grille];
  const TX = sitgesFenceTextures();
  MAT.plaster = new THREE.MeshStandardMaterial({ name: 'fence-plaster', map: TX.plaster, roughness: 0.92, vertexColors: true });
  MAT.grille = new THREE.MeshStandardMaterial({ name: 'fence-grille', map: TX.grille, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.3, vertexColors: true });

  /* ---------- высота верха тротуара на концах отрезков линии ---------- */
  const lift = SITGES_RB.lift.drive, byA = new Map();
  for (const e of edges) byA.set(e.A, e);
  let lost = 0;
  const ys = C.fenceLine.map(l => {
    const e = l.kind === 'curb' ? null : byA.get(l.A);
    if (e && e.B === l.B) return [e.ya, e.yb];
    if (l.kind !== 'curb') lost++;
    return [g(l.A[0], l.A[1]) + lift, g(l.B[0], l.B[1]) + lift];
  });
  if (lost) console.error(`Ситжес, заборы: у ${lost} отрезков кромки нет высоты тротуара (rk.edges)`);

  /* ---------- постройка ---------- */
  const T = F.t, dbg = typeof location !== 'undefined' && /[?&]fences\b/.test(location.search);
  cnt.yard = 0;
  // отладка (?fences): проёмы калиток и ворот (C.gates, js/maps/sitges/gates.js) — по куску забора
  const gatesOf = new Map();
  if (dbg && C.gates) for (const gt of C.gates) { if (!gatesOf.has(gt.f)) gatesOf.set(gt.f, []); gatesOf.get(gt.f).push(gt); }
  C.fences.forEach((f, i) => buildRun(f, i));

  function buildRun({ P, N, at, cut, s, style }, fi) {
    // высота верха тротуара в точках ломаной
    const Y = at.map(([e, t]) => ys[e][0] + (ys[e][1] - ys[e][0]) * t);
    if (gatesOf.has(fi)) gateMarks(P, Y, gatesOf.get(fi));
    const off = (k, d) => [P[k][0] + N[k][0] * d, P[k][1] + N[k][1] * d];
    const H0 = dbg ? style.h0 : F.h0, H1 = F.h1, HG = dbg ? style.h1 : F.h1, top = HG > H0 + 0.05;
    const cf = dbg ? SITGES_FENCE_DBG[style.top] : 0xffffff, cb = dbg ? cf : 0xf2efe8, ce = dbg ? cf : 0xe8e4dc;
    let u = s || 0;
    for (let k = 0; k + 1 < P.length; k++) {
      const a = P[k], b = P[k + 1], ya = Y[k], yb = Y[k + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 1e-3) continue;
      const ab = off(k, T), bb = off(k + 1, T), am = off(k, T / 2), bm = off(k + 1, T / 2);
      const nf = [-(N[k][0] + N[k + 1][0]) / 2, 0, -(N[k][1] + N[k + 1][1]) / 2], nb = [-nf[0], 0, -nf[2]];
      const gbA = Math.min(ya, g(ab[0], ab[1])) - 0.3, gbB = Math.min(yb, g(bb[0], bb[1])) - 0.3;
      const u0 = u / 2, u1 = (u + L) / 2;
      // цоколь: лицевая сторона (к улице), задняя (к участку), шапка
      quad('plaster', [[a[0], ya - 0.05, a[1]], [b[0], yb - 0.05, b[1]], [b[0], yb + H0, b[1]], [a[0], ya + H0, a[1]]], nf, cf,
        [[u0, 0], [u1, 0], [u1, (H0 + 0.05) / 2], [u0, (H0 + 0.05) / 2]]);
      quad('plaster', [[ab[0], gbA, ab[1]], [bb[0], gbB, bb[1]], [bb[0], yb + H0, bb[1]], [ab[0], ya + H0, ab[1]]], nb, cb,
        [[u0, 0], [u1, 0], [u1, (yb + H0 - gbB) / 2], [u0, (ya + H0 - gbA) / 2]]);
      const cA = off(k, -F.cap), cB = off(k + 1, -F.cap), dA = off(k, T + F.cap), dB = off(k + 1, T + F.cap), yc = 0.05;
      quad('plaster', [[cA[0], ya + H0 + yc, cA[1]], [cB[0], yb + H0 + yc, cB[1]], [dB[0], yb + H0 + yc, dB[1]], [dA[0], ya + H0 + yc, dA[1]]], UP, 0xb8b2a8,
        [[u0, 0], [u1, 0], [u1, 0.12], [u0, 0.12]]);
      quad('plaster', [[cA[0], ya + H0 - 0.01, cA[1]], [cB[0], yb + H0 - 0.01, cB[1]], [cB[0], yb + H0 + yc, cB[1]], [cA[0], ya + H0 + yc, cA[1]]], nf, 0xc8c2b8,
        [[u0, 0], [u1, 0], [u1, 0.03], [u0, 0.03]]);
      // решётка над цоколем (по середине толщины), пролёт — F.bay
      if (top) quad('grille', [[am[0], ya + H0 + yc, am[1]], [bm[0], yb + H0 + yc, bm[1]], [bm[0], yb + HG, bm[1]], [am[0], ya + HG, am[1]]], nf, 0xffffff,
        [[u / F.bay, 0], [(u + L) / F.bay, 0], [(u + L) / F.bay, (HG - H0 - yc) / (F.h1 - F.h0 - yc)], [u / F.bay, (HG - H0 - yc) / (F.h1 - F.h0 - yc)]]);
      // столкновения: стенки высотой h1 с двух сторон цоколя
      cquad([a[0], ya - 0.1, a[1]], [b[0], yb - 0.1, b[1]], [b[0], yb + H1, b[1]], [a[0], ya + H1, a[1]]);
      cquad([ab[0], gbA, ab[1]], [bb[0], gbB, bb[1]], [bb[0], yb + H1, bb[1]], [ab[0], ya + H1, ab[1]]);
      u += L;
      cnt.yard++;
    }
    // торцы цоколя (на разрезе по участкам — нет: забор продолжается соседним куском)
    for (const k of [0, P.length - 1]) {
      if (cut && cut[k ? 1 : 0] && !dbg) continue;
      const k2 = k ? k - 1 : 1, tx = P[k][0] - P[k2][0], tz = P[k][1] - P[k2][1], l = Math.hypot(tx, tz) || 1, nn = [tx / l, 0, tz / l];
      const a = P[k], b = off(k, T), y = Y[k], gb = Math.min(y, g(b[0], b[1])) - 0.3;
      quad('plaster', [[a[0], y - 0.05, a[1]], [b[0], gb, b[1]], [b[0], y + H0, b[1]], [a[0], y + H0, a[1]]], nn, ce,
        [[0, 0], [T / 2, 0], [T / 2, 0.5], [0, 0.5]]);
      cquad([a[0], y - 0.1, a[1]], [b[0], gb, b[1]], [b[0], y + H1, b[1]], [a[0], y + H1, a[1]]);
    }
  }
  // отладка: проём — два цветных столбика по краям и перекладина над ним (калитка — малиновая, ворота по ортофото —
  // голубые, по OSM — синие); столкновений нет, забор под проёмом пока сплошной (геометрия створок — 4а.4)
  function gateMarks(P, Y, list) {
    const S = [0];
    for (let k = 1; k < P.length; k++) S.push(S[k - 1] + Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]));
    const yAt = v => { let k = 0; while (k + 2 < P.length && S[k + 1] < v) k++; const t = Math.max(0, Math.min(1, (v - S[k]) / Math.max(1e-6, S[k + 1] - S[k]))); return Y[k] + (Y[k + 1] - Y[k]) * t; };
    const box = (x, z, y0, y1, r, col) => {
      for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        const ax = x + (dx - dz) * r, az = z + (dz + dx) * r, bx = x + (dx + dz) * r, bz = z + (dz - dx) * r;
        quad('plaster', [[ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az]], [dx, 0, dz], col, [[0, 0], [0.1, 0], [0.1, 0.5], [0, 0.5]]);
      }
    };
    for (const gt of list) {
      const col = gt.kind === 'wicket' ? 0xff30c0 : gt.src === 'win' ? 0x20d0ff : 0x3050ff, tx = -gt.n[1], tz = gt.n[0];
      const y = yAt(gt.s), h = gt.kind === 'wicket' ? 2.3 : 2.6;
      for (const sg of [-1, 1]) box(gt.x + tx * sg * gt.w / 2, gt.z + tz * sg * gt.w / 2, y - 0.05, y + h, 0.1, col);
      const a = [gt.x - tx * gt.w / 2, gt.z - tz * gt.w / 2], b = [gt.x + tx * gt.w / 2, gt.z + tz * gt.w / 2];
      for (const nn of [[-gt.n[0], 0, -gt.n[1]], [gt.n[0], 0, gt.n[1]]]) {
        const o = [nn[0] * 0.11, nn[2] * 0.11];
        quad('plaster', [[a[0] + o[0], y + h - 0.2, a[1] + o[1]], [b[0] + o[0], y + h - 0.2, b[1] + o[1]], [b[0] + o[0], y + h, b[1] + o[1]], [a[0] + o[0], y + h, a[1] + o[1]]], nn, col,
          [[0, 0], [gt.w / 2, 0], [gt.w / 2, 0.1], [0, 0.1]]);
      }
    }
  }
  // сводка раскладки (ms — раскладка + постройка)
  rk.fenceStats = { ...C.fenceStats, ms: C.fenceStats.ms + Math.round(performance.now() - t0) };
}
