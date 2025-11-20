const CACHE_NAME = "gtd-dashboard-shell-v1";
const CORE_ASSETS = [
  "/",
  "/index.html",
  "/css/reset.css",
  "/css/style.css",
  "/js/app.js",
  "/js/ui.js",
  "/js/data.js",
  "/js/analytics.js",
  "/lib/chart.min.js",
  "/lib/dragdrop.js",
  "/favicon-16x16.png",
  "/favicon-32x32.png",
  "/favicon.ico",
  "/apple-touch-icon.png",
  "/android-chrome-192x192.png",
  "/android-chrome-512x512.png",
  "/site.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).catch((error) => {
      console.warn("SW install cache error", error);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;

  // Always bypass API/state calls.
  if (isSameOrigin && url.pathname.startsWith("/state")) {
    return;
  }

  // Cache-first for core assets and navigations.
  if (request.method === "GET" && (request.mode === "navigate" || isSameOrigin)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request)
          .then((response) => {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            return response;
          })
          .catch(() => caches.match("/index.html"));
      })
    );
  }
});
