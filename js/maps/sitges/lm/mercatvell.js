// Ситжес — достопримечательность: Mercat Vell (старый рынок, 1890, арх. Gaietà Buigas) у ратуши (этап 5,
// docs/sitges/stage-5.md, замеры и источники — docs/sitges/lm-a.md). Как устроен объект строения —
// js/maps/sitges/landmarks.js (раскладка, C.landmarks) и js/maps/sitges/landmarks3d.js (помощники lm*).
//   Зал из светлого кирпича 17,2 × 21 м под пологой двускатной крышей (лидар: карниз ≈ 25,0, конёк 27,5); торец
//   к Plaça de l'Ajuntament — фронтон с рядом высоких жалюзийных окон ступенькой по скату и большими воротами под
//   лучковой аркой; перед ним два павильона из красного кирпича с зубчатым карнизом и кованый навес между ними.
//   Бока — бутовый цоколь, высокие арочные окна. Местные оси: s — от фасада вглубь, t — поперёк, от западного угла.
// Определяет: LMMV, SITGES_LM_MERCATVELL.
// Использует: lmMat, lmBox, lmExtrude, lmRoof, lmCollide, lmArch, lmCollideBox, lmCyl
//   (js/maps/sitges/landmarks3d.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const LMMV = {
  o: [-598.0, -146.9],              // передний угол западного павильона (кадастр)
  a: [-0.302, 0.953],               // вглубь (длинная ось зала)
  wid: 17.2, s0: 2.9, s1: 23.8,     // ширина; фронтон и задняя стена (вместе с полосой кадастра сзади)
  eave: 25.0, ridge: 27.5,          // абсолютные высоты (лидар)
  pav: 4.6, pavH: 6.4,              // павильоны: ширина, высота над землёй у фасада
};

