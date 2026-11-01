import { describe, expect, it } from "vitest";
import { LAYOUT, ROOM_INNER } from "./navigation";
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
  const pieces = [
    { id: "nevera", ...LAYOUT.fridge },
    { id: "cajas", ...LAYOUT.crates },
    { id: "perro", ...LAYOUT.dog },
    { id: "planta", ...LAYOUT.plantRest },
    { id: "cartel", x: 9.38, z: pantryPosterZ(), collider: 0 },
  ];

  it("forma un solo grupo contra el muro este", () => {
    const zs = pieces.map((piece) => piece.z);
    expect(Math.max(...zs) - Math.min(...zs)).toBeLessThan(2.4);
    for (const piece of pieces) {
      expect(piece.x, piece.id).toBeGreaterThan(7.6);
      expect(ROOM_INNER.maxX - piece.x, piece.id).toBeLessThan(2.2);
    }
    expect(ROOM_INNER.maxX - LAYOUT.fridge.x).toBeLessThan(0.6);
    expect(ROOM_INNER.maxX - LAYOUT.crates.x).toBeLessThan(0.55);
    expect(Math.hypot(LAYOUT.crates.x - LAYOUT.fridge.x, LAYOUT.crates.z - LAYOUT.fridge.z)).toBeLessThan(1.2);
    expect(Math.hypot(LAYOUT.plantRest.x - LAYOUT.fridge.x, LAYOUT.plantRest.z - LAYOUT.fridge.z)).toBeLessThan(1.6);
    expect(Math.hypot(LAYOUT.dog.x - LAYOUT.fridge.x, LAYOUT.dog.z - LAYOUT.fridge.z)).toBeLessThan(1.5);
    expect(pantryPosterZ()).toBe(LAYOUT.crates.z);
    expect(LAYOUT.dog.x).toBeLessThan(LAYOUT.fridge.x - 0.7);
  });

  it("deja el perro sobre la alfombra y el paso libre", () => {
    const rug = pantryRug();
    expect(Math.abs(LAYOUT.dog.x - rug.x)).toBeLessThan(rug.width / 2 - 0.15);
    expect(Math.abs(LAYOUT.dog.z - rug.z)).toBeLessThan(rug.depth / 2 - 0.15);
    const approach = { x: 7.3, z: 5.1 };
    for (const piece of [LAYOUT.fridge, LAYOUT.crates, LAYOUT.dog, LAYOUT.plantRest]) {
      const gap = Math.hypot(approach.x - piece.x, approach.z - piece.z) - piece.collider;
      expect(gap).toBeGreaterThan(0.45);
    }
  });
});
