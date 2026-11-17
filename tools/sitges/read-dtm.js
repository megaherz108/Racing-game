// Карта «Ситжес» — разбор raw/dtm5.asc (ARCGRID, EPSG:25831, клетка 5 м). Модуль node (require).
// Возвращает { at(e, n) — высота с билинейной интерполяцией (нет данных → 0), nodata — сколько клеток без данных, … }.
const fs = require('fs');
const path = require('path');
const { RAW } = require('./geo');

function readDTM() {
  const txt = fs.readFileSync(path.join(RAW, 'dtm5.asc'), 'utf8');
  const head = {}; let pos = 0;
  for (let k = 0; k < 6; k++) {
    const nl = txt.indexOf('\n', pos), [key, val] = txt.slice(pos, nl).trim().split(/\s+/);
    head[key.toLowerCase()] = +val; pos = nl + 1;
  }
  const { ncols: W, nrows: H, xllcorner: X0, yllcorner: Y0, cellsize: S, nodata_value: ND } = head;
  const v = new Float32Array(W * H);
  let i = 0, nodata = 0, min = Infinity, max = -Infinity;
  for (const t of txt.slice(pos).split(/\s+/)) {
    if (!t) continue;
    let h = +t;
    // «нет данных» — NODATA_VALUE (−9999, море) и ещё −8888 (встречается в покрытии ICGC)
    if (h === ND || h < -1000 || !Number.isFinite(h)) { h = 0; nodata++; } else { if (h < min) min = h; if (h > max) max = h; }
    v[i++] = h;
  }
  if (i !== W * H) throw new Error(`рельеф: ожидалось ${W * H} значений, прочитано ${i}`);
  // ARCGRID: первая строка — север; центр клетки (c, r) — (X0 + (c + 0.5)·S, Y0 + (H − r − 0.5)·S)
  function at(e, n) {
    const fx = (e - X0) / S - 0.5, fy = H - (n - Y0) / S - 0.5;
    const c = Math.max(0, Math.min(W - 2, Math.floor(fx))), r = Math.max(0, Math.min(H - 2, Math.floor(fy)));
    const tx = Math.max(0, Math.min(1, fx - c)), ty = Math.max(0, Math.min(1, fy - r));
    const a = v[r * W + c], b = v[r * W + c + 1], d = v[(r + 1) * W + c], e2 = v[(r + 1) * W + c + 1];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (d * (1 - tx) + e2 * tx) * ty;
  }
  return { at, W, H, S, nodata, min, max };
}

module.exports = { readDTM };
