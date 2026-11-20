// Карта «Ситжес» — скачивание сырых данных в tools/sitges/raw/ (в git не попадает).
//   node tools/sitges/download.js          — скачать то, чего ещё нет
//   node tools/sitges/download.js --force  — скачать всё заново
// Что качаем:
//   osm.json        — OpenStreetMap через Overpass API: улицы, здания, берег, пляжи, волнорезы, марина, ж/д,
//                     парки, землепользование, названия (© участники OpenStreetMap, ODbL)
//   catastro/       — кадастр INSPIRE BU по муниципалитету 08270 Ситжес (ATOM-лента провинции 08): контуры
//                     зданий и их частей с этажностью (Fuente: Dirección General del Catastro)
//   parcels/        — кадастр INSPIRE CP (участки) по тому же муниципалитету: границы участков — линия заборов,
//                     промежуток между ними — ширина улицы «от забора до забора»
//   addresses/      — кадастр INSPIRE AD (адреса) по тому же муниципалитету: улица, номер, точка и кадастровый
//                     номер участка — подписи адресов над домами (отладка стиля города)
//   dtm5.asc        — рельеф ICGC MET 5 × 5 м (WCS icc:met5, ARCGRID, EPSG:25831) на прямоугольник BBOX
//                     (Institut Cartogràfic i Geològic de Catalunya, CC BY 4.0)
//   points.json     — точки OSM (магазины, деревья, фонари, переходы, ворота…) и круговое движение — отдельным
//                     запросом, чтобы не перекачивать osm.json (новые правки OSM сдвинули бы весь город)
//   orto/, dsm/     — плитки WMS ICGC по игровой области (нужен js/maps/sitges/data-geo.js — после build.js):
//                     ортофото 25 см 2024 (цвет крыш) и модель «рельеф + здания» прибрежного лидара 50 см 2024
//                     (тип крыши: уклоны; серый линеен по высоте, масштаб —
//                     свой у каждой плитки: dsm/calib.json по трём точкам GetFeatureInfo); TILE м на плитку,
//                     0,5 м на пиксель. CC BY 4.0 ICGC
//   sup/, ir/       — для деревьев (этап 4б), только плитки с покрытием лидара (dsm/calib.json не null): модель
//                     «поверхность» того же лидара (рельеф + здания + растительность; калибровка sup/calib.json, как
//                     у dsm/) и инфракрасное ортофото 25 см 2024 (зелень — красная). CC BY 4.0 ICGC
//   alc/            — запас для деревьев там, где прибрежного лидара нет (часть города за ж/д): высоты растительности
//                     над землёй территориального лидара 1 м 2021–2023 (WMS elevacions-territorial), все плитки;
//                     калибровка alc/calib.json. CC BY 4.0 ICGC
// Печатает только сводку: что скачано и сколько весит.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { RAW, OUT, BBOX, bboxUTM, setOrigin, toUTM } = require('./geo');

const FORCE = process.argv.includes('--force');
const UA = { 'User-Agent': 'racing-game-map-tool/1.0' };
const mb = f => (fs.statSync(f).size / 1048576).toFixed(1) + ' МБ';
const have = f => !FORCE && fs.existsSync(f) && fs.statSync(f).size > 0;

