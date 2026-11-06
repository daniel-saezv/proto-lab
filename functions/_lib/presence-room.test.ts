import { describe, expect, it } from "vitest";
import {
  PRESENCE_LIMITS,
  createMemoryPresence,
  isSessionId,
  nextAlarmAt,
  parseNameField,
  presenceRoomName,
  type MemoryLink,
} from "./presence-room";

const ANA = "11111111-1111-4111-8111-111111111111";
const BO = "22222222-2222-4222-8222-222222222222";
const CIO = "33333333-3333-4333-8333-333333333333";

function pipe() {
  const inbox: unknown[] = [];
  const closed: { code: number; reason: string }[] = [];
  const link: MemoryLink = {
    send(data) {
      inbox.push(JSON.parse(data) as unknown);
    },
    close(code, reason) {
      closed.push({ code, reason });
    },
  };
  return { link, inbox, closed };
}

function hello(id: string, x = 0, z = 1.7, yaw = 0, name?: string) {
  const payload: Record<string, unknown> = { type: "hello", id, x, z, yaw };
  if (name !== undefined) payload.name = name;
  return JSON.stringify(payload);
}

function rename(name?: string) {
  if (name === undefined) return JSON.stringify({ type: "rename" });
  return JSON.stringify({ type: "rename", name });
}

function move(x: number, z: number, yaw = 0) {
  return JSON.stringify({ type: "move", x, z, yaw });
}

