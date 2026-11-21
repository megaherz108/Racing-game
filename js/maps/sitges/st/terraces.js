// Ситжес — этап 7, группа F: террасы (план — docs/sitges/stage-7.md, архив группы — docs/sitges/st-f.md).
// Что входит: столики, стулья, зонты, кадки и штендеры у заведений C.signs / C.doors; тенты набережной (правка signs3d.js).
// Заготовка каркаса 7.0: пока ready = false, раскладка и постройка группу не вызывают — карта не меняется.
// Договор (docs/sitges/stage-7.md, «Каркас»):
//   plan(C, S) — раскладка (js/maps/sitges/street.js, группы по порядку A → G): места — помощники S (C.street),
//     занятое — S.reserve(…, 'F'); вернуть данные группы (только данные, без функций) → C.street.groups.F.
//   build(K, S, L) — постройка (js/maps/sitges/street3d.js): S — помощники постройки (K.st), L — данные из plan.
// Свои глобальные имена — с префиксом stTerr… (после — node tools/deps.js --headers).
// Определяет: SITGES_ST_F.
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const SITGES_ST_F = {
  id: 'F', name: 'террасы', ready: false,
  plan(C, S) { return {}; },
  build(K, S, L) {},
};
