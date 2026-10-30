import { createHash } from "node:crypto";

export function isShellPath(pathname) {
  if (!pathname.startsWith("/")) return false;
  if (pathname.startsWith("/protos/")) return false;
  if (pathname.startsWith("/api/")) return false;
  if (pathname === "/sw.js") return false;
  if (pathname === "/_headers" || pathname === "/_routes.json") return false;
  return true;
}

export function renderServiceWorker(paths) {
  const shell = [...new Set(paths.filter(isShellPath))].sort();
  const id = createHash("sha256").update(shell.join("|")).digest("hex").slice(0, 12);
  return `/* Proto Lab: cachea solo la shell del laboratorio y los assets del mundo.
   /protos/ y /api/ no se interceptan: los prototipos se cargan siempre de la red. */
const CACHE = ${JSON.stringify(`proto-lab-shell-${id}`)};
const SHELL = ${JSON.stringify(shell, null, 2)};

function mustBypass(url, method) {
  if (method !== "GET") return true;
  if (url.origin !== self.location.origin) return true;
  if (url.pathname.startsWith("/protos/")) return true;
  if (url.pathname.startsWith("/api/")) return true;
  return false;
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (mustBypass(url, event.request.method)) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put("/index.html", copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match("/index.html").then((cached) => cached || Promise.reject(new Error("offline")))),
    );
    return;
  }

  if (!SHELL.includes(url.pathname)) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => {});
        }
        return response;
      });
    }),
  );
});
`;
}
