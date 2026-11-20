// Витрина моделей деревьев «Ситжеса» (этап 4б.3): все формы sitgesTreeKit() в ряд на свободном месте карты, днём,
// рядом машина для масштаба; кадры — общий план, две половины ряда ближе, вид сверху-сбоку на кроны.
// Не часть игры (для tools/cdp.js):
//   node tools/cdp.js --inject tools/sitges/trees-show.js --eval "await __treesShow()" --dir tools/sitges/raw/trees-show
// __treesShow({ w, h, at: [x, z] }) → { png, tris, gaps, at } — tris: треугольники формы (ствол + крона); gaps: формы,
// у которых верх ствола ниже низа кроны, и при каких r / h (пусто = ок); at — место ряда
// (без at ищется само: полоса 190 × 40 м без домов и воды, ряд вдоль x).
(() => {
  // размеры для витрины — типичные по фото 4б.1: [форма, h, r]
  const SIZES = [['pine1', 14, 6], ['pine2', 12, 5.5], ['aleppo1', 12, 4], ['aleppo2', 15, 3.5], ['plane1', 12, 5],
    ['plane2', 10, 4.5], ['celtis1', 9, 3.5], ['celtis2', 5, 1.8], ['feather', 7, 3], ['canary', 12, 4], ['date', 12, 3],
    ['washington', 13, 2.5], ['cypress1', 10, 1.3], ['cypress2', 8, 1.6], ['orange1', 4, 2], ['orange2', 3.5, 1.4],
    ['garden1', 5, 3], ['garden2', 4.5, 2.5], ['tamarisk1', 5, 3], ['tamarisk2', 5, 3.5]];

  // свободная полоса: сетка 5 м, занято — рамки домов + 4 м и вода
  function findSpot(D, len, wid) {
    const C = D.C, S = 5, bx = world.boundsX || world.bounds, bz = world.boundsZ || world.bounds;
    const nx = Math.ceil(2 * bx / S), nz = Math.ceil(2 * bz / S), busy = new Uint8Array(nx * nz);
    for (const h of C.houses) {
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (const [x, z] of h.rings[0]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      for (let i = Math.max(0, Math.floor((x0 - 4 + bx) / S)); i <= Math.min(nx - 1, Math.floor((x1 + 4 + bx) / S)); i++)
        for (let j = Math.max(0, Math.floor((z0 - 4 + bz) / S)); j <= Math.min(nz - 1, Math.floor((z1 + 4 + bz) / S)); j++) busy[j * nx + i] = 1;
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = i * S - bx + S / 2, z = j * S - bz + S / 2;
      if (D.ground(x, z) < waterLevel(x, z) + 0.4) busy[j * nx + i] = 1;
    }
    const L = Math.ceil(len / S), W = Math.ceil(wid / S);
    let best = null;
    for (let j = 2; j < nz - W - 2; j++) for (let i = 2; i < nx - L - 2; i++) {
      let ok = true;
      for (let b = 0; b < W && ok; b++) for (let a = 0; a < L; a++) if (busy[(j + b) * nx + i + a]) { ok = false; break; }
      if (!ok) continue;
      // самая ровная
      const x0 = i * S - bx, z0 = j * S - bz + wid / 2;
      let lo = 1e9, hi = -1e9;
      for (let a = 0; a <= len; a += 10) { const y = D.ground(x0 + a, z0); lo = Math.min(lo, y); hi = Math.max(hi, y); }
      if (!best || hi - lo < best.d) best = { x: x0, z: z0, d: hi - lo };
    }
    return best && [best.x, best.z];
  }

  window.__treesShow = async function ({ w = 1600, h = 900, at } = {}) {
    const D = getData('sitges'), Wd = getWorld('sitges');
    activateWorld('sitges');
    const kit = sitgesTreeKit(), g = D.ground;
    const len = SIZES.reduce((s, [, , r]) => s + 2 * r + 2.5, 0);
    const [x0, z0] = at || findSpot(D, len + 20, 40);
    const grp = new THREE.Group(), mT = new THREE.Matrix4(), mC = new THREE.Matrix4(), col = new THREE.Color(), tris = {};
    let x = x0 + 12;
    SIZES.forEach(([id, hh, r], i) => {
      const f = kit.forms[id];
      x += r + 1.2;
      const y = g(x, z0) - 0.05;
      sitgesTreeMats(f, x, y, z0, hh, r, 0.6 + i * 0.9, mT, mC);
      const t = new THREE.InstancedMesh(f.trunk, kit.mats.bark, 1), c = new THREE.InstancedMesh(f.crown, f.mat, 1);
      t.setMatrixAt(0, mT); c.setMatrixAt(0, mC);
      c.setColorAt(0, col.setHSL(0.25, 0.25, 0.92 + (i % 3) * 0.04));   // оттенок экземпляра — около белого
      t.setColorAt(0, col.setRGB(1, 1, 1));
      c.customDepthMaterial = f.mat.userData.swayDepth;
      for (const m of [t, c]) { m.castShadow = m.receiveShadow = true; m.frustumCulled = false; grp.add(m); }
      tris[id] = f.tris.trunk + f.tris.crown;
      x += r + 1.3;
    });
    // машина для масштаба — в начале ряда
    const car = buildCarModel(CARS[0], 0xc03030).root;
    const xc = x0 + 75; car.position.set(xc, g(xc, z0 + 7), z0 + 7); car.rotation.y = 1.2;
    grp.add(car); scene.add(grp);

    const cam = new THREE.PerspectiveCamera(50, w / h, 0.3, 3200), png = {};
    const prev = new THREE.Vector2(); renderer.getSize(prev);
    const pr = renderer.getPixelRatio();
    renderer.setPixelRatio(1); renderer.setSize(w, h, false);
    const xm = (x0 + x) / 2, X = k => x0 + (x - x0) * k;
    const shot = (name, cx, cy, cz, tx, ty, tz) => {
      cam.position.set(cx, g(cx, cz) + cy, cz); cam.lookAt(tx, g(tx, tz) + ty, tz); cam.updateMatrixWorld();
      aimSun(tx, g(tx, tz), tz);
      if (Wd.cullView) Wd.cullView(cx, cz);
      renderer.shadowMap.needsUpdate = true; renderer.setScissorTest(false); renderer.setViewport(0, 0, w, h);
      renderer.render(scene, cam);
      png[name] = renderer.domElement.toDataURL('image/jpeg', 0.88);
    };
    shot('trees-all', xm, 30, z0 + 130, xm, 5, z0);
    shot('trees-1', X(0.2), 3, z0 + 36, X(0.2), 5, z0);
    shot('trees-2', X(0.5), 3, z0 + 30, X(0.5), 5, z0);
    shot('trees-3', X(0.8), 2.5, z0 + 24, X(0.8), 3.5, z0);
    shot('trees-top', xm, 45, z0 - 55, xm, 4, z0 + 5);
    renderer.setPixelRatio(pr); renderer.setSize(prev.x, prev.y, false);
    scene.remove(grp);
    // верх ствола не ниже низа кроны при r / h от 0,08 до 0,8 (иначе крона висит над стволом)
    const gaps = {};
    for (const f of Object.values(kit.forms)) {
      const yT = f.trunk.boundingBox ? f.trunk.boundingBox.max.y : (f.trunk.computeBoundingBox(), f.trunk.boundingBox.max.y);
      if (!f.crown.boundingBox) f.crown.computeBoundingBox();
      const c0 = f.crown.boundingBox.min.y;
      for (let k = 0.08; k <= 0.8; k += 0.02) {
        const d = Math.min(f.dmax, Math.max(f.dmin, f.cd * k));
        if (yT < 1 + c0 * d - 0.01) { gaps[f.id] = (gaps[f.id] || '') + ' ' + k.toFixed(2); }
      }
    }
    return { png, tris, gaps, at: [Math.round(x0), Math.round(z0)] };
  };
})();
