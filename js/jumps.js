// Длинные прыжки: длина по горизонтали от точки отрыва (последнее касание колёсами) до приземления. В свободной
// и одиночной езде (JUMP.modes) прыжок длиннее порога JUMP.tiers приносит монеты — но один и тот же трамплин платит
// раз в JUMP.cooldown с; лучшие прыжки каждой карты пишутся в таблицу save.jumps, первое место — монеты порога ещё раз.
// Прыжок засчитывается, если машина села на колёса и простояла на них JUMP.settle с (не перевернулась, не утонула).
// Определяет: jumpTable, Jumps.
// Использует: save, JUMP, persist (js/data.js); world (js/maps/registry.js); Sound (js/audio.js); cars, simTime
//   (js/physics.js); matchMode, countdown (js/match.js); notify, addCoins (js/ui.js); Feel (js/feel.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.

/* =====================================================================
   ДЛИННЫЕ ПРЫЖКИ
   ===================================================================== */
// таблица рекордов карты id (массив, по убыванию длины)
const jumpTable = id => (save.jumps || (save.jumps = {}))[id] || [];

const Jumps = (() => {
  const mk = () => ({ t: 0, x0: 0, z0: 0, d: 0, placeN: -1, pend: null, spots: [] });
  let S = [mk(), mk()];

  // прыжок длиной d с точки отрыва (x0, z0) засчитан
  function land(p, d, x0, z0) {
    const c = cars[p], s = S[p], m = Math.round(d);
    let tier = null;
    for (const t of JUMP.tiers) if (d >= t[0]) tier = t;
    if (!tier) return;                            // короткий — только «ПОЛЁТ» с нитро (js/stunts.js)
    const hot = s.spots.some(q => Math.hypot(q.x - x0, q.z - z0) < JUMP.spotR && simTime - q.t < JUMP.cooldown);
    if (hot) notify(p, `${tier[2]} · ${m} м <b>· трамплин остывает</b>`, 'trick');
    else {
      s.spots.push({ x: x0, z: z0, t: simTime });
      addCoins(p, tier[1]); notify(p, `${tier[2]} · ${m} м · +${tier[1]}`, 'gold', true); Sound.coin(p);
    }
    // таблица рекордов карты
    const id = world.id, list = jumpTable(id).slice();
    let place = list.findIndex(e => d > e.d);
    if (place < 0) place = list.length;
    if (place >= JUMP.top) return;
    const was = list[0];
    list.splice(place, 0, { d: Math.round(d * 10) / 10, p, car: c.def.short });
    save.jumps[id] = list.slice(0, JUMP.top);
    if (place === 0) {
      // рекорд удваивает монеты порога — и на «остывшем» трамплине: побить рекорд и так непросто
      addCoins(p, tier[1]);
      notify(p, `РЕКОРД КАРТЫ! ${m} м${was ? ` (было ${Math.round(was.d)})` : ''} · +${tier[1]}`, 'gold', true);
      Sound.ko(p); Feel.record(p);
      if (cars.length > 1) notify(1 - p, `Игрок ${p + 1} поставил рекорд прыжка: ${m} м`, 'trick');
    } else {
      persist();
      notify(p, `${place + 1}-е место в таблице прыжков`, 'trick');
    }
  }

  function updateCar(p, dt) {
    const c = cars[p], s = S[p];
    if (c.placeN !== s.placeN) {                  // перенос (старт, R, на дорогу) — прыжок обрывается
      s.placeN = c.placeN; s.t = 0; s.d = 0; s.pend = null; s.x0 = c.x; s.z0 = c.z;
      return;
    }
    if (!c.grounded && c.drown <= 0) {
      s.t += dt; s.d = Math.hypot(c.x - s.x0, c.z - s.z0);
    } else {
      if (s.t >= JUMP.minAir && c.drown <= 0) s.pend = { d: s.d, x0: s.x0, z0: s.z0, t: 0 };
      s.t = 0; s.x0 = c.x; s.z0 = c.z;
    }
    if (s.pend) {
      if (c.drown > 0 || c.broken > 0 || c.upY < 0.3) s.pend = null;
      else if ((s.pend.t += dt) >= JUMP.settle) {
        const q = s.pend; s.pend = null;
        if (JUMP.modes.includes(matchMode)) land(p, q.d, q.x0, q.z0);
      }
    }
  }

  return {
    reset() { S = [mk(), mk()]; },
    update(dt) { if (countdown > 0) return; for (let p = 0; p < cars.length; p++) updateCar(p, dt); },
    // длина текущего (или только что закончившегося) прыжка игрока p, м
    dist(p) { return S[p].d; },
  };
})();
