const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '..', 'przyslowia_data.js');
const src = fs.readFileSync(dataPath, 'utf8');

const marker = 'const PROVERBS = {';
const start = src.indexOf(marker);
const bodyStart = start + marker.length - 1;
let depth = 0, i = bodyStart, end = -1;
for (; i < src.length; i++) {
  const ch = src[i];
  if (ch === '{') depth++;
  else if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
}
const PROVERBS = (0, eval)('(' + src.slice(bodyStart, end + 1) + ')');

const additions = JSON.parse(fs.readFileSync(path.join(__dirname, 'thin_days_result.json'), 'utf8'));

let added = 0, skippedNull = 0, missing = [];
for (const r of additions) {
  if (!r.newProverb) { skippedNull++; continue; }
  const day = (PROVERBS[r.m] || []).find(d => d.d === r.d);
  if (!day) { missing.push(r); continue; }
  day.p.push(r.newProverb);
  added++;
}
console.log('Dodano:', added, '| Pominięto (null):', skippedNull, '| Brakujące dni:', missing.length);
if (missing.length) console.log(JSON.stringify(missing, null, 1));

function escStr(s) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
function serializeMonth(days) {
  return days.map(day => {
    const dStr = `d:${day.d},`.padEnd(6);
    const namesStr = `names:'${escStr(day.names)}',`.padEnd(48);
    const pStr = `p:[${day.p.map(p => `'${escStr(p)}'`).join(',')}]`;
    return `    { ${dStr} ${namesStr}${pStr} },`;
  }).join('\n');
}
let out = 'const PROVERBS = {\n';
for (let m = 1; m <= 12; m++) {
  out += `  ${m}: [\n${serializeMonth(PROVERBS[m])}\n  ],\n`;
}
out += '};';

const newSrc = src.slice(0, start) + out + src.slice(end + 2);
fs.writeFileSync(dataPath, newSrc, 'utf8');
console.log('Zapisano', dataPath);
