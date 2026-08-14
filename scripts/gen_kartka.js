// Naprawia kartka-z-kalendarza.html (podmienia sparse mini-bazy na prawdziwe dane)
// i generuje statyczne strony kartka/<mm>-<dd>/index.html (366 dni) dla SEO.
//
// Zrodla danych:
//  - imieniny.html -> NAMES (imieniny per dzien)
//  - index.html    -> HOLIDAYS (nietypowe swieta) + PROVERBS_DAILY/PROVERBS_MONTH_POOL/PROVERBS_ARR (przyslowia)
//  - swieta_data.js -> SWIETA_DATA (powazne swieta ze slugami)
//  - swieto_slugs.js -> ktore slugi maja gotowa strone /swieto/<slug>/
//
// Uzycie: node scripts/gen_kartka.js [--dry-run]

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const DRY = process.argv.includes('--dry-run');

function readFile(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/^﻿/, ''); }

// --- 1. NAMES z imieniny.html ---
const imieninyRaw = readFile('imieniny.html');
const namesMatch = imieninyRaw.match(/const NAMES=\r?\n(\[[\s\S]*?\r?\n\]);/);
if (!namesMatch) throw new Error('Nie znaleziono NAMES w imieniny.html');
const NAMES = eval(namesMatch[1]);
const nameMap = {}; // "m-d" -> [imiona]
for (const [m, d, names] of NAMES) {
  nameMap[`${m}-${d}`] = names;
}

// --- 2. HOLIDAYS (nietypowe) + PROVERBS_* z index.html ---
const indexRaw = readFile('index.html');
function extractConst(src, name) {
  const re = new RegExp(`const\\s+${name}\\s*=`);
  const m = src.match(re);
  if (!m) throw new Error(`Nie znaleziono ${name} w index.html`);
  const eq = m.index + m[0].length;
  // znajdz koniec instrukcji: srednik na poziomie zerowym nawiasow
  let depth = 0, i = eq;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '[' || c === '{' || c === '(') depth++;
    if (c === ']' || c === '}' || c === ')') depth--;
    if (c === ';' && depth === 0) break;
  }
  return src.slice(eq, i);
}
const HOLIDAYS = eval(extractConst(indexRaw, 'HOLIDAYS'));
const holidayMap = {}; // "m-d" -> [{name,tag}]
for (const [d, m, name, , tag] of HOLIDAYS) {
  (holidayMap[`${m}-${d}`] = holidayMap[`${m}-${d}`] || []).push({ name, tag });
}

