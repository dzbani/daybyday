// Święta o ruchomej dacie, liczone REGUŁĄ ("n-ty dzień tygodnia miesiąca") dla oglądanego roku.
// Wspólne źródło dla index.html, swieta-nietypowe.html i kartka-z-kalendarza.html oraz generatorów
// (scripts/gen_kartka.js ładuje ten plik przez vm).
//
// Po co: lekkie listy HOLIDAYS (index.html, swieta-nietypowe.html) mają daty jako [dzień,miesiąc]
// na sztywno. Dla świąt typu "trzecia niedziela stycznia" oznaczało to datę z jednego roku:
// w 2027+ pokazywały się w złym dniu, a część (Dzień Śniegu, Trędowatych, Małżeństwa, Wielorybów,
// Epilepsji, Bezpiecznego Internetu, Dawcy Szpiku, Szwagra...) była zła już w 2026 (znalezione
// 27.09.2026 przy audycie dnia 27 IX: Głuchych/Rzek/Infrastruktura Wojskowa na stałe 27 IX).
// Reguła jest tu, listy zostają jako baza nazw/opisów, a data jest przeliczana przez redateFloating().
// Nowe święto ruchome: dopisać wpis TUTAJ (nie dawać go w listach jako stałej daty) i ustawić
// w swieto.html pole date na tekst reguły (np. "druga sobota czerwca (ruchoma data)").
// Pola: slug, names (wszystkie nazwy w listach/aliasy), m + wd (0=niedziela..6=sobota) + n
// (1-4 albo -1 = ostatni), albo easter (dni od Wielkanocy), albo m + wd + from (pierwszy taki
// dzień tygodnia od dnia "from", np. niedziela 13-19 listopada).
const SWIETA_FLOATING=[
  {slug:"dzien-weterynarii",names:["Światowy Dzień Lekarzy Weterynarii"],m:4,wd:6,n:-1},
  {slug:"dzien-chemika",names:["Dzień Chemika"],m:6,wd:0,n:1},
  {slug:"swiatowy-dzien-sniegu",names:["Światowy Dzień Śniegu"],m:1,wd:0,n:3},
  {slug:"swiatowy-dzien-tredowatych",names:["Światowy Dzień Trędowatych"],m:1,wd:0,n:-1},
  {slug:"swiatowy-dzien-wyborow",names:["Światowy Dzień Wyborów"],m:2,wd:4,n:1},
  {slug:"miedzynarodowy-dzien-epilepsji",names:["Międzynarodowy Dzień Epilepsji"],m:2,wd:1,n:2},
  {slug:"miedzynarodowy-dzien-dojezdzania-rowerem-do-pracy-zima",names:["Międzynarodowy Dzień Dojeżdżania Rowerem do Pracy Zimą"],m:2,wd:5,n:2},
  {slug:"swiatowy-dzien-malzenstwa",names:["Światowy Dzień Małżeństwa"],m:2,wd:0,n:2},
  {slug:"swiatowy-dzien-wielorybow",names:["Światowy Dzień Wielorybów"],m:2,wd:0,n:3},
  {slug:"swiatowy-dzien-tenisa",names:["Światowy Dzień Tenisa"],m:3,wd:1,n:1},
  {slug:"swiatowy-dzien-modlitwy",names:["Światowy Dzień Modlitwy"],m:3,wd:5,n:1},
  {slug:"swiatowy-dzien-nerek",names:["Światowy Dzień Nerek"],m:3,wd:4,n:2},
  {slug:"swiatowy-dzien-pracy-socjalnej",names:["Światowy Dzień Pracy Socjalnej"],m:3,wd:2,n:3},
  {slug:"miedzynarodowy-dzien-walki-na-poduszki",names:["Międzynarodowy Dzień Walki na Poduszki"],m:4,wd:6,n:1},
  {slug:"swiatowy-dzien-cyrku",names:["Światowy Dzień Cyrku"],m:4,wd:6,n:3},
  {slug:"miedzynarodowy-dzien-psa-ratowniczego",names:["Międzynarodowy Dzień Psa Ratowniczego"],m:4,wd:0,n:-1},
  {slug:"swiatowy-dzien-fotografii-otworkowej",names:["Światowy Dzień Fotografii Otworkowej"],m:4,wd:0,n:-1},
  {slug:"miedzynarodowy-dzien-tuby",names:["Międzynarodowy Dzień Tuby"],m:5,wd:5,n:1},
  {slug:"swiatowy-dzien-nagiego-ogrodnictwa",names:["Światowy Dzień Nagiego Ogrodnictwa"],m:5,wd:6,n:1},
  {slug:"swiatowy-dzien-astmy",names:["Światowy Dzień Astmy"],m:5,wd:2,n:1},
  {slug:"swiatowy-dzien-hasla",names:["Światowy Dzień Hasła"],m:5,wd:4,n:1},
  {slug:"swiatowy-dzien-ptakow-wedrownych",names:["Światowy Dzień Ptaków Wędrownych"],m:5,wd:6,n:2},
  {slug:"swiatowy-dzien-sprawiedliwego-handlu",names:["Światowy Dzień Sprawiedliwego Handlu"],m:5,wd:6,n:2},
  {slug:"miedzynarodowy-dzien-whisky",names:["Międzynarodowy Dzień Whisky"],m:5,wd:6,n:3},
  {slug:"swiatowy-dzien-pieczenia",names:["Światowy Dzień Pieczenia"],m:5,wd:0,n:3},
  {slug:"swiatowy-dzien-pamieci-o-zmarlych-na-aids",names:["Światowy Dzień Pamięci o Zmarłych na AIDS"],m:5,wd:0,n:3},
  {slug:"swiatowy-dzien-robienia-na-drutach-w-miejscach-publicznych",names:["Światowy Dzień Robienia na Drutach w Miejscach Publicznych"],m:6,wd:6,n:2},
  {slug:"swiatowy-dzien-wellness",names:["Światowy Dzień Wellness"],m:6,wd:6,n:2},
  {slug:"swiatowy-dzien-raka-nerki",names:["Światowy Dzień Raka Nerki"],m:6,wd:4,n:3},
  {slug:"miedzynarodowy-dzien-surfingu",names:["Międzynarodowy Dzień Surfingu"],m:6,wd:6,n:3},
  {slug:"miedzynarodowy-dzien-spoldzielczosci",names:["Międzynarodowy Dzień Spółdzielczości"],m:7,wd:6,n:1},
  {slug:"swiatowy-dzien-kebaba",names:["Światowy Dzień Kebaba"],m:7,wd:5,n:2},
  {slug:"swiatowy-dzien-dziadkow-i-osob-starszych",names:["Światowy Dzień Dziadków i Osób Starszych"],m:7,wd:0,n:4},
  {slug:"miedzynarodowy-dzien-alopecji",names:["Międzynarodowy Dzień Alopecji"],m:8,wd:6,n:1},
  {slug:"swiatowy-dzien-musztardy",names:["Światowy Dzień Musztardy"],m:8,wd:6,n:1},
  {slug:"miedzynarodowy-dzien-piwa-i-piwowara",names:["Międzynarodowy Dzień Piwa i Piwowara"],m:8,wd:5,n:1},
  {slug:"swiatowy-dzien-brody",names:["Światowy Dzień Brody"],m:9,wd:6,n:1},
  {slug:"swiatowy-dzien-pierwszej-pomocy",names:["Światowy Dzień Pierwszej Pomocy"],m:9,wd:6,n:2},
  {slug:"swiatowy-dzien-kierownika",names:["Światowy Dzień Kierownika"],m:9,wd:5,n:3},
  {slug:"swiatowy-dzien-dawcy-szpiku",names:["Światowy Dzień Dawcy Szpiku"],m:9,wd:6,n:3},
  {slug:"swiatowy-dzien-morza",names:["Światowy Dzień Morza"],m:9,wd:4,n:-1},
  {slug:"swiatowy-dzien-krolika",names:["Światowy Dzień Królika"],m:9,wd:6,n:4},
  {slug:"miedzynarodowy-dzien-gluchych",names:["Międzynarodowy Dzień Głuchych"],m:9,wd:0,n:-1},
  {slug:"swiatowy-dzien-rzek",names:["Światowy Dzień Rzek"],m:9,wd:0,n:4},
  {slug:"dzien-bezpiecznego-internetu",names:["Dzień Bezpiecznego Internetu"],m:2,wd:2,n:2},
  {slug:"dzien-szwagra",names:["Dzień Szwagra"],m:6,wd:6,n:-1},
  {slug:"dzien-frytek",names:["Dzień Frytek"],m:7,wd:5,n:2},
  {slug:"dzien-lodow",names:["Dzień Lodów"],m:7,wd:0,n:3},
  {slug:"dzien-administratora",names:["Dzień Administratora"],m:7,wd:5,n:-1},
  {slug:"dzien-synowej",names:["Dzień Synowej"],m:8,wd:6,n:3},
  {slug:"dzien-doceniania-zony",names:["Dzień Doceniania Żony"],m:9,wd:0,n:3},
  {slug:"swiatowy-dzien-usmiechu",names:["Światowy Dzień Uśmiechu"],m:10,wd:5,n:1},
  {slug:"dzien-tkaczki",names:["Dzień Tkaczki"],m:10,wd:6,n:1},
  {slug:"dzien-polskiej-harcerki",names:["Dzień Polskiej Harcerki"],m:10,wd:0,n:1},
  {slug:"swiatowy-dzien-mieszkalnictwa",names:["Światowy Dzień Mieszkalnictwa"],m:10,wd:1,n:1},
  {slug:"dzien-efektywnosci-energetycznej",names:["Dzień Efektywności Energetycznej"],m:10,wd:3,n:1},
  {slug:"swiatowy-dzien-wzroku",names:["Światowy Dzień Wzroku"],m:10,wd:4,n:2},
  {slug:"swiatowy-dzien-jaja",names:["Światowy Dzień Jaja"],m:10,wd:5,n:2},
  {slug:"swiatowy-dzien-opieki-paliatywnej-i-hospicjow",names:["Światowy Dzień Opieki Paliatywnej i Hospicjów"],m:10,wd:6,n:2},
  {slug:"miedzynarodowy-dzien-mediacji",names:["Międzynarodowy Dzień Mediacji"],m:10,wd:4,n:3},
  {slug:"swiatowy-dzien-owocow-i-warzyw",names:["Światowy Dzień Owoców i Warzyw"],m:10,wd:5,n:3},
  {slug:"miedzynarodowy-dzien-swiadomosci-rozwojowych-zaburzen-jezykowych",names:["Międzynarodowy Dzień Świadomości Rozwojowych Zaburzeń Językowych"],m:10,wd:5,n:3},
  {slug:"miedzynarodowy-dzien-naprawy",names:["Międzynarodowy Dzień Naprawy"],m:10,wd:6,n:3},
  {slug:"swiatowy-dzien-godnosci",names:["Światowy Dzień Godności"],m:10,wd:3,n:3},
  {slug:"swiatowy-dzien-kaplana",names:["Światowy Dzień Kapłana"],m:10,wd:0,n:4},
  {slug:"miedzynarodowy-dzien-lamancow-jezykowych",names:["Międzynarodowy Dzień Łamańców Językowych"],m:11,wd:0,n:2},
  {slug:"swiatowy-dzien-jakosci",names:["Światowy Dzień Jakości"],m:11,wd:4,n:2},
  {slug:"swiatowy-dzien-pamieci-o-ofiarach-wypadkow-drogowych",names:["Światowy Dzień Pamięci o Ofiarach Wypadków Drogowych"],m:11,wd:0,n:3},
  {slug:"swiatowy-dzien-filozofii",names:["Światowy Dzień Filozofii"],m:11,wd:4,n:3},
  {slug:"swiatowy-dzien-rzucania-palenia-tytoniu",names:["Światowy Dzień Rzucania Palenia Tytoniu"],m:11,wd:4,n:3},
  {slug:"swiatowy-dzien-tabliczki-mnozenia",names:["Światowy Dzień Tabliczki Mnożenia"],m:11,wd:5,n:3},
  {slug:"dzien-nitkowania",names:["Dzień Nitkowania"],m:11,wd:5,n:4},
  {slug:"miedzynarodowy-dzien-inzyniera-systemow",names:["Międzynarodowy Dzień Inżyniera Systemów"],m:11,wd:5,n:-1},
  {slug:"dzien-bez-zakupow",names:["Dzień bez Zakupów"],m:11,wd:6,n:-1},
  {slug:"dzien-otwarty-notariatu",names:["Dzień Otwarty Notariatu"],m:11,wd:6,n:-1},
  {slug:"dzien-sztucznego-futra",names:["Dzień Sztucznego Futra"],m:12,wd:5,n:1},
  {slug:"miedzynarodowy-dzien-palenia-swiec",names:["Międzynarodowy Dzień Palenia Świec"],m:12,wd:0,n:2},
  {slug:"swieto-infrastruktury-wojskowej",names:["Święto Infrastruktury Wojskowej"],m:9,wd:0,n:-1},
  {slug:"swiatowy-dzien-srodkow-masowego-przekazu",names:["Światowy Dzień Środków Masowego Przekazu"],easter:42},
  {slug:"swiatowy-dzien-ubogich",names:["Światowy Dzień Ubogich"],m:11,wd:0,from:13},
  {slug:"dzien-komornika-sadowego",names:["Dzień Komornika Sądowego", "Światowy Dzień Komornika Sądowego"],m:6,wd:4,n:2},
  {slug:"dzien-wolnego-oprogramowania",names:["Dzień Wolnego Oprogramowania", "Międzynarodowy Dzień Wolnego Oprogramowania"],m:9,wd:6,n:3},
  {slug:"dzien-systemow-informacji-geograficznej",names:["Dzień Systemów Informacji Geograficznej", "Dzień Systemów Informacji Geograficznej (GIS Day)"],m:11,wd:3,n:3},
  {slug:"swieto-mlodego-wina",names:["Święto Młodego Wina", "Święto Młodego Wina (Beaujolais Nouveau)"],m:11,wd:4,n:3},
  {slug:"final-wosp",names:["Finał WOŚP", "Finał Wielkiej Orkiestry Świątecznej Pomocy (WOŚP)"],m:1,wd:0,n:-1},
  {slug:"niebieski-poniedzialek",names:["Niebieski Poniedziałek"],m:1,wd:1,n:3},
  {slug:"swiatowy-dzien-drzemki-w-pracy",names:["Światowy Dzień Drzemki w Pracy"],m:3,wd:1,from:9},
  {slug:"swiatowy-dzien-pochp",names:["Światowy Dzień Przewlekłej Obturacyjnej Choroby Płuc", "Światowy Dzień Przewlekłej Obturacyjnej Choroby Płuc (POChP)"],m:11,wd:3,n:3},
];

