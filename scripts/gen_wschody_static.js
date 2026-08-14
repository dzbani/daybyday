// Wstrzykuje statyczne (server-side, w zrodle HTML) tabele miesieczne wschodow/zachodow
// slonca do wschody-zachody.html (i - przez reeksportowany buildMonthTabsAndSections -
// do kazdej z 12 stron /wschod-zachod-slonca/<miasto>/ generowanych przez
// gen_wschody_miasta.js). Powod: #monthTabs/#monthSections byly puste w zrodle HTML,
// cala tresc (366 dni x 12 miesiecy wschodow/zachodow) powstawala WYLACZNIE w JS -
// zerowa widocznosc dla crawlerow bez JS. Karta "dzis" i prognoza 7-dniowa CELOWO
// zostaja tylko w JS (z natury zalezne od biezacej daty - zamrozenie ich w statycznym
// HTML pokazywaloby nieaktualne "dzis" na zawsze, gorsze niz brak tresci).
//
// Klient JS (renderMonths() w wschody-zachody.html) i tak czysci (innerHTML='') i buduje
// #monthTabs/#monthSections od nowa przy kazdym zaladowaniu strony - ta statyczna wersja
// jest wiec czysto progresywnym wzbogaceniem (widoczna crawlerom/bez JS, na chwile
// przed hydracja u realnych uzytkownikow), zero zmian w logice klienta.
//
// Uzycie jako modul: const { buildMonthTabsAndSections } = require('./gen_wschody_static');
// Uzycie bezposrednie: node scripts/gen_wschody_static.js [--dry-run]  (patchuje dla Warszawy)

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SRC_PATH = path.join(ROOT, 'wschody-zachody.html');

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// --- Wyciagnij MONTHS_NOM/WEEKDAYS_SHORT + funkcje astro z wschody-zachody.html przez vm
// (jedno zrodlo prawdy - identyczny algorytm co klient JS uzywa na zywo). ---
const srcRaw = fs.readFileSync(SRC_PATH, 'utf8');
const codeStart = srcRaw.indexOf('const MONTHS_NOM');
const codeEnd = srcRaw.indexOf('function renderToday');
if (codeStart === -1 || codeEnd === -1) throw new Error('Nie znaleziono bloku MONTHS_NOM..fmtDuration w wschody-zachody.html');
const code = srcRaw.slice(codeStart, codeEnd);
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(code + '\nthis.__calc__ = { MONTHS_NOM, WEEKDAYS_SHORT, getSunTimes, fmtTime, fmtDuration };', sandbox);
const { MONTHS_NOM, WEEKDAYS_SHORT, getSunTimes, fmtTime, fmtDuration } = sandbox.__calc__;

// Buduje HTML tabel (12 zakladek + 12 sekcji tabel) dla danej lokalizacji.
// Miesiac o indeksie 0 (styczen) oznaczony jako aktywny - JS i tak nadpisze prawdziwym
// biezacym miesiacem przy starcie, wiec wybor tu jest arbitralny (stabilny, przewidywalny).
function buildMonthTabsAndSections(lat, lon) {
  let tabsHtml = '';
  let sectionsHtml = '';
  for (let mi = 0; mi < 12; mi++) {
    const activeCls = mi === 0 ? ' active' : '';
    tabsHtml += `<button class="month-tab${activeCls}">${esc(MONTHS_NOM[mi])}</button>`;

    const daysInMonth = new Date(2026, mi + 1, 0).getDate();
    let rows = '';
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(2026, mi, d);
      const t = getSunTimes(date, lat, lon);
      if (!t) continue; // biegunowa noc/dzien - teoretycznie nie wystapi w Polsce, ale bezpiecznik jak w kodzie klienta
      const dur = t.set - t.rise;
      rows += `<tr><td>${d}</td><td>${esc(WEEKDAYS_SHORT[date.getDay()])}</td><td>${fmtTime(t.rise)}</td><td>${fmtTime(t.set)}</td><td>${esc(fmtDuration(dur))}</td></tr>`;
    }
    sectionsHtml += `<div class="month-section${activeCls}" id="ms-sun-${mi}"><table class="mtable"><thead><tr><th>Dzień</th><th></th><th>☀️ Wschód</th><th>🌅 Zachód</th><th>Długość dnia</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  return { tabsHtml, sectionsHtml };
}

function patchFile(filePath, html, lat, lon, dryRun) {
  const { tabsHtml, sectionsHtml } = buildMonthTabsAndSections(lat, lon);
  const tabsRe = /<div class="month-tabs" id="monthTabs">[\s\S]*?<\/div><!--\/monthTabs-->/;
  const sectionsRe = /<div id="monthSections">[\s\S]*?<\/div><!--\/monthSections-->/;
  if (!tabsRe.test(html)) throw new Error(`Nie znaleziono markera #monthTabs w ${filePath}`);
  if (!sectionsRe.test(html)) throw new Error(`Nie znaleziono markera #monthSections w ${filePath}`);
  html = html.replace(tabsRe, `<div class="month-tabs" id="monthTabs">${tabsHtml}</div><!--/monthTabs-->`);
  html = html.replace(sectionsRe, `<div id="monthSections">${sectionsHtml}</div><!--/monthSections-->`);
  return html;
}

module.exports = { buildMonthTabsAndSections, patchFile };

if (require.main === module) {
  const DRY = process.argv.includes('--dry-run');
  const WARSZAWA = { lat: 52.23, lon: 21.01 };
  let html = patchFile(SRC_PATH, srcRaw, WARSZAWA.lat, WARSZAWA.lon, DRY);
  if (!DRY) fs.writeFileSync(SRC_PATH, html, 'utf8');
  console.log(`wschody-zachody.html ${DRY ? '(dry-run, nie zapisano)' : 'zaktualizowany'} — statyczne tabele miesięczne (Warszawa) wstrzyknięte do #monthTabs/#monthSections.`);
}
