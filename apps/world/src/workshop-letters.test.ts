import { PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { workshopTableClear } from "./workshop-cinematic";
import {
  IDEA_TRIANGLE_CAP,
  buildIdeaGeometry,
  cloudAnchor,
  ideaTriangleCount,
  layoutCloudSlots,
  paintIdeaColors,
  workshopIdeaMeshes,
} from "./workshop-letters";

const LONG = "¿Y si la cometa dejara un rastro de luz que se pudiera guardar al llegar al borde y el color cambiara con la altura del dedo amigo?";

describe("letras 3D del taller", () => {
  it("funde la nube y el texto en una malla y cabe en el cupo", () => {
    const text = LONG.padEnd(120, " luz");
    expect(text.length).toBeGreaterThanOrEqual(120);
    const geometry = buildIdeaGeometry(text.slice(0, 120));
    const triangles = ideaTriangleCount(geometry);
    expect(geometry.getAttribute("position")).toBeTruthy();
    expect(geometry.getAttribute("color")).toBeTruthy();
    expect(triangles).toBeGreaterThan(20);
    expect(triangles).toBeLessThanOrEqual(IDEA_TRIANGLE_CAP);
    expect(triangles * 12 + 4_000).toBeLessThanOrEqual(40_000);
    geometry.dispose();
  });

  it("marca la idea elegida y deja las anteriores más tenues", () => {
    const geometry = buildIdeaGeometry("¿Y si brillara?");
    paintIdeaColors(geometry, "now", false);
    const idle = geometry.getAttribute("color").getX(0);
    paintIdeaColors(geometry, "now", true);
    const picked = geometry.getAttribute("color").getX(0);
    paintIdeaColors(geometry, "past", false);
    const past = geometry.getAttribute("color").getX(0);
    expect(picked).toBeGreaterThan(idle);
    expect(past).toBeLessThan(idle);
    geometry.dispose();
  });

  it("coloca cuatro ideas en la franja libre y deja las ya elegidas detrás", () => {
    for (const [aspect, fov] of [
      [390 / 844, 78],
      [844 / 390, 58],
      [1280 / 800, 58],
    ] as const) {
      const slots = layoutCloudSlots(4, 3, aspect, fov);
      expect(slots.now).toHaveLength(4);
      expect(slots.past).toHaveLength(3);
      const clear = workshopTableClear(aspect);
      const floor = 1 - 2 * clear;
      for (const slot of [...slots.now, ...slots.past]) {
        expect(slot.ndcY).toBeGreaterThan(floor - 0.02);
        expect(Math.abs(slot.ndcX)).toBeLessThanOrEqual(0.95);
        expect(slot.scale).toBeGreaterThan(0.05);
      }
      expect(Math.min(...slots.past.map((slot) => slot.depth))).toBeGreaterThan(Math.max(...slots.now.map((slot) => slot.depth)));
      const apparent = (slot: { scale: number; depth: number }) => slot.scale / slot.depth;
      expect(Math.max(...slots.past.map(apparent))).toBeLessThan(Math.min(...slots.now.map(apparent)));
      expect(Math.min(...slots.past.map((slot) => slot.ndcY))).toBeGreaterThan(Math.max(...slots.now.map((slot) => slot.ndcY)) - 0.05);
    }
  });

  it("apoya cada nube entre la cámara y el Inventor", () => {
    const camera = new PerspectiveCamera(78, 390 / 844, 0.05, 80);
    camera.position.set(6.62, 0.72, -4.98);
    camera.lookAt(6.4, 0.42, -6.5);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    const slot = layoutCloudSlots(4, 0, camera.aspect, camera.fov).now[0];
    expect(slot).toBeTruthy();
    const point = cloudAnchor(camera, slot!, new Vector3());
    const toCloud = point.distanceTo(camera.position);
    expect(toCloud).toBeCloseTo(slot!.depth, 1);
    expect(point.z).toBeLessThan(camera.position.z);
    expect(point.z).toBeGreaterThan(-6.5);
  });

  it("conserva las ideas ya elegidas y una malla por idea de la ronda", () => {
    const meshes = workshopIdeaMeshes(
      ["¿Y si brillara?", "¿Y si sonara?"],
      new Set(["¿Y si brillara?"]),
      [{ round: 1, ideas: ["¿Y si dejara luz?", ""] }],
    );
    expect(meshes.map((idea) => idea.id)).toEqual(["past-1-0", "now-0", "now-1"]);
    expect(meshes.filter((idea) => idea.role === "now" && idea.picked).map((idea) => idea.text)).toEqual(["¿Y si brillara?"]);
    expect(meshes.filter((idea) => idea.role === "past")).toHaveLength(1);
  });
});
