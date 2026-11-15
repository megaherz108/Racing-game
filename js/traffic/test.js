// Проверка поведения трафика (для разработчика и ИИ-ассистента): await __game.trafficTest() — текстовый отчёт.
// Заезд на карте с графом трафика, игроки отогнаны в угол карты, все боты с физикой (Traffic.allNear). Сценарии:
//   serp     — боты всех типов по всему серпантину в обе стороны (шпильки R ≈ 8 м, каменный мост);
//   bridges  — по два бота перед каждым мостом с обеих сторон, по три — перед акведуком (едут по очереди);
//   village  — мотороллеры и фургончики на улочках, переулках и кольце пьяццы (рынок не сбивать);
//   soak     — обычное население на всю карту, долгий прогон.
// В каждом: наибольший уход с полосы (по видам дорог), расхождение высоты с поверхностью (на мостах — с настилом),
// аварии без игроков (где и кто), самое долгое ожидание/стояние, встречные на узком участке, сбитые прилавки.
// Определяет: trafficTest.
// Использует: world (js/maps/registry.js); cars, FIXED, stepWorld (js/physics.js); tPieceAt, tPieceProject, tPieceIdx
//   (js/traffic/graph.js); Traffic (js/traffic/traffic.js); startMatch, countdown, endMatch (js/match.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

