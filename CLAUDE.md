# DaybyDay (daybyday.today)

Statyczna strona (HTML/CSS/JS, bez frameworka i buildu) hostowana na GitHub Pages. Polski kalendarz/kalkulatory/astrologia/statystyki. Każda strona ma własne, samodzielne `<style>`/`<script>` — brak wspólnego bundla.

## Zasada pracy: zawsze jednym agentem

Wszystko i zawsze jednym agentem, chyba że użytkownik wyraźnie zdecyduje inaczej. Nie uruchamiać wielu równoległych subagentów (narzędzie Agent) do pracy w tym repo, nawet gdy zadanie naturalnie dzieli się na niezależne części (np. audyt wielu stron/imion, przeszukiwanie wielu niezależnych tematów). Zawsze jednym agentem — albo bezpośrednio samemu, albo pojedynczym wywołaniem Agent, nigdy wieloma równocześnie — domyślnie, bez pytania. Wyjątek: jeśli użytkownik w danej chwili sam poprosi o wiele agentów/zrównoleglenie, można to zrobić — ale to on decyduje, nie ja z własnej inicjatywy. Potwierdzone dwukrotnie jako wyraźna, ogólna preferencja użytkownika (26.08.2026), niezależnie od tego, jak bardzo dane zadanie nadawałoby się do zrównoleglenia.

## Struktura katalogów

- `imieniny/<slug>/`, `swieto/<slug>/` — ~2400/~1300 wygenerowanych stron treściowych (generatory: `scripts/gen_static_pages.js`, `scripts/gen_static_swieto_pages.js`)
- `kartka/MM-DD/` (+`/widget/`) — 366 stron "kartka z kalendarza" per dzień, generator `scripts/gen_kartka.js`
- `kalendarz/RRRR/MM/` — statyczne strony miesięczne, generator `scripts/gen_kalendarz_miesiace.js`
- `wschod-zachod-slonca/<miasto>/` — 12 miast, generator `scripts/gen_wschody_miasta.js`
- `swieta-liturgiczne/<slug>/` — 22 strony świąt kościelnych, BEZ generatora (pliki pisane/edytowane ręcznie, wszystkie bajtowo identyczny szablon head/CSS)
- `widget/<nazwa>/` — strony osadzane w `<iframe>` na cudzych stronach (noindex, minimalne, bez nav)
- `scripts/` — generatory (`gen_*.js`) + duża liczba jednorazowych skryptów historycznych (`apply_*`, `fix_*`, `quotes_batch*.json` itd. z kampanii weryfikacji przysłów/cytatów) — te ostatnie NIE są do ponownego użycia, to archiwum jednorazowych operacji

**Zasada:** jeśli strona jest wygenerowana ze skryptu, poprawiaj generator + przebuduj, nie edytuj wygenerowanych plików ręcznie (ryzyko rozjazdu przy następnym uruchomieniu generatora).

## Dwa szablony nawigacji — NIE MYLIĆ

1. **Strony narzędziowe/interaktywne** (kalkulatory.html, kalendarz.html, znaki-zodiaku.html, kalendarz-liturgiczny.html, widget-*.html, ranking-imion.html itd.): pełny `<nav class="topnav">` z: 5 linków (Główna/Imieniny/Święta/Kalendarz szkolny/Kalkulatory — „Liturgiczny" zamieniony na „Kalendarz szkolny" 2026-08-28, kalendarz-liturgiczny.html nadal istnieje, dostępny z siatki kart na stronie głównej), `#fontToggle` (cykl normal→large→xl, `data-font` na `<html>`, localStorage `dbd-font`), `#themeToggle` (localStorage `dbd-theme`), `.nav-burger` (mobile), cookie banner, rejestracja `sw.js`.
2. **Strony treściowe/generowane** (`/swieto/*`, `/imieniny/*`, `/swieta-liturgiczne/*`): lżejszy `<nav class="topnav">` — te same 5 linków + `#themeToggle`, ale BEZ font-togglea, BEZ burgera, BEZ cookie banneru, BEZ SW. Dodatkowo breadcrumb (`<nav class="breadcrumb">`) i CSS `:root{--bg;--text;--muted;--muted2;--border}` + `[data-theme="dark"]`.

