import { loungeNpc, yawToward, type LoungeNpc } from "./lounge-layout";
import { LAYOUT, PLAYER_RADIUS, ROOM_INNER, lobbyStaticColliders, type ColliderSpot } from "./navigation";
import {
  CAT_BED,
  CAT_HOME_YAW,
  CAT_VISIT,
  DOG_BED,
  DOG_HOME_YAW,
  DOG_VISIT,
  PANTRY_STAND,
} from "./pantry-layout";

/** Entre viajes a la nevera. Un solo personaje a la vez. */
export const ERRAND_WAIT_MIN = 45;
export const ERRAND_WAIT_SPAN = 45;

/**
 * En la cama casi siempre. El paseo hasta el sofá y la espera a los pies
 * ocupan cerca de una quinta parte del ciclo.
 */
export const ANIMAL_WAIT_MIN = 340;
export const ANIMAL_WAIT_SPAN = 40;
export const ANIMAL_NAP_MIN = 18;
export const ANIMAL_NAP_SPAN = 10;

const YIELD_SQ = 0.72 * 0.72;
const ERRAND_SPEED = 1.05;
/** Cuerpo del paseo. Solo empuja muebles al rodear; el camino recto ya está libre. */
const NPC_BODY = 0.22;
/**
 * Hueco entre centros al rodear al jugador.
 * El collider del paseo es 0,34 y el del jugador, 0,38: por debajo se empujan.
 */
const BODY_GAP = PLAYER_RADIUS + 0.34 + 0.08;
const PASS = 0.07;
const ERRAND_OBSTACLES: readonly ColliderSpot[] = lobbyStaticColliders();
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
  [5.0, 4.55],
  [6.4, 5.5],
  [7.4, 5.75],
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

const ANIMAL_HOSTS = [DOG_VISIT.host, CAT_VISIT.host] as const;
const ANIMAL_HOME_YAW = [DOG_HOME_YAW, CAT_HOME_YAW] as const;

export const ANIMAL_PATHS: readonly (readonly XZ[])[] = [
  [
    [DOG_BED.x, DOG_BED.z],
    [6.2, 4.5],
    [4.2, 3.75],
    [2.2, 3.4],
    [0.0, 3.3],
    [-2.4, 2.95],
    [-4.6, 1.9],
    [-6.3, 0.5],
    [-7.15, -1.15],
    [-8.15, -1.7],
    [-8.15, -2.7],
    [DOG_VISIT.x, DOG_VISIT.z],
  ],
  [
    [CAT_BED.x, CAT_BED.z],
    [8.35, 5.5],
    [6.4, 5.45],
    [4.4, 4.0],
    [2.4, 3.45],
    [-0.1, 3.15],
    [-2.5, 2.6],
    [-4.5, 1.4],
    [-5.5, 0.15],
    [-5.95, -1.05],
    [CAT_VISIT.x, CAT_VISIT.z],
  ],
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
  /** 0 recto, 1 a la izquierda del tramo, -1 a la derecha. */
  avoidSide: -1 | 0 | 1;
  /** Dirección del tramo en el momento de elegir lado. No gira con el desvío. */
  avoidDirX: number;
  avoidDirZ: number;
  /** Ya va hacia el punto: el lado no vuelve a cambiar hasta pasar al jugador. */
  avoidPast: boolean;
  /** Segundos casi sin avanzar mientras rodea. */
  avoidStall: number;
  /** Este rodeo ya probó el otro lado. */
  avoidFlipped: boolean;
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
  /** Reservado. El gato ya vive en el suelo. */
  drop: number;
  moving: boolean;
  /** Quien tiene al animal en los pies. Solo durante la visita. */
  host: string | null;
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
    x: DOG_BED.x,
    z: DOG_BED.z,
    yaw: DOG_HOME_YAW,
    up: 0,
    drop: 0,
    moving: false,
    host: null,
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
    avoidSide: 0,
    avoidDirX: 0,
    avoidDirZ: 1,
    avoidPast: false,
    avoidStall: 0,
    avoidFlipped: false,
  };
}

