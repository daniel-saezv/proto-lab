import { devices, expect, test } from "@playwright/test";
import { skipUnlessChromium, skipUnlessWebKitIphone } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/proposals/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        partial: false,
        items: [
          {
            number: 7,
            title: "Cometa lunar",
            kind: "propuesta",
            slug: null,
            phase: "recibida",
            updatedAt: "2026-03-01T00:00:00Z",
          },
          {
            number: 8,
            title: "Chispas más rápidas",
            kind: "iteracion",
            slug: "chispa",
            phase: "preview_lista",
            updatedAt: "2026-03-02T00:00:00Z",
            previewUrl: "https://preview-test.proto-lab-3k6.pages.dev",
          },
        ],
      }),
    });
  });
  await page.route(/\/api\/proposals$/, async (route) => {
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        issueNumber: 1,
        issueUrl: "https://github.com/daniel-saezv/proto-lab/issues/1",
      }),
    });
  });
});

async function focusArcade(page: import("@playwright/test").Page) {
  await page.evaluate(() => window.__protoLab?.focus("arcade"));
  await expect(page.getByTestId("interact")).toHaveText("Usar la máquina");
}

async function openSelector(page: import("@playwright/test").Page, isMobile: boolean) {
  await focusArcade(page);
  const interact = page.getByTestId("interact");
  if (isMobile) await interact.tap();
  else await interact.click();
  await expect(page.getByTestId("game-selector")).toBeVisible();
}

async function playFromSelector(page: import("@playwright/test").Page, isMobile: boolean) {
  const play = page.getByTestId("selector-play");
  if (isMobile) await play.tap();
  else await play.click();
  await expect(page.getByTestId("prototype-chrome")).toBeVisible();
}

async function openInventorDialogue(page: import("@playwright/test").Page) {
  await page.evaluate(() => window.__protoLab?.focus("inventor"));
  await expect(page.getByTestId("interact")).toHaveText("Hablar con el Inventor");
  await page.getByTestId("interact").click();
  await expect(page.getByTestId("dialogue")).toBeVisible();
}

async function openInstallHelpFromInventor(page: import("@playwright/test").Page) {
  await openInventorDialogue(page);
  await page.getByTestId("choice-install").click();
  await expect(page.getByTestId("install-help")).toBeVisible();
}

async function waitForLobbyWhiteboard(page: import("@playwright/test").Page) {
  await page.goto("/?e2e=1");
  await expect(page.getByTestId("world-ready")).toBeVisible();
  await expect(page.locator("#viewport")).toHaveAttribute("data-whiteboard-items", "7,8", { timeout: 20_000 });
}

test("el tablón en la pizarra 3D refleja el estado simulado", async ({ page }) => {
  await waitForLobbyWhiteboard(page);
});

test("con un prototipo abierto el lobby deja de renderizar y la música sigue", async ({ page }, testInfo) => {
  skipUnlessChromium(testInfo, "el contador de frames se comprueba una sola vez");
  await page.goto("/?e2e=1");
  await expect(page.getByTestId("world-ready")).toBeVisible();
  await page.locator("#viewport canvas").click({ position: { x: 12, y: 96 } });
  await expect(page.getByTestId("mute-music")).toHaveAttribute("data-playback", "playing");
  const before = await page.evaluate(() => window.__protoLab?.renderFrame?.() ?? 0);
  await expect.poll(async () => page.evaluate(() => window.__protoLab?.renderFrame?.() ?? 0)).toBeGreaterThan(before);
  await page.evaluate(() => window.__protoLab?.openPrototype?.("chispa"));
  await expect(page.getByTestId("prototype-chrome")).toBeVisible();
  await expect(page.locator("#viewport")).toHaveAttribute("data-render-suspended", "1");
  await expect(page.getByTestId("mute-music")).toHaveAttribute("data-playback", "playing");
  const frozen = await page.evaluate(() => window.__protoLab?.renderFrame?.() ?? -1);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  expect(await page.evaluate(() => window.__protoLab?.renderFrame?.() ?? -1)).toBe(frozen);
  await page.getByTestId("close-prototype").click();
  await expect(page.locator("#viewport")).toHaveAttribute("data-render-suspended", "0");
  await expect(page.getByTestId("mute-music")).toHaveAttribute("data-playback", "playing");
  await expect.poll(async () => page.evaluate(() => window.__protoLab?.renderFrame?.() ?? 0)).toBeGreaterThan(frozen);
});

