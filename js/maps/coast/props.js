// Побережье — ПОСТРОЙКА: зелень и сбиваемые мелочи (раскладка — js/maps/coast/nature.js, ящики — sites.js).
// Деревья — сбиваемые (Breakables): зонтичные сосны, ели, кипарисы, оливы — тяжёлые, ломаются только на скорости;
// шпалеры виноградника (столбик + лоза до соседнего), тюки сена и ящики порта — лёгкие, разлетаются от удара.
// Кусты — без коллизий, видны только вблизи. Всё — InstancedMesh по чанкам (brkChunks из coastBuildKit).
// Порядок этапов — в buildCoast() (js/maps/coast/build.js).
// Определяет: coastBuildProps.
// Использует: Y_AXIS, stdMat, instChunks, setInst (js/world.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

function coastBuildProps(K) {
  const { D, group, grid, dist, brkChunks } = K;
  const C = D.C, { ground, pines, firs, cypress, olives, vines, bales, bushes, crates } = C;
  const col = new THREE.Color(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const loc = (x, y, z, sx, sy, sz, ry = 0) => new THREE.Matrix4().compose(v.set(x, y, z), q.setFromAxisAngle(Y_AXIS, ry), sc.set(sx, sy, sz));
  const leafMat = () => stdMat(0xffffff, { flatShading: true, roughness: 0.9 });
  const bark = stdMat(0x6b4a2f, { flatShading: true });
  // крона: икосаэдр, у каждого дерева свой оттенок зелени
  const crownGeo = new THREE.IcosahedronGeometry(1, 1);
  /* ---------- зонтичные сосны: высокий голый ствол, плоская широкая крона ---------- */
  brkChunks(pines, [
    { geo: new THREE.CylinderGeometry(0.22, 0.36, 8.5, 6).translate(0, 4.25, 0), mat: bark },
    { geo: crownGeo, mat: leafMat(), per: 2, loc: [loc(0, 8.9, 0, 4.4, 1.5, 4.0), loc(1.3, 8.3, 0.6, 2.6, 1.1, 2.6, 0.7)] },
  ], { mass: 450, anchor: 4, minSpeed: 7, dmg: 0.55, cy: 4.5, lie: 1.12, kind: 'wood' }, (B, o, i) => {
    B.add(grid, o.x, ground(o.x, o.z) - 0.2, o.z, o.r, 0.38 * o.s + 0.1, 10 * o.s, { s: o.s, rx: o.lx, rz: o.lz });
    for (let k = 0; k < 2; k++) B.meshes[1].mesh.setColorAt(i * 2 + k, col.setHSL(0.24 + o.c * 0.05, 0.42, 0.24 + k * 0.03 + o.c * 0.04));
  }, 12);
  /* ---------- ели выше по склонам ---------- */
  brkChunks(firs, [
    { geo: new THREE.CylinderGeometry(0.2, 0.3, 2.4, 5).translate(0, 1.2, 0), mat: bark },
    { geo: new THREE.ConeGeometry(2.3, 7.5, 7).translate(0, 5.6, 0), mat: leafMat() },
  ], { mass: 450, anchor: 4, minSpeed: 7, dmg: 0.55, cy: 4, lie: 1.15, kind: 'wood' }, (B, o, i) => {
    B.add(grid, o.x, ground(o.x, o.z) - 0.2, o.z, o.r, 0.4 * o.s + 0.1, 9 * o.s, { s: o.s });
    B.meshes[1].mesh.setColorAt(i, col.setHSL(0.3 + o.c * 0.04, 0.38, 0.19 + o.c * 0.05));
  }, 10);
  /* ---------- кипарисы: узкие высокие «свечи» ---------- */
  brkChunks(cypress, [
    { geo: new THREE.CylinderGeometry(0.14, 0.2, 1.2, 5).translate(0, 0.6, 0), mat: bark },
    { geo: crownGeo, mat: leafMat(), per: 1, loc: [loc(0, 5.4, 0, 1.05, 4.9, 1.05)] },
  ], { mass: 300, anchor: 3, minSpeed: 6, dmg: 0.5, cy: 4.5, lie: 1.25, kind: 'wood' }, (B, o, i) => {
    B.add(grid, o.x, ground(o.x, o.z) - 0.2, o.z, o.c * 6, 0.45 * o.s, 10 * o.s, { s: o.s });
    B.meshes[1].mesh.setColorAt(i, col.setHSL(0.3 + o.c * 0.03, 0.4, 0.15 + o.c * 0.04));
  }, 12);
  /* ---------- оливы: низкий кривой ствол, серо-зелёная крона ---------- */
  brkChunks(olives, [
    { geo: new THREE.CylinderGeometry(0.2, 0.32, 1.8, 6).translate(0, 0.9, 0), mat: stdMat(0x7a6650, { flatShading: true }) },
    { geo: crownGeo, mat: leafMat(), per: 2, loc: [loc(0.2, 2.6, 0, 2.1, 1.4, 2.0), loc(-0.7, 2.2, 0.5, 1.4, 1.0, 1.4)] },
  ], { mass: 260, anchor: 3, minSpeed: 5.5, dmg: 0.5, cy: 1.8, lie: 1.2, kind: 'wood', far: 420 }, (B, o, i) => {
    B.add(grid, o.x, ground(o.x, o.z) - 0.1, o.z, o.r, 0.32 * o.s, 4 * o.s, { s: o.s, rx: 0.06, rz: -0.04 });
    for (let k = 0; k < 2; k++) B.meshes[1].mesh.setColorAt(i * 2 + k, col.setHSL(0.2 + o.c * 0.04, 0.22, 0.36 + o.c * 0.06 - k * 0.03));
  }, 8);
  /* ---------- шпалеры виноградника: столбик и лоза до соседнего столбика ---------- */
  const vineLoc = [null, loc(0, 1.05, 2, 0.5, 0.95, 4)], noLoc = [null, loc(0, 1.05, 0, 0.001, 0.001, 0.001)];
  brkChunks(vines, [
    { geo: new THREE.BoxGeometry(0.12, 1.7, 0.12).translate(0, 0.85, 0), mat: stdMat(0x8a6a48), shadow: false },
    { geo: new THREE.BoxGeometry(1, 1, 1), mat: stdMat(0x5d7f34, { roughness: 0.95 }), shadow: false },
  ], { mass: 25, anchor: 0.4, minSpeed: 1.5, dmg: 0.05, cy: 0.9, lie: 1.45, kind: 'post', light: true, far: 300 }, (B, o) => {
    B.add(grid, o.x, ground(o.x, o.z), o.z, o.ry, 0.14, 1.7, { loc: o.seg ? vineLoc : noLoc });
  }, 6);
  /* ---------- тюки сена ---------- */
  brkChunks(bales, [
    { geo: new THREE.CylinderGeometry(0.78, 0.78, 1.3, 14).rotateZ(Math.PI / 2).translate(0, 0.78, 0), mat: stdMat(0xd8b65a, { roughness: 1 }) },
  ], { mass: 220, anchor: 0.3, minSpeed: 2, dmg: 0.15, cy: 0.78, lie: 1.5, kind: 'wood', light: true, far: 380 }, (B, o) => {
    B.add(grid, o.x, ground(o.x, o.z), o.z, o.ry, 0.75, 1.5);
  }, 6);
  /* ---------- ящики в порту ---------- */
  brkChunks(crates, [
    { geo: new THREE.BoxGeometry(1.1, 1.1, 1.1).translate(0, 0.55, 0), mat: stdMat(0xa07a4a, { roughness: 0.9 }) },
  ], { mass: 40, anchor: 0, minSpeed: 1, dmg: 0.05, cy: 0.55, lie: 1.5, kind: 'wood', light: true, far: 300 }, (B, o) => {
    B.add(grid, o.x, ground(o.x, o.z) + (o.stack ? 1.1 : 0), o.z, o.rot, 0.6 * o.s, 1.2 * o.s, { s: o.s });
  }, 6);
  /* ---------- кусты: без коллизий ---------- */
  const bm = instChunks(group, crownGeo, leafMat(), bushes, o => [o.x, o.z], (m, i, o) => {
    setInst(m, i, o.x, ground(o.x, o.z) + 0.25 * o.s, o.z, 1.2 * o.s, 0.85 * o.s, 1.1 * o.s, o.c * 6);
    m.setColorAt(i, col.setHSL(0.24 + o.c * 0.06, 0.4, 0.2 + o.c * 0.06));
  }, false);
  for (const m of bm) dist.add(m, 260);
}
