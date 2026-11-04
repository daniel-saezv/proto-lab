import { expect, test, type Page } from "@playwright/test";
import { skipUnlessWebKitIphone } from "./helpers";

const LONG = `${"Persigues una cometa con el dedo y dejas un rastro de luz. ".repeat(30)}Fin.`;

const roundIdeas = [
  [
    "¿Y si la cometa dejara un rastro de luz?",
    "¿Y si se pudiera guardar el camino?",
    "¿Y si avisara al llegar al borde?",
    "¿Y si el color cambiara con la altura?",
  ],
  [
    "¿Y si el rastro se pudiera borrar?",
    "¿Y si la luz siguiera el dedo?",
    "¿Y si hubiera un color por amigo?",
    "¿Y si el rastro durara un segundo?",
  ],
  [
    "¿Y si el final mostrara el dibujo?",
    "¿Y si se pudiera compartir?",
    "¿Y si el cielo oscureciera?",
    "¿Y si la cometa frenara sola?",
  ],
];

async function openInventor(page: Page) {
  await page.evaluate(() => window.__protoLab?.focus("inventor"));
  await expect(page.getByTestId("interact")).toHaveText("Hablar con el Inventor");
  await page.getByTestId("interact").click();
  await expect(page.getByTestId("dialogue")).toBeVisible();
}

async function reachBody(page: Page, title: string) {
  await openInventor(page);
  await page.getByTestId("choice-propose").click();
  await page.getByTestId("dialogue-input").fill(title);
  await page.getByTestId("dialogue-send").click();
  await expect(page.getByTestId("dialogue-input")).toBeVisible();
}

function boxInside(box: { x: number; y: number; width: number; height: number } | null, width: number, height: number) {
  expect(box).toBeTruthy();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.x).toBeGreaterThanOrEqual(-1);
  expect(box!.y).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(height + 1);
}

async function expectOneScroll(page: Page, testId: string, viewportHeight: number) {
  const field = page.getByTestId(testId);
  const sheet = page.locator(".dialogue-sheet");
  await expect(field).toBeVisible();
  const inner = await field.evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
  expect(inner.scrollHeight).toBeLessThanOrEqual(inner.clientHeight + 4);
  const speech = await page.getByTestId("dialogue-text").evaluate((el) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }));
  expect(speech.scrollHeight).toBeLessThanOrEqual(speech.clientHeight + 4);
  await sheet.evaluate((el) => {
    el.scrollTop = 0;
  });
  const before = await sheet.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, top: rect.top, bottom: rect.bottom };
  });
  expect(before.scrollHeight).toBeGreaterThan(before.clientHeight + 8);
  expect(before.top).toBeGreaterThanOrEqual(-1);
  expect(before.bottom).toBeLessThanOrEqual(viewportHeight + 1);
  await expect(page.getByTestId("scroll-cue")).toBeVisible();
  await sheet.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect.poll(() => sheet.evaluate((el) => el.scrollTop)).toBeGreaterThan(8);
  await expect(page.getByTestId("scroll-cue")).toBeHidden();
  const action = page.locator("#dialogue .dialogue-actions .dialogue-choice, #dialogue .workshop-actions .dialogue-choice").last();
  const box = await action.boundingBox();
  expect(box).toBeTruthy();
  expect(box!.y).toBeGreaterThanOrEqual(-1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewportHeight + 1);
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api/proposals/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, items: [] }),
    });
  });
  await page.route(/\/api\/proposals$/, async (route) => {
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, issueNumber: 1, issueUrl: "https://example.invalid/1" }),
    });
  });
});

