// Generuje /imieniny/miesiac/<slug>/index.html — 12 statycznych, indeksowalnych
// stron-hubow per miesiac (np. /imieniny/miesiac/sierpien/), kazda z siatka
// kalendarza pokazujaca 1-2 najpopularniejsze imiona na kazdy dzien (klikalne do
// /imieniny/<imie>/), analogicznie do "Kalendarz popularnych imienin na poszczegolne
// miesiace" u konkurencji (kalendarzswiat.pl /imieniny_sierpien/ itd.).
//
// Segment "miesiac/" w URL celowo oddziela te strony od /imieniny/<imie>/ (zeby
// nazwa miesiaca nigdy nie mogla kolidowac ze slugiem imienia).
//
// Zrodla danych (jedno zrodlo prawdy, bez duplikacji):
//  - imieniny.html -> NAMES (imiona per dzien), NAME_PRIMARY_DAY (glowny dzien
//    dla imion obchodzonych kilka razy w roku)
//  - name_popularity.js -> NAME_POPULARITY (do sortowania popularnosci)
//  - name_genitive.js -> NAME_GENITIVE (dopelniacz, fallback do mianownika)
//
// Uzycie: node scripts/gen_imieniny_miesiace.js [--dry-run] [--only=sierpien]

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const DRY = process.argv.includes('--dry-run');
const onlyArg = process.argv.find(a => a.startsWith('--only='));
const onlyList = onlyArg ? onlyArg.split('=')[1].split(',') : null;

function readFile(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/^\uFEFF/, ''); }
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function jsonLdScript(obj) { return `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`; }
function nameSlug(n) { return n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/[^a-z0-9-]/g, ''); }

// --- 1. NAMES + NAME_PRIMARY_DAY z imieniny.html ---
const imieninyRaw = readFile('imieniny.html');
const namesMatch = imieninyRaw.match(/const NAMES=\r?\n(\[[\s\S]*?\r?\n\]);/);
if (!namesMatch) throw new Error('Nie znaleziono NAMES w imieniny.html');
const NAMES = eval(namesMatch[1]);

const pdStart = imieninyRaw.indexOf('const NAME_PRIMARY_DAY = {');
const pdEnd = imieninyRaw.indexOf('\n};', pdStart) + 3;
if (pdStart === -1) throw new Error('Nie znaleziono NAME_PRIMARY_DAY w imieniny.html');
const NAME_PRIMARY_DAY = eval('(' + imieninyRaw.slice(pdStart + 'const NAME_PRIMARY_DAY = '.length, pdEnd - 1) + ')');

// --- 2. NAME_POPULARITY ---
const popSandbox = {};
vm.createContext(popSandbox);
vm.runInContext(readFile('name_popularity.js') + '\nthis.__P__ = NAME_POPULARITY;', popSandbox);
const NAME_POPULARITY = popSandbox.__P__;

// --- 3. NAME_GENITIVE (fallback do mianownika) ---
const genSandbox = {};
vm.createContext(genSandbox);
vm.runInContext(readFile('name_genitive.js') + '\nthis.__G__ = NAME_GENITIVE;', genSandbox);
const NAME_GENITIVE = genSandbox.__G__;

const MONTH_NAMES = ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'];
const MONTH_LOCATIVE = ['Styczniu','Lutym','Marcu','Kwietniu','Maju','Czerwcu','Lipcu','Sierpniu','Wrześniu','Październiku','Listopadzie','Grudniu'];
const MONTH_GEN = ['stycznia','lutego','marca','kwietnia','maja','czerwca','lipca','sierpnia','września','października','listopada','grudnia'];
const MONTH_SLUGS = ['styczen','luty','marzec','kwiecien','maj','czerwiec','lipiec','sierpien','wrzesien','pazdziernik','listopad','grudzien'];
const MONTH_DAYS = [31,28,31,30,31,30,31,31,30,31,30,31];

// dzień+miesiąc -> lista imion tego dnia (z NAMES: [miesiąc, dzień, [imiona]])
const dayMap = {};
for (const [m, d, names] of NAMES) {
  dayMap[`${m}-${d}`] = names;
}

