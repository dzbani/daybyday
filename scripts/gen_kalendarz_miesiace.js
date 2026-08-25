// Generuje /kalendarz/<rok>/<miesiac>/index.html — statyczna, indeksowalna strona
// per miesiac+rok (np. /kalendarz/2026/sierpien/), z pelna tabela dnia (wschod/zachod
// slonca, faza ksiezyca, znak zodiaku, oznaczenie swiat/weekendow) wyliczona programowo
// (Node, nie JS w przegladarce) - tresc jest w surowym HTML od razu, nie wymaga
// wykonania JS do zaindeksowania.
//
// Powod: kalendarz.html pokazuje wszystkie 12 miesiecy + przelacznik lat 2025-2028
// wylacznie w JS (bez zmiany URL) - Google widzi i moze zaindeksowac tylko jeden URL
// (/kalendarz.html), reszta miesiecy/lat nie ma wlasnego adresu do zaindeksowania.
//
// Dane (HOLIDAYS, algorytmy sun/moon) wyciagniete bezposrednio z kalendarz.html
// (jedno zrodlo prawdy - brak duplikacji/driftu).
//
// Uzycie: node scripts/gen_kalendarz_miesiace.js [--dry-run] [--only=2026-sierpien]

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const DRY = process.argv.includes('--dry-run');
const onlyArg = process.argv.find(a => a.startsWith('--only='));
const onlyList = onlyArg ? onlyArg.split('=')[1].split(',') : null;

const srcRaw = fs.readFileSync(path.join(ROOT, 'kalendarz.html'), 'utf8').replace(/^\uFEFF/, '');

// --- 1. Wyciagnij HOLIDAYS ---
const holidaysMatch = srcRaw.match(/const HOLIDAYS = (\{[\s\S]*?\n  \};)/);
if (!holidaysMatch) throw new Error('Nie znaleziono HOLIDAYS w kalendarz.html');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext('this.__H__ = ' + holidaysMatch[1], sandbox);
const HOLIDAYS = sandbox.__H__;

// --- 2. Wyciagnij funkcje sun/moon/zodiac (identyczne co w kalendarz.html) ---
const funcsStart = srcRaw.indexOf('function pad(n)');
const funcsEnd = srcRaw.indexOf('function goToDay');
if (funcsStart === -1 || funcsEnd === -1) throw new Error('Nie znaleziono bloku funkcji sun/moon w kalendarz.html');
const funcsCode = srcRaw.slice(funcsStart, funcsEnd);
const calcSandbox = {};
vm.createContext(calcSandbox);
vm.runInContext(funcsCode + '\nthis.__calc__ = { sunTimesFor, getMoonPhaseCompact, getSunZodiac };', calcSandbox);
const { sunTimesFor, getMoonPhaseCompact, getSunZodiac } = calcSandbox.__calc__;

const MONTH_NAMES = ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'];
const MONTH_GEN = ['stycznia','lutego','marca','kwietnia','maja','czerwca','lipca','sierpnia','września','października','listopada','grudnia'];
const MONTH_SLUGS = ['styczen','luty','marzec','kwiecien','maj','czerwiec','lipiec','sierpien','wrzesien','pazdziernik','listopad','grudzien'];
const DAY_NAMES_FULL = ['Poniedziałek','Wtorek','Środa','Czwartek','Piątek','Sobota','Niedziela'];
const DAY_NAMES = ['Pn','Wt','Śr','Cz','Pt','Sb','Nd'];
const YEARS = [2025, 2026, 2027, 2028];

function pad(n) { return String(n).padStart(2, '0'); }
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

