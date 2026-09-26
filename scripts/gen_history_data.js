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
const outArg = process.argv.find(a => a.startsWith('--out='));
const OUT_DIR = path.join(ROOT, outArg ? outArg.split('=')[1] : 'history-data');
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
  let x = t
    .replace(/<ref[^>]*\/>/gi, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
    .replace(/&nbsp;/g, ' ');
  // {{link-interwiki |Nazwa |Q=..}} -> sama nazwa; pozostale szablony usuwamy
  // (petla, bo moga byc zagniezdzone)
  x = x.replace(/\{\{\s*link-interwiki\s*\|\s*([^|}]*?)\s*(?:\|[^{}]*)?\}\}/gi, '$1');
  for (let i = 0; i < 5 && /\{\{[^{}]*\}\}/.test(x); i++) x = x.replace(/\{\{[^{}]*\}\}/g, '');
  return x
    .replace(/\[\[(?:Plik|File|Grafika):[^\]]*\]\]/gi, '')
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/'{2,3}/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/\s+/g, ' ').trim();
}

// Sekcje wikitekstu maja dwa uklady: "* [[ROK]] – tekst." oraz zagniezdzony
// "* [[ROK]]:" + "** tekst" (takze "* [[ROK]] – Wojna X:" + "** tekst").
// Pierwsza wersja parsera gubila cala druga forme i zostawiala naglowki bez
// tresci ("Wojna francusko-pruska:"), a usuwanie szablonow link-interwiki
// zostawialo wpisy bez podmiotu ("został prezydentem Gwatemali.").
const HEADING_PREFIX = [
  [/praw miejskich/i, 'Nadanie praw miejskich'],
];

function parseSection(wikitext) {
  const out = [];
  let ctx = null; // { y, prefix }
  let heading = '';
  for (const line of wikitext.split('\n')) {
    const h = line.match(/^=+\s*(.*?)\s*=+\s*$/);
    if (h) { heading = stripWiki(h[1]); ctx = null; continue; }
    const m = line.match(/^(\*+)\s*(.*)$/);
    if (!m) continue;
    const level = m[1].length;
    const body = m[2];
    if (level === 1) {
      const y = body.match(/^\[\[(\d{3,4})\]\]\s*(?::\s*|[–-]\s*(.*))?$/);
      if (!y) { ctx = null; continue; }
      const year = parseInt(y[1], 10);
      const rest = stripWiki(y[2] || '');
      if (!rest || /:$/.test(rest)) { ctx = { y: year, prefix: rest.replace(/:$/, '').trim() }; continue; }
      ctx = null;
      let t = rest;
      const hp = HEADING_PREFIX.find(([re]) => re.test(heading));
      if (hp && t.length < 80 && !/\s(w|na|z|do|się)\s/.test(t)) t = hp[1] + ': ' + t;
      out.push({ y: year, t });
    } else if (ctx && level === 2) {
      const child = stripWiki(body);
      if (!child) continue;
      out.push({ y: ctx.y, t: ctx.prefix ? ctx.prefix + ': ' + child : child });
    }
  }
  return out;
}

