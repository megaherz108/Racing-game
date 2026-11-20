// Ситжес — достопримечательность: башня Клот-дельс-Фрарес (Torre del Clot dels Frares) (этап 6, docs/sitges/stage-5.md).
// Не строится: башня за северной границей карты. По OSM (way 805487031, man_made=tower, defensive) контур ≈ 8 × 8 м
// с центром (1752, 961) в координатах игры; граница карты при x = 1752 — z ≈ 530 (getData('sitges').northAt),
// то есть башня в ≈ 430 м за ней (inside() — false). Расширят карту — делать по контуру OSM, см. docs/sitges/lm-d.md.
// Заготовка: ready: false — на месте остаётся дом кадастра. Как устроен объект строения — js/maps/sitges/landmarks.js
// (раскладка, C.landmarks) и js/maps/sitges/landmarks3d.js (постройка и помощники lm*).
// Определяет: SITGES_LM_CLOT.
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const SITGES_LM_CLOT = {
  ready: false,
  // своя раскладка строения (C — контекст раскладки, L — запись C.landmarks); результат — в L
  plan(C, L) {},
  // модель и столкновения: меши — в group, коллайдеры — lmCollide(K, …)
  build(K, L, group) {},
};
