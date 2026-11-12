// Реестр карт: описание, генерация данных, постройка
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

/* =====================================================================
   РЕЕСТР КАРТ
   ===================================================================== */
const MAP_INFO = {
  city: { name: 'Город на острове', desc: 'Большой остров, разрезанный каналом. На севере — Даунтаун с небоскрёбами, порт с кранами и контейнерами. На юге — парк с холмами и трамплинами, набережная с отелями и пляж. Через канал — два «горбатых» моста и разводной мост-трамплин. Старый город с брусчаткой и кривыми переулками, телебашня, стадион, ратуша, пирс с колесом обозрения.', size: '≈ 1900 × 1900 м' },
  forest: { name: 'Горный лес', desc: 'Холмы и перепады высот, хвойный лес, валуны, озеро в долине, грунтовое кольцо и серпантин на заснеженную вершину.', size: '≈ 520 × 520 м · перепад 70 м' },
  arena: { name: 'Тестовая арена', desc: 'Небольшая площадка с бочками и бетонными блоками — для проверки столкновений и управления.', size: '110 × 110 м' },
};
const DATA_GEN = { city: cityData, forest: forestData, arena: arenaData };
const BUILD = { city: buildCity, forest: buildForest, arena: buildArena };
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
  Sky.apply(w, save.tod);          // небо, туман, свет и дальность прорисовки по времени суток (js/sky.js)
}

