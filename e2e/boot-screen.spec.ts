import { expect, test, type Page } from "@playwright/test";

const slowApp = `<!doctype html><html><body><p>abriendo</p><script>
window.__protoLabApp = { stop: function () {} };
parent.postMessage({ source: "proto-lab", type: "alive" }, "*");
</script></body></html>`;

async function openSlowChispa(page: Page) {
  await page.route(/\/protos\/chispa\/?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: slowApp,
    });
  });
  await page.goto("/?e2e=1");
  await expect(page.getByTestId("world-ready")).toBeVisible();
  await page.evaluate(() => {
    if (!window.__protoLab?.openPrototype) throw new Error("openPrototype no disponible");
    window.__protoLab.openPrototype("chispa");
  });
}

test("la apertura muestra el avance y desaparece con ready", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openSlowChispa(page);
  const status = page.getByTestId("prototype-status");
  await expect(status).toBeVisible();
  await expect(status).toHaveAttribute("role", "progressbar");
  await expect(status).not.toHaveAttribute("aria-valuenow", /.*/);
  await expect(status.locator("img")).toHaveCount(0);
  await expect(status).toHaveAttribute("data-boot", "opening");
  await expect(status.locator("[data-boot-lines='opening'] span").first()).toHaveText("Subiendo el telón");
  await expect(status.locator(".prototype-boot-percent")).toBeHidden();
  await expect(status.locator(".prototype-boot-orbit")).toHaveCSS("opacity", "0");
  await expect(status.locator(".prototype-boot-spin")).toHaveCSS("animation-name", "none");
  const box = await status.locator(".prototype-boot-mark").boundingBox();
  expect(box).not.toBeNull();
  const viewport = page.viewportSize();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual((viewport?.height ?? 0) + 1);

  const frame = page.frameLocator("iframe");
  await frame.locator("body").evaluate(() => {
    parent.postMessage({ source: "proto-lab", type: "progress", loaded: -1, total: 100 }, "*");
  });
  await expect(status).not.toHaveAttribute("aria-valuenow", /.*/);
  await frame.locator("body").evaluate(() => {
    parent.postMessage({ source: "proto-lab", type: "progress", loaded: 30, total: 100 }, "*");
  });
  await expect(status).toHaveAttribute("aria-valuenow", "30");
  await expect(status).toHaveAttribute("data-progress", "30");
  await expect(status).toHaveAttribute("data-boot", "download");
  await expect(status.locator(".prototype-boot-percent")).toHaveText("30 %");
  await expect(status.locator("[data-boot-lines='download'] span").first()).toHaveText("Los bytes hacen cola");
  await expect(status.locator(".prototype-boot-arc")).toHaveCSS("stroke", "rgb(255, 183, 3)");

  await frame.locator("body").evaluate(() => {
    parent.postMessage({ source: "proto-lab", type: "progress", loaded: 100, total: 100 }, "*");
  });
  await expect(status).toHaveAttribute("aria-valuenow", "100");
  await expect(status).toHaveAttribute("data-boot", "preparing");
  await expect(status.locator(".prototype-boot-percent")).toBeHidden();
  await expect(status.locator("[data-boot-lines='preparing'] span").first()).toHaveText("El motor se ata los cordones");
  await expect(status.locator(".prototype-boot-arc")).toHaveCSS("stroke", "rgb(246, 241, 231)");
  await expect(status.locator(".prototype-boot-orbit")).toHaveCSS("opacity", "1");
  await expect(status.locator(".prototype-boot-orbit")).toHaveCSS("animation-name", "none");

  await frame.locator("body").evaluate(() => {
    parent.postMessage({ source: "proto-lab", type: "ready" }, "*");
  });
  await expect(status).toHaveCount(0);
  await expect(page.getByTestId("prototype-player")).toHaveAttribute("data-prototype-ready", "1");
  await page.getByTestId("close-prototype").click();
  await expect(page.getByTestId("prototype-player")).toBeHidden();
});