// keep — не выходить из заезда после проверки (посмотреть состояние ботов в консоли)
async function trafficTest({ map = 'coast', scen = ['serp', 'bridges', 'village', 'soak'], seconds = 90, soak = 180, keep = false } = {}) {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const lines = [], errors = [];
  cars = []; startMatch('free', map);
  for (let i = 0; i < 200 && !cars.length; i++) await wait(20);
  if (!cars.length) return 'заезд не запустился';
  countdown = 0;
  try {
    if (!Traffic.graph) return 'на карте нет трафика';
    // игроки — в угол карты, подальше от дорог: не мешают и не участвуют в «уступи дорогу» (в городе трафик
    // держится вокруг игроков — там они стоят на старте)
    if (world.traffic) cars.forEach((c, k) => c.fullReset((world.boundsX || world.bounds) - 15 - k * 10, (world.boundsZ || world.bounds) - 15, 0));
    // запас ботов на все сценарии: перезапуск трафика с 24 машинами (в городе — обычные 90 вокруг игроков,
    // из сценариев имеет смысл только soak)
    const city = !world.traffic;
    if (city) Traffic.start(world, 90, 'mid');
    else { world.traffic.count.__test = 24; Traffic.start(world, 0, '__test'); }
    Traffic.allNear = !city;
    const G = Traffic.graph, E = G.edges, T = Traffic.list;
    if (G.report) lines.push(`Граф: ${G.report.nodes} узлов, ${G.report.edges} полос, ${G.report.laneKm} км, связность ${G.report.components === 1 ? 'полная' : G.report.components + ' частей: ' + G.report.outside.join(', ')}; ` +
      `объезд препятствий: ${G.report.shifted.join(', ') || 'нигде'}; препятствия на полосах: ${G.report.blocked.join('; ') || 'нет'}`);
    const free = id => T.find(t => t.dead && t.type.id === id && !t.__used);
    const brokenNow = () => (world.breakables || []).reduce((n, B) => n + B.items.filter(it => it.broken).length, 0);

    // поставить бота типа id на ребро e в s м (если место занято другим ботом ближе 12 м — пропуск)
    const put = (id, e, s) => {
      const tc = free(id); if (!tc) return null;
      s = Math.max(0, Math.min(s, e.lp[0].len - 3));
      if (e.noLong && tc.type.long || tc.W > (e.maxW || 99)) return null;
      tPieceAt(e.lp[0], s, _tp);
      if (T.some(o => !o.dead && (o.x - _tp[0]) ** 2 + (o.z - _tp[1]) ** 2 < 144)) return null;
      tc.__used = true; Traffic.place(tc, e, 0, s, false);
      return tc;
    };

    const run = async (name, setup, secs) => {
      for (const t of T) { Traffic.kill(t); t.__used = false; }
      const placed = setup().filter(Boolean);
      Traffic.count = Traffic.target = placed.length;
      const broken0 = brokenNow();
      const dev = {}, dy = {}, wrecks = [], over = { v: 0 }, worstY = { d: 0 }, worstD = { d: 0 }, trail = { dev: 0, dy: 0, n: 0 };
      let maxWait = 0, maxStuck = 0, stuckAt = '', narrowBad = 0, ghost = 0, spanDy = 0, spanN = 0;
      const was = new Map();
      const steps = Math.round(secs / FIXED);
      for (let i = 0; i < steps; i++) {
        stepWorld(FIXED);
        if (i % 4) continue;
        for (const m of new Set(E.filter(e => e.narrow).map(e => e.narrow))) {
          const dirs = new Set(T.filter(t => !t.dead && !t.wreck && t.kind === 'lane' && t.e.narrow === m).map(t => t.e.dir));
          if (dirs.size > 1) narrowBad++;
        }
        for (const tc of T) {
          if (tc.dead) { was.delete(tc); continue; }
          if (tc.wreck) {
            if (!was.get(tc) && !tc.lead) wrecks.push(`${tc.type.id} на ${tc.e && tc.e.road ? tc.e.road.id : '?'} (${tc.x | 0}, ${tc.z | 0}) — ${tc.why || '?'}`);
            was.set(tc, true); continue;
          }
          was.set(tc, false);
          if (tc.far) continue;                                // без физики (в городе — вдали от игроков)
          if (tc.lead) {
            // тележка: насколько её ось уходит с полосы тягача (на прямой полосе, когда вся сцепка на ней) и высота
            const L = tc.lead, b = tc.body.translation();
            if (L.kind === 'lane' && L.s > 12 && !tc.far) {
              const [, d] = tPieceProject(L.piece, b.x, b.z, L.s - 7);
              trail.dev = Math.max(trail.dev, d);
              trail.dy = Math.max(trail.dy, Math.abs(b.y - world.surface(b.x, b.z, b.y + 1.5)));
              trail.n++;
            }
            continue;
          }
          const b = tc.body.translation(), kind = tc.kind === 'turn' ? 'перекрёсток' : tc.e.kind || 'улица';
          const [, d] = tPieceProject(tc.piece, b.x, b.z, tc.s);
          dev[kind] = Math.max(dev[kind] || 0, d);
          const gy = world.surface(b.x, b.z, b.y + 1.5), ey = Math.abs(b.y - gy);
          dy[kind] = Math.max(dy[kind] || 0, ey);
          if (ey > worstY.d) Object.assign(worstY, { d: ey, at: `${tc.type.id} ${tc.kind} ${tc.e.road ? tc.e.road.id : ''} s ${tc.s.toFixed(0)} (${b.x.toFixed(1)}, ${b.z.toFixed(1)}) y ${b.y.toFixed(2)}, поверхность ${gy.toFixed(2)}` });
          if (d > worstD.d) Object.assign(worstD, { d, at: `${tc.type.id} ${tc.kind} ${tc.e.road ? tc.e.road.id : ''}→${tc.ne && tc.ne.road ? tc.ne.road.id : ''} (${b.x.toFixed(0)}, ${b.z.toFixed(0)}) v ${tc.v.toFixed(1)}` });
          if (tc.kind === 'lane' && tc.e.span && tc.s > tc.e.span.s0 && tc.s < tc.e.span.s1) { spanDy = Math.max(spanDy, ey); spanN++; }
          if (tc.kind === 'lane' && tc.e.vprof) {
            const vp = tc.e.vprof[tPieceIdx(tc.piece, tc.s)];
            if (tc.v - vp > over.v) Object.assign(over, { v: tc.v - vp, at: `${tc.type.id} ${tc.v.toFixed(1)} при пределе ${vp.toFixed(1)} м/с` });
          }
          maxWait = Math.max(maxWait, tc.waitT);
          if (tc.stuckT > maxStuck) { maxStuck = tc.stuckT; stuckAt = `${tc.type.id} ${tc.kind} ${tc.e.road ? tc.e.road.id : ''}→${tc.ne && tc.ne.road ? tc.ne.road.id : ''} (${tc.x | 0}, ${tc.z | 0}), впереди ${tc.obsBy ? (tc.obsBy.type ? tc.obsBy.type.id + ' ' + tc.obsBy.kind : 'игрок') : '—'}`; }
          if (tc.ghostT > 1.99) ghost++;
        }
        if (i % 2000 === 0) await wait(0);
      }
      const f = o => Object.entries(o).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(', ');
      const knocked = brokenNow() - broken0;
      const knockedAt = (world.breakables || []).flatMap(B => B.items.filter(it => it.broken).map(it => `(${it.x.toFixed(1)}, ${it.z.toFixed(1)})`)).join(' ');
      lines.push(`${name}: ${placed.length} ботов, ${secs} с` +
        `\n  уход с полосы, м: ${f(dev)}` + (worstD.d > 1 ? ` — больше всех: ${worstD.at}` : '') +
        `\n  высота над/под поверхностью, м: ${f(dy)}` + (spanN ? `; на пролётах мостов ${spanDy.toFixed(2)} (${spanN} замеров)` : '') +
        (worstY.d > 0.3 ? ` — больше всех: ${worstY.at}` : '') +
        (trail.n ? `\n  тележка трактора: уход с полосы ${trail.dev.toFixed(2)} м, высота ${trail.dy.toFixed(2)} м (${trail.n} замеров)` : '') +
        `\n  аварии без игроков: ${wrecks.length ? wrecks.join('; ') : 'нет'}` +
        `\n  дольше всех ждал у перекрёстка ${maxWait.toFixed(1)} с, стоял в пробке ${maxStuck.toFixed(1)} с${maxStuck > 15 ? ' (' + stuckAt + ')' : ''}, «призраков» ${ghost}` +
        `\n  встречные на узком участке: ${narrowBad ? narrowBad + ' замеров' : 'нет'}; сбито прилавков/ящиков: ${knocked}${knocked ? ' ' + knockedAt : ''}` +
        (over.v > 0.5 ? `\n  быстрее предела в повороте: ${over.at}` : ''));
    };

    const along = (e, step, types, from = 10) => { const r = []; let k = 0; for (let s = from; s < e.len - 5; s += step) r.push(put(types[k++ % types.length], e, s)); return r; };
    const roadEdges = id => E.filter(e => e.road && e.road.id === id);
    const intoNode = (n, not) => E.filter(e => e.B === n && e !== not && !e.narrow);

    if (city) scen = scen.filter(s => s === 'soak');
    if (scen.includes('serp')) await run('Серпантин', () => roadEdges('serp').flatMap(e => along(e, 230, ['scooter', 'ape', 'tractor', 'ape'])), seconds);
    if (scen.includes('bridges')) await run('Мосты', () => {
      const r = [];
      for (const e of E) if (e.span && !e.narrow) r.push(put('ape', e, e.span.s0 - 45), put('scooter', e, e.span.s0 - 80), put('tractor', e, e.span.s0 - 120));
      for (const e of E) if (e.narrow) for (const a of intoNode(e.A, e.rev)) r.push(...['scooter', 'ape', 'scooter'].map((id, k) => put(id, a, a.len - 25 - k * 25)));
      return r;
    }, seconds);
    if (scen.includes('village')) await run('Деревня', () => [
      ...E.filter(e => e.kind === 'cobble').flatMap(e => along(e, 40, ['scooter', 'ape'], 3)),
      ...roadEdges('ring').flatMap(e => along(e, 150, ['ape', 'scooter'])),
    ], seconds);
    if (scen.includes('soak')) await run('Долгий прогон', () => {
      const r = [];
      for (const t of T) if (r.length < (city ? 90 : 15) && t.dead && !t.lead && !(t.type.max && r.filter(o => o.type === t.type).length >= t.type.max)) { if (city ? Traffic.respawn(t, 30, 380) : Traffic.respawn(t, 0, 1e9)) r.push(t); }
      return r;
    }, soak);
  } catch (e) {
    errors.push((e.stack || String(e)).split('\n').slice(0, 3).join(' ← '));
  } finally {
    Traffic.allNear = false;
    if (world.traffic) delete world.traffic.count.__test;
    if (cars.length && !keep) endMatch('menu');
  }
  return lines.join('\n') + (errors.length ? '\nОШИБКИ:\n' + errors.join('\n') : '');
}
Object.assign(window.__game, { trafficTest });
