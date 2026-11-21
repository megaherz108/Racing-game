// Ситжес — РАСКЛАДКА: крыши частей зданий (этап 4). Тип и цвет — из данных (SITGES_ROOF: лидар и ортофото ICGC,
// tools/sitges/read-roofs.js); здесь — форма. Вызывается из js/maps/sitges/houses.js сразу после высот частей,
// до общих стен: у скатной крыши верх стен — карниз (крыша − парапет), соседи считают закрытым именно его.
//   flat  — плоская: настил ниже верха стены на парапет, изнутри — грань парапета; на больших — будка лестницы;
//   gable / hip / shed — почти прямоугольная часть (площадь / прямоугольник охвата ≥ fill): двускатная, вальмовая
//     или односкатная по рамке { cx, cz, ux, uz, a, b } (оси u — вдоль конька, v — поперёк, полудлины a ≥ … и b);
//   inset — скатная со сложным контуром: полоса скатов от свеса до контура, отступившего внутрь на d (ring), сверху —
//     плоская площадка (как вальма с террасой); не вышло — плоская цвета черепицы.
// h.roof = { kind, col: THREE.Color (sRGB → линейный), tile, eave, ridge, … }; h.top — верх крыши (подписи, камера).
// Определяет: SITGES_ROOFS, sitgesInset, sitgesRoofFrame, sitgesRoofPlan.
// Использует: sitgesArea, sitgesBBox, sitgesInPoly, sitgesSeg (js/maps/sitges/geom.js); SITGES_FLOOR
//   (js/maps/sitges/plan.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

const SITGES_ROOFS = {
  slope: 0.32,          // уклон скатов (≈ 18°, испанская черепица)
  shed: 0.18,           // уклон односкатной
  fill: 0.85,           // площадь контура / площадь рамки — не меньше: строим по рамке
  insetD: [3.0, 2.0, 1.2], // отступ полосы скатов у сложного контура, м (пробуем по очереди)
  parapetA: 50,         // плоская крыша с парапетом (настил ниже верха стены) — от такой площади, м²
  hut: { area: 80, floors: 3, size: 2.6, h: 2.5, edge: 2.2 },   // будка лестницы на плоской крыше
  flatCol: 0xb9b2a6,    // плоская крыша без данных
  tileCol: 0xb45c3c,    // черепица без данных
  tileSat: 0.12, tileDark: 0.04,   // поправка цвета черепицы из ортофото (HSL)
  albedo: 0.6,          // цвет крыши по ортофото → цвет материала (линейный множитель)
};

// контур, отступивший на d (d > 0 — внутрь, против часовой в осях x, z; d < 0 — наружу); null — если вывернулся
function sitgesInset(r, d) {
  const n = r.length, lines = [];
  for (let i = 0; i < n; i++) {
    const [ax, az] = r[i], [bx, bz] = r[(i + 1) % n], L = Math.hypot(bx - ax, bz - az);
    // внутренняя нормаль при обходе против часовой (x, z): (−uz, ux)
    const ux = (bx - ax) / L, uz = (bz - az) / L, nx = -uz, nz = ux;
    lines.push({ px: ax + nx * d, pz: az + nz * d, ux, uz });
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = lines[(i + n - 1) % n], q = lines[i], den = p.ux * q.uz - p.uz * q.ux;
    if (Math.abs(den) < 0.05) out.push([q.px, q.pz]);          // почти прямая — точка на линии
    else {
      const t = ((q.px - p.px) * q.uz - (q.pz - p.pz) * q.ux) / den;
      out.push([p.px + p.ux * t, p.pz + p.uz * t]);
    }
  }
  // проверка: рёбра не развернулись, нет самопересечений, точки не улетели (острые углы)
  for (let i = 0; i < n; i++) {
    const [ax, az] = out[i], [bx, bz] = out[(i + 1) % n];
    if ((bx - ax) * lines[i].ux + (bz - az) * lines[i].uz <= 0.05) return null;
    const [ox, oz] = r[i];
    if (Math.hypot(ax - ox, az - oz) > Math.abs(d) * 4 + 0.5) return null;
  }
  const cross = (a, b, c, e) => {
    const d1 = (e[0] - c[0]) * (a[1] - c[1]) - (e[1] - c[1]) * (a[0] - c[0]), d2 = (e[0] - c[0]) * (b[1] - c[1]) - (e[1] - c[1]) * (b[0] - c[0]);
    const d3 = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]), d4 = (b[0] - a[0]) * (e[1] - a[1]) - (b[1] - a[1]) * (e[0] - a[0]);
    return d1 * d2 < 0 && d3 * d4 < 0;
  };
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;
    if (cross(out[i], out[(i + 1) % n], out[j], out[(j + 1) % n])) return null;
  }
  return out;
}

