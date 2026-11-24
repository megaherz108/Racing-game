// Ситжес — достопримечательность: парк Can Robert (шаги П3–П4 плана парка, docs/sitges/park-canrobert.md, «Итоги П3, П4»).
// Зданий в SITGES_LM нет (at: []) — plan() ставит рамку L.bb и центр L.cx, L.cz по контуру парка (C.parks): отсюда
// значок 🌳 на мини-карте (mmMarks). Места объектов — C.parks[].spots (П0, data-parks.js), вид — по кадрам Street View
// (tools/sitges/raw/photos/street/park-canrobert/, номера кадров — в комментариях).
//   plan(): рельеф под амфитеатром — узлы игровой сетки (C.terra.H) под сценой, ступенями, площадкой над ними и
//     уступом опущены ниже их верха (сетка 2,5 м сглаживает уступы 0,3–0,8 м — бетон иначе тонул бы в земле).
//   build(): собачья площадка (сетка на столбах, калитка, табличка, плита поилки, снаряды аджилити), навес,
//     две детские (штакетник, башни с горкой, домик, качели-гнездо, панель «корова»; пружинные качалки, песочница),
//     подвесной мостик (настил досками по оси и высотам лидара — проезжий, Decks; перила — столкновения; белые
//     V-стойки), амфитеатр (сцена, ступени — поверхность для колёс и сетка столкновений, как тротуары), спортплощадка
//     (клетка из сетки, борта, ворота, щиты), калистеника, буквы «SITGES», фонари и скамьи вдоль дорожек парка (от
//     этапа 7 внутри парка их нет). «Бронзовой фигуры» (П0, spots.figure) нет: на кадре 10 — чугунный фонтанчик на
//     бетонном кубе у точки OSM (73, 589), там уже стоит фонтанчик этапа 7.
//     Ночью стекло фонарей светится, ореол и пятно света — помощниками этапа 7 (S.glow, S.lights, как столбы группы A;
//     источников света нет): они появляются позже строений — K.lmAfterStreet (зовёт js/maps/sitges/build.js).
//   lmCanRobertTrees(C) — из sitgesData (plan.js) сразу после деревьев 4б: деревья, чьи кроны заходят в настил мостика
//     (у оси лидар принимает за крону сам настил), сдвигаются от оси или убираются; стволы на бетоне амфитеатра — за край.
//   Сбиваемое (Breakables → K.lmBrks → world.breakables, js/maps/sitges/build.js): секции заборов собачьей и детских
//     площадок, фонари, скамьи. Секция — экземпляр: панель (масштаб по длине — локальная матрица loc) и столб посередине
//     (у сетки ещё труба поверху); в сетке столкновений — ряд кругов вдоль секции (все указывают на неё; сбитая — все
//     круги датчики, onBreak).
//   Материалы (≤ 6): белый бетон (lmMat), окраска и дерево (цвет вершин), оцинковка (цвет вершин, металл), атлас
//     (canvas: прутья перил, сварная сетка, штакетник, доски настила, табличка, «корова»; alphaTest).
// Старый мостик этапа 2 на месте подвесного не строит roads3d.js (lmCanRobertOldDeck).
// Определяет: SITGES_LM_CANROBERT, lmCanRobertAmphi, lmCanRobertDeck, lmCanRobertTrees, lmCanRobertDrape,
//   lmCanRobertMats, LM_CR_ATLAS, lmCanRobertAtlas, lmCanRobertGeo, lmCanRobertBatch, lmCanRobertOldDeck.
// Использует: clamp (js/core.js); Breakables (js/world.js); sitgesInPoly, sitgesSeg (js/maps/sitges/geom.js);
//   sitgesTreeKit (js/maps/sitges/trees3d.js); lmCollideBox, lmFrame, lmPrism, lmBox, LMK, lmMat
//   (js/maps/sitges/landmarks3d.js); brkSolid (js/physics.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const SITGES_LM_CANROBERT = {
  ready: true,
  park: 'canrobert',                // id парка в C.parks (data-parks.js)
  // заборы: высота, длина секции, проём (ребро контура, доля, ширина); калитка — секция с толстыми столбами
  dog: { h: 1.2, sec: 2.5, gate: { edge: 0, f: 0.45 } },
  play: { h: 0.95, sec: 2.4, gap: { edge: 4, f: 0.5, w: 1.4 } },
  play2: { h: 0.95, sec: 2.4, gap: { edge: 0, f: 0.5, w: 1.4 } },
  // мостик: ширина настила, толщина плиты Decks, высота перил, шаг V-стоек (точек оси через 2 м)
  deck: { w: 3.0, slab: 3.3, t: 0.3, rail: 1.1, legEvery: 4 },
  // амфитеатр: сцена, подъём и глубина ступени, число ступеней; уступ с запада (линия x, верх), площадка за ступенями
  amphi: { y: 14.2, rise: 0.3, run: 0.75, n: 4, ledgeX: -83, ledgeY: 15.0, ledgeW: 3, land: 2.6 },
  // фонари и скамьи вдоль дорожек парка: шаг, отступ от края дорожки
  lamps: { step: 34, off: 1.1, min: 14 },
  benches: { step: 42, off: 0.9 },
  // деревья 4б у мостика и амфитеатра (lmCanRobertTrees): крона не должна заходить в настил — полоса от низа настила
  // − down до верха + up (машина, перила); сдвиг от оси не дальше deckShift м, иначе убрать (у оси лидар принимает
  // настил за крону); ствол на бетоне амфитеатра — за край (зазор pad м), не дальше amphiShift м, иначе убрать
  trees: { up: 2.3, down: 0.9, deckShift: 2.5, pad: 0.4, amphiShift: 3 },

  plan(C, L) {
    const pk = (C.parks || []).find(p => p.id === this.park) || (C.parks || [])[0];
    if (!pk) return;
    const xs = pk.ring.map(q => q[0]), zs = pk.ring.map(q => q[1]);
    L.bb = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
    L.cx = (L.bb[0] + L.bb[1]) / 2; L.cz = (L.bb[2] + L.bb[3]) / 2;
    L.park = pk;
    L.spot = k => pk.spots.find(s => s.k === k);
    // амфитеатр: части (контур, верх) и рельеф под ними
    const am = L.spot('amphi');
    if (am) {
      L.amphi = lmCanRobertAmphi(am.ring, this.amphi);
      L.amphiRamps = L.amphi.ramps;
      // узел в части или ближе 0,3 м к ней — ниже её верха на cut (у ступеней и площадки — с запасом: между узлами
      // через 2,5 м рельеф поднимается круче ступеней 0,3 / 0,75 м и иначе прикрыл бы их задний край)
      const T = C.terra, { NX, NZ, S, X0, Z0, H } = T, target = new Map();
      const near = (x, z, r) => sitgesInPoly(x, z, r) || r.some((a, i) => { const b = r[(i + 1) % r.length]; return sitgesSeg(x, z, a[0], a[1], b[0], b[1]) < 0.3; });
      for (const p of L.amphi) {
        let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        for (const [x, z] of p.ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
        for (let j = Math.max(0, Math.ceil((z0 - 0.3 - Z0) / S)); j <= Math.min(NZ - 1, Math.floor((z1 + 0.3 - Z0) / S)); j++)
          for (let i = Math.max(0, Math.ceil((x0 - 0.3 - X0) / S)); i <= Math.min(NX - 1, Math.floor((x1 + 0.3 - X0) / S)); i++) {
            if (!near(X0 + i * S, Z0 + j * S, p.ring)) continue;
            const k = j * NX + i, y = p.top - p.cut;
            if (!target.has(k) || target.get(k) > y) target.set(k, y);
          }
      }
      let n = 0;
      for (const [k, y] of target) if (H[k] > y) { H[k] = y; n++; }
      L.amphiNodes = n;
    }
    L.g = C.ground(L.cx, L.cz);
  },

  build(K, L, group) {
    const pk = L.park;
    if (!pk) return;
    const C = K.D.C, gr = K.D.ground, grid = K.grid, P = this;
    const M = lmCanRobertMats();
    const B = lmCanRobertBatch();
    const dyn = new THREE.Group(); dyn.name = 'canrobert-brk'; dyn.userData.dynamic = true; group.add(dyn);
    const brks = K.lmBrks || (K.lmBrks = []);
    const G = lmCanRobertGeo, AT = LM_CR_ATLAS;
    const box = (mat, col, w, h, d, x, y, z, ry = 0) => B.put(mat, G.box(w, h, d), G.m(x, y, z, ry), col);
    const cyl = (mat, col, r, h, x, y, z, seg = 6, rt = r) => B.put(mat, G.cyl(r, h, seg, rt), G.m(x, y, z), col);
    const beam = (mat, col, a, b, w, h) => B.put(mat, G.box(w, h, 1, true), G.beam(a, b), col);
    const coll = (x, z, w, d, rot, y0, y1) => lmCollideBox(K, x, z, w, d, rot, y0, y1);
    const frame = ring => lmFrame(ring);
    // точка рамки F: u вдоль длинной оси, v поперёк
    const ptF = (F, u, v) => F.at(u, v);
    const groundMax = pts => Math.max(...pts.map(([x, z]) => gr(x, z)));
    const sp = k => L.spot(k);
    const stats = {};

    /* ---------- сбиваемые заборы секциями ---------- */
    // ring — контур, o — { h, sec, gap | gate }, kind — 'mesh' (сетка на круглых столбах) | 'picket' (штакетник)
    const fences = [];
    const fence = (ring, o, kind) => {
      const list = [];
      ring.forEach((a, ei) => {
        const b = ring[(ei + 1) % ring.length], LE = Math.hypot(b[0] - a[0], b[1] - a[1]);
        let pieces = [[0, 1]];
        const gp = o.gap && o.gap.edge === ei ? o.gap : null;
        if (gp) {
          const L0 = Math.hypot(b[0] - a[0], b[1] - a[1]), hw = gp.w / 2 / L0;
          pieces = [[0, gp.f - hw], [gp.f + hw, 1]];
        }
        for (const [f0, f1] of pieces) {
          const ax = a[0] + (b[0] - a[0]) * f0, az = a[1] + (b[1] - a[1]) * f0, bx = a[0] + (b[0] - a[0]) * f1, bz = a[1] + (b[1] - a[1]) * f1;
          const len = Math.hypot(bx - ax, bz - az);
          if (len < 0.5) continue;
          const n = Math.max(1, Math.round(len / o.sec)), l = len / n, dx = (bx - ax) / len, dz = (bz - az) / len;
          for (let k = 0; k < n; k++) {
            const x0 = ax + dx * l * k, z0 = az + dz * l * k, x1 = x0 + dx * l, z1 = z0 + dz * l;
            const g0 = gr(x0, z0), g1 = gr(x1, z1);
            list.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, y: (g0 + g1) / 2, l, dx, dz, ry: Math.atan2(-dz, dx), rz: Math.atan2(g1 - g0, l), ei, f: (k + 0.5) * l + f0 * LE });
          }
        }
      });
      fences.push({ kind, o, list, ring });
      return list;
    };
    const buildFences = (kind, sets, brkO) => {
      const all = sets.flatMap(s => s.list);
      if (!all.length) return;
      const o = sets[0].o, S0 = o.sec;
      // панель — атлас (сетка или штакетник), столб — посередине секции
      const panel = G.quad(S0, o.h, kind === 'mesh' ? AT.mesh : AT.picket, kind === 'mesh' ? 0.05 : 0, 1, 1);
      const pcol = kind === 'mesh' ? 0xb9c0c4 : 0xa9784c;
      // сетка: столбы потолще и темнее и труба поверху (рамка секции) — издали прутья атласа пропадают (alphaTest), а
      // столбы с трубой держат линию забора
      const post = kind === 'mesh' ? G.cyl(0.042, o.h + 0.4, 6).translate(0, -0.3, 0) : G.box(0.09, o.h + 0.35, 0.09).translate(0, -0.3, 0);
      G.color(panel, pcol); G.color(post, kind === 'mesh' ? 0x6f787e : 0x8a5f38);
      const mP = new THREE.InstancedMesh(panel, M.atlas, all.length), mS = new THREE.InstancedMesh(post, kind === 'mesh' ? M.met : M.col, all.length);
      mP.castShadow = false; mS.castShadow = true; mP.receiveShadow = mS.receiveShadow = true;
      const meshes = [mP, mS];
      if (kind === 'mesh') {
        const mR = new THREE.InstancedMesh(G.color(G.box(S0, 0.045, 0.045, true).translate(0, o.h, 0), 0x7d868c), M.met, all.length);
        mR.castShadow = true; mR.receiveShadow = true; meshes.push(mR);
      }
      const Bk = new Breakables(meshes, Object.assign({ onBreak: it => { if (typeof brkSolid === 'function') for (const c of it.extra) if (c.col) brkSolid(c.col, false); } }, brkO));
      const hh = o.h + 0.1;
      for (const s of all) {
        const loc = new THREE.Matrix4().makeScale(s.l / S0, 1, 1);
        const it = Bk.add(grid, s.x, s.y, s.z, s.ry, 0.16, hh, { loc: [loc, null, loc], rz: s.rz });
        it.extra = [];
        // круги вдоль секции (кроме середины — её круг уже поставил add)
        for (let q = 0.4; q < s.l / 2 - 0.05; q += 0.4) for (const sg of [-1, 1]) {
          const c = grid.addCircle(s.x + s.dx * q * sg, s.z + s.dz * q * sg, 0.16, hh); c.brk = it; it.extra.push(c);
        }
        s.it = it;
      }
      for (const m of meshes) { m.computeBoundingSphere(); m.boundingSphere.radius += 6; dyn.add(m); }
      for (const E of Bk.meshes) E.pad = 6;
      brks.push(Bk);
      stats[kind + 'Sections'] = all.length;
    };

    /* ---------- собачья площадка (кадр 09) ---------- */
    const dog = sp('dog');
    if (dog) {
      const R = dog.ring, list = fence(R, P.dog, 'mesh');
      // калитка: секция на ребре gate.edge ближе к доле f — толстые столбы по краям и рама
      const ge = R[P.dog.gate.edge], gb = R[(P.dog.gate.edge + 1) % R.length], glen = Math.hypot(gb[0] - ge[0], gb[1] - ge[1]);
      const gs = list.filter(s => s.ei === P.dog.gate.edge).sort((a, b) => Math.abs(a.f / glen - P.dog.gate.f) - Math.abs(b.f / glen - P.dog.gate.f))[0];
      if (gs) for (const sg of [-1, 1]) {
        const x = gs.x + gs.dx * gs.l / 2 * sg, z = gs.z + gs.dz * gs.l / 2 * sg, g = gr(x, z);
        cyl(M.met, 0x7d868c, 0.055, 1.75, x, g - 0.3, z, 8);
        coll(x, z, 0.2, 0.2, 0, g - 0.5, g + 1.45);
      }
      // табличка «Àrea d'esbarjo de gossos» снаружи у калитки (кадр 09: жёлтый щит на двух стойках)
      if (gs) {
        let cx = 0, cz = 0; for (const [x, z] of R) { cx += x / R.length; cz += z / R.length; }
        let nx = -gs.dz, nz = gs.dx; if (nx * (gs.x - cx) + nz * (gs.z - cz) < 0) { nx = -nx; nz = -nz; }
        const x = gs.x + nx * 1.3 - gs.dx * 2.2, z = gs.z + nz * 1.3 - gs.dz * 2.2, g = gr(x, z), ry = Math.atan2(nx, nz);
        for (const s of [-0.5, 0.5]) cyl(M.met, 0x6f777c, 0.03, 1.75, x + Math.cos(ry) * s, g - 0.2, z - Math.sin(ry) * s, 6);
        B.put(M.atlas, G.color(G.quad(1.0, 0.75, AT.sign, 0, 1, 1, true), 0xffffff), G.m(x + nx * 0.03, g + 0.75, z + nz * 0.03, ry), null);
        box(M.col, 0xd9b21c, 1.04, 0.79, 0.03, x, g + 0.73, z, ry);
        coll(x, z, 1.1, 0.15, ry, g - 0.3, g + 1.6);
      }
      // плита поилки у фонтанчика этапа 7 (OSM, dog=yes) и миска
      const [wx, wz] = [-47.9, 562.4], wg = gr(wx, wz);
      box(M.col, 0xb4aea2, 2.2, 0.14, 1.6, wx - 0.3, wg - 0.06, wz, 0.2);
      cyl(M.met, 0x9aa2a6, 0.22, 0.1, wx - 0.9, wg + 0.08, wz + 0.2, 10, 0.25);
      // аджилити: барьер, кольцо, горка-трап, слалом (немного и простых — решение пользователя)
      const ag = (x, z) => gr(x, z);
      { const x = -64.5, z = 568, g = ag(x, z);
        for (const s of [-0.65, 0.65]) box(M.col, 0x2c5fb0, 0.07, 0.9, 0.07, x + s, g, z);
        box(M.col, 0xd8382c, 1.3, 0.05, 0.05, x, g + 0.48, z); box(M.col, 0xf0f0ea, 1.3, 0.05, 0.05, x, g + 0.18, z);
        coll(x, z, 1.5, 0.3, 0, g - 0.3, g + 0.95); }
      { const x = -66, z = 552.5, g = ag(x, z);
        for (const s of [-0.75, 0.75]) box(M.col, 0x2c5fb0, 0.07, 1.6, 0.07, x + s, g, z);
        box(M.col, 0x2c5fb0, 1.57, 0.07, 0.07, x, g + 1.56, z);
        B.put(M.col, new THREE.TorusGeometry(0.36, 0.06, 6, 16), G.m(x, g + 0.95, z), 0xe3c018);
        for (const s of [-1, 1]) beam(M.col, 0x30343a, [x + 0.42 * s, g + 0.95, z], [x + 0.72 * s, g + 0.95, z], 0.02, 0.02);
        beam(M.col, 0x30343a, [x, g + 1.31, z], [x, g + 1.53, z], 0.02, 0.02);
        coll(x, z, 1.7, 0.3, 0, g - 0.3, g + 1.65); }
      { const x = -57.5, z = 554, g = ag(x, z), H = 1.5, half = 2.2;
        for (const s of [-1, 1]) {
          const a = [x + half * s, ag(x + half * s, z) + 0.05, z], b = [x + 0.03 * s, g + H, z];
          beam(M.col, 0xe0b820, a, b, 0.9, 0.06);
        }
        coll(x, z, 4.4, 1.0, 0, g - 0.3, g + H); }
      for (let k = 0; k < 6; k++) { const x = -45, z = 551 + k * 0.6, g = ag(x, z); cyl(M.col, k % 2 ? 0xf0f0ea : 0xd8382c, 0.025, 1.0, x, g, z, 6); }
    }

    /* ---------- навес (кадры 08, 09): тонкие стойки, плоская тёмная крыша ≈ 3 м ---------- */
    const sh = sp('shelter');
    if (sh) {
      const F = frame(sh.ring), n = 6, H = 3.0;
      const posts = [];
      for (let k = 0; k <= n; k++) for (const sg of [-1, 1]) posts.push(ptF(F, -F.len / 2 + 0.25 + (F.len - 0.5) * k / n, sg * (F.wid / 2 - 0.25)));
      const top = groundMax(posts) + H;
      for (const [x, z] of posts) {
        const g = gr(x, z);
        cyl(M.met, 0x8f979c, 0.06, top - g + 0.3, x, g - 0.3, z, 8);
        coll(x, z, 0.25, 0.25, 0, g - 0.5, top);
      }
      box(M.col, 0x4f565c, F.len + 0.4, 0.1, F.wid + 0.5, F.cx, top + 0.18, F.cz, F.rot);
      for (const sg of [-1, 1]) {
        const [x, z] = ptF(F, 0, sg * (F.wid / 2 - 0.25));
        box(M.met, 0x8f979c, F.len + 0.2, 0.18, 0.12, x, top, z, F.rot);
      }
      for (let k = 0; k <= n; k++) {
        const [x, z] = ptF(F, -F.len / 2 + 0.25 + (F.len - 0.5) * k / n, 0);
        box(M.met, 0x8f979c, 0.1, 0.14, F.wid - 0.4, x, top + 0.03, z, F.rot);
      }
    }

    /* ---------- детские площадки ---------- */
    const play = sp('play');
    if (play) {
      fence(play.ring, P.play, 'picket');
      // башни с синими крышами, мостик, горка (кадры 01, 03; в лидаре снаряды 1,5–2,6 м у (−155…−168, 563))
      const tower = (x, z, slideDir) => {
        const g = gr(x, z), pl = g + 1.2;
        for (const [a, b] of [[-0.7, -0.7], [0.7, -0.7], [0.7, 0.7], [-0.7, 0.7]]) box(M.col, 0x9a6b42, 0.1, 2.85, 0.1, x + a, g - 0.15, z + b);
        box(M.col, 0xa77a4e, 1.5, 0.08, 1.5, x, pl, z);
        for (const s of [-1, 1]) box(M.col, 0x2f6fd0, 1.4, 0.55, 0.04, x, pl + 0.15, z + 0.72 * s);
        B.put(M.col, G.cyl(1.15, 0.75, 4, 0.001).rotateY(Math.PI / 4), G.m(x, g + 2.7, z), 0x2457b8);
        coll(x, z, 1.6, 1.6, 0, g - 0.3, g + 3.4);
        if (slideDir) {
          const [dx, dz] = slideDir, a = [x + dx * 0.75, pl + 0.05, z + dz * 0.75], b = [x + dx * 3.6, g + 0.25, z + dz * 3.6];
          beam(M.col, 0x2a8de0, a, b, 0.55, 0.05);
          for (const s of [-1, 1]) beam(M.col, 0x2a8de0, [a[0] - dz * 0.3 * s, a[1] + 0.12, a[2] + dx * 0.3 * s], [b[0] - dz * 0.3 * s, b[1] + 0.12, b[2] + dx * 0.3 * s], 0.05, 0.22);
          coll(x + dx * 2.3, z + dz * 2.3, 0.7, 2.6, Math.atan2(dx, dz), g - 0.3, g + 1.3);
        }
        return pl;
      };
      const pA = tower(-158, 563.5, [0, -1]), pB = tower(-164.5, 564.5, null);
      beam(M.col, 0xa77a4e, [-158.75, pA + 0.04, 563.6], [-163.75, pB + 0.04, 564.4], 0.7, 0.08);
      // домик: деревянный короб с двускатной синей крышей
      { const x = -181, z = 560, g = gr(x, z);
        box(M.col, 0xb08456, 1.6, 1.3, 1.5, x, g - 0.1, z);
        box(M.col, 0x3b2a1c, 0.6, 0.9, 0.03, x, g, z - 0.76);
        for (const s of [-1, 1]) B.put(M.col, G.box(1.9, 0.05, 1.1), G.m(x, g + 1.45, z + 0.42 * s, 0, 0.62 * s), 0x2457b8);
        coll(x, z, 1.8, 1.7, 0, g - 0.3, g + 1.9); }
      // качели-гнездо: белая А-рама (кадр 01), гнездо — кольцо с сеткой на тросах
      { const x = -194, z = 558, g = gr(x, z), H = 2.4, half = 1.5;
        for (const s of [-1, 1]) {
          for (const t of [-1, 1]) beam(M.met, 0xe4e6e4, [x + half * s, g - 0.1, z + 0.9 * t], [x + half * s, g + H, z], 0.08, 0.08);
          coll(x + half * s, z, 0.3, 2.0, 0, g - 0.3, g + H);
        }
        beam(M.met, 0xe4e6e4, [x - half - 0.1, g + H, z], [x + half + 0.1, g + H, z], 0.1, 0.1);
        B.put(M.col, new THREE.TorusGeometry(0.5, 0.07, 6, 16).rotateX(Math.PI / 2), G.m(x, g + 0.55, z), 0xb02a2a);
        B.put(M.col, G.cyl(0.46, 0.02, 12), G.m(x, g + 0.54, z), 0x2a2224);
        for (const s of [-1, 1]) for (const t of [-1, 1]) beam(M.col, 0x2a2224, [x + 0.35 * s, g + 0.58, z + 0.35 * t], [x + 0.08 * s, g + H - 0.05, z], 0.02, 0.02); }
      // панель «корова» у южного штакетника (кадр 03): фанерный силуэт на двух подпорках
      { const x = -150, z = 558.3, g = gr(x, z);
        B.put(M.atlas, G.color(G.quad(2.6, 1.6, AT.cow, 0, 1, 1, true), 0xffffff), G.m(x, g + 0.05, z, Math.PI), null);
        for (const s of [-0.8, 0.8]) beam(M.col, 0x8a5f38, [x + s, g - 0.1, z + 0.6], [x + s, g + 1.2, z + 0.05], 0.07, 0.07);
        coll(x, z + 0.2, 2.6, 0.6, 0, g - 0.3, g + 1.5); }
    }
    const play2 = sp('play2');
    if (play2) {
      fence(play2.ring, P.play2, 'picket');
      // вторая детская (OSM 887009260, по ортофото): горка с площадкой, две пружинные качалки, песочница
      { const x = 7, z = 571.5, g = gr(x, z), pl = g + 0.9;
        for (const [a, b] of [[-0.55, -0.55], [0.55, -0.55], [0.55, 0.55], [-0.55, 0.55]]) box(M.col, 0x9a6b42, 0.09, 1.9, 0.09, x + a, g - 0.1, z + b);
        box(M.col, 0xa77a4e, 1.2, 0.07, 1.2, x, pl, z);
        B.put(M.col, G.cyl(0.95, 0.55, 4, 0.001).rotateY(Math.PI / 4), G.m(x, g + 1.8, z), 0xd8382c);
        beam(M.col, 0xe0b820, [x + 0.6, pl + 0.05, z], [x + 2.9, g + 0.22, z], 0.5, 0.05);
        coll(x + 0.8, z, 3.4, 1.3, 0, g - 0.3, g + 2.4); }
      for (const [x, z, c] of [[13, 573.5, 0xd8382c], [18.5, 571, 0xe0b820]]) {
        const g = gr(x, z);
        cyl(M.col, 0x30343a, 0.11, 0.42, x, g, z, 8);
        box(M.col, c, 0.75, 0.32, 0.26, x, g + 0.42, z, 0.4);
        box(M.col, 0x30343a, 0.05, 0.25, 0.32, x + 0.2, g + 0.72, z - 0.08, 0.4);
        coll(x, z, 0.8, 0.4, 0.4, g - 0.3, g + 1.0);
      }
      { const x = 5, z = 566, g = gr(x, z);
        for (const [a, b, w, d] of [[0, -1.2, 2.5, 0.12], [0, 1.2, 2.5, 0.12], [-1.2, 0, 0.12, 2.3], [1.2, 0, 0.12, 2.3]]) box(M.col, 0xa77a4e, w, 0.28, d, x + a, g - 0.05, z + b);
        box(M.col, 0xd9c49a, 2.3, 0.12, 2.3, x, g - 0.02, z); }
    }
    if (fences.length) {
      buildFences('mesh', fences.filter(f => f.kind === 'mesh'), { mass: 40, anchor: 1, minSpeed: 3, dmg: 0.05, cy: 0.6, lie: 1.45, kind: 'metal' });
      buildFences('picket', fences.filter(f => f.kind === 'picket'), { mass: 30, anchor: 1, minSpeed: 3, dmg: 0.05, cy: 0.5, lie: 1.45, kind: 'wood' });
    }

    /* ---------- подвесной мостик (кадры 04, 05, 07): доски поперёк, серые перила, белые борта и V-стойки ---------- */
    const dk = pk.decks[0];
    if (dk) {
      const D = P.deck, n = dk.p.length, hw = D.w / 2;
      const { p, y, tan, s } = lmCanRobertDeck(dk, gr);
      const off = (i, d) => [p[i][0] - tan[i][1] * d, p[i][1] + tan[i][0] * d];
      // верх: доски (атлас), бока — белая балка, низ — тёмный
      const W = { pos: [], uv: [], col: [] }, Wc = { pos: [], col: [] };
      // четырёхугольник A B C D; hint — куда смотреть лицом (обход переворачивается)
      const quad = (Q, A, B2, C2, D2, uv, col, hint) => {
        if (hint) {
          const u = [B2[0] - A[0], B2[1] - A[1], B2[2] - A[2]], w = [C2[0] - A[0], C2[1] - A[1], C2[2] - A[2]];
          const nn = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
          if (nn[0] * hint[0] + nn[1] * hint[1] + nn[2] * hint[2] < 0) { [B2, D2] = [D2, B2]; if (uv) uv = [uv[0], uv[3], uv[2], uv[1]]; }
        }
        Q.pos.push(...A, ...B2, ...C2, ...A, ...C2, ...D2); if (uv) Q.uv.push(...uv[0], ...uv[1], ...uv[2], ...uv[0], ...uv[2], ...uv[3]); for (let k = 0; k < 6; k++) Q.col.push(...col); };
      const cWhite = new THREE.Color(0xdcdcd6), cDark = new THREE.Color(0x3c4044), cWood = new THREE.Color(0xa08a72);
      const v0 = AT.planks[1], v1 = AT.planks[3];
      for (let i = 0; i + 1 < n; i++) {
        const [lax, laz] = off(i, hw), [rax, raz] = off(i, -hw), [lbx, lbz] = off(i + 1, hw), [rbx, rbz] = off(i + 1, -hw);
        const ya = y[i], yb = y[i + 1], ua = s[i] / 3.2, ub = s[i + 1] / 3.2;
        quad(W, [lax, ya, laz], [lbx, yb, lbz], [rbx, yb, rbz], [rax, ya, raz], [[ua, v1], [ub, v1], [ub, v0], [ua, v0]], cWood.toArray(), [0, 1, 0]);
        for (const sg of [1, -1]) {
          const [ax, az] = off(i, (hw + 0.1) * sg), [bx, bz] = off(i + 1, (hw + 0.1) * sg);
          quad(Wc, [ax, ya + 0.03, az], [bx, yb + 0.03, bz], [bx, yb - 0.45, bz], [ax, ya - 0.45, az], null, cWhite.toArray(), [-tan[i][1] * sg, 0, tan[i][0] * sg]);
        }
        const [l2ax, l2az] = off(i, hw + 0.1), [r2ax, r2az] = off(i, -hw - 0.1), [l2bx, l2bz] = off(i + 1, hw + 0.1), [r2bx, r2bz] = off(i + 1, -hw - 0.1);
        quad(Wc, [l2ax, ya - 0.45, l2az], [r2ax, ya - 0.45, r2az], [r2bx, yb - 0.45, r2bz], [l2bx, yb - 0.45, l2bz], null, cDark.toArray(), [0, -1, 0]);
        // плита для езды (Decks) — шире настила: колёса не проваливаются у перил
        K.decks.slab([p[i][0], ya, p[i][1]], [p[i + 1][0], yb, p[i + 1][1]], D.slab, D.t);
      }
      B.put(M.atlas, G.soup(W.pos, W.uv, W.col, true), null, null);
      B.put(M.col, G.soup(Wc.pos, null, Wc.col, false), null, null);
      // перила: стойки у каждой точки оси, плоский поручень, нижний брус, прутья (атлас), столкновения по кускам
      for (const sg of [1, -1]) {
        for (let i = 0; i < n; i++) {
          const [x, z] = off(i, (hw + 0.05) * sg);
          box(M.met, 0x8d969b, 0.06, D.rail + 0.05, 0.06, x, y[i] - 0.05, z, Math.atan2(-tan[i][1], tan[i][0]));
        }
        const bars = { pos: [], uv: [], col: [] };
        for (let i = 0; i + 1 < n; i++) {
          const [ax, az] = off(i, (hw + 0.05) * sg), [bx, bz] = off(i + 1, (hw + 0.05) * sg), ya = y[i], yb = y[i + 1];
          beam(M.met, 0x9aa2a6, [ax, ya + D.rail, az], [bx, yb + D.rail, bz], 0.14, 0.04);
          beam(M.met, 0x8d969b, [ax, ya + 0.1, az], [bx, yb + 0.1, bz], 0.04, 0.04);
          const ua = s[i] / 2, ub = s[i + 1] / 2, B0 = AT.bars[1], B1 = AT.bars[3];
          quad(bars, [ax, ya + 0.1, az], [bx, yb + 0.1, bz], [bx, yb + D.rail, bz], [ax, ya + D.rail, az], [[ua, B0], [ub, B0], [ub, B1], [ua, B1]], [0.62, 0.66, 0.68]);
          const L2 = Math.hypot(bx - ax, bz - az), cx = (ax + bx) / 2, cz = (az + bz) / 2;
          Object.assign(grid.addOBB(cx, cz, 0.12, L2 + 0.05, Math.atan2(bx - ax, bz - az), Math.max(ya, yb) + D.rail - gr(cx, cz)),
            { y0: Math.min(ya, yb) - 0.45, y1: Math.max(ya, yb) + D.rail });
        }
        B.put(M.atlas, G.soup(bars.pos, bars.uv, bars.col, true), null, null, false);
      }
      // V-стойки (кадр 04): пара белых труб от опоры на земле к низу настила через точку назад и вперёд; поперечина
      let legs = 0;
      for (let i = 2; i < n - 2; i += D.legEvery) {
        const [x, z] = p[i], g = gr(x, z), cl = y[i] - 0.45 - g;
        if (cl < 1.3) continue;
        for (const j of [i - 1, i + 1]) for (const sg of [1, -1]) {
          const [tx, tz] = off(j, 0.9 * sg), [bx, bz] = off(i, 0.25 * sg);
          beam(M.met, 0xe8e8e4, [bx, g - 0.2, bz], [tx, y[j] - 0.45, tz], 0.14, 0.14);
        }
        const [ax, az] = off(i, hw + 0.1), [bx, bz] = off(i, -hw - 0.1);
        beam(M.met, 0xe8e8e4, [ax, y[i] - 0.55, az], [bx, y[i] - 0.55, bz], 0.16, 0.16);
        box(M.col, 0xb8b2a6, 1.0, 0.25, 1.0, x, g - 0.15, z);
        // столкновения: опора и ноги на высоте машины (ноги расходятся вдоль оси на ≈ 2 м к настилу)
        const spread = Math.min(2, 2 * 1.8 / cl) * 2 + 0.6;
        coll(x, z, 1.0, spread, Math.atan2(tan[i][0], tan[i][1]), g - 0.5, y[i] - 0.5);
        legs++;
      }
      stats.deck = { pts: n, len: Math.round(s[n - 1]), legs, y0: +y[0].toFixed(2), y1: +y[n - 1].toFixed(2), max: +Math.max(...y).toFixed(2) };
    }

    /* ---------- амфитеатр: белый бетон — сцена, ступени, площадка, уступ (лидар 50 см, ортофото) ---------- */
    // Столкновения: подступёнок 0,3 м кузов не переезжает — для колёс и кузова ступени — пандус по их передним кромкам
    // (машина взбирается и съезжает, как по бордюрам); сцена, площадка, уступ — ровные поверхности; стенка — только
    // восточная грань уступа (0,8 м: с него можно спрыгнуть, въехать — нет)
    if (L.amphi) {
      const v = [], idx = [];
      const face = (pts, ys) => { const o = v.length / 3; pts.forEach(([x, z], k) => v.push(x, ys[k], z)); idx.push(o, o + 1, o + 2, o, o + 2, o + 3); };
      for (const part of L.amphi) {
        lmPrism(group, M.white, part.ring, part.top - 1.0, part.top);
        if (part.ramp) continue;
        for (const q of part.quads) { K.rk.addWalk(q, part.top); face(q, [part.top, part.top, part.top, part.top]); }
      }
      for (const q of L.amphiRamps) { K.rk.addWalk(q.pts, Math.max(...q.ys), q.ys); face(q.pts, q.ys); }
      const ledge = L.amphi.filter(p => p.ledge), z0 = Math.min(...ledge.flatMap(p => p.ring.map(q => q[1]))), z1 = Math.max(...ledge.flatMap(p => p.ring.map(q => q[1])));
      const lx = P.amphi.ledgeX, y0 = P.amphi.y;
      for (const p of ledge) { const za = Math.min(...p.ring.map(q => q[1])), zb = Math.max(...p.ring.map(q => q[1])); face([[lx, za], [lx, zb], [lx, zb], [lx, za]], [y0 - 0.3, y0 - 0.3, p.top, p.top]); }
      K.meshColliders.push({ v: new Float32Array(v), i: new Uint32Array(idx), walk: true });
      stats.amphi = { parts: L.amphi.length, nodes: L.amphiNodes, ledge: [z0, z1].map(Math.round) };
    }

    /* ---------- спортплощадка (OSM 1573463516, кадр 13): сетчатая клетка, борта, ворота и щиты ---------- */
    const pitch = sp('pitch');
    if (pitch) {
      const F = frame(pitch.ring), corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => ptF(F, a * F.len / 2, b * F.wid / 2));
      const top = groundMax(corners.concat([[F.cx, F.cz]])) + 0.06, gmin = Math.min(...corners.map(([x, z]) => gr(x, z)));
      const turf = lmPrism(new THREE.Group(), M.white, corners, gmin - 0.3, top).geometry;
      B.put(M.col, turf, null, 0x3f8a3a);
      // разметка: контур, средняя линия, круг
      const line = (a, b) => beam(M.col, 0xf2f2ee, [a[0], top + 0.006, a[1]], [b[0], top + 0.006, b[1]], 0.08, 0.012);
      const inr = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => ptF(F, a * (F.len / 2 - 0.5), b * (F.wid / 2 - 0.5)));
      inr.forEach((a, i) => line(a, inr[(i + 1) % 4]));
      line(ptF(F, 0, -F.wid / 2 + 0.5), ptF(F, 0, F.wid / 2 - 0.5));
      for (let k = 0; k < 16; k++) { const a0 = k / 16 * Math.PI * 2, a1 = (k + 1) / 16 * Math.PI * 2; line(ptF(F, Math.cos(a0) * 2.5, Math.sin(a0) * 2.5), ptF(F, Math.cos(a1) * 2.5, Math.sin(a1) * 2.5)); }
      // клетка: стойки через ≈ 3 м, борта 1 м (синие, красный верх), сетка до 4 м; проём на длинных сторонах у угла
      const HC = 4, mesh = { pos: [], uv: [], col: [] }, blue = new THREE.Color(0x2a55a8).toArray();
      const sides = [[0, 1], [1, 2], [2, 3], [3, 0]];
      sides.forEach(([ia, ib], si) => {
        const a = corners[ia], b = corners[ib], len = Math.hypot(b[0] - a[0], b[1] - a[1]), dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len;
        const long = len > (F.len + F.wid) / 2, gaps = long ? [[1.2, 2.6]] : [];
        const runs = []; let s0 = 0;
        for (const [g0, g1] of gaps) { runs.push([s0, g0]); s0 = g1; }
        runs.push([s0, len]);
        for (const [r0, r1] of runs) {
          const A = [a[0] + dx * r0, a[1] + dz * r0], Bp = [a[0] + dx * r1, a[1] + dz * r1], L2 = r1 - r0, nseg = Math.max(1, Math.round(L2 / 3));
          for (let k = 0; k <= nseg; k++) { const x = A[0] + (Bp[0] - A[0]) * k / nseg, z = A[1] + (Bp[1] - A[1]) * k / nseg; box(M.met, 0x24479a, 0.08, HC + 0.3, 0.08, x, top - 0.3, z); }
          // трубы поверху и посередине сетки — издали прутья атласа пропадают, рамка держит клетку
          for (const yy of [HC, 2.5]) beam(M.met, 0x24479a, [A[0], top + yy, A[1]], [Bp[0], top + yy, Bp[1]], 0.06, 0.06);
          const cx = (A[0] + Bp[0]) / 2, cz = (A[1] + Bp[1]) / 2, ry = Math.atan2(-dz, dx);
          box(M.col, 0x1f4fa0, L2, 1.0, 0.05, cx, top, cz, ry);
          box(M.col, 0xc8322a, L2, 0.06, 0.08, cx, top + 1.0, cz, ry);
          const u1 = L2 / 1, Vm0 = AT.mesh[1], Vm1 = AT.mesh[3];
          const pa = [A[0], top + 1.06, A[1]], pb = [Bp[0], top + 1.06, Bp[1]];
          mesh.pos.push(...pa, pb[0], pb[1], pb[2], pb[0], top + HC, pb[2], ...pa, pb[0], top + HC, pb[2], pa[0], top + HC, pa[2]);
          mesh.uv.push(0, Vm0, u1, Vm0, u1, Vm1, 0, Vm0, u1, Vm1, 0, Vm1);
          for (let k = 0; k < 6; k++) mesh.col.push(...blue);
          Object.assign(grid.addOBB(cx, cz, 0.2, L2, Math.atan2(dx, dz), HC + 0.3), { y0: gmin - 0.5, y1: top + HC });
        }
      });
      B.put(M.atlas, G.soup(mesh.pos, mesh.uv, mesh.col, true), null, null, false);
      // ворота у коротких сторон и щиты над ними
      for (const sg of [-1, 1]) {
        const gx = F.len / 2 - 0.15, at = (u, v) => ptF(F, sg * u, v);
        const P0 = at(gx, -1.5), P1 = at(gx, 1.5), Q0 = at(gx - 0.9, -1.5), Q1 = at(gx - 0.9, 1.5);
        for (const q of [P0, P1]) box(M.col, 0xe0581f, 0.08, 2.0, 0.08, q[0], top, q[1]);
        beam(M.col, 0xe0581f, [P0[0], top + 2.0, P0[1]], [P1[0], top + 2.0, P1[1]], 0.08, 0.08);
        for (const [q, r] of [[P0, Q0], [P1, Q1]]) beam(M.col, 0xe0581f, [q[0], top + 2.0, q[1]], [r[0], top + 0.04, r[1]], 0.05, 0.05);
        beam(M.col, 0xe0581f, [Q0[0], top + 0.04, Q0[1]], [Q1[0], top + 0.04, Q1[1]], 0.05, 0.05);
        const bb = at(gx + 0.05, 0);
        box(M.col, 0xf4f4f0, 0.04, 1.05, 1.8, bb[0], top + 2.9, bb[1], F.rot);
        box(M.col, 0xc8322a, 0.05, 0.45, 0.59, bb[0], top + 3.05, bb[1], F.rot);
        const hp = at(gx - 0.35, 0);
        B.put(M.col, new THREE.TorusGeometry(0.23, 0.02, 4, 12).rotateX(Math.PI / 2), G.m(hp[0], top + 3.05, hp[1]), 0xe0581f);
      }
    }

    /* ---------- калистеника (≈ (150, 580), ортофото: белая площадка с перекладинами) ---------- */
    const cal = sp('calis');
    if (cal) {
      // плита по рельефу (на склоне ≈ 1 м — ровный блок торчал бы стеной), 8 см над землёй
      const F = frame(cal.ring), lift = 0.08, yy = (x, z) => gr(x, z) + lift;
      B.put(M.white, lmCanRobertDrape(cal.ring, yy, 1), null, null);
      const mc = 0x5f6a74, post = (u, v, h) => { const [x, z] = ptF(F, u, v), y0 = yy(x, z); cyl(M.met, mc, 0.05, h + 0.3, x, y0 - 0.3, z, 8); coll(x, z, 0.22, 0.22, 0, y0 - 0.5, y0 + h); return [x, z]; };
      const bar = (u0, v0, u1, v1, h) => { const [ax, az] = ptF(F, u0, v0), [bx, bz] = ptF(F, u1, v1), y0 = Math.max(yy(ax, az), yy(bx, bz)); beam(M.met, mc, [ax, y0 + h, az], [bx, y0 + h, bz], 0.035, 0.035); };
      // турник: три стойки поперёк, перекладины 2,3 и 1,9 м
      post(-5.5, -1.3, 2.4); post(-5.5, 0, 2.4); post(-5.5, 1.3, 2.4);
      bar(-5.5, -1.3, -5.5, 0, 2.3); bar(-5.5, 0, -5.5, 1.3, 1.9);
      // брусья: четыре стойки, два бруса 1,2 м
      for (const v of [-0.27, 0.27]) { post(-2.6, v, 1.2); post(-0.6, v, 1.2); bar(-2.7, v, -0.5, v, 1.2); }
      // рукоход: две балки 2,2 м по 3,6 м, перекладины через 0,4 м
      for (const v of [-0.4, 0.4]) { post(0.8, v, 2.2); post(4.4, v, 2.2); bar(0.8, v, 4.4, v, 2.2); }
      for (let u = 1.0; u < 4.3; u += 0.4) bar(u, -0.4, u, 0.4, 2.2);
      // шведская стенка: две стойки 2,4 м, перекладины через 0,27 м
      post(6.2, -0.5, 2.4); post(6.2, 0.5, 2.4);
      for (let h = 0.3; h < 2.4; h += 0.27) bar(6.2, -0.5, 6.2, 0.5, h);
      // скамья для пресса: наклонная доска
      { const [ax, az] = ptF(F, 3.0, 3.0), [bx, bz] = ptF(F, 4.6, 3.0), top = Math.max(yy(ax, az), yy(bx, bz));
        beam(M.col, 0x3e4650, [ax, top + 0.3, az], [bx, top + 0.75, bz], 0.35, 0.06);
        for (const q of [[ax, az, 0.3], [bx, bz, 0.75]]) box(M.met, mc, 0.06, q[2] + 0.2, 0.3, q[0], top - 0.2, q[1], F.rot);
        coll((ax + bx) / 2, (az + bz) / 2, 1.8, 0.45, F.rot, top - 0.3, top + 0.8); }
    }

    /* ---------- буквы «SITGES» (OSM 309927139): белые блоки, лицом к входу с Pg. de Vilafranca ---------- */
    const let_ = sp('letters');
    if (let_) {
      const r = let_.ring, a = [(r[0][0] + r[3][0]) / 2, (r[0][1] + r[3][1]) / 2], b = [(r[1][0] + r[2][0]) / 2, (r[1][1] + r[2][1]) / 2];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]), dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len, ry = Math.atan2(-dz, dx);
      const GL = { S: ['###', '#..', '###', '..#', '###'], I: ['###', '.#.', '.#.', '.#.', '###'], T: ['###', '.#.', '.#.', '.#.', '.#.'], G: ['###', '#..', '#.#', '#.#', '###'], E: ['###', '#..', '##.', '#..', '###'] };
      const word = 'SITGES', cw = 1.65, gap = (len - 6 * cw) / 5, px = cw / 3, py = 0.42, dep = 0.6;
      [...word].forEach((ch, li) => {
        const u0 = li * (cw + gap), rows = GL[ch];
        const g = Math.min(gr(a[0] + dx * u0, a[1] + dz * u0), gr(a[0] + dx * (u0 + cw), a[1] + dz * (u0 + cw)));
        rows.forEach((row, ri) => {
          const yy = g + (4 - ri) * py;
          for (let c = 0; c < 3;) {
            if (row[c] !== '#') { c++; continue; }
            let e = c; while (e + 1 < 3 && row[e + 1] === '#') e++;
            const um = u0 + (c + e + 1) / 2 * px, x = a[0] + dx * um, z = a[1] + dz * um;
            lmBox(group, M.white, (e - c + 1) * px, py + (ri === 4 ? 0.3 : 0), dep, x, yy - (ri === 4 ? 0.3 : 0), z, ry);
            c = e + 1;
          }
        });
        const cm = u0 + cw / 2;
        coll(a[0] + dx * cm, a[1] + dz * cm, cw, dep, ry, g - 0.5, g + 5 * py);
      });
    }

    /* ---------- фонари и скамьи вдоль дорожек парка ---------- */
    {
      const ring = pk.ring, trees = C.trees.filter(t => t.x > L.bb[0] - 2 && t.x < L.bb[1] + 2 && t.z > L.bb[2] - 2 && t.z < L.bb[3] + 2);
      const rings = pk.spots.filter(s => s.ring).map(s => s.ring).concat((L.amphi || []).map(p => p.ring));
      const axis = dk ? dk.p : [];
      const edgeD = (x, z, r) => { let m = Infinity; for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; m = Math.min(m, sitgesSeg(x, z, a[0], a[1], b[0], b[1])); } return m; };
      const okAt = (x, z, rr) => sitgesInPoly(x, z, ring) && edgeD(x, z, ring) > 3 && !trees.some(t => Math.hypot(t.x - x, t.z - z) < rr + 0.8)
        && !rings.some(r => sitgesInPoly(x, z, r) || edgeD(x, z, r) < 2.5) && !axis.some(q => Math.hypot(q[0] - x, q[1] - z) < 5)
        && !C.carriageAt(x, z);
      const PATH = new Set(['footway', 'path', 'cycleway', 'track', 'steps']);
      const lamps = [], benches = [];
      for (const st of C.streets) {
        if (st.drive || !PATH.has(st.cls) || !st.v.some(q => sitgesInPoly(q.x, q.z, ring))) continue;
        let nextL = P.lamps.step / 2, nextB = P.benches.step / 2, side = 1;
        for (let i = 0; i + 1 < st.v.length; i++) {
          const a = st.v[i], b = st.v[i + 1];
          if (a.deck) continue;
          const L0 = b.s - a.s; if (L0 < 0.1) continue;
          const tx = (b.x - a.x) / L0, tz = (b.z - a.z) / L0;
          for (const kind of ['L', 'B']) {
            let nx = kind === 'L' ? nextL : nextB;
            while (nx >= a.s && nx < b.s) {
              const f = nx - a.s, hwq = a.hw + (b.hw - a.hw) * f / L0, sg = kind === 'L' ? side : -side;
              const o = hwq + (kind === 'L' ? P.lamps.off : P.benches.off) + 0.3;
              const x = a.x + tx * f - tz * o * sg, z = a.z + tz * f + tx * o * sg;
              const list = kind === 'L' ? lamps : benches;
              if (okAt(x, z, kind === 'L' ? 0.4 : 1.2) && !lamps.concat(benches).some(q => Math.hypot(q.x - x, q.z - z) < (kind === 'L' ? P.lamps.min : 6))) {
                // спинкой от дорожки: +z модели смотрит к дорожке
                list.push({ x, z, ry: Math.atan2(tz * sg, -tx * sg) });
                if (kind === 'L') side = -side;
                nx += kind === 'L' ? P.lamps.step : P.benches.step;
              } else nx += 3;
            }
            if (kind === 'L') nextL = nx; else nextB = nx;
          }
        }
      }
      // фонари (кадр 13): тонкий столб ≈ 5,5 м с выгнутым кронштейном и плоской головой
      const poleG = G.color(G.cyl(0.06, 5.6, 8, 0.045), 0x5c6066);
      const headG = G.color(mergeGeometries([G.box(0.05, 0.05, 0.75, true).translate(0, 5.5, 0.32), G.box(0.28, 0.1, 0.45).translate(0, 5.42, 0.75)]), 0x40454a);
      const benchG = G.color(mergeGeometries([G.box(1.8, 0.06, 0.45).translate(0, 0.42, 0), G.box(1.8, 0.35, 0.05).translate(0, 0.55, -0.22),
        G.box(0.08, 0.45, 0.45).translate(-0.75, 0, 0), G.box(0.08, 0.45, 0.45).translate(0.75, 0, 0)]), 0x7a5a3c);
      // стекло под головой; ночью светится, как столбы кварталов этапа 7 (группа A: S.glow — стекло, S.lights — ореол
      // и пятно света на земле, без источников света; у сбитого гаснут) — помощники этапа 7 появляются позже строений,
      // поэтому огни ставит K.lmAfterStreet (js/maps/sitges/build.js, после sitgesBuildStreet)
      const glassG = G.box(0.24, 0.03, 0.4).translate(0, 5.395, 0.75);
      const inst = (geo, mat, list) => { const m = new THREE.InstancedMesh(geo, mat, list.length); m.castShadow = m.receiveShadow = true; return m; };
      if (lamps.length) {
        const mP = inst(poleG, M.met, lamps), mH = inst(headG, M.col, lamps), mG = inst(glassG, M.col, lamps);
        mG.castShadow = false;
        const Bk = new Breakables([mP, mH, mG], { mass: 120, anchor: 4, minSpeed: 5, dmg: 0.25, cy: 2.6, lie: 1.5, kind: 'post' });
        for (const q of lamps) q.it = Bk.add(grid, q.x, gr(q.x, q.z), q.z, q.ry, 0.12, 5.6);
        for (const m of [mP, mH, mG]) { m.computeBoundingSphere(); m.boundingSphere.radius += 6; dyn.add(m); }
        for (const E of Bk.meshes) E.pad = 6;
        brks.push(Bk);
        (K.lmAfterStreet || (K.lmAfterStreet = [])).push(S => {
          mG.material = S.glow(0xc8ccd0, 0xfff4e0);
          const c = q => [Math.cos(q.ry), Math.sin(q.ry)];
          S.cur = 'park';
          S.lights(lamps.map(q => { const [cc, ss] = c(q), y = gr(q.x, q.z); return { x: q.x + 0.75 * ss, y: y + 5.38, z: q.z + 0.75 * cc, gx: q.x + 1.75 * ss, gz: q.z + 1.75 * cc, r: 5, it: q.it }; }), { size: 2.8 });
          S.cur = null;
        });
      }
      if (benches.length) {
        const mB = inst(benchG, M.col, benches);
        const Bk = new Breakables([mB], { mass: 60, anchor: 1, minSpeed: 3, dmg: 0.1, cy: 0.4, lie: 1.2, kind: 'wood' });
        for (const q of benches) Bk.add(grid, q.x, gr(q.x, q.z), q.z, q.ry, 0.5, 0.9);
        mB.computeBoundingSphere(); mB.boundingSphere.radius += 6; dyn.add(mB);
        for (const E of Bk.meshes) E.pad = 6;
        brks.push(Bk);
      }
      stats.lamps = lamps.length; stats.benches = benches.length;
    }

    B.flush(group);
    L.stats = stats;
  },
};

