'use strict';
// =====================================================================
//  Service worker — makes Hollow Cordon an installable, offline web app.
//  On install it reads index.html and precaches every local script and
//  stylesheet it references (no hand-kept file list to drift), plus the
//  manifest and icons. Requests are network-first so updates arrive as
//  soon as you are online, with the cache as the offline fallback.
// =====================================================================

const CACHE = 'hollow-cordon-v3';
const EXTRA = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const html = await (await fetch('index.html', { cache: 'no-cache' })).text();
    const urls = EXTRA.slice();
    for (const m of html.matchAll(/(?:src|href)="([^"#?]+)"/g)) if (!/^[a-z][a-z0-9+.-]*:/i.test(m[1])) urls.push(m[1]);
    await cache.addAll([...new Set(urls)]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok) { const cache = await caches.open(CACHE); cache.put(req, res.clone()); }
      return res;
    } catch (err) {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') { const page = await caches.match('index.html'); if (page) return page; }
      throw err;
    }
  })());
});
