// Карта глобальных имён: какой файл что определяет на верхнем уровне и чьи имена использует.
// Все скрипты игры делят одну глобальную область видимости (см. FILES в index.html), поэтому эта карта
// заменяет import/export: по ней видно, где искать определение и что сломается при переименовании.
//
//   node tools/deps.js              — карта по всем файлам (DEF — определяет, USE — использует)
//   node tools/deps.js js/race.js   — только для указанных файлов
//   node tools/deps.js --who NAME   — где определено имя и кто его использует
//   node tools/deps.js --headers    — обновить строки «// Определяет:» и «// Использует:» в шапках файлов
//   node tools/deps.js --check      — проверить, что шапки актуальны (код выхода 1, если нет)
//
// Разбор упрощённый (регулярные выражения, без парсера): имена с «_» в начале (временные векторы)
// не показываются; локальная переменная с тем же именем, что и глобал, скрывает использование.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const html = read('index.html');
const FILES = JSON.parse(html.match(/const FILES = (\[[\s\S]*?\]);/)[1]);

const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ').replace(/\$\{/g, ' (')
  .replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g, '""');
const depthOf = t => { let d = 0; for (const c of t) { if ('([{'.includes(c)) d++; else if (')]}'.includes(c)) d--; } return d; };
function splitTop(body) {
  const parts = []; let depth = 0, start = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
    else if (ch === ';' && depth === 0) { parts.push(body.slice(start, i)); return parts; }
    else if (ch === ',' && depth === 0) { parts.push(body.slice(start, i)); start = i + 1; }
  }
  parts.push(body.slice(start));
  return parts;
}
function declNames(stmt) {
  const out = [];
  for (const part of splitTop(stmt.replace(/^\s*(const|let|var)\s+/, ''))) {
    const t = part.trim();
    if (t[0] === '{') t.slice(1, t.indexOf('}')).split(',').forEach(s => { const n = s.split('=')[0].split(':').pop().trim(); if (n) out.push(n); });
    else { const m = t.match(/^([A-Za-z_$][\w$]*)/); if (m) out.push(m[1]); }
  }
  return out;
}

// определения верхнего уровня (столбец 0) и методы Object.assign(X, { … })
function topDefs(src) {
  const L = strip(src).split('\n'), names = [];
  for (let i = 0; i < L.length; i++) {
    const s = L[i];
    let m;
    if ((m = s.match(/^(?:async\s+)?(?:function\*?|class)\s+([A-Za-z_$][\w$]*)/))) names.push(m[1]);
    else if (/^(const|let|var)\s/.test(s)) {
      let stmt = s, d = depthOf(s), j = i;
      while ((d > 0 || /,\s*$/.test(stmt)) && j + 1 < L.length) { j++; stmt += ' ' + L[j]; d += depthOf(L[j]); }
      names.push(...declNames(stmt));
    } else if ((m = s.match(/^Object\.assign\(([A-Za-z_$][\w$]*),\s*\{/))) {
      for (let j = i + 1; j < L.length && !/^\}\);/.test(L[j]); j++) {
        const mm = L[j].match(/^  (?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/);
        if (mm) names.push(m[1] + '.' + mm[1]);
      }
    }
  }
  return [...new Set(names)];
}
// локальные объявления (с отступом) — скрывают глобалы с тем же именем
const localDecls = src => new Set([...strip(src).matchAll(/^[ \t]+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]));

function build() {
  const owner = Object.create(null), map = {};
  for (const f of FILES) {
    const defs = topDefs(read(f));
    map[f] = { defs, uses: {} };
    for (const n of defs) if (!n.includes('.') && !owner[n]) owner[n] = f;
  }
  for (const f of FILES) {
    const src = read(f), code = strip(src).replace(/\.\.\./g, ' '), local = localDecls(src), own = new Set(map[f].defs);
    const ids = new Set();
    for (const m of code.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)(?![\w$])(?!\s*:(?!:))/g)) ids.add(m[1]);
    // «a ? b : c» — b тоже использование: добавить имена перед « :», если перед ними стоит «?»
    for (const m of code.matchAll(/\?\s*([A-Za-z_$][\w$]*)\s*:/g)) ids.add(m[1]);
    for (const n of ids) {
      const o = owner[n];
      if (!o || o === f || own.has(n) || local.has(n) || n.startsWith('_')) continue;
      (map[f].uses[o] = map[f].uses[o] || []).push(n);
    }
    map[f].uses = Object.fromEntries(Object.entries(map[f].uses).sort((a, b) => FILES.indexOf(a[0]) - FILES.indexOf(b[0])));
  }
  return { map, owner };
}

