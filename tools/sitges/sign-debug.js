// Отладка вывесок «Ситжеса» (этап 6а.1): где стоят и почему нет. Не часть игры — подгружается в страницу:
//   node tools/cdp.js --inject tools/sitges/fence-debug.js --inject tools/sitges/sign-debug.js --eval "await __signMap(['Passeig de la Ribera 20'])" --dir shots
//   node tools/cdp.js --inject tools/sitges/fence-debug.js --inject tools/sitges/sign-debug.js --eval "JSON.stringify(__signInfo())"
//   (fence-debug.js — ради поиска по адресу __sitgesFind; место — «улица номер» или [имя, x, z], как у __fenceMap)
// __signMap(места, { R = 45, px = 10 }) → { png } — схема сверху R м вокруг точки: проезжая часть (серая), тротуары
//   (сиреневые), дома (части строений h.lm — темнее), куски фасада к улице (жилые — синие, магазины — оранжевые),
//   плиты балконов (зелёные), заведения OSM (кружки: залитый — есть вывеска, пустой — нет), вывески — отрезок лица
//   цветом формы (SIGN_DBG_COL) и нормаль; у флажка, креста и маркизы — вынос по нормали. Подписи — текст вывесок
//   (типовые — курсивом); легенда — на картинке.
// __signInfo() → сводка C.signStats и число уникальных ключей атласа.
(() => {
  const SIGN_DBG_COL = { board: '#e00', blade: '#a0f', awning: '#f80', cross: '#0a0', letters: '#00c', totem: '#088', canopy: '#a60' };

  window.__signInfo = () => {
    const C = getData('sitges').C;
    return { ...C.signStats, keys: new Set(C.signs.map(s => s.key)).size };
  };

  window.__signMap = async function (list, { R = 45, px = 10 } = {}) {
    const C = getData('sitges').C, S = SITGES_SIGNS, W = SITGES_WALL, png = {};
    const venues = sitgesVenues();
    const place = p => {
      if (Array.isArray(p)) return p;
      const f = (__sitgesFind([p])[p] || [])[0];
      if (!f) throw new Error('адрес не найден: ' + p);
      return [p.replace(/[^\p{L}\d]+/gu, '-'), f.x, f.z];
    };
    for (const p of list) {
      const [name, cx, cz] = place(p), N = Math.round(R * 2 * px), cv = document.createElement('canvas');
      cv.width = cv.height = N;
      const g = cv.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, N, N);
      const X = x => (x - cx + R) * px, Z = z => (z - cz + R) * px, M = R + 20;
      const near = pts => pts.some(q => Math.abs(q[0] - cx) < M && Math.abs(q[1] - cz) < M);
      const poly = (r, fill, stroke, lw = 1) => {
        g.beginPath(); r.forEach((q, i) => i ? g.lineTo(X(q[0]), Z(q[1])) : g.moveTo(X(q[0]), Z(q[1]))); g.closePath();
        if (fill) { g.fillStyle = fill; g.fill(); }
        if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
      };
      const seg = (ax, az, bx, bz, col, lw) => { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); g.moveTo(X(ax), Z(az)); g.lineTo(X(bx), Z(bz)); g.stroke(); };
      // проезжая часть: растр по точкам carriageAt (шаг 0,5 м)
      g.fillStyle = '#ddd';
      for (let x = cx - R; x < cx + R; x += 0.5) for (let z = cz - R; z < cz + R; z += 0.5) if (C.carriageAt(x, z)) g.fillRect(X(x), Z(z), px * 0.5 + 0.5, px * 0.5 + 0.5);
      for (const w of C.walks) if (near([w.O0])) poly([w.I0, w.I1, w.O1, w.O0], '#e4e0f4', null);
      for (const h of C.houses) if (near(h.rings[0])) poly(h.rings[0], h.lm ? '#a99' : '#e8d8d0', '#866');
      for (const h of C.houses) if (near(h.rings[0])) for (const w of h.walls) {
        if (w.kind === W.street) seg(w.ax, w.az, w.bx, w.bz, '#59f', 3);
        if (w.kind === W.shops) seg(w.ax, w.az, w.bx, w.bz, '#fb5', 3);
      }
      for (const b of C.balconies) if (near([[b.ax, b.az]])) poly([[b.ax, b.az], [b.bx, b.bz], [b.bx + b.nx * b.d, b.bz + b.nz * b.d], [b.ax + b.nx * b.d, b.az + b.nz * b.d]], 'rgba(0,160,0,0.25)', '#0a0');
      // вывески
      g.font = '11px sans-serif';
      for (const s of C.signs) {
        if (!near([[s.x, s.z]])) continue;
        const col = SIGN_DBG_COL[s.form], tx = -s.nz, tz = s.nx;
        let ax, az, bx, bz;
        if (s.form === 'blade' || s.form === 'cross') {
          // лицо поперёк стены: от стены по нормали
          const o = s.form === 'cross' ? S.cross.out : S.blade.out;
          ax = s.x + s.nx * (o - s.w / 2); az = s.z + s.nz * (o - s.w / 2); bx = s.x + s.nx * (o + s.w / 2); bz = s.z + s.nz * (o + s.w / 2);
          seg(s.x, s.z, ax, az, col, 1);
          seg(ax, az, bx, bz, col, 5);
        } else if (s.form === 'awning') {
          const d = S.awning.d;
          poly([[s.x - tx * s.w / 2, s.z - tz * s.w / 2], [s.x + tx * s.w / 2, s.z + tz * s.w / 2],
            [s.x + tx * s.w / 2 + s.nx * d, s.z + tz * s.w / 2 + s.nz * d], [s.x - tx * s.w / 2 + s.nx * d, s.z - tz * s.w / 2 + s.nz * d]], 'rgba(255,136,0,0.35)', col, 2);
        } else {
          ax = s.x - tx * s.w / 2; az = s.z - tz * s.w / 2; bx = s.x + tx * s.w / 2; bz = s.z + tz * s.w / 2;
          seg(ax, az, bx, bz, col, s.form === 'canopy' ? 8 : 4);
          seg(s.x, s.z, s.x + s.nx * 1.5, s.z + s.nz * 1.5, col, 1);
        }
        g.fillStyle = '#000'; g.font = (s.generic ? 'italic ' : '') + '11px sans-serif';
        const lx = X(s.x + s.nx * 2.5), lz = Z(s.z + s.nz * 2.5);
        if (s.text) g.fillText(`${s.text} ${s.y.toFixed(1)}`, lx, lz);
      }
      // заведения: залитый кружок — есть вывеска (вывеска с тем же текстом ближе 20 м)
      for (const v of venues) {
        if (!near([[v.x, v.z]])) continue;
        const has = C.signs.some(s => !s.generic && Math.hypot(s.x - v.x, s.z - v.z) < 20 && (s.text === v.name || s.brand === v.brand && v.brand || s.cat === v.cat && v.cat === 'pharmacy'));
        g.strokeStyle = '#c0c'; g.fillStyle = '#c0c'; g.lineWidth = 2;
        g.beginPath(); g.arc(X(v.x), Z(v.z), 5, 0, 7); has ? g.fill() : g.stroke();
        g.fillStyle = '#808'; g.font = '10px sans-serif'; g.fillText(`${v.cat}: ${v.name || v.brand}`, X(v.x) + 7, Z(v.z) + 12);
      }
      g.fillStyle = '#00f'; g.beginPath(); g.arc(X(cx), Z(cz), 4, 0, 7); g.fill();
      // подпись и легенда
      const keys = Object.keys(SIGN_DBG_COL);
      g.font = '14px sans-serif'; g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(0, 0, 360, 26 + 16 * (keys.length + 3));
      g.fillStyle = '#00f'; g.fillText(`${name} (${Math.round(cx)}, ${Math.round(cz)}), 1 м = ${px} пикс.`, 8, 18);
      keys.forEach((k, i) => { g.fillStyle = SIGN_DBG_COL[k]; g.fillRect(8, 28 + 16 * i, 24, 5); g.fillStyle = '#000'; g.fillText(k, 40, 35 + 16 * i); });
      const L2 = [['#59f', 'фасад к улице (жилой)'], ['#fb5', 'фасад с витринами'], ['#c0c', 'заведение OSM (пустое — без вывески)']];
      L2.forEach(([c, t], i) => { const y = 28 + 16 * (keys.length + i); g.fillStyle = c; g.fillRect(8, y, 24, 5); g.fillStyle = '#000'; g.fillText(t, 40, y + 7); });
      png[name] = cv.toDataURL('image/png');
    }
    return { png };
  };
})();
