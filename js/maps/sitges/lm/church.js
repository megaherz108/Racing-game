// Ситжес — достопримечательность: церковь Sant Bartomeu i Santa Tecla на мысе (этап 5, docs/sitges/stage-5.md,
// замеры и источники — docs/sitges/lm-a.md). Как устроен объект строения — js/maps/sitges/landmarks.js (раскладка,
// C.landmarks) и js/maps/sitges/landmarks3d.js (постройка и помощники lm*).
//   Фасад на запад (+x) к площадке Baluard: криволинейный фронтон с розой и белым портиком, слева (север) часовая
//   башня с кованой клеткой колокола, справа (юг) колокольня: квадратный ствол, ярус колоколов, балюстрада,
//   восьмигранный барабан и купол-фонарь. Неф под одной несимметричной двускатной крышей (конёк ближе к северу — по
//   лидару), контрфорсы, хор и высокий восточный объём с вальмой; пристройки к Марисель — по контурам кадастра.
//   Бастион: плита террасы над откосом с бутовой стеной и парапетом, лестница к нижней площади (3 марша, балюстрада).
//   Местные оси: u — от плоскости фасада на восток, v — от оси на север (к суше); высоты — от земли у фасада LMCH.g.
//   Помощник lmChurchMesher() — сетка из треугольников по материалам (стены, скаты, наклонные балки), один меш на
//   материал; его можно перенести в каркас.
// Определяет: LMCH, lmChurchMesher, SITGES_LM_CHURCH.
// Использует: LMK, lmMat, lmBox, lmArch, lmExtrude, lmCollide, lmPrism, lmRoof, lmFrame, lmCollideBox, lmCyl
//   (js/maps/sitges/landmarks3d.js); last (js/main.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const LMCH = {
  f0: [-535.9, -196.5],          // точка на плоскости фасада, на оси
  e: [-0.9987, -0.0517],         // ось нефа на восток (по южной стене кадастра)
  g: 11.3,                       // земля площадки у фасада
  // корпус (u, v): неф с капеллами
  body: { u1: 32, vs: -16.4, vn: 10.6, eaveS: 10.5, eaveN: 13.2, ridge: 16.3, ridgeV: -1.7 },
  bell: { u0: -0.5, u1: 6.5, v0: -12.3, v1: -5.0, shaft: 21, stage: 27.4 },   // колокольня (лидар: 33 м)
  clock: { u0: -0.5, u1: 6.0, v0: 4.8, v1: 10.4, top: 21.3 },                 // часовая башня (лидар: 21,5 м)
  front: { v0: -5.0, v1: 4.8, sh: 15.8, apex: 17.6, rose: 9.3 },               // фасад между башнями
  // бастион и лестница (координаты игры)
  slab: [[-522.6, -212.3], [-510.5, -212.8], [-510.5, -182], [-521.6, -182.4]], top: 11.4,
  stair: { a: [-521.0, -212.6], d: [0.9756, -0.2195], w: 5, steps: 45, rise: 0.169, tread: 0.62, landing: 2.4, flight: 15 },
};

