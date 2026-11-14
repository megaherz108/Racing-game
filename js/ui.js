// Интерфейс: меню, гараж, выбор карты, HUD, мини-карта, ввод
// Определяет: $, screens, setState, showLoading, hideLoading, updateCoins, addCoins, toastT, toast, HUD, notify,
//   setText, updateHUD, MM_R, PCSS, drawMinimap, renderGarage, browseCar, buyCar, syncBrowse, MODE_INFO,
//   drawModePreview, renderMaps, renderQuality, setQuality, stepQuality, renderTime, setTime, stepTime,
//   renderWeather, setWeather, renderTraffic, setTraffic, stepTraffic, selectMode, selectMap, stepMap, openMaps,
//   setPaused, raceEndOpen, closeRaceEnd, keys, BLOCK.
// Использует: save, persist, KMH, CARS, browse, derive, STATS, time100, HANDLING, carIndex, KO_REWARD, FLIP_REWARD,
//   CAP_REWARD, CAP_CFG, CAP_BONUS_PER, RACE_REWARD, RACE_CP_REWARD, RACE_CPS, playMap, MODES, PLAY_MAPS, QUALITY,
//   TIMES, TRAFFIC_LEVELS, defaultSave (js/data.js); lerp, clamp (js/core.js); updatePodium (js/showroom.js);
//   smooth01, mulberry32 (js/world.js); world, getData, MAP_INFO (js/maps/registry.js); coins (js/effects.js); Sound
//   (js/audio.js); cars (js/physics.js); Traffic (js/traffic/traffic.js); state, paused, countdown, startMatch,
//   endMatch, matchMode (js/match.js); Race (js/race.js); Capture (js/capture.js); Perf (js/main.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

/* =====================================================================
   UI
   ===================================================================== */
const $ = id => document.getElementById(id);
const screens = { menu: $('menu'), garage: $('garage'), maps: $('maps'), play: $('hud') };
function setState(s) {
  state = s;
  for (const [k, el] of Object.entries(screens)) el.classList.toggle('hidden', k !== s);
  $('pause').classList.toggle('hidden', !(s === 'play' && paused));
  if (s === 'garage') renderGarage();
  if (s === 'maps') renderMaps();
  updateCoins();
}
function showLoading(t) { const l = $('loading'); l.textContent = t; l.classList.remove('hidden'); }
function hideLoading() { $('loading').classList.add('hidden'); }
function updateCoins() {
  for (let p = 0; p < 2; p++) document.querySelectorAll('.cv' + p).forEach(e => e.textContent = save.players[p].coins);
}
function addCoins(p, n) { save.players[p].coins += n; persist(); updateCoins(); }

let toastT = 0;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.style.opacity = 1; clearTimeout(toastT); toastT = setTimeout(() => t.style.opacity = 0, 1800); }

