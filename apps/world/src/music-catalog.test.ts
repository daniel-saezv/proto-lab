import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  MUSIC_CATALOG,
  MUSIC_TRACK_KEY,
  MUSIC_TRACK_MAX_BYTES,
  creditSection,
  musicNowLabel,
  nextInCatalog,
  nextTrack,
  readTrackId,
  sectionHasLicense,
  trackById,
  writeTrackId,
} from "./music-catalog";

const audioDir = join(dirname(fileURLToPath(import.meta.url)), "../public/protos/audio");

describe("catálogo de la radio", () => {
  it("publica el catálogo como literal y por debajo de 4 MiB", () => {
    expect(MUSIC_CATALOG.map((track) => track.id)).toEqual(["luanda", "firefly-in-a-fairytale"]);
    const source = readFileSync(new URL("./music-catalog.ts", import.meta.url), "utf8");
    expect(source).toContain('src: "/protos/audio/luanda.m4a"');
    expect(source).toContain('src: "/protos/audio/firefly-in-a-fairytale.m4a"');
    for (const track of MUSIC_CATALOG) {
      const file = join(audioDir, track.file);
      const bytes = statSync(file).size;
      expect(bytes).toBeGreaterThan(0);
      expect(bytes).toBeLessThanOrEqual(MUSIC_TRACK_MAX_BYTES);
      expect(track.src).toBe(`/protos/audio/${track.file}`);
    }
    const chalk = readdirSync(audioDir).filter(
      (name) => name.endsWith(".m4a") && !MUSIC_CATALOG.some((track) => track.file === name),
    );
    expect(chalk.every((name) => !MUSIC_CATALOG.some((track) => track.file === name))).toBe(true);
  });

  it("cada pista tiene una sección de licencia en CREDITS.md", () => {
    const credits = readFileSync(join(audioDir, "CREDITS.md"), "utf8");
    for (const track of MUSIC_CATALOG) {
      const section = creditSection(credits, track.file);
      expect(section, track.file).toBeTruthy();
      expect(sectionHasLicense(section ?? "")).toBe(true);
      expect(section).toContain(track.artist.split("&")[0]!.trim());
    }
    expect(sectionHasLicense("sin nada")).toBe(false);
    expect(sectionHasLicense("Licencia: corta")).toBe(false);
  });

  it("avanza en círculo y recuerda la pista elegida", () => {
    const dos = [
      { id: "una", title: "Una", artist: "A", src: "/protos/audio/una.m4a", file: "una.m4a" },
      { id: "dos", title: "Dos", artist: "B", src: "/protos/audio/dos.m4a", file: "dos.m4a" },
    ];
    expect(nextInCatalog(dos, "una").id).toBe("dos");
    expect(nextInCatalog(dos, "dos").id).toBe("una");
    expect(nextInCatalog(dos, "no-esta").id).toBe("una");
    expect(nextTrack("luanda").id).toBe("firefly-in-a-fairytale");
    expect(nextTrack("firefly-in-a-fairytale").id).toBe("luanda");
    expect(trackById("otra").id).toBe("luanda");
    expect(musicNowLabel("Luanda")).toBe("Música: Luanda");
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
    };
    expect(readTrackId(storage)).toBe("luanda");
    writeTrackId(storage, "luanda");
    expect(storage.getItem(MUSIC_TRACK_KEY)).toBe("luanda");
    writeTrackId(storage, "desconocida");
    expect(readTrackId(storage)).toBe("luanda");
  });
});
