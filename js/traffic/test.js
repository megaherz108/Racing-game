// Проверка поведения трафика (для разработчика и ИИ-ассистента): await __game.trafficTest() — текстовый отчёт.
// Заезд на карте с графом трафика, все боты с физикой (Traffic.allNear). Сценарии «Побережья» (map 'coast', игроки
// отогнаны в угол карты):
//   serp     — боты всех типов по всему серпантину в обе стороны (шпильки R ≈ 8 м, каменный мост);
//   bridges  — по два бота перед каждым мостом с обеих сторон, по три — перед акведуком (едут по очереди);
//   village  — мотороллеры и фургончики на улочках, переулках и кольце пьяццы (рынок не сбивать);
//   soak     — обычное население на всю карту, долгий прогон.
// «Ситжес» (map 'sitges'; трафик там держится вокруг игроков — сценарии ставят ботов у нужных мест, игроки в углу):
//   old      — односторонки и узкие улицы (e.slow) старого города и центра;
//   unders   — подъезды к путепроводам под ж/д и мосты (крутые полосы и настилы), по два бота с каждой стороны;
//   rings    — кольца: по два бота на каждом въезде;
//   wide     — широкие дороги: автобусы и грузовики вперемешку с легковыми;
//   junction — светофор (−710, 282) и нерегулируемые перекрёстки с пробками 8.1 (Pompeu Fabra, Carretera de les Costes):
//              по три бота на каждом въезде и на въездах перед ними;
//   soak     — обычное население («Много») вокруг игроков, стоящих у дороги в двух местах, долгий прогон.
// «Город» (map 'city') — только soak (90 машин вокруг игроков, стоящих у дороги рядом со стартом).
// В каждом: наибольший уход с полосы (по видам дорог), расхождение высоты с поверхностью (на мостах — с настилом),
// аварии без игроков (где и кто), самое долгое ожидание у перекрёстка и стояние (где и кто), машины, застрявшие
// насовсем (стоят до конца прогона), проезды перекрёстков (на красный — отдельно), встречные на узком участке,
// сбитые прилавки.
// Определяет: trafficTest.
// Использует: world (js/maps/registry.js); cars, FIXED, simTime, PH, GROUND_GROUPS, stepWorld (js/physics.js); tPieceAt, tPieceProject,
//   tPieceIdx (js/traffic/graph.js); Traffic (js/traffic/traffic.js); startMatch, countdown, endMatch (js/match.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const TRAFFIC_TEST_SCEN = {
  coast: ['serp', 'bridges', 'village', 'soak'],
  sitges: ['old', 'unders', 'rings', 'wide', 'junction', 'soak'],
  city: ['soak'],
};

