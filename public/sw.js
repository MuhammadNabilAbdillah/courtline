// Courtline service worker: makes the app installable and lets the shell open even with a weak connection.
// Strategy is network-first, so people always get the newest version when online (no stale deploys).
// Live data (Supabase) is cross-origin and is never touched here.
const CACHE = 'courtline-v8'
self.addEventListener('install', e => {
  self.skipWaiting()
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['/', '/manifest.webmanifest', '/icons/icon-192.png'])).catch(() => {}))
})
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url)
  if (r.method !== 'GET' || u.origin !== self.location.origin) return
  e.respondWith(
    fetch(r).then(res => {
      if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(r, copy)) }
      return res
    }).catch(() => caches.match(r).then(hit => hit || (r.mode === 'navigate' ? caches.match('/') : Response.error())))
  )
})
