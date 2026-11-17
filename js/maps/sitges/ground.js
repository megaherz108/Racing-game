// Ситжес — ПОСТРОЙКА: земля, море, волнорезы, понтоны марины.
// sitgesBuildGround — рельеф игровой сетки (js/maps/sitges/terrain.js) чанками по SITGES_G.chunk клеток с тремя уровнями
//   подробности (переключает cullView() мира по расстоянию до камеры) и «юбками» против щелей между уровнями.
//   Цвет — текстура земли SITGES_G.ppm пикс/м (площадные объекты, пляжи, ж/д, улицы — sitgesPaint(), волнорезы — камнем),
//   у берега без пляжа — каменная кромка; поверх — оттенок в вершинах: дно темнее с глубиной, мокрый песок у кромки, пятна камня на грядах.
//   Фон за сеткой — плитки outer() (шаг 20 м рядом, дальше 40 и 80 м), цвет в вершинах (площадные объекты с мелкой
//   картинки, дальше — гарига и камень). Море — плоскость на нуле. Волнорезы — гряда в рельефе и валуны поверх.
//   Понтоны марины (линии pier OSM) — плиты-настилы (Decks), по ним можно ехать.
// Порядок этапов — в buildSitges() (js/maps/sitges/build.js).
// Определяет: SITGES_G, sitgesBuildGround.
// Использует: clamp (js/core.js); makeNoise, mulberry32, smooth01, Decks (js/world.js); Weather (js/weather.js);
//   waterMaterial (js/maps/city/textures.js); SITGES_GEO (js/maps/sitges/data-geo.js); SITGES_T
//   (js/maps/sitges/terrain.js); sitgesPaint (js/maps/sitges/minimap.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const SITGES_G = {
  ppm: 1,                                   // текстура земли, пикселей на метр
  chunk: 64,                                // клеток сетки в чанке земли (160 м)
  lod: [[1, 0], [2, 60], [4, 200], [8, 500]], // [шаг в клетках, с какого расстояния до края чанка, м]
  rockCell: 160, rockFar: 300,              // валуны — по квадратам; дальше rockFar м от камеры не рисуются
  far: [5200, -3200, 4800],                 // фон: до |x|, от z (море), до z
  steps: [[500, 20], [2000, 40], [1e9, 80]], // фон: шаг клетки, м, у плиток ближе стольких метров к сетке
  tile: 640,
  land: [184, 175, 156],                    // суша без покрытия на текстуре земли (мини-карта светлее — SITGES_MM.land)
  seabed: '#b9a77c', rock: [112, 106, 96],
  area: { beach: '#d3bf8f', sand: '#d3bf8f' },  // цвета текстуры земли темнее мини-карты (на солнце пересвечены)
  rockShore: 4.5,                           // ширина каменной кромки берега без пляжа, м
  pier: { w: 2.6, t: 0.5, top: 0.8 },
};

