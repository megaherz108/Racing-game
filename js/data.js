// Данные машин, характеристики → физика, сохранение
// Определяет: STATS, CARS, accelTime, LIN_DAMP, time100, accelFor, derive, HANDLING, KMH, NITRO, TIMES, cleanTime,
//   PLAYER_COLORS, PAINTS, PAINT_FREE, paintDef, hasPaint, paintOf, paintBuy, SAVE_KEY, OLD_SAVE_KEY, MAP_IDS,
//   KO_REWARD, FLIP_REWARD, JUMP, BADGE_FLYER_D, BADGE_RACER_T, badgeChevron, BADGES, BADGE_SPOTS, badgeDef,
//   hasBadge, badgeGive, fitOf, fitSet, MODES, PLAY_MAPS, PLAY_MAP, MODE_MAP, playMap, RACE_CPS, RACE_REWARD,
//   RACE_CP_REWARD, CAP_CFG, CAP_REWARD, CAP_BONUS_PER, CAP_CONTEST, CAP_WARN, BOMB_CFG, BOMB_REWARD,
//   BOMB_ROUND_REWARD, COIN_MUL, TRAFFIC_LEVELS, cleanTraffic, QUALITY, cleanQuality, defaultPlayer, defaultSave,
//   cleanJumps, cleanPlayer, badgesFromJumps, loadSave, save, persist, carIndex, browse, paintView.
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

/* =====================================================================
   DATA
   ===================================================================== */
const STATS = [
  ['speed', 'Скорость'], ['stability', 'Управление'], ['weight', 'Вес'], ['health', 'Здоровье'],
];

