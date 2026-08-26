// Jednorazowy skrypt naprawczy: usuwa martwe pole `count` z NAME_DB w imieniny.html.
// Pole nigdzie nie jest renderowane (potwierdzone: countSrc/countHTML liczone, ale nigdy
// nie wstawiane do body.innerHTML) — realna popularność imienia w popupie pochodzi
// wyłącznie z NAME_POPULARITY (name_popularity.js, zsynchronizowane z PESEL).
// Audyt 2026-08-26 wykazał, że wartości `count` w NAME_DB były w większości błędne
// (do 20x zawyżone względem realnych danych PESEL) i całkowicie niepotrzebne.
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'imieniny.html');
let src = fs.readFileSync(file, 'utf8');

const dbStart = src.indexOf('const NAME_DB');
const braceStart = src.indexOf('{', dbStart);
let depth = 0, i = braceStart, inStr = null, esc = false;
for (; i < src.length; i++) {
  const c = src[i];
  if (inStr) {
    if (esc) { esc = false; }
    else if (c === '\\') { esc = true; }
    else if (c === inStr) { inStr = null; }
    continue;
  }
  if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
  if (c === '{') depth++;
  else if (c === '}') { depth--; if (depth === 0) { i++; break; } }
}
const dbBlockEnd = i;

const before = src.slice(0, braceStart);
let block = src.slice(braceStart, dbBlockEnd);
const after = src.slice(dbBlockEnd);

const countPattern = /\s*count:\s*'[^']*',/g;
const matches = block.match(countPattern) || [];
block = block.replace(countPattern, '');

// Usuń martwy kod countSrc/countHTML (nieużywany nigdzie w renderze).
const deadCodePattern = /\n  const countSrc = \(d && d\.count\) \? d\.count : \(peselCount > 0 \? peselCount\.toLocaleString\('pl-PL'\) : null\);\n  const countHTML = countSrc \? `<span class="result-count">Imię nosi w Polsce <strong>\$\{countSrc\}<\/strong> osób <span style="font-size:\.75rem;color:var\(--muted\)">\(rejestr PESEL, stan na 20\.01\.2026\)<\/span><\/span>` : '';/;

const finalAfter = after.replace(deadCodePattern, '');
if (finalAfter === after) {
  console.error('UWAGA: nie znaleziono martwego bloku countSrc/countHTML do usunięcia — sprawdź ręcznie.');
  process.exit(1);
}

const result = before + block + finalAfter;
fs.writeFileSync(file, result, 'utf8');
console.log(`Usunięto ${matches.length} pól "count" z NAME_DB oraz martwy kod countSrc/countHTML.`);
