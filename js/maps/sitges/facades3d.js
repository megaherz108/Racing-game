// Ситжес — ПОСТРОЙКА: балконы и карнизы геометрией (этап 4.4). После заборов (fences3d.js), до мешей улиц
//   (sitgesBuildRoadMeshes): геометрия идёт в копилку улиц K.rk (quad, склейка по квадратам SITGES_FAC3D.chunk м
//   со скрытием дальше far — как заборы, world.cullView).
//   Раскладка — C.balconies и C.cornices (sitgesPlanFacades, js/maps/sitges/styles.js): балконы стоят на тех осях,
//   где шейдер фасада рисует дверь (sitgesBalcony).
//   Балкон: плита (ящик без задней грани) и ограждение — решётка (текстура с альфой, обе стороны) или сплошное
//   (цвет стен). Карниз — брус по верху стены под парапетом. Столкновений нет: всё выше машин.
//   Тень отбрасывают плиты и карнизы (материал facade-slab в rk.casts → теневые копии), решётка — нет (alphaTest).
// Определяет: SITGES_FAC3D, sitgesBalconyTexture, sitgesBuildFacades.
// Использует: MAT (js/core.js); canvasTex (js/maps/city/textures.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const SITGES_FAC3D = {
  rail: 1.0,        // высота ограждения над плитой, м
  bay: 1.0,         // шаг рисунка решётки (текстура), м
  // квадраты chunk м; дальше far м от камеры не рисуются (плиты видны дальше решёток)
  chunk: 160, far: { slab: 260, rail: 150 },
  soffit: [0.92, 0.39], // нормаль низа плиты и карниза: (наружу, вниз)
};

function sitgesBalconyTexture() {
  // решётка 1 × 1 м: поручень сверху, низ, прутья через 10 см (белые — цвет даёт вершина), прозрачность — alphaTest
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff';
  for (let u = 5; u < 128; u += 12.8) x.fillRect(u, 0, 3, 128);
  x.fillRect(0, 0, 128, 9); x.fillRect(0, 118, 128, 6); x.fillRect(0, 98, 128, 3);
  x.fillStyle = '#d8d8d8'; x.fillRect(0, 9, 128, 2);
  const t = canvasTex(c); t.generateMipmaps = true;
  return t;
}

function sitgesBuildFacades(K) {
  const { D, rk } = K, C = D.C, P = SITGES_FAC3D, t0 = performance.now();
  const { MAT, quad, lod, casts } = rk;
  lod['facade-slab'] = [P.chunk, P.far.slab]; lod['facade-rail'] = [P.chunk, P.far.rail];
  casts.add('facade-slab'); rk.apart.add('facade-slab'); rk.apart.add('facade-rail');
  MAT['facade-slab'] = new THREE.MeshStandardMaterial({ name: 'facade-slab', roughness: 0.88, vertexColors: true, side: THREE.DoubleSide });
  MAT['facade-rail'] = new THREE.MeshStandardMaterial({ name: 'facade-rail', map: sitgesBalconyTexture(), alphaTest: 0.5,
    side: THREE.DoubleSide, roughness: 0.55, metalness: 0.35, vertexColors: true });
  const UP = [0, 1, 0], col = new THREE.Color();
  const shade = (hex, k) => col.setHex(hex).multiplyScalar(k).getHex();
  let tris = 0;
  // брус вдоль стены от a до b: вынос d, низ y0, верх y1; грани — перед, низ, верх, торцы (задней нет — стена)
  const bar = (mat, o, d, y0, y1, c, cBot) => {
    const { ax, az, bx, bz, nx, nz } = o, L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L;
    const fx = nx * d, fz = nz * d;
    quad(mat, [[ax + fx, y0, az + fz], [bx + fx, y0, bz + fz], [bx + fx, y1, bz + fz], [ax + fx, y1, az + fz]], [nx, 0, nz], c);
    // низ: нормаль наклонена к улице — свет окружения снизу почти чёрный, а на деле низ балкона освещён отражённым
    // от мостовой и стен напротив
    quad(mat, [[ax, y0, az], [bx, y0, bz], [bx + fx, y0, bz + fz], [ax + fx, y0, az + fz]], [nx * P.soffit[0], -P.soffit[1], nz * P.soffit[0]], cBot);
    quad(mat, [[ax, y1, az], [bx, y1, bz], [bx + fx, y1, bz + fz], [ax + fx, y1, az + fz]], UP, c);
    quad(mat, [[ax, y0, az], [ax + fx, y0, az + fz], [ax + fx, y1, az + fz], [ax, y1, az]], [-ux, 0, -uz], c);
    quad(mat, [[bx, y0, bz], [bx + fx, y0, bz + fz], [bx + fx, y1, bz + fz], [bx, y1, bz]], [ux, 0, uz], c);
    tris += 10;
  };
  // ограждение: перед и две боковины от стены до переда, высота P.rail над плитой
  const fence = (mat, o, d, y, c) => {
    const { ax, az, bx, bz, nx, nz } = o, L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L;
    const e = d - 0.03, fx = nx * e, fz = nz * e, y1 = y + P.rail, uL = L / P.bay, uD = e / P.bay;
    quad(mat, [[ax + fx, y, az + fz], [bx + fx, y, bz + fz], [bx + fx, y1, bz + fz], [ax + fx, y1, az + fz]], [nx, 0, nz], c,
      [[0, 0], [uL, 0], [uL, 1], [0, 1]]);
    quad(mat, [[ax, y, az], [ax + fx, y, az + fz], [ax + fx, y1, az + fz], [ax, y1, az]], [-ux, 0, -uz], c, [[0, 0], [uD, 0], [uD, 1], [0, 1]]);
    quad(mat, [[bx, y, bz], [bx + fx, y, bz + fz], [bx + fx, y1, bz + fz], [bx, y1, bz]], [ux, 0, uz], c, [[0, 0], [uD, 0], [uD, 1], [0, 1]]);
    tris += 6;
  };
  for (const o of C.balconies) {
    bar('facade-slab', o, o.d, o.y - o.t, o.y, o.wall, shade(o.wall, 0.8));
    fence(o.solid ? 'facade-slab' : 'facade-rail', o, o.d, o.y, o.rail);
  }
  for (const o of C.cornices) bar('facade-slab', o, o.d, o.y - o.h, o.y, o.wall, shade(o.wall, 0.75));
  Object.assign(K, { facStats: { ...C.facStats, tris, ms: Math.round(performance.now() - t0) } });
}
