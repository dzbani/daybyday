// Kalendarz księżycowy: /kalendarz-ksiezycowy/ (hub), /kalendarz-ksiezycowy/RRRR/ (fazy w całym roku) i
// /kalendarz-ksiezycowy/RRRR/<miesiac>/ (fazy z godzinami + tabela dzień po dniu) dla lat 2026–2032.
//
// Źródła (jedno źródło prawdy, bez nowych kopii logiki):
//  * momenty nowiu/kwadr/pełni: scripts/moon_phases.js (Meeus rozdz. 49; zweryfikowane z astronomy-engine, różnica < 20 s),
//  * oświetlenie (elongacja), wschód/górowanie/zachód Księżyca: wyciągane w vm z fazy-ksiezyca.html (elongAtJD, moonRiseTransitSet),
//  * znak zodiaku Księżyca: getMoonPhaseCompact z kalendarz.html (jak w tabelach /kalendarz/RRRR/<miesiac>/).
// Szablon powłoki (head, nawigacja, stopka) = wygenerowana strona kalendarz/2027/styczen/index.html (gen_kalendarz_miesiace.js),
// więc po zmianie nawigacji/stopki tam trzeba uruchomić najpierw tamten generator, potem ten.
//
// Użycie: node scripts/gen_kalendarz_ksiezycowy.js [--dry-run] [--years=2027,2028]

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { phasesInRange, plOffset, plTag, localParts } = require('./moon_phases');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://daybyday.today';
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const onlyArg = (args.find(a => a.startsWith('--years=')) || '').slice(8);
const YEARS_ALL = [2026, 2027, 2028, 2029, 2030, 2031, 2032];
const YEARS = onlyArg ? onlyArg.split(',').map(Number).filter(y => YEARS_ALL.includes(y)) : YEARS_ALL;
const LOC = { name: 'Poznań', lat: 52.4064, lon: 16.9252 }; // jak w kalendarz.html (LOC)

const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/^\uFEFF/, '');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pad = n => String(n).padStart(2, '0');

// ── funkcje astronomiczne z istniejących stron (vm) ──────────────────────────
const fazy = read('fazy-ksiezyca.html');
const fa = fazy.indexOf('function elongAtJD'), fb = fazy.indexOf('function getNext');
if (fa < 0 || fb < 0) throw new Error('fazy-ksiezyca.html: nie znaleziono elongAtJD/getNext');
const fctx = { Math, Date }; vm.createContext(fctx);
vm.runInContext('const DEG=Math.PI/180;const SYNODIC=29.53058867;\n' + fazy.slice(fa, fb) + '\nthis.M={elongAtJD,jdOf,moonRiseTransitSet};', fctx);
const { elongAtJD, jdOf, moonRiseTransitSet } = fctx.M;
const kal = read('kalendarz.html');
const ka = kal.indexOf('function pad(n)'), kb = kal.indexOf('function goToDay');
if (ka < 0 || kb < 0) throw new Error('kalendarz.html: nie znaleziono bloku funkcji');
const kctx = { Math, Date }; vm.createContext(kctx);
vm.runInContext(kal.slice(ka, kb) + '\nthis.K={getMoonPhaseCompact};', kctx);
const { getMoonPhaseCompact } = kctx.K;

// ── czas polski (scripts/moon_phases.js) ──
const plOff = plOffset, local = localParts;

const MONTHS = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];
const MONTH_GEN = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
const MONTH_LOC = ['styczniu', 'lutym', 'marcu', 'kwietniu', 'maju', 'czerwcu', 'lipcu', 'sierpniu', 'wrześniu', 'październiku', 'listopadzie', 'grudniu'];
const SLUGS = ['styczen', 'luty', 'marzec', 'kwiecien', 'maj', 'czerwiec', 'lipiec', 'sierpien', 'wrzesien', 'pazdziernik', 'listopad', 'grudzien'];
const DOW = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb'];
const Q = [{ icon: '🌑', name: 'Nów', short: 'Nów' }, { icon: '🌓', name: 'Pierwsza kwadra', short: 'I kwadra' }, { icon: '🌕', name: 'Pełnia', short: 'Pełnia' }, { icon: '🌗', name: 'Ostatnia kwadra', short: 'III kwadra' }];
const BETWEEN = [{ icon: '🌒', name: 'Wzrastający sierp' }, { icon: '🌔', name: 'Wzrastający garb' }, { icon: '🌖', name: 'Zanikający garb' }, { icon: '🌘', name: 'Zanikający sierp' }]; // po nowiu, po I kw., po pełni, po III kw.

