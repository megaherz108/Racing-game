// Пятна-тени под машинами на качестве «Минимум» (QUAL.blobs), где тени от солнца выключены.
// Определяет: BLOB_R, BLOB_MAX, BLOB_DARK, BLOB_DARK_NIGHT, BLOB_LIFT, Blobs.
// Использует: QUAL, clamp, lerp (js/core.js); scene, NIGHT_U (js/world.js); glowTexture (js/sky.js); world
//   (js/maps/registry.js); cars (js/physics.js); Traffic (js/traffic/traffic.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

/* =====================================================================
   ПЯТНА ПОД МАШИНАМИ
   ===================================================================== */
// Все пятна — один InstancedMesh: мягкий круг (glowTexture), растянутый по размеру кузова и повёрнутый по курсу.
// Пятно не закрашивает, а затемняет то, что под ним: смешивание dst · (1 − src), где src — яркость текстуры,
// умноженная на цвет экземпляра (сила затемнения). Глубину не пишет, туман и тональную коррекцию не проходит.
// Заполняется перед отрисовкой каждой половины экрана (Blobs.view): машины игроков и трафик ближе BLOB_R.
const BLOB_R = 45;                       // м от игрока: дальше пятна трафика не рисуются
const BLOB_MAX = 64;
const BLOB_DARK = 0.6, BLOB_DARK_NIGHT = 0.4;   // сила затемнения днём и ночью (ночью свет не только сверху)
const BLOB_LIFT = 0.06;                  // м над дорогой (плюс polygonOffset) — без мерцания на асфальте

const Blobs = (() => {
  if (!QUAL.blobs) return { view() { } };
  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    map: glowTexture(64, 0.45, 0.75), transparent: true, depthWrite: false, fog: false, toneMapped: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.ZeroFactor, blendDst: THREE.OneMinusSrcColorFactor,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, BLOB_MAX);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.setColorAt(0, new THREE.Color());
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0; mesh.frustumCulled = false; mesh.matrixAutoUpdate = false;
  mesh.castShadow = mesh.receiveShadow = false;
  mesh.renderOrder = -1;                 // раньше прочих прозрачных (лужи, дым, дождь): пятно — часть дороги
  scene.add(mesh);

  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _c = new THREE.Color();
  const surf = (x, z, y) => world.surface ? world.surface(x, z, y) : world.ground(x, z);
  let n = 0, dark = BLOB_DARK;

  // одно пятно: машина в x, y, z (низ кузова), курс h, размеры L × W
  function put(x, y, z, h, L, W) {
    if (n >= BLOB_MAX) return;
    const hint = y + 0.5, g = surf(x, z, hint);
    if (!isFinite(g)) return;
    const air = y - g;                                     // высота над дорогой: пятно бледнеет и расплывается
    const a = clamp(1 - air / 4, 0, 1);
    if (a <= 0.02) return;
    // наклон по курсу — по высоте дороги под передом и задом (пандусы, мосты); на обрыве настила — без наклона
    const fx = Math.sin(h), fz = Math.cos(h), d = L * 0.4;
    const gf = surf(x + fx * d, z + fz * d, hint), gr = surf(x - fx * d, z - fz * d, hint);
    let pitch = 0;
    if (isFinite(gf) && isFinite(gr) && Math.abs(gf - gr) < d) pitch = -Math.atan((gf - gr) / (2 * d));
    const grow = 1 + (1 - a) * 0.35;
    _e.set(pitch, h, 0); _q.setFromEuler(_e);
    _m.compose(_p.set(x, g + BLOB_LIFT, z), _q, _s.set(W * 1.3 * grow, 1, L * 1.12 * grow));
    mesh.setMatrixAt(n, _m);
    _c.setScalar(dark * a).convertSRGBToLinear();            // на выходе шейдер переводит обратно в sRGB
    mesh.setColorAt(n, _c);
    n++;
  }

  return {
    mesh,
    // перед отрисовкой половины экрана игрока p (он в x, z)
    view(x, z) {
      n = 0; dark = lerp(BLOB_DARK, BLOB_DARK_NIGHT, NIGHT_U.value);
      for (const c of cars) put(c.x, c.y, c.z, c.h, c.L, c.W);
      const R2 = BLOB_R * BLOB_R;
      for (const tc of Traffic.list) {
        if (tc.dead || (tc.x - x) ** 2 + (tc.z - z) ** 2 > R2) continue;
        const e = tc.mat.elements;                            // как нарисована (а не где тело физики)
        put(e[12], e[13], e[14], tc.h, tc.L, tc.W);
      }
      mesh.count = n; mesh.visible = n > 0;
      if (n) { mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; }
    },
  };
})();
