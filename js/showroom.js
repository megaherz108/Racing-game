// Шоурум — 3D-фон меню и гаража
// Определяет: show, showKey, showCam, podiums, PODIUM_X, PODIUM_SPAN, viewShift, updatePodium.
// Использует: PLAYER_COLORS, CARS, browse (js/data.js); envTex (js/core.js); disposeTree, buildCarModel
//   (js/car-models.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

/* =====================================================================
   SHOWROOM (фон меню/гаража)
   ===================================================================== */
const show = new THREE.Scene();
show.background = new THREE.Color(0x0c1018);
show.fog = new THREE.Fog(0x0c1018, 18, 40);
show.environment = envTex;
show.add(new THREE.HemisphereLight(0xb8c8e0, 0x101418, 0.6));
const showKey = new THREE.DirectionalLight(0xffffff, 2.0);
showKey.position.set(4, 10, 7); showKey.castShadow = true;
showKey.shadow.mapSize.set(1024, 1024);
Object.assign(showKey.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 30 });
show.add(showKey);
{
  const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 64), new THREE.MeshStandardMaterial({ color: 0x151a22, roughness: 0.35, metalness: 0.4 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; show.add(floor);
}
const showCam = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
const podiums = [];
const PODIUM_X = 2.8, PODIUM_SPAN = 5.6;
let viewShift = 0;
for (let p = 0; p < 2; p++) {
  const g = new THREE.Group();
  g.position.set(p === 0 ? -PODIUM_X : PODIUM_X, 0, 0);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.75, 0.28, 64), new THREE.MeshStandardMaterial({ color: 0x232a35, roughness: 0.4, metalness: 0.5 }));
  base.position.y = 0.14; base.receiveShadow = true; g.add(base);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.68, 0.04, 8, 96), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[p] }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.27; g.add(ring);
  const spot = new THREE.PointLight(PLAYER_COLORS[p], 6, 9, 1.5); spot.position.set(0, 4, 2.5); g.add(spot);
  const turn = new THREE.Group(); turn.position.y = 0.28; g.add(turn);
  show.add(g);
  podiums.push({ group: g, turn, car: null, carId: null });
}
function updatePodium(p) {
  const def = CARS[browse[p]], pod = podiums[p];
  if (pod.carId === def.id) return;
  if (pod.car) { pod.turn.remove(pod.car.root); disposeTree(pod.car.root); }
  pod.car = buildCarModel(def, def.paints[p], { lacquer: true });
  pod.car.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  pod.turn.add(pod.car.root);
  pod.carId = def.id;
  // маленький «прыжок» при смене
  pod.turn.scale.setScalar(0.85);
}