test("la cruz cierra cada diálogo y la descripción larga se desplaza", async ({ page }, testInfo) => {
  skipUnlessWebKitIphone(testInfo, "cierre y nota en el iPhone");
  const proposals: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && /\/api\/proposals$/.test(request.url())) proposals.push(request.url());
  });
  await page.goto("/?e2e=1");
  await expect(page.getByTestId("world-ready")).toBeVisible();
  const portrait = page.viewportSize();
  expect(portrait?.width).toBe(390);
  expect(portrait && portrait.height).toBeGreaterThan(600);

  await page.evaluate(() => window.__protoLab?.focus("remolon"));
  await expect(page.getByTestId("interact")).toHaveText("Hablar con Remolón");
  await page.getByTestId("interact").click();
  await expect(page.locator("#dialogue-name")).toHaveText("Remolón");
  boxInside(await page.getByTestId("dialog-close").boundingBox(), 390, 844);
  await page.getByTestId("dialog-close").click();
  await expect(page.getByTestId("dialogue")).toBeHidden();
  await expect(page.getByTestId("interact")).toHaveText("Hablar con Remolón");

  await reachBody(page, "Cometa lunar");
  await page.getByTestId("dialogue-input").fill(LONG);
  await expectOneScroll(page, "dialogue-input", portrait!.height);
  await page.setViewportSize({ width: 844, height: 390 });
  await expectOneScroll(page, "dialogue-input", 390);
  await page.setViewportSize({ width: portrait!.width, height: portrait!.height });
  await page.getByTestId("dialogue-send").click();
  await expect(page.getByTestId("dialogue-note")).toContainText("Fin.");
  await expectOneScroll(page, "dialogue-note", portrait!.height);
  await page.getByTestId("dialog-close").click();
  await expect(page.getByTestId("dialogue")).toBeHidden();

  await openInventor(page);
  await page.getByTestId("choice-iterate").click();
  await page.getByTestId("choice-proto-chispa").click();
  await page.getByTestId("dialogue-input").fill("Chispas más rápidas");
  await page.getByTestId("dialogue-send").click();
  await expect(page.getByTestId("dialogue-input")).toBeVisible();
  await page.getByTestId("dialog-close").click();
  await expect(page.getByTestId("dialogue")).toBeHidden();
  expect(proposals).toEqual([]);

  await page.evaluate(() => window.__protoLab?.focus("arcade"));
  await expect(page.getByTestId("interact")).toHaveText("Usar la máquina");
  await page.getByTestId("interact").click();
  await expect(page.getByTestId("game-selector")).toBeVisible();
  await page.getByTestId("dialog-close").click();
  await expect(page.getByTestId("game-selector")).toBeHidden();

  await openInventor(page);
  await page.getByTestId("choice-install").click();
  await expect(page.getByTestId("install-help")).toBeVisible();
  await page.getByTestId("dialog-close").click();
  await expect(page.getByTestId("install-help")).toBeHidden();

  await page.evaluate(() => window.__protoLab?.focus("chalkboard"));
  await expect(page.getByTestId("interact")).toHaveText("Ver la pizarra");
  await page.getByTestId("interact").click();
  await expect(page.locator("#viewport")).toHaveAttribute("data-board-view", "1");
  const boardClose = page.getByTestId("board-back");
  boxInside(await boardClose.boundingBox(), portrait!.width, portrait!.height);
  await boardClose.click();
  await expect(page.locator("#viewport")).toHaveAttribute("data-board-view", "0");
  expect(proposals).toEqual([]);
});