**Znany, powtarzający się bug:** nowe strony treściowe czasem powstają z całkowicie bez nawigacji / bez trybu ciemnego (sztywny `color-scheme:light`, kolory hex zamiast zmiennych). Stwierdzone dwukrotnie: raz w `/imieniny/<slug>/` bez wpisu w `NAME_DESCRIPTIONS_RICH` (naprawione `scripts/fix_dark_mode_lite_pages.js`), raz we wszystkich 22 `/swieta-liturgiczne/*` (2026-08-25). **Przy każdej nowej stronie treściowej sprawdź od razu, czy ma któryś z dwóch szablonów wyżej — nie zakładaj, że ma.**

## Service Worker (`sw.js`)

`const CACHE = 'daybyday-vNNN'` — network-first dla nawigacji (`mode:'navigate'`), cache-first dla reszty zasobów. **Bump numeru wersji przy KAŻDEJ zmianie inline JS/CSS na stronie, która rejestruje SW** (`if("serviceWorker" in navigator)navigator.serviceWorker.register("sw.js")`), inaczej powracający użytkownicy dostaną starą wersję z cache. Strony treściowe (`/swieto/*`, `/imieniny/*`, `/swieta-liturgiczne/*`) nie rejestrują SW — nie dotyczy ich.

## Trzy powtarzające się wzorce bugów (sprawdzaj proaktywnie w nowym kodzie)

1. **"Zamrożenie po dacie granicznej"** — hardkodowane dane/tablice z datami (np. `NEW_MOONS`, `EVENTS` roku szkolnego) używane do "co dziś/co następne" bez algorytmicznego liczenia — po minięciu ostatniej daty w tablicy strona pokazuje cichą, fałszywą odpowiedź zamiast błędu. Warianty: (a) licznik pokazujący "0" na zawsze, (b) wartość dryfująca w błędny zakres z aktywnie mylącym fallbackiem, (c) całkiem statyczny HTML bez korekcyjnego JS, (d) ostatni wpis w danych bez "następnego" sąsiada (puste pole zamiast błędu). Napraw przez algorytmiczne obliczanie z `new Date()`, nie przez dopisywanie kolejnego roku do tablicy. **Wzorcowa implementacja bez tego bugu:** licznik "do wakacji"/"do szkoły" na `kalendarz-szkolny.html` (funkcje `schoolStart()`/`schoolEnd()`/`renderCountdown()`, dodane 2026-08-28) — liczy start/koniec roku szkolnego wyłącznie z reguły prawnej (pierwszy dzień powszedni września, najbliższy piątek po 20 czerwca) i `new Date()`, bez żadnej tabeli lat — działa poprawnie dla dowolnego roku w przyszłości, zweryfikowane symulacją do 2032 r. Kopiować ten wzorzec przy każdym kolejnym liczniku/kalendarzu na tej stronie.
2. **Mieszanie UTC z lokalną strefą czasową** — `new Date("YYYY-MM-DD")` z `<input type="date">` parsuje się jako północ UTC, ale późniejsze `getDate()/getDay()/setDate()` czytają w strefie LOKALNEJ przeglądarki. Dla widza w strefie na zachód od UTC (USA/Kanada — spora część polskiej diaspory) to przesuwa wynik o cały dzień. Napraw budując datę numerycznym konstruktorem: `new Date(y, m-1, d)` (zawsze lokalny, poprawny niezależnie od strefy widza) zamiast parsowania stringa.
3. **Ta sama logika obliczeniowa zduplikowana w wielu plikach bez wspólnego źródła, rozjeżdża się cicho** — odkryte 2026-08-29 na przykładzie fazy księżyca: **5 niezależnych kopii** tej samej funkcji (`index.html` `getMoonPhase`, `fazy-ksiezyca.html` `getPhase`, `kartka-z-kalendarza.html` `getMoonPhase`, `kalendarz.html` `getMoonPhaseCompact`, plus stary martwy `MOON_PHASES` w `kartka-z-kalendarza.html`), każda z osobno dobranymi/błędnymi progami nazywania fazy — naprawienie jednej (np. `index.html` po zgłoszeniu przez usera) zostawiało pozostałe 4 nadal błędne, co ujawniło się dopiero gdy user zaznaczył inny widget na stronie i zobaczył sprzeczny wynik. **Przy każdej poprawce algorytmu astronomicznego/kalendarzowego: `grep` po całym repo za nazwą charakterystycznej stałej/progu (np. `SYNODIC`, konkretna wartość progu) ZANIM uznasz poprawkę za skończoną — nie ograniczaj się do pliku, w którym user zgłosił problem.** Wyjątek działający dobrze: `scripts/gen_kartka.js` i `scripts/gen_kalendarz_miesiace.js` wyciągają kod funkcji z `kalendarz.html` w runtime (`vm.runInContext`) zamiast trzymać własną kopię — to jest wzorcowe podejście, kopiować je przy nowych generatorach zamiast wklejać kolejną kopię algorytmu.

