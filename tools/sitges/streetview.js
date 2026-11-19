// Карта «Ситжес» — кадры Google Street View Static API: фото-образцы фасадов, заборов, мощения и крутых улиц.
//   node tools/sitges/streetview.js                 — подобрать точки, проверить панорамы, скачать кадры
//   node tools/sitges/streetview.js --plan          — только подобрать точки и напечатать сводку (без запросов)
//   node tools/sitges/streetview.js --only fence,slope --limit 3   — выбрать виды и число кадров на вид
// Ключ: переменная окружения GMAPS_KEY или файл tools/sitges/raw/gmaps-key.txt (raw/ в .gitignore). Ключ не
//   печатается. Запрос «есть ли панорама» (metadata) бесплатный, платный только сам кадр (640 × 640).
// Пишет tools/sitges/raw/photos/sv/<вид>/NN-улица.jpg и sv/index.md (адрес, год и этажи, координаты игры x z,
//   дата панорамы, ссылка на панораму в Google Maps). Есть файл — не качает заново; отбракованные после просмотра
//   (интерьер, размытый дом, не тот вид) — строками «вид/файл.jpg» в sv/skip.txt: их не качает и не пишет в индекс.
// Точки — из сырых данных: дома кадастра (год, этажи, контур, адрес), улицы OSM, рельеф ICGC. Камера — ближайшая
//   к цели панорама, взгляд — на ближайшую к ней точку контура дома (фасад прямо) или вдоль улицы.
// Правила Google: кадры — только образцы, на которые смотрим глазами; геометрию и цвета из них в data-*.js
//   не переносим (данные карты — только OSM, кадастр, ICGC).
const fs = require('fs');
const path = require('path');
const G = require('./geo');
const { readCatastro, readAddresses } = require('./read-catastro');
const { readOSM } = require('./read-osm');
const { readDTM } = require('./read-dtm');

const ARG = process.argv.slice(2);
const PLAN = ARG.includes('--plan');
const opt = k => { const i = ARG.indexOf(k); return i >= 0 ? ARG[i + 1] : null; };
const ONLY = opt('--only') ? opt('--only').split(',') : null;
const LIMIT = opt('--limit') ? +opt('--limit') : 0;
const DIR = path.join(G.RAW, 'photos', 'sv');

G.setOrigin(399824, 4565493);              // центр карты (как в шапке data-*.js)
const INSIDE = ([e, n]) => { const [x, z] = G.toLocal(e, n); return Math.abs(x) < 1950 && Math.abs(z) < 700; };
const BANDS = 6;                            // полосы вдоль берега: кадры вида раскладываем по всему городу
const band = ([e, n]) => Math.min(BANDS - 1, Math.max(0, Math.floor((G.toLocal(e, n)[0] + 1950) / (3900 / BANDS))));

/* ---------- геометрия ---------- */
// UTM → широта и долгота: обращение G.utm() методом Ньютона (сходится за 3–4 шага до миллиметров)
function wgs(e, n) {
  let lat = 41.235, lon = 1.805;
  for (let i = 0; i < 6; i++) {
    const [e0, n0] = G.utm(lat, lon), d = 1e-5;
    const [ea, na] = G.utm(lat + d, lon), [eb, nb] = G.utm(lat, lon + d);
    const a = (ea - e0) / d, b = (eb - e0) / d, c = (na - n0) / d, dd = (nb - n0) / d, det = a * dd - b * c;
    const re = e - e0, rn = n - n0;
    lat += (dd * re - b * rn) / det; lon += (a * rn - c * re) / det;
  }
  return [lat, lon];
}
// азимут от точки 1 к точке 2 (градусы от истинного севера по часовой) — по широте и долготе
function bearing([la1, lo1], [la2, lo2]) {
  const r = Math.PI / 180, f1 = la1 * r, f2 = la2 * r, dl = (lo2 - lo1) * r;
  const y = Math.sin(dl) * Math.cos(f2), x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
  return (Math.atan2(y, x) / r + 360) % 360;
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function nearestOnRing(ring, p) {           // ближайшая к p точка контура
  let best = null, bd = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0;
    const q = [a[0] + t * dx, a[1] + t * dy], d = dist(q, p);
    if (d < bd) { bd = d; best = q; }
  }
  return [best, bd];
}
// детерминированный «случайный» порядок без R(): хеш строки
const hash = s => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
// выбрать k кандидатов, по очереди из полос вдоль берега (весь город, а не один квартал)
function spread(cands, k) {
  const by = Array.from({ length: BANDS }, () => []);
  for (const c of cands.sort((a, b) => hash(a.id) - hash(b.id))) by[band(c.p)].push(c);
  const out = [];
  for (let i = 0; out.length < k && by.some(l => l.length); i = (i + 1) % BANDS) if (by[i].length) out.push(by[i].shift());
  return out;
}

