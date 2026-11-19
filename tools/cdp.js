// Запуск игры в безголовом Edge и выполнение выражений в странице — проверки без панели браузера.
// Не часть игры. Node 24+ (встроенный WebSocket), без npm.
//   node tools/cdp.js --eval "await __game.selfTest()"
//   node tools/cdp.js --inject tools/sitges/check.js --eval "await __sitgesCheck()" --save out.json --compare base.json
//   node tools/cdp.js --inject tools/sitges/check.js --eval "await __sitgesShots()" --dir shots
// Сам поднимает статический сервер на свободном порту (127.0.0.1, корень — папка игры: launch.json и чужие порты
// не нужны) и Edge с отдельным профилем во временной папке; ждёт загрузки всех скриптов (метка window.__loaded
// в index.html), выполняет --inject (файлы скриптов, как bench.js) и --eval (по порядку, с await верхнего уровня),
// печатает результат последнего --eval, закрывает браузер через CDP Browser.close (msedge.exe по имени не убивать —
// это браузер пользователя).
// Ключи:
//   --url путь        страница (по умолчанию index.html), можно с ?fps и т. п.
//   --inject файл     выполнить файл в странице (можно несколько)
//   --eval выражение  выполнить (можно несколько); строка печатается как есть, остальное — JSON
//   --save файл       записать результат последнего --eval в JSON
//   --compare файл    сравнить числа результата с JSON из файла (группы time и ms… — не сравниваются)
//   --dir папка       картинки из результата (поле png: { имя: dataURL }) — в файлы, из печати убираются
//   --shot файл.png   снимок страницы в конце
//   --size 1600x900   размер окна; --timeout 300 — секунд на всё; --headed — с окном (отладка)
// Видеокарта — настоящая (headless=new), вкладка на переднем плане (Page.bringToFront): время честное. Ошибки
// страницы (console.error, исключения) печатаются в конце; код выхода 1 — исключение в --eval или ошибки страницы.
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe']
  .find(p => fs.existsSync(p));

/* ---------- ключи ---------- */
const A = { url: 'index.html', inject: [], eval: [], size: '1600x900', timeout: 300 };
{
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i].replace(/^--/, '');
    if (k === 'headed') { A.headed = true; continue; }
    const v = argv[++i];
    if (v === undefined) { console.error('нет значения у --' + k); process.exit(2); }
    if (Array.isArray(A[k])) A[k].push(v); else A[k] = v;
  }
  if (!A.eval.length && !A.shot) { console.error('нужен --eval или --shot; ключи — в шапке tools/cdp.js'); process.exit(2); }
}

