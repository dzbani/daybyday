/* Zgoda na statystyki (Google Analytics 4).
   Kod Google Analytics jest pobierany DOPIERO po kliknięciu „Akceptuję” w komunikacie na dole strony.
   Wybór: localStorage 'dbd-consent' = 'granted' | 'denied'. Zmiana wyboru: window.dbdCookieSettings()
   (przycisk w polityce prywatności). Reklam ten plik nie obsługuje — zgodę reklamową zbiera komunikat Google.
   Po zmianie tego pliku podbij wersję SW (node scripts/bump_sw.js). */
(function () {
  var ID = 'G-2LQZRJPF39';
  var KEY = 'dbd-consent';
  // testy lokalne nie liczą się w GA4
  var local = ['localhost', '127.0.0.1', '[::1]'].indexOf(location.hostname) > -1;
  var started = false;

  function read() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function save(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }

  function start() {
    window['ga-disable-' + ID] = local;
    if (started) return;
    started = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', ID);
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + ID;
    document.head.appendChild(s);
  }

  // blokuje wysyłkę i usuwa cookies Analytics (także te zapisane przed wprowadzeniem zgody)
  function stop() {
    window['ga-disable-' + ID] = true;
    var host = location.hostname;
    var domains = ['', host, '.' + host, '.' + host.split('.').slice(-2).join('.')];
    document.cookie.split(';').forEach(function (c) {
      var name = c.split('=')[0].trim();
      if (name !== '_ga' && name.indexOf('_ga_') !== 0) return;
      domains.forEach(function (d) {
        document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/' + (d ? '; domain=' + d : '');
      });
    });
  }

  function choose(v) {
    save(v);
    if (v === 'granted') start(); else stop();
    var b = document.getElementById('cookieBanner');
    if (b) b.remove();
  }

  function button(label, value) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.setAttribute('data-consent', value);
    b.style.cssText = 'background:#F8F7F5;color:#1A1916;border:none;border-radius:60px;padding:.55rem 1.25rem;font-size:.82rem;font-weight:600;cursor:pointer;white-space:nowrap;font-family:inherit;min-width:7.5rem;';
    b.onclick = function () { choose(value); };
    return b;
  }

  function show() {
    if (document.getElementById('cookieBanner')) return;
    var box = document.createElement('div');
    box.id = 'cookieBanner';
    box.setAttribute('role', 'region');
    box.setAttribute('aria-label', 'Zgoda na statystyki');
    box.style.cssText = 'display:flex;position:fixed;bottom:0;left:0;right:0;z-index:9999;background:#1A1916;color:#F8F7F5;border-top:1px solid #3A3733;padding:1rem 1.5rem;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.75rem;font-family:Outfit,sans-serif;font-size:.82rem;line-height:1.5;';
    var text = document.createElement('span');
    text.style.cssText = 'flex:1 1 18rem;';
    text.appendChild(document.createTextNode('Za Twoją zgodą używamy Google Analytics (pliki cookies), żeby mierzyć ruch na stronie. Możesz odmówić — serwis działa tak samo. '));
    var a = document.createElement('a');
    a.href = '/polityka-prywatnosci.html';
    a.textContent = 'Polityka prywatności';
    a.style.cssText = 'color:#F8F7F5;text-decoration:underline;text-underline-offset:3px;';
    text.appendChild(a);
    var actions = document.createElement('span');
    actions.style.cssText = 'display:flex;gap:.5rem;flex-wrap:wrap;';
    actions.appendChild(button('Odrzucam', 'denied'));
    actions.appendChild(button('Akceptuję', 'granted'));
    box.appendChild(text);
    box.appendChild(actions);
    document.body.appendChild(box);
  }

  window.dbdCookieSettings = show;

  var choice = read();
  if (choice === 'granted') start(); else stop();

  // w ramce na cudzej stronie (widżety) nie pokazujemy komunikatu
  if (choice !== 'granted' && choice !== 'denied' && window.self === window.top) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show);
    else show();
  }
})();
