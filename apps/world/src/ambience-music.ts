export const MUSIC_MUTE_KEY = "proto-lab:music-muted";

/**
 * Bajo /protos/ el service worker ya no precachea ni intercepta
 * (scripts/sw.mjs). Así cada pista se pide solo cuando va a sonar.
 */
export const AMBIENCE_TRACKS = [
  "/protos/audio/life-in-fragments.m4a",
  "/protos/audio/luanda.m4a",
  "/protos/audio/lemonade.m4a",
] as const;

const MASTER_LEVEL = 0.32;

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export function isMusicMuted(storage: Pick<StorageLike, "getItem">): boolean {
  return storage.getItem(MUSIC_MUTE_KEY) === "1";
}

export function persistMusicMuted(storage: Pick<StorageLike, "setItem">, muted: boolean): void {
  storage.setItem(MUSIC_MUTE_KEY, muted ? "1" : "0");
}

export function toggleMusicMuted(storage: StorageLike): boolean {
  const next = !isMusicMuted(storage);
  persistMusicMuted(storage, next);
  return next;
}

export function shufflePlaylist<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const next = items.slice();
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const swap = next[i]!;
    next[i] = next[j]!;
    next[j] = swap;
  }
  return next;
}

export function advanceTrack(index: number, length: number): number {
  if (length <= 0) return 0;
  return (index + 1) % length;
}

/** Graves en los 3 primeros bins; medios en los bins 4..11. Sin reservar objetos. */
export function writeBandEnergies(bins: ArrayLike<number>, out: { bass: number; mid: number }): void {
  let bass = 0;
  const bassCount = Math.min(3, bins.length);
  for (let i = 0; i < bassCount; i++) bass += bins[i] ?? 0;
  out.bass = bassCount > 0 ? bass / (bassCount * 255) : 0;
  let mid = 0;
  let midCount = 0;
  const midEnd = Math.min(12, bins.length);
  for (let i = 4; i < midEnd; i++) {
    mid += bins[i] ?? 0;
    midCount += 1;
  }
  out.mid = midCount > 0 ? mid / (midCount * 255) : 0;
}

export type MusicHandle = {
  setPaused: (paused: boolean) => void;
  isMuted: () => boolean;
  dispose: () => void;
};

const energy = { bass: 0, mid: 0 };
const rawBands = { bass: 0, mid: 0 };
let sampleEnergy: () => void = () => {
  energy.bass = 0;
  energy.mid = 0;
};

/** Graves y medios suavizados. Ceros si no suena o si el usuario pide menos movimiento. */
export function getMusicEnergy(): { bass: number; mid: number } {
  sampleEnergy();
  return energy;
}

/**
 * Lista en bucle, barajada una vez. Cada archivo se pide al empezar esa pista.
 * Nada suena hasta el primer gesto. El silencio queda en localStorage.
 */
