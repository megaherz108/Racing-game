// Отладка заборов «Ситжеса»: где дыра и почему. Не часть игры — подгружается в страницу:
//   node tools/cdp.js --inject tools/sitges/fence-debug.js --eval "await __fenceMap(['Vinyet 44', 'Balmes 19'])" --dir shots
//   node tools/cdp.js --inject tools/sitges/fence-debug.js --eval "await __fenceShots(['Vinyet 44'])" --dir shots
//   node tools/cdp.js --inject tools/sitges/fence-debug.js --eval "JSON.stringify(__sitgesFind(['Josep Roig 28']))"
//   (в консоли: (0, eval)(await (await fetch('tools/sitges/fence-debug.js')).text()); await __fenceMap(['Vinyet 44']))
// Место — строка адреса «улица номер» (улица — часть названия кадастра без учёта регистра, номер — как в кадастре:
//   «Vinyet 44», «Armengol 18», «Roig 28») или [имя, x, z] — координаты игры.
// __sitgesFind(места) → { место: [{ bi, x, z, адрес }] } — здания по адресу кадастра (SITGES_ADR), x, z — вход.
// __fenceMap(места, { R = 40, px = 12 }) → { png } — схема сверху R м вокруг точки (px пикселей на метр): тротуары
//   (сиреневые), дома, участки кадастра (зелёные контуры), отрезки линии забора C.fenceLine кусками ≈ 1 м цветом
//   причины «забора нет» из C.fenceWhy (до заполнения дыр и сведения концов), поверх — итоговые заборы C.fences
//   (тёмные) и их концы не на разрезе (красные точки), концы отрезков линии (чёрные квадратики), точка места (синяя).
//   Цвета причин — FENCE_DBG_COL ниже; легенда — на картинке.
// __fenceShots(места, { w, h }) → { png } — кадры в 3D: камера с улицы (против нормали ближайшего забора) в 12 м,
//   на высоте 4 м; [имя, x, z, cx, cz, h] — камера в (cx, cz) на h м над землёй.
// Тот же разбор по всему городу — __sitgesCheck(), группа holes (tools/sitges/check.js).
(() => {
  const FENCE_DBG_COL = { null: '#0a0', lot: '#999', inner: '#0cc', house: '#d00', front: '#f0f', road: '#f80', walk: '#08f',
    path: '#a0f', water: '#0ff', bare: '#bb0' };
  const FENCE_DBG_NAME = { null: 'забор нужен', lot: 'нет участка', inner: 'дорога внутри участка', house: 'дом вплотную',
    front: 'дом от 3 эт. ≤ 2,5 м', road: 'улица', walk: 'тротуар', path: 'дорожка', water: 'вода / край карты', bare: 'участок без домов' };

  // адреса кадастра: [{ bi, parts: [[улица, [номера]]], x, z }]
  let ADR = null;
  const addresses = () => {
    if (ADR) return ADR;
    const m = sitgesDec(SITGES_ADR.m), num = v => v ? (v >> 5) + (v & 31 ? String.fromCharCode(64 + (v & 31)) : '') : 's/n';
    ADR = [];
    for (let i = 0, bi = 0; i < m.length; bi++) {
      const ns = m[i++], parts = [];
      for (let s = 0; s < ns; s++) { const st = SITGES_ADR.streets[m[i] - 1], k = m[i + 1]; parts.push([st, m.slice(i + 2, i + 2 + k).map(num)]); i += 2 + k; }
      if (ns) { ADR.push({ bi, parts, x: m[i] / 10, z: m[i + 1] / 10 }); i += 2; }
    }
    return ADR;
  };
  const findOne = q => {
    const mm = /^(.*\S)\s+(\d+[A-Z]?)$/i.exec(q.trim());
    if (!mm) return [];
    const re = new RegExp(mm[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), n = mm[2].toUpperCase();
    return addresses().filter(a => a.parts.some(([st, v]) => re.test(st) && v.includes(n)))
      .map(a => ({ bi: a.bi, x: a.x, z: a.z, adr: a.parts.map(([st, v]) => st + ' ' + v.join(',')).join(' · ') }));
  };
  window.__sitgesFind = list => Object.fromEntries(list.map(q => [q, findOne(q)]));
  // место → [имя, x, z, ...]
  const place = p => {
    if (Array.isArray(p)) return p;
    const f = findOne(p)[0];
    if (!f) throw new Error('адрес не найден: ' + p);
    return [p.replace(/[^\p{L}\d]+/gu, '-'), f.x, f.z];
  };

  window.__fenceMap = async function (list, { R = 40, px = 12 } = {}) {
    const C = getData('sitges').C, L = C.fenceLine, why = C.fenceWhy, png = {};
    for (const p of list) {
      const [name, cx, cz] = place(p), W = Math.round(R * 2 * px), cv = document.createElement('canvas');
      cv.width = cv.height = W;
      const g = cv.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, W, W);
      const X = x => (x - cx + R) * px, Z = z => (z - cz + R) * px, M = R + 20;
      const near = pts => pts.some(q => Math.abs(q[0] - cx) < M && Math.abs(q[1] - cz) < M);
      const poly = (r, fill, stroke, lw = 1) => {
        g.beginPath(); r.forEach((q, i) => i ? g.lineTo(X(q[0]), Z(q[1])) : g.moveTo(X(q[0]), Z(q[1]))); g.closePath();
        if (fill) { g.fillStyle = fill; g.fill(); }
        if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
      };
      const seg = (a, b, col, lw) => { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); g.moveTo(X(a[0]), Z(a[1])); g.lineTo(X(b[0]), Z(b[1])); g.stroke(); };
      for (const w of C.walks) if (near([w.O0])) poly([w.I0, w.I1, w.O1, w.O0], '#dde', null);
      for (const h of C.houses) if (near(h.rings[0])) poly(h.rings[0], '#cbb', '#866');
      for (const q of C.parcels) if (!q.rustic && near(q.ring)) poly(q.ring, null, '#4a4', 1.5);
      // куски линии цветом причины
      L.forEach((e, i) => {
        if (!near([e.A, e.B])) return;
        const k = why[i].length;
        for (let j = 0; j < k; j++) {
          const p0 = [e.A[0] + (e.B[0] - e.A[0]) * j / k, e.A[1] + (e.B[1] - e.A[1]) * j / k], p1 = [e.A[0] + (e.B[0] - e.A[0]) * (j + 1) / k, e.A[1] + (e.B[1] - e.A[1]) * (j + 1) / k];
          seg(p0, p1, FENCE_DBG_COL[why[i][j]] || '#000', 3);
        }
      });
      // заборы, их концы, концы отрезков линии
      for (const f of C.fences) if (near(f.P)) {
        g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 5; g.beginPath();
        f.P.forEach((q, i) => i ? g.lineTo(X(q[0]), Z(q[1])) : g.moveTo(X(q[0]), Z(q[1]))); g.stroke();
      }
      g.fillStyle = '#000';
      for (const e of L) if (near([e.A])) g.fillRect(X(e.A[0]) - 2, Z(e.A[1]) - 2, 4, 4);
      g.fillStyle = '#e00';
      for (const f of C.fences) if (near(f.P)) for (const [k, c] of [[0, f.cut[0]], [f.P.length - 1, f.cut[1]]]) if (!c) { g.beginPath(); g.arc(X(f.P[k][0]), Z(f.P[k][1]), 5, 0, 7); g.fill(); }
      g.fillStyle = '#00f'; g.beginPath(); g.arc(X(cx), Z(cz), 6, 0, 7); g.fill();
      // подпись и легенда
      g.font = '16px sans-serif'; g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(0, 0, 330, 24 + 18 * Object.keys(FENCE_DBG_COL).length);
      g.fillStyle = '#00f'; g.fillText(`${name} (${Math.round(cx)}, ${Math.round(cz)}), 1 м = ${px} пикс.`, 8, 18);
      Object.entries(FENCE_DBG_COL).forEach(([k, c], i) => { g.fillStyle = c; g.fillRect(8, 30 + 18 * i, 24, 5); g.fillStyle = '#000'; g.fillText(FENCE_DBG_NAME[k], 40, 38 + 18 * i); });
      png[name] = cv.toDataURL('image/png');
    }
    return { png };
  };

  window.__fenceShots = async function (list, { w = 1280, h = 720 } = {}) {
    const D = getData('sitges'), W = getWorld('sitges'), C = D.C, g = D.ground;
    activateWorld('sitges');
    const cam = new THREE.PerspectiveCamera(60, w / h, 0.3, 3200), png = {};
    const prev = new THREE.Vector2(); renderer.getSize(prev);
    const pr = renderer.getPixelRatio();
    renderer.setPixelRatio(1); renderer.setSize(w, h, false);
    for (const p of list) {
      let [name, x, z, cx, cz, ch = 4] = place(p);
      if (cx === undefined) {
        // ближайший забор: камера с улицы, против нормали, в 12 м и чуть вбок
        let best = 1e9, n = [0, 1];
        for (const f of C.fences) for (let k = 0; k < f.P.length; k++) { const d = Math.hypot(f.P[k][0] - x, f.P[k][1] - z); if (d < best) { best = d; n = f.N[k]; } }
        cx = x - n[0] * 12 + n[1] * 4; cz = z - n[1] * 12 - n[0] * 4;
      }
      const y = g(x, z);
      cam.position.set(cx, g(cx, cz) + ch, cz); cam.lookAt(x, y + 0.8, z); cam.updateMatrixWorld();
      aimSun(x, y, z);
      if (W.cullView) W.cullView(cx, cz);
      renderer.shadowMap.needsUpdate = true; renderer.setScissorTest(false); renderer.setViewport(0, 0, w, h);
      renderer.render(scene, cam);
      png[name] = renderer.domElement.toDataURL('image/jpeg', 0.85);
    }
    renderer.setPixelRatio(pr); renderer.setSize(prev.x, prev.y, false);
    return { png };
  };
})();
