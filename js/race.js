// Режим «Гонка»: по карте (Город, Ситжес — RACE_CFG в js/maps/registry.js) расставлены большие светящиеся
// арки-чекпоинты — на перекрёстках дорожного графа, на Ситжесе часть — у достопримечательностей. Их нужно проехать
// по порядку быстрее соперника (путь между ними — любой); за каждую арку — RACE_CP_REWARD монет, победителю — ещё
// RACE_REWARD. Видна только следующая арка (и в 3D, и на мини-карте).
// 3D-стрелка вверху половины экрана (js/arrow.js) показывает на следующий чекпоинт.
// Определяет: CP_R, CP_COL, CP_FIN, CP_LAYER, RACE_DEF, raceCfg, Race.
// Использует: RACE_CPS, RACE_CP_REWARD, BADGE_RACER_T, RACE_REWARD (js/data.js); rand (js/core.js); unlockBadge
//   (js/badges.js); waterLevel, scene (js/world.js); RACE_CFG, world (js/maps/registry.js); sparks (js/effects.js);
//   Sound (js/audio.js); cars (js/physics.js); countdown, cams, paused (js/match.js); $, HUD, addCoins, notify, keys,
//   mmXY (js/ui.js); TargetArrow (js/arrow.js); last (js/main.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.

/* =====================================================================
   ГОНКА ПО ЧЕКПОИНТАМ
   ===================================================================== */
const CP_R = 10;                         // радиус арки и зоны зачёта, м
const CP_COL = 0x35ffa0, CP_FIN = 0xffd23a;
const CP_LAYER = p => 3 + p;             // у каждого игрока свои арки: их видит только его камера

// Настройки гонки по умолчанию («Город»); карта меняет нужное через RACE_CFG (js/maps/registry.js). cps — чекпоинтов;
// r — радиус арки и зоны зачёта, у тесных мест — до rMin; clear — сколько метров вокруг перекрёстка должно быть пусто;
// first / step — расстояние до первого / между следующими, м; sep — не ближе к прошлым;
// back — первый может быть позади старта. spots — места у достопримечательностей
// ({ id, icon, name, at: [x, z], seek, w }, см. js/maps/sitges/race.js), lm — сколько их в гонке (от и до),
// pLm0 / pLm / pLmFin — вероятность взять место, если оно в досягаемости (первый чекпоинт / обычный / финиш);
// pGoal — вероятность заранее назначить финиш у места с goal: true (не ближе step[1] к старту), трасса тогда к нему ведёт
const RACE_DEF = { cps: RACE_CPS, r: CP_R, rMin: CP_R, clear: 7, first: [220, 420], step: [320, 620], sep: 220, back: false,
  spots: [], lm: [0, 0], pLm0: 0, pLm: 0, pLmFin: 0, pGoal: 0 };
const raceCfg = mapId => Object.assign({}, RACE_DEF, RACE_CFG[mapId]);

