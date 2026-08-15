const fs = require('fs');
const path = require('path');

// --- 1. Read the now-fixed PROVERBS from przyslowia.html (365 days, all verified real) ---
const przPath = path.join(__dirname, '..', 'przyslowia.html');
const przSrc = fs.readFileSync(przPath, 'utf8');
const przStart = przSrc.indexOf('const PROVERBS = {');
const przBodyStart = przStart + 'const PROVERBS = {'.length - 1;
let depth = 0, i = przBodyStart, przEnd = -1;
for (; i < przSrc.length; i++) {
  const ch = przSrc[i];
  if (ch === '{') depth++;
  else if (ch === '}') { depth--; if (depth === 0) { przEnd = i; break; } }
}
const PROVERBS = (0, eval)('(' + przSrc.slice(przBodyStart, przEnd + 1) + ')');

// --- 2. Build new PROVERBS_DAILY keyed 'd-m' ---
const newDaily = {};
for (let m = 1; m <= 12; m++) {
  for (const day of PROVERBS[m]) {
    newDaily[`${day.d}-${m}`] = day.p.slice();
  }
}
console.log('Nowe PROVERBS_DAILY — dni:', Object.keys(newDaily).length);
let totalP = 0;
Object.values(newDaily).forEach(arr => totalP += arr.length);
console.log('Łącznie przysłów:', totalP);

// --- 3. Verify near-zero overlap with kalbi scrape ---
const kalbiClean = JSON.parse(fs.readFileSync(path.join(__dirname, 'kalbi_clean.json'), 'utf8'));
let matched = 0;
for (const [key, arr] of Object.entries(newDaily)) {
  const kalbiList = kalbiClean[key] || [];
  for (const p of arr) if (kalbiList.includes(p)) matched++;
}
console.log('Pokrywających się dosłownie z kalbi (powinno być blisko 0):', matched, '/', totalP);

// --- 4. Serialize new PROVERBS_DAILY matching original style ---
function escStr(s) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
// preserve month-grouped comment structure like original (// D-M) but simpler: group by month, comment before each month block
let out = 'const PROVERBS_DAILY = {\n';
for (let m = 1; m <= 12; m++) {
  const daysInMonth = PROVERBS[m].map(d => d.d);
  out += `  // === miesiąc ${m} ===\n`;
  for (const d of daysInMonth) {
    const key = `${d}-${m}`;
    const arr = newDaily[key];
    out += `  '${key}': [${arr.map(p => `'${escStr(p)}'`).join(', ')}],\n`;
  }
}
out += '};';

// --- 5. Splice into index.html, replacing old PROVERBS_DAILY block ---
const idxPath = path.join(__dirname, '..', 'index.html');
const idxSrc = fs.readFileSync(idxPath, 'utf8');
const idxStart = idxSrc.indexOf('const PROVERBS_DAILY = {');
const idxBodyStart = idxStart + 'const PROVERBS_DAILY = {'.length - 1;
let d2 = 0, j = idxBodyStart, idxEnd = -1;
for (; j < idxSrc.length; j++) {
  const ch = idxSrc[j];
  if (ch === '{') d2++;
  else if (ch === '}') { d2--; if (d2 === 0) { idxEnd = j; break; } }
}
const newIdxSrc = idxSrc.slice(0, idxStart) + out + idxSrc.slice(idxEnd + 2);
fs.writeFileSync(idxPath, newIdxSrc, 'utf8');
console.log('Zapisano', idxPath);
console.log('Nowa długość:', newIdxSrc.length, '(było', idxSrc.length, ')');
