// Ситжес — ПОДПИСИ НАД ДОМАМИ (отладка стиля города): адрес кадастра и сведения о здании мелким текстом над крышей.
//   Включаются настройкой «Адреса домов» на экране режима или клавишей L в заезде (save.addr). Пока выключены —
//   ничего не строится и не рисуется; отпечаток мира от них не зависит.
//   Подписываются здания в радиусе SITGES_LABEL.r от машин (не больше SITGES_LABEL.n), список — раз в SITGES_LABEL.tick с.
//   Строка 1 — улица и номера (у углового дома — несколько улиц), без адреса — название из OSM;
//   строка 2 (только при SITGES_LABEL.info) — номер здания в данных (#), этажность частей, год постройки, назначение
//     по кадастру, тип или название OSM. По просьбе пользователя выключена: на экране — только улица и номер.
//   Подпись — спрайт постоянного размера на экране (sizeAttenuation: false), за домами прячется (проверка глубины).
//   Стоит над входом первого адреса (точка кадастра на линии фасада), чуть наружу от дома, над крышей той части,
//   что у входа: над серединой крыши её с улицы закрывает собственный фасад. Без адреса — над центром здания.
// Определяет: SITGES_LABEL, SITGES_USE_RU, sitgesLabels.
// Использует: save (js/data.js); SITGES_ADR (js/maps/sitges/data-addr.js); sitgesDec (js/maps/sitges/plan.js); cars
//   (js/physics.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const SITGES_LABEL = {
  r: 70,          // радиус подписей вокруг машин, м
  fade: 25,       // последние столько метров радиуса подпись тает
  n: 48,          // подписей сразу, не больше
  tick: 0.2,      // пересчёт списка, с
  lift: 0.6,      // над крышей, м
  out: 1.2,       // от входа наружу (от центра здания), м
  px: 0.0007,     // размер: единиц спрайта на пиксель холста (при угле обзора 62° адрес ≈ 18 пикс. на экране 1080)
  cache: 200,     // готовых текстур подписей в памяти
  info: false,    // вторая строка со сведениями о здании (этажи, год, назначение) — для отладки, по умолчанию скрыта
};
const SITGES_USE_RU = { '1_residential': 'жильё', '2_agriculture': 'с/х', '3_industrial': 'пром.', '4_1_office': 'офисы',
  '4_2_retail': 'торговля', '4_3_publicServices': 'общественное' };

