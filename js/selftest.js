// Самопроверка: дешёвая текстовая проверка игры для разработчика и ИИ-ассистента (без скриншотов).
// В консоли: await __game.selfTest() — отчёт текстом; __game.fingerprint('city') — хеш карты.
// Определяет: fingerprint, selfTest.
// Использует: getData, getWorld, MAP_INFO (js/maps/registry.js); cars, FIXED, stepWorld, simTime (js/physics.js);
//   Traffic (js/traffic/traffic.js); startMatch, countdown, endMatch (js/match.js).
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

// JSON с отсортированными ключами; функции пропускаются, Map/Set — массивы, повторная ссылка — '^'
function _fpJson(v, seen = new WeakSet()) {
  if (typeof v === 'number') return String(_fpNum(v));
  if (v === null || typeof v !== 'object') return typeof v === 'function' ? '' : JSON.stringify(v) ?? '';
  if (seen.has(v)) return '^';
  seen.add(v);
  if (v instanceof HTMLCanvasElement) {
    const d = v.getContext('2d').getImageData(0, 0, v.width, v.height).data;
    let s = 0; for (let i = 0; i < d.length; i += 7) s = (s * 31 + d[i]) >>> 0;
    return 'canvas' + v.width + 'x' + v.height + ':' + s;
  }
  if (ArrayBuffer.isView(v)) return '[' + Array.from(v, _fpNum).join(',') + ']';
  if (v instanceof Map) v = [...v.entries()];
  else if (v instanceof Set) v = [...v];
  if (Array.isArray(v)) return '[' + v.map(x => _fpJson(x, seen)).join(',') + ']';
  return '{' + Object.keys(v).sort().map(k => k + ':' + _fpJson(v[k], seen)).join(',') + '}';
}

// раскладка: каждое поле отдельно (чтобы видеть, что именно поменялось) + функции рельефа на сетке
function _fpData(D) {
  const keys = {};
  for (const k of Object.keys(D).sort()) if (typeof D[k] !== 'function') keys[k] = _fpHash(_fpJson(D[k]));
  const b = D.bounds || D.BOUNDS || 500, samples = [];
  if (typeof D.ground === 'function') for (let x = -b; x <= b; x += b / 24) for (let z = -b; z <= b; z += b / 24) {
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
  return {
    meshes: rows.length, meshHash: _fpHash(rows.join('\n')),
    gridItems: gridRows.length, gridHash: _fpHash(gridRows.join('\n')),
    decks: w.decks ? _fpHash(_fpJson(w.decks.list.map(d => [d.p0, d.p1, d.w, d.mat]))) : '-',
    breakables: (w.breakables || []).length,
  };
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
// Проверяет: исключения, NaN в позициях, что машины поехали, что трафик появился (в городе).
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
