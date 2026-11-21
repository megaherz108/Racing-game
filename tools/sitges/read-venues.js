// Карта «Ситжес» — заведения из открытых источников сверх OSM (этап 6а.7). Модуль node (require), вызывает build.js.
//   overture — raw/overture-places.json (Overture Maps, тема places; download.js → tools/sitges/overture.py):
//     виды по taxonomy.hierarchy, уверенность ≥ VCFG.conf, без закрытых (operating_status = permanently_closed) и
//     без записей Foursquare (Apache 2.0 — своя лицензия; остальное CDLA Permissive 2.0 или CC0);
//   turisme — raw/turisme.json (Registre de Turisme de Catalunya): отели, хостелы, туристические апартаменты; точка —
//     вход по адресу кадастра (улица и номер; номер не найден — ближайший той же чётности до ±4);
//   extra — tools/sitges/venues-extra.json (в git): свой список { name, cat, addr: «улица номер» | x, z }.
// Слияние: OSM главнее, затем свой список, реестр, Overture; дубль — похожее название ближе VCFG.dupR м (отели —
// dupHotelR: точка реестра — вход по адресу, у OSM — середина здания). Похожее — после нормализации (без
// диакритики, регистра и слов вроде hotel, restaurant, bar, sitges) одно из названий — часть другого или общих
// слов ≥ половины.
// mergeVenues({ venues (OSM, как в build.js), loc, utm, inside, ad, venueBrand, venueCat… }) → { venues, stat }.
const fs = require('fs');
const path = require('path');
const { RAW } = require('./geo');

const VENUE_SRC = ['osm', 'overture', 'turisme', 'extra'];
const VCFG = {
  conf: 0.7,          // Overture: уверенность не ниже (у Meta нечастых мест — 0,3…0,6, многие уже закрыты)
  dupR: 60,           // дубль — похожее название ближе, м
  dupHotelR: 120,
  sameCatR: 40,       // аптека, банк, супермаркет, АЗС того же вида ближе — дубль без сравнения названий
  numWin: 4,          // номер дома не найден — ближайший той же чётности не дальше
};
const EXTRA = path.join(__dirname, 'venues-extra.json');

/* ---------- названия ---------- */
const STOP = new Set(['hotel', 'hostal', 'hostel', 'restaurant', 'restaurante', 'bar', 'cafe', 'cafeteria', 'sitges',
  'the', 'el', 'la', 'les', 'los', 'las', 'l', 'd', 'de', 'del', 'i', 'y', 'and', 'spa', 'boutique', 'apartaments',
  'apartamentos', 'apartments', 'turistics', 'turisticos', 's', 'sl', 'sa', 'pizzeria', 'grill', 'en', 'farmacia',
  'pharmacy', 'banc', 'banco']);
const words = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ')
  .split(' ').filter(w => w && !STOP.has(w));
