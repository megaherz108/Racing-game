// Ситжес — ПОСТРОЙКА: текстуры заборов по видам (этап 4а.4) — процедурные canvas, вид по фото (docs/sitges/stage-4a.md,
// листы tools/sitges/raw/photos/sheets/fence-*, fence2-*, gate-*, wicket-*).
//   solid — атлас «твёрдых» поверхностей (один материал, тень — теневыми копиями): полосы с повтором по вертикали
//     band м — штукатурка, бутовый камень, кирпич, бежевая плитка, бетон с опалубкой, вереск, ламели, доски, лист;
//     полоса misc без повтора — дверь старого города и лицо общего столба (почтовый ящик, домофон, номер дома).
//   alpha — атлас с альфой (свои мипмапы sitgesAlphaMips), полосы «от верха» (верх картинки — верх грани): сварная
//     сетка с рамой, кованая решётка с пиками, перила блоков (трубы), кромка листвы над изгородью.
//   hedge — листва изгороди tile × tile м с повтором в обе стороны.
//   Ширина атласов — rep м (повтор вдоль забора). Полосы разделены полями gutter px (у полос с повтором — продолжение
//   рисунка) от протекания мипмапов. Светлые серые тона красит цвет вершины (штукатурка, вереск, ламели, доски, лист,
//   сетка, решётка, листва), камень, кирпич, плитка и бетон — в своём цвете.
//   uv[полоса] = { v0, v1, m } — низ и верх полосы по v, высота полосы, м; SITGES_FTEX.misc — места картинок misc по u.
// Определяет: SITGES_FTEX, sitgesFenceTextures, sitgesAlphaMips.
// Использует: canvasTex (js/maps/city/textures.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const SITGES_FTEX = {
  px: 128,        // пикселей на метр
  rep: 4,         // ширина атласов вдоль забора, м (512 px)
  band: 1.25,     // высота полос с повтором, м
  gutter: 16,     // поля полос, px
  alphaCut: 0.1,  // порог альфы атласа с альфой (вдали — дымка: alphaToCoverage при MSAA, без него — смешивание)
  hedge: 1.6,     // листва изгороди: повтор, м
  // misc (2,25 м без повтора): дверь 1 м × 2,1 м и два варианта лица общего столба 0,4 м — [u0, u1] в px
  misc: { door: [8, 136], plate: [[168, 219], [240, 291]] },
};

