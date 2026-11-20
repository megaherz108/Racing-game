// Карта «Ситжес» — деревья из лидара ICGC (этап 4б.0): место, высота, ширина кроны и признаки формы каждого дерева.
// Модуль node (require), игра его не грузит. Плитки качает download.js: sup/ (поверхность с растительностью),
// dsm/ (рельеф + здания), ir/ (инфракрасное ортофото), калибровки sup/calib.json, dsm/calib.json.
//   readTrees(parts) — parts: [{ rings }] части зданий в локальных координатах игры (как в data-buildings.js);
//   → { trees: [{ x, z, h, r, el, fl, gp }], stat }:
//     x, z — середина кроны (центр тяжести точек выше половины высоты), м игры; h — высота вершины над землёй, м;
//     r — радиус кроны (по площади), м; el — вытянутость (√ отношения осей инерции, 1 — круг; > 2 — ряд, изгородь);
//     fl — полнота профиля: средняя высота кроны / высота вершины (плоский зонтик ближе к 1, конус и бугор — меньше);
//     gp — доля просветов в круге кроны (точки ниже трети высоты: голые ветви лиственных в марте, рыхлые кроны);
//     src — источник у вершины: 1 — прибрежный лидар 50 см 2024, 2 — территориальный 1 м 2021–2023 (запас).
// Как:
//   1. Высота над землёй = поверхность − «рельеф + здания» (оба: серый = a · h + b, своя калибровка у плитки).
//      Где прибрежного лидара нет (полосы за ж/д: Pg. de Vilafranca, часть кварталов на севере) — высоты
//      растительности территориального лидара alc/ (уже только растительность: NDVI не нужен).
//   2. Крона — точки выше TREE.minCanopy, зелёные по ИК (NDVI = (ИК − красный) / (ИК + красный) ≥ TREE.ndvi;
//      в ИК-снимке каналы R, G = ИК, красный), не внутри частей зданий кадастра (края домов: лидары двух моделей
//      расходятся на пиксель — полоса «высоты» вдоль стен) и не над морем.
//   3. Сглаживание 3 × 3 и «затопление сверху»: точки по убыванию высоты, у каждой — уже пройденные соседи.
//      Новая вершина — новая крона. Две кроны, встретившиеся в седловине, сливаются, если провал до седловины
//      у низшей меньше TREE.dip (дроблёная крона одного дерева) или вершины ближе TREE.near. Точка ниже
//      TREE.base × вершины соседней кроны к ней не присоединяется (куст или изгородь у дерева — отдельно).
//   4. Отсев: вершина ниже TREE.minH (кусты, изгороди) или выше TREE.maxH, крона меньше TREE.minArea.
// Вся обработка — по плиткам 512 м с полями TREE.margin (кроны на стыке плиток считаются один раз — по вершине).
const fs = require('fs');
const path = require('path');
const G = require('./geo');
const { readPNG } = require('./png');

const TREE = {
  tile: 512, px: 0.5,        // плитки download.js
  margin: 60,                // поле вокруг плитки, пикселей (30 м — шире самой большой кроны)
  minCanopy: 2.0,            // точка кроны — выше, м
  ndvi: 0.12,                // и зелёная по ИК
  base: 0.3,                 // точка ниже base × вершины кроны-соседки — не её
  dip: 1.5, dipK: 0.2,       // слить кроны, если провал у низшей < max(dip, dipK × её высоты), м
  near: 1.6, nearK: 0.12,    // или вершины ближе near + nearK × высоты, м
  minH: 3.5,                 // дерево — вершина не ниже, м (ниже — куст)
  maxH: 30,                  // и не выше: выше — кран, мачта, край башни над зеленью (деревьев выше в городе нет)
  minArea: 2,                // и крона не меньше, м²
};

