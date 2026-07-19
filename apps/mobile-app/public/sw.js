const APP_VERSION = '1.8.241';
const STATIC_CACHE = `hashpass-static-v${APP_VERSION}`;
const PAGE_CACHE = `hashpass-pages-v${APP_VERSION}`;
const OFFLINE_URL = '/offline.html';
const RELEASE_METADATA_PATHS = new Set([
  '/config/versions.json',
  '/config/version.production.json',
  '/config/version.development.json',
  '/config/update-policy.json'
]);
const PRECACHE_URLS = [
  '/',
  '/home',
  OFFLINE_URL,
  '/manifest.json',
  '/favicon.ico',
  '/favicon-16x16.png',
  '/favicon-32x32.png',
  '/apple-touch-icon.png',
  '/assets/pwa-icon-192.png',
  '/assets/pwa-icon-512.png',
  '/assets/pwa-maskable-512.png'
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

const fetchFresh = (request) => fetch(request, { cache: 'no-cache' });

const fetchNoStore = (request) => fetch(request, { cache: 'no-store' });

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) =>
        Promise.allSettled(
          PRECACHE_URLS.map((url) =>
            cache.add(new Request(url, { cache: 'reload' }))
          )
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
                cacheName.startsWith('hashpass-') &&
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

  // Never intercept Metro / Expo dev bundle requests.
  // They are not app assets and should always go straight to network.
  if (
    url.pathname.includes('/node_modules/') ||
    url.pathname.includes('/_expo/') ||
    url.pathname.includes('/.expo/') ||
    url.pathname.endsWith('.bundle') ||
    url.pathname.endsWith('.map')
  ) {
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
    event.respondWith(fetchNoStore(request));
    return;
  }

  if (RELEASE_METADATA_PATHS.has(url.pathname) || url.pathname === '/sw.js') {
    event.respondWith(fetchNoStore(request));
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

          const networkResponse = await fetchFresh(request);
          await putInCache(PAGE_CACHE, request, networkResponse);
          return networkResponse;
        } catch {
          return (
            (await caches.match(request)) ||
            (await caches.match('/home')) ||
            (await caches.match(OFFLINE_URL))
          );
        }
      })()
    );
    return;
  }

  const isRuntimeAsset =
    request.destination === 'script' ||
    request.destination === 'style' ||
    url.pathname === '/manifest.json';

  if (isRuntimeAsset) {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetchFresh(request);
          await putInCache(STATIC_CACHE, request, networkResponse);
          return networkResponse;
        } catch {
          return (await caches.match(request)) || Response.error();
        }
      })()
    );
    return;
  }

  const isStaticAsset =
    request.destination === 'font' ||
    request.destination === 'image';

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
            .filter((cacheName) => cacheName.startsWith('hashpass-'))
            .map((cacheName) => caches.delete(cacheName))
        )
      )
    );
  }
});
