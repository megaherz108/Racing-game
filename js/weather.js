// Погода: дождь (капли, мокрый асфальт с лужами и бликами, брызги из-под колёс — js/effects.js).
// Включается на экране выбора режима рядом со временем суток (save.rain); пасмурное небо — js/sky.js.
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.

/* =====================================================================
   ДОЖДЬ И МОКРЫЕ ПОВЕРХНОСТИ
   ===================================================================== */
const Weather = (() => {
  const WET_U = { value: 0 };               // 0 — сухо, 1 — всё мокрое (общий uniform всех «мокрых» материалов)
  let raining = false;

  /* ---------- мокрые материалы ---------- */
  // Асфальт, тротуары и настилы в дождь темнеют и становятся гладкими (отражают небо и ловят блики солнца и фар),
  // а в низинах шума — лужи: почти зеркальные и ещё темнее. k — насколько поверхность мокнет (трава — слабее).
  // В сухую погоду шейдер пропускает этот кусок целиком (ветвление по uniform — бесплатное).
  function wet(mat, k = 1) {
    const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey;
    mat.onBeforeCompile = (sh, r) => {
      if (prev && prev !== THREE.Material.prototype.onBeforeCompile) prev(sh, r);
      sh.uniforms.uWet = WET_U; sh.uniforms.uPuddle = { value: NOISE.tex };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWetPos;')
        .replace('#include <project_vertex>', `#include <project_vertex>
          vec4 wetP = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            wetP = instanceMatrix * wetP;
          #endif
          vWetPos = (modelMatrix * wetP).xyz;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWetPos;\nuniform float uWet;\nuniform sampler2D uPuddle;')
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          if (uWet > 0.0) {
            float pd = texture2D(uPuddle, vWetPos.xz * 0.021).r;
            float puddle = smoothstep(0.6, 0.7, pd) * ${(+k).toFixed(2)};
            float wk = uWet * ${(+k).toFixed(2)};
            roughnessFactor = mix(roughnessFactor, mix(0.34, 0.035, puddle), wk);
            diffuseColor.rgb *= mix(1.0, mix(0.6, 0.42, puddle), wk);
          }`);
    };
    const key = 'wet' + k;
    mat.customProgramCacheKey = () => key + (prevKey && prevKey !== THREE.Material.prototype.customProgramCacheKey ? prevKey.call(mat) : '');
    mat.needsUpdate = true;
    return mat;
  }

  /* ---------- капли ---------- */
  // Как «ветер» в updateStreaks (js/match.js): тонкие штрихи висят в мире, и машина проносится сквозь них.
  // Но двигает их видеокарта: каждая капля падает в вершинном шейдере и «заворачивается» в коробку вокруг камеры
  // (mod), поэтому JS не тратит на дождь ничего, кроме пары uniform-ов на кадр.
  // Штрих вытянут вдоль скорости капли относительно машины: на скорости дождь летит навстречу.
  const N = QUAL.rain;
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  {
    const off = new Float32Array(N * 3), sp = new Float32Array(N), rng = mulberry32(5);
    for (let i = 0; i < N; i++) { off[i * 3] = rng(); off[i * 3 + 1] = rng(); off[i * 3 + 2] = rng(); sp[i] = 0.8 + rng() * 0.4; }
    geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 3));
    geo.setAttribute('aSp', new THREE.InstancedBufferAttribute(sp, 1));
    geo.instanceCount = N;
  }
  const BOX = new THREE.Vector3(44, 22, 44), FALL = 11;
  const drops = [0, 1].map(p => {
    const u = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uCenter: { value: new THREE.Vector3() }, uRel: { value: new THREE.Vector3(0, -1, 0) }, uBox: { value: BOX },
      uTime: { value: 0 }, uFall: { value: FALL }, uLen: { value: 0.6 }, uCol: { value: new THREE.Color(0xc6d2e0) }, uA: { value: 0.32 },
    }]);
    const mat = new THREE.ShaderMaterial({
      uniforms: u, transparent: true, depthWrite: false, fog: true,
      vertexShader: `
        attribute vec3 aOff; attribute float aSp;
        uniform vec3 uCenter, uRel, uBox; uniform float uTime, uFall, uLen;
        varying float vA;
        #include <fog_pars_vertex>
        void main() {
          vec3 p = aOff * uBox - vec3(0.0, uTime * uFall * aSp, 0.0);
          vec3 loc = mod(p - uCenter + uBox * 0.5, uBox) - uBox * 0.5;
          p = uCenter + loc;
          vec3 dir = normalize(uRel);
          vec3 side = normalize(cross(dir, normalize(cameraPosition - p)));
          vec3 wp = p - dir * (1.0 - position.y) * uLen * aSp + side * position.x * 0.03;
          vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          // края коробки и капли вплотную к камере — прозрачные: ни «выскакивания», ни полос через весь экран
          vec3 e = abs(loc) / (uBox * 0.5);
          vA = position.y * (1.0 - smoothstep(0.75, 1.0, max(max(e.x, e.y), e.z))) * smoothstep(1.2, 3.0, -mvPosition.z);
          #include <fog_vertex>
        }`,
      fragmentShader: `
        uniform vec3 uCol; uniform float uA;
        varying float vA;
        #include <fog_pars_fragment>
        void main() {
          gl_FragColor = vec4(uCol, uA * vA);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false; m.layers.set(3 + p); m.visible = false; m.renderOrder = 4;
    scene.add(m);
    return { m, u };
  });

  const _f = new THREE.Vector3();
  return {
    wet, wetUniform: WET_U,
    get raining() { return raining; },
    // включить/выключить дождь (из Sky.apply перед заездом)
    apply(on) {
      raining = !!on; WET_U.value = raining ? 1 : 0;
      for (const d of drops) d.m.visible = false;
    },
    // каждый кадр для игрока p: коробка капель — вокруг камеры и чуть впереди, направление — относительно машины
    update(p, t) {
      const d = drops[p];
      d.m.visible = raining;
      if (!raining) return;
      const c = cars[p], cam = cams[p];
      cam.getWorldDirection(_f);
      d.u.uCenter.value.copy(cam.position).addScaledVector(_f, 14);
      d.u.uTime.value = t;
      // скорость капли относительно машины (машину учитываем не полностью — иначе на скорости дождь летит горизонтально)
      const rel = d.u.uRel.value.set(-c.vx * 0.45 + 1.2, -FALL, -c.vz * 0.45);
      d.u.uLen.value = clamp(rel.length() * 0.05, 0.55, 2.2);
      // ночью капли видны только в свете фар и фонарей — темнее; днём — серебристые
      d.u.uA.value = 0.42 - Sky.night * 0.15;
    },
  };
})();
