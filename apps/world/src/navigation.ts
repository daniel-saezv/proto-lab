import { LOUNGE_FURNITURE, loungeCameraBlockers } from "./lounge-layout";
import {
  CAT_BED,
  DOG_BED,
  FRIDGE_DEPTH,
  FRIDGE_HINGE,
  FRIDGE_PLACE,
  FRIDGE_WIDTH,
  KITCHEN_BIN,
  KITCHEN_TABLE,
  PANTRY_COUNTER,
} from "./pantry-layout";

export const PLAYER_RADIUS = 0.38;

/** Alcance para cambiar la música, el mismo del dial. */
export const RADIO_USE_RADIUS = 2.1;
/** Delante de la radio, mirando al este: dentro de su radio y fuera del de cualquier otra zona. */
export const RADIO_APPROACH = { x: 7.05, z: 0.55 };

/**
 * Caras interiores de los muros (el muro tiene 0,4 de grosor).
 * El suelo útil va de aquí hasta el jugador, sin descontar la cámara.
 */
export const ROOM_INNER = {
  minX: -9.6,
  maxX: 9.6,
  minZ: -7.4,
  maxZ: 12,
} as const;

/** Cara inferior del techo (mallas). Las vigas cuelgan por debajo. */
export const CEILING_UNDERSIDE = 3.42;

/**
 * Altura máxima de la cámara: bajo el suelo de las vigas (≈ 3,08)
 * y de las pantallas de las lámparas (≈ 2,99).
 */
export const CAMERA_CEILING_Y = 2.96;

/** Margen para que el near plane no se coma el muro cuando la cámara se acerca. */
export const CAMERA_WALL_MARGIN = 0.32;
export const CAMERA_NEAR = 0.05;
export const CAMERA_BASE_Y = 2.55;

export type ColliderSpot = {
  id: string;
  x: number;
  z: number;
  collider: number;
};

export type WorldBounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

export type CameraBlocker = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
};

/** Mobiliario del lobby. Las mallas y estos colliders tienen que coincidir. */
export const LAYOUT = {
  inventor: { x: -1.5, z: -3.4, collider: 0.42 },
  bench: { x: 1.2, z: -3.4, collider: 0.52 },
  crates: { x: 9.22, z: 8.62, collider: 0.34 },
  plant: { x: -8.55, z: -6.15, collider: 0.28 },
  couch: piece("couch"),
  couchNorth: piece("couchNorth"),
  couchSouth: piece("couchSouth"),
  loungeTable: piece("loungeTable"),
  tv: piece("tv"),
  croquis: piece("croquis"),
  fridge: { x: FRIDGE_PLACE.x, z: FRIDGE_PLACE.z, collider: 0.42 },
  counter: { x: PANTRY_COUNTER.x, z: PANTRY_COUNTER.z, collider: PANTRY_COUNTER.collider },
  kitchenTable: { x: KITCHEN_TABLE.x, z: KITCHEN_TABLE.z, collider: KITCHEN_TABLE.collider },
  bin: { x: KITCHEN_BIN.x, z: KITCHEN_BIN.z, collider: KITCHEN_BIN.collider },
  dog: { x: DOG_BED.x, z: DOG_BED.z, collider: 0.28 },
  cat: { x: CAT_BED.x, z: CAT_BED.z, collider: 0.24 },
  /** Separado del muro norte: la silla queda entre la mesa y la pared. La cocina queda en el este. */
  desk: { x: 6.4, z: -6.05, collider: 0.55 },
  shelves: { x: 9.32, z: -5.15, collider: 0.42 },
  pinball: { x: -4.85, z: 5.55, collider: 0.48 },
  arcade: { x: 0.6, z: -0.35, collider: 0.78 },
  chalkboard: { x: -4.6, z: -6.8, collider: 0.55 },
  radio: { x: 8.45, z: 0.55, collider: 0.26 },
  plantPinball: { x: -7.7, z: 7.35, collider: 0.24 },
  plantRest: { x: 8.05, z: 8.72, collider: 0.22 },
} as const;

export function resolvePosition(
  position: { x: number; z: number },
  spots: ColliderSpot[],
  bounds: WorldBounds,
): void {
  for (let pass = 0; pass < 2; pass++) {
    for (const spot of spots) {
      if (spot.collider <= 0) continue;
      const dx = position.x - spot.x;
      const dz = position.z - spot.z;
      const min = spot.collider + PLAYER_RADIUS;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq >= min * min) continue;
      const distance = Math.sqrt(distanceSq) || 0.0001;
      const push = (min - distance) / distance;
      position.x += dx * push;
      position.z += dz * push;
    }
  }
  position.x = clamp(position.x, bounds.minX, bounds.maxX);
  position.z = clamp(position.z, bounds.minZ, bounds.maxZ);
}

/**
 * Mueve en X y luego en Z, resolviendo cada eje.
 * Así el jugador se desliza a lo largo de muros y muebles en vez de clavarse.
 */
