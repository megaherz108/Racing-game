// Камеры и запуск заезда
// Определяет: cams, camYaw, camDist, camOff, camFov, camRoll, speedFrac, placeCam, STREAK_N, streaks, updateStreaks,
//   state, paused, countdown, matchMode, startMatch, endMatch.
// Использует: save, playMap, CARS, browse, TRAFFIC_LEVELS, COIN_MUL (js/data.js); lerp, rand, clamp (js/core.js);
//   smooth01, angLerp, UNIT_BOX, scene, dummy (js/world.js); world, getData, MAP_INFO, activateWorld
//   (js/maps/registry.js); clearSkids, smoke, sparks, resetCoins (js/effects.js); Sound (js/audio.js); cars, Car,
//   simTime, accum (js/physics.js); Traffic (js/traffic/traffic.js); showLoading, $, HUD, hideLoading, setState
//   (js/ui.js); Race (js/race.js); Capture (js/capture.js); Feel (js/feel.js); Stunts (js/stunts.js); resize
//   (js/main.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

/* =====================================================================
   CAMERAS / MATCH
   ===================================================================== */
const cams = [0, 1].map(p => {
  const c = new THREE.PerspectiveCamera(62, 1, 0.1, 1000);
  c.layers.enable(p === 0 ? 2 : 1);   // видим маркер соперника, свой — нет
  c.layers.enable(3 + p);             // свои арки гонки и штрихи скорости (CP_LAYER в race.js)
  return c;
});
// Угол обзора камеры сглаживается отдельно от машины: в заносе камера частично смотрит вдоль траектории.
// Ощущение скорости: на скорости камера чуть ближе и ниже, угол обзора шире, лёгкая вибрация и штрихи «ветра».
// Сглаживается смещение камеры относительно машины, а не её мировая позиция: раньше камера на скорости
// отставала на v/10 метров (на 170 км/ч — почти 5 м) и машина на экране «уплывала» вдаль, скрадывая скорость.
const camYaw = [0, 0], camDist = [0, 0], camOff = [new THREE.Vector3(), new THREE.Vector3()], camFov = [60, 60], camRoll = [0, 0];
const speedFrac = spd => smooth01((spd - 8) / 60);      // 0 — стоим … 1 — от ≈ 245 км/ч
function placeCam(p, dt, snap) {
  const c = cars[p], cam = cams[p];
  const spd = Math.hypot(c.vx, c.vz), sf = speedFrac(spd);
  let target = c.h;
  if (spd > 4 && c.vf > 0 && c.grounded) target = angLerp(c.h, Math.atan2(c.vx, c.vz), 0.4);
  camYaw[p] = snap ? target : angLerp(camYaw[p], target, 1 - Math.exp(-dt * 4.5));
  const fx = Math.sin(camYaw[p]), fz = Math.cos(camYaw[p]);
  const want = 4.4 + c.L * 0.5 - sf * 0.8;
  camDist[p] = snap ? want : lerp(camDist[p], want, 1 - Math.exp(-dt * 2));
  const full = camDist[p];
  let dist = full, hgt = 1.7 + c.H * 0.7 - sf * 0.3;
  let a = snap ? 1 : 1 - Math.exp(-dt * 10);
  // камера не уходит внутрь зданий и крон: подъезжает ближе и поднимается выше
  if (world.occludes) {
    for (let k = 1; k <= 6; k++) {
      const t = k / 6;
      if (world.occludes(c.x - fx * dist * t, c.y + 1 + (hgt - 1) * t, c.z - fz * dist * t)) {
        dist = Math.max(3.2, dist * (k - 1) / 6); hgt += (full - dist) * 0.35; a = Math.max(a, 0.35); break;
      }
    }
  }
  const off = camOff[p];
  if (snap) off.set(-fx * dist, 0, -fz * dist);
  else { off.x += (-fx * dist - off.x) * a; off.z += (-fz * dist - off.z) * a; }
  cam.position.x = c.x + off.x; cam.position.z = c.z + off.z;
  const ty = c.y + hgt;
  cam.position.y = snap ? ty : cam.position.y + (ty - cam.position.y) * (1 - Math.exp(-dt * 12));
  const gmin = world.ground(cam.position.x, cam.position.z) + 1.0;
  if (cam.position.y < gmin) cam.position.y = gmin;
  const sh = c.shake * c.shake * 0.35, t = performance.now() / 1000;
  // мелкая дрожь на большой скорости
  const vib = c.grounded ? sf * sf * 0.045 : 0, vx = Math.sin(t * 41) * Math.sin(t * 17) * vib, vy = Math.sin(t * 53) * Math.sin(t * 23) * vib;
  cam.lookAt(c.x + fx * 3 + rand(-sh, sh) + vx, c.y + 0.9 + c.H * 0.3 + rand(-sh, sh) + vy, c.z + fz * 3);
  // лёгкий наклон горизонта в повороте на скорости
  const roll = c.grounded ? clamp(-c.w * sf * 0.03, -0.035, 0.035) : 0;
  camRoll[p] = snap ? roll : lerp(camRoll[p], roll, Math.min(1, dt * 3));
  cam.rotateZ(camRoll[p]);
  // угол обзора: шире на скорости и на нитро, резко «сжимается» от удара (js/feel.js)
  camFov[p] = snap ? 60 + 20 * sf : lerp(camFov[p], 60 + 20 * sf, Math.min(1, dt * 3));
  const fov = camFov[p] + (snap ? 0 : Feel.fov(p));
  if (Math.abs(cam.fov - fov) > 0.02) { cam.fov = fov; cam.updateProjectionMatrix(); }
}

// «Ветер» на скорости: тонкие светлые штрихи неподвижны в мире, поэтому проносятся мимо камеры ровно со скоростью машины.
// У каждого игрока свои штрихи на слое 3 + p — их видит только его камера.
const STREAK_N = 70;
const streaks = [0, 1].map(p => {
  const mat = new THREE.MeshBasicMaterial({ color: 0xe8f4ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const m = new THREE.InstancedMesh(UNIT_BOX.clone().translate(0, -0.5, 0), mat, STREAK_N);
  m.frustumCulled = false; m.layers.set(3 + p); m.visible = false; scene.add(m);
  return { m, mat, pts: Array.from({ length: STREAK_N }, () => ({ x: 0, y: 0, z: 0, live: false })) };
});
function updateStreaks(p) {
  const S = streaks[p], c = cars[p], cam = cams[p], spd = Math.hypot(c.vx, c.vz);
  const k = Math.max(smooth01((spd - 28) / 40), Feel.boost(p) * smooth01((spd - 10) / 20));   // со ≈ 100 км/ч, на нитро — раньше
  S.m.visible = k > 0.01;
  if (!S.m.visible) { for (const s of S.pts) s.live = false; return; }
  S.mat.opacity = 0.32 * k * (1 + Feel.boost(p) * 0.6);
  const ux = c.vx / spd, uz = c.vz / spd, yaw = Math.atan2(ux, uz), len = 0.6 + spd * 0.05;
  const cx = cam.position.x, cy = cam.position.y, cz = cam.position.z;
  for (let i = 0; i < STREAK_N; i++) {
    const s = S.pts[i], along = (s.x - cx) * ux + (s.z - cz) * uz, side = (s.x - cx) * uz - (s.z - cz) * ux;
    if (!s.live || along < -3 || along > 95 || Math.abs(side) > 30) {
      // новый штрих впереди, в кольце вокруг оси взгляда (центр, где машина, — пустой)
      const ang = Math.random() * Math.PI * 2, r = rand(3.5, 12), at = s.live ? rand(55, 90) : rand(4, 90);
      const lat = Math.cos(ang) * r;
      s.x = cx + ux * at + uz * lat; s.z = cz + uz * at - ux * lat;
      s.y = Math.max(world.ground(s.x, s.z) + rand(0.3, 1.2), cy + Math.sin(ang) * r * 0.55);
      s.live = true;
    }
    dummy.position.set(s.x, s.y, s.z); dummy.rotation.set(0, yaw, 0); dummy.scale.set(0.035, 0.035, len); dummy.updateMatrix();
    S.m.setMatrixAt(i, dummy.matrix);
  }
  S.m.instanceMatrix.needsUpdate = true;
}

let state = 'menu', paused = false, countdown = 0, matchMode = 'free';
// mode: 'free' — свободная езда, 'race' — гонка по чекпоинтам (js/race.js). mapId — карта, выбранная на экране режима
// (playMap() в js/data.js); скрытые карты — только для отладки.
function startMatch(mode = save.mode, mapId = playMap(mode)) {
  if (mode === 'race' && !getData(mapId).nodes) mode = 'free';     // для гонки нужен дорожный граф (есть только у города)
  if (mode === 'capture' && !getData(mapId).C?.zones) mode = 'free'; // для захвата нужны зоны (есть только у Побережья)
  matchMode = mode;
  showLoading(mode === 'race' ? 'Подготовка гонки…' : mode === 'capture' ? 'Подготовка захвата точек…' : 'Загрузка карты «' + MAP_INFO[mapId].name + '»…');
  // даём браузеру отрисовать экран загрузки перед тяжёлой генерацией
  setTimeout(() => {
    for (const c of cars) c.dispose();
    Traffic.clear();
    activateWorld(mapId);
    const solo = mode === 'solo';
    cars = solo ? [new Car(CARS[browse[0]], 0)] : [new Car(CARS[browse[0]], 0), new Car(CARS[browse[1]], 1)];
    cars.forEach((c, p) => c.fullReset(...world.spawns[p]));
    // городской трафик: число машин из настройки на экране выбора карты
    Traffic.start(world, (TRAFFIC_LEVELS.find(l => l[0] === save.traffic) || TRAFFIC_LEVELS[2])[2]);
    if (world.reset) world.reset();
    clearSkids(); smoke.clear(); sparks.clear();
    resetCoins(Math.round(world.coinCount * (COIN_MUL[mode] ?? 1)));
    Race.start(mode === 'race');
    Capture.start(mode === 'capture');
    Stunts.reset(); Feel.reset();
    simTime = 0; accum = 0; countdown = 3.2;
    $('hud').classList.toggle('solo', solo);
    Sound.solo(solo);
    cars.forEach((c, p) => Sound.setCar(p, c.def));
    resize();                      // один игрок — камера на весь экран
    for (let p = 0; p < cars.length; p++) {
      HUD[p].nm.textContent = cars[p].def.name;
      HUD[p].feed.innerHTML = '';
      placeCam(p, 0, true);
    }
    $('hudhint').textContent = mode === 'race'
      ? 'Гонка: проезжайте арки по порядку — стрелка вверху показывает на следующую · нитро: левый Shift (P1) и / (P2) · R / Enter — на дорогу · Esc — пауза'
      : mode === 'capture'
      ? 'Захват точек: стойте в светящемся круге один — очко в секунду, вдвоём — никому · стрелка показывает на точку · нитро: левый Shift (P1) и / (P2) · R / Enter — на дорогу · Esc — пауза'
      : solo ? 'Одиночная езда: WASD или стрелки · Пробел / правый Shift — ручник · левый Shift или / — нитро · R / Enter — вернуть на дорогу · Esc — пауза'
      : 'Свободная езда: собирайте монеты · нитро: левый Shift (P1) и / (P2) · R / Enter — вернуть на дорогу · Esc — пауза';
    $('hudhint').classList.remove('hidden');
    $('hudhint').style.animation = 'none'; void $('hudhint').offsetWidth; $('hudhint').style.animation = '';
    paused = false;
    hideLoading();
    setState('play');
  }, 40);
}
function endMatch(to) {
  Race.stop();
  Capture.stop();
  for (const c of cars) c.dispose();
  Traffic.clear();
  cars = [];
  smoke.clear(); sparks.clear();
  setState(to);
}

