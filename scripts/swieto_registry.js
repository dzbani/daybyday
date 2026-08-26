// Wspolny mechanizm regeneracji swieto_slugs.js / swieto_names.js / sitemap-swieto.xml.
// Skanuje faktyczny stan katalogu swieto/ na dysku (a nie tylko HOLIDAYS_DB), zeby
// generator bogatych stron (gen_static_swieto_pages.js) i generator lekkich stron
// (gen_static_nietypowe_pages.js) nie nadpisywaly sobie wzajemnie rejestru slugow.

const fs = require('fs');
const path = require('path');

function scanSwietoFolders(ROOT) {
  const dir = path.join(ROOT, 'swieto');
  const slugs = [];
  const nameToSlug = {};
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const idx = path.join(dir, entry.name, 'index.html');
    if (!fs.existsSync(idx)) continue;
    slugs.push(entry.name);
    const content = fs.readFileSync(idx, 'utf8');
    const m = content.match(/<meta property="og:title" content="([\s\S]*?) \| DaybyDay">/);
    if (m) {
      const name = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
      nameToSlug[name] = entry.name;
    }
  }
  slugs.sort();
  return { slugs, nameToSlug };
}

// aliasy: nazwy alternatywne tego samego realnego wydarzenia, ktore nie maja
// wlasnej fizycznej strony, tylko wskazuja na slug innej, juz istniejacej strony
const NAME_ALIASES = {
  'Międzynarodowy Dzień Sprzeciwu Wobec Tam': 'miedzynarodowy-dzien-dzialan-na-rzecz-rzek',
  // te same realne swieta, opisane w bogatej bazie HOLIDAYS_DB pod pelniejsza nazwa,
  // a w liscie "nietypowych" wystepujace jeszcze raz pod krotsza/uproszczona nazwa
  'Dzień Diagnosty Laboratoryjnego': 'dzien-diagnosty-laboratoryjnego',
  'Dzień Farmaceuty': 'dzien-farmaceuty',
  'Dzień Maszynisty': 'dzien-maszynisty',
  'Dzień Nauki Polskiej': 'dzien-nauki-polskiej',
  'Dzień Praw Człowieka': 'dzien-praw-czlowieka',
  'Dzień Sapera': 'dzien-sapera',
  'Dzień Tolerancji': 'dzien-tolerancji',
  'Dzień Parówkożercy': 'dzien-parowki',

  // Audyt 2026-08-04: 77 dodatkowych aliasow znalezionych przekrojowym porownaniem
  // HOLIDAYS_DB vs HOLIDAYS (nietypowe) po nazwie+dacie (nie tylko dokladnym stringu) —
  // kazdy zweryfikowany niezaleznie (WebSearch) jako to samo realne swieto pod inna
  // nazwa/pisownia/kolejnoscia slow, nie dwa osobne wydarzenia tego samego dnia.
  'Dzień Asteroid': 'dzien-asteroid',
  'Dzień Bez Futra': 'dzien-bez-futra',
  'Dzień Bez Maila': 'dzien-bez-maila',
  'Dzień bez Przekleństw': 'dzien-bez-przeklenstw',
  'Dzień Bez Stanika': 'dzien-bez-stanika',
  'Dzień bez Telefonu Komórkowego': 'dzien-bez-telefonu-komorkowego',
  'Dzień Bielizny': 'dzien-bielizny',
  'Dzień Bikini': 'dzien-bikini',
  'Dzień Blogów': 'dzien-blogow',
  'Dzień Blooma': 'dzien-blooma',
  'Dzień Braci Wright': 'rocznica-pierwszego-lotu-braci-wright',
  'Dzień Dawcy Szpiku': 'dzien-dawcy-szpiku',
  'Dzień Deskorolki': 'dzien-deskorolki',
  'Dzień Dziecka Afrykańskiego': 'dzien-dziecka-afrykanskiego',
  'Dzień Elvisa Presleya': 'rocznica-urodzin-elvisa-presleya',
  'Dzień Europy Rady Europy': 'dzien-europy-rady-europy',
  'Dzień Górnika': 'barbarka',
  'Dzień Jeża': 'dzien-jeza',
  'Dzień Języka Angielskiego': 'angielski-dzien-jezyka',
  'Dzień Języka Arabskiego': 'swiatowy-dzien-jezyka-arabskiego',
  'Dzień Języka Chińskiego': 'chinski-dzien-jezyka',
  'Dzień Języka Hiszpańskiego': 'hiszpanski-dzien-jezyka',
  'Dzień Języka Rosyjskiego': 'dzien-jezyka-rosyjskiego',
  'Dzień Kanapki': 'dzien-kanapki',
  'Dzień Komara': 'dzien-komara',
  'Dzień Kota': 'swiatowy-dzien-kota',
  'Dzień Krajobrazu': 'dzien-krajobrazu',
  'Dzień Księgowego (Buchaltera)': 'dzien-ksiegowego',
  'Dzień Leniwych Spacerów': 'dzien-leniwych-spacerow',
  'Dzień Liczby Pi': 'miedzynarodowy-dzien-liczby-pi',
  'Dzień Męczeństwa Wsi Polskiej': 'dzien-walki-i-meczenstwa-wsi-polskiej',
  'Dzień Miłośników Książek': 'dzien-milosnikow-ksiazek',
  'Dzień Mleka': 'dzien-mleka',
  'Dzień Myśli Braterskiej': 'dzien-mysli-braterskiej',
  'Dzień Pluszowego Misia': 'dzien-pluszowego-misia',
  'Dzień Podziemnego Państwa Polskiego': 'dzien-polskiego-panstwa-podziemnego',
  'Dzień polskiej żywności': 'dzien-polskiej-zywnosci',
  'Dzień Postaci z Bajek': 'dzien-postaci-z-bajek',
  'Dzień Pozytywnie Zakręconych': 'dzien-pozytywnie-zakreconych',
  'Dzień Pracowników Służby BHP': 'dzien-pracownikow-sluzby-bhp',
  'Dzień Prostaty': 'dzien-prostaty',
  'Dzień Przedsiębiorczości Kobiet': 'dzien-przedsiebiorczosci-kobiet',
  'Dzień Przytulania': 'dzien-przytulania',
  'Dzień Rekina': 'dzien-rekina',
  'Dzień Seniora': 'dzien-seniora',
  'Dzień Sernika': 'dzien-sernika',
  'Dzień Slayera': 'dzien-slayera',
  'Dzień Służby Zagranicznej RP': 'dzien-sluzby-zagranicznej',
  'Dzień Spódnicy': 'dzien-spodnicy',
  'Dzień Studenta': 'miedzynarodowy-dzien-studenta',
  'Dzień Św. Patryka': 'dzien-swietego-patryka',
  'Dzień Toalet': 'swiatowy-dzien-toalet',
  'Dzień Udaru Mózgu': 'dzien-udaru-mozgu',
  'Dzień Walki z Pustynnieniem i Suszami': 'dzien-walki-z-pustynnieniem-i-suszami',
  'Dzień Walki z Wypaleniem Zawodowym': 'dzien-walki-z-wypaleniem-zawodowym',
  'Dzień Wiatru': 'dzien-wiatru',
  'Dzień wiecznie zielonych roślin': 'dzien-wiecznie-zielonych-roslin',
  'Dzień Wiedzy o Zespole Möbiusa': 'miedzynarodowy-dzien-wiedzy-o-zespole-mobiusa',
  'Dzień Wyzwolenia Afryki': 'dzien-wyzwolenia-afryki',
  'Dzień Zrównoważonej Gastronomii': 'dzien-zrownowazonej-gastronomii',
  'Europejski Dzień Języków (Międzynarodowy Dzień Języków Obcych)': 'europejski-dzien-jezykow-miedzynarodowy-dzien-jezykow-obcych',
  'Europejski Dzień Konsumenta': 'dzien-praw-konsumenta',
  'Europejski Dzień Ofiar Przestępstw': 'dzien-ofiar-przestepstw',
  'Europejski Dzień wsparcia dla Ofiar Przestępstw z Nienawiści': 'europejski-dzien-wsparcia-dla-ofiar-przestepstw-z-nienawisci',
  'Międzynarodowy Dzień Muzyki': 'dzien-muzyki',
  'Międzynarodowy dzień odpoczynku od świętowania': 'miedzynarodowy-dzien-odpoczynku-od-swietowania',
  'Międzynarodowy Dzień Osób Niepełnosprawnych': 'dzien-osob-niepelnosprawnych',
  'Międzynarodowy Dzień Solidarności': 'miedzynarodowy-dzien-solidarnosci-ludzkiej',
  'Międzynarodowy Dzień Zapobiegania Przemocy Wobec Dzieci': 'miedzynarodowy-dzien-zapobiegania-przemocy-wobec-dzieci',
  'Narodowy Dzień Pamięci Polaków ratujących Żydów': 'dzien-pamieci-polakow-ratujacych-zydow',
  'Ogólnopolski Dzień Walki z Depresją': 'dzien-walki-z-depresja',
  'Światowy Dzień Białej Laski': 'swiatowy-dzien-bialej-laski',
  'Światowy Dzień Osób Jąkających': 'swiatowy-dzien-osob-jakajacych',
  'Światowy Dzień Radiologii': 'miedzynarodowy-dzien-radiologii',
  'Święto Myśliwych - Hubertus': 'hubertus',
  'Święto Służby Więziennej': 'dzien-sluzby-wieziennej',
  'Święto Wojsk Inżynieryjnych': 'dzien-sapera',
};