/* ---------- плитки: высота над землёй, NDVI, маска зданий ---------- */
const readCal = k => { const f = path.join(G.RAW, k, 'calib.json'); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {}; };
function loadTiles() {
  const cs = readCal('sup'), cd = readCal('dsm'), ca = readCal('alc'), size = TREE.tile / TREE.px, tiles = new Map();
  for (const key of new Set([...Object.keys(cs), ...Object.keys(ca)])) {
    const a = cs[key], b = cd[key], c = ca[key];
    const f = k => path.join(G.RAW, k, key + '.png'), img = k => readPNG(fs.readFileSync(f(k))).data;
    const lit = a && b && ['sup', 'dsm', 'ir'].every(k => fs.existsSync(f(k))), alt = c && fs.existsSync(f('alc'));
    if (!lit && !alt) continue;
    const s = lit && img('sup'), d = lit && img('dsm'), ir = lit && img('ir'), v = alt && img('alc');
    // src: 1 — прибрежный лидар 2024 (поверхность − рельеф с домами, маска NDVI), 2 — высоты растительности
    // территориального лидара (уже только растительность), 0 — нет данных
    const chm = new Float32Array(size * size).fill(NaN), veg = new Uint8Array(size * size), src = new Uint8Array(size * size);
    for (let i = 0; i < size * size; i++) {
      if (lit && s[i * 4 + 3] >= 128 && d[i * 4 + 3] >= 128) {
        chm[i] = Math.max(0, (s[i * 4] - a[1]) / a[0] - (d[i * 4] - b[1]) / b[0]);
        const nir = ir[i * 4], red = ir[i * 4 + 1];
        veg[i] = (nir - red) / (nir + red + 1) >= TREE.ndvi ? 1 : 0;
        src[i] = 1;
      } else if (alt) {
        chm[i] = v[i * 4 + 3] < 128 ? 0 : Math.max(0, (v[i * 4] - c[1]) / c[0]);
        veg[i] = 1; src[i] = 2;
      }
    }
    const [e0, n0] = key.split('_').map(Number);
    tiles.set(key, { e0, n0, chm, veg, src, bld: new Uint8Array(size * size) });
  }
  return tiles;
}
// части зданий → маска bld плиток (заливка строк по центрам пикселей)
function paintBuildings(tiles, parts) {
  const size = TREE.tile / TREE.px;
  for (const p of parts) {
    const rings = p.rings.map(r => r.map(([x, z]) => G.toUTM(x, z)));
    const ns = rings[0].map(q => q[1]);
    const nA = Math.min(...ns), nB = Math.max(...ns);
    for (let n = Math.floor(nA / TREE.px) * TREE.px + TREE.px / 2; n <= nB; n += TREE.px) {
      const xs = [];
      for (const r of rings) for (let i = 0; i < r.length; i++) {
        const [ea, na] = r[i], [eb, nb] = r[(i + 1) % r.length];
        if ((na <= n) !== (nb <= n)) xs.push(ea + (n - na) / (nb - na) * (eb - ea));
      }
      xs.sort((u, v) => u - v);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let e = Math.ceil((xs[k] - TREE.px / 2) / TREE.px) * TREE.px + TREE.px / 2; e < xs[k + 1]; e += TREE.px) {
          const t = tiles.get(Math.floor(e / TREE.tile) * TREE.tile + '_' + Math.floor(n / TREE.tile) * TREE.tile);
          if (!t) continue;
          const c = Math.floor((e - t.e0) / TREE.px), rr = size - 1 - Math.floor((n - t.n0) / TREE.px);
          t.bld[rr * size + c] = 1;
        }
      }
    }
  }
}

