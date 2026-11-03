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

test("con un prototipo abierto el lobby deja de renderizar y la música se libera", async ({ page }, testInfo) => {
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
  await expect.poll(async () => page.getByTestId("mute-music").getAttribute("data-playback")).not.toBe("playing");
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
  await expect.poll(async () => page.getByTestId("mute-music").getAttribute("data-playback")).toBe("playing");
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
  await expect(page.getByTestId("board-preview")).toHaveCount(0);
  await expect(page.locator("#viewport")).toHaveAttribute("data-board-interactive", "1");
  await expect(page.locator("#viewport")).toHaveAttribute("data-board-screen", "list");
  const back = page.getByTestId("board-back");
  await expect(back).toBeVisible();
  await expect(back).toHaveText("Volver");
  await back.click();
  await expect(page.locator("#viewport")).toHaveAttribute("data-board-view", "0");
  await expect(back).toBeHidden();
  await expect(page.locator("#viewport")).toHaveAttribute("data-board-interactive", "0");
  await expect(interact).toHaveText("Ver la pizarra");
  await page.keyboard.press("e");
  await expect(page.locator("#viewport")).toHaveAttribute("data-board-view", "1");
  await expect(page.getByTestId("dialogue")).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(page.locator("#viewport")).toHaveAttribute("data-board-view", "0");
});

test("la pizarra fijada elige una propuesta y enseña la acción de su estado", async ({ page }, testInfo) => {
  skipUnlessChromium(testInfo, "selección en el tablón");
  await page.emulateMedia({ reducedMotion: "reduce" });
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
          {
            number: 9,
            title: "Ya en el lab",
            kind: "iteracion",
            slug: "chispa",
            phase: "publicada",
            updatedAt: "2026-03-03T00:00:00Z",
            previewUrl: "https://proto-lab-3k6.pages.dev",
          },
          {
            number: 10,
            title: "Sin carpeta",
            kind: "propuesta",
            slug: null,
            phase: "publicada",
            updatedAt: "2026-03-04T00:00:00Z",
            previewUrl: "https://proto-lab-3k6.pages.dev",
          },
        ],
      }),
    });
  });
  await page.goto("/?e2e=1");
  await expect(page.getByTestId("world-ready")).toBeVisible();
  await page.evaluate(() => window.__protoLab?.focus("chalkboard"));
  await page.getByTestId("interact").click();
  const viewport = page.locator("#viewport");
  await expect(viewport).toHaveAttribute("data-board-interactive", "1");
  await expect(viewport).toHaveAttribute("data-whiteboard-items", "7,8,9,10");
  await expect(viewport).toHaveAttribute("data-board-screen", "list");

  async function clickBoard(zone: "row" | "back" | "action", number?: number) {
    const point = await page.evaluate(
      ({ zone, number }) => window.__protoLab?.boardPoint?.(zone, number) ?? null,
      { zone, number },
    );
    expect(point, zone).toBeTruthy();
    await page.locator("#viewport canvas").click({ position: { x: point!.x, y: point!.y } });
  }

  await clickBoard("row", 7);
  await expect(viewport).toHaveAttribute("data-board-screen", "detail");
  await expect(viewport).toHaveAttribute("data-board-selected", "7");
  await expect(viewport).toHaveAttribute("data-board-action", "");
  await expect(page.getByTestId("board-action")).toHaveCount(0);
  await expect.poll(() => page.getByTestId("board-detail-phase").textContent()).toBe("Propuesta. Recibida");
  await page.keyboard.press("Escape");
  await expect(viewport).toHaveAttribute("data-board-screen", "list");
  await expect(viewport).toHaveAttribute("data-board-view", "1");

  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(viewport).toHaveAttribute("data-board-selected", "8");
  await expect(viewport).toHaveAttribute("data-board-action", "preview");
  await expect(viewport).toHaveAttribute("data-board-action-label", "Probar la preview");
  const preview = page.getByTestId("board-action");
  await expect(preview).toHaveAttribute("href", "https://preview-test.proto-lab-3k6.pages.dev/");
  await expect(preview).toHaveAttribute("target", "_blank");
  await expect(preview).toHaveAttribute("rel", "noopener noreferrer");
  await page.evaluate(() => {
    const opened: string[] = [];
    window.open = (url) => {
      opened.push(String(url));
      return null;
    };
    (window as unknown as { __opened?: string[] }).__opened = opened;
  });
  await clickBoard("action");
  await expect.poll(() => page.evaluate(() => (window as unknown as { __opened?: string[] }).__opened ?? [])).toEqual([
    "https://preview-test.proto-lab-3k6.pages.dev/",
  ]);

  await clickBoard("back");
  await expect(viewport).toHaveAttribute("data-board-screen", "list");
  await clickBoard("row", 10);
  await expect(viewport).toHaveAttribute("data-board-action", "lab-root");
  await expect(viewport).toHaveAttribute("data-board-action-label", "Ver en el lab");
  await expect(page.getByTestId("board-action")).toHaveAttribute("href", "https://proto-lab-3k6.pages.dev/");
  await page.evaluate(() => {
    const opened: string[] = [];
    window.open = (url) => {
      opened.push(String(url));
      return null;
    };
    (window as unknown as { __opened?: string[] }).__opened = opened;
  });
  await clickBoard("action");
  await expect.poll(() => page.evaluate(() => (window as unknown as { __opened?: string[] }).__opened ?? [])).toEqual([
    "https://proto-lab-3k6.pages.dev/",
  ]);

  await page.keyboard.press("Escape");
  await expect(viewport).toHaveAttribute("data-board-screen", "list");
  await clickBoard("row", 9);
  await expect(viewport).toHaveAttribute("data-board-action", "lab-prototype");
  await expect(viewport).toHaveAttribute("data-board-action-label", "Ver en el lab");
  await clickBoard("action");
  await expect(page.getByTestId("prototype-chrome")).toBeVisible();
  await expect(page.locator("#viewport")).toHaveAttribute("data-board-view", "0");
});

