const ADMIN_CACHE = 'allshop-admin-v1';
const ADMIN_SHELL = '/admin';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    try {
      const response = await fetch(ADMIN_SHELL, { cache: 'reload' });
      if (response.ok) {
        const cache = await caches.open(ADMIN_CACHE);
        await cache.put(ADMIN_SHELL, response.clone());
      }
    } catch {
      // A primeira instalação continua; o modo offline fica disponível
      // assim que houver uma resposta válida para guardar.
    }
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith('allshop-admin-') && name !== ADMIN_CACHE)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

const cacheAdminShell = async (request) => {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(ADMIN_CACHE);
      await cache.put(ADMIN_SHELL, response.clone());
    }
    return response;
  } catch {
    return (await caches.match(ADMIN_SHELL)) || Response.error();
  }
};

const cacheAsset = async (request) => {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(ADMIN_CACHE);
    await cache.put(request, response.clone());
  }
  return response;
};

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.mode === 'navigate' && url.origin === self.location.origin && url.pathname.startsWith('/admin')) {
    event.respondWith(cacheAdminShell(event.request));
    return;
  }
  if (url.origin === self.location.origin && url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheAsset(event.request));
  }
});
