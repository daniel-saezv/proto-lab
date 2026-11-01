import { isMusicMuted } from "./ambience-music";

/** Mínimo entre dos rasguños. Barrer varias filas no dispara uno por fila. */
export const CHALK_MARK_GAP_MS = 400;

/**
 * Recortes distintos del mismo audio. Cada ruta va en su literal para que
 * `revision-audio` la reescriba al construir.
 */
export const CHALK_MARK_SRCS = [
  "/protos/audio/chalk-1.m4a",
  "/protos/audio/chalk-2.m4a",
  "/protos/audio/chalk-3.m4a",
] as const;

/** Pico de cada archivo cerca de −3 dB: 0,2 lo deja de fondo, sin tapar la música. */
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

/**
 * Elige un recorte al azar. Con más de uno, no devuelve el índice anterior.
 * `last` nulo (aún no ha sonado ninguno) puede salir cualquiera.
 */
export function pickChalkClip(count: number, last: number | null, random: () => number): number {
  if (count <= 1) return 0;
  const avoid = last != null && last >= 0 && last < count;
  const span = avoid ? count - 1 : count;
  let sample = Math.floor(random() * span);
  if (sample < 0) sample = 0;
  if (sample >= span) sample = span - 1;
  if (!avoid || last == null) return sample;
  return sample >= last ? sample + 1 : sample;
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
let buffers: AudioBuffer[] | null = null;
let loading: Promise<void> | null = null;
let failed = false;
let active: AudioBufferSourceNode | null = null;
let lastPlayedMs = Number.NEGATIVE_INFINITY;
let lastClip: number | null = null;
let pendingUntilMs = Number.NEGATIVE_INFINITY;
let gestureBound = false;

function nowClock(): number {
  if (typeof performance !== "undefined") return performance.now();
  return Date.now();
}

/** Descarga los recortes la primera vez que hace falta. En `?e2e=1` no se piden. */
function ensureBuffers(): void {
  if (buffers || failed || loading || !context || pageIsE2e()) return;
  const ctx = context;
  const srcs = CHALK_MARK_SRCS;
  loading = (async () => {
    const decoded = await Promise.all(
      srcs.map(async (src) => {
        const response = await fetch(src);
        if (!response.ok) throw new Error("tiza");
        const bytes = await response.arrayBuffer();
        return ctx.decodeAudioData(bytes.slice(0));
      }),
    );
    buffers = decoded;
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
  if (!context || !buffers || buffers.length === 0) return false;
  const index = pickChalkClip(buffers.length, lastClip, Math.random);
  const source = context.createBufferSource();
  source.buffer = buffers[index] ?? null;
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
  lastClip = index;
  lastPlayedMs = nowMs;
  return true;
}

/** Crea el contexto y empieza a bajar los recortes solo dentro de un gesto. */
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
  ensureBuffers();
}

/** Escucha el primer gesto. En `?e2e=1` no se engancha ni se descarga nada. */
export function ensureChalkMarkAudio(): void {
  if (gestureBound || typeof window === "undefined" || pageIsE2e()) return;
  gestureBound = true;
  window.addEventListener("pointerdown", armChalkAudio, { capture: true, passive: true });
  window.addEventListener("keydown", armChalkAudio, { capture: true });
}

/**
 * Un rasguño de tiza grabada, elegido al azar entre los recortes.
 * Si ya hay uno sonando, no se apila otro. Si aún no llegaron, se recuerda la petición.
 */
export function playChalkMark(nowMs: number): boolean {
  const e2e = pageIsE2e();
  const muted = musicIsMuted();
  if (e2e || muted) return false;
  const running = context != null && context.state === "running";
  if (!running || !buffers) {
    if (context) {
      ensureBuffers();
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
