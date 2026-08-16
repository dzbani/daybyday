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

let dedupedDays = 0, removedCount = 0;
for (let m = 1; m <= 12; m++) {
  PROVERBS[m].forEach(day => {
    const seen = new Set();
    const deduped = [];
    for (const p of day.p) {
      if (!seen.has(p)) { seen.add(p); deduped.push(p); }
      else removedCount++;
    }
    if (deduped.length !== day.p.length) {
      console.log(`Dzień ${m}/${day.d}: ${day.p.length} -> ${deduped.length}`);
      day.p = deduped;
      dedupedDays++;
    }
  });
}
console.log('Dni zdeduplikowanych:', dedupedDays, '| Usuniętych duplikatów:', removedCount);

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
