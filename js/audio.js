// Процедурный звук на Web Audio API (без звуковых файлов).
// Мотор и визг шин — отдельно для каждого игрока, со стереопанорамой: P1 слева, P2 справа.
// У каждой машины свой характер мотора (ENGINE): тембр, число передач, «рокот» V8, турбина. Плюс свист ветра
// на скорости, рёв нитро, хлопки выхлопа и сброс давления турбины.
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.

// base — частота холостых, t1/t2 — формы волн двух генераторов, r2/g2 — отношение частоты и громкость второго,
// q — резонанс фильтра, bright — насколько открывается фильтр, drive — «хрип» (перегруз), am — глубина «рокота»
// (пульсация громкости с частотой вспышек), gears — передач, turbo — громкость свиста турбины
const ENGINE = {
  corolla: { base: 50, t1: 'sawtooth', t2: 'square', r2: 0.5, g2: 0.5, q: 2.5, bright: 1.0, drive: 1.6, am: 0.06, gears: 5, turbo: 0 },
  accord: { base: 46, t1: 'sawtooth', t2: 'triangle', r2: 0.5, g2: 0.7, q: 2, bright: 0.95, drive: 1.3, am: 0.04, gears: 6, turbo: 0.6 },
  x5: { base: 38, t1: 'sawtooth', t2: 'sawtooth', r2: 1.5, g2: 0.35, q: 3, bright: 0.85, drive: 2.2, am: 0.15, gears: 6, turbo: 1 },
  hummer: { base: 28, t1: 'square', t2: 'sawtooth', r2: 0.5, g2: 0.8, q: 4, bright: 0.6, drive: 3, am: 0.5, gears: 4, turbo: 0.35 },
  aventador: { base: 60, t1: 'sawtooth', t2: 'sawtooth', r2: 2.0, g2: 0.45, q: 6, bright: 1.35, drive: 2.6, am: 0.05, gears: 7, turbo: 0 },
};

