// Ситжес — достопримечательность: Edifici Miramar (Casa Aleix Vidal Quadras, бывший отель Miramar) (этап 5,
// docs/sitges/stage-5.md, архив — lm-b.md). Вид по фото (raw/photos/landmarks/miramar): неоклассический дворец в 4 этажа,
// лососево-розовая штукатурка, каменные лопатки на углах, профилированный карниз и низкий аттик, высокие окна с белыми
// ставнями, кованые балконы на консолях (2-й этаж — по всем окнам); низкий корпус в этаж к Fonollar — розовый, с большими
// окнами и балюстрадой террасы по крыше; малые двускатные корпуса — черепица. Помощники — группы B (lm/maricel.js).
// Определяет: SITGES_LM_MIRAMAR.
// Использует: lmBPart (js/maps/sitges/lm/maricel.js); lmMat (js/maps/sitges/landmarks3d.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const SITGES_LM_MIRAMAR = {
  ready: true,
  plan(C, L) {},
  build(K, L, group) {
    const M = {
      wall: lmMat(0xedbb9f, { tex: 'plaster' }), trim: lmMat(0xd8c7a6, { tex: 'stone' }), win: lmMat(0x2a2d31, { rough: 0.4 }),
      shut: lmMat(0xf2f0ea, { rough: 0.6 }), roof: lmMat(0xa95c3c, { tex: 'tile' }),
    };
    M.iron = M.win; M.bal = M.trim; M.base = M.trim;
    for (const h of L.parts) {
      const fl = h.p.floors;
      if (fl === 1 && h.roof.kind === 'flat') {
        // низкий корпус: большие окна, балюстрада по краю террасы
        lmBPart(K, group, h, { M, top: 'bal', corn: 0.3, kinds: ['rect'], ww: 2.2, wh: Math.min(2.6, h.y1 - h.base - 1.2), step: 3.6 });
        continue;
      }
      if (h.roof.kind === 'gable') {
        lmBPart(K, group, h, { M, top: 'roof', pitch: 22, quoins: true, kinds: ['rect', 'rect', 'rect'], ww: 1.0, wh: 1.9, step: 3.0, shut: true });
        continue;
      }
      // дворец и его башня: лопатки, карниз, аттик; балконы — 2-й этаж по всем окнам, выше — через одно
      lmBPart(K, group, h, { M, top: 'parapet', parapet: 0.7, corn: 0.5, quoins: true, ww: 1.1, wh: 2.2, whTop: 1.2, step: 2.9,
        kinds: ['rect', 'rect', 'rect'], shut: true, sill: true,
        bal: (e, f, i) => f === 1 && fl >= 3 ? true : f === 2 && fl >= 4 && i % 2 === 1 ? true : false });
    }
  },
};
