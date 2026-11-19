// Карта «Ситжес» — чтение PNG без библиотек (zlib из node): нужно конвейеру для плиток WMS (ортофото, ориентации
// склонов лидара). Модуль node (require), игра его не грузит.
//   readPNG(buf) → { w, h, data: Uint8Array RGBA (по 4 байта на пиксель, строки сверху вниз) }
//   writePNG(w, h, rgb) → Buffer (RGB, без сжатия фильтрами — для листов проверки)
// Поддержка: 8 бит на канал — серый, серый + альфа, RGB, RGBA, палитра (с tRNS); без чересстрочности.
const zlib = require('zlib');

function readPNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('не PNG: ' + buf.subarray(0, 200).toString());
  let p = 8, w = 0, h = 0, depth = 0, type = 0, inter = 0, pal = null, trns = null;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), kind = buf.toString('latin1', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    if (kind === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]; type = d[9]; inter = d[12]; }
    else if (kind === 'PLTE') pal = d;
    else if (kind === 'tRNS') trns = d;
    else if (kind === 'IDAT') idat.push(d);
    else if (kind === 'IEND') break;
    p += 12 + len;
  }
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  if (inter || (depth !== 8 && !(depth < 8 && (type === 0 || type === 3)))) throw new Error(`PNG: глубина ${depth}, вид ${type}, чересстрочность ${inter} — не поддерживается`);
  // строка в байтах; соседний «пиксель» для фильтров — bpp байт назад (при глубине < 8 — 1 байт)
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = Math.ceil(w * ch * depth / 8), bpp = Math.max(1, ch * depth / 8);
  const px = new Uint8Array(stride * h), out = new Uint8Array(w * h * 4);
  // фильтры строк: 0 нет, 1 слева, 2 сверху, 3 среднее, 4 Паэт
  for (let y = 0, q = 0; y < h; y++) {
    const f = raw[q++], row = y * stride, up = row - stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? px[row + i - bpp] : 0, b = y ? px[up + i] : 0, c = y && i >= bpp ? px[up + i - bpp] : 0;
      let v = raw[q++];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[row + i] = v & 255;
    }
  }
  if (depth < 8) {
    // упакованные отсчёты (1, 2, 4 бита) → по байту на отсчёт; серый растягиваем до 0…255
    const un = new Uint8Array(w * h), mask = (1 << depth) - 1, scale = type === 0 ? 255 / mask : 1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const bit = x * depth, v = (px[y * stride + (bit >> 3)] >> (8 - depth - (bit & 7))) & mask;
      un[y * w + x] = Math.round(v * scale);
    }
    return expand(un, w, h, 1, type, pal, trns, out);
  }
  return expand(px, w, h, ch, type, pal, trns, out);
}
function expand(px, w, h, ch, type, pal, trns, out) {
  for (let i = 0, n = w * h; i < n; i++) {
    const o = i * 4, s = i * ch;
    if (type === 3) { const k = px[s]; out[o] = pal[k * 3]; out[o + 1] = pal[k * 3 + 1]; out[o + 2] = pal[k * 3 + 2]; out[o + 3] = trns && k < trns.length ? trns[k] : 255; }
    else if (type === 0 || type === 4) { out[o] = out[o + 1] = out[o + 2] = px[s]; out[o + 3] = type === 4 ? px[s + 1] : 255; }
    else { out[o] = px[s]; out[o + 1] = px[s + 1]; out[o + 2] = px[s + 2]; out[o + 3] = type === 6 ? px[s + 3] : 255; }
  }
  return { w, h, data: out };
}

// запись RGB PNG (листы для проверки глазами): data — Uint8Array по 3 байта на пиксель
function writePNG(w, h, data) {
  const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = b => { let c = -1; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (kind, d) => {
    const len = Buffer.alloc(4), k = Buffer.from(kind, 'latin1'), cr = Buffer.alloc(4);
    len.writeUInt32BE(d.length); cr.writeUInt32BE(crc(Buffer.concat([k, d])));
    return Buffer.concat([len, k, d, cr]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) Buffer.from(data.buffer, data.byteOffset + y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

module.exports = { readPNG, writePNG };
