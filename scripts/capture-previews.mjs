import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { readCatalog } from "./catalog-lib.mjs";
import { encodePreviewClip, evenCrop, frameSpread, mediaDuration, motionSeek } from "./preview-encode.mjs";
import { PREVIEW_MOTION_FILE, assertPreviewMotionBuffer, writePreviewStamp } from "./preview-motion.mjs";
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
  return spawn("pnpm", ["preview"], { cwd: root, stdio: "inherit", env: process.env, detached: true });
}

function stopPreview(server) {
  if (!server || server.killed || server.pid == null) return;
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {
    try {
      server.kill("SIGTERM");
    } catch {
      // ya estaba cerrado
    }
  }
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

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForMotion(page) {
  // El segundo argumento de waitForFunction es el dato, no las opciones.
  await page
    .waitForFunction(() => {
      for (const node of document.querySelectorAll("canvas")) {
        const rect = node.getBoundingClientRect();
        if (rect.width > 32 && rect.height > 32) return true;
      }
      const text = document.body && document.body.innerText ? document.body.innerText.trim().length : 0;
      return text > 20;
    }, null, { timeout: 20_000 })
    .catch(() => undefined);
  const godot = await page.evaluate(() => document.documentElement.innerHTML.includes("GODOT_CONFIG")).catch(() => false);
  // Godot pinta el arranque enseguida. El juego llega con ready.
  await page
    .waitForFunction(() => window.__protoLabMotionReady === true, null, { timeout: godot ? 30_000 : 4_000 })
    .catch(() => undefined);
}

async function canvasCrop(page) {
  const box = await page.evaluate(() => {
    let best = null;
    for (const node of document.querySelectorAll("canvas")) {
      if (!(node instanceof HTMLCanvasElement)) continue;
      const rect = node.getBoundingClientRect();
      const area = rect.width * rect.height;
      if (rect.width <= 32 || rect.height <= 32) continue;
      if (!best || area > best.area) best = { x: rect.x, y: rect.y, width: rect.width, height: rect.height, area };
    }
    return best;
  });
  return evenCrop(box);
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

async function recordTake(browser, slug) {
  const dir = mkdtempSync(join(tmpdir(), "proto-preview-"));
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    recordVideo: { dir, size: { width: 390, height: 844 } },
  });
  await context.addInitScript(() => {
    window.__protoLabMotionReady = false;
    window.addEventListener("message", (event) => {
      const data = event.data;
      if (data && data.source === "proto-lab" && data.type === "ready") window.__protoLabMotionReady = true;
    });
  });
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/protos/${slug}/`, { waitUntil: "load", timeout: 45_000 });
    await waitForMotion(page);
    const crop = await canvasCrop(page);
    // Los últimos segundos son el juego ya en marcha; el arranque queda fuera del corte.
    await wait(5000);
    const video = page.video();
    await page.close();
    await context.close();
    const recorded = video ? await video.path() : "";
    if (!recorded) throw new Error(`${slug}: Playwright no dejó el vídeo de la preview`);
    const stable = join(tmpdir(), `proto-src-${slug}-${process.pid}.webm`);
    copyFileSync(recorded, stable);
    const duration = await mediaDuration(stable);
    const ss = motionSeek(duration);
    if (ss == null) throw new Error(`${slug}: la grabación dura ${duration.toFixed(2)} s`);
    const outPath = join(root, "protos", slug, PREVIEW_MOTION_FILE);
    const encodeAt = async (at, name) => {
      const part = join(root, "protos", slug, name);
      const encoded = await encodePreviewClip(stable, part, at, crop);
      const info = assertPreviewMotionBuffer(readFileSync(part), slug);
      let spread = 0;
      try {
        spread = await frameSpread(part);
      } catch {
        spread = 0;
      }
      return { part, encoded, info, spread, ss: at };
    };
    const first = await encodeAt(ss, ".preview-a.mp4");
    let chosen = first;
    if (first.spread < 1 && ss >= 1.5) {
      try {
        const second = await encodeAt(ss - 1.5, ".preview-b.mp4");
        if (second.spread > first.spread) chosen = second;
        else rmSync(second.part, { force: true });
      } catch {
        // El corte anterior no entra en el formato: nos quedamos con el final.
      }
    }
    if (chosen !== first) rmSync(first.part, { force: true });
    renameSync(chosen.part, outPath);
    const stamp = writePreviewStamp(join(root, "protos", slug));
    console.log(
      `Clip: ${outPath} (${chosen.encoded.size} bytes, crf ${chosen.encoded.crf}, ${chosen.info.video?.fps.toFixed(2) ?? "?"} fps, grabación ${duration.toFixed(2)} s, corte ${chosen.ss.toFixed(2)} s, sello ${stamp.slice(0, 8)})`,
    );
  } finally {
    await context.close().catch(() => undefined);
    rmSync(dir, { recursive: true, force: true });
    rmSync(join(tmpdir(), `proto-src-${slug}-${process.pid}.webm`), { force: true });
    rmSync(join(root, "protos", slug, ".preview-a.mp4"), { force: true });
    rmSync(join(root, "protos", slug, ".preview-b.mp4"), { force: true });
  }
}

async function recordMotion(browser, slug) {
  let lastError = new Error(`${slug}: no se pudo grabar la preview`);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await recordTake(browser, slug);
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.log(`${slug}: intento ${attempt + 1} sin clip (${lastError.message})`);
    }
  }
  throw lastError;
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
  process.env.PROTO_LAB_SKIP_PREVIEW_CHECK = "1";
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
      await recordMotion(browser, entry.slug);
    }
  } finally {
    await browser.close();
    if (server) {
      stopPreview(server);
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
