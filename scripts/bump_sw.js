// Podbija wersję Service Workera (sw.js: const CACHE = 'daybyday-vNNN') o 1 i synchronizuje
// parametr ?v=NNN przy skryptach danych home_*.js w index.html. Dzięki ?v= zmiana danych
// (np. dopisane święto w home_holidays.js) nie jest zasłaniana starą wersją z cache SW
// (SW serwuje skrypty cache-first - adres z nowym ?v= to nowy wpis w cache).
//
// Użycie: node scripts/bump_sw.js            -> podbij o 1
//         node scripts/bump_sw.js --check    -> tylko sprawdź zgodność sw.js z ?v= (kod 1 gdy rozjazd)
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SW = path.join(ROOT, 'sw.js');
const INDEX = path.join(ROOT, 'index.html');

const sw = fs.readFileSync(SW, 'utf8');
const m = sw.match(/(const CACHE\s*=\s*'daybyday-v)(\d+)(')/);
if (!m) { console.error('Nie znaleziono wersji w sw.js'); process.exit(1); }
const cur = parseInt(m[2], 10);

const html = fs.readFileSync(INDEX, 'utf8');
const re = /(<script src="home_[a-z]+\.js\?v=)(\d+)(")/g;
const versions = [...html.matchAll(re)].map(x => parseInt(x[2], 10));

if (process.argv.includes('--check')) {
  const bad = versions.filter(v => v !== cur);
  if (!versions.length || bad.length) {
    console.error(`ROZJAZD: sw.js = v${cur}, ?v= w index.html = [${versions.join(', ')}]`);
    process.exit(1);
  }
  console.log(`OK — sw.js v${cur}, ${versions.length} skrypty home_*.js z ?v=${cur}`);
  process.exit(0);
}

const next = cur + 1;
fs.writeFileSync(SW, sw.replace(m[0], m[1] + next + m[3]), 'utf8');
fs.writeFileSync(INDEX, html.replace(re, (_, a, _v, c) => a + next + c), 'utf8');
console.log(`sw.js: v${cur} -> v${next}; ?v= w index.html zsynchronizowane (${versions.length} skrypty)`);
