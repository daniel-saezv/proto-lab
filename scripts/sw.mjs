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
  const id = createHash("sha256").update(`shell-v3\n${shell.join("|")}`).digest("hex").slice(0, 12);
  return `/* Proto Lab: precache de la shell. /protos/ y /api/ no se interceptan.
   Los JS con hash de un prototipo los cachea el navegador (Cache-Control immutable).
   HTML: red primero, para no servir la shell vieja tras un deploy.
   Assets con hash: caché primero. No se guarda un error ni el login de Access. */
const CACHE = ${JSON.stringify(`proto-lab-${id}`)};
const SHELL = ${JSON.stringify(shell, null, 2)};

function mustBypass(url, method) {
  if (method !== "GET") return true;
  if (url.origin !== self.location.origin) return true;
  if (url.pathname.startsWith("/protos/")) return true;
  if (url.pathname.startsWith("/api/")) return true;
  return false;
}

function isHashedAsset(pathname) {
  return /^\\/assets\\/[^/]+-[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9]+$/.test(pathname);
}

function isAccessHost(url) {
  return url.hostname === "cloudflareaccess.com" || url.hostname.endsWith(".cloudflareaccess.com");
}

async function isStoreable(response) {
  if (!response || response.status !== 200) return false;
  if (response.type === "opaque" || response.type === "opaqueredirect" || response.redirected) return false;
  let finalUrl;
  try {
    finalUrl = new URL(response.url);
  } catch {
    return false;
  }
  if (finalUrl.origin !== self.location.origin || isAccessHost(finalUrl)) return false;
  const type = (response.headers.get("content-type") || "").toLowerCase();
  if (type.includes("text/html")) {
    const peek = (await response.clone().text()).slice(0, 4000);
    if (/cloudflareaccess\\.com/i.test(peek)) return false;
  }
  return true;
}

async function store(cache, request, response) {
  if (!(await isStoreable(response))) return;
  await cache.put(request, response.clone());
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    for (const path of SHELL) {
      const response = await fetch(path, { credentials: "same-origin", cache: "reload" });
      if (!(await isStoreable(response))) throw new Error("unstorable");
      await cache.put(path, response);
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request, cacheKey) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request, { credentials: "same-origin", cache: "no-cache" });
    await store(cache, cacheKey || request, response);
    return response;
  } catch {
    const cached = await cache.match(cacheKey || request);
    if (cached) return cached;
    throw new Error("offline");
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached && cached.ok && cached.status === 200) return cached;
  const response = await fetch(request, { credentials: "same-origin" });
  await store(cache, request, response);
  return response;
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (mustBypass(url, event.request.method)) return;

  if (event.request.mode === "navigate" || url.pathname === "/" || url.pathname === "/index.html") {
    event.respondWith(networkFirst(event.request, "/index.html"));
    return;
  }

  if (!SHELL.includes(url.pathname)) return;

  if (isHashedAsset(url.pathname)) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  event.respondWith(networkFirst(event.request));
});
`;
}
