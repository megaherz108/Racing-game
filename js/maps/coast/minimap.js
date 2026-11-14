// Побережье — РАСКЛАДКА: мини-карта. Рельеф с отмывкой (свет с северо-запада), море и река, пляж и остров, скалы
// на крутых склонах; горы за краем карты — фоном. Последний этап раскладки (coastData() в js/maps/coast/plan.js).
// Определяет: coastPlanMinimap.
// Использует: clamp, lerp (js/core.js); mmCanvas, smooth01 (js/world.js); ellMetric (js/maps/coast/terrain.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

function coastPlanMinimap(C) {
  const { HX, HZ, ground, waterAt, ZC, cellI, island } = C;
  const EXT = HZ, S = 1024, m = mmCanvas(EXT, S), ctx = m.ctx;
  const img = ctx.createImageData(S, S), d = img.data;
  const MOUNT = [128, 118, 104], SEA = [52, 112, 160], RIVER = [70, 132, 176], SAND = [222, 204, 150];
  for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
    const [x, z] = m.world(px, py), o = (py * S + px) * 4;
    let c;
    if (Math.abs(x) > HX + 4 || z > HZ + 4) c = MOUNT;
    else {
      const h = ground(x, z), wl = waterAt(x, z);
      if (h < wl - 0.05) c = wl > 0.5 ? RIVER : SEA;
      else {
        const sx = ground(x + 3, z) - ground(x - 3, z), sz = ground(x, z + 3) - ground(x, z - 3);
        const slope = Math.hypot(sx, sz) / 6, sand = z - ZC[cellI(x)] < 24 || ellMetric(island, x, z) < 0.95 || (wl > 0.5 && h < wl + 0.9);
        const t = clamp(h / 70, 0, 1);
        c = sand ? SAND : [lerp(120, 168, t), lerp(146, 150, t), lerp(70, 96, t)];
        if (slope > 0.55) c = c.map((v, k) => lerp(v, MOUNT[k], smooth01((slope - 0.55) / 0.5)));
        // отмывка: склоны к северо-западу (+X, +Z) светлее
        const sh = clamp(1 + (sx * 0.5 + sz * 0.5) * 0.09, 0.62, 1.32);
        c = c.map(v => clamp(v * sh, 0, 255));
      }
    }
    d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // дороги: сначала тропы, сверху гравий и брусчатка, асфальт — с обочинами
  ctx.lineJoin = ctx.lineCap = 'round';
  const line = (r, color, w) => {
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.3, w * m.sc);
    ctx.beginPath(); r.pts.forEach((p, i) => i ? ctx.lineTo(m.X(p.x), m.Z(p.z)) : ctx.moveTo(m.X(p.x), m.Z(p.z)));
    if (r.closed) ctx.closePath(); ctx.stroke();
  };
  const STYLE = { dirt: ['#94714a'], gravel: ['#dccb9f'], cobble: ['#b9a690'], asphalt: ['#4d4b48', '#b89c70'] };
  for (const kind of ['dirt', 'gravel', 'cobble', 'asphalt']) for (const r of C.roads) if (r.kind === kind) {
    const [c0, c1] = STYLE[kind];
    if (c1) line(r, c1, r.w + 2 * r.sh);
    line(r, c0, r.w);
  }
  // деревья (лес, кипарисы, оливы) и шпалеры виноградников — точками
  const dots = (list, color, r) => { ctx.fillStyle = color; for (const t of list) ctx.fillRect(m.X(t.x) - r, m.Z(t.z) - r, 2 * r, 2 * r); };
  dots(C.vines, 'rgba(84,104,44,.8)', 0.6); dots(C.olives, 'rgba(110,122,82,.95)', 1.1);
  dots(C.pines, 'rgba(38,66,32,.9)', 1.5); dots(C.firs, 'rgba(30,54,30,.9)', 1.3); dots(C.cypress, 'rgba(24,46,22,.95)', 0.9);
  // площадки, пирс и причал, дома (черепица), церковь
  ctx.fillStyle = '#c9bba0';
  for (const pd of C.pads) { ctx.beginPath(); ctx.arc(m.X(pd.x), m.Z(pd.z), pd.r * m.sc, 0, Math.PI * 2); ctx.fill(); }
  const quad = (x, z, w, d, rot) => {
    const c = Math.cos(rot), s = Math.sin(rot);
    ctx.beginPath();
    [[1, 1], [1, -1], [-1, -1], [-1, 1]].forEach(([a, b], i) => { const X = m.X(x + a * w / 2 * c + b * d / 2 * s), Z = m.Z(z - a * w / 2 * s + b * d / 2 * c); i ? ctx.lineTo(X, Z) : ctx.moveTo(X, Z); });
    ctx.closePath(); ctx.fill();
  };
  ctx.fillStyle = '#bdb8ae';
  for (const p of [C.pier, C.jetty]) quad(p.x, (p.z0 + p.z1) / 2, p.w, Math.abs(p.z1 - p.z0), 0);
  ctx.fillStyle = '#9a4a30';
  for (const h of C.houses) quad(h.x, h.z, h.w, h.d, h.rot);
  for (const b of C.winery.blds) quad(b.x, b.z, b.w, b.d, b.rot);
  ctx.fillStyle = '#e2d3b0'; quad(C.church.x, C.church.z, C.church.w, C.church.d, C.church.rot);
  // зоны захвата на карте не рисуются: в режиме «Захват точек» видна только активная (js/capture.js)
  Object.assign(C, { mm: m, minimap: m.c, mmExt: EXT, mmBg: '#80766a' });
}
