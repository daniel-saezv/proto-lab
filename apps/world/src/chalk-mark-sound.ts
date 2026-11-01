import { isMusicMuted } from "./ambience-music";

/** Mínimo entre dos rasguños. Barrer varias filas no dispara uno por fila. */
export const CHALK_MARK_GAP_MS = 400;

/** El único recorte: la escritura seguida. `revision-audio` reescribe esta URL. */
export const CHALK_MARK_SRC = "/protos/audio/chalk-2.m4a";

/** Pico del archivo cerca de −3 dB: 0,2 lo deja de fondo, sin tapar la música. */
export const CHALK_MARK_VOLUME = 0.2;

/** Si el clip aún no está decodificado, se recuerda la petición este tiempo. */
const CHALK_MARK_PENDING_MS = 900;

/**
 * Variaciones del mismo buffer, en el reproductor.
 * Tono, volumen, brillo y el trozo que se oye cambian poco: sigue siendo esa tiza.
 */
export type ChalkTake = {
  rate: number;
  /** Multiplica `CHALK_MARK_VOLUME`. */
  gain: number;
  /** Segundos dentro del buffer. */
  offset: number;
  /** Segundos del buffer que se reproducen, antes del tono. */
  duration: number;
  /** Paso bajo en hercios. Alto deja el grano; más bajo apaga un poco el agudo. */
  lowpass: number;
};

export const CHALK_TAKES: readonly ChalkTake[] = [
  { rate: 1, gain: 1, offset: 0, duration: 0.34, lowpass: 12000 },
  { rate: 0.97, gain: 0.88, offset: 0.02, duration: 0.3, lowpass: 5200 },
  { rate: 1.04, gain: 0.96, offset: 0.05, duration: 0.24, lowpass: 9800 },
  { rate: 1.01, gain: 0.84, offset: 0.09, duration: 0.22, lowpass: 7000 },
  { rate: 0.95, gain: 0.92, offset: 0, duration: 0.27, lowpass: 6000 },
];

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
 * Elige una variación al azar. Con más de una, no devuelve el índice anterior.
 * `last` nulo (aún no ha sonado ninguna) puede salir cualquiera.
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

/** Recorta la variación a lo que dura el buffer, con un mínimo oíble. */
export function chalkTakeWindow(take: ChalkTake, bufferSeconds: number): { offset: number; duration: number } {
  const length = Math.max(0, bufferSeconds);
  if (length <= 0.08) return { offset: 0, duration: length };
  const offset = Math.min(Math.max(0, take.offset), length - 0.08);
  const duration = Math.min(Math.max(0.08, take.duration), length - offset);
  return { offset, duration };
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
let filter: BiquadFilterNode | null = null;
let gain: GainNode | null = null;
let loading: Promise<void> | null = null;
let failed = false;
let active: AudioBufferSourceNode | null = null;
let lastPlayedMs = Number.NEGATIVE_INFINITY;
let lastTake: number | null = null;
let pendingUntilMs = Number.NEGATIVE_INFINITY;
let gestureBound = false;

function nowClock(): number {
  if (typeof performance !== "undefined") return performance.now();
  return Date.now();
}

/** Descarga el recorte la primera vez que hace falta. En `?e2e=1` no se pide. */
function ensureBuffer(): void {
  if (buffer || failed || loading || !context || pageIsE2e()) return;
  const ctx = context;
  loading = (async () => {
    const response = await fetch(CHALK_MARK_SRC);
    if (!response.ok) throw new Error("tiza");
    const bytes = await response.arrayBuffer();
    buffer = await ctx.decodeAudioData(bytes.slice(0));
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

function outputChain(ctx: AudioContext): { filter: BiquadFilterNode; gain: GainNode } {
  if (!gain) {
    gain = ctx.createGain();
    gain.connect(ctx.destination);
  }
  if (!filter) {
    filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 0.7;
    filter.connect(gain);
  }
  return { filter, gain };
}

function startScratch(nowMs: number): boolean {
  if (!context || !buffer) return false;
  const index = pickChalkClip(CHALK_TAKES.length, lastTake, Math.random);
  const take = CHALK_TAKES[index];
  if (!take) return false;
  const { offset, duration } = chalkTakeWindow(take, buffer.duration);
  const played = duration / take.rate;
  const chain = outputChain(context);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = take.rate;
  chain.filter.frequency.value = take.lowpass;
  source.connect(chain.filter);
  const level = CHALK_MARK_VOLUME * take.gain;
  const when = context.currentTime;
  const fadeIn = 0.012;
  const fadeOut = Math.min(0.045, played * 0.28);
  const release = Math.max(fadeIn + 0.02, played - fadeOut);
  chain.gain.gain.cancelScheduledValues(when);
  chain.gain.gain.setValueAtTime(0, when);
  chain.gain.gain.linearRampToValueAtTime(level, when + fadeIn);
  chain.gain.gain.linearRampToValueAtTime(level, when + release);
  chain.gain.gain.linearRampToValueAtTime(0, when + Math.max(played, release + 0.02));
  source.onended = () => {
    if (active === source) active = null;
    source.disconnect();
  };
  active = source;
  try {
    source.start(when, offset, duration);
  } catch {
    active = null;
    source.disconnect();
    return false;
  }
  lastTake = index;
  lastPlayedMs = nowMs;
  return true;
}

/** Crea el contexto y empieza a bajar el recorte solo dentro de un gesto. */
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

/** Escucha el primer gesto. En `?e2e=1` no se engancha ni se descarga nada. */
export function ensureChalkMarkAudio(): void {
  if (gestureBound || typeof window === "undefined" || pageIsE2e()) return;
  gestureBound = true;
  window.addEventListener("pointerdown", armChalkAudio, { capture: true, passive: true });
  window.addEventListener("keydown", armChalkAudio, { capture: true });
}

/**
 * Un rasguño de la escritura seguida, con una variación distinta a la anterior.
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
