import { describe, expect, it } from "vitest";
import { dialoguePointFromTop } from "./dialogue-camera";
import { CAMERA_CEILING_Y, LAYOUT, ROOM_INNER } from "./navigation";
import {
  INVENTOR_HOME,
  WORKSHOP_SEAT,
  WORKSHOP_TABLE_HALF_DEPTH,
  WORKSHOP_TRIP_SECONDS,
  homePose,
  poseAlong,
  remainingBlend,
  seatPose,
  workshopSeatCamera,
  workshopSeatSubject,
  workshopTableClear,
  workshopTableFrontZ,
  workshopTablePoint,
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

  it("sienta al Inventor entre el muro y la mesa, de cara a la sala, lejos de la radio", () => {
    const nearEdge = LAYOUT.desk.z - WORKSHOP_TABLE_HALF_DEPTH;
    const chairBack = WORKSHOP_SEAT.z - 0.28;
    expect(chairBack).toBeGreaterThan(ROOM_INNER.minZ + 0.15);
    expect(WORKSHOP_SEAT.z).toBeLessThan(nearEdge);
    expect(LAYOUT.desk.z).toBeGreaterThan(WORKSHOP_SEAT.z);
    expect(WORKSHOP_SEAT.yaw).toBe(0);
    expect(WORKSHOP_SEAT.x).toBe(LAYOUT.desk.x);
    const gap = Math.hypot(LAYOUT.radio.x - LAYOUT.desk.x, LAYOUT.radio.z - LAYOUT.desk.z);
    expect(gap).toBeGreaterThan(4);
    expect(LAYOUT.desk.x + 0.7).toBeLessThan(LAYOUT.radio.x - 0.5);
    expect(workshopTableFrontZ()).toBeLessThan(LAYOUT.radio.z - 2);
  });

  it("encuadra mesa e Inventor por encima del panel, en retrato y en apaisado", () => {
    const subject = workshopSeatSubject();
    const table = workshopTablePoint();
    expect(subject.headY).toBeGreaterThan(table.y);
    for (const view of VIEWS) {
      const pose = workshopSeatCamera(view.aspect, view.fov);
      const head = dialoguePointFromTop(pose, { x: subject.x, y: subject.headY, z: subject.z }, view.fov);
      const top = dialoguePointFromTop(pose, table, view.fov);
      const clear = workshopTableClear(view.aspect);
      expect(head, view.name).toBeGreaterThan(0.04);
      expect(head, view.name).toBeLessThan(0.2);
      expect(top, view.name).toBeGreaterThan(head);
      expect(top, view.name).toBeLessThan(clear);
      const forwardX = Math.sin(subject.yaw);
      const forwardZ = Math.cos(subject.yaw);
      const facing = (pose.x - subject.x) * forwardX + (pose.z - subject.z) * forwardZ;
      expect(facing, view.name).toBeGreaterThan(1.2);
      expect(pose.z, view.name).toBeGreaterThan(workshopTableFrontZ());
      expect(pose.y).toBeGreaterThan(0.5);
      expect(pose.y).toBeLessThanOrEqual(CAMERA_CEILING_Y);
      expect(pose.x).toBeGreaterThan(ROOM_INNER.minX);
      expect(pose.x).toBeLessThan(ROOM_INNER.maxX);
      expect(pose.z).toBeLessThan(ROOM_INNER.maxZ);
    }
  });
});
