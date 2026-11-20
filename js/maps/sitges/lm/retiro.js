// Ситжес — достопримечательность: El Retiro (казино-театр, Societat Recreativa) (этап 6, docs/sitges/stage-5.md,
// архив — lm-c.md). Вид по фото Commons (raw/photos/landmarks/retiro): к Carrer d'Àngel Vidal — «новое здание» 4–5 эт.:
// бежевая штукатурка, первый этаж облицован бежевыми каменными блоками, витрины и вход внизу, окна в белых рамах,
// зелёная вывеска с лирой; в глубине участка — зал и пристройки 1–2 эт.: белёные стены, вальмовые и двускатные крыши
// из красной черепицы (фасады к саду). Части и высоты — из кадастра (19 частей).
// Определяет: SITGES_LM_RETIRO.
// Использует: lmCPart, lmCEdges, lmCOpen (js/maps/sitges/lm/station.js); lmMat, lmFrame, lmBox
//   (js/maps/sitges/landmarks3d.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const SITGES_LM_RETIRO = {
  ready: true,
  plan(C, L) {},
  build(K, L, group) {
    const C = K.D.C, g = group;
    const beige = lmMat(0xe3d0ae, { tex: 'plaster' }), stone = lmMat(0xd2c2a2, { tex: 'stone' }), white = lmMat(0xf5f3ee, { tex: 'plaster' }),
      win = lmMat(0x2a2d30, { rough: 0.35 }), tile = lmMat(0xb2553a, { tex: 'tile' }), green = lmMat(0x1f6a4c, { rough: 0.5 });
    const tall = { wall: beige, trim: white, plinth: stone, cap: stone, win, roof: tile, plinthH: 3.4, step: 3.0, ww: 1.2,
      ground: 'shop', corn: 0.2, parapet: 0.9, pitch: 22 };
    const low = { wall: white, trim: beige, plinth: beige, cap: white, win, roof: tile, plinthH: 0.6, step: 4.0, ww: 1.0,
      ground: 'win', corn: 0.35, parapet: 0.6, pitch: 22, arch: true };
    let main = null;
    for (const h of L.parts) {
      const isTall = h.p.floors >= 3;
      lmCPart(K, g, h, isTall ? tall : low);
      if (isTall && (!main || h.p.floors * lmFrame(h.rings[0]).len > main.p.floors * lmFrame(main.rings[0]).len)) main = h;
    }
    // вывеска с лирой — на самой большой высокой части, на открытой стене к улице (самое длинное открытое ребро)
    if (main) {
      let best = null;
      for (const e of lmCEdges(main.rings[0])) { const [mx, mz] = e.at(0.5); if (lmCOpen(C, mx, mz, e, main.base + 1) && (!best || e.len > best.len)) best = e; }
      if (best) {
        const [x, z] = best.at(0.5), y = main.base + 3.6;
        lmBox(g, green, 3.2, 1.0, 0.12, x + best.nx * 0.12, y, z + best.nz * 0.12, best.rot);
        lmBox(g, green, 1.0, 1.6, 0.12, x + best.nx * 0.12 + best.dx * 2.6, y + 0.2, z + best.nz * 0.12 + best.dz * 2.6, best.rot);
      }
    }
  },
};
