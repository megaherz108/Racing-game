// Ситжес — ПОСТРОЙКА: атлас надписей вывесок (этап 6а.2, docs/sitges/stage-6a.md, «Сессии и договор между ними»).
// sitgesSignAtlas(items) — items: уникальные { key, text, cat, brand, form, aspect } (aspect = w / h лица вывески);
//   → { map, glow, uv: Map(key → [u0, v0, u1, v1]), px, size: [W, H] }. Холсты canvas рисуются при загрузке заезда.
//   map — цвет (sRGB) с альфой: прозрачны поля вокруг букв отеля (letters), креста (cross) и зубцы фестона маркизы
//     (awning) — у материала alphaTest; остальное непрозрачно. Мипмапы свои (sitgesAlphaMips — без тёмной каймы
//     у прозрачного), анизотропия — максимум, как у атласов заборов (fencetex.js).
//   glow — что светится ночью, в своём цвете (готовая emissiveMap: emissive = белый × NIGHT_U), чёрное — не светится;
//     в половину разрешения map (свечение и так мягкое). Что светится — SITGES_SIGN.cat[…].glow: 'text' — буквы
//     (типовые, бары, банки, отели), 'all' — весь короб (супермаркеты, заправки), крест аптеки — сам крест.
//   uv['__solid'] — белая ячейка 16 px (без свечения): металл, ножки, корпуса — цвет из вершин (signs3d.js).
//   uv: v снизу вверх (flipY, как у всех текстур three.js): v0 — низ ячейки, v1 — верх. Флажок (blade) двусторонний:
//     обратной стороне брать u наоборот (u1 → u0), иначе надпись зеркальная.
// Ячейки: высота строки px (64, при нехватке места меньше) у вывесок с aspect ≥ 2, 2 строки — у почти квадратных,
//   4 — у узких (стела); ширина = высота × aspect. Упаковка полками по высоте, поля pad px (у непрозрачных — с
//   продолжением фона против протекания мипмапов). Лист 2048 px в ширину, в высоту — степень двойки до 2048, при
//   нехватке — 4096 (два листа одной текстурой).
// Видеопамять (RGBA8, мипмапы +1/3): лист 2048² — map 21,3 МБ + glow 1024² 5,3 МБ = 26,7 МБ; два листа (2048 × 4096) —
//   53,3 МБ. На ≈ 350 разных вывесок Ситжеса хватает одного листа при строке 48–64 px.
// Палитры: SITGES_SIGN — по виду заведения cat (фон, текст, шрифт, обводка, варианты по хешу ключа, полосы маркизы,
//   что светится); SITGES_BRANDS — по ключу бренда (цвета — из открытых источников, docs/sitges/sign-colors.md;
//   логотипы не рисуем — только цвета и название нашим шрифтом). Шрифты — системные Windows с запасными.
// Витрина атласа — tools/sitges/signs-show.js.
// Определяет: SITGES_SIGN_FONTS, SITGES_SIGN, SITGES_BRANDS, sitgesSignAtlas.
// Использует: canvasTex (js/maps/city/textures.js); sitgesAlphaMips (js/maps/sitges/fencetex.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

// шрифты: [начертание, семейство с запасными]
const SITGES_SIGN_FONTS = {
  black: ['900', '"Arial Black", "Segoe UI Black", "Helvetica Neue", Arial, sans-serif'],
  sans: ['bold', '"Segoe UI", "Helvetica Neue", Arial, sans-serif'],
  cond: ['bold', 'Bahnschrift, "Arial Narrow", "Segoe UI", Arial, sans-serif'],
  round: ['bold', '"Trebuchet MS", "Segoe UI", Verdana, sans-serif'],
  serif: ['bold', 'Georgia, Cambria, "Times New Roman", serif'],
  italic: ['italic bold', 'Georgia, Cambria, "Times New Roman", serif'],
  script: ['bold', '"Segoe Script", "Brush Script MT", "Lucida Handwriting", cursive'],
  impact: ['normal', 'Impact, Haettenschweiler, "Arial Black", sans-serif'],
};

