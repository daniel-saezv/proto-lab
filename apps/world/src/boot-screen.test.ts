import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { bootProgress } from "./boot-screen";

describe("avance de la apertura", () => {
  it("traduce bytes a un porcentaje y deja el tamaño desconocido sin cifra", () => {
    expect(bootProgress(0, 100)).toEqual({ percent: 0, ratio: 0 });
    expect(bootProgress(30, 100)).toEqual({ percent: 30, ratio: 0.3 });
    expect(bootProgress(150, 100)).toEqual({ percent: 100, ratio: 1 });
    expect(bootProgress(10, 0)).toBeNull();
    expect(bootProgress(-1, 100)).toBeNull();
    expect(bootProgress(Number.NaN, 100)).toBeNull();
    expect(bootProgress(10, Number.POSITIVE_INFINITY)).toBeNull();
    expect(bootProgress("30", 100)).toBeNull();
  });

  it("la capa es CSS, sin imágenes, y el movimiento se apaga si el sistema lo pide", () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "style.css"), "utf8");
    expect(css).toContain("@keyframes prototype-boot-spin");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain(".prototype-status:not([data-progress]) .prototype-boot-spin { animation: none; }");
    expect(css).not.toMatch(/\.prototype-boot[\s\S]{0,400}url\(/);
  });
});
