// Значки за достижения на машинах игроков (список BADGES, места BADGE_SPOTS — js/data.js).
// Значок не освещается (MeshBasicMaterial): днём выглядит как обычный цветной, ночью остаётся ярким — светится;
// ночью вокруг него ещё мягкий ореол (badgeNight() из Sky.apply()). Новых источников света нет.
// Места на кузове находятся лучами по готовой модели машины (badgeAnchors(), кэш на машину): значок ложится на
// поверхность и приподнимается ровно настолько, чтобы край не ушёл в кузов. Все значки одной группы (кузов, каждый
// бампер, каждое колесо) — один меш, так что значки почти не добавляют вызовов отрисовки.
// Определяет: BADGE_PLATE, BADGE_MAT, BADGE_HALO, badgeNight, badgeColors, badgeGeo, haloGeo, BADGE_FIX, BADGE_R,
//   badgeAnchors, badgeMatrix, fitBadges, badgeSVG, unlockBadge.
// Использует: BADGE_SPOTS, save, badgeGive, persist, badgeDef, CARS (js/data.js); clamp, lerp, MAT (js/core.js);
//   buildCarModel, carFaces, disposeTree (js/car-models.js); notify (js/ui.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

/* =====================================================================
   ЗНАЧКИ
   ===================================================================== */
const BADGE_PLATE = 0x14171c;                // тёмная подложка значка
// общие материалы (не уничтожать): значок и ореол; ореол — свой у витрины гаража (там всегда слегка светится)
const BADGE_MAT = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
BADGE_MAT.userData.shared = true;
const BADGE_HALO = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  return [0, 0.3].map(op => {
    const m = new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, transparent: true, opacity: op, blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false, visible: op > 0 });
    m.userData.shared = true;
    return m;
  });
})();
// сила ночи 0…1 (пресет времени суток, js/sky.js): ореолы значков в заезде
function badgeNight(k) { BADGE_HALO[0].opacity = k * 0.6; BADGE_HALO[0].visible = k > 0; }

/* ---------- геометрия ---------- */
const _bc = new THREE.Color(), _bc2 = new THREE.Color();
function badgeColors(geo, f) {               // вершинные цвета: f(x, y) → THREE.Color
  const p = geo.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const c = f(p.getX(i), p.getY(i)); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}
// значок def в круге радиуса 1, лицом к +z, верх рисунка — +y. Слои приподняты на миллиметры (z — в метрах:
// при постановке масштабируются только x и y), иначе подложка, ободок и рисунок мерцали бы друг сквозь друга
function badgeGeo(def) {
  const parts = [
    badgeColors(new THREE.CircleGeometry(1, 28), () => _bc.setHex(BADGE_PLATE)),
    badgeColors(new THREE.RingGeometry(0.82, 0.97, 28).translate(0, 0, 0.002), () => _bc.setHex(def.rim)),
  ];
  for (const s of def.pic) {
    const g = new THREE.ShapeGeometry(new THREE.Shape(s.pts.map(([x, y]) => new THREE.Vector2(x, y)))).translate(0, 0, 0.004);
    parts.push(badgeColors(g, (x, y) => _bc.setHex(s.c[1]).lerp(_bc2.setHex(s.c[0]), clamp((y + 0.7) / 1.4, 0, 1))));
  }
  const geo = mergeGeometries(parts);
  for (const g of parts) g.dispose();
  return geo;
}
function haloGeo(def) {
  return badgeColors(new THREE.PlaneGeometry(3.4, 3.4).translate(0, 0, 0.003), () => _bc.setHex(def.rim));
}

