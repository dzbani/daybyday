// Główny skrypt strony głównej (index.html) — wydzielony 15.10.2026 z HTML (było ok. 70 KB inline w każdym pobraniu strony).
// Plik jest cache'owany przez Service Worker (cache-first) pod adresem home_main.js?v=NNN — po KAŻDEJ zmianie uruchom
// node scripts/bump_sw.js (podbija wersję sw.js i ?v= przy home_*.js w index.html). Dane: home_names.js, home_holidays.js
// (ładowane synchronicznie przed tym plikiem) oraz home_quotes.js + przyslowia_data.js (ładowane leniwie przez loadHomeLazy).
const HOME_V = ((document.currentScript && document.currentScript.src.match(/[?&]v=(\d+)/)) || [])[1] || '';
// Leniwe dane: wczytaj tuż po zdarzeniu load, potem wywołaj cb
function loadHomeLazy(cb){
  const files = ['home_quotes.js', 'przyslowia_data.js'];
  const go = () => {
    let left = files.length;
    files.forEach(f => {
      const s = document.createElement('script');
      s.src = f + (HOME_V ? '?v=' + HOME_V : '');
      s.onload = s.onerror = () => { if (--left === 0) cb(); };
      document.head.appendChild(s);
    });
  };
  const start = () => setTimeout(go, 50); // zaraz po load: poza ścieżką krytyczną, ale bez czekania na bezczynność (karta cytatu/przysłowia pojawia się po ułamku sekundy)
  if (document.readyState === 'complete') start(); else window.addEventListener('load', start);
}
function nameSlug(n) { return n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/ł/g,'l').replace(/[^a-z0-9-]/g,''); }
function swietoHref(slug) { return (typeof SWIETO_SLUGS!=='undefined'&&SWIETO_SLUGS.has(slug))?`/swieto/${slug}/`:`swieto.html?id=${slug}`; }
// ── Dane: imieniny ────────────────────────────────────────────
// NAMES → home_names.js (wydzielone 15.10.2026)

// ── Dane: święta (kompakt: [d,m,name,tag]) ───────────────────
// HOLIDAYS → home_holidays.js (wydzielone 15.10.2026)

// ── Święta ruchome (data zależna od dnia tygodnia, np. "pierwsza środa miesiąca") ──
// Liczone algorytmicznie z roku przeglądanej strony (`y`), bez tabeli lat na przyszłość —
// ten sam wzorzec co licznik do wakacji w kalendarz-szkolny.html (patrz CLAUDE.md).
function nthWeekdayOfMonth(year,month,weekday,n){
  // month: 1-12, weekday: 0=niedziela..6=sobota (jak Date.getDay()), n>0: n-te wystąpienie, n=-1: ostatnie w miesiącu
  if(n>0){
    const first=new Date(year,month-1,1);
    const offset=(weekday-first.getDay()+7)%7;
    return 1+offset+(n-1)*7;
  }
  const last=new Date(year,month,0); // dzień 0 kolejnego miesiąca = ostatni dzień tego miesiąca
  const offset=(last.getDay()-weekday+7)%7;
  return last.getDate()-offset;
}
const FLOATING_HOLIDAYS=[
  {name:'Światowy Dzień Pozyskiwania Talentów',month:9,weekday:3,n:1,tag:'inne'},
];

// ── Kolory tagów ──────────────────────────────────────────────
const TAG_COLOR = {
  'Tradycja':'#C9A84C','Jedzenie':'#E8936A','Przyroda':'#5A7A5A','Zdrowie':'#E87B7B',
  'Ekologia':'#4A7A4A','Kultura':'#A07BE8','Nauka':'#7BAAE8','Sport':'#5A7AA8',
  'Relacje':'#E87BB8','Zabawa':'#C8B040','Dzieci':'#E86060','Muzyka':'#B87BE8',
  'Sztuka':'#E8A07B','Technologia':'#7BB8D8','Społeczeństwo':'#A07B6A','Historia':'#8A8A7A',
  'Praca':'#6A7A8A','Moda':'#D87BA8','Rodzina':'#E8C07B','Pop-kultura':'#B87B9A',
  'Podróże':'#7BAAE8','Literatura':'#C09070','Zwierzęta':'#7BAE7B','Edukacja':'#7BB8E8',
  'inne':'#888580','jedzenie':'#E8936A','przyroda':'#5A7A5A','zdrowie':'#E87B7B','kultura':'#A07BE8',
  'panstwowe':'#3A5FA0','koscielne':'#8B5E2A','nieoficjalne':'#6B6864','historyczne':'#7A6A5E',
};

// Rozwiazuje nazwe swieta na slug przez SWIETO_NAME_TO_SLUG (swieto_names.js) - ta mapa juz
// zawiera rejestr recznie zweryfikowanych aliasow (NAME_ALIASES z scripts/swieto_registry.js),
// wiec dwie rozne nazwy tego samego realnego swieta (np. "Dzien Nauki Polskiej" i pelne
// "Narodowy Dzien Nauki Polskiej") rozwiazuja sie do TEGO SAMEGO sluga. Funkcja na najwyzszym
// poziomie (nie const w jednym domknieciu), zeby byla widoczna z kazdego bloku ktory laczy
// lekka liste HOLIDAYS z SWIETA_DATA - dedup PO SAMEJ NAZWIE nie wystarcza, bo obie nazwy
// czesto sie od siebie roznia mimo ze to to samo wydarzenie. Znalezione 16.09.2026.
function nameToSlugSafe(name){ return (typeof SWIETO_NAME_TO_SLUG!=='undefined')?SWIETO_NAME_TO_SLUG[name]:undefined; }

// ── Polskie święta ustawowo wolne od pracy — wspólne źródło ────
// Wielkanoc (algorytm Gaussa) i pochodne od niej święta ruchome. Wspólna funkcja, żeby ten sam
// wzór i ta sama lista dni wolnych nie żyły w kilku niezależnych kopiach w tym pliku — dokładnie
// to spowodowało bug 12.09.2026: karta "Następny długi weekend" miała WŁASNĄ, osobno utrzymywaną
// listę świąt (getHolidays), która nie miała Wigilii, mimo że karta "Ile zostało do końca roku"
// (PUBLIC_HOLIDAYS+MOVABLE) już ją poprawnie uwzględniała.
function easterDateFor(y){
  const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4;
  const f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30;
  const i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7;
  const mm=Math.floor((a+11*h+22*l)/451);
  return new Date(y,Math.floor((h+l-7*mm+114)/31)-1,((h+l-7*mm+114)%31)+1);
}
// ── Równonoce i przesilenia — algorytm Meeusa (Astronomical Algorithms, rozdz. 27) ──
// Data astronomicznego początku pory roku liczona dla danego roku, NIE na sztywno (21 III /
// 21 VI / 22 XII to data z jednego roku: przesilenie zimowe 2026 to 21 XII, letnie 2028 to 20 VI).
// k: 0=równonoc wiosenna, 1=przesilenie letnie, 2=równonoc jesienna, 3=przesilenie zimowe.
// Zwraca datę kalendarzową w strefie Europe/Warsaw (dokładność rzędu minut; ΔT≈69 s odjęte).
const SEASON_TERMS=[[485,324.96,1934.136],[203,337.23,32964.467],[199,342.08,20.186],[182,27.85,445267.112],[156,73.14,45036.886],[136,171.52,22518.443],[77,222.54,65928.934],[74,296.72,3034.906],[70,243.58,9037.513],[58,119.81,33718.147],[52,297.17,150.678],[50,21.02,2281.226],[45,247.54,29929.562],[44,325.15,31555.956],[29,60.93,4443.417],[18,155.12,67555.328],[17,288.79,4562.452],[16,198.04,62894.029],[14,199.76,31436.921],[12,95.39,14577.848],[12,287.11,31931.756],[12,320.81,34777.259],[9,227.73,1222.114],[8,15.45,16859.074]];
function seasonInstantFor(y,k){
  const Y=(y-2000)/1000;
  const c=[[2451623.80984,365242.37404,0.05169,-0.00411,-0.00057],
           [2451716.56767,365241.62603,0.00325,0.00888,-0.00030],
           [2451810.21715,365242.01767,-0.11575,0.00337,0.00078],
           [2451900.05952,365242.74049,-0.06223,-0.00823,0.00032]][k];
  const jde0=c[0]+c[1]*Y+c[2]*Y*Y+c[3]*Y*Y*Y+c[4]*Y*Y*Y*Y;
  const T=(jde0-2451545)/36525,rad=Math.PI/180;
  const W=35999.373*T-2.47;
  const dl=1+0.0334*Math.cos(W*rad)+0.0007*Math.cos(2*W*rad);
  let S=0;
  for(const [A,B,C] of SEASON_TERMS)S+=A*Math.cos((B+C*T)*rad);
  const jde=jde0+0.00001*S/dl;
  return new Date((jde-2440587.5)*86400000-69000); // JDE → UTC (ΔT≈69 s)
}
function seasonDateFor(y,k){
  const inst=seasonInstantFor(y,k);
  try{
    const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Warsaw',day:'numeric',month:'numeric'}).formatToParts(inst);
    return [+p.find(x=>x.type==='day').value,+p.find(x=>x.type==='month').value];
  }catch(e){
    // brak Intl/strefy: czas środkowoeuropejski (UTC+1 zimą, +2 latem)
    const dt=new Date(inst.getTime()+(k===1||k===2?2:1)*3600000);
    return [dt.getUTCDate(),dt.getUTCMonth()+1];
  }
}
// Pełna lista dni ustawowo wolnych od pracy dla danego roku jako pary [dzień,miesiąc] (stałe +
// ruchome liczone od Wielkanocy). Wigilia (24 XII) wolna od 2025 r. (Dz.U. 2024 poz. 1965).
function polishHolidayDates(y){
  const em=easterDateFor(y).getTime(), ms=86400000;
  const md=off=>{const dt=new Date(em+off*ms);return [dt.getDate(),dt.getMonth()+1];};
  return [
    [1,1],[6,1], md(0), md(1), [1,5],[3,5], md(49), md(60),
    [15,8],[1,11],[11,11],[24,12],[25,12],[26,12]
  ];
}

// ── Cytaty ────────────────────────────────────────────────────
// QUOTES → home_quotes.js (wydzielone 15.10.2026)

// ── Przysłowia — per dzień (d-m) lub fallback miesięczny ─────
let PROVERBS_DAILY, PROVERBS_MONTH_POOL;
function buildProverbIndex(){
PROVERBS_DAILY = (function(){
  const daily = {};
  for (const m in PROVERBS) {
    PROVERBS[m].forEach(day => { daily[`${day.d}-${m}`] = day.p; });
  }
  return daily;
})();
// Pula miesięczna — przysłowia pasujące do miesiąca (zbudowana z PROVERBS_DAILY)
PROVERBS_MONTH_POOL = (function(){
  const pool = {};
  Object.entries(PROVERBS_DAILY).forEach(([key, arr]) => {
    const mo = parseInt(key.split('-')[1]);
    if (!pool[mo]) pool[mo] = [];
    arr.forEach(p => { if (!pool[mo].includes(p)) pool[mo].push(p); });
  });
  // Dodaj sezonowe z ogólnej puli
  const extra = {
    1: ['Jedna jaskółka wiosny nie czyni.','Pasuje jak kwiatek do kożucha.'],
    2: ['Jedna jaskółka wiosny nie czyni.','Pasuje jak kwiatek do kożucha.'],
    3: ['Jedna jaskółka wiosny nie czyni.','Konia kują, żaba nogę podstawia.','Czyj nasiew, tego plon.'],
    4: ['Kwiecień plecień — bo przeplata trochę zimy, trochę lata.','Czyj nasiew, tego plon.','Kto sieje wiatr, ten zbiera burze.'],
    5: ['Czyj nasiew, tego plon.','Kto sieje jarke tatarke i proso, to chodzi boso.','Siejesz wiatr – zbierasz burze.'],
    6: ['Czyja kosa pierwsza, tego miedza szersza.','Na Alberta sianokosów pełna sterta.','Kto sieje wiatr, ten zbiera burze.'],
    7: ['Czyja kosa pierwsza, tego miedza szersza.','Na Alberta sianokosów pełna sterta.'],
    8: ['I kwaśne jabłko robak toczy.','Jakie jabłko, taka skórka, jaka matka, taka córka.','Czyja kosa pierwsza, tego miedza szersza.'],
    9: ['I kwaśne jabłko robak toczy.','Jakie jabłko, taka skórka, jaka matka, taka córka.','Czyj nasiew, tego plon.'],
    10:['I kwaśne jabłko robak toczy.','Pasuje jak kwiatek do kożucha.'],
    11:['Pasuje jak kwiatek do kożucha.','Jedna jaskółka wiosny nie czyni.'],
    12:['Pasuje jak kwiatek do kożucha.','Jedna jaskółka wiosny nie czyni.'],
  };
  Object.entries(extra).forEach(([mo, arr]) => {
    if (!pool[mo]) pool[mo] = [];
    arr.forEach(p => { if (!pool[mo].includes(p)) pool[mo].push(p); });
  });
  return pool;
})();
}

