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
  // West Tennessee State Normal School (dzis Uniwersytet Memphis) otwarto 10 IX 1912
  { file: '10-10.json', y: 1912, re: /Uniwersytet Memphis/, drop: true },
  // strefa A plebiscytu: 22 025 glosow = 59,04% za Austria
  { file: '10-10.json', y: 1920, re: /Karyntii/, sub: ['59,14%', '59,04%'] },
  // Krolestwo Kurdystanu istnialo od IX 1922; 10 X 1921 - jedynie deklaracja o rzadzie kurdyjskim
  { file: '10-10.json', y: 1921, re: /Królestwo Kurdystanu/, drop: true },
  // Czang Kaj-szek zostal przewodniczacym Rzadu Narodowego pierwszy raz 10 X 1928 (drugi raz 1943)
  { file: '10-10.json', y: 1928, re: /Czang Kaj-szek/, sub: ['został po raz drugi przewodniczącym', 'został przewodniczącym'] },
  { file: '10-10.json', y: 1943, re: /ochraniananych/, sub: ['ochraniananych', 'ochranianych'] },
  // porozumienie procentowe - noc 9 X 1944; dotyczylo Rumunii, Grecji, Jugoslawii, Wegier i Bulgarii, nie Polski
  { file: '10-10.json', y: 1944, re: /Stalin i Winston Churchill/, drop: true },
  { file: '10-10.json', y: 1956, re: /ziszczeniu/, sub: ['ziszczeniu', 'zniszczeniu'] },
  { file: '10-10.json', y: 1970, re: /Laporte/, sub: ['Kanadyjski wicepremier Pierre Laporte', 'Wicepremier prowincji Quebec Pierre Laporte'] },
  // traktat o EurAsEC podpisano w Astanie
  { file: '10-10.json', y: 2000, re: /Euroazjatycką Wspólnotę/, sub: ['W stolicy Kirgistanu Biszkeku założono', 'W Astanie, stolicy Kazachstanu, założono'] },
  // Google oglosil zakup YouTube 9 X 2006
  { file: '10-10.json', y: 2006, re: /YouTube/, drop: true },
  // Antyle Holenderskie rozwiazano: Curacao i Sint Maarten - kraje autonomiczne, 3 wyspy - gminy specjalne Holandii
  { file: '10-10.json', y: 2010, re: /Antyle Holenderskie/, replace: 'Rozwiązano Antyle Holenderskie: Curaçao i Sint Maarten stały się krajami autonomicznymi w składzie Królestwa Niderlandów, a Bonaire, Sint Eustatius i Saba – gminami specjalnymi Holandii.' },
  // masakra przed gmachem Maspero w Kairze - 9 X 2011
  { file: '10-10.json', y: 2011, re: /Koptów w Kairze/, drop: true },
  // gierkowke oficjalnie otwarto 11 X 1976 w Czestochowie (jest w 10-11.json)
  { file: '10-08.json', y: 1976, re: /gierkówkę/, drop: true },
  // PZLA nie byl pierwszym polskim stowarzyszeniem sportowym (Sokol 1867 i in.)
  { file: '10-11.json', y: 1919, re: /Lekkiej Atletyki/, replace: 'Założono Polski Związek Lekkiej Atletyki.' },
  // w 1865 niewolnictwo na Jamajce nie istnialo (zniesione 1834/1838) - powstanie czarnych chlopow
  { file: '10-11.json', y: 1865, re: /Morant Bay/, sub: ['wybuchło powstanie niewolników', 'wybuchło powstanie czarnoskórych chłopów przeciwko brytyjskim władzom kolonialnym'] },
  { file: '10-11.json', y: 1917, re: /operacja operacja/, sub: ['operacja operacja', 'operacja'] },
  // sprawstwo saudyjskie w zabojstwie al-Hamdiego jest domniemane, nie ustalone
  { file: '10-11.json', y: 1977, re: /al-Hamdi/, replace: 'W Sanie został zamordowany prezydent Jemenu Północnego Ibrahim al-Hamdi.' },
  // Abd Allah an-Nusur zostal premierem Jordanii 10 X 2012, nie 11 X 2011
  { file: '10-11.json', y: 2011, re: /an-Nusur/, drop: true },
  { file: '10-04.json', y: 1991, re: /Traktatu Antarktycznego/, replace: 'W Madrycie podpisano Protokół o ochronie środowiska do Traktatu Antarktycznego, uznający Antarktykę za rezerwat przyrody przeznaczony dla pokoju i nauki.' },

  // ===== audyt 16-31 X (16.10.2026): wpisy z blednym dniem, rokiem lub trescia =====
  // --- 16 X ---
  // Badajoz 1705: oblezenie 4-17 X zakonczylo sie porazka aliantow (Galway stracil reke), miasta nie zdobyto
  { file: '10-16.json', y: 1705, re: /Badajoz/, drop: true },
  // spalenie Falmouth (dzis Portland, Maine): 18 X 1775 (jest w 10-18 lub poza lista), nie 16 X
  { file: '10-16.json', y: 1775, re: /Portland/, drop: true },
  // San Marino w Radzie Europy: 16 XI 1988 (strona CoE), nie 16 X
  { file: '10-16.json', y: 1988, re: /San Marino/, drop: true },
  // slub Franco z Carmen Polo: zrodla rozbiezne (16 X wg EFE, 22 X wg wiekszosci), dnia nie da sie ustalic
  { file: '10-16.json', y: 1923, re: /Franco/, drop: true },
  // 21 postulatow: wpis na liste Pamiec Swiata UNESCO w 2003 (nie Swiatowa Lista Dziedzictwa); dnia brak
  { file: '10-16.json', y: 2003, re: /21 postulatów/, drop: true },
  // trzesienie ziemi 1737: 16 X wg UTC (17 X czasu lokalnego), magnituda szacowana 9,0-9,3
  { file: '10-16.json', y: 1737, re: /Kamczatkę/, replace: 'Kamczatkę nawiedziło trzęsienie ziemi (16 października według czasu UTC) o szacowanej magnitudzie 9,0–9,3, które wywołało falę tsunami.' },
  // Legitime: 16 X 1888 objal wladze wykonawcza, formalnie prezydentem zostal 16 XII 1888
  { file: '10-16.json', y: 1888, re: /Légitime/, replace: 'François Denys Légitime objął władzę na Haiti jako szef władzy wykonawczej (formalnie prezydentem został 16 grudnia 1888).' },
  // --- 17 X ---
  // Anna Iwanowna zmarla 17 X wg starego stylu = 28 X wg kalendarza gregorianskiego
  { file: '10-17.json', y: 1740, re: /Anny Iwanowny/, drop: true },
  // 17 X 1781 Cornwallis poprosil o rozejm; kapitulacja i zajecie Yorktown 19 X (jest w 10-19)
  { file: '10-17.json', y: 1781, re: /zdobyły Yorktown/, replace: 'Wojna o niepodległość Stanów Zjednoczonych: pod Yorktown gen. Charles Cornwallis zwrócił się do Waszyngtona o rozejm i rozpoczęcie rokowań w sprawie kapitulacji.' },
  // Curacao: Brytyjczycy przejeli wyspe we wrzesniu 1800 (kapitulacja gubernatora 10 IX)
  { file: '10-17.json', y: 1800, re: /Curaçao/, drop: true },
  // film Hepwortha z 1903: data premiery sporna (maj lub 17 X), nie ma zrodla premiery
  { file: '10-17.json', y: 1903, re: /Alicja w Krainie Czarów/, drop: true },
  { file: '10-17.json', y: 1980, re: /Watykanie/, replace: 'Królowa Elżbieta II jako pierwszy brytyjski monarcha złożyła oficjalną wizytę w Watykanie, gdzie przyjął ją papież Jan Paweł II.' },
  { file: '10-17.json', y: 1994, re: /wizytą do Rosji/, replace: 'Królowa Elżbieta II przybyła z oficjalną wizytą do Rosji.' },
  // --- 18 X ---
  // Kanal Elblaski: pierwsza lopate wbito 28 X 1844 w Milomlynie (jest w 10-28)
  { file: '10-18.json', y: 1844, re: /Kanału Elbląskiego/, drop: true },
  // bitwa pod Ashingdon: dowodzil Edmund II Zelaznoboki, nie Edward II
  { file: '10-18.json', y: 1016, re: /Ashingdon/, sub: ['królem Edwarda II', 'królem Edmunda II Żelaznobokiego'] },
  // wpis urwany w Wikipedii ("Car Mikolaj I Romanow wydal.")
  { file: '10-18.json', y: 1831, re: /wydał\.$/, drop: true },
  // oblezenie Stralsundu 1715 przez wojska duńsko-pruskie-saskie: lipiec 1715, nie 18 X
  { file: '10-18.json', y: 1715, re: /Stralsund/, drop: true },
  // Suczawa 1497: dokladnego dnia zwiniecia oblezenia nie da sie potwierdzic
  { file: '10-18.json', y: 1497, re: /Suczawy/, drop: true },
  // --- 19 X ---
  // linia Wroclaw-Legnica otwarta 18 X 1844 (pierwszy pociag), wpis jest w 10-18
  { file: '10-19.json', y: 1844, re: /Wrocławiem a Legnicą/, drop: true },
  // Tymczasowy Rzad Narodowy Wegier w Debreczynie: 22 XII 1944
  { file: '10-19.json', y: 1944, re: /Debreczynie/, drop: true },
  // pierwszy chinski test jadrowy: 16 X 1964 (jest w 10-16)
  { file: '10-19.json', y: 1964, re: /Chiny przeprowadziły próbny wybuch jądrowy/, drop: true },
  // Czarny poniedzialek: tylko spadek Dow Jones (22,6%) dotyczy tego dnia; reszta liczb to straty z kolejnych dni
  { file: '10-19.json', y: 1987, re: /Czarny poniedziałek/, replace: 'Czarny poniedziałek na światowych giełdach: indeks Dow Jones spadł o ponad 22%, a w kolejnych dniach załamały się także giełdy w Europie i Azji.' },
  // "mumia perskiej ksiezniczki" znaleziona 19 X 2000 okazala sie falszerstwem
  { file: '10-19.json', y: 2000, re: /mumia księżniczki perskiej/, replace: 'W pakistańskiej prowincji Beludżystan znaleziono mumię, uznawaną początkowo za księżniczkę perską sprzed 2600 lat; później okazało się, że jest to fałszerstwo, a zwłoki pochodzą z lat 90. XX wieku.' },
  // wytyczne ERC 2010 opublikowano 18 X 2010
  { file: '10-19.json', y: 2010, re: /Europejska Rada Resuscytacji/, drop: true },
  // --- 20 X ---
  { file: '10-20.json', y: 1921, re: /Rada Ambasadorów Ligi Narodów/, sub: ['Rada Ambasadorów Ligi Narodów', 'Rada Ambasadorów'] },
  // Boyarska Duma "Morskim sudam byt": 20 X wg starego stylu = 30 X wg kalendarza gregorianskiego
  { file: '10-20.json', y: 1696, re: /Rosyjskiej Marynarki Wojennej/, drop: true },
  // Rackham zlapany 22 X 1720
  { file: '10-20.json', y: 1720, re: /Calico Jack/, drop: true },
  // Nowa Granada: ogloszona 21 XI 1831 (ustawa 17 XI)
  { file: '10-20.json', y: 1831, re: /Republikę Nowej Granady/, drop: true },
  // Vegkop: Wikipedia podaje 16 X, czesc zrodel 20 X
  { file: '10-20.json', y: 1836, re: /Vegkop/, sub: ['w bitwie pod Vegkop', 'w bitwie pod Vegkop (według części źródeł 16 października)'] },
  // --- 21 X ---
  { file: '10-21.json', y: 1797, re: /USS „Constitution”/, replace: 'Zwodowano USS „Constitution”, najstarszy obecnie pływający okręt na świecie.' },
  { file: '10-21.json', y: 1879, re: /Edison/, sub: ['grafitowym żarnikiem', 'węglowym żarnikiem'] },
  // cieśniny zamknieto 27 IX 1914
  { file: '10-21.json', y: 1914, re: /Bosfor i Dardanele/, drop: true },
  // GRU: rozkaz z 5 XI 1918
  { file: '10-21.json', y: 1918, re: /Główny Zarząd Wywiadowczy/, drop: true },
  // pierwszy numer Rude pravo: 21 IX 1920
  { file: '10-21.json', y: 1920, re: /Rudé právo/, drop: true },
  // aresztowanie Ireny Sendlerowej: 20 X 1943 wg wiekszosci zrodel
  { file: '10-21.json', y: 1943, re: /Sendlerowa/, drop: true },
  // katastrofa samolotu de Margerie: 20 X 2014 ok. 23:58 czasu moskiewskiego
  { file: '10-21.json', y: 2014, re: /de Margerie/, drop: true },
  // --- 22 X ---
  // Piotr I przyjal tytul imperatora 22 X wg starego stylu = 2 XI wg kalendarza gregorianskiego
  { file: '10-22.json', y: 1721, re: /Imperatora Wszechrosji/, drop: true },
  // Dlugi Marsz: daty zakonczenia rozbiezne (19/26 X 1935 Wuqi; 22 X 1936 polaczenie armii)
  { file: '10-22.json', y: 1935, re: /Długi Marsz/, drop: true },
  { file: '10-22.json', y: 1962, re: /blokadę morską Kuby/, sub: ['wprowadził blokadę morską Kuby', 'ogłosił blokadę morską Kuby'] },
  // komitet flagowy Kanady: zrodla podaja 22 lub 29 X; liczba 2600 niepotwierdzona
  { file: '10-22.json', y: 1964, re: /flagi Kanady/, drop: true },
  // --- 23 X ---
  // Mezokeresztes: bitwa trwala 24-26 X 1596
  { file: '10-23.json', y: 1596, re: /Mezőkeresztes/, drop: true },
  // traktat w Addis Abebie: 26 X 1896
  { file: '10-23.json', y: 1896, re: /Addis Abebie/, drop: true },
  // rekord Agello: 23 X 1934
  { file: '10-23.json', y: 1933, re: /Agello|Angello/, toYear: 1934 },
  // Mindszenty wyjechal z Wegier 28 IX 1971
  { file: '10-23.json', y: 1971, re: /Mindszenty/, drop: true },
  // Liechtenstein w Radzie Europy: 23 XI 1978
  { file: '10-23.json', y: 1978, re: /Liechtenstein/, drop: true },
  { file: '10-23.json', y: 1983, re: /Bejrucie eksplodowały/, replace: 'W Bejrucie eksplodowały dwie ciężarówki wypełnione trotylem, w wyniku czego zginęło 241 żołnierzy amerykańskich i 58 francuskich.' },
  // Bokassa wrocil do Bangui 24 X 1986
  { file: '10-23.json', y: 1986, re: /Bokassa/, drop: true },
  // ustawa o ambasadzie w Jerozolimie: Kongres uchwalil 24 X 1995 (jest w 10-24)
  { file: '10-23.json', y: 1995, re: /uznały Jerozolimę/, drop: true },
  // list JP II o ewolucji: przemowienie do Papieskiej Akademii Nauk 22 X 1996
  { file: '10-23.json', y: 1996, re: /teoria ewolucji/, drop: true },
  // Bobi zmarl 20 X 2023, a rekord GWR cofnieto w 2024
  { file: '10-23.json', y: 2023, re: /Bobi/, drop: true },
  // Mesovouno: ofiar od 142 do ok. 157 wg roznych zrodel
  { file: '10-23.json', y: 1941, re: /Mesovouno/, sub: ['(142 lub 165)', '(według różnych źródeł od 142 do ok. 157)'] },
  // --- 24 X ---
  // Cafe Club: data i sprawca nie do potwierdzenia (24 X 1942 akcja GL dotyczyla Mitropy)
  { file: '10-24.json', y: 1942, re: /Café Club/, drop: true },
  // Dubno: egzekucje 26 V, w sierpniu i 5 X 1942
  { file: '10-24.json', y: 1942, re: /Dubnie/, drop: true },
  // Batalion Dabrowskiego: data formowania niepewna (14 lub 22 X 1936)
  { file: '10-24.json', y: 1936, re: /Batalion im\. Jarosława Dąbrowskiego/, drop: true },
  // 24 X 1938 Ribbentrop rozmawial z ambasadorem Lipskim w Berchtesgaden (nie z Beckiem w Berlinie)
  { file: '10-24.json', y: 1938, re: /Ribbentrop/, replace: 'Podczas rozmowy w Berchtesgaden Joachim von Ribbentrop przedstawił ambasadorowi Polski Józefowi Lipskiemu niemieckie żądania: włączenia Wolnego Miasta Gdańska do Rzeszy oraz budowy eksterytorialnej autostrady i linii kolejowej przez polskie Pomorze.' },
  { file: '10-24.json', y: 1940, re: /Corpo Aereo Italiano/, sub: ['po raz wzięło', 'po raz pierwszy wzięło'] },
  // Fort Pulaski: pomnik narodowy 15 X 1924
  { file: '10-24.json', y: 1924, re: /Fort Pulaski/, drop: true },
  { file: '10-24.json', y: 2014, re: /Eustace/, sub: ['(41, 425 km)', '(41,425 km)'] },
  // --- 25 X ---
  // oblezenie Lwowa 1655: wojska kozacko-moskiewskie zblizyly sie pod koniec wrzesnia
  { file: '10-25.json', y: 1655, re: /Lwowa/, drop: true },
  // traktat w Saint-Germain-en-Laye: 29 VI 1679
  { file: '10-25.json', y: 1679, re: /Saint-Germain-en-Laye/, drop: true },
  // bitwa pod Chateauguay: 26 X 1813
  { file: '10-25.json', y: 1813, re: /Châteauguay/, drop: true },
  // Volkssturm: dekret z 25 IX 1944 (jest w 09-25)
  { file: '10-25.json', y: 1944, re: /Volkssturm/, drop: true },
  // Macedonian: 104 to zabici i ranni lacznie (36 zabitych, 68 rannych)
  { file: '10-25.json', y: 1812, re: /Macedonian/, sub: ['zginęło 104 marynarzy', 'zginęło lub zostało rannych 104 marynarzy'] },
  // Tak Bai: 25 X 2004
  { file: '10-25.json', y: 2005, re: /Tak Bai/, toYear: 2004 },
  // --- 26 X ---
  // Polenaktion: 27-29 X 1938
  { file: '10-26.json', y: 1938, re: /Polenaktion/, drop: true },
  // Co sie zdarzylo Baby Jane?: premiera 31 X 1962
  { file: '10-26.json', y: 1962, re: /Baby Jane/, drop: true },
  // trzeci proces majdanecki: rozpoczal sie 26 XI 1975
  { file: '10-26.json', y: 1975, re: /Majdanka/, drop: true },
  // --- 27 X ---
  // Francuska Afryka Zachodnia utworzona 16 VI 1895
  { file: '10-27.json', y: 1895, re: /Francuską Afrykę Zachodnią/, drop: true },
  // drugie weto de Gaulle'a: 27 XI 1967
  { file: '10-27.json', y: 1967, re: /zawetowała brytyjski wniosek/, drop: true },
  // Reagan 27 X 1988 zalecil rozbiorke (decyzja nalezala do Kongresu)
  { file: '10-27.json', y: 1988, re: /ambasady w Moskwie/, replace: 'Prezydent USA Ronald Reagan zalecił rozebranie nowo wybudowanego budynku ambasady w Moskwie z powodu wykrycia w nim aparatury podsłuchowej.' },
  // operacja NATO Allied Provider rozpoczela sie 24 X 2008
  { file: '10-27.json', y: 2008, re: /piratom somalijskim/, drop: true },
  // --- 28 X ---
  // Dodekanez: przekazanie administracji 31 III 1947, wlaczenie do Grecji 7 III 1948
  { file: '10-28.json', y: 1947, re: /Dodekanez/, drop: true },
  // Ortega wygral wybory 4 XI 1984, urzad objal 10 I 1985
  { file: '10-28.json', y: 1985, re: /Daniel Ortega/, drop: true },
  // --- 29 X ---
  // proces zamachowcow z Sarajewa rozpoczal sie 12 X 1914 (jest w 10-12)
  { file: '10-29.json', y: 1914, re: /proces zamachowców z Sarajewa/, drop: true },
  // Syria opuscila ZRA po zamachu stanu 28 IX 1961 (jest w 09-28)
  { file: '10-29.json', y: 1961, re: /Syria wystąpiła/, drop: true },
  // Itaewon: oficjalnie 159 zmarlych, pozniej 160; pierwsze doniesienia 156
  { file: '10-29.json', y: 2022, re: /Halloween w Seulu/, replace: 'W wyniku wybuchu paniki i zatłoczenia podczas obchodów Halloween w dzielnicy Itaewon w Seulu zginęło ponad 150 osób, a blisko 200 zostało rannych.' },
  // --- 30 X ---
  // USS Reuben James zatonal 31 X 1941
  { file: '10-30.json', y: 1941, re: /Reuben James/, drop: true },
  // Most Bosforski otwarto 29 X 1973
  { file: '10-30.json', y: 1973, re: /Most Bosforski/, drop: true },
  // Smierc na Nilu: premiera USA 29 IX, Londyn 23 X 1978
  { file: '10-30.json', y: 1978, re: /Śmierć na Nilu/, drop: true },
  // wybory w Hiszpanii: 29 X 1989
  { file: '10-30.json', y: 1989, re: /Felipe Gonzáleza/, drop: true },
  // --- 31 X ---
  // metro w Madrycie otwarto 17 X 1919 (jest w 10-17)
  { file: '10-31.json', y: 1919, re: /madryckiego metra/, drop: true },

  // ===== audyt 12-15 X (16.10.2026) =====
  // Stalowa Wola: brak daty zalozenia (osada budowana 1937-39, prawa miejskie 1945)
  { file: '10-12.json', y: 1938, re: /Stalowa Wola/, drop: true },
  // Old Byland: 14 X 1322
  { file: '10-12.json', y: 1322, re: /Old Byland/, drop: true },
  // Maclodio: 11 X 1427 wg wiekszosci zrodel
  { file: '10-12.json', y: 1427, re: /Maclodio/, drop: true },
  // Dniepropetrowsk: glowne egzekucje 13-14 X 1941; liczba ocalalych niepotwierdzona
  { file: '10-12.json', y: 1941, re: /Dniepropetrowsku/, replace: 'W ukraińskim Dniepropetrowsku (obecnie Dniepr) Niemcy rozpoczęli masowe mordy miejscowych Żydów (według części źródeł 12 października; główne egzekucje przeprowadzono 13–14 października).' },
  // synagoga w Zagrzebiu: rozbiorka od pazdziernika 1941 do wiosny 1942, dnia 12 X nie potwierdzono
  { file: '10-12.json', y: 1941, re: /Zagrzebska synagoga/, drop: true },
  // tajfun Megi: formal sie 12 X, uderzyl w Filipiny 18 X 2010
  { file: '10-12.json', y: 2010, re: /Megi/, drop: true },
  // wpis urwany w Wikipedii
  { file: '10-13.json', y: 1770, re: /Konfederacja barska uchwaliła\.$/, drop: true },
  // Pirna: kapitulacja Sasow 14-16 X 1756
  { file: '10-13.json', y: 1756, re: /Pirna/, drop: true },
  // Botswana i Lesotho przyjete do ONZ 17 X 1966 (jest w 10-17 lub poza lista)
  { file: '10-13.json', y: 1966, re: /Botswana/, drop: true },
  // traktat z Karsu podpisano 13 X 1921 (jest w 10-13)
  { file: '10-23.json', y: 1921, re: /traktat karski/, drop: true },
  // Ragusa: Marmont zlikwidowal republike w 1808
  { file: '10-14.json', y: 1809, re: /Raguzie/, drop: true },
  // Fuengirola: bitwa 15 X 1810 (14 X tylko ladowanie); wpis zostaje w 10-15
  { file: '10-14.json', y: 1810, re: /Fuengirol/, drop: true },
  // pierwszy lot 14 X 1964 dotyczy CH-53 Sea Stallion, nie wersji E (1974)
  { file: '10-14.json', y: 1964, re: /CH-53E/, replace: 'Dokonano oblotu amerykańskiego ciężkiego śmigłowca transportowego Sikorsky CH-53 Sea Stallion.' },
  // Struktura krysztalu: premiera 14 X 1969
  { file: '10-14.json', y: 1968, re: /Struktura kryształu/, toYear: 1969 },
  // Maria Antonina skazana w nocy 16 X 1793 (egzekucja tego samego dnia)
  { file: '10-15.json', y: 1793, re: /Maria Antonina/, drop: true },
  // krolem Saksonii zostal Fryderyk August III
  { file: '10-15.json', y: 1904, re: /Fryderyk August II/, sub: ['Fryderyk August II ', 'Fryderyk August III '] },
  // 15 X 2007 dostarczono pierwszy A380; komercyjne loty od 25 X (wpis jest w 10-25)
  { file: '10-15.json', y: 2007, re: /A380/, replace: 'Linie Singapore Airlines odebrały pierwszy egzemplarz największego samolotu pasażerskiego świata, Airbusa A380.' },
  // wystapienie Niemiec z Ligi Narodow oglosono 14 X 1933 (jest w 10-14)
  { file: '10-21.json', y: 1933, re: /Niemcy wystąpiły z Ligi Narodów/, drop: true },

  // ===== audyt 1-11 XI (16.10.2026) =====
  // --- 1 XI ---
  // IV sobor laterański rozpoczął się 11 XI 1215 (jest w 11-11)
  { file: '11-01.json', y: 1215, re: /Sobór laterański/, drop: true },
  // wpis zepsuty (placeholder Wikidata zamiast nazwy)
  { file: '11-01.json', y: 1304, re: /^Q=Q/, drop: true },
  // Mehmed VI zostal obalony przez Wielkie Zgromadzenie Narodowe (zniesienie sultanatu), wyjechal 17 XI
  { file: '11-01.json', y: 1922, re: /Mehmed VI/, replace: 'Wielkie Zgromadzenie Narodowe Turcji zniosło sułtanat, kończąc panowanie Mehmeda VI, ostatniego sułtana Imperium Osmańskiego.' },
  // statek Kiangya zatonal 3-4 XII 1948; wpis o 6 tys. osob bez potwierdzenia
  { file: '11-01.json', y: 1948, re: /statek z około 6 tys/, drop: true },
  // wybory do Knesetu odbyly sie 2 XI 1965
  { file: '11-01.json', y: 1965, re: /Koalicja Pracy wygrała wybory/, drop: true },
  // Stoph zostal premierem NRD 29 X 1976
  { file: '11-01.json', y: 1976, re: /Willi Stoph/, drop: true },
  // --- 2 XI ---
  // Wystawa Panamerykanska w Buffalo zakonczyla sie 2 XI 1901 (McKinley postrzelony 6 IX 1901)
  { file: '11-02.json', y: 1902, re: /Wystawa Panamerykańska/, toYear: 1901 },
  // wojska syryjskie wkroczyly do Libanu w czerwcu 1976
  { file: '11-02.json', y: 1975, re: /wojska syryjskie wkroczyły/, drop: true },
  // zamach Natuscha w Boliwii: 1 XI 1979 (jest w 11-01 lub poza lista)
  { file: '11-02.json', y: 1979, re: /Natusch/, drop: true },
  // --- 3 XI ---
  // Frederiksodde (Fredericia) zdobyto 24 X 1657
  { file: '11-03.json', y: 1657, re: /Frederiksodde/, drop: true },
  // rekord Rosendahl: 3 IX 1970 (Uniwersjada w Turynie byla w sierpniu-wrzesniu)
  { file: '11-03.json', y: 1970, re: /Rosendahl/, drop: true },
  // cialo Gongadzego znaleziono 2 XI 2000
  { file: '11-03.json', y: 2000, re: /Gongadzego/, drop: true },
  // --- 4 XI ---
  // Nowa Zelandia: karta 16 XI 1840, osobna kolonia od 3 V 1841
  { file: '11-04.json', y: 1840, re: /Hobson/, drop: true },
  // wybory do Kongresu USA: 5 XI 1946
  { file: '11-04.json', y: 1946, re: /Partia Republikańska zwyciężyła/, drop: true },
  // --- 5 XI ---
  // konkordat austriacki podpisano 18 VIII 1855
  { file: '11-05.json', y: 1855, re: /konkordat między Cesarstwem Austriackim/, drop: true },
  // katastrofa w Ny-Alesund (Kings Bay): 5 XI 1962
  { file: '11-05.json', y: 1961, re: /Ny-Ålesund/, toYear: 1962 },
  // --- 6 XI ---
  // wybory prezydenckie w USA 1932: 8 XI (jest w 11-08)
  { file: '11-06.json', y: 1932, re: /Franklin Delano Roosevelt wygrał/, drop: true },
  // Chavez wygral wybory 6 XII 1998
  { file: '11-06.json', y: 1998, re: /Hugo Chávez wygrał/, drop: true },
  // konstytucja Litwy: referendum 25 X 1992, w zycie 2 XI 1992
  { file: '11-06.json', y: 1991, re: /konstytucja Litwy/, drop: true },
  // --- 7 XI ---
  // bitwa pod Gamonal (Burgos): 10 XI 1808 (jest w 11-10)
  { file: '11-07.json', y: 1808, re: /Burgos/, drop: true },
  // Stalingrad przemianowano na Wolgograd 10 XI 1961
  { file: '11-07.json', y: 1961, re: /Stalingrad przemianowano/, drop: true },
  // Szusza: bitwa 4-8 XI 2020, miasto zdobyte 8 XI
  { file: '11-07.json', y: 2020, re: /Şuşa/, drop: true },
  // --- 8 XI ---
  // Sejm elekcyjny 1575: wpis zdublowany z 11-07, dnia nie da sie potwierdzic
  { file: '11-08.json', y: 1575, re: /Rozpoczął obrady Sejm elekcyjny mający wybrać/, drop: true },
  // rekord 200 km/h Hemery'ego (Blitzen Benz, Brooklands): 8 XI 1909
  { file: '11-08.json', y: 1908, re: /Hémery/, toYear: 1909 },
  // Plac Saski: przemianowanie na Plac Piłsudskiego w 1928 (dokladny dzien niepotwierdzony; wpis zostaje w 11-11)
  { file: '11-08.json', y: 1928, re: /Plac Saski w Warszawie przemianowano/, drop: true },
  // referendum konstytucyjne w Turcji: 7 XI 1982
  { file: '11-08.json', y: 1982, re: /referendum obywateli Turcji/, drop: true },
  // 50 000 pkt przekroczyl indeks WIG, nie WIG20 (WIG20 ma kilka tysiecy)
  { file: '11-08.json', y: 2006, re: /WIG20/, sub: ['WIG20', 'WIG'] },
  // --- 9 XI ---
  // traktat z Etaples: 3 XI 1492
  { file: '11-09.json', y: 1492, re: /Étaples/, drop: true },
  // Nobel dla Einsteina za 1921 oglosono 9 XI 1922
  { file: '11-09.json', y: 1921, re: /Einstein/, toYear: 1922 },
  // Atif Sidki zostal premierem Egiptu 10 XI 1986 (jest w 11-10)
  { file: '11-09.json', y: 1986, re: /Atif Sidki/, drop: true },
  // --- 10 XI ---
  // traktat westminsterski (II wojna angielsko-holenderska): 19 II 1674
  { file: '11-10.json', y: 1674, re: /traktatu westminsterskiego/, drop: true },
  // --- 11 XI ---
  // traktat z Petropolis: 17 XI 1903
  { file: '11-11.json', y: 1903, re: /Petrópolis/, drop: true },
  // Huracan zalozono 1 XI 1908
  { file: '11-11.json', y: 1908, re: /Huracán/, drop: true },
  // Szanghaj zdobyty (wpis jest w 11-09)
  { file: '11-11.json', y: 1937, re: /zdobyły Szanghaj/, drop: true },

  // ===== audyt 12-30 XI (16.10.2026) =====
  // --- 12 XI ---
  // Roman III zostal cesarzem 12 XI 1028 (slub z Zoe byl 10 XI); wpis w 11-15 zdublowany
  { file: '11-12.json', y: 1028, re: /ślub bizantyńskiej/, replace: 'Roman III Argyros został cesarzem bizantyńskim.' },
  // slub Iwana III i Zofii Paleolog: 12 XI 1472 wg kalendarza juliańskiego = 21 XI (jest w 11-21)
  { file: '11-12.json', y: 1472, re: /Zoe Paleolog/, drop: true },
  // bitwa pod Jezierną: 10-12 XI to daty juliańskie, w gregoriańskim 20-22 XI (jest w 11-22)
  { file: '11-12.json', y: 1655, re: /Jezierną/, drop: true },
  // Simpson pierwszy raz uzyl chloroformu 4 XI 1847
  { file: '11-12.json', y: 1847, re: /chloroform/, drop: true },
  // Tobruk zdobyto 13 XI 1942 (jest w 11-13)
  { file: '11-12.json', y: 1942, re: /zdobyły Tobruk/, drop: true },
  // --- 13 XI ---
  // wybory 1800 w USA trwaly do 3 XII
  { file: '11-13.json', y: 1800, re: /głosowanie powszechne/, drop: true },
  // Powell zlozyl rezygnacje 15 XI 2004
  { file: '11-13.json', y: 2004, re: /Powell/, drop: true },
  // zamachy w Paryzu: 130 ofiar + 7 zamachowcow
  { file: '11-13.json', y: 2015, re: /zamachów terrorystycznych w Paryżu/, replace: 'W serii zamachów terrorystycznych w Paryżu i Saint-Denis zginęło 130 osób (oraz 7 zamachowców), a kilkaset zostało rannych.' },
  // --- 14 XI ---
  // wybory 1820 w USA trwaly do 6 XII
  { file: '11-14.json', y: 1820, re: /Monroe/, drop: true },
  // wpis niepotwierdzony, nieencyklopedyczny
  { file: '11-14.json', y: 2003, re: /Eroticon/, drop: true },
  // Scillin: 787 z 944 osob na POKLADZIE
  { file: '11-14.json', y: 1942, re: /Scillin/, sub: ['na pokazie', 'na pokładzie'] },
  // katastrofa TGV pod Strasburgiem: 11 ofiar
  { file: '11-14.json', y: 2015, re: /TGV/, sub: ['10 osób zginęło', '11 osób zginęło'] },
  // --- 15 XI ---
  // Roman III zostal cesarzem 12 XI (jest w 11-12)
  { file: '11-15.json', y: 1028, re: /Roman III Argyros został/, drop: true },
  // wpis zepsuty skladniowo
  { file: '11-15.json', y: 1316, re: /Pogrobowiec/, replace: 'Urodził się Jan I Pogrobowiec, syn zmarłego w czerwcu Ludwika X Kłótliwego; od chwili narodzin był królem Francji i Nawarry. Zmarł po pięciu dniach, a regencję sprawował jego stryj, późniejszy król Filip V Wysoki.' },
  // tekst po bialorusku
  { file: '11-15.json', y: 1925, re: /biełaruskaha/, replace: 'Rozpoczął nadawanie pierwszy ogólnokrajowy kanał białoruskiego radia.' },
  { file: '11-15.json', y: 1989, re: /Jospephie/, sub: ['Jospephie', 'Josephie'] },
  // wpis niepotwierdzony (miejsce i okolicznosci)
  { file: '11-15.json', y: 2009, re: /Vivian Ogu/, drop: true },
  // --- 16 XI ---
  // meteoryt z Ensisheim spadl 7 XI 1492
  { file: '11-16.json', y: 1492, re: /Ensisheim/, drop: true },
  // Rossosz: bitwa 17 XI 1863 (jest w 11-17)
  { file: '11-16.json', y: 1863, re: /Rossosz/, drop: true },
  // Assad: pucz 13 XI 1970 (jest w 11-13)
  { file: '11-16.json', y: 1970, re: /Assad/, drop: true },
  // CYFRA+ - data niepotwierdzona
  { file: '11-16.json', y: 1998, re: /CYFRA\+/, drop: true },
  // TWPN: pierwsze zebranie 23 XI 1800 (jest w 11-23)
  { file: '11-16.json', y: 1800, re: /Towarzystwo Warszawskie/, drop: true },
  // Edward I zostal ogloszony krolem 20 XI 1272 (jest w 11-20)
  { file: '11-16.json', y: 1272, re: /Edward I/, drop: true },
  // puste nawiasy po usunietym szablonie
  { file: '11-16.json', y: 1918, re: /Notyfikowano/, sub: [' ().', '.'] },
  // w Estonii glowa panstwa: Starszy Panstwa (Riigivanem), nie prezydent
  { file: '11-16.json', y: 1924, re: /Jaakson/, sub: ['prezydentem Estonii', 'głową państwa Estonii (Starszym Państwa)'] },
  // --- 17 XI ---
  // pokoj pirenejski: 7 XI 1659
  { file: '11-17.json', y: 1659, re: /pokój pirenejski/, drop: true },
  // II zjazd SDPRR: lipiec-sierpien 1903
  { file: '11-17.json', y: 1903, re: /Socjaldemokratyczna Partia Robotnicza Rosji/, drop: true },
  // proces berlinski: wyrok 2 XII 1847
  { file: '11-17.json', y: 1847, re: /proces wielkopolskich/, drop: true },
  // Ryszard III nie mial wtedy premiery (1592-93); udokumentowane przedstawienie dworskie
  { file: '11-17.json', y: 1633, re: /Ryszard III/, replace: 'Na dworze Karola I wystawiono sztukę Williama Szekspira Ryszard III.' },
  // pierwszy przypadek COVID-19: data niepotwierdzona oficjalnie
  { file: '11-17.json', y: 2019, re: /COVID-19/, replace: 'Według nieoficjalnych doniesień medialnych w chińskim Wuhan odnotowano pierwszy przypadek zachorowania na COVID-19 (data nie została potwierdzona oficjalnie).' },
  // --- 18 XI ---
  // diecezje Macerata erygowal Jan XXII (Grzegorz IX zmarl 1241)
  { file: '11-18.json', y: 1320, re: /Grzegorz IX/, sub: ['Grzegorz IX', 'Jan XXII'] },
  // dokladny dzien wydania Biblii gdanskiej niepotwierdzony
  { file: '11-18.json', y: 1632, re: /Biblia gdańska/, drop: true },
  // Yongli: daty rozbiezne (24 XII 1646 wg gregorianskiego)
  { file: '11-18.json', y: 1646, re: /Yongli/, drop: true },
  // sojusz warszawski 1705: 18 XI (jul.) / 28 XI (greg.) - zrodla rozbiezne
  { file: '11-18.json', y: 1705, re: /antyrosyjski sojusz/, drop: true },
  // pozostalosc po linku wiki
  { file: '11-18.json', y: 1561, re: /Bitwa pod Verbia/, sub: ['w Bitwa pod Verbia', 'w bitwie pod Verbią'] },
  // starcie 18 XI 1952: F9F Panther (nie F-86) - szczegoly spornie
  { file: '11-18.json', y: 1952, re: /MiG-15/, replace: 'Wojna koreańska: nad Morzem Japońskim doszło do walki powietrznej amerykańskich myśliwców Grumman F9F Panther z radzieckimi MiG-15; incydent utajniono na kilkadziesiąt lat.' },
  // Lumen gentium ogloszono 21 XI 1964 (jest w 11-21)
  { file: '11-18.json', y: 1964, re: /Lumen gentium/, drop: true },
  // Skolimowski
  { file: '11-18.json', y: 1966, re: /Smolimowskiego/, sub: ['Smolimowskiego', 'Skolimowskiego'] },
  // --- 19 XI ---
  // Giulio de Medici: Klemens VII
  { file: '11-19.json', y: 1523, re: /Klemens VIII/, sub: ['Klemens VIII', 'Klemens VII'] },
  // zjazd w Wyszehradzie 1335 - dokladny dzien niepotwierdzony
  { file: '11-19.json', y: 1335, re: /Wyszehradzie/, drop: true },
  // bitwa pod Wincanton: 20 XI 1688 wg jul. (30 XI greg.)
  { file: '11-19.json', y: 1688, re: /Wincanton/, drop: true },
  // otwarcie kolei fabryczno-lodzkiej: wpis zdublowany z 11-18, zrodla rozbiezne
  { file: '11-19.json', y: 1865, re: /Koluszek/, drop: true },
  // Wekerle zostal premierem 17 XI 1892 (jest w 11-17)
  { file: '11-19.json', y: 1892, re: /Wekerle/, drop: true },
  // 19 XI 1931 Haas zlozyl wniosek patentowy (patent 1933)
  { file: '11-19.json', y: 1931, re: /Tampax/, replace: 'Amerykański lekarz Earle Haas złożył wniosek patentowy na tampon higieniczny (patent przyznano w 1933 roku); wyrób sprzedawano pod znakiem towarowym „Tampax”.' },
  // Rainier III: uroczystosci wstapienia na tron 19 XI 1949 (intronizacja 11 IV 1950)
  { file: '11-19.json', y: 1949, re: /Rainier III/, replace: 'W Monako odbyły się uroczystości wstąpienia na tron księcia Rainiera III Grimaldiego (data ta stała się później Dniem Narodowym Monako).' },
  // Edsel: Ford zakonczyl produkcje, a nie zbankrutowal
  { file: '11-19.json', y: 1959, re: /Edsel/, replace: 'Ford Motor Company ogłosił zakończenie produkcji luksusowej marki Edsel, jednej z największych porażek rynkowych w historii motoryzacji.' },
  // Annan: rekomendacja RB 13 XII 1996, wybor ZO 17 XII
  { file: '11-19.json', y: 1996, re: /Kofi Annan/, drop: true },
  // wichura w Tatrach: ok. 12 tys. ha
  { file: '11-19.json', y: 2004, re: /Tatrach/, sub: ['a około 100 ha drzewostanu zostało powalone', 'a ok. 12 tys. ha lasu zostało zniszczonych lub uszkodzonych'] },
  // Hajfong: ostrzal 23 XI 1946, wojna wg wiekszosci zrodel od 19 XII
  { file: '11-19.json', y: 1946, re: /Hajfong/, drop: true },
  // Agdam przejety przez Azerbejdzan 20 XI 2020
  { file: '11-19.json', y: 2020, re: /Ağdam/, drop: true },
  // --- 20 XI ---
  // uznanie niepodleglosci Polski przez Niemcy: dzien i "pierwszy kraj" niepotwierdzone
  { file: '11-20.json', y: 1918, re: /Niemcy, jako pierwszy kraj/, drop: true },
  // program rzadu Moraczewskiego ogloszono 21 XI 1918 (jest w 11-21)
  { file: '11-20.json', y: 1918, re: /Moraczewskiego ogłosił swój program/, drop: true },
  // wybory do Izby Deputowanych we Francji: 16 XI 1919
  { file: '11-20.json', y: 1919, re: /francuskiego Zgromadzenia/, drop: true },
  // Hersh opublikowal pierwszy tekst 12-13 XI; 20 XI Plain Dealer wydrukowal zdjecia
  { file: '11-20.json', y: 1969, re: /Hersh/, replace: 'W amerykańskiej prasie ukazały się pierwsze zdjęcia z masakry dokonanej przez US Army w wietnamskiej wiosce Mỹ Lai.' },
  // Vacaroiu: nominacja 18 XI, rzad 19 XI 1992
  { file: '11-20.json', y: 1992, re: /Văcăroiu/, drop: true },
  { file: '11-20.json', y: 2025, re: /Tonga/, replace: 'Odbyły się wybory parlamentarne w Tonga.' },
  // --- 21 XI ---
  // wojska polskie weszly do Lwowa w nocy 21/22 XI
  { file: '11-21.json', y: 1918, re: /cały Lwów/, replace: 'Wojna polsko-ukraińska: wojska polskie, wsparte przybyłą odsieczą, zmusiły oddziały ukraińskie do opuszczenia Lwowa (w nocy z 21 na 22 listopada).' },
  // dekret o Medalu za Warszawe: 26 X 1945 (Dz.U. 1945 nr 287)
  { file: '11-21.json', y: 1945, re: /Medal za Warszawę/, drop: true },
  // wybory prezydenckie w USA 1832 trwaly do 5 XII
  { file: '11-21.json', y: 1832, re: /Andrew Jackson/, drop: true },
  // konstytucje II Republiki uchwalono 4 XI 1848
  { file: '11-21.json', y: 1848, re: /konstytucja II Republiki/, drop: true },
  // bitwa o Rostow trwala 17 XI-2 XII 1941
  { file: '11-21.json', y: 1941, re: /Rostów/, drop: true },
  { file: '11-21.json', y: 1943, re: /środowych/, sub: ['środowych', 'środkowych'] },
  // 21 XI parafowano uklad z Dayton (podpisany 14 XII w Paryzu)
  { file: '11-21.json', y: 1995, re: /Dayton/, replace: 'W Dayton w stanie Ohio parafowano układ kończący wojnę w Bośni i Hercegowinie (formalnie podpisano go 14 grudnia w Paryżu).' },
  // --- 22 XI ---
  // Port Artur zdobyto 21 XI 1894 (jest w 11-21)
  { file: '11-22.json', y: 1894, re: /Lüshun/, drop: true },
  // data zalozenia NHL rozbiezna (22 XI tradycyjnie, 26 XI oficjalnie)
  { file: '11-22.json', y: 1917, re: /NHL/, drop: true },
  // Neapolitanczycy wkroczyli do Rzymu 29 XI (zrodla: 27-29 XI)
  { file: '11-22.json', y: 1798, re: /Karl Mack/, sub: ['który zajęły 27 listopada', 'który zajęły pod koniec listopada'] },
  // rezolucja 242 wzywa do wycofania z terytoriow zajetych w wojnie 1967
  { file: '11-22.json', y: 1967, re: /rezolucję wzywającą Izrael/, sub: ['z okupowanych ziem palestyńskich', 'z terytoriów okupowanych w czasie wojny sześciodniowej'] },
  // Swiatowy Dzien Wegetarianizmu: inicjatywa NAVS 1977, IVU poparla w 1978
  { file: '11-22.json', y: 1977, re: /Wegetariańska/, drop: true },
  // Uklad europejski podpisano 16 XII 1991
  { file: '11-22.json', y: 1991, re: /Układ europejski/, drop: true },
  // --- 23 XI ---
  // proklamacja Waszyngtona 3 X 1789 na 26 XI; brak ustanowienia 23 XI
  { file: '11-23.json', y: 1789, re: /Święto Dziękczynienia/, drop: true },
  // pozostalosc po linku wiki
  { file: '11-23.json', y: 1899, re: /Belmont/, sub: ['w Bitwa pod Belmont (1899)', 'w bitwie pod Belmont'] },
  // SS Benlomond
  { file: '11-23.json', y: 1942, re: /Belmond/, sub: ['Belmond', 'Benlomond'] },
  { file: '11-23.json', y: 1967, re: /połudiowowietnamskich/, sub: ['połudiowowietnamskich', 'południowowietnamskich'] },
  // epicentrum w Irpinii, nie pod Neapolem
  { file: '11-23.json', y: 1980, re: /Neapolem/, sub: ['w trzęsieniu ziemi z epicentrum pod Neapolem', 'w trzęsieniu ziemi w Irpinii we Włoszech'] },
  // porywacze lotu 961 byli Etiopczykami
  { file: '11-23.json', y: 1996, re: /kenijskich terrorystów/, sub: ['kenijskich terrorystów', 'etiopskich porywaczy'] },
  // --- 24 XI ---
  // data juliańska (4 XII wg gregorianskiego)
  { file: '11-24.json', y: 1639, re: /Horrocks/, replace: 'Angielski astronom Jeremiah Horrocks jako pierwszy zaobserwował przejście Wenus na tle tarczy Słońca (według kalendarza juliańskiego; w gregoriańskim był to 4 grudnia).' },
  { file: '11-24.json', y: 1714, re: /Order Świętej Katarzyny/, replace: 'Car Rosji Piotr I Wielki ustanowił kobiecy Order Świętej Katarzyny Męczennicy (24 listopada według kalendarza juliańskiego; w gregoriańskim 5 grudnia).' },
  // w 1848 nie bylo jeszcze Republiki Rzymskiej (proklamowana w lutym 1849)
  { file: '11-24.json', y: 1848, re: /Pius IX/, sub: ['opuszczenia Republiki Rzymskiej', 'opuszczenia Rzymu'] },
  { file: '11-24.json', y: 1874, re: /Glidden/, sub: ['Farwall', 'Farwell'] },
  // Dania i Finlandia przystapily do Paktu antykominternowskiego 25 XI 1941
  { file: '11-24.json', y: 1941, re: /Dania przystąpiła/, drop: true },
  // objawienia z Montichiari: data i charakter sporne
  { file: '11-24.json', y: 1946, re: /Pierina Gilli/, drop: true },
  // mecz Polska-ZSRR w Lipsku: dnia nie da sie potwierdzic
  { file: '11-24.json', y: 1957, re: /Lipsku/, drop: true },
  { file: '11-24.json', y: 1992, re: /Praską Papierów/, sub: ['Praską Papierów', 'Praską Giełdę Papierów'] },
  // --- 25 XI ---
  // 25 XI 1491 podpisano kapitulacje Grenady (oblezenie trwalo od kwietnia)
  { file: '11-25.json', y: 1491, re: /oblężenie Grenady/, replace: 'Rekonkwista: podpisano układ kapitulacyjny Grenady, ostatniego muzułmańskiego królestwa na Półwyspie Iberyjskim (miasto zajęto 2 stycznia 1492 roku).' },
  // data juliańska (6 XII wg gregorianskiego)
  { file: '11-25.json', y: 1741, re: /Elżbietę Romanową/, replace: 'W wyniku buntu pułku preobrażeńskiego na tron carski w Rosji wyniesiono Elżbietę Romanową (25 listopada według kalendarza juliańskiego; w gregoriańskim 6 grudnia).' },
  // Bathurst zaginal w Perleberg
  { file: '11-25.json', y: 1809, re: /Bathurst/, sub: ['Pod Berlinem', 'W Perlebergu'] },
  // Wojwodina: Nowy Sad 25 XI, Czarnogora 26 XI (jest w 11-26)
  { file: '11-25.json', y: 1918, re: /Wojwodina i Czarnogóra/, replace: 'Wielkie Zgromadzenie Narodowe w Nowym Sadzie uchwaliło przyłączenie Wojwodiny do Królestwa Serbii.' },
  // Prajadhipok: Wajiravudh zmarl 26 XI 1925
  { file: '11-25.json', y: 1925, re: /Prajadhipok/, drop: true },
  // Patria zatonela po wybuchu bomby Hagany
  { file: '11-25.json', y: 1940, re: /Patria/, replace: 'W porcie Hajfa na pokładzie statku „Patria” z około 1800 nielegalnymi żydowskimi imigrantami wybuchła bomba podłożona przez Haganę; statek zatonął, a zginęło około 260 osób.' },
  // Cmentarz Powstancow Warszawy otwarto 29 XI 1945 (jest w 11-29)
  { file: '11-25.json', y: 1945, re: /Cmentarz Powstańców/, drop: true },
  // 9. podroz apostolska Pawla VI rozpoczela sie 26 XI 1970
  { file: '11-25.json', y: 1970, re: /podróż apostolską/, drop: true },
  // atak lotniarza z PFLP-GC (Noc lotni)
  { file: '11-25.json', y: 1987, re: /Kirjat Szemona/, replace: 'Palestyński terrorysta z PFLP-GC przedostał się lotnią z Libanu na teren izraelskiej bazy wojskowej koło Kirjat Szemona, zabił 6 żołnierzy i ranił kilku, po czym sam zginął.' },
  // II tura wyborow w Urugwaju: 29 XI 2009
  { file: '11-25.json', y: 2009, re: /Mujica/, drop: true },
  // uklad Rosja-Abchazja podpisano 24 XI 2014
  { file: '11-25.json', y: 2014, re: /Abchazja i Rosja/, drop: true },
  { file: '11-25.json', y: 2021, re: /Gen Nicolae/, sub: ['Gen Nicolae', 'Gen. Nicolae'] },
  // --- 26 XI ---
  // data juliańska (7 XII wg gregorianskiego)
  { file: '11-26.json', y: 1769, re: /Order Świętego Jerzego/, replace: 'Cesarzowa Rosji Katarzyna II Wielka ustanowiła Order Świętego Jerzego (26 listopada według kalendarza juliańskiego; w gregoriańskim 7 grudnia).' },
  // dokladny dzien uwolnienia Kosciuszki niepotwierdzony
  { file: '11-26.json', y: 1796, re: /Kościuszkę/, drop: true },
  // SS Californian zbudowano w 1901-02 (brytyjski, Leyland Line)
  { file: '11-26.json', y: 1906, re: /Californian/, drop: true },
  // zdublowane z nastepnym wpisem (Zgromadzenie w Podgoricy)
  { file: '11-26.json', y: 1918, re: /Wielkie Zgromadzenie Serbskie/, drop: true },
  { file: '11-26.json', y: 1942, re: /dwudniowe bitwa/, sub: ['dwudniowe bitwa o Brisbane starcia', 'dwudniowa bitwa o Brisbane – starcia'] },
  { file: '11-26.json', y: 1979, re: /Komorowski/, sub: ['Komorowski.', 'Komorowskiego.'] },
  // ostatnie wojska wietnamskie opuscily Kambodze 26 IX 1989
  { file: '11-26.json', y: 1989, re: /wietnamskie oddziały/, drop: true },
  // --- 27 XI ---
  // slub per procura Dymitra i Maryny: 22 XI 1605
  { file: '11-27.json', y: 1605, re: /per procura/, drop: true },
  // Murat wkroczyl do Warszawy 28 XI 1806
  { file: '11-27.json', y: 1806, re: /zajęły opuszczoną/, drop: true },
  // Schwarzenberg zostal premierem 21 XI 1848 (jest w 11-21)
  { file: '11-27.json', y: 1848, re: /Schwarzenberg/, drop: true },
  // zachowany jest tylko wpis licencji (27 XI) i bond (28 XI); data slubu nieznana
  { file: '11-27.json', y: 1582, re: /Szekspir/, replace: 'W Worcesterze wydano zezwolenie na ślub Williama Szekspira (dokładna data jego małżeństwa z Anne Hathaway nie jest znana).' },
  // trzesienie ziemi w Kita-Izu: 26 XI 1930, 272 ofiary
  { file: '11-27.json', y: 1930, re: /trzęsieniu ziemi w Japonii/, drop: true },
  // masakra w Jilavie zdublowana z 11-26
  { file: '11-27.json', y: 1940, re: /Żelazna Gwardia/, drop: true },
  // bitwa o Rostow (17 XI-2 XII 1941); 27 XI zaczela sie kontrofensywa radziecka
  { file: '11-27.json', y: 1941, re: /zakończyła się bitwa o Rostów/, replace: 'Front wschodni: rozpoczęła się radziecka kontrofensywa pod Rostowem nad Donem, zakończona odzyskaniem miasta przez Armię Czerwoną.' },
  // Ziwkow zostal premierem 19 XI 1962
  { file: '11-27.json', y: 1962, re: /Żiwkow/, drop: true },
  // ustawa o tlumaczu przysieglym z 25 XI 2004
  { file: '11-27.json', y: 2004, re: /tłumacza przysięgłego/, drop: true },
  // --- 28 XI ---
  // Modoc War: poczatek 29 XI 1872 (jest w 11-29)
  { file: '11-28.json', y: 1872, re: /Rozpoczęła się wojna Amerykanów z Modokami/, drop: true },
  // Nancy Astor wygrala wybory uzupelniajace 15 XI 1919
  { file: '11-28.json', y: 1919, re: /Nancy Astor/, drop: true },
  // lot nad biegunem poludniowym: 28-29 XI (nad biegunem 29 XI)
  { file: '11-28.json', y: 1929, re: /Byrd/, drop: true },
  // Albania: Republike Ludowa proklamowano 11 I 1946
  { file: '11-28.json', y: 1944, re: /republiką ludową/, drop: true },
  // wysiedlenia z Zamojszczyzny - wpis zdublowany z 11-27
  { file: '11-28.json', y: 1942, re: /Zamojszczyzny/, drop: true },
  { file: '11-28.json', y: 1982, re: /Dymitrow/, sub: ['Dymitrow"', 'Dymitrow”'] },
  { file: '11-28.json', y: 2004, re: /Pierwsza tura wyborów na prezydenta Rumunii/, replace: 'W Rumunii odbyła się pierwsza tura wyborów prezydenckich i wybory parlamentarne.' },
  // --- 29 XI ---
  // atak na Port-au-Prince w Tonga: 1 XII 1806
  { file: '11-29.json', y: 1806, re: /Port-au-Prince/, drop: true },
  // spolka Lancia zalozona 27 XI 1906
  { file: '11-29.json', y: 1906, re: /Lancia/, drop: true },
  // rzad Qemalego powstal 4 XII 1912
  { file: '11-29.json', y: 1912, re: /Ismaila Qemala/, drop: true },
  // premiera L'Age d'or: 28 XI (zrodla rozbiezne)
  { file: '11-29.json', y: 1930, re: /Złoty wiek/, drop: true },
  // Charriere uciekl z kolonii karnej na kontynencie
  { file: '11-29.json', y: 1933, re: /Papillon/, sub: ['z kolonii karnej na Wyspie Diabelskiej u wybrzeży Gujany Francuskiej', 'z kolonii karnej w Gujanie Francuskiej'] },
  // ONZ przyjela plan podzialu (nie podzielila Palestyny)
  { file: '11-29.json', y: 1947, re: /Palestyna została podzielona/, replace: 'Zgromadzenie Ogólne ONZ przyjęło rezolucję nr 181 – plan podziału Palestyny na państwo żydowskie i arabskie.' },
  // Ellis Island zamknieto 12 XI 1954
  { file: '11-29.json', y: 1954, re: /Ellis Island/, drop: true },
  // lotnisko Mirabel otwarto 4 X 1975
  { file: '11-29.json', y: 1975, re: /Mirabel/, drop: true },
  // lot KAL 858: 115 ofiar
  { file: '11-29.json', y: 1987, re: /155 osób/, sub: ['155 osób', '115 osób'] },
  // Lost River: marginalne zwyciestwo USA, poczatek wojny
  { file: '11-29.json', y: 1872, re: /Lost River/, replace: 'Wojna z Modokami: starcie nad Lost River, od którego liczy się początek wojny.' },
  // --- 30 XI ---
  // 30 XI to data szwedzka (juliańska); gregoriańska 11 XII
  { file: '11-30.json', y: 1718, re: /Karol XII/, replace: 'Król Szwecji Karol XII zginął podczas oblężenia norweskiej twierdzy Fredrikshald (30 listopada według kalendarza juliańskiego; w gregoriańskim 11 grudnia).' },
  // Nafplio: data grecka (juliańska) niepewna
  { file: '11-30.json', y: 1822, re: /Nauplion/, drop: true },
  // Reunion przeszla na strone Wolnej Francji 28 XI 1942
  { file: '11-30.json', y: 1942, re: /Reunion/, drop: true },
  // "dekret glodowy" to osobna akcja, nie Akcja T4
  { file: '11-30.json', y: 1942, re: /Akcja T4/, replace: 'W Bawarii wydano tzw. dekret głodowy (Hungererlass), nakazujący szpitalom psychiatrycznym drastyczne ograniczenie wyżywienia pacjentów.' },
  // Super Famicom zadebiutowal 21 XI 1990
  { file: '11-30.json', y: 1990, re: /Super Nintendo/, drop: true },
  // Diablo ukazalo sie 31 XII 1996
  { file: '11-30.json', y: 1996, re: /Diablo/, drop: true },
  // zepsuty zapis magnitudy
  { file: '11-30.json', y: 2004, re: /Podhalu doszło do trzęsienia/, replace: 'Na Podhalu doszło do trzęsienia ziemi.' },
];
function applyEntryFixes(file, events) {
  return events
    .map(e => {
      const fx = ENTRY_FIXES.find(f => f.file === file && f.y === e.y && f.re.test(e.t));
      if (!fx) return e;
      if (fx.drop) return null;
      // toYear = korekta roku wpisu (np. blad roku w Wikipedii); bez zmiany tresci, gdy brak sub/replace
      return { ...e, ...(fx.toYear ? { y: fx.toYear } : {}), t: fx.sub ? e.t.replace(fx.sub[0], fx.sub[1]) : (fx.replace || e.t) };
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