/* ---------- статический сервер ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const file = path.resolve(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep) && file !== ROOT) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});

/* ---------- CDP ---------- */
function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const wait = new Map(), handlers = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && wait.has(m.id)) { const w = wait.get(m.id); wait.delete(m.id); m.error ? w.rej(new Error(m.error.message)) : w.res(m.result); }
    else if (m.method) for (const h of handlers) h(m);
  };
  return new Promise((res, rej) => {
    ws.onopen = () => res({
      send: (method, params = {}) => new Promise((r, j) => { const n = ++id; wait.set(n, { res: r, rej: j }); ws.send(JSON.stringify({ id: n, method, params })); }),
      on: h => handlers.push(h),
      close: () => ws.close(),
    });
    ws.onerror = e => rej(new Error('WebSocket: ' + (e.message || 'ошибка')));
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJSON = url => new Promise((res, rej) => http.get(url, r => { let s = ''; r.on('data', d => s += d); r.on('end', () => { try { res(JSON.parse(s)); } catch (e) { rej(e); } }); }).on('error', rej));

// числа результата против эталона: [путь, было, стало]
function compare(base, cur, pre = '', out = []) {
  if (typeof cur === 'number' && typeof base === 'number') { if (Math.abs(cur - base) > 1e-9) out.push([pre, base, cur]); return out; }
  if (cur && typeof cur === 'object' && base && typeof base === 'object') {
    for (const k of new Set([...Object.keys(base), ...Object.keys(cur)])) {
      if (k === 'time' || /^ms/.test(k)) continue;
      const p = pre ? pre + '.' + k : k;
      if (!(k in cur)) out.push([p, '…', 'нет']); else if (!(k in base)) out.push([p, 'нет', '…']); else compare(base[k], cur[k], p, out);
    }
  }
  return out;
}

async function main() {
  if (!EDGE) throw new Error('не найден msedge.exe');
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/${A.url.replace(/^\/+/, '')}`;
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'racing-cdp-'));
  const [W, H] = A.size.split('x').map(Number);
  const edge = spawn(EDGE, [
    ...(A.headed ? [] : ['--headless=new']), '--remote-debugging-port=0', `--user-data-dir=${prof}`, `--window-size=${W},${H}`,
    '--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--ignore-gpu-blocklist', 'about:blank',
  ], { stdio: 'ignore' });
  const killTimer = setTimeout(() => { console.error(`время вышло (${A.timeout} с)`); finish(1); }, A.timeout * 1000);
  let browser = null, code = 0;
  const finish = async c => {
    clearTimeout(killTimer);
    try { if (browser) { await Promise.race([browser.send('Browser.close'), sleep(3000)]); browser.close(); } } catch (e) { /* уже закрыт */ }
    await sleep(500);
    if (edge.exitCode === null) edge.kill();            // только свой процесс
    server.close();
    for (let i = 0; i < 5; i++) { try { fs.rmSync(prof, { recursive: true, force: true }); break; } catch (e) { await sleep(400); } }
    process.exit(c);
  };

  try {
    // порт отладки Edge пишет в DevToolsActivePort профиля
    let dtp = null;
    for (let i = 0; i < 100 && !dtp; i++) { await sleep(100); try { dtp = fs.readFileSync(path.join(prof, 'DevToolsActivePort'), 'utf8').split('\n'); } catch (e) { /* ещё нет */ } }
    if (!dtp) throw new Error('Edge не открыл порт отладки');
    const dport = +dtp[0];
    browser = await connect(`ws://127.0.0.1:${dport}${dtp[1].trim()}`);
    let target = null;
    for (let i = 0; i < 50 && !target; i++) { target = (await getJSON(`http://127.0.0.1:${dport}/json/list`)).find(t => t.type === 'page'); if (!target) await sleep(100); }
    const page = await connect(target.webSocketDebuggerUrl);
    const errors = [];
    page.on(m => {
      if (m.method === 'Runtime.exceptionThrown') errors.push('исключение: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n').slice(0, 3).join(' | '));
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console.error: ' + m.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 300));
    });
    await page.send('Runtime.enable');
    await page.send('Page.enable');
    await page.send('Page.bringToFront');
    await page.send('Page.navigate', { url });
    const ev = async (expression, replMode = true) => {
      const r = await page.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, replMode });
      if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description || r.exceptionDetails.text).split('\n').slice(0, 4).join('\n'));
      return r.result.value;
    };
    // игра загрузилась (модули с CDN, затем все скрипты)
    let ready = false;
    for (let i = 0; i < 600 && !ready; i++) { await sleep(100); try { ready = await ev('window.__loaded === true'); if (!ready) { const t = await ev("document.getElementById('loading')?.textContent || ''"); if (/Не удалось/.test(t)) throw new Error(t); } } catch (e) { if (/Не удалось/.test(e.message)) throw e; /* страница ещё грузится */ } }
    if (!ready) throw new Error('скрипты игры не загрузились за 60 с (метка window.__loaded в index.html)');
    for (const f of A.inject) await ev(fs.readFileSync(path.resolve(f), 'utf8'), false);
    let result;
    for (const e of A.eval) result = await ev(e);
    if (A.shot) {
      const s = await page.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(A.shot, Buffer.from(s.data, 'base64'));
      console.error('снимок: ' + A.shot);
    }
    if (result && typeof result === 'object' && result.png && A.dir) {
      fs.mkdirSync(A.dir, { recursive: true });
      for (const [name, data] of Object.entries(result.png)) {
        const m = /^data:image\/(\w+);base64,(.*)$/.exec(data);
        if (!m) continue;
        const f = path.join(A.dir, name + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1]));
        fs.writeFileSync(f, Buffer.from(m[2], 'base64'));
        console.error('картинка: ' + f);
      }
      result.png = Object.keys(result.png);
    }
    if (A.save) fs.writeFileSync(A.save, JSON.stringify(result, null, 1) + '\n');
    if (A.compare) {
      const diff = compare(JSON.parse(fs.readFileSync(A.compare, 'utf8')), result);
      console.log(diff.length ? 'Отличия от ' + A.compare + ':\n' + diff.map(([p, a, b]) => `  ${p}: ${a} → ${b}`).join('\n') : 'Совпадает с ' + A.compare + ' (без времени).');
    } else if (result !== undefined) console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 1));
    if (errors.length) { console.error('Ошибки страницы:\n  ' + errors.slice(0, 20).join('\n  ')); code = 1; }
    page.close();
  } catch (e) {
    console.error('Ошибка: ' + e.message);
    code = 1;
  }
  await finish(code);
}
main();
