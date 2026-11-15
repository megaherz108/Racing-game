// Побережье — РАСКЛАДКА: константы карты и порядок этапов. Итальянская деревня на холмах у моря, река с островом.
// Раскладка детерминирована: все случайности — от зерна rng() (mulberry32). Этапы получают общий контекст C
// (деструктуризацией в начале) и отдают новое через Object.assign(C, …) в конце.
//   coastPlanBase (здесь)        константы, зерно, шум
//   coastPlanTerrain             рельеф, море, река с островом, брод, обрыв, площадка порта (js/maps/coast/terrain.js)
//   coastPlanSites               площадки, улочки деревни, порт, маяк, винодельня, амфитеатр, зоны (js/maps/coast/sites.js)
//   coastPlanRoads               дороги: сплайны, профили, мосты и брод, вдавливание в рельеф (js/maps/coast/roads.js)
//   coastPlanVillage             дома деревни, фермы, рыбацкие дома (js/maps/coast/village.js)
//   coastPlanNature              лес, кипарисы, оливы, виноградники, тюки сена, кусты (js/maps/coast/nature.js)
//   coastPlanJumps               места для прыжков: обрушенный мост, скирды (js/maps/coast/jumps.js)
//   coastPlanMinimap             мини-карта (js/maps/coast/minimap.js)
// Оси: +Z — север (верх мини-карты), +X — запад (mmCanvas рисует +X слева). Море — на юге (−Z).
// Определяет: coastData, coastPlanBase.
// Использует: mulberry32, makeNoise (js/world.js); coastPlanTerrain (js/maps/coast/terrain.js); coastPlanSites
//   (js/maps/coast/sites.js); coastPlanRoads (js/maps/coast/roads.js); coastPlanVillage (js/maps/coast/village.js);
//   coastPlanNature (js/maps/coast/nature.js); coastPlanJumps (js/maps/coast/jumps.js); coastPlanMinimap
//   (js/maps/coast/minimap.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

/* =====================================================================
   КАРТА «ПОБЕРЕЖЬЕ»
   ===================================================================== */
function coastData() {
  const C = {};
  coastPlanBase(C);
  coastPlanTerrain(C);
  coastPlanSites(C);
  coastPlanRoads(C);
  coastPlanVillage(C);
  coastPlanNature(C);
  coastPlanJumps(C);
  coastPlanMinimap(C);
  const { HX, HZ, STEP, NX, NZ, H, ground, waterAt, wlAt, riverPts, lagoon, island, ford, cliff, port, coastZ, minimap, mmExt, mmBg } = C;
  // отрезки дорог по ~20 м — для превью режима на экране выбора (монеты на дорогах, js/ui.js)
  const roadSegs = [];
  for (const r of C.roads) for (let i = 0; i + 10 < r.N; i += 10) roadSegs.push({ x0: r.pts[i].x, z0: r.pts[i].z, x1: r.pts[i + 10].x, z1: r.pts[i + 10].z });
  // C целиком — для этапов постройки (сетка, расстояния до русла и т. п.)
  return { HX, HZ, STEP, NX, NZ, H, ground, waterAt, wlAt, riverPts, lagoon, island, ford, cliff, port, coastZ, minimap, mmExt, mmBg, roadSegs, C };
}

function coastPlanBase(C) {
  const rng = mulberry32(20261114), noise = makeNoise(rng);
  // играбельная область: 1000 м с запада на восток (X) и 1500 м с юга на север (Z)
  const HX = 500, HZ = 750;
  // главные места карты (по согласованному эскизу): пьяцца деревни, амфитеатр, винодельня, остров, порт, маяк
  const SITES = {
    piazza: [19, 436], amphi: [-331, 326], winery: [333, 326], island: [-31, -10], lighthouse: [333, -693],
    port: { x0: -265, x1: -45, z0: -626, z1: -556 }, pierX: -131,
  };
  Object.assign(C, { rng, noise, HX, HZ, SITES });
}