async function get(url, opts = {}) {
  for (let attempt = 1; ; attempt++) {
    let res = null, why;
    try { res = await fetch(url, { ...opts, headers: { ...UA, ...(opts.headers || {}) } }); why = res.status; }
    catch (e) { why = e.message; }                 // обрыв соединения — тоже повторяем
    if (res && res.ok) return Buffer.from(await res.arrayBuffer());
    if (attempt >= 3) throw new Error(`${why}: ${url}`);
    console.log(`  ответ ${why}, повтор через 20 с…`);
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
// INSPIRE BU (здания), CP (участки) и AD (адреса) — ATOM-ленты провинции 08, архив муниципалитета 08270
const CAT = {
  bu: { feed: 'https://www.catastro.hacienda.gob.es/INSPIRE/buildings/08/ES.SDGC.bu.atom_08.xml', dir: 'catastro', zip: 'catastro.zip', what: 'здания' },
  cp: { feed: 'https://www.catastro.hacienda.gob.es/INSPIRE/CadastralParcels/08/ES.SDGC.CP.atom_08.xml', dir: 'parcels', zip: 'parcels.zip', what: 'участки' },
  ad: { feed: 'https://www.catastro.hacienda.gob.es/INSPIRE/Addresses/08/ES.SDGC.AD.atom_08.xml', dir: 'addresses', zip: 'addresses.zip', what: 'адреса' },
};
async function catastro({ feed, dir: d, zip: z, what }) {
  const dir = path.join(RAW, d), zip = path.join(RAW, z);
  const gml = () => fs.existsSync(dir) ? fs.readdirSync(dir).filter(n => n.endsWith('.gml')) : [];
  if (!FORCE && gml().length) return console.log(d + '/ — уже есть:', gml().join(', '));
  if (!have(zip)) {
    console.log(`Кадастр (${what}): ATOM-лента провинции 08…`);
    const xml = (await get(feed)).toString('utf8');
    // запись муниципалитета: <title> 08270-SITGES …</title> … <link rel="enclosure" href="….zip">
    const entry = xml.split('<entry>').find(e => /<title>\s*08270-SITGES/i.test(e));
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
  for (const n of gml()) console.log(`  ${d}/` + n, '—', mb(path.join(dir, n)));
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

/* ---------- точки OSM ---------- */
async function points() {
  const f = path.join(RAW, 'points.json');
  if (have(f)) return console.log('points.json — уже есть,', mb(f));
  const b = `${BBOX.s},${BBOX.w},${BBOX.n},${BBOX.e}`;
  const q = `[out:json][timeout:300][bbox:${b}];
(
  node["shop"]; node["amenity"]; node["craft"]; node["office"];
  node["natural"="tree"]; node["highway"~"^(street_lamp|crossing|traffic_signals|stop|give_way)$"];
  node["barrier"]; node["entrance"]; node["man_made"="street_cabinet"];
  way["junction"="roundabout"];
);
out geom;`;
  console.log('OSM, точки: запрос к Overpass…');
  const buf = await get('https://overpass-api.de/api/interpreter', {
    method: 'POST', body: 'data=' + encodeURIComponent(q),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  fs.writeFileSync(f, buf);
  console.log('points.json —', mb(f), '·', JSON.parse(buf).elements.length, 'объектов');
}

/* ---------- плитки WMS ICGC: ортофото и ориентации склонов ---------- */
const TILE = 512, PX = 0.5;
const LIT = 'https://geoserveis.icgc.cat/servei/catalunya/elevacions-litoral/wms';
const WMS = {
  orto: { url: 'https://geoserveis.icgc.cat/servei/catalunya/orto-territorial/wms', layer: 'ortofoto_25cm_color_2024', fmt: 'image/png; mode=8bit' },
  // рельеф + здания (без деревьев): серый линеен по высоте, но растянут под каждый запрос — калибровка ниже
  dsm: { url: LIT, layer: 'model-elevacions-terreny-edificis-litoral-lidar-50cm-202403-202404', fmt: 'image/png' },
  // поверхность с растительностью (кроны деревьев): высота крон = sup − dsm; калибровка — как у dsm
  sup: { url: LIT, layer: 'model-superficies-litoral-lidar-50cm-202403-202404', fmt: 'image/png', lidar: true },
  // высота растительности над землёй (территориальный лидар 1 м, вся Каталония) — где нет прибрежного
  alc: { url: 'https://geoserveis.icgc.cat/servei/catalunya/elevacions-territorial/wms', layer: 'model-alcaries-vegetacio-catalunya-lidar-1m-2021-2023', fmt: 'image/png' },
  ir: { url: 'https://geoserveis.icgc.cat/servei/catalunya/orto-territorial/wms', layer: 'ortofoto_25cm_infraroig_2024', fmt: 'image/png; mode=8bit', lidar: true },
};
// плитки с покрытием лидара (по калибровке dsm/): для sup/ и ir/ остальные не нужны
const lidarTiles = () => { const c = JSON.parse(fs.readFileSync(path.join(RAW, 'dsm', 'calib.json'), 'utf8')); return k => c[k[0] + '_' + k[1]]; };
// плитки UTM, кратные TILE, покрывающие игровую область (+20 м); привязка — из data-geo.js (пишет build.js)
function tileList() {
  const geo = fs.readFileSync(path.join(OUT, 'data-geo.js'), 'utf8');
  const origin = JSON.parse(geo.match(/origin: (\[[^\]]*\])/)[1]), rect = JSON.parse(geo.match(/rect: (\[[^\]]*\])/)[1]);
  setOrigin(...origin);
  const m = 20, cs = [[rect[0] - m, rect[2] - m], [rect[1] + m, rect[2] - m], [rect[0] - m, rect[3] + m], [rect[1] + m, rect[3] + m]].map(([x, z]) => toUTM(x, z));
  const e0 = Math.floor(Math.min(...cs.map(c => c[0])) / TILE), e1 = Math.floor(Math.max(...cs.map(c => c[0])) / TILE);
  const n0 = Math.floor(Math.min(...cs.map(c => c[1])) / TILE), n1 = Math.floor(Math.max(...cs.map(c => c[1])) / TILE);
  const out = [];
  for (let e = e0; e <= e1; e++) for (let n = n0; n <= n1; n++) out.push([e * TILE, n * TILE]);
  return out;
}
async function tiles(kind) {
  const { url, layer, fmt, lidar } = WMS[kind], dir = path.join(RAW, kind), size = TILE / PX;
  const list = lidar ? tileList().filter(lidarTiles()) : tileList();
  fs.mkdirSync(dir, { recursive: true });
  let got = 0, bytes = 0;
  for (const [e, n] of list) {
    const f = path.join(dir, `${e}_${n}.png`);
    if (!have(f)) {
      const q = `${url}?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&SRS=EPSG:25831&STYLES=&LAYERS=${layer}`
        + `&BBOX=${e},${n},${e + TILE},${n + TILE}&WIDTH=${size}&HEIGHT=${size}&FORMAT=${encodeURIComponent(fmt)}&TRANSPARENT=TRUE`;
      const buf = await get(q);
      if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`${kind}: сервис вернул не PNG: ` + buf.subarray(0, 300).toString());
      fs.writeFileSync(f, buf);
      got++;
    }
    bytes += fs.statSync(f).size;
  }
  console.log(`${kind}/ — плиток ${list.length} (скачано сейчас ${got}), ${(bytes / 1048576).toFixed(0)} МБ`);
}
// калибровка плиток dsm/ (и sup/): серый = a · высота + b у каждой плитки свой. Точные высоты — GetFeatureInfo в самой тёмной,
// самой светлой и средней точке плитки (тот же BBOX и размер); пишем <kind>/calib.json { "e_n": [a, b, ошибка, м] }
async function calibrate(kind = 'dsm') {
  const { readPNG } = require('./png');
  const { url, layer, lidar } = WMS[kind], dir = path.join(RAW, kind), f = path.join(dir, 'calib.json'), size = TILE / PX;
  const cal = fs.existsSync(f) && !FORCE ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
  let done = 0, worst = 0;
  for (const [e, n] of lidar ? tileList().filter(lidarTiles()) : tileList()) {
    const key = `${e}_${n}`;
    if (cal[key] !== undefined) continue;
    const im = readPNG(fs.readFileSync(path.join(dir, key + '.png')));
    let lo = -1, hi = -1, mid = -1;
    const vals = [];
    for (let i = 0; i < size * size; i++) if (im.data[i * 4 + 3] > 127) vals.push(i);
    if (vals.length < 100) { cal[key] = null; continue; }               // вне покрытия лидара
    vals.sort((p, q) => im.data[p * 4] - im.data[q * 4]);
    lo = vals[Math.floor(vals.length * 0.002)]; hi = vals[Math.floor(vals.length * 0.998)]; mid = vals[vals.length >> 1];
    const val = async i => {
      const q = `${url}?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetFeatureInfo&SRS=EPSG:25831&STYLES=&LAYERS=${layer}&QUERY_LAYERS=${layer}`
        + `&BBOX=${e},${n},${e + TILE},${n + TILE}&WIDTH=${size}&HEIGHT=${size}&X=${i % size}&Y=${Math.floor(i / size)}&INFO_FORMAT=text/plain`;
      const m = (await get(q)).toString().match(/value_0 = '([-\d.]+)'/);
      return m ? +m[1] : NaN;
    };
    const [hl, hh, hm] = [await val(lo), await val(hi), await val(mid)];
    const gl = im.data[lo * 4], gh = im.data[hi * 4], gm = im.data[mid * 4];
    if (!(hh > hl) || gh === gl) { cal[key] = null; continue; }
    const a = (gh - gl) / (hh - hl), b = gl - a * hl, err = Math.abs((gm - b) / a - hm);
    cal[key] = [+a.toFixed(5), +b.toFixed(4), +err.toFixed(2)];
    worst = Math.max(worst, err); done++;
  }
  fs.writeFileSync(f, JSON.stringify(cal));
  const steps = Object.values(cal).filter(Boolean).map(c => 1 / c[0]);
  console.log(`${kind}/calib.json — откалибровано сейчас ${done}, худшая ошибка в средней точке ${worst.toFixed(2)} м; ступень серого ${Math.min(...steps).toFixed(2)}…${Math.max(...steps).toFixed(2)} м`);
}

(async () => {
  fs.mkdirSync(RAW, { recursive: true });
  await osm();
  await catastro(CAT.bu);
  await catastro(CAT.cp);
  await catastro(CAT.ad);
  await dtm();
  await points();
  if (fs.existsSync(path.join(OUT, 'data-geo.js'))) { await tiles('orto'); await tiles('dsm'); await calibrate();
    await tiles('sup'); await calibrate('sup'); await tiles('ir'); await tiles('alc'); await calibrate('alc'); }
  else console.log('orto/, dsm/ — нужен data-geo.js: запусти build.js и затем download.js ещё раз');
})().catch(e => { console.error('Ошибка:', e.message); process.exit(1); });
