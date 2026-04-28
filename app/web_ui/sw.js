const CACHE_NAME = "nextflow-shell-v8";
const CORE_ASSETS = [
  "/",
  "/index.html",
  "/css/reset.css",
  "/css/style.css",
  "/js/app.js",
  "/js/ui.js",
  "/js/data.js",
  "/js/analytics.js",
  "/js/review.js",
  "/js/panels/all-active.js",
  "/js/panels/backlog.js",
  "/js/panels/calendar.js",
  "/js/panels/inbox.js",
  "/js/panels/kanban.js",
  "/js/panels/my-day.js",
  "/js/panels/next.js",
  "/js/panels/projects.js",
  "/js/panels/reports.js",
  "/js/panels/settings.js",
  "/js/panels/someday.js",
  "/js/panels/statistics.js",
  "/js/panels/trash.js",
  "/js/panels/waiting.js",
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
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
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

  // Always bypass API calls — never cache dynamic data endpoints.
  if (isSameOrigin && (
    url.pathname.startsWith("/state") ||
    url.pathname.startsWith("/completed") ||
    url.pathname.startsWith("/feedback") ||
    url.pathname.startsWith("/credentials") ||
    url.pathname.startsWith("/upload") ||
    url.pathname.startsWith("/admin") ||
    url.pathname.startsWith("/export")
  )) {
    return;
  }

  if (request.method !== "GET") return;

  const isScript = url.pathname.endsWith(".js");
  const isStylesheet = url.pathname.endsWith(".css");

  // Network-first for JS/CSS so app updates are picked up without clearing cache.
  if (isSameOrigin && (isScript || isStylesheet)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Network-first for navigations so PWA installs always pick up fresh HTML
  // when online. Falls back to cache when offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() =>
          caches.match(request)
            .then((cached) => cached || caches.match("/index.html"))
            .then((response) => response || new Response(
              "<html><body><p style='font-family:sans-serif;padding:2rem'>NextFlow is offline. Please reconnect and reload.</p></body></html>",
              { headers: { "Content-Type": "text/html" } }
            ))
        )
    );
    return;
  }

  // Cache-first for other same-origin static assets (images, fonts, etc.).
  if (isSameOrigin) {
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
