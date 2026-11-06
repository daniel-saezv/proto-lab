import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { defineConfig, type Plugin, type HtmlTagDescriptor } from "vite";
import { headersForPath, sealPagesHeaders } from "../../scripts/pages-headers.mjs";
import { pagesHeaderRules } from "../../scripts/proto-csp.mjs";

const worldDir = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(worldDir, "../..");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".webmanifest": "application/manifest+json",
  ".m4a": "audio/mp4",
  ".md": "text/plain; charset=utf-8",
};

const headerRules = pagesHeaderRules(repoRoot);

function applyDevCsp(res: { setHeader(name: string, value: string): void }, pathname: string) {
  const headers = headersForPath(headerRules, pathname);
  const csp = headers.get("content-security-policy");
  if (csp) res.setHeader(csp.name, csp.value);
  const policy = headers.get("permissions-policy");
  if (policy) res.setHeader(policy.name, policy.value);
}

function applyPagesHeaders(): Plugin {
  return {
    name: "proto-lab-pages-headers",
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url ?? "/").split("?")[0] || "/";
        sealPagesHeaders(res, headersForPath(headerRules, pathname));
        next();
      });
    },
  };
}

function allowPrototypeCors(): Plugin {
  return {
    name: "proto-lab-proto-cors",
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (!url.startsWith("/protos/")) {
          next();
          return;
        }
        const writeHead = res.writeHead.bind(res);
        res.writeHead = ((...args: Parameters<typeof res.writeHead>) => {
          res.setHeader("access-control-allow-origin", "*");
          return writeHead(...args);
        }) as typeof res.writeHead;
        next();
      });
    },
  };
}

