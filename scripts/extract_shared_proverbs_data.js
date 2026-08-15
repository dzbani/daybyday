const fs = require('fs');
const path = require('path');

function findObjectBlock(src, marker) {
  const start = src.indexOf(marker);
  if (start === -1) throw new Error('marker not found: ' + marker);
  const bodyStart = start + marker.length - 1;
  let depth = 0, i = bodyStart, end = -1;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  return { start, bodyStart, end };
}

// --- 1. Extract PROVERBS from przyslowia.html ---
const przPath = path.join(__dirname, '..', 'przyslowia.html');
let przSrc = fs.readFileSync(przPath, 'utf8');
const przMarker = 'const PROVERBS = {';
const przBlock = findObjectBlock(przSrc, przMarker);
const provSrcText = przSrc.slice(przBlock.start, przBlock.end + 2); // "const PROVERBS = {...};"

// --- 2. Write shared data file ---
const dataFilePath = path.join(__dirname, '..', 'przyslowia_data.js');
fs.writeFileSync(dataFilePath, provSrcText + '\n', 'utf8');
console.log('Zapisano przyslowia_data.js,', provSrcText.length, 'znaków');

// --- 3. Remove embedded PROVERBS block from przyslowia.html, add <script src> before it ---
const beforeBlock = przSrc.slice(0, przBlock.start);
const afterBlock = przSrc.slice(przBlock.end + 2);
// insert script src right before "const PROVERBS" position, i.e. at end of beforeBlock
przSrc = beforeBlock + afterBlock;
// now inject <script src="przyslowia_data.js"></script> right after the <script> tag that used to contain PROVERBS
// find the nearest preceding "<script>" tag (opening) to where PROVERBS used to be
const scriptOpenIdx = beforeBlock.lastIndexOf('<script>');
if (scriptOpenIdx === -1) throw new Error('nie znaleziono <script> przed PROVERBS w przyslowia.html');
const insertPos = scriptOpenIdx; // insert BEFORE this <script> tag, as its own <script src> tag
przSrc = przSrc.slice(0, insertPos) + '<script src="przyslowia_data.js"></script>\n' + przSrc.slice(insertPos);

fs.writeFileSync(przPath, przSrc, 'utf8');
console.log('Zaktualizowano przyslowia.html');

// --- 4. Update index.html: remove embedded PROVERBS_DAILY, load shared file, compute PROVERBS_DAILY from PROVERBS ---
const idxPath = path.join(__dirname, '..', 'index.html');
let idxSrc = fs.readFileSync(idxPath, 'utf8');
const idxMarker = 'const PROVERBS_DAILY = {';
const idxBlock = findObjectBlock(idxSrc, idxMarker);

const computedDaily = `const PROVERBS_DAILY = (function(){
  const daily = {};
  for (const m in PROVERBS) {
    PROVERBS[m].forEach(day => { daily[\`\${day.d}-\${m}\`] = day.p; });
  }
  return daily;
})();`;

idxSrc = idxSrc.slice(0, idxBlock.start) + computedDaily + idxSrc.slice(idxBlock.end + 2);

// insert <script src="przyslowia_data.js"></script> into the existing data-script group
// (after swieto_names.js, matching the existing grouping style)
const anchor = '<script src="swieto_names.js"></script>\n';
if (!idxSrc.includes(anchor)) throw new Error('nie znaleziono kotwicy swieto_names.js w index.html');
idxSrc = idxSrc.replace(anchor, anchor + '<script src="przyslowia_data.js"></script>\n');

fs.writeFileSync(idxPath, idxSrc, 'utf8');
console.log('Zaktualizowano index.html');
