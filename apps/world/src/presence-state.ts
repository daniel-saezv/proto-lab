/** Qué manda el cliente y cómo aplica lo que vuelve. Sin red y sin Three. */

export const PRESENCE_SEND = {
  moveMinMs: 200,
  hereMinMs: 20_000,
  moveEpsilon: 0.04,
  yawEpsilon: 0.05,
} as const;

const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PresencePose = { x: number; z: number; yaw: number };

export type PresencePeer = PresencePose & { id: string };

export type PoseClock = PresencePose & { at: number; hereAt: number };

export function planPresenceSend(last: PoseClock | null, pose: PresencePose, now: number): { kind: "move" | "here" | null; last: PoseClock } {
  if (!last) return { kind: "move", last: { ...pose, at: now, hereAt: 0 } };
  const moved = Math.hypot(pose.x - last.x, pose.z - last.z) >= PRESENCE_SEND.moveEpsilon;
  const turned = yawDelta(pose.yaw, last.yaw) >= PRESENCE_SEND.yawEpsilon;
  if ((moved || turned) && now - last.at >= PRESENCE_SEND.moveMinMs) {
    return { kind: "move", last: { ...pose, at: now, hereAt: last.hereAt } };
  }
  const beat = Math.max(last.at, last.hereAt);
  if (now - beat >= PRESENCE_SEND.hereMinMs) {
    return { kind: "here", last: { ...last, hereAt: now } };
  }
  return { kind: null, last };
}

/**
 * Aplica un mensaje del servidor. Ignora campos que no sean la pose.
 * Devuelve el mismo mapa si no hay cambio.
 */
export function applyPresenceMessage(peers: ReadonlyMap<string, PresencePeer>, selfId: string, message: unknown): Map<string, PresencePeer> {
  if (!message || typeof message !== "object") return peers as Map<string, PresencePeer>;
  const row = message as Record<string, unknown>;
  if (row.type === "welcome" && typeof row.self === "string" && SESSION_ID.test(row.self)) {
    const next = new Map<string, PresencePeer>();
    if (!Array.isArray(row.peers)) return next;
    for (const item of row.peers) {
      const peer = readPeer(item);
      if (peer && peer.id !== row.self) next.set(peer.id, peer);
    }
    return next;
  }
  if (row.type === "join" || row.type === "move") {
    const peer = readPeer(row.peer);
    if (!peer || peer.id === selfId) return peers as Map<string, PresencePeer>;
    const prev = peers.get(peer.id);
    if (prev && prev.x === peer.x && prev.z === peer.z && prev.yaw === peer.yaw) return peers as Map<string, PresencePeer>;
    const next = new Map(peers);
    next.set(peer.id, peer);
    return next;
  }
  if (row.type === "leave" && typeof row.id === "string") {
    if (!peers.has(row.id)) return peers as Map<string, PresencePeer>;
    const next = new Map(peers);
    next.delete(row.id);
    return next;
  }
  return peers as Map<string, PresencePeer>;
}

export function readPeer(value: unknown): PresencePeer | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || !SESSION_ID.test(row.id)) return null;
  if (typeof row.x !== "number" || typeof row.z !== "number" || typeof row.yaw !== "number") return null;
  if (!Number.isFinite(row.x) || !Number.isFinite(row.z) || !Number.isFinite(row.yaw)) return null;
  return { id: row.id, x: row.x, z: row.z, yaw: row.yaw };
}

function yawDelta(next: number, prev: number): number {
  let diff = next - prev;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return Math.abs(diff);
}
