import { describe, expect, it } from "vitest";
import { WORKSHOP_SEAT } from "./workshop-cinematic";
import {
  LAYOUT,
  PLAYER_RADIUS,
  lobbyStaticColliders,
  playerLobbyBounds,
  walkToward,
} from "./navigation";
import { PANTRY_COUNTER, PANTRY_STAND } from "./pantry-layout";
import {
  ANIMAL_NAP_MIN,
  ANIMAL_WAIT_MIN,
  ERRAND_ACTORS,
  ERRAND_PATHS,
  ERRAND_WAIT_MIN,
  createAnimal,
  createAnimalPose,
  createErrand,
  createErrandPose,
  snapErrandAtFridge,
  tickAnimal,
  tickErrand,
  type AnimalState,
  type ErrandState,
  type RoutineView,
} from "./pantry-routine";

const open: RoutineView = { visible: true, hold: false, playerX: 0, playerZ: 1.7 };
const zero = () => 0;

describe("viaje a la nevera", () => {
  it("espera entre un minuto y medio y tres, y solo mueve a uno", () => {
    const state = createErrand(zero);
    const pose = createErrandPose();
    expect(state.waitLeft).toBe(ERRAND_WAIT_MIN);
    expect(state.phase).toBe("wait");
    tickErrand(state, 89, open, pose, zero);
    expect(state.phase).toBe("wait");
    expect(pose.engaged).toBe(false);
    tickErrand(state, 1.1, open, pose, zero);
    expect(state.phase).toBe("rise");
    expect(pose.id).toBe("remolon");
    expect(pose.engaged).toBe(true);
    expect(ERRAND_ACTORS).toEqual(["remolon", "naipe"]);
  });

  it("no se levanta durante un diálogo ni si el jugador está en el sofá", () => {
    const state = createErrand(zero);
    const pose = createErrandPose();
    const home = ERRAND_PATHS[0]![0]!;
    tickErrand(state, 120, { ...open, hold: true }, pose, zero);
    expect(state.phase).toBe("wait");
    tickErrand(state, 1, { ...open, playerX: home[0], playerZ: home[1] }, pose, zero);
    expect(state.phase).toBe("wait");
  });

  it("se para si el jugador se le cruza y no avanza fuera de cámara", () => {
    const state = createErrand(zero);
    const pose = createErrandPose();
    forceWalk(state);
    const x = state.x;
    tickErrand(state, 1, { ...open, playerX: state.x, playerZ: state.z }, pose, zero);
    expect(state.x).toBe(x);
    tickErrand(state, 1, { ...open, visible: false }, pose, zero);
    expect(state.x).toBe(x);
    expect(state.phase).toBe("walk");
  });

  it("abre la nevera, vuelve al sofá y deja el turno al otro", () => {
    const state = createErrand(zero);
    const pose = createErrandPose();
    runUntil(state, pose, (item) => item.phase === "hold");
    expect(pose.door).toBe(1);
    expect(pose.carrying).toBe(true);
    expect(pose.id).toBe("remolon");
    expect(Math.hypot(state.x - PANTRY_STAND.x, state.z - PANTRY_STAND.z)).toBeLessThan(0.15);
    const home = ERRAND_PATHS[0]![0]!;
    runUntil(state, pose, (item) => item.phase === "wait" && item.justSat);
    expect(pose.engaged).toBe(true);
    expect(pose.id).toBe("remolon");
    expect(Math.hypot(pose.x - home[0], pose.z - home[1])).toBeLessThan(0.05);
    tickErrand(state, 0.05, open, pose, zero);
    expect(state.actor).toBe(1);
    expect(state.phase).toBe("wait");
    expect(pose.engaged).toBe(false);
    expect(state.waitLeft).toBeGreaterThanOrEqual(ERRAND_WAIT_MIN - 0.05);
  });

  it("la pose de captura deja la puerta abierta y la lata en la mano", () => {
    const state = createErrand(zero);
    const pose = createErrandPose();
    snapErrandAtFridge(state, pose);
    expect(pose.door).toBe(1);
    expect(pose.carrying).toBe(true);
    expect(pose.stand).toBe(1);
    expect(pose.id).toBe("remolon");
  });

  it("el camino no pisa la radio, el escritorio, la silla ni el paso de la encimera", () => {
    const spots = lobbyStaticColliders();
    for (const [index, path] of ERRAND_PATHS.entries()) {
      const own = index === 0 ? "couch" : "couchSouth";
      const start = path[0]!;
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1]!;
        const b = path[i]!;
        const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.25);
        for (let s = 0; s <= steps; s++) {
          const t = steps === 0 ? 1 : s / steps;
          const x = a[0] + (b[0] - a[0]) * t;
          const z = a[1] + (b[1] - a[1]) * t;
          if (Math.hypot(x - start[0], z - start[1]) < 1.05) continue;
          for (const spot of spots) {
            if (spot.id === own && Math.hypot(x - start[0], z - start[1]) < 1.4) continue;
            const gap = Math.hypot(x - spot.x, z - spot.z) - spot.collider;
            expect(gap, `${spot.id} en el tramo ${i}`).toBeGreaterThan(0.28);
          }
          expect(Math.hypot(x - LAYOUT.desk.x, z - LAYOUT.desk.z)).toBeGreaterThan(3);
          expect(Math.hypot(x - WORKSHOP_SEAT.x, z - WORKSHOP_SEAT.z)).toBeGreaterThan(3);
          expect(Math.hypot(x - LAYOUT.radio.x, z - LAYOUT.radio.z)).toBeGreaterThan(1.4);
        }
      }
    }
  });
});