const HUD = [0, 1].map(p => {
  const r = $('hud' + p), mm = r.querySelector('.mm');
  return { root: r, nm: r.querySelector('.nm'), fill: r.querySelector('.hpfill'), hptxt: r.querySelector('.hptxt'), status: r.querySelector('.status'),
    feed: r.querySelector('.feed'), big: r.querySelector('.big'), spd: r.querySelector('.spd'), mm, mmx: mm.getContext('2d'), cache: {},
    fx: r.querySelector('.speedfx'), race: r.querySelector('.race'), rc: r.querySelector('.rc'), rd: r.querySelector('.rd'),
    rt: r.querySelector('.rt'), rp: r.querySelector('.rp'),
    cap: r.querySelector('.cap'), ch: r.querySelector('.ch'), cn: r.querySelector('.cn'), ctime: r.querySelector('.ctime'),
    cme: r.querySelector('.cscore .me'), cst: r.querySelector('.cst'), cnext: r.querySelector('.cnext') };
});
function notify(p, text, cls, coin) {
  const d = document.createElement('div'); d.className = cls || '';
  d.innerHTML = coin ? `${text} <i class="coin"></i>` : text;
  HUD[p].feed.appendChild(d);
  while (HUD[p].feed.children.length > 4) HUD[p].feed.firstChild.remove();
  setTimeout(() => d.remove(), 2200);
}
function setText(p, key, el, v) { const c = HUD[p].cache; if (c[key] !== v) { c[key] = v; el.textContent = v; } }
function updateHUD() {
  for (let p = 0; p < cars.length; p++) {
    const c = cars[p], h = HUD[p];
    const spd = Math.hypot(c.vx, c.vz);
    setText(p, 'spd', h.spd, Math.round(spd * KMH));
    // затемнение краёв экрана на большой скорости (туннельное зрение)
    const fxo = (smooth01((spd - 30) / 40) * 0.8).toFixed(2);
    if (h.cache.fx !== fxo) { h.cache.fx = fxo; h.fx.style.opacity = fxo; }
    const r = Race.hud(p);
    if (r) {
      setText(p, 'rc', h.rc, r.cp); setText(p, 'rd', h.rd, r.dist); setText(p, 'rt', h.rt, r.time); setText(p, 'rp', h.rp, r.place);
      if (h.cache.lead !== r.lead) { h.cache.lead = r.lead; h.rp.classList.toggle('lead', r.lead); }
    }
    const cp = Capture.hud(p);                 // захват точек (js/capture.js)
    if (cp) {
      setText(p, 'ch', h.ch, cp.head); setText(p, 'cn', h.cn, cp.name); setText(p, 'ctime', h.ctime, cp.time);
      setText(p, 'cme', h.cme, String(cp.me));
      setText(p, 'cst', h.cst, cp.status); setText(p, 'cnext', h.cnext, cp.next);
      if (h.cache.ccls !== cp.cls) { h.cache.ccls = cp.cls; h.cst.className = 'cst ' + cp.cls; }
      h.cnext.classList.toggle('hidden', !cp.next);
    }
    const f = c.hp / c.maxHp, w = (f * 100).toFixed(1) + '%';
    if (h.cache.w !== w) {
      h.cache.w = w; h.fill.style.width = w;
      h.fill.style.background = f > 0.55 ? 'linear-gradient(90deg,#3fd977,#a6ef5c)' : f > 0.25 ? 'linear-gradient(90deg,#f2b632,#ffd75a)' : 'linear-gradient(90deg,#e8412f,#ff7a5a)';
    }
    setText(p, 'hp', h.hptxt, c.broken > 0 ? 'Ремонт…' : `Прочность ${Math.ceil(c.hp)} / ${c.maxHp}`);
    const st = c.drown > 0 ? `🌊 В ВОДЕ · возврат через ${c.drown.toFixed(1)} с` : c.broken > 0 ? `⚠ ПОЛОМКА · ремонт через ${c.broken.toFixed(1)} с` : '';
    setText(p, 'st', h.status, st);
    h.status.classList.toggle('hidden', !st);
    h.status.classList.toggle('water', c.drown > 0);
    let big = '';
    if (countdown > 0) big = countdown > 0.2 ? String(Math.ceil(countdown - 0.2)) : 'СТАРТ!';
    else if (countdown > -0.8) big = 'СТАРТ!';
    if (p === 0 && big !== h.cache.big && big) Sound.beep(big === 'СТАРТ!');
    if (!big) big = Race.big(p) || Capture.big(p);
    setText(p, 'big', h.big, big);
    h.big.classList.toggle('hidden', !big);
  }
}

