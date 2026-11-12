// Уникальные объекты города: памятники, статуи, телебашня, закрученный небоскрёб, ратуша, стадион,
// церковь, водонапорная башня, нефтебаза, корабль в гавани, триумфальная арка, пирс с колесом обозрения.
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Где что стоит, решает cityData() в js/maps/city.js (список landmarks), здесь — только 3D и коллизии.

/* =====================================================================
   ТЕКСТУРЫ (Canvas)
   ===================================================================== */
function cobbleTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#4b4741'; x.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 16; row++) {
    let u = (row % 2) * -9;
    while (u < 256) {
      const w = 14 + Math.random() * 10, l = 0.42 + Math.random() * 0.2, h = 0.08 + Math.random() * 0.04;
      x.fillStyle = `hsl(${30 + Math.random() * 15}, ${8 + Math.random() * 10}%, ${l * 100}%)`;
      x.beginPath(); x.roundRect(u + 1.2, row * 16 + 1.2, w - 2.4, 13.6, 4); x.fill();
      x.fillStyle = `rgba(255,255,255,${h})`; x.fillRect(u + 3, row * 16 + 3, w - 7, 3);
      u += w;
    }
  }
  return canvasTex(c);
}
function helipadTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#3a3d42'; x.fillRect(0, 0, 128, 128);
  x.strokeStyle = '#f2c230'; x.lineWidth = 6; x.beginPath(); x.arc(64, 64, 52, 0, Math.PI * 2); x.stroke();
  x.fillStyle = '#f4f4f0'; x.fillRect(42, 34, 10, 60); x.fillRect(76, 34, 10, 60); x.fillRect(42, 59, 44, 10);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// ряды кресел трибун: u — по кругу стадиона, v — снизу вверх
function seatTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 64;
  const x = c.getContext('2d'), cols = ['#2a5bd7', '#e8e8e8', '#d23a2f', '#2a5bd7', '#f2c230', '#2a5bd7', '#e8e8e8', '#38b26a'];
  cols.forEach((col, i) => { x.fillStyle = col; x.fillRect(i * 64, 0, 64, 64); });
  x.fillStyle = 'rgba(0,0,0,0.35)'; for (let v = 0; v < 64; v += 4) x.fillRect(0, v, 512, 1.4);
  x.fillStyle = '#9a968c'; for (let i = 0; i < 8; i++) x.fillRect(i * 64 + 30, 0, 4, 64);      // проходы
  return canvasTex(c);
}
function pitchTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  for (let i = 0; i < 16; i++) { x.fillStyle = i % 2 ? '#4f9a3a' : '#5aa844'; x.fillRect(0, i * 16, 256, 16); }
  x.strokeStyle = '#f4f4ee'; x.lineWidth = 3;
  x.strokeRect(58, 30, 140, 196); x.beginPath(); x.moveTo(58, 128); x.lineTo(198, 128); x.stroke();
  x.beginPath(); x.arc(128, 128, 22, 0, Math.PI * 2); x.stroke();
  x.strokeRect(98, 30, 60, 26); x.strokeRect(98, 200, 60, 26);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function waterTankTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#8fc3e6'; x.fillRect(0, 0, 1024, 128);
  x.fillStyle = '#2f6fb0'; x.fillRect(0, 98, 1024, 12);
  x.fillStyle = '#ffffff'; x.font = 'bold 64px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  for (const u of [256, 768]) x.fillText('ОСТРОВ', u, 56);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* =====================================================================
   ФИГУРА ДЛЯ СТАТУЙ (одна слитая геометрия, рост ~2 м при масштабе 1)
   ===================================================================== */