function popularNamesFor(d, m) {
  const all = dayMap[`${m}-${d}`] || [];
  const primary = all
    .filter(n => { const p = NAME_PRIMARY_DAY[n]; return !p || (p[0] === d && p[1] === m); })
    .sort((a, b) => (NAME_POPULARITY[b] || 0) - (NAME_POPULARITY[a] || 0));
  const pool = primary.length ? primary : all.slice().sort((a, b) => (NAME_POPULARITY[b] || 0) - (NAME_POPULARITY[a] || 0));
  return pool.slice(0, 2);
}

function buildPage(monthIdx0) {
  const m = monthIdx0 + 1;
  const slug = MONTH_SLUGS[monthIdx0];
  const monthName = MONTH_NAMES[monthIdx0];
  const monthLoc = MONTH_LOCATIVE[monthIdx0];
  const daysInMonth = MONTH_DAYS[monthIdx0];
  const pageUrl = `https://daybyday.today/imieniny/miesiac/${slug}/`;

  const title = `Imieniny w ${monthLoc} — najpopularniejsze imiona na każdy dzień | DaybyDay`;
  const metaDesc = `Kalendarz imienin na ${monthName.toLowerCase()} — sprawdź, jakie imiona są obchodzone każdego dnia miesiąca. Kliknij imię, żeby poznać jego znaczenie i historię.`;
  const pageSub = `Poniższy kalendarz pokazuje najpopularniejsze imieniny na każdy dzień ${MONTH_GEN[monthIdx0]}. Kliknij imię, by zobaczyć jego znaczenie, historię i wszystkich solenizantów danego dnia.`;

  const dayCells = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const top = popularNamesFor(d, m);
    const namesHtml = top.length
      ? top.map(n => `<a href="/imieniny/${nameSlug(n)}/">${esc(NAME_GENITIVE[n] || n)}</a>`).join(', ')
      : '<span class="im-none">—</span>';
    const kartkaSlug = `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    dayCells.push(`<div class="im-day"><a class="im-day-num" href="/kartka/${kartkaSlug}/">${d}</a><div class="im-day-names">${namesHtml}</div></div>`);
  }

  const breadcrumbItems = [
    { name: 'DaybyDay', url: 'https://daybyday.today/' },
    { name: 'Imieniny', url: 'https://daybyday.today/imieniny.html' },
    { name: monthName, url: pageUrl },
  ];
  const breadcrumbHtml = `<nav class="breadcrumb" aria-label="breadcrumb">${breadcrumbItems.map((it, i) => i === breadcrumbItems.length - 1 ? `<span>${it.name}</span>` : `<a href="${it.url}">${it.name}</a>`).join(' › ')}</nav>`;
  const articleLd = jsonLdScript({
    '@context': 'https://schema.org', '@type': 'Article',
    headline: `Imieniny w ${monthLoc}`, description: metaDesc, url: pageUrl,
    inLanguage: 'pl', isPartOf: { '@type': 'WebSite', name: 'DaybyDay', url: 'https://daybyday.today/' },
  });
  const breadcrumbLd = jsonLdScript({
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: breadcrumbItems.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: it.url })),
  });

  const prevIdx = (monthIdx0 - 1 + 12) % 12;
  const nextIdx = (monthIdx0 + 1) % 12;
  const prevLink = `<a href="/imieniny/miesiac/${MONTH_SLUGS[prevIdx]}/">← ${MONTH_NAMES[prevIdx]}</a>`;
  const nextLink = `<a href="/imieniny/miesiac/${MONTH_SLUGS[nextIdx]}/">${MONTH_NAMES[nextIdx]} →</a>`;
  const monthChips = MONTH_SLUGS.map((s, i) => `<a href="/imieniny/miesiac/${s}/" class="month-chip${i === monthIdx0 ? ' active' : ''}">${MONTH_NAMES[i]}</a>`).join('');

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
  <meta property="og:title" content="Imieniny w ${monthLoc}">
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
    .month-nav { display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; font-size:.85rem; }
    .month-nav a { color:var(--text); text-decoration:none; font-weight:500; }
    .month-nav a:hover { text-decoration:underline; }
    .im-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:.75rem; margin-bottom:2.5rem; }
    .im-day { background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:.85rem 1rem; }
    .im-day-num { font-family:'Instrument Serif',serif; font-size:1.1rem; color:var(--text); text-decoration:none; display:block; margin-bottom:.35rem; }
    .im-day-num:hover { text-decoration:underline; }
    .im-day-names { font-size:.8rem; line-height:1.5; }
    .im-day-names a { color:var(--muted); text-decoration:none; }
    .im-day-names a:hover { color:var(--text); text-decoration:underline; }
    .im-none { color:#D0CDC8; }
    .chips-section { margin-bottom:2rem; }
    .chips-label { font-size:.72rem; font-weight:600; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); margin-bottom:.6rem; }
    .chips { display:flex; flex-wrap:wrap; gap:.5rem; }
    .month-chip { font-size:.78rem; padding:.35rem .8rem; background:var(--surface); border:1px solid var(--border); border-radius:60px; color:var(--text); text-decoration:none; }
    .month-chip:hover { background:var(--tag-bg); }
    .month-chip.active { background:var(--text); color:var(--bg); border-color:var(--text); }
    footer { border-top:1px solid var(--border); padding:2rem; max-width:1120px; margin:0 auto; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:1rem; }
    .footer-logo { font-family:'Instrument Serif',serif; font-size:1rem; }
    .footer-links { display:flex; gap:1.5rem; }
    .footer-links a { font-size:.78rem; color:var(--muted); text-decoration:none; }
    @media(max-width:600px){ .page{padding-left:12px;padding-right:12px} .nav-links{display:none} .im-grid{grid-template-columns:repeat(auto-fill,minmax(120px,1fr))} }
  </style>
  <style id="dark-mode-styles">
    [data-theme="dark"] { --bg:#111110; --surface:#1B1A18; --border:#2C2A27; --text:#F0EDE8; --muted:#9A9790; --tag-bg:#232220; }
    [data-theme="dark"] a { color: inherit; }
    [data-theme="dark"] .im-none { color:#3A3733; }
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
    <li><a href="/kalendarz-szkolny.html">Kalendarz szkolny</a></li>
    <li><a href="/kalkulatory.html">Kalkulatory</a></li>
  </ul>
</nav>

<div class="page">
  ${breadcrumbHtml}
  <div class="page-label">Imieniny</div>
  <h1 class="page-title">Imieniny w ${monthLoc}</h1>
  <p class="page-sub">${pageSub}</p>

  <div class="month-nav">
    ${prevLink}
    <a href="/imieniny.html">Wyszukaj dowolne imię →</a>
    ${nextLink}
  </div>

  <div class="im-grid">${dayCells.join('')}</div>

  <div class="chips-section">
    <div class="chips-label">Inne miesiące</div>
    <div class="chips">${monthChips}</div>
  </div>
</div>

<footer>
  <div class="footer-logo">DaybyDay</div>
  <div class="footer-links"><a href="/polityka-prywatnosci.html">Polityka prywatności</a><a href="mailto:kontakt@daybyday.today">kontakt@daybyday.today</a></div>
  <p class="footer-copy" style="font-size:.75rem;color:var(--muted)">&copy; 2026 daybyday.today</p>
</footer>
</body>
</html>
`;
}

function main() {
  let written = 0, unchanged = 0;
  for (let monthIdx0 = 0; monthIdx0 < 12; monthIdx0++) {
    const slug = MONTH_SLUGS[monthIdx0];
    if (onlyList && !onlyList.includes(slug)) continue;
    const page = buildPage(monthIdx0);
    const folder = path.join(ROOT, 'imieniny', 'miesiac', slug);
    if (!DRY && !fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
    const filePath = path.join(folder, 'index.html');
    const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
    if (existing === page) { unchanged++; continue; }
    if (!DRY) fs.writeFileSync(filePath, page, 'utf8');
    written++;
  }
  console.log(`Stron /imieniny/miesiac/<slug>/: 12 razem, zapisanych/zmienionych: ${written}${DRY ? ' (DRY RUN)' : ''}, bez zmian: ${unchanged}`);
}

main();