function sameName(a, b) {
  const A = words(a), B = words(b);
  if (!A.length || !B.length) return false;
  const ja = A.join(' '), jb = B.join(' ');
  if (ja === jb || (ja.length >= 4 && jb.includes(ja)) || (jb.length >= 4 && ja.includes(jb))) return true;
  const sb = new Set(B), common = A.filter(w => sb.has(w)).length;
  return common / Math.min(A.length, B.length) >= 0.5 && common / Math.max(A.length, B.length) >= 0.5;
}
// «APARTAMENTS TURISTICS» — заглавные в «Apartaments Turistics»; короткие служебные слова — строчные
const tidy = s => {
  // без пояснений в кавычках и скобках («… "Nudist Terrace"», «(Les Botigues)») и без «S.L.» в конце
  s = (s || '').replace(/["“”«»][^"“”«»]*["“”«»]|\([^)]*\)/g, ' ').replace(/\s+/g, ' ').replace(/\s*,?\s*S\.?L\.?$/i, '').trim();
  if (s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/(^|[\s'(-])(\p{L})/gu, (m, p, c) => p + c.toUpperCase())
    .replace(/\b(De|Del|La|Les|El|I|Y|D'|L')\b/g, (m, w, o) => o ? w.toLowerCase() : w);
};

/* ---------- адреса кадастра ---------- */
const TYPES = new Set(['cl', 'carrer', 'ps', 'passeig', 'av', 'avinguda', 'pz', 'placa', 'cm', 'cami', 'ptge', 'passatge',
  'rb', 'rambla', 'cr', 'carretera', 'ur', 'urbanitzacio', 'tr', 'travessera', 'pl']);
// ключ улицы: без вида (CL, PS…), служебных слов, номеров и апострофа кадастра («PORT N'APOS ALEGRE»); испанское
// «isla» — «illa», «Mare de Déu» — «Verge»
const SYN = { isla: 'illa', mare: 'verge', deu: '' };
const streetKey = s => words((s || '').replace(/&apos;|n'apos/gi, ' ')).filter((w, i) => !(i === 0 && TYPES.has(w)))
  .map(w => w in SYN ? SYN[w] : w).filter(w => w && w !== 'apos' && w !== 'n' && !/^\d+$/.test(w) && (!TYPES.has(w) || w === 'cami')).join(' ');
// та же улица: ключи равны, равны без пробелов («Montroig» — «MONT ROIG») или слова одного — часть слов другого
// («Rafael Termes» — «RAFAEL TERMES JUNYENT», «Doctor Robert» — «DOCTOR BARTOMEU ROBERT»); из нескольких — ближе по числу слов
function sameStreet(k, keys) {
  const c = k.replace(/ /g, ''), A = k.split(' ');
  let best = '', bd = Infinity;
  for (const q of keys) {
    if (q === k || q.replace(/ /g, '') === c) return q;
    const B = q.split(' '), sub = A.every(w => B.includes(w)) || B.length > 1 && B.every(w => A.includes(w));
    if (sub && Math.abs(A.length - B.length) < bd) { bd = Math.abs(A.length - B.length); best = q; }
  }
  return best;
}
function geocoder(ad) {
  // ключ улицы → [{ n, x, y }]
  const byStreet = new Map();
  for (const a of ad.list) {
    const k = streetKey(ad.streets.get(a.street) || ''), n = parseInt(a.num, 10);
    if (!k || !(n > 0)) continue;
    if (!byStreet.has(k)) byStreet.set(k, []);
    byStreet.get(k).push({ n, x: a.x, y: a.y });
  }
  const keys = [...byStreet.keys()];
  return (street, num) => {
    let k = streetKey(street);
    if (!byStreet.has(k)) k = sameStreet(k, keys);
    const list = byStreet.get(k), n = parseInt(num, 10);
    if (!list || !(n > 0)) return null;
    let best = null, bd = VCFG.numWin + 1;
    for (const a of list) { const d = Math.abs(a.n - n); if (d % 2 === 0 && d < bd) { bd = d; best = a; } }
    return best && [best.x, best.y];
  };
}

/* ---------- виды ---------- */
const SUPER = /mercadona|caprabo|lidl|aldi|^dia\b|bon ?preu|bonarea|bon area|consum|carrefour|condis|spar\b|suma\b|keisy|coviran|veritas|ametller/i;
const FUEL = /repsol|cepsa|moeve|\bbp\b|shell|galp|petronor|q8|esclatoil|plenoil|ballenoil|meroil|nieves|campsa|avia\b/i;
const ONE = new Set(['pharmacy', 'bank', 'supermarket', 'fuel']);
function overtureCat(p) {
  const h = p.hier || [], c = p.cat || '', top = h[0], two = h[1] || '';
  if (top === 'lodging') return /^(hotel|hostel|resort|bed_and_breakfast|service_apartment)$/.test(two) || c === 'guest_house' ? 'hotel' : null;
  if (/night_?club|dance_club/.test(c)) return 'club';
  if (top === 'food_and_drink') {
    if (two === 'restaurant') return 'restaurant';
    if (two === 'alcoholic_beverage_venue') return c === 'winery' ? null : 'bar';
    if (two === 'non_alcoholic_beverage_venue') return 'cafe';
    if (two === 'casual_eatery') {
      if (c === 'tapas_bar') return 'bar';
      if (c === 'cafe') return 'cafe';
      if (c === 'bakery') return 'bakery';
      if (/ice_cream|gelato|frozen_yogurt/.test(c)) return 'icecream';
      if (/fast_food|sandwich/.test(c)) return 'fastfood';
      if (/dessert|cupcake/.test(c)) return 'cafe';
      if (/candy|delicatessen/.test(c)) return 'shop';
      return 'restaurant';
    }
    return null;
  }
  if (/grocery_store/.test(c)) return SUPER.test(p.name || '') || SUPER.test(p.brand || '') ? 'supermarket' : 'convenience';
  if (c === 'supermarket') return 'supermarket';
  if (c === 'convenience_store') return 'convenience';
  // аптека — только настоящая (крест светится): drogueria, parafarmàcia, herbolari — обычный магазин
  if (c === 'pharmacy') return /drogu|parafarm|herbol/i.test(p.name || '') ? 'shop' : 'pharmacy';
  if (h.includes('bank_or_credit_union')) return 'bank';
  // АЗС — только с маркой топлива (у Overture сюда же попадают зарядки электромобилей: Wenea, Iberdrola…)
  if (h.includes('fueling_station')) return FUEL.test(p.name || '') || FUEL.test(p.brand || '') ? 'fuel' : null;
  return null;
}

/* ---------- слияние ---------- */
function mergeVenues({ venues, loc, utm, inside, ad, venueBrand, coastD }) {
  const stat = { src: { osm: venues.length, overture: 0, turisme: 0, extra: 0 }, dup: { overture: 0, turisme: 0, extra: 0 },
    skip: { overture: {}, turisme: {}, extra: {} }, release: null };
  const skip = (s, why) => { stat.skip[s][why] = (stat.skip[s][why] || 0) + 1; };
  for (const v of venues) v.src = 'osm';
  const add = (s, v) => {
    if (!inside(v.x, v.z, 20)) return skip(s, 'вне области');
    const R = v.cat === 'hotel' ? VCFG.dupHotelR : VCFG.dupR;
    // аптека, банк, супермаркет, АЗС того же вида ближе sameCatR — то же место при любом написании названия
    if (venues.some(o => { const d = Math.hypot(o.x - v.x, o.z - v.z); return d < R && (v.brand && o.brand === v.brand && o.cat === v.cat || sameName(o.name, v.name))
      || d < VCFG.sameCatR && o.cat === v.cat && ONE.has(v.cat); })) { stat.dup[s]++; return; }
    v.src = s; venues.push(v); stat.src[s]++;
  };
  const geo = geocoder(ad);
  const r1 = v => Math.round(v * 10) / 10;
  const mk = (cat, name, x, z, brand) => ({ cat, name, brand: brand || null, x: r1(x), z: r1(z), terrace: false, contour: false, cuisine: '' });

  /* свой список (главнее реестра и Overture) */
  if (fs.existsSync(EXTRA)) for (const e of JSON.parse(fs.readFileSync(EXTRA, 'utf8')).venues || []) {
    let q = null;
    if (Number.isFinite(e.x) && Number.isFinite(e.z)) q = [e.x, e.z];
    else if (e.addr) { const m = /^(.*\S)\s+(\d+)\s*\w?$/.exec(e.addr.trim()), u = m && geo(m[1], m[2]); q = u && loc(u); }
    if (!q) { skip('extra', 'адрес не найден'); continue; }
    if (!e.name || !e.cat) { skip('extra', 'нет name или cat'); continue; }
    add('extra', mk(e.cat, e.name, q[0], q[1], venueBrand({ name: e.name, brand: e.brand }, e.cat)));
  }

  /* реестр туризма */
  const ft = path.join(RAW, 'turisme.json');
  if (fs.existsSync(ft)) for (const t of JSON.parse(fs.readFileSync(ft, 'utf8'))) {
    let name = tidy(t.r_tol);
    if (!words(name).length) { skip('turisme', 'название — только вид'); continue; }
    const u = geo(t.nom_de_la_via, t.numero);
    if (!u) { skip('turisme', 'адрес не найден'); continue; }
    const apt = t.tipus_establiment === 'Apartaments Turístics', hostal = t.grup === 'Hostal o pensió';
    if (!/hotel|hostal|apart|house|rooms|casa|pensi/i.test(name)) name = (apt ? 'Apartaments ' : hostal ? 'Hostal ' : 'Hotel ') + name;
    const [x, z] = loc(u);
    add('turisme', mk('hotel', name, x, z));
  }

  /* Overture */
  const fo = path.join(RAW, 'overture-places.json');
  if (fs.existsSync(fo)) {
    const O = JSON.parse(fs.readFileSync(fo, 'utf8'));
    stat.release = O.release;
    // по уверенности: сначала надёжные (дубли внутри Overture отсекает тот же поиск похожего)
    for (const p of O.places.sort((a, b) => (b.conf || 0) - (a.conf || 0))) {
      const cat = overtureCat(p);
      if (!cat) continue;
      if (p.status === 'permanently_closed') { skip('overture', 'закрыто'); continue; }
      if (!(p.conf >= VCFG.conf)) { skip('overture', 'уверенность < ' + VCFG.conf); continue; }
      if ((p.src || []).some(s => s[1] === 'Apache-2.0')) { skip('overture', 'Foursquare (Apache 2.0)'); continue; }
      const name = tidy(p.name);
      if (!words(name).length && !p.brand) { skip('overture', 'без названия'); continue; }
      const [x, z] = loc(utm(p.lat, p.lon));
      add('overture', mk(cat, name || p.brand, x, z, venueBrand({ name, brand: p.brand }, cat)));
    }
  }

  /* сводка по набережной: Ribera (x −650…150) и Marítim (150…1800), берег ближе 150 м */
  const zone = v => coastD(v.x, v.z) < 150 ? (v.x < 150 && v.x > -650 ? 'ribera' : v.x >= 150 ? 'maritim' : null) : null;
  stat.front = {};
  for (const v of venues) {
    const k = zone(v);
    if (!k) continue;
    const o = stat.front[k] || (stat.front[k] = {});
    o[v.src] = (o[v.src] || 0) + 1;
    if (v.cat === 'hotel') o.hotel = (o.hotel || 0) + 1;
  }
  return { venues, stat };
}

module.exports = { VENUE_SRC, VCFG, mergeVenues, sameName, overtureCat, geocoder, streetKey };
