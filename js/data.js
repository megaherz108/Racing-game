// Данные машин, характеристики → физика, сохранение
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

/* =====================================================================
   DATA
   ===================================================================== */
const STATS = [
  ['speed', 'Скорость'], ['stability', 'Устойчивость'], ['weight', 'Вес'], ['health', 'Здоровье'],
];

// geo: L/W — габариты, rF/rR — радиусы колёс, axF/axR — оси по Z, track — полуколея,
// top — профиль нижнего кузова (спереди назад), gh — профиль остекления [капот, верх лобового, верх заднего, низ заднего]
const CARS = [
  {
    id: 'corolla', name: 'Toyota Corolla', short: 'Corolla', cls: 'Седан · надёжный старт', price: 0,
    stats: { speed: 4, stability: 6, weight: 4, health: 3 }, paints: [0xeef1f5, 0xc81f2d],
    geo: { style: 'sedan', L: 4.45, W: 1.78, H: 1.46, rF: 0.32, rR: 0.32, ww: 0.22, axF: 1.36, axR: -1.32, track: 0.75,
      bottomY: 0.26, archPad: 0.08, bevel: 0.06, rim: 0xb9bec6,
      top: [[2.2, 0.34], [2.24, 0.6], [2.05, 0.8], [0.95, 0.92], [-1.3, 0.98], [-2.05, 0.99], [-2.22, 0.88], [-2.22, 0.4], [-2.18, 0.32]],
      gh: [[0.95, 0.92], [0.0, 1.38], [-0.85, 1.40], [-1.45, 0.98]], ghW: 1.46, bPillars: [-0.32], pillar: 'paint' },
  },
  {
    id: 'accord', name: 'Honda Accord', short: 'Accord', cls: 'Бизнес-седан', price: 100,
    stats: { speed: 5, stability: 7, weight: 5, health: 5 }, paints: [0x1e3566, 0x6e1322],
    geo: { style: 'sedan', L: 4.9, W: 1.86, H: 1.45, rF: 0.33, rR: 0.33, ww: 0.23, axF: 1.47, axR: -1.36, track: 0.79,
      bottomY: 0.25, archPad: 0.08, bevel: 0.06, rim: 0xc9cdd3, chromeLine: true,
      top: [[2.43, 0.33], [2.47, 0.58], [2.27, 0.78], [1.05, 0.90], [-1.55, 0.98], [-2.32, 0.99], [-2.45, 0.86], [-2.45, 0.4], [-2.4, 0.32]],
      gh: [[1.05, 0.90], [0.05, 1.38], [-0.95, 1.40], [-1.8, 0.98]], ghW: 1.52, bPillars: [-0.36], pillar: 'paint' },
  },
  {
    id: 'x5', name: 'BMW X5', short: 'X5', cls: 'Кроссовер премиум-класса', price: 200,
    stats: { speed: 6, stability: 8, weight: 7, health: 7 }, paints: [0x24406e, 0xe6e8eb],
    geo: { style: 'suv', L: 4.92, W: 1.94, H: 1.76, rF: 0.40, rR: 0.40, ww: 0.27, axF: 1.5, axR: -1.43, track: 0.82,
      bottomY: 0.40, archPad: 0.09, bevel: 0.07, rim: 0xd5d8dc,
      top: [[2.44, 0.52], [2.48, 0.88], [2.30, 1.05], [1.10, 1.15], [-2.2, 1.2], [-2.46, 1.14], [-2.46, 0.52], [-2.42, 0.44]],
      gh: [[1.10, 1.15], [0.32, 1.64], [-2.02, 1.68], [-2.32, 1.2]], ghW: 1.62, bPillars: [-0.42, -1.4], pillar: 'black' },
  },
  {
    id: 'hummer', name: 'Hummer H1', short: 'H1', cls: 'Армейский внедорожник', price: 400,
    stats: { speed: 5, stability: 10, weight: 10, health: 10 }, paints: [0x56613a, 0xcbb487],
    geo: { style: 'hummer', L: 4.7, W: 2.2, H: 1.98, rF: 0.47, rR: 0.47, ww: 0.36, axF: 1.62, axR: -1.62, track: 0.9,
      bottomY: 0.55, archPad: 0.1, bevel: 0.025, rim: 0x5d6152,
      top: [[2.32, 0.70], [2.35, 1.08], [2.05, 1.28], [0.78, 1.33], [-2.30, 1.33], [-2.35, 1.28], [-2.35, 0.68], [-2.3, 0.6]],
      gh: [[0.78, 1.33], [0.6, 1.93], [-2.18, 1.93], [-2.28, 1.33]], ghW: 1.70, bPillars: [-0.38, -1.4], pillar: 'paint' },
  },
  {
    id: 'aventador', name: 'Lamborghini Aventador', short: 'Aventador', cls: 'Суперкар V12', price: 700,
    stats: { speed: 10, stability: 7, weight: 5, health: 5 }, paints: [0x86cf12, 0xff7400],
    geo: { style: 'super', L: 4.78, W: 2.03, H: 1.15, rF: 0.33, rR: 0.37, ww: 0.28, axF: 1.40, axR: -1.30, track: 0.86,
      bottomY: 0.16, archPad: 0.06, bevel: 0.05, rim: 0x2a2c30,
      top: [[2.36, 0.22], [2.42, 0.40], [2.2, 0.62], [1.0, 0.82], [-0.95, 0.90], [-2.15, 0.95], [-2.39, 0.90], [-2.40, 0.42], [-2.35, 0.22]],
      gh: [[1.0, 0.82], [-0.05, 1.12], [-0.5, 1.13], [-0.95, 0.90]], ghW: 1.36, bPillars: [], pillar: 'paint',
      engine: [[-0.5, 1.13], [-2.12, 0.97], [-2.12, 0.93], [-0.95, 0.90]] },
  },
];

