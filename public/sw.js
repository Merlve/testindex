const CACHE_NAME = 'shindex-cache-v4';
const IMAGE_CACHE_NAME = 'shindex-images-v1';
const urlsToCache = [
  '/',
  '/index.html'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  
  const url = event.request.url;

  // Bypass cache for development server, HMR, Vite deps, node_modules, or API requests
  if (url.includes('/@') || url.includes('/node_modules/') || url.includes('/src/') || url.includes('/api/') || url.includes('?v=')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Navigation requests (Network first, fallback to cache)
  if (event.request.mode === 'navigate' || (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html'))) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }
  
  // Image assets caching (Cache first, then network fallback)
  const isImage = event.request.destination === 'image' || 
                  url.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i) || 
                  url.includes('image.tmdb.org');
                  
  if (isImage) {
    event.respondWith(
      caches.match(event.request).then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(event.request).then(networkResponse => {
          // For third-party images (CORS), the type might be 'opaque' (0 status) or 'cors' (200 status)
          if (!networkResponse || (networkResponse.status !== 200 && networkResponse.type !== 'opaque')) {
            return networkResponse;
          }

          const responseToCache = networkResponse.clone();
          caches.open(IMAGE_CACHE_NAME).then(cache => {
            // Store image in dedicated image cache
            cache.put(event.request, responseToCache);
          });

          return networkResponse;
        }).catch(() => new Response('', { status: 408, statusText: 'Request timeout' }));
      })
    );
    return;
  }

  // For other static assets (Cache first, then network)
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request).then(
          response => {
            if(!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            const responseToCache = response.clone();
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });
            return response;
          }
        ).catch(() => null);
      })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME && cacheName !== IMAGE_CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});
