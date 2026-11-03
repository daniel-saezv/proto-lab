import { describe, expect, it } from "vitest";
import { pickGlanceIds } from "./sofa-glances";

describe("miradas del sofá", () => {
  it("nunca elige a todos los personajes a la vez", () => {
    const ids = ["remolon", "brasa", "naipe", "croquis"];
    for (let seed = 0; seed < 40; seed++) {
      const picked = pickGlanceIds(ids, seed, 2);
      expect(picked.length).toBeGreaterThan(0);
      expect(picked.length).toBeLessThan(ids.length);
    }
  });

  it("elige de forma estable con la misma semilla", () => {
    const ids = ["remolon", "brasa", "naipe", "croquis"];
    expect(pickGlanceIds(ids, 12)).toEqual(pickGlanceIds(ids, 12));
  });
});
