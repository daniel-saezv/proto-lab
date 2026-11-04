import { expect, test } from "@playwright/test";
import { skipUnlessGestureEngine, skipUnlessTouchMobile, TOUCH_MOBILE_TAG } from "./helpers";

test("el zoom del lobby se conserva al cerrar la conversación y la pizarra", { tag: TOUCH_MOBILE_TAG }, async ({ page }, testInfo) => {
  skipUnlessTouchMobile(testInfo, "el zoom del lobby se comprueba en móvil táctil");
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

test(
  "un doble toque táctil no agranda la página ni aleja la cámara",
  { tag: TOUCH_MOBILE_TAG },
  async ({ page }, testInfo) => {
    skipUnlessTouchMobile(testInfo, "el doble toque se comprueba en móvil táctil");
    await page.goto("/?e2e=1");
    await expect(page.getByTestId("world-ready")).toBeVisible();
    await page.evaluate(() => window.__protoLab?.setFollowDistance?.(2.4));
    await expect.poll(async () => page.evaluate(() => window.__protoLab?.cameraRig?.()?.span ?? -1)).toBeCloseTo(2.4, 1);
    const beforeRig = await page.evaluate(() => window.__protoLab?.cameraRig?.() ?? null);
    const before = beforeRig?.distance ?? 0;

    const blocked = await page.evaluate(() => {
      const target = document.querySelector("#viewport canvas");
      if (!(target instanceof HTMLElement)) throw new Error("falta el lienzo");
      const dblclick = (clientX: number, clientY: number) => {
        const event = new MouseEvent("dblclick", {
          bubbles: true,
          cancelable: true,
          detail: 2,
          clientX,
          clientY,
        });
        target.dispatchEvent(event);
        return event.defaultPrevented;
      };
      const mouseBlocked = dblclick(40, 120);
      target.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          pointerId: 4,
          pointerType: "touch",
          clientX: 1,
          clientY: 1,
        }),
      );
      const touchBlocked = dblclick(40, 120);
      const meta = document.querySelector('meta[name="viewport"]')?.getAttribute("content") ?? "";
      return { mouseBlocked, touchBlocked, meta, scale: window.visualViewport?.scale ?? 1 };
    });
    expect(blocked.mouseBlocked).toBe(false);
    expect(blocked.touchBlocked).toBe(true);
    expect(blocked.meta).toContain("user-scalable=no");
    expect(blocked.scale).toBe(1);
    const after = await page.evaluate(() => window.__protoLab?.cameraRig?.() ?? null);
    expect(after?.distance).toBeCloseTo(before, 2);
    expect(after?.yaw).toBeCloseTo(beforeRig?.yaw ?? 0, 2);
    expect(after?.pitch).toBeCloseTo(beforeRig?.pitch ?? 0, 2);
    expect(after?.mode).toBe("follow");
  },
);

// gesturestart y gesturechange no forman parte de la plataforma web.
// El parche que los cancela está justificado en apps/world/src/page-zoom.ts.
test("el pellizco no estándar no escala la página", async ({ page }, testInfo) => {
  skipUnlessGestureEngine(testInfo);
  await page.goto("/?e2e=1");
  await expect(page.getByTestId("world-ready")).toBeVisible();
  const blocked = await page.evaluate(() => {
    const target = document.querySelector("#viewport canvas");
    const start = new Event("gesturestart", { bubbles: true, cancelable: true });
    const change = new Event("gesturechange", { bubbles: true, cancelable: true });
    target?.dispatchEvent(start);
    target?.dispatchEvent(change);
    return { start: start.defaultPrevented, change: change.defaultPrevented };
  });
  expect(blocked.start).toBe(true);
  expect(blocked.change).toBe(true);
});

