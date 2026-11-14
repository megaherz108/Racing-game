// Ветер и тени облаков — добавки к общим кускам шейдеров Three.js (действуют на все материалы игры сразу).
// • Тени облаков: прямой свет солнца умножается на «облачность» над точкой. Мировая точка сносится вдоль луча солнца
//   на высоту облаков: тень на склоне, на стене и на земле у стены совпадает. Облачность — две выборки из бесшовной текстуры шума 128 × 128 (запечена здесь один раз), в вершинах,
//   а не в пикселях (замеры — ниже, у кусков шейдера). Включает карта: world.clouds = { k — глубина тени (0…1),
//   size — размер облака, м, speed — скорость, м/с }; без него k = 0 и расчёт пропускается (ветвление по uniform).
// • Ветер в зелени: Breeze.sway(mat, …) — верх кроны качается в вершинном шейдере экземпляров (InstancedMesh),
//   порывы бегут по местности волной по ветру. Тень от кроны качается вместе с ней (swayDepth — материал глубины
//   для карты теней). Нагрузка — только на вершины, пиксели не дороже.
// Направление ветра — world.wind = [x, z] (куда дует), по умолчанию с моря на север.
// Каждый кадр заезда — Breeze.update(t), в меню — Breeze.off().
// Определяет: Breeze.
// Использует: clamp (js/core.js); SUN_OFFSET (js/world.js); world (js/maps/registry.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const Breeze = (() => {
  // [смещение шума x, z; глубина тени], [1 / размер облака; снос по лучу солнца x/y, z/y]. Float32Array не копируется
  // при клонировании uniform-ов материала — все материалы видят один массив (как в js/envprobe.js)
  const CU = new Float32Array(6);
  // ветер для качания крон: направление x, z; время; сила
  const WIND = { value: new THREE.Vector4(0, 1, 0, 0) };

  /* ---------- тени облаков ---------- */
  // бесшовный шум: сумма октав шума значений (решётка 4, 8, 16, 32 клетки на сторону), растянут на 0…1;
  // одна сторона текстуры — 4 размера облака
  const TEX = (() => {
    const S = 128, out = new Float32Array(S * S);
    let seed = 777; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (const [n, amp] of [[4, 1], [8, 0.5], [16, 0.25], [32, 0.12]]) {
      const g = Array.from({ length: n * n }, rnd), cs = S / n, sm = t => t * t * (3 - 2 * t);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const fx = x / cs, fy = y / cs, i = Math.floor(fx), j = Math.floor(fy), u = sm(fx - i), v = sm(fy - j);
        const at = (a, b) => g[((b % n) * n) + (a % n)];
        out[y * S + x] += amp * ((at(i, j) * (1 - u) + at(i + 1, j) * u) * (1 - v) + (at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u) * v);
      }
    }
    let lo = Infinity, hi = -Infinity; for (const v of out) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    const data = new Uint8Array(S * S); out.forEach((v, i) => { data[i] = Math.round((v - lo) / (hi - lo) * 255); });
    const t = new THREE.DataTexture(data, S, S, THREE.RedFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true; t.needsUpdate = true;
    return t;
  })();
  // Облачность считается в вершинах (varying vBreeze), а не в пикселях: облако — десятки метров, а вершины земли,
  // дорог и домов — через 2–8 м, так что разницы не видно, а вершин в кадре в несколько раз меньше, чем пикселей
  // с перерисовкой (по пикселям две выборки текстуры стоили ≈ 0,15–0,3 мс кадра). Вершинная часть — в кусках
  // shadowmap_*_vertex: они есть ровно в шейдерах материалов с освещением (Ламберт, Фонг, стандартный, мультяшный).
  const VPARS = THREE.ShaderChunk.shadowmap_pars_vertex, VMAIN = THREE.ShaderChunk.shadowmap_vertex;
  const PARS = THREE.ShaderChunk.lights_pars_begin, BEGIN = THREE.ShaderChunk.lights_fragment_begin;
  const DECL = 'IncidentLight directLight;', DIR = 'getDirectionalLightInfo( directionalLight, directLight );';
  if (BEGIN.includes(DECL) && BEGIN.includes(DIR)) {
    THREE.ShaderChunk.shadowmap_pars_vertex = VPARS + `
      uniform vec3 breezeU[ 2 ];
      uniform sampler2D breezeTex;
      varying float vBreeze;
    `;
    THREE.ShaderChunk.shadowmap_vertex = VMAIN + `
      // доля прямого солнца, которую пропускают облака над вершиной
      vBreeze = 1.0;
      if ( breezeU[ 0 ].z > 0.0 ) {
        vec4 bw = vec4( transformed, 1.0 );
        #ifdef USE_BATCHING
          bw = batchingMatrix * bw;
        #endif
        #ifdef USE_INSTANCING
          bw = instanceMatrix * bw;
        #endif
        bw = modelMatrix * bw;
        vec2 p = ( bw.xz - bw.y * breezeU[ 1 ].yz ) * breezeU[ 1 ].x + breezeU[ 0 ].xy;
        float n = textureLod( breezeTex, p * 0.25, 0.0 ).r * 0.7 + textureLod( breezeTex, p * 0.59 + vec2( 0.37, 0.71 ), 0.0 ).r * 0.3;
        vBreeze = 1.0 - breezeU[ 0 ].z * smoothstep( 0.5, 0.68, n );
      }
    `;
    THREE.ShaderChunk.lights_pars_begin = PARS + '\nvarying float vBreeze;\n';
    THREE.ShaderChunk.lights_fragment_begin = BEGIN.replace(DIR, DIR + '\n\t\tdirectLight.color *= vBreeze;');
    // текстура клонируется в каждый материал, но объект-источник у копий общий — на видеокарту она грузится один раз
    for (const k of ['standard', 'physical', 'lambert', 'phong', 'toon', 'shadow']) Object.assign(THREE.ShaderLib[k].uniforms, { breezeU: { value: CU }, breezeTex: { value: TEX } });
  } else console.warn('Breeze: шейдер Three.js изменился — тени облаков выключены');

  /* ---------- качание крон ---------- */
  // mat — материал экземпляров; amp — размах верха кроны, м; y0…y1 — высота кроны в координатах геометрии;
  // base — доля размаха у низа кроны (крона качается целиком, верх — сильнее)
  const swayCode = sh => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec4 uSway, uWind;')
      .replace('#include <project_vertex>', THREE.ShaderChunk.project_vertex.replace('mvPosition = modelViewMatrix * mvPosition;', `
        {
          vec3 ip = vec3( 0.0 );
          #ifdef USE_INSTANCING
            ip = instanceMatrix[ 3 ].xyz;
          #endif
          float h = clamp( ( transformed.y - uSway.y ) * uSway.z, 0.0, 1.0 );
          h = uSway.w + ( 1.0 - uSway.w ) * h * h;
          float ph = dot( ip.xz, uWind.xy ) * 0.04;                       // порыв бежит по ветру волной
          float g = 0.5 + 0.5 * sin( uWind.z * 0.8 - ph ) * sin( uWind.z * 0.31 - ph * 0.55 + 1.3 );
          float s = sin( uWind.z * 2.3 + ip.x * 0.37 + ip.z * 0.29 ) * ( 0.25 + 0.35 * g );
          vec2 d = uWind.xy * ( 0.35 + g * 0.65 + s ) + vec2( -uWind.y, uWind.x ) * sin( uWind.z * 1.7 + ip.z * 0.5 ) * 0.2;
          mvPosition.xz += d * ( uSway.x * uWind.w * h );
        }
        mvPosition = modelViewMatrix * mvPosition;`));
  };
  function sway(mat, amp, y0 = -1, y1 = 1, base = 0.5) {
    const u = { value: new THREE.Vector4(amp, y0, 1 / (y1 - y0), base) };
    mat.onBeforeCompile = sh => { sh.uniforms.uSway = u; sh.uniforms.uWind = WIND; swayCode(sh); };
    // тень кроны качается вместе с ней — иначе на солнечной стороне ползают пятна собственной тени
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    depth.onBeforeCompile = mat.onBeforeCompile;
    mat.userData.swayDepth = depth;
    return mat;
  }

  /* ---------- каждый кадр ---------- */
  let ox = 0, oz = 0, lastT = 0;
  function update(t) {
    const c = world.clouds, wd = world.wind || [0, 1], wl = Math.hypot(wd[0], wd[1]) || 1, wx = wd[0] / wl, wz = wd[1] / wl;
    WIND.value.set(wx, wz, t, world.windK ?? 1);
    if (!c) { CU[2] = 0; return; }
    const dt = Math.min(0.1, Math.max(0, t - lastT)); lastT = t;
    ox -= wx * c.speed * dt / c.size; oz -= wz * c.speed * dt / c.size;
    CU[0] = ox; CU[1] = oz; CU[2] = c.k;
    CU[3] = 1 / c.size; CU[4] = SUN_OFFSET.x / SUN_OFFSET.y; CU[5] = SUN_OFFSET.z / SUN_OFFSET.y;
  }
  function off() { CU[2] = 0; }
  return { sway, update, off, CU, WIND };
})();