const EV = phasesInRange(YEARS_ALL[0] - 1, YEARS_ALL[YEARS_ALL.length - 1] + 1).map(e => ({ q: e.q, utc: e.date.getTime(), loc: local(e.date.getTime()) }));
const evText = e => `${e.loc.d} ${MONTH_GEN[e.loc.m - 1]}, ${pad(e.loc.hh)}:${pad(e.loc.mm)}`;
const evMonth = (y, m) => EV.filter(e => e.loc.y === y && e.loc.m === m);

// ── dane dnia ────────────────────────────────────────────────────────────────
function monthData(y, m) {
  const dim = new Date(y, m, 0).getDate(), events = evMonth(y, m), rows = [];
  const byDay = new Map(events.map(e => [e.loc.d, e]));
  for (let d = 1; d <= dim; d++) {
    const noonUtc = Date.UTC(y, m - 1, d, 12) - plOff(Date.UTC(y, m - 1, d, 11)) * 3600000;
    const lastEv = EV.filter(e => e.utc < noonUtc).pop(), lastNew = EV.filter(e => e.q === 0 && e.utc < noonUtc).pop();
    const card = byDay.get(d);
    const ph = card ? Q[card.q] : BETWEEN[lastEv.q];
    const e = elongAtJD(jdOf(new Date(noonUtc)));
    const rs = moonRiseTransitSet(new Date(y, m - 1, d), LOC.lat, LOC.lon);
    rows.push({
      d, dow: new Date(y, m - 1, d).getDay(), card, ph,
      age: (noonUtc - lastNew.utc) / 86400000, ilum: Math.round((1 - Math.cos(e * Math.PI / 180)) / 2 * 100),
      rise: rs.rise, transit: rs.transit, set: rs.set, sign: getMoonPhaseCompact(y, m, d).sign,
    });
  }
  return { dim, events, rows };
}

