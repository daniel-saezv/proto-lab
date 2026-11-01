import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CHALK_MARK_GAP_MS,
  CHALK_MARK_SRC,
  CHALK_MARK_VOLUME,
  CHALK_SPAN_SECONDS,
  CHALK_TAKES,
  chalkTakeWindow,
  pickChalkClip,
  playbackForSpan,
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

  it("no repite la misma variación dos veces seguidas", () => {
    expect(pickChalkClip(1, 0, () => 0.9)).toBe(0);
    expect(pickChalkClip(CHALK_TAKES.length, null, () => 0)).toBe(0);
    const count = CHALK_TAKES.length;
    for (let last = 0; last < count; last += 1) {
      const seen = new Set<number>();
      for (let step = 0; step < count - 1; step += 1) {
        const pick = pickChalkClip(count, last, () => (step + 0.01) / (count - 1));
        expect(pick).not.toBe(last);
        expect(pick).toBeGreaterThanOrEqual(0);
        expect(pick).toBeLessThan(count);
        seen.add(pick);
      }
      expect(seen.size).toBe(count - 1);
    }
  });

  it("varía un solo recorte, con cambios pequeños y dentro del buffer", () => {
    expect(CHALK_TAKES.length).toBeGreaterThan(2);
    const signatures = new Set<string>();
    for (const take of CHALK_TAKES) {
      expect(take.rate).toBeGreaterThan(0.92);
      expect(take.rate).toBeLessThan(1.08);
      expect(take.gain).toBeGreaterThan(0.7);
      expect(take.gain).toBeLessThan(1.15);
      expect(take.lowpass).toBeGreaterThan(4000);
      expect(take.lowpass).toBeLessThanOrEqual(14000);
      const window = chalkTakeWindow(take, 0.347);
      expect(window.offset).toBeGreaterThanOrEqual(0);
      expect(window.offset + window.duration).toBeLessThanOrEqual(0.347 + 1e-9);
      expect(window.duration).toBeGreaterThan(0.15);
      signatures.add(`${take.rate}|${take.gain}|${take.offset}|${take.duration}|${take.lowpass}`);
    }
    expect(signatures.size).toBe(CHALK_TAKES.length);
    const clipped = chalkTakeWindow({ rate: 1, gain: 1, offset: 0.4, duration: 0.3, lowpass: 8000 }, 0.2);
    expect(clipped.offset + clipped.duration).toBeLessThanOrEqual(0.2 + 1e-9);
    const late = CHALK_TAKES.find((take) => take.offset > 0.02) ?? CHALK_TAKES[0]!;
    const long = playbackForSpan(late, "long", 0.347);
    const short = playbackForSpan(CHALK_TAKES[0]!, "short", 0.347);
    expect(long.offset).toBe(0);
    expect(long.duration).toBeCloseTo(CHALK_SPAN_SECONDS.long, 2);
    expect(short.duration).toBeCloseTo(CHALK_SPAN_SECONDS.short, 2);
    expect(short.duration).toBeLessThan(playbackForSpan(CHALK_TAKES[0]!, "medium", 0.347).duration);
  });

  it("el archivo es la escritura seguida, bajo de volumen y con la nota de licencia", () => {
    expect(CHALK_MARK_SRC).toBe("/protos/audio/chalk-2.m4a");
    expect(CHALK_MARK_VOLUME).toBeGreaterThan(0.05);
    expect(CHALK_MARK_VOLUME).toBeLessThan(0.35);
    const audioDir = join(dirname(fileURLToPath(import.meta.url)), "../public/protos/audio");
    expect(existsSync(join(audioDir, "chalk-1.m4a"))).toBe(false);
    expect(existsSync(join(audioDir, "chalk-3.m4a"))).toBe(false);
    expect(existsSync(join(audioDir, "chalk.m4a"))).toBe(false);
    const file = join(audioDir, "chalk-2.m4a");
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file).byteLength).toBeLessThan(16_384);
    const license = readFileSync(join(audioDir, "chalk-license.md"), "utf8");
    expect(license).toContain("https://youtu.be/JiupbhgGIu0");
    expect(license).toContain("CHALKBOARD WRITING SOUND EFFECT");
    expect(license).toContain("YOUTUBE THING");
    expect(license).toContain("daniel-saezv");
    expect(license.toLowerCase()).toContain("no declara");
    expect(license).toContain("chalk-2.m4a");
    expect(license).not.toContain("chalk-1.m4a");
    expect(license).not.toContain("chalk-3.m4a");
    expect(license).not.toContain("freesound.org");
    expect(license.toLowerCase()).toContain("vari");
  });
});
