// Кадры деревьев «Ситжеса» в игре (этап 4б.2): улицы из таблицы 4б.1 с уровня машины и пара видов сверху.
// Не часть игры (для tools/cdp.js):
//   node tools/cdp.js --inject tools/sitges/trees-shots.js --eval "await __treesShots()" --dir tools/sitges/raw/trees-plan
// __treesShots({ w, h, only }) → { png, missing }: улица — камера на оси в середине улицы, 3 м над землёй, смотрит
// вдоль неё; точка [x, z, высота] — вид сверху-сбоку.
(() => {
  const PLACES = {
    'balmes': 'Carrer de Balmes', 'sofia': 'Avinguda de Sofia', 'maritim': 'Passeig Marítim',
    'vilafranca': 'Passeig de Vilafranca', 'vinyet': 'Avinguda de Nostra Senyora del Vinyet',
    'aiguadolc': "Carrer d'Aiguadolç", 'ribera': 'Passeig de la Ribera',
    'terramar-top': [1330, -60, 45], 'oldtown-top': [-560, -120, 40], 'vinyet-top': [1000, 60, 45],
  };
  window.__treesShots = async function ({ w = 1280, h = 720, only = null } = {}) {
    const D = getData('sitges'), W = getWorld('sitges'), g = D.ground;
    activateWorld('sitges');
    const cam = new THREE.PerspectiveCamera(60, w / h, 0.3, 3200), png = {}, missing = [];
    const prev = new THREE.Vector2(); renderer.getSize(prev);
    const pr = renderer.getPixelRatio();
    renderer.setPixelRatio(1); renderer.setSize(w, h, false);
    for (const [name, P] of Object.entries(PLACES)) {
      if (only && !only.includes(name)) continue;
      let cx, cy, cz, tx, ty, tz;
      if (Array.isArray(P)) {
        const [x, z, hh] = P, y = g(x, z);
        cx = x + hh * 0.5; cz = z - hh * 0.9; cy = y + hh; tx = x; tz = z; ty = y;
      } else {
        const st = D.C.streets.filter(s => s.name === P && s.drive).sort((a, b) => b.len - a.len)[0];
        if (!st) { missing.push(name); continue; }
        const v = st.v, k = Math.floor(v.length / 2), a = v[Math.max(0, k - 3)], b = v[Math.min(v.length - 1, k + 3)];
        const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1;
        cx = v[k].x - dx / L * 20; cz = v[k].z - dz / L * 20; cy = g(cx, cz) + 3;
        tx = v[k].x + dx / L * 30; tz = v[k].z + dz / L * 30; ty = g(tx, tz) + 3;
      }
      cam.position.set(cx, cy, cz); cam.lookAt(tx, ty, tz); cam.updateMatrixWorld();
      aimSun(tx, ty, tz);
      if (W.cullView) W.cullView(cx, cz);
      renderer.shadowMap.needsUpdate = true; renderer.setScissorTest(false); renderer.setViewport(0, 0, w, h);
      renderer.render(scene, cam);
      png[name] = renderer.domElement.toDataURL('image/jpeg', 0.85);
    }
    renderer.setPixelRatio(pr); renderer.setSize(prev.x, prev.y, false);
    return { png, missing };
  };
})();
