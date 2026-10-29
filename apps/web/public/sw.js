// Service worker: makes the app shell available offline.
// - Pages (navigations): network first, fall back to the cached copy.
// - Built JS/CSS (/_next/static, hashed filenames): cache first, they never change.
// - API calls are NOT cached here; board data lives in IndexedDB (lib/idb.ts).
const CACHE = 'driftboard-v3';
const SHELL = ['/', '/dashboard/', '/organizations/', '/board/', '/invite/', '/signin/', '/signup/'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(url.pathname, copy));
          return res;
        })
        // /board/?id=123 -> cached /board/ (the page reads ?id itself)
        .catch(() => caches.match(url.pathname, { ignoreSearch: true }).then(r => r || caches.match('/'))),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(
      hit =>
        hit ||
        fetch(req).then(res => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