function sfEaster(y){
  const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,
    i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,mm=Math.floor((a+11*h+22*l)/451);
  return new Date(y,Math.floor((h+l-7*mm+114)/31)-1,((h+l-7*mm+114)%31)+1);
}
// [dzień,miesiąc] reguły r w roku year
function floatingDayFor(r,year){
  if(r.easter!==undefined){const dt=new Date(sfEaster(year).getTime()+r.easter*86400000);return [dt.getDate(),dt.getMonth()+1];}
  if(r.from){const first=new Date(year,r.m-1,r.from);return [r.from+(r.wd-first.getDay()+7)%7,r.m];}
  if(r.n>0){const first=new Date(year,r.m-1,1);return [1+(r.wd-first.getDay()+7)%7+(r.n-1)*7,r.m];}
  const last=new Date(year,r.m,0);return [last.getDate()-(last.getDay()-r.wd+7)%7,r.m];
}
const SWIETA_FLOATING_BY_NAME={};
SWIETA_FLOATING.forEach(r=>r.names.forEach(n=>{SWIETA_FLOATING_BY_NAME[n]=r;}));
// Lista [[d,m,nazwa,...],...] -> ta sama lista z datami ruchomych świąt przeliczonymi na rok year
// (bez duplikatów tego samego święta, posortowana po miesiącu i dniu).
function redateFloating(list,year){
  const seen=new Set(),out=[];
  list.forEach(h=>{
    const r=SWIETA_FLOATING_BY_NAME[h[2]];
    if(!r){out.push(h);return;}
    if(seen.has(r.slug))return;
    seen.add(r.slug);
    const [d,m]=floatingDayFor(r,year);
    out.push([d,m].concat(h.slice(2)));
  });
  return out.map((h,i)=>[h,i]).sort((a,b)=>a[0][1]-b[0][1]||a[0][0]-b[0][0]||a[1]-b[1]).map(x=>x[0]);
}
// Nazwy (pierwsza nazwa reguły) świąt ruchomych wypadających dnia d.m w roku year
function floatingNamesOn(year,m,d){
  return SWIETA_FLOATING.filter(r=>{const x=floatingDayFor(r,year);return x[0]===d&&x[1]===m;}).map(r=>r.names[0]);
}
// Tekst reguły do pola "data" na stronie święta (np. "trzecia niedziela stycznia (ruchoma data)")
function floatingRuleText(r){
  const MG=['stycznia','lutego','marca','kwietnia','maja','czerwca','lipca','sierpnia','września','października','listopada','grudnia'];
  const WDN=['niedziela','poniedziałek','wtorek','środa','czwartek','piątek','sobota'];
  if(r.easter!==undefined)return r.easter===42?'niedziela przed Zesłaniem Ducha Świętego (ruchoma data)':'ruchoma data (zależna od Wielkanocy)';
  if(r.from)return WDN[r.wd]+' między '+r.from+' a '+(r.from+6)+' '+MG[r.m-1]+' (ruchoma data)';
  const fem=r.wd===0||r.wd===3||r.wd===6;
  const ord={1:['pierwsza','pierwszy'],2:['druga','drugi'],3:['trzecia','trzeci'],4:['czwarta','czwarty'],'-1':['ostatnia','ostatni']}[r.n][fem?0:1];
  return ord+' '+WDN[r.wd]+' '+MG[r.m-1]+' (ruchoma data)';
}
