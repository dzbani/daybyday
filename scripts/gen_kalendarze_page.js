// Strona kalendarze-do-pobrania.html: lista kalendarzy PDF (pdf/) i ICS (ics/) z rozmiarami plików i faktami o dniach
// wolnych w roku — część między znacznikami <!-- DL:START --> i <!-- DL:END --> jest GENEROWANA z tego, co leży na dysku
// (dzięki temu strona zawsze zgadza się z plikami). Reszta strony (nawigacja, stopka, SEO) jest zwykłym, ręcznie
// utrzymywanym HTML-em jak pozostałe strony narzędziowe.
//
// Użycie: node scripts/gen_kalendarze_page.js            -> odświeża część generowaną (strona musi istnieć)
//         node scripts/gen_kalendarze_page.js --bootstrap -> JEDNORAZOWO tworzy stronę z szablonu niedziele-handlowe.html
//         node scripts/gen_kalendarze_page.js --dry-run  -> tylko pokazuje, czy coś by się zmieniło

const fs = require('fs');
const path = require('path');
const C = require('./cal_data');

const ROOT = C.ROOT;
const PAGE = path.join(ROOT, 'kalendarze-do-pobrania.html');
const SITE = 'https://daybyday.today';
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run'), BOOT = args.includes('--bootstrap');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const kb = f => { const n = fs.statSync(path.join(ROOT, f)).size / 1024; return (n < 100 ? (Math.round(n * 10) / 10).toString().replace('.', ',') : String(Math.round(n))) + ' KB'; };

const YEARS = fs.readdirSync(path.join(ROOT, 'pdf')).map(f => (f.match(/^kalendarz-(\d{4})-roczny-poziomo\.pdf$/) || [])[1]).filter(Boolean).map(Number).sort();
const ICS = [
  { f: 'dni-wolne-od-pracy.ics', t: 'Dni wolne od pracy w Polsce', d: 'Wszystkie dni ustawowo wolne od pracy razem z Wigilią: Nowy Rok, Wielkanoc, Boże Ciało, 1 i 3 maja…' },
  { f: 'swieta-panstwowe-i-koscielne.ics', t: 'Święta państwowe i kościelne', d: 'Święta państwowe i kościelne wraz ze świętami ruchomymi: Popielec, Niedziela Palmowa, Wielki Piątek, Zielone Świątki…' },
  { f: 'dni-okolicznosciowe.ics', t: 'Dni okolicznościowe', d: 'Walentynki, Dzień Kobiet, Dzień Matki, Dzień Ojca, Dzień Babci i Dziadka, Tłusty Czwartek, Mikołajki i inne popularne okazje.' },
  { f: 'niedziele-handlowe.ics', t: 'Niedziele handlowe', d: 'Niedziele, w które sklepy są otwarte (8 w roku). Dane zgodne ze stroną „Niedziele handlowe”.' },
];
const icsInfo = f => {
  const t = fs.readFileSync(path.join(ROOT, 'ics', f), 'utf8');
  const n = (t.match(/BEGIN:VEVENT/g) || []).length;
  const ys = [...t.matchAll(/DTSTART;VALUE=DATE:(\d{4})/g)].map(m => +m[1]);
  return { n, y0: Math.min(...ys), y1: Math.max(...ys) };
};

