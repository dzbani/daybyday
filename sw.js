const CACHE = 'daybyday-v2';
const ASSETS = [
  '/daybyday/',
  '/daybyday/index.html',
  '/daybyday/imieniny.html',
  '/daybyday/swieta.html',
  '/daybyday/kalkulatory.html',
  '/daybyday/favicon.svg',
  '/daybyday/manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).catch(() => caches.match('/daybyday/')))
  );
});
