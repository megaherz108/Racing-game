// Город — текстуры и материалы: разметка дорог, «зебра», полосатый щит, атлас дорожных знаков,
//   плитка, рёбра контейнеров, ленты дорог по чанкам (flatChunks), вода с рябью (waterMaterial).
// Определяет: ROAD_TILE, asphaltCanvas, canvasTex, laneTexture, zebraTexture, hazardTexture, SIGN_N, signAtlas,
//   signMaterial, pavingTexture, ribTexture, flatChunks, WATER_U, waterMaterial.
// Использует: renderer (js/core.js); chunkBuckets (js/world.js); NOISE (js/sky.js); Weather (js/weather.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

/* =====================================================================
   ТЕКСТУРЫ ДОРОГ (Canvas)
   ===================================================================== */
const ROAD_TILE = 12;   // метров дороги на один повтор текстуры разметки
function asphaltCanvas(w, h, base = '#3d4148', dots = 0.12) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, w, h);
  const n = Math.floor(w * h * dots);
  for (let i = 0; i < n; i++) {
    const v = (Math.random() - 0.5) * 0.16;
    x.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
    x.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  return [c, x];
}
function canvasTex(c, wrapS = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = wrapS ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}
// разметка полос: u — поперёк дороги (0…1 = вся ширина W), v — вдоль (ROAD_TILE м)
function laneTexture(W, type) {
  const PX = 512, [c, x] = asphaltCanvas(PX, PX), k = PX / W, vk = PX / ROAD_TILE;
  const line = (u, wM, color, dash) => {
    x.fillStyle = color;
    if (!dash) x.fillRect((u - wM / 2) * k, 0, wM * k, PX);
    else for (let v = 0; v < ROAD_TILE; v += 6) x.fillRect((u - wM / 2) * k, v * vk, wM * k, 3 * vk);
  };
  const WHITE = '#e9e9e2', YEL = '#e8b923';
  line(0.45, 0.15, WHITE); line(W - 0.45, 0.15, WHITE);              // края
  if (type === 'street') line(W / 2, 0.14, WHITE, true);             // прерывистая по центру
  else {
    line(W / 2 - 0.18, 0.13, YEL); line(W / 2 + 0.18, 0.13, YEL);    // двойная сплошная
    const lane = (W / 2 - 0.5) / 2;
    line(W / 2 - lane, 0.13, WHITE, true); line(W / 2 + lane, 0.13, WHITE, true);
  }
  return canvasTex(c, false);
}
// «зебра»: одна полоса + промежуток (повторяется поперёк дороги каждые 1,8 м)
function zebraTexture() {
  const [c, x] = asphaltCanvas(64, 128);
  x.fillStyle = '#ecece6'; x.fillRect(4, 8, 28, 112);
  return canvasTex(c);
}
function hazardTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#f2c230'; x.fillRect(0, 0, 64, 64);
  x.fillStyle = '#1b1b1b';
  for (let i = -64; i < 128; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 16, 0); x.lineTo(i + 80, 64); x.lineTo(i + 64, 64); x.fill(); }
  const t = canvasTex(c); t.repeat.set(1, 1);
  return t;
}
// дорожные знаки в один ряд (по 128 px): 0 — «Стоп», 1 — «Уступи дорогу», 2 — «40», 3 — парковка, 4 — пешеходный переход.
// Вне формы знака — прозрачно (alphaTest вырезает силуэт).
const SIGN_N = 5;
function signAtlas() {
  const S = 128, c = document.createElement('canvas'); c.width = S * SIGN_N; c.height = S;
  const x = c.getContext('2d');
  const poly = (cx, cy, r, n, rot) => { x.beginPath(); for (let k = 0; k < n; k++) { const a = rot + k * Math.PI * 2 / n; x.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a)); } x.closePath(); };
  const text = (t, cx, cy, size, col) => { x.fillStyle = col; x.font = `bold ${size}px Arial, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(t, cx, cy); };
  // «Стоп»: красный восьмиугольник с белой каймой
  poly(64, 64, 62, 8, Math.PI / 8); x.fillStyle = '#fff'; x.fill();
  poly(64, 64, 55, 8, Math.PI / 8); x.fillStyle = '#c8201e'; x.fill();
  text('STOP', 64, 66, 32, '#fff');
  // «Уступи дорогу»: перевёрнутый треугольник
  x.save(); x.translate(S, 0);
  poly(64, 52, 66, 3, Math.PI / 2); x.fillStyle = '#c8201e'; x.fill();
  poly(64, 52, 42, 3, Math.PI / 2); x.fillStyle = '#fff'; x.fill();
  x.restore();
  // ограничение скорости
  x.save(); x.translate(S * 2, 0);
  x.beginPath(); x.arc(64, 64, 62, 0, Math.PI * 2); x.fillStyle = '#c8201e'; x.fill();
  x.beginPath(); x.arc(64, 64, 48, 0, Math.PI * 2); x.fillStyle = '#fff'; x.fill();
  text('40', 64, 67, 52, '#111');
  x.restore();
  // парковка
  x.save(); x.translate(S * 3, 0);
  x.fillStyle = '#fff'; x.fillRect(4, 4, 120, 120); x.fillStyle = '#1f5fbf'; x.fillRect(10, 10, 108, 108);
  text('P', 64, 68, 84, '#fff');
  x.restore();
  // пешеходный переход: синий квадрат, белый треугольник, «зебра»
  x.save(); x.translate(S * 4, 0);
  x.fillStyle = '#fff'; x.fillRect(4, 4, 120, 120); x.fillStyle = '#1f5fbf'; x.fillRect(10, 10, 108, 108);
  poly(64, 74, 50, 3, -Math.PI / 2); x.fillStyle = '#fff'; x.fill();
  x.fillStyle = '#111'; for (let k = 0; k < 4; k++) x.fillRect(38 + k * 14, 86, 8, 12);
  x.beginPath(); x.arc(64, 52, 6, 0, Math.PI * 2); x.fill(); x.fillRect(60, 58, 8, 22);
  x.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}
// материал знака: номер знака в атласе берётся из атрибута экземпляра aSign.
// back — оборотная сторона: серая, но с тем же силуэтом (из альфа-канала атласа)
function signMaterial(tex, back) {
  const m = new THREE.MeshStandardMaterial(back ? { color: 0x8a9098, map: tex, alphaTest: 0.5, roughness: 0.5, metalness: 0.5 } : { map: tex, alphaTest: 0.5, roughness: 0.55 });
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aSign;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>\nvMapUv.x = (vMapUv.x + aSign) / ${SIGN_N}.0;`);
    if (back) sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', 'diffuseColor.a *= texture2D( map, vMapUv ).a;');
  };
  m.customProgramCacheKey = () => back ? 'sign-back' : 'sign-front';
  return m;
}
function pavingTexture() {
  const [c, x] = asphaltCanvas(128, 128, '#b9b4a8', 0.08);
  x.strokeStyle = 'rgba(0,0,0,0.18)'; x.lineWidth = 2;
  for (let i = 0; i <= 128; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 128); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(128, i); x.stroke(); }
  return canvasTex(c);
}
function ribTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 8;
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 64, 8);
  x.fillStyle = 'rgba(0,0,0,0.22)'; for (let i = 0; i < 64; i += 4) x.fillRect(i, 0, 1.5, 8);
  return canvasTex(c);
}

