// Skanuje wszystkie strony .html w repo i sprawdza, czy każdy wewnętrzny href="..."
// (root-relative "/..." lub pełny "https://daybyday.today/...") wskazuje na realnie
// istniejący plik/katalog. Kod JS wewnątrz <script> jest pomijany, żeby stringi
// budowane przez konkatenację (np. href="/x/'+slug+'/") nie dawały fałszywych trafień.
// Użycie: node scripts/link_check.js

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DOMAIN = 'https://daybyday.today';

const EXCLUDE_DIRS = new Set(['.git', 'node_modules', 'scripts', 'fonts', '.githooks']);

function walk(dir, out, htmlOut) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), out, htmlOut);
    } else if (entry.isFile()) {
      out.push(path.join(dir, entry.name));
      if (entry.name.endsWith('.html')) htmlOut.push(path.join(dir, entry.name));
    }
  }
}

const allFiles = [];
const allHtmlFiles = [];
walk(ROOT, allFiles, allHtmlFiles);
console.log(`Znaleziono ${allFiles.length} plików łącznie, w tym ${allHtmlFiles.length} .html.`);

// Zbiór poprawnych ścieżek URL, które odpowiadają realnemu plikowi (dowolnego typu).
const validPaths = new Set();
for (const f of allFiles) {
  const rel = path.relative(ROOT, f).split(path.sep).join('/');
  const urlPath = '/' + rel;
  validPaths.add(urlPath); // dokładny plik, np. /imieniny/aaron/index.html lub /favicon.svg
  if (rel.endsWith('/index.html')) {
    const dirForm = '/' + rel.slice(0, -('index.html'.length));
    validPaths.add(dirForm); // np. /imieniny/aaron/
    validPaths.add(dirForm.slice(0, -1)); // np. /imieniny/aaron (bez ukośnika)
  }
  if (rel === 'index.html') {
    validPaths.add('/');
  }
}

const HREF_RE = /href="([^"]*)"/g;
const SKIP_SCHEMES = /^(mailto:|tel:|javascript:|#)/i;

let totalLinks = 0;
let brokenCount = 0;
const brokenMap = new Map(); // cel -> Set(strony źródłowe)

for (const f of allHtmlFiles) {
  const rel = '/' + path.relative(ROOT, f).split(path.sep).join('/');
  const content = fs.readFileSync(f, 'utf8').replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  let m;
  HREF_RE.lastIndex = 0;
  while ((m = HREF_RE.exec(content)) !== null) {
    let href = m[1];
    if (!href || SKIP_SCHEMES.test(href)) continue;

    let internal = false;
    let urlPath = href;
    if (href.startsWith(DOMAIN)) {
      urlPath = href.slice(DOMAIN.length);
      internal = true;
    } else if (href.startsWith('/') && !href.startsWith('//')) {
      internal = true;
    }
    if (!internal) continue; // inna domena, protocol-relative itp.

    totalLinks++;

    urlPath = urlPath.split('#')[0].split('?')[0];
    if (urlPath === '') urlPath = '/';

    if (!validPaths.has(urlPath)) {
      brokenCount++;
      if (!brokenMap.has(urlPath)) brokenMap.set(urlPath, new Set());
      brokenMap.get(urlPath).add(rel);
    }
  }
}

console.log(`Sprawdzono ${totalLinks} linków wewnętrznych.`);
console.log(`Znaleziono ${brokenCount} złamanych odniesień, ${brokenMap.size} unikalnych martwych celów.\n`);

const sorted = [...brokenMap.entries()].sort((a, b) => b[1].size - a[1].size);
for (const [target, sources] of sorted) {
  const srcArr = [...sources];
  console.log(`MARTWY CEL: ${target}  (${srcArr.length} odwołań)`);
  console.log(`  np. z: ${srcArr.slice(0, 3).join(', ')}${srcArr.length > 3 ? ' ...' : ''}`);
}