export function moveWithSlide(
  position: { x: number; z: number },
  dx: number,
  dz: number,
  spots: ColliderSpot[],
  bounds: WorldBounds,
): { movedX: number; movedZ: number } {
  const startX = position.x;
  const startZ = position.z;
  if (dx !== 0) {
    position.x += dx;
    resolvePosition(position, spots, bounds);
  }
  if (dz !== 0) {
    position.z += dz;
    resolvePosition(position, spots, bounds);
  }
  return { movedX: position.x - startX, movedZ: position.z - startZ };
}

export function walkToward(
  from: { x: number; z: number },
  to: { x: number; z: number },
  spots: ColliderSpot[],
  bounds: WorldBounds,
  options?: { steps?: number; speed?: number; stepSeconds?: number },
): { x: number; z: number; moved: number; remaining: number } {
  const steps = options?.steps ?? 240;
  const speed = options?.speed ?? 4.2;
  const stepSeconds = options?.stepSeconds ?? 1 / 60;
  const pos = { x: from.x, z: from.z };
  let moved = 0;
  for (let i = 0; i < steps; i++) {
    const dx = to.x - pos.x;
    const dz = to.z - pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.25) break;
    const step = Math.min(speed * stepSeconds, dist);
    const prevX = pos.x;
    const prevZ = pos.z;
    moveWithSlide(pos, (dx / dist) * step, (dz / dist) * step, spots, bounds);
    moved += Math.hypot(pos.x - prevX, pos.z - prevZ);
  }
  return { x: pos.x, z: pos.z, moved, remaining: Math.hypot(to.x - pos.x, to.z - pos.z) };
}

/** Colliders fijos del lobby (sin prototipos); debe coincidir con world.ts + ambient. */
export function lobbyStaticColliders(): ColliderSpot[] {
  const ids = [
    "inventor",
    "bench",
    "crates",
    "plant",
    "couch",
    "couchNorth",
    "couchSouth",
    "loungeTable",
    "tv",
    "croquis",
    "fridge",
    "counter",
    "kitchenTable",
    "bin",
    "dog",
    "cat",
    "desk",
    "shelves",
    "pinball",
    "radio",
    "plantPinball",
    "plantRest",
  ] as const;
  return ids.map((id) => ({ id, x: LAYOUT[id].x, z: LAYOUT[id].z, collider: LAYOUT[id].collider }));
}

/**
 * Límites del jugador. Antes `maxZ` restaba la distancia de la cámara
 * (3,8 en escritorio, 6,4 en móvil) y dejaba una pared invisible a mitad
 * de sala, justo antes de la nevera. El argumento se ignora: escritorio
 * y móvil comparten la habitación; la cámara se resuelve aparte.
 */
export function playerLobbyBounds(): WorldBounds {
  const pad = PLAYER_RADIUS + 0.08;
  return {
    minX: ROOM_INNER.minX + pad,
    maxX: ROOM_INNER.maxX - pad,
    minZ: ROOM_INNER.minZ + pad,
    maxZ: ROOM_INNER.maxZ - pad,
  };
}

export function lobbyBounds(_desktop = true): WorldBounds {
  return playerLobbyBounds();
}

export function cameraVolume(): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
} {
  const margin = CAMERA_WALL_MARGIN;
  return {
    minX: ROOM_INNER.minX + margin,
    maxX: ROOM_INNER.maxX - margin,
    minZ: ROOM_INNER.minZ + margin,
    maxZ: ROOM_INNER.maxZ - margin,
    minY: 0.9,
    maxY: CAMERA_CEILING_Y,
  };
}

/** Cajas de muebles altos. La cámara se acerca si el brazo las atraviesa. */
export function lobbyCameraBlockers(): CameraBlocker[] {
  const arcade = LAYOUT.arcade;
  const inventor = LAYOUT.inventor;
  const fridge = LAYOUT.fridge;
  const shelves = LAYOUT.shelves;
  const desk = LAYOUT.desk;
  const pinball = LAYOUT.pinball;
  return [
    { minX: arcade.x - 0.85, maxX: arcade.x + 0.95, minY: 0, maxY: 2.05, minZ: arcade.z - 0.8, maxZ: arcade.z + 0.85 },
    { minX: inventor.x - 0.5, maxX: inventor.x + 0.55, minY: 0, maxY: 2.1, minZ: inventor.z - 0.45, maxZ: inventor.z + 0.45 },
    {
      minX: FRIDGE_HINGE.x - 0.04,
      maxX: fridge.x + FRIDGE_DEPTH / 2,
      minY: 0,
      maxY: 1.48,
      minZ: fridge.z - FRIDGE_WIDTH / 2,
      maxZ: FRIDGE_HINGE.z,
    },
    {
      minX: LAYOUT.counter.x - 0.34,
      maxX: ROOM_INNER.maxX,
      minY: 0,
      maxY: 1.82,
      minZ: LAYOUT.counter.z - 0.96,
      maxZ: LAYOUT.counter.z + 0.96,
    },
    {
      minX: LAYOUT.kitchenTable.x - 0.46,
      maxX: LAYOUT.kitchenTable.x + 0.42,
      minY: 0,
      maxY: 0.72,
      minZ: LAYOUT.kitchenTable.z - 0.36,
      maxZ: LAYOUT.kitchenTable.z + 0.36,
    },
    { minX: shelves.x - 0.22, maxX: shelves.x + 0.22, minY: 0, maxY: 1.5, minZ: shelves.z - 0.68, maxZ: shelves.z + 0.68 },
    { minX: desk.x - 0.75, maxX: desk.x + 0.75, minY: 0, maxY: 1.05, minZ: desk.z - 0.45, maxZ: desk.z + 0.45 },
    ...loungeCameraBlockers(),
    { minX: pinball.x - 0.55, maxX: pinball.x + 0.55, minY: 0, maxY: 0.85, minZ: pinball.z - 0.42, maxZ: pinball.z + 0.42 },
  ];
}

