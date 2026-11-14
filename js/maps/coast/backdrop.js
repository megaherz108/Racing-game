// Побережье — ПОСТРОЙКА: горный хребет за краем карты (запад, север, восток) — неподвижный фон без коллизий.
// Внутренний край хребта совпадает с рельефом на границе карты, дальше — гребни с острыми пиками (ridged-шум),
// снег на вершинах; к морю хребет спускается под воду. Дальние хребты тонут в тумане сцены (у карты он длинный).
// Теней не отбрасывает.
// Порядок этапов — в buildCoast() (js/maps/coast/build.js).
// Определяет: coastBuildBackdrop.
// Использует: clamp (js/core.js); makeNoise, mulberry32, smooth01 (js/world.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

function coastBuildBackdrop(K) {
  const { D, group } = K;
  const { HX, HZ, ground, riverPts } = D;
  const zW = riverPts[0].z, zE = riverPts[riverPts.length - 1].z;     // где река пересекает западный и восточный края
  const nz = makeNoise(mulberry32(808));
  const ridged = (x, z) => {                // острые гребни: 1 − |шум|, сложенные в несколько октав
    let a = 1, f = 1 / 420, s = 0;
    for (let o = 0; o < 4; o++, a *= 0.5, f *= 2.1) s += a * (1 - Math.abs(nz(x * f + o * 7.1, z * f - o * 3.3))) ** 2;
    return s / 1.875;
  };
  const X0 = -1500, X1 = 1500, Z0 = -900, Z1 = 1700, CELL = 12;
  const nx = Math.round((X1 - X0) / CELL), nzc = Math.round((Z1 - Z0) / CELL), w = nx + 1;
  const height = (x, z) => {
    const out = Math.max(Math.abs(x) - HX, z - HZ, 0);                   // насколько точка за краем карты
    if (out <= 0) return null;
    const edge = ground(clamp(x, -HX, HX), clamp(z, -HZ, HZ));          // рельеф на границе — шов без ступеньки
    // от края вверх: сначала пологие склоны, дальше — гребни и пики
    let rise = 330 * smooth01(out / 700) ** 1.2 * (0.45 + 0.75 * ridged(x, z)) + (25 * nz(x / 160, z / 160) + 12 * nz(x / 55, z / 55)) * smooth01(out / 150);
    // ущелья, где река входит в карту и уходит из неё
    if (Math.abs(x) > HX) rise *= 1 - 0.85 * Math.exp(-(((z - (x > 0 ? zW : zE)) / 55) ** 2)) * (1 - smooth01(out / 650));
    // у моря хребет понижается и уходит под воду (там и край карты — уже морское дно)
    return edge + rise * smooth01((z + 720) / 260);
  };
  const pos = [], col = [], idx = [], vid = new Int32Array(w * (nzc + 1)).fill(-1);
  // у края карты — те же травы, что на карте (js/maps/coast/ground.js), выше — скалы и снег
  const rock = new THREE.Color(0x8c7f70), dark = new THREE.Color(0x6a6152), green = new THREE.Color(0x7c9644), dry = new THREE.Color(0xb3a462),
    snow = new THREE.Color(0xf4efe6), c = new THREE.Color();
  for (let j = 0; j <= nzc; j++) for (let i = 0; i <= nx; i++) {
    const x = X0 + i * CELL, z = Z0 + j * CELL;
    // точки чуть внутри карты тоже нужны — чтобы край хребта лёг на рельеф
    const out = Math.max(Math.abs(x) - HX, z - HZ);
    if (out < -CELL) continue;
    const h = out <= 0 ? ground(clamp(x, -HX, HX), clamp(z, -HZ, HZ)) - 0.5 : height(x, z);
    const n = nz(x / 37, z / 37);
    c.copy(green).lerp(dry, clamp(0.45 + 0.4 * nz(x / 70, z / 70), 0, 1) * 0.8).lerp(rock, smooth01((h - 80 - n * 55) / 110)).lerp(dark, clamp(0.3 + nz(x / 90, z / 90) * 0.5, 0, 1) * smooth01((h - 110) / 100));
    c.lerp(snow, smooth01((h - 250 - n * 40) / 50));
    vid[j * w + i] = pos.length / 3;
    pos.push(x, h, z); col.push(c.r, c.g, c.b);
  }
  for (let j = 0; j < nzc; j++) for (let i = 0; i < nx; i++) {
    const a = vid[j * w + i], b = vid[j * w + i + 1], cc = vid[(j + 1) * w + i], d = vid[(j + 1) * w + i + 1];
    if (a < 0 || b < 0 || cc < 0 || d < 0) continue;
    idx.push(a, cc, b, b, cc, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  const mesh = new THREE.Mesh(g, mat); mesh.userData.keep = true;
  group.add(mesh);
  Object.assign(K, { backdrop: mesh });
}
