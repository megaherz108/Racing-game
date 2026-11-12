// Карта: горный лес
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

/* =====================================================================
   КАРТА 2: ГОРНЫЙ ЛЕС
   ===================================================================== */
function forestData() {
  const rng = mulberry32(4242), noise = makeNoise(rng);
  const HALF = 260, STEP = 2, N = HALF * 2 / STEP + 1, WATER = -4.5, HW = 5, SH = 7, R = HW + SH + 1;
  const g = (x, z, cx, cz, s) => Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (2 * s * s));
  const base = (x, z) => 4 + 8 * noise(x / 70, z / 70) + 3.5 * noise(x / 23 + 11, z / 23 - 7) + 1.2 * noise(x / 9 + 3, z / 9 + 5)
    + 72 * g(x, z, 90, 85, 65)            // главная гора
    + 28 * g(x, z, -130, -70, 50)         // хребет
    + 18 * g(x, z, -40, -150, 40)
    - 18 * g(x, z, -70, 60, 38)           // котловина озера
    + 45 * smooth01((Math.max(Math.abs(x), Math.abs(z)) - 205) / 57);   // горы по краю карты

  // дороги: кольцо по долинам + серпантин на вершину
  const toV = ([x, z]) => new THREE.Vector3(x, 0, z);
  const loopCtrl = [[-170, -150], [-60, -186], [60, -175], [150, -182], [186, -80], [185, 20], [188, 115], [148, 180], [30, 186], [-90, 165], [-185, 110], [-150, 10], [-188, -60]];
  const loopCurve = new THREE.CatmullRomCurve3(loopCtrl.map(toV), true, 'centripetal');
  const nL = Math.round(loopCurve.getLength() / 2);
  const loop = loopCurve.getSpacedPoints(nL).slice(0, nL).map(v => ({ x: v.x, z: v.z, h: 0 }));
  let si = 0;
  { let best = 1e9; loop.forEach((p, i) => { const d = Math.hypot(p.x - 78, p.z + 178); if (d < best) { best = d; si = i; } }); }
  const sCtrl = [[loop[si].x, loop[si].z], [82, -125], [132, -88], [50, -62], [128, -33], [52, -6], [122, 20], [70, 42], [88, 72]];
  const serpCurve = new THREE.CatmullRomCurve3(sCtrl.map(toV), false, 'centripetal');
  const nS = Math.round(serpCurve.getLength() / 2);
  const serp = serpCurve.getSpacedPoints(nS).map(v => ({ x: v.x, z: v.z, h: 0 }));

  const smoothH = (pts, rad, passes, closed) => {
    const n = pts.length;
    for (let ps = 0; ps < passes; ps++) {
      const src = pts.map(q => q.h);
      for (let i = 0; i < n; i++) {
        let s = 0, c = 0;
        for (let k = -rad; k <= rad; k++) {
          let j = i + k;
          if (closed) j = (j + n) % n; else if (j < 0 || j >= n) continue;
          s += src[j]; c++;
        }
        pts[i].h = s / c;
      }
    }
  };
  for (const p of loop) p.h = base(p.x, p.z);
  for (const p of serp) p.h = base(p.x, p.z);
  smoothH(loop, 12, 4, true); smoothH(serp, 10, 4, false);
  for (const p of [...loop, ...serp]) p.h = Math.max(p.h, WATER + 1.5);
  const jh = loop[si].h;
  for (let i = 0; i < 25 && i < serp.length; i++) serp[i].h = lerp(jh, serp[i].h, i / 25);
  const summit = { x: 90, z: 82, h: serp[serp.length - 1].h };
  const tang = (pts, closed) => pts.forEach((p, i) => {
    const n = pts.length, a = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    p.tx = (b.x - a.x) / l; p.tz = (b.z - a.z) / l; p.nx = p.tz; p.nz = -p.tx;
  });
  tang(loop, true); tang(serp, false);
  const allPts = [...loop, ...serp];

  // карта высот с «вдавленными» дорогами
  const H = new Float32Array(N * N), RD = new Float32Array(N * N).fill(1e9), RH = new Float32Array(N * N);
  const stamp = (x, z, h, rad, inner) => {
    const i0 = Math.max(0, Math.floor((x - rad + HALF) / STEP)), i1 = Math.min(N - 1, Math.ceil((x + rad + HALF) / STEP));
    const j0 = Math.max(0, Math.floor((z - rad + HALF) / STEP)), j1 = Math.min(N - 1, Math.ceil((z + rad + HALF) / STEP));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * N + i, d = Math.max(0, Math.hypot(-HALF + i * STEP - x, -HALF + j * STEP - z) - inner);
      if (d < RD[k]) { RD[k] = d; RH[k] = h; }
    }
  };
  for (const p of allPts) stamp(p.x, p.z, p.h, R, 0);
  stamp(summit.x, summit.z, summit.h, R + 16, 16);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i, b = base(-HALF + i * STEP, -HALF + j * STEP);
    H[k] = RD[k] < R ? lerp(RH[k], b, smooth01((RD[k] - HW) / SH)) : b;
  }
  const ground = (x, z) => {
    const gx = clamp((x + HALF) / STEP, 0, N - 1.0001), gz = clamp((z + HALF) / STEP, 0, N - 1.0001);
    const i = gx | 0, j = gz | 0, fx = gx - i, fz = gz - j, k = j * N + i;
    const a = H[k], b = H[k + 1], c = H[k + N], d = H[k + N + 1];
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  };
  const roadDist = (x, z) => {
    const i = clamp(Math.round((x + HALF) / STEP), 0, N - 1), j = clamp(Math.round((z + HALF) / STEP), 0, N - 1);
    return RD[j * N + i];
  };

  // хвойные деревья, валуны, столбики вдоль дорог
  const trees = [], rocks = [], posts = [];
  for (let t = 0; t < 12000 && trees.length < 2400; t++) {
    const x = (rng() * 2 - 1) * 248, z = (rng() * 2 - 1) * 248, h = ground(x, z);
    if (h < WATER + 0.6 || h > 66 || roadDist(x, z) < HW + 2.5) continue;
    if (h > 48 && rng() < 0.6) continue;
    trees.push([x, z, 0.75 + rng() * 0.8, rng() * 6]);
  }
  for (let t = 0; t < 4000 && rocks.length < 280; t++) {
    const x = (rng() * 2 - 1) * 250, z = (rng() * 2 - 1) * 250, h = ground(x, z);
    if (h < WATER - 1 || roadDist(x, z) < HW + 1.5) continue;
    rocks.push([x, z, 0.5 + rng() ** 2 * 2.8, rng() * 6, rng() * 6]);
  }
  for (const pts of [loop, serp]) for (let i = 0; i < pts.length; i += 8) {
    const p = pts[i];
    for (const s of [1, -1]) { const x = p.x + p.nx * (HW + 0.9) * s, z = p.z + p.nz * (HW + 0.9) * s; posts.push([x, z]); }
  }

  // точки старта на кольцевой дороге
  const sp = loop[4], hs = Math.atan2(sp.tx, sp.tz);
  const spawns = [2.8, -2.8].map(o => [sp.x + Math.cos(hs) * o, sp.z - Math.sin(hs) * o, hs]);

  // мини-карта: рельеф с отмывкой, вода, дороги
  const m = mmCanvas(HALF, 512);
  const img = m.ctx.createImageData(512, 512);
  for (let py = 0; py < 512; py++) for (let px = 0; px < 512; px++) {
    const [x, z] = m.world(px, py), h = ground(x, z), o = (py * 512 + px) * 4;
    let c;
    if (h < WATER) c = [44, 104, 150];
    else {
      const t = clamp(h / 70, 0, 1);
      c = h > 60 ? [235, 238, 240] : t < 0.5 ? [lerp(74, 110, t * 2), lerp(118, 122, t * 2), lerp(52, 74, t * 2)] : [lerp(110, 140, t * 2 - 1), lerp(122, 132, t * 2 - 1), lerp(74, 118, t * 2 - 1)];
      const sh = clamp(1 + ((ground(x + 2, z) - ground(x - 2, z)) * 0.6 - (ground(x, z + 2) - ground(x, z - 2)) * 0.6) * 0.09, 0.6, 1.3);
      c = c.map(v => clamp(v * sh, 0, 255));
    }
    img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
  }
  m.ctx.putImageData(img, 0, 0);
  m.ctx.fillStyle = 'rgba(28,62,30,0.55)';
  for (const [x, z] of trees) m.ctx.fillRect(m.X(x) - 0.8, m.Z(z) - 0.8, 1.6, 1.6);
  m.ctx.strokeStyle = '#d7ab6c'; m.ctx.lineWidth = 2 * HW * m.sc; m.ctx.lineJoin = m.ctx.lineCap = 'round';
  for (const [pts, closed] of [[loop, true], [serp, false]]) {
    m.ctx.beginPath(); pts.forEach((p, i) => i ? m.ctx.lineTo(m.X(p.x), m.Z(p.z)) : m.ctx.moveTo(m.X(p.x), m.Z(p.z)));
    if (closed) m.ctx.closePath(); m.ctx.stroke();
  }
  m.ctx.fillStyle = '#e8402f'; m.dot(summit.x, summit.z, 4);

  return { HALF, STEP, N, WATER, HW, H, RD, ground, roadDist, loop, serp, allPts, summit, trees, rocks, posts, spawns, noise,
    minimap: m.c, mmExt: HALF, mmBg: '#3f6b33' };
}

