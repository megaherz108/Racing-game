// Карта «Ситжес» — лист проверки крыш глазами: ортофото контрольных мест, поверх — контуры частей зданий цветом типа
// крыши из js/maps/sitges/data-roofs.js и линия конька. Модуль node, игра его не грузит.
//   node tools/sitges/roofs-sheet.js [x z …]   → tools/sitges/raw/roofs-sheet.png (по умолчанию — 6 мест ниже)
// Цвета: плоская — голубой, двускатная — жёлтый, вальмовая — пурпурный, односкатная — зелёный,
//   скатная без лидара — оранжевый, нет данных — красный. Север (UTM) — вверх: x игры растёт влево.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const G = require('./geo');
const U = require('./util');
const { readPNG, writePNG } = require('./png');

const load = (f, name) => { const ctx = {}; vm.runInNewContext(fs.readFileSync(path.join(G.OUT, f), 'utf8') + `;this.v=${name};`, ctx); return ctx.v; };
const geo = load('data-geo.js', 'SITGES_GEO'), B = load('data-buildings.js', 'SITGES_BLD'), RF = load('data-roofs.js', 'SITGES_ROOF');
G.setOrigin(...geo.origin);

// части зданий: кольца в локальных координатах
const m = U.dec(B.m), pv = U.dec(B.p);
let mi = 0, pi = 0, px = 0, pz = 0;
const parts = [];
for (let b = 0; b < B.n; b++) {
  const np = m[mi++]; mi += 4;
  for (let k = 0; k < np; k++) {
    const fl = m[mi++]; mi++; const nr = m[mi++], lens = m.slice(mi, mi + nr); mi += nr;
    const rings = lens.map(n => { const r = []; for (let i = 0; i < n; i++) { px += pv[pi++]; pz += pv[pi++]; r.push([px / 10, pz / 10]); } return r; });
    parts.push({ rings, floors: fl });
  }
}
const rm = U.dec(RF.m);
parts.forEach((p, i) => { p.type = rm[i * 5]; p.ang = rm[i * 5 + 1] * 3; });

const args = process.argv.slice(2).map(Number);
const SPOTS = args.length >= 2 ? Array.from({ length: args.length >> 1 }, (_, i) => [args[2 * i], args[2 * i + 1]])
  // старый город, Эйшампле, Террамар, Виньет, Айгуадольс, кварталы за ж/д (Poble Sec)
  : [[-560, -120], [-395, 104], [1495, -96], [1000, 60], [-1450, -300], [-860, 580]];
const S = 320, M = 0.5, COLS = 3, ROWS = Math.ceil(SPOTS.length / COLS), W = S * COLS, H = S * ROWS;
const img = new Uint8Array(W * H * 3);
const TYPE_COL = [[255, 40, 40], [60, 220, 255], [255, 230, 0], [255, 60, 255], [80, 255, 80], [255, 150, 0]];
const tiles = new Map();
const orto = (e, n) => {
  const e0 = Math.floor(e / 512) * 512, n0 = Math.floor(n / 512) * 512, key = e0 + '_' + n0;
  if (!tiles.has(key)) { const f = path.join(G.RAW, 'orto', key + '.png'); tiles.set(key, fs.existsSync(f) ? readPNG(fs.readFileSync(f)) : null); }
  const t = tiles.get(key);
  if (!t) return [0, 0, 0];
  const c = Math.min(1023, Math.floor((e - e0) / 0.5)), r = 1023 - Math.min(1023, Math.floor((n - n0) / 0.5)), o = (r * 1024 + c) * 4;
  return [t.data[o], t.data[o + 1], t.data[o + 2]];
};
SPOTS.forEach(([cx, cz], s) => {
  const ox = (s % COLS) * S, oy = Math.floor(s / COLS) * S, half = S * M / 2;
  // местные координаты пикселя: x влево, z вверх — после поворота карты это север вверх, восток вправо
  const toPix = (x, z) => [ox + (cx + half - x) / M, oy + (cz + half - z) / M];
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const x = cx + half - (i + 0.5) * M, z = cz + half - (j + 0.5) * M, [e, n] = G.toUTM(x, z), c = orto(e, n), o = ((oy + j) * W + ox + i) * 3;
    img[o] = c[0]; img[o + 1] = c[1]; img[o + 2] = c[2];
  }
  const dot = (x, y, col) => { x = Math.round(x); y = Math.round(y); if (x < ox || y < oy || x >= ox + S || y >= oy + S) return; const o = (y * W + x) * 3; img[o] = col[0]; img[o + 1] = col[1]; img[o + 2] = col[2]; };
  const line = (a, b, col) => { const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])) + 1; for (let k = 0; k <= n; k++) dot(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n, col); };
  for (const p of parts) {
    const r = p.rings[0], bb = U.bbox(r);
    if (bb[1] < cx - half || bb[0] > cx + half || bb[3] < cz - half || bb[2] > cz + half) continue;
    const col = TYPE_COL[p.type];
    for (const ring of p.rings) for (let i = 0; i < ring.length; i++) line(toPix(...ring[i]), toPix(...ring[(i + 1) % ring.length]), col);
    if (p.type >= 2) {
      // конёк (у односкатной — стрелка вниз по скату) через центр контура
      const [mx, mz] = U.centroid(r), a = p.ang * Math.PI / 180, L = Math.min(bb[1] - bb[0], bb[3] - bb[2], 12) * 0.4;
      const ex = Math.cos(a) * L, ez = Math.sin(a) * L;
      line(toPix(mx - (p.type === 4 ? 0 : ex), mz - (p.type === 4 ? 0 : ez)), toPix(mx + ex, mz + ez), [255, 255, 255]);
    }
  }
});
const out = path.join(G.RAW, 'roofs-sheet.png');
fs.writeFileSync(out, writePNG(W, H, img));
console.log('лист:', out, `(${SPOTS.length} мест, ${S * M} м каждое)`);