const SITGES_SIGN = {
  px: [64, 56, 48, 40, 32],  // высота строки ячейки, px — от лучшей к меньшей (берётся первая, при которой всё влезает)
  sheet: 2048,               // ширина листа, px; высота — до 2 листов
  pad: 4,                    // поля ячеек, px
  glowScale: 0.5,            // разрешение маски свечения относительно map
  minSX: 0.7,                // сильнее не сжимать буквы по ширине — лучше мельче или в две строки
  awningVal: 0.42,           // фестон маркизы — нижняя доля высоты ячейки (надпись — на нём), зубцы — прозрачные
  // по виду заведения: font — ключ SITGES_SIGN_FONTS; vars — варианты [фон, текст, обводка?, шрифт?] (выбор по хешу
  // ключа вывески); upper — заглавные; glow — что светится ('text' | 'all'); neon — ореол букв (бары, клубы);
  // awn — полосы маркизы [полоса 1, полоса 2, надпись?] (фестон — цвета полосы 1, надпись — третий цвет, иначе цвета
  // полосы 2; одинаковые полосы — однотонный тент)
  cat: {
    restaurant: { font: 'serif', glow: 'text',
      vars: [['#5a1d22', '#f3e6c8'], ['#1f3d2c', '#efe4c6'], ['#22324a', '#f2ead6'], ['#f2ead8', '#7a1f24'], ['#3b2a20', '#e9c98a']],
      // по кадрам 6а.4 (набережная, старый город) тенты чаще однотонные светлые: кремовый, белый, жёлтый
      awn: [['#efe6cf', '#efe6cf', '#6e1c22'], ['#f6f3ea', '#f6f3ea', '#1f3350'], ['#e9c04a', '#e9c04a', '#3a2a18'],
        ['#efe6cf', '#e2d3b0', '#5a3a20'], ['#7d1f25', '#f1e9d8'], ['#1e4a34', '#f1e9d8'], ['#203a5c', '#f2ede3']] },
    cafe: { font: 'italic', glow: 'text',
      vars: [['#3e2a1e', '#f1e2c4'], ['#efe6d6', '#4a2e1f'], ['#1f4a44', '#f4ead4', null, 'script']],
      awn: [['#efe3cc', '#efe3cc', '#4a2e1f'], ['#1f4a44', '#f0e8d6'], ['#f6f3ea', '#f6f3ea', '#8c3b2a'], ['#4a2e1f', '#efe3cc']] },
    bar: { font: 'round', glow: 'text', neon: true,
      vars: [['#16130f', '#ffb347'], ['#121417', '#ff4f8b', null, 'script'], ['#1b1410', '#f3e2b8', null, 'serif'], ['#101820', '#4fe3ff']],
      awn: [['#1c1c1c', '#e8b04a'], ['#6a1424', '#f0e2c8']] },
    club: { font: 'impact', glow: 'text', neon: true, upper: true,
      vars: [['#0b0a10', '#ff3fb0'], ['#0a0c12', '#3ff0ff'], ['#0d0a12', '#b47bff']] },
    fastfood: { font: 'black', glow: 'all',
      vars: [['#d8261c', '#ffd23f'], ['#ffcf2e', '#c8211a'], ['#1d5fa8', '#ffffff']] },
    icecream: { font: 'script', glow: 'text',
      vars: [['#f6c7d4', '#7a3b2e'], ['#bfe6e0', '#2f4f6a'], ['#fff3d6', '#c2416b']],
      awn: [['#e86a92', '#fff6f0'], ['#4fb3a9', '#fffaf2']] },
    bakery: { font: 'italic', glow: 'text',
      vars: [['#f1e4c8', '#6a3b1d'], ['#5b3a22', '#f3dfb5'], ['#e8d2a6', '#3e2715', null, 'serif']],
      awn: [['#8a5a2b', '#f3e4c4'], ['#5b3a22', '#efe0c0']] },
    supermarket: { font: 'black', glow: 'all', vars: [['#ffffff', '#1d7a3a'], ['#1d7a3a', '#ffffff']] },
    convenience: { font: 'sans', glow: 'all', vars: [['#1f3f73', '#ffffff'], ['#ffffff', '#c0392b'], ['#2f7d32', '#ffffff']] },
    pharmacy: { font: 'sans', glow: 'text', vars: [['#ffffff', '#12893a'], ['#12893a', '#ffffff']], cross: '#19b54a' },
    bank: { font: 'cond', glow: 'text', vars: [['#1d2f55', '#ffffff'], ['#ffffff', '#1d2f55']] },
    fuel: { font: 'black', glow: 'all', upper: true, vars: [['#ffffff', '#c62828'], ['#1b4f9c', '#ffffff']] },
    hotel: { font: 'serif', glow: 'text',
      vars: [['#1e242b', '#e8c873'], ['#f4f0e6', '#1f2a3a'], ['#203040', '#f4f1ea']],
      letters: ['#f4f1ea', '#e8c873', '#d9dde2'] },
    shop: { font: 'sans', glow: 'text',
      vars: [['#20262e', '#f4f1ea'], ['#f3efe6', '#2a2f36', null, 'serif'], ['#6b2a2a', '#f4e9d8', null, 'serif'],
        ['#2d4a3a', '#f1ead8', null, 'round'], ['#e9e4da', '#8a3a1c', null, 'cond'], ['#0f1a2a', '#e6c068', null, 'italic']],
      awn: [['#2d4a3a', '#efe8d6'], ['#6b2a2a', '#f1e6d4'], ['#203a5c', '#f2ede3']] },
  },
};

