// Интерфейс: меню, гараж, выбор карты, HUD, мини-карта, ввод
// Определяет: $, screens, setState, showLoading, hideLoading, updateCoins, addCoins, toastT, toast, HUD, notify,
//   setText, updateHUD, MM_CFG, mmXY, PCSS, MM_MARK, drawMarks, drawMinimap, renderGarage, badgeRow, cycleBadge,
//   browseCar, showCar, pickPaint, stepPaint, buyPaint, buyCar, syncBrowse, JUMP_DESC, MODE_INFO, drawModePreview,
//   renderMaps, renderJumps, renderQuality, setQuality, stepQuality, renderTime, setTime, stepTime, renderWeather,
//   setWeather, renderAddr, setAddr, renderTraffic, setTraffic, stepTraffic, selectMode, selectMap, stepMap,
//   openMaps, setPaused, raceEndOpen, closeRaceEnd, keys, BLOCK, syncShift.
// Использует: paintView, save, persist, KMH, CARS, browse, derive, STATS, paintOf, paintDef, PAINTS, hasPaint,
//   time100, HANDLING, fitOf, BADGES, hasBadge, BADGE_SPOTS, fitSet, PAINT_FREE, paintBuy, carIndex, JUMP, KO_REWARD,
//   FLIP_REWARD, CAP_REWARD, CAP_CFG, CAP_BONUS_PER, BOMB_REWARD, BOMB_ROUND_REWARD, BOMB_CFG, RACE_REWARD,
//   RACE_CP_REWARD, playMap, MODES, MODE_MAPS, PLAY_MAPS, QUALITY, TIMES, TRAFFIC_LEVELS, defaultSave (js/data.js);
//   lerp, clamp (js/core.js); badgeSVG (js/badges.js); updatePodium (js/showroom.js); smooth01, mulberry32
//   (js/world.js); world, getData, MAP_INFO (js/maps/registry.js); coins (js/effects.js); Sound (js/audio.js); cars
//   (js/physics.js); Traffic (js/traffic/traffic.js); state, paused, countdown, startMatch, endMatch, matchMode
//   (js/match.js); Race, raceCfg (js/race.js); Capture (js/capture.js); jumpTable (js/jumps.js); Bomb (js/bomb.js);
//   Fly (js/flycam.js); Perf (js/main.js).
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
  else if (paintView[0] || paintView[1]) { paintView[0] = paintView[1] = null; updatePodium(0); updatePodium(1); }   // примерка — только в гараже
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
    if (!big) big = Race.big(p) || Capture.big(p) || Bomb.big(p);
    setText(p, 'big', h.big, big);
    h.big.classList.toggle('hidden', !big);
  }
}