// сетка из многоугольников по материалам: quad/poly(mat, точки [x, y, z], внутренняя точка) — грань наружу
// от внутренней точки; beam(mat, p0, p1, w, h) — наклонная балка; flush(group) — меши. UV в метрах (LMK.uv).
function lmChurchMesher() {
  const acc = new Map();
  const put = (mat, a, b, c) => { let A = acc.get(mat); if (!A) acc.set(mat, A = []); A.push(a, b, c); };
  const poly = (mat, P, inside) => {
    const c = [0, 1, 2].map(k => P.reduce((s, p) => s + p[k], 0) / P.length);
    const a = P[0], b = P[1], d = P[2];
    const n = [(b[1] - a[1]) * (d[2] - a[2]) - (b[2] - a[2]) * (d[1] - a[1]), (b[2] - a[2]) * (d[0] - a[0]) - (b[0] - a[0]) * (d[2] - a[2]), (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0])];
    const flip = n[0] * (c[0] - inside[0]) + n[1] * (c[1] - inside[1]) + n[2] * (c[2] - inside[2]) < 0;
    for (let i = 1; i < P.length - 1; i++) flip ? put(mat, P[0], P[i + 1], P[i]) : put(mat, P[0], P[i], P[i + 1]);
  };
  const beam = (mat, p0, p1, w, h) => {
    const dx = p1[0] - p0[0], dz = p1[2] - p0[2], L = Math.hypot(dx, dz) || 1, sx = -dz / L * w / 2, sz = dx / L * w / 2;
    const C = (p, s, t) => [p[0] + sx * s, p[1] + h / 2 * t, p[2] + sz * s];
    const v = [C(p0, -1, -1), C(p0, 1, -1), C(p0, 1, 1), C(p0, -1, 1), C(p1, -1, -1), C(p1, 1, -1), C(p1, 1, 1), C(p1, -1, 1)];
    const mid = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2];
    for (const f of [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [3, 2, 6, 7], [0, 3, 7, 4], [1, 2, 6, 5]]) poly(mat, f.map(i => v[i]), mid);
  };
  const flush = group => {
    const U = LMK.uv;
    for (const [mat, P] of acc) {
      const pos = [], uv = [];
      for (let i = 0; i < P.length; i += 3) {
        const [a, b, c] = [P[i], P[i + 1], P[i + 2]];
        const n = [(b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])];
        const nl = Math.hypot(...n) || 1, ny = n[1] / nl, hl = Math.hypot(n[0], n[2]) || 1, sx = n[0] / hl, sz = n[2] / hl;
        for (const p of [a, b, c]) {
          pos.push(...p);
          if (Math.abs(ny) < 0.6) uv.push((p[0] * -sz + p[2] * sx) / U, p[1] / U);              // стена: вдоль и вверх
          else uv.push((p[0] * -sz + p[2] * sx) / U, (p[0] * sx + p[2] * sz) / Math.max(Math.abs(ny), 0.3) / U);  // скат
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = m.receiveShadow = true;
      group.add(m);
    }
    acc.clear();
  };
  return { poly, beam, flush };
}

