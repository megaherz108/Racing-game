// Побережье — ПОСТРОЙКА: здания и места.
//   дома, фермы, корпуса винодельни, склад порта, домик смотрителя — одной схемой: стены (материал зданий со
//     старинными узкими окнами, js/world.js) и черепичные крыши — двускатные или вальмовые, трубы; всё инстансами;
//   церковь с колокольней, пьяцца с фонтаном;
//   порт: бетонный пирс на сваях и деревянный причал (настилы Decks), кнехты, два портальных крана, контейнеры,
//     покачивающиеся лодки; маяк на мысе;
//   двор винодельни: бочки — лёгкие физические тела (world.barrels), их можно толкать;
//   руины амфитеатра: ярусы-ступени и колонны.
// Коллайдеры зданий — повёрнутые прямоугольники сетки (StaticGrid.addOBB).
// Порядок этапов — в buildCoast() (js/maps/coast/build.js).
// Определяет: coastRoofGeo, coastBuildStructures.
// Использует: box, cyl (js/core.js); makeBuildingMaterial, instChunks, UNIT_BOX, setInst, stdMat, noiseTexture, inst
//   (js/world.js); pavingTexture, ribTexture (js/maps/city/textures.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

// крыша: единичный объём, конёк вдоль X на высоте 1; hip — вальмовая (конёк короче, торцы скатами)
function coastRoofGeo(hip) {
  const k = hip ? 0.28 : 0;
  const V = [[-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, 0.5], [-0.5, 0, 0.5], [-0.5 + k, 1, 0], [0.5 - k, 1, 0]];
  const F = [[0, 4, 5], [0, 5, 1], [3, 2, 5], [3, 5, 4], [0, 3, 4], [1, 5, 2], [0, 1, 2], [0, 2, 3]];
  const pos = [], uv = [];
  for (const f of F) for (const i of f) { pos.push(...V[i]); uv.push(V[i][0] + 0.5, V[i][1] * 0.7 + Math.abs(V[i][2])); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

function coastBuildStructures(K) {
  const { D, group, grid, decks, dist } = K;
  const C = D.C, { ground, houses, church, pads, pier, jetty, boats, cranes, containers, warehouse, lighthouse, winery, barrels, amphi } = C;
  const xzOf = o => [o.x, o.z];
  /* ---------- здания одной схемой ---------- */
  const blds = houses.map(h => Object.assign({ style: 3, roofK: 0.24 }, h));
  const asBld = (o, wallH, color, roofColor, extra = {}) => {
    const c = Math.cos(o.rot), s = Math.sin(o.rot);
    const gs = [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([a, b]) => ground(o.x + a * o.w / 2 * c + b * o.d / 2 * s, o.z - a * o.w / 2 * s + b * o.d / 2 * c));
    const base = Math.min(...gs) - 0.4;
    blds.push(Object.assign({ x: o.x, z: o.z, w: o.w, d: o.d, rot: o.rot, base, wallH: Math.max(...gs) - base + wallH, color, roofColor, hip: false, chimney: false, style: 3, roofK: 0.24 }, extra));
  };
  // корпуса винодельни стоят на уровне двора (не тянутся по склону вверх)
  const wpad = pads.find(p => p.id === 'winery');
  for (const b of winery.blds) blds.push({ x: b.x, z: b.z, w: b.w, d: b.d, rot: b.rot, base: wpad.h - 1.2, wallH: b.h + 1.2, color: 0xcdb48a, roofColor: 0xa8482a,
    hip: b.h > 6, chimney: true, style: 3, roofK: 0.22 });
  asBld({ x: lighthouse.x + 9, z: lighthouse.z + 3, w: 7, d: 6, rot: 0.3 }, 3.4, 0xefe6d6, 0xb0502c, { chimney: true });
  const wallMat = makeBuildingMaterial();
  const tileTex = (() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64; const x = c.getContext('2d');
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, 64, 64);
    for (let r = 0; r < 8; r++) for (let k = 0; k < 8; k++) {
      x.fillStyle = `rgba(0,0,0,${0.12 + Math.random() * 0.12})`; x.fillRect(k * 8 + (r % 2) * 4, r * 8 + 6, 8, 2);
      x.fillStyle = `rgba(0,0,0,${0.08})`; x.fillRect(k * 8 + (r % 2) * 4, r * 8, 1, 8);
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.repeat.set(4, 4); return t;
  })();
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: tileTex, roughness: 0.85 });
  const col = new THREE.Color();
  instChunks(group, UNIT_BOX, wallMat, blds, xzOf, (m, i, b) => {
    setInst(m, i, b.x, b.base, b.z, b.w, b.wallH, b.d, b.rot);
    m.setColorAt(i, col.setHex(b.color));
  }, true, b => b.style);
  for (const hip of [false, true]) {
    const list = blds.filter(b => !!b.hip === hip);
    instChunks(group, coastRoofGeo(hip), roofMat, list, xzOf, (m, i, b) => {
      const along = b.w >= b.d, L = (along ? b.w : b.d) + 0.7, W = (along ? b.d : b.w) + 0.7, rh = b.roofK * Math.min(b.w, b.d) + 0.3;
      setInst(m, i, b.x, b.base + b.wallH, b.z, L, rh, W, b.rot + (along ? 0 : Math.PI / 2));
      m.setColorAt(i, col.setHex(b.roofColor));
    });
  }
  const chim = blds.filter(b => b.chimney);
  instChunks(group, UNIT_BOX, stdMat(0xb9a690), chim, xzOf, (m, i, b) => {
    const o = b.w * 0.28, c = Math.cos(b.rot), s = Math.sin(b.rot);
    setInst(m, i, b.x + c * o, b.base + b.wallH - 0.5, b.z - s * o, 0.7, b.roofK * Math.min(b.w, b.d) + 1.5, 0.7, b.rot);
  });
  // верх каждой трубы — оттуда идёт дым (js/maps/coast/life.js)
  const chimneys = chim.map(b => { const o = b.w * 0.28; return { x: b.x + Math.cos(b.rot) * o, y: b.base + b.wallH + b.roofK * Math.min(b.w, b.d) + 1.1, z: b.z - Math.sin(b.rot) * o }; });
  for (const b of blds) grid.addOBB(b.x, b.z, b.w, b.d, b.rot, b.wallH - (ground(b.x, b.z) - b.base) + 2);

  /* ---------- церковь и пьяцца ---------- */
  const stone = new THREE.MeshStandardMaterial({ map: noiseTexture(256, '#e4d4b2', 0.18, 7000), roughness: 0.9 });
  const dark = stdMat(0x2a2420, { roughness: 1 });
  {
    const pd = pads.find(p => p.id === 'church'), y = pd.h, ch = new THREE.Group();
    ch.position.set(church.x, y - 0.3, church.z); ch.rotation.y = church.rot;
    box(church.w, 12, church.d, stone, 0, 6, 0, ch);                                  // неф
    const roof = new THREE.Mesh(coastRoofGeo(false), new THREE.MeshStandardMaterial({ color: 0xa8482a, map: tileTex, roughness: 0.85 }));
    roof.scale.set(church.d + 0.8, 4.2, church.w + 0.8); roof.rotation.y = Math.PI / 2; roof.position.y = 12; roof.castShadow = true; ch.add(roof);
    const apse = new THREE.Mesh(new THREE.CylinderGeometry(church.w * 0.42, church.w * 0.42, 9, 16, 1, false, 0, Math.PI), stone);
    apse.position.set(0, 4.5, church.d / 2); apse.rotation.y = -Math.PI / 2; apse.castShadow = true; ch.add(apse);
    box(2.6, 4.4, 0.3, dark, 0, 2.2, -church.d / 2 - 0.1, ch);                          // дверь
    const rose = new THREE.Mesh(new THREE.CircleGeometry(1.4, 16), stdMat(0x3a4a66, { roughness: 0.3, metalness: 0.4 }));
    rose.position.set(0, 8.4, -church.d / 2 - 0.16); rose.rotation.y = Math.PI; ch.add(rose);
    // колокольня у южного угла: ствол, звонница с проёмами, шатёр, крест
    const tw = new THREE.Group(); tw.position.set(church.w / 2 + 2.8, 0, -church.d / 2 + 3); ch.add(tw);
    box(5, 22, 5, stone, 0, 11, 0, tw);
    for (let k = 0; k < 4; k++) { const o = box(1.6, 3, 0.3, dark, 0, 19.2, 0, tw); o.rotation.y = k * Math.PI / 2; o.translateZ(2.42); }
    box(5.6, 0.5, 5.6, stone, 0, 22.2, 0, tw);
    const sp = new THREE.Mesh(new THREE.ConeGeometry(3.6, 5, 4), new THREE.MeshStandardMaterial({ color: 0xa8482a, roughness: 0.8 }));
    sp.position.y = 24.9; sp.rotation.y = Math.PI / 4; sp.castShadow = true; tw.add(sp);
    box(0.18, 1.8, 0.18, dark, 0, 28.2, 0, tw); box(0.9, 0.18, 0.18, dark, 0, 28.6, 0, tw);
    group.add(ch);
    grid.addOBB(church.x, church.z + 1.5, church.w, church.d + 3, church.rot, 14);
    const tx = church.x + Math.cos(church.rot) * (church.w / 2 + 2.8) + Math.sin(church.rot) * (-church.d / 2 + 3);
    const tz = church.z - Math.sin(church.rot) * (church.w / 2 + 2.8) + Math.cos(church.rot) * (-church.d / 2 + 3);
    grid.addOBB(tx, tz, 5, 5, church.rot, 24);
  }
  {
    const pd = pads.find(p => p.id === 'piazza');
    const pav = new THREE.Mesh(new THREE.CircleGeometry(pd.r + 0.5, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: pavingTexture(), roughness: 0.95,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    pav.material.map.repeat.set(8, 8); pav.position.set(pd.x, pd.h + 0.06, pd.z); pav.receiveShadow = true; group.add(pav);
    const wMat = stdMat(0x5aa6c8, { roughness: 0.1, metalness: 0.2 }), f = new THREE.Group(); f.position.set(pd.x, pd.h, pd.z);
    for (const [rt, rb, h, seg, mat, yy] of [[3.4, 3.6, 0.8, 28, stone, 0.4], [3.1, 3.1, 0.1, 28, wMat, 0.75], [0.5, 0.7, 2.4, 10, stone, 1.2], [1.4, 0.4, 0.4, 14, stone, 2.5], [0.25, 0.35, 1.2, 8, stone, 3.2], [0.7, 0.2, 0.25, 12, stone, 3.9]]) {
      const c = cyl(rt, rb, h, seg, mat, f); c.position.y = yy; c.receiveShadow = true;
    }
    group.add(f);
    grid.addCircle(pd.x, pd.z, 3.6, 1.2);
  }

  /* ---------- порт ---------- */
  const concrete = new THREE.MeshStandardMaterial({ map: noiseTexture(128, '#a7a39a', 0.2, 3000), roughness: 0.95 });
  decks.slab([pier.x, pier.h, pier.z0], [pier.x, pier.h, pier.z1], pier.w, 1.2, { mat: 'concrete' });
  decks.slab([jetty.x, jetty.h, jetty.z0], [jetty.x, jetty.h, jetty.z1], jetty.w, 0.3, { mat: 'wood' });
  const piles = [], bollards = [];
  for (let z = pier.z0 - 6; z > pier.z1; z -= 8) for (const s of [1, -1]) { piles.push([pier.x + s * (pier.w / 2 - 0.6), z, 0.5, pier.h - 1.2]); bollards.push([pier.x + s * (pier.w / 2 - 0.5), z + 4]); }
  for (let z = jetty.z0 - 4; z > jetty.z1; z -= 4) for (const s of [1, -1]) piles.push([jetty.x + s * (jetty.w / 2 - 0.15), z, 0.16, jetty.h + 0.9]);
  {
    const m = inst(new THREE.CylinderGeometry(1, 1, 1, 8).translate(0, 0.5, 0), stdMat(0x7a6650, { roughness: 1 }), piles.length);
    piles.forEach(([x, z, r, top], i) => setInst(m, i, x, -6, z, r, top + 6, r)); m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); group.add(m);
    const b = inst(new THREE.CylinderGeometry(0.22, 0.28, 0.6, 8).translate(0, 0.3, 0), stdMat(0x2b2b2b, { roughness: 0.6, metalness: 0.5 }), bollards.length);
    bollards.forEach(([x, z], i) => setInst(b, i, x, pier.h, z, 1, 1, 1)); b.instanceMatrix.needsUpdate = true; b.computeBoundingSphere(); group.add(b);
  }
  // склад: гофрированный ангар без окон, широкие ворота к пирсу
  {
    const wh = warehouse, y = ground(wh.x, wh.z), g = new THREE.Group(); g.position.set(wh.x, y - 0.3, wh.z); g.rotation.y = wh.rot;
    const corr = new THREE.MeshStandardMaterial({ map: ribTexture(), color: 0xa9aeb2, roughness: 0.6, metalness: 0.35 }); corr.map.repeat.set(10, 1);
    box(wh.w, wh.h, wh.d, corr, 0, wh.h / 2, 0, g);
    const rf = new THREE.Mesh(coastRoofGeo(false), stdMat(0x7d8286, { roughness: 0.6, metalness: 0.3 })); rf.scale.set(wh.w + 0.8, 2.2, wh.d + 0.8); rf.position.y = wh.h; rf.castShadow = true; g.add(rf);
    for (const s of [-1, 1]) box(7, 6, 0.2, stdMat(0x4f5a62), s * 8, 3, -wh.d / 2 - 0.05, g);
    group.add(g); grid.addOBB(wh.x, wh.z, wh.w, wh.d, wh.rot, wh.h + 2);
  }
  // контейнеры: штабели, каждый штабель — один коллайдер
  const contMat = new THREE.MeshStandardMaterial({ map: ribTexture(), roughness: 0.7, metalness: 0.3 });
  contMat.map.repeat.set(3, 1);
  instChunks(group, UNIT_BOX, contMat, containers, xzOf, (m, i, c) => { setInst(m, i, c.x, c.y, c.z, 12.2, 2.6, 2.44); m.setColorAt(i, col.setHex(c.color)); });
  const stacks = new Map();
  for (const c of containers) { const k = c.x + ',' + c.z; stacks.set(k, Math.max(stacks.get(k) || 0, c.y + 2.6 - 1.7)); }
  for (const [k, h] of stacks) { const [x, z] = k.split(',').map(Number); grid.addBox(x - 6.1, x + 6.1, z - 1.22, z + 1.22, h); }
  // портальные краны: две рамы на ногах, балка и стрела над водой
  const yel = stdMat(0xd4a020, { roughness: 0.6, metalness: 0.3 }), red = stdMat(0xb8452f, { roughness: 0.6 });
  for (const cr of cranes) {
    const g = new THREE.Group(), y = ground(cr.x, cr.z); g.position.set(cr.x, y, cr.z); g.rotation.y = cr.rot;
    for (const sx of [-3.5, 3.5]) for (const sz of [-4, 4]) box(0.8, 16, 0.8, yel, sx, 8, sz, g);
    for (const sx of [-3.5, 3.5]) box(0.8, 0.8, 9, yel, sx, 15.6, 0, g);
    box(8, 3.2, 9.6, yel, 0, 17.6, 0, g); box(3.6, 2.6, 3, red, 0, 20.1, -2, g);
    const jib = box(1.2, 1.4, 26, yel, 0, 18.6, 15, g); jib.rotation.x = -0.12;
    box(2.4, 2.6, 4, stdMat(0x5a5f66), 0, 17.6, -6.5, g);            // противовес
    group.add(g);
    for (const sx of [-3.5, 3.5]) for (const sz of [-4, 4]) {
      const c = Math.cos(cr.rot), s = Math.sin(cr.rot);
      grid.addCircle(cr.x + sx * c + sz * s, cr.z - sx * s + sz * c, 0.6, 16);
    }
  }
  // лодки у причала и пирса: корпус-«лодочка», у некоторых рубка; качаются на волнах (update)
  const hullShape = new THREE.Shape(); hullShape.moveTo(-0.5, -0.5); hullShape.lineTo(0.5, -0.5); hullShape.lineTo(0.5, 0.25); hullShape.quadraticCurveTo(0.4, 0.5, 0, 0.62); hullShape.quadraticCurveTo(-0.4, 0.5, -0.5, 0.25); hullShape.closePath();
  const hullGeo = new THREE.ExtrudeGeometry(hullShape, { depth: 1, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, -0.35, 0);
  const boatG = [];
  for (const b of boats) {
    const g = new THREE.Group(), hull = new THREE.Mesh(hullGeo, stdMat(b.color, { roughness: 0.6 }));
    hull.scale.set(b.len * 0.36, 1.1, b.len); hull.castShadow = true; g.add(hull);
    box(b.len * 0.3, 0.12, b.len * 0.7, stdMat(0x8a6a48), 0, 0.72, -b.len * 0.1, g);
    if (b.len > 7.5) box(b.len * 0.26, 1.4, b.len * 0.22, stdMat(0xf0ece2), 0, 1.4, -b.len * 0.12, g);
    g.position.set(b.x, 0, b.z); g.rotation.y = b.rot; g.userData.dynamic = true; group.add(g);
    boatG.push({ g, b });
  }
  // маяк: башня в красно-белых поясах, галерея, фонарь, купол
  {
    const L = new THREE.Group(), y = ground(lighthouse.x, lighthouse.z); L.position.set(lighthouse.x, y - 0.5, lighthouse.z);
    const white = stdMat(0xf2eee6), lr = stdMat(0xb8352f);
    for (let k = 0; k < 5; k++) { const r0 = 3.2 - k * 0.18, r1 = 3.2 - (k + 1) * 0.18, c = cyl(r1, r0, 4, 20, k % 2 ? lr : white, L); c.position.y = 2 + k * 4; c.receiveShadow = true; }
    const gal = cyl(2.8, 2.8, 0.4, 20, stdMat(0x2b2b2b), L); gal.position.y = 20.2;
    const lamp = cyl(1.5, 1.5, 2.4, 12, new THREE.MeshStandardMaterial({ color: 0xfff3c0, emissive: 0xffd77a, emissiveIntensity: 0.6, roughness: 0.2 }), L); lamp.position.y = 21.6;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1.7, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), lr); dome.position.y = 22.8; L.add(dome);
    group.add(L); grid.addCircle(lighthouse.x, lighthouse.z, 3.3, 24);
  }

  /* ---------- винодельня: бочки ---------- */
  const barrelGeo = new THREE.CylinderGeometry(0.42, 0.42, 1.0, 14), barrelMat = stdMat(0x7a4a2a, { roughness: 0.8 }), hoopMat = stdMat(0x3a3a3a, { metalness: 0.5, roughness: 0.5 });
  const worldBarrels = barrels.map(b => {
    const g = new THREE.Group(), body = new THREE.Mesh(barrelGeo, barrelMat); body.castShadow = true; g.add(body);
    for (const y of [-0.32, 0, 0.32]) { const h = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.07, 14), hoopMat); h.position.y = y; g.add(h); }
    g.userData.dynamic = true; group.add(g);
    return { mesh: g, home: [b.x, b.z], x: b.x, z: b.z, y: 0, vx: 0, vz: 0, w: 0, h: 0, r: 0.42, invMass: 1 / 90, invI: 0 };
  });

  /* ---------- руины амфитеатра ---------- */
  const ap = pads.find(p => p.id === 'amphi');
  const tierMat = new THREE.MeshStandardMaterial({ map: noiseTexture(256, '#cbbf9f', 0.28, 9000), roughness: 1 });
  instChunks(group, UNIT_BOX, tierMat, amphi.tiers, xzOf, (m, i, t) => setInst(m, i, t.x, ap.h - 0.6, t.z, t.w, t.h + 0.6, t.d, t.rot));
  for (const t of amphi.tiers) grid.addOBB(t.x, t.z, t.w, t.d, t.rot, t.h);
  instChunks(group, new THREE.CylinderGeometry(0.55, 0.65, 1, 10).translate(0, 0.5, 0), tierMat, amphi.cols, xzOf, (m, i, c) => setInst(m, i, c.x, ap.h - 0.3, c.z, 1, c.h, 1));
  for (const c of amphi.cols) grid.addCircle(c.x, c.z, 0.65, c.h);

  Object.assign(K, { worldBarrels, boatG, concreteMat: concrete, chimneys });
}