function yearCard(y) {
  const free = C.freeDays(y);
  const wk = free.filter(x => x.dow === 0 || x.dow === 6).length;
  const e = C.easterDateKal(y);
  const hub = fs.existsSync(path.join(ROOT, 'kalendarz', String(y), 'index.html')) ? `<a class="dl-more" href="/kalendarz/${y}/">Kalendarz ${y} online →</a>` : '';
  const druk = fs.existsSync(path.join(ROOT, 'kalendarz-do-druku', String(y), 'index.html')) ? `<a class="dl-more" href="/kalendarz-do-druku/${y}/">Kalendarz ${y} do druku — podgląd i dni wolne →</a>` : '';
  const btn = (key, label) => `<a class="dl-btn" href="pdf/kalendarz-${y}-${key}.pdf" target="_blank" rel="noopener"><span>${label}</span><small>PDF · ${kb(`pdf/kalendarz-${y}-${key}.pdf`)}</small></a>`;
  return `<article class="dl-card" id="rok-${y}">
      <h3>Kalendarz ${y}</h3>
      <p class="dl-meta"><b>${free.length}</b> dni ustawowo wolnych od pracy, z czego ${wk} wypada w weekend (w tygodniu: ${free.length - wk}). Wielkanoc: ${e.getDate()} ${C.PL_MONTHS_GEN[e.getMonth()]}.</p>
      <div class="dl-btns">
        ${btn('roczny-poziomo', 'Roczny, poziomo')}
        ${btn('roczny-pionowo', 'Roczny, pionowo')}
        ${btn('miesieczny', 'Miesięczny (12 stron) z imieninami i świętami')}
      </div>
      <p class="dl-links">${druk}${hub}</p>
    </article>`;
}
function icsCard(c) {
  const i = icsInfo(c.f), url = `${SITE}/ics/${c.f}`;
  return `<article class="dl-card">
      <h3>${esc(c.t)}</h3>
      <p class="dl-meta">${esc(c.d)}</p>
      <p class="dl-meta dl-small">${i.n} wydarzeń · lata ${i.y0}–${i.y1} · ${kb('ics/' + c.f)}</p>
      <div class="dl-btns">
        <a class="dl-btn" href="https://calendar.google.com/calendar/r?cid=webcal://daybyday.today/ics/${c.f}" target="_blank" rel="noopener"><span>Dodaj do Google Calendar</span><small>subskrypcja</small></a>
        <a class="dl-btn" href="webcal://daybyday.today/ics/${c.f}"><span>Subskrybuj (Apple, Outlook)</span><small>webcal://</small></a>
        <a class="dl-btn" href="ics/${c.f}" download><span>Pobierz plik .ics</span><small>jednorazowo</small></a>
      </div>
      <p class="dl-url"><code>${url}</code></p>
    </article>`;
}

function content() {
  const first = YEARS[0], last = YEARS[YEARS.length - 1];
  return `
<div class="page-label">Kalendarze</div>
<h1 class="page-title">Kalendarze do pobrania — PDF do druku i pliki ICS</h1>
<p class="page-sub">Bezpłatne kalendarze na lata ${first}–${last}: arkusze PDF w formacie A4 do wydrukowania (roczny poziomo, roczny pionowo i miesięczny z imieninami) oraz kalendarze ICS z dniami wolnymi i świętami, które możesz dodać do Google, Apple lub Outlooka.</p>

<nav class="dl-toc" aria-label="Spis treści">
  <a href="#pdf">Kalendarze PDF do druku</a>
  <a href="#ics">Kalendarze ICS (subskrypcja)</a>
  <a href="#jak">Jak dodać kalendarz ICS</a>
  <a href="#linkuj">Linkuj do nas</a>
</nav>

<h2 class="dl-h2" id="pdf">Kalendarz do druku (PDF)</h2>
<p class="dl-intro">Każdy rok w trzech wersjach: <b>roczny poziomo</b> (cały rok na jednej kartce, najwygodniejszy na ścianę), <b>roczny pionowo</b> oraz <b>miesięczny</b> — 12 stron A4 z dniami wolnymi, świętami i imieninami w każdym dniu. Dni ustawowo wolne od pracy są zaznaczone kolorem, a numery tygodni podano wg ISO 8601. Pliki są lekkie (od kilkudziesięciu do stu kilobajtów) i gotowe do wydruku na papierze A4.</p>
<div class="dl-grid">
    ${YEARS.map(yearCard).join('\n    ')}
</div>

<h2 class="dl-h2" id="ics">Kalendarze ICS do subskrypcji</h2>
<p class="dl-intro">Pliki ICS dodasz do dowolnego kalendarza (Google, Apple, Outlook, Thunderbird). Wybierz <b>subskrypcję</b>, jeśli chcesz, żeby aplikacja sama pobierała aktualną wersję, albo <b>pobierz plik</b>, jeśli wystarczy Ci jednorazowy import. Wszystkie wydarzenia są całodniowe i nie blokują czasu w kalendarzu.</p>
<div class="dl-grid">
    ${ICS.map(icsCard).join('\n    ')}
</div>

<h2 class="dl-h2" id="jak">Jak dodać kalendarz ICS</h2>
<div class="dl-how">
  <details open><summary>Google Calendar (komputer)</summary><p>Kliknij przycisk „Dodaj do Google Calendar” przy wybranym kalendarzu i potwierdź. Albo ręcznie: w Kalendarzu Google rozwiń „Inne kalendarze” (po lewej, przy plusie) → „Z adresu URL” → wklej adres kalendarza (zaczyna się od <code>https://daybyday.today/ics/</code>) → „Dodaj kalendarz”. Google odświeża subskrybowane kalendarze samodzielnie, co może potrwać do kilkunastu godzin.</p></details>
  <details><summary>iPhone, iPad i Mac (Apple Kalendarz)</summary><p>Na iPhonie: Ustawienia → Kalendarz → Konta → Dodaj konto → Inne → Dodaj subskrypcję kalendarza → wklej adres. Na Macu: w aplikacji Kalendarz wybierz Plik → Nowa subskrypcja kalendarza… i wklej adres. Możesz też po prostu dotknąć przycisku „Subskrybuj (Apple, Outlook)”.</p></details>
  <details><summary>Outlook</summary><p>W Outlooku (nowym i w Outlook.com): Dodaj kalendarz → Subskrybuj z Internetu → wklej adres kalendarza → Importuj. W klasycznym Outlooku: Plik → Ustawienia kont → Kalendarze internetowe → Nowy.</p></details>
  <details><summary>Import jednorazowy z pliku</summary><p>Jeśli nie chcesz subskrypcji, pobierz plik .ics i zaimportuj go w ustawieniach swojego kalendarza (w Google: Ustawienia → Importowanie i eksportowanie). Wydarzenia zostaną dodane raz i nie będą się aktualizować.</p></details>
</div>

<h2 class="dl-h2" id="linkuj">Linkuj do nas</h2>
<p class="dl-intro">Jeśli prowadzisz stronę, szkołę lub zakład pracy i chcesz polecić kalendarze do druku, wystarczy wstawić taki odnośnik:</p>
<div class="dl-embed">
  <textarea id="dlSnippet" readonly rows="2" aria-label="Kod odnośnika do skopiowania">&lt;a href="${SITE}/kalendarze-do-pobrania.html"&gt;Kalendarze do druku (PDF) i ICS — daybyday.today&lt;/a&gt;</textarea>
  <button type="button" id="dlCopy" onclick="(function(b){var t=document.getElementById('dlSnippet');t.select();(navigator.clipboard?navigator.clipboard.writeText(t.value):Promise.reject()).then(function(){b.textContent='Skopiowano';},function(){document.execCommand&&document.execCommand('copy');b.textContent='Skopiowano';});setTimeout(function(){b.textContent='Kopiuj kod';},2000);})(this)">Kopiuj kod</button>
</div>
`;
}