test("ver la pizarra encuadra la cámara y vuelve sin abrir un diálogo", async ({ page }) => {
  await page.goto("/?e2e=1");
  await expect(page.getByTestId("world-ready")).toBeVisible();
  await page.evaluate(() => window.__protoLab?.focus("chalkboard"));
  const interact = page.getByTestId("interact");
  await expect(interact).toHaveText("Ver la pizarra");
  await interact.click();
  await expect(page.getByTestId("dialogue")).toBeHidden();
  await expect(page.locator("#viewport")).toHaveAttribute("data-board-view", "1");
  await expect.poll(async () => page.evaluate(() => window.__protoLab?.whiteboardView?.() ?? null)).toMatchObject({
    phase: "hold",
    playerVisible: false,
  });
  const framed = await page.evaluate(() => window.__protoLab?.whiteboardView?.());
  expect(framed).toBeTruthy();
  expect(framed!.x).toBeCloseTo(-4.6, 0);
  expect(framed!.y).toBeCloseTo(1.55, 1);
  expect(framed!.z).toBeGreaterThan(-7.2);
  expect(framed!.z).toBeLessThan(-3);
  const preview = page.getByTestId("board-preview");
  await expect(preview).toHaveCount(1);
  await expect(preview).toBeVisible();
  await expect(preview).toHaveText("Probar la preview");
  await expect(preview).toHaveAttribute("href", "https://preview-test.proto-lab-3k6.pages.dev/");
  await expect(preview).toHaveAttribute("target", "_blank");
  await expect(preview).toHaveAttribute("rel", "noopener noreferrer");
  const back = page.getByTestId("board-back");
  await expect(back).toBeVisible();
  await expect(back).toHaveText("Volver");
  await back.click();
  await expect(page.locator("#viewport")).toHaveAttribute("data-board-view", "0");
  await expect(back).toBeHidden();
  await expect(preview).toBeHidden();
  await expect(interact).toHaveText("Ver la pizarra");
  await page.keyboard.press("e");
  await expect(page.locator("#viewport")).toHaveAttribute("data-board-view", "1");
  await expect(page.getByTestId("dialogue")).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(page.locator("#viewport")).toHaveAttribute("data-board-view", "0");
});

test("en vertical la pizarra se lee con un botón de volver dentro de la pantalla", async ({ browser }, testInfo) => {
  skipUnlessWebKitIphone(testInfo, "layout móvil vertical");
  const viewport = { width: 390, height: 844 };
  const context = await browser.newContext({
    viewport,
    isMobile: true,
    hasTouch: true,
    locale: "es-ES",
    baseURL: "http://127.0.0.1:4173",
  });
  const page = await context.newPage();
  await page.goto("/?e2e=1");
  await expect(page.getByTestId("world-ready")).toBeVisible();
  await page.evaluate(() => window.__protoLab?.focus("chalkboard"));
  await page.getByTestId("interact").tap();
  const back = page.getByTestId("board-back");
  await expect(back).toBeVisible();
  const box = await back.boundingBox();
  expect(box).toBeTruthy();
  expect(box!.x).toBeGreaterThanOrEqual(-1);
  expect(box!.y).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
  await expect(page.getByTestId("dialogue")).toBeHidden();
  await expect(page.locator("#viewport")).toHaveAttribute("data-board-view", "1");
  await expect.poll(async () => page.evaluate(() => window.__protoLab?.whiteboardView?.() ?? null)).toMatchObject({
    phase: "hold",
    playerVisible: false,
  });
  const framed = await page.evaluate(() => window.__protoLab?.whiteboardView?.());
  expect(framed).toBeTruthy();
  expect(framed!.z).toBeGreaterThan(-4);
  expect(framed!.z).toBeLessThan(1);
  await context.close();
});