/* ---------- амфитеатр: части (сцена, ступени, площадка, уступ) ---------- */
// ring сцены (П0): (−83, 572,5) (−97, 572,5) (−93, 549) (−83, 549) — северный край (0 → 1), восточный (1 → 2);
// ступени — полосами от северного и восточного края наружу, площадка — за последней ступенью, уступ — с запада.
// Части — { ring, top, quads } (quads — четырёхугольники верха для walkAt)
function lmCanRobertAmphi(ring, A) {
  const [p0, p1, p2, p3] = ring;
  // северный край: z = p0.z + d (наружу +z); восточный: p1 → p2, наружная нормаль — от центра сцены
  const ex = p2[0] - p1[0], ez = p2[1] - p1[1], el = Math.hypot(ex, ez), e = [ex / el, ez / el];
  let n = [-e[1], e[0]];
  const cx = (p0[0] + p1[0] + p2[0] + p3[0]) / 4, cz = (p0[1] + p1[1] + p2[1] + p3[1]) / 4;
  if (n[0] * (cx - p1[0]) + n[1] * (cz - p1[1]) > 0) n = [-n[0], -n[1]];
  // угол полосы на отступе d: пересечение z = p1.z + d и линии p1 + n·d + e·t
  const corner = d => { const t = (d - n[1] * d) / e[1]; return [p1[0] + n[0] * d + e[0] * t, p1[1] + n[1] * d + e[1] * t]; };
  const west = d => [A.ledgeX, p0[1] + d], south = d => [p2[0] + n[0] * d, p2[1] + n[1] * d];
  const band = (d0, d1) => {
    const c0 = corner(d0), c1 = corner(d1);
    return { ring: [west(d0), c0, south(d0), south(d1), c1, west(d1)], quads: [[west(d0), c0, c1, west(d1)], [c0, south(d0), south(d1), c1]] };
  };
  const parts = [{ ring: ring.map(q => q.slice()), top: A.y, cut: 0.12, quads: [ring.map(q => q.slice())] }];
  for (let k = 1; k <= A.n; k++) parts.push(Object.assign(band((k - 1) * A.run, k * A.run), { top: A.y + A.rise * k, cut: 0.57, ramp: true }));
  const dN = A.n * A.run;
  parts.push(Object.assign(band(dN, dN + A.land), { top: A.y + A.rise * A.n, cut: 0.12 }));
  // пандус ступеней для колёс и кузова: от кромки сцены (A.y) до верха последней ступени
  const yT = A.y + A.rise * A.n, R0 = band(0, dN).quads;
  parts.ramps = R0.map(q => ({ pts: q, ys: [A.y, A.y, yT, yT] }));
  // уступ с запада: от x = ledgeX на ledgeW м (x игры растёт на запад) по всей длине сцены и ступеней
  // южная часть — у сцены (верх ledgeY), северная — у ступеней и площадки (верх как у площадки)
  const z0 = Math.min(p3[1], p0[1]) - 0.5, zm = p0[1] + dN / 2, z1 = p0[1] + dN + A.land, wx = A.ledgeX + A.ledgeW;
  for (const [za, zb, top] of [[z0, zm, A.ledgeY], [zm, z1, A.y + A.rise * A.n]]) {
    const led = [[A.ledgeX, za], [wx, za], [wx, zb], [A.ledgeX, zb]];
    parts.push({ ring: led, top, cut: 0.12, quads: [led], ledge: true });
  }
  return parts;
}

