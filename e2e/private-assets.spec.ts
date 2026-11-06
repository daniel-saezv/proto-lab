import { devices, expect, test } from "@playwright/test";
import { expandPrototypeHud, skipUnlessChromium } from "./helpers";

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

  test("JSON relativo y guardado por slug", async ({ page }) => {
    await page.goto("/?e2e=1");
    await expect(page.getByTestId("world-ready")).toBeVisible();
    await page.evaluate(() => localStorage.removeItem("proto-lab:app:asset-lab"));
    await page.evaluate(() => {
      if (!window.__protoLab?.openPrototype) throw new Error("openPrototype no disponible");
      window.__protoLab.openPrototype("asset-lab");
    });
    await expect(page.getByTestId("prototype-chrome")).toBeVisible();
    const frame = page.frameLocator("iframe");
    await waitAssetLabReady(frame);
    const note = await frame.locator("body").evaluate(async () => window.__assetLab?.loadNote());
    expect(note).toEqual({ nota: "laboratorio" });
    const mime = await frame.locator("body").evaluate(async () => window.__assetLab?.jsonMime() ?? "");
    expect(mime).toBe("application/json");
    const saved = await frame.locator("body").evaluate(async () => window.__assetLab?.roundtripSave("partida", "noche-1") ?? null);
    expect(saved).toBe("noche-1");
    const outside = await frame.locator("body").evaluate(async () => window.__assetLab?.probeRelative("../chispa/index.html") ?? "");
    expect(outside).toBe("not-allowed");
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          window.postMessage({ source: "proto-lab", type: "save", id: 99, op: "set", key: "intruso", value: "no" }, "*");
          setTimeout(resolve, 0);
        }),
    );
    const bag = await page.evaluate(() => localStorage.getItem("proto-lab:app:asset-lab") ?? "");
    expect(bag).toContain("noche-1");
    expect(bag).not.toContain("intruso");
    expect(await page.evaluate(() => localStorage.getItem("proto-lab:app:chispa"))).toBeNull();
    await expandPrototypeHud(page);
    await page.getByTestId("close-prototype").click();
    await expect(page.getByTestId("prototype-chrome")).toBeHidden();
    await page.evaluate(() => {
      if (!window.__protoLab?.openPrototype) throw new Error("openPrototype no disponible");
      window.__protoLab.openPrototype("asset-lab");
    });
    await expect(page.getByTestId("prototype-chrome")).toBeVisible();
    const again = page.frameLocator("iframe");
    await expect.poll(async () => again.locator("body").evaluate(() => typeof window.__assetLab?.readSave === "function")).toBe(true);
    await expect.poll(async () => again.locator("body").evaluate(async () => window.__assetLab?.readSave("partida") ?? null)).toBe("noche-1");
    await page.evaluate(() => localStorage.removeItem("proto-lab:app:asset-lab"));
  });
});
