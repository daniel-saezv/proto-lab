/**
 * Fiesta de Gamu.
 * Gamu camina hacia la puerta. Un amigo con ánimo puede sujetarlo y devolverlo
 * a la pista; el ánimo se gasta y hay que relevar antes de que se suelte.
 * El bostezo lo acelera. Si cruza la puerta, se acaba la noche.
 */

export const FRIEND_IDS = ["mira", "teo", "nia"] as const;

export type FriendId = (typeof FRIEND_IDS)[number];

export type Role = "home" | "chase" | "hold" | "return";

export type Phase = "ready" | "play" | "over";

export type PartyEvent = "none" | "grab" | "handoff" | "tired" | "uncharged" | "left" | "hour";

export type YawnPhase = "calm" | "warning" | "yawn";

export type Friend = {
  id: FriendId;
  x: number;
  z: number;
  animo: number;
  role: Role;
};

export type State = {
  phase: Phase;
  time: number;
  score: number;
  combo: number;
  comboLeft: number;
  sleep: number;
  gamuX: number;
  gamuZ: number;
  friends: Friend[];
  holds: number;
  event: PartyEvent;
  eventSeq: number;
};

export type RosterEntry = {
  name: string;
  blurb: string;
  color: string;
  homeX: number;
  homeZ: number;
  charge: number;
  drain: number;
  startAnimo: number;
};

export const ROSTER: Record<FriendId, RosterEntry> = {
  mira: {
    name: "Mira",
    blurb: "rápida",
    color: "#ff5d8f",
    homeX: -1.1,
    homeZ: 2.85,
    charge: 0.52,
    drain: 0.36,
    startAnimo: 1,
  },
  teo: {
    name: "Teo",
    blurb: "aguanta",
    color: "#3ec6ff",
    homeX: 1.1,
    homeZ: 2.85,
    charge: 0.15,
    drain: 0.1,
    startAnimo: 0.16,
  },
  nia: {
    name: "Nia",
    blurb: "estable",
    color: "#ffd23f",
    homeX: 0,
    homeZ: 3.95,
    charge: 0.28,
    drain: 0.2,
    startAnimo: 0.82,
  },
};

export const TUNE = {
  dtMax: 0.05,
  minAnimo: 0.4,
  grabDrop: 1.75,
  holdReach: 0.38,
  friendSpeed: 5.15,
  returnSpeed: 3.7,
  rushSpeed: 1.18,
  gamuBase: 0.4,
  gamuSleep: 0.9,
  yawnSpeed: 1.72,
  pullSpeed: 2.45,
  settleRadius: 0.9,
  sleepGain: 2.05,
  sleepGainRamp: 0.04,
  yawnSleep: 1.35,
  sleepDrain: 12.5,
  scorePerSecond: 9,
  holdScorePerSecond: 16,
  grabScore: 30,
  handoffScore: 55,
  hourEvery: 30,
  hourScore: 150,
  hourRelief: 10,
  comboWindow: 2.7,
  maxCombo: 8,
  floorX: 0,
  floorZ: 3.15,
  floorRadius: 1.8,
  doorZ: -6.45,
  doorHalf: 1.15,
  roomMinX: -5.05,
  roomMaxX: 5.05,
  roomMinZ: -7.15,
  roomMaxZ: 5.15,
  yawnPeriod: 10,
  yawnWarn: 7.3,
  yawnAt: 8.55,
  gamuStartX: 0,
  gamuStartZ: -1.35,
  gamuStartSleep: 10,
} as const;