const SITGES_LM_MERCATVELL = {
  ready: true,
  plan(C, L) {},
  build(K, L, group) {
    const Q = LMMV, gr = (x, z) => K.D.ground(x, z), [ax, az] = Q.a, B = [az, -ax];   // a — вглубь, B — поперёк (t)
    const P = (s, t) => [Q.o[0] + s * ax + t * B[0], Q.o[1] + s * az + t * B[1]];
    const R = Math.atan2(-B[1], B[0]), Ra = R - Math.PI / 2;           // локальная x — вдоль t / вдоль s
    const hall = [P(Q.s0, 0), P(Q.s0, Q.wid), P(Q.s1, Q.wid), P(Q.s1, 0)];
    const G = gr(...P(1.5, Q.wid / 2)), y0 = Math.min(...hall.concat([P(0, 0), P(0, Q.wid)]).map(([x, z]) => gr(x, z))) - 0.6;
    const M = {
      brick: lmMat(0xdcc196, { tex: 'brick' }), red: lmMat(0xc66b45, { tex: 'brick' }), rubble: lmMat(0xc9b48d, { tex: 'rubble' }),
      trim: lmMat(0xeadcbf, { tex: 'plaster' }), dark: lmMat(0x26221e, { rough: 0.6 }), roof: lmMat(0x8f8b84, { tex: 'tile' }),
    };
    const box = (mat, s, t, w, h, d, y, rot = R) => { const [x, z] = P(s, t); return lmBox(group, mat, w, h, d, x, y, z, rot); };
    const rect = (w, h) => { const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h); s.lineTo(-w / 2, h); s.lineTo(-w / 2, 0); return s; };
    const seg = (w, h, rise) => { const s = new THREE.Shape(), r = (w * w / 4 + rise * rise) / (2 * rise), a = Math.asin(w / 2 / r);
      s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h - rise); s.absarc(0, h - r, r, Math.PI / 2 - a, Math.PI / 2 + a, false); s.lineTo(-w / 2, 0); return s; };
    const win = (s, t, y, rot, w, h, { shape = rect, f = 0.18, mat = M.trim } = {}) => {
      const [x, z] = P(s, t), outer = shape(w + 2 * f, h + 2 * f);
      outer.holes.push(new THREE.Path(shape(w, h).getPoints().map(p => new THREE.Vector2(p.x, p.y + f))));
      lmExtrude(group, mat, outer, 0.3, x, y - f, z, rot);
      lmExtrude(group, M.dark, shape(w, h), 0.1, x, y, z, rot);
    };

    /* ---------- зал: стены, цоколь, крыша ---------- */
    const yE = Q.eave + 0.15, sm = (Q.s0 + Q.s1) / 2, ln = Q.s1 - Q.s0;
    box(M.brick, sm, Q.wid / 2, Q.wid, yE - y0, ln, y0);
    box(M.rubble, sm, Q.wid / 2, Q.wid + 0.2, G - 0.5 - y0, ln + 0.2, y0);
    box(M.trim, sm, Q.wid / 2, Q.wid + 0.6, 0.3, ln + 0.6, yE - 0.3);
    {
      const [cx, cz] = P(sm, Q.wid / 2), k = (Q.ridge - Q.eave) / (Q.wid / 2), pitch = Math.atan(k) * 180 / Math.PI;
      lmRoof(group, M.roof, { cx, cz, ux: ax, uz: az, vx: B[0], vz: B[1], len: ln + 0.4, wid: Q.wid }, yE - 0.5 * k, { kind: 'gable', pitch, over: 0.5 });
    }
    lmCollide(K, hall, y0, yE);
    // фронтон: кирпичная стена со ступенчатым карнизом и жалюзийными окнами
    {
      const hw = Q.wid / 2, s = new THREE.Shape(), eR = yE - G, rR = Q.ridge + 0.35 - G;
      s.moveTo(-hw - 0.3, y0 - G); s.lineTo(hw + 0.3, y0 - G); s.lineTo(hw + 0.3, eR); s.lineTo(0, rR); s.lineTo(-hw - 0.3, eR); s.lineTo(-hw - 0.3, y0 - G);
      const [x, z] = P(Q.s0 - 0.1, hw);
      lmExtrude(group, M.brick, s, 0.5, x, G, z, R);
      // карниз по скату — ступеньками (кирпичные зубцы)
      for (let i = 0; i <= 16; i++) {
        const tt = -hw + i * Q.wid / 16, yy = eR + (rR - eR) * (1 - Math.abs(tt) / hw);
        box(M.trim, Q.s0 - 0.45, hw + tt, 1.15, 0.3, 0.4, G + yy - 0.35);
      }
      for (let k = 0; k < 10; k++) {
        const tt = -6.75 + k * 1.5, top = eR + (rR - eR) * (1 - Math.abs(tt) / hw) - 1.2, y = 7.6;
        win(Q.s0 - 0.4, hw + tt, G + y, R, 0.8, top - y, { shape: (w, h) => lmArch(w, h), f: 0.15 });
        for (let yy = y + 0.3; yy < top - 0.5; yy += 0.42) box(M.trim, Q.s0 - 0.47, hw + tt, 0.06, 0.07, 0.8, G + yy);
      }
      // ворота: лучковая арка с решёткой
      win(Q.s0 - 0.4, hw, G, R, 5.4, 5.6, { shape: (w, h) => seg(w, h, 1.0), f: 0.45, mat: M.brick });
      for (let k = -6; k <= 6; k++) box(M.dark, Q.s0 - 0.5, hw + k * 0.4, 0.05, 4.4, 0.06, G);
      box(M.dark, Q.s0 - 0.5, hw, 5.3, 0.08, 0.08, G + 2.4);
    }
    // кованый навес между павильонами
    box(M.dark, Q.s0 / 2 - 0.1, Q.wid / 2, Q.wid - 2 * Q.pav, 0.08, Q.s0, G + 5.9);
    box(M.dark, 0.1, Q.wid / 2, Q.wid - 2 * Q.pav, 0.35, 0.12, G + 5.6);
    for (let k = -5; k <= 5; k++) box(M.dark, 0.1, Q.wid / 2 + k * 0.7, 0.05, 0.5, 0.05, G + 5.98);

    /* ---------- павильоны из красного кирпича ---------- */
    for (const t0 of [0, Q.wid - Q.pav]) {
      const tc = t0 + Q.pav / 2, sc = Q.s0 / 2, yb = Math.min(gr(...P(0, t0)), gr(...P(0, t0 + Q.pav))) - 0.6;
      box(M.red, sc, tc, Q.pav, G + Q.pavH - yb, Q.s0 + 0.2, yb);
      box(M.rubble, sc, tc, Q.pav + 0.1, G + 0.4 - yb, Q.s0 + 0.3, yb);
      box(M.red, sc - 0.15, tc, Q.pav + 0.5, 0.35, Q.s0 + 0.5, G + Q.pavH - 1.2);
      for (let k = 0; k < 6; k++) box(M.trim, -0.15, t0 + 0.4 + k * 0.76, 0.25, 0.22, 0.18, G + Q.pavH - 0.85);
      box(M.red, sc - 0.15, tc, Q.pav + 0.5, 0.3, Q.s0 + 0.5, G + Q.pavH - 0.6);
      box(M.trim, sc - 0.15, tc, Q.pav + 0.6, 0.15, Q.s0 + 0.6, G + Q.pavH - 0.3);
      box(M.red, sc, tc, Q.pav, 0.55, Q.s0 + 0.2, G + Q.pavH - 0.15);
      win(-0.1, tc, G + 1.0, R, 1.4, 3.0, { shape: (w, h) => lmArch(w, h), f: 0.25, mat: M.red });
      lmCollideBox(K, ...P(sc, tc), Q.s0 + 0.2, Q.pav, Ra, yb, G + Q.pavH);
    }
    const [vx, vz] = P(-0.3, Q.wid - 0.4); lmCyl(group, M.trim, 0.35, 0.8, vx, G + Q.pavH + 0.4, vz, { seg: 8, top: 0.2 });

    /* ---------- бока: высокие арочные окна, окошки в цоколе ---------- */
    for (const t of [0, Q.wid]) {
      for (let k = 0; k < 6; k++) {
        const s = Q.s0 + 2.2 + k * 3.4;
        win(s, t, G + 5.6, Ra, 1.0, 3.6, { shape: (w, h) => lmArch(w, h), f: 0.2 });
        win(s, t, G + 1.6, Ra, 0.8, 1.3);
      }
    }
  },
};
