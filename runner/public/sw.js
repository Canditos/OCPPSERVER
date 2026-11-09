// Service Worker - Self-cleaning Cache Buster
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Always fetch fresh network content
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
