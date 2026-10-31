export const MUSIC_MUTE_KEY = "proto-lab:music-muted";

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

export type MusicHandle = {
  setPaused: (paused: boolean) => void;
  isMuted: () => boolean;
  dispose: () => void;
};

type Osc = OscillatorNode;

/**
 * Pad procedural (sin archivos). Arranca solo tras un gesto del usuario,
 * para cumplir el autoplay de iOS y del resto de navegadores.
 */
export function createAmbienceMusic(button: HTMLButtonElement, storage: StorageLike = localStorage): MusicHandle {
  let muted = isMusicMuted(storage);
  let paused = false;
  let armed = false;
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  const oscillators: Osc[] = [];

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
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 620;
    filter.Q.value = 0.35;
    const voice = ctx.createGain();
    voice.gain.value = 0.11;

    const voices: Array<{ freq: number; type: OscillatorType; gain: number }> = [
      { freq: 110, type: "sine", gain: 0.22 },
      { freq: 110.45, type: "sine", gain: 0.14 },
      { freq: 164.81, type: "sine", gain: 0.07 },
      { freq: 220, type: "triangle", gain: 0.035 },
    ];
    for (const spec of voices) {
      const osc = ctx.createOscillator();
      osc.type = spec.type;
      osc.frequency.value = spec.freq;
      const gain = ctx.createGain();
      gain.gain.value = spec.gain;
      osc.connect(gain);
      gain.connect(filter);
      osc.start();
      oscillators.push(osc);
    }

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.055;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 140;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();
    oscillators.push(lfo);

    const swell = ctx.createOscillator();
    swell.frequency.value = 0.04;
    const swellGain = ctx.createGain();
    swellGain.gain.value = 0.018;
    swell.connect(swellGain);
    swellGain.connect(voice.gain);
    swell.start();
    oscillators.push(swell);

    filter.connect(voice);
    voice.connect(master);
    master.connect(ctx.destination);
  }

  function sync(): void {
    if (!audible()) {
      if (ctx && master) {
        const now = ctx.currentTime;
        master.gain.cancelScheduledValues(now);
        master.gain.linearRampToValueAtTime(0, now + 0.18);
      }
      return;
    }
    ensureGraph();
    if (!ctx || !master) return;
    void ctx.resume();
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.linearRampToValueAtTime(1, now + 0.55);
  }

  function arm(): void {
    if (armed) return;
    armed = true;
    sync();
  }

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
      for (const osc of oscillators) {
        try {
          osc.stop();
        } catch {
          /* ya parado */
        }
      }
      void ctx?.close();
      ctx = null;
      master = null;
    },
  };
}