// бренды (ключи договора): bg — фон, fg — буквы, line — обводка букв, bar — полосы внизу короба (снизу вверх),
// font, upper, name — как пишется (иначе — text из раскладки). Источники цветов — docs/sitges/sign-colors.md.
const SITGES_BRANDS = {
  mercadona: { bg: '#ffffff', fg: '#009660', font: 'black', upper: true, name: 'Mercadona' },
  caprabo: { bg: '#ffffff', fg: '#32b4e8', font: 'round', name: 'caprabo' },
  lidl: { bg: '#0050aa', fg: '#e60a14', line: '#fff000', font: 'black', name: 'Lidl' },
  aldi: { bg: '#001e78', fg: '#ffffff', bar: ['#c80000', '#00b4dc'], font: 'black', upper: true, name: 'Aldi' },
  dia: { bg: '#e30613', fg: '#ffffff', font: 'round', name: 'dia' },
  // магазин в Ситжесе — формата «Bonpreu ràpid»: тёмно-зелёный короб, белые буквы, жёлтая полоса (кадр 6а.4; цвета логотипа
  // сети — #a62e38 с белым, docs/sitges/sign-colors.md)
  bonpreu: { bg: '#1d4d32', fg: '#ffffff', bar: ['#f2c230'], font: 'black', name: 'bonpreu ràpid' },
  consum: { bg: '#f39400', fg: '#ffffff', font: 'round', name: 'Consum' },
  carrefour: { bg: '#ffffff', fg: '#004e9f', bar: ['#e3000f'], font: 'round' },
  supercor: { bg: '#ffffff', fg: '#ef3340', bar: ['#1d1d1b'], font: 'sans' },
  caixabank: { bg: '#ffffff', fg: '#000000', bar: ['#00a0df', '#ffcc00', '#e30613'], font: 'sans', name: 'CaixaBank' },
  bbva: { bg: '#001391', fg: '#ffffff', font: 'black', upper: true, name: 'BBVA' },
  sabadell: { bg: '#006dff', fg: '#ffffff', font: 'sans', name: 'Sabadell' },
  santander: { bg: '#ea1d25', fg: '#ffffff', font: 'sans', name: 'Santander' },
  repsol: { bg: '#ffffff', fg: '#001e37', bar: ['#ff4e4e', '#ff9518'], font: 'sans', name: 'Repsol' },
  q8: { bg: '#214199', fg: '#ffffff', bar: ['#ed1c2d', '#fcb72d'], font: 'black', name: 'Q8' },
  365: { bg: '#1d1d1b', fg: '#ffffff', font: 'black', name: '365' },
  clarel: { bg: '#ef7950', fg: '#ffffff', font: 'round', name: 'clarel' },
  womensecret: { bg: '#ffffff', fg: '#1a1a1a', font: 'serif', name: 'women\'secret' },
  // строения (вывески частей h.lm, signs.js — SITGES_SIGNS.lm): не бренды, цвета на глаз по кадрам 6а.4
  mercat: { bg: '#34383c', fg: '#ffffff', font: 'sans', name: 'mercat sitges' },
  prado: { bg: '#e2c48c', fg: '#8a3320', font: 'serif', upper: true },
  terramar: { bg: '#ffffff', fg: '#3b4047', font: 'sans', upper: true },
};

