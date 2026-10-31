import { describe, expect, it } from "vitest";
import { MUSIC_MUTE_KEY, isMusicMuted, toggleMusicMuted } from "./ambience-music";

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
});