/* ---------- места на кузове ---------- */
// Лучи по модели машины с отрываемыми бамперами (своя временная копия). Для каждого места: группа (body / f / r),
// центр p, нормаль n, верх рисунка up, радиус r; lift — на сколько пришлось приподнять над изгибом, flat — сколько
// из 12 точек края значка лежит на ровной поверхности. Капот — луч сверху посередине между передним краем и лобовым
// стеклом, верх рисунка — вперёд. Кромка — маленький значок на скошенной передней грани у края капота (если она
// слишком узкая — на капоте у самого края). Бамперы — перебор точек сбоку от номера: ровно, ничто не торчит рядом
// (выхлопные трубы, противотуманки), лучше на пластике бампера.
// BADGE_FIX — ручные поправки для отдельных машин: { машина: { место: { x, y, z, r } } } (вместо найденного перебором)
const BADGE_FIX = {
  // над задним бампером: на самом бампере значок заслоняют выхлопные трубы
  mustang: { rear: { x: 0.42, y: 0.52 } }, golf: { rear: { x: 0.45, y: 0.58 } }, p911: { rear: { x: 0.45, y: 0.5 } },
  accord: { front: { x: 0.42, y: 0.55 } },          // на решётке, а не на тонкой губе внизу
  wrx: { front: { x: 0.39, y: 0.415, r: 0.065 } },  // между номером, решёткой и противотуманкой
  niva: { front: { r: 0.062 }, rear: { r: 0.062 } }, // бамперы узкие (13 см)
};
const BADGE_R = { hood: 0.18, lip: 0.075, front: 0.075, rear: 0.075 };
const _bgAnchors = {};
const _bgRay = new THREE.Raycaster(), _bgO = new THREE.Vector3(), _bgD = new THREE.Vector3();
function badgeAnchors(def) {
  if (_bgAnchors[def.id]) return _bgAnchors[def.id];
  const g = def.geo, m = buildCarModel(def, 0xffffff, { bumpers: true });
  m.root.updateMatrixWorld(true);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const isIn = (o, grp) => { for (; o; o = o.parent) if (o === grp) return true; return false; };
  // лучи — по tgt: весь кузов или вырезанная из него часть (у бамперов — только треугольники у носа или кормы:
  // кузов склеен в несколько больших мешей, и каждый луч иначе перебирал бы все их треугольники)
  let tgt = m.body;
  const cast = (o, d) => {
    _bgRay.set(_bgO.copy(o), _bgD.copy(d).normalize()); _bgRay.far = 20;
    const h = _bgRay.intersectObject(tgt, true)[0];
    if (!h) return null;
    const n = h.face.normal.clone().transformDirection(h.object.matrixWorld);
    if (n.dot(_bgD) > 0) n.negate();
    return { p: h.point.clone(), n, obj: h.object.userData.src || h.object };
  };
  const region = keep => {
    const out = new THREE.Group(), v = new THREE.Vector3();
    m.body.traverse(o => {
      if (!o.isMesh) return;
      const g0 = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry, pos = g0.attributes.position, tri = [];
      for (let i = 0; i + 2 < pos.count; i += 3) {
        let ok = false;
        for (let k = 0; k < 3; k++) if (keep(v.fromBufferAttribute(pos, i + k).applyMatrix4(o.matrixWorld))) ok = true;
        if (ok) for (let k = 0; k < 3; k++) { v.fromBufferAttribute(pos, i + k).applyMatrix4(o.matrixWorld); tri.push(v.x, v.y, v.z); }
      }
      if (g0 !== o.geometry) g0.dispose();
      if (!tri.length) return;
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(tri, 3));
      const mm = new THREE.Mesh(g, o.material); mm.userData.src = o; out.add(mm);
    });
    out.updateMatrixWorld(true);
    return out;
  };
  // плоскость значка в точке hit. Край (0,95 r): up — насколько поверхность выступает над плоскостью (столько
  // значок пришлось бы приподнять), flat — сколько точек лежит в плоскости. Кольцо снаружи (1,6 r): block —
  // насколько рядом что-то торчит над плоскостью (заслоняет значок сбоку)
  function probe(hit, r) {
    const n = hit.n, t1 = new THREE.Vector3(), t2 = new THREE.Vector3();
    t1.set(Math.abs(n.y) > 0.9 ? 1 : 0, Math.abs(n.y) > 0.9 ? 0 : 1, 0).cross(n).normalize(); t2.crossVectors(n, t1);
    let up = 0, flat = 0, block = 0;
    for (const [k0, rr] of [[0.95, 12], [1.6, 10]]) for (let k = 0; k < rr; k++) {
      const a = k / rr * Math.PI * 2, q = hit.p.clone().addScaledVector(t1, Math.cos(a) * r * k0).addScaledVector(t2, Math.sin(a) * r * k0);
      const h = cast(q.addScaledVector(n, 0.4), n.clone().negate());
      if (!h) continue;
      const e = h.p.sub(hit.p).dot(n);
      if (k0 < 1) { up = Math.max(up, e); if (Math.abs(e) < 0.012) flat++; } else block = Math.max(block, e);
    }
    return { up, flat, block };
  }
  // upZ — верх рисунка вперёд (значок лежит), иначе вверх (значок стоит)
  const place = (grp, hit, r, upZ) => {
    const pr = probe(hit, r);
    const p = hit.p.clone().addScaledVector(hit.n, Math.max(0, pr.up) + 0.003);
    const up = upZ ? V(0, 0, 1) : V(0, 1, 0);
    up.addScaledVector(hit.n, -up.dot(hit.n)).normalize();
    return { grp, p: p.toArray(), n: hit.n.toArray(), up: up.toArray(), r, lift: pr.up, flat: pr.flat };
  };
  const fix = BADGE_FIX[def.id] || {}, out = {};
  // передний край капота: первая (спереди) точка профиля, после которой контур идёт почти горизонтально назад
  let ie = 0;
  for (let i = 0; i + 1 < g.top.length; i++) {
    const [z0, y0] = g.top[i], [z1, y1] = g.top[i + 1];
    if (z1 < z0 && Math.abs(y1 - y0) < 0.5 * (z0 - z1)) { ie = i; break; }
  }
  const edge = g.top[ie], glass = g.gh[0][0];
  {
    const f = fix.hood || {}, r = f.r || BADGE_R.hood;
    const hit = cast(V(f.x || 0, 5, f.z ?? lerp(edge[0], glass, 0.5)), V(0, -1, 0));
    if (hit) out.hood = place('body', hit, r, true);
  }
  {
    // кромка: грань профиля перед краем капота, если она смотрит вперёд и на ней хватает места
    const f = fix.lip || {};
    let hit = null, r = f.r || BADGE_R.lip, upZ = true;
    if (f.z == null && ie > 0) {
      const [z0, y0] = g.top[ie - 1], [z1, y1] = g.top[ie], len = Math.hypot(z1 - z0, y1 - y0);
      const nz = (y1 - y0) / len, ny = -(z1 - z0) / len, rr = Math.min(r, len / 2 - 0.01);
      if (nz > 0.35 && rr >= 0.055) {
        const mz = (z0 + z1) / 2, my = (y0 + y1) / 2;
        hit = cast(V(f.x || 0, my + ny * 2, mz + nz * 2), V(0, -ny, -nz));
        if (hit && hit.n.z < 0.3) hit = null;
        else { r = rr; upZ = false; }
        if (hit && probe(hit, r).up > 0.01) hit = null;      // на грани что-то торчит (решётка, фары)
      }
    }
    if (!hit) { hit = cast(V(f.x || 0, 5, f.z ?? edge[0] - r - 0.05), V(0, -1, 0)); upZ = true; }
    if (hit) out.lip = place('body', hit, r, upZ);
  }
  for (const [spot, end, sg] of [['front', 'f', 1], ['rear', 'r', -1]]) {
    const f = fix[spot] || {}, r = f.r || BADGE_R[spot], grp = m.bumpers[end], [fF, rF] = carFaces(g);
    const NOT_ON = [MAT.head, MAT.tail, MAT.amber, MAT.plate, MAT.glass, MAT.chrome];   // не на фарах, номере, хроме
    tgt = region(v => sg > 0 ? v.z > fF - 0.6 : v.z < rF + 0.6);
    let best = null;
    if (f.y != null) {
      const hit = cast(V(f.x ?? 0.45, f.y, sg * 6), V(0, 0, -sg));
      if (hit) best = { hit };
    } else {
      // сначала одни центральные лучи (дёшево), потом по порядку удобства — проверка всего круга значка; первая
      // точка, где всё хорошо, побеждает
      const box = new THREE.Box3().setFromObject(grp), mid = (box.min.y + box.max.y) / 2, cands = [];
      for (let x = 0.3; x <= g.W / 2 - r - 0.06; x += 0.03) for (let y = box.min.y; y <= box.max.y + 0.1; y += 0.02) {
        const hit = cast(V(x, y, sg * 6), V(0, 0, -sg));
        // удобство: ближе к x = 0,45 и к середине бампера по высоте, на пластике бампера — лучше, чем на кузове
        if (hit && hit.n.z * sg > 0.8 && hit.p.y > r + 0.12 && !NOT_ON.includes(hit.obj.material)) cands.push({ hit, pref: Math.abs(x - 0.45) + Math.abs(y - mid) * 0.5 - (isIn(hit.obj, grp) ? 0.05 : 0) });
      }
      cands.sort((a, b) => a.pref - b.pref);
      for (const c of cands.slice(0, 50)) {
        const pr = probe(c.hit, r), score = pr.flat * 10 - pr.up * 100 - (pr.block > 0.008 ? 60 : 0) - c.pref * 10;
        if (!best || score > best.score) best = { hit: c.hit, score };
        if (pr.flat >= 12 && pr.up < 0.004 && pr.block < 0.006) break;
      }
    }
    if (best) out[spot] = place(end, best.hit, r, false);
    tgt.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
    tgt = m.body;
  }
  disposeTree(m.root);
  return _bgAnchors[def.id] = out;
}