function jsonLdScript(obj) {
  return `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;
}

function holidayNameFor(key) {
  // HOLIDAYS w kalendarz.html to tylko flagi bool (bez nazw) - nazwy bierzemy z wlasnej,
  // stabilnej listy (te same 13 dni ustawowo wolnych na kazdy rok, tylko ruchome sie przesuwaja).
  return HOLIDAY_NAMES[key] || 'Święto ustawowo wolne od pracy';
}

// Nazwy odpowiadajace kluczom dat w HOLIDAYS (zsynchronizowane z HOLIDAYS_DB w swieto.html).
// Od Wigilii 2025 wlacznie: 14 dni ustawowo wolnych (Wigilia dodana ustawa z 6.12.2024,
// Dz.U. 2024 poz. 1965, w zyciu od 1.02.2025) - patrz pamiec projektu.
const HOLIDAY_NAMES = {
  '2025-01-01': 'Nowy Rok', '2025-01-06': 'Trzech Króli',
  '2025-04-20': 'Wielkanoc', '2025-04-21': 'Poniedziałek Wielkanocny',
  '2025-05-01': 'Święto Pracy', '2025-05-03': 'Konstytucja 3 Maja',
  '2025-06-08': 'Zielone Świątki', '2025-06-19': 'Boże Ciało',
  '2025-08-15': 'Wniebowzięcie NMP',
  '2025-11-01': 'Wszystkich Świętych', '2025-11-11': 'Święto Niepodległości',
  '2025-12-24': 'Wigilia Bożego Narodzenia', '2025-12-25': 'Boże Narodzenie', '2025-12-26': 'Drugi dzień Bożego Narodzenia',
  '2026-01-01': 'Nowy Rok', '2026-01-06': 'Trzech Króli',
  '2026-04-05': 'Wielkanoc', '2026-04-06': 'Poniedziałek Wielkanocny',
  '2026-05-01': 'Święto Pracy', '2026-05-03': 'Konstytucja 3 Maja',
  '2026-05-24': 'Zielone Świątki', '2026-06-04': 'Boże Ciało',
  '2026-08-15': 'Wniebowzięcie NMP',
  '2026-11-01': 'Wszystkich Świętych', '2026-11-11': 'Święto Niepodległości',
  '2026-12-24': 'Wigilia Bożego Narodzenia', '2026-12-25': 'Boże Narodzenie', '2026-12-26': 'Drugi dzień Bożego Narodzenia',
  '2027-01-01': 'Nowy Rok', '2027-01-06': 'Trzech Króli',
  '2027-03-28': 'Wielkanoc', '2027-03-29': 'Poniedziałek Wielkanocny',
  '2027-05-01': 'Święto Pracy', '2027-05-03': 'Konstytucja 3 Maja',
  '2027-05-16': 'Zielone Świątki', '2027-05-27': 'Boże Ciało',
  '2027-08-15': 'Wniebowzięcie NMP',
  '2027-11-01': 'Wszystkich Świętych', '2027-11-11': 'Święto Niepodległości',
  '2027-12-24': 'Wigilia Bożego Narodzenia', '2027-12-25': 'Boże Narodzenie', '2027-12-26': 'Drugi dzień Bożego Narodzenia',
  '2028-01-01': 'Nowy Rok', '2028-01-06': 'Trzech Króli',
  '2028-04-16': 'Wielkanoc', '2028-04-17': 'Poniedziałek Wielkanocny',
  '2028-05-01': 'Święto Pracy', '2028-05-03': 'Konstytucja 3 Maja',
  '2028-06-04': 'Zielone Świątki', '2028-06-15': 'Boże Ciało',
  '2028-08-15': 'Wniebowzięcie NMP',
  '2028-11-01': 'Wszystkich Świętych', '2028-11-11': 'Święto Niepodległości',
  '2028-12-24': 'Wigilia Bożego Narodzenia', '2028-12-25': 'Boże Narodzenie', '2028-12-26': 'Drugi dzień Bożego Narodzenia',
};

// Niedziele handlowe 2026 - zsynchronizowane z niedziele-handlowe.html (jedyne zrodlo
// prawdy, tam tez lista wszystkich 52 niedziel roku w DATES_2026). Otwarte niedziele
// (8 z 52) maja wlasna etykiete tlumaczaca dlaczego akurat ta jest handlowa; pozostale
// sa domyslnie "niehandlowa". Rok 2027 nie ma jeszcze oficjalnych dat (ogloszenie przez
// MRiPS dopiero w IV kw. 2026), wiec celowo NIE fabrykujemy danych - funkcja zwraca null
// dla lat innych niz 2026.
const OPEN_SUNDAYS_2026 = {
  '1-25': 'Niedziela handlowa — przed końcem miesiąca',
  '3-29': 'Niedziela Palmowa — handlowa przed Wielkanocą',
  '4-26': 'Niedziela handlowa — ostatnia niedziela kwietnia',
  '6-28': 'Niedziela handlowa — ostatnia niedziela czerwca',
  '8-30': 'Niedziela handlowa — przed szkołą',
  '12-6': 'Niedziela handlowa — przedświąteczna',
  '12-13': 'Niedziela handlowa — przedświąteczna',
  '12-20': 'Niedziela handlowa — przedświąteczna',
};
function shoppingSundayInfo(year, m, d, dow) {
  if (year !== 2026 || dow !== 0) return null;
  const key = `${m}-${d}`;
  return OPEN_SUNDAYS_2026[key]
    ? { open: true, label: OPEN_SUNDAYS_2026[key] }
    : { open: false, label: 'Niedziela niehandlowa — sklepy zamknięte' };
}

function buildMonthData(year, monthIdx0) {
  const m = monthIdx0 + 1;
  const daysInMonth = new Date(year, m, 0).getDate();
  const rows = [];
  const holidaysInMonth = [];
  let weekendCount = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, monthIdx0, d);
    const dow = date.getDay();
    const key = `${year}-${pad(m)}-${pad(d)}`;
    const isHoliday = !!HOLIDAYS[key];
    const isWeekend = dow === 0 || dow === 6;
    if (isWeekend) weekendCount++;
    if (isHoliday) holidaysInMonth.push({ day: d, name: holidayNameFor(key), dow });
    const sun = sunTimesFor(year, m, d);
    const moon = getMoonPhaseCompact(year, m, d);
    rows.push({
      day: d, dow, key, isHoliday, isWeekend,
      dayName: DAY_NAMES[dow === 0 ? 6 : dow - 1],
      sun, moon, zodiac: getSunZodiac(m, d),
      shopping: shoppingSundayInfo(year, m, d, dow),
    });
  }
  return { daysInMonth, rows, holidaysInMonth, weekendCount };
}

function buildPage(year, monthIdx0) {
  const m = monthIdx0 + 1;
  const slug = MONTH_SLUGS[monthIdx0];
  const monthName = MONTH_NAMES[monthIdx0];
  const monthGen = MONTH_GEN[monthIdx0];
  const { daysInMonth, rows, holidaysInMonth, weekendCount } = buildMonthData(year, monthIdx0);
  const pageUrl = `https://daybyday.today/kalendarz/${year}/${slug}/`;

  const holidaysText = holidaysInMonth.length
    ? holidaysInMonth.map(h => `${h.name} (${h.day} ${monthGen}${h.dow === 0 || h.dow === 6 ? ', ' + (h.dow === 6 ? 'sobota' : 'niedziela') : ''})`).join(', ')
    : 'brak świąt ustawowo wolnych od pracy';
  const title = `Kalendarz ${monthName} ${year} — dni, święta, wschody słońca | DaybyDay`;
  const metaDesc = `Kalendarz na ${monthName.toLowerCase()} ${year}: wszystkie dni tygodnia, wschody i zachody słońca, fazy księżyca i znaki zodiaku. ${daysInMonth} dni, ${weekendCount} dni weekendowych, ${holidaysInMonth.length} ${holidaysInMonth.length === 1 ? 'święto ustawowe' : 'święta ustawowe'}.`;
  const pageSub = `${monthName} ${year} roku ma ${daysInMonth} dni, w tym ${weekendCount} dni weekendowych. Święta ustawowo wolne od pracy: ${holidaysText}.`;

  const breadcrumbItems = [
    { name: 'DaybyDay', url: 'https://daybyday.today/' },
    { name: 'Kalendarz roczny', url: 'https://daybyday.today/kalendarz.html' },
    { name: `${monthName} ${year}`, url: pageUrl },
  ];
  const breadcrumbHtml = `<nav class="breadcrumb" aria-label="breadcrumb">${breadcrumbItems.map((it, i) => i === breadcrumbItems.length - 1 ? `<span>${it.name}</span>` : `<a href="${it.url}">${it.name}</a>`).join(' › ')}</nav>`;
  const articleLd = jsonLdScript({
    '@context': 'https://schema.org', '@type': 'Article',
    headline: `Kalendarz ${monthName} ${year}`, description: metaDesc, url: pageUrl,
    inLanguage: 'pl', isPartOf: { '@type': 'WebSite', name: 'DaybyDay', url: 'https://daybyday.today/' },
  });
  const breadcrumbLd = jsonLdScript({
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: breadcrumbItems.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: it.url })),
  });

  const tableRows = rows.map(r => {
    const cls = [r.isHoliday ? 'holiday' : '', r.isWeekend ? 'weekend' : ''].filter(Boolean).join(' ');
    const dayLink = `/kartka/${pad(m)}-${pad(r.day)}/`;
    const noteParts = [];
    if (r.isHoliday) noteParts.push(esc(holidayNameFor(r.key)));
    if (r.shopping) noteParts.push(`<span class="${r.shopping.open ? 'shop-open' : 'shop-closed'}">${esc(r.shopping.label)}</span>`);
    const noteCell = noteParts.length ? `<td class="holiday-name">${noteParts.join(' · ')}</td>` : '<td></td>';
    return `<tr class="${cls}"><td class="day-cell"><a href="${dayLink}">${r.day} ${r.dayName}</a></td><td>${r.sun.rise}</td><td>${r.sun.set}</td><td>${r.sun.len}</td><td>${r.moon.icon} ${esc(r.moon.sign)}</td><td>${esc(r.zodiac)}</td>${noteCell}</tr>`;
  }).join('');

  // Nawigacja miedzy miesiacami (moze przechodzic przez granice roku, tylko jesli docelowy rok jest w zakresie YEARS)
  let prevY = year, prevM = monthIdx0 - 1;
  if (prevM < 0) { prevM = 11; prevY = year - 1; }
  let nextY = year, nextM = monthIdx0 + 1;
  if (nextM > 11) { nextM = 0; nextY = year + 1; }
  const prevLink = YEARS.includes(prevY) ? `<a href="/kalendarz/${prevY}/${MONTH_SLUGS[prevM]}/">← ${MONTH_NAMES[prevM]} ${prevY}</a>` : '<span></span>';
  const nextLink = YEARS.includes(nextY) ? `<a href="/kalendarz/${nextY}/${MONTH_SLUGS[nextM]}/">${MONTH_NAMES[nextM]} ${nextY} →</a>` : '<span></span>';

  const monthChips = MONTH_SLUGS.map((s, i) => `<a href="/kalendarz/${year}/${s}/" class="month-chip${i === monthIdx0 ? ' active' : ''}">${MONTH_NAMES[i]}</a>`).join('');
  const otherYears = YEARS.filter(y => y !== year).map(y => `<a href="/kalendarz/${y}/${slug}/" class="month-chip">${monthName} ${y}</a>`).join('');

  return `<!DOCTYPE html>
<html lang="pl">
<head>
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-2LQZRJPF39"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-2LQZRJPF39');
  </script>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="${esc(metaDesc)}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${pageUrl}">
  <meta property="og:title" content="Kalendarz ${monthName} ${year}">
  <meta property="og:description" content="${esc(metaDesc)}">
  <meta property="og:type" content="website">
  <meta property="og:image" content="https://daybyday.today/og-image.svg">
  <meta property="og:url" content="${pageUrl}">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  ${articleLd}
  ${breadcrumbLd}

  <link rel="stylesheet" href="/fonts.css">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root { --bg:#F8F7F5; --surface:#FFFFFF; --border:#E8E5E0; --text:#1A1916; --muted:#6B6762; --tag-bg:#F0EDEA; --radius:16px; --holiday:#FDF2EE; --holiday-text:#8B3A1A; }
    html, body { max-width: 100vw; overflow-x: clip; }
    body { font-family:'Outfit',sans-serif; background:var(--bg); color:var(--text); -webkit-font-smoothing:antialiased; line-height:1.65; }
    .topnav { position:sticky; top:0; z-index:50; background:rgba(248,247,245,0.9); backdrop-filter:blur(12px); border-bottom:1px solid var(--border); padding:0 2rem; height:56px; display:flex; align-items:center; justify-content:space-between; }
    .nav-logo { font-family:'Instrument Serif',serif; font-size:1.25rem; color:var(--text); text-decoration:none; display:flex; align-items:center; gap:.5rem; }
    .nav-links { display:flex; gap:.25rem; list-style:none; }
    .nav-links a { font-size:.8rem; font-weight:500; color:var(--muted); text-decoration:none; padding:.35rem .75rem; border-radius:8px; }
    .nav-links a:hover { background:var(--tag-bg); color:var(--text); }
    .page { max-width:1120px; margin:0 auto; padding:2.5rem 2rem 6rem; }
    .breadcrumb { font-size:.78rem; color:var(--muted); margin-bottom:1rem; }
    .breadcrumb a { color:var(--muted); text-decoration:none; }
    .breadcrumb a:hover { color:var(--text); }
    .page-label { font-size:.72rem; font-weight:600; letter-spacing:.12em; text-transform:uppercase; color:var(--muted); margin-bottom:.6rem; }
    .page-title { font-family:'Instrument Serif',serif; font-size:clamp(2rem,5vw,3rem); font-weight:400; line-height:1.15; letter-spacing:-.02em; margin-bottom:.75rem; }
    .page-sub { font-size:.9rem; color:var(--muted); line-height:1.65; max-width:700px; margin-bottom:2rem; }
    .month-nav { display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; font-size:.85rem; }
    .month-nav a { color:var(--text); text-decoration:none; font-weight:500; }
    .month-nav a:hover { text-decoration:underline; }
    .cal-table-wrap { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); overflow:hidden; margin-bottom:2rem; overflow-x:auto; }
    table.cal-table { width:100%; border-collapse:collapse; font-size:.82rem; white-space:nowrap; }
    table.cal-table th, table.cal-table td { padding:.6rem .9rem; text-align:left; border-bottom:1px solid var(--border); }
    table.cal-table thead th { font-size:.66rem; font-weight:600; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); background:var(--tag-bg); }
    table.cal-table tbody tr:last-child td { border-bottom:none; }
    table.cal-table tr.weekend td { color:#C0735A; }
    table.cal-table tr.holiday { background:var(--holiday); }
    table.cal-table tr.holiday td.day-cell, table.cal-table tr.holiday td.holiday-name { color:var(--holiday-text); font-weight:600; }
    table.cal-table .day-cell a { color:inherit; text-decoration:none; }
    table.cal-table .day-cell a:hover { text-decoration:underline; }
    .shop-open { color:#3A6B3F; }
    .shop-closed { color:#8B3A1A; }
    [data-theme="dark"] .shop-open { color:#7BC87F; }
    [data-theme="dark"] .shop-closed { color:#D47A5A; }
    .chips-section { margin-bottom:2rem; }
    .chips-label { font-size:.72rem; font-weight:600; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); margin-bottom:.6rem; }
    .chips { display:flex; flex-wrap:wrap; gap:.5rem; }
    .month-chip { font-size:.78rem; padding:.35rem .8rem; background:var(--surface); border:1px solid var(--border); border-radius:60px; color:var(--text); text-decoration:none; }
    .month-chip:hover { background:var(--tag-bg); }
    .month-chip.active { background:var(--text); color:var(--bg); border-color:var(--text); }
    .full-cal-link { font-size:.85rem; margin-bottom:2rem; display:inline-block; }
    footer { border-top:1px solid var(--border); padding:2rem; max-width:1120px; margin:0 auto; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:1rem; }
    .footer-logo { font-family:'Instrument Serif',serif; font-size:1rem; }
    .footer-links { display:flex; gap:1.5rem; }
    .footer-links a { font-size:.78rem; color:var(--muted); text-decoration:none; }
    @media(max-width:600px){ .page{padding-left:12px;padding-right:12px} .nav-links{display:none} table.cal-table{font-size:.74rem} table.cal-table th,table.cal-table td{padding:.45rem .5rem} }
  </style>
  <style id="dark-mode-styles">
    [data-theme="dark"] { --bg:#111110; --surface:#1B1A18; --border:#2C2A27; --text:#F0EDE8; --muted:#9A9790; --tag-bg:#232220; --holiday:#1F0D0A; --holiday-text:#D47A5A; }
    [data-theme="dark"] a { color: inherit; }
  </style>
  <script>
    (function(){
      var s=localStorage.getItem('dbd-theme');
      var p=window.matchMedia('(prefers-color-scheme:dark)').matches;
      document.documentElement.setAttribute('data-theme',s||(p?'dark':'light'));
    })();
  </script>
</head>
<body>
<nav class="topnav">
  <a href="/" class="nav-logo"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="26" height="26" style="flex-shrink:0;"><rect width="32" height="32" rx="8" fill="#1A1916"/><text x="16" y="23" font-family="Georgia,serif" font-size="20" fill="#F8F7F5" text-anchor="middle">D</text></svg>DaybyDay</a>
  <ul class="nav-links">
    <li><a href="/">Główna</a></li>
    <li><a href="/imieniny.html">Imieniny</a></li>
    <li><a href="/swieta.html">Święta</a></li>
    <li><a href="/kalendarz-liturgiczny.html">Liturgiczny</a></li>
    <li><a href="/kalkulatory.html">Kalkulatory</a></li>
  </ul>
</nav>

<div class="page">
  ${breadcrumbHtml}
  <div class="page-label">Kalendarz</div>
  <h1 class="page-title">${monthName} ${year}</h1>
  <p class="page-sub">${pageSub}</p>

  <div class="month-nav">
    ${prevLink}
    <a href="/kalendarz/${year}/">Cały rok ${year} →</a>
    ${nextLink}
  </div>

  <div class="cal-table-wrap">
    <table class="cal-table">
      <thead><tr><th>Dzień</th><th>Wschód</th><th>Zachód</th><th>Dł. dnia</th><th>Księżyc</th><th>Zodiak</th><th>Święto</th></tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>

  <div class="chips-section">
    <div class="chips-label">Inne miesiące ${year}</div>
    <div class="chips">${monthChips}</div>
  </div>

  ${otherYears ? `<div class="chips-section"><div class="chips-label">${monthName} w innych latach</div><div class="chips">${otherYears}</div></div>` : ''}
</div>

<footer>
  <div class="footer-logo">DaybyDay</div>
  <div class="footer-links"><a href="/polityka-prywatnosci.html">Polityka prywatności</a><a href="mailto:kontakt@daybyday.today">kontakt@daybyday.today</a></div>
  <p class="footer-copy" style="font-size:.75rem;color:var(--muted)">&copy; ${year} daybyday.today</p>
</footer>
</body>
</html>
`;
}