const PROVERBS_DAILY = eval('(' + extractConst(indexRaw, 'PROVERBS_DAILY') + ')');
const PROVERBS_ARR = eval(extractConst(indexRaw, 'PROVERBS_ARR'));
// Odtworz PROVERBS_MONTH_POOL dokladnie jak w index.html
function getSeason(m) {
  if (m === 12 || m <= 2) return 'zima';
  if (m <= 5) return 'wiosna';
  if (m <= 8) return 'lato';
  return 'jesien';
}
const SEASON_MONTHS = { zima: [12, 1, 2], wiosna: [3, 4, 5], lato: [6, 7, 8], jesien: [9, 10, 11] };
const PROVERBS_MONTH_POOL = (function () {
  const pool = {};
  Object.entries(PROVERBS_DAILY).forEach(([key, arr]) => {
    const mo = parseInt(key.split('-')[1]);
    if (!pool[mo]) pool[mo] = [];
    arr.forEach(p => { if (!pool[mo].includes(p)) pool[mo].push(p); });
  });
  const extra = {
    1: ['Jedna jaskółka wiosny nie czyni.', 'Pasuje jak kwiatek do kożucha.'],
    2: ['Jedna jaskółka wiosny nie czyni.', 'Pasuje jak kwiatek do kożucha.'],
    3: ['Jedna jaskółka wiosny nie czyni.', 'Konia kują, żaba nogę podstawia.', 'Czyj nasiew, tego plon.'],
    4: ['Kwiecień plecień — bo przeplata trochę zimy, trochę lata.', 'Czyj nasiew, tego plon.', 'Kto sieje wiatr, ten zbiera burze.'],
    5: ['Czyj nasiew, tego plon.', 'Kto sieje jarke tatarke i proso, to chodzi boso.', 'Siejesz wiatr – zbierasz burze.'],
    6: ['Czyja kosa pierwsza, tego miedza szersza.', 'Na Alberta sianokosów pełna sterta.', 'Kto sieje wiatr, ten zbiera burze.'],
    7: ['Czyja kosa pierwsza, tego miedza szersza.', 'Na Alberta sianokosów pełna sterta.'],
    8: ['I kwaśne jabłko robak toczy.', 'Jakie jabłko, taka skórka, jaka matka, taka córka.', 'Czyja kosa pierwsza, tego miedza szersza.'],
    9: ['I kwaśne jabłko robak toczy.', 'Jakie jabłko, taka skórka, jaka matka, taka córka.', 'Czyj nasiew, tego plon.'],
    10: ['I kwaśne jabłko robak toczy.', 'Pasuje jak kwiatek do kożucha.'],
    11: ['Pasuje jak kwiatek do kożucha.', 'Jedna jaskółka wiosny nie czyni.'],
    12: ['Pasuje jak kwiatek do kożucha.', 'Jedna jaskółka wiosny nie czyni.'],
  };
  Object.entries(extra).forEach(([mo, arr]) => {
    arr.forEach(p => { if (!pool[mo].includes(p)) pool[mo].push(p); });
  });
  return pool;
})();

// --- 3. SWIETA_DATA (powazne swieta ze slugami) + HOLIDAYS_DB ze swieto.html (pelna baza, w tym partie tematyczne) ---
const swietaDataRaw = readFile('swieta_data.js');
const SWIETA_DATA = eval(extractConst(swietaDataRaw, 'SWIETA_DATA'));
const majorByName = {}; // nazwa -> slug
for (const [d, m, name, slug] of SWIETA_DATA) { majorByName[name] = slug; }
const swietoHtmlRaw = readFile('swieto.html');
const hdbStart = swietoHtmlRaw.indexOf('const HOLIDAYS_DB = {');
const hdbBraceStart = swietoHtmlRaw.indexOf('{', hdbStart);
let hdbDepth = 0, hdbI = hdbBraceStart;
for (; hdbI < swietoHtmlRaw.length; hdbI++) {
  if (swietoHtmlRaw[hdbI] === '{') hdbDepth++;
  if (swietoHtmlRaw[hdbI] === '}') { hdbDepth--; if (hdbDepth === 0) { hdbI++; break; } }
}
const HOLIDAYS_DB = eval('(' + swietoHtmlRaw.slice(hdbBraceStart, hdbI) + ')');
for (const [slug, entry] of Object.entries(HOLIDAYS_DB)) { majorByName[entry.name] = slug; }

// --- 4. swieto_slugs.js: ktore slugi maja gotowa strone ---
const swietoSlugsRaw = readFile('swieto_slugs.js');
const SWIETO_SLUGS = new Set(eval(swietoSlugsRaw.match(/new Set\((\[[\s\S]*?\])\)/)[1]));

// --- 4b. swieto_names.js: pelna mapa nazwa->slug (obejmuje tez ~1000 lekkich stron + aliasy) ---
const swietoNamesRaw = readFile('swieto_names.js');
const SWIETO_NAME_TO_SLUG = eval('(' + swietoNamesRaw.match(/const SWIETO_NAME_TO_SLUG=(\{[\s\S]*?\});/)[1] + ')');
Object.assign(majorByName, SWIETO_NAME_TO_SLUG);

