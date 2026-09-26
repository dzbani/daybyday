// Skan spójności świąt o ruchomej dacie (swieta_floating.js) z bazą swieto.html i listami HOLIDAYS.
// Uruchom po dodaniu/zmianie jakiegokolwiek święta z regułą "n-ty dzień tygodnia miesiąca":
//   node scripts/check_swieta_floating.js
// Kończy się kodem 1, jeśli znajdzie problem. Powód powstania: 27.09.2026 audyt dnia 27 IX wykrył,
// że ~80 takich świąt miało w lekkich listach HOLIDAYS stałą datę z 2026 (część błędną już w 2026).
//
// Sprawdza:
//  1) reguły dają właściwy dzień tygodnia / n-ty / ostatni w latach 2024-2040,
//  2) pole date w HOLIDAYS_DB (tekst reguły) zgadza się z regułą z swieta_floating.js,
//  3) święto z regułą w polu date (swieto.html), które stoi w listach jako [dzień,miesiąc], MA regułę,
//  4) święto ze stałą datą w bazie, ale z regułą w origin/desc, jest na liście znanych wyjątków
//     (stałe z ustawy/ONZ, w tekście tylko historia lub inny kraj) - inaczej to podejrzenie błędu.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const ctx = {};
vm.createContext(ctx);
vm.runInContext(read('swieta_floating.js') + '\nthis.R = SWIETA_FLOATING; this.byName = SWIETA_FLOATING_BY_NAME; this.dayFor = floatingDayFor;', ctx);

const sw = read('swieto.html');
const i0 = sw.indexOf('const HOLIDAYS_DB = {');
const b0 = sw.indexOf('{', i0);
let depth = 0, j = b0;
for (; j < sw.length; j++) {
  if (sw[j] === '{') depth++;
  if (sw[j] === '}') { depth--; if (!depth) { j++; break; } }
}
const DB = eval('(' + sw.slice(b0, j) + ')');

function listOf(file, name) {
  const s = read(file);
  let a = s.indexOf('const ' + name + ' = [');
  if (a < 0) a = s.indexOf('const ' + name + '=[');
  const st = s.indexOf('[', a);
  let d = 0, k = st;
  for (; k < s.length; k++) {
    if (s[k] === '[') d++;
    if (s[k] === ']') { d--; if (!d) { k++; break; } }
  }
  return eval(s.slice(st, k));
}
const lists = { 'index.html': listOf('index.html', 'HOLIDAYS'), 'swieta-nietypowe.html': listOf('swieta-nietypowe.html', 'HOLIDAYS') };

const MONTHS = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
const ORD = [[/^pierwsz/, 1], [/^drug/, 2], [/^trzeci|^trzec/, 3], [/^czwart/, 4], [/^ostatni/, -1]];
const WD = [[/^niedziel/, 0], [/^poniedzia/, 1], [/^wtorek/, 2], [/^środ/, 3], [/^czwartek/, 4], [/^piąt/, 5], [/^sobot/, 6], [/^weekend/, 6]];
const RULE_RE = /(pierwsz|drug|trzeci|trzec|czwart|ostatni)[\wąćęłńóśźż]*\s+(poniedziałek|poniedziałk|wtorek|środ|czwartek|piątek|sobot|niedziel|weekend)[\wąćęłńóśźż]*\s+([a-ząćęłńóśźż]+)/i;
function parseRule(txt) {
  const m = RULE_RE.exec(txt);
  if (!m) return null;
  const n = ORD.find(([r]) => r.test(m[1].toLowerCase()));
  const wd = WD.find(([r]) => r.test(m[2].toLowerCase()));
  const month = MONTHS.indexOf(m[3].toLowerCase()) + 1;
  return n && wd && month ? { n: n[1], wd: wd[1], m: month } : null;
}
const isFixedDate = t => { const x = t.trim().split(/[  ]+/); return x.length === 2 && /^[0-9]{1,2}$/.test(x[0]) && MONTHS.includes(x[1]); };

// Stałe daty (ustawa / uchwała ONZ / tradycja branżowa), w których tekst wspomina regułę tylko historycznie
// albo dla innego kraju - zweryfikowane ręcznie 27.09.2026.
const KNOWN_FIXED = new Set([
  'dzien-matki', 'dzien-ojca', 'dzien-handlowca', 'dzien-kolejarza', 'dzien-metalowca', 'dzien-architekta',
  'dzien-drukarza', 'dzien-energetyka', 'dzien-pokoju', 'swiatowy-dzien-jablka', 'swiatowy-dzien-ptakow', 'swiatowy-dzien-serca',
  'miedzynarodowy-dzien-ograniczania-skutkow-katastrof', 'swiatowy-dzien-drzewa',
]);

