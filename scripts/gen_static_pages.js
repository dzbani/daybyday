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

// --- 0. Wczytaj NAME_GENITIVE (dopelniacz, uzupelniany partiami - fallback: mianownik) ---
let genitiveRaw = fs.readFileSync(path.join(ROOT, 'name_genitive.js'), 'utf8').replace(/^﻿/, '');
const genitiveSandbox = {};
vm.createContext(genitiveSandbox);
vm.runInContext(genitiveRaw + '\nthis.__RESULT__ = NAME_GENITIVE;', genitiveSandbox);
const NAME_GENITIVE = genitiveSandbox.__RESULT__;

// --- 1. Wczytaj NAME_DESCRIPTIONS_RICH ---
let richRaw = fs.readFileSync(path.join(ROOT, 'name_descriptions_rich.js'), 'utf8').replace(/^﻿/, '');
const richSandbox = {};
vm.createContext(richSandbox);
vm.runInContext(richRaw + '\nthis.__RESULT__ = NAME_DESCRIPTIONS_RICH;', richSandbox);
const RICH = richSandbox.__RESULT__;

// --- 1b. Wczytaj NAME_TRENDS (nadania noworodkom 2000-2025, dane.gov.pl) ---
let trendsRaw = fs.readFileSync(path.join(ROOT, 'name_trends.js'), 'utf8').replace(/^﻿/, '');
const trendsSandbox = {};
vm.createContext(trendsSandbox);
vm.runInContext(trendsRaw + '\nthis.__RESULT__ = NAME_TRENDS;', trendsSandbox);
const NAME_TRENDS = trendsSandbox.__RESULT__;

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

// --- 4b. Zbuduj mapę odwrotną: "m-d" -> lista imion obchodzonych tego dnia
// (do sekcji "kto jeszcze obchodzi imieniny tego dnia" na stronie imienia) ---
const dayNames = {};
for (const [m, d, names] of NAMES) {
  dayNames[`${m}-${d}`] = names;
}

function nameSlug(n) {
  return n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/[^a-z0-9-]/g, '');
}
function normalize(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
}