function sitgesBuildGround(K) {
  const { D, group } = K, C = D.C, T = C.terra, G = SITGES_G;
  const { X0, X1, Z0, Z1, NX, NZ, S, H, sea, thin, dSea } = T;
  const noise = makeNoise(mulberry32(41));

  /* ---------- текстура земли ---------- */
  const cv = document.createElement('canvas');
  cv.width = Math.round((X1 - X0) * G.ppm); cv.height = Math.round((Z1 - Z0) * G.ppm);
  const ctx = cv.getContext('2d'), X = x => (x - X0) * G.ppm, Z = z => (z - Z0) * G.ppm;
  ctx.fillStyle = `rgb(${G.land.join(',')})`; ctx.fillRect(0, 0, cv.width, cv.height);
  sitgesPaint(ctx, X, Z, G.ppm, { areas: C.areas, rails: [], roads: [] }, { sea: G.seabed, thin: false, area: G.area });   // улицы и пути — 3D (js/maps/sitges/roads3d.js)
  // волнорезы: камень пятнами по клеткам гряды; берег без пляжа (молы, мыс, скалы) — каменная кромка у воды
  const rng = mulberry32(9), [rr, rg, rb] = G.rock, { beach } = T;
  for (let k = 0; k < H.length; k++) if (thin[k] || (!sea[k] && !beach[k] && dSea[k] <= G.rockShore)) {
    const i = k % NX, j = (k / NX) | 0, f = 0.82 + rng() * 0.3;
    ctx.fillStyle = `rgb(${rr * f | 0},${rg * f | 0},${rb * f | 0})`;
    ctx.fillRect(X(X0 + (i - 1.2) * S), Z(Z0 + (j - 1.2) * S), 2.4 * S * G.ppm, 2.4 * S * G.ppm);   // с краем — на склон к воде
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false; tex.anisotropy = 8;
  tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;

  /* ---------- оттенок и нормали в узлах сетки ---------- */
  const N = NX * NZ, tint = new Uint8Array(N * 3), nor = new Int8Array(N * 3), c = [0, 0, 0];
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const k = j * NX + i, x = X0 + i * S, z = Z0 + j * S, h = H[k];
    const hx = (H[j * NX + Math.min(NX - 1, i + 1)] - H[j * NX + Math.max(0, i - 1)]) / (2 * S);
    const hz = (H[Math.min(NZ - 1, j + 1) * NX + i] - H[Math.max(0, j - 1) * NX + i]) / (2 * S);
    const ny = 1 / Math.sqrt(hx * hx + 1 + hz * hz);
    nor[k * 3] = Math.round(-hx * ny * 127); nor[k * 3 + 1] = Math.round(ny * 127); nor[k * 3 + 2] = Math.round(-hz * ny * 127);
    if (sea[k]) {
      const f = clamp(1 - -h * 0.045, 0.45, 1);                       // дно: глубже — темнее и синее
      c[0] = 0.86 * f; c[1] = 0.94 * f; c[2] = f;
    } else {
      let f = 0.95 + 0.05 * noise(x / 9, z / 9);
      if (thin[k]) f *= 0.8 + 0.25 * noise(x / 1.7, z / 1.7);        // камни гряды
      else if (h < 1.5) f *= 0.64 + 0.36 * smooth01((dSea[k] - 1.5) / 6);   // мокрый песок у кромки воды
      const rock = smooth01((0.9 - ny) / 0.2) * 0.25;                  // крутые склоны — серее
      c[0] = f * (1 - rock * 0.1); c[1] = f * (1 - rock * 0.12); c[2] = f * (1 - rock * 0.02);
    }
    tint[k * 3] = clamp(c[0], 0, 1) * 255; tint[k * 3 + 1] = clamp(c[1], 0, 1) * 255; tint[k * 3 + 2] = clamp(c[2], 0, 1) * 255;
  }

  /* ---------- чанки земли с уровнями подробности ---------- */
  const landMat = Weather.wet(new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.95 }), 0.35);
  const landLod = [], SK = 8, CH = G.chunk;          // SK — глубина «юбки», м (на крутых склонах у края сетки фон расходится с ней на метры)
  for (let j0 = 0; j0 < NZ - 1; j0 += CH) for (let i0 = 0; i0 < NX - 1; i0 += CH) {
    const ni = Math.min(CH, NX - 1 - i0), nj = Math.min(CH, NZ - 1 - j0), w = ni + 1, n = (ni + 1) * (nj + 1);
    const edge = [];
    for (let a = 0; a <= ni; a++) edge.push([a, 0], [a, nj]);
    for (let b = 1; b < nj; b++) edge.push([0, b], [ni, b]);
    const V = n + edge.length, pos = new Float32Array(V * 3), col = new Uint8Array(V * 3), nr = new Int8Array(V * 3), uv = new Float32Array(V * 2);
    const put = (v, a, b, dy) => {
      const k = (j0 + b) * NX + i0 + a, x = X0 + (i0 + a) * S, z = Z0 + (j0 + b) * S, v3 = v * 3, k3 = k * 3;
      pos[v3] = x; pos[v3 + 1] = H[k] - dy; pos[v3 + 2] = z;
      col[v3] = tint[k3]; col[v3 + 1] = tint[k3 + 1]; col[v3 + 2] = tint[k3 + 2];
      nr[v3] = nor[k3]; nr[v3 + 1] = nor[k3 + 1]; nr[v3 + 2] = nor[k3 + 2];
      uv[v * 2] = (x - X0) / (X1 - X0); uv[v * 2 + 1] = (z - Z0) / (Z1 - Z0);
    };
    for (let b = 0; b <= nj; b++) for (let a = 0; a <= ni; a++) put(b * w + a, a, b, 0);
    const skirt = new Map();
    edge.forEach(([a, b], e) => { put(n + e, a, b, SK); skirt.set(b * w + a, n + e); });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nr, 3, true));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3, true));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.computeBoundingSphere();
    const lods = G.lod.map(([St, from]) => {
      const qa = Math.ceil(ni / St), qb = Math.ceil(nj / St), idx = new (V > 65535 ? Uint32Array : Uint16Array)(qa * qb * 6 + 2 * (qa + qb) * 12);
      let o = 0;
      const Vx = (a, b) => Math.min(b, nj) * w + Math.min(a, ni);
      for (let b = 0; b < nj; b += St) for (let a = 0; a < ni; a += St) {
        const p00 = Vx(a, b), p10 = Vx(a + St, b), p01 = Vx(a, b + St), p11 = Vx(a + St, b + St);
        idx[o++] = p00; idx[o++] = p01; idx[o++] = p10; idx[o++] = p01; idx[o++] = p11; idx[o++] = p10;
      }
      const side = list => { for (let q = 0; q + 1 < list.length; q++) { const u = list[q], v = list[q + 1], su = skirt.get(u), sv = skirt.get(v); idx.set([u, su, v, v, su, sv, u, v, su, v, sv, su], o); o += 12; } };
      const run = (f, len) => { const L = []; for (let t = 0; t < len; t += St) L.push(f(t)); L.push(f(len)); return L; };
      side(run(t => Vx(t, 0), ni)); side(run(t => Vx(t, nj), ni)); side(run(t => Vx(0, t), nj)); side(run(t => Vx(ni, t), nj));
      const lg = St === 1 ? g : new THREE.BufferGeometry();
      if (St !== 1) { for (const key of Object.keys(g.attributes)) lg.setAttribute(key, g.attributes[key]); lg.boundingSphere = g.boundingSphere.clone(); }
      lg.setIndex(new THREE.BufferAttribute(idx.subarray(0, o), 1));
      const mesh = new THREE.Mesh(lg, landMat); mesh.receiveShadow = true; mesh.userData.keep = true; mesh.visible = St === 1;
      group.add(mesh);
      return { mesh, from };
    });
    landLod.push({ lods, x: g.boundingSphere.center.x, z: g.boundingSphere.center.z, r: g.boundingSphere.radius });
  }

  /* ---------- фон за сеткой ---------- */
  // площадные объекты прямоугольника данных — мелкой картинкой (5 м/пикс), цвет вершин фона берётся из неё
  const DR = SITGES_GEO.data, lu = document.createElement('canvas'), LP = 0.2;
  lu.width = Math.ceil((DR[1] - DR[0]) * LP); lu.height = Math.ceil((DR[3] - DR[2]) * LP);
  const lx = lu.getContext('2d', { willReadFrequently: true });
  lx.fillStyle = '#000'; lx.fillRect(0, 0, lu.width, lu.height);
  sitgesPaint(lx, x => (x - DR[0]) * LP, z => (z - DR[2]) * LP, LP, { areas: C.areas.filter(a => a.kind !== 'sea'), rails: [], roads: [] }, { sea: '#000', thin: false });
  const lud = lx.getImageData(0, 0, lu.width, lu.height).data;
  const lc = new THREE.Color(), bed = new THREE.Color(G.seabed).multiplyScalar(0.5);
  const SCRUB = [new THREE.Color(0x8f8c62), new THREE.Color(0x77824f), new THREE.Color(0xa59c84), new THREE.Color(0xc7bfa8)];
  const outerColor = (x, z, h, ny, out) => {
    if (h < 0) return out.copy(bed);
    const px = Math.floor((x - DR[0]) * LP), py = Math.floor((z - DR[2]) * LP);
    if (px >= 0 && py >= 0 && px < lu.width && py < lu.height) {
      const o = (py * lu.width + px) * 4;
      if (lud[o] + lud[o + 1] + lud[o + 2] > 0) return out.setRGB(lud[o] / 255, lud[o + 1] / 255, lud[o + 2] / 255, THREE.SRGBColorSpace);
    }
    // гарига Гаррафа: оливково-серая, пятнами сосны, на крутом и высоком — известняк; у города — светлее (застройка)
    const urban = x > DR[0] && x < DR[1] && z > DR[2] && z < DR[3] ? 1 : 0;
    out.copy(SCRUB[0]).lerp(SCRUB[1], clamp(0.5 + noise(x / 160, z / 160), 0, 1) * 0.8);
    out.lerp(SCRUB[2], smooth01((0.88 - ny) / 0.15) + clamp((h - 220) / 150, 0, 0.5));
    if (urban) out.lerp(SCRUB[3], 0.55);
    return out.multiplyScalar(0.92 + 0.08 * noise(x / 40, z / 40));
  };
  const outerMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  const [FX, FZ0, FZ1] = G.far, TL = G.tile, oh = C.outer;
  let outerTris = 0;
  for (let tz = Math.floor(FZ0 / TL) * TL; tz < FZ1; tz += TL) for (let tx = -Math.ceil(FX / TL) * TL; tx < FX; tx += TL) {
    // расстояние от плитки до сетки
    const dx = Math.max(X0 - (tx + TL), 0, tx - X1), dz = Math.max(Z0 - (tz + TL), 0, tz - Z1), dist = Math.hypot(dx, dz);
    if (dx === 0 && dz === 0 && tx >= X0 && tx + TL <= X1 && tz >= Z0 && tz + TL <= Z1) continue;   // целиком под сеткой
    const st = G.steps.find(s => dist < s[0])[1], n = TL / st, w = n + 1;
    const hs = new Float32Array(w * w);
    let maxH = -Infinity;
    for (let b = 0; b <= n; b++) for (let a = 0; a <= n; a++) { const v = oh(tx + a * st, tz + b * st); hs[b * w + a] = v; if (v > maxH) maxH = v; }
    if (maxH < -4) continue;                                      // глубокое море — под водой не видно
    const pos = [], col = [], idx = [], map = new Int32Array(w * w).fill(-1);
    const vert = (a, b) => {
      const q = b * w + a;
      if (map[q] >= 0) return map[q];
      const x = tx + a * st, z = tz + b * st, h = hs[q];
      const hx = (hs[b * w + Math.min(n, a + 1)] - hs[b * w + Math.max(0, a - 1)]) / ((Math.min(n, a + 1) - Math.max(0, a - 1)) * st);
      const hz = (hs[Math.min(n, b + 1) * w + a] - hs[Math.max(0, b - 1) * w + a]) / ((Math.min(n, b + 1) - Math.max(0, b - 1)) * st);
      outerColor(x, z, h, 1 / Math.hypot(hx, 1, hz), lc);
      pos.push(x, h, z); col.push(lc.r, lc.g, lc.b);
      return map[q] = pos.length / 3 - 1;
    };
    for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) {
      const x = tx + a * st, z = tz + b * st;
      if (x >= X0 && x + st <= X1 && z >= Z0 && z + st <= Z1) continue;   // клетка под сеткой
      const p00 = vert(a, b), p10 = vert(a + 1, b), p01 = vert(a, b + 1), p11 = vert(a + 1, b + 1);
      idx.push(p00, p01, p10, p01, p11, p10);
    }
    if (!idx.length) continue;
    // юбка по краю плитки (соседняя плитка может быть другого шага)
    const skirtV = (a, b) => { const v = vert(a, b); pos.push(pos[v * 3], pos[v * 3 + 1] - 12, pos[v * 3 + 2]); col.push(col[v * 3], col[v * 3 + 1], col[v * 3 + 2]); return [v, pos.length / 3 - 1]; };
    for (const line of [[0, 0, 1, 0], [n, 0, 0, 1], [n, n, -1, 0], [0, n, 0, -1]]) {
      const L = [];
      for (let t = 0; t <= n; t++) L.push(skirtV(line[0] + line[2] * t, line[1] + line[3] * t));
      for (let t = 0; t < n; t++) { const [u, su] = L[t], [v, sv] = L[t + 1]; idx.push(u, su, v, v, su, sv, u, v, su, v, sv, su); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, outerMat); m.userData.keep = true;
    group.add(m); outerTris += idx.length / 3;
  }

  /* ---------- море ---------- */
  // дно далеко от берега (плитки фона там пропущены): плоскость на наибольшей глубине — вода полупрозрачная
  const deep = new THREE.Mesh(new THREE.PlaneGeometry(16000, 16000), new THREE.MeshStandardMaterial({ color: bed, roughness: 1 }));
  deep.rotation.x = -Math.PI / 2; deep.position.y = -SITGES_T.seaMax - 0.2; deep.userData.keep = true; group.add(deep);
  const seaMesh = new THREE.Mesh(new THREE.PlaneGeometry(16000, 16000), waterMaterial(0x2a7bb0));
  seaMesh.rotation.x = -Math.PI / 2; seaMesh.userData.dynamic = true; group.add(seaMesh);

  /* ---------- валуны на волнорезах: по квадратам rockCell м, у каждого свой InstancedMesh ---------- */
  const cells = new Map(), rr2 = mulberry32(13);
  let rockN = 0;
  for (let k = 0; k < H.length; k++) if (thin[k]) for (let q = thin[k] === 1 ? 2 : 1; q > 0; q--) {
    const i = k % NX, j = (k / NX) | 0, x = X0 + (i + rr2() - 0.5) * S, z = Z0 + (j + rr2() - 0.5) * S;
    const key = Math.floor(x / G.rockCell) + ',' + Math.floor(z / G.rockCell);
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push([x, D.ground(x, z), z, (thin[k] === 1 ? 0.75 : 0.5) + rr2() * 0.8, rr2() * 6.3, rr2()]);
    rockN++;
  }
  const rockLod = [], rockGeo = new THREE.IcosahedronGeometry(1, 0), rockMat = new THREE.MeshStandardMaterial({ color: 0x8d8576, roughness: 0.95, flatShading: true });
  const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), eu = new THREE.Euler(), v3 = new THREE.Vector3(), sc = new THREE.Vector3(), cc = new THREE.Color();
  for (const list of cells.values()) {
    const im = new THREE.InstancedMesh(rockGeo, rockMat, list.length);
    list.forEach(([x, y, z, s, a, t], n) => {
      qt.setFromEuler(eu.set(t * 0.6, a, t * 0.4));
      m4.compose(v3.set(x, y - s * 0.35, z), qt, sc.set(s * (1.1 + t * 0.4), s * 0.7, s));
      im.setMatrixAt(n, m4); im.setColorAt(n, cc.setHex(0xffffff).multiplyScalar(0.65 + t * 0.45));
    });
    im.receiveShadow = true; im.userData.keep = true; im.computeBoundingSphere();
    group.add(im);
    rockLod.push({ mesh: im, x: im.boundingSphere.center.x, z: im.boundingSphere.center.z, r: im.boundingSphere.radius });
  }

  /* ---------- понтоны марины ---------- */
  const decks = new Decks(), PG = G.pier, pierMat = new THREE.MeshStandardMaterial({ color: 0xb9ab95, roughness: 0.9 });
  for (const l of C.lines) if (l.kind === 'pier') for (let q = 1; q < l.pts.length; q++) {
    const [ax, az] = l.pts[q - 1], [bx, bz] = l.pts[q];
    // у причала начало — на высоте берега (сходня), в воде — PG.top над морем
    const ya = Math.max(PG.top, D.ground(ax, az) - 0.05), yb = Math.max(PG.top, D.ground(bx, bz) - 0.05);
    const d = decks.slab([ax, ya, az], [bx, yb, bz], PG.w, PG.t);
    const L = Math.hypot(bx - ax, bz - az, yb - ya), mesh = new THREE.Mesh(new THREE.BoxGeometry(PG.w, PG.t, L), pierMat);
    mesh.position.copy(d.center); mesh.quaternion.copy(d.quat); mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
  Object.assign(K, { landLod, rockLod, seaMesh, decks, groundStats: { tex: [cv.width, cv.height], chunks: landLod.length, outerTris, rocks: rockN } });
}
