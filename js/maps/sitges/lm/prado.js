// Ситжес — достопримечательность: Казино Прадо (Casino Prado Suburense) (этап 6, docs/sitges/stage-5.md, архив — lm-c.md).
// Вид по фото Commons (raw/photos/landmarks/prado): белая штукатурка, кирпичные (охристые) лопатки, пояса и рамки окон,
// внизу кирпичные арки на каменных столбах и каменный цоколь ≈ 1 м, кованый балкон; зал на углу Francesc Gumà
// (часть 0) — вальмовая крыша из черепицы на кирпичном зубчатом карнизе и большие панно-сграффито в кирпичных рамах
// между окнами; западные корпуса (1, 3) — двускатные. Часть 4 кадастра лежит внутри зала (ниже его стен) — не строится.
// Определяет: SITGES_LM_PRADO.
// Использует: sitgesInPoly (js/maps/sitges/geom.js); lmCPart, lmCEdges, lmCOpen (js/maps/sitges/lm/station.js);
//   lmMat, lmFrame, lmCollide, lmBox (js/maps/sitges/landmarks3d.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const SITGES_LM_PRADO = {
  ready: true,
  plan(C, L) {},
  build(K, L, group) {
    const C = K.D.C, g = group;
    const wall = lmMat(0xf3efe6, { tex: 'plaster' }), brick = lmMat(0xb27a4c, { tex: 'brick' }), stone = lmMat(0xbcb09a, { tex: 'stone' }),
      win = lmMat(0x26292c, { rough: 0.35 }), tile = lmMat(0xa95a38, { tex: 'tile' }), panel = lmMat(0xd9ad6c, { tex: 'plaster' });
    const st = { wall, trim: brick, plinth: stone, cap: brick, win, roof: tile, plinthH: 1.0, pil: 4.2, step: 4.2, ww: 1.1,
      garch: true, corn: 0.45, parapet: 0.8, pitch: 18 };
    // зал — самая большая часть; части, целиком лежащие внутри другой (ниже её стен), не строятся
    const hall = L.parts.reduce((a, h) => lmFrame(a.rings[0]).len * lmFrame(a.rings[0]).wid >= lmFrame(h.rings[0]).len * lmFrame(h.rings[0]).wid ? a : h);
    const inside = (h, o) => h !== o && h.rings[0].every(([x, z]) => sitgesInPoly(x, z, o.rings[0])) && h.y1 <= o.y1;
    for (const h of L.parts) {
      if (L.parts.some(o => inside(h, o))) { lmCollide(K, h.rings[0], h.y0 - 1, h.y1); continue; }
      const isHall = h === hall;
      lmCPart(K, g, h, Object.assign({}, st, {
        ground: h.p.floors > 1 ? 'door' : 'win',
        roofKind: isHall ? 'hip' : undefined,
        // в зале — через пролёт панно вместо окон верхних этажей
        skipWin: isHall ? (e, i, n, f) => f > 0 && i % 2 === 1 : null,
      }));
      if (!isHall) continue;
      const fh = (h.y1 - h.base) / h.p.floors;
      for (const e of lmCEdges(h.rings[0])) {
        const [mx, mz] = e.at(0.5);
        if (!lmCOpen(C, mx, mz, e, h.base + fh)) continue;
        const n = Math.max(1, Math.round(e.len / st.pil));
        for (let i = 1; i < n; i += 2) {
          const [x, z] = e.at((i + 0.5) / n), y = h.base + fh * 1.15, ph = h.y1 - y - 1.0;
          lmBox(g, brick, 2.6, ph + 0.5, 0.12, x + e.nx * 0.06, y - 0.25, z + e.nz * 0.06, e.rot);
          lmBox(g, panel, 2.1, ph, 0.12, x + e.nx * 0.1, y, z + e.nz * 0.1, e.rot);
        }
        // кованый балкон посередине длинной стены
        if (e.len > 12) {
          const [bx, bz] = e.at(0.5 / n + Math.floor(n / 2) / n), by = h.base + fh;
          lmBox(g, stone, 3.2, 0.18, 1.0, bx + e.nx * 0.5, by, bz + e.nz * 0.5, e.rot);
          lmBox(g, win, 3.2, 1.0, 0.05, bx + e.nx * 0.98, by + 0.18, bz + e.nz * 0.98, e.rot);
        }
      }
    }
  },
};
