import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, partial: false, items: [] }),
    });
  });
});

async function openChispa(page: Page) {
  await page.goto("/?e2e=1");
  await expect(page.getByTestId("world-ready")).toBeVisible();
  await page.evaluate(() => {
    if (!window.__protoLab?.openPrototype) throw new Error("openPrototype no disponible");
    window.__protoLab.openPrototype("chispa");
  });
  await expect(page.getByTestId("prototype-chrome")).toBeVisible();
  await expect(page.getByTestId("prototype-player")).toHaveAttribute("data-prototype-ready", "1");
}

async function press(page: Page, id: string, isMobile: boolean) {
  const target = page.getByTestId(id);
  if (isMobile) await target.tap();
  else await target.click();
}

test("el menú y el overlay dejan el juego a la vista", async ({ page, isMobile }) => {
  await page.goto("/?e2e=1");
  await expect(page.getByTestId("world-ready")).toBeVisible();
  await page.evaluate(() => window.__protoLab?.focus("arcade"));
  await expect(page.getByTestId("interact")).toHaveText("Usar la máquina");
  await press(page, "interact", isMobile);
  const selector = page.getByTestId("game-selector");
  await expect(selector).toBeVisible();
  await expect(page.getByTestId("selector-title")).toBeVisible();
  const viewport = page.viewportSize();
  expect(viewport).toBeTruthy();
  for (const id of ["selector-play", "selector-prev", "selector-next"] as const) {
    const box = await page.getByTestId(id).boundingBox();
    expect(box).toBeTruthy();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  const panel = await page.locator(".selector-panel").boundingBox();
  expect(panel).toBeTruthy();
  expect(panel!.y).toBeGreaterThanOrEqual(-1);
  expect(panel!.y + panel!.height).toBeLessThanOrEqual((viewport?.height ?? 0) + 1);

  await press(page, "selector-play", isMobile);
  await expect(page.getByTestId("prototype-chrome")).toBeVisible();
  await expect(page.getByTestId("prototype-player")).toHaveAttribute("data-prototype-ready", "1");
  const chrome = await page.getByTestId("prototype-chrome").boundingBox();
  const frame = await page.locator(".prototype-frame").boundingBox();
  expect(chrome).toBeTruthy();
  expect(frame).toBeTruthy();
  expect(chrome!.height).toBeLessThanOrEqual(96);
  expect(frame!.y).toBeGreaterThanOrEqual(chrome!.y + chrome!.height - 1);
  const back = await page.getByTestId("close-prototype").boundingBox();
  const full = await page.getByTestId("fullscreen").boundingBox();
  expect(back!.height).toBeGreaterThanOrEqual(44);
  expect(full!.width).toBeGreaterThanOrEqual(44);
  expect(full!.height).toBeGreaterThanOrEqual(44);
  const clear = await page.locator(".prototype-frame").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return hit === element || element.contains(hit);
  });
  expect(clear).toBe(true);
});

test("sin soporte el botón entra en modo CSS o se oculta", async ({ page, isMobile }) => {
  await openChispa(page);
  await page.evaluate(() => {
    const stage = document.querySelector("#stage") as HTMLElement & { webkitRequestFullscreen?: () => void };
    const hide = (object: object, key: string) => {
      try {
        Object.defineProperty(object, key, { configurable: true, value: undefined });
      } catch {
        // El motor no deja redefinir el método: el clic igual cae al modo CSS si no hay función.
      }
    };
    hide(stage, "requestFullscreen");
    hide(stage, "webkitRequestFullscreen");
    const lock = (object: object, key: string) => {
      try {
        Object.defineProperty(object, key, { configurable: true, get: () => false });
      } catch {
        // Igual que arriba: sin método, el plan ya no es nativo.
      }
    };
    lock(document, "fullscreenEnabled");
    lock(document, "webkitFullscreenEnabled");
  });
  const full = page.getByTestId("fullscreen");
  await expect(full).toBeVisible();
  await press(page, "fullscreen", isMobile);
  await expect(page.locator("#stage")).toHaveClass(/is-pseudo-fullscreen/);
  await expect(full).toHaveText("Salir");
  await expect(full).toHaveAttribute("aria-pressed", "true");
  const immersed = await page.locator("#stage").evaluate((element) => {
    const style = getComputedStyle(element);
    return { position: style.position, height: style.height };
  });
  expect(immersed.position).toBe("fixed");
  expect(immersed.height.endsWith("px")).toBe(true);
  await press(page, "fullscreen", isMobile);
  await expect(page.locator("#stage")).not.toHaveClass(/is-pseudo-fullscreen/);
  await expect(full).toHaveText("Pantalla completa");

  await press(page, "close-prototype", isMobile);
  await expect(page.getByTestId("prototype-player")).toBeHidden();
  await page.evaluate(() => {
    const original = window.matchMedia.bind(window);
    window.matchMedia = (query: string) => {
      if (query.includes("display-mode: standalone") || query.includes("display-mode: fullscreen")) {
        return {
          matches: true,
          media: query,
          onchange: null,
          addListener() {},
          removeListener() {},
          addEventListener() {},
          removeEventListener() {},
          dispatchEvent() {
            return false;
          },
        } as MediaQueryList;
      }
      return original(query);
    };
    Object.defineProperty(navigator, "standalone", { configurable: true, get: () => true });
  });
  await page.evaluate(() => window.__protoLab?.openPrototype?.("chispa"));
  await expect(page.getByTestId("prototype-chrome")).toBeVisible();
  await expect(page.getByTestId("fullscreen")).toBeHidden();
  await expect(page.getByTestId("close-prototype")).toBeVisible();
});
