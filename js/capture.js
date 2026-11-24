// Режим «Захват точек» (пока только «Побережье», зоны — world.zones из js/maps/coast/sites.js).
// Активна одна точка из пяти (порядок случайный, край пирса — всегда последним). Игрок, который стоит в зоне один,
// получает очко в секунду, и таймер точки идёт; пусто — таймер стоит; в зоне оба — зону оспаривают: очков нет,
// таймер идёт вдвое медленнее (CAP_CONTEST). Когда таймер (CAP_CFG.time, по умолчанию 60 с) кончился, точка гаснет до конца заезда.
// Машина в воде или сломанная зону не держит. После пятой точки — итоги; при равном счёте — «золотое очко»
// на последней точке. Победителю CAP_REWARD монет, обоим — по монете за каждые CAP_BONUS_PER очков.
// Видна только активная точка (столб света, круг по рельефу, дуга остатка времени); за CAP_WARN секунд до смены
// на мини-карте и в HUD появляется следующая. 3D-стрелка (js/arrow.js) показывает на точку.
// Определяет: CAP_GOLD, CAP_HOT, CAP_NEXT, Capture.
// Использует: CAP_WARN, PLAYER_COLORS, CAP_CFG, CAP_BONUS_PER, CAP_CONTEST, CAP_REWARD (js/data.js); clamp
//   (js/core.js); waterLevel, scene (js/world.js); world (js/maps/registry.js); Sound (js/audio.js); cars
//   (js/physics.js); countdown, paused (js/match.js); HUD, $, notify, addCoins, keys, mmXY (js/ui.js); TargetArrow
//   (js/arrow.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

/* =====================================================================
   ЗАХВАТ ТОЧЕК
   ===================================================================== */
const CAP_GOLD = 0xffd23a, CAP_HOT = 0xff3b3b, CAP_NEXT = 0xffffff;

