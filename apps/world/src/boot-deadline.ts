/**
 * Plazo de apertura.
 * `readyMs` es inactividad: se reinicia cuando `loaded` crece.
 * Al completar la descarga corre un plazo aparte para compilar.
 * El tope absoluto cuenta desde que se abre, aunque los bytes sigan llegando.
 */
export const BOOT_COMPILE_MS = 60_000;
export const BOOT_ABSOLUTE_MS = 180_000;

export type BootClock = {
  openedAt: number;
  lastAdvanceAt: number;
  lastLoaded: number;
  completeAt: number | null;
};

export type BootTimeout = "inactivity" | "compile" | "absolute";

export function createBootClock(now: number): BootClock {
  return { openedAt: now, lastAdvanceAt: now, lastLoaded: -1, completeAt: null };
}

function inactivityMs(readyMs: number): number {
  return readyMs > 0 ? readyMs : 8000;
}

/** Devuelve el mismo reloj si los bytes no han crecido. */
export function noteBootProgress(clock: BootClock, loaded: unknown, total: unknown, now: number): BootClock {
  if (typeof loaded !== "number" || !Number.isFinite(loaded) || loaded < 0 || loaded <= clock.lastLoaded) return clock;
  const next: BootClock = { ...clock, lastLoaded: loaded, lastAdvanceAt: now };
  if (
    next.completeAt == null &&
    typeof total === "number" &&
    Number.isFinite(total) &&
    total > 0 &&
    loaded >= total
  ) {
    next.completeAt = now;
  }
  return next;
}

export function bootTimeoutReason(clock: BootClock, now: number, readyMs: number): BootTimeout | null {
  if (now - clock.openedAt >= BOOT_ABSOLUTE_MS) return "absolute";
  if (clock.completeAt != null) {
    if (now - clock.completeAt >= BOOT_COMPILE_MS) return "compile";
    return null;
  }
  if (now - clock.lastAdvanceAt >= inactivityMs(readyMs)) return "inactivity";
  return null;
}

/** Milisegundos hasta el próximo corte. 0 si ya ha vencido. */
export function bootWaitMs(clock: BootClock, now: number, readyMs: number): number {
  const untilAbsolute = clock.openedAt + BOOT_ABSOLUTE_MS - now;
  const until =
    clock.completeAt != null
      ? clock.completeAt + BOOT_COMPILE_MS - now
      : clock.lastAdvanceAt + inactivityMs(readyMs) - now;
  return Math.max(0, Math.min(untilAbsolute, until));
}
