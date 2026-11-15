// Трафик «Побережья» — типы машин и их модели из примитивов (в стиле машин игроков): мотороллер с седоком,
// трёхколёсный фургончик с ящиками фруктов, трактор с дугой и тентом, тележка с тюками сена.
// Модели «запекаются» (bakeModel, js/traffic/models.js): колёса не крутятся, анимаций нет. Низ модели — y = 0,
// перёд — +z; dims — размер коллайдера. paint — материал кузова, его цвет заменяет цвет экземпляра (paints).
// Поля типа сверх TRAFFIC_TYPES (js/traffic/models.js): model() — своя модель { root, paint, dims };
// lean — наклон в поворотах (мотороллер); climb — насколько теряет скорость в гору (vmax · (1 − climb · уклон));
// long — длинная машина: не заезжает на брусчатку деревни; max — не больше стольких на карте;
// trailer — прицеп (свой тип: модель, масса, gap и bar — js/traffic/driver.js, Traffic.follow).
// Определяет: ruralMat, ruralPaint, RURAL_SKIN, ruralBall, ruralWheel, ruralBigWheel, buildScooterModel,
//   buildApeModel, buildTractorModel, buildHaycartModel, COAST_TRAFFIC_TYPES.
// Использует: makeWheel, cyl, MAT, box, beam, extrude, polyShape (js/core.js); canvasMat (js/traffic/models.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

/* =====================================================================
   ОБЩЕЕ: материалы, шары, колёса, люди
   ===================================================================== */
