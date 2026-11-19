// Режим «Гонка»: по городу расставлены RACE_CPS больших светящихся арок-чекпоинтов. Их нужно проехать по порядку
// быстрее соперника (путь между ними — любой); за каждую арку — RACE_CP_REWARD монет, победителю — ещё RACE_REWARD.
// Видна только следующая арка (и в 3D, и на мини-карте).
// 3D-стрелка вверху половины экрана (js/arrow.js) показывает на следующий чекпоинт.
// Определяет: CP_R, CP_COL, CP_FIN, CP_LAYER, Race.
// Использует: RACE_CPS, RACE_CP_REWARD, BADGE_RACER_T, RACE_REWARD (js/data.js); rand (js/core.js); unlockBadge
//   (js/badges.js); waterLevel, scene (js/world.js); world (js/maps/registry.js); sparks (js/effects.js); Sound
//   (js/audio.js); cars (js/physics.js); countdown, cams, paused (js/match.js); $, HUD, addCoins, notify, keys
//   (js/ui.js); TargetArrow (js/arrow.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.

/* =====================================================================
   ГОНКА ПО ЧЕКПОИНТАМ
   ===================================================================== */
const CP_R = 10;                         // радиус арки и зоны зачёта, м
const CP_COL = 0x35ffa0, CP_FIN = 0xffd23a;
const CP_LAYER = p => 3 + p;             // у каждого игрока свои арки: их видит только его камера

