// Wspolny mechanizm regeneracji swieto_slugs.js / swieto_names.js / sitemap-swieto.xml.
// Skanuje faktyczny stan katalogu swieto/ na dysku (a nie tylko HOLIDAYS_DB), zeby
// generator bogatych stron (gen_static_swieto_pages.js) i generator lekkich stron
// (gen_static_nietypowe_pages.js) nie nadpisywaly sobie wzajemnie rejestru slugow.

const fs = require('fs');
const path = require('path');

function scanSwietoFolders(ROOT) {
  const dir = path.join(ROOT, 'swieto');
  const slugs = [];
  const nameToSlug = {};
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const idx = path.join(dir, entry.name, 'index.html');
    if (!fs.existsSync(idx)) continue;
    slugs.push(entry.name);
    const content = fs.readFileSync(idx, 'utf8');
    const m = content.match(/<title>([\s\S]*?) — DaybyDay<\/title>/);
    if (m) {
      const name = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
      nameToSlug[name] = entry.name;
    }
  }
  slugs.sort();
  return { slugs, nameToSlug };
}

// aliasy: nazwy alternatywne tego samego realnego wydarzenia, ktore nie maja
// wlasnej fizycznej strony, tylko wskazuja na slug innej, juz istniejacej strony
const NAME_ALIASES = {
  'Międzynarodowy Dzień Sprzeciwu Wobec Tam': 'miedzynarodowy-dzien-dzialan-na-rzecz-rzek',
  // te same realne swieta, opisane w bogatej bazie HOLIDAYS_DB pod pelniejsza nazwa,
  // a w liscie "nietypowych" wystepujace jeszcze raz pod krotsza/uproszczona nazwa
  'Dzień Diagnosty Laboratoryjnego': 'dzien-diagnosty-laboratoryjnego',
  'Dzień Farmaceuty': 'dzien-farmaceuty',
  'Dzień Maszynisty': 'dzien-maszynisty',
  'Dzień Nauki Polskiej': 'dzien-nauki-polskiej',
  'Dzień Praw Człowieka': 'dzien-praw-czlowieka',
  'Dzień Sapera': 'dzien-sapera',
  'Dzień Tolerancji': 'dzien-tolerancji',
};

function regenerateRegistry(ROOT, extraAliases) {
  const { slugs, nameToSlug } = scanSwietoFolders(ROOT);
  const aliases = Object.assign({}, NAME_ALIASES, extraAliases || {});
  for (const [name, slug] of Object.entries(aliases)) {
    if (slugs.includes(slug)) nameToSlug[name] = slug;
  }

  const slugsContent = `// Lista slugow, dla ktorych istnieje wygenerowana strona /swieto/<slug>/ — uzywane do bezpiecznego linkowania bezposredniego (fallback na swieto.html?id= / swieta-nietypowe.html gdy brak).\nconst SWIETO_SLUGS=new Set(${JSON.stringify(slugs)});\n`;
  fs.writeFileSync(path.join(ROOT, 'swieto_slugs.js'), slugsContent, 'utf8');

  const namesContent = `// Mapa nazwa swieta -> slug (do linkowania z index.html / swieta-nietypowe.html)\nconst SWIETO_NAME_TO_SLUG=${JSON.stringify(nameToSlug)};\n`;
  fs.writeFileSync(path.join(ROOT, 'swieto_names.js'), namesContent, 'utf8');

  const urls = slugs.map(s => `  <url>\n    <loc>https://daybyday.today/swieto/${s}/</loc>\n    <changefreq>yearly</changefreq>\n    <priority>0.6</priority>\n  </url>`).join('\n');
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  fs.writeFileSync(path.join(ROOT, 'sitemap-swieto.xml'), sitemap, 'utf8');

  return { slugCount: slugs.length, nameCount: Object.keys(nameToSlug).length };
}

module.exports = { scanSwietoFolders, regenerateRegistry };
