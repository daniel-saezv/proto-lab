import { describe, expect, it } from "vitest";
import { SHOT_PROFILES, buildContactSheetHtml, contactSheetName, selectorRow, shotFileName } from "./shot-sheet.mjs";

describe("hoja de contacto de shots", () => {
  it("nombra escritorio, iPhone vertical y horizontal", () => {
    expect(SHOT_PROFILES.map((item) => [item.id, item.width, item.height])).toEqual([
      ["desktop", 1280, 800],
      ["iphone", 390, 844],
      ["iphone-land", 844, 390],
    ]);
  });

  it("usa el mismo patrón de archivo para el antes y el después", () => {
    expect(shotFileName("before", "spawn", "desktop")).toBe("before-spawn-desktop.png");
    expect(shotFileName("after", "arcade", "iphone")).toBe("after-arcade-iphone.png");
    expect(shotFileName("", "overview", "iphone-land")).toBe("overview-iphone-land.png");
    expect(contactSheetName("before")).toBe("before-contact-sheet.png");
    expect(selectorRow("before").cells.map((cell) => cell.file)).toEqual([
      "before-selector-desktop.png",
      "before-selector-iphone.png",
      "before-selector-iphone-land.png",
    ]);
  });

  it("compone una tabla con un encuadre por fila y un perfil por columna", () => {
    const html = buildContactSheetHtml({
      title: "Antes",
      columns: SHOT_PROFILES.map((item) => ({ id: item.id, label: item.label })),
      rows: [
        {
          id: "spawn",
          label: "Aparición",
          cells: SHOT_PROFILES.map((item) => ({ profileId: item.id, file: shotFileName("before", "spawn", item.id) })),
        },
      ],
    });
    expect(html).toContain("Aparición");
    expect(html).toContain("before-spawn-desktop.png");
    expect(html).toContain("before-spawn-iphone.png");
    expect(html).toContain("before-spawn-iphone-land.png");
    expect(html).toContain("Escritorio 1280×800");
  });
});