function sitgesFenceTextures() {
  const T = SITGES_FTEX, PX = T.px, W = T.rep * PX, G = T.gutter, BH = Math.round(T.band * PX);
  const rng = seed => { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
  // картинка w × h px: paint(x, rnd, put, h, w); put(x, y, w, h, draw) рисует draw(dx, dy) со сдвигами, при которых
  // прямоугольник задевает картинку (повтор по краям: по u всегда, по v — если wrapY)
  const tile = (h, bg, paint, seed, wrapY = true, w = W) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    if (bg) { x.fillStyle = bg; x.fillRect(0, 0, w, h); }
    const put = (px, py, pw, ph, draw) => {
      for (const dx of [-w, 0, w]) {
        if (px + dx > w || px + pw + dx < 0) continue;
        for (const dy of wrapY ? [-h, 0, h] : [0]) if (py + dy <= h && py + ph + dy >= 0) draw(dx, dy);
      }
    };
    paint(x, rng(seed), put, h, w);
    return c;
  };
  // крапины: n штук размером до sz px, цвета — 32 тона функции col(r) (строка цвета на каждую крапину — медленно)
  const specks = (x, r, put, h, w, n, sz, col) => {
    const pal = Array.from({ length: 32 }, () => col(r));
    for (let i = 0; i < n; i++) {
      const X = r() * w, Y = r() * h, a = 1 + r() * sz, b = 1 + r() * sz;
      x.fillStyle = pal[Math.floor(r() * 32)];
      put(X, Y, a, b, (dx, dy) => x.fillRect(X + dx, Y + dy, a, b));
    }
  };
  const rgb = (r, g, b) => `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
  const grey = v => rgb(v, v, v);

  /* ---------- твёрдые полосы (повтор по вертикали band м) ---------- */
  // штукатурка: почти белая с лёгкими пятнами (цвет — вершина: белая, кремовая)
  const plaster = (x, r, put, h, w) => specks(x, r, put, h, w, 5200, 3, r => `rgba(${r() < 0.5 ? '255,255,255' : '90,80,60'},${(r() * 0.08).toFixed(3)})`);
  // бутовый камень (Malvasia 35, ворота у (−706, 223)): угловатые камни 15–40 см вплотную, неровные ряды, тонкий шов
  const rubble = (x, r, put, h, w) => {
    const pal = [[184, 170, 146], [168, 153, 126], [196, 182, 154], [157, 145, 123], [190, 174, 140], [143, 133, 113], [204, 192, 168], [172, 158, 134], [160, 140, 112]];
    const rows = 6, rh = h / rows;
    for (let row = 0; row < rows; row++) {
      const ws = [];
      let sum = 0;
      while (sum < w) { const v = 18 + r() * 34; ws.push(v); sum += v; }
      let cx = r() * 30;
      for (const w0 of ws) {
        const sw = w0 * w / sum, mx = cx + sw / 2 + (r() - 0.5) * 4, my = row * rh + rh / 2 + (r() - 0.5) * 8;
        const rx = sw / 2 + 1, ry = rh / 2 + 1.5 + (r() - 0.5) * 6;
        const n = 5 + Math.floor(r() * 3), a0 = r() * 6.28, pts = [];
        for (let i = 0; i < n; i++) { const a = a0 + (i + (r() - 0.5) * 0.5) / n * 6.28, f = 0.78 + r() * 0.3; pts.push([Math.cos(a) * rx * f, Math.sin(a) * ry * f]); }
        const c = pal[Math.floor(r() * pal.length)], v = 0.84 + r() * 0.24;
        put(mx - rx - 4, my - ry - 4, 2 * rx + 8, 2 * ry + 8, (dx, dy) => {
          const poly = o => { x.beginPath(); pts.forEach(([px, py], i) => (i ? x.lineTo : x.moveTo).call(x, mx + px + dx + o, my + py + dy + o)); x.closePath(); x.fill(); };
          x.fillStyle = 'rgba(80,70,58,0.5)'; poly(1.2);
          x.fillStyle = rgb(c[0] * v, c[1] * v, c[2] * v); poly(0);
          x.fillStyle = 'rgba(255,250,235,0.12)'; poly(-1.2);
        });
        cx += sw;
      }
    }
    specks(x, r, put, h, w, 3000, 2, r => `rgba(${r() < 0.5 ? '255,250,240' : '60,50,40'},${(r() * 0.14).toFixed(3)})`);
  };
  // кирпич (Joan Roig i Soler 15): 25 × 7 см, перевязка в полкирпича, светлый шов
  const brick = (x, r, put, h, w) => {
    const bh = 10, bw = 32;
    for (let row = 0; row < h / bh; row++) for (let i = 0; i < w / bw; i++) {
      const X = i * bw + (row % 2 ? bw / 2 : 0) + 1, Y = row * bh + 1, v = 0.82 + r() * 0.28, t = r() * 14;
      x.fillStyle = rgb(176 * v + t, 98 * v, 63 * v - t / 2);
      put(X, Y, bw - 2, bh - 2, (dx, dy) => x.fillRect(X + dx, Y + dy, bw - 2, bh - 2));
    }
    specks(x, r, put, h, w, 2500, 2, r => `rgba(${r() < 0.5 ? '255,230,210' : '50,25,15'},${(r() * 0.15).toFixed(3)})`);
  };
  // бежевая плитка (Pere Pau Sagarra 19): ≈ 33 × 31 см, тонкий шов
  const tileP = (x, r, put, h, w) => {
    const cw = w / 12, ch = h / 4;
    for (let row = 0; row < 4; row++) for (let i = 0; i < 12; i++) {
      const v = 0.93 + r() * 0.1, X = i * cw + 1, Y = row * ch + 1;
      const gr = x.createLinearGradient(0, Y, 0, Y + ch);
      gr.addColorStop(0, rgb(216 * v, 188 * v, 148 * v)); gr.addColorStop(1, rgb(204 * v, 174 * v, 134 * v));
      x.fillStyle = gr; x.fillRect(X, Y, cw - 2, ch - 2);
    }
    specks(x, r, put, h, w, 1500, 2, r => `rgba(${r() < 0.5 ? '255,245,225' : '90,70,40'},${(r() * 0.1).toFixed(3)})`);
  };
  // бетон: доски опалубки по 21 см, швы, дырки от стяжек
  const concrete = (x, r, put, h, w) => {
    specks(x, r, put, h, w, 5000, 3, r => `rgba(${r() < 0.5 ? '235,235,230' : '70,70,65'},${(r() * 0.12).toFixed(3)})`);
    const bh = h / 6;
    for (let i = 0; i < 6; i++) {
      x.fillStyle = 'rgba(60,60,55,0.22)'; x.fillRect(0, i * bh, w, 1.5);
      let X = r() * 120;
      while (X < w) { const XX = X; x.fillStyle = 'rgba(60,60,55,0.18)'; put(XX, i * bh, 1.5, bh, (dx, dy) => x.fillRect(XX + dx, i * bh + dy, 1.5, bh)); X += 140 + r() * 160; }
    }
    x.fillStyle = 'rgba(40,40,38,0.55)';
    for (const Y of [bh * 1.5, bh * 4.5]) for (let X = 64; X < w; X += 128) { x.beginPath(); x.arc(X, Y, 2.5, 0, 6.28); x.fill(); }
  };
  // вереск (брезо): частые вертикальные стебли, светлые серые — цвет вершины (коричневые тона)
  const heath = (x, r, put, h, w) => {
    const pal = Array.from({ length: 32 }, (_, i) => { const s = 105 + i * 150 / 31; return `rgba(${Math.round(s)},${Math.round(s * 0.96)},${Math.round(s * 0.9)},0.85)`; });
    for (let i = 0; i < 11000; i++) {
      const X = r() * w, Y = r() * h, L = 10 + r() * 46;
      x.fillStyle = pal[Math.floor(r() * 32)];
      put(X, Y, 1.3, L, (dx, dy) => x.fillRect(X + dx, Y + dy, 1.3, L));
    }
  };
  // ламели: горизонтальные планки 12,5 см с тёмной щелью (белые, тёмно-серые, под дерево — цвет вершины)
  const slats = (x, r, put, h, w) => {
    const p = 16;
    for (let Y = 0; Y < h; Y += p) {
      const gr = x.createLinearGradient(0, Y + 2, 0, Y + p);
      gr.addColorStop(0, '#fbfbfb'); gr.addColorStop(0.15, '#f0f0f0'); gr.addColorStop(1, '#c8c8c8');
      x.fillStyle = gr; x.fillRect(0, Y + 2, w, p - 2);
    }
    specks(x, r, put, h, w, 1500, 2, r => `rgba(${r() < 0.5 ? '255,255,255' : '60,60,60'},${(r() * 0.08).toFixed(3)})`);
  };
  // доски (Corts d'Aragó 50): горизонтальные 21 см, волокна, торцевые стыки
  const wood = (x, r, put, h, w) => {
    const rh = h / 6;
    for (let i = 0; i < 6; i++) {
      const v = 0.92 + r() * 0.1;
      x.fillStyle = rgb(240 * v, 232 * v, 222 * v); x.fillRect(0, i * rh + 1, w, rh - 2);
      for (let k = 0; k < 70; k++) {
        const X = r() * w, Y = i * rh + 2 + r() * (rh - 4), L = 20 + r() * 120;
        x.fillStyle = `rgba(110,80,55,${(0.12 + r() * 0.25).toFixed(3)})`;
        put(X, Y, L, 1, (dx, dy) => x.fillRect(X + dx, Y + dy, L, 1));
      }
      let X = r() * 200;
      while (X < w) { const XX = X; x.fillStyle = 'rgba(60,45,35,0.7)'; put(XX, i * rh, 2, rh, (dx, dy) => x.fillRect(XX + dx, i * rh + dy, 2, rh)); X += 180 + r() * 220; }
    }
  };
  // лист (Corral d'en Fal 6): гладкий металл, вертикальные пазы через 50 см
  const sheet = (x, r, put, h, w) => {
    specks(x, r, put, h, w, 1500, 3, r => `rgba(${r() < 0.5 ? '255,255,255' : '80,80,80'},${(r() * 0.05).toFixed(3)})`);
    for (let X = 0; X < w; X += 64) { x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect(X, 0, 2, h); x.fillStyle = 'rgba(255,255,255,0.6)'; x.fillRect(X + 2, 0, 1, h); }
  };
  // misc: дверь старого города (Carreta 14: доски, рама, кольцо) и лицо общего столба (Arcadi Mas 21, Roma 11:
  // почтовый ящик, домофон, табличка с номером)
  const MH = 288;
  const misc = (x, r, put, h, w) => {
    specks(x, r, put, h, w, 2500, 3, r => `rgba(${r() < 0.5 ? '255,255,255' : '90,80,60'},${(r() * 0.08).toFixed(3)})`);
    const [d0, d1] = T.misc.door, top = h - Math.round(2.1 * PX);
    x.fillStyle = '#e8e4de'; x.fillRect(d0, top, d1 - d0, h - top);
    x.fillStyle = 'rgba(0,0,0,0.22)';
    for (let X = d0 + 16; X < d1; X += 16) x.fillRect(X, top, 2, h - top);
    x.strokeStyle = 'rgba(0,0,0,0.45)'; x.lineWidth = 6; x.strokeRect(d0 + 3, top + 3, d1 - d0 - 6, h - top - 3);
    x.fillStyle = '#2a2622'; x.beginPath(); x.arc((d0 + d1) / 2 + 30, h - 1.05 * PX, 4, 0, 6.28); x.fill();
    T.misc.plate.forEach(([p0, p1], i) => {
      const cx = (p0 + p1) / 2;
      x.fillStyle = '#5f5c57'; x.fillRect(cx - 15, h - 1.25 * PX, 30, 0.22 * PX);           // почтовый ящик
      x.fillStyle = '#2a2826'; x.fillRect(cx - 11, h - 1.2 * PX, 22, 2);                      // щель
      x.fillStyle = '#8a8884'; x.fillRect(cx - 6, h - 1.45 * PX, 12, 0.11 * PX);             // домофон
      x.fillStyle = '#2e4a8a'; x.fillRect(cx - 13, h - 1.75 * PX, 26, 18);                   // табличка с номером
      x.fillStyle = '#fbfbf8'; x.fillRect(cx - 11, h - 1.75 * PX + 2, 22, 14);
      x.fillStyle = '#2e4a8a'; x.font = 'bold 12px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(i ? '7' : '21', cx, h - 1.75 * PX + 9.5);
    });
  };

  /* ---------- полосы с альфой (от верха) ---------- */
  // сварная сетка (Arcadi Mas 21): рама сверху, прутья 5 × 2,5 мм через 6 и 20 см
  const mesh = (x, r, put, h, w) => {
    x.fillStyle = '#e4e4e4'; x.fillRect(0, 0, w, 6);
    for (let X = 3; X < w; X += 8) x.fillRect(X, 0, 2, h);
    for (let Y = 6 + 25.6; Y < h; Y += 25.6) x.fillRect(0, Y, w, 2);
  };
  // кованая решётка (Roma 11, ворота у (−706, 223)): прутья через 12,5 см с пиками, две перекладины, кольца между ними
  const wrought = (x, r, put, h, w) => {
    x.fillStyle = '#e6e6e6'; x.strokeStyle = '#e6e6e6'; x.lineWidth = 2.2;
    for (let X = 0; X < w; X += 16) {
      x.fillRect(X + 6, 8, 3, h - 8);
      x.beginPath(); x.moveTo(X + 7.5, 0); x.lineTo(X + 3, 10); x.lineTo(X + 12, 10); x.closePath(); x.fill();
      x.beginPath(); x.arc(X + 15.5, 29, 5, 0, 6.28); x.stroke();
    }
    x.fillRect(0, 14, w, 5); x.fillRect(0, 40, w, 4);
  };
  // перила блоков (кадр wicket (−1373, −372)): поручень, четыре трубы, стойки через 1 м
  const rail = (x, r, put, h, w) => {
    x.fillStyle = '#e8e8e8'; x.fillRect(0, 0, w, 7);
    for (const Y of [32, 58, 84, 110]) x.fillRect(0, Y, w, 4);
    for (let X = 60; X < w; X += 128) x.fillRect(X, 0, 6, h);
  };
  // кромка листвы над изгородью: внизу сплошная, вверх реже
  const LP = Array.from({ length: 32 }, (_, i) => { const s = 160 + i * 95 / 31; return rgb(s, s, s * 0.94); });
  const leaves = (x, r, put, h, w, n, rr, sz = [3, 4]) => {
    for (let i = 0; i < n; i++) {
      const X = r() * w, Y = rr(r), a = sz[0] + r() * sz[1], b = a * (0.5 + r() * 0.25), rot = r() * 3.14;
      x.fillStyle = LP[Math.floor(r() * 32)];
      put(X - a, Y - a, 2 * a, 2 * a, (dx, dy) => { x.beginPath(); x.ellipse(X + dx, Y + dy, a, b, rot, 0, 6.28); x.fill(); });
    }
  };
  const fringe = (x, r, put, h, w) => {
    x.fillStyle = '#9a9a96'; x.fillRect(0, h - 14, w, 14);
    leaves(x, r, put, h, w, 1700, r => h - 10 - Math.pow(r(), 1.7) * (h - 14));
  };
  // листва изгороди (плющ, туя): плотные листья, тёмные просветы
  const hedge = (x, r, put, h, w) => leaves(x, r, put, h, w, 6500, r => r() * h, [2, 2.8]);

  /* ---------- атласы ---------- */
  // полосы сверху вниз; у каждой — поля G px: у повторяющейся — продолжение рисунка, у «от верха» сверху пусто,
  // снизу — продолжение, у misc — крайние строки
  const atlas = list => {
    const H = list.reduce((s, b) => s + b.c.height + 2 * G, 0), c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d'), uv = {};
    let y = 0;
    for (const b of list) {
      const h = b.c.height;
      x.drawImage(b.c, 0, y + G);
      if (b.mode === 'wrap') { x.drawImage(b.c, 0, h - G, W, G, 0, y, W, G); x.drawImage(b.c, 0, 0, W, G, 0, y + G + h, W, G); }
      else if (b.mode === 'top') x.drawImage(b.c, 0, h - G, W, G, 0, y + G + h, W, G);
      else { x.drawImage(b.c, 0, 0, W, 1, 0, y, W, G); x.drawImage(b.c, 0, h - 1, W, 1, 0, y + G + h, W, G); }
      uv[b.name] = { v0: 1 - (y + G + h) / H, v1: 1 - (y + G) / H, m: h / PX };
      y += h + 2 * G;
    }
    return { c, uv };
  };
  const wrap = (name, bg, paint, seed) => ({ name, mode: 'wrap', c: tile(BH, bg, paint, seed) });
  const S = atlas([
    wrap('plaster', '#f3f0ea', plaster, 7), wrap('rubble', '#cbc1ae', rubble, 11), wrap('brick', '#cfc4b2', brick, 13),
    wrap('tile', '#b49a74', tileP, 17), wrap('concrete', '#bcbab3', concrete, 19), wrap('heath', '#d8d0c4', heath, 23),
    wrap('slats', '#2a2a2a', slats, 29), wrap('wood', '#5a4636', wood, 31), wrap('sheet', '#e9e9e7', sheet, 37),
    { name: 'misc', mode: 'edge', c: tile(MH, '#f3f0ea', misc, 41, false) },
  ]);
  const top = (name, h, paint, seed) => ({ name, mode: 'top', c: tile(h, null, paint, seed, false) });
  const A = atlas([top('mesh', 288, mesh, 43), top('wrought', 288, wrought, 47), top('rail', 128, rail, 53), top('fringe', 64, fringe, 59)]);
  const HP = 256;   // листва: 256 px на T.hedge м
  const hc = tile(HP, '#5a5b56', hedge, 61, true, HP);
  const tex = cv => { const t = canvasTex(cv); t.generateMipmaps = true; return t; };
  // атлас с альфой — свои мипмапы (4а.7): уменьшение canvas с учётом альфы (у GPU-мипмапов из canvas прозрачное —
  // чёрное, прутья вдали темнеют); средняя альфа уровня — доля покрытия (её берут alphaToCoverage и смешивание)
  const alpha = canvasTex(A.c);
  alpha.mipmaps = sitgesAlphaMips(A.c);
  alpha.generateMipmaps = false;
  return { solid: tex(S.c), alpha, hedge: tex(hc), uv: { ...S.uv, ...A.uv }, W, H: { solid: S.c.height, alpha: A.c.height } };
}

// цепочка мипмапов canvas до 1 × 1 (каждый уровень — уменьшение предыдущего вдвое)
function sitgesAlphaMips(c0) {
  const out = [c0];
  let prev = c0;
  while (prev.width > 1 || prev.height > 1) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, prev.width >> 1); c.height = Math.max(1, prev.height >> 1);
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.drawImage(prev, 0, 0, c.width, c.height);
    out.push(prev = c);
  }
  return out;
}