test("el laboratorio carga, se propone una idea y se abre el prototipo", async ({ page, isMobile }) => {
  const proposal = page.waitForRequest("**/api/proposals");
  await page.goto("/?e2e=1");
  await expect(page.getByTestId("world-ready")).toBeVisible();
  await openInventorDialogue(page);
  await expect(page.getByTestId("dialogue-text")).toContainText("Inventor");

  await page.getByTestId("choice-propose").click();
  await page.getByTestId("dialogue-input").fill("Cometa lunar");
  await page.getByTestId("dialogue-send").click();
  await page.getByTestId("dialogue-input").fill("Un juego corto en el que persigues una cometa con el dedo.");
  await page.getByTestId("dialogue-send").click();
  await expect(page.getByTestId("dialogue-text")).toContainText("Cometa lunar");
  await page.getByTestId("choice-confirm").click();

  const request = await proposal;
  expect(request.postDataJSON()).toEqual({
    kind: "propuesta",
    title: "Cometa lunar",
    description: "Un juego corto en el que persigues una cometa con el dedo.",
  });
  await expect(page.getByTestId("dialogue-text")).toContainText("Apuntado");
  await expect(page.getByTestId("dialogue")).toHaveAttribute("data-outcome", "ok");
  await page.getByTestId("choice-close").click();
  await expect(page.getByTestId("dialogue")).toBeHidden();

  await openSelector(page, isMobile);
  await expect(page.getByTestId("selector-title")).toContainText("Pozo de bolas");
  await expect(page.getByTestId("selector-title")).not.toContainText("Laboratorio de assets");
  await playFromSelector(page, isMobile);
  const frame = page.frameLocator("iframe");
  await expect(page.locator("iframe")).toHaveAttribute("sandbox", "allow-scripts");
  await expect(frame.getByTestId("game-title")).toHaveText("Pozo de bolas");
  await expect(frame.locator("canvas")).toBeVisible();
  await page.getByTestId("close-prototype").click();
  await expect(page.getByTestId("prototype-player")).toBeHidden();
  await expect(page.getByTestId("world-ready")).toBeVisible();
});

test("se puede iterar el prototipo que hay delante", async ({ page }) => {
  const proposal = page.waitForRequest("**/api/proposals");
  await page.goto("/?e2e=1");
  await expect(page.getByTestId("world-ready")).toBeVisible();
  await openInventorDialogue(page);
  await page.getByTestId("choice-iterate").click();
  await page.getByTestId("choice-proto-chispa").click();
  await page.getByTestId("dialogue-input").fill("Chispas más rápidas");
  await page.getByTestId("dialogue-send").click();
  await page.getByTestId("dialogue-input").fill("Que las chispas bajen un poco más deprisa al subir de puntuación.");
  await page.getByTestId("dialogue-send").click();
  await page.getByTestId("choice-confirm").click();
  expect((await proposal).postDataJSON()).toMatchObject({
    kind: "iteracion",
    title: "Chispas más rápidas",
    slug: "chispa",
  });
  await expect(page.getByTestId("dialogue-text")).toContainText("Apuntado");
});

test("desde el Inventor se abre la guía de instalación PWA", async ({ page }) => {
  await page.goto("/?e2e=1");
  await expect(page.getByTestId("world-ready")).toBeVisible();
  await openInstallHelpFromInventor(page);
  await expect(page.getByTestId("install-tab-ios")).toBeVisible();
  await page.getByTestId("install-tab-ios").click();
  await expect(page.getByTestId("install-panel-ios")).toBeVisible();
  await expect(page.getByTestId("install-steps-ios")).toBeVisible();
  await page.getByTestId("install-tab-android").click();
  await expect(page.getByTestId("install-panel-android")).toBeVisible();
  await expect(page.getByTestId("install-steps-android")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("install-help")).toBeHidden();
  await expect(page.getByTestId("world-ready")).toBeVisible();
});

test("sin WebGL queda un respaldo usable", async ({ browser }, testInfo) => {
  skipUnlessChromium(testInfo, "comprobación única del fallback HTML");
  const context = await browser.newContext({ baseURL: "http://127.0.0.1:4173", locale: "es-ES" });
  await context.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, attrs?: unknown) {
      if (type === "webgl" || type === "webgl2" || type === "experimental-webgl") return null;
      return original.call(this, type as "2d", attrs as CanvasRenderingContext2DSettings);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByTestId("fallback")).toBeVisible();
  await expect(page.getByTestId("fallback")).toContainText("no puede mostrar el laboratorio en 3D");
  await page.getByTestId("fallback-talk").click();
  await expect(page.getByTestId("dialogue-text")).toContainText("Inventor");
  await expect(page.getByTestId("fallback-whiteboard-section")).toBeVisible();
  await page.getByTestId("choice-install").click();
  await expect(page.getByTestId("install-help")).toBeVisible();
  await page.getByTestId("install-close").click();
  await expect(page.getByTestId("install-help")).toBeHidden();
  await page.getByTestId("fallback-install").click();
  await expect(page.getByTestId("install-help")).toBeVisible();
  await context.close();
});

