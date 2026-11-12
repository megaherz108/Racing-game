// Карта: тестовая арена
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

/* =====================================================================
   КАРТА 0: ТЕСТОВАЯ АРЕНА
   ===================================================================== */
const ARENA = 55;
function arenaData() {
  const blocks = [[-28, -20, 6, 6], [28, 22, 6, 6], [30, -24, 3, 12], [-30, 26, 12, 3], [0, 30, 14, 1.2]];
  const tires = [[0, 0], [-40, 0], [40, 0], [-14, -14], [16, 12]];
  const m = mmCanvas(64, 256);
  m.ctx.fillStyle = '#5f8f3c'; m.ctx.fillRect(0, 0, 256, 256);
  m.ctx.fillStyle = '#d9372b'; m.rect(-ARENA - 1, ARENA + 1, -ARENA - 1, ARENA + 1);
  m.ctx.fillStyle = '#4a4e55'; m.rect(-ARENA, ARENA, -ARENA, ARENA);
  m.ctx.fillStyle = '#b5b5ad'; blocks.forEach(([cx, cz, w, d]) => m.rect(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2));
  m.ctx.fillStyle = '#15161a'; tires.forEach(([x, z]) => m.dot(x, z, 1.2 * m.sc));
  return { blocks, tires, minimap: m.c, mmExt: 64, mmBg: '#5f8f3c' };
}
function buildArena(D) {
  const group = new THREE.Group(), grid = new StaticGrid(8);
  const grassTex = noiseTexture(256, '#5f8f3c', 0.18, 5000); grassTex.repeat.set(80, 80);
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 }));
  grass.rotation.x = -Math.PI / 2; grass.position.y = -0.03; grass.receiveShadow = true; group.add(grass);
  const asphTex = noiseTexture(256, '#3b3f45', 0.16, 9000); asphTex.repeat.set(36, 36);
  const asph = new THREE.Mesh(new THREE.PlaneGeometry(ARENA * 2 + 4, ARENA * 2 + 4), new THREE.MeshStandardMaterial({ map: asphTex, roughness: 0.92 }));
  asph.rotation.x = -Math.PI / 2; asph.receiveShadow = true; group.add(asph);

  const lineMat = new THREE.MeshBasicMaterial({ color: 0xe9ecef, transparent: true, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -1 });
  const yMat = new THREE.MeshBasicMaterial({ color: 0xf2c230, transparent: true, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -1 });
  const flat = (geo, mat, x, z, rotY = 0) => { const m = new THREE.Mesh(geo, mat); m.rotation.x = -Math.PI / 2; m.rotation.z = rotY; m.position.set(x, 0.012, z); group.add(m); return m; };
  flat(new THREE.RingGeometry(13.7, 14, 96), lineMat, 0, 0);
  flat(new THREE.RingGeometry(4.6, 4.9, 64), yMat, 0, 0);
  const e = ARENA - 2;
  for (const s of [1, -1]) { flat(new THREE.PlaneGeometry(e * 2, 0.3), yMat, 0, s * e); flat(new THREE.PlaneGeometry(0.3, e * 2), yMat, s * e, 0); }
  for (const sx of [-6, 6]) for (const [w, d, x, z] of [[3.2, 0.2, 0, 2.8], [0.2, 5.8, 1.6, 0], [0.2, 5.8, -1.6, 0]]) flat(new THREE.PlaneGeometry(w, d), lineMat, sx + x, -36 + z);
  {
    const c = document.createElement('canvas'); c.width = 256; c.height = 16; const x = c.getContext('2d');
    for (let i = 0; i < 32; i++) for (let j = 0; j < 2; j++) { x.fillStyle = (i + j) % 2 ? '#111' : '#eee'; x.fillRect(i * 8, j * 8, 8, 8); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter;
    flat(new THREE.PlaneGeometry(24, 1.5), new THREE.MeshBasicMaterial({ map: t, polygonOffset: true, polygonOffsetFactor: -1 }), 0, -32);
  }
  for (const [x, z, r] of [[-38, 0, 0], [38, 0, Math.PI], [0, 38, Math.PI / 2], [0, -20, -Math.PI / 2]]) {
    const sh = new THREE.Shape(); sh.moveTo(0, 1.6); sh.lineTo(1.2, 0); sh.lineTo(0.4, 0); sh.lineTo(0.4, -1.6); sh.lineTo(-0.4, -1.6); sh.lineTo(-0.4, 0); sh.lineTo(-1.2, 0); sh.closePath();
    flat(new THREE.ShapeGeometry(sh), lineMat, x, z, r);
  }
  // отбойники по периметру
  const segLen = 4.4, perSide = Math.round((ARENA * 2) / segLen);
  const walls = inst(new THREE.BoxGeometry(segLen - 0.06, 1.1, 0.9), stdMat(0xffffff, { roughness: 0.75 }), perSide * 4);
  let wi = 0;
  for (let side = 0; side < 4; side++) for (let i = 0; i < perSide; i++) {
    const t = -ARENA + segLen / 2 + i * segLen;
    const [x, z] = [[t, ARENA + 0.45], [t, -ARENA - 0.45], [ARENA + 0.45, t], [-ARENA - 0.45, t]][side];
    setInst(walls, wi, x, 0.55, z, 1, 1, 1, side >= 2 ? Math.PI / 2 : 0);
    walls.setColorAt(wi++, _col.set((i + side) % 2 ? 0xd9372b : 0xf1f1f1));
  }
  group.add(walls);
  // бетонные блоки
  const concrete = new THREE.MeshStandardMaterial({ map: noiseTexture(128, '#9a9a94', 0.2, 1500), roughness: 0.9 });
  const stripe = stdMat(0xf2c230, { roughness: 0.6 });
  for (const [cx, cz, w, d] of D.blocks) {
    const h = d < 2 ? 1.0 : 1.6;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), concrete);
    m.position.set(cx, h / 2, cz); m.castShadow = m.receiveShadow = true; group.add(m);
    const st = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.18, d + 0.02), stripe);
    st.position.set(cx, h - 0.25, cz); group.add(st);
    grid.addBox(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2, h);
  }
  // стопки покрышек
  const tireGeo = new THREE.TorusGeometry(0.85, 0.32, 10, 20);
  const tires = inst(tireGeo, stdMat(0xffffff, { roughness: 0.95 }), D.tires.length * 3);
  D.tires.forEach(([x, z], i) => {
    for (let k = 0; k < 3; k++) {
      setInst(tires, i * 3 + k, x, 0.32 + k * 0.6, z, 1, 1, 1, 0, Math.PI / 2);
      tires.setColorAt(i * 3 + k, _col.setHex(k === 1 ? 0xe8e8e8 : 0x1d1e20));
    }
    grid.addCircle(x, z, 1.15, 2);
  });
  group.add(tires);
  // деревья вокруг
  const trees = Array.from({ length: 70 }, () => { const a = Math.random() * Math.PI * 2, r = rand(ARENA + 14, ARENA + 70); return [Math.cos(a) * r, Math.sin(a) * r, rand(0.8, 1.4)]; });
  const trunk = inst(new THREE.CylinderGeometry(0.25, 0.35, 2, 6), stdMat(0x6b4a2f, { flatShading: true }), trees.length);
  const crownA = inst(new THREE.ConeGeometry(2.2, 3.6, 7), stdMat(0x2f6b34, { flatShading: true }), trees.length);
  const crownB = inst(new THREE.ConeGeometry(1.6, 2.8, 7), stdMat(0x3c8241, { flatShading: true }), trees.length);
  trees.forEach(([x, z, s], i) => {
    const r = Math.random() * 6;
    setInst(trunk, i, x, s, z, s, s, s, r); setInst(crownA, i, x, 3.4 * s, z, s, s, s, r); setInst(crownB, i, x, 5 * s, z, s, s, s, r);
  });
  group.add(trunk, crownA, crownB);
  // трибуны и мачты освещения
  const standMat = stdMat(0x8a96a6, { roughness: 0.8 });
  const seatMat = [stdMat(0x2d6fd6), stdMat(0xe0582a)];
  for (const [z, rot] of [[ARENA + 10, 0], [-ARENA - 10, Math.PI]]) {
    const st = new THREE.Group(); st.position.set(0, 0, z); st.rotation.y = rot;
    for (let r = 0; r < 6; r++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(40, 0.6 * (r + 1), 1.4), standMat);
      step.position.set(0, 0.3 * (r + 1), r * 1.4); step.castShadow = step.receiveShadow = true; st.add(step);
      const seats = new THREE.Mesh(new THREE.BoxGeometry(39, 0.25, 0.5), seatMat[r % 2]);
      seats.position.set(0, 0.6 * (r + 1) + 0.12, r * 1.4 - 0.2); st.add(seats);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(42, 0.3, 9), stdMat(0xdfe3e8));
    roof.position.set(0, 7.5, 3.5); roof.castShadow = true; st.add(roof);
    for (const x of [-20, 0, 20]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.4, 7.5, 0.4), standMat); p.position.set(x, 3.75, 7.6); st.add(p); }
    group.add(st);
  }
  for (const [x, z] of [[-ARENA - 3, -ARENA - 3], [ARENA + 3, -ARENA - 3], [-ARENA - 3, ARENA + 3], [ARENA + 3, ARENA + 3]]) {
    const pole = cyl(0.18, 0.25, 14, 8, MAT.trim, group); pole.position.set(x, 7, z);
    const lamp = box(2.4, 0.5, 1.2, MAT.head, x, 14, z, group); lamp.lookAt(0, 0, 0);
  }
  // бочки — лёгкие подвижные объекты
  const barrels = [];
  const bGeo = new THREE.CylinderGeometry(0.42, 0.42, 1.0, 14);
  const bMats = [stdMat(0x2a5bd7, { roughness: 0.5, metalness: 0.4 }), stdMat(0xd8432b, { roughness: 0.5, metalness: 0.4 })];
  const bandGeo = new THREE.CylinderGeometry(0.43, 0.43, 0.08, 14);
  const spots = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) spots.push([-16 + i * 0.95, 20 + j * 0.95]);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) spots.push([20 + i * 0.95, -10 + j * 0.95]);
  for (let i = 0; i < 6; i++) spots.push([-20 + i * 8, -6]);
  spots.forEach(([x, z], k) => {
    const g = new THREE.Group();
    const m = new THREE.Mesh(bGeo, bMats[k % 2]); m.position.y = 0.5; m.castShadow = true; g.add(m);
    for (const y of [0.3, 0.7]) { const b = new THREE.Mesh(bandGeo, MAT.trim); b.position.y = y; g.add(b); }
    group.add(g);
    barrels.push({ mesh: g, home: [x, z], x, z, y: 0, vx: 0, vz: 0, w: 0, h: 0, r: 0.42, invMass: 1 / 70, invI: 0 });
  });
  const SP = [[6, -36, 0], [-6, -36, 0]];
  return {
    id: 'arena', group, grid, barrels, ground: () => 0, water: null, bounds: ARENA,
    sky: 0x9fcbef, fog: [110, 320], spawns: SP, coinCount: 14,
    roadPoint: (x, z, p) => SP[p],
    coinSpot() {
      for (let t = 0; t < 60; t++) { const x = rand(-ARENA + 4, ARENA - 4), z = rand(-ARENA + 4, ARENA - 4); if (!grid.hitsPoint(x, z, 2.5)) return [x, z]; }
      return [0, 20];
    },
    minimap: D.minimap, mmExt: D.mmExt, mmBg: D.mmBg, occludes: null,
    reset() { for (const b of barrels) { b.x = b.home[0]; b.z = b.home[1]; b.vx = b.vz = b.w = 0; b.h = 0; } },
    update(dt) { for (const b of barrels) { b.mesh.position.set(b.x, 0, b.z); b.h += Math.hypot(b.vx, b.vz) * dt * 0.6; b.mesh.rotation.y = b.h; } },
  };
}