// рамка контура в осях угла ang (рад): центр, оси, полудлины, доля заполнения
function sitgesRoofFrame(r, ang, area) {
  const ux = Math.cos(ang), uz = Math.sin(ang);
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const [x, z] of r) { const u = x * ux + z * uz, v = -x * uz + z * ux; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
  const um = (u0 + u1) / 2, vm = (v0 + v1) / 2;
  return { cx: um * ux - vm * uz, cz: um * uz + vm * ux, ux, uz, a: (u1 - u0) / 2, b: (v1 - v0) / 2, fill: area / ((u1 - u0) * (v1 - v0)) };
}

// форма крыши части h (после высот: h.y1 — верх стены с парапетом); меняет h.y1 у скатных — до карниза
function sitgesRoofPlan(h, k) {
  const P = SITGES_ROOFS, F = SITGES_FLOOR, D = h.p.roof, r = h.rings[0];
  const col = new THREE.Color();
  let type = D ? D.type : 0;
  // ортофото — снимок под солнцем: его цвет светлее самого материала, в линейном пространстве — множитель albedo
  if (D && type) col.setRGB(D.col[0], D.col[1], D.col[2], THREE.SRGBColorSpace).multiplyScalar(P.albedo);
  else col.setHex(type === 5 ? P.tileCol : P.flatCol);
  const area = Math.abs(sitgesArea(r));
  const flat = () => {
    // настил ниже верха стены на парапет — у частей от parapetA м² (у маленьких грани парапета — лишние треугольники)
    const roof = { kind: 'flat', col, tile: type >= 2, deck: area >= P.parapetA ? h.y1 - F.parapet + 0.08 : h.y1 };
    // будка лестницы: у больших частей от 3 этажей, в центре рамки, если он внутри и далеко от стен
    const H = P.hut;
    if (!h.pass && h.p.floors >= H.floors && area >= H.area && h.rings.length === 1) {
      const bb = sitgesBBox(r), x = (bb[0] + bb[1]) / 2, z = (bb[2] + bb[3]) / 2;
      const inside = sitgesInPoly(x, z, r) && r.every(([ax, az], i) => { const [bx, bz] = r[(i + 1) % r.length]; return sitgesSeg(x, z, ax, az, bx, bz) > H.edge; });
      if (inside) {
        // стороны будки — вдоль самого длинного ребра; номер части — чтобы будки были чуть разные
        let best = 0, ang = 0;
        r.forEach(([ax, az], i) => { const [bx, bz] = r[(i + 1) % r.length], L = Math.hypot(bx - ax, bz - az); if (L > best) { best = L; ang = Math.atan2(bz - az, bx - ax); } });
        const s = H.size * (0.85 + (k * 37 % 10) / 30);
        roof.hut = { x, z, ang, a: s / 2, b: s * 0.6, y0: roof.deck, y1: roof.deck + H.h };
      }
    }
    h.top = h.y1;
    return roof;
  };
  if (h.pass || type <= 1) return flat();
  // скатная: стены — до карниза
  const eave = h.y1 - F.parapet;
  let roof = null;
  if (h.rings.length === 1) {
    const box = D ? sitgesRoofFrame(r, D.ang * Math.PI / 180, area) : null;
    let fr = box && box.fill >= P.fill ? box : null;
    if (!fr) {
      // рамка наименьшей площади (по направлениям рёбер)
      let best = null;
      r.forEach(([ax, az], i) => { const [bx, bz] = r[(i + 1) % r.length]; const f = sitgesRoofFrame(r, Math.atan2(bz - az, bx - ax), area); if (!best || f.fill > best.fill) best = f; });
      if (best.fill >= P.fill) fr = best;
    }
    if (fr) {
      let kind = type === 2 ? 'gable' : type === 4 ? 'shed' : 'hip';
      // у вальмовой конёк — вдоль длинной стороны
      if (kind !== 'gable' && fr.b > fr.a) fr = { ...fr, ux: -fr.uz, uz: fr.ux, a: fr.b, b: fr.a };
      // у односкатной: вниз по скату — в сторону −v (из данных — направление ската)
      if (kind === 'shed' && D) {
        const dx = Math.cos(D.ang * Math.PI / 180), dz = Math.sin(D.ang * Math.PI / 180);
        const vx = -fr.uz, vz = fr.ux;
        if (dx * vx + dz * vz > 0) fr = { ...fr, ux: -fr.ux, uz: -fr.uz };
      }
      const s = kind === 'shed' ? P.shed : P.slope;
      roof = { kind, ...fr, s, eave, ridge: eave + (kind === 'shed' ? 2 * fr.b : fr.b) * s };
    }
  }
  if (!roof) {
    for (const d of P.insetD) {
      const ring = sitgesInset(r, d);
      if (ring) { roof = { kind: 'inset', ring, d, s: P.slope, eave, ridge: eave + d * P.slope }; break; }
    }
  }
  if (!roof) return flat();
  // черепица на ортофото бледнее, чем вблизи (дымка, пересвет сверху): насыщенность выше, тон чуть темнее
  roof.col = D && type ? col.offsetHSL(0, P.tileSat, -P.tileDark) : col; roof.tile = true;
  h.y1 = eave;
  h.top = roof.ridge;
  return roof;
}
