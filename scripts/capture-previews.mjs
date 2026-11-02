import { spawn } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { readCatalog } from "./catalog-lib.mjs";
import { chooseClip } from "./preview-shot.mjs";

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

async function settle(page) {
  await page.waitForFunction(() => document.readyState === "complete" && document.body != null, { timeout: 20_000 });
  await page.evaluate(async () => {
    const hook = window.__protoLabPreview;
    if (typeof hook === "function") await hook();
    await new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(undefined)));
    });
  });
}

async function visibleCanvasBoxes(page) {
  return page.locator("canvas").evaluateAll((nodes) =>
    nodes.flatMap((node) => {
      if (!(node instanceof HTMLCanvasElement)) return [];
      const style = getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return [];
      const rect = node.getBoundingClientRect();
      return [{ x: rect.x, y: rect.y, width: rect.width, height: rect.height }];
    }),
  );
}

async function writeShot(page, outPath, clip) {
  let quality = 74;
  const shot = async () => {
    const options = { path: outPath, type: "webp", quality };
    if (clip) options.clip = clip;
    await page.screenshot(options);
  };
  await shot();
  while (statSync(outPath).size > 150 * 1024 && quality > 42) {
    quality -= 8;
    await shot();
  }
  return quality;
}

async function captureSlug(browser, slug, previewName) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    await page.goto(`${baseUrl}/protos/${slug}/`, { waitUntil: "load" });
    await settle(page);
    const viewport = page.viewportSize() ?? { width: 390, height: 844 };
    const clip = chooseClip(await visibleCanvasBoxes(page), viewport);
    const outPath = join(root, "protos", slug, previewName);
    const quality = await writeShot(page, outPath, clip);
    const where = clip ? "canvas" : "ventana";
    console.log(`Vista previa (${where}): ${outPath} (${statSync(outPath).size} bytes, calidad ${quality})`);
  } finally {
    await page.close();
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

async function main() {
  const preview = spawn("pnpm", ["build"], { cwd: root, stdio: "inherit", env: process.env });
  await new Promise((resolve, reject) => {
    preview.on("exit", (code) => (code === 0 ? resolve(undefined) : reject(new Error(`build falló: ${code}`))));
  });

  const server = startPreview();
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
  });
  try {
    await waitForServer(baseUrl);
    const entries = readCatalog(root);
    for (const entry of entries) {
      const previewName = entry.preview ?? "preview.webp";
      if (!entry.preview) ensureProtoField(entry.slug, previewName);
      await captureSlug(browser, entry.slug, previewName);
      if (!existsSync(join(root, "protos", entry.slug, previewName))) {
        throw new Error(`No se generó protos/${entry.slug}/${previewName}`);
      }
    }
  } finally {
    await browser.close();
    if (server && !server.killed) {
      server.kill("SIGTERM");
      await new Promise((resolve) => {
        server.once("exit", resolve);
        setTimeout(resolve, 2000);
      });
    }
  }
}

function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

if (invokedDirectly()) {
  await main();
}