function sitgesSignAtlas(items) {
  const S = SITGES_SIGN, W = S.sheet, PAD = S.pad;
  const lum = hex => { const n = parseInt(hex.slice(1), 16); return (0.3 * (n >> 16) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255)) / 255; };
  const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

  // стиль вывески: цвета, шрифт, что светится
  const styleOf = it => {
    const C = S.cat[it.cat] || S.cat.shop, B = it.brand && SITGES_BRANDS[it.brand], hk = hash(it.key || '');
    const v = C.vars[hk % C.vars.length];
    const st = {
      bg: v[0], fg: v[1], line: v[2] || null, font: v[3] || C.font, upper: !!C.upper, glow: C.glow, neon: !!C.neon,
      bar: null, text: it.text || '', awn: C.awn ? C.awn[(hk >>> 8) % C.awn.length] : [v[0], v[1]],
      letter: C.letters ? C.letters[(hk >>> 4) % C.letters.length] : v[1], cross: C.cross || S.cat.pharmacy.cross,
    };
    if (B) {
      Object.assign(st, { bg: B.bg, fg: B.fg, line: B.line || null, font: B.font, upper: !!B.upper, bar: B.bar || null,
        neon: false, awn: [B.bg === '#ffffff' ? B.fg : B.bg, B.bg === '#ffffff' ? '#ffffff' : B.fg], letter: B.fg });
      if (B.name) st.text = B.name;
    }
    if (st.upper) st.text = st.text.toLocaleUpperCase('ca');
    // тёмные буквы на светлом фоне ночью не видны — светится короб (буквы на нём тёмные, как у настоящих коробов)
    if (st.glow === 'text' && lum(st.fg) < 0.3 && lum(st.bg) > lum(st.fg)) st.glow = 'all';
    return st;
  };

  // размер ячейки по форме и aspect: rows — во сколько строк высотой
  const cellOf = (it, px) => {
    if (it.form === 'solid') return { w: 16, h: 16 };
    const a = Math.max(0.15, it.aspect || 3), rows = a >= 2 ? 1 : a >= 0.7 ? 2 : 4;
    let h = rows * px, w = Math.round(h * a);
    if (w > W - 2 * PAD) { w = W - 2 * PAD; h = Math.max(8, Math.round(w / a)); }
    return { w, h };
  };

  // упаковка полками: сортировка по высоте, слева направо; null — не влезло в maxH
  const pack = (px, maxH) => {
    const cells = items.map((it, i) => ({ i, it, ...cellOf(it, px) }));
    const order = cells.slice().sort((a, b) => b.h - a.h || b.w - a.w);
    let x = 0, y = 0, shelf = 0;
    for (const c of order) {
      const cw = c.w + 2 * PAD, ch = c.h + 2 * PAD;
      if (x + cw > W) { y += shelf; x = 0; shelf = 0; }
      if (y + ch > maxH) return null;
      c.x = x + PAD; c.y = y + PAD; x += cw; shelf = Math.max(shelf, ch);
    }
    return { cells, used: y + shelf, px };
  };
  // белая ячейка (ключ '__solid'): металл и корпуса постройки (signs3d.js) — цвет из вершин, тот же материал
  items = [...items, { key: '__solid', form: 'solid', aspect: 1 }];
  let P = null;
  for (const sheets of [1, 2]) {
    for (const px of S.px) if ((P = pack(px, sheets * W))) break;
    if (P) break;
  }
  if (!P) throw new Error('sitgesSignAtlas: вывесок слишком много для двух листов');
  let H = 256; while (H < P.used) H *= 2;

  const map = document.createElement('canvas'); map.width = W; map.height = H;
  const GS = S.glowScale, glow = document.createElement('canvas');
  glow.width = Math.round(W * GS); glow.height = Math.round(H * GS);
  const mx = map.getContext('2d'), gx = glow.getContext('2d');
  gx.fillStyle = '#000'; gx.fillRect(0, 0, glow.width, glow.height);
  gx.scale(GS, GS);

  // ---------- текст: подбор размера, сжатия по ширине и числа строк ----------
  const fontStr = (f, size) => { const F = SITGES_SIGN_FONTS[f] || SITGES_SIGN_FONTS.sans; return `${F[0]} ${size}px ${F[1]}`; };
  const metric = (x, f, s) => {
    x.font = fontStr(f, 100);
    const m = x.measureText(s);
    return { w: m.width, a: Math.max(m.actualBoundingBoxAscent, 1), d: Math.max(m.actualBoundingBoxDescent, 0) };
  };
  // все разбиения слов на n строк (слов немного) — лучшее с наименьшей самой длинной строкой
  const splits = (words, n) => {
    if (n === 1) return [[words.join(' ')]];
    const out = [];
    for (let k = 1; k <= words.length - n + 1; k++)
      for (const rest of splits(words.slice(k), n - 1)) out.push([words.slice(0, k).join(' '), ...rest]);
    return out;
  };
  // → { lines, size, sx, m }: строки, кегль px, сжатие по ширине, метрики строк при кегле 100
  const fit = (x, text, f, bw, bh, maxLines = 2) => {
    const words = text.split(/\s+/).filter(Boolean);
    let best = null;
    for (let n = 1; n <= Math.min(maxLines, Math.max(1, words.length)); n++) {
      const cands = words.length > 7 && n > 1 ? [] : splits(words, n);
      for (const lines of cands) {
        const m = lines.map(l => metric(x, f, l));
        const a = Math.max(...m.map(q => q.a)), d = Math.max(...m.map(q => q.d)), lh = a + d;
        const tot = lh * n + (n - 1) * lh * 0.18, wmax = Math.max(...m.map(q => q.w));
        let size = 100 * bh / tot, sx = Math.min(1, bw / (wmax * size / 100));
        if (sx < S.minSX) { size *= sx / S.minSX; sx = S.minSX; }
        const score = size * Math.sqrt(sx) * (n > 1 ? 0.95 : 1);
        if (!best || score > best.score) best = { lines, size, sx, a, d, lh, score };
      }
    }
    return best;
  };
  // надпись в рамке (x0, y0, bw, bh) по центру
  const drawText = (x, text, f, x0, y0, bw, bh, color, o = {}) => {
    if (!text) return;
    const F = fit(x, text, f, bw, bh, o.lines || 2);
    if (!F) return;
    const k = F.size / 100, n = F.lines.length, gap = F.lh * 0.18 * k, lh = F.lh * k;
    const top = y0 + (bh - (lh * n + gap * (n - 1))) / 2;
    x.save();
    x.font = fontStr(f, F.size); x.textAlign = 'center'; x.textBaseline = 'alphabetic';
    x.lineJoin = 'round';
    F.lines.forEach((l, i) => {
      x.save();
      x.translate(x0 + bw / 2, top + i * (lh + gap) + F.a * k);
      x.scale(F.sx, 1);
      if (o.blur) { x.shadowColor = o.blurColor || color; x.shadowBlur = o.blur; }
      if (o.line) { x.strokeStyle = o.line; x.lineWidth = F.size * (o.lineW || 0.16); x.strokeText(l, 0, 0); }
      x.fillStyle = color; x.fillText(l, 0, 0);
      if (o.blur) { x.shadowBlur = 0; x.fillText(l, 0, 0); }
      x.restore();
    });
    x.restore();
  };

  // ---------- ячейки ----------
  const shade = (hex, k) => {   // k > 0 — светлее, < 0 — темнее
    const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255]
      .map(v => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k)));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  };
  const DIM = 0.55;   // яркость свечения фона короба относительно букв (glow 'all')

  // короб: фон с лёгким градиентом и кромкой, полосы бренда, надпись; g — проход маски свечения
  function board(x, st, c, g, o = {}) {
    const { w, h } = c, x0 = c.x, y0 = c.y, glowAll = st.glow === 'all';
    if (o.skipBg) { /* только надпись поверх уже нарисованного короба */ } else if (!g) {
      x.fillStyle = st.bg; x.fillRect(x0 - PAD, y0 - PAD, w + 2 * PAD, h + 2 * PAD);   // поля — продолжение фона
      const gr = x.createLinearGradient(0, y0, 0, y0 + h);
      gr.addColorStop(0, shade(st.bg, 0.1)); gr.addColorStop(1, shade(st.bg, -0.1));
      x.fillStyle = gr; x.fillRect(x0, y0, w, h);
      const e = Math.max(1, Math.round(h * 0.04));
      x.fillStyle = shade(st.bg, -0.35);
      x.fillRect(x0, y0, w, e); x.fillRect(x0, y0 + h - e, w, e); x.fillRect(x0, y0, e, h); x.fillRect(x0 + w - e, y0, e, h);
    } else if (glowAll) { x.fillStyle = shade(st.bg, DIM - 1); x.fillRect(x0, y0, w, h); }
    let ty = y0, th = h;
    if (st.bar && o.skipBg) th = h - st.bar.length * Math.max(2, Math.round(h * 0.09));
    if (st.bar && !o.noBar && !o.skipBg) {
      const bh = Math.max(2, Math.round(h * 0.09));
      st.bar.forEach((col, i) => {
        x.fillStyle = g ? (glowAll ? shade(col, DIM - 1) : '#000') : col;
        x.fillRect(x0, y0 + h - (i + 1) * bh, w, bh);
      });
      th = h - st.bar.length * bh;
    }
    const mH = th * 0.16, mW = Math.min(w * 0.06, th * 0.35);
    const fg = g ? (st.glow === 'none' ? '#000' : st.fg) : st.fg;
    drawText(x, o.text ?? st.text, st.font, x0 + mW, ty + mH, w - 2 * mW, th - 2 * mH, fg, {
      line: st.line ? (g ? (glowAll ? st.line : '#000') : st.line) : null,
      blur: st.neon ? th * (g ? 0.22 : 0.12) : 0, lines: o.lines,
    });
  }

  const c1Of = st => st.awn[0];
  // маркиза: полосы сверху, фестон с надписью внизу, зубцы фестона прозрачны
  function awning(x, st, c, g) {
    const { w, h } = c, x0 = c.x, y0 = c.y, vh = Math.round(h * S.awningVal), sh = h - vh;
    const [c1, c2] = st.awn, sw = Math.max(6, Math.round(sh * 0.45));
    if (!g) {
      x.fillStyle = c1; x.fillRect(x0 - PAD, y0 - PAD, w + 2 * PAD, sh + PAD);
      x.fillStyle = c2;
      for (let s = 0; s * sw < w; s += 2) x.fillRect(x0 + s * sw + sw, y0 - PAD, Math.min(sw, w - s * sw - sw), sh + PAD);
      // складки ткани: тень у верха
      const gr = x.createLinearGradient(0, y0, 0, y0 + sh);
      gr.addColorStop(0, 'rgba(0,0,0,0.28)'); gr.addColorStop(0.35, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.08)');
      x.fillStyle = gr; x.fillRect(x0, y0, w, sh);
      // фестон: полоса и полукруглые зубцы снизу
      const zh = Math.round(vh * 0.2), body = vh - zh;
      x.fillStyle = c1; x.fillRect(x0, y0 + sh, w, body);
      const nz = Math.max(3, Math.round(w / (zh * 2.6))), zw = w / nz;
      x.beginPath();
      for (let i = 0; i < nz; i++) x.ellipse(x0 + (i + 0.5) * zw, y0 + sh + body, zw / 2, zh, 0, 0, Math.PI);
      x.fill();
      x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(x0, y0 + sh, w, Math.max(1, Math.round(vh * 0.06)));
    }
    const zh = Math.round(vh * 0.2), body = vh - zh, m = body * 0.14, tc = st.awn[2] || st.awn[1];
    // ночью фестон слегка светится (подсветка снизу), тёмная надпись на светлом фестоне — тёмная на нём
    if (g) { x.fillStyle = shade(c1Of(st), -0.6); x.fillRect(x0, y0 + sh, w, body); }
    drawText(x, st.text, st.font, x0 + w * 0.04, y0 + sh + m, w * 0.92, body - 2 * m,
      g ? (lum(tc) < lum(c1Of(st)) ? '#000' : shade(tc, -0.2)) : tc, { lines: 1 });
  }

  // аптечный крест: зелёный греческий крест с белой кромкой и решёткой «светодиодов», вокруг прозрачно
  function cross(x, st, c, g) {
    const s = Math.min(c.w, c.h) * 0.96, cx = c.x + c.w / 2, cy = c.y + c.h / 2, a = s / 3;
    const path = () => {
      x.beginPath();
      x.moveTo(cx - a / 2, cy - s / 2); x.lineTo(cx + a / 2, cy - s / 2); x.lineTo(cx + a / 2, cy - a / 2);
      x.lineTo(cx + s / 2, cy - a / 2); x.lineTo(cx + s / 2, cy + a / 2); x.lineTo(cx + a / 2, cy + a / 2);
      x.lineTo(cx + a / 2, cy + s / 2); x.lineTo(cx - a / 2, cy + s / 2); x.lineTo(cx - a / 2, cy + a / 2);
      x.lineTo(cx - s / 2, cy + a / 2); x.lineTo(cx - s / 2, cy - a / 2); x.lineTo(cx - a / 2, cy - a / 2);
      x.closePath();
    };
    path();
    if (g) { x.fillStyle = st.cross; x.fill(); return; }
    x.fillStyle = '#e8efe9'; x.fill();
    x.save(); x.clip();
    x.fillStyle = st.cross;
    const e = s * 0.05;
    x.fillRect(cx - a / 2 + e, cy - s / 2 + e, a - 2 * e, s - 2 * e); x.fillRect(cx - s / 2 + e, cy - a / 2 + e, s - 2 * e, a - 2 * e);
    x.fillStyle = 'rgba(255,255,255,0.22)';
    const st2 = Math.max(3, s / 16);
    for (let yy = cy - s / 2; yy < cy + s / 2; yy += st2) for (let xx = cx - s / 2; xx < cx + s / 2; xx += st2)
      x.fillRect(xx + st2 * 0.3, yy + st2 * 0.3, st2 * 0.4, st2 * 0.4);
    x.restore();
  }

  // буквы отеля на прозрачном: тёмная кромка снизу-справа (объём), сами буквы — цвет letter
  function letters(x, st, c, g) {
    const m = c.h * 0.06;
    if (g) { drawText(x, st.text, st.font, c.x + m, c.y + m, c.w - 2 * m, c.h - 2 * m, st.letter, { lines: 1 }); return; }
    x.save(); x.translate(c.h * 0.03, c.h * 0.04);
    drawText(x, st.text, st.font, c.x + m, c.y + m, c.w - 2 * m, c.h - 2 * m, 'rgba(40,40,40,0.9)', { lines: 1 });
    x.restore();
    drawText(x, st.text, st.font, c.x + m, c.y + m, c.w - 2 * m, c.h - 2 * m, st.letter, { lines: 1 });
  }

  // стела: сверху панель с названием, ниже — корпус; у заправки — табло цен (светится)
  function totem(x, st, c, g) {
    const { w, h } = c, x0 = c.x, y0 = c.y, ph = Math.round(h * 0.34);
    if (!g) {
      x.fillStyle = '#3c3f44'; x.fillRect(x0 - PAD, y0 - PAD, w + 2 * PAD, h + 2 * PAD);
      const gr = x.createLinearGradient(x0, 0, x0 + w, 0);
      gr.addColorStop(0, '#4a4e54'); gr.addColorStop(0.5, '#5c6168'); gr.addColorStop(1, '#43474d');
      x.fillStyle = gr; x.fillRect(x0, y0, w, h);
    }
    board(x, st, { x: x0, y: y0, w, h: ph }, g, { lines: 3 });
    if (c.it.cat !== 'fuel') return;
    const rows = ['95', '98', 'Diesel'], rh = (h - ph) / (rows.length + 0.6), m = w * 0.08;
    rows.forEach((r, i) => {
      const yy = y0 + ph + rh * (0.3 + i), bh = rh * 0.8;
      if (!g) { x.fillStyle = '#16181b'; x.fillRect(x0 + m, yy, w - 2 * m, bh); }
      drawText(x, r, 'cond', x0 + m * 1.6, yy + bh * 0.25, w * 0.3, bh * 0.5, g ? '#000' : '#e9e9e9', { lines: 1 });
      const price = (1.45 + ((hash(c.it.key + r) % 40) / 100)).toFixed(3).replace('.', ',');
      drawText(x, price, 'cond', x0 + w * 0.46, yy + bh * 0.15, w * 0.54 - m * 1.6, bh * 0.7, '#ffb020', { lines: 1 });
    });
  }

  // навес АЗС: кромка в цветах бренда, название — у краёв длинной кромки дважды
  function canopy(x, st, c, g) {
    const twice = c.w / c.h > 14;
    if (!twice) { board(x, st, c, g); return; }
    board(x, st, c, g, { text: '' });
    const half = c.w / 2;
    for (const k of [0, 1]) {
      const sub = { x: c.x + k * half, y: c.y, w: half, h: c.h };
      board(x, st, sub, g, { skipBg: true });
    }
  }

  const draw = (x, c, g) => {
    const it = c.it;
    if (it.form === 'solid') { if (!g) { x.fillStyle = '#ffffff'; x.fillRect(c.x - PAD, c.y - PAD, c.w + 2 * PAD, c.h + 2 * PAD); } return; }
    const st = styleOf(it);
    c.st = st;
    const f = it.form;
    if (f === 'awning') awning(x, st, c, g);
    else if (f === 'cross') cross(x, st, c, g);
    else if (f === 'letters') letters(x, st, c, g);
    else if (f === 'totem') totem(x, st, c, g);
    else if (f === 'canopy') canopy(x, st, c, g);
    else board(x, st, c, g);   // board, blade и неизвестные
  };

  const uv = new Map();
  for (const c of P.cells) {
    draw(mx, c, false);
    draw(gx, c, true);
    uv.set(c.it.key, [c.x / W, 1 - (c.y + c.h) / H, (c.x + c.w) / W, 1 - c.y / H]);
  }

  const tex = (cv, mips) => {
    const t = canvasTex(cv, false);
    t.wrapT = THREE.ClampToEdgeWrapping;
    if (mips) { t.mipmaps = sitgesAlphaMips(cv); t.generateMipmaps = false; } else t.generateMipmaps = true;
    return t;
  };
  return { map: tex(map, true), glow: tex(glow, false), uv, px: P.px, size: [W, H] };
}
