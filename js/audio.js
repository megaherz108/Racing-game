// Процедурный звук на Web Audio API (без звуковых файлов): ядро и мотор.
// Мотор и визг шин — отдельно для каждого игрока, со стереопанорамой: P1 слева, P2 справа.
// Мотор: свой спектр у каждой машины (PeriodicWave из гармоник частоты вспышек и «полупорядков»), перегруз
// через WaveShaper, который хрипит сильнее под нагрузкой, пульсация громкости с частотой вспышек, «шершавый» шум
// впуска. Турбина раскручивается с запаздыванием, свистит и сбрасывает давление при отпускании газа.
// У каждого игрока своя шина: сухой звук → панорама, и посыл в эхо (ConvolverNode с синтезированным откликом
// бетонного тоннеля) — его уровень задаёт окружение (js/audio-env.js): под эстакадой, в арках, на мостах.
// Окружение и покрытия — js/audio-env.js, звук трафика — js/audio-traffic.js; оба обновляются из Sound.update().
// Определяет: ENGINE, Sound.
// Использует: lerp, clamp, rand (js/core.js); SOUND_DATA (js/sound-data.js); SoundEnv (js/audio-env.js); SoundTraffic
//   (js/audio-traffic.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.

// cyl — цилиндров; base — частота вспышек на холостых, Гц; sub — громкость «полупорядков» (неровный порядок
// вспышек V8: бубнение), tilt — спад гармоник (меньше — ярче: вой V12, больше — глухо), bank — расстройка второго
// ряда цилиндров (биения, «живой» звук), q — резонанс фильтра, bright — насколько он открывается, res — резонанс
// выпуска [Гц, дБ], drive — перегруз (хрип), am — глубина пульсации, amRate — её частота от частоты вспышек,
// lope — «качание» холостых оборотов, grit — шум впуска, gears — передач, turbo — громкость турбины (0 — нет)
const ENGINE = {
  corolla: { cyl: 4, base: 50, sub: 0.12, tilt: 0.85, bank: 0.004, q: 2.5, bright: 1.0, res: [420, 4], drive: 1.8, am: 0.1, amRate: 1, lope: 0, grit: 0.25, gears: 5, turbo: 0 },
  accord: { cyl: 4, base: 46, sub: 0.08, tilt: 1.1, bank: 0.003, q: 2, bright: 0.95, res: [360, 3], drive: 1.4, am: 0.06, amRate: 1, lope: 0, grit: 0.15, gears: 6, turbo: 0.6 },
  x5: { cyl: 6, base: 38, sub: 0.15, tilt: 1.05, bank: 0.005, q: 3, bright: 0.85, res: [260, 5], drive: 2.2, am: 0.12, amRate: 0.5, lope: 0, grit: 0.2, gears: 6, turbo: 1 },
  hummer: { cyl: 8, base: 28, sub: 0.95, tilt: 1.35, bank: 0.012, q: 4, bright: 0.6, res: [95, 8], drive: 3, am: 0.55, amRate: 0.25, lope: 0.035, grit: 0.35, gears: 4, turbo: 0.35 },
  aventador: { cyl: 12, base: 60, sub: 0.05, tilt: 0.55, bank: 0.006, q: 6, bright: 1.35, res: [1700, 6], drive: 2.6, am: 0.05, amRate: 1, lope: 0, grit: 0.15, gears: 7, turbo: 0 },
  // дизель автобусов и грузовиков трафика: низкий, с клёкотом
  diesel: { cyl: 6, base: 22, sub: 0.5, tilt: 1.2, bank: 0.01, q: 2, bright: 0.7, res: [140, 6], drive: 2.5, am: 0.4, amRate: 0.5, lope: 0.01, grit: 0.6, gears: 5, turbo: 0.4 },
};

