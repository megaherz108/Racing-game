// Витрина атласа вывесок «Ситжеса» (этап 6а.2): ≈ 40 образцов — все бренды, все виды заведений (cat) и формы (form),
// короткие и длинные названия, каталанские и испанские буквы с диакритикой; строит sitgesSignAtlas() и отдаёт картинки.
// Не часть игры (для tools/cdp.js):
//   node tools/cdp.js --inject tools/sitges/signs-show.js --eval "await __signsShow()" --dir tools/sitges/raw/signs-show
// __signsShow() → { png, px, size, n }:
//   png.atlas — map поверх серого (видно прозрачное), png.glow — маска свечения, png.sheet — лист образцов:
//   у каждого вывеска днём и ночью (map × 0,15 + glow) в своих пропорциях и подпись form | cat | brand;
//   px — высота строки ячейки, size — размер атласа.
(() => {
  // [form, cat, brand, text, aspect]
  const S = [
    ['board', 'supermarket', 'mercadona', 'Mercadona', 7],
    ['totem', 'supermarket', 'mercadona', 'Mercadona', 0.3],
    ['board', 'supermarket', 'caprabo', 'Caprabo', 5],
    ['board', 'supermarket', 'lidl', 'Lidl', 3],
    ['totem', 'supermarket', 'lidl', 'Lidl', 0.35],
    ['board', 'supermarket', 'aldi', 'ALDI', 4],
    ['board', 'supermarket', 'dia', 'Dia', 4],
    ['board', 'supermarket', 'bonpreu', 'Bonpreu', 5],
    ['board', 'supermarket', 'consum', 'Consum', 5],
    ['board', 'supermarket', 'carrefour', 'Carrefour Express', 6],
    ['board', 'supermarket', 'carrefour', 'Carrefour Market', 6],
    ['board', 'supermarket', 'supercor', 'Supercor Exprés', 6],
    ['board', 'bank', 'caixabank', 'Caixabank', 5],
    ['blade', 'bank', 'caixabank', 'Caixabank', 1],
    ['board', 'bank', 'bbva', 'BBVA', 4],
    ['board', 'bank', 'sabadell', 'Banc Sabadell', 5],
    ['board', 'bank', 'santander', 'Banco Santander', 6],
    ['canopy', 'fuel', 'repsol', 'Repsol', 16],
    ['totem', 'fuel', 'repsol', 'Repsol', 0.33],
    ['canopy', 'fuel', 'q8', 'Q8', 10],
    ['totem', 'fuel', 'q8', 'Q8', 0.33],
    ['board', 'bakery', '365', '365', 3],
    ['board', 'shop', 'clarel', 'Clarel', 4],
    ['board', 'shop', 'womensecret', 'Women\'secret', 6],
    ['board', 'restaurant', null, 'El Xiringuito', 6],
    ['awning', 'restaurant', null, 'Restaurant La Cúpula del Mar', 4],
    ['awning', 'restaurant', null, 'Fragata', 3.5],
    ['board', 'restaurant', null, 'Restaurante Pizzería L\'Àvia Montserrat i Família', 6],
    ['board', 'cafe', null, 'Cafè de l\'Òpera', 4],
    ['awning', 'cafe', null, 'Granja Elena', 3],
    ['board', 'bar', null, 'Bar', 2.5],
    ['blade', 'bar', null, 'Pub Parrots', 1.3],
    ['blade', 'club', null, 'Queenz', 1.6],
    ['board', 'club', null, 'Organic Club', 5],
    ['board', 'fastfood', null, 'Döner Kebab', 4],
    ['board', 'icecream', null, 'Gelateria Niño', 4],
    ['awning', 'icecream', null, 'Heladería', 3],
    ['board', 'bakery', null, 'Forn de Pa Sant Bartomeu', 5],
    ['board', 'convenience', null, 'Supermercat Alimentació Ñandú', 6],
    ['board', 'pharmacy', null, 'Farmàcia', 4],
    ['cross', 'pharmacy', null, '', 1],
    ['letters', 'hotel', null, 'Hotel Terramar', 8],
    ['letters', 'hotel', null, 'MiM Sitges', 5],
    ['board', 'hotel', null, 'Hotel Calípolis', 6],
    ['board', 'bank', null, 'Caixa d\'Enginyers', 5],
    ['board', 'fuel', null, 'Gasolinera', 6],
    ['board', 'shop', null, 'Perruqueria', 4],
    ['board', 'shop', null, 'Fruiteria', 3.5],
    ['board', 'shop', null, 'Bodega', 3],
    ['board', 'shop', null, 'Llibreria i Papereria Sitgetana', 5],
    ['awning', 'shop', null, 'Botiga', 3],
  ];

  window.__signsShow = async () => {
    const items = S.map(([form, cat, brand, text, aspect]) => ({ key: [form, cat, brand || '', text].join('|'), form, cat, brand, text, aspect }));
    const A = sitgesSignAtlas(items);
    const map = A.map.image, glow = A.glow.image, [W, H] = A.size;
    const png = {};

    // атлас поверх серого (прозрачное видно)
    const c1 = document.createElement('canvas'); c1.width = W; c1.height = H;
    const x1 = c1.getContext('2d');
    x1.fillStyle = '#7d848c'; x1.fillRect(0, 0, W, H); x1.drawImage(map, 0, 0);
    png.atlas = c1.toDataURL('image/png');
    png.glow = glow.toDataURL('image/png');

    // лист образцов: строка — день | ночь | подпись; высота вывески 90 px (узкие — выше)
    const SW = 1500, rows = [];
    let y = 10;
    for (const it of items) {
      const [u0, v0, u1, v1] = A.uv.get(it.key);
      const sx = u0 * W, sy = (1 - v1) * H, sw = (u1 - u0) * W, sh = (v1 - v0) * H;
      let h = it.aspect < 0.7 ? 300 : it.aspect < 2 ? 150 : 90, w = h * it.aspect;
      if (w > 560) { w = 560; h = w / it.aspect; }
      rows.push({ it, sx, sy, sw, sh, w, h, y });
      y += h + 16;
    }
    const c2 = document.createElement('canvas'); c2.width = SW; c2.height = y + 10;
    const x2 = c2.getContext('2d');
    x2.fillStyle = '#8a9096'; x2.fillRect(0, 0, 600, c2.height);
    x2.fillStyle = '#0d1016'; x2.fillRect(600, 0, 600, c2.height);
    x2.fillStyle = '#f4f4f4'; x2.fillRect(1200, 0, SW - 1200, c2.height);
    x2.imageSmoothingQuality = 'high';
    for (const r of rows) {
      x2.drawImage(map, r.sx, r.sy, r.sw, r.sh, 20, r.y, r.w, r.h);
      // ночь: тёмная копия map и свечение сверху
      x2.save(); x2.globalAlpha = 0.15; x2.drawImage(map, r.sx, r.sy, r.sw, r.sh, 620, r.y, r.w, r.h); x2.restore();
      x2.save(); x2.globalCompositeOperation = 'lighter';
      const g = 0.5;   // glowScale
      x2.drawImage(glow, r.sx * g, r.sy * g, r.sw * g, r.sh * g, 620, r.y, r.w, r.h); x2.restore();
      x2.fillStyle = '#222'; x2.font = '14px Consolas, monospace';
      x2.fillText(`${r.it.form} | ${r.it.cat} | ${r.it.brand || '—'}`, 1210, r.y + 18);
      x2.fillText(`«${r.it.text}» a=${r.it.aspect}`, 1210, r.y + 38);
    }
    // лист длинный — режем на части по ≈ 1400 px
    let part = 0;
    for (let y0 = 0; y0 < c2.height; y0 += 1400) {
      const c3 = document.createElement('canvas'); c3.width = SW; c3.height = Math.min(1400, c2.height - y0);
      c3.getContext('2d').drawImage(c2, 0, -y0);
      png['sheet' + (++part)] = c3.toDataURL('image/png');
    }
    return { png, px: A.px, size: A.size, n: A.uv.size };
  };
})();