function buildYearPage(year) {
  const pageUrl = `https://daybyday.today/kalendarz/${year}/`;
  const isLeap = (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0));
  const daysInYear = isLeap ? 366 : 365;
  const yearHolidays = Object.keys(HOLIDAY_NAMES).filter(k => k.startsWith(`${year}-`)).sort();
  const holidayRows = yearHolidays.map(k => {
    const [, m, d] = k.split('-').map(Number);
    const date = new Date(year, m - 1, d);
    const dow = date.getDay();
    const dowLabel = dow === 0 ? 'niedziela' : dow === 6 ? 'sobota' : DAY_NAMES_FULL[dow - 1].toLowerCase();
    return `<tr><td>${d} ${MONTH_GEN[m - 1]}</td><td>${esc(HOLIDAY_NAMES[k])}</td><td>${dowLabel}</td></tr>`;
  }).join('');

  const monthCards = MONTH_SLUGS.map((slug, i) => {
    const { daysInMonth, holidaysInMonth, weekendCount } = buildMonthData(year, i);
    const holidayLabel = holidaysInMonth.length ? `${holidaysInMonth.length} ${holidaysInMonth.length === 1 ? 'święto' : 'święta'}` : 'brak świąt';
    return `<a href="/kalendarz/${year}/${slug}/" class="month-card-link"><div class="month-card-name">${MONTH_NAMES[i]}</div><div class="month-card-meta">${daysInMonth} dni · ${weekendCount} weekendowych · ${holidayLabel}</div></a>`;
  }).join('');

  const title = `Kalendarz ${year} — wszystkie miesiące, święta, dni wolne | DaybyDay`;
  const metaDesc = `Kalendarz na cały ${year} rok: 12 miesięcy, ${yearHolidays.length} świąt ustawowo wolnych od pracy, wschody i zachody słońca, fazy księżyca. Wybierz miesiąc, żeby zobaczyć szczegóły.`;
  const pageSub = `Rok ${year} ma ${daysInYear} dni i ${yearHolidays.length} świąt ustawowo wolnych od pracy. Wybierz miesiąc poniżej, żeby zobaczyć szczegółową tabelę dnia (wschody/zachody słońca, fazy księżyca, znaki zodiaku).`;

  const breadcrumbItems = [
    { name: 'DaybyDay', url: 'https://daybyday.today/' },
    { name: 'Kalendarz roczny', url: 'https://daybyday.today/kalendarz.html' },
    { name: `${year}`, url: pageUrl },
  ];
  const breadcrumbHtml = `<nav class="breadcrumb" aria-label="breadcrumb">${breadcrumbItems.map((it, i) => i === breadcrumbItems.length - 1 ? `<span>${it.name}</span>` : `<a href="${it.url}">${it.name}</a>`).join(' › ')}</nav>`;
  const articleLd = jsonLdScript({
    '@context': 'https://schema.org', '@type': 'Article',
    headline: `Kalendarz ${year}`, description: metaDesc, url: pageUrl,
    inLanguage: 'pl', isPartOf: { '@type': 'WebSite', name: 'DaybyDay', url: 'https://daybyday.today/' },
  });
  const breadcrumbLd = jsonLdScript({
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: breadcrumbItems.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: it.url })),
  });

  const prevLink = YEARS.includes(year - 1) ? `<a href="/kalendarz/${year - 1}/">← ${year - 1}</a>` : '<span></span>';
  const nextLink = YEARS.includes(year + 1) ? `<a href="/kalendarz/${year + 1}/">${year + 1} →</a>` : '<span></span>';

  return `<!DOCTYPE html>
<html lang="pl">
<head>
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-2LQZRJPF39"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-2LQZRJPF39');
  </script>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="${esc(metaDesc)}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${pageUrl}">
  <meta property="og:title" content="Kalendarz ${year}">
  <meta property="og:description" content="${esc(metaDesc)}">
  <meta property="og:type" content="website">
  <meta property="og:image" content="https://daybyday.today/og-image.svg">
  <meta property="og:url" content="${pageUrl}">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  ${articleLd}
  ${breadcrumbLd}

  <link rel="stylesheet" href="/fonts.css">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root { --bg:#F8F7F5; --surface:#FFFFFF; --border:#E8E5E0; --text:#1A1916; --muted:#6B6762; --tag-bg:#F0EDEA; --radius:16px; }
    html, body { max-width: 100vw; overflow-x: clip; }
    body { font-family:'Outfit',sans-serif; background:var(--bg); color:var(--text); -webkit-font-smoothing:antialiased; line-height:1.65; }
    .topnav { position:sticky; top:0; z-index:50; background:rgba(248,247,245,0.9); backdrop-filter:blur(12px); border-bottom:1px solid var(--border); padding:0 2rem; height:56px; display:flex; align-items:center; justify-content:space-between; }
    .nav-logo { font-family:'Instrument Serif',serif; font-size:1.25rem; color:var(--text); text-decoration:none; display:flex; align-items:center; gap:.5rem; }
    .nav-links { display:flex; gap:.25rem; list-style:none; }
    .nav-links a { font-size:.8rem; font-weight:500; color:var(--muted); text-decoration:none; padding:.35rem .75rem; border-radius:8px; }
    .nav-links a:hover { background:var(--tag-bg); color:var(--text); }
    .page { max-width:1120px; margin:0 auto; padding:2.5rem 2rem 6rem; }
    .breadcrumb { font-size:.78rem; color:var(--muted); margin-bottom:1rem; }
    .breadcrumb a { color:var(--muted); text-decoration:none; }
    .breadcrumb a:hover { color:var(--text); }
    .page-label { font-size:.72rem; font-weight:600; letter-spacing:.12em; text-transform:uppercase; color:var(--muted); margin-bottom:.6rem; }
    .page-title { font-family:'Instrument Serif',serif; font-size:clamp(2rem,5vw,3rem); font-weight:400; line-height:1.15; letter-spacing:-.02em; margin-bottom:.75rem; }
    .page-sub { font-size:.9rem; color:var(--muted); line-height:1.65; max-width:700px; margin-bottom:2rem; }
    .year-nav { display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; font-size:.85rem; }
    .year-nav a { color:var(--text); text-decoration:none; font-weight:500; }
    .year-nav a:hover { text-decoration:underline; }
    .months-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:1rem; margin-bottom:2.5rem; }
    .month-card-link { display:block; background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); padding:1.1rem 1.25rem; text-decoration:none; color:var(--text); transition:border-color .15s; }
    .month-card-link:hover { border-color:#C8C4BE; }
    .month-card-name { font-family:'Instrument Serif',serif; font-size:1.15rem; margin-bottom:.3rem; }
    .month-card-meta { font-size:.75rem; color:var(--muted); }
    .holidays-table-wrap { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); overflow:hidden; margin-bottom:2rem; }
    table.holidays-table { width:100%; border-collapse:collapse; font-size:.85rem; }
    table.holidays-table th, table.holidays-table td { padding:.7rem 1.1rem; text-align:left; border-bottom:1px solid var(--border); }
    table.holidays-table thead th { font-size:.66rem; font-weight:600; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); background:var(--tag-bg); }
    table.holidays-table tbody tr:last-child td { border-bottom:none; }
    .section-label { font-size:.72rem; font-weight:600; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); margin-bottom:.75rem; }
    .full-cal-link { font-size:.85rem; }
    footer { border-top:1px solid var(--border); padding:2rem; max-width:1120px; margin:0 auto; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:1rem; }
    .footer-logo { font-family:'Instrument Serif',serif; font-size:1rem; }
    .footer-links { display:flex; gap:1.5rem; }
    .footer-links a { font-size:.78rem; color:var(--muted); text-decoration:none; }
    @media(max-width:600px){ .page{padding-left:12px;padding-right:12px} .nav-links{display:none} .months-grid{grid-template-columns:1fr 1fr} }
  </style>
  <style id="dark-mode-styles">
    [data-theme="dark"] { --bg:#111110; --surface:#1B1A18; --border:#2C2A27; --text:#F0EDE8; --muted:#9A9790; --tag-bg:#232220; }
    [data-theme="dark"] a { color: inherit; }
  </style>
  <script>
    (function(){
      var s=localStorage.getItem('dbd-theme');
      var p=window.matchMedia('(prefers-color-scheme:dark)').matches;
      document.documentElement.setAttribute('data-theme',s||(p?'dark':'light'));
    })();
  </script>
</head>
<body>
<nav class="topnav">
  <a href="/" class="nav-logo"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="26" height="26" style="flex-shrink:0;"><rect width="32" height="32" rx="8" fill="#1A1916"/><text x="16" y="23" font-family="Georgia,serif" font-size="20" fill="#F8F7F5" text-anchor="middle">D</text></svg>DaybyDay</a>
  <ul class="nav-links">
    <li><a href="/">Główna</a></li>
    <li><a href="/imieniny.html">Imieniny</a></li>
    <li><a href="/swieta.html">Święta</a></li>
    <li><a href="/kalendarz-liturgiczny.html">Liturgiczny</a></li>
    <li><a href="/kalkulatory.html">Kalkulatory</a></li>
  </ul>
</nav>

<div class="page">
  ${breadcrumbHtml}
  <div class="page-label">Kalendarz</div>
  <h1 class="page-title">Kalendarz ${year}</h1>
  <p class="page-sub">${pageSub}</p>

  <div class="year-nav">
    ${prevLink}
    <a href="/kalendarz.html">Wszystkie lata (widok interaktywny) →</a>
    ${nextLink}
  </div>

  <div class="months-grid">${monthCards}</div>

  <div class="section-label">Święta ustawowo wolne od pracy w ${year} roku</div>
  <div class="holidays-table-wrap">
    <table class="holidays-table">
      <thead><tr><th>Data</th><th>Święto</th><th>Dzień tygodnia</th></tr></thead>
      <tbody>${holidayRows}</tbody>
    </table>
  </div>

  ${year === 2026 ? `<p class="full-cal-link"><a href="/wymiar-czasu-pracy.html">Sprawdź wymiar czasu pracy na ${year} rok →</a></p>` : ''}
</div>

<footer>
  <div class="footer-logo">DaybyDay</div>
  <div class="footer-links"><a href="/polityka-prywatnosci.html">Polityka prywatności</a><a href="mailto:kontakt@daybyday.today">kontakt@daybyday.today</a></div>
  <p class="footer-copy" style="font-size:.75rem;color:var(--muted)">&copy; ${year} daybyday.today</p>
</footer>
</body>
</html>
`;
}

