// Ситжес — достопримечательность: жилой дом C/ Enric Morera 30 (1968, здание кадастра по точке) — дом, где жил создатель
// игры. Вид по фото пользователя и Street View (raw/photos/landmarks/em30, sv-index.md там же), высоты — лидар
// «рельеф + здания» (карниз ≈ 11,3 м над землёй, вальма ≈ 19°, у улицы — плоская терраса). Архив — docs/sitges/lm-em30.md.
//   Белая штукатурка, 4 этажа; на длинных фасадах и у улицы — сплошные балконы: 1-й этаж — белые балясины, 2-й — белый
//   бортик и зелёное стекло, 3-й — лоджия под карнизом со стеклом и зелёными маркизами. Торец к улице — балконы
//   на всю ширину, бок части у улицы к −x — кирпич. Основная часть — вальма из черепицы с трубой, часть у улицы — плоская.
//   Заборы квартала (Enric Morera, Socias, Pintor Sisquella и нижняя улица) — по фото, fences(C, L) после калиток:
//   № 30 — изгородь на белом цоколе, белые ворота и зелёная калитка с ламелями, фонари на столбах; № 28 — решётка
//   из блоков у калитки, дальше белая стена с вересковой ширмой (и по Socias); угол с Sisquella — серо-зелёные ламели
//   на белом цоколе со столбами; остальные участки квартала — изгородь на белом цоколе.
// Определяет: SITGES_LM_EM30.
// Использует: sitgesArea, sitgesInPoly (js/maps/sitges/geom.js); lmCEdges, lmCWin (js/maps/sitges/lm/station.js);
//   lmFenceAt, lmFencePoint, lmFenceSplit, lmGateSet (js/maps/sitges/landmarks.js); SITGES_GATE
//   (js/maps/sitges/gates.js); lmMat, lmFrame, lmPrism, lmCollide, lmRoof, lmBox, lmInset, lmCyl
//   (js/maps/sitges/landmarks3d.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const SITGES_LM_EM30 = {
  ready: true,
  eave: 11.3,          // карниз над низом стен, м (лидар: 15,0 при земле 3,7)
  floors: 4,
  pitch: 19,           // уклон вальмы, ° (конёк ≈ 1,8 м над карнизом)
  depth: 1.3,          // вынос балконов, м
  // заборы квартала: точка на линии забора → стиль куска (split — отрезать хвост куска от s м: свой стиль хвоста)
  white: 0xf0ede6,
  fenceStyles: [
    // № 30: изгородь вплотную к тротуару
    { at: [895, -41], style: { base: 'white', top: 'hedge', h0: 0.4, h1: 2.0, posts: 'none', color: 0x3d5c2c } },
    // № 28 (Carriló): у калитки № 30 — решётка из блоков с крестиками, дальше и по Socias — вересковая ширма
    { at: [880, -46], style: { base: 'white', top: 'lattice', h0: 1.15, h1: 1.45, posts: 'none', color: 0xf0ede6 },
      from: [885, -44], split: 6.5, tail: { base: 'white', top: 'heath', h0: 1.1, h1: 2.0, posts: 'none', color: 0x6e5d4b } },
    // Socias 15: та же ширма
    { at: [861, 0], style: { base: 'white', top: 'heath', h0: 1.1, h1: 2.0, posts: 'none', color: 0x6e5d4b } },
    // угол Enric Morera × Pintor Sisquella: серо-зелёные ламели на белом цоколе, белые столбы
    { at: [921, -20], style: { base: 'white', top: 'slats', h0: 1.0, h1: 1.9, posts: 'plaster', color: 0x8b9080 }, leaf: 'slats' },
    // угол Socias × нижняя улица, низ Pintor Sisquella и нижняя улица: изгородь (плющ) на белом цоколе
    { at: [861.5, 25], style: { base: 'white', top: 'hedge', h0: 0.5, h1: 2.0, posts: 'none', color: 0x4a6a34 } },
    { at: [900, 37], style: { base: 'white', top: 'hedge', h0: 0.3, h1: 2.0, posts: 'none', color: 0x3f5a2e } },
    { at: [921, 18], style: { base: 'white', top: 'hedge', h0: 0.3, h1: 2.0, posts: 'none', color: 0x3f5a2e } },
  ],

  plan(C, L) {},

  // после калиток (sitgesLandmarkFences): стили заборов квартала, ворота и калитка № 30, места фонарей
  fences(C, L) {
    const D = this, done = new Set();
    const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
    for (const o of D.fenceStyles) {
      const fi = lmFenceAt(C, o.at[0], o.at[1]);
      if (fi < 0 || done.has(fi)) continue;
      done.add(fi);
      const f = C.fences[fi];
      f.style = Object.assign({}, o.style);
      if (o.leaf) for (const g of C.gates) if (g.f === fi) g.leaf = { type: o.leaf, color: o.style.color };
      if (o.split) {
        // split м от конца у from — стиль style, остальное — tail
        const len = lmFencePoint(f, 0).len, head = dist(f.P[0], o.from) < dist(f.P.at(-1), o.from);
        const ti = lmFenceSplit(C, fi, head ? o.split : len - o.split);
        if (ti >= 0) { done.add(ti); (head ? C.fences[ti] : f).style = Object.assign({}, o.tail); }
      }
    }
    // № 30: от решётки № 28 — общий столб, зелёная калитка с ламелями, столб с фонарём, белые ворота, столб с фонарём
    const fi = lmFenceAt(C, 895, -41), f = C.fences[fi], len = lmFencePoint(f, 0).len;
    const near28 = Math.hypot(f.P[0][0] - 880, f.P[0][1] + 46) < Math.hypot(f.P.at(-1)[0] - 880, f.P.at(-1)[1] + 46);
    const ss = d => near28 ? d : len - d;                       // расстояние от конца у № 28 → s куска
    const own = C.gates.map((g, i) => [g, i]).filter(([g]) => g.f === fi);
    const wk = own.find(([g]) => g.kind === 'wicket'), car = own.find(([g]) => g.kind === 'car');
    const post = SITGES_GATE.post, cw = 3.0;
    if (wk) lmGateSet(C, wk[1], { s: ss(0.7), w: 1.0, leaf: { type: 'slats', color: 0x5f9a6e } });
    if (car) lmGateSet(C, car[1], { s: ss(1.2 + post + cw / 2), w: cw, leaf: { type: 'sheet', color: 0xf2f0ea } });
    // фонари: на общем столбе калитки и ворот и на столбе по другую сторону ворот
    L.lamps = [1.2 + post / 2, 1.2 + post + cw + post / 2].map(d => { const p = lmFencePoint(f, ss(d)); return [p.x + p.n[0] * 0.12, p.z + p.n[1] * 0.12]; });
    L.lampH = Math.max(f.style.h1, 2.0) + 0.16;
  },

  build(K, L, group) {
    const C = K.D.C, D = this, g = group;
    const wall = lmMat(D.white, { tex: 'plaster' }), brick = lmMat(0xa8644a, { tex: 'brick' }), tile = lmMat(0xb2603e, { tex: 'tile' }),
      win = lmMat(0x23292e, { rough: 0.35 }), glass = lmMat(0xbfe0cf, { alpha: 0.5, rough: 0.15, side: THREE.DoubleSide }),
      awn = lmMat(0x2f7d5b, { side: THREE.DoubleSide });
    const M = { win };
    const area = h => Math.abs(sitgesArea(h.rings[0]));
    const P1 = L.parts.reduce((a, h) => area(a) >= area(h) ? a : h), P2 = L.parts.find(h => h !== P1);
    const base = Math.max(P1.base ?? P1.y0, P1.y0), Y1 = base + D.eave, fh = D.eave / D.floors;
    const F1 = lmFrame(P1.rings[0]);
    const noShadow = m => { m.castShadow = false; return m; };
    // отрезок стены t0…t1 (доли ребра) → центр, длина
    const span = (e, t0, t1, out = 0) => { const [ax, az] = e.at(t0), [bx, bz] = e.at(t1); return { x: (ax + bx) / 2 + e.nx * out, z: (az + bz) / 2 + e.nz * out, w: e.len * (t1 - t0) }; };

    /* ---------- стены, крыши, столкновения ---------- */
    for (const h of L.parts) {
      const top = h === P1 ? Y1 : Y1 + 0.3;
      lmPrism(g, wall, h.rings[0], h.y0 - 0.5, top);
      lmCollide(K, h.rings[0], h.y0 - 1, top);
    }
    lmRoof(g, tile, F1, Y1, { kind: 'hip', pitch: D.pitch, over: 0.6 });
    const ridge = Y1 + Math.tan(D.pitch * Math.PI / 180) * F1.wid / 2;
    lmBox(g, wall, 0.7, ridge - Y1 + 0.9, 0.7, F1.cx, Y1, F1.cz, F1.rot);                       // труба
    lmBox(g, tile, 0.9, 0.12, 0.9, F1.cx, ridge + 0.9, F1.cz, F1.rot);
    if (P2) {
      // плоская часть у улицы: черепичный свес, будка выхода на террасу
      lmPrism(g, tile, lmInset(P2.rings[0], -0.5), Y1 - 0.35, Y1 - 0.05, { bottom: true });
      const F2 = lmFrame(P2.rings[0]);
      lmBox(g, wall, 2.4, 2.3, 2.4, F2.cx, Y1 + 0.3, F2.cz, F2.rot);
      lmBox(g, tile, 2.8, 0.15, 2.8, F2.cx, Y1 + 2.6, F2.cz, F2.rot);
    }

    /* ---------- фасады ---------- */
    // рёбра части без общих с другой частью дома
    const edgesOf = h => lmCEdges(h.rings[0]).filter(e => !L.parts.some(o => o !== h && sitgesInPoly(...e.at(0.5).map((v, k) => v + (k ? e.nz : e.nx) * 0.4), o.rings[0])));
    const faces = [];   // { e, t0, t1, kind: 'balc' | 'brick' | 'win' }
    for (const e of edgesOf(P1)) {
      if (e.len < 1) continue;
      faces.push({ e, t0: 0, t1: 1, kind: e.len > 12 ? 'balc' : 'win' });
    }
    if (P2) {
      // торец к улице — ребро, дальнее от основной части
      const es = edgesOf(P2).filter(e => e.len > 1);
      const far = es.reduce((a, e) => { const [x, z] = e.at(0.5), d = (x - F1.cx) * e.nx + (z - F1.cz) * e.nz; return !a || d > a.d ? { e, d } : a; }, null).e;
      for (const e of es) {
        // торец к улице — балконы на всю ширину; кирпич — только бок к −x
        if (e === far) faces.push({ e, t0: 0, t1: 1, kind: 'balc', end: true });
        else if (e.len > 4) faces.push({ e, t0: 0, t1: 1, kind: e.nx < 0 ? 'brick' : 'balc', door: e.nx > 0 });
        else faces.push({ e, t0: 0, t1: 1, kind: 'win' });
      }
    }

    for (const fc of faces) {
      const { e, t0, t1 } = fc, flen = e.len * (t1 - t0);
      const top = L.parts.includes(P2) && P2.rings[0].includes(e.a) ? Y1 + 0.3 : Y1;
      if (fc.kind === 'brick') {
        const s = span(e, t0, t1, 0.05);
        lmBox(g, brick, s.w + 0.1, top - base + 0.5, 0.1, s.x, base - 0.5, s.z, e.rot);
        continue;
      }
      // окна по этажам (первый — окна; на балконных фасадах выше — двери на балкон)
      const step = 3.2, n = Math.max(1, Math.floor((flen - 0.6) / step));
      for (let i = 0; i < n; i++) {
        const t = t0 + (t1 - t0) * (i + 0.5) / n, [x, z] = e.at(t);
        for (let f = 0; f < D.floors; f++) {
          const fy = base + f * fh;
          if (fc.kind === 'balc' && f > 0) {
            lmCWin(g, M, e, x, z, fy + 0.05, 1.5, 2.1, { frame: 0 });
            lmBox(g, wall, 1.6, 0.25, 0.14, x + e.nx * 0.07, fy + 2.15, z + e.nz * 0.07, e.rot);    // короб рольставни
          } else if (f === 0 && fc.door && i === 0) {
            lmCWin(g, M, e, x, z, fy - 0.3, 1.4, 2.4, { frame: 0 });                                // подъезд
            lmBox(g, wall, 2.2, 0.15, 1.2, x + e.nx * 0.6, fy + 2.3, z + e.nz * 0.6, e.rot);       // козырёк
          } else lmCWin(g, M, e, x, z, fy + 0.85, 1.2, 1.3, { frame: 0 });
        }
      }
      if (fc.kind !== 'balc') continue;

      // балконы: этажи 1–2 — плита с выносом, 3 — лоджия (стекло по стене) и маркиза под карнизом
      const dp = D.depth, a0 = t0 + 0.3 / e.len, a1 = t1 - 0.3 / e.len, sw = e.len * (a1 - a0);
      const k = Math.max(1, Math.round(sw / 6.5));                                                // квартиры: перегородки
      for (let f = 1; f < D.floors; f++) {
        const fy = base + f * fh;
        if (f < D.floors - 1) {
          const s = span(e, a0, a1, dp / 2);
          lmBox(g, wall, sw, 0.18, dp, s.x, fy - 0.18, s.z, e.rot);                              // плита
          const r = span(e, a0, a1, dp - 0.04);
          if (f === 1) {
            // белые балясины и поручень
            const nb = Math.round(sw / 0.2);
            for (let j = 0; j <= nb; j++) {
              const [bx, bz] = e.at(a0 + (a1 - a0) * j / nb);
              lmBox(g, wall, 0.07, 0.85, 0.07, bx + e.nx * (dp - 0.06), fy, bz + e.nz * (dp - 0.06), e.rot);
            }
            lmBox(g, wall, sw, 0.08, 0.14, r.x, fy + 0.85, r.z, e.rot);
          } else {
            lmBox(g, wall, sw, 0.35, 0.08, r.x, fy, r.z, e.rot);                                 // бортик
            noShadow(lmBox(g, glass, sw, 0.62, 0.03, r.x, fy + 0.35, r.z, e.rot));               // стекло
            lmBox(g, wall, sw, 0.05, 0.08, r.x, fy + 0.97, r.z, e.rot);                          // поручень
          }
          // боковые стенки на концах и перегородки между квартирами
          for (let j = 0; j <= k; j++) {
            const [bx, bz] = e.at(a0 + (a1 - a0) * j / k);
            lmBox(g, wall, 0.1, j === 0 || j === k ? 1.0 : 1.9, dp, bx + e.nx * dp / 2, fy, bz + e.nz * dp / 2, e.rot);
          }
        } else {
          const r = span(e, a0, a1, 0.06);
          lmBox(g, wall, sw, 0.3, 0.1, r.x, fy, r.z, e.rot);
          noShadow(lmBox(g, glass, sw, 0.65, 0.03, r.x, fy + 0.3, r.z, e.rot));
          lmBox(g, wall, sw, 0.05, 0.1, r.x, fy + 0.95, r.z, e.rot);
          // маркиза: полотно от стены под карнизом наружу и вниз, спереди — фестон
          const tilt = 0.42, len = 1.25, ay = Y1 - 0.35;
          const m = span(e, a0, a1, len * Math.cos(tilt) / 2);
          const aw = lmBox(g, awn, sw, 0.03, len, m.x, ay - len * Math.sin(tilt) / 2, m.z, e.rot);
          // локальная +z меша — по нормали наружу или против неё
          const sz = Math.sign(Math.sin(e.rot) * e.nx + Math.cos(e.rot) * e.nz) || 1;
          aw.rotation.order = 'YXZ'; aw.rotation.x = tilt * sz;
          const fr = span(e, a0, a1, len * Math.cos(tilt));
          lmBox(g, awn, sw, 0.22, 0.02, fr.x, ay - len * Math.sin(tilt) - 0.22, fr.z, e.rot);
        }
      }
    }

    /* ---------- фонари на столбах ворот № 30 ---------- */
    for (const [x, z] of L.lamps || []) {
      const y = Math.max(K.walkAt(x, z), K.D.ground(x, z)) + L.lampH;
      lmCyl(g, wall, 0.09, 0.12, x, y, z, { seg: 8 });
      noShadow(lmCyl(g, glass, 0.11, 0.3, x, y + 0.12, z, { seg: 8, top: 0.13 }));
      lmCyl(g, wall, 0.17, 0.08, x, y + 0.42, z, { seg: 8, top: 0.04 });
    }
  },
};
