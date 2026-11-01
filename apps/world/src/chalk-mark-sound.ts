import { isMusicMuted } from "./ambience-music";

/** Mínimo entre dos rasguños. Barrer varias filas no dispara uno por fila. */
export const CHALK_MARK_GAP_MS = 400;

/** Un solo clip, mono y corto. `revision-audio` reescribe esta URL al construir. */
export const CHALK_MARK_SRC = "/protos/audio/chalk.m4a";

/** Pico del archivo cerca de −3 dB: 0,2 lo deja de fondo, sin tapar la música. */
export const CHALK_MARK_VOLUME = 0.2;

/** Si el clip aún no está decodificado, se recuerda la petición este tiempo. */
const CHALK_MARK_PENDING_MS = 900;

export function shouldPlayChalkMark(input: {
  e2e: boolean;
  muted: boolean;
  ready: boolean;
  playing: boolean;
  nowMs: number;
  lastPlayedMs: number;
}): boolean {
  if (input.e2e || input.muted || !input.ready || input.playing) return false;
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
let buffer: AudioBuffer | null = null;
let loading: Promise<void> | null = null;
let failed = false;
let active: AudioBufferSourceNode | null = null;
let lastPlayedMs = Number.NEGATIVE_INFINITY;
let pendingUntilMs = Number.NEGATIVE_INFINITY;
let gestureBound = false;

function nowClock(): number {
  if (typeof performance !== "undefined") return performance.now();
  return Date.now();
}

/** Descarga el clip la primera vez que hace falta. En `?e2e=1` no se pide. */
function ensureBuffer(): void {
  if (buffer || failed || loading || !context || pageIsE2e()) return;
  const ctx = context;
  loading = (async () => {
    const response = await fetch(CHALK_MARK_SRC);
    if (!response.ok) throw new Error("tiza");
    const bytes = await response.arrayBuffer();
    const decoded = await ctx.decodeAudioData(bytes.slice(0));
    buffer = decoded;
    flushPending();
  })().catch(() => {
    failed = true;
    loading = null;
  });
}

function rememberPending(nowMs: number): void {
  if (active != null) return;
  pendingUntilMs = Math.max(pendingUntilMs, nowMs + CHALK_MARK_PENDING_MS);
}

function flushPending(): void {
  if (nowClock() <= pendingUntilMs) playChalkMark(nowClock());
}

function startScratch(nowMs: number): boolean {
  if (!context || !buffer) return false;
  const source = context.createBufferSource();
  source.buffer = buffer;
  const gain = context.createGain();
  gain.gain.value = CHALK_MARK_VOLUME;
  source.connect(gain);
  gain.connect(context.destination);
  source.onended = () => {
    if (active === source) active = null;
  };
  active = source;
  try {
    source.start();
  } catch {
    active = null;
    return false;
  }
  lastPlayedMs = nowMs;
  return true;
}

/** Crea el contexto y empieza a bajar el clip solo dentro de un gesto. */
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
  if (context.state === "suspended") void context.resume().then(() => flushPending());
  ensureBuffer();
}

/** Escucha el primer gesto. En `?e2e=1` no se engancha ni se descarga el clip. */
export function ensureChalkMarkAudio(): void {
  if (gestureBound || typeof window === "undefined" || pageIsE2e()) return;
  gestureBound = true;
  window.addEventListener("pointerdown", armChalkAudio, { capture: true, passive: true });
  window.addEventListener("keydown", armChalkAudio, { capture: true });
}

/**
 * Un rasguño de tiza grabada.
 * Si ya hay uno sonando, no se apila otro. Si el clip aún no llegó, se recuerda la petición.
 */
export function playChalkMark(nowMs: number): boolean {
  const e2e = pageIsE2e();
  const muted = musicIsMuted();
  if (e2e || muted) return false;
  const running = context != null && context.state === "running";
  if (!running || !buffer) {
    if (context) {
      ensureBuffer();
      rememberPending(nowMs);
    }
    return false;
  }
  if (
    !shouldPlayChalkMark({
      e2e,
      muted,
      ready: true,
      playing: active != null,
      nowMs,
      lastPlayedMs,
    })
  ) {
    return false;
  }
  return startScratch(nowMs);
}
