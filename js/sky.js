// Небо и время суток: градиентное небо со светилом, туман в цвет горизонта, солнце/луна, отражения,
// ночные огни (окна — шейдер зданий в js/world.js, фонари — buildCity(), фары игроков — здесь).
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

const Sky = (() => {
  // top — зенит, hor — горизонт (он же цвет тумана; null — цвет неба карты), gnd — под горизонтом;
  // sun — цвет и сила направленного света, off — откуда он светит (тени), hemi — небо/земля/сила,
  // night — насколько горят ночные огни, fogK — множитель дальности тумана, env — отражения: комната или само небо
  const PRESETS = {
    day: { top: 0x4a86d6, hor: null, gnd: 0x8aa0ae, sun: [0xfff4e2, 2.4], off: [-30, 90, -45], hemi: [0xe2f0ff, 0x4d5b3c, 0.7],
      night: 0, fogK: 1, env: 'room', glow: null },
    sunset: { top: 0x2c3d72, hor: 0xf3a46e, gnd: 0x5a4650, sun: [0xffa257, 2.1], off: [-100, 30, -36], hemi: [0xffc39a, 0x47383c, 0.55],
      night: 0.3, fogK: 0.9, env: 'sky', glow: { color: [255, 196, 120], r: 0.22, disc: 0.009 } },
    night: { top: 0x03060f, hor: 0x1a2742, gnd: 0x080b12, sun: [0x9fb6ff, 0.35], off: [45, 80, -55], hemi: [0x4a5c88, 0x101318, 0.2],
      night: 1, fogK: 0.75, env: 'sky', glow: { color: [210, 222, 255], r: 0.05, disc: 0.008 }, stars: true },
  };
  const cache = new Map();
  let cur = PRESETS.day;

  const hex = h => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
  const css = (c, k = 1) => `rgb(${c.map(v => Math.min(255, Math.round(v * k))).join(',')})`;
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  // равнопромежуточная развёртка неба (как ждёт EquirectangularReflectionMapping): u — азимут, v — высота.
  // boost — ярче для карты отражений, чтобы ночью кузова не становились совсем чёрными
  function skyCanvas(P, horHex, boost, W = 1024, H = 512) {
    const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    const top = hex(P.top), hor = hex(horHex), gnd = hex(P.gnd);
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, css(top, boost)); g.addColorStop(0.3, css(mix(top, hor, 0.45), boost)); g.addColorStop(0.47, css(mix(top, hor, 0.88), boost));
    g.addColorStop(0.5, css(hor, boost)); g.addColorStop(0.56, css(mix(hor, gnd, 0.6), boost)); g.addColorStop(1, css(gnd, boost));
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    if (P.stars) {
      const rng = mulberry32(11);
      for (let i = 0; i < 900; i++) {
        const v = Math.pow(rng(), 1.6) * 0.47, a = (0.25 + rng() * 0.75) * (1 - v / 0.5) * boost;
        x.fillStyle = `rgba(255,255,255,${Math.min(1, a)})`; x.fillRect(rng() * W, v * H, rng() < 0.08 ? 2 : 1, rng() < 0.08 ? 2 : 1);
      }
    }
    if (P.glow) {
      // направление на светило (откуда падает свет) → координаты на развёртке
      const d = new THREE.Vector3(...P.off).normalize();
      const u = Math.atan2(d.z, d.x) / (Math.PI * 2) + 0.5, v = Math.asin(d.y) / Math.PI + 0.5;
      const cx = u * W, cy = (1 - v) * H, [r, gg, b] = P.glow.color;
      for (const ox of [-W, 0, W]) {                 // ореол не обрывается на шве развёртки
        const gr = x.createRadialGradient(cx + ox, cy, 0, cx + ox, cy, P.glow.r * W);
        gr.addColorStop(0, `rgba(${r},${gg},${b},${0.85 * Math.min(1, boost)})`); gr.addColorStop(0.25, `rgba(${r},${gg},${b},.35)`); gr.addColorStop(1, `rgba(${r},${gg},${b},0)`);
        x.fillStyle = gr; x.fillRect(0, 0, W, H);
        x.fillStyle = `rgb(${Math.min(255, r + 50)},${Math.min(255, gg + 50)},${Math.min(255, b + 40)})`;
        x.beginPath(); x.arc(cx + ox, cy, P.glow.disc * W, 0, Math.PI * 2); x.fill();
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  function textures(id, horHex) {
    const key = id + ':' + horHex;
    if (!cache.has(key)) {
      const P = PRESETS[id], bg = skyCanvas(P, horHex, 1);
      let env = envTex;
      if (P.env === 'sky') { const e = skyCanvas(P, horHex, id === 'night' ? 1.6 : 1.2, 256, 128); env = pmrem.fromEquirectangular(e).texture; e.dispose(); }
      cache.set(key, { bg, env });
    }
    return cache.get(key);
  }

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

  // включить время суток id для мира w (вызывается из activateWorld)
  function apply(w, id = 'day') {
    const P = cur = PRESETS[id] || PRESETS.day;
    const horHex = P.hor ?? w.sky, tx = textures(id, horHex);
    scene.background = tx.bg; scene.environment = tx.env;
    scene.fog.color.setHex(horHex);
    scene.fog.near = w.fog[0] * P.fogK; scene.fog.far = w.fog[1] * P.fogK;
    // дальше тумана всё равно ничего не видно — не рисуем
    for (const c of cams) { c.far = scene.fog.far + 40; c.updateProjectionMatrix(); }
    sun.color.setHex(P.sun[0]); sun.intensity = P.sun[1]; SUN_OFFSET.set(...P.off);
    hemi.color.setHex(P.hemi[0]); hemi.groundColor.setHex(P.hemi[1]); hemi.intensity = P.hemi[2];
    NIGHT_U.value = P.night;
    // днём фар нет в сцене совсем: прожектор с нулевой силой всё равно считается в каждом пикселе (≈1,3 мс на кадр
    // у встроенной видеокарты). Число источников света меняется только здесь — при выборе времени суток перед заездом,
    // поэтому шейдеры перекомпилируются один раз на загрузке, а не посреди игры.
    for (const L of heads) L.visible = P.night > 0;
    mats.bulb.color.setHex(P.night > 0 ? 0xfff0d0 : 0xb9bdc4);
    mats.halo.opacity = P.night * 0.9; mats.pool.opacity = P.night * 0.9;
    if (w.setNight) w.setNight(P.night);
  }
  // каждый кадр: фары следуют за машинами игроков
  function update() {
    for (let p = 0; p < 2; p++) {
      const L = heads[p], c = cars[p];
      if (!c || cur.night <= 0 || c.drown > 0) { L.intensity = 0; continue; }
      L.intensity = 38 * cur.night;
      const [x, z] = c.local(0, c.L / 2 + 0.2), [tx, tz] = c.local(0, c.L / 2 + 18);
      L.position.set(x, c.y + 0.75, z); L.target.position.set(tx, c.y - 1.2, tz); L.target.updateMatrixWorld();
    }
  }
  return { apply, update, mats, get night() { return cur.night; } };
})();
