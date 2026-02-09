/* Minimal service worker: basic cache-first for shell files, short-lived and safe for demo */
const CACHE_NAME = "ticketbuy-shell-v1";
const ASSETS = ["/", "/index.html", "/styles.css", "/main.js", "/manifest.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (e) => {
  // Attempt cache first for app shell, fallback to network
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request)
        .then((res) => {
          // Optionally cache new GET requests for same-origin assets
          try {
            const resClone = res.clone();
            if (e.request.url.startsWith(self.location.origin)) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(e.request, resClone).catch(() => {});
              });
            }
          } catch {}
          return res;
        })
        .catch(() => cached || new Response("", { status: 504 }));
    })
  );
});