// Эффекты: частицы, следы шин, монеты
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

/* =====================================================================
   EFFECTS: частицы, следы шин
   ===================================================================== */
const softTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
// Все частицы одного вида — один вызов отрисовки: квадрат-«спрайт» размножается по экземплярам
// (InstancedBufferGeometry), а в вершинном шейдере разворачивается лицом к камере и поворачивается.
// В буферы каждый кадр пишутся только живые частицы.
const _pc = new THREE.Color();
class Particles {
  constructor(n, blending) {
    this.items = []; this.i = 0;
    for (let k = 0; k < n; k++) this.items.push({ x: 0, y: 0, z: 0, rot: 0, r: 1, gc: 1, b: 1, life: 0, max: 1, vx: 0, vy: 0, vz: 0, s0: 1, s1: 1, a: 1, g: 0 });
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const attr = (size) => new THREE.InstancedBufferAttribute(new Float32Array(n * size), size).setUsage(THREE.DynamicDrawUsage);
    this.aPos = attr(3); this.aCol = attr(4); this.aSR = attr(2);      // центр; цвет + прозрачность; размер + поворот
    geo.setAttribute('aPos', this.aPos); geo.setAttribute('aCol', this.aCol); geo.setAttribute('aSR', this.aSR);
    geo.instanceCount = 0;
    const mat = new THREE.MeshBasicMaterial({ map: softTex, transparent: true, depthWrite: false, blending, fog: true });
    mat.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          attribute vec3 aPos; attribute vec4 aCol; attribute vec2 aSR; varying vec4 vPCol;`)
        .replace('#include <project_vertex>', `
          vec4 mvPosition = modelViewMatrix * vec4(aPos, 1.0);
          float pc = cos(aSR.y), ps = sin(aSR.y);
          mvPosition.xy += vec2(pc * position.x - ps * position.y, ps * position.x + pc * position.y) * aSR.x;
          gl_Position = projectionMatrix * mvPosition;
          vPCol = aCol;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec4 vPCol;`)
        .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse * vPCol.rgb, opacity * vPCol.a );');
    };
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false; this.mesh.visible = false;
    this.mesh.renderOrder = 3;                        // поверх следов шин и световых пятен (у них renderOrder 1–2)
    this.geo = geo;
    scene.add(this.mesh);
  }
  spawn(x, y, z, vx, vy, vz, s0, s1, life, color, alpha, grav = 0) {
    const p = this.items[this.i]; this.i = (this.i + 1) % this.items.length;
    p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.s0 = s0; p.s1 = s1; p.life = p.max = life; p.a = alpha; p.g = grav;
    _pc.setHex(color); p.r = _pc.r; p.gc = _pc.g; p.b = _pc.b; p.rot = Math.random() * 6;
  }
  update(dt) {
    const P = this.aPos.array, C = this.aCol.array, S = this.aSR.array;
    let k = 0;
    for (const p of this.items) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) continue;
      const t = 1 - p.life / p.max;
      p.vy -= p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.vx *= 0.98; p.vz *= 0.98;
      P[k * 3] = p.x; P[k * 3 + 1] = p.y; P[k * 3 + 2] = p.z;
      C[k * 4] = p.r; C[k * 4 + 1] = p.gc; C[k * 4 + 2] = p.b;
      C[k * 4 + 3] = p.a * (t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85);
      S[k * 2] = lerp(p.s0, p.s1, t); S[k * 2 + 1] = p.rot;
      k++;
    }
    this.geo.instanceCount = k; this.mesh.visible = k > 0;
    if (k) { this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSR.needsUpdate = true; }
  }
  clear() { for (const p of this.items) p.life = 0; this.geo.instanceCount = 0; this.mesh.visible = false; }
}
// частицы теперь почти ничего не стоят — запас вдвое больше прежнего (320 / 280), чтобы дым и искры не обрывались
const smoke = new Particles(640, THREE.NormalBlending);
const sparks = new Particles(560, THREE.AdditiveBlending);   // искры, пламя нитро и хлопков выхлопа

const SKID_N = 3000;
const skids = new THREE.InstancedMesh(FLAT_QUAD, new THREE.MeshBasicMaterial({ color: 0x0c0c0c, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }), SKID_N);
skids.frustumCulled = false; skids.renderOrder = 1;
const _m = new THREE.Matrix4(), _f = new THREE.Vector3(), _up = new THREE.Vector3(), _r = new THREE.Vector3();
function clearSkids() { _m.makeScale(0, 0, 0); for (let i = 0; i < SKID_N; i++) skids.setMatrixAt(i, _m); skids.instanceMatrix.needsUpdate = true; }
clearSkids(); scene.add(skids);
let skidIdx = 0;
// след ориентируется по наклону поверхности
function addSkid(x1, y1, z1, x2, y2, z2, w) {
  _f.set(x2 - x1, y2 - y1, z2 - z1);
  const len = _f.length();
  if (len < 0.02 || len > 3) return;
  _f.divideScalar(len);
  // нормаль рельефа в середине следа, чтобы полоска лежала на косогоре
  const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
  // на мосту или трамплине (след выше рельефа) нормаль берём перпендикулярно следу
  if (Math.abs((y1 + y2) / 2 - world.ground(mx, mz)) > 0.4) _up.set(0, 1, 0);
  else _up.set(world.ground(mx - 0.5, mz) - world.ground(mx + 0.5, mz), 1, world.ground(mx, mz - 0.5) - world.ground(mx, mz + 0.5)).normalize();
  _r.crossVectors(_up, _f).normalize(); _f.crossVectors(_r, _up);
  _m.makeBasis(_r.multiplyScalar(w), _up, _f.multiplyScalar(len + 0.03));
  _m.setPosition((x1 + x2) / 2, (y1 + y2) / 2 + 0.05, (z1 + z2) / 2);
  skids.setMatrixAt(skidIdx, _m); skidIdx = (skidIdx + 1) % SKID_N; skids.instanceMatrix.needsUpdate = true;
}

// монеты: две InstancedMesh (диск + ободок) на все монеты карты
const COIN_MAX = 100;
const coinMat = new THREE.MeshStandardMaterial({ color: 0xffc83a, metalness: 1, roughness: 0.25, emissive: 0x6b4800, emissiveIntensity: 0.7 });
const coinDisc = inst(new THREE.CylinderGeometry(0.6, 0.6, 0.14, 24).rotateX(Math.PI / 2), coinMat, COIN_MAX);
const coinRim = inst(new THREE.TorusGeometry(0.6, 0.06, 6, 24), coinMat, COIN_MAX, false);
scene.add(coinDisc, coinRim);
let coins = [];
function spawnCoin(c) { const [x, z, y] = world.coinSpot(); c.x = x; c.z = z; c.y = y ?? world.ground(x, z); c.active = true; }
function resetCoins(n = world.coinCount) {
  coins = [];
  for (let i = 0; i < n; i++) { const c = { phase: Math.random() * 6, timer: 0 }; spawnCoin(c); coins.push(c); }
  coinDisc.count = coinRim.count = coins.length;
}
function updateCoins3D(dt, t) {
  coins.forEach((c, i) => {
    if (!c.active && (c.timer -= dt) <= 0) spawnCoin(c);
    dummy.position.set(c.x, c.y + 1.1 + Math.sin(t * 3 + c.phase) * 0.15, c.z);
    dummy.rotation.set(0, t * 2.5 + c.phase, 0);
    dummy.scale.setScalar(c.active ? 1 : 0);
    dummy.updateMatrix();
    coinDisc.setMatrixAt(i, dummy.matrix); coinRim.setMatrixAt(i, dummy.matrix);
    if (!c.active) return;
    for (const car of cars) {
      if ((car.x - c.x) ** 2 + (car.z - c.z) ** 2 < 2.4 * 2.4 && Math.abs(car.y - c.y) < 3 && car.drown <= 0) {
        c.active = false; c.timer = 10;
        addCoins(car.p, 1); notify(car.p, '+1', 'gold', true); Sound.coin(car.p);
        for (let k = 0; k < 10; k++) sparks.spawn(c.x, c.y + 1.1, c.z, rand(-3, 3), rand(1, 4), rand(-3, 3), 0.4, 0.05, 0.5, 0xffd84a, 1, 6);
        break;
      }
    }
  });
  coinDisc.instanceMatrix.needsUpdate = coinRim.instanceMatrix.needsUpdate = true;
}