## Wzorce błędów treści (imiona/święta) — sprawdzaj mechanicznie przy każdym audycie

Z audytu całego września 2026 (3 rundy, 591 wystąpień imion + wszystkie święta miesiąca, ~40+ potwierdzonych błędów naprawionych) wyłoniły się nawracające, **mechanicznie wykrywalne bez WebSearch/agenta** klasy błędów w `name_descriptions_rich.js` / `imieniny.html` (`NAME_DB`) / `swieto.html` / `swieta-nietypowe.html`:

1. **Wzmianki o konkurencie wprost w treści** — co najmniej 5 przypadków znalezionych (kalbi.pl, bimKal.pl) wklejonych do pól `origin`/`desc` świąt, prawdopodobnie zanieczyszczenie z procesu researchu. Skan: `grep -in "kalbi\|bimkal"` po plikach świąt.
2. **Literówki z pojedynczymi znakami cyrylicy wmieszanymi w polski tekst** (np. „harmonijна" zamiast „harmonijna", cyrylickie „н"/„а"/„м"/„р" zamiast łacińskich) — 4 przypadki znalezione, rozproszone, niepowiązane ze sobą tematycznie. Skan (regex): słowo z co najmniej jedną literą łacińską i co najmniej jedną cyrylicką — `/\b[a-zA-Z...]*[а-яёА-ЯЁ][a-zA-Z...]*\b/gu`. Po pełnym skanie całej bazy (2026-08-26): zero pozostałych.
3. **Sprzeczne fakty między `NAME_DESCRIPTIONS_RICH` (opis) a `NAME_DB` (dane popupu) dla tego samego imienia** — zdecydowanie najczęstszy typ błędu (dziesiątki przypadków): różne daty życia/śmierci tej samej osoby, różne daty wspomnienia patrona, różny zakon/płeć/tożsamość patrona, przestarzała data liturgiczna sprzed reformy 1969 w jednym polu a aktualna w drugim. Skan: dla każdego imienia z obu pól wyciągnąć wszystkie liczby-lata i porównać.
4. **Duplikat tego samego święta pod dwiema nazwami** — jedna strona w `HOLIDAYS_DB` (awansowana) i osobna, nieusunięta strona z `swieta-nietypowe.html` pod alternatywną nazwą, mimo że opis w `HOLIDAYS_DB` sam wspomina tę nazwę jako alias. Napraw dopisując alias do `NAME_ALIASES` w `scripts/swieto_registry.js`, nie ręcznym kasowaniem plików bez aktualizacji rejestru.

**Ważne o agentach weryfikujących fakty:** w tej samej sesji agent general-purpose 3-krotnie zgłosił "błąd", który po własnej weryfikacji Claude okazał się fałszywym alarmem lub błędną diagnozą (raz wskazał złą przyczynę realnego problemu). Nigdy nie wdrażać poprawki zasugerowanej przez agenta bez własnej, niezależnej weryfikacji najważniejszych/najbardziej zaskakujących ustaleń.

## Codzienny audyt treści dnia (imieniny + święta) — cel: 10:00, zero błędów

**Wymaga osobno skonfigurowanego zaplanowanego zadania (np. `/schedule`), które o 10:00 codziennie uruchamia sesję z poleceniem wykonania tego audytu — sam ten wpis w CLAUDE.md niczego automatycznie nie odpala, to tylko instrukcja czytana przez agenta, gdy sesja faktycznie się uruchomi.**

