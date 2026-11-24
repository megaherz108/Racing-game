// Режим «Горячая бомба» (любая карта, только вдвоём). Матч — раунды до BOMB_CFG.wins побед.
// В начале раунда машины стоят на дорогах в BOMB_CFG.gap метрах друг от друга, бомба на крыше у одной из них
// (в первом раунде — у случайной, дальше — у победителя прошлого раунда: так проигрывающему легче отыграться).
// Фитиль раунда — BOMB_CFG.fuse секунд, при передаче не сбрасывается; у кого бомба, когда он догорел, тот проиграл раунд.
// Бомба переходит к сопернику при любом касании машин (касания считает pushContacts() в js/physics.js →
// Car.touchAt); новый хозяин BOMB_CFG.back секунд не может отдать её обратно. Тому, у кого бомба, помогаем догонять:
// разгон и максималка выше (Car.speedMul), копится нитро, 3D-стрелка показывает на соперника, края экрана краснеют.
// Машина с бомбой утонула — бомба взрывается сразу. Победителю раунда BOMB_ROUND_REWARD, матча — BOMB_REWARD.
// Определяет: BOMB_RED, Bomb.
// Использует: BOMB_CFG, BOMB_ROUND_REWARD, BOMB_REWARD (js/data.js); rand, clamp (js/core.js); world
//   (js/maps/registry.js); softTex, sparks, smoke (js/effects.js); Sound (js/audio.js); cars, simTime
//   (js/physics.js); countdown, placeCam, paused (js/match.js); HUD, notify, addCoins, $, keys, mmXY (js/ui.js);
//   TargetArrow (js/arrow.js); Feel (js/feel.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

/* =====================================================================
   ГОРЯЧАЯ БОМБА
   ===================================================================== */
const BOMB_RED = 0xff3b3b;

