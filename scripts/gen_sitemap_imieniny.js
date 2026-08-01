// Generuje sitemap-imieniny.xml skanujac rzeczywiste foldery imieniny/<slug>/index.html
// na dysku - to jest jedyne wiarygodne zrodlo prawdy o tym, ktore strony faktycznie
// istnieja i sa publikowane (nie wszystkie maja wpis w NAME_DESCRIPTIONS_RICH - reszta
// korzysta z prostszego zrodla opisow, ale strona i tak istnieje i powinna byc w sitemapie).
//
// Powod: sitemap-imieniny.xml nie mial ZADNEGO skryptu generujacego (w przeciwienstwie
// do sitemap-swieto.xml/sitemap-kartka.xml) - byl to plik zbudowany raz recznie/ad-hoc
// 30 lipca (2423 wpisy), wiec kazde nowe imie dodane pozniej cicho wypadalo z sitemapy
// bez zadnego mechanizmu synchronizacji. Znaleziono tak 17 brakujacych stron z pelna
// trescia (adriana, alfons, anatola, brunon, egidiusz, jowita, kasper, konstantyn,
// korneliusz, ludmila, maksymiliana, mechtylda, miriam, paraskewa, roland, symeon,
// teodozjusz) - realnych folderow jest 2440.
//
// Uzycie: node scripts/gen_sitemap_imieniny.js [--dry-run]

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const IMIENINY_DIR = path.join(ROOT, 'imieniny');
const DRY = process.argv.includes('--dry-run');

const slugs = fs.readdirSync(IMIENINY_DIR, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name)
  .filter(slug => fs.existsSync(path.join(IMIENINY_DIR, slug, 'index.html')))
  .sort();

const urls = slugs.map(s => `  <url><loc>https://daybyday.today/imieniny/${s}/</loc><changefreq>yearly</changefreq><priority>0.6</priority></url>`).join('\n');
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;

const filePath = path.join(ROOT, 'sitemap-imieniny.xml');
const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
const changed = existing !== sitemap;
if (!DRY && changed) fs.writeFileSync(filePath, sitemap, 'utf8');

console.log(`Folderow ze stronami (imieniny/<slug>/index.html): ${slugs.length}`);
console.log(changed ? `sitemap-imieniny.xml ${DRY ? '(dry-run, nie zapisano)' : 'zaktualizowany'}` : 'sitemap-imieniny.xml bez zmian');
