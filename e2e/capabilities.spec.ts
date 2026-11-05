import { expect, test } from "@playwright/test";
import { expandPrototypeHud } from "./helpers";

test("allow sale de la lista y save sin declarar se ignora", async ({ page }) => {
  const home = await page.request.get("/");
  expect(home.headers()["permissions-policy"] ?? "").toContain("camera=(self)");
  expect(home.headers()["permissions-policy"] ?? "").toContain("magnetometer=(self)");
  const index = await page.request.get("/index.html");
  expect(index.headers()["permissions-policy"] ?? "").toBe(home.headers()["permissions-policy"] ?? "");
  const assetLab = await page.request.get("/protos/asset-lab/");
  const assetPolicy = assetLab.headers()["permissions-policy"] ?? "";
  expect(assetPolicy).toContain("geolocation=(self)");
  expect(assetPolicy).toContain("camera=()");
  expect(assetPolicy).not.toContain("camera=(self)");
  expect(assetPolicy).toContain("payment=()");
  const chispaPage = await page.request.get("/protos/chispa/");
  const chispaPolicy = chispaPage.headers()["permissions-policy"] ?? "";
  expect(chispaPolicy).toContain("geolocation=()");
  expect(chispaPolicy).not.toContain("(self)");
  const sw = await page.request.get("/sw.js");
  expect(sw.headers()["permissions-policy"] ?? "").toContain("camera=()");
  expect(sw.headers()["permissions-policy"] ?? "").not.toContain("(self)");

  await page.goto("/?e2e=1");
  await expect(page.getByTestId("world-ready")).toBeVisible();
  await page.evaluate(() => {
    localStorage.removeItem("proto-lab:app:asset-lab");
    localStorage.removeItem("proto-lab:app:chispa");
  });

  await page.evaluate(() => {
    if (!window.__protoLab?.openPrototype) throw new Error("openPrototype no disponible");
    window.__protoLab.openPrototype("asset-lab");
  });
  const lab = page.locator("iframe");
  await expect(lab).toHaveAttribute("allow", "geolocation");
  await expandPrototypeHud(page);
  await page.getByTestId("close-prototype").click();
  await expect(page.locator("iframe")).toHaveCount(0);

  await page.evaluate(() => {
    if (!window.__protoLab?.openPrototype) throw new Error("openPrototype no disponible");
    window.__protoLab.openPrototype("chispa");
  });
  await expect(page.getByTestId("prototype-player")).toHaveAttribute("data-prototype-ready", "1");
  const chispa = page.locator("iframe");
  await expect(chispa).toBeVisible();
  expect(await chispa.getAttribute("allow")).toBeNull();

  const outcome = await page.frameLocator("iframe").locator("body").evaluate(
    () =>
      new Promise<string>((resolve) => {
        let answered = false;
        const onMessage = (event: MessageEvent) => {
          const data = event.data as { source?: string; type?: string; id?: number } | null;
          if (data?.source === "proto-lab" && data.type === "save-result" && data.id === 7) answered = true;
        };
        window.addEventListener("message", onMessage);
        window.parent.postMessage(
          { source: "proto-lab", type: "save", id: 7, op: "set", key: "partida", value: "no" },
          "*",
        );
        window.setTimeout(() => {
          window.removeEventListener("message", onMessage);
          resolve(answered ? "answered" : "ignored");
        }, 250);
      }),
  );
  expect(outcome).toBe("ignored");
  expect(await page.evaluate(() => localStorage.getItem("proto-lab:app:chispa"))).toBeNull();
});
