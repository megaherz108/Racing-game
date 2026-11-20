// Ситжес — достопримечательность: ратуша (Ajuntament de Sitges, 1889, арх. Salvador Vinyals) (этап 5,
// docs/sitges/stage-5.md, замеры и источники — docs/sitges/lm-a.md). Как устроен объект строения —
// js/maps/sitges/landmarks.js (раскладка, C.landmarks) и js/maps/sitges/landmarks3d.js (помощники lm*).
//   Отдельно стоящий квартал 23,7 × 20,5 м на Plaça de l'Ajuntament: охристая штукатурка, серый каменный цоколь,
//   три этажа, главный фасад на запад — выступ с тремя арками входа, балкон с балюстрадой на всю ширину выступа,
//   ряд из пяти арочных окошек под карнизом, ступенчатый аттик; угловые пилоны выше парапета, карниз на консолях;
//   за парапетом низкая вальма (лидар: парапет +14,1, верх крыши +16,4).
//   Местные оси: u — от западного фасада вглубь (на восток), v — вдоль фасада от юго-западного угла на север.
// Определяет: LMTH, SITGES_LM_TOWNHALL.
// Использует: lmMat, lmBox, lmExtrude, lmRoof, lmCollide, lmArch (js/maps/sitges/landmarks3d.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const LMTH = {
  o: [-570.7, -167.7],            // юго-западный угол (кадастр)
  e: [-0.952, -0.307],            // вглубь, на восток (по северной стене кадастра)
  len: 23.7, wid: 20.5,           // вдоль u (северная и южная стены), вдоль v (западный фасад)
  f1: 5.0, f2: 9.4, f3: 12.4, par: 14.1, roof: 16.4,   // пояса над землёй: этажи, карниз, парапет, верх вальмы
  mid: [5.2, 15.3],               // выступ главного фасада (v)
};

