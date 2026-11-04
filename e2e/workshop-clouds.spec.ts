import { expect, test, type Page } from "@playwright/test";
import { skipUnlessChromium, skipUnlessProject } from "./helpers";

const roundOne = [
  "¿Y si la cometa dejara un rastro de luz?",
  "¿Y si se pudiera guardar el camino?",
  "¿Y si avisara al llegar al borde?",
  "¿Y si el color cambiara con la altura?",
];

const roundTwo = [
  "¿Y si el rastro se pudiera borrar?",
  "¿Y si la luz siguiera el dedo?",
  "¿Y si hubiera un color por amigo?",
  "¿Y si el rastro durara un segundo?",
];

const roundThree = [
  "¿Y si la cometa volviera sola?",
  "¿Y si el cielo cambiara de hora?",
  "¿Y si se pudiera compartir el cielo?",
  "¿Y si guardara el mejor vuelo?",
];

const original = {
  kind: "propuesta",
  title: "Cometa lunar",
  description: "Un juego corto en el que persigues una cometa con el dedo.",
};

async function mockWorkshop(page: Page) {
  await page.route("**/api/proposals/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, items: [] }),
    });
  });
  let round = 1;
  const rounds = [roundOne, roundTwo, roundThree];
  await page.route("**/api/workshop", async (route) => {
    const body = route.request().postDataJSON() as { op?: string; decision?: string };
    const shared = { draft: original, original, maxRounds: 3 };
    const pick = (current: number, options: string[]) => ({
      ok: true,
      phase: "pick",
      sessionId: "a".repeat(32),
      speech: `Ronda ${current} de 3. Marca las ideas que quieres. Puedes no marcar ninguna.`,
      options,
      round: current,
      ...shared,
    });
    if (body.decision === "next") round = Math.min(3, round + 1);
    const payload =
      body.op === "abandon"
        ? { ok: true }
        : body.decision === "stop"
          ? {
              ok: true,
              phase: "summary",
              speech: "Esto es lo que dejaría en el tablón. Si quieres, corrige el título o el texto.",
              round: 1,
              ...shared,
              draft: { ...original, title: "Cometa con estela", description: "Persigues una cometa y dejas un rastro de luz." },
            }
          : pick(round, rounds[round - 1] ?? roundOne);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
  });
}

async function openRound(page: Page) {
  await page.goto("/?e2e=1");
  await expect(page.getByTestId("world-ready")).toBeVisible();
  await page.evaluate(() => window.__protoLab?.focus("inventor"));
  await page.getByTestId("interact").click();
  await page.getByTestId("choice-propose").click();
  await page.getByTestId("dialogue-input").fill("Cometa lunar");
  await page.getByTestId("dialogue-send").click();
  await page.getByTestId("dialogue-input").fill("Un juego corto en el que persigues una cometa con el dedo.");
  await page.getByTestId("dialogue-send").click();
  await page.getByTestId("choice-workshop").click();
  await expect(page.getByTestId("workshop-begin")).toBeVisible();
  await expect(page.getByTestId("dialog-close")).toBeVisible();
  await expect(page.getByTestId("dialogue-text")).toContainText("tres rondas");
  await page.getByTestId("workshop-begin").click();
  await expect(page.getByTestId("workshop-option")).toHaveCount(4);
  await expect(page.getByTestId("choice-workshop-next")).toHaveText("Seguir");
  await expect.poll(async () => (await page.locator("#dialogue .dialogue-head").boundingBox())?.width ?? 99).toBeLessThan(4);
  await expect.poll(async () => page.evaluate(() => window.__protoLab?.workshopView?.()?.camY ?? 0)).toBeGreaterThan(0.9);
  await expect.poll(async () => (await page.getByTestId("workshop-option").first().boundingBox())?.x ?? -2).toBeGreaterThanOrEqual(-1);
}

