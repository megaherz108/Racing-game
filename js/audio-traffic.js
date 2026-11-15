// Звук трафика (дополняет Sound из js/audio.js; обновляется из Sound.update()):
// - моторы и шины трёх ближайших к игроку машин: у каждого игрока свои голоса, громкость и глухота по расстоянию,
//   панорама — с какой стороны машина относительно камеры игрока, эффект Доплера от сближения и удаления
//   («ни-и-иу» при обгоне); тембр — профиль мотора из ENGINE (автобусы и грузовики — дизель), у мотороллера,
//   фургончика и трактора «Побережья» — свои профили RURAL с пульсом громкости (тарахтение, «чух-чух»);
// - гудки: бот сигналит, если его подрезали (игрок резко влез перед ним), если игрок долго стоит у него на пути,
//   и заевший гудок у разбитой машины.
// Определяет: SoundTraffic.
// Использует: rand, clamp (js/core.js); Sound, ENGINE (js/audio.js); cars (js/physics.js); Traffic
//   (js/traffic/traffic.js); cams (js/match.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.

const SoundTraffic = (() => {
  const VOICES = 3, RANGE = 70, C = 343;                       // голосов на игрока, слышно ближе RANGE м, скорость звука
  const PROF = { bus: 'diesel', truck: 'diesel', taxi: 'corolla' };
  // моторы «Побережья» — свои профили (поля спектра — как в ENGINE) и «пульс»: громкость (вместе с шумом)
  // качается с частотой вспышек. pulse — глубина, pk — частота пульса в долях частоты звука, chuff — шум
  // выхлопа на холостых, cvt — вариатор: обороты растут плавно, без передач
  const RURAL = {
    // двухтактный одноцилиндровый мотороллер: высокий звенящий писк
    scooter: { cyl: 1, base: 74, sub: 0.75, tilt: 0.5, bright: 1.7, pulse: 0.25, pk: 0.5, chuff: 0.06, cvt: true },
    // одноцилиндровый фургончик: тарахтит — громкость «рвётся» каждую вторую вспышку
    ape: { cyl: 1, base: 30, sub: 1.0, tilt: 0.75, bright: 1.15, pulse: 0.7, pk: 0.5, chuff: 0.15 },
    // дизель трактора: низкое «чух-чух» — пульс в треть частоты, шумный выхлоп
    tractor: { cyl: 3, base: 15, sub: 0.6, tilt: 0.95, bright: 0.75, pulse: 0.8, pk: 1 / 3, chuff: 0.35 },
  };
  const LOUD = { bus: 1.5, truck: 1.5, aventador: 1.6, hummer: 1.3, scooter: 1.0, ape: 1.3, tractor: 1.8 };
  // гудок: две частоты и форма волны (у автобусов и грузовиков — низкий пневматический; у мотороллера тонкий
  // почти в унисон, у фургончика писклявый, у трактора — простой электрический)
  const HORN = { bus: [220, 277, 'sawtooth'], truck: [196, 247, 'sawtooth'], aventador: [520, 655, 'square'], taxi: [460, 580, 'square'],
    scooter: [690, 702, 'square'], ape: [930, 1110, 'square'], tractor: [310, 372, 'sawtooth'] };
  const HORN_DEF = [400, 505, 'square'];
  const S = [];
  let nextHorn = 0;

  function make() {
    const ctx = Sound.ctx, noise = ctx.createBufferSource(); noise.buffer = Sound.noiseBuf; noise.loop = true; noise.start(0, Math.random() * 1.8);
    // форма пульса: короткий всплеск раз в период (несколько косинусов в фазе)
    const re = new Float32Array(7), im = new Float32Array(7);
    for (let k = 1; k < 7; k++) re[k] = 1 / Math.sqrt(k);
    const pulseWave = ctx.createPeriodicWave(re, im);
    const vs = [];
    for (let i = 0; i < VOICES; i++) {
      const pan = ctx.createStereoPanner(); pan.connect(Sound.master);
      const g = ctx.createGain(); g.gain.value = 0; g.connect(pan);
      // am — пульс громкости (у городских машин глубина 0: am = 1)
      const am = ctx.createGain(); am.gain.value = 1; am.connect(g);
      const lfo = ctx.createOscillator(); lfo.setPeriodicWave(pulseWave); lfo.frequency.value = 10;
      const lfoG = ctx.createGain(); lfoG.gain.value = 0; lfo.connect(lfoG).connect(am.gain); lfo.start();
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.5; lp.connect(am);
      const o = ctx.createOscillator(); o.connect(lp); o.start();
      const tf = ctx.createBiquadFilter(); tf.type = 'bandpass'; tf.frequency.value = 600; tf.Q.value = 0.7;
      const tg = ctx.createGain(); tg.gain.value = 0; noise.connect(tf).connect(tg).connect(am);
      vs.push({ pan, g, am, lfo, lfoG, lp, o, tf, tg, tc: null, wait: 0, sp: 0, acc: 0 });
    }
    return { vs, near: [] };
  }
  const profOf = tc => RURAL[tc.type.id] || ENGINE[PROF[tc.type.id] || tc.type.id] || ENGINE.corolla;

  // гудок машины tc: kind — 'cut' (подрезали), 'wait' (стоит игрок), 'stuck' (заело у разбитой)
  function honk(tc, kind) {
    const ctx = Sound.ctx, [f1, f2, type] = HORN[tc.type.id] || HORN_DEF, t0 = ctx.currentTime;
    const pat = kind === 'cut' ? [[0, 0.12], [0.2, 0.45]] : kind === 'wait' ? [[0, 0.22], [0.32, 0.22]] : [[0, rand(1.2, 2.4)]];
    cars.forEach((c, q) => {
      const dx = tc.x - c.x, dz = tc.z - c.z, d = Math.hypot(dx, dz);
      if (d > 110 || c.drown > 0) return;
      const m = cams[q].matrixWorld.elements, side = d > 0.5 ? clamp((dx * m[0] + dz * m[2]) / d, -1, 1) : 0;
      const pan = ctx.createStereoPanner(); pan.pan.value = Sound.panFor(q, side); pan.connect(Sound.master);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400 / (1 + d / 50); lp.connect(pan);
      const g = ctx.createGain(); g.gain.value = 0; g.connect(lp);
      const k = 0.05 / (1 + (d / 12) ** 2);
      for (const [a, len] of pat) {
        g.gain.setTargetAtTime(k, t0 + a, 0.008); g.gain.setTargetAtTime(0, t0 + a + len, 0.015);
      }
      const end = t0 + pat[pat.length - 1][0] + pat[pat.length - 1][1] + 0.2;
      for (const f of [f1, f2]) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f * rand(0.97, 1.03); o.connect(g); o.start(t0); o.stop(end); }
    });
  }
  // кто кому сигналит (раз в кадр, в обновлении первого игрока)
  function horns(t) {
    for (const tc of Traffic.list) {
      if (tc.lead) continue;                                  // прицеп не сигналит
      if (tc.dead) { tc.sWreck = false; continue; }
      if (tc.wreck) {
        if (!tc.sWreck) { tc.sWreck = true; if (Math.random() < 0.5) honk(tc, 'stuck'); }
        continue;
      }
      tc.sWreck = false;
      const ob = tc.obsBy;
      if (!ob || !cars.includes(ob) || t < nextHorn || t < (tc.hornAt || 0)) continue;
      const kind = tc.obs < 6 && tc.v > 4 ? 'cut' : tc.v < 0.5 && tc.stuckT > 2.5 ? 'wait' : null;
      if (!kind) continue;
      honk(tc, kind);
      tc.hornAt = t + rand(5, 9); nextHorn = t + 0.35;
    }
  }

  function update(p, car, active, dt) {
    if (!Sound.ctx) return;
    const s = S[p] || (S[p] = make()), t = Sound.ctx.currentTime;
    if (!active || !car || !Traffic.list.length) {
      for (const v of s.vs) { v.g.gain.setTargetAtTime(0, t, 0.08); v.tc = null; }
      return;
    }
    if (p === 0) horns(t);
    // три ближайшие машины
    const near = s.near; near.length = 0;
    for (const tc of Traffic.list) {
      if (tc.dead || tc.wreck || tc.far || tc.lead) continue;   // у прицепа нет мотора
      const d2 = (tc.x - car.x) ** 2 + (tc.z - car.z) ** 2;
      if (d2 < RANGE * RANGE) near.push([d2, tc]);
    }
    near.sort((a, b) => a[0] - b[0]);
    if (near.length > VOICES) near.length = VOICES;
    // голос держится за свою машину, пока она среди ближайших; освободившийся берёт новую
    for (const v of s.vs) if (v.tc && !near.some(n => n[1] === v.tc)) v.tc = null;
    for (const [, tc] of near) {
      if (s.vs.some(v => v.tc === tc)) continue;
      const v = s.vs.find(v => !v.tc);
      v.tc = tc; v.wait = 0.08; v.sp = 0; v.acc = 0;           // сначала затихнуть, потом сменить тембр
    }
    const m = cams[p].matrixWorld.elements;
    for (const v of s.vs) {
      const tc = v.tc;
      if (!tc || v.wait > 0) {
        v.g.gain.setTargetAtTime(0, t, 0.02);
        if (tc && (v.wait -= dt) <= 0) {
          const P = profOf(tc), dep = P.pulse || 0;
          v.o.setPeriodicWave(Sound.engineWave(P));
          v.am.gain.setTargetAtTime(1 - dep * 0.5, t, 0.01); v.lfoG.gain.setTargetAtTime(dep * 0.5, t, 0.01);
        }
        continue;
      }
      const P = profOf(tc), pos = tc.body.translation(), lv = tc.body.linvel();
      const dx = pos.x - car.x, dz = pos.z - car.z, d = Math.max(0.5, Math.hypot(dx, dz)), nx = dx / d, nz = dz / d;
      const sp = Math.hypot(lv.x, lv.z);
      v.acc += ((sp - v.sp) / Math.max(dt, 1e-3) - v.acc) * Math.min(1, dt * 4); v.sp = sp;
      // Доплер: источник удаляется со скоростью vs, слушатель приближается со скоростью vl
      const vs = lv.x * nx + lv.z * nz, vl = car.vx * nx + car.vz * nz, dop = clamp((C + vl) / (C + vs), 0.75, 1.35);
      const frac = clamp(sp / tc.vmax, 0, 1.1), g = Math.min(2, Math.floor(frac * 3)), inG = frac * 3 - g;
      const load = clamp(0.4 + v.acc * 0.4, 0.2, 1);
      const rpm = P.cvt ? 0.3 + 0.6 * Math.min(1, frac) + 0.1 * load : g === 0 ? 0.15 + inG * 0.75 : 0.45 + inG * 0.5;
      const f = P.base * (1 + rpm * 2.3) * dop;
      v.o.frequency.setTargetAtTime(f / 2, t, 0.05);
      if (P.pulse) v.lfo.frequency.setTargetAtTime(f * P.pk, t, 0.05);
      v.lp.frequency.setTargetAtTime((250 + 1300 * rpm * load) * P.bright / (1 + d / 45), t, 0.08);
      v.tg.gain.setTargetAtTime(clamp(sp / 14, 0, 1.2) * 0.5 + (P.chuff || 0) * (0.6 + 0.4 * load), t, 0.1);
      v.tf.frequency.setTargetAtTime(500 * dop / (1 + d / 60), t, 0.1);
      v.g.gain.setTargetAtTime((LOUD[tc.type.id] || 1) * 0.055 * (0.6 + 0.4 * load) / (1 + (d / 8) ** 2), t, 0.06);
      v.pan.pan.setTargetAtTime(Sound.panFor(p, clamp(nx * m[0] + nz * m[2], -1, 1)), t, 0.05);
    }
  }

  // отладка: какие машины озвучены у игрока p
  const info = p => S[p] && S[p].vs.map(v => v.tc && { type: v.tc.type.id, d: Math.round(Math.hypot(v.tc.x - cars[p].x, v.tc.z - cars[p].z)), gain: +v.g.gain.value.toFixed(4), f: Math.round(v.o.frequency.value) });
  return { update, info };
})();
