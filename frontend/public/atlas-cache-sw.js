const CACHE_NAME = 'cubixrecipes-atlas-pages-v1';
const CACHE_PREFIX = 'cubixrecipes-atlas-pages-';
const ATLAS_PATHS = ['/api/mod-icons/atlases/', '/api/atlas/v2/pages/'];
const pendingRequests = new Map();

function isAtlasPageRequest(request, url) {
  if (request.method !== 'GET' || url.origin !== self.location.origin) return false;
  return ATLAS_PATHS.some((path) => url.pathname.includes(path));
}

async function cacheAtlasPage(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  const requestKey = request.url;
  const pending = pendingRequests.get(requestKey);
  if (pending) return pending;

  const fetchPromise = fetch(request).then(async (response) => {
    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.toLowerCase().startsWith('image/')) {
      await cache.put(request, response.clone());
    }
    return response;
  }).finally(() => {
    pendingRequests.delete(requestKey);
  });
  pendingRequests.set(requestKey, fetchPromise);
  return fetchPromise;
}

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (!isAtlasPageRequest(event.request, url)) return;
  event.respondWith(cacheAtlasPage(event.request));
});
