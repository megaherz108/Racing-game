// Эффекты: частицы, следы шин, монеты
// Определяет: softTex, Particles, smoke, sparks, SKID_N, SKID_LIFE, skidGeo, skidAttr, SKID_U, skidMat, skids,
//   clearSkids, skidIdx, skidDirty, addSkid, updateSkids, SURF, wheelFx, COIN_MAX, coinMat, coinDisc, coinRim, coins,
//   spawnCoin, resetCoins, updateCoins3D.
// Использует: lerp, QUAL, rand (js/core.js); scene, FLAT_QUAD, inst, dummy (js/world.js); Weather (js/weather.js);
//   world (js/maps/registry.js); Sound (js/audio.js); simTime, cars (js/physics.js); addCoins, notify (js/ui.js).
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
const smoke = new Particles(900, THREE.NormalBlending);
const sparks = new Particles(560, THREE.AdditiveBlending);   // искры, пламя нитро и хлопков выхлопа

// Следы шин: кольцевой буфер полосок. Каждая полоска помнит, когда и с какой непрозрачностью легла, и цвет покрытия
// (чёрная резина на асфальте, колея на траве и песке). В шейдере следы постепенно бледнеют — со временем (SKID_LIFE)
// и по мере того, как буфер подходит к их месту: самые старые растворяются, а не исчезают разом.
// На видеокарту каждый кадр уходят только новые полоски (addUpdateRange), а не весь буфер.
const SKID_N = 4000, SKID_LIFE = 50;
const skidGeo = FLAT_QUAD.clone();
const skidAttr = new THREE.InstancedBufferAttribute(new Float32Array(SKID_N * 2), 2).setUsage(THREE.DynamicDrawUsage);   // время, непрозрачность
skidGeo.setAttribute('aSkid', skidAttr);
const SKID_U = { uNow: { value: 0 }, uHead: { value: 0 } };
const skidMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
skidMat.onBeforeCompile = sh => {
  Object.assign(sh.uniforms, SKID_U);
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', `#include <common>
      attribute vec2 aSkid; uniform float uNow, uHead; varying float vSkA;`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      float skAge = mod(uHead - 1.0 - float(gl_InstanceID) + ${SKID_N}.0, ${SKID_N}.0) / ${SKID_N}.0;
      vSkA = aSkid.y * (1.0 - smoothstep(${SKID_LIFE * 0.4}.0, ${SKID_LIFE}.0, uNow - aSkid.x)) * (1.0 - smoothstep(0.7, 1.0, skAge));`);
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', `#include <common>
varying float vSkA;`)
    .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse, opacity * vSkA );');
};
const skids = new THREE.InstancedMesh(skidGeo, skidMat, SKID_N);
skids.frustumCulled = false; skids.renderOrder = 1;
skids.setColorAt(0, _pc.setHex(0x0c0c0c));
const _m = new THREE.Matrix4(), _f = new THREE.Vector3(), _up = new THREE.Vector3(), _r = new THREE.Vector3();
function clearSkids() {
  _m.makeScale(0, 0, 0); for (let i = 0; i < SKID_N; i++) skids.setMatrixAt(i, _m);
  skidAttr.array.fill(0); skidIdx = 0; SKID_U.uHead.value = 0;
  skids.instanceMatrix.needsUpdate = skidAttr.needsUpdate = skids.instanceColor.needsUpdate = true;
}
let skidIdx = 0;
clearSkids(); scene.add(skids);
// пометить для отправки на видеокарту только изменённый экземпляр i
function skidDirty(i) {
  for (const [a, n] of [[skids.instanceMatrix, 16], [skids.instanceColor, 3], [skidAttr, 2]]) {
    if (a.addUpdateRange) a.addUpdateRange(i * n, n);
    a.needsUpdate = true;
  }
}
// след ориентируется по наклону поверхности; color/alpha — цвет и непрозрачность следа на этом покрытии
function addSkid(x1, y1, z1, x2, y2, z2, w, color = 0x0c0c0c, alpha = 0.55) {
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
  const i = skidIdx;
  skids.setMatrixAt(i, _m); skids.setColorAt(i, _pc.setHex(color));
  skidAttr.array[i * 2] = simTime; skidAttr.array[i * 2 + 1] = alpha;
  skidDirty(i);
  skidIdx = (skidIdx + 1) % SKID_N; SKID_U.uHead.value = skidIdx;
}
function updateSkids() { SKID_U.uNow.value = simTime; }

/* ---------- покрытие под колёсами ---------- */
// smoke — цвет дыма шин при заносе; skid — цвет и непрозрачность следа заноса; track — непрозрачность колеи,
// которую мягкое покрытие оставляет и без заноса; dust — пыль из-под колёс [цвет, непрозрачность];
// spray — брызги воды (мокрый песок у кромки моря)
const SURF = {
  asphalt: { smoke: 0xd8d8d8, skid: [0x0c0c0c, 0.55] },
  paving: { smoke: 0xd0ccc4, skid: [0x1a1a1a, 0.45] },
  cobble: { smoke: 0xd0ccc4, skid: [0x1a1a1a, 0.45] },
  grass: { smoke: 0x8f8360, skid: [0x33361c, 0.55], track: 0.3, dust: [0x857a55, 0.22], bits: 0x4f7d2e },
  dirt: { smoke: 0xc7b28a, skid: [0x8c7652, 0.5], track: 0.3, dust: [0xc8b48c, 0.3] },
  sand: { smoke: 0xdccb9c, skid: [0xa48c62, 0.5], track: 0.4, dust: [0xd9c79a, 0.34] },
  wet: { smoke: 0xe8f2ff, skid: [0x6a5a40, 0.55], track: 0.5, spray: true },
};
// эффекты одного колеса машины car: (wx, wy, wz) — точка касания, prev — где был прошлый кусок следа
function wheelFx(car, k, wx, wy, wz, onDeck, skidding, speed, dt) {
  const kind = !onDeck && world.surfaceKind ? world.surfaceKind(wx, wz) : 'asphalt';
  const S = SURF[kind] || SURF.asphalt, fx = QUAL.fx;
  const prev = car.skidPrev[k];
  // след: занос — на любом покрытии, колея — на мягком и без заноса (реже: по куску на ~0,6 м)
  const mark = skidding ? S.skid : S.track ? [S.skid[0], S.track] : null;
  if (mark) {
    if (!prev) car.skidPrev[k] = [wx, wy, wz];
    else {
      const d2 = (wx - prev[0]) ** 2 + (wz - prev[2]) ** 2;
      if (d2 > (skidding ? 0.09 : 0.36)) {
        addSkid(prev[0], prev[1], prev[2], wx, wy, wz, car.g.ww * 0.9, mark[0], mark[1]);
        car.skidPrev[k] = [wx, wy, wz];
      }
    }
  } else car.skidPrev[k] = null;
  // дым шин при заносе — цвета покрытия
  if (skidding && Math.random() < dt * 22)
    smoke.spawn(wx, wy + 0.3, wz, rand(-0.5, 0.5), rand(0.4, 1), rand(-0.5, 0.5), 0.6, 2.4, 1.0, S.smoke, kind === 'asphalt' || kind === 'paving' ? 0.35 : 0.45);
  // пыль на траве, песке и грунте
  if (S.dust && speed > 4 && Math.random() < dt * Math.min(18, speed * 0.6) * fx) {
    smoke.spawn(wx + rand(-0.2, 0.2), wy + 0.2, wz + rand(-0.2, 0.2), car.vx * 0.25 + rand(-0.8, 0.8), rand(0.5, 1.6), car.vz * 0.25 + rand(-0.8, 0.8),
      0.5, rand(1.8, 2.8), rand(0.9, 1.5), S.dust[0], S.dust[1]);
    if (S.bits && Math.random() < 0.35) sparks.spawn(wx, wy + 0.1, wz, car.vx * 0.2 + rand(-1.5, 1.5), rand(1.5, 3.5), car.vz * 0.2 + rand(-1.5, 1.5), 0.12, 0.08, 0.6, S.bits, 0.5, 9);
  }
  // брызги: мокрый песок у кромки воды, а в дождь — любой асфальт
  const rainSpray = Weather.raining && !S.dust && !S.spray;
  if ((S.spray || rainSpray) && speed > 5 && Math.random() < dt * Math.min(24, speed * (rainSpray ? 0.45 : 0.8)) * fx) {
    const up = S.spray ? rand(1.5, 3.5) : rand(0.6, 1.6);
    smoke.spawn(wx + rand(-0.15, 0.15), wy + 0.15, wz + rand(-0.15, 0.15), car.vx * 0.35 + rand(-1, 1), up, car.vz * 0.35 + rand(-1, 1),
      0.35, S.spray ? 1.6 : 2.4, rand(0.45, 0.8), S.spray ? 0xeaf4ff : 0xc4ccd4, S.spray ? 0.5 : 0.2, S.spray ? 7 : 2);
  }
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