// простые материалы без текстур при запекании сливаются в одну геометрию — их можно заводить сколько угодно
const ruralMat = (color, roughness = 0.7, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const ruralPaint = (metalness = 0.15, roughness = 0.5) => new THREE.MeshStandardMaterial({ color: 0xffffff, metalness, roughness });
const RURAL_SKIN = 0xd9a47e;

// шар (или полушарие: half) радиуса 1, растянутый по осям
function ruralBall(mat, x, y, z, sx, sy, sz, parent, half = false) {
  const g = half ? new THREE.SphereGeometry(1, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2) : new THREE.SphereGeometry(1, 14, 10);
  const m = new THREE.Mesh(g, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; parent.add(m);
  return m;
}
// одиночное колесо (у мотороллера и переднего колеса фургончика — по центру)
function ruralWheel(parent, x, z, r, w, rim = 0xb9bec6) {
  const pivot = new THREE.Group(); pivot.position.set(x, r, z); parent.add(pivot);
  pivot.add(makeWheel(r, w, x < 0 ? -1 : 1, rim, true));
}
// колесо трактора и тележки: диск цвета кузова, ступица; lugs — число грунтозацепов (шахматкой по половинам шины)
function ruralBigWheel(parent, x, z, r, w, rimMat, lugs = 0) {
  const g = new THREE.Group(); g.position.set(x, r, z); parent.add(g);
  const tr = lugs ? r - 0.035 : r;
  cyl(tr, tr, w, 26, MAT.tire, g).rotation.z = Math.PI / 2;
  cyl(r * 0.56, r * 0.56, w + 0.012, 18, rimMat, g).rotation.z = Math.PI / 2;
  cyl(r * 0.2, r * 0.24, w + 0.07, 10, MAT.trim, g).rotation.z = Math.PI / 2;
  for (let k = 0; k < lugs; k++) for (const half of [-1, 1]) {
    const a = (k + (half > 0 ? 0.5 : 0)) / lugs * Math.PI * 2, R = r - 0.026;
    box(w * 0.48, 0.052, 0.11, MAT.tire, half * w * 0.25, Math.cos(a) * R, Math.sin(a) * R, g).rotation.x = a;
  }
}

/* =====================================================================
   МОТОРОЛЛЕР (1,8 × 0,7 × 1,45): винтажный итальянский силуэт, седок в шлеме
   ===================================================================== */
function buildScooterModel() {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const paint = ruralPaint(0.3, 0.38);
  const seat = ruralMat(0x5a3a26, 0.6), rubber = ruralMat(0x2a2a2a, 0.9);
  ruralWheel(root, 0, 0.6, 0.2, 0.1);
  ruralWheel(root, 0, -0.58, 0.2, 0.1);
  // вилка и переднее крыло
  beam([0, 0.2, 0.6], [0, 0.66, 0.46], 0.05, MAT.trim, body);
  ruralBall(paint, 0, 0.36, 0.6, 0.085, 0.13, 0.25, body, true);
  // щит для ног (верх отклонён назад, вдоль рулевой колонки), «галстук» спереди, пол
  box(0.46, 0.66, 0.045, paint, 0, 0.62, 0.4, body).rotation.x = -0.2;
  box(0.08, 0.22, 0.03, MAT.chrome, 0, 0.66, 0.445, body).rotation.x = -0.2;
  box(0.34, 0.05, 0.46, rubber, 0, 0.27, 0.13, body);
  box(0.32, 0.09, 0.5, paint, 0, 0.21, 0.12, body);
  // круглая «попа» над мотором и задним колесом
  ruralBall(paint, 0, 0.46, -0.45, 0.25, 0.2, 0.41, body);
  box(0.12, 0.2, 0.3, paint, 0, 0.4, -0.04, body);                       // перемычка к полу
  // седло, багажник, фонарь, номер
  box(0.24, 0.09, 0.56, seat, 0, 0.71, -0.32, body);
  box(0.22, 0.02, 0.17, MAT.chrome, 0, 0.7, -0.74, body);
  box(0.1, 0.06, 0.04, MAT.tail, 0, 0.6, -0.86, body);
  box(0.14, 0.1, 0.02, MAT.plate, 0, 0.47, -0.87, body).rotation.x = 0.35;
  // руль: обтекатель, круглая фара, ручки, круглые зеркала на стойках
  box(0.2, 0.1, 0.16, paint, 0, 0.98, 0.37, body);
  box(0.58, 0.035, 0.035, MAT.trim, 0, 0.98, 0.33, body);
  for (const s of [1, -1]) {
    box(0.09, 0.045, 0.045, MAT.black, s * 0.27, 0.98, 0.33, body);
    beam([s * 0.2, 1.0, 0.35], [s * 0.27, 1.17, 0.36], 0.015, MAT.chrome, body);
    cyl(0.04, 0.04, 0.015, 12, MAT.chrome, body).position.set(s * 0.27, 1.19, 0.36);
  }
  cyl(0.075, 0.075, 0.03, 16, MAT.chrome, body).rotation.x = Math.PI / 2;
  body.children[body.children.length - 1].position.set(0, 0.98, 0.45);
  cyl(0.06, 0.06, 0.02, 16, MAT.head, body).rotation.x = Math.PI / 2;
  body.children[body.children.length - 1].position.set(0, 0.98, 0.466);
  // седок: джинсы, голубая рубашка, белый открытый шлем
  const jeans = ruralMat(0x34476a, 0.85), shirt = ruralMat(0x9fb8d6, 0.8), skin = ruralMat(RURAL_SKIN, 0.75);
  const shoe = ruralMat(0x3b2a1e, 0.6), helmet = ruralMat(0xefe8d8, 0.35, 0.05);
  box(0.3, 0.14, 0.24, jeans, 0, 0.8, -0.3, body);
  for (const s of [1, -1]) {
    beam([s * 0.1, 0.81, -0.26], [s * 0.14, 0.8, 0.1], 0.12, jeans, body);       // бедро
    beam([s * 0.14, 0.8, 0.1], [s * 0.13, 0.34, 0.18], 0.1, jeans, body);        // голень
    box(0.09, 0.07, 0.2, shoe, s * 0.13, 0.33, 0.23, body);
    beam([s * 0.18, 1.14, -0.22], [s * 0.24, 1.0, 0.05], 0.085, shirt, body);     // плечо
    beam([s * 0.24, 1.0, 0.05], [s * 0.27, 0.98, 0.31], 0.07, skin, body);        // предплечье
  }
  box(0.34, 0.42, 0.2, shirt, 0, 1.0, -0.25, body).rotation.x = 0.12;
  ruralBall(skin, 0, 1.3, -0.19, 0.1, 0.11, 0.1, body);
  ruralBall(helmet, 0, 1.31, -0.2, 0.115, 0.115, 0.118, body, true);
  box(0.16, 0.03, 0.02, MAT.black, 0, 1.31, -0.085, body);                      // ремешок очков
  return { root, paint, dims: { L: 1.8, W: 0.7, H: 1.45 } };
}

/* =====================================================================
   ТРЁХКОЛЁСНЫЙ ФУРГОНЧИК (2,9 × 1,35 × 1,75): кабина с круглым носом, кузов с ящиками фруктов
   ===================================================================== */
function buildApeModel() {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const paint = ruralPaint(0.2, 0.45);
  const cream = ruralMat(0xeee6d2, 0.5), steel = ruralMat(0x4a4b48, 0.6, 0.3);
  ruralWheel(root, 0, 1.0, 0.23, 0.12);
  for (const s of [1, -1]) ruralWheel(root, s * 0.55, -0.85, 0.24, 0.13);
  // рама, задний мост, вилка и крыло переднего колеса
  box(0.5, 0.12, 2.3, MAT.black, 0, 0.4, -0.2, body);
  box(1.0, 0.08, 0.08, MAT.black, 0, 0.24, -0.85, body);
  beam([0, 0.23, 1.0], [0, 0.55, 0.92], 0.05, MAT.trim, body);
  box(0.18, 0.04, 0.42, MAT.black, 0, 0.5, 1.0, body);
  // кабина: профиль сбоку (z, y) — скруглённый нос над передним колесом
  extrude(polyShape([[0.2, 0.5], [0.2, 1.62], [0.95, 1.62], [1.1, 1.57], [1.2, 1.05], [1.31, 0.99],
    [1.39, 0.86], [1.41, 0.7], [1.38, 0.56], [1.3, 0.5]]), 1.24, paint, 0.035, body);
  box(1.3, 0.06, 1.08, cream, 0, 1.65, 0.66, body);                       // светлая крыша с козырьком
  const ws = box(1.06, 0.5, 0.03, MAT.glass, 0, 1.31, 1.17, body); ws.rotation.x = -0.16;
  beam([0.05, 1.08, 1.2], [-0.3, 1.36, 1.155], 0.018, MAT.black, body);         // дворник
  for (const s of [1, -1]) {
    box(0.02, 0.44, 0.56, MAT.glass, s * 0.625, 1.3, 0.74, body);           // боковое окно
    box(0.02, 0.9, 0.015, MAT.black, s * 0.625, 1.05, 0.44, body);          // шов двери
    box(0.03, 0.025, 0.1, MAT.chrome, s * 0.63, 1.0, 0.52, body);           // ручка
    beam([s * 0.6, 1.2, 1.08], [s * 0.66, 1.26, 1.12], 0.02, MAT.black, body);
    box(0.02, 0.1, 0.07, MAT.black, s * 0.665, 1.29, 1.12, body);           // зеркало
    box(0.07, 0.05, 0.03, MAT.amber, s * 0.42, 0.9, 1.395, body);           // поворотники
  }
  // круглая фара по центру носа, бампер, номер
  cyl(0.085, 0.085, 0.03, 16, MAT.chrome, body).rotation.x = Math.PI / 2;
  body.children[body.children.length - 1].position.set(0, 0.86, 1.425);
  cyl(0.068, 0.068, 0.02, 16, MAT.head, body).rotation.x = Math.PI / 2;
  body.children[body.children.length - 1].position.set(0, 0.86, 1.44);
  box(1.0, 0.06, 0.05, MAT.trim, 0, 0.55, 1.4, body);
  // кузов-платформа с бортами
  box(1.35, 0.06, 1.6, steel, 0, 0.55, -0.65, body);
  for (const s of [1, -1]) box(0.04, 0.26, 1.6, paint, s * 0.655, 0.71, -0.65, body);
  box(1.35, 0.26, 0.04, paint, 0, 0.71, -1.43, body);
  box(1.35, 0.5, 0.04, paint, 0, 0.83, 0.14, body);
  for (const s of [1, -1]) box(0.1, 0.07, 0.02, MAT.tail, s * 0.56, 0.7, -1.455, body);
  box(0.3, 0.12, 0.02, MAT.plate, 0, 0.66, -1.455, body);
  // ящики с апельсинами, лимонами, помидорами: 2 × 3 внизу (выше бортов) и четыре сверху
  const wood = ruralMat(0xb48a5a, 0.8), slat = ruralMat(0x6e5236, 0.9);
  const fruit = [ruralMat(0xf08a24, 0.6), ruralMat(0xf1d64a, 0.6), ruralMat(0xd8402c, 0.55)];
  const crate = (x, y, z, f) => {
    box(0.58, 0.32, 0.42, wood, x, y, z, body);
    box(0.59, 0.03, 0.43, slat, x, y, z, body);                           // щель между планками
    box(0.52, 0.03, 0.36, fruit[f], x, y + 0.15, z, body);
  };
  let f = 0;
  for (const z of [-1.15, -0.68, -0.21]) for (const x of [-0.31, 0.31]) crate(x, 0.74, z, f++ % 3);
  crate(-0.3, 1.07, -1.12, 1); crate(0.31, 1.07, -1.15, 2); crate(0.31, 1.07, -0.66, 0); crate(-0.3, 1.07, -0.22, 2);
  return { root, paint, dims: { L: 2.9, W: 1.35, H: 1.75 } };
}

/* =====================================================================
   ТРАКТОР (3,6 × 1,9 × 2,4): большие задние колёса с грунтозацепами, дуга с тентом, тракторист в шляпе.
   Сзади — дышло: сцепка в 0,4 м за задком (gap тележки), там с ним сходится дышло тележки
   ===================================================================== */
function buildTractorModel() {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const paint = ruralPaint(0.25, 0.42);
  const iron = ruralMat(0x3a3b3d, 0.65, 0.35), grill = ruralMat(0x1d1e20, 0.6, 0.4);
  for (const s of [1, -1]) {
    ruralBigWheel(root, s * 0.74, -0.75, 0.75, 0.38, paint, 18);
    ruralBigWheel(root, s * 0.6, 1.25, 0.4, 0.2, paint);
  }
  // мосты, коробка передач, двигатель
  cyl(0.14, 0.14, 1.2, 12, iron, body).rotation.z = Math.PI / 2;
  body.children[body.children.length - 1].position.set(0, 0.75, -0.75);
  box(1.12, 0.12, 0.14, iron, 0, 0.4, 1.25, body);
  box(0.62, 0.56, 1.0, iron, 0, 0.82, -0.6, body);
  box(0.5, 0.42, 1.25, iron, 0, 0.7, 0.88, body);
  // капот, решётка, фары, передний груз
  box(0.72, 0.55, 1.45, paint, 0, 1.2, 0.95, body);
  box(0.6, 0.06, 1.42, paint, 0, 1.49, 0.95, body);
  box(0.64, 0.48, 0.04, grill, 0, 1.18, 1.685, body);
  for (let i = 0; i < 4; i++) box(0.62, 0.025, 0.02, MAT.chrome, 0, 1.02 + i * 0.1, 1.71, body);
  for (const s of [1, -1]) {
    for (let i = 0; i < 3; i++) box(0.02, 0.05, 0.6, grill, s * 0.362, 1.12 + i * 0.1, 1.15, body);   // жалюзи
    cyl(0.075, 0.075, 0.05, 14, MAT.chrome, body).rotation.x = Math.PI / 2;
    body.children[body.children.length - 1].position.set(s * 0.43, 1.32, 1.6);
    cyl(0.06, 0.06, 0.02, 14, MAT.head, body).rotation.x = Math.PI / 2;
    body.children[body.children.length - 1].position.set(s * 0.43, 1.32, 1.63);
    box(0.08, 0.05, 0.12, iron, s * 0.4, 1.32, 1.53, body);
  }
  box(0.8, 0.2, 0.12, grill, 0, 0.62, 1.73, body);
  // выхлопная труба и воздухоочиститель
  cyl(0.045, 0.045, 0.7, 10, MAT.black, body).position.set(0.24, 1.8, 0.6);
  cyl(0.06, 0.05, 0.06, 10, MAT.black, body).position.set(0.24, 2.17, 0.6);
  cyl(0.06, 0.06, 0.24, 12, MAT.chrome, body).position.set(-0.24, 1.62, 0.6);
  // бак-приборная панель, руль, площадка
  box(0.6, 0.35, 0.32, paint, 0, 1.4, 0.08, body);
  beam([0, 1.45, 0.05], [0, 1.74, -0.24], 0.04, MAT.black, body);
  const sw = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.018, 6, 20), MAT.black);
  sw.position.set(0, 1.76, -0.26); sw.rotation.x = -1.05; sw.castShadow = true; body.add(sw);
  box(1.06, 0.04, 0.8, grill, 0, 1.06, -0.4, body);
  // задние крылья: дуги над колёсами (профиль z, y) и внутренние стенки
  const fender = new THREE.Shape(), zc = -0.75, yc = 0.75, Ro = 0.86, Ri = 0.81, a0 = 0.45, a1 = 2.75;
  fender.moveTo(zc + Ro * Math.cos(a0), yc + Ro * Math.sin(a0));
  fender.absarc(zc, yc, Ro, a0, a1, false);
  fender.lineTo(zc + Ri * Math.cos(a1), yc + Ri * Math.sin(a1));
  fender.absarc(zc, yc, Ri, a1, a0, true);
  for (const s of [1, -1]) {
    extrude(fender, 0.42, paint, 0.01, body).position.x = s * 0.73;
    box(0.04, 0.5, 1.15, paint, s * 0.52, 1.32, -0.75, body);
    box(0.06, 0.1, 0.04, MAT.tail, s * 0.8, 1.2, -1.53, body);
  }
  // сиденье на стойке
  box(0.44, 0.08, 0.38, MAT.black, 0, 1.44, -0.88, body);
  box(0.44, 0.26, 0.06, MAT.black, 0, 1.6, -1.08, body).rotation.x = -0.15;
  beam([0, 1.0, -0.8], [0, 1.4, -0.88], 0.06, iron, body);
  // дуга безопасности и тент
  for (const s of [1, -1]) box(0.08, 1.3, 0.08, MAT.black, s * 0.55, 1.68, -1.22, body);
  box(1.18, 0.08, 0.08, MAT.black, 0, 2.3, -1.22, body);
  for (const s of [1, -1]) beam([s * 0.55, 2.3, -1.22], [s * 0.5, 2.33, -0.3], 0.04, MAT.black, body);
  box(1.28, 0.05, 1.2, ruralMat(0x34402f, 0.9), 0, 2.37, -0.72, body);
  // задняя навеска и дышло со шкворнем на месте сцепки (z = −1,8 − 0,4)
  for (const s of [1, -1]) beam([s * 0.3, 0.72, -1.15], [s * 0.32, 0.5, -1.55], 0.06, iron, body);
  beam([0, 1.05, -1.1], [0, 0.85, -1.5], 0.06, iron, body);
  box(0.13, 0.06, 0.9, iron, 0, 0.51, -1.75, body);
  cyl(0.03, 0.03, 0.16, 8, MAT.chrome, body).position.set(0, 0.56, -2.18);
  // тракторист: синяя роба, соломенная шляпа
  const work = ruralMat(0x3c5a7d, 0.85), skin = ruralMat(RURAL_SKIN, 0.75), straw = ruralMat(0xd8c27a, 0.8);
  const boot = ruralMat(0x2b2420, 0.7);
  box(0.36, 0.16, 0.3, work, 0, 1.55, -0.86, body);
  for (const s of [1, -1]) {
    beam([s * 0.11, 1.56, -0.8], [s * 0.15, 1.58, -0.42], 0.13, work, body);
    beam([s * 0.15, 1.58, -0.42], [s * 0.17, 1.12, -0.32], 0.11, work, body);
    box(0.1, 0.08, 0.22, boot, s * 0.17, 1.12, -0.27, body);
    beam([s * 0.2, 1.95, -0.85], [s * 0.25, 1.74, -0.6], 0.09, work, body);
    beam([s * 0.25, 1.74, -0.6], [s * 0.15, 1.77, -0.3], 0.075, skin, body);
  }
  box(0.38, 0.46, 0.24, work, 0, 1.82, -0.88, body).rotation.x = 0.1;
  ruralBall(skin, 0, 2.13, -0.83, 0.1, 0.11, 0.1, body);
  cyl(0.21, 0.21, 0.02, 18, straw, body).position.set(0, 2.21, -0.83);
  cyl(0.1, 0.11, 0.1, 14, straw, body).position.set(0, 2.27, -0.83);
  return { root, paint, dims: { L: 3.6, W: 1.9, H: 2.4 } };
}

