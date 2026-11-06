import { describe, expect, it } from "vitest";
import { WORKSHOP_SEAT } from "./workshop-cinematic";
import {
  LAYOUT,
  PLAYER_RADIUS,
  lobbyStaticColliders,
  playerLobbyBounds,
  walkToward,
} from "./navigation";
import { CAT_VISIT, DOG_VISIT, PANTRY_COUNTER, PANTRY_STAND } from "./pantry-layout";
import {
  ANIMAL_NAP_MIN,
  ANIMAL_PATHS,
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
  it("espera entre 45 y 90 segundos, y solo mueve a uno", () => {
    const state = createErrand(zero);
    const pose = createErrandPose();
    expect(state.waitLeft).toBe(ERRAND_WAIT_MIN);
    expect(ERRAND_WAIT_MIN + 45).toBe(90);
    expect(state.phase).toBe("wait");
    tickErrand(state, 44, open, pose, zero);
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

  it("sigue hacia la nevera lejos del jugador y fuera de cámara", () => {
    const state = createErrand(zero);
    const pose = createErrandPose();
    forceWalk(state);
    const far: RoutineView = { visible: false, hold: false, playerX: -20, playerZ: -20 };
    const x = state.x;
    const z = state.z;
    tickErrand(state, 0.05, far, pose, zero);
    expect(Math.hypot(state.x - x, state.z - z)).toBeGreaterThan(0.04);
    expect(pose.walking).toBe(true);
    expect(state.phase).toBe("walk");
    runUntil(state, pose, (item) => item.phase === "hold", far);
    expect(Math.hypot(state.x - PANTRY_STAND.x, state.z - PANTRY_STAND.z)).toBeLessThan(0.15);
    expect(pose.walking).toBe(false);
    expect(pose.door).toBe(1);
  });

  it("la animación de caminar acompaña al desplazamiento", () => {
    const state = createErrand(zero);
    const pose = createErrandPose();
    forceWalk(state);
    const far: RoutineView = { visible: false, hold: false, playerX: -20, playerZ: -20 };
    for (let i = 0; i < 40; i++) {
      const x = state.x;
      const z = state.z;
      tickErrand(state, 0.05, far, pose, zero);
      const moved = Math.hypot(state.x - x, state.z - z);
      if (state.phase !== "walk" && state.phase !== "return") break;
      expect(pose.walking).toBe(moved > 0.001);
    }
    tickErrand(state, 0, far, pose, zero);
    expect(pose.walking).toBe(false);
  });

  it("rodea al jugador que tapa el tramo y no se queda clavado", () => {
    const state = createErrand(zero);
    const pose = createErrandPose();
    forceWalk(state);
    const from = ERRAND_PATHS[0]![4]!;
    const to = ERRAND_PATHS[0]![5]!;
    const dx = to[0] - from[0];
    const dz = to[1] - from[1];
    const span = Math.hypot(dx, dz);
    const playerX = from[0] + (dx / span) * 1.15;
    const playerZ = from[1] + (dz / span) * 1.15;
    const view: RoutineView = { visible: true, hold: false, playerX, playerZ };
    const trace = skirt(state, pose, view, (item) => item.waypoint > 4 || item.phase !== "walk", 500);
    expect(trace.minGap).toBeGreaterThan(0.72);
    expect(trace.minFurn).toBeGreaterThan(-0.02);
    expect(trace.flips).toBe(0);
    expect(trace.stuck).toBeLessThan(8);
    expect(trace.maxStep).toBeLessThan(0.12);
    expect(state.waypoint).toBeGreaterThan(4);
    expect(Math.hypot(state.x - from[0], state.z - from[1])).toBeGreaterThan(1.4);
  });

  it("no orbita si el jugador ocupa el punto del camino", () => {
    const state = createErrand(zero);
    const pose = createErrandPose();
    forceWalk(state);
    const blocked = ERRAND_PATHS[0]![5]!;
    const view: RoutineView = { visible: false, hold: false, playerX: blocked[0], playerZ: blocked[1] };
    const trace = skirt(state, pose, view, (item) => item.waypoint > 5 || item.phase !== "walk", 500);
    expect(trace.minGap).toBeGreaterThan(0.72);
    expect(trace.minFurn).toBeGreaterThan(-0.02);
    expect(trace.flips).toBeLessThanOrEqual(1);
    expect(trace.stuck).toBeLessThan(12);
    expect(state.waypoint).toBeGreaterThan(5);
  });

  it("esquiva al jugador en los tramos despejados, ida y vuelta", () => {
    let cases = 0;
    for (const [index, path] of ERRAND_PATHS.entries()) {
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1]!;
        const b = path[i]!;
        const spot = blockPoint(a, b, 0.55);
        if (!spot) continue;
        for (const dir of [1, -1] as const) {
          const state = createErrand(zero);
          const pose = createErrandPose();
          state.actor = index as 0 | 1;
          state.stand = 1;
          state.phase = dir === 1 ? "walk" : "return";
          state.waypoint = dir === 1 ? i - 1 : i;
          state.x = dir === 1 ? a[0] : b[0];
          state.z = dir === 1 ? a[1] : b[1];
          const view: RoutineView = { visible: false, hold: false, playerX: spot.x, playerZ: spot.z };
          const trace = skirt(
            state,
            pose,
            view,
            (item) => (dir === 1 ? item.waypoint >= i : item.waypoint < i) || (dir === 1 ? item.phase !== "walk" : item.phase !== "return"),
            700,
          );
          const where = `${index === 0 ? "remolon" : "naipe"} tramo ${i} ${dir === 1 ? "ida" : "vuelta"}`;
          expect(trace.arrived, where).toBe(true);
          expect(trace.minGap, where).toBeGreaterThan(0.7);
          expect(trace.minFurn, where).toBeGreaterThan(-0.02);
          expect(trace.flips, where).toBeLessThanOrEqual(1);
          expect(trace.stuck, where).toBeLessThan(14);
          cases += 1;
        }
      }
    }
    expect(cases).toBeGreaterThan(8);
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
  it("sale de la cama cerca de una quinta parte del tiempo y vuelve", () => {
    const state = createAnimal(zero);
    const pose = createAnimalPose();
    expect(state.waitLeft).toBe(ANIMAL_WAIT_MIN);
    tickAnimal(state, ANIMAL_WAIT_MIN - 1, open, pose, zero);
    expect(state.phase).toBe("home");
    expect(pose.host).toBeNull();
    runAnimal(state, pose, (item) => item.phase === "go");
    let away = 0;
    for (let i = 0; i < 20000; i++) {
      tickAnimal(state, 0.05, open, pose, zero);
      if (state.justHome) break;
      if (state.phase !== "home") away += 1;
    }
    expect(state.justHome).toBe(true);
    const awaySeconds = away * 0.05;
    const fraction = awaySeconds / (awaySeconds + ANIMAL_WAIT_MIN);
    expect(fraction).toBeGreaterThan(0.16);
    expect(fraction).toBeLessThan(0.26);
    expect(pose.id).toBe("dog");
    expect(Math.hypot(state.x - ANIMAL_PATHS[0]![0]![0], state.z - ANIMAL_PATHS[0]![0]![1])).toBeLessThan(0.05);
  });

  it("se queda un rato a los pies del sofá y el otro animal espera", () => {
    const state = createAnimal(zero);
    const pose = createAnimalPose();
    runAnimal(state, pose, (item) => item.phase === "nap");
    expect(pose.id).toBe("dog");
    expect(pose.up).toBe(0);
    expect(pose.host).toBe(DOG_VISIT.host);
    expect(Math.hypot(state.x - DOG_VISIT.x, state.z - DOG_VISIT.z)).toBeLessThan(0.15);
    expect(state.waitLeft).toBeGreaterThanOrEqual(ANIMAL_NAP_MIN - 0.05);
    const during = state.actor;
    tickAnimal(state, 1, open, pose, zero);
    expect(state.actor).toBe(during);
    expect(state.phase).toBe("nap");
    runAnimal(state, pose, (item) => item.phase === "nap" && item.actor === 1);
    expect(pose.host).toBe(CAT_VISIT.host);
    expect(Math.hypot(state.x - CAT_VISIT.x, state.z - CAT_VISIT.z)).toBeLessThan(0.15);
  });

  it("el camino al sofá no cruza la cocina ni la radio ni el escritorio", () => {
    const spots = lobbyStaticColliders();
    const own = ["dog", "cat"] as const;
    for (const [index, path] of ANIMAL_PATHS.entries()) {
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
            if (spot.id === own[index]) continue;
            const gap = Math.hypot(x - spot.x, z - spot.z) - spot.collider;
            expect(gap, `${spot.id} en el tramo ${i} de ${own[index]}`).toBeGreaterThan(0.28);
          }
          expect(Math.hypot(x - LAYOUT.desk.x, z - LAYOUT.desk.z)).toBeGreaterThan(3);
          expect(Math.hypot(x - WORKSHOP_SEAT.x, z - WORKSHOP_SEAT.z)).toBeGreaterThan(3);
          expect(Math.hypot(x - LAYOUT.radio.x, z - LAYOUT.radio.z)).toBeGreaterThan(1.4);
        }
      }
    }
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

function runUntil(
  state: ErrandState,
  pose: ReturnType<typeof createErrandPose>,
  done: (state: ErrandState) => boolean,
  view: RoutineView = open,
) {
  for (let i = 0; i < 4000; i++) {
    tickErrand(state, 0.05, view, pose, zero);
    if (done(state)) return;
  }
  throw new Error(`la rutina no llegó: ${state.phase}`);
}

function blockPoint(a: readonly [number, number], b: readonly [number, number], t: number): { x: number; z: number } | null {
  const x = a[0] + (b[0] - a[0]) * t;
  const z = a[1] + (b[1] - a[1]) * t;
  if (Math.hypot(x - a[0], z - a[1]) < 1.2) return null;
  if (Math.hypot(x - b[0], z - b[1]) < 1.2) return null;
  for (const spot of lobbyStaticColliders()) {
    if (Math.hypot(x - spot.x, z - spot.z) - spot.collider < 0.55) return null;
  }
  return { x, z };
}

function skirt(
  state: ErrandState,
  pose: ReturnType<typeof createErrandPose>,
  view: RoutineView,
  done: (state: ErrandState) => boolean,
  limit: number,
): { minGap: number; minFurn: number; flips: number; stuck: number; maxStep: number; arrived: boolean } {
  let minGap = Infinity;
  let minFurn = Infinity;
  let flips = 0;
  let prevSign = 0;
  let stuck = 0;
  let worstStuck = 0;
  let maxStep = 0;
  const dx = view.playerX - state.x;
  const dz = view.playerZ - state.z;
  const span = Math.hypot(dx, dz) || 1;
  const ux = dx / span;
  const uz = dz / span;
  let arrived = false;
  for (let i = 0; i < limit; i++) {
    const x = state.x;
    const z = state.z;
    tickErrand(state, 0.05, view, pose, zero);
    const moved = Math.hypot(state.x - x, state.z - z);
    if (moved > maxStep) maxStep = moved;
    if (state.phase === "walk" || state.phase === "return") {
      expect(pose.walking).toBe(moved > 0.001);
      if (moved < 0.01) stuck += 1;
      else stuck = 0;
      if (stuck > worstStuck) worstStuck = stuck;
    }
    const gap = Math.hypot(state.x - view.playerX, state.z - view.playerZ);
    if (gap < minGap) minGap = gap;
    for (const spot of lobbyStaticColliders()) {
      const furn = Math.hypot(state.x - spot.x, state.z - spot.z) - spot.collider - 0.22;
      if (furn < minFurn) minFurn = furn;
    }
    const cross = ux * (state.z - view.playerZ) - uz * (state.x - view.playerX);
    const sign = cross > 0.08 ? 1 : cross < -0.08 ? -1 : 0;
    if (sign !== 0 && prevSign !== 0 && sign !== prevSign) flips += 1;
    if (sign !== 0) prevSign = sign;
    if (done(state)) {
      arrived = true;
      break;
    }
  }
  return { minGap, minFurn, flips, stuck: worstStuck, maxStep, arrived };
}

function runAnimal(state: AnimalState, pose: ReturnType<typeof createAnimalPose>, done: (state: AnimalState) => boolean) {
  for (let i = 0; i < 30000; i++) {
    tickAnimal(state, 0.05, open, pose, zero);
    if (done(state)) return;
  }
  throw new Error(`el animal no llegó: ${state.phase}`);
}
