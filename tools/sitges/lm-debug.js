// Отладка достопримечательностей «Ситжеса» (этапы 5–6, docs/sitges/stage-5.md). Не часть игры — подгружается в страницу:
//   node tools/cdp.js --inject tools/sitges/lm-debug.js --eval "__lmInfo(['church'])"
//   node tools/cdp.js --inject tools/sitges/lm-debug.js --eval "await __lmMap(['church'])" --dir shots
//   node tools/cdp.js --inject tools/sitges/lm-debug.js --eval "await __lmShots(['church'])" --dir shots
//   (в консоли: (0, eval)(await (await fetch('tools/sitges/lm-debug.js')).text()); await __lmShots(['church']))
// Строение — id из SITGES_LM (js/maps/sitges/landmarks.js).
// __lmInfo(ids) → текст: здания кадастра строения, части (этажи, низ и верх стен, верх крыши, тип крыши, рамка
//   len × wid, поворот длинной оси), земля, общие стены с соседями, улицы рядом, точки OSM рядом.
// __lmMap(ids, { R, px }) → { png } — схема сверху: части строения (номер, этажи, высота верха над землёй), соседние
//   дома, тротуары, полотно улиц, деревья, линия забора; сетка 10 м, стрелка «к морю» (−z).
// __lmShots(ids, { w, h, views }) → { png } — кадры: views — список из 'n','ne','e','se','s','sw','w','nw' (камера
//   с этой стороны, на расстоянии ≈ 1,7 размера строения и высоте ≈ 0,45 размера), 'street' (с ближайшей улицы,
//   1,6 м над землёй), 'top' (сверху); по умолчанию ['ne','sw','street']. Своя камера — [id, cx, cz, h, tx, tz, ty]:
//   камера в (cx, cz) на h м над землёй, взгляд на (tx, tz) (по умолчанию центр строения) на высоте ty над землёй.
// Стороны: n — с суши (+z), s — с моря (−z), e — со стороны марины (−x), w — со стороны Террамара (+x).
// Время суток — как сейчас в игре.
(() => {
  const data = () => getData('sitges');
  const lmOf = id => {
    const L = data().C.landmarks.find(l => l.id === id);
    if (!L) throw new Error('нет строения ' + id + ' (SITGES_LM)');
    return L;
  };
  const hull = pts => {
    const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const q of p) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (const q of p.reverse()) { while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  };
  const f1 = v => Math.round(v * 10) / 10;

  window.__lmInfo = function (ids) {
    const C = data().C, out = [];
    for (const id of ids) {
      const L = lmOf(id);
      out.push(`== ${id} — ${L.name}: ready ${L.ready}, зданий ${L.bis.length} (${L.bis.join(', ')}), частей ${L.parts.length}`);
      if (!L.parts.length) { out.push(`  нет зданий кадастра; рамка ${L.bb.map(f1).join(', ')}, земля ${f1(L.g)}`); continue; }
      const F = lmFrame(hull(L.rings.flat()));
      out.push(`  центр (${f1(F.cx)}, ${f1(F.cz)}), всё строение ${f1(F.len)} × ${f1(F.wid)} м, длинная ось (${f1(F.ux)}, ${f1(F.uz)}), rot ${f1(F.rot)}; земля в центре ${f1(L.g)}, верх кадастра ${f1(L.top)} (над землёй ${f1(L.top - L.g)})`);
      for (const b of L.bis) { const B = C.blds[b]; out.push(`  здание ${b}: ${B.name || '—'}, ${B.use}, ${B.type || ''}, год ${B.year}`); }
      L.parts.forEach((h, k) => {
        const Fp = lmFrame(h.rings[0]);
        out.push(`  часть ${k} (здание ${h.bi}): этажей ${h.p.floors}${h.p.below ? ' (+' + h.p.below + ' подз.)' : ''}, низ ${f1(h.y0)}, стены до ${f1(h.y1)}, верх ${f1(h.top)}, `
          + `крыша ${h.roof ? h.roof.kind : '?'}, ${f1(Fp.len)} × ${f1(Fp.wid)} м у (${f1(Fp.cx)}, ${f1(Fp.cz)}), rot ${f1(Fp.rot)}, точек ${h.rings[0].length}${h.rings.length > 1 ? ', дыр ' + (h.rings.length - 1) : ''}${h.pass ? ', проезд' : ''}`);
      });
      // соседи с общими стенами
      const own = new Set(L.bis), nb = new Map();
      for (const h of C.houses) {
        if (own.has(h.bi)) continue;
        const bb = sitgesBBox(h.rings[0]);
        if (bb[1] < L.bb[0] - 1 || bb[0] > L.bb[1] + 1 || bb[3] < L.bb[2] - 1 || bb[2] > L.bb[3] + 1) continue;
        const touch = h.rings[0].some(([x, z]) => L.rings.some(r => r.some(([ax, az], i) => { const [bx, bz] = r[(i + 1) % r.length]; return sitgesSeg(x, z, ax, az, bx, bz) < 0.5; })));
        if (touch) nb.set(h.bi, (nb.get(h.bi) || 0) + 1);
      }
      out.push(`  вплотную соседи: ${[...nb.keys()].map(b => b + ' (' + C.blds[b].parts.map(p => p.floors).join(',') + ' эт.)').join(', ') || 'нет'}`);
      const near = new Map();
      for (const st of C.streets) for (const v of st.v) { const d = Math.hypot(v.x - L.cx, v.z - L.cz); if (d < Math.max(40, F.len) && (!near.has(st.name) || near.get(st.name) > d)) near.set(st.name || st.cls, d); }
      out.push(`  улицы рядом: ${[...near].sort((a, b) => a[1] - b[1]).map(([n, d]) => n + ' ' + Math.round(d) + ' м').join('; ')}`);
      const pts = [];
      for (const k in C.points) for (const [x, z] of C.points[k]) if (Math.hypot(x - L.cx, z - L.cz) < 40) pts.push(k);
      if (pts.length) out.push(`  точки OSM в 40 м: ${Object.entries(pts.reduce((a, k) => (a[k] = (a[k] || 0) + 1, a), {})).map(([k, n]) => k + ' ' + n).join(', ')}`);
    }
    return out.join('\n');
  };

  window.__lmMap = async function (ids, { R, px = 8 } = {}) {
    const C = data().C, png = {};
    for (const id of ids) {
      const L = lmOf(id), r = R || Math.max(40, Math.max(L.bb[1] - L.bb[0], L.bb[3] - L.bb[2]) * 0.8 + 20);
      const W = Math.round(r * 2 * px), cv = document.createElement('canvas'); cv.width = cv.height = W;
      const g = cv.getContext('2d'), cx = L.cx, cz = L.cz;
      g.fillStyle = '#fff'; g.fillRect(0, 0, W, W);
      // экран: x вправо, z вниз — море (−z) наверху
      const X = x => (x - cx + r) * px, Z = z => (z - cz + r) * px, M = r + 20;
      const near = pts => pts.some(q => Math.abs(q[0] - cx) < M && Math.abs(q[1] - cz) < M);
      const poly = (ring, fill, stroke, lw = 1) => {
        g.beginPath(); ring.forEach((q, i) => i ? g.lineTo(X(q[0]), Z(q[1])) : g.moveTo(X(q[0]), Z(q[1]))); g.closePath();
        if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
      };
      g.strokeStyle = '#eee'; g.lineWidth = 1;
      for (let v = Math.ceil((cx - r) / 10) * 10; v < cx + r; v += 10) { g.beginPath(); g.moveTo(X(v), 0); g.lineTo(X(v), W); g.stroke(); }
      for (let v = Math.ceil((cz - r) / 10) * 10; v < cz + r; v += 10) { g.beginPath(); g.moveTo(0, Z(v)); g.lineTo(W, Z(v)); g.stroke(); }
      if (C.carriage) for (const q of C.carriage) if (q.ring && near(q.ring)) poly(q.ring, '#ccc', null);
      for (const st of C.streets) {
        if (!near(st.v.map(v => [v.x, v.z]))) continue;
        g.strokeStyle = st.drive ? '#bbb' : '#dcc'; g.lineWidth = Math.max(2, (st.v[0].hw || 2) * 2 * px); g.lineCap = 'round';
        g.beginPath(); st.v.forEach((v, i) => i ? g.lineTo(X(v.x), Z(v.z)) : g.moveTo(X(v.x), Z(v.z))); g.stroke();
      }
      for (const w of C.walks) if (near([w.O0])) poly([w.I0, w.I1, w.O1, w.O0], '#dde', null);
      for (const h of C.houses) if (!L.bis.includes(h.bi) && near(h.rings[0])) poly(h.rings[0], '#e4dcd4', '#a99');
      if (C.fences) for (const f of C.fences) if (near(f.P)) { g.strokeStyle = '#555'; g.lineWidth = 2; g.beginPath(); f.P.forEach((q, i) => i ? g.lineTo(X(q[0]), Z(q[1])) : g.moveTo(X(q[0]), Z(q[1]))); g.stroke(); }
      if (C.trees) for (const t of C.trees) if (Math.abs(t.x - cx) < M && Math.abs(t.z - cz) < M) { g.strokeStyle = '#4a4'; g.lineWidth = 1; g.beginPath(); g.arc(X(t.x), Z(t.z), (t.r || 2) * px, 0, 7); g.stroke(); }
      const pal = ['#f4a', '#fa4', '#4af', '#a4f', '#4fa', '#fd4', '#f66', '#6cf'];
      L.parts.forEach((h, k) => {
        poly(h.rings[0], pal[k % pal.length] + '8', '#333', 1.5);
        for (const hole of h.rings.slice(1)) poly(hole, '#fff', '#333', 1);
        const F = lmFrame(h.rings[0]);
        g.fillStyle = '#000'; g.font = `${Math.max(11, px * 1.6)}px sans-serif`; g.textAlign = 'center';
        g.fillText(`${k}: ${h.p.floors} эт · ${f1(h.top - L.g)} м`, X(F.cx), Z(F.cz));
      });
      g.fillStyle = '#000'; g.font = '14px sans-serif'; g.textAlign = 'left';
      g.fillText(`${id} — ${L.name}; клетка 10 м; центр (${f1(cx)}, ${f1(cz)}); x →, z ↓ (море сверху)`, 8, 18);
      png[id + '-map'] = cv.toDataURL('image/png');
    }
    return { png };
  };

  const DIRS = { n: [0, 1], ne: [-0.7, 0.7], e: [-1, 0], se: [-0.7, -0.7], s: [0, -1], sw: [0.7, -0.7], w: [1, 0], nw: [0.7, 0.7] };
  window.__lmShots = async function (ids, { w = 1280, h = 720, views = ['ne', 'sw', 'street'] } = {}) {
    const D = data(), Wd = getWorld('sitges'), C = D.C, gr = D.ground;
    activateWorld('sitges');
    const cam = new THREE.PerspectiveCamera(55, w / h, 0.3, 3200), png = {};
    const prev = new THREE.Vector2(); renderer.getSize(prev);
    const pr = renderer.getPixelRatio();
    renderer.setPixelRatio(1); renderer.setSize(w, h, false);
    const shoot = (name, cx, cz, cy, tx, ty, tz) => {
      cam.position.set(cx, cy, cz); cam.lookAt(tx, ty, tz); cam.updateMatrixWorld();
      aimSun(tx, ty, tz);
      if (Wd.cullView) Wd.cullView(cx, cz, 0);
      renderer.shadowMap.needsUpdate = true; renderer.setScissorTest(false); renderer.setViewport(0, 0, w, h);
      renderer.render(scene, cam);
      png[name] = renderer.domElement.toDataURL('image/jpeg', 0.85);
    };
    for (const item of ids) {
      if (Array.isArray(item)) {
        const [id, cx, cz, ch = 1.6, tx, tz, ty = 4] = item, L = lmOf(id);
        const X = tx ?? L.cx, Z = tz ?? L.cz;
        shoot(`${id}-cam-${Math.round(cx)}_${Math.round(cz)}`, cx, cz, gr(cx, cz) + ch, X, gr(X, Z) + ty, Z);
        continue;
      }
      const L = lmOf(item), size = Math.max(20, L.bb[1] - L.bb[0], L.bb[3] - L.bb[2], (L.top - L.g) * 1.2);
      const ty = L.g + Math.max(4, (L.top - L.g) * 0.45);
      for (const v of views) {
        if (v === 'top') { shoot(`${item}-top`, L.cx, L.cz + 0.01, L.g + size * 2.2, L.cx, L.g, L.cz); continue; }
        if (v === 'street') {
          // ближайшая точка проезжей улицы вне домов
          let best = null, bd = Infinity;
          for (const st of C.streets) if (st.drive) for (const q of st.v) { const d = Math.hypot(q.x - L.cx, q.z - L.cz); if (d < bd && d > size * 0.4 && !C.houseAt(q.x, q.z)) { bd = d; best = q; } }
          if (best) shoot(`${item}-street`, best.x, best.z, gr(best.x, best.z) + 1.6, L.cx, ty, L.cz);
          continue;
        }
        const [dx, dz] = DIRS[v], d = size * 1.7, cx = L.cx + dx * d, cz = L.cz + dz * d;
        shoot(`${item}-${v}`, cx, cz, Math.max(gr(cx, cz) + 2, L.g + size * 0.45), L.cx, ty, L.cz);
      }
    }
    renderer.setPixelRatio(pr); renderer.setSize(prev.x, prev.y, false);
    return { png };
  };
})();
