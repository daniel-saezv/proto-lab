import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isShellPath } from "../../../scripts/sw.mjs";
import {
  AMBIENCE_TRACK,
  AUDIO_UNLOCK_POINTER_DOWN,
  AUDIO_UNLOCK_TOUCH_START,
  AUDIO_UNLOCK_TOUCH_END,
  LOOP_CROSSFADE_S,
  MUSIC_FADE_IN_S,
  MUSIC_FADE_OUT_S,
  MUSIC_MUTE_KEY,
  isAudioUnlockEventType,
  isMusicMuted,
  loopOverlapSeconds,
  playbackAfterGesture,
  playbackOutputLive,
  playbackRejection,
  shouldIgnoreAudioUnlockTarget,
  shouldResumeLobbyMusic,
  shouldRouteMediaElement,
  shouldShortCircuitStartOutput,
  shouldDeferBufferLoopUpgrade,
  shouldQuietMediaForBufferHandoff,
  toggleMusicMuted,
  writeBandEnergies,
} from "./ambience-music";

function memoryStorage(initial?: string) {
  const data = new Map<string, string>();
  if (initial != null) data.set(MUSIC_MUTE_KEY, initial);
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

describe("música ambiental", () => {
  it("empieza con sonido y el botón de silenciar alterna y persiste", () => {
    const storage = memoryStorage();
    expect(isMusicMuted(storage)).toBe(false);
    expect(toggleMusicMuted(storage)).toBe(true);
    expect(isMusicMuted(storage)).toBe(true);
    expect(storage.getItem(MUSIC_MUTE_KEY)).toBe("1");
    expect(toggleMusicMuted(storage)).toBe(false);
    expect(storage.getItem(MUSIC_MUTE_KEY)).toBe("0");
  });

  it("recupera el silencio guardado", () => {
    const storage = memoryStorage("1");
    expect(isMusicMuted(storage)).toBe(true);
    expect(toggleMusicMuted(storage)).toBe(false);
  });

  it("deja solo Luanda, fuera de la shell, con un solape de bucle", () => {
    expect(AMBIENCE_TRACK).toBe("/protos/audio/luanda.m4a");
    expect(isShellPath(AMBIENCE_TRACK)).toBe(false);
    expect(MUSIC_FADE_IN_S).toBeGreaterThanOrEqual(1);
    expect(MUSIC_FADE_IN_S).toBeLessThanOrEqual(2);
    expect(MUSIC_FADE_OUT_S).toBeGreaterThan(0.4);
    expect(MUSIC_FADE_OUT_S).toBeLessThan(MUSIC_FADE_IN_S);
    expect(loopOverlapSeconds(131)).toBe(LOOP_CROSSFADE_S);
    expect(loopOverlapSeconds(0.2)).toBeCloseTo(0.1);
    expect(loopOverlapSeconds(0)).toBe(0);
    const audioDir = join(dirname(fileURLToPath(import.meta.url)), "../public/protos/audio");
    expect(existsSync(join(audioDir, "luanda.m4a"))).toBe(true);
    const credits = readFileSync(join(audioDir, "CREDITS.md"), "utf8");
    expect(credits).toContain("luanda.m4a");
    expect(credits).toContain("Infraction");
    expect(credits).toContain("MORAI");
    expect(credits.match(/\.m4a/g)).toEqual([".m4a"]);
    const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../index.html"), "utf8");
    expect(html.toLowerCase()).not.toContain("credit");
    expect(html.toLowerCase()).not.toContain("crédito");
  });

  it("reanuda la música del lobby al cerrar el prototipo solo si procede", () => {
    expect(shouldResumeLobbyMusic({ muted: false, paused: false, visible: true })).toBe(true);
    expect(shouldResumeLobbyMusic({ muted: true, paused: false, visible: true })).toBe(false);
    expect(shouldResumeLobbyMusic({ muted: false, paused: true, visible: true })).toBe(false);
    expect(shouldResumeLobbyMusic({ muted: false, paused: false, visible: false })).toBe(false);
  });

  it("reintenta el audio en el siguiente gesto si el anterior no pudo sonar", () => {
    expect(playbackAfterGesture({ muted: false, paused: false, visible: true, sounding: false, engaged: false })).toEqual({ kick: true });
    expect(playbackAfterGesture({ muted: false, paused: false, visible: true, sounding: true, engaged: false })).toEqual({ kick: false });
    expect(playbackAfterGesture({ muted: false, paused: false, visible: true, sounding: false, engaged: true })).toEqual({ kick: false });
    expect(playbackAfterGesture({ muted: true, paused: false, visible: true, sounding: false, engaged: false })).toEqual({ kick: false });
    expect(playbackAfterGesture({ muted: false, paused: true, visible: true, sounding: false, engaged: false })).toEqual({ kick: false });
    expect(playbackAfterGesture({ muted: false, paused: false, visible: false, sounding: false, engaged: false })).toEqual({ kick: false });
    expect(playbackRejection("NotAllowedError")).toEqual({ retryOnNextGesture: true, skipTrack: false });
    expect(playbackRejection("AbortError").skipTrack).toBe(false);
    expect(playbackRejection("NotSupportedError").skipTrack).toBe(true);
    expect(shouldRouteMediaElement("suspended")).toBe(false);
    expect(shouldRouteMediaElement("interrupted")).toBe(false);
    expect(shouldRouteMediaElement("running")).toBe(true);
    expect(playbackOutputLive({ mediaPaused: false, contextState: "suspended", routed: true })).toBe(false);
    expect(playbackOutputLive({ mediaPaused: false, contextState: "running", routed: false })).toBe(false);
    expect(playbackOutputLive({ mediaPaused: true, contextState: "running", routed: true })).toBe(false);
    expect(playbackOutputLive({ mediaPaused: false, contextState: "running", routed: true })).toBe(true);
  });

  it("no reinicia la pista con gestos repetidos ni tras autoplay fallido", () => {
    const autoplayRejected = { muted: false, paused: false, visible: true, sounding: false, engaged: false };
    expect(playbackAfterGesture(autoplayRejected).kick).toBe(true);

    const touchStart = { ...autoplayRejected, engaged: false };
    const touchEndSameGesture = { ...autoplayRejected, engaged: true, sounding: false };
    expect(playbackAfterGesture(touchStart).kick).toBe(true);
    expect(playbackAfterGesture(touchEndSameGesture).kick).toBe(false);

    expect(
      shouldShortCircuitStartOutput({
        engaged: true,
        outputLive: false,
        bufferLoopActive: false,
        mediaPlaying: true,
      }),
    ).toBe(true);

    expect(
      shouldShortCircuitStartOutput({
        engaged: true,
        outputLive: false,
        bufferLoopActive: false,
        mediaPlaying: false,
      }),
    ).toBe(false);

    expect(
      shouldShortCircuitStartOutput({
        engaged: false,
        outputLive: false,
        bufferLoopActive: false,
        mediaPlaying: true,
      }),
    ).toBe(false);
  });

  it("no silencia el elemento media hasta que el bucle WebAudio pueda sonar", () => {
    expect(shouldDeferBufferLoopUpgrade("suspended")).toBe(true);
    expect(shouldDeferBufferLoopUpgrade("interrupted")).toBe(true);
    expect(shouldDeferBufferLoopUpgrade("running")).toBe(false);
    expect(shouldDeferBufferLoopUpgrade(undefined)).toBe(true);

    expect(
      shouldQuietMediaForBufferHandoff({ contextState: "suspended", loopVoiceCount: 2 }),
    ).toBe(false);
    expect(
      shouldQuietMediaForBufferHandoff({ contextState: "running", loopVoiceCount: 0 }),
    ).toBe(false);
    expect(
      shouldQuietMediaForBufferHandoff({ contextState: "running", loopVoiceCount: 2 }),
    ).toBe(true);
  });

  it("desbloquea con inicio y fin de gesto, no con arrastre", () => {
    expect(isAudioUnlockEventType(AUDIO_UNLOCK_TOUCH_START)).toBe(true);
    expect(isAudioUnlockEventType(AUDIO_UNLOCK_POINTER_DOWN)).toBe(true);
    expect(isAudioUnlockEventType(AUDIO_UNLOCK_TOUCH_END)).toBe(true);
    expect(isAudioUnlockEventType("touchmove")).toBe(false);
    expect(isAudioUnlockEventType("pointermove")).toBe(false);
    expect(isAudioUnlockEventType("pointerdown")).toBe(true);
    const mute = {
      closest(selector: string) {
        return selector === "#mute-music" ? mute : null;
      },
    };
    expect(shouldIgnoreAudioUnlockTarget(mute)).toBe(true);
    expect(shouldIgnoreAudioUnlockTarget(null)).toBe(false);
    expect(shouldIgnoreAudioUnlockTarget({})).toBe(false);
  });

  it("separa graves y medios sin crear la muestra", () => {
    const bins = new Uint8Array(16);
    bins[0] = 255;
    bins[1] = 255;
    bins[2] = 255;
    bins[4] = 128;
    bins[5] = 128;
    const out = { bass: 0, mid: 0 };
    writeBandEnergies(bins, out);
    expect(out.bass).toBeCloseTo(1);
    expect(out.mid).toBeCloseTo(256 / (8 * 255));
  });
});
