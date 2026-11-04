import { LOUNGE_NPCS } from "./lounge-layout";
import { CAMERA_CEILING_Y, LAYOUT, ROOM_INNER } from "./navigation";

/** Igual que el plano de la pizarra: corto, y cero si se pide menos movimiento. */
export const DIALOGUE_VIEW_SECONDS = 0.72;

export type DialoguePose = {
  x: number;
  y: number;
  z: number;
  lookX: number;
  lookY: number;
  lookZ: number;
};

export type DialogueSubject = {
  id: string;
  x: number;
  z: number;
  yaw: number;
  /** Altura de la cara en mundo. Tiene que coincidir con la malla. */
  headY: number;
};

const INVENTOR_HEAD_Y = 1.5;
/** seatY del rincón + 0,54 de la cabeza en addSeated. */
const SEATED_HEAD_Y = 1.06;
const CROQUIS_HEAD_Y = 0.84;

export function dialogueTransitionSeconds(reducedMotion: boolean): number {
  return reducedMotion ? 0 : DIALOGUE_VIEW_SECONDS;
}

export function dialogueSubject(id: string): DialogueSubject | undefined {
  if (id === "inventor") {
    return { id, x: LAYOUT.inventor.x, z: LAYOUT.inventor.z, yaw: 0, headY: INVENTOR_HEAD_Y };
  }
  const npc = LOUNGE_NPCS.find((item) => item.id === id);
  if (!npc) return undefined;
  return {
    id: npc.id,
    x: npc.x,
    z: npc.z,
    yaw: npc.yaw,
    headY: npc.id === "croquis" ? CROQUIS_HEAD_Y : SEATED_HEAD_Y,
  };
}

/**
 * Fracción desde el borde superior donde queremos la cara.
 * En horizontal estrecho (iPhone apaisado) el panel tapa más, así que sube.
 */
export function dialogueHeadTarget(aspect: number): number {
  if (aspect > 1.85) return 0.18;
  if (aspect < 0.9) return 0.24;
  return 0.28;
}

/**
 * Plano medio delante de la cara. El punto de mira queda por debajo de la
 * cabeza para que el personaje caiga en la franja alta: el diálogo tapa el bajo.
 */
export function dialogueCameraPose(subject: DialogueSubject, aspect: number, fovDeg: number): DialoguePose {
  const narrow = aspect < 0.9;
  // En vertical el fov es más abierto: hay que acercarse para que la cara
  // pueda subir al tercio alto sin mirar al suelo.
  const distance = narrow ? 1.7 : 2.45;
  const side = narrow ? 0.22 : 0.36;
  const fx = Math.sin(subject.yaw);
  const fz = Math.cos(subject.yaw);
  const rx = Math.cos(subject.yaw);
  const rz = -Math.sin(subject.yaw);
  const x = clamp(subject.x + fx * distance + rx * side, ROOM_INNER.minX + 0.4, ROOM_INNER.maxX - 0.4);
  const z = clamp(subject.z + fz * distance + rz * side, ROOM_INNER.minZ + 0.4, ROOM_INNER.maxZ - 0.4);
  const y = clamp(subject.headY + (narrow ? 0.02 : 0.1), 0.55, CAMERA_CEILING_Y - 0.06);
  const target = dialogueHeadTarget(aspect);
  const lookYFor = (drop: number) => Math.max(0.05, subject.headY - drop);
  let lo = 0.05;
  let hi = subject.headY - 0.05;
  for (let step = 0; step < 18; step += 1) {
    const drop = (lo + hi) / 2;
    const fromTop = dialogueHeadFromTop(
      { x, y, z, lookX: subject.x, lookY: lookYFor(drop), lookZ: subject.z },
      subject,
      fovDeg,
    );
    if (!Number.isFinite(fromTop) || fromTop > target) lo = drop;
    else hi = drop;
  }
  return {
    x,
    y,
    z,
    lookX: subject.x,
    lookY: lookYFor((lo + hi) / 2),
    lookZ: subject.z,
  };
}

/** 0 es el borde superior del encuadre y 1 el inferior. NaN si el punto queda detrás. */
export function dialoguePointFromTop(
  pose: DialoguePose,
  point: { x: number; y: number; z: number },
  fovDeg: number,
): number {
  const fx = pose.lookX - pose.x;
  const fy = pose.lookY - pose.y;
  const fz = pose.lookZ - pose.z;
  const length = Math.hypot(fx, fy, fz);
  if (length < 1e-5) return Number.NaN;
  const fvx = fx / length;
  const fvy = fy / length;
  const fvz = fz / length;
  const zx = -fvx;
  const zy = -fvy;
  const zz = -fvz;
  let xx = zz;
  let xy = 0;
  let xz = -zx;
  const xl = Math.hypot(xx, xy, xz);
  if (xl < 1e-5) return Number.NaN;
  xx /= xl;
  xy /= xl;
  xz /= xl;
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;
  const hx = point.x - pose.x;
  const hy = point.y - pose.y;
  const hz = point.z - pose.z;
  const depth = hx * fvx + hy * fvy + hz * fvz;
  if (depth <= 0.05) return Number.NaN;
  const up = hx * yx + hy * yy + hz * yz;
  const halfFov = ((fovDeg * Math.PI) / 180) / 2;
  const ndcY = up / depth / Math.tan(halfFov);
  return (1 - ndcY) / 2;
}

/** 0 es el borde superior del encuadre y 1 el inferior. NaN si la cara queda detrás. */
export function dialogueHeadFromTop(pose: DialoguePose, subject: DialogueSubject, fovDeg: number): number {
  return dialoguePointFromTop(pose, { x: subject.x, y: subject.headY, z: subject.z }, fovDeg);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