// --- 4c. Funkcje astro (sun/moon/zodiac) wyciagniete z kalendarz.html — ten sam wzorzec
// co scripts/gen_kalendarz_miesiace.js (jedno zrodlo prawdy, brak duplikacji algorytmu). ---
const kalendarzRaw = readFile('kalendarz.html');
const astroFuncsStart = kalendarzRaw.indexOf('function pad(n)');
const astroFuncsEnd = kalendarzRaw.indexOf('function goToDay');
if (astroFuncsStart === -1 || astroFuncsEnd === -1) throw new Error('Nie znaleziono bloku funkcji sun/moon w kalendarz.html');
const astroFuncsCode = kalendarzRaw.slice(astroFuncsStart, astroFuncsEnd);
const astroSandbox = {};
vm.createContext(astroSandbox);
vm.runInContext(astroFuncsCode + '\nthis.__calc__ = { sunTimesFor, getMoonPhaseCompact, getSunZodiac };', astroSandbox);
const { sunTimesFor, getMoonPhaseCompact, getSunZodiac } = astroSandbox.__calc__;
const ASTRO_YEAR = 2026; // rok referencyjny do liczenia wschod/zachod/faza ksiezyca (te same daty co reszta strony)
// 29 lutego nie istnieje w 2026 (nie przestepny) - kalendarz.html liczy dzien roku jako
// mo[month-1]+day bez sprawdzania czy data istnieje w danym roku, wiec dla (2026,2,29) wyszlyby
// po cichu wartosci matematycznie tozsame z 1 marca. Uzywamy najblizszego roku przestepnego
// TYLKO dla tego jednego dnia, zeby liczba dni w roku (366) byla spojna z algorytmem.
function astroYearFor(m, d) { return (m === 2 && d === 29) ? 2028 : ASTRO_YEAR; }

// --- 5. Dla kazdego dnia roku (365 + 29 lutego) policz ostateczna liste przyslow (fallback jak w index.html) ---
const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; // luty z 29 (rok przestepny) dla kompletnosci
function proverbsFor(m, d, dayOfYearApprox) {
  const key = `${d}-${m}`;
  if (PROVERBS_DAILY[key]) return PROVERBS_DAILY[key];
  const monthPool = PROVERBS_MONTH_POOL[m] || [];
  const season = getSeason(m);
  const seasonPool = SEASON_MONTHS[season].filter(sm => sm !== m).flatMap(sm => PROVERBS_MONTH_POOL[sm] || []);
  const combined = [...monthPool, ...seasonPool];
  if (combined.length > 0) return [combined[(dayOfYearApprox - 1) % combined.length]];
  return [PROVERBS_ARR[(dayOfYearApprox - 1) % PROVERBS_ARR.length]];
}

function nameSlug(n) { return n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/[^a-z0-9-]/g, ''); }

