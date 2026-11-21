# Карта «Ситжес» — места Overture Maps (тема places) по прямоугольнику → JSON. Не часть игры; вызывает download.js
# (шаг overture-places) интерпретатором raw/.venv (там только пакет duckdb):
#   python tools/sitges/overture.py <юг> <запад> <север> <восток> <файл.json>
# Читает GeoParquet последнего выпуска из зеркала Azure (overturemapswestus2.blob.core.windows.net, без ключей; S3
# Amazon не везде открывается) по https; номер выпуска — из STAC https://stac.overturemaps.org/catalog.json (latest),
# список файлов — Azure List Blobs; фильтр по bbox.xmin / bbox.ymin (DuckDB читает только нужные группы строк,
# ≈ 1 мин). Пишет все места прямоугольника (отбор по видам и уверенности — в tools/sitges/build.js):
# { release, places: [{ id, name, cat, hier, basic, conf, status, brand, wikidata, addr, lon, lat,
#   src: [[dataset, license], …] }] }.
# Лицензия данных — у каждой записи своя (sources[].license): CDLA Permissive 2.0, Apache 2.0 (Foursquare), CC0 1.0
# (AllThePlaces); docs.overturemaps.org/guides/places.
import json
import re
import sys
import urllib.request

import duckdb

sys.stdout.reconfigure(encoding='utf-8')     # консоль Windows — не cp1252
s, w, n, e = map(float, sys.argv[1:5])
out = sys.argv[5]
con = duckdb.connect()
con.execute("INSTALL httpfs; LOAD httpfs;")
release = con.execute("SELECT latest FROM read_json_auto('https://stac.overturemaps.org/catalog.json')").fetchone()[0]
AZ = 'https://overturemapswestus2.blob.core.windows.net/release'
files, marker = [], ''
while True:
    url = f'{AZ}?restype=container&comp=list&prefix={release}/theme%3Dplaces/type%3Dplace/' + (f'&marker={marker}' if marker else '')
    xml = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'racing-game-map-tool/1.0'})).read().decode()
    files += [f'{AZ}/{m}' for m in re.findall(r'<Name>([^<]+\.parquet)</Name>', xml)]
    marker = (re.findall(r'<NextMarker>([^<]*)</NextMarker>', xml) or [''])[0]
    if not marker:
        break
rows = con.execute(f"""
  SELECT id, names.primary, taxonomy.primary, taxonomy.hierarchy, basic_category, confidence, operating_status,
         brand.names.primary, brand.wikidata, addresses[1].freeform, bbox.xmin, bbox.ymin,
         list_transform(sources, lambda x: [x.dataset, x.license])
  FROM read_parquet({json.dumps(files)})
  WHERE bbox.xmin BETWEEN {w} AND {e} AND bbox.ymin BETWEEN {s} AND {n}
""").fetchall()
keys = ['id', 'name', 'cat', 'hier', 'basic', 'conf', 'status', 'brand', 'wikidata', 'addr', 'lon', 'lat', 'src']
places = [dict(zip(keys, r)) for r in rows]
with open(out, 'w', encoding='utf-8') as f:
    json.dump({'release': release, 'places': places}, f, ensure_ascii=False)
print(f'{release}: файлов {len(files)}, мест {len(places)}')
