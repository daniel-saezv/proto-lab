import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BOOT_LINES, bootProgress, bootStatusText } from "./boot-screen";

describe("avance de la apertura", () => {
  it("traduce bytes a un porcentaje y separa la compilación de la descarga", () => {
    expect(bootProgress(0, 100)).toEqual({ percent: 0, ratio: 0, phase: "download" });
    expect(bootProgress(30, 100)).toEqual({ percent: 30, ratio: 0.3, phase: "download" });
    expect(bootProgress(150, 100)).toEqual({ percent: 100, ratio: 1, phase: "preparing" });
    expect(bootProgress(10, 0)).toBeNull();
    expect(bootProgress(-1, 100)).toBeNull();
    expect(bootProgress(Number.NaN, 100)).toBeNull();
    expect(bootProgress(10, Number.POSITIVE_INFINITY)).toBeNull();
    expect(bootProgress("30", 100)).toBeNull();
    expect(bootStatusText("opening", null)).toBe("Abriendo la aplicación");
    expect(bootStatusText("download", 30)).toBe("30 %. Bajando la aplicación");
    expect(bootStatusText("preparing", 100)).toBe("Preparando la aplicación");
  });

  it("cada estado tiene frases cortas y distintas", () => {
    const seen = new Set<string>();
    for (const lines of Object.values(BOOT_LINES)) {
      expect(lines.length).toBeGreaterThan(1);
      for (const line of lines) {
        expect(line.length).toBeGreaterThan(0);
        expect(line.length).toBeLessThanOrEqual(40);
        expect(line.toLowerCase()).not.toContain("juego");
        expect(seen.has(line)).toBe(false);
        seen.add(line);
      }
    }
    expect(BOOT_LINES.preparing).not.toEqual(BOOT_LINES.download);
  });

  it("la capa es CSS, sin imágenes, y el movimiento se apaga si el sistema lo pide", () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "style.css"), "utf8");
    expect(css).toContain("@keyframes prototype-boot-spin");
    expect(css).toContain("@keyframes prototype-boot-orbit");
    expect(css).toContain("@keyframes prototype-boot-twinkle");
    expect(css).toContain("@keyframes prototype-boot-line");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain(".prototype-status:not([data-progress]) .prototype-boot-spin { animation: none; }");
    expect(css).toContain('.prototype-status[data-boot="preparing"] .prototype-boot-orbit { animation: none; }');
    expect(css).toContain(".prototype-boot-lines span:first-child { opacity: 1; }");
    expect(css).toContain('.prototype-status[data-boot="preparing"] .prototype-boot-arc { stroke: #f6f1e7; }');
    expect(css).not.toMatch(/\.prototype-boot[\s\S]{0,800}url\(/);
  });
});
