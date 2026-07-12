// Generuje statyczne podstrony imieniny/<slug>/index.html na podstawie
// aktualnej treści name_descriptions_rich.js + dat z imieniny.html.
//
// Tryby:
//   node scripts/gen_static_pages.js                    -> pełny przebieg (wszystkie imiona)
//   node scripts/gen_static_pages.js --dry-run           -> jw. ale bez zapisu
//   node scripts/gen_static_pages.js --only=Imie1,Imie2  -> tylko wskazane imiona
//   node scripts/gen_static_pages.js --changed-staged    -> tylko imiona, których wpis
//                                                            zmienił się w zastawionym (staged)
//                                                            diffie name_descriptions_rich.js
//                                                            (używane przez hook pre-commit)

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

// --- 1. Wczytaj NAME_DESCRIPTIONS_RICH ---
let richRaw = fs.readFileSync(path.join(ROOT, 'name_descriptions_rich.js'), 'utf8').replace(/^﻿/, '');
const richSandbox = {};
vm.createContext(richSandbox);
vm.runInContext(richRaw + '\nthis.__RESULT__ = NAME_DESCRIPTIONS_RICH;', richSandbox);
const RICH = richSandbox.__RESULT__;

// --- 2. Wczytaj tablicę NAMES wbudowaną w imieniny.html ---
const htmlRaw = fs.readFileSync(path.join(ROOT, 'imieniny.html'), 'utf8');
const namesMatch = htmlRaw.match(/const NAMES=\r?\n(\[[\s\S]*?\r?\n\]);/);
if (!namesMatch) throw new Error('Nie znaleziono tablicy NAMES w imieniny.html');
const NAMES = eval(namesMatch[1]);

// --- 3. Wczytaj NAME_DB (dane o patronach dla starszych ~300 imion) ---
const htmlLines = htmlRaw.split(/\r?\n/);
const dbStart = htmlLines.findIndex(l => l.trim() === 'const NAME_DB = {');
if (dbStart === -1) throw new Error('Nie znaleziono NAME_DB w imieniny.html');
let dbEnd = -1;
for (let i = dbStart + 1; i < htmlLines.length; i++) {
  if (htmlLines[i].trim() === '};') { dbEnd = i; break; }
}
if (dbEnd === -1) throw new Error('Nie znaleziono końca NAME_DB');
const dbSrc = htmlLines.slice(dbStart, dbEnd + 1).join('\n');
const dbSandbox = {};
vm.createContext(dbSandbox);
vm.runInContext(dbSrc + '\nthis.__DB__ = NAME_DB;', dbSandbox);
const NAME_DB = dbSandbox.__DB__;

// --- 4. Zbuduj mapę: imię -> lista dat {m,d} ---
const dateMap = {};
for (const [m, d, names] of NAMES) {
  for (const n of names) {
    (dateMap[n] = dateMap[n] || []).push({ m, d });
  }
}

function nameSlug(n) {
  return n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/[^a-z0-9-]/g, '');
}
function normalize(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
}

