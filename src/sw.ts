/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { SHARE_CACHE, SHARE_PREFIX } from './share'

declare const self: ServiceWorkerGlobalScope

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

// Android share sheet → POST multipart to ./share-target (see manifest share_target).
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method === 'POST' && url.pathname.endsWith('/share-target')) {
    event.respondWith(receiveShare(event.request))
  }
})

async function receiveShare(request: Request): Promise<Response> {
  const scope = self.registration.scope
  try {
    const form = await request.formData()
    const cache = await caches.open(SHARE_CACHE)
    for (const key of await cache.keys()) await cache.delete(key)

    const files = form.getAll('images').filter((f): f is File => f instanceof File && f.size > 0)
    await Promise.all(
      files.map((f, i) =>
        cache.put(new URL(`${SHARE_PREFIX}${i}`, scope).href, new Response(f, { headers: { 'Content-Type': f.type } })),
      ),
    )
    const text = [form.get('title'), form.get('text')].filter((v) => typeof v === 'string' && v).join(' ')
    if (text) await cache.put(new URL(`${SHARE_PREFIX}text`, scope).href, new Response(text))
  } catch (err) {
    console.error('share-target failed', err)
  }
  return Response.redirect(`${scope}#/add?shared=1`, 303)
}
