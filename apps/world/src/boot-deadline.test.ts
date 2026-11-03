import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  BOOT_ABSOLUTE_MS,
  BOOT_COMPILE_MS,
  bootTimeoutReason,
  bootWaitMs,
  createBootClock,
  noteBootProgress,
} from "./boot-deadline";

describe("plazo de apertura", () => {
  it("se reinicia mientras llegan bytes y no cuenta la inactividad al compilar", () => {
    const opened = createBootClock(0);
    expect(bootTimeoutReason(opened, 20_000, 20_000)).toBe("inactivity");
    expect(bootWaitMs(opened, 5_000, 20_000)).toBe(15_000);

    const mid = noteBootProgress(opened, 400, 1000, 19_000);
    expect(mid.lastAdvanceAt).toBe(19_000);
    expect(mid.completeAt).toBeNull();
    expect(bootTimeoutReason(mid, 30_000, 20_000)).toBeNull();
    expect(noteBootProgress(mid, 400, 1000, 31_000)).toBe(mid);

    const done = noteBootProgress(mid, 1000, 1000, 31_000);
    expect(done.completeAt).toBe(31_000);
    expect(bootTimeoutReason(done, 31_000 + 20_000, 20_000)).toBeNull();
    expect(bootTimeoutReason(done, 31_000 + BOOT_COMPILE_MS, 20_000)).toBe("compile");
    expect(bootWaitMs(done, 31_000, 20_000)).toBe(BOOT_COMPILE_MS);
  });

  it("el tope absoluto corta aunque la descarga siga", () => {
    let clock = createBootClock(0);
    clock = noteBootProgress(clock, 10, 100, BOOT_ABSOLUTE_MS - 1000);
    expect(bootTimeoutReason(clock, BOOT_ABSOLUTE_MS - 1, 20_000)).toBeNull();
    expect(bootTimeoutReason(clock, BOOT_ABSOLUTE_MS, 20_000)).toBe("absolute");
    expect(bootWaitMs(clock, BOOT_ABSOLUTE_MS - 250, 20_000)).toBe(250);
  });

  it("un total desconocido no entra en compilación", () => {
    const clock = noteBootProgress(createBootClock(0), 10, 0, 1000);
    expect(clock.completeAt).toBeNull();
    expect(bootTimeoutReason(clock, 1000 + 8000, 0)).toBe("inactivity");
  });

  it("la plantilla describe los mismos plazos", () => {
    const leeme = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../../../templates/export-estatico/LEEME.md"),
      "utf8",
    );
    expect(leeme).toContain(`${BOOT_COMPILE_MS / 1000} s`);
    expect(leeme).toContain("3 min");
    expect(BOOT_ABSOLUTE_MS).toBe(180_000);
  });
});
