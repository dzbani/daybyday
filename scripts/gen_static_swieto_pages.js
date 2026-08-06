// Generuje statyczne podstrony swieto/<slug>/index.html na podstawie
// aktualnej tresci HOLIDAYS_DB wbudowanej w swieto.html.
// Analogiczne do gen_static_pages.js (imieniny), ten sam powod: strony
// osiagane przez ?id=... maja canonical wskazujacy zawsze na gole
// swieto.html, wiec Google nie traktuje ich jako unikalnej tresci.
// Generowane tu statyczne strony /swieto/<slug>/ maja wlasny, poprawny
// canonical i sa realnym celem linkowania wewnetrznego.
//
// Tryby:
//   node scripts/gen_static_swieto_pages.js                 -> pelny przebieg (wszystkie swieta)
//   node scripts/gen_static_swieto_pages.js --dry-run        -> jw. ale bez zapisu
//   node scripts/gen_static_swieto_pages.js --only=slug1,slug2
//   node scripts/gen_static_swieto_pages.js --changed-staged -> tylko swieta zmienione w
//                                                                zastawionym diffie swieto.html
//                                                                (uzywane przez hook pre-commit)

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execSync } = require('child_process');
const { regenerateRegistry } = require('./swieto_registry');

const ROOT = path.join(__dirname, '..');

// --- 1. Wczytaj HOLIDAYS_DB wbudowane w swieto.html ---
function loadHolidaysDb(source) {
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex(l => l.trim() === 'const HOLIDAYS_DB = {');
  if (start === -1) throw new Error('Nie znaleziono HOLIDAYS_DB w swieto.html');
  let end = -1;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].trim() === '};') { end = i; break; }
  }
  if (end === -1) throw new Error('Nie znaleziono konca HOLIDAYS_DB');
  const src = lines.slice(start, end + 1).join('\n');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(src + '\nthis.__DB__ = HOLIDAYS_DB;', sandbox);
  return sandbox.__DB__;
}

const htmlRaw = fs.readFileSync(path.join(ROOT, 'swieto.html'), 'utf8');
const HOLIDAYS_DB = loadHolidaysDb(htmlRaw);

