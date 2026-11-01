import { describe, expect, it } from "vitest";
import {
  loadingSkeletonProgress,
  quadSeg,
  revealComplete,
  revealRowProgress,
  seg,
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

  it("una cuadrática se separa de su cuerda", () => {
    const curve = quadSeg(0, 0, 0, 24, 40, 0);
    const chord = seg(0, 0, 40, 0);
    expect(curve.len).toBeGreaterThan(chord.len + 8);
    const midY = 0.25 * curve.y1 + 0.5 * (curve.qy ?? 0) + 0.25 * curve.y2;
    expect(midY).toBeGreaterThan(8);
    expect(curve.qx).toBe(0);
    expect(curve.qy).toBe(24);
  });

  it("revela filas escalonadas en ~780 ms", () => {
    const start = 1000;
    expect(revealRowProgress(start, start + 20, 0, 2)).toBeLessThan(0.05);
    expect(revealRowProgress(start, start + 200, 0, 2)).toBeGreaterThan(0.2);
    expect(revealRowProgress(start, start + 900, 1, 2)).toBe(1);
    expect(revealComplete(start, start + 820, 2)).toBe(true);
  });
});
