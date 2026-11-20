// Ситжес — достопримечательность: часовня Сант-Себастья и кладбище (этап 6, docs/sitges/stage-5.md, архив lm-e.md).
// Часовня — здание 88 кадастра (неф с боковым приделом и ризницей, башенка — отдельная часть); кладбище — здание 85
//   (18 частей — стены с нишами), его берёт plan() по точке SITGES_LM_SEBASTIA.cem: белые стены кладбища по бокам
//   фасада — главное в силуэте с пляжа и с площади (фото c-01, c-08), домами кадастра с окнами они не похожи.
// Оси — от длинной стены нефа: u — от фасада вглубь (фасад смотрит на площадь, к городу, +x), v — поперёк.
// По фото: белый щипцовый фасад с серыми угловыми камнями и цоколем, каменная арка двери, окулюс, звонница
//   (эспаданья) с крестом на коньке; черепичная двускатная кровля; башенка у задней части с восьмигранным
//   зеленовато-серым шпилем (верх по лидару ≈ 17 м над площадью); стены ниш ≈ 4,5 м с каменным верхом.
// Определяет: SITGES_LM_SEBASTIA.
// Использует: sitgesInPoly (js/maps/sitges/geom.js); lmFrame, lmMat, lmBox, lmExtrude, lmPrism, lmArch, lmCyl,
//   lmRoof, lmCollide, lmInset (js/maps/sitges/landmarks3d.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const SITGES_LM_SEBASTIA = {
  ready: true,
  cem: [-1068, -168],              // точка внутри стены кладбища (здание 85 кадастра)
  H: { eave: 8.6, apex: 12.3, pitch: 32, aisle: 5.4, sacr: 4.8, tower: 13, spire: 4.2 },  // высоты над площадью, м

  // раскладка: кладбище в строение; оси часовни по контуру кадастра
  plan(C, L) {
    const h85 = C.houseAt(...this.cem), chapelBi = L.bis[0];
    L.chapel = L.parts.filter(p => p.bi === chapelBi);
    L.cemetery = [];
    if (h85 && h85.bi !== chapelBi) {
      for (const p of C.houses) if (p.bi === h85.bi) { p.lm = L.id; L.parts.push(p); L.rings.push(p.rings[0]); L.cemetery.push(p); }
      L.bis.push(h85.bi);
    }
    const area = r => { let s = 0; r.forEach((a, i) => { const b = r[(i + 1) % r.length]; s += a[0] * b[1] - b[0] * a[1]; }); return Math.abs(s) / 2; };
    const main = L.chapel.reduce((a, p) => (area(p.rings[0]) > area(a.rings[0]) ? p : a)), tower = L.chapel.find(p => p !== main);
    const ring = main.rings[0];
    // ось нефа — длинное ребро контура; направление — к башенке (она у задней части)
    let best = null;
    ring.forEach((a, i) => { const b = ring[(i + 1) % ring.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (!best || l > best.l) best = { a, b, l }; });
    let nx = (best.b[0] - best.a[0]) / best.l, nz = (best.b[1] - best.a[1]) / best.l;
    const tc = tower ? lmFrame(tower.rings[0]) : null;
    if (tc && (tc.cx - L.cx) * nx + (tc.cz - L.cz) * nz < 0) { nx = -nx; nz = -nz; }
    const r = Math.atan2(-nz, nx), tx = Math.sin(r), tz = Math.cos(r);
    const U = ([x, z]) => x * nx + z * nz, V = ([x, z]) => x * tx + z * tz;
    const u0 = Math.min(...ring.map(U)), u1 = Math.max(...ring.map(U));
    // фасад — вершины у переднего торца; неф — их ширина
    const front = ring.filter(p => U(p) < u0 + 1.5), v0 = Math.min(...front.map(V)), v1 = Math.max(...front.map(V));
    const O = [nx * u0 + tx * 0, nz * u0 + tz * 0];        // начало: u = 0 на фасаде, v — как в мире
    const side = ring.filter(p => V(p) > v1 + 1), sacr = ring.filter(p => V(p) < v0 - 0.5);
    const fx = nx * u0 + tx * (v0 + v1) / 2, fz = nz * u0 + tz * (v0 + v1) / 2;
    L.seb = {
      nx, nz, tx, tz, r, O, len: u1 - u0, v0, v1,
      gF: C.ground(fx - nx * 3, fz - nz * 3),              // площадь перед фасадом
      yb: Math.min(...L.chapel.map(p => p.y0)) - 0.2,
      aisle: side.length ? { u0: Math.min(...side.map(U)) - u0, u1: Math.max(...side.map(U)) - u0, v: Math.max(...side.map(V)) } : null,
      sacr: sacr.length ? sacr : null,
      tower: tc ? { u: U([tc.cx, tc.cz]) - u0, v: V([tc.cx, tc.cz]), s: Math.max(tc.len, tc.wid), ring: tower.rings[0] } : null,
      main: ring,
    };
  },

  build(K, L, group) {
    const S = L.seb, H = this.H, C = K.D.C, gr = K.D.ground;
    const M = {
      wall: lmMat(0xf1eee6, { tex: 'plaster' }),
      stone: lmMat(0xc9c0ad, { tex: 'stone' }),
      roof: lmMat(0xa8613f, { tex: 'tile' }),
      dark: lmMat(0x3b2a20, { rough: 0.7 }),
      spire: lmMat(0x70897d, { tex: 'tile', rough: 0.6 }),
      niche: lmMat(0xdcd7cc, { tex: 'stone', rough: 0.6 }),
    };
    const { nx, nz, tx, tz, r, gF, yb } = S, u0w = S.O[0] * nx + S.O[1] * nz;   // u начала в мировой проекции
    const P = (u, v) => [nx * (u + u0w) + tx * v, nz * (u + u0w) + tz * v];
    const box = (mat, w, h, d, u, y, v) => { const [x, z] = P(u, v); return lmBox(group, mat, w, h, d, x, y, z, r); };
    // фигура в плоскости фасада (x фигуры — вдоль v, глубина — вдоль u)
    const face = (mat, shape, depth, u, y, v) => { const [x, z] = P(u, v); return lmExtrude(group, mat, shape, depth, x, y, z, r - Math.PI / 2); };
    // фигура в плоскости боковой стены (x фигуры — вдоль u, глубина — вдоль v)
    const flank = (mat, shape, depth, u, y, v) => { const [x, z] = P(u, v); return lmExtrude(group, mat, shape, depth, x, y, z, r); };
    // скат: ребро (ua..ub) на v = va, высота ya → ребро на v = vb, высота yb
    const slope = (mat, ua, ub, va, ya, vb, yb2) => {
      const p = [[ua, va, ya], [ub, va, ya], [ub, vb, yb2], [ua, vb, yb2]].map(([u, v, y]) => { const [x, z] = P(u, v); return [x, y, z]; });
      const sl = Math.hypot(vb - va, yb2 - ya), uv = [[0, 0], [ub - ua, 0], [ub - ua, sl], [0, sl]];
      const pos = [], tuv = [];
      for (const k of [0, 1, 2, 0, 2, 3]) { pos.push(...p[k]); tuv.push(uv[k][0] / 2, uv[k][1] / 2); }
      // нормаль вверх
      const ax = pos[3] - pos[0], ay = pos[4] - pos[1], az = pos[5] - pos[2], bx = pos[6] - pos[0], by = pos[7] - pos[1], bz = pos[8] - pos[2];
      if (az * bx - ax * bz < 0) for (let t = 0; t < 2; t++) { const o = t * 9; for (let q = 0; q < 3; q++) { const s1 = pos[o + 3 + q]; pos[o + 3 + q] = pos[o + 6 + q]; pos[o + 6 + q] = s1; } const w = t * 6; for (let q = 0; q < 2; q++) { const s2 = tuv[w + 2 + q]; tuv[w + 2 + q] = tuv[w + 4 + q]; tuv[w + 4 + q] = s2; } }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(tuv, 2));
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; group.add(m);
      return m;
    };
    const shape = pts => { const s = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y))); s.closePath(); return s; };
    const archPath = (w, h, dy, spring) => {
      const p = new THREE.Path(), rr = w / 2, sp = spring ?? h - rr;
      p.moveTo(-rr, dy); p.lineTo(-rr, dy + sp); p.absarc(0, dy + sp, rr, Math.PI, 0, true); p.lineTo(rr, dy); p.lineTo(-rr, dy);
      return p;
    };
    // арка-обрамление: полоса между двумя арками, открытая снизу
    const archBand = (wo, ho, wi, hi) => {
      const s = new THREE.Shape(), ro = wo / 2, ri = wi / 2, so = ho - ro, si = hi - ri;
      s.moveTo(-ro, 0); s.lineTo(-ro, so); s.absarc(0, so, ro, Math.PI, 0, true); s.lineTo(ro, 0); s.lineTo(ri, 0);
      s.lineTo(ri, si); s.absarc(0, si, ri, 0, Math.PI, false); s.lineTo(-ri, 0); s.lineTo(-ro, 0);
      return s;
    };
    const disc = rr => { const s = new THREE.Shape(); s.absarc(0, 0, rr, 0, Math.PI * 2, false); return s; };
    const ring = (ro, ri) => { const s = new THREE.Shape(); s.absarc(0, 0, ro, 0, Math.PI * 2, false); const h = new THREE.Path(); h.absarc(0, 0, ri, 0, Math.PI * 2, true); s.holes.push(h); return s; };

    /* ---------- неф ---------- */
    const { v0, v1, len } = S, W = v1 - v0, vc = (v0 + v1) / 2, E = gF + H.eave, AP = gF + H.apex;
    lmPrism(group, M.wall, [P(0, v0), P(len, v0), P(len, v1), P(0, v1)], yb, E);
    const rise = (W / 2 + 0.3) * Math.tan(H.pitch * Math.PI / 180);
    slope(M.roof, 0.35, len + 0.3, v0 - 0.3, E - 0.2, vc, E - 0.2 + rise);
    slope(M.roof, 0.35, len + 0.3, v1 + 0.3, E - 0.2, vc, E - 0.2 + rise);
    // задний щипец (белый)
    face(M.wall, shape([[-W / 2, 0], [W / 2, 0], [0, rise - 0.2]]), 0.4, len - 0.2, E - 0.01, vc);
    // окна нефа: узкие арочные проёмы по бокам
    for (const uu of [6, 11.5, 17]) if (uu < len - 2) {
      flank(M.dark, lmArch(0.8, 1.9), 0.12, uu, gF + 4.6, v0);
      flank(M.dark, lmArch(0.8, 1.9), 0.12, uu, gF + 4.6, v1);
    }

    /* ---------- фасад ---------- */
    face(M.wall, shape([[-W / 2, 0], [W / 2, 0], [0, AP - E]]), 0.5, 0.25, E - 0.01, vc);
    // каменный пояс по скатам щипца
    const hg = AP - E;
    face(M.stone, shape([[-W / 2 - 0.3, -0.2], [0, hg + 0.3], [W / 2 + 0.3, -0.2], [W / 2 - 0.25, -0.2], [0, hg - 0.25], [-W / 2 + 0.25, -0.2]]), 0.7, 0.22, E, vc);
    // угловые камни и цоколь
    for (const v of [v0 + 0.28, v1 - 0.28]) box(M.stone, 0.62, E - yb - 0.1, 0.62, 0.25, yb, v);
    box(M.stone, 0.3, gF + 0.7 - yb, W + 0.12, 0.1, yb, vc);
    // дверь: каменная арка и полотно
    face(M.stone, archBand(2.9, 4.65, 2.1, 4.15), 0.26, 0, gF + 0.01, vc);
    face(M.dark, lmArch(2.1, 4.15), 0.1, -0.03, gF + 0.01, vc);
    // ступень перед дверью
    box(M.stone, 1.0, gF + 0.18 - yb, 3.4, -0.5, yb, vc);
    // окулюс
    face(M.stone, ring(0.98, 0.66), 0.26, 0, gF + 6.9, vc);
    face(M.dark, disc(0.67), 0.08, -0.02, gF + 6.9, vc);
    // звонница на коньке: столбик с аркой, колокол, крест
    const bell = new THREE.Shape(); bell.moveTo(-0.9, 0); bell.lineTo(0.9, 0); bell.lineTo(0.9, 2.5); bell.absarc(0, 2.5, 0.9, 0, Math.PI, false); bell.lineTo(-0.9, 0);
    bell.holes.push(archPath(0.75, 1.35, 1.25));
    face(M.wall, bell, 0.55, 0.28, AP - 0.7, vc);
    face(M.stone, shape([[-1.0, 0], [1.0, 0], [1.0, 0.18], [-1.0, 0.18]]), 0.7, 0.28, AP + 1.12, vc);
    { const [x, z] = P(0.28, vc); lmCyl(group, M.dark, 0.28, 0.5, x, AP + 1.55, z, { seg: 8, top: 0.12 }); }
    box(M.dark, 0.08, 0.9, 0.08, 0.28, AP + 3.35, vc);
    box(M.dark, 0.08, 0.08, 0.5, 0.28, AP + 3.95, vc);

    /* ---------- боковой придел (к суше) ---------- */
    if (S.aisle) {
      const A = S.aisle, va = v1 - 0.05, vb = A.v;
      lmPrism(group, M.wall, [P(A.u0, va), P(A.u1, va), P(A.u1, vb), P(A.u0, vb)], yb, gF + H.aisle);
      slope(M.roof, A.u0 - 0.25, A.u1 + 0.25, va, gF + H.aisle + 1.0, vb + 0.35, gF + H.aisle - 0.15);
      for (let uu = A.u0 + 3; uu < A.u1 - 1.5; uu += 4.5) flank(M.dark, lmArch(0.7, 1.4), 0.12, uu, gF + 2.4, vb);
    }
    /* ---------- ризница (к морю) ---------- */
    if (S.sacr) {
      const U = ([x, z]) => x * nx + z * nz - u0w, V = ([x, z]) => x * tx + z * tz;
      const us = S.sacr.map(U), vs = S.sacr.map(V), ua = Math.min(...us) - 0.3, ub = Math.max(...us), vmin = Math.min(...vs);
      const rg = [P(ua, v0 + 0.05), P(ub, v0 + 0.05), P(ub, vmin), P(ua, vmin)];
      lmPrism(group, M.wall, rg, yb, gF + H.sacr);
      lmRoof(group, M.roof, lmFrame(rg), gF + H.sacr, { kind: 'hip', pitch: 22, over: 0.3 });
    }
    /* ---------- башенка ---------- */
    if (S.tower) {
      const T = S.tower, s = Math.max(3, T.s), top = gF + H.tower, [x, z] = P(T.u, T.v);
      box(M.wall, s, top - yb, s, T.u, yb, T.v);
      box(M.stone, s + 0.3, 0.32, s + 0.3, T.u, top - 0.32, T.v);
      box(M.stone, s + 0.15, 0.25, s + 0.15, T.u, top - 3.3, T.v);
      // проёмы звона на четыре стороны
      for (const sgn of [-1, 1]) {
        face(M.dark, lmArch(0.9, 1.7), 0.1, T.u + sgn * s / 2, top - 2.85, T.v);
        flank(M.dark, lmArch(0.9, 1.7), 0.1, T.u, top - 2.85, T.v + sgn * s / 2);
      }
      const sp = lmCyl(group, M.spire, s * 0.66, H.spire, x, top, z, { seg: 8, top: 0.03 });
      sp.rotation.y = r + Math.PI / 8;
      lmCyl(group, M.dark, 0.03, 1.0, x, top + H.spire - 0.05, z, { seg: 4 });
      lmCollide(K, T.ring, yb, top);
    }
    lmCollide(K, S.main, yb, E);

    /* ---------- кладбище: стены ниш ---------- */
    const cemArea = C.areas.find(a => a.kind === 'cemetery');
    for (const p of L.cemetery) {
      const rg = p.rings[0];
      lmPrism(group, M.wall, rg, p.y0 - 0.2, p.y1 - 0.25);
      lmPrism(group, M.stone, lmInset(rg, -0.07), p.y1 - 0.25, p.y1);
      lmCollide(K, rg, p.y0, p.y1);
      // плиты ниш — на сторону внутрь кладбища (не к дому и не наружу)
      const F = lmFrame(rg);
      if (F.wid > 4.5 || F.len < 3) continue;
      for (const sgn of [-1, 1]) {
        const [qx, qz] = F.at(0, sgn * (F.wid / 2 + 1.5)), hq = C.houseAt(qx, qz);
        if (cemArea && !sitgesInPoly(qx, qz, cemArea.ring)) continue;
        if (hq) continue;
        const [px, pz] = F.at(0, sgn * (F.wid / 2 + 0.03)), g = gr(px, pz), y0 = Math.max(g, p.y0) + 0.35, y1 = p.y1 - 0.6;
        if (y1 - y0 < 1.2) continue;
        lmBox(group, M.niche, F.len - 0.7, y1 - y0, 0.08, px, y0, pz, F.rot);
      }
    }
  },
};
