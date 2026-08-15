const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'przyslowia.html');
const src = fs.readFileSync(filePath, 'utf8');

const startMarker = 'const PROVERBS = {';
const start = src.indexOf(startMarker);
if (start === -1) throw new Error('PROVERBS not found');
const bodyStart = start + startMarker.length - 1;
let depth = 0, i = bodyStart, end = -1;
for (; i < src.length; i++) {
  const ch = src[i];
  if (ch === '{') depth++;
  else if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
}
const objSrc = src.slice(bodyStart, end + 1);
const PROVERBS = (0, eval)('(' + objSrc + ')');

// same filler classifier as audit script
const monthOrdinals = ['pierwszy','drugi','trzeci','czwarty','piąty','szósty','siódmy','ósmy','dziewiąty','dziesiąty',
  'jedenasty','dwunasty','trzynasty','czternasty','piętnasty','szesnasty','siedemnasty','osiemnasty','dziewiętnasty',
  'dwudziesty'];
const monthAdjRoots = ['styczniow','lutow','marcow','kwietniow','majow','czerwcow','lipcow','sierpniow','wrześniow',
  'październikow','listopadow','grudniow'];
const monthWords = ['Styczeń|styczeń','Luty|luty','Marzec|marzec','Kwiecień|kwiecień','Maj|maj','Czerwiec|czerwiec',
  'Lipiec|lipiec','Sierpień|sierpień','Wrzesień|wrzesień','Październik|październik','Listopad|listopad','Grudzień|grudzień'];
function isFiller(text) {
  const reA = new RegExp('^(?:' + monthWords.join('|') + ')\\s+(' + monthOrdinals.join('|') + ')(\\s+\\S+)?\\s*—', 'i');
  if (reA.test(text)) return 'A';
  const reB = new RegExp('^[A-ZŻŹŁŚĆŃÓĄĘ][a-ząćęłńóśźż]+\\s+(' + monthAdjRoots.join('|') + ')\\w*\\s*—', 'i');
  if (reB.test(text)) return 'B';
  return null;
}

const merged = JSON.parse(fs.readFileSync(path.join(__dirname, 'proverbs_replacements_merged.json'), 'utf8'));

// index: dec per-slot lookup by m,d,oldText ; others by m,d (single)
const decBySlot = {}; // key m-d-oldText -> newProverb
const singleByDay = {}; // key m-d -> newProverb (first one wins, non-dec)
for (const e of merged) {
  if (e.m === 12 && e.oldText) {
    decBySlot[`${e.m}-${e.d}-${e.oldText}`] = e.newProverb;
  } else {
    const key = `${e.m}-${e.d}`;
    if (!singleByDay[key]) singleByDay[key] = e.newProverb;
  }
}

let stats = { replaced: 0, removedSecondFiller: 0, daysUntouched: 0, missingLookup: [] };

for (let m = 1; m <= 12; m++) {
  const days = PROVERBS[m] || [];
  for (const day of days) {
    const fillerIdx = [];
    day.p.forEach((text, idx) => { if (isFiller(text)) fillerIdx.push(idx); });
    if (fillerIdx.length === 0) continue;

    if (m === 12) {
      // per-slot replacement using oldText match
      for (const idx of fillerIdx) {
        const key = `12-${day.d}-${day.p[idx]}`;
        const np = decBySlot[key];
        if (np) {
          day.p[idx] = np;
          stats.replaced++;
        } else {
          stats.missingLookup.push({ m, d: day.d, text: day.p[idx] });
        }
      }
    } else {
      const key = `${m}-${day.d}`;
      const np = singleByDay[key];
      if (!np) {
        stats.missingLookup.push({ m, d: day.d, text: day.p[fillerIdx[0]] });
        continue;
      }
      // replace first filler slot with the real proverb
      day.p[fillerIdx[0]] = np;
      stats.replaced++;
      // if there was a second filler slot, remove it (reduce to 1 real instead of 2 fabricated)
      if (fillerIdx.length === 2) {
        // remove higher index first to not shift the other
        day.p.splice(fillerIdx[1], 1);
        stats.removedSecondFiller++;
      }
    }
  }
}

console.log('Stats:', stats);
if (stats.missingLookup.length) {
  console.log('BRAKUJĄCE DOPASOWANIA:', JSON.stringify(stats.missingLookup, null, 1));
}

// Serialize PROVERBS back to JS source matching original style
function escStr(s) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function serializeMonth(days) {
  const lines = days.map(day => {
    const dStr = `d:${day.d},`.padEnd(6);
    const namesStr = `names:'${escStr(day.names)}',`;
    const namesPadded = namesStr.padEnd(48);
    const pStr = `p:[${day.p.map(p => `'${escStr(p)}'`).join(',')}]`;
    return `    { ${dStr} ${namesPadded}${pStr} },`;
  });
  return lines.join('\n');
}

let newObjSrc = 'const PROVERBS = {\n';
for (let m = 1; m <= 12; m++) {
  newObjSrc += `  ${m}: [\n`;
  newObjSrc += serializeMonth(PROVERBS[m]) + '\n';
  newObjSrc += '  ],\n';
}
newObjSrc += '};';

const newSrc = src.slice(0, start) + newObjSrc + src.slice(end + 2); // +2 to skip original "};"

fs.writeFileSync(filePath, newSrc, 'utf8');
console.log('Zapisano', filePath);
console.log('Nowa długość pliku:', newSrc.length, '(było', src.length, ')');
