import { loungeNpc, yawToward, type LoungeNpc } from "./lounge-layout";
import { CAT_NAP, DOG_NAP, PANTRY_STAND } from "./pantry-layout";
import { LAYOUT } from "./navigation";

/** Entre viajes a la nevera. Un solo personaje a la vez. */
export const ERRAND_WAIT_MIN = 90;
export const ERRAND_WAIT_SPAN = 90;

/** El animal casi siempre está tumbado. La salida es rara. */
export const ANIMAL_WAIT_MIN = 150;
export const ANIMAL_WAIT_SPAN = 90;
export const ANIMAL_NAP_MIN = 34;
export const ANIMAL_NAP_SPAN = 22;

const YIELD_SQ = 0.72 * 0.72;
const ERRAND_SPEED = 1.05;
const ANIMAL_SPEED = 0.55;
const RISE_S = 0.7;
const REACH_S = 0.85;
const HOLD_S = 1.35;
const SHUT_S = 0.4;
const SIT_S = 0.7;

type XZ = readonly [number, number];

const remolon = mustNpc("remolon");
const naipe = mustNpc("naipe");

const ERRAND_TAIL: readonly XZ[] = [
  [-1.1, 2.2],
  [2.5, 3.4],
  [5.7, 4.6],
  [7.3, 5.15],
  [7.2, 6.35],
  [7.55, 6.9],
  [PANTRY_STAND.x, PANTRY_STAND.z],
];

export const ERRAND_PATHS: readonly (readonly XZ[])[] = [
  [[remolon.x, remolon.z], [-8.95, -3.05], [-7.55, -1.5], [-4.5, 0.4], ...ERRAND_TAIL],
  [[naipe.x, naipe.z], [-7.2, -1.4], [-5.2, -0.15], [-2.8, 1.15], ...ERRAND_TAIL],
];

export const ERRAND_ACTORS = ["remolon", "naipe"] as const;
export type ErrandActor = (typeof ERRAND_ACTORS)[number];

const ANIMAL_ACTORS = ["dog", "cat"] as const;
export type AnimalActor = (typeof ANIMAL_ACTORS)[number];

const ANIMAL_PATHS: readonly (readonly XZ[])[] = [
  [[LAYOUT.dog.x, LAYOUT.dog.z], [7.95, 5.55], [DOG_NAP.x, DOG_NAP.z]],
  [[LAYOUT.crates.x, LAYOUT.crates.z], [8.45, 4.95], [CAT_NAP.x, CAT_NAP.z]],
];

export type ErrandPhase = "wait" | "rise" | "walk" | "reach" | "hold" | "shut" | "return" | "sit";
export type AnimalPhase = "home" | "go" | "nap" | "back";

export type ErrandState = {
  phase: ErrandPhase;
  actor: 0 | 1;
  waypoint: number;
  phaseTime: number;
  waitLeft: number;
  x: number;
  z: number;
  yaw: number;
  stand: number;
  reach: number;
  door: number;
  carrying: boolean;
  justSat: boolean;
  pendingSwap: boolean;
};

export type AnimalState = {
  phase: AnimalPhase;
  actor: 0 | 1;
  waypoint: number;
  phaseTime: number;
  waitLeft: number;
  x: number;
  z: number;
  yaw: number;
  justHome: boolean;
  pendingSwap: boolean;
};

export type ErrandPose = {
  id: ErrandActor;
  engaged: boolean;
  x: number;
  z: number;
  yaw: number;
  stand: number;
  reach: number;
  door: number;
  carrying: boolean;
  walking: boolean;
};

export type AnimalPose = {
  id: AnimalActor;
  engaged: boolean;
  x: number;
  z: number;
  yaw: number;
  /** 1 mientras pasea, 0 tumbado. */
  up: number;
  /** 0 en el sitio alto del gato, 1 en el suelo. El perro no lo usa. */
  drop: number;
  moving: boolean;
};

export type RoutineView = {
  visible: boolean;
  hold: boolean;
  playerX: number;
  playerZ: number;
};

export function pantryInView(cx: number, cz: number, fx: number, fz: number, x: number, z: number): boolean {
  const dx = x - cx;
  const dz = z - cz;
  const along = dx * fx + dz * fz;
  const distSq = dx * dx + dz * dz;
  if (distSq < 9) return along > -0.8;
  return along > 0.2 && distSq < 169;
}

export function createErrandPose(): ErrandPose {
  return {
    id: "remolon",
    engaged: false,
    x: remolon.x,
    z: remolon.z,
    yaw: remolon.yaw,
    stand: 0,
    reach: 0,
    door: 0,
    carrying: false,
    walking: false,
  };
}

export function createAnimalPose(): AnimalPose {
  return {
    id: "dog",
    engaged: false,
    x: LAYOUT.dog.x,
    z: LAYOUT.dog.z,
    yaw: 0,
    up: 0,
    drop: 0,
    moving: false,
  };
}

