export const PLAYER_RADIUS = 0.38;

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

export function resolvePosition(
  position: { x: number; z: number },
  spots: ColliderSpot[],
  bounds: WorldBounds,
): void {
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
  position.x = clamp(position.x, bounds.minX, bounds.maxX);
  position.z = clamp(position.z, bounds.minZ, bounds.maxZ);
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
    pos.x += (dx / dist) * step;
    pos.z += (dz / dist) * step;
    resolvePosition(pos, spots, bounds);
    moved += Math.hypot(pos.x - prevX, pos.z - prevZ);
  }
  return { x: pos.x, z: pos.z, moved, remaining: Math.hypot(to.x - pos.x, to.z - pos.z) };
}

/** Colliders fijos del lobby (sin prototipos); debe coincidir con world.ts + ambient. */
export function lobbyStaticColliders(): ColliderSpot[] {
  return [
    { id: "inventor", x: -1.5, z: -3.4, collider: 0.42 },
    { id: "bench", x: 0.15, z: -3.15, collider: 0.48 },
    { id: "crates", x: 5.85, z: 1.45, collider: 0.42 },
    { id: "plant", x: -6, z: 1.3, collider: 0.22 },
    { id: "couch", x: -7.15, z: -4.65, collider: 0.48 },
    { id: "fridge", x: 7.35, z: 5.2, collider: 0.32 },
    { id: "dog", x: 6.15, z: 5.85, collider: 0.24 },
    { id: "desk", x: 6.55, z: -5.35, collider: 0.38 },
    { id: "shelves", x: 7.05, z: -4.15, collider: 0.28 },
    { id: "pinball", x: -4.85, z: 5.55, collider: 0.4 },
  ];
}

export function lobbyBounds(desktop = true): WorldBounds {
  const maxZ = 7.4 - (desktop ? 3.8 : 6.4);
  return { minX: -7.4, maxX: 7.4, minZ: -6.3, maxZ };
}

export function arcadeCollider(index: number): ColliderSpot {
  const column = index % 2 === 0 ? 1 : -1;
  return {
    id: `arcade-${index}`,
    x: 3.4 + index * 1.6 * column,
    z: -1.5 - Math.floor(index / 2) * 1.8,
    collider: 0.65,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
