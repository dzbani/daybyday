// Generuje kalendarze ICS do subskrypcji/pobrania w katalogu ics/ (Google Calendar, Apple, Outlook, Thunderbird).
// Wszystkie wydarzenia całodniowe (VALUE=DATE), TRANSP:TRANSPARENT (święto nie blokuje czasu).
// Dane z tych samych źródeł co strona: scripts/cal_data.js (dni wolne z kalendarz.html, święta z swieta_data.js)
// oraz niedziele handlowe odczytane ze strony niedziele-handlowe.html (z kontrolą zgodności z licznikami na niej).
//
// Użycie: node scripts/gen_ics.js [--years=2026-2032]
// Pliki: ics/dni-wolne-od-pracy.ics, ics/swieta-panstwowe-i-koscielne.ics, ics/dni-okolicznosciowe.ics,
//        ics/niedziele-handlowe.ics. DTSTAMP/LAST-MODIFIED zmienia się tylko, gdy zmieniła się treść pliku
// (dzięki temu ponowne uruchomienie niczego nie zmienia w gicie).

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const C = require('./cal_data');

const ROOT = C.ROOT;
const OUT = path.join(ROOT, 'ics');
const SITE = 'https://daybyday.today';
const argYears = (process.argv.find(a => a.startsWith('--years=')) || '').split('=')[1] || '2026-2032';
const [Y0, Y1] = argYears.split('-').map(Number);
const YEARS = []; for (let y = Y0; y <= (Y1 || Y0); y++) YEARS.push(y);
const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');

// strony /swieto/<slug>/ istniejące na dysku (jak SWIETO_SLUGS na stronie)
const slugCtx = {}; vm.createContext(slugCtx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'swieto_slugs.js'), 'utf8').replace(/^\uFEFF/, '').replace(/^const /m, 'var ') + '\nthis.S=(typeof SWIETO_SLUGS!=="undefined")?SWIETO_SLUGS:new Set();', slugCtx);
const SWIETO_SLUGS = slugCtx.S;
const swietoUrl = slug => (slug && SWIETO_SLUGS.has(slug)) ? `${SITE}/swieto/${slug}/` : null;

// ── pomocnicze: format ICS (RFC 5545) ────────────────────────────────────────
const esc = s => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function fold(line) { // zawijanie po 75 oktetach UTF-8, kontynuacja zaczyna się spacją
  const enc = Buffer.from(line, 'utf8');
  if (enc.length <= 75) return line;
  const out = []; let cur = '', curBytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch, 'utf8');
    if (curBytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ch; curBytes = b; } else { cur += ch; curBytes += b; }
  }
  out.push(cur);
  return out.map((s, i) => (i ? ' ' : '') + s).join('\r\n');
}
const pad = n => String(n).padStart(2, '0');
const ymd = (y, m, d) => `${y}${pad(m)}${pad(d)}`;
const nextDay = (y, m, d) => { const dt = new Date(Date.UTC(y, m - 1, d + 1)); return ymd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()); };

function vevent(e) {
  const l = ['BEGIN:VEVENT', `UID:${e.uid}@daybyday.today`, 'DTSTAMP:@@STAMP@@', `DTSTART;VALUE=DATE:${ymd(e.y, e.m, e.d)}`, `DTEND;VALUE=DATE:${nextDay(e.y, e.m, e.d)}`,
    `SUMMARY:${esc(e.summary)}`];
  if (e.desc) l.push(`DESCRIPTION:${esc(e.desc)}`);
  if (e.url) l.push(`URL:${e.url}`);
  if (e.cat) l.push(`CATEGORIES:${esc(e.cat)}`);
  l.push('TRANSP:TRANSPARENT', 'LAST-MODIFIED:@@STAMP@@', 'END:VEVENT');
  return l.map(fold).join('\r\n');
}
function vcalendar(name, desc, events) {
  const head = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//DaybyDay//Kalendarze//PL', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(name)}`, `X-WR-CALDESC:${esc(desc)}`, 'X-WR-TIMEZONE:Europe/Warsaw', 'REFRESH-INTERVAL;VALUE=DURATION:P1D', 'X-PUBLISHED-TTL:P1D'].map(fold);
  return head.join('\r\n') + '\r\n' + events.map(vevent).join('\r\n') + '\r\nEND:VCALENDAR\r\n';
}

