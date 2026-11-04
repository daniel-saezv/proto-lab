import { describe, expect, it } from "vitest";
import { SHOT_PROFILES, buildContactSheetHtml, contactSheetName, selectorRow, shotFileName } from "./shot-sheet.mjs";

describe("hoja de contacto de shots", () => {
  it("nombra escritorio, dos teléfonos en vertical y uno en horizontal", () => {
    expect(SHOT_PROFILES.map((item) => [item.id, item.width, item.height, item.mobile])).toEqual([
      ["desktop", 1280, 800, false],
      ["iphone", 390, 844, true],
      ["tall", 412, 915, true],
      ["iphone-land", 844, 390, true],
    ]);
    const landscape = SHOT_PROFILES.filter((item) => item.mobile && item.width > item.height);
    expect(landscape).toHaveLength(1);
  });

  it("usa el mismo patrón de archivo para el antes y el después", () => {
    expect(shotFileName("before", "spawn", "desktop")).toBe("before-spawn-desktop.png");
    expect(shotFileName("after", "arcade", "iphone")).toBe("after-arcade-iphone.png");
    expect(shotFileName("", "overview", "iphone-land")).toBe("overview-iphone-land.png");
    expect(contactSheetName("before")).toBe("before-contact-sheet.png");
    expect(shotFileName("after", "arcade", "tall")).toBe("after-arcade-tall.png");
    expect(selectorRow("before").cells.map((cell) => cell.file)).toEqual([
      "before-selector-desktop.png",
      "before-selector-iphone.png",
      "before-selector-tall.png",
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
    expect(html).toContain("before-spawn-tall.png");
    expect(html).toContain("before-spawn-iphone-land.png");
    expect(html).toContain("Escritorio 1280×800");
    expect(html).toContain("Teléfono 412×915");
    expect(html).toContain("dos teléfonos en vertical");
  });
});
