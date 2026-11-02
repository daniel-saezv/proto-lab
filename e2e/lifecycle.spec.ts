import { expect, test } from "@playwright/test";

test("cada aplicación visible abre, avisa ready y el laboratorio vuelve", async ({ page }) => {
  await page.goto("/?e2e=1");
  await expect(page.getByTestId("world-ready")).toBeVisible();
  await expect(page.locator("#viewport")).toHaveAttribute("data-gpu", "1");
  await page.evaluate(() => window.__protoLab?.visitSlacker?.());
  const pose = await page.evaluate(() => window.__protoLab?.playerPose?.() ?? null);
  expect(pose).not.toBeNull();
  const slugs = await page.evaluate(() => window.__protoLab?.visibleApps?.() ?? []);
  expect(slugs.length).toBeGreaterThan(0);
  expect(slugs).not.toContain("asset-lab");

  for (const slug of slugs) {
    const before = await page.evaluate(() => window.__protoLab?.renderFrame?.() ?? 0);
    await page.evaluate((name) => {
      if (!window.__protoLab?.openPrototype) throw new Error("openPrototype no disponible");
      window.__protoLab.openPrototype(name);
    }, slug);
    await expect(page.locator("#viewport")).toHaveAttribute("data-gpu", "0");
    await expect(page.locator("#viewport canvas")).toHaveCount(0);
    await expect(page.locator("#viewport")).toHaveAttribute("data-render-suspended", "1");
    const frame = page.frameLocator("iframe");
    await expect(page.getByTestId("prototype-player")).toHaveAttribute("data-prototype-ready", "1");
    await expect(page.getByTestId("prototype-error")).toHaveCount(0);
    await expect(page.getByTestId("prototype-status")).toHaveCount(0);
    const painted = await frame.locator("body").evaluate(() => {
      const canvas = document.querySelector("canvas");
      if (canvas instanceof HTMLCanvasElement && canvas.width > 0 && canvas.height > 0) return "canvas";
      return (document.body?.innerText ?? "").trim().length > 0 ? "text" : "blank";
    });
    expect(painted).not.toBe("blank");
    await expect(page.locator("iframe")).not.toHaveAttribute("sandbox", /.+/);
    await expect(page.locator("iframe")).toHaveAttribute("src", new RegExp(`/protos/${slug}/`));

    await page.getByTestId("close-prototype").click();
    await expect(page.getByTestId("prototype-player")).toBeHidden();
    await expect(page.locator("iframe")).toHaveCount(0);
    await expect(page.locator("#viewport")).toHaveAttribute("data-gpu", "1");
    await expect(page.locator("#viewport")).toHaveAttribute("data-render-suspended", "0");
    await expect(page.locator("#viewport canvas")).toHaveCount(1);
    await expect.poll(async () => page.evaluate(() => window.__protoLab?.renderFrame?.() ?? 0)).toBeGreaterThan(before);
    const after = await page.evaluate(() => window.__protoLab?.playerPose?.() ?? null);
    expect(after).toEqual(pose);
  }
});
