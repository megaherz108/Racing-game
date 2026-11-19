// Ситжес — ПОСТРОЙКА: геометрия крыш по h.roof (раскладка — js/maps/sitges/roofs.js). Пишет в те же массивы куска,
// что и стены (js/maps/sitges/buildings.js): материал один — шейдер фасада различает вид по aFac.w (SITGES_WALL):
//   roof (4) — плоская крыша (цвет из ортофото); tile (5) — черепица: aFac.x — вдоль карниза, aFac.z — вниз по скату, м
//   (ряды черепицы рисует шейдер, js/maps/sitges/facade.js); щипцы и парапеты — глухая стена (blind).
// Скаты — с торцами толщиной SITGES_RT.thick по краям (карниз, фронтон); низа у свеса нет (экономия треугольников).
// Свес — SITGES_RT.eave, у частей с общими стенами — SITGES_RT.eaveShared (не залезать на соседа).
// Определяет: SITGES_RT, sitgesBuildRoof.
// Использует: sitgesInset (js/maps/sitges/roofs.js); SITGES_WALL (js/maps/sitges/houses.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const SITGES_RT = { eave: 0.5, eaveShared: 0.12, thick: 0.14 };

// put — { vert(x, y, z, nx, ny, nz, color, ax, ay, az, kind) → индекс, idx: [] }; wall — цвет стен части
function sitgesBuildRoof(h, put, wall) {
  const R = h.roof, W = SITGES_WALL, T = SITGES_RT, { vert, idx } = put;
  let tris = 0;
  // многоугольник (выпуклый, точки по порядку) с плоской нормалью; want — куда должна смотреть нормаль
  // uv(p) → [вдоль карниза, вниз по скату] для черепицы
  const poly = (pts, want, col, kind, uv) => {
    const [a, b, c] = pts;
    let nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
    let ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    let nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const L = Math.hypot(nx, ny, nz) || 1;
    nx /= L; ny /= L; nz /= L;
    const flip = nx * want[0] + ny * want[1] + nz * want[2] < 0;
    if (flip) { nx = -nx; ny = -ny; nz = -nz; }
    const first = vert(...pts[0], nx, ny, nz, col, ...(uv ? uv(pts[0]) : [0, 0]), kind);
    for (let i = 1; i < pts.length; i++) vert(...pts[i], nx, ny, nz, col, ...(uv ? uv(pts[i]) : [0, 0]), kind);
    for (let i = 1; i + 1 < pts.length; i++) {
      if (flip) idx.push(first, first + i + 1, first + i); else idx.push(first, first + i, first + i + 1);
      tris++;
    }
  };
  // скат: верх и торцы толщиной thick по краевым рёбрам edges (номера рёбер i → i + 1); низа нет — свес узкий,
  // снизу его почти не видно, а треугольников вдвое меньше. ex, ez — направление карниза ската; по нему и
  // уклону — координаты черепицы
  const slab = (pts, edges, ex, ez, s) => {
    const k = Math.sqrt(1 + s * s);
    const uv = p => [p[0] * ex + p[2] * ez, -p[1] * k / Math.max(s, 0.05)];
    poly(pts, [0, 1, 0], R.col, W.tile, uv);
    const low = pts.map(p => [p[0], p[1] - T.thick, p[2]]);
    for (const i of edges) {
      const j = (i + 1) % pts.length, p = pts[i], q = pts[j];
      // торец смотрит наружу от середины ската
      const mx = pts.reduce((s2, v) => s2 + v[0], 0) / pts.length, mz = pts.reduce((s2, v) => s2 + v[2], 0) / pts.length;
      const ox = (p[0] + q[0]) / 2 - mx, oz = (p[2] + q[2]) / 2 - mz;
      poly([p, q, low[j], low[i]], [ox, 0, oz], R.col, W.roof, null);
    }
  };

  if (R.kind === 'flat') {
    // настил ниже верха стены, изнутри — грань парапета (по всем кольцам); у маленьких частей настила ниже нет
    if (R.deck < h.y1) for (const r of h.rings) for (let i = 0; i < r.length; i++) {
      const [ax, az] = r[i], [bx, bz] = r[(i + 1) % r.length], L = Math.hypot(bx - ax, bz - az);
      if (L < 0.05 || h.y1 - R.deck < 0.05) continue;
      // нормаль внутрь кольца: внешнее — против часовой, дыры — по часовой; внутрь = влево по ходу у обоих
      const nx = -(bz - az) / L, nz = (bx - ax) / L;
      poly([[ax, R.deck, az], [bx, R.deck, bz], [bx, h.y1, bz], [ax, h.y1, az]], [nx, 0, nz], wall, W.blind, null);
    }
    if (R.hut) {
      const { x, z, ang, a, b, y0, y1 } = R.hut, c = Math.cos(ang), s = Math.sin(ang);
      const P = (u, v, y) => [x + u * c - v * s, y, z + u * s + v * c];
      const cs = [[-a, -b], [a, -b], [a, b], [-a, b]];
      for (let i = 0; i < 4; i++) {
        const [u0, v0] = cs[i], [u1, v1] = cs[(i + 1) % 4], ou = (u0 + u1) / 2, ov = (v0 + v1) / 2;
        poly([P(u0, v0, y0), P(u1, v1, y0), P(u1, v1, y1), P(u0, v0, y1)], [ou * c - ov * s, 0, ou * s + ov * c], wall, W.blind, null);
      }
      poly(cs.map(([u, v]) => P(u, v, y1)), [0, 1, 0], R.col, W.roof, null);
    }
    return tris;
  }

  const o = h.shared ? T.eaveShared : T.eave;
  if (R.kind === 'inset') {
    // полоса скатов от свеса до внутреннего контура, сверху — площадка
    const r = h.rings[0], E = o > 0 && sitgesInset(r, -o) || r, oe = E === r ? 0 : o;
    const yE = R.eave - oe * R.s, yI = R.ridge, I = R.ring;
    for (let i = 0; i < r.length; i++) {
      const j = (i + 1) % r.length, L = Math.hypot(r[j][0] - r[i][0], r[j][1] - r[i][1]) || 1;
      slab([[E[i][0], yE, E[i][1]], [E[j][0], yE, E[j][1]], [I[j][0], yI, I[j][1]], [I[i][0], yI, I[i][1]]], [0],
        (r[j][0] - r[i][0]) / L, (r[j][1] - r[i][1]) / L, R.s);
    }
    const tri = THREE.ShapeUtils.triangulateShape(I.map(([x, z]) => new THREE.Vector2(x, z)), []);
    const first = vert(I[0][0], yI, I[0][1], 0, 1, 0, R.col, 0, 0, W.roof);
    for (let i = 1; i < I.length; i++) vert(I[i][0], yI, I[i][1], 0, 1, 0, R.col, 0, 0, W.roof);
    for (const [i, j, k] of tri) {
      const a = I[i], b = I[j], c = I[k], up = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) < 0;
      if (up) idx.push(first + i, first + j, first + k); else idx.push(first + i, first + k, first + j);
      tris++;
    }
    return tris;
  }

  // по рамке: u — вдоль конька, v — поперёк
  const { cx, cz, ux, uz, a, b, s } = R, vx = -uz, vz = ux;
  const P = (u, v, y) => [cx + u * ux + v * vx, y, cz + u * uz + v * vz];
  const A = a + o, B = b + o, yE = R.eave - o * s;
  if (R.kind === 'gable') {
    const yR = R.ridge;
    // скаты: 0–1 карниз, 1–2 и 3–0 фронтон (края), 2–3 конёк
    slab([P(-A, -B, yE), P(A, -B, yE), P(A, 0, yR), P(-A, 0, yR)], [0, 1, 3], ux, uz, s);
    slab([P(A, B, yE), P(-A, B, yE), P(-A, 0, yR), P(A, 0, yR)], [0, 1, 3], -ux, -uz, s);
    // щипцы — по стенам (u = ±a)
    for (const sg of [-1, 1]) poly([P(sg * a, -b, R.eave), P(sg * a, b, R.eave), P(sg * a, 0, yR - 0.02)], [sg * ux, 0, sg * uz], wall, W.blind, null);
  } else if (R.kind === 'hip') {
    const r = Math.max(0, A - B), yR = R.ridge;
    slab([P(-A, -B, yE), P(A, -B, yE), P(r, 0, yR), P(-r, 0, yR)], [0], ux, uz, s);
    slab([P(A, B, yE), P(-A, B, yE), P(-r, 0, yR), P(r, 0, yR)], [0], -ux, -uz, s);
    slab([P(A, -B, yE), P(A, B, yE), P(r, 0, yR)], [0], vx, vz, s);
    slab([P(-A, B, yE), P(-A, -B, yE), P(-r, 0, yR)], [0], -vx, -vz, s);
  } else {
    // односкатная: вниз к −v; высокая стена по v = +b, боковые треугольники
    const yH = R.eave + (2 * b + o) * s, top = R.eave + 2 * b * s;
    slab([P(-A, -B, yE), P(A, -B, yE), P(A, B, yH), P(-A, B, yH)], [0, 1, 2, 3], ux, uz, s);
    poly([P(-a, b, R.eave), P(a, b, R.eave), P(a, b, top), P(-a, b, top)], [vx, 0, vz], wall, W.blind, null);
    for (const sg of [-1, 1]) poly([P(sg * a, -b, R.eave), P(sg * a, b, R.eave), P(sg * a, b, top)], [sg * ux, 0, sg * uz], wall, W.blind, null);
  }
  return tris;
}