const CSS = `
    .dl-toc{display:flex;flex-wrap:wrap;gap:.5rem;margin:1.2rem 0 .5rem}
    .dl-toc a{font-size:.85rem;font-weight:500;color:var(--text);text-decoration:none;background:var(--tag-bg);border:1px solid var(--border);border-radius:60px;padding:.5rem 1rem;min-height:44px;display:inline-flex;align-items:center}
    .dl-toc a:hover{border-color:var(--muted)}
    .dl-h2{font-family:'Instrument Serif',serif;font-weight:400;font-size:clamp(1.5rem,3.5vw,2rem);margin:2.4rem 0 .6rem;letter-spacing:-.01em;scroll-margin-top:72px}
    .dl-intro{color:var(--muted);line-height:1.7;max-width:46rem;margin-bottom:1.2rem}
    .dl-intro b{color:var(--text);font-weight:600}
    .dl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:1rem}
    .dl-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:1.25rem 1.25rem 1.1rem;display:flex;flex-direction:column;gap:.55rem}
    .dl-card h3{font-family:'Instrument Serif',serif;font-weight:400;font-size:1.5rem;line-height:1.15}
    .dl-meta{font-size:.88rem;color:var(--muted);line-height:1.6}
    .dl-meta b{color:var(--text);font-weight:600}
    .dl-small{font-size:.8rem}
    .dl-btns{display:flex;flex-direction:column;gap:.45rem;margin-top:.35rem}
    .dl-btn{display:flex;justify-content:space-between;align-items:center;gap:.75rem;text-decoration:none;color:var(--text);background:var(--tag-bg);border:1px solid var(--border);border-radius:12px;padding:.7rem .95rem;min-height:44px;font-size:.9rem;font-weight:500;line-height:1.3}
    .dl-btn small{color:var(--muted);font-weight:400;font-size:.74rem;white-space:nowrap}
    .dl-btn:hover{border-color:var(--muted)}
    .dl-more{font-size:.84rem;color:var(--muted);text-decoration:underline;text-underline-offset:3px;margin-top:.2rem}
    .dl-links{display:flex;flex-direction:column;gap:.15rem}
    .dl-url{font-size:.74rem;color:var(--muted);word-break:break-all}
    .dl-url code{font-family:ui-monospace,Menlo,Consolas,monospace}
    .dl-how{display:flex;flex-direction:column;gap:.5rem;max-width:46rem}
    .dl-how details{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:.2rem 1rem}
    .dl-how summary{cursor:pointer;font-weight:500;padding:.8rem 0;min-height:44px}
    .dl-how p{color:var(--muted);line-height:1.7;padding:0 0 1rem;font-size:.92rem}
    .dl-how code{font-size:.82rem;word-break:break-all}
    .dl-embed{display:flex;flex-wrap:wrap;gap:.6rem;align-items:stretch;max-width:46rem}
    .dl-embed textarea{flex:1 1 320px;font:inherit;font-size:.82rem;font-family:ui-monospace,Menlo,Consolas,monospace;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:12px;padding:.7rem .9rem;resize:vertical}
    .dl-embed button{font:inherit;font-weight:500;background:var(--text);color:var(--bg);border:none;border-radius:12px;padding:.7rem 1.2rem;min-height:44px;cursor:pointer}
`;

