import { describe, expect, it } from "vitest";
import { isRareWild, dropKind, dropCooldown, mergeOutcome, mergePoints } from "./rules";

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

  it("la bola arcoíris sale cada nueve caídas y la bomba cada once", () => {
    expect(isRareWild(0)).toBe(false);
    expect(isRareWild(9)).toBe(true);
    expect(dropKind(9)).toBe("wild");
    expect(dropKind(11)).toBe("bomb");
    expect(dropKind(8)).toBe("normal");
    expect(dropKind(22)).toBe("bomb");
    expect(dropKind(18)).toBe("wild");
    expect(dropCooldown(true)).toBeLessThan(dropCooldown(false));
    expect(dropCooldown(true)).toBeLessThan(200);
    expect(dropCooldown(false)).toBeLessThan(280);
  });
});