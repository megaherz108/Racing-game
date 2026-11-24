// Свободный полёт камеры для отладки карт (одиночная езда): клавиша F, WASD по направлению взгляда, мышь — поворот.
// Машина стоит на ручнике, мир живёт дальше. Координаты и направление взгляда — во второй строке счётчика FPS (Ё).
// Определяет: Fly.
// Использует: renderer, clamp (js/core.js); cars (js/physics.js); cams, state, streaks, placeCam (js/match.js); $,
//   toast, keys (js/ui.js); Perf (js/main.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

/* =====================================================================
   FLY CAMERA
   ===================================================================== */
// Направление взгляда — как курс машины: yaw = 0 смотрит вдоль +Z, yaw = 90° — вдоль +X; pitch > 0 — вверх.
const Fly = (() => {
  const HOLD = { up: false, down: false, left: false, right: false, hb: true, nitro: false };   // машина на ручнике
  const LOOK = 0.0022, TURN = 1.6;          // мышь — рад на пиксель, стрелки — рад/с
  let on = false, yaw = 0, pitch = 0, base = 20, hud = true;
  const vel = new THREE.Vector3(), fwd = new THREE.Vector3(), side = new THREE.Vector3(), want = new THREE.Vector3();

  const cam = () => cams[0];
  function applyRot() {
    const c = cam();
    c.rotation.set(pitch, yaw + Math.PI, 0, 'YXZ');     // камера Three.js смотрит вдоль −Z
  }
  function showHud(v) { hud = v; $('hud').style.visibility = v ? '' : 'hidden'; }

  // мышь: клик по экрану захватывает курсор (Esc отпускает)
  renderer.domElement.addEventListener('click', () => {
    if (on && document.pointerLockElement !== renderer.domElement) renderer.domElement.requestPointerLock?.();
  });
  addEventListener('mousemove', e => {
    if (!on || document.pointerLockElement !== renderer.domElement) return;
    yaw -= e.movementX * LOOK;
    pitch = clamp(pitch - e.movementY * LOOK, -1.55, 1.55);
  });
  addEventListener('wheel', e => {                     // колесо — базовая скорость (2…300 м/с)
    if (!on) return;
    base = clamp(base * (e.deltaY < 0 ? 1.25 : 0.8), 2, 300);
    toast(`Скорость полёта: ${Math.round(base)} м/с`);
  }, { passive: true });

  return {
    get on() { return on; },
    get speed() { return base; },
    input: () => HOLD,
    available: () => state === 'play' && cars.length === 1,
    start() {
      if (on || !this.available()) return;
      on = true;
      const c = cam(), d = c.getWorldDirection(fwd);
      yaw = Math.atan2(d.x, d.z); pitch = Math.asin(clamp(d.y, -1, 1));
      vel.set(0, 0, 0);
      c.fov = 70; c.updateProjectionMatrix();
      applyRot();
      streaks[0].m.visible = false;
      Perf.show();
      toast('Полёт: WASD, мышь (клик) или стрелки, Space/E — вверх, C/Q — вниз, Shift — быстрее, колесо — скорость, H — HUD, F — выход');
    },
    stop() {
      if (!on) return;
      on = false;
      if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
      showHud(true);
      if (cars[0]) placeCam(0, 0, true);
    },
    toggle() { on ? this.stop() : this.start(); },
    toggleHud() { if (on) showHud(!hud); },
    // поставить камеру в точку: __game.flyTo(x, y, z, курс°, наклон°) — те же числа, что в строке счётчика
    to(x, y, z, yawDeg = 0, pitchDeg = 0) {
      if (!on) this.start();
      if (!on) return false;
      cam().position.set(x, y, z);
      yaw = THREE.MathUtils.degToRad(yawDeg); pitch = clamp(THREE.MathUtils.degToRad(pitchDeg), -1.55, 1.55);
      vel.set(0, 0, 0); applyRot();
      return true;
    },
    update(dt) {
      if (keys.has('ArrowLeft')) yaw += TURN * dt;
      if (keys.has('ArrowRight')) yaw -= TURN * dt;
      if (keys.has('ArrowUp')) pitch = Math.min(1.55, pitch + TURN * dt);
      if (keys.has('ArrowDown')) pitch = Math.max(-1.55, pitch - TURN * dt);
      const cp = Math.cos(pitch);
      fwd.set(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp);   // W/S — вдоль взгляда, с наклоном
      side.set(-Math.cos(yaw), 0, Math.sin(yaw));                         // D — вправо
      want.set(0, 0, 0);
      if (keys.has('KeyW')) want.add(fwd);
      if (keys.has('KeyS')) want.sub(fwd);
      if (keys.has('KeyD')) want.add(side);
      if (keys.has('KeyA')) want.sub(side);
      if (keys.has('Space') || keys.has('KeyE')) want.y += 1;
      if (keys.has('KeyC') || keys.has('KeyQ')) want.y -= 1;
      if (want.lengthSq() > 0) want.normalize().multiplyScalar(base * (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 4 : 1));
      vel.lerp(want, 1 - Math.exp(-dt * 8));                              // плавный разгон и остановка
      const c = cam();
      c.position.addScaledVector(vel, dt);
      applyRot();
    },
  };
})();