function buildForest(D) {
  const group = new THREE.Group(), grid = new StaticGrid(10);
  const { HALF, STEP, N, HW, WATER } = D;
  // рельеф
  const geo = new THREE.PlaneGeometry(2 * HALF, 2 * HALF, N - 1, N - 1); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const idx = new Int32Array(pos.count);
  for (let k = 0; k < pos.count; k++) {
    const i = Math.round((pos.getX(k) + HALF) / STEP), j = Math.round((pos.getZ(k) + HALF) / STEP);
    idx[k] = j * N + i; pos.setY(k, D.H[idx[k]]);
  }
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal, cols = new Float32Array(pos.count * 3);
  const cDirt = new THREE.Color(0x8f6d45), cGrass = new THREE.Color(0x4f7d34), cForest = new THREE.Color(0x3f6a2b),
    cRock = new THREE.Color(0x7b756b), cSnow = new THREE.Color(0xeef1f4), cMud = new THREE.Color(0x6d6248), tmp = new THREE.Color();
  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k), z = pos.getZ(k), h = pos.getY(k), ny = nrm.getY(k), rd = D.RD[idx[k]], v = D.noise(x / 14, z / 14);
    _col.copy(cGrass).lerp(cForest, smooth01(0.5 + v)).multiplyScalar(0.92 + v * 0.08);
    _col.lerp(cDirt, 1 - smooth01((rd - HW + 0.5) / 2.5));
    _col.lerp(cRock, smooth01((0.86 - ny) / 0.16));
    if (h > 57 + v * 4 && ny > 0.7) _col.lerp(cSnow, smooth01((h - 57 - v * 4) / 3));
    if (h < WATER + 0.4) _col.lerp(tmp.copy(cMud), smooth01((WATER + 0.4 - h) / 1.5));
    cols[k * 3] = _col.r; cols[k * 3 + 1] = _col.g; cols[k * 3 + 2] = _col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }));
  terrain.receiveShadow = true; group.add(terrain);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), stdMat(0x2f78a8, { roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.85 }));
  water.rotation.x = -Math.PI / 2; water.position.y = WATER; group.add(water);

  // хвойные деревья: ствол + крона из трёх конусов, слитых в одну геометрию
  const crownGeo = mergeGeometries([
    new THREE.ConeGeometry(2.3, 4.2, 7).translate(0, 4.0, 0),
    new THREE.ConeGeometry(1.75, 3.4, 7).translate(0, 6.0, 0),
    new THREE.ConeGeometry(1.05, 2.6, 7).translate(0, 7.8, 0),
  ]);
  const trunks = inst(new THREE.CylinderGeometry(0.22, 0.32, 2.6, 5).translate(0, 1.3, 0), stdMat(0x5e3f26, { flatShading: true }), D.trees.length);
  const crowns = inst(crownGeo, stdMat(0xffffff, { flatShading: true, roughness: 0.9 }), D.trees.length);
  // ели ломаются только на скорости (≈ 25 км/ч × размер) и гасят бо́льшую часть скорости машины
  const treeBrk = new Breakables([trunks, crowns], { mass: 450, anchor: 4, minSpeed: 7, dmg: 0.55, cy: 4, lie: 1.15, kind: 'wood' });
  const crownLoc = [0, 1, 2, 3].map(k => new THREE.Matrix4().makeScale(1, 0.95 + k * 0.05, 1));
  D.trees.forEach(([x, z, s, r], i) => {
    treeBrk.add(grid, x, D.ground(x, z) - 0.2, z, r, 0.45 * s + 0.1, 10 * s, { s, loc: [null, crownLoc[i % 4]] });
    crowns.setColorAt(i, _col.setHSL(0.3 + (i % 9) * 0.008, 0.42, 0.17 + (i % 5) * 0.022));
  });
  group.add(trunks, crowns);
  // валуны
  const rocks = inst(new THREE.IcosahedronGeometry(1, 0), stdMat(0xffffff, { flatShading: true, roughness: 0.95 }), D.rocks.length);
  D.rocks.forEach(([x, z, s, r1, r2], i) => {
    setInst(rocks, i, x, D.ground(x, z) - 0.25 * s, z, s * 1.2, s * 0.85, s, r1, r2 * 0.2, 0);
    rocks.setColorAt(i, _col.setHSL(0.08, 0.05, 0.36 + (i % 6) * 0.03));
    grid.addCircle(x, z, s * 0.95, s * 1.4);
  });
  group.add(rocks);
  // столбики-отражатели вдоль дорог
  const posts = inst(new THREE.BoxGeometry(0.14, 1.0, 0.14).translate(0, 0.5, 0), stdMat(0xf2f2f0), D.posts.length, false);
  const caps = inst(new THREE.BoxGeometry(0.16, 0.16, 0.16).translate(0, 0.9, 0), stdMat(0x550000, { emissive: 0xff2a1a, emissiveIntensity: 0.6 }), D.posts.length, false);
  // столбики сбиваются при любом касании
  const postBrk = new Breakables([posts, caps], { mass: 15, light: true, cy: 0.5, lie: 1.45, kind: 'post' });
  D.posts.forEach(([x, z]) => postBrk.add(grid, x, D.ground(x, z), z, 0, 0.12, 1.2));
  group.add(posts, caps);
  // домик на вершине
  {
    const { x, z } = D.summit, y = D.ground(x + 8, z + 6);
    const hut = new THREE.Group(); hut.position.set(x + 8, y, z + 6); hut.rotation.y = 0.4;
    box(6, 3, 5, stdMat(0x8a5a33), 0, 1.5, 0, hut);
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 6.6, 3), stdMat(0x5a2a22)); roof.rotation.z = Math.PI / 2; roof.position.y = 3.9; roof.castShadow = true; hut.add(roof);
    const pole = cyl(0.06, 0.06, 7, 6, MAT.trim, hut); pole.position.set(-4.5, 3.5, 0);
    box(0.05, 1.0, 1.6, stdMat(0xd9372b), -4.5, 6.4, 0.8, hut);
    group.add(hut);
    grid.addCircle(x + 8, z + 6, 3.6, 5);
  }

  const allPts = D.allPts;
  return {
    id: 'forest', group, grid, barrels: [], ground: D.ground, water: WATER, bounds: 250,
    sky: 0xb3d1e8, fog: [100, 460], coinCount: 70, spawns: D.spawns,
    roadPoint(x, z, p) {
      let best = allPts[0], bd = 1e18;
      for (const q of allPts) { const d = (q.x - x) ** 2 + (q.z - z) ** 2; if (d < bd) { bd = d; best = q; } }
      const h = Math.atan2(best.tx, best.tz), lane = p === 0 ? 2.5 : -2.5;
      return [best.x + Math.cos(h) * lane, best.z - Math.sin(h) * lane, h];
    },
    coinSpot() {
      if (Math.random() < 0.75) { const p = allPts[Math.floor(Math.random() * allPts.length)], o = rand(-3, 3); return [p.x + p.nx * o, p.z + p.nz * o]; }
      for (let t = 0; t < 50; t++) {
        const x = rand(-235, 235), z = rand(-235, 235), h = D.ground(x, z);
        if (h > WATER + 1 && h < 66 && D.roadDist(x, z) > 8 && !grid.hitsPoint(x, z, 1.5)) return [x, z];
      }
      return [allPts[0].x, allPts[0].z];
    },
    // камера не должна залезать в кроны деревьев
    occludes(x, y, z) {
      return grid.query(x - 3, x + 3, z - 3, z + 3).some(o => !o.box && o.h > 5 && !(o.brk && o.brk.broken) && Math.hypot(x - o.x, z - o.z) < o.r * 5 && y < D.ground(o.x, o.z) + o.h);
    },
    minimap: D.minimap, mmExt: D.mmExt, mmBg: D.mmBg,
    breakables: [postBrk, treeBrk],
    reset() { postBrk.reset(); treeBrk.reset(); },
    update(dt, t) { water.position.y = WATER + Math.sin(t * 0.7) * 0.04; postBrk.update(dt); treeBrk.update(dt); },
  };
}

