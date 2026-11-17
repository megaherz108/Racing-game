// Ситжес — РАСКЛАДКА: мини-карта. Суша с лёгкой отмывкой рельефа, море, пляжи, парки, ж/д, улицы по классам,
// контуры зданий (темнее — выше). За границей игровой области — притенено, граница — пунктиром.
// Эта же картинка — текстура плоской земли на этапе 0 (js/maps/sitges/build.js). Последний этап раскладки.
// Определяет: SITGES_MM, sitgesPlanMinimap.
// Использует: clamp (js/core.js); mmCanvas (js/world.js); SITGES_GEO (js/maps/sitges/data-geo.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

// масштаб (пикселей на метр) и цвета мини-карты
const SITGES_MM = {
  ppm: 0.8,
  land: [214, 206, 188], sea: '#3d7cab',
  area: {
    beach: '#e9d9a6', sand: '#e9d9a6', park: '#a3c27f', garden: '#a3c27f', grass: '#aac684', golf: '#93c06b',
    playground: '#b9cf8c', pitch: '#8db86a', wood: '#7aa05e', scrub: '#93ad70', farmland: '#cfc98f', cemetery: '#aab59c',
    water: '#5b9fcf', pool: '#6fc0e6', rock: '#aaa194', railway: '#c4b8aa', pier: '#bdb7aa', breakwater: '#a9a398', quay: '#bdb7aa',
  },
  // улицы: [ширина, м; цвет]; обводка (тротуар, бордюр) — у проезжих
  road: {
    motorway: [14, '#7a6a52'], trunk: [12, '#7a6a52'], primary: [11, '#7d705c'], secondary: [10, '#766d60'], tertiary: [8.5, '#6a6761'],
    unclassified: [6.5, '#6a6761'], residential: [6.5, '#6a6761'], living_street: [5, '#86817a'], service: [3.6, '#78746d'],
    pedestrian: [4.5, '#cbbda6'], track: [3, '#b49d74'], footway: [1.6, '#d9cdb6'], path: [1.4, '#c4b08a'], cycleway: [1.6, '#9fb8cf'],
    steps: [2, '#c99f88'], other: [2, '#d9cdb6'],
  },
  casing: '#ece5d6',
};

function sitgesPlanMinimap(C) {
  const { HX, HZ, rect, north, areas, rails, roads, blds, terrainAt } = C, M = SITGES_MM;
  const EXT = HX + 40, EXTZ = HZ + 40, m = mmCanvas(EXT, Math.round(2 * EXT * M.ppm), EXTZ), ctx = m.ctx;
  const W = m.c.width, Hh = m.c.height;
  // суша с отмывкой рельефа (свет с северо-запада по карте: с +x, +z)
  const img = ctx.createImageData(W, Hh), d = img.data;
  for (let py = 0; py < Hh; py += 2) for (let px = 0; px < W; px += 2) {
    const [x, z] = m.world(px, py);
    const sx = terrainAt(x + 6, z) - terrainAt(x - 6, z), sz = terrainAt(x, z + 6) - terrainAt(x, z - 6);
    const sh = clamp(1 + (sx + sz) * 0.035, 0.8, 1.15);
    for (let a = 0; a < 2 && py + a < Hh; a++) for (let b = 0; b < 2 && px + b < W; b++) {
      const o = ((py + a) * W + px + b) * 4;
      d[o] = M.land[0] * sh; d[o + 1] = M.land[1] * sh; d[o + 2] = M.land[2] * sh; d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  ctx.lineJoin = ctx.lineCap = 'round';
  const path = (pts, close) => {
    ctx.beginPath();
    pts.forEach(([x, z], i) => (i ? ctx.lineTo(m.X(x), m.Z(z)) : ctx.moveTo(m.X(x), m.Z(z))));
    if (close) ctx.closePath();
  };
  // площадные объекты: сначала крупные (море, гольф, лес), сверху мелкие (бассейны)
  const ORDER = ['sea', 'farmland', 'golf', 'wood', 'scrub', 'grass', 'park', 'garden', 'cemetery', 'railway', 'rock', 'beach', 'sand',
    'pitch', 'playground', 'water', 'pier', 'quay', 'breakwater', 'pool'];
  for (const kind of ORDER) {
    ctx.fillStyle = kind === 'sea' ? M.sea : M.area[kind];
    for (const a of areas) if (a.kind === kind) { path(a.ring, true); ctx.fill(); }
  }
  // ж/д
  ctx.strokeStyle = '#6b645b'; ctx.lineWidth = Math.max(1.5, 3 * m.sc);
  for (const r of rails) if (!r.tunnel) { path(r.pts); ctx.stroke(); }
  // улицы: обводка проезжих, затем полотно; узкие — сверху широких
  const order = Object.keys(M.road).sort((a, b) => M.road[b][0] - M.road[a][0]);
  const DRIVE = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'service']);
  ctx.strokeStyle = M.casing;
  for (const cls of order) if (DRIVE.has(cls)) {
    ctx.lineWidth = (M.road[cls][0] + 1.6) * m.sc;
    for (const r of roads) if (r.cls === cls && !r.tunnel) { path(r.pts); ctx.stroke(); }
  }
  for (const cls of order) {
    ctx.strokeStyle = M.road[cls][1]; ctx.lineWidth = Math.max(1, M.road[cls][0] * m.sc);
    for (const r of roads) if (r.cls === cls && !r.tunnel) { path(r.pts); ctx.stroke(); }
  }
  // здания: заливка темнее с этажностью, контур
  ctx.lineWidth = 0.8; ctx.strokeStyle = 'rgba(92,78,62,.85)';
  for (const b of blds) for (const p of b.parts) {
    const k = clamp((p.floors - 1) / 6, 0, 1);
    ctx.fillStyle = `rgb(${200 - 60 * k},${184 - 58 * k},${164 - 52 * k})`;
    ctx.beginPath();
    for (const r of p.rings) r.forEach(([x, z], i) => (i ? ctx.lineTo(m.X(x), m.Z(z)) : ctx.moveTo(m.X(x), m.Z(z))));
    ctx.fill('evenodd'); ctx.stroke();
  }
  // за границей игровой области — притенить; граница — пунктир
  const border = [[rect[0], rect[2]], [rect[1], rect[2]], [rect[1], C.northAt(rect[1])]];
  for (let k = north.length - 1; k >= 0; k--) border.push([SITGES_GEO.north.x0 + k * SITGES_GEO.north.step, north[k]]);
  border.push([rect[0], C.northAt(rect[0])]);
  ctx.beginPath(); ctx.rect(0, 0, W, Hh);
  border.forEach(([x, z], i) => (i ? ctx.lineTo(m.X(x), m.Z(z)) : ctx.moveTo(m.X(x), m.Z(z)))); ctx.closePath();
  ctx.fillStyle = 'rgba(40,36,30,.32)'; ctx.fill('evenodd');
  ctx.setLineDash([8, 6]); ctx.strokeStyle = 'rgba(190,40,30,.9)'; ctx.lineWidth = 2;
  path(border, true); ctx.stroke(); ctx.setLineDash([]);
  Object.assign(C, { mm: m, minimap: m.c, mmExt: EXT, mmExtZ: EXTZ, mmBg: M.sea });
}
