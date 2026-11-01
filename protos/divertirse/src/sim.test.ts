import { describe, expect, it } from "vitest";
import {
  FRIEND_IDS,
  ROSTER,
  TUNE,
  canSend,
  createState,
  reachedDoor,
  restart,
  sendFriend,
  start,
  step,
  yawnPhase,
  type FriendId,
  type State,
} from "./sim";

function play(seconds: number, policy: (state: State) => State = (state) => state): State {
  let state = start(createState());
  const dt = 1 / 30;
  const steps = Math.round(seconds / dt);
  for (let index = 0; index < steps && state.phase === "play"; index += 1) {
    state = policy(state);
    state = step(state, dt);
  }
  return state;
}

function readyBackup(state: State): FriendId | undefined {
  const ready = state.friends
    .filter((friend) => canSend(friend))
    .sort((a, b) => b.animo - a.animo);
  return ready[0]?.id;
}

function greedy(state: State): State {
  const holder = state.friends.find((friend) => friend.role === "hold");
  const chasing = state.friends.some((friend) => friend.role === "chase");
  if (holder && holder.animo < 0.28) {
    const next = readyBackup(state);
    if (next) return sendFriend(state, next, state.gamuX, state.gamuZ);
  }
  if (holder || chasing) return state;
  const next = readyBackup(state);
  if (!next) return state;
  return sendFriend(state, next, state.gamuX, state.gamuZ);
}

