# DaybyDay (daybyday.today)

Statyczna strona (HTML/CSS/JS, bez frameworka i buildu) hostowana na GitHub Pages. Polski kalendarz/kalkulatory/astrologia/statystyki. Każda strona ma własne, samodzielne `<style>`/`<script>` — brak wspólnego bundla.

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

1. **Strony narzędziowe/interaktywne** (kalkulatory.html, kalendarz.html, znaki-zodiaku.html, kalendarz-liturgiczny.html, widget-*.html, ranking-imion.html itd.): pełny `<nav class="topnav">` z: 5 linków (Główna/Imieniny/Święta/Liturgiczny/Kalkulatory), `#fontToggle` (cykl normal→large→xl, `data-font` na `<html>`, localStorage `dbd-font`), `#themeToggle` (localStorage `dbd-theme`), `.nav-burger` (mobile), cookie banner, rejestracja `sw.js`.
2. **Strony treściowe/generowane** (`/swieto/*`, `/imieniny/*`, `/swieta-liturgiczne/*`): lżejszy `<nav class="topnav">` — te same 5 linków + `#themeToggle`, ale BEZ font-togglea, BEZ burgera, BEZ cookie banneru, BEZ SW. Dodatkowo breadcrumb (`<nav class="breadcrumb">`) i CSS `:root{--bg;--text;--muted;--muted2;--border}` + `[data-theme="dark"]`.

**Znany, powtarzający się bug:** nowe strony treściowe czasem powstają z całkowicie bez nawigacji / bez trybu ciemnego (sztywny `color-scheme:light`, kolory hex zamiast zmiennych). Stwierdzone dwukrotnie: raz w `/imieniny/<slug>/` bez wpisu w `NAME_DESCRIPTIONS_RICH` (naprawione `scripts/fix_dark_mode_lite_pages.js`), raz we wszystkich 22 `/swieta-liturgiczne/*` (2026-08-25). **Przy każdej nowej stronie treściowej sprawdź od razu, czy ma któryś z dwóch szablonów wyżej — nie zakładaj, że ma.**

## Service Worker (`sw.js`)

`const CACHE = 'daybyday-vNNN'` — network-first dla nawigacji (`mode:'navigate'`), cache-first dla reszty zasobów. **Bump numeru wersji przy KAŻDEJ zmianie inline JS/CSS na stronie, która rejestruje SW** (`if("serviceWorker" in navigator)navigator.serviceWorker.register("sw.js")`), inaczej powracający użytkownicy dostaną starą wersję z cache. Strony treściowe (`/swieto/*`, `/imieniny/*`, `/swieta-liturgiczne/*`) nie rejestrują SW — nie dotyczy ich.

## Dwa powtarzające się wzorce bugów (sprawdzaj proaktywnie w nowym kodzie)

1. **"Zamrożenie po dacie granicznej"** — hardkodowane dane/tablice z datami (np. `NEW_MOONS`, `EVENTS` roku szkolnego) używane do "co dziś/co następne" bez algorytmicznego liczenia — po minięciu ostatniej daty w tablicy strona pokazuje cichą, fałszywą odpowiedź zamiast błędu. Warianty: (a) licznik pokazujący "0" na zawsze, (b) wartość dryfująca w błędny zakres z aktywnie mylącym fallbackiem, (c) całkiem statyczny HTML bez korekcyjnego JS, (d) ostatni wpis w danych bez "następnego" sąsiada (puste pole zamiast błędu). Napraw przez algorytmiczne obliczanie z `new Date()`, nie przez dopisywanie kolejnego roku do tablicy.
2. **Mieszanie UTC z lokalną strefą czasową** — `new Date("YYYY-MM-DD")` z `<input type="date">` parsuje się jako północ UTC, ale późniejsze `getDate()/getDay()/setDate()` czytają w strefie LOKALNEJ przeglądarki. Dla widza w strefie na zachód od UTC (USA/Kanada — spora część polskiej diaspory) to przesuwa wynik o cały dzień. Napraw budując datę numerycznym konstruktorem: `new Date(y, m-1, d)` (zawsze lokalny, poprawny niezależnie od strefy widza) zamiast parsowania stringa.

## Weryfikacja danych kalendarzowych/astronomicznych

- Wielkanoc: algorytm Meeusa/Jonesa/Butchera (użyty w wielu plikach, zweryfikowany).
- Wniebowstąpienie w Polsce: Wielkanoc+42 (niedziela), NIE +39 (tradycyjny czwartek) — decyzja Kongregacji ds. Kultu Bożego z 2004 r.
- Wigilia (24 grudnia) jest ustawowym dniem wolnym od pracy od 2025 r. (Dz.U. 2024 poz. 1965) — jeśli coś twierdzi inaczej, to nieaktualne.
- Przy dowolnej dacie/algorytmie liturgicznym/astronomicznym: zawsze przelicz niezależnie (własna implementacja) I porównaj z zewnętrznym źródłem — pojedyncze źródło (nawet zgodne) bywa samo nieaktualne lub błędne.
