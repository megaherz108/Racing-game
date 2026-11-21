// Отладка мелочей улиц «Ситжеса» (этап 7, docs/sitges/stage-7.md). Не часть игры — подгружается в страницу:
//   node tools/cdp.js --inject tools/sitges/street-debug.js --eval "__stInfo()"
//   node tools/cdp.js --inject tools/sitges/street-debug.js --eval "await __stMap([-560, -150, 40])" --dir shots
//   node tools/cdp.js --inject tools/sitges/street-debug.js --eval "await __stShots([[-560, -150]], { night: true })" --dir shots
//   (в консоли: (0, eval)(await (await fetch('tools/sitges/street-debug.js')).text()); __stInfo())
// __stInfo() → текст: по группам A…G — готова ли, что вернула раскладка (числа и длины списков), занято (C.street.occ
//   по who), постройка (штук, треугольников, мешей = вызовов отрисовки, сбиваемых, огней — world.stats.street); линии мест.
// __stMap(area, { px, who }) → { png } — схема сверху: area = [x, z, R] (квадрат ±R м) или список таких; полотно улиц,
//   полосы тротуара, дома; линии мест (бордюр — синий, бордюр углов — голубой, наружный край — серый, край полотна
//   без тротуара — оранжевый, стены к улице — коричневый), «зебры», занятость капсулами цветом who (легенда); who —
//   показать только эти. Сетка 10 м, море (−z) сверху.
// __stShots(points, { night, demo, w, h, fov, dist, ch }) → { png } — кадры 3D: точка [x, z] — камера в dist м
//   (по умолчанию 12) от точки на юго-восток на высоте ch (3 м) над землёй, взгляд на точку; [cx, cz, tx, tz, ch] —
//   своя камера (взгляд на (tx, tz) на 1 м над землёй). night — ночь (Sky.apply), иначе день.
//   demo — тестовая группа SITGES_ST_DEMO (только здесь, в игре её нет): карта пересобирается с ней, в области demo
//   (по умолчанию [x, z, 60] вокруг первой точки) — красные сбиваемые столбики с лампой и пятном света ночью через 12 м
//   у бордюра на свободных местах, каждый третий — неподвижный синий блок со столкновением, на стенах к улице —
//   жёлтые таблички через 15 м на 3,5 м. Проверка каркаса: помощники мест, занятость, place / lights, сбиваемые.
// __stDemo(area | null) — включить тестовую группу в области [x, z, R] (null — выключить); карта пересоберётся.
(() => {
  const data = () => getData('sitges');
  const rebuild = () => {                          // раскладка и мир «Ситжеса» — заново при следующем getData / getWorld
    if (worlds.sitges) { scene.remove(worlds.sitges.group); if (world === worlds.sitges) world = null; delete worlds.sitges; }
    delete mapData.sitges;
  };
  const f1 = v => Math.round(v * 10) / 10;

  /* ---------- тестовая группа (видна только в отладке) ---------- */
  const DEMO = window.SITGES_ST_DEMO = {
    id: 'demo', name: 'тест каркаса', ready: false, area: null,
    plan(C, S) {
      const [cx, cz, R] = this.area, inA = s => Math.abs((s.ax + s.bx) / 2 - cx) < R && Math.abs((s.az + s.bz) / 2 - cz) < R;
      const posts = [], blocks = [], plates = [];
      let k = 0;
      S.along(S.curbs.filter(inA), 12, sp => {
        if (sp.w < 1.2 || !S.free(sp.x, sp.z, 0.35)) return false;
        S.reserve(sp.x, sp.z, 0.35, 'demo');
        (k++ % 3 === 2 ? blocks : posts).push([sp.x, sp.z, sp.ry]);
        return true;
      }, { off: 0.5 });
      S.along(S.walls.filter(inA), 15, sp => {
        const y = (sp.seg.ga + (sp.seg.gb - sp.seg.ga) * sp.f) + 3.5;
        if (y > sp.seg.hi - 0.5) return false;
        plates.push([sp.x, sp.z, sp.ry, y]);
        return true;
      }, { start: 3, end: 1 });
      return { posts, blocks, plates };
    },
    build(K, S, L) {
      const post = new THREE.CylinderGeometry(0.08, 0.1, 1.2, 8).translate(0, 0.6, 0);
      const head = new THREE.SphereGeometry(0.13, 8, 6).translate(0, 1.32, 0);
      const items = L.posts.map(([x, z, ry]) => ({ x, z, ry }));
      S.place([{ geo: post, mat: S.mat(0xd02020) }, { geo: head, mat: S.glow(0xdddddd, 0xfff0c0), shadow: false }], items,
        { brk: { mass: 30, minSpeed: 1, light: true, cy: 0.6, lie: 1.4, kind: 'metal' }, hit: { r: 0.15, h: 1.3 } });
      S.lights(items.map(it => ({ x: it.x, y: it.y + 1.45, z: it.z, it: it.brk })), { pool: 3, size: 2 });
      S.place([{ geo: new THREE.BoxGeometry(0.6, 0.5, 0.6).translate(0, 0.25, 0), mat: S.mat(0x3050d0) }],
        L.blocks.map(([x, z, ry]) => ({ x, z, ry })), { box: { w: 0.6, d: 0.6, h: 0.5 } });
      S.place([{ geo: new THREE.BoxGeometry(0.5, 0.35, 0.04).translate(0, 0, 0.02), mat: S.mat(0xf0c020) }],
        L.plates.map(([x, z, ry, y]) => ({ x, z, ry, y })), {});
    },
  };
  window.__stDemo = area => {
    const on = !!area;
    if (on === DEMO.ready && (!on || JSON.stringify(area) === JSON.stringify(DEMO.area))) return;
    DEMO.ready = on; DEMO.area = area; rebuild();
  };

  /* ---------- сводка ---------- */
  window.__stInfo = function () {
    const S = data().C.street, W = getWorld('sitges'), st = (W.stats && W.stats.street) || {}, out = [];
    const occ = {}; for (const o of S.occ) occ[o.who] = (occ[o.who] || 0) + 1;
    const desc = v => v == null ? '—' : Object.entries(v).map(([k, x]) => k + ' ' + (Array.isArray(x) ? x.length : typeof x === 'object' && x ? '{…}' : x)).join(', ') || 'пусто';
    for (const g of [...SITGES_ST_GROUPS, ...(DEMO.ready ? [DEMO] : [])]) {
      const b = st[g.id];
      out.push(`${g.id} ${g.name}: ${g.ready ? 'готова' : 'заготовка'}; раскладка: ${desc(S.groups[g.id])}; занято ${occ[g.id] || 0}` +
        (b ? `; постройка: штук ${b.n}, треугольников ${b.tris}, мешей ${b.meshes}, сбиваемых ${b.brk}, огней ${b.lights}` : ''));
    }
    out.push(`линии: бордюр ${S.curbs.length}, углы ${S.corners.length}, наружный край ${S.fronts.length}, край полотна ${S.edges.length}, стены ${S.walls.length}, зебры ${S.zebras.length}`);
    out.push(`занято: ${Object.entries(occ).map(([k, n]) => k + ' ' + n).join(', ')}`);
    const P = data().C.points;
    out.push(`точки OSM: ${Object.entries(P).map(([k, v]) => k + ' ' + v.length).join(', ')}`);
    return out.join('\n');
  };

  /* ---------- схема сверху ---------- */
  const COL = { gate: '#00aa00', car: '#66cc66', door: '#cc00cc', tree: '#44aa44', zebra: '#888888', cross: '#aaaaaa', sign: '#ff8800', corner: '#99ccff',
    A: '#ffcc00', B: '#ff0000', C: '#0066ff', D: '#00cccc', E: '#ff66cc', F: '#aa5500', G: '#555555', demo: '#ee0000' };
  window.__stMap = async function (areas, { px = 8, who = null } = {}) {
    const C = data().C, S = C.street, png = {};
    for (const [cx, cz, R = 40] of Array.isArray(areas[0]) ? areas : [areas]) {
      const W = Math.round(R * 2 * px), cv = document.createElement('canvas'); cv.width = cv.height = W;
      const g = cv.getContext('2d'), X = x => (x - cx + R) * px, Z = z => (z - cz + R) * px, M = R + 20;
      const near = (x, z) => Math.abs(x - cx) < M && Math.abs(z - cz) < M;
      const poly = (ring, fill, stroke) => {
        g.beginPath(); ring.forEach((q, i) => i ? g.lineTo(X(q[0]), Z(q[1])) : g.moveTo(X(q[0]), Z(q[1]))); g.closePath();
        if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1; g.stroke(); }
      };
      const line = (s, col, lw) => { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); g.moveTo(X(s.ax), Z(s.az)); g.lineTo(X(s.bx), Z(s.bz)); g.stroke(); };
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, W);
      g.strokeStyle = '#eeeeee'; g.lineWidth = 1;
      for (let v = Math.ceil((cx - R) / 10) * 10; v < cx + R; v += 10) { g.beginPath(); g.moveTo(X(v), 0); g.lineTo(X(v), W); g.stroke(); }
      for (let v = Math.ceil((cz - R) / 10) * 10; v < cz + R; v += 10) { g.beginPath(); g.moveTo(0, Z(v)); g.lineTo(W, Z(v)); g.stroke(); }
      g.lineCap = 'round';
      for (const st of C.streets) {
        if (!(st.drive || st.cls === 'pedestrian') || !st.v.some(v => near(v.x, v.z))) continue;
        g.strokeStyle = '#d4d4d4';
        for (let i = 0; i + 1 < st.v.length; i++) { const a = st.v[i], b = st.v[i + 1]; g.lineWidth = Math.max(2, (a.hw + b.hw) * px); g.beginPath(); g.moveTo(X(a.x), Z(a.z)); g.lineTo(X(b.x), Z(b.z)); g.stroke(); }
      }
      for (const w of C.walks) if (near(...w.O0)) poly([w.I0, w.I1, w.O1, w.O0], '#e6e6f2', null);
      for (const h of C.houses) if (near(...h.rings[0][0])) poly(h.rings[0], '#efe6dc', '#bbbbaa');
      for (const Zb of S.zebras) if (near(Zb.x0, Zb.z0)) {
        g.fillStyle = '#bbbbbb';
        for (let c = -Zb.hw; c <= Zb.hw; c += 1) { const x = Zb.x0 - Zb.zz * c, z = Zb.z0 + Zb.zx * c; g.fillRect(X(x) - 1, Z(z) - 1, 3, 3); }
      }
      const inSeg = s => near(s.ax, s.az);
      for (const s of S.walls) if (inSeg(s)) line(s, '#a0522d', 3);
      for (const s of S.fronts) if (inSeg(s)) line(s, '#999999', 1.5);
      for (const s of S.edges) if (inSeg(s)) line(s, '#ff9900', 2);
      for (const s of S.curbs) if (inSeg(s)) line(s, '#2266cc', 2);
      for (const s of S.corners) if (inSeg(s)) line(s, '#66bbff', 2);
      const used = new Set();
      for (const o of S.occ) {
        if (!near(o.x, o.z) || (who && !who.includes(o.who))) continue;
        used.add(o.who);
        g.strokeStyle = (COL[o.who] || '#000000') + 'b0'; g.lineWidth = Math.max(2, o.r * 2 * px); g.lineCap = 'round';
        g.beginPath(); g.moveTo(X(o.x), Z(o.z)); g.lineTo(X(o.x2) + (o.x2 === o.x && o.z2 === o.z ? 0.01 : 0), Z(o.z2)); g.stroke();
      }
      g.font = '13px sans-serif'; g.textAlign = 'left';
      g.fillStyle = '#000000'; g.fillText(`мелочи улиц: (${f1(cx)}, ${f1(cz)}) ±${R} м; клетка 10 м; x →, z ↓ (море сверху)`, 8, 16);
      let ly = 34;
      for (const [k, c] of [['бордюр', '#2266cc'], ['бордюр угла', '#66bbff'], ['наружный край', '#999999'], ['край полотна', '#ff9900'], ['стена к улице', '#a0522d'], ...[...used].map(k => ['занято: ' + k, COL[k] || '#000000'])]) {
        g.fillStyle = c; g.fillRect(8, ly - 9, 14, 10); g.fillStyle = '#000000'; g.fillText(k, 28, ly); ly += 16;
      }
      png[`st-map-${Math.round(cx)}_${Math.round(cz)}`] = cv.toDataURL('image/png');
    }
    return { png };
  };

  /* ---------- кадры 3D ---------- */
  window.__stShots = async function (points, { night = false, demo = false, w = 1280, h = 720, fov = 55, dist = 12, ch = 3 } = {}) {
    if (demo) { const p = points[0]; __stDemo(Array.isArray(demo) ? demo : [p.length > 2 ? p[2] : p[0], p.length > 2 ? p[3] : p[1], 60]); }
    const D = data(), Wd = getWorld('sitges'), gr = D.ground;
    activateWorld('sitges');
    Sky.apply(Wd, night ? 'night' : 'day');
    const cam = new THREE.PerspectiveCamera(fov, w / h, 0.3, 3200), png = {};
    const prev = new THREE.Vector2(); renderer.getSize(prev);
    const pr = renderer.getPixelRatio();
    renderer.setPixelRatio(1); renderer.setSize(w, h, false);
    for (const p of points) {
      let cx, cz, tx, tz, hh = ch;
      if (p.length > 2) [cx, cz, tx, tz, hh = 1.7] = p; else { [tx, tz] = p; cx = tx - dist * 0.7; cz = tz - dist * 0.7; }
      const cy = Math.max(gr(cx, cz), Wd.surface(cx, cz)) + hh, ty = Wd.surface(tx, tz) + 1;
      cam.position.set(cx, cy, cz); cam.lookAt(tx, ty, tz); cam.updateMatrixWorld();
      aimSun(tx, ty, tz);
      if (Wd.cullView) Wd.cullView(cx, cz, 0);
      renderer.shadowMap.needsUpdate = true; renderer.setScissorTest(false); renderer.setViewport(0, 0, w, h);
      renderer.render(scene, cam);
      png[`st-${points.indexOf(p) + 1}-${Math.round(tx)}_${Math.round(tz)}${night ? '-night' : ''}${demo ? '-demo' : ''}`] = renderer.domElement.toDataURL('image/jpeg', 0.85);
    }
    renderer.setPixelRatio(pr); renderer.setSize(prev.x, prev.y, false);
    return { png };
  };
})();
