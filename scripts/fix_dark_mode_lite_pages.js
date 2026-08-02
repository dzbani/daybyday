// Naprawia strony /imieniny/<slug>/ bez wpisu w NAME_DESCRIPTIONS_RICH (a wiec nie
// dotykane przez gen_static_pages.js) - dodaje obsluge trybu ciemnego (ten sam
// mechanizm co index.html: localStorage 'dbd-theme' + prefers-color-scheme).
// Dziala tekstowo (string-replace) na starym, sztywnym bloku <style>, bo wszystkie
// te strony maja identyczny szablon (zweryfikowane na probce przed napisaniem skryptu).
//
// Uzycie:
//   node scripts/fix_dark_mode_lite_pages.js --dry-run
//   node scripts/fix_dark_mode_lite_pages.js

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DRY = process.argv.includes('--dry-run');

const OLD_STYLE = `  <style>
    :root { color-scheme: light; }
    body { font-family: Georgia, serif; max-width: 680px; margin: 2rem auto; padding: 0 1rem; color: #1A1916; background: #F8F7F5; line-height: 1.7; }
    h1 { font-size: 2rem; margin-bottom: .5rem; }
    h2 { font-size: 1.2rem; font-weight: 700; margin: 1.5rem 0 .4rem; }
    .dates { font-size: 1.1rem; color: #555; margin-bottom: 1.5rem; }
    .name-desc-section { margin-bottom: 1.25rem; }
    .name-desc-label { font-size: .75rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: #888; margin-bottom: .4rem; }
    .patron-section { border-top: 1px solid #e5e3de; margin-top: 1.5rem; padding-top: 1.25rem; }
    a { color: #1A1916; }
  </style>
</head>
<body>`;

const NEW_STYLE = `  <script>(function(){var s=localStorage.getItem('dbd-theme');var p=window.matchMedia('(prefers-color-scheme:dark)').matches;document.documentElement.setAttribute('data-theme',s||(p?'dark':'light'));})();</script>
  <style>
    :root { --bg:#F8F7F5; --text:#1A1916; --muted:#555; --muted2:#888; --border:#e5e3de; color-scheme: light dark; }
    [data-theme="dark"] { --bg:#111110; --text:#F0EDE8; --muted:#B0ACA4; --muted2:#8A8680; --border:#2C2A27; }
    body { font-family: Georgia, serif; max-width: 680px; margin: 2rem auto; padding: 0 1rem; color: var(--text); background: var(--bg); line-height: 1.7; }
    h1 { font-size: 2rem; margin-bottom: .5rem; }
    h2 { font-size: 1.2rem; font-weight: 700; margin: 1.5rem 0 .4rem; }
    .dates { font-size: 1.1rem; color: var(--muted); margin-bottom: 1.5rem; }
    .name-desc-section { margin-bottom: 1.25rem; }
    .name-desc-label { font-size: .75rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--muted2); margin-bottom: .4rem; }
    .patron-section { border-top: 1px solid var(--border); margin-top: 1.5rem; padding-top: 1.25rem; }
    a { color: var(--text); }
    #themeToggle { position: fixed; top: .75rem; right: .75rem; background: none; border: 1px solid var(--border); border-radius: 8px; width: 32px; height: 32px; cursor: pointer; font-size: 14px; color: var(--muted); font-family: inherit; line-height: 1; display: flex; align-items: center; justify-content: center; }
    #themeToggle:hover { background: var(--border); }
    #themeToggle::before { content: '☾'; }
    [data-theme="dark"] #themeToggle::before { content: '☀'; }
  </style>
</head>
<body>
  <button id="themeToggle" onclick="var d=document.documentElement,t=d.getAttribute('data-theme')==='dark'?'light':'dark';d.setAttribute('data-theme',t);localStorage.setItem('dbd-theme',t);" aria-label="Przełącz tryb ciemny/jasny" title="Tryb ciemny/jasny"></button>`;

function main() {
  const dirs = fs.readdirSync(path.join(ROOT, 'imieniny'))
    .filter(f => fs.statSync(path.join(ROOT, 'imieniny', f)).isDirectory());

  let patched = 0, alreadyOk = 0, mismatched = 0;
  const mismatchedPaths = [];

  for (const slug of dirs) {
    const filePath = path.join(ROOT, 'imieniny', slug, 'index.html');
    if (!fs.existsSync(filePath)) continue;
    const html = fs.readFileSync(filePath, 'utf8');
    if (!html.includes('color-scheme: light;')) { alreadyOk++; continue; }
    if (!html.includes(OLD_STYLE)) { mismatched++; mismatchedPaths.push(filePath); continue; }
    const patchedHtml = html.replace(OLD_STYLE, NEW_STYLE);
    if (!DRY) fs.writeFileSync(filePath, patchedHtml, 'utf8');
    patched++;
  }

  console.log(`Stron ogółem: ${dirs.length}`);
  console.log(`Już OK (mają tryb ciemny): ${alreadyOk}`);
  console.log(`Załatanych: ${patched}${DRY ? ' (DRY RUN — nic nie zapisano)' : ''}`);
  console.log(`Niezgodne z oczekiwanym szablonem (pominięte, do ręcznej weryfikacji): ${mismatched}`);
  if (mismatched) mismatchedPaths.forEach(p => console.log('  ' + path.relative(ROOT, p)));
}

main();
