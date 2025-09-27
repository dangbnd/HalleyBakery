const CACHE = "img-v1";
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.hostname !== "images.weserv.nl") return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(e.request);
    const fetcher = fetch(e.request).then((res) => { cache.put(e.request, res.clone()); return res; }).catch(()=>hit);
    return hit || fetcher;
  })());
});