/* ---------- ось и высоты настила мостика ---------- */
// dk — настил П0 (C.parks[].decks: p — ось через 2 м, h — высота), gr — высота земли. Ось П0 (полоса лидара) идёт
// зигзагом ± 1 м — на фото мостик прямой: скользящее среднее по ± 3 точки дважды, концы на месте. Высота — лидар, не
// ниже земли (концы — на земле: въезд без ступеньки), сглажена по трём точкам. → { p, y, tan (единичные), s (путь, м) }
function lmCanRobertDeck(dk, gr) {
  const n = dk.p.length;
  let p = dk.p.map(q => q.slice());
  for (let pass = 0; pass < 2; pass++) p = p.map((q, i) => {
    if (i === 0 || i === n - 1) return q;
    const k = Math.min(3, i, n - 1 - i); let x = 0, z = 0;
    for (let j = i - k; j <= i + k; j++) { x += p[j][0]; z += p[j][1]; }
    return [x / (2 * k + 1), z / (2 * k + 1)];
  });
  let y = p.map(([x, z], i) => Math.max(dk.h[i], gr(x, z) + 0.02));
  y = y.map((v, i) => i === 0 || i === n - 1 ? v : Math.max(gr(p[i][0], p[i][1]) + 0.02, (y[i - 1] + 2 * v + y[i + 1]) / 4));
  const tan = p.map((q, i) => { const a = p[Math.max(0, i - 1)], b = p[Math.min(n - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]); return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; });
  const s = [0]; for (let i = 1; i < n; i++) s.push(s[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
  return { p, y, tan, s };
}

/* ---------- деревья 4б у мостика и амфитеатра ---------- */
// Из sitgesData (js/maps/sitges/plan.js) сразу после sitgesPlanTrees: деревья — по кронам лидара, ствол — в центре
// кроны. У мостика лидар видит и сам настил (в 4–6 м над низиной) — «деревья» вдоль оси с верхом на высоте настила;
// живые кроны у края свисают на настил ниже перил. Над амфитеатром кроны сосен — стволы попадают на сцену и ступени.
// Правило (числа — SITGES_LM_CANROBERT.trees): крона (центр и радиус, низ и верх — как у модели, sitgesTreeMats)
// заходит в полосу настила (по высоте от низа − down до верха + up, вбок — до края с перилами) — дерево сдвигается от
// оси, пока крона не выйдет за край; дальше deckShift — убирается. Ствол на бетоне амфитеатра — за ближний край
// его частей (зазор pad), дальше amphiShift — убирается. Меняет C.trees; сводка — C.parkTreeFix.
function lmCanRobertTrees(C) {
  const L = (C.landmarks || []).find(l => l.id === 'canrobert'), pk = L && L.park;
  if (!pk || !C.trees) return;
  const T = SITGES_LM_CANROBERT.trees, gr = C.ground, forms = sitgesTreeKit().forms, hw = SITGES_LM_CANROBERT.deck.w / 2 + 0.15;
  const dk = pk.decks[0] && lmCanRobertDeck(pk.decks[0], gr), parts = L.amphi || [];
  const bb = L.bb, fix = { moved: [], removed: [] };
  // ближняя точка оси настила: расстояние, высота настила, нормаль от оси к точке
  const axis = (x, z) => {
    let best = { d: Infinity };
    for (let i = 1; i < dk.p.length; i++) {
      const [ax, az] = dk.p[i - 1], [bx, bz] = dk.p[i], ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez;
      const t = clamp(((x - ax) * ex + (z - az) * ez) / l2, 0, 1), px = ax + ex * t, pz = az + ez * t, d = Math.hypot(x - px, z - pz);
      if (d < best.d) { const l = Math.sqrt(l2); best = { d, y: dk.y[i - 1] + (dk.y[i] - dk.y[i - 1]) * t, nx: d > 1e-3 ? (x - px) / d : -ez / l, nz: d > 1e-3 ? (z - pz) / d : ex / l, end: t === 0 && i === 1 || t === 1 && i === dk.p.length - 1 }; }
    }
    return best;
  };
  const crown = t => {
    const f = forms[t.f], d = Math.min(f.dmax * t.h, Math.max(f.dmin * t.h, f.cd * t.r)), c = Math.cos(t.ry), s = Math.sin(t.ry);
    const lx = f.top[0] * t.h, lz = f.top[1] * t.h;
    return { x: t.x + lx * c + lz * s, z: t.z - lx * s + lz * c, bot: t.y + t.h - d, top: t.y + t.h, tr: f.tr * t.h };
  };
  const edgeD = (x, z, r) => { let m = Infinity; for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; m = Math.min(m, sitgesSeg(x, z, a[0], a[1], b[0], b[1])); } return m; };
  const onAmphi = (x, z, m) => parts.some(p => sitgesInPoly(x, z, p.ring) || edgeD(x, z, p.ring) < m);
  const out = [];
  for (const t of C.trees) {
    if (t.x < bb[0] - 10 || t.x > bb[1] + 10 || t.z < bb[2] - 10 || t.z > bb[3] + 10) { out.push(t); continue; }
    let { x, z } = t, why = null;
    // мостик
    if (dk) {
      const c = crown(t), a = axis(c.x, c.z);
      if (!a.end && a.d < t.r + hw && c.top > a.y - 0.45 - T.down && c.bot < a.y + T.up) {
        const need = t.r + hw - a.d + 0.05;
        if (need > T.deckShift) why = 'deck';
        else { x += a.nx * need; z += a.nz * need; }
      }
    }
    // амфитеатр
    if (!why && parts.length) {
      const m = crown(t).tr + T.pad;
      if (onAmphi(x, z, m)) {
        let best = null;
        for (const p of parts) for (let i = 0; i < p.ring.length; i++) {
          const a = p.ring[i], b = p.ring[(i + 1) % p.ring.length], ex = b[0] - a[0], ez = b[1] - a[1], l2 = ex * ex + ez * ez;
          const u = clamp(((x - a[0]) * ex + (z - a[1]) * ez) / l2, 0, 1), px = a[0] + ex * u, pz = a[1] + ez * u, l = Math.sqrt(l2);
          for (const sg of [1, -1]) {
            const qx = px - ez / l * (m + 0.05) * sg, qz = pz + ex / l * (m + 0.05) * sg, d = Math.hypot(qx - x, qz - z);
            if ((!best || d < best.d) && !onAmphi(qx, qz, m)) best = { x: qx, z: qz, d };
          }
        }
        if (!best || best.d > T.amphiShift) why = 'amphi';
        else { x = best.x; z = best.z; }
      }
    }
    const r2 = v => Math.round(v * 10) / 10;
    if (why) { fix.removed.push([r2(t.x), r2(t.z), why]); continue; }
    if (x !== t.x || z !== t.z) {
      fix.moved.push([r2(t.x), r2(t.z), r2(Math.hypot(x - t.x, z - t.z))]);
      out.push(Object.assign({}, t, { x, z, y: gr(x, z) }));
    } else out.push(t);
  }
  C.trees = out;
  C.parkTreeFix = fix;
}

/* ---------- плита по рельефу ---------- */
// четырёхугольник ring (4 точки) сеткой ≈ step м: верх на высоте yAt(x, z), бока до yAt − 0,3 (uv — метры / LMK.uv)
function lmCanRobertDrape(ring, yAt, step = 1) {
  const [a, b, c, d] = ring, nu = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step)), nv = Math.max(1, Math.ceil(Math.hypot(d[0] - a[0], d[1] - a[1]) / step));
  const P = (u, v) => { const x = (a[0] * (1 - u) + b[0] * u) * (1 - v) + (d[0] * (1 - u) + c[0] * u) * v, z = (a[1] * (1 - u) + b[1] * u) * (1 - v) + (d[1] * (1 - u) + c[1] * u) * v; return [x, yAt(x, z), z]; };
  const pos = [], uv = [], U = LMK.uv;
  const tri = (A, B2, C2, up) => {
    const nx = (B2[1] - A[1]) * (C2[2] - A[2]) - (B2[2] - A[2]) * (C2[1] - A[1]), ny = (B2[2] - A[2]) * (C2[0] - A[0]) - (B2[0] - A[0]) * (C2[2] - A[2]);
    const flip = up ? ny < 0 : false;
    for (const q of flip ? [A, C2, B2] : [A, B2, C2]) { pos.push(...q); uv.push((q[0] + q[1] * 0.3) / U, (q[2] + q[1] * 0.3) / U); }
    return nx;
  };
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const p00 = P(i / nu, j / nv), p10 = P((i + 1) / nu, j / nv), p11 = P((i + 1) / nu, (j + 1) / nv), p01 = P(i / nu, (j + 1) / nv);
    tri(p00, p10, p11, true); tri(p00, p11, p01, true);
  }
  // бока: наружу от середины
  const cx = (a[0] + b[0] + c[0] + d[0]) / 4, cz = (a[1] + b[1] + c[1] + d[1]) / 4;
  const edge = (u0, v0, u1, v1, n) => {
    for (let k = 0; k < n; k++) {
      const A = P(u0 + (u1 - u0) * k / n, v0 + (v1 - v0) * k / n), B2 = P(u0 + (u1 - u0) * (k + 1) / n, v0 + (v1 - v0) * (k + 1) / n);
      const A2 = [A[0], A[1] - 0.3, A[2]], B3 = [B2[0], B2[1] - 0.3, B2[2]];
      const ox = (A[0] + B2[0]) / 2 - cx, oz = (A[2] + B2[2]) / 2 - cz, ex = B2[0] - A[0], ez = B2[2] - A[2];
      const out = (ez * ox - ex * oz) > 0;     // нормаль (ez, −ex) смотрит наружу
      const quad = out ? [A, B2, B3, A2] : [A, A2, B3, B2];
      for (const q of [quad[0], quad[1], quad[2], quad[0], quad[2], quad[3]]) { pos.push(...q); uv.push((q[0] + q[2]) / U, q[1] / U); }
    }
  };
  edge(0, 0, 1, 0, nu); edge(1, 0, 1, 1, nv); edge(1, 1, 0, 1, nu); edge(0, 1, 0, 0, nv);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/* ---------- материалы ---------- */