function serveProtos(): Plugin {
  return {
    name: "proto-lab-protos",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        const match = url.match(/^\/protos\/([a-z0-9-]+)(\/.*)?$/);
        if (!match) {
          next();
          return;
        }
        const slug = match[1] ?? "";
        let rel = match[2] || "/";
        if (rel.endsWith("/")) rel += "index.html";
        if (slug === "audio") {
          const base = resolve(worldDir, "public/protos/audio");
          const file = resolve(base, rel.replace(/^\//, ""));
          const basePrefix = base.endsWith(sep) ? base : `${base}${sep}`;
          if (!file.startsWith(basePrefix) || !existsSync(file) || statSync(file).isDirectory()) {
            res.statusCode = 404;
            res.end("No está esa pista.");
            return;
          }
          const ext = file.slice(file.lastIndexOf("."));
          res.setHeader("content-type", MIME[ext] ?? "application/octet-stream");
          res.setHeader("cache-control", "public, max-age=86400");
          applyDevCsp(res, url);
          createReadStream(file).pipe(res);
          return;
        }
        const base = resolve(repoRoot, "protos", slug, "dist");
        const file = resolve(base, rel.replace(/^\//, ""));
        const basePrefix = base.endsWith(sep) ? base : `${base}${sep}`;
        if (!file.startsWith(basePrefix) || !existsSync(file) || statSync(file).isDirectory()) {
          res.statusCode = 404;
          res.end("Ese prototipo no está construido. Desde la raíz del repo ejecuta pnpm dev.");
          return;
        }
        const ext = file.slice(file.lastIndexOf("."));
        res.setHeader("content-type", MIME[ext] ?? "application/octet-stream");
        res.setHeader("cache-control", "no-cache");
        res.setHeader("access-control-allow-origin", "*");
        applyDevCsp(res, url);
        createReadStream(file).pipe(res);
      });
    },
  };
}

function devPresence(): Plugin {
  return {
    name: "proto-lab-dev-presence",
    apply: "serve",
    async configureServer(server) {
      const [{ createMemoryPresence }, { WebSocketServer }] = await Promise.all([
        import("../../functions/_lib/presence-room.ts"),
        import("ws"),
      ]);
      const room = createMemoryPresence();
      const wss = new WebSocketServer({ noServer: true });
      server.httpServer?.on("upgrade", (req, socket, head) => {
        const path = (req.url ?? "").split("?")[0];
        if (path !== "/api/presence") return;
        wss.handleUpgrade(req, socket, head, (ws) => {
          const session = room.connect({
            send(data: string) {
              if (ws.readyState === ws.OPEN) ws.send(data);
            },
            close(code: number, reason: string) {
              try {
                ws.close(code, reason);
              } catch {
                // El navegador ya colgó.
              }
            },
          });
          ws.on("message", (data: unknown) => {
            const text = typeof data === "string" ? data : String(data);
            session.message(text);
          });
          ws.on("close", () => session.close());
          ws.on("error", () => session.close());
        });
      });
      server.httpServer?.on("close", () => {
        wss.close();
      });
    },
  };
}

function devApi(): Plugin {
  return {
    name: "proto-lab-dev-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (url !== "/api/proposals" && url !== "/api/proposals/status") {
          next();
          return;
        }
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        const body = Buffer.concat(chunks).toString("utf8");
        const headers = new Headers();
        for (const [key, value] of Object.entries(req.headers)) {
          if (typeof value === "string") headers.set(key, value);
        }
        const env = {
          GITHUB_TOKEN: process.env.GITHUB_TOKEN,
          GITHUB_STATUS_TOKEN: process.env.GITHUB_STATUS_TOKEN,
          CF_PAGES_READ_TOKEN: process.env.CF_PAGES_READ_TOKEN,
          CF_ACCOUNT_ID: process.env.CF_ACCOUNT_ID,
          CF_PAGES_PROJECT: process.env.CF_PAGES_PROJECT,
          ALLOW_DEV_AUTH: process.env.ALLOW_DEV_AUTH,
          CF_ACCESS_AUD: process.env.CF_ACCESS_AUD,
        };
        let response: Response;
        try {
          if (url === "/api/proposals/status") {
            const handlerUrl = pathToFileURL(`${repoRoot}/functions/_lib/status-handler.ts`).href;
            const { handleProposalStatus } = (await import(handlerUrl)) as typeof import("../../functions/_lib/status-handler.ts");
            response = await handleProposalStatus(
              new Request("http://127.0.0.1/api/proposals/status", {
                method: req.method,
                headers,
              }),
              env,
            );
          } else {
            const handlerUrl = pathToFileURL(`${repoRoot}/functions/_lib/handler.ts`).href;
            const { handleProposal } = (await import(handlerUrl)) as typeof import("../../functions/_lib/handler.ts");
            const slugs = JSON.parse(readFileSync(`${repoRoot}/functions/_lib/slugs.json`, "utf8")) as string[];
            response = await handleProposal(
              new Request("http://127.0.0.1/api/proposals", {
                method: req.method,
                headers,
                body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
              }),
              env,
              { knownSlugs: slugs },
            );
          }
        } catch (error) {
          // Node con --experimental-strip-types no resuelve imports sin extensión.
          // Un fallo del tablón no puede tumbar el WebSocket de presencia del mismo proceso.
          console.error(error);
          res.statusCode = 500;
          res.setHeader("content-type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ ok: false, error: "dev", message: "La API local no pudo cargar el handler." }));
          return;
        }
        res.statusCode = response.status;
        response.headers.forEach((value, key) => res.setHeader(key, value));
        res.end(Buffer.from(await response.arrayBuffer()));
      });
    },
  };
}

/** El mundo es un import dinámico. Sin esto el HTML no lo pide hasta que el entry termina. */
function preloadWorldChunk(): Plugin {
  return {
    name: "proto-lab-preload-world",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(_html, ctx) {
        const bundle = ctx.bundle;
        if (!bundle) return;
        const entries = new Set(
          Object.values(bundle)
            .filter((item) => item.type === "chunk" && item.isEntry)
            .map((item) => item.fileName),
        );
        const tags: HtmlTagDescriptor[] = [];
        const seen = new Set<string>();
        for (const item of Object.values(bundle)) {
          if (item.type !== "chunk" || !item.isDynamicEntry || item.name !== "world") continue;
          for (const fileName of [item.fileName, ...item.imports]) {
            if (seen.has(fileName) || entries.has(fileName)) continue;
            seen.add(fileName);
            tags.push({
              tag: "link",
              attrs: { rel: "modulepreload", crossorigin: true, href: `/${fileName}` },
              injectTo: "head",
            });
          }
        }
        return tags;
      },
    },
  };
}

export default defineConfig({
  root: worldDir,
  base: "/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 900,
  },
  server: {
    fs: { allow: [repoRoot] },
  },
  plugins: [devPresence(), devApi(), serveProtos(), allowPrototypeCors(), applyPagesHeaders(), preloadWorldChunk()],
});