function esc(s) { return String(s).replace(/"/g, '&quot;'); }

// Przycina opis do ~155 znakow (limit snippetu Google/Bing) na granicy slowa, z wielokropkiem.
function truncateDesc(str, maxLen = 155) {
  if (str.length <= maxLen) return str;
  const cut = str.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trim() + '…';
}

// Serializuje obiekt do <script type="application/ld+json">, escapujac "<" jako \u003c
// zeby tresc nigdy nie mogla przedwczesnie zamknac tagu <script>.
function jsonLdScript(obj) {
  return `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;
}

function buildTitle(h) {
  if (h.dayOff === true) return `${h.name} — kiedy wypada i czy to dzień wolny? | DaybyDay`;
  if (h.type === 'state' || h.type === 'religious') return `${h.name} — kiedy wypada? Czy to dzień wolny? | DaybyDay`;
  return `${h.name} — kiedy wypada? | DaybyDay`;
}

function buildPage(slug) {
  const h = HOLIDAYS_DB[slug];
  if (!h) return null;

  const metaDesc = truncateDesc(h.desc && h.desc[0] ? h.desc[0].replace(/<[^>]+>/g, '') : `${h.name} — ${h.date}. Historia, pochodzenie i tradycje.`);
  const descHtml = (h.desc || []).map(p => `<p>${p}</p>`).join('');
  const tradHtml = (h.traditions || []).map(t => `<li>${t}</li>`).join('');
  const relLinks = (h.related || []).map(rslug => {
    const rel = HOLIDAYS_DB[rslug];
    if (!rel) return '';
    const exists = fs.existsSync(path.join(ROOT, 'swieto', rslug));
    const href = exists ? `/swieto/${rslug}/` : `/swieto.html?id=${rslug}`;
    return `<li><a href="${href}">${rel.emoji} ${rel.name}</a></li>`;
  }).join('');

  const pageUrl = `https://daybyday.today/swieto/${slug}/`;
  const articleLd = jsonLdScript({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: h.name,
    description: metaDesc,
    url: pageUrl,
    inLanguage: 'pl',
    isPartOf: { '@type': 'WebSite', name: 'DaybyDay', url: 'https://daybyday.today/' },
  });
  const breadcrumbItems = [
    { name: 'DaybyDay', url: 'https://daybyday.today/' },
    { name: 'Święta', url: 'https://daybyday.today/swieta.html' },
    { name: h.name, url: pageUrl },
  ];
  const breadcrumbLd = jsonLdScript({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbItems.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: it.url })),
  });
  const breadcrumbHtml = `<nav class="breadcrumb" aria-label="breadcrumb">${breadcrumbItems.map((it, i) => i === breadcrumbItems.length - 1 ? `<span>${esc(it.name)}</span>` : `<a href="${it.url}">${esc(it.name)}</a>`).join(' › ')}</nav>`;

  return `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(buildTitle(h))}</title>
  <meta name="description" content="${esc(metaDesc)}">
  <link rel="canonical" href="${pageUrl}">
  <meta property="og:title" content="${esc(h.name)} | DaybyDay">
  <meta property="og:description" content="${esc(metaDesc)}">
  <meta property="og:url" content="${pageUrl}">
  <meta property="og:type" content="article">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  ${articleLd}
  ${breadcrumbLd}
  <script>(function(){var s=localStorage.getItem('dbd-theme');var p=window.matchMedia('(prefers-color-scheme:dark)').matches;document.documentElement.setAttribute('data-theme',s||(p?'dark':'light'));})();</script>
  <style>
    :root { --bg:#F8F7F5; --text:#1A1916; --muted:#555; --muted2:#888; --border:#e5e3de; color-scheme: light dark; }
    [data-theme="dark"] { --bg:#111110; --text:#F0EDE8; --muted:#B0ACA4; --muted2:#8A8680; --border:#2C2A27; }
    body { font-family: Georgia, serif; max-width: 680px; margin: 2rem auto; padding: 0 1rem; color: var(--text); background: var(--bg); line-height: 1.7; }
    h1 { font-size: 2rem; margin-bottom: .25rem; }
    .date { font-size: 1.1rem; color: var(--muted); margin-bottom: 1.5rem; }
    .info { display: flex; gap: 1.5rem; flex-wrap: wrap; margin-bottom: 1.5rem; font-size: .95rem; }
    .info b { display: block; font-size: .72rem; text-transform: uppercase; letter-spacing: .08em; color: var(--muted2); margin-bottom: .2rem; }
    .section-label { font-size: .75rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--muted2); margin: 1.5rem 0 .5rem; }
    ul { padding-left: 1.2rem; }
    a { color: var(--text); }
    .breadcrumb { font-size: .8rem; color: var(--muted2); margin-bottom: 1rem; }
    .breadcrumb a { color: var(--muted2); }
    .breadcrumb a:hover { color: var(--text); }
    #themeToggle { position: fixed; top: .75rem; right: .75rem; background: none; border: 1px solid var(--border); border-radius: 8px; width: 32px; height: 32px; cursor: pointer; font-size: 14px; color: var(--muted); font-family: inherit; line-height: 1; display: flex; align-items: center; justify-content: center; }
    #themeToggle:hover { background: var(--border); }
    #themeToggle::before { content: '☾'; }
    [data-theme="dark"] #themeToggle::before { content: '☀'; }
  </style>
</head>
<body>
  <button id="themeToggle" onclick="var d=document.documentElement,t=d.getAttribute('data-theme')==='dark'?'light':'dark';d.setAttribute('data-theme',t);localStorage.setItem('dbd-theme',t);" aria-label="Przełącz tryb ciemny/jasny" title="Tryb ciemny/jasny"></button>
  ${breadcrumbHtml}
  <h1>${esc(h.name)} ${h.emoji || ''}</h1>
  <p class="date">${esc(h.date)}</p>
  <div class="info">
    <div><b>Pochodzenie</b>${esc(h.origin || '')}</div>
    <div><b>Obchodzone w</b>${esc(h.observed || '')}</div>
  </div>
  <div>${descHtml}</div>
  ${tradHtml ? `<div class="section-label">Tradycje i zwyczaje</div><ul>${tradHtml}</ul>` : ''}
  ${relLinks ? `<div class="section-label">Powiązane święta</div><ul>${relLinks}</ul>` : ''}
  <p><a href="/swieto.html?id=${slug}">Pełne informacje →</a></p>
  <p><a href="/">← DaybyDay</a></p>
</body>
</html>
`;
}