function regenerateRegistry(ROOT, extraAliases) {
  const { slugs, nameToSlug } = scanSwietoFolders(ROOT);
  const aliases = Object.assign({}, NAME_ALIASES, extraAliases || {});
  for (const [name, slug] of Object.entries(aliases)) {
    if (slugs.includes(slug)) nameToSlug[name] = slug;
  }

  const slugsContent = `// Lista slugow, dla ktorych istnieje wygenerowana strona /swieto/<slug>/ — uzywane do bezpiecznego linkowania bezposredniego (fallback na swieto.html?id= / swieta-nietypowe.html gdy brak).\nconst SWIETO_SLUGS=new Set(${JSON.stringify(slugs)});\n`;
  fs.writeFileSync(path.join(ROOT, 'swieto_slugs.js'), slugsContent, 'utf8');

  const namesContent = `// Mapa nazwa swieta -> slug (do linkowania z index.html / swieta-nietypowe.html)\nconst SWIETO_NAME_TO_SLUG=${JSON.stringify(nameToSlug)};\n`;
  fs.writeFileSync(path.join(ROOT, 'swieto_names.js'), namesContent, 'utf8');

  const urls = slugs.map(s => `  <url>\n    <loc>https://daybyday.today/swieto/${s}/</loc>\n    <changefreq>yearly</changefreq>\n    <priority>0.6</priority>\n  </url>`).join('\n');
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  fs.writeFileSync(path.join(ROOT, 'sitemap-swieto.xml'), sitemap, 'utf8');

  return { slugCount: slugs.length, nameCount: Object.keys(nameToSlug).length };
}

module.exports = { scanSwietoFolders, regenerateRegistry, NAME_ALIASES };
