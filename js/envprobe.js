// Дешёвый свет окружения: «проба» из шести цветов вместо выборок из карты отражений для матовых поверхностей.
// Определяет: EnvProbe.
// Использует: renderer, envTex (js/core.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

/* =====================================================================
   ПРОБА ОКРУЖЕНИЯ
   ===================================================================== */
// Каждый пиксель MeshStandardMaterial дважды читает карту окружения (scene.environment): рассеянный свет неба
// (по нормали) и отражение (по отражённому лучу). Это четыре выборки из текстуры и сотня операций — на встроенной
// видеокарте ≈ 1,6 мс кадра (замерено). Но рассеянный свет и отражение в шероховатой поверхности — очень размытая
// картинка окружения, и её точно описывают шесть цветов: что «видно» в направлениях ±X, ±Y, ±Z («ambient cube»).
// Поэтому общий кусок шейдера Three.js подменён:
//   • рассеянный свет окружения — всегда из шести цветов;
//   • отражение — из шести цветов, если шероховатость ≥ ROUGH (асфальт, земля, стены, деревья), иначе, как раньше,
//     из карты отражений (стекло, кузова, хром, вода, мокрый асфальт в дождь). Ветвление — по каждому пикселю,
//     поэтому окна фасадов и лужи остаются зеркальными, а стена и сухой асфальт рядом с ними считаются дёшево.
// Шесть цветов снимаются с самой карты отражений (bake) при её создании, так что день, закат, ночь и дождь
// выглядят как прежде. Подмена действует на все материалы игры сразу — отдельно их настраивать не нужно.
const EnvProbe = (() => {
  const ROUGH = 0.72;                       // с этой шероховатости отражение неотличимо от рассеянного света
  const CUBE = new Float32Array(18);        // шесть цветов текущей сцены: +X, −X, +Y, −Y, +Z, −Z (общий uniform)
  const cache = new Map();                  // карта окружения → её шесть цветов
  let current = null;

  /* ---------- подмена куска шейдера ---------- */
  const SRC = THREE.ShaderChunk.envmap_physical_pars_fragment;
  const IRR = 'vec4 envMapColor = textureCubeUV( envMap, worldNormal, 1.0 );';
  const RAD = 'vec4 envMapColor = textureCubeUV( envMap, reflectVec, roughness );';
  // ?noprobe в адресе — отладка: всё считается по-старому (сравнить картинку и время кадра)
  const ok = SRC.includes(IRR) && SRC.includes(RAD) && !/[?&]noprobe\b/.test(location.search);
  if (ok) {
    // ENV_PROBE_BAKE — материал, которым снимается сама проба: ему нужна настоящая карта
    THREE.ShaderChunk.envmap_physical_pars_fragment = `#ifdef USE_ENVMAP
        uniform vec3 envCube[ 6 ];
        vec3 envCubeAt( const in vec3 d ) {
          vec3 w = d * d;
          return w.x * ( d.x > 0.0 ? envCube[ 0 ] : envCube[ 1 ] )
               + w.y * ( d.y > 0.0 ? envCube[ 2 ] : envCube[ 3 ] )
               + w.z * ( d.z > 0.0 ? envCube[ 4 ] : envCube[ 5 ] );
        }
      #endif
      ` + SRC.replace(IRR, `
        #ifdef ENV_PROBE_BAKE
          ${IRR}
        #else
          vec4 envMapColor = vec4( envCubeAt( worldNormal ), 1.0 );
        #endif`).replace(RAD, `
        vec4 envMapColor;
        #ifdef ENV_PROBE_BAKE
          envMapColor = textureCubeUV( envMap, reflectVec, roughness );
        #else
          if ( roughness < ${ROUGH.toFixed(2)} ) envMapColor = textureCubeUV( envMap, reflectVec, roughness );
          else envMapColor = vec4( envCubeAt( reflectVec ), 1.0 );
        #endif`);
    // Float32Array не копируется при клонировании uniform-ов материала — все материалы видят один массив
    THREE.ShaderLib.physical.uniforms.envCube = { value: CUBE };
    THREE.ShaderLib.standard.uniforms.envCube = { value: CUBE };
  } else if (!/[?&]noprobe\b/.test(location.search)) console.warn('EnvProbe: шейдер Three.js изменился — отражения считаются по-старому');

  /* ---------- съёмка шести цветов с карты окружения ---------- */
  // Шесть квадратиков в ряд, у каждого своя нормаль; белый матовый материал под светом одной только карты
  // окружения даёт ровно её размытый цвет в направлении нормали. Картинка 6×1 читается обратно.
  const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const pScene = new THREE.Scene(), pCam = new THREE.OrthographicCamera(0, 6, 1, 0, 0.1, 10);
  pCam.position.z = 5;
  const pMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  pMat.defines = { ENV_PROBE_BAKE: '' };
  {
    const P = [], N = [], I = [];
    DIRS.forEach((d, i) => {
      P.push(i, 0, 0, i + 1, 0, 0, i + 1, 1, 0, i, 1, 0);
      for (let k = 0; k < 4; k++) N.push(...d);
      I.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setIndex(I);
    const m = new THREE.Mesh(g, pMat); m.frustumCulled = false; pScene.add(m);
  }
  const rtF = new THREE.WebGLRenderTarget(6, 1, { type: THREE.FloatType, depthBuffer: false });
  const rt8 = new THREE.WebGLRenderTarget(6, 1, { depthBuffer: false });
  function shoot(rt, buf, k) {
    const prev = renderer.getRenderTarget();
    pMat.envMapIntensity = k;
    renderer.setRenderTarget(rt); renderer.render(pScene, pCam);
    renderer.readRenderTargetPixels(rt, 0, 0, 6, 1, buf);
    renderer.setRenderTarget(prev);
  }
  function bake(tex) {
    if (!ok || !tex) return null;
    let c = cache.get(tex);
    if (c) return c;
    c = new Float32Array(18);
    pMat.envMap = tex;
    const f = new Float32Array(24);
    shoot(rtF, f, 1);
    let good = false;
    for (let i = 0; i < 6; i++) for (let k = 0; k < 3; k++) { const v = f[i * 4 + k]; c[i * 3 + k] = v; if (v > 0 && Number.isFinite(v)) good = true; }
    if (!good) {                             // видеокарта не умеет рисовать в float-текстуру: 8 бит, яркость ÷ 4
      const b = new Uint8Array(24);
      shoot(rt8, b, 0.25);
      for (let i = 0; i < 6; i++) for (let k = 0; k < 3; k++) c[i * 3 + k] = b[i * 4 + k] / 255 * 4;
    }
    pMat.envMap = null;
    cache.set(tex, c);
    return c;
  }
  // перед отрисовкой сцены: её окружение — в общий uniform. Снимать пробу прямо здесь нельзя (мы уже внутри
  // renderer.render), поэтому незнакомая карта снимается сразу после кадра, а этот кадр идёт со старыми цветами.
  function use(tex) {
    if (!ok || tex === current) return;
    const c = tex ? cache.get(tex) : null;
    if (tex && !c) { queueMicrotask(() => bake(tex)); return; }
    current = tex;
    if (c) CUBE.set(c);
  }
  // сцена сама включает свою пробу перед каждой отрисовкой (в меню и в заезде окружение разное)
  function attach(scn) { scn.onBeforeRender = () => use(scn.environment); }

  bake(envTex);
  return { bake, use, attach, ROUGH, get ok() { return ok; }, get cube() { return CUBE; } };
})();
