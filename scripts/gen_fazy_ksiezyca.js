// Tabela faz w fazy-ksiezyca.html (nów, kwadry, pełnia z godzinami, lata 2026–2032) — GENEROWANA z scripts/moon_phases.js.
// Wcześniej: ręcznie wpisane karty tylko na 2026 (po 31.12.2026 strona zostałaby bez danych).
// Strona zawiera dane (PH_EVENTS) i funkcję renderującą (phCardsHtml) między znacznikami PH:DATA / PH:RENDER; ten generator
// uruchamia TĘ SAMĄ funkcję w Node i wpisuje statyczny HTML domyślnego roku (rok bieżący, w zakresie danych) między
// <!-- PH:GRID:START --> a <!-- PH:GRID:END -->, żeby treść była w HTML bez JS. Przeglądarka sama przełącza rok (phShowYear).
//
// Użycie: node scripts/gen_fazy_ksiezyca.js [--dry-run]   (rozszerzanie zakresu lat: YEARS niżej + gen_kalendarz_ksiezycowy.js)

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { phasesInRange, localParts } = require('./moon_phases');

const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'fazy-ksiezyca.html');
const DRY = process.argv.includes('--dry-run');
const YEARS = [2026, 2027, 2028, 2029, 2030, 2031, 2032];
const FIRST = YEARS[0], LAST = YEARS[YEARS.length - 1];
const DEFAULT_YEAR = Math.min(Math.max(new Date().getFullYear(), FIRST), LAST);

let raw = fs.readFileSync(FILE, 'utf8');
const bom = raw.charCodeAt(0) === 0xFEFF; if (bom) raw = raw.slice(1);
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
let s = raw.replace(/\r\n/g, '\n');
const between = (start, end) => { const a = s.indexOf(start), b = s.indexOf(end); if (a < 0 || b < a) throw new Error('Brak znaczników ' + start); return [a + start.length, b]; };
const setBetween = (start, end, text) => { const [a, b] = between(start, end); s = s.slice(0, a) + text + s.slice(b); };

// 1) dane: [rok, miesiąc, dzień, godz, min, CEST(0/1), faza 0-3] w czasie polskim, minuty obcięte
const events = phasesInRange(FIRST, LAST).map(e => ({ q: e.q, utc: e.date.getTime(), l: localParts(e.date.getTime()) }))
  .filter(e => e.l.y >= FIRST && e.l.y <= LAST);
const lastSundayUtc = (y, m) => { const d = new Date(Date.UTC(y, m, 0)); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return Date.UTC(y, m - 1, d.getUTCDate(), 1); };
const isDst = utc => { const y = new Date(utc).getUTCFullYear(); return utc >= lastSundayUtc(y, 3) && utc < lastSundayUtc(y, 10) ? 1 : 0; };
const rows = events.map(e => `[${e.l.y},${e.l.m},${e.l.d},${e.l.hh},${e.l.mm},${isDst(e.utc)},${e.q}]`);
const byYear = YEARS.map(y => '    ' + events.map((e, i) => e.l.y === y ? rows[i] : null).filter(Boolean).join(','));
setBetween('/* PH:DATA:START */', '/* PH:DATA:END */', `\n  // [rok, miesiąc, dzień, godzina, minuta, CEST(1)/CET(0), faza: 0 nów, 1 I kwadra, 2 pełnia, 3 III kwadra] — czas polski\n  const PH_EVENTS = [\n${byYear.join(',\n')}\n  ];\n  `);

// 2) statyczny HTML domyślnego roku z tej samej funkcji renderującej
const [d0, d1] = between('/* PH:DATA:START */', '/* PH:DATA:END */'), [r0, r1] = between('/* PH:RENDER:START */', '/* PH:RENDER:END */');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(s.slice(d0, d1) + '\n' + s.slice(r0, r1) + `\nthis.OUT = phCardsHtml(${DEFAULT_YEAR});`, ctx);
setBetween('<!-- PH:GRID:START -->', '<!-- PH:GRID:END -->', '\n' + ctx.OUT);
s = s.replace(/(<div class="phases-grid" id="phasesGrid" data-year=")\d{4}(">)/, `$1${DEFAULT_YEAR}$2`);

// 3) zakładki lat
setBetween('<!-- PH:YEARS:START -->', '<!-- PH:YEARS:END -->', '\n    ' + YEARS.map(y => `<button class="year-tab${y === DEFAULT_YEAR ? ' active' : ''}" data-year="${y}" onclick="phShowYear(${y})">${y}</button>`).join('\n    ') + '\n  ');

// 4) zakres lat w tytule/opisach (jedno miejsce prawdy: YEARS)
const range = `${FIRST}–${LAST}`;
s = s.replace(/(Fazy Księżyca |Kalendarz faz Księżyca |Kalendarz faz księżyca na lata |kalendarz księżycowy )20\d\d–20\d\d/g, `$1${range}`);

const out = (bom ? '﻿' : '') + s.replace(/\n/g, eol);
const cur = fs.readFileSync(FILE, 'utf8');
if (out === cur) console.log('fazy-ksiezyca.html: bez zmian');
else if (DRY) console.log('fazy-ksiezyca.html: zmieniłaby się (dry-run)');
else { fs.writeFileSync(FILE, out, 'utf8'); console.log(`fazy-ksiezyca.html: zaktualizowana (${events.length} faz, ${range}, statyczny rok ${DEFAULT_YEAR})`); }
