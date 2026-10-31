import { describe, expect, it } from "vitest";
import {
  loadingSkeletonProgress,
  revealComplete,
  revealRowProgress,
  skeletonGrandTotalLength,
} from "./proposals-board-chalk";

describe("proposals-board-chalk", () => {
  it("el esqueleto tiene longitud total", () => {
    expect(skeletonGrandTotalLength()).toBeGreaterThan(100);
  });

  it("la carga progresa en bucle", () => {
    const a = loadingSkeletonProgress(0, false);
    const b = loadingSkeletonProgress(550, false);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(loadingSkeletonProgress(0, true)).toBe(1);
  });

  it("revela filas escalonadas en ~780 ms", () => {
    const start = 1000;
    expect(revealRowProgress(start, start + 20, 0, 2)).toBeLessThan(0.05);
    expect(revealRowProgress(start, start + 200, 0, 2)).toBeGreaterThan(0.2);
    expect(revealRowProgress(start, start + 900, 1, 2)).toBe(1);
    expect(revealComplete(start, start + 820, 2)).toBe(true);
  });
});
