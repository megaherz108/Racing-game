// Ситжес — РАСКЛАДКА: рельеф игровой сетки, море, берег, пляжи, волнорезы. Рельеф ICGC (10 м) сглаженно
// (Catmull-Rom) пересчитан на сетку SITGES_T.step м, накрывающую игровой прямоугольник с запасом; на неё наложены:
//   море — полигон sea из OSM (берег, замкнутый по низу прямоугольника данных; островки — дыры), дно уходит вглубь
//     по расстоянию от берега (depth()), у пляжей — мелководье, где машина бредёт, а не тонет;
//   берег — суша не ниже уровня моря и с небольшим подъёмом от кромки воды;
//   волнорезы — их в OSM нет отдельными объектами: береговая линия обходит их выступами. Находим узкие выступы суши
//     в море (морфологическое «раскрытие» маски суши кругом радиуса groyneR) и поднимаем каменной грядой;
//   пляжи — маска по полигонам beach / sand (цвет, покрытие под колёсами); полоса не-пляжа между двумя пляжами —
//     корень волнореза (thin = 2): невысокий каменный вал поперёк пляжа.
// За сеткой — фон outer(x, z): рельеф ICGC на 10 м (море — по «нет данных» и полигону sea, дно — по расстоянию от
// берега), за краем рельефа — продолжение края с подъёмом в холмы.
// Определяет: SITGES_T, sitgesDepth, sitgesRaster, sitgesChamfer, sitgesPlanTerrain.
// Использует: clamp (js/core.js); makeNoise, mulberry32, smooth01 (js/world.js); stPromTerrain
//   (js/maps/sitges/st/promenade.js); stSlopeTerrain (js/maps/sitges/st/slopes.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const SITGES_T = {
  step: 2.5,        // шаг игровой сетки высот, м (рельеф ICGC — 10 м, делится нацело)
  pad: 60,          // запас сетки за игровым прямоугольником, м (края выравниваются на align)
  align: 40,
  groyneR: 12,      // выступ суши уже 2·R, уходящий в море, — волнорез
  groyneMin: 16,    // меньше стольких клеток — не волнорез (срезанный угол берега)
  groyneTop: 1.9,   // высота гряды над водой, м
  shore0: 0.03,     // суша на линии берега, м над водой; дальше — подъём shoreRise м на м (до shoreMax)
  shoreRise: 0.03,
  shoreMax: 0.5,
  exact: 12,        // ближе стольких метров к берегу расстояние до него точное (по рёбрам полигона моря)
  seaMax: 14,       // глубина моря, м, дальше не растёт
  rise: [0.02, 0.09, 0.12],   // фон за краем рельефа: подъём суши, м на м, — на запад, север, восток
};
// глубина моря на расстоянии d м от берега: мелководье ≈ 12 м (там машина бредёт), дальше — круче
const sitgesDepth = d => Math.min(SITGES_T.seaMax, 0.03 + 0.022 * d + 0.0005 * d * d);

// маска «внутри многоугольников» (чёт-нечет по всем кольцам) на сетке: узел (i, j) — точка (x0 + i·s, z0 + j·s)
function sitgesRaster(rings, x0, z0, s, nx, nz, out = new Uint8Array(nx * nz), val = 1) {
  const xs = [];
  for (let j = 0; j < nz; j++) {
    const z = z0 + j * s;
    xs.length = 0;
    for (const r of rings) for (let a = 0, b = r.length - 1; a < r.length; b = a++) {
      const [ax, az] = r[a], [bx, bz] = r[b];
      if ((az > z) !== (bz > z)) xs.push(ax + (z - az) / (bz - az) * (bx - ax));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil((xs[k] - x0) / s)), i1 = Math.min(nx - 1, Math.floor((xs[k + 1] - x0) / s));
      for (let i = i0; i <= i1; i++) out[j * nx + i] = val;
    }
  }
  return out;
}
// расстояние до ближайшего узла-источника (D = 0 в источниках, Infinity в остальных), фаска 8 соседей, 2 прохода
function sitgesChamfer(D, nx, nz, s) {
  const a = s, b = s * Math.SQRT2;
  let v, w;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i; v = D[k];
    if (i > 0 && (w = D[k - 1] + a) < v) v = w;
    if (j > 0) {
      if ((w = D[k - nx] + a) < v) v = w;
      if (i > 0 && (w = D[k - nx - 1] + b) < v) v = w;
      if (i < nx - 1 && (w = D[k - nx + 1] + b) < v) v = w;
    }
    D[k] = v;
  }
  for (let j = nz - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) {
    const k = j * nx + i; v = D[k];
    if (i < nx - 1 && (w = D[k + 1] + a) < v) v = w;
    if (j < nz - 1) {
      if ((w = D[k + nx] + a) < v) v = w;
      if (i < nx - 1 && (w = D[k + nx + 1] + b) < v) v = w;
      if (i > 0 && (w = D[k + nx - 1] + b) < v) v = w;
    }
    D[k] = v;
  }
  return D;
}

