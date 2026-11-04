import { expect, test, type Page } from "@playwright/test";
import { skipUnlessChromium, skipUnlessWebKitIphone } from "./helpers";

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
  await page.route("**/api/workshop", async (route) => {
    const body = route.request().postDataJSON() as { op?: string; decision?: string };
    const shared = { draft: original, original, maxRounds: 3 };
    const pick = (round: number, options: string[]) => ({
      ok: true,
      phase: "pick",
      sessionId: "a".repeat(32),
      speech: `Ronda ${round} de 3. Marca las ideas que quieres. Puedes no marcar ninguna.`,
      options,
      round,
      ...shared,
    });
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
          : body.decision === "next"
            ? pick(2, roundTwo)
            : pick(1, roundOne);
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
  await expect.poll(async () => (await page.getByTestId("workshop-option").first().boundingBox())?.x ?? -1).toBeGreaterThan(0);
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
  await expect(page.getByRole("button", { name: roundOne[0] })).toHaveAttribute("aria-pressed", "false");
  await page.getByTestId("workshop-option").nth(0).click();
  await expect(page.getByRole("button", { name: roundOne[0] })).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("workshop-option").nth(1).focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: roundOne[1] })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => page.evaluate(() => window.__protoLab?.workshopClouds?.()?.now ?? 0)).toBe(4);
  await page.screenshot({ path: "/opt/cursor/artifacts/taller-1280x800.png" });
  await page.getByTestId("choice-workshop-next").click();
  await expect(page.getByTestId("workshop-counter")).toHaveText("Ronda 2 de 3");
  await expect(page.getByTestId("workshop-trail")).toContainText("rastro de luz");
  await expect.poll(async () => page.evaluate(() => window.__protoLab?.workshopClouds?.()?.past ?? 0)).toBe(2);
  await page.screenshot({ path: "/opt/cursor/artifacts/taller-1280x800-ronda2.png" });
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
  await page.screenshot({ path: "/opt/cursor/artifacts/taller-390x844.png" });
  await page.setViewportSize({ width: 844, height: 390 });
  await expect.poll(async () => {
    const box = await page.getByTestId("workshop-option").first().boundingBox();
    return !!box && box.y >= -1 && box.x >= -1 && box.y + box.height <= 391 && box.x + box.width <= 845;
  }).toBe(true);
  await expectTargets(page, 844, 390);
  await page.screenshot({ path: "/opt/cursor/artifacts/taller-844x390.png" });
  await context.close();
});

test("en WebKit la idea se marca y sigue legible", async ({ page }, testInfo) => {
  skipUnlessWebKitIphone(testInfo, "proyecto webkit-iphone");
  await mockWorkshop(page);
  await openRound(page);
  const viewport = page.viewportSize();
  expect(viewport).toBeTruthy();
  await expectTargets(page, viewport!.width, viewport!.height);
  await page.getByTestId("workshop-option").nth(2).click();
  await expect(page.getByRole("button", { name: roundOne[2] })).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("choice-workshop-next").click();
  await expect(page.getByTestId("workshop-trail")).toContainText("borde");
  await expect.poll(async () => page.evaluate(() => window.__protoLab?.workshopClouds?.()?.past ?? 0)).toBe(1);
});
