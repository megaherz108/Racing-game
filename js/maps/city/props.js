// Город — ПОСТРОЙКА: сбиваемые объекты (Breakables, js/world.js) и ночные огни.
// cityBuildLights — светофоры (фазы — trafficLight() в js/traffic.js; у сбитого лампы гаснут).
// cityBuildProps — деревья, пальмы, фонари (+ ореолы и пятна света ночью), зонтики, гидранты (фонтан при
//   поломке), дорожные знаки, столики и стулья кафе, скамейки, урны, маяк.
// Параметры поломки (масса, порог, дальность прорисовки far) — в вызовах brkChunks().
// Порядок этапов — в buildCity() (js/maps/city/build.js).
// Определяет: cityBuildLights, cityBuildProps.
// Использует: rand, cyl, MAT (js/core.js); stdMat, Y_AXIS, chunkBuckets, FLAT_QUAD, setInst (js/world.js); Sky
//   (js/sky.js); signAtlas, signMaterial (js/maps/city/textures.js); smoke (js/effects.js); simTime (js/physics.js);
//   trafficLight (js/traffic/graph.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

function cityBuildLights(K) {
  const { D, grid, brkChunks } = K;
  /* ---------- светофоры ---------- */
  // на каждом углу — столб с головой, обращённой к подъезжающим справа машинам (правостороннее движение).
  // Светофор сбивается; у сбитого лампы гаснут.
  const heads = [];
  for (const n of D.litNodes) {
    const ox = n.wx / 2 + 1.6, oz = n.wz / 2 + 1.6;
    heads.push({ x: n.x - ox, z: n.z - oz, axis: 'z', fx: 0, fz: -1, n }, { x: n.x + ox, z: n.z + oz, axis: 'z', fx: 0, fz: 1, n },
      { x: n.x - ox, z: n.z + oz, axis: 'x', fx: -1, fz: 0, n }, { x: n.x + ox, z: n.z - oz, axis: 'x', fx: 1, fz: 0, n });
  }
  const bulbLoc = [0, 1, 2].map(k => new THREE.Matrix4().makeTranslation(0, 4.33 - k * 0.4, 0.17));
  brkChunks(heads, [
    { geo: new THREE.CylinderGeometry(0.09, 0.11, 4.6, 6).translate(0, 2.3, 0), mat: stdMat(0x3a3e44, { metalness: 0.5, roughness: 0.5 }) },
    { geo: new THREE.BoxGeometry(0.42, 1.3, 0.3).translate(0, 3.9, 0), mat: stdMat(0x23262b, { roughness: 0.6 }) },
    { geo: new THREE.SphereGeometry(0.13, 10, 8), mat: new THREE.MeshBasicMaterial({ color: 0xffffff }), shadow: false, per: 3, loc: bulbLoc },
  ], { mass: 240, anchor: 2.5, minSpeed: 3, dmg: 0.4, cy: 2.5, lie: 1.52, kind: 'metal', far: 320 }, (B, h, i) => {
    h.y = D.ground(h.x, h.z);
    h.brk = B.add(grid, h.x, h.y, h.z, Math.atan2(h.fx, h.fz), 0.2, 4.6);
    h.bulbs = B.meshes[2].mesh; h.bi = i * 3;
  });
  // цвета ламп [красная, жёлтая, зелёная] для каждого сигнала; off — сбитый светофор
  const LIGHT_ON = { r: [0xff2a1a, 0x3a2a08, 0x0d2a12], y: [0x3a1410, 0xffc21a, 0x0d2a12], g: [0x3a1410, 0x3a2a08, 0x2aff5a], off: [0x2a1a18, 0x2a2418, 0x182a1c] };
  const updateLights = () => {
    for (const h of heads) {
      const st = h.brk.broken ? 'off' : trafficLight(h.n.x, h.n.z, h.axis, simTime);
      if (st === h.st) continue;
      h.st = st;
      for (let k = 0; k < 3; k++) h.bulbs.setColorAt(h.bi + k, _col.setHex(LIGHT_ON[st][k]));
      h.bulbs.instanceColor.needsUpdate = true;
    }
  };
  updateLights();
  Object.assign(K, { updateLights });
}

