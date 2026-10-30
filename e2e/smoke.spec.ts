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

test("el laboratorio carga, se propone una idea y se abre el prototipo", async ({ page }) => {
  const proposal = page.waitForRequest("**/api/proposals");
  await page.goto("/?e2e=1");
  await expect(page.getByTestId("world-ready")).toBeVisible();
  await expect(page.getByTestId("loading")).toBeHidden();

  await page.evaluate(() => window.__protoLab?.focus("inventor"));
  await expect(page.getByTestId("interact")).toHaveText("Hablar con el Inventor");
  await page.getByTestId("interact").click();
  await expect(page.getByTestId("dialogue")).toBeVisible();
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

  await page.evaluate(() => window.__protoLab?.focus("chispa"));
  await expect(page.getByTestId("interact")).toHaveText("Jugar a Atrapa la chispa");
  await page.getByTestId("interact").click();
  const frame = page.frameLocator("iframe");
  await expect(page.locator("iframe")).toHaveAttribute("sandbox", "allow-scripts");
  await expect(frame.getByTestId("game-title")).toHaveText("Atrapa la chispa");
  await expect(frame.locator("canvas")).toBeVisible();
  await page.getByTestId("close-prototype").click();
  await expect(page.getByTestId("prototype-player")).toBeHidden();
  await expect(page.getByTestId("world-ready")).toBeVisible();
});

test("se puede iterar el prototipo que hay delante", async ({ page }) => {
  const proposal = page.waitForRequest("**/api/proposals");
  await page.goto("/?e2e=1");
  await expect(page.getByTestId("world-ready")).toBeVisible();
  await page.evaluate(() => window.__protoLab?.focus("inventor"));
  await expect(page.getByTestId("interact")).toHaveText("Hablar con el Inventor");
  await page.getByTestId("interact").click();
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

async function openChispa(page: import("@playwright/test").Page) {
  await page.goto("/?e2e=1");
  await expect(page.getByTestId("world-ready")).toBeVisible();
  await page.evaluate(() => window.__protoLab?.focus("chispa"));
  await expect(page.getByTestId("interact")).toHaveText("Jugar a Atrapa la chispa");
  await page.getByTestId("interact").tap();
}

test("detrás de Access el prototipo arranca y Volver responde al tacto", async ({ browser }) => {
  const context = await browser.newContext({ ...devices["Pixel 7"], locale: "es-ES" });
  await context.addCookies([{ name: "CF_Authorization", value: "sesion-de-prueba", url: "http://127.0.0.1:4173" }]);
  const page = await context.newPage();
  await simulateAccess(page);
  await openChispa(page);
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
  await page.evaluate(() => window.__protoLab?.focus("chispa"));
  await page.getByTestId("interact").click();
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
  await openChispa(page);
  await expect(page.getByTestId("prototype-error")).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);
  await page.getByTestId("close-prototype").tap();
  await expect(page.getByTestId("prototype-player")).toBeHidden();
  await expect(page.getByTestId("world-ready")).toBeVisible();
  await context.close();
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
  expect(await proto.text()).toContain("Atrapa la chispa");
});
