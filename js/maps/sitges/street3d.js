// Ситжес — ПОСТРОЙКА: мелочи улиц, этап 7 (план — docs/sitges/stage-7.md, «Каркас»). После деревьев — последний этап
// перед склейкой статики (buildSitges, js/maps/sitges/build.js). Раскладка — C.street (js/maps/sitges/street.js);
// группы A → G (js/maps/sitges/st/<группа>.js) строят себя через помощники S = K.st; не готовые группы не вызываются —
// без готовых групп этот этап ничего не добавляет в мир (отпечаток мира тот же).
// Помощники (координаты игры; модель — в своих координатах: основание в y = 0, «лицо» к +z):
//   S.y(x, z, yMax) — высота поверхности под точкой: рельеф, верх тротуара (walkAt), настил моста не выше yMax.
//   S.mat(hex, o) — общий MeshStandardMaterial (кэш по цвету и параметрам, userData.shared); o — как у stdMat.
//   S.glow(day, night) — MeshBasicMaterial «лампа»: цвет day днём, night вечером и ночью (как плафоны «Города»).
//   S.place(parts, items, o) — модель экземплярами по квадратам o.chunk м, квадрат скрыт дальше o.far м от камеры:
//     parts — [{ geo, mat, shadow = true, per, loc }] (per экземпляров на предмет со своими матрицами loc — несколько
//     голов фонаря); items — [{ x, z, y, ry, s, rx, rz, color }] (y — по умолчанию S.y; color — цвет экземпляра).
//     o.brk — параметры Breakables (масса, порог… — js/world.js) и o.hit = { r, h }: предмет сбиваемый, в сетке
//     столкновений круг r × s; иначе неподвижный: o.hit — круг { r, h } или o.box — { w, d, h } (повёрнутый ящик),
//     без них — без столкновений. Неподвижные отбрасывают тень теневыми копиями (buildShadowProxies), сбиваемые — сами
//     (группа userData.dynamic). → { meshes, brks }; у предмета появляется it.brk (элемент Breakables).
//   S.lights(list, o) — ночные огни без источников света: ореол (Points лицом к камере) и пятно света на земле;
//     list — [{ x, y, z, gx, gz, r, it }] (ореол в x, y, z; пятно в gx, gz радиусом r; it — элемент Breakables: у сбитого
//     гаснет); o — { color, size, pool, poolColor, far }. Видны вечером и ночью (setNight), квадратами со скрытием.
//   S.circle(x, z, r, h), S.box(x, z, w, d, rot, h) — неподвижное в сетке столкновений (K.grid).
//   S.collider(v, i, walk) — «неровность» на полотне и т. п. (7.1): своя сетка столкновений из треугольников (v — x, y, z
//     подряд, i — индексы) → K.meshColliders (world.meshColliders); пустая не добавляется. walk — поверхность на проезжей
//     части (у неё есть и S.walk): машины трафика за неё не цепляются, высоту им задаёт водитель.
//   S.walk(pts, ys) — поверхность (7.1): четырёхугольник [[x, z] × 4] с высотой ys (число) или высотами углов [y × 4]
//     → walkAt (S.y, world.surface, покрытие); рисовать и ставить столкновения — самой группе (S.collider).
//   S.hash(x, z, k) — число 0…1 по месту (7.2; то же, что S.hash раскладки — sitgesStHash, js/maps/sitges/street.js).
//   S.mesh(key, mat, o) — своя геометрия, склеенная по квадратам (7.2; стены, настилы, разметка, тенты): копилка на ключ
//     (тот же key в той же группе — та же копилка); o — { shadow = true, chunk = 160, far = 300, index = true, uv = true,
//     color = false, keep = false (true — не склеивать с чужими в optimizeStatic) }. Писатель W (сама копилка — квадрат
//     по середине каждой грани; W.at(x, z) — всё в квадрат точки): W.face(vs, n, uv, col) — веер вершин [x, y, z] с нормалью
//     n, uv [[u, v]], цвет [r, g, b]; W.poly(vs, uv, hint, col) — нормаль по первым трём вершинам, обход лицом к hint,
//     вырожденная — пропуск; W.beam(a, b, h, hw, uA, uB, col) — брус вдоль отрезка a–b ([x, z, низ]): верх и две грани.
//   S.flush() — копилки → меши (по порядку появления квадратов; K.roadLod, сводка группы); вызывается и сам после build
//     группы — явно, чтобы меши встали в группе раньше экземпляров (порядок влияет на склейку статики).
//   S.count(n) — штук в сводку группы (то, что строится не через place).
//   S.cur — буква группы, которую строят сейчас: place и lights пишут сводку K.stStats[S.cur] (штук, треугольников,
//     мешей = вызовов отрисовки, сбиваемых, огней) → world.stats.street (tools/sitges/street-debug.js, __stInfo).
// В мир: K.stBrks (Breakables → world.breakables), K.stUpdate(dt), K.stReset(), K.stNight(k).
// Определяет: SITGES_ST3D, sitgesBuildStreet.
// Использует: stdMat, geoTris, Breakables, FLAT_QUAD, setInst (js/world.js); Sky (js/sky.js); sitgesStHash,
//   sitgesStGroups (js/maps/sitges/street.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const SITGES_ST3D = {
  chunk: 160,       // квадрат экземпляров, м
  far: 300,         // квадрат виден не дальше, м (мелочь)
  lightFar: 450,    // ореолы и пятна света — не дальше, м
  pool: 6,          // радиус пятна света, м
  check: 0.4,       // раз в столько с — проверка сбитых огней
};

