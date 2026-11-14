// Живые фары и видимые повреждения машин игроков: стоп-сигналы и фонари заднего хода с ореолами, светящийся след
// задних фонарей на скорости, отлетающие бамперы, дым из-под капота (js/physics.js → Car.visual).
// Определяет: TRAIL_T, TRAIL_N, trailMat, WRECK_MAX, Wrecks, removeWreck, CarFx.
// Использует: QUAL, rand (js/core.js); scene, NIGHT_U, smooth01, Breakables (js/world.js); Sky (js/sky.js); sparks
//   (js/effects.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.

/* =====================================================================
   CAR FX
   ===================================================================== */
const _fxV = new THREE.Vector3();

/* ---------- светящийся след задних фонарей ---------- */
// Лента из последних положений фонаря за TRAIL_T секунд. Разворот ленты лицом к камере считает вершинный шейдер
// (поэтому одна и та же лента правильно видна обеим половинам экрана), JS только дописывает точки.
// Свечение аддитивное: туман не подмешивает свой цвет, а гасит яркость. Вблизи камеры лента прозрачная —
// свой след не лезет в глаза, а у соперника перед тобой хорошо виден.
const TRAIL_T = 0.24, TRAIL_N = 18;
const trailMat = new THREE.ShaderMaterial({
  uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uCol: { value: new THREE.Color(0xff2414) }, uW: { value: 0.075 } }]),
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true,
  vertexShader: `
    attribute vec3 aTan; attribute float aSide, aA;
    uniform float uW;
    varying float vA, vS;
    #include <fog_pars_vertex>
    void main() {
      vec3 t = normalize(aTan + vec3(0.0, 1e-4, 0.0));
      vec3 side = normalize(cross(t, normalize(cameraPosition - position)) + vec3(0.0, 1e-4, 0.0));
      vec4 mvPosition = viewMatrix * vec4(position + side * aSide * uW, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      vA = aA * smoothstep(3.0, 7.0, -mvPosition.z);
      vS = aSide;
      #include <fog_vertex>
    }`,
  fragmentShader: `
    uniform vec3 uCol;
    varying float vA, vS;
    #include <fog_pars_fragment>
    void main() {
      float a = vA * (1.0 - vS * vS);
      #ifdef USE_FOG
        a *= 1.0 - smoothstep(fogNear, fogFar, vFogDepth);
      #endif
      gl_FragColor = vec4(mix(uCol, vec3(1.0, 0.7, 0.55), (1.0 - abs(vS)) * 0.18), a * 0.85);
      #include <colorspace_fragment>
    }`,
});

// обломки (оторванные бамперы): та же простая физика, что у сбитых столбов и стульев (Breakables, js/world.js)
const WRECK_MAX = 8;
const Wrecks = { list: [], update(dt) { for (const w of this.list) w.B.update(dt); } };
function removeWreck(w) {
  for (const E of w.B.meshes) { scene.remove(E.mesh); E.mesh.geometry.dispose(); E.mesh.dispose(); }
  const i = Wrecks.list.indexOf(w); if (i >= 0) Wrecks.list.splice(i, 1);
}

