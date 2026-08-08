// Generuje lekkie statyczne podstrony swieto/<slug>/index.html dla swiat z listy
// "nietypowych" (tablica HOLIDAYS w swieta-nietypowe.html), ktore NIE zostaly jeszcze
// awansowane do bogatej bazy HOLIDAYS_DB w swieto.html. Uzywa wylacznie juz istniejacego,
// opublikowanego opisu (bez nowych faktow) — wylacznie po to, zeby kazde swieto mialo
// wlasny, poprawny canonical zamiast dzielenia jednego dynamicznego widoku
// (swieta-nietypowe.html?d=...&m=...) ze statycznymi meta-tagami dla wszystkich.
//
// Tryby:
//   node scripts/gen_static_nietypowe_pages.js              -> pelny przebieg
//   node scripts/gen_static_nietypowe_pages.js --dry-run     -> jw. ale bez zapisu
//   node scripts/gen_static_nietypowe_pages.js --limit=50    -> tylko pierwsze N kandydatow (testy)

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { regenerateRegistry, NAME_ALIASES } = require('./swieto_registry');

const ROOT = path.join(__dirname, '..');

const MONTH_NAMES_PL = ['stycznia','lutego','marca','kwietnia','maja','czerwca',
  'lipca','sierpnia','września','października','listopada','grudnia'];

const TAG_LABELS = { inne:'Dzień tematyczny', przyroda:'Przyroda', kultura:'Kultura',
  jedzenie:'Jedzenie i napoje', zdrowie:'Zdrowie', ludzie:'Ludzie i społeczeństwo' };

const DIACRITICS_MAP = {
  'ą':'a','ć':'c','ę':'e','ł':'l','ń':'n','ó':'o','ś':'s','ź':'z','ż':'z',
  'Ą':'a','Ć':'c','Ę':'e','Ł':'l','Ń':'n','Ó':'o','Ś':'s','Ź':'z','Ż':'z',
};

function slugify(name) {
  let s = name.split('').map(ch => DIACRITICS_MAP[ch] !== undefined ? DIACRITICS_MAP[ch] : ch).join('');
  s = s.toLowerCase();
  s = s.replace(/[^a-z0-9]+/g, '-');
  s = s.replace(/^-+|-+$/g, '');
  s = s.replace(/-{2,}/g, '-');
  return s;
}