// geo: L/W — габариты, rF/rR — радиусы колёс, axF/axR — оси по Z, track — полуколея,
// top — профиль нижнего кузова (спереди назад), gh — профиль остекления [капот, верх лобового, верх заднего, низ заднего]
const CARS = [
  {
    id: 'corolla', name: 'Toyota Corolla', short: 'Corolla', cls: 'Седан · надёжный старт', price: 0,
    stats: { speed: 4, stability: 6, weight: 4, health: 3 },
    geo: { style: 'sedan', L: 4.45, W: 1.78, H: 1.46, rF: 0.32, rR: 0.32, ww: 0.22, axF: 1.36, axR: -1.32, track: 0.75,
      bottomY: 0.26, archPad: 0.08, bevel: 0.06, rim: 0xb9bec6,
      top: [[2.2, 0.34], [2.24, 0.6], [2.05, 0.8], [0.95, 0.92], [-1.3, 0.98], [-2.05, 0.99], [-2.22, 0.88], [-2.22, 0.4], [-2.18, 0.32]],
      gh: [[0.95, 0.92], [0.0, 1.38], [-0.85, 1.40], [-1.45, 0.98]], ghW: 1.46, bPillars: [-0.32], pillar: 'paint' },
  },
  {
    id: 'golf', name: 'Volkswagen Golf GTI', short: 'Golf', cls: 'Горячий хэтчбек · шустрый, но хрупкий', price: 100,
    stats: { speed: 6, stability: 8, weight: 3, health: 3 },
    geo: { style: 'hatch', L: 4.27, W: 1.80, H: 1.46, rF: 0.32, rR: 0.32, ww: 0.23, axF: 1.26, axR: -1.37, track: 0.77,
      bottomY: 0.25, archPad: 0.07, bevel: 0.06, rim: 0xbfc4ca,
      top: [[2.10, 0.33], [2.14, 0.62], [1.98, 0.81], [0.95, 0.93], [-1.6, 0.98], [-2.05, 1.0], [-2.13, 0.92], [-2.14, 0.42], [-2.1, 0.32]],
      gh: [[0.95, 0.92], [0.0, 1.40], [-1.58, 1.36], [-2.02, 1.0]], ghW: 1.48, bPillars: [-0.42], pillar: 'black' },
  },
  {
    id: 'niva', name: 'Lada Niva', short: 'Нива', cls: 'Вездеход · медленная, но крепкая', price: 100,
    stats: { speed: 3, stability: 5, weight: 6, health: 7 },
    // по заводскому чертежу ВАЗ-21214: база 2200, свесы 705/835, колея 1430/1400, шины 175/80 R16
    geo: { style: 'niva', L: 3.74, W: 1.68, H: 1.64, rF: 0.343, rR: 0.343, ww: 0.19, axF: 1.165, axR: -1.035, track: 0.71,
      bodyL: 3.34, bottomY: 0.40, archPad: 0.085, archLift: 0.045, bevel: 0.035, rim: 0xc4cec6, steelRim: true, tumble: 0.11,
      top: [[1.66, 0.45], [1.675, 0.88], [1.65, 0.99], [1.58, 1.04], [1.25, 1.11], [0.71, 1.16], [-1.62, 1.13], [-1.70, 1.10],
        [-1.745, 0.62], [-1.73, 0.45]],
      gh: [[0.71, 1.16], [0.28, 1.585], [-1.40, 1.585], [-1.62, 1.13]], ghW: 1.50, bPillars: [-0.44], pillar: 'paint' },
  },
  {
    id: 'accord', name: 'Honda Accord', short: 'Accord', cls: 'Бизнес-седан', price: 200,
    stats: { speed: 6, stability: 7, weight: 5, health: 5 },
    geo: { style: 'sedan', L: 4.9, W: 1.86, H: 1.45, rF: 0.33, rR: 0.33, ww: 0.23, axF: 1.47, axR: -1.36, track: 0.79,
      bottomY: 0.25, archPad: 0.08, bevel: 0.06, rim: 0xc9cdd3, chromeLine: true,
      top: [[2.43, 0.33], [2.47, 0.58], [2.27, 0.78], [1.05, 0.90], [-1.55, 0.98], [-2.32, 0.99], [-2.45, 0.86], [-2.45, 0.4], [-2.4, 0.32]],
      gh: [[1.05, 0.90], [0.05, 1.38], [-0.95, 1.40], [-1.8, 0.98]], ghW: 1.52, bPillars: [-0.36], pillar: 'paint' },
  },
  {
    id: 'mustang', name: 'Ford Mustang GT', short: 'Mustang', cls: 'Маслкар V8 · быстрый таран, любит занос', price: 300,
    stats: { speed: 8, stability: 4, weight: 7, health: 6 },
    geo: { style: 'muscle', L: 4.79, W: 1.92, H: 1.38, rF: 0.34, rR: 0.35, ww: 0.27, axF: 1.32, axR: -1.40, track: 0.82,
      bottomY: 0.22, archPad: 0.07, bevel: 0.05, rim: 0x3a3d42,
      top: [[2.30, 0.32], [2.40, 0.72], [2.24, 0.83], [0.75, 0.92], [-1.6, 0.96], [-2.25, 0.99], [-2.39, 0.90], [-2.40, 0.42], [-2.35, 0.30]],
      gh: [[0.75, 0.92], [-0.15, 1.34], [-0.85, 1.36], [-1.95, 0.97]], ghW: 1.44, bPillars: [], pillar: 'paint' },
  },
  {
    id: 'x5', name: 'BMW X5', short: 'X5', cls: 'Кроссовер премиум-класса', price: 300,
    stats: { speed: 6, stability: 8, weight: 7, health: 7 },
    geo: { style: 'suv', L: 4.92, W: 1.94, H: 1.76, rF: 0.40, rR: 0.40, ww: 0.27, axF: 1.5, axR: -1.43, track: 0.82,
      bottomY: 0.40, archPad: 0.09, bevel: 0.07, rim: 0xd5d8dc,
      top: [[2.44, 0.52], [2.48, 0.88], [2.30, 1.05], [1.10, 1.15], [-2.2, 1.2], [-2.46, 1.14], [-2.46, 0.52], [-2.42, 0.44]],
      gh: [[1.10, 1.15], [0.32, 1.64], [-2.02, 1.68], [-2.32, 1.2]], ghW: 1.62, bPillars: [-0.42, -1.4], pillar: 'black' },
  },
  {
    id: 'wrx', name: 'Subaru WRX STI', short: 'WRX', cls: 'Раллийный седан · цепкий гонщик', price: 400,
    stats: { speed: 8, stability: 9, weight: 4, health: 5 },
    geo: { style: 'rally', L: 4.60, W: 1.80, H: 1.48, rF: 0.33, rR: 0.33, ww: 0.25, axF: 1.37, axR: -1.28, track: 0.78,
      bottomY: 0.27, archPad: 0.08, bevel: 0.06, rim: 0xc9a227,
      top: [[2.26, 0.34], [2.30, 0.60], [2.12, 0.80], [1.0, 0.92], [-1.4, 0.98], [-2.15, 1.0], [-2.29, 0.88], [-2.29, 0.40], [-2.24, 0.32]],
      gh: [[1.0, 0.92], [0.05, 1.40], [-0.85, 1.42], [-1.55, 1.0]], ghW: 1.46, bPillars: [-0.36], pillar: 'black' },
  },
  {
    id: 'hummer', name: 'Hummer H1', short: 'H1', cls: 'Армейский внедорожник', price: 500,
    stats: { speed: 5, stability: 6, weight: 10, health: 10 },
    geo: { style: 'hummer', L: 4.7, W: 2.2, H: 1.98, rF: 0.47, rR: 0.47, ww: 0.36, axF: 1.62, axR: -1.62, track: 0.9,
      bottomY: 0.55, archPad: 0.1, bevel: 0.025, rim: 0x5d6152,
      top: [[2.32, 0.70], [2.35, 1.08], [2.05, 1.28], [0.78, 1.33], [-2.30, 1.33], [-2.35, 1.28], [-2.35, 0.68], [-2.3, 0.6]],
      gh: [[0.78, 1.33], [0.6, 1.93], [-2.18, 1.93], [-2.28, 1.33]], ghW: 1.70, bPillars: [-0.38, -1.4], pillar: 'paint' },
  },
  {
    id: 'p911', name: 'Porsche 911', short: '911', cls: 'Спорткар · мотор сзади, бьётся легко', price: 600,
    stats: { speed: 9, stability: 10, weight: 4, health: 4 },
    geo: { style: 'sport', rearEngine: true, L: 4.52, W: 1.85, H: 1.30, rF: 0.34, rR: 0.36, ww: 0.28, axF: 1.28, axR: -1.17, track: 0.80,
      bottomY: 0.18, archPad: 0.06, bevel: 0.06, rim: 0xc0c4ca,
      top: [[2.20, 0.28], [2.26, 0.46], [2.15, 0.60], [1.75, 0.70], [0.85, 0.82], [-0.6, 0.88], [-1.6, 0.90], [-2.12, 0.88], [-2.26, 0.78], [-2.26, 0.40], [-2.20, 0.28]],
      gh: [[0.85, 0.82], [0.15, 1.24], [-0.42, 1.28], [-1.95, 0.93]], ghW: 1.34, bPillars: [], pillar: 'paint',
      engine: [[-1.25, 1.11], [-2.05, 0.93], [-2.05, 0.87], [-1.25, 0.9]] },
  },
  {
    id: 'aventador', name: 'Lamborghini Aventador', short: 'Aventador', cls: 'Суперкар V12', price: 800,
    stats: { speed: 10, stability: 8, weight: 5, health: 5 },
    geo: { style: 'super', rearEngine: true, L: 4.78, W: 2.03, H: 1.15, rF: 0.33, rR: 0.37, ww: 0.28, axF: 1.40, axR: -1.30, track: 0.86,
      bottomY: 0.16, archPad: 0.06, bevel: 0.05, rim: 0x2a2c30,
      top: [[2.36, 0.22], [2.42, 0.40], [2.2, 0.62], [1.0, 0.82], [-0.95, 0.90], [-2.15, 0.95], [-2.39, 0.90], [-2.40, 0.42], [-2.35, 0.22]],
      gh: [[1.0, 0.82], [-0.05, 1.12], [-0.5, 1.13], [-0.95, 0.90]], ghW: 1.36, bPillars: [], pillar: 'paint',
      engine: [[-0.5, 1.13], [-2.12, 0.97], [-2.12, 0.93], [-0.95, 0.90]] },
  },
];

