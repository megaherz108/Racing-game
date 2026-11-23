// Ситжес — этап 7, группа B: разметка и знаки (план — docs/sitges/stage-7.md, архив группы — docs/sitges/st-b.md).
// Что входит (виды и числа — по кадрам Street View raw/photos/street/B, sv/slope; правила — st-b.md):
//   STOP (точки OSM stop): сплошная стоп-линия 0,4 м перед закруглением угла (у «зебры» — без линии, надпись перед ней),
//     надпись STOP в полосе за 2 м до линии, знак-восьмиугольник на столбе у бордюра справа;
//   «уступи дорогу» (give_way): прерывистая линия 0,4 м (штрих 0,8, промежуток 0,4), вытянутый треугольник-контур
//     в полосе, знак-треугольник на столбе справа;
//   лежачие «столы» (в OSM города — приподнятые «зебры»): часть «зебр» двусторонних жилых улиц вне старого города —
//     площадка 10 см под «зеброй» с пологими скатами и «зубами» на скатах; геометрия, сетка столкновений
//     (S.collider) и высота поверхности (S.walk); «30» в овале на асфальте — перед «столом» и у части «зебр»;
//   «въезд запрещён» — на выезде каждой односторонки на проезжую улицу, лицом к въезжающим, справа от них;
//   светофоры — только 2 точки OSM signals: столб справа у стоп-линии, «зебра» (если её нет), лампы переключаются.
//   Разметка — плоские меши квадратами 160 м (подъём и polygonOffset как у «зебр» roads3d.js), без столкновений;
//   знаки и светофоры — сбиваемые (S.place с o.brk). Случайности нет — только S.hash.
// Договор (docs/sitges/stage-7.md, «Каркас»):
//   plan(C, S) — раскладка (js/maps/sitges/street.js, группы по порядку A → G): места — помощники S (C.street),
//     занятое — S.reserve(…, 'B'); вернуть данные группы (только данные, без функций) → C.street.groups.B.
//   build(K, S, L) — постройка (js/maps/sitges/street3d.js): S — помощники постройки (K.st), L — данные из plan.
// Данные группы L: marks — [[вид, x, z, ux, uz, a, b]] (u — по ходу, a — поперёк, b — вдоль, м; виды stMarkKind),
//   tables — [[x, z, ux, uz, hw, len]] (центр, u — от перекрёстка в улицу, полуширина полотна, длина площадки),
//   signs — [[вид, x, z, ry]] (0 STOP, 1 «уступи», 2 «въезд запрещён»), signals — [[x, z, ry]], n — сводка.
// Помощники каркаса: S.axis / S.project — ось улицы (раскладка), S.walk / S.collider — поверхность и столкновения
//   «столов» (постройка); свой — stMarkAtlas() — атлас надписей и лиц знаков (canvas).
// Свои глобальные имена — с префиксом stMark… (после — node tools/deps.js --headers).
// Определяет: stMarkCfg, stMarkKind, stMarkSignal, stMarkAtlas, SITGES_ST_B.
// Использует: renderer (js/core.js); sitgesCells (js/maps/sitges/geom.js); SITGES_RB (js/maps/sitges/roads3d.js);
//   SITGES_ST3D (js/maps/sitges/street3d.js); simTime (js/physics.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const stMarkCfg = {
  lift: 0.012,             // над полотном (как «зебры»: SITGES_RB.lift.drive + 0.012)
  line: 0.4,               // стоп-линия и линия «уступи»: ширина, м (норма Испании M-4.1 / M-4.2)
  dash: [0.8, 0.4],        // линия «уступи»: штрих и промежуток
  edge: 0.25,              // конец линии не доходит до бордюра
  stop: [2.2, 2.4], stopGap: 2.0,   // надпись STOP: поперёк × вдоль (буквы ≈ 1,6 м), от линии до надписи
  gw: [1.2, 3.6], gwGap: 1.5, gwW: 0.22,   // треугольник «уступи»: основание × длина, от линии, толщина контура
  n30: [1.6, 2.6], n30Gap: 4,       // «30» в овале: поперёк × вдоль, от «стола» / «зебры»
  n30Share: 0.3, n30MinLen: 80,     // «30» у «зебр» без «стола»: доля и длина улицы не меньше
  table: { h: 0.10, ramp: 1.5, pad: 0.5, share: 0.25, minLen: 60, maxSlope: 0.08, tooth: 0.5, toothStep: 1.0 },
  sign: { off: 0.5, r: 0.3, back: 6, h: 2.3, skip: ['cross', 'zebra'] },   // от бордюра, занятость, сдвиг назад до, центр
  //   таблички; столб у края перехода не мешает (на фото знаки стоят прямо у «зебр»)
  far: 300, farTable: 500,          // разметка и «столы» видны не дальше, м
  cycle: [17, 3, 20],               // светофор: зелёный, жёлтый, красный, с
};
const stMarkKind = { line: 0, stop: 2, gw: 3, n30: 4, zebra: 5 };
// фаза светофора (визуал — здесь, водитель трафика — js/traffic/driver.js через n.sig.phase графа trafficnet.js):
// grp 0 — машины улицы, где стоит голова светофора, и встречные им: зелёный, жёлтый, красный (cycle); grp 1 —
// поперечные: зелёный, пока у группы 0 красный (секунда «все красные» с обеих сторон), жёлтый перед её зелёным.
// t — время симуляции (simTime), с → 'g' / 'y' / 'r'
function stMarkSignal(grp, t) {
  const [g, y, r] = stMarkCfg.cycle, per = g + y + r, c = (t % per + per) % per;
  if (!grp) return c < g ? 'g' : c < g + y ? 'y' : 'r';
  return c < g + y + 1 ? 'r' : c < per - y - 1 ? 'g' : c < per - 1 ? 'y' : 'r';
}

