const CACHE_NAME = 'sige-gl-v3';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter((name) => name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (new URL(event.request.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);

    // The application shell must always check for the deployed version first.
    // This prevents an older offline cache from keeping the previous interface.
    if (event.request.mode === 'navigate') {
      try {
        const response = await fetch(event.request);
        if (response.ok) await cache.put(event.request, response.clone());
        return response;
      } catch (error) {
        return (await cache.match(event.request)) ||
          (await caches.match(event.request)) ||
          (await caches.match(new URL('./', self.registration.scope)));
      }
    }

    const cached = await cache.match(event.request) || await caches.match(event.request);
    if (cached) return cached;

    const response = await fetch(event.request);
    if (response.ok) await cache.put(event.request, response.clone());
    return response;
  })());
});