// Pora roku → miesiące
function getSeason(m) {
  if (m === 12 || m <= 2) return 'zima';
  if (m <= 5) return 'wiosna';
  if (m <= 8) return 'lato';
  return 'jesien';
}
const SEASON_MONTHS = { zima:[12,1,2], wiosna:[3,4,5], lato:[6,7,8], jesien:[9,10,11] };

// ── Nazwy ─────────────────────────────────────────────────────
const MONTH_NOM=['','Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'];
const MONTH_GEN=['','stycznia','lutego','marca','kwietnia','maja','czerwca','lipca','sierpnia','września','października','listopada','grudnia'];
const DAY_NOM=['Niedziela','Poniedziałek','Wtorek','Środa','Czwartek','Piątek','Sobota'];

// ── Pomocnicze ────────────────────────────────────────────────
function getDayOfYear(d){const s=Date.UTC(d.getFullYear(),0,1);const c=Date.UTC(d.getFullYear(),d.getMonth(),d.getDate());return Math.round((c-s)/86400000)+1;}
function getISOWeek(d){const dt=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));const dw=dt.getUTCDay()||7;dt.setUTCDate(dt.getUTCDate()+4-dw);const y=new Date(Date.UTC(dt.getUTCFullYear(),0,1));return Math.ceil((((dt-y)/86400000)+1)/7);}

function getZodiac(m,d){
  if((m==3&&d>=21)||(m==4&&d<=19))return{n:'Baran',s:'♈',r:'21 marca – 19 kwietnia'};
  if((m==4&&d>=20)||(m==5&&d<=20))return{n:'Byk',s:'♉',r:'20 kwietnia – 20 maja'};
  if((m==5&&d>=21)||(m==6&&d<=20))return{n:'Bliźnięta',s:'♊',r:'21 maja – 20 czerwca'};
  if((m==6&&d>=21)||(m==7&&d<=22))return{n:'Rak',s:'♋',r:'21 czerwca – 22 lipca'};
  if((m==7&&d>=23)||(m==8&&d<=22))return{n:'Lew',s:'♌',r:'23 lipca – 22 sierpnia'};
  if((m==8&&d>=23)||(m==9&&d<=22))return{n:'Panna',s:'♍',r:'23 sierpnia – 22 września'};
  if((m==9&&d>=23)||(m==10&&d<=22))return{n:'Waga',s:'♎',r:'23 września – 22 października'};
  if((m==10&&d>=23)||(m==11&&d<=21))return{n:'Skorpion',s:'♏',r:'23 października – 21 listopada'};
  if((m==11&&d>=22)||(m==12&&d<=21))return{n:'Strzelec',s:'♐',r:'22 listopada – 21 grudnia'};
  if((m==12&&d>=22)||(m==1&&d<=19))return{n:'Koziorożec',s:'♑',r:'22 grudnia – 19 stycznia'};
  if((m==1&&d>=20)||(m==2&&d<=18))return{n:'Wodnik',s:'♒',r:'20 stycznia – 18 lutego'};
  return{n:'Ryby',s:'♓',r:'19 lutego – 20 marca'};
}

// ── Wschód/zachód słońca — lokalizacja użytkownika ────────
const LOC_DEFAULT={name:'Poznań',lat:52.4064,lon:16.9252};
let LOC_NAME=LOC_DEFAULT.name,LOC_LAT=LOC_DEFAULT.lat,LOC_LON=LOC_DEFAULT.lon;
(function(){const s=localStorage.getItem('dbd-loc');if(s){try{const p=JSON.parse(s);
  // Obliczenia strefy czasowej (isPolandDST/calcSunTimes/getMoonRiseSet) zakładają polską
  // strefę — zapisana lokalizacja spoza Polski (np. zaległy wpis sprzed dodania
  // countrycodes=pl do wyszukiwarki) dawałaby godziny przesunięte nawet o godzinę,
  // więc taki wpis odrzucamy i wracamy do domyślnej lokalizacji.
  const inPoland=p.lat>=48.5&&p.lat<=55.5&&p.lon>=13.5&&p.lon<=24.5;
  if(inPoland){LOC_NAME=p.name;LOC_LAT=p.lat;LOC_LON=p.lon;}else{localStorage.removeItem('dbd-loc');}
}catch(e){}}})();

// Czas letni UE: ostatnia niedziela marca 01:00 UTC -> ostatnia niedziela pazdziernika 01:00 UTC.
// Liczone wprost z daty docelowej (nie z zegara systemowego przegladarki/robota), zeby dzialalo
// poprawnie niezaleznie od strefy czasowej odwiedzajacego.
function isPolandDST(year,month,day){
  if(month<3||month>10)return false;
  if(month>3&&month<10)return true;
  const lastSunday=(y,m)=>{const d=new Date(Date.UTC(y,m,0));const dow=d.getUTCDay();d.setUTCDate(d.getUTCDate()-dow);return d.getUTCDate();};
  if(month===3)return day>=lastSunday(year,3);
  return day<lastSunday(year,10);
}

// Pozycja Slonca niskiej precyzji wg Astronomical Almanac/Meeus rozdz. 25+28
// (rownanie srodka + prawdziwa dlugosc ekliptyczna), zamiast wczesniejszego
// przyblizenia Fouriera NOAA - zmierzona 2026-08-29 systematyczna roznica
// zachodu/dlugosci dnia do ~3 min wobec timeanddate.com dla Poznania,
// zweryfikowana na 15 dniach; nowy wzor zgadza sie z dokladnoscia <1 min.
function calcSunCore(year,month,day,lat,lon){
  const rad=Math.PI/180;
  function toJD(y,m,d){if(m<=2){y--;m+=12;}const A=Math.floor(y/100);const B=2-A+Math.floor(A/4);return Math.floor(365.25*(y+4716))+Math.floor(30.6001*(m+1))+d+B-1524.5;}
  // Parametry Slonca (deklinacja, rownanie czasu) sa liczone dla chwili samego wschodu/zachodu
  // (2 iteracje od poludnia UTC), a nie tylko dla poludnia: Slonce zmienia deklinacje i rownanie
  // czasu w ciagu doby, wiec pojedyncze przyblizenie dawalo blad do ok. 45 s (rms 20-30 s),
  // czyli ok. 40% wyswietlanych minut bylo o 1 min za wczesnie/pozno. Po zmianie rms 1,5-3 s
  // wzgledem astronomy-engine (zmierzone 21.09.2026, Warszawa, caly rok).
  function solar(JD) {
  const T=(JD-2451545.0)/36525;
  const L0=((280.46646+36000.76983*T+0.0003032*T*T)%360+360)%360; // srednia dlugosc Slonca
  const M=((357.52911+35999.05029*T-0.0001537*T*T)%360+360)%360;  // srednia anomalia
  const Mr=M*rad;
  const C=(1.914602-0.004817*T-0.000014*T*T)*Math.sin(Mr)+(0.019993-0.000101*T)*Math.sin(2*Mr)+0.000289*Math.sin(3*Mr); // rownanie srodka
  const trueLon=L0+C;
  const Omega=125.04-1934.136*T;
  const appLon=trueLon-0.00569-0.00478*Math.sin(Omega*rad); // dlugosc pozorna (nutacja+aberracja)
  const eps0=23.439291-0.0130042*T-0.00000016*T*T+0.000000504*T*T*T; // srednie nachylenie ekliptyki
  const eps=eps0+0.00256*Math.cos(Omega*rad);
  const decl=Math.asin(Math.sin(eps*rad)*Math.sin(appLon*rad));
  const RA=(Math.atan2(Math.cos(eps*rad)*Math.sin(appLon*rad),Math.cos(appLon*rad))/rad+360)%360;
  let eotDeg=L0-0.0057183-RA;
  if(eotDeg>180)eotDeg-=360; if(eotDeg<-180)eotDeg+=360;
  const eqt=eotDeg*4; // rownanie czasu w minutach
    return { decl, eqt };
  }
  const JD0=toJD(year,month,day)+0.5;
  function eventMin(sign, zen) { // sign: -1 = wschod/swit, +1 = zachod/zmierzch; zen: zenit w stopniach (minuty UTC od polnocy)
    let p = solar(JD0), min = 0;
    for (let i = 0; i < 2; i++) {
      const cosHA = (Math.cos(zen * rad) - Math.sin(lat * rad) * Math.sin(p.decl)) / (Math.cos(lat * rad) * Math.cos(p.decl));
      if (Math.abs(cosHA) > 1) return null;
      const HA = Math.acos(cosHA) / rad;
      min = 720 - 4 * (lon - sign * HA) - p.eqt;
      p = solar(JD0 + (min / 60 - 12) / 24);
    }
    return min;
  }
  const riseMin = eventMin(-1, 90.833), setMin = eventMin(1, 90.833);
  if (riseMin === null || setMin === null) return null;
  // Swit i zmierzch cywilny (zenit 96 stopni, Slonce 6 stopni pod horyzontem) - te same iteracje co wschod/zachod
  // (rms bledu ~0,5-3 s zamiast 25-35 s przy parametrach z poludnia UTC).
  const dawnMin = eventMin(-1, 96), duskMin = eventMin(1, 96);
  // Gorowanie (poludnie sloneczne) i wysokosc Slonca w poludnie: parametry z poludnia UTC wystarczaja
  // (poludnie sloneczne w Polsce to ok. 10-11 UTC, blad rownania czasu ~1-2 s).
  const noonP = solar(JD0);
  return{riseUTC:riseMin/60,setUTC:setMin/60,lenH:(setMin-riseMin)/60,eqt:noonP.eqt,decl:noonP.decl,
    dawnUTC:dawnMin===null?null:dawnMin/60,duskUTC:duskMin===null?null:duskMin/60};
}

