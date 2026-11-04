import { expect, test } from "@playwright/test";
import { skipUnlessWebKitIphone } from "./helpers";

test("en el iPhone el zoom se conserva al cerrar la conversación y la pizarra", async ({ page }, testInfo) => {
  skipUnlessWebKitIphone(testInfo, "el zoom del lobby se comprueba en el iPhone");
  await page.goto("/?e2e=1");
  await expect(page.getByTestId("world-ready")).toBeVisible();

  await page.evaluate(() => window.__protoLab?.focus("inventor"));
  await expect(page.getByTestId("interact")).toHaveText("Hablar con el Inventor");
  await page.evaluate(() => window.__protoLab?.setFollowDistance?.(2.4));
  await expect.poll(async () => page.evaluate(() => window.__protoLab?.cameraRig?.()?.span ?? -1)).toBeCloseTo(2.4, 1);
  const beforeTalk = await page.evaluate(() => window.__protoLab?.cameraRig?.() ?? null);
  expect(beforeTalk?.mode).toBe("follow");
  expect(beforeTalk?.distance).toBeCloseTo(2.4, 2);

  await page.getByTestId("interact").click();
  await expect(page.getByTestId("dialogue")).toBeVisible();
  await expect.poll(async () => page.evaluate(() => window.__protoLab?.cameraRig?.()?.mode ?? "")).toBe("dialogue");
  expect(await page.evaluate(() => window.__protoLab?.cameraRig?.()?.span ?? 99)).toBeLessThan(2.2);

  await page.getByTestId("choice-bye").click();
  await expect(page.getByTestId("dialogue")).toBeHidden();
  await expect
    .poll(async () => page.evaluate(() => window.__protoLab?.cameraRig?.() ?? null))
    .toMatchObject({
      mode: "follow",
      distance: beforeTalk!.distance,
      yaw: beforeTalk!.yaw,
      pitch: beforeTalk!.pitch,
    });
  await expect.poll(async () => page.evaluate(() => window.__protoLab?.cameraRig?.()?.span ?? -1)).toBeCloseTo(2.4, 1);

  await page.evaluate(() => window.__protoLab?.focus("chalkboard"));
  await expect(page.getByTestId("interact")).toHaveText("Ver la pizarra");
  await page.evaluate(() => window.__protoLab?.setFollowDistance?.(2.4));
  await expect.poll(async () => page.evaluate(() => window.__protoLab?.cameraRig?.()?.span ?? -1)).toBeCloseTo(2.4, 1);
  const beforeBoard = await page.evaluate(() => window.__protoLab?.cameraRig?.() ?? null);

  await page.getByTestId("interact").click();
  await expect(page.locator("#viewport")).toHaveAttribute("data-board-view", "1");
  await expect.poll(async () => page.evaluate(() => window.__protoLab?.whiteboardView?.()?.phase ?? "")).toBe("hold");
  expect(await page.evaluate(() => window.__protoLab?.cameraRig?.()?.mode ?? "")).toBe("board");

  await page.getByTestId("board-back").click();
  await expect(page.locator("#viewport")).toHaveAttribute("data-board-view", "0");
  await expect
    .poll(async () => page.evaluate(() => window.__protoLab?.cameraRig?.() ?? null))
    .toMatchObject({
      mode: "follow",
      distance: beforeBoard!.distance,
      yaw: beforeBoard!.yaw,
      pitch: beforeBoard!.pitch,
    });
  await expect.poll(async () => page.evaluate(() => window.__protoLab?.cameraRig?.()?.span ?? -1)).toBeCloseTo(2.4, 1);
  const restored = await page.evaluate(() => window.__protoLab?.cameraRig?.()?.distance ?? 0);
  expect(restored).toBeLessThan(4);
});

test("en el iPhone un doble toque no agranda la página ni aleja la cámara", async ({ page }, testInfo) => {
  skipUnlessWebKitIphone(testInfo, "el doble toque se comprueba en el iPhone");
  await page.goto("/?e2e=1");
  await expect(page.getByTestId("world-ready")).toBeVisible();
  await page.evaluate(() => window.__protoLab?.setFollowDistance?.(2.4));
  await expect.poll(async () => page.evaluate(() => window.__protoLab?.cameraRig?.()?.span ?? -1)).toBeCloseTo(2.4, 1);
  const before = await page.evaluate(() => window.__protoLab?.cameraRig?.()?.distance ?? 0);

  const canvas = page.locator("#viewport canvas");
  await canvas.dblclick({ position: { x: 40, y: 120 }, force: true });
  const blocked = await page.evaluate(() => {
    const target = document.querySelector("#viewport canvas");
    const event = new Event("gesturestart", { bubbles: true, cancelable: true });
    target?.dispatchEvent(event);
    const meta = document.querySelector('meta[name="viewport"]')?.getAttribute("content") ?? "";
    return { blocked: event.defaultPrevented, meta, scale: window.visualViewport?.scale ?? 1 };
  });
  expect(blocked.blocked).toBe(true);
  expect(blocked.meta).toContain("user-scalable=no");
  expect(blocked.scale).toBe(1);
  await expect.poll(async () => page.evaluate(() => window.__protoLab?.cameraRig?.()?.distance ?? -1)).toBeCloseTo(before, 2);
  expect(await page.evaluate(() => window.__protoLab?.cameraRig?.()?.mode ?? "")).toBe("follow");
});
