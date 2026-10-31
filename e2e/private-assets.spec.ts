import { devices, expect, test } from "@playwright/test";
import { skipUnlessChromium } from "./helpers";

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

async function openAssetLab(page: import("@playwright/test").Page) {
  await page.goto("/?e2e=1");
  await expect(page.getByTestId("world-ready")).toBeVisible();
  await page.evaluate(() => {
    if (!window.__protoLab?.openPrototype) throw new Error("openPrototype no disponible");
    window.__protoLab.openPrototype("asset-lab");
  });
  await expect(page.getByTestId("prototype-chrome")).toBeVisible();
}

async function waitAssetLabReady(frame: ReturnType<import("@playwright/test").Page["frameLocator"]>) {
  await expect(frame.getByTestId("lab-title")).toBeVisible();
  await expect.poll(async () => frame.locator("body").getAttribute("data-media-ok")).toBe("1");
}

test.describe("recursos privados del puente", () => {
  test.describe.configure({ mode: "serial" });

  test("canvas, WebGL y Web Audio con blob URLs", async ({ page, isMobile }) => {
    await openAssetLab(page);
    const frame = page.frameLocator("iframe");
    await waitAssetLabReady(frame);
    await expect(frame.locator("body")).toHaveAttribute("data-test_canvas2d", "1");
    await expect(frame.locator("body")).toHaveAttribute("data-test_webgl", "1");
    await expect(frame.locator("body")).toHaveAttribute("data-test_audio", "1");
  });

  test("CSP presente y bloquea fetch externo", async ({ page, isMobile }) => {
    await openAssetLab(page);
    const frame = page.frameLocator("iframe");
    await waitAssetLabReady(frame);
    const csp = await frame.locator("body").evaluate(() => window.__assetLab?.cspPresent() ?? false);
    expect(csp).toBe(true);
    const external = await frame.locator("body").evaluate(async () => window.__assetLab?.probeExternalFetch() ?? "");
    expect(external).not.toBe("allowed");
  });

  test("rechaza rutas fuera de la lista y con ..", async ({ page, isMobile }) => {
    await openAssetLab(page);
    const frame = page.frameLocator("iframe");
    await waitAssetLabReady(frame);
    const badListed = await frame.locator("body").evaluate(async () => window.__assetLab?.probeBadAsset("media/ghost.png") ?? "");
    expect(badListed).not.toBe("unexpected-ok");
    const dotDot = await frame.locator("body").evaluate(async () => window.__assetLab?.probeBadAsset("../media/pixel.png") ?? "");
    expect(dotDot).not.toBe("unexpected-ok");
  });

  test("chispa sigue arrancando con la CSP del cargador", async ({ page, isMobile }) => {
    await page.goto("/?e2e=1");
    await expect(page.getByTestId("world-ready")).toBeVisible();
    await openSelector(page, isMobile);
    await playFromSelector(page, isMobile);
    const frame = page.frameLocator("iframe");
    await expect(frame.getByTestId("game-title")).toBeVisible();
    await expect(frame.locator("canvas")).toBeVisible();
  });

  test("mensajes de asset desde otra ventana se ignoran", async ({ page, isMobile }) => {
    await openAssetLab(page);
    await expect(page.locator("iframe")).toBeVisible();
    await page.evaluate(() => {
      window.postMessage({ source: "proto-lab", type: "asset-request", id: 42, path: "media/pixel.png" }, "*");
    });
    const frame = page.frameLocator("iframe");
    await waitAssetLabReady(frame);
  });

  test("límite de peticiones en el iframe", async ({ page, isMobile }) => {
    await openAssetLab(page);
    const frame = page.frameLocator("iframe");
    await waitAssetLabReady(frame);
    const overflow = await frame.locator("body").evaluate(async () => {
      const assets = window.__protoLabAssets;
      if (!assets) return "sin-puente";
      let last = "";
      for (let index = 0; index < 70; index += 1) {
        try {
          await assets.getBlobUrl("media/pixel.png");
          last = "ok";
        } catch (error) {
          last = error instanceof Error ? error.message : "error";
        }
      }
      return last;
    });
    expect(overflow).toBe("rate-limit");
  });

  test("detrás de Access el puente sigue sirviendo bytes", async ({ browser }, testInfo) => {
    skipUnlessChromium(testInfo, "perfil Pixel 7");
    const context = await browser.newContext({ ...devices["Pixel 7"], locale: "es-ES" });
    await context.addCookies([{ name: "CF_Authorization", value: "sesion-de-prueba", url: "http://127.0.0.1:4173" }]);
    const page = await context.newPage();
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
    await openAssetLab(page);
    const frame = page.frameLocator("iframe");
    await waitAssetLabReady(frame);
    await context.close();
  });
});
