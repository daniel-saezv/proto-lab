/**
 * Capturas reales del laboratorio para el manifiesto PWA.
 * No entra en `pnpm build` ni en CI. Uso manual: `pnpm screenshots`
 * (construye el sitio, arranca `pnpm preview` y escribe apps/world/public/screenshots/).
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "apps/world/public/screenshots");
const manifestPath = join(root, "apps/world/public/manifest.webmanifest");
const baseUrl = process.env.SCREENSHOTS_URL ?? "http://127.0.0.1:4173";
const maxBytes = 500 * 1024;

const shots = [
  {
    file: "lab-narrow.webp",
    form_factor: "narrow",
    label: "El laboratorio en el móvil",
    viewport: { width: 540, height: 960 },
    deviceScaleFactor: 2,
    mobile: true,
    view: "spawn",
  },
  {
    file: "lab-wide.webp",
    form_factor: "wide",
    label: "El laboratorio en el escritorio",
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1.5,
    mobile: false,
    view: "spawn",
  },
  {
    file: "arcade-wide.webp",
    form_factor: "wide",
    label: "La máquina de prototipos",
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1.5,
    mobile: false,
    view: "arcade",
  },
];

function waitForServer(url, timeoutMs = 120_000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
        if (response.status < 500) {
          resolve();
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

function run(command, args) {
  const child = spawn(command, args, { cwd: root, stdio: "inherit", env: process.env });
  return new Promise((resolve, reject) => {
    child.on("exit", (code) => (code === 0 ? resolve(undefined) : reject(new Error(`${command} ${args.join(" ")} salió con ${code}`))));
  });
}

async function hideTransientUi(page) {
  await page.evaluate(() => {
    for (const id of ["hint", "interact"]) {
      const element = document.getElementById(id);
      if (element) element.hidden = true;
    }
    document.querySelectorAll(".speech-bubble").forEach((element) => {
      element.style.display = "none";
    });
    document.querySelectorAll(".nameplate").forEach((element) => {
      const rect = element.getBoundingClientRect();
      const clipped =
        rect.width < 8 ||
        rect.left < 4 ||
        rect.top < 4 ||
        rect.right > window.innerWidth - 4 ||
        rect.bottom > window.innerHeight - 4;
      if (clipped) element.style.visibility = "hidden";
    });
  });
}

async function captureShot(browser, shot) {
  const context = await browser.newContext({
    viewport: shot.viewport,
    deviceScaleFactor: shot.deviceScaleFactor,
    isMobile: shot.mobile,
    hasTouch: shot.mobile,
    locale: "es-ES",
  });
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/?e2e=1`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-testid='world-ready']", { timeout: 30_000 });
    await page.waitForSelector("[data-testid='loading']", { state: "hidden", timeout: 30_000 });
    const framed = await page.evaluate((id) => window.__protoLab?.setViewpoint?.(id) === true, shot.view);
    if (!framed) throw new Error(`No se pudo encuadrar ${shot.view}`);
    await page.waitForTimeout(900);
    await hideTransientUi(page);
    if (shot.mobile) {
      const joystick = page.locator("[data-testid='joystick']");
      if (!(await joystick.isVisible())) throw new Error("El joystick no está visible en la captura estrecha");
    }
    const path = join(outDir, shot.file);
    let quality = 80;
    await page.screenshot({ path, type: "webp", quality });
    while (statSync(path).size > maxBytes && quality > 40) {
      quality -= 8;
      await page.screenshot({ path, type: "webp", quality });
    }
    const bytes = statSync(path).size;
    if (bytes > maxBytes) throw new Error(`${shot.file} pesa ${bytes} bytes`);
    const box = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
    const expected = {
      width: Math.round(shot.viewport.width * shot.deviceScaleFactor),
      height: Math.round(shot.viewport.height * shot.deviceScaleFactor),
    };
    if (box.width !== shot.viewport.width || box.height !== shot.viewport.height) {
      throw new Error(`Viewport inesperado en ${shot.file}: ${box.width}x${box.height}`);
    }
    console.log(`${shot.file}: ${expected.width}x${expected.height}, ${bytes} bytes, calidad ${quality}`);
    return {
      src: `/screenshots/${shot.file}`,
      sizes: `${expected.width}x${expected.height}`,
      type: "image/webp",
      form_factor: shot.form_factor,
      label: shot.label,
    };
  } finally {
    await context.close();
  }
}

if (!process.env.SCREENSHOTS_URL) {
  await run("pnpm", ["build"]);
}

mkdirSync(outDir, { recursive: true });
const owned = process.env.SCREENSHOTS_URL
  ? null
  : spawn("pnpm", ["preview"], { cwd: root, stdio: "inherit", env: process.env, detached: true });

try {
  await waitForServer(baseUrl);
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
  });
  try {
    const screenshots = [];
    for (const shot of shots) screenshots.push(await captureShot(browser, shot));
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.screenshots = screenshots;
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log("Manifiesto actualizado con screenshots.");
  } finally {
    await browser.close();
  }
} finally {
  if (owned && owned.pid && !owned.killed) {
    try {
      process.kill(-owned.pid, "SIGTERM");
    } catch {
      owned.kill("SIGTERM");
    }
    await new Promise((resolve) => {
      owned.once("exit", resolve);
      setTimeout(resolve, 2000);
    });
  }
}
