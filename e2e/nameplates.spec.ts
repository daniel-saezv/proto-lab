import { expect, test } from "@playwright/test";
import { NAMEPLATE_GLYPH, nameplateMark, type NameplateMark } from "../apps/world/src/nameplates";

const CASES: { id: string; button: string; name: string; mark: NameplateMark }[] = [
  { id: "inventor", button: "Hablar con el Inventor", name: "Inventor", mark: "talk" },
  { id: "arcade", button: "Usar la máquina", name: "Arcade", mark: "play" },
  { id: "chalkboard", button: "Ver la pizarra", name: "Pizarra", mark: "look" },
  { id: "radio", button: "Cambiar la música", name: "Radio", mark: "note" },
  { id: "remolon", button: "Hablar con Remolón", name: "Remolón", mark: "talk" },
  { id: "brasa", button: "Hablar con Brasa", name: "Brasa", mark: "talk" },
  { id: "naipe", button: "Hablar con Naipe", name: "Naipe", mark: "talk" },
  { id: "croquis", button: "Hablar con Croquis", name: "Croquis", mark: "talk" },
];

test("el indicador del mundo es un icono y el botón conserva su texto", async ({ page }) => {
  await page.goto("/?e2e=1");
  await expect(page.getByTestId("world-ready")).toBeVisible();

  for (const item of CASES) {
    expect(nameplateMark(item.id)).toBe(item.mark);
    await page.evaluate((id) => window.__protoLab?.focus(id), item.id);
    await expect(page.getByTestId("interact")).toHaveText(item.button);
    const anchor = page.locator(".nameplate-anchor").filter({ has: page.locator(".sr-only", { hasText: new RegExp(`^${item.name}$`) }) });
    await expect(anchor).toHaveCount(1);
    const reading = await anchor.evaluate((element) => {
      const plate = element.querySelector(".nameplate");
      const before = plate ? getComputedStyle(plate, "::before").content : "";
      const directText = plate
        ? [...plate.childNodes]
            .filter((node) => node.nodeType === Node.TEXT_NODE)
            .map((node) => node.textContent ?? "")
            .join("")
            .trim()
        : "missing";
      return { before, directText, kind: element.dataset.kind ?? "" };
    });
    expect(reading.kind, item.id).toBe(item.mark);
    expect(reading.directText, item.id).toBe("");
    expect(reading.before, item.id).not.toMatch(/Radio|Inventor|Arcade|Pizarra|Remolón|Brasa|Naipe|Croquis/);
    const glyph = NAMEPLATE_GLYPH[item.mark].replace(/\uFE0E/g, "");
    const shown = reading.before.replace(/^"|"$/g, "").replace(/\uFE0E/g, "");
    expect(shown, item.id).toBe(glyph);
  }
});
