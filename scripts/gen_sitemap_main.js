// Aktualizuje <lastmod> w sitemap.xml (strony główne, kalendarze, miasta) datą ostatniej zmiany
// pliku w gicie. sitemap.xml jest prowadzony ręcznie (pozostałe sitemapy nie mają lastmod); lastmod
// z czerwca był nieaktualny dla wszystkich 89 wpisów. Sitemapy stron treściowych (imieniny, święta,
// kartki, liturgiczne) mają lastmod z scripts/page_lastmod.js (data zmiany TREŚCI, wołane przez generatory).
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

// Statyczne strony generowane (kalendarz/RRRR/..., imieniny/miesiac/...) maja date wg ZMIAN TRESCI
// (scripts/page_lastmod.js), a nie ostatniego commita - inaczej techniczny commit (menu, CSS) na
// wszystkich stronach naraz ustawialby im dzisiejsza date. Strony narzedziowe (kalkulatory itd.)
// zostaja przy dacie commita, bo ich tresc zmienia sie takze przez dane/kod w JS, ktorych
// normalizacja tekstu HTML by nie zauwazyla.
const CONTENT_PREFIXES = ['kalendarz/', 'imieniny/miesiac/'];
const toRel = loc => { const r = loc.slice(SITE.length); return r === '/' ? 'index.html' : (r.endsWith('/') ? r.slice(1) + 'index.html' : r.slice(1)); };
const contentRels = [...text.matchAll(/<loc>([^<]*)<\/loc>/g)].map(m => m[1]).filter(l => l.startsWith(SITE)).map(toRel)
  .filter(r => CONTENT_PREFIXES.some(p => r.startsWith(p)) && fs.existsSync(path.join(ROOT, r)));
let contentDates = new Map();
try { contentDates = require('./page_lastmod').computeLastmods(ROOT, contentRels); } catch (e) { console.warn('lastmod z tresci pominiety: ' + e.message.split('\n')[0]); }

let changed = 0, kept = 0, missing = [];
const out = text.replace(/<url>[\s\S]*?<\/url>/g, block => {
  const loc = (block.match(/<loc>([^<]*)<\/loc>/) || [])[1];
  if (!loc || !loc.startsWith(SITE)) return block;
  let rel = loc.slice(SITE.length);
  rel = rel === '/' ? 'index.html' : (rel.endsWith('/') ? rel.slice(1) + 'index.html' : rel.slice(1));
  if (!fs.existsSync(path.join(ROOT, rel))) { missing.push(loc); return block; }
  let date = contentDates.get(rel) || '';
  if (!date) {
    try { date = execSync('git log -1 --format=%cs -- "' + rel + '"', { cwd: ROOT, encoding: 'utf8' }).trim(); } catch (e) { /* brak gita */ }
    // plik nowy lub zmieniony względem ostatniego commita (skrypt odpala się PRZED commitem) = dzisiejsza data
    try { if (execSync('git status --porcelain -- "' + rel + '"', { cwd: ROOT, encoding: 'utf8' }).trim()) { const n = new Date(); date = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; } } catch (e) { /* brak gita */ }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { kept++; return block; }
  // <lastmod> zaraz po <loc> (kolejność ze schematu sitemap: loc, lastmod, changefreq, priority)
  const nb = block.replace(/\s*<lastmod>[^<]*<\/lastmod>/, '').replace(/(<loc>[^<]*<\/loc>)/, '$1\n    <lastmod>' + date + '</lastmod>');
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
