import { isMusicMuted } from "./ambience-music";

/** Mínimo entre dos rasguños. Barrer varias filas no dispara uno por fila. */
export const CHALK_MARK_GAP_MS = 400;

export type ChalkScratchShape = {
  durationSec: number;
  frequencyHz: number;
  q: number;
  peak: number;
};

/** Ruido corto: el tono y la duración varían un poco; el pico se queda bajo. */
export function chalkScratchShape(random: () => number): ChalkScratchShape {
  return {
    durationSec: 0.04 + random() * 0.045,
    frequencyHz: 1500 + random() * 2100,
    q: 0.55 + random() * 0.7,
    peak: 0.055 + random() * 0.03,
  };
}

export function shouldPlayChalkMark(input: {
  e2e: boolean;
  muted: boolean;
  contextRunning: boolean;
  nowMs: number;
  lastPlayedMs: number;
}): boolean {
  if (input.e2e || input.muted || !input.contextRunning) return false;
  if (input.nowMs - input.lastPlayedMs < CHALK_MARK_GAP_MS) return false;
  return true;
}

function pageIsE2e(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("e2e") === "1";
}

function musicIsMuted(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return isMusicMuted(localStorage);
  } catch {
    return false;
  }
}

type AudioCtor = typeof AudioContext;

function audioContextCtor(): AudioCtor | null {
  if (typeof window === "undefined") return null;
  const legacy = (window as Window & { webkitAudioContext?: AudioCtor }).webkitAudioContext;
  return window.AudioContext ?? legacy ?? null;
}

let context: AudioContext | null = null;
let lastPlayedMs = Number.NEGATIVE_INFINITY;
let gestureBound = false;

function scratch(ctx: AudioContext, random: () => number): void {
  const shape = chalkScratchShape(random);
  const frames = Math.max(1, Math.floor(ctx.sampleRate * shape.durationSec));
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i += 1) data[i] = random() * 2 - 1;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = shape.frequencyHz;
  filter.Q.value = shape.q;
  const gain = ctx.createGain();
  const now = ctx.currentTime;
  const peak = shape.peak;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(peak, now + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + shape.durationSec);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start(now);
  source.stop(now + shape.durationSec + 0.02);
}

/** Crea el contexto solo dentro de un gesto. Si sigue suspendido, aún no suena. */
function armChalkAudio(): void {
  if (pageIsE2e()) return;
  const Ctor = audioContextCtor();
  if (!Ctor) return;
  if (!context) {
    try {
      context = new Ctor();
    } catch {
      return;
    }
  }
  if (context.state === "suspended") void context.resume();
}

/** Escucha el primer gesto. En `?e2e=1` no se engancha. */
export function ensureChalkMarkAudio(): void {
  if (gestureBound || typeof window === "undefined" || pageIsE2e()) return;
  gestureBound = true;
  window.addEventListener("pointerdown", armChalkAudio, { capture: true, passive: true });
  window.addEventListener("keydown", armChalkAudio, { capture: true });
}

/** Suena si el contexto ya corre, la música no está silenciada y pasó el intervalo. */
export function playChalkMark(nowMs: number): boolean {
  const running = context != null && context.state === "running";
  if (
    !shouldPlayChalkMark({
      e2e: pageIsE2e(),
      muted: musicIsMuted(),
      contextRunning: running,
      nowMs,
      lastPlayedMs,
    })
  ) {
    return false;
  }
  if (!context) return false;
  lastPlayedMs = nowMs;
  try {
    scratch(context, Math.random);
  } catch {
    return false;
  }
  return true;
}
