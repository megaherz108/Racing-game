// Ситжес — ПОСТРОЙКА: здания по раскладке C.houses (js/maps/sitges/houses.js): куски стен (общие с соседом стены
// не рисуются — только то, что выше соседа), плоская крыша с дворами-дырами, потолок проезда под домом.
// Цвет — в вершинах (по назначению из кадастра), окна и витрины — шейдер фасада по атрибуту aFac
// (js/maps/sitges/facade.js). Геометрия склеена по квадратам SITGES_BCHUNK м (отсечение по пирамиде видимости).
// В сетку коллизий каждая часть идёт многоугольником (StaticGrid.addPoly → призма Rapier, js/physics.js) с теми же
// высотами низа и крыши; у проезда низ — потолок проезда.
// Определяет: SITGES_BCHUNK, SITGES_BCOLORS, sitgesBuildBuildings.
// Использует: SITGES_WALL (js/maps/sitges/houses.js); sitgesFacadeMat (js/maps/sitges/facade.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const SITGES_BCHUNK = 256;
// цвета по назначению (кадастр): стены; крыша — темнее
const SITGES_BCOLORS = {
  '1_residential': [0xefe7d8, 0xe9dcc4, 0xf3eee4, 0xe4d2b4, 0xdccdb6], '2_agriculture': [0xd8c8a8], '3_industrial': [0xc4c0b6, 0xb8b6ae],
  '4_1_office': [0xd6d8da], '4_2_retail': [0xe6e0d6, 0xdcd6cc], '4_3_publicServices': [0xe8d8b8, 0xdcc8a4],
};

function sitgesBuildBuildings(K) {
  const { D, group, grid } = K, W = SITGES_WALL;
  const chunks = new Map(), col = new THREE.Color(), roofC = new THREE.Color(), under = new THREE.Color();
  const chunkOf = (x, z) => {
    const key = Math.floor(x / SITGES_BCHUNK) + ',' + Math.floor(z / SITGES_BCHUNK);
    let c = chunks.get(key);
    if (!c) chunks.set(key, c = { pos: [], nrm: [], col: [], fac: [], idx: [] });
    return c;
  };
  let tris = 0;
  for (const h of D.C.houses) {
    const { b, p, bi } = h, pal = SITGES_BCOLORS[b.use] || SITGES_BCOLORS['1_residential'];
    // цвет: по зданию из палитры назначения, части чуть различаются
    col.setHex(pal[(bi * 7 + 3) % pal.length]).offsetHSL(0, 0, ((bi * 13 + p.floors * 5) % 7 - 3) * 0.008);
    roofC.copy(col).multiplyScalar(0.82);
    under.copy(col).multiplyScalar(0.55);
    const outer = h.rings[0], c = chunkOf(outer[0][0], outer[0][1]), { pos, nrm, col: cc, fac, idx } = c;
    const vert = (x, y, z, nx, ny, nz, cl, u, g, kind) => {
      pos.push(x, y, z); nrm.push(nx, ny, nz); cc.push(cl.r, cl.g, cl.b); fac.push(u, h.base, g, kind);
      return pos.length / 3 - 1;
    };
    // стены: четырёхугольник на кусок, нормаль наружу
    for (const w of h.walls) {
      const i0 = vert(w.ax, w.lo, w.az, w.nx, 0, w.nz, col, w.ua, w.ga, w.kind), i1 = vert(w.bx, w.lo, w.bz, w.nx, 0, w.nz, col, w.ub, w.gb, w.kind);
      const i2 = vert(w.bx, w.hi, w.bz, w.nx, 0, w.nz, col, w.ub, w.gb, w.kind), i3 = vert(w.ax, w.hi, w.az, w.nx, 0, w.nz, col, w.ua, w.ga, w.kind);
      // обход против часовой, если смотреть снаружи: (b − a) × (верх − a) должно смотреть по нормали
      if ((w.bz - w.az) * w.nx - (w.bx - w.ax) * w.nz < 0) idx.push(i0, i1, i2, i0, i2, i3); else idx.push(i0, i2, i1, i0, i3, i2);
      tris += 2;
    }
    // крыша и потолок проезда: треугольники контура с дырами
    const contour = outer.map(([x, z]) => new THREE.Vector2(x, z)), holes = h.rings.slice(1).map(r => r.map(([x, z]) => new THREE.Vector2(x, z)));
    const all = h.rings.flat(), tri = THREE.ShapeUtils.triangulateShape(contour, holes);
    const cap = (y, ny, cl) => {
      const first = pos.length / 3;
      for (const [x, z] of all) vert(x, y, z, 0, ny, 0, cl, 0, h.base, W.roof);
      for (const [i, j, k] of tri) {
        const a = all[i], bb = all[j], q = all[k];
        // нормаль (b − a) × (c − a) смотрит вверх, если (bx − ax)(cz − az) − (bz − az)(cx − ax) < 0
        const up = (bb[0] - a[0]) * (q[1] - a[1]) - (bb[1] - a[1]) * (q[0] - a[0]) < 0;
        if (up === ny > 0) idx.push(first + i, first + j, first + k); else idx.push(first + i, first + k, first + j);
      }
      tris += tri.length;
    };
    cap(h.y1, 1, roofC);
    if (h.pass) cap(h.y0, -1, under);
    // коллайдер (js/physics.js): от y0 до y1 — те же высоты, что у меша
    Object.assign(grid.addPoly(outer, p.h), { y0: h.pass ? h.y0 : h.y0 - 1, y1: h.y1 });
  }
  const mat = sitgesFacadeMat();
  for (const c of chunks.values()) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(c.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(c.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(c.col, 3));
    g.setAttribute('aFac', new THREE.Float32BufferAttribute(c.fac, 4));
    g.setIndex(c.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(c.idx, 1) : new THREE.Uint16BufferAttribute(c.idx, 1));
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, mat);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.keep = true;                     // уже склеено по квадратам — optimizeStatic() не трогает
    group.add(mesh);
  }
  Object.assign(K, { bldStats: { parts: D.C.houses.length, tris, chunks: chunks.size, ...D.C.houseStats } });
}
