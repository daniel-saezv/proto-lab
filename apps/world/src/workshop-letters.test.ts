import { PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { WORKSHOP_SEAT, workshopThinkCamera } from "./workshop-cinematic";
import {
  IDEA_TRIANGLE_CAP,
  buildIdeaGeometry,
  cloudAnchor,
  ideaPalette,
  ideaTriangleCount,
  layoutCloudSlots,
  workshopIdeaMeshes,
} from "./workshop-letters";

describe("letras del taller", () => {
  it("una idea es un plano y doce siguen bajo el cupo de la sala", () => {
    const geometry = buildIdeaGeometry();
    const triangles = ideaTriangleCount(geometry);
    expect(triangles).toBeGreaterThan(0);
    expect(triangles).toBeLessThanOrEqual(IDEA_TRIANGLE_CAP);
    expect(triangles * 12 + 4_000).toBeLessThanOrEqual(40_000);
    geometry.dispose();
  });

  it("escribe en negro sobre nube blanca y marca la elegida con un brillo", () => {
    const idle = ideaPalette("now", false);
    const picked = ideaPalette("now", true);
    const past = ideaPalette("past", false);
    expect(luminance(idle.ink)).toBeLessThan(0.15);
    expect(luminance(idle.cloud)).toBeGreaterThan(0.9);
    expect(picked.ink).toBe(idle.ink);
    expect(picked.glow).not.toBe(idle.glow);
    expect(luminance(past.ink)).toBeGreaterThan(0.6);
  });

  it("rodea al Inventor y deja las ideas ya elegidas arriba y más pequeñas", () => {
    for (const [aspect, fov] of [
      [390 / 844, 78],
      [844 / 390, 58],
      [1280 / 800, 58],
    ] as const) {
      const slots = layoutCloudSlots(4, 3, aspect, fov);
      expect(slots.now).toHaveLength(4);
      expect(slots.past).toHaveLength(3);
      for (const slot of [...slots.now, ...slots.past]) {
        expect(slot.ndcY).toBeGreaterThan(-0.7);
        expect(Math.abs(slot.ndcX)).toBeLessThanOrEqual(0.95);
        expect(slot.scale).toBeGreaterThan(0.05);
      }
      expect(slots.now.filter((slot) => slot.ndcX < 0).length).toBeGreaterThan(0);
      expect(slots.now.filter((slot) => slot.ndcX > 0).length).toBeGreaterThan(0);
      expect(Math.min(...slots.past.map((slot) => slot.depth))).toBeGreaterThan(Math.max(...slots.now.map((slot) => slot.depth)));
      const apparent = (slot: { scale: number; depth: number }) => slot.scale / slot.depth;
      expect(Math.max(...slots.past.map(apparent))).toBeLessThan(Math.min(...slots.now.map(apparent)));
      expect(Math.min(...slots.past.map((slot) => slot.ndcY))).toBeGreaterThan(Math.max(...slots.now.map((slot) => slot.ndcY)));
    }
  });

  it("apoya cada nube entre la cámara y el Inventor", () => {
    const pose = workshopThinkCamera(390 / 844, 78);
    const camera = new PerspectiveCamera(78, 390 / 844, 0.05, 80);
    camera.position.set(pose.x, pose.y, pose.z);
    camera.lookAt(pose.lookX, pose.lookY, pose.lookZ);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    const slot = layoutCloudSlots(4, 0, camera.aspect, camera.fov).now[0];
    expect(slot).toBeTruthy();
    const point = cloudAnchor(camera, slot!, new Vector3());
    expect(point.distanceTo(camera.position)).toBeCloseTo(slot!.depth, 1);
    expect(point.z).toBeLessThan(camera.position.z);
    expect(point.z).toBeGreaterThan(WORKSHOP_SEAT.z + 0.15);
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

function luminance(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
}
