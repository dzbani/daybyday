const fs = require('fs');
const path = require('path');

const idxPath = path.join(__dirname, '..', 'index.html');
let src = fs.readFileSync(idxPath, 'utf8');

// --- 1. Remove const PROVERBS_ARR=[...]; block entirely ---
const marker = 'const PROVERBS_ARR=[';
const start = src.indexOf(marker);
if (start === -1) throw new Error('PROVERBS_ARR not found');
const bodyStart = start + marker.length - 1;
let depth = 0, i = bodyStart, end = -1;
for (; i < src.length; i++) {
  const ch = src[i];
  if (ch === '[') depth++;
  else if (ch === ']') { depth--; if (depth === 0) { end = i; break; } }
}
// include trailing ";\n\n" after the array
let afterEnd = end + 1;
if (src[afterEnd] === ';') afterEnd++;
if (src[afterEnd] === '\n') afterEnd++;
if (src[afterEnd] === '\n') afterEnd++;

// also strip the preceding comment line "// Fallback ogólny\n" if present
let beforeStart = start;
const precedingComment = '// Fallback ogólny\n';
if (src.slice(start - precedingComment.length, start) === precedingComment) {
  beforeStart = start - precedingComment.length;
}

src = src.slice(0, beforeStart) + src.slice(afterEnd);
console.log('Usunięto PROVERBS_ARR (', end - start, 'znaków )');

// --- 2. Simplify the now-unreachable else branch that referenced PROVERBS_ARR ---
const oldBlock = `    if (combined.length > 0) {
      prov = [combined[(doy-1) % combined.length]];
    } else {
      prov = [PROVERBS_ARR[(doy-1) % PROVERBS_ARR.length]];
    }`;
const newBlock = `    prov = [combined[(doy-1) % combined.length]];`;

if (!src.includes(oldBlock)) throw new Error('nie znaleziono bloku if/else do uproszczenia');
src = src.replace(oldBlock, newBlock);
console.log('Uproszczono logikę fallbacku (usunięto nieosiągalną gałąź else)');

fs.writeFileSync(idxPath, src, 'utf8');
console.log('Zapisano', idxPath);