// Wpisy, ktorych parser nie umial poprawnie zlozyc (brak podmiotu po
// usunietym szablonie, naglowek bez tresci, urwane zdanie, niedomkniety
// nawias, resztki markupu) - lepiej pominac niz pokazac uzytkownikowi.
// Reczne poprawki wpisow z Wikipedii, ktore po weryfikacji w zrodlach okazaly sie bledne
// (generator odtwarza pliki z Wikipedii od zera, wiec poprawka w samym JSON zostalaby cofnieta).
// plik: 'MM-DD.json', y: rok, re: rozpoznanie wpisu, drop:true = usun, replace = nowy tekst.
const ENTRY_FIXES = [
  // pierwszy wezel ARPANET dostarczono do UCLA 30.08.1969, pierwsze polaczenie 29.10.1969 - nie 29 IX
  { file: '09-29.json', y: 1969, re: /ARPANET/, drop: true },
  // w 1903 Prusy wprowadzily prawo jazdy z egzaminem, ale nie jako pierwszy kraj (Nowy Jork w 1901)
  { file: '09-29.json', y: 1903, re: /pierwszym kraju na świecie/, replace: 'W Prusach wprowadzono obowiązek posiadania prawa jazdy, poprzedzony egzaminem z obsługi pojazdu.' },
  // Midway: formalne objecie w posiadanie przez kpt. Reynoldsa 28.08.1867, nie 30 IX
  { file: '09-30.json', y: 1867, re: /Midway/, drop: true },
  // druk Biblii Gutenberga trwal 1452-1455; data 30 IX 1452 opiera sie na jednym zrodle popularnym
  { file: '09-30.json', y: 1452, re: /Gutenberg/, drop: true },
  // en.wikipedia: ok. 300 utonelo, wrak na mieliznie kolo Terceiry (liczba 333 bez potwierdzenia)
  { file: '09-30.json', y: 1651, re: /Constant Reformation/, replace: 'Na mieliźnie u wybrzeży Terceiry na Azorach rozbił się angielski okręt „Constant Reformation”, w wyniku czego utonęło ok. 300 członków załogi.' },
  // uwolnienie o polnocy 30 IX/1 X 1966 (wyrok wygasl o 24:00 30 IX)
  { file: '09-30.json', y: 1966, re: /Spandau/, replace: 'O północy z 30 września na 1 października, po odbyciu 20-letnich kar pozbawienia wolności, nazistowscy zbrodniarze wojenni Baldur von Schirach i Albert Speer opuścili więzienie Spandau w Berlinie.' },
  // Jodhpur lezy w Radzasthanie, w POLNOCNO-ZACHODNICH Indiach
  { file: '09-30.json', y: 2008, re: /Dźodhpur/, replace: 'W hinduistycznej świątyni w Dźodhpurze w północno-zachodnich Indiach 249 pielgrzymów zostało zadeptanych, a ponad 400 odniosło obrażenia.' },
  // Mars 1 wystartowal 1 LISTOPADA 1962 (nie 1 X)
  { file: '10-01.json', y: 1962, re: /Mars 1/, drop: true },
  // w 1806 krolem Prus byl Fryderyk Wilhelm III (II zmarl w 1797); sub = podmiana fragmentu
  { file: '10-01.json', y: 1806, re: /Fryderyk Wilhelm II /, sub: ['Fryderyk Wilhelm II ', 'Fryderyk Wilhelm III '] },
  // Radio Slowackie: pierwsza transmisja 3.08.1926, regularna emisja od 1.10.1926 - nie 2 X
  { file: '10-02.json', y: 1926, re: /Radio Słowackie/, drop: true },
  // BEA: pierwsza na swiecie regularna linia helikopterowa Cardiff-Wrexham-Liverpool ruszyla 1.06.1950, nie 2.10.1951
  { file: '10-02.json', y: 1951, re: /British European Airways/, drop: true },
  // brak potwierdzenia w zrodlach (rzekoma katastrofa Iła-76 Iraqi Airways w Kuwejcie 2.10.1990)
  { file: '10-02.json', y: 1990, re: /Iła-76/, drop: true },
  // UTA 1964 (Alcazaba k. Granady) to Douglas DC-6B, nie DC-8
  { file: '10-02.json', y: 1964, re: /DC-8/, sub: ['DC-8', 'DC-6'] },
];
function applyEntryFixes(file, events) {
  return events
    .map(e => {
      const fx = ENTRY_FIXES.find(f => f.file === file && f.y === e.y && f.re.test(e.t));
      if (!fx) return e;
      if (fx.drop) return null;
      return { ...e, t: fx.sub ? e.t.replace(fx.sub[0], fx.sub[1]) : fx.replace };
    })
    .filter(Boolean);
}

function isBroken(t) {
  if (/^[a-ząćęłńóśźż]/.test(t)) return true;
  if (/[:,;]\s*\.?$/.test(t)) return true;
  if (/\[\[|\]\]|\{\{|\}\}/.test(t)) return true;
  if ((t.match(/\(/g) || []).length !== (t.match(/\)/g) || []).length) return true;
  return false;
}

async function fetchDay(pageName, file) {
  const base = `https://pl.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(pageName)}&prop=wikitext&format=json&origin=*`;
  const [r2, r3] = await Promise.all([
    fetch(base + '&section=2', { headers: { 'User-Agent': UA } }),
    fetch(base + '&section=3', { headers: { 'User-Agent': UA } }),
  ]);
  const [j2, j3] = await Promise.all([r2.json(), r3.json()]);
  const events = [
    ...parseSection(j2?.parse?.wikitext?.['*'] || ''),
    ...parseSection(j3?.parse?.wikitext?.['*'] || ''),
  ].filter((e, i, arr) => arr.findIndex(x => x.y === e.y && x.t === e.t) === i)
   .filter(e => !isBroken(e.t))
   // wpisy Wikipedii bez kropki na koncu (np. "Zakonczenie powstania w Bulgarii") - dopisz
   .map(e => (/[.!?”"’)»…]$/.test(e.t) ? e : { ...e, t: e.t + "." }));
  return applyEntryFixes(file, events);
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
      const events = await fetchDay(pageName, fname);
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
