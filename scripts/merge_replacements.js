const fs = require('fs');
const path = require('path');

const scratch = 'C:\\Users\\dzban\\AppData\\Local\\Temp\\claude\\D--Claude-Code-dzbani\\d07ca514-99d6-4711-a64f-883b9637998f\\scratchpad';
const files = ['replacements_1.json','replacements_2.json','replacements_3.json','replacements_4.json','replacements_5.json'];

let all = [];
for (const f of files) {
  const p = path.join(scratch, f);
  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  console.log(f, '-> entries:', data.length, 'sample keys:', Object.keys(data[0]));
  all = all.concat(data.map(x => ({...x, __file: f})));
}

fs.writeFileSync(path.join(__dirname, 'proverbs_replacements_merged.json'), JSON.stringify(all, null, 1), 'utf8');
console.log('TOTAL entries merged:', all.length);

// check for m,d duplicates
const seen = {};
for (const e of all) {
  const key = e.m + '-' + e.d;
  seen[key] = (seen[key] || 0) + 1;
}
const dups = Object.entries(seen).filter(([k,v]) => v > 1);
console.log('Days with >1 replacement entry:', dups.length);
console.log(dups.slice(0, 20));
