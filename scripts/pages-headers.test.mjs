import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { headersForPath, parsePagesHeaders, sealPagesHeaders } from "./pages-headers.mjs";
import { permissionsPolicy } from "./proto-csp.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "apps/world/public/_headers"), "utf8");
const rules = parsePagesHeaders(source);

function cacheOf(pathname) {
  return headersForPath(rules, pathname).get("cache-control")?.value ?? "";
}

describe("cabeceras de Pages", () => {
  it("usa un solo splat por regla", () => {
    for (const rule of rules) {
      expect(rule.pattern.split("*").length - 1).toBeLessThanOrEqual(1);
    }
  });

  it("deja la CSP de la app sin pisar la del prototipo y cachea solo lo que tiene hash", () => {
    const home = headersForPath(rules, "/");
    const csp = home.get("content-security-policy")?.value ?? "";
    expect(csp).toContain("frame-src 'self'");
    expect(csp).not.toContain("frame-src blob:");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).not.toContain("frame-ancestors 'none'");
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain("wasm-unsafe-eval");
    expect(csp).toContain("form-action 'none'");
    expect(source.toLowerCase()).not.toContain("cross-origin-opener-policy");
    expect(source.toLowerCase()).not.toContain("cross-origin-embedder-policy");
    expect(csp).toContain("media-src 'self' blob:");
    expect(csp).not.toContain("connect-src 'none'");
    expect(home.get("x-content-type-options")?.value).toBe("nosniff");
    expect(home.get("referrer-policy")?.value).toBe("no-referrer");
    const delegated = permissionsPolicy({ delegateAll: true });
    expect(home.get("permissions-policy")?.value).toBe(delegated);
    expect(headersForPath(rules, "/index.html").get("permissions-policy")?.value).toBe(delegated);
    expect(delegated).toContain("camera=(self)");
    expect(delegated).toContain("payment=()");
    expect(delegated).not.toContain("camera=()");
    for (const path of ["/sw.js", "/manifest.webmanifest", "/assets/index-Abcd1234.js", "/api/proposals", "/protos/chispa/", "/protos/audio/luanda.m4a"]) {
      const policy = headersForPath(rules, path).get("permissions-policy")?.value ?? "";
      expect(policy, path).toContain("camera=()");
      expect(policy, path).not.toContain("(self)");
    }
    expect(home.get("x-frame-options")?.value).toBe("DENY");
    expect(cacheOf("/")).toMatch(/no-cache/);
    expect(cacheOf("/index.html")).toMatch(/no-cache/);
    expect(cacheOf("/sw.js")).toMatch(/no-cache/);
    expect(cacheOf("/manifest.webmanifest")).toMatch(/no-cache/);
    expect(cacheOf("/assets/index-Abcd1234.js")).toBe("public, max-age=31536000, immutable");
    expect(cacheOf("/protos/chispa/index.html")).toMatch(/no-cache/);
    expect(cacheOf("/protos/chispa/")).toMatch(/no-cache/);
    expect(headersForPath(rules, "/protos/chispa/").has("x-frame-options")).toBe(false);
    expect(headersForPath(rules, "/protos/chispa/index.html").has("x-frame-options")).toBe(false);
    expect(headersForPath(rules, "/protos/chispa/assets/index-Abcd1234.js").has("x-frame-options")).toBe(false);
    expect(cacheOf("/protos/chispa/assets/index-Abcd1234.js")).toBe("public, max-age=31536000, immutable");
    expect(cacheOf("/protos/audio/luanda.m4a")).toBe("public, max-age=31536000, immutable");
    expect(cacheOf("/protos/audio/luanda.abc12345.m4a")).toBe("public, max-age=31536000, immutable");
    expect(cacheOf("/api/proposals/status")).toBe("no-store");
    expect(source.match(/\/protos\/audio\/\*\.m4a/g)).toHaveLength(1);
  });

  it("no deja que writeHead ni setHeader sustituyan la caché de Pages", async () => {
    const immutable = await respond((res) => {
      sealPagesHeaders(res, headersForPath(rules, "/protos/audio/luanda.aba4ff46.m4a"));
      res.writeHead(200, {
        "Content-Type": "audio/mp4",
        "Cache-Control": "no-cache",
        ETag: 'W/"1"',
      });
      res.end("ok");
    });
    expect(immutable["cache-control"]).toBe("public, max-age=31536000, immutable");
    expect(immutable["content-type"]).toMatch(/audio\/mp4/);
    expect(immutable.etag).toBe('W/"1"');

    const forced = await respond((res) => {
      sealPagesHeaders(res, headersForPath(rules, "/protos/chispa/assets/index-Abcd1234.js"));
      res.setHeader("Cache-Control", "no-cache");
      res.removeHeader("Cache-Control");
      res.writeHead(200, "OK", { "Content-Type": "text/javascript", "Cache-Control": "no-store" });
      res.end("ok");
    });
    expect(forced["cache-control"]).toBe("public, max-age=31536000, immutable");
    expect(forced["content-type"]).toMatch(/javascript/);
    expect(forced["content-security-policy"]).toContain("frame-src 'self'");
    expect(forced["content-security-policy"]).toContain("frame-ancestors 'self'");

    const html = await respond((res) => {
      sealPagesHeaders(res, headersForPath(rules, "/protos/chispa/"));
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.writeHead(200);
      res.end("ok");
    });
    expect(html["cache-control"]).toMatch(/no-cache/);
  });
});

function respond(handler) {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      try {
        handler(res);
      } catch (error) {
        res.statusCode = 500;
        res.end(String(error));
      }
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      fetch(`http://127.0.0.1:${port}/`, { headers: { "accept-encoding": "identity" } })
        .then(async (response) => {
          await response.arrayBuffer();
          const headers = {};
          response.headers.forEach((value, key) => {
            headers[key] = value;
          });
          resolve(headers);
        })
        .catch(reject)
        .finally(() => server.close());
    });
  });
}
