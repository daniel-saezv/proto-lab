import { describe, expect, it } from "vitest";
import { isRareWild, mergeOutcome, mergePoints } from "./rules";

describe("reglas del pozo", () => {
  it("funde dos iguales en el tamaño siguiente", () => {
    expect(mergeOutcome(0)).toEqual({ mega: false, tier: 1 });
    expect(mergeOutcome(5)).toEqual({ mega: false, tier: 6 });
  });

  it("dos del tamaño máximo son un mega", () => {
    expect(mergeOutcome(6)).toEqual({ mega: true, tier: 6 });
    expect(mergePoints(6, 3, true)).toBe(2400);
    expect(mergePoints(1, 2, false)).toBe(60);
  });

  it("la bola arcoíris sale cada nueve caídas", () => {
    expect(isRareWild(0)).toBe(false);
    expect(isRareWild(9)).toBe(true);
    expect(isRareWild(8)).toBe(false);
  });
});