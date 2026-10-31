import { spawn } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
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
    await page.goto(`${baseUrl}/protos/${slug}/`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("canvas", { timeout: 20_000 });
    await page.waitForFunction(() => typeof window.__chispa?.drop === "function", { timeout: 20_000 });
    await page.waitForTimeout(1400);
    await page.evaluate(async () => {
      const api = window.__chispa;
      if (!api) return;
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      for (const tier of [0, 1, 2, 3, 4]) api.spawnPair(tier);
      const width = 540;
      const xs = [0.22, 0.38, 0.5, 0.62, 0.78, 0.3, 0.7].map((t) => Math.round(width * t));
      for (const x of xs) {
        api.drop(x);
        await wait(280);
      }
    });
    await page.waitForTimeout(1800);
    const outPath = join(root, "protos", slug, previewName);
    const box = await page.locator("canvas").boundingBox();
    if (!box) throw new Error(`Sin canvas en ${slug}`);
    const clipHeight = Math.max(120, Math.round(box.width / 1.6));
    const clip = {
      x: Math.round(box.x),
      y: Math.round(Math.max(box.y, box.y + box.height - clipHeight)),
      width: Math.round(box.width),
      height: Math.round(Math.min(clipHeight, box.height)),
    };
    let quality = 74;
    await page.screenshot({ path: outPath, type: "webp", quality, clip });
    while (statSync(outPath).size > 150 * 1024 && quality > 42) {
      quality -= 8;
      await page.screenshot({ path: outPath, type: "webp", quality, clip });
    }
    console.log(`Vista previa: ${outPath} (${statSync(outPath).size} bytes, calidad ${quality})`);
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
  if (server && !server.killed) {
    server.kill("SIGTERM");
    await new Promise((resolve) => {
      server.once("exit", resolve);
      setTimeout(resolve, 2000);
    });
  }
}
process.exit(0);