describe("paseo de los animales", () => {
  it("pasa casi todo el rato tumbado y vuelve a su sitio", () => {
    const state = createAnimal(zero);
    const pose = createAnimalPose();
    expect(state.waitLeft).toBe(ANIMAL_WAIT_MIN);
    tickAnimal(state, ANIMAL_WAIT_MIN - 1, open, pose, zero);
    expect(state.phase).toBe("home");
    expect(pose.engaged).toBe(false);
    let moving = 0;
    let steps = 0;
    for (let t = 0; t < 400; t += 0.05) {
      tickAnimal(state, 0.05, open, pose, zero);
      steps += 1;
      if (pose.moving) moving += 1;
    }
    expect(moving / steps).toBeLessThan(0.12);
    expect(state.phase === "home" || state.phase === "nap" || state.phase === "wait" || state.phase === "back" || state.phase === "go").toBe(true);
  });

  it("la siesta dura un buen rato y el otro animal espera", () => {
    const state = createAnimal(zero);
    const pose = createAnimalPose();
    runAnimal(state, pose, (item) => item.phase === "nap");
    expect(pose.id).toBe("dog");
    expect(pose.up).toBe(0);
    expect(state.waitLeft).toBeGreaterThanOrEqual(ANIMAL_NAP_MIN - 0.05);
    const during = state.actor;
    tickAnimal(state, 1, open, pose, zero);
    expect(state.actor).toBe(during);
    expect(state.phase).toBe("nap");
  });

  it("no pasea fuera de cámara", () => {
    const state = createAnimal(zero);
    const pose = createAnimalPose();
    forceGo(state);
    const x = state.x;
    tickAnimal(state, 2, { ...open, visible: false }, pose, zero);
    expect(state.x).toBe(x);
  });
});

describe("encimera", () => {
  it("no tapa el paso a la nevera ni el escritorio", () => {
    const spots = lobbyStaticColliders();
    const bounds = playerLobbyBounds();
    const counter = spots.find((spot) => spot.id === "counter");
    expect(counter?.x).toBe(PANTRY_COUNTER.x);
    expect(counter?.collider).toBe(PANTRY_COUNTER.collider);
    for (const spot of spots) {
      if (spot.id === "counter") continue;
      const gap = Math.hypot(spot.x - PANTRY_COUNTER.x, spot.z - PANTRY_COUNTER.z) - spot.collider - PANTRY_COUNTER.collider;
      expect(gap, spot.id).toBeGreaterThan(0.05);
    }
    expect(Math.hypot(PANTRY_COUNTER.x - LAYOUT.desk.x, PANTRY_COUNTER.z - LAYOUT.desk.z)).toBeGreaterThan(4);
    expect(Math.hypot(PANTRY_COUNTER.x - WORKSHOP_SEAT.x, PANTRY_COUNTER.z - WORKSHOP_SEAT.z)).toBeGreaterThan(4);
    expect(Math.hypot(PANTRY_COUNTER.x - LAYOUT.radio.x, PANTRY_COUNTER.z - LAYOUT.radio.z)).toBeGreaterThan(2);
    const approach = walkToward({ x: 0, z: 1.7 }, { x: 7.3, z: 5.1 }, spots, bounds, { steps: 900 });
    expect(approach.remaining).toBeLessThan(0.6);
    const beside = walkToward({ x: 7.3, z: 5.1 }, { x: 7.55, z: 6.4 }, spots, bounds, { steps: 400 });
    expect(beside.remaining).toBeLessThan(0.6);
    const standGap = Math.hypot(PANTRY_STAND.x - LAYOUT.fridge.x, PANTRY_STAND.z - LAYOUT.fridge.z);
    expect(standGap).toBeGreaterThan(LAYOUT.fridge.collider + 0.28);
    expect(standGap).toBeLessThan(1.3);
    void PLAYER_RADIUS;
  });
});

function forceWalk(state: ErrandState) {
  state.phase = "walk";
  state.waypoint = 4;
  state.stand = 1;
  const point = ERRAND_PATHS[0]![4]!;
  state.x = point[0];
  state.z = point[1];
}

function forceGo(state: AnimalState) {
  state.phase = "go";
  state.waypoint = 0;
  state.waitLeft = 0;
}

function runUntil(state: ErrandState, pose: ReturnType<typeof createErrandPose>, done: (state: ErrandState) => boolean) {
  for (let i = 0; i < 4000; i++) {
    tickErrand(state, 0.05, open, pose, zero);
    if (done(state)) return;
  }
  throw new Error(`la rutina no llegó: ${state.phase}`);
}

function runAnimal(state: AnimalState, pose: ReturnType<typeof createAnimalPose>, done: (state: AnimalState) => boolean) {
  for (let i = 0; i < 8000; i++) {
    tickAnimal(state, 0.05, open, pose, zero);
    if (done(state)) return;
  }
  throw new Error(`el animal no llegó: ${state.phase}`);
}
