import { describe, expect, it } from "vitest";
import {
  applyPresenceMessage,
  planPresenceRename,
  planPresenceSend,
  readPeer,
  type PresencePeer,
} from "./presence-state";

const ANA = "11111111-1111-4111-8111-111111111111";
const BO = "22222222-2222-4222-8222-222222222222";

describe("estado de presencia en el cliente", () => {
  it("el primer sample sale y el resto espera a que haya paso o plazo", () => {
    const first = planPresenceSend(null, { x: 0, z: 1.7, yaw: 0 }, 1_000);
    expect(first.kind).toBe("move");
    const still = planPresenceSend(first.last, { x: 0.01, z: 1.7, yaw: 0 }, 1_300);
    expect(still.kind).toBeNull();
    const stepped = planPresenceSend(still.last, { x: 0.2, z: 1.7, yaw: 0 }, 1_300);
    expect(stepped.kind).toBe("move");
    const early = planPresenceSend(stepped.last, { x: 1, z: 1, yaw: 1 }, 1_400);
    expect(early.kind).toBeNull();
    const idle = planPresenceSend(stepped.last, { x: 0.2, z: 1.7, yaw: 0 }, 1_300 + 20_000);
    expect(idle.kind).toBe("here");
  });

  it("welcome trae nombre; move conserva el nombre", () => {
    let peers = new Map<string, PresencePeer>();
    peers = applyPresenceMessage(peers, ANA, {
      type: "welcome",
      self: ANA,
      peers: [{ id: BO, x: 1, z: 2, yaw: 0.5, email: "bo@example.com", name: "Bo" }],
    });
    expect([...peers.values()]).toEqual([{ id: BO, x: 1, z: 2, yaw: 0.5, name: "Bo" }]);
    const same = applyPresenceMessage(peers, ANA, { type: "move", peer: { id: BO, x: 1, z: 2, yaw: 0.5 } });
    expect(same).toBe(peers);
    peers = applyPresenceMessage(peers, ANA, { type: "move", peer: { id: BO, x: 3, z: 4, yaw: 1 } });
    expect(peers.get(BO)).toEqual({ id: BO, x: 3, z: 4, yaw: 1, name: "Bo" });
    peers = applyPresenceMessage(peers, ANA, { type: "move", peer: { id: ANA, x: 9, z: 9, yaw: 0 } });
    expect(peers.has(ANA)).toBe(false);
    peers = applyPresenceMessage(peers, ANA, { type: "leave", id: BO });
    expect(peers.size).toBe(0);
    expect(readPeer({ id: "no-es-uuid", x: 0, z: 0, yaw: 0 })).toBeNull();
  });

  it("rename cambia o quita el nombre", () => {
    let peers = new Map<string, PresencePeer>([[BO, { id: BO, x: 0, z: 0, yaw: 0, name: "Bo" }]]);
    peers = applyPresenceMessage(peers, ANA, { type: "rename", id: BO, name: "Be" });
    expect(peers.get(BO)?.name).toBe("Be");
    peers = applyPresenceMessage(peers, ANA, { type: "rename", id: BO, name: "" });
    expect(peers.get(BO)).toEqual({ id: BO, x: 0, z: 0, yaw: 0 });
  });

  it("planPresenceRename respeta el intervalo", () => {
    const clock = { lastSent: 0 };
    const early = planPresenceRename(undefined, "Ana", clock, 1_000);
    expect(early.send).toBe(true);
    const blocked = planPresenceRename("Ana", "Bo", early.clock, 2_000);
    expect(blocked.send).toBe(false);
  });
});
