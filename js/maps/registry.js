// Реестр карт: описание, генерация данных, постройка
// Определяет: MAP_INFO, DATA_GEN, BUILD, mapData, worlds, getData, getWorld, world, activateWorld.
// Использует: save (js/data.js); scene (js/world.js); Sky (js/sky.js); arenaData, buildArena (js/maps/arena.js);
//   cityData (js/maps/city/plan.js); buildCity (js/maps/city/build.js); forestData, buildForest (js/maps/forest.js);
//   coastData (js/maps/coast/plan.js); buildCoast (js/maps/coast/build.js); sitgesData (js/maps/sitges/plan.js);
//   buildSitges (js/maps/sitges/build.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

/* =====================================================================
   РЕЕСТР КАРТ
   ===================================================================== */
const MAP_INFO = {
  city: { name: 'Город на острове', desc: 'Большой остров, разрезанный каналом. На севере — Даунтаун с небоскрёбами, порт с кранами и контейнерами. На юге — парк с холмами и трамплинами, набережная с отелями и пляж. Через канал — два «горбатых» моста и разводной мост-трамплин. Старый город с брусчаткой и кривыми переулками, телебашня, стадион, ратуша, пирс с колесом обозрения.', size: '≈ 1900 × 1900 м' },
  forest: { name: 'Горный лес', desc: 'Холмы и перепады высот, хвойный лес, валуны, озеро в долине, грунтовое кольцо и серпантин на заснеженную вершину.', size: '≈ 520 × 520 м · перепад 70 м' },
  arena: { name: 'Тестовая арена', desc: 'Небольшая площадка с бочками и бетонными блоками — для проверки столкновений и управления.', size: '110 × 110 м' },
  sitges: { name: 'Ситжес', desc: 'Настоящий Ситжес (Каталония) по открытым данным: улицы OSM, дома по контурам и этажности кадастра. От гольфа Террамар до марины Айгуадольс. В работе — этап 0: плоская земля, дома коробками.', size: '≈ 3,7 × 2,0 км' },
  coast: { name: 'Побережье', desc: 'Итальянская деревня на холмах у моря: серпантин от порта к пьяцце, петляющая река с островом и пятью переправами, виноградники, оливы, горы вокруг. Всегда золотой час.', size: '1000 × 1500 м' },
};
const DATA_GEN = { city: cityData, forest: forestData, arena: arenaData, coast: coastData, sitges: sitgesData };
const BUILD = { city: buildCity, forest: buildForest, arena: buildArena, coast: buildCoast, sitges: buildSitges };
const mapData = {}, worlds = {};
const getData = id => mapData[id] || (mapData[id] = DATA_GEN[id]());
function getWorld(id) {
  if (!worlds[id]) { worlds[id] = BUILD[id](getData(id)); scene.add(worlds[id].group); }
  return worlds[id];
}
let world = null;
function activateWorld(id) {
  const w = getWorld(id);
  for (const o of Object.values(worlds)) o.group.visible = o === w;
  world = w;
  // небо, туман, свет, дальность прорисовки и погода (js/sky.js, js/weather.js); карта со своим временем суток
  // (world.tod) не слушает меню — ни время, ни дождь
  Sky.apply(w, w.tod || save.tod, w.tod ? false : save.rain);
}