function calcSunTimes(year,month,day){
  const c=calcSunCore(year,month,day,LOC_LAT,LOC_LON);
  if(!c)return{rise:'—',set:'—',len:'—',frac:0,lenMin:0,dawn:'—',dusk:'—',noon:'—',noonAlt:'—'};
  const tz=isPolandDST(year,month,day)?2:1;
  const fmt=h=>{h=((h+tz)%24+24)%24;let hh=Math.floor(h),mm=Math.round((h-hh)*60);if(mm===60){mm=0;hh=(hh+1)%24;}return`${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;};
  let lh=Math.floor(c.lenH),lm=Math.round((c.lenH-lh)*60);
  if(lm===60){lm=0;lh+=1;}
  // Świt i zmierzch cywilny (-6°) liczone w calcSunCore (jedno źródło, z iteracją do chwili zdarzenia).
  const rad=Math.PI/180;
  const {eqt,decl}=c;
  const dawn=c.dawnUTC!==null?fmt(c.dawnUTC):'—';
  const dusk=c.duskUTC!==null?fmt(c.duskUTC):'—';
  // Górowanie (południe słoneczne) i wysokość słońca w południe
  const noonUTC=(720-4*LOC_LON-eqt)/60;
  const noonAltDeg=Math.asin(Math.sin(LOC_LAT*rad)*Math.sin(decl)+Math.cos(LOC_LAT*rad)*Math.cos(decl))/rad;
  return{rise:fmt(c.riseUTC),set:fmt(c.setUTC),len:`${lh}h ${lm}min`,frac:Math.min(c.lenH/17,1),lenMin:Math.round(c.lenH*60),dawn,dusk,noon:fmt(noonUTC),noonAlt:Math.round(noonAltDeg)};
}

function calcDayLenMin(year,month,day){
  const c=calcSunCore(year,month,day,LOC_LAT,LOC_LON);
  return c?Math.round(c.lenH*60):0;
}

function fmtDiff(mins){
  const h=Math.floor(Math.abs(mins)/60),m=Math.abs(mins)%60;
  if(h===0)return`${m} min.`;
  if(m===0)return`${h} godz.`;
  return`${h} godz. i ${m} min.`;
}

// ── Faza księżyca ─────────────────────────────────────────────
function getMoonPhase(year,month,day){
  // Algorytm Meeus "Astronomical Algorithms" rozdz. 47-48
  // Oblicza prawdziwą elongację z głównymi perturbacjami — dokładność ~0,5%
  const rad=Math.PI/180;
  function toJD(y,m,d){if(m<=2){y--;m+=12;}const A=Math.floor(y/100);const B=2-A+Math.floor(A/4);return Math.floor(365.25*(y+4716))+Math.floor(30.6001*(m+1))+d+B-1524.5;}
  const JD=toJD(year,month,day)+0.5; // południe
  // Dlugosci Ksiezyca i Slonca oraz elongacja dla dowolnej chwili (JD) - uzywane i dla poludnia
  // danego dnia (faza/wiek), i do wyszukiwania nastepnej pelni (bez tablicy dat).
  function moonSun(jd){
    const T=(jd-2451545.0)/36525;     // wieki juliańskie od J2000.0

    // Podstawowe argumenty orbitalne (Meeus równ. 47.1-47.7)
    const D =((297.8501921+445267.1114034*T-0.0018819*T*T+T*T*T/545868)%360+360)%360; // średnia elongacja
    const M =((357.5291092+ 35999.0502909*T-0.0001536*T*T)%360+360)%360;               // anomalia śr. Słońca
    const Mp=((134.9633964+477198.8675055*T+0.0087414*T*T+T*T*T/69699)%360+360)%360;  // anomalia śr. Księżyca
    const F =((93.2720950 +483202.0175233*T-0.0036539*T*T)%360+360)%360;               // arg. szerokości
    const Lp=((218.3164477+481267.88123421*T-0.0015786*T*T)%360+360)%360;              // dług. śr. Księżyca

    // Główne poprawki długości (Meeus tab. 47.A, jednostki: 0,000001°)
    const dL=6288774*Math.sin(Mp*rad)
      +1274027*Math.sin((2*D-Mp)*rad)
      + 658314*Math.sin(2*D*rad)
      + 213618*Math.sin(2*Mp*rad)
      - 185116*Math.sin(M*rad)
      - 114332*Math.sin(2*F*rad)
      +  58793*Math.sin((2*D-2*Mp)*rad)
      +  57066*Math.sin((2*D-M-Mp)*rad)
      +  53322*Math.sin((2*D+Mp)*rad)
      +  45758*Math.sin((2*D-M)*rad)
      -  40923*Math.sin((M-Mp)*rad)
      -  34720*Math.sin(D*rad)
      -  30383*Math.sin((M+Mp)*rad)
      +  15327*Math.sin((2*D-2*F)*rad)
      +  10980*Math.sin((Mp-2*F)*rad)
      +  10675*Math.sin((4*D-Mp)*rad)
      +  10034*Math.sin(3*Mp*rad)
      +   8548*Math.sin((4*D-2*Mp)*rad)
      -   7888*Math.sin((2*D+M-Mp)*rad)
      -   6766*Math.sin((2*D+M)*rad)
      -   5163*Math.sin((D-Mp)*rad);

    // Prawdziwa długość Księżyca
    const moonLon=((Lp+dL/1000000)%360+360)%360;

    // Dlugosc Slonca: srednia + rownanie srodka (poprawka na eliptycznosc orbity Ziemi,
    // do ~1,9 stopnia) - sama srednia dawala az ~3-4h bledu w momencie zmiany fazy
    // (znaleziony 12.09.2026 w fazy-ksiezyca.html, ten sam wzorzec tutaj, naprawione i
    // zweryfikowane niezaleznie na 3 terminach w 3 miesiacach, blad spadl do ~1-2 min).
    const sunLonMean=((280.46646+36000.76983*T+0.0003032*T*T)%360+360)%360;
    const eqC=(1.914602-0.004817*T-0.000014*T*T)*Math.sin(M*rad)+(0.019993-0.000101*T)*Math.sin(2*M*rad)+0.000289*Math.sin(3*M*rad);
    const sunLon=((sunLonMean+eqC)%360+360)%360;

    // Prawdziwa elongacja → wiek fazowy i oświetlenie
    const elong=((moonLon-sunLon)%360+360)%360;
    return{moonLon,sunLon,elong};
  }
  const {moonLon,sunLon,elong}=moonSun(JD);
  const SYNODIC=29.53058867;
  const age=elong/360*SYNODIC;
  // Wiek do nazwy fazy (progi poniżej) = elongacja/360*okres synodyczny.
  // Wiek WYŚWIETLANY = rzeczywisty czas od ostatniego nowiu (Newton po elongacji=0): Księżyc
  // porusza się nierówno (11-15°/dobę), więc wiek z samej elongacji myli się do ~0,6 doby
  // (26.09.2026: pełnia, elongacja dawała 14,6 d, a od nowiu 11.09 minęło 15,4 d).
  let tNew=JD-age;
  for(let i=0;i<8;i++){let de=moonSun(tNew).elong;if(de>180)de-=360;tNew-=de/12.19;}
  const ageSinceNew=JD-tNew;
  const bright=Math.round((1-Math.cos(elong*rad))/2*100);

  // Nazwa fazy — okna kardynalne (Nów/Kwadry/Pełnia) wąskie (±0,5 dnia wokół
  // dokładnego momentu astronomicznego), reszta miesiąca to fazy przejściowe
  // (sierp/garb). Potwierdzone 2026-08-29 porównaniem z 4 niezależnymi
  // źródłami (timeanddate.com, moongiant.com, kalendarz-365.pl, TheSkyLive) —
  // wszystkie zgodnie etykietują Pełnię tylko na pojedynczy dzień najbliższy
  // dokładnemu momentowi, a już następny dzień jako fazę przejściową mimo
  // wciąż wysokiej (~97-98%) jasności. Wcześniejsza wersja z szerokim,
  // symetrycznym oknem (SYNODIC/8, ~3,69 dnia) była oparta tylko na
  // kalendarzswiat.pl, który okazał się jedynym odstającym źródłem.
  // Dzień kardynalny (Nów/kwadra/Pełnia) = dzień czasu polskiego, w którym elongacja przekracza 0/90/180/270° (data lokalna dokładnego
  // momentu, jak w almanachach i na /kalendarz-ksiezycowy/); pozostałe dni — faza przejściowa wg ćwiartki elongacji o 12:00 UTC.
  // Wcześniej okna wiekowe ±0,5 d o 12:00 UTC: w ok. 3% faz etykieta lądowała na sąsiednim dniu (np. pełnia 24.12.2026 02:28).
  const tzOff=isPolandDST(year,month,day)?2:1, jd0=JD-0.5-tzOff/24;
  const qa=Math.floor(moonSun(jd0).elong/90), qb=Math.floor(moonSun(jd0+1).elong/90);
  const PH_CARD=[['Nów','🌑'],['Pierwsza kwadra','🌓'],['Pełnia','🌕'],['Ostatnia kwadra','🌗']];
  const PH_TRANS=[['Wzrastający sierp','🌒'],['Wzrastający garb','🌔'],['Zanikający garb','🌖'],['Zanikający sierp','🌘']];
  const phPick=(qa!==qb)?PH_CARD[qb]:PH_TRANS[Math.floor(elong/90)];
  const phase=phPick[0], icon=phPick[1];

  // Znak zodiaku z prawdziwej długości ekliptycznej
  const MOON_SIGNS=['Baran ♈','Byk ♉','Bliźnięta ♊','Rak ♋','Lew ♌','Panna ♍','Waga ♎','Skorpion ♏','Strzelec ♐','Koziorożec ♑','Wodnik ♒','Ryby ♓'];
  const signIdx=Math.floor(moonLon/30)%12;

  // Następna pełnia — szukana algorytmicznie (moment, gdy elongacja Księżyca od Słońca = 180°):
  // krok 6 h od południa UTC danego dnia, potem bisekcja do ~1 min. Wcześniejsza wersja miała
  // zaszytą tablicę dat USNO kończącą się 24.12.2026 — po tej dacie karta pokazywała na stałe
  // "24 grudnia (za 0 dni)". Dokładność wzoru (~kilka min) wystarcza do daty i liczby dni.
  const nowMs=new Date(Date.UTC(year,month-1,day,12,0)).getTime();
  let fullJD=null;
  {
    let t0=JD,e0=elong;
    for(let i=0;i<130&&fullJD===null;i++){
      const t1=t0+0.25,e1=moonSun(t1).elong;
      if(e0<180&&e1>=180){
        let lo=t0,hi=t1;
        for(let k=0;k<24;k++){const mid=(lo+hi)/2;if(moonSun(mid).elong<180)lo=mid;else hi=mid;}
        fullJD=(lo+hi)/2;
      }
      t0=t1;e0=e1;
    }
  }
  let nextFull='—';
  if(fullJD!==null){
    const nextFM=new Date((fullJD-2440587.5)*86400000);
    const daysToFull=Math.max(0,(nextFM.getTime()-nowMs)/86400000);
    nextFull=`${nextFM.getDate()} ${MONTH_GEN[nextFM.getMonth()+1]} (za ${Math.round(daysToFull)} dni)`;
  }
  return{phase:`${icon} ${phase}`,age:`${ageSinceNew.toFixed(1)} dni`,bright:`${bright}%`,sign:MOON_SIGNS[signIdx],nextFull};
}

// ── Wschód/zachód księżyca ─────────────────────────────────────
function getMoonRiseSet(year,month,day,lat,lon){
  const rad=Math.PI/180;
  const toJD=(y,m,d)=>{if(m<3){y--;m+=12;}const A=Math.floor(y/100);const B=2-A+Math.floor(A/4);return Math.floor(365.25*(y+4716))+Math.floor(30.6001*(m+1))+d+B-1524.5;};
  const tz=isPolandDST(year,month,day)?2:1;
  // W dzień zmiany czasu przesunięcie zmienia się o 01:00 UTC: przed nim obowiązuje offset z doby poprzedniej
  const pd=new Date(year,month-1,day-1),tzPrev=isPolandDST(pd.getFullYear(),pd.getMonth()+1,pd.getDate())?2:1;
  const tzAt=h=>(tzPrev!==tz&&h<1)?tzPrev:tz;
  const fmt=h=>{const local=((h+tzAt(h))%24+24)%24;let hh=Math.floor(local),mm=Math.round((local-hh)*60);if(mm===60){hh=(hh+1)%24;mm=0;}return`${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;};

  // Pozycja księżyca — pełny algorytm Meeus rozdz. 47 (28+28 wyrazów)
  function moonPos(jd){
    const T=(jd-2451545.0)/36525;
    const r=rad,s=Math.sin;
    const Lp=((218.3164477+481267.88123421*T-0.0015786*T*T+T*T*T/538841)%360+360)%360;
    const D =((297.8501921+445267.1114034*T-0.0018819*T*T+T*T*T/545868)%360+360)%360;
    const M =((357.5291092+ 35999.0502909*T-0.0001536*T*T)%360+360)%360;
    const Mp=((134.9633964+477198.8675055*T+0.0087414*T*T+T*T*T/69699)%360+360)%360;
    const F =((93.2720950 +483202.0175233*T-0.0036539*T*T)%360+360)%360;
    const E=1-0.002516*T-0.0000074*T*T, E2=E*E;
    // poprawki długości ekliptycznej [0.000001°]
    const dL=6288774*s(Mp*r)+1274027*s((2*D-Mp)*r)+658314*s(2*D*r)
      +213618*s(2*Mp*r)-185116*E*s(M*r)-114332*s(2*F*r)
      +58793*s((2*D-2*Mp)*r)+57066*E*s((2*D-M-Mp)*r)
      +53322*s((2*D+Mp)*r)+45758*E*s((2*D-M)*r)
      -40923*E*s((M-Mp)*r)-34720*s(D*r)-30383*E*s((M+Mp)*r)
      +15327*s((2*D-2*F)*r)+10980*s((Mp-2*F)*r)
      +10675*s((4*D-Mp)*r)+10034*s(3*Mp*r)
      +8548*s((4*D-2*Mp)*r)-7888*E*s((2*D+M-Mp)*r)
      -6766*E*s((2*D+M)*r)-5163*s((D-Mp)*r)
      +4987*E*s((D+M)*r)+4036*E*s((2*D-M+Mp)*r)
      +3994*s((2*D+2*Mp)*r)+3861*s(4*D*r)
      +3665*s((2*D-3*Mp)*r)-2689*E*s((M-2*Mp)*r)
      -2602*s((2*D-Mp+2*F)*r)+2390*E*s((2*Mp-M)*r)
      -2348*s((D+Mp)*r);
    // poprawki szerokości ekliptycznej [0.000001°]
    const dB=5128122*s(F*r)+280602*s((Mp+F)*r)+277693*s((Mp-F)*r)
      +173237*s((2*D-F)*r)+55413*s((2*D+F-Mp)*r)
      +46271*s((2*D-F-Mp)*r)+32573*s((2*D+F)*r)
      +17198*s((2*Mp+F)*r)+9266*s((2*D+Mp-F)*r)
      +8822*s((2*Mp-F)*r)+8216*E*s((2*D-M-F)*r)
      +4324*s((2*D-2*Mp-F)*r)+4200*s((2*D+Mp+F)*r)
      -3359*E*s((2*D+M-F)*r)+2463*E*s((2*D-M-Mp+F)*r)
      +2211*E*s((2*D-M+F)*r)+2065*E*s((2*D-M-Mp-F)*r)
      -1870*E*s((M-Mp-F)*r)+1828*s((4*D-Mp-F)*r)
      -1794*E*s((M+F)*r)-1749*s(3*F*r)
      -1565*E*s((M-Mp+F)*r)-1491*s((D+F)*r)
      -1475*E*s((M+Mp+F)*r)-1410*E*s((M+Mp-F)*r)
      -1344*E*s((M-F)*r)-1335*s((D-F)*r)
      +1107*s((3*Mp+F)*r)+1021*s((4*D-F)*r);
    const moonLon=((Lp+dL/1000000)%360+360)%360;
    const moonLat=dB/1000000;
    const eps=(23.4392911-0.0130042*T)*r;
    const cLat=Math.cos(moonLat*r),sLat=Math.sin(moonLat*r);
    const cLon=Math.cos(moonLon*r),sLon=Math.sin(moonLon*r);
    const sinDec=sLat*Math.cos(eps)+cLat*Math.sin(eps)*sLon;
    const Dec=Math.asin(sinDec);
    const RA=((Math.atan2(sLon*Math.cos(eps)-sLat*Math.sin(eps)/cLat,cLon)/r)%360+360)%360;
    return{RA,Dec,sinDec};
  }

  const JD0=toJD(year,month,day);
  const T0=(JD0-2451545.0)/36525;
  const GMST0=(6.697374558+2400.0513369*T0+0.0000258622*T0*T0-1.7222e-9*T0*T0*T0)%24;
  const H0=0.125; // Meeus: h0 = 0.7275*π_mean - 0.5667°

  function moonAlt(t){
    const {RA,Dec,sinDec}=moonPos(JD0+t/24);
    const LST=((GMST0+t*1.00273791+lon/15)%24+24)%24;
    const HA=((LST-RA/15)*15%360+360)%360;
    return Math.asin(sinDec*Math.sin(lat*rad)+Math.cos(Dec)*Math.cos(lat*rad)*Math.cos(HA*rad))/rad-H0;
  }

  function bisect(lo,hi,rising){
    for(let i=0;i<50;i++){
      const m=(lo+hi)/2;
      if(rising?(moonAlt(m)<0):(moonAlt(m)>=0))lo=m; else hi=m;
    }
    return(lo+hi)/2;
  }

  // Doba lokalna: od północy do północy czasu polskiego, tj. od -tz do 24-tz godzin UTC względem JD0.
  // Wcześniej okno 0..25,1 h UTC (= 02:00 do 03:06 następnego dnia latem) — w dniu bez wschodu
  // pokazywało wschód z następnego dnia (znalezione 6.10.2026: 5 X "01:24", 6 X "02:51").
  const t0=-tzPrev,t1=24-tz;
  let riseT=null,setT=null,prev=moonAlt(t0);
  for(let t=t0+0.1;t<=t1+1e-9;t+=0.1){
    const curr=moonAlt(t);
    if(prev<0&&curr>=0&&riseT===null)riseT=bisect(t-0.1,t,true);
    if(prev>=0&&curr<0&&setT===null)setT=bisect(t-0.1,t,false);
    prev=curr;
  }

  return{rise:riseT!==null?fmt(riseT):'—',set:setT!==null?fmt(setT):'—'};
}

// ── Główna logika ─────────────────────────────────────────────
(function init(){
  // Pobierz datę z URL lub użyj dzisiaj
  const params=new URLSearchParams(location.search);
  const TODAY=new Date(); TODAY.setHours(0,0,0,0);
  const T=params.has('d')
    ? new Date(parseInt(params.get('y')||TODAY.getFullYear()), parseInt(params.get('m'))-1, parseInt(params.get('d')))
    : new Date(TODAY);
  T.setHours(0,0,0,0);
  const isToday=T.getTime()===TODAY.getTime();

  const y=T.getFullYear(),m=T.getMonth()+1,d=T.getDate();
  // SWIETA_DATA (z swieta_data.js) jest liczone dla realnego biezacego roku przy wczytaniu
  // skryptu (new Date().getFullYear()) - przegladanie innego dnia przez URL (?d=&m=&y=) moze
  // pokazywac inny rok niz "teraz", co dla swiat ruchomych dawaloby zle daty. Dla widzianego
  // roku innego niz biezacy liczymy ruchome swieta osobno dla tego roku (patrz naprawa
  // "zamrozenia" dat ruchomych w swieta_data.js, 4.09.2026).
  const swietaForY=(y===TODAY.getFullYear())?SWIETA_DATA:SWIETA_DATA_STATIC.concat(computeMovableSwieta(y));
  const doy=getDayOfYear(T);
  const week=getISOWeek(T);
  const zod=getZodiac(m,d);
  const sun=calcSunTimes(y,m,d);
  const moon=getMoonPhase(y,m,d);

  // Nawigacja prev/next
  const prev=new Date(T); prev.setDate(prev.getDate()-1);
  const next=new Date(T); next.setDate(next.getDate()+1);
  const dayUrl=dt=>`/?d=${dt.getDate()}&m=${dt.getMonth()+1}&y=${dt.getFullYear()}`;
  document.getElementById('prevDayLink').href=dayUrl(prev);
  document.getElementById('nextDayLink').href=dayUrl(next);
  if(!isToday){
    const tl=document.getElementById('todayLink'); tl.style.display='inline-block';
  }

  document.title=`Imieniny dzisiaj, święta i kalendarz | DaybyDay`;

  // Date hero
  const dayNameEl=document.getElementById('dayName');
  dayNameEl.textContent=DAY_NOM[T.getDay()];
  if(T.getDay()===0) dayNameEl.style.color='#C0392B';
  document.getElementById('dateDisplay').innerHTML=`${d} ${MONTH_GEN[m]}<br>${y}`;
  const isLeap=y%4===0&&(y%100!==0||y%400===0);
  const daysInYear=isLeap?366:365;
  const remaining=daysInYear-doy;
  document.getElementById('dayOfYear').innerHTML=`<span><strong>${doy}.</strong> dzień roku, do końca pozostało <strong>${remaining}</strong> dni</span>`;
  document.getElementById('weekNum').innerHTML=`<span><strong>${week}.</strong> tydzień roku</span>`;

  // Imieniny
  const POPULAR=new Set(['Adam','Adrian','Adrianna','Agata','Agnieszka','Alan','Albert','Aldona','Aleksander','Aleksandra','Alfred','Alicja','Alina','Amelia','Anastazja','Andrzej','Aneta','Angelika','Aniela','Anita','Anna','Antoni','Antonina','Arkadiusz','Arleta','Artur','Aurelia','Barbara','Bartłomiej','Bartosz','Beata','Bernadeta','Bernard','Blanka','Błażej','Bogdan','Bogumiła','Bogusław','Bogusława','Bohdan','Bolesław','Borys','Bożena','Bronisław','Bronisława','Bruno','Brygida','Cecylia','Celina','Cezary','Czesław','Czesława','Dagmara','Damian','Daniel','Daniela','Danuta','Daria','Dariusz','Dawid','Diana','Dominik','Dominika','Dorota','Edmund','Edward','Edyta','Eliza','Elwira','Elżbieta','Emil','Emilia','Ernest','Eryk','Eugenia','Eugeniusz','Ewa','Ewelina','Fabian','Filip','Franciszek','Gabriel','Gabriela','Genowefa','Gertruda','Gracjan','Grażyna','Grzegorz','Halina','Hanna','Helena','Henryk','Henryka','Honorata','Hubert','Iga','Ignacy','Igor','Ilona','Irena','Ireneusz','Iwona','Izabela','Jacek','Jadwiga','Jagoda','Jakub','Jan','Janina','Janusz','Jarosław','Jerzy','Jędrzej','Joachim','Joanna','Jolanta','Józef','Józefa','Julia','Julian','Julita','Justyna','Kacper','Kajetan','Kalina','Kamil','Kamila','Karina','Karol','Karolina','Katarzyna','Kinga','Klara','Klaudia','Konrad','Kornel','Kornelia','Krystian','Krystyna','Krzysztof','Ksawery','Larysa','Laura','Lech','Lena','Leokadia','Leon','Leonard','Leszek','Lidia','Liliana','Lilianna','Liwia','Lucjan','Lucyna','Luiza','Łucja','Łukasz','Maciej','Magda','Magdalena','Maja','Maksym','Maksymilian','Malwina','Małgorzata','Marcelina','Marcin','Marek','Maria','Marian','Marianna','Marika','Mariola','Mariusz','Marlena','Marta','Martyna','Maryna','Marzanna','Marzena','Mateusz','Matylda','Michalina','Michał','Mieczysław','Mieczysława','Mikołaj','Milena','Miłosz','Mirosław','Mirosława','Monika','Natalia','Natan','Nela','Nikodem','Nikola','Nina','Norbert','Olaf','Olga','Oliwia','Oskar','Patrycja','Patryk','Paula','Paulina','Paweł','Piotr','Pola','Przemysław','Radosław','Rafał','Regina','Remigiusz','Renata','Robert','Roksana','Roman','Romuald','Rozalia','Róża','Ryszard','Sabina','Sandra','Sara','Sebastian','Seweryn','Sławomir','Stanisław','Stanisława','Stefan','Stefania','Sylwester','Sylwia','Szczepan','Szymon','Tadeusz','Tamara','Teodor','Teresa','Tobiasz','Tomasz','Tymon','Tymoteusz','Urszula','Wacław','Waldemar','Wanda','Weronika','Wiesław','Wiesława','Wiktor','Wiktoria','Wioleta','Witold','Władysław','Władysława','Wojciech','Zbigniew','Zdzisław','Zdzisława','Zenon','Zofia','Zuzanna','Zygmunt','Żaneta']);
  const nameEntry=NAMES.find(([nm,nd])=>nm===m&&nd===d);
  const names=nameEntry?nameEntry[2]:[];
  const nl=document.getElementById('namesList');
  if(!names.length){
    nl.innerHTML='<span style="color:var(--muted);font-size:.85rem">Brak imienin dla tego dnia</span>';
  } else {
    // Nagłówek: popularne imiona potwierdzone przez tradycyjne kalendarze (imieniny_tradycyjne.js);
    // gdy żadne popularne nie jest tradycyjne — 3 najpopularniejsze tradycyjne (lista posortowana w pliku); reszta w "a także"
    const trad=(typeof IMIENINY_TRAD!=='undefined')?IMIENINY_TRAD[`${m}-${d}`]:null;
    const isMain=n=>POPULAR.has(n)&&(!trad||trad.includes(n));
    let popular=names.filter(isMain);
    if(!popular.length&&trad){const top=trad.slice(0,3);popular=names.filter(n=>top.includes(n));}
    const rest=names.filter(n=>!popular.includes(n));
    const mkLink=(n,cls)=>{const a=document.createElement('a');const slug=nameSlug(n);a.href=(typeof IMIENINY_SLUGS!=='undefined'&&IMIENINY_SLUGS.has(slug))?`/imieniny/${slug}/`:`imieniny.html?name=${encodeURIComponent(n)}`;a.className='name-tag'+' '+cls;a.textContent=n;return a;};
    const mkText=t=>{const s=document.createElement('span');s.className='names-separator';s.textContent=t;return s;};
    const primary=popular.length?popular:names.slice(0,3);
    const secondary=popular.length?rest:names.slice(3);
    primary.forEach((n,i)=>{
      if(i>0) nl.appendChild(mkText(', '));
      nl.appendChild(mkLink(n,'primary'));
    });
    if(secondary.length){
      nl.appendChild(mkText(' — a także: '));
      secondary.forEach((n,i)=>{
        if(i>0) nl.appendChild(mkText(', '));
        nl.appendChild(mkLink(n,''));
      });
    }
  }

  // Święta
  // Święta ruchome (n-ty dzień tygodnia) mają w HOLIDAYS datę z 2026 — przeliczane na oglądany rok (swieta_floating.js)
  const todaysFixed=redateFloating(HOLIDAYS,y).filter(([hd,hm])=>hd===d&&hm===m);
  const todaysFloating=FLOATING_HOLIDAYS.filter(fh=>fh.month===m&&nthWeekdayOfMonth(y,fh.month,fh.weekday,fh.n)===d)
    .map(fh=>[d,m,fh.name,'',fh.tag]);
  const todays=[...todaysFixed,...todaysFloating];
  // Chipsy świąt w date-hero
  const heroEl=document.getElementById('heroHolidays');
  if(todays.length&&heroEl){
    heroEl.style.display='flex';
    todays.forEach(([,,name,,tag])=>{
      const a=document.createElement('a');
      const heroPromotedSlug=(typeof SWIETO_NAME_TO_SLUG!=='undefined')?SWIETO_NAME_TO_SLUG[name]:undefined;
      a.href=(heroPromotedSlug&&typeof SWIETO_SLUGS!=='undefined'&&SWIETO_SLUGS.has(heroPromotedSlug))?`/swieto/${heroPromotedSlug}/`:`swieta-nietypowe.html?q=${encodeURIComponent(name)}`;
      a.style.cssText=`display:inline-flex;align-items:center;gap:.3rem;font-size:.75rem;color:var(--muted);text-decoration:none;background:var(--tag-bg);border:1px solid var(--border);border-radius:60px;padding:.2rem .6rem;white-space:nowrap;transition:background .15s;`;
      a.onmouseover=()=>a.style.background='var(--border)';
      a.onmouseout=()=>a.style.background='var(--tag-bg)';
      a.innerHTML=`<span style="width:6px;height:6px;border-radius:50%;background:${TAG_COLOR[tag]||'var(--muted)'};display:inline-block;flex-shrink:0;"></span>${name}`;
      heroEl.appendChild(a);
    });
  }
  // Święta z SWIETA_DATA (Państwowe/Kościelne/Tradycyjne i okolicznościowe) + nietypowe, bez duplikatów po nazwie.
  // Dedup TYLKO po dokladnej nazwie nie wystarcza: gdy swieto ma w lekkiej liscie HOLIDAYS
  // starsza, krotsza nazwe sprzed "awansu" do SWIETA_DATA (np. "Dzien Nauki Polskiej" vs pelne
  // "Narodowy Dzien Nauki Polskiej", ten sam slug dzien-nauki-polskiej), obie wersje ladowaly
  // sie obok siebie na karcie. SWIETO_NAME_TO_SLUG (swieto_names.js) juz zawiera rejestr
  // aliasow (NAME_ALIASES z scripts/swieto_registry.js) - porownujemy po rozwiazanym slugu,
  // nie po samej nazwie. Znalezione i naprawione 16.09.2026 (ten sam wzorzec co gen_kartka.js).
  const CARD_TYPES=['panstwowe','koscielne','nieoficjalne','historyczne'];
  // Dzień Edukacji Narodowej (14 X) jest w bazie jako 'branzowe', ale to powszechnie znane święto oświatowe — pokazujemy je na karcie i w widżecie mimo typu
  const WIDGET_EXTRA_SLUGS=['dzien-nauczyciela'];
  // Karta dnia pokazuje dodatkowo wybrane święta branżowe, których nie ma w lekkiej liście HOLIDAYS (sprawdzone 14.10.2026 na żywo dla wszystkich 65 branżowych);
  // do widżetu "najbliższe daty" NIE trafiają (tylko dzien-nauczyciela)
  const CARD_EXTRA_SLUGS=[...WIDGET_EXTRA_SLUGS,'dzien-przedsiebiorcy','dzien-sekretarki','dzien-poloznej','dzien-fryzjera','dzien-rybolowstwa','dzien-instruktora-nauki-jazdy','dzien-straznika-miejskiego','dzien-lacznosciowca'];
  const todaysCurated=swietaForY.filter(([hd,hm,,slug,type])=>hd===d&&hm===m&&(type.split(' ').some(t=>CARD_TYPES.includes(t))||CARD_EXTRA_SLUGS.includes(slug)));
  const curatedNames=new Set(todaysCurated.map(([,,name])=>name));
  const curatedSlugs=new Set(todaysCurated.map(([,,name])=>nameToSlugSafe(name)).filter(Boolean));
  const todaysNietypowe=todays.filter(([,,name])=>{
    if(curatedNames.has(name))return false;
    const slug=nameToSlugSafe(name);
    return !(slug&&curatedSlugs.has(slug));
  });
  const shownTodayNames=new Set([...curatedNames,...todaysNietypowe.map(([,,name])=>name)]);
  const hl=document.getElementById('holidaysList');
  if(todaysCurated.length||todaysNietypowe.length){
    todaysCurated.forEach(([,,name,slug,type])=>{
      const firstType=type.split(' ')[0];
      const el=document.createElement('a');
      el.href=swietoHref(slug);
      el.className='holiday-item';
      el.innerHTML=`<div class="holiday-dot" style="background:${TAG_COLOR[firstType]||'var(--muted)'}"></div><span class="holiday-name">${name}</span>`;
      hl.appendChild(el);
    });
    todaysNietypowe.forEach(([,,name,,tag])=>{
      const el=document.createElement('a');
      const promotedSlug=(typeof SWIETO_NAME_TO_SLUG!=='undefined')?SWIETO_NAME_TO_SLUG[name]:undefined;
      el.href=(promotedSlug&&typeof SWIETO_SLUGS!=='undefined'&&SWIETO_SLUGS.has(promotedSlug))?`/swieto/${promotedSlug}/`:`swieta-nietypowe.html?q=${encodeURIComponent(name)}`;
      el.className='holiday-item';
      el.innerHTML=`<div class="holiday-dot" style="background:${TAG_COLOR[tag]||'var(--muted)'}"></div><span class="holiday-name">${name}</span>`;
      hl.appendChild(el);
    });
  } else {
    hl.innerHTML='<span style="color:var(--muted);font-size:.85rem">Brak świąt dla tego dnia w bazie.</span>';
  }

  // Słońce
  document.getElementById('dawn').textContent=sun.dawn;
  document.getElementById('sunrise').textContent=sun.rise;
  document.getElementById('solarNoon').textContent=sun.noon;
  document.getElementById('noonLabel').textContent=sun.noonAlt!=='—'?`Górowanie (${sun.noonAlt}°)`:'Górowanie';
  document.getElementById('sunset').textContent=sun.set;
  document.getElementById('dusk').textContent=sun.dusk;
  document.getElementById('daylightLen').textContent=sun.len+' dnia';
  document.getElementById('daylightBar').style.width=(sun.frac*100)+'%';

  // Długość dnia vs. solstycja
  const longestMin=calcDayLenMin(y,6,21);
  const shortestMin=calcDayLenMin(y,12,21);
  const todayMin=sun.lenMin;
  const lh=Math.floor(todayMin/60),lm=todayMin%60;
  const diffLong=longestMin-todayMin;
  const diffShort=todayMin-shortestMin;
  let dlText=`<span>Dzień trwa <strong>${lh} godz. ${lm} min</strong>`;
  if(diffLong===0){
    dlText+=', jest najdłuższym dniem roku';
  } else if(diffLong>0){
    dlText+=`, jest krótszy od najdłuższego o ${fmtDiff(diffLong)}`;
  }
  dlText+=` i jest dłuższy od najkrótszego o ${fmtDiff(diffShort).replace(/\.$/,'')}. (Czasy podano dla lokalizacji ${LOC_NAME})</span>`;
  document.getElementById('dayLengthInfo').innerHTML=dlText;

  // Księżyc
  const moonRS=getMoonRiseSet(y,m,d,LOC_LAT,LOC_LON);
  document.getElementById('moonrise').textContent=moonRS.rise;
  document.getElementById('moonset').textContent=moonRS.set;
  document.getElementById('moonPhase').textContent=moon.phase;
  document.getElementById('moonAge').textContent=moon.age;
  document.getElementById('moonBright').textContent=moon.bright;
  document.getElementById('moonSign').innerHTML=`<a href="znaki-zodiaku.html" style="color:inherit;text-decoration:none;border-bottom:1px solid var(--border)">${moon.sign}</a>`;

  document.getElementById('moonNextFull').textContent=moon.nextFull;

  // Zodiak
  document.getElementById('sunZodiacRow').innerHTML=`<a href="znaki-zodiaku.html" style="color:inherit;text-decoration:none;border-bottom:1px solid var(--border)">${zod.n} ${zod.s}</a>`;

  // Cytat i przysłowie: dane (home_quotes.js, przyslowia_data.js) ładują się PO załadowaniu strony — poza ścieżką krytyczną
  function renderQuoteProverb(){
    if (typeof QUOTES === 'undefined' || typeof PROVERBS === 'undefined') return; // plik się nie wczytał — karty zostają puste, reszta strony działa
    buildProverbIndex();
    // Cytat — deterministyczny: ten sam dzień roku = ten sam cytat na każdym urządzeniu i w każdym roku
    (function(){
      const idx = (doy - 1) % QUOTES.length;
      const q = QUOTES[idx];
      document.getElementById('quoteText').textContent = q.t;
      document.getElementById('quoteAuthor').textContent = '— ' + q.a;
    })();

    // Przysłowia — priorytet: dzień → miesiąc → pora roku → ogólna pula
    const provKey=`${d}-${m}`;
    let prov;
    if (PROVERBS_DAILY[provKey]) {
      prov = PROVERBS_DAILY[provKey];
    } else {
      const monthPool = PROVERBS_MONTH_POOL[m] || [];
      const season = getSeason(m);
      const seasonPool = SEASON_MONTHS[season].filter(sm=>sm!==m).flatMap(sm=>PROVERBS_MONTH_POOL[sm]||[]);
      // Preferuj pule WLASNEGO miesiaca (dzien bez wpisu, np. 29 lutego, nie moze dostac przyslowia o grudniu);
      // pora roku tylko gdy miesiac nie ma zadnej puli.
      const combined = monthPool.length ? monthPool : [...monthPool, ...seasonPool];
      prov = [combined[(doy-1) % combined.length]];
    }
    const firstName=names[0]||'';
    const pl=document.getElementById('proverbList');
    prov.forEach(p=>{
      const div=document.createElement('div');
      div.className='proverb-text';
      div.textContent=p;
      pl.appendChild(div);
    });
    const meta=document.createElement('div');
    meta.className='proverb-meta';
    meta.textContent='Tradycja ludowa · '+(PROVERBS_DAILY[provKey]?d+' '+MONTH_GEN[m]:MONTH_NOM[m].toLowerCase());
    pl.appendChild(meta);
  }
  loadHomeLazy(renderQuoteProverb);

  // ── Mini-kalendarz ────────────────────────────────────────────
  const todayD=TODAY.getDate(),todayM=TODAY.getMonth()+1,todayY=TODAY.getFullYear();
  let miniM=m, miniY=y;
  function renderMiniCal(cm,cy){
    document.getElementById('miniCalTitle').textContent=`${MONTH_NOM[cm]} ${cy}`;
    const calEl=document.getElementById('miniCal');
    calEl.innerHTML='';
    const grid=document.createElement('div');
    grid.className='mini-cal';
    ['Pn','Wt','Śr','Cz','Pt','Sb','Nd'].forEach((h,i)=>{
      const s=document.createElement('span');s.className='mini-cal-hd'+(i===6?' sunday-hd':'');s.textContent=h;grid.appendChild(s);
    });
    const firstDay=new Date(cy,cm-1,1);
    const startDow=(firstDay.getDay()+6)%7;
    const daysInMonth=new Date(cy,cm,0).getDate();
    const hmMap=redateFloating(HOLIDAYS,cy).filter(([hd,hm])=>hm===cm).reduce((acc,[hd,,name])=>{(acc[hd]=acc[hd]||[]).push(name);return acc;},{});
    // Dołącz też święta z SWIETA_DATA (panstwowe/koscielne/nieoficjalne/historyczne) — lekka lista HOLIDAYS
    // sama w sobie nie obejmuje wszystkich dni (np. Wigilii, Bożego Narodzenia, rocznic historycznych),
    // przez co te dni nie dostawały kropki mimo realnej treści świątecznej (naprawione 12.09.2026).
    const swietaForCal=(cy===TODAY.getFullYear())?SWIETA_DATA:SWIETA_DATA_STATIC.concat(computeMovableSwieta(cy));
    // Dedup po slugu (nameToSlugSafe), nie po samej nazwie - inaczej podpowiedz dnia potrafi
    // pokazac to samo swieto dwukrotnie pod dwiema nazwami (ten sam bug co w karcie "Swieta i
    // obchodzone dni" wyzej, np. 19 lutego: "Dzien Nauki Polskiej" + "Narodowy Dzien Nauki
    // Polskiej"). Znalezione 16.09.2026.
    swietaForCal.filter(([hd,hm,,,type])=>hm===cm&&type.split(' ').some(t=>CARD_TYPES.includes(t)))
      .forEach(([hd,,name])=>{
        const slug=nameToSlugSafe(name);
        const list=hmMap[hd]=hmMap[hd]||[];
        if(slug){const dup=list.findIndex(n=>nameToSlugSafe(n)===slug);if(dup!==-1)list.splice(dup,1);}
        list.push(name);
      });
    const hmSet=new Set(Object.keys(hmMap).map(Number));
    for(let i=0;i<startDow;i++){const s=document.createElement('span');s.className='mini-cal-day other-month';grid.appendChild(s);}
    for(let dd=1;dd<=daysInMonth;dd++){
      const a=document.createElement('a');
      a.href=`/?d=${dd}&m=${cm}&y=${cy}`;
      const isViewed=(dd===d&&cm===m&&cy===y);
      const isRealToday=(dd===todayD&&cm===todayM&&cy===todayY);
      let cls='mini-cal-day';
      if(isViewed) cls+=' today';
      if(isRealToday&&!isViewed) cls+=' real-today';
      if(hmSet.has(dd)){cls+=' has-holiday';a.title=hmMap[dd].join('\n');}
      if((startDow+dd-1)%7===6) cls+=' sunday';
      a.className=cls;a.textContent=dd;
      grid.appendChild(a);
    }
    calEl.appendChild(grid);
  }
  window.miniCalNav=function(dir){
    miniM+=dir;
    if(miniM>12){miniM=1;miniY++;}
    if(miniM<1){miniM=12;miniY--;}
    renderMiniCal(miniM,miniY);
  };
  renderMiniCal(miniM,miniY);

  // ── Najbliższe ważne daty ─────────────────────────────────────
  const PUBLIC_HOLIDAYS=[
    [1,1,'Nowy Rok'],[6,1,'Trzech Króli'],[1,5,'Święto Pracy'],[3,5,'Święto Konstytucji 3 Maja'],
    [15,8,'Wniebowzięcie NMP'],[1,11,'Wszystkich Świętych'],[11,11,'Święto Niepodległości'],
    [24,12,'Wigilia Bożego Narodzenia'],[25,12,'Boże Narodzenie'],[26,12,'Drugi dzień Bożego Narodzenia'],
  ];
  // Wielkanoc liczona algorytmem Gaussa dla oglądanego roku (y), nie na sztywno dla 2026 —
  // poprzednia wersja z hardkodowaną datą 2026 dawała błędne Zielone Świątki/Boże Ciało
  // (dodawanie dni wprost do numeru dnia miesiąca bez przeniesienia na kolejny miesiąc,
  // np. "54 kwietnia") i zamrożenie na dacie Wielkanocy 2026 dla wszystkich kolejnych lat.
  // Wzór dzielony z polishHolidayDates()/easterDateFor() (patrz komentarz przy ich definicji).
  const easterMs=easterDateFor(y).getTime(),dayMs=86400000;
  const mdFromEaster=(offsetDays)=>{const dt=new Date(easterMs+offsetDays*dayMs);return [dt.getDate(),dt.getMonth()+1];};
  const MOVABLE=[
    [...mdFromEaster(0),'Wielkanoc'],
    [...mdFromEaster(1),'Poniedziałek Wielkanocny'],
    [...mdFromEaster(49),'Zielone Świątki'],
    [...mdFromEaster(60),'Boże Ciało'],
  ];
  // Tłusty Czwartek = 52 dni przed Wielkanocą (nie na sztywno 12 II — to data z 2026); równonoc/przesilenia z seasonDateFor(y,…) (Meeus), nie na sztywno
  const NAMED_DAYS=[[...mdFromEaster(-52),'Tłusty Czwartek'],[14,2,'Walentynki'],[8,3,'Dzień Kobiet'],[...seasonDateFor(y,0),'Dzień Wiosny'],[26,5,'Dzień Matki'],[1,6,'Dzień Dziecka'],[23,6,'Dzień Ojca'],[...seasonDateFor(y,1),'Przesilenie letnie'],[31,10,'Halloween'],[2,11,'Dzień Zaduszny'],[30,11,'Andrzejki'],[6,12,'Mikołajki'],[...seasonDateFor(y,3),'Przesilenie zimowe'],[24,12,'Wigilia'],[31,12,'Sylwester']];
  const EVENT_SLUG={
    'Nowy Rok':'nowy-rok',
    'Trzech Króli':'trzech-kroli',
    'Tłusty Czwartek':'tlusty-czwartek',
    'Walentynki':'walentynki',
    'Dzień Kobiet':'dzien-kobiet',
    'Dzień Wiosny':'dzien-wiosny',
    'Wielkanoc':'wielkanoc',
    'Poniedziałek Wielkanocny':'poniedzialek-wielkanocny',
    'Święto Pracy':'swieto-pracy',
    'Święto Konstytucji 3 Maja':'konstytucja-3-maja',
    'Dzień Matki':'dzien-matki',
    'Zielone Świątki':'zielone-swiatki',
    'Dzień Dziecka':'dzien-dziecka',
    'Boże Ciało':'boze-cialo',
    'Dzień Ojca':'dzien-ojca',
    'Przesilenie letnie':'przesilenie-letnie',
    'Narodowy Dzień Pamięci Powstania Warszawskiego':'rocznica-powstania-warszawskiego',
    'Wniebowzięcie NMP':'wniebowziecie-nmp',
    'Wszystkich Świętych':'wszystkich-swietych',
    'Halloween':'halloween',
    'Dzień Zaduszny':'dzien-zaduszny',
    'Święto Niepodległości':'swieto-niepodleglosci',
    'Andrzejki':'andrzejki',
    'Mikołajki':'mikolajki',
    'Przesilenie zimowe':'przesilenie-zimowe',
    'Wigilia':'wigilia',
    'Boże Narodzenie':'boze-narodzenie',
    'Drugi dzień Bożego Narodzenia':'boze-narodzenie-2',
    'Sylwester':'sylwester',
  };
  const EVENT_DESC={
    'Nowy Rok':'Pierwszy dzień roku — tradycja życzeń noworocznych i postanowień.',
    'Trzech Króli':'Święto Objawienia Pańskiego, upamiętniające przybycie Mędrców.',
    'Tłusty Czwartek':'Ostatni czwartek przed Wielkim Postem — tradycja jedzenia pączków.',
    'Walentynki':'Dzień zakochanych obchodzony 14 lutego.',
    'Dzień Kobiet':'Dzień poświęcony uhonorowania kobiet i ich osiągnięć.',
    'Dzień Wiosny':'Astronomiczny początek wiosny — równonoc wiosenna.',
    'Wielkanoc':'Najważniejsze święto chrześcijańskie — Zmartwychwstanie Jezusa.',
    'Poniedziałek Wielkanocny':'Drugi dzień Wielkanocy — Śmigus-Dyngus.',
    'Święto Pracy':'Międzynarodowe Święto Pracy, wolne od pracy.',
    'Święto Konstytucji 3 Maja':'Rocznica uchwalenia Konstytucji z 1791 roku.',
    'Zielone Świątki':'Pięćdziesiątnica — Zesłanie Ducha Świętego.',
    'Dzień Dziecka':'Dzień poświęcony dzieciom, obchodzony 1 czerwca.',
    'Przesilenie letnie':'Najdłuższy dzień roku — astronomiczny początek lata.',
    'Dzień Ojca':'Dzień poświęcony uhonorowania ojców i ich roli w rodzinie.',
    'Boże Ciało':'Uroczystość Najświętszego Ciała i Krwi Chrystusa.',
    'Wniebowzięcie NMP':'Uroczystość Wniebowzięcia Najświętszej Marii Panny.',
    'Wszystkich Świętych':'Dzień pamięci o świętych i bliskich zmarłych.',
    'Halloween':'Wieczór przed Dniem Wszystkich Świętych — zwyczaj przebierania się i zabawy.',
    'Dzień Zaduszny':'Dzień modlitwy za dusze w czyśćcu.',
    'Święto Niepodległości':'Rocznica odzyskania niepodległości przez Polskę w 1918 roku.',
    'Andrzejki':'Wieczór wróżb i zabaw przed dniem świętego Andrzeja.',
    'Mikołajki':'Dzień świętego Mikołaja — tradycja wręczania prezentów i słodyczy.',
    'Niepokalane Poczęcie NMP':'Uroczystość Niepokalanego Poczęcia Najświętszej Marii Panny.',
    'Wigilia':'Wieczór wigilijny — czas kolacji z rodziną i prezentów.',
    'Boże Narodzenie':'Pierwsze Święto Bożego Narodzenia — narodziny Jezusa.',
    'Drugi Dzień Świąt':'Drugi dzień Bożego Narodzenia — Święto Świętego Szczepana.',
    'Sylwester':'Ostatni dzień roku — pożegnanie starego roku.',
    'Przesilenie zimowe':'Najkrótszy dzień roku — astronomiczny początek zimy.',
  };
  // Wstaw dzisiejsze NAMED_DAYS na górę listy świąt (wyróżnione)
  const hlEl=document.getElementById('holidaysList');
  const namedToday=NAMED_DAYS.filter(([dd,mm])=>dd===d&&mm===m);
  namedToday.forEach(([,,name])=>{
    if(shownTodayNames.has(name))return; // już pokazane z SWIETA_DATA/HOLIDAYS wyżej
    const slug=EVENT_SLUG[name];
    const el=document.createElement('a');
    el.href=slug?swietoHref(slug):`/?d=${d}&m=${m}&y=${y}`;
    el.className='holiday-item';
    el.style.cssText='font-weight:600;border-bottom:1px solid var(--border);padding-bottom:.5rem;margin-bottom:.25rem;';
    const em=({'Tłusty Czwartek':'🍩','Walentynki':'❤️','Dzień Kobiet':'🌷','Dzień Wiosny':'🌸','Dzień Matki':'💐','Dzień Dziecka':'🎈','Dzień Ojca':'👨','Przesilenie letnie':'☀️','Halloween':'🎃','Andrzejki':'🔮','Mikołajki':'🎅','Przesilenie zimowe':'❄️','Wigilia':'🎄','Sylwester':'🎆'})[name]||'📅';
    el.innerHTML=`<div class="holiday-dot" style="background:var(--sun)"></div><span class="holiday-name">${em} ${name}</span>`;
    hlEl.insertBefore(el, hlEl.firstChild);
  });
  const TODAY_MS=new Date(y,m-1,d).getTime();
  const WIDGET_TYPES=['panstwowe','koscielne','nieoficjalne','historyczne'];
  // Swieto ruchome przechodzace na kolejny rok nie moze po prostu powtorzyc dd/mm z roku
  // biezacego (Wielkanoc i pochodne wypadaja co roku innego dnia) - doliczane osobno dla y+1,
  // z pamiecia podreczna liczoną leniwie tylko gdy faktycznie potrzebna.
  const movableSlugsForUpcoming=new Set(SWIETA_DATA_MOVABLE.map(([,,slug])=>slug));
  let movableNextYearMap=null;
  const allUpcoming=swietaForY.filter(([,,name,slug,type])=>(type.split(' ').some(t=>WIDGET_TYPES.includes(t))||WIDGET_EXTRA_SLUGS.includes(slug)) && name!=='Święto Wojska Polskiego').map(([dd,mm,name,slug])=>{
    let dt=new Date(y,mm-1,dd);
    if(dt.getTime()<TODAY_MS){
      if(movableSlugsForUpcoming.has(slug)){
        if(!movableNextYearMap){
          movableNextYearMap={};
          computeMovableSwieta(y+1).forEach(([ndd,nmm,,nslug])=>{movableNextYearMap[nslug]=[ndd,nmm];});
        }
        const [ndd,nmm]=movableNextYearMap[slug];
        dt=new Date(y+1,nmm-1,ndd);
      }else{
        dt=new Date(y+1,mm-1,dd);
      }
    }
    const diff=Math.round((dt.getTime()-TODAY_MS)/86400000);
    return{name,dt,diff,slug};
  }).filter(x=>x.diff>0).sort((a,b)=>a.diff-b.diff).slice(0,6);

  const ul=document.getElementById('upcomingList');
  allUpcoming.forEach(({name,dt,diff,slug})=>{
    const d=dt.getDate(),m=dt.getMonth()+1,y=dt.getFullYear();
    const EMOJI={'Nowy Rok':'🎆','Trzech Króli':'⭐','Tłusty Czwartek':'🍩','Walentynki':'❤️','Dzień Kobiet':'🌷','Dzień Wiosny':'🌸','Wielkanoc':'🐣','Poniedziałek Wielkanocny':'🐣','Święto Pracy':'⚒️','Święto Konstytucji 3 Maja':'🇵🇱','Dzień Matki':'💐','Zielone Świątki':'🕊️','Dzień Dziecka':'🎈','Boże Ciało':'✝️','Przesilenie letnie':'☀️','Wniebowzięcie NMP':'🕊️','Wszyscy Świętych':'🕯️','Wszystkich Świętych':'🕯️','Halloween':'🎃','Dzień Niepodległości':'🇵🇱','Święto Niepodległości':'🇵🇱','Narodowy Dzień Pamięci Powstania Warszawskiego':'🏛️','Powstanie Warszawskie':'🏛️','Dzień Zaduszny':'🕯️','Andrzejki':'🔮','Mikołajki':'🎅','Niepokalane Poczęcie NMP':'✝️','Przesilenie zimowe':'❄️','Wigilia':'🎄','Boże Narodzenie':'🎄','Drugi dzień Bożego Narodzenia':'🎄','Sylwester':'🎆','Dzień Ojca':'👨'};
    const em=EMOJI[name]||'📅';
    const meta=diff===0?`dzisiaj — ${d} ${MONTH_GEN[m]}`:`za ${diff} ${diff===1?'dzień':'dni'} — ${d} ${MONTH_GEN[m]}`;
    if(name==='Wniebowzięcie NMP'){
      // 15 sierpnia łączy dwa odrębne święta — pokaż oba, osobno podlinkowane
      const row=document.createElement('div');
      row.className='upcoming-item';
      const linkStyle='color:inherit;text-decoration:none;border-bottom:1px solid var(--border)';
      row.innerHTML=`<span class="upcoming-name">${em} <a href="${swietoHref('wniebowziecie-nmp')}" style="${linkStyle}">Wniebowzięcie NMP</a> / <a href="${swietoHref('swieto-wojska-polskiego')}" style="${linkStyle}">Święto Wojska Polskiego</a></span><span class="upcoming-meta">${meta}</span>`;
      ul.appendChild(row);
      return;
    }
    const row=document.createElement('a');
    row.className='upcoming-item';
    row.href=slug?swietoHref(slug):`/?d=${d}&m=${m}&y=${y}`;
    row.innerHTML=`<span class="upcoming-name">${em} ${name}</span><span class="upcoming-meta">${meta}</span>`;
    ul.appendChild(row);
  });

  // ── Liczniki do końca roku ────────────────────────────────────
  const endOfYear=new Date(y,11,31);
  const daysLeft=Math.round((endOfYear-T)/86400000);
  // zlicz dni robocze (pon–pt) minus święta
  const pubSet=new Set([...PUBLIC_HOLIDAYS,...MOVABLE].map(([dd,mm])=>`${y}-${mm}-${dd}`));
  let workDays=0;
  const tomorrow=new Date(T.getTime()); tomorrow.setDate(tomorrow.getDate()+1);
  for(let dt2=tomorrow;dt2<=endOfYear;dt2.setDate(dt2.getDate()+1)){
    const dow=dt2.getDay();
    const key=`${dt2.getFullYear()}-${dt2.getMonth()+1}-${dt2.getDate()}`;
    if(dow>=1&&dow<=5&&!pubSet.has(key))workDays++;
  }
  const freeDays=daysLeft-workDays;
  const yc=document.getElementById('yearCounters');
  // liczba pojedyncza wymaga innej formy ("1 dzień", nie "1 dni")
  [[daysLeft,daysLeft===1?'dzień do\nkońca roku':'dni do\nkońca roku'],
   [workDays,workDays===1?'dzień\nroboczy':'dni\nroboczych'],
   [freeDays,freeDays===1?'dzień wolny\n(weekend/święto)':'weekendów\ni świąt']].forEach(([n,lbl])=>{
    yc.innerHTML+=`<div class="year-counter"><div class="year-counter-num">${n}</div><div class="year-counter-lbl">${lbl.replace('\n','<br>')}</div></div>`;
  });
  // pasek postępu roku
  const startOfYear=new Date(y,0,1);
  // w pełnych dniach — różnica w ms jest latem o 1 h krótsza (czas letni), co zaniżało zaokrąglenie
  const totalDays=Math.round((new Date(y,11,31)-startOfYear)/86400000)+1;
  const elapsed=Math.round((T-startOfYear)/86400000)+1;
  const pct=(elapsed/totalDays*100).toFixed(1);
  document.getElementById('yearProgressBar').style.width=pct+'%';
  document.getElementById('yearProgressPct').textContent=pct+'%';
})();

// ── Edycja lokalizacji ────────
function updateLocUI(){
  const btn=document.getElementById('locNameBtn');
  if(btn) btn.textContent=LOC_NAME;
}
function toggleLocSearch(){
  const box=document.getElementById('locSearchBox');
  const status=document.getElementById('locSearchStatus');
  const open=box.style.display==='none';
  box.style.display=open?'flex':'none';
  status.style.display='none';
  status.textContent='';
  if(open){ const inp=document.getElementById('locSearchInput'); inp.value=''; inp.focus(); }
}
async function applyLocSearch(){
  const inp=document.getElementById('locSearchInput');
  const status=document.getElementById('locSearchStatus');
  const q=inp.value.trim(); if(!q) return;
  status.textContent='Szukam…'; status.style.display='block';
  try{
    const res=await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&addressdetails=1`,{headers:{'Accept-Language':'pl','User-Agent':'DaybyDay/1.0'}});
    const data=await res.json();
    if(!data.length){status.textContent='Nie znaleziono miejscowości.';return;}
    const r=data[0];
    LOC_LAT=parseFloat(r.lat); LOC_LON=parseFloat(r.lon);
    LOC_NAME=r.address?.city||r.address?.town||r.address?.village||r.address?.hamlet||r.display_name.split(',')[0];
    localStorage.setItem('dbd-loc',JSON.stringify({name:LOC_NAME,lat:LOC_LAT,lon:LOC_LON}));
    location.reload();
  }catch(e){status.textContent='Błąd połączenia.';}
}
function resetLoc(){localStorage.removeItem('dbd-loc');location.reload();}

// ── Notatka na dzień ────────
(function(){
  const params=new URLSearchParams(location.search);
  const TODAY=new Date();
  const d=params.get('d')||TODAY.getDate();
  const m=params.get('m')||(TODAY.getMonth()+1);
  const y=params.get('y')||TODAY.getFullYear();
  const key=`note_${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  const ta=document.getElementById('noteArea');
  if(!ta) return;
  ta.value=localStorage.getItem(key)||'';
  let timer;
  ta.addEventListener('input',()=>{
    clearTimeout(timer);
    timer=setTimeout(()=>{
      localStorage.setItem(key,ta.value);
      const s=document.getElementById('noteSaved');
      s.style.opacity='1'; setTimeout(()=>s.style.opacity='0',1500);
    },600);
  });
})();

// ── Licznik do daty ────────
function calcCountdown(){
  const inp=document.getElementById('countdownInput');
  const res=document.getElementById('countdownResult');
  if(!inp.value){res.textContent='Wybierz datę.';return;}
  const params=new URLSearchParams(location.search);
  const TODAY=new Date(); TODAY.setHours(0,0,0,0);
  const base=params.has('d')?new Date(parseInt(params.get('y')||TODAY.getFullYear()),parseInt(params.get('m'))-1,parseInt(params.get('d'))):new Date(TODAY);
  base.setHours(0,0,0,0);
  const target=new Date(inp.value); target.setHours(0,0,0,0);
  const diff=Math.round((target-base)/86400000);
  const MONTH_GEN_C=['','stycznia','lutego','marca','kwietnia','maja','czerwca','lipca','sierpnia','września','października','listopada','grudnia'];
  const td=target.getDate(),tm=target.getMonth()+1,ty=target.getFullYear();
  const dateStr=`${td} ${MONTH_GEN_C[tm]} ${ty}`;
  if(diff===0) res.innerHTML=`<strong>${dateStr}</strong> — to dziś!`;
  else if(diff>0) res.innerHTML=`Do <strong>${dateStr}</strong> pozostało <strong>${diff}</strong> ${diff===1?'dzień':diff<5?'dni':'dni'}.`;
  else res.innerHTML=`<strong>${dateStr}</strong> było <strong>${Math.abs(diff)}</strong> ${Math.abs(diff)===1?'dzień':Math.abs(diff)<5?'dni':'dni'} temu.`;
}

// ── Zegar na żywo (tylko gdy oglądamy dzisiejszy dzień) ────────
(function(){
  const cl=document.getElementById('liveClock');
  if(!cl) return;
  const params=new URLSearchParams(location.search);
  if(params.has('d')) return; // inny dzień — nie pokazuj zegara
  function tick(){
    const n=new Date();
    cl.textContent=String(n.getHours()).padStart(2,'0')+':'+String(n.getMinutes()).padStart(2,'0')+':'+String(n.getSeconds()).padStart(2,'0');
  }
  tick(); setInterval(tick,1000);
})();

// ── Auto-odświeżenie po zmianie daty (karta zostawiona otwarta na noc) ────────
(function(){
  const params=new URLSearchParams(location.search);
  if(params.has('d')) return; // przeglądanie innego dnia — nie dotyczy
  const loadedDay=new Date().toDateString();
  function checkDate(){
    if(new Date().toDateString()!==loadedDay) location.reload();
  }
  setInterval(checkDate,60000);
  document.addEventListener('visibilitychange',()=>{ if(!document.hidden) checkDate(); });
})();

// ── Udostępnij dzień ────────
function shareDay(){
  const params=new URLSearchParams(location.search);
  const TODAY=new Date();
  const d=params.get('d')||TODAY.getDate();
  const m=params.get('m')||(TODAY.getMonth()+1);
  const y=params.get('y')||TODAY.getFullYear();
  const url=`${location.origin}${location.pathname}?d=${d}&m=${m}&y=${y}`;
  navigator.clipboard.writeText(url).then(()=>{
    const btn=document.getElementById('shareBtn');
    const orig=btn.textContent; btn.textContent='✓ Skopiowano';
    setTimeout(()=>btn.textContent=orig,2000);
  });
}
document.getElementById('locSearchInput')&&document.getElementById('locSearchInput').addEventListener('keydown',e=>{if(e.key==='Enter')applyLocSearch();});
updateLocUI();


// ── Wyszukiwarka dat ──────────────────────────────────────────
function jumpToDate(val){
  if(!val) return;
  const [y,m,d]=val.split('-').map(Number);
  const TODAY=new Date(); TODAY.setHours(0,0,0,0);
  const sel=new Date(y,m-1,d);
  if(sel.getTime()===TODAY.getTime()) location.href='/';
  else location.href=`/?d=${d}&m=${m}&y=${y}`;
}
(function setDateInput(){
  const inp=document.getElementById('dateJump');
  if(!inp) return;
  const params=new URLSearchParams(location.search);
  const TODAY=new Date();
  const yy=parseInt(params.get('y'))||TODAY.getFullYear();
  const mm=parseInt(params.get('m'))||TODAY.getMonth()+1;
  const dd=parseInt(params.get('d'))||TODAY.getDate();
  inp.value=`${yy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
})();

// ── Pogoda (Open-Meteo) ───────────────────────────────────────
(function loadWeather(){
  const params=new URLSearchParams(location.search);
  if(params.has('d')) return; // tylko dla dzisiejszej daty
  const WMO={
    0:['☀️','Bezchmurnie'],1:['🌤️','Głównie bezchmurnie'],2:['⛅','Częściowe zachmurzenie'],3:['☁️','Pochmurno'],
    45:['🌫️','Mgła'],48:['🌫️','Szron mgielny'],
    51:['🌦️','Mżawka lekka'],53:['🌦️','Mżawka'],55:['🌦️','Mżawka gęsta'],
    61:['🌧️','Deszcz lekki'],63:['🌧️','Deszcz'],65:['🌧️','Deszcz ulewny'],
    66:['🌨️','Marznący deszcz lekki'],67:['🌨️','Marznący deszcz'],
    71:['❄️','Śnieg lekki'],73:['❄️','Śnieg'],75:['❄️','Śnieg intensywny'],77:['🌨️','Ziarna śniegu'],
    80:['🌦️','Przelotne opady lekkie'],81:['🌦️','Przelotne opady'],82:['⛈️','Przelotne opady silne'],
    85:['🌨️','Przelotny śnieg'],86:['🌨️','Przelotny śnieg intensywny'],
    95:['⛈️','Burza'],96:['⛈️','Burza z gradem'],99:['⛈️','Burza z silnym gradem']
  };
  const url=`https://api.open-meteo.com/v1/forecast?latitude=${LOC_LAT}&longitude=${LOC_LON}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m&timezone=Europe%2FWarsaw&wind_speed_unit=kmh`;
  // Open-Meteo aktualizuje dane "current" co ok. 15 min — odświeżamy co 20 min oraz po powrocie do karty
  const REFRESH_MS=20*60*1000;
  let lastFetch=0;
  function refreshWeather(){
    lastFetch=Date.now();
    fetch(url).then(r=>r.json()).then(applyWeather).catch(()=>{});
  }
  function applyWeather(data){
    const c=data.current;
    const [icon,desc]=WMO[c.weather_code]||['🌡️','Nieznane'];
    document.getElementById('weatherIcon').textContent=icon;
    document.getElementById('weatherTemp').textContent=Math.round(c.temperature_2m)+'°C';
    document.getElementById('weatherFeel').textContent='Odczuwalna: '+Math.round(c.apparent_temperature)+'°C';
    document.getElementById('weatherDesc').textContent=desc;
    document.getElementById('weatherCity').textContent=LOC_NAME;
    document.getElementById('weatherDetails').innerHTML=
      `<div class="weather-detail">💨 Wiatr <strong>${Math.round(c.wind_speed_10m)} km/h</strong></div>`+
      `<div class="weather-detail">💧 Wilgotność <strong>${c.relative_humidity_2m}%</strong></div>`;
    document.getElementById('weatherCard').style.display='';
  }
  refreshWeather();
  setInterval(refreshWeather,REFRESH_MS);
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden&&Date.now()-lastFetch>REFRESH_MS/2) refreshWeather();
  });
})();