/* =====================================================================
   ТЕЛЕЖКА С СЕНОМ (3,6 × 1,8 × 2,6): одна ось посередине, тюки в четыре слоя, лесенка спереди, дышло вперёд.
   Кольцо дышла — в 3,0 м перед осью (bar), там же шкворень трактора
   ===================================================================== */
let _hayMat = null;
function buildHaycartModel() {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const paint = ruralPaint(0.05, 0.75);
  const iron = ruralMat(0x3a3530, 0.7, 0.3);
  for (const s of [1, -1]) ruralBigWheel(root, s * 0.76, 0, 0.45, 0.2, paint);
  box(1.5, 0.1, 0.1, iron, 0, 0.45, 0, body);
  for (const s of [1, -1]) box(0.1, 0.12, 3.3, iron, s * 0.45, 0.85, 0, body);
  // платформа, низкие борта, лесенка спереди, стойки сзади
  box(1.8, 0.08, 3.5, paint, 0, 0.95, 0, body);
  for (const s of [1, -1]) box(0.04, 0.2, 3.5, paint, s * 0.88, 1.08, 0, body);
  for (const x of [-0.86, -0.3, 0.3, 0.86]) box(0.07, 1.42, 0.07, paint, x, 1.7, 1.72, body);
  for (const y of [1.5, 2.0, 2.38]) box(1.8, 0.06, 0.06, paint, 0, y, 1.72, body);
  for (const s of [1, -1]) box(0.07, 0.6, 0.07, paint, s * 0.86, 1.29, -1.72, body);
  for (const s of [1, -1]) box(0.08, 0.08, 0.03, MAT.tail, s * 0.8, 0.95, -1.765, body);
  // дышло: две тяги от рамы к кольцу сцепки
  for (const s of [1, -1]) beam([s * 0.45, 0.85, 1.6], [0, 0.55, 2.85], 0.08, iron, body);
  beam([0, 0.55, 2.85], [0, 0.5, 2.98], 0.06, iron, body);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.018, 6, 12), iron);
  ring.position.set(0, 0.5, 3.0); ring.rotation.x = Math.PI / 2; ring.castShadow = true; body.add(ring);
  // тюки: соломенная текстура с двумя шпагатами, 2 × 7 в слое, четыре слоя; верх неровный
  _hayMat ??= (() => {
    const m = canvasMat(64, 64, (x, w, h) => {
      x.fillStyle = '#d6b45a'; x.fillRect(0, 0, w, h);
      let s = 7;
      const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < 260; i++) {
        x.fillStyle = rnd() < 0.5 ? 'rgba(150,115,45,0.5)' : 'rgba(245,220,130,0.55)';
        x.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 6, 1);
      }
      x.fillStyle = 'rgba(110,80,35,0.85)'; x.fillRect(0, h * 0.3, w, 2); x.fillRect(0, h * 0.68, w, 2);
    });
    m.roughness = 1; return m;
  })();
  const skip = new Set(['3,0,1', '3,6,0', '3,6,1', '3,5,0']);           // недостающие тюки верхнего слоя
  for (let l = 0; l < 4; l++) for (let i = 0; i < 7; i++) for (let j = 0; j < 2; j++) {
    if (skip.has(`${l},${i},${j}`)) continue;
    const jit = Math.sin(l * 12.9 + i * 78.2 + j * 37.7) * 0.03;
    box(0.86, 0.36, 0.44, _hayMat, (j ? 0.44 : -0.44) + jit, 1.17 + l * 0.37, -1.38 + i * 0.46 - jit, body).rotation.y = jit * 0.6;
  }
  return { root, paint, dims: { L: 3.6, W: 1.8, H: 2.6 } };
}

