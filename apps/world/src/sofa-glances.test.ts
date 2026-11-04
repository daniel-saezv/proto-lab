import { describe, expect, it } from "vitest";
import type { Mesh } from "three";
import { createSofaGlanceRuntime, pickGlanceIds, tickSofaGlances } from "./sofa-glances";

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

  it("quien tiene una mascota en los pies mira hacia abajo", () => {
    const head = { rotation: { x: 0.34, y: 0 } } as Mesh;
    const runtime = createSofaGlanceRuntime(
      [{ id: "remolon", head, restPitch: 0.34, bodyYaw: Math.PI / 2, x: -8.55, z: -4.15, phase: 0.2 }],
      false,
    );
    tickSofaGlances(runtime, 1, 0.5, {
      playerX: 0,
      playerZ: 0,
      playerStill: false,
      activeCue: null,
      dialoguePulse: 0,
      nearSlacker: false,
      pet: { id: "remolon", x: -7.95, z: -3.25 },
    });
    expect(head.rotation.x).toBeGreaterThan(0.5);
    expect(Math.abs(head.rotation.y)).toBeGreaterThan(0.05);
  });
});