export function createAnimal(rng: () => number = Math.random): AnimalState {
  return {
    phase: "home",
    actor: 0,
    waypoint: 0,
    phaseTime: 0,
    waitLeft: ANIMAL_WAIT_MIN + rng() * ANIMAL_WAIT_SPAN,
    x: DOG_BED.x,
    z: DOG_BED.z,
    yaw: DOG_HOME_YAW,
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
    clearAvoid(state);
  }

  const motion = dt > 0.05 ? 0.05 : dt;
  const originX = state.x;
  const originZ = state.z;
  if (state.phase === "wait") {
    if (!view.hold) state.waitLeft -= dt;
    const home = actorHome(state.actor);
    const near = (view.playerX - home.x) ** 2 + (view.playerZ - home.z) ** 2 < 1.44;
    // La cámara solo decide el arranque. El viaje sigue lejos: si se congela,
    // la fase se queda en caminar y las piernas se mueven sin avanzar.
    if (state.waitLeft <= 0 && !view.hold && view.visible && !near) {
      state.phase = "rise";
      state.phaseTime = 0;
      state.x = home.x;
      state.z = home.z;
      state.yaw = home.yaw;
    }
  } else if (state.phase === "rise") {
    state.phaseTime += motion;
    state.stand = clamp01(state.phaseTime / RISE_S);
    if (state.stand >= 1) {
      state.phase = "walk";
      state.waypoint = 0;
      state.phaseTime = 0;
    }
  } else if (state.phase === "walk") {
    const done = stepErrand(state, motion, ERRAND_PATHS[state.actor]!, 1, ERRAND_SPEED, view.playerX, view.playerZ);
    if (done) {
      state.phase = "reach";
      state.phaseTime = 0;
      clearAvoid(state);
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
    const done = stepErrand(state, motion, ERRAND_PATHS[state.actor]!, -1, ERRAND_SPEED, view.playerX, view.playerZ);
    if (done) {
      state.phase = "sit";
      state.phaseTime = 0;
      clearAvoid(state);
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
  const moved = Math.hypot(state.x - originX, state.z - originZ);
  const stepping = state.phase === "walk" || state.phase === "return";
  pose.walking = stepping && moved > 0.001;
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
    state.yaw = ANIMAL_HOME_YAW[state.actor]!;
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
      const host = mustNpc(ANIMAL_HOSTS[state.actor]!);
      state.yaw = yawToward({ x: state.x, z: state.z }, host);
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
      state.yaw = ANIMAL_HOME_YAW[state.actor]!;
      state.justHome = true;
      state.pendingSwap = true;
    }
  }

  const moving = state.phase === "go" || state.phase === "back";
  pose.id = ANIMAL_ACTORS[state.actor]!;
  pose.engaged = state.phase !== "home" || state.justHome;
  pose.x = state.x;
  pose.z = state.z;
  pose.yaw = state.yaw;
  pose.up = moving ? 1 : 0;
  pose.drop = 0;
  pose.moving = moving && !settle;
  pose.host = state.phase === "nap" ? ANIMAL_HOSTS[state.actor]! : null;
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
  clearAvoid(state);
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

/**
 * Sigue el camino y, si el jugador tapa el tramo, lo rodea por un lado fijo.
 * Sin malla de navegación: un punto al lado y el hueco del cuerpo.
 */
function stepErrand(
  state: ErrandState,
  dt: number,
  points: readonly XZ[],
  dir: 1 | -1,
  speed: number,
  playerX: number,
  playerZ: number,
): boolean {
  const done = stepErrandCourse(state, dt, points, dir, speed, playerX, playerZ);
  const home = actorHome(state.actor);
  if ((state.x - home.x) ** 2 + (state.z - home.z) ** 2 < 1.44) return done;
  const clear = separateObstacles(state.x, state.z);
  const placed = separateCircle(clear.x, clear.z, playerX, playerZ, BODY_GAP);
  state.x = placed.x;
  state.z = placed.z;
  return done;
}

function stepErrandCourse(
  state: ErrandState,
  dt: number,
  points: readonly XZ[],
  dir: 1 | -1,
  speed: number,
  playerX: number,
  playerZ: number,
): boolean {
  const targetIndex = state.waypoint + dir;
  if (targetIndex < 0 || targetIndex >= points.length) return true;
  const target = points[targetIndex]!;
  const dx = target[0] - state.x;
  const dz = target[1] - state.z;
  const dist = Math.hypot(dx, dz);
  const pDist = Math.hypot(playerX - state.x, playerZ - state.z);
  const segDist = pointSegmentDistance(playerX, playerZ, state.x, state.z, target[0], target[1]);
  const terminal = targetIndex === 0 || targetIndex === points.length - 1;
  const playerOnTarget = Math.hypot(playerX - target[0], playerZ - target[1]) < BODY_GAP;

  if (playerOnTarget && dist < BODY_GAP + 0.45) {
    clearAvoid(state);
    if (terminal) return true;
    state.waypoint = targetIndex;
    return false;
  }

  if (dist < PASS && pDist >= BODY_GAP) {
    clearAvoid(state);
    state.x = target[0];
    state.z = target[1];
    state.waypoint = targetIndex;
    return terminal;
  }

  const desiredX = dist < 1e-6 ? 0 : dx / dist;
  const desiredZ = dist < 1e-6 ? 1 : dz / dist;
  const ahead = (playerX - state.x) * desiredX + (playerZ - state.z) * desiredZ;
  const blocking = segDist < BODY_GAP || pDist < BODY_GAP;
  if (state.avoidPast && ahead < -0.25 && pDist > BODY_GAP + 0.05 && segDist >= BODY_GAP) clearAvoid(state);
  if (state.avoidSide === 0 && !blocking) {
    const beforeX = state.x;
    const beforeZ = state.z;
    const done = stepPath(state, dt, points, dir, speed);
    const pushed = separateCircle(state.x, state.z, playerX, playerZ, BODY_GAP);
    if (pushed.x !== state.x || pushed.z !== state.z) {
      state.yaw = Math.atan2(pushed.x - beforeX, pushed.z - beforeZ);
    }
    state.x = pushed.x;
    state.z = pushed.z;
    return done;
  }

  if (state.avoidSide === 0) {
    state.avoidSide = pickSide(state.x, state.z, desiredX, desiredZ, playerX, playerZ);
    state.avoidDirX = desiredX;
    state.avoidDirZ = desiredZ;
    state.avoidStall = 0;
    state.avoidFlipped = false;
    state.avoidPast = false;
  }

  const perpX = -state.avoidDirZ * state.avoidSide;
  const perpZ = state.avoidDirX * state.avoidSide;
  const sideGap = (state.x - playerX) * perpX + (state.z - playerZ) * perpZ;
  const opened = pDist >= BODY_GAP && sideGap >= BODY_GAP - 0.04;
  if (!state.avoidPast && opened && ahead < 0.55) state.avoidPast = true;

  let aimX = target[0];
  let aimZ = target[1];
  if (!state.avoidPast) {
    const lateral = lateralPoint(playerX, playerZ, perpX, perpZ);
    aimX = lateral.x;
    aimZ = lateral.z;
  }

  const moved = moveSkirt(state, aimX, aimZ, dt, speed, playerX, playerZ);
  if (moved < speed * dt * 0.3) state.avoidStall += dt;
  else state.avoidStall = 0;
  if (state.avoidStall > 0.5) {
    if (!state.avoidFlipped) {
      state.avoidSide = state.avoidSide === 1 ? -1 : 1;
      state.avoidDirX = desiredX;
      state.avoidDirZ = desiredZ;
      state.avoidFlipped = true;
      state.avoidPast = false;
      state.avoidStall = 0;
    } else {
      clearAvoid(state);
      if (terminal) return dist < 2.4;
      state.waypoint = targetIndex;
      return false;
    }
  }
  return false;
}

function clearAvoid(state: ErrandState): void {
  state.avoidSide = 0;
  state.avoidDirX = 0;
  state.avoidDirZ = 1;
  state.avoidPast = false;
  state.avoidStall = 0;
  state.avoidFlipped = false;
}

function pickSide(x: number, z: number, desiredX: number, desiredZ: number, playerX: number, playerZ: number): -1 | 1 {
  const leftX = -desiredZ;
  const leftZ = desiredX;
  const cross = desiredX * (playerZ - z) - desiredZ * (playerX - x);
  const prefer: -1 | 1 = cross >= 0 ? -1 : 1;
  const other: -1 | 1 = prefer === 1 ? -1 : 1;
  const preferRoom = obstacleGap(x + leftX * prefer * 1.05, z + leftZ * prefer * 1.05);
  const otherRoom = obstacleGap(x + leftX * other * 1.05, z + leftZ * other * 1.05);
  return otherRoom > preferRoom + 0.35 ? other : prefer;
}

function lateralPoint(playerX: number, playerZ: number, perpX: number, perpZ: number): { x: number; z: number } {
  let reach = BODY_GAP + 0.28;
  let x = playerX + perpX * reach;
  let z = playerZ + perpZ * reach;
  for (let i = 0; i < 4; i++) {
    const placed = clampRoom(x, z);
    x = placed.x;
    z = placed.z;
    if (obstacleGap(x, z) >= 0.02) break;
    reach += 0.22;
    x = playerX + perpX * reach;
    z = playerZ + perpZ * reach;
  }
  return clampRoom(x, z);
}

function moveSkirt(
  state: ErrandState,
  aimX: number,
  aimZ: number,
  dt: number,
  speed: number,
  playerX: number,
  playerZ: number,
): number {
  const dx = aimX - state.x;
  const dz = aimZ - state.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-6) return 0;
  const step = Math.min(speed * dt, dist);
  let x = state.x + (dx / dist) * step;
  let z = state.z + (dz / dist) * step;
  let placed = separateCircle(x, z, playerX, playerZ, BODY_GAP);
  placed = separateObstacles(placed.x, placed.z);
  placed = separateCircle(placed.x, placed.z, playerX, playerZ, BODY_GAP);
  placed = clampRoom(placed.x, placed.z);
  placed = separateCircle(placed.x, placed.z, playerX, playerZ, BODY_GAP);
  const moved = Math.hypot(placed.x - state.x, placed.z - state.z);
  if (moved > 1e-5) state.yaw = Math.atan2(placed.x - state.x, placed.z - state.z);
  state.x = placed.x;
  state.z = placed.z;
  return moved;
}

function separateCircle(x: number, z: number, cx: number, cz: number, gap: number): { x: number; z: number } {
  const dx = x - cx;
  const dz = z - cz;
  const dist = Math.hypot(dx, dz);
  if (dist >= gap || dist < 1e-6) return { x, z };
  return { x: cx + (dx / dist) * gap, z: cz + (dz / dist) * gap };
}

function separateObstacles(x: number, z: number): { x: number; z: number } {
  let px = x;
  let pz = z;
  for (let pass = 0; pass < 2; pass++) {
    for (const spot of ERRAND_OBSTACLES) {
      const dx = px - spot.x;
      const dz = pz - spot.z;
      const min = spot.collider + NPC_BODY;
      const distSq = dx * dx + dz * dz;
      if (distSq >= min * min || distSq < 1e-8) continue;
      const dist = Math.sqrt(distSq);
      const push = (min - dist) / dist;
      px += dx * push;
      pz += dz * push;
    }
  }
  return { x: px, z: pz };
}

function obstacleGap(x: number, z: number): number {
  const room = clampRoom(x, z);
  if (room.x !== x || room.z !== z) return -1;
  let gap = 4;
  for (const spot of ERRAND_OBSTACLES) {
    const clear = Math.hypot(x - spot.x, z - spot.z) - spot.collider - NPC_BODY;
    if (clear < gap) gap = clear;
  }
  return gap;
}

function clampRoom(x: number, z: number): { x: number; z: number } {
  return {
    x: clamp(x, ROOM_INNER.minX + NPC_BODY, ROOM_INNER.maxX - NPC_BODY),
    z: clamp(z, ROOM_INNER.minZ + NPC_BODY, ROOM_INNER.maxZ - NPC_BODY),
  };
}

function pointSegmentDistance(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const abx = bx - ax;
  const abz = bz - az;
  const ab2 = abx * abx + abz * abz;
  const t = ab2 < 1e-8 ? 0 : clamp01(((px - ax) * abx + (pz - az) * abz) / ab2);
  return Math.hypot(ax + abx * t - px, az + abz * t - pz);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
