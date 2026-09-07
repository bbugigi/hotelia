// Hotelia Guest PWA — Service Worker
// Offline-first caching: app shell + API (network-first)

const CACHE_VERSION = "hotelia-guest-v1";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const API_CACHE = `${CACHE_VERSION}-api`;

const STATIC_ASSETS = [
  "/",
  "/manifest.json",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("hotelia-guest") && key !== CACHE_VERSION)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin requests
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // API requests: network-first with offline fallback
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          const cache = await caches.open(API_CACHE);
          cache.put(request, response.clone());
          return response;
        } catch (err) {
          const cached = await caches.match(request);
          if (cached) return cached;
          return Response.json(
            { code: "OFFLINE", message: "You're offline. Requests are queued." },
            { status: 503, headers: { "Content-Type": "application/json" } },
          );
        }
      })(),
    );
    return;
  }

  // Static assets: cache-first
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(STATIC_CACHE);
          cache.put(request, response.clone());
        }
        return response;
      } catch (err) {
        // Fall back to the home page offline shell
        return caches.match("/");
      }
    })(),
  );
});