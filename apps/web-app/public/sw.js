const APP_VERSION = '1.0.5';
const STATIC_CACHE = `hashpass-club-static-v${APP_VERSION}`;
const PAGE_CACHE = `hashpass-club-pages-v${APP_VERSION}`;
const OFFLINE_URL = '/offline.html';

const PRECACHE_URLS = [
  '/',
  '/index.html',
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/favicon.ico',
  '/canonical-redirect.js',
  '/theme-init.js',
  '/sw-register.js',
  '/og-image.png',
  '/logo-hashpass.svg',
  '/logo-full-hashpass-black.svg',
  '/logo-full-hashpass-black-cyan.svg',
  '/logo-full-hashpass-white.svg',
  '/logo-full-hashpass-white-cyan.svg',
  '/hashpass-club-favicon/favicon-v2.ico',
  '/hashpass-club-favicon/icon-192-v2.png',
  '/hashpass-club-favicon/icon-512-v2.png',
  '/hashpass-club-favicon/hashpass-club-icon-1024-v2.png',
  '/hashpass-club-favicon/apple-touch-icon-v2.png',
  '/hashpass-club-favicon/favicon-16x16-v2.png',
  '/hashpass-club-favicon/favicon-32x32-v2.png'
];

const isCacheableResponse = (response) => {
  if (!response || !response.ok || response.type === 'opaque') {
    return false;
  }

  const cacheControl = response.headers.get('cache-control') || '';
  return !/(no-store|private)/i.test(cacheControl);
};

const putInCache = async (cacheName, request, response) => {
  if (!isCacheableResponse(response)) {
    return;
  }

  const cache = await caches.open(cacheName);
  await cache.put(request, response.clone());
};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) =>
        Promise.allSettled(
          PRECACHE_URLS.map((url) => cache.add(new Request(url, { cache: 'reload' })))
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter(
              (cacheName) =>
                cacheName.startsWith('hashpass-club-') &&
                cacheName !== STATIC_CACHE &&
                cacheName !== PAGE_CACHE
            )
            .map((cacheName) => caches.delete(cacheName))
        )
      ),
      self.registration.navigationPreload
        ? self.registration.navigationPreload.enable()
        : Promise.resolve()
    ]).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  const isSensitiveRoute =
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth') ||
    url.pathname.startsWith('/dashboard') ||
    url.pathname.includes('/callback') ||
    url.searchParams.has('code') ||
    url.searchParams.has('token') ||
    url.searchParams.has('access_token') ||
    url.searchParams.has('refresh_token');

  if (isSensitiveRoute) {
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const preloadResponse = await event.preloadResponse;
          if (preloadResponse) {
            await putInCache(PAGE_CACHE, request, preloadResponse);
            return preloadResponse;
          }

          const networkResponse = await fetch(request);
          await putInCache(PAGE_CACHE, request, networkResponse);
          return networkResponse;
        } catch {
          return (
            (await caches.match(request)) ||
            (await caches.match('/')) ||
            (await caches.match(OFFLINE_URL))
          );
        }
      })()
    );
    return;
  }

  const isStaticAsset =
    request.destination === 'style' ||
    request.destination === 'script' ||
    request.destination === 'font' ||
    request.destination === 'image' ||
    url.pathname === '/manifest.webmanifest';

  if (isStaticAsset) {
    event.respondWith(
      (async () => {
        const cachedResponse = await caches.match(request);
        const networkRequest = fetch(request)
          .then(async (networkResponse) => {
            await putInCache(STATIC_CACHE, request, networkResponse);
            return networkResponse;
          })
          .catch(() => null);

        return cachedResponse || (await networkRequest) || Response.error();
      })()
    );
  }
});

self.addEventListener('message', (event) => {
  if (!event.data) {
    return;
  }

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data.type === 'CLEAR_CACHES') {
    event.waitUntil(
      caches.keys().then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => cacheName.startsWith('hashpass-club-'))
            .map((cacheName) => caches.delete(cacheName))
        )
      )
    );
  }
});