// C — раскладка карты (C.blds, C.houses), group — группа мира. Возвращает { update(t) } — звать каждый кадр.
function sitgesLabels(C, group) {
  const L = SITGES_LABEL;
  let ready = false, root = null, info = null, cells = null, pool = [], lastT = -1;
  const cache = new Map();   // номер здания → { tex, w, h }

  // адреса по зданиям: { text: «C/ Aigua 12, 14 · Pl. Industria 3», x, z — вход первого адреса } или null
  function addresses() {
    const m = sitgesDec(SITGES_ADR.m), out = [];
    const num = v => v ? (v >> 5) + (v & 31 ? String.fromCharCode(64 + (v & 31)) : '') : 's/n';
    for (let i = 0; i < m.length;) {
      const ns = m[i++], parts = [];
      for (let s = 0; s < ns; s++) {
        const st = SITGES_ADR.streets[m[i] - 1], k = m[i + 1], v = m.slice(i + 2, i + 2 + k);
        i += 2 + k;
        parts.push(st + ' ' + (v.length > 3 ? num(v[0]) + '–' + num(v[v.length - 1]) : v.map(num).join(', ')));
      }
      out.push(ns ? { text: parts.join(' · '), x: m[i] / 10, z: m[i + 1] / 10 } : null);
      if (ns) i += 2;
    }
    return out;
  }

  function prepare() {
    ready = true;
    const adr = addresses();
    // центр частей, взвешенный по площади, самая высокая крыша, этажность
    info = C.blds.map((b, bi) => ({ bi, b, adr: adr[bi] ? adr[bi].text : '', x: 0, z: 0, a: 0, y: -Infinity, f0: 99, f1: 0 }));
    for (const h of C.houses) {
      const I = info[h.bi], [cx, cz, a] = ringCentroid(h.rings[0]);
      I.x += cx * a; I.z += cz * a; I.a += a;
      I.y = Math.max(I.y, h.y1);
      I.f0 = Math.min(I.f0, h.p.floors); I.f1 = Math.max(I.f1, h.p.floors);
    }
    cells = new Map();
    for (const I of info) {
      if (!I.a) continue;
      I.x /= I.a; I.z /= I.a;
      // над входом: крыша части на шаг внутрь от входа (вход лежит на самой стене — может не попасть в контур)
      const e = adr[I.bi];
      if (e) {
        const dx = e.x - I.x, dz = e.z - I.z, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d;
        const h = C.houseAt(e.x - ux, e.z - uz) || C.houseAt(e.x, e.z);
        if (h && h.bi === I.bi) I.y = h.y1;
        I.x = e.x + ux * L.out; I.z = e.z + uz * L.out;
      }
      const key = Math.floor(I.x / 40) + ',' + Math.floor(I.z / 40);
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(I);
    }
    root = new THREE.Group();
    root.userData.dynamic = true;
    group.add(root);
    for (let i = 0; i < L.n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, fog: false, sizeAttenuation: false }));
      s.center.set(0.5, 0);
      s.renderOrder = 10;
      s.visible = false;
      s.userData.bi = -1;
      root.add(s);
      pool.push(s);
    }
  }

  // центр и площадь кольца (площадь — по модулю, направление обхода не важно)
  function ringCentroid(r) {
    let a = 0, cx = 0, cz = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const c = r[j][0] * r[i][1] - r[i][0] * r[j][1];
      a += c; cx += (r[j][0] + r[i][0]) * c; cz += (r[j][1] + r[i][1]) * c;
    }
    if (Math.abs(a) < 1e-6) return [r[0][0], r[0][1], 1e-3];
    return [cx / (3 * a), cz / (3 * a), Math.abs(a) / 2];
  }

  // текстура подписи: тёмная полупрозрачная плашка, адрес светлым, сведения (если L.info) — серее и мельче
  function label(I) {
    let e = cache.get(I.bi);
    if (e) { cache.delete(I.bi); cache.set(I.bi, e); return e; }
    const b = I.b, osm = b.name || b.type;
    const l1 = I.adr || b.name || 'без адреса';
    const l2 = !L.info ? '' : ['#' + I.bi, (I.f0 === I.f1 ? I.f1 : I.f0 + '–' + I.f1) + ' эт.', b.year || '', SITGES_USE_RU[b.use] || b.use,
      osm && osm !== l1 ? osm : ''].filter(Boolean).join(' · ');
    const cv = document.createElement('canvas'), g = cv.getContext('2d');
    const F1 = '600 28px system-ui, sans-serif', F2 = '20px system-ui, sans-serif', pad = 8;
    g.font = F1; const w1 = g.measureText(l1).width;
    g.font = F2; const w2 = l2 ? g.measureText(l2).width : 0;
    cv.width = Math.ceil(Math.max(w1, w2) + pad * 2); cv.height = 28 + (l2 ? 26 : 0) + pad * 2;
    g.fillStyle = 'rgba(16, 20, 26, 0.72)';
    g.beginPath(); g.roundRect(0, 0, cv.width, cv.height, 8); g.fill();
    g.textBaseline = 'top'; g.textAlign = 'center';
    g.font = F1; g.fillStyle = '#f2f4f7'; g.fillText(l1, cv.width / 2, pad);
    if (l2) { g.font = F2; g.fillStyle = '#b8c0cc'; g.fillText(l2, cv.width / 2, pad + 32); }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    e = { tex, w: cv.width, h: cv.height };
    cache.set(I.bi, e);
    // старые текстуры — вон (кроме тех, что сейчас на спрайтах)
    if (cache.size > L.cache) {
      const used = new Set(pool.map(s => s.userData.bi));
      for (const [k, v] of cache) { if (cache.size <= L.cache) break; if (!used.has(k)) { v.tex.dispose(); cache.delete(k); } }
    }
    return e;
  }

  function refresh() {
    const near = new Map();   // здание → расстояние до ближайшей машины
    for (const c of cars) {
      const i0 = Math.floor((c.x - L.r) / 40), i1 = Math.floor((c.x + L.r) / 40);
      const j0 = Math.floor((c.z - L.r) / 40), j1 = Math.floor((c.z + L.r) / 40);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (const I of cells.get(i + ',' + j) || []) {
        const d = Math.hypot(I.x - c.x, I.z - c.z);
        if (d < L.r && !(near.get(I) <= d)) near.set(I, d);
      }
    }
    const pick = [...near].sort((a, b) => a[1] - b[1]).slice(0, L.n);
    const want = new Map(pick.map(([I, d]) => [I.bi, [I, d]]));
    // спрайт с тем же зданием остаётся на месте; свободные — новым зданиям
    const free = [];
    for (const s of pool) { if (want.has(s.userData.bi)) continue; s.visible = false; s.userData.bi = -1; free.push(s); }
    const shown = new Set(pool.map(s => s.userData.bi));
    for (const [bi, [I]] of want) {
      if (shown.has(bi)) continue;
      const s = free.pop(); if (!s) break;
      const e = label(I);
      s.material.map = e.tex; s.material.needsUpdate = true;
      s.scale.set(e.w * L.px, e.h * L.px, 1);
      s.position.set(I.x, I.y + L.lift, I.z);
      s.userData.bi = bi; s.visible = true;
    }
    for (const s of pool) if (s.visible) s.material.opacity = Math.min(1, (L.r - want.get(s.userData.bi)[1]) / L.fade);
  }

  return {
    update(t) {
      if (!save.addr) { if (root) root.visible = false; return; }
      if (!ready) prepare();
      root.visible = true;
      if (lastT >= 0 && t - lastT < L.tick && t >= lastT) return;
      lastT = t;
      refresh();
    },
  };
}
