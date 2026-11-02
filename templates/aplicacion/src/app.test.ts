import { describe, expect, it } from "vitest";
import { bindPage, startApp, type AppHost, type AudioHandle, type CanvasLike, type GlHandle } from "./app";

function fakeHost() {
  let nextFrame = 1;
  const calls = {
    cancelled: [] as number[],
    closed: 0,
    resumed: 0,
    lost: 0,
    removed: 0,
  };
  const listeners = new Map<string, Set<() => void>>();
  const audio: AudioHandle = {
    close: () => {
      calls.closed += 1;
    },
    resume: () => {
      calls.resumed += 1;
    },
  };
  const canvas: CanvasLike = {
    remove: () => {
      calls.removed += 1;
    },
  };
  const gl: GlHandle = {
    getExtension: (name) => (name === "WEBGL_lose_context" ? { loseContext: () => { calls.lost += 1; } } : null),
  };
  const host: AppHost = {
    requestAnimationFrame: () => nextFrame++,
    cancelAnimationFrame: (handle) => {
      calls.cancelled.push(handle);
    },
    addEventListener: (type, listener) => {
      const set = listeners.get(type) ?? new Set();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener: (type, listener) => {
      listeners.get(type)?.delete(listener);
    },
    createAudio: () => audio,
    createCanvas: () => canvas,
    createContext: () => gl,
  };
  return { host, calls, listeners, canvas };
}

describe("stop de la plantilla", () => {
  it("suelta el bucle, los listeners, el audio, WebGL y el canvas", () => {
    const { host, calls, listeners } = fakeHost();
    const app = startApp(() => {}, host);
    expect(listeners.get("resize")?.size).toBe(1);
    expect(listeners.get("pointerdown")?.size).toBe(1);
    listeners.get("pointerdown")?.forEach((listener) => listener());
    expect(calls.resumed).toBe(1);

    app.stop();
    expect(calls.cancelled).toEqual([1]);
    expect(listeners.get("resize")?.size).toBe(0);
    expect(listeners.get("pointerdown")?.size).toBe(0);
    expect(calls.closed).toBe(1);
    expect(calls.lost).toBe(1);
    expect(calls.removed).toBe(1);

    app.stop();
    expect(calls.closed).toBe(1);
    expect(calls.lost).toBe(1);
    expect(calls.cancelled).toEqual([1]);
  });

  it("en pagehide revoca los recursos del puente una sola vez", () => {
    const { host } = fakeHost();
    const app = startApp(() => {}, host);
    let revoked = 0;
    const page: { listener?: () => void } = {};
    const api = bindPage(app, {
      assets: () => ({ revokeAll: () => { revoked += 1; } }),
      target: { addEventListener: (_type, listener) => { page.listener = listener; } },
    });
    page.listener?.();
    api.stop();
    page.listener?.();
    expect(revoked).toBe(1);
  });
});
