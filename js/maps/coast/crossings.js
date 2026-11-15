// Побережье — ПОСТРОЙКА: переправы и трамплин обрыва. Пролёты мостов берутся из профилей дорог (r.spans,
// js/maps/coast/roads.js), настилы — плиты Decks (по ним ездят: коллайдеры Rapier и world.surface()).
//   каменный мост — плиты 11 м, парапеты, массивное тело с двумя арками до воды;
//   деревянный мост — дощатый настил 6 м, перила на столбиках, сваи в реку;
//   акведук — узкий каменный настил 3,4 м между низкими парапетами, три пары столбов-«ворот» с проходом 2,5 м
//     (узкая машина проскакивает, широкий внедорожник цепляется), под ним — высокие арки до земли;
//   обрыв — каменный клин-трамплин на кромке.
// Порядок этапов — в buildCoast() (js/maps/coast/build.js).
// Определяет: AQ_GATE, coastBuildCrossings.
// Использует: lerp (js/core.js); noiseTexture, stdMat, inst, setInst (js/world.js); coastBuildJumps
//   (js/maps/coast/jumps.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

// Ширина прохода в «воротах» акведука, м. Машина проходит, если отклонится от оси ворот не больше чем на
// (AQ_GATE − W) / L рад: Corolla — 8,7°, Aventador — 5,6°, Hummer — 3,6° (с трудом).
const AQ_GATE = 2.5;
function coastBuildCrossings(K) {
  const { D, group, decks } = K;
  const { roads, cliff, ground } = D.C;
  const stoneTex = noiseTexture(256, '#c4ad86', 0.25, 9000), stoneMat = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.95 });
  const woodTex = (() => {                   // доски поперёк настила
    const c = document.createElement('canvas'); c.width = 64; c.height = 256; const x = c.getContext('2d');
    for (let i = 0; i < 16; i++) { const v = 0.75 + Math.random() * 0.3; x.fillStyle = `rgb(${130 * v | 0},${92 * v | 0},${58 * v | 0})`; x.fillRect(0, i * 16, 64, 15); }
    x.fillStyle = 'rgba(20,12,6,.6)'; for (let i = 0; i < 16; i++) x.fillRect(0, i * 16 + 15, 64, 1);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const mats = { stone: stoneMat, wood: new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.9 }), rock: stdMat(0x8a7d6a, { roughness: 1 }), deck: stoneMat,
    concrete: K.concreteMat || stoneMat };
  const posts = [];                           // столбики перил и сваи: [x, y, z, sx, sy, sz]
  const P = (r, i) => r.pts[Math.min(r.N - 1, Math.max(0, i))];
  // низ арочного тела: f — доля внутри пролёта арки (0…1), по краям — опора шириной pier, между ними — полукруг
  const arch = (f, base, crown, pier) => f < pier || f > 1 - pier ? base : base + (crown - base) * Math.sin(Math.PI * (f - pier) / (1 - 2 * pier)) ** 0.5;
  // плиты настила вдоль пролёта: по куску на step точек; side — смещение поперёк, lift — над полотном
  const slabs = (r, sp, w, t, o, side = 0, lift = 0, step = 2) => {
    for (let i = sp.i0; i < sp.i1; i += step) {
      const a = P(r, i), b = P(r, Math.min(sp.i1, i + step));
      decks.slab([a.x + a.nx * side, a.h + lift, a.z + a.nz * side], [b.x + b.nx * side, b.h + lift, b.z + b.nz * side], w, t, o);
    }
  };
  // тело моста с арочным низом: сечения вдоль пролёта, низ = under(t, x, z)
  const body = (r, sp, half, under, mat) => {
    const pos = [], idx = [];
    for (let i = sp.i0; i <= sp.i1; i++) {
      const p = P(r, i), t = (i - sp.i0) / (sp.i1 - sp.i0), top = p.h - 0.3, bot = Math.min(top - 0.5, under(t, p.x, p.z, top));
      for (const [s, y] of [[1, top], [1, bot], [-1, bot], [-1, top]]) pos.push(p.x + p.nx * half * s, y, p.z + p.nz * half * s);
      if (i > sp.i0) {
        const o = (i - sp.i0 - 1) * 4, q = o + 4;
        // левая стенка, низ, правая стенка
        idx.push(o, o + 1, q, o + 1, q + 1, q, o + 1, o + 2, q + 1, o + 2, q + 2, q + 1, o + 2, o + 3, q + 2, o + 3, q + 3, q + 2);
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    const uv = []; for (let k = 0; k < pos.length; k += 3) uv.push((pos[k] + pos[k + 2]) / 6, pos[k + 1] / 6);
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.95, side: THREE.DoubleSide }));
    m.castShadow = m.receiveShadow = true; group.add(m);
    if (mat) m.material.color.setHex(mat);
  };
  for (const r of roads) for (const sp of r.spans) {
    const wl = sp.wl;
    if (sp.type === 'stone') {
      // каменный мост: настил 11 м, парапеты 0,9 м, тело с двумя арками
      slabs(r, sp, 11, 1.2, { mat: 'stone' });
      for (const s of [1, -1]) slabs(r, sp, 0.55, 1.3, { mat: 'stone', walk: false }, s * 5.3, 0.9);
      // две арки: пята у воды, замок — на метр ниже настила
      body(r, sp, 5.5, (t, x, z, top) => arch((t * 2) % 1, wl - 0.6, top - 1, 0.1));
    } else if (sp.type === 'wood') {
      // деревянный мост: настил 6 м, перила, сваи парами через ~6 м
      slabs(r, sp, 6, 0.35, { mat: 'wood' });
      for (const s of [1, -1]) slabs(r, sp, 0.18, 0.18, { mat: 'wood', walk: false }, s * 2.9, 1.05);
      for (let i = sp.i0; i <= sp.i1; i += 3) {
        const p = P(r, i);
        for (const s of [1, -1]) {
          const x = p.x + p.nx * 2.9 * s, z = p.z + p.nz * 2.9 * s;
          posts.push([x, p.h, z, 0.16, 1.15, 0.16, 'wood']);
          const g = Math.min(ground(x, z), p.h - 1);
          posts.push([x, g - 0.5, z, 0.32, p.h - g + 0.2, 0.32, 'wood']);
        }
      }
    } else if (sp.type === 'aqueduct') {
      // акведук: узкий настил, низкие парапеты, три пары столбов-ворот, высокие арки до земли
      slabs(r, sp, 3.4, 1.0, { mat: 'stone' });
      for (const s of [1, -1]) slabs(r, sp, 0.45, 1.1, { mat: 'stone', walk: false }, s * 1.92, 0.55);
      const n = sp.i1 - sp.i0;
      for (const f of [0.22, 0.5, 0.78]) {
        // столбы короткие вдоль дороги (1,4 м): точки на 0,7 м до и после середины ворот
        const i = sp.i0 + Math.round(n * f), m0 = P(r, i), m1 = P(r, i + 1), gw = (3.4 - AQ_GATE) / 2;
        const at = k => ({ x: lerp(m0.x, m1.x, k), z: lerp(m0.z, m1.z, k), h: lerp(m0.h, m1.h, k), nx: m0.nx, nz: m0.nz });
        const a = at(-0.35), b = at(0.35);
        for (const s of [1, -1]) {
          const off = s * (AQ_GATE / 2 + (gw + 0.45) / 2);
          decks.slab([a.x + a.nx * off, a.h + 2.6, a.z + a.nz * off], [b.x + b.nx * off, b.h + 2.6, b.z + b.nz * off], gw + 0.45, 2.7, { mat: 'stone', walk: false });
        }
        decks.slab([a.x, a.h + 3.3, a.z], [b.x, b.h + 3.3, b.z], 4.3, 0.7, { mat: 'stone', walk: false });      // перемычка над воротами
      }
      const arches = Math.max(3, Math.round(n * 2 / 14));
      body(r, sp, 1.9, (t, x, z, top) => { const g = ground(x, z) - 0.5; return arch((t * arches) % 1, g, g + Math.max(0, top - 1.6 - g) * 0.94, 0.17); });
    }
  }
  // трамплин на кромке обрыва: два каменных клина — разгон ~10°, кромка ~22°. Медленно (~70 км/ч) — на остров,
  // быстро (130+ км/ч) — через заводь на северный берег, посередине — в воду
  {
    const at = d => { const x = cliff.x - cliff.fx * d, z = cliff.z - cliff.fz * d; return [x, ground(x, z), z]; };
    const [p12, p6, p0] = [at(12), at(6), at(0.5)], y6 = p6[1] + 1.1, y0 = p0[1] + 3.6;
    decks.wedge([p12[0], p12[1] + 0.02, p12[2]], [p6[0], y6, p6[2]], 7, p12[1] - 1, { mat: 'rock' });
    decks.wedge([p6[0], y6, p6[2]], [p0[0], y0, p0[2]], 7, p6[1] - 1, { mat: 'rock' });
  }
  coastBuildJumps(K, mats);                  // обрушенный мост и скирды (js/maps/coast/jumps.js)
  decks.build(group, mats);
  // столбики и сваи — одной InstancedMesh
  if (posts.length) {
    const m = inst(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), mats.wood, posts.length);
    posts.forEach(([x, y, z, sx, sy, sz], i) => setInst(m, i, x, y, z, sx, sy, sz));
    m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); group.add(m);
  }
}
