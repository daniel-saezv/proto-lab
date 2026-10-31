import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isShellPath } from "../../../scripts/sw.mjs";
import {
  AMBIENCE_TRACKS,
  MUSIC_MUTE_KEY,
  advanceTrack,
  isMusicMuted,
  playbackAfterGesture,
  playbackOutputLive,
  playbackRejection,
  shouldRouteMediaElement,
  shufflePlaylist,
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

  it("baraja la lista y la recorre en bucle sin precachearla", () => {
    const rolls = [0.99, 0, 0];
    let n = 0;
    const order = shufflePlaylist(AMBIENCE_TRACKS, () => rolls[n++] ?? 0);
    expect(new Set(order)).toEqual(new Set(AMBIENCE_TRACKS));
    expect(order[0]).not.toBe(AMBIENCE_TRACKS[0]);
    expect(advanceTrack(order.length - 1, order.length)).toBe(0);
    expect(advanceTrack(0, order.length)).toBe(1);
    const audioDir = join(dirname(fileURLToPath(import.meta.url)), "../public/protos/audio");
    for (const path of AMBIENCE_TRACKS) {
      expect(isShellPath(path)).toBe(false);
      expect(path.startsWith("/protos/audio/")).toBe(true);
      expect(existsSync(join(audioDir, path.slice("/protos/audio/".length)))).toBe(true);
    }
    expect(existsSync(join(audioDir, "CREDITS.md"))).toBe(true);
    const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../index.html"), "utf8");
    expect(html.toLowerCase()).not.toContain("credit");
    expect(html.toLowerCase()).not.toContain("crédito");
  });

  it("reintenta el audio en el siguiente gesto si el anterior no pudo sonar", () => {
    expect(playbackAfterGesture({ muted: false, paused: false, visible: true, sounding: false })).toEqual({ kick: true });
    expect(playbackAfterGesture({ muted: false, paused: false, visible: true, sounding: true })).toEqual({ kick: false });
    expect(playbackAfterGesture({ muted: true, paused: false, visible: true, sounding: false })).toEqual({ kick: false });
    expect(playbackAfterGesture({ muted: false, paused: true, visible: true, sounding: false })).toEqual({ kick: false });
    expect(playbackAfterGesture({ muted: false, paused: false, visible: false, sounding: false })).toEqual({ kick: false });
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
