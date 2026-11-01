import { describe, expect, it } from "vitest";
import { CHALK_MARK_GAP_MS, chalkScratchShape, shouldPlayChalkMark } from "./chalk-mark-sound";

describe("sonido de tiza", () => {
  const ready = {
    e2e: false,
    muted: false,
    contextRunning: true,
    nowMs: 1_000,
    lastPlayedMs: Number.NEGATIVE_INFINITY,
  };

  it("suena al empezar un acento si el contexto ya corre", () => {
    expect(shouldPlayChalkMark(ready)).toBe(true);
  });

  it("no suena en e2e, con la música silenciada o sin contexto", () => {
    expect(shouldPlayChalkMark({ ...ready, e2e: true })).toBe(false);
    expect(shouldPlayChalkMark({ ...ready, muted: true })).toBe(false);
    expect(shouldPlayChalkMark({ ...ready, contextRunning: false })).toBe(false);
  });

  it("no repite el rasguño al barrer varias filas", () => {
    expect(shouldPlayChalkMark({ ...ready, nowMs: 2_000, lastPlayedMs: 2_000 - CHALK_MARK_GAP_MS + 1 })).toBe(false);
    expect(shouldPlayChalkMark({ ...ready, nowMs: 2_000, lastPlayedMs: 2_000 - CHALK_MARK_GAP_MS })).toBe(true);
  });

  it("varía tono y duración dentro de un rasguño corto", () => {
    const quiet = chalkScratchShape(() => 0);
    const bright = chalkScratchShape(() => 1);
    expect(quiet.durationSec).toBeGreaterThan(0.03);
    expect(quiet.durationSec).toBeLessThan(0.1);
    expect(bright.durationSec).toBeGreaterThan(quiet.durationSec);
    expect(bright.frequencyHz).toBeGreaterThan(quiet.frequencyHz);
    expect(quiet.peak).toBeGreaterThan(0.03);
    expect(bright.peak).toBeLessThan(0.12);
    expect(bright.q).not.toBe(quiet.q);
  });
});
