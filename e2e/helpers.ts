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

/** Solo el motor que emite el evento de pellizco no estándar. */
export function skipUnlessGestureEngine(
  testInfo: TestInfo,
  reason = "el evento de pellizco no estándar solo existe en un motor",
) {
  skipUnlessProject(GESTURE_PROJECT, testInfo, reason);
}