const Capture = (() => {
  const st = { on: false, zones: [], order: [], idx: 0, left: 0, full: 0, score: [0, 0], holder: -1, contested: false,
    golden: false, over: false, done: false, winner: -1, time: 0, endT: 0, switchT: 0, alarmT: 0, warned: false, reward: [0, 0] };
  const pts = p => Math.floor(st.score[p] + 1e-6);              // очки — целые; дробная часть копится по кадрам
  const cur = () => st.zones[st.order[st.idx]];
  const nxt = () => st.idx + 1 < st.order.length ? st.zones[st.order[st.idx + 1]] : null;
  const warn = () => !st.golden && !st.over && st.left <= CAP_WARN && !!nxt();

  /* ---------- маркер зоны ---------- */
  // высота поверхности под точкой: настил (пирс, мост) ниже y + 3 или земля; над водой — не ниже воды
  function hAt(x, z, y) {
    const wl = waterLevel(x, z);
    const s = world.surface(x, z, y + 3);
    return wl !== null ? Math.max(s, wl) : s;
  }
  // высота центра зоны: на пирсе (под ним вода) — верх настила, иначе — земля или настил чуть выше неё
  function zoneY(zn) {
    const g = world.ground(zn.x, zn.z), wl = waterLevel(zn.x, zn.z);
    return wl !== null && g < wl ? world.surface(zn.x, zn.z) : world.surface(zn.x, zn.z, g + 4);
  }
  const SEG = 72;
  // кольцо по рельефу (r0…r1) — SEG отрезков по часовой стрелке с севера: drawRange отрезает дугу остатка времени
  function bandGeo(zn, r0, r1, lift) {
    const pos = [], idx = [];
    for (let i = 0; i <= SEG; i++) {
      const a = i / SEG * Math.PI * 2, sx = -Math.sin(a), cz = Math.cos(a);   // +X — запад: по часовой на мини-карте
      for (const r of [r0, r1]) {
        const x = zn.x + sx * r, z = zn.z + cz * r;
        pos.push(x - zn.x, hAt(x, z, zn.y) - zn.y + lift, z - zn.z);
      }
      if (i < SEG) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }
  // заливка круга по рельефу: кольца от центра к краю
  function discGeo(zn, lift) {
    const pos = [0, hAt(zn.x, zn.z, zn.y) - zn.y + lift, 0], idx = [], RINGS = 6, S = 48;
    for (let k = 1; k <= RINGS; k++) for (let i = 0; i < S; i++) {
      const a = i / S * Math.PI * 2, r = zn.r * k / RINGS, x = zn.x - Math.sin(a) * r, z = zn.z + Math.cos(a) * r;
      pos.push(x - zn.x, hAt(x, z, zn.y) - zn.y + lift, z - zn.z);
    }
    const v = (k, i) => k === 0 ? 0 : 1 + (k - 1) * S + (i % S);
    for (let i = 0; i < S; i++) idx.push(0, v(1, i), v(1, i + 1));
    for (let k = 1; k < RINGS; k++) for (let i = 0; i < S; i++) idx.push(v(k, i), v(k + 1, i), v(k + 1, i + 1), v(k, i), v(k + 1, i + 1), v(k, i + 1));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }
  const fadeTex = (() => {
    const c = document.createElement('canvas'); c.width = 4; c.height = 256; const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.75, 'rgba(255,255,255,.3)'); g.addColorStop(1, 'rgba(255,255,255,1)');
    x.fillStyle = g; x.fillRect(0, 0, 4, 256);
    return new THREE.CanvasTexture(c);
  })();
  // обычное (не аддитивное) смешивание: на ярком закатном небе аддитивное свечение выцветает до белого
  const glow = (opacity, extra = {}) => new THREE.MeshBasicMaterial(Object.assign({ transparent: true, opacity,
    depthWrite: false, side: THREE.DoubleSide, fog: false }, extra));
  // материалы общие: видна только одна зона
  const MAT_ = { pillar: glow(0.5, { map: fadeTex }), disc: glow(0.2), ring: glow(0.9), arc: glow(0.95) };
  // подпись над точкой: название и остаток времени
  const lblCanvas = document.createElement('canvas'); lblCanvas.width = 512; lblCanvas.height = 256;
  const lblTex = new THREE.CanvasTexture(lblCanvas); lblTex.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: lblTex, transparent: true, depthWrite: false, fog: false }));
  label.scale.set(14, 7, 1); label.renderOrder = 3;
  let lblText = '';
  function setLabel(a, b) {
    if (lblText === a + '|' + b) return;
    lblText = a + '|' + b;
    const x = lblCanvas.getContext('2d');
    x.clearRect(0, 0, 512, 256); x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineWidth = 14; x.strokeStyle = 'rgba(0,0,0,.75)'; x.fillStyle = '#fff';
    x.font = `${a.length > 12 ? 58 : 70}px 'Russo One', 'Arial Black', sans-serif`;
    x.strokeText(a, 256, 80); x.fillText(a, 256, 80);
    x.font = "92px 'Russo One', 'Arial Black', sans-serif";
    x.strokeText(b, 256, 180); x.fillText(b, 256, 180);
    lblTex.needsUpdate = true;
  }
  let pillarOp = 0.5;
  const pillarGeo = r => new THREE.CylinderGeometry(r, r, 55, 48, 1, true).translate(0, 27.5, 0);
  function makeMarker(zn) {
    const g = new THREE.Group();
    const add = (geo, mat, order = 2) => { const m = new THREE.Mesh(geo, mat); m.renderOrder = order; g.add(m); return m; };
    // столб гаснет, когда камера подъезжает к нему: изнутри он залил бы цветом весь экран (камер две — считаем на каждую)
    add(pillarGeo(zn.r), MAT_.pillar).onBeforeRender = (r, s, cam) => {
      MAT_.pillar.opacity = pillarOp * clamp((Math.hypot(cam.position.x - zn.x, cam.position.z - zn.z) - zn.r + 2) / 14, 0, 1);
    };
    add(discGeo(zn, 0.1), MAT_.disc);
    add(bandGeo(zn, zn.r - 0.9, zn.r, 0.16), MAT_.ring);
    const arc = add(bandGeo(zn, zn.r - 2.6, zn.r - 1.5, 0.18), MAT_.arc);
    g.position.set(zn.x, zn.y, zn.z); g.visible = false;
    scene.add(g);
    return { g, arc };
  }
  function clearMarkers() {
    for (const zn of st.zones) if (zn.mk) {
      scene.remove(zn.mk.g);
      zn.mk.g.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
    }
    if (label.parent) label.parent.remove(label);
  }
  function showMarker(t) {
    const zn = cur();
    for (const z of st.zones) z.mk.g.visible = z === zn && !st.over;
    if (st.over) return;
    if (label.parent !== zn.mk.g) zn.mk.g.add(label);
    label.position.y = 10;
    const col = st.holder >= 0 ? PLAYER_COLORS[st.holder] : st.contested ? (Math.sin(t * 18) > 0 ? CAP_HOT : 0xffffff) : CAP_GOLD;
    for (const m of Object.values(MAT_)) m.color.setHex(col);
    const pulse = 0.8 + 0.2 * Math.sin(t * (st.holder >= 0 ? 7 : 3));
    MAT_.disc.opacity = (st.holder >= 0 || st.contested ? 0.3 : 0.18) * pulse;
    pillarOp = 0.5 * pulse;
    const f = st.golden ? 1 : clamp(st.left / st.full, 0, 1);
    zn.mk.arc.geometry.setDrawRange(0, Math.ceil(SEG * f) * 6);
    setLabel(zn.name, st.golden ? 'ЗОЛОТОЕ ОЧКО' : fmt(st.left));
  }

  /* ---------- ход заезда ---------- */
  const fmt = s => { s = Math.ceil(Math.max(0, s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const word = n => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? 'очко' : a >= 2 && a <= 4 && (b < 12 || b > 14) ? 'очка' : 'очков'; };
  function start(on) {
    clearMarkers();
    Object.assign(st, { on, zones: [], order: [], idx: 0, left: 0, full: 0, score: [0, 0], holder: -1, contested: false, golden: false,
      over: false, done: false, winner: -1, time: 0, endT: 0, switchT: 0, alarmT: 0, warned: false, reward: [0, 0] });
    st.left = st.full = CAP_CFG.time;
    for (let p = 0; p < 2; p++) HUD[p].cap.classList.toggle('hidden', !on);
    if (!on) return;
    $('hud').classList.add('racing');                    // лента уведомлений ниже таблички режима
    st.zones = world.zones.map(z => { const zn = { id: z.id, name: z.name, x: z.x, z: z.z, r: z.r }; zn.y = zoneY(zn); zn.mk = makeMarker(zn); return zn; });
    // порядок: случайный, край пирса (id 2) — финал
    const last = st.zones.findIndex(z => z.id === 2), rest = st.zones.map((_, i) => i).filter(i => i !== last);
    for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
    st.order = last >= 0 ? [...rest, last] : rest;
  }
  function stop() { start(false); }
  // машина в зоне: по горизонтали внутри круга, по высоте рядом с центром; в воде и сломанная — не считается
  function inside(c, zn) {
    if (c.drown > 0 || c.broken > 0) return false;
    const dx = c.x - zn.x, dz = c.z - zn.z;
    return dx * dx + dz * dz < zn.r * zn.r && Math.abs(c.y - zn.y) < 5;
  }
  function nextZone() {
    const zn = cur();
    if (!nxt()) {
      if (pts(0) === pts(1)) {                          // ничья — на последней точке до первого очка
        st.golden = true;
        for (let p = 0; p < cars.length; p++) notify(p, 'Ничья! ЗОЛОТОЕ ОЧКО — кто первым наберёт очко, тот и победил', 'gold');
        Sound.capGong();
      } else finish();
      return;
    }
    st.idx++; st.left = st.full = CAP_CFG.time; st.switchT = st.time; st.warned = false; st.holder = -1; st.contested = false;
    for (let p = 0; p < cars.length; p++) notify(p, `Точка «${zn.name}» закрыта · новая: ${cur().name} (${st.idx + 1} / ${st.order.length})`, 'good');
    Sound.capGong();
  }
  function finish() {
    st.over = true; st.endT = st.time; st.holder = -1; st.contested = false;
    const w = st.winner = pts(0) > pts(1) ? 0 : 1;
    for (let p = 0; p < cars.length; p++) {
      st.reward[p] = Math.floor(pts(p) / CAP_BONUS_PER) + (p === w ? CAP_REWARD : 0);
      if (st.reward[p]) addCoins(p, st.reward[p]);
    }
    notify(w, `ПОБЕДА! ${pts(w)} : ${pts(1 - w)} · +${st.reward[w]}`, 'gold', true); Sound.ko(w);
    notify(1 - w, `Соперник победил · ${pts(1 - w)} : ${pts(w)}` + (st.reward[1 - w] ? ` · +${st.reward[1 - w]}` : ''), 'bad', !!st.reward[1 - w]);
  }
  function update(dt, t) {
    if (!st.on) return;
    if (countdown <= 0 && !st.done) st.time += dt;
    if (countdown <= 0 && !st.over && cars.length === 2) {
      const zn = cur(), a = inside(cars[0], zn), b = inside(cars[1], zn);
      st.contested = a && b; st.holder = a !== b ? (a ? 0 : 1) : -1;
      if (st.holder >= 0) {
        const p = st.holder, before = pts(p), gain = st.golden ? dt : Math.min(dt, st.left);
        st.score[p] += gain;
        if (!st.golden) st.left -= gain;
        if (pts(p) > before) Sound.capTick(p);
        if (st.golden && pts(0) !== pts(1)) finish();
      } else if (st.contested && !st.golden) {
        st.left -= dt * CAP_CONTEST;
        if (st.time - st.alarmT > 1) { st.alarmT = st.time; Sound.capAlarm(); }
      }
      if (!st.over && warn() && !st.warned) {
        st.warned = true;
        for (let p = 0; p < 2; p++) notify(p, `Через ${CAP_WARN} с смена точки · следующая: ${nxt().name}`, '');
      }
      if (!st.over && !st.golden && st.left <= 1e-6) nextZone();
    }
    showMarker(t);
    if (st.over && !st.done && st.time - st.endT > 2.5) showResults();
  }
  function showResults() {
    st.done = true;
    const w = st.winner;
    $('reTitle').innerHTML = `<span class="pl${w + 1}">ИГРОК ${w + 1}</span> ПОБЕДИЛ`;
    $('reRows').innerHTML = [w, 1 - w].map((p, k) => `
      <div class="rerow p${p + 1}"><b>${k + 1}</b><span class="who">Игрок ${p + 1} · ${cars[p].def.short}</span>
        <span class="res">${pts(p)} ${word(pts(p))}</span>
        <span class="rew">${st.reward[p] ? `+${st.reward[p]} <i class="coin"></i>` : ''}</span></div>`).join('');
    $('reAgain').innerHTML = 'Реванш <kbd>Enter</kbd>';
    paused = true; keys.clear();
    $('raceEnd').classList.remove('hidden');
  }

  /* ---------- HUD, мини-карта, стрелка ---------- */
  function hud(p) {
    if (!st.on) return null;
    const zn = cur(), o = 1 - p, c = cars[p];
    let status = '', cls = '';
    if (st.over) { status = st.winner === p ? 'ПОБЕДА!' : 'Поражение'; cls = st.winner === p ? 'mine' : 'theirs'; }
    else if (st.holder === p) { status = 'ЗАХВАТ · +1 в секунду'; cls = 'mine'; }
    else if (st.holder === o) { status = 'Соперник захватывает!'; cls = 'theirs'; }
    else if (st.contested) { status = 'ТОЧКУ ОСПАРИВАЮТ!'; cls = 'hot'; }
    else if (Math.hypot(c.x - zn.x, c.z - zn.z) < zn.r && (c.drown > 0 || c.broken > 0)) { status = 'Сломанная не в счёт'; cls = 'theirs'; }
    else status = `До точки ${Math.round(Math.max(0, Math.hypot(c.x - zn.x, c.z - zn.z) - zn.r))} м`;
    return {
      head: st.golden ? 'ЗОЛОТОЕ ОЧКО' : `ТОЧКА ${st.idx + 1} / ${st.order.length}`,
      name: zn.name, time: st.over ? '' : st.golden ? '∞' : fmt(st.left),
      me: pts(p), status, cls,
      next: warn() ? `Далее: ${nxt().name}` : '',
    };
  }
  // крупная надпись: название новой точки в первые 2 с, итог после конца
  function big(p) {
    if (!st.on) return '';
    if (st.over) return st.winner === p ? 'ПОБЕДА!' : 'ПОРАЖЕНИЕ';
    return countdown <= 0 && st.time - st.switchT < 2 ? cur().name.toUpperCase() : '';
  }
  // точка на мини-карте (север сверху): круг в масштабе, если далеко — кружок с номером на краю
  function mark(ctx, c, zn, R, k, fill, stroke, num, dashed) {
    let [x, y] = mmXY(c, zn.x, zn.z, k);
    const d = Math.hypot(x, y), r = zn.r * k, lim = R - 9;
    if (d + r > R) {                                     // далеко — значок на краю
      if (d > lim) { x *= lim / d; y *= lim / d; }
      ctx.fillStyle = stroke; ctx.strokeStyle = '#141008'; ctx.lineWidth = 2; ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#141008'; ctx.font = "bold 10px 'Rubik', sans-serif"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(num, x, y + 0.5);
      return;
    }
    ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.setLineDash(dashed ? [4, 3] : []);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); if (fill) ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
  }
  const hex = (n, a) => `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
  function minimap(ctx, p, R, k) {
    if (!st.on || st.over) return;
    const c = cars[p];
    if (warn()) mark(ctx, c, nxt(), R, k, '', '#ffffff', '→', true);
    const col = st.holder >= 0 ? PLAYER_COLORS[st.holder] : st.contested ? CAP_HOT : CAP_GOLD;
    mark(ctx, c, cur(), R, k, hex(col, 0.35), hex(col, 1), String(st.idx + 1), false);
  }
  // стрелка: на активную точку; игроку в зоне — на следующую (в последние CAP_WARN с) или никуда
  function drawArrow(p, w, h) {
    if (!st.on || st.over || !st.order.length) return;
    let zn = cur(), col = CAP_GOLD;
    if (Math.hypot(cars[p].x - zn.x, cars[p].z - zn.z) < zn.r) {
      if (!warn()) return;
      zn = nxt(); col = CAP_NEXT;
    }
    TargetArrow.draw(p, w, h, zn.x, zn.y, zn.z, col, zn.r + 25);
  }
  return { start, stop, update, drawArrow, hud, big, minimap, get on() { return st.on; }, st };
})();
