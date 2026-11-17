// Карта «Ситжес» — скачивание сырых данных в tools/sitges/raw/ (в git не попадает).
//   node tools/sitges/download.js          — скачать то, чего ещё нет
//   node tools/sitges/download.js --force  — скачать всё заново
// Что качаем:
//   osm.json        — OpenStreetMap через Overpass API: улицы, здания, берег, пляжи, волнорезы, марина, ж/д,
//                     парки, землепользование, названия (© участники OpenStreetMap, ODbL)
//   catastro/       — кадастр INSPIRE BU по муниципалитету 08270 Ситжес (ATOM-лента провинции 08): контуры
//                     зданий и их частей с этажностью (Fuente: Dirección General del Catastro)
//   dtm5.asc        — рельеф ICGC MET 5 × 5 м (WCS icc:met5, ARCGRID, EPSG:25831) на прямоугольник BBOX
//                     (Institut Cartogràfic i Geològic de Catalunya, CC BY 4.0)
// Печатает только сводку: что скачано и сколько весит.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { RAW, BBOX, bboxUTM } = require('./geo');

const FORCE = process.argv.includes('--force');
const UA = { 'User-Agent': 'racing-game-map-tool/1.0' };
const mb = f => (fs.statSync(f).size / 1048576).toFixed(1) + ' МБ';
const have = f => !FORCE && fs.existsSync(f) && fs.statSync(f).size > 0;

async function get(url, opts = {}) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { ...opts, headers: { ...UA, ...(opts.headers || {}) } });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    if (attempt >= 3) throw new Error(`${res.status} ${res.statusText}: ${url}`);
    console.log(`  ответ ${res.status}, повтор через 20 с…`);
    await new Promise(r => setTimeout(r, 20000));
  }
}

/* ---------- OSM ---------- */
async function osm() {
  const f = path.join(RAW, 'osm.json');
  if (have(f)) return console.log('osm.json — уже есть,', mb(f));
  const b = `${BBOX.s},${BBOX.w},${BBOX.n},${BBOX.e}`;
  const q = `[out:json][timeout:300][bbox:${b}];
(
  way["highway"];
  way["building"]; relation["building"];
  way["building:part"];
  way["natural"~"^(coastline|beach|water|wood|scrub|sand|bare_rock|cliff|grassland)$"];
  relation["natural"~"^(beach|water|wood|scrub)$"];
  way["man_made"~"^(breakwater|groyne|pier|quay)$"];
  way["leisure"~"^(marina|park|garden|golf_course|pitch|playground|slipway|sports_centre|stadium|swimming_pool)$"];
  relation["leisure"~"^(marina|park|garden|golf_course)$"];
  way["landuse"]; relation["landuse"];
  way["railway"];
  way["waterway"];
  way["amenity"];
  way["tourism"]; way["historic"];
  node["name"];
  node["railway"="station"];
);
out geom;`;
  console.log('OSM: запрос к Overpass…');
  const buf = await get('https://overpass-api.de/api/interpreter', {
    method: 'POST', body: 'data=' + encodeURIComponent(q),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  fs.writeFileSync(f, buf);
  console.log('osm.json —', mb(f), '·', JSON.parse(buf).elements.length, 'объектов');
}

/* ---------- кадастр ---------- */
const CAT_FEED = 'https://www.catastro.hacienda.gob.es/INSPIRE/buildings/08/ES.SDGC.bu.atom_08.xml';
async function catastro() {
  const dir = path.join(RAW, 'catastro'), zip = path.join(RAW, 'catastro.zip');
  const gml = () => fs.existsSync(dir) ? fs.readdirSync(dir).filter(n => n.endsWith('.gml')) : [];
  if (!FORCE && gml().length) return console.log('catastro/ — уже есть:', gml().join(', '));
  if (!have(zip)) {
    console.log('Кадастр: ATOM-лента провинции 08…');
    const feed = (await get(CAT_FEED)).toString('utf8');
    // запись муниципалитета: <title> 08270-SITGES buildings</title> … <link rel="enclosure" href="….zip">
    const entry = feed.split('<entry>').find(e => /<title>\s*08270-SITGES/i.test(e));
    if (!entry) throw new Error('в ленте нет муниципалитета 08270-SITGES');
    const url = entry.match(/rel="enclosure"\s+href="([^"]+\.zip)"/)[1];
    const upd = (entry.match(/<updated>([^<]+)</) || [])[1];
    console.log('  архив:', url, '· обновлён', upd);
    fs.writeFileSync(zip, await get(url));
  }
  fs.mkdirSync(dir, { recursive: true });
  // штатный tar Windows (bsdtar) умеет zip; в Git Bash первым в PATH стоит GNU tar, который zip не знает
  const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
  execFileSync(tar, ['-xf', zip, '-C', dir]);
  for (const n of gml()) console.log('  catastro/' + n, '—', mb(path.join(dir, n)));
}

/* ---------- рельеф ICGC ---------- */
async function dtm() {
  const f = path.join(RAW, 'dtm5.asc');
  if (have(f)) return console.log('dtm5.asc — уже есть,', mb(f));
  const r = bboxUTM(), w = (r.e1 - r.e0) / 5, h = (r.n1 - r.n0) / 5;
  // имя покрытия в GetCapabilities — icc:met5, но прокси geoserveis дописывает к параметру «5» (icc:met5 → icc:met55,
  // ошибка «Could not find coverage»), поэтому просим icc:met; размер клетки проверяем по CELLSIZE ответа
  const url = 'https://geoserveis.icgc.cat/icc_mdt/wcs/service?SERVICE=WCS&VERSION=1.0.0&REQUEST=GetCoverage'
    + `&COVERAGE=icc:met&CRS=EPSG:25831&BBOX=${r.e0},${r.n0},${r.e1},${r.n1}&WIDTH=${w}&HEIGHT=${h}&FORMAT=ARCGRID`;
  console.log(`Рельеф ICGC: ${w} × ${h} клеток по 5 м…`);
  const buf = await get(url);
  if (!/^\s*ncols/i.test(buf.subarray(0, 40).toString())) throw new Error('сервис вернул не ARCGRID: ' + buf.subarray(0, 300).toString());
  const cell = +(buf.subarray(0, 300).toString().match(/CELLSIZE\s+([\d.]+)/i) || [])[1];
  if (cell !== 5) throw new Error('ожидалась клетка 5 м, пришла ' + cell);
  fs.writeFileSync(f, buf);
  console.log('dtm5.asc —', mb(f));
}

(async () => {
  fs.mkdirSync(RAW, { recursive: true });
  await osm();
  await catastro();
  await dtm();
})().catch(e => { console.error('Ошибка:', e.message); process.exit(1); });