function sitgesBuildStreet(K) {
  const { D, group, grid, decks, walkAt, roadLod } = K, C = D.C, P = SITGES_ST3D;
  const brks = K.stBrks = [], stats = K.stStats = {}, glows = [], haloMats = [], lightSets = [];
  let dyn = null, night = null;                    // корни создаются при первом сбиваемом / огне
  const dynRoot = () => { if (!dyn) { dyn = new THREE.Group(); dyn.name = 'street-brk'; dyn.userData.dynamic = true; group.add(dyn); } return dyn; };
  const nightRoot = () => { if (!night) { night = new THREE.Group(); night.name = 'street-night'; night.visible = false; night.userData.dynamic = true; group.add(night); } return night; };
  const stat = () => stats[S.cur] || (stats[S.cur] = { n: 0, tris: 0, meshes: 0, brk: 0, lights: 0 });
  const chunks = (items, CH) => {
    const m = new Map();
    for (const it of items) { const k = Math.floor(it.x / CH) * 65536 + Math.floor(it.z / CH); let a = m.get(k); if (!a) m.set(k, a = []); a.push(it); }
    return [...m.values()];
  };
  const lod = (mesh, far) => {
    mesh.computeBoundingSphere();
    const s = mesh.boundingSphere;
    roadLod.push({ mesh, x: s.center.x, z: s.center.z, r: s.radius, far });
  };
  const _m = new THREE.Matrix4(), _l = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
  const matCache = new Map(), bufs = new Map(), builders = new Map();     // копилки S.mesh (до S.flush)

  const S = K.st = {
    cur: null,
    y: (x, z, yMax = Infinity) => {
      const w = walkAt ? walkAt(x, z) : -Infinity;
      return Math.max(D.ground(x, z), decks ? decks.surface(x, z, yMax) : -Infinity, w <= yMax ? w : -Infinity);
    },
    mat(hex, o = {}) {
      const key = hex + JSON.stringify(o);
      let m = matCache.get(key);
      if (!m) { m = stdMat(hex, o); m.userData.shared = true; matCache.set(key, m); }
      return m;
    },
    glow(day, nightHex) {
      const m = new THREE.MeshBasicMaterial({ color: day });
      m.userData.shared = true; glows.push({ m, day, night: nightHex });
      return m;
    },
    place(parts, items, o = {}) {
      const CH = o.chunk || P.chunk, far = o.far || P.far, out = { meshes: [], brks: [] }, st = stat();
      if (!items.length) return out;
      for (const it of items) if (it.y === undefined) it.y = S.y(it.x, it.z);
      for (const arr of chunks(items, CH)) {
        const meshes = parts.map(pt => {
          const per = pt.per || 1, m = new THREE.InstancedMesh(pt.geo, pt.mat, arr.length * per);
          m.castShadow = pt.shadow !== false; m.receiveShadow = true;
          if (arr.some(it => it.color !== undefined)) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(arr.length * per * 3).fill(1), 3);
          st.meshes++; st.tris += geoTris(pt.geo) * arr.length * per;
          return per > 1 ? { mesh: m, per, loc: pt.loc } : m;
        });
        const M = meshes.map(E => E.mesh || E);
        if (o.brk) {
          const B = new Breakables(meshes, o.brk), r = (o.hit && o.hit.r) || 0.2, h = (o.hit && o.hit.h) || 1;
          arr.forEach(it => { const s = it.s || 1; it.brk = B.add(grid, it.x, it.y, it.z, it.ry || 0, r * s, h * s, { s, rx: it.rx, rz: it.rz }); });
          for (const E of B.meshes) E.pad = 6;
          brks.push(B); out.brks.push(B); st.brk += arr.length;
          for (const m of M) dynRoot().add(m);
        } else {
          arr.forEach((it, i) => {
            _q.setFromEuler(_e.set(it.rx || 0, it.ry || 0, it.rz || 0));
            _m.compose(_p.set(it.x, it.y, it.z), _q, _s.setScalar(it.s || 1));
            parts.forEach((pt, k) => {
              const per = pt.per || 1;
              for (let j = 0; j < per; j++) M[k].setMatrixAt(i * per + j, pt.loc ? _l.multiplyMatrices(_m, pt.loc[j]) : _m);
            });
            const s = it.s || 1;
            if (o.hit) grid.addCircle(it.x, it.z, o.hit.r * s, o.hit.h * s);
            else if (o.box) grid.addOBB(it.x, it.z, o.box.w * s, o.box.d * s, it.ry || 0, o.box.h * s);
          });
          for (const m of M) group.add(m);
        }
        arr.forEach((it, i) => {
          if (it.color === undefined) return;
          _c.set(it.color);
          for (let k = 0; k < M.length; k++) { const per = parts[k].per || 1; for (let j = 0; j < per; j++) M[k].setColorAt(i * per + j, _c); }
        });
        for (const m of M) { if (m.instanceColor) m.instanceColor.needsUpdate = true; m.instanceMatrix.needsUpdate = true; lod(m, far); if (o.brk) m.boundingSphere.radius += 6; out.meshes.push(m); }
      }
      st.n += items.length;
      return out;
    },
    lights(list, o = {}) {
      const st = stat();
      if (!list.length) return;
      const halo = o.color !== undefined || o.size !== undefined ? Sky.mats.halo.clone() : Sky.mats.halo;
      const pool = o.poolColor !== undefined ? Sky.mats.pool.clone() : Sky.mats.pool;
      if (halo !== Sky.mats.halo) { if (o.color !== undefined) halo.color.set(o.color); if (o.size !== undefined) halo.size = o.size; haloMats.push(halo); }
      if (pool !== Sky.mats.pool) { pool.color.set(o.poolColor); haloMats.push(pool); }
      for (const arr of chunks(list, P.chunk)) {
        const pos = new Float32Array(arr.length * 3), pools = new THREE.InstancedMesh(FLAT_QUAD, pool, arr.length);
        arr.forEach((L, i) => {
          L.gx = L.gx ?? L.x; L.gz = L.gz ?? L.z; L.r = L.r || o.pool || P.pool; L.gy = S.y(L.gx, L.gz, L.y) + 0.09;
          pos.set([L.x, L.y, L.z], i * 3);
          setInst(pools, i, L.gx, L.gy, L.gz, L.r * 2, 1, L.r * 2);
        });
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const halos = new THREE.Points(geo, halo);
        pools.receiveShadow = false; pools.renderOrder = 1; halos.renderOrder = 2;
        nightRoot().add(pools, halos);
        lod(pools, o.far || P.lightFar); geo.computeBoundingSphere(); roadLod.push({ mesh: halos, x: geo.boundingSphere.center.x, z: geo.boundingSphere.center.z, r: geo.boundingSphere.radius, far: o.far || P.lightFar });
        lightSets.push({ arr, pools, pos: geo.attributes.position });
        st.meshes += 2;
      }
      st.lights += list.length;
    },
    circle: (x, z, r, h = 2) => grid.addCircle(x, z, r, h),
    box: (x, z, w, d, rot = 0, h = 2) => grid.addOBB(x, z, w, d, rot, h),
    // своя сетка столкновений Rapier: треугольники, v — x, y, z подряд, i — индексы (массивы или типизированные);
    // walk — поверхность на проезжей части («стол» перехода): трафик за неё не цепляется (js/physics.js)
    collider(v, i, walk = false) {
      if (i.length) K.meshColliders.push({ v: v instanceof Float32Array ? v : new Float32Array(v), i: i instanceof Uint32Array ? i : new Uint32Array(i), walk });
    },
    // поверхность для walkAt (S.y, world.surface): четырёхугольник pts — [[x, z] × 4], ys — высота на весь кусок или
    // высоты углов [y × 4] (тогда под точкой — по треугольникам (0, 1, 2) и (0, 2, 3))
    walk: (pts, ys) => Array.isArray(ys) ? K.rk.addWalk(pts, Math.max(...ys), ys) : K.rk.addWalk(pts, ys),
    // 7.2: число 0…1 по месту — то же, что S.hash раскладки (sitgesStHash)
    hash: sitgesStHash,
    // 7.2: штук в сводку группы (то, что строится не через place — стены, лестницы, тенты)
    count: n => { stat().n += n; },
    // 7.2: своя геометрия, склеенная по квадратам (см. шапку): копилка на ключ key с материалом mat
    mesh(key, mat, o = {}) {
      let M = builders.get(key);
      if (M) return M;
      const cfg = { mat, shadow: o.shadow !== false, chunk: o.chunk || P.chunk, far: o.far || P.far, index: o.index !== false,
        uv: o.uv !== false, color: !!o.color, keep: !!o.keep };
      const buf = (cx, cz) => {
        const k = key + '|' + Math.floor(cx / cfg.chunk) + ',' + Math.floor(cz / cfg.chunk);
        let B = bufs.get(k);
        if (!B) bufs.set(k, B = { cfg, p: [], n: [], u: [], c: [], i: [] });
        return B;
      };
      // писатель в квадрат точки (ax, az) или, без неё, в квадрат середины каждой грани
      const make = (ax, az) => {
        const W = {
          // грань: вершины [x, y, z] по кругу (веер), нормаль n, uv [[u, v]] (если у копилки uv), цвет [r, g, b] на все вершины
          face(vs, n, uv, col) {
            const B = ax === undefined ? buf(vs.reduce((s, v) => s + v[0], 0) / vs.length, vs.reduce((s, v) => s + v[2], 0) / vs.length) : buf(ax, az);
            const put = k => {
              const v = vs[k];
              B.p.push(v[0], v[1], v[2]); B.n.push(n[0], n[1], n[2]);
              if (cfg.uv) B.u.push(uv[k][0], uv[k][1]);
              if (cfg.color) { if (col) B.c.push(col[0], col[1], col[2]); else B.c.push(1, 1, 1); }
            };
            if (cfg.index) {
              const o0 = B.p.length / 3;
              for (let k = 0; k < vs.length; k++) put(k);
              for (let k = 1; k + 1 < vs.length; k++) B.i.push(o0, o0 + k, o0 + k + 1);
            } else for (let k = 1; k + 1 < vs.length; k++) { put(0); put(k); put(k + 1); }
          },
          // грань с нормалью по первым трём вершинам, обход — лицом к hint ([x, y, z]); вырожденная — пропуск
          poly(vs, uv, hint, col) {
            const [a, b, c] = vs;
            let nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
            const l = Math.hypot(nx, ny, nz);
            if (l < 1e-9) return;
            nx /= l; ny /= l; nz /= l;
            if (nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) { vs = vs.slice().reverse(); if (uv) uv = uv.slice().reverse(); nx = -nx; ny = -ny; nz = -nz; }
            W.face(vs, [nx, ny, nz], uv, col);
          },
          // брус вдоль отрезка: a, b — [x, z, низ], h — высота, hw — полутолщина; верх и две боковые грани (u — uA…uB вдоль)
          beam: (a, b, h, hw, uA = 0, uB = 1, col) => {
            const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
            if (L < 0.02) return;
            const px = -(b[1] - a[1]) / L * hw, pz = (b[0] - a[0]) / L * hw;
            const A0 = [a[0] + px, a[1] + pz], A1 = [a[0] - px, a[1] - pz], B0 = [b[0] + px, b[1] + pz], B1 = [b[0] - px, b[1] - pz];
            W.poly([[A0[0], a[2] + h, A0[1]], [B0[0], b[2] + h, B0[1]], [B1[0], b[2] + h, B1[1]], [A1[0], a[2] + h, A1[1]]], [[uA, 0], [uB, 0], [uB, 1], [uA, 1]], [0, 1, 0], col);
            for (const [E, F, sg] of [[A0, B0, 1], [A1, B1, -1]])
              W.poly([[E[0], a[2], E[1]], [F[0], b[2], F[1]], [F[0], b[2] + h, F[1]], [E[0], a[2] + h, E[1]]], [[uA, 0], [uB, 0], [uB, h], [uA, h]], [px * sg, 0, pz * sg], col);
          },
        };
        return W;
      };
      M = make();
      M.at = (x, z) => make(x, z);
      builders.set(key, M);
      return M;
    },
    // 7.2: копилки S.mesh → меши (по порядку появления квадратов), сводка группы; после build группы — само
    flush() {
      for (const B of bufs.values()) {
        if (!B.p.length) continue;
        const c = B.cfg, geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(B.p, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(B.n, 3));
        if (c.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(B.u, 2));
        if (c.color) geo.setAttribute('color', new THREE.Float32BufferAttribute(B.c, 3));
        if (c.index) geo.setIndex(B.i);
        geo.computeBoundingSphere();
        const mesh = new THREE.Mesh(geo, c.mat), s = geo.boundingSphere, st = stat();
        mesh.castShadow = c.shadow; mesh.receiveShadow = true;
        if (c.keep) mesh.userData.keep = true;
        group.add(mesh);
        roadLod.push({ mesh, x: s.center.x, z: s.center.z, r: s.radius, far: c.far });
        st.meshes++; st.tris += (c.index ? B.i.length : B.p.length / 3) / 3;
      }
      bufs.clear(); builders.clear();
    },
  };

  for (const g of sitgesStGroups()) { S.cur = g.id; g.build(K, S, C.street.groups[g.id]); S.flush(); }
  S.cur = null;

  /* ---------- каждый кадр, сброс, ночь ---------- */
  const lightsUpdate = () => {                     // у сбитого предмета огни гаснут
    if (!night || !night.visible) return;
    for (const F of lightSets) {
      let ch = false;
      F.arr.forEach((L, i) => {
        const dark = !!(L.it && L.it.broken);
        if (dark === !!L.dark) return;
        L.dark = dark; ch = true;
        F.pos.setY(i, dark ? -1e4 : L.y);
        setInst(F.pools, i, L.gx, L.gy, L.gz, dark ? 0 : L.r * 2, 1, dark ? 0 : L.r * 2);
      });
      if (ch) { F.pos.needsUpdate = true; F.pools.instanceMatrix.needsUpdate = true; }
    }
  };
  let acc = 0;
  K.stUpdate = dt => {
    for (const B of brks) B.update(dt);
    if (lightSets.length && (acc += dt) >= P.check) { acc = 0; lightsUpdate(); }
  };
  K.stReset = () => { for (const B of brks) B.reset(); lightsUpdate(); };
  K.stNight = k => {
    for (const G of glows) G.m.color.setHex(k > 0 ? G.night : G.day);
    for (const m of haloMats) m.opacity = k * 0.9;
    if (night) { night.visible = k > 0; lightsUpdate(); }
  };
}
