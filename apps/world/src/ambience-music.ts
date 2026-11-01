export const MUSIC_MUTE_KEY = "proto-lab:music-muted";

/**
 * Una sola pista, en bucle. El service worker no precachea `/protos/`
 * (scripts/sw.mjs). `prime()` la pide cuando el chunk del mundo ya está
 * en marcha, para no competir con ese JS. `play()` sigue en el primer gesto.
 */
export const AMBIENCE_TRACK = "/protos/audio/luanda.m4a";

/** Subida al empezar a sonar. */
export const MUSIC_FADE_IN_S = 1.4;
/** Bajada al parar, pausar o silenciar. */
export const MUSIC_FADE_OUT_S = 0.8;
/**
 * La cola de Luanda queda casi en silencio (~0,2 s) antes del corte.
 * El bucle solapa ese tramo con el ataque del tema.
 */
export const LOOP_CROSSFADE_S = 0.45;

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

/** Segundos de solape. Nunca más de la mitad del tema. */
export function loopOverlapSeconds(duration: number, crossfade = LOOP_CROSSFADE_S): number {
  if (!(duration > 0)) return 0;
  return Math.min(crossfade, duration / 2);
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
  /** Empieza la descarga de la pista. No bloquea el primer fotogramo. */
  prime: () => void;
  /** Fundido, parada y liberación de la pista mientras un prototipo ocupa el overlay. */
  releasePlayback: () => void;
  /** Vuelve a cargar y sonar tras cerrar el prototipo si el usuario no la silenció. */
  restorePlayback: () => void;
  dispose: () => void;
};

/** Si conviene reanudar Luanda al cerrar el overlay del prototipo. */
export function shouldResumeLobbyMusic(input: {
  muted: boolean;
  paused: boolean;
  visible: boolean;
}): boolean {
  if (input.muted || input.paused || !input.visible) return false;
  return true;
}

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

/** Tipos de evento que desbloquean audio en window (captura). */
export const AUDIO_UNLOCK_POINTER_DOWN = "pointerdown" as const;
export const AUDIO_UNLOCK_TOUCH_START = "touchstart" as const;
export const AUDIO_UNLOCK_POINTER_UP = "pointerup" as const;
export const AUDIO_UNLOCK_TOUCH_END = "touchend" as const;
export const AUDIO_UNLOCK_CLICK = "click" as const;
export const AUDIO_UNLOCK_KEY_DOWN = "keydown" as const;

const AUDIO_UNLOCK_TYPES = new Set<string>([
  AUDIO_UNLOCK_POINTER_DOWN,
  AUDIO_UNLOCK_TOUCH_START,
  AUDIO_UNLOCK_POINTER_UP,
  AUDIO_UNLOCK_TOUCH_END,
  AUDIO_UNLOCK_CLICK,
  AUDIO_UNLOCK_KEY_DOWN,
]);

/**
 * WebKit concede activación de usuario en touchstart/pointerdown y en
 * touchend/pointerup/click, no en touchmove/pointermove. El joystick mantiene
 * el dedo apoyado: escuchar solo el final deja la música en espera hasta soltar.
 */
export function isAudioUnlockEventType(type: string): boolean {
  return AUDIO_UNLOCK_TYPES.has(type);
}