function main() {
  let written = 0, unchanged = 0;
  for (const year of YEARS) {
    for (let monthIdx0 = 0; monthIdx0 < 12; monthIdx0++) {
      const slug = MONTH_SLUGS[monthIdx0];
      const key = `${year}-${slug}`;
      if (onlyList && !onlyList.includes(key)) continue;
      const page = buildPage(year, monthIdx0);
      const folder = path.join(ROOT, 'kalendarz', String(year), slug);
      if (!DRY && !fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
      const filePath = path.join(folder, 'index.html');
      const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
      if (existing === page) { unchanged++; continue; }
      if (!DRY) fs.writeFileSync(filePath, page, 'utf8');
      written++;
    }
  }
  console.log(`Stron /kalendarz/<rok>/<miesiac>/: ${YEARS.length * 12} razem, zapisanych/zmienionych: ${written}${DRY ? ' (DRY RUN)' : ''}, bez zmian: ${unchanged}`);

  let yearWritten = 0, yearUnchanged = 0;
  for (const year of YEARS) {
    if (onlyList && !onlyList.includes(`${year}-index`)) continue;
    const page = buildYearPage(year);
    const folder = path.join(ROOT, 'kalendarz', String(year));
    if (!DRY && !fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
    const filePath = path.join(folder, 'index.html');
    const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
    if (existing === page) { yearUnchanged++; continue; }
    if (!DRY) fs.writeFileSync(filePath, page, 'utf8');
    yearWritten++;
  }
  console.log(`Stron /kalendarz/<rok>/ (parasol): ${YEARS.length} razem, zapisanych/zmienionych: ${yearWritten}${DRY ? ' (DRY RUN)' : ''}, bez zmian: ${yearUnchanged}`);
}

main();
