// 3D-стрелка вверху половины экрана: показывает игроку направление на цель (чекпоинт гонки, точку захвата).
// Рисуется поверх кадра отдельной маленькой сценой после основного рендера своей половины.
// Определяет: TargetArrow.
// Использует: clamp, renderer (js/core.js); cars (js/physics.js); cams (js/match.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

/* =====================================================================
   СТРЕЛКА НА ЦЕЛЬ
   ===================================================================== */
const TargetArrow = (() => {
  const arrowScene = new THREE.Scene();
  arrowScene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.4));
  const aSun = new THREE.DirectionalLight(0xffffff, 2.2); aSun.position.set(0.3, 1, 0.4); arrowScene.add(aSun);
  const arrowCam = new THREE.PerspectiveCamera(30, 1, 1, 100);
  const arrowGeo = (() => {
    const s = new THREE.Shape();
    s.moveTo(0, 1.35); s.lineTo(0.95, 0.15); s.lineTo(0.38, 0.15); s.lineTo(0.38, -1.05); s.lineTo(-0.38, -1.05); s.lineTo(-0.38, 0.15); s.lineTo(-0.95, 0.15); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.07, bevelSegments: 2 });
    g.rotateX(Math.PI / 2); g.center();                 // остриё смотрит вдоль +Z, плоскость стрелки — горизонтальная
    return g;
  })();
  const arrowMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.35, metalness: 0.1 });
  const arrow = new THREE.Mesh(arrowGeo, arrowMat);
  const outline = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: 0x06140e, side: THREE.BackSide }));
  outline.scale.setScalar(1.08); arrow.add(outline);
  arrowScene.add(arrow);
  const _dir = new THREE.Vector3();
  // p — игрок, w × h — размер его половины экрана, (x, y, z) — цель, col — цвет; ближе near метров стрелка пульсирует
  function draw(p, w, h, x, y, z, col, near = 60) {
    const c = cars[p], cam = cams[p];
    cam.getWorldDirection(_dir);
    const yaw = Math.atan2(_dir.x, _dir.z), pitch = 0.62, D = 23;
    arrowCam.position.set(-Math.sin(yaw) * D * Math.cos(pitch), D * Math.sin(pitch), -Math.cos(yaw) * D * Math.cos(pitch));
    arrowCam.lookAt(0, 0, 0);
    arrowCam.aspect = w / h;
    // размер стрелки — не больше 15 % высоты и 28 % ширины половины экрана (половины обычно узкие и высокие)
    arrowCam.zoom = Math.min(0.75, 1.4 * w / h);
    arrowCam.setViewOffset(w, h, 0, h * 0.27, w, h);    // стрелка — вверху по центру, под табличкой прочности
    arrowCam.updateProjectionMatrix();
    const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz);
    arrow.rotation.set(clamp(-Math.atan2(y - c.y, d) * 0.8, -0.35, 0.35), Math.atan2(dx, dz), 0, 'YXZ');
    arrow.scale.setScalar(d < near ? 1 + 0.08 * Math.sin(performance.now() / 90) : 1);
    arrow.position.y = Math.sin(performance.now() / 400) * 0.08;
    arrowMat.color.setHex(col); arrowMat.emissive.setHex(col);
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(arrowScene, arrowCam);
    renderer.autoClear = true;
  }
  return { draw };
})();