const MONTH_GEN = ['', 'stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
const pad2 = n => String(n).padStart(2, '0');

// --- Zbuduj kompletne dane dla wszystkich 366 dni ---
const days = [];
let doy = 0;
for (let m = 1; m <= 12; m++) {
  for (let d = 1; d <= MONTH_DAYS[m - 1]; d++) {
    doy++;
    const key = `${m}-${d}`;
    days.push({
      m, d, key, doy,
      names: nameMap[key] || [],
      holidays: holidayMap[key] || [],
      proverbs: proverbsFor(m, d, doy),
    });
  }
}

console.log(`Zbudowano dane dla ${days.length} dni.`);
console.log(`Dni z imionami: ${days.filter(x => x.names.length).length}/${days.length}`);
console.log(`Dni ze swietami: ${days.filter(x => x.holidays.length).length}/${days.length}`);
console.log(`Dni z przyslowiem: ${days.filter(x => x.proverbs.length).length}/${days.length} (powinno byc 366/366 dzieki fallbackowi)`);

// ============================================================
// CZESC A: Podmien sparse bazy w kartka-z-kalendarza.html na prawdziwe
// ============================================================
function buildRealDbLiterals() {
  const namesObj = {};
  const holidaysObj = {};
  const proverbsObj = {};
  for (const day of days) {
    if (day.names.length) namesObj[day.key] = day.names;
    if (day.holidays.length) holidaysObj[day.key] = day.holidays.map(h => h.name);
    proverbsObj[day.key] = day.proverbs; // zawsze niepuste dzieki fallbackowi
  }
  return {
    namesLit: JSON.stringify(namesObj),
    holidaysLit: JSON.stringify(holidaysObj),
    proverbsLit: JSON.stringify(proverbsObj),
  };
}

function patchKartkaHtml() {
  let html = readFile('kartka-z-kalendarza.html');
  const { namesLit, holidaysLit, proverbsLit } = buildRealDbLiterals();

  const namesBlockRe = /(?:\/\/[^\r\n]*\r?\n)?const NAMES_DB = \{[\s\S]*?\};/;
  const proverbsBlockRe = /(?:\/\/[^\r\n]*\r?\n)?const PROVERBS_DB = \{[\s\S]*?\};/;
  const holidaysBlockRe = /(?:\/\/[^\r\n]*\r?\n)?const HOLIDAYS_DB = \{[\s\S]*?\};/;

  if (!namesBlockRe.test(html)) throw new Error('Nie znaleziono bloku NAMES_DB do podmiany');
  if (!proverbsBlockRe.test(html)) throw new Error('Nie znaleziono bloku PROVERBS_DB do podmiany');
  if (!holidaysBlockRe.test(html)) throw new Error('Nie znaleziono bloku HOLIDAYS_DB do podmiany');

  html = html.replace(namesBlockRe, `// Imieniny — pełna baza (zsynchronizowana z imieniny.html)\nconst NAMES_DB = ${namesLit};`);
  html = html.replace(proverbsBlockRe, `// Przysłowia — z fallbackiem dzień→miesiąc→pora roku (zsynchronizowane z index.html), każdy dzień ma wpis\nconst PROVERBS_DB = ${proverbsLit};`);
  html = html.replace(holidaysBlockRe, `// Święta — pełna baza nietypowych świąt (zsynchronizowana z index.html)\nconst HOLIDAYS_DB = ${holidaysLit};`);

  // renderDay() bierze provs[0]/[1] — z fallbackiem provs[1] czesto nie istnieje, to juz obsluzone w HTML.
  if (!DRY) fs.writeFileSync(path.join(ROOT, 'kartka-z-kalendarza.html'), html, 'utf8');
  console.log(`kartka-z-kalendarza.html ${DRY ? '(dry-run, nie zapisano)' : 'zaktualizowany'} — NAMES_DB/HOLIDAYS_DB/PROVERBS_DB podmienione na pelne dane.`);
}

// ============================================================
// CZESC B: Generuj statyczne strony kartka/<mm>-<dd>/index.html
// ============================================================
function esc(s) { return String(s).replace(/"/g, '&quot;'); }

// Serializuje obiekt do <script type="application/ld+json">, escapujac "<" jako \u003c
// zeby tresc nigdy nie mogla przedwczesnie zamknac tagu <script> (ten sam wzorzec co w
// gen_static_swieto_pages.js/gen_kalendarz_miesiace.js).
function jsonLdScript(obj) {
  return `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;
}

// Przycina opis do ~155 znakow (limit snippetu Google/Bing) na granicy slowa, z wielokropkiem.
function truncateDesc(str, maxLen = 155) {
  if (str.length <= maxLen) return str;
  const cut = str.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trim() + '…';
}

function buildStaticPage(day) {
  const { m, d } = day;
  const slug = `${pad2(m)}-${pad2(d)}`;
  const dateLabel = `${d} ${MONTH_GEN[m]}`;

  const namesHtml = day.names.length
    ? day.names.map(n => `<a href="/imieniny/${nameSlug(n)}/">${n}</a>`).join(', ')
    : 'brak danych o imieninach dla tego dnia';

  const holidaysHtml = day.holidays.length
    ? `<ul>${day.holidays.map(h => {
        const slugMajor = majorByName[h.name];
        const href = slugMajor && SWIETO_SLUGS.has(slugMajor) ? `/swieto/${slugMajor}/` : `/swieta-nietypowe.html?q=${encodeURIComponent(h.name)}`;
        return `<li><a href="${href}">${esc(h.name)}</a></li>`;
      }).join('')}</ul>`
    : '<p>Brak odnotowanych świąt tego dnia w bazie.</p>';

  const proverbHtml = day.proverbs.map(p => `<p>${esc(p)}</p>`).join('');

  const astroYear = astroYearFor(m, d);
  const sun = sunTimesFor(astroYear, m, d);
  const moon = getMoonPhaseCompact(astroYear, m, d);
  const zodiac = getSunZodiac(m, d);
  const astroHtml = `<p>Wschód słońca: <strong>${esc(sun.rise)}</strong> · Zachód: <strong>${esc(sun.set)}</strong> · Długość dnia: ${esc(sun.len)}</p><p>Faza księżyca: ${esc(moon.icon)} ${esc(moon.sign)} · Znak zodiaku: ${esc(zodiac)}</p>`;

  const metaDescParts = [];
  if (day.names.length) metaDescParts.push(`imieniny obchodzą ${day.names.slice(0, 3).join(', ')}`);
  if (day.holidays.length) metaDescParts.push(`${day.holidays.length} świąt i dni tematycznych`);
  metaDescParts.push(`wschód słońca o ${sun.rise}`);
  const metaDesc = truncateDesc(`${dateLabel}: ${metaDescParts.join(', ')}. Sprawdź, co przypada na ten dzień.`);

  const prevIdx = (day.doy - 2 + 366) % 366;
  const nextIdx = day.doy % 366;
  const prevSlugRef = days[prevIdx] ? `${pad2(days[prevIdx].m)}-${pad2(days[prevIdx].d)}` : null;
  const nextSlugRef = days[nextIdx] ? `${pad2(days[nextIdx].m)}-${pad2(days[nextIdx].d)}` : null;

  const pageUrl = `https://daybyday.today/kartka/${slug}/`;
  const breadcrumbItems = [
    { name: 'DaybyDay', url: 'https://daybyday.today/' },
    { name: 'Kartka z kalendarza', url: 'https://daybyday.today/kartka-z-kalendarza.html' },
    { name: dateLabel, url: pageUrl },
  ];
  const breadcrumbHtml = `<nav class="breadcrumb" aria-label="breadcrumb">${breadcrumbItems.map((it, i) => i === breadcrumbItems.length - 1 ? `<span>${esc(it.name)}</span>` : `<a href="${it.url}">${esc(it.name)}</a>`).join(' › ')}</nav>`;
  const articleLd = jsonLdScript({
    '@context': 'https://schema.org', '@type': 'Article',
    headline: `${dateLabel} — kartka z kalendarza`, description: metaDesc, url: pageUrl,
    inLanguage: 'pl', isPartOf: { '@type': 'WebSite', name: 'DaybyDay', url: 'https://daybyday.today/' },
  });
  const breadcrumbLd = jsonLdScript({
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: breadcrumbItems.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: it.url })),
  });

  return `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${dateLabel} — kartka z kalendarza | DaybyDay</title>
  <meta name="description" content="${esc(metaDesc)}">
  <link rel="canonical" href="${pageUrl}">
  <meta property="og:title" content="${dateLabel} — kartka z kalendarza | DaybyDay">
  <meta property="og:description" content="${esc(metaDesc)}">
  <meta property="og:url" content="${pageUrl}">
  <meta property="og:type" content="article">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  ${articleLd}
  ${breadcrumbLd}
  <script>(function(){var s=localStorage.getItem('dbd-theme');var p=window.matchMedia('(prefers-color-scheme:dark)').matches;document.documentElement.setAttribute('data-theme',s||(p?'dark':'light'));})();</script>
  <style>
    :root { --bg:#F8F7F5; --text:#1A1916; --muted2:#888; --border:#e5e3de; color-scheme: light dark; }
    [data-theme="dark"] { --bg:#111110; --text:#F0EDE8; --muted2:#8A8680; --border:#2C2A27; }
    body { font-family: Georgia, serif; max-width: 680px; margin: 2rem auto; padding: 0 1rem; color: var(--text); background: var(--bg); line-height: 1.7; }
    h1 { font-size: 2rem; margin-bottom: .25rem; }
    .breadcrumb { font-size: .8rem; color: var(--muted2); margin-bottom: 1rem; }
    .breadcrumb a { color: var(--muted2); }
    .breadcrumb a:hover { color: var(--text); }
    .section-label { font-size: .75rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--muted2); margin: 1.5rem 0 .5rem; }
    ul { padding-left: 1.2rem; }
    a { color: var(--text); }
    .daynav { display: flex; justify-content: space-between; margin-top: 2rem; font-size: .9rem; }
    #themeToggle { position: fixed; top: .75rem; right: .75rem; background: none; border: 1px solid var(--border); border-radius: 8px; width: 32px; height: 32px; cursor: pointer; font-size: 14px; color: var(--muted2); font-family: inherit; line-height: 1; display: flex; align-items: center; justify-content: center; }
    #themeToggle:hover { background: var(--border); }
    #themeToggle::before { content: '☾'; }
    [data-theme="dark"] #themeToggle::before { content: '☀'; }
  </style>
</head>
<body>
  <button id="themeToggle" onclick="var d=document.documentElement,t=d.getAttribute('data-theme')==='dark'?'light':'dark';d.setAttribute('data-theme',t);localStorage.setItem('dbd-theme',t);" aria-label="Przełącz tryb ciemny/jasny" title="Tryb ciemny/jasny"></button>
  ${breadcrumbHtml}
  <h1>${dateLabel}</h1>
  <div class="section-label">Imieniny</div>
  <p>${namesHtml}</p>
  <div class="section-label">Święta i wydarzenia</div>
  ${holidaysHtml}
  <div class="section-label">Wschód/zachód słońca i księżyc</div>
  ${astroHtml}
  <div class="section-label">Przysłowie na ten dzień</div>
  ${proverbHtml}
  <div class="daynav">
    ${prevSlugRef ? `<a href="/kartka/${prevSlugRef}/">← poprzedni dzień</a>` : '<span></span>'}
    ${nextSlugRef ? `<a href="/kartka/${nextSlugRef}/">następny dzień →</a>` : '<span></span>'}
  </div>
  <p><a href="/kartka-z-kalendarza.html?date=${ASTRO_YEAR}-${pad2(m)}-${pad2(d)}">Zobacz jako interaktywną kartę →</a></p>
  <p><a href="/">← DaybyDay</a></p>
</body>
</html>
`;
}

