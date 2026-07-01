const CACHE = 'daybyday-v48';

const PRECACHE = [
  'fonts.css',
  'fonts/outfit-latin.woff2',
  'fonts/outfit-latin-ext.woff2',
  'fonts/instrument-serif-normal-latin.woff2',
  'fonts/instrument-serif-normal-latin-ext.woff2',
  'fonts/instrument-serif-italic-latin.woff2',
  'fonts/instrument-serif-italic-latin-ext.woff2',
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = e.request.url;
  if (e.request.mode === 'navigate' || url.includes('api.') || url.includes('openstreetmap') || url.includes('open-meteo') || url.includes('wttr') || url.includes('wikipedia')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      const clone = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, clone));
      return res;
    }))
  );
});