test("en el móvil el joystick dinámico aparece al tocar", async ({ browser }, testInfo) => {
  skipUnlessChromium(testInfo, "perfil Pixel 7");
  const context = await browser.newContext({
    ...devices["Pixel 7"],
    baseURL: "http://127.0.0.1:4173",
    locale: "es-ES",
  });
  const page = await context.newPage();
  await page.goto("/?e2e=1");
  await expect(page.getByTestId("world-ready")).toBeVisible();
  await expect(page.getByTestId("joystick")).toBeHidden();
  await expect(page.getByTestId("hint")).toContainText("Toca a la izquierda");
  const viewport = page.viewportSize();
  expect(viewport).toBeTruthy();
  const x = Math.floor(viewport!.width * 0.22);
  const y = Math.floor(viewport!.height * 0.72);
  await page.locator("#touch-zone-move").dispatchEvent("pointerdown", {
    clientX: x,
    clientY: y,
    button: 0,
    buttons: 1,
    pointerId: 1,
    pointerType: "touch",
    isPrimary: true,
  });
  await expect(page.getByTestId("touch-controls")).toHaveAttribute("data-active", "true");
  await page.locator("#touch-zone-move").dispatchEvent("pointerup", {
    clientX: x,
    clientY: y,
    button: 0,
    buttons: 0,
    pointerId: 1,
    pointerType: "touch",
    isPrimary: true,
  });
  await expect(page.getByTestId("touch-controls")).not.toHaveAttribute("data-active", "true");
  await context.close();
});

async function simulateAccess(page: import("@playwright/test").Page) {
  await page.route("**/protos/**", async (route) => {
    const origin = route.request().headers().origin ?? "";
    if (origin === "null") {
      await route.fulfill({
        status: 302,
        headers: { location: "https://ancient-waterfall-b3eb.cloudflareaccess.com/cdn-cgi/access/login" },
        body: "<!doctype html><title>Access</title>",
      });
      return;
    }
    await route.continue();
  });
}

async function openChispa(page: import("@playwright/test").Page, isMobile: boolean) {
  await page.goto("/?e2e=1");
  await expect(page.getByTestId("world-ready")).toBeVisible();
  await openSelector(page, isMobile);
  await playFromSelector(page, isMobile);
}

test("detrás de Access el prototipo arranca y Volver responde al tacto", async ({ browser }, testInfo) => {
  skipUnlessChromium(testInfo, "perfil Pixel 7");
  const context = await browser.newContext({ ...devices["Pixel 7"], locale: "es-ES" });
  await context.addCookies([{ name: "CF_Authorization", value: "sesion-de-prueba", url: "http://127.0.0.1:4173" }]);
  const page = await context.newPage();
  await simulateAccess(page);
  await openChispa(page, true);
  const frame = page.frameLocator("iframe");
  await expect(frame.locator("canvas")).toBeVisible();
  await expect(page.locator("iframe")).toHaveAttribute("sandbox", "allow-scripts");
  const back = page.getByTestId("close-prototype");
  await expect(back).toBeVisible();
  const hit = await back.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return top === element || element.contains(top);
  });
  expect(hit).toBe(true);
  await back.tap();
  await expect(page.getByTestId("prototype-player")).toBeHidden();
  await expect(page.getByTestId("world-ready")).toBeVisible();
  await context.close();
});

test("Escape dentro del prototipo vuelve al laboratorio", async ({ page }) => {
  await page.context().addCookies([{ name: "CF_Authorization", value: "sesion-de-prueba", url: "http://127.0.0.1:4173" }]);
  await simulateAccess(page);
  await page.goto("/?e2e=1");
  await expect(page.getByTestId("world-ready")).toBeVisible();
  await openSelector(page, false);
  await playFromSelector(page, false);
  const canvas = page.frameLocator("iframe").locator("canvas");
  await expect(canvas).toBeVisible();
  await canvas.click();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("prototype-player")).toBeHidden();
});

test("si Access bloquea el prototipo, Volver sigue funcionando", async ({ browser }, testInfo) => {
  skipUnlessChromium(testInfo, "perfil Pixel 7");
  const context = await browser.newContext({ ...devices["Pixel 7"], locale: "es-ES" });
  const page = await context.newPage();
  await page.route("**/protos/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: "<!doctype html><html><body style=\"background:#fff\"><p>Iniciar sesión en Cloudflare Access</p></body></html>",
    });
  });
  await openChispa(page, true);
  await expect(page.getByTestId("prototype-error")).toBeVisible();
  await expect(page.getByTestId("prototype-error")).toContainText("volver al laboratorio");
  await expect(page.getByTestId("prototype-error")).not.toContainText("salir del laboratorio");
  await expect(page.locator("iframe")).toHaveCount(0);
  await page.getByTestId("close-prototype").tap();
  await expect(page.getByTestId("prototype-player")).toBeHidden();
  await expect(page.getByTestId("world-ready")).toBeVisible();
  await context.close();
});