// ── Następny długi weekend ────────────────────────────────────
(function renderLongWeekend(){
  const DAYS_PL=['niedziela','poniedziałek','wtorek','środa','czwartek','piątek','sobota'];
  const MONTHS_PL=['stycznia','lutego','marca','kwietnia','maja','czerwca','lipca','sierpnia','września','października','listopada','grudnia'];
  // Scalone z kartą "Ile zostało do końca roku" (PUBLIC_HOLIDAYS+MOVABLE) 12.09.2026 — obie karty
  // czytają teraz z jednej, wspólnej funkcji polishHolidayDates() zamiast dwóch niezależnych list.
  function getHolidays(y){
    return polishHolidayDates(y).map(([dd,mm])=>{const dt=new Date(y,mm-1,dd);dt.setHours(0,0,0,0);return dt.getTime();});
  }
  // Liczone od oglądanego dnia (?d=&m=&y=), jak pozostałe karty — wcześniej zawsze od realnego "dziś"
  const params=new URLSearchParams(location.search);
  const now=new Date(); now.setHours(0,0,0,0);
  const today=params.has('d')?new Date(parseInt(params.get('y')||now.getFullYear()),parseInt(params.get('m'))-1,parseInt(params.get('d'))):new Date(now);
  today.setHours(0,0,0,0);
  const y=today.getFullYear();
  const hset=new Set([...getHolidays(y),...getHolidays(y+1)]);
  function isOff(d){const dow=d.getDay();return dow===0||dow===6||hset.has(d.getTime());}
  // szukaj od jutra
  const from=new Date(today); from.setDate(from.getDate()+1);
  let found=null;
  for(let i=0;i<400;i++){
    const d=new Date(from); d.setDate(d.getDate()+i);
    if(!isOff(d)) continue;
    const prev=new Date(d); prev.setDate(prev.getDate()-1);
    if(isOff(prev)) continue; // nie jest początkiem bloku
    let count=0,cur=new Date(d);
    while(isOff(cur)){count++;cur.setDate(cur.getDate()+1);}
    if(count>=3){const end=new Date(cur);end.setDate(end.getDate()-1);found={start:d,end,count};break;}
  }
  const el=document.getElementById('longWeekendContent');
  if(!found){el.innerHTML='<p style="font-size:.85rem;color:var(--muted)">Brak długich weekendów w najbliższych miesiącach.</p>';return;}
  const {start,end,count}=found;
  const diffDays=Math.round((start.getTime()-today.getTime())/86400000);
  const fmtDate=d=>`${DAYS_PL[d.getDay()]}, ${d.getDate()} ${MONTHS_PL[d.getMonth()]}`;
  const fromLabel=diffDays===1?'jutro':`za ${diffDays} dni`;
  // Zbierz listę dni wolnych
  const dayLabels=[];
  let cur2=new Date(found.start);
  while(cur2.getTime()<=found.end.getTime()){
    const isHol=hset.has(cur2.getTime());
    const dow=cur2.getDay();
    const type=isHol?'święto':(dow===0||dow===6?'weekend':'');
    dayLabels.push(`<strong>${cur2.getDate()} ${MONTHS_PL[cur2.getMonth()]}</strong> (${DAYS_PL[dow]}${type?', '+type:''})`);
    cur2.setDate(cur2.getDate()+1);
  }
  el.innerHTML=`
    <div class="lw-banner">
      <div class="lw-emoji">🏖️</div>
      <div>
        <div class="lw-info-label">Zaczyna się ${fromLabel}</div>
        <div class="lw-info-name">${count} dni wolnych z rzędu</div>
      </div>
    </div>
    <div class="lw-meta">${dayLabels.join('<br>')}</div>`;
})();