const SITGES_LM_CHURCH = {
  ready: true,
  plan(C, L) {},
  build(K, L, group) {
    const D = K.D, gr = (x, z) => D.ground(x, z), Q = LMCH, G = Q.g, B = Q.body;
    const [ex, ez] = Q.e, N = [ez, -ex];                               // e — на восток, N — на север (к суше)
    const W = (u, v) => [Q.f0[0] + u * ex + v * N[0], Q.f0[1] + u * ez + v * N[1]];
    const W3 = (u, v, y) => { const [x, z] = W(u, v); return [x, y, z]; };
    const R = Math.atan2(-ez, ex), F = R + Math.PI / 2;                // поворот: локальная x вдоль нефа / вдоль фасада
    const gmin = pts => Math.min(...pts.map(([x, z]) => gr(x, z))) - 0.6;
    const M = {
      stone: lmMat(0xf2dfc0, { tex: 'stone' }), rubble: lmMat(0xd2bc95, { tex: 'rubble' }), white: lmMat(0xf0e9da, { tex: 'plaster' }),
      tile: lmMat(0xa8603d, { tex: 'tile' }), dark: lmMat(0x26221e, { rough: 0.6 }), blue: lmMat(0x8a9aa6, { tex: 'plaster' }),
    };
    const S = lmChurchMesher();
    const box = (mat, u, v, w, h, d, y, rot = R) => { const [x, z] = W(u, v); return lmBox(group, mat, w, h, d, x, y, z, rot); };
    // окно: тёмная арка в светлой раме (рама выступает, проём утоплен)
    const win = (u, v, y, rot, w, h, f = 0.22) => {
      const [x, z] = W(u, v), outer = lmArch(w + 2 * f, h + 2 * f), hole = new THREE.Path(lmArch(w, h).getPoints().map(p => new THREE.Vector2(p.x, p.y + f)));
      outer.holes.push(hole);
      lmExtrude(group, M.white, outer, 0.3, x, y - f, z, rot);
      lmExtrude(group, M.dark, lmArch(w, h), 0.1, x, y, z, rot);
    };
    const disk = (mat, r, r0, depth, u, v, y, rot = F) => {
      const s = new THREE.Shape().absarc(0, 0, r, 0, Math.PI * 2, false);
      if (r0) s.holes.push(new THREE.Path().absarc(0, 0, r0, 0, Math.PI * 2, true));
      const [x, z] = W(u, v);
      return lmExtrude(group, mat, s, depth, x, y, z, rot);
    };
    const col = (ring, y0, y1) => lmCollide(K, ring, y0, y1);

    /* ---------- корпус: неф с капеллами, несимметричная двускатная крыша ---------- */
    const yb = gmin([W(0, B.vs), W(B.u1, B.vs), W(B.u1, B.vn), W(0, B.vn), W(16, B.vs), W(B.u1 / 2, B.vn)]);
    const eS = G + B.eaveS, eN = G + B.eaveN, rg = G + B.ridge, inC = W3(B.u1 / 2, 0, G + 4);
    const sw = W3(0, B.vs, 0), se = W3(B.u1, B.vs, 0), ne = W3(B.u1, B.vn, 0), nw = W3(0, B.vn, 0);
    const at = (p, y) => [p[0], y, p[2]];
    S.poly(M.stone, [at(sw, yb), at(se, yb), at(se, eS), at(sw, eS)], inC);
    S.poly(M.stone, [at(nw, yb), at(ne, yb), at(ne, eN), at(nw, eN)], inC);
    for (const u of [0, B.u1]) S.poly(M.stone, [W3(u, B.vs, yb), W3(u, B.vn, yb), W3(u, B.vn, eN), W3(u, B.ridgeV, rg), W3(u, B.vs, eS)], inC);
    const o = 0.5, kS = (B.ridge - B.eaveS) / (B.ridgeV - B.vs), kN = (B.ridge - B.eaveN) / (B.vn - B.ridgeV);
    const inR = W3(B.u1 / 2, B.ridgeV, G + 8);
    S.poly(M.tile, [W3(-0.2, B.vs - o, eS - o * kS), W3(B.u1 + 0.3, B.vs - o, eS - o * kS), W3(B.u1 + 0.3, B.ridgeV, rg), W3(-0.2, B.ridgeV, rg)], inR);
    S.poly(M.tile, [W3(-0.2, B.vn + o, eN - o * kN), W3(B.u1 + 0.3, B.vn + o, eN - o * kN), W3(B.u1 + 0.3, B.ridgeV, rg), W3(-0.2, B.ridgeV, rg)], inR);
    col([W(0, B.vs), W(B.u1, B.vs), W(B.u1, B.vn), W(0, B.vn)], yb, eS);
    // контрфорсы и высокие окна
    for (const u of [8.5, 15, 21.5, 28]) { box(M.stone, u, B.vn + 0.6, 1.4, G + 10.5 - yb, 1.2, yb); box(M.stone, u, B.vn + 0.35, 1.4, 1.2, 0.7, G + 10.5); }
    for (const u of [9, 15.5, 22, 28.5]) box(M.stone, u, B.vs - 0.6, 1.4, G + 7.5 - yb, 1.2, yb);
    for (const u of [12, 18.5, 25]) { win(u, B.vs, G + 4.5, R, 1.2, 3.0); win(u, B.vn, G + 6, R, 1.2, 3.0); }

    /* ---------- хор, восточный объём, пристройки ---------- */
    const yc = gmin([W(32, -12), W(48, -12), W(48, 2), W(32, 2)]);
    const ch = { u0: B.u1, u1: 40, v0: -8.2, v1: 1.5 }, chE = G + 13.7, chR = G + 16.3, chV = (ch.v0 + ch.v1) / 2;
    const inH = W3(36, chV, G + 4);
    S.poly(M.stone, [W3(ch.u0, ch.v0, yc), W3(ch.u1, ch.v0, yc), W3(ch.u1, ch.v0, chE), W3(ch.u0, ch.v0, chE)], inH);
    S.poly(M.stone, [W3(ch.u0, ch.v1, yc), W3(ch.u1, ch.v1, yc), W3(ch.u1, ch.v1, chE), W3(ch.u0, ch.v1, chE)], inH);
    S.poly(M.tile, [W3(ch.u0, ch.v0 - 0.4, chE - 0.2), W3(ch.u1, ch.v0 - 0.4, chE - 0.2), W3(ch.u1, chV, chR), W3(ch.u0, chV, chR)], W3(36, chV, G));
    S.poly(M.tile, [W3(ch.u0, ch.v1 + 0.4, chE - 0.2), W3(ch.u1, ch.v1 + 0.4, chE - 0.2), W3(ch.u1, chV, chR), W3(ch.u0, chV, chR)], W3(36, chV, G));
    col([W(ch.u0, ch.v0), W(ch.u1, ch.v0), W(ch.u1, ch.v1), W(ch.u0, ch.v1)], yc, chE);
    // высокий восточный объём: стены до 31 м над уровнем моря (лидар), вальма до 34,9
    const eb = [W(40, -10.5), W(47.7, -10.5), W(47.7, 1.5), W(40, 1.5)], ebTop = 31.0;
    lmPrism(group, M.stone, eb, yc, ebTop, { cap: true });
    const [ecx, ecz] = W(43.85, -4.5);
    lmRoof(group, M.tile, { cx: ecx, cz: ecz, ux: N[0], uz: N[1], vx: ex, vz: ez, len: 12, wid: 7.7 }, ebTop, { kind: 'hip', pitch: 38, over: 0.35 });
    col(eb, yc, ebTop);
    for (const u of [42, 45.6]) win(u, -10.5, G + 10, R, 1.0, 2.6);
    // южная пристройка у хора (7 м) и северные — по контурам кадастра (вплотную к Марисель)
    const sa = [W(32, -12), W(40, -12), W(40, -8.2), W(32, -8.2)];
    lmPrism(group, M.stone, sa, yc, G + 7.2); col(sa, yc, G + 7.2);
    for (const [k, top, roof] of [[7, 24.4, true], [0, 24.4, true], [6, 21.2, false]]) {
      const h = L.parts[k]; if (!h) continue;
      const ring = h.rings[0], y0 = gmin(ring);
      lmPrism(group, M.stone, ring, y0, top, { cap: !roof });
      if (roof) lmRoof(group, M.tile, lmFrame(ring), top, { kind: 'hip', pitch: 18, over: 0.25 });
      col(ring, y0, top);
    }

    /* ---------- фасад: фронтон, роза, портик ---------- */
    const fr = Q.front, c = (fr.v0 + fr.v1) / 2, ybF = gmin([W(0, fr.v0), W(0, fr.v1), W(-3.5, c)]) - G;
    {
      const s = new THREE.Shape(), m = (fr.v1 - fr.v0) / 2;
      // криволинейный фронтон: плечи у башен, вогнутый и выпуклый изгибы к вершине (локальная x — на север)
      s.moveTo(fr.v0, ybF); s.lineTo(fr.v1, ybF); s.lineTo(fr.v1, fr.sh);
      s.lineTo(c + m * 0.72, fr.sh); s.quadraticCurveTo(c + m * 0.42, fr.sh + 0.1, c + m * 0.3, fr.sh + 0.9);
      s.quadraticCurveTo(c + m * 0.18, fr.apex, c, fr.apex);
      s.quadraticCurveTo(c - m * 0.18, fr.apex, c - m * 0.3, fr.sh + 0.9); s.quadraticCurveTo(c - m * 0.42, fr.sh + 0.1, c - m * 0.72, fr.sh);
      s.lineTo(fr.v0, fr.sh); s.lineTo(fr.v0, ybF);
      const [x, z] = W(0.1, 0);
      lmExtrude(group, M.stone, s, 1.2, x, G, z, F);
      for (const [dv, y] of [[m * 0.95, fr.sh], [m * 0.72, fr.sh], [m * 0.3, fr.sh + 0.9], [0, fr.apex]]) for (const sg of dv ? [1, -1] : [1]) {
        const [bx, bz] = W(-0.3, c + sg * dv);
        lmBox(group, M.white, 0.35, 0.35, 0.35, bx, G + y, bz, R);
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 4), M.white); ball.position.set(bx, G + y + 0.55, bz); ball.castShadow = true; group.add(ball);
      }
    }
    const fu = -0.5;                                                    // лицевая плоскость фасада и башен
    disk(M.white, 1.95, 1.4, 0.45, fu, c, G + fr.rose);
    disk(M.dark, 1.4, 0, 0.12, fu, c, G + fr.rose);
    for (const a of [0, Math.PI / 2]) { const [x, z] = W(fu - 0.08, c); const b = lmBox(group, M.white, 2.8, 0.12, 0.12, x, G + fr.rose - 0.06, z, F); b.rotation.set(0, F, 0); b.rotateZ(a); b.position.y = G + fr.rose; }
    win(fu, c - 3.4, G + 1.4, F, 0.7, 1.8);
    // портик: белый, арочная дверь, пилястры, карниз
    const pw = 5.2, pd = 3.0, ph = 4.3, pu = fu - pd / 2;
    box(M.white, pu, c, pd, G + ph - ybF - G, pw, G + ybF);
    box(M.white, pu - 0.15, c, pd + 0.4, 0.35, pw + 0.5, G + ph);
    box(M.white, pu, c, pd - 0.4, 0.8, pw - 1.6, G + ph + 0.35);
    for (const sg of [1, -1]) box(M.white, fu - pd - 0.15, c + sg * 2.05, 0.3, ph, 0.55, G);
    win(fu - pd, c, G, F, 2.0, 3.3, 0.25);
    lmCollideBox(K, ...W(pu, c), pd, pw, R, G + ybF, G + ph);

    /* ---------- колокольня ---------- */
    const bl = Q.bell, bu = (bl.u0 + bl.u1) / 2, bv = (bl.v0 + bl.v1) / 2, bw = bl.u1 - bl.u0, bd = bl.v1 - bl.v0;
    const ybB = gmin([W(bl.u0, bl.v0), W(bl.u1, bl.v0), W(bl.u0, bl.v1), W(bl.u1, bl.v1)]);
    box(M.stone, bu, bv, bw, G + bl.shaft - ybB, bd, ybB);
    box(M.white, bu, bv, bw + 0.3, 0.3, bd + 0.3, G + 13.5);
    box(M.white, bu, bv, bw + 0.6, 0.5, bd + 0.6, G + bl.shaft);
    lmCollideBox(K, ...W(bu, bv), bw, bd, R, ybB, G + bl.shaft);
    win(bl.u0, bv, G + 10.5, F, 0.6, 1.5);
    win(bl.u0, bv, G + 16, F, 0.6, 1.5);
    const sw2 = bw - 0.7, sd2 = bd - 0.7, y2 = G + bl.shaft + 0.5;
    box(M.stone, bu, bv, sw2, bl.stage - bl.shaft - 0.5, sd2, y2);
    for (const [u, v, r] of [[bu - sw2 / 2, bv, F], [bu + sw2 / 2, bv, F], [bu, bv - sd2 / 2, R], [bu, bv + sd2 / 2, R]]) win(u, v, y2 + 1.0, r, 1.5, 3.4);
    const y3 = G + bl.stage;
    box(M.white, bu, bv, sw2 + 0.7, 0.45, sd2 + 0.7, y3);
    // балюстрада по краю яруса
    for (const [du, dv, w, d] of [[0, sd2 / 2, sw2 + 0.5, 0.25], [0, -sd2 / 2, sw2 + 0.5, 0.25], [sw2 / 2, 0, 0.25, sd2 + 0.5], [-sw2 / 2, 0, 0.25, sd2 + 0.5]]) {
      box(M.white, bu + du, bv + dv, w, 0.75, d, y3 + 0.45);
      for (const sg of [1, -1]) box(M.white, bu + (w > 1 ? sg * w / 2 : du), bv + (w > 1 ? dv : sg * d / 2), 0.4, 1.0, 0.4, y3 + 0.45);
    }
    const [tx, tz] = W(bu, bv);
    const drum = lmCyl(group, M.stone, 2.4, 2.6, tx, y3 + 0.45, tz, { seg: 8 }); drum.rotation.y = R + Math.PI / 8;
    const cor = lmCyl(group, M.white, 2.7, 0.3, tx, y3 + 3.05, tz, { seg: 8 }); cor.rotation.y = R + Math.PI / 8;
    for (let k = 0; k < 4; k++) {
      const a = R + k * Math.PI / 2, [ox, oz] = [Math.cos(a) * 2.35, -Math.sin(a) * 2.35];
      lmExtrude(group, M.dark, lmArch(0.7, 1.4), 0.12, tx + ox, y3 + 1.0, tz + oz, a + Math.PI / 2);
    }
    {
      const P = [[2.5, 0], [2.4, 0.6], [2.1, 1.25], [1.6, 1.75], [0.9, 2.1], [0.5, 2.2], [0.5, 2.9], [0.7, 3.0], [0.25, 3.3], [0.25, 3.8], [0.12, 4.3], [0, 4.6]].map(([r, y]) => new THREE.Vector2(r, y));
      const geo = new THREE.LatheGeometry(P, 8), m = new THREE.Mesh(geo, M.stone);
      m.position.set(tx, y3 + 3.35, tz); m.rotation.y = R + Math.PI / 8; m.castShadow = m.receiveShadow = true; group.add(m);
    }

    /* ---------- часовая башня с кованой клеткой ---------- */
    const ck = Q.clock, cu = (ck.u0 + ck.u1) / 2, cv = (ck.v0 + ck.v1) / 2, cw = ck.u1 - ck.u0, cd = ck.v1 - ck.v0;
    const ybC = gmin([W(ck.u0, ck.v0), W(ck.u1, ck.v0), W(ck.u0, ck.v1), W(ck.u1, ck.v1)]);
    box(M.stone, cu, cv, cw, G + ck.top - ybC, cd, ybC);
    box(M.white, cu, cv, cw + 0.5, 0.45, cd + 0.5, G + ck.top);
    lmCollideBox(K, ...W(cu, cv), cw, cd, R, ybC, G + ck.top);
    disk(M.white, 0.85, 0, 0.2, ck.u0, cv, G + 18.4);
    disk(M.dark, 1.0, 0.85, 0.26, ck.u0, cv, G + 18.4);
    box(M.dark, ck.u0 - 0.12, cv, 0.05, 0.6, 0.08, G + 18.4);
    box(M.dark, ck.u0 - 0.12, cv + 0.2, 0.05, 0.08, 0.45, G + 18.4);
    win(ck.u0, cv, G + 11, F, 0.6, 1.5);
    win(cu, ck.v1, G + 14, R, 0.6, 1.5);
    {
      const [x, z] = W(cu, cv), y = G + ck.top + 0.45;
      lmBox(group, M.dark, 2.6, 0.25, 2.6, x, y, z, R);
      for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; lmBox(group, M.dark, 0.09, 2.3, 0.09, x + Math.cos(a) * 1.05, y + 0.25, z + Math.sin(a) * 1.05); }
      lmCyl(group, M.dark, 1.15, 0.15, x, y + 1.3, z, { seg: 8 });
      lmCyl(group, M.dark, 1.15, 0.9, x, y + 2.55, z, { seg: 8, top: 0.25 });
      lmCyl(group, M.dark, 0.5, 0.7, x, y + 1.0, z, { seg: 8, top: 0.3 });
      lmBox(group, M.dark, 0.08, 1.4, 0.08, x, y + 3.45, z);
      lmBox(group, M.dark, 0.7, 0.35, 0.04, x + 0.25, y + 4.3, z, R);
    }

    /* ---------- пристройка южнее колокольни ---------- */
    {
      const v0 = B.vs, v1 = bl.v0, pv = (v0 + v1) / 2, ya = gmin([W(bl.u0, v0), W(bl.u1, v0)]);
      box(M.stone, (bl.u0 + bl.u1) / 2, pv, bw, G + 9.6 - ya, v1 - v0, ya);
      box(M.white, (bl.u0 + bl.u1) / 2, pv, bw + 0.3, 0.3, v1 - v0 + 0.3, G + 9.6);
      win(bl.u0, pv, G + 4.2, F, 1.2, 2.6);
      win(bl.u0, pv, G, F, 1.4, 2.6);
      lmCollideBox(K, ...W((bl.u0 + bl.u1) / 2, pv), bw, v1 - v0, R, ya, G + 9.6);
    }

    /* ---------- бастион: плита над откосом, бутовая стена, парапет ---------- */
    const T = Q.top, sl = Q.slab;
    lmPrism(group, M.rubble, sl, 1.0, T - 0.2, { cap: false });
    lmPrism(group, M.stone, sl, T - 0.2, T, { cap: true });
    col(sl, 1.0, T);
    const seg = (mat, a, b, y0, h, t) => {
      const L2 = Math.hypot(b[0] - a[0], b[1] - a[1]);
      return lmBox(group, mat, L2, h, t, (a[0] + b[0]) / 2, y0, (a[1] + b[1]) / 2, Math.atan2(-(b[1] - a[1]), b[0] - a[0]));
    };
    const inset = (a, b, d) => { const L2 = Math.hypot(b[0] - a[0], b[1] - a[1]), qx = -(b[1] - a[1]) / L2 * d, qz = (b[0] - a[0]) / L2 * d; return [[a[0] + qx, a[1] + qz], [b[0] + qx, b[1] + qz]]; };
    for (const [a, b] of [[sl[1], sl[2]], [[-517, -212.5], sl[1]]]) {
      const [p, q] = inset(a, b, 0.3), L2 = Math.hypot(q[0] - p[0], q[1] - p[1]), rot = Math.atan2(-(q[1] - p[1]), q[0] - p[0]);
      seg(M.rubble, p, q, T, 0.9, 0.55); seg(M.white, p, q, T + 0.9, 0.12, 0.7);
      lmCollideBox(K, (p[0] + q[0]) / 2, (p[1] + q[1]) / 2, L2, 0.6, rot, T - 0.5, T + 1.0);
    }

    /* ---------- лестница к нижней площади: 3 марша, балюстрада, столбы ---------- */
    {
      const st = Q.stair, [dx, dz] = st.d, sx = -dz, sz = dx, rot = Math.atan2(-dz, dx);   // (sx, sz) — к северу
      const P = (s, o) => [st.a[0] + dx * s + sx * o, st.a[1] + dz * s + sz * o];
      let s = 0, y = T - 0.05, last = 0;
      const rails = [[], []], posts = [];
      for (let i = 0; i < st.steps; i++) {
        const land = (i + 1) % st.flight === 0 && i < st.steps - 1, len = st.tread + (land ? st.landing : 0);
        const ny = y - st.rise, [mx, mz] = P(s + len / 2, 0), gm = gmin([P(s, -st.w / 2), P(s + len, -st.w / 2), P(s, st.w / 2), P(s + len, st.w / 2)]);
        if (ny < gr(mx, mz) + 0.02) break;
        lmBox(group, M.white, len, 0.15, st.w, mx, ny - 0.15, mz, rot);
        lmBox(group, M.rubble, len, ny - 0.15 - gm, st.w + 0.6, mx, gm, mz, rot);
        lmCollideBox(K, mx, mz, len, st.w + 0.6, rot, gm, ny);
        for (const [k, o] of [[0, st.w / 2 + 0.15], [1, -st.w / 2 - 0.15]]) {
          const [ax, az] = P(s, o), [bx2, bz2] = P(s + len, o);
          rails[k].push([ax, ny, az], [bx2, ny, bz2]);
        }
        if (i === 0) posts.push([s, y]);
        if (land) posts.push([s + len, ny]);
        s += len; y = ny; last = s;
      }
      posts.push([last, y]);
      const S2 = lmChurchMesher();
      for (const r of rails) {
        // плинт и перила — наклонные балки по ступеням (на площадках — горизонтальные), балясины через 0,4 м
        for (let k = 0; k < r.length; k += 2) {
          const a = r[k], b = r[k + 1], nb = r[k + 2] || b;
          S2.beam(M.white, [a[0], a[1] + 0.12, a[2]], [b[0], b[1] + 0.12, b[2]], 0.34, 0.24);
          S2.beam(M.white, [a[0], a[1] + 0.95, a[2]], [b[0], nb[1] + 0.95, b[2]], 0.3, 0.12);
          const L2 = Math.hypot(b[0] - a[0], b[2] - a[2]), n = Math.max(1, Math.round(L2 / 0.4));
          for (let q = 0; q < n; q++) { const t = (q + 0.5) / n; lmBox(group, M.blue, 0.13, 0.65, 0.13, a[0] + (b[0] - a[0]) * t, a[1] + 0.24, a[2] + (b[2] - a[2]) * t, rot); }
        }
      }
      S2.flush(group);
      for (const [ps, py] of posts) for (const o of [st.w / 2 + 0.15, -st.w / 2 - 0.15]) {
        const [px, pz] = P(ps, o), yy = Math.max(gr(px, pz), py);
        lmBox(group, M.white, 0.55, 1.25, 0.55, px, yy, pz, rot);
        lmCyl(group, M.white, 0.2, 2.2, px, yy + 1.25, pz, { seg: 6, top: 0.1 });
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 4), M.white); b.position.set(px, yy + 3.6, pz); group.add(b);
      }
      // перила — столкновения по маршам
      for (const o of [st.w / 2 + 0.15, -st.w / 2 - 0.15]) for (let f = 0; f * (st.flight * st.tread + st.landing) < last; f++) {
        const s0 = f * (st.flight * st.tread + st.landing), s1 = Math.min(last, s0 + st.flight * st.tread), [mx, mz] = P((s0 + s1) / 2, o);
        lmCollideBox(K, mx, mz, s1 - s0, 0.35, rot, 0, T - st.rise * st.flight * f + 1.0);
      }
    }
    S.flush(group);
  },
};
