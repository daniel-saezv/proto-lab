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
  /** play() y resume() en el turno del gesto. Se puede llamar desde el joystick o el lienzo. */
  unlock: () => void;
  dispose: () => void;
};

/**
 * Un gesto solo cuenta si de verdad hay que llamar a play() y resume().
 * Si el intento anterior fue rechazado, el siguiente gesto vuelve a intentarlo.
 */
export function playbackAfterGesture(input: {
  muted: boolean;
  paused: boolean;
  visible: boolean;
  sounding: boolean;
}): { kick: boolean } {
  if (input.muted || input.paused || !input.visible || input.sounding) return { kick: false };
  return { kick: true };
}

export function playbackRejection(name: string): { retryOnNextGesture: boolean; skipTrack: boolean } {
  if (name === "NotAllowedError") return { retryOnNextGesture: true, skipTrack: false };
  if (name === "AbortError") return { retryOnNextGesture: false, skipTrack: false };
  return { retryOnNextGesture: false, skipTrack: true };
}

/**
 * En iOS, crear un MediaElementSource con el contexto suspendido deja la
 * salida muda aunque luego se reanude. Solo se enruta cuando ya corre.
 */
export function shouldRouteMediaElement(contextState: string): boolean {
  return contextState === "running";
}

export function playbackOutputLive(input: {
  mediaPaused: boolean;
  contextState: string;
  routed: boolean;
}): boolean {
  return !input.mediaPaused && input.contextState === "running" && input.routed;
}

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
  let sounded = false;
  let skips = 0;
  let trackIndex = 0;
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let analyser: AnalyserNode | null = null;
  let source: MediaElementAudioSourceNode | null = null;
  let sourceFailed = false;
  let bins: Uint8Array<ArrayBuffer> | null = null;
  let audio: HTMLAudioElement | null = null;
  let order: string[] = [];
  let reducedQuery: MediaQueryList | null = null;
  let playGeneration = 0;

  function paint() {
    const sounding = !muted;
    button.setAttribute("aria-pressed", muted ? "true" : "false");
    button.setAttribute("aria-label", sounding ? "Silenciar música" : "Activar música");
    button.textContent = sounding ? "Silenciar" : "Activar";
    button.dataset.state = muted ? "muted" : "on";
    paintPlayback();
  }

  function paintPlayback() {
    const state = muted ? "muted" : sounded ? "playing" : armed ? "waiting" : "idle";
    button.dataset.playback = state;
  }

  function wantsAudio(): boolean {
    return !muted && !paused && document.visibilityState === "visible";
  }

  function audible(): boolean {
    return armed && wantsAudio();
  }

  function routed(): boolean {
    return !!source || sourceFailed;
  }

  function outputLive(): boolean {
    return sounded && !!audio && playbackOutputLive({
      mediaPaused: audio.paused,
      contextState: ctx?.state ?? "none",
      routed: routed(),
    });
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

  function notePlayback() {
    if (!audio) return;
    const live = playbackOutputLive({
      mediaPaused: audio.paused,
      contextState: ctx?.state ?? "none",
      routed: routed(),
    });
    if (!live) return;
    sounded = true;
    paintPlayback();
  }

  function beginTrack() {
    if (!audio || !audible()) return;
    if (order.length === 0) order = shufflePlaylist(AMBIENCE_TRACKS);
    const url = order[trackIndex] ?? AMBIENCE_TRACKS[0];
    if (audio.getAttribute("src") !== url) audio.src = url;
    if (!source && !sourceFailed) audio.volume = MASTER_LEVEL;
    // play() tiene que llamarse en el mismo turno del gesto, sin await delante.
    const generation = ++playGeneration;
    const pending = audio.play();
    if (pending) {
      void pending.then(() => {
        if (generation !== playGeneration) return;
        notePlayback();
      }).catch((error: unknown) => {
        if (generation !== playGeneration) return;
        onPlayFailure(error);
      });
    }
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
    sounded = false;
    paintPlayback();
    const name = error instanceof DOMException ? error.name : "";
    const decision = playbackRejection(name);
    if (decision.skipTrack) skipTrack();
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
    analyser.connect(master);
    master.connect(ctx.destination);
    audio = new Audio();
    audio.preload = "none";
    audio.loop = false;
    audio.hidden = true;
    audio.volume = 0;
    audio.setAttribute("playsinline", "");
    audio.setAttribute("webkit-playsinline", "");
    audio.setAttribute("aria-hidden", "true");
    document.body.appendChild(audio);
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
      notePlayback();
    });
    audio.addEventListener("pause", () => {
      sounded = false;
      paintPlayback();
    });
    ctx.addEventListener("statechange", onContextState);
    order = shufflePlaylist(AMBIENCE_TRACKS);
  }

  /** Enruta el elemento solo con el contexto en marcha, para no dejar iOS mudo. */
  function connectElement(): void {
    if (source || sourceFailed || !ctx || !audio || !analyser) return;
    if (!shouldRouteMediaElement(ctx.state)) return;
    try {
      source = ctx.createMediaElementSource(audio);
    } catch {
      sourceFailed = true;
      audio.volume = MASTER_LEVEL;
      return;
    }
    source.connect(analyser);
    audio.volume = 1;
  }

  function onContextState(): void {
    if (!ctx || ctx.state === "closed") return;
    if (ctx.state !== "running") {
      sounded = false;
      paintPlayback();
      return;
    }
    // Conectar aquí, sin otro play(): un play() en la promesa queda fuera del gesto
    // y en iOS aborta el que sí era válido.
    connectElement();
    notePlayback();
  }

  function silence(): void {
    playGeneration += 1;
    ramp(0, 0.18);
    if (audio && !audio.paused) audio.pause();
    sounded = false;
    paintPlayback();
  }

  /**
   * resume() y play() en este mismo turno, sin await delante.
   * No se vuelve a llamar a play() cuando el contexto pasa a running: esa
   * llamada ya no es el gesto y en iOS aborta el arranque. El siguiente
   * gesto reintenta si todavía no suena.
   */
  function startOutput(): void {
    if (!wantsAudio()) {
      silence();
      return;
    }
    ensureGraph();
    if (!ctx || !master || !audio) return;
    // resume() y play() en este turno, antes de cualquier await.
    void ctx.resume().catch(() => {});
    ramp(MASTER_LEVEL, 0.2);
    connectElement();
    if (!audio.paused && !!audio.getAttribute("src") && playbackOutputLive({
      mediaPaused: false,
      contextState: ctx.state,
      routed: routed(),
    })) {
      sounded = true;
      paintPlayback();
      return;
    }
    beginTrack();
  }

  function unlock(): void {
    const decision = playbackAfterGesture({
      muted,
      paused,
      visible: document.visibilityState === "visible",
      sounding: outputLive(),
    });
    if (!decision.kick) return;
    armed = true;
    startOutput();
  }

  function sync(): void {
    if (!wantsAudio()) {
      silence();
      return;
    }
    if (!armed) return;
    startOutput();
  }

  function onUserGesture(event: Event): void {
    if (event.target instanceof Element && event.target.closest("#mute-music")) return;
    unlock();
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

  const onVisibility = () => {
    if (document.visibilityState !== "visible") {
      silence();
      return;
    }
    sync();
  };
  const onClick = () => {
    muted = toggleMusicMuted(storage);
    armed = true;
    paint();
    if (wantsAudio()) startOutput();
    else silence();
  };

  button.addEventListener("click", onClick);
  // Captura en window: el joystick y el lienzo no pueden tragarse el gesto
  // con stopPropagation, y iOS solo activa el audio en el turno de estos eventos.
  const unlockCapture: AddEventListenerOptions = { capture: true };
  window.addEventListener("pointerup", onUserGesture, unlockCapture);
  window.addEventListener("touchend", onUserGesture, unlockCapture);
  window.addEventListener("click", onUserGesture, unlockCapture);
  window.addEventListener("keydown", onUserGesture, unlockCapture);
  document.addEventListener("visibilitychange", onVisibility);
  paint();

  return {
    setPaused(next: boolean) {
      paused = next;
      sync();
    },
    isMuted: () => muted,
    unlock,
    dispose() {
      button.removeEventListener("click", onClick);
      const unlockCapture: AddEventListenerOptions = { capture: true };
      window.removeEventListener("pointerup", onUserGesture, unlockCapture);
      window.removeEventListener("touchend", onUserGesture, unlockCapture);
      window.removeEventListener("click", onUserGesture, unlockCapture);
      window.removeEventListener("keydown", onUserGesture, unlockCapture);
      document.removeEventListener("visibilitychange", onVisibility);
      sampleEnergy = () => {
        energy.bass = 0;
        energy.mid = 0;
      };
      audio?.pause();
      audio?.remove();
      audio = null;
      if (ctx) ctx.removeEventListener("statechange", onContextState);
      void ctx?.close();
      ctx = null;
      source = null;
      master = null;
      analyser = null;
      bins = null;
    },
  };
}