function update(html, inner) {
  const a = html.indexOf('<!-- DL:START -->'), b = html.indexOf('<!-- DL:END -->');
  if (a < 0 || b < 0) throw new Error('Brak znaczników DL:START/DL:END w ' + path.basename(PAGE));
  return html.slice(0, a) + '<!-- DL:START -->' + inner + html.slice(b);
}

if (BOOT) {
  if (fs.existsSync(PAGE)) { console.error('Strona już istnieje — bootstrap przerwany (usuń plik, jeśli naprawdę chcesz od nowa).'); process.exit(1); }
  let t = fs.readFileSync(path.join(ROOT, 'niedziele-handlowe.html'), 'utf8');
  const title = `Kalendarze do druku (PDF) i ICS ${YEARS[0]}–${YEARS[YEARS.length - 1]} | DaybyDay`;
  const desc = `Pobierz kalendarz ${YEARS[1]}, ${YEARS[2]} i inne lata ${YEARS[0]}–${YEARS[YEARS.length - 1]} w PDF do druku (roczny, miesięczny) oraz dni wolne i święta jako ICS do Google, Apple i Outlooka.`;
  const shortTitle = `Kalendarze do druku (PDF) i ICS ${YEARS[0]}–${YEARS[YEARS.length - 1]}`;
  const rep = (re, to) => { if (!re.test(t)) throw new Error('Szablon: brak dopasowania ' + re); t = t.replace(re, to); };
  rep(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
  rep(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(desc)}">`);
  rep(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${SITE}/kalendarze-do-pobrania.html">`);
  rep(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(shortTitle)}">`);
  rep(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(desc)}">`);
  rep(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${SITE}/kalendarze-do-pobrania.html">`);
  const ld1 = `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Article', headline: shortTitle, description: desc, url: `${SITE}/kalendarze-do-pobrania.html`, inLanguage: 'pl', publisher: { '@type': 'Organization', name: 'DaybyDay', url: SITE } })}</script>`;
  const ld2 = `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'DaybyDay', item: SITE + '/' }, { '@type': 'ListItem', position: 2, name: 'Kalendarze do pobrania', item: `${SITE}/kalendarze-do-pobrania.html` }] })}</script>`;
  t = t.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/, ld1 + '\n  ' + ld2);
  // część treści strony (od <div class="page"> do <footer>) -> nasza
  const a = t.indexOf('<div class="page">'), b = t.indexOf('<footer>');
  if (a < 0 || b < 0) throw new Error('Szablon: brak <div class="page"> / <footer>');
  t = t.slice(0, a) + '<div class="page">\n<!-- DL:START --><!-- DL:END -->\n</div>\n\n' + t.slice(b);
  // skrypt specyficzny dla niedziel handlowych (showYear) usuwamy
  t = t.replace(/<script>(?:(?!<\/script>)[\s\S])*showYear(?:(?!<\/script>)[\s\S])*<\/script>\s*/, '');
  // CSS strony tuż po fonts.css
  t = t.replace('<link rel="stylesheet" href="fonts.css">', '<link rel="stylesheet" href="fonts.css">\n  <style id="dl-css">' + CSS + '  </style>');
  fs.writeFileSync(PAGE, update(t, content()), 'utf8');
  console.log('utworzono ' + path.basename(PAGE) + ' (' + Math.round(fs.statSync(PAGE).size / 1024) + ' KB)');
  process.exit(0);
}

const cur = fs.readFileSync(PAGE, 'utf8');
let next = update(cur, content());
// CSS również z generatora (jedno miejsce prawdy dla klas dl-*)
next = next.replace(/<style id="dl-css">[\s\S]*?<\/style>/, '<style id="dl-css">' + CSS + '  </style>');
if (next === cur) console.log('kalendarze-do-pobrania.html: bez zmian');
else if (DRY) console.log('kalendarze-do-pobrania.html: zmieniłaby się (dry-run, nie zapisano)');
else { fs.writeFileSync(PAGE, next, 'utf8'); console.log('kalendarze-do-pobrania.html: zaktualizowana'); }
