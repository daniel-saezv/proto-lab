import { describe, expect, it } from "vitest";
import { blinkOpen, breathScale, idlePhase, rigSway, windowPaintSlot } from "./graphics-idle";
import { FLOOR_LAMPS } from "./scene-lights";
import { floorShade, floorUv, wallShade } from "./vertex-ao";

describe("idle gráfico", () => {
  it("cierra los ojos un instante y los deja abiertos el resto del ciclo", () => {
    expect(blinkOpen(0.06, 0)).toBeLessThan(0.2);
    expect(blinkOpen(1, 0)).toBe(1);
    expect(blinkOpen(3.8, 0)).toBe(1);
  });

  it("respira dentro de ±2 %", () => {
    for (let step = 0; step < 20; step += 1) {
      const scale = breathScale(step * 0.17, 0.4);
      expect(scale).toBeGreaterThanOrEqual(0.98);
      expect(scale).toBeLessThanOrEqual(1.02);
    }
  });

  it("balancea al andar y se queda quieto en el sitio", () => {
    const walk = rigSway(0.2, true);
    const idle = rigSway(0.2, false);
    expect(Math.abs(walk.z) + walk.y).toBeGreaterThan(0);
    expect(idle.z).toBe(0);
    expect(Math.abs(idle.y)).toBeLessThanOrEqual(0.012);
  });

  it("reparte la fase y avanza la ranura de las ventanas a 10 Hz", () => {
    expect(idlePhase("remolon")).not.toBe(idlePhase("brasa"));
    expect(windowPaintSlot(0.09)).toBe(0);
    expect(windowPaintSlot(0.1)).toBe(1);
    expect(windowPaintSlot(0.19)).toBe(1);
  });
});

describe("oclusión de vértices", () => {
  it("oscurece el borde del suelo y el centro de un mueble", () => {
    const spots = [{ x: 0, y: 0, r: 1 }];
    const middle = floorShade(0, 2, 10, 12, spots);
    const under = floorShade(0, 0, 10, 12, spots);
    const edge = floorShade(9.8, 0, 10, 12, spots);
    expect(under).toBeLessThan(middle);
    expect(edge).toBeLessThan(middle);
    expect(edge).toBeGreaterThanOrEqual(0.62);
  });

  it("aclara el muro hacia arriba", () => {
    expect(wallShade(0, 3)).toBeLessThan(wallShade(3, 3));
    expect(wallShade(3, 3)).toBeCloseTo(1);
  });

  it("las lámparas de pie caen dentro del suelo del lightmap", () => {
    for (const lamp of FLOOR_LAMPS) {
      const uv = floorUv(lamp.x, lamp.z);
      expect(uv.u, lamp.id).toBeGreaterThan(0);
      expect(uv.u, lamp.id).toBeLessThan(1);
      expect(uv.v, lamp.id).toBeGreaterThan(0);
      expect(uv.v, lamp.id).toBeLessThan(1);
    }
  });
});
