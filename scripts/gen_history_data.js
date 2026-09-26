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
  // pogrzeb Jana Pawla I odbyl sie 4 X 1978 (jest w 10-04.json), nie 3 X
  { file: '10-03.json', y: 1978, re: /pogrzebowe papieża Jana Pawła I/, drop: true },
  // literowka zrodla: 'wojna-polsko-rosyjska'
  { file: '10-03.json', y: 1654, re: /wojna-polsko-rosyjska/, sub: ['wojna-polsko-rosyjska', 'wojna polsko-rosyjska'] },
  // Friedrichstadt 1850: oblegaly wojska szlezwicko-holsztynskie (Prusy wycofaly sie z wojny w 1850)
  { file: '10-04.json', y: 1850, re: /Friedrichstadt/, sub: ['nad pruskimi', 'nad szlezwicko-holsztyńskimi'] },
  // Manuel II opuscil Portugalie 5 X 1910 (Ericeira), republike proklamowano 5 X - nie 4 X
  { file: '10-04.json', y: 1910, re: /Manuel II/, drop: true },
  // Dinosaur National Monument lezy na granicy Kolorado i Utah (nie Arizony ani Wyoming)
  { file: '10-04.json', y: 1915, re: /Dinosaur National Monument/, sub: ['na granicy stanów Kolorado, Arizona, Wyoming i Utah', 'na granicy stanów Kolorado i Utah'] },
  // rzezbiarz Mount Rushmore znany jako Gutzon Borglum; ok. 400 robotnikow to laczna liczba z lat 1927-1941
  { file: '10-04.json', y: 1927, re: /Borglum/, replace: 'Gutzon Borglum rozpoczął wykuwanie głów czterech prezydentów USA na górze Mount Rushmore w Dakocie Południowej; przez 14 lat prac pracowało przy nim ok. 400 robotników.' },
  // kampania na Wyspach Salomona trwala do 1945 (Bougainville); 4 X 1943 nic takiego nie nastapilo
  { file: '10-04.json', y: 1943, re: /Wyspy Salomona/, drop: true },
  // katastrofa kolejowa pod Saltillo byla 5/6 X 1972, nie 4 X
  { file: '10-04.json', y: 1972, re: /Saltillo/, drop: true },
  // Protokol madrycki to Protokol o ochronie srodowiska (cala Antarktyka rezerwatem), nie "obszar szczegolnie chroniony"
  // Zanella zostal wybrany prezydentem Fiume 5 X 1921 (jest w 10-05.json), nie 4 X
  { file: '10-04.json', y: 1921, re: /Zanella/, drop: true },
  // 5 X 1938 byla PROBNA emisja (wystep M. Fogga); pierwszy oficjalny program - 26 VIII 1939
  { file: '10-05.json', y: 1938, re: /Prudential/, replace: 'Z anteny na dachu warszawskiego wieżowca Prudential nadano pierwszą w Polsce próbną emisję programu telewizyjnego – występ Mieczysława Fogga.' },
  // 5 X 1939 komisarz Hans Drechsel wydal zarzadzenie; getto zaczelo funkcjonowac 8 X 1939
  { file: '10-05.json', y: 1939, re: /Piotrkowie Trybunalskim/, replace: 'Niemiecki komisarz Piotrkowa Trybunalskiego Hans Drechsel wydał zarządzenie o utworzeniu dzielnicy żydowskiej – 8 października zaczęło w niej funkcjonować pierwsze getto w okupowanej Polsce.' },
  // pierwsze wejscie na Kilimandzaro (Kibo) - 6 X 1889, w 40. urodziny Purtschellera
  { file: '10-05.json', y: 1889, re: /Kilimandżaro/, drop: true },
  // premiera "Dziesieciorga przykazan" - 8 XI 1956 (Criterion Theatre, Nowy Jork)
  { file: '10-05.json', y: 1956, re: /Dziesięcioro przykazań/, drop: true },
  // rekord Bolotnikowa z 5 X 1960 to 28:18,8
  { file: '10-05.json', y: 1960, re: /Bołotnikow/, sub: ['(28.12,2)', '(28:18,8)'] },
  { file: '10-05.json', y: 1961, re: /Blake’a Edwarda/, sub: ['Blake’a Edwarda', 'Blake’a Edwardsa'] },
  // rekord Kurosa pobil w 2022 r. Aleksandr Sorokin (319,6 km)
  { file: '10-05.json', y: 1997, re: /Kuros/, sub: ['aktualny do dziś rekord świata', 'ówczesny rekord świata'] },
  // pierwszy Madzlis otwarto 7 X 1906
  { file: '10-06.json', y: 1906, re: /Majlis/, drop: true },
  // Kreta ogloszila 6 X 1908 unie z Grecja (enosis), nie niepodleglosc
  { file: '10-06.json', y: 1908, re: /Kreteńskie/, replace: 'Autonomiczne Państwo Kreteńskie proklamowało zjednoczenie z Grecją (enosis), wykorzystując kryzys bośniacki.' },
  // Teixeira Gomes objal urzad prezydenta 5 X 1923 (wybrany 6 VIII)
  { file: '10-06.json', y: 1923, re: /Teixeira Gomes/, drop: true },
  // 2CV zaprezentowano na Salonie Paryskim 7 X 1948
  { file: '10-06.json', y: 1948, re: /2CV/, drop: true },
  { file: '10-06.json', y: 1965, re: /Iana Brady/, sub: ['Iana Brady', 'Ian Brady'] },
  // Weather Underground - skrajna lewica (komunistyczna), nie anarchisci
  { file: '10-06.json', y: 1969, re: /Weather Underground/, sub: ['organizację anarchistyczną Weather Underground', 'skrajnie lewicową organizację Weather Underground'] },
  // Na Klang (prow. Nong Bua Lamphu) lezy w polnocno-wschodniej Tajlandii (Isan)
  { file: '10-06.json', y: 2022, re: /Na Klang/, sub: ['w północnej Tajlandii', 'w północno-wschodniej Tajlandii'] },
  // Bund: dwa wpisy o tym samym zjezdzie zalozycielskim (7-9 X 1897); zostaje jeden, bez "miedzynarodowy"
  { file: '10-07.json', y: 1897, re: /zjazd założycielski Bundu/, drop: true },
  { file: '10-07.json', y: 1897, re: /międzynarodowy żydowski związek/, sub: ['międzynarodowy żydowski związek robotniczy Bund', 'żydowski związek robotniczy Bund (Powszechny Żydowski Związek Robotniczy na Litwie, w Polsce i Rosji)'] },
  // bitwa w zatoce Koge: 4 X 1710, nierozstrzygnieta
  { file: '10-07.json', y: 1710, re: /Køge/, drop: true },
  // Highland Park lezy w stanie Michigan (przedmiescie Detroit)
  { file: '10-07.json', y: 1913, re: /Highland Park/, sub: ['w stanie Illinois', 'w stanie Michigan'] },
  // Henry Gurney zginal w zasadzce 6 X 1951
  { file: '10-07.json', y: 1951, re: /Gurney/, drop: true },
  // patent USA 2,612,994 (7 X 1952): Norman Joseph Woodland i Bernard Silver
  { file: '10-07.json', y: 1952, re: /kod kreskowy/, replace: 'Norman Joseph Woodland i Bernard Silver otrzymali amerykański patent na kod kreskowy.' },
  // 7 X 2001 - operacja Enduring Freedom (USA i Wielka Brytania), nie NATO
  { file: '10-07.json', y: 2001, re: /Afganistanie/, replace: 'Wojska amerykańskie i brytyjskie rozpoczęły naloty na Afganistan – początek operacji „Enduring Freedom” przeciwko talibom i Al-Kaidzie.' },
  { file: '10-07.json', y: 2023, re: /Herat/, sub: ['o magnitudzie 6,3 w skali Richtera', 'o magnitudzie 6,3'] },
  { file: '10-08.json', y: 1500, re: /Brasław/, replace: 'Wielki książę litewski Aleksander Jagiellończyk nadał Brasławiowi przywilej na prawie magdeburskim.' },
  { file: '10-08.json', y: 1931, re: /wybychu/, sub: ['wybychu', 'wybuchu'] },
  // Metternich zostal ministrem spraw zagranicznych 8 X 1809, nie 1808
  { file: '10-08.json', y: 1808, re: /Metternich/, drop: true },
  // "Zagubiony Batalion" nie przelamal linii - odsiecz dotarla 7 X wieczorem, 194 zolnierzy wyszlo 8 X
  { file: '10-08.json', y: 1918, re: /Zagubionego Batalionu/, replace: 'I wojna światowa: z okrążenia w Lesie Argońskim w północno-wschodniej Francji wyszło 194 żołnierzy amerykańskiego „Zagubionego Batalionu”, do którego poprzedniego wieczoru przebiła się odsiecz.' },
  // pierwszy mecz na Rose Bowl - 28 X 1922
  { file: '10-08.json', y: 1922, re: /Rose Bowl/, drop: true },
  // Ajaccio wyzwolono 9 IX 1943
  { file: '10-08.json', y: 1943, re: /Ajaccio/, drop: true },
  // Uniwersytet Malaya zalozono 8 X 1949 w Singapurze (kampus w Kuala Lumpur od 1959)
  { file: '10-08.json', y: 1949, re: /Uniwersytet Malaya/, sub: ['z siedzibą w Kuala Lumpur', 'z siedzibą w Singapurze'] },
  // Kucan prezydentem niepodleglej Slowenii od 23 XII 1992; 8 X 1991 weszla w zycie niepodleglosc
  { file: '10-08.json', y: 1991, re: /Kučan/, replace: 'Po zakończeniu trzymiesięcznego moratorium na mocy porozumienia z Brioni weszła w życie deklaracja niepodległości Słowenii.' },
  { file: '10-08.json', y: 1997, re: /pierwszym sekretarzem Partii Pracy Korei/, sub: ['pierwszym sekretarzem', 'sekretarzem generalnym'] },
  // 8 X 2001 powolano Biuro Bezpieczenstwa Krajowego; Departament (DHS) utworzono ustawa z 25 XI 2002
  { file: '10-08.json', y: 2001, re: /Departamentu Bezpieczeństwa Krajowego/, replace: 'Prezydent USA George W. Bush powołał Biuro Bezpieczeństwa Krajowego (Office of Homeland Security) – poprzednika utworzonego w 2002 roku Departamentu Bezpieczeństwa Krajowego.' },
  { file: '10-08.json', y: 2005, re: /Kaszmirze/, sub: ['o sile 7,6 stopnia w skali Richtera', 'o magnitudzie 7,6'] },
  // Nasheed wygral druga ture 28 X 2008 (8 X - pierwsza tura)
  { file: '10-08.json', y: 2008, re: /Nasheed/, drop: true },
  // rezolucja o Pulaskim: Izba 7 X 2009, podpis prezydenta 6 XI 2009
  { file: '10-08.json', y: 2009, re: /Pułaskiemu/, drop: true },
  // 9 X to Dzien Leifa Eriksona (upamietnienie z 1825 r.), a nie data ladowania w Winlandii
  { file: '10-09.json', y: 1000, re: /Leif Eriksson/, drop: true },
  // duplikat wpisu z czesci polskiej (Kreml 1610) + literowka
  { file: '10-09.json', y: 1610, re: /chorągwie pod dowództwem hetmana/, drop: true },
  { file: '10-09.json', y: 1635, re: /Roger/, sub: ['Władze Salem w kolonii Massachusetts skazały', 'Sąd Generalny kolonii Massachusetts skazał'] },
  { file: '10-09.json', y: 1717, re: /Lleidzie/, sub: ['w holenderskiej Lleidzie', 'w katalońskiej Lleidzie'] },
  // w 1760 Berlin zajeto i obciazono kontrybucja, nie spalono
  { file: '10-09.json', y: 1760, re: /Berlin/, sub: ['zdobyły i spaliły Berlin', 'zajęły Berlin i nałożyły na miasto kontrybucję'] },
  // Hobart zalozono 21 II 1804
  { file: '10-09.json', y: 1804, re: /Hobart/, drop: true },
  // niewolnictwo w Kostaryce (Zjednoczone Prowincje Ameryki Srodkowej) zniesiono 17 IV 1824
  { file: '10-09.json', y: 1824, re: /Kostaryce/, drop: true },
  // pomnik poswiecono 21 II 1885; 9 X 1888 udostepniono go zwiedzajacym
  { file: '10-09.json', y: 1888, re: /Pomnik Waszyngtona/, replace: 'W Waszyngtonie udostępniono zwiedzającym Pomnik Waszyngtona (poświęcony w 1885 roku).' },
  // Fuad I zostal sultanem w 1917, krolem od 1922
  { file: '10-09.json', y: 1917, re: /Fu’ad I/, sub: ['został królem Egiptu i Sudanu', 'został sułtanem Egiptu (od 1922 roku król)'] },
  { file: '10-09.json', y: 1936, re: /Cinwaya/, sub: ['Jacka Cinwaya', 'Jacka Conwaya'] },
  { file: '10-04.json', y: 1991, re: /Traktatu Antarktycznego/, replace: 'W Madrycie podpisano Protokół o ochronie środowiska do Traktatu Antarktycznego, uznający Antarktykę za rezerwat przyrody przeznaczony dla pokoju i nauki.' },
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
