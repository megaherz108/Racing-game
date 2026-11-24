// Ситжес — достопримечательность: парк Can Robert (шаг П3 плана парка, docs/sitges/park-canrobert.md).
// Зданий в SITGES_LM нет (at: []) — plan() ставит рамку L.bb и центр L.cx, L.cz по контуру парка (C.parks): отсюда
// значок 🌳 на мини-карте (mmMarks). Объекты парка (площадки, мостик, амфитеатр…) — build(); пока каркас (в работе).
// Определяет: SITGES_LM_CANROBERT.
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const SITGES_LM_CANROBERT = {
  ready: true,
  park: 'canrobert',                // id парка в C.parks (data-parks.js)

  plan(C, L) {
    const pk = (C.parks || []).find(p => p.id === this.park) || (C.parks || [])[0];
    if (!pk) return;
    const xs = pk.ring.map(q => q[0]), zs = pk.ring.map(q => q[1]);
    L.bb = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
    L.cx = (L.bb[0] + L.bb[1]) / 2; L.cz = (L.bb[2] + L.bb[3]) / 2; L.g = C.ground(L.cx, L.cz);
    L.park = pk;
  },

  build(K, L, group) {},
};