// мини-карта, повёрнутая по направлению машины
const MM_R = 173;                        // радиус обзора, м (больше — мельче масштаб)
const PCSS = ['#38c8ff', '#ff8a2a'];
function drawMinimap(p) {
  const { mm, mmx: ctx } = HUD[p], S = mm.width, c = cars[p], o = cars[1 - p];
  const img = world.minimap, ext = world.mmExt, sc = img.width / (2 * ext), k = S / (2 * MM_R);
  ctx.clearRect(0, 0, S, S);
  ctx.save();
  ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = world.mmBg; ctx.fillRect(0, 0, S, S);
  ctx.translate(S / 2, S / 2); ctx.rotate(c.h); ctx.scale(k / sc, k / sc);
  ctx.translate(-(ext - c.x) * sc, -(ext - c.z) * sc);
  ctx.drawImage(img, 0, 0);
  const u = sc / k;   // пикселей картинки на пиксель мини-карты
  ctx.fillStyle = '#ffd23a';
  for (const cn of coins) {
    if (!cn.active || Math.abs(cn.x - c.x) > MM_R * 1.5 || Math.abs(cn.z - c.z) > MM_R * 1.5) continue;
    ctx.beginPath(); ctx.arc((ext - cn.x) * sc, (ext - cn.z) * sc, 2.6 * u, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#e9e6dc';
  for (const tc of Traffic.list) {
    if (tc.dead || Math.abs(tc.x - c.x) > MM_R * 1.5 || Math.abs(tc.z - c.z) > MM_R * 1.5) continue;
    ctx.beginPath(); ctx.arc((ext - tc.x) * sc, (ext - tc.z) * sc, (tc.L > 6 ? 2.6 : 1.8) * u, 0, Math.PI * 2); ctx.fill();
  }
  if (o) {                                    // соперник (в одиночной езде его нет)
    ctx.fillStyle = PCSS[1 - p]; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5 * u;
    ctx.beginPath(); ctx.arc((ext - o.x) * sc, (ext - o.z) * sc, 5 * u, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
  ctx.save(); ctx.translate(S / 2, S / 2);
  Race.minimap(ctx, p, S / 2, k);
  Capture.minimap(ctx, p, S / 2, k);
  ctx.fillStyle = PCSS[p]; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(7, 8); ctx.lineTo(0, 4); ctx.lineTo(-7, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}

function renderGarage() {
  for (let p = 0; p < 2; p++) {
    const pl = save.players[p], def = CARS[browse[p]], owned = pl.owned.includes(def.id), d = derive(def.stats);
    if (owned && pl.sel !== def.id) { pl.sel = def.id; persist(); }
    const chips = CARS.map((c, i) => `<button data-p="${p}" data-i="${i}" class="${i === browse[p] ? 'on' : ''} ${pl.owned.includes(c.id) ? '' : 'locked'}">${c.short}</button>`).join('');
    const stats = STATS.map(([k, label]) => {
      const v = def.stats[k];
      const segs = Array.from({ length: 10 }, (_, i) => `<i style="${i < v ? `background:var(--s-${k})` : ''}"></i>`).join('');
      return `<div class="stat"><span>${label}</span><div class="segs">${segs}</div><b>${v}</b></div>`;
    }).join('');
    let action;
    if (owned) action = `<div class="owned">✓ В гараже · выбрана</div>`;
    else {
      const can = pl.coins >= def.price;
      action = `<div class="lockline">🔒 Не куплена${can ? '' : ` · не хватает ${def.price - pl.coins}`}</div>
        <button class="btn buybtn ${can ? 'can' : ''}" data-buy="${p}" ${can ? '' : 'disabled'}>Купить за ${def.price} <i class="coin"></i></button>`;
    }
    $('card' + p).innerHTML = `
      <div class="ptag">ИГРОК ${p + 1} <span class="wallet"><i class="coin"></i> <span class="cv${p}">${pl.coins}</span></span></div>
      <div class="carnav"><button class="nav" data-nav="${p}" data-d="-1">‹</button><div class="cname">${def.name}</div><button class="nav" data-nav="${p}" data-d="1">›</button></div>
      <div class="ccls">${def.cls} · ${def.price ? def.price + ' монет' : 'бесплатно'}</div>
      <div class="chips">${chips}</div>
      ${stats}
      <div class="derived">${Math.round(d.maxSpeed * KMH)} км/ч · 0–100 за ${time100(d.accel * HANDLING.accelMul, d.maxSpeed).toFixed(1).replace('.', ',')} с · ${Math.round(d.mass)} кг · прочность ${d.maxHp}</div>
      ${action}`;
    updatePodium(p);
  }
  const bad = [0, 1].filter(p => !save.players[p].owned.includes(CARS[browse[p]].id));
  $('gWarn').textContent = bad.length ? bad.map(p => `Игрок ${p + 1}: машина не куплена`).join(' · ') : '';
  $('gPlay').disabled = bad.length > 0;
}
function browseCar(p, d) { browse[p] = (browse[p] + d + CARS.length) % CARS.length; renderGarage(); }
function buyCar(p) {
  const pl = save.players[p], def = CARS[browse[p]];
  if (pl.owned.includes(def.id)) return;
  if (pl.coins < def.price) { toast(`Игроку ${p + 1} не хватает ${def.price - pl.coins} монет`); return; }
  pl.coins -= def.price; pl.owned.push(def.id); pl.sel = def.id; persist();
  toast(`Игрок ${p + 1}: ${def.name} куплена!`);
  renderGarage();
}
// откатить просмотр к купленным машинам перед выездом
function syncBrowse() { for (let p = 0; p < 2; p++) if (!save.players[p].owned.includes(CARS[browse[p]].id)) browse[p] = carIndex(save.players[p].sel); }

// Экран выбора режима и карты (PLAY_MAPS в js/data.js). Гонка — только в городе: ей нужен дорожный граф.
const MODE_INFO = {
  free: { name: 'Свободная езда', tag: `Монеты +1 · нокаут +${KO_REWARD} · переворот +${FLIP_REWARD}`,
    desc: `Катайтесь по острову без правил: прыгайте с трамплинов, сбивайте фонари, тараньте соперника. На дорогах лежат монеты — каждая +1 тому, кто подобрал. Опрокинули соперника ударом в борт — +${FLIP_REWARD}; таранить лучше носом: удар передом бьёт по прочности на 30% слабее.` },
  solo: { name: 'Одиночная езда', tag: '1 игрок · монеты +1',
    desc: 'Один игрок на весь экран, без соперника: спокойно изучайте город, ищите трамплины и короткие пути. Машина и кошелёк Игрока 1, рулить можно WASD или стрелками.' },
  capture: { name: 'Захват точек', tag: `Победителю +${CAP_REWARD} · +1 за 10 очков`,
    get desc() { return `Пять точек в случайном порядке: площадь у фонтана, двор винодельни, руины амфитеатра, остров на реке; финал — всегда край пирса. Стойте в светящемся круге один — очко в секунду; вдвоём — очков никому, выталкивайте соперника. Через ${CAP_CFG.time} с захвата точка гаснет. Победителю +${CAP_REWARD}, обоим +1 за каждые ${CAP_BONUS_PER} очков.`; } },
  race: { name: 'Гонка · чекпоинты', tag: `Победителю +${RACE_REWARD} · чекпоинт +${RACE_CP_REWARD}`,
    desc: `По городу расставлены ${RACE_CPS} больших светящихся арок. Проедьте их по порядку быстрее соперника — путь выбирайте сами. Стрелка вверху экрана показывает на следующую арку. За каждую арку +${RACE_CP_REWARD}, по дороге можно подбирать монеты (+1), за победу +${RACE_REWARD}. Трасса каждый раз новая.` },
};
function drawModePreview(cv, mode) {
  const ctx = cv.getContext('2d'), D = getData(playMap(mode)), S = cv.width, sc = S / (2 * D.mmExt);
  ctx.fillStyle = D.mmBg; ctx.fillRect(0, 0, S, S);
  ctx.drawImage(D.minimap, 0, 0, S, S);
  ctx.fillStyle = 'rgba(8,12,18,.35)'; ctx.fillRect(0, 0, S, S);
  const P = (x, z) => [(D.mmExt - x) * sc, (D.mmExt - z) * sc];
  const rng = mulberry32(mode === 'race' ? 7 : mode === 'solo' ? 5 : 3);
  if (mode === 'capture') {                        // пять зон с номерами
    ctx.font = "bold 11px 'Rubik', sans-serif"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const zn of D.C.zones) {
      const [x, y] = P(zn.x, zn.z), r = Math.max(6, zn.r * sc);
      ctx.fillStyle = 'rgba(255,210,58,.3)'; ctx.strokeStyle = '#ffd23a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffd23a'; ctx.strokeStyle = '#141008';
      ctx.beginPath(); ctx.arc(x + r * 0.8, y - r * 0.8, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#141008'; ctx.fillText(String(zn.id), x + r * 0.8, y - r * 0.8 + 0.5);
    }
    return;
  }
  if (mode !== 'race') {
    ctx.fillStyle = '#ffd23a';
    for (let i = 0; i < 70; i++) {
      const s = D.roadSegs[Math.floor(rng() * D.roadSegs.length)], t = rng();
      const [x, y] = P(lerp(s.x0, s.x1, t), lerp(s.z0, s.z1, t));
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    }
    return;
  }
  // пример трассы: 10 перекрёстков по 320–620 м друг от друга
  const nodes = D.nodes.filter(n => n.deg >= 2), pts = [];
  let px = -320, pz = 38;
  for (let i = 0; i < RACE_CPS; i++) {
    const pool = nodes.filter(n => { const d = Math.hypot(n.x - px, n.z - pz); return d > 320 && d < 620 && pts.every(q => Math.hypot(q.x - n.x, q.z - n.z) > 220); });
    const n = (pool.length ? pool : nodes)[Math.floor(rng() * (pool.length || nodes.length))];
    pts.push(n); px = n.x; pz = n.z;
  }
  ctx.strokeStyle = 'rgba(53,255,160,.7)'; ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
  ctx.beginPath(); ctx.moveTo(...P(-320, 38)); for (const n of pts) ctx.lineTo(...P(n.x, n.z)); ctx.stroke(); ctx.setLineDash([]);
  ctx.font = "bold 11px 'Rubik', sans-serif"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  pts.forEach((n, i) => {
    const [x, y] = P(n.x, n.z), fin = i === pts.length - 1;
    ctx.fillStyle = fin ? '#ffd23a' : '#35ffa0'; ctx.strokeStyle = '#0b1a12'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#0b1a12'; ctx.fillText(fin ? 'F' : String(i + 1), x, y + 0.5);
  });
}
function renderMaps() {
  const grid = $('mapGrid'), map = playMap('free');
  if (grid.dataset.built !== map + CAP_CFG.time) {     // описание захвата зависит от CAP_CFG.time                // превью рисуются заново при смене карты
    grid.innerHTML = MODES.map(id => `
      <button class="mapcard" data-mode="${id}">
        <canvas width="240" height="240"></canvas>
        <div class="mname">${MODE_INFO[id].name}</div>
        <div class="msize">${MODE_INFO[id].tag}${playMap(id) !== map ? ` · только: ${MAP_INFO[playMap(id)].name}` : ''}</div>
        <div class="mdesc">${MODE_INFO[id].desc}</div>
      </button>`).join('');
    grid.querySelectorAll('.mapcard').forEach(card => drawModePreview(card.querySelector('canvas'), card.dataset.mode));
    grid.dataset.built = map + CAP_CFG.time;
  }
  grid.querySelectorAll('.mapcard').forEach(c => c.classList.toggle('on', c.dataset.mode === save.mode));
  $('modeLine').innerHTML = `Карта: ${PLAY_MAPS.map(id =>
    `<button class="tsel ${id === map ? 'on' : ''}" data-map="${id}">${MAP_INFO[id].name}</button>`).join('')}
    <span class="thint">C</span> · ← / → — режим, Enter — старт`;
  renderTraffic(); renderTime(); renderWeather(); renderQuality();
}
// качество графики (QUALITY в js/data.js): сглаживание задаётся при создании WebGL, поэтому смена — с перезагрузкой
// страницы; после неё игра сразу возвращается на этот экран
function renderQuality() {
  $('qualityLine').innerHTML = `Графика: ${Object.entries(QUALITY).map(([id, q]) =>
    `<button class="tsel ${id === save.quality ? 'on' : ''}" data-quality="${id}">${q.label}</button>`).join('')}
    <span class="thint">Q</span>`;
}
function setQuality(id) {
  if (id === save.quality || !QUALITY[id]) return;
  save.quality = id; persist(); renderQuality();
  try { sessionStorage.setItem('steel_duel_reopen', 'maps'); } catch (e) { }
  showLoading('Применяю настройки графики…');
  setTimeout(() => location.reload(), 50);
}
function stepQuality() { const ids = Object.keys(QUALITY), i = ids.indexOf(save.quality); setQuality(ids[(i + 1) % ids.length]); }
// время суток (js/sky.js)
function renderTime() {
  $('timeLine').innerHTML = `Время суток: ${TIMES.map(([id, label]) =>
    `<button class="tsel ${id === save.tod ? 'on' : ''}" data-tod="${id}">${label}</button>`).join('')}
    <span class="thint">N${playMap('free') === 'coast' ? ' · на Побережье всегда золотой час' : ''}</span>`;
}
function setTime(id) { save.tod = id; persist(); renderTime(); }
function stepTime() { const i = TIMES.findIndex(l => l[0] === save.tod); setTime(TIMES[(i + 1) % TIMES.length][0]); }
// погода: дождь (js/weather.js)
function renderWeather() {
  $('weatherLine').innerHTML = `Погода: ${[[false, 'Ясно'], [true, 'Дождь']].map(([v, label]) =>
    `<button class="tsel ${v === save.rain ? 'on' : ''}" data-rain="${v}">${label}</button>`).join('')}
    <span class="thint">R</span>`;
}
function setWeather(v) { save.rain = !!v; persist(); renderWeather(); }
// интенсивность городского трафика
function renderTraffic() {
  $('trafficLine').innerHTML = `Трафик в городе: ${TRAFFIC_LEVELS.map(([id, label]) =>
    `<button class="tsel ${id === save.traffic ? 'on' : ''}" data-traffic="${id}">${label}</button>`).join('')}
    <span class="thint">↑ / ↓</span>`;
}
function setTraffic(id) { save.traffic = id; persist(); renderTraffic(); }
function stepTraffic(d) {
  const i = TRAFFIC_LEVELS.findIndex(l => l[0] === save.traffic);
  setTraffic(TRAFFIC_LEVELS[clamp(i + d, 0, TRAFFIC_LEVELS.length - 1)][0]);
}
function selectMode(id) { save.mode = id; persist(); renderMaps(); }
function selectMap(id) { if (!PLAY_MAPS.includes(id)) return; save.map = id; persist(); renderMaps(); }
function stepMap() { selectMap(PLAY_MAPS[(PLAY_MAPS.indexOf(playMap('free')) + 1) % PLAY_MAPS.length]); }
function openMaps() { syncBrowse(); showLoading('Подготовка…'); setTimeout(() => { hideLoading(); setState('maps'); }, 30); }

$('garage').addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return;
  if (t.dataset.nav !== undefined) browseCar(+t.dataset.nav, +t.dataset.d);
  else if (t.dataset.i !== undefined) { browse[+t.dataset.p] = +t.dataset.i; renderGarage(); }
  else if (t.dataset.buy !== undefined) buyCar(+t.dataset.buy);
});
$('mapGrid').addEventListener('click', e => { const c = e.target.closest('.mapcard'); if (c) selectMode(c.dataset.mode); });
$('mapGrid').addEventListener('dblclick', e => { const c = e.target.closest('.mapcard'); if (c) { selectMode(c.dataset.mode); startMatch(); } });
$('mPlay').onclick = openMaps;
$('mGarage').onclick = () => setState('garage');
$('mHelp').onclick = () => $('help').classList.remove('hidden');
$('hClose').onclick = () => $('help').classList.add('hidden');
$('mReset').onclick = () => {
  if (!confirm('Сбросить монеты и купленные машины обоих игроков?')) return;
  save = Object.assign(defaultSave(), { quality: save.quality }); persist();   // графику не сбрасываем — она уже применена browse[0] = browse[1] = 0; updatePodium(0); updatePodium(1); updateCoins(); toast('Прогресс сброшен');
};
$('gBack').onclick = () => setState('menu');
$('gPlay').onclick = () => { if (!$('gPlay').disabled) openMaps(); };
$('mapsBack').onclick = () => setState('menu');
$('modeLine').addEventListener('click', e => { const b = e.target.closest('[data-map]'); if (b) selectMap(b.dataset.map); });
$('trafficLine').addEventListener('click', e => { const b = e.target.closest('[data-traffic]'); if (b) setTraffic(b.dataset.traffic); });
$('timeLine').addEventListener('click', e => { const b = e.target.closest('[data-tod]'); if (b) setTime(b.dataset.tod); });
$('weatherLine').addEventListener('click', e => { const b = e.target.closest('[data-rain]'); if (b) setWeather(b.dataset.rain === 'true'); });
$('qualityLine').addEventListener('click', e => { const b = e.target.closest('[data-quality]'); if (b) setQuality(b.dataset.quality); });
$('mapsGo').onclick = () => startMatch();
function setPaused(v) { paused = v; $('pause').classList.toggle('hidden', !v); keys.clear(); }
$('pResume').onclick = () => setPaused(false);
$('pRestart').onclick = () => { paused = false; $('pause').classList.add('hidden'); startMatch(); };
$('pMaps').onclick = () => { paused = false; endMatch('maps'); };
$('pGarage').onclick = () => { paused = false; endMatch('garage'); };
$('pMenu').onclick = () => { paused = false; endMatch('menu'); };
// итоги гонки
const raceEndOpen = () => !$('raceEnd').classList.contains('hidden');
function closeRaceEnd() { $('raceEnd').classList.add('hidden'); paused = false; }
$('reAgain').onclick = () => { closeRaceEnd(); startMatch(matchMode); };
$('reModes').onclick = () => { closeRaceEnd(); endMatch('maps'); };
$('reMenu').onclick = () => { closeRaceEnd(); endMatch('menu'); };

/* =====================================================================
   INPUT
   ===================================================================== */
const keys = new Set();
const BLOCK = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Slash']);   // «/» в Firefox открывает быстрый поиск
addEventListener('keydown', e => {
  if (BLOCK.has(e.code)) e.preventDefault();
  keys.add(e.code);
  if (e.repeat) return;
  Sound.init();
  if (e.code === 'Backquote') { Perf.toggle(); return; }
  if (e.code === 'KeyM') { toast(Sound.toggleMute() ? 'Звук выключен (M)' : 'Звук включён (M)'); return; }
  if (!$('help').classList.contains('hidden')) { if (e.code === 'Escape' || e.code === 'Enter') $('help').classList.add('hidden'); return; }
  if (!$('loading').classList.contains('hidden')) return;
  if (state === 'play' && raceEndOpen()) {
    if (e.code === 'Enter' || e.code === 'NumpadEnter') $('reAgain').click();
    else if (e.code === 'Escape') $('reMenu').click();
  } else if (state === 'play') {
    if (e.code === 'Escape') setPaused(!paused);
    else if (!paused && e.code === 'KeyR' && cars[0].drown <= 0) cars[0].toRoad();
    else if (!paused && (e.code === 'Enter' || e.code === 'NumpadEnter')) {
      const c = cars[cars.length - 1];        // в одиночной езде Enter тоже возвращает машину Игрока 1
      if (c.drown <= 0) c.toRoad();
    }
  } else if (state === 'garage') {
    if (e.code === 'KeyA') browseCar(0, -1); else if (e.code === 'KeyD') browseCar(0, 1);
    else if (e.code === 'ArrowLeft') browseCar(1, -1); else if (e.code === 'ArrowRight') browseCar(1, 1);
    else if (e.code === 'KeyW') buyCar(0); else if (e.code === 'ArrowUp') buyCar(1);
    else if (e.code === 'Enter') $('gPlay').click();
    else if (e.code === 'Escape') setState('menu');
  } else if (state === 'maps') {
    const i = MODES.indexOf(save.mode);
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') selectMode(MODES[(i + MODES.length - 1) % MODES.length]);
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') selectMode(MODES[(i + 1) % MODES.length]);
    else if (e.code === 'ArrowUp' || e.code === 'KeyW') stepTraffic(1);
    else if (e.code === 'ArrowDown' || e.code === 'KeyS') stepTraffic(-1);
    else if (e.code === 'KeyN') stepTime();
    else if (e.code === 'KeyC') stepMap();
    else if (e.code === 'KeyR') setWeather(!save.rain);
    else if (e.code === 'KeyQ') stepQuality();
    else if (e.code === 'Enter') startMatch();
    else if (e.code === 'Escape') setState('menu');
  } else if (state === 'menu') {
    if (e.code === 'Enter') openMaps();
  }
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
addEventListener('pointerdown', () => Sound.init());