function piece(id: (typeof LOUNGE_FURNITURE)[number]["id"]): { x: number; z: number; collider: number } {
  const found = LOUNGE_FURNITURE.find((item) => item.id === id);
  if (!found) throw new Error(`Mueble de rincón desconocido: ${id}`);
  return { x: found.x, z: found.z, collider: found.collider };
}

/**
 * 1 a la altura de paseo. Al mirar hacia arriba el brazo se acorta
 * con suavidad para deslizarse bajo el techo, sin clavarse en las vigas.
 */
export function ceilingArmScale(desiredY: number, ceilingY = CAMERA_CEILING_Y): number {
  const t = clamp((desiredY - (ceilingY - 0.22)) / 0.48, 0, 1);
  const s = t * t * (3 - 2 * t);
  return 1 - s * 0.6;
}

export function resolveCameraArm(options: {
  playerX: number;
  playerZ: number;
  yaw: number;
  pitch: number;
  distance: number;
  blockers?: CameraBlocker[];
  baseY?: number;
}): { x: number; y: number; z: number; distance: number } {
  const volume = cameraVolume();
  const desiredY = (options.baseY ?? CAMERA_BASE_Y) + options.pitch;
  const y = clamp(desiredY, volume.minY, volume.maxY);
  const sx = -Math.sin(options.yaw);
  const sz = Math.cos(options.yaw);
  const requested = Math.max(0, options.distance);
  const scale = ceilingArmScale(desiredY);
  let distance = requested * scale;
  if (scale < 1) distance = Math.max(distance, Math.min(0.85, requested));
  distance = Math.min(distance, axisLimit(options.playerX, sx, volume.minX, volume.maxX));
  distance = Math.min(distance, axisLimit(options.playerZ, sz, volume.minZ, volume.maxZ));

  const blockers = options.blockers ?? lobbyCameraBlockers();
  const pad = 0.12;
  for (const box of blockers) {
    const hit = rayAabbEntry(options.playerX, y, options.playerZ, sx, 0, sz, {
      minX: box.minX - pad,
      maxX: box.maxX + pad,
      minY: box.minY - pad,
      maxY: box.maxY + pad,
      minZ: box.minZ - pad,
      maxZ: box.maxZ + pad,
    });
    if (hit == null || hit >= distance) continue;
    distance = Math.max(0, hit - 0.05);
  }

  return {
    x: options.playerX + sx * distance,
    y,
    z: options.playerZ + sz * distance,
    distance,
  };
}

export function arcadeMachineCollider(): ColliderSpot {
  return {
    id: "arcade",
    x: LAYOUT.arcade.x,
    z: LAYOUT.arcade.z,
    collider: LAYOUT.arcade.collider,
  };
}

/** @deprecated Usar arcadeMachineCollider */
export function arcadeCollider(_index = 0): ColliderSpot {
  return arcadeMachineCollider();
}

function axisLimit(origin: number, dir: number, min: number, max: number): number {
  if (origin < min) return dir > 0 ? Math.max(0, (min - origin) / dir) : 0;
  if (origin > max) return dir < 0 ? Math.max(0, (max - origin) / dir) : 0;
  if (Math.abs(dir) < 1e-6) return Number.POSITIVE_INFINITY;
  if (dir > 0) return (max - origin) / dir;
  return (min - origin) / dir;
}

function rayAabbEntry(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  box: CameraBlocker,
): number | null {
  let tmin = 0;
  let tmax = Number.POSITIVE_INFINITY;
  const axes: Array<[number, number, number, number]> = [
    [ox, dx, box.minX, box.maxX],
    [oy, dy, box.minY, box.maxY],
    [oz, dz, box.minZ, box.maxZ],
  ];
  for (const [origin, dir, min, max] of axes) {
    if (Math.abs(dir) < 1e-8) {
      if (origin < min || origin > max) return null;
      continue;
    }
    let t1 = (min - origin) / dir;
    let t2 = (max - origin) / dir;
    if (t1 > t2) {
      const swap = t1;
      t1 = t2;
      t2 = swap;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  return tmin;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
