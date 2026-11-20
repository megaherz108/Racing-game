// Ситжес — достопримечательность: Mercat Vell (старый рынок у ратуши) (этап 5, docs/sitges/stage-5.md).
// Заготовка: ready: false — на месте остаётся дом кадастра. Как устроен объект строения — js/maps/sitges/landmarks.js
// (раскладка, C.landmarks) и js/maps/sitges/landmarks3d.js (постройка и помощники lm*).
// Определяет: SITGES_LM_MERCATVELL.
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const SITGES_LM_MERCATVELL = {
  ready: false,
  // своя раскладка строения (C — контекст раскладки, L — запись C.landmarks); результат — в L
  plan(C, L) {},
  // модель и столкновения: меши — в group, коллайдеры — lmCollide(K, …)
  build(K, L, group) {},
};