// ── źródła ───────────────────────────────────────────────────────────────────
function freeDayEvents() {
  const ev = [];
  for (const y of YEARS) for (const f of C.freeDays(y)) {
    const wk = f.dow === 0 ? ' (wypada w niedzielę)' : f.dow === 6 ? ' (wypada w sobotę — pracodawca wyznacza inny dzień wolny)' : '';
    ev.push({ uid: `dzien-wolny-${ymd(y, f.m, f.d)}`, y, m: f.m, d: f.d, summary: `${f.name}`, cat: 'Dzień wolny od pracy',
      desc: `Dzień ustawowo wolny od pracy w Polsce${wk}. Więcej: ${SITE}/swieta.html`, url: `${SITE}/swieta.html` });
  }
  return ev;
}
function observanceEvents(types, cat, skipFree) {
  const ev = [];
  for (const y of YEARS) {
    const map = C.observances(y, types);
    for (const [key, list] of map) {
      const [m, d] = key.split('-').map(Number);
      for (const o of list) {
        ev.push({ uid: `${o.slug || 'swieto'}-${ymd(y, m, d)}`, y, m, d, summary: o.name, cat,
          desc: `${o.name}.${swietoUrl(o.slug) ? ' Więcej: ' + swietoUrl(o.slug) : ''}`, url: swietoUrl(o.slug) || `${SITE}/swieta.html` });
      }
    }
  }
  return ev;
}
const MONTH_IDX = { stycznia: 1, lutego: 2, marca: 3, kwietnia: 4, maja: 5, czerwca: 6, lipca: 7, sierpnia: 8, września: 9, października: 10, listopada: 11, grudnia: 12 };
function tradingSundayEvents() {
  const html = fs.readFileSync(path.join(ROOT, 'niedziele-handlowe.html'), 'utf8');
  const rows = [...html.matchAll(/<div class="sunday-row[^"]*"><div class="sun-date">(\d{1,2}) ([a-ząćęłńóśźż]+) (\d{4})<\/div><div class="sun-status"><div class="sun-dot"[^>]*><\/div><div class="sun-name">([^<]*)<\/div><\/div><span class="sun-badge ([^"]*)">([^<]*)<\/span>/g)];
  if (!rows.length) throw new Error('niedziele-handlowe.html: nie znaleziono wierszy niedziel (zmieniła się struktura strony?)');
  const stat = {}; // liczniki ze strony: "N niedziel handlowych w ROKU"
  for (const m of html.matchAll(/<div class="stat-num">(\d+)<\/div><div class="stat-label">niedziel handlowych w (\d{4})/g)) stat[m[2]] = +m[1];
  const ev = [], perYear = {};
  for (const r of rows) {
    const d = +r[1], m = MONTH_IDX[r[2]], y = +r[3], name = r[4].trim(), open = /Otwarte/.test(r[6]);
    if (!m) throw new Error('nieznany miesiąc: ' + r[2]);
    if (!open || !YEARS.includes(y)) continue;
    perYear[y] = (perYear[y] || 0) + 1;
    const why = name.replace(/^Niedziela handlowa\s*—\s*/, '');
    ev.push({ uid: `niedziela-handlowa-${ymd(y, m, d)}`, y, m, d, summary: 'Niedziela handlowa', cat: 'Niedziela handlowa',
      desc: `Niedziela handlowa (sklepy otwarte): ${why}. Pełna lista: ${SITE}/niedziele-handlowe.html`, url: `${SITE}/niedziele-handlowe.html` });
  }
  for (const [y, n] of Object.entries(perYear)) if (stat[y] !== undefined && stat[y] !== n) throw new Error(`niedziele handlowe ${y}: odczytano ${n}, licznik na stronie ${stat[y]}`);
  return ev;
}

const FEEDS = [
  { file: 'dni-wolne-od-pracy.ics', name: 'Dni wolne od pracy w Polsce', desc: `Ustawowo wolne od pracy dni w Polsce ${Y0}–${Y1} (z Wigilią). daybyday.today`, events: freeDayEvents },
  { file: 'swieta-panstwowe-i-koscielne.ics', name: 'Święta państwowe i kościelne (Polska)', desc: `Święta państwowe i kościelne w Polsce ${Y0}–${Y1} wraz ze świętami ruchomymi. daybyday.today`, events: () => observanceEvents(['panstwowe', 'koscielne'], 'Święto') },
  { file: 'dni-okolicznosciowe.ics', name: 'Dni okolicznościowe (Dzień Matki, Walentynki…)', desc: `Popularne dni okolicznościowe ${Y0}–${Y1}: Walentynki, Dzień Kobiet, Matki, Babci, Tłusty Czwartek itd. daybyday.today`, events: () => observanceEvents(['nieoficjalne'], 'Dzień okolicznościowy') },
  { file: 'niedziele-handlowe.ics', name: 'Niedziele handlowe w Polsce', desc: `Niedziele, w które sklepy są otwarte (${Y0}–${Y1}). Dane ze strony daybyday.today/niedziele-handlowe.html`, events: tradingSundayEvents },
];

fs.mkdirSync(OUT, { recursive: true });
let changed = 0;
for (const f of FEEDS) {
  const events = f.events().sort((a, b) => ymd(a.y, a.m, a.d).localeCompare(ymd(b.y, b.m, b.d)) || a.uid.localeCompare(b.uid));
  const seen = new Set();
  for (const e of events) { if (seen.has(e.uid)) throw new Error('powtórzony UID: ' + e.uid); seen.add(e.uid); }
  const fp = path.join(OUT, f.file);
  const body = vcalendar(f.name, f.desc, events);
  const strip = s => s.replace(/DTSTAMP:\S+|LAST-MODIFIED:\S+/g, '');
  const existing = fs.existsSync(fp) ? fs.readFileSync(fp, 'utf8') : '';
  // stały DTSTAMP gdy treść bez zmian — ponowne uruchomienie nie zmienia pliku
  const prevStamp = (existing.match(/DTSTAMP:(\S+)/) || [])[1];
  const withStamp = st => body.replace(/@@STAMP@@/g, st);
  let out = withStamp(`${today}T000000Z`);
  if (existing && strip(existing) === strip(out) && prevStamp) out = existing;
  if (out !== existing) { fs.writeFileSync(fp, out, 'utf8'); changed++; }
  console.log(`${f.file.padEnd(36)} ${String(events.length).padStart(4)} wydarzeń  ${String(Math.round(Buffer.byteLength(out) / 1024)).padStart(3)} KB  ${out === existing ? '(bez zmian)' : '(zapisano)'}`);
}
console.log(`lata ${Y0}–${Y1}, zmienionych plików: ${changed}`);
