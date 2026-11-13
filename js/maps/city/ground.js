// Город — ПОСТРОЙКА: земля и дороги.
// cityBuildGround — рельеф по чанкам (цвет вершин по району), вода, дороги с разметкой и «зебрами», брусчатка,
//   мощёные кромки канала, переулки, разделительные полосы бульваров, тротуары кварталов, фонтан в парке.
// Порядок этапов — в buildCity() (js/maps/city/build.js).
// Определяет: LAND_LOD_STEP, LAND_LOD_FAR, cityBuildGround.
// Использует: clamp, cyl (js/core.js); makeNoise, mulberry32, CHUNK, smooth01, noiseTexture, instChunks, stdMat,
//   setInst (js/world.js); Weather (js/weather.js); waterMaterial, laneTexture, zebraTexture, pavingTexture,
//   flatChunks (js/maps/city/textures.js); cobbleTexture (js/maps/city/landmarks.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const LAND_LOD_STEP = 3, LAND_LOD_FAR = 230;   // грубая сетка земли парка: каждая 3-я вершина, если до чанка дальше 230 м
function cityBuildGround(K) {
  const { D, group, grid, box1, colorBox, xzOf } = K;
  /* ---------- рельеф по чанкам ---------- */
  const nz = makeNoise(mulberry32(7));
  const cGrass = new THREE.Color(0x6c9a45), cPark = new THREE.Color(0x5f9d3f), cSand = new THREE.Color(0xe6d6a6), cPath = new THREE.Color(0xd2bf8e),
    cPort = new THREE.Color(0x8f918f), cDeep = new THREE.Color(0xb59f72), cQuay = new THREE.Color(0x5a5b58);
  const landMat = Weather.wet(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), 0.35);   // в дождь трава и песок чуть темнеют
  const P = D.PARK, landLod = [];
  for (let cx = -1050; cx < 1050; cx += CHUNK) for (let cz = -1050; cz < 1050; cz += CHUNK) {
    const fine = cx < P.x1 && cx + CHUNK > P.x0 && cz < P.z1 && cz + CHUNK > P.z0;
    const seg = fine ? 150 : 60;
    const g = new THREE.PlaneGeometry(CHUNK, CHUNK, seg, seg); g.rotateX(-Math.PI / 2); g.translate(cx + CHUNK / 2, 0, cz + CHUNK / 2);
    const pos = g.attributes.position, cols = new Float32Array(pos.count * 3);
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), z = pos.getZ(k), cd = D.coastD(x, z), qd = D.quayD(x, z), b = D.blockAt(x, z);
      let y = D.ground(x, z);
      // под дорогами и тротуарами рельеф чуть ниже: иначе трава проступает у бордюров и мерцает под плитами
      if (y >= 0 && z >= D.BEACH_Z && !(b && b.type === 'park')) y = -0.04;
      pos.setY(k, y);
      if (cd < 0) _col.copy(cDeep).multiplyScalar(clamp(1 + cd * 0.025, 0.45, 1));
      else if (qd < 0) _col.copy(cQuay);
      else if (cd < 16 || z < D.BEACH_Z) _col.copy(cSand).multiplyScalar(0.95 + nz(x / 9, z / 9) * 0.05);
      else {
        const dt = D.district(x, z);
        if (dt === 'port') _col.copy(cPort).multiplyScalar(0.95 + nz(x / 12, z / 12) * 0.05);
        else if (dt === 'park') { _col.copy(cPark).multiplyScalar(0.9 + nz(x / 14, z / 14) * 0.1); _col.lerp(cPath, 1 - smooth01((D.parkPath(x, z) - 2.6) / 1.4)); }
        else _col.copy(cGrass).multiplyScalar(0.88 + nz(x / 18, z / 18) * 0.12);
      }
      cols[k * 3] = _col.r; cols[k * 3 + 1] = _col.g; cols[k * 3 + 2] = _col.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    g.computeVertexNormals(); g.computeBoundingSphere();
    const land = new THREE.Mesh(g, landMat); land.receiveShadow = true; group.add(land);
    if (fine) {
      // Подробный чанк парка — 45 000 треугольников (сетка 2 м ради холмов и дорожек). Издалека такая сетка не нужна:
      // второй меш на тех же вершинах берёт каждую третью (6 м, 5 000 треугольников); какой из двух рисовать,
      // решает cullView() мира по расстоянию до камеры (js/maps/city/build.js). keep — чтобы optimizeStatic их не склеил.
      const S = LAND_LOD_STEP, n = seg + 1, idx = [];
      for (let iz = 0; iz < seg; iz += S) for (let ix = 0; ix < seg; ix += S) {
        const a = ix + n * iz, b = ix + n * (iz + S), c = ix + S + n * (iz + S), d = ix + S + n * iz;
        idx.push(a, b, d, b, c, d);
      }
      const lg = new THREE.BufferGeometry();
      for (const k of Object.keys(g.attributes)) lg.setAttribute(k, g.attributes[k]);
      lg.setIndex(idx); lg.boundingSphere = g.boundingSphere.clone();
      const lo = new THREE.Mesh(lg, landMat); lo.receiveShadow = true; lo.visible = false; group.add(lo);
      land.userData.keep = lo.userData.keep = true;
      landLod.push({ hi: land, lo, x: g.boundingSphere.center.x, z: g.boundingSphere.center.z, r: g.boundingSphere.radius });
    }
  }
  const water = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), waterMaterial(0x2477b5));
  water.rotation.x = -Math.PI / 2; water.position.y = D.WATER; water.userData.dynamic = true; group.add(water);

  /* ---------- дороги ---------- */
  const mats = {
    street: new THREE.MeshStandardMaterial({ map: laneTexture(14, 'street'), roughness: 0.92 }),
    avenue: new THREE.MeshStandardMaterial({ map: laneTexture(20, 'avenue'), roughness: 0.92 }),
    prom: new THREE.MeshStandardMaterial({ map: laneTexture(22, 'avenue'), roughness: 0.92 }),
    zebra: new THREE.MeshStandardMaterial({ map: zebraTexture(), roughness: 0.9 }),
    plain: new THREE.MeshStandardMaterial({ map: noiseTexture(256, '#3d4148', 0.15, 9000), roughness: 0.92 }),
    paving: new THREE.MeshStandardMaterial({ map: pavingTexture(), roughness: 0.95 }),
  };
  mats.lane10 = new THREE.MeshStandardMaterial({ map: laneTexture(10, 'street'), roughness: 0.92 });
  mats.ov = new THREE.MeshStandardMaterial({ map: laneTexture(16, 'avenue'), roughness: 0.9 });
  const cobbleTex = cobbleTexture();
  mats.cobble = new THREE.MeshStandardMaterial({ map: cobbleTex, roughness: 0.95 });
  const Q = { street: [], avenue: [], prom: [], zebra: [], plain: [], paving: [], lane10: [], ov: [], cobble: [] };
  const Y = 0.02;
  for (const n of D.nodes) if (n.deg > 0) (n.cobble ? Q.cobble : Q.plain).push({ cx: n.x, cz: n.z, dir: 'z', len: n.wz, wid: n.wx, y: Y, mode: 'world', tile: n.cobble ? 4 : 8 });
  for (const s of D.roadSegs) {
    const along = s.dir === 'z', c = along ? s.x0 : s.z0;
    let a = (along ? s.z0 : s.x0) + (along ? s.a.wz : s.a.wx) / 2, b = (along ? s.z1 : s.x1) - (along ? s.b.wz : s.b.wx) / 2;
    if (s.cobble) {                 // брусчатка Старого города, без разметки
      Q.cobble.push({ cx: along ? c : (a + b) / 2, cz: along ? (a + b) / 2 : c, dir: s.dir, len: b - a, wid: s.w, y: Y, mode: 'world', tile: 4 });
      continue;
    }
    const put = (list, a0, a1, mode) => {
      const m = (a0 + a1) / 2;
      list.push({ cx: along ? c : m, cz: along ? m : c, dir: s.dir, len: a1 - a0, wid: s.w, y: Y, mode });
    };
    if (s.a.deg >= 3) { put(Q.zebra, a, a + 4, 'zebra'); a += 4; }
    if (s.b.deg >= 3) { put(Q.zebra, b - 4, b, 'zebra'); b -= 4; }
    put(s.w >= 22 ? Q.prom : s.w >= 20 ? Q.avenue : Q.street, a, b, 'lane');
  }
  // мощёные кромки канала и деревянный настил набережной
  for (const s of [1, -1]) for (let x = -1000; x < 1000; x += 50) {
    const z = s * (D.CANAL + 1.5);
    if (D.coastD(x, z) > 4 && D.coastD(x + 50, z) > 4) Q.paving.push({ cx: x + 25, cz: z, dir: 'x', len: 50, wid: 3, y: Y, mode: 'world', tile: 4 });
  }
  for (let x = -1000; x < 1000; x += 50) {
    const z = D.PROM_Z - 11 - 4;
    if (D.coastD(x, z) > D.CANAL + 2 && D.coastD(x + 50, z) > D.CANAL + 2) Q.paving.push({ cx: x + 25, cz: z, dir: 'x', len: 50, wid: 8, y: Y, mode: 'world', tile: 4 });
  }
  // проезды-срезки сквозь кварталы и разметка на эстакаде
  for (const L of D.lanes) Q.lane10.push({ cx: (L.x0 + L.x1) / 2, cz: (L.z0 + L.z1) / 2, dir: 'z', len: L.z1 - L.z0, wid: L.x1 - L.x0, y: Y, mode: 'lane' });
  for (const [x0, z0, x1, z1] of D.ovMarks)
    Q.ov.push({ cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, dir: x0 === x1 ? 'z' : 'x', len: Math.hypot(x1 - x0, z1 - z0), wid: D.OV.W, y: D.OV.H + 0.02, mode: 'lane' });
  for (const k of Object.keys(Q)) flatChunks(group, Weather.wet(mats[k]), Q[k]);
  // кривые переулки: лента по ломаной поверх тротуара
  for (const al of D.alleys) {
    const P = [], U = [], N = [], I = [], hw = al.w / 2, y = D.CURB + 0.035, pts = al.pts;
    pts.forEach(([x, z], i) => {
      const [ax, az] = pts[Math.max(0, i - 1)], [bx, bz] = pts[Math.min(pts.length - 1, i + 1)];
      const L = Math.hypot(bx - ax, bz - az) || 1, nx = (bz - az) / L, nzz = -(bx - ax) / L;
      for (const sd of [1, -1]) { const px = x + nx * hw * sd, pz = z + nzz * hw * sd; P.push(px, y, pz); U.push(px / 4, pz / 4); N.push(0, 1, 0); }
      if (i > 0) { const o = (i - 1) * 2; I.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
    });
    // треугольники должны смотреть вверх
    const e1x = P[3] - P[0], e1z = P[5] - P[2], e2x = P[6] - P[0], e2z = P[8] - P[2];
    if (e1z * e2x - e1x * e2z < 0) for (let k = 0; k < I.length; k += 3) [I[k + 1], I[k + 2]] = [I[k + 2], I[k + 1]];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I); g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, mats.cobble); mesh.receiveShadow = true; group.add(mesh);
  }
  // разделительные полосы бульваров: бордюр + газон, деревья добавлены в список деревьев
  instChunks(group, box1, stdMat(0xb7b2a6, { roughness: 0.9 }), D.medians, xzOf, (m, i, o) => setInst(m, i, o.x, 0, o.z, o.w, 0.32, o.d), false);
  instChunks(group, box1, stdMat(0x5f9a41, { roughness: 1 }), D.medians, xzOf, (m, i, o) => setInst(m, i, o.x, 0, o.z, o.w - 0.5, 0.36, o.d - 0.5), false);
  for (const o of D.medians) grid.addBox(o.x - o.w / 2, o.x + o.w / 2, o.z - o.d / 2, o.z + o.d / 2, 0.35);

  /* ---------- тротуары и газоны кварталов ---------- */
  instChunks(group, box1, Weather.wet(stdMat(0xffffff, { roughness: 0.9 }), 0.8), D.slabs, xzOf, colorBox, false);
  // площадь с фонтаном в центре парка
  {
    const [x, z] = D.PC, y = D.ground(x, z);
    const plaza = new THREE.Mesh(new THREE.CylinderGeometry(25, 25, 0.6, 40), new THREE.MeshStandardMaterial({ map: pavingTexture(), roughness: 0.95 }));
    plaza.position.set(x, y - 0.27, z); plaza.receiveShadow = true; group.add(plaza);
    const stone = stdMat(0xbab3a6), wMat = stdMat(0x4aa3d8, { roughness: 0.1, metalness: 0.2 });
    const f = new THREE.Group(); f.position.set(x, y, z);
    const parts = [[7, 7.3, 0.9, 32, stone, 0.45], [6.6, 6.6, 0.1, 32, wMat, 0.8], [0.8, 1.1, 3.2, 10, stone, 1.6], [2.4, 0.6, 0.5, 14, stone, 3.3], [0.35, 0.5, 2.0, 8, stone, 4.4], [1.2, 0.3, 0.3, 12, stone, 5.4]];
    for (const [rt, rb, h, seg, mat, yy] of parts) { const c = cyl(rt, rb, h, seg, mat, f); c.position.y = yy; c.receiveShadow = true; }
    group.add(f);
    grid.addCircle(x, z, 7.3, 1.4);
  }
  Object.assign(K, { water, landLod });
}