export function createErrand(rng: () => number = Math.random): ErrandState {
  return {
    phase: "wait",
    actor: 0,
    waypoint: 0,
    phaseTime: 0,
    waitLeft: ERRAND_WAIT_MIN + rng() * ERRAND_WAIT_SPAN,
    x: remolon.x,
    z: remolon.z,
    yaw: remolon.yaw,
    stand: 0,
    reach: 0,
    door: 0,
    carrying: false,
    justSat: false,
    pendingSwap: false,
  };
}

export function createAnimal(rng: () => number = Math.random): AnimalState {
  return {
    phase: "home",
    actor: 0,
    waypoint: 0,
    phaseTime: 0,
    waitLeft: ANIMAL_WAIT_MIN + rng() * ANIMAL_WAIT_SPAN,
    x: LAYOUT.dog.x,
    z: LAYOUT.dog.z,
    yaw: 0,
    justHome: false,
    pendingSwap: false,
  };
}

export function tickErrand(
  state: ErrandState,
  dt: number,
  view: RoutineView,
  pose: ErrandPose,
  rng: () => number = Math.random,
): void {
  const settle = state.justSat;
  state.justSat = false;
  if (settle && state.pendingSwap) {
    state.pendingSwap = false;
    state.actor = state.actor === 0 ? 1 : 0;
    const home = actorHome(state.actor);
    state.phase = "wait";
    state.waypoint = 0;
    state.phaseTime = 0;
    state.waitLeft = ERRAND_WAIT_MIN + rng() * ERRAND_WAIT_SPAN;
    state.x = home.x;
    state.z = home.z;
    state.yaw = home.yaw;
    state.stand = 0;
    state.reach = 0;
    state.door = 0;
    state.carrying = false;
  }

  const motion = dt > 0.05 ? 0.05 : dt;
  if (state.phase === "wait") {
    if (!view.hold) state.waitLeft -= dt;
    const home = actorHome(state.actor);
    const near = (view.playerX - home.x) ** 2 + (view.playerZ - home.z) ** 2 < 1.44;
    if (state.waitLeft <= 0 && !view.hold && view.visible && !near) {
      state.phase = "rise";
      state.phaseTime = 0;
      state.x = home.x;
      state.z = home.z;
      state.yaw = home.yaw;
    }
  } else if (!view.visible || blocked(view, state.x, state.z)) {
    // Quieto fuera de cámara o si el jugador está encima. Sin buscar camino.
  } else if (state.phase === "rise") {
    state.phaseTime += motion;
    state.stand = clamp01(state.phaseTime / RISE_S);
    if (state.stand >= 1) {
      state.phase = "walk";
      state.waypoint = 0;
      state.phaseTime = 0;
    }
  } else if (state.phase === "walk") {
    const done = stepPath(state, motion, ERRAND_PATHS[state.actor]!, 1, ERRAND_SPEED);
    if (done) {
      state.phase = "reach";
      state.phaseTime = 0;
    }
  } else if (state.phase === "reach") {
    state.phaseTime += motion;
    const u = clamp01(state.phaseTime / REACH_S);
    state.reach = u;
    state.door = u;
    if (u >= 1) {
      state.carrying = true;
      state.phase = "hold";
      state.phaseTime = 0;
    }
  } else if (state.phase === "hold") {
    state.phaseTime += motion;
    state.reach = 1;
    state.door = 1;
    state.carrying = true;
    if (state.phaseTime >= HOLD_S) {
      state.phase = "shut";
      state.phaseTime = 0;
    }
  } else if (state.phase === "shut") {
    state.phaseTime += motion;
    const u = clamp01(state.phaseTime / SHUT_S);
    state.reach = 1 - u;
    state.door = 1 - u;
    state.carrying = true;
    if (u >= 1) {
      state.phase = "return";
      state.phaseTime = 0;
    }
  } else if (state.phase === "return") {
    const done = stepPath(state, motion, ERRAND_PATHS[state.actor]!, -1, ERRAND_SPEED);
    if (done) {
      state.phase = "sit";
      state.phaseTime = 0;
    }
  } else {
    state.phaseTime += motion;
    const u = clamp01(state.phaseTime / SIT_S);
    const home = actorHome(state.actor);
    state.stand = 1 - u;
    state.x = home.x;
    state.z = home.z;
    state.yaw = home.yaw;
    state.carrying = u < 1;
    state.reach = 0;
    state.door = 0;
    if (u >= 1) {
      state.phase = "wait";
      state.justSat = true;
      state.pendingSwap = true;
      state.stand = 0;
      state.carrying = false;
    }
  }

  pose.id = ERRAND_ACTORS[state.actor]!;
  pose.engaged = state.phase !== "wait" || state.justSat;
  pose.x = state.x;
  pose.z = state.z;
  pose.yaw = state.yaw;
  pose.stand = state.stand;
  pose.reach = state.reach;
  pose.door = state.door;
  pose.carrying = state.carrying;
  pose.walking = state.phase === "walk" || state.phase === "return";
}