// атлас 1024 × 512: верхний ряд — надписи на асфальте (STOP, «30» в овале, белое), нижний — лица знаков (STOP,
// «уступи», «въезд запрещён»), серый (столб, оборот), тёмный (светофор). → { tex, cell: { имя: { u0, u1, v0, v1 } } }
function stMarkAtlas() {
  const W = 1024, H = 512, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d'), cell = {};
  const box = (name, cx, cy, cw, ch) => (cell[name] = { u0: cx / W, u1: (cx + cw) / W, v0: 1 - (cy + ch) / H, v1: 1 - cy / H, cx, cy, cw, ch });
  const poly = (b, n, th0, k) => {               // правильный многоугольник в клетке (как CircleGeometry: θ против часовой)
    x.beginPath();
    for (let i = 0; i < n; i++) {
      const th = th0 + i * 2 * Math.PI / n;
      x.lineTo(b.cx + b.cw * (0.5 + 0.5 * k * Math.cos(th)), b.cy + b.ch * (0.5 - 0.5 * k * Math.sin(th)));
    }
    x.closePath(); x.fill();
  };
  // надписи на асфальте (белые на прозрачном)
  x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
  let b = box('stop', 0, 0, 512, 256);
  x.font = 'bold 236px Arial, sans-serif';
  let w = x.measureText('STOP').width;
  x.save(); x.translate(256, 134); x.scale(Math.min(1, 470 / w), 1); x.fillText('STOP', 0, 0); x.restore();
  b = box('n30', 512, 0, 256, 256);
  x.strokeStyle = '#fff'; x.lineWidth = 22;
  x.beginPath(); x.ellipse(640, 128, 112, 116, 0, 0, Math.PI * 2); x.stroke();
  x.font = 'bold 150px Arial, sans-serif'; w = x.measureText('30').width;
  x.save(); x.translate(640, 134); x.scale(Math.min(1, 170 / w), 1); x.fillText('30', 0, 0); x.restore();
  box('white', 768, 0, 256, 256); x.fillRect(768, 0, 256, 256);
  // лица знаков
  b = box('fStop', 0, 256, 256, 256);
  x.fillStyle = '#f4f4f0'; poly(b, 8, Math.PI / 8, 1);
  x.fillStyle = '#c4161c'; poly(b, 8, Math.PI / 8, 0.9);
  x.fillStyle = '#f4f4f0'; x.font = 'bold 62px Arial, sans-serif'; x.fillText('STOP', 128, 386);
  b = box('fGw', 256, 256, 256, 256);
  x.fillStyle = '#c4161c'; poly(b, 3, -Math.PI / 2, 1);
  x.fillStyle = '#f4f4f0'; poly(b, 3, -Math.PI / 2, 0.66);
  b = box('fNo', 512, 256, 256, 256);
  x.fillStyle = '#f4f4f0'; x.beginPath(); x.arc(640, 384, 128, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#c4161c'; x.beginPath(); x.arc(640, 384, 120, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#f4f4f0'; x.fillRect(640 - 88, 384 - 20, 176, 40);
  box('gray', 768, 256, 128, 256); x.fillStyle = '#9ca1a4'; x.fillRect(768, 256, 128, 256);
  box('dark', 896, 256, 128, 256); x.fillStyle = '#2b2f30'; x.fillRect(896, 256, 128, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return { tex, cell };
}

const SITGES_ST_B = {
  id: 'B', name: 'разметка и знаки', ready: true,

  /* ==== раскладка ==== */
  plan(C, S) {
    const P = stMarkCfg, KD = stMarkKind, sIdx = new Map(C.streets.map((st, i) => [st, i]));
    const marks = [], tables = [], signs = [], signals = [], miss = [];   // miss — знаки без места: [вид, x, z]
    const n = { stop: 0, give_way: 0, noEntry: 0, tables: 0, n30: 0, signals: 0, signs: 0, skip: 0, noSign: 0 };
    const r2 = v => Math.round(v * 100) / 100;
    // знак (столб) у края полотна: side +1 — справа по ходу sgn, −1 — слева; лицо — по ходу (face = +1) или навстречу
    // на односторонке, если справа места нет, — слева (на фото так и бывает: 07 «уступи» слева)
    const signAt = (out, type, st, s, sgn, side0, face) => {
      for (const side of st.oneway ? [side0, -side0] : [side0]) for (let d = 0; d <= P.sign.back; d += 1) {
        const ss = s - sgn * d;
        if (ss < 0 || ss > st.len) break;
        const p = S.axis(st, ss), ux = p.tx * sgn, uz = p.tz * sgn, rx = -uz * side, rz = ux * side;
        const ex = p.x + rx * p.hw, ez = p.z + rz * p.hw;
        const cb = S.nearest('curbs', ex, ez, 1.5) || S.nearest('corners', ex, ez, 1.5);
        let x, z;
        if (cb && cb.seg.nx * rx + cb.seg.nz * rz > 0.3) { const q = S.at(cb.seg, cb.f, Math.min(P.sign.off, cb.seg.w0 * 0.6)); x = q.x; z = q.z; }
        else { x = ex + rx * 0.35; z = ez + rz * 0.35; }
        if (C.carriageAt(x, z) || C.houseAt(x, z) || !S.free(x, z, P.sign.r, P.sign.skip)) continue;
        S.reserve(x, z, P.sign.r, 'B');
        const ry = Math.atan2(face * ux, face * uz);
        out.push(type === null ? [r2(x), r2(z), r2(ry)] : [type, r2(x), r2(z), r2(ry)]);
        return true;
      }
      const p = S.axis(st, s);
      miss.push([type === null ? 3 : type, r2(p.x), r2(p.z)]);
      return false;
    };
    // перекрёсток по ходу sgn от s: начало чужой проезжей части на оси (если s уже в ней — назад до её края)
    const junction = (st, s0, sgn) => {
      const hit = s => { const p = S.axis(st, s); return C.carriageAt(p.x, p.z, st); };
      if (hit(s0)) {
        let s = s0;
        for (let k = 0; k < 60 && hit(s); k++) s -= sgn * 0.5;
        return s;
      }
      for (let d = 0.5; d <= 40; d += 0.5) {
        const s = s0 + sgn * d;
        if (s < 0 || s > st.len) return null;
        if (hit(s)) return s;
      }
      return null;
    };
    // точки касания дуг скруглённых углов на подходе к перекрёстку sJ: самая дальняя от него, м
    const tangent = (st, sJ, sgn) => {
      const p = S.axis(st, sJ), seen = new Set();
      let best = 0;
      for (const [dx, dz] of [[0, 0], [12, 0], [-12, 0], [0, 12], [0, -12]]) for (const c of C.cornersAt(p.x + dx, p.z + dz)) {
        if (seen.has(c) || Math.hypot(c.K[0] - p.x, c.K[1] - p.z) > 25) continue;
        seen.add(c);
        for (const X of [c.a, c.b]) if (X.st === st) { const d = sgn * (sJ - X.s); if (d > -1 && d < 15) best = Math.max(best, d); }
      }
      return best;
    };
    // «зебра» этой улицы у места s (по ходу sgn): длина s её края со стороны подхода или null
    const zebraAt = (st, s, sgn, back = 3, fwd = 8) => {
      const si = sIdx.get(st);
      for (const Zb of S.zebras) {
        if (Zb.si !== si) continue;
        const zs = S.project(st, Zb.x0 + Zb.zx * Zb.len / 2, Zb.z0 + Zb.zz * Zb.len / 2), dd = sgn * (zs - s);
        if (dd > -back && dd < fwd) return zs - sgn * Zb.len / 2;
      }
      return null;
    };
    const lane = (p, st) => st.oneway ? { c: 0, w: 2 * p.hw } : { c: p.hw / 2, w: p.hw };
    // надпись или линия в полосе: длина s центра, сдвиг вбок от середины полосы
    const glyph = (k, st, s, sgn, a, b, dc = 0) => {
      if (s < 0 || s > st.len) return false;
      const p = S.axis(st, s);
      if (p.deck) return false;
      const ux = p.tx * sgn, uz = p.tz * sgn, L = lane(p, st), lat = L.c + dc;
      marks.push([k, r2(p.x - uz * lat), r2(p.z + ux * lat), r2(ux), r2(uz), r2(a), r2(b)]);
      return true;
    };
    const lineAt = (st, s, sgn, dashed) => {
      const p = S.axis(st, s), W = lane(p, st).w - P.edge * (st.oneway ? 2 : 1);
      if (!dashed) return glyph(KD.line, st, s, sgn, W, P.line, st.oneway ? 0 : -P.edge / 2 + 0.1);
      const [dl, gl] = P.dash, k = Math.max(1, Math.floor((W + gl) / (dl + gl))), w0 = k * dl + (k - 1) * gl;
      for (let i = 0; i < k; i++) glyph(KD.line, st, s, sgn, dl, P.line, -w0 / 2 + dl / 2 + i * (dl + gl) + (st.oneway ? 0 : -P.edge / 2 + 0.1));
      return true;
    };

    /* ---------- STOP и «уступи дорогу» по точкам OSM ---------- */
    for (const kind of ['stop', 'give_way']) for (const [x, z, d] of (C.points && C.points[kind]) || []) {
      const c = C.carriageAt(x, z);
      if (!c || c.corner || !c.st.drive) { n.skip++; continue; }
      const st = c.st, s0 = S.project(st, x, z), p0 = S.axis(st, s0);
      if (p0.deck) { n.skip++; continue; }
      const sgn = d == null ? (st.oneway < 0 ? -1 : 1) : (Math.sin(d) * p0.tx + Math.cos(d) * p0.tz >= 0 ? 1 : -1);
      const sJ = junction(st, s0, sgn);
      let sLine = sJ === null ? s0 : sJ - sgn * (tangent(st, sJ, sgn) + 0.3 + P.line / 2);
      if (Math.abs(sLine - s0) > 25) sLine = s0;
      const ze = zebraAt(st, sLine, sgn);
      let line = true;
      if (ze !== null) { sLine = ze - sgn * (0.4 + P.line / 2); if (kind === 'stop') line = false; }   // у «зебры» STOP — без линии (фото 04)
      if (line) lineAt(st, sLine, sgn, kind === 'give_way');
      if (kind === 'stop') glyph(KD.stop, st, sLine - sgn * (P.line / 2 + P.stopGap + P.stop[1] / 2), sgn, P.stop[0], P.stop[1]);
      else glyph(KD.gw, st, sLine - sgn * (P.line / 2 + P.gwGap + P.gw[1] / 2), sgn, P.gw[0], P.gw[1]);
      n[kind]++;
      if (signAt(signs, kind === 'stop' ? 0 : 1, st, sLine, sgn, 1, -1)) n.signs++; else n.noSign++;
    }

    /* ---------- «въезд запрещён» на выезде односторонок ---------- */
    for (const st of C.streets) {
      if (!st.drive || !st.oneway || st.cls === 'service' || st.len < 20) continue;
      const sgn = st.oneway > 0 ? 1 : -1, sEnd = sgn > 0 ? st.len : 0, pE = S.axis(st, sEnd);
      if (pE.deck) continue;
      const o = C.carriageAt(pE.x, pE.z, st);
      if (!o || o.corner || !o.st.drive) continue;
      const sJ = junction(st, sEnd, sgn);
      if (sJ === null) continue;
      const s = sJ - sgn * (tangent(st, sJ, sgn) + 1.0);
      if (sgn * (s - (sEnd - sgn * st.len)) < 4) continue;
      if (signAt(signs, 2, st, s, sgn, -1, 1)) { n.noEntry++; n.signs++; } else n.noSign++;
    }

    /* ---------- светофоры (точки OSM signals) ---------- */
    for (const [x, z] of (C.points && C.points.signals) || []) {
      const c = C.carriageAt(x, z);
      if (!c || c.corner) { n.skip++; continue; }
      const st = c.st, sgn = st.oneway < 0 ? -1 : 1;
      let sc = S.project(st, x, z), bd = 12;
      for (const [cx, cz] of C.points.crossing || []) {          // переход OSM рядом на этой же улице
        const dd = Math.hypot(cx - x, cz - z), c2 = dd < bd && C.carriageAt(cx, cz);
        if (c2 && c2.st === st) { bd = dd; sc = S.project(st, cx, cz); }
      }
      const Z = SITGES_RB.zebra;
      let edge = zebraAt(st, sc, sgn, 4, 4);
      if (edge === null) {                                       // «зебры» нет — рисуем
        const p = S.axis(st, sc);
        marks.push([KD.zebra, r2(p.x), r2(p.z), r2(p.tx * sgn), r2(p.tz * sgn), r2(p.hw - 0.4), Z.len]);
        edge = sc - sgn * Z.len / 2;
      }
      const sLine = edge - sgn * (1.0 + P.line / 2);
      lineAt(st, sLine, sgn, false);
      if (signAt(signals, null, st, sLine, sgn, 1, -1)) n.signals++; else n.noSign++;
    }

    /* ---------- «столы» и «30» у «зебр» двусторонних жилых улиц ---------- */
    const T = P.table;
    for (const Zb of S.zebras) {
      const st = C.streets[Zb.si];
      if (st.cls !== 'residential' || st.oneway || st.len < T.minLen) continue;
      const cx = Zb.x0 + Zb.zx * Zb.len / 2, cz = Zb.z0 + Zb.zz * Zb.len / 2;
      if (S.oldTown(cx, cz)) continue;
      const s = S.project(st, cx, cz), p = S.axis(st, s);
      if (p.deck) continue;
      const sIn = Zb.zx * p.tx + Zb.zz * p.tz >= 0 ? 1 : -1;     // от перекрёстка в улицу
      // ровно ли под «столом»: уклон вдоль не круче maxSlope, излом (отклонение от прямой) не больше 8 см
      const len = Zb.len + 2 * T.pad, e = len / 2 + T.ramp + 1, gs = [-e, 0, e].map(a => C.ground(cx + Zb.zx * a, cz + Zb.zz * a));
      const even = Math.abs(gs[2] - gs[0]) / (2 * e) <= T.maxSlope && Math.abs(gs[1] - (gs[0] + gs[2]) / 2) <= 0.08;
      if (even && S.hash(cx, cz, 7) < T.share) {
        tables.push([r2(cx), r2(cz), r2(Zb.zx), r2(Zb.zz), r2(Zb.hw + 0.4), r2(len)]);
        n.tables++;
        if (glyph(KD.n30, st, s + sIn * (len / 2 + T.ramp + P.n30Gap + P.n30[1] / 2), -sIn, P.n30[0], P.n30[1])) n.n30++;
      } else if (st.len >= P.n30MinLen && S.hash(cx, cz, 8) < P.n30Share) {
        if (glyph(KD.n30, st, s + sIn * (Zb.len / 2 + P.n30Gap + P.n30[1] / 2), -sIn, P.n30[0], P.n30[1])) n.n30++;
      }
    }
    return { marks, tables, signs, signals, miss, n };
  },

  /* ==== постройка ==== */
  build(K, S, L) {
    const { D, rk } = K, g = D.ground, P = stMarkCfg, KD = stMarkKind, RB = SITGES_RB, T = P.table;
    const lift = RB.lift.drive, CH = SITGES_ST3D.chunk;
    const { tex, cell } = stMarkAtlas();

    /* ---------- «столы»: высота над полотном ---------- */
    const tabs = L.tables.map(([x, z, zx, zz, hw, len]) => { const l = Math.hypot(zx, zz) || 1; return { x, z, ux: zx / l, uz: zz / l, hw, len, half: len / 2 + T.ramp }; });
    const tcells = sitgesCells(16);
    for (const t of tabs) { const r = Math.hypot(t.half, t.hw); tcells.add(t.x - r, t.x + r, t.z - r, t.z + r, t); }
    const prof = (t, a, bot) => { const d = Math.abs(a); return d <= t.len / 2 ? T.h : d >= t.half ? bot : bot + (T.h - bot) * (t.half - d) / T.ramp; };
    const tableH = (x, z) => {
      for (const t of tcells.at(x, z)) {
        const dx = x - t.x, dz = z - t.z, a = dx * t.ux + dz * t.uz, b = -dx * t.uz + dz * t.ux;
        if (Math.abs(b) <= t.hw && Math.abs(a) <= t.half) return prof(t, a, 0);
      }
      return 0;
    };

    /* ---------- копилки плоских мешей по квадратам (S.mesh): разметка и «столы» ---------- */
    const markMat = new THREE.MeshStandardMaterial({ map: tex, color: 0xeeeae0, alphaTest: 0.5, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    markMat.userData.shared = true;
    const Mk = {
      m: S.mesh('m', markMat, { shadow: false, keep: true, index: false, chunk: CH, far: P.far }),
      t: S.mesh('t', rk.MAT.asphalt, { shadow: false, keep: true, index: false, color: true, chunk: CH, far: P.farTable }),
    };
    const bin = (key, x, z) => Mk[key].at(x, z);            // писатель в квадрат точки (x, z)
    // треугольник (вершины [x, y, z], uv [u, v]) лицом вверх (или к n)
    const tri = (b, p, uv, n = null) => {
      const ex = p[1][0] - p[0][0], ey = p[1][1] - p[0][1], ez = p[1][2] - p[0][2], fx = p[2][0] - p[0][0], fy = p[2][1] - p[0][1], fz = p[2][2] - p[0][2];
      let nx = ey * fz - ez * fy, ny = ez * fx - ex * fz, nz = ex * fy - ey * fx;
      const back = n ? nx * n[0] + ny * n[1] + nz * n[2] < 0 : ny < 0;   // обход — лицом к нормали
      if (back) { nx = -nx; ny = -ny; nz = -nz; p = [p[0], p[2], p[1]]; uv = [uv[0], uv[2], uv[1]]; }
      if (n) [nx, ny, nz] = n;
      else { const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l; }
      b.face(p, [nx, ny, nz], uv);
    };
    const quad4 = (b, p, uv, n) => { tri(b, [p[0], p[1], p[2]], [uv[0], uv[1], uv[2]], n); tri(b, [p[0], p[2], p[3]], [uv[0], uv[2], uv[3]], n); };

    /* ---------- разметка ---------- */
    const my = (x, z) => g(x, z) + lift + P.lift + tableH(x, z);
    const V = (x, z) => [x, my(x, z), z];
    const W = cell.white, wu = [(W.u0 + W.u1) / 2, (W.v0 + W.v1) / 2], WU = [wu, wu, wu, wu];
    // прямоугольник: центр, u — вдоль, a — поперёк, b — вдоль; uvc — клетка атласа (низ клетки — ближний край)
    const rect = (cx, cz, ux, uz, a, b, uvc = null) => {
      const rx = -uz, rz = ux, B = bin('m', cx, cz);
      const pt = (sa, sb) => V(cx + rx * a / 2 * sa + ux * b / 2 * sb, cz + rz * a / 2 * sa + uz * b / 2 * sb);
      const uv = uvc ? [[uvc.u0, uvc.v0], [uvc.u1, uvc.v0], [uvc.u1, uvc.v1], [uvc.u0, uvc.v1]] : WU;
      quad4(B, [pt(-1, -1), pt(1, -1), pt(1, 1), pt(-1, 1)], uv);
    };
    const strip = (ax, az, bx, bz, ix, iz, w) => {           // полоса вдоль отрезка a–b шириной w в сторону (ix, iz)
      const B = bin('m', ax, az);
      quad4(B, [V(ax, az), V(bx, bz), V(bx + ix * w, bz + iz * w), V(ax + ix * w, az + iz * w)], WU);
    };
    const zebra = (cx, cz, ux, uz, hw, len) => {
      const Z = RB.zebra, rx = -uz, rz = ux;
      for (let c = -hw + Z.stripe / 2; c <= hw - Z.stripe / 2; c += Z.step) rect(cx + rx * c, cz + rz * c, ux, uz, Z.stripe, len);
    };
    let nMarks = 0;
    for (const [k, x, z, ux0, uz0, a, b] of L.marks) {
      const l = Math.hypot(ux0, uz0) || 1, ux = ux0 / l, uz = uz0 / l, rx = -uz, rz = ux;
      if (k === KD.line) rect(x, z, ux, uz, a, b);
      else if (k === KD.stop) rect(x, z, ux, uz, a, b, cell.stop);
      else if (k === KD.n30) rect(x, z, ux, uz, a, b, cell.n30);
      else if (k === KD.zebra) zebra(x, z, ux, uz, a, b);
      else if (k === KD.gw) {                                    // контур треугольника: вершина к водителю, основание дальше
        const A = [x - ux * b / 2, z - uz * b / 2], Bp = [x + ux * b / 2 - rx * a / 2, z + uz * b / 2 - rz * a / 2], Cp = [x + ux * b / 2 + rx * a / 2, z + uz * b / 2 + rz * a / 2];
        const gx = (A[0] + Bp[0] + Cp[0]) / 3, gz = (A[1] + Bp[1] + Cp[1]) / 3;
        for (const [p, q] of [[A, Bp], [Bp, Cp], [Cp, A]]) {
          const ex = q[0] - p[0], ez = q[1] - p[1], el = Math.hypot(ex, ez);
          let ix = -ez / el, iz = ex / el;
          if ((gx - p[0]) * ix + (gz - p[1]) * iz < 0) { ix = -ix; iz = -iz; }
          strip(p[0], p[1], q[0], q[1], ix, iz, P.gwW);
        }
      }
      nMarks++;
    }
    // на «столе»: «зебра» поверх площадки и «зубы» на скатах (основание внизу, вершина к площадке)
    for (const t of tabs) {
      zebra(t.x, t.z, t.ux, t.uz, t.hw - 0.4, t.len - 2 * T.pad);
      const rx = -t.uz, rz = t.ux;
      for (const sg of [1, -1]) {
        const a0 = sg * t.half, a1 = sg * (t.len / 2 + 0.15);
        for (let c = -t.hw + T.toothStep / 2; c <= t.hw - T.toothStep / 2 + 1e-6; c += T.toothStep) {
          const bx = t.x + t.ux * a0 + rx * c, bz = t.z + t.uz * a0 + rz * c;
          const p1 = [bx - rx * T.tooth / 2, bz - rz * T.tooth / 2], p2 = [bx + rx * T.tooth / 2, bz + rz * T.tooth / 2];
          const ap = [t.x + t.ux * a1 + rx * c, t.z + t.uz * a1 + rz * c];
          tri(bin('m', bx, bz), [V(...p1), V(...p2), V(...ap)], [wu, wu, wu]);
        }
      }
    }

    /* ---------- «столы»: площадка со скатами, бока, столкновения, высота поверхности ---------- */
    const cv = [], ci = [];
    const ctri = (a, b, c) => { const o = cv.length / 3; cv.push(...a, ...b, ...c); ci.push(o, o + 1, o + 2); };
    const AU = (x, z) => [x / 6, z / 6];                    // асфальт: uv в мировых координатах (SITGES_RB_TILE.asphalt)
    for (const t of tabs) {
      const rx = -t.uz, rz = t.ux, nb = Math.max(2, Math.ceil(2 * t.hw / 1.5));
      const st4 = [-t.half, -t.len / 2, t.len / 2, t.half];
      const XZ = (a, b) => [t.x + t.ux * a + rx * b, t.z + t.uz * a + rz * b];
      const vis = (a, b) => { const [x, z] = XZ(a, b); return [x, g(x, z) + lift + prof(t, a, -0.004), z]; };
      const phy = (a, b) => { const [x, z] = XZ(a, b); return [x, g(x, z) + prof(t, a, -0.03), z]; };
      const B = bin('t', t.x, t.z);
      for (let j = 0; j < 3; j++) for (let i = 0; i < nb; i++) {
        const a0 = st4[j], a1 = st4[j + 1], b0 = -t.hw + 2 * t.hw * i / nb, b1 = -t.hw + 2 * t.hw * (i + 1) / nb;
        const q = [vis(a0, b0), vis(a1, b0), vis(a1, b1), vis(a0, b1)];
        quad4(B, q, q.map(p => AU(p[0], p[2])));
        const c = [phy(a0, b0), phy(a1, b0), phy(a1, b1), phy(a0, b1)];
        ctri(c[0], c[1], c[2]); ctri(c[0], c[2], c[3]);
        S.walk(c.map(p => [p[0], p[2]]), c.map(p => p[1]));
      }
      for (const sb of [-1, 1]) for (let j = 0; j < 3; j++) {   // бока у бордюров
        const a0 = st4[j], a1 = st4[j + 1], p0 = vis(a0, sb * t.hw), p1 = vis(a1, sb * t.hw);
        const [x0, z0] = XZ(a0, sb * t.hw), [x1, z1] = XZ(a1, sb * t.hw), y0 = g(x0, z0) + lift - 0.01, y1 = g(x1, z1) + lift - 0.01;
        const q = [[x0, y0, z0], [x1, y1, z1], p1, p0], uv = q.map(p => [(p[0] + p[2]) / 6, p[1] / 6]);
        quad4(B, q, uv, [rx * sb, 0, rz * sb]);
      }
    }
    S.collider(cv, ci);

    S.flush();                                               // меши копилок — до знаков (порядок в группе прежний)

    /* ---------- знаки ---------- */
    const signMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.2 });
    signMat.userData.shared = true;
    const uvTo = (geo, c) => {                               // uv 0…1 → клетка атласа
      const a = geo.attributes.uv;
      for (let i = 0; i < a.count; i++) a.setXY(i, c.u0 + (c.u1 - c.u0) * a.getX(i), c.v0 + (c.v1 - c.v0) * a.getY(i));
      return geo;
    };
    const flat = (geo, c) => { const a = geo.attributes.uv, u = (c.u0 + c.u1) / 2, v = (c.v0 + c.v1) / 2; for (let i = 0; i < a.count; i++) a.setXY(i, u, v); return geo; };
    const H = P.sign.h;
    const signGeo = (plate, face) => {
      const top = H + 0.36;
      const pole = flat(new THREE.CylinderGeometry(0.03, 0.03, top, 6, 1, true).translate(0, top / 2, 0), cell.gray);
      const front = uvTo(plate.clone(), face).translate(0, H, 0.035);
      const back = flat(plate.clone(), cell.gray).rotateY(Math.PI).translate(0, H, 0.03);
      return mergeGeometries([pole, front, back]);
    };
    const plates = [
      [new THREE.CircleGeometry(0.3 / Math.cos(Math.PI / 8), 8, Math.PI / 8), cell.fStop],
      [new THREE.CircleGeometry(0.7 / Math.sqrt(3), 3, -Math.PI / 2), cell.fGw],
      [new THREE.CircleGeometry(0.3, 20), cell.fNo],
    ];
    const SIGN_BRK = { mass: 25, anchor: 0.5, cy: 1.4, lie: 1.52, light: true, kind: 'metal' };    // как знаки «Города»
    plates.forEach(([plate, face], type) => {
      const items = L.signs.filter(s => s[0] === type).map(([, x, z, ry]) => ({ x, z, ry }));
      if (items.length) S.place([{ geo: signGeo(plate, face), mat: signMat }], items, { brk: SIGN_BRK, hit: { r: 0.1, h: 2.7 } });
    });

    /* ---------- светофоры: столб, голова на 3 лампы лицом к машинам, пешеходная — поперёк улицы ---------- */
    if (L.signals.length) {
      const body = mergeGeometries([
        new THREE.CylinderGeometry(0.055, 0.065, 3.0, 8).translate(0, 1.5, 0),
        new THREE.BoxGeometry(0.3, 0.92, 0.22).translate(0, 2.6, 0.12),
        new THREE.BoxGeometry(0.22, 0.5, 0.22).translate(-0.17, 2.0, 0),
      ].map(gg => gg.toNonIndexed()));
      const lens = (y, side) => {
        const c = new THREE.CircleGeometry(side ? 0.075 : 0.095, 12);
        return side ? c.rotateY(-Math.PI / 2).translate(-0.285, y, 0) : c.translate(0, y, 0.235);
      };
      const lamp = (on, off) => { const m = new THREE.MeshBasicMaterial({ color: off }); m.userData = { shared: true, on, off }; return m; };
      const L3 = [lamp(0xff2a18, 0x3a0c08), lamp(0xffb000, 0x3a2a06), lamp(0x22e070, 0x06301a), lamp(0xff2a18, 0x3a0c08), lamp(0x22e070, 0x06301a)];
      const [cg, ca, cr] = P.cycle, per = cg + ca + cr;
      let state = -1;
      // зелёный → жёлтый → красный (группа 0 — машины этой улицы, как у водителей трафика: stMarkSignal, simTime);
      // пешеходам зелёный при красном
      const tick = () => {
        const t = (simTime % per + per) % per, f = stMarkSignal(0, t), s = f === 'g' ? 2 : f === 'y' ? 1 : 0, ped = s === 0 && t > cg + ca + 1 && t < per - 2 ? 4 : 3;
        const k = s * 8 + ped;
        if (k === state) return;
        state = k;
        L3.forEach((m, i) => m.color.setHex(i === s || i === ped ? m.userData.on : m.userData.off));
      };
      const out = S.place([
        { geo: body, mat: S.mat(0x2b2f30, { roughness: 0.6, metalness: 0.4 }) },
        { geo: lens(2.88, 0), mat: L3[0], shadow: false }, { geo: lens(2.6, 0), mat: L3[1], shadow: false }, { geo: lens(2.32, 0), mat: L3[2], shadow: false },
        { geo: lens(2.12, 1), mat: L3[3], shadow: false }, { geo: lens(1.88, 1), mat: L3[4], shadow: false },
      ], L.signals.map(([x, z, ry]) => ({ x, z, ry })), { brk: { mass: 120, anchor: 1.5, minSpeed: 2, dmg: 0.3, cy: 1.8, lie: 1.52, kind: 'metal' }, hit: { r: 0.12, h: 3.1 } });
      for (const m of out.meshes) m.onBeforeRender = tick;
      tick();
    }
    S.count(nMarks + tabs.length);
  },
};