function figureGeometry(pose) {
  const C = (rt, rb, h, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg);
  const parts = [];
  for (const s of [-1, 1]) parts.push(C(0.1, 0.13, 0.95).translate(s * 0.13, 0.475, 0));         // ноги
  parts.push(C(0.3, 0.33, 0.55, 10).translate(0, 0.98, 0));                                        // полы сюртука
  parts.push(C(0.24, 0.19, 0.6, 10).translate(0, 1.47, 0));                                        // корпус
  parts.push(C(0.07, 0.08, 0.14).translate(0, 1.82, 0));                                           // шея
  parts.push(new THREE.SphereGeometry(0.15, 12, 8).translate(0, 1.98, 0));                         // голова
  // рука от плеча: az — поворот в сторону/вверх, ax — вперёд
  const arm = (side, az, ax) => C(0.06, 0.075, 0.68).translate(0, -0.34, 0).rotateX(ax).rotateZ(side * az).translate(side * 0.29, 1.72, 0);
  if (pose === 'raise') {
    parts.push(arm(1, 2.75, 0), arm(-1, 0.12, 0));
    const hx = 0.29 + 0.68 * Math.sin(2.75), hy = 1.72 - 0.68 * Math.cos(2.75);
    parts.push(C(0.05, 0.04, 0.5).translate(hx, hy + 0.2, 0), new THREE.SphereGeometry(0.11, 8, 6).translate(hx, hy + 0.5, 0));   // факел
  } else if (pose === 'point') parts.push(arm(1, 0.25, -1.35), arm(-1, 0.45, 0.2));
  else parts.push(arm(1, 0.15, 0), arm(-1, 0.15, 0));
  return mergeGeometries(parts);
}

/* =====================================================================
   ПОСТРОЙКА ОБЪЕКТОВ
   ===================================================================== */
