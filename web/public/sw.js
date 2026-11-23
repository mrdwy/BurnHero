// 极简离线缓存：静态资源走缓存优先，接口不缓存。
const C = 'fbh-v1';
self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.pathname.startsWith('/api/') || u.origin !== location.origin) return;
  e.respondWith(
    caches.open(C).then(async (c) => {
      try {
        const r = await fetch(e.request, { cache: 'no-store' });
        if (r.ok) c.put(e.request, r.clone());
        return r;
      } catch {
        return (await c.match(e.request)) || (await c.match('/index.html'));
      }
    })
  );
});
