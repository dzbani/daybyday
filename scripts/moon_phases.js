// Dokładne momenty faz Księżyca (nów, pierwsza kwadra, pełnia, ostatnia kwadra) — Meeus, "Astronomical
// Algorithms", rozdz. 49 (okresowe poprawki + 14 poprawek planetarnych), dokładność rzędu sekund do minuty.
// Używane przez scripts/gen_kalendarz_ksiezycowy.js. Zweryfikowane niezależnie z astronomy-engine (wszystkie fazy
// 2026–2032: różnica < 1 min) i z tabelą w fazy-ksiezyca.html (2026).
//
// phasesInRange(rok0, rok1) -> [{ q: 0|1|2|3, jd: <JD UT>, date: Date (UTC) }, ...] posortowane rosnąco
// (q: 0 = nów, 1 = pierwsza kwadra, 2 = pełnia, 3 = ostatnia kwadra)

const RAD = Math.PI / 180;
const sin = x => Math.sin(x * RAD), cos = x => Math.cos(x * RAD);
const norm = x => ((x % 360) + 360) % 360;

// ΔT = TT − UT [s]: wielomiany Espenaka/Meeusa dla 2005–2050 (2026: ok. 69 s)
function deltaT(year) { const t = year - 2000; return 62.92 + 0.32217 * t + 0.005589 * t * t; }

// JDE (TT) fazy dla "numeru lunacji" k (całkowite = nów, +0.25 = I kwadra, +0.5 = pełnia, +0.75 = III kwadra)
function phaseJDE(k) {
  const T = k / 1236.85;
  let jde = 2451550.09766 + 29.530588861 * k + 0.00015437 * T * T - 0.000000150 * T ** 3 + 0.00000000073 * T ** 4;
  const E = 1 - 0.002516 * T - 0.0000074 * T * T;
  const M = norm(2.5534 + 29.10535670 * k - 0.0000014 * T * T - 0.00000011 * T ** 3);
  const Mp = norm(201.5643 + 385.81693528 * k + 0.0107582 * T * T + 0.00001238 * T ** 3 - 0.000000058 * T ** 4);
  const F = norm(160.7108 + 390.67050284 * k - 0.0016118 * T * T - 0.00000227 * T ** 3 + 0.000000011 * T ** 4);
  const Om = norm(124.7746 - 1.56375588 * k + 0.0020672 * T * T + 0.00000215 * T ** 3);
  const frac = Math.round((k - Math.floor(k)) * 4) / 4;
  let c;
  if (frac === 0) { // nów
    c = -0.40720 * sin(Mp) + 0.17241 * E * sin(M) + 0.01608 * sin(2 * Mp) + 0.01039 * sin(2 * F) + 0.00739 * E * sin(Mp - M)
      - 0.00514 * E * sin(Mp + M) + 0.00208 * E * E * sin(2 * M) - 0.00111 * sin(Mp - 2 * F) - 0.00057 * sin(Mp + 2 * F)
      + 0.00056 * E * sin(2 * Mp + M) - 0.00042 * sin(3 * Mp) + 0.00042 * E * sin(M + 2 * F) + 0.00038 * E * sin(M - 2 * F)
      - 0.00024 * E * sin(2 * Mp - M) - 0.00017 * sin(Om) - 0.00007 * sin(Mp + 2 * M) + 0.00004 * sin(2 * Mp - 2 * F)
      + 0.00004 * sin(3 * M) + 0.00003 * sin(Mp + M - 2 * F) + 0.00003 * sin(2 * Mp + 2 * F) - 0.00003 * sin(Mp + M + 2 * F)
      + 0.00003 * sin(Mp - M + 2 * F) - 0.00002 * sin(Mp - M - 2 * F) - 0.00002 * sin(3 * Mp + M) + 0.00002 * sin(4 * Mp);
  } else if (frac === 0.5) { // pełnia
    c = -0.40614 * sin(Mp) + 0.17302 * E * sin(M) + 0.01614 * sin(2 * Mp) + 0.01043 * sin(2 * F) + 0.00734 * E * sin(Mp - M)
      - 0.00515 * E * sin(Mp + M) + 0.00209 * E * E * sin(2 * M) - 0.00111 * sin(Mp - 2 * F) - 0.00057 * sin(Mp + 2 * F)
      + 0.00056 * E * sin(2 * Mp + M) - 0.00042 * sin(3 * Mp) + 0.00042 * E * sin(M + 2 * F) + 0.00038 * E * sin(M - 2 * F)
      - 0.00024 * E * sin(2 * Mp - M) - 0.00017 * sin(Om) - 0.00007 * sin(Mp + 2 * M) + 0.00004 * sin(2 * Mp - 2 * F)
      + 0.00004 * sin(3 * M) + 0.00003 * sin(Mp + M - 2 * F) + 0.00003 * sin(2 * Mp + 2 * F) - 0.00003 * sin(Mp + M + 2 * F)
      + 0.00003 * sin(Mp - M + 2 * F) - 0.00002 * sin(Mp - M - 2 * F) - 0.00002 * sin(3 * Mp + M) + 0.00002 * sin(4 * Mp);
  } else { // kwadry
    c = -0.62801 * sin(Mp) + 0.17172 * E * sin(M) - 0.01183 * E * sin(Mp + M) + 0.00862 * sin(2 * Mp) + 0.00804 * sin(2 * F)
      + 0.00454 * E * sin(Mp - M) + 0.00204 * E * E * sin(2 * M) - 0.00180 * sin(Mp - 2 * F) - 0.00070 * sin(Mp + 2 * F)
      - 0.00040 * sin(3 * Mp) - 0.00034 * E * sin(2 * Mp - M) + 0.00032 * E * sin(M + 2 * F) + 0.00032 * E * sin(M - 2 * F)
      - 0.00028 * E * E * sin(Mp + 2 * M) + 0.00027 * E * sin(2 * Mp + M) - 0.00017 * sin(Om) - 0.00005 * sin(Mp - M - 2 * F)
      + 0.00004 * sin(2 * Mp + 2 * F) - 0.00004 * sin(Mp + M + 2 * F) + 0.00004 * sin(Mp - 2 * M) + 0.00003 * sin(Mp + M - 2 * F)
      + 0.00003 * sin(3 * M) + 0.00002 * sin(2 * Mp - 2 * F) + 0.00002 * sin(Mp - M + 2 * F) - 0.00002 * sin(3 * Mp + M);
    const W = 0.00306 - 0.00038 * E * cos(M) + 0.00026 * cos(Mp) - 0.00002 * cos(Mp - M) + 0.00002 * cos(Mp + M) + 0.00002 * cos(2 * F);
    c += frac === 0.25 ? W : -W;
  }
  const A = [
    299.77 + 0.107408 * k - 0.009173 * T * T, 251.88 + 0.016321 * k, 251.83 + 26.651886 * k, 349.42 + 36.412478 * k,
    84.66 + 18.206239 * k, 141.74 + 53.303771 * k, 207.14 + 2.453732 * k, 154.84 + 7.306860 * k,
    34.52 + 27.261239 * k, 207.19 + 0.121824 * k, 291.34 + 1.844379 * k, 161.72 + 24.198154 * k,
    239.56 + 25.513099 * k, 331.55 + 3.592518 * k,
  ];
  const AC = [0.000325, 0.000165, 0.000164, 0.000126, 0.000110, 0.000062, 0.000060, 0.000056, 0.000047, 0.000042, 0.000040, 0.000037, 0.000035, 0.000023];
  let add = 0; for (let i = 0; i < 14; i++) add += AC[i] * sin(A[i]);
  // Poprawka do definicji używanej przez almanachy i serwisy (timeanddate, astronomy-engine): momenty faz wypadają
  // o ok. 40 s później niż w wzorach Meeusa. Wielkość = 20,49" (stała aberracji) / względna prędkość Księżyca i Słońca w
  // długości ekliptycznej (ok. 12,2 st./dobę, zmienna ±12%). Dobrana i zweryfikowana empirycznie (patrz nagłówek pliku).
  const Dd = norm(297.8501921 + 445267.1114034 * T), Mm = M, Mpp = Mp, Ff = F;
  const vMoon = 13.176396 + 1.4340 * cos(Mpp) + 0.2801 * cos(2 * Dd) + 0.2516 * cos(2 * Dd - Mpp) + 0.0974 * cos(2 * Mpp)
    - 0.0528 * cos(2 * Ff) - 0.0032 * cos(Mm) + 0.0348 * cos(2 * Dd + Mpp); // pochodna głównych wyrazów długości Księżyca; reszta < 0,03 st./dobę pominięta
  const vSun = 0.985647 + 0.0329 * cos(Mm);
  const R = 1 - 0.01671 * cos(Mm) - 0.00014 * cos(2 * Mm); // odległość Ziemia–Słońce [AU]
  const aberrDays = (20.4898 / 3600 / R) / (vMoon - vSun);
  return jde + c + add + aberrDays;
}