export function createAmbienceMusic(button: HTMLButtonElement, storage: StorageLike = localStorage): MusicHandle {
  let muted = isMusicMuted(storage);
  let paused = false;
  let armed = false;
  let skips = 0;
  let trackIndex = 0;
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let analyser: AnalyserNode | null = null;
  let bins: Uint8Array<ArrayBuffer> | null = null;
  let audio: HTMLAudioElement | null = null;
  let order: string[] = [];
  let reducedQuery: MediaQueryList | null = null;

  function paint() {
    const sounding = !muted;
    button.setAttribute("aria-pressed", muted ? "true" : "false");
    button.setAttribute("aria-label", sounding ? "Silenciar música" : "Activar música");
    button.textContent = sounding ? "Silenciar" : "Activar";
    button.dataset.state = muted ? "muted" : "on";
  }

  function audible(): boolean {
    return armed && !muted && !paused && document.visibilityState === "visible";
  }

  function motionReduced(): boolean {
    if (typeof matchMedia !== "function") return false;
    if (!reducedQuery) reducedQuery = matchMedia("(prefers-reduced-motion: reduce)");
    return reducedQuery.matches;
  }

  function ramp(value: number, seconds: number) {
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.linearRampToValueAtTime(value, now + seconds);
  }

  function beginTrack() {
    if (!audio || !audible()) return;
    if (order.length === 0) order = shufflePlaylist(AMBIENCE_TRACKS);
    const url = order[trackIndex] ?? AMBIENCE_TRACKS[0];
    if (audio.getAttribute("src") !== url) audio.src = url;
    const pending = audio.play();
    if (pending) void pending.catch(onPlayFailure);
  }

  function skipTrack() {
    if (!audio || !audible()) return;
    skips += 1;
    if (skips > AMBIENCE_TRACKS.length) {
      audio.pause();
      return;
    }
    trackIndex = advanceTrack(trackIndex, order.length || AMBIENCE_TRACKS.length);
    beginTrack();
  }

  function onPlayFailure(error: unknown) {
    const name = error instanceof DOMException ? error.name : "";
    if (name === "NotAllowedError" || name === "AbortError") return;
    skipTrack();
  }

  function ensureGraph(): void {
    if (ctx) return;
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    try {
      ctx = new Ctx();
    } catch {
      ctx = null;
      return;
    }
    master = ctx.createGain();
    master.gain.value = 0;
    analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.72;
    bins = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
    audio = new Audio();
    audio.preload = "none";
    audio.loop = false;
    audio.hidden = true;
    audio.setAttribute("aria-hidden", "true");
    document.body.appendChild(audio);
    let source: MediaElementAudioSourceNode;
    try {
      source = ctx.createMediaElementSource(audio);
    } catch {
      audio.remove();
      audio = null;
      void ctx.close();
      ctx = null;
      analyser = null;
      bins = null;
      return;
    }
    source.connect(analyser);
    analyser.connect(master);
    master.connect(ctx.destination);
    audio.addEventListener("ended", () => {
      trackIndex = advanceTrack(trackIndex, order.length || AMBIENCE_TRACKS.length);
      beginTrack();
    });
    audio.addEventListener("error", () => {
      if (!audible()) return;
      skipTrack();
    });
    audio.addEventListener("playing", () => {
      skips = 0;
    });
    order = shufflePlaylist(AMBIENCE_TRACKS);
  }

  function sync(): void {
    if (!audible()) {
      ramp(0, 0.18);
      audio?.pause();
      return;
    }
    ensureGraph();
    if (!ctx || !master) return;
    void ctx.resume();
    ramp(MASTER_LEVEL, 0.45);
    if (!audio) return;
    if (!audio.getAttribute("src")) {
      beginTrack();
      return;
    }
    if (!audio.paused) return;
    const pending = audio.play();
    if (pending) void pending.catch(onPlayFailure);
  }

  function arm(): void {
    if (armed) return;
    armed = true;
    sync();
  }

  sampleEnergy = () => {
    if (!audible() || motionReduced() || !analyser || !bins) {
      energy.bass = 0;
      energy.mid = 0;
      return;
    }
    analyser.getByteFrequencyData(bins);
    writeBandEnergies(bins, rawBands);
    energy.bass += (rawBands.bass - energy.bass) * 0.22;
    energy.mid += (rawBands.mid - energy.mid) * 0.22;
  };

  const onPointer = () => arm();
  const onKey = () => arm();
  const onVisibility = () => sync();
  const onClick = () => {
    muted = toggleMusicMuted(storage);
    armed = true;
    paint();
    sync();
  };

  button.addEventListener("click", onClick);
  window.addEventListener("pointerdown", onPointer, { passive: true });
  window.addEventListener("keydown", onKey);
  document.addEventListener("visibilitychange", onVisibility);
  paint();

  return {
    setPaused(next: boolean) {
      paused = next;
      sync();
    },
    isMuted: () => muted,
    dispose() {
      button.removeEventListener("click", onClick);
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onVisibility);
      sampleEnergy = () => {
        energy.bass = 0;
        energy.mid = 0;
      };
      audio?.pause();
      audio?.remove();
      audio = null;
      void ctx?.close();
      ctx = null;
      master = null;
      analyser = null;
      bins = null;
    },
  };
}
