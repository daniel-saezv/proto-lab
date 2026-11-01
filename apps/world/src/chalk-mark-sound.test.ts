import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CHALK_MARK_GAP_MS, CHALK_MARK_SRC, CHALK_MARK_VOLUME, shouldPlayChalkMark } from "./chalk-mark-sound";

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

  it("el clip es el recorte CC0, bajo de volumen y con la licencia al lado", () => {
    expect(CHALK_MARK_SRC).toBe("/protos/audio/chalk.m4a");
    expect(CHALK_MARK_VOLUME).toBeGreaterThan(0.05);
    expect(CHALK_MARK_VOLUME).toBeLessThan(0.35);
    const audioDir = join(dirname(fileURLToPath(import.meta.url)), "../public/protos/audio");
    const file = join(audioDir, "chalk.m4a");
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file).byteLength).toBeLessThan(16_384);
    const license = readFileSync(join(audioDir, "chalk-license.md"), "utf8");
    expect(license).toContain("CC0");
    expect(license).toContain("https://freesound.org/people/Breviceps/sounds/447925/");
    expect(license).toContain("chalk.m4a");
    expect(license.toLowerCase()).toContain("atribución");
  });
});