function cityBuildProps(K) {
  const { D, group, grid, xzOf, brkChunks } = K;
  /* ---------- деревья и пальмы ---------- */
  // ломаются только на скорости (порог растёт с размером дерева) и гасят заметную часть скорости машины
  const trees = D.trees.map(([x, z, s, ty], i) => ({ x, z, s, i, y: ty ?? Math.max(0, D.ground(x, z)) }));
  brkChunks(trees, [
    { geo: new THREE.CylinderGeometry(0.22, 0.3, 2.4, 6).translate(0, 1.2, 0), mat: stdMat(0x6b4a2f, { flatShading: true }) },
    { geo: new THREE.IcosahedronGeometry(1.9, 0), mat: stdMat(0xffffff, { flatShading: true, roughness: 0.9 }) },
  ], { mass: 350, anchor: 3.5, minSpeed: 6, dmg: 0.55, cy: 2.6, lie: 1.1, kind: 'wood' }, (B, o, i) => {
    _cq.setFromAxisAngle(Y_AXIS, o.i * 1.3);
    const crown = new THREE.Matrix4().compose(_cv.set(0, 3.5, 0), _cq, _cs.set(1.1, 0.9 + (o.i % 5) * 0.06, 1.1));
    B.add(grid, o.x, o.y, o.z, 0, 0.4 * o.s + 0.1, 6, { s: o.s, loc: [null, crown] });
    B.meshes[1].mesh.setColorAt(i, _col.setHSL(0.25 + (o.i % 7) * 0.012, 0.5, 0.26 + (o.i % 3) * 0.04));
  }, 12);
  const palms = D.palms.map(([x, z, s, r], i) => ({ x, z, s, r, i, y: D.ground(x, z) - 0.1, lx: Math.sin(r) * 0.12, lz: Math.cos(r) * 0.12 }));
  const frondGeo = mergeGeometries(Array.from({ length: 8 }, (_, k) =>
    new THREE.BoxGeometry(0.9, 0.06, 3.6).translate(0, 0, 1.8).rotateX(0.38 + (k % 2) * 0.2).rotateY(k * Math.PI / 4).translate(0, 7.4, 0)));
  brkChunks(palms, [
    { geo: new THREE.CylinderGeometry(0.17, 0.3, 7.5, 7).translate(0, 3.75, 0), mat: stdMat(0x8a6a48, { flatShading: true }) },
    { geo: frondGeo, mat: stdMat(0xffffff, { flatShading: true, roughness: 0.85 }) },
  ], { mass: 260, anchor: 2.6, minSpeed: 5, dmg: 0.5, cy: 4, lie: 1.45, kind: 'wood' }, (B, o, i) => {
    B.add(grid, o.x, o.y, o.z, o.r, 0.32 * o.s, 7, { s: o.s, rx: o.lx, rz: o.lz });
    B.meshes[1].mesh.setColorAt(i, _col.setHSL(0.28 + (o.i % 5) * 0.015, 0.55, 0.28 + (o.i % 3) * 0.03));
  }, 14);

  /* ---------- сбиваемые мелкие объекты ---------- */
  // фонари
  const lamps = D.lamps.map(([x, z, ry]) => ({ x, z, ry }));
  brkChunks(lamps, [
    { geo: new THREE.CylinderGeometry(0.1, 0.15, 7, 6).translate(0, 3.5, 0), mat: stdMat(0x50555c, { metalness: 0.6, roughness: 0.4 }) },
    { geo: new THREE.BoxGeometry(2.2, 0.16, 0.4).translate(1.0, 7, 0), mat: stdMat(0x6a7078, { metalness: 0.5, roughness: 0.4 }) },
    { geo: new THREE.BoxGeometry(0.62, 0.06, 0.3).translate(1.75, 6.9, 0), mat: Sky.mats.bulb, shadow: false },      // плафон: ночью светится
  ], { mass: 200, anchor: 2, minSpeed: 2.5, dmg: 0.4, cy: 3.5, lie: 1.5, kind: 'metal', far: 320 }, (B, o) => { o.brk = B.add(grid, o.x, D.ground(o.x, o.z), o.z, o.ry, 0.22, 7); }, 10);
  // ночные огни фонарей: ореол у плафона (Points — всегда лицом к камере) и световое пятно на асфальте.
  // Видны только вечером и ночью; у сбитого фонаря гаснут (проверка раз в 0,4 с).
  const nightGroup = new THREE.Group(); nightGroup.visible = false; group.add(nightGroup);
  const lampFx = [];
  for (const arr of chunkBuckets(lamps, xzOf)) {
    const pos = new Float32Array(arr.length * 3);
    const pools = new THREE.InstancedMesh(FLAT_QUAD, Sky.mats.pool, arr.length);
    arr.forEach((o, i) => {
      o.bx = o.x + Math.cos(o.ry) * 1.75; o.bz = o.z - Math.sin(o.ry) * 1.75; o.by = D.ground(o.x, o.z) + 6.85;
      pos.set([o.bx, o.by, o.bz], i * 3);
      setInst(pools, i, o.bx, D.ground(o.bx, o.bz) + 0.09, o.bz, 13, 1, 13);
    });
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const halos = new THREE.Points(geo, Sky.mats.halo);
    pools.receiveShadow = false; pools.renderOrder = 1; pools.computeBoundingSphere(); halos.renderOrder = 2;
    nightGroup.add(pools, halos);
    lampFx.push({ arr, pools, pos: geo.attributes.position, geo });
  }
  let lampCheck = 0;
  const updateLampFx = dt => {
    if (!nightGroup.visible || (lampCheck -= dt) > 0) return;
    lampCheck = 0.4;
    for (const F of lampFx) {
      let ch = false;
      F.arr.forEach((o, i) => {
        const dark = o.brk.broken;
        if (dark === !!o.dark) return;
        o.dark = dark; ch = true;
        F.pos.setY(i, dark ? -1e4 : o.by);
        setInst(F.pools, i, o.bx, D.ground(o.bx, o.bz) + 0.09, o.bz, dark ? 0 : 13, 1, dark ? 0 : 13);
      });
      if (ch) { F.pos.needsUpdate = true; F.pools.instanceMatrix.needsUpdate = true; }
    }
  };
  const resetLampCheck = () => { lampCheck = 0; };          // setNight(): проверить фонари сразу
  // пляжные и уличные зонтики
  const UMB = [0xe8402f, 0x2f8fe8, 0xf2c230, 0x38b26a, 0xf07ab0, 0xffffff];
  const umbrellas = D.umbrellas.map(([x, z, c]) => ({ x, z, c }));
  brkChunks(umbrellas, [
    { geo: new THREE.CylinderGeometry(0.05, 0.05, 2.4, 5).translate(0, 1.2, 0), mat: stdMat(0xe8e8e8) },
    { geo: new THREE.ConeGeometry(1.5, 0.6, 10).translate(0, 2.5, 0), mat: stdMat(0xffffff, { roughness: 0.8 }) },
  ], { mass: 8, light: true, cy: 1.6, lie: 1.35, kind: 'plastic', far: 240 }, (B, o, i) => {
    B.add(grid, o.x, D.ground(o.x, o.z) - 0.2, o.z, 0, 0.3, 2.6);
    B.meshes[1].mesh.setColorAt(i, _col.setHex(UMB[o.c]));
  });
  // пожарные гидранты: сбитый гидрант бьёт фонтаном воды
  const geysers = [];
  const hydrants = D.hydrants.map(([x, z]) => ({ x, z }));
  brkChunks(hydrants, [{
    geo: mergeGeometries([
      new THREE.CylinderGeometry(0.2, 0.2, 0.06, 10).translate(0, 0.03, 0), new THREE.CylinderGeometry(0.13, 0.15, 0.55, 10).translate(0, 0.3, 0),
      new THREE.SphereGeometry(0.14, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.57, 0),
      new THREE.CylinderGeometry(0.05, 0.05, 0.42, 6).rotateZ(Math.PI / 2).translate(0, 0.4, 0), new THREE.CylinderGeometry(0.06, 0.06, 0.2, 6).rotateX(Math.PI / 2).translate(0, 0.4, 0.12)]),
    mat: stdMat(0xc8281e, { roughness: 0.5, metalness: 0.3 }), shadow: false,
  }], { mass: 110, anchor: 1.2, minSpeed: 2, dmg: 0.25, cy: 0.3, lie: 1.5, light: true, kind: 'metal', far: 170,
    onBreak: it => { geysers.push({ x: it.x, y: it.y, z: it.z, t: 7, acc: 0 }); if (geysers.length > 3) geysers.shift(); },
  }, (B, o) => B.add(grid, o.x, D.ground(o.x, o.z), o.z, 0, 0.2, 0.8));
  const updateGeysers = dt => {
    for (let k = geysers.length - 1; k >= 0; k--) {
      const g = geysers[k];
      g.t -= dt; g.acc += dt * 26 * Math.min(1, g.t / 2);
      for (; g.acc >= 1; g.acc--) smoke.spawn(g.x + rand(-0.1, 0.1), g.y + 0.3, g.z + rand(-0.1, 0.1), rand(-0.7, 0.7), rand(8, 11.5), rand(-0.7, 0.7), 0.25, 1.0, 1.3, 0xbfdcf2, 0.5, 14);
      if (g.t <= 0) geysers.splice(k, 1);
    }
  };
  // дорожные знаки: атлас из 5 знаков, номер знака — атрибут экземпляра aSign
  const signTex = signAtlas();
  const signs = D.signs.map(([x, z, ry, t]) => ({ x, z, ry, t }));
  brkChunks(signs, [
    { geo: new THREE.CylinderGeometry(0.035, 0.035, 2.6, 6).translate(0, 1.3, -0.04), mat: stdMat(0x8c9198, { metalness: 0.6, roughness: 0.4 }), shadow: false },
    { geo: new THREE.PlaneGeometry(0.72, 0.72).translate(0, 2.25, 0), mat: signMaterial(signTex, false), attr: ['aSign', o => o.t], shadow: false },
    { geo: new THREE.PlaneGeometry(0.72, 0.72).rotateY(Math.PI).translate(0, 2.25, -0.012), mat: signMaterial(signTex, true), attr: ['aSign', o => o.t], shadow: false },
  ], { mass: 25, anchor: 0.5, cy: 1.4, lie: 1.52, light: true, kind: 'metal', far: 240 }, (B, o) => B.add(grid, o.x, D.ground(o.x, o.z), o.z, o.ry, 0.1, 2.7));
  // летние кафе: столики и стулья (цвета — свои у каждого кафе)
  const tables = D.tables.map(([x, z, c]) => ({ x, z, c })), chairs = D.chairs.map(([x, z, ry, c]) => ({ x, z, ry, c }));
  brkChunks(tables, [{
    geo: mergeGeometries([new THREE.CylinderGeometry(0.45, 0.45, 0.04, 16).translate(0, 0.74, 0), new THREE.CylinderGeometry(0.03, 0.03, 0.72, 6).translate(0, 0.37, 0),
      new THREE.CylinderGeometry(0.24, 0.26, 0.03, 12).translate(0, 0.015, 0)]),
    mat: stdMat(0xffffff, { roughness: 0.5, metalness: 0.2 }),
  }], { mass: 18, cy: 0.45, lie: 1.25, light: true, kind: 'plastic', far: 170 }, (B, o, i) => {
    B.add(grid, o.x, D.ground(o.x, o.z), o.z, 0, 0.45, 0.8);
    B.meshes[0].mesh.setColorAt(i, _col.setHex(D.cafeColors[o.c][0]));
  });
  brkChunks(chairs, [{
    geo: mergeGeometries([new THREE.BoxGeometry(0.42, 0.04, 0.42).translate(0, 0.45, 0), new THREE.BoxGeometry(0.42, 0.4, 0.04).translate(0, 0.67, -0.19),
      ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => new THREE.BoxGeometry(0.035, 0.45, 0.035).translate(a * 0.18, 0.225, b * 0.18))]),
    mat: stdMat(0xffffff, { roughness: 0.6 }), shadow: false,
  }], { mass: 6, cy: 0.45, lie: 1.2, light: true, kind: 'plastic', far: 170 }, (B, o, i) => {
    B.add(grid, o.x, D.ground(o.x, o.z), o.z, o.ry, 0.28, 0.9);
    B.meshes[0].mesh.setColorAt(i, _col.setHex(D.cafeColors[o.c][1]));
  });
  // скамейки и урны в парке и на набережной
  const benches = D.benches.map(([x, z, ry]) => ({ x, z, ry })), bins = D.bins.map(([x, z]) => ({ x, z }));
  brkChunks(benches, [{
    geo: mergeGeometries([new THREE.BoxGeometry(1.7, 0.06, 0.44).translate(0, 0.44, 0), new THREE.BoxGeometry(1.7, 0.36, 0.05).translate(0, 0.72, -0.21),
      ...[-0.7, 0.7].map(a => new THREE.BoxGeometry(0.07, 0.44, 0.44).translate(a, 0.22, 0))]),
    mat: stdMat(0x8a5a33, { roughness: 0.85 }),
  }], { mass: 70, anchor: 0.6, cy: 0.45, lie: 1.3, light: true, kind: 'wood', far: 170 }, (B, o) => B.add(grid, o.x, D.ground(o.x, o.z), o.z, o.ry, 0.6, 0.9));
  brkChunks(bins, [{ geo: new THREE.CylinderGeometry(0.26, 0.22, 0.85, 10).translate(0, 0.425, 0), mat: stdMat(0x2f4f3a, { roughness: 0.6, metalness: 0.3 }), shadow: false }],
    { mass: 20, cy: 0.42, lie: 1.57, light: true, kind: 'plastic', far: 170 }, (B, o) => B.add(grid, o.x, D.ground(o.x, o.z), o.z, 0, 0.28, 0.9));

  /* ---------- маяк ---------- */
  {
    const [x, z] = D.lighthouse, y = D.ground(x, z), g = new THREE.Group(); g.position.set(x, y, z);
    for (let k = 0; k < 4; k++) { const c = cyl(2.6 - k * 0.25, 2.85 - k * 0.25, 4.5, 16, stdMat(k % 2 ? 0xf2f2f2 : 0xd23a2f), g); c.position.y = 2.25 + k * 4.5; }
    const gal = cyl(2.4, 2.4, 0.35, 16, MAT.trim, g); gal.position.y = 18.2;
    const lan = cyl(1.3, 1.3, 2, 10, MAT.head, g); lan.position.y = 19.4;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.8, 1.8, 10), stdMat(0xd23a2f)); cap.position.y = 21.3; g.add(cap);
    group.add(g);
    grid.addCircle(x, z, 3, 22);
  }
  Object.assign(K, { nightGroup, updateLampFx, resetLampCheck, geysers, updateGeysers });
}
