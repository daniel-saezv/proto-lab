import { describe, expect, it } from "vitest";
import {
  ARCADE_ASPECT,
  ARCADE_SCREEN_HEIGHT,
  ARCADE_SCREEN_WIDTH,
  PREVIEW_ASPECT,
  PREVIEW_STILL_HEIGHT,
  PREVIEW_STILL_WIDTH,
  SELECTOR_ASPECT,
  TV_ASPECT,
  containDest,
  coverRepeat,
  safeZone,
} from "./preview-frame";

describe("encuadre de la vista previa", () => {
  it("la foto es 16:9 y el arcade y el selector son 16:10", () => {
    expect(PREVIEW_STILL_WIDTH / PREVIEW_STILL_HEIGHT).toBeCloseTo(PREVIEW_ASPECT, 6);
    expect(PREVIEW_ASPECT).toBeCloseTo(TV_ASPECT, 6);
    expect(ARCADE_SCREEN_WIDTH / ARCADE_SCREEN_HEIGHT).toBeCloseTo(ARCADE_ASPECT, 6);
    expect(ARCADE_ASPECT).toBeCloseTo(SELECTOR_ASPECT, 6);
    expect(ARCADE_ASPECT).toBeCloseTo(16 / 10, 6);
  });

  it("cover centrado recorta el eje que sobra", () => {
    const wide = coverRepeat(16 / 9, 16 / 10);
    expect(wide.x).toBeCloseTo(0.9, 5);
    expect(wide.y).toBe(1);
    const tall = coverRepeat(9 / 16, 16 / 9);
    expect(tall.x).toBe(1);
    expect(tall.y).toBeCloseTo((9 / 16) / (16 / 9), 5);
    expect(coverRepeat(16 / 9, 16 / 9)).toEqual({ x: 1, y: 1 });
    expect(coverRepeat(0, 1)).toEqual({ x: 1, y: 1 });
  });

  it("contain centra sin recortar", () => {
    const fitted = containDest(390, 844, 640, 360);
    expect(fitted.h).toBeCloseTo(360, 5);
    expect(fitted.w).toBeLessThan(640);
    expect(fitted.x).toBeCloseTo((640 - fitted.w) / 2, 5);
    expect(fitted.y).toBeCloseTo(0, 5);
    expect(containDest(0, 10, 10, 10)).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });

  it("la zona segura es el 16:10 central de la foto", () => {
    const zone = safeZone(PREVIEW_ASPECT, [ARCADE_ASPECT, SELECTOR_ASPECT, TV_ASPECT]);
    expect(zone.y).toBe(0);
    expect(zone.height).toBe(1);
    expect(zone.x).toBeCloseTo(0.05, 5);
    expect(zone.width).toBeCloseTo(0.9, 5);
    expect((zone.width * PREVIEW_STILL_WIDTH) / PREVIEW_STILL_HEIGHT).toBeCloseTo(16 / 10, 5);
  });

  it("una captura de teléfono, ya en 16:9, cabe en la zona segura", () => {
    const zone = safeZone(PREVIEW_ASPECT, [ARCADE_ASPECT, SELECTOR_ASPECT, TV_ASPECT]);
    for (const [w, h] of [
      [390, 844],
      [390, 693],
      [64, 64],
    ] as const) {
      const dest = containDest(w, h, PREVIEW_STILL_WIDTH, PREVIEW_STILL_HEIGHT);
      const left = dest.x / PREVIEW_STILL_WIDTH;
      const right = (dest.x + dest.w) / PREVIEW_STILL_WIDTH;
      expect(left).toBeGreaterThanOrEqual(zone.x - 1e-6);
      expect(right).toBeLessThanOrEqual(zone.x + zone.width + 1e-6);
    }
  });
});
