// Strony „Kalendarz RRRR do druku" (kalendarz-do-druku/RRRR/index.html), po jednej na rok z pdf/ — celują w frazy typu
// „kalendarz 2027 do druku". Treść = wyłącznie dane weryfikowalne z silnika dni wolnych (scripts/cal_data.js):
// podgląd roku (12 miesięcy), tabela dni wolnych, daty Wielkanocy/Bożego Ciała, FAQ (+ FAQPage w JSON-LD).
// Szablon powłoki (head, nawigacja, stopka) = kalendarze-do-pobrania.html (generowana przez gen_kalendarze_page.js),
// więc po zmianie nawigacji/stopki tam trzeba uruchomić ten skrypt ponownie.
//
// Użycie: node scripts/gen_kalendarz_druk_pages.js [--dry-run] [--years=2027,2028]

const fs = require('fs');
const path = require('path');
const C = require('./cal_data');

const ROOT = C.ROOT;
const SITE = 'https://daybyday.today';
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const onlyArg = (args.find(a => a.startsWith('--years=')) || '').slice(8);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const kb = f => { const n = fs.statSync(path.join(ROOT, f)).size / 1024; return (n < 100 ? (Math.round(n * 10) / 10).toString().replace('.', ',') : String(Math.round(n))) + ' KB'; };

const ALL_YEARS = fs.readdirSync(path.join(ROOT, 'pdf')).map(f => (f.match(/^kalendarz-(\d{4})-roczny-poziomo\.pdf$/) || [])[1]).filter(Boolean).map(Number).sort();
const YEARS = onlyArg ? onlyArg.split(',').map(Number).filter(y => ALL_YEARS.includes(y)) : ALL_YEARS;
const KEYS = ['roczny-poziomo', 'roczny-pionowo', 'miesieczny'];
const pdfOk = y => KEYS.every(k => fs.existsSync(path.join(ROOT, 'pdf', `kalendarz-${y}-${k}.pdf`)));

const TEMPLATE = fs.readFileSync(path.join(ROOT, 'kalendarze-do-pobrania.html'), 'utf8');
const DOW_LC = C.PL_DOW; // niedziela..sobota
const DOW_ACC = ['niedzielę', 'poniedziałek', 'wtorek', 'środę', 'czwartek', 'piątek', 'sobotę'];
const fmtDate = (d, m) => `${d} ${C.PL_MONTHS_GEN[m - 1]}`;
const MONTH_SLUGS = ['styczen', 'luty', 'marzec', 'kwiecien', 'maj', 'czerwiec', 'lipiec', 'sierpien', 'wrzesien', 'pazdziernik', 'listopad', 'grudzien']; // jak w gen_kalendarz_miesiace.js
const hasOnline = y => fs.existsSync(path.join(ROOT, 'kalendarz', String(y), 'index.html')); // strony /kalendarz/RRRR/ są tylko dla części lat
const isLeap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const plural = (n, one, few, many) => n === 1 ? one : (n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14)) ? few : many;
const addDays = (dt, n) => { const r = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + n); return r; };

