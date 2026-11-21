// Ситжес — достопримечательность: марина Айгуадольс (Port d’Aiguadolç) (этап 6, docs/sitges/stage-5.md, архив lm-e.md).
// Зданий в SITGES_LM нет (at: []) — plan() берёт сам:
//   капитания — части здания кадастра порта (весь порт — одно здание) в SITGES_LM_MARINA.cap.r м от точки cap;
//     белые корпуса 1–2 этажа с вальмовой черепицей и синими рамами, круглая белая башня (по лидару Ø ≈ 5,6 м,
//     13,4 м над землёй; в кадастре её нет) с арочными окнами в каменных рамах (фото aiguadolc/h-port-01, c-02);
//   маяки — на концах молов (точка, где кончается суша при движении от start по dir): внешний — белый столб
//     с зелёным верхом (Street View sv-01), внутренний — с красным (sv-03: белый столб; цвет — по правилу МАМС A);
//   лодки — у понтонов (линии pier OSM, по обе стороны, кормой к понтону) и у причалов молов (линии quays: от точки
//     на суше в сторону n до воды), тумбы — на кромке причалов, пальмы — по внутреннему молу (фото h-port-06, c-01).
// Лодки, мачты, тумбы, пальмы, цветные верхи маяков — InstancedMesh одного материала (цвет — instanceColor).
// Определяет: SITGES_LM_MARINA.
// Использует: mulberry32 (js/world.js); sitgesInPoly, sitgesArea (js/maps/sitges/geom.js); SITGES_G
//   (js/maps/sitges/ground.js); lmFrame, lmMat, lmPrism, lmRoof, lmCollide, lmBox, lmCyl, lmExtrude, lmArch,
//   lmCollideBox (js/maps/sitges/landmarks3d.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const SITGES_LM_MARINA = {
  ready: true,
  cap: { at: [-1652.3, -593.3], r: 13 },                  // капитания: точка в корпусе, радиус сбора частей
  tower: { x: -1652.3, z: -605.0, r: 2.85, top: 2.6, h: 13.4 },   // башня (лидар): центр, радиусы низа и верха, высота
  lights: [{ start: [-1450, -803], dir: [1, 0], col: 0x2f8a3e }, { start: [-1540, -700], dir: [-1, 0], col: 0xc23a2e }],
  // причалы молов: [точка на суше, точка на суше, направление к воде]
  quays: [
    [[-1525, -697], [-1330, -667], [0, 1]],     // внутренний мол, сторона к бассейну
    [[-1678, -806], [-1585, -806], [0, 1]],     // внешний мол
    [[-1710, -773], [-1733, -695], [1, 0]],     // восточный мол
    [[-1288, -640], [-1275, -570], [-1, 0]],    // западная набережная бассейна
  ],
  palms: 0,                                     // индекс причала, вдоль которого пальмы
  step: 4.4,                                    // шаг мест у причала, м

  plan(C, L) {
    const rnd = mulberry32(4207), gr = C.ground, pt = this.cap.at;
    // капитания
    const hb = C.houseAt(pt[0], pt[1]);
    const near = p => { const F = lmFrame(p.rings[0]); return Math.hypot(F.cx - pt[0], F.cz - pt[1]) < this.cap.r; };
    const parts = hb ? C.houses.filter(p => p.bi === hb.bi && near(p)) : [];
    for (const p of parts) p.lm = L.id;
    const T = this.tower, rings = parts.map(p => p.rings[0]);
    const xs = rings.flat().map(q => q[0]).concat(T.x - T.r, T.x + T.r), zs = rings.flat().map(q => q[1]).concat(T.z - T.r, T.z + T.r);
    Object.assign(L, { parts, rings, bis: hb ? [hb.bi] : [], bb: [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)] });
    L.cx = (L.bb[0] + L.bb[1]) / 2; L.cz = (L.bb[2] + L.bb[3]) / 2; L.g = gr(L.cx, L.cz);
    L.top = Math.max(gr(T.x, T.z) + T.h, ...parts.map(p => p.top));

    // маяки: идём от start по dir, пока под ногами суша; отступ 2,5 м назад
    L.lights = this.lights.map(({ start, dir, col }) => {
      let [x, z] = start;
      for (let k = 0; k < 200 && gr(x + dir[0] * 0.5, z + dir[1] * 0.5) > 0.05; k++) { x += dir[0] * 0.5; z += dir[1] * 0.5; }
      return { x: x - dir[0] * 2.5, z: z - dir[1] * 2.5, col };
    });

    // лодки
    const boats = [], bollards = [], palms = [];
    const piers = C.lines.filter(l => l.kind === 'pier' && l.pts.some(([x, z]) => x > -1850 && x < -1250 && z < -480));
    const segD = (x, z, a, b) => {
      const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
      return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
    };
    const pierD = (x, z) => { let m = Infinity; for (const l of piers) for (let i = 1; i < l.pts.length; i++) m = Math.min(m, segD(x, z, l.pts[i - 1], l.pts[i])); return m; };
    const samples = b => [-0.45, 0, 0.45].map(t => [b.x + b.ux * b.L * t, b.z + b.uz * b.L * t]);
    const tryBoat = (sx, sz, ux, uz) => {
      // корма в (sx, sz), нос — по (ux, uz)
      const Lb = 6.5 + rnd() * 6, B = Lb * 0.34, x = sx + ux * Lb / 2, z = sz + uz * Lb / 2;
      const b = { x, z, ux, uz, L: Lb, B, rot: Math.atan2(-uz, ux), sail: rnd() < 0.6, c: rnd() };
      const sm = samples(b);
      // у причалов молов дно у кромки пологое (рельеф 2,5 м): лодке хватает, что она над водой
      if (sm.some(([qx, qz]) => gr(qx, qz) > -0.05)) return null;
      if (sm.some(([qx, qz], i) => i && pierD(qx, qz) < B / 2 + 1.2)) return null;
      for (const o of boats) {
        if (Math.hypot(o.x - x, o.z - z) > (o.L + Lb) / 2 + 2) continue;
        const so = samples(o);
        if (sm.some(([ax, az]) => so.some(([bx, bz]) => Math.hypot(ax - bx, az - bz) < (o.B + B) / 2 + 0.25))) return null;
      }
      boats.push(b);
      return b;
    };
    const PW = SITGES_G.pier.w / 2 + 0.5;
    for (const l of piers) for (let i = 1; i < l.pts.length; i++) {
      const a = l.pts[i - 1], b = l.pts[i], len = Math.hypot(b[0] - a[0], b[1] - a[1]), dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len;
      for (let s = 3; s < len - 2; s += this.step) for (const sg of [-1, 1]) {
        const nx = -dz * sg, nz = dx * sg;
        if (rnd() < 0.12) continue;                          // свободные места
        tryBoat(a[0] + dx * s + nx * PW, a[1] + dz * s + nz * PW, nx, nz);
      }
    }
    this.quays.forEach(([a, b, hint], qi) => {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]), dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len;
      let nx = -dz, nz = dx;
      if (nx * hint[0] + nz * hint[1] < 0) { nx = -nx; nz = -nz; }
      let k = 0;
      for (let s = 2; s < len; s += this.step, k++) {
        const qx = a[0] + dx * s, qz = a[1] + dz * s;
        if (gr(qx, qz) < 0.05) continue;
        let e = -1;
        for (let t = 0; t < 45; t += 0.25) if (gr(qx + nx * t, qz + nz * t) < -0.05) { e = t; break; }
        if (e < 0) continue;
        const ex = qx + nx * e, ez = qz + nz * e;
        if (C.houseAt(ex - nx * 0.8, ez - nz * 0.8)) continue;
        if (k % 2 === 0) bollards.push([ex - nx * 0.7, ez - nz * 0.7]);
        if (rnd() > 0.15) tryBoat(ex + nx * 0.7, ez + nz * 0.7, nx, nz);
        if (qi === this.palms && k % 3 === 1 && !C.houseAt(qx, qz) && gr(qx, qz) > 0.05) palms.push([qx, qz, 7 + rnd() * 3, rnd() * 6.3]);
      }
    });
    Object.assign(L, { boats, bollards, palms });
  },

  build(K, L, group) {
    const gr = K.D.ground, T = this.tower;
    const M = {
      wall: lmMat(0xf4f2ec, { tex: 'plaster' }),
      roof: lmMat(0xa65a3d, { tex: 'tile' }),
      stone: lmMat(0xc4b79c, { tex: 'stone' }),
      dark: lmMat(0x1d2630, { rough: 0.4 }),
      blue: lmMat(0x1f4e9c, { rough: 0.5 }),
      inst: lmMat(0xffffff, { rough: 0.55, side: THREE.DoubleSide }),
    };
    const archBand = (wo, ho, wi, hi) => {
      const s = new THREE.Shape(), ro = wo / 2, ri = wi / 2, so = ho - ro, si = hi - ri;
      s.moveTo(-ro, 0); s.lineTo(-ro, so); s.absarc(0, so, ro, Math.PI, 0, true); s.lineTo(ro, 0); s.lineTo(ri, 0);
      s.lineTo(ri, si); s.absarc(0, si, ri, 0, Math.PI, false); s.lineTo(-ri, 0); s.lineTo(-ro, 0);
      return s;
    };
    const inPart = (x, z) => L.parts.some(p => sitgesInPoly(x, z, p.rings[0]));

    /* ---------- капитания: корпуса ---------- */
    for (const p of L.parts) {
      const rg = p.rings[0];
      lmPrism(group, M.wall, rg, p.y0 - 0.2, p.y1);
      lmRoof(group, M.roof, lmFrame(rg), p.y1, { kind: 'hip', pitch: 22, over: 0.45 });
      lmCollide(K, rg, p.y0, p.y1);
      // окна в синих рамах на наружных стенах
      const ar = sitgesArea(rg);
      const nf = Math.max(1, p.p.floors), st = (p.y1 - p.y0) / nf;
      rg.forEach((a, i) => {
        const b = rg[(i + 1) % rg.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len < 2.8) return;
        const ex = (b[0] - a[0]) / len, ez = (b[1] - a[1]) / len, ox = ar > 0 ? ez : -ez, oz = ar > 0 ? -ex : ex;   // наружу
        const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
        if (inPart(mx + ox * 0.6, mz + oz * 0.6) || Math.hypot(mx - T.x, mz - T.z) < T.r + 1.2) return;
        const n = Math.floor((len - 0.8) / 2.8), rot = Math.atan2(-ez, ex);
        for (let f = 0; f < nf; f++) for (let k = 0; k < n; k++) {
          const t = (k + 0.5) / n - 0.5, x = mx + ex * t * len, z = mz + ez * t * len, y = p.y0 + 0.2 + f * st + (f ? 0.9 : 0.8);
          const w = f ? 1.25 : 1.5, h = f ? 1.15 : 1.4;
          lmBox(group, M.blue, w + 0.2, h + 0.2, 0.1, x + ox * 0.02, y - 0.1, z + oz * 0.02, rot);
          lmBox(group, M.dark, w, h, 0.1, x + ox * 0.05, y, z + oz * 0.05, rot);
        }
      });
    }

    /* ---------- капитания: башня ---------- */
    {
      const g = gr(T.x, T.z), top = g + T.h;
      lmCyl(group, M.wall, T.r, T.h + 0.3, T.x, g - 0.3, T.z, { seg: 24, top: T.top });
      const ring8 = []; for (let k = 0; k < 8; k++) ring8.push([T.x + Math.cos(k * Math.PI / 4) * T.r, T.z + Math.sin(k * Math.PI / 4) * T.r]);
      lmCollide(K, ring8, g - 0.5, top);
      // сторона корпусов — без окон
      let bx = 0, bz = 0; for (const r of L.rings) for (const [x, z] of r) { bx += x - T.x; bz += z - T.z; }
      const bd = Math.atan2(bz, bx);
      const at = (ang, y) => { const rr = T.r - (T.r - T.top) * (y - g) / T.h, dx = Math.cos(ang), dz = Math.sin(ang); return { x: T.x + dx * rr, z: T.z + dz * rr, dx, dz, rot: Math.atan2(dx, dz) }; };
      for (const yr of [5.4, 8.1, 10.8]) for (let k = 1; k <= 5; k++) {
        const ang = bd + k * Math.PI / 3, y = g + yr, q = at(ang, y + 0.8);
        lmExtrude(group, M.stone, archBand(1.32, 2.08, 0.86, 1.64), 0.3, q.x, y, q.z, q.rot);
        lmExtrude(group, M.blue, lmArch(0.88, 1.66), 0.06, q.x + q.dx * 0.08, y, q.z + q.dz * 0.08, q.rot);
        lmExtrude(group, M.dark, lmArch(0.64, 1.44), 0.04, q.x + q.dx * 0.1, y + 0.1, q.z + q.dz * 0.1, q.rot);
      }
      // дверь (c-02): каменная арка, синие створки — от корпусов
      const qd = at(bd + Math.PI, g + 1.5);
      lmExtrude(group, M.stone, archBand(2.3, 3.3, 1.5, 2.8), 0.36, qd.x, g, qd.z, qd.rot);
      lmExtrude(group, M.blue, lmArch(1.5, 2.8), 0.1, qd.x + qd.dx * 0.06, g, qd.z + qd.dz * 0.06, qd.rot);
      // мачты антенн и флюгер на крыше
      for (const [ang, h] of [[0.4, 3.4], [2.3, 2.6], [4.2, 3.9]]) lmCyl(group, M.dark, 0.05, h, T.x + Math.cos(ang) * 1.6, top, T.z + Math.sin(ang) * 1.6, { seg: 4 });
      lmCyl(group, M.wall, T.top + 0.05, 0.3, T.x, top - 0.05, T.z, { seg: 24 });
    }

    /* ---------- инстансы ---------- */
    const o3 = new THREE.Object3D(), col = new THREE.Color();
    const inst = (geo, list, shadow = true) => {
      if (!list.length) return null;
      const m = new THREE.InstancedMesh(geo, M.inst, list.length);
      list.forEach((it, i) => {
        o3.position.set(it.p[0], it.p[1], it.p[2]); o3.rotation.set(0, it.r || 0, 0); o3.scale.set(...(it.s || [1, 1, 1])); o3.updateMatrix();
        m.setMatrixAt(i, o3.matrix); m.setColorAt(i, col.setHex(it.c));
      });
      m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; m.computeBoundingSphere();
      m.castShadow = shadow; m.receiveShadow = true;
      group.add(m);
      return m;
    };
    const tri = (pos, a, b, c, cx, cy, cz) => {
      // обход — нормалью от центра (cx, cy, cz): тела выпуклые
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const ok = nx * ((a[0] + b[0] + c[0]) / 3 - cx) + ny * ((a[1] + b[1] + c[1]) / 3 - cy) + nz * ((a[2] + b[2] + c[2]) / 3 - cz) >= 0;
      pos.push(...a, ...(ok ? b : c), ...(ok ? c : b));
    };
    const geoOf = pos => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); return g; };

    // корпус: длина 1 по x (нос +x), ширина 1 по z, низ 0, палуба 1
    const hullGeo = (() => {
      const top = [[-0.5, 1, -0.5], [-0.5, 1, 0.5], [0.2, 1, 0.5], [0.5, 1, 0], [0.2, 1, -0.5]];
      const bot = [[-0.47, 0, -0.3], [-0.47, 0, 0.3], [0.15, 0, 0.33], [0.42, 0, 0], [0.15, 0, -0.33]];
      const pos = [], c = [0, 0.5, 0];
      for (const k of [1, 2]) { tri(pos, top[0], top[k], top[k + 1], ...c); tri(pos, bot[0], bot[k], bot[k + 1], ...c); }
      for (let i = 0; i < 5; i++) { const j = (i + 1) % 5; tri(pos, top[i], top[j], bot[j], ...c); tri(pos, top[i], bot[j], bot[i], ...c); }
      return geoOf(pos);
    })();
    const boxGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const mastGeo = new THREE.CylinderGeometry(0.06, 0.09, 1, 5, 1, true).translate(0, 0.5, 0);
    const hulls = [], cabins = [], masts = [], booms = [];
    const HULL = [0xffffff, 0xffffff, 0xf4f4f0, 0xffffff, 0x1d2f55, 0xe9e4d6, 0xffffff, 0x2a4f8a, 0xffffff, 0xd8dde2];
    const COVER = [0x1d3d78, 0x2c5aa0, 0x1d3d78, 0xb9a77f, 0x253a5c];
    for (const b of L.boats) {
      const hh = 0.5 + 0.06 * b.L, deck = hh - 0.4, along = (t, y) => [b.x + b.ux * b.L * t, y, b.z + b.uz * b.L * t];
      hulls.push({ p: [b.x, -0.4, b.z], r: b.rot, s: [b.L, hh, b.B], c: HULL[Math.floor(b.c * HULL.length)] });
      if (b.sail) {
        cabins.push({ p: along(-0.05, deck), r: b.rot, s: [b.L * 0.34, 0.75, b.B * 0.6], c: 0xf2f2ee });
        masts.push({ p: along(0.12, deck), r: b.rot, s: [1, b.L * 1.15 + 1.5, 1], c: 0xd6d8da });
        booms.push({ p: along(-0.08, deck + 1.8), r: b.rot, s: [b.L * 0.42, 0.32, 0.34], c: COVER[Math.floor(b.c * 7919) % COVER.length] });
      } else {
        cabins.push({ p: along(-0.02, deck), r: b.rot, s: [b.L * 0.42, 1.05, b.B * 0.7], c: 0xf6f6f3 });
        cabins.push({ p: along(-0.02, deck + 1.05), r: b.rot, s: [b.L * 0.26, 0.12, b.B * 0.6], c: 0x2b3440 });   // козырёк
      }
    }
    inst(hullGeo, hulls); inst(boxGeo, cabins); inst(mastGeo, masts); inst(boxGeo, booms);

    // тумбы: чугун, грибок
    const bollGeo = mergeGeometries([new THREE.CylinderGeometry(0.15, 0.18, 0.5, 6).translate(0, 0.25, 0), new THREE.CylinderGeometry(0.26, 0.24, 0.12, 6).translate(0, 0.53, 0)]);
    inst(bollGeo, L.bollards.map(([x, z]) => ({ p: [x, gr(x, z), z], c: 0x2e2622 })), false);
    for (const [x, z] of L.bollards) { const g = gr(x, z); lmCollideBox(K, x, z, 0.5, 0.5, 0, g - 0.2, g + 0.6); }

    // пальмы: ствол и 9 листьев с изломом
    const trunkGeo = new THREE.CylinderGeometry(0.16, 0.26, 1, 6, 1, true).translate(0, 0.5, 0);
    const leafGeo = (() => {
      const pos = [];
      for (let k = 0; k < 9; k++) {
        const a = k * Math.PI * 2 / 9 + (k % 2) * 0.2, ca = Math.cos(a), sa = Math.sin(a), droop = 0.4 + (k % 3) * 0.25;
        const P = (r, y, w) => [ca * r - sa * w, y, sa * r + ca * w];
        const b0 = P(0, 0, 0), m0 = P(1.6, 0.55, 0), mL = P(1.5, 0.35, 0.45), mR = P(1.5, 0.35, -0.45), t0 = P(3.1, -droop, 0);
        pos.push(...b0, ...mL, ...m0, ...b0, ...m0, ...mR, ...m0, ...mL, ...t0, ...m0, ...t0, ...mR);
      }
      return geoOf(pos);
    })();
    inst(trunkGeo, L.palms.map(([x, z, h]) => ({ p: [x, gr(x, z) - 0.2, z], s: [1, h, 1], c: 0x8b7355 })));
    inst(leafGeo, L.palms.map(([x, z, h, a]) => ({ p: [x, gr(x, z) + h - 0.3, z], r: a, c: 0x55803a })));
    for (const [x, z] of L.palms) { const g = gr(x, z); lmCollideBox(K, x, z, 0.6, 0.6, 0, g - 0.2, g + 4); }

    /* ---------- маяки на концах молов ---------- */
    const topGeo = mergeGeometries([
      new THREE.CylinderGeometry(0.6, 0.62, 1.7, 12).translate(0, 0.85, 0),         // цветной верх столба
      new THREE.CylinderGeometry(0.95, 0.95, 0.12, 12).translate(0, 1.76, 0),        // площадка
      new THREE.CylinderGeometry(0.06, 0.45, 0.5, 8).translate(0, 2.85, 0),          // колпак фонаря
    ]);
    inst(topGeo, L.lights.map(l => ({ p: [l.x, gr(l.x, l.z) + 5.6, l.z], c: l.col })));
    for (const l of L.lights) {
      const g = gr(l.x, l.z);
      lmCyl(group, M.stone, 0.95, 0.7, l.x, g - 0.3, l.z, { seg: 12 });
      lmCyl(group, M.wall, 0.55, 5.3, l.x, g + 0.3, l.z, { seg: 12, top: 0.6 });
      lmCyl(group, M.dark, 0.32, 0.75, l.x, g + 7.42, l.z, { seg: 8 });
      lmCollideBox(K, l.x, l.z, 1.9, 1.9, 0, g - 1, g + 6);
    }
  },
};
