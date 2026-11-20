// Ситжес — достопримечательность: рынок (Mercat Municipal de Sitges) (этап 6, docs/sitges/stage-5.md, архив — lm-c.md).
// По фото Street View (raw/photos/landmarks/market) это не дома над рынком, а один современный корпус «рынок +
// паркинг»: к Av. d'Artur Carbonell (−z) — белый короб с горизонтальными рёбрами, стеклянный первый этаж под тёмным
// выносным поясом, тёмная вставка из вертикальных ламелей на западном углу (часть 3); к Salvador Mirabent и с других
// сторон — бежевые каменные плиты внизу, тёмные жалюзийные пояса выше; восточный угол (часть 7, проезд h.pass) —
// круглый паркинг в тёмной ламельной сетке со светлыми поясами перекрытий, внизу открытый въезд (стены от h.y0 —
// над проездом, как у домов с проездом). Низкие части (1–2 эт.) — бежевые пристройки. Высоты — из кадастра.
// Определяет: SITGES_LM_MARKET.
// Использует: lmMat, lmBox, lmPrism, lmInset, lmCollide (js/maps/sitges/landmarks3d.js); lmCEdges, lmCOpen
//   (js/maps/sitges/lm/station.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const SITGES_LM_MARKET = {
  ready: true,
  plan(C, L) {},
  build(K, L, group) {
    const C = K.D.C, g = group;
    const white = lmMat(0xefeee9, { tex: 'plaster' }), rib = lmMat(0xcfcfcb), beige = lmMat(0xd9cdb5, { tex: 'stone' }),
      dark = lmMat(0x34383c, { rough: 0.6, metal: 0.3 }), glass = lmMat(0x2a3a42, { rough: 0.15, metal: 0.4 }), roof = lmMat(0xa9a59d);
    const face = (e, mat, y0, y1, out = 0.06, t = 0.1) => {
      const [mx, mz] = e.at(0.5);
      lmBox(g, mat, e.len + 0.02, y1 - y0, t, mx + e.nx * out, y0, mz + e.nz * out, e.rot);
    };
    const ribs = (e, mat, y0, y1, step, out = 0.14) => { for (let y = y0; y < y1 - 0.05; y += step) face(e, mat, y, y + 0.08, out, 0.12); };
    const slats = (e, mat, y0, y1, step) => {
      const n = Math.max(1, Math.round(e.len / step));
      for (let i = 0; i < n; i++) { const [x, z] = e.at((i + 0.5) / n); lmBox(g, mat, 0.12, y1 - y0, 0.18, x + e.nx * 0.1, y0, z + e.nz * 0.1, e.rot); }
    };
    for (const h of L.parts) {
      const ring = h.rings[0], base = h.base, y1 = h.y1, tall = h.p.floors >= 5;
      const park = h.pass, nw = !park && tall && lmFrame(ring).len < 12;          // часть 7 — паркинг; часть 3 — тёмная вставка
      lmPrism(g, park || nw ? dark : tall ? white : beige, ring, h.y0, y1 + 0.6, { cap: false, bottom: park });
      lmPrism(g, roof, lmInset(ring, 0.25), y1, y1 + 0.35);
      if (park) {
        // пояса перекрытий и вертикальная сетка по всему контуру (паркинг стоит отдельно)
        for (let y = h.y0; y < y1; y += 2.9) lmPrism(g, rib, lmInset(ring, -0.32), y, y + 0.35, { cap: false, bottom: true });
        for (const e of lmCEdges(ring)) if (lmCOpen(C, ...e.at(0.5), e, y1 - 1)) slats(e, dark, h.y0, y1 + 0.6, 0.8);
        lmCollide(K, ring, h.y0, y1 + 0.6);
        continue;
      }
      for (const e of lmCEdges(ring)) {
        const [mx, mz] = e.at(0.5);
        if (!lmCOpen(C, mx, mz, e, base + 1)) continue;                        // общая стена с соседом
        const north = e.nz < -0.4;                                             // к Artur Carbonell
        if (!tall) {
          if (north && e.len > 3) face(e, glass, base + 0.1, base + 3.6, 0.07);
          continue;
        }
        if (north && e.len > 3) {
          face(e, glass, base + 0.05, base + 4.2, 0.07);
          face(e, dark, base + 4.2, base + 5.0, 0.9, 1.8);                    // выносной пояс-навес
          if (nw) slats(e, dark, base + 5, y1 + 0.6, 0.45);
          else ribs(e, rib, base + 5.6, y1 + 0.4, 0.75);
        } else if (e.len > 2) {
          face(e, beige, h.y0, base + 5);
          face(e, dark, base + 5, base + 6.2, 0.1);
          face(e, beige, base + 6.2, base + 9);
          face(e, dark, base + 9, y1 + 0.3, 0.1);
          ribs(e, dark, base + 5.1, base + 6.2, 0.3, 0.18);
          ribs(e, dark, base + 9.1, y1 + 0.3, 0.35, 0.18);
          if (e.len > 6) lmBox(g, glass, 3, 2.6, 0.08, mx + e.nx * 0.13, base + 0.1, mz + e.nz * 0.13, e.rot);   // вход
        }
      }
      lmCollide(K, ring, h.y0 - 1, y1 + 0.6);
    }
  },
};
