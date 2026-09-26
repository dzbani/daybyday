// Skan podejrzanych miejsc w HOLIDAYS_DB (swieto.html): superlatywy "pierwszy na swiecie", Guinness, data w tekscie vs pole date,
// numery rezolucji ONZ vs rok, sprzeczne lata w origin/desc, bliznaczki nazw, miejsca kongresow. Wynik = LISTA DO RECZNEJ WERYFIKACJI
// (duzo falszywych alarmow), nie lista bledow. Uzycie: node scripts/audit_swieto_db.js
const fs = require('fs');
const ROOT = require('path').join(__dirname, '..') + '/';
const sw = fs.readFileSync(ROOT + 'swieto.html', 'utf8');
let i0 = sw.indexOf('const HOLIDAYS_DB = {'), b0 = sw.indexOf('{', i0), d = 0, j = b0;
for (; j < sw.length; j++) { if (sw[j] === '{') d++; if (sw[j] === '}') { d--; if (!d) { j++; break; } } }
const DB = eval('(' + sw.slice(b0, j) + ')');
const MONTHS = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
const out = { superl: [], guinness: [], dateMismatch: [], unres: [], yearConflict: [], twins: [], loc: [] };
const txtOf = e => [e.origin, ...(e.desc || [])].join(' ');

for (const [slug, e] of Object.entries(DB)) {
  const t = txtOf(e);
  // A. superlatywy "pierwszy na świecie" itp.
  const m = t.match(/[^.]*\b(pierwsz\w+|najstarsz\w+|jedyn\w+)\b[^.]{0,40}\b(na świecie|w historii|na kuli ziemskiej|w Europie|w Polsce)\b[^.]*\./i);
  if (m) out.superl.push([slug, m[0].trim().slice(0, 240)]);
  // B. Guinness
  if (/guinness/i.test(t)) out.guinness.push([slug, (t.match(/[^.]*guinness[^.]*\./i) || [''])[0].trim().slice(0, 240)]);
  // F. data w tekście vs pole date (tylko dla dat stałych)
  const fx = e.date && e.date.trim().split(/[ \u00a0]+/);
  if (fx && fx.length === 2 && /^[0-9]{1,2}$/.test(fx[0]) && MONTHS.includes(fx[1])) {
    const re = new RegExp('(obchodzon\\w+|przypada|wypada|świętowan\\w+)[^.]{0,40}?\\b([0-9]{1,2}) (' + MONTHS.join('|') + ')', 'gi');
    let mm; const bad = [];
    while ((mm = re.exec(t))) { if (mm[2] !== fx[0] || mm[3].toLowerCase() !== fx[1]) bad.push(mm[0]); }
    if (bad.length) out.dateMismatch.push([slug, e.date, bad.slice(0, 2).join(' || ').slice(0, 200)]);
  }
  // H. rezolucje ONZ: N/xxx z DD miesiąc RRRR — sesja N ≈ rok 1945+N (wrz–gru) lub 1946+N (sty–sie)
  const re2 = /(?:rezolucj\w+|A\/RES\/)\s*(?:Zgromadzenia Ogólnego ONZ\s*)?(?:nr\s*)?([0-9]{1,2})\/([0-9]{1,3})[^.]{0,30}?(?:z|of)\s+(?:([0-9]{1,2})\s+)?(stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|października|listopada|grudnia)\s+([12][0-9]{3})/gi;
  let r;
  while ((r = re2.exec(t))) {
    const sess = +r[1], mon = MONTHS.indexOf(r[4].toLowerCase()) + 1, yr = +r[5];
    const exp = mon >= 9 ? 1945 + sess : 1946 + sess;
    if (yr !== exp) out.unres.push([slug, r[0].slice(0, 120), 'oczekiwany rok ' + exp]);
  }
  // E. sprzeczne lata: "ustanowion.. w RRRR" w origin vs inny rok w desc
  const oy = (e.origin || '').match(/ustanowion\w+[^.]{0,80}?\b(1[89][0-9]{2}|20[0-2][0-9])\b/i);
  if (oy) {
    const y = oy[1];
    const dt = (e.desc || []).join(' ');
    const dm = dt.match(/ustanowi\w+[^.]{0,80}?\b(1[89][0-9]{2}|20[0-2][0-9])\b/i);
    if (dm && dm[1] !== y) out.yearConflict.push([slug, 'origin ' + y + ' vs desc ' + dm[1]]);
  }
  // C. miejsce zdarzenia założycielskiego: "podczas ... w Miasto" (do przeglądu)
  const lm = (e.origin || '').match(/(podczas|na)\s+[^,;.]{0,90}?(Kongres\w*|Konferencj\w*|Sesj\w*|Zgromadzeni\w*)[^,;.]{0,60}\bw\s+[A-ZŁŚŻ][\w-]+/);
  if (lm) out.loc.push([slug, lm[0].slice(0, 200)]);
}

// D. bliźniaki: te same nazwy po odjęciu przedrostka lub duże podobieństwo tekstu
const norm = s => s.toLowerCase().replace(/^(międzynarodowy|światowy|europejski|ogólnopolski|krajowy|narodowy)\s+/, '').replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim();
const byNorm = {};
for (const [slug, e] of Object.entries(DB)) (byNorm[norm(e.name)] = byNorm[norm(e.name)] || []).push([slug, e]);
for (const [k, arr] of Object.entries(byNorm)) if (arr.length > 1) out.twins.push([k, arr.map(([s, e]) => s + ' [' + e.date + ']').join(' ; ')]);
// podobieństwo tekstu (Jaccard słów) dla wpisów o różnych nazwach
const toks = slug => new Set(txtOf(DB[slug]).toLowerCase().match(/[a-ząćęłńóśźż]{5,}/g) || []);
const slugs = Object.keys(DB);
const T = slugs.map(toks);
for (let a = 0; a < slugs.length; a++) for (let b = a + 1; b < slugs.length; b++) {
  const A = T[a], B = T[b]; if (A.size < 25 || B.size < 25) continue;
  let inter = 0; for (const w of A) if (B.has(w)) inter++;
  const jac = inter / (A.size + B.size - inter);
  if (jac > 0.6) out.twins.push(['podobieństwo ' + jac.toFixed(2), slugs[a] + ' [' + DB[slugs[a]].date + '] ~ ' + slugs[b] + ' [' + DB[slugs[b]].date + ']']);
}
for (const [k, v] of Object.entries(out)) {
  console.log('\n=== ' + k + ': ' + v.length);
  v.forEach(x => console.log('  ' + x.join(' | ')));
}
