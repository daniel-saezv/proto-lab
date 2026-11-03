/**
 * Sirve un export y mide el arranque en Chromium con la CSP real del
 * laboratorio (wasm incluido, sin COOP ni COEP). No es un iPhone.
 *
 *   node medida/medir-carga.mjs <directorio-con-index.html> --out medida-carga.json
 */
import { createServer } from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { extname, join, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cpus, platform, release, totalmem } from "node:os";
import { baseContentSecurityPolicy, cspWithWasm } from "../scripts/proto-csp.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const headerSource = readFileSync(join(repoRoot, "apps/world/public/_headers"), "utf8");
const csp = cspWithWasm(baseContentSecurityPolicy(headerSource));

const MIME = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".wasm", "application/wasm"],
  [".pck", "application/octet-stream"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".json", "application/json"],
  [".webmanifest", "application/manifest+json"],
  [".ico", "image/x-icon"],
]);

function contentType(pathname) {
  if (pathname.endsWith(".js")) return "text/javascript; charset=utf-8";
  return MIME.get(extname(pathname).toLowerCase()) ?? "application/octet-stream";
}

function startServer(rootDir) {
  const root = normalize(rootDir);
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith("/")) pathname += "index.html";
    const file = normalize(join(root, pathname));
    if (!file.startsWith(root)) {
      res.writeHead(403);
      res.end();
      return;
    }
    let body;
    try {
      body = readFileSync(file);
    } catch {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("no encontrado");
      return;
    }
    res.writeHead(200, {
      "content-type": contentType(pathname),
      "content-length": body.length,
      "x-content-type-options": "nosniff",
      "content-security-policy": csp,
      "cache-control": "no-cache",
    });
    res.end(body);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, port: address.port });
    });
  });
}

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index < 0) return null;
  return process.argv[index + 1] ?? null;
}

const dir = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
if (!dir) {
  console.error("Uso: node medida/medir-carga.mjs <directorio> [--out archivo.json]");
  process.exit(1);
}

const require = createRequire(process.env.PLAYWRIGHT_MODULE ?? import.meta.url);
const { chromium } = require("playwright");
const { server, port } = await startServer(dir);
const errors = [];
const browser = await chromium.launch({
  args: ["--enable-precise-memory-info", "--disable-dev-shm-usage"],
});

let report;
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push({ kind: "pageerror", text: String(error).slice(0, 500) }));
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      errors.push({ kind: msg.type(), text: msg.text().slice(0, 500) });
    }
  });
  page.on("requestfailed", (request) => {
    errors.push({ kind: "requestfailed", text: `${request.url()} ${request.failure()?.errorText ?? ""}`.slice(0, 500) });
  });

  const started = Date.now();
  let bootError = null;
  try {
    await page.goto(`http://127.0.0.1:${port}/index.html`, {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });
    await page.waitForFunction(() => window.__medidaLista === true, { timeout: 120_000 });
  } catch (error) {
    bootError = String(error).slice(0, 800);
  }
  const bootMs = Date.now() - started;
  await page.screenshot({ path: "medida-arranque.png" }).catch(() => {});

  let touch = { ok: false };
  if (!bootError) {
    try {
      await page.touchscreen.tap(195, 420);
      await page.waitForFunction(() => window.__medidaToques >= 1, { timeout: 8_000 });
      touch = { ok: true, toques: await page.evaluate(() => window.__medidaToques) };
      await page.screenshot({ path: "medida-toque.png" }).catch(() => {});
    } catch (error) {
      touch = { ok: false, error: String(error).slice(0, 500) };
      await page.screenshot({ path: "medida-toque.png" }).catch(() => {});
    }
  }

  const pageFacts = await page.evaluate(() => {
    const resources = performance.getEntriesByType("resource").map((entry) => ({
      name: entry.name.split("/").pop()?.split("?")[0] ?? entry.name,
      type: entry.initiatorType,
      durationMs: Math.round(entry.duration),
      transferSize: entry.transferSize,
      encodedBodySize: entry.encodedBodySize,
      decodedBodySize: entry.decodedBodySize,
    }));
    const canvas = document.querySelector("canvas");
    return {
      crossOriginIsolated: self.crossOriginIsolated,
      userAgent: navigator.userAgent,
      heap: performance.memory
        ? {
            usedJSHeapSize: performance.memory.usedJSHeapSize,
            totalJSHeapSize: performance.memory.totalJSHeapSize,
            jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
          }
        : null,
      canvas: canvas ? { width: canvas.width, height: canvas.height } : null,
      text: (document.body?.innerText ?? "").slice(0, 800),
      resources,
    };
  });

  let cdpHeap = null;
  try {
    const session = await context.newCDPSession(page);
    const metrics = await session.send("Performance.getMetrics");
    cdpHeap = Object.fromEntries(
      metrics.metrics
        .filter((item) => /Heap|JSEventListeners|Nodes|Documents/.test(item.name))
        .map((item) => [item.name, item.value]),
    );
  } catch (error) {
    cdpHeap = { error: String(error).slice(0, 300) };
  }

  report = {
    measuredAt: new Date().toISOString(),
    note: "Chromium de CI, viewport 390×844, deviceScaleFactor 2, táctil. No es Safari ni un iPhone. Localhost: la duración de red no representa un móvil.",
    cspHasWasm: csp.includes("wasm-unsafe-eval"),
    cspHasCoop: /cross-origin-opener-policy/i.test(csp),
    host: { platform: platform(), release: release(), cpus: cpus().length, totalMemBytes: totalmem() },
    bootMs,
    bootError,
    touch,
    ...pageFacts,
    cdpHeap,
    errors: errors.slice(0, 40),
  };
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const json = `${JSON.stringify(report, null, 2)}\n`;
const out = argValue("--out");
if (out) writeFileSync(out, json);
process.stdout.write(json);
if (report.bootError) process.exit(2);
