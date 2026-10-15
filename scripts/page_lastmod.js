// <lastmod> w sitemapach stron treściowych liczony z ZMIAN TREŚCI, a nie z daty ostatniego commita.
//
// Powód: masowe, czysto techniczne commity (zmiana CSS/czcionki/nawigacji na ~4000 stron naraz)
// ustawiłyby przy naiwnym `git log -1` ten sam lastmod dla niemal wszystkich stron - Google uczy się
// wtedy ignorować lastmod całej witryny. Tu lastmod = data najstarszego commita w ostatnim ciągu
// wersji o TEJ SAMEJ treści (tytuł + meta description + JSON-LD + widoczny tekst body; bez <style>,
// <script>, atrybutów, meta og:*). Zmiana niezacommitowana (plik różni się od HEAD) = dzisiejsza data.
//
// Użycie (CLI):  node scripts/page_lastmod.js [--dry-run] [--stats] [sitemap-*.xml ...]
//   domyślnie: sitemap-imieniny.xml, sitemap-swieto.xml, sitemap-kartka.xml, sitemap-swieta-liturgiczne.xml
// Użycie (moduł): require('./page_lastmod').applyToSitemap(ROOT, 'sitemap-imieniny.xml')
//   - generatory sitemap wołają to po zapisie pliku (generują sitemapę od zera, więc bez tego lastmod znika).
// Uwaga: sitemap.xml (strony główne) ma osobny skrypt scripts/gen_sitemap_main.js.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync, spawnSync } = require('child_process');

const SITE = 'https://daybyday.today';
const DEFAULT_SITEMAPS = ['sitemap-imieniny.xml', 'sitemap-swieto.xml', 'sitemap-kartka.xml', 'sitemap-swieta-liturgiczne.xml'];

// Tekst, którego zmiana oznacza realną zmianę treści strony.
function normalize(html) {
  const pick = re => { const m = html.match(re); return m ? m[1].replace(/\s+/g, ' ').trim() : ''; };
  const title = pick(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const desc = pick(/<meta\s+name="description"\s+content="([^"]*)"/i);
  const ld = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1].replace(/\s+/g, ' ').trim()).join('\n');
  let body = (html.match(/<body[\s\S]*<\/body>/i) || [html])[0];
  body = body.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ').replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  return title + '\n' + desc + '\n' + ld + '\n' + body;
}
const hashOf = text => crypto.createHash('md5').update(text).digest('hex');

// plik -> [{sha, date}] od najnowszego
function gitHistory(root, relSet) {
  const out = execFileSync('git', ['log', '--name-only', '--no-renames', '--format=@@%H|%cs'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 30 });
  const map = new Map(); let cur = null;
  for (const line of out.split('\n')) {
    if (line.startsWith('@@')) { const [sha, date] = line.slice(2).split('|'); cur = { sha, date: date.trim() }; }
    else if (cur) { const f = line.trim(); if (f && relSet.has(f)) { if (!map.has(f)) map.set(f, []); map.get(f).push(cur); } }
  }
  return map;
}

// pobiera zawartość blobów 'sha:ścieżka' jednym procesem git cat-file --batch (porcjami)
function catBatch(root, specs) {
  const res = new Array(specs.length).fill(null);
  const CH = 300;
  for (let s = 0; s < specs.length; s += CH) {
    const part = specs.slice(s, s + CH);
    const r = spawnSync('git', ['cat-file', '--batch'], { cwd: root, input: part.join('\n') + '\n', maxBuffer: 1 << 30 });
    if (r.status !== 0) throw new Error('git cat-file: ' + (r.stderr || '').toString());
    const buf = r.stdout; let pos = 0;
    for (let i = 0; i < part.length; i++) {
      const eol = buf.indexOf(10, pos);
      const header = buf.toString('utf8', pos, eol);
      if (/ missing$/.test(header)) { pos = eol + 1; continue; }
      const size = parseInt(header.split(' ')[2], 10);
      res[s + i] = buf.slice(eol + 1, eol + 1 + size).toString('utf8');
      pos = eol + 1 + size + 1;
    }
  }
  return res;
}

