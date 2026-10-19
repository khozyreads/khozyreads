// KhozyReads Service Worker
// Strategy: network-first (fresh content), fallback to cache when offline.
// Bump CACHE_VERSION whenever you deploy a major change.

const CACHE_VERSION = 'khozy-v3-fast';
const IMG_CACHE = 'khozy-img-v1';
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/admin.html',
  '/config.js',
  '/manifest.webmanifest',
  '/icon.svg',
  '/icon-maskable.svg'
];

// Install: pre-cache core shell so app boots offline
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(CORE_ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

// Activate: cleanup old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_VERSION && n !== IMG_CACHE).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first for navigations, cache-first for static, never cache Supabase
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip Supabase API, Telegram, and any non-GET request — must hit network
  if (event.request.method !== 'GET') return;
  // Public book covers: stale-while-revalidate (instant on repeat visits, refreshed in background)
  if (url.hostname.includes('supabase.co') && url.pathname.startsWith('/storage/v1/object/public/')) {
    event.respondWith(
      caches.open(IMG_CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);
        const network = fetch(event.request).then((res) => {
          if (res && res.status === 200) cache.put(event.request, res.clone()).catch(() => {});
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    );
    return;
  }
  if (url.hostname.includes('supabase.co')) return;
  if (url.hostname.includes('telegram.org')) return;

  // For our HTML/JSON/manifest: network-first
  if (event.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('.webmanifest')) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(event.request, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(event.request).then((r) => r || caches.match('/index.html')))
    );
    return;
  }

  // For static assets (svg, fonts, scripts): cache-first
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((res) => {
        if (res && res.status === 200 && res.type !== 'opaque') {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(event.request, copy)).catch(() => {});
        }
        return res;
      }).catch(() => cached);
    })
  );
});