/* ---------- кандидаты ---------- */
console.log('Читаю кадастр, адреса, OSM, рельеф…');
const cat = readCatastro(), adr = readAddresses(), osm = readOSM(), dtm = readDTM();

// дома: части по номеру здания → контуры и наибольшая этажность
const houses = new Map();
for (const p of cat.parts) {
  const h = houses.get(p.bid) || { rings: [], floors: 0 };
  h.rings.push(p.rings[0]); h.floors = Math.max(h.floors, p.floors);
  houses.set(p.bid, h);
}
// адрес → дом; расстояние от точки адреса до дома (у вилл точка — у калитки, дом в глубине участка)
const homes = [];
const seen = new Set();
for (const a of adr.list) {
  const h = houses.get(a.ref), b = cat.buildings.get(a.ref);
  if (!h || !b || b.use !== 0 || seen.has(a.ref) || !INSIDE([a.x, a.y])) continue;
  seen.add(a.ref);
  let near = null, nd = Infinity;
  for (const r of h.rings) { const [q, d] = nearestOnRing(r, [a.x, a.y]); if (d < nd) { nd = d; near = q; } }
  homes.push({ id: a.ref, p: [a.x, a.y], rings: h.rings, floors: h.floors, year: b.year, back: nd,
    street: (adr.streets.get(a.street) || '').replace(/&apos;/g, "'").replace(/&amp;/g, '&').trim(), num: a.num });
}

const roads = osm.roads.filter(r => ['tertiary', 'unclassified', 'residential', 'living_street', 'pedestrian', 'secondary']
  .includes(r.cls) && r.pts.length > 1);
// точки улиц через каждые ~40 м: { p, dir — направление участка (UTM), slope — уклон на 20 м }
const roadPts = [];
for (const r of roads) for (let i = 0; i + 1 < r.pts.length; i++) {
  const a = r.pts[i], b = r.pts[i + 1], L = dist(a, b);
  for (let s = 10; s < L - 10; s += 40) {
    const t = s / L, p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    if (!INSIDE(p)) continue;
    const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
    const p0 = [p[0] - u[0] * 10, p[1] - u[1] * 10], p1 = [p[0] + u[0] * 10, p[1] + u[1] * 10];
    roadPts.push({ id: r.name + '@' + Math.round(p[0]) + ',' + Math.round(p[1]), p, u, cls: r.cls, name: r.name,
      slope: (dtm.at(...p1) - dtm.at(...p0)) / 20 });
  }
}

