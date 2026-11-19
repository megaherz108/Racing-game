// Ситжес — общая геометрия раскладки и постройки: сетка по клеткам, точка в многоугольнике, рамка контура,
// расстояние до отрезка. Раньше каждый этап собирал это сам (≈ 11 сеток, 3 копии «точки в многоугольнике»).
// Арифметика — ровно как была в этапах: замена не меняет карту (__game.fingerprint('sitges')).
// Определяет: sitgesCells, sitgesInPoly, sitgesBBox, SITGES_SEG, sitgesSeg.
// Использует: clamp (js/core.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

// Сетка по клеткам size м: ключ клетки — ci·65536 + cj. Порядок в списке клетки — порядок add(): от него зависят
// выборы «первый / лучший при равенстве», поэтому этапы добавляют в том же порядке, что и раньше.
//   add(x0, x1, z0, z1, item) — во все клетки прямоугольника; at(x, z) — список клетки точки (или пустой);
//   key(x, z) / get(k) — клетка по ключу; each(x0, x1, z0, z1, fn) — fn(список) по клеткам прямоугольника
function sitgesCells(size) {
  const map = new Map(), EMPTY = [];
  const key = (x, z) => Math.floor(x / size) * 65536 + Math.floor(z / size);
  return {
    size, map, key,
    add(x0, x1, z0, z1, item) {
      for (let ci = Math.floor(x0 / size); ci <= Math.floor(x1 / size); ci++)
        for (let cj = Math.floor(z0 / size); cj <= Math.floor(z1 / size); cj++) {
          const k = ci * 65536 + cj;
          let l = map.get(k);
          if (!l) map.set(k, l = []);
          l.push(item);
        }
    },
    at: (x, z) => map.get(key(x, z)) || EMPTY,
    get: k => map.get(k),
    each(x0, x1, z0, z1, fn) {
      for (let ci = Math.floor(x0 / size); ci <= Math.floor(x1 / size); ci++)
        for (let cj = Math.floor(z0 / size); cj <= Math.floor(z1 / size); cj++) { const l = map.get(ci * 65536 + cj); if (l) fn(l); }
    },
  };
}

// точка внутри кольца [[x, z], …] (чёт-нечет)
function sitgesInPoly(x, z, r) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [ax, az] = r[i], [bx, bz] = r[j];
    if ((az > z) !== (bz > z) && x < ax + (bx - ax) * (z - az) / (bz - az)) c = !c;
  }
  return c;
}

// рамка кольца: [x0, x1, z0, z1]
function sitgesBBox(r) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of r) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  return [x0, x1, z0, z1];
}

// расстояние от (x, z) до отрезка a–b; параметр ближайшей точки — SITGES_SEG.t (общий объект, без выделения памяти)
const SITGES_SEG = { t: 0, d: 0 };
function sitgesSeg(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, LL = dx * dx + dz * dz || 1, t = clamp(((x - ax) * dx + (z - az) * dz) / LL, 0, 1);
  SITGES_SEG.t = t;
  return SITGES_SEG.d = Math.hypot(x - ax - dx * t, z - az - dz * t);
}
