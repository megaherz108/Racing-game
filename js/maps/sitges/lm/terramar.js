// Ситжес — достопримечательность: отель Террамар (Hotel ME Sitges Terramar) (этап 6, docs/sitges/stage-5.md,
// архив группы — docs/sitges/lm-d.md). Корпус 1934 г. после перестройки: уступы-террасы, у каждого этажа светлый
// пояс (плита и сплошной парапет лоджии) и утопленное тёмное остекление с простенками; к морю — скруглённый торец.
//   Форма — из кадастра: части здания 779 — это кольца по числу этажей (1…8), уступ на этаж. plan() строит контур
//   каждого уровня: растр клеток cell м с наибольшим числом этажей частей под клеткой → замыкание на клетку →
//   обход границы → прямые без ступенек (упрощение до eps м). Высоты уровней — верх стен частей с этим числом этажей.
//   build(): на каждом уровне — остекление (контур, сдвинутый внутрь на recess), простенки через pier м, пояс у верха
//   (плита slab + парапет parapet, наружу на out), пол террасы; у первого этажа — цоколь plinth; на крыше — надстройка.
//   Столкновения — по контурам частей кадастра.
// Определяет: SITGES_LM_TERRAMAR.
// Использует: sitgesArea, sitgesBBox, sitgesInPoly (js/maps/sitges/geom.js); LMK, lmMat, lmInset, lmCollide
//   (js/maps/sitges/landmarks3d.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const SITGES_LM_TERRAMAR = {
  ready: true,
  cfg: {
    cell: 0.3,        // клетка растра уровней, м
    eps: 0.4,         // упрощение контура уровня, м
    minArea: 6,       // кольца уровня меньше — выбросить, м²
    recess: 0.9,      // остекление утоплено от линии фасада, м
    out: 0.25,        // пояс выступает наружу, м
    slab: 0.3,        // плита пояса под уровнем террасы, м
    parapet: 0.75,    // сплошной парапет над террасой, м
    parT: 0.2,        // толщина парапета, м
    pier: 4.4,        // шаг простенков, м
    pierW: 0.4,       // ширина простенка, м
    plinth: 1.6,      // цоколь первого этажа, м
    roofIn: 2.5,      // надстройка на крыше — отступ от края, м
    colors: { band: 0xdcd7cc, glass: 0x3a4650, base: 0xaeaaa1 },
  },

  plan(C, L) {
    const P = this.cfg, parts = L.parts;
    const maxF = Math.max(...parts.map(h => h.p.floors));
    // высоты уровней: Y[0] — низ, Y[s] — верх s-го этажа (по частям с этим числом этажей)
    const Y = [Math.min(...parts.map(h => h.y0))];
    for (let s = 1; s <= maxF; s++) {
      const ys = parts.filter(h => h.p.floors === s && Math.abs(sitgesArea(h.rings[0])) > 40).map(h => h.y1);
      Y[s] = ys.length ? Math.max(...ys) : Y[s - 1] + 3;
    }
    // растр: наибольшее число этажей под клеткой
    const c = P.cell, x0 = L.bb[0] - 2 * c, z0 = L.bb[2] - 2 * c;
    const nx = Math.ceil((L.bb[1] - x0) / c) + 2, nz = Math.ceil((L.bb[3] - z0) / c) + 2, grid = new Uint8Array(nx * nz);
    for (const h of parts) {
      const r = h.rings[0], b = sitgesBBox(r), f = h.p.floors;
      for (let j = Math.floor((b[2] - z0) / c); j <= Math.ceil((b[3] - z0) / c); j++)
        for (let i = Math.floor((b[0] - x0) / c); i <= Math.ceil((b[1] - x0) / c); i++)
          if (grid[j * nx + i] < f && sitgesInPoly(x0 + (i + 0.5) * c, z0 + (j + 0.5) * c, r)) grid[j * nx + i] = f;
    }
    L.levels = [];
    for (let s = 1; s <= maxF; s++) {
      let m = new Uint8Array(nx * nz);
      for (let k = 0; k < m.length; k++) m[k] = grid[k] >= s ? 1 : 0;
      m = this._close(m, nx, nz);
      const rings = this._trace(m, nx, nz).map(r => r.map(([i, j]) => [x0 + i * c, z0 + j * c]))
        .map(r => this._simplify(r, P.eps)).filter(r => r.length >= 3 && sitgesArea(r) > P.minArea);
      L.levels.push({ s, b: Y[s - 1], t: Y[s], rings });
    }
    L.roofTop = Math.max(...parts.map(h => h.top));
  },

  // замыкание: расширить на клетку и сузить обратно (щели кадастра между частями)
  _close(m, nx, nz) {
    const pass = (src, v) => {
      const d = src.slice();
      for (let j = 1; j < nz - 1; j++) for (let i = 1; i < nx - 1; i++) {
        const k = j * nx + i;
        if (src[k] === v) continue;
        if (src[k - 1] === v || src[k + 1] === v || src[k - nx] === v || src[k + nx] === v) d[k] = v;
      }
      return d;
    };
    return pass(pass(m, 1), 0);
  },
  // обход границы занятых клеток: кольца из углов клеток [i, j], занятое — слева (против часовой в осях x, z)
  _trace(m, nx, nz) {
    const at = (i, j) => i >= 0 && j >= 0 && i < nx && j < nz && m[j * nx + i] === 1;
    const out = new Map(), key = (i, j) => i * 100003 + j;
    const add = (a, b) => { const k = key(...a); if (!out.has(k)) out.set(k, []); out.get(k).push(b); };
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      if (!at(i, j)) continue;
      if (!at(i, j - 1)) add([i, j], [i + 1, j]);
      if (!at(i + 1, j)) add([i + 1, j], [i + 1, j + 1]);
      if (!at(i, j + 1)) add([i + 1, j + 1], [i, j + 1]);
      if (!at(i - 1, j)) add([i, j + 1], [i, j]);
    }
    const rings = [];
    for (const [k0, list] of out) {
      while (list.length) {
        const start = [Math.floor(k0 / 100003), k0 % 100003], ring = [start];
        let cur = list.pop();
        for (let guard = 0; guard < 1e6; guard++) {
          if (cur[0] === start[0] && cur[1] === start[1]) break;
          ring.push(cur);
          const nl = out.get(key(...cur));
          if (!nl || !nl.length) break;
          cur = nl.pop();
        }
        // без точек посреди прямых
        const r = ring.filter((p, n) => {
          const a = ring[(n + ring.length - 1) % ring.length], b = ring[(n + 1) % ring.length];
          return (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]) !== 0;
        });
        if (r.length >= 3) rings.push(r);
      }
    }
    return rings;
  },
  // упрощение замкнутого контура (Дуглас — Пекер от двух дальних точек)
  _simplify(r, eps) {
    const n = r.length;
    let a = 0, b = 0, best = -1;
    for (let i = 0; i < n; i++) { const d = (r[i][0] - r[0][0]) ** 2 + (r[i][1] - r[0][1]) ** 2; if (d > best) { best = d; b = i; } }
    best = -1;
    for (let i = 0; i < n; i++) { const d = (r[i][0] - r[b][0]) ** 2 + (r[i][1] - r[b][1]) ** 2; if (d > best) { best = d; a = i; } }
    const keep = new Uint8Array(n); keep[a] = keep[b] = 1;
    const dp = (i, j) => {             // от i до j по кольцу (j > i в развёртке)
      if (j - i < 2) return;
      const p = r[i % n], q = r[j % n], dx = q[0] - p[0], dz = q[1] - p[1], L = Math.hypot(dx, dz) || 1;
      let m = -1, md = 0;
      for (let k = i + 1; k < j; k++) { const s = r[k % n], d = Math.abs((s[0] - p[0]) * dz - (s[1] - p[1]) * dx) / L; if (d > md) { md = d; m = k; } }
      if (md > eps) { keep[m % n] = 1; dp(i, m); dp(m, j); }
    };
    const lo = Math.min(a, b), hi = Math.max(a, b);
    dp(lo, hi); dp(hi, lo + n);
    return r.filter((p, i) => keep[i]);
  },

  build(K, L, group) {
    const P = this.cfg, U = LMK.uv;
    const mBand = lmMat(P.colors.band, { tex: 'plaster', rough: 0.8 });
    const mGlass = lmMat(P.colors.glass, { rough: 0.25, metal: 0.35 });
    const mBase = lmMat(P.colors.base, { tex: 'plaster' });
    // сборка треугольников по материалам (одна геометрия на материал)
    const G = new Map();
    const tri = (m, A, B, Cc, ny) => {
      // ny — нужное направление нормали (вектор); обход — под него
      const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = Cc[0] - A[0], vy = Cc[1] - A[1], vz = Cc[2] - A[2];
      const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
      if (n[0] * ny[0] + n[1] * ny[1] + n[2] * ny[2] < 0) [B, Cc] = [Cc, B];
      let g = G.get(m); if (!g) G.set(m, g = { p: [], uv: [] });
      // развёртка: стены — (вдоль по горизонтали, y), горизонтальные — (x, z)
      const flat = Math.abs(ny[1]) > 0.7, h = Math.hypot(ny[0], ny[2]) || 1, tx = -ny[2] / h, tz = ny[0] / h;
      for (const p of [A, B, Cc]) { g.p.push(...p); g.uv.push(flat ? p[0] / U : (p[0] * tx + p[2] * tz) / U, flat ? p[2] / U : p[1] / U); }
    };
    const quad = (m, A, B, Cc, D, ny) => { tri(m, A, B, Cc, ny); tri(m, A, Cc, D, ny); };
    const sgn = r => sitgesArea(r) > 0 ? 1 : -1;
    // стены кольца от y0 до y1: dir = 1 — наружу, −1 — внутрь
    const walls = (m, r, y0, y1, dir = 1) => {
      const s = sgn(r);
      for (let i = 0; i < r.length; i++) {
        const a = r[i], b = r[(i + 1) % r.length], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
        const n = [dir * s * dz / l, 0, -dir * s * dx / l];
        quad(m, [a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], n);
      }
    };
    // крышка кольца на высоте y (up — нормаль вверх)
    const cap = (m, r, y, up = true) => {
      const t = THREE.ShapeUtils.triangulateShape(r.map(([x, z]) => new THREE.Vector2(x, z)), []);
      for (const [a, b, c] of t) tri(m, [r[a][0], y, r[a][1]], [r[b][0], y, r[b][1]], [r[c][0], y, r[c][1]], [0, up ? 1 : -1, 0]);
    };
    // полоса между кольцами с общими вершинами (lmInset сохраняет порядок)
    const ring2 = (m, ra, rb, y, up = true) => {
      for (let i = 0; i < ra.length; i++) {
        const j = (i + 1) % ra.length;
        quad(m, [ra[i][0], y, ra[i][1]], [ra[j][0], y, ra[j][1]], [rb[j][0], y, rb[j][1]], [rb[i][0], y, rb[i][1]], [0, up ? 1 : -1, 0]);
      }
    };
    // простенки вдоль рёбер кольца: от линии фасада внутрь до остекления
    const piers = (m, r, y0, y1) => {
      const s = sgn(r), w = P.pierW / 2;
      for (let i = 0; i < r.length; i++) {
        const a = r[i], b = r[(i + 1) % r.length], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz);
        const n = Math.round(l / P.pier);
        if (n < 2) continue;
        const ux = dx / l, uz = dz / l, ox = s * uz, oz = -s * ux;   // наружу
        for (let k = 1; k < n; k++) {
          const t = l * k / n, cx = a[0] + ux * t, cz = a[1] + uz * t, d = P.recess;
          const p = (u, v, y) => [cx + ux * u + ox * v, y, cz + uz * u + oz * v];
          quad(m, p(-w, 0, y0), p(w, 0, y0), p(w, 0, y1), p(-w, 0, y1), [ox, 0, oz]);
          quad(m, p(w, 0, y0), p(w, -d, y0), p(w, -d, y1), p(w, 0, y1), [ux, 0, uz]);
          quad(m, p(-w, -d, y0), p(-w, 0, y0), p(-w, 0, y1), p(-w, -d, y1), [-ux, 0, -uz]);
        }
      }
    };

    const top = L.levels[L.levels.length - 1];
    for (const lev of L.levels) {
      for (const R of lev.rings) {
        const Rin = lmInset(R, P.recess), Rout = lmInset(R, -P.out), Rpar = lmInset(R, -P.out + P.parT);
        const gb = lev.s === 1 ? lev.b - 0.5 : lev.b, gt = lev.t - P.slab;
        let g0 = gb;
        if (lev.s === 1) {
          // цоколь заподлицо с фасадом и полка над ним
          walls(mBase, R, gb, gb + 0.5 + P.plinth);
          ring2(mBase, R, Rin, gb + 0.5 + P.plinth);
          g0 = gb + 0.5 + P.plinth;
        }
        walls(mGlass, Rin, g0, gt);
        piers(mBand, R, g0, gt);
        // пояс: плита (низ и торец) и парапет (наружная и внутренняя стороны, верх), пол террасы
        cap(mBand, Rout, gt, false);
        walls(mBand, Rout, gt, lev.t + P.parapet);
        walls(mBand, Rpar, lev.t, lev.t + P.parapet, -1);
        ring2(mBand, Rout, Rpar, lev.t + P.parapet);
        cap(mBand, Rpar, lev.t);
        // надстройка на крыше (машинное отделение, выход на крышу)
        if (lev === top && L.roofTop > lev.t + 0.4) {
          const Rr = lmInset(R, P.roofIn);
          walls(mBand, Rr, lev.t, L.roofTop + 0.6);
          cap(mBand, Rr, L.roofTop + 0.6);
        }
      }
    }
    for (const [m, g] of G) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(g.p, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, m);
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
    }
    // столкновения — по частям кадастра
    for (const h of L.parts) lmCollide(K, h.rings[0], h.y0, h.y1);
  },
};
