/* Everdusk service worker — installable + offline + auto-updating.
 *
 * Update model (the "easily updatable" part): the app is served from the live
 * site, so a new gh-pages deploy IS the update. HTML is network-first, so the
 * fresh index.html (which references new content-hashed asset filenames) is
 * always picked up when online; those new assets are cache-misses and get
 * fetched. Static assets are cache-first (immutable by hash) for offline +
 * speed. No forced mid-session reload — updates apply on the next open/reload.
 */
const CACHE = 'everdusk-v1';

self.addEventListener('install', (event) => {
  // Become the active worker promptly so updates are ready on next load.
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(['./', './index.html', './manifest.webmanifest']).catch(() => {})),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const isNavigation = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');

  if (isNavigation) {
    // Network-first so a new deploy is picked up whenever the device is online.
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('./index.html'))),
    );
    return;
  }

  // Everything else (hashed JS/CSS, art, audio): cache-first, fall back to network,
  // and cache what we fetch so it works offline afterward.
  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
