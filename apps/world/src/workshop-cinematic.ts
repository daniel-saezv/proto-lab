import { dialogueCameraPose, dialogueHeadFromTop, dialogueHeadTarget, type DialogueSubject } from "./dialogue-camera";
import { LAYOUT, ROOM_INNER } from "./navigation";
import { smoothstep01 } from "./whiteboard-view";

/** Viaje al escritorio. Cero si se pide menos movimiento o en `?e2e=1`. */
export const WORKSHOP_TRIP_SECONDS = 2.4;

export const INVENTOR_HOME = {
  x: LAYOUT.inventor.x,
  y: 0,
  z: LAYOUT.inventor.z,
  yaw: 0,
} as const;

/** Delante del escritorio, de cara a la sala. La silla usa el mismo punto. */
export const WORKSHOP_SEAT = {
  x: 6.15,
  y: 0,
  z: -6.18,
  yaw: 0.12,
} as const;

/** Cara del Inventor de pie, que no baja al sentarse: solo giran las piernas. */
export const WORKSHOP_HEAD_Y = 1.5;

export type InventorPose = {
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** 0 de pie, 1 sentado. */
  sit: number;
};

export function workshopTripSeconds(reducedMotion: boolean): number {
  return reducedMotion ? 0 : WORKSHOP_TRIP_SECONDS;
}

export function homePose(): InventorPose {
  return { x: INVENTOR_HOME.x, y: INVENTOR_HOME.y, z: INVENTOR_HOME.z, yaw: INVENTOR_HOME.yaw, sit: 0 };
}

export function seatPose(): InventorPose {
  return { x: WORKSHOP_SEAT.x, y: WORKSHOP_SEAT.y, z: WORKSHOP_SEAT.z, yaw: WORKSHOP_SEAT.yaw, sit: 1 };
}

export function workshopSeatSubject(): DialogueSubject {
  return {
    id: "inventor",
    x: WORKSHOP_SEAT.x,
    z: WORKSHOP_SEAT.z,
    yaw: WORKSHOP_SEAT.yaw,
    headY: WORKSHOP_HEAD_Y,
  };
}

export function workshopSeatCamera(aspect: number, fovDeg: number) {
  const subject = workshopSeatSubject();
  const pose = dialogueCameraPose(subject, aspect, fovDeg);
  const rx = Math.cos(WORKSHOP_SEAT.yaw);
  const rz = -Math.sin(WORKSHOP_SEAT.yaw);
  // Tres cuartos: de frente las piernas plegadas no se leen y la silla queda detrás.
  const extra = aspect < 0.9 ? 0.95 : 1.25;
  const shifted = {
    ...pose,
    x: clampRoom(pose.x + rx * extra, ROOM_INNER.minX + 0.4, ROOM_INNER.maxX - 0.4),
    z: clampRoom(pose.z + rz * extra, ROOM_INNER.minZ + 0.4, ROOM_INNER.maxZ - 0.4),
  };
  const target = dialogueHeadTarget(aspect);
  let lo = 0.05;
  let hi = Math.max(0.06, subject.headY - 0.05);
  for (let step = 0; step < 18; step += 1) {
    const drop = (lo + hi) / 2;
    const fromTop = dialogueHeadFromTop(
      { ...shifted, lookY: Math.max(0.05, subject.headY - drop) },
      subject,
      fovDeg,
    );
    if (!Number.isFinite(fromTop) || fromTop > target) lo = drop;
    else hi = drop;
  }
  return { ...shifted, lookY: Math.max(0.05, subject.headY - (lo + hi) / 2) };
}

function clampRoom(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Curva del tramo que queda tras girar el teléfono, sin saltar la posición actual. */
export function remainingBlend(tripU: number, rebaseU: number): number {
  if (rebaseU >= 0.999) return 1;
  const t = (tripU - rebaseU) / (1 - rebaseU);
  return smoothstep01(t);
}

export function poseAlong(from: InventorPose, to: InventorPose, u: number): InventorPose {
  const s = smoothstep01(u);
  const heading = Math.atan2(to.x - from.x, to.z - from.z);
  const turnStart = to.sit > from.sit ? 0.62 : 0;
  const turn = turnStart === 0 ? s : s < turnStart ? 0 : smoothstep01((s - turnStart) / (1 - turnStart));
  return {
    x: from.x + (to.x - from.x) * s,
    y: from.y + (to.y - from.y) * s,
    z: from.z + (to.z - from.z) * s,
    yaw: lerpAngle(heading, to.yaw, turn),
    sit: sitAmount(from.sit, to.sit, s),
  };
}

function sitAmount(fromSit: number, toSit: number, s: number): number {
  if (toSit >= fromSit) {
    if (s < 0.68) return fromSit;
    return fromSit + (toSit - fromSit) * smoothstep01((s - 0.68) / 0.32);
  }
  if (s > 0.32) return toSit;
  return fromSit + (toSit - fromSit) * smoothstep01(s / 0.32);
}

function lerpAngle(from: number, to: number, t: number): number {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * t;
}
