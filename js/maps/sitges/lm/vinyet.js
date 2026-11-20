// Ситжес — достопримечательность: святилище Виньет (Santuari de la Mare de Déu del Vinyet) (этап 6, docs/sitges/stage-5.md,
// архив группы — docs/sitges/lm-d.md). Белый неф с пилястрами и полукруглой апсидой, кремовый фасад с фронтоном,
// окулюсом и порталом на парных колоннах, звонница-эспаданья над фронтоном, колокольня с куполом у правого угла
// фасада, вдоль стороны к морю — галерея (porxo) с широкими арками под односкатной черепицей; за нефом — дом.
//   Рамка — по нефу (часть кадастра с наибольшей площадью): u — от фасада к апсиде, v — от стороны галереи (к морю)
//   к дому. Апсида — полуэллипс по точкам контура кадастра за торцом нефа. Высоты — над землёй у фасада, по лидару
//   (неф ≈ 12–13 м, верх купола колокольни ≈ 25 м; в кадастре неф ниже — 1 этаж).
// Определяет: SITGES_LM_VINYET.
// Использует: lmFrame, lmMat, lmBox, lmExtrude, lmPrism, lmRoof, lmInset, lmCyl, lmCollide
//   (js/maps/sitges/landmarks3d.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const SITGES_LM_VINYET = {
  ready: true,
  cfg: {
    wall: 12.3,       // верх стен нефа и карниз фасада над землёй, м
    ped: 3.3,         // высота фронтона, м
    roofPitch: 13,    // скаты нефа (за парапетом почти не видны), °
    tower: { u: 2.7, v: 2.3, w: 4.0, shaft: 18.6, bell: 22.0, dome: 1.9 }, // v — от стороны дома
    porch: { h: 4.2, hi: 5.2, arches: 4 },
    colors: { white: 0xf2efe7, cream: 0xefe4c0, stone: 0xd2b783, tile: 0xa65f3e, dark: 0x1d1c1b, door: 0x4b2d1d },
  },

  plan(C, L) {
    const area = r => { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a / 2); };
    const nave = L.parts.reduce((a, h) => area(h.rings[0]) > area(a.rings[0]) ? h : a);
    const F = lmFrame(nave.rings[0]);
    let { ux, uz } = F;
    if (ux < 0) { ux = -ux; uz = -uz; }                     // u — к апсиде (на +x)
    const vx = -uz, vz = ux, r = nave.rings[0];
    const pu = p => p[0] * ux + p[1] * uz, pv = p => p[0] * vx + p[1] * vz;
    const u0 = Math.min(...r.map(pu)), v0 = Math.min(...r.map(pv)), v1 = Math.max(...r.map(pv));
    const loc = r.map(p => [pu(p) - u0, pv(p) - v0]), W = v1 - v0;
    // конец нефа — дальние точки боковых сторон; апсида — точки дальше конца
    const uN = Math.max(...loc.filter(([, v]) => v < 0.6 || v > W - 0.6).map(([u]) => u));
    const ap = loc.filter(([u, v]) => u > uN - 1.2 && v > 0.6 && v < W - 0.6);
    const av0 = Math.min(...ap.map(p => p[1])), av1 = Math.max(...ap.map(p => p[1])), aU = Math.max(...loc.map(p => p[0]));
    const O = [u0 * ux + v0 * vx, u0 * uz + v0 * vz];
    const at = (u, v) => [O[0] + ux * u + vx * v, O[1] + uz * u + vz * v];
    const fc = at(0, W / 2);
    L.vin = { ux, uz, vx, vz, O, W, uN, apse: { v: (av0 + av1) / 2, b: (av1 - av0) / 2, a: aU - uN },
      g: C.ground(fc[0], fc[1]), base: Math.min(...L.parts.map(h => h.y0)) - 0.4, nave, rot: Math.atan2(-uz, ux) };
    L.vinAt = at;
  },

  build(K, L, group) {
    const P = this.cfg, V = L.vin, at = L.vinAt, c = P.colors, g = V.g, base = V.base, W = V.W;
    const mWhite = lmMat(c.white, { tex: 'plaster' }), mCream = lmMat(c.cream, { tex: 'plaster' }), mStone = lmMat(c.stone, { tex: 'stone' });
    const mTile = lmMat(c.tile, { tex: 'tile' }), mDark = lmMat(c.dark, { rough: 0.6 }), mDoor = lmMat(c.door, { rough: 0.7 });
    const rotU = V.rot, rotV = Math.atan2(-V.vz, V.vx);
    // ящик в рамке: центр низа (u, v), размеры по u, v, высоте
    const box = (m, du, dv, h, u, v, y) => { const [x, z] = at(u, v); return lmBox(group, m, du, h, dv, x, y, z, rotU); };
    // плоская фигура в плоскости стены, перпендикулярной u (фасад): локальная x фигуры — вдоль −v
    const onFacade = (m, shape, depth, u, v, y) => { const [x, z] = at(u, v); return lmExtrude(group, m, shape, depth, x, y, z, rotV + Math.PI); };
    const rect = (w, h) => { const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h); s.lineTo(-w / 2, h); s.lineTo(-w / 2, 0); return s; };
    // арка-фигура: ширина w, прямые бока до hs, сверху полукруг
    const archShape = (w, hs) => { const s = new THREE.Shape(), r = w / 2; s.moveTo(-r, 0); s.lineTo(r, 0); s.lineTo(r, hs); s.absarc(0, hs, r, 0, Math.PI, false); s.lineTo(-r, 0); return s; };
    const archHole = (cx, w, h, y0 = 0, seg = false) => {
      // проём: прямые бока до пят, сверху полукруг или пологая дуга (seg)
      const p = new THREE.Path(), r = w / 2, rise = seg ? w * 0.18 : r, R = (r * r + rise * rise) / (2 * rise), sp = h - rise, cy = sp + rise - R;
      const a0 = Math.asin(Math.min(1, r / R));
      p.moveTo(cx - r, y0); p.lineTo(cx + r, y0); p.lineTo(cx + r, y0 + sp);
      p.absarc(cx, y0 + cy, R, Math.PI / 2 - a0, Math.PI / 2 + a0, false);
      p.lineTo(cx - r, y0);
      return p;
    };

    /* ---------- неф и апсида ---------- */
    const wallTop = g + P.wall;
    const naveRing = [at(0, 0), at(V.uN, 0), at(V.uN, W), at(0, W)];
    lmPrism(group, mWhite, naveRing, base, wallTop, { cap: false });
    lmRoof(group, mTile, { cx: at(V.uN / 2, W / 2)[0], cz: at(V.uN / 2, W / 2)[1], ux: V.ux, uz: V.uz, vx: V.vx, vz: V.vz, len: V.uN - 0.3, wid: W - 0.5 },
      wallTop - 0.25, { kind: 'gable', pitch: P.roofPitch, over: 0 });
    // пилястры и узкие окна по бокам
    for (let k = 1; k <= 5; k++) {
      const u = V.uN * k / 6;
      for (const [v, s] of [[0, -1], [W, 1]]) {
        box(mWhite, 0.55, 0.3, wallTop - base - 0.1, u, v + s * 0.1, base);
        box(mDark, 0.3, 0.12, 0.55, u - V.uN / 12, v + s * 0.02, g + 9.3);
      }
    }
    // венчающий карниз нефа
    for (const [v, s] of [[0, -1], [W, 1]]) box(mWhite, V.uN, 0.35, 0.3, V.uN / 2, v + s * 0.12, wallTop - 0.3);
    // апсида: полуэллипс за торцом нефа
    const A = V.apse, aRing = [];
    for (let i = 0; i <= 14; i++) { const t = -Math.PI / 2 + Math.PI * i / 14; aRing.push(at(V.uN + A.a * Math.cos(t), A.v + A.b * Math.sin(t))); }
    aRing.push(at(V.uN - 0.3, A.v + A.b), at(V.uN - 0.3, A.v - A.b));
    lmPrism(group, mWhite, aRing, base, wallTop - 0.3, { cap: false });
    lmPrism(group, mWhite, lmInset(aRing, -0.12), g + 6.2, g + 6.5, { cap: false });
    lmPrism(group, mTile, lmInset(aRing, -0.25), wallTop - 0.5, wallTop - 0.2);
    {
      // кровля апсиды — половина конуса
      const tip = at(V.uN, A.v), pos = [];
      for (let i = 0; i < 14; i++) pos.push(aRing[i][0], wallTop - 0.2, aRing[i][1], aRing[i + 1][0], wallTop - 0.2, aRing[i + 1][1], tip[0], wallTop + 1.4, tip[1]);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(pos.flatMap((v, i) => i % 3 === 1 ? [] : [v / 2]), 2));
      const P3 = geo.attributes.position;
      for (let i = 0; i < P3.count; i += 3) {    // нормали вверх
        const ny = (P3.getZ(i + 1) - P3.getZ(i)) * (P3.getX(i + 2) - P3.getX(i)) - (P3.getX(i + 1) - P3.getX(i)) * (P3.getZ(i + 2) - P3.getZ(i));
        if (ny < 0) { const t = [P3.getX(i + 1), P3.getY(i + 1), P3.getZ(i + 1)]; P3.setXYZ(i + 1, P3.getX(i + 2), P3.getY(i + 2), P3.getZ(i + 2)); P3.setXYZ(i + 2, ...t); }
      }
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mTile); m.castShadow = m.receiveShadow = true; group.add(m);
    }

    /* ---------- фасад ---------- */
    const fw = W + 0.4, fd = 0.35, fu = -fd / 2;
    box(mCream, fd, fw, wallTop - base, fu, W / 2, base);
    // цоколь — с разрывом у двери
    { const pw = (fw + 0.1 - 3.0) / 2; for (const sd of [-1, 1]) box(mStone, fd + 0.15, pw, g + 1.3 - base, fu - 0.05, W / 2 + sd * (1.5 + pw / 2), base); }
    // фронтон: треугольник и рамка карнизов
    const ped = new THREE.Shape(); ped.moveTo(-fw / 2, 0); ped.lineTo(fw / 2, 0); ped.lineTo(0, P.ped); ped.lineTo(-fw / 2, 0);
    onFacade(mCream, ped, fd, fu, W / 2, wallTop);
    const frame = new THREE.Shape(); frame.moveTo(-fw / 2 - 0.3, -0.35); frame.lineTo(fw / 2 + 0.3, -0.35); frame.lineTo(0, P.ped + 0.4); frame.lineTo(-fw / 2 - 0.3, -0.35);
    const hole = new THREE.Path(), k = 0.45; hole.moveTo(-fw / 2 + 1.4, k * 0.6); hole.lineTo(fw / 2 - 1.4, k * 0.6); hole.lineTo(0, P.ped - k); hole.lineTo(-fw / 2 + 1.4, k * 0.6);
    frame.holes.push(hole);
    onFacade(mStone, frame, 0.25, fu - fd / 2 - 0.1, W / 2, wallTop);
    for (const v of [-0.1, W + 0.1]) lmCyl(group, mStone, 0.22, 0.6, ...[at(-0.3, v)].map(p => [p[0], wallTop, p[1]])[0], { seg: 8 });
    // окулюс
    const ring = new THREE.Shape(); ring.absarc(0, 0, 1.05, 0, Math.PI * 2, false);
    const rh = new THREE.Path(); rh.absarc(0, 0, 0.78, 0, Math.PI * 2, true); ring.holes.push(rh);
    onFacade(mStone, ring, 0.2, fu - fd / 2 - 0.05, W / 2, g + 8.4);
    const disk = new THREE.Shape(); disk.absarc(0, 0, 0.8, 0, Math.PI * 2, false);
    onFacade(mDark, disk, 0.05, fu - fd / 2, W / 2, g + 8.4);
    // портал: дверь в каменной арке, парные колонны на пьедесталах, антаблемент
    const door = archShape(2.3, 3.0);
    onFacade(mDoor, door, 0.1, fu - fd / 2 - 0.02, W / 2, g);
    const da = archShape(3.0, 3.2);
    const dh = new THREE.Path(); dh.moveTo(-1.15, 0); dh.lineTo(1.15, 0); dh.lineTo(1.15, 3.0); dh.absarc(0, 3.0, 1.15, 0, Math.PI, false); dh.lineTo(-1.15, 0);
    da.holes.push(dh);
    onFacade(mStone, da, 0.2, fu - fd / 2 - 0.08, W / 2, g);
    for (const s of [-1, 1]) {
      box(mStone, 0.7, 1.4, 1.3, fu - fd / 2 - 0.35, W / 2 + s * 2.35, g);
      for (const dv of [1.95, 2.75]) { const [x, z] = at(fu - fd / 2 - 0.35, W / 2 + s * dv); lmCyl(group, mStone, 0.24, 3.7, x, g + 1.3, z, { seg: 10 }); }
    }
    box(mStone, 0.8, 6.0, 0.75, fu - fd / 2 - 0.35, W / 2, g + 5.0);
    box(mStone, 0.5, 2.2, 0.6, fu - fd / 2 - 0.25, W / 2, g + 5.75);
    // эспаданья над фронтоном
    const esp = rect(1.9, 2.6); const eh = new THREE.Path(); eh.moveTo(-0.45, 0.5); eh.lineTo(0.45, 0.5); eh.lineTo(0.45, 1.6); eh.absarc(0, 1.6, 0.45, 0, Math.PI, false); eh.lineTo(-0.45, 0.5); esp.holes.push(eh);
    onFacade(mCream, esp, 0.6, fu, W / 2, wallTop + P.ped - 0.6);
    const et = new THREE.Shape(); et.moveTo(-1.1, 0); et.lineTo(1.1, 0); et.lineTo(0, 0.7); et.lineTo(-1.1, 0);
    onFacade(mStone, et, 0.7, fu, W / 2, wallTop + P.ped + 2.0);

    /* ---------- колокольня ---------- */
    const T = P.tower, tu = T.u, tv = W - T.v;
    box(mCream, T.w, T.w, g + T.shaft - base, tu, tv, base);
    box(mStone, T.w + 0.4, T.w + 0.4, 0.35, tu, tv, g + T.shaft);
    box(mCream, T.w - 0.3, T.w - 0.3, T.bell - T.shaft - 0.35, tu, tv, g + T.shaft + 0.35);
    // проёмы звона на четыре стороны
    const bh = T.bell - T.shaft - 1.2;
    for (const [du, dv, rr] of [[-1, 0, rotV + Math.PI], [1, 0, rotV], [0, -1, rotU], [0, 1, rotU + Math.PI]]) {
      const d = (T.w - 0.3) / 2 + 0.02, [x, z] = at(tu + du * d, tv + dv * d);
      const s = archShape(1.0, bh - 0.5);
      lmExtrude(group, mDark, s, 0.06, x, g + T.shaft + 0.8, z, rr);
    }
    box(mStone, T.w + 0.3, T.w + 0.3, 0.4, tu, tv, g + T.bell);
    {
      const [x, z] = at(tu, tv), y = g + T.bell + 0.4;
      lmCyl(group, mStone, T.dome + 0.1, 0.5, x, y, z, { seg: 12 });
      const geo = new THREE.SphereGeometry(T.dome, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2);
      const m = new THREE.Mesh(geo, mTile); m.position.set(x, y + 0.5, z); m.scale.y = 1.3; m.castShadow = m.receiveShadow = true; group.add(m);
      lmBox(group, mDark, 0.12, 1.5, 0.12, x, y + 0.5 + T.dome * 1.3, z);
      lmBox(group, mDark, 0.7, 0.12, 0.12, x, y + 1.5 + T.dome * 1.3, z, rotU);
    }

    /* ---------- галерея (porxo) вдоль стороны к морю ---------- */
    const pr = L.parts.filter(h => h !== V.nave).map(h => h.rings[0]).find(r => r.every(p => (p[0] - V.O[0]) * V.vx + (p[1] - V.O[1]) * V.vz < 0.6));
    if (pr) {
      const pu = pr.map(p => (p[0] - V.O[0]) * V.ux + (p[1] - V.O[1]) * V.uz), pv = pr.map(p => (p[0] - V.O[0]) * V.vx + (p[1] - V.O[1]) * V.vz);
      const a0 = Math.min(...pu), a1 = Math.max(...pu), dv = -Math.min(...pv), len = a1 - a0, h = g + P.porch.h - base;
      // наружная стена с пологими арками
      const wall = rect(len, h), n = P.porch.arches, aw = len / n * 0.78;
      for (let i = 0; i < n; i++) wall.holes.push(archHole(-len / 2 + len * (i + 0.5) / n, aw, 2.2, g - base + 0.8, true));
      const [wx, wz] = at((a0 + a1) / 2, -dv + 0.2);
      lmExtrude(group, mWhite, wall, 0.4, wx, base, wz, rotU);
      box(mDark, len - 0.4, 0.06, 2.6, (a0 + a1) / 2, -dv + 0.65, g + 0.6);          // решётки в глубине
      // торцы: к фасаду — вход аркой, к апсиде — глухой
      const end = rect(dv, h); end.holes.push(archHole(0, 2.8, 3.1, g - base, false));
      const [ex, ez] = at(a0 + 0.2, -dv / 2);
      lmExtrude(group, mWhite, end, 0.4, ex, base, ez, rotV);
      box(mWhite, 0.4, dv, h, a1 - 0.2, -dv / 2, base);
      // односкатная крыша и карниз
      const pos = [], P0 = at(a0 - 0.1, -dv - 0.4), P1 = at(a1 + 0.1, -dv - 0.4), P2 = at(a1 + 0.1, 0), P3 = at(a0 - 0.1, 0);
      const ylo = g + P.porch.h, yhi = g + P.porch.hi;
      pos.push(P0[0], ylo, P0[1], P1[0], ylo, P1[1], P2[0], yhi, P2[1], P0[0], ylo, P0[1], P2[0], yhi, P2[1], P3[0], yhi, P3[1]);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const tl = dv + 0.4;
      geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, len / 2, 0, len / 2, tl / 2, 0, 0, len / 2, tl / 2, 0, tl / 2], 2));
      const P3a = geo.attributes.position;
      for (let i = 0; i < 6; i += 3) {
        const ny = (P3a.getZ(i + 1) - P3a.getZ(i)) * (P3a.getX(i + 2) - P3a.getX(i)) - (P3a.getX(i + 1) - P3a.getX(i)) * (P3a.getZ(i + 2) - P3a.getZ(i));
        if (ny < 0) geo.setIndex([0, 2, 1, 3, 5, 4]);
      }
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mTile); m.castShadow = m.receiveShadow = true; group.add(m);
      box(mTile, len + 0.2, 0.3, 0.25, (a0 + a1) / 2, -dv - 0.25, g + P.porch.h - 0.1);   // свес черепицы
      lmCollide(K, pr, base, g + P.porch.h);
    }

    /* ---------- дом за нефом и пристройки ---------- */
    for (const h of L.parts) {
      if (h === V.nave || h.rings[0] === pr) continue;
      const r = h.rings[0], Fh = lmFrame(r), gable = h.roof && h.roof.kind === 'gable';
      lmPrism(group, mWhite, r, base, h.y1, { cap: !gable });
      if (gable) lmRoof(group, mTile, Fh, h.y1, { kind: 'gable', pitch: 20, over: 0.4 });
      else lmPrism(group, mStone, lmInset(r, -0.1), h.y1 - 0.05, h.y1 + 0.25);
      // окна: два ряда тёмных проёмов с подоконником на длинных стенах
      for (let i = 0; i < r.length; i++) {
        const a = r[i], b = r[(i + 1) % r.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (l < 4) continue;
        const ux = (b[0] - a[0]) / l, uz = (b[1] - a[1]) / l, s = ((a[0] + b[0]) / 2 - Fh.cx) * uz - ((a[1] + b[1]) / 2 - Fh.cz) * ux > 0 ? 1 : -1;
        const nx = s * uz, nz = -s * ux, n = Math.floor(l / 3.2), rot = Math.atan2(-uz, ux);
        for (let q = 0; q < n; q++) {
          const t = (q + 0.5) * l / n, x = a[0] + ux * t + nx * 0.04, z = a[1] + uz * t + nz * 0.04;
          for (let fl = 0; fl < h.p.floors; fl++) {
            const y = Math.max(base, h.y0) + 1.0 + fl * 3.2;
            if (y + 1.3 > h.y1 - 0.3) continue;
            lmBox(group, mDark, 0.9, 1.3, 0.08, x, y, z, rot);
            lmBox(group, mStone, 1.1, 0.1, 0.25, x + nx * 0.06, y - 0.1, z + nz * 0.06, rot);
          }
        }
      }
      lmCollide(K, r, base, h.y1);
    }
    lmCollide(K, V.nave.rings[0], base, wallTop);
  },
};
