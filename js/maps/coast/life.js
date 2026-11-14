// Побережье — ПОСТРОЙКА: живность и дымок — то, что движется само, без физики.
//   чайки — одна InstancedMesh на всю карту: стаи кружат над портом, маяком и пляжем; другие сидят на пирсе,
//     причале, острове и пляже и взлетают, когда рядом проезжает машина (кружат над местом и садятся обратно,
//     когда машина уедет). Взмахи крыльев — в вершинном шейдере (атрибут aFlap: фаза, раскрытие крыльев);
//   дым из печных труб — частицы smoke (js/effects.js) только из труб рядом с игроками, сносится ветром карты.
// Каждый кадр — K.life.update(dt, t) из world.update() (js/maps/coast/build.js).
// Порядок этапов — в buildCoast() (js/maps/coast/build.js).
// Определяет: coastBuildLife.
// Использует: clamp, lerp (js/core.js); mulberry32 (js/world.js); world (js/maps/registry.js); smoke (js/effects.js);
//   cars (js/physics.js); SoundEnv (js/audio-env.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

function coastBuildLife(K) {
  const { D, group, chimneys } = K;
  const C = D.C, { ground, pier, jetty, island, lighthouse, port } = C;
  const rng = mulberry32(4242), R = (a, b) => a + (b - a) * rng();   // своё зерно: раскладка карты не сдвигается

  /* ==================================================================
     ЧАЙКИ
     ================================================================== */
  // модель: тело, голова, хвост и два крыла (ось x — размах, −z — вперёд); у крыла серый верх и чёрные кончики
  const gullGeo = (() => {
    const P = [], Cl = [], W = [1, 1, 1], G = [0.62, 0.65, 0.7], B = [0.12, 0.12, 0.13], Y = [0.95, 0.75, 0.2];
    const tri = (a, b, c, col) => { P.push(...a, ...b, ...c); for (let k = 0; k < 3; k++) Cl.push(...col); };
    const quad = (a, b, c, d, col) => { tri(a, b, c, col); tri(a, c, d, col); };
    // тело — вытянутый ромб в сечении
    const nose = [0, 0.02, -0.34], tail = [0, 0.02, 0.32], up = [0, 0.09, -0.02], dn = [0, -0.06, -0.02], l = [-0.08, 0.01, -0.04], r = [0.08, 0.01, -0.04];
    for (const [a, b] of [[up, r], [r, dn], [dn, l], [l, up]]) { tri(nose, a, b, W); tri(tail, b, a, W); }
    tri([0, 0.05, -0.34], [0, 0.02, -0.44], [0, 0.0, -0.34], Y);                     // клюв
    tri([-0.09, 0.03, 0.26], [0.09, 0.03, 0.26], [0, 0.03, 0.42], W);                 // хвост
    // крылья: от плеча (|x| = 0.07) до кончика (|x| = 0.72), стреловидные; кончик — чёрный
    for (const s of [-1, 1]) {
      const a = [0.07 * s, 0.05, -0.12], b = [0.07 * s, 0.05, 0.08], c = [0.5 * s, 0.05, 0.1], d = [0.5 * s, 0.05, -0.06];
      quad(a, b, c, d, G);
      quad(d, c, [0.72 * s, 0.05, 0.16], [0.68 * s, 0.05, 0.06], B);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(Cl, 3));
    g.computeVertexNormals();
    return g;
  })();

  const gulls = [];
  // стая в небе: центр, радиус, высота над центром
  const flock = (n, cx, cz, r0, r1, h0, h1) => {
    for (let i = 0; i < n; i++) gulls.push({ fly: true, cx, cz, cy: ground(cx, cz) + R(h0, h1), r: R(r0, r1), w: (rng() < 0.5 ? 1 : -1) * R(5, 8),
      ph: R(0, 6.3), fp: R(0, 6.3), k: 1, home: null });
  };
  // сидят: точка, высота, курс; взлетают от машины
  const sit = (x, y, z) => gulls.push({ fly: false, cx: x, cz: z, cy: y + R(8, 15), r: R(10, 22), w: (rng() < 0.5 ? 1 : -1) * R(6, 9),
    ph: R(0, 6.3), fp: R(0, 6.3), k: 0, kT: 0, home: [x, y, z, R(0, 6.3)], scared: 0 });
  const pc = [(port.x0 + port.x1) / 2, (port.z0 + port.z1) / 2];
  flock(10, pc[0], pc[1] - 40, 25, 60, 16, 30);
  flock(7, lighthouse.x, lighthouse.z, 14, 30, 28, 38);
  // вдоль пляжа — несколько стай над кромкой воды
  for (const x of [-330, -40, 230]) { const z = C.ZC[C.cellI(x)] - 10; flock(4, x, z, 20, 45, 9, 18); }
  for (let i = 0; i < 9; i++) sit(pier.x + (rng() < 0.5 ? -1 : 1) * R(2, pier.w / 2 - 1.2), pier.h + 0.1, R(pier.z1 + 4, pier.z0 - 4));
  for (let i = 0; i < 4; i++) sit(jetty.x + R(-1.2, 1.2), jetty.h + 0.1, R(jetty.z1 + 2, jetty.z0 - 2));
  for (let i = 0; i < 6; i++) { const x = island.x + R(-14, 14), z = island.z + R(-8, 8); sit(x, ground(x, z) + 0.1, z); }
  for (const x0 of [-260, 120, 300]) for (let i = 0; i < 4; i++) {
    const x = x0 + R(-12, 12), z = C.ZC[C.cellI(x)] + R(4, 12);
    sit(x, ground(x, z) + 0.1, z);
  }

  const N = gulls.length;
  const flap = new THREE.InstancedBufferAttribute(new Float32Array(N * 2), 2).setUsage(THREE.DynamicDrawUsage);
  gullGeo.setAttribute('aFlap', flap);
  const GU = { uT: { value: 0 } };
  // стандартный материал (а не Ламберт): ему светит и небо (карта окружения) — белое остаётся белым на закате
  const gullMat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8 });
  gullMat.onBeforeCompile = sh => {
    sh.uniforms.uT = GU.uT;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aFlap; uniform float uT;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          // крыло поворачивается вокруг плеча; у сидящей птицы (aFlap.y = 0) сложено вдоль тела
          float ax = abs( position.x );
          if ( ax > 0.075 ) {
            float s = sign( position.x ), r = ( ax - 0.07 ) * mix( 0.2, 1.0, aFlap.y );
            float a = ( sin( uT * 8.5 + aFlap.x ) * 0.75 + 0.15 ) * aFlap.y;
            transformed.x = s * ( 0.07 + r * cos( a ) );
            transformed.y += r * sin( a ) * step( 0.01, aFlap.y );
            transformed.z += ( 1.0 - aFlap.y ) * r * 1.6;
          }
        }`);
  };
  const gullMesh = new THREE.InstancedMesh(gullGeo, gullMat, N);
  gullMesh.frustumCulled = false; gullMesh.castShadow = false; gullMesh.userData.dynamic = true;
  group.add(gullMesh);

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), v = new THREE.Vector3(), sc = new THREE.Vector3(1.7, 1.7, 1.7);
  const ease = k => k * k * (3 - 2 * k);
  function updateGulls(dt, t) {
    GU.uT.value = t;
    const F = flap.array;
    for (let i = 0; i < N; i++) {
      const g = gulls[i];
      // испуг: машина ближе 22 м — взлёт; кружат, пока машина ближе 40 м, и ещё 8–14 с после
      if (g.home) {
        let near = 1e9;
        for (const c of cars) near = Math.min(near, Math.hypot(c.x - g.home[0], c.z - g.home[2]));
        if (near < 22 && g.k === 0 && g.kT <= 0) { g.kT = 1; g.scared = R(8, 14); cry(g.home[0], g.home[2]); }
        if (near < 40) g.scared = Math.max(g.scared, 4);
        g.scared -= dt;
        const target = g.scared > 0 ? 1 : 0;
        g.k = clamp(g.k + (target ? dt / 1.8 : -dt / 4), 0, 1);
        if (g.k === 0) g.kT = 0;
      }
      // полёт по кругу; высота «дышит», птица кренится к центру круга
      const a = g.ph + t * g.w / g.r, ca = Math.cos(a), sa = Math.sin(a), dir = Math.sign(g.w);
      const fx = g.cx + ca * g.r, fz = g.cz + sa * g.r, fy = g.cy + Math.sin(t * 0.4 + g.ph) * 2.5;
      const fh = Math.atan2(-sa * dir, ca * dir) + Math.PI;            // курс по касательной (модель смотрит в −z)
      let x = fx, y = fy, z = fz, h = fh, bank = 0.35 * dir, op = 1;
      if (g.home) {
        const k = ease(g.k), [hx, hy, hz, hh] = g.home;
        x = lerp(hx, fx, k); z = lerp(hz, fz, k); y = lerp(hy, fy, k) + Math.sin(g.k * Math.PI) * 3;
        h = g.k > 0.5 ? fh : hh; bank *= k;
        op = g.k;
      }
      e.set(0, h, bank); q.setFromEuler(e);
      m4.compose(v.set(x, y, z), q, sc);
      gullMesh.setMatrixAt(i, m4);
      // крылья: машут при взлёте, в полёте — то машут, то парят
      F[i * 2] = g.fp; F[i * 2 + 1] = op === 1 ? 0.35 + 0.65 * Math.max(0, Math.sin(t * 0.55 + g.fp)) : op;
    }
    gullMesh.instanceMatrix.needsUpdate = true; flap.needsUpdate = true;
  }
  // крик взлетающей стаи — тем игрокам, кто рядом (синтез чайки из js/audio-env.js)
  let cryT = 0;
  function cry(x, z) {
    const now = performance.now();
    if (now < cryT || typeof SoundEnv === 'undefined') return;
    cryT = now + 1500;
    cars.forEach((c, p) => { const d = Math.hypot(c.x - x, c.z - z); if (d < 60) SoundEnv.cry(p, 'gull', 1 - d / 80); });
  }

  /* ==================================================================
     ДЫМ ИЗ ТРУБ
     ================================================================== */
  // из труб ближе SMOKE_R к любому игроку (не больше SMOKE_N труб) — клубы раз в 0,7–1,1 с
  const SMOKE_R = 130, SMOKE_N = 14;
  for (const c of chimneys) c.next = R(0, 1);
  function updateSmoke(dt) {
    const wd = world.wind || [0, 1], wl = Math.hypot(wd[0], wd[1]) || 1, wx = wd[0] / wl, wz = wd[1] / wl;
    let n = 0;
    for (const c of chimneys) {
      let near = false;
      for (const p of cars) if (Math.abs(p.x - c.x) < SMOKE_R && Math.abs(p.z - c.z) < SMOKE_R) { near = true; break; }
      if (!near) continue;
      if (++n > SMOKE_N) break;
      if ((c.next -= dt) > 0) continue;
      c.next = R(0.7, 1.1);
      smoke.spawn(c.x + R(-0.15, 0.15), c.y, c.z + R(-0.15, 0.15), wx * R(1.5, 2.5), R(1, 1.4), wz * R(1.5, 2.5), 0.9, R(5, 6.5), R(7, 9), 0xbdb8b2, 0.55);
    }
  }

  Object.assign(K, {
    life: {
      update(dt, t) { updateGulls(dt, t); updateSmoke(dt); },
      reset() { for (const g of gulls) if (g.home) { g.k = 0; g.kT = 0; g.scared = 0; } },
    },
  });
}
