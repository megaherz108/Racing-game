// Город — РАСКЛАДКА: места для длинных прыжков (js/jumps.js), этап после эстакады, перед мини-картой.
//   «Ремонт дороги» — стальной лист, подложенный краем на щебень, у обочины длинной улицы пригорода; сбоку —
//   полосатое ограждение работ. Дюны на пляже — горб рельефа: пологий наветренный склон и крутой подветренный.
// ВАЖНО: этап не вызывает R(), поэтому остальной город от него не меняется. Рельеф дюн добавляется к C.ground
//   только здесь — после этапов, которые расставляют объекты по высоте земли; зонтики с дюн убираются.
//   C.dune(x, z) — высота дюны над пляжем: по ней js/maps/city/ground.js подкрашивает песок, чтобы горб было видно.
// Определяет: CITY_JUMPS, cityPlanJumps.
// Использует: smooth01 (js/world.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const CITY_JUMPS = {
  // лист на улице: axis — вдоль какой оси идёт улица, at — координата её оси, mid — середина листа вдоль улицы,
  // dir — куда прыгать (±1 по оси улицы), side — у какой обочины (±1 поперёк)
  roadworks: [
    { axis: 'z', at: 280, mid: -200, dir: -1, side: 1 },
    { axis: 'z', at: -560, mid: -560, dir: 1, side: -1 },
    { axis: 'x', at: -380, mid: -480, dir: 1, side: -1 },
  ],
  // длина разгона, высота кромки, ширина листа, расстояние от оси улицы до середины листа (полосы трафика — 3,5 м)
  plate: { L: 8, h: 1.3, w: 3.2, lat: 5.1 },
  // дюны: гребень (x, z), dir — куда прыгать (±1 по x); H — высота, up / down — длина наветренного / подветренного
  // склона, half — полуширина гребня (дальше ещё 7 м на сход на нет)
  dunes: [{ x: -330, z: -815, dir: 1 }, { x: 330, z: -815, dir: -1 }],
  dune: { H: 2.6, up: 20, down: 9, half: 12 },
};

function cityPlanJumps(C) {
  const { deckPlan, umbrellas } = C;
  const P = CITY_JUMPS.plate;

  /* ---------- ремонт дороги: стальной лист ---------- */
  for (const r of CITY_JUMPS.roadworks) {
    // точка (вдоль улицы a, поперёк b) → [x, z]
    const at = (a, b) => r.axis === 'z' ? [r.at + r.side * b, a] : [a, r.at + r.side * b];
    const a0 = r.mid - r.dir * P.L / 2, a1 = r.mid + r.dir * P.L / 2;
    const [x0, z0] = at(a0, P.lat), [x1, z1] = at(a1, P.lat);
    deckPlan.push({ kind: 'wedge', p0: [x0, 0.02, z0], p1: [x1, P.h, z1], w: P.w, mat: 'plate', base: -0.3 });
    // полосатое ограждение работ у бордюра и за кромкой (не на пути)
    const [fx0, fz0] = at(a0 - r.dir * 1.5, P.lat + P.w / 2 + 0.3), [fx1, fz1] = at(a1, P.lat + P.w / 2 + 0.3);
    deckPlan.push({ kind: 'slab', p0: [fx0, 0.95, fz0], p1: [fx1, 0.95, fz1], w: 0.12, t: 0.5, walk: false, mat: 'hazard' });
  }

  /* ---------- дюны на пляже: горб рельефа ---------- */
  const D = CITY_JUMPS.dune;
  const dune = (x, z) => {
    let h = 0;
    for (const d of CITY_JUMPS.dunes) {
      const u = (x - d.x) * d.dir, v = Math.abs(z - d.z);
      if (u < -D.up || u > D.down || v > D.half + 7) continue;
      // наветренный склон круче к гребню (с него и прыгают), подветренный — плавный сход
      const prof = u <= 0 ? ((u + D.up) / D.up) ** 2 : 1 - smooth01(u / D.down);
      h += D.H * prof * smooth01((D.half + 7 - v) / 7);
    }
    return h;
  };
  const g0 = C.ground;
  const ground = (x, z) => { const g = g0(x, z); return g < 0 ? g : g + dune(x, z); };
  // зонтики на дюнах мешали бы прыжку
  for (let i = umbrellas.length - 1; i >= 0; i--) if (dune(umbrellas[i][0], umbrellas[i][1]) > 0.05) umbrellas.splice(i, 1);

  Object.assign(C, { ground, dune });
}