const Race = (() => {
  const st = { on: false, cps: [], prog: [0, 0], fin: [null, null], time: 0, winner: -1, endT: 0, done: false };

  /* ---------- маршрут ---------- */
  // узел дорожного графа годится под чекпоинт: перекрёсток на земле, не под эстакадой, не на кольце, рядом нет зданий и памятников
  function goodNode(n) {
    if (n.deg < 2) return false;
    const x = n.x, z = n.z, g = world.ground(x, z);
    const wl = waterLevel(x, z);
    if (wl !== null && g < wl + 0.3) return false;
    if (world.surface && world.surface(x, z) > g + 1.5) return false;
    if (world.trafficData.rounds.some(r => Math.hypot(r.x - x, r.z - z) < 40)) return false;
    return !world.grid.query(x - 9, x + 9, z - 9, z + 9).some(o => !o.brk && (o.box
      ? Math.max(o.minX - x, 0, x - o.maxX) ** 2 + Math.max(o.minZ - z, 0, z - o.maxZ) ** 2 < 49
      : Math.hypot(o.x - x, o.z - z) < o.r + 7));
  }
  // случайная трасса: каждый следующий чекпоинт в 320–620 м от предыдущего, без разворотов назад и без сгущений
  function makeRoute() {
    const nodes = world.trafficData.nodes.filter(goodNode);
    const [sx, sz, sh] = world.spawns[0];
    const pts = [];
    let px = sx, pz = sz, dx0 = Math.sin(sh), dz0 = Math.cos(sh);
    for (let i = 0; i < RACE_CPS; i++) {
      const lo = i === 0 ? 220 : 320, hi = i === 0 ? 420 : 620;
      let pool = [];
      for (let relax = 0; relax < 5 && !pool.length; relax++) {
        const k = 1 + relax * 0.3;
        pool = nodes.filter(n => {
          const dx = n.x - px, dz = n.z - pz, d = Math.hypot(dx, dz);
          if (d < lo / k || d > hi * k) return false;
          if (relax < 3 && (dx * dx0 + dz * dz0) / d < (i === 0 ? 0.3 : -0.35)) return false;   // не назад
          return pts.every(q => Math.hypot(q.x - n.x, q.z - n.z) > 220 / k);
        });
      }
      const n = pool.length ? pool[Math.floor(Math.random() * pool.length)] : nodes[Math.floor(Math.random() * nodes.length)];
      const d = Math.hypot(n.x - px, n.z - pz) || 1;
      dx0 = (n.x - px) / d; dz0 = (n.z - pz) / d; px = n.x; pz = n.z;
      pts.push({ x: n.x, z: n.z, y: world.ground(n.x, n.z) });
    }
    return pts;
  }

  /* ---------- арки ---------- */
  const fadeTex = (() => {
    const c = document.createElement('canvas'); c.width = 4; c.height = 256; const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.7, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,1)');
    x.fillStyle = g; x.fillRect(0, 0, 4, 256);
    return new THREE.CanvasTexture(c);
  })();
  const labels = {};
  function labelTex(txt) {
    if (labels[txt]) return labels[txt];
    const c = document.createElement('canvas'); c.width = 512; c.height = 192; const x = c.getContext('2d');
    x.font = `${txt.length > 2 ? 110 : 150}px 'Russo One', 'Arial Black', sans-serif`;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 18; x.strokeStyle = 'rgba(0,0,0,.75)'; x.strokeText(txt, 256, 100);
    x.fillStyle = '#fff'; x.fillText(txt, 256, 100);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return labels[txt] = t;
  }
  const glow = (opacity, extra = {}) => new THREE.MeshBasicMaterial(Object.assign({ transparent: true, opacity, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, fog: false }, extra));
  const GEO = {
    pillar: new THREE.CylinderGeometry(CP_R, CP_R, 80, 48, 1, true).translate(0, 40, 0),
    arch: new THREE.TorusGeometry(CP_R, 0.75, 12, 56, Math.PI),
    film: new THREE.CircleGeometry(CP_R, 48, 0, Math.PI),
    ring: new THREE.RingGeometry(CP_R - 0.8, CP_R, 72).rotateX(-Math.PI / 2).translate(0, 0.25, 0),
  };
  function makeGate(p) {
    const g = new THREE.Group(), mats = [];
    const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.layers.set(CP_LAYER(p)); m.frustumCulled = false; m.renderOrder = 2; g.add(m); mats.push(mat); return m; };
    add(GEO.pillar, glow(0.45, { map: fadeTex }));
    add(GEO.arch, new THREE.MeshBasicMaterial({ fog: false }));
    const film = add(GEO.film, glow(0.13));
    const ring = add(GEO.ring, glow(0.85));
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex('1'), transparent: true, depthWrite: false, fog: false }));
    label.scale.set(10, 3.75, 1); label.position.y = CP_R + 4.5; label.layers.set(CP_LAYER(p)); label.renderOrder = 3;
    g.add(label);
    g.visible = false; scene.add(g);
    return { g, mats, film, ring, label, base: [0.13, 0.85] };
  }
  const gates = [0, 1].map(p => ({ cur: makeGate(p) }));
  function showGate(G, i, cam, t) {
    if (i >= st.cps.length) { G.g.visible = false; return; }
    const cp = st.cps[i], fin = i === st.cps.length - 1;
    G.g.visible = true;
    G.g.position.set(cp.x, cp.y, cp.z);
    G.g.rotation.y = Math.atan2(cam.position.x - cp.x, cam.position.z - cp.z);     // арка всегда развёрнута к своему игроку
    const col = fin ? CP_FIN : CP_COL;
    for (const m of G.mats) m.color.setHex(col);
    const pulse = 0.75 + 0.25 * Math.sin(t * 5);
    G.film.material.opacity = G.base[0] * pulse; G.ring.material.opacity = G.base[1] * (0.8 + 0.2 * pulse);
    G.label.material.map = labelTex(fin ? 'ФИНИШ' : String(i + 1));
  }

  /* ---------- 3D-стрелка (js/arrow.js) ---------- */
  function drawArrow(p, w, h) {
    if (!st.on || st.fin[p] !== null || !st.cps.length) return;
    const cp = st.cps[st.prog[p]];
    TargetArrow.draw(p, w, h, cp.x, cp.y, cp.z, st.prog[p] === st.cps.length - 1 ? CP_FIN : CP_COL);
  }

  /* ---------- ход гонки ---------- */
  const fmt = t => { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`; };
  function start(on) {
    st.on = on; st.prog = [0, 0]; st.fin = [null, null]; st.time = 0; st.winner = -1; st.endT = 0; st.done = false;
    st.cps = on ? makeRoute() : [];
    for (const G of gates) G.cur.g.visible = false;
    $('raceEnd').classList.add('hidden');
    for (let p = 0; p < 2; p++) HUD[p].race.classList.toggle('hidden', !on);
    $('hud').classList.toggle('racing', on);
  }
  function stop() { start(false); }
  function pass(p) {
    const c = cars[p];
    st.prog[p]++;
    addCoins(p, RACE_CP_REWARD);
    for (let k = 0; k < 18; k++) sparks.spawn(c.x, c.y + 1.2, c.z, rand(-5, 5), rand(2, 7), rand(-5, 5), 0.5, 0.05, 0.6, st.prog[p] === RACE_CPS ? 0xffd84a : 0x6dffb8, 1, 8);
    if (st.prog[p] < RACE_CPS) {
      Sound.coin(p);
      notify(p, `Чекпоинт ${st.prog[p]} / ${RACE_CPS} · ${fmt(st.time)} · +${RACE_CP_REWARD}`, 'good');
      return;
    }
    st.fin[p] = st.time;
    if (st.time <= BADGE_RACER_T) unlockBadge(p, 'racer');   // значок «Гонщик» (js/badges.js)
    if (st.winner < 0) {
      st.winner = p; st.endT = st.time;
      addCoins(p, RACE_REWARD);
      notify(p, `ПОБЕДА! +${RACE_REWARD}`, 'gold', true); Sound.ko(p);
      notify(1 - p, 'Соперник финишировал первым', 'bad');
    } else { notify(p, `Финиш · ${fmt(st.time)}`, 'good'); Sound.coin(p); }
  }
  // дистанция до следующей арки (для HUD и места в гонке)
  const distTo = p => { const cp = st.cps[st.prog[p]]; return cp ? Math.hypot(cp.x - cars[p].x, cp.z - cars[p].z) : 0; };
  function place(p) {
    const o = 1 - p;
    if (st.fin[p] !== null || st.fin[o] !== null) return st.winner === p || (st.winner < 0 && st.fin[p] !== null) ? 1 : 2;
    if (st.prog[p] !== st.prog[o]) return st.prog[p] > st.prog[o] ? 1 : 2;
    return distTo(p) <= distTo(o) ? 1 : 2;
  }
  function update(dt, t) {
    if (!st.on) return;
    if (countdown <= 0 && !st.done) st.time += dt;
    for (let p = 0; p < 2; p++) {
      const c = cars[p];
      if (countdown <= 0 && st.fin[p] === null && c.drown <= 0) {
        const cp = st.cps[st.prog[p]];
        if (Math.hypot(cp.x - c.x, cp.z - c.z) < CP_R + 1 && Math.abs(c.y - cp.y) < 7) pass(p);
      }
      const G = gates[p];
      showGate(G.cur, st.fin[p] === null ? st.prog[p] : RACE_CPS, cams[p], t);
    }
    // после финиша победителя у соперника ещё несколько секунд, затем итоги
    if (st.winner >= 0 && !st.done && (st.time - st.endT > 4 || st.fin[1 - st.winner] !== null && st.time - st.endT > 1.5)) showResults();
  }
  function showResults() {
    st.done = true;
    const w = st.winner;
    $('reTitle').innerHTML = `<span class="pl${w + 1}">ИГРОК ${w + 1}</span> ПОБЕДИЛ`;
    $('reRows').innerHTML = [w, 1 - w].map((p, k) => `
      <div class="rerow p${p + 1}"><b>${k + 1}</b><span class="who">Игрок ${p + 1} · ${cars[p].def.short}</span>
        <span class="res">${st.fin[p] !== null ? fmt(st.fin[p]) : `${st.prog[p]} / ${RACE_CPS} чекпоинтов`}</span>
        ${k === 0 ? `<span class="rew">+${RACE_REWARD} <i class="coin"></i></span>` : '<span class="rew"></span>'}</div>`).join('');
    $('reAgain').innerHTML = 'Реванш · новая трасса <kbd>Enter</kbd>';
    paused = true; keys.clear();
    $('raceEnd').classList.remove('hidden');
  }
  // текст для HUD игрока p
  function hud(p) {
    if (!st.on) return null;
    const fin = st.fin[p] !== null;
    return {
      cp: fin ? 'ФИНИШ' : `${Math.min(st.prog[p] + 1, RACE_CPS)} / ${RACE_CPS}`,
      dist: fin ? fmt(st.fin[p]) : `${Math.round(distTo(p))} м`,
      time: fmt(fin ? st.fin[p] : st.time),
      place: place(p) === 1 ? '1-е место' : '2-е место',
      lead: place(p) === 1,
    };
  }
  // крупная надпись по центру после финиша
  function big(p) {
    if (!st.on || st.winner < 0) return '';
    return st.winner === p ? 'ПОБЕДА!' : st.fin[p] !== null ? 'ФИНИШ' : '';
  }
  // мини-карта: только следующая арка (на краю круга, если далеко)
  function minimap(ctx, p, R, k) {
    if (!st.on || st.fin[p] !== null) return;
    const c = cars[p], cs = Math.cos(c.h), sn = Math.sin(c.h);
    const i = st.prog[p], cp = st.cps[i];
    if (!cp) return;
    const dx = (c.x - cp.x) * k, dz = (c.z - cp.z) * k;
    let x = dx * cs - dz * sn, y = dx * sn + dz * cs;
    const d = Math.hypot(x, y), lim = R - 9;
    if (d > lim) { x *= lim / d; y *= lim / d; }
    ctx.fillStyle = i === RACE_CPS - 1 ? '#ffd23a' : '#35ffa0'; ctx.strokeStyle = '#0b1a12'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#0b1a12'; ctx.font = "bold 10px 'Rubik', sans-serif"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(i === RACE_CPS - 1 ? 'F' : String(i + 1), x, y + 0.5);
  }
  return { start, stop, update, drawArrow, hud, big, minimap, get on() { return st.on; }, get done() { return st.done; }, st };
})();