// виды кадров. facade: взгляд на дом; along: вдоль улицы (pitch — наклон камеры, вниз — мощение)
const KINDS = [
  { name: 'old',     what: 'жилые дома до 1900 г., 2–5 этажей — фасад прямо', k: 12, type: 'facade',
    pick: () => homes.filter(h => h.year && h.year < 1900 && h.floors >= 2 && h.back < 3) },
  { name: 'y1900',   what: 'дома 1900–1939 гг. (индианос, модерн, виллы) — фасад', k: 12, type: 'facade',
    pick: () => homes.filter(h => h.year >= 1900 && h.year < 1940) },
  { name: 'y1940',   what: 'дома 1940–1974 гг., от 4 этажей — фасад', k: 12, type: 'facade',
    pick: () => homes.filter(h => h.year >= 1940 && h.year < 1975 && h.floors >= 4) },
  { name: 'y1975',   what: 'дома 1975–1999 гг., от 4 этажей — фасад', k: 12, type: 'facade',
    pick: () => homes.filter(h => h.year >= 1975 && h.year < 2000 && h.floors >= 4) },
  { name: 'y2000',   what: 'дома с 2000 г. — фасад', k: 10, type: 'facade',
    pick: () => homes.filter(h => h.year >= 2000) },
  { name: 'fence',   what: 'виллы до 2 этажей в глубине участка — забор, ворота, дом за ними', k: 18, type: 'facade',
    pick: () => homes.filter(h => h.floors <= 2 && h.back >= 5 && h.back < 25) },
  { name: 'seafront', what: 'дома на Passeig Marítim и de la Ribera — фасад со стороны моря', k: 10, type: 'facade',
    pick: () => homes.filter(h => /MARITIM|RIBERA/i.test(h.street)) },
  // круче −35° и прямо по ходу в кадр лезет размытое пятно на месте машины Google — смотрим вниз и вбок, на бордюр
  { name: 'paving',  what: 'мощение: проезжая часть, бордюр, тротуар — вниз и вбок', k: 18, type: 'along', pitch: -30, fov: 80, side: 55,
    pick: () => roadPts.filter(r => r.cls !== 'pedestrian') },
  { name: 'slope',   what: 'крутые улицы (уклон ≥ 10 %) — вверх по улице: подпорные стены, заборы, бордюры', k: 14,
    type: 'along', pitch: 5, fov: 90, uphill: true, pick: () => roadPts.filter(r => Math.abs(r.slope) >= 0.10) },
  { name: 'oldtown', what: 'улочки старого города без кадров в первой выборке — вдоль улицы', k: 8, type: 'along', pitch: 0, fov: 90,
    pick: () => roadPts.filter(r => /Primer de Maig|de Sant Pau|d'en Bosc|Bonaire|Sant Francesc|Sant Bartomeu/i.test(r.name)) },
  { name: 'steep',   what: 'крутые места полотна из плана (Открыто, 3а) — вдоль улицы в обе стороны', k: 10, type: 'along',
    pitch: 0, fov: 90, both: true, pick: () => [[241, 588], [-1100, 235], [-864, 145], [1280, 370], [196, 468]].map(([x, z]) => {
      const q = G.toUTM(x, z); let best = null;
      for (const r of roadPts) if (!best || dist(r.p, q) < dist(best.p, q)) best = r;
      return best && { ...best, id: `steep ${x},${z}`, at: `${x}, ${z}` };
    }).filter(Boolean) },
];

/* ---------- запросы ---------- */
function key() {
  if (process.env.GMAPS_KEY) return process.env.GMAPS_KEY.trim();
  const f = path.join(G.RAW, 'gmaps-key.txt');
  if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim();
  throw new Error('нет ключа: задайте GMAPS_KEY или положите его в tools/sitges/raw/gmaps-key.txt');
}
const API = 'https://maps.googleapis.com/maps/api/streetview';
async function meta(lat, lon, radius, K) {
  const r = await fetch(`${API}/metadata?location=${lat.toFixed(7)},${lon.toFixed(7)}&radius=${radius}&source=outdoor&key=${K}`);
  const j = await r.json();
  if (j.status === 'REQUEST_DENIED' || j.status === 'OVER_QUERY_LIMIT') throw new Error(`Street View: ${j.status} — ${j.error_message || ''}`);
  return j.status === 'OK' ? j : null;
}
async function shot(file, pano, heading, pitch, fov, K) {
  const r = await fetch(`${API}?size=640x640&pano=${pano}&heading=${heading.toFixed(1)}&pitch=${pitch.toFixed(1)}&fov=${fov.toFixed(0)}&return_error_code=true&key=${K}`);
  if (!r.ok) return false;
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  return true;
}
const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'x';
const link = (pano, h, p, f) => `https://www.google.com/maps/@?api=1&map_action=pano&pano=${pano}&heading=${h.toFixed(0)}&pitch=${p.toFixed(0)}&fov=${f.toFixed(0)}`;

(async () => {
  const kinds = KINDS.filter(k => !ONLY || ONLY.includes(k.name));
  for (const k of kinds) { k.list = spread(k.pick(), LIMIT || k.k); }
  console.log(kinds.map(k => `  ${k.name.padEnd(9)} ${String(k.list.length).padStart(3)} из ${k.pick().length} кандидатов — ${k.what}`).join('\n'));
  if (PLAN) return;
  const K = key();
  const rows = [];
  // sv/skip.txt — отбракованные после просмотра кадры (вид/файл.jpg построчно): не качать заново, не писать в индекс
  const SKIP = new Set(fs.existsSync(path.join(DIR, 'skip.txt'))
    ? fs.readFileSync(path.join(DIR, 'skip.txt'), 'utf8').split(/\r?\n/).map(s => s.trim()).filter(Boolean) : []);
  let got = 0, skip = 0, have = 0;
  for (const k of kinds) {
    const dir = path.join(DIR, k.name);
    fs.mkdirSync(dir, { recursive: true });
    const panos = new Set();
    let n = 0;
    for (const c of k.list) {
      const ll = wgs(...c.p);
      const m = await meta(ll[0], ll[1], k.type === 'facade' ? 35 : 20, K);
      if (!m || panos.has(m.pano_id)) { skip++; continue; }
      panos.add(m.pano_id);
      const cam = [m.location.lat, m.location.lng], camU = G.utm(...cam);
      const views = [];
      if (k.type === 'facade') {
        // цель — ближайшая к камере точка контура дома; угол обзора — под ~20 м фасада, наклон — к середине высоты
        let tq = null, td = Infinity;
        for (const r of c.rings) { const [q, d] = nearestOnRing(r, camU); if (d < td) { td = d; tq = q; } }
        if (td > 40 || td < 2) { skip++; continue; }
        const fov = Math.max(60, Math.min(110, 2 * Math.atan(11 / td) * 180 / Math.PI));
        // наклон — к трети высоты: снизу в кадр попадают цоколь и тротуар, сверху — карниз, неба меньше
        const pitch = Math.max(0, Math.min(20, Math.atan((Math.max(c.floors, 1) * 3.2 * 0.35 - 2.5) / td) * 180 / Math.PI));
        views.push({ h: bearing(cam, wgs(...tq)), p: pitch, f: fov });
      } else {
        let u = c.u;
        if (k.uphill && c.slope < 0) u = [-u[0], -u[1]];
        const ahead = wgs(c.p[0] + u[0] * 30, c.p[1] + u[1] * 30);
        const h = (bearing(cam, ahead) + (k.side ? (hash(c.id) & 1 ? k.side : -k.side) : 0) + 360) % 360;
        views.push({ h, p: k.pitch, f: k.fov });
        if (k.both) views.push({ h: (h + 180) % 360, p: k.pitch, f: k.fov });
      }
      for (const v of views) {
        n++;
        const name = `${String(n).padStart(2, '0')}-${slug(c.street ? c.street + ' ' + c.num : c.name)}.jpg`;
        const file = path.join(dir, name);
        if (SKIP.has(`${k.name}/${name}`)) { skip++; continue; }
        if (fs.existsSync(file)) have++;
        else if (await shot(file, m.pano_id, v.h, v.p, v.f, K)) got++;
        else { skip++; continue; }
        const [x, z] = G.toLocal(...c.p).map(Math.round);
        rows.push(`| ${k.name}/${name} | ${c.street ? `${c.street} ${c.num}` : c.name || '—'} | ${c.year ? c.year + ', ' + c.floors + ' эт.' : c.slope !== undefined ? 'уклон ' + Math.round(Math.abs(c.slope) * 100) + ' %' : ''} | ${x}, ${z} | ${m.date || '—'} | [панорама](${link(m.pano_id, v.h, v.p, v.f)}) |`);
      }
    }
    console.log(`  ${k.name}: ${n} кадров`);
  }
  // с --only строки остальных видов берём из прежнего индекса
  const idx = path.join(DIR, 'index.md'), names = new Set(kinds.map(k => k.name));
  if (fs.existsSync(idx)) for (const l of fs.readFileSync(idx, 'utf8').split('\n'))
    if (/^\| [a-z0-9]+\/\S+\.jpg \|/.test(l) && !names.has(l.slice(2, l.indexOf('/')))) rows.push(l);
  rows.sort();
  const head = ['# Кадры Street View (tools/sitges/streetview.js)', '',
    'Образцы для глаз: геометрию и цвета в данные карты не переносим. x, z — координаты игры (цель кадра).', '',
    ...KINDS.map(k => `- **${k.name}** — ${k.what}`), '',
    '| файл | адрес / улица | год, этажи / уклон | x, z | дата панорамы | ссылка |', '|---|---|---|---|---|---|'];
  fs.writeFileSync(path.join(DIR, 'index.md'), head.concat(rows).join('\n') + '\n');
  console.log(`Скачано ${got}, уже было ${have}, пропущено (нет панорамы, далеко, дубль) ${skip}. Индекс: raw/photos/sv/index.md`);
})().catch(e => { console.error('Ошибка:', e.message); process.exit(1); });