function esc(s) { return String(s).replace(/"/g, '&quot;'); }

// Przycina opis do ~155 znakow (limit snippetu Google/Bing) na granicy slowa, z wielokropkiem.
function truncateDesc(str, maxLen = 155) {
  if (str.length <= maxLen) return str;
  const cut = str.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trim() + '…';
}

// Serializuje obiekt do <script type="application/ld+json">, escapujac "<" jako \u003c
// zeby tresc nigdy nie mogla przedwczesnie zamknac tagu <script>.
function jsonLdScript(obj) {
  return `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;
}

// Wyciaga literal tablicy/obiektu zaczynajacy sie po startMarker, liczac
// glebokosc nawiasow zamiast zakladac konkretny styl zakonczenia linii
// (CRLF/LF) - odporne na to, jakie EOL ma akurat plik zrodlowy.
function extractBalanced(raw, startMarker, openChar, closeChar) {
  const start = raw.indexOf(startMarker);
  if (start === -1) throw new Error(`Nie znaleziono "${startMarker}"`);
  const openIdx = raw.indexOf(openChar, start);
  let depth = 0, end = -1;
  for (let i = openIdx; i < raw.length; i++) {
    if (raw[i] === openChar) depth++;
    else if (raw[i] === closeChar) { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) throw new Error(`Nie znaleziono zamkniecia dla "${startMarker}"`);
  return raw.slice(start, end + 1);
}

// --- Wczytaj HOLIDAYS (nietypowe) ze swieta-nietypowe.html ---
function loadNietypoweHolidays() {
  const raw = fs.readFileSync(path.join(ROOT, 'swieta-nietypowe.html'), 'utf8');
  const src = extractBalanced(raw, 'const HOLIDAYS = [', '[', ']');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(src + ';\nthis.__H__ = HOLIDAYS;', sandbox);
  return sandbox.__H__;
}

const MONTH_INDEX_PL = { 'stycznia':1,'lutego':2,'marca':3,'kwietnia':4,'maja':5,'czerwca':6,
  'lipca':7,'sierpnia':8,'września':9,'października':10,'listopada':11,'grudnia':12 };

// --- Wczytaj HOLIDAYS_DB (juz awansowane) ze swieto.html, zeby wykluczyc duplikaty ---
// Zwraca zarowno zbior nazw (do dokladnego porownania), jak i liste {name, day, month}
// (do porownania fuzzy PO DACIE — patrz sameNormalizedName nizej: podobienstwo nazwy
// bez zgodnosci daty dawalo falszywe trafienia, np. "Swieto Polskiej Bielizny" [29 marca]
// vs "Miedzynarodowy Dzien Bielizny" [5 sierpnia] to dwa rozne, realne swieta).
function loadPromotedNames() {
  const raw = fs.readFileSync(path.join(ROOT, 'swieto.html'), 'utf8');
  const src = extractBalanced(raw, 'const HOLIDAYS_DB = {', '{', '}');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(src + ';\nthis.__DB__ = HOLIDAYS_DB;', sandbox);
  const names = new Set();
  const dated = [];
  for (const h of Object.values(sandbox.__DB__)) {
    names.add(h.name);
    const m = h.date && h.date.match(/^(\d{1,2})\s+(\p{L}+)/u);
    if (m) dated.push({ name: h.name, day: parseInt(m[1], 10), month: MONTH_INDEX_PL[m[2].toLowerCase()] });
  }
  return { names, dated };
}

// znane aliasy — ta sama realna okazja pod inna nazwa w bazie nietypowych,
// juz opisana pod inna nazwa w warstwie bogatej. Jedno zrodlo prawdy: NAME_ALIASES
// w swieto_registry.js (tam tez sluzy do linkowania SWIETO_NAME_TO_SLUG) — wczesniej
// ta lista byla utrzymywana rownolegle w obu plikach i mogla sie rozjechac.
const KNOWN_ALIAS_NAMES = new Set(Object.keys(NAME_ALIASES));

// --- Zabezpieczenie na przyszlosc: wykrywanie NOWYCH, jeszcze nie skatalogowanych
// aliasow po znormalizowanej nazwie (bez prefiksow typu "Miedzynarodowy"/"Swiatowy",
// bez wielkosci liter/diakrytykow), zeby ten sam blad (patrz audyt 2026-08-04, 77
// duplikatow) nie odtworzyl sie cicho przy kolejnych dopisywanych swietach. Celowo
// wymaga DOKLADNEJ rownosci znormalizowanego zbioru slow (nie progu podobienstwa) —
// to bezpieczne minimum, ktore w audycie 2026-08-04 nie dalo ani jednego falszywego
// trafienia (np. "Ogolnopolski Dzien Bez" nie zostal blednie dopasowany do "...bez
// Przeklenstw", bo maja rozne zbiory slow po normalizacji).
const STOPWORDS = new Set(['dzien','dzień','swiatowy','światowy','miedzynarodowy',
  'międzynarodowy','europejski','narodowy','ogolnopolski','ogólnopolski','krajowy',
  'dnia','swieto','święto','polski','polska','polskiej']);
function normalizedWordSet(name) {
  const norm = name.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ');
  return new Set(norm.split(/\s+/).filter(w => w.length > 2 && !STOPWORDS.has(w)));
}
function sameNormalizedName(a, b) {
  const sa = normalizedWordSet(a), sb = normalizedWordSet(b);
  if (sa.size === 0 || sb.size === 0 || sa.size !== sb.size) return false;
  for (const w of sa) if (!sb.has(w)) return false;
  return true;
}

function buildLightPage(slug, entry) {
  const [d, m, name, desc, tag] = entry;
  const dateStr = `${d} ${MONTH_NAMES_PL[m - 1]}`;
  const metaDesc = truncateDesc((desc || `${name} — ${dateStr}.`).replace(/<[^>]+>/g, ''));
  const tagLabel = TAG_LABELS[tag] || tag || '';

  const pageUrl = `https://daybyday.today/swieto/${slug}/`;
  const articleLd = jsonLdScript({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: name,
    description: metaDesc,
    url: pageUrl,
    inLanguage: 'pl',
    isPartOf: { '@type': 'WebSite', name: 'DaybyDay', url: 'https://daybyday.today/' },
  });
  const breadcrumbItems = [
    { name: 'DaybyDay', url: 'https://daybyday.today/' },
    { name: 'Święta nietypowe', url: 'https://daybyday.today/swieta-nietypowe.html' },
    { name: name, url: pageUrl },
  ];
  const breadcrumbLd = jsonLdScript({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbItems.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: it.url })),
  });
  const breadcrumbHtml = `<nav class="breadcrumb" aria-label="breadcrumb">${breadcrumbItems.map((it, i) => i === breadcrumbItems.length - 1 ? `<span>${esc(it.name)}</span>` : `<a href="${it.url}">${esc(it.name)}</a>`).join(' › ')}</nav>`;

  return `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(name)} — DaybyDay</title>
  <meta name="description" content="${esc(metaDesc)}">
  <link rel="canonical" href="${pageUrl}">
  <meta property="og:title" content="${esc(name)} | DaybyDay">
  <meta property="og:description" content="${esc(metaDesc)}">
  <meta property="og:url" content="${pageUrl}">
  <meta property="og:type" content="article">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  ${articleLd}
  ${breadcrumbLd}
  <script>(function(){var s=localStorage.getItem('dbd-theme');var p=window.matchMedia('(prefers-color-scheme:dark)').matches;document.documentElement.setAttribute('data-theme',s||(p?'dark':'light'));})();</script>
  <style>
    :root { --bg:#F8F7F5; --text:#1A1916; --muted:#555; --muted2:#888; --border:#e5e3de; --tagborder:#ddd; color-scheme: light dark; }
    [data-theme="dark"] { --bg:#111110; --text:#F0EDE8; --muted:#B0ACA4; --muted2:#8A8680; --border:#2C2A27; --tagborder:#3A3733; }
    body { font-family: Georgia, serif; max-width: 680px; margin: 2rem auto; padding: 0 1rem; color: var(--text); background: var(--bg); line-height: 1.7; }
    h1 { font-size: 2rem; margin-bottom: .25rem; }
    .date { font-size: 1.1rem; color: var(--muted); margin-bottom: 1.5rem; }
    .tag { display: inline-block; font-size: .75rem; text-transform: uppercase; letter-spacing: .08em; color: var(--muted2); border: 1px solid var(--tagborder); border-radius: 999px; padding: .2rem .7rem; margin-bottom: 1.5rem; }
    a { color: var(--text); }
    .breadcrumb { font-size: .8rem; color: var(--muted2); margin-bottom: 1rem; }
    .breadcrumb a { color: var(--muted2); }
    .breadcrumb a:hover { color: var(--text); }
    .topnav { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 1rem 0; margin-bottom: 1.5rem; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
    .topnav .nav-logo { font-weight: 700; color: var(--text); text-decoration: none; font-size: 1.05rem; flex-shrink: 0; }
    .topnav .nav-links { list-style: none; display: flex; gap: 1.1rem; margin: 0; padding: 0; flex-wrap: wrap; flex: 1; }
    .topnav .nav-links a { color: var(--muted); text-decoration: none; font-size: .85rem; }
    .topnav .nav-links a:hover { color: var(--text); }
    @media(max-width:480px){ .topnav .nav-links{gap:.6rem .9rem; font-size:.8rem;} }
    #themeToggle { background: none; border: 1px solid var(--border); border-radius: 8px; width: 32px; height: 32px; cursor: pointer; font-size: 14px; color: var(--muted); font-family: inherit; line-height: 1; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    #themeToggle:hover { background: var(--border); }
    #themeToggle::before { content: '☾'; }
    [data-theme="dark"] #themeToggle::before { content: '☀'; }
  </style>
</head>
<body>
  <nav class="topnav">
    <a href="/" class="nav-logo">DaybyDay</a>
    <ul class="nav-links">
      <li><a href="/">Główna</a></li>
      <li><a href="/imieniny.html">Imieniny</a></li>
      <li><a href="/swieta.html">Święta</a></li>
      <li><a href="/kalendarz-liturgiczny.html">Liturgiczny</a></li>
      <li><a href="/kalkulatory.html">Kalkulatory</a></li>
    </ul>
    <button id="themeToggle" onclick="var d=document.documentElement,t=d.getAttribute('data-theme')==='dark'?'light':'dark';d.setAttribute('data-theme',t);localStorage.setItem('dbd-theme',t);" aria-label="Przełącz tryb ciemny/jasny" title="Tryb ciemny/jasny"></button>
  </nav>
  ${breadcrumbHtml}
  <h1>${esc(name)}</h1>
  <p class="date">${esc(dateStr)}</p>
  <span class="tag">${esc(tagLabel)}</span>
  <p>${desc || ''}</p>
  <p><a href="/swieta-nietypowe.html?q=${encodeURIComponent(name)}">Zobacz na liście świąt nietypowych →</a></p>
  <p><a href="/">← DaybyDay</a></p>
</body>
</html>
`;
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitArg = args.find(a => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : Infinity;

  const HOLIDAYS = loadNietypoweHolidays();
  const { names: promotedNames, dated: promotedDated } = loadPromotedNames();

  const usedSlugs = new Set();
  // juz istniejace foldery (np. wygenerowane wczesniej przez ten sam skrypt lub bogaty generator)
  for (const entry of fs.readdirSync(path.join(ROOT, 'swieto'), { withFileTypes: true })) {
    if (entry.isDirectory()) usedSlugs.add(entry.name);
  }

  let written = 0, unchanged = 0, skippedPromoted = 0, skippedAlias = 0, skippedFuzzy = 0, processed = 0;
  const newFuzzyMatches = [];

  for (const entry of HOLIDAYS) {
    const name = entry[2];
    if (promotedNames.has(name)) { skippedPromoted++; continue; }
    if (KNOWN_ALIAS_NAMES.has(name)) { skippedAlias++; continue; }
    const [entryDay, entryMonth] = entry;
    const fuzzyMatch = promotedDated.find(pn =>
      pn.day === entryDay && pn.month === entryMonth && sameNormalizedName(pn.name, name));
    if (fuzzyMatch) {
      skippedFuzzy++;
      newFuzzyMatches.push({ name, fuzzyMatch: fuzzyMatch.name });
      continue;
    }
    if (processed >= limit) break;
    processed++;

    let slug = slugify(name);
    if (usedSlugs.has(slug)) {
      // sprawdz czy istniejacy plik pod tym slugiem opisuje TEN SAM wpis (np. ponowne
      // uruchomienie skryptu po czesciowym poprzednim przebiegu) — jesli tak, to nie
      // kolizja, tylko regeneracja tej samej strony, zostaw slug bez zmian.
      const existingPath = path.join(ROOT, 'swieto', slug, 'index.html');
      const existingTitle = fs.existsSync(existingPath)
        ? (fs.readFileSync(existingPath, 'utf8').match(/<meta property="og:title" content="([\s\S]*?) \| DaybyDay">/) || [])[1]
        : undefined;
      if (existingTitle !== name) {
        // prawdziwa kolizja (inne swieto o tym samym slugu) — dolacz dzien/miesiac dla unikalnosci
        slug = `${slug}-${entry[0]}-${entry[1]}`;
      }
    }
    usedSlugs.add(slug);

    const page = buildLightPage(slug, entry);
    const folder = path.join(ROOT, 'swieto', slug);
    const filePath = path.join(folder, 'index.html');
    const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
    if (existing === page) { unchanged++; continue; }
    if (!dryRun) {
      if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
      fs.writeFileSync(filePath, page, 'utf8');
    }
    written++;
  }

  let registryStats = null;
  if (!dryRun) registryStats = regenerateRegistry(ROOT);

  console.log(`Kandydatów (nie-awansowanych): ${HOLIDAYS.length - skippedPromoted - skippedAlias - skippedFuzzy}`);
  console.log(`Pominiętych (już awansowane do HOLIDAYS_DB): ${skippedPromoted}`);
  console.log(`Pominiętych (znany alias tego samego wydarzenia): ${skippedAlias}`);
  console.log(`Pominiętych (nowo wykryty prawdopodobny alias, NIE w NAME_ALIASES): ${skippedFuzzy}`);
  console.log(`Przetworzonych: ${processed}`);
  console.log(`Zapisanych/zmienionych: ${written}${dryRun ? ' (DRY RUN — nic nie zapisano)' : ''}`);
  console.log(`Bez zmian: ${unchanged}`);
  if (registryStats) console.log(`Łącznie stron statycznych /swieto/*/: ${registryStats.slugCount}`);
  if (newFuzzyMatches.length) {
    console.log('\nUWAGA: znaleziono prawdopodobne aliasy jeszcze nie wpisane do NAME_ALIASES');
    console.log('(strona NIE zostala wygenerowana jako duplikat, ale link z listy nietypowych');
    console.log('nie bedzie klikalny dopoki alias nie zostanie dopisany recznie w swieto_registry.js):');
    for (const { name, fuzzyMatch } of newFuzzyMatches) {
      console.log(`  "${name}"  ~=  "${fuzzyMatch}"`);
    }
  }
}

main();
