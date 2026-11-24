# «Ситжес» — карта файлов

Что где лежит в `js/maps/sitges/` и `tools/sitges/`. Читать, когда нужно найти файл или понять порядок этапов;
статус и следующий шаг — в `docs/sitges-plan.md`. Где определено имя — `node tools/deps.js --who ИМЯ`.

## Данные и общая геометрия

- `data-*.js` — данные, их пишет `tools/sitges/build.js`. **Не читать и не искать по ним** (формат — в шапке файла
  и в скрипте-генераторе). `data-parks.js` (`SITGES_PARKS`) читает `parks.js` (шаг П1 парка Can Robert).
- `geom.js` — общая геометрия: `sitgesCells` (сетка по клеткам), `sitgesInPoly`, `sitgesArea` (площадь со знаком), `sitgesBBox`,
  `sitgesSeg`. Новый общий расчёт по контурам — сюда, а не копией в этап.

## Раскладка (по порядку; порядок задаёт `sitgesData()` в `plan.js`)

1. `plan.js` — распаковка, `sitgesHeight()`, сетка частей домов `C.partCells`.
2. `terrain.js` — сетка высот 2,5 м, море, пляжи, волнорезы, фон `outer()`. В конце — правки рельефа по порядку:
   набережная `stPromTerrain` (`st/promenade.js`), бастион `stSlopeTerrain` (`st/slopes.js`), парки
   `sitgesParkTerrain` (`parks.js`: рельеф по лидару 50 см внутри контура со сшивкой, настройки `SITGES_PARK`;
   `C.parks` — контур, сетка высот, покрытие, настил мостика, места объектов для покраски и строения парка).
3. `roads.js` — улицы и ж/д: склейка, ширина по участкам `C.parcels` и фасадам, тротуары `q.sw`; настройки `SITGES_R`.
4. `levels.js` — ровное полотно `sitgesEvenRoads()`, мосты от плеч подходов, путепроводы `C.unders`, насыпи и выемки.
5. `corners.js` — скруглённые углы `C.corners`, `cornersAt()`.
6. `carriage.js` — `carriageAt()`, `carriageNear()`.
7. `walks.js` — тротуары с обрезкой `C.walks` и углов `C.cornerWalks` (наружный край = линия забора).
8. `houses.js` — дома: высоты на рельефе, общие стены, фасады к улице, проезды; `C.houses`. Форма крыш — `roofs.js`
   (вызывается из `houses.js`).
9. `landmarks.js` — достопримечательности: `SITGES_LM`, `C.landmarks`, у частей домов `h.lm` (план — `stage-5.md`).
10. `styles.js` — стили фасадов (`sitgesPlanStyles`).
11. `fences.js` — где забор: линия, решение кусками, цепочки, разрез по участкам, пустые участки без забора →
    `C.fences`, `C.fenceLine`, `C.fenceLots`, `C.fenceStats`; настройки `SITGES_FENCE`.
12. `fencestyle.js` — стиль забора участка по году дома и району (`f.style`, доли `SITGES_FSTYLE`); отладка — `?fences`.
13. `gates.js` — места калиток и ворот `C.gates` по `data-gates.js` и воротам OSM; `SITGES_GATE`.
14. `trees.js` — деревья: место, порода по таблице улиц `SITGES_TREE`, размер → `C.trees`.
15. `styles.js`, `sitgesPlanFacades` — балконы и карнизы (`C.balconies`, `C.cornices`); балкон — по `sitgesBalcony()`,
    то же правило в шейдере.
16. `signs.js` — вывески: `C.signs` по `data-venues.js` и вывески строений `SITGES_SIGNS.lm` (договор — `stage-6a.md`).
17. `doors.js` — входные двери `C.doors`.
18. `street.js` — мелочи улиц, этап 7 (`stage-7.md`): линии мест, занятость `S.reserve` / `S.free`, `C.street`;
    группы A–G — `st/*.js` (`SITGES_ST_A…G`, по порядку A → G).
19. `minimap.js` — `sitgesPaint()`.

## Постройка (`build.js`)

- `ground.js` — текстура земли, чанки рельефа, море, валуны, понтоны.
- `roads3d.js` — набор `K.rk`, полотно, потом разметка и мосты; меши и `walkAt`. С ним:
  - `walks3d.js` — тротуары и углы, их сетка столкновений, кромка `rk.edges`;
  - `fences3d.js` — заборы по видам, столбы, створки по `C.gates`, столкновения; высота — из `rk.edges`;
    текстуры-атласы — `fencetex.js`;
  - `facades3d.js` — балконы и карнизы по `C.balconies` / `C.cornices`, `SITGES_FAC3D`;
  - `rail3d.js` — ж/д с оградой, тумбы, стена по границе.
