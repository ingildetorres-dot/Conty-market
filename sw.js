/* Conty Market POS · service worker
   Guarda la app en el equipo para que abra y venda sin internet. */
const CACHE = 'conty-market-v2';
const ARCHIVOS = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './mascota.png',
  './portada.jpg'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = e.request.url;
  // Firebase y fuentes: siempre a la red (Firestore maneja su propio offline)
  if (url.includes('firebase') || url.includes('googleapis') || url.includes('gstatic') || url.includes('unpkg')) return;
  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request).then(hit => {
      const red = fetch(e.request).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copia = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copia));
        }
        return res;
      }).catch(() => hit);
      return hit || red;
    })
  );
});
