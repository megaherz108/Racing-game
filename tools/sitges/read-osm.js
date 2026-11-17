// Карта «Ситжес» — разбор raw/osm.json (Overpass, out geom) в UTM 31N. Модуль node (require).
// Возвращает { roads, rails, coast, areas, lines, buildings, pois }; координаты — [E, N] в метрах.
const fs = require('fs');
const path = require('path');
const { RAW, utm } = require('./geo');
const { stitch, centroid } = require('./util');

// классы улиц (порядок = код в данных; *_link → основной класс)
const ROAD_CLASSES = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential',
  'living_street', 'service', 'pedestrian', 'track', 'footway', 'path', 'cycleway', 'steps', 'other'];
// покрытия (код 0 — не указано)
const SURFACES = ['', 'asphalt', 'paving_stones', 'concrete', 'sett', 'cobblestone', 'compacted', 'gravel', 'unpaved',
  'dirt', 'ground', 'sand', 'grass', 'wood', 'metal', 'other'];
// площадные объекты (код = индекс)
const AREA_KINDS = ['beach', 'sand', 'marina', 'park', 'garden', 'golf', 'pitch', 'playground', 'water', 'wood',
  'scrub', 'grass', 'cemetery', 'farmland', 'pier', 'breakwater', 'quay', 'pool', 'rock', 'railway'];
// линейные объекты, кроме улиц и ж/д
const LINE_KINDS = ['breakwater', 'groyne', 'pier', 'quay', 'stream', 'cliff'];

function areaKind(t) {
  if (t.natural === 'beach') return 'beach';
  if (t.natural === 'sand') return 'sand';
  if (t.leisure === 'marina') return 'marina';
  if (t.leisure === 'park') return 'park';
  if (t.leisure === 'garden') return 'garden';
  if (t.leisure === 'golf_course') return 'golf';
  if (t.leisure === 'pitch' || t.leisure === 'sports_centre' || t.leisure === 'stadium') return 'pitch';
  if (t.leisure === 'playground') return 'playground';
  if (t.leisure === 'swimming_pool') return 'pool';
  if (t.natural === 'water' || t.landuse === 'reservoir' || t.landuse === 'basin') return 'water';
  if (t.natural === 'wood' || t.landuse === 'forest') return 'wood';
  if (t.natural === 'scrub') return 'scrub';
  if (t.natural === 'bare_rock') return 'rock';
  if (t.natural === 'grassland' || ['grass', 'meadow', 'recreation_ground', 'village_green'].includes(t.landuse)) return 'grass';
  if (t.landuse === 'cemetery') return 'cemetery';
  if (['farmland', 'orchard', 'vineyard', 'allotments'].includes(t.landuse)) return 'farmland';
  if (t.landuse === 'railway') return 'railway';
  if (t.man_made === 'pier') return 'pier';
  if (t.man_made === 'breakwater' || t.man_made === 'groyne') return 'breakwater';
  if (t.man_made === 'quay') return 'quay';
  return null;
}
function lineKind(t) {
  if (t.man_made === 'breakwater') return 'breakwater';
  if (t.man_made === 'groyne') return 'groyne';
  if (t.man_made === 'pier') return 'pier';
  if (t.man_made === 'quay') return 'quay';
  if (t.waterway === 'stream' || t.waterway === 'river' || t.waterway === 'canal' || t.waterway === 'drain') return 'stream';
  if (t.natural === 'cliff') return 'cliff';
  return null;
}
// что из названных объектов идёт в список ориентиров
function poiType(t) {
  if (t.amenity === 'place_of_worship') return 'church';
  if (t.amenity === 'townhall') return 'townhall';
  if (t.amenity === 'marketplace') return 'market';
  if (['theatre', 'casino', 'arts_centre', 'library', 'community_centre', 'cinema'].includes(t.amenity)) return 'culture';
  if (['school', 'college', 'hospital', 'police', 'fire_station', 'post_office'].includes(t.amenity)) return 'public';
  if (t.railway === 'station' || t.public_transport === 'station') return 'station';
  if (t.tourism === 'hotel') return 'hotel';
  if (['museum', 'attraction', 'viewpoint'].includes(t.tourism)) return t.tourism;
  if (t.historic) return 'historic';
  if (t.man_made === 'lighthouse' || t.man_made === 'tower') return 'tower';
  if (t.leisure === 'marina') return 'marina';
  if (t.leisure === 'golf_course') return 'golf';
  if (t.leisure === 'park') return 'park';
  if (t.natural === 'beach') return 'beach';
  if (['church', 'cathedral', 'chapel'].includes(t.building)) return 'church';
  if (t.building === 'train_station') return 'station';
  if (t.building === 'hotel') return 'hotel';
  if (t.place && ['suburb', 'neighbourhood', 'quarter', 'town', 'hamlet', 'locality'].includes(t.place)) return 'place';
  return null;
}