async function expectSeguirCentered(page: Page, width: number, height: number) {
  await expect.poll(async () => {
    const box = await page.getByTestId("choice-workshop-next").boundingBox();
    if (!box) return 999;
    if (box.x < -1 || box.y < -1) return 999;
    if (box.x + box.width > width + 1 || box.y + box.height > height + 1) return 999;
    return Math.abs(box.x + box.width / 2 - width / 2);
  }).toBeLessThanOrEqual(12);
}

/** Quita el modo quieto y deja terminar la llegada. Si el fill deja el -50 %, el centro se va. */
async function expectSeguirAfterArrive(page: Page, width: number, height: number) {
  await page.evaluate(() => {
    const root = document.getElementById("dialogue");
    if (!root) return;
    root.classList.remove("dialogue-still");
    root.classList.remove("dialogue-arrive");
    void root.offsetWidth;
    root.classList.add("dialogue-arrive");
  });
  await expect.poll(async () =>
    page.evaluate(({ width: viewWidth, height: viewHeight }) => {
      const root = document.getElementById("dialogue");
      const button = document.querySelector("[data-testid='choice-workshop-next']");
      if (!root || !(button instanceof HTMLElement)) return "missing";
      const arrive = root.getAnimations().find((anim) => anim instanceof CSSAnimation && anim.animationName === "dlg-arrive");
      if (arrive && arrive.playState !== "finished") return "running";
      const box = button.getBoundingClientRect();
      if (box.width < 20) return "empty";
      if (box.left < -1 || box.top < -1 || box.right > viewWidth + 1 || box.bottom > viewHeight + 1) return "offscreen";
      const offset = Math.abs(box.left + box.width / 2 - viewWidth / 2);
      return offset <= 12 ? "ok" : `offset ${offset.toFixed(1)}`;
    }, { width, height }),
  ).toBe("ok");
}

async function skipTyping(page: Page) {
  const text = page.locator("#dialogue .dialogue-text[data-typing='1']");
  if (await text.count()) await text.click({ force: true }).catch(() => {});
}

async function skipUntil(page: Page, testId: string) {
  await expect.poll(async () => {
    if (await page.getByTestId(testId).isVisible().catch(() => false)) return true;
    await skipTyping(page);
    return false;
  }).toBe(true);
}

async function expectTargets(page: Page, width: number, height: number) {
  const buttons = page.getByTestId("workshop-option");
  await expect(buttons).toHaveCount(4);
  for (let index = 0; index < 4; index += 1) {
    const box = await buttons.nth(index).boundingBox();
    expect(box).toBeTruthy();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.x).toBeGreaterThanOrEqual(-1);
    expect(box!.y).toBeGreaterThanOrEqual(-1);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
    expect(box!.y + box!.height).toBeLessThanOrEqual(height + 1);
  }
  const close = await page.getByTestId("dialog-close").boundingBox();
  expect(close).toBeTruthy();
  expect(close!.y + close!.height).toBeLessThanOrEqual(height + 1);
}