let _lmCrMats = null;
function lmCanRobertMats() {
  if (_lmCrMats) return _lmCrMats;
  const sh = m => { m.userData.shared = true; return m; };
  const tex = new THREE.CanvasTexture(lmCanRobertAtlas());
  tex.wrapS = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  _lmCrMats = {
    white: lmMat(0xe9e6de, { tex: 'plaster', rough: 0.85 }),
    col: sh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 })),
    met: sh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.45 })),
    atlas: sh(new THREE.MeshStandardMaterial({ vertexColors: true, map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.75 })),
  };
  return _lmCrMats;
}

/* ---------- атлас: полосы по высоте холста 512 × 512 (u повторяется) ---------- */
// полоса — [u0, v0, u1, v1] в координатах текстуры (v снизу вверх)
const LM_CR_ATLAS = (() => {
  const band = (y0, y1, u0 = 0, u1 = 1) => [u0, 1 - (y1 - 2) / 512, u1, 1 - (y0 + 2) / 512];
  return { bars: band(0, 64), mesh: band(64, 192), picket: band(192, 256), planks: band(256, 320), sign: band(320, 448, 0, 0.5), cow: band(320, 448, 0.5, 1) };
})();
function lmCanRobertAtlas() {
  const N = 512, c = document.createElement('canvas'); c.width = c.height = N;
  const x = c.getContext('2d');
  let s = 4242; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  x.clearRect(0, 0, N, N);
  // прутья перил: 16 на повтор (2 м) — шаг 12,5 см
  x.fillStyle = '#e8ecee'; for (let k = 0; k < 16; k++) x.fillRect(k * 32 + 14, 0, 5, 64);
  // сварная сетка: вертикальные через 5 см (повтор 1 м), горизонтальные через ≈ 20 см
  x.fillStyle = '#f0f2f2';
  for (let k = 0; k < 20; k++) x.fillRect(Math.round(k * 25.6), 64, 2, 128);
  for (let k = 0; k <= 6; k++) x.fillRect(0, 64 + 2 + Math.round(k * 20.6), N, 2);
  // штакетник: 8 досок с острым верхом на повтор (1 м), две поперечины
  for (let k = 0; k < 8; k++) {
    const x0 = k * 64 + 8, w = 44, sh = 200 + Math.floor(rnd() * 40);
    x.fillStyle = `rgb(${sh},${sh},${sh})`;
    x.beginPath(); x.moveTo(x0, 255); x.lineTo(x0, 200); x.lineTo(x0 + w / 2, 193); x.lineTo(x0 + w, 200); x.lineTo(x0 + w, 255); x.fill();
  }
  x.fillStyle = '#bdbdbd'; x.fillRect(0, 210, N, 7); x.fillRect(0, 240, N, 7);
  // доски настила: 16 на повтор (3,2 м), стыки темнее
  for (let k = 0; k < 16; k++) { const v = 205 + Math.floor(rnd() * 40); x.fillStyle = `rgb(${v},${v - 6},${v - 14})`; x.fillRect(k * 32, 256, 32, 64); x.fillStyle = '#6d655a'; x.fillRect(k * 32, 256, 2, 64); }
  // табличка «Àrea d'esbarjo de gossos» (кадр 09): жёлтый щит с тёмными строками
  x.fillStyle = '#e6c21e'; x.fillRect(4, 324, 248, 120);
  x.fillStyle = '#2d6a3a'; x.fillRect(4, 324, 248, 26);
  x.fillStyle = '#ffffff'; x.font = 'bold 15px sans-serif'; x.fillText("Àrea d'esbarjo de gossos", 14, 343);
  x.fillStyle = '#2b2b2b'; for (let k = 0; k < 7; k++) x.fillRect(16, 360 + k * 11, 150 + Math.floor(rnd() * 70), 4);
  x.beginPath(); x.arc(214, 410, 20, 0, 7); x.fill();
  // «корова» (кадр 03): белый силуэт с чёрными пятнами и мордой
  x.fillStyle = '#f7f7f4';
  x.beginPath(); x.ellipse(372, 392, 98, 40, 0, 0, 7); x.fill();
  x.beginPath(); x.ellipse(468, 372, 30, 34, 0, 0, 7); x.fill();
  x.fillRect(300, 400, 18, 44); x.fillRect(332, 404, 18, 40); x.fillRect(400, 404, 18, 40); x.fillRect(432, 400, 18, 44);
  x.fillStyle = '#151515';
  for (const [ex, ey, rx, ry] of [[330, 380, 22, 16], [380, 404, 26, 14], [420, 372, 18, 20], [300, 396, 12, 10], [460, 360, 10, 8]]) { x.beginPath(); x.ellipse(ex, ey, rx, ry, rnd(), 0, 7); x.fill(); }
  x.fillStyle = '#e8a8a8'; x.beginPath(); x.ellipse(470, 392, 18, 10, 0, 0, 7); x.fill();
  x.fillStyle = '#151515'; x.beginPath(); x.arc(458, 364, 4, 0, 7); x.arc(480, 364, 4, 0, 7); x.fill();
  return c;
}