- `buildings.js` — стены кусками по `C.houses`, коллайдеры; крыши — `roofs3d.js`; материал — `facade.js` (окна,
  ставни, черепица в шейдере, атрибуты `aFac`, `aSty`).
- `trees3d.js` — модели деревьев (формы пород для инстансов, `sitgesTreeKit()`, `sitgesTreeMats()`) и постройка
  `sitgesBuildTrees()`: ближние модели у камеры, дальние склеены квадратами, растворение на границе в шейдере;
  пороги `QUAL.trees`; все деревья сбиваемые, масса — по объёму ствола (`sitgesTreeBrk`).
- `landmarks3d.js` — постройка достопримечательностей и помощники `lm*`; модели — `lm/<id>.js`.
- `signtex.js` — атлас надписей; `signs3d.js` — постройка вывесок и дверей.
- `street3d.js` — постройка мелочей улиц (`S.place`, `S.lights`).
- `trafficnet.js` — граф трафика (этап 8): `sitgesTrafficGraph(C, grid, ground)`, настройки `SITGES_NET`; строится при
  заезде, раскладку не меняет.
- `labels.js` — подписи адресов над домами для отладки (`save.addr`, клавиша L, данные `data-addr.js`).

## Инструменты `tools/sitges/`

Конвейер данных:
- `download.js` — OSM и точки OSM, кадастр (здания, участки, адреса), рельеф ICGC, плитки ортофото и лидара
  «рельеф + здания» в `raw/` (не в git); для парков — плитки 128 м `dtm/`, `srf/`, `orto25/` только у их рамок.
  `SITGES_RAW` — папка сырых данных для git worktree.
- `overture.py` — места Overture Maps по прямоугольнику → JSON (вызывает `download.js` интерпретатором `raw/.venv`).
- `read-*.js` — разбор: `read-osm.js` (OSM в UTM), `read-catastro.js` (GML кадастра), `read-dtm.js` (рельеф 5 м),
  `read-venues.js` (заведения сверх OSM: Overture, реестр туризма, `venues-extra.json`), `read-roofs.js` (тип и цвет крыш → `data-roofs.js`), `read-gates.js` (входы, окна
  съездов по ортофото, служебные проезды → `data-gates.js`), `read-trees.js` (деревья из лидара «поверхность» −
  «рельеф + здания», маска ИК, запасной лидар за ж/д → `data-trees.js`), `read-parks.js` (парки из списка `PARKS`:
  сетка высот 2,5 м по лидару 50 см, покрытие 1 м по ортофото, настил мостика, места объектов → `data-parks.js`;
  план — `park-canrobert.md`).
- `build.js` — `raw/` → `js/maps/sitges/data-*.js`; `geo.js` (UTM, поворот), `util.js` (упаковка, упрощение), `png.js`.
- `streetview.js` — фото-образцы Street View в `raw/photos/sv/`, ключ `raw/gmaps-key.txt` (как добывать — `photos.md`).
- Листы проверки: `roofs-sheet.js` (крыши), `trees-sheet.js` (деревья), `parks-sheet.js` (парки: отмывка, покрытие,
  `srf − dtm`, места объектов), `sheets.py` (обзоры кадров).

Проверка и отладка (подключаются через `node tools/cdp.js --inject …`):
- `check.js` — `__sitgesCheck()`, `__sitgesShots()`, эталон `check-base.json`.
- `fence-debug.js` — заборы: `__fenceMap`, `__fenceShots`, `__sitgesFind` (схема и кадр у адреса).
- `lm-debug.js` — строения: `__lmInfo`, `__lmMap`, `__lmShots`.
- `sign-debug.js` — вывески: `__signMap`, `__signInfo`, `__signShots` (кадры у вывески).
- `traffic-debug.js` — граф трафика: `__netInfo` (сводка), `__netMap` (схема сверху), `__netGraph`.
- `street-debug.js` — мелочи улиц: `__stInfo`, `__stMap`, `__stShots`, тестовая группа `__stDemo`.
- `signs-show.js` — витрина атласа вывесок (≈ 40 образцов).
- `trees-show.js` — витрина моделей деревьев; `trees-shots.js` — кадры раскладки деревьев.