let problems = 0;
const fail = msg => { problems++; console.log('BŁĄD: ' + msg); };

// 1) poprawność reguł
for (const r of ctx.R) {
  for (let y = 2024; y <= 2040; y++) {
    const [d, m] = ctx.dayFor(r, y);
    const dt = new Date(y, m - 1, d);
    if (dt.getMonth() !== m - 1) fail(`${r.slug} ${y}: dzień poza miesiącem`);
    if (r.easter === undefined && dt.getDay() !== r.wd) fail(`${r.slug} ${y}: zły dzień tygodnia`);
    if (r.n > 0 && !r.from && Math.ceil(d / 7) !== r.n) fail(`${r.slug} ${y}: zły n-ty (${d})`);
    if (r.n === -1 && new Date(y, m - 1, d + 7).getMonth() === m - 1) fail(`${r.slug} ${y}: to nie ostatni`);
    if (r.from && (d < r.from || d > r.from + 6)) fail(`${r.slug} ${y}: poza przedziałem od ${r.from}`);
  }
}

// 2) tekst daty w bazie zgodny z regułą
const bySlug = Object.fromEntries(ctx.R.map(r => [r.slug, r]));
for (const [slug, e] of Object.entries(DB)) {
  const t = parseRule(e.date || '');
  const r = bySlug[slug];
  if (t && r && r.n !== undefined && !r.from && (t.n !== r.n || t.wd !== r.wd || t.m !== r.m)) {
    fail(`${slug}: date "${e.date}" ≠ reguła w swieta_floating.js (n=${r.n}, wd=${r.wd}, m=${r.m})`);
  }
}

// 3) rule-date w bazie + stoi w listach ze stałym dniem, a bez reguły
const listNames = new Set();
for (const l of Object.values(lists)) l.forEach(h => listNames.add(h[2]));
const covered = new Set(Object.keys(ctx.byName));
for (const [slug, e] of Object.entries(DB)) {
  const t = parseRule(e.date || '');
  if (!t || bySlug[slug]) continue;
  const stripped = e.name.replace(/ \(.*\)$/, '').replace(/^(Międzynarodowy|Światowy|Ogólnopolski) /, '');
  const onList = [...listNames].some(n => n === e.name || n === stripped || n.replace(/^(Międzynarodowy|Światowy|Ogólnopolski) /, '') === stripped);
  if (onList && ![...covered].some(n => n === e.name)) fail(`${slug} ("${e.date}") stoi w listach ze stałą datą, a nie ma reguły w swieta_floating.js`);
}

// 4) stała data w bazie + reguła w origin/desc, poza znanymi wyjątkami
for (const [slug, e] of Object.entries(DB)) {
  if (!isFixedDate(e.date || '') || bySlug[slug] || KNOWN_FIXED.has(slug)) continue;
  const txt = [e.origin, ...(e.desc || [])].join(' ');
  if (RULE_RE.test(txt)) fail(`${slug} (date "${e.date}"): w tekście jest reguła "${RULE_RE.exec(txt)[0]}" — ruchome czy stałe? Dodaj regułę albo wpisz do KNOWN_FIXED`);
}

// 5) pozycje TYLKO z lekkiej listy (bez wpisu w HOLIDAYS_DB) z regułą w opisie, bez reguły w swieta_floating.js
const dbNames = new Set(Object.values(DB).map(e => e.name));
for (const [file, list] of Object.entries(lists)) {
  for (const [dd, mm, name, desc] of list) {
    if (ctx.byName[name] || dbNames.has(name) || !desc) continue;
    if (RULE_RE.test(desc)) fail(`${file}: "${name}" (${dd}.${mm}) — w opisie reguła "${RULE_RE.exec(desc)[0]}", brak w swieta_floating.js`);
  }
}

console.log(problems ? `\nZnaleziono problemów: ${problems}` : `OK — ${ctx.R.length} reguł, baza (${Object.keys(DB).length}) i listy spójne.`);
process.exit(problems ? 1 : 0);
