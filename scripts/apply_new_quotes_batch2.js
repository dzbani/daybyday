const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'index.html');
const newBatchPath = path.join(__dirname, 'quotes_new_batch2.json');

const content = fs.readFileSync(indexPath, 'utf8');
const newBatch = JSON.parse(fs.readFileSync(newBatchPath, 'utf8'));

const marker = '\n];';
const start = content.indexOf('const QUOTES=[');
const closeIdx = content.indexOf(marker, start);
if (start === -1 || closeIdx === -1) {
  throw new Error('Nie znaleziono granic tablicy QUOTES');
}

function escapeSingleQuotes(s) {
  return s.replace(/'/g, "\\'");
}

const newLines = newBatch.map(item => {
  const t = escapeSingleQuotes(item.text_pl.trim());
  const a = escapeSingleQuotes(item.author.trim());
  return `  {t:'${t}',a:'${a}'},`;
}).join('\n');

const before = content.slice(0, closeIdx);
const after = content.slice(closeIdx);

const updated = before + '\n' + newLines + after;

fs.writeFileSync(indexPath, updated, 'utf8');
console.log('Dodano', newBatch.length, 'nowych cytatow do QUOTES.');
