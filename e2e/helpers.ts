import { test, type TestInfo } from "@playwright/test";

/** Limita un test al proyecto indicado (evita duplicar contextos fijos en ambos navegadores). */
export function skipUnlessProject(projectName: "chromium" | "webkit-iphone", testInfo: TestInfo, reason: string) {
  test.skip(testInfo.project.name !== projectName, reason);
}

export function skipUnlessChromium(testInfo: TestInfo, reason = "solo en el proyecto Chromium") {
  skipUnlessProject("chromium", testInfo, reason);
}

export function skipUnlessWebKitIphone(testInfo: TestInfo, reason = "solo en el proyecto webkit-iphone") {
  skipUnlessProject("webkit-iphone", testInfo, reason);
}
