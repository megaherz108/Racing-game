// Побережье — РАСКЛАДКА: дома (после дорог — нужны вдавленный рельеф и roadAt). Деревня: дома вдоль улочек,
// кольца и серпантина у пьяццы — фасадом к улице, с небольшим разворотом; ширина, глубина, этажность и цвет у каждого
// свои, к центру дома выше и теснее; между улицами — дома во дворах. За деревней — редкие фермы у гравийных дорог
// и тропинок, у порта — несколько рыбацких домов. Пересечения проверяются по повёрнутым прямоугольникам.
// Дом: { x, z, w (вдоль улицы), d, rot, base, wallH, color, roofColor, hip, chimney }.
// Определяет: coastPlanVillage.
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

function coastPlanVillage(C) {
  const { rng, ground, waterAt, roads, roadAt, pads, church, SITES, winery } = C;
  const R = (a, b) => a + (b - a) * rng(), pick = a => a[Math.floor(rng() * a.length)];
  const [px, pz] = SITES.piazza;
  const WALL = [0xc8693f, 0xe0b44c, 0xc99245, 0xe8d3a8, 0xd98f72, 0xdcae6a, 0xb5603a, 0xefd9b5, 0xd7a35c, 0xe6c38a];
  const ROOF = [0xb0502c, 0xa8482a, 0xbd5c33, 0x9c4a2e, 0xb8613a];
  const corners = h => { const c = Math.cos(h.rot), s = Math.sin(h.rot); return [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, b]) => [h.x + a * h.w / 2 * c + b * h.d / 2 * s, h.z - a * h.w / 2 * s + b * h.d / 2 * c]); };
  const axes = h => { const c = Math.cos(h.rot), s = Math.sin(h.rot); return [[c, -s], [s, c]]; };
  const overlap = (A, B, gap) => {
    const ca = corners(A), cb = corners(B);
    for (const [ax, az] of [...axes(A), ...axes(B)]) {
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (const [x, z] of ca) { const v = x * ax + z * az; a0 = Math.min(a0, v); a1 = Math.max(a1, v); }
      for (const [x, z] of cb) { const v = x * ax + z * az; b0 = Math.min(b0, v); b1 = Math.max(b1, v); }
      if (a1 + gap < b0 || b1 + gap < a0) return false;
    }
    return true;
  };
  const houses = [], hash = new Map(), CELL = 24, key = (x, z) => Math.floor(x / CELL) * 4096 + Math.floor(z / CELL);
  const blockers = [{ x: church.x, z: church.z, w: church.w + 3, d: church.d + 10, rot: church.rot }, ...winery.blds];
  const fits = (h, gap) => {
    const cs = corners(h), mids = cs.map(([x, z], i) => [(x + cs[(i + 1) % 4][0]) / 2, (z + cs[(i + 1) % 4][1]) / 2]);
    for (const [x, z] of [...cs, ...mids, [h.x, h.z]]) {
      if (Math.abs(x) > 485 || Math.abs(z) > 725 || roadAt(x, z) || ground(x, z) < waterAt(x, z) + 0.6) return false;
    }
    const gs = cs.map(([x, z]) => ground(x, z)), lo = Math.min(...gs), hi = Math.max(...gs);
    if (hi - lo > 5) return false;                       // на склоне — цоколь, но не на обрыве
    for (const pd of pads) if (Math.hypot(h.x - pd.x, h.z - pd.z) < pd.r + Math.hypot(h.w, h.d) / 2 + 1) return false;
    if (blockers.some(b => overlap(h, b, 1))) return false;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const o of hash.get(key(h.x + a * CELL, h.z + b * CELL)) || []) if (overlap(h, o, gap)) return false;
    h.base = lo - 0.4; h.lo = lo; h.hi = hi;
    return true;
  };
  const add = (h, floors) => {
    h.wallH = h.hi - h.base + floors * 3.1 + 0.3;
    h.color = pick(WALL); h.roofColor = pick(ROOF); h.hip = rng() < 0.3; h.chimney = rng() < 0.45;
    houses.push(h);
    const k = key(h.x, h.z); let a = hash.get(k); if (!a) hash.set(k, a = []); a.push(h);
  };

  /* ---------- деревня: дома вдоль улиц ---------- */
  const VR = 165;                                       // радиус деревни от пьяццы
  for (const r of roads) {
    if (!(r.kind === 'cobble' || r.id === 'ring' || r.id === 'serp' || r.id === 'villN' || r.id === 'wineLink' || r.id === 'amphLink')) continue;
    for (const side of [1, -1]) {
      let s = R(0, 6);
      for (let guard = 0; guard < 400; guard++) {
        const i = Math.round(s / 2); if (i >= r.N) break;
        const p = r.pts[i], dv = Math.hypot(p.x - px, p.z - pz);
        const w = R(6, 11), d = R(7, 12.5);
        s += w + R(0.4, dv < 70 ? 1.6 : 4.5);
        if (dv > VR || rng() > (dv < 80 ? 0.97 : dv < 130 ? 0.85 : 0.55)) continue;
        const set = r.core + R(0.4, r.kind === 'cobble' ? 1.2 : 2.5) + d / 2;
        const h = { x: p.x + p.nx * set * side, z: p.z + p.nz * set * side, w, d, rot: Math.atan2(-p.tz, p.tx) + R(-0.07, 0.07) };
        if (fits(h, 0.35)) add(h, dv < 60 ? (rng() < 0.6 ? 3 : 2) : dv < 115 ? 1 + Math.floor(R(0, 2.6)) : 1 + Math.floor(R(0, 1.8)));
      }
    }
  }
  // дома во дворах между улицами: развёрнуты как ближайшая улица, но с бо́льшим разбросом
  for (let t = 0; t < 2600; t++) {
    const a = R(0, Math.PI * 2), rr = 22 + Math.sqrt(rng()) * (VR - 30), x = px + Math.cos(a) * rr, z = pz + Math.sin(a) * rr;
    let best = null, bd = 1e9;
    for (const r of roads) if (r.kind === 'cobble' || r.id === 'ring') for (let i = 0; i < r.N; i += 3) { const q = r.pts[i], d2 = (q.x - x) ** 2 + (q.z - z) ** 2; if (d2 < bd) { bd = d2; best = q; } }
    const rot = (best ? Math.atan2(-best.tz, best.tx) : 0) + R(-0.25, 0.25) + (rng() < 0.3 ? Math.PI / 2 : 0);
    const h = { x, z, w: R(6, 10), d: R(6.5, 11), rot };
    if (fits(h, 0.8)) add(h, rr < 70 ? 2 + (rng() < 0.4 ? 1 : 0) : 1 + Math.floor(R(0, 1.8)));
  }

  /* ---------- фермы у дорог за деревней и рыбацкие дома у порта ---------- */
  let farms = 0;
  for (let t = 0; t < 2000 && farms < 22; t++) {
    const r = pick(roads); if (r.kind === 'asphalt' && rng() < 0.5) continue;
    const p = r.pts[Math.floor(rng() * r.N)];
    if (Math.hypot(p.x - px, p.z - pz) < VR + 50 || p.span) continue;
    if (houses.some(o => Math.hypot(o.x - p.x, o.z - p.z) < 110)) continue;
    const side = rng() < 0.5 ? 1 : -1, w = R(9, 14), d = R(8, 12), set = r.core + R(3, 9) + d / 2;
    const h = { x: p.x + p.nx * set * side, z: p.z + p.nz * set * side, w, d, rot: Math.atan2(-p.tz, p.tx) + R(-0.3, 0.3) };
    if (fits(h, 2)) { add(h, rng() < 0.6 ? 2 : 1); farms++;
      // при ферме — сарай под углом
      const sg = rng() < 0.5 ? 1 : -1, off = (w / 2 + 6) * sg;
      const b = { x: h.x + Math.cos(h.rot) * off, z: h.z - Math.sin(h.rot) * off, w: R(5, 8), d: R(4, 6), rot: h.rot + R(-0.4, 0.4) + Math.PI / 2 };
      if (fits(b, 1)) add(b, 1);
    }
  }
  for (let t = 0; t < 300; t++) {
    if (houses.filter(h => h.fisher).length >= 7) break;
    const x = R(-30, 110), z = R(-600, -570), h = { x, z, w: R(5.5, 8), d: R(6, 8), rot: R(-0.2, 0.2) + (rng() < 0.3 ? Math.PI / 2 : 0), fisher: true };
    if (fits(h, 2.5)) add(h, rng() < 0.5 ? 2 : 1);
  }
  Object.assign(C, { houses });
}
