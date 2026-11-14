// Побережье — ПОСТРОЙКА: полотна дорог. Лента по точкам дороги (через 2 м) чуть выше вдавленного рельефа:
// асфальт с белой разметкой (сплошные края, прерывистая ось) поверх земляных обочин, гравий и грунт с неровными
// краями (alphaTest), брусчатка. Ленты режутся на куски ~120 м — optimizeStatic склеивает их по чанкам.
// На акведуке и деревянном мосту ленты нет: там своё покрытие (js/maps/coast/crossings.js).
// Порядок этапов — в buildCoast() (js/maps/coast/build.js).
// Определяет: coastRoadTexture, coastBuildRoads.
// Использует: canvasTex (js/maps/city/textures.js); cobbleTexture (js/maps/city/landmarks.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

// Текстура полотна: u — поперёк (0…1 — вся ширина), v — вдоль (tile м на повтор).
// kind: 'asphalt' — разметка; 'dirt', 'gravel', 'shoulder' — рваные прозрачные края (alphaTest)
function coastRoadTexture(kind) {
  const W = 128, Hh = 512, c = document.createElement('canvas'); c.width = W; c.height = Hh;
  const x = c.getContext('2d');
  const BASE = { asphalt: '#45444a', gravel: '#b8ab8c', dirt: '#8f7352', shoulder: '#a08560' }[kind];
  x.fillStyle = BASE; x.fillRect(0, 0, W, Hh);
  const dots = (n, a, s0, s1, light) => {
    for (let i = 0; i < n; i++) {
      const v = Math.random() * a;
      x.fillStyle = (light ?? Math.random() < 0.5) ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${v})`;
      const s = s0 + Math.random() * (s1 - s0); x.fillRect(Math.random() * W, Math.random() * Hh, s, s);
    }
  };
  if (kind === 'asphalt') {
    dots(9000, 0.12, 1, 2.5);
    // заплатки и трещины старого асфальта
    for (let i = 0; i < 7; i++) { x.fillStyle = `rgba(0,0,0,${0.06 + Math.random() * 0.06})`; x.fillRect(Math.random() * W * 0.8, Math.random() * Hh, 14 + Math.random() * 30, 20 + Math.random() * 60); }
    x.fillStyle = '#e6e2d6';
    const k = W / 7;                                            // 7 м проезжей части
    x.fillRect(0.25 * k, 0, 0.12 * k, Hh); x.fillRect(W - 0.37 * k, 0, 0.12 * k, Hh);   // края
    for (let v = 0; v < Hh; v += Hh / 3) x.fillRect(W / 2 - 0.06 * k, v, 0.12 * k, Hh / 6);   // ось: 2 м штрих, 2 м пробел
  } else {
    // колеи, камешки, пятна; края рваные — прозрачные
    if (kind === 'gravel') { dots(5000, 0.35, 1, 3); dots(1200, 0.25, 2, 4, false); }
    else { dots(3500, 0.18, 1, 3); }
    for (const u of [0.3, 0.7]) { x.fillStyle = 'rgba(0,0,0,0.09)'; x.fillRect(u * W - 7, 0, 14, Hh); }
    const img = x.getImageData(0, 0, W, Hh), d = img.data;
    let e0 = 6, e1 = 6;
    for (let y = 0; y < Hh; y++) {
      e0 = Math.max(1, Math.min(16, e0 + (Math.random() - 0.5) * 3)); e1 = Math.max(1, Math.min(16, e1 + (Math.random() - 0.5) * 3));
      const ye = y > Hh - 24 ? (Hh - y) / 24 : 1, yb = y < 24 ? y / 24 : 1;   // края стыкуются по вертикали
      const a0 = e0 * Math.min(ye, yb) + 6 * (1 - Math.min(ye, yb)), a1 = e1 * Math.min(ye, yb) + 6 * (1 - Math.min(ye, yb));
      for (let px = 0; px < W; px++) if (px < a0 || px > W - 1 - a1) d[(y * W + px) * 4 + 3] = 0;
    }
    x.putImageData(img, 0, 0);
  }
  const t = canvasTex(c, false);
  return t;
}

function coastBuildRoads(K) {
  const { D, group } = K;
  const { roads } = D.C;
  const mat = (map, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ map, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }, o));
  const M = {
    asphalt: mat(coastRoadTexture('asphalt')),
    shoulder: mat(coastRoadTexture('shoulder'), { alphaTest: 0.5, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    gravel: mat(coastRoadTexture('gravel'), { alphaTest: 0.5 }),
    dirt: mat(coastRoadTexture('dirt'), { alphaTest: 0.5 }),
    cobble: mat(cobbleTexture(), { roughness: 0.95 }),
  };
  // плитка вдоль дороги, м; приподнятость ленты над рельефом, м
  const TILE = { asphalt: 12, shoulder: 10, gravel: 10, dirt: 9, cobble: 4 }, LIFT = { asphalt: 0.07, shoulder: 0.045, gravel: 0.05, dirt: 0.04, cobble: 0.06 };
  const ribbon = (r, a, b, half, kind) => {
    const P = [], U = [], N = [], I = [];
    let s = 0;
    for (let i = a; i <= b; i++) {
      const p = r.pts[i % r.N], q = r.pts[(i - 1 + r.N) % r.N];
      if (i > a) s += Math.hypot(p.x - q.x, p.z - q.z);
      const y = p.h + LIFT[kind];
      P.push(p.x + p.nx * half, y, p.z + p.nz * half, p.x - p.nx * half, y, p.z - p.nz * half);
      const v = s / TILE[kind];
      if (kind === 'cobble') U.push((p.x + p.nx * half) / 4, (p.z + p.nz * half) / 4, (p.x - p.nx * half) / 4, (p.z - p.nz * half) / 4);
      else U.push(0, v, 1, v);
      N.push(0, 1, 0, 0, 1, 0);
      if (i > a) { const o = (i - a - 1) * 2; I.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    // треугольники должны смотреть вверх
    const e1x = P[3] - P[0], e1z = P[5] - P[2], e2x = P[6] - P[0], e2z = P[8] - P[2];
    if (e1z * e2x - e1x * e2z < 0) for (let k = 0; k < I.length; k += 3) [I[k + 1], I[k + 2]] = [I[k + 2], I[k + 1]];
    g.setIndex(I); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, M[kind]); m.receiveShadow = true; group.add(m);
  };
  const PIECE = 60;                                       // точек (по 2 м) в куске ленты
  for (const r of roads) {
    // куски ленты между пролётами без своей ленты (акведук, деревянный мост)
    const skip = new Uint8Array(r.N);
    for (const sp of r.spans) if (sp.type !== 'stone') for (let i = sp.i0 + 1; i < sp.i1; i++) skip[i] = 1;
    const last = r.closed ? r.N : r.N - 1;
    let a = 0;
    while (a < last) {
      while (a < last && skip[a]) a++;
      let b = a; while (b < last && b - a < PIECE && !skip[b + 1 < r.N ? b + 1 : 0]) b++;
      if (b > a) {
        if (r.kind === 'asphalt') {
          // обочины — только на земле: на каменном мосту по краям тротуары настила
          let c = a;
          while (c < b) {
            while (c < b && r.pts[c % r.N].span) c++;
            let e = c; while (e < b && !r.pts[(e + 1) % r.N].span) e++;
            if (e > c) ribbon(r, c, e, r.core, 'shoulder');
            c = e + 1;
          }
          ribbon(r, a, b, r.hw, 'asphalt');
        }
        else ribbon(r, a, b, r.kind === 'cobble' ? r.hw : r.core, r.kind);
      }
      a = b === a ? a + 1 : b;
    }
  }
}