function namesFromDiff(diffText) {
  const slugs = new Set();
  const re = /^[+-]\s*["']([a-z0-9-]+)["']:\s*\{/;
  for (const line of diffText.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    const m = line.match(re);
    if (m) slugs.add(m[1]);
  }
  return [...slugs];
}

function getChangedStagedSlugs() {
  let diff;
  try {
    diff = execSync('git diff --cached -- swieto.html', { cwd: ROOT, encoding: 'utf8', maxBuffer: 1024 * 1024 * 50 });
  } catch (e) {
    diff = '';
  }
  return namesFromDiff(diff);
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const onlyArg = args.find(a => a.startsWith('--only='));
  const changedStaged = args.includes('--changed-staged');
  const quiet = args.includes('--quiet');

  let candidateSlugs;
  if (changedStaged) {
    candidateSlugs = getChangedStagedSlugs();
    if (!quiet) console.log(`Wykryto ${candidateSlugs.length} zmienione święto/święta w zastawionym diffie: ${candidateSlugs.join(', ') || '(brak)'}`);
  } else if (onlyArg) {
    candidateSlugs = onlyArg.split('=')[1].split(',');
  } else {
    candidateSlugs = Object.keys(HOLIDAYS_DB);
  }

  let written = 0, unchanged = 0, skipped = 0;
  const writtenPaths = [];

  for (const slug of candidateSlugs) {
    const page = buildPage(slug);
    if (!page) { skipped++; continue; }
    const folder = path.join(ROOT, 'swieto', slug);
    if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
    const filePath = path.join(folder, 'index.html');
    const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
    if (existing === page) { unchanged++; continue; }
    if (!dryRun) fs.writeFileSync(filePath, page, 'utf8');
    written++;
    writtenPaths.push(path.relative(ROOT, filePath));
  }

  // --- Zregeneruj swieto_slugs.js / swieto_names.js / sitemap-swieto.xml (skan dysku, obejmuje tez lekkie strony) ---
  let registryStats = null;
  if (!dryRun) {
    registryStats = regenerateRegistry(ROOT);
    writtenPaths.push('swieto_slugs.js', 'swieto_names.js', 'sitemap-swieto.xml');
  }

  if (!quiet) {
    console.log(`Kandydatów: ${candidateSlugs.length}`);
    console.log(`Zapisanych/zmienionych: ${written}${dryRun ? ' (DRY RUN — nic nie zapisano)' : ''}`);
    console.log(`Bez zmian: ${unchanged}`);
    console.log(`Pominiętych (brak w HOLIDAYS_DB): ${skipped}`);
    if (registryStats) console.log(`Łącznie stron statycznych /swieto/*/: ${registryStats.slugCount}`);
  }

  if (changedStaged && !dryRun && writtenPaths.length) {
    execSync('git add -- ' + writtenPaths.map(p => `"${p}"`).join(' '), { cwd: ROOT });
    if (!quiet) console.log(`Zastawiono (git add) ${writtenPaths.length} plików.`);
  }
}

main();
