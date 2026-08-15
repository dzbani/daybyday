const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'przyslowia.html');
const src = fs.readFileSync(filePath, 'utf8');

const startMarker = 'const PROVERBS = {';
const start = src.indexOf(startMarker);
if (start === -1) throw new Error('PROVERBS not found');
const bodyStart = start + startMarker.length - 1; // include the {
// find matching closing brace for the object literal followed by ;
let depth = 0, i = bodyStart, end = -1;
for (; i < src.length; i++) {
  const ch = src[i];
  if (ch === '{') depth++;
  else if (ch === '}') {
    depth--;
    if (depth === 0) { end = i; break; }
  }
}
if (end === -1) throw new Error('closing brace not found');
const objSrc = src.slice(bodyStart, end + 1);

// eval in isolated scope
const PROVERBS = (0, eval)('(' + objSrc + ')');

const monthOrdinals = ['pierwszy','drugi','trzeci','czwarty','piąty','szósty','siódmy','ósmy','dziewiąty','dziesiąty',
  'jedenasty','dwunasty','trzynasty','czternasty','piętnasty','szesnasty','siedemnasty','osiemnasty','dziewiętnasty',
  'dwudziesty'];
const monthAdjRoots = ['styczniow','lutow','marcow','kwietniow','majow','czerwcow','lipcow','sierpniow','wrześniow',
  'październikow','listopadow','grudniow'];
const monthWords = ['Styczeń|styczeń','Luty|luty','Marzec|marzec','Kwiecień|kwiecień','Maj|maj','Czerwiec|czerwiec',
  'Lipiec|lipiec','Sierpień|sierpień','Wrzesień|wrzesień','Październik|październik','Listopad|listopad','Grudzień|grudzień'];

function isFiller(text) {
  // Pattern A: "<Miesiąc> <ordinal...>" e.g. "Sierpień drugi", "Grudzień dwudziesty siódmy"
  const reA = new RegExp('^(?:' + monthWords.join('|') + ')\\s+(' + monthOrdinals.join('|') + ')(\\s+\\S+)?\\s*—', 'i');
  if (reA.test(text)) return 'A';
  // Pattern B: "<Imię><miesięczny przymiotnik> —" e.g. "Gustaw sierpniowy —", "Kordula październikowa —"
  const reB = new RegExp('^[A-ZŻŹŁŚĆŃÓĄĘ][a-ząćęłńóśźż]+\\s+(' + monthAdjRoots.join('|') + ')\\w*\\s*—', 'i');
  if (reB.test(text)) return 'B';
  return null;
}

const months = ['','styczeń','luty','marzec','kwiecień','maj','czerwiec','lipiec','sierpień','wrzesień','październik','listopad','grudzień'];

let totalProverbs = 0, fillerCount = 0;
const perMonth = {};
const fillerDetail = [];

for (let m = 1; m <= 12; m++) {
  perMonth[m] = { total: 0, filler: 0, days: 0, daysAllFiller: 0 };
  const days = PROVERBS[m] || [];
  for (const day of days) {
    perMonth[m].days++;
    let dayFillerCount = 0;
    for (const p of day.p) {
      totalProverbs++;
      perMonth[m].total++;
      const kind = isFiller(p);
      if (kind) {
        fillerCount++;
        perMonth[m].filler++;
        dayFillerCount++;
        fillerDetail.push({ m, d: day.d, names: day.names, text: p, kind });
      }
    }
    if (dayFillerCount === day.p.length) perMonth[m].daysAllFiller++;
  }
}

console.log('=== PODSUMOWANIE ===');
console.log('Łącznie przysłów:', totalProverbs);
console.log('Wypełniaczy:', fillerCount, `(${(100*fillerCount/totalProverbs).toFixed(1)}%)`);
console.log('');
console.log('=== PER MIESIĄC ===');
for (let m = 1; m <= 12; m++) {
  const s = perMonth[m];
  console.log(`${String(m).padStart(2)} ${months[m].padEnd(11)} dni=${s.days} przysłów=${s.total} wypełniaczy=${s.filler} dni-całkowicie-wypełniacz=${s.daysAllFiller}`);
}

fs.writeFileSync(path.join(__dirname, 'proverbs_filler_detail.json'), JSON.stringify(fillerDetail, null, 2), 'utf8');
console.log('');
console.log('Szczegóły zapisane do scripts/proverbs_filler_detail.json (', fillerDetail.length, 'wpisów )');
