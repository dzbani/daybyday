// Generuje wschod-zachod-slonca/<slug>/index.html per miasto z CITIES
// (te same dane/algorytm co w wschody-zachody.html). Powod: ta strona ma
// przelacznik miast tylko w JS (bez zmiany URL), wiec Google widzi i moze
// zaindeksowac wylacznie /wschody-zachody.html (domyslnie Warszawa) — reszta
// miast jest niewidoczna dla wyszukiwarki mimo posiadania gotowych danych.
// Kazda wygenerowana strona to pelna kopia glownej strony (identyczny UI,
// zakladki miast, kalkulacje na zywo w JS), rozniaca sie tylko domyslnym
// miastem + wlasnym canonical/meta/JSON-LD/breadcrumb.
//
// Tryby:
//   node scripts/gen_wschody_miasta.js              -> pelny przebieg (wszystkie miasta)
//   node scripts/gen_wschody_miasta.js --dry-run     -> jw. ale bez zapisu
//   node scripts/gen_wschody_miasta.js --only=krakow,gdansk

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SRC_PATH = path.join(ROOT, 'wschody-zachody.html');

function jsonLdScript(obj) {
  return `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;
}

const srcRaw = fs.readFileSync(SRC_PATH, 'utf8');

const citiesMatch = srcRaw.match(/const CITIES = (\{[\s\S]*?\n\};)/);
if (!citiesMatch) throw new Error('Nie znaleziono CITIES w wschody-zachody.html');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext('this.__C__ = ' + citiesMatch[1], sandbox);
const CITIES = sandbox.__C__;

const OLD_TITLE = '<title>Wschód i Zachód Słońca w Polsce 2026 | DaybyDay</title>';
const OLD_DESC = '<meta name="description" content="Godziny wschodu i zachodu słońca w Polsce na każdy dzień 2026. Sprawdź o której wschodzi i zachodzi słońce w Twoim mieście.">';
const OLD_CANONICAL = '<link rel="canonical" href="https://daybyday.today/wschody-zachody.html">';
const OLD_OG_TITLE = '<meta property="og:title" content="Wschód i Zachód Słońca w Polsce 2026">';
const OLD_OG_DESC = '<meta property="og:description" content="Godziny wschodu i zachodu słońca na każdy dzień 2026. Wybierz miasto i sprawdź długość dnia.">';
const OLD_OG_URL = '<meta property="og:url" content="https://daybyday.today/wschody-zachody.html">';
const OLD_LOCATION_STATUS_CSS = '.location-status { font-size:.78rem; color:var(--muted); margin-top:-.5rem; margin-bottom:1.5rem; min-height:1.2em; }';
const OLD_HERO = '<div class="page-label">Astronomia</div>\n  <h1 class="page-title">Wschód i zachód słońca</h1>\n  <p class="page-sub">Godziny wschodu i zachodu słońca dla głównych miast Polski w 2026 roku. Dane astronomiczne z uwzględnieniem czasu letniego i zimowego.</p>';
const OLD_TAB_DEFAULT = "btn.className = 'city-tab' + (key === 'warszawa' ? ' active' : '');";
const OLD_INIT_DEFAULT = "} else {\n  selectCity('warszawa');\n  useMyLocation(true);\n}";

for (const OLD of [OLD_TITLE, OLD_DESC, OLD_CANONICAL, OLD_OG_TITLE, OLD_OG_DESC, OLD_OG_URL, OLD_LOCATION_STATUS_CSS, OLD_HERO, OLD_TAB_DEFAULT, OLD_INIT_DEFAULT]) {
  if (!srcRaw.includes(OLD)) throw new Error('Wzorzec nie znaleziony w źródle (zmieniono wschody-zachody.html?): ' + OLD.slice(0, 60));
}

// Miejscownik ("w Krakowie", nie "w Kraków") + wyjątki przyimka w/we — Wrocław
// bierze "we" (jak Włochy, wtorek) ze wzgledu na grupe spolgloskowa "wr-".
const LOCATIVE = {
  warszawa: 'Warszawie', krakow: 'Krakowie', gdansk: 'Gdańsku', wroclaw: 'Wrocławiu',
  poznan: 'Poznaniu', katowice: 'Katowicach', lodz: 'Łodzi', lublin: 'Lublinie',
  szczecin: 'Szczecinie', bydgoszcz: 'Bydgoszczy', bialystok: 'Białymstoku', rzeszow: 'Rzeszowie',
};
const PREP = { wroclaw: 'we' };

function buildPage(slug, city) {
  const pageUrl = `https://daybyday.today/wschod-zachod-slonca/${slug}/`;
  const cityIn = `${PREP[slug] || 'w'} ${LOCATIVE[slug]}`;
  const title = `Wschód i zachód słońca ${cityIn} 2026 | DaybyDay`;
  const ogTitle = `Wschód i zachód słońca ${cityIn} 2026`;
  const metaDesc = `Godziny wschodu i zachodu słońca ${cityIn} na każdy dzień 2026 roku. Sprawdź o której wschodzi i zachodzi słońce oraz długość dnia ${cityIn}.`;

  const breadcrumbItems = [
    { name: 'DaybyDay', url: 'https://daybyday.today/' },
    { name: 'Wschód i zachód słońca', url: 'https://daybyday.today/wschody-zachody.html' },
    { name: city.name, url: pageUrl },
  ];
  const articleLd = jsonLdScript({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: `Wschód i zachód słońca ${cityIn}`,
    description: metaDesc,
    url: pageUrl,
    inLanguage: 'pl',
    isPartOf: { '@type': 'WebSite', name: 'DaybyDay', url: 'https://daybyday.today/' },
  });
  const breadcrumbLd = jsonLdScript({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbItems.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: it.url })),
  });
  const breadcrumbHtml = `<nav class="breadcrumb" aria-label="breadcrumb">${breadcrumbItems.map((it, i) => i === breadcrumbItems.length - 1 ? `<span>${it.name}</span>` : `<a href="${it.url}">${it.name}</a>`).join(' › ')}</nav>`;

  let html = srcRaw;
  html = html.replace(OLD_TITLE, `<title>${title}</title>`);
  html = html.replace(OLD_DESC, `<meta name="description" content="${metaDesc}">`);
  html = html.replace(OLD_CANONICAL, `<link rel="canonical" href="${pageUrl}">\n  ${articleLd}\n  ${breadcrumbLd}`);
  html = html.replace(OLD_OG_TITLE, `<meta property="og:title" content="${ogTitle}">`);
  html = html.replace(OLD_OG_DESC, `<meta property="og:description" content="${metaDesc}">`);
  html = html.replace(OLD_OG_URL, `<meta property="og:url" content="${pageUrl}">`);
  html = html.replace(OLD_LOCATION_STATUS_CSS, `${OLD_LOCATION_STATUS_CSS}\n    .breadcrumb { font-size:.78rem; color:var(--muted); margin-bottom:1rem; }\n    .breadcrumb a { color:var(--muted); text-decoration:none; }\n    .breadcrumb a:hover { color:var(--text); }`);
  html = html.replace(OLD_HERO, `<div class="page-label">Astronomia</div>\n  ${breadcrumbHtml}\n  <h1 class="page-title">Wschód i zachód słońca ${cityIn}</h1>\n  <p class="page-sub">Godziny wschodu i zachodu słońca ${cityIn} na każdy dzień 2026 roku. Dane astronomiczne z uwzględnieniem czasu letniego i zimowego. Możesz też sprawdzić inne miasta poniżej.</p>`);
  html = html.replace(OLD_TAB_DEFAULT, `btn.className = 'city-tab' + (key === '${slug}' ? ' active' : '');`);
  html = html.replace(OLD_INIT_DEFAULT, `} else {\n  selectCity('${slug}');\n  useMyLocation(true);\n}`);

  return html;
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const onlyArg = args.find(a => a.startsWith('--only='));
  const slugs = onlyArg ? onlyArg.split('=')[1].split(',') : Object.keys(CITIES);

  let written = 0, unchanged = 0, skipped = 0;
  for (const slug of slugs) {
    const city = CITIES[slug];
    if (!city) { skipped++; console.log(`Pominięto (brak w CITIES): ${slug}`); continue; }
    const page = buildPage(slug, city);
    const folder = path.join(ROOT, 'wschod-zachod-slonca', slug);
    if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
    const filePath = path.join(folder, 'index.html');
    const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
    if (existing === page) { unchanged++; continue; }
    if (!dryRun) fs.writeFileSync(filePath, page, 'utf8');
    written++;
  }
  console.log(`Miast: ${slugs.length}, zapisanych/zmienionych: ${written}${dryRun ? ' (DRY RUN — nic nie zapisano)' : ''}, bez zmian: ${unchanged}, pominiętych: ${skipped}`);
}

main();