// keep — не выходить из заезда после проверки (посмотреть состояние ботов в консоли)
async function trafficTest({ map = 'coast', scen = TRAFFIC_TEST_SCEN[map] || ['soak'], seconds = 90, soak = 180, keep = false } = {}) {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const lines = [], errors = [];
  cars = []; startMatch('free', map);
  for (let i = 0; i < 200 && !cars.length; i++) await wait(20);
  if (!cars.length) return 'заезд не запустился';
  countdown = 0;
  const cfg = world.traffic, types0 = cfg && cfg.types;
  try {
    // игроки — в угол карты, подальше от дорог: не мешают и не участвуют в «уступи дорогу» (в городе трафик
    // держится вокруг игроков — там они стоят на старте)
    // запас ботов на все сценарии: перезапуск трафика с 24 машинами (в городе — обычные 90 вокруг игроков,
    // из сценариев имеет смысл только soak). «Ситжес» — 40 (запас ×2 — трафик вокруг игроков), автобусов и
    // грузовиков впятеро чаще обычного: сценарию широких дорог их нужно с десяток
    const city = !cfg;
    if (city) Traffic.start(world, 90, 'mid');
    else {
      if (map === 'sitges') cfg.types = types0.map(t => t.long ? Object.assign({}, t, { w: t.w * 5 }) : t);
      cfg.count.__test = map === 'sitges' ? 40 : 24; Traffic.start(world, 0, '__test');
    }
    if (!Traffic.graph) return 'на карте нет трафика';
    Traffic.allNear = !city;
    const G = Traffic.graph, E = G.edges, T = Traffic.list, R0 = G.report;
    if (R0) lines.push(`Граф: ${R0.nodes} узлов, ${R0.edges} полос, ${R0.laneKm} км, связность ${R0.components === 1 ? 'полная' : R0.components + ' частей: ' + R0.outside.join(', ')}` +
      (G.sitges ? (R0.turns ? `; поворотов ${R0.turns.n}: запасная кривая ${R0.turns.curved}, задевают тротуар ${R0.turns.curb} (дом или столб ${R0.turns.obj}), разворотов на другую проезжую часть ${R0.turns.ban}, длинным нельзя ${R0.turns.noLong}` : '') : `; объезд препятствий: ${R0.shifted.join(', ') || 'нигде'}; препятствия на полосах: ${R0.blocked.join('; ') || 'нет'}`));
    const nm = e => !e ? '?' : e.road ? e.road.id : (e.name || e.cls || '?');
    const xz = o => `(${o.x | 0}, ${o.z | 0})`;
    // крутая полоса — подъезд к путепроводу или мосту («Ситжес»): уклон по высоте полосы hy на 10 м больше 8 %
    for (const e of E) if (e.hy && e.__steep === undefined) {
      const P = e.lp[0]; e.__steep = false;
      for (let i = 0, j = 0; i < P.pts.length && !e.__steep; i++) {
        while (j < P.pts.length - 1 && P.cum[j] - P.cum[i] < 10) j++;
        if (P.cum[j] - P.cum[i] >= 9 && Math.abs(e.hy[j] - e.hy[i]) / (P.cum[j] - P.cum[i]) > 0.08) e.__steep = true;
      }
    }
    // вид дороги под ботом (для ухода с полосы и высоты): «Побережье» — e.kind, «Ситжес» — по свойствам ребра
    const kindOf = tc => tc.kind === 'turn' ? (tc.node && tc.node.round ? 'кольцо' : 'перекрёсток') : tc.e.kind ||
      (!G.sitges ? 'улица' : tc.e.span && tc.s > tc.e.span.s0 - 2 && tc.s < tc.e.span.s1 + 2 ? 'мост' : tc.e.__steep ? 'спуск' :
        tc.e.slow ? 'узкая' : !tc.e.rev ? 'односторонка' : 'улица');
    const brokenNow = () => (world.breakables || []).flatMap(B => B.items.filter(it => it.broken));

    // свободный бот типа id: '*' — любой не длинный (случайный тип), 'long' — автобус или грузовик
    const free = id => {
      const ok = T.filter(t => t.dead && !t.lead && !t.__used && (id === '*' ? !t.type.long : id === 'long' ? t.type.long : t.type.id === id));
      return ok.length ? ok[Math.floor(Math.random() * ok.length)] : null;
    };
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
    // место для игрока у дороги: не ближе 9 м к полосам, не в воде, не в доме и не на предмете
    const nearPt = (e, x, z, r) => {
      const P = e.lp[0].pts;
      for (let i = 1; i < P.length; i++) {
        const a = P[i - 1], b = P[i], dx = b[0] - a[0], dz = b[1] - a[1], u = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1), 0, 1);
        if ((a[0] + dx * u - x) ** 2 + (a[1] + dz * u - z) ** 2 < r * r) return true;
      }
      return false;
    };
    const park = (x0, z0, not) => {
      for (let r = 0; r < 600; r += 6) for (let a = 0; a < 6.28; a += 0.5) {
        const x = x0 + Math.cos(a) * r, z = z0 + Math.sin(a) * r, y = world.ground(x, z);
        if (not && Math.hypot(x - not[0], z - not[1]) < 7) continue;
        if (y < waterLevel(x, z) + 0.3 || world.occludes && (world.occludes(x, y + 1, z) || world.occludes(x, y + 2.5, z))) continue;
        if (world.grid && world.grid.query(x - 3, x + 3, z - 3, z + 3).length) continue;
        if (E.some(e => nearPt(e, x, z, 9))) continue;
        return [x, z];
      }
      return [x0, z0];
    };
    // игроки — в угол карты, подальше от дорог: не мешают и не участвуют в «уступи дорогу» (в городе трафик
    // держится вокруг игроков — там они стоят у дороги рядом со стартом; у «Ситжеса» угол бывает в море — ближайшее
    // место у дороги)
    const corner = () => {
      const X = (world.boundsX || world.bounds) - 15, Z = (world.boundsZ || world.bounds) - 15;
      let p0 = null;
      cars.forEach((c, k) => { const p = G.sitges ? park(X, Z, p0) : [X - k * 10, Z]; p0 = p; c.fullReset(p[0], p[1], 0); });
    };
    if (cfg) corner();
    const narrows = [...new Set(E.filter(e => e.narrow).map(e => e.narrow))];

    const run = async (name, setup, secs, opt = {}) => {
      for (const t of T) { Traffic.kill(t); t.__used = false; }
      Traffic.global = !opt.ring;                              // вне soak «Ситжеса» далёкие от игроков не исчезают
      const placed = setup().filter(Boolean);
      Traffic.count = Traffic.target = opt.ring ? opt.ring : placed.length;
      const broken0 = brokenNow();
      const dev = {}, dy = {}, wrecks = [], over = { v: 0 }, worstY = { d: 0 }, worstD = { d: 0 }, trail = { dev: 0, dy: 0, n: 0 };
      let maxWait = 0, waitAt = '', maxStuck = 0, stuckAt = '', narrowBad = 0, ghost = 0, spanDy = 0, spanN = 0;
      let passes = 0, sigPass = 0, redRun = 0, redAt = '', maxStill = 0, stillAt = '';
      const was = new Map(), still = new Map(), prevKind = new Map(), moved = [];
      // почему стоит: ждёт, впереди машина или — хочет ехать (tc.v), а тело стоит — во что упёрся (контакты Rapier)
      const touching = tc => {
        const r = [];
        PH.rw.contactPairsWith(tc.collider, o => {
          const f = PH.info.get(o.handle) || { kind: '?' };
          if (f.kind === 'ground' || (f.kind === 'deck' && o.collisionGroups() === GROUND_GROUPS)) return;
          const t = o.translation();
          const v = o.shapeType() === 6 && o.shape && o.shape.vertices, nv = v ? v.length / 3 : 0;
          r.push(f.tc ? `${f.tc.type.id} ${f.tc.kind}${f.tc.wreck ? ' разбит' : ''} ${xz(f.tc)}` : `${f.kind} (форма ${o.shapeType()}${nv ? ', вершин ' + nv + ', группы ' + o.collisionGroups().toString(16) : ''}, ${t.x.toFixed(0)}, ${t.y.toFixed(1)}, ${t.z.toFixed(0)})`);
        });
        return r.join(', ');
      };
      const why = tc => {
        if (tc.waiting) return tc.e.B.sig || (tc.ne.B.sig && tc.ne.len < TRAFFIC_SIG_SHORT) ? 'светофор' : tc.isLeft ? 'налево, ждёт' : 'ждёт у перекрёстка';
        if (tc.obsBy) return 'впереди ' + (tc.obsBy.type ? `${tc.obsBy.type.id} ${tc.obsBy.kind} ${xz(tc.obsBy)}` : 'игрок');
        const lv = tc.far ? null : tc.body.linvel();
        if (lv && tc.v > 0.3 && Math.hypot(lv.x, lv.z) < 0.3) return `хочет ${tc.v.toFixed(1)} м/с, упёрся: ${touching(tc) || 'ни во что'}`;
        return `v ${tc.v.toFixed(1)}, s ${tc.s.toFixed(1)} из ${tc.piece.len.toFixed(1)}, касается: ${(!tc.far && touching(tc)) || '—'}`;
      };
      const where = tc => `${tc.type.id} ${tc.kind} ${nm(tc.e)}→${nm(tc.ne)} ${xz(tc)}`;
      const steps = Math.round(secs / FIXED);
      for (let i = 0; i < steps; i++) {
        stepWorld(FIXED);
        if (i % 4) continue;
        const t = i * FIXED;
        for (const m of narrows) {
          const dirs = new Set(T.filter(t => !t.dead && !t.wreck && t.kind === 'lane' && t.e.narrow === m).map(t => t.e.dir));
          if (dirs.size > 1) narrowBad++;
        }
        for (const tc of T) {
          if (tc.dead) { was.delete(tc); still.delete(tc); prevKind.delete(tc); continue; }
          if (tc.wreck) {
            // кто и где: сам (полоса или поворот, куда) и второй (tc.whyBy — машина трафика, в которую ударился)
            const o = tc.whyBy, st = t => `${t.kind} ${nm(t.e)}→${nm(t.ne)} v ${t.v.toFixed(1)}${t.waiting ? ' ждал' : ''}`;
            if (!was.get(tc) && !tc.lead) wrecks.push(`${tc.type.id} на ${nm(tc.e)} ${xz(tc)} — ${tc.why || '?'} (${st(tc)}${o && o.e ? '; ' + o.type.id + ' ' + st(o) : ''})`);
            was.set(tc, true); continue;
          }
          was.set(tc, false);
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
          // проезд перекрёстка: въехал в поворот; у светофора — на красный ли
          const pk = prevKind.get(tc);
          if (pk === 'lane' && tc.kind === 'turn' && tc.node && (tc.node.deg || tc.node.out.length) > 2) {
            passes++;
            const B = tc.node;
            if (B.sig && tc.e.grp >= 0) {
              sigPass++;
              // на красный — красный горит уже 0,7 с (въехавший в первые доли секунды не успевал остановиться)
              if (B.sig.phase(tc.e.grp, simTime) === 'r' && B.sig.phase(tc.e.grp, simTime - 0.7) === 'r') {
                let k = 1; while (k < 60 && B.sig.phase(tc.e.grp, simTime - k * 0.1) === 'r') k++;
                redRun++; redAt = `${tc.type.id} ${nm(tc.e)} ${xz(tc)}, красный ${(k * 0.1).toFixed(1)} с, v ${tc.v.toFixed(1)}${tc.goYellow ? ', решил на жёлтый' : ''}`;
              }
            }
          }
          prevKind.set(tc, tc.kind);
          // стояние: сколько бот не сдвигается дальше 1,5 м (по любой причине); прыжок дальше 15 м — его переставили
          let st = still.get(tc);
          if (st && (tc.x - st.x) ** 2 + (tc.z - st.z) ** 2 > 225) {
            if (t - st.t0 > 40) moved.push(`${where(tc)} — простоял ${(t - st.t0).toFixed(0)} с, переставлен`);
            st = null;
          }
          if (!st || (tc.x - st.x) ** 2 + (tc.z - st.z) ** 2 > 2.25) still.set(tc, st = { x: tc.x, z: tc.z, t0: t });
          if (t - st.t0 > maxStill) { maxStill = t - st.t0; stillAt = `${where(tc)}, ${why(tc)}`; }
          st.tc = tc;
          if (tc.far) continue;                                // без физики (в городе — вдали от игроков)
          const b = tc.body.translation(), kind = kindOf(tc);
          const [, d] = tPieceProject(tc.piece, b.x, b.z, tc.s);
          dev[kind] = Math.max(dev[kind] || 0, d);
          const gy = world.surface(b.x, b.z, b.y + 1.5), ey = Math.abs(b.y - gy);
          dy[kind] = Math.max(dy[kind] || 0, ey);
          if (ey > worstY.d) Object.assign(worstY, { d: ey, at: `${tc.type.id} ${tc.kind} ${nm(tc.e)} s ${tc.s.toFixed(0)} (${b.x.toFixed(1)}, ${b.z.toFixed(1)}) y ${b.y.toFixed(2)}, поверхность ${gy.toFixed(2)}` });
          if (d > worstD.d) Object.assign(worstD, { d, at: `${tc.type.id} ${tc.kind} ${nm(tc.e)}→${nm(tc.ne)} (${b.x.toFixed(0)}, ${b.z.toFixed(0)}) v ${tc.v.toFixed(1)}` });
          if (tc.kind === 'lane' && tc.e.span && tc.s > tc.e.span.s0 && tc.s < tc.e.span.s1) { spanDy = Math.max(spanDy, ey); spanN++; }
          if (tc.kind === 'lane' && tc.e.vprof) {
            const vp = tc.e.vprof[tPieceIdx(tc.piece, tc.s)];
            if (tc.v - vp > over.v) Object.assign(over, { v: tc.v - vp, at: `${tc.type.id} ${tc.v.toFixed(1)} при пределе ${vp.toFixed(1)} м/с` });
          }
          if (tc.waitT > maxWait) { maxWait = tc.waitT; waitAt = `${where(tc)}, ${why(tc)}`; }
          if (tc.stuckT > maxStuck) { maxStuck = tc.stuckT; stuckAt = `${where(tc)}, ${why(tc)}`; }
          if (tc.ghostT > 1.99) ghost++;
        }
        if (i % 2000 === 0) await wait(0);
      }
      // застрявшие насовсем: стоят на месте последние 60 с прогона (или половину короткого)
      const tEnd = steps * FIXED, lim = Math.min(60, secs / 2);
      const stuck = [...still.values()].filter(s => !s.tc.dead && !s.tc.wreck && tEnd - s.t0 > lim).map(s => `${where(s.tc)} ${(tEnd - s.t0).toFixed(0)} с, ${why(s.tc)}`);
      const f = o => Object.entries(o).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(', ');
      const knockedNew = brokenNow().filter(it => !broken0.includes(it)), knocked = knockedNew.length;
      const knockedAt = knockedNew.map(it => `(${it.x.toFixed(1)}, ${it.z.toFixed(1)})`).join(' ');
      lines.push(`${name}: ${placed.length} ботов, ${secs} с` +
        `\n  уход с полосы, м: ${f(dev)}` + (worstD.d > 1 ? ` — больше всех: ${worstD.at}` : '') +
        `\n  высота над/под поверхностью, м: ${f(dy)}` + (spanN ? `; на пролётах мостов ${spanDy.toFixed(2)} (${spanN} замеров)` : '') +
        (worstY.d > 0.3 ? ` — больше всех: ${worstY.at}` : '') +
        (trail.n ? `\n  тележка трактора: уход с полосы ${trail.dev.toFixed(2)} м, высота ${trail.dy.toFixed(2)} м (${trail.n} замеров)` : '') +
        `\n  аварии без игроков: ${wrecks.length ? wrecks.join('; ') : 'нет'}` +
        `\n  дольше всех ждал у перекрёстка ${maxWait.toFixed(1)} с${maxWait > 10 ? ' (' + waitAt + ')' : ''}, стоял в пробке ${maxStuck.toFixed(1)} с${maxStuck > 15 ? ' (' + stuckAt + ')' : ''}, «призраков» ${ghost}` +
        `\n  дольше всех стоял на месте ${maxStill.toFixed(0)} с${maxStill > 20 ? ' (' + stillAt + ')' : ''}; застряли насовсем: ${stuck.length || moved.length ? [...stuck, ...moved].join('; ') : 'нет'}` +
        `\n  проездов перекрёстков ${passes}` + (sigPass ? `, через светофор ${sigPass}, из них на красный ${redRun}${redRun ? ' (' + redAt + ')' : ''}` : '') +
        (narrows.length || knocked ? `\n  встречные на узком участке: ${narrowBad ? narrowBad + ' замеров' : 'нет'}; сбито прилавков/ящиков: ${knocked}${knocked ? ' ' + knockedAt : ''}` : '') +
        (over.v > 0.5 ? `\n  быстрее предела в повороте: ${over.at}` : ''));
    };

    const along = (e, step, types, from = 10) => { const r = []; let k = 0; for (let s = from; s < e.len - 5; s += step) r.push(put(types[k++ % types.length], e, s)); return r; };
    const roadEdges = id => E.filter(e => e.road && e.road.id === id);
    const intoNode = (n, not) => E.filter(e => e.B === n && e !== not && !e.narrow);

    /* ---------- «Побережье» ---------- */
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

    /* ---------- «Ситжес» ---------- */
    const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    // боты у конца полосы (ждут перекрёстка): k штук через 14 м от стоп-линии
    const queue = (e, k, id = '*') => Array.from({ length: k }, (_, j) => put(id, e, e.len - 6 - j * 14));
    if (scen.includes('old')) await run('Старый город и центр (односторонки, узкие)', () =>
      shuffle(E.filter(e => (e.slow || !e.rev) && !e.B.round && nearPt(e, -350, 60, 450))).slice(0, 40).flatMap(e => along(e, 30, ['*'], 4).slice(0, 2)), seconds);
    if (scen.includes('unders')) await run('Путепроводы и мосты (подъезды)', () => {
      const r = [];
      for (const e of shuffle(E.filter(e => e.span || e.__steep))) r.push(put('*', e, 4), put('*', e, 22));
      return r;
    }, seconds);
    if (scen.includes('rings')) await run('Кольца', () => E.filter(e => e.B.round).flatMap(e => queue(e, 2)), seconds);
    if (scen.includes('wide')) await run('Широкие дороги (автобусы, грузовики)', () => {
      const r = [], W = shuffle(E.filter(e => !e.noLong && e.len > 40));
      for (const e of W) r.push(put('long', e, 8));
      for (const e of W) r.push(put('*', e, e.len / 2 + 10));
      return r;
    }, seconds);
    if (scen.includes('junction')) await run('Перекрёстки: светофор (−710, 282), Pompeu Fabra, Carretera de les Costes', () => {
      const r = [], spots = [[-710, 282], [-837, 122], [-749, 224], [-788, 205]];
      for (const [x, z] of spots) {
        let n = null, bd = 40;
        for (const m of G.nodes) { const d = Math.hypot(m.x - x, m.z - z); if (d < bd && (m.deg || 0) > 2) { bd = d; n = m; } }
        if (!n) continue;
        for (const e of E.filter(e => e.B === n)) {
          r.push(...queue(e, 3));
          for (const a of E.filter(a => a.B === e.A && a !== e.rev)) r.push(...queue(a, 1));
        }
      }
      return r;
    }, seconds);

    // долгий прогон: «Побережье» — 15 машин на всю карту; «Город» — 90 вокруг игроков; «Ситжес» — «Много»
    // вокруг игроков, поставленных у дороги (не ближе 9 м к полосам, не в доме) в двух районах по soak / 2 с
    if (scen.includes('soak')) {
      if (G.sitges) {
        for (const [x, z, where] of [[-730, 230, 'запад: светофор и Carretera de les Costes'], [-250, 80, 'центр']]) {
          const p0 = park(x, z), p1 = park(x, z, p0);
          await run(`Долгий прогон, ${where}`, () => {
            cars[0].fullReset(p0[0], p0[1], 0); cars[1] && cars[1].fullReset(p1[0], p1[1], 0);
            stepWorld(FIXED);
            const r = [], n = cfg.count.high;
            for (const t of T) if (r.length < n && t.dead && !t.lead && Traffic.respawn(t, 30, Traffic.ring.max)) r.push(t);
            return r;
          }, soak / 2, { ring: cfg.count.high });
        }
        corner();
      } else await run('Долгий прогон', () => {
        const r = [];
        // «Город»: игроки — у дороги рядом со стартом (стоя на старте, они запирали перекрёсток)
        if (city) { const p0 = park(cars[0].x, cars[0].z), p1 = park(p0[0], p0[1], p0); cars[0].fullReset(p0[0], p0[1], 0); cars[1] && cars[1].fullReset(p1[0], p1[1], 0); stepWorld(FIXED); }
        for (const t of T) if (r.length < (city ? 90 : 15) && t.dead && !t.lead && !(t.type.max && r.filter(o => o.type === t.type).length >= t.type.max)) { if (city ? Traffic.respawn(t, 30, 380) : Traffic.respawn(t, 0, 1e9)) r.push(t); }
        return r;
      }, soak, { ring: city ? 90 : 0 });
    }
  } catch (e) {
    errors.push((e.stack || String(e)).split('\n').slice(0, 3).join(' ← '));
  } finally {
    Traffic.allNear = false;
    if (cfg) { delete cfg.count.__test; cfg.types = types0; }
    if (cars.length && !keep) endMatch('menu');
  }
  return lines.join('\n') + (errors.length ? '\nОШИБКИ:\n' + errors.join('\n') : '');
}
Object.assign(window.__game, { trafficTest });
