// Карта «Ситжес» — общее для скриптов конвейера: пути, прямоугольник скачивания, перевод координат.
// Модуль node (require), игра его не грузит.
//
// Системы координат:
//   WGS84 (широта, долгота)  — OSM;
//   ETRS89 / UTM 31N (EPSG:25831, метры E, N) — кадастр и рельеф ICGC; OSM переводим сюда (ETRS89 и WGS84
//     расходятся меньше чем на метр — для игры одно и то же);
//   локальные координаты игры (x, z, метры) — начало в центре карты, ось x вдоль берега (см. toLocal()).
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const RAW = path.join(__dirname, 'raw');                 // сырые данные, в git не попадают (.gitignore)
const OUT = path.join(ROOT, 'js', 'maps', 'sitges');     // готовые data-*.js

// прямоугольник скачивания (с запасом вокруг карты: за границей — фон, холмы)
const BBOX = { s: 41.210, w: 1.768, n: 41.262, e: 1.842 };

/* ---------- WGS84 → UTM 31N (ряд Крюгера, эллипсоид GRS80; точность — миллиметры) ---------- */
const A_ = 6378137, F_ = 1 / 298.257222101, K0 = 0.9996, LON0 = 3 * Math.PI / 180, FE = 500000;
const n_ = F_ / (2 - F_);
const AA = A_ / (1 + n_) * (1 + n_ * n_ / 4 + n_ ** 4 / 64);
const ALPHA = [n_ / 2 - 2 * n_ * n_ / 3 + 5 * n_ ** 3 / 16, 13 * n_ * n_ / 48 - 3 * n_ ** 3 / 5, 61 * n_ ** 3 / 240];
const E2 = 2 * Math.sqrt(n_) / (1 + n_);
function utm(lat, lon) {
  const phi = lat * Math.PI / 180, dl = lon * Math.PI / 180 - LON0, s = Math.sin(phi);
  const t = Math.sinh(Math.atanh(s) - E2 * Math.atanh(E2 * s));
  const xi = Math.atan2(t, Math.cos(dl)), eta = Math.atanh(Math.sin(dl) / Math.sqrt(1 + t * t));
  let e = eta, nn = xi;
  for (let j = 1; j <= 3; j++) {
    e += ALPHA[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
    nn += ALPHA[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
  }
  return [FE + K0 * AA * e, K0 * AA * nn];
}

/* ---------- UTM → локальные координаты игры ----------
   Берег идёт с юго-запада на северо-восток. Карту поворачиваем так, чтобы берег лёг вдоль оси x:
   прямоугольник границ (world.boundsX/boundsZ) и мини-карта тогда облегают город (≈ 3,9 × 1,3 км), а не
   косую полосу в квадрате ≈ 3,7 × 2,3 км, где треть площади — море и холмы.
   Оси как на «Побережье» (мини-карта рисует +z вверху, +x слева): z — от моря в сушу («север» карты),
   x — вдоль берега на юго-запад, то есть марина Айгуадольс на −x (справа на мини-карте), Террамар на +x.
   Это поворот без зеркала. Центр ORIGIN считает build.js (середина прямоугольника границ) и пишет в данные. */
const ROT = 19.5 * Math.PI / 180;          // направление берега от востока к северу в сетке UTM (наклон береговой
                                           // линии OSM по МНК — 19,4°; в плане «≈ 20°» — от истинного севера)
const ORIGIN = [0, 0];                     // центр карты в UTM — задаёт setOrigin() (build.js)
function setOrigin(e, n) { ORIGIN[0] = e; ORIGIN[1] = n; }
function toLocal(e, n) {
  const de = e - ORIGIN[0], dn = n - ORIGIN[1], c = Math.cos(ROT), s = Math.sin(ROT);
  return [-(de * c + dn * s), -de * s + dn * c];
}
function toUTM(x, z) {
  const c = Math.cos(ROT), s = Math.sin(ROT);
  return [ORIGIN[0] - x * c - z * s, ORIGIN[1] - x * s + z * c];
}
// UTM прямоугольник скачивания рельефа: углы BBOX, округлённые до 10 м наружу
function bboxUTM() {
  const pts = [[BBOX.s, BBOX.w], [BBOX.s, BBOX.e], [BBOX.n, BBOX.w], [BBOX.n, BBOX.e]].map(([a, b]) => utm(a, b));
  const r10 = (v, up) => (up ? Math.ceil(v / 10) : Math.floor(v / 10)) * 10;
  return {
    e0: r10(Math.min(...pts.map(p => p[0]))), e1: r10(Math.max(...pts.map(p => p[0])), 1),
    n0: r10(Math.min(...pts.map(p => p[1]))), n1: r10(Math.max(...pts.map(p => p[1])), 1),
  };
}

module.exports = { ROOT, RAW, OUT, BBOX, utm, ROT, ORIGIN, setOrigin, toLocal, toUTM, bboxUTM };