const SLOT: Record<FriendId, { x: number; z: number }> = {
  mira: { x: -0.64, z: 0.1 },
  teo: { x: 0.64, z: 0.1 },
  nia: { x: 0, z: 0.64 },
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clone(state: State): State {
  return {
    ...state,
    friends: state.friends.map((friend) => ({ ...friend })),
  };
}

function emit(state: State, event: PartyEvent): void {
  state.event = event;
  state.eventSeq += 1;
}

export function yawnPhase(time: number): YawnPhase {
  const t = ((time % TUNE.yawnPeriod) + TUNE.yawnPeriod) % TUNE.yawnPeriod;
  if (t >= TUNE.yawnAt) return "yawn";
  if (t >= TUNE.yawnWarn) return "warning";
  return "calm";
}

export function reachedDoor(x: number, z: number): boolean {
  return z <= TUNE.doorZ && Math.abs(x) <= TUNE.doorHalf;
}

export function canSend(friend: Friend): boolean {
  return friend.animo >= TUNE.minAnimo && (friend.role === "home" || friend.role === "return");
}

export function holdSlot(id: FriendId, gamuX: number, gamuZ: number): { x: number; z: number } {
  const offset = SLOT[id];
  return { x: gamuX + offset.x, z: gamuZ + offset.z };
}

function moveToward(x: number, z: number, targetX: number, targetZ: number, speed: number, dt: number): { x: number; z: number } {
  const dx = targetX - x;
  const dz = targetZ - z;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-5 || dist <= speed * dt) return { x: targetX, z: targetZ };
  const step = speed * dt;
  return { x: x + (dx / dist) * step, z: z + (dz / dist) * step };
}

export function createState(): State {
  return {
    phase: "ready",
    time: 0,
    score: 0,
    combo: 0,
    comboLeft: 0,
    sleep: TUNE.gamuStartSleep,
    gamuX: TUNE.gamuStartX,
    gamuZ: TUNE.gamuStartZ,
    friends: FRIEND_IDS.map((id) => {
      const spec = ROSTER[id];
      return { id, x: spec.homeX, z: spec.homeZ, animo: spec.startAnimo, role: "home" };
    }),
    holds: 0,
    event: "none",
    eventSeq: 0,
  };
}

export function start(state: State): State {
  if (state.phase !== "ready") return state;
  return { ...clone(state), phase: "play" };
}

export function restart(): State {
  return start(createState());
}

export function sendFriend(state: State, id: FriendId, x: number, z: number): State {
  if (state.phase !== "play") return state;
  if (!FRIEND_IDS.includes(id)) return state;
  if (Math.hypot(x - state.gamuX, z - state.gamuZ) > TUNE.grabDrop) return state;
  const current = state.friends.find((friend) => friend.id === id);
  if (!current || current.role === "chase" || current.role === "hold") return state;
  const next = clone(state);
  if (current.animo < TUNE.minAnimo) {
    emit(next, "uncharged");
    return next;
  }
  for (const other of next.friends) {
    if (other.id !== id && other.role === "chase") other.role = "return";
  }
  const friend = next.friends.find((item) => item.id === id);
  if (!friend) return state;
  friend.role = "chase";
  return next;
}

function beginHold(state: State, friend: Friend): void {
  for (const other of state.friends) {
    if (other !== friend && other.role === "hold") other.role = "return";
  }
  friend.role = "hold";
  const slot = holdSlot(friend.id, state.gamuX, state.gamuZ);
  friend.x = slot.x;
  friend.z = slot.z;
  state.holds += 1;
  const chained = state.combo > 0 && state.comboLeft > 0;
  state.combo = chained ? Math.min(TUNE.maxCombo, state.combo + 1) : 1;
  state.comboLeft = TUNE.comboWindow;
  state.score += (chained ? TUNE.handoffScore : TUNE.grabScore) * state.combo;
  emit(state, chained ? "handoff" : "grab");
}

