const CACHE_NAME = "orbit-v2";
const CORE_SHELL = [
  "/",
  "/chat",
  "/deadlines",
  "/budget",
  "/more",
  "/focus",
  "/timetable",
  "/grades",
  "/settings",
  "/manifest.json",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
];

const OFFLINE_HTML =
  '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
  '<meta name="theme-color" content="#0e1012"><title>Orbit - Offline</title>' +
  '<style>body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#0e1012;' +
  'color:#ece7dd;font:400 16px/1.5 system-ui,sans-serif;text-align:center;padding:24px}' +
  'h1{color:#e3a553;font:700 22px/1.2 system-ui,sans-serif;margin:0 0 8px}p{margin:0;color:#9a958c;max-width:34ch}</style></head>' +
  '<body><main><h1>You are offline</h1><p>Orbit keeps working without a connection - your data lives on this device. ' +
  "Reconnect to load this page, or open a page you've visited before.</p></main></body></html>";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        Promise.all(CORE_SHELL.map((url) => cache.add(url).catch(() => undefined)))
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

function isStaticAsset(pathname) {
  return (
    pathname.startsWith("/_next/static/") ||
    pathname.startsWith("/_next/image") ||
    /\.(?:js|css|png|svg|jpg|jpeg|webp|woff2?|ico|json|txt)$/.test(pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response && response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone()).catch(() => undefined);
          }
          return response;
        } catch (error) {
          const cache = await caches.open(CACHE_NAME);
          const exact = await cache.match(request);
          if (exact) return exact;
          if (url.pathname === "/") {
            const shell = await cache.match("/");
            if (shell) return shell;
          }
          const scopeCache = await cache.match(url.pathname);
          if (scopeCache) return scopeCache;
          return new Response(OFFLINE_HTML, {
            status: 503,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        }
      })()
    );
    return;
  }

  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((response) => {
            if (response && response.ok) {
              cache.put(request, response.clone()).catch(() => undefined);
            }
            return response;
          })
          .catch(() => undefined);
        if (cached) {
          return cached;
        }
        const fresh = await network;
        if (fresh) return fresh;
        return new Response("", { status: 503 });
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          cache.put(request, response.clone()).catch(() => undefined);
        }
        return response;
      } catch (error) {
        if (cached) return cached;
        return new Response(JSON.stringify({ error: "offline" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      }
    })()
  );
});