/* =====================================================================
   ТИПЫ МАШИН «ПОБЕРЕЖЬЯ»
   ===================================================================== */
const COAST_TRAFFIC_TYPES = [
  { id: 'scooter', w: 45, vmax: 12, mass: 220, accel: 2.6, lean: true,
    paints: [0x8fc7c0, 0xe8d9a8, 0xd94c3d, 0xf2f0e8, 0x7da0d0, 0xa8c97a], model: buildScooterModel },
  { id: 'ape', w: 35, vmax: 10, mass: 500, accel: 1.8, climb: 2.5,
    paints: [0x6f9ccf, 0xe2b04a, 0x9cbf6a, 0xd8d2c0, 0xc8553d], model: buildApeModel },
  { id: 'tractor', w: 20, vmax: 7, mass: 3200, accel: 1.2, climb: 1.5, long: true, max: 2,
    paints: [0xc8352b, 0x2f7d3a, 0x2f5fa8, 0xe0a020], model: buildTractorModel,
    // тележка с сеном: gap — от задка трактора до сцепки, bar — от сцепки до оси тележки (ось — в середине кузова)
    trailer: { id: 'haycart', vmax: 7, mass: 1500, accel: 1, gap: 0.4, bar: 3.0, paints: [0xa8452f, 0x6b4a2e, 0x3d6b8a],
      model: buildHaycartModel } },
];