const Sound = (() => {
  const MUTE_KEY = 'steel_duel_mute';
  const PAN = [-0.6, 0.6];
  let ctx = null, master = null, slowF = null, noiseBuf = null, muted = false;
  const engines = [], prof = [ENGINE.corolla, ENGINE.corolla];
  try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { }

  // AudioContext можно создать только после действия пользователя
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.7;
    const comp = ctx.createDynamicsCompressor();
    // в замедлении (нокаут, высокий прыжок) звук глохнет
    slowF = ctx.createBiquadFilter(); slowF.type = 'lowpass'; slowF.frequency.value = 20000;
    master.connect(slowF).connect(comp).connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    engines.push(makeEngine(PAN[0]), makeEngine(PAN[1]));
    applyProfile(0); applyProfile(1);
  }

  // кривая перегруза: k — сила
  function driveCurve(k) {
    const n = 256, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(x * k) / Math.tanh(k); }
    return c;
  }
  function applyProfile(p) {
    const e = engines[p], P = prof[p];
    if (!e) return;
    e.o1.type = P.t1; e.o2.type = P.t2; e.g2.gain.value = P.g2; e.filt.Q.value = P.q;
    e.shaper.curve = driveCurve(P.drive);
  }

  function makeEngine(pan) {
    const panner = ctx.createStereoPanner(); panner.pan.value = pan; panner.connect(master);
    const out = ctx.createGain(); out.gain.value = 0; out.connect(panner);
    // провал громкости при переключении передачи
    const cut = ctx.createGain(); cut.gain.value = 1; cut.connect(out);
    // «рокот»: громкость пульсирует с частотой вспышек (am.gain = 1 + lfo)
    const am = ctx.createGain(); am.gain.value = 1; am.connect(cut);
    const lfo = ctx.createOscillator(); lfo.type = 'sine';
    const lfoG = ctx.createGain(); lfoG.gain.value = 0; lfo.connect(lfoG).connect(am.gain);
    const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 500; filt.Q.value = 3; filt.connect(am);
    const shaper = ctx.createWaveShaper(); shaper.oversample = '2x'; shaper.connect(filt);
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.connect(shaper);
    const g2 = ctx.createGain(); g2.gain.value = 0.6; g2.connect(shaper);
    const o2 = ctx.createOscillator(); o2.type = 'square'; o2.connect(g2);
    // один источник шума на всё: визг шин, ветер, нитро
    const sk = ctx.createBufferSource(); sk.buffer = noiseBuf; sk.loop = true;
    const skG = ctx.createGain(); skG.gain.value = 0; skG.connect(panner);
    const skF = ctx.createBiquadFilter(); skF.type = 'bandpass'; skF.frequency.value = 1700; skF.Q.value = 4; skF.connect(skG);
    sk.connect(skF);
    const windG = ctx.createGain(); windG.gain.value = 0; windG.connect(panner);
    const windF = ctx.createBiquadFilter(); windF.type = 'bandpass'; windF.frequency.value = 600; windF.Q.value = 0.5; windF.connect(windG);
    sk.connect(windF);
    const nitG = ctx.createGain(); nitG.gain.value = 0; nitG.connect(panner);
    const nitF = ctx.createBiquadFilter(); nitF.type = 'lowpass'; nitF.frequency.value = 900; nitF.Q.value = 1.5; nitF.connect(nitG);
    sk.connect(nitF);
    // свист турбины
    const tb = ctx.createOscillator(); tb.type = 'sine';
    const tbG = ctx.createGain(); tbG.gain.value = 0; tb.connect(tbG).connect(panner);
    o1.start(); o2.start(); sk.start(); lfo.start(); tb.start();
    return { out, cut, filt, shaper, o1, o2, g2, lfo, lfoG, skG, skF, windG, windF, nitG, nitF, tb, tbG, panner, gear: 0, thr: 0, rpm: 0 };
  }

  // вызывается каждый кадр; active=false глушит мотор (меню, пауза)
  function update(p, car, active) {
    if (!ctx || !engines[p]) return;
    const e = engines[p], t = ctx.currentTime;
    if (!active || !car) {
      for (const g of [e.out.gain, e.skG.gain, e.windG.gain, e.nitG.gain, e.tbG.gain]) g.setTargetAtTime(0, t, 0.06);
      return;
    }
    const P = prof[p];
    const sp = Math.hypot(car.vx, car.vz), frac = clamp(sp / car.maxSpeed, 0, 1.25);
    // псевдо-коробка передач: обороты растут внутри передачи и падают при переключении
    const gears = P.gears, g = Math.min(gears - 1, Math.floor(frac * gears)), inGear = Math.min(1.15, frac * gears - g);
    const rpm = g === 0 ? 0.2 + inGear * 0.8 : 0.45 + inGear * 0.55;
    const on = car.thr > 0, thr = on ? 1 : 0.4, drown = car.drown > 0;
    if (g > e.gear && on && car.grounded) {          // переключение вверх под газом: короткий провал тяги
      e.cut.gain.cancelScheduledValues(t); e.cut.gain.setValueAtTime(1, t);
      e.cut.gain.linearRampToValueAtTime(0.3, t + 0.03); e.cut.gain.linearRampToValueAtTime(1, t + 0.16);
    }
    // сброс газа на высоких оборотах: «пш-ш» сброса давления турбины
    if (P.turbo > 0 && e.thr > 0 && !on && e.rpm > 0.6 && !drown)
      noise(0.35, { freq: 3200, type: 'highpass', q: 0.7, sweep: 0.6, gain: 0.08 * P.turbo, pan: PAN[p] });
    e.gear = g; e.thr = car.thr; e.rpm = rpm;
    const f = P.base * (1 + rpm * 2.3) * (car.grounded ? 1 : 1.25);    // в полёте обороты подскакивают
    e.o1.frequency.setTargetAtTime(f, t, 0.06);
    e.o2.frequency.setTargetAtTime(f * P.r2, t, 0.06);
    e.lfo.frequency.setTargetAtTime(f * 0.5, t, 0.06);
    e.lfoG.gain.setTargetAtTime(P.am * (0.6 + 0.4 * thr), t, 0.1);
    e.filt.frequency.setTargetAtTime((250 + rpm * 1400 * thr) * P.bright, t, 0.08);
    e.out.gain.setTargetAtTime(drown ? 0 : 0.032 + 0.045 * thr, t, 0.1);
    const slip = car.grounded && !drown ? clamp((Math.abs(car.vl) - 2) / 7, 0, 1) * clamp(sp / 8, 0, 1) : 0;
    e.skG.gain.setTargetAtTime(slip * 0.12, t, 0.04);
    e.skF.frequency.setTargetAtTime(1400 + slip * 700, t, 0.1);
    // ветер: растёт с квадратом скорости, в полёте громче
    const w = drown ? 0 : (sp / 70) ** 2 * (car.grounded ? 1 : 1.4);
    e.windG.gain.setTargetAtTime(Math.min(0.2, w * 0.14), t, 0.15);
    e.windF.frequency.setTargetAtTime(400 + sp * 14, t, 0.2);
    // нитро: глухой рёв
    e.nitG.gain.setTargetAtTime(car.boosting && !drown ? 0.11 : 0, t, car.boosting ? 0.05 : 0.15);
    e.nitF.frequency.setTargetAtTime(700 + rpm * 900, t, 0.1);
    // турбина свистит под нагрузкой
    e.tb.frequency.setTargetAtTime(1600 + rpm * 2600, t, 0.1);
    e.tbG.gain.setTargetAtTime(drown ? 0 : P.turbo * 0.007 * (on ? 1 : 0) * rpm * rpm, t, 0.12);
  }

  function noise(dur, { freq = 600, type = 'lowpass', q = 1, gain = 0.4, pan = 0, sweep = 1 } = {}) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    const pn = ctx.createStereoPanner(); pn.pan.value = pan;
    src.connect(f).connect(g).connect(pn).connect(master);
    src.start(t, dur < 0.45 ? Math.random() * 0.5 : 0); src.stop(t + dur + 0.05);   // короткие — с разного места буфера, чтобы не звучали одинаково
  }
  function tone(freqs, dur, { gain = 0.15, pan = 0, type = 'sine', gap = 0.07, slide = 1 } = {}) {
    if (!ctx || muted) return;
    freqs.forEach((fr, i) => {
      const t = ctx.currentTime + i * gap;
      const o = ctx.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(fr, t); o.frequency.exponentialRampToValueAtTime(fr * slide, t + dur);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const pn = ctx.createStereoPanner(); pn.pan.value = pan;
      o.connect(g).connect(pn).connect(master);
      o.start(t); o.stop(t + dur + 0.05);
    });
  }

  return {
    init, update,
    // профиль мотора машины def для игрока p (ENGINE)
    setCar(p, def) { prof[p] = ENGINE[def.id] || ENGINE.corolla; applyProfile(p); },
    // одиночная езда: звук Игрока 1 по центру, а не слева
    solo(on) { PAN[0] = on ? 0 : -0.6; if (engines[0]) engines[0].panner.pan.value = PAN[0]; },
    // k = 0 — обычное время … 1 — сильное замедление: звук приглушается
    slow(k) { if (slowF) slowF.frequency.setTargetAtTime(k > 0.05 ? lerp(20000, 650, Math.sqrt(k)) : 20000, ctx.currentTime, 0.08); },
    impact(strength, p) {
      const k = clamp(strength / 20, 0, 1);
      noise(0.18 + k * 0.35, { freq: 900 + k * 1500, sweep: 0.15, gain: 0.25 + k * 0.6, pan: PAN[p] });
      tone([90], 0.25 + k * 0.2, { gain: 0.2 + k * 0.4, pan: PAN[p], slide: 0.5 });
    },
    crash(p, kind, speed) {
      const k = clamp(speed / 20, 0.2, 1);
      if (kind === 'metal') {
        noise(0.4, { freq: 2500, type: 'bandpass', q: 2, sweep: 0.3, gain: 0.35 * k, pan: PAN[p] });
        tone([620, 930], 0.6, { gain: 0.08 * k, pan: PAN[p], type: 'triangle', gap: 0.02, slide: 0.97 });
      } else if (kind === 'wood') {          // треск ствола и глухой удар
        noise(0.45, { freq: 700, sweep: 0.35, gain: 0.3 + 0.3 * k, pan: PAN[p] });
        tone([75], 0.35, { gain: 0.25 * k, pan: PAN[p], slide: 0.6 });
      } else if (kind === 'plastic') noise(0.1, { freq: 2200, type: 'bandpass', q: 1.5, sweep: 0.6, gain: 0.12 + 0.1 * k, pan: PAN[p] });
      else noise(0.12, { freq: 1200, sweep: 0.4, gain: 0.15, pan: PAN[p] });
    },
    // хлопок выхлопа
    pop(p) {
      noise(0.07, { freq: rand(500, 900), sweep: 0.3, gain: 0.45, pan: PAN[p] });
      tone([rand(55, 75)], 0.09, { gain: 0.22, pan: PAN[p], type: 'square', slide: 0.5 });
    },
    nitroStart(p) { noise(0.55, { freq: 350, type: 'bandpass', q: 1.2, sweep: 7, gain: 0.35, pan: PAN[p] }); },
    // трюк засчитан: восходящий аккорд, выше с ростом комбо
    trick(p, combo) {
      const k = Math.pow(2, (Math.min(combo, 5) - 1) * 2 / 12);
      tone([784 * k, 988 * k, 1175 * k], 0.12, { gain: 0.07, pan: PAN[p], type: 'triangle', gap: 0.045 });
    },
    coin(p) { tone([1318, 1976], 0.12, { gain: 0.12, pan: PAN[p], type: 'square', gap: 0.06 }); },
    ko(p) { tone([523, 659, 784, 1046], 0.16, { gain: 0.12, pan: PAN[p], type: 'square', gap: 0.08 }); },
    splash(p) { noise(1.0, { freq: 1600, type: 'bandpass', q: 0.8, sweep: 0.2, gain: 0.6, pan: PAN[p] }); },
    land(p, impact) { noise(0.2, { freq: 400, sweep: 0.4, gain: clamp(impact / 25, 0.1, 0.5), pan: PAN[p] }); },
    beep(high) { tone([high ? 1046 : 523], high ? 0.45 : 0.18, { gain: 0.16, type: 'square' }); },
    click() { tone([660], 0.05, { gain: 0.05, type: 'square' }); },
    toggleMute() {
      muted = !muted;
      try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) { }
      if (master) master.gain.setTargetAtTime(muted ? 0 : 0.7, ctx.currentTime, 0.05);
      return muted;
    },
    get muted() { return muted; },
  };
})();
