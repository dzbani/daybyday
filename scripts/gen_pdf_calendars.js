// Generuje kalendarze PDF do druku (A4) w katalogu pdf/ — headless Chrome drukuje HTML ze stylem strony
// (czcionki Outfit/Instrument Serif z fonts/, polskie znaki bez kombinacji).
// Warianty na rok: roczny poziomo, roczny pionowo, miesięczny (12 stron: dni wolne, święta, imieniny).
// Dane: scripts/cal_data.js (silnik dni wolnych z kalendarz.html, swieta_data.js, home_names.js).
//
// Użycie: node scripts/gen_pdf_calendars.js [--years=2026,2027,...] [--only=roczny-poziomo|roczny-pionowo|miesieczny] [--html-only]
//   --html-only: zapisuje tylko HTML do katalogu tymczasowego i wypisuje jego ścieżkę (podgląd bez Chrome).
// Wymaga zainstalowanego Chrome lub Edge (ścieżki Windows standardowe albo zmienna CHROME_PATH).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { pathToFileURL } = require('url');
const C = require('./cal_data');

const ROOT = C.ROOT;
const OUT_DIR = path.join(ROOT, 'pdf');
const DEFAULT_YEARS = [2026, 2027, 2028, 2029, 2030, 2031, 2032];
const args = process.argv.slice(2);
const argVal = k => (args.find(a => a.startsWith('--' + k + '=')) || '').split('=')[1];
const YEARS = (argVal('years') || DEFAULT_YEARS.join(',')).split(',').map(Number);
const ONLY = argVal('only');
const HTML_ONLY = args.includes('--html-only');

const VARIANTS = {
  'roczny-poziomo': { label: 'roczny, poziomo', build: y => yearHtml(y, 'landscape') },
  'roczny-pionowo': { label: 'roczny, pionowo', build: y => yearHtml(y, 'portrait') },
  'miesieczny': { label: 'miesięczny z imieninami i świętami', build: y => monthlyHtml(y) },
};

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fontsCss = pathToFileURL(path.join(ROOT, 'fonts.css')).href; // Instrument Serif (statyczna, osadza się jako TrueType)

// Outfit w PDF: statyczne instancje z fonts/pdf/ (scripts/make_pdf_fonts.py). Zmienna Outfit z fonts/*.woff2
// trafiałaby do PDF-a jako grafika liter (Type3): pliki ~315 KB zamiast kilkudziesięciu.
const outfitPdfFaces = (() => {
  const css = fs.readFileSync(path.join(ROOT, 'fonts.css'), 'utf8');
  const blocks = (css.match(/@font-face\s*\{[^}]*\}/g) || []).filter(b => /font-family:\s*'Outfit'/.test(b));
  const out = [];
  for (const b of blocks) {
    const part = /outfit-latin-ext/.test(b) ? 'latin-ext' : 'latin';
    const range = (b.match(/unicode-range:\s*([^;]+);/) || [])[1];
    for (const w of [400, 500, 600]) {
      const url = pathToFileURL(path.join(ROOT, 'fonts', 'pdf', `outfit-w${w}-${part}.ttf`)).href;
      if (!fs.existsSync(path.join(ROOT, 'fonts', 'pdf', `outfit-w${w}-${part}.ttf`))) throw new Error('Brak fonts/pdf/*.ttf — uruchom: python scripts/make_pdf_fonts.py');
      out.push(`@font-face{font-family:'OutfitPDF';font-weight:${w};src:url(${url}) format('truetype');unicode-range:${range}}`);
    }
  }
  return out.join('\n');
})();

const BASE_CSS = `
  ${outfitPdfFaces}
  *{box-sizing:border-box;margin:0;padding:0}
  :root{--text:#1A1916;--muted:#6B6762;--line:#D9D5CE;--red:#C0392B;--redbg:#FBE9E5;--sat:#8A8680;--accent:#E8936A}
  html,body{font-family:'OutfitPDF','Outfit',sans-serif;color:var(--text);-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .serif{font-family:'Instrument Serif',serif;font-weight:400}
  a{color:inherit;text-decoration:none}
  table{border-collapse:collapse;width:100%}
`;

