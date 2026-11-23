// Трафик — водитель-бот: дополняет объект Traffic (js/traffic/traffic.js) методами вождения.
// enterEdge/enterTurn — маршрут по полосам и выбор поворота; blocked, conflicts, oncoming, exitBlocked — кто кому
//   уступает; scanAhead — дистанция до машин и игроков впереди; preStep(dt) — скорость и поворот перед шагом физики.
// follow — прицеп за тягачом (трактриса: ось тележки тянется к сцепке).
// Определяет: Traffic.enterEdge, Traffic.enterTurn, Traffic.blocked, Traffic.giveWay, Traffic.roundYield,
//   Traffic.acquire, Traffic.release, Traffic.conflicts, Traffic.oncoming, Traffic.exitBlocked, Traffic.scanAhead,
//   Traffic.checkFlat, Traffic.preStep, Traffic.follow.
// Использует: clamp (js/core.js); angLerp (js/world.js); cars, simTime, qrot (js/physics.js); turnPiece, tPieceMinR,
//   tPieceIdx, tPieceAt, tPieceProject, trafficLight (js/traffic/graph.js); Traffic, TRAFFIC_NEAR, TRAFFIC_FAR
//   (js/traffic/traffic.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const TRAFFIC_SIG_SHORT = 15;         // полоса до светофора короче, м, — решать «ехать или стоять» у предыдущей стоп-линии