test("se suelta una bola y dos del mismo tamaño se funden", async ({ page, isMobile }) => {
  await openChispa(page, isMobile);
  const canvas = page.frameLocator("iframe").locator("canvas");
  await canvas.waitFor();
  const before = await canvas.evaluate(() => window.__chispa?.ballCount() ?? 0);
  await canvas.evaluate(() => window.__chispa?.drop(270));
  await expect.poll(() => canvas.evaluate(() => window.__chispa?.ballCount() ?? 0)).toBeGreaterThan(before);
  await canvas.evaluate(() => window.__chispa?.spawnPair(0));
  await expect.poll(() => canvas.evaluate(() => window.__chispa?.score() ?? 0), { timeout: 8000 }).toBeGreaterThan(0);
});

async function abrirPozo(page: import("@playwright/test").Page, isMobile: boolean) {
  await page.goto("/?e2e=1");
  await expect(page.getByTestId("world-ready")).toBeVisible();
  await openSelector(page, isMobile);
  await playFromSelector(page, isMobile);
}

test("si la pantalla completa nativa falla, el overlay ocupa la pantalla", async ({ page, isMobile }) => {
  await abrirPozo(page, isMobile);
  await page.evaluate(() => {
    const stage = document.querySelector("#stage") as HTMLElement & { webkitRequestFullscreen?: () => void };
    Object.defineProperty(stage, "requestFullscreen", {
      configurable: true,
      value: () => Promise.reject(new DOMException("solo vídeo", "NotSupportedError")),
    });
    stage.webkitRequestFullscreen = () => {
      throw new DOMException("solo vídeo", "NotSupportedError");
    };
  });
  const full = page.getByTestId("fullscreen");
  await expect(full).toHaveText("Pantalla completa");
  if (isMobile) await full.tap();
  else await full.click();
  const stage = page.locator("#stage");
  await expect(stage).toHaveClass(/is-pseudo-fullscreen/);
  await expect(full).toHaveText("Salir");
  const box = await stage.evaluate((element) => {
    const style = getComputedStyle(element);
    const html = getComputedStyle(document.documentElement);
    const lab = getComputedStyle(document.querySelector("#viewport") as Element);
    const rect = element.getBoundingClientRect();
    return {
      position: style.position,
      width: rect.width,
      height: rect.height,
      vw: window.innerWidth,
      vh: window.innerHeight,
      htmlPosition: html.position,
      lab: lab.visibility,
    };
  });
  expect(box.position).toBe("fixed");
  expect(box.htmlPosition).toBe("fixed");
  expect(box.lab).toBe("hidden");
  expect(box.width).toBeGreaterThanOrEqual(box.vw - 1);
  expect(box.height).toBeGreaterThanOrEqual(box.vh - 1);
  if (isMobile) await full.tap();
  else await full.click();
  await expect(stage).not.toHaveClass(/is-pseudo-fullscreen/);
  await expect(full).toHaveText("Pantalla completa");
  await expect(page.locator("html")).not.toHaveClass(/is-pseudo-fullscreen/);
  const back = page.getByTestId("close-prototype");
  if (isMobile) await back.tap();
  else await back.click();
  await expect(page.getByTestId("prototype-player")).toBeHidden();
  await expect(page.locator("html")).not.toHaveClass(/is-pseudo-fullscreen/);
});

test("en escritorio la pantalla completa nativa no usa el modo CSS", async ({ page, isMobile, browserName }) => {
  test.skip(isMobile || browserName !== "chromium", "la API nativa se comprueba en Chromium de escritorio");
  await abrirPozo(page, false);
  await page.evaluate(() => {
    const stage = document.querySelector("#stage") as HTMLElement;
    Object.defineProperty(stage, "requestFullscreen", {
      configurable: true,
      value() {
        Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => stage });
        document.dispatchEvent(new Event("fullscreenchange"));
        return Promise.resolve();
      },
    });
    document.exitFullscreen = () => {
      Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => null });
      document.dispatchEvent(new Event("fullscreenchange"));
      return Promise.resolve();
    };
  });
  const full = page.getByTestId("fullscreen");
  await full.click();
  await expect(full).toHaveText("Salir");
  await expect(page.locator("#stage")).not.toHaveClass(/is-pseudo-fullscreen/);
  await expect(page.locator("#stage")).toHaveAttribute("data-fs", "native");
  await full.click();
  await expect(full).toHaveText("Pantalla completa");
  await expect(page.locator("#stage")).not.toHaveAttribute("data-fs", "native");
});

