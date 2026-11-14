// Небо и время суток: купол неба (градиент, солнце/луна, облака, звёзды) — туман в цвет горизонта, солнце/луна,
// отражения, ночные огни (окна — шейдер зданий в js/world.js, фонари — buildCity(), фары игроков — здесь).
// Погода (дождь) делает небо пасмурным: js/weather.js.
// Определяет: glowTexture, tileFbm, dataCanvasTex, NOISE, Sky.
// Использует: envTex, pmrem, clamp, renderer (js/core.js); EnvProbe (js/envprobe.js); mulberry32, smooth01, scene,
//   sun, SUN_OFFSET, hemi, NIGHT_U (js/world.js); Weather (js/weather.js); cars (js/physics.js); cams (js/match.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.

/* =====================================================================
   НЕБО И ВРЕМЯ СУТОК
   ===================================================================== */
// мягкое круглое пятно: ореолы фонарей и световые пятна на асфальте
function glowTexture(size = 64, inner = 0.35, mid = 0.45) {
  const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d');
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(inner, `rgba(255,255,255,${mid})`); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

// Бесшовный фрактальный шум (сумма октав value-noise на периодической решётке), значения 0…1.
// Из него сделаны облака, лужи на мокром асфальте и рябь на воде — всё считается один раз при загрузке.
function tileFbm(size, cells, octaves, seed) {
  const rng = mulberry32(seed), out = new Float32Array(size * size);
  let amp = 1;
  for (let o = 0; o < octaves; o++, amp *= 0.5) {
    const n = cells << o, lat = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) lat[i] = rng();
    for (let y = 0; y < size; y++) {
      const fy = y / size * n, iy = Math.floor(fy), ty = smooth01(fy - iy), y0 = iy % n, y1 = (iy + 1) % n;
      for (let x = 0; x < size; x++) {
        const fx = x / size * n, ix = Math.floor(fx), tx = smooth01(fx - ix), x0 = ix % n, x1 = (ix + 1) % n;
        const a = lat[y0 * n + x0], b = lat[y0 * n + x1], c = lat[y1 * n + x0], d = lat[y1 * n + x1];
        out[y * size + x] += amp * (a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty);
      }
    }
  }
  let lo = Infinity, hi = -Infinity;
  for (const v of out) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - lo) / (hi - lo);
  return out;
}
function dataCanvasTex(size, fill) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d'), img = x.createImageData(size, size);
  for (let i = 0; i < size * size; i++) { fill(i, img.data, i * 4); img.data[i * 4 + 3] = 255; }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;           // данные, а не цвет: без перевода из sRGB
  return t;
}
const NOISE = (() => {
  const S = 256;
  const cloud = tileFbm(S, 4, 5, 515), ripple = tileFbm(S, 8, 4, 77);
  // шум: R — облака/лужи
  const tex = dataCanvasTex(S, (i, d, o) => { d[o] = d[o + 1] = d[o + 2] = Math.round(cloud[i] * 255); });
  // карта нормалей ряби: наклоны высоты по X и по Z (G — «вверх»), упакованы в 0…255
  const h = (x, y) => ripple[((y + S) % S) * S + ((x + S) % S)];
  const normal = dataCanvasTex(S, (i, d, o) => {
    const x = i % S, y = (i / S) | 0, k = 5;
    const nx = (h(x - 1, y) - h(x + 1, y)) * k, nz = (h(x, y - 1) - h(x, y + 1)) * k, l = Math.hypot(nx, 1, nz);
    d[o] = Math.round((nx / l * 0.5 + 0.5) * 255); d[o + 1] = Math.round((1 / l * 0.5 + 0.5) * 255); d[o + 2] = Math.round((nz / l * 0.5 + 0.5) * 255);
  });
  return { tex, normal };
})();

