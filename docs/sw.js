// WoodFlow service worker: lets phones and tablets install WoodFlow as an app
// (home-screen icon, full screen). It keeps the app's own files so it opens
// fast, but NEVER caches database data: jobs and statuses always come live
// from Supabase, so a station never shows yesterday's list.

const CACHE = 'woodflow-shell-v1'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key)
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)
  // Only the app's own files, never Supabase or anything else.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return

  // Pages: always try the network first (so a new version shows straight
  // away); fall back to the saved copy when there's no signal.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req)
        const cache = await caches.open(CACHE)
        cache.put('./', res.clone())
        return res
      } catch {
        return (await caches.match('./')) || Response.error()
      }
    })())
    return
  }

  // Built files have a unique name per version, so a saved copy is safe.
  if (url.pathname.includes('/assets/') || /\.(png|svg|webmanifest)$/.test(url.pathname)) {
    event.respondWith((async () => {
      const hit = await caches.match(req)
      if (hit) return hit
      const res = await fetch(req)
      if (res.ok) (await caches.open(CACHE)).put(req, res.clone())
      return res
    })())
  }
})
