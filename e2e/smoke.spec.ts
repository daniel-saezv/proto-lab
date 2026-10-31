import { devices, expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/proposals", async (route) => {
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

test("sin WebGL queda un respaldo usable", async ({ browser }) => {
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
  await page.getByTestId("choice-install").click();
  await expect(page.getByTestId("install-help")).toBeVisible();
  await page.getByTestId("install-close").click();
  await expect(page.getByTestId("install-help")).toBeHidden();
  await page.getByTestId("fallback-install").click();
  await expect(page.getByTestId("install-help")).toBeVisible();
  await context.close();
});

test("en el móvil aparece el joystick", async ({ browser }) => {
  const context = await browser.newContext({
    ...devices["Pixel 7"],
    baseURL: "http://127.0.0.1:4173",
    locale: "es-ES",
  });
  const page = await context.newPage();
  await page.goto("/?e2e=1");
  await expect(page.getByTestId("world-ready")).toBeVisible();
  await expect(page.getByTestId("joystick")).toBeVisible();
  await expect(page.getByTestId("hint")).toContainText("Joystick");
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

test("detrás de Access el prototipo arranca y Volver responde al tacto", async ({ browser }) => {
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

test("si Access bloquea el prototipo, Volver sigue funcionando", async ({ browser }) => {
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
  await page.waitForTimeout(400);
  await expect(page.locator(".speech-bubble:not(.snore-bubble)")).toBeVisible();
  expect(errors).toEqual([]);
});

test("se puede caminar por el lobby hasta los puntos clave", async ({ page }) => {
  await page.goto("/?e2e=1");
  await expect(page.getByTestId("world-ready")).toBeVisible();
  const results = await page.evaluate(() => window.__protoLab?.probeWalkable?.() ?? []);
  expect(results.length).toBeGreaterThan(0);
  for (const item of results) {
    expect(item.moved).toBeGreaterThan(1.5);
    expect(item.remaining).toBeLessThan(1.0);
  }
});

test("la máquina central abre el selector, lanza el juego y vuelve al laboratorio", async ({ page, isMobile }) => {
  await page.goto("/?e2e=1");
  await expect(page.getByTestId("world-ready")).toBeVisible();
  await openSelector(page, isMobile);
  await expect(page.getByTestId("selector-title")).toHaveText("Pozo de bolas");
  await expect(page.getByTestId("game-selector")).not.toContainText("Laboratorio de assets");
  await playFromSelector(page, isMobile);
  const frame = page.frameLocator("iframe");
  await expect(frame.locator("canvas")).toBeVisible();
  await page.getByTestId("close-prototype").click();
  await expect(page.getByTestId("prototype-player")).toBeHidden();
  await expect(page.getByTestId("world-ready")).toBeVisible();
});

test("asset-lab no aparece en el selector del lobby", async ({ page, isMobile }) => {
  await page.goto("/?e2e=1");
  await expect(page.getByTestId("world-ready")).toBeVisible();
  await openSelector(page, isMobile);
  await expect(page.getByTestId("selector-title")).not.toContainText("Laboratorio de assets");
  await expect(page.getByTestId("game-selector")).not.toContainText("asset-lab");
});

test("el selector cabe en el iPhone y tapa el joystick y las etiquetas", async ({ browser }) => {
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

test("el service worker no cachea prototipos", async ({ page }) => {
  const response = await page.request.get("/sw.js");
  expect(response.ok()).toBeTruthy();
  const source = await response.text();
  expect(source).toContain('startsWith("/protos/")');
  expect(source).toContain('startsWith("/api/")');
  expect(source).not.toContain("/protos/chispa/");
  const proto = await page.request.get("/protos/chispa/");
  expect(proto.ok()).toBeTruthy();
  expect(await proto.text()).toContain("Pozo de bolas");
});