// Разгон 0–100 км/ч задаёт «Скорость»: 10 → 3 с, 1 → 12 с, каждая единица — секунда.
// На газу: dv/dt = accel · (1 − 0,55 · v / maxSpeed) − LIN_DAMP · v (js/physics.js, Car.control и демпфирование кузова),
// поэтому accel подбирается (делением пополам) так, чтобы до 100 км/ч выходило ровно accelTime секунд.
const accelTime = a => 13 - a;
const LIN_DAMP = 0.02;                // линейное демпфирование кузова в Rapier, 1/с
// время 0–100 км/ч при разгоне accel (м/с²) на месте; гараж показывает его с учётом HANDLING.accelMul
function time100(accel, maxSpeed) {
  const b = accel * 0.55 / maxSpeed + LIN_DAMP, x = b * (100 / KMH) / accel;
  return x >= 1 ? Infinity : -Math.log(1 - x) / b;
}
function accelFor(T, maxSpeed) {
  let lo = 0.1, hi = 100;
  for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (time100(mid, maxSpeed) > T) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
function derive(s) {
  const maxSpeed = (12 + s.speed * 2.6) * 1.875;
  return {
    maxSpeed,                           // м/с: Corolla ≈ 150 км/ч, Aventador ≈ 255 км/ч (спидометр честный, см. KMH)
    accel: accelFor(accelTime(s.speed), maxSpeed),   // м/с² на месте
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
  assist: 0.3,         // ассистент стабилизации (+ assistPerStab × Управление)
  assistPerStab: 0.1,
  assistGrip: 1.15,    // насколько ассистент может «докрутить» поворот сверх предела шин
  accelMul: 1.5,       // МНОЖИТЕЛЬ РАЗГОНА всех машин игроков: сила тяги × accelMul (0.5 — 0–100 примерно вдвое дольше).
                       // Можно менять на лету из консоли: HANDLING.accelMul = 0.8
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
// цвета кузова машин игроков (гараж): каждый цвет покупается для каждой машины отдельно, у каждого игрока свой.
// price — монет за одну машину; белый бесплатный и стоит по умолчанию. m — металличность, r / rl — шероховатость
// краски без лака («Минимум») и под лаком (paintCar() в js/car-models.js); env — сила отражений. Без них — обычный
// металлик. У белого и чёрного металличность ниже: белый иначе сереет, а чёрный металлик почти ничего не отражает
// и выглядит плоским пятном — у неметаллической краски отражение неба и фонарей видно на любом цвете.
const PAINTS = [
  { id: 'white', name: 'Белый', hex: 0xeef1f5, price: 0, m: 0.08, r: 0.24, rl: 0.38 },
  { id: 'yellow', name: 'Жёлтый', hex: 0xf2c014, price: 20 },
  { id: 'purple', name: 'Фиолетовый', hex: 0x6a2fb5, price: 20 },
  { id: 'pink', name: 'Розовый', hex: 0xf06aa6, price: 20 },
  { id: 'orange', name: 'Оранжевый', hex: 0xff6f0f, price: 50 },
  { id: 'sky', name: 'Голубой', hex: 0x4db5ea, price: 50 },
  { id: 'blue', name: 'Синий', hex: 0x1b3f9c, price: 50 },
  { id: 'grey', name: 'Серый', hex: 0x8b9097, price: 100 },
  { id: 'red', name: 'Красный', hex: 0xc4161c, price: 100 },
  { id: 'lime', name: 'Лаймовый', hex: 0x86cf12, price: 100 },
  { id: 'green', name: 'Зелёный', hex: 0x1e6b34, price: 100 },
  { id: 'black', name: 'Чёрный', hex: 0x1b1d22, price: 200, m: 0.15, r: 0.16, rl: 0.3, env: 1.6 },
];
const PAINT_FREE = 'white';
const paintDef = id => PAINTS.find(c => c.id === id) || PAINTS[0];
// куплен ли у игрока цвет id для машины carId (машина тоже должна быть куплена)
const hasPaint = (pl, carId, id) => pl.owned.includes(carId) &&
  (id === PAINT_FREE || !!(pl.paints[carId] && pl.paints[carId].includes(id)));
// цвет, в котором машина carId выезжает у игрока: выбранный, если он куплен, иначе белый
const paintOf = (pl, carId) => paintDef(hasPaint(pl, carId, pl.paint[carId]) ? pl.paint[carId] : PAINT_FREE);
// купить цвет id для машины carId: списывает монеты и сразу выбирает цвет. Сохранение — на вызывающем (persist()).
// Возвращает '' при успехе или причину отказа.
function paintBuy(pl, carId, id) {
  const pd = PAINTS.find(c => c.id === id);
  if (!pd) return 'нет такого цвета';
  if (!pl.owned.includes(carId)) return 'сначала купите машину';
  if (hasPaint(pl, carId, id)) return 'цвет уже куплен';
  if (pl.coins < pd.price) return `не хватает ${pd.price - pl.coins} монет`;
  pl.coins -= pd.price;
  (pl.paints[carId] = pl.paints[carId] || []).push(id);
  pl.paint[carId] = id;
  return '';
}

/* =====================================================================
   SAVE
   ===================================================================== */
// У каждого игрока свой кошелёк и свой гараж
const SAVE_KEY = 'steel_duel_save_v2', OLD_SAVE_KEY = 'steel_duel_save_v1';
const MAP_IDS = ['city', 'forest', 'arena', 'coast', 'sitges'];
const KO_REWARD = 5;
const FLIP_REWARD = 3;   // за переворот соперника на крышу или крышей к стене (js/physics.js, Car.sync())
// длинные прыжки (js/jumps.js), только свободная и одиночная езда. Длина — по горизонтали от точки отрыва до
// приземления. tiers — пороги [метров, монет, подпись]; один и тот же трамплин (точка отрыва в радиусе spotR м)
// платит раз в cooldown с. Рекорд карты (первое место в таблице top лучших прыжков, save.jumps) — монеты порога
// ещё раз, то есть вдвое.
const JUMP = {
  tiers: [[50, 2, 'ХОРОШИЙ ПРЫЖОК'], [100, 4, 'ОТЛИЧНЫЙ ПРЫЖОК'], [150, 7, 'ШИКАРНЫЙ ПРЫЖОК'],
    [200, 10, 'ЭПИЧНЫЙ ПРЫЖОК'], [250, 15, 'НЕВЕРОЯТНЫЙ ПРЫЖОК'], [300, 20, 'ЛЕГЕНДАРНЫЙ ПРЫЖОК']],
  top: 5,
  spotR: 30, cooldown: 120,
  minAir: 0.5,        // короче (с) — не прыжок, а кочка
  settle: 1,          // столько секунд после приземления машина должна остаться на колёсах
  modes: ['free', 'solo'],
};
// значки за достижения (js/badges.js): светятся в темноте, ставятся на машину в места BADGE_SPOTS (один значок —
// в сколько угодно мест). Открыты у каждого игрока свои; расстановка — своя для каждой машины. Новый значок — строка
// здесь и вызов unlockBadge(p, id) там, где выполнено условие. pic — рисунок в круге радиуса 1 (y — вверх; кружок
// значка — до 0,8): многоугольники { pts: [[x, y], …], c: [цвет вверху, цвет внизу] }; rim — цвет ободка.
const BADGE_FLYER_D = JUMP.tiers[JUMP.tiers.length - 1][0];   // «Лётчик»: легендарный прыжок (js/jumps.js)
const BADGE_RACER_T = 120;                                   // «Гонщик»: гонка за столько секунд или быстрее (js/race.js)
const badgeChevron = dy => ({ pts: [[-0.5, dy - 0.2], [0, dy + 0.2], [0.5, dy - 0.2], [0.5, dy - 0.44], [0, dy - 0.04], [-0.5, dy - 0.44]],
  c: [0xd2ff4a, 0x86e000] });
const BADGES = [
  { id: 'flyer', name: 'Лётчик', how: `прыжок от ${BADGE_FLYER_D} м`, rim: 0x9cff2e, pic: [badgeChevron(0.35), badgeChevron(-0.11)] },
  { id: 'racer', name: 'Гонщик', how: `гонка за ${BADGE_RACER_T / 60}:00 или быстрее`, rim: 0xffa61f,
    pic: [{ pts: [[0.16, 0.68], [-0.38, -0.02], [-0.04, -0.02], [-0.2, -0.68], [0.4, 0.09], [0.06, 0.09], [0.34, 0.68]], c: [0xffe63a, 0xff6a00] }] },
];
// места на машине: колёса — сразу все четыре (значок на ступице крутится с колесом); бамперы отрываются вместе со значком
// [id, название, коротко — для кнопки в гараже]
const BADGE_SPOTS = [['hood', 'Капот', 'Капот'], ['lip', 'Передняя кромка капота', 'Кромка'], ['front', 'Передний бампер', 'Бампер П'],
  ['rear', 'Задний бампер', 'Бампер З'], ['wheels', 'Колёса (все четыре)', 'Колёса']];
const badgeDef = id => BADGES.find(b => b.id === id) || null;
const hasBadge = (pl, id) => pl.badges.includes(id);
// открыть значок id игроку pl: true — открыт только что. Сохранение — на вызывающем (persist())
function badgeGive(pl, id) {
  if (!badgeDef(id) || hasBadge(pl, id)) return false;
  pl.badges.push(id);
  return true;
}
// расстановка значков на машине carId: { место: определение значка } — только открытые значки
function fitOf(pl, carId) {
  const out = {}, f = pl.fit[carId] || {};
  for (const [s] of BADGE_SPOTS) if (f[s] && hasBadge(pl, f[s])) out[s] = badgeDef(f[s]);
  return out;
}
// поставить значок id (null — снять) на место spot машины carId. Возвращает '' или причину отказа
function fitSet(pl, carId, spot, id) {
  if (!pl.owned.includes(carId)) return 'сначала купите машину';
  if (!BADGE_SPOTS.some(s => s[0] === spot)) return 'нет такого места';
  const f = pl.fit[carId] || (pl.fit[carId] = {});
  if (!id) { delete f[spot]; if (!Object.keys(f).length) delete pl.fit[carId]; return ''; }
  if (!hasBadge(pl, id)) return 'значок ещё не открыт';
  f[spot] = id;
  return '';
}
// режимы игры; solo — свободная езда одного игрока на весь экран (машина и кошелёк Игрока 1);
// capture — захват точек (js/capture.js); bomb — горячая бомба (js/bomb.js)
const MODES = ['free', 'solo', 'race', 'capture', 'bomb'];
// карты, которые можно выбрать на экране режима (остальные — для отладки)
const PLAY_MAPS = ['city', 'coast', 'sitges'];
const PLAY_MAP = 'city';
// у некоторых режимов карта своя: гонке нужен дорожный граф (только город), захвату — зоны world.zones (только Побережье)
const MODE_MAP = { race: 'city', capture: 'coast' };
const playMap = (mode = save.mode) => MODE_MAP[mode] || (PLAY_MAPS.includes(save.map) ? save.map : PLAY_MAP);
const RACE_CPS = 10, RACE_REWARD = 30, RACE_CP_REWARD = 2;   // чекпоинтов в гонке, награда победителю и за каждый чекпоинт
// захват точек — настройки, которые можно менять из консоли: CAP_CFG.time = 30 — активное время точки, с
// (действует со следующей точки или заезда)
const CAP_CFG = { time: 60 };
// награда победителю; бонус — 1 монета за каждые CAP_BONUS_PER очков (обоим); скорость таймера, пока зону оспаривают
// (очков никто не получает); за сколько секунд до смены показывать следующую точку
const CAP_REWARD = 25, CAP_BONUS_PER = 10, CAP_CONTEST = 0.5, CAP_WARN = 10;
// горячая бомба (js/bomb.js) — настройки, которые можно менять из консоли: BOMB_CFG.fuse = 30.
// fuse — фитиль раунда, с (не сбрасывается при передаче); back — сколько секунд новый хозяин бомбы не может отдать её
// обратно; wins — побед до конца матча; speed — прибавка к разгону и максималке у того, у кого бомба (0,1 = +10 %);
// nitro — сколько шкалы нитро в секунду копится у него; gap — расстояние между машинами в начале раунда, м
const BOMB_CFG = { fuse: 40, back: 2, wins: 3, speed: 0.1, nitro: 0.06, gap: 45 };
// награда победителю матча и за каждый выигранный раунд
const BOMB_REWARD = 25, BOMB_ROUND_REWARD = 5;
// сколько монет на дорогах в каждом режиме: множитель к world.coinCount карты
const COIN_MUL = { free: 1.5, solo: 1.5, race: 1, capture: 0.5, bomb: 0.5 };
// интенсивность городского трафика: id, подпись, число машин вокруг игроков
const TRAFFIC_LEVELS = [['off', 'Выкл', 0], ['low', 'Мало', 40], ['mid', 'Средне', 90], ['high', 'Много', 180]];
const cleanTraffic = t => TRAFFIC_LEVELS.some(l => l[0] === t) ? t : 'mid';
// качество графики: aa — сглаживание (MSAA, задаётся при создании WebGL — смена требует перезагрузки страницы),
// scale — доля разрешения экрана, в которой рисуется кадр (дальше браузер растягивает его на весь экран).
// Низкое — для слабых видеокарт: на встроенной Radeon 680M при 1920×1200 кадр почти вдвое дешевле для видеокарты.
// rain — сколько капель дождя вокруг каждой камеры; fx — доля пыли и брызг из-под колёс (крупные полупрозрачные
// частицы перед камерой — главная нагрузка на заполнение пикселей); trails — светящиеся следы задних фонарей.
// shadows — тени от солнца (карта теней, теневые копии; выключение задаётся до первой отрисовки), blobs — вместо
// них тёмные пятна под машинами (js/blobs.js); lacquer — лаковый слой на кузовах игроков; trafficR — дальше скольких
// метров от игрока не рисуется трафик (Traffic.cullView); trees — деревья «Ситжеса» [ближе — полные модели, дальность
// упрощённых], м (js/maps/sitges/trees3d.js). Минимум — самое дешёвое для видеокарты, ценой картинки.
const QUALITY = {
  high: { label: 'Высокое', aa: true, scale: 1, rain: 3200, fx: 1, trails: true, shadows: true, blobs: false, lacquer: true, trafficR: 520, trees: [120, 1000] },
  low: { label: 'Низкое', aa: false, scale: 0.8, rain: 1600, fx: 0.5, trails: true, shadows: true, blobs: false, lacquer: true, trafficR: 520, trees: [120, 1000] },
  min: { label: 'Минимум', aa: false, scale: 0.7, rain: 1000, fx: 0.5, trails: false, shadows: false, blobs: true, lacquer: false, trafficR: 350, trees: [60, 600] } };
const cleanQuality = q => QUALITY[q] ? q : 'high';
// paints — купленные цвета { машина: [id цветов] } (белый не пишется, он есть всегда); paint — выбранный цвет
// { машина: id }, нет записи — белый. badges — открытые значки [id]; fit — расстановка { машина: { место: id } }
const defaultPlayer = () => ({ coins: 0, owned: ['corolla'], sel: 'corolla', paints: {}, paint: {}, badges: [], fit: {} });
const defaultSave = () => ({ players: [defaultPlayer(), defaultPlayer()], map: 'city', traffic: 'mid', mode: 'free', tod: 'day', rain: false, quality: 'high', jumps: {}, addr: false });
// таблицы рекордов прыжков: { карта: [{ d: метров, p: игрок 0/1, car: короткое имя машины }] } — по убыванию d
function cleanJumps(j) {
  const out = {};
  if (!j || typeof j !== 'object') return out;
  for (const id of MAP_IDS) {
    if (!Array.isArray(j[id])) continue;
    const list = j[id].filter(e => e && isFinite(e.d) && e.d > 0).map(e => ({ d: Math.round(e.d * 10) / 10, p: e.p === 1 ? 1 : 0, car: String(e.car || '').slice(0, 20) }));
    if (list.length) out[id] = list.sort((a, b) => b.d - a.d).slice(0, JUMP.top);
  }
  return out;
}
function cleanPlayer(p) {
  if (!p || typeof p !== 'object') return defaultPlayer();
  const owned = Array.isArray(p.owned) ? p.owned.filter(id => CARS.some(c => c.id === id)) : [];
  if (!owned.includes('corolla')) owned.unshift('corolla');
  // цвета — только у купленных машин и только известные; выбранный — только купленный
  const paints = {}, paint = {};
  for (const id of owned) {
    const list = p.paints && Array.isArray(p.paints[id]) ? p.paints[id] : [];
    const ok = PAINTS.filter(c => c.id !== PAINT_FREE && list.includes(c.id)).map(c => c.id);
    if (ok.length) paints[id] = ok;
    const s = p.paint && p.paint[id];
    if (ok.includes(s)) paint[id] = s;
  }
  // значки — только известные; расстановка — у купленных машин, на известных местах, только открытые значки
  const badges = BADGES.filter(b => Array.isArray(p.badges) && p.badges.includes(b.id)).map(b => b.id), fit = {};
  for (const id of owned) {
    const f = p.fit && p.fit[id], ok = {};
    if (f && typeof f === 'object') for (const [s] of BADGE_SPOTS) if (badges.includes(f[s])) ok[s] = f[s];
    if (Object.keys(ok).length) fit[id] = ok;
  }
  return { coins: Math.max(0, Math.floor(+p.coins || 0)), owned, sel: owned.includes(p.sel) ? p.sel : 'corolla', paints, paint, badges, fit };
}
// значки по уже записанным достижениям: прыжок игрока от BADGE_FLYER_D м в таблице рекордов любой карты — «Лётчик»
// (рекорды могли появиться раньше самих значков). Меняет sv.players, возвращает sv
function badgesFromJumps(sv) {
  for (const list of Object.values(sv.jumps || {}))
    for (const e of list) if (e.d >= BADGE_FLYER_D && sv.players[e.p]) badgeGive(sv.players[e.p], 'flyer');
  return sv;
}
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && Array.isArray(s.players) && s.players.length === 2)
      return badgesFromJumps({ players: s.players.map(cleanPlayer), map: MAP_IDS.includes(s.map) ? s.map : 'city', traffic: cleanTraffic(s.traffic),
        mode: MODES.includes(s.mode) ? s.mode : 'free', tod: cleanTime(s.tod), rain: s.rain === true, quality: cleanQuality(s.quality),
        jumps: cleanJumps(s.jumps), addr: s.addr === true });
  } catch (e) { /* повреждённое сохранение — начинаем заново */ }
  // перенос со старого формата с общим балансом: монеты делятся пополам, купленные машины есть у обоих
  try {
    const o = JSON.parse(localStorage.getItem(OLD_SAVE_KEY));
    if (o && typeof o.coins === 'number') {
      const c = Math.max(0, Math.floor(o.coins)), sel = Array.isArray(o.sel) ? o.sel : [];
      return { players: [0, 1].map(i => cleanPlayer({ coins: i === 0 ? Math.ceil(c / 2) : Math.floor(c / 2), owned: o.owned, sel: sel[i] })), map: 'city', traffic: 'mid', mode: 'free', tod: 'day', rain: false, quality: 'high', jumps: {} };
    }
  } catch (e) { }
  return defaultSave();
}
let save = loadSave();
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { } }
const carIndex = id => Math.max(0, CARS.findIndex(c => c.id === id));
const browse = [carIndex(save.players[0].sel), carIndex(save.players[1].sel)];
// некупленный цвет, который игрок примеряет в гараже (null — витрина в выбранном цвете)
const paintView = [null, null];