/* ---------- постановка на модель ---------- */
const _bgM = new THREE.Matrix4(), _bgX = new THREE.Vector3(), _bgY = new THREE.Vector3(), _bgZ = new THREE.Vector3(), _bgS = new THREE.Vector3();
function badgeMatrix(p, n, up, r) {
  _bgZ.fromArray(n); _bgY.fromArray(up); _bgX.crossVectors(_bgY, _bgZ);
  _bgM.makeBasis(_bgX, _bgY, _bgZ).scale(_bgS.set(r, r, 1));
  return _bgM.setPosition(p[0], p[1], p[2]);
}
// поставить значки на модель машины (buildCarModel): fit — { место: определение значка } (fitOf() в js/data.js);
// inShow — модель витрины гаража (свой ореол). Прежние значки модели снимаются — можно звать при каждой смене
function fitBadges(model, def, fit, inShow = false) {
  for (const o of model.badges || []) { o.removeFromParent(); o.geometry.dispose(); }
  model.badges = [];
  const A = badgeAnchors(def), g = def.geo, per = new Map();
  const add = (parent, b, mtx) => {
    let e = per.get(parent);
    if (!e) per.set(parent, e = { geos: [], halos: [] });
    e.geos.push(badgeGeo(b).applyMatrix4(mtx));
    e.halos.push(haloGeo(b).applyMatrix4(mtx));
  };
  for (const [spot] of BADGE_SPOTS) {
    const b = fit[spot];
    if (!b) continue;
    if (spot === 'wheels') {
      // на ступице, снаружи диска: значок — ребёнок вращающейся части колеса
      for (const w of model.wheels) {
        const side = Math.sign(w.pivot.position.x) || 1, x = side * (g.ww / 2 + (g.steelRim ? 0.06 : 0.03));
        add(w.spin, b, badgeMatrix([x, 0, 0], [side, 0, 0], [0, 1, 0], w.r * 0.4));
      }
      continue;
    }
    const a = A[spot];
    if (!a) continue;
    const parent = a.grp === 'body' || !model.bumpers ? model.body : model.bumpers[a.grp];
    add(parent, b, badgeMatrix(a.p, a.n, a.up, a.r));
  }
  for (const [parent, e] of per) {
    for (const [list, mat] of [[e.geos, BADGE_MAT], [e.halos, BADGE_HALO[inShow ? 1 : 0]]]) {
      const geo = list.length === 1 ? list[0] : mergeGeometries(list);
      if (list.length > 1) for (const x of list) x.dispose();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData.badge = true; mesh.userData.keep = true;
      if (mat !== BADGE_MAT) mesh.renderOrder = 2;
      parent.add(mesh); model.badges.push(mesh);
    }
  }
}