// Характеристики → физика
function derive(s) {
  return {
    maxSpeed: (12 + s.speed * 2.6) * 1.875,  // м/с: Corolla ≈ 150 км/ч, Aventador ≈ 255 км/ч (спидометр честный, см. KMH)
    accel: (6 + s.speed * 1.4) * 1.1,   // м/с²
    grip: 10 + s.stability * 1.8,       // предел бокового ускорения (сцепление)
    stability: s.stability,
    mass: 700 + s.weight * 290,         // кг
    maxHp: 20 + s.health * 14,
  };
}
// Общие настройки управляемости (индивидуальные отличия машин — через характеристики выше)
const HANDLING = {
  steerIn: 6.5,        // скорость поворота руля, 1/с
  steerReturn: 11,     // скорость возврата руля в центр / перекладки
  lock: 0.6,           // максимальный угол колёс на месте, рад
  lockSpeed: 13,       // с какой скорости (м/с) угол руля уменьшается вдвое
  brake: 30,           // замедление тормозом, м/с²
  hbDecel: 4,          // замедление ручником
  hbRearGrip: 0.32,    // доля сцепления задней оси на ручнике
  peakSlipF: 0.12,     // угол увода (рад), при котором шины выходят на предел
  peakSlipR: 0.10,
  slideDrag: 0.22,     // потеря скорости при боковом скольжении
  assist: 0.3,         // ассистент стабилизации (+ assistPerStab × Устойчивость)
  assistPerStab: 0.1,
  assistGrip: 1.15,    // насколько ассистент может «докрутить» поворот сверх предела шин
};
// Спидометр показывает настоящие км/ч. Раньше стоял множитель 1,6 («игровые» км/ч) — из-за него 270 на спидометре
// были реальными 170 км/ч, и скорость ощущалась заниженной.
const KMH = 3.6;
// Нитро: шкала 0…1 копится за трюки (js/stunts.js). Полная шкала — dur секунд ускорения:
// разгон ×(1 + accel), максималка ×(1 + top). start — сколько нитро в начале заезда.
const NITRO = { dur: 3.2, accel: 0.75, top: 0.2, start: 0.25, minStart: 0.08 };
// Время суток (выбирается на экране режима, js/sky.js)
const TIMES = [['day', 'День'], ['sunset', 'Закат'], ['night', 'Ночь']];
const cleanTime = t => TIMES.some(l => l[0] === t) ? t : 'day';
const PLAYER_COLORS = [0x38c8ff, 0xff8a2a];

