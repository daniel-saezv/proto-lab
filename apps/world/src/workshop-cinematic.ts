import type { DialogueSubject } from "./dialogue-camera";
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

/** Altura del tablero. La caja del escritorio llega hasta aquí. */
export const WORKSHOP_TABLE_TOP_Y = 0.76;
/** Mitad de la profundidad de la caja (eje Z). */
export const WORKSHOP_TABLE_HALF_DEPTH = 0.35;

/**
 * Silla entre la mesa y el muro norte. Yaw 0: la cara mira a +Z,
 * hacia la mesa y hacia la sala.
 */
export const WORKSHOP_SEAT = {
  x: LAYOUT.desk.x,
  y: 0,
  z: -6.88,
  yaw: 0,
} as const;

/** Fracción desde arriba que el panel del taller deja libre. La mesa tiene que quedar por encima. */
export function workshopTableClear(aspect: number): number {
  return aspect > 1.85 ? 0.46 : 0.4;
}

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

/**
 * Plano bajo, desde la sala: la mesa queda entre la cámara y el Inventor.
 * La cara y el tablero caben en la franja que el panel no tapa.
 */
export function workshopSeatCamera(aspect: number, fovDeg: number) {
  const subject = workshopSeatSubject();
  const wide = aspect > 1.2;
  const dist = wide ? 2.6 : 1.9;
  const side = wide ? 0.35 : 0.22;
  const fx = Math.sin(subject.yaw);
  const fz = Math.cos(subject.yaw);
  const rx = Math.cos(subject.yaw);
  const rz = -Math.sin(subject.yaw);
  return {
    x: clampRoom(subject.x + fx * dist + rx * side, ROOM_INNER.minX + 0.4, ROOM_INNER.maxX - 0.4),
    y: wide ? 0.7 : 0.72,
    z: clampRoom(subject.z + fz * dist + rz * side, ROOM_INNER.minZ + 0.4, ROOM_INNER.maxZ - 0.4),
    lookX: subject.x,
    lookY: wide ? 0.38 : 0.42,
    lookZ: subject.z + fz * 0.38,
  };
}

export function workshopTablePoint(): { x: number; y: number; z: number } {
  return { x: LAYOUT.desk.x, y: WORKSHOP_TABLE_TOP_Y, z: LAYOUT.desk.z };
}

/** Borde de la mesa que mira a la sala (hacia la cámara). */
export function workshopTableFrontZ(): number {
  return LAYOUT.desk.z + WORKSHOP_TABLE_HALF_DEPTH;
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
