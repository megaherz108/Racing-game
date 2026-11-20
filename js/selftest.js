// Самопроверка: дешёвая текстовая проверка игры для разработчика и ИИ-ассистента (без скриншотов).
// В консоли: await __game.selfTest() — отчёт текстом; __game.fingerprint('city') — хеш карты.
// Определяет: fingerprint, selfTest.
// Использует: cleanPlayer, save, PAINTS, paintOf, PAINT_FREE, paintBuy, hasPaint, FLIP_REWARD, persist, fitSet,
//   badgeGive, fitOf, hasBadge, badgesFromJumps, cleanJumps, BADGE_FLYER_D, CARS, BADGE_SPOTS, BADGES, RACE_CPS,
//   BADGE_RACER_T (js/data.js); buildCarModel, disposeTree (js/car-models.js); badgeAnchors, fitBadges
//   (js/badges.js); getData, getWorld, MAP_INFO (js/maps/registry.js); cars, FIXED, stepWorld, simTime, FRONT_DMG
//   (js/physics.js); Traffic (js/traffic/traffic.js); startMatch, countdown, endMatch (js/match.js); updateCoins
//   (js/ui.js); Race (js/race.js); Capture (js/capture.js); Jumps (js/jumps.js); Bomb (js/bomb.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

/* =====================================================================
   ОТПЕЧАТОК КАРТЫ
   Хеш раскладки (mapData) и построенного 3D-мира. Нужен при рефакторинге генераторов:
   если отпечаток до и после правки совпал, карта осталась точно такой же.
   Снимать на свежей загрузке страницы до заезда: езда сбивает объекты и меняет worldHash. Арена случайна (rand).
   ===================================================================== */
const _fpHash = s => {                       // FNV-1a, 32 бита → 8 hex-символов
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
};
const _fpNum = v => Number.isFinite(v) ? Math.round(v * 1e4) / 1e4 : String(v);

// JSON с отсортированными ключами; функции пропускаются, Map/Set — массивы, повторная ссылка — '^'.
// fast — типизированные массивы хешируются числами, без строки (сетки высот в миллионы узлов), поле ms пропускается
function _fpJson(v, seen = new WeakSet(), fast = false) {
  if (typeof v === 'number') return String(_fpNum(v));
  if (v === null || typeof v !== 'object') return typeof v === 'function' ? '' : JSON.stringify(v) ?? '';
  if (seen.has(v)) return '^';
  seen.add(v);
  if (v instanceof HTMLCanvasElement) {
    const d = v.getContext('2d').getImageData(0, 0, v.width, v.height).data;
    let s = 0; for (let i = 0; i < d.length; i += 7) s = (s * 31 + d[i]) >>> 0;
    return 'canvas' + v.width + 'x' + v.height + ':' + s;
  }
  if (ArrayBuffer.isView(v) && fast) {
    let h = 0x811c9dc5;
    for (let i = 0; i < v.length; i++) { h ^= Math.round(v[i] * 1e4) | 0; h = Math.imul(h, 0x01000193); }
    return 'ta' + v.length + ':' + (h >>> 0).toString(16);
  }
  if (ArrayBuffer.isView(v)) return '[' + Array.from(v, _fpNum).join(',') + ']';
  if (v instanceof Map) v = [...v.entries()];
  else if (v instanceof Set) v = [...v];
  if (Array.isArray(v)) return '[' + v.map(x => _fpJson(x, seen, fast)).join(',') + ']';
  // в режиме fast поле ms (время этапа в сводках, напр. C.evenStats.ms) не считается: оно разное от загрузки к загрузке
  return '{' + Object.keys(v).sort().filter(k => !(fast && k === 'ms')).map(k => k + ':' + _fpJson(v[k], seen, fast)).join(',') + '}';
}

