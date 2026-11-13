// Трафик — водитель-бот: дополняет объект Traffic (js/traffic/traffic.js) методами вождения.
// enterEdge/enterTurn — маршрут по полосам и выбор поворота; blocked, conflicts, oncoming, exitBlocked — кто кому
//   уступает; scanAhead — дистанция до машин и игроков впереди; preStep(dt) — скорость и поворот перед шагом физики.
// Определяет: Traffic.enterEdge, Traffic.enterTurn, Traffic.blocked, Traffic.conflicts, Traffic.oncoming,
//   Traffic.exitBlocked, Traffic.scanAhead, Traffic.checkFlat, Traffic.preStep.
// Использует: clamp (js/core.js); angLerp (js/world.js); cars, simTime (js/physics.js); tPiece, lanePoint, turnPiece,
//   tPieceAt, tPieceProject, trafficLight (js/traffic/graph.js); Traffic, TRAFFIC_NEAR, TRAFFIC_FAR
//   (js/traffic/traffic.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

Object.assign(Traffic, {

  // въезд на полосу: строим участок и сразу выбираем, куда повернём на следующем перекрёстке
  enterEdge(tc, e, l, s) {
    tc.e = e; tc.l = l; tc.kind = 'lane'; tc.s = s; tc.goYellow = false;
    tc.piece = tPiece([lanePoint(e, l, e.s0), lanePoint(e, l, e.s1)]);
    let opts = e.B.out.filter(o => o.B !== e.A);
    if (!opts.length) opts = e.B.out;                         // тупик — разворот
    // автобусы и грузовики не заезжают на кольцевые развязки: длинный кузов задевает островок
    if (tc.L > 6) { const o2 = opts.filter(o => !o.B.round); if (o2.length) opts = o2; }
    let total = 0;
    const ws = opts.map(o => { const st = Math.abs(e.fx * o.fz - e.fz * o.fx) < 0.1; const w = st ? 3 : 1.5; total += w; return w; });
    let r = Math.random() * total, ne = opts[0];
    for (let i = 0; i < opts.length; i++) { if (r < ws[i]) { ne = opts[i]; break; } r -= ws[i]; }
    const cr = e.fx * ne.fz - e.fz * ne.fx, dot = e.fx * ne.fx + e.fz * ne.fz;
    // правый поворот — в крайнюю правую полосу, левый — в ближнюю к центру, прямо — в ту же
    tc.ne = ne; tc.nl = ne.lanes.length === 1 ? 0 : cr > 0.5 ? 1 : cr < -0.5 ? 0 : Math.min(l, 1);
    tc.turnV = e.B.round ? 6.5 : dot < -0.9 ? 4 : cr > 0.5 ? 5.5 : cr < -0.5 ? 7.5 : 99;
    tc.isLeft = !e.B.round && cr < -0.5 && dot > -0.9;
  },

  enterTurn(tc, s) {
    const node = tc.e.B;
    tc.kind = 'turn'; tc.s = s; tc.piece = turnPiece(tc.e, tc.l, tc.ne, tc.nl);
    tc.node = node; node.occ.add(tc);
  },

  // перекрёсток без светофора занят поперечным потоком (на кольце — любым другим въездом)
  blocked(tc) {
    const n = tc.e.B;
    if (n.out.length <= 2) return false;
    for (const o of n.occ) if (o !== tc && !o.wreck && this.conflicts(tc, o)) return true;
    // очерёдность: кто долго ждёт на поперечном въезде, того пропускаем (иначе плотный поток
    // по главной навсегда запирает второстепенную дорогу)
    if (!n.lit) for (const o of this.nearby(n.x, n.z))
      if (o.waitT > 5 && o.waitT > tc.waitT && o !== tc && !o.dead && !o.wreck && o.kind === 'lane' && o.e.B === n && this.conflicts(tc, o)) return true;
    return false;
  },
  // пути двух машин через перекрёсток пересекаются: поперечный поток; встречный, если кто-то
  // из двоих поворачивает налево; на кольце — любые разные въезды
  conflicts(tc, o) {
    if (tc.e.B.round) return o.e !== tc.e;
    const opp = o.e.fx * tc.e.fx + o.e.fz * tc.e.fz < -0.9;
    return o.e.axis !== tc.e.axis || (opp && (o.isLeft || tc.isLeft));
  },

  // поворот налево уступает встречным, которые едут прямо или направо
  oncoming(tc) {
    const B = tc.e.B;
    for (const o of this.nearby(B.x, B.z, 2)) {
      if (o === tc || o.dead || o.wreck || o.isLeft || o.e.fx * tc.e.fx + o.e.fz * tc.e.fz > -0.9) continue;
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
    const P = tc.kind === 'turn' ? tc.piece : null;
    let ex = 0, ez = 0, efx = 0, efz = 0;
    if (P) { const a = P.pts[P.pts.length - 2], b = P.pts[P.pts.length - 1]; ex = b[0]; ez = b[1]; efx = tc.ne.fx; efz = tc.ne.fz; }
    const test = (o, ox, oz, ohw, ohl) => {
      if (Math.abs(o.y - tc.y) > 3) return;           // на другом уровне: под эстакадой или на ней
      const dx = ox - tc.x, dz = oz - tc.z;
      let fwd = dx * fx + dz * fz, lat;
      if (P ? dx * dx + dz * dz > 45 * 45 : fwd <= 0 || fwd > 40) return;
      if (P) {
        let bs = -1, bd = Infinity;
        for (let k = 1; k < P.pts.length; k++) {
          if (P.cum[k] < tc.s) continue;
          const a = P.pts[k - 1], b = P.pts[k], sx = b[0] - a[0], sz = b[1] - a[1], L2 = sx * sx + sz * sz || 1;
          const u = clamp(((ox - a[0]) * sx + (oz - a[1]) * sz) / L2, 0, 1), d = (a[0] + sx * u - ox) ** 2 + (a[1] + sz * u - oz) ** 2;
          if (d < bd) { bd = d; bs = P.cum[k - 1] + Math.sqrt(L2) * u; }
        }
        if (bs < 0) return;
        const ax = ox - ex, az = oz - ez, past = ax * efx + az * efz;
        if (bs >= P.len - 0.01 && past > 0) { fwd = P.len - tc.s + past; lat = ax * efz - az * efx; }   // за перекрёстком — по выездной полосе
        else { fwd = bs - tc.s; lat = Math.sqrt(bd); if (fwd <= 0) return; }
      } else lat = dx * fz - dz * fx;
      if (Math.abs(lat) < tc.W / 2 + ohw + 0.4 && fwd - tc.L / 2 - ohl < best) { best = fwd - tc.L / 2 - ohl; by = o; }
    };
    if (!(tc.ghostT > 0)) for (const o of this.nearby(tc.x, tc.z)) if (o !== tc && !o.dead) test(o, o.x, o.z, o.W / 2, (o.L + o.W) / 4);
    for (const c of cars) test(c, c.x, c.z, c.W / 2, (c.L + c.W) / 4);
    tc.obsBy = by;
    return best;
  },

  // Ровный ли участок маршрута бота: высота поверхности через каждые 3 м вдоль участка (на уровне, где бот сейчас).
  // Ровный — tc.flatY = высота, иначе null (мосты, пандусы эстакады, холмы). Проверяется раз на участок.
  checkFlat(tc) {
    const p = tc.piece, w = this.world;
    tc.flatOf = p; tc.flatY = null;
    if (tc.kind === 'lane' && tc.e.bridge) return;
    let lo = Infinity, hi = -Infinity;
    for (let s = 0; ; s += 3) {
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
    const w = this.world;
    dt *= 2;                                                  // каждый бот управляется через шаг (60 Гц)
    this.buildHash();
    for (const tc of this.list) {
      if (tc.dead || tc.wreck || (tc.tick ^= 1)) continue;
      const b = tc.body, far = tc.far;
      if (!far) { const t = b.translation(); tc.x = t.x; tc.z = t.z; tc.y = t.y; }
      // продвижение по участку маршрута — по фактическому положению тела
      let [s, dev] = tPieceProject(tc.piece, tc.x, tc.z, tc.s);
      if (dev > 4.5 && !far) { this.wreck(tc); continue; }   // машину вытолкнули с полосы — потеряла управление
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
        const B = tc.e.B;
        let stop = false;
        if (B.lit) {
          const st = trafficLight(B.x, B.z, tc.e.axis, simTime);
          // на жёлтый едет, только если уже не успевает остановиться
          if (st === 'g') tc.goYellow = false;
          else if (st === 'y' && !tc.goYellow && dEnd < tc.v * tc.v / 10 + 2) tc.goYellow = true;
          stop = st === 'r' && !tc.goYellow || st === 'y' && !tc.goYellow;
        }
        if (!stop && dEnd < 12) stop = this.blocked(tc) || (tc.isLeft && this.oncoming(tc)) || (B.out.length > 2 && this.exitBlocked(tc));
        if (stop) vT = Math.min(vT, dEnd < 0.6 ? 0 : Math.sqrt(2 * 6 * (dEnd - 0.5)));
        tc.waiting = stop;
        tc.waitT = stop && !B.lit && dEnd < 3 ? tc.waitT + dt : 0;    // сколько стоит первым у нерегулируемого перекрёстка
        // подъезжая, заранее занимаем перекрёсток — иначе две машины с разных сторон въедут одновременно
        if (B.out.length > 2) {
          if (!stop && dEnd < 9 && !tc.node) { tc.node = B; B.occ.add(tc); }
          else if (stop && tc.node === B) { B.occ.delete(tc); tc.node = null; }
        }
      }
      if ((tc.scan = (tc.scan + 1) % 2) === 0) tc.obs = this.scanAhead(tc);
      vT = Math.min(vT, tc.obs < 3.5 ? 0 : Math.sqrt(2 * 7 * (tc.obs - 3.5)));
      tc.v = tc.v < vT ? Math.min(vT, tc.v + tc.accel * dt) : Math.max(vT, tc.v - 9 * dt);
      // взаимная блокировка (два бота упёрлись друг в друга) — ненадолго перестаёт замечать других ботов;
      // в очереди за стоящей машиной или игроком просто ждёт
      if (tc.v < 0.3 && !tc.waiting) tc.stuckT += dt; else tc.stuckT = 0;
      const ob = tc.obsBy;
      if (tc.stuckT > 5 && ob && ob.type && (ob.obsBy === tc || (ob.kind === 'turn' && ob.stuckT > 3))) { tc.ghostT = 2; tc.stuckT = 0; }
      if (tc.ghostT > 0) tc.ghostT -= dt;
      // руль: целимся в точку чуть впереди на маршруте
      tPieceAt(tc.piece, tc.s + 2.5 + tc.v * 0.25, _tp);
      let dx = _tp[0] - tc.x, dz = _tp[1] - tc.z;
      const dl = Math.hypot(dx, dz);
      if (dl > 0.3) { dx /= dl; dz /= dl; tc.h = angLerp(tc.h, Math.atan2(dx, dz), Math.min(1, dt * 8)); }
      else { dx = Math.sin(tc.h); dz = Math.cos(tc.h); }
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
      _tq.setFromEuler(_te.set(-Math.atan(slope), tc.h, 0));
      // физический LOD: вдали от обоих игроков бот едет без тела Rapier — просто по маршруту
      // (столкнуться там не с кем, а 180 живых тел заметно нагружают физику)
      let dmin = Infinity; for (const c of cars) dmin = Math.min(dmin, (c.x - tc.x) ** 2 + (c.z - tc.z) ** 2);
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
  },
});