test("el escritorio espera, muestra lo elegido y al cerrar no llama otra vez al modelo", async ({ page }, testInfo) => {
  skipUnlessWebKitIphone(testInfo, "taller en el iPhone");
  const ops: string[] = [];
  let round = 0;
  await page.route("**/api/workshop", async (route) => {
    const body = route.request().postDataJSON() as { op?: string; decision?: string };
    const op = body.op === "turn" ? `turn:${body.decision ?? ""}` : (body.op ?? "");
    ops.push(op);
    if (body.op === "start") round = 1;
    else if (body.decision === "next" || body.decision === "retry") round += 1;
    const payload =
      body.op === "abandon"
        ? { ok: true }
        : body.decision === "stop"
          ? {
              ok: true,
              phase: "summary",
              speech: "Esto es lo que dejaría en el tablón. Si quieres, corrige el título o el texto.",
              draft: {
                kind: "propuesta",
                title: "Cometa con estela",
                description: LONG,
              },
              original: {
                kind: "propuesta",
                title: "Cometa lunar",
                description: "Un juego corto.",
              },
              round: 1,
              maxRounds: 3,
            }
          : {
              ok: true,
              phase: "pick",
              sessionId: "a".repeat(32),
              speech: `Ronda ${round} de 3. Marca las ideas que quieres.`,
              options: roundIdeas[Math.min(Math.max(round, 1), 3) - 1],
              draft: {
                kind: "propuesta",
                title: "Cometa lunar",
                description: "Un juego corto.",
              },
              original: {
                kind: "propuesta",
                title: "Cometa lunar",
                description: "Un juego corto.",
              },
              round,
              maxRounds: 3,
            };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
  });

  await page.goto("/?e2e=1");
  await expect(page.getByTestId("world-ready")).toBeVisible();
  await reachBody(page, "Cometa lunar");
  await page.getByTestId("dialogue-input").fill("Un juego corto en el que persigues una cometa.");
  await page.getByTestId("dialogue-send").click();
  await page.getByTestId("choice-workshop").click();
  await expect(page.getByTestId("workshop-begin")).toBeVisible();
  await expect(page.getByTestId("dialogue-text")).toContainText("tres rondas");
  const started = Date.now();
  await expect
    .poll(() => Date.now() - started, { timeout: 2500, intervals: [400, 400, 400, 500] })
    .toBeGreaterThan(1100);
  expect(ops).toEqual([]);
  await expect(page.getByTestId("choice-workshop-next")).toHaveCount(0);

  await page.getByTestId("workshop-begin").click();
  await expect(page.getByTestId("workshop-counter")).toHaveText("Ronda 1 de 3");
  await page.getByTestId("workshop-option").nth(0).click();
  await expect(page.getByTestId("workshop-option").nth(0)).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("choice-workshop-next").click();
  await expect(page.getByTestId("workshop-counter")).toHaveText("Ronda 2 de 3");
  await expect(page.getByTestId("workshop-trail")).toContainText("rastro de luz");
  await page.getByTestId("workshop-option").nth(0).click();
  await page.getByTestId("choice-workshop-next").click();
  await expect(page.getByTestId("workshop-counter")).toHaveText("Ronda 3 de 3");
  const marks = page.getByTestId("workshop-trail-mark");
  await expect(marks).toHaveCount(2);
  await expect(marks.nth(0)).toContainText("rastro de luz");
  await expect(marks.nth(1)).toContainText("borrar");

  const calls = ops.filter((op) => op === "start" || op.startsWith("turn:")).length;
  await page.getByTestId("dialog-close").click();
  await expect(page.getByTestId("dialogue")).toBeHidden();
  await expect.poll(() => ops.includes("abandon")).toBe(true);
  expect(ops.filter((op) => op === "start" || op.startsWith("turn:"))).toHaveLength(calls);
  const home = await page.evaluate(() => window.__protoLab?.workshopView?.());
  expect(home?.place).toBe("stand");
  expect(home?.sit).toBe(0);

  await reachBody(page, "Cometa lunar");
  await page.getByTestId("dialogue-input").fill("Un juego corto en el que persigues una cometa.");
  await page.getByTestId("dialogue-send").click();
  await page.getByTestId("choice-workshop").click();
  await page.getByTestId("workshop-begin").click();
  await page.getByTestId("choice-workshop-stop").click();
  await expect(page.getByTestId("workshop-title")).toHaveValue("Cometa con estela");
  const portrait = page.viewportSize();
  await expectOneScroll(page, "workshop-description", portrait?.height ?? 664);
  await page.setViewportSize({ width: 844, height: 390 });
  await expectOneScroll(page, "workshop-description", 390);
});