// раскладка: каждое поле отдельно (чтобы видеть, что именно поменялось) + функции рельефа на сетке.
// Карта может задать D.fp (сейчас — только «Ситжес»; у других карт хеши как раньше):
//   { hx, hz } — область выборки ground() (иначе квадрат ±bounds); split — поле-контекст (C), которое хешируется
//   по своим полям ('C.streets', 'C.corners', …); fast — типизированные массивы числами (см. _fpJson)
function _fpData(D) {
  const keys = {}, F = D.fp || {};
  for (const k of Object.keys(D).sort()) {
    if (typeof D[k] === 'function') continue;
    if (k === F.split) { for (const c of Object.keys(D[k]).sort()) if (typeof D[k][c] !== 'function') keys[k + '.' + c] = _fpHash(_fpJson(D[k][c], undefined, F.fast)); }
    else keys[k] = _fpHash(_fpJson(D[k], undefined, F.fast));
  }
  const b = D.bounds || D.BOUNDS || 500, bx = F.hx || b, bz = F.hz || b, samples = [];
  if (typeof D.ground === 'function') for (let x = -bx; x <= bx; x += bx / 24) for (let z = -bz; z <= bz; z += bz / 24) {
    samples.push(_fpNum(D.ground(x, z)));
    if (D.blockAt) samples.push(D.blockAt(x, z)?.type || '-');
  }
  keys['ground()'] = _fpHash(samples.join(','));
  return keys;
}

// построенный мир: описание каждого меша (геометрия, экземпляры, материал), сортировка — порядок создания не важен
function _fpWorld(w) {
  const rows = [];
  const sum = (a, n = a.length) => { let s = 0; for (let i = 0; i < n; i++) s += a[i] * ((i % 97) + 1); return _fpNum(s); };
  w.group.updateMatrixWorld(true);
  w.group.traverse(o => {
    if (!o.isMesh && !o.isPoints && !o.isLine) return;
    const g = o.geometry, p = g.attributes.position, mats = [].concat(o.material);
    rows.push([o.type, p ? p.count : 0, g.index ? g.index.count : 0, o.isInstancedMesh ? o.count : 1,
      mats.map(m => m.type + (m.color ? m.color.getHexString() : '')).join('+'),
      p ? sum(p.array) : 0, o.isInstancedMesh ? sum(o.instanceMatrix.array, o.count * 16) : 0,
      sum(o.matrixWorld.elements)].join('|'));
  });
  rows.sort();
  const items = new Set();
  for (const b of w.grid.cells.values()) for (const it of b) items.add(it);
  const gridRows = [...items].map(it => it.box ? [it.minX, it.maxX, it.minZ, it.maxZ, it.h].map(_fpNum).join(',') : [it.x, it.z, it.r, it.h].map(_fpNum).join(',')).sort();
  const out = {
    meshes: rows.length, meshHash: _fpHash(rows.join('\n')),
    gridItems: gridRows.length, gridHash: _fpHash(gridRows.join('\n')),
    decks: w.decks ? _fpHash(_fpJson(w.decks.list.map(d => [d.p0, d.p1, d.w, d.mat]))) : '-',
    breakables: (w.breakables || []).length,
  };
  // сетки столкновений (тротуары «Ситжеса»): ключ — только если они есть, у других карт хеш как раньше
  if (w.meshColliders) out.colliders = _fpHash(w.meshColliders.map(m => m.v.length + ':' + _fpJson(m.v, undefined, true) + _fpJson(m.i, undefined, true)).join('|'));
  return out;
}

// __game.fingerprint('city') → { data: {поле: хеш}, dataHash, world: {...} }
function fingerprint(id = 'city') {
  const data = _fpData(getData(id));
  const world = _fpWorld(getWorld(id));
  return { id, dataHash: _fpHash(JSON.stringify(data)), worldHash: _fpHash(JSON.stringify(world)), data, world };
}

/* =====================================================================
   САМОПРОВЕРКА
   __game.selfTest() строит каждую карту, гоняет физику несколько секунд игрового времени
   и возвращает короткий текстовый отчёт: ошибки, время постройки, время шага физики, пройденный путь, трафик.
   ===================================================================== */