// ctx: { group, grid, decks, D }. Возвращает { update(dt, t) } — анимация (колесо обозрения, кольцо глобуса).
function buildCityLandmarks(list, ctx) {
  const { group, grid, decks, D } = ctx;
  const M = {
    stone: stdMat(0xd9d1bf), darkStone: stdMat(0x8f887a), white: stdMat(0xf1efe8, { roughness: 0.6 }), concrete: stdMat(0xa8a49b),
    bronze: stdMat(0x7d5a32, { metalness: 0.85, roughness: 0.35 }), gold: stdMat(0xe0b44a, { metalness: 1, roughness: 0.22 }),
    copper: stdMat(0x6fae95, { metalness: 0.45, roughness: 0.5 }), steel: stdMat(0xb8c0c8, { metalness: 0.7, roughness: 0.35 }),
    red: stdMat(0xc8452e), navy: stdMat(0x24365a), glass: stdMat(0x2b4a66, { metalness: 0.8, roughness: 0.08 }),
    grass: stdMat(0x5f9d3f, { roughness: 1 }), wood: stdMat(0x8a6a48), slate: stdMat(0x4a525c, { flatShading: true }),
    water: stdMat(0x4aa3d8, { roughness: 0.1, metalness: 0.2 }),
  };
  const ups = [];
  const mesh = (geo, mat, x, y, z, ry = 0, parent = group) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry;
    m.castShadow = m.receiveShadow = true; parent.add(m); return m;
  };
  const Bx = (w, h, d) => new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);
  const Cy = (rt, rb, h, seg = 24) => new THREE.CylinderGeometry(rt, rb, h, seg).translate(0, h / 2, 0);
  const prism = () => new THREE.CylinderGeometry(1, 1, 1, 3).rotateX(-Math.PI / 2).translate(0, 0.5, 0).scale(1 / Math.sqrt(3), 1 / 1.5, 1);
  const pyramid = () => new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0);
  // фасад с окнами: тот же шейдер, что у домов, стиль задаётся атрибутом
  const styled = (geo, st) => { geo.setAttribute('aStyle', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count).fill(st), 1)); return geo; };
  const bm = color => { const m = makeBuildingMaterial(); m.color.setHex(color); return m; };
  const hiddenBox = (x, y, z, w, h, d) => decks.slab([x, y + h, z - d / 2], [x, y + h, z + d / 2], w, h, { walk: false, hidden: true });
  const figs = {};
  const figure = pose => figs[pose] || (figs[pose] = figureGeometry(pose));
  function statue(x, z, ry, s, pose, y = D.ground(x, z)) {
    mesh(Bx(2.8, 0.5, 2.8), M.darkStone, x, y, z);
    mesh(Bx(2.1, 2.2, 2.1), M.stone, x, y + 0.5, z);
    mesh(Bx(2.5, 0.3, 2.5), M.darkStone, x, y + 2.7, z);
    mesh(figure(pose), M.bronze, x, y + 3.0, z, ry).scale.setScalar(s);
    grid.addBox(x - 1.4, x + 1.4, z - 1.4, z + 1.4, 3 + 2 * s);
  }

  const BUILD = {
    // золотая машина на постаменте посреди площади
    statue(L) {
      const { x, z } = L, y = D.CURB;
      mesh(Bx(17, 0.8, 11), M.darkStone, x, y, z);
      mesh(Bx(14.5, 3.6, 8.5), M.stone, x, y + 0.8, z);
      mesh(Bx(15.1, 0.4, 9.1), M.darkStone, x, y + 4.4, z);
      mesh(Bx(5, 1.2, 0.1), M.gold, x, y + 1.9, z - 4.3);
      const def = CARS.find(c => c.id === 'aventador') || CARS[CARS.length - 1];
      const car = buildCarModel(def, 0xe0b44a);
      car.root.traverse(o => { if (o.isMesh) { o.material = M.gold; o.castShadow = o.receiveShadow = true; } });
      car.root.scale.setScalar(3); car.root.position.set(x, y + 4.9, z); car.root.rotation.set(-0.14, 0.55, 0);
      group.add(car.root);
      grid.addBox(x - 8.5, x + 8.5, z - 5.5, z + 5.5, 10);
      for (const [dx, c] of [[-12, 0xd23a2f], [12, 0x2a5bd7]]) {
        mesh(Cy(0.12, 0.15, 12, 8), M.steel, x + dx, y, z - 3);
        mesh(Bx(0.06, 1.7, 2.8), stdMat(c, { side: THREE.DoubleSide }), x + dx, y + 9.9, z - 4.5);
        grid.addCircle(x + dx, z - 3, 0.3, 12);
      }
    },
    // телебашня ~210 м — видна из любой точки острова
    tvtower(L) {
      const { x, z } = L, y = D.CURB, W = M.white;
      mesh(Cy(14, 15, 6, 32), M.concrete, x, y, z);
      mesh(Cy(10, 10, 3.5, 32), M.glass, x, y + 6, z);
      mesh(Cy(11, 11, 0.6, 32), M.concrete, x, y + 9.5, z);
      mesh(Cy(2.6, 4.2, 116, 16), W, x, y + 10, z);
      mesh(Cy(11, 4, 6, 32), W, x, y + 125, z);
      mesh(Cy(12, 12, 5, 32), M.glass, x, y + 131, z);
      mesh(Cy(9, 12.5, 3, 32), W, x, y + 136, z);
      mesh(Cy(3, 9, 5, 24), W, x, y + 139, z);
      mesh(Cy(2.4, 2.6, 13, 16), W, x, y + 144, z);
      mesh(Cy(4.5, 4.5, 3, 24), M.glass, x, y + 152, z);
      mesh(Cy(4.8, 4.8, 0.5, 24), W, x, y + 155, z);
      mesh(Cy(0.3, 1.5, 50, 8), M.red, x, y + 155.5, z);
      mesh(new THREE.SphereGeometry(0.8, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff3020 }), x, y + 206, z);
      grid.addCircle(x, z, 15, 9.5); grid.addCircle(x, z, 4.3, 210);
    },
    // закрученный небоскрёб: каждый этаж повёрнут относительно предыдущего
    twist(L) {
      const n = 44, fh = 3.3, S = 27, { x, z } = L, y0 = D.CURB;
      const body = new THREE.InstancedMesh(styled(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), FACADE.glass), bm(0x7f9bb3), n);
      const plates = new THREE.InstancedMesh(UNIT_BOX, M.darkStone, n);
      for (let k = 0; k < n; k++) {
        setInst(body, k, x, y0 + k * fh, z, S, fh, S, k * 0.045);
        setInst(plates, k, x, y0 + k * fh + fh - 0.3, z, S + 0.7, 0.35, S + 0.7, k * 0.045);
      }
      for (const m of [body, plates]) { m.castShadow = m.receiveShadow = true; m.computeBoundingSphere(); group.add(m); }
      mesh(Cy(0.3, 2.2, 32, 8), M.steel, x, y0 + n * fh, z);
      grid.addCircle(x, z, S * 0.72, n * fh);
    },
    // ратуша: колоннада с фронтоном, барабан с колоннами и медный купол
    cityhall(L) {
      const x = L.x, z = L.z + 5, y = D.CURB;
      mesh(styled(Bx(64, 15, 30), FACADE.old), bm(0xe3dbc8), x, y, z);
      mesh(Bx(65.5, 1.4, 31.5), M.darkStone, x, y + 15, z);
      mesh(Bx(36, 0.8, 13), M.darkStone, x, y, z - 21);
      mesh(Bx(34, 0.5, 11), M.stone, x, y + 0.8, z - 20.5);
      for (let k = 0; k < 8; k++) mesh(Cy(0.8, 0.95, 12, 12), M.white, x - 14 + k * 4, y + 1.3, z - 23);
      mesh(Bx(33, 1.8, 10), M.stone, x, y + 13.3, z - 20);
      const ped = new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(-16.5, 0), new THREE.Vector2(16.5, 0), new THREE.Vector2(0, 6)]), { depth: 10, bevelEnabled: false }).translate(0, 0, -5);
      mesh(ped, M.stone, x, y + 15.1, z - 20);
      mesh(Cy(10.5, 10.5, 7, 32), M.white, x, y + 16.4, z);
      for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; mesh(Cy(0.38, 0.45, 6.4, 8), M.stone, x + Math.cos(a) * 11.4, y + 16.4, z + Math.sin(a) * 11.4); }
      mesh(Cy(12, 12, 0.8, 32), M.darkStone, x, y + 22.8, z);
      mesh(new THREE.SphereGeometry(10.8, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), M.copper, x, y + 23.6, z);
      mesh(Cy(1.8, 1.8, 4, 12), M.white, x, y + 33.6, z);
      mesh(new THREE.SphereGeometry(2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.copper, x, y + 37.6, z);
      mesh(new THREE.SphereGeometry(0.6, 12, 8), M.gold, x, y + 40, z);
      grid.addBox(x - 32, x + 32, z - 15, z + 15, 40);
      grid.addBox(x - 17, x + 17, z - 26, z - 15, 16);
      for (const dx of [-24, 24]) {
        mesh(Cy(0.12, 0.15, 14, 8), M.steel, x + dx, y, z - 24);
        mesh(Bx(0.06, 1.8, 3), stdMat(dx < 0 ? 0xffffff : 0x2a5bd7, { side: THREE.DoubleSide }), x + dx, y + 11.8, z - 25.6);
        grid.addCircle(x + dx, z - 24, 0.3, 14);
      }
      statue(x, z - 34, Math.PI, 1.6, 'point', y);
    },
    // стадион: эллиптическая чаша трибун, козырёк, поле с разметкой, мачты освещения
    stadium(L) {
      const { x, z } = L, y = D.CURB, rx = 40, rz = 62, H = 17;
      const outer = mesh(new THREE.CylinderGeometry(1, 1, 1, 72, 1, true).translate(0, 0.5, 0), stdMat(0xe9e6df, { side: THREE.DoubleSide, roughness: 0.8 }), x, y, z);
      outer.scale.set(rx, H, rz);
      const stands = mesh(new THREE.CylinderGeometry(1, 0.66, 1, 72, 1, true).translate(0, 0.5, 0),
        new THREE.MeshStandardMaterial({ map: seatTexture(), side: THREE.DoubleSide, roughness: 0.85 }), x, y, z);
      stands.scale.set(rx - 0.6, H - 1, rz - 0.6);
      const roof = mesh(new THREE.RingGeometry(0.8, 1.04, 72).rotateX(-Math.PI / 2), stdMat(0xf6f6f6, { side: THREE.DoubleSide }), x, y + H + 0.3, z);
      roof.scale.set(rx, 1, rz);
      const field = mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: pitchTexture(), roughness: 1 }), x, y + 0.06, z);
      field.scale.set(rx * 0.66, 1, rz * 0.66);
      const lightMat = new THREE.MeshBasicMaterial({ color: 0xfffbe8 });
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const mx = x + sx * 37, mz = z + sz * 66;
        mesh(Cy(0.5, 0.75, 38, 8), M.steel, mx, y, mz);
        mesh(Bx(7, 3, 1), lightMat, mx, y + 37, mz, Math.atan2(x - mx, z - mz));
        grid.addCircle(mx, mz, 0.8, 38);
      }
      // коллизия чаши: горизонтальные «ломтики» эллипса
      for (const k of [-5, -3, -1, 1, 3, 5]) {
        const zc = z + k * rz / 6, hx = rx * Math.sqrt(1 - (Math.abs(k) / 6) ** 2);
        grid.addBox(x - hx, x + hx, zc - rz / 6, zc + rz / 6, H);
      }
    },
    // церковь: неф с двускатной крышей, апсида, колокольня со шпилем и часами
    church(L) {
      const { x, z } = L, y = D.CURB, wall = bm(0xefe9dc);
      mesh(styled(Bx(14, 11, 30), FACADE.strips), wall, x, y, z + 3);
      mesh(prism(), M.slate, x, y + 11, z + 3).scale.set(15, 7, 31);
      mesh(new THREE.CylinderGeometry(6, 6, 9, 16, 1, false, -Math.PI / 2, Math.PI).translate(0, 4.5, 0), wall, x, y, z + 18);
      mesh(styled(Bx(7.5, 26, 7.5), FACADE.old), wall, x, y, z - 15.5);
      mesh(Bx(8.3, 0.8, 8.3), M.darkStone, x, y + 26, z - 15.5);
      mesh(pyramid(), M.slate, x, y + 26.8, z - 15.5).scale.set(7.5, 16, 7.5);
      mesh(Bx(0.35, 3, 0.35), M.gold, x, y + 42.6, z - 15.5);
      mesh(Bx(1.6, 0.35, 0.35), M.gold, x, y + 44.3, z - 15.5);
      mesh(new THREE.CircleGeometry(1.7, 24), M.white, x, y + 20, z - 19.3, Math.PI);
      mesh(Bx(0.12, 1.2, 0.05), MAT.black, x, y + 19.9, z - 19.36);
      mesh(Bx(0.9, 0.12, 0.05), MAT.black, x + 0.4, y + 20, z - 19.36);
      grid.addBox(x - 7, x + 7, z - 12, z + 18, 18);
      grid.addBox(x - 3.8, x + 3.8, z - 19.3, z - 11.7, 43);
      grid.addCircle(x, z + 18, 6, 9);
      // надгробия во дворе
      const stones = new THREE.InstancedMesh(Bx(0.7, 1.0, 0.25), M.darkStone, 24);
      for (let k = 0; k < 24; k++) setInst(stones, k, x + (k % 2 ? 1 : -1) * (10.5 + (k % 3) * 2.2), y, z - 8 + Math.floor(k / 2) * 2.4, 1, 0.8 + (k % 4) * 0.12, 1);
      stones.castShadow = true; stones.computeBoundingSphere(); group.add(stones);
    },
    // водонапорная башня на опорах — между ног можно проехать
    watertower(L) {
      const { x, z } = L, y = D.CURB, H = 24;
      const legs = [[-5, -5], [5, -5], [5, 5], [-5, 5]];
      legs.forEach(([dx, dz], k) => {
        beam([x + dx, y, z + dz], [x + dx * 0.72, y + H, z + dz * 0.72], 0.6, M.steel, group);
        grid.addCircle(x + dx, z + dz, 0.5, H);
        const [ex, ez] = legs[(k + 1) % 4];
        for (const t of [0.4, 0.75]) beam([x + dx * (1 - 0.28 * t), y + H * t, z + dz * (1 - 0.28 * t)], [x + ex * (1 - 0.28 * t), y + H * t, z + ez * (1 - 0.28 * t)], 0.25, M.steel, group);
      });
      mesh(Cy(7, 2, 3, 32), M.steel, x, y + H - 3, z);
      mesh(Cy(7, 7, 8, 32), new THREE.MeshStandardMaterial({ map: waterTankTexture(), roughness: 0.6 }), x, y + H, z);
      mesh(Cy(0.6, 7.5, 3.2, 32), stdMat(0x2f6fb0), x, y + H + 8, z);
      mesh(new THREE.SphereGeometry(0.6, 10, 8), M.steel, x, y + H + 11.5, z);
    },
    // нефтебаза: белые резервуары с красной полосой и эстакада труб
    tanks(L) {
      const y = D.CURB, white = stdMat(0xeeeeea, { roughness: 0.5 });
      for (const i of [-1.5, -0.5, 0.5, 1.5]) for (const j of [-1, 1]) {
        const tx = L.x + i * 24, tz = L.z + j * 14.5;
        mesh(Cy(9.6, 9.6, 0.5, 32), M.darkStone, tx, y, tz);
        mesh(Cy(9, 9, 13, 32), white, tx, y + 0.5, tz);
        mesh(Cy(9.05, 9.05, 1, 32), M.red, tx, y + 10, tz);
        mesh(Cy(1.5, 9.1, 1.6, 32), M.steel, tx, y + 13.5, tz);
        grid.addCircle(tx, tz, 9.2, 15);
      }
      for (const dz of [-0.6, 0.6]) beam([L.x - 44, y + 3.2, L.z + dz], [L.x + 44, y + 3.2, L.z + dz], 0.7, M.steel, group);
      for (let i = -40; i <= 40; i += 10) { mesh(Bx(0.3, 3, 2.2), M.darkStone, L.x + i, y, L.z); }
      grid.addBox(L.x - 44, L.x + 44, L.z - 1.3, L.z + 1.3, 4);
    },
    // рыночная площадь Старого города: фонтан, статуя, торговые палатки
    market(L) {
      const { x, z } = L, y = D.CURB;
      mesh(Cy(5.2, 5.5, 0.8, 32), M.stone, x, y, z);
      mesh(Cy(4.8, 4.8, 0.1, 32), M.water, x, y + 0.7, z);
      mesh(Cy(0.7, 0.9, 2.4, 12), M.stone, x, y, z);
      mesh(Cy(2, 0.5, 0.4, 16), M.stone, x, y + 2.4, z);
      grid.addCircle(x, z, 5.5, 1.2);
      statue(x, z + 20, Math.PI, 1.9, 'raise', y);
      const awn = [0xd23a2f, 0x2a5bd7, 0xf2c230, 0x38b26a, 0xf07ab0, 0xff8a2a];
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2 + 0.3, sx = x + Math.cos(a) * 24, sz = z + Math.sin(a) * 18, ry = -a + Math.PI / 2;
        if (Math.hypot(sx - x, sz - (z + 20)) < 6) continue;
        mesh(Bx(3.2, 1.0, 1.6), M.wood, sx, y, sz, ry);
        mesh(Bx(3.6, 0.12, 2.6), stdMat(awn[k % awn.length]), sx, y + 2.4, sz, ry);
        for (const [px, pz] of [[-1.6, -1.1], [1.6, -1.1], [-1.6, 1.1], [1.6, 1.1]]) {
          const c = Math.cos(ry), s = Math.sin(ry);
          mesh(Cy(0.05, 0.05, 2.4, 5), M.wood, sx + px * c + pz * s, y, sz - px * s + pz * c);
        }
        grid.addCircle(sx, sz, 1.8, 2.5);
      }
    },
    // грузовое судно у причала гавани (контейнеры на палубу ставит cityData)
    ship(L) {
      const { x, z } = L;
      mesh(Bx(110, 6, 22), M.red, x, -4, z);
      mesh(Bx(110, 4, 22), M.navy, x, 2, z);
      mesh(Bx(110, 0.3, 21.4), stdMat(0x6b6f74), x, 5.85, z);
      const bow = new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(0, -11), new THREE.Vector2(0, 11), new THREE.Vector2(-22, 0)]), { depth: 10, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, -4, 0);
      mesh(bow, M.navy, x - 55, 0, z);
      mesh(styled(Bx(13, 15, 20), FACADE.ribbon), bm(0xf2f2ee), x + 46, 6, z);
      mesh(Bx(15, 1.2, 26), stdMat(0xf2f2ee), x + 46, 19.4, z);
      mesh(Cy(2.4, 2.8, 7, 16), M.red, x + 50, 21, z);
      mesh(Cy(2.45, 2.45, 1.2, 16), MAT.black, x + 50, 27.8, z);
      for (const mx of [-30, 0]) { mesh(Cy(0.35, 0.45, 14, 8), stdMat(0xf2c230), x + mx, 6, z + 9); }
    },
    // триумфальная арка над дорожкой у северного входа в парк
    gate(L) {
      const { x, z } = L, y = L.y;
      for (const s of [-1, 1]) {
        mesh(Bx(5.4, 1, 6.4), M.darkStone, x + s * 8.25, y, z);
        mesh(Bx(4.5, 19, 5.6), M.stone, x + s * 8.25, y + 1, z);
        grid.addBox(x + s * 8.25 - 2.7, x + s * 8.25 + 2.7, z - 3.2, z + 3.2, 20);
      }
      for (const dz of [-2.5, 2.5]) mesh(new THREE.TorusGeometry(6, 0.55, 8, 24, Math.PI), M.stone, x, y + 8, z + dz);
      mesh(Bx(21, 6, 6), M.stone, x, y + 14, z);
      mesh(Bx(21.4, 1.3, 6.3), M.bronze, x, y + 16.2, z);
      mesh(Bx(22, 0.9, 6.8), M.darkStone, x, y + 20, z);
      mesh(figure('raise'), M.bronze, x, y + 20.9, z, 0).scale.setScalar(2.4);
      hiddenBox(x, y + 14, z, 21, 7.5, 6);
    },
    // пирс с колесом обозрения (настил и ограждения — из deckPlan, здесь сваи, фонари, киоски и колесо)
    pier(L) {
      const wood = M.wood, top = L.y;
      for (let zz = L.zr; zz > L.zEnd - 25; zz -= 10) for (const s of [-1, 1]) {
        const half = zz < L.zEnd + 15 ? 21 : 5.5;
        mesh(Cy(0.35, 0.35, top + 7, 8), wood, L.x + s * half, -7, zz);
      }
      for (let zz = L.zr - 10; zz > L.zEnd + 15; zz -= 22) for (const s of [-1, 1]) {
        mesh(Cy(0.08, 0.1, 4.5, 6), M.steel, L.x + s * 5.6, top, zz);
        mesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff1c4 }), L.x + s * 5.6, top + 4.6, zz);
      }
      // киоски на площадке
      for (const [s, c] of [[-1, 0xf07ab0], [1, 0x2ff0ff]]) {
        const kx = L.x + s * 16, kz = L.zEnd + 9;
        mesh(Bx(5, 3, 4), stdMat(0xf4efe4), kx, top, kz);
        mesh(Bx(6, 0.25, 5.4), stdMat(c), kx, top + 3, kz);
        hiddenBox(kx, top, kz, 5, 3.3, 4);
      }
      // колесо обозрения: ось вдоль z, вращается, кабинки остаются вертикальными
      const R = 18, hy = top + 23, zw = L.zw;
      for (const s of [-1, 1]) for (const q of [-1, 1]) {
        beam([L.x + s * 11, top, zw + q * 4.5], [L.x, hy, zw + q * 1.6], 0.9, M.steel, group);
        hiddenBox(L.x + s * 11, top, zw + q * 4.5, 1.8, 3, 1.8);
      }
      const parts = [];
      for (const dz of [-1.3, 1.3]) {
        parts.push(new THREE.TorusGeometry(R, 0.32, 8, 72).translate(0, 0, dz));
        for (let k = 0; k < 16; k++) parts.push(new THREE.BoxGeometry(0.18, R, 0.18).translate(0, R / 2, 0).rotateZ(k / 16 * Math.PI * 2).translate(0, 0, dz));
      }
      parts.push(new THREE.CylinderGeometry(1.2, 1.2, 4, 16).rotateX(Math.PI / 2));
      const wheel = new THREE.Group(); wheel.position.set(L.x, hy, zw); group.add(wheel);
      mesh(mergeGeometries(parts), stdMat(0xf4f4f4, { metalness: 0.4, roughness: 0.4 }), 0, 0, 0, 0, wheel);
      const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), 32);
      const NEON = [0xff3fa4, 0x2ff0ff, 0xffe14a, 0x6aff6a];
      for (let k = 0; k < 32; k++) { const a = k / 32 * Math.PI * 2; setInst(bulbs, k, Math.cos(a) * R, Math.sin(a) * R, 1.7, 1, 1, 1); bulbs.setColorAt(k, _col.setHex(NEON[k % 4])); }
      bulbs.computeBoundingSphere(); wheel.add(bulbs);
      const gond = [], gGeo = new THREE.BoxGeometry(2.2, 2.2, 2).translate(0, -2.2, 0), rGeo = new THREE.ConeGeometry(1.5, 0.8, 4).rotateY(Math.PI / 4).translate(0, -0.7, 0);
      for (let k = 0; k < 16; k++) {
        const a = k / 16 * Math.PI * 2, g = new THREE.Group();
        g.position.set(Math.cos(a) * R, Math.sin(a) * R, 0); wheel.add(g);
        mesh(gGeo, stdMat(NEON[k % 4]), 0, 0, 0, 0, g); mesh(rGeo, M.white, 0, 0, 0, 0, g);
        gond.push(g);
      }
      ups.push(dt => { wheel.rotation.z += dt * 0.12; for (const g of gond) g.rotation.z = -wheel.rotation.z; });
    },
    // кольцевая развязка: островок с бордюром и газоном, в центре монумент
    roundabout(L) {
      const { x, z, r } = L;
      mesh(Cy(r, r + 0.15, 0.45, 40), M.stone, x, 0, z);
      mesh(Cy(r - 0.35, r - 0.35, 0.5, 40), M.grass, x, 0, z);
      grid.addCircle(x, z, r + 0.1, 0.9);
      if (L.mon === 'globe') {
        mesh(Bx(3, 1.2, 3), M.darkStone, x, 0.5, z);
        mesh(Cy(0.45, 0.7, 5.6, 12), M.stone, x, 1.7, z);
        mesh(new THREE.SphereGeometry(2.4, 24, 16), M.bronze, x, 9.7, z);
        const ring = mesh(new THREE.TorusGeometry(3.3, 0.13, 8, 48), M.gold, x, 9.7, z);
        ring.rotation.x = 1.15;
        ups.push(dt => { ring.rotation.z += dt * 0.5; });
        grid.addCircle(x, z, 2.2, 13);
      } else {
        mesh(Bx(3.4, 2, 3.4), M.stone, x, 0.5, z);
        mesh(new THREE.CylinderGeometry(0.55, 1.1, 14, 4).rotateY(Math.PI / 4).translate(0, 7, 0), M.stone, x, 2.5, z);
        mesh(new THREE.ConeGeometry(0.78, 1.6, 4).rotateY(Math.PI / 4).translate(0, 0.8, 0), M.gold, x, 16.5, z);
        grid.addCircle(x, z, 1.9, 18);
      }
    },
    figure(L) { statue(L.x, L.z, L.ry, L.s, L.pose); },
  };
  for (const L of list) BUILD[L.kind]?.(L);
  return { update(dt, t) { for (const u of ups) u(dt, t); } };
}
