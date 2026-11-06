import { expect, test, type Page, type TestInfo } from "@playwright/test";

/** Marca de los tests de móvil táctil. El proyecto reducido de CI filtra por ella. */
export const TOUCH_MOBILE_TAG = "@movil";

const TOUCH_MOBILE_PROJECTS = new Set(["webkit-iphone", "chromium-android"]);

/**
 * El evento de pellizco no estándar solo existe en un motor.
 * El parche que lo cancela está justificado en `apps/world/src/page-zoom.ts`.
 */
const GESTURE_PROJECT = "webkit-iphone";

/** Limita un test al proyecto indicado (evita duplicar contextos fijos en todos los navegadores). */
export function skipUnlessProject(projectName: string, testInfo: TestInfo, reason: string) {
  test.skip(testInfo.project.name !== projectName, reason);
}

export function skipUnlessChromium(testInfo: TestInfo, reason = "solo en el proyecto de escritorio") {
  skipUnlessProject("chromium", testInfo, reason);
}

export function isTouchMobileProject(name: string): boolean {
  return TOUCH_MOBILE_PROJECTS.has(name);
}

/** Comportamiento táctil que no es exclusivo de un motor. */
export function skipUnlessTouchMobile(testInfo: TestInfo, reason = "solo en móvil táctil") {
  test.skip(!isTouchMobileProject(testInfo.project.name), reason);
}

/** Abre la barra de Volver, pantalla completa y Sugerir. El cromo nace plegado. */
export async function expandPrototypeHud(page: Page, mode: "click" | "tap" = "click") {
  const handle = page.getByTestId("hud-handle");
  await expect(handle).toBeVisible();
  if ((await handle.getAttribute("aria-expanded")) !== "true") {
    if (mode === "tap") await handle.tap();
    else await handle.click();
  }
  await expect(page.getByTestId("close-prototype")).toBeVisible();
}

/**
 * Pulsa un control del cromo. El panel se pliega solo a los 4 s. En CI el clic
 * de Playwright tarda más (el botón deja de ser estable) y, al cumplirse el
 * plazo, el control ya no es visible. Mientras llega el clic se renueva ese
 * plazo con el mismo `pointerdown` que usa el panel.
 */
export async function pressPrototypeHud(page: Page, testId: string, mode: "click" | "tap" = "click") {
  await expandPrototypeHud(page, mode);
  await page.evaluate(() => {
    const hud = document.querySelector("[data-testid=prototype-hud]");
    if (!(hud instanceof HTMLElement)) return;
    const timer = window.setInterval(() => {
      if (!hud.isConnected || hud.hidden) return;
      hud.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    }, 1_000);
    const stop = () => window.clearInterval(timer);
    hud.addEventListener("click", stop, { capture: true, once: true });
    window.setTimeout(stop, 20_000);
  });
  const target = page.getByTestId(testId);
  if (mode === "tap") await target.tap();
  else await target.click();
}

/** Solo el motor que emite el evento de pellizco no estándar. */
export function skipUnlessGestureEngine(
  testInfo: TestInfo,
  reason = "el evento de pellizco no estándar solo existe en un motor",
) {
  skipUnlessProject(GESTURE_PROJECT, testInfo, reason);
}