describe("sala de presencia", () => {
  it("al entrar se ve a quien ya está y el otro recibe el alta", () => {
    let now = 1_000;
    const room = createMemoryPresence(() => now);
    const ana = pipe();
    const bo = pipe();
    const a = room.connect(ana.link);
    const b = room.connect(bo.link);
    a.message(hello(ANA, 1, 2, 0.4));
    b.message(hello(BO, 3, 4, -0.2));

    expect(bo.inbox[0]).toEqual({
      type: "welcome",
      self: BO,
      peers: [{ id: ANA, x: 1, z: 2, yaw: 0.4 }],
    });
    expect(ana.inbox.at(-1)).toEqual({
      type: "join",
      peer: { id: BO, x: 3, z: 4, yaw: -0.2 },
    });
    expect(JSON.stringify(ana.inbox) + JSON.stringify(bo.inbox)).not.toMatch(/@|email|correo|jwt/i);
  });

  it("un movimiento llega a los demás y no vuelve al origen", () => {
    let now = 5_000;
    const room = createMemoryPresence(() => now);
    const ana = pipe();
    const bo = pipe();
    const a = room.connect(ana.link);
    const b = room.connect(bo.link);
    a.message(hello(ANA));
    b.message(hello(BO));
    ana.inbox.length = 0;
    bo.inbox.length = 0;

    now = 5_200;
    a.message(move(2.5, -1, 1.2));

    expect(bo.inbox).toEqual([{ type: "move", peer: { id: ANA, x: 2.5, z: -1, yaw: 1.2 } }]);
    expect(ana.inbox).toEqual([]);
  });

  it("recorta la pose y tira los movimientos más rápidos que el cupo", () => {
    let now = 10_000;
    const room = createMemoryPresence(() => now);
    const ana = pipe();
    const bo = pipe();
    const a = room.connect(ana.link);
    room.connect(bo.link).message(hello(BO));
    a.message(hello(ANA));
    bo.inbox.length = 0;

    now = 10_200;
    a.message(move(99, -99, 0));
    now = 10_300;
    a.message(move(1, 1, 0));
    now = 10_400;
    a.message(move(4, 5, 0.5));

    expect(bo.inbox).toEqual([
      { type: "move", peer: { id: ANA, x: PRESENCE_LIMITS.coordLimit, z: -PRESENCE_LIMITS.coordLimit, yaw: 0 } },
      { type: "move", peer: { id: ANA, x: 4, z: 5, yaw: 0.5 } },
    ]);
  });

  it("hello y welcome llevan alias; move no", () => {
    let now = 8_000;
    const room = createMemoryPresence(() => now);
    const ana = pipe();
    const bo = pipe();
    const a = room.connect(ana.link);
    const b = room.connect(bo.link);
    a.message(hello(ANA, 1, 2, 0.4, "Ana"));
    b.message(hello(BO, 3, 4, -0.2, "  Bo "));
    expect(bo.inbox[0]).toEqual({
      type: "welcome",
      self: BO,
      peers: [{ id: ANA, x: 1, z: 2, yaw: 0.4, name: "Ana" }],
    });
    expect(ana.inbox.at(-1)).toEqual({
      type: "join",
      peer: { id: BO, x: 3, z: 4, yaw: -0.2, name: "Bo" },
    });
    now = 8_200;
    bo.inbox.length = 0;
    a.message(move(2, 2, 0));
    expect(bo.inbox).toEqual([{ type: "move", peer: { id: ANA, x: 2, z: 2, yaw: 0 } }]);
  });

  it("rename actualiza el nombre con el mismo tope que here", () => {
    let now = 20_000;
    const room = createMemoryPresence(() => now);
    const ana = pipe();
    const bo = pipe();
    const a = room.connect(ana.link);
    const b = room.connect(bo.link);
    a.message(hello(ANA, 0, 0, 0, "Viejo"));
    b.message(hello(BO));
    bo.inbox.length = 0;
    now = 20_100;
    a.message(rename("Nuevo"));
    expect(bo.inbox).toEqual([{ type: "rename", id: ANA, name: "Nuevo" }]);
    bo.inbox.length = 0;
    now = 20_500;
    a.message(rename("Otro"));
    expect(bo.inbox).toEqual([]);
    now = 20_100 + PRESENCE_LIMITS.hereMinMs;
    a.message(rename("Otro"));
    expect(bo.inbox).toEqual([{ type: "rename", id: ANA, name: "Otro" }]);
    bo.inbox.length = 0;
    now += PRESENCE_LIMITS.hereMinMs;
    a.message(rename("ana@malo"));
    expect(bo.inbox).toEqual([{ type: "rename", id: ANA, name: "" }]);
  });

  it("recorta el nombre y rechaza correo en parseNameField", () => {
    expect(parseNameField("  x  ")).toEqual({ ok: true, value: "x" });
    const long = "a".repeat(40);
    expect((parseNameField(long) as { ok: true; value: string }).value.length).toBe(PRESENCE_LIMITS.nameMaxChars);
    expect(parseNameField("no@correo")).toEqual({ ok: false });
    expect(parseNameField("")).toEqual({ ok: true, value: "" });
    expect(parseNameField(undefined)).toEqual({ ok: true, value: "" });
  });

  it("rechaza un id que no es una sesión efímera y no publica el texto", () => {
    const room = createMemoryPresence(() => 0);
    const ana = pipe();
    const bo = pipe();
    const a = room.connect(ana.link);
    room.connect(bo.link).message(hello(BO));
    a.message(JSON.stringify({ type: "hello", id: "ana@example.com", x: 0, z: 0, yaw: 0 }));
    expect(ana.closed[0]?.code).toBe(1008);
    expect(bo.inbox.some((message) => JSON.stringify(message).includes("example.com"))).toBe(false);
    expect(isSessionId("ana@example.com")).toBe(false);
  });

  it("al salir desaparece para el resto", () => {
    const room = createMemoryPresence(() => 0);
    const ana = pipe();
    const bo = pipe();
    const a = room.connect(ana.link);
    room.connect(bo.link).message(hello(BO));
    a.message(hello(ANA));
    bo.inbox.length = 0;
    a.close();
    expect(bo.inbox).toEqual([{ type: "leave", id: ANA }]);
    expect(room.count()).toBe(1);
  });

  it("la sala se llena y el barrido suelta a quien no saluda o se queda mudo", () => {
    let now = 0;
    const room = createMemoryPresence(() => now);
    const kept = pipe();
    const quiet = pipe();
    const mute = pipe();
    const keptSession = room.connect(kept.link);
    keptSession.message(hello(ANA));
    room.connect(quiet.link);
    const muteSession = room.connect(mute.link);
    muteSession.message(hello(BO, 1, 1, 0));
    kept.inbox.length = 0;

    for (let i = 0; i < PRESENCE_LIMITS.maxSockets - 3; i += 1) room.connect(pipe().link);
    const overflow = pipe();
    room.connect(overflow.link);
    expect(overflow.closed[0]).toEqual({ code: 1013, reason: "lleno" });
    expect(room.count()).toBe(PRESENCE_LIMITS.maxSockets);

    now = PRESENCE_LIMITS.helloGraceMs + 1;
    room.sweep();
    expect(quiet.closed.length).toBe(1);
    expect(kept.inbox).toEqual([]);

    keptSession.message(JSON.stringify({ type: "here" }));
    now = PRESENCE_LIMITS.staleMs + 1;
    room.sweep();
    expect(mute.closed.length).toBe(1);
    expect(kept.closed).toEqual([]);
    expect(kept.inbox).toEqual([{ type: "leave", id: BO }]);
  });

  it("un here demasiado seguido no refresca la caducidad", () => {
    let now = 0;
    const room = createMemoryPresence(() => now);
    const ana = pipe();
    const bo = pipe();
    const a = room.connect(ana.link);
    room.connect(bo.link).message(hello(BO));
    a.message(hello(ANA));
    now = 1_000;
    a.message(JSON.stringify({ type: "here" }));
    now = 1_000 + PRESENCE_LIMITS.hereMinMs - 1;
    a.message(JSON.stringify({ type: "here" }));
    now = 1_000 + PRESENCE_LIMITS.staleMs + 1;
    room.sweep();
    expect(ana.closed.length).toBe(1);
  });

  it("tres sesiones comparten la misma pose y un JSON roto no se reenvía", () => {
    const room = createMemoryPresence(() => 1_000);
    const ana = pipe();
    const bo = pipe();
    const cio = pipe();
    const a = room.connect(ana.link);
    a.message(hello(ANA, -2, 3, 0.2));
    room.connect(bo.link).message(hello(BO, 0, 0, 0));
    const cioSession = room.connect(cio.link);
    cioSession.message(hello(CIO, 8, 8, 1));
    const welcome = cio.inbox[0] as { type: string; peers: { id: string }[] };
    expect(welcome.type).toBe("welcome");
    expect(welcome.peers.map((peer) => peer.id).sort()).toEqual([ANA, BO].sort());
    bo.inbox.length = 0;
    a.message("{");
    expect(ana.closed[0]?.code).toBe(1003);
    expect(bo.inbox).toEqual([{ type: "leave", id: ANA }]);
    expect(room.count()).toBe(2);
  });

  it("nombra la sala por el entorno y no programa alarma si está vacía", () => {
    expect(presenceRoomName(undefined)).toBe("lab:production");
    expect(presenceRoomName("main")).toBe("lab:production");
    expect(presenceRoomName("cursor/presencia-en-vivo-e988")).toBe("lab:preview:cursorpresencia-en-vivo-e988");
    expect(presenceRoomName("../prod")).toBe("lab:preview:prod");
    expect(presenceRoomName("@@@")).toBe("lab:preview:rama");
    expect(nextAlarmAt(0, 50)).toBeNull();
    expect(nextAlarmAt(2, 50)).toBe(50 + PRESENCE_LIMITS.alarmEveryMs);
  });
});