/* =====================================================================
   SAVE
   ===================================================================== */
// У каждого игрока свой кошелёк и свой гараж
const SAVE_KEY = 'steel_duel_save_v2', OLD_SAVE_KEY = 'steel_duel_save_v1';
const MAP_IDS = ['city', 'forest', 'arena'];
const KO_REWARD = 5;
// режимы игры (выбираются вместо карты; другие карты пока скрыты — играем в городе)
// solo — свободная езда одного игрока на весь экран (машина и кошелёк Игрока 1)
const MODES = ['free', 'solo', 'race'];
const PLAY_MAP = 'city';
const RACE_CPS = 10, RACE_REWARD = 10;   // чекпоинтов в гонке и награда победителю
// интенсивность городского трафика: id, подпись, число машин вокруг игроков
const TRAFFIC_LEVELS = [['off', 'Выкл', 0], ['low', 'Мало', 40], ['mid', 'Средне', 90], ['high', 'Много', 180]];
const cleanTraffic = t => TRAFFIC_LEVELS.some(l => l[0] === t) ? t : 'mid';
// качество графики: aa — сглаживание (MSAA, задаётся при создании WebGL — смена требует перезагрузки страницы),
// scale — доля разрешения экрана, в которой рисуется кадр (дальше браузер растягивает его на весь экран).
// Низкое — для слабых видеокарт: на встроенной Radeon 680M при 1920×1200 кадр почти вдвое дешевле для видеокарты.
const QUALITY = { high: { label: 'Высокое', aa: true, scale: 1 }, low: { label: 'Низкое', aa: false, scale: 0.8 } };
const cleanQuality = q => QUALITY[q] ? q : 'high';
const defaultPlayer = () => ({ coins: 0, owned: ['corolla'], sel: 'corolla' });
const defaultSave = () => ({ players: [defaultPlayer(), defaultPlayer()], map: 'city', traffic: 'mid', mode: 'free', tod: 'day', quality: 'high' });
function cleanPlayer(p) {
  if (!p || typeof p !== 'object') return defaultPlayer();
  const owned = Array.isArray(p.owned) ? p.owned.filter(id => CARS.some(c => c.id === id)) : [];
  if (!owned.includes('corolla')) owned.unshift('corolla');
  return { coins: Math.max(0, Math.floor(+p.coins || 0)), owned, sel: owned.includes(p.sel) ? p.sel : 'corolla' };
}
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && Array.isArray(s.players) && s.players.length === 2)
      return { players: s.players.map(cleanPlayer), map: MAP_IDS.includes(s.map) ? s.map : 'city', traffic: cleanTraffic(s.traffic),
        mode: MODES.includes(s.mode) ? s.mode : 'free', tod: cleanTime(s.tod), quality: cleanQuality(s.quality) };
  } catch (e) { /* повреждённое сохранение — начинаем заново */ }
  // перенос со старого формата с общим балансом: монеты делятся пополам, купленные машины есть у обоих
  try {
    const o = JSON.parse(localStorage.getItem(OLD_SAVE_KEY));
    if (o && typeof o.coins === 'number') {
      const c = Math.max(0, Math.floor(o.coins)), sel = Array.isArray(o.sel) ? o.sel : [];
      return { players: [0, 1].map(i => cleanPlayer({ coins: i === 0 ? Math.ceil(c / 2) : Math.floor(c / 2), owned: o.owned, sel: sel[i] })), map: 'city', traffic: 'mid', mode: 'free', tod: 'day', quality: 'high' };
    }
  } catch (e) { }
  return defaultSave();
}
let save = loadSave();
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { } }
const carIndex = id => Math.max(0, CARS.findIndex(c => c.id === id));
const browse = [carIndex(save.players[0].sel), carIndex(save.players[1].sel)];