const wrapLine = (label, text) => {
  const out = []; let cur = '// ' + label + ' ';
  for (const w of text.split(' ')) {
    if (cur.length + w.length > 118 && cur.trim() !== '//') { out.push(cur.trimEnd()); cur = '//   '; }
    cur += w + ' ';
  }
  out.push(cur.trimEnd());
  return out;
};
function headerFor(f, { map }) {
  const defs = map[f].defs.filter(n => !n.split('.').pop().startsWith('_'));
  const uses = Object.entries(map[f].uses).map(([o, ns]) => ns.join(', ') + ' (' + o + ')');
  const out = [];
  if (defs.length) out.push(...wrapLine('Определяет:', defs.join(', ') + '.'));
  if (uses.length) out.push(...wrapLine('Использует:', uses.join('; ') + '.'));
  return out;
}
// заменить сгенерированный блок в шапке (или вставить его перед строкой «Обычный (не модульный) скрипт»)
function applyHeader(src, hdr) {
  const eol = src.includes('\r\n') ? '\r\n' : '\n';
  const L = src.replace(/\r/g, '').split('\n');
  let end = L.findIndex(s => !s.startsWith('//'));
  if (end < 0) end = L.length;
  const head = [];
  for (let i = 0; i < end; i++) {
    if (/^\/\/ (Определяет|Использует):/.test(L[i])) { while (i + 1 < end && /^\/\/   /.test(L[i + 1])) i++; continue; }
    head.push(L[i]);
  }
  let at = head.findIndex(s => s.startsWith('// Обычный (не модульный) скрипт'));
  if (at < 0) at = head.length;
  head.splice(at, 0, ...hdr);
  return [...head, ...L.slice(end)].join(eol);
}

const args = process.argv.slice(2);
const data = build();
if (args[0] === '--headers' || args[0] === '--check') {
  const stale = [];
  for (const f of FILES) {
    const src = read(f), next = applyHeader(src, headerFor(f, data));
    if (next !== src) { stale.push(f); if (args[0] === '--headers') fs.writeFileSync(path.join(ROOT, f), next); }
  }
  if (args[0] === '--check') {
    console.log(stale.length ? 'Устарели шапки: ' + stale.join(', ') + '\nОбновить: node tools/deps.js --headers' : 'Шапки актуальны.');
    process.exit(stale.length ? 1 : 0);
  }
  console.log(stale.length ? 'Обновлены шапки: ' + stale.join(', ') : 'Шапки уже актуальны.');
} else if (args[0] === '--who') {
  const n = args[1];
  console.log(n + ': определено в ' + (data.owner[n] || FILES.find(f => data.map[f].defs.includes(n)) || '— (не найдено)'));
  for (const f of FILES) if (Object.values(data.map[f].uses).some(ns => ns.includes(n))) console.log('  использует ' + f);
} else {
  for (const f of FILES) {
    if (args.length && !args.some(a => f.endsWith(a.replace(/\\/g, '/')))) continue;
    console.log('## ' + f + '\nDEF: ' + data.map[f].defs.filter(n => !n.split('.').pop().startsWith('_')).join(', '));
    for (const [o, ns] of Object.entries(data.map[f].uses)) console.log('  USE ' + o + ': ' + ns.join(', '));
  }
}