/* ---------- одна плитка с полями: кроны ---------- */
function crowns(tiles, t, out, stat) {
  const size = TREE.tile / TREE.px, M = TREE.margin, W = size + 2 * M, N = W * W;
  // окно: высота кроны (0 — не крона), сырая высота для замеров
  const raw = new Float32Array(N), sm = new Float32Array(N), srcW = new Uint8Array(N);
  for (let r = 0; r < W; r++) for (let c = 0; c < W; c++) {
    const e = t.e0 + (c - M + 0.5) * TREE.px, n = t.n0 + TREE.tile - (r - M + 0.5) * TREE.px;
    const q = tiles.get(Math.floor(e / TREE.tile) * TREE.tile + '_' + Math.floor(n / TREE.tile) * TREE.tile);
    if (!q) continue;
    const cc = Math.floor((e - q.e0) / TREE.px), rr = size - 1 - Math.floor((n - q.n0) / TREE.px), i = rr * size + cc;
    const h = q.chm[i];
    if (q === t && h === h) stat[q.src[i] === 1 ? 'cells' : 'cellsAlc']++;
    if (!(h >= TREE.minCanopy) || !q.veg[i] || q.bld[i]) continue;
    raw[r * W + c] = h; srcW[r * W + c] = q.src[i];
    if (q === t) stat.canopy++;
  }
  // сглаживание 3 × 3 по точкам кроны (вне кроны — 0)
  for (let r = 1; r < W - 1; r++) for (let c = 1; c < W - 1; c++) {
    const i = r * W + c;
    if (!raw[i]) continue;
    let s = 0, w = 0;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const v = raw[i + dr * W + dc], k = dr || dc ? (dr && dc ? 1 : 2) : 4;
      if (v) { s += v * k; w += k; }
    }
    sm[i] = s / w;
  }
  // затопление сверху
  const idx = [];
  for (let i = 0; i < N; i++) if (sm[i]) idx.push(i);
  idx.sort((a, b) => sm[b] - sm[a]);
  const lab = new Int32Array(N).fill(-1), par = [], top = [];   // кроны: родитель (слияние), пиксель вершины
  const root = k => { while (par[k] !== k) k = par[k] = par[par[k]]; return k; };
  const nb = [-W - 1, -W, -W + 1, -1, 1, W - 1, W, W + 1];
  for (const i of idx) {
    const h = sm[i];
    let best = -1;
    const seen = [];
    for (const d of nb) {
      const l = lab[i + d];
      if (l < 0) continue;
      const k = root(l);
      if (seen.includes(k)) continue;
      seen.push(k);
      if (best < 0 || sm[top[k]] > sm[top[best]]) best = k;
    }
    // слияние встретившихся крон: провал у низшей мал или вершины рядом
    for (const k of seen) {
      if (k === best || root(k) === root(best)) continue;
      const kb = root(best), kk = root(k), lo = sm[top[kk]] < sm[top[kb]] ? kk : kb, hi = lo === kk ? kb : kk;
      const hl = sm[top[lo]], dip = hl - h;
      const dist = Math.hypot(top[lo] % W - top[hi] % W, Math.floor(top[lo] / W) - Math.floor(top[hi] / W)) * TREE.px;
      if (dip < Math.max(TREE.dip, TREE.dipK * hl) || dist < TREE.near + TREE.nearK * hl) par[lo] = hi;
    }
    if (best >= 0) best = root(best);
    if (best < 0 || h < TREE.base * sm[top[best]]) { const k = par.length; par.push(k); top.push(i); lab[i] = k; }
    else lab[i] = best;
  }
  // замеры крон
  const C = new Map();
  for (const i of idx) {
    const k = root(lab[i]);
    let s = C.get(k);
    if (!s) C.set(k, s = { top: top[k], hMax: 0, px: [] });
    s.px.push(i);
    if (raw[i] > s.hMax) s.hMax = raw[i];
  }
  for (const s of C.values()) {
    const tc = s.top % W, trow = Math.floor(s.top / W);
    // вершина — в своей плитке (не в поле), иначе крону посчитает соседняя
    if (tc < M || tc >= M + size || trow < M || trow >= M + size) continue;
    const h = s.hMax, area = s.px.length * TREE.px * TREE.px;
    stat.segs++;
    if (h < TREE.minH) { stat.low++; continue; }
    if (h > TREE.maxH) { stat.high++; continue; }
    if (area < TREE.minArea) { stat.small++; continue; }
    // центр — по точкам выше половины высоты; оси инерции — по всем точкам кроны
    let sx = 0, sy = 0, sw = 0, mx = 0, my = 0, sum = 0;
    for (const i of s.px) {
      const c = i % W, r = Math.floor(i / W);
      mx += c; my += r; sum += raw[i];
      if (raw[i] >= h * 0.5) { sx += c; sy += r; sw++; }
    }
    mx /= s.px.length; my /= s.px.length;
    let xx = 0, yy = 0, xy = 0;
    for (const i of s.px) { const dx = i % W - mx, dy = Math.floor(i / W) - my; xx += dx * dx; yy += dy * dy; xy += dx * dy; }
    const tr2 = (xx + yy) / 2, det = Math.sqrt(Math.max(0, ((xx - yy) / 2) ** 2 + xy * xy));
    const el = Math.sqrt((tr2 + det) / Math.max(1e-6, tr2 - det));
    const cx = sx / sw, cy = sy / sw, rad = Math.sqrt(area / Math.PI);
    // просветы: пиксели в круге кроны, где сырая высота ниже трети вершины (или не крона)
    let tot = 0, gap = 0;
    const rp = rad / TREE.px;
    for (let r = Math.floor(cy - rp); r <= cy + rp; r++) for (let c = Math.floor(cx - rp); c <= cx + rp; c++) {
      if (r < 0 || c < 0 || r >= W || c >= W || (r - cy) ** 2 + (c - cx) ** 2 > rp * rp) continue;
      tot++;
      if (raw[r * W + c] < h / 3) gap++;
    }
    const e = t.e0 + (cx - M + 0.5) * TREE.px, n = t.n0 + TREE.tile - (cy - M + 0.5) * TREE.px;
    const [x, z] = G.toLocal(e, n);
    out.push({ x, z, h, r: rad, el, fl: sum / s.px.length / h, gp: tot ? gap / tot : 0, src: srcW[s.top] });
  }
}

function readTrees(parts) {
  const tiles = loadTiles();
  paintBuildings(tiles, parts);
  const trees = [], stat = { tiles: tiles.size, cells: 0, cellsAlc: 0, canopy: 0, segs: 0, low: 0, high: 0, small: 0 };
  for (const t of tiles.values()) crowns(tiles, t, trees, stat);
  return { trees, stat };
}

module.exports = { readTrees, TREE };