// ── Ten dzień w historii (dane statyczne, patrz scripts/gen_history_data.js) ──
(function loadHistory(){
  const params=new URLSearchParams(location.search);
  const TODAY=new Date();
  const m=parseInt(params.get('m'))||TODAY.getMonth()+1;
  const d=parseInt(params.get('d'))||TODAY.getDate();
  const MONTHS_PL=['stycznia','lutego','marca','kwietnia','maja','czerwca','lipca','sierpnia','września','października','listopada','grudnia'];
  const pad=n=>String(n).padStart(2,'0');
  fetch(`/history-data/${pad(m)}-${pad(d)}.json`).then(r=>r.ok?r.json():[]).then(events=>{
    if(!events||!events.length) return;
    // 4 losowe, posortowane chronologicznie
    const pick=[...events].sort(()=>Math.random()-.5).slice(0,4);
    pick.sort((a,b)=>a.y-b.y);
    const html=pick.map(e=>
      `<div class="history-item"><span class="history-year">${e.y} r.</span><span class="history-text">${e.t}</span></div>`
    ).join('');
    document.getElementById('historyList').innerHTML=html;
    document.getElementById('historyTitle').textContent=`${d} ${MONTHS_PL[m-1]} w historii`;
    document.getElementById('historyCard').style.display='';
  }).catch(()=>{});
})();


