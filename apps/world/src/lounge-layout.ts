/**
 * Rincón de sofás del lobby.
 * El yaw sigue la rotación Y de Three.js: la mirada local +Z
 * cae en mundo como (sin yaw, cos yaw).
 */

export type LoungeFurniture = {
  id: string;
  x: number;
  z: number;
  collider: number;
  /** Hacia dónde mira el asiento o la pantalla. */
  yaw: number;
};

export type LoungeNpc = {
  id: string;
  name: string;
  label: string;
  x: number;
  z: number;
  yaw: number;
  radius: number;
  color: number;
  approach: { x: number; z: number };
};

export function forwardFromYaw(yaw: number): { x: number; z: number } {
  return { x: Math.sin(yaw), z: Math.cos(yaw) };
}

export function yawToward(from: { x: number; z: number }, to: { x: number; z: number }): number {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

const slackerX = -8.55;
const slackerZ = -4.15;
const tableX = -7.05;
const tableZ = -4.15;
const tvX = -5.85;
const tvZ = -4.15;
const northX = -7.05;
const northZ = -5.65;
const southX = -7.05;
const southZ = -2.75;
const croquisX = -5.25;
const croquisZ = -1.45;

export const SLACKER_COUCH: LoungeFurniture = {
  id: "couch",
  x: slackerX,
  z: slackerZ,
  collider: 0.72,
  yaw: Math.PI / 2,
};

export const NORTH_COUCH: LoungeFurniture = {
  id: "couchNorth",
  x: northX,
  z: northZ,
  collider: 0.72,
  yaw: 0,
};

export const SOUTH_COUCH: LoungeFurniture = {
  id: "couchSouth",
  x: southX,
  z: southZ,
  collider: 0.72,
  yaw: Math.PI,
};

export const LOUNGE_TABLE: LoungeFurniture = {
  id: "loungeTable",
  x: tableX,
  z: tableZ,
  collider: 0.55,
  yaw: 0,
};

export const TV_SET: LoungeFurniture = {
  id: "tv",
  x: tvX,
  z: tvZ,
  collider: 0.4,
  yaw: -Math.PI / 2,
};

export const LOUNGE_FURNITURE: readonly LoungeFurniture[] = [
  SLACKER_COUCH,
  NORTH_COUCH,
  SOUTH_COUCH,
  LOUNGE_TABLE,
  TV_SET,
  { id: "croquis", x: croquisX, z: croquisZ, collider: 0.32, yaw: 0 },
];

export const SLACKER_BUBBLE_RADIUS = 2.45;

export const LOUNGE_NPCS: readonly LoungeNpc[] = [
  {
    id: "remolon",
    name: "Remolón",
    label: "Hablar con Remolón",
    x: slackerX,
    z: slackerZ,
    yaw: SLACKER_COUCH.yaw,
    radius: 1.7,
    color: 0xffb703,
    approach: { x: -8.95, z: -2.9 },
  },
  {
    id: "brasa",
    name: "Brasa",
    label: "Hablar con Brasa",
    x: northX,
    z: northZ,
    yaw: NORTH_COUCH.yaw,
    radius: 1.65,
    color: 0xff6b2c,
    approach: { x: -7.85, z: -6.55 },
  },
  {
    id: "naipe",
    name: "Naipe",
    label: "Hablar con Naipe",
    x: southX,
    z: southZ,
    yaw: SOUTH_COUCH.yaw,
    radius: 1.7,
    color: 0xff6b9d,
    approach: { x: -8.15, z: -1.85 },
  },
  {
    id: "croquis",
    name: "Croquis",
    label: "Hablar con Croquis",
    x: croquisX,
    z: croquisZ,
    yaw: yawToward({ x: croquisX, z: croquisZ }, { x: tableX, z: tableZ }),
    radius: 1.65,
    color: 0x8fd8ff,
    approach: { x: -4.15, z: -0.55 },
  },
];

export function loungeNpc(id: string): LoungeNpc | undefined {
  return LOUNGE_NPCS.find((npc) => npc.id === id);
}

/** Caja alineada al yaw, con los semiejes en el espacio local del mueble. */
export function orientedAabb(
  x: number,
  z: number,
  yaw: number,
  halfX: number,
  halfZ: number,
  maxY: number,
): { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number } {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const corners: Array<[number, number]> = [
    [halfX, halfZ],
    [halfX, -halfZ],
    [-halfX, halfZ],
    [-halfX, -halfZ],
  ];
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [lx, lz] of corners) {
    const wx = x + lx * c + lz * s;
    const wz = z - lx * s + lz * c;
    minX = Math.min(minX, wx);
    maxX = Math.max(maxX, wx);
    minZ = Math.min(minZ, wz);
    maxZ = Math.max(maxZ, wz);
  }
  return { minX, maxX, minY: 0, maxY, minZ, maxZ };
}

export function loungeCameraBlockers(): Array<{
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}> {
  const couches = [SLACKER_COUCH, NORTH_COUCH, SOUTH_COUCH];
  const blocks = couches.map((couch) => orientedAabb(couch.x, couch.z, couch.yaw, 0.85, 0.48, 1.05));
  blocks.push(orientedAabb(TV_SET.x, TV_SET.z, TV_SET.yaw, 0.34, 0.24, 0.9));
  return blocks;
}