test("en el iPhone se apunta tocando la parte baja y al soltar cae una bola", async ({ page, isMobile }) => {
  test.skip(!isMobile, "hace falta el perfil táctil");
  await abrirPozo(page, true);
  const canvas = page.frameLocator("iframe").locator("canvas");
  await canvas.waitFor();
  await expect(page.frameLocator("iframe").getByTestId("next")).toContainText("Siguiente");
  const before = await canvas.evaluate(() => window.__chispa?.ballCount() ?? 0);
  const box = await canvas.boundingBox();
  expect(box).toBeTruthy();
  await canvas.tap({ position: { x: Math.max(12, (box?.width ?? 0) * 0.22), y: (box?.height ?? 0) * 0.78 } });
  await expect.poll(() => canvas.evaluate(() => window.__chispa?.ballCount() ?? 0)).toBeGreaterThan(before);
});

test("el lobby monta decoración ambiental sin errores", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?e2e=1");
  await expect(page.getByTestId("world-ready")).toBeVisible();
  await expect(page.locator("#viewport[data-ambient='1']")).toBeVisible();
  await page.evaluate(() => window.__protoLab?.visitSlacker?.());
  await expect(page.locator(".speech-bubble:not(.snore-bubble)")).toBeVisible();
  expect(errors).toEqual([]);
});


test("el selector cabe en el iPhone y tapa el joystick y las etiquetas", async ({ browser }, testInfo) => {
  skipUnlessWebKitIphone(testInfo, "viewports iPhone");
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    const context = await browser.newContext({
      viewport,
      isMobile: true,
      hasTouch: true,
      locale: "es-ES",
      baseURL: "http://127.0.0.1:4173",
    });
    const page = await context.newPage();
    await page.goto("/?e2e=1");
    await expect(page.getByTestId("world-ready")).toBeVisible();
    await page.evaluate(() => window.__protoLab?.focus("arcade"));
    await expect(page.getByTestId("interact")).toHaveText("Usar la máquina");
    await page.getByTestId("interact").tap();
    const selector = page.getByTestId("game-selector");
    await expect(selector).toBeVisible();
    await expect(page.getByTestId("joystick")).toBeHidden();
    await expect(page.locator(".nameplate").first()).toBeHidden();
    const preview = await page.getByTestId("selector-preview").boundingBox();
    expect(preview).toBeTruthy();
    expect(preview!.y).toBeGreaterThanOrEqual(0);
    expect(preview!.y + preview!.height).toBeLessThanOrEqual(viewport.height + 1);
    const panel = await page.locator(".selector-panel").evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom };
    });
    expect(panel.top).toBeGreaterThanOrEqual(-1);
    expect(panel.bottom).toBeLessThanOrEqual(viewport.height + 1);
    await context.close();
  }
});


test("con el diálogo del Inventor abierto no se ve el joystick", async ({ browser }, testInfo) => {
  skipUnlessChromium(testInfo, "perfil Pixel 7");
  const context = await browser.newContext({
    ...devices["Pixel 7"],
    baseURL: "http://127.0.0.1:4173",
    locale: "es-ES",
  });
  const page = await context.newPage();
  await page.goto("/?e2e=1");
  await expect(page.getByTestId("world-ready")).toBeVisible();
  await expect(page.getByTestId("joystick")).toBeHidden();
  await openInventorDialogue(page);
  await expect(page.getByTestId("joystick")).toBeHidden();
  await expect(page.getByTestId("interact")).toBeHidden();
  await page.getByTestId("choice-bye").click();
  await expect(page.getByTestId("dialogue")).toBeHidden();
  await expect(page.getByTestId("joystick")).toBeHidden();
  await context.close();
});

async function reachConfirmStep(page: import("@playwright/test").Page) {
  await openInventorDialogue(page);
  await page.getByTestId("choice-propose").click();
  await page.getByTestId("dialogue-input").fill("Cometa lunar");
  await page.getByTestId("dialogue-send").click();
  await page.getByTestId("dialogue-input").fill("Un juego corto en el que persigues una cometa con el dedo.");
  await page.getByTestId("dialogue-send").click();
  await expect(page.getByTestId("choice-confirm")).toBeVisible();
}