Object.assign(Traffic, {

  // въезд на полосу: строим участок и сразу выбираем, куда повернём на следующем перекрёстке
  enterEdge(tc, e, l, s) {
    tc.e = e; tc.l = l; tc.kind = 'lane'; tc.s = s; tc.goYellow = false; tc.stopT = 0; tc.stopDone = false;
    tc.piece = e.lp[l];
    if (e.narrow && tc.hold !== e.narrow) this.acquire(tc, e);
    // куда этой машине можно: не уже допустимой ширины (акведук) и не на брусчатку длинной машине (трактор)
    // и с прицепом — не в тупик: развернуться трактору с тележкой на узкой дороге негде
    const fits = o => tc.W <= (o.maxW || 99) && !(o.noLong && tc.type.long) && !(tc.trailer && o.B.dead);
    // повороты графа «Ситжеса» (e.turns): разворот на другую проезжую часть, поворот, где кузов задевает дом или столб,
    // и где их задевает автобус, — только если больше некуда
    const turnOk = o => { const T = e.turns && e.turns.get(o); return !T || !(T.ban || T.obj || (T.noLong && tc.type.long)); };
    const ahead = o => (e.rev ? o !== e.rev : o.B !== e.A) && fits(o);
    let opts = e.B.out.filter(o => ahead(o) && turnOk(o));
    if (!opts.length) opts = e.B.out.filter(ahead);
    if (!opts.length) opts = e.B.out.filter(fits);            // тупик или дальше не проехать — разворот
    if (!opts.length) opts = e.B.out;
    // автобусы и грузовики не заезжают на кольцевые развязки: длинный кузов задевает островок
    if (tc.L > 6) { const o2 = opts.filter(o => !o.B.round); if (o2.length) opts = o2; }
    let total = 0;
    const ws = opts.map(o => { const st = Math.abs(e.ex * o.iz - e.ez * o.ix) < 0.1; const w = st ? 3 : 1.5; total += w; return w; });
    let r = Math.random() * total, ne = opts[0];
    for (let i = 0; i < opts.length; i++) { if (r < ws[i]) { ne = opts[i]; break; } r -= ws[i]; }
    const cr = e.ex * ne.iz - e.ez * ne.ix, dot = e.ex * ne.ix + e.ez * ne.iz;
    // правый поворот — в крайнюю правую полосу, левый — в ближнюю к центру, прямо — в ту же
    tc.ne = ne; tc.nl = ne.lanes.length === 1 ? 0 : cr > 0.5 ? 1 : cr < -0.5 ? 0 : Math.min(l, 1);
    tc.turnV = e.B.round ? (e.B.roundV || 6.5) : dot < -0.9 ? 4 : cr > 0.5 ? 5.5 : cr < -0.5 ? 7.5 : 99;
    // кривая дорога (Побережье): дороги сходятся под любым углом — скорость в повороте по его наименьшему радиусу;
    // сразу за перекрёстком может быть поворот дороги
    // у графа «Ситжеса» кривая и радиус поворота выбраны заранее (e.turns: не задевает бордюр, без петли)
    tc.tp = null;
    if (ne.vprof) {
      const T = e.turns && e.turns.get(ne);
      tc.tp = T ? T.p : turnPiece(e, l, ne, tc.nl);
      tc.turnV = Math.min(tc.turnV, ne.vprof[0], Math.sqrt(2.2 * (T ? T.R : tPieceMinR(tc.tp))));
    }
    tc.isLeft = !e.B.round && cr < -0.5 && dot > -0.9;
  },

  enterTurn(tc, s) {
    const node = tc.e.B;
    if (tc.e.narrow) this.release(tc);                        // съехали с узкого участка — следующий может заезжать
    tc.kind = 'turn'; tc.s = s; tc.piece = tc.tp || turnPiece(tc.e, tc.l, tc.ne, tc.nl);
    tc.node = node; node.occ.add(tc);
  },

  // перекрёсток без светофора занят поперечным потоком (на кольце — любым другим въездом). Светофор «Ситжеса» (n.sig):
  // главной и второстепенной там нет — на зелёный ждём только тех, чей путь пересекает наш (conflicts)
  blocked(tc) {
    const n = tc.e.B;
    if ((n.deg || n.out.length) <= 2) return false;
    if (n.major && !n.sig) return n.round ? this.roundYield(tc, n) : this.giveWay(tc, n);
    for (const o of n.occ) if (o !== tc && !o.wreck && this.conflicts(tc, o)) return true;
    // очерёдность: кто долго ждёт на поперечном въезде, того пропускаем (иначе плотный поток
    // по главной навсегда запирает второстепенную дорогу)
    if (!n.lit && !n.sig) for (const o of this.nearby(n.x, n.z))
      if (o.waitT > 5 && o.waitT > tc.waitT && o !== tc && !o.dead && !o.wreck && o.kind === 'lane' && o.e.B === n && this.conflicts(tc, o)) return true;
    return false;
  },
  // перекрёсток Побережья (js/maps/coast/trafficnet.js): второстепенная дорога пропускает всех, кто уже на перекрёстке,
  // и тех, кто подъезжает по главной (≤ 4 с), в том числе игроков; главная уступает только въехавшим со второстепенной
  giveWay(tc, n) {
    // застрявшего в повороте (стоит или упёрся дольше 1,5 с) не ждём — иначе он ждёт нас, а мы его
    for (const o of n.occ) if (o !== tc && !o.wreck && o.e !== tc.e && (!tc.e.major || !o.e.major) && !(o.stuckT > 1.5) && !(o.pushT > 1.5)) return true;
    if (tc.e.major) return false;
    // стоящий в пробке на главной (stuckT) — не «подъезжает»: на сходящихся «игреком» улицах он стоит из-за нас самих
    // (наш нос у стоп-линии — на его полосе), и мы ждали бы друг друга вечно
    for (const o of this.nearby(n.x, n.z)) {
      if (o === tc || o.dead || o.wreck || o.kind !== 'lane' || o.e.B !== n || !o.e.major || o.stuckT > 1.5) continue;
      if (o.piece.len - o.s < Math.max(10, o.v * 4)) return true;
    }
    for (const c of cars) {
      const dx = n.x - c.x, dz = n.z - c.z, d = Math.hypot(dx, dz) || 1, v = ((c.vx || 0) * dx + (c.vz || 0) * dz) / d;
      if (d < 60 && v > 1.5 && (d < 10 || d / v < 4)) return true;
    }
    return false;
  },
  // кольцо на пьяцце (7 въездов): уступаем только тем, кто едет по кольцу к нашему въезду (по ходу угол убывает —
  // такие на 0…1,5 рад «выше» нас) или уже вливается рядом; занявшие соседний въезд ждут, только если они слева от нас
  // (выше по кольцу) — у двух соседних въездов уступает один, а не оба
  roundYield(tc, n) {
    const P = tc.piece.pts[tc.piece.pts.length - 1], ae = Math.atan2(P[1] - n.z, P[0] - n.x);
    for (const o of n.occ) {
      if (o === tc || o.wreck || o.e === tc.e || o.stuckT > 1.5 || o.pushT > 1.5) continue;
      const a = Math.atan2(o.z - n.z, o.x - n.x) - ae, d = Math.atan2(Math.sin(a), Math.cos(a));
      if (d < 1.5 && d > (o.kind === 'turn' ? -0.4 : 0.05)) return true;
    }
    return false;
  },
  // узкий участок (акведук): едут по очереди — пока на нём кто-то есть, заезжать можно только в ту же сторону
  acquire(tc, e) { const m = e.narrow; m.n++; m.dir = e.dir; tc.hold = m; },
  release(tc) { if (tc.hold) { tc.hold.n--; tc.hold = null; } },

  // пути двух машин через перекрёсток пересекаются: поперечный поток (у светофора «Ситжеса» — другая группа фаз
  // e.grp); встречный, если кто-то из двоих поворачивает налево; на кольце — любые разные въезды
  conflicts(tc, o) {
    if (tc.e.B.round) return o.e !== tc.e;
    const opp = o.e.ex * tc.e.ex + o.e.ez * tc.e.ez < -0.9;
    return (tc.e.B.sig ? o.e.grp !== tc.e.grp : o.e.axis !== tc.e.axis) || (opp && (o.isLeft || tc.isLeft));
  },

  // поворот налево уступает встречным, которые едут прямо или направо (застрявшего — стоит или упёрся дольше 1,5 с — не
  // ждём: он может стоять из-за нас)
  oncoming(tc) {
    const B = tc.e.B;
    for (const o of this.nearby(B.x, B.z, 2)) {
      if (o === tc || o.dead || o.wreck || o.lead || o.isLeft || o.e.ex * tc.e.ex + o.e.ez * tc.e.ez > -0.9 || o.stuckT > 1.5 || o.pushT > 1.5) continue;
      if (o.kind === 'lane' && o.e.B === B && o.piece.len - o.s < 45 && o.v > 0.5 && !o.waiting) return true;
      if (o.kind === 'turn' && o.node === B) return true;
    }
    return false;
  },

  // не въезжать на перекрёсток, если за ним нет места: выезд занят стоящей очередью
  // (иначе машина застрянет посреди перекрёстка и запрёт поперечный поток)
  exitBlocked(tc) {
    let need = tc.L + 2.5;
    const near = this.nearby(tc.e.B.x, tc.e.B.z);
    for (const o of near)
      if (o !== tc && !o.dead && !o.wreck && o.kind === 'turn' && o.ne === tc.ne && o.nl === tc.nl) need += o.L + 2.5;
    for (const o of near)
      if (o !== tc && !o.dead && !o.wreck && o.kind === 'lane' && o.e === tc.ne && o.l === tc.nl && o.v < 3 && o.s - o.L / 2 < need) return true;
    return false;
  },

  // ближайшее препятствие впереди (бот или игрок) по ходу движения
  scanAhead(tc) {
    const fx = Math.sin(tc.h), fz = Math.cos(tc.h);
    let best = Infinity, by = null;
    // на перекрёстке смотрим вдоль траектории поворота, а не по лучу: луч на дуге «задевает» машины,
    // стоящие у стоп-линий соседних полос, и бот замирает посреди перекрёстка
    // на кривых полосах Побережья — тоже вдоль полосы: луч на повороте видит встречных и стоящих на соседней дороге
    const P = tc.kind === 'turn' || tc.e.vprof ? tc.piece : null;
    // на полосе с выбранной кривой поворота («Ситжес», e.turns) — смотрим и вдоль неё
    const Q = tc.kind === 'lane' && tc.e.turns && tc.tp && tc.e.turns.has(tc.ne) ? tc.tp : null;
    let ex = 0, ez = 0, efx = 0, efz = 0;
    if (P) {
      const b = P.pts[P.pts.length - 1]; ex = b[0]; ez = b[1];
      if (tc.kind === 'turn') { efx = tc.ne.ix; efz = tc.ne.iz; } else { efx = tc.e.ex; efz = tc.e.ez; }
    }
    const test = (o, ox, oz, ohw, ohl) => {
      if (Math.abs(o.y - tc.y) > 3) return;           // на другом уровне: под эстакадой или на ней
      let ph = null;                                  // направление нашего пути у ближайшей к o точки
      const dx = ox - tc.x, dz = oz - tc.z;
      let fwd = dx * fx + dz * fz, lat;
      if (P ? dx * dx + dz * dz > 45 * 45 : fwd <= 0 || fwd > 40) return;
      if (P) {
        let bs = -1, bd = Infinity;
        for (let k = Math.max(1, tPieceIdx(P, tc.s)); k < P.pts.length; k++) {
          if (P.cum[k - 1] > tc.s + 45) break;
          const a = P.pts[k - 1], b = P.pts[k], sx = b[0] - a[0], sz = b[1] - a[1], L2 = sx * sx + sz * sz || 1;
          const u = clamp(((ox - a[0]) * sx + (oz - a[1]) * sz) / L2, 0, 1), d = (a[0] + sx * u - ox) ** 2 + (a[1] + sz * u - oz) ** 2;
          if (d < bd) { bd = d; bs = P.cum[k - 1] + Math.sqrt(L2) * u; ph = Math.atan2(sx, sz); }
        }
        if (bs < 0) return;
        const ax = ox - ex, az = oz - ez, past = ax * efx + az * efz;
        if (bs >= P.len - 0.01 && past > 0 && Q) {
          // за концом полосы — вдоль кривой поворота (на изломе улицы машина впереди уже повернула и стоит вбок от
          // продолжения полосы), за ней — по выездной полосе
          let qs = -1, qd = Infinity;
          for (let k = 1; k < Q.pts.length; k++) {
            const a = Q.pts[k - 1], b = Q.pts[k], sx = b[0] - a[0], sz = b[1] - a[1], L2 = sx * sx + sz * sz || 1;
            const u = clamp(((ox - a[0]) * sx + (oz - a[1]) * sz) / L2, 0, 1), d = (a[0] + sx * u - ox) ** 2 + (a[1] + sz * u - oz) ** 2;
            if (d < qd) { qd = d; qs = Q.cum[k - 1] + Math.sqrt(L2) * u; ph = Math.atan2(sx, sz); }
          }
          const qe = Q.pts[Q.pts.length - 1], bx = ox - qe[0], bz = oz - qe[1], past2 = bx * tc.ne.ix + bz * tc.ne.iz;
          if (qs >= Q.len - 0.01 && past2 > 0) { fwd = P.len - tc.s + Q.len + past2; lat = bx * tc.ne.iz - bz * tc.ne.ix; }
          else { fwd = P.len - tc.s + qs; lat = Math.sqrt(qd); }
        }
        else if (bs >= P.len - 0.01 && past > 0) { fwd = P.len - tc.s + past; lat = ax * efz - az * efx; }   // за перекрёстком — по выездной полосе
        else { fwd = bs - tc.s; lat = Math.sqrt(bd); if (fwd <= 0) return; }
      } else lat = dx * fz - dz * fx;
      // длинная машина (автобус, грузовик) стоит под углом к нашему пути: вбок она занимает |sin| · L/2 + |cos| · W/2,
      // а не W/2 (такси в повороте не видело автобус, ждущий у стоп-линии поперёк его пути)
      if (ph !== null && o.type && o.type.long) { const a = o.h - ph; ohw = Math.max(ohw, Math.abs(Math.sin(a)) * o.L / 2 + Math.abs(Math.cos(a)) * o.W / 2); }
      if (Math.abs(lat) < tc.W / 2 + ohw + 0.4 && fwd - tc.L / 2 - ohl < best) { best = fwd - tc.L / 2 - ohl; by = o; }
    };
    if (!(tc.ghostT > 0)) for (const o of this.nearby(tc.x, tc.z)) if (o !== tc && o !== tc.trailer && !o.dead) test(o, o.x, o.z, o.W / 2, (o.L + o.W) / 4);
    for (const c of cars) test(c, c.x, c.z, c.W / 2, (c.L + c.W) / 4);
    tc.obsBy = by;
    return best;
  },

  // Ровный ли участок маршрута бота: высота поверхности через каждые 1,5 м вдоль участка (на уровне, где бот сейчас;
  // реже — пропускает «стол» перехода «Ситжеса»: бот ехал сквозь него).
  // Ровный — tc.flatY = высота, иначе null (мосты, пандусы эстакады, холмы). Проверяется раз на участок.
  checkFlat(tc) {
    const p = tc.piece, w = this.world;
    tc.flatOf = p; tc.flatY = null;
    if (tc.kind === 'lane' && tc.e.bridge) return;
    let lo = Infinity, hi = -Infinity;
    for (let s = 0; ; s += 1.5) {
      tPieceAt(p, Math.min(s, p.len), _tp);
      const y = w.surface(_tp[0], _tp[1], tc.y + 1.5);
      if (y < lo) lo = y; if (y > hi) hi = y;
      if (hi - lo > 0.03) return;
      if (s >= p.len) break;
    }
    tc.flatY = (lo + hi) / 2;
  },

  preStep(dt) {
    if (!this.list.length) return;
    const w = this.world, dt1 = dt;
    dt *= 2;                                                  // каждый бот управляется через шаг (60 Гц)
    this.buildHash();
    for (const tc of this.list) {
      if (tc.lead || tc.dead || tc.wreck || (tc.tick ^= 1)) continue;
      const b = tc.body, far = tc.far;
      if (!far) {
        const t = b.translation(); tc.x = t.x; tc.z = t.z; tc.y = t.y;
        // хочет ехать, а тело стоит — упёрся во что-то неподвижное (сколько секунд; Traffic.postStep переставит)
        const lv = b.linvel();
        tc.pushT = tc.v > 0.5 && lv.x * lv.x + lv.z * lv.z < 0.06 ? (tc.pushT || 0) + dt : 0;
      }
      // продвижение по участку маршрута — по фактическому положению тела
      let [s, dev] = tPieceProject(tc.piece, tc.x, tc.z, tc.s);
      if (dev > 4.5 && !far) { this.wreck(tc, 'сошёл с полосы'); continue; }   // машину вытолкнули с полосы — потеряла управление
      tc.s = Math.max(tc.s, s);
      if (tc.s >= tc.piece.len - 0.05) {
        const over = tc.s - tc.piece.len;
        if (tc.kind === 'lane') this.enterTurn(tc, over);
        else { tc.node.occ.delete(tc); tc.node = null; this.enterEdge(tc, tc.ne, tc.nl, over); }
      }
      // целевая скорость
      const dEnd = tc.piece.len - tc.s;
      let vT = tc.vmax;
      if (tc.kind === 'turn') vT = Math.min(vT, tc.turnV);
      else {
        if (tc.turnV < 99) vT = Math.min(vT, Math.sqrt(tc.turnV * tc.turnV + 2 * 2.5 * dEnd));
        // до места остановки: машина встаёт центром у конца полосы (нос — в перекрёстке), длинная (автобус, грузовик) —
        // раньше на stopOff, носом примерно там же, где легковая: иначе полкузова стоит поперёк чужих поворотов
        const dS = dEnd - tc.stopOff;
        const B = tc.e.B, sig = B.sig && tc.e.grp >= 0;
        // светофор сразу за следующим перекрёстком («Ситжес»: полоса до него короче TRAFFIC_SIG_SHORT — на ней не
        // остановиться, машина въезжала на красный): ждём его зелёного у своей стоп-линии
        const ne = tc.ne, sig2 = !sig && !B.lit && ne.B.sig && ne.grp >= 0 && ne.len < TRAFFIC_SIG_SHORT;
        let stop = false;
        // светофор: «Город» — по оси улицы (trafficLight), «Ситжес» — по группе рукава (n.sig.phase, e.grp)
        if (B.lit || sig || sig2) {
          const st = sig ? B.sig.phase(tc.e.grp, simTime) : sig2 ? ne.B.sig.phase(ne.grp, simTime) : trafficLight(B.x, B.z, tc.e.axis, simTime);
          // на жёлтый едет, только если уже не успевает остановиться; на красный — только если не успевает и теперь
          // (решил ехать на жёлтый, но задержался за машиной или перекрёстком — к красному у стоп-линии стоит)
          if (st === 'g') tc.goYellow = false;
          else if (st === 'y' && !tc.goYellow && dS < tc.v * tc.v / 10 + 2) tc.goYellow = true;
          stop = st === 'r' ? !(tc.goYellow && dS < tc.v * tc.v / 18 + 0.5) : st === 'y' && !tc.goYellow;
        }
        // знак STOP («Ситжес», e.sign): полная остановка у линии (стоим 0,8 с), дальше — как второстепенная (уступить)
        if (!stop && tc.e.sign === 'stop' && !tc.stopDone) {
          stop = true;
          if (dS < 1.5 && tc.v < 0.3 && (tc.stopT += dt) > 0.8) tc.stopDone = true;
        }
        const deg = B.deg || B.out.length;
        if (!stop && dS < 12) stop = this.blocked(tc) || (tc.isLeft && this.oncoming(tc)) || (deg > 2 && this.exitBlocked(tc));
        // узкий участок впереди: занят встречными — ждём, свободен — занимаем заранее
        const nr = ne.narrow;
        if (!stop && nr && tc.hold !== nr && dEnd < 15) { if (nr.n && nr.dir !== tc.ne.dir) stop = true; else this.acquire(tc, tc.ne); }
        // кривая полоса: предельная скорость в повороте (с запасом на торможение — js/maps/coast/trafficnet.js)
        if (tc.e.vprof) vT = Math.min(vT, tc.e.vprof[tPieceIdx(tc.piece, tc.s + 1)]);
        if (stop) vT = Math.min(vT, dS < 0.6 ? 0 : Math.sqrt(2 * 6 * (dS - 0.5)));
        tc.waiting = stop;
        tc.waitT = stop && !B.lit && !sig && !sig2 && dS < 3 ? tc.waitT + dt : 0;    // сколько стоит первым у нерегулируемого перекрёстка
        // подъезжая, заранее занимаем перекрёсток — иначе две машины с разных сторон въедут одновременно
        if (deg > 2) {
          if (!stop && dS < 9 && !tc.node) { tc.node = B; B.occ.add(tc); }
          else if (stop && tc.node === B) { B.occ.delete(tc); tc.node = null; }
        }
      }
      // слабая машина (фургончик, трактор) в гору едет медленнее
      if (tc.type.climb && tc.slope > 0) vT = Math.min(vT, tc.vmax * Math.max(0.35, 1 - tc.type.climb * tc.slope));
      if ((tc.scan = (tc.scan + 1) % 2) === 0) tc.obs = this.scanAhead(tc);
      vT = Math.min(vT, tc.obs < 3.5 ? 0 : Math.sqrt(2 * 7 * (tc.obs - 3.5)));
      tc.v = tc.v < vT ? Math.min(vT, tc.v + tc.accel * dt) : Math.max(vT, tc.v - 9 * dt);
      // взаимная блокировка (два бота упёрлись друг в друга) — ненадолго перестаёт замечать других ботов;
      // в очереди за стоящей машиной или игроком просто ждёт
      if (tc.v < 0.3 && !tc.waiting) tc.stuckT += dt; else tc.stuckT = 0;
      const ob = tc.obsBy;
      if (tc.stuckT > 5 && ob && ob.type && (ob.obsBy === tc || (ob.kind === 'turn' && ob.stuckT > 3))) { tc.ghostT = 2; tc.stuckT = 0; }
      if (tc.ghostT > 0) tc.ghostT -= dt;
      // руль: целимся в точку чуть впереди на маршруте. На кривых дорогах Побережья — ближе: дальняя точка
      // в шпильке (R ≈ 8 м) срезает поворот почти на метр, на встречную
      const coast = tc.e.vprof;
      tPieceAt(tc.piece, tc.s + (coast ? 1.4 + tc.v * 0.18 : 2.5 + tc.v * 0.25), _tp);
      let dx = _tp[0] - tc.x, dz = _tp[1] - tc.z;
      const dl = Math.hypot(dx, dz);
      const h0 = tc.h;
      if (dl > 0.3) { dx /= dl; dz /= dl; tc.h = angLerp(tc.h, Math.atan2(dx, dz), Math.min(1, dt * 8)); }
      else { dx = Math.sin(tc.h); dz = Math.cos(tc.h); }
      // мотороллер наклоняется в повороте: tg крена = боковое ускорение / g
      if (tc.type.lean) {
        const yaw = Math.atan2(Math.sin(tc.h - h0), Math.cos(tc.h - h0)) / dt;
        tc.roll += (clamp(-Math.atan(tc.v * yaw / 9.8), -0.5, 0.5) - tc.roll) * Math.min(1, dt * 6);
      }
      // наклон по рельефу (горбатые мосты). На ровном участке (обычная улица) высота одна на весь участок —
      // рельеф не опрашиваем: три вызова surface() на бота были третью всей работы водителей
      if (tc.flatOf !== tc.piece) this.checkFlat(tc);
      const flat = tc.flatY !== null;
      let slope = 0;
      if (!flat) {
        const fx = Math.sin(tc.h), fz = Math.cos(tc.h), hl = tc.L * 0.4;
        const yF = w.surface(tc.x + fx * hl, tc.z + fz * hl, tc.y + 1.5), yB = w.surface(tc.x - fx * hl, tc.z - fz * hl, tc.y + 1.5);
        slope = (yF - yB) / (hl * 2);
      }
      tc.slope = slope;
      _tq.setFromEuler(_te.set(-Math.atan(slope), tc.h, tc.roll || 0));
      // физический LOD: вдали от обоих игроков бот едет без тела Rapier — просто по маршруту
      // (столкнуться там не с кем, а 180 живых тел заметно нагружают физику)
      let dmin = Infinity; for (const c of cars) dmin = Math.min(dmin, (c.x - tc.x) ** 2 + (c.z - tc.z) ** 2);
      if (this.allNear) dmin = 0;                              // проверка поведения (__game.trafficTest): все с физикой
      if (far) {
        tc.x += dx * tc.v * dt; tc.z += dz * tc.v * dt; tc.y = flat ? tc.flatY : w.surface(tc.x, tc.z, tc.y + 1.5);
        tc.q.copy(_tq);
        if (dmin < TRAFFIC_NEAR * TRAFFIC_NEAR) {
          tc.far = false; b.setEnabled(true);
          b.setTranslation({ x: tc.x, y: tc.y + 0.05, z: tc.z }, true);
          b.setRotation({ x: _tq.x, y: _tq.y, z: _tq.z, w: _tq.w }, true);
          b.setLinvel({ x: dx * tc.v, y: 0, z: dz * tc.v }, true); b.setAngvel({ x: 0, y: 0, z: 0 }, true);
        }
        continue;
      }
      if (dmin > TRAFFIC_FAR * TRAFFIC_FAR) { tc.far = true; tc.q.copy(_tq); b.setEnabled(false); continue; }
      // высота: тянемся к поверхности дороги (рельеф или настил моста) — с рельефом тело не сталкивается
      const gy = flat ? tc.flatY : w.surface(tc.x, tc.z, tc.y + 1.5);
      b.setRotation({ x: _tq.x, y: _tq.y, z: _tq.z, w: _tq.w }, true);
      b.setLinvel({ x: dx * tc.v, y: slope * tc.v + clamp((gy - tc.y) * 8, -12, 6), z: dz * tc.v }, true);
    }
    for (const tl of this.trailers) if (!tl.dead && !tl.wreck) this.follow(tl, dt1);
  },

  // прицеп: сцепка — позади тягача, ось тележки тянется к ней на длине дышла (bar) — в повороте тележка идёт
  // чуть внутрь, как настоящая. Скорость тела — к расчётному положению (с физикой: удары передаются честно)
  follow(tl, dt) {
    const L = tl.lead, T = tl.type, w = this.world;
    let lx = L.x, lz = L.z, fx = Math.sin(L.h), fz = Math.cos(L.h);
    if (!L.far) { const t = L.body.translation(); lx = t.x; lz = t.z; [fx, , fz] = qrot(L.body.rotation(), 0, 0, 1); const f = Math.hypot(fx, fz) || 1; fx /= f; fz /= f; }
    const hx = lx - fx * (L.L / 2 + T.gap), hz = lz - fz * (L.L / 2 + T.gap);
    let dx = hx - tl.ax, dz = hz - tl.az;
    const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
    tl.ax = hx - dx * T.bar; tl.az = hz - dz * T.bar;
    tl.h = Math.atan2(dx, dz);
    const x = tl.ax, z = tl.az, hl = tl.L * 0.4, hint = (L.far ? L.y : L.body.translation().y) + 1.5;
    const gy = w.surface(x, z, hint), slope = (w.surface(x + dx * hl, z + dz * hl, hint) - w.surface(x - dx * hl, z - dz * hl, hint)) / (hl * 2);
    _tq.setFromEuler(_te.set(-Math.atan(slope), tl.h, 0));
    const b = tl.body;
    if (L.far) {
      if (!tl.far) { tl.far = true; b.setEnabled(false); }
      tl.x = x; tl.z = z; tl.y = gy; tl.q.copy(_tq);
      return;
    }
    if (tl.far) {
      tl.far = false; b.setEnabled(true);
      b.setTranslation({ x, y: gy + 0.05, z }, true); b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
    const t = b.translation();
    tl.x = t.x; tl.z = t.z; tl.y = t.y;
    // тележку оттолкнули далеко от сцепки — сцепка сорвана, тягач с прицепом теряют управление
    if (Math.hypot(t.x - x, t.z - z) > 2.5) { this.wreck(tl, 'сорвало прицеп'); return; }
    b.setRotation({ x: _tq.x, y: _tq.y, z: _tq.z, w: _tq.w }, true);
    b.setLinvel({ x: clamp((x - t.x) / dt, -25, 25), y: clamp((gy - t.y) * 8, -12, 6), z: clamp((z - t.z) / dt, -25, 25) }, true);
  },
});
