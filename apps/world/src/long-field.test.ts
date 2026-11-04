import { describe, expect, it } from "vitest";
import { keyboardOverlap, longTextHasMore, SCROLL_CUE } from "./long-field";

describe("campo largo", () => {
  it("marca que queda texto por debajo y se calla al llegar al final", () => {
    expect(longTextHasMore(400, 120, 0)).toBe(true);
    expect(longTextHasMore(400, 120, 280)).toBe(false);
    expect(longTextHasMore(120, 120, 0)).toBe(false);
    expect(SCROLL_CUE).toMatch(/desliza/i);
  });

  it("mide el solape del teclado y no inventa uno negativo", () => {
    expect(keyboardOverlap(844, 500, 0)).toBe(344);
    expect(keyboardOverlap(844, 520, 20)).toBe(304);
    expect(keyboardOverlap(844, 844, 0)).toBe(0);
    expect(keyboardOverlap(Number.NaN, 100, 0)).toBe(0);
  });
});