const Sky = (() => {
  // top — зенит, hor — горизонт (он же цвет тумана; null — цвет неба карты), gnd — низ развёртки для отражений;
  // sun — цвет и сила направленного света, off — откуда он светит (тени), hemi — небо/земля/сила,
  // night — насколько горят ночные огни, fogK — множитель дальности тумана, env — отражения: комната или само небо;
  // disc — угловой радиус диска светила (рад) и его яркость, glow — ореол вокруг него [сила, резкость];
  // cloud — облака: доля неба без облаков (cover, больше — реже облака), цвет освещённого верха и тени, прозрачность
  const PRESETS = {
    day: { top: 0x3f7fd6, hor: null, gnd: 0x8aa0ae, sun: [0xfff4e2, 2.4], off: [-30, 90, -45], hemi: [0xe2f0ff, 0x4d5b3c, 0.7],
      night: 0, fogK: 1, env: 'room', disc: [0.02, 6], glow: [0.35, 24], glowRGB: null,
      cloud: { cover: 0.5, lit: 0xffffff, dark: 0xaab8cc, a: 0.95 } },
    sunset: { top: 0x2c3d72, hor: 0xf3a46e, gnd: 0x5a4650, sun: [0xffa257, 2.1], off: [-100, 30, -36], hemi: [0xffc39a, 0x47383c, 0.55],
      night: 0.3, fogK: 0.9, env: 'sky', disc: [0.03, 5], glow: [0.9, 6], glowRGB: [255, 196, 120],
      cloud: { cover: 0.52, lit: 0xffb27a, dark: 0x5b4767, a: 0.95 } },
    // золотой час: солнце низко, тёплый свет и длинные тени; в отличие от заката фары и огни ещё не горят.
    // Задаётся картой (world.tod), а не меню; направление солнца — world.sunOff
    golden: { top: 0x4a74b6, hor: 0xf2d2a6, gnd: 0x6b5a4a, sun: [0xffc27c, 2.55], off: [70, 26, -72], hemi: [0xffd8b0, 0x5b4b3a, 0.6],
      night: 0, fogK: 1, env: 'sky', disc: [0.028, 5], glow: [0.75, 8], glowRGB: [255, 206, 140],
      cloud: { cover: 0.58, lit: 0xffd2a2, dark: 0x8d7b8a, a: 0.9 } },
    night: { top: 0x03060f, hor: 0x1a2742, gnd: 0x080b12, sun: [0x9fb6ff, 0.35], off: [45, 80, -55], hemi: [0x4a5c88, 0x101318, 0.2],
      night: 1, fogK: 0.75, env: 'sky', disc: [0.035, 1.6], glow: [0.25, 40], glowRGB: [210, 222, 255], stars: true,
      cloud: { cover: 0.56, lit: 0x2c3650, dark: 0x0b0f19, a: 0.85 } },
  };
  // дождь: небо затянуто серыми тучами, солнце почти не пробивается, туман ближе
  const RAIN = {
    day: { top: 0x6f7984, hor: 0x9aa3ab, gnd: 0x2c3036, sun: 0.85, hemi: 0.95, fogK: 0.62, cloud: { cover: 0.08, lit: 0xa9b0b8, dark: 0x5d646d, a: 1 }, glow: 0.1 },
    sunset: { top: 0x3b3f52, hor: 0x8d7c78, gnd: 0x2a2629, sun: 0.7, hemi: 0.85, fogK: 0.6, cloud: { cover: 0.1, lit: 0x9a8580, dark: 0x3c3a48, a: 1 }, glow: 0.3 },
    night: { top: 0x05070b, hor: 0x161c26, gnd: 0x07090c, sun: 0.6, hemi: 0.9, fogK: 0.62, cloud: { cover: 0.08, lit: 0x1d2330, dark: 0x0a0d13, a: 1 }, glow: 0.05 },
  };
  function preset(id, rain) {
    const P = PRESETS[id] || PRESETS.day;
    if (!rain) return P;
    const R = RAIN[id] || RAIN.day;
    // отражения в дождь — всегда от пасмурного неба (а не от «комнаты»): мокрый асфальт и кузова отражают серые тучи
    return Object.assign({}, P, { top: R.top, hor: R.hor, gnd: R.gnd, env: 'sky', sun: [P.sun[0], P.sun[1] * R.sun], hemi: [P.hemi[0], P.hemi[1], P.hemi[2] * R.hemi],
      fogK: P.fogK * R.fogK, cloud: R.cloud, glow: [P.glow[0] * R.glow, P.glow[1]], disc: [P.disc[0], P.disc[1] * R.glow], stars: false, rain: true });
  }
  const cache = new Map();
  let cur = PRESETS.day;

  const hex = h => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
  const css = (c, k = 1) => `rgb(${c.map(v => Math.min(255, Math.round(v * k))).join(',')})`;
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  // Карта отражений (равнопромежуточная развёртка неба): градиент и ореол светила. boost — ярче, чтобы ночью кузова
  // не становились совсем чёрными. Само небо на экране рисует купол (ниже), а не эта картинка.
  function envCanvas(P, horHex, boost, W = 256, H = 128) {
    const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    const top = hex(P.top), hor = hex(horHex), gnd = hex(P.gnd);
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, css(top, boost)); g.addColorStop(0.3, css(mix(top, hor, 0.45), boost)); g.addColorStop(0.47, css(mix(top, hor, 0.88), boost));
    g.addColorStop(0.5, css(hor, boost)); g.addColorStop(0.56, css(mix(hor, gnd, 0.6), boost)); g.addColorStop(1, css(gnd, boost));
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    if (P.glowRGB && !P.rain) {
      const d = new THREE.Vector3(...P.off).normalize();
      const u = Math.atan2(d.z, d.x) / (Math.PI * 2) + 0.5, v = Math.asin(d.y) / Math.PI + 0.5;
      const cx = u * W, cy = (1 - v) * H, [r, gg, b] = P.glowRGB;
      for (const ox of [-W, 0, W]) {
        const gr = x.createRadialGradient(cx + ox, cy, 0, cx + ox, cy, (P.night >= 1 ? 0.05 : 0.22) * W);
        gr.addColorStop(0, `rgba(${r},${gg},${b},${0.85 * Math.min(1, boost)})`); gr.addColorStop(0.25, `rgba(${r},${gg},${b},.35)`); gr.addColorStop(1, `rgba(${r},${gg},${b},0)`);
        x.fillStyle = gr; x.fillRect(0, 0, W, H);
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  function envFor(id, P, horHex) {
    if (P.env !== 'sky') return envTex;
    const key = id + ':' + horHex + ':' + !!P.rain + ':' + P.off.join(',');    // ореол светила зависит от направления
    if (!cache.has(key)) { const e = envCanvas(P, horHex, id === 'night' ? 1.6 : P.rain ? 1 : 1.2); cache.set(key, pmrem.fromEquirectangular(e).texture); e.dispose(); }
    return cache.get(key);
  }

  /* ---------- купол неба ---------- */
  // Сфера вокруг камеры, которая рисуется на дальней плоскости (z = w) последней из непрозрачных объектов: видеокарта
  // отбрасывает закрытые зданиями пиксели ещё до шейдера, поэтому купол дешевле прежнего фона на весь экран.
  // Цвет у горизонта = цвет тумана. Three.js подмешивает туман уже после тон-маппинга, поэтому купол тоже рисуется без
  // тон-маппинга — у горизонта получается ровно тот же цвет, что у далёких домов в тумане, без шва.
  // Облака — бесшовный шум, спроецированный на «потолок» над камерой и медленно плывущий по ветру.
  const starTex = (() => {
    const W = 2048, H = 1024, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
    const rng = mulberry32(11);
    for (let i = 0; i < 2600; i++) {
      const v = Math.pow(rng(), 1.5) * 0.48, a = (0.3 + rng() * 0.7) * (1 - v / 0.5), big = rng() < 0.07;
      x.fillStyle = `rgba(255,255,255,${a})`; x.fillRect(rng() * W, v * H, big ? 2 : 1.3, big ? 2 : 1.3);
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter;
    return t;
  })();
  const U = {
    uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunCol: { value: new THREE.Color() }, uDisc: { value: new THREE.Vector2() }, uGlow: { value: new THREE.Vector2() },
    uCloudLit: { value: new THREE.Color() }, uCloudDark: { value: new THREE.Color() }, uCover: { value: 0.5 }, uCloudA: { value: 1 },
    uStars: { value: 0 }, uTime: { value: 0 }, uNoise: { value: NOISE.tex }, uStarTex: { value: starTex },
  };
  const dome = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.ShaderMaterial({
    uniforms: U, side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
        gl_Position.z = gl_Position.w;          // на дальней плоскости: рисуется только там, где нет ничего ближе
      }`,
    fragmentShader: `
      uniform vec3 uTop, uHor, uSunDir, uSunCol, uCloudLit, uCloudDark;
      uniform vec2 uDisc, uGlow;
      uniform float uCover, uCloudA, uStars, uTime;
      uniform sampler2D uNoise, uStarTex;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y, t = clamp(h, 0.0, 1.0);
        vec3 col = mix(uHor, uTop, pow(t, 0.55));
        float c = max(dot(d, uSunDir), 0.0);
        col += uSunCol * uGlow.x * (pow(c, uGlow.y) + 0.3 * pow(c, uGlow.y * 0.12));
        float disc = smoothstep(cos(uDisc.x), cos(uDisc.x * 0.8), c);
        float cl = 0.0;
        if (h > 0.0) {
          if (uStars > 0.0) {
            vec2 suv = vec2(atan(d.z, d.x) / 6.2831853 + 0.5, asin(h) / 3.1415927 + 0.5);
            col += texture2D(uStarTex, suv).rgb * uStars;
          }
          vec2 uv = d.xz / (h + 0.1) * 0.22;
          float n = texture2D(uNoise, uv + uTime * vec2(0.0042, 0.0017)).r * 0.68
                  + texture2D(uNoise, uv * 2.7 + uTime * vec2(-0.0021, 0.0049)).r * 0.32;
          cl = smoothstep(uCover, uCover + 0.22, n) * smoothstep(0.0, 0.16, h) * uCloudA;
          // толще облако — темнее низ; со стороны светила — подсвеченный край
          vec3 cc = mix(uCloudLit, uCloudDark, smoothstep(uCover + 0.1, uCover + 0.5, n));
          cc += uSunCol * 0.35 * uGlow.x * pow(c, 5.0) * (1.0 - smoothstep(uCover, uCover + 0.35, n));
          col = mix(col, cc, cl);
        }
        col += uSunCol * disc * uDisc.y * (1.0 - cl * 0.9);
        col = mix(uHor, col, smoothstep(-0.03, 0.02, h));     // ниже горизонта — цвет тумана
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  }));
  dome.frustumCulled = false; dome.renderOrder = 10; dome.matrixAutoUpdate = false; dome.visible = false;
  scene.add(dome);

  /* ---------- фары игроков ---------- */
  // Два прожектора создаются один раз. Вечером и ночью они всегда в сцене (без машины — с нулевой силой): если бы число
  // источников света менялось посреди заезда, Three.js перекомпилировал бы шейдеры всех материалов города. Днём их
  // убирает apply() — на экране загрузки.
  const heads = [0, 1].map(() => {
    const L = new THREE.SpotLight(0xfff1d8, 0, 75, 0.52, 0.5, 1.1);
    L.castShadow = false; scene.add(L, L.target);
    return L;
  });

  /* ---------- материалы ночных огней (ими пользуется buildCity) ---------- */
  const glowTex = glowTexture(64, 0.3), poolTex = glowTexture(64, 0.6, 0.7);
  const mats = {
    bulb: new THREE.MeshBasicMaterial({ color: 0xb9bdc4 }),
    halo: new THREE.PointsMaterial({ map: glowTex, color: 0xffd7a0, size: 3.2, sizeAttenuation: true, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false }),
    pool: new THREE.MeshBasicMaterial({ map: poolTex, color: 0xffc98a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
  };

  // включить время суток id для мира w (вызывается из activateWorld); rain — дождь (js/weather.js)
  // w.sunOff — направление на солнце, заданное картой (вместо пресета); w.far — дальность прорисовки карты
  // (горы-фон за туманом), иначе — до конца тумана
  function apply(w, id = 'day', rain = false) {
    let P = preset(id, rain);
    if (w.sunOff) P = Object.assign({}, P, { off: w.sunOff });
    cur = P;
    const horHex = P.hor ?? w.sky;
    scene.background = null; dome.visible = true;
    scene.environment = envFor(id, P, horHex);
    EnvProbe.bake(scene.environment);         // шесть цветов окружения для матовых поверхностей (js/envprobe.js)
    scene.fog.color.setHex(horHex);
    scene.fog.near = w.fog[0] * P.fogK; scene.fog.far = w.fog[1] * P.fogK;
    // дальше тумана всё равно ничего не видно — не рисуем
    for (const c of cams) { c.far = w.far ?? scene.fog.far + 40; c.near = w.near ?? 0.1; c.updateProjectionMatrix(); }
    sun.color.setHex(P.sun[0]); sun.intensity = P.sun[1]; SUN_OFFSET.set(...P.off);
    hemi.color.setHex(P.hemi[0]); hemi.groundColor.setHex(P.hemi[1]); hemi.intensity = P.hemi[2];
    // w.look — подстройка карты поверх пресета: sun — сила солнца, hemi — [сила, цвет земли] заполняющего света,
    // exposure — экспозиция, grade — тонкоррекция (js/core.js). Значения заменяют пресетные, а не умножают их
    const L = w.look || {};
    if (L.sun != null) sun.intensity = L.sun;
    if (L.hemi) { hemi.intensity = L.hemi[0]; if (L.hemi[1] != null) hemi.groundColor.setHex(L.hemi[1]); }
    renderer.toneMappingExposure = L.exposure ?? 1;
    renderer.toneMapping = L.grade ? THREE.CustomToneMapping : THREE.ACESFilmicToneMapping;
    // купол
    U.uTop.value.setHex(P.top); U.uHor.value.setHex(horHex);
    U.uSunDir.value.set(...P.off).normalize(); U.uSunCol.value.setHex(P.sun[0]);
    U.uDisc.value.set(...P.disc); U.uGlow.value.set(...P.glow);
    U.uCloudLit.value.setHex(P.cloud.lit); U.uCloudDark.value.setHex(P.cloud.dark); U.uCover.value = P.cloud.cover; U.uCloudA.value = P.cloud.a;
    U.uStars.value = P.stars ? 1 : 0;
    NIGHT_U.value = P.night;
    // днём фар нет в сцене совсем: прожектор с нулевой силой всё равно считается в каждом пикселе (≈1,3 мс на кадр
    // у встроенной видеокарты). Число источников света меняется только здесь — при выборе времени суток перед заездом,
    // поэтому шейдеры перекомпилируются один раз на загрузке, а не посреди игры.
    for (const L of heads) L.visible = P.night > 0;
    mats.bulb.color.setHex(P.night > 0 ? 0xfff0d0 : 0xb9bdc4);
    mats.halo.opacity = P.night * 0.9; mats.pool.opacity = P.night * 0.9;
    if (w.setNight) w.setNight(P.night);
    Weather.apply(rain);
  }
  // каждый кадр: фары следуют за машинами игроков, облака плывут
  function update(t) {
    U.uTime.value = t;
    for (let p = 0; p < 2; p++) {
      const L = heads[p], c = cars[p];
      if (!c || cur.night <= 0 || c.drown > 0) { L.intensity = 0; continue; }
      L.intensity = 38 * cur.night;
      const [x, z] = c.local(0, c.L / 2 + 0.2), [tx, tz] = c.local(0, c.L / 2 + 18);
      L.position.set(x, c.y + 0.75, z); L.target.position.set(tx, c.y - 1.2, tz); L.target.updateMatrixWorld();
    }
  }
  return { apply, update, mats, glowTex, get night() { return cur.night; } };
})();