/* ---------- геометрия: копилка по материалам ---------- */
const lmCanRobertGeo = {
  // ящик w × h × d, низ в y = 0 (center — центр в начале координат)
  box(w, h, d, center = false) { const g = new THREE.BoxGeometry(w, h, d); if (!center) g.translate(0, h / 2, 0); return g; },
  cyl(r, h, seg = 6, rt = r) { return new THREE.CylinderGeometry(rt, r, h, seg).translate(0, h / 2, 0); },
  // плоскость w × h в x–y (низ в y0, лицом +z), uv — полоса атласа R, повтор по u: w / uw раз, по v: h / vh доля полосы
  quad(w, h, R, y0 = 0, uw = 1, vh = 1, whole = false) {
    const g = new THREE.PlaneGeometry(w, h).translate(0, h / 2 + y0, 0), uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i), v = uv.getY(i);
      uv.setXY(i, whole ? R[0] + (R[2] - R[0]) * u : u * w / uw, R[1] + (R[3] - R[1]) * Math.min(1, v * (whole ? 1 : vh)));
    }
    return g;
  },
  color(g, hex) { const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) c.toArray(a, i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; },
  // матрица: сдвиг, поворот вокруг y и наклон вокруг локальной x (rx)
  m(x, y, z, ry = 0, rx = 0) { return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, 0, 'YXZ')), new THREE.Vector3(1, 1, 1)); },
  // брус из центра-ящика (box(..., true), длина 1 по z) между точками a и b
  beam(a, b) {
    const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b), L = A.distanceTo(Bv), m = new THREE.Matrix4();
    const up = Math.abs(Bv.y - A.y) / Math.max(L, 1e-6) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    m.lookAt(A, Bv, up); m.scale(new THREE.Vector3(1, 1, L)); m.setPosition(A.clone().add(Bv).multiplyScalar(0.5));
    return m;
  },
  // треугольники подряд: позиции, uv, цвета (нормали считаются)
  soup(pos, uv, col, withUv) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(withUv && uv ? uv : new Array(pos.length / 3 * 2).fill(0), 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  },
};
function lmCanRobertBatch() {
  const by = new Map();
  return {
    // geo — геометрия (с цветом или col — цвет на всё), mtx — матрица (или null), shadow — отбрасывает тень
    put(mat, geo, mtx, col, shadow = true) {
      let g = geo.index ? geo.toNonIndexed() : geo;
      if (mtx) g.applyMatrix4(mtx);
      if (col !== null && col !== undefined) lmCanRobertGeo.color(g, col);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
      if (!g.attributes.normal) g.computeVertexNormals();
      const key = mat.uuid + (shadow ? 's' : 'n');
      let e = by.get(key); if (!e) by.set(key, e = { mat, shadow, list: [] });
      e.list.push(g);
    },
    flush(group) {
      for (const e of by.values()) {
        const m = new THREE.Mesh(mergeGeometries(e.list), e.mat);
        m.castShadow = e.shadow; m.receiveShadow = true;
        group.add(m);
      }
      by.clear();
    },
  };
}

// Старый мостик этапа 2 (дорожка OSM 144382809 строилась обычным мостом с каменным настилом и парапетами) на месте
// подвесного: (a, b) — соседние точки улицы с настилом (a.deck) → true, если отрезок лежит на оси настила парка
// (C.parks[].decks, не дальше 3 м) — его не строит roads3d.js (лента, настил, парапеты). У улиц нет номера OSM —
// опознание по геометрии; только когда строение парка готово.
function lmCanRobertOldDeck(C) {
  if (!SITGES_LM_CANROBERT.ready || !C.parks) return () => false;
  const axes = C.parks.flatMap(pk => pk.decks.map(d => d.p));
  const near = (x, z) => axes.some(p => { for (let i = 1; i < p.length; i++) if (sitgesSeg(x, z, p[i - 1][0], p[i - 1][1], p[i][0], p[i][1]) < 3) return true; return false; });
  return (a, b) => !!a.deck && near(a.x, a.z) && near(b.x, b.z) && near((a.x + b.x) / 2, (a.z + b.z) / 2);
}
