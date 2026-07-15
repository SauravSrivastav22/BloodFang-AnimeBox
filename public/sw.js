// BloodFang service worker — a minimal offline app shell for the installable
// PWA. Never touches the API or cross-origin sources (AniList / embed players);
// only caches the built app so it opens instantly and works offline-ish.
const CACHE = 'bloodfang-v2'
const SHELL = ['/', '/index.html', '/favicon.svg', '/manifest.webmanifest']

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const { request } = e
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return // leave cross-origin alone
  if (url.pathname.startsWith('/api')) return // API always hits the network

  // Hashed build assets are immutable → cache-first.
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(request, copy))
            return res
          }),
      ),
    )
    return
  }

  // Navigations → network-first, fall back to the cached shell when offline.
  if (request.mode === 'navigate') {
    e.respondWith(fetch(request).catch(() => caches.match('/index.html')))
  }
})
