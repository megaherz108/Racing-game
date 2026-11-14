// Побережье — ПОСТРОЙКА: земля и вода.
// coastBuildGround — рельеф из сетки высот H чанками по 128 клеток (256 м) с тремя уровнями подробности
//   (2, 4 и 8 м — переключает cullView() мира по расстоянию до камеры), цвет вершин (трава, сухая трава, скалы,
//   песок, бетон порта, дно), «юбки» по краям чанков против щелей между уровнями; море — плоскость, река — лента
//   воды на своём уровне (wlAt), над заводью — шире.
// Порядок этапов — в buildCoast() (js/maps/coast/build.js).
// Определяет: COAST_CHUNK, COAST_LOD, COAST_GREEN, coastGreen, coastBuildGround.
// Использует: clamp (js/core.js); smooth01, makeNoise, mulberry32, noiseTexture (js/world.js); Weather
//   (js/weather.js); waterMaterial (js/maps/city/textures.js); ellMetric (js/maps/coast/terrain.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const COAST_CHUNK = 128;                       // клеток сетки высот в чанке земли (по 2 м)
const COAST_LOD = [[1, 0], [2, 150], [4, 380]];   // [шаг в клетках, с какого расстояния до чанка, м]
// Палитра зелени: жёлто-зелёные тона (трава, кроны, горы-фон) сдвигаются к зелёному, чуть насыщеннее и темнее.
// Считается в sRGB-HSL; вес плавно спадает по оттенку и насыщенности, поэтому песок, грунт, камень и бетон
// почти не меняются. hue — сдвиг оттенка (доля круга), s и l — множители насыщенности и яркости.
const COAST_GREEN = { hue: 0.04, s: 1.12, l: 0.8 };
const coastGreen = (() => {
  const h = {}, band = (a, b, x) => smooth01((x - a) / (b - a));
  return c => {
    c.getHSL(h, THREE.SRGBColorSpace);
    const w = band(0.115, 0.15, h.h) * (1 - band(0.42, 0.5, h.h)) * band(0.06, 0.14, h.s);
    if (w > 0) c.setHSL(h.h + COAST_GREEN.hue * w, Math.min(1, h.s * (1 + (COAST_GREEN.s - 1) * w)), h.l * (1 + (COAST_GREEN.l - 1) * w), THREE.SRGBColorSpace);
    return c;
  };
})();
function coastBuildGround(K) {
  const { D, group } = K;
  const { C } = D, { H, NX, NZ, gx, gz, STEP, ZC, port, RD, RI, riverPts, wlAt, waterAt, island, lagoon, roadAt } = C;
  const nz = makeNoise(mulberry32(31));
  /* ---------- цвет и нормали вершин сетки ---------- */
  const COL = {
    grass: new THREE.Color(0x7c9644), lush: new THREE.Color(0x5f8a3c), dry: new THREE.Color(0xb3a462), rock: new THREE.Color(0x8e8373),
    sand: new THREE.Color(0xdcc795), wet: new THREE.Color(0xae9a70), bed: new THREE.Color(0x8c7d5c), concrete: new THREE.Color(0x9c9890),
    dirt: new THREE.Color(0xa88c64), gravel: new THREE.Color(0xb7ab8e), cobble: new THREE.Color(0x9e9282),
  };
  const N = NX * NZ, colors = new Float32Array(N * 3), normals = new Float32Array(N * 3), c = new THREE.Color();
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const k = j * NX + i, x = gx(i), z = gz(j), h = H[k];
    const hx = (H[j * NX + Math.min(NX - 1, i + 1)] - H[j * NX + Math.max(0, i - 1)]) / (2 * STEP);
    const hz = (H[Math.min(NZ - 1, j + 1) * NX + i] - H[Math.max(0, j - 1) * NX + i]) / (2 * STEP);
    const l = Math.hypot(hx, 1, hz), ny = 1 / l;
    normals[k * 3] = -hx / l; normals[k * 3 + 1] = ny; normals[k * 3 + 2] = -hz / l;
    const wl = waterAt(x, z), s = z - ZC[i];
    if (h < wl - 0.1) {
      c.copy(COL.bed).multiplyScalar(clamp(1 + (h - wl) * 0.08, 0.55, 1));          // дно: глубже — темнее
    } else {
      // трава: сочнее в низинах у реки, суше на солнечных южных склонах и вершинах; шум — пятнами
      const dry = clamp(0.35 + 0.45 * nz(x / 70, z / 70) + 0.25 * nz(x / 23, z / 23) - hz * 0.8 + (h - 25) * 0.008, 0, 1);
      c.copy(COL.grass).lerp(COL.dry, dry * 0.8);
      const nearRiver = RD[k] < 1e8 ? RD[k] - riverPts[RI[k]].hw : 1e9;
      c.lerp(COL.lush, (1 - smooth01((nearRiver - 6) / 45)) * 0.55);
      c.multiplyScalar(0.92 + 0.1 * nz(x / 7, z / 7));
      // скалы на крутых склонах
      c.lerp(COL.rock, smooth01((0.86 - ny) / 0.16));
      // песок: пляж, берега реки и заводи, остров; у самой воды — мокрый
      const sandK = Math.max(1 - smooth01((s - 18) / 12), wl > 0.5 ? 1 - smooth01((h - wl - 0.7) / 0.5) : 0,
        1 - smooth01((ellMetric(island, x, z) - 0.85) / 0.2));
      if (sandK > 0) c.lerp(h < wl + 0.25 ? COL.wet : COL.sand, sandK * (0.9 + 0.1 * nz(x / 5, z / 5)));
      // бетонная площадка порта
      const pd = Math.max(port.x0 - x, 0, x - port.x1, port.z0 - 2 - z, z - port.z1);
      if (pd < 2) c.copy(COL.concrete).multiplyScalar(0.94 + 0.06 * nz(x / 4, z / 4));
      // под дорогами и на площадках — утоптанный грунт, гравий, камень (края ленты дороги сливаются с землёй)
      const rd = roadAt(x, z);
      if (rd) c.copy(COL[rd.kind === 'gravel' ? 'gravel' : rd.kind === 'cobble' ? 'cobble' : 'dirt']).multiplyScalar(0.92 + 0.1 * nz(x / 3, z / 3));
    }
    coastGreen(c);
    colors[k * 3] = c.r; colors[k * 3 + 1] = c.g; colors[k * 3 + 2] = c.b;
  }

  /* ---------- чанки земли с уровнями подробности ---------- */
  const detail = noiseTexture(256, '#ffffff', 0.22, 26000);       // мелкая «зернистость» травы поверх цвета вершин
  const landMat = Weather.wet(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, map: detail }), 0.35);
  const landLod = [], SK = 2.5;                                     // глубина «юбки», м
  for (let j0 = 0; j0 < NZ - 1; j0 += COAST_CHUNK) for (let i0 = 0; i0 < NX - 1; i0 += COAST_CHUNK) {
    const ni = Math.min(COAST_CHUNK, NX - 1 - i0), nj = Math.min(COAST_CHUNK, NZ - 1 - j0), w = ni + 1, n = (ni + 1) * (nj + 1);
    // вершины чанка + копии краевых вершин на SK ниже (юбка)
    const edge = [];
    for (let a = 0; a <= ni; a++) edge.push([a, 0], [a, nj]);
    for (let b = 1; b < nj; b++) edge.push([0, b], [ni, b]);
    const pos = new Float32Array((n + edge.length) * 3), col = new Float32Array((n + edge.length) * 3), nor = new Float32Array((n + edge.length) * 3), uv = new Float32Array((n + edge.length) * 2);
    const put = (v, a, b, dy) => {
      const k = (j0 + b) * NX + i0 + a, x = gx(i0 + a), z = gz(j0 + b);
      pos.set([x, H[k] - dy, z], v * 3); col.set(colors.subarray(k * 3, k * 3 + 3), v * 3); nor.set(normals.subarray(k * 3, k * 3 + 3), v * 3);
      uv[v * 2] = x / 7; uv[v * 2 + 1] = z / 7;
    };
    for (let b = 0; b <= nj; b++) for (let a = 0; a <= ni; a++) put(b * w + a, a, b, 0);
    const skirt = new Map();
    edge.forEach(([a, b], e) => { put(n + e, a, b, SK); skirt.set(b * w + a, n + e); });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.computeBoundingSphere();
    const lods = COAST_LOD.map(([S, from]) => {
      const idx = [], V = (a, b) => Math.min(b, nj) * w + Math.min(a, ni);
      for (let b = 0; b < nj; b += S) for (let a = 0; a < ni; a += S) {
        const p00 = V(a, b), p10 = V(a + S, b), p01 = V(a, b + S), p11 = V(a + S, b + S);
        idx.push(p00, p01, p10, p01, p11, p10);
      }
      // юбка: вдоль каждого края — полоса вниз, закрывает щели между чанками разной подробности
      const side = (list) => { for (let q = 0; q + 1 < list.length; q++) { const u = list[q], v = list[q + 1], su = skirt.get(u), sv = skirt.get(v); idx.push(u, su, v, v, su, sv, u, v, su, v, sv, su); } };
      const run = (f, len) => { const L = []; for (let t = 0; t < len; t += S) L.push(f(t)); L.push(f(len)); return L; };
      side(run(t => V(t, 0), ni)); side(run(t => V(t, nj), ni)); side(run(t => V(0, t), nj)); side(run(t => V(ni, t), nj));
      const lg = S === 1 ? g : new THREE.BufferGeometry();
      if (S !== 1) { for (const key of Object.keys(g.attributes)) lg.setAttribute(key, g.attributes[key]); lg.boundingSphere = g.boundingSphere.clone(); }
      lg.setIndex(idx);
      const mesh = new THREE.Mesh(lg, landMat); mesh.receiveShadow = true; mesh.userData.keep = true; mesh.visible = S === 1;
      group.add(mesh);
      return { mesh, from };
    });
    landLod.push({ lods, x: g.boundingSphere.center.x, z: g.boundingSphere.center.z, r: g.boundingSphere.radius });
  }

  /* ---------- вода ---------- */
  const waterMat = waterMaterial(0x2b7cb3);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(7000, 7000), waterMat);
  sea.rotation.x = -Math.PI / 2; sea.userData.dynamic = true; group.add(sea);
  // река: лента на уровне реки, края уходят под берега; над заводью шире, чтобы накрыть её целиком
  const rp = [], ri = [];
  riverPts.forEach((p, q) => {
    const hw = p.hw + 9 + 36 * (1 - smooth01(Math.abs(p.x - lagoon.x) / 55));
    for (const sd of [1, -1]) rp.push(p.x + p.nx * hw * sd, p.wl, p.z + p.nz * hw * sd);
    if (q > 0) { const o = (q - 1) * 2; ri.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); }
  });
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)); rg.setIndex(ri); rg.computeVertexNormals();
  // треугольники должны смотреть вверх
  if (rg.attributes.normal.getY(0) < 0) { for (let q = 0; q < ri.length; q += 3) [ri[q + 1], ri[q + 2]] = [ri[q + 2], ri[q + 1]]; rg.setIndex(ri); rg.computeVertexNormals(); }
  rg.computeBoundingSphere();
  // река спокойнее и зеленее моря: меньше бликов от низкого солнца
  const riverMat = waterMaterial(0x3d8a94); riverMat.roughness = 0.24;
  const river = new THREE.Mesh(rg, riverMat); river.receiveShadow = true; group.add(river);
  Object.assign(K, { landLod, sea, river, waterMat });
}