class CarFx {
  constructor(car) {
    this.car = car;
    const m = car.model;
    // задние фонари уже склеены в один меш — по его габаритам ставим фонари заднего хода, ореолы и след
    const tail = m.body.children.find(o => o.isMesh && o.material === car.tailMat);
    let bb = new THREE.Box3(new THREE.Vector3(-0.8, 0.7, -car.L / 2), new THREE.Vector3(0.8, 0.85, -car.L / 2 + 0.1));
    if (tail) { tail.geometry.computeBoundingBox(); bb = tail.geometry.boundingBox; }
    const tx = bb.max.x, ty = (bb.min.y + bb.max.y) / 2, rz = bb.min.z, ry = bb.min.y - 0.045;

    // фонари заднего хода: белые, под стоп-сигналами
    this.revMat = new THREE.MeshStandardMaterial({ color: 0x8c8c8c, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.25 });
    const revGeo = new THREE.BoxGeometry(0.13, 0.055, 0.04);
    for (const s of [1, -1]) {
      const b = new THREE.Mesh(revGeo, this.revMat); b.position.set(s * (tx - 0.09), ry, rz + 0.025); m.body.add(b);
    }
    // ореолы: мягкие пятна света поверх фонарей (стоп-сигналы — красные, задний ход — белые)
    const glow = (pts, color) => {
      const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const p = new THREE.Points(geo, new THREE.PointsMaterial({ map: Sky.glowTex, color, size: 1, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false }));
      p.renderOrder = 4; m.body.add(p);
      return p;
    };
    const gx = Math.max(0.2, tx - 0.17);
    this.tailGlow = glow([gx, ty, rz - 0.06, -gx, ty, rz - 0.06], 0xff2a1a);
    this.revGlow = glow([tx - 0.09, ry, rz - 0.05, -(tx - 0.09), ry, rz - 0.05], 0xfff4e0);

    // след фонарей
    this.trail = null;
    if (QUAL.trails) {
      const nv = 2 * TRAIL_N * 2, geo = new THREE.BufferGeometry();
      const attr = (n, size) => new THREE.Float32BufferAttribute(new Float32Array(n * size), size).setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('position', attr(nv, 3)); geo.setAttribute('aTan', attr(nv, 3)); geo.setAttribute('aA', attr(nv, 1));
      const side = new Float32Array(nv), idx = [];
      for (let k = 0; k < 2; k++) for (let i = 0; i < TRAIL_N; i++) {
        const v = (k * TRAIL_N + i) * 2; side[v] = 1; side[v + 1] = -1;
        if (i < TRAIL_N - 1) idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      }
      geo.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1)); geo.setIndex(idx);
      const mesh = new THREE.Mesh(geo, trailMat);
      mesh.frustumCulled = false; mesh.renderOrder = 4; mesh.visible = false; scene.add(mesh);
      this.trail = { mesh, geo, local: [new THREE.Vector3(gx, ty, rz - 0.02), new THREE.Vector3(-gx, ty, rz - 0.02)],
        hist: [[], []], pool: [], t: 0, last: -1 };
    }

    this.endDmg = { f: 0, r: 0 };
    this.wrecks = [];
  }

  // каждый кадр (Car.visual): фонари, ореолы, след. braking — стоп-сигналы, reversing — задний ход
  update(dt, braking, reversing) {
    const car = this.car, night = NIGHT_U.value, alive = car.drown <= 0;
    car.tailMat.emissiveIntensity = braking ? 5.5 : 1.6 + night * 0.8;
    this.revMat.emissiveIntensity = reversing && alive ? 3.2 : 0;
    const tg = this.tailGlow.material, rg = this.revGlow.material;
    tg.opacity = alive ? (braking ? 0.55 + night * 0.35 : night * 0.35) : 0;
    tg.size = braking ? 1.0 + night * 0.5 : 0.8;
    rg.opacity = alive && reversing ? 0.35 + night * 0.5 : 0;
    rg.size = 0.7 + night * 0.6;
    if (this.trail) this.updateTrail(dt, braking);
  }

  updateTrail(dt, braking) {
    const T = this.trail, car = this.car, root = car.model.root;
    const spd = Math.hypot(car.vx, car.vz);
    const k = car.drown > 0 ? 0 : smooth01((spd - 22) / 18) * (0.3 + 0.7 * NIGHT_U.value) * (braking ? 1.5 : 1);
    T.t += dt;
    const push = T.t - T.last >= 1 / 60;
    if (push) T.last = T.t;
    const pos = T.geo.attributes.position.array, tan = T.geo.attributes.aTan.array, al = T.geo.attributes.aA.array;
    let any = false;
    for (let s = 0; s < 2; s++) {
      const H = T.hist[s];
      const head = _fxV.copy(T.local[s]).applyQuaternion(root.quaternion).add(root.position);
      // старые точки — в запас; после телепорта (возврат на дорогу) след обрывается
      while (H.length && (H[0].t < T.t - TRAIL_T || H.length >= TRAIL_N - 1)) T.pool.push(H.shift());
      const L = H[H.length - 1];
      if (L && (L.x - head.x) ** 2 + (L.y - head.y) ** 2 + (L.z - head.z) ** 2 > 36) while (H.length) T.pool.push(H.shift());
      if (push && k > 0) { const P = T.pool.pop() || {}; P.x = head.x; P.y = head.y; P.z = head.z; P.t = T.t; P.k = k; H.push(P); }
      // точки ленты: 0 — фонарь сейчас, дальше история от новых к старым; лишние вершины — прозрачные, в последней точке
      const n = H.length + 1, pt = i => i === 0 ? head : H[H.length - i];
      for (let i = 0; i < TRAIL_N; i++) {
        const j = Math.min(i, n - 1), A = pt(j), newer = pt(Math.max(0, j - 1)), older = pt(Math.min(n - 1, j + 1));
        const a = i >= n || n < 2 ? 0 : j === 0 ? k : A.k * (1 - (T.t - A.t) / TRAIL_T);
        if (a > 0.01) any = true;
        const v = (s * TRAIL_N + i) * 2;
        for (const o of [v, v + 1]) {
          pos[o * 3] = A.x; pos[o * 3 + 1] = A.y; pos[o * 3 + 2] = A.z;
          tan[o * 3] = newer.x - older.x; tan[o * 3 + 1] = newer.y - older.y; tan[o * 3 + 2] = newer.z - older.z;
          al[o] = a;
        }
      }
    }
    T.mesh.visible = any;
    if (any) for (const a of ['position', 'aTan', 'aA']) T.geo.attributes[a].needsUpdate = true;
  }

  // удар силой strength (Δv, м/с) в точке (wx, wz): сильные удары в нос или корму копятся и отрывают бампер
  hit(strength, wx, wz) {
    const car = this.car, g = car.g, s = Math.sin(car.h), c = Math.cos(car.h);
    if (!car.model.bumpers) return;
    const dx = wx - car.x, dz = wz - car.z, lx = c * dx - s * dz, lz = s * dx + c * dz;
    if (Math.abs(lz) / (g.L / 2) <= Math.abs(lx) / (g.W / 2)) return;    // удар в борт
    const end = lz > 0 ? 'f' : 'r';
    this.endDmg[end] += strength;
    if (this.endDmg[end] > 13) this.detach(end, strength);
  }

  // оторвать бампер end ('f' / 'r'): он улетает отдельным обломком, а на машине пропадает
  detach(end, strength) {
    const grp = this.car.model.bumpers[end], car = this.car, root = car.model.root;
    if (!grp.visible) return;
    const meshes = grp.children.filter(o => o.isMesh);
    if (!meshes.length) return;
    grp.visible = false;
    const box = new THREE.Box3();
    for (const o of meshes) { o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox); }
    const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2, y0 = box.min.y, cy = Math.max(0.06, (box.max.y - y0) / 2);
    // обломок: копия геометрии бампера с началом координат внизу по центру, по экземпляру на материал
    const inst = meshes.map(o => {
      const im = new THREE.InstancedMesh(o.geometry.clone().translate(-cx, -y0, -cz), o.material, 1);
      im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; scene.add(im);
      return im;
    });
    const B = new Breakables(inst, { light: true, cy, lie: 1.45, mass: 15, kind: 'plastic' });
    _fxV.set(cx, y0, cz).applyQuaternion(root.quaternion).add(root.position);
    const it = B.add(null, _fxV.x, _fxV.y, _fxV.z, car.h);
    // летит наружу (вперёд или назад) и вбок, сохраняя большую часть скорости машины
    const sg = end === 'f' ? 1 : -1, sh = Math.sin(car.h), ch = Math.cos(car.h), lat = rand(-0.8, 0.8);
    let nx = sh * sg + ch * lat, nz = ch * sg - sh * lat; const nl = Math.hypot(nx, nz); nx /= nl; nz /= nl;
    const vn = 2.5 + strength * 0.25;
    B.knock(it, nx, nz, vn, car.vx, car.vz);
    it.v.set(car.vx * 0.75 + nx * vn, 2 + Math.min(5, strength * 0.2), car.vz * 0.75 + nz * vn);
    const w = { B, owner: this };
    Wrecks.list.push(w); this.wrecks.push(w);
    while (Wrecks.list.length > WRECK_MAX) { const old = Wrecks.list[0]; removeWreck(old); old.owner.wrecks = old.owner.wrecks.filter(x => x !== old); }
    for (let k = 0; k < 10; k++) sparks.spawn(_fxV.x, _fxV.y + 0.3, _fxV.z, car.vx * 0.5 + rand(-3, 3), rand(1, 4), car.vz * 0.5 + rand(-3, 3), 0.3, 0.05, 0.4, 0xffc060, 1, 14);
  }

  // ремонт (машина починилась после поломки): бамперы на месте; оторванные остаются лежать
  repair() {
    const bp = this.car.model.bumpers;
    if (bp) { bp.f.visible = bp.r.visible = true; }
    this.endDmg.f = this.endDmg.r = 0;
  }

  dispose() {
    for (const w of this.wrecks) removeWreck(w);
    this.wrecks = [];
    if (this.trail) { scene.remove(this.trail.mesh); this.trail.geo.dispose(); }
    this.revMat.dispose();
    for (const g of [this.tailGlow, this.revGlow]) { g.geometry.dispose(); g.material.dispose(); }
  }
}