export function tickAnimal(state: AnimalState, dt: number, view: RoutineView, pose: AnimalPose, rng: () => number = Math.random): void {
  const settle = state.justHome;
  state.justHome = false;
  if (settle && state.pendingSwap) {
    state.pendingSwap = false;
    state.actor = state.actor === 0 ? 1 : 0;
    const home = ANIMAL_PATHS[state.actor]![0]!;
    state.phase = "home";
    state.waypoint = 0;
    state.phaseTime = 0;
    state.waitLeft = ANIMAL_WAIT_MIN + rng() * ANIMAL_WAIT_SPAN;
    state.x = home[0];
    state.z = home[1];
    state.yaw = 0;
  }

  const motion = dt > 0.05 ? 0.05 : dt;
  const path = ANIMAL_PATHS[state.actor]!;
  if (state.phase === "home") {
    if (!view.hold) state.waitLeft -= dt;
    if (state.waitLeft <= 0 && !view.hold && view.visible) {
      state.phase = "go";
      state.waypoint = 0;
      state.phaseTime = 0;
    }
  } else if (!view.visible || blocked(view, state.x, state.z)) {
    // Pausa fuera de cámara o si el jugador está en el sitio.
  } else if (state.phase === "go") {
    const done = stepPath(state, motion, path, 1, ANIMAL_SPEED);
    if (done) {
      state.phase = "nap";
      state.phaseTime = 0;
      state.waitLeft = ANIMAL_NAP_MIN + rng() * ANIMAL_NAP_SPAN;
      state.yaw = state.actor === 0 ? 0.55 : 1.05;
    }
  } else if (state.phase === "nap") {
    state.waitLeft -= motion;
    if (state.waitLeft <= 0) {
      state.phase = "back";
      state.phaseTime = 0;
    }
  } else {
    const done = stepPath(state, motion, path, -1, ANIMAL_SPEED);
    if (done) {
      const home = path[0]!;
      state.phase = "home";
      state.x = home[0];
      state.z = home[1];
      state.yaw = 0;
      state.justHome = true;
      state.pendingSwap = true;
    }
  }

  const moving = state.phase === "go" || state.phase === "back";
  const along = path.length > 1 ? state.waypoint / (path.length - 1) : 0;
  pose.id = ANIMAL_ACTORS[state.actor]!;
  pose.engaged = state.phase !== "home" || state.justHome;
  pose.x = state.x;
  pose.z = state.z;
  pose.yaw = state.yaw;
  pose.up = moving ? 1 : 0;
  pose.drop = state.actor === 1 ? (state.phase === "nap" ? 1 : along) : 0;
  pose.moving = moving && !settle;
}

/** Deja a Remolón con la nevera abierta y una lata en la mano. Para capturas. */
export function snapErrandAtFridge(state: ErrandState, pose: ErrandPose): void {
  state.phase = "hold";
  state.actor = 0;
  state.waypoint = ERRAND_PATHS[0]!.length - 1;
  state.phaseTime = 0.4;
  state.waitLeft = 0;
  state.x = PANTRY_STAND.x;
  state.z = PANTRY_STAND.z;
  state.yaw = yawToward({ x: state.x, z: state.z }, { x: LAYOUT.fridge.x, z: LAYOUT.fridge.z });
  state.stand = 1;
  state.reach = 1;
  state.door = 1;
  state.carrying = true;
  state.justSat = false;
  state.pendingSwap = false;
  pose.id = "remolon";
  pose.engaged = true;
  pose.x = state.x;
  pose.z = state.z;
  pose.yaw = state.yaw;
  pose.stand = 1;
  pose.reach = 1;
  pose.door = 1;
  pose.carrying = true;
  pose.walking = false;
}

function mustNpc(id: string): LoungeNpc {
  const npc = loungeNpc(id);
  if (!npc) throw new Error(`Persona del rincón desconocida: ${id}`);
  return npc;
}

function actorHome(actor: 0 | 1): LoungeNpc {
  return actor === 0 ? remolon : naipe;
}

function blocked(view: RoutineView, x: number, z: number): boolean {
  const dx = view.playerX - x;
  const dz = view.playerZ - z;
  return dx * dx + dz * dz < YIELD_SQ;
}

function stepPath(
  state: { x: number; z: number; yaw: number; waypoint: number },
  dt: number,
  points: readonly XZ[],
  dir: 1 | -1,
  speed: number,
): boolean {
  const targetIndex = state.waypoint + dir;
  if (targetIndex < 0 || targetIndex >= points.length) return true;
  const target = points[targetIndex]!;
  const dx = target[0] - state.x;
  const dz = target[1] - state.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.07) {
    state.x = target[0];
    state.z = target[1];
    state.waypoint = targetIndex;
    return targetIndex === 0 || targetIndex === points.length - 1;
  }
  const step = Math.min(speed * dt, dist);
  state.x += (dx / dist) * step;
  state.z += (dz / dist) * step;
  state.yaw = Math.atan2(dx, dz);
  return false;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
