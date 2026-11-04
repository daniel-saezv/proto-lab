import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
import { SHOT_PROFILES, buildContactSheetHtml, contactSheetName, selectorRow, shotFileName } from "./shot-sheet.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] ?? fallback;
}

function waitForServer(url, timeoutMs = 120_000) {
  const start = Date.now();
  return new Promise((resolveReady, reject) => {
    const tick = async () => {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
        if (response.status < 500) {
          resolveReady();
          return;
        }
      } catch {
        // sigue arrancando
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`No responde ${url} a tiempo`));
        return;
      }
      setTimeout(tick, 400);
    };
    void tick();
  });
}

async function detectServer() {
  if (process.env.SHOTS_URL) return { url: process.env.SHOTS_URL.replace(/\/$/, ""), owned: null };
  for (const url of ["http://127.0.0.1:5173", "http://127.0.0.1:4173"]) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (response.status < 500) return { url, owned: null };
    } catch {
      // prueba el siguiente
    }
  }
  const child = spawn("pnpm", ["dev"], { cwd: root, stdio: "inherit", env: process.env });
  await waitForServer("http://127.0.0.1:5173");
  return { url: "http://127.0.0.1:5173", owned: child };
}

async function captureProfile(browser, baseUrl, profile, viewpoints, outDir, prefix, debug) {
  const context = await browser.newContext({
    viewport: { width: profile.width, height: profile.height },
    isMobile: profile.mobile,
    hasTouch: profile.mobile,
    deviceScaleFactor: 1,
    locale: "es-ES",
  });
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: "reduce" });
  const files = [];
  try {
    await page.goto(`${baseUrl}/?e2e=1`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-testid='world-ready']", { timeout: 30_000 });
    await page.waitForTimeout(350);
    for (const view of viewpoints) {
      const ok = await page.evaluate((id) => window.__protoLab?.setViewpoint?.(id) ?? false, view.id);
      if (!ok) throw new Error(`No se pudo encuadrar ${view.id}`);
      await page.waitForTimeout(280);
      const file = shotFileName(prefix, view.id, profile.id);
      await page.screenshot({ path: join(outDir, file) });
      files.push({ view, file });
    }
    if (debug) {
      await page.evaluate(() => window.__protoLab?.setDebug?.(true));
      await page.evaluate(() => window.__protoLab?.setViewpoint?.("overview"));
      await page.waitForTimeout(280);
      const file = shotFileName(prefix, "debug", profile.id);
      await page.screenshot({ path: join(outDir, file) });
      files.push({ view: { id: "debug", label: "Depuración" }, file });
      await page.evaluate(() => window.__protoLab?.setDebug?.(false));
    }
    await page.evaluate(() => window.__protoLab?.setViewpoint?.("arcade"));
    await page.waitForTimeout(250);
    const interact = page.getByTestId("interact");
    await interact.click();
    await page.getByTestId("game-selector").waitFor({ state: "visible" });
    await page.waitForTimeout(200);
    const selectorFile = shotFileName(prefix, "selector", profile.id);
    await page.screenshot({ path: join(outDir, selectorFile) });
    files.push({ view: { id: "selector", label: "Selector" }, file: selectorFile });
  } finally {
    await context.close();
  }
  return files;
}

async function composeSheet(outDir, prefix, viewpoints, debug) {
  const rows = viewpoints.map((view) => ({
    id: view.id,
    label: view.label,
    cells: SHOT_PROFILES.map((profile) => ({
      profileId: profile.id,
      file: shotFileName(prefix, view.id, profile.id),
    })),
  }));
  if (debug) {
    rows.push({
      id: "debug",
      label: "Depuración",
      cells: SHOT_PROFILES.map((profile) => ({ profileId: profile.id, file: shotFileName(prefix, "debug", profile.id) })),
    });
  }
  rows.push(selectorRow(prefix));
  const html = buildContactSheetHtml({
    title: prefix ? `Proto Lab · ${prefix}` : "Proto Lab · shots",
    columns: SHOT_PROFILES.map((item) => ({ id: item.id, label: item.label })),
    rows,
  });
  const htmlPath = join(outDir, prefix ? `${prefix}-contact-sheet.html` : "contact-sheet.html");
  writeFileSync(htmlPath, html);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1680, height: 900 } });
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle" });
    await page.screenshot({ path: join(outDir, contactSheetName(prefix)), fullPage: true });
  } finally {
    await browser.close();
  }
}

export async function captureShots(options = {}) {
  const outDir = resolve(options.outDir ?? argValue("--out", join(root, "shots")));
  const prefix = options.prefix ?? argValue("--prefix", "");
  const debug = options.debug ?? process.argv.includes("--debug");
  mkdirSync(outDir, { recursive: true });
  const server = await detectServer();
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
  });
  try {
    const probe = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await probe.newPage();
    await page.goto(`${server.url}/?e2e=1`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-testid='world-ready']", { timeout: 30_000 });
    const viewpoints = await page.evaluate(() => window.__protoLab?.viewpoints?.() ?? []);
    await probe.close();
    if (!Array.isArray(viewpoints) || viewpoints.length === 0) {
      throw new Error("El laboratorio no expone puntos de cámara. Hace falta ?e2e=1 y la build actual.");
    }
    for (const profile of SHOT_PROFILES) {
      const files = await captureProfile(browser, server.url, profile, viewpoints, outDir, prefix, debug);
      console.log(`Perfil ${profile.id}: ${files.length} tomas`);
    }
    await composeSheet(outDir, prefix, viewpoints, debug);
    console.log(`Hoja de contacto: ${join(outDir, contactSheetName(prefix))}`);
  } finally {
    await browser.close();
    if (server.owned) server.owned.kill("SIGTERM");
  }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  await captureShots();
}
