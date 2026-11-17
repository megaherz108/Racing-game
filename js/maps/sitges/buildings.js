// Ситжес — ПОСТРОЙКА: здания — призмы по контурам частей кадастра высотой по этажности (sitgesHeight()).
// Без крыш и фасадов — стены и плоская крыша одним цветом на часть; дворы-дыры — внутренние стены. На рельефе стены
// уходят в землю под самой низкой точкой контура.
// Геометрия склеена по квадратам SITGES_BCHUNK м (отсечение по пирамиде видимости), цвет — в вершинах.
// В сетку коллизий каждая часть идёт многоугольником (StaticGrid.addPoly → призма Rapier, js/physics.js).
// Определяет: SITGES_BCHUNK, SITGES_BCOLORS, sitgesBuildBuildings.
// Использует: stdMat (js/world.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const SITGES_BCHUNK = 256;
// цвета по назначению (кадастр): стены; крыша — темнее
const SITGES_BCOLORS = {
  '1_residential': [0xefe7d8, 0xe9dcc4, 0xf3eee4, 0xe4d2b4, 0xdccdb6], '2_agriculture': [0xd8c8a8], '3_industrial': [0xc4c0b6, 0xb8b6ae],
  '4_1_office': [0xd6d8da], '4_2_retail': [0xe6e0d6, 0xdcd6cc], '4_3_publicServices': [0xe8d8b8, 0xdcc8a4],
};

function sitgesBuildBuildings(K) {
  const { D, group, grid } = K;
  const chunks = new Map(), col = new THREE.Color(), roofC = new THREE.Color();
  const chunkOf = (x, z) => {
    const key = Math.floor(x / SITGES_BCHUNK) + ',' + Math.floor(z / SITGES_BCHUNK);
    let c = chunks.get(key);
    if (!c) chunks.set(key, c = { pos: [], col: [] });
    return c;
  };
  let parts = 0, tris = 0;
  D.blds.forEach((b, bi) => {
    const pal = SITGES_BCOLORS[b.use] || SITGES_BCOLORS['1_residential'];
    for (const p of b.parts) {
      // на рельефе: низ стен — под самой низкой точкой контура, крыша — над серединой между низкой и высокой
      // (на склоне дом со стороны горы ниже), но не ниже 2,6 м над самой высокой
      const outer = p.rings[0], gs = outer.map(([x, z]) => D.ground(x, z)), g0 = Math.min(...gs), g1 = Math.max(...gs);
      const y0 = g0 - 0.5, h = Math.max((g0 + g1) / 2 + p.h, g1 + 2.6);
      // цвет: по зданию из палитры назначения, части чуть различаются
      col.setHex(pal[(bi * 7 + 3) % pal.length]).offsetHSL(0, 0, ((bi * 13 + p.floors * 5) % 7 - 3) * 0.008);
      roofC.copy(col).multiplyScalar(0.82);
      const c = chunkOf(outer[0][0], outer[0][1]), P = c.pos, Cc = c.col;
      const push = (x, y, z, cc) => { P.push(x, y, z); Cc.push(cc.r, cc.g, cc.b); };
      // стены: внешнее кольцо против часовой (в осях x, z), дыры — по часовой → нормаль наружу от толщи здания
      for (const r of p.rings) for (let i = 0; i < r.length; i++) {
        const [ax, az] = r[i], [bx, bz] = r[(i + 1) % r.length];
        push(ax, y0, az, col); push(bx, h, bz, col); push(bx, y0, bz, col);
        push(ax, y0, az, col); push(ax, h, az, col); push(bx, h, bz, col);
        tris += 2;
      }
      // крыша
      const contour = outer.map(([x, z]) => new THREE.Vector2(x, z)), holes = p.rings.slice(1).map(r => r.map(([x, z]) => new THREE.Vector2(x, z)));
      const all = [outer, ...p.rings.slice(1)].flat();
      for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(contour, holes)) {
        const a = all[i], bb = all[j], cc = all[k];
        // нормаль (b − a) × (c − a) смотрит вверх, если (bx − ax)(cz − az) − (bz − az)(cx − ax) < 0; иначе b и c местами
        const flip = (bb[0] - a[0]) * (cc[1] - a[1]) - (bb[1] - a[1]) * (cc[0] - a[0]) > 0;
        push(a[0], h, a[1], roofC);
        if (flip) { push(cc[0], h, cc[1], roofC); push(bb[0], h, bb[1], roofC); } else { push(bb[0], h, bb[1], roofC); push(cc[0], h, cc[1], roofC); }
        tris++;
      }
      // коллайдер (js/physics.js): от y0 до y1 — те же высоты, что у меша
      Object.assign(grid.addPoly(outer, p.h), { y0: g0 - 1.5, y1: h });
      parts++;
    }
  });
  const mat = stdMat(0xffffff, { vertexColors: true, roughness: 0.9 });
  for (const c of chunks.values()) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(c.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(c.col, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, mat);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.keep = true;                     // уже склеено по квадратам — optimizeStatic() не трогает
    group.add(mesh);
  }
  Object.assign(K, { bldStats: { parts, tris, chunks: chunks.size } });
}