test("en el iPhone la acción de la pizarra cabe en el dedo", async ({ page }, testInfo) => {
  skipUnlessWebKitIphone(testInfo, "zona táctil en vertical");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?e2e=1");
  await expect(page.getByTestId("world-ready")).toBeVisible();
  await page.evaluate(() => window.__protoLab?.focus("chalkboard"));
  await page.getByTestId("interact").tap();
  const viewport = page.locator("#viewport");
  await expect(viewport).toHaveAttribute("data-board-interactive", "1");
  await expect(viewport).toHaveAttribute("data-whiteboard-items", "7,8");
  const row = await page.evaluate(() => window.__protoLab?.boardPoint?.("row", 8) ?? null);
  expect(row).toBeTruthy();
  await page.locator("#viewport canvas").tap({ position: { x: row!.x, y: row!.y } });
  await expect(viewport).toHaveAttribute("data-board-action-label", "Probar la preview");
  const box = await page.evaluate(() => window.__protoLab?.boardBox?.("action") ?? null);
  const back = await page.evaluate(() => window.__protoLab?.boardBox?.("back") ?? null);
  expect(box).toBeTruthy();
  expect(back).toBeTruthy();
  const size = page.viewportSize();
  expect(size).toBeTruthy();
  for (const target of [box!, back!]) {
    expect(target.width).toBeGreaterThanOrEqual(44);
    expect(target.height).toBeGreaterThanOrEqual(44);
    expect(target.x).toBeGreaterThanOrEqual(-1);
    expect(target.y).toBeGreaterThanOrEqual(-1);
    expect(target.x + target.width).toBeLessThanOrEqual(size!.width + 1);
    expect(target.y + target.height).toBeLessThanOrEqual(size!.height + 1);
  }
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
  await expect(page.getByTestId("dialogue-text")).toContainText("la máquina de este laboratorio");
  await expect(page.getByTestId("dialogue-text")).not.toContainText("máquinas");

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
  await expect(page.locator("iframe")).not.toHaveAttribute("sandbox", /.+/);
  await expect(page.locator("iframe")).toHaveAttribute("src", /\/protos\/chispa\//);
  await expect(page.getByTestId("prototype-player")).toHaveAttribute("data-prototype-ready", "1");
  await expect(frame.getByTestId("game-title")).toHaveText("Pozo de bolas");
  await expect(frame.locator("canvas")).toBeVisible();
  await page.getByTestId("close-prototype").click();
  await expect(page.getByTestId("prototype-player")).toBeHidden();
  await expect(page.getByTestId("world-ready")).toBeVisible();
});

test("se puede iterar un prototipo desde la lista del Inventor", async ({ page }) => {
  const proposal = page.waitForRequest("**/api/proposals");
  await page.goto("/?e2e=1");
  await expect(page.getByTestId("world-ready")).toBeVisible();
  await openInventorDialogue(page);
  await page.getByTestId("choice-iterate").click();
  await expect(page.getByTestId("dialogue-text")).toContainText("mundos, apps o juegos");
  await expect(page.getByTestId("dialogue-text")).toContainText("Elígelo de la lista");
  await expect(page.getByTestId("choice-nearest")).toHaveCount(0);
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

test("la radio queda a mano desde el spawn", async ({ page }, testInfo) => {
  skipUnlessChromium(testInfo, "atajo de la radio, una sola vez");
  await page.goto("/?e2e=1");
  await expect(page.getByTestId("world-ready")).toBeVisible();
  await page.evaluate(() => window.__protoLab?.focus("radio"));
  await expect(page.getByTestId("interact")).toHaveText("Cambiar la música");
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
  await expect(page.getByTestId("dialogue-text")).toContainText("la máquina de este laboratorio");
  await expect(page.getByTestId("fallback-whiteboard-section")).toBeVisible();
  await expect(page.getByTestId("fallback-tune")).toHaveText("Otra música");
  await expect(page.getByTestId("fallback-tune-label")).toContainText("Música:");
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
  await expect(page.getByTestId("hint")).toBeHidden();
  await expect(page.locator("#shell > p.sr-only")).toContainText("izquierda");
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
  await expect(page.locator("iframe")).not.toHaveAttribute("sandbox", /.+/);
  await expect(page.getByTestId("prototype-player")).toHaveAttribute("data-prototype-ready", "1");
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

test("en el rincón se habla con Remolón y el Inventor sigue siendo él", async ({ page }) => {
  await page.goto("/?e2e=1");
  await expect(page.getByTestId("world-ready")).toBeVisible();
  await page.evaluate(() => window.__protoLab?.focus("remolon"));
  await expect(page.getByTestId("interact")).toHaveText("Hablar con Remolón");
  await page.getByTestId("interact").click();
  await expect(page.locator("#dialogue-name")).toHaveText("Remolón");
  await expect(page.getByTestId("dialogue")).toHaveAttribute("data-speaker", "remolon");
  const line = page.getByTestId("dialogue-text");
  await expect(line).toContainText("tele");
  await expect(line).toContainText("a medias");
  await expect(line).not.toContainText("máquina");
  await page.getByTestId("choice-remolon-halves").click();
  await expect(line).toContainText("Croquis");
  await expect(line).not.toContainText("máquina");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("dialogue")).toBeHidden();
  await openInventorDialogue(page);
  await expect(page.locator("#dialogue-name")).toHaveText("Inventor");
  await expect(page.getByTestId("dialogue-text")).toContainText("la máquina de este laboratorio");
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
  for (const id of ["choice-confirm", "choice-workshop", "choice-edit", "choice-cancel"] as const) {
    const box = await page.getByTestId(id).boundingBox();
    expect(box).toBeTruthy();
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
    expect(box!.y).toBeGreaterThanOrEqual(-1);
  }
  await context.close();
});

test("el escritorio conserva la nota y devuelve al Inventor a su sitio", async ({ page }) => {
  await page.goto("/?e2e=1");
  await expect(page.getByTestId("world-ready")).toBeVisible();
  await reachConfirmStep(page);
  await expect(page.getByTestId("workshop-skip")).toBeHidden();
  await page.getByTestId("choice-workshop").click();
  await expect(page.getByTestId("choice-workshop-back")).toBeVisible();
  await expect(page.getByTestId("choice-workshop-send")).toBeVisible();
  await expect(page.getByTestId("workshop-skip")).toBeHidden();
  await expect(page.getByTestId("dialogue-text")).toContainText("Cometa lunar");
  const seated = await page.evaluate(() => window.__protoLab?.workshopView?.());
  expect(seated?.place).toBe("desk");
  expect(seated?.sit).toBe(1);
  await page.getByTestId("choice-workshop-back").click();
  await expect(page.getByTestId("choice-confirm")).toBeVisible();
  await expect(page.getByTestId("dialogue-text")).toContainText("Cometa lunar");
  const home = await page.evaluate(() => window.__protoLab?.workshopView?.());
  expect(home?.place).toBe("stand");
  expect(home?.sit).toBe(0);
  expect(home?.x).toBeCloseTo(-1.5, 1);
  expect(home?.z).toBeCloseTo(-3.4, 1);
  await page.getByTestId("choice-workshop").click();
  await expect(page.getByTestId("choice-workshop-send")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("dialogue")).toBeHidden();
  const left = await page.evaluate(() => window.__protoLab?.workshopView?.());
  expect(left?.place).toBe("stand");
  expect(left?.sit).toBe(0);
  expect(left?.x).toBeCloseTo(-1.5, 1);
  expect(left?.z).toBeCloseTo(-3.4, 1);
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
  expect(requests.every((url) => /\/luanda(?:\.[0-9a-f]{8})?\.m4a/.test(url))).toBe(true);
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
  expect(requests.every((url) => /\/luanda(?:\.[0-9a-f]{8})?\.m4a/.test(url))).toBe(true);
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

test("en el iPhone el joystick no selecciona el texto de los botones", async ({ page }, testInfo) => {
  skipUnlessWebKitIphone(testInfo, "selección y callout táctiles en iOS");
  await page.goto("/?e2e=1");
  await expect(page.getByTestId("world-ready")).toBeVisible();
  const mute = page.getByTestId("mute-music");
  const chrome = await mute.evaluate((el) => getComputedStyle(el).userSelect);
  expect(chrome).toBe("none");
  const cssHref = await page.locator('link[rel="stylesheet"]').first().getAttribute("href");
  expect(cssHref).toBeTruthy();
  const css = await (await page.request.get(new URL(cssHref!, page.url()).href)).text();
  expect(css).toMatch(/-webkit-touch-callout:\s*none/);
  expect(css).toMatch(/-webkit-touch-callout:\s*default/);

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
  await expect(page.locator("body")).toHaveClass(/joystick-dragging/);

  const during = await page.evaluate(() => {
    const button = document.querySelector("#mute-music");
    const dialogue = document.querySelector("#dialogue");
    if (!(button instanceof HTMLElement) || !(dialogue instanceof HTMLElement)) throw new Error("falta el cromo");
    const buttonEvent = new Event("selectstart", { bubbles: true, cancelable: true });
    button.dispatchEvent(buttonEvent);
    const field = document.createElement("textarea");
    field.className = "dialogue-input";
    dialogue.append(field);
    const fieldEvent = new Event("selectstart", { bubbles: true, cancelable: true });
    field.dispatchEvent(fieldEvent);
    const fieldSelect = getComputedStyle(field).userSelect;
    field.remove();
    return {
      buttonBlocked: buttonEvent.defaultPrevented,
      fieldBlocked: fieldEvent.defaultPrevented,
      fieldSelect,
      selected: window.getSelection()?.toString() ?? "",
    };
  });
  expect(during.buttonBlocked).toBe(true);
  expect(during.fieldBlocked).toBe(false);
  expect(during.fieldSelect).toBe("text");
  expect(during.selected).toBe("");

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
  await expect(page.locator("body")).not.toHaveClass(/joystick-dragging/);

  const idle = await page.evaluate(() => {
    const button = document.querySelector("#mute-music");
    const dialogue = document.querySelector("#dialogue");
    if (!(button instanceof HTMLElement) || !(dialogue instanceof HTMLElement)) throw new Error("falta el cromo");
    const text = document.createElement("p");
    text.className = "dialogue-text";
    text.textContent = "Se puede copiar";
    dialogue.append(text);
    const textEvent = new Event("selectstart", { bubbles: true, cancelable: true });
    text.dispatchEvent(textEvent);
    const buttonEvent = new Event("selectstart", { bubbles: true, cancelable: true });
    button.dispatchEvent(buttonEvent);
    const textSelect = getComputedStyle(text).userSelect;
    text.remove();
    return { textBlocked: textEvent.defaultPrevented, buttonBlocked: buttonEvent.defaultPrevented, textSelect };
  });
  expect(idle.textBlocked).toBe(false);
  expect(idle.buttonBlocked).toBe(true);
  expect(idle.textSelect).not.toBe("none");
});

test("en el iPhone la música del joystick no vuelve a idle tras unos segundos", async ({ page }, testInfo) => {
  skipUnlessWebKitIphone(testInfo, "gesto táctil iOS");
  await page.goto("/?e2e=1");
  await expect(page.getByTestId("world-ready")).toBeVisible();
  const mute = page.getByTestId("mute-music");
  const viewport = page.viewportSize();
  expect(viewport).toBeTruthy();
  await dispatchTouchDrag(page, viewport!.width * 0.22, viewport!.height * 0.72, 0, -48);
  await expect(mute).toHaveAttribute("data-playback", "playing");
  await expect
    .poll(async () => mute.getAttribute("data-playback"), { timeout: 4000, intervals: [400, 400, 400, 400, 400, 400, 400, 400, 400, 400] })
    .toBe("playing");
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

test("el botón de silenciar alterna y persiste", async ({ page }, testInfo) => {
  await page.goto("/?e2e=1");
  await expect(page.getByTestId("world-ready")).toBeVisible();
  const mute = page.getByTestId("mute-music");
  await expect(mute).toBeVisible();
  await expect(mute).toHaveAttribute("aria-pressed", "false");
  await expect(mute).toHaveAttribute("aria-label", "Silenciar música");
  await expect(page.getByRole("button", { name: "Silenciar música" })).toBeVisible();
  await expect(mute.locator(".mute-icon--on")).toBeVisible();
  await expect(mute.locator(".mute-icon--off")).toBeHidden();
  if (testInfo.project.name === "webkit-iphone") await expect(page.getByTestId("hint")).toBeHidden();
  else await expect(page.getByTestId("hint")).toContainText("WASD para caminar");
  await mute.click();
  await expect(mute).toHaveAttribute("aria-pressed", "true");
  await expect(mute).toHaveAttribute("aria-label", "Activar música");
  await expect(mute.locator(".mute-icon--off")).toBeVisible();
  await expect(mute.locator(".mute-icon--on")).toBeHidden();
  await page.reload();
  await expect(page.getByTestId("world-ready")).toBeVisible();
  await expect(page.getByTestId("mute-music")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("mute-music")).toHaveAttribute("aria-label", "Activar música");
  await expect(page.getByTestId("mute-music").locator(".mute-icon--off")).toBeVisible();
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

test("CSP, audio y el JS con hash del prototipo no se pisan", async ({ page }) => {
  const home = await page.request.get("/");
  expect(home.ok()).toBeTruthy();
  const csp = home.headers()["content-security-policy"] ?? "";
  expect(csp).toContain("frame-src 'self'");
  const protoPage = await page.request.get("/protos/chispa/");
  expect(protoPage.ok()).toBeTruthy();
  expect(protoPage.headers()["x-frame-options"] ?? "").toBe("");
  expect(protoPage.headers()["content-security-policy"] ?? "").toContain("frame-ancestors 'self'");
  expect(csp).toContain("frame-ancestors 'self'");
  expect(csp).toContain("media-src 'self'");
  expect(home.headers()["x-content-type-options"]).toBe("nosniff");
  expect(home.headers()["referrer-policy"]).toBe("no-referrer");
  const homePolicy = home.headers()["permissions-policy"] ?? "";
  expect(homePolicy).toContain("camera=(self)");
  expect(homePolicy).toContain("geolocation=(self)");
  expect(homePolicy).toContain("payment=()");
  expect(homePolicy).not.toContain("camera=()");
  const shell = await page.request.get("/manifest.webmanifest");
  expect(shell.headers()["permissions-policy"] ?? "").toContain("camera=()");
  expect(shell.headers()["permissions-policy"] ?? "").not.toContain("(self)");
  expect(home.headers()["cache-control"] ?? "").toMatch(/no-cache/);

  const manifest = await page.request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBeTruthy();
  expect(manifest.headers()["cache-control"] ?? "").toMatch(/no-cache/);

  await page.goto("/?e2e=1");
  await expect(page.getByTestId("world-ready")).toBeVisible();
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);

  const audio = await page.request.get("/protos/audio/luanda.m4a");
  expect(audio.ok()).toBeTruthy();
  expect(audio.headers()["content-type"] ?? "").toMatch(/audio|mp4|octet-stream/i);
  const audioCache = audio.headers()["cache-control"] ?? "";
  expect(audioCache).toMatch(/immutable/);
  expect(audioCache).not.toMatch(/no-cache/);

  const proto = await page.request.get("/protos/chispa/");
  expect(proto.ok()).toBeTruthy();
  expect(proto.headers()["cache-control"] ?? "").toMatch(/no-cache/);
  const src = (await proto.text()).match(/src="([^"]+\.js)"/)?.[1];
  expect(src).toBeTruthy();
  const assetPath = new URL(src!, "http://127.0.0.1:4173/protos/chispa/").pathname;
  const asset = await page.request.get(assetPath);
  expect(asset.ok()).toBeTruthy();
  const assetCache = asset.headers()["cache-control"] ?? "";
  expect(assetCache).toMatch(/immutable/);
  expect(assetCache).not.toMatch(/no-cache/);
});
