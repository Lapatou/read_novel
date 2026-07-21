const CACHE_NAME = 'novel-reader-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/icon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Cache API requests (Network First, fallback to cache)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      caches.open('novel-reader-api').then(async cache => {
        try {
          const response = await fetch(event.request);
          // Sadece başarılı GET isteklerini cache'le (MP3 stream'leri hariç)
          if (response.status === 200 && event.request.method === 'GET' && !url.pathname.includes('/stream')) {
            cache.put(event.request, response.clone());
          }
          return response;
        } catch (err) {
          const cachedResponse = await cache.match(event.request);
          if (cachedResponse) return cachedResponse;
          throw err;
        }
      })
    );
    return;
  }

  // App shell & static assets (Cache First)
  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request).then(response => {
        if (response.status === 200) {
          const resClone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, resClone));
        }
        return response;
      });
    })
  );
});