// Для каждой карты: постройка → заезд (startMatch) → обе машины жмут газ и руль seconds секунд игрового времени
// (шаги физики идут подряд, без отрисовки) → ночь/день и update() мира → выход в меню.
// Проверяет: исключения, NaN в позициях, что машины поехали, что трафик появился (в городе); на Побережье — что в
// режиме «Захват точек» машина в зоне набирает очки.
async function selfTest({ maps = Object.keys(MAP_INFO), seconds = 4, mode = 'free' } = {}) {
  const errors = [], lines = [];
  const onErr = e => errors.push('событие: ' + String(e.message || e.reason || e));
  const origError = console.error;
  console.error = (...a) => { errors.push('console.error: ' + a.map(String).join(' ').slice(0, 200)); origError(...a); };
  window.addEventListener('error', onErr);
  window.addEventListener('unhandledrejection', onErr);
  const KEYS = ['KeyW', 'KeyD', 'ArrowUp', 'ArrowLeft'];
  const wait = ms => new Promise(r => setTimeout(r, ms));
  try {
    // цвета машин (js/data.js): покупка на копии игрока — кошельки и купленное в сохранении не трогаются
    try {
      const pl = cleanPlayer(JSON.parse(JSON.stringify(save.players[0])));
      const before = JSON.stringify(save.players), black = PAINTS.find(c => c.id === 'black');
      pl.coins = black.price + 5; pl.owned = ['corolla']; pl.paints = {}; pl.paint = {};
      if (paintOf(pl, 'corolla').id !== PAINT_FREE) errors.push('цвет: по умолчанию не белый');
      if (!paintBuy(pl, 'niva', 'black')) errors.push('цвет: купился для некупленной машины');
      let why = paintBuy(pl, 'corolla', 'black');
      if (why || pl.coins !== 5) errors.push(`цвет: покупка «${why}», монет осталось ${pl.coins}, ждали 5`);
      if (!paintBuy(pl, 'corolla', 'black') || pl.coins !== 5) errors.push('цвет: купился второй раз');
      if (!paintBuy(pl, 'corolla', 'red')) errors.push('цвет: купился без монет');
      pl.owned.push('niva');
      if (hasPaint(pl, 'niva', 'black') || paintOf(pl, 'niva').id !== PAINT_FREE) errors.push('цвет: купленный для Короллы есть и у Нивы');
      const back = cleanPlayer(JSON.parse(JSON.stringify(pl)));   // как после перезагрузки страницы
      if (paintOf(back, 'corolla').id !== 'black' || !hasPaint(back, 'corolla', 'black')) errors.push('цвет: не сохранился');
      const junk = cleanPlayer({ owned: ['corolla'], paints: { corolla: ['gold', 'red'], niva: ['red'] }, paint: { corolla: 'gold' } });
      if (JSON.stringify(junk.paints) !== '{"corolla":["red"]}' || paintOf(junk, 'corolla').id !== PAINT_FREE) errors.push('цвет: мусор в сохранении не отброшен');
      if (cleanPlayer({ coins: 3, owned: ['corolla'], sel: 'corolla' }).paints.corolla) errors.push('цвет: старое сохранение без цветов');
      if (JSON.stringify(save.players) !== before) errors.push('цвет: проверка изменила сохранение');
      lines.push(`цвета: ${PAINTS.length}, чёрный за ${black.price} куплен и сохранён, повторно не покупается`);
    } catch (e) {
      errors.push('цвета: ' + (e.stack || String(e)).split('\n').slice(0, 3).join(' ← '));
    }
    for (const id of maps) {
      try {
        const t0 = performance.now();
        getWorld(id);
        const tBuild = performance.now() - t0;
        cars = [];
        startMatch(mode, id);
        for (let i = 0; i < 100 && !cars.length; i++) await wait(20);   // startMatch строит заезд в setTimeout
        if (!cars.length) throw new Error('заезд не запустился');
        countdown = 0;
        const pos = () => cars.map(c => c.body.translation()).map(t => ({ x: t.x, y: t.y, z: t.z }));
        const p0 = pos();
        KEYS.forEach(k => keys.add(k));
        const steps = Math.round(seconds / FIXED), t1 = performance.now();
        // руль выкручен — машина ездит по кругу, поэтому меряем самое дальнее удаление от старта, а не конечное
        const far = p0.map(() => 0);
        for (let i = 0; i < steps; i++) {
          stepWorld(FIXED);
          cars.forEach((c, k) => { const t = c.body.translation(); far[k] = Math.max(far[k], Math.hypot(t.x - p0[k].x, t.z - p0[k].z)); });
        }
        const tStep = (performance.now() - t1) / steps;
        KEYS.forEach(k => keys.delete(k));
        const p1 = pos();
        const moved = far.map(Math.round);
        if (p1.some(p => ![p.x, p.y, p.z].every(Number.isFinite))) errors.push(id + ': NaN в позиции машины');
        // разгон медленный (0–100 за 3…12 с), а с выкрученным рулём машины быстро упираются друг в друга — хватает 2 м
        if (moved.some(d => d < 2)) errors.push(id + ': машина почти не сдвинулась (' + moved.join(', ') + ' м)');
        // ночные огни и обновление мира (фонари, светофоры, вода)
        world.setNight?.(1); world.update?.(0.5, simTime); world.setNight?.(0); world.update?.(0.5, simTime);
        const traffic = Traffic.list.filter(t => !t.dead).length;
        lines.push(`${id}: постройка ${tBuild.toFixed(0)} мс, шаг физики ${tStep.toFixed(2)} мс, проехали ${moved.join(' / ')} м за ${seconds} с, трафик ${traffic}`);
      } catch (e) {
        errors.push(id + ': ' + (e.stack || String(e)).split('\n').slice(0, 3).join(' ← '));
      } finally {
        KEYS.forEach(k => keys.delete(k));
        if (cars.length) endMatch('menu');
      }
    }
    // удары (js/physics.js): удар передом отнимает FRONT_DMG от урона в борт; переворот соперника на крышу — FLIP_REWARD монет, один раз; на бок — ничего
    if (mode === 'free' && maps.length) {
      const coins0 = save.players.map(p => p.coins);
      try {
        cars = [];
        startMatch('free', maps[0]);
        for (let i = 0; i < 100 && !cars.length; i++) await wait(20);
        if (cars.length < 2) throw new Error('заезд на двоих не запустился');
        countdown = 0;
        const [a, b] = cars, [x, z, h] = world.spawns[0];
        a.fullReset(x, z, h); b.fullReset(...world.spawns[1]);
        // нос — точка в переднем углу (так её часто отдаёт Rapier), но сила вдоль кузова; dir — направление силы
        const fwd = { x: Math.sin(a.h), y: 0, z: Math.cos(a.h) }, lat = { x: Math.cos(a.h), y: 0, z: -Math.sin(a.h) };
        const loss = (lx, lz, dir) => { a.hp = a.maxHp; a.registerHit(8, null, ...a.local(lx, lz), dir); a.postStep(0); return a.maxHp - a.hp; };
        const front = loss(a.W * 0.47, a.L * 0.43, fwd), side = loss(a.W / 2, 0, lat), rear = loss(0, -a.L / 2, fwd);
        a.hp = a.maxHp;
        if (Math.abs(front / side - FRONT_DMG) > 0.01 || Math.abs(rear - side) > 1e-6)
          errors.push(`урон: нос ${front.toFixed(2)}, борт ${side.toFixed(2)}, корма ${rear.toFixed(2)} — ждали нос = ${FRONT_DMG} × борт`);
        // соперник ударил Игрока 2 и тот лёг на крышу: Игроку 1 — бонус, ровно один раз за 1,5 с лёжки
        const t = b.body.translation();
        b.body.setTranslation({ x: t.x, y: t.y + 2, z: t.z }, true);
        b.body.setRotation({ x: Math.cos(b.h / 2), y: 0, z: -Math.sin(b.h / 2), w: 0 }, true);   // кверху колёсами
        b.lastHitBy = a; b.lastHitTime = simTime;
        const before = save.players[0].coins;
        for (let i = 0, n = Math.round(1.5 / FIXED); i < n; i++) stepWorld(FIXED);
        const got = save.players[0].coins - before;
        if (got !== FLIP_REWARD) errors.push(`переворот: Игроку 1 начислено ${got}, ждали ${FLIP_REWARD} (upY ${b.upY.toFixed(2)}, лёжка ${b.flipT.toFixed(2)} с)`);
        // на боку посреди дороги (крыша ни во что не упирается) — бонуса нет
        b.fullReset(...world.spawns[1]);
        const t2 = b.body.translation(), sh = Math.sin(b.h / 2), ch = Math.cos(b.h / 2), r = Math.SQRT1_2;
        b.body.setTranslation({ x: t2.x, y: t2.y + 1, z: t2.z }, true);
        b.body.setRotation({ x: sh * r, y: sh * r, z: ch * r, w: ch * r }, true);   // курс h, кузов на боку
        b.lastHitBy = a; b.lastHitTime = simTime;
        const before2 = save.players[0].coins;
        for (let i = 0, n = Math.round(1 / FIXED); i < n; i++) stepWorld(FIXED);
        const side2 = save.players[0].coins - before2;
        if (side2) errors.push(`переворот на бок посреди дороги: начислено ${side2}, ждали 0 (upY ${b.upY.toFixed(2)})`);
        lines.push(`удары: урон нос/борт ${(front / side).toFixed(2)}, за переворот +${got}, на бок +${side2}`);
      } catch (e) {
        errors.push('удары: ' + (e.stack || String(e)).split('\n').slice(0, 3).join(' ← '));
      } finally {
        if (cars.length) endMatch('menu');
        save.players.forEach((p, i) => p.coins = coins0[i]); persist(); updateCoins();   // проверка не меняет кошельки
      }
    }
    // захват точек (js/capture.js): машина Игрока 1 стоит в активной зоне одна — очки идут, таймер точки убывает
    if (maps.includes('coast') && mode === 'free') {
      try {
        cars = [];
        startMatch('capture', 'coast');
        for (let i = 0; i < 100 && !cars.length; i++) await wait(20);
        if (!Capture.on) throw new Error('режим не включился');
        countdown = 0;
        const s = Capture.st, z = s.zones[s.order[0]];
        cars[0].fullReset(z.x, z.z, 0);
        cars[1].fullReset(z.x + z.r + 40, z.z, 0);
        for (let i = 0, n = Math.round(2 / FIXED); i < n; i++) { stepWorld(FIXED); Capture.update(FIXED, simTime); }
        if (!(s.score[0] > 1.5) || s.score[1] > 0) errors.push(`захват: очки не идут (${s.score.map(v => v.toFixed(2)).join(' / ')})`);
        lines.push(`захват: ${s.order.length} точек, первая «${z.name}», за 2 с в зоне ${s.score[0].toFixed(2)} очка`);
      } catch (e) {
        errors.push('захват: ' + (e.stack || String(e)).split('\n').slice(0, 3).join(' ← '));
      } finally {
        if (cars.length) endMatch('menu');
      }
    }
    // горячая бомба (js/bomb.js): касание передаёт бомбу, вернуть сразу нельзя, догоревший фитиль — победа сопернику
    if (maps.includes('city') && mode === 'free') {
      const coins0 = save.players.map(p => p.coins);
      try {
        cars = [];
        startMatch('bomb', 'city');
        for (let i = 0; i < 100 && !cars.length; i++) await wait(20);
        if (!Bomb.on) throw new Error('режим не включился');
        const s = Bomb.st, run = n => { for (let i = 0; i < n; i++) { stepWorld(FIXED); Bomb.update(FIXED, simTime); } };
        const gap = Math.hypot(cars[0].x - cars[1].x, cars[0].z - cars[1].z);
        countdown = 0;
        run(2);
        const h0 = s.holder, a = cars[h0], b = cars[1 - h0];
        // ставим машины вплотную бок о бок и толкаем хозяина бомбы к сопернику
        a.fullReset(a.x, a.z, 0); b.fullReset(a.x + a.W + 0.3, a.z, 0);
        a.body.setLinvel({ x: 3, y: 0, z: 0 }, true);
        run(30);
        if (s.holder === h0) errors.push('бомба: касание не передало бомбу');
        const h1 = s.holder;
        run(60);                                          // всё ещё рядом, но BOMB_CFG.back не прошло
        if (s.holder !== h1) errors.push('бомба: вернулась раньше BOMB_CFG.back');
        s.fuse = 0.01; run(2);
        if (s.phase !== 'boom' || s.wins[1 - h1] !== 1) errors.push(`бомба: фитиль догорел, а раунд не закончился (${s.phase}, ${s.wins})`);
        lines.push(`бомба: старт в ${gap.toFixed(0)} м, передача ${h0 + 1} → ${h1 + 1}, взрыв у Игрока ${h1 + 1}, счёт ${s.wins.join(' : ')}`);
      } catch (e) {
        errors.push('бомба: ' + (e.stack || String(e)).split('\n').slice(0, 3).join(' ← '));
      } finally {
        if (cars.length) endMatch('menu');
        save.players.forEach((p, i) => p.coins = coins0[i]); persist(); updateCoins();
      }
    }
    // значки (js/badges.js): места на всех машинах, открытие по условию в игре, расстановка, сохранение.
    // Сохранение игроков (кошельки, значки, рекорды прыжков) в конце возвращается как было
    if (mode === 'free') {
      const backup = JSON.stringify(save);
      try {
        // данные — на копии игрока
        const pl = cleanPlayer({ owned: ['corolla'] });
        if (fitSet(pl, 'corolla', 'hood', 'flyer') !== 'значок ещё не открыт') errors.push('значок: поставился неоткрытый');
        if (!badgeGive(pl, 'flyer') || badgeGive(pl, 'flyer') || badgeGive(pl, 'gold')) errors.push('значок: открытие не по правилам');
        if (fitSet(pl, 'niva', 'hood', 'flyer') === '') errors.push('значок: поставился на некупленную машину');
        fitSet(pl, 'corolla', 'hood', 'flyer'); fitSet(pl, 'corolla', 'wheels', 'flyer');
        const back = cleanPlayer(JSON.parse(JSON.stringify(pl)));     // как после перезагрузки страницы
        if (Object.keys(fitOf(back, 'corolla')).join() !== 'hood,wheels' || !hasBadge(back, 'flyer')) errors.push('значок: расстановка не сохранилась');
        const junk = cleanPlayer({ owned: ['corolla'], badges: ['racer', 'gold'], fit: { corolla: { hood: 'flyer', lip: 'racer', roof: 'racer' }, niva: { hood: 'racer' } } });
        if (JSON.stringify(junk.badges) !== '["racer"]' || JSON.stringify(junk.fit) !== '{"corolla":{"lip":"racer"}}') errors.push('значок: мусор в сохранении не отброшен ' + JSON.stringify(junk.fit));
        if (cleanPlayer({ coins: 3, owned: ['corolla'], sel: 'corolla' }).badges.length !== 0) errors.push('значок: старое сохранение без значков');
        // рекорд прыжка, записанный до значков: от BADGE_FLYER_D м у Игрока 2 на Побережье — «Лётчик» у него, у Игрока 1 нет
        const old = badgesFromJumps({ players: [cleanPlayer({}), cleanPlayer({})],
          jumps: cleanJumps({ city: [{ d: BADGE_FLYER_D - 0.5, p: 0, car: 'X5' }], coast: [{ d: BADGE_FLYER_D + 12, p: 1, car: '911' }] }) });
        if (hasBadge(old.players[0], 'flyer') || !hasBadge(old.players[1], 'flyer')) errors.push(`значок «Лётчик» по старым рекордам: ${old.players.map(p => p.badges.join())}`);
        // места на кузове всех машин: нашлись, лежат на поверхности (не утоплены и не висят), бамперные — целиком на бампере
        const bad = [];
        for (const def of CARS) {
          const A = badgeAnchors(def);
          for (const [s] of BADGE_SPOTS) {
            if (s === 'wheels') continue;
            const a = A[s];
            if (!a) { bad.push(`${def.short} ${s}: место не найдено`); continue; }
            if (a.lift > 0.03) bad.push(`${def.short} ${s}: приподнят на ${(a.lift * 100).toFixed(1)} см над изгибом`);
            if ((s === 'hood' || s === 'lip') && a.n[1] < 0.6) bad.push(`${def.short} ${s}: не сверху (n.y ${a.n[1].toFixed(2)})`);
            if ((s === 'front' || s === 'rear') && a.flat < 10) bad.push(`${def.short} ${s}: не целиком на бампере (${a.flat}/12)`);
          }
          const m = buildCarModel(def, 0xffffff, { bumpers: true });
          fitBadges(m, def, Object.fromEntries(BADGE_SPOTS.map(([s], i) => [s, BADGES[i % BADGES.length]])));
          // по мешу значков и мешу ореолов на группу: кузов (капот + кромка), бамперы (задний значок бывает и на
          // кузове над бампером), четыре колеса
          const want = 2 * (new Set(['body', ...['front', 'rear'].map(s => A[s].grp)]).size + 4);
          if (m.badges.length !== want) bad.push(`${def.short}: мешей значков ${m.badges.length}, ждали ${want}`);
          disposeTree(m.root);
        }
        errors.push(...bad.map(t => 'значок: ' + t));
        // в игре: прыжок от BADGE_FLYER_D м открывает «Лётчика», короче — нет
        cars = [];
        startMatch('free', 'city');
        for (let i = 0; i < 100 && !cars.length; i++) await wait(20);
        if (cars.length < 2) throw new Error('заезд на двоих не запустился');
        countdown = 0;
        save.players.forEach(p => { p.badges = []; p.fit = {}; });
        Jumps.land(0, BADGE_FLYER_D + 4, 0, 0); Jumps.land(1, BADGE_FLYER_D - 1, 500, 500);
        if (!hasBadge(save.players[0], 'flyer') || hasBadge(save.players[1], 'flyer')) errors.push(`значок «Лётчик»: открыт у ${save.players.map(p => hasBadge(p, 'flyer'))}`);
        if (fitSet(save.players[0], cars[0].def.id, 'hood', 'flyer') || fitSet(save.players[0], cars[0].def.id, 'wheels', 'flyer')) errors.push('значок: не ставится открытый');
        fitBadges(cars[0].model, cars[0].def, fitOf(save.players[0], cars[0].def.id));
        if (cars[0].model.badges.length !== 2 + 4 * 2) errors.push(`значок: на машине ${cars[0].model.badges.length} мешей, ждали 10`);
        endMatch('menu');
        // гонка: финиш за BADGE_RACER_T с открывает «Гонщика», медленнее — нет
        cars = [];
        startMatch('race', 'city');
        for (let i = 0; i < 100 && !cars.length; i++) await wait(20);
        if (!Race.on) throw new Error('гонка не включилась');
        countdown = 0;
        const st = Race.st, fin = st.cps[RACE_CPS - 1];
        const finish = (p, t) => { st.prog[p] = RACE_CPS - 1; st.time = t; cars[p].fullReset(fin.x, fin.z, 0); stepWorld(FIXED); Race.update(0, simTime); };
        finish(0, BADGE_RACER_T - 1); finish(1, BADGE_RACER_T + 10);
        if (st.fin[0] === null || st.fin[1] === null) errors.push('значок «Гонщик»: финиш не засчитан');
        if (!hasBadge(save.players[0], 'racer') || hasBadge(save.players[1], 'racer')) errors.push(`значок «Гонщик»: открыт у ${save.players.map(p => hasBadge(p, 'racer'))}`);
        lines.push(`значки: ${BADGES.length} (${BADGES.map(b => b.name).join(', ')}), места на ${CARS.length} машинах найдены, открываются прыжком и гонкой`);
      } catch (e) {
        errors.push('значки: ' + (e.stack || String(e)).split('\n').slice(0, 3).join(' ← '));
      } finally {
        if (cars.length) endMatch('menu');
        save = JSON.parse(backup); persist(); updateCoins();
        if (JSON.stringify(save) !== backup) errors.push('значки: проверка изменила сохранение');
      }
    }
  } finally {
    console.error = origError;
    window.removeEventListener('error', onErr);
    window.removeEventListener('unhandledrejection', onErr);
  }
  lines.push(errors.length ? 'ОШИБКИ:\n  ' + errors.join('\n  ') : 'ошибок нет');
  const report = lines.join('\n');
  console.log(report);
  return report;
}

Object.assign(window.__game, { fingerprint, selfTest });