test("los dos sticks actúan en los mismos fotogramas", { tag: TOUCH_MOBILE_TAG }, async ({ page }, testInfo) => {
  skipUnlessTouchMobile(testInfo, "los dos sticks se comprueban en móvil táctil");
  await page.goto("/?e2e=1");
  await expect(page.getByTestId("world-ready")).toBeVisible();
  const trace = await page.evaluate(async () => {
    const move = document.querySelector("#touch-zone-move");
    const look = document.querySelector("#touch-zone-look");
    if (!(move instanceof HTMLElement) || !(look instanceof HTMLElement)) throw new Error("faltan los sticks");
    const left = move.getBoundingClientRect();
    const right = look.getBoundingClientRect();
    const point = (id: number, x: number, y: number, type: string) => {
      const target = id === 1 ? move : look;
      target.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: id,
          pointerType: "touch",
          clientX: x,
          clientY: y,
          button: 0,
          buttons: type === "pointerup" ? 0 : 1,
        }),
      );
    };
    const lx = left.left + left.width * 0.5;
    const ly = left.top + left.height * 0.55;
    const rx = right.left + right.width * 0.45;
    const ry = right.top + right.height * 0.5;
    const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    point(1, lx, ly, "pointerdown");
    point(1, lx, ly - 80, "pointermove");
    point(2, rx, ry, "pointerdown");
    const startPose = window.__protoLab?.playerPose?.();
    const startRig = window.__protoLab?.cameraRig?.();
    let together = false;
    for (let i = 0; i < 30; i++) {
      point(1, lx, ly - 80, "pointermove");
      point(2, rx + 70, ry, "pointermove");
      await frame();
      const pose = window.__protoLab?.playerPose?.();
      const rig = window.__protoLab?.cameraRig?.();
      const walked = Math.hypot((pose?.x ?? 0) - (startPose?.x ?? 0), (pose?.z ?? 0) - (startPose?.z ?? 0));
      const turned = Math.abs((rig?.yaw ?? 0) - (startRig?.yaw ?? 0));
      if (walked > 0.05 && turned > 0.02) together = true;
    }
    point(1, lx, ly - 80, "pointerup");
    point(2, rx + 70, ry, "pointerup");
    const endPose = window.__protoLab?.playerPose?.();
    const endRig = window.__protoLab?.cameraRig?.();
    return {
      together,
      startPose,
      endPose,
      startYaw: startRig?.yaw,
      endYaw: endRig?.yaw,
    };
  });
  expect(trace.together).toBe(true);
});

test("un pellizco no cambia la cámara ni la escala", { tag: TOUCH_MOBILE_TAG }, async ({ page }, testInfo) => {
  skipUnlessTouchMobile(testInfo, "el pellizco se comprueba en móvil táctil");
  await page.goto("/?e2e=1");
  await expect(page.getByTestId("world-ready")).toBeVisible();
  await page.evaluate(() => window.__protoLab?.setFollowDistance?.(2.4));
  await expect.poll(async () => page.evaluate(() => window.__protoLab?.cameraRig?.()?.distance ?? -1)).toBeCloseTo(2.4, 2);
  const before = await page.evaluate(() => window.__protoLab?.cameraRig?.() ?? null);
  const after = await page.evaluate(async () => {
    const look = document.querySelector("#touch-zone-look");
    if (!(look instanceof HTMLElement)) throw new Error("falta el stick derecho");
    const box = look.getBoundingClientRect();
    const x = box.left + box.width * 0.5;
    const y = box.top + box.height * 0.5;
    const point = (id: number, px: number, py: number, type: string) => {
      look.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: id,
          pointerType: "touch",
          clientX: px,
          clientY: py,
          button: 0,
          buttons: type === "pointerup" ? 0 : 1,
        }),
      );
    };
    point(7, x - 20, y, "pointerdown");
    point(8, x + 20, y, "pointerdown");
    for (let i = 1; i <= 6; i++) {
      point(7, x - 20 - i * 12, y - i * 8, "pointermove");
      point(8, x + 20 + i * 12, y + i * 8, "pointermove");
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    point(7, x - 92, y - 48, "pointerup");
    point(8, x + 92, y + 48, "pointerup");
    return {
      rig: window.__protoLab?.cameraRig?.() ?? null,
      scale: window.visualViewport?.scale ?? 1,
    };
  });
  expect(after.scale).toBe(1);
  expect(after.rig?.distance).toBeCloseTo(before?.distance ?? -1, 2);
  expect(after.rig?.yaw).toBeCloseTo(before?.yaw ?? 0, 2);
  expect(after.rig?.pitch).toBeCloseTo(before?.pitch ?? 0, 2);
});
