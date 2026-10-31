import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { readCatalog } from "./catalog-lib.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = process.env.PREVIEW_URL ?? "http://127.0.0.1:4173";

function waitForServer(url, timeoutMs = 120_000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const response = await fetch(url);
        if (response.ok) {
          resolve();
          return;
        }
      } catch {
        // servidor aún no listo
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`No responde ${url} a tiempo`));
        return;
      }
      setTimeout(tick, 500);
    };
    void tick();
  });
}

function startPreview() {
  if (process.env.PREVIEW_URL) return null;
  return spawn("pnpm", ["preview"], { cwd: root, stdio: "inherit", env: process.env });
}

async function captureSlug(slug, previewName) {
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(`${baseUrl}/protos/${slug}/`, { waitUntil: "networkidle" });
    await page.waitForSelector("canvas", { timeout: 20_000 });
    await page.waitForTimeout(1200);
    await page.evaluate(() => {
      const api = window.__chispa;
      api?.drop?.(270);
    });
    await page.waitForTimeout(900);
    const outPath = join(root, "protos", slug, previewName);
    await page.locator("canvas").screenshot({ path: outPath, type: "webp", quality: 82 });
    console.log(`Vista previa: ${outPath}`);
  } finally {
    await browser.close();
  }
}

function ensureProtoField(slug, previewName) {
  const manifestPath = join(root, "protos", slug, "proto.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.preview !== previewName) {
    manifest.preview = previewName;
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }
}

const preview = spawn("pnpm", ["build"], { cwd: root, stdio: "inherit", env: process.env });
await new Promise((resolve, reject) => {
  preview.on("exit", (code) => (code === 0 ? resolve(undefined) : reject(new Error(`build falló: ${code}`))));
});

const server = startPreview();
try {
  await waitForServer(baseUrl);
  const entries = readCatalog(root);
  for (const entry of entries) {
    const previewName = entry.preview ?? "preview.webp";
    if (!entry.preview) ensureProtoField(entry.slug, previewName);
    await captureSlug(entry.slug, previewName);
    if (!existsSync(join(root, "protos", entry.slug, previewName))) {
      throw new Error(`No se generó protos/${entry.slug}/${previewName}`);
    }
  }
} finally {
  if (server) {
    server.kill("SIGTERM");
  }
}
process.exit(0);
