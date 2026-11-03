import { describe, expect, it } from "vitest";
import { dialogueHeadFromTop, dialogueHeadTarget } from "./dialogue-camera";
import { CAMERA_CEILING_Y, ROOM_INNER } from "./navigation";
import {
  INVENTOR_HOME,
  WORKSHOP_SEAT,
  WORKSHOP_TRIP_SECONDS,
  homePose,
  poseAlong,
  remainingBlend,
  seatPose,
  workshopSeatCamera,
  workshopSeatSubject,
  workshopTripSeconds,
} from "./workshop-cinematic";

const VIEWS = [
  { name: "retrato", aspect: 390 / 844, fov: 78 },
  { name: "apaisado", aspect: 844 / 390, fov: 58 },
] as const;

describe("cinemática del escritorio", () => {
  it("dura un instante si se pide menos movimiento", () => {
    expect(WORKSHOP_TRIP_SECONDS).toBeGreaterThan(1.2);
    expect(WORKSHOP_TRIP_SECONDS).toBeLessThan(3.2);
    expect(workshopTripSeconds(false)).toBe(WORKSHOP_TRIP_SECONDS);
    expect(workshopTripSeconds(true)).toBe(0);
  });

  it("sale de pie desde casa y termina sentado en el escritorio", () => {
    const home = homePose();
    const seat = seatPose();
    const start = poseAlong(home, seat, 0);
    const mid = poseAlong(home, seat, 0.5);
    const end = poseAlong(home, seat, 1);
    expect(start.x).toBeCloseTo(INVENTOR_HOME.x);
    expect(start.z).toBeCloseTo(INVENTOR_HOME.z);
    expect(start.sit).toBe(0);
    expect(mid.sit).toBe(0);
    expect(mid.x).toBeGreaterThan(home.x);
    expect(mid.x).toBeLessThan(seat.x);
    expect(end.x).toBeCloseTo(WORKSHOP_SEAT.x);
    expect(end.z).toBeCloseTo(WORKSHOP_SEAT.z);
    expect(end.yaw).toBeCloseTo(WORKSHOP_SEAT.yaw);
    expect(end.sit).toBe(1);
  });

  it("al volver se levanta y acaba en el sitio de siempre", () => {
    const back = poseAlong(seatPose(), homePose(), 1);
    expect(back.sit).toBe(0);
    expect(back.x).toBeCloseTo(INVENTOR_HOME.x);
    expect(back.z).toBeCloseTo(INVENTOR_HOME.z);
    expect(back.yaw).toBeCloseTo(INVENTOR_HOME.yaw);
    const early = poseAlong(seatPose(), homePose(), 0.08);
    expect(early.sit).toBeLessThan(1);
  });

  it("recalcula el tramo de cámara que queda sin saltar el avance", () => {
    expect(remainingBlend(0.4, 0.4)).toBe(0);
    expect(remainingBlend(1, 0.4)).toBe(1);
    expect(remainingBlend(0.7, 0.4)).toBeGreaterThan(0.4);
    expect(remainingBlend(0.7, 0.4)).toBeLessThan(0.95);
  });

  it("encuadra la cara sentada en el tercio alto, en retrato y en apaisado", () => {
    const subject = workshopSeatSubject();
    expect(subject.headY).toBeGreaterThan(1.2);
    for (const view of VIEWS) {
      const pose = workshopSeatCamera(view.aspect, view.fov);
      const fromTop = dialogueHeadFromTop(pose, subject, view.fov);
      const target = dialogueHeadTarget(view.aspect);
      expect(fromTop, view.name).toBeCloseTo(target, 2);
      expect(target, view.name).toBeLessThanOrEqual(0.28);
      const forwardX = Math.sin(subject.yaw);
      const forwardZ = Math.cos(subject.yaw);
      const facing = (pose.x - subject.x) * forwardX + (pose.z - subject.z) * forwardZ;
      expect(facing, view.name).toBeGreaterThan(1.2);
      expect(pose.y).toBeGreaterThan(0.6);
      expect(pose.y).toBeLessThanOrEqual(CAMERA_CEILING_Y);
      expect(pose.x).toBeGreaterThan(ROOM_INNER.minX);
      expect(pose.x).toBeLessThan(ROOM_INNER.maxX);
      expect(pose.z).toBeGreaterThan(ROOM_INNER.minZ);
      expect(pose.z).toBeLessThan(ROOM_INNER.maxZ);
      expect(pose.lookY).toBeLessThan(subject.headY);
    }
  });
});