// JD (UT) -> Date (UTC)
const jdToDate = jd => new Date(Math.round((jd - 2440587.5) * 86400000));

function phasesInRange(y0, y1) {
  const out = [];
  const kStart = Math.floor((y0 - 2000) * 12.3685) - 2, kEnd = Math.ceil((y1 + 1 - 2000) * 12.3685) + 2;
  for (let n = kStart; n <= kEnd; n++) {
    for (let q = 0; q < 4; q++) {
      const jde = phaseJDE(n + q / 4);
      const year = 2000 + (jde - 2451545) / 365.25;
      const jd = jde - deltaT(year) / 86400; // TT -> UT
      out.push({ q, jd, date: jdToDate(jd) });
    }
  }
  const lo = Date.UTC(y0, 0, 1) - 3 * 86400000, hi = Date.UTC(y1 + 1, 0, 1) + 3 * 86400000;
  return out.filter(e => e.date >= lo && e.date < hi).sort((a, b) => a.jd - b.jd);
}

// ── czas polski (CET/CEST: zmiana w ostatnią niedzielę marca/października o 01:00 UTC) ──
function lastSundayUtc(y, mo) { const d = new Date(Date.UTC(y, mo, 0)); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return Date.UTC(y, mo - 1, d.getUTCDate(), 1); }
const plOffset = utcMs => { const y = new Date(utcMs).getUTCFullYear(); return (utcMs >= lastSundayUtc(y, 3) && utcMs < lastSundayUtc(y, 10)) ? 2 : 1; };
const plTag = utcMs => plOffset(utcMs) === 2 ? 'CEST' : 'CET';
// składniki czasu lokalnego; minuty OBCIĘTE (jak w almanachach), ms = czas lokalny w ms jako "UTC"
function localParts(utcMs) { const ms = Math.floor(utcMs / 60000) * 60000 + plOffset(utcMs) * 3600000; const d = new Date(ms); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), hh: d.getUTCHours(), mm: d.getUTCMinutes(), ms }; }

module.exports = { phasesInRange, phaseJDE, deltaT, plOffset, plTag, localParts };