// rels: ścieżki względem ROOT. Zwraca Map(rel -> 'RRRR-MM-DD')
function computeLastmods(root, rels, today) {
  today = today || new Date().toISOString().slice(0, 10);
  const hist = gitHistory(root, new Set(rels));
  const result = new Map();
  const st = new Map(); // rel -> {commits, hashes:[], wt}
  for (const rel of rels) {
    const commits = hist.get(rel) || [];
    const abs = path.join(root, rel);
    if (!commits.length) { result.set(rel, today); continue; } // nowy plik, jeszcze bez commita
    const wt = fs.existsSync(abs) ? hashOf(normalize(fs.readFileSync(abs, 'utf8'))) : null;
    st.set(rel, { commits, hashes: [], wt });
  }
  // rundy: najpierw 2 najnowsze wersje, potem po jednej starszej dla plików, których ciąg identycznych wersji trwa
  let pending = [...st.keys()];
  let first = true;
  while (pending.length) {
    const reqs = [];
    for (const rel of pending) {
      const s = st.get(rel);
      const want = first ? Math.min(2, s.commits.length) : 1;
      for (let k = 0; k < want; k++) reqs.push({ rel, idx: s.hashes.length + k });
    }
    const blobs = catBatch(root, reqs.map(q => st.get(q.rel).commits[q.idx].sha + ':' + q.rel));
    reqs.forEach((q, i) => { st.get(q.rel).hashes[q.idx] = blobs[i] == null ? null : hashOf(normalize(blobs[i])); });
    first = false;
    const next = [];
    for (const rel of pending) {
      const s = st.get(rel), h = s.hashes, n = s.commits.length;
      if (s.wt !== h[0]) { result.set(rel, today); continue; }              // zmiana niezacommitowana
      // dokąd sięga ciąg identycznych wersji?
      let j = 0;
      while (j + 1 < h.length && h[j + 1] === h[0]) j++;
      if (j + 1 < h.length) { result.set(rel, s.commits[j].date); continue; }  // h[j+1] różni się -> commit j wprowadził treść
      if (h.length >= n) { result.set(rel, s.commits[n - 1].date); continue; } // cała historia identyczna -> data utworzenia
      next.push(rel);
    }
    pending = next;
  }
  return result;
}

const locToRel = loc => {
  if (!loc.startsWith(SITE)) return null;
  const p = loc.slice(SITE.length);
  return p.endsWith('/') ? p.slice(1) + 'index.html' : p.slice(1);
};

// dopisuje/aktualizuje <lastmod> w każdym <url> (zaraz po <loc>, zgodnie z kolejnością w schemacie)
function applyToSitemap(root, sitemapName, opts) {
  opts = opts || {};
  const fp = path.join(root, sitemapName);
  const raw = fs.readFileSync(fp, 'utf8');
  const urls = [...raw.matchAll(/<loc>([^<]*)<\/loc>/g)].map(m => m[1]);
  const rels = urls.map(locToRel).filter(r => r && fs.existsSync(path.join(root, r)));
  const lm = computeLastmods(root, rels, opts.today);
  let changed = 0, missing = 0; const dist = {};
  const out = raw.replace(/<url>[\s\S]*?<\/url>/g, block => {
    const loc = (block.match(/<loc>([^<]*)<\/loc>/) || [])[1];
    const rel = loc && locToRel(loc);
    const date = rel && lm.get(rel);
    if (!date) { missing++; return block; }
    dist[date] = (dist[date] || 0) + 1;
    const nb = /<lastmod>[^<]*<\/lastmod>/.test(block)
      ? block.replace(/<lastmod>[^<]*<\/lastmod>/, '<lastmod>' + date + '</lastmod>')
      : block.replace(/(<loc>[^<]*<\/loc>)(\s*)/, (m, a, ws) => a + ws.replace(/\S/g, '') + '<lastmod>' + date + '</lastmod>' + (ws.includes('\n') ? ws : ''));
    if (nb !== block) changed++;
    return nb;
  });
  if (!opts.dry && out !== raw) fs.writeFileSync(fp, out, 'utf8');
  return { sitemap: sitemapName, total: urls.length, changed, missing, dist, wrote: !opts.dry && out !== raw };
}

// wersja dla generatorów: błąd (np. brak gita) nie przerywa generowania sitemapy
function applyToSitemapSafe(root, sitemapName, opts) {
  try { return applyToSitemap(root, sitemapName, opts); }
  catch (e) { console.warn(`${sitemapName}: lastmod pominięty (${e.message.split('\n')[0]})`); return null; }
}

module.exports = { normalize, computeLastmods, applyToSitemap, applyToSitemapSafe };

if (require.main === module) {
  const root = path.join(__dirname, '..');
  const args = process.argv.slice(2);
  const dry = args.includes('--dry-run'), stats = args.includes('--stats');
  const files = args.filter(a => a.endsWith('.xml'));
  const t0 = Date.now();
  for (const sm of files.length ? files : DEFAULT_SITEMAPS) {
    const r = applyToSitemap(root, sm, { dry });
    console.log(`${r.sitemap}: ${r.total} URL, lastmod zmieniony w ${r.changed}, bez pliku ${r.missing}${dry ? ' (dry-run, nie zapisano)' : r.wrote ? ' — zapisano' : ' — bez zmian'}`);
    if (stats) Object.entries(r.dist).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 10).forEach(([d, n]) => console.log('   ', d, String(n).padStart(5)));
  }
  console.log(`czas: ${Math.round((Date.now() - t0) / 1000)} s`);
}