const Sound = (() => {
  const MUTE_KEY = 'steel_duel_mute';
  const PAN = [-0.6, 0.6];
  let ctx = null, master = null, slowF = null, noiseBuf = null, brownBuf = null, irBuf = null, muted = false;
  const engines = [], prof = [ENGINE.corolla, ENGINE.corolla], waves = new Map();
  const samples = {};                                   // записи: имя → [{ buf, gain }] (варианты: gull, gull_2…)
  try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { }
  // на скрытой вкладке главный цикл (requestAnimationFrame) стоит и Sound.update() не вызывается — без этого
  // мотор, фоны и трафик так и звучали бы с последней громкостью. Останавливаем весь звук и возобновляем при возврате.
  document.addEventListener('visibilitychange', () => {
    if (!ctx || ctx.state === 'closed') return;
    if (document.hidden) ctx.suspend(); else ctx.resume();
  });

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
    // белый шум (2 с) и «коричневый» — низкий гул (4 с): общие буферы для всех шумовых звуков
    const sr = ctx.sampleRate;
    noiseBuf = ctx.createBuffer(1, sr * 2, sr);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    brownBuf = ctx.createBuffer(1, sr * 4, sr);
    const b = brownBuf.getChannelData(0);
    for (let i = 0, y = 0; i < b.length; i++) { y = (y + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = y * 3.5; }
    irBuf = makeIR();
    loadSamples();
    engines.push(makeEngine(PAN[0]), makeEngine(PAN[1]));
    applyProfile(0); applyProfile(1);
  }

  // записи из js/sound-data.js (собирает tools/pack-sounds.js из папки sounds/) декодируются после старта звука.
  // Пока записи нет (не загружена или не декодировалась), вместо неё звучит синтез.
  function loadSamples() {
    if (typeof SOUND_DATA !== 'object') return;
    // по одной записи за раз: распаковка base64 всех сразу — заметная пауза на первом клике
    const list = Object.entries(SOUND_DATA);
    (function next() {
      const item = list.shift();
      if (!item) return;
      const [name, s] = item;
      setTimeout(next, 0);
      const bin = atob(s.b64), u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      ctx.decodeAudioData(u8.buffer).then(buf => {
        const base = name.split('_')[0];                    // варианты: gull, gull_2, gull_3…
        (samples[base] = samples[base] || []).push({ buf: s.loop ? seamless(buf, Math.min(1.5, buf.duration / 4)) : buf, gain: s.gain ?? 1 });
      }).catch(e => console.warn('Звук ' + name + ' не декодирован:', e));
    })();
  }
  // бесшовная петля: последние sec секунд записи плавно (равная мощность) накладываются на её начало
  function seamless(buf, sec) {
    const F = Math.floor(sec * buf.sampleRate), L = buf.length - F;
    if (F < 64 || L <= F) return buf;
    const out = ctx.createBuffer(buf.numberOfChannels, L, buf.sampleRate);
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const a = buf.getChannelData(ch), o = out.getChannelData(ch);
      o.set(a.subarray(F, L), F);
      for (let i = 0; i < F; i++) { const u = i / F * Math.PI / 2; o[i] = a[i] * Math.sin(u) + a[L + i] * Math.cos(u); }
    }
    return out;
  }
  // разовый звук из записи (случайный вариант): true — сыграли (или звук выключен), false — записи нет, играть синтез
  function play(name, { gain = 1, pan = 0, rate = 1, p, at = 0 } = {}) {
    const v = samples[name];
    if (!v) return false;
    if (muted) return true;
    const s = v[Math.floor(Math.random() * v.length)], src = ctx.createBufferSource(); src.buffer = s.buf; src.playbackRate.value = rate;
    const g = ctx.createGain(); g.gain.value = gain * s.gain;
    src.connect(g).connect(dest(p, pan)); src.start(ctx.currentTime + at);
    return true;
  }

  // отклик «бетонного тоннеля» для эха: ранние отражения от стен и потолка, порхающее эхо между стенами
  // и затухающий хвост, у которого высокие частоты гаснут быстрее низких
  function makeIR() {
    const sr = ctx.sampleRate, n = Math.floor(sr * 1.3), buf = ctx.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let y = 0;
      for (let i = 0; i < n; i++) {
        const u = i / n, k = lerp(0.85, 0.08, Math.sqrt(u));     // однополюсный фильтр: хвост темнеет
        y += ((Math.random() * 2 - 1) - y) * k;
        d[i] = y * Math.pow(1 - u, 3.2) * 0.5;
      }
      const taps = [[0.009, 0.8], [0.016, 0.6], [0.023, 0.55], [0.037, 0.45], [0.052, 0.35]];
      for (let r = 1; r < 9; r++) taps.push([0.03 * r + (ch ? 0.004 : 0), 0.5 * Math.pow(0.72, r)]);
      for (const [t, a] of taps) d[Math.floor(t * sr * (ch ? 1.07 : 1))] += a * (Math.random() < 0.5 ? -1 : 1);
    }
    return buf;
  }

  // спектр мотора: гармоники частоты «полуоборота» (f/2). Чётные — частота вспышек и её кратные,
  // нечётные — полупорядки (у V8 громкие: бубнение). Фазы фиксированные, чтобы звук был одинаковым при каждом запуске.
  function engineWave(P) {
    if (waves.has(P)) return waves.get(P);
    const N = 48, re = new Float32Array(N + 1), im = new Float32Array(N + 1);
    for (let k = 1; k <= N; k++) {
      const a = (k % 2 ? P.sub : 1) * Math.pow(k / 2, -P.tilt), ph = (k * 2.399 + P.cyl) % (Math.PI * 2);
      re[k] = a * Math.cos(ph); im[k] = a * Math.sin(ph);
    }
    const w = ctx.createPeriodicWave(re, im);
    waves.set(P, w);
    return w;
  }
  // кривая перегруза: k — сила
  function driveCurve(k) {
    const n = 512, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(x * k) / Math.tanh(k); }
    return c;
  }
  function applyProfile(p) {
    const e = engines[p], P = prof[p];
    if (!e) return;
    const w = engineWave(P);
    e.o1.setPeriodicWave(w); e.o2.setPeriodicWave(w); e.g2.gain.value = 0.55;
    e.filt.Q.value = P.q; e.peak.frequency.value = P.res[0]; e.peak.gain.value = P.res[1];
    e.shaper.curve = driveCurve(P.drive); e.gritG.gain.value = P.grit * 0.5;
    e.boost = 0;
  }

  function makeEngine(pan) {
    const panner = ctx.createStereoPanner(); panner.pan.value = pan; panner.connect(master);
    // шина игрока: сухой звук и посыл в эхо
    const bus = ctx.createGain(); bus.connect(panner);
    const send = ctx.createGain(); send.gain.value = 0;
    const conv = ctx.createConvolver(); conv.buffer = irBuf;
    bus.connect(send).connect(conv).connect(panner);
    const out = ctx.createGain(); out.gain.value = 0; out.connect(bus);
    // провал громкости при переключении передачи
    const cut = ctx.createGain(); cut.gain.value = 1; cut.connect(out);
    // пульсация громкости с частотой вспышек (am.gain = 1 + lfo)
    const am = ctx.createGain(); am.gain.value = 1; am.connect(cut);
    const lfo = ctx.createOscillator(); lfo.type = 'triangle';
    const lfoG = ctx.createGain(); lfoG.gain.value = 0; lfo.connect(lfoG).connect(am.gain);
    // резонанс выпуска (фиксированная частота: у V8 низкий, у V12 высокий) → фильтр, который открывается с оборотами
    const peak = ctx.createBiquadFilter(); peak.type = 'peaking'; peak.Q.value = 1.4; peak.connect(am);
    const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 500; filt.Q.value = 3; filt.connect(peak);
    const shaper = ctx.createWaveShaper(); shaper.oversample = '2x'; shaper.connect(filt);
    // вход перегруза: чем больше нагрузка, тем сильнее хрип
    const pre = ctx.createGain(); pre.gain.value = 0.6; pre.connect(shaper);
    const o1 = ctx.createOscillator(); o1.connect(pre);
    const g2 = ctx.createGain(); g2.gain.value = 0.55; g2.connect(pre);
    const o2 = ctx.createOscillator(); o2.connect(g2);                     // второй ряд цилиндров, чуть расстроен
    // один источник шума на всё: впуск, визг шин, ветер, нитро, турбина
    const sk = ctx.createBufferSource(); sk.buffer = noiseBuf; sk.loop = true;
    const gritF = ctx.createBiquadFilter(); gritF.type = 'bandpass'; gritF.Q.value = 1.2; gritF.frequency.value = 600;
    const gritG = ctx.createGain(); gritG.gain.value = 0.1; sk.connect(gritF).connect(gritG).connect(pre);
    const skG = ctx.createGain(); skG.gain.value = 0; skG.connect(bus);
    const skF = ctx.createBiquadFilter(); skF.type = 'bandpass'; skF.frequency.value = 1700; skF.Q.value = 4; skF.connect(skG);
    sk.connect(skF);
    const windG = ctx.createGain(); windG.gain.value = 0; windG.connect(panner);          // ветер — мимо эха
    const windF = ctx.createBiquadFilter(); windF.type = 'bandpass'; windF.frequency.value = 600; windF.Q.value = 0.5; windF.connect(windG);
    sk.connect(windF);
    const nitG = ctx.createGain(); nitG.gain.value = 0; nitG.connect(bus);
    const nitF = ctx.createBiquadFilter(); nitF.type = 'lowpass'; nitF.frequency.value = 900; nitF.Q.value = 1.5; nitF.connect(nitG);
    sk.connect(nitF);
    // турбина: свист и шум воздуха во впуске
    const tb = ctx.createOscillator(); tb.type = 'sine';
    const tbG = ctx.createGain(); tbG.gain.value = 0; tb.connect(tbG).connect(bus);
    const tbF = ctx.createBiquadFilter(); tbF.type = 'bandpass'; tbF.Q.value = 3; tbF.frequency.value = 3000;
    const tbN = ctx.createGain(); tbN.gain.value = 0; sk.connect(tbF).connect(tbN).connect(bus);
    o1.start(); o2.start(); sk.start(0, Math.random() * 1.5); lfo.start(); tb.start();
    return { panner, bus, send, out, cut, filt, peak, shaper, pre, o1, o2, g2, gritF, gritG, lfo, lfoG, skG, skF, windG, windF, nitG, nitF,
      tb, tbG, tbF, tbN, gear: 0, thr: 0, rpm: 0, boost: 0, lastT: 0 };
  }

  // вызывается каждый кадр; active=false глушит мотор (меню, пауза)
  function update(p, car, active) {
    if (!ctx || !engines[p]) return;
    const e = engines[p], t = ctx.currentTime, dt = clamp(t - e.lastT, 0, 0.1); e.lastT = t;
    if (!active || !car) {
      for (const g of [e.out.gain, e.skG.gain, e.windG.gain, e.nitG.gain, e.tbG.gain, e.tbN.gain]) g.setTargetAtTime(0, t, 0.06);
      e.boost = 0;
      SoundEnv.update(p, null, false, dt); SoundTraffic.update(p, null, false, dt);
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
    // турбина раскручивается под газом с запаздыванием и сразу теряет давление без газа
    if (P.turbo > 0) {
      const target = on && !drown ? clamp(rpm * 1.2 - 0.15, 0, 1) : 0;
      e.boost += (target - e.boost) * Math.min(1, dt * (target > e.boost ? 1.4 : 6));
      // сброс газа под давлением: «пш-ш» перепускного клапана
      if (e.thr > 0 && !on && e.boost > 0.35 && !drown)
        noise(0.25 + e.boost * 0.25, { freq: 3400, type: 'highpass', q: 0.7, sweep: 0.5, gain: 0.1 * P.turbo * e.boost, p });
    }
    e.gear = g; e.thr = car.thr; e.rpm = rpm;
    // холостые у V8 «качаются»
    const lope = P.lope * clamp(1 - rpm * 2.5, 0, 1) * Math.sin(t * 9.4) * Math.sin(t * 2.3);
    const f = P.base * (1 + rpm * 2.3) * (car.grounded ? 1 : 1.25) * (1 + lope);    // в полёте обороты подскакивают
    e.o1.frequency.setTargetAtTime(f / 2, t, 0.06);
    e.o2.frequency.setTargetAtTime(f / 2 * (1 + P.bank), t, 0.06);
    e.lfo.frequency.setTargetAtTime(f * P.amRate, t, 0.06);
    e.lfoG.gain.setTargetAtTime(P.am * (0.5 + 0.5 * thr), t, 0.1);
    // нагрузка: газ на высоких оборотах — перегруз сильнее, хрип громче
    const load = on ? 0.5 + rpm * 0.6 : 0.25;
    e.pre.gain.setTargetAtTime(0.35 + load * 0.75, t, 0.08);
    e.gritF.frequency.setTargetAtTime(f * 3, t, 0.08);
    e.filt.frequency.setTargetAtTime((250 + rpm * 1400 * thr) * P.bright, t, 0.08);
    e.out.gain.setTargetAtTime(drown ? 0 : (0.03 + 0.042 * thr) / (0.7 + load * 0.4), t, 0.1);
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
    // турбина: свист растёт с давлением
    e.tb.frequency.setTargetAtTime(1800 + e.boost * 3800, t, 0.1);
    e.tbG.gain.setTargetAtTime(P.turbo * 0.009 * e.boost * e.boost, t, 0.1);
    e.tbF.frequency.setTargetAtTime(2200 + e.boost * 2500, t, 0.1);
    e.tbN.gain.setTargetAtTime(P.turbo * 0.02 * e.boost, t, 0.1);
    SoundEnv.update(p, car, true, dt); SoundTraffic.update(p, car, true, dt);
  }

  // dest: p — шина игрока (с эхом), иначе своя панорама pan
  function dest(p, pan) {
    if (p !== undefined && engines[p]) return engines[p].bus;
    const pn = ctx.createStereoPanner(); pn.pan.value = pan; pn.connect(master);
    return pn;
  }
  function noise(dur, { freq = 600, type = 'lowpass', q = 1, gain = 0.4, pan = 0, sweep = 1, p, at = 0 } = {}) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(dest(p, pan));
    src.start(t, dur < 0.45 ? Math.random() * 1.5 : 0); src.stop(t + dur + 0.05);   // короткие — с разного места буфера, чтобы не звучали одинаково
  }
  function tone(freqs, dur, { gain = 0.15, pan = 0, type = 'sine', gap = 0.07, slide = 1, p, at = 0 } = {}) {
    if (!ctx || muted) return;
    const out = dest(p, pan);
    freqs.forEach((fr, i) => {
      const t = ctx.currentTime + at + i * gap;
      const o = ctx.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(fr, t); o.frequency.exponentialRampToValueAtTime(fr * slide, t + dur);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(out);
      o.start(t); o.stop(t + dur + 0.05);
    });
  }
  // звон стекла: россыпь коротких высоких «дзынь» в случайные моменты и шорох осколков
  function glass(p, k) {
    if (!ctx || muted || play('glass', { gain: 0.4 + k * 0.6, rate: rand(0.9, 1.1), p })) return;
    const out = dest(p, 0), t0 = ctx.currentTime, n = 8 + Math.round(k * 8);
    for (let i = 0; i < n; i++) {
      const t = t0 + Math.pow(Math.random(), 1.8) * 0.45, fr = rand(2600, 7500), dur = rand(0.05, 0.22);
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(fr, t);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(rand(0.02, 0.06) * (0.5 + k), t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.02);
    }
    noise(0.12, { freq: 5000, type: 'highpass', q: 0.8, gain: 0.25 * (0.4 + k), p });
    noise(0.5, { freq: 6500, type: 'bandpass', q: 1.5, sweep: 0.8, gain: 0.08 * (0.4 + k), p, at: 0.05 });
  }

  return {
    init, update, noise, tone, play, PAN,
    // запись name (первый вариант) или null: { buf, gain }
    sample: name => samples[name] ? samples[name][0] : null,
    // для js/audio-env.js и js/audio-traffic.js
    get ctx() { return ctx; }, get master() { return master; }, get noiseBuf() { return noiseBuf; }, get brownBuf() { return brownBuf; },
    engineWave, out: p => engines[p] && engines[p].panner, bus: p => engines[p] && engines[p].bus,
    // уровень эха игрока p (0 — открытое место … 1 — тоннель)
    reverb(p, wet) { if (engines[p]) engines[p].send.gain.setTargetAtTime(wet, ctx.currentTime, 0.3); },
    // панорама источника для игрока p: side — где он относительно камеры (−1 слева … 1 справа). В одиночной езде —
    // весь стереообраз, вдвоём — своя половина (P1 левее, P2 правее)
    panFor(p, side) { return PAN[0] === 0 && p === 0 ? side * 0.85 : clamp(PAN[p] + side * 0.4, -1, 1); },
    // профиль мотора машины def для игрока p (ENGINE)
    setCar(p, def) { prof[p] = ENGINE[def.id] || ENGINE.corolla; applyProfile(p); },
    // одиночная езда: звук Игрока 1 по центру, а не слева
    solo(on) { PAN[0] = on ? 0 : -0.6; if (engines[0]) engines[0].panner.pan.value = PAN[0]; },
    // k = 0 — обычное время … 1 — сильное замедление: звук приглушается
    slow(k) { if (slowF) slowF.frequency.setTargetAtTime(k > 0.05 ? lerp(20000, 650, Math.sqrt(k)) : 20000, ctx.currentTime, 0.08); },
    impact(strength, p) {
      const k = clamp(strength / 20, 0, 1);
      noise(0.18 + k * 0.35, { freq: 900 + k * 1500, sweep: 0.15, gain: 0.25 + k * 0.6, p });
      tone([90], 0.25 + k * 0.2, { gain: 0.2 + k * 0.4, p, slide: 0.5 });
    },
    // сбитый объект; snd — особый звук набора (стекло светофоров и фонарей)
    crash(p, kind, speed, snd) {
      const k = clamp(speed / 20, 0.2, 1);
      if (kind === 'metal') {
        noise(0.4, { freq: 2500, type: 'bandpass', q: 2, sweep: 0.3, gain: 0.35 * k, p });
        tone([620, 930], 0.6, { gain: 0.08 * k, p, type: 'triangle', gap: 0.02, slide: 0.97 });
      } else if (kind === 'wood') {          // треск ствола и глухой удар
        noise(0.45, { freq: 700, sweep: 0.35, gain: 0.3 + 0.3 * k, p });
        tone([75], 0.35, { gain: 0.25 * k, p, slide: 0.6 });
      } else if (kind === 'plastic') noise(0.1, { freq: 2200, type: 'bandpass', q: 1.5, sweep: 0.6, gain: 0.12 + 0.1 * k, p });
      else noise(0.12, { freq: 1200, sweep: 0.4, gain: 0.15, p });
      if (snd === 'glass') glass(p, k);
    },
    // хлопок выхлопа
    pop(p) {
      noise(0.07, { freq: rand(500, 900), sweep: 0.3, gain: 0.45, p });
      tone([rand(55, 75)], 0.09, { gain: 0.22, p, type: 'square', slide: 0.5 });
    },
    nitroStart(p) { noise(0.55, { freq: 350, type: 'bandpass', q: 1.2, sweep: 7, gain: 0.35, p }); },
    // трюк засчитан: восходящий аккорд, выше с ростом комбо
    trick(p, combo) {
      const k = Math.pow(2, (Math.min(combo, 5) - 1) * 2 / 12);
      tone([784 * k, 988 * k, 1175 * k], 0.12, { gain: 0.07, pan: PAN[p], type: 'triangle', gap: 0.045 });
    },
    coin(p) { tone([1318, 1976], 0.12, { gain: 0.12, pan: PAN[p], type: 'square', gap: 0.06 }); },
    ko(p) { tone([523, 659, 784, 1046], 0.16, { gain: 0.12, pan: PAN[p], type: 'square', gap: 0.08 }); },
    splash(p) { noise(1.0, { freq: 1600, type: 'bandpass', q: 0.8, sweep: 0.2, gain: 0.6, p }); },
    land(p, impact) { noise(0.2, { freq: 400, sweep: 0.4, gain: clamp(impact / 25, 0.1, 0.5), p }); },
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