// ── szablon powłoki ──────────────────────────────────────────────────────────
const TEMPLATE = read('kalendarz/2027/styczen/index.html');
const CSS = `
    .mc-lead { font-size:.95rem; color:var(--text); line-height:1.7; max-width:46rem; margin:0 0 1.4rem; }
    .mc-h2 { font-family:'Instrument Serif',serif; font-weight:400; font-size:clamp(1.4rem,3.2vw,1.8rem); margin:2rem 0 .7rem; letter-spacing:-.01em; }
    .mc-phases { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr)); gap:.8rem; margin-bottom:.4rem; }
    /* dokladnie 4 karty (hub, miesiace z 4 fazami): 2x2 do 900 px, 4 w rzedzie powyzej, 1 kolumna na telefonie - bez samotnej 4. karty */
    .mc-phases.mc-four { grid-template-columns:repeat(2,1fr); }
    @media(min-width:900px){ .mc-phases.mc-four { grid-template-columns:repeat(4,1fr); } }
    @media(max-width:480px){ .mc-phases.mc-four { grid-template-columns:1fr; } }
    .mc-ph { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); padding:.9rem 1.1rem; }
    .mc-ph .ic { font-size:1.6rem; line-height:1; }
    .mc-ph .nm { font-weight:600; font-size:.95rem; margin-top:.35rem; }
    .mc-ph .tm { font-size:.85rem; color:var(--muted); font-variant-numeric:tabular-nums; }
    .mc-note { font-size:.85rem; color:var(--muted); line-height:1.65; max-width:46rem; margin:.7rem 0 0; }
    .mc-note a { color:var(--text); text-underline-offset:3px; }
    table.cal-table td.mc-ic { font-size:1.15rem; }
    table.cal-table tr.mc-card td { background:var(--tag-bg); font-weight:600; }
    table.cal-table td.num { text-align:right; font-variant-numeric:tabular-nums; }
    table.cal-table tr.mc-card td.day-cell { color:var(--text); }
    .mc-years { display:flex; flex-wrap:wrap; gap:.5rem; margin:.4rem 0 1.4rem; }
    .mc-years a, .mc-years .cur { font-size:.9rem; font-weight:500; text-decoration:none; border:1px solid var(--border); border-radius:60px; padding:.5rem 1rem; min-height:44px; display:inline-flex; align-items:center; background:var(--surface); color:var(--text); }
    .mc-years .cur { background:var(--text); color:var(--bg); border-color:var(--text); }
    .mc-years a:hover { background:var(--tag-bg); }
    table.mc-year td, table.mc-year th { white-space:nowrap; font-variant-numeric:tabular-nums; }
    table.mc-year td.mo a { color:var(--text); font-weight:600; text-decoration:none; }
    table.mc-year td.mo a:hover { text-decoration:underline; }
    [data-theme="dark"] table.cal-table tr.mc-card td { background:var(--tag-bg); }
`;
function shell({ title, desc, url, ogTitle, headline, crumbs, body, year }) {
  let t = TEMPLATE;
  const rep = (re, to) => { if (!re.test(t)) throw new Error('Szablon: brak dopasowania ' + re); t = t.replace(re, () => to); };
  rep(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
  rep(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(desc)}">`);
  rep(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${url}">`);
  rep(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(ogTitle)}">`);
  rep(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(desc)}">`);
  rep(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${url}">`);
  const ld = [
    { '@context': 'https://schema.org', '@type': 'Article', headline, description: desc, url, inLanguage: 'pl', isPartOf: { '@type': 'WebSite', name: 'DaybyDay', url: SITE + '/' } },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c[0], item: c[1] })) },
  ].map(o => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`).join('\n  ');
  rep(/<script type="application\/ld\+json">[\s\S]*?<\/script>\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/, ld);
  const a = t.indexOf('<div class="page">'), b = t.indexOf('<footer>');
  if (a < 0 || b < 0) throw new Error('Szablon: brak <div class="page"> / <footer>');
  t = t.slice(0, a) + '<div class="page">\n' + body + '\n</div>\n\n' + t.slice(b);
  t = t.replace(/&copy; \d{4} daybyday\.today/, `&copy; daybyday.today`);
  t = t.replace('</head>', `  <style id="mc-css">${CSS}  </style>\n</head>`);
  return t;
}
const breadcrumbHtml = items => `<nav class="breadcrumb" aria-label="breadcrumb">${items.map((it, i) => i === items.length - 1 ? `<span>${esc(it[0])}</span>` : `<a href="${it[1]}">${esc(it[0])}</a>`).join(' › ')}</nav>`;

const HUB = `${SITE}/kalendarz-ksiezycowy/`;
const yearsNav = cur => `<nav class="mc-years" aria-label="Kalendarz księżycowy na inne lata">${YEARS_ALL.map(v => v === cur ? `<span class="cur" aria-current="page">${v}</span>` : `<a href="/kalendarz-ksiezycowy/${v}/">${v}</a>`).join('')}</nav>`;
const HOW = `Momenty nowiu, kwadr i pełni liczymy ze wzorów astronomicznych (Meeus, „Astronomical Algorithms”), z dokładnością do ok. minuty, i podajemy w czasie polskim (CET zimą, CEST latem). Wschody, górowania i zachody Księżyca podajemy dla Poznania; w innych miejscowościach w Polsce różnią się o kilkadziesiąt minut.`;

// ── strona miesiąca ──────────────────────────────────────────────────────────
function monthPage(y, m) {
  const { dim, events, rows } = monthData(y, m), mn = MONTHS[m - 1], mnl = MONTH_LOC[m - 1], slug = SLUGS[m - 1];
  const url = `${SITE}/kalendarz-ksiezycowy/${y}/${slug}/`;
  const fulls = events.filter(e => e.q === 2), news = events.filter(e => e.q === 0);
  const lead = events.map(e => `${Q[e.q].name.toLowerCase()} ${evText(e)}`).join('; ');
  const tag = [...new Set(events.map(e => plTag(e.utc)))].join('/');
  const desc = `Kalendarz księżycowy na ${mn.toLowerCase()} ${y}: ${news.length ? 'nów ' + evText(news[0]) + ', ' : ''}${fulls.length ? 'pełnia ' + evText(fulls[0]) + ', ' : ''}kwadry z godzinami, oświetlenie oraz wschody i zachody Księżyca dla Poznania.`;
  const cards = events.map(e => `<div class="mc-ph"><div class="ic">${Q[e.q].icon}</div><div class="nm">${Q[e.q].name}</div><div class="tm">${evText(e)} (${plTag(e.utc)})</div></div>`).join('');
  const blue = fulls.length > 1 ? `<p class="mc-note">W ${mnl} ${y} są dwie pełnie: ${evText(fulls[0])} i ${evText(fulls[1])}. Drugą pełnię w miesiącu kalendarzowym nazywa się „niebieskim księżycem”.</p>` : '';
  const monthsNeed = news.length > 1 ? `<p class="mc-note">W ${mnl} ${y} wypadają dwa nowie: ${evText(news[0])} i ${evText(news[1])}.</p>` : '';
  const trs = rows.map(r => `<tr${r.card ? ' class="mc-card"' : ''}><td class="day-cell"><a href="/kartka/${pad(m)}-${pad(r.d)}/">${r.d} ${DOW[r.dow]}</a></td><td class="mc-ic">${r.ph.icon}</td><td>${r.ph.name}</td><td class="num">${r.age.toFixed(1).replace('.', ',')}</td><td class="num">${r.ilum}%</td><td>${r.rise}</td><td>${r.transit}</td><td>${r.set}</td><td>${esc(r.sign)}</td></tr>`).join('');
  const pm = m === 1 ? [y - 1, 12] : [y, m - 1], nm = m === 12 ? [y + 1, 1] : [y, m + 1];
  const prevL = YEARS_ALL.includes(pm[0]) ? `<a href="/kalendarz-ksiezycowy/${pm[0]}/${SLUGS[pm[1] - 1]}/">← ${MONTHS[pm[1] - 1]} ${pm[0]}</a>` : '<span></span>';
  const nextL = YEARS_ALL.includes(nm[0]) ? `<a href="/kalendarz-ksiezycowy/${nm[0]}/${SLUGS[nm[1] - 1]}/">${MONTHS[nm[1] - 1]} ${nm[0]} →</a>` : '<span></span>';
  const chips = SLUGS.map((s, i) => `<a href="/kalendarz-ksiezycowy/${y}/${s}/" class="month-chip${i === m - 1 ? ' active' : ''}">${MONTHS[i]}</a>`).join('');
  const others = YEARS_ALL.filter(v => v !== y).map(v => `<a href="/kalendarz-ksiezycowy/${v}/${slug}/" class="month-chip">${mn} ${v}</a>`).join('');
  const crumbs = [['DaybyDay', SITE + '/'], ['Kalendarz księżycowy', HUB], [String(y), `${SITE}/kalendarz-ksiezycowy/${y}/`], [mn, url]];
  const body = `  ${breadcrumbHtml(crumbs)}
  <div class="page-label">Kalendarz księżycowy</div>
  <h1 class="page-title">Kalendarz księżycowy — ${mn.toLowerCase()} ${y}</h1>
  <p class="mc-lead">W ${mnl} ${y} Księżyc przechodzi przez następujące fazy: ${lead}. Czasy podano w czasie polskim (${tag}).</p>

  <div class="month-nav">${prevL}<a href="/kalendarz-ksiezycowy/${y}/">Cały rok ${y} →</a>${nextL}</div>

  <h2 class="mc-h2">Fazy Księżyca w ${mnl} ${y}</h2>
  <div class="mc-phases${events.length === 4 ? ' mc-four' : ''}">${cards}</div>
  ${blue}${monthsNeed}

  <h2 class="mc-h2">Księżyc dzień po dniu — ${mn.toLowerCase()} ${y}</h2>
  <div class="cal-table-wrap">
    <table class="cal-table">
      <thead><tr><th>Dzień</th><th></th><th>Faza</th><th>Wiek (dni)</th><th>Oświetlenie</th><th>Wschód</th><th>Górowanie</th><th>Zachód</th><th>Księżyc w znaku</th></tr></thead>
      <tbody>${trs}</tbody>
    </table>
  </div>
  <p class="mc-note">Wiek to liczba dni od ostatniego nowiu, a oświetlenie — jaka część tarczy jest oświetlona, obie wartości dla południa czasu polskiego. Dzień z kolorowym tłem to dzień, w którym wypada nów, kwadra lub pełnia. ${HOW}</p>

  <div class="chips-section" style="margin-top:2rem"><div class="chips-label">Inne miesiące ${y}</div><div class="chips">${chips}</div></div>
  <div class="chips-section"><div class="chips-label">${mn} w innych latach</div><div class="chips">${others}</div></div>
  <p class="mc-note">Zobacz też: <a href="/kalendarz/${y}/${slug}/">kalendarz na ${mn.toLowerCase()} ${y} (święta, wschody i zachody Słońca)</a> · <a href="/fazy-ksiezyca.html">aktualna faza Księżyca i najbliższe fazy</a> · <a href="/kalendarz-ksiezycowy/">o kalendarzu księżycowym</a>.</p>`;
  return shell({ title: `Kalendarz księżycowy ${mn.toLowerCase()} ${y} — pełnia, nów, fazy | DaybyDay`, desc, url, ogTitle: `Kalendarz księżycowy ${mn.toLowerCase()} ${y}`, headline: `Kalendarz księżycowy — ${mn.toLowerCase()} ${y}`, crumbs, body, year: y });
}

// ── strona roku ──────────────────────────────────────────────────────────────
function yearPage(y) {
  const url = `${SITE}/kalendarz-ksiezycowy/${y}/`;
  const yEv = EV.filter(e => e.loc.y === y), n = q => yEv.filter(e => e.q === q).length;
  const fullDates = yEv.filter(e => e.q === 2).map(e => `${e.loc.d} ${MONTH_GEN[e.loc.m - 1]}`);
  const blueMonths = MONTHS.map((mn, i) => ({ mn, f: yEv.filter(e => e.q === 2 && e.loc.m === i + 1) })).filter(x => x.f.length > 1);
  const trs = MONTHS.map((mn, i) => {
    const cell = q => yEv.filter(e => e.q === q && e.loc.m === i + 1).map(e => `${e.loc.d} ${MONTH_GEN[e.loc.m - 1].slice(0, 3)}, ${pad(e.loc.hh)}:${pad(e.loc.mm)}`).join('<br>') || '—';
    return `<tr><td class="mo"><a href="/kalendarz-ksiezycowy/${y}/${SLUGS[i]}/">${mn}</a></td><td>${cell(0)}</td><td>${cell(1)}</td><td>${cell(2)}</td><td>${cell(3)}</td></tr>`;
  }).join('');
  const desc = `Kalendarz księżycowy ${y}: wszystkie nowie, kwadry i pełnie w roku z godzinami (czas polski) — ${n(2)} pełni i ${n(0)} nowiów. Wybierz miesiąc, żeby zobaczyć Księżyc dzień po dniu.`;
  const crumbs = [['DaybyDay', SITE + '/'], ['Kalendarz księżycowy', HUB], [String(y), url]];
  const blue = blueMonths.length ? `<p class="mc-note">W ${y} roku jest ${blueMonths.length === 1 ? 'miesiąc z dwiema pełniami' : 'kilka miesięcy z dwiema pełniami'}: ${blueMonths.map(b => `${MONTH_LOC[MONTHS.indexOf(b.mn)]} (${b.f.map(e => e.loc.d).join(' i ')})`).join(', ')}. Drugą pełnię w miesiącu kalendarzowym nazywa się „niebieskim księżycem”.</p>` : '';
  const body = `  ${breadcrumbHtml(crumbs)}
  <div class="page-label">Kalendarz księżycowy</div>
  <h1 class="page-title">Kalendarz księżycowy ${y}</h1>
  <p class="mc-lead">W ${y} roku jest ${n(2)} pełni, ${n(0)} nowiów oraz ${n(1)} pierwszych i ${n(3)} ostatnich kwadr. Poniżej wszystkie fazy z godzinami w czasie polskim; kliknij nazwę miesiąca, żeby zobaczyć Księżyc dzień po dniu (oświetlenie, wschody i zachody).</p>
  ${yearsNav(y)}
  <div class="cal-table-wrap">
    <table class="cal-table mc-year">
      <thead><tr><th>Miesiąc</th><th>🌑 Nów</th><th>🌓 I kwadra</th><th>🌕 Pełnia</th><th>🌗 III kwadra</th></tr></thead>
      <tbody>${trs}</tbody>
    </table>
  </div>
  ${blue}
  <p class="mc-note">Pełnie w ${y} roku: ${fullDates.join(', ')}. ${HOW}</p>
  <p class="mc-note">Zobacz też: <a href="/kalendarz/${y}/">kalendarz ${y} (święta, wschody i zachody Słońca)</a> · <a href="/kalendarz-do-druku/${y}/">kalendarz ${y} do druku</a> · <a href="/fazy-ksiezyca.html">aktualna faza Księżyca</a>.</p>`;
  return shell({ title: `Kalendarz księżycowy ${y} — pełnie, nowie, fazy Księżyca | DaybyDay`, desc, url, ogTitle: `Kalendarz księżycowy ${y}`, headline: `Kalendarz księżycowy ${y}`, crumbs, body, year: y });
}

// ── hub ──────────────────────────────────────────────────────────────────────
function hubPage() {
  const first = YEARS_ALL[0], last = YEARS_ALL[YEARS_ALL.length - 1];
  const crumbs = [['DaybyDay', SITE + '/'], ['Kalendarz księżycowy', HUB]];
  const desc = `Kalendarz księżycowy ${first}–${last}: kiedy jest pełnia, nów i kwadry Księżyca, z godzinami w czasie polskim, oświetleniem tarczy oraz wschodami i zachodami Księżyca miesiąc po miesiącu.`;
  const body = `  ${breadcrumbHtml(crumbs)}
  <div class="page-label">Księżyc</div>
  <h1 class="page-title">Kalendarz księżycowy ${first}–${last}</h1>
  <p class="mc-lead">Kiedy jest pełnia, a kiedy nów? Wybierz rok, żeby zobaczyć wszystkie fazy Księżyca z godzinami, albo przejdź od razu do miesiąca — dla każdego dnia podajemy fazę, wiek Księżyca, oświetlenie tarczy oraz godziny wschodu, górowania i zachodu.</p>
  ${yearsNav(0)}
  <h2 class="mc-h2">Cztery fazy Księżyca</h2>
  <div class="mc-phases mc-four">${Q.map(q => `<div class="mc-ph"><div class="ic">${q.icon}</div><div class="nm">${q.name}</div><div class="tm">${['Księżyc między Ziemią a Słońcem, tarcza nieoświetlona od strony Ziemi.', 'Oświetlona prawa połowa tarczy (na półkuli północnej), Księżyc rośnie.', 'Księżyc po przeciwnej stronie Ziemi niż Słońce, oświetlona cała tarcza.', 'Oświetlona lewa połowa tarczy (na półkuli północnej), Księżyc maleje.'][Q.indexOf(q)]}</div></div>`).join('')}</div>
  <p class="mc-note">Pełny cykl faz (miesiąc synodyczny) trwa średnio 29,53 doby, ale poszczególne cykle różnią się o kilka godzin, dlatego w roku wypada 12 lub 13 pełni. ${HOW}</p>
  <h2 class="mc-h2">Co jest w kalendarzu księżycowym</h2>
  <p class="mc-note" style="margin-top:0">Strona roku zawiera zestawienie wszystkich nowiów, kwadr i pełni z godzinami. Strona miesiąca — tabelę dzień po dniu: faza, wiek Księżyca w dniach od nowiu, oświetlenie w procentach, wschód, górowanie i zachód Księżyca oraz znak zodiaku, w którym znajduje się Księżyc. Aktualną fazę i najbliższe zmiany faz pokazuje strona <a href="/fazy-ksiezyca.html">Fazy Księżyca</a>.</p>`;
  return shell({ title: `Kalendarz księżycowy ${first}–${last} — pełnia, nów, fazy Księżyca | DaybyDay`, desc, url: HUB, ogTitle: `Kalendarz księżycowy ${first}–${last}`, headline: `Kalendarz księżycowy ${first}–${last}`, crumbs, body, year: new Date().getFullYear() });
}

// ── zapis ────────────────────────────────────────────────────────────────────
let changed = 0, same = 0;
function write(rel, html) {
  const f = path.join(ROOT, rel, 'index.html');
  const cur = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
  if (cur === html) { same++; return; }
  changed++;
  if (!DRY) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, html, 'utf8'); }
}
if (!onlyArg) write('kalendarz-ksiezycowy', hubPage());
for (const y of YEARS) {
  write(`kalendarz-ksiezycowy/${y}`, yearPage(y));
  for (let m = 1; m <= 12; m++) write(`kalendarz-ksiezycowy/${y}/${SLUGS[m - 1]}`, monthPage(y, m));
}
console.log(`kalendarz-ksiezycowy: lata ${YEARS.join(', ')} — ${DRY ? 'zmieniłoby się' : 'zapisano'}: ${changed}, bez zmian: ${same}${DRY ? ' (dry-run)' : ''}`);