// Kompaktowa, osadzalna wersja karty dnia (do <iframe> na obcych stronach) — cel: backlink z
// serwisów, ktore wstawia widget u siebie (ten sam wzorzec co "Kartka z kalendarza na dzis" u
// kalendarzswiat.pl, potwierdzony jako duze zrodlo ich backlinkow przez Bing Webmaster Tools).
function buildWidgetPage(day) {
  const { m, d } = day;
  const slug = `${pad2(m)}-${pad2(d)}`;
  const dateLabel = `${d} ${MONTH_GEN[m]}`;

  const namesHtml = day.names.length
    ? day.names.slice(0, 6).map(n => `<a href="https://daybyday.today/imieniny/${nameSlug(n)}/" target="_top">${esc(n)}</a>`).join(', ')
    : '—';

  let holidayHtml = '';
  if (day.holidays.length) {
    const h = day.holidays[0];
    const slugMajor = majorByName[h.name];
    const href = slugMajor && SWIETO_SLUGS.has(slugMajor)
      ? `https://daybyday.today/swieto/${slugMajor}/`
      : `https://daybyday.today/swieta-nietypowe.html?q=${encodeURIComponent(h.name)}`;
    holidayHtml = `<div class="label">Dziś obchodzimy</div><div><a href="${href}" target="_top">${esc(h.name)}</a></div>`;
  }

  return `<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${dateLabel} — DaybyDay</title>
<meta name="robots" content="noindex, nofollow">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: transparent; }
  body { font-family: Georgia, serif; color: #1A1916; padding: 14px 16px; font-size: 14px; line-height: 1.5; }
  .card { border: 1px solid #E8E5E0; border-radius: 12px; padding: 14px 16px; background: #FFFFFF; }
  .date { font-size: 1.35rem; font-weight: 600; margin-bottom: .4rem; }
  .label { font-size: .66rem; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; color: #8A8680; margin: .65rem 0 .2rem; }
  a { color: #1A1916; }
  .brand { display: block; margin-top: .75rem; padding-top: .6rem; border-top: 1px solid #E8E5E0; font-size: .7rem; color: #8A8680; text-decoration: none; font-family: Georgia, serif; }
  .brand b { color: #1A1916; }
</style>
</head>
<body>
  <div class="card">
    <div class="date">${dateLabel}</div>
    <div class="label">Imieniny</div>
    <div>${namesHtml}</div>
    ${holidayHtml}
    <a class="brand" href="https://daybyday.today/kartka/${slug}/" target="_top">Kartka z kalendarza — <b>DaybyDay.today</b></a>
  </div>
</body>
</html>
`;
}