test("en horizontal las acciones de confirmación del diálogo caben en pantalla", async ({ browser }, testInfo) => {
  skipUnlessWebKitIphone(testInfo, "layout horizontal móvil");
  const viewport = { width: 844, height: 390 };
  const context = await browser.newContext({
    viewport,
    isMobile: true,
    hasTouch: true,
    locale: "es-ES",
    baseURL: "http://127.0.0.1:4173",
  });
  const page = await context.newPage();
  await page.goto("/?e2e=1");
  await expect(page.getByTestId("world-ready")).toBeVisible();
  await reachConfirmStep(page);
  for (const id of ["choice-confirm", "choice-edit", "choice-cancel"] as const) {
    const box = await page.getByTestId(id).boundingBox();
    expect(box).toBeTruthy();
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
    expect(box!.y).toBeGreaterThanOrEqual(-1);
  }
  await context.close();
});

test("la música se sirve y no muestra créditos en pantalla", async ({ page }) => {
  const track = await page.request.get("/protos/audio/luanda.m4a");
  expect(track.ok()).toBeTruthy();
  expect(track.headers()["content-type"] ?? "").toMatch(/audio|mp4|octet-stream/i);
  const credits = await page.request.get("/protos/audio/CREDITS.md");
  expect(credits.ok()).toBeTruthy();
  await page.goto("/?e2e=1");
  await expect(page.getByTestId("world-ready")).toBeVisible();
  const bodyText = await page.locator("body").innerText();
  expect(bodyText.toLowerCase()).not.toContain("credit");
  expect(bodyText.toLowerCase()).not.toContain("crédito");
});

test("un toque en el laboratorio arranca la música sin pasar por silenciar", async ({ page }, testInfo) => {
  skipUnlessChromium(testInfo, "clic de ratón en el lienzo");
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes(".m4a")) requests.push(request.url());
  });
  await page.goto("/?e2e=1");
  await expect(page.getByTestId("world-ready")).toBeVisible();
  const mute = page.getByTestId("mute-music");
  await expect(mute).toHaveAttribute("data-playback", "idle");
  const canvas = page.locator("#viewport canvas");
  // Esquina: el centro del lienzo puede caer sobre la máquina y abrir el selector.
  await canvas.click({ position: { x: 12, y: 96 } });
  await expect.poll(() => requests.length).toBeGreaterThan(0);
  expect(requests.every((url) => url.includes("luanda.m4a"))).toBe(true);
  await expect(mute).toHaveAttribute("data-playback", "playing");
  await page.evaluate(() => {
    const proto = Document.prototype;
    const current = Object.getOwnPropertyDescriptor(proto, "visibilityState");
    Object.defineProperty(proto, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    if (current) Object.defineProperty(proto, "visibilityState", current);
  });
  await expect(mute).not.toHaveAttribute("data-playback", "playing");
  await page.evaluate(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.keyboard.press("Shift");
  await expect(mute).toHaveAttribute("data-playback", "playing");
});

test("en el iPhone el joystick y el lienzo arrancan la música sin pulsar un botón", async ({ page }, testInfo) => {
  skipUnlessWebKitIphone(testInfo, "gesto táctil iOS");
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes(".m4a")) requests.push(request.url());
  });
  await page.goto("/?e2e=1");
  await expect(page.getByTestId("world-ready")).toBeVisible();
  const mute = page.getByTestId("mute-music");
  await expect(mute).toHaveAttribute("data-playback", "idle");

  const viewport = page.viewportSize();
  expect(viewport).toBeTruthy();
  await dispatchTouchDrag(page, viewport!.width * 0.22, viewport!.height * 0.72, 0, -48);
  await expect.poll(() => requests.length).toBeGreaterThan(0);
  expect(requests.every((url) => url.includes("luanda.m4a"))).toBe(true);
  await expect(mute).toHaveAttribute("data-playback", "playing");
  await expect(page.getByTestId("dialogue")).toBeHidden();
  await expect(page.locator("#game-selector")).toBeHidden();

  await page.reload();
  await expect(page.getByTestId("world-ready")).toBeVisible();
  await expect(mute).toHaveAttribute("data-playback", "idle");
  const canvas = await page.locator("#viewport canvas").boundingBox();
  expect(canvas).toBeTruthy();
  await dispatchTouchDrag(page, canvas!.x + canvas!.width * 0.72, canvas!.y + canvas!.height * 0.42, 0, 0);
  await expect.poll(() => requests.length).toBeGreaterThan(0);
  await expect(mute).toHaveAttribute("data-playback", "playing");
  await expect(page.getByTestId("dialogue")).toBeHidden();
  await expect(page.locator("#game-selector")).toBeHidden();
});

