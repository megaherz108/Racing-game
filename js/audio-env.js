// Звук окружения для каждого игрока (дополняет Sound из js/audio.js; обновляется из Sound.update()):
// - фон по районам: волны у берега и канала, чайки и пароходный гудок в порту, гул и далёкие гудки в Даунтауне,
//   колокол в Старом городе, птицы и шелест листвы в парке, ночью вместо птиц сверчки, в дождь — шум дождя.
//   Веса фонов в точке отдаёт карта (world.soundAt), они плавно перетекают при переезде из района в район;
// - эхо: под настилом (эстакада, мост, перемычка арки) — сильное, на мосту и эстакаде — слабое (Sound.reverb);
// - покрытие под колёсами: гул асфальта, тарахтение брусчатки и плитки, шорох травы, хруст грунта, шипение воды,
//   удары колёс на стыках плит мостов и эстакады;
// - шипение воды у сбитого гидранта, пока бьёт фонтан (world.geysers).
// Определяет: SoundEnv.
// Использует: rand, clamp (js/core.js); Sky (js/sky.js); Weather (js/weather.js); world (js/maps/registry.js); Sound
//   (js/audio.js); cars (js/physics.js); cams (js/match.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.

const SoundEnv = (() => {
  // покрытие: roar — гул шин (низкий шум с частотой roarF), am — глубина тарахтения, step — шаг камней или
  // неровностей, м (частота тарахтения = скорость / step), hiss — шорох или шипение с частотой hissF
  const ROAD = {
    asphalt: { roar: 0.5, roarF: 420, am: 0, step: 1, hiss: 0.05, hissF: 2600, hissQ: 0.6 },
    deck: { roar: 0.6, roarF: 330, am: 0.1, step: 0.8, hiss: 0.05, hissF: 2200, hissQ: 0.6 },
    paving: { roar: 0.6, roarF: 290, am: 0.45, step: 0.3, hiss: 0.08, hissF: 2000, hissQ: 0.6 },
    cobble: { roar: 1.0, roarF: 200, am: 0.85, step: 0.17, hiss: 0.1, hissF: 1500, hissQ: 0.6 },
    grass: { roar: 0.35, roarF: 170, am: 0.35, step: 0.9, hiss: 0.8, hissF: 4200, hissQ: 0.5 },
    dirt: { roar: 0.55, roarF: 240, am: 0.4, step: 0.45, hiss: 0.55, hissF: 1300, hissQ: 0.9 },
    sand: { roar: 0.45, roarF: 190, am: 0.15, step: 0.6, hiss: 0.5, hissF: 900, hissQ: 0.6 },
    wet: { roar: 0.4, roarF: 300, am: 0.1, step: 0.6, hiss: 1.0, hissF: 3200, hissQ: 0.5 },
  };
  const HARD = { asphalt: 1, deck: 1, paving: 1, cobble: 1 };     // в дождь по ним шипит вода
  const JOINT = 12;                                                // шаг стыков плит моста, м
  const KEYS = ['sea', 'gulls', 'hum', 'birds', 'leaves', 'bells', 'ship', 'horns', 'echo'];
  const DEF = { hum: 0.15 };                                       // карта без world.soundAt
  // фоны-записи (js/sound-data.js, папка sounds/): громкость от весов района w, ночи n и дождя r. Пока записи нет,
  // звучит синтез; когда есть — синтез из off молчит, а разовые звуки ev (птицы, чайки) не нужны: они уже в записи
  const BEDS = {
    waves: { k: w => w.sea, gain: 0.5, off: ['sea', 'surf'] },
    city: { k: w => w.hum, gain: 0.35, off: ['hum', 'wash'] },
    birds: { k: (w, n) => Math.max(w.birds, w.leaves * 0.6) * (1 - n), gain: 0.3, off: ['leaves'], ev: 'bird' },
    night: { k: (w, n) => (w.birds + w.leaves) * 0.5 * n, gain: 0.25, off: ['crG'] },
    rain: { k: (w, n, r) => r ? 1 : 0, gain: 0.4, off: ['rain'] },
    gulls: { k: w => w.gulls, gain: 0.3, ev: 'gull' },
  };
  // разовые звуки из записей вместо синтеза: событие → [запись, громкость]
  const EV_SAMPLE = { gull: ['gull', 0.6], bird: ['bird', 0.5], horn: ['horn', 0.25], ship: ['shiphorn', 0.7], bell: ['bell', 0.5] };
  const S = [];

  // петля записи name для игрока p: случайное начало (у двух игроков звук не совпадает)
  function loop(e, name, to) {
    const s = Sound.sample(name), ctx = Sound.ctx;
    if (!s) return null;
    const src = ctx.createBufferSource(); src.buffer = s.buf; src.loop = true;
    const g = ctx.createGain(); g.gain.value = 0; src.connect(g).connect(to);
    src.start(0, Math.random() * s.buf.duration);
    return { g, gain: s.gain };
  }

  function make(p) {
    const ctx = Sound.ctx, out = ctx.createGain(); out.gain.value = 0; out.connect(Sound.out(p));
    const src = buf => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(0, Math.random() * 1.8); return s; };
    const white = src(Sound.noiseBuf), brown = src(Sound.brownBuf);
    const chain = (from, type, f, q, to) => {
      const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0; from.connect(fl).connect(g).connect(to);
      return { f: fl, g };
    };
    // фоны
    const sea = chain(brown, 'lowpass', 600, 0.5, out), surf = chain(white, 'bandpass', 1700, 0.4, out);
    const hum = chain(brown, 'lowpass', 220, 0.7, out), wash = chain(white, 'bandpass', 750, 0.5, out);
    const leaves = chain(white, 'bandpass', 3000, 0.5, out), rain = chain(white, 'highpass', 1300, 0.5, out);
    // сверчки: тон 4,4 кГц, «стрекот» 28 Гц и трели с паузами
    const cr = ctx.createOscillator(); cr.frequency.value = 4400;
    const crA = ctx.createGain(), crB = ctx.createGain(), crG = ctx.createGain(); crA.gain.value = 0.5; crB.gain.value = 0.5; crG.gain.value = 0;
    const l1 = ctx.createOscillator(); l1.type = 'square'; l1.frequency.value = 28;
    const l2 = ctx.createOscillator(); l2.frequency.value = 0.65;
    const l1g = ctx.createGain(), l2g = ctx.createGain(); l1g.gain.value = 0.5; l2g.gain.value = 0.5;
    l1.connect(l1g).connect(crA.gain); l2.connect(l2g).connect(crB.gain);
    cr.connect(crA).connect(crB).connect(crG).connect(out);
    cr.start(); l1.start(); l2.start();
    // покрытие: гул с тарахтением (am.gain = 1 − глубина/2 + квадратная волна) и шорох — в шину игрока (с эхом)
    const bus = Sound.bus(p), rAm = ctx.createGain(); rAm.gain.value = 1;
    const roar = chain(brown, 'lowpass', 400, 0.8, bus);
    roar.f.disconnect(); roar.f.connect(rAm).connect(roar.g);
    const amO = ctx.createOscillator(); amO.type = 'square'; amO.frequency.value = 50;
    const amG = ctx.createGain(); amG.gain.value = 0; amO.connect(amG).connect(rAm.gain); amO.start();
    const hiss = chain(white, 'bandpass', 2600, 0.6, bus);
    // гидрант: шипение струи и плеск, своя панорама
    const gyPan = ctx.createStereoPanner(); gyPan.connect(Sound.master);
    const gy = chain(white, 'bandpass', 2800, 0.6, gyPan), gyLow = chain(brown, 'lowpass', 500, 0.7, gyPan);
    return { out, sea, surf, hum, wash, leaves, rain, crG, roar, rAm, amO, amG, hiss, gy, gyLow, gyPan,
      beds: {}, w: Object.fromEntries(KEYS.map(k => [k, 0])), wT: 0, jointD: 0, ev: { gull: 3, bird: 2, horn: 4, ship: 20, bell: 15 } };
  }

  /* ---------- где машина: веса фонов, крыша над головой, настил под колёсами ---------- */
  function weights(e, x, z) {
    const w = e.w;
    for (const k of KEYS) w[k] = 0;
    if (world.soundAt) world.soundAt(x, z, w); else Object.assign(w, DEF);
  }
  // крыша: нижняя грань плиты (мост, эстакада, перемычка арки) в 1,5–40 м над машиной
  function covered(x, z, y) {
    const dk = world.decks;
    if (!dk) return false;
    for (const d of dk.grid.query(x, x, z, z)) {
      if (d.shape !== 'slab') continue;
      const top = dk.top(d, x, z);
      if (top === -Infinity) continue;
      const bot = top - d.t;
      if (bot > y + 1.5 && bot < y + 40) return true;
    }
    return false;
  }
  // плита настила под колёсами (для стыков), null — едем по земле или по клину-трамплину
  function deckUnder(x, z, y) {
    const dk = world.decks;
    if (!dk) return null;
    for (const d of dk.grid.query(x, x, z, z)) if (d.walk && d.shape === 'slab' && Math.abs(dk.top(d, x, z) - y) < 0.8) return d;
    return null;
  }

  /* ---------- разовые звуки фона: панорама — случайная сторона в половине экрана игрока ---------- */
  function voice(p, side = rand(-0.9, 0.9)) {
    const ctx = Sound.ctx, pn = ctx.createStereoPanner(); pn.pan.value = Sound.panFor(p, side); pn.connect(Sound.master);
    return pn;
  }
  // нота: тип волны, частоты [начало, (вершина, время), конец], длительность, громкость; filter — полосовой
  function note(out, t, type, f0, f1, dur, gain, { peak = 0, pf = 0, bp = 0, att = 0.01 } = {}) {
    const ctx = Sound.ctx, o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (peak) { o.frequency.linearRampToValueAtTime(pf, t + peak); o.frequency.exponentialRampToValueAtTime(f1, t + dur); }
    else o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + att); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let n = o;
    if (bp) { const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = bp; f.Q.value = 1.2; n = o.connect(f); }
    n.connect(g).connect(out);
    o.start(t); o.stop(t + dur + 0.05);
  }
  const EVENTS = {
    // чайка: 2–4 крика «кья»
    gull(p, k) {
      const out = voice(p), t0 = Sound.ctx.currentTime, n = 2 + Math.floor(Math.random() * 3), f = rand(0.85, 1.15);
      for (let i = 0; i < n; i++) note(out, t0 + i * rand(0.32, 0.5), 'triangle', 1150 * f, 1250 * f, 0.3, 0.035 * k, { peak: 0.07, pf: 1900 * f, bp: 1700 });
    },
    // птица: короткая трель из быстрых свистов
    bird(p, k) {
      const out = voice(p), t0 = Sound.ctx.currentTime, n = 4 + Math.floor(Math.random() * 6), f = rand(2600, 4200);
      let t = t0;
      for (let i = 0; i < n; i++) {
        const d = rand(0.04, 0.09);
        note(out, t, 'sine', f * rand(0.85, 1.15), f * rand(0.7, 1.4), d, 0.018 * k);
        t += d + rand(0.02, 0.1);
      }
    },
    // далёкий автомобильный гудок
    horn(p, k) {
      const out = voice(p), t0 = Sound.ctx.currentTime, f = rand(0.85, 1.2), n = Math.random() < 0.4 ? 2 : 1;
      for (let i = 0; i < n; i++) for (const fr of [380, 480]) note(out, t0 + i * 0.32, 'square', fr * f, fr * f, rand(0.2, 0.45), 0.006 * k, { bp: 900, att: 0.02 });
    },
    // пароходный гудок
    ship(p, k) {
      const out = voice(p, rand(-0.5, 0.5)), t0 = Sound.ctx.currentTime;
      for (const fr of [82, 123]) note(out, t0, 'sawtooth', fr, fr * 0.99, 2.8, 0.03 * k, { bp: 300, att: 0.35 });
    },
    // колокол: негармонические обертоны, 3–5 ударов
    bell(p, k) {
      const out = voice(p, rand(-0.4, 0.4)), t0 = Sound.ctx.currentTime, n = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) for (const [r, a] of [[0.5, 0.6], [1, 1], [1.19, 0.5], [1.5, 0.35], [2, 0.3], [2.74, 0.15]])
        note(out, t0 + i * 1.7, 'sine', 330 * r, 330 * r, 2.6 / Math.sqrt(r), 0.016 * k * a, { att: 0.005 });
    },
  };
  // [вес фона, через сколько секунд повторять: от, до]
  const EV_RULE = { gull: ['gulls', 3, 9], bird: ['birds', 1.5, 5], horn: ['horns', 4, 12], ship: ['ship', 35, 70], bell: ['bells', 25, 50] };

  /* ---------- каждый кадр ---------- */
  function update(p, car, active, dt) {
    if (!Sound.ctx) return;
    const e = S[p] || (S[p] = make(p)), t = Sound.ctx.currentTime, T = (n, v, tau = 0.15) => n.gain.setTargetAtTime(v, t, tau);
    if (!active || !car) {
      T(e.out, 0, 0.3); T(e.roar.g, 0, 0.05); T(e.hiss.g, 0, 0.05); T(e.gy.g, 0, 0.1); T(e.gyLow.g, 0, 0.1);
      if (e.beds.hydrant) T(e.beds.hydrant.g, 0, 0.1);
      Sound.reverb(p, 0); e.wT = 0;
      return;
    }
    const x = car.x, z = car.z, y = car.y, sp = Math.hypot(car.vx, car.vz), drown = car.drown > 0;
    const night = Sky.night, rainy = Weather.raining;
    // фоны: веса пересчитываются 3 раза в секунду и плавно перетекают
    if ((e.wT -= dt) <= 0) {
      e.wT = 0.33;
      weights(e, x, z);
      const w = e.w, swell = 0.65 + 0.35 * Math.sin(t * 0.9 + p * 2);       // накат волн
      T(e.out, cars.length > 1 ? 0.75 : 1, 0.6);
      // записи: петля создаётся, как только запись декодирована; заменённый ею синтез молчит
      const off = e.off = new Set();
      for (const name in BEDS) {
        const B = BEDS[name], bed = e.beds[name] || (e.beds[name] = loop(e, name, e.out));
        if (!bed) continue;
        T(bed.g, B.k(w, night, rainy) * B.gain * bed.gain, 1.2);
        for (const o of B.off || []) off.add(o);
        if (B.ev) off.add(B.ev);
      }
      const syn = (name, v, tau) => T(name === 'crG' ? e.crG : e[name].g, off.has(name) ? 0 : v, tau);
      syn('sea', w.sea * 0.06 * swell, 1); syn('surf', w.sea * 0.02 * Math.max(0, swell - 0.55) * 2.5, 0.6);
      syn('hum', w.hum * 0.04, 1.2); syn('wash', w.hum * 0.012, 1.2);
      syn('leaves', w.leaves * 0.012 * (0.6 + 0.4 * Math.sin(t * 0.37 + p)), 1);
      syn('crG', (w.birds + w.leaves) * 0.5 * night * 0.008, 1.5);
      syn('rain', rainy ? 0.05 : 0, 1);
      // эхо: под крышей — сильное; на мосту над водой и на эстакаде — слабое; уличный «каньон» Даунтауна — чуть-чуть
      const deck = world.decks ? world.decks.surface(x, z, y + 0.3) : -Infinity, onDeck = deck > world.ground(x, z) + 0.5;
      const over = onDeck ? (world.water != null && world.ground(x, z) < world.water ? 0.3 : 0.15) : 0;
      Sound.reverb(p, e.wet = Math.max(covered(x, z, y) ? 0.9 : 0, over, w.echo));
      e.onDeck = onDeck;
    }
    // разовые звуки фона
    const w = e.w;
    for (const k in EV_RULE) {
      const [wk, lo, hi] = EV_RULE[k];
      if ((e.ev[k] -= dt) > 0) continue;
      e.ev[k] = rand(lo, hi);
      let k2 = w[wk];
      if (k === 'bird') k2 *= 1 - night;
      if (e.off && e.off.has(k)) continue;                                   // уже звучит в фоне-записи
      if (k2 > 0.05 && Math.random() < Math.min(1, k2 * 1.3)) {
        const [sn, sg] = EV_SAMPLE[k], kk = Math.min(1, k2);
        if (!Sound.play(sn, { gain: sg * kk, rate: rand(0.94, 1.06), pan: Sound.panFor(p, rand(-0.9, 0.9)) })) EVENTS[k](p, kk);
      }
    }
    // покрытие под колёсами
    const kind = e.onDeck ? 'deck' : world.surfaceKind ? world.surfaceKind(x, z) : 'asphalt';
    e.kind = kind;
    const R = ROAD[kind] || ROAD.asphalt, lvl = car.grounded && !drown ? clamp(sp / 28, 0, 1.2) : 0;
    const wetHiss = rainy && HARD[kind] ? 0.6 : 0;
    T(e.roar.g, R.roar * Math.pow(lvl, 1.3) * 0.07, 0.08);
    e.roar.f.frequency.setTargetAtTime(R.roarF * (0.8 + lvl * 0.4), t, 0.15);
    e.amO.frequency.setTargetAtTime(Math.max(5, sp / R.step) * rand(0.85, 1.15), t, 0.05);
    e.amG.gain.setTargetAtTime(R.am * 0.5, t, 0.15); e.rAm.gain.setTargetAtTime(1 - R.am * 0.5, t, 0.15);
    T(e.hiss.g, Math.max(R.hiss, wetHiss) * lvl * 0.035, 0.1);
    e.hiss.f.frequency.setTargetAtTime(wetHiss > R.hiss ? 3000 : R.hissF, t, 0.15);
    e.hiss.f.Q.setTargetAtTime(R.hissQ, t, 0.15);
    // стыки плит моста: удар передней оси, через базу — задней
    if (e.onDeck && lvl > 0.1 && deckUnder(x, z, y)) {
      e.jointD += sp * dt;
      if (e.jointD >= JOINT) {
        e.jointD %= JOINT; e.joints = (e.joints || 0) + 1;
        const k = clamp(sp / 30, 0.3, 1), at = car.L * 0.62 / Math.max(sp, 1);
        for (const a of [0, at]) {
          Sound.noise(0.08, { freq: 260, sweep: 0.5, gain: 0.22 * k, p, at: a });
          Sound.tone([58], 0.09, { gain: 0.16 * k, p, slide: 0.7, at: a });
        }
      }
    } else e.jointD = 0;
    // гидранты
    let gl = 0, gs = 0;
    const gys = world.geysers || [], cam = cams[p], m = cam && cam.matrixWorld.elements;
    for (const g of gys) {
      const dx = g.x - x, dz = g.z - z, d = Math.hypot(dx, dz), a = Math.min(1, g.t / 2) / (1 + (d / 9) ** 2);
      const side = m && d > 0.5 ? clamp((dx * m[0] + dz * m[2]) / d, -1, 1) : 0;
      if (!(g.heard & (1 << p))) {          // только что сбит: удар струи
        g.heard = (g.heard || 0) | (1 << p);
        if (d < 70) Sound.noise(0.7, { freq: 2600, type: 'bandpass', q: 0.8, sweep: 0.6, gain: 0.5 * a + 0.05, pan: Sound.panFor(p, side) });
      }
      if (a > gl) { gl = a; gs = side; }
    }
    e.geyser = gl;
    // запись струи гидранта, если есть, иначе синтез
    const hy = e.beds.hydrant || (e.beds.hydrant = loop(e, 'hydrant', e.gyPan)), syn = hy ? 0 : 1;
    if (hy) T(hy.g, gl * 0.6 * hy.gain, 0.2);
    T(e.gy.g, gl * 0.09 * syn, 0.2); T(e.gyLow.g, gl * 0.06 * syn, 0.2);
    e.gyPan.pan.setTargetAtTime(Sound.panFor(p, gs), t, 0.1);
  }

  // отладка: что слышит игрок p (__game: SoundEnv.info(0))
  const info = p => S[p] && { beds: Object.fromEntries(Object.entries(S[p].beds).filter(([, b]) => b).map(([k, b]) => [k, +b.g.gain.value.toFixed(3)])), kind: S[p].kind, wet: S[p].wet, joints: S[p].joints || 0, geyser: S[p].geyser, w: { ...S[p].w } };
  return { update, info, ROAD };
})();