export function shouldIgnoreAudioUnlockTarget(target: EventTarget | null): boolean {
  if (target == null || typeof target !== "object") return false;
  const closest = (target as { closest?: (selector: string) => Element | null }).closest;
  if (typeof closest !== "function") return false;
  return Boolean(closest.call(target, "#mute-music"));
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

type LoopVoice = {
  source: AudioBufferSourceNode;
  gain: GainNode;
  when: number;
  offset: number;
};

/**
 * Luanda en bucle, con fundido al entrar y al salir.
 * Nada suena hasta el primer gesto. El silencio queda en localStorage.
 * Al abrir un prototipo se libera la pista (`releasePlayback`); al cerrar vuelve si procede.
 */
export function createAmbienceMusic(button: HTMLButtonElement, storage: StorageLike = localStorage): MusicHandle {
  let muted = isMusicMuted(storage);
  let paused = false;
  let heldForPrototype = false;
  let releaseGeneration = 0;
  let armed = false;
  let sounded = false;
  let primed = false;
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let analyser: AnalyserNode | null = null;
  let source: MediaElementAudioSourceNode | null = null;
  let elementGain: GainNode | null = null;
  let sourceFailed = false;
  let bins: Uint8Array<ArrayBuffer> | null = null;
  let audio: HTMLAudioElement | null = null;
  let reducedQuery: MediaQueryList | null = null;
  let playGeneration = 0;
  let buffer: AudioBuffer | null = null;
  let pendingBytes: ArrayBuffer | null = null;
  let bytesPromise: Promise<void> | null = null;
  let decoding = false;
  let usingBuffer = false;
  let loopVoices: LoopVoice[] = [];
  let loopTimer: number | null = null;
  let stopTimer: number | null = null;
  let resumeOffset = 0;

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
    return !muted && !paused && !heldForPrototype && document.visibilityState === "visible";
  }

  function audible(): boolean {
    return armed && wantsAudio();
  }

  function routed(): boolean {
    return !!source || sourceFailed;
  }

  function bufferLive(): boolean {
    return usingBuffer && loopVoices.length > 0 && ctx?.state === "running";
  }

  function outputLive(): boolean {
    if (bufferLive()) return true;
    return !!audio && playbackOutputLive({
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
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(value, now + seconds);
  }

  function notePlayback() {
    if (!outputLive()) return;
    sounded = true;
    paintPlayback();
  }

  function cancelStop() {
    if (stopTimer == null) return;
    window.clearTimeout(stopTimer);
    stopTimer = null;
  }

  function clearLoopTimer() {
    if (loopTimer == null) return;
    window.clearTimeout(loopTimer);
    loopTimer = null;
  }

  function stopLoopVoices() {
    usingBuffer = false;
    clearLoopTimer();
    for (const voice of loopVoices) {
      voice.source.onended = null;
      try {
        voice.source.stop();
      } catch {
        // Ya estaba parada.
      }
      voice.gain.disconnect();
    }
    loopVoices = [];
  }

  function captureOffset(): number {
    if (usingBuffer && ctx && buffer) {
      const now = ctx.currentTime;
      let best: LoopVoice | null = null;
      for (const voice of loopVoices) {
        if (voice.when <= now + 0.001 && (!best || voice.when > best.when)) best = voice;
      }
      if (best) {
        const pos = best.offset + (now - best.when);
        const dur = buffer.duration;
        return ((pos % dur) + dur) % dur;
      }
    }
    if (audio && Number.isFinite(audio.currentTime)) return audio.currentTime;
    return resumeOffset;
  }

  function placeVoice(when: number, offset: number, fadeIn: boolean) {
    if (!ctx || !buffer || !analyser) return;
    const startAt = Math.max(when, ctx.currentTime);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    src.connect(gain);
    gain.connect(analyser);
    const dur = buffer.duration;
    const remaining = Math.max(0.05, dur - offset);
    const fade = Math.min(loopOverlapSeconds(dur), remaining / 2);
    const end = startAt + remaining;
    const fadeOutAt = Math.max(startAt, end - fade);
    src.start(startAt, Math.min(offset, Math.max(0, dur - 0.05)));
    src.stop(end + 0.03);
    gain.gain.setValueAtTime(fadeIn ? 0.0001 : 1, startAt);
    if (fadeIn) gain.gain.linearRampToValueAtTime(1, startAt + fade);
    gain.gain.linearRampToValueAtTime(1, fadeOutAt);
    gain.gain.linearRampToValueAtTime(0.0001, end);
    const voice: LoopVoice = { source: src, gain, when: startAt, offset };
    loopVoices.push(voice);
    src.onended = () => {
      const index = loopVoices.indexOf(voice);
      if (index >= 0) loopVoices.splice(index, 1);
      gain.disconnect();
    };
  }

  function armChain() {
    if (!ctx || !buffer || !usingBuffer) return;
    clearLoopTimer();
    const waitMs = Math.max(0, (resumeNextAt() - ctx.currentTime) * 1000);
    loopTimer = window.setTimeout(() => {
      loopTimer = null;
      if (!usingBuffer || !ctx || !buffer || !audible()) return;
      const when = Math.max(ctx.currentTime + 0.05, scheduledAt);
      placeVoice(when, 0, true);
      scheduledAt = when + buffer.duration - loopOverlapSeconds(buffer.duration);
      armChain();
    }, waitMs);
  }

  let scheduledAt = 0;

  function resumeNextAt(): number {
    return scheduledAt - 0.5;
  }

  function startLooped(offset: number) {
    if (!ctx || !buffer) return;
    stopLoopVoices();
    usingBuffer = true;
    const now = ctx.currentTime;
    const overlap = loopOverlapSeconds(buffer.duration);
    const clamped = ((offset % buffer.duration) + buffer.duration) % buffer.duration;
    placeVoice(now, clamped, false);
    scheduledAt = now + (buffer.duration - clamped) - overlap;
    placeVoice(scheduledAt, 0, true);
    scheduledAt += buffer.duration - overlap;
    armChain();
  }

  function quietElement() {
    if (!audio) return;
    if (elementGain && ctx) {
      const now = ctx.currentTime;
      elementGain.gain.cancelScheduledValues(now);
      elementGain.gain.setValueAtTime(elementGain.gain.value, now);
      elementGain.gain.linearRampToValueAtTime(0, now + 0.2);
    } else {
      audio.volume = 0;
    }
    const generation = playGeneration;
    window.setTimeout(() => {
      if (generation !== playGeneration || !usingBuffer) return;
      if (audio && !audio.paused) audio.pause();
    }, 220);
  }

  function beginElement() {
    if (!audio || !audible() || usingBuffer) return;
    if (!audio.getAttribute("src")) audio.src = AMBIENCE_TRACK;
    audio.loop = true;
    if (elementGain) elementGain.gain.setValueAtTime(1, ctx?.currentTime ?? 0);
    if (!source && !sourceFailed) audio.volume = MASTER_LEVEL;
    else audio.volume = 1;
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

  function onPlayFailure(error: unknown) {
    sounded = false;
    paintPlayback();
    const name = error instanceof DOMException ? error.name : "";
    if (playbackRejection(name).skipTrack) audio?.pause();
  }

  function ensureAudioElement(): HTMLAudioElement | null {
    if (audio) return audio;
    if (typeof document === "undefined") return null;
    audio = new Audio();
    audio.preload = "none";
    audio.loop = true;
    audio.hidden = true;
    audio.volume = 0;
    audio.setAttribute("playsinline", "");
    audio.setAttribute("webkit-playsinline", "");
    audio.setAttribute("aria-hidden", "true");
    document.body.appendChild(audio);
    audio.addEventListener("ended", () => {
      if (usingBuffer || !audible()) return;
      beginElement();
    });
    audio.addEventListener("error", () => {
      if (!audible() || usingBuffer) return;
      sounded = false;
      paintPlayback();
      audio?.pause();
    });
    audio.addEventListener("playing", () => {
      performance.mark?.("proto:audio-playing");
      notePlayback();
    });
    audio.addEventListener("canplay", () => {
      performance.mark?.("proto:audio-canplay");
    });
    audio.addEventListener("progress", () => {
      tryCaptureBytes();
    });
    audio.addEventListener("canplaythrough", () => {
      tryCaptureBytes();
    });
    audio.addEventListener("pause", () => {
      if (usingBuffer) return;
      sounded = false;
      paintPlayback();
    });
    return audio;
  }

  function ensureGraph(): void {
    ensureAudioElement();
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
    elementGain = ctx.createGain();
    elementGain.connect(analyser);
    ctx.addEventListener("statechange", onContextState);
    void decodePending();
  }

  /**
   * Una sola descarga, por el elemento. El ArrayBuffer para el bucle
   * sale de la caché cuando el archivo ya está entero.
   */
  function tryCaptureBytes() {
    if (bytesPromise || pendingBytes || buffer || !audio) return;
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
    if (audio.buffered.length === 0) return;
    let end = 0;
    for (let i = 0; i < audio.buffered.length; i++) end = Math.max(end, audio.buffered.end(i));
    if (end < audio.duration - 0.35) return;
    bytesPromise = fetch(AMBIENCE_TRACK, { credentials: "same-origin", cache: "force-cache" })
      .then(async (response) => {
        if (!response.ok) return;
        pendingBytes = await response.arrayBuffer();
        performance.mark?.("proto:audio-primed");
        await decodePending();
      })
      .catch(() => {
        bytesPromise = null;
      });
  }

  async function decodePending() {
    if (buffer || decoding || !pendingBytes || !ctx) return;
    decoding = true;
    try {
      buffer = await ctx.decodeAudioData(pendingBytes.slice(0));
      if (audible()) upgradeToLoop();
    } catch {
      buffer = null;
    } finally {
      decoding = false;
    }
  }

  function upgradeToLoop() {
    if (!buffer || !audible() || usingBuffer) return;
    const offset = audio && Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    startLooped(offset);
    quietElement();
    notePlayback();
  }

  function tryAutoplay(): void {
    if (heldForPrototype) return;
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

  function prime() {
    if (primed || muted) return;
    primed = true;
    const element = ensureAudioElement();
    if (!element || element.getAttribute("src")) return;
    element.preload = "auto";
    element.src = AMBIENCE_TRACK;
    performance.mark?.("proto:audio-prime");
    queueMicrotask(() => tryAutoplay());
  }

  /** Enruta el elemento solo con el contexto en marcha, para no dejar iOS mudo. */
  function connectElement(): void {
    if (source || sourceFailed || !ctx || !audio || !elementGain) return;
    if (!shouldRouteMediaElement(ctx.state)) return;
    try {
      source = ctx.createMediaElementSource(audio);
    } catch {
      sourceFailed = true;
      audio.volume = MASTER_LEVEL;
      return;
    }
    source.connect(elementGain);
    elementGain.gain.setValueAtTime(1, ctx.currentTime);
    audio.volume = 1;
  }

  function onContextState(): void {
    if (!ctx || ctx.state === "closed") return;
    if (ctx.state !== "running") {
      sounded = false;
      paintPlayback();
      return;
    }
    // Sin otro play(): un play() fuera del gesto aborta el arranque en iOS.
    connectElement();
    notePlayback();
  }

  function teardownGraph(): void {
    stopLoopVoices();
    buffer = null;
    pendingBytes = null;
    bytesPromise = null;
    decoding = false;
    primed = false;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      audio.remove();
      audio = null;
    }
    source = null;
    sourceFailed = false;
    if (ctx) ctx.removeEventListener("statechange", onContextState);
    void ctx?.close();
    ctx = null;
    master = null;
    analyser = null;
    elementGain = null;
    bins = null;
  }

  function releasePlayback(): void {
    heldForPrototype = true;
    playGeneration += 1;
    releaseGeneration += 1;
    const generation = releaseGeneration;
    clearLoopTimer();
    usingBuffer = false;
    ramp(0, MUSIC_FADE_OUT_S);
    sounded = false;
    paintPlayback();
    cancelStop();
    stopTimer = window.setTimeout(() => {
      stopTimer = null;
      if (generation !== releaseGeneration) return;
      resumeOffset = captureOffset();
      if (audio && !audio.paused) audio.pause();
      stopLoopVoices();
      teardownGraph();
    }, MUSIC_FADE_OUT_S * 1000);
  }

  function restorePlayback(): void {
    if (!heldForPrototype) return;
    const resume = shouldResumeLobbyMusic({
      muted,
      paused,
      visible: document.visibilityState === "visible",
    });
    heldForPrototype = false;
    releaseGeneration += 1;
    cancelStop();
    if (!resume) {
      paintPlayback();
      return;
    }
    if (!armed) return;
    startOutput();
  }

  function silence(): void {
    playGeneration += 1;
    const generation = playGeneration;
    ramp(0, MUSIC_FADE_OUT_S);
    sounded = false;
    paintPlayback();
    cancelStop();
    stopTimer = window.setTimeout(() => {
      stopTimer = null;
      if (generation !== playGeneration) return;
      resumeOffset = captureOffset();
      if (audio && !audio.paused) audio.pause();
      stopLoopVoices();
    }, MUSIC_FADE_OUT_S * 1000);
  }

  /**
   * resume() y play() en este mismo turno, sin await delante.
   * No se vuelve a llamar a play() cuando el contexto pasa a running.
   */
  function startOutput(): void {
    if (!wantsAudio()) {
      silence();
      return;
    }
    prime();
    ensureGraph();
    if (!ctx || !master || !audio) return;
    cancelStop();
    void ctx.resume().catch(() => {});
    ramp(MASTER_LEVEL, MUSIC_FADE_IN_S);
    if (usingBuffer && loopVoices.length > 0) {
      notePlayback();
      return;
    }
    if (buffer) {
      startLooped(resumeOffset);
      if (!audio.paused) quietElement();
      notePlayback();
      return;
    }
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
    beginElement();
  }

  function unlock(): void {
    if (heldForPrototype) return;
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
    if (heldForPrototype) return;
    if (!wantsAudio()) {
      silence();
      return;
    }
    if (!armed) return;
    startOutput();
  }

  function onUserGesture(event: Event): void {
    if (!isAudioUnlockEventType(event.type)) return;
    if (shouldIgnoreAudioUnlockTarget(event.target)) return;
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
    if (!muted) prime();
    if (wantsAudio()) startOutput();
    else silence();
  };

  button.addEventListener("click", onClick);
  const unlockCapture: AddEventListenerOptions = { capture: true };
  const unlockPassive: AddEventListenerOptions = { capture: true, passive: true };
  window.addEventListener("pointerdown", onUserGesture, unlockCapture);
  window.addEventListener("touchstart", onUserGesture, unlockPassive);
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
    prime,
    releasePlayback,
    restorePlayback,
    dispose() {
      button.removeEventListener("click", onClick);
      const capture: AddEventListenerOptions = { capture: true };
      const passive: AddEventListenerOptions = { capture: true, passive: true };
      window.removeEventListener("pointerdown", onUserGesture, capture);
      window.removeEventListener("touchstart", onUserGesture, passive);
      window.removeEventListener("pointerup", onUserGesture, capture);
      window.removeEventListener("touchend", onUserGesture, capture);
      window.removeEventListener("click", onUserGesture, capture);
      window.removeEventListener("keydown", onUserGesture, capture);
      document.removeEventListener("visibilitychange", onVisibility);
      sampleEnergy = () => {
        energy.bass = 0;
        energy.mid = 0;
      };
      cancelStop();
      clearLoopTimer();
      stopLoopVoices();
      audio?.pause();
      audio?.remove();
      audio = null;
      if (ctx) ctx.removeEventListener("statechange", onContextState);
      void ctx?.close();
      ctx = null;
      source = null;
      elementGain = null;
      master = null;
      analyser = null;
      bins = null;
      buffer = null;
    },
  };
}