// ── podgląd roku: 12 małych miesięcy (poniedziałek pierwszy) ────────────────
function miniMonth(y, m, freeMap) {
  const first = new Date(y, m - 1, 1), off = (first.getDay() + 6) % 7, n = C.daysInMonth(y, m);
  let rows = '', cells = [];
  for (let i = 0; i < off; i++) cells.push('<td></td>');
  for (let d = 1; d <= n; d++) {
    const dow = new Date(y, m - 1, d).getDay(), fr = freeMap.get(`${m}-${d}`);
    const cls = fr ? 'yr-free' : dow === 0 ? 'yr-sun' : dow === 6 ? 'yr-sat' : '';
    cells.push(`<td${cls ? ` class="${cls}"` : ''}${fr ? ` title="${esc(fr)}"` : ''}>${d}</td>`);
  }
  while (cells.length % 7) cells.push('<td></td>');
  for (let i = 0; i < cells.length; i += 7) rows += `<tr>${cells.slice(i, i + 7).join('')}</tr>`;
  return `<table class="yr-mini"><caption>${hasOnline(y) ? `<a href="/kalendarz/${y}/${MONTH_SLUGS[m - 1]}/">${C.PL_MONTHS[m - 1]}</a>` : C.PL_MONTHS[m - 1]}</caption>`
    + `<thead><tr><th>Pn</th><th>Wt</th><th>Śr</th><th>Cz</th><th>Pt</th><th>So</th><th>Nd</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function yearData(y) {
  const free = C.freeDays(y), e = C.easterDateKal(y);
  const wk = free.filter(x => x.dow === 0 || x.dow === 6);
  const sat = free.filter(x => x.dow === 6), sun = free.filter(x => x.dow === 0);
  const cc = addDays(e, 60), pent = addDays(e, 49);
  return { free, e, wk, sat, sun, cc, pent, weekdays: free.length - wk.length, jan1dow: new Date(y, 0, 1).getDay() };
}

function faqItems(y, D) {
  const n = D.free.length;
  const satTxt = D.sat.length
    ? `W ${y} roku na sobotę przypada ${D.sat.length} ${plural(D.sat.length, 'święto', 'święta', 'świąt')} (${D.sat.map(x => `${fmtDate(x.d, x.m)} — ${x.name}`).join('; ')}); za takie święto pracodawca musi wyznaczyć pracownikowi inny dzień wolny (art. 130 § 2 Kodeksu pracy).`
    : `W ${y} roku żadne ze świąt ustawowo wolnych od pracy nie wypada w sobotę, więc nikt nie traci dnia wolnego z tego powodu.`;
  return [
    [`Czy kalendarz ${y} do druku jest darmowy?`, `Tak. Wszystkie trzy wersje kalendarza na ${y} rok (roczny poziomo, roczny pionowo i miesięczny) możesz pobrać bezpłatnie i wydrukować na własny użytek. Pliki PDF mają format A4.`],
    [`Ile dni wolnych od pracy jest w ${y} roku?`, `W ${y} roku jest ${n} ${plural(n, 'dzień', 'dni', 'dni')} ustawowo wolnych od pracy (łącznie z Wigilią Bożego Narodzenia, która jest wolna od 2025 roku). Z tego ${D.weekdays} wypada w dni robocze, a ${D.wk.length} w weekend. ${satTxt}`],
    [`Kiedy jest Wielkanoc w ${y} roku?`, `Wielkanoc w ${y} roku przypada ${fmtDate(D.e.getDate(), D.e.getMonth() + 1)}, Poniedziałek Wielkanocny ${fmtDate(addDays(D.e, 1).getDate(), addDays(D.e, 1).getMonth() + 1)}, Zielone Świątki ${fmtDate(D.pent.getDate(), D.pent.getMonth() + 1)}, a Boże Ciało ${fmtDate(D.cc.getDate(), D.cc.getMonth() + 1)}.`],
    [`Który kalendarz wybrać: roczny czy miesięczny?`, `Roczny poziomo mieści cały rok na jednej kartce A4 — najlepszy na ścianę lub pod szybę na biurku. Roczny pionowo ma ten sam układ w orientacji portretowej. Miesięczny to 12 stron A4 (po jednej na miesiąc), na których przy każdym dniu widać imieniny i święta, więc nadaje się do zeszytu, segregatora lub do robienia notatek.`],
    [`Czy w kalendarzu są numery tygodni?`, `Tak, numery tygodni podano według normy ISO 8601 (tydzień zaczyna się w poniedziałek, a pierwszy tydzień roku to ten z pierwszym czwartkiem).`],
    [`Jak dodać dni wolne ${y} do kalendarza Google, Apple lub Outlooka?`, `Użyj pliku ICS „Dni wolne od pracy w Polsce”, który obejmuje lata ${ALL_YEARS[0]}–${ALL_YEARS[ALL_YEARS.length - 1]}. Wystarczy dodać go jako subskrypcję (adres ${SITE}/ics/dni-wolne-od-pracy.ics) albo zaimportować jednorazowo z pliku. Szczegółowe instrukcje są na stronie z kalendarzami do pobrania.`],
  ];
}

function content(y) {
  const D = yearData(y), n = D.free.length, e = D.e;
  const freeMap = new Map(D.free.map(x => [`${x.m}-${x.d}`, x.name]));
  const btn = (key, label, pages) => `<a class="dl-btn" href="/pdf/kalendarz-${y}-${key}.pdf" target="_blank" rel="noopener"><span>${label}</span><small>PDF · ${pages} · ${kb(`pdf/kalendarz-${y}-${key}.pdf`)}</small></a>`;
  const faq = faqItems(y, D);
  const prev = ALL_YEARS.includes(y - 1) ? y - 1 : 0, next = ALL_YEARS.includes(y + 1) ? y + 1 : 0;
  const rows = D.free.map(x => `<tr${x.dow === 0 || x.dow === 6 ? ' class="yr-wk"' : ''}><td>${fmtDate(x.d, x.m)}</td><td>${DOW_LC[x.dow]}</td><td>${esc(x.name)}</td></tr>`).join('');
  const satNote = D.sat.length
    ? `Na sobotę przypada ${D.sat.length} ${plural(D.sat.length, 'święto', 'święta', 'świąt')} (${D.sat.map(x => `${fmtDate(x.d, x.m)}`).join(', ')}) — za każde pracodawca musi wyznaczyć inny dzień wolny (art. 130 § 2 Kodeksu pracy).`
    : `Żadne ze świąt nie wypada w sobotę, więc nie ma dni wolnych „do odebrania” za święto w sobotę.`;
  const sunNote = D.sun.length ? `${D.sun.length} ${plural(D.sun.length, 'święto wypada', 'święta wypadają', 'świąt wypada')} w niedzielę` : 'żadne święto nie wypada w niedzielę';
  const yearLinks = ALL_YEARS.map(v => v === y ? `<span class="yr-cur" aria-current="page">${v}</span>` : `<a href="/kalendarz-do-druku/${v}/">${v}</a>`).join('');

  return `
<div class="page-label"><a href="/kalendarze-do-pobrania.html" style="color:inherit;text-decoration:none">Kalendarze</a></div>
<h1 class="page-title">Kalendarz ${y} do druku — PDF za darmo</h1>
<p class="page-sub">Bezpłatny kalendarz na ${y} rok w formacie A4: roczny poziomo, roczny pionowo i miesięczny z imieninami. W ${y} roku jest ${n} ${plural(n, 'dzień', 'dni', 'dni')} ustawowo wolnych od pracy, a Wielkanoc przypada ${fmtDate(e.getDate(), e.getMonth() + 1)}.</p>

<div class="dl-btns yr-btns">
  ${btn('roczny-poziomo', 'Roczny, poziomo', '1 strona')}
  ${btn('roczny-pionowo', 'Roczny, pionowo', '1 strona')}
  ${btn('miesieczny', 'Miesięczny z imieninami i świętami', '12 stron')}
</div>
<p class="yr-note">Pliki PDF, format A4, gotowe do wydruku. Kalendarz możesz bezpłatnie drukować do własnego użytku.</p>

<h2 class="dl-h2" id="podglad">Kalendarz ${y} — podgląd roku</h2>
<p class="dl-intro">Rok ${y} ${isLeap(y) ? 'jest przestępny i ma 366 dni' : 'ma 365 dni'}, a zaczyna się w ${DOW_ACC[D.jan1dow]}. Dni ustawowo wolne od pracy są zaznaczone kolorem${hasOnline(y) ? '; po kliknięciu nazwy miesiąca otworzysz jego pełny kalendarz z imieninami i świętami' : ''}.</p>
<div class="yr-year">
  ${Array.from({ length: 12 }, (_, i) => miniMonth(y, i + 1, freeMap)).join('\n  ')}
</div>
<p class="yr-legend"><span class="yr-key yr-free">1</span> dzień ustawowo wolny od pracy <span class="yr-key yr-sun">1</span> niedziela <span class="yr-key yr-sat">1</span> sobota</p>

<h2 class="dl-h2" id="dni-wolne">Dni wolne od pracy w ${y} roku</h2>
<p class="dl-intro">W ${y} roku jest <b>${n}</b> dni ustawowo wolnych od pracy: ${D.weekdays} w dni robocze i ${D.wk.length} w weekend (${sunNote}). ${satNote}</p>
<div class="yr-tablewrap"><table class="yr-table"><thead><tr><th>Data</th><th>Dzień tygodnia</th><th>Święto</th></tr></thead><tbody>${rows}</tbody></table></div>
<p class="yr-note">Wiersze wyróżnione kolorem oznaczają święta przypadające w weekend. Pełną listę świąt, dni tematycznych i okolicznościowych na ${y} rok znajdziesz w <a href="/swieta.html?rok=${y}">kalendarzu świąt</a>${hasOnline(y) ? ` oraz w <a href="/kalendarz/${y}/">kalendarzu ${y} online</a>` : ''}.</p>

<h2 class="dl-h2" id="ics">Dni wolne ${y} w Google, Apple i Outlooku</h2>
<p class="dl-intro">Zamiast drukować, możesz dodać święta do swojego kalendarza elektronicznego. Plik ICS „Dni wolne od pracy w Polsce” obejmuje także ${y} rok i aktualizuje się samoczynnie, jeśli dodasz go jako subskrypcję.</p>
<div class="dl-btns yr-btns">
  <a class="dl-btn" href="https://calendar.google.com/calendar/r?cid=webcal://daybyday.today/ics/dni-wolne-od-pracy.ics" target="_blank" rel="noopener"><span>Dodaj do Google Calendar</span><small>subskrypcja</small></a>
  <a class="dl-btn" href="webcal://daybyday.today/ics/dni-wolne-od-pracy.ics"><span>Subskrybuj (Apple, Outlook)</span><small>webcal://</small></a>
  <a class="dl-btn" href="/ics/dni-wolne-od-pracy.ics" download><span>Pobierz plik .ics</span><small>jednorazowo</small></a>
</div>

<h2 class="dl-h2" id="faq">Najczęstsze pytania o kalendarz ${y}</h2>
<div class="dl-how">
  ${faq.map(([q, a], i) => `<details${i === 0 ? ' open' : ''}><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n  ')}
</div>

<h2 class="dl-h2" id="inne-lata">Kalendarze na inne lata</h2>
<nav class="yr-years" aria-label="Kalendarze do druku na inne lata">${yearLinks}</nav>
<p class="yr-note">${prev ? `<a href="/kalendarz-do-druku/${prev}/">← Kalendarz ${prev} do druku</a>` : ''}${prev && next ? ' · ' : ''}${next ? `<a href="/kalendarz-do-druku/${next}/">Kalendarz ${next} do druku →</a>` : ''}${prev || next ? ' · ' : ''}<a href="/kalendarze-do-pobrania.html">wszystkie kalendarze PDF i ICS</a></p>
`;
}

const CSS = `
    .yr-btns{max-width:34rem;margin-top:1.1rem}
    .yr-note{font-size:.86rem;color:var(--muted);line-height:1.6;margin:.8rem 0 0;max-width:46rem}
    .yr-note a{color:var(--text);text-underline-offset:3px}
    .yr-year{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,215px),1fr));gap:.9rem}
    .yr-mini{width:100%;border-collapse:collapse;background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden;font-size:.8rem;table-layout:fixed}
    .yr-mini caption{caption-side:top;text-align:left;font-family:'Instrument Serif',serif;font-size:1.15rem;padding:.1rem .1rem .35rem}
    .yr-mini caption a{color:var(--text);text-decoration:none}
    .yr-mini caption a:hover{text-decoration:underline}
    .yr-mini th{font-weight:500;font-size:.68rem;color:var(--muted);padding:.35rem 0}
    .yr-mini td{text-align:center;padding:.3rem 0;color:var(--text);font-variant-numeric:tabular-nums}
    .yr-mini .yr-sat{color:var(--muted)}
    .yr-mini .yr-sun{color:var(--closed-text)}
    .yr-mini .yr-free,.yr-key.yr-free{background:var(--closed);color:var(--closed-text);font-weight:700;border-radius:6px}
    .yr-legend{display:flex;flex-wrap:wrap;gap:.4rem 1rem;align-items:center;font-size:.8rem;color:var(--muted);margin-top:.9rem}
    .yr-key{display:inline-block;min-width:1.6rem;text-align:center;padding:.1rem .3rem;margin-right:.35rem;font-size:.75rem}
    .yr-key.yr-sun{color:var(--closed-text)}
    .yr-key.yr-sat{color:var(--muted)}
    .yr-tablewrap{overflow-x:auto;max-width:46rem;border:1px solid var(--border);border-radius:12px;background:var(--surface)}
    .yr-table{width:100%;border-collapse:collapse;font-size:.92rem}
    .yr-table th,.yr-table td{text-align:left;padding:.65rem .9rem;border-bottom:1px solid var(--border)}
    .yr-table th{font-size:.78rem;font-weight:500;color:var(--muted)}
    .yr-table tr:last-child td{border-bottom:none}
    .yr-table tr.yr-wk td{background:var(--closed);color:var(--closed-text)}
    @media(max-width:480px){.yr-table{font-size:.84rem}.yr-table th,.yr-table td{padding:.55rem .55rem}}
    .yr-years{display:flex;flex-wrap:wrap;gap:.5rem}
    .yr-years a,.yr-years .yr-cur{font-size:.9rem;font-weight:500;text-decoration:none;border:1px solid var(--border);border-radius:60px;padding:.5rem 1rem;min-height:44px;display:inline-flex;align-items:center;background:var(--tag-bg);color:var(--text)}
    .yr-years .yr-cur{background:var(--text);color:var(--bg);border-color:var(--text)}
    .yr-years a:hover{border-color:var(--muted)}
`;

function buildPage(y) {
  const D = yearData(y), n = D.free.length, e = D.e;
  const url = `${SITE}/kalendarz-do-druku/${y}/`;
  const title = `Kalendarz ${y} do druku — PDF za darmo (roczny i miesięczny) | DaybyDay`;
  const shortTitle = `Kalendarz ${y} do druku — PDF za darmo`;
  const desc = `Pobierz za darmo kalendarz ${y} do druku w PDF: roczny poziomo, roczny pionowo i miesięczny z imieninami. ${n} dni ustawowo wolnych od pracy, Wielkanoc ${fmtDate(e.getDate(), e.getMonth() + 1)}.`;
  let t = TEMPLATE;
  const rep = (re, to) => { if (!re.test(t)) throw new Error('Szablon: brak dopasowania ' + re); t = t.replace(re, () => to); };
  rep(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
  rep(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(desc)}">`);
  rep(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${url}">`);
  rep(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(shortTitle)}">`);
  rep(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(desc)}">`);
  rep(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${url}">`);
  const faq = faqItems(y, D);
  const ld = [
    { '@context': 'https://schema.org', '@type': 'Article', headline: shortTitle, description: desc, url, inLanguage: 'pl', publisher: { '@type': 'Organization', name: 'DaybyDay', url: SITE } },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'DaybyDay', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: 'Kalendarze do pobrania', item: `${SITE}/kalendarze-do-pobrania.html` },
      { '@type': 'ListItem', position: 3, name: `Kalendarz ${y} do druku`, item: url }] },
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
  ].map(o => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`).join('\n  ');
  rep(/<script type="application\/ld\+json">[\s\S]*?<\/script>\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/, ld);
  // treść strony
  const a = t.indexOf('<!-- DL:START -->'), b = t.indexOf('<!-- DL:END -->');
  if (a < 0 || b < 0) throw new Error('Szablon: brak znaczników DL:START/DL:END');
  t = t.slice(0, a) + content(y) + t.slice(b + '<!-- DL:END -->'.length);
  // CSS tej strony tuż po stylu dl-css
  t = t.replace(/(<style id="dl-css">[\s\S]*?<\/style>)/, `$1\n  <style id="yr-css">${CSS}  </style>`);
  // ścieżki względne szablonu (głównego katalogu) -> bezwzględne, bo strona leży dwa poziomy niżej
  t = t.replace(/(href|src)="(?!https?:|webcal:|mailto:|#|\/)([^"]+)"/g, '$1="/$2"').replace('register("sw.js")', 'register("/sw.js")');
  return t;
}

let changed = 0, same = 0;
for (const y of YEARS) {
  if (!pdfOk(y)) { console.warn(`pomijam ${y}: brak kompletu PDF`); continue; }
  const html = buildPage(y);
  const f = path.join(ROOT, 'kalendarz-do-druku', String(y), 'index.html');
  const cur = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
  if (cur === html) { same++; continue; }
  changed++;
  if (!DRY) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, html, 'utf8'); }
}
console.log(`kalendarz-do-druku: lata ${YEARS.join(', ')} — ${DRY ? 'zmieniłoby się' : 'zapisano'}: ${changed}, bez zmian: ${same}${DRY ? ' (dry-run)' : ''}`);