function monthGrid(y, m) {
  const first = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const n = C.daysInMonth(y, m);
  const rows = [];
  let d = 1 - first;
  for (let r = 0; r < 6; r++) {
    const cells = [];
    const wd = Math.min(Math.max(d, 1), n);
    cells.push({ week: C.isoWeek(y, m, d < 1 ? 1 : (d > n ? n : d)) });
    for (let c = 0; c < 7; c++, d++) cells.push(d >= 1 && d <= n ? { d, dow: (c + 1) % 7, free: C.freeDayName(y, m, d) } : null);
    if (cells.slice(1).every(x => x === null)) { cells.length = 0; }
    rows.push(cells);
  }
  return rows.filter(r => r.length);
}

// ── roczny ───────────────────────────────────────────────────────────────────
function yearHtml(y, orient) {
  const landscape = orient === 'landscape';
  const cols = landscape ? 4 : 3;
  const free = C.freeDays(y);
  const months = [];
  for (let m = 1; m <= 12; m++) {
    const rows = monthGrid(y, m);
    const body = rows.map(r => '<tr><td class="wk">' + r[0].week + '</td>' + r.slice(1).map(c => {
      if (!c) return '<td></td>';
      const cls = [c.free ? 'free' : '', c.dow === 0 ? 'sun' : '', c.dow === 6 ? 'sat' : ''].filter(Boolean).join(' ');
      return `<td class="${cls}">${c.d}</td>`;
    }).join('') + '</tr>').join('');
    months.push(`<section class="month"><h2 class="serif">${C.PL_MONTHS[m - 1]}</h2><table><thead><tr><th class="wk">T</th>${['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb', 'Nd'].map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></section>`);
  }
  const legend = free.map(f => `<li><b>${f.d} ${C.ROMAN[f.m - 1]}</b> ${esc(f.name)}</li>`).join('');
  const weekendFree = free.filter(f => f.dow === 0 || f.dow === 6).length;
  const css = BASE_CSS + `
    @page{size:A4 ${orient};margin:${landscape ? '9mm 11mm' : '10mm 12mm'}}
    body{width:100%}
    header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:1.2px solid var(--text);padding-bottom:${landscape ? '2mm' : '3mm'};margin-bottom:${landscape ? '4mm' : '5mm'}}
    header h1{font-size:${landscape ? '34pt' : '40pt'};line-height:1}
    header .site{font-size:8.5pt;color:var(--muted);text-align:right;line-height:1.4}
    .grid{display:grid;grid-template-columns:repeat(${cols},1fr);gap:${landscape ? '4.2mm 6mm' : '5mm 7mm'}}
    .month h2{font-size:${landscape ? '14pt' : '15pt'};margin-bottom:1mm;line-height:1.1}
    th,td{text-align:center;font-size:${landscape ? '7.6pt' : '8.4pt'};padding:${landscape ? '.55mm 0' : '.8mm 0'};line-height:1.25}
    th{color:var(--muted);font-weight:500;font-size:${landscape ? '6.4pt' : '7pt'};border-bottom:.6px solid var(--line)}
    td.wk,th.wk{color:var(--muted);font-size:${landscape ? '6pt' : '6.6pt'};width:14%;text-align:center;font-weight:400}
    td.sun{color:var(--red)} td.sat{color:var(--sat)}
    td.free{background:var(--redbg);color:var(--red);font-weight:600;border-radius:1.2mm}
    footer{margin-top:${landscape ? '4mm' : '6mm'};border-top:.6px solid var(--line);padding-top:${landscape ? '2.6mm' : '3.5mm'}}
    footer h3{font-size:${landscape ? '8.5pt' : '9.5pt'};font-weight:600;margin-bottom:1.4mm}
    footer ul{list-style:none;display:grid;grid-template-columns:repeat(${landscape ? 4 : 3},1fr);gap:.7mm 6mm;font-size:${landscape ? '7.4pt' : '8pt'}}
    footer li b{color:var(--red);font-weight:600;display:inline-block;min-width:${landscape ? '9mm' : '10mm'}}
    footer p{margin-top:2mm;font-size:${landscape ? '6.6pt' : '7.2pt'};color:var(--muted);line-height:1.45}`;
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>Kalendarz ${y} do druku (${landscape ? 'poziomo' : 'pionowo'}) — daybyday.today</title><link rel="stylesheet" href="${fontsCss}"><style>${css}</style></head><body>
  <header><h1 class="serif">Kalendarz ${y}</h1><div class="site"><b>daybyday.today</b><br>dni wolne od pracy, numery tygodni (ISO)</div></header>
  <div class="grid">${months.join('')}</div>
  <footer><h3>Dni ustawowo wolne od pracy w ${y} r. (${free.length}, z czego ${weekendFree} wypada w weekend)</h3><ul>${legend}</ul>
  <p>Dni wolne od pracy zaznaczono kolorem, niedziele czerwoną cyfrą, soboty szarą. T — numer tygodnia wg ISO 8601. Wigilia (24 grudnia) jest dniem wolnym od pracy od 2025 r. Kalendarz możesz bezpłatnie drukować do własnego użytku. Aktualne wersje i kalendarze ICS: daybyday.today/kalendarze-do-pobrania.html</p></footer>
  </body></html>`;
}

// ── miesięczny (12 stron) ────────────────────────────────────────────────────
const OBS_PRIORITY = ['koscielne', 'panstwowe', 'historyczne', 'nieoficjalne'];
function monthlyHtml(y) {
  const obs = C.observances(y, OBS_PRIORITY);
  const pages = [];
  const only = argVal('month') ? argVal('month').split(',').map(Number) : null; // podgląd: --month=5,4 (tylko z --html-only)
  for (let m = 1; m <= 12; m++) {
    if (only && !only.includes(m)) continue;
    const rows = monthGrid(y, m);
    const freeInMonth = C.freeDays(y).filter(f => f.m === m);
    const body = rows.map(r => '<tr><td class="wk">' + r[0].week + '</td>' + r.slice(1).map(c => {
      if (!c) return '<td class="empty"></td>';
      const cls = [c.free ? 'free' : '', c.dow === 0 ? 'sun' : '', c.dow === 6 ? 'sat' : ''].filter(Boolean).join(' ');
      let lines = '';
      if (c.free) lines += `<div class="hol">${esc(c.free)}</div>`;
      else {
        const list = (obs.get(`${m}-${c.d}`) || []).slice().sort((a, b) => Math.min(...a.types.map(t => OBS_PRIORITY.indexOf(t)).filter(i => i >= 0)) - Math.min(...b.types.map(t => OBS_PRIORITY.indexOf(t)).filter(i => i >= 0)));
        if (list.length) lines += `<div class="obs">${esc(list[0].name.replace(/\s*\(.*\)$/, ''))}</div>`;
      }
      const nm = C.mainNames(m, c.d).slice(0, 3).join(', ');
      return `<td class="${cls}"><div class="num">${c.d}</div>${lines}<div class="nm">${esc(nm)}</div></td>`;
    }).join('') + '</tr>').join('');
    const note = freeInMonth.length ? 'Dni wolne: ' + freeInMonth.map(f => `${f.d} ${C.PL_MONTHS_GEN[m - 1]} — ${esc(f.name)}`).join(' · ') : 'W tym miesiącu nie ma dni ustawowo wolnych od pracy (poza niedzielami).';
    pages.push(`<section class="page"><header><h1 class="serif">${C.PL_MONTHS[m - 1]} <span>${y}</span></h1><div class="site"><b>daybyday.today</b><br>kalendarz ${y}</div></header>
      <table><thead><tr><th class="wk">T</th>${['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela'].map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>
      <p class="note">${note}</p></section>`);
  }
  const css = BASE_CSS + `
    @page{size:A4 landscape;margin:8mm 10mm}
    .page{height:194mm;display:flex;flex-direction:column;page-break-after:always;break-after:page}
    .page:last-child{page-break-after:auto;break-after:auto}
    header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:1.2px solid var(--text);padding-bottom:1.6mm;margin-bottom:2.4mm}
    header h1{font-size:30pt;line-height:1} header h1 span{color:var(--muted)}
    header .site{font-size:8pt;color:var(--muted);text-align:right;line-height:1.35}
    table{table-layout:fixed;flex:1;height:100%}
    th{font-size:7.6pt;font-weight:500;color:var(--muted);padding:.8mm 0;border-bottom:.6px solid var(--line);text-align:left;padding-left:1.4mm}
    th.wk,td.wk{width:7mm;text-align:center;padding-left:0}
    td{border:.5px solid var(--line);vertical-align:top;padding:1mm 1.3mm;overflow:hidden}
    td.wk{border:none;color:var(--muted);font-size:7pt;vertical-align:middle}
    td.empty{background:#FAF9F7}
    .num{font-size:13pt;font-weight:500;line-height:1}
    td.sun .num{color:var(--red)} td.sat .num{color:var(--sat)}
    td.free{background:var(--redbg)} td.free .num{color:var(--red);font-weight:600}
    .hol{font-size:7.4pt;color:var(--red);font-weight:600;line-height:1.2;margin-top:.8mm}
    .obs{font-size:7.2pt;color:var(--text);line-height:1.2;margin-top:.8mm;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
    .nm{font-size:6.8pt;color:var(--muted);line-height:1.2;margin-top:.8mm;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
    .note{font-size:7.4pt;color:var(--muted);margin-top:2mm;line-height:1.4}`;
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>Kalendarz miesięczny ${y} z imieninami i świętami (PDF) — daybyday.today</title><link rel="stylesheet" href="${fontsCss}"><style>${css}</style></head><body>${pages.join('\n')}</body></html>`;
}

// ── Chrome ───────────────────────────────────────────────────────────────────
function findChrome() {
  const cands = [process.env.CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].filter(Boolean);
  return cands.find(p => fs.existsSync(p));
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dbd-pdf-'));
fs.mkdirSync(OUT_DIR, { recursive: true });
const chrome = HTML_ONLY ? null : findChrome();
if (!HTML_ONLY && !chrome) { console.error('Nie znaleziono Chrome/Edge (ustaw CHROME_PATH).'); process.exit(1); }

// Chrome sterowany protokołem DevTools (Node 22+ ma wbudowany WebSocket): jedna instancja na cały przebieg,
// a Page.printToPDF pozwala wyłączyć generateTaggedPDF — struktura dostępności dokleja ok. 1200 obiektów
// i podwaja rozmiar pliku (kalendarz do druku jej nie potrzebuje).
async function startChrome() {
  const { spawn } = require('child_process');
  const profile = path.join(tmp, 'profile');
  const proc = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await new Promise(r => setTimeout(r, 100));
  if (!fs.existsSync(portFile)) { proc.kill(); throw new Error('Chrome nie wystartował'); }
  const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
  let page;
  for (let i = 0; i < 50 && !page; i++) { page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page'); if (!page) await new Promise(r => setTimeout(r, 100)); }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(), waiters = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
    else if (m.method) waiters.slice().forEach(w => w(m));
  };
  const send = (method, params) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const once = method => new Promise(res => { const w = m => { if (m.method === method) { waiters.splice(waiters.indexOf(w), 1); res(m); } }; waiters.push(w); });
  await send('Page.enable');
  return {
    async print(htmlPath, out) {
      const loaded = once('Page.loadEventFired');
      await send('Page.navigate', { url: pathToFileURL(htmlPath).href });
      await loaded;
      await send('Runtime.evaluate', { expression: 'document.fonts.ready.then(()=>true)', awaitPromise: true });
      const r = await send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false, generateTaggedPDF: false });
      fs.writeFileSync(out, Buffer.from(r.data, 'base64'));
    },
    close() { try { ws.close(); } catch (e) { /* */ } proc.kill(); },
  };
}

(async () => {
  let made = 0, session = null;
  try {
    if (!HTML_ONLY) session = await startChrome();
    for (const y of YEARS) {
      for (const [key, v] of Object.entries(VARIANTS)) {
        if (ONLY && ONLY !== key) continue;
        const htmlPath = path.join(tmp, `kalendarz-${y}-${key}.html`);
        fs.writeFileSync(htmlPath, v.build(y), 'utf8');
        if (HTML_ONLY) { console.log(htmlPath); continue; }
        const out = path.join(OUT_DIR, `kalendarz-${y}-${key}.pdf`);
        try { await session.print(htmlPath, out); } catch (e) { console.error(`BŁĄD: ${path.basename(out)} (${e.message})`); process.exitCode = 1; continue; }
        if (!fs.existsSync(out) || fs.statSync(out).size < 5000) { console.error(`BŁĄD: ${path.basename(out)} (pusty plik)`); process.exitCode = 1; continue; }
        console.log(`${path.basename(out).padEnd(44)} ${String(Math.round(fs.statSync(out).size / 1024)).padStart(4)} KB  (${v.label})`);
        made++;
      }
    }
    if (!HTML_ONLY) console.log(`gotowe: ${made} plików PDF w ${OUT_DIR}`);
  } finally { if (session) session.close(); }
})().catch(e => { console.error(e); process.exit(1); });
