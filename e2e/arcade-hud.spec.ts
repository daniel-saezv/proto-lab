import { expect, test, type Page } from "@playwright/test";
import { expandPrototypeHud } from "./helpers";

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

async function armGameHits(page: Page) {
  await page.frameLocator("iframe").locator("canvas").evaluate((element) => {
    element.dataset.hudHits = "0";
    element.ownerDocument.addEventListener(
      "pointerdown",
      () => {
        element.dataset.hudHits = String(Number(element.dataset.hudHits ?? "0") + 1);
      },
      true,
    );
  });
}

async function gameHits(page: Page) {
  return page.frameLocator("iframe").locator("canvas").evaluate((element) => Number(element.dataset.hudHits ?? "0"));
}

async function pokeCenter(page: Page, isMobile: boolean) {
  const frame = page.locator(".prototype-frame");
  const box = await frame.boundingBox();
  expect(box).toBeTruthy();
  const x = box!.x + box!.width / 2;
  const y = box!.y + box!.height / 2;
  if (isMobile) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
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
  await expect(page.getByTestId("prototype-player")).toHaveAttribute("data-prototype-ready", "1");
  const handle = page.getByTestId("hud-handle");
  await expect(handle).toBeVisible();
  await expect(handle).toHaveAttribute("aria-expanded", "false");
  await expect(handle).toHaveAttribute("aria-controls", "prototype-hud");
  await expect(page.getByTestId("close-prototype")).toBeHidden();
  await expect(page.getByTestId("fullscreen")).toBeHidden();
  const cue = page.getByTestId("hud-cue");
  await expect(cue).toBeVisible();
  await expect(cue).toHaveText("Abrir controles");
  const cueEvents = await cue.evaluate((element) => getComputedStyle(element).pointerEvents);
  expect(cueEvents).toBe("none");
  const handleBox = await handle.boundingBox();
  const cueBox = await cue.boundingBox();
  const grip = await page.locator(".hud-handle-grip").boundingBox();
  const frame = await page.locator(".prototype-frame").boundingBox();
  expect(handleBox).toBeTruthy();
  expect(cueBox).toBeTruthy();
  expect(grip).toBeTruthy();
  expect(frame).toBeTruthy();
  expect(handleBox!.width).toBeGreaterThanOrEqual(43.5);
  expect(handleBox!.height).toBeGreaterThanOrEqual(43.5);
  expect(cueBox!.x + cueBox!.width).toBeLessThanOrEqual(handleBox!.x + 2);
  expect(cueBox!.y).toBeLessThan(handleBox!.y + handleBox!.height);
  expect(cueBox!.y + cueBox!.height).toBeGreaterThan(handleBox!.y);
  const finePointer = await page.evaluate(() => window.matchMedia("(hover: hover) and (pointer: fine)").matches);
  if (finePointer) {
    expect(grip!.width).toBeGreaterThanOrEqual(32);
    expect(grip!.height).toBeGreaterThanOrEqual(32);
    expect(grip!.width).toBeLessThanOrEqual(40);
    expect(handleBox!.width).toBeLessThanOrEqual(60);
  } else {
    expect(grip!.width).toBeLessThanOrEqual(22);
    expect(grip!.height).toBeLessThanOrEqual(22);
  }
  expect((viewport?.width ?? 0) - (handleBox!.x + handleBox!.width)).toBeLessThanOrEqual(64);
  expect((viewport?.height ?? 0) - (handleBox!.y + handleBox!.height)).toBeLessThanOrEqual(64);
  const opacity = await page.locator(".hud-handle-grip").evaluate((element) => Number(getComputedStyle(element).opacity));
  expect(opacity).toBeGreaterThan(0.3);
  expect(opacity).toBeLessThan(0.9);
  const centerX = frame!.x + frame!.width / 2;
  const centerY = frame!.y + frame!.height / 2;
  const coversCenter =
    centerX >= handleBox!.x &&
    centerX <= handleBox!.x + handleBox!.width &&
    centerY >= handleBox!.y &&
    centerY <= handleBox!.y + handleBox!.height;
  expect(coversCenter).toBe(false);
  const clear = await page.locator(".prototype-frame").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return hit === element || element.contains(hit);
  });
  expect(clear).toBe(true);
  const handleHit = await handle.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return hit === element || element.contains(hit);
  });
  expect(handleHit).toBe(true);

  await expect.poll(async () => cue.isHidden(), { timeout: 5000 }).toBe(true);
  await expect(handle).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("close-prototype")).toBeHidden();

  await armGameHits(page);
  await pokeCenter(page, isMobile);
  expect(await gameHits(page)).toBeGreaterThan(0);
  await expect(handle).toHaveAttribute("aria-expanded", "false");

  await press(page, "hud-handle", isMobile);
  await expect(handle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("prototype-hud")).toBeVisible();
  const back = await page.getByTestId("close-prototype").boundingBox();
  const full = await page.getByTestId("fullscreen").boundingBox();
  expect(back).toBeTruthy();
  expect(full).toBeTruthy();
  // WebKit puede devolver 43.999 para un min-height de 44 px.
  expect(back!.height).toBeGreaterThanOrEqual(43.5);
  expect(back!.width).toBeGreaterThanOrEqual(43.5);
  expect(full!.width).toBeGreaterThanOrEqual(43.5);
  expect(full!.height).toBeGreaterThanOrEqual(43.5);

  const hitsBeforeOutside = await gameHits(page);
  await pokeCenter(page, isMobile);
  expect(await gameHits(page)).toBe(hitsBeforeOutside);
  await expect(handle).toHaveAttribute("aria-expanded", "false");

  await page.keyboard.press("Escape");
  await expect(handle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("close-prototype")).toBeFocused();
  const outline = await page.getByTestId("close-prototype").evaluate((element) => getComputedStyle(element).outlineStyle);
  expect(outline).not.toBe("none");
  await page.keyboard.press("Escape");
  await expect(handle).toHaveAttribute("aria-expanded", "false");
  await expect(handle).toBeFocused();
  const handleOutline = await handle.evaluate((element) => getComputedStyle(element).outlineStyle);
  expect(handleOutline).not.toBe("none");
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
  const mode = isMobile ? "tap" : "click";
  await expandPrototypeHud(page, mode);
  const full = page.getByTestId("fullscreen");
  await expect(full).toBeVisible();
  await press(page, "fullscreen", isMobile);
  await expect(page.getByTestId("hud-handle")).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#stage")).toHaveClass(/is-pseudo-fullscreen/);
  await expect(full).toHaveText("Salir");
  await expect(full).toHaveAttribute("aria-pressed", "true");
  const immersed = await page.locator("#stage").evaluate((element) => {
    const style = getComputedStyle(element);
    return { position: style.position, height: style.height };
  });
  expect(immersed.position).toBe("fixed");
  expect(immersed.height.endsWith("px")).toBe(true);
  await expandPrototypeHud(page, mode);
  await press(page, "fullscreen", isMobile);
  await expect(page.locator("#stage")).not.toHaveClass(/is-pseudo-fullscreen/);
  await expect(full).toHaveText("Pantalla completa");

  await expandPrototypeHud(page, mode);
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
  await expect(page.getByTestId("hud-handle")).toBeVisible();
  await expect(page.getByTestId("hud-handle")).toHaveAttribute("aria-expanded", "false");
  await expandPrototypeHud(page, mode);
  await expect(page.getByTestId("fullscreen")).toBeHidden();
  await expect(page.getByTestId("close-prototype")).toBeVisible();
});
