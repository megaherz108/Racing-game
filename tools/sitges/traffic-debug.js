// Отладка графа трафика «Ситжеса» (js/maps/sitges/trafficnet.js, шаг 8.0). Не часть игры — подгружается в страницу:
//   node tools/cdp.js --inject tools/sitges/traffic-debug.js --eval "await __netInfo()"
//   node tools/cdp.js --inject tools/sitges/traffic-debug.js --eval "await __netMap()" --dir shots
//   node tools/cdp.js --inject tools/sitges/traffic-debug.js --eval "await __netMap([['ring', 91, 296, 70]])" --dir shots
//   (в консоли: (0, eval)(await (await fetch('tools/sitges/traffic-debug.js')).text()); await __netInfo())
// __netGraph() — граф (строится один раз на загрузку страницы: мир «Ситжеса» тоже строится, если его ещё нет).
// __netInfo() → сводка G.report + время постройки (ms) + hy: расхождение высоты полосы с поверхностью мира
//   (world.surface у точек полос; max и число точек больше 0,5 м).
// __netMap(места, { px }) → { png } — схема сверху (как мини-карта: +z вверху, +x слева). Место — [имя, x, z, R]
//   (R — полуразмер, м) или 'all' — вся карта; без аргумента — вся карта и 4 района (NET_DBG_PLACES).
//   Серое — проезжая часть улиц, бежевое — без трафика (пешеходные, жилые зоны), дома — светлые; отброшенное — цветом
//   причины; полосы — цветом скорости (красный — медленно, зелёный — быстро) со стрелками; подложка синяя — широкие
//   (автобусы, грузовики), сиреневая — не для Hummer; чёрная черта у конца полосы — второстепенный въезд, кружок —
//   STOP (красный) / «уступи» (оранжевый); кольца — синие окружности радиуса полосы; светофор — зелёный квадрат;
//   красный крест — полоса задевает предмет и объехать не вышло.
(() => {
  const NET_DBG_PLACES = ['all', ['old-town', -640, 80, 190], ['terramar', 1450, 80, 330], ['ribera', -250, -60, 260], ['ring-91-296', 91, 296, 70]];
  const NET_DBG_DROP = { 'узкая': '#ff9a2e', 'тупик': '#9a9a9a', 'петля': '#c040c0', 'ловушка': '#e00000' };
  let G = null;
  const W = () => getWorld('sitges');
  window.__netGraph = () => G || (G = sitgesTrafficGraph(getData('sitges').C, W().grid, W().ground));

  window.__netInfo = async function () {
    const t0 = performance.now(), g = __netGraph(), ms = Math.round(performance.now() - t0), w = W();
    let max = 0, bad = 0, n = 0, at = null;
    for (const e of g.edges) {
      const P = e.lp[0].pts;
      for (let i = 0; i < P.length; i += 2) {
        const y = w.surface(P[i][0], P[i][1], e.hy[i] + 1.5), d = Math.abs(y - e.hy[i]);
        n++;
        if (d > 0.5) bad++;
        if (d > max) { max = d; at = [Math.round(P[i][0]), Math.round(P[i][1]), e.name || e.cls]; }
      }
    }
    return Object.assign({ ms, hy: { pts: n, max: +max.toFixed(2), over05: bad, at } }, g.report);
  };

  window.__netMap = async function (list = NET_DBG_PLACES, { px } = {}) {
    const C = getData('sitges').C, g = __netGraph(), png = {};
    for (const p of list) {
      const all = p === 'all';
      const [name, cx, cz, R] = all ? ['all', 0, 0, 0] : p;
      const k = px || (all ? 0.5 : Math.min(8, 1400 / (2 * R)));
      const hx = all ? C.HX : R, hz = all ? C.HZ : R;
      const cv = document.createElement('canvas');
      cv.width = Math.round(2 * hx * k); cv.height = Math.round(2 * hz * k);
      const c = cv.getContext('2d');
      // как мини-карта: +z вверху, +x слева
      const X = x => (cx - x + hx) * k, Z = z => (cz - z + hz) * k;
      const near = (x, z, m = 30) => Math.abs(x - cx) < hx + m && Math.abs(z - cz) < hz + m;
      c.fillStyle = '#f6f5f0'; c.fillRect(0, 0, cv.width, cv.height);
      c.lineCap = 'round'; c.lineJoin = 'round';
      const path = pts => { c.beginPath(); pts.forEach((q, i) => i ? c.lineTo(X(q[0]), Z(q[1])) : c.moveTo(X(q[0]), Z(q[1]))); };
      const along = (st, s0, s1) => {
        const out = [];
        for (const q of st.v) if (q.s >= s0 - 0.01 && q.s <= s1 + 0.01) out.push([q.x, q.z]);
        return out;
      };
      // дома
      if (!all) {
        c.fillStyle = '#e3dccf';
        for (const h of C.houses) { const r = h.rings[0]; if (!near(r[0][0], r[0][1], 40)) continue; path(r); c.closePath(); c.fill(); }
      }
      // проезжая часть
      for (const st of C.streets) {
        if (!(st.drive || st.cls === 'pedestrian') || st.flat || !st.v.some(q => near(q.x, q.z))) continue;
        c.strokeStyle = SITGES_NET.prio[st.cls] ? '#c9c9c9' : '#e6dcc4';
        c.lineWidth = Math.max(1, 2 * median(st.v.map(q => q.hw)) * k);
        path(st.v.map(q => [q.x, q.z])); c.stroke();
      }
      // отброшенное
      for (const d of g.dropped) {
        const pts = along(d.st, d.s0, d.s1);
        if (pts.length < 2 || !pts.some(q => near(q[0], q[1]))) continue;
        c.strokeStyle = NET_DBG_DROP[d.why] || '#000'; c.lineWidth = Math.max(2, 3 * k);
        path(pts); c.stroke();
      }
      // подложки: широкие, не для Hummer
      for (const e of g.edges) {
        const P = e.lp[0].pts;
        if (!P.some(q => near(q[0], q[1]))) continue;
        if (!e.noLong) { c.strokeStyle = 'rgba(40,80,255,0.45)'; c.lineWidth = Math.max(3, 2.6 * k); path(P); c.stroke(); }
        if (e.maxW < 2.2) { c.strokeStyle = 'rgba(230,60,230,0.55)'; c.lineWidth = Math.max(3, 2.6 * k); path(P); c.stroke(); }
      }
      // полосы цветом скорости, стрелки
      for (const e of g.edges) {
        const P = e.lp[0].pts;
        if (!P.some(q => near(q[0], q[1]))) continue;
        c.lineWidth = Math.max(1, Math.min(2.5, 0.35 * k));
        for (let i = 1; i < P.length; i++) {
          c.strokeStyle = `hsl(${Math.min(1, e.vprof[i] / 11) * 120},90%,40%)`;
          c.beginPath(); c.moveTo(X(P[i - 1][0]), Z(P[i - 1][1])); c.lineTo(X(P[i][0]), Z(P[i][1])); c.stroke();
        }
        if (k >= 1.5) {
          const piece = e.lp[0], tp = [0, 0, 0, 0];
          c.fillStyle = '#222';
          for (let s = 6; s < piece.len - 3; s += 18) {
            tPieceAt(piece, s, tp);
            const x = X(tp[0]), z = Z(tp[1]), fx = -tp[2], fz = -tp[3], a = Math.max(2, 0.6 * k);   // экран: оси развёрнуты
            c.beginPath(); c.moveTo(x + fx * a * 1.6, z + fz * a * 1.6); c.lineTo(x - fx * a + fz * a, z - fz * a - fx * a); c.lineTo(x - fx * a - fz * a, z - fz * a + fx * a); c.closePath(); c.fill();
          }
        }
        // конец полосы: второстепенный въезд, знаки
        const E = P[P.length - 1];
        if (k >= 1.5 && e.B.deg > 2 && !e.major) {
          const a = Math.max(3, 0.9 * k);
          c.strokeStyle = '#000'; c.lineWidth = Math.max(1.5, 0.3 * k);
          c.beginPath(); c.moveTo(X(E[0]) - e.ez * a, Z(E[1]) + e.ex * a); c.lineTo(X(E[0]) + e.ez * a, Z(E[1]) - e.ex * a); c.stroke();
        }
        if (e.sign) { c.fillStyle = e.sign === 'stop' ? '#e00' : '#f90'; c.beginPath(); c.arc(X(E[0]), Z(E[1]), Math.max(3, 0.8 * k), 0, 7); c.fill(); }
      }
      // узлы
      for (const n of g.nodes) {
        if (!near(n.x, n.z)) continue;
        if (n.round) { c.strokeStyle = '#1060ff'; c.lineWidth = Math.max(1.5, 0.4 * k); c.beginPath(); c.arc(X(n.x), Z(n.z), n.round * k, 0, 7); c.stroke(); }
        else { c.fillStyle = '#333'; c.beginPath(); c.arc(X(n.x), Z(n.z), Math.max(1.2, 0.5 * k), 0, 7); c.fill(); }
        if (n.sig) { const a = Math.max(4, 1.5 * k); c.strokeStyle = '#0a0'; c.lineWidth = 2; c.strokeRect(X(n.x) - a, Z(n.z) - a, 2 * a, 2 * a); }
      }
      // не объехали
      c.strokeStyle = '#e00'; c.lineWidth = 2;
      for (const [x, z] of g.report.blocked) if (near(x, z)) { const a = 5; c.beginPath(); c.moveTo(X(x) - a, Z(z) - a); c.lineTo(X(x) + a, Z(z) + a); c.moveTo(X(x) + a, Z(z) - a); c.lineTo(X(x) - a, Z(z) + a); c.stroke(); }
      // легенда
      const leg = [['полоса (цвет — скорость)', 'hsl(80,90%,40%)'], ['широкая (автобус, грузовик)', 'rgba(40,80,255,0.6)'], ['не для Hummer', 'rgba(230,60,230,0.7)'],
        ...Object.entries(NET_DBG_DROP).map(([w, col]) => ['без трафика: ' + w, col]), ['STOP / «уступи»', '#e00'], ['кольцо', '#1060ff']];
      c.fillStyle = 'rgba(255,255,255,0.85)'; c.fillRect(6, 6, 250, 22 + leg.length * 16);
      c.font = '12px sans-serif'; c.fillStyle = '#000';
      c.fillText(`${name} · ${k.toFixed(2)} px/м · +z вверх, +x влево`, 12, 20);
      leg.forEach(([t, col], i) => { c.fillStyle = col; c.fillRect(12, 28 + i * 16, 22, 8); c.fillStyle = '#000'; c.fillText(t, 40, 36 + i * 16); });
      png['net-' + name] = cv.toDataURL('image/png');
    }
    return { png };
  };
  const median = a => { const b = a.slice().sort((p, q) => p - q); return b[b.length >> 1] || 0; };
})();