test("en escritorio las nubes se eligen con ratón y teclado", async ({ page }, testInfo) => {
  skipUnlessChromium(testInfo, "escritorio");
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockWorkshop(page);
  await openRound(page);
  await expectTargets(page, 1280, 800);
  await expectSeguirCentered(page, 1280, 800);
  await expect(page.getByRole("button", { name: roundOne[0] })).toHaveAttribute("aria-pressed", "false");
  await page.getByTestId("workshop-option").nth(0).click();
  await expect(page.getByRole("button", { name: roundOne[0] })).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("workshop-option").nth(1).focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: roundOne[1] })).toHaveAttribute("aria-pressed", "true");
  await expectSeguirAfterArrive(page, 1280, 800);
  await expect.poll(async () => page.evaluate(() => window.__protoLab?.workshopClouds?.()?.now ?? 0)).toBe(4);
  await page.screenshot({ path: "/opt/cursor/artifacts/e2e-taller-1280x800.png" });
  await page.getByTestId("choice-workshop-next").click();
  await expect(page.getByTestId("workshop-counter")).toHaveText("Ronda 2 de 3");
  await page.getByTestId("workshop-option").nth(0).click();
  await expectSeguirCentered(page, 1280, 800);
  await expectSeguirAfterArrive(page, 1280, 800);
  await expect(page.getByTestId("workshop-trail")).toContainText("rastro de luz");
  await expect.poll(async () => page.evaluate(() => window.__protoLab?.workshopClouds?.()?.past ?? 0)).toBe(2);
  await page.screenshot({ path: "/opt/cursor/artifacts/e2e-taller-1280x800-ronda2.png" });
  await page.getByTestId("choice-workshop-next").click();
  await expect(page.getByTestId("workshop-counter")).toHaveText("Ronda 3 de 3");
  await page.getByTestId("workshop-option").nth(0).click();
  await expect(page.getByRole("button", { name: roundThree[0] })).toHaveAttribute("aria-pressed", "true");
  await expectSeguirCentered(page, 1280, 800);
  await expectSeguirAfterArrive(page, 1280, 800);
  await expect(page.getByTestId("dialog-close")).toBeVisible();
  await expect(page.getByTestId("workshop-title")).toHaveCount(0);
});

test("en el móvil táctil cada idea es un objetivo de 44 px", async ({ browser }, testInfo) => {
  skipUnlessChromium(testInfo, "vista móvil táctil");
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: "es-ES",
    baseURL: "http://127.0.0.1:4173",
  });
  const page = await context.newPage();
  await mockWorkshop(page);
  await openRound(page);
  await expectTargets(page, 390, 844);
  await page.getByTestId("workshop-option").nth(0).tap();
  await expect(page.getByRole("button", { name: roundOne[0] })).toHaveAttribute("aria-pressed", "true");
  await expectSeguirCentered(page, 390, 844);
  await expectSeguirAfterArrive(page, 390, 844);
  await page.screenshot({ path: "/opt/cursor/artifacts/e2e-taller-390x844.png" });
  await page.getByTestId("choice-workshop-next").tap();
  await expect(page.getByTestId("workshop-counter")).toHaveText("Ronda 2 de 3");
  await page.getByTestId("workshop-option").nth(0).tap();
  await expectSeguirAfterArrive(page, 390, 844);
  await page.setViewportSize({ width: 412, height: 915 });
  await expectSeguirCentered(page, 412, 915);
  await expectSeguirAfterArrive(page, 412, 915);
  await expectTargets(page, 412, 915);
  await page.getByTestId("choice-workshop-next").tap();
  await expect(page.getByTestId("workshop-counter")).toHaveText("Ronda 3 de 3");
  await page.getByTestId("workshop-option").nth(0).tap();
  await expect(page.getByRole("button", { name: roundThree[0] })).toHaveAttribute("aria-pressed", "true");
  await page.setViewportSize({ width: 844, height: 390 });
  await expect.poll(async () => {
    const box = await page.getByTestId("workshop-option").first().boundingBox();
    return !!box && box.y >= -1 && box.x >= -1 && box.y + box.height <= 391 && box.x + box.width <= 845;
  }).toBe(true);
  await expectTargets(page, 844, 390);
  await expectSeguirCentered(page, 844, 390);
  await expectSeguirAfterArrive(page, 844, 390);
  await page.screenshot({ path: "/opt/cursor/artifacts/e2e-taller-844x390.png" });
  await context.close();
});

