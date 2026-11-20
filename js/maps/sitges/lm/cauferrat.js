// Ситжес — достопримечательность: Кау-Ферран (Museu del Cau Ferrat, дом-мастерская Русиньоля) (этап 5,
// docs/sitges/stage-5.md, архив — lm-b.md). Две части кадастра: у Carrer de Fonollar (2 этажа) и над морем (3 этажа
// от скалы, низ ≈ 0,4). Вид по фото (raw/photos/landmarks/cauferrat): белая штукатурка, окна в каменных рамах,
// готическое окно-двойня на втором этаже, арочная дверь, решётчатые окна внизу, черепичный свес; к морю — стена прямо
// на скале (бутовый низ), окна, кованый балкон. Помощники — группы B (js/maps/sitges/lm/maricel.js).
// Определяет: SITGES_LM_CAUFERRAT.
// Использует: lmBPart (js/maps/sitges/lm/maricel.js); lmMat (js/maps/sitges/landmarks3d.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const SITGES_LM_CAUFERRAT = {
  ready: true,
  plan(C, L) {},
  build(K, L, group) {
    const M = {
      wall: lmMat(0xf4f1ea, { tex: 'plaster' }), trim: lmMat(0xcaa673, { tex: 'stone' }), win: lmMat(0x2a2d31, { rough: 0.4 }),
      roof: lmMat(0xa95c3c, { tex: 'tile' }), base: lmMat(0xb9a78a, { tex: 'rubble' }),
    };
    M.iron = M.win;
    for (const h of L.parts) {
      const seaPart = h.y0 < h.base - 2;
      lmBPart(K, group, h, { M, plinth: true, top: 'eave', ww: 1.2, wh: 1.7, step: 3.4, sill: true,
        kinds: [seaPart ? 'rect' : (e, f, i) => i === 0 ? 'arch' : 'rect', 'twin', 'gothic'], groundBig: !seaPart,
        // к морю — кованый балкон на верхнем этаже посередине
        bal: (e, f, i, n) => seaPart && e.nz < -0.5 && f === h.p.floors - 1 && i === Math.floor(n / 2) ? 2.6 : false });
    }
  },
};
