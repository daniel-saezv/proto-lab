import { describe, expect, it } from "vitest";
import { LAYOUT, ROOM_INNER } from "./navigation";
import { FRIDGE_HINGE, FRIDGE_WIDTH } from "./pantry-layout";
import {
  FLOOR_GLOW,
  FLOOR_LAMPS,
  FLOOR_LIGHT,
  FLOOR_SHADE,
  HANGING_GLOW,
  HANGING_LIGHT,
  HANGING_SHADE,
  INDICATOR_AMBER,
  LAMP_BULB,
  LAMP_GLOW,
  SCONCE_GLOW,
  SCONCE_LIGHT,
  SCONCE_SHADE,
  colorDistance,
  glowReadsAsLamp,
  insetFromNearestWall,
  pantryPosterZ,
  pantryRug,
} from "./scene-lights";

describe("lámparas del lobby", () => {
  it("no reutilizan el ámbar de los indicadores", () => {
    expect(colorDistance(LAMP_BULB, INDICATOR_AMBER)).toBeGreaterThan(140);
    expect(colorDistance(LAMP_GLOW, INDICATOR_AMBER)).toBeGreaterThan(80);
    expect(LAMP_BULB).not.toBe(INDICATOR_AMBER);
    expect(LAMP_GLOW).not.toBe(INDICATOR_AMBER);
  });

  it("la boca es una banda dentro de una pantalla, no una bola ni un anillo", () => {
    expect(glowReadsAsLamp(FLOOR_SHADE, FLOOR_GLOW)).toBe(true);
    expect(glowReadsAsLamp(HANGING_SHADE, HANGING_GLOW)).toBe(true);
    expect(glowReadsAsLamp(SCONCE_SHADE, SCONCE_GLOW)).toBe(true);
  });

  it("bañan el suelo con un alcance largo para no dibujar un disco", () => {
    for (const light of [FLOOR_LIGHT, HANGING_LIGHT, SCONCE_LIGHT]) {
      expect(light.distance).toBeGreaterThanOrEqual(9);
      expect(light.intensity).toBeLessThan(3);
      expect(light.decay).toBe(2);
    }
  });

  it("las de pie quedan junto al muro y fuera del paso", () => {
    expect(FLOOR_LAMPS).toHaveLength(2);
    for (const lamp of FLOOR_LAMPS) {
      expect(insetFromNearestWall(lamp.x, lamp.z)).toBeLessThan(0.85);
      expect(lamp.x).toBeGreaterThan(ROOM_INNER.minX);
      expect(lamp.x).toBeLessThan(ROOM_INNER.maxX);
      expect(Math.hypot(lamp.x - LAYOUT.fridge.x, lamp.z - LAYOUT.fridge.z)).toBeGreaterThan(4);
      expect(Math.abs(lamp.x)).toBeGreaterThan(6);
    }
  });
});

describe("rincón de la nevera", () => {
  it("forma una cocina contra el muro este y la nevera mira a la sala", () => {
    expect(ROOM_INNER.maxX - LAYOUT.fridge.x).toBeLessThan(0.45);
    expect(FRIDGE_HINGE.x).toBeLessThan(LAYOUT.fridge.x - 0.2);
    expect(Math.abs(FRIDGE_HINGE.z - (LAYOUT.fridge.z + FRIDGE_WIDTH / 2))).toBeLessThan(0.02);
    expect(LAYOUT.counter.z).toBeGreaterThan(LAYOUT.fridge.z + 1);
    expect(ROOM_INNER.maxX - LAYOUT.counter.x).toBeLessThan(0.45);
    expect(LAYOUT.counter.z - LAYOUT.fridge.z).toBeLessThan(2);
    expect(LAYOUT.crates.z).toBeGreaterThan(LAYOUT.counter.z);
    expect(ROOM_INNER.maxX - LAYOUT.crates.x).toBeLessThan(0.55);
    expect(LAYOUT.dog.z).toBeLessThan(LAYOUT.fridge.z - 0.8);
    expect(LAYOUT.dog.x).toBeLessThan(LAYOUT.fridge.x - 1);
    expect(Math.hypot(LAYOUT.cat.x - LAYOUT.dog.x, LAYOUT.cat.z - LAYOUT.dog.z)).toBeLessThan(1.1);
    expect(Math.hypot(LAYOUT.cat.x - LAYOUT.dog.x, LAYOUT.cat.z - LAYOUT.dog.z)).toBeGreaterThan(0.45);
    expect(Math.hypot(LAYOUT.plantRest.x - LAYOUT.counter.x, LAYOUT.plantRest.z - LAYOUT.counter.z)).toBeLessThan(2.2);
    expect(pantryPosterZ()).toBe(LAYOUT.counter.z);
    expect(LAYOUT.kitchenTable.x).toBeLessThan(LAYOUT.counter.x - 1);
  });

  it("deja la alfombra delante de la encimera y las camas al sur", () => {
    const rug = pantryRug();
    expect(rug.x).toBeLessThan(LAYOUT.counter.x - 0.5);
    expect(Math.abs(rug.z - LAYOUT.counter.z)).toBeLessThan(0.2);
    expect(LAYOUT.dog.z).toBeLessThan(rug.z - rug.depth / 2);
    expect(LAYOUT.cat.z).toBeLessThan(rug.z - rug.depth / 2);
    const approach = { x: 7.3, z: 5.1 };
    for (const piece of [LAYOUT.fridge, LAYOUT.counter, LAYOUT.kitchenTable]) {
      const gap = Math.hypot(approach.x - piece.x, approach.z - piece.z) - piece.collider;
      expect(gap, piece === LAYOUT.fridge ? "nevera" : "mueble").toBeGreaterThan(0.45);
    }
  });
});
