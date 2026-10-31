import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { defineConfig, type Plugin } from "vite";

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
};

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
        createReadStream(file).pipe(res);
      });
    },
  };
}

function devApi(): Plugin {
  return {
    name: "proto-lab-dev-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/api/proposals", async (req, res) => {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        const body = Buffer.concat(chunks).toString("utf8");
        const headers = new Headers();
        for (const [key, value] of Object.entries(req.headers)) {
          if (typeof value === "string") headers.set(key, value);
        }
        const handlerUrl = pathToFileURL(`${repoRoot}/functions/_lib/handler.ts`).href;
        const { handleProposal } = (await import(handlerUrl)) as typeof import("../../functions/_lib/handler.ts");
        const slugs = JSON.parse(readFileSync(`${repoRoot}/functions/_lib/slugs.json`, "utf8")) as string[];
        const request = new Request("http://127.0.0.1/api/proposals", {
          method: req.method,
          headers,
          body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
        });
        const response = await handleProposal(
          request,
          { GITHUB_TOKEN: process.env.GITHUB_TOKEN, ALLOW_DEV_AUTH: process.env.ALLOW_DEV_AUTH },
          { knownSlugs: slugs },
        );
        res.statusCode = response.status;
        response.headers.forEach((value, key) => res.setHeader(key, value));
        res.end(Buffer.from(await response.arrayBuffer()));
      });
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
  plugins: [devApi(), serveProtos(), allowPrototypeCors()],
});
