import { describe, expect, it } from "vitest";
import {
  LOUNGE_FURNITURE,
  LOUNGE_NPCS,
  LOUNGE_TABLE,
  NORTH_COUCH,
  SLACKER_BUBBLE_RADIUS,
  SLACKER_COUCH,
  SOUTH_COUCH,
  TV_SET,
  forwardFromYaw,
  loungeCameraBlockers,
  orientedAabb,
} from "./lounge-layout";
import {
  LAYOUT,
  PLAYER_RADIUS,
  RADIO_APPROACH,
  RADIO_USE_RADIUS,
  arcadeMachineCollider,
  lobbyStaticColliders,
  playerLobbyBounds,
  resolvePosition,
  walkToward,
} from "./navigation";
import { WORKSHOP_SEAT } from "./workshop-cinematic";

function dot(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return a.x * b.x + a.z * b.z;
}

function normalize(v: { x: number; z: number }): { x: number; z: number } {
  const length = Math.hypot(v.x, v.z) || 1;
  return { x: v.x / length, z: v.z / length };
}

describe("rincón de sofás", () => {
  const colliders = [...lobbyStaticColliders(), arcadeMachineCollider()];
  const bounds = playerLobbyBounds();

  it("pone la tele delante del sofá y de cara a quien se sienta", () => {
    const look = forwardFromYaw(SLACKER_COUCH.yaw);
    const toTv = normalize({ x: TV_SET.x - SLACKER_COUCH.x, z: TV_SET.z - SLACKER_COUCH.z });
    const screen = forwardFromYaw(TV_SET.yaw);
    expect(dot(look, toTv)).toBeGreaterThan(0.95);
    expect(dot(screen, { x: -toTv.x, z: -toTv.z })).toBeGreaterThan(0.95);
    expect(dot(look, screen)).toBeLessThan(-0.95);
    expect(Math.hypot(toTv.x, toTv.z)).toBe(1);
    expect(Math.hypot(TV_SET.x - SLACKER_COUCH.x, TV_SET.z - SLACKER_COUCH.z)).toBeGreaterThan(1.6);
  });

  it("orienta el resto de sofás hacia la mesa", () => {
    for (const couch of [NORTH_COUCH, SOUTH_COUCH]) {
      const look = forwardFromYaw(couch.yaw);
      const toTable = normalize({ x: LOUNGE_TABLE.x - couch.x, z: LOUNGE_TABLE.z - couch.z });
      expect(dot(look, toTable), couch.id).toBeGreaterThan(0.9);
    }
    const croquis = LOUNGE_NPCS.find((npc) => npc.id === "croquis");
    expect(croquis).toBeTruthy();
    const toTable = normalize({ x: LOUNGE_TABLE.x - croquis!.x, z: LOUNGE_TABLE.z - croquis!.z });
    expect(dot(forwardFromYaw(croquis!.yaw), toTable)).toBeGreaterThan(0.95);
  });

  it("alinea la caja de la cámara con el sofá sin girar", () => {
    const box = orientedAabb(0, 0, 0, 0.85, 0.48, 1.05);
    expect(box.minX).toBeCloseTo(-0.85);
    expect(box.maxX).toBeCloseTo(0.85);
    expect(box.minZ).toBeCloseTo(-0.48);
    expect(box.maxZ).toBeCloseTo(0.48);
    const turned = orientedAabb(SLACKER_COUCH.x, SLACKER_COUCH.z, Math.PI / 2, 0.85, 0.48, 1.05);
    expect(turned.maxX - turned.minX).toBeCloseTo(0.96);
    expect(turned.maxZ - turned.minZ).toBeCloseTo(1.7);
    expect(loungeCameraBlockers().length).toBeGreaterThanOrEqual(4);
  });

  it("no superpone el mobiliario del rincón con el resto del lobby", () => {
    const loungeIds = new Set(LOUNGE_FURNITURE.map((item) => item.id));
    const spots = colliders.filter((spot) => spot.collider > 0);
    for (const piece of spots.filter((spot) => loungeIds.has(spot.id))) {
      for (const other of spots) {
        if (other.id === piece.id) continue;
        const distance = Math.hypot(piece.x - other.x, piece.z - other.z);
        expect(distance, `${piece.id} y ${other.id}`).toBeGreaterThan(piece.collider + other.collider - 0.001);
      }
    }
  });

  it("deja un sitio libre para hablar con cada persona, más cerca de ella que del resto", () => {
    const talk = [
      ...LOUNGE_NPCS.map((npc) => ({ id: npc.id, x: npc.x, z: npc.z, radius: npc.radius })),
      { id: "inventor", x: LAYOUT.inventor.x, z: LAYOUT.inventor.z, radius: 2.25 },
      { id: "chalkboard", x: LAYOUT.chalkboard.x, z: LAYOUT.chalkboard.z, radius: 2.2 },
      { id: "arcade", x: LAYOUT.arcade.x, z: LAYOUT.arcade.z, radius: 2.55 },
      { id: "radio", x: LAYOUT.radio.x, z: LAYOUT.radio.z, radius: RADIO_USE_RADIUS },
    ];
    for (const npc of LOUNGE_NPCS) {
      const position = { x: npc.approach.x, z: npc.approach.z };
      resolvePosition(position, colliders, bounds);
      expect(position.x, npc.id).toBeCloseTo(npc.approach.x, 2);
      expect(position.z, npc.id).toBeCloseTo(npc.approach.z, 2);
      for (const spot of colliders) {
        const distance = Math.hypot(position.x - spot.x, position.z - spot.z);
        expect(distance, `${npc.id} contra ${spot.id}`).toBeGreaterThanOrEqual(spot.collider + PLAYER_RADIUS - 1e-6);
      }
      const own = Math.hypot(position.x - npc.x, position.z - npc.z);
      expect(own, npc.id).toBeLessThanOrEqual(npc.radius);
      if (npc.id === "remolon") expect(own).toBeLessThanOrEqual(SLACKER_BUBBLE_RADIUS);
      for (const other of talk) {
        if (other.id === npc.id) continue;
        const distance = Math.hypot(position.x - other.x, position.z - other.z);
        expect(distance, `${npc.id} no debe caer en ${other.id}`).toBeGreaterThan(other.radius);
      }
    }
  });

  it("deja la radio a mano y su zona no pisa la de nadie", () => {
    const talkers = [
      ...LOUNGE_NPCS.map((npc) => ({ id: npc.id, x: npc.x, z: npc.z, radius: npc.radius })),
      { id: "inventor", x: LAYOUT.inventor.x, z: LAYOUT.inventor.z, radius: 2.25 },
      { id: "chalkboard", x: LAYOUT.chalkboard.x, z: LAYOUT.chalkboard.z, radius: 2.2 },
      { id: "arcade", x: LAYOUT.arcade.x, z: LAYOUT.arcade.z, radius: 2.55 },
    ];
    for (const other of talkers) {
      const distance = Math.hypot(LAYOUT.radio.x - other.x, LAYOUT.radio.z - other.z);
      expect(distance, `zona de la radio y ${other.id}`).toBeGreaterThan(RADIO_USE_RADIUS + other.radius);
    }
    const deskDistance = Math.hypot(LAYOUT.radio.x - LAYOUT.desk.x, LAYOUT.radio.z - LAYOUT.desk.z);
    expect(deskDistance, "zona de la radio y el escritorio").toBeGreaterThan(RADIO_USE_RADIUS + LAYOUT.desk.collider);
    const seatDistance = Math.hypot(LAYOUT.radio.x - WORKSHOP_SEAT.x, LAYOUT.radio.z - WORKSHOP_SEAT.z);
    expect(seatDistance, "zona de la radio y la silla del escritorio").toBeGreaterThan(RADIO_USE_RADIUS + 0.6);
    const position = { x: RADIO_APPROACH.x, z: RADIO_APPROACH.z };
    resolvePosition(position, colliders, bounds);
    expect(position.x).toBeCloseTo(RADIO_APPROACH.x, 2);
    expect(position.z).toBeCloseTo(RADIO_APPROACH.z, 2);
    const approachDesk = Math.hypot(position.x - LAYOUT.desk.x, position.z - LAYOUT.desk.z);
    expect(approachDesk, "el uso de la radio no cae en el escritorio").toBeGreaterThan(LAYOUT.desk.collider + PLAYER_RADIUS);
    const own = Math.hypot(position.x - LAYOUT.radio.x, position.z - LAYOUT.radio.z);
    expect(own).toBeLessThanOrEqual(RADIO_USE_RADIUS);
    expect(own).toBeGreaterThan(LAYOUT.radio.collider + PLAYER_RADIUS);
    for (const other of talkers) {
      const distance = Math.hypot(position.x - other.x, position.z - other.z);
      expect(distance, `radio no debe caer en ${other.id}`).toBeGreaterThan(other.radius);
    }
    const walked = walkToward({ x: 0, z: 1.7 }, RADIO_APPROACH, colliders, bounds, { steps: 720 });
    expect(walked.remaining).toBeLessThan(0.6);
  });

  it("sigue dejando paso hasta la pizarra y hasta el sofá", () => {
    const start = { x: 0, z: 1.7 };
    const board = walkToward(start, { x: -4.6, z: -5.1 }, colliders, bounds, { steps: 720 });
    expect(board.remaining).toBeLessThan(1);
    const remolon = LOUNGE_NPCS[0]!;
    const seat = walkToward(start, remolon.approach, colliders, bounds, { steps: 720 });
    expect(seat.remaining).toBeLessThan(0.6);
  });
});