/* ---------- интерфейс ---------- */
// значок картинкой для гаража и подсказок (тот же рисунок, что на машине)
function badgeSVG(def, px = 22) {
  const hex = h => '#' + h.toString(16).padStart(6, '0');
  const grads = def.pic.map((s, i) => `<linearGradient id="bg-${def.id}-${i}" gradientUnits="userSpaceOnUse" x1="0" y1="0.7" x2="0" y2="-0.7">` +
    `<stop offset="0" stop-color="${hex(s.c[0])}"/><stop offset="1" stop-color="${hex(s.c[1])}"/></linearGradient>`).join('');
  const polys = def.pic.map((s, i) => `<polygon points="${s.pts.map(q => q.join(',')).join(' ')}" fill="url(#bg-${def.id}-${i})"/>`).join('');
  return `<svg class="badge" viewBox="-1 -1 2 2" width="${px}" height="${px}"><defs>${grads}</defs><circle r="1" fill="${hex(BADGE_PLATE)}"/>` +
    `<circle r="0.895" fill="none" stroke="${hex(def.rim)}" stroke-width="0.15"/><g transform="scale(1,-1)">${polys}</g></svg>`;
}
// игрок p выполнил условие значка id (js/jumps.js, js/race.js): открыть, сохранить, сообщить
function unlockBadge(p, id) {
  const pl = save.players[p];
  if (!pl || !badgeGive(pl, id)) return false;
  persist();
  notify(p, `НОВЫЙ ЗНАЧОК «${badgeDef(id).name}»! Поставьте его на машину в гараже`, 'gold');
  return true;
}
// места считаются лучами по модели (до ~0,5 с на машину) — заранее, по машине в свободное время после загрузки,
// чтобы гараж и старт заезда не подтормаживали
{
  const idle = window.requestIdleCallback || (f => setTimeout(f, 200));
  let i = 0;
  const next = () => { if (i < CARS.length) { badgeAnchors(CARS[i++]); idle(next); } };
  setTimeout(() => idle(next), 3000);
}