describe("fiesta de Gamu", () => {
  it("no avanza hasta que empieza la noche", () => {
    const state = step(createState(), 1);
    expect(state.phase).toBe("ready");
    expect(state.time).toBe(0);
    expect(sendFriend(state, "mira", state.gamuX, state.gamuZ)).toBe(state);
  });

  it("coloca a los amigos dentro de la pista y a Gamu fuera de la puerta", () => {
    for (const id of FRIEND_IDS) {
      const spec = ROSTER[id];
      const dist = Math.hypot(spec.homeX - TUNE.floorX, spec.homeZ - TUNE.floorZ);
      expect(dist).toBeLessThan(TUNE.floorRadius - 0.2);
    }
    expect(reachedDoor(TUNE.gamuStartX, TUNE.gamuStartZ)).toBe(false);
    expect(TUNE.floorZ).toBeGreaterThan(TUNE.gamuStartZ);
    const maxWalk = (TUNE.gamuBase + TUNE.gamuSleep) * TUNE.yawnSpeed;
    expect(TUNE.friendSpeed).toBeGreaterThan(maxWalk + 0.5);
  });

  it("si nadie lo sujeta, Gamu cruza la puerta", () => {
    const state = play(40);
    expect(state.phase).toBe("over");
    expect(state.event).toBe("left");
    expect(state.time).toBeGreaterThan(8);
    expect(state.time).toBeLessThan(22);
    expect(reachedDoor(state.gamuX, state.gamuZ)).toBe(true);
  });

  it("la jamba no es salida y un amigo con ánimo lo devuelve a la pista", () => {
    expect(reachedDoor(4, TUNE.doorZ - 0.2)).toBe(false);
    expect(reachedDoor(0, TUNE.doorZ - 0.05)).toBe(true);

    let blocked = start(createState());
    blocked = { ...blocked, gamuX: 3.2, gamuZ: TUNE.doorZ - 0.3 };
    blocked = step(blocked, 0.05);
    expect(blocked.phase).toBe("play");
    expect(blocked.gamuZ).toBeGreaterThan(TUNE.doorZ);

    let state = start(createState());
    const beforeSleep = state.sleep;
    const beforeZ = state.gamuZ;
    state = sendFriend(state, "mira", state.gamuX, state.gamuZ);
    expect(state.friends.find((friend) => friend.id === "mira")?.role).toBe("chase");
    for (let index = 0; index < 90 && state.friends.find((friend) => friend.id === "mira")?.role !== "hold"; index += 1) {
      state = step(state, 1 / 30);
    }
    expect(state.friends.find((friend) => friend.id === "mira")?.role).toBe("hold");
    expect(state.event).toBe("grab");
    expect(state.combo).toBe(1);
    const heldZ = state.gamuZ;
    for (let index = 0; index < 60; index += 1) state = step(state, 1 / 30);
    expect(state.gamuZ).toBeGreaterThan(beforeZ);
    expect(state.gamuZ).toBeGreaterThan(heldZ - 0.05);
    expect(state.sleep).toBeLessThan(beforeSleep);
    expect(state.phase).toBe("play");
  });

  it("un amigo sin ánimo no sale y un toque lejos de Gamu no cuenta", () => {
    const state = start(createState());
    const teo = sendFriend(state, "teo", state.gamuX, state.gamuZ);
    expect(teo.event).toBe("uncharged");
    expect(teo.friends.find((friend) => friend.id === "teo")?.role).toBe("home");
    expect(sendFriend(state, "mira", 4, 4)).toBe(state);
  });

  it("el relevo sube el combo y se pierde si tardas", () => {
    let state = start(createState());
    state = sendFriend(state, "mira", state.gamuX, state.gamuZ);
    state = sendFriend(state, "nia", state.gamuX, state.gamuZ);
    expect(state.friends.find((friend) => friend.id === "mira")?.role).toBe("return");
    expect(state.friends.find((friend) => friend.id === "nia")?.role).toBe("chase");

    let chained = start(createState());
    chained = sendFriend(chained, "mira", chained.gamuX, chained.gamuZ);
    for (let index = 0; index < 90 && !chained.friends.some((friend) => friend.role === "hold"); index += 1) {
      chained = step(chained, 1 / 30);
    }
    chained = sendFriend(chained, "nia", chained.gamuX, chained.gamuZ);
    for (let index = 0; index < 90 && chained.friends.find((friend) => friend.id === "nia")?.role !== "hold"; index += 1) {
      chained = step(chained, 1 / 30);
    }
    expect(chained.friends.find((friend) => friend.id === "nia")?.role).toBe("hold");
    expect(chained.combo).toBeGreaterThanOrEqual(2);
    expect(chained.event).toBe("handoff");
    expect(chained.friends.filter((friend) => friend.role === "hold")).toHaveLength(1);

    let expired = chained;
    for (let index = 0; index < 20 && expired.friends.some((friend) => friend.role === "hold"); index += 1) {
      expired = {
        ...expired,
        friends: expired.friends.map((friend) => (friend.role === "hold" ? { ...friend, animo: 0.01 } : friend)),
      };
      expired = step(expired, 0.05);
    }
    expect(expired.friends.some((friend) => friend.role === "hold")).toBe(false);
    for (let index = 0; index < Math.ceil(TUNE.comboWindow / 0.05) + 2; index += 1) expired = step(expired, 0.05);
    expect(expired.combo).toBe(0);
  });

  it("el ánimo se carga en la pista y se gasta al sujetar", () => {
    let state = start(createState());
    const teo = state.friends.find((friend) => friend.id === "teo");
    expect(teo?.animo).toBeLessThan(TUNE.minAnimo);
    for (let index = 0; index < 80; index += 1) state = step(state, 0.05);
    const charged = state.friends.find((friend) => friend.id === "teo");
    expect(charged?.animo).toBeGreaterThan(teo?.animo ?? 1);

    state = sendFriend(start(createState()), "mira", 0, TUNE.gamuStartZ);
    for (let index = 0; index < 40; index += 1) state = step(state, 1 / 30);
    const mira = state.friends.find((friend) => friend.id === "mira");
    expect(mira?.role).toBe("hold");
    const animo = mira?.animo ?? 1;
    state = step(state, 0.05);
    expect(state.friends.find((friend) => friend.id === "mira")?.animo).toBeLessThan(animo);
  });

  it("el bostezo empuja más fuerte hacia la puerta", () => {
    expect(yawnPhase(0)).toBe("calm");
    expect(yawnPhase(TUNE.yawnWarn)).toBe("warning");
    expect(yawnPhase(TUNE.yawnAt)).toBe("yawn");
    expect(yawnPhase(TUNE.yawnPeriod)).toBe("calm");

    let calmState: State = { ...start(createState()), time: 1 };
    let yawnState: State = { ...start(createState()), time: TUNE.yawnAt };
    for (let index = 0; index < 20; index += 1) {
      calmState = step(calmState, 0.05);
      yawnState = step(yawnState, 0.05);
    }
    expect(yawnState.gamuZ).toBeLessThan(calmState.gamuZ);
  });

  it("una hora de fiesta alivia el sueño y otra noche reinicia", () => {
    let state = start(createState());
    state = sendFriend(state, "mira", state.gamuX, state.gamuZ);
    for (let index = 0; index < 60 && !state.friends.some((friend) => friend.role === "hold"); index += 1) {
      state = step(state, 1 / 30);
    }
    state = {
      ...state,
      time: TUNE.hourEvery - 0.02,
      friends: state.friends.map((friend) => (friend.id === "mira" ? { ...friend, role: "hold", animo: 1 } : friend)),
    };
    let sawHour = false;
    for (let index = 0; index < 8 && !sawHour; index += 1) {
      state = step(state, 0.05);
      sawHour = state.event === "hour";
    }
    expect(sawHour).toBe(true);
    expect(state.time).toBeGreaterThanOrEqual(TUNE.hourEvery);

    const again = restart();
    expect(again.phase).toBe("play");
    expect(again.sleep).toBe(TUNE.gamuStartSleep);
    expect(again.score).toBe(0);
    expect(again.gamuZ).toBe(TUNE.gamuStartZ);
  });

  it("relevando a tiempo se aguanta la noche y los valores se quedan en rango", () => {
    const state = play(45, greedy);
    expect(state.phase).toBe("play");
    expect(state.holds).toBeGreaterThanOrEqual(3);
    expect(state.score).toBeGreaterThan(200);
    expect(state.sleep).toBeGreaterThanOrEqual(0);
    expect(state.sleep).toBeLessThanOrEqual(100);
    for (const friend of state.friends) {
      expect(friend.animo).toBeGreaterThanOrEqual(0);
      expect(friend.animo).toBeLessThanOrEqual(1);
      expect(friend.x).toBeGreaterThanOrEqual(TUNE.roomMinX);
      expect(friend.x).toBeLessThanOrEqual(TUNE.roomMaxX);
    }
    expect(state.friends.filter((friend) => friend.role === "hold").length).toBeLessThanOrEqual(1);
  });
});