function readOSM() {
  const els = JSON.parse(fs.readFileSync(path.join(RAW, 'osm.json'), 'utf8')).elements;
  const P = g => g.map(p => utm(p.lat, p.lon));
  const roads = [], rails = [], coastParts = [], areas = [], lines = [], buildings = [], pois = [];
  const closed = g => g.length > 3 && g[0].lat === g[g.length - 1].lat && g[0].lon === g[g.length - 1].lon;
  for (const e of els) {
    const t = e.tags || {};
    if (e.type === 'node') {
      const ty = t.name && poiType(t);
      if (ty) pois.push({ name: t.name, type: ty, p: utm(e.lat, e.lon) });
      continue;
    }
    if (e.type === 'way') {
      if (!e.geometry || e.geometry.length < 2) continue;
      const pts = P(e.geometry);
      if (t.highway && !t.area && t.highway !== 'platform' && t.highway !== 'construction' && t.highway !== 'proposed') {
        let cl = t.highway.replace(/_link$/, '');
        if (!ROAD_CLASSES.includes(cl)) cl = cl === 'bridleway' || cl === 'corridor' ? 'footway' : 'other';
        const width = parseFloat(String(t.width || '').replace(',', '.'));
        roads.push({
          cls: cl, pts, name: t.name || '', surface: SURFACES.includes(t.surface) ? t.surface : t.surface ? 'other' : '',
          oneway: t.oneway === 'yes' || t.oneway === '1' || t.junction === 'roundabout' ? 1 : t.oneway === '-1' ? -1 : 0,
          bridge: !!t.bridge && t.bridge !== 'no', tunnel: !!t.tunnel && t.tunnel !== 'no',
          layer: parseInt(t.layer, 10) || 0, width: Number.isFinite(width) && width > 0 && width < 60 ? width : 0,
          lanes: parseInt(t.lanes, 10) || 0,
        });
        continue;
      }
      if (t.railway === 'rail' || t.railway === 'light_rail' || t.railway === 'narrow_gauge') {
        rails.push({ pts, bridge: !!t.bridge && t.bridge !== 'no', tunnel: !!t.tunnel && t.tunnel !== 'no', service: t.service || '' });
        continue;
      }
      if (t.natural === 'coastline') { coastParts.push(pts); continue; }
      if (t.building) {
        if (!closed(e.geometry)) continue;
        buildings.push({ ring: pts.slice(0, -1), tags: t });
        const ty = t.name && poiType(t);
        if (ty) pois.push({ name: t.name, type: ty, p: centroid(pts.slice(0, -1)), ring: pts });
        continue;
      }
      if (t.name && closed(e.geometry)) { const ty = poiType(t); if (ty) pois.push({ name: t.name, type: ty, p: centroid(pts.slice(0, -1)), ring: pts }); }
      const ak = closed(e.geometry) && areaKind(t);
      if (ak) { areas.push({ kind: ak, ring: pts.slice(0, -1), name: t.name || '' }); continue; }
      const lk = lineKind(t);
      if (lk) lines.push({ kind: lk, pts });
      continue;
    }
    if (e.type === 'relation' && e.members) {
      // мультиполигоны: внешние кольца склеиваем из кусков, внутренние пропускаем
      const outer = e.members.filter(m => m.type === 'way' && m.role !== 'inner' && m.geometry).map(m => P(m.geometry));
      if (!outer.length) continue;
      const rings = stitch(outer).filter(r => r.length > 3).map(r => r.slice(0, -1));
      if (t.building) {
        for (const r of rings) buildings.push({ ring: r, tags: t });
        const ty = t.name && poiType(t);
        if (ty) pois.push({ name: t.name, type: ty, p: centroid(rings[0]), ring: rings[0] });
        continue;
      }
      if (t.name) { const ty = poiType(t); if (ty) { const big = rings.reduce((a, b) => (a.length > b.length ? a : b)); pois.push({ name: t.name, type: ty, p: centroid(big), ring: big }); } }
      const ak = areaKind(t);
      if (ak) for (const r of rings) areas.push({ kind: ak, ring: r, name: t.name || '' });
    }
  }
  const coast = stitch(coastParts);
  return { roads, rails, coast, areas, lines, buildings, pois };
}

module.exports = { readOSM, ROAD_CLASSES, SURFACES, AREA_KINDS, LINE_KINDS };
