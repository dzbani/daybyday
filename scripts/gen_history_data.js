// Generuje history-data/MM-DD.json - statyczna baza wydarzen "Ten dzien w
// historii" dla wszystkich 366 dni roku (w tym 29 lutego), zrodlo: sekcje
// "Wydarzenia w Polsce" (sekcja 2) i "Wydarzenia na swiecie" (sekcja 3)
// polskiej Wikipedii. Kazdy dzien to osobny, maly plik JSON (~12 KB srednio)
// - index.html pobiera fetch()'em tylko plik dla ogladanego dnia (fetch
// tego samego originu, nie cross-origin do Wikipedii - zero ryzyka CORS).
//
// Powod: index.html robil live fetch() do pl.wikipedia.org przy KAZDYM
// wejsciu uzytkownika na strone (funkcja loadHistory) - PageSpeed Insights
// (30.08.2026) wykryl, ze to zawodzi w jego srodowisku testowym (blokada
// CORS w headless Chrome), mimo ze u zwyklych uzytkownikow dzialalo.
// Niezaleznie od tego to architektura niespojna z reszta serwisu (wszystko
// inne to statyczne dane budowane raz przez generator) i krucha (brak
// cache'a, brak fallbacku, cichy .catch(()=>{}) przy bledzie).
//
// Pierwsza wersja tego skryptu pisala jeden plik history_data.js ze
// WSZYSTKIMI dniami naraz (~4 MB) - zaladowany na kazdej wizycie na
// index.html, mimo ze widac tylko 4 losowe wydarzenia z JEDNEGO dnia.
// Zamienione na per-dzien fetch tego samego dnia co obecnie ogladany
// (index.html wspiera przegladanie dowolnego dnia przez ?m=&d=, wiec nie
// da sie tego upiec na sztywno w jeden dzien przy buildzie).
//
// Uzycie:
//   node scripts/gen_history_data.js              (pelny przebieg, 366 dni)
//   node scripts/gen_history_data.js --limit=5     (test na pierwszych N dniach)
//   node scripts/gen_history_data.js --dry-run     (nie zapisuje plikow)

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'history-data');
const DRY = process.argv.includes('--dry-run');
const limitArg = process.argv.find(a => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;
const DELAY_MS = 200;

// Wikipedia uzywa polskich znakow w nazwach stron (np. "1_wrzesnia" nie
// istnieje, prawidlowo jest "1_września").
const MONTHS_PL_DIACRITICS = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca',
  'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const UA = 'DaybyDayHistoryBot/1.0 (https://daybyday.today; kontakt@daybyday.today) node-fetch';

function stripWiki(t) {
  return t
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/'{2,3}/g, '')
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ').trim();
}

function parseSection(wikitext) {
  return wikitext.split('\n')
    .filter(l => l.startsWith('*'))
    .map(l => {
      const m = l.match(/^\*\s*\[\[(\d{3,4})\]\]\s*[–-]\s*(.+)/);
      if (!m) return null;
      const text = stripWiki(m[2]);
      if (!text) return null;
      return { y: parseInt(m[1], 10), t: text };
    })
    .filter(Boolean);
}

async function fetchDay(pageName) {
  const base = `https://pl.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(pageName)}&prop=wikitext&format=json&origin=*`;
  const [r2, r3] = await Promise.all([
    fetch(base + '&section=2', { headers: { 'User-Agent': UA } }),
    fetch(base + '&section=3', { headers: { 'User-Agent': UA } }),
  ]);
  const [j2, j3] = await Promise.all([r2.json(), r3.json()]);
  const events = [
    ...parseSection(j2?.parse?.wikitext?.['*'] || ''),
    ...parseSection(j3?.parse?.wikitext?.['*'] || ''),
  ];
  return events;
}

function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

async function main() {
  const days = [];
  for (let m = 1; m <= 12; m++) {
    for (let d = 1; d <= DAYS_IN_MONTH[m - 1]; d++) {
      days.push({ m, d, pageName: `${d}_${MONTHS_PL_DIACRITICS[m - 1]}` });
    }
  }

  const target = days.slice(0, LIMIT);
  const emptyDays = [];
  let totalEvents = 0;

  if (!DRY) fs.mkdirSync(OUT_DIR, { recursive: true });

  for (let i = 0; i < target.length; i++) {
    const { m, d, pageName } = target[i];
    const fname = `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}.json`;
    try {
      const events = await fetchDay(pageName);
      totalEvents += events.length;
      if (events.length === 0) emptyDays.push(`${fname} (${pageName})`);
      if (!DRY) fs.writeFileSync(path.join(OUT_DIR, fname), JSON.stringify(events), 'utf8');
      process.stdout.write(`\r${i + 1}/${target.length} dni pobranych...`);
    } catch (err) {
      console.error(`\nBlad przy ${pageName}: ${err.message}`);
      emptyDays.push(`${fname} (${pageName}, BLAD: ${err.message})`);
    }
    await sleep(DELAY_MS);
  }
  process.stdout.write('\n');

  console.log(`Dni przetworzonych: ${target.length}/${days.length}`);
  console.log(`Wydarzen lacznie: ${totalEvents}`);
  console.log(`Dni bez zadnych wydarzen: ${emptyDays.length}`);
  if (emptyDays.length) console.log(emptyDays.join('\n'));
  console.log(DRY ? 'DRY RUN - nie zapisano plikow.' : `Zapisano do: ${OUT_DIR}`);
}

main();
