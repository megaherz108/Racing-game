// Ощущение удара и скорости: «стоп-кадр» на долю секунды при сильном ударе, замедление времени при нокауте
// и в высоком прыжке, толчок угла обзора камеры, вспышка экрана, расширение обзора на нитро.
// Определяет: FEEL, Feel.
// Использует: clamp, lerp (js/core.js); smooth01 (js/world.js); Sound (js/audio.js); cars (js/physics.js); HUD
//   (js/ui.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.

/* =====================================================================
   FEEL: время, вспышки, угол обзора
   ===================================================================== */
const FEEL = {
  stopMin: 0.04, stopMax: 0.1,  // длительность стоп-кадра, с (реального времени)
  stopCar: 5,                   // сила удара машина — машина, с которой включается стоп-кадр
  stopWall: 8,                  // то же для удара о стену (только в одиночной езде: вдвоём это мешало бы второму игроку)
  koSlow: 0.28, koTime: 1.1,    // нокаут: во сколько раз медленнее и сколько секунд
  airSlow: 0.55, airH: 9,       // одиночная езда: замедление в прыжке выше airH м
  kickMax: 9,                   // насколько (градусов) угол обзора «сжимается» от удара
  boostFov: 9,                  // насколько угол обзора шире на нитро
};

const Feel = (() => {
  let stopT = 0, slowT = 0, airK = 0, scale = 1;
  const kick = [0, 0], boost = [0, 0], airH = [0, 0];
  const flashEl = [0, 1].map(p => {
    const d = document.createElement('div'); d.className = 'flash'; HUD[p].root.appendChild(d); return d;
  });
  function flash(p, kind, a) {
    if (a <= 0.02 || !flashEl[p]) return;
    const d = flashEl[p];
    d.className = 'flash ' + kind; d.style.transition = 'none'; d.style.opacity = a.toFixed(2);
    void d.offsetWidth; d.style.transition = ''; d.style.opacity = 0;
  }
  return {
    reset() { stopT = slowT = airK = 0; scale = 1; kick.fill(0); boost.fill(0); airH.fill(0); Sound.slow(0); },
    // удар по машине car с силой strength (Δv, м/с); withCar — удар о машину соперника
    impact(car, strength, withCar) {
      const p = car.p;
      kick[p] = Math.min(FEEL.kickMax, kick[p] + strength * 0.55);
      flash(p, 'hit', clamp((strength - 4) / 14, 0, 0.4));
      const solo = cars.length === 1;
      if (strength > (withCar ? FEEL.stopCar : FEEL.stopWall) && (withCar || solo))
        stopT = Math.max(stopT, clamp(0.02 + strength * 0.006, FEEL.stopMin, FEEL.stopMax));
    },
    ko(attacker, victim) { slowT = FEEL.koTime; flash(attacker, 'gold', 0.35); flash(victim, 'hit', 0.55); },
    trick(p) { flash(p, 'boost', 0.12); },
    air(p, h) { airH[p] = h; },
    // вызывается раз в кадр с реальным dt; возвращает множитель времени игры
    step(dt) {
      for (let p = 0; p < cars.length; p++) {
        kick[p] *= Math.exp(-dt * 7);
        boost[p] += ((cars[p].boosting ? 1 : 0) - boost[p]) * Math.min(1, dt * 5);
      }
      let target = 1;
      if (slowT > 0) { slowT -= dt; target = lerp(1, FEEL.koSlow, smooth01(slowT / 0.4)); }
      const wantAir = cars.length === 1 && airH[0] > FEEL.airH ? 1 : 0;
      airK += (wantAir - airK) * Math.min(1, dt * 3);
      target = Math.min(target, lerp(1, FEEL.airSlow, airK));
      if (stopT > 0) { stopT -= dt; target = 0.03; }
      scale = target;
      Sound.slow(1 - Math.min(1, scale + (stopT > 0 ? 0.8 : 0)));
      return scale;
    },
    // добавка к углу обзора камеры игрока p (градусы)
    fov(p) { return boost[p] * FEEL.boostFov - kick[p]; },
    boost(p) { return boost[p]; },
    get scale() { return scale; },
  };
})();
