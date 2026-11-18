// Карта «Ситжес» — разбор GML кадастра INSPIRE BU (raw/catastro/*.gml) без библиотек. Модуль node (require).
// Координаты в файлах — уже EPSG:25831 (E N парами в gml:posList).
//   parts     — части зданий (buildingpart.gml): { bid, rings: [внешнее, …дыры], floors, below }
//   buildings — здания (building.gml): Map bid → { use, year, dwellings }
// readParcels() — участки INSPIRE CP (raw/parcels/*.cadastralparcel.gml): [{ ref, rings: [внешнее, …дыры], rustic }];
//   сельские участки с номером ≥ 9000 (дороги, ручьи — общественные земли) выброшены: это не «забор», а сама дорога
const fs = require('fs');
const path = require('path');
const { RAW } = require('./geo');

// назначение здания (currentUse) → код
const USES = ['1_residential', '2_agriculture', '3_industrial', '4_1_office', '4_2_retail', '4_3_publicServices'];

function gmlFile(suffix, sub = 'catastro') {
  const dir = path.join(RAW, sub);
  const f = fs.readdirSync(dir).find(n => n.endsWith(suffix));
  if (!f) throw new Error('нет файла *' + suffix + ' — сначала node tools/sitges/download.js');
  return fs.readFileSync(path.join(dir, f), 'utf8');
}
const posList = s => {
  const v = s.trim().split(/\s+/).map(Number), r = [];
  for (let i = 0; i + 1 < v.length; i += 2) r.push([v[i], v[i + 1]]);
  if (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) r.pop();
  return r;
};
// кольца одного объекта: внешнее (gml:exterior) и дыры (gml:interior)
function rings(block) {
  const out = [];
  for (const m of block.matchAll(/<gml:(exterior|interior)>[\s\S]*?<gml:posList[^>]*>([^<]+)<\/gml:posList>/g))
    out.push({ outer: m[1] === 'exterior', pts: posList(m[2]) });
  return out;
}

function readCatastro() {
  const parts = [];
  const pg = gmlFile('.buildingpart.gml');
  for (const m of pg.matchAll(/<bu-ext2d:BuildingPart gml:id="ES\.SDGC\.BU\.([^"_]+)_part\d+">([\s\S]*?)<\/bu-ext2d:BuildingPart>/g)) {
    const b = m[2];
    const floors = +(b.match(/<bu-ext2d:numberOfFloorsAboveGround>(\d+)</) || [])[1] || 0;
    const below = +(b.match(/<bu-ext2d:numberOfFloorsBelowGround>(\d+)</) || [])[1] || 0;
    const rs = rings(b);
    // у части может быть несколько внешних колец (несколько PolygonPatch) — каждое отдельной частью
    let cur = null;
    for (const r of rs) {
      if (r.outer) parts.push(cur = { bid: m[1], rings: [r.pts], floors, below });
      else if (cur) cur.rings.push(r.pts);
    }
  }
  const buildings = new Map();
  const bg = gmlFile('.building.gml');
  for (const m of bg.matchAll(/<bu-ext2d:Building gml:id="ES\.SDGC\.BU\.([^"]+)">([\s\S]*?)<\/bu-ext2d:Building>/g)) {
    const b = m[2];
    const use = USES.indexOf((b.match(/<bu-ext2d:currentUse>([^<]+)</) || [])[1]);
    const y = (b.match(/<bu-core2d:beginning>(\d{4})-/) || [])[1];
    const dw = +(b.match(/<bu-ext2d:numberOfDwellings>(\d+)</) || [])[1] || 0;
    buildings.set(m[1], { use: Math.max(use, 0), year: y ? +y : 0, dwellings: dw });
  }
  return { parts, buildings };
}

function readParcels() {
  const out = [], stat = { all: 0, publicRustic: 0 };
  const g = gmlFile('.cadastralparcel.gml', 'parcels');
  for (const m of g.matchAll(/<cp:CadastralParcel gml:id="ES\.SDGC\.CP\.([^"]+)">([\s\S]*?)<\/cp:CadastralParcel>/g)) {
    stat.all++;
    // сельский участок: 08270 A ППП NNNNN (полигон, номер); номера 9000+ — дороги и ручьи
    const ref = m[1], rustic = /^\d{5}[A-Z]/.test(ref);
    if (rustic && +ref.slice(9, 14) >= 9000) { stat.publicRustic++; continue; }
    let cur = null;
    for (const r of rings(m[2])) {
      if (r.outer) out.push(cur = { ref, rings: [r.pts], rustic });
      else if (cur) cur.rings.push(r.pts);
    }
  }
  return { parcels: out, stat };
}

module.exports = { readCatastro, readParcels, USES };
