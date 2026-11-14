// Главный цикл и старт игры
// Определяет: showLook, resize, Perf, SHADOW_SHARE, shadowShared, last, gameT, frame, frameBody, cheatCoins.
// Использует: save, CARS, browse (js/data.js); renderer, clamp, lerp (js/core.js); Breeze (js/breeze.js); showCam,
//   PODIUM_SPAN, viewShift, podiums, show, updatePodium (js/showroom.js); aimSun, scene (js/world.js); Sky
//   (js/sky.js); Weather (js/weather.js); world, getData (js/maps/registry.js); updateCoins3D, smoke, sparks,
//   updateSkids (js/effects.js); Wrecks (js/carfx.js); Sound (js/audio.js); cars, accum, FIXED, stepWorld
//   (js/physics.js); Traffic (js/traffic/traffic.js); Blobs (js/blobs.js); cams, state, paused, countdown, placeCam,
//   updateStreaks, startMatch (js/match.js); drawMinimap, updateHUD, $, setState, hideLoading, openMaps, addCoins,
//   keys, renderGarage (js/ui.js); Race (js/race.js); Capture (js/capture.js); Feel (js/feel.js); Stunts
//   (js/stunts.js).
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

/* ---------- счётчик производительности: клавиша ` (Ё) или ?fps в адресе ---------- */
// FPS — сколько кадров реально показано (браузер не даёт больше частоты экрана: на 60 Гц — максимум 60);
// «JS» — сколько миллисекунд занимает работа игры за кадр (физика + подготовка отрисовки): 1000 / JS — запас по FPS;
// «вызовы» — draw calls за кадр (включая тени и обе половины экрана).
const Perf = (() => {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:50%;top:6px;transform:translateX(-50%);z-index:50;padding:3px 9px;border-radius:6px;' +
    'background:rgba(0,0,0,.6);color:#9f9;font:12px/1.35 monospace;white-space:pre;pointer-events:none;display:none';
  document.body.appendChild(el);
  let on = /[?&]fps\b/.test(location.search), n = 0, acc = 0, jsAcc = 0, jsMax = 0, t0 = performance.now(), calls = 0, tris = 0;
  el.style.display = on ? 'block' : 'none';
  renderer.info.autoReset = false;                  // считаем вызовы за весь кадр, а не за последний render()
  return {
    toggle() { on = !on; el.style.display = on ? 'block' : 'none'; },
    begin() { renderer.info.reset(); return performance.now(); },
    end(start, now) {
      const js = performance.now() - start;
      n++; jsAcc += js; jsMax = Math.max(jsMax, js);
      calls += renderer.info.render.calls; tris += renderer.info.render.triangles;
      if (now - t0 < 500) return;
      if (on) el.textContent = `FPS ${Math.round(n * 1000 / (now - t0))}   JS ${(jsAcc / n).toFixed(1)} мс (макс ${jsMax.toFixed(1)})   ` +
        `вызовы ${Math.round(calls / n)}   треуг. ${Math.round(tris / n / 1000)}k`;
      n = jsAcc = jsMax = calls = tris = 0; t0 = now;
    },
  };
})();

const SHADOW_SHARE = 26;                 // м между игроками: ближе — одна карта теней на обе половины экрана
let shadowShared = false;
let last = performance.now(), gameT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const perfStart = Perf.begin();
  try { frameBody(now); } finally { Perf.end(perfStart, now); }
}
function frameBody(now) {
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
      Breeze.update(t);                    // ветер в кронах и тени облаков (js/breeze.js)
      updateCoins3D(gdt, t);
      Race.update(gdt, t);
      Capture.update(gdt, t);
      Stunts.update(gdt);
      smoke.update(gdt); sparks.update(gdt); updateSkids(); Wrecks.update(gdt);
      Sky.update(t);
      for (let p = 0; p < 2; p++) {
        if (p >= N) { Sound.update(p, null, false); continue; }
        placeCam(p, dt, false); updateStreaks(p); Weather.update(p, t); drawMinimap(p); Sound.update(p, cars[p], countdown < 3);
      }
      updateHUD();
    }
    renderer.setScissorTest(true);
    // Тени: карта 140 × 140 м вокруг машины, своя для каждой половины экрана. Когда игроки едут рядом, обе половины
    // видят одно и то же место — карта рисуется один раз, вокруг точки между машинами (≈ 0,45 мс видеокарты и сотня
    // вызовов отрисовки). Пороги разнесены, чтобы режим не мигал на границе.
    if (N === 2) {
      const d = Math.hypot(cars[0].x - cars[1].x, cars[0].z - cars[1].z, cars[0].y - cars[1].y);
      shadowShared = d < (shadowShared ? SHADOW_SHARE + 8 : SHADOW_SHARE);
    } else shadowShared = false;
    for (let p = 0; p < N; p++) {
      const c = cars[p];
      if (!shadowShared) aimSun(c.x, c.y, c.z);
      else if (p === 0) aimSun((c.x + cars[1].x) / 2, (c.y + cars[1].y) / 2, (c.z + cars[1].z) / 2);
      Traffic.cullView(cams[p], c.x, c.z);
      Blobs.view(c.x, c.z);                // пятна под машинами вместо теней (только «Минимум», js/blobs.js)
      if (world.cullView) world.cullView(cams[p].position.x, cams[p].position.z);
      renderer.shadowMap.needsUpdate = !shadowShared || p === 0;
      renderer.setViewport(p * VW, 0, VW, H);
      renderer.setScissor(p * VW, 0, VW, H);
      renderer.render(scene, cams[p]);
      Race.drawArrow(p, VW, H);
      Capture.drawArrow(p, VW, H);
    }
    renderer.setScissorTest(false);
    if (paused) for (let p = 0; p < 2; p++) Sound.update(p, null, false);
  } else {
    Breeze.off();
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
    // шоурум — всегда без подстройки карты (world.look ставит её в Sky.apply на время заезда)
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
    renderer.render(show, showCam);
  }
}

// старт
podiums[1].turn.rotation.y = Math.PI * 0.5;
updatePodium(0); updatePodium(1);
showCam.position.set(0, 5, 16);
setState('menu');
hideLoading();
// после смены качества графики (перезагрузка страницы) — обратно на экран выбора режима
try { if (sessionStorage.getItem('steel_duel_reopen') === 'maps') { sessionStorage.removeItem('steel_duel_reopen'); openMaps(); } } catch (e) { }
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
