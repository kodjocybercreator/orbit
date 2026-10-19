const CACHE_NAME = "orbit-v3";
const NET_TIMEOUT_MS = 3500;
// Keep the install set tiny so the worker activates fast on weak networks —
// page HTML warms via the navigate/SWR handlers as the user visits them.
const CORE_SHELL = [
  "/",
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

/**
 * Tab taps were waiting on unbounded network fetches — on a flaky connection
 * the router sat there for tens of seconds and the bottom nav felt dead.
 * Every network path is now capped; after the cap we fall back to cache.
 */
function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("network-timeout")), ms);
    fetch(request).then(
      (response) => {
        clearTimeout(timer);
        resolve(response);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

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
          const response = await fetchWithTimeout(request, NET_TIMEOUT_MS);
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

  // The SW script itself must always come from the network so updates land.
  if (url.pathname === "/sw.js") return;

  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request);
        const network = fetchWithTimeout(request, NET_TIMEOUT_MS)
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

  // Client-side route taps (RSC payloads) are stale-while-revalidate, keyed
  // without the per-build _rsc hash: once a tab has been visited once, taps
  // render instantly from cache even on a dead network, refreshing behind the
  // scenes. Local-first app — the real data lives in IndexedDB, not here.
  // Namespaced so these entries never collide with the CORE_SHELL HTML pages
  // cached under the plain pathname.
  const cacheKey = url.origin + "/__swr" + url.pathname;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(cacheKey);
      const refresh = fetchWithTimeout(request, NET_TIMEOUT_MS)
        .then((response) => {
          if (response && response.ok) {
            cache.put(cacheKey, response.clone()).catch(() => undefined);
          }
          return response;
        })
        .catch(() => undefined);
      if (cached) return cached;
      const fresh = await refresh;
      if (fresh) return fresh;
      return new Response(JSON.stringify({ error: "offline" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    })()
  );
});