const MONTH_NAMES_GEN = ['', 'stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
const MONTH_SLUGS = ['', 'styczen', 'luty', 'marzec', 'kwiecien', 'maj', 'czerwiec', 'lipiec', 'sierpien', 'wrzesien', 'pazdziernik', 'listopad', 'grudzien'];
const MONTH_NAMES_LOC = ['', 'Styczniu', 'Lutym', 'Marcu', 'Kwietniu', 'Maju', 'Czerwcu', 'Lipcu', 'Sierpniu', 'Wrześniu', 'Październiku', 'Listopadzie', 'Grudniu'];
const PATRON_HEADERS = ['Patron', 'Święty patron', 'Święta patronka', 'Święci patroni', 'Święte patronki'];

// Nagłówki sekcji z imieniem (frazy typu "znaczenie imienia Maciej", "pochodzenie imienia Maciej"). Zmiana tylko w HTML
// strony: wpisy w NAME_DESCRIPTIONS_RICH zostają z <h3>Znaczenie imienia</h3> (po nich rozpoznaje sekcje reszta generatora).
const SECTION_HEADING = {
  'Znaczenie imienia': n => 'Znaczenie i pochodzenie imienia ' + n,
  'Historia': n => 'Historia imienia ' + n,
  'Zdrobnienia': n => 'Zdrobnienia imienia ' + n,
};
function transformRich(html, name) {
  // Etykiety sekcji to nagłówki <h2> (hierarchia h1 > h2 bez przeskoku); wygląd ustala klasa .name-desc-label
  return html
    .replace(/<h3>([^<]*)<\/h3>/g, (m, t) => '<h3>' + (SECTION_HEADING[t] ? SECTION_HEADING[t](name) : t) + '</h3>')
    .replace(/<h3>/g, '<h2 class="name-desc-label">').replace(/<\/h3>/g, '</h2>');
}

// Serializuje obiekt do <script type="application/ld+json">, escapujac "<" jako \u003c
// zeby tresc (np. cudzysłowy/HTML w opisie) nigdy nie mogla przedwczesnie zamknac tagu <script>.
function jsonLdScript(obj) {
  return `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;
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

// --- 5b. Uniwersum imion, które faktycznie dostają własną stronę (folder + daty + opis) —
// potrzebne do nawigacji poprzednie/następne (pełny alfabetyczny pierścień) i do odfiltrowania
// z "kto jeszcze obchodzi imieniny tego dnia" imion bez wygenerowanej strony (kolizje slugów,
// brak opisu w RICH). Kryteria muszą być identyczne z tym, co realnie generuje buildPage().
const allValidNames = Object.values(slugOwner).filter(name => {
  const slug = nameSlug(name);
  return !!RICH[name] && fs.existsSync(path.join(ROOT, 'imieniny', slug)) && (dateMap[name] || []).length > 0;
});
const allValidNamesSet = new Set(allValidNames);
const sortedAllNames = [...allValidNames].sort((a, b) => a.localeCompare(b, 'pl'));
const prevNextMap = {};
sortedAllNames.forEach((name, i) => {
  prevNextMap[name] = {
    prev: sortedAllNames[(i - 1 + sortedAllNames.length) % sortedAllNames.length],
    next: sortedAllNames[(i + 1) % sortedAllNames.length],
  };
});

// Skopiowane 1:1 z imieniny.html (buildTrendChart/trendOdmiana/buildTrendNarrative) -
// ta sama logika renderowania wykresu trendu popularnosci, tylko uruchamiana w Node
// przy generowaniu statycznych stron zamiast w przegladarce.
function buildTrendChart(name) {
  if (typeof NAME_TRENDS === 'undefined' || !NAME_TRENDS[name]) return '';
  const data = NAME_TRENDS[name];
  const years = [];
  for (let y = 2000; y <= 2025; y++) years.push(y);
  const vals = years.map(y => data[y] || 0);
  const maxVal = Math.max(...vals);
  if (maxVal === 0) return '';

  const W = 320, H = 110, PL = 42, PR = 12, PT = 14, PB = 28;
  const cW = W - PL - PR, cH = H - PT - PB;

  const xPos = i => PL + (i / (years.length - 1)) * cW;
  const yPos = v => PT + cH - (v / maxVal) * cH;

  // Line path
  const pts = vals.map((v, i) => `${xPos(i).toFixed(1)},${yPos(v).toFixed(1)}`);
  const linePath = 'M' + pts.join('L');

  // Fill path
  const fillPath = linePath + `L${xPos(years.length-1).toFixed(1)},${(PT+cH).toFixed(1)}L${xPos(0).toFixed(1)},${(PT+cH).toFixed(1)}Z`;

  // Y-axis labels (max and ~half)
  const yLabels = [
    { v: maxVal, y: yPos(maxVal) },
    { v: Math.round(maxVal / 2), y: yPos(maxVal / 2) },
    { v: 0, y: yPos(0) }
  ];

  // Dots and x-labels only every 5 years (+ first/last) - 25 punktów byłoby za gęste
  const lastIdx = years.length - 1;
  const labelIdx = years.map((y, i) => (y % 5 === 0 || i === lastIdx) ? i : -1).filter(i => i >= 0);
  const dots = labelIdx.map(i => `<circle cx="${xPos(i).toFixed(1)}" cy="${yPos(vals[i]).toFixed(1)}" r="2.5" fill="var(--accent,#2563eb)" stroke="white" stroke-width="1.5"/>`).join('');
  const xLabels = labelIdx.map(i => `<text x="${xPos(i).toFixed(1)}" y="${H-6}" text-anchor="middle" font-size="10" fill="var(--muted)">${years[i]}</text>`).join('');
  const yLabelsSvg = yLabels.map(l => `<text x="${PL-5}" y="${l.y+3}" text-anchor="end" font-size="9" fill="var(--muted)">${l.v >= 1000 ? (l.v/1000).toFixed(l.v%1000===0?0:1)+'k' : l.v}</text>`).join('');
  const gridLines = yLabels.map(l => `<line x1="${PL}" y1="${l.y.toFixed(1)}" x2="${W-PR}" y2="${l.y.toFixed(1)}" stroke="var(--border)" stroke-width="0.5"/>`).join('');

  const narrative = buildTrendNarrative(name, vals, years);

  return `<div style="margin:1rem 0;padding:1rem;background:var(--tag-bg);border-radius:8px">
    <h2 style="font-size:.72rem;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin:0 0 .6rem">Trend popularności (nadania nowych imion 2000–2025)</h2>
    <svg viewBox="0 0 ${W} ${H}" width="100%" style="overflow:visible;display:block">
      <defs><linearGradient id="tg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--accent,#2563eb)" stop-opacity="0.18"/><stop offset="100%" stop-color="var(--accent,#2563eb)" stop-opacity="0.02"/></linearGradient></defs>
      ${gridLines}
      <path d="${fillPath}" fill="url(#tg)"/>
      <path d="${linePath}" fill="none" stroke="var(--accent,#2563eb)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      ${dots}
      ${xLabels}
      ${yLabelsSvg}
    </svg>
    <div style="font-size:.7rem;color:var(--muted);margin-top:.25rem">źródło: dane.gov.pl · imiona pierwsze nadawane noworodkom</div>
    ${narrative ? `<div style="font-size:.85rem;line-height:1.6;color:var(--text);margin-top:.85rem;padding-top:.85rem;border-top:1px solid var(--border)">${narrative}</div>` : ''}
  </div>`;
}

function trendOdmiana(n) { return n === 1 ? 'raz' : 'razy'; }

function buildTrendNarrative(name, vals, years) {
  const val2000 = vals[0], val2024 = vals[vals.length - 1];
  const lastYear = years[years.length - 1];
  let peakVal = -1, peakYear = years[0];
  vals.forEach((v, i) => { if (v > peakVal) { peakVal = v; peakYear = years[i]; } });
  const firstYear = years[vals.findIndex(v => v > 0)];
  const pct = val2000 > 0 ? Math.round((val2024 - val2000) / val2000 * 100) : null;
  const fmt = n => n.toLocaleString('pl-PL');

  let sentence;

  if (val2000 === 0 && val2024 === 0 && peakVal >= 2 && peakYear > 2000 && peakYear < lastYear) {
    return `W danych o nadaniach imion z lat 2000–${lastYear} imię <strong>${name}</strong> pojawiło się dopiero w ${firstYear} roku, szczyt osiągnęło w ${peakYear} roku (${fmt(peakVal)} ${trendOdmiana(peakVal)}), po czym niemal całkowicie zniknęło z użycia.`;
  } else if (val2000 === 0 && val2024 >= 5 && firstYear > 2000) {
    sentence = `W danych o nadaniach imion z lat 2000–${lastYear} imię <strong>${name}</strong> pojawia się dopiero od ${firstYear} roku, a w ${lastYear} roku otrzymało je już ${fmt(val2024)} ${trendOdmiana(val2024)}.`;
  } else if (val2000 >= 10 && val2024 <= 2) {
    sentence = `W ciągu ostatnich ${lastYear - 2000} lat imię <strong>${name}</strong> niemal całkowicie zniknęło z polskich metryk — w 2000 roku nadano je ${fmt(val2000)} ${trendOdmiana(val2000)}, a w ${lastYear} roku zaledwie ${fmt(val2024)} ${trendOdmiana(val2024)}.`;
  } else if (val2000 >= 10 && pct !== null && pct <= -50) {
    sentence = `W ciągu ostatnich ${lastYear - 2000} lat popularność imienia <strong>${name}</strong> drastycznie spadła — w 2000 roku nadano je ${fmt(val2000)} ${trendOdmiana(val2000)}, podczas gdy w ${lastYear} roku już tylko ${fmt(val2024)} ${trendOdmiana(val2024)} (spadek o ${Math.abs(pct)}%).`;
  } else if (val2000 >= 10 && pct !== null && pct <= -20) {
    sentence = `Popularność imienia <strong>${name}</strong> systematycznie maleje — z ${fmt(val2000)} ${trendOdmiana(val2000)} w 2000 roku do ${fmt(val2024)} ${trendOdmiana(val2024)} w ${lastYear} roku, czyli spadek o ${Math.abs(pct)}%.`;
  } else if (val2000 >= 3 && pct !== null && pct >= 100) {
    const multiplier = val2024 / val2000;
    const growthText = multiplier >= 3 ? `niemal ${Math.round(multiplier)}-krotnie` : `o ${pct}%`;
    const zaledwie = val2000 < 500 ? 'zaledwie ' : '';
    sentence = `Popularność imienia <strong>${name}</strong> gwałtownie wzrosła w ciągu ostatnich ${lastYear - 2000} lat — z ${zaledwie}${fmt(val2000)} ${trendOdmiana(val2000)} w 2000 roku do ${fmt(val2024)} ${trendOdmiana(val2024)} w ${lastYear} roku (wzrost ${growthText}).`;
  } else if (val2000 >= 3 && pct !== null && pct >= 30) {
    sentence = `Imię <strong>${name}</strong> zyskuje na popularności — w 2000 roku nadano je ${fmt(val2000)} ${trendOdmiana(val2000)}, a w ${lastYear} roku już ${fmt(val2024)} ${trendOdmiana(val2024)}.`;
  } else {
    sentence = `Popularność imienia <strong>${name}</strong> pozostaje względnie stabilna od 2000 roku — wtedy nadano je ${fmt(val2000)} ${trendOdmiana(val2000)}, a w ${lastYear} roku ${fmt(val2024)} ${trendOdmiana(val2024)}.`;
  }

  if (peakYear !== 2000 && peakYear !== lastYear && peakVal >= Math.max(val2000, val2024, 5) * 1.4) {
    sentence += ` Szczyt popularności imię osiągnęło w ${peakYear} roku, gdy nadano je ${fmt(peakVal)} ${trendOdmiana(peakVal)}.`;
  }

  return sentence;
}

// Warianty pisowni tego samego imienia dzielace slug (Jarmila/Jarmiła, Lucjan/Łucjan): jedna strona
// /imieniny/<slug>/ na wszystkie warianty. Wlasciciel sluga = imie z RICH (patrz slugOwner), a gdy
// zadne nie ma RICH - pierwszy alfabetycznie. Strona wlasciciela pokazuje SUME dat wszystkich
// wariantow (np. Jarmila 4 lutego + Jarmiła 14 marca) - wczesniej tylko daty wlasnego zapisu, wiec
// link z kalendarza dla drugiego wariantu prowadzil do strony bez jego daty (audyt 7.10.2026).
const variantsBySlug = {};
for (const n of Object.keys(dateMap)) (variantsBySlug[nameSlug(n)] = variantsBySlug[nameSlug(n)] || []).push(n);
function slugOwnerOf(slug) {
  return slugOwner[slug] || (variantsBySlug[slug] || []).slice().sort()[0];
}

function buildPage(name) {
  const ownerName = slugOwnerOf(nameSlug(name));
  if (ownerName && ownerName !== name) return null; // wariant pisowni - strone buduje wlasciciel sluga
  const variants = (variantsBySlug[nameSlug(name)] || [name]).filter(v => v !== name);
  const datesSeen = new Set();
  const dates = [name, ...variants].flatMap(v => dateMap[v] || [])
    .filter(x => { const k = x.m + "-" + x.d; if (datesSeen.has(k)) return false; datesSeen.add(k); return true; })
    .sort((a, b) => a.m !== b.m ? a.m - b.m : a.d - b.d);
  if (!dates.length) return null;
  const rich = RICH[name];
  // Imiona bez wpisu w NAME_DESCRIPTIONS_RICH (zwykle brak realnych nosicieli) nadal dostają
  // stronę - okrojoną (bez sekcji Znaczenie/Historia/Patron/wykresu popularności), ale ZAWSZE
  // z pełną nawigacją (topnav/breadcrumb/link do miesiąca/współsolenizanci). Naprawia bug
  // "strona-kikut bez żadnej nawigacji" (CLAUDE.md, audyt 2026-08-31: Optat/Prymian/
  // Solidariusz/Teodot). Nawigacja poprzednie/następne zostaje pominięta dla takich imion -
  // pierścień alfabetyczny (prevNextMap) obejmuje tylko imiona z RICH, żeby nie przesuwać
  // wskaźników prev/next na wszystkich sąsiednich, już poprawnych stronach.

  const datesStr = dates.map(x => `${x.d} ${MONTH_NAMES_GEN[x.m]}`).join(', ');
  const metaDatesStr = dates.length > 3
    ? dates.slice(0, 3).map(x => `${x.d} ${MONTH_NAMES_GEN[x.m]}`).join(', ') + ' i inne'
    : datesStr;
  const freqStr = dates.length === 1 ? 'raz w roku' : `${dates.length} razy w roku`;
  const descHtml = rich ? transformRich(rich, name) : '';
  const trendHtml = buildTrendChart(name);
  const genitive = NAME_GENITIVE[name] || name;
  const richHasPatron = !!rich && PATRON_HEADERS.some(h => rich.includes('<h3>' + h + '</h3>'));
  const dbEntry = NAME_DB[normalize(name)];
  // Opis meta obiecuje wyłącznie sekcje, które strona faktycznie ma (wcześniej: "życzenia imieninowe" bez takiej sekcji)
  const hasSec = h => !!rich && rich.includes('<h3>' + h + '</h3>');
  const promised = [
    hasSec('Znaczenie imienia') && 'znaczenie imienia',
    hasSec('Historia') && 'historię',
    hasSec('Zdrobnienia') && 'zdrobnienia',
    (richHasPatron || (dbEntry && dbEntry.patron)) && 'świętych patronów',
  ].filter(Boolean);
  const promisedStr = promised.length > 1 ? promised.slice(0, -1).join(', ') + ' i ' + promised[promised.length - 1] : promised[0];
  const metaDesc = `${name} obchodzi imieniny ${freqStr}: ${metaDatesStr}. ${promisedStr ? `Sprawdź ${promisedStr}.` : 'Zobacz, kto jeszcze obchodzi imieniny tego dnia.'}`;
  // Odliczanie do najbliższych imienin liczy przeglądarka z new Date() (strona jest statyczna, więc bez zamrożenia po dacie granicznej)
  const cdDates = dates.map(x => `${x.m}-${x.d}`).join(',');
  const countdownHtml = `<p class="countdown" id="cd" data-dates="${cdDates}" data-name="${name.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"></p>`;
  // Dodawanie do kalendarza: Google Calendar (wydarzenie całodniowe powtarzane co roku, link per data) i plik .ics ze wszystkimi
  // datami (tworzony w przeglądarce — bez tysięcy plików w repozytorium). Rok startu liczy przeglądarka (najbliższe wystąpienie);
  // statyczny href (bez JS) używa roku generowania.
  const calTitle = 'Imieniny ' + genitive, calUrl = 'https://daybyday.today/imieniny/' + nameSlug(name) + '/';
  const calYear = new Date().getFullYear();
  const calYmd = dt => dt.getUTCFullYear() + String(dt.getUTCMonth() + 1).padStart(2, '0') + String(dt.getUTCDate()).padStart(2, '0');
  const gcalHref = x => 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(calTitle)
    + '&dates=' + calYmd(new Date(Date.UTC(calYear, x.m - 1, x.d))) + '/' + calYmd(new Date(Date.UTC(calYear, x.m - 1, x.d + 1)))
    + '&details=' + encodeURIComponent(calUrl) + '&recur=' + encodeURIComponent('RRULE:FREQ=YEARLY') + '&trp=false';
  const attr = v => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const calAddHtml = '\n  <div class="cal-add">\n    <h2 class="name-desc-label">Dodaj imieniny do kalendarza</h2>\n    <p>Wydarzenie całodniowe powtarzane co roku. Google Calendar:</p>\n    <div class="cal-chips">'
    + dates.map(x => '<a class="cal-chip" data-m="' + x.m + '" data-d="' + x.d + '" href="' + attr(gcalHref(x)) + '" target="_blank" rel="noopener">' + x.d + ' ' + MONTH_NAMES_GEN[x.m] + '</a>').join('')
    + '</div>\n    <div id="icsWrap" hidden>\n      <p>Apple Kalendarz, Outlook i inne programy (jeden plik ze wszystkimi datami):</p>\n      <div class="cal-chips"><button type="button" class="cal-chip" id="icsBtn">Pobierz plik .ics</button></div>\n    </div>\n  </div>';
  const jsStr = v => JSON.stringify(v).replace(/</g, '\\u003c');
  const countdownScript = '<script>(function(){try{var L=["stycznia","lutego","marca","kwietnia","maja","czerwca","lipca","sierpnia","września","października","listopada","grudnia"],n=new Date(),t=new Date(n.getFullYear(),n.getMonth(),n.getDate());'
    + 'function nx(m,d){for(var k=0;k<5;k++){var c=new Date(t.getFullYear()+k,m-1,d);if(c.getMonth()!==m-1)continue;if(c>=t)return c;}return null;}'
    + 'function p2(x){return(x<10?"0":"")+x;}function ymd(c){return c.getFullYear()+p2(c.getMonth()+1)+p2(c.getDate());}function en(c){return new Date(c.getFullYear(),c.getMonth(),c.getDate()+1);}'
    + 'var e=document.getElementById("cd");if(e){var b=null;e.getAttribute("data-dates").split(",").forEach(function(s){var p=s.split("-"),c=nx(+p[0],+p[1]);if(c&&(!b||c<b.c))b={c:c,m:+p[0],d:+p[1]};});'
    + 'if(b){var x=Math.round((b.c-t)/864e5),w=b.d+" "+L[b.m-1];e.textContent=x===0?"Imieniny "+e.getAttribute("data-name")+" są dziś ("+w+")!":x===1?"Najbliższe imieniny: jutro ("+w+")":"Najbliższe imieniny: "+w+" — za "+x+" dni";}}'
    + 'var T=' + jsStr(calTitle) + ',U=' + jsStr(calUrl) + ',S=' + jsStr(nameSlug(name)) + ',ch=document.querySelectorAll(".cal-chip[data-m]");'
    + 'for(var i=0;i<ch.length;i++){var a=ch[i],c=nx(+a.getAttribute("data-m"),+a.getAttribute("data-d"));if(c)a.href="https://calendar.google.com/calendar/render?action=TEMPLATE&text="+encodeURIComponent(T)+"&dates="+ymd(c)+"/"+ymd(en(c))+"&details="+encodeURIComponent(U)+"&recur="+encodeURIComponent("RRULE:FREQ=YEARLY")+"&trp=false";}'
    + 'var btn=document.getElementById("icsBtn"),wr=document.getElementById("icsWrap");if(btn&&wr){wr.hidden=false;btn.onclick=function(){var d=new Date(),st=d.getUTCFullYear()+p2(d.getUTCMonth()+1)+p2(d.getUTCDate())+"T"+p2(d.getUTCHours())+p2(d.getUTCMinutes())+p2(d.getUTCSeconds())+"Z",o=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//DaybyDay//Imieniny//PL","CALSCALE:GREGORIAN"];'
    + 'for(var j=0;j<ch.length;j++){var m=+ch[j].getAttribute("data-m"),dd=+ch[j].getAttribute("data-d"),c=nx(m,dd);if(!c)continue;o.push("BEGIN:VEVENT","UID:imieniny-"+S+"-"+m+"-"+dd+"@daybyday.today","DTSTAMP:"+st,"DTSTART;VALUE=DATE:"+ymd(c),"DTEND;VALUE=DATE:"+ymd(en(c)),"RRULE:FREQ=YEARLY","SUMMARY:"+T,"URL:"+U,"TRANSP:TRANSPARENT","END:VEVENT");}'
    + 'o.push("END:VCALENDAR");var bl=new Blob([o.join("\\r\\n")+"\\r\\n"],{type:"text/calendar;charset=utf-8"}),u=URL.createObjectURL(bl),l=document.createElement("a");l.href=u;l.download="imieniny-"+S+".ics";document.body.appendChild(l);l.click();setTimeout(function(){URL.revokeObjectURL(u);l.parentNode.removeChild(l);},1000);};}'
    + '}catch(_){}})();</script>';
  const patronBlock = (!richHasPatron && dbEntry && dbEntry.patron)
    ? `\n  <div class="patron-section">\n    <h2>Patron / Patronka</h2>\n    <p>${dbEntry.patron}</p>\n  </div>`
    : '';

  // --- Linkowanie wewnętrzne: link do strony miesiąca + kto jeszcze obchodzi imieniny tego
  // dnia + nawigacja poprzednie/następne imię. Bez tego strona nie miała ŻADNEGO linku do
  // innej strony /imieniny/<slug>/ — była wyspą widoczną tylko z sitemap.xml (diagnoza GSC
  // 27.08.2026: 0 linków zewnętrznych + brak wewnętrznej sieci między stronami imion).
  const monthsSeen = new Set();
  const monthLinks = [];
  for (const d of dates) {
    if (monthsSeen.has(d.m)) continue;
    monthsSeen.add(d.m);
    monthLinks.push(`<a href="/imieniny/miesiac/${MONTH_SLUGS[d.m]}/">Wszystkie imieniny w ${MONTH_NAMES_LOC[d.m]}</a>`);
  }
  const monthLinksHtml = monthLinks.length
    ? `\n  <p class="month-links">${monthLinks.join(' · ')}</p>`
    : '';

  // Zakres ograniczony (max 3 daty x 12 współ-solenizantów) - imiona z wieloma datami
  // w roku (np. Jacek: 9 dat) inaczej generowałyby ścianę 100+ linków w jednej sekcji.
  const MAX_SAMEDAY_DATES = 3;
  const MAX_COCELEBRANTS_PER_DATE = 12;
  const sameDayParas = dates.slice(0, MAX_SAMEDAY_DATES).map(d => {
    let co = (dayNames[`${d.m}-${d.d}`] || []).filter(n => n !== name && allValidNamesSet.has(n));
    const truncated = co.length > MAX_COCELEBRANTS_PER_DATE;
    co = co.slice(0, MAX_COCELEBRANTS_PER_DATE);
    if (!co.length) return '';
    const coLinks = co.map(n => `<a href="/imieniny/${nameSlug(n)}/">${n}</a>`).join(', ');
    return `<p><strong>${d.d} ${MONTH_NAMES_GEN[d.m]}:</strong> ${coLinks}${truncated ? ' i inni' : ''}</p>`;
  }).filter(Boolean);
  const sameDaySection = sameDayParas.length
    ? `\n  <div class="related-section">\n    <h2>Kto jeszcze obchodzi imieniny tego dnia</h2>\n    ${sameDayParas.join('\n    ')}\n  </div>`
    : '';

  const pn = prevNextMap[name];
  const prevNextNav = pn
    ? `\n  <nav class="prevnext" aria-label="Nawigacja alfabetyczna">\n    <a href="/imieniny/${nameSlug(pn.prev)}/">← ${pn.prev}</a>\n    <a href="/imieniny.html">Wszystkie imiona A–Z</a>\n    <a href="/imieniny/${nameSlug(pn.next)}/">${pn.next} →</a>\n  </nav>`
    : '';

  const slug = nameSlug(name);
  const pageUrl = `https://daybyday.today/imieniny/${slug}/`;
  const articleLd = jsonLdScript({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: `Imieniny ${name}`,
    description: metaDesc,
    url: pageUrl,
    inLanguage: 'pl',
    isPartOf: { '@type': 'WebSite', name: 'DaybyDay', url: 'https://daybyday.today/' },
  });
  const breadcrumbItems = [
    { name: 'DaybyDay', url: 'https://daybyday.today/' },
    { name: 'Imieniny', url: 'https://daybyday.today/imieniny.html' },
    { name: name, url: pageUrl },
  ];
  const breadcrumbLd = jsonLdScript({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbItems.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: it.url })),
  });
  const breadcrumbHtml = `<nav class="breadcrumb" aria-label="breadcrumb">${breadcrumbItems.map((it, i) => i === breadcrumbItems.length - 1 ? `<span>${it.name}</span>` : `<a href="${it.url}">${it.name}</a>`).join(' › ')}</nav>`;

  return `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Imieniny ${name} — kiedy są imieniny ${genitive}? | DaybyDay</title>
  <meta name="description" content="${metaDesc}">
  <link rel="canonical" href="${pageUrl}">
  <meta property="og:title" content="Imieniny ${name} | DaybyDay">
  <meta property="og:description" content="${metaDesc}">
  <meta property="og:site_name" content="DaybyDay">
  <meta property="og:url" content="${pageUrl}">
  <meta property="og:type" content="article">
  <meta property="og:image" content="https://daybyday.today/og-image-v5.png">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  ${articleLd}
  ${breadcrumbLd}
  <script>(function(){var s=localStorage.getItem('dbd-theme');var p=window.matchMedia('(prefers-color-scheme:dark)').matches;document.documentElement.setAttribute('data-theme',s||(p?'dark':'light'));})();</script>
  <style>
    :root { --bg:#F8F7F5; --text:#1A1916; --muted:#555; --muted2:#888; --border:#e5e3de;${trendHtml ? ' --tag-bg:#EFEDE8; --accent:#8a6d3b;' : ''} color-scheme: light dark; }
    [data-theme="dark"] { --bg:#111110; --text:#F0EDE8; --muted:#B0ACA4; --muted2:#8A8680; --border:#2C2A27;${trendHtml ? ' --tag-bg:#1c1b18; --accent:#c9a86a;' : ''} }
    html { font-size: 112%; }
    body { font-family: Georgia, serif; max-width: 680px; margin: 2rem auto; padding: 0 1rem; color: var(--text); background: var(--bg); line-height: 1.7; }
    h1 { font-size: 2rem; margin-bottom: .5rem; }
    h2 { font-size: 1.2rem; font-weight: 700; margin: 1.5rem 0 .4rem; }
    .dates { font-size: 1.1rem; color: var(--muted); margin-bottom: 1.5rem; }
    .name-desc-section { margin-bottom: 1.25rem; }
    .name-desc-label { font-size: .75rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--muted2); margin: 0 0 .4rem; }
    .countdown { min-height: 1.7em; margin: -1rem 0 1.5rem; font-size: .95rem; color: var(--muted); }
    .cal-add { border-top: 1px solid var(--border); margin-top: 1.5rem; padding-top: 1.25rem; }
    .cal-add p { margin: .3rem 0 .6rem; font-size: .92rem; color: var(--muted); }
    .cal-chips { display: flex; flex-wrap: wrap; gap: .45rem; margin-bottom: .6rem; }
    .cal-chip { font: inherit; font-size: .85rem; padding: .45rem .9rem; min-height: 44px; display: inline-flex; align-items: center; border: 1px solid var(--border); border-radius: 60px; color: var(--text); background: none; text-decoration: none; cursor: pointer; }
    .cal-chip:hover { background: var(--border); }
    .patron-section { border-top: 1px solid var(--border); margin-top: 1.5rem; padding-top: 1.25rem; }
    .related-section { border-top: 1px solid var(--border); margin-top: 1.5rem; padding-top: 1.25rem; }
    .related-section p { margin: .3rem 0; font-size: .92rem; }
    .month-links { font-size: .85rem; margin-top: 1rem; }
    .prevnext { display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-top: 1.5rem; padding-top: 1.25rem; border-top: 1px solid var(--border); font-size: .85rem; flex-wrap: wrap; }
    .prevnext a { text-decoration: none; }
    .prevnext a:hover { text-decoration: underline; }
    a { color: var(--text); }
    .breadcrumb { font-size: .8rem; color: var(--muted2); margin-bottom: 1rem; }
    .breadcrumb a { color: var(--muted2); }
    .breadcrumb a:hover { color: var(--text); }
    .topnav { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 1rem 0; margin-bottom: 1.5rem; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
    .topnav .nav-logo { font-weight: 700; color: var(--text); text-decoration: none; font-size: 1.05rem; flex-shrink: 0; }
    .topnav .nav-links { list-style: none; display: flex; gap: 1.1rem; margin: 0; padding: 0; flex-wrap: wrap; flex: 1; }
    .topnav .nav-links a { color: var(--muted); text-decoration: none; font-size: .85rem; }
    .topnav .nav-links a:hover { color: var(--text); }
    @media(max-width:480px){ .topnav .nav-links{gap:.6rem .9rem; font-size:.8rem;} }
    @media(max-width:480px){ .topnav{gap:.2rem 1rem; padding:.7rem 0;} .topnav .nav-links{flex-basis:100%; order:3; gap:.1rem .9rem;} }
    #themeToggle { background: none; border: 1px solid var(--border); border-radius: 8px; width: 32px; height: 32px; cursor: pointer; font-size: 14px; color: var(--muted); font-family: inherit; line-height: 1; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    #themeToggle:hover { background: var(--border); }
    #themeToggle::before { content: '☾'; }
    [data-theme="dark"] #themeToggle::before { content: '☀'; }
  </style>
</head>
<body>
  <nav class="topnav">
    <a href="/" class="nav-logo">DaybyDay</a>
    <ul class="nav-links">
      <li><a href="/">Główna</a></li>
      <li><a href="/imieniny.html">Imieniny</a></li>
      <li><a href="/swieta.html">Święta</a></li>
      <li><a href="/kalendarz-szkolny.html">Kalendarz szkolny</a></li>
      <li><a href="/kalkulatory.html">Kalkulatory</a></li>
    </ul>
    <button id="themeToggle" onclick="var d=document.documentElement,t=d.getAttribute('data-theme')==='dark'?'light':'dark';d.setAttribute('data-theme',t);localStorage.setItem('dbd-theme',t);" aria-label="Przełącz tryb ciemny/jasny" title="Tryb ciemny/jasny"></button>
  </nav>
  ${breadcrumbHtml}
  <h1>Imieniny – ${name}</h1>
  <p class="dates">${NAME_GENITIVE[name] ? `Imieniny ${genitive} przypadają:` : `Imieniny ${name}:`} <strong>${datesStr}</strong>${variants.length ? ` (także zapisywane: ${variants.join(", ")})` : ''}</p>
  ${countdownHtml}
  ${trendHtml ? trendHtml + '\n  ' : ''}${descHtml ? `<div>${descHtml}</div>` : ''}${patronBlock}${calAddHtml}${monthLinksHtml}${sameDaySection}${prevNextNav}
  <p><a href="/imieniny.html?name=${encodeURIComponent(name)}">Pełne informacje o imieniu ${name} →</a></p>
  <p><a href="/">← DaybyDay</a></p>
  ${countdownScript}
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

// --- Kontrola powielania treści między "Znaczenie imienia" a "Historia" ---
// Wykryte 2026-07-12: dziesiątki wpisów (Bonifacy, Ernest, Lubomir...) miały Historię
// zaczynającą się od powtórnego wyjaśnienia tej samej etymologii co w Znaczeniu — realny
// sygnał "thin/duplicate content" (możliwy powód odrzuceń AdSense). Ten check ostrzega
// PRZED zapisem nowego/edytowanego wpisu, żeby błąd nie narastał po cichu przez kolejne batche.
const DUP_STOP = new Set(['i', 'w', 'z', 'na', 'do', 'od', 'się', 'że', 'jako', 'po', 'a', 'o', 'to', 'jest', 'był', 'była', 'które', 'który', 'która', 'dla', 'przez', 'ze', 'za', 'lub', 'czy', 'ale', 'tego', 'tej', 'tym', 'tych', 'nie', 'jego', 'jej', 'imię', 'imienia', 'pochodzi']);
// Prefiks (5 znaków) zamiast pełnego słowa - proste "biedne" stemowanie, bo polska fleksja
// (powaga/powagę/powagi) inaczej daje falszywie NISKIE podobienstwo przy porownaniu dokladnych
// slow (wykryte 2026-07-12: Ernest mial tylko 14% przy pelnych slowach, mimo ewidentnego
// powielenia tej samej etymologii - dopiero prefiks 5-znakowy zlapal to na 28%).
function dupWords(s) { return s.toLowerCase().replace(/[^a-ząćęłńóśźż\s-]/g, ' ').split(/\s+/).filter(w => w.length > 3 && !DUP_STOP.has(w)).map(w => w.slice(0, 5)); }
function jaccardOverlap(a, b) {
  const wa = new Set(dupWords(a)), wb = new Set(dupWords(b));
  let common = 0;
  for (const w of wa) if (wb.has(w)) common++;
  const union = new Set([...wa, ...wb]).size;
  return union === 0 ? 0 : common / union;
}
function extractSectionText(html, header) {
  const m = html.match(new RegExp('<h3>' + header + '</h3><p>([\\s\\S]*?)</p>'));
  return m ? m[1].replace(/<[^>]+>/g, '') : null;
}
function firstSentence(text) {
  const m = text.match(/^.*?[.!?](?:\s|$)/);
  return m ? m[0] : text;
}
const DUP_THRESHOLD = 0.25;
function checkDuplication(names, quiet) {
  const flagged = [];
  for (const name of names) {
    const rich = RICH[name];
    if (!rich) continue;
    const znacz = extractSectionText(rich, 'Znaczenie imienia');
    const hist = extractSectionText(rich, 'Historia');
    if (!znacz || !hist) continue;
    const overlap = jaccardOverlap(znacz, firstSentence(hist));
    if (overlap >= DUP_THRESHOLD) flagged.push({ name, pct: Math.round(overlap * 100) });
  }
  if (flagged.length && !quiet) {
    console.log(`\n⚠ OSTRZEŻENIE — ${flagged.length} imię/imion ma Historię powtarzającą etymologię ze Znaczenia (Jaccard >=${Math.round(DUP_THRESHOLD * 100)}%):`);
    flagged.forEach(f => console.log(`  ${f.name}: ${f.pct}% nakładania — Historia nie powinna zaczynać się od powtórnego wyjaśnienia etymologii, tylko od faktów biograficznych/historycznych`));
  }
  return flagged;
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
  const checkDupOnly = args.includes('--check-duplication');

  let candidateNames;
  if (changedStaged) {
    candidateNames = getChangedStagedNames();
    if (!quiet) console.log(`Wykryto ${candidateNames.length} zmienione imię/imiona w zastawionym diffie: ${candidateNames.join(', ') || '(brak)'}`);
  } else if (onlyArg) {
    candidateNames = onlyArg.split('=')[1].split(',');
  } else {
    // imiona z RICH + rzadkie imiona bez wpisu w RICH, które mają folder (strony okrojone) —
    // bez tych drugich ich strony nigdy nie dostawałyby zmian szablonu (865 stron w 10.2026)
    const stubNames = Object.keys(dateMap).filter(n => !RICH[n] && fs.existsSync(path.join(ROOT, 'imieniny', nameSlug(n))));
    candidateNames = [...new Set([...Object.values(slugOwner), ...stubNames])];
  }

  // --check-duplication: tylko audyt powielania Znaczenie/Historia, bez generowania stron.
  // Użyj np. do skanowania całej bazy: node scripts/gen_static_pages.js --check-duplication
  if (checkDupOnly) {
    const names = onlyArg ? candidateNames : Object.keys(RICH);
    const flagged = checkDuplication(names, true);
    flagged.sort((a, b) => b.pct - a.pct);
    console.log(`Sprawdzonych imion: ${names.length} | Powyżej progu ${Math.round(DUP_THRESHOLD * 100)}%: ${flagged.length}`);
    flagged.forEach(f => console.log(`  ${f.pct}% ${f.name}`));
    return;
  }

  // Przy zmianach w name_descriptions_rich.js (hook pre-commit) ostrzeż o nowym/pogłębionym
  // powielaniu treści dla dotkniętych imion — PRZED zapisem statycznych stron.
  if (changedStaged) checkDuplication(candidateNames, quiet);

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
