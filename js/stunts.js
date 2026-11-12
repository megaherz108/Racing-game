// Трюки и нитро: занос, полёт, проезд впритирку к трафику и разгром уличной мелочи наполняют шкалу нитро.
// Трюки подряд (в пределах TRICK.comboWin секунд) растят множитель комбо. Удар обрывает занос и комбо.
// Здесь же видимые эффекты нитро (пламя из выхлопа) и хлопки выхлопа при сбросе газа на высоких оборотах.
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.

/* =====================================================================
   ТРЮКИ И НИТРО
   ===================================================================== */
const TRICK = {
  driftSlip: 3.2,     // боковая скорость, м/с, с которой езда считается заносом
  driftSpeed: 9,      // минимальная скорость заноса, м/с
  driftGain: 0.1,     // нитро за секунду заноса
  driftMin: 0.8,      // занос короче этого (с) не засчитывается
  driftEnd: 0.35,     // сколько секунд без скольжения завершают занос
  airMin: 0.6,        // минимальное время полёта, с
  airHeight: 1.2,     // и высота над землёй, м
  airGain: 0.11,      // нитро за секунду полёта
  nearGap: 1.5,       // «впритирку»: зазор между бортами меньше, м
  nearSpeed: 11,      // при относительной скорости больше, м/с
  nearGain: 0.12,
  smashGain: 0.00025, // нитро за килограмм сбитого объекта
  smashMax: 0.05,
  comboWin: 3,        // окно комбо, с
  comboMax: 5,
};

