// Kontrola: każde imię w polu `names` (przyslowia_data.js) występuje w bazie imienin (home_names.js) dla tego dnia.
// Imiona na stronie /przyslowia.html są w mianowniku i mają pochodzić z bazy — wpisane ręcznie rozjeżdżały się
// (przed 24.10.2026 ok. 30% dni niezgodnych). Kod wyjścia 1 przy niezgodności.
// Użycie: node scripts/check_przyslowia_names.js
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/^﻿/, '');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(read('przyslowia_data.js').replace(/\bconst PROVERBS\b/, 'var PROVERBS'), ctx);
vm.runInContext(read('home_names.js').replace(/^const NAMES/m, 'var NAMES'), ctx);
const base = {}; for (const [m, d, n] of ctx.NAMES) base[`${m}-${d}`] = new Set(n);
const dim = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const bad = []; let days = 0, names = 0;
for (let m = 1; m <= 12; m++) {
  const list = ctx.PROVERBS[m] || [];
  for (const day of list) {
    days++;
    if (day.d > dim[m - 1]) bad.push(`${day.d}.${m}: nieistniejący dzień`);
    const given = day.names.split(',').map(s => s.trim()).filter(Boolean);
    if (!given.length) bad.push(`${day.d}.${m}: puste imiona`);
    for (const g of given) { names++; if (!(base[`${m}-${day.d}`] || new Set()).has(g)) bad.push(`${day.d}.${m}: „${g}” nie ma w bazie dla tego dnia`); }
  }
}
console.log(`Sprawdzono ${days} dni, ${names} imion. Niezgodności: ${bad.length}`);
bad.forEach(b => console.log('  ' + b));
process.exit(bad.length ? 1 : 0);
