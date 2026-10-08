// Aktualizuje <lastmod> w sitemap.xml (strony główne, kalendarze, miasta) datą ostatniej zmiany
// pliku w gicie. sitemap.xml jest prowadzony ręcznie (pozostałe sitemapy nie mają lastmod); lastmod
// z czerwca był nieaktualny dla wszystkich 89 wpisów.
//
// Uzycie: node scripts/gen_sitemap_main.js [--dry-run]
// Uwaga: data dotyczy samego pliku strony (nie danych .js, z których korzysta) - to przyblizenie.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DRY = process.argv.includes('--dry-run');
const SITE = 'https://daybyday.today';
const fp = path.join(ROOT, 'sitemap.xml');

const raw = fs.readFileSync(fp, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
const text = raw.replace(/\r\n/g, '\n');

let changed = 0, kept = 0, missing = [];
const out = text.replace(/<url>[\s\S]*?<\/url>/g, block => {
  const loc = (block.match(/<loc>([^<]*)<\/loc>/) || [])[1];
  if (!loc || !loc.startsWith(SITE)) return block;
  let rel = loc.slice(SITE.length);
  rel = rel === '/' ? 'index.html' : (rel.endsWith('/') ? rel.slice(1) + 'index.html' : rel.slice(1));
  if (!fs.existsSync(path.join(ROOT, rel))) { missing.push(loc); return block; }
  let date = '';
  try { date = execSync('git log -1 --format=%cs -- "' + rel + '"', { cwd: ROOT, encoding: 'utf8' }).trim(); } catch (e) { /* brak gita */ }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { kept++; return block; }
  const nb = /<lastmod>[^<]*<\/lastmod>/.test(block)
    ? block.replace(/<lastmod>[^<]*<\/lastmod>/, '<lastmod>' + date + '</lastmod>')
    : block.replace('</url>', '  <lastmod>' + date + '</lastmod>\n  </url>');
  if (nb !== block) changed++;
  return nb;
});

console.log(`sitemap.xml: zmienionych lastmod: ${changed}, bez daty z gita: ${kept}, brak pliku: ${missing.length}${missing.length ? ' (' + missing.slice(0, 3).join(', ') + ')' : ''}`);
if (!DRY && out !== text) {
  fs.writeFileSync(fp, out.replace(/\n/g, eol));
  console.log('sitemap.xml zaktualizowany');
} else if (DRY) {
  console.log('(dry-run, nie zapisano)');
}