export function step(state: State, dt: number): State {
  if (state.phase !== "play" || !(dt > 0)) return state;
  const capped = Math.min(dt, TUNE.dtMax);
  const prevTime = state.time;
  const s = clone(state);
  s.event = "none";
  s.time += capped;

  const rush = yawnPhase(s.time) === "calm" ? 1 : TUNE.rushSpeed;
  const speed = TUNE.friendSpeed * rush;

  for (const friend of s.friends) {
    if (friend.role !== "chase") continue;
    const slot = holdSlot(friend.id, s.gamuX, s.gamuZ);
    const moved = moveToward(friend.x, friend.z, slot.x, slot.z, speed, capped);
    friend.x = moved.x;
    friend.z = moved.z;
    if (Math.hypot(friend.x - slot.x, friend.z - slot.z) <= TUNE.holdReach) beginHold(s, friend);
  }

  let holding = false;
  for (const friend of s.friends) {
    if (friend.role !== "hold") continue;
    holding = true;
    friend.animo = Math.max(0, friend.animo - ROSTER[friend.id].drain * capped);
    if (friend.animo <= 0) {
      friend.animo = 0;
      friend.role = "return";
      holding = s.friends.some((other) => other.role === "hold");
      emit(s, "tired");
    }
  }

  const yawning = yawnPhase(s.time) === "yawn";
  if (holding) {
    const distFloor = Math.hypot(s.gamuX - TUNE.floorX, s.gamuZ - TUNE.floorZ);
    if (distFloor > TUNE.settleRadius) {
      const pulled = moveToward(s.gamuX, s.gamuZ, TUNE.floorX, TUNE.floorZ, TUNE.pullSpeed, capped);
      s.gamuX = pulled.x;
      s.gamuZ = pulled.z;
    }
    const drain = TUNE.sleepDrain * capped * (1 + s.combo * 0.08);
    s.sleep = Math.max(0, s.sleep - drain);
  } else {
    const targetZ = TUNE.doorZ - 0.4;
    const dx = -s.gamuX;
    const dz = targetZ - s.gamuZ;
    const dist = Math.hypot(dx, dz) || 1;
    const walk = (TUNE.gamuBase + TUNE.gamuSleep * (s.sleep / 100)) * (yawning ? TUNE.yawnSpeed : 1);
    s.gamuX += (dx / dist) * walk * capped;
    s.gamuZ += (dz / dist) * walk * capped;
    const gain = (TUNE.sleepGain + s.time * TUNE.sleepGainRamp) * (yawning ? TUNE.yawnSleep : 1);
    s.sleep = Math.min(100, s.sleep + gain * capped);
  }

  if (s.gamuZ < TUNE.doorZ && Math.abs(s.gamuX) > TUNE.doorHalf) s.gamuZ = TUNE.doorZ + 0.02;
  s.gamuX = clamp(s.gamuX, TUNE.roomMinX, TUNE.roomMaxX);
  s.gamuZ = clamp(s.gamuZ, TUNE.roomMinZ, TUNE.roomMaxZ);

  for (const friend of s.friends) {
    if (friend.role === "hold") {
      const slot = holdSlot(friend.id, s.gamuX, s.gamuZ);
      friend.x = slot.x;
      friend.z = slot.z;
    } else if (friend.role === "return") {
      const spec = ROSTER[friend.id];
      const moved = moveToward(friend.x, friend.z, spec.homeX, spec.homeZ, TUNE.returnSpeed, capped);
      friend.x = moved.x;
      friend.z = moved.z;
      if (Math.hypot(friend.x - spec.homeX, friend.z - spec.homeZ) < 0.08) {
        friend.role = "home";
        friend.x = spec.homeX;
        friend.z = spec.homeZ;
      }
    } else if (friend.role === "home") {
      friend.animo = Math.min(1, friend.animo + ROSTER[friend.id].charge * capped);
    }
    friend.x = clamp(friend.x, TUNE.roomMinX, TUNE.roomMaxX);
    friend.z = clamp(friend.z, TUNE.roomMinZ, TUNE.roomMaxZ);
    friend.animo = clamp(friend.animo, 0, 1);
  }

  if (reachedDoor(s.gamuX, s.gamuZ)) {
    s.phase = "over";
    emit(s, "left");
    return s;
  }

  const hoursBefore = Math.floor(prevTime / TUNE.hourEvery);
  const hoursAfter = Math.floor(s.time / TUNE.hourEvery);
  if (hoursAfter > hoursBefore && s.event === "none") {
    s.score += TUNE.hourScore * hoursAfter;
    s.sleep = Math.max(0, s.sleep - TUNE.hourRelief);
    emit(s, "hour");
  }

  const stillHolding = s.friends.some((friend) => friend.role === "hold");
  if (stillHolding) s.comboLeft = TUNE.comboWindow;
  else if (s.comboLeft > 0) {
    s.comboLeft = Math.max(0, s.comboLeft - capped);
    if (s.comboLeft === 0) s.combo = 0;
  }

  const mult = 1 + s.combo * 0.5;
  s.score += TUNE.scorePerSecond * capped * mult;
  if (stillHolding) s.score += TUNE.holdScorePerSecond * capped * mult;
  s.sleep = clamp(s.sleep, 0, 100);
  return s;
}
