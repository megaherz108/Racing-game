// Карта «Ситжес» — помощники конвейера: упаковка чисел в строки, упрощение контуров, геометрия многоугольников.
// Модуль node (require). Распаковщик строк в игре — sitgesDec() (js/maps/sitges/plan.js), формат должен совпадать.

/* ---------- упаковка целых чисел в строку ----------
   Каждое число: зигзаг (0, −1, 1, −2 … → 0, 1, 2, 3 …), затем группы по 5 бит от младших; у всех групп, кроме
   последней, взведён бит 0x20; группа → символ алфавита из 64 знаков. |v| < 16 — 1 символ, < 512 — 2, < 16384 — 3.
   В алфавите нет кавычек и «\», строку можно вставлять в JS как есть. */
const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function enc(ints) {
  let s = '';
  for (const v0 of ints) {
    if (!Number.isInteger(v0)) throw new Error('enc: не целое ' + v0);
    let v = v0 < 0 ? -2 * v0 - 1 : 2 * v0;
    while (v >= 32) { s += ABC[(v & 31) | 32]; v = Math.floor(v / 32); }
    s += ABC[v];
  }
  return s;
}
function dec(s) {
  const out = []; let v = 0, k = 1;
  for (let i = 0; i < s.length; i++) {
    const c = ABC.indexOf(s[i]);
    v += (c & 31) * k;
    if (c & 32) k *= 32; else { out.push(v % 2 ? -(v + 1) / 2 : v / 2); v = 0; k = 1; }
  }
  return out;
}
// поток точек: координаты в дециметрах, разности от предыдущей точки (через границы объектов — тоже)
function encPoints(rings, q = 10) {
  const out = []; let px = 0, pz = 0;
  for (const r of rings) for (const [x, z] of r) {
    const X = Math.round(x * q), Z = Math.round(z * q);
    out.push(X - px, Z - pz); px = X; pz = Z;
  }
  return enc(out);
}

/* ---------- геометрия ---------- */
const area = r => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return a / 2; };
function centroid(r) {
  let a = 0, cx = 0, cz = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const f = r[j][0] * r[i][1] - r[i][0] * r[j][1];
    a += f; cx += (r[j][0] + r[i][0]) * f; cz += (r[j][1] + r[i][1]) * f;
  }
  if (Math.abs(a) < 1e-9) return r[0];
  return [cx / (3 * a), cz / (3 * a)];
}
function inPoly(x, z, r) {
  let ins = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, zi] = r[i], [xj, zj] = r[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) ins = !ins;
  }
  return ins;
}
const bbox = pts => {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
  return [x0, x1, z0, z1];
};
// расстояние от точки до отрезка
function segDist(p, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz;
  const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
}

/* ---------- упрощение ---------- */
// ломаная: Дуглас — Пекер с допуском tol (концы сохраняются)
function simplifyLine(pts, tol) {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let md = 0, mi = -1;
    for (let i = a + 1; i < b; i++) { const d = segDist(pts[i], pts[a], pts[b]); if (d > md) { md = d; mi = i; } }
    if (md > tol) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
// замкнутый контур (без повтора первой точки в конце):
//   1) слить вершины ближе minD друг к другу;
//   2) убрать вершины на почти прямой линии: отклонение от хорды соседей < tol или поворот < angDeg;
// повторять, пока что-то меняется. Меньше 3 вершин — null.
function simplifyRing(r, { minD = 0.5, tol = 0.25, angDeg = 8 } = {}) {
  let p = r.slice();
  if (p.length > 1 && p[0][0] === p[p.length - 1][0] && p[0][1] === p[p.length - 1][1]) p.pop();
  const cosA = Math.cos(angDeg * Math.PI / 180);
  for (let changed = true; changed && p.length > 3;) {
    changed = false;
    // близкие вершины
    for (let i = 0; i < p.length && p.length > 3; i++) {
      const j = (i + 1) % p.length;
      if (Math.hypot(p[i][0] - p[j][0], p[i][1] - p[j][1]) < minD) {
        p[i] = [(p[i][0] + p[j][0]) / 2, (p[i][1] + p[j][1]) / 2]; p.splice(j, 1); changed = true; i--;
      }
    }
    // почти прямые углы (вершины, где контур идёт почти по прямой)
    for (let i = 0; i < p.length && p.length > 3; i++) {
      const a = p[(i + p.length - 1) % p.length], b = p[i], c = p[(i + 1) % p.length];
      const ux = b[0] - a[0], uz = b[1] - a[1], vx = c[0] - b[0], vz = c[1] - b[1];
      const lu = Math.hypot(ux, uz), lv = Math.hypot(vx, vz);
      const straight = lu && lv && (ux * vx + uz * vz) / (lu * lv) > cosA;
      if (straight || segDist(b, a, c) < tol) { p.splice(i, 1); changed = true; i--; }
    }
  }
  return p.length >= 3 && Math.abs(area(p)) > 0.5 ? p : null;
}

/* ---------- обрезка прямоугольником ---------- */
// многоугольник (Сазерленд — Ходжмен)
function clipPolyRect(r, [x0, x1, z0, z1]) {
  const edges = [[p => p[0] >= x0, (a, b) => [x0, a[1] + (b[1] - a[1]) * (x0 - a[0]) / (b[0] - a[0])]],
    [p => p[0] <= x1, (a, b) => [x1, a[1] + (b[1] - a[1]) * (x1 - a[0]) / (b[0] - a[0])]],
    [p => p[1] >= z0, (a, b) => [a[0] + (b[0] - a[0]) * (z0 - a[1]) / (b[1] - a[1]), z0]],
    [p => p[1] <= z1, (a, b) => [a[0] + (b[0] - a[0]) * (z1 - a[1]) / (b[1] - a[1]), z1]]];
  let out = r;
  for (const [ins, cut] of edges) {
    const inp = out; out = [];
    for (let i = 0; i < inp.length; i++) {
      const a = inp[(i + inp.length - 1) % inp.length], b = inp[i];
      if (ins(b)) { if (!ins(a)) out.push(cut(a, b)); out.push(b); } else if (ins(a)) out.push(cut(a, b));
    }
    if (!out.length) return null;
  }
  return out.length >= 3 ? out : null;
}
// ломаная → куски, у которых каждый отрезок проходит проверку keep(a, b)
function splitLine(pts, keep) {
  const out = []; let cur = null;
  for (let i = 1; i < pts.length; i++) {
    if (keep(pts[i - 1], pts[i])) { if (!cur) out.push(cur = [pts[i - 1]]); cur.push(pts[i]); } else cur = null;
  }
  return out;
}

// склейка ломаных по общим концам (береговая линия OSM приходит кусками)
function stitch(lines, key = p => p[0].toFixed(2) + ',' + p[1].toFixed(2)) {
  const ls = lines.map(l => l.slice());
  for (let merged = true; merged;) {
    merged = false;
    outer: for (let i = 0; i < ls.length; i++) for (let j = 0; j < ls.length; j++) {
      if (i === j) continue;
      const a = ls[i], b = ls[j];
      if (key(a[a.length - 1]) === key(b[0])) { ls[i] = a.concat(b.slice(1)); ls.splice(j, 1); merged = true; break outer; }
      if (key(a[a.length - 1]) === key(b[b.length - 1])) { ls[i] = a.concat(b.slice(0, -1).reverse()); ls.splice(j, 1); merged = true; break outer; }
    }
  }
  return ls;
}

module.exports = { ABC, enc, dec, encPoints, area, centroid, inPoly, bbox, segDist, simplifyLine, simplifyRing, clipPolyRect, splitLine, stitch };
