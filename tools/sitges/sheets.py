# Карта «Ситжес» — листы-обзоры фото-образцов: кадры каждой папки по 12 штук (4 × 3, по 320 px) с именем файла.
#   python tools/sitges/sheets.py                       — tools/sitges/raw/photos/sv → tools/sitges/raw/photos/sheets
#   python tools/sitges/sheets.py <папка с видами> <папка для листов>
# Зачем: один лист ≈ 1,6 тыс. токенов вместо 12 × 0,5–1,5 тыс. — ИИ просматривает кадры листами, а отдельный файл
# открывает, только если на листе что-то неясно. Нужен Pillow (pip install pillow).
import sys, os
from PIL import Image, ImageDraw

here = os.path.dirname(os.path.abspath(__file__))
src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, 'raw', 'photos', 'sv')
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(here, 'raw', 'photos', 'sheets')
os.makedirs(out, exist_ok=True)
for kind in sorted(os.listdir(src)):
    d = os.path.join(src, kind)
    if not os.path.isdir(d) or os.path.abspath(d) == os.path.abspath(out):
        continue
    files = sorted(f for f in os.listdir(d) if f.lower().endswith(('.jpg', '.jpeg', '.png')))
    for s in range(0, len(files), 12):
        part = files[s:s + 12]
        sheet = Image.new('RGB', (4 * 320, 3 * 320), 'white')
        dr = ImageDraw.Draw(sheet)
        for i, f in enumerate(part):
            im = Image.open(os.path.join(d, f)).convert('RGB').resize((320, 320))
            x, y = (i % 4) * 320, (i // 4) * 320
            sheet.paste(im, (x, y))
            dr.rectangle([x, y, x + 320, y + 14], fill='black')
            dr.text((x + 3, y + 1), f[:52], fill='white')
        sheet.save(os.path.join(out, f'{kind}-{s // 12 + 1}.jpg'), quality=85)
        print(kind, s // 12 + 1, len(part))