function genStaticPages() {
  let written = 0;
  let widgetsWritten = 0;
  for (const day of days) {
    const slug = `${pad2(day.m)}-${pad2(day.d)}`;
    const folder = path.join(ROOT, 'kartka', slug);
    if (!DRY && !fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
    const filePath = path.join(folder, 'index.html');
    const page = buildStaticPage(day);
    const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
    if (existing !== page) {
      if (!DRY) fs.writeFileSync(filePath, page, 'utf8');
      written++;
    }

    const widgetFolder = path.join(folder, 'widget');
    if (!DRY && !fs.existsSync(widgetFolder)) fs.mkdirSync(widgetFolder, { recursive: true });
    const widgetPath = path.join(widgetFolder, 'index.html');
    const widgetPage = buildWidgetPage(day);
    const widgetExisting = fs.existsSync(widgetPath) ? fs.readFileSync(widgetPath, 'utf8') : '';
    if (widgetExisting !== widgetPage) {
      if (!DRY) fs.writeFileSync(widgetPath, widgetPage, 'utf8');
      widgetsWritten++;
    }
  }
  console.log(`Statyczne strony /kartka/*/: ${written} zapisanych/zmienionych z ${days.length} (${DRY ? 'DRY RUN' : 'zapisano'}).`);
  console.log(`Widgety /kartka/*/widget/: ${widgetsWritten} zapisanych/zmienionych z ${days.length} (${DRY ? 'DRY RUN' : 'zapisano'}). Nie w sitemap (noindex, przeznaczone do osadzania).`);

  // kartka_slugs.js
  const allSlugs = days.map(d => `${pad2(d.m)}-${pad2(d.d)}`).sort();
  const slugsContent = `// Lista slugow /kartka/<mm-dd>/ (366 dni) — wszystkie zawsze istnieja.\nconst KARTKA_SLUGS=new Set(${JSON.stringify(allSlugs)});\n`;
  if (!DRY) fs.writeFileSync(path.join(ROOT, 'kartka_slugs.js'), slugsContent, 'utf8');
  console.log(`kartka_slugs.js ${DRY ? '(dry-run, nie zapisano)' : 'zapisany'}.`);

  // sitemap-kartka.xml
  const urls = days.map(d => `  <url><loc>https://daybyday.today/kartka/${pad2(d.m)}-${pad2(d.d)}/</loc><changefreq>yearly</changefreq><priority>0.5</priority></url>`).join('\n');
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  if (!DRY) fs.writeFileSync(path.join(ROOT, 'sitemap-kartka.xml'), sitemap, 'utf8');
  console.log(`sitemap-kartka.xml ${DRY ? '(dry-run, nie zapisano)' : 'zapisany'} (366 URLi).`);
}

// ============================================================
main();
function main() {
  patchKartkaHtml();
  genStaticPages();
}