const SITGES_LM_TOWNHALL = {
  ready: true,
  plan(C, L) {},
  build(K, L, group) {
    const Q = LMTH, gr = (x, z) => K.D.ground(x, z), [ex, ez] = Q.e, N = [ez, -ex];
    const W = (u, v) => [Q.o[0] + u * ex + v * N[0], Q.o[1] + u * ez + v * N[1]];
    const R = Math.atan2(-ez, ex), F = R + Math.PI / 2;
    const ring = [W(0, 0), W(Q.len, 0), W(Q.len, Q.wid), W(0, Q.wid)];
    const g = Math.max(...ring.map(([x, z]) => gr(x, z))), y0 = Math.min(...ring.map(([x, z]) => gr(x, z))) - 0.6;
    const M = {
      wall: lmMat(0xf2c08c, { tex: 'plaster' }), trim: lmMat(0xf4e2c2, { tex: 'plaster' }), base: lmMat(0xbdb7aa, { tex: 'stone' }),
      tile: lmMat(0xa8603d, { tex: 'tile' }), dark: lmMat(0x26221e, { rough: 0.6 }),
    };
    const box = (mat, u, v, w, h, d, y, rot = R) => { const [x, z] = W(u, v); return lmBox(group, mat, w, h, d, x, y, z, rot); };
    const rect = (w, h) => { const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h); s.lineTo(-w / 2, h); s.lineTo(-w / 2, 0); return s; };
    // проём: тёмный, в выступающей раме (рама — кольцо, проём утоплен); arch — арочный верх
    const win = (u, v, y, rot, w, h, { arch = false, f = 0.2, mat = M.trim } = {}) => {
      const sh = arch ? lmArch : rect, [x, z] = W(u, v);
      const outer = sh(w + 2 * f, h + 2 * f);
      outer.holes.push(new THREE.Path(sh(w, h).getPoints().map(p => new THREE.Vector2(p.x, p.y + f))));
      lmExtrude(group, mat, outer, 0.3, x, y - f, z, rot);
      lmExtrude(group, M.dark, sh(w, h), 0.1, x, y, z, rot);
    };
    const G = g;

    /* ---------- объём, цоколь, пояса, карниз, парапет ---------- */
    box(M.wall, Q.len / 2, Q.wid / 2, Q.len, G + Q.par - y0, Q.wid, y0);
    box(M.base, Q.len / 2, Q.wid / 2, Q.len + 0.2, G + 1.3 - y0, Q.wid + 0.2, y0);
    for (const [y, h, o] of [[Q.f1, 0.3, 0.25], [Q.f2, 0.25, 0.2], [Q.f3, 0.35, 0.45]]) box(M.trim, Q.len / 2, Q.wid / 2, Q.len + o, h, Q.wid + o, G + y);
    // консоли под карнизом (по периметру через 0,7 м) и плита карниза
    for (const [a, b, n] of [[[0, 0], [Q.len, 0], R], [[0, Q.wid], [Q.len, Q.wid], R], [[0, 0], [0, Q.wid], F], [[Q.len, 0], [Q.len, Q.wid], F]]) {
      const L2 = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.round(L2 / 0.7);
      for (let i = 1; i < k; i++) { const t = i / k; box(M.trim, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 0.22, 0.45, 0.22, G + Q.f3 + 0.35, n); }
    }
    box(M.trim, Q.len / 2, Q.wid / 2, Q.len + 1.1, 0.3, Q.wid + 1.1, G + Q.f3 + 0.8);
    box(M.trim, Q.len / 2, Q.wid / 2, Q.len + 0.3, 0.2, Q.wid + 0.3, G + Q.par);
    // угловые пилоны выше парапета
    for (const [u, v] of [[0, 0], [Q.len, 0], [0, Q.wid], [Q.len, Q.wid]]) {
      box(M.wall, u, v, 1.3, G + Q.par + 0.9 - y0, 1.3, y0);
      box(M.trim, u, v, 1.5, 0.25, 1.5, G + Q.par + 0.9);
      box(M.trim, u, v, 0.6, 0.5, 0.6, G + Q.par + 1.15);
    }
    // вальма за парапетом, световой фонарь двора
    {
      const [cx, cz] = W(Q.len / 2, Q.wid / 2);
      lmRoof(group, M.tile, { cx, cz, ux: ex, uz: ez, vx: N[0], vz: N[1], len: Q.len - 1.6, wid: Q.wid - 1.6 }, G + Q.par - 0.2, { kind: 'hip', pitch: 22, over: 0 });
      const [sx, sz] = W(Q.len * 0.55, Q.wid * 0.45);
      lmBox(group, M.dark, 4.5, 0.8, 4.5, sx, G + Q.roof - 1.3, sz, R);
    }
    lmCollide(K, ring, y0, G + Q.par);

    /* ---------- главный фасад (запад): выступ, аркада, балкон, аттик ---------- */
    const [m0, m1] = Q.mid, mc = (m0 + m1) / 2, mw = m1 - m0;
    box(M.wall, -0.2, mc, 0.4, G + Q.par + 0.3 - y0, mw, y0);
    box(M.base, -0.25, mc, 0.5, G + 1.3 - y0, mw + 0.1, y0);
    for (const k of [-1, 0, 1]) win(-0.6, mc + k * 3.2, G + 0.25, F, 2.3, 4.1, { arch: true, f: 0.4, mat: M.base });
    box(M.trim, -0.9, mc, 0.8, 0.25, mw, G);                                     // ступень входа
    box(M.trim, -0.9, mc, 1.4, 0.22, mw + 0.6, G + Q.f1);                        // балкон
    for (const k of [-4, -2, 0, 2, 4]) box(M.trim, -0.5, mc + k * 2.4, 0.5, 0.7, 0.3, G + Q.f1 - 0.7);
    box(M.trim, -1.5, mc, 0.2, 0.9, mw + 0.4, G + Q.f1 + 0.22);
    for (const s of [1, -1]) box(M.trim, -0.85, mc + s * (mw / 2 + 0.2), 1.3, 0.9, 0.2, G + Q.f1 + 0.22);
    for (const k of [-1, 0, 1]) win(-0.4, mc + k * 3.2, G + Q.f1 + 0.5, F, 1.2, 2.7, { arch: false });
    for (let k = -2; k <= 2; k++) win(-0.4, mc + k * 1.75, G + Q.f2 + 0.55, F, 0.75, 1.5, { arch: true, f: 0.15 });
    // ступенчатый аттик с зубцами
    box(M.wall, -0.2, mc, 1.0, 1.0, mw - 1, G + Q.par);
    box(M.trim, -0.2, mc, 1.1, 0.2, mw - 0.8, G + Q.par + 1.0);
    for (let k = -2; k <= 2; k++) box(M.wall, -0.2, mc + k * 1.9, 0.8, k === 0 ? 1.4 : 0.7, 0.8, G + Q.par + 1.2);
    for (const s of [1, -1]) { box(M.wall, -0.3, mc + s * mw / 2, 0.9, G + Q.par + 1.6 - y0, 0.9, y0); box(M.trim, -0.3, mc + s * mw / 2, 1.1, 0.3, 1.1, G + Q.par + 1.6); }
    // боковые оси фасада: по окну на этаж
    for (const v of [2.6, Q.wid - 2.6]) {
      win(0, v, G + 1.6, F, 1.1, 2.3);
      win(0, v, G + Q.f1 + 0.6, F, 1.1, 2.5);
      win(0, v, G + Q.f2 + 0.6, F, 0.8, 1.4);
    }

    /* ---------- боковые и задний фасады ---------- */
    const side = (a, b, n, rot, skipMid) => {
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n, u = a[0] + (b[0] - a[0]) * t, v = a[1] + (b[1] - a[1]) * t;
        win(u, v, G + 1.6, rot, 1.1, 2.3);
        win(u, v, G + Q.f1 + 0.6, rot, 1.1, 2.5);
        win(u, v, G + Q.f2 + 0.6, rot, 0.8, 1.4, { arch: true, f: 0.15 });
      }
    };
    side([1.5, 0], [Q.len - 1.5, 0], 5, R);
    side([1.5, Q.wid], [Q.len - 1.5, Q.wid], 5, R);
    side([Q.len, 1.5], [Q.len, Q.wid - 1.5], 4, F);
  },
};
