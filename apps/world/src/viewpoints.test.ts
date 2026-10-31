import { describe, expect, it } from "vitest";
import { arcadeMachineCollider } from "./navigation";
import { DEBUG_MARKERS, VIEWPOINTS, viewpointById } from "./viewpoints";

describe("puntos de cámara del lobby", () => {
  it("mantiene los ids que usa pnpm shots", () => {
    expect(VIEWPOINTS.map((item) => item.id)).toEqual([
      "spawn",
      "inventor",
      "arcade",
      "corner-lounge",
      "corner-workshop",
      "corner-pinball",
      "corner-fridge",
      "overview",
    ]);
    expect(new Set(VIEWPOINTS.map((item) => item.id)).size).toBe(VIEWPOINTS.length);
  });

  it("encuadra la arcade desde donde llega el jugador", () => {
    const machine = arcadeMachineCollider();
    const view = viewpointById("arcade");
    expect(view?.kind).toBe("follow");
    expect(view!.z).toBeGreaterThan(machine.z);
    expect(Math.abs(view!.x - machine.x)).toBeLessThan(1.2);
  });

  it("deja al Inventor delante de la cámara de seguimiento", () => {
    const view = viewpointById("inventor");
    expect(view!.z).toBeGreaterThan(-3.4);
    expect(view!.kind).toBe("follow");
  });

  it("incluye una vista cenital y marcadores de lo interactivo", () => {
    expect(viewpointById("overview")?.kind).toBe("top");
    expect(DEBUG_MARKERS.map((item) => item.id)).toEqual(["inventor", "arcade", "chalkboard"]);
  });

  it("mantiene los encuadres de seguimiento dentro de la sala", () => {
    for (const view of VIEWPOINTS) {
      if (view.kind !== "follow") continue;
      expect(view.x).toBeGreaterThan(-8);
      expect(view.x).toBeLessThan(8);
      expect(view.z).toBeGreaterThan(-7);
      expect(view.z).toBeLessThan(8);
    }
  });
});