const Stunts = (() => {
  const mk = () => ({ drift: 0, driftOff: 0, driftHit: false, air: 0, airH: 0, combo: 1, comboT: 0, near: [], smash: 0, smashT: 0,
    prevThr: 0, pops: [], wasBoost: false, live: '' });
  let S = [mk(), mk()];
  const el = [0, 1].map(p => {
    const r = HUD[p].root;
    const n = document.createElement('div'); n.className = 'nitro';
    n.innerHTML = '<div class="nbar"><div class="nfill"></div></div><span>НИТРО</span>';
    r.querySelector('.hp').appendChild(n);
    const t = document.createElement('div'); t.className = 'tricklive hidden'; r.appendChild(t);
    return { n, fill: n.querySelector('.nfill'), t, w: '', txt: '', on: null };
  });

  function award(p, text, amount) {
    const s = S[p], c = cars[p];
    s.combo = s.comboT > 0 ? Math.min(TRICK.comboMax, s.combo + 1) : 1;
    s.comboT = TRICK.comboWin;
    c.nitro = Math.min(1, c.nitro + amount * (1 + (s.combo - 1) * 0.25));
    notify(p, s.combo > 1 ? `${text} <b>×${s.combo}</b>` : text, 'trick');
    Sound.trick(p, s.combo);
    Feel.trick(p);
  }
  // точка выхлопа машины c (сторона side = ±1)
  function exhaust(c, side) {
    const [x, z] = c.local(side * c.W * 0.27, -c.L / 2 - 0.05);
    return [x, c.y + (c.g.style === 'super' ? 0.55 : 0.35), z];
  }
  function flame(c, big) {
    const fx = Math.sin(c.h), fz = Math.cos(c.h);
    for (const side of [1, -1]) {
      const [x, y, z] = exhaust(c, side), sp = big ? 1 : rand(0.5, 1);
      // ядро пламени (голубое у нитро, оранжевое у хлопка) и хвост, который отстаёт от машины
      sparks.spawn(x, y, z, c.vx - fx * 4 * sp, rand(0, 0.4), c.vz - fz * 4 * sp,
        big ? 1.1 : 0.85, 0.2, big ? 0.13 : 0.12, big ? 0xff9a3a : 0x5ac0ff, 1);
      if (!big || Math.random() < 0.5) sparks.spawn(x, y + 0.05, z, c.vx - fx * 11 * sp + rand(-0.8, 0.8), rand(-0.1, 0.8), c.vz - fz * 11 * sp + rand(-0.8, 0.8),
        0.55, 0.1, rand(0.14, 0.24), big ? 0xffd060 : Math.random() < 0.5 ? 0x9fdcff : 0xffa040, 0.9);
    }
  }

  function updateCar(p, dt) {
    const c = cars[p], s = S[p];
    if (s.comboT > 0 && (s.comboT -= dt) <= 0) s.combo = 1;
    const spd = Math.hypot(c.vx, c.vz), alive = c.drown <= 0 && c.broken <= 0;

    // занос: нитро копится, пока машину несёт боком
    const sliding = alive && c.grounded && Math.abs(c.vf) > TRICK.driftSpeed && Math.abs(c.vl) > TRICK.driftSlip;
    if (sliding) {
      if (s.drift === 0) s.driftHit = false;
      s.drift += dt; s.driftOff = 0;
      c.nitro = Math.min(1, c.nitro + TRICK.driftGain * dt * (1 + (s.combo - 1) * 0.25));
    } else if (s.drift > 0 && (s.driftOff += dt) > TRICK.driftEnd) {
      if (!s.driftHit && s.drift >= TRICK.driftMin) award(p, `ЗАНОС ${s.drift.toFixed(1)} с`, 0.03 + s.drift * 0.015);
      s.drift = 0;
    }

    // полёт: время в воздухе и высота над поверхностью
    let h = 0;
    if (!c.grounded && c.drown <= 0) {
      h = c.y - surfaceAt(c.x, c.z, c.y + 0.5);
      s.air += dt; s.airH = Math.max(s.airH, h);
    } else if (s.air > 0) {
      if (s.air >= TRICK.airMin && s.airH >= TRICK.airHeight && c.upY > 0.5 && c.drown <= 0)
        award(p, `ПОЛЁТ ${s.air.toFixed(1)} с · ${Math.round(s.airH)} м`, TRICK.airGain * s.air);
      s.air = 0; s.airH = 0;
    }
    Feel.air(p, h);

    // впритирку: машина трафика прошла вплотную к борту на большой относительной скорости и без удара
    if (alive && spd > 6) {
      const sh = Math.sin(c.h), ch = Math.cos(c.h);
      for (const tc of Traffic.list) {
        if (tc.dead || tc.wreck) continue;
        const dx = tc.x - c.x, dz = tc.z - c.z;
        if (dx * dx + dz * dz > 225 || Math.abs(tc.y - c.y) > 3) continue;
        if (tc.nm && simTime - tc.nm[p] < 5) continue;
        const along = dx * sh + dz * ch, side = Math.abs(dx * ch - dz * sh), half = (c.W + tc.W) / 2;
        if (Math.abs(along) > (c.L + tc.L) / 2 + 0.5 || side > half + TRICK.nearGap || side < half - 0.2) continue;
        const tv = tc.far ? { x: Math.sin(tc.h) * tc.v, z: Math.cos(tc.h) * tc.v } : tc.body.linvel();
        if (Math.hypot(c.vx - tv.x, c.vz - tv.z) < TRICK.nearSpeed) continue;
        (tc.nm || (tc.nm = [-9, -9]))[p] = simTime;
        s.near.push({ tc, t: simTime });
      }
    }
    // засчитываем через 0,6 с, если за это время не было удара
    for (let i = s.near.length - 1; i >= 0; i--) {
      const n = s.near[i];
      if (simTime - n.t < 0.6) continue;
      s.near.splice(i, 1);
      if (c.hitTime < n.t - 0.3 && !n.tc.wreck && alive) award(p, 'ВПРИТИРКУ!', TRICK.nearGain);
    }

    // разгром: серия сбитых объектов
    if (s.smashT > 0 && (s.smashT -= dt) <= 0) {
      if (s.smash >= 3) award(p, `РАЗГРОМ · ${s.smash}`, 0.03);
      s.smash = 0;
    }

    // нитро: пламя и звук
    if (c.boosting) { flame(c, false); if (!s.wasBoost) Sound.nitroStart(p); }
    s.wasBoost = c.boosting;
    // хлопки выхлопа: сброс газа на высоких оборотах
    if (s.prevThr > 0 && c.thr <= 0 && c.grounded && spd > c.maxSpeed * 0.45 && Math.random() < 0.85) {
      const n = 2 + Math.floor(Math.random() * 3);
      for (let k = 0; k < n; k++) s.pops.push(0.05 + k * rand(0.07, 0.13));
    }
    s.prevThr = c.thr;
    for (let i = s.pops.length - 1; i >= 0; i--) {
      if ((s.pops[i] -= dt) > 0) continue;
      s.pops.splice(i, 1);
      if (c.drown > 0) continue;
      Sound.pop(p); flame(c, true);
    }

    // HUD: шкала нитро и текущий трюк
    const E = el[p], w = (c.nitro * 100).toFixed(1) + '%';
    if (E.w !== w) { E.w = w; E.fill.style.width = w; }
    const on = c.boosting ? 'boost' : c.nitro >= 0.999 ? 'full' : c.nitro > NITRO.minStart ? 'ready' : '';
    if (E.on !== on) { E.on = on; E.n.className = 'nitro ' + on; }
    let txt = '';
    if (s.drift >= 0.4) txt = `ЗАНОС ${s.drift.toFixed(1)} с`;
    else if (s.air >= 0.4 && h > 0.8) txt = `ПОЛЁТ ${s.air.toFixed(1)} с`;
    if (txt && s.combo > 1) txt += ` · ×${s.combo}`;
    if (E.txt !== txt) { E.txt = txt; E.t.textContent = txt; E.t.classList.toggle('hidden', !txt); }
  }

  return {
    reset() {
      S = [mk(), mk()];
      for (const E of el) { E.w = E.txt = ''; E.on = null; E.t.classList.add('hidden'); }
    },
    update(dt) { if (countdown > 0) return; for (let p = 0; p < cars.length; p++) updateCar(p, dt); },
    // удар: обрывает текущий занос и комбо
    crash(p) { const s = S[p]; if (s.drift > 0) s.driftHit = true; s.combo = 1; s.comboT = 0; },
    // машина игрока p сбила объект массой mass, кг
    smash(p, mass) {
      const c = cars[p], s = S[p];
      if (!c) return;
      c.nitro = Math.min(1, c.nitro + Math.min(TRICK.smashMax, mass * TRICK.smashGain));
      s.smash++; s.smashT = 1.2;
    },
  };
})();