const Bomb = (() => {
  const fresh = () => ({ on: false, phase: '', round: 0, wins: [0, 0], holder: -1, fuse: 0, back: 0, seen: -1, time: 0,
    phaseT: 0, goT: -9, passT: -9, tickT: 0, go: false, winner: -1, loser: -1, passes: 0, reward: [0, 0], done: false });
  const st = fresh();
  const BOOM_PAUSE = 3.5;              // сколько секунд после взрыва до следующего раунда (или итогов)

  /* ---------- бомба на крыше ---------- */
  // материалы и меши создаются один раз: бомба одна и только переезжает с крыши на крышу
  const shellMat = new THREE.MeshStandardMaterial({ color: 0x1c1c21, roughness: 0.35, metalness: 0.35, emissive: BOMB_RED, emissiveIntensity: 0 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x9a9da3, roughness: 0.4, metalness: 0.8 });
  const fuseMat = new THREE.MeshStandardMaterial({ color: 0xcbb68c, roughness: 0.9 });
  const sparkMat = new THREE.SpriteMaterial({ map: softTex, color: 0xffc040, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false });
  const mesh = new THREE.Group(), shell = new THREE.Group();
  shell.add(new THREE.Mesh(new THREE.SphereGeometry(0.36, 24, 16), shellMat));
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.365, 0.035, 8, 32), metalMat); belt.rotation.x = Math.PI / 2; shell.add(belt);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.12, 16), metalMat); cap.position.y = 0.36; shell.add(cap);
  const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 6), fuseMat);
  fuse.position.set(0.05, 0.54, 0); fuse.rotation.z = -0.35; shell.add(fuse);
  const spark = new THREE.Sprite(sparkMat); spark.position.set(0.1, 0.69, 0); shell.add(spark);
  mesh.add(shell);
  mesh.visible = false;
  const _v = new THREE.Vector3();
  function attach(p) {
    const c = cars[p];
    c.model.root.add(mesh);
    mesh.position.set(0, c.H + 0.28, -c.L * 0.04);
    mesh.visible = true;
  }
  function detach() { if (mesh.parent) mesh.parent.remove(mesh); mesh.visible = false; }
  // мигание: чем меньше осталось, тем чаще; пока бомбу нельзя отдать — тусклая
  const blinkHz = () => st.fuse > 10 ? 1.5 : st.fuse > 5 ? 3 : st.fuse > 2 ? 6 : 10;
  const blink = () => Math.sin(st.time * Math.PI * 2 * blinkHz()) > 0;
  function animate(dt) {
    if (!mesh.visible) return;
    shellMat.emissiveIntensity = st.back > 0 ? 0.12 : blink() ? 2.4 : 0.15;
    const pop = Math.max(0, 1 - (st.time - st.passT) / 0.45);     // бомба «прыгает» при передаче
    shell.scale.setScalar(1 + 0.6 * pop * pop);
    shell.rotation.y += dt * 1.2;
    spark.scale.setScalar(rand(0.3, 0.55));
    spark.material.rotation = rand(0, 6.3);
    if (Math.random() < 0.5) {
      spark.getWorldPosition(_v);
      sparks.spawn(_v.x, _v.y, _v.z, rand(-1.5, 1.5), rand(0.5, 2.5), rand(-1.5, 1.5), 0.08, 0.02, rand(0.2, 0.4), 0xffc040, 1, 6);
    }
  }

  /* ---------- HUD: табличка и красные края экрана ---------- */
  const ui = [0, 1].map(p => {
    const box = document.createElement('div'); box.className = 'bomb hidden';
    box.innerHTML = '<small class="bh"></small><div class="bt"></div><div class="bs"><small>СЧЁТ</small><span class="me"></span>' +
      '<i>:</i><span class="op"></span></div><div class="bst"></div><div class="bd"></div>';
    const fx = document.createElement('div'); fx.className = 'bombfx';
    HUD[p].root.appendChild(fx); HUD[p].root.appendChild(box);
    const q = s => box.querySelector(s);
    return { box, fx, bh: q('.bh'), bt: q('.bt'), me: q('.me'), op: q('.op'), bst: q('.bst'), bd: q('.bd'), cache: {} };
  });
  function put(u, key, el, v) { if (u.cache[key] !== v) { u.cache[key] = v; el.textContent = v; } }
  // больше 10 с — минуты и секунды, меньше — с десятыми
  const fmt = s => { if (s <= 10) return Math.max(0, s).toFixed(1); const n = Math.ceil(s); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; };
  function status(p) {
    const mine = st.holder === p;
    if (st.phase === 'over') return st.winner === p ? ['ПОБЕДА!', 'mine'] : ['Поражение', 'theirs'];
    if (st.phase === 'boom') return st.winner === p ? ['Раунд твой!', 'mine'] : ['Взрыв! Раунд проигран', 'theirs'];
    if (countdown > 0) return mine ? ['Бомба у тебя — после старта догоняй', 'hot'] : ['Бомба у соперника — после старта беги', 'mine'];
    if (mine) return st.back > 0 ? [`БОМБА У ТЕБЯ · отдать через ${st.back.toFixed(1)}`, 'theirs'] : ['БОМБА У ТЕБЯ! Коснись соперника', 'hot'];
    return st.back > 0 ? ['Пас! Отрывайся', 'mine'] : ['УБЕГАЙ!', 'mine'];
  }
  function drawHud() {
    for (let p = 0; p < 2; p++) {
      const u = ui[p], o = 1 - p;
      if (!st.on || p >= cars.length) continue;
      put(u, 'bh', u.bh, `РАУНД ${st.round} · ДО ${BOMB_CFG.wins} ПОБЕД`);
      put(u, 'bt', u.bt, st.phase === 'live' ? fmt(st.fuse) : st.phase === 'boom' ? 'БАХ!' : '');
      const low = st.phase === 'live' && st.fuse <= 10;
      if (u.cache.low !== low) { u.cache.low = low; u.bt.classList.toggle('low', low); }
      put(u, 'me', u.me, String(st.wins[p])); put(u, 'op', u.op, String(st.wins[o]));
      const [s, cls] = status(p);
      put(u, 'bst', u.bst, s);
      if (u.cache.cls !== cls) { u.cache.cls = cls; u.bst.className = 'bst ' + cls; }
      const d = st.phase === 'live' ? `До соперника ${Math.round(Math.hypot(cars[0].x - cars[1].x, cars[0].z - cars[1].z))} м` : '';
      put(u, 'bd', u.bd, d);
      // красные края экрана у того, у кого бомба: пульсируют в такт миганию
      const op = st.phase === 'live' && st.holder === p ? (st.back > 0 ? 0.25 : blink() ? 0.75 : 0.4) : 0;
      const v = op.toFixed(2);
      if (u.cache.fx !== v) { u.cache.fx = v; u.fx.style.opacity = v; }
    }
  }

  /* ---------- раунды ---------- */
  // две точки на дорогах примерно в BOMB_CFG.gap метрах друг от друга, где-то на карте
  function spots() {
    const BX = (world.boundsX ?? world.bounds) * 0.7, BZ = (world.boundsZ ?? world.bounds) * 0.7, G = BOMB_CFG.gap;
    let best = null;
    for (let i = 0; i < 40; i++) {
      const a = world.roadPoint(rand(-BX, BX), rand(-BZ, BZ), 0), t = rand(0, Math.PI * 2);
      const b = world.roadPoint(a[0] + Math.sin(t) * G, a[1] + Math.cos(t) * G, 1);
      const err = Math.abs(Math.hypot(a[0] - b[0], a[1] - b[1]) - G);
      if (!best || err < best.err) best = { a, b, err };
      if (err < G * 0.2) break;
    }
    return best;
  }
  function startRound(holder) {
    const s = spots(), [hs, rs] = Math.random() < 0.5 ? [s.a, s.b] : [s.b, s.a];
    cars[holder].fullReset(...hs); cars[1 - holder].fullReset(...rs);
    for (const c of cars) c.fx.repair();
    st.round++; st.holder = holder; st.fuse = BOMB_CFG.fuse; st.back = 0; st.tickT = 0; st.go = false;
    st.phase = 'live'; st.phaseT = st.time; st.seen = simTime;
    attach(holder);
    if (st.round > 1) {              // первый раунд: отсчёт и камеры ставит startMatch()
      countdown = 3.2;
      for (let p = 0; p < 2; p++) { placeCam(p, 0, true); HUD[p].feed.innerHTML = ''; }
    }
  }
  function pass() {
    const from = st.holder, to = 1 - from;
    st.holder = to; st.back = BOMB_CFG.back; st.passT = st.time; st.passes++;
    attach(to);
    Sound.bombPass(to);
    Feel.flash(to, 'hit', 0.5); Feel.flash(from, 'gold', 0.25);
    notify(from, 'ПАС! Бомба у соперника — отрывайся', 'good');
    notify(to, 'БОМБА У ТЕБЯ! Догони соперника', 'bad');
  }
  function explode() {
    const L = st.holder, W = 1 - L, c = cars[L], o = cars[W];
    st.phase = 'boom'; st.phaseT = st.time; st.loser = L; st.winner = W; st.wins[W]++;
    detach();
    // огонь и дым
    const cols = [0xffe080, 0xff8a20, 0xff4a10];
    for (let k = 0; k < 110; k++)
      sparks.spawn(c.x, c.y + 1, c.z, rand(-9, 9), rand(3, 15), rand(-9, 9), rand(0.7, 1.4), 0.1, rand(0.5, 1.1), cols[k % 3], 1, 9);
    for (let k = 0; k < 40; k++)
      smoke.spawn(c.x + rand(-1.5, 1.5), c.y + rand(0.5, 2.2), c.z + rand(-1.5, 1.5), rand(-2.5, 2.5), rand(2, 6), rand(-2.5, 2.5),
        rand(1.5, 2.5), rand(6, 9), rand(2, 3.5), 0x2a2622, 0.75);
    // машину подбрасывает и закручивает, бамперы отлетают, она ломается до конца раунда
    if (c.drown <= 0) {
      const m = c.mass;
      c.body.applyImpulse({ x: rand(-1, 1) * m, y: m * 7, z: rand(-1, 1) * m }, true);
      c.body.applyTorqueImpulse({ x: rand(-1, 1) * m * 2, y: rand(-1, 1) * m, z: rand(-1, 1) * m * 2 }, true);
      c.tumble = 2; c.flipCd = 2;
      c.fx.detach('f', 20); c.fx.detach('r', 20);
    }
    c.hp = 0; c.broken = BOOM_PAUSE + 1; c.shake = 1;
    // соседа рядом отбрасывает взрывной волной
    const d = Math.hypot(o.x - c.x, o.z - c.z) || 1;
    if (d < 14 && o.drown <= 0) {
      const J = (1 - d / 14) * o.mass * 6;
      o.body.applyImpulse({ x: (o.x - c.x) / d * J, y: J * 0.35, z: (o.z - c.z) / d * J }, true);
    }
    o.shake = Math.max(o.shake, clamp(1 - d / 80, 0.2, 1));
    Sound.boom(L); Feel.ko(W, L);
    st.reward[W] += BOMB_ROUND_REWARD; addCoins(W, BOMB_ROUND_REWARD);
    notify(W, `РАУНД ТВОЙ! ${st.wins[W]} : ${st.wins[L]} · +${BOMB_ROUND_REWARD}`, 'gold', true);
    notify(L, `БАХ! Раунд проигран · ${st.wins[L]} : ${st.wins[W]}`, 'bad');
  }
  function finish() {
    st.phase = 'over'; st.phaseT = st.time;
    const w = st.winner = st.wins[0] > st.wins[1] ? 0 : 1;
    st.reward[w] += BOMB_REWARD; addCoins(w, BOMB_REWARD);
    notify(w, `ПОБЕДА! ${st.wins[w]} : ${st.wins[1 - w]} · +${BOMB_REWARD}`, 'gold', true); Sound.ko(w);
    notify(1 - w, `Соперник победил · ${st.wins[1 - w]} : ${st.wins[w]}`, 'bad');
  }
  const word = n => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? 'победа' : a >= 2 && a <= 4 && (b < 12 || b > 14) ? 'победы' : 'побед'; };
  function showResults() {
    st.done = true;
    const w = st.winner;
    $('reTitle').innerHTML = `<span class="pl${w + 1}">ИГРОК ${w + 1}</span> ПОБЕДИЛ`;
    $('reRows').innerHTML = [w, 1 - w].map((p, k) => `
      <div class="rerow p${p + 1}"><b>${k + 1}</b><span class="who">Игрок ${p + 1} · ${cars[p].def.short}</span>
        <span class="res">${st.wins[p]} ${word(st.wins[p])}</span>
        <span class="rew">${st.reward[p] ? `+${st.reward[p]} <i class="coin"></i>` : ''}</span></div>`).join('');
    $('reAgain').innerHTML = 'Реванш <kbd>Enter</kbd>';
    paused = true; keys.clear();
    $('raceEnd').classList.remove('hidden');
  }

  function start(on) {
    detach();
    Object.assign(st, fresh());
    for (let p = 0; p < 2; p++) {
      ui[p].box.classList.toggle('hidden', !on); ui[p].fx.style.opacity = '0'; ui[p].cache = {};
    }
    if (!on || cars.length < 2) { st.on = false; for (const u of ui) u.box.classList.add('hidden'); return; }
    st.on = true;
    $('hud').classList.add('racing');                    // лента уведомлений ниже таблички режима
    startRound(Math.random() < 0.5 ? 0 : 1);
  }
  function stop() { start(false); }

  function update(dt, t) {
    if (!st.on) return;
    st.time += dt;
    if (st.phase === 'live' && countdown <= 0) {
      const h = cars[st.holder], o = cars[1 - st.holder];
      if (!st.go) {                                       // старт раунда: напомнить, кто догоняет
        st.go = true; st.goT = st.time;
        notify(st.holder, 'Бомба у тебя — догони и коснись соперника!', 'bad');
        notify(1 - st.holder, 'Бомба у соперника — убегай!', 'good');
      }
      st.fuse -= dt;
      if (st.back > 0) st.back -= dt;
      if (h.drown > 0 || st.fuse <= 0) explode();
      else {
        if (h.touchAt > st.seen && st.back <= 0) pass();
        const nh = cars[st.holder];
        nh.speedMul = 1 + BOMB_CFG.speed; cars[1 - st.holder].speedMul = 1;
        nh.nitro = Math.min(1, nh.nitro + BOMB_CFG.nitro * dt);
        if ((st.tickT -= dt) <= 0) {                      // тиканье: чем меньше осталось, тем чаще
          st.tickT = st.fuse > 10 ? 1 : st.fuse > 5 ? 0.5 : st.fuse > 2 ? 0.25 : 0.12;
          Sound.bombTick(st.holder, st.fuse <= 10);
        }
      }
    }
    if (st.phase !== 'live') for (const c of cars) c.speedMul = 1;
    cars.forEach((c, p) => c.markerLift = st.phase === 'live' && st.holder === p ? 0.9 : 0);
    st.seen = simTime;
    if (st.phase === 'boom' && st.time - st.phaseT > BOOM_PAUSE) {
      if (Math.max(...st.wins) >= BOMB_CFG.wins) finish();
      else startRound(st.winner);                         // бомба — у победителя прошлого раунда
    }
    if (st.phase === 'over' && !st.done && st.time - st.phaseT > 2) showResults();
    animate(dt);
    drawHud();
  }

  /* ---------- крупные надписи, мини-карта, стрелка ---------- */
  function big(p) {
    if (!st.on) return '';
    if (st.phase === 'over') return st.winner === p ? 'ПОБЕДА!' : 'ПОРАЖЕНИЕ';
    if (st.phase === 'boom') return st.time - st.phaseT < 2.5 ? (st.winner === p ? 'РАУНД ТВОЙ!' : 'БАХ!') : '';
    if (st.go && st.time - st.goT < 1.5) return st.holder === p ? 'ДОГОНЯЙ!' : 'УБЕГАЙ!';
    if (st.holder === p && st.time - st.passT < 1) return 'БОМБА!';
    return '';
  }
  // мини-карта машины p (север сверху): пульсирующее красное кольцо вокруг того, у кого бомба
  function minimap(ctx, p, R, k) {
    if (!st.on || st.phase !== 'live') return;
    const c = cars[p], h = cars[st.holder], pulse = blink() ? 1 : 0.4;
    let x = 0, y = 0;
    if (h !== c) {
      [x, y] = mmXY(c, h.x, h.z, k);
      const d = Math.hypot(x, y), lim = R - 12;
      if (d > lim) { x *= lim / d; y *= lim / d; }
    }
    ctx.strokeStyle = `rgba(255,59,59,${pulse})`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.stroke();
  }
  // стрелка: у кого бомба — на соперника
  function drawArrow(p, w, h) {
    if (!st.on || st.phase !== 'live' || st.holder !== p) return;
    const o = cars[1 - p];
    TargetArrow.draw(p, w, h, o.x, o.y + 1, o.z, BOMB_RED, 15);
  }
  return { start, stop, update, big, minimap, drawArrow, get on() { return st.on; }, st, pass, explode };
})();
