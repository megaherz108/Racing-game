// Стенд для замеров времени видеокарты. Не часть игры: подгружается в страницу из консоли браузера —
//   (0, eval)(await (await fetch('tools/bench.js')).text())
// Кадры идут вручную (frameBody), а не через requestAnimationFrame, поэтому работает и при скрытой вкладке.
// __setup({tod, rain, traffic, seconds, px}) — заезд с фиксированным Math.random, машины разгоняются и встают на паузу.
// __bench(label, opts) — медиана времени видеокарты на кадр (EXT_disjoint_timer_query_webgl2), вызовы, треугольники.
//   opts.stock — тень на каждую половину экрана (как до общей карты теней).
// __ab(имяА, включитьА, имяБ, включитьБ) — сравнение двух вариантов с чередованием: шум видеокарты вычитается.
// __sample([[x0, y0, x1, y1], …]) — средний цвет областей кадра (доли экрана): сверка картинки до и после правки.
(() => {
  const tick = () => new Promise(res => { const ch = new MessageChannel(); ch.port1.onmessage = () => res(); ch.port2.postMessage(0); });
  window.__tick = tick;
  window.__setup = async function ({ tod = 'day', rain = false, traffic = 'high', seconds = 8, gas = 3.5, mode = 'free', px = 1.2 } = {}) {
    let g = 0; while (!window.__game && g++ < 40000) await tick();
    let s = 12345; Math.random = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    save.traffic = traffic; save.tod = tod; save.rain = rain;
    __game.startMatch(mode);
    let n = 0; while (state !== 'play' && n++ < 400000) await tick();
    renderer.setPixelRatio(px); resize();
    let now = performance.now(); last = now;
    keys.add('KeyW'); keys.add('ArrowUp');
    const N = Math.round(seconds * 60), G = Math.round((3.2 + gas) * 60);
    for (let i = 0; i < N; i++) { now += 1000 / 60; if (i === G) { keys.delete('KeyW'); keys.delete('ArrowUp'); } frameBody(now); if (i % 8 === 0) await tick(); }
    keys.delete('KeyW'); keys.delete('ArrowUp');
    paused = true;
    return { pos: cars.map(c => [Math.round(c.x), Math.round(c.y), Math.round(c.z)]), px: [renderer.domElement.width, renderer.domElement.height], traffic: Traffic.list.filter(t => !t.dead).length };
  };
  window.__frame = function (opts = {}) {
    const W = innerWidth, H = innerHeight, N = cars.length, VW = N === 1 ? W : W / 2;
    if (opts.stock) {                       // как в исходном цикле: тень на каждую половину
      renderer.setScissorTest(true);
      for (let p = 0; p < N; p++) {
        const c = cars[p];
        aimSun(c.x, c.y, c.z); Traffic.cullView(cams[p], c.x, c.z); if (world.cullView) world.cullView(cams[p].position.x, cams[p].position.z);
        renderer.shadowMap.needsUpdate = true;
        renderer.setViewport(p * VW, 0, VW, H); renderer.setScissor(p * VW, 0, VW, H);
        renderer.render(scene, cams[p]);
      }
      renderer.setScissorTest(false);
    } else { const was = paused; paused = true; frameBody(performance.now()); paused = was; }
  };
  // A/B с частым чередованием: шум видеокарты (режимы питания, фоновые программы) ложится на оба варианта поровну.
  // setA/setB переключают вариант; на каждом круге — по n кадров каждого. Возвращает медианы и разницу.
  window.__ab = async function (nameA, setA, nameB, setB, { rounds = 14, n = 6, warm = 3, opts = {} } = {}) {
    const A = [], B = [];
    for (let r = 0; r < rounds; r++) {
      const first = r % 2 === 0;
      for (const isA of first ? [true, false] : [false, true]) {
        (isA ? setA : setB)();
        const g = await window.__bench('', { ...opts, n, warm: r === 0 ? 25 : warm, raw: true });
        (isA ? A : B).push(...g);
      }
    }
    const med = a => { a.sort((x, y) => x - y); return a[a.length >> 1]; };
    const a = med(A), b = med(B);
    return `${nameA}: ${a.toFixed(2)} мс · ${nameB}: ${b.toFixed(2)} мс · разница ${(b - a).toFixed(2)} мс (${A.length}+${B.length} кадров)`;
  };
  window.__bench = async function (label, opts = {}) {
    const gl = renderer.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const N = opts.n || 30, warm = opts.warm ?? 12;
    const gpu = []; let calls = 0, tris = 0;
    renderer.info.autoReset = false;
    for (let i = 0; i < N + warm; i++) {
      await tick();
      const rec = i >= warm; let q = null;
      if (rec) { q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); }
      renderer.info.reset();
      window.__frame(opts);
      calls = renderer.info.render.calls; tris = renderer.info.render.triangles;
      if (rec) gl.endQuery(ext.TIME_ELAPSED_EXT);
      gl.flush();
      if (q) { const t0 = performance.now(); while (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE) && performance.now() - t0 < 400) await tick();
        if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) gpu.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6); gl.deleteQuery(q); }
    }
    if (opts.raw) return gpu;
    gpu.sort((a, b) => a - b);
    return `${label}: GPU ${gpu.length ? gpu[gpu.length >> 1].toFixed(2) : '?'} мс (мин ${gpu.length ? gpu[0].toFixed(2) : '?'}), вызовов ${calls}, треуг. ${Math.round(tris / 1000)}k, n=${gpu.length}`;
  };
  // средний цвет прямоугольных областей кадра (доли экрана), сразу после отрисовки
  window.__sample = function (rects) {
    const gl = renderer.getContext(), W = renderer.domElement.width, H = renderer.domElement.height;
    window.__frame();
    return rects.map(([x0, y0, x1, y1]) => {
      const w = Math.max(1, Math.round((x1 - x0) * W)), h = Math.max(1, Math.round((y1 - y0) * H)), buf = new Uint8Array(w * h * 4);
      gl.readPixels(Math.round(x0 * W), Math.round((1 - y1) * H), w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      const s = [0, 0, 0]; for (let i = 0; i < buf.length; i += 4) { s[0] += buf[i]; s[1] += buf[i + 1]; s[2] += buf[i + 2]; }
      return s.map(v => +(v / (w * h)).toFixed(1));
    });
  };
})();
