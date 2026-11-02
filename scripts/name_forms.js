// Zdrobnienia imion i ich dopełniacze (do tytułów, nagłówków i opisów stron /imieniny/<slug>/).
// Źródło zdrobnień: sekcja <h3>Zdrobnienia</h3> w NAME_DESCRIPTIONS_RICH. Dopełniacz zdrobnienia liczą
// REGUŁY poniżej — gdy żadna nie pasuje pewnie, funkcja zwraca null i forma nie trafia do fraz z odmianą
// (lepiej pominąć niż wypisać błędną odmianę). Lista wyjątków: DIM_GENITIVE_OVERRIDES.

const DIM_GENITIVE_OVERRIDES = {};

const PALATAL = { s: 'ś', c: 'ć', z: 'ź', n: 'ń' };
const VOWELS = 'aeiouyąęó';
const isVowel = ch => VOWELS.includes(ch);

// Dopełniacz zdrobnienia albo null, gdy odmiana nie jest pewna.
function dimGenitive(form) {
  if (DIM_GENITIVE_OVERRIDES[form]) return DIM_GENITIVE_OVERRIDES[form];
  const f = form;
  const low = f.toLowerCase();
  let m;
  // -dziek → -dźka, -siek/-ciek/-ziek/-niek → -śka/-ćka/-źka/-ńka (Krzysiek → Krzyśka, Maciek → Maćka)
  if ((m = low.match(/^(.*)dziek$/))) return f.slice(0, m[1].length) + 'dźka';
  if ((m = low.match(/^(.*)([sczn])iek$/))) return f.slice(0, m[1].length) + PALATAL[m[2]] + 'ka';
  // spółgłoska + ek → ka (Tomek → Tomka, Mareczek → Mareczka); po samogłosce — niepewne
  if (/ek$/.test(low)) return isVowel(low.charAt(low.length - 3)) ? null : f.slice(0, -2) + 'ka';
  if (/ik$/.test(low)) return f + 'a';
  // -ko po spółgłosce → -ka (Romko → Romka)
  if (/ko$/.test(low) && !isVowel(low.charAt(low.length - 3))) return f.slice(0, -1) + 'a';
  // -cio/-sio/-nio/-zio/-dzio → -cia/-sia/... (Tomcio → Tomcia, Stasio → Stasia)
  if (/(c|s|n|z|dz)io$/.test(low)) return f.slice(0, -1) + 'a';
  // -uś/-aś/-eś/-yś/-oś/-iś → -usia... (Tomuś → Tomusia, Jaś → Jasia)
  if (/[uaeyoi]ś$/.test(low)) return f.slice(0, -1) + 'sia';
  // żeńskie i męskie na -a
  if (/a$/.test(low)) {
    const p = low.charAt(low.length - 2);
    // -ia po spółgłosce → -i (Kasia → Kasi, Marysia → Marysi); po samogłosce (Maria) — niepewne
    if (p === 'i') return isVowel(low.charAt(low.length - 3)) || low.length < 4 ? null : f.slice(0, -1);
    if (isVowel(p) || p === 'j') return null;          // wzory z samogłoską/j: niepewne
    if (p === 'k') return f.slice(0, -1) + 'i';          // Kaśka → Kaśki
    if (p === 'g') return f.slice(0, -1) + 'i';          // Aga → Agi
    if (p === 'l') return f.slice(0, -1) + 'i';          // Ola → Oli
    if (low.endsWith('ła')) return f.slice(0, -1) + 'y'; // -ła → -ły
    return f.slice(0, -1) + 'y';                         // Magda → Magdy, Tera → Tery, Kuba → Kuby
  }
  return null;
}

// Zdrobnienia z HTML sekcji RICH: tylko czyste formy jednowyrazowe (bez dopisków w nawiasach, myślników,
// zdań); bez nazwy głównej i jej wariantów pisowni; bez duplikatów. Kolejność jak w RICH (pierwsze = najczęstsze).
function parseDiminutives(richHtml, excludeNames) {
  if (!richHtml) return [];
  const m = richHtml.match(/<h3>Zdrobnienia<\/h3><p>([\s\S]*?)<\/p>/);
  if (!m) return [];
  const excl = new Set((excludeNames || []).map(x => x.toLowerCase()));
  const seen = new Set();
  const out = [];
  for (let raw of m[1].replace(/<[^>]+>/g, '').split(',')) {
    const f = raw.trim().replace(/\.$/, '').trim();
    if (!f || /[\s()—–\-:;]/.test(f) || f.length > 20) continue;
    if (!/^[A-ZŁŚŻŹĆŃÓĄĘ][a-ząćęłńóśźż]+$/.test(f)) continue;
    const k = f.toLowerCase();
    if (excl.has(k) || seen.has(k)) continue;
    seen.add(k);
    out.push(f);
  }
  return out;
}

// form → liczba stron imion, które ją podają jako zdrobnienie (do wykrywania form wieloznacznych: Aga, Sławek...)
function buildDimOwners(RICH) {
  const owners = {};
  for (const n of Object.keys(RICH)) {
    for (const f of parseDiminutives(RICH[n], [n])) (owners[f.toLowerCase()] = owners[f.toLowerCase()] || []).push(n);
  }
  return owners;
}

module.exports = { dimGenitive, parseDiminutives, buildDimOwners };