test("en WebKit la idea se marca y sigue legible", async ({ page }, testInfo) => {
  skipUnlessProject("webkit-iphone", testInfo, "proyecto webkit-iphone");
  await mockWorkshop(page);
  await openRound(page);
  const viewport = page.viewportSize();
  expect(viewport).toBeTruthy();
  await expectTargets(page, viewport!.width, viewport!.height);
  await expectSeguirCentered(page, viewport!.width, viewport!.height);
  await page.getByTestId("workshop-option").nth(2).click();
  await expect(page.getByRole("button", { name: roundOne[2] })).toHaveAttribute("aria-pressed", "true");
  await expectSeguirAfterArrive(page, viewport!.width, viewport!.height);
  await page.getByTestId("choice-workshop-next").click();
  await expect(page.getByTestId("workshop-counter")).toHaveText("Ronda 2 de 3");
  await page.getByTestId("workshop-option").nth(0).click();
  await expectSeguirAfterArrive(page, viewport!.width, viewport!.height);
  await expect(page.getByTestId("workshop-trail")).toContainText("borde");
  await expect.poll(async () => page.evaluate(() => window.__protoLab?.workshopClouds?.()?.past ?? 0)).toBe(1);
  await page.getByTestId("choice-workshop-next").click();
  await expect(page.getByTestId("workshop-counter")).toHaveText("Ronda 3 de 3");
  await page.getByTestId("workshop-option").nth(1).click();
  await expect(page.getByRole("button", { name: roundThree[1] })).toHaveAttribute("aria-pressed", "true");
  await expectSeguirCentered(page, viewport!.width, viewport!.height);
  await expectSeguirAfterArrive(page, viewport!.width, viewport!.height);
});

test("Seguir queda centrado en las tres rondas con la cámara en movimiento", async ({ page }, testInfo) => {
  skipUnlessChromium(testInfo, "escritorio");
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockWorkshop(page);
  await page.goto("/?perf=1");
  await expect(page.getByTestId("world-ready")).toBeVisible();
  await page.evaluate(() => window.__protoLab?.focus("inventor"));
  await page.getByTestId("interact").click();
  await skipUntil(page, "choice-propose");
  await page.getByTestId("choice-propose").click();
  await page.getByTestId("dialogue-input").fill("Cometa lunar");
  await page.getByTestId("dialogue-send").click();
  await page.getByTestId("dialogue-input").fill("Un juego corto en el que persigues una cometa con el dedo.");
  await page.getByTestId("dialogue-send").click();
  await skipUntil(page, "choice-workshop");
  await page.getByTestId("choice-workshop").click();
  await expect.poll(async () => {
    if (await page.getByTestId("workshop-begin").isVisible().catch(() => false)) return "begin";
    const skip = page.getByTestId("workshop-skip");
    if (await skip.isVisible().catch(() => false)) {
      await skip.click();
      return "skipped";
    }
    await skipTyping(page);
    return "wait";
  }).not.toBe("wait");
  await skipUntil(page, "workshop-begin");
  await page.getByTestId("workshop-begin").click();
  await skipUntil(page, "choice-workshop-next");
  await expect.poll(async () => page.evaluate(() => window.__protoLab?.workshopView?.()?.beat ?? "")).toBe("work");
  await expect.poll(async () => page.evaluate(() => window.__protoLab?.workshopView?.()?.camZ ?? 0)).toBeLessThan(-4.85);
  const rounds = [roundOne, roundTwo, roundThree];
  for (let index = 0; index < rounds.length; index += 1) {
    await expect(page.getByTestId("workshop-counter")).toHaveText(`Ronda ${index + 1} de 3`);
    await page.evaluate(() => {
      document.querySelector("[data-testid='workshop-option']")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await expect(page.getByRole("button", { name: rounds[index]![0]! })).toHaveAttribute("aria-pressed", "true");
    await expectSeguirCentered(page, 1280, 800);
    await expectSeguirAfterArrive(page, 1280, 800);
    if (index < rounds.length - 1) {
      await page.getByTestId("choice-workshop-next").click();
      await skipUntil(page, "choice-workshop-next");
    }
  }
  for (const [width, height] of [
    [390, 844],
    [412, 915],
    [844, 390],
    [1280, 800],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expectSeguirCentered(page, width, height);
    await expectSeguirAfterArrive(page, width, height);
  }
});
