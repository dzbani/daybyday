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

  const metaDescParts = [];
  if (day.names.length) metaDescParts.push(`imieniny obchodzą ${day.names.slice(0, 3).join(', ')}`);
  if (day.holidays.length) metaDescParts.push(`${day.holidays.length} świąt i dni tematycznych`);
  metaDescParts.push('przysłowie ludowe na ten dzień');
  const metaDesc = `${dateLabel}: ${metaDescParts.join(', ')}. Sprawdź, co przypada na ten dzień.`;

  const prevIdx = (day.doy - 2 + 366) % 366;
  const nextIdx = day.doy % 366;
  const prevSlugRef = days[prevIdx] ? `${pad2(days[prevIdx].m)}-${pad2(days[prevIdx].d)}` : null;
  const nextSlugRef = days[nextIdx] ? `${pad2(days[nextIdx].m)}-${pad2(days[nextIdx].d)}` : null;

  return `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${dateLabel} — kartka z kalendarza | DaybyDay</title>
  <meta name="description" content="${esc(metaDesc)}">
  <link rel="canonical" href="https://daybyday.today/kartka/${slug}/">
  <meta property="og:title" content="${dateLabel} — kartka z kalendarza | DaybyDay">
  <meta property="og:description" content="${esc(metaDesc)}">
  <meta property="og:url" content="https://daybyday.today/kartka/${slug}/">
  <meta property="og:type" content="article">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <script>(function(){var s=localStorage.getItem('dbd-theme');var p=window.matchMedia('(prefers-color-scheme:dark)').matches;document.documentElement.setAttribute('data-theme',s||(p?'dark':'light'));})();</script>
  <style>
    :root { --bg:#F8F7F5; --text:#1A1916; --muted2:#888; --border:#e5e3de; color-scheme: light dark; }
    [data-theme="dark"] { --bg:#111110; --text:#F0EDE8; --muted2:#8A8680; --border:#2C2A27; }
    body { font-family: Georgia, serif; max-width: 680px; margin: 2rem auto; padding: 0 1rem; color: var(--text); background: var(--bg); line-height: 1.7; }
    h1 { font-size: 2rem; margin-bottom: .25rem; }
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
  <h1>${dateLabel}</h1>
  <div class="section-label">Imieniny</div>
  <p>${namesHtml}</p>
  <div class="section-label">Święta i wydarzenia</div>
  ${holidaysHtml}
  <div class="section-label">Przysłowie na ten dzień</div>
  ${proverbHtml}
  <div class="daynav">
    ${prevSlugRef ? `<a href="/kartka/${prevSlugRef}/">← poprzedni dzień</a>` : '<span></span>'}
    ${nextSlugRef ? `<a href="/kartka/${nextSlugRef}/">następny dzień →</a>` : '<span></span>'}
  </div>
  <p><a href="/kartka-z-kalendarza.html?date=2026-${pad2(m)}-${pad2(d)}">Pełne informacje (wschód/zachód słońca, faza księżyca) →</a></p>
  <p><a href="/">← DaybyDay</a></p>
</body>
</html>
`;
}

function genStaticPages() {
  let written = 0;
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
  }
  console.log(`Statyczne strony /kartka/*/: ${written} zapisanych/zmienionych z ${days.length} (${DRY ? 'DRY RUN' : 'zapisano'}).`);

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
