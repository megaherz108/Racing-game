// Упаковка записей звуков в js/sound-data.js (base64 внутри обычного скрипта).
// Зачем: игра открывается с диска (file://), а оттуда браузер не даёт загрузить аудиофайл через fetch().
// Скрипт с данными грузится как любой другой, а Sound (js/audio.js) декодирует записи после старта звука.
//
// Список — sounds/sounds.json: { "имя": { "file": "waves.mp3", "loop": true, "gain": 1, "maxSec": 40,
//   "author": "...", "license": "CC0", "url": "https://..." } }.
// Имена, которые понимает игра (js/audio-env.js, js/audio.js):
//   петли фонов: waves, city, birds, night, rain, gulls, hydrant
//   разовые:     gull, bird, horn, shiphorn, bell, glass (варианты одного звука: gull_2, gull_3…)
// maxSec — обрезать длинный MP3 (по границам кадров, без перекодирования). Из json же собирается sounds/CREDITS.md.
// Запуск: node tools/pack-sounds.js
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), DIR = path.join(ROOT, 'sounds'), LIST = path.join(DIR, 'sounds.json');
const OUT = path.join(ROOT, 'js', 'sound-data.js');
const MIME = { '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4' };

// MP3: обрезка до maxSec секунд по кадрам. Пропускаем тег ID3v2 и служебный кадр Xing/Info (в нём число кадров
// исходного файла — после обрезки оно неверно).
const BR = { 1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], 2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160] };
const SR = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
function cutMp3(buf, maxSec) {
  let i = 0;
  if (buf.slice(0, 3).toString() === 'ID3') i = 10 + ((buf[6] << 21) | (buf[7] << 14) | (buf[8] << 7) | buf[9]);
  const parts = [];
  let t = 0, first = true;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) { i++; continue; }
    const ver = (buf[i + 1] >> 3) & 3, layer = (buf[i + 1] >> 1) & 3, bri = buf[i + 2] >> 4, sri = (buf[i + 2] >> 2) & 3, pad = (buf[i + 2] >> 1) & 1;
    if (ver === 1 || layer !== 1 || bri === 0 || bri === 15 || sri === 3) { i++; continue; }     // только Layer III
    const v1 = ver === 3, br = BR[v1 ? 1 : 2][bri] * 1000, sr = SR[ver][sri];
    const len = Math.floor((v1 ? 144 : 72) * br / sr) + pad, spf = v1 ? 1152 : 576;
    if (i + len > buf.length) break;
    const frame = buf.slice(i, i + len);
    const tag = frame.indexOf('Xing') >= 0 || frame.indexOf('Info') >= 0;
    if (!(first && tag)) { parts.push(frame); t += spf / sr; }
    first = false; i += len;
    if (maxSec && t >= maxSec) break;
  }
  return { data: Buffer.concat(parts), sec: t };
}

const list = fs.existsSync(LIST) ? JSON.parse(fs.readFileSync(LIST, 'utf8')) : {};
const rows = [], credits = [];
let total = 0;
for (const [name, s] of Object.entries(list)) {
  const file = path.join(DIR, s.file), ext = path.extname(s.file).toLowerCase();
  if (!fs.existsSync(file)) { console.warn('Нет файла ' + s.file + ' — пропускаю ' + name); continue; }
  let data = fs.readFileSync(file), note = '';
  if (ext === '.mp3') { const c = cutMp3(data, s.maxSec); data = c.data; note = c.sec.toFixed(1) + ' с'; }
  total += data.length;
  const meta = { type: MIME[ext] || 'audio/mpeg', loop: !!s.loop, gain: s.gain ?? 1 };
  rows.push('  ' + JSON.stringify(name) + ': { ' + Object.entries(meta).map(([k, v]) => k + ': ' + JSON.stringify(v)).join(', ') +
    ", b64: '" + data.toString('base64') + "' },");
  credits.push(`| ${name} | ${s.file} | ${s.author || '—'} | ${s.license || '—'} | ${s.url || '—'} |`);
  console.log(name.padEnd(10) + (data.length / 1024).toFixed(0).padStart(6) + ' КБ  ' + note);
}

fs.writeFileSync(OUT, [
  '// Записи звуков в base64 — СГЕНЕРИРОВАНО tools/pack-sounds.js из sounds/sounds.json, не править руками.',
  '// Встроены в скрипт, потому что игра открывается с диска: fetch() аудиофайлов с file:// браузер не разрешает.',
  '// Декодирует их Sound.init() (js/audio.js); без записей звучит синтез.',
  '// Определяет: SOUND_DATA.',
  '// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.',
  '',
  'const SOUND_DATA = {',
  ...rows,
  '};',
  '',
].join('\n'));
fs.writeFileSync(path.join(DIR, 'CREDITS.md'), [
  '# Звуки: авторы и лицензии',
  '',
  'Сгенерировано `node tools/pack-sounds.js` из `sounds/sounds.json`.',
  '',
  '| Имя | Файл | Автор | Лицензия | Источник |',
  '|---|---|---|---|---|',
  ...credits,
  '',
].join('\n'));
console.log('Итого ' + (total / 1024).toFixed(0) + ' КБ (в base64 ≈ ' + (total * 4 / 3 / 1024).toFixed(0) + ' КБ) → js/sound-data.js');
