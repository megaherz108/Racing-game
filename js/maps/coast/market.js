// Побережье — ПОСТРОЙКА: рынок на пьяцце. По кругу у края площади, между выездами улиц, — прилавки с полосатыми
// навесами и фруктами, перед ними ящики с фруктами, в свободных промежутках — столики кафе под зонтиками.
// Между фонтаном и рынком остаётся кольцо для проезда. Всё сбиваемое (Breakables, лёгкое — разлетается и кувыркается),
// из разбитого прилавка и ящика брызжут фрукты (частицы smoke, js/effects.js).
// Раскладка — здесь же, со своим зерном: раскладка карты (dataHash) не меняется.
// Порядок этапов — в buildCoast() (js/maps/coast/build.js).
// Определяет: coastBuildMarket.
// Использует: rand (js/core.js); mulberry32, stdMat (js/world.js); smoke (js/effects.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

function coastBuildMarket(K) {
  const { D, dist, brks, brkChunks } = K;
  const C = D.C, pd = C.pads.find(p => p.id === 'piazza'), { x: px, z: pz } = pd, py = pd.h + 0.06;   // на мостовой
  const rng = mulberry32(9177), R = (a, b) => a + (b - a) * rng();

  /* ---------- раскладка ---------- */
  // выезды улиц и дорог с площади — углы, занятые проезжей частью (с запасом)
  const busy = [];
  for (const r of C.roads) for (const p of r.pts) {
    const d = Math.hypot(p.x - px, p.z - pz);
    if (d > 10 && d < pd.r + 1) busy.push({ a: Math.atan2(p.z - pz, p.x - px), da: Math.asin(Math.min(1, (r.hw + 0.8) / d)) });
  }
  const angDist = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  const freeAt = (a, half, taken) => !busy.some(b => angDist(a, b.a) < b.da + half) && !taken.some(t => angDist(a, t.a) < t.half + half + 0.06);
  // дома не должны задевать: точка дальше r от повёрнутого прямоугольника дома (оси — как в js/maps/coast/structures.js)
  const clearOfHouses = (x, z, r) => !C.houses.some(h => {
    const dx = x - h.x, dz = z - h.z, c = Math.cos(h.rot), s = Math.sin(h.rot);
    return Math.abs(dx * c - dz * s) < h.w / 2 + r && Math.abs(dx * s + dz * c) < h.d / 2 + r;
  });
  const RS = 13.4, RC = 11.4, taken = [], stalls = [], crates = [], cafes = [];
  // курс объекта лицом к фонтану: локальная +z смотрит в центр площади
  const faceIn = a => Math.atan2(-Math.cos(a), -Math.sin(a));
  const FRUIT = [0xf2d23c, 0xf08a24, 0xd8372a, 0x7fb83a, 0x6a2e6e, 0xf2a38a, 0xe8c25a, 0x9a1f2a];
  const a0 = R(0, Math.PI * 2);
  for (let k = 0; k < 126 && stalls.length < 8; k++) {
    const a = a0 + k * 0.05, half = 1.7 / RS;
    const x = px + Math.cos(a) * RS, z = pz + Math.sin(a) * RS;
    if (!freeAt(a, half, taken) || !clearOfHouses(x, z, 2)) continue;
    taken.push({ a, half });
    const pal = [0, 1, 2, 3].map(() => FRUIT[Math.floor(rng() * FRUIT.length)]);
    stalls.push({ x, z, ry: faceIn(a), pal, awn: [0xc8362e, 0x2f7d4a, 0x2f5fa8, 0xd08a1c][stalls.length % 4] });
    // два ящика перед прилавком, вдоль касательной
    for (const s of [-0.85, 0.85]) {
      const ta = a + s / RC;
      crates.push({ x: px + Math.cos(ta) * RC, z: pz + Math.sin(ta) * RC, ry: faceIn(ta) + R(-0.2, 0.2), c: FRUIT[Math.floor(rng() * FRUIT.length)] });
    }
  }
  for (let k = 0; k < 126 && cafes.length < 4; k++) {
    const a = a0 + 0.025 + k * 0.05, half = 1.3 / RS;
    const x = px + Math.cos(a) * RS, z = pz + Math.sin(a) * RS;
    if (!freeAt(a, half, taken) || !clearOfHouses(x, z, 1.6)) continue;
    taken.push({ a, half });
    cafes.push({ x, z, ry: R(0, 6.3), c: [0xf1ead8, 0x2f6f4a, 0xb8352f][cafes.length % 3] });
  }

  /* ---------- общие части ---------- */
  const wood = stdMat(0x8a6440, { roughness: 0.9 });
  const col = new THREE.Color();
  // брызги фруктов из разбитого объекта: яркие круглые частицы, падают
  const burst = (it, colors, n) => {
    const vx = it.v ? it.v.x : 0, vz = it.v ? it.v.z : 0;
    for (let k = 0; k < n; k++) smoke.spawn(it.x + rand(-0.8, 0.8), it.y + 1, it.z + rand(-0.8, 0.8), vx * rand(0.4, 1) + rand(-2.5, 2.5), rand(3, 6.5),
      vz * rand(0.4, 1) + rand(-2.5, 2.5), 0.3, 0.26, rand(1, 1.6), colors[k % colors.length], 1, 14);
  };
  const before = brks.length;

  /* ---------- прилавки ---------- */
  // каркас: столешница, передняя и боковые стенки, четыре стойки (задние выше — навес наклонён вперёд)
  const frame = mergeGeometries([
    new THREE.BoxGeometry(3, 0.08, 1.4).translate(0, 0.9, 0),
    new THREE.BoxGeometry(3, 0.8, 0.05).translate(0, 0.45, 0.68),
    new THREE.BoxGeometry(0.05, 0.86, 1.4).translate(-1.48, 0.45, 0), new THREE.BoxGeometry(0.05, 0.86, 1.4).translate(1.48, 0.45, 0),
    ...[[-1.45, 0.66, 2.05], [1.45, 0.66, 2.05], [-1.45, -0.66, 2.5], [1.45, -0.66, 2.5]].map(([x, z, h]) => new THREE.BoxGeometry(0.07, h, 0.07).translate(x, h / 2, z)),
  ]);
  // навес: полосы — белая и цвет прилавка (цвет экземпляра подмешивается только в тёмные полосы текстуры)
  const stripes = (() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 8; const x = c.getContext('2d');
    for (let k = 0; k < 8; k++) { x.fillStyle = k % 2 ? '#000' : '#fff'; x.fillRect(k * 8, 0, 8, 8); }
    const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; return t;
  })();
  const awnMat = new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.9, side: THREE.DoubleSide });
  awnMat.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `
      #ifdef USE_COLOR
        diffuseColor.rgb = mix( vec3( 0.95, 0.93, 0.88 ), vColor, step( diffuseColor.r, 0.5 ) );
      #endif`);
  };
  const awnGeo = new THREE.BoxGeometry(3.4, 0.04, 1.9).rotateX(0.24).translate(0, 2.3, 0.05);
  // фрукты: на столе четыре кучки по три (два внизу, один сверху), у каждой кучки свой цвет
  const fruitGeo = new THREE.IcosahedronGeometry(0.14, 0);
  const fl = [];
  for (let b = 0; b < 4; b++) for (const [dx, dy, dz] of [[-0.14, 0, 0], [0.14, 0, 0.05], [0, 0.18, 0.02]])
    fl.push(new THREE.Matrix4().makeTranslation(-1.1 + b * 0.73 + dx, 1.05 + dy, 0.15 + dz));
  brkChunks(stalls, [
    { geo: frame, mat: wood },
    { geo: awnGeo, mat: awnMat },
    { geo: fruitGeo, mat: stdMat(0xffffff, { flatShading: true, roughness: 0.55 }), per: 12, loc: fl, shadow: false },
  ], { mass: 140, anchor: 0.5, minSpeed: 2, dmg: 0.12, cy: 1.1, lie: 1.4, kind: 'wood', light: true,
    onBreak: it => burst(it, it.pal, 18) }, (B, o, i) => {
    const it = B.add(K.grid, o.x, py, o.z, o.ry, 1.5, 2.6); it.pal = o.pal;
    B.meshes[1].mesh.setColorAt(i, col.setHex(o.awn));
    for (let k = 0; k < 12; k++) B.meshes[2].mesh.setColorAt(i * 12 + k, col.setHex(o.pal[Math.floor(k / 3)]).offsetHSL(0, 0, (k % 3 - 1) * 0.03));
  }, 6);

  /* ---------- ящики с фруктами ---------- */
  brkChunks(crates, [
    { geo: new THREE.BoxGeometry(0.8, 0.42, 0.55).translate(0, 0.21, 0), mat: wood, shadow: false },   // мелкие: тень не стоит вызова
    { geo: new THREE.BoxGeometry(0.72, 0.1, 0.47).translate(0, 0.42, 0), mat: stdMat(0xffffff, { roughness: 0.6 }), shadow: false },
  ], { mass: 30, anchor: 0, minSpeed: 1, dmg: 0.04, cy: 0.25, lie: 1.5, kind: 'wood', light: true,
    onBreak: it => burst(it, [it.c, it.c, 0xffffff], 10) }, (B, o, i) => {
    const it = B.add(K.grid, o.x, py, o.z, o.ry, 0.5, 0.6); it.c = o.c;
    B.meshes[1].mesh.setColorAt(i, col.setHex(o.c));
  }, 4);

  /* ---------- столики кафе под зонтиками ---------- */
  const cafeFrame = mergeGeometries([
    new THREE.CylinderGeometry(0.04, 0.04, 2.4, 6).translate(0, 1.2, 0),
    new THREE.CylinderGeometry(0.42, 0.42, 0.04, 12).translate(0, 0.74, 0),
    new THREE.CylinderGeometry(0.22, 0.26, 0.04, 10).translate(0, 0.02, 0),
    // два стула
    ...[-0.75, 0.75].flatMap(s => [new THREE.BoxGeometry(0.4, 0.04, 0.4).translate(s, 0.45, 0), new THREE.BoxGeometry(0.04, 0.42, 0.4).translate(s * 1.27, 0.68, 0)]),
  ]);
  brkChunks(cafes, [
    { geo: cafeFrame, mat: stdMat(0xe8e4dc, { roughness: 0.5, metalness: 0.3 }), shadow: false },
    { geo: new THREE.ConeGeometry(1.5, 0.55, 8).translate(0, 2.35, 0), mat: stdMat(0xffffff, { roughness: 0.85, flatShading: true }) },
  ], { mass: 35, anchor: 0.2, minSpeed: 1.5, dmg: 0.05, cy: 1.1, lie: 1.45, kind: 'post', light: true }, (B, o, i) => {
    B.add(K.grid, o.x, py, o.z, o.ry, 0.9, 2.4);
    B.meshes[1].mesh.setColorAt(i, col.setHex(o.c));
  }, 4);

  // мелочь рынка не рисуется издалека (даже если вся помещается в одну InstancedMesh)
  for (let k = before; k < brks.length; k++) for (const E of brks[k].meshes) dist.add(E.mesh, 320);
  Object.assign(K, { market: { stalls, crates, cafes } });
}
