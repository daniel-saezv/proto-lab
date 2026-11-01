import { describe, expect, it } from "vitest";
import {
  DIALOGUE_VIEW_SECONDS,
  dialogueCameraPose,
  dialogueHeadFromTop,
  dialogueHeadTarget,
  dialogueSubject,
  dialogueTransitionSeconds,
} from "./dialogue-camera";
import { LOUNGE_NPCS } from "./lounge-layout";
import { CAMERA_CEILING_Y, ROOM_INNER } from "./navigation";

const VIEWS = [
  { aspect: 1280 / 800, fov: 58 },
  { aspect: 390 / 844, fov: 78 },
  { aspect: 844 / 390, fov: 58 },
] as const;

describe("cámara de diálogo", () => {
  it("encuadra la cara en la franja alta, delante del personaje y dentro de la sala", () => {
    const ids = ["inventor", ...LOUNGE_NPCS.map((npc) => npc.id)];
    for (const id of ids) {
      const subject = dialogueSubject(id);
      expect(subject, id).toBeTruthy();
      if (!subject) continue;
      const npc = LOUNGE_NPCS.find((item) => item.id === id);
      if (npc) expect(subject.yaw).toBe(npc.yaw);
      for (const view of VIEWS) {
        const pose = dialogueCameraPose(subject, view.aspect, view.fov);
        const fromTop = dialogueHeadFromTop(pose, subject, view.fov);
        const target = dialogueHeadTarget(view.aspect);
        expect(target).toBeGreaterThanOrEqual(0.16);
        expect(target).toBeLessThanOrEqual(0.32);
        expect(fromTop, `${id} ${view.aspect}`).toBeCloseTo(target, 1);
        const forwardX = Math.sin(subject.yaw);
        const forwardZ = Math.cos(subject.yaw);
        const facing = (pose.x - subject.x) * forwardX + (pose.z - subject.z) * forwardZ;
        expect(facing, id).toBeGreaterThan(1.2);
        const distance = Math.hypot(pose.x - subject.x, pose.z - subject.z);
        expect(distance, id).toBeGreaterThan(1.4);
        expect(distance, id).toBeLessThan(4);
        expect(pose.x).toBeGreaterThan(ROOM_INNER.minX);
        expect(pose.x).toBeLessThan(ROOM_INNER.maxX);
        expect(pose.z).toBeGreaterThan(ROOM_INNER.minZ);
        expect(pose.z).toBeLessThan(ROOM_INNER.maxZ);
        expect(pose.y).toBeGreaterThan(0.6);
        expect(pose.y).toBeLessThanOrEqual(CAMERA_CEILING_Y);
        expect(pose.lookX).toBeCloseTo(subject.x);
        expect(pose.lookZ).toBeCloseTo(subject.z);
        expect(pose.lookY).toBeLessThan(subject.headY);
      }
    }
  });

  it("no inventa un hablante y corta la transición si hay menos movimiento", () => {
    expect(dialogueSubject("pizarra")).toBeUndefined();
    expect(DIALOGUE_VIEW_SECONDS).toBeGreaterThanOrEqual(0.6);
    expect(DIALOGUE_VIEW_SECONDS).toBeLessThanOrEqual(0.9);
    expect(dialogueTransitionSeconds(false)).toBe(DIALOGUE_VIEW_SECONDS);
    expect(dialogueTransitionSeconds(true)).toBe(0);
  });
});
