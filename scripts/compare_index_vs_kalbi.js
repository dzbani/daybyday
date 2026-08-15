const fs = require('fs');
const path = require('path');

// --- 1. Extract PROVERBS_DAILY from index.html ---
const idxPath = path.join(__dirname, '..', 'index.html');
const idxSrc = fs.readFileSync(idxPath, 'utf8');
const idxStart = idxSrc.indexOf('const PROVERBS_DAILY = {');
const idxBodyStart = idxStart + 'const PROVERBS_DAILY = {'.length - 1;
let depth = 0, i = idxBodyStart, idxEnd = -1;
for (; i < idxSrc.length; i++) {
  const ch = idxSrc[i];
  if (ch === '{') depth++;
  else if (ch === '}') { depth--; if (depth === 0) { idxEnd = i; break; } }
}
const PROVERBS_DAILY = (0, eval)('(' + idxSrc.slice(idxBodyStart, idxEnd + 1) + ')');
console.log('PROVERBS_DAILY dni:', Object.keys(PROVERBS_DAILY).length);

// --- 2. Parse przyslowia_scraped.json (raw scrape of kalbi.pl, format 'D-M') ---
const scrapedRaw = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'przyslowia_scraped.json'), 'utf8'));
const kalbiClean = {};
for (const [key, fragments] of Object.entries(scrapedRaw)) {
  const texts = [];
  for (const frag of fragments) {
    const m = frag.match(/^>([^<]+)<\/p>/);
    if (m) {
      const t = m[1].trim();
      if (t.length > 3) texts.push(t);
    }
  }
  kalbiClean[key] = texts;
}
console.log('Scraped (kalbi) dni:', Object.keys(kalbiClean).length);

fs.writeFileSync(path.join(__dirname, 'kalbi_clean.json'), JSON.stringify(kalbiClean, null, 1), 'utf8');

// --- 3. Compare ---
let daysWithAnyMatch = 0, daysNoMatch = 0, daysMissingInKalbi = 0;
let totalIdxProverbs = 0, matchedIdxProverbs = 0;
const detail = [];

for (const [key, idxProverbs] of Object.entries(PROVERBS_DAILY)) {
  const kalbiList = kalbiClean[key] || [];
  totalIdxProverbs += idxProverbs.length;
  let dayMatches = 0;
  const matchedTexts = [];
  for (const p of idxProverbs) {
    if (kalbiList.includes(p)) {
      dayMatches++;
      matchedIdxProverbs++;
      matchedTexts.push(p);
    }
  }
  if (kalbiList.length === 0) daysMissingInKalbi++;
  if (dayMatches > 0) daysWithAnyMatch++; else daysNoMatch++;
  detail.push({ key, idxCount: idxProverbs.length, kalbiCount: kalbiList.length, matches: dayMatches, matchedTexts });
}

console.log('');
console.log('=== WYNIK ===');
console.log('Dni w PROVERBS_DAILY:', Object.keys(PROVERBS_DAILY).length);
console.log('Dni z >=1 dosłownym dopasowaniem do scrape kalbi:', daysWithAnyMatch);
console.log('Dni bez żadnego dopasowania:', daysNoMatch);
console.log('Dni, dla których w scrape kalbi brak danych:', daysMissingInKalbi);
console.log('Łącznie przysłów w PROVERBS_DAILY:', totalIdxProverbs);
console.log('Z nich dosłownie identycznych z kalbi:', matchedIdxProverbs, `(${(100*matchedIdxProverbs/totalIdxProverbs).toFixed(1)}%)`);

fs.writeFileSync(path.join(__dirname, 'index_vs_kalbi_detail.json'), JSON.stringify(detail, null, 1), 'utf8');
console.log('');
console.log('Szczegóły: scripts/index_vs_kalbi_detail.json');