async function dispatchTouchDrag(
  page: import("@playwright/test").Page,
  x: number,
  y: number,
  dx: number,
  dy: number,
) {
  await page.evaluate(
    ({ x, y, dx, dy }) => {
      const target = document.elementFromPoint(x, y);
      if (!(target instanceof Element)) throw new Error("no hay elemento bajo el toque");
      // WebKit no deja construir Touch. El listener solo necesita el tipo de evento;
      // TouchEventInit no tiene clientX.
      const fire = (type: string) => {
        target.dispatchEvent(
          new TouchEvent(type, {
            bubbles: true,
            cancelable: true,
            view: window,
          }),
        );
      };
      fire("touchstart");
      if (dx !== 0 || dy !== 0) fire("touchmove");
      fire("touchend");
    },
    { x, y, dx, dy },
  );
}

test("el botón de silenciar alterna y persiste", async ({ page }) => {
  await page.goto("/?e2e=1");
  await expect(page.getByTestId("world-ready")).toBeVisible();
  const mute = page.getByTestId("mute-music");
  await expect(mute).toBeVisible();
  await expect(mute).toHaveAttribute("aria-pressed", "false");
  await expect(mute).toHaveText("Silenciar");
  await mute.click();
  await expect(mute).toHaveAttribute("aria-pressed", "true");
  await expect(mute).toHaveAttribute("aria-label", "Activar música");
  await page.reload();
  await expect(page.getByTestId("world-ready")).toBeVisible();
  await expect(page.getByTestId("mute-music")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("mute-music")).toHaveText("Activar");
});

test("en horizontal el botón de interacción queda en la mitad inferior", async ({ browser }, testInfo) => {
  skipUnlessWebKitIphone(testInfo, "layout horizontal móvil");
  const viewport = { width: 844, height: 390 };
  const context = await browser.newContext({
    viewport,
    isMobile: true,
    hasTouch: true,
    locale: "es-ES",
    baseURL: "http://127.0.0.1:4173",
  });
  const page = await context.newPage();
  await page.goto("/?e2e=1");
  await expect(page.getByTestId("world-ready")).toBeVisible();
  await page.evaluate(() => window.__protoLab?.focus("arcade"));
  await expect(page.getByTestId("interact")).toBeVisible();
  const midline = viewport.height / 2;
  const box = await page.getByTestId("interact").boundingBox();
  expect(box).toBeTruthy();
  expect(box!.y + box!.height / 2).toBeGreaterThanOrEqual(midline - 1);
  await context.close();
});

test("el hash #p= abre un prototipo y un slug desconocido se ignora", async ({ page, isMobile }, testInfo) => {
  skipUnlessChromium(testInfo, "deep link al prototipo");
  await page.goto("/?e2e=1#p=chispa");
  await expect(page.getByTestId("prototype-chrome")).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(1);
  expect(page.url()).toContain("#p=chispa");
  const back = page.getByTestId("close-prototype");
  if (isMobile) await back.tap();
  else await back.click();
  await expect(page.getByTestId("prototype-player")).toBeHidden();
  expect(page.url()).not.toContain("#p=");

  await page.goto("/?e2e=1#p=no-existe");
  await expect(page.locator("#viewport")).toHaveAttribute("data-testid", "world-ready");
  expect(page.url()).not.toContain("#p=");
});

test("Sugerir mejora abre una iteración del prototipo abierto", async ({ page, isMobile }, testInfo) => {
  skipUnlessChromium(testInfo, "propuesta de iteración desde el overlay");
  await page.goto("/?e2e=1#p=chispa");
  await expect(page.getByTestId("prototype-chrome")).toBeVisible();
  const suggest = page.getByTestId("suggest-improvement");
  if (isMobile) await suggest.tap();
  else await suggest.click();
  await expect(page.getByTestId("dialogue")).toBeVisible();
  await expect(page.getByTestId("prototype-player")).toBeHidden();
  await page.getByTestId("dialogue-input").fill("Más contraste");
  await page.getByTestId("dialogue-send").click();
  await page.getByTestId("dialogue-input").fill("Que el HUD se lea mejor en móvil.");
  await page.getByTestId("dialogue-send").click();
  const proposal = page.waitForRequest("**/api/proposals");
  await page.getByTestId("choice-confirm").click();
  expect((await proposal).postDataJSON()).toMatchObject({
    kind: "iteracion",
    title: "Más contraste",
    slug: "chispa",
  });
});
