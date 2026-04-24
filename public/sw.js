// Halley Bakery Service Worker
const CACHE_NAME = 'halley-v3';
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/brand/logo-mobile.png',
  '/brand/logo-desktop.png',
];

// Install: cache static assets
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: Network first, fallback to cache
self.addEventListener('fetch', (e) => {
  // Skip non-GET and cross-origin (Google APIs, etc.)
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  // Skip admin API calls - always fresh
  if (url.pathname.startsWith('/api/')) return;

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // Cache successful HTML/JS/CSS responses
        if (res && res.status === 200 && ['document', 'script', 'style', 'image'].includes(e.request.destination)) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(e.request);
        if (cached) return cached;

        if (e.request.destination === 'document') {
          const fallback = await caches.match('/');
          if (fallback) return fallback;
        }

        return Response.error();
      })
  );
});
