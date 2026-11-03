import type { Mesh } from "three";
import type { DialogueCue } from "./dialogue-cues";
import { yawToward } from "./lounge-layout";

export type SofaGlanceNpc = {
  id: string;
  head: Mesh;
  restPitch: number;
  bodyYaw: number;
  x: number;
  z: number;
  /** Fase estable para desincronizar temporizadores. */
  phase: number;
};

export type SofaGlanceContext = {
  playerX: number;
  playerZ: number;
  playerStill: boolean;
  activeCue: DialogueCue | null;
  dialoguePulse: number;
  nearSlacker: boolean;
};

type GlanceState = "rest" | "turn" | "hold" | "return";

type RuntimeNpc = SofaGlanceNpc & {
  state: GlanceState;
  timer: number;
  hold: number;
  yaw: number;
  targetYaw: number;
  nextRandom: number;
};

export type SofaGlanceRuntime = {
  npcs: RuntimeNpc[];
  reduced: boolean;
  globalCooldown: number;
};

const MAX_HEAD_YAW = 0.62;
const GLANCE_RANGE = 3.4;
const STILL_RANGE = 2.85;

export function createSofaGlanceRuntime(npcs: SofaGlanceNpc[], reduced: boolean): SofaGlanceRuntime {
  return {
    reduced,
    globalCooldown: 0,
    npcs: npcs.map((npc, index) => ({
      ...npc,
      state: "rest",
      timer: 0,
      hold: 0,
      yaw: 0,
      targetYaw: 0,
      nextRandom: 6 + npc.phase * 2.3 + index * 1.7,
    })),
  };
}

/** Elige como mucho dos personajes; nunca la lista entera. */
export function pickGlanceIds(ids: string[], seed: number, max = 2): string[] {
  if (ids.length === 0) return [];
  const cap = Math.min(max, Math.max(1, ids.length - 1));
  const shuffled = [...ids];
  let s = Math.abs(Math.floor(seed)) || 1;
  for (let i = shuffled.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  const take = 1 + (s % cap);
  return shuffled.slice(0, take);
}

function cueForNpc(id: string): DialogueCue | null {
  if (id === "remolon") return "slouch";
  if (id === "brasa") return "smoke";
  if (id === "naipe") return "shuffle";
  if (id === "croquis") return "sketch";
  return null;
}

function headYawTowardPlayer(npc: RuntimeNpc, playerX: number, playerZ: number): number {
  const worldYaw = yawToward({ x: npc.x, z: npc.z }, { x: playerX, z: playerZ });
  let local = worldYaw - npc.bodyYaw;
  while (local > Math.PI) local -= Math.PI * 2;
  while (local < -Math.PI) local += Math.PI * 2;
  return Math.max(-MAX_HEAD_YAW, Math.min(MAX_HEAD_YAW, local * 0.72));
}

function beginGlance(runtime: SofaGlanceRuntime, ids: string[], playerX: number, playerZ: number) {
  const chosen = pickGlanceIds(ids, Math.floor(playerX * 17 + playerZ * 31));
  for (const npc of runtime.npcs) {
    if (!chosen.includes(npc.id)) continue;
    if (npc.state !== "rest") continue;
    npc.targetYaw = headYawTowardPlayer(npc, playerX, playerZ);
    npc.state = "turn";
    npc.timer = 0;
    npc.hold = 0.35 + npc.phase * 0.08;
  }
  runtime.globalCooldown = 2.4;
}

function eligibleNear(playerX: number, playerZ: number, npc: RuntimeNpc): boolean {
  return Math.hypot(playerX - npc.x, playerZ - npc.z) <= GLANCE_RANGE;
}

export function tickSofaGlances(runtime: SofaGlanceRuntime, time: number, dt: number, ctx: SofaGlanceContext) {
  if (runtime.reduced) {
    for (const npc of runtime.npcs) {
      npc.head.rotation.x = npc.restPitch;
      npc.head.rotation.y = 0;
    }
    return;
  }

  runtime.globalCooldown = Math.max(0, runtime.globalCooldown - dt);

  for (const npc of runtime.npcs) {
    npc.nextRandom -= dt;
  }

  if (runtime.globalCooldown <= 0) {
    const inRange = runtime.npcs.filter((npc) => eligibleNear(ctx.playerX, ctx.playerZ, npc));
    const stillNear = inRange.filter((npc) => Math.hypot(ctx.playerX - npc.x, ctx.playerZ - npc.z) <= STILL_RANGE);
    if (ctx.playerStill && stillNear.length > 0 && stillNear.every((npc) => npc.state === "rest")) {
      beginGlance(
        runtime,
        stillNear.map((npc) => npc.id),
        ctx.playerX,
        ctx.playerZ,
      );
    } else if (ctx.dialoguePulse > 0.2) {
      const talkers = runtime.npcs.filter((npc) => ctx.activeCue && cueForNpc(npc.id) === ctx.activeCue);
      if (talkers.length > 0) {
        beginGlance(
          runtime,
          talkers.map((npc) => npc.id),
          ctx.playerX,
          ctx.playerZ,
        );
      }
    } else if (ctx.nearSlacker && ctx.activeCue === "slouch") {
      beginGlance(runtime, ["remolon"], ctx.playerX, ctx.playerZ);
    }

    const randomReady = runtime.npcs.filter((npc) => npc.state === "rest" && npc.nextRandom <= 0);
    if (randomReady.length > 0 && Math.sin(time * 0.37 + randomReady[0]!.phase) > 0.55) {
      beginGlance(
        runtime,
        randomReady.map((npc) => npc.id),
        ctx.playerX,
        ctx.playerZ,
      );
      for (const npc of randomReady) npc.nextRandom = 9 + npc.phase * 3.5;
    }
  }

  for (const npc of runtime.npcs) {
    npc.head.rotation.x = npc.restPitch;
    const speed = 6.5;
    if (npc.state === "rest") {
      npc.yaw += (0 - npc.yaw) * Math.min(1, dt * speed);
      if (Math.abs(npc.yaw) < 0.002) npc.yaw = 0;
    } else if (npc.state === "turn") {
      npc.timer += dt;
      npc.yaw += (npc.targetYaw - npc.yaw) * Math.min(1, dt * speed * 1.4);
      if (Math.abs(npc.yaw - npc.targetYaw) < 0.03 || npc.timer > 0.45) {
        npc.state = "hold";
        npc.timer = 0;
      }
    } else if (npc.state === "hold") {
      npc.timer += dt;
      if (npc.timer >= npc.hold) npc.state = "return";
    } else if (npc.state === "return") {
      npc.yaw += (0 - npc.yaw) * Math.min(1, dt * speed);
      if (Math.abs(npc.yaw) < 0.02) {
        npc.yaw = 0;
        npc.state = "rest";
        npc.nextRandom = 7 + npc.phase * 2.8;
      }
    }
    npc.head.rotation.y = npc.yaw;
  }
}
