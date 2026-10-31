import { describe, expect, it } from "vitest";
import {
  arcadeMachineCollider,
  lobbyBounds,
  lobbyStaticColliders,
  walkToward,
} from "./navigation";

describe("navegación del lobby", () => {
  const bounds = lobbyBounds(true);
  const spots = [...lobbyStaticColliders(), arcadeMachineCollider()];

  it("permite llegar al Inventor, a la arcade y recorrer el centro", () => {
    const start = { x: 0, z: 1.7 };
    const targets = [
      { x: -1.5, z: -2.2, label: "inventor" },
      { x: 1.2, z: 0.2, label: "arcade" },
      { x: 0, z: -1.5, label: "centro" },
      { x: -5.5, z: 2.5, label: "pasillo izquierdo" },
      { x: 2.5, z: 4.5, label: "pasillo delantero" },
    ];
    for (const target of targets) {
      const result = walkToward(start, target, spots, bounds, { steps: 320 });
      expect(result.moved, target.label).toBeGreaterThan(1.5);
      expect(result.remaining, target.label).toBeLessThan(1.0);
    }
  });

  it("cruza de un lado a otro sin quedarse atascado", () => {
    const left = walkToward({ x: -5.5, z: 0.5 }, { x: 5.5, z: 0.5 }, spots, bounds, { steps: 420 });
    expect(left.moved).toBeGreaterThan(6);
    expect(left.remaining).toBeLessThan(1.2);
  });
});