Zakres: WSZYSTKIE imiona obchodzące imieniny danego dnia (`NAMES` w `imieniny.html`) oraz WSZYSTKIE święta danego dnia — zarówno z `HOLIDAYS_DB` (`swieto.html`), jak i z listy "nietypowych" (`swieta-nietypowe.html`, tablica `HOLIDAYS`). Cel: żadnego, nawet najdrobniejszego błędu na żywej stronie każdego z tych imion/świąt.

**Per imię dnia — sprawdzić:**
1. Data(y) w `NAMES` zgadzają się z datą(ami) wypisaną na wygenerowanej stronie `/imieniny/<slug>/` (`dates`/`datesStr` w `buildPage()`).
2. Wpis w `name_descriptions_rich.js` istnieje — jeśli brak, sprawdź czy imię ma realnych nosicieli (`name_popularity_gender.js`/`name_trends.js`, wzorzec z audytu Włodzimierza 28.08.2026) zanim zdecydujesz, czy uzupełniać.
3. `Znaczenie imienia` i `Historia` nie powielają tej samej etymologii — użyj `node scripts/gen_static_pages.js --check-duplication --only=<Imię>` (próg 25%, wzorzec z 2026-07-12).
4. Sekcja patrona (`Patron`/`Święty patron`/`Święta patronka`/`Święci patroni`/`Święte patronki`) w RICH — porównaj wszystkie liczby-lata z odpowiadającym wpisem w `NAME_DB` (`imieniny.html`) dla tego samego imienia: brak sprzecznych dat/tożsamości ORAZ brak patronów, których zna `NAME_DB`, a pomija RICH (RICH całkowicie nadpisuje NAME_DB gdy ma własną sekcję patrona — luka jest niewidoczna bez ręcznego porównania, wzorzec ze Stanisława Kostki 28.08.2026).
5. Fakty historyczne (daty życia/śmierci, kanonizacja, urząd, narodowość) zweryfikowane przez WebSearch z co najmniej jednym niezależnym źródłem — ale **tylko dla treści nowej lub zmienionej od ostatniego audytu tego imienia**, nie powtarzaj pełnej weryfikacji faktów, które już raz sprawdzono i się nie zmieniły (ten sam dzień wraca za rok — bezsensowne re-weryfikowanie identycznego, niezmienionego tekstu w kółko). Prowadź nieformalny rejestr "ostatnio zweryfikowane" (np. komentarz w pliku lub log w `scripts/`), żeby wiedzieć, co jest nowe.
6. Skan mechaniczny na treści imienia: wzmianki konkurencji (`grep -in "kalbi\|bimkal"`), literówki cyrylicowe (patrz niżej).
7. Linki wewnętrzne ze strony imienia (miesiąc, współsolenizanci, poprzednie/następne) prowadzą do istniejących stron.

**Per święto dnia (poważne i nietypowe) — sprawdzić:**
1. Data w `HOLIDAYS_DB`/`HOLIDAYS` zgadza się z rzeczywistym dniem kalendarzowym.
2. Brak duplikatu tego samego wydarzenia pod dwiema nazwami tego samego dnia — **uwaga:** to bywa złudne (patrz "Dzień Strażaka" vs "Międzynarodowy Dzień Strażaka", 28.08.2026 — dwa różne, prawdziwe wydarzenia na tej samej dacie z powodu wspólnego patrona; nie łączyć automatycznie tylko po podobieństwie nazwy, zweryfikować merytorycznie).
3. Fakty (`origin`, `desc`, `traditions`) zweryfikowane przez WebSearch — z tym samym zastrzeżeniem co przy imionach: nie re-weryfikuj niezmienionej treści co roku bez powodu.
4. Skan mechaniczny: wzmianki konkurencji, literówki cyrylicowe.
5. Linki wewnętrzne (tego samego dnia, tej samej kategorii) prowadzą do istniejących stron.

**Mechaniczne skany (bez WebSearch/agenta, tanie — odpalać zawsze, całe punkty 6/4 wyżej):**
- Konkurencja: `grep -in "kalbi\|bimkal"` po treści dnia.
- Cyrylica: regex słowo z ≥1 literą łacińską i ≥1 cyrylicką — `/\b[a-zA-Z...]*[а-яёА-ЯЁ][a-zA-Z...]*\b/gu`.
- Pełna metodologia i przykład wykonania (w tym pułapka fałszywych trafień przy dopasowywaniu dat) — patrz sesja 28.08.2026.

## Weryfikacja danych kalendarzowych/astronomicznych

- Wielkanoc: algorytm Meeusa/Jonesa/Butchera (użyty w wielu plikach, zweryfikowany).
- Wniebowstąpienie w Polsce: Wielkanoc+42 (niedziela), NIE +39 (tradycyjny czwartek) — decyzja Kongregacji ds. Kultu Bożego z 2004 r.
- Wigilia (24 grudnia) jest ustawowym dniem wolnym od pracy od 2025 r. (Dz.U. 2024 poz. 1965) — jeśli coś twierdzi inaczej, to nieaktualne.
- Przy dowolnej dacie/algorytmie liturgicznym/astronomicznym: zawsze przelicz niezależnie (własna implementacja) I porównaj z zewnętrznym źródłem — pojedyncze źródło (nawet zgodne) bywa samo nieaktualne lub błędne.
- **Faza Księżyca — nazwa fazy (Nów/Kwadra/Pełnia/Garb/Sierp) to kategoryzacja ciągłej wielkości (wiek/elongacja), więc "poprawność" progów to kwestia konwencji, nie tylko liczenia.** Odkryte 2026-08-29: **1 zgodne źródło NIE wystarcza** — kalendarzswiat.pl (bezpośredni polski konkurent) używał szerokiego ~3,5-dniowego okna dla "Pełni", podczas gdy 4 inne niezależne źródła (timeanddate.com — najbardziej autorytatywne z sprawdzonych, moongiant.com, kalendarz-365.pl, TheSkyLive) zgodnie etykietują Pełnię/Kwadry tylko na pojedynczy dzień najbliższy dokładnemu momentowi astronomicznemu, mimo że jasność (illumination) wciąż jest ~97-99% dzień wcześniej/później. **Zasada: sprawdzaj ≥3-4 niezależne źródła, nie 1, zanim uznasz konwencję szerokości okna za rozstrzygniętą — pojedynczy zgodny wynik może być odosobnionym błędem (nawet jeśli to poważny, ugruntowany konkurent).** Ustalone finalne progi (wąskie, ±0,5 dnia wokół dokładnego momentu): Nów `age<0.5`, Sierp rosnący `<6.88`, Pierwsza kwadra `<7.88`, Garb rosnący `<14.27`, Pełnia `<15.27`, Garb malejący `<21.65`, Ostatnia kwadra `<22.65`, reszta Sierp malejący (gdzie `age` = dni od Nowiu, `SYNODIC=29.53058867`). Nazwy tych 8 faz ujednolicone 2026-08-29 w `index.html`/`fazy-ksiezyca.html`/`kartka-z-kalendarza.html` (wcześniej 3 różne słowa dla tej samej fazy, np. "Zanikający garb"/"Księżyc malejący"/"Ubywający garb"). Patrz też wzorzec bugów nr 3 wyżej (ta sama logika zduplikowana w 5 plikach).
- **"Wiek Księżyca" celowo różni się liczbowo między stronami — to NIE bug, świadoma decyzja 2026-08-29.** `index.html`/`kalendarz.html`/`kartka-z-kalendarza.html` liczą wiek/fazę dla stałego południa UTC danego dnia (spójny "wpis na dziś/na dany dzień" — sensowne, bo `kalendarz.html`/`kartka-z-kalendarza.html` pozwalają przeglądać dowolny dzień przeszły/przyszły, gdzie "teraz" nie ma znaczenia). `/fazy-ksiezyca.html` (główny widget na górze strony, z geolokalizacją i żywym wschodem/zachodem/kulminacją Księżyca) liczy dla `new Date()` — faktycznego bieżącego momentu. Różnica rzędu ułamka dnia w zależności od pory dnia odwiedzin jest oczekiwana i akceptowana — NIE ujednolicać przy przyszłych poprawkach bez wyraźnej prośby użytkownika.
