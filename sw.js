// App-shell cache so the dashboard opens instantly and works with bad signal.
// API calls (Spotify, routing, search) and map tiles are never cached here.
const CACHE = 'rideplay-v1';
const SHELL = [
  './', './index.html', './styles.css', './config.js', './manifest.webmanifest',
  './js/app.js', './js/spotify.js', './js/gps.js', './js/nav.js', './js/routing.js', './js/places.js',
  './js/keys.js', './js/util.js', './js/icons.js', './js/wakelock.js', './js/demo.js', './js/artcolor.js',
  './vendor/leaflet/leaflet.js', './vendor/leaflet/leaflet.css',
  './icons/icon-192.png', './icons/logo.svg', './icons/music-app.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
];

// Install: fetch the shell straight from the server ('reload'), never from the HTTP cache,
// so a new version can't be assembled from a mix of old and new files.
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Network first (so updates land right away), cache as the offline fallback.
// 'no-cache' makes every request check with the server (a cheap 304 when unchanged). Without it,
// the browser could serve a 10-minute-old styles.css next to a fresh index.html after a deploy.
function fresh(req) {
  if (req.mode === 'navigate') {
    return fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
      .then((res) => (res.redirected ? Response.redirect(res.url, 302) : res));
  }
  return fetch(req, { cache: 'no-cache' });
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fresh(e.request)
      .then((res) => {
        if (res.ok && res.type !== 'opaqueredirect' && !res.redirected) {
          const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'))),
  );
});
