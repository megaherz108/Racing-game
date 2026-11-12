// Главный цикл и старт игры
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

/* =====================================================================
   LOOP
   ===================================================================== */
const showLook = new THREE.Vector3(0, 0.7, 0);
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  const vw = cars.length === 1 ? w : w / 2;        // одиночная езда — весь экран, вдвоём — по половине
  for (const c of cams) { c.aspect = vw / h; c.updateProjectionMatrix(); }
  showCam.aspect = w / h; showCam.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

let last = performance.now(), gameT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = clamp((now - last) / 1000, 0, 0.05); last = now;
  const W = window.innerWidth, H = window.innerHeight;

  const N = cars.length, VW = N === 1 ? W : W / 2;   // ширина экрана одного игрока
  if (state === 'play' && N > 0) {
    if (!paused) {
      // время игры: стоп-кадр при ударе и замедление (js/feel.js); камера и звук живут в реальном времени
      const gdt = dt * Feel.step(dt);
      if (countdown > -1) countdown -= dt;
      accum += gdt;
      let n = 0;
      while (accum >= FIXED && n < 10) { stepWorld(FIXED); accum -= FIXED; n++; }
      if (n >= 10) accum = 0;
      for (const c of cars) c.visual(gdt);
      Traffic.visual();
      gameT += gdt;
      const t = gameT;
      if (world.update) world.update(gdt, t);
      updateCoins3D(gdt, t);
      Race.update(gdt, t);
      Stunts.update(gdt);
      smoke.update(gdt); sparks.update(gdt);
      Sky.update();
      for (let p = 0; p < 2; p++) {
        if (p >= N) { Sound.update(p, null, false); continue; }
        placeCam(p, dt, false); updateStreaks(p); drawMinimap(p); Sound.update(p, cars[p], countdown < 3);
      }
      updateHUD();
    }
    renderer.setScissorTest(true);
    for (let p = 0; p < N; p++) {
      const c = cars[p];
      aimSun(c.x, c.y, c.z);
      Traffic.cullView(c.x, c.z);
      renderer.shadowMap.needsUpdate = true;
      renderer.setViewport(p * VW, 0, VW, H);
      renderer.setScissor(p * VW, 0, VW, H);
      renderer.render(scene, cams[p]);
      Race.drawArrow(p, VW, H);
    }
    renderer.setScissorTest(false);
    if (paused) for (let p = 0; p < 2; p++) Sound.update(p, null, false);
  } else {
    for (let p = 0; p < 2; p++) Sound.update(p, null, false);
    // шоурум: подиумы вписываются в свободную от панелей область экрана
    let freeL = 0, freeR = W;
    if (state === 'menu') freeL = Math.min(W * 0.6, $('menu').querySelector('.panel').offsetWidth * 0.85);
    else if (state === 'garage') { const cw = $('card0').offsetWidth || 340; freeL = cw + 40; freeR = W - cw - 40; }
    const freeW = Math.max(W * 0.3, freeR - freeL);
    const tanH = Math.tan(THREE.MathUtils.degToRad(showCam.fov / 2)) * (W / H);
    const dist = clamp(PODIUM_SPAN / ((freeW / W) * tanH), 11, 30);
    if (!window.__game.debugCam) {
      showLook.lerp(new THREE.Vector3(0, 0.7, 0), Math.min(1, dt * 4));
      showCam.position.lerp(new THREE.Vector3(0, dist * 0.3, dist), Math.min(1, dt * 4));
      showCam.lookAt(showLook);
      viewShift = lerp(viewShift, W / 2 - (freeL + freeR) / 2, Math.min(1, dt * 5));
      showCam.setViewOffset(W, H, viewShift, 0, W, H);
    }
    for (const pod of podiums) {
      pod.turn.rotation.y += dt * 0.45;
      const s = pod.turn.scale.x; pod.turn.scale.setScalar(s + (1 - s) * Math.min(1, dt * 8));
    }
    renderer.setViewport(0, 0, W, H);
    renderer.shadowMap.needsUpdate = true;
    renderer.render(show, showCam);
  }
}

// старт
podiums[1].turn.rotation.y = Math.PI * 0.5;
updatePodium(0); updatePodium(1);
showCam.position.set(0, 5, 16);
setState('menu');
hideLoading();
requestAnimationFrame(frame);

// чит-код в консоли: __game.addCoins(1000) — обоим игрокам; __game.addCoins(0, 500) — только игроку 1 (0/1)
function cheatCoins(...args) {
  const [players, n] = args.length >= 2 ? [[+args[0]], +args[1]] : [[0, 1], +args[0]];
  if (!Number.isFinite(n) || players.some(p => p !== 0 && p !== 1)) return console.warn('__game.addCoins(n) или __game.addCoins(игрок 0|1, n)');
  for (const p of players) addCoins(p, Math.max(-save.players[p].coins, Math.trunc(n)));   // минус можно, но не ниже нуля
  return save.players.map(pl => pl.coins);
}
window.__game = { CARS, cars: () => cars, save: () => save, addCoins: cheatCoins, renderer, keys, show, showCam, scene, cams, podiums, browse,
  renderGarage, startMatch, world: () => world, getData, debugCam: false };