function sitgesPlanTerrain(C) {
  const { rect, areas, coast, dtm } = C, P = SITGES_T, S = P.step;
  /* ---------- море: полигон sea, края прямоугольника данных отодвинуты далеко; островки — дыры ---------- */
  const seaRing = areas.find(a => a.kind === 'sea').ring;
  const sxMin = Math.min(...seaRing.map(p => p[0])), sxMax = Math.max(...seaRing.map(p => p[0])), szMin = Math.min(...seaRing.map(p => p[1]));
  const seaRings = [seaRing.map(([x, z]) => [x <= sxMin + 0.01 ? -1e5 : x >= sxMax - 0.01 ? 1e5 : x, z <= szMin + 0.01 ? -1e5 : z]),
    ...coast.filter(r => r.length > 3 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1])];

  /* ---------- фон: рельеф ICGC на его сетке, море — дно по расстоянию от берега ---------- */
  const { H: TH, nx: TNX, nz: TNZ, x0: TX0, z0: TZ0, step: TS } = dtm;
  const tsea = sitgesRaster(seaRings, TX0, TZ0, TS, TNX, TNZ);
  // за пределами полигона sea (по x) море — где у ICGC «нет данных» (0)
  for (let j = 0; j < TNZ; j++) for (let i = 0; i < TNX; i++) {
    const x = TX0 + i * TS, k = j * TNX + i;
    if (x < sxMin || x > sxMax) tsea[k] = TH[k] <= 0.01 ? 1 : 0;
  }
  const td = new Float32Array(TNX * TNZ);
  for (let k = 0; k < td.length; k++) td[k] = tsea[k] ? Infinity : 0;
  sitgesChamfer(td, TNX, TNZ, TS);
  const TO = new Float32Array(TNX * TNZ);
  for (let k = 0; k < TO.length; k++) TO[k] = tsea[k] ? -sitgesDepth(td[k]) : Math.max(TH[k], 0.3);
  const TXM = TX0 + (TNX - 1) * TS, TZM = TZ0 + (TNZ - 1) * TS;
  const noise = makeNoise(mulberry32(77));
  const bil = (A, nx, nz, x0, z0, s, x, z) => {
    const fx = clamp((x - x0) / s, 0, nx - 1.0001), fz = clamp((z - z0) / s, 0, nz - 1.0001);
    const i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j, k = j * nx + i;
    const a = A[k], b = A[k + 1], c = A[k + nx], d = A[k + nx + 1];
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
  };
  // за краем рельефа: край продолжается, море уходит вглубь, суша поднимается в холмы — по сторонам по-разному
  // (P.rise): на запад — пологое побережье Виланова, на север — массив Гарраф, на восток — скалы Гаррафа у моря.
  // У берега подъём плавный (от линии берега на краю рельефа — coastW / coastE)
  const coastAt = i => { for (let j = 0; j < TNZ; j++) if (!tsea[j * TNX + i]) return TZ0 + j * TS; return TZM; };
  const coastE = coastAt(0), coastW = coastAt(TNX - 1);
  const outer = (x, z) => {
    const xe = clamp(x, TX0, TXM), ze = clamp(z, TZ0, TZM), he = bil(TO, TNX, TNZ, TX0, TZ0, TS, xe, ze);
    const d = Math.hypot(x - xe, z - ze);
    if (d < 1e-6) return he;
    if (he < 0) return he + (-P.seaMax - he) * smooth01(d / 400);
    const dW = Math.max(0, x - TXM), dE = Math.max(0, TX0 - x), dN = Math.max(0, z - TZM);
    const shore = dN > 0 ? 1 : smooth01((z - (dW > 0 ? coastW : coastE)) / (dW > 0 ? 500 : 150));
    const k = (dW * P.rise[0] + dN * P.rise[1] + dE * P.rise[2]) / d, amp = clamp(k / 0.09, 0.3, 1.3);   // холмистость — с подъёмом
    const hill = (d * k * (1 + 0.4 * noise(x / 900, z / 900)) + amp * (35 * noise(x / 380 + 7, z / 380 - 3) * smooth01(d / 500)
      + 12 * noise(x / 140, z / 140) * smooth01(d / 300))) * shore;
    return he + Math.max(0, hill);
  };

  /* ---------- игровая сетка ---------- */
  const X0 = Math.floor((rect[0] - P.pad) / P.align) * P.align, X1 = Math.ceil((rect[1] + P.pad) / P.align) * P.align;
  const Z0 = Math.floor((rect[2] - P.pad) / P.align) * P.align, Z1 = Math.ceil((rect[3] + P.pad) / P.align) * P.align;
  const NX = Math.round((X1 - X0) / S) + 1, NZ = Math.round((Z1 - Z0) / S) + 1, N = NX * NZ;
  const gx = i => X0 + i * S, gz = j => Z0 + j * S;
  // сглаженный рельеф ICGC (Catmull-Rom по 4 × 4 узлам)
  const cr = (p0, p1, p2, p3, t) => p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
  const cubic = (x, z) => {
    const fx = clamp((x - TX0) / TS, 1, TNX - 2.0001), fz = clamp((z - TZ0) / TS, 1, TNZ - 2.0001);
    const i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j, k = j * TNX + i, a = k - TNX, c = k + TNX, d = c + TNX;
    return cr(cr(TH[a - 1], TH[a], TH[a + 1], TH[a + 2], tx), cr(TH[k - 1], TH[k], TH[k + 1], TH[k + 2], tx),
      cr(TH[c - 1], TH[c], TH[c + 1], TH[c + 2], tx), cr(TH[d - 1], TH[d], TH[d + 1], TH[d + 2], tx), tz);
  };
  const sea = sitgesRaster(seaRings, X0, Z0, S, NX, NZ);
  const beach = sitgesRaster(areas.filter(a => a.kind === 'beach' || a.kind === 'sand').map(a => a.ring), X0, Z0, S, NX, NZ);
  // расстояние до берега: у суши — до ближайшего узла моря, у моря — до ближайшей суши
  const dSea = new Float32Array(N), dLand = new Float32Array(N);
  for (let k = 0; k < N; k++) { dSea[k] = sea[k] ? 0 : Infinity; dLand[k] = sea[k] ? Infinity : 0; }
  sitgesChamfer(dSea, NX, NZ, S); sitgesChamfer(dLand, NX, NZ, S);
  // у берега — точное расстояние до линии берега (рёбра полигона моря): высоты у кромки плавно переходят через ноль
  // прямо на линии, и вода ложится по контуру OSM, а не «лесенкой» по узлам сетки
  {
    const SC = 16, M = P.exact, cellsS = new Map();
    for (const r of seaRings) for (let a = 0, b = r.length - 1; a < r.length; b = a++) {
      const [ax, az] = r[a], [bx, bz] = r[b];
      if (Math.max(Math.abs(ax), Math.abs(az), Math.abs(bx), Math.abs(bz)) > 1e4) continue;
      const sgm = [ax, az, bx - ax, bz - az];
      for (let ci = Math.floor((Math.min(ax, bx) - M) / SC); ci <= Math.floor((Math.max(ax, bx) + M) / SC); ci++)
        for (let cj = Math.floor((Math.min(az, bz) - M) / SC); cj <= Math.floor((Math.max(az, bz) + M) / SC); cj++) {
          const key = ci * 65536 + cj;
          if (!cellsS.has(key)) cellsS.set(key, []);
          cellsS.get(key).push(sgm);
        }
    }
    for (let k = 0; k < N; k++) {
      const D = sea[k] ? dLand : dSea;
      if (D[k] > M - S) continue;
      const x = gx(k % NX), z = gz((k / NX) | 0), list = cellsS.get(Math.floor(x / SC) * 65536 + Math.floor(z / SC));
      if (!list) continue;
      let best = D[k] * D[k];
      for (const [ax, az, dx, dz] of list) {
        const L = dx * dx + dz * dz, t = L ? clamp(((x - ax) * dx + (z - az) * dz) / L, 0, 1) : 0, ex = x - ax - t * dx, ez = z - az - t * dz;
        const d2 = ex * ex + ez * ez;
        if (d2 < best) best = d2;
      }
      D[k] = Math.sqrt(best);
    }
  }
  // волнорезы: суша, которая исчезает при «раскрытии» (сжать на R, затем расширить на R), не пляж
  const R = P.groyneR, dOpen = new Float32Array(N), thin = new Uint8Array(N);
  for (let k = 0; k < N; k++) dOpen[k] = !sea[k] && dSea[k] > R ? 0 : Infinity;
  sitgesChamfer(dOpen, NX, NZ, S);
  for (let k = 0; k < N; k++) {
    if (dOpen[k] > R + S * 0.5) { dOpen[k] -= R; if (!sea[k] && !beach[k]) thin[k] = 1; } else dOpen[k] = 0;
  }
  // мелкие куски (срезанные углы берега) — не волнорезы
  {
    const seen = new Uint8Array(N), stack = [], comp = [];
    for (let k0 = 0; k0 < N; k0++) {
      if (!thin[k0] || seen[k0]) continue;
      stack.push(k0); seen[k0] = 1; comp.length = 0;
      while (stack.length) {
        const k = stack.pop(), i = k % NX; comp.push(k);
        const add = n => { if (n >= 0 && n < N && thin[n] && !seen[n]) { seen[n] = 1; stack.push(n); } };
        if (i > 0) add(k - 1);
        if (i < NX - 1) add(k + 1);
        add(k - NX); add(k + NX);
      }
      if (comp.length < P.groyneMin) for (const k of comp) thin[k] = 0;
    }
  }
  // корень волнореза поперёк пляжа: узкая полоса не-пляжа, по обе стороны которой пляж (thin = 2)
  for (let k = 0; k < N; k++) {
    if (sea[k] || beach[k] || thin[k] || dSea[k] > 80) continue;
    const i = k % NX;
    let l = 0, r = 0, u = 0, d = 0;
    for (let q = 1; q <= 5; q++) {
      if (i - q >= 0 && beach[k - q]) l = 1;
      if (i + q < NX && beach[k + q]) r = 1;
      if (k - q * NX >= 0 && beach[k - q * NX]) u = 1;
      if (k + q * NX < N && beach[k + q * NX]) d = 1;
    }
    if ((l && r) || (u && d)) thin[k] = 2;
  }
  // высоты
  const H = new Float32Array(N), rng = mulberry32(5);
  let groyneCells = 0;
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const k = j * NX + i, x = gx(i), z = gz(j);
    let h;
    if (sea[k]) h = -sitgesDepth(dLand[k]);
    else {
      h = Math.max(cubic(x, z), Math.min(P.shoreMax, P.shore0 + P.shoreRise * dSea[k]));
      if (thin[k] === 2) h += 0.45 + (rng() - 0.5) * 0.3;
      else if (thin[k]) {
        // гряда: от кромки воды круто вверх, у корня (где выступ переходит в берег) — плавно с высоты берега
        const top = Math.min(P.groyneTop, 0.4 + 0.5 * dSea[k]) + (rng() - 0.5) * 0.35;
        h = Math.max(h, h + (top - h) * smooth01(dOpen[k] / 10));
        groyneCells++;
      }
    }
    H[k] = h;
  }
  const inGrid = (x, z) => x >= X0 && x <= X1 && z >= Z0 && z <= Z1;
  const cell = (x, z) => clamp(Math.round((z - Z0) / S), 0, NZ - 1) * NX + clamp(Math.round((x - X0) / S), 0, NX - 1);
  const ground = (x, z) => inGrid(x, z) ? bil(H, NX, NZ, X0, Z0, S, x, z) : outer(x, z);
  // уровень моря (0) над морем, иначе воды нет
  const waterAt = (x, z) => (inGrid(x, z) ? sea[cell(x, z)] : outer(x, z) < 0) ? 0 : -Infinity;
  Object.assign(C, {
    terra: { X0, X1, Z0, Z1, NX, NZ, S, gx, gz, H, sea, beach, thin, dSea, dLand, groyneCells, inGrid, cell, TO, TX0, TZ0, TXM, TZM, TNX, TNZ, TS },
    ground, outer, waterAt,
  });
  // набережная (этап 7, группа D): подпорная стена — пляж у неё ниже, променад за ней ровный (js/maps/sitges/st/promenade.js)
  stPromTerrain(C);
  // склоны (этап 7, группа G): откос перед стеной бастиона у церкви — до нижней площади (js/maps/sitges/st/slopes.js)
  stSlopeTerrain(C);
}
