const fs = require('fs');
const path = require('path');

const dirs = fs.readdirSync('imieniny').filter(d => fs.statSync(path.join('imieniny', d)).isDirectory() && d !== 'miesiac');
const pattern = /^(.+?) obchodzi imieniny (?:raz w roku|(\d+) razy w roku): (.+)\. Sprawdź znaczenie imienia, historię i życzenia imieninowe\.$/;

let fixed = 0;
let skipped = [];

for (const d of dirs) {
  const f = path.join('imieniny', d, 'index.html');
  if (!fs.existsSync(f)) continue;
  let html = fs.readFileSync(f, 'utf8');
  const m = html.match(/<meta name="description" content="([^"]*)">/);
  if (!m) continue;
  const desc = m[1];
  if (desc.length <= 160) continue;

  const pm = desc.match(pattern);
  if (!pm) { skipped.push([d, 'brak dopasowania wzorca', desc.length]); continue; }

  const [, name, , datesPart] = pm;
  const dateList = datesPart.split(', ');
  if (dateList.length <= 3) { skipped.push([d, 'juz <=3 daty, dlugosc z innego powodu', desc.length]); continue; }

  const freqStr = dateList.length === 1 ? 'raz w roku' : `${dateList.length} razy w roku`;
  const truncated = dateList.slice(0, 3).join(', ') + ' i inne';
  const newDesc = `${name} obchodzi imieniny ${freqStr}: ${truncated}. Sprawdź znaczenie imienia, historię i życzenia imieninowe.`;

  if (newDesc.length > 160) { skipped.push([d, 'nadal >160 po skroceniu', newDesc.length]); continue; }

  const escaped = newDesc.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const oldEscaped = desc.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const before = html;
  html = html.split(`content="${oldEscaped}"`).join(`content="${escaped}"`);
  if (html === before) { skipped.push([d, 'replace nie trafil (escaping?)', desc.length]); continue; }

  fs.writeFileSync(f, html);
  fixed++;
  console.log(`OK  ${d}: ${desc.length} -> ${newDesc.length} znakow`);
}

console.log(`\nNaprawionych: ${fixed}`);
if (skipped.length) {
  console.log(`Pominietych: ${skipped.length}`);
  console.log(skipped);
}
