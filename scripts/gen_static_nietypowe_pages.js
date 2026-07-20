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
const { regenerateRegistry } = require('./swieto_registry');

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

// --- Wczytaj HOLIDAYS (nietypowe) ze swieta-nietypowe.html ---
function loadNietypoweHolidays() {
  const raw = fs.readFileSync(path.join(ROOT, 'swieta-nietypowe.html'), 'utf8');
  const start = raw.indexOf('const HOLIDAYS = [');
  if (start === -1) throw new Error('Nie znaleziono HOLIDAYS w swieta-nietypowe.html');
  const end = raw.indexOf('\r\n];', start);
  const src = raw.slice(start, end + 3);
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(src + '\nthis.__H__ = HOLIDAYS;', sandbox);
  return sandbox.__H__;
}

// --- Wczytaj HOLIDAYS_DB (juz awansowane) ze swieto.html, zeby wykluczyc duplikaty ---
function loadPromotedNames() {
  const raw = fs.readFileSync(path.join(ROOT, 'swieto.html'), 'utf8');
  const start = raw.indexOf('const HOLIDAYS_DB = {');
  const end = raw.indexOf('\r\n};', start);
  const src = raw.slice(start, end + 3);
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(src + '\nthis.__DB__ = HOLIDAYS_DB;', sandbox);
  const names = new Set();
  for (const h of Object.values(sandbox.__DB__)) names.add(h.name);
  return names;
}

// znane aliasy — ta sama realna okazja pod inna nazwa w bazie nietypowych,
// juz opisana pod inna nazwa w warstwie bogatej (patrz swieto_registry.js NAME_ALIASES)
const KNOWN_ALIAS_NAMES = new Set([
  'Międzynarodowy Dzień Sprzeciwu Wobec Tam',
  'Dzień Diagnosty Laboratoryjnego',
  'Dzień Farmaceuty',
  'Dzień Maszynisty',
  'Dzień Nauki Polskiej',
  'Dzień Praw Człowieka',
  'Dzień Sapera',
  'Dzień Tolerancji',
]);

function buildLightPage(slug, entry) {
  const [d, m, name, desc, tag] = entry;
  const dateStr = `${d} ${MONTH_NAMES_PL[m - 1]}`;
  const metaDesc = (desc || `${name} — ${dateStr}.`).replace(/<[^>]+>/g, '').slice(0, 300);
  const tagLabel = TAG_LABELS[tag] || tag || '';

  return `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(name)} — DaybyDay</title>
  <meta name="description" content="${esc(metaDesc)}">
  <link rel="canonical" href="https://daybyday.today/swieto/${slug}/">
  <meta property="og:title" content="${esc(name)} | DaybyDay">
  <meta property="og:description" content="${esc(metaDesc)}">
  <meta property="og:url" content="https://daybyday.today/swieto/${slug}/">
  <meta property="og:type" content="article">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <style>
    :root { color-scheme: light; }
    body { font-family: Georgia, serif; max-width: 680px; margin: 2rem auto; padding: 0 1rem; color: #1A1916; background: #F8F7F5; line-height: 1.7; }
    h1 { font-size: 2rem; margin-bottom: .25rem; }
    .date { font-size: 1.1rem; color: #555; margin-bottom: 1.5rem; }
    .tag { display: inline-block; font-size: .75rem; text-transform: uppercase; letter-spacing: .08em; color: #888; border: 1px solid #ddd; border-radius: 999px; padding: .2rem .7rem; margin-bottom: 1.5rem; }
    a { color: #1A1916; }
  </style>
</head>
<body>
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
  const promotedNames = loadPromotedNames();

  const usedSlugs = new Set();
  // juz istniejace foldery (np. wygenerowane wczesniej przez ten sam skrypt lub bogaty generator)
  for (const entry of fs.readdirSync(path.join(ROOT, 'swieto'), { withFileTypes: true })) {
    if (entry.isDirectory()) usedSlugs.add(entry.name);
  }

  let written = 0, unchanged = 0, skippedPromoted = 0, skippedAlias = 0, processed = 0;

  for (const entry of HOLIDAYS) {
    const name = entry[2];
    if (promotedNames.has(name)) { skippedPromoted++; continue; }
    if (KNOWN_ALIAS_NAMES.has(name)) { skippedAlias++; continue; }
    if (processed >= limit) break;
    processed++;

    let slug = slugify(name);
    if (usedSlugs.has(slug)) {
      // sprawdz czy istniejacy plik pod tym slugiem opisuje TEN SAM wpis (np. ponowne
      // uruchomienie skryptu po czesciowym poprzednim przebiegu) — jesli tak, to nie
      // kolizja, tylko regeneracja tej samej strony, zostaw slug bez zmian.
      const existingPath = path.join(ROOT, 'swieto', slug, 'index.html');
      const existingTitle = fs.existsSync(existingPath)
        ? (fs.readFileSync(existingPath, 'utf8').match(/<title>([\s\S]*?) — DaybyDay<\/title>/) || [])[1]
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

  console.log(`Kandydatów (nie-awansowanych): ${HOLIDAYS.length - skippedPromoted - skippedAlias}`);
  console.log(`Pominiętych (już awansowane do HOLIDAYS_DB): ${skippedPromoted}`);
  console.log(`Pominiętych (znany alias tego samego wydarzenia): ${skippedAlias}`);
  console.log(`Przetworzonych: ${processed}`);
  console.log(`Zapisanych/zmienionych: ${written}${dryRun ? ' (DRY RUN — nic nie zapisano)' : ''}`);
  console.log(`Bez zmian: ${unchanged}`);
  if (registryStats) console.log(`Łącznie stron statycznych /swieto/*/: ${registryStats.slugCount}`);
}

main();