// Плоские прямоугольники (дороги, переходы, тротуары) сливаются в одну геометрию на чанк и материал.
// mode: 'lane' — разметка вдоль, 'zebra' — поперечные полосы, 'world' — текстура по мировым координатам
function flatChunks(group, mat, quads, shadow = false) {
  for (const arr of chunkBuckets(quads, q => [q.cx, q.cz])) {
    const P = [], N = [], U = [], I = [];
    arr.forEach((q, k) => {
      const hl = q.len / 2, hw = q.wid / 2;
      for (const [a, l] of [[-hw, -hl], [hw, -hl], [hw, hl], [-hw, hl]]) {
        const x = q.dir === 'z' ? q.cx + a : q.cx + l, z = q.dir === 'z' ? q.cz + l : q.cz - a;
        P.push(x, q.y, z); N.push(0, 1, 0);
        if (q.mode === 'lane') U.push((a + hw) / q.wid, (l + hl) / ROAD_TILE);
        else if (q.mode === 'zebra') U.push((a + hw) / 1.8, (l + hl) / q.len);
        else U.push(x / (q.tile || 8), z / (q.tile || 8));
      }
      const o = k * 4; I.push(o, o + 2, o + 1, o, o + 3, o + 2);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    g.setIndex(I); g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, mat); mesh.receiveShadow = true; mesh.castShadow = shadow;
    group.add(mesh);
  }
}

/* ---------- вода ---------- */
// Море и канал — одна плоскость. Рябь — карта нормалей (js/sky.js, NOISE.normal), которая читается дважды в разных
// масштабах и плывёт в разные стороны: на воде играют блики солнца и отражение неба. В дождь рябь сильнее.
// Две выборки текстуры на пиксель воды — почти бесплатно.
const WATER_U = { uTime: { value: 0 }, uWaterN: { value: NOISE.normal } };
function waterMaterial(color) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.86 });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, WATER_U);
    sh.uniforms.uWet = Weather.wetUniform;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos;
uniform float uTime, uWet;
uniform sampler2D uWaterN;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec2 wuv = vWPos.xz;
          vec3 n1 = texture2D(uWaterN, wuv * 0.031 + uTime * vec2(0.011, 0.006)).xyz * 2.0 - 1.0;
          vec3 n2 = texture2D(uWaterN, wuv * 0.083 - uTime * vec2(0.009, 0.016)).xyz * 2.0 - 1.0;
          vec2 slope = (n1.xz + n2.xz) * (0.55 + uWet * 0.6);
          vec3 wn = normalize(vec3(slope.x, 1.0, slope.y));
          normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
        }`);
  };
  m.customProgramCacheKey = () => 'water-ripple';
  return m;
}
