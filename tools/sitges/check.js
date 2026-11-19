// Проверка карты «Ситжес»: глобальные метрики вместо осмотра одной точки. Не часть игры — подгружается в страницу:
//   node tools/cdp.js --inject tools/sitges/check.js --eval "await __sitgesCheck()" --compare tools/sitges/check-base.json
//   (в консоли: (0, eval)(await (await fetch('tools/sitges/check.js')).text()); await __sitgesCheck())
// Новый эталон после осознанной правки: тот же запуск с --save tools/sitges/check-base.json (без --compare).
//
// __sitgesCheck() → объект (числа; --compare в tools/cdp.js показывает, что поменялось, кроме групп time и ms…):
//   time     — постройка: раскладка (getData), мир (getWorld), ровное полотно; fresh — первая постройка на странице
//   counts   — улицы, пути, переезды, путепроводы, углы, части домов, куски стен, треугольники и меши улиц, столкновения,
//              заборы (км, отрезков)
//   roofs    — формы крыш частей (плоская, двускатная, вальмовая, односкатная, вальма отступом), будки лестниц,
//              треугольники зданий вместе с крышами; балконы, карнизы и их треугольники (4.4)
//   corners  — сводка углов C.cornerStats и причины пропусков (C.cornerLog по why)
//   width    — проезжие улицы с полосами (точки): доли ширины проезжей части < 5, 5–6, 6–8, ≥ 8 м, тротуары с двух
//              сторон; Enric Morera — медиана проезжей части и тротуаров (эталон решения 3: ≈ 6 м)
//   seams    — стыки полосы тротуара и углового куска: у каждого касания (рукав с тротуаром угла) две точки на середине
//              тротуара — в 0,3 м до касания (угловой кусок) и после (полоса); точка не на тротуаре — щель. gapsAt —
//              первые 30 мест. Часть щелей законна: полосу за касанием режет проезжая часть соседней улицы
//   even     — ровность полотна проезжих улиц через 1 м (по рельефу, на настилах — по профилю): отклонение от плавного
//              профиля (Гаусс σ 8 м) — медиана / 90 / 99 %, см; излом уклона на базе 4 м, 90 %, см/м; поперёк
//              (середина против краёв в 0,3 м от бордюра), 90 %, см
//   steep    — места круче 25 % на базе 10 м (слиты в радиусе 30 м): число и список с названиями улиц
//   fences   — заборы (4а.2, C.fenceStats и C.fenceStyleStats): км, сплошных, кусков по участкам, участков, комплексов
//              (joined — склеено соседей), снято с участков без домов (bare: [участков, км] — зелень OSM, ж/д, пустырь),
//              кусков 1 м перед домами от 3 этажей (front); км по видам верха (top) и цоколя (base), по классам участка
//              (cls) и районам (zone); at — стиль у мест с фото (FENCE_AT, строки — не сравниваются)
// __sitgesShots({ w, h, only }) → { png: { имя: dataURL } } — кадры контрольных мест (PLACES ниже) с высоты;
//   tools/cdp.js --dir папка пишет их в файлы. Тени — вокруг каждой точки (aimSun), время суток — из меню.
(() => {
  const q = (a, p) => { if (!a.length) return 0; const s = Float64Array.from(a).sort(); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]; };
  const r = (v, n = 1) => Math.round(v * 10 ** n) / 10 ** n;
  // точка на оси улицы по длине дуги
  const along = (st, s) => {
    const v = st.v;
    let lo = 0, hi = v.length - 2;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (v[m].s <= s) lo = m; else hi = m - 1; }
    const a = v[lo], b = v[lo + 1], t = clamp((s - a.s) / Math.max(1e-6, b.s - a.s), 0, 1), f = (p, k) => p + (k - p) * t;
    const tx = f(a.tx, b.tx), tz = f(a.tz, b.tz), l = Math.hypot(tx, tz) || 1;
    return { x: f(a.x, b.x), z: f(a.z, b.z), tx: tx / l, tz: tz / l, hw: f(a.hw, b.hw), y: f(a.y, b.y), deck: a.deck, i: lo };
  };

  window.__sitgesCheck = async function () {
    const fresh = !mapData.sitges, t0 = performance.now();
    const D = getData('sitges'), tData = performance.now() - t0;
    const freshW = !worlds.sitges, t1 = performance.now();
    const W = getWorld('sitges'), tWorld = performance.now() - t1;
    const C = D.C, g = D.ground, out = {};
    out.time = { data: Math.round(tData), world: Math.round(tWorld), even: C.evenStats.ms, fresh: fresh && freshW };

    /* ---------- счётчики ---------- */
    const RS = W.stats.roads, HS = C.houseStats;
    out.counts = {
      streets: C.streets.length, drive: C.streets.filter(s => s.drive).length, tracks: C.tracks.length, xings: C.xings.length,
      unders: C.unders.length, corners: C.corners.length, sharp: C.corners.filter(c => c.sharp).length, snap: C.cornerSnap,
      houses: HS.parts, wallPieces: HS.pieces, blind: HS.blind, streetWalls: HS.street, passes: HS.pass,
      roadTris: RS.tris, roadMeshes: RS.meshes, walkColliderTris: RS.colliders, walkPieces: RS.walk, zebras: RS.zebra, evenNodes: C.evenStats.nodes,
      fenceKm: RS.fences.km, fenceRuns: RS.fences.runs,
    };
    // крыши (этап 4): формы по C.houses, будки на плоских, треугольники зданий с крышами
    out.roofs = {
      flat: HS.flat || 0, gable: HS.gable || 0, hip: HS.hip || 0, shed: HS.shed || 0, inset: HS.inset || 0,
      huts: C.houses.filter(h => h.roof && h.roof.hut).length, bldTris: W.stats.bld ? W.stats.bld.tris : 0,
      // балконы и карнизы (4.4, js/maps/sitges/facades3d.js)
      balconies: C.facStats ? C.facStats.balconies : 0, cornices: C.facStats ? C.facStats.cornices : 0, facTris: W.stats.fac ? W.stats.fac.tris : 0,
    };
    const why = {};
    for (const e of C.cornerLog) why[e.why] = (why[e.why] || 0) + 1;
    out.corners = { stats: { ...C.cornerStats }, skipped: why };

    /* ---------- ширины ---------- */
    {
      let n = 0, lt5 = 0, lt6 = 0, lt8 = 0, ge8 = 0, both = 0;
      const em = { cw: [], sw: [] };
      for (const st of C.streets) {
        if (!st.drive || !st.K.cw) continue;
        const isEM = /Enric Morera/.test(st.name);
        for (const p of st.v) {
          const w = 2 * p.hw; n++;
          if (w < 5) lt5++; else if (w < 6) lt6++; else if (w < 8) lt8++; else ge8++;
          if (p.sw[0] > 0 && p.sw[1] > 0) both++;
          if (isEM) { em.cw.push(w); em.sw.push(p.sw[0], p.sw[1]); }
        }
      }
      const pc = k => r(100 * k / Math.max(1, n));
      out.width = { points: n, pctLt5: pc(lt5), pct5to6: pc(lt6), pct6to8: pc(lt8), pctGe8: pc(ge8), pctWalkBoth: pc(both),
        enricMorera: { carriage: r(q(em.cw, 0.5), 2), walk: r(q(em.sw, 0.5), 2) } };
    }

    /* ---------- стыки тротуаров у углов ---------- */
    // луч сверху по сетке столкновений тротуаров (на неё встаёт колесо): точка накрыта треугольником верха
    {
      const TC = 4, cells = new Map();
      for (const m of W.meshColliders) for (let t = 0; t < m.i.length; t += 3) {
        const a = m.i[t] * 3, b = m.i[t + 1] * 3, c = m.i[t + 2] * 3, V = m.v;
        const tri = [V[a], V[a + 2], V[b], V[b + 2], V[c], V[c + 2]];
        const ar = (tri[2] - tri[0]) * (tri[5] - tri[1]) - (tri[4] - tri[0]) * (tri[3] - tri[1]);
        if (Math.abs(ar) < 1e-6) continue;                         // вертикальные (бордюры, торцы)
        for (let i = Math.floor(Math.min(tri[0], tri[2], tri[4]) / TC); i <= Math.floor(Math.max(tri[0], tri[2], tri[4]) / TC); i++)
          for (let j = Math.floor(Math.min(tri[1], tri[3], tri[5]) / TC); j <= Math.floor(Math.max(tri[1], tri[3], tri[5]) / TC); j++) {
            const k = i * 65536 + j; let l = cells.get(k); if (!l) cells.set(k, l = []); l.push(tri);
          }
      }
      const side = (ax, az, bx, bz, x, z) => (bx - ax) * (z - az) - (bz - az) * (x - ax);
      const covered = (x, z) => (cells.get(Math.floor(x / TC) * 65536 + Math.floor(z / TC)) || []).some(t => {
        const d0 = side(t[0], t[1], t[2], t[3], x, z), d1 = side(t[2], t[3], t[4], t[5], x, z), d2 = side(t[4], t[5], t[0], t[1], x, z);
        return !((d0 < 0 || d1 < 0 || d2 < 0) && (d0 > 0 || d1 > 0 || d2 > 0));
      });
      let n = 0, gIn = 0, gOut = 0, walkMiss = 0;
      const at = [];
      // точка на середине тротуара в s; null — тротуар есть
      const probe = (st, s, sd, w) => {
        const p = along(st, clamp(s, 0, st.len)), d = (sd ? -1 : 1) * (p.hw + w / 2), x = p.x - p.tz * d, z = p.z + p.tx * d;
        const hit = covered(x, z);
        if (hit && !(W.walkAt(x, z) > -Infinity)) walkMiss++;
        return hit ? null : [r(x), r(z)];
      };
      for (const c of C.corners) for (const X of [c.a, c.b]) {
        if (X.w <= 0.05) continue;
        n++;
        // до касания — внутри углового куска: не дальше половины пути от касания до K
        const e = Math.min(0.3, c.d / 2), a = probe(X.st, X.s - X.dir * e, X.side, X.w), b = probe(X.st, X.s + X.dir * 0.3, X.side, X.w);
        if (a) gIn++;
        if (b) gOut++;
        if ((a || b) && at.length < 30) at.push({ at: a || b, where: a ? 'угол' : 'полоса', street: X.st.name });
      }
      // walkMiss — точка на тротуаре по сетке столкновений, а world.walkAt() её не видит (покрытие, высота поверхности)
      out.seams = { checked: n, gaps: gIn + gOut, gapsCorner: gIn, gapsStrip: gOut, walkMiss, gapsAt: at };
    }

    /* ---------- ровность полотна и крутые места ---------- */
    {
      const dev = [], kink = [], cross = [], steepRaw = [];
      const SIG = 8, HALF = 24, gw = [];
      for (let k = -HALF; k <= HALF; k++) gw.push(Math.exp(-k * k / (2 * SIG * SIG)));
      for (const st of C.streets) {
        if (!st.drive || st.flat || st.len < 10) continue;
        const n = Math.floor(st.len) + 1, ys = new Float64Array(n), P = [];
        for (let i = 0; i < n; i++) {
          const p = along(st, i), v = st.v, a = v[p.i];
          ys[i] = a.deck ? p.y : g(p.x, p.z);
          P.push(p);
          if (!a.deck && p.hw > 1) {
            const e = p.hw - 0.3, yl = g(p.x - p.tz * e, p.z + p.tx * e), yr = g(p.x + p.tz * e, p.z - p.tx * e);
            cross.push(100 * Math.abs(ys[i] - (yl + yr) / 2));
          }
        }
        for (let i = 0; i < n; i++) {
          let sw = 0, sy = 0;
          for (let k = -HALF; k <= HALF; k++) { const j = i + k; if (j < 0 || j >= n) continue; sw += gw[k + HALF]; sy += gw[k + HALF] * ys[j]; }
          dev.push(100 * Math.abs(ys[i] - sy / sw));
          if (i >= 4 && i + 4 < n) kink.push(100 * Math.abs(ys[i + 4] - 2 * ys[i] + ys[i - 4]) / 4);
          if (i >= 5 && i + 5 < n) { const gr = Math.abs(ys[i + 5] - ys[i - 5]) / 10; if (gr > 0.25) steepRaw.push({ x: P[i].x, z: P[i].z, gr, name: st.name }); }
        }
      }
      steepRaw.sort((a, b) => b.gr - a.gr);
      const steep = [];
      for (const s of steepRaw) if (!steep.some(o => Math.hypot(o.x - s.x, o.z - s.z) < 30)) steep.push(s);
      out.even = { samples: dev.length, devMed: r(q(dev, 0.5), 2), dev90: r(q(dev, 0.9), 2), dev99: r(q(dev, 0.99), 2),
        kink90: r(q(kink, 0.9), 2), cross90: r(q(cross, 0.9), 2) };
      out.steep = { count: steep.length, places: steep.map(s => ({ at: [Math.round(s.x), Math.round(s.z)], pct: Math.round(s.gr * 100), street: s.name })) };
    }

    /* ---------- заборы: участки и стили (4а.2) ---------- */
    {
      const FS = C.fenceStats, SS = C.fenceStyleStats || {}, at = {};
      for (const [name, [x, z]] of Object.entries(FENCE_AT)) {
        const f = nearFence(C, x, z);
        at[name] = f ? `${f.f.style.top} / ${f.f.style.base} ${f.f.style.h0}–${f.f.style.h1} м, столбы ${f.f.style.posts}, участок ${f.f.lot}, ${f.d.toFixed(1)} м` : 'нет забора';
      }
      out.fences = { km: FS.km, runs: FS.runs, pieces: FS.pieces, lots: FS.lots, clusters: SS.clusters, joined: SS.joined,
        bare: FS.bare, front: FS.no.front, top: SS.top, base: SS.base, cls: SS.cls, zone: SS.zone, at };
    }
    return out;
  };

  // места заборов с фото (sv/fence, docs/sitges/photos.md): координаты игры
  const FENCE_AT = { 'balmes-39': [1377, -133], 'arcadi-mas-21': [-934, 27], 'valencia-2': [283, 229], 'vinyet-57': [708, 71],
    'corral-fal-6': [-1750, 129], 'pere-pau-sagarra-19': [1135, 86] };
  // ближайший к точке забор: { f, d, x, z, n } (n — нормаль к участку)
  const nearFence = (C, x, z) => {
    let best = null;
    for (const f of C.fences) for (let k = 0; k + 1 < f.P.length; k++) {
      const a = f.P[k], b = f.P[k + 1], d = sitgesSeg(x, z, a[0], a[1], b[0], b[1]);
      if (d < 25 && (!best || d < best.d)) {
        const t = SITGES_SEG.t;
        best = { f, d, x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, n: f.N[k] };
      }
    }
    return best;
  };

  /* ---------- кадры контрольных мест ---------- */
  // цель: { x, z, tx, tz } (направление — вдоль улицы: камера сзади и сбоку) или точка без направления
  const PLACES = C => {
    const longest = re => C.streets.filter(s => re.test(s.name)).sort((a, b) => b.len - a.len)[0];
    const mid = re => { const st = longest(re); return st ? along(st, st.len / 2) : null; };
    const meet = (re1, re2) => {
      let best = null, bd = Infinity;
      for (const a of C.streets.filter(s => re1.test(s.name))) for (const b of C.streets.filter(s => re2.test(s.name)))
        for (const p of a.v) for (const o of b.v) { const d = Math.hypot(p.x - o.x, p.z - o.z); if (d < bd) { bd = d; best = { x: p.x, z: p.z, tx: p.tx, tz: p.tz }; } }
      return best;
    };
    const deckOf = re => { for (const st of C.streets) if (re.test(st.name)) for (const p of st.v) if (p.deck) return p; return null; };
    const under = C.unders.slice().sort((a, b) => b.dip - a.dip)[0];
    const poi = re => { const p = C.pois.find(o => re.test(o.name)); return p ? { x: p.x, z: p.z } : null; };
    return {
      ribera: mid(/Passeig de la Ribera/),
      'enric-morera': mid(/Enric Morera/),
      'sant-antoni': meet(/Carrer de Sant Antoni/, /Bassa Rodona/),
      'fonollar-maricel': mid(/Fonollar/),
      balmes: mid(/Balmes/),               // заборы вилл Террамара (решение 4)
      overpass: under ? { x: under.x, z: under.z } : null,
      'vilanova-bridge': deckOf(/Passeig de Vilanova/),
      church: poi(/Bartomeu/),
      marina: poi(/Aiguadol/) || { x: -1559, z: -392 },
      // заборы у мест с фото: камера на улице перед забором (near)
      ...Object.fromEntries(Object.entries(FENCE_AT).map(([k, [x, z]]) => {
        const f = nearFence(C, x, z);
        return ['fence-' + k, f ? { x: f.x, z: f.z, near: f.n } : null];
      })),
    };
  };
  window.__sitgesShots = async function ({ w = 1280, h = 720, only = null } = {}) {
    const D = getData('sitges'), W = getWorld('sitges'), g = D.ground;
    activateWorld('sitges');
    const cam = new THREE.PerspectiveCamera(55, w / h, 0.3, 3200), png = {}, missing = [];
    const prev = new THREE.Vector2(); renderer.getSize(prev);
    const pr = renderer.getPixelRatio();
    renderer.setPixelRatio(1); renderer.setSize(w, h, false);
    for (const [name, P] of Object.entries(PLACES(D.C))) {
      if (only && !only.includes(name)) continue;
      if (!P) { missing.push(name); continue; }
      const y = g(P.x, P.z), tx = P.tx ?? 0.6, tz = P.tz ?? 0.8;
      // сзади по улице 26 м, сбоку 10 м, выше 16 м; у забора (near — нормаль к участку) — с улицы в 11 м, наискось, 4 м
      if (P.near) cam.position.set(P.x - P.near[0] * 11 + P.near[1] * 5, y + 4, P.z - P.near[1] * 11 - P.near[0] * 5);
      else cam.position.set(P.x - tx * 26 - tz * 10, y + 16, P.z - tz * 26 + tx * 10);
      cam.lookAt(P.x, y + 1, P.z);
      cam.updateMatrixWorld();
      aimSun(P.x, y, P.z);
      if (W.cullView) W.cullView(cam.position.x, cam.position.z);
      renderer.shadowMap.needsUpdate = true;
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, w, h);
      renderer.render(scene, cam);
      png[name] = renderer.domElement.toDataURL('image/jpeg', 0.85);
    }
    renderer.setPixelRatio(pr); renderer.setSize(prev.x, prev.y, false);
    return { png, missing };
  };
})();