const Race = (() => {
  const st = { on: false, cps: [], prog: [0, 0], fin: [null, null], time: 0, winner: -1, endT: 0, done: false, cfg: RACE_DEF };

  /* ---------- маршрут ---------- */
  // сколько метров (до max) от точки до ближайшей стены, столба, забора — несбиваемого коллайдера world.grid
  function clearAt(x, z, max) {
    let best = max;
    for (const o of world.grid.query(x - max, x + max, z - max, z + max)) {
      if (o.brk) continue;
      let d;
      if (o.poly) d = polyDist(o.poly, x, z);
      else if (o.obb) {
        const { w, d: dd, rot } = o.obb, c = Math.cos(rot), s = Math.sin(rot), dx = x - o.obb.x, dz = z - o.obb.z;
        d = Math.hypot(Math.max(Math.abs(dx * c - dz * s) - w / 2, 0), Math.max(Math.abs(dx * s + dz * c) - dd / 2, 0));
      } else if (o.box) d = Math.hypot(Math.max(o.minX - x, 0, x - o.maxX), Math.max(o.minZ - z, 0, z - o.maxZ));
      else d = Math.hypot(o.x - x, o.z - z) - o.r;
      if (d < best) { best = Math.max(d, 0); if (!best) break; }
    }
    return best;
  }
  function polyDist(pts, x, z) {
    let inside = false, best = Infinity;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [ax, az] = pts[j], [bx, bz] = pts[i];
      if ((az > z) !== (bz > z) && x < ax + (bx - ax) * (z - az) / (bz - az)) inside = !inside;
      const ex = bx - ax, ez = bz - az, L2 = ex * ex + ez * ez || 1, t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / L2));
      best = Math.min(best, Math.hypot(ax + ex * t - x, az + ez * t - z));
    }
    return inside ? 0 : best;
  }
  // точка годится под чекпоинт: на земле (не в воде, не под мостом или эстакадой) и вокруг пусто на need м
  function okPoint(x, z, need) {
    const g = world.ground(x, z), wl = waterLevel(x, z);
    if (wl !== null && g < wl + 0.3) return false;
    if (world.surface && world.surface(x, z) > g + 1.5) return false;
    return clearAt(x, z, need) >= need;
  }
  // перекрёстки дорожного графа под чекпоинт (не на кольце) — раз на карту. «Город» — world.trafficData; карты
  // с трафиком по сплайнам — граф world.trafficGraph() (общий с js/traffic/traffic.js)
  function nodeCands(cfg) {
    const w = world;
    if (w.__raceNodes) return w.__raceNodes;
    let nodes, rounds;
    if (w.trafficData) ({ nodes, rounds } = w.trafficData);
    else {
      const G = w.__trafficGraph || (w.__trafficGraph = w.trafficGraph());
      nodes = G.nodes.filter(n => !n.round); rounds = G.nodes.filter(n => n.round);
    }
    return w.__raceNodes = nodes.filter(n => n.deg >= 2 && !rounds.some(r => Math.hypot(r.x - n.x, r.z - n.z) < 40)
      && okPoint(n.x, n.z, cfg.clear)).map(n => ({ x: n.x, z: n.z }));
  }
  // места у достопримечательностей — раз на карту: в радиусе seek от at точка, где арке просторнее всего (до r м),
  // при равенстве — ближе к at. Не нашлось — места нет (в консоль)
  function spotCands(cfg) {
    const w = world;
    if (w.__raceSpots) return w.__raceSpots;
    const out = [];
    for (const s of cfg.spots) {
      let best = null;
      for (let dx = -s.seek; dx <= s.seek; dx += 3) for (let dz = -s.seek; dz <= s.seek; dz += 3) {
        const off = Math.hypot(dx, dz);
        if (off > s.seek) continue;
        const x = s.at[0] + dx, z = s.at[1] + dz;
        if (!okPoint(x, z, cfg.rMin)) continue;
        const score = Math.min(clearAt(x, z, cfg.r), cfg.r) - 0.05 * off;
        if (!best || score > best.score) best = { x, z, score };
      }
      if (best) out.push({ x: best.x, z: best.z, spot: s });
      else console.warn(`гонка: у «${s.name}» нет места под арку`);
    }
    return w.__raceSpots = out;
  }
  // случайная трасса из узлов nodes и мест spots: каждый следующий чекпоинт в step м от предыдущего, без разворотов
  // назад и без сгущений. С назначенным финишем goal каждый чекпоинт — там, откуда до goal хватит оставшихся шагов
  // (не дальше 0,8 step[1] на шаг), и не ближе sep к goal до финиша. start — [x, z, курс]; rnd — генератор случайных
  // чисел (превью на экране режима — свой)
  function plan(cfg, nodes, spots, start, rnd = Math.random) {
    const pick = a => a[Math.floor(rnd() * a.length)];
    const pickW = a => { let r = rnd() * a.reduce((s, q) => s + q.spot.w, 0); return a.find(q => (r -= q.spot.w) < 0) || a[a.length - 1]; };
    const [sx, sz, sh] = start, pts = [];
    const goals = spots.filter(s => s.spot.goal && Math.hypot(s.x - sx, s.z - sz) > cfg.step[1]);
    const goal = goals.length && rnd() < cfg.pGoal ? pickW(goals) : null;
    let px = sx, pz = sz, dx0 = Math.sin(sh), dz0 = Math.cos(sh), lm = 0;
    for (let i = 0; i < cfg.cps; i++) {
      const [lo, hi] = i === 0 ? cfg.first : cfg.step, last = i === cfg.cps - 1, left = cfg.cps - 1 - i;
      let pool = [], sp = [];
      for (let relax = 0; relax < 5 && !pool.length && !sp.length; relax++) {
        const k = 1 + relax * 0.3;
        const fits = n => {
          const dx = n.x - px, dz = n.z - pz, d = Math.hypot(dx, dz);
          if (d < lo / k || d > hi * k) return false;
          if (relax < 3) {                                                                  // не назад
            const c = (dx * dx0 + dz * dz0) / d;
            if (i === 0 ? (cfg.back ? Math.abs(c) < 0.3 : c < 0.3) : c < -0.35) return false;
          }
          if (goal && !last) {                                                              // к назначенному финишу
            const dg = Math.hypot(goal.x - n.x, goal.z - n.z);
            if (dg > left * cfg.step[1] * 0.8 * k || dg < cfg.sep / k) return false;
          }
          return pts.every(q => Math.hypot(q.x - n.x, q.z - n.z) > cfg.sep / k);
        };
        if (goal && last && fits(goal)) { pool = []; sp = [goal]; break; }
        pool = nodes.filter(fits);
        if (lm < cfg.lm[1]) sp = spots.filter(s => s !== goal && fits(s));
      }
      let n;
      if (goal && last && sp[0] === goal) { n = goal; lm++; }
      else if (sp.length && (!pool.length || rnd() < (last ? cfg.pLmFin : i === 0 ? cfg.pLm0 : cfg.pLm))) { n = pickW(sp); lm++; }
      else n = pool.length ? pick(pool) : pick(nodes);
      const d = Math.hypot(n.x - px, n.z - pz) || 1;
      dx0 = (n.x - px) / d; dz0 = (n.z - pz) / d; px = n.x; pz = n.z;
      pts.push({ x: n.x, z: n.z, spot: n.spot || null });
    }
    return { pts, lm };
  }
  // трасса заезда: до 40 попыток набрать не меньше cfg.lm[0] достопримечательностей, иначе — где их больше всего.
  // Радиус арки — по простору вокруг (rMin…r)
  function makeRoute(cfg) {
    const nodes = nodeCands(cfg), spots = spotCands(cfg);
    let best = null;
    for (let k = 0; k < 40; k++) {
      const R = plan(cfg, nodes, spots, world.spawns[0]);
      if (!best || R.lm > best.lm) best = R;
      if (R.lm >= cfg.lm[0]) break;
    }
    return best.pts.map(p => Object.assign(p, { y: world.ground(p.x, p.z), r: Math.max(cfg.rMin, Math.min(cfg.r, clearAt(p.x, p.z, cfg.r))) }));
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
    const s = cp.r / CP_R;                                                          // арка меньше — подпись того же размера
    G.g.scale.setScalar(s); G.label.scale.set(10 / s, 3.75 / s, 1);
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
  function start(on, mapId) {
    st.on = on; st.prog = [0, 0]; st.fin = [null, null]; st.time = 0; st.winner = -1; st.endT = 0; st.done = false;
    st.cfg = on ? raceCfg(mapId) : RACE_DEF;
    st.cps = on ? makeRoute(st.cfg) : [];
    for (const G of gates) G.cur.g.visible = false;
    $('raceEnd').classList.add('hidden');
    for (let p = 0; p < 2; p++) HUD[p].race.classList.toggle('hidden', !on);
    $('hud').classList.toggle('racing', on);
  }
  function stop() { start(false); }
  function pass(p) {
    const c = cars[p], N = st.cps.length, spot = st.cps[st.prog[p]].spot;
    st.prog[p]++;
    addCoins(p, RACE_CP_REWARD);
    for (let k = 0; k < 18; k++) sparks.spawn(c.x, c.y + 1.2, c.z, rand(-5, 5), rand(2, 7), rand(-5, 5), 0.5, 0.05, 0.6, st.prog[p] === N ? 0xffd84a : 0x6dffb8, 1, 8);
    if (st.prog[p] < N) {
      Sound.coin(p);
      notify(p, `Чекпоинт ${st.prog[p]} / ${N}${spot ? ' · ' + spot.name : ''} · ${fmt(st.time)} · +${RACE_CP_REWARD}`, 'good');
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
        if (Math.hypot(cp.x - c.x, cp.z - c.z) < cp.r + 1 && Math.abs(c.y - cp.y) < 7) pass(p);
      }
      const G = gates[p];
      showGate(G.cur, st.fin[p] === null ? st.prog[p] : st.cps.length, cams[p], t);
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
        <span class="res">${st.fin[p] !== null ? fmt(st.fin[p]) : `${st.prog[p]} / ${st.cps.length} чекпоинтов`}</span>
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
      cp: fin ? 'ФИНИШ' : `${Math.min(st.prog[p] + 1, st.cps.length)} / ${st.cps.length}`,
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
    const c = cars[p], i = st.prog[p], cp = st.cps[i];
    if (!cp) return;
    let [x, y] = mmXY(c, cp.x, cp.z, k);
    const d = Math.hypot(x, y), lim = R - 9;
    if (d > lim) { x *= lim / d; y *= lim / d; }
    ctx.fillStyle = i === st.cps.length - 1 ? '#ffd23a' : '#35ffa0'; ctx.strokeStyle = '#0b1a12'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#0b1a12'; ctx.font = "bold 10px 'Rubik', sans-serif"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(i === st.cps.length - 1 ? 'F' : String(i + 1), x, y + 0.5);
  }
  return { start, stop, update, drawArrow, hud, big, minimap, plan, get on() { return st.on; }, get done() { return st.done; }, st };
})();
