// Wspólne dane kalendarzowe dla generatorów PDF (gen_pdf_calendars.js) i ICS (gen_ics.js).
// ŻADNEJ nowej kopii logiki: dni wolne = silnik z kalendarz.html (FIXED_HOLIDAYS + Wielkanoc algorytmem
// Gaussa; Wigilia wolna od 2025, Dz.U. 2024 poz. 1965), święta i dni tematyczne = swieta_data.js
// (SWIETA_DATA_STATIC + computeMovableSwieta), imieniny = home_names.js z regułą "imion głównych dnia"
// z gen_kartka.js (POPULAR z home_main.js (do 15.10.2026 w index.html) ∩ tradycyjne kalendarze imieniny_tradycyjne.js).

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/^﻿/, '');

// ── dni wolne od pracy (silnik z kalendarz.html) ─────────────────────────────
const kal = read('kalendarz.html');
const a = kal.indexOf('const FIXED_HOLIDAYS'), b = kal.indexOf('const TODAY = new Date();');
if (a < 0 || b < 0) throw new Error('Nie znaleziono silnika świąt (FIXED_HOLIDAYS) w kalendarz.html');
const kalCtx = {}; vm.createContext(kalCtx);
vm.runInContext(kal.slice(a, b) + '\nthis.H={isHolidayDate,easterDateKal};', kalCtx);
const { isHolidayDate, easterDateKal } = kalCtx.H;

// ── święta i dni tematyczne (swieta_data.js) ─────────────────────────────────
const sdCtx = {}; vm.createContext(sdCtx);
vm.runInContext(read('swieta_data.js') + '\nthis.S={STATIC:SWIETA_DATA_STATIC,computeMovableSwieta};', sdCtx);
const swietaForYear = y => sdCtx.S.STATIC.concat(sdCtx.S.computeMovableSwieta(y)); // [d,m,nazwa,slug,typy]

// ── imieniny ─────────────────────────────────────────────────────────────────
const namesCtx = {}; vm.createContext(namesCtx);
vm.runInContext(read('home_names.js').replace(/^const NAMES/m, 'var NAMES') + '\nthis.N=NAMES;', namesCtx);
const NAMES = namesCtx.N; // [[m,d,[imiona]],...]
const tradCtx = {}; vm.createContext(tradCtx);
vm.runInContext(read('imieniny_tradycyjne.js').replace('const IMIENINY_TRAD', 'var IMIENINY_TRAD'), tradCtx);
const TRAD = tradCtx.IMIENINY_TRAD;
const POPULAR = new Set(eval(read('home_main.js').match(/const POPULAR=new Set\((\[[^\]]*\])\)/)[1]));
const nameByKey = {}; for (const [m, d, names] of NAMES) nameByKey[`${m}-${d}`] = names;

// imiona "główne" dnia: ta sama reguła co nagłówek strony głównej i /kartka/ (gen_kartka.js splitNames)
function mainNames(m, d) {
  const key = `${m}-${d}`, names = nameByKey[key] || [], trad = TRAD[key];
  let main = names.filter(n => POPULAR.has(n) && (!trad || trad.includes(n)));
  if (!main.length && trad) { const top = trad.slice(0, 3); main = names.filter(n => top.includes(n)); }
  if (!main.length) main = names.slice(0, 3);
  return main;
}

const PL_MONTHS = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];
const PL_MONTHS_GEN = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const PL_DOW = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];

// nazwy 14 dni ustawowo wolnych (daty liczy silnik z kalendarz.html)
const FIXED_NAMES = {
  '1-1': 'Nowy Rok', '1-6': 'Trzech Króli (Objawienie Pańskie)', '5-1': 'Święto Pracy',
  '5-3': 'Święto Konstytucji 3 Maja', '8-15': 'Wniebowzięcie NMP (Święto Wojska Polskiego)',
  '11-1': 'Wszystkich Świętych', '11-11': 'Narodowe Święto Niepodległości',
  '12-24': 'Wigilia Bożego Narodzenia', '12-25': 'Boże Narodzenie (pierwszy dzień)', '12-26': 'Boże Narodzenie (drugi dzień)',
};
const MOVABLE_NAMES = { 0: 'Wielkanoc (Niedziela Wielkanocna)', 1: 'Poniedziałek Wielkanocny', 49: 'Zesłanie Ducha Świętego (Zielone Świątki)', 60: 'Boże Ciało' };

function freeDayName(y, m, d) {
  if (!isHolidayDate(y, m, d)) return null;
  const fixed = FIXED_NAMES[`${m}-${d}`];
  if (fixed) return fixed;
  const e = easterDateKal(y).getTime();
  for (const off of Object.keys(MOVABLE_NAMES)) {
    const dt = new Date(e + off * 86400000);
    if (dt.getFullYear() === y && dt.getMonth() + 1 === m && dt.getDate() === d) return MOVABLE_NAMES[off];
  }
  throw new Error(`dzień wolny bez nazwy: ${y}-${m}-${d}`);
}

// wszystkie dni wolne roku: [{y,m,d,name,dow}] w kolejności dat
function freeDays(y) {
  const out = [];
  for (let m = 1; m <= 12; m++) for (let d = 1; d <= 31; d++) {
    const dt = new Date(y, m - 1, d); if (dt.getMonth() + 1 !== m) continue;
    const name = freeDayName(y, m, d);
    if (name) out.push({ y, m, d, name, dow: dt.getDay() });
  }
  return out;
}

// numer tygodnia ISO 8601
function isoWeek(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - dow);
  const y0 = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  return Math.ceil(((dt - y0) / 86400000 + 1) / 7);
}

const daysInMonth = (y, m) => new Date(y, m, 0).getDate();

// święta/dni tematyczne roku wg typów: Map('m-d' -> [{name,slug,types}]), kolejność jak w bazie
function observances(y, wantedTypes) {
  const want = new Set(wantedTypes), map = new Map();
  for (const [d, m, name, slug, types] of swietaForYear(y)) {
    const t = types.split(' ');
    if (!t.some(x => want.has(x))) continue;
    const key = `${m}-${d}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({ name, slug, types: t });
  }
  return map;
}

module.exports = { ROOT, isHolidayDate, easterDateKal, swietaForYear, mainNames, freeDayName, freeDays, isoWeek, daysInMonth, observances, PL_MONTHS, PL_MONTHS_GEN, ROMAN, PL_DOW };
