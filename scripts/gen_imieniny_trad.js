// Generuje imieniny_tradycyjne.js: dla każdego dnia imiona z NAMES (imieniny.html),
// które występują w tradycyjnych kalendarzach (Wikipedia ∪ imieniny.rky.pl, migawka w
// scripts/imieniny_tradycyjne_zrodla.json). Strona główna buduje z tego nagłówek imienin.
// Uruchom po każdej zmianie NAMES: node scripts/gen_imieniny_trad.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');

const imi = fs.readFileSync(path.join(ROOT, 'imieniny.html'), 'utf8');
const NAMES = eval(imi.match(/const NAMES=\r?\n(\[[\s\S]*?\r?\n\]);/)[1]);
const SRC = JSON.parse(fs.readFileSync(path.join(__dirname, 'imieniny_tradycyjne_zrodla.json'), 'utf8')).dni;

// Popularność (PESEL) — imiona w dniu sortowane malejąco; fallback nagłówka bierze pierwsze 3
const popCtx = {};
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'name_popularity.js'), 'utf8').replace(/^﻿/, '').replace('const NAME_POPULARITY', 'var NAME_POPULARITY'), popCtx);
const POP = popCtx.NAME_POPULARITY;
const norm = s => s.trim().toLowerCase();
const out = {};
let total = 0;
for (const [m, d, names] of NAMES) {
  const k = m + '-' + d;
  const s = SRC[k];
  if (!s) continue;
  const trad = new Set(s.wikipedia.concat(s.rky).map(norm));
  const hit = names.filter(n => trad.has(norm(n))).sort((a, b) => (POP[b] || 0) - (POP[a] || 0));
  if (hit.length) { out[k] = hit; total += hit.length; }
}

const body = Object.entries(out).map(([k, v]) => `"${k}":${JSON.stringify(v)}`).join(',\n');
fs.writeFileSync(path.join(ROOT, 'imieniny_tradycyjne.js'),
  '// Wygenerowane przez scripts/gen_imieniny_trad.js — nie edytować ręcznie.\n' +
  '// Imiona z NAMES potwierdzone przez tradycyjne kalendarze (Wikipedia ∪ imieniny.rky.pl),\n' +
  '// posortowane wg popularności (name_popularity.js).\n' +
  'const IMIENINY_TRAD={\n' + body + '\n};\n');
console.log('dni:', Object.keys(out).length, '| imion:', total);