// мини-карта: не поворачивается, север карты (+z) всегда сверху, +x — слева (как картинка world.minimap);
// по направлению машины поворачивается только её стрелка в центре
// настройки мини-карты, меняются из консоли на ходу: MM_CFG.r = 250
const MM_CFG = { r: 216 };               // r — радиус обзора, м (больше — мельче масштаб)
// точка мира (x, z) на мини-карте машины c: смещение в пикселях от центра; k — пикселей на метр
function mmXY(c, x, z, k) { return [(c.x - x) * k, (c.z - z) * k]; }
const PCSS = ['#38c8ff', '#ff8a2a'];
// значки мест (world.mmMarks / data.mmMarks: [{ x, z, icon, name }], пока — достопримечательности «Ситжеса»):
// эмодзи в белом кружке радиуса r пикселей; дальше края мини-карты, но ближе far м — маленький значок на краю
const MM_MARK = { r: 8, rim: 6, far: 600, font: '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif' };
// list: [{ x, y, r, icon, a }] в пикселях; наложенные значки раздвигаются (попарно, несколько проходов),
// сдвинутый дальше своего радиуса — с тонкой линией к своему месту
function drawMarks(ctx, list) {
  for (const m of list) { m.ox = m.x; m.oy = m.y; }
  for (let it = 0; it < 12; it++) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j], min = a.r + b.r + 1;
    let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
    if (d >= min) continue;
    if (d < 0.01) { dx = Math.cos(i * 2.4 + j); dy = Math.sin(i * 2.4 + j); d = 1; }
    const f = (min - d) / 2 / d;
    a.x -= dx * f; a.y -= dy * f; b.x += dx * f; b.y += dy * f;
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1;
  for (const m of list) if (Math.hypot(m.x - m.ox, m.y - m.oy) > m.r) {
    ctx.beginPath(); ctx.moveTo(m.ox, m.oy); ctx.lineTo(m.x, m.y); ctx.stroke();
    ctx.beginPath(); ctx.arc(m.ox, m.oy, 1.6, 0, Math.PI * 2); ctx.fill();
  }
  for (const m of list) {
    ctx.globalAlpha = m.a ?? 1;
    ctx.fillStyle = 'rgba(255,255,255,.93)'; ctx.strokeStyle = 'rgba(40,32,24,.9)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.font = `${Math.round(m.r * 1.3)}px ${MM_MARK.font}`; ctx.fillStyle = '#000';
    ctx.fillText(m.icon, m.x, m.y + m.r * 0.08);
  }
  ctx.globalAlpha = 1;
}
function drawMinimap(p) {
  const { mm, mmx: ctx } = HUD[p], S = mm.width, c = cars[p], o = cars[1 - p];
  const img = world.minimap, ext = world.mmExt, extZ = world.mmExtZ ?? ext, sc = img.width / (2 * ext), k = S / (2 * MM_CFG.r);
  ctx.clearRect(0, 0, S, S);
  ctx.save();
  ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = world.mmBg; ctx.fillRect(0, 0, S, S);
  ctx.translate(S / 2, S / 2); ctx.scale(k / sc, k / sc);
  ctx.translate(-(ext - c.x) * sc, -(extZ - c.z) * sc);
  ctx.drawImage(img, 0, 0);
  const u = sc / k;   // пикселей картинки на пиксель мини-карты
  ctx.fillStyle = '#ffd23a';
  for (const cn of coins) {
    if (!cn.active || Math.abs(cn.x - c.x) > MM_CFG.r * 1.5 || Math.abs(cn.z - c.z) > MM_CFG.r * 1.5) continue;
    ctx.beginPath(); ctx.arc((ext - cn.x) * sc, (extZ - cn.z) * sc, 2.6 * u, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#e9e6dc';
  for (const tc of Traffic.list) {
    if (tc.dead || Math.abs(tc.x - c.x) > MM_CFG.r * 1.5 || Math.abs(tc.z - c.z) > MM_CFG.r * 1.5) continue;
    ctx.beginPath(); ctx.arc((ext - tc.x) * sc, (extZ - tc.z) * sc, (tc.L > 6 ? 2.6 : 1.8) * u, 0, Math.PI * 2); ctx.fill();
  }
  if (o) {                                    // соперник (в одиночной езде его нет)
    ctx.fillStyle = PCSS[1 - p]; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5 * u;
    ctx.beginPath(); ctx.arc((ext - o.x) * sc, (extZ - o.z) * sc, 5 * u, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
  ctx.save(); ctx.translate(S / 2, S / 2);
  if (world.mmMarks) {                        // значки мест: поверх карты, не в её масштабе
    const lim = S / 2 - MM_MARK.rim - 2, list = [];
    for (const m of world.mmMarks) {
      let [x, y] = mmXY(c, m.x, m.z, k);
      const d = Math.hypot(x, y);
      if (d <= lim - MM_MARK.r + MM_MARK.rim) { list.push({ x, y, r: MM_MARK.r, icon: m.icon }); continue; }
      if (d / k > MM_MARK.far) continue;
      x *= lim / d; y *= lim / d;
      list.push({ x, y, r: MM_MARK.rim, icon: m.icon, a: 0.8 });
    }
    drawMarks(ctx, list);
  }
  Race.minimap(ctx, p, S / 2, k);
  Capture.minimap(ctx, p, S / 2, k);
  Bomb.minimap(ctx, p, S / 2, k);
  ctx.rotate(-c.h);                           // стрелка машины — по её курсу (вперёд — (sin h, cos h) в мире)
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
    if (owned) {
      // цвета: купленные выбираются кликом, некупленный клик примеряет на витрине (paintView) и показывает покупку
      const cur = paintOf(pl, def.id), view = paintView[p] ? paintDef(paintView[p]) : null;
      const sw = PAINTS.map(c => {
        const has = hasPaint(pl, def.id, c.id);
        return `<button class="sw ${(view || cur).id === c.id ? 'on' : ''} ${has ? '' : 'locked'}" data-paint="${p}" data-c="${c.id}"
          title="${c.name}${has ? '' : ` — ${c.price} монет`}"><i style="background:#${c.hex.toString(16).padStart(6, '0')}"></i><small>${has ? (c.id === cur.id ? '✓' : '') : c.price}</small></button>`;
      }).join('');
      action = `<div class="paints">${sw}</div>`;
      if (view) {
        const can = pl.coins >= view.price;
        action += `<div class="lockline">🎨 ${view.name} — не куплен${can ? '' : ` · не хватает ${view.price - pl.coins}`}</div>
          <button class="btn buybtn ${can ? 'can' : ''}" data-buypaint="${p}" ${can ? '' : 'disabled'}>Купить цвет за ${view.price} <i class="coin"></i></button>`;
      } else action += `<div class="owned">✓ В гараже · ${cur.name.toLowerCase()} цвет</div>`;
      action += badgeRow(p, pl, def);
    } else {
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
// значки за достижения (js/badges.js): открытые и как открыть остальные; пять мест на машине — клик по месту
// перебирает открытые значки и «пусто»
function badgeRow(p, pl, def) {
  const fit = fitOf(pl, def.id), any = pl.badges.length > 0;
  const list = BADGES.map(b => hasBadge(pl, b.id) ? `<span class="bg">${badgeSVG(b, 16)}${b.name}</span>`
    : `<span class="bg locked" title="Откроется: ${b.how}">${badgeSVG(b, 16)}🔒 ${b.name} — ${b.how}</span>`).join('');
  const spots = BADGE_SPOTS.map(([s, name, short]) => {
    const b = fit[s];
    return `<button class="bs ${b ? 'on' : ''}" data-spot="${p}" data-s="${s}" ${any ? '' : 'disabled'}
      title="${name}: ${b ? b.name : 'пусто'}${any ? ' (клик — сменить)' : ''}">${b ? badgeSVG(b, 22) : '<i></i>'}<small>${short}</small></button>`;
  }).join('');
  return `<div class="blist"><b>Значки</b>${list}</div><div class="bspots">${spots}</div>`;
}
function cycleBadge(p, spot) {
  const pl = save.players[p], carId = CARS[browse[p]].id;
  const opts = [null, ...BADGES.filter(b => hasBadge(pl, b.id)).map(b => b.id)];
  const next = opts[(opts.indexOf((pl.fit[carId] || {})[spot] || null) + 1) % opts.length];
  if (fitSet(pl, carId, spot, next)) return;
  persist(); renderGarage();
}
function browseCar(p, d) { showCar(p, (browse[p] + d + CARS.length) % CARS.length); }
function showCar(p, i) { browse[p] = i; paintView[p] = null; renderGarage(); }
// клик по цвету: купленный — выбрать для этой машины, некупленный — примерить
function pickPaint(p, id) {
  const pl = save.players[p], carId = CARS[browse[p]].id;
  if (!pl.owned.includes(carId)) return;
  if (hasPaint(pl, carId, id)) {
    paintView[p] = null;
    if (id === PAINT_FREE) delete pl.paint[carId]; else pl.paint[carId] = id;
    persist();
  } else paintView[p] = id;
  renderGarage();
}
// следующий цвет по кругу (клавиши S / ↓)
function stepPaint(p) {
  const pl = save.players[p], carId = CARS[browse[p]].id;
  if (!pl.owned.includes(carId)) return;
  const i = PAINTS.indexOf(paintView[p] ? paintDef(paintView[p]) : paintOf(pl, carId));
  pickPaint(p, PAINTS[(i + 1) % PAINTS.length].id);
}
function buyPaint(p) {
  const pl = save.players[p], def = CARS[browse[p]], pd = paintView[p] && paintDef(paintView[p]);
  if (!pd) return;
  const why = paintBuy(pl, def.id, pd.id);
  if (why) { toast(`Игрок ${p + 1}: ${why}`); return; }
  paintView[p] = null; persist(); updateCoins();
  toast(`Игрок ${p + 1}: ${def.short} — ${pd.name.toLowerCase()} цвет куплен!`);
  renderGarage();
}
function buyCar(p) {
  const pl = save.players[p], def = CARS[browse[p]];
  if (pl.owned.includes(def.id)) { buyPaint(p); return; }   // W / ↑ у купленной машины — купить примеряемый цвет
  if (pl.coins < def.price) { toast(`Игроку ${p + 1} не хватает ${def.price - pl.coins} монет`); return; }
  pl.coins -= def.price; pl.owned.push(def.id); pl.sel = def.id; persist();
  toast(`Игрок ${p + 1}: ${def.name} куплена!`);
  renderGarage();
}
// откатить просмотр к купленным машинам перед выездом
function syncBrowse() { for (let p = 0; p < 2; p++) if (!save.players[p].owned.includes(CARS[browse[p]].id)) browse[p] = carIndex(save.players[p].sel); }

// Экран выбора режима и карты (PLAY_MAPS в js/data.js). У гонки и захвата карты свои (MODE_MAPS в js/data.js).
const JUMP_DESC = `Прыжок ${JUMP.tiers.map(t => `от ${t[0]} м — +${t[1]}`).join(', ')}; рекорд карты удваивает монеты.`;
const MODE_INFO = {
  free: { name: 'Свободная езда', tag: `Монеты +1 · нокаут +${KO_REWARD} · переворот +${FLIP_REWARD}`,
    desc: `Катайтесь по острову без правил: прыгайте с трамплинов, сбивайте фонари, тараньте соперника. На дорогах лежат монеты — каждая +1 тому, кто подобрал. Положили соперника на крышу или прижали крышей к стене — +${FLIP_REWARD}; таранить лучше носом: удар передом бьёт по прочности на 30% слабее. ${JUMP_DESC}` },
  solo: { name: 'Одиночная езда', tag: '1 игрок · монеты +1',
    desc: 'Один игрок на весь экран, без соперника: спокойно изучайте город, ищите трамплины и короткие пути. Машина и кошелёк Игрока 1, рулить можно WASD или стрелками. ' + JUMP_DESC },
  capture: { name: 'Захват точек', tag: `Победителю +${CAP_REWARD} · +1 за 10 очков`,
    get desc() { return `Пять точек в случайном порядке: площадь у фонтана, двор винодельни, руины амфитеатра, остров на реке; финал — всегда край пирса. Стойте в светящемся круге один — очко в секунду; вдвоём — очков никому, выталкивайте соперника. Через ${CAP_CFG.time} с захвата точка гаснет. Победителю +${CAP_REWARD}, обоим +1 за каждые ${CAP_BONUS_PER} очков.`; } },
  bomb: { name: 'Горячая бомба', tag: `Победителю +${BOMB_REWARD} · раунд +${BOMB_ROUND_REWARD}`,
    get desc() { return `У одного из вас на крыше тикает бомба: фитиль ${BOMB_CFG.fuse} с на раунд. Коснитесь машиной соперника — бомба перейдёт к нему, но ${BOMB_CFG.back} с её нельзя вернуть. У кого она взорвётся, тот проиграл раунд. С бомбой машина быстрее на ${Math.round(BOMB_CFG.speed * 100)}%, копится нитро, стрелка показывает на соперника. Матч — до ${BOMB_CFG.wins} побед, следующий раунд бомба начинает у победителя.`; } },
  race: { name: 'Гонка · чекпоинты', tag: `Победителю +${RACE_REWARD} · чекпоинт +${RACE_CP_REWARD}`,
    get desc() {
      const c = raceCfg(playMap('race')), lm = c.spots.length ? ` Часть арок — у достопримечательностей (${c.spots.slice(0, 4).map(s => s.name).join(', ')} и других).` : '';
      return `По карте расставлены ${c.cps} больших светящихся арок.${lm} Проедьте их по порядку быстрее соперника — путь выбирайте сами. Стрелка вверху экрана показывает на следующую арку. За каждую арку +${RACE_CP_REWARD}, по дороге можно подбирать монеты (+1), за победу +${RACE_REWARD}. Трасса каждый раз новая.`;
    } },
};
function drawModePreview(cv, mode) {
  const ctx = cv.getContext('2d'), D = getData(playMap(mode)), S = cv.width, sc = S / (2 * D.mmExt);
  // вытянутая карта (mmExtZ < mmExt): картинка ниже квадрата, по центру по вертикали
  const extZ = D.mmExtZ ?? D.mmExt, oy = (D.mmExt - extZ) * sc;
  ctx.fillStyle = D.mmBg; ctx.fillRect(0, 0, S, S);
  ctx.drawImage(D.minimap, 0, oy, S, 2 * extZ * sc);
  ctx.fillStyle = 'rgba(8,12,18,.35)'; ctx.fillRect(0, 0, S, S);
  const P = (x, z) => [(D.mmExt - x) * sc, (extZ - z) * sc + oy];
  // картинка режима (зоны, погоня, монеты, трасса), поверх — значки мест
  const scene = () => {
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
    if (mode === 'bomb') {                           // погоня: две машины и бомба
      // концы погони — два места на дорогах в 60–200 м друг от друга (на «Побережье» куски дорог короче 20 м)
      const segs = D.roadSegs, a = segs[Math.floor(rng() * segs.length)];
      if (!a) return;
      const near = segs.filter(s => { const d = Math.hypot(s.x1 - a.x0, s.z1 - a.z0); return d > 60 && d < 200; });
      const b = near.length ? near[Math.floor(rng() * near.length)] : a;
      const [ax, ay] = P(a.x0, a.z0), [bx, by] = P(b.x1, b.z1), mx = (ax + bx) / 2 + (ay - by) * 0.25, my = (ay + by) / 2 + (bx - ax) * 0.25;
      ctx.strokeStyle = 'rgba(255,59,59,.8)'; ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(mx, my, bx, by); ctx.stroke(); ctx.setLineDash([]);
      for (const [x, y, col] of [[ax, ay, '#ff8a2a'], [bx, by, '#38c8ff']]) {
        ctx.fillStyle = col; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      ctx.font = '28px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('💣', ax, ay - 20);
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
    // пример трассы тем же выбором, что в заезде (Race.plan в js/race.js), но без постройки карты: вместо перекрёстков
    // графа — узлы раскладки (Город) или середины кусков дорог; места у достопримечательностей — их точки at
    const cfg = raceCfg(playMap('race'));
    const nodes = D.nodes ? D.nodes.filter(n => n.deg >= 2) : D.roadSegs.map(s => ({ x: (s.x0 + s.x1) / 2, z: (s.z0 + s.z1) / 2 }));
    const start = cfg.start || [-320, 38, 0], { pts } = Race.plan(cfg, nodes, cfg.spots.map(s => ({ x: s.at[0], z: s.at[1], spot: s })), start, rng);
    ctx.strokeStyle = 'rgba(53,255,160,.7)'; ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.moveTo(...P(start[0], start[1])); for (const n of pts) ctx.lineTo(...P(n.x, n.z)); ctx.stroke(); ctx.setLineDash([]);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    pts.forEach((n, i) => {
      const [x, y] = P(n.x, n.z), fin = i === pts.length - 1;
      ctx.fillStyle = fin ? '#ffd23a' : '#35ffa0'; ctx.strokeStyle = '#0b1a12'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.font = "bold 11px 'Rubik', sans-serif"; ctx.fillStyle = '#0b1a12'; ctx.fillText(fin ? 'F' : String(i + 1), x, y + 0.5);
      if (n.spot) { ctx.font = '16px sans-serif'; ctx.fillText(n.spot.icon, x, y - 18); }
    });
  };
  scene();
  if (D.mmMarks) drawMarks(ctx, D.mmMarks.map(m => { const [x, y] = P(m.x, m.z); return { x, y, r: Math.max(6, S / 34), icon: m.icon }; }));
}
function renderMaps() {
  const grid = $('mapGrid'), map = playMap('free');
  if (grid.dataset.built !== map + CAP_CFG.time + BOMB_CFG.fuse) {     // описание захвата зависит от CAP_CFG.time                // превью рисуются заново при смене карты
    grid.innerHTML = MODES.map(id => `
      <button class="mapcard" data-mode="${id}">
        <canvas width="240" height="240"></canvas>
        <div class="mname">${MODE_INFO[id].name}</div>
        <div class="msize">${MODE_INFO[id].tag}${playMap(id) !== map ? ` · только: ${MODE_MAPS[id].map(m => MAP_INFO[m].name).join(', ')}` : ''}</div>
      </button>`).join('');
    grid.style.setProperty('--n', MODES.length);
    // ошибка в одном превью не должна обрывать renderMaps(): иначе строки настроек ниже остаются пустыми
    grid.querySelectorAll('.mapcard').forEach(card => {
      try { drawModePreview(card.querySelector('canvas'), card.dataset.mode); } catch (e) { console.error(e); }
    });
    grid.dataset.built = map + CAP_CFG.time + BOMB_CFG.fuse;
  }
  grid.querySelectorAll('.mapcard').forEach(c => c.classList.toggle('on', c.dataset.mode === save.mode));
  $('modeDesc').textContent = MODE_INFO[save.mode] ? MODE_INFO[save.mode].desc : '';   // описание — одно, под карточками
  $('modeLine').innerHTML = `Карта: ${PLAY_MAPS.map(id =>
    `<button class="tsel ${id === map ? 'on' : ''}" data-map="${id}">${MAP_INFO[id].name}</button>`).join('')}
    <span class="thint">C</span> · ← / → — режим, Enter — старт`;
  renderJumps(map); renderTraffic(); renderTime(); renderWeather(); renderQuality(); renderAddr();
}
// таблица лучших прыжков выбранной карты (js/jumps.js)
function renderJumps(map) {
  const list = jumpTable(map);
  $('jumpLine').innerHTML = `Рекорды прыжков · ${MAP_INFO[map].name}: ` + (list.length
    ? list.map((e, i) => `<span class="jrec"><b>${i + 1}.</b> ${Math.round(e.d)} м <i class="pl${e.p + 1}">P${e.p + 1}</i> ${e.car}</span>`).join('')
    : `<span class="thint">пока нет — прыжок от ${JUMP.tiers[0][0]} м попадёт в таблицу</span>`);
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
// подписи адресов над домами «Ситжеса» — для отладки стиля города (js/maps/sitges/labels.js); строка — только на этой карте
function renderAddr() {
  const on = playMap(save.mode) === 'sitges';
  $('addrLine').classList.toggle('hidden', !on);
  if (!on) return;
  $('addrLine').innerHTML = `Адреса домов: ${[[false, 'Выкл'], [true, 'Вкл']].map(([v, label]) =>
    `<button class="tsel ${v === save.addr ? 'on' : ''}" data-addr="${v}">${label}</button>`).join('')}
    <span class="thint">L · и в заезде</span>`;
}
function setAddr(v) { save.addr = !!v; persist(); renderAddr(); }
// интенсивность трафика (на «Побережье» и «Ситжесе» — своё число машин, world.traffic)
function renderTraffic() {
  $('trafficLine').innerHTML = `Трафик: ${TRAFFIC_LEVELS.map(([id, label]) =>
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
  else if (t.dataset.i !== undefined) showCar(+t.dataset.p, +t.dataset.i);
  else if (t.dataset.buy !== undefined) buyCar(+t.dataset.buy);
  else if (t.dataset.paint !== undefined) pickPaint(+t.dataset.paint, t.dataset.c);
  else if (t.dataset.buypaint !== undefined) buyPaint(+t.dataset.buypaint);
  else if (t.dataset.spot !== undefined) cycleBadge(+t.dataset.spot, t.dataset.s);
});
$('mapGrid').addEventListener('click', e => { const c = e.target.closest('.mapcard'); if (c) selectMode(c.dataset.mode); });
$('mapGrid').addEventListener('dblclick', e => { const c = e.target.closest('.mapcard'); if (c) { selectMode(c.dataset.mode); startMatch(); } });
$('mPlay').onclick = openMaps;
$('mGarage').onclick = () => setState('garage');
$('mHelp').onclick = () => $('help').classList.remove('hidden');
$('hClose').onclick = () => $('help').classList.add('hidden');
$('mReset').onclick = () => {
  if (!confirm('Сбросить монеты, купленные машины, цвета и значки обоих игроков и рекорды прыжков?')) return;
  save = Object.assign(defaultSave(), { quality: save.quality }); persist();   // графику не сбрасываем — она уже применена
  browse[0] = browse[1] = 0; paintView[0] = paintView[1] = null; updatePodium(0); updatePodium(1); updateCoins(); toast('Прогресс сброшен');
};
$('gBack').onclick = () => setState('menu');
$('gPlay').onclick = () => { if (!$('gPlay').disabled) openMaps(); };
$('mapsBack').onclick = () => setState('menu');
$('modeLine').addEventListener('click', e => { const b = e.target.closest('[data-map]'); if (b) selectMap(b.dataset.map); });
$('trafficLine').addEventListener('click', e => { const b = e.target.closest('[data-traffic]'); if (b) setTraffic(b.dataset.traffic); });
$('timeLine').addEventListener('click', e => { const b = e.target.closest('[data-tod]'); if (b) setTime(b.dataset.tod); });
$('weatherLine').addEventListener('click', e => { const b = e.target.closest('[data-rain]'); if (b) setWeather(b.dataset.rain === 'true'); });
$('addrLine').addEventListener('click', e => { const b = e.target.closest('[data-addr]'); if (b) setAddr(b.dataset.addr === 'true'); });
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
// Windows не присылает keyup того Shift, который отпустили первым, пока зажат второй (P1 держит левый — нитро,
// P2 правый — ручник): отпущенный так и оставался «нажатым». Любое событие клавиатуры, где Shift не зажат
// ни один (в том числе keyup последнего Shift), сбрасывает оба.
function syncShift(e) {
  if (!e.shiftKey) { keys.delete('ShiftLeft'); keys.delete('ShiftRight'); }
}
addEventListener('keydown', e => {
  if (BLOCK.has(e.code)) e.preventDefault();
  syncShift(e);
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
    else if (!paused && e.code === 'KeyF' && Fly.available()) Fly.toggle();      // свободный полёт (js/flycam.js)
    else if (Fly.on && e.code === 'KeyH') Fly.toggleHud();
    else if (Fly.on && (e.code === 'KeyR' || e.code === 'Enter' || e.code === 'NumpadEnter')) return;   // в полёте машину не трогаем
    else if (!paused && e.code === 'KeyR' && cars[0].drown <= 0) cars[0].toRoad();
    else if (e.code === 'KeyL' && world && world.id === 'sitges') { setAddr(!save.addr); toast(save.addr ? 'Адреса домов: вкл (L)' : 'Адреса домов: выкл (L)'); }
    else if (!paused && (e.code === 'Enter' || e.code === 'NumpadEnter')) {
      const c = cars[cars.length - 1];        // в одиночной езде Enter тоже возвращает машину Игрока 1
      if (c.drown <= 0) c.toRoad();
    }
  } else if (state === 'garage') {
    if (e.code === 'KeyA') browseCar(0, -1); else if (e.code === 'KeyD') browseCar(0, 1);
    else if (e.code === 'ArrowLeft') browseCar(1, -1); else if (e.code === 'ArrowRight') browseCar(1, 1);
    else if (e.code === 'KeyW') buyCar(0); else if (e.code === 'ArrowUp') buyCar(1);
    else if (e.code === 'KeyS') stepPaint(0); else if (e.code === 'ArrowDown') stepPaint(1);
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
    else if (e.code === 'KeyL' && playMap(save.mode) === 'sitges') setAddr(!save.addr);
    else if (e.code === 'Enter') startMatch();
    else if (e.code === 'Escape') setState('menu');
  } else if (state === 'menu') {
    if (e.code === 'Enter') openMaps();
  }
});
addEventListener('keyup', e => { keys.delete(e.code); syncShift(e); });
addEventListener('blur', () => keys.clear());
addEventListener('pointerdown', () => Sound.init());

