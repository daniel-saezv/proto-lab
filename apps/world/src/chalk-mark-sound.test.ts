import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CHALK_MARK_GAP_MS,
  CHALK_MARK_SRCS,
  CHALK_MARK_VOLUME,
  pickChalkClip,
  shouldPlayChalkMark,
} from "./chalk-mark-sound";

describe("sonido de tiza", () => {
  const ready = {
    e2e: false,
    muted: false,
    ready: true,
    playing: false,
    nowMs: 1_000,
    lastPlayedMs: Number.NEGATIVE_INFINITY,
  };

  it("suena al empezar un acento si el clip ya está listo", () => {
    expect(shouldPlayChalkMark(ready)).toBe(true);
  });

  it("no suena en e2e, con la música silenciada o sin el clip", () => {
    expect(shouldPlayChalkMark({ ...ready, e2e: true })).toBe(false);
    expect(shouldPlayChalkMark({ ...ready, muted: true })).toBe(false);
    expect(shouldPlayChalkMark({ ...ready, ready: false })).toBe(false);
  });

  it("no apila otro rasguño mientras uno sigue sonando", () => {
    expect(shouldPlayChalkMark({ ...ready, playing: true, nowMs: 5_000, lastPlayedMs: 1_000 })).toBe(false);
  });

  it("no repite el rasguño al barrer varias filas", () => {
    expect(shouldPlayChalkMark({ ...ready, nowMs: 2_000, lastPlayedMs: 2_000 - CHALK_MARK_GAP_MS + 1 })).toBe(false);
    expect(shouldPlayChalkMark({ ...ready, nowMs: 2_000, lastPlayedMs: 2_000 - CHALK_MARK_GAP_MS })).toBe(true);
  });

  it("no repite el mismo recorte dos veces seguidas", () => {
    expect(pickChalkClip(1, 0, () => 0.9)).toBe(0);
    expect(pickChalkClip(3, null, () => 0)).toBe(0);
    expect(pickChalkClip(3, null, () => 0.99)).toBe(2);
    for (let last = 0; last < 3; last += 1) {
      const seen = new Set<number>();
      for (let step = 0; step < 2; step += 1) {
        const pick = pickChalkClip(3, last, () => (step + 0.01) / 2);
        expect(pick).not.toBe(last);
        expect(pick).toBeGreaterThanOrEqual(0);
        expect(pick).toBeLessThan(3);
        seen.add(pick);
      }
      expect(seen.size).toBe(2);
    }
  });

  it("los recortes son los tres trazos del audio de YouTube, bajos y con la nota de licencia", () => {
    expect([...CHALK_MARK_SRCS]).toEqual([
      "/protos/audio/chalk-1.m4a",
      "/protos/audio/chalk-2.m4a",
      "/protos/audio/chalk-3.m4a",
    ]);
    expect(CHALK_MARK_VOLUME).toBeGreaterThan(0.05);
    expect(CHALK_MARK_VOLUME).toBeLessThan(0.35);
    const audioDir = join(dirname(fileURLToPath(import.meta.url)), "../public/protos/audio");
    expect(existsSync(join(audioDir, "chalk.m4a"))).toBe(false);
    for (const src of CHALK_MARK_SRCS) {
      const file = join(audioDir, src.slice("/protos/audio/".length));
      expect(existsSync(file)).toBe(true);
      expect(readFileSync(file).byteLength).toBeLessThan(16_384);
    }
    const license = readFileSync(join(audioDir, "chalk-license.md"), "utf8");
    expect(license).toContain("https://youtu.be/JiupbhgGIu0");
    expect(license).toContain("CHALKBOARD WRITING SOUND EFFECT");
    expect(license).toContain("YOUTUBE THING");
    expect(license).toContain("daniel-saezv");
    expect(license.toLowerCase()).toContain("no declara");
    expect(license).not.toContain("freesound.org");
    for (const name of ["chalk-1.m4a", "chalk-2.m4a", "chalk-3.m4a"]) {
      expect(license).toContain(name);
    }
  });
});