const MONTH_NAMES_GEN = ['', 'stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
const PATRON_HEADERS = ['Patron', 'Święty patron', 'Święta patronka', 'Święci patroni', 'Święte patronki'];

function transformRich(html) {
  return html.replace(/<h3>/g, '<div class="name-desc-label">').replace(/<\/h3>/g, '</div>');
}

// --- 5. Rozwiąż kolizje slugów: wybierz imię BEZ wiodącego "Ł", jeśli jest dokładnie jeden taki wariant ---
const bySlug = {};
for (const name of Object.keys(RICH)) {
  const slug = nameSlug(name);
  (bySlug[slug] = bySlug[slug] || []).push(name);
}
const slugOwner = {}; // slug -> wybrane imię
const collisionLog = [];
for (const [slug, names] of Object.entries(bySlug)) {
  if (names.length === 1) { slugOwner[slug] = names[0]; continue; }
  const nonL = names.filter(n => !n.startsWith('Ł'));
  if (nonL.length === 1) {
    slugOwner[slug] = nonL[0];
  } else {
    slugOwner[slug] = names.sort()[0];
  }
  collisionLog.push(`${slug}: [${names.join(', ')}] -> wybrano "${slugOwner[slug]}"`);
}

function buildPage(name) {
  const dates = (dateMap[name] || []).slice().sort((a, b) => a.m !== b.m ? a.m - b.m : a.d - b.d);
  if (!dates.length) return null;
  const rich = RICH[name];
  if (!rich) return null;

  const datesStr = dates.map(x => `${x.d} ${MONTH_NAMES_GEN[x.m]}`).join(', ');
  const freqStr = dates.length === 1 ? 'raz w roku' : `${dates.length} razy w roku`;
  const descHtml = transformRich(rich);
  const metaDesc = `${name} obchodzi imieniny ${freqStr}: ${datesStr}. Sprawdź znaczenie imienia, historię i życzenia imieninowe.`;

  const richHasPatron = PATRON_HEADERS.some(h => rich.includes('<h3>' + h + '</h3>'));
  const dbEntry = NAME_DB[normalize(name)];
  const patronBlock = (!richHasPatron && dbEntry && dbEntry.patron)
    ? `\n  <div class="patron-section">\n    <h2>Patron / Patronka</h2>\n    <p>${dbEntry.patron}</p>\n  </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Imieniny ${name} — kiedy są imieniny ${name}? | DaybyDay</title>
  <meta name="description" content="${metaDesc}">
  <link rel="canonical" href="https://daybyday.today/imieniny/${nameSlug(name)}/">
  <meta property="og:title" content="Imieniny ${name} | DaybyDay">
  <meta property="og:description" content="${metaDesc}">
  <meta property="og:url" content="https://daybyday.today/imieniny/${nameSlug(name)}/">
  <meta property="og:type" content="article">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <style>
    :root { color-scheme: light; }
    body { font-family: Georgia, serif; max-width: 680px; margin: 2rem auto; padding: 0 1rem; color: #1A1916; background: #F8F7F5; line-height: 1.7; }
    h1 { font-size: 2rem; margin-bottom: .5rem; }
    h2 { font-size: 1.2rem; font-weight: 700; margin: 1.5rem 0 .4rem; }
    .dates { font-size: 1.1rem; color: #555; margin-bottom: 1.5rem; }
    .name-desc-section { margin-bottom: 1.25rem; }
    .name-desc-label { font-size: .75rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: #888; margin-bottom: .4rem; }
    .patron-section { border-top: 1px solid #e5e3de; margin-top: 1.5rem; padding-top: 1.25rem; }
    a { color: #1A1916; }
  </style>
</head>
<body>
  <h1>Imieniny – ${name}</h1>
  <p class="dates">Imieniny ${name}: <strong>${datesStr}</strong></p>
  <div>${descHtml}</div>${patronBlock}
  <p><a href="/imieniny.html?name=${encodeURIComponent(name)}">Pełne informacje o imieniu ${name} →</a></p>
  <p><a href="/">← DaybyDay</a></p>
</body>
</html>
`;
}

// Wyciąga zbiór nazw imion (kluczy obiektu) dotkniętych przez podany fragment diffa.
// Każde imię zajmuje jedną linię w name_descriptions_rich.js, więc wystarczy
// sprawdzić linie +/- pod kątem wzorca klucza obiektu (klucz może być w '...' lub "...").
function namesFromDiff(diffText) {
  const names = new Set();
  const re = /^[+-]\s*["']([^"']+)["']:\s*['"]/;
  for (const line of diffText.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    const m = line.match(re);
    if (m) names.add(m[1]);
  }
  return [...names];
}

function getChangedStagedNames() {
  let diff;
  try {
    diff = execSync('git diff --cached -- name_descriptions_rich.js', { cwd: ROOT, encoding: 'utf8', maxBuffer: 1024 * 1024 * 50 });
  } catch (e) {
    diff = '';
  }
  return namesFromDiff(diff);
}

// --- CLI ---
function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitArg = args.find(a => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;
  const onlyArg = args.find(a => a.startsWith('--only='));
  const changedStaged = args.includes('--changed-staged');
  const quiet = args.includes('--quiet');

  let candidateNames;
  if (changedStaged) {
    candidateNames = getChangedStagedNames();
    if (!quiet) console.log(`Wykryto ${candidateNames.length} zmienione imię/imiona w zastawionym diffie: ${candidateNames.join(', ') || '(brak)'}`);
  } else if (onlyArg) {
    candidateNames = onlyArg.split('=')[1].split(',');
  } else {
    candidateNames = Object.values(slugOwner);
  }

  if (!quiet && collisionLog.length) {
    console.log('--- Kolizje slugów wykryte i rozwiązane ---');
    collisionLog.forEach(l => console.log(l));
    console.log('---');
  }

  let processed = 0, written = 0, skippedNoFolder = 0, skippedNoDates = 0, unchanged = 0, patronAdded = 0;
  const writtenPaths = [];

  for (const name of candidateNames) {
    if (processed >= limit) break;
    const slug = nameSlug(name);
    const folder = path.join(ROOT, 'imieniny', slug);
    if (!fs.existsSync(folder)) { skippedNoFolder++; continue; }
    const page = buildPage(name);
    if (!page) { skippedNoDates++; continue; }
    processed++;
    const filePath = path.join(folder, 'index.html');
    const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
    if (existing === page) { unchanged++; continue; }
    if (page.includes('patron-section')) patronAdded++;
    if (!dryRun) {
      fs.writeFileSync(filePath, page, 'utf8');
    }
    written++;
    writtenPaths.push(path.relative(ROOT, filePath));
  }

  if (!quiet) {
    console.log(`Kandydatów do przetworzenia: ${candidateNames.length}`);
    console.log(`Przetworzonych (miały folder + daty + opis): ${processed}`);
    console.log(`Zapisanych/zmienionych: ${written}${dryRun ? ' (DRY RUN — nic nie zapisano)' : ''}`);
    console.log(`  w tym z dołączonym blokiem Patron/Patronka (z NAME_DB): ${patronAdded}`);
    console.log(`Bez zmian (już aktualne): ${unchanged}`);
    console.log(`Pominiętych (brak folderu): ${skippedNoFolder}`);
    console.log(`Pominiętych (brak dat w NAMES): ${skippedNoDates}`);
  }

  // W trybie hooka: zastaw zmienione pliki, żeby trafiły do tego samego commita.
  if (changedStaged && !dryRun && writtenPaths.length) {
    execSync('git add -- ' + writtenPaths.map(p => `"${p}"`).join(' '), { cwd: ROOT });
    if (!quiet) console.log(`Zastawiono (git add) ${writtenPaths.length} zregenerowanych plików.`);
  }
}

main();
