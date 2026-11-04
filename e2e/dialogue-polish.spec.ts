import { devices, expect, test, type Page } from "@playwright/test";
import { skipUnlessChromium } from "./helpers";

/** Móvil alto (puntos CSS de un teléfono Android) y horizontal corto. */
const PHONE_TALL = { width: 412, height: 915 };
const PHONE_WIDE = { width: 844, height: 390 };

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

async function viewportOf(page: Page) {
  const size = page.viewportSize();
  expect(size).toBeTruthy();
  return size!;
}

/** Un solo desplazamiento: la hoja, si no cabe; el texto y el campo, nunca. */
async function expectOneScroll(page: Page, testId: string) {
  const { width, height } = await viewportOf(page);
  const field = page.getByTestId(testId);
  const sheet = page.locator(".dialogue-sheet");
  await expect(field).toBeVisible();
  await expect.poll(() => field.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(4);
  await expect
    .poll(() => page.getByTestId("dialogue-text").evaluate((el) => el.scrollHeight - el.clientHeight))
    .toBeLessThanOrEqual(4);
  await sheet.evaluate((el) => {
    el.scrollTop = 0;
  });
  const before = await sheet.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, top: rect.top, bottom: rect.bottom };
  });
  expect(before.top).toBeGreaterThanOrEqual(-1);
  expect(before.bottom).toBeLessThanOrEqual(height + 1);
  const overflows = before.scrollHeight > before.clientHeight + 8;
  if (height <= 960) expect(overflows).toBe(true);
  const cue = page.getByTestId("scroll-cue");
  if (overflows) {
    await expect(cue).toBeVisible();
    await expect.poll(() =>
      sheet.evaluate((el) => {
        const active = document.activeElement;
        if (active instanceof HTMLElement && el.contains(active)) active.blur();
        el.scrollTop = 0;
        el.scrollTop = el.scrollHeight;
        const gap = el.scrollHeight - el.clientHeight - el.scrollTop;
        const node = el.parentElement?.querySelector("[data-testid='scroll-cue']");
        return gap <= 4 && node instanceof HTMLElement && node.hidden;
      }),
    ).toBe(true);
    await expect(cue).toBeHidden();
  } else {
    await expect(cue).toBeHidden();
  }
  const action = page.locator("#dialogue .dialogue-actions .dialogue-choice, #dialogue .workshop-actions .dialogue-choice").last();
  boxInside(await action.boundingBox(), width, height);
}

async function expectLongFieldOn(page: Page, testId: string, size: { width: number; height: number }) {
  await page.setViewportSize(size);
  await expectOneScroll(page, testId);
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

test("la cruz cierra cada diálogo y la descripción larga se desplaza", async ({ page }) => {
  const proposals: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && /\/api\/proposals$/.test(request.url())) proposals.push(request.url());
  });
  await page.goto("/?e2e=1");
  await expect(page.getByTestId("world-ready")).toBeVisible();
  const home = await viewportOf(page);

  await page.evaluate(() => window.__protoLab?.focus("remolon"));
  await expect(page.getByTestId("interact")).toHaveText("Hablar con Remolón");
  await page.getByTestId("interact").click();
  await expect(page.locator("#dialogue-name")).toHaveText("Remolón");
  boxInside(await page.getByTestId("dialog-close").boundingBox(), home.width, home.height);
  await page.getByTestId("dialog-close").click();
  await expect(page.getByTestId("dialogue")).toBeHidden();
  await expect(page.getByTestId("interact")).toHaveText("Hablar con Remolón");

  await reachBody(page, "Cometa lunar");
  await page.getByTestId("dialogue-input").fill(LONG);
  await expectOneScroll(page, "dialogue-input");
  await expectLongFieldOn(page, "dialogue-input", PHONE_TALL);
  await expectLongFieldOn(page, "dialogue-input", PHONE_WIDE);
  await page.setViewportSize(home);
  await page.getByTestId("dialogue-send").click();
  await expect(page.getByTestId("dialogue-note")).toContainText("Fin.");
  await expectOneScroll(page, "dialogue-note");
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
  boxInside(await boardClose.boundingBox(), home.width, home.height);
  await boardClose.click();
  await expect(page.locator("#viewport")).toHaveAttribute("data-board-view", "0");
  expect(proposals).toEqual([]);
});

test("el escritorio espera, muestra lo elegido y al cerrar no llama otra vez al modelo", async ({ page }) => {
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
  await expectOneScroll(page, "workshop-description");
  await expectLongFieldOn(page, "workshop-description", PHONE_TALL);
  await expectLongFieldOn(page, "workshop-description", PHONE_WIDE);
});

test("en un móvil alto la cruz y el texto largo caben en un solo desplazamiento", async ({ browser }, testInfo) => {
  skipUnlessChromium(testInfo, "perfil Pixel 7");
  const context = await browser.newContext({
    ...devices["Pixel 7"],
    baseURL: "http://127.0.0.1:4173",
    locale: "es-ES",
  });
  const page = await context.newPage();
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
  await page.goto("/?e2e=1");
  await expect(page.getByTestId("world-ready")).toBeVisible();
  const phone = await viewportOf(page);
  expect(phone.width).toBeGreaterThan(390);
  expect(phone.height).toBeGreaterThan(800);
  await page.evaluate(() => window.__protoLab?.focus("remolon"));
  await page.getByTestId("interact").click();
  await expect(page.locator("#dialogue-name")).toHaveText("Remolón");
  boxInside(await page.getByTestId("dialog-close").boundingBox(), phone.width, phone.height);
  await page.getByTestId("dialog-close").click();
  await reachBody(page, "Cometa lunar");
  await page.getByTestId("dialogue-input").fill(LONG);
  await expectOneScroll(page, "dialogue-input");
  await expectLongFieldOn(page, "dialogue-input", { width: phone.height, height: phone.width });
  await context.close();
});
