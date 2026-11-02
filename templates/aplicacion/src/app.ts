export type FrameHandle = number;

export type AudioHandle = {
  close(): void | Promise<void>;
  resume?(): void | Promise<void>;
};

export type GlHandle = {
  getExtension(name: string): { loseContext(): void } | null;
  clearColor?(red: number, green: number, blue: number, alpha: number): void;
  clear?(mask: number): void;
  COLOR_BUFFER_BIT?: number;
};

export type CanvasLike = {
  remove(): void;
};

export type AppHost = {
  requestAnimationFrame(callback: (time: number) => void): FrameHandle;
  cancelAnimationFrame(handle: FrameHandle): void;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
  createAudio(): AudioHandle;
  createCanvas(): CanvasLike;
  createContext(canvas: CanvasLike): GlHandle | null;
};

export type RunningApp = {
  stop(): void;
};

export type EventTargetLike = {
  addEventListener(type: string, listener: () => void): void;
};

export function startApp(mount: (canvas: CanvasLike) => void, host: AppHost): RunningApp {
  const canvas = host.createCanvas();
  mount(canvas);
  const gl = host.createContext(canvas);
  const lose = gl?.getExtension("WEBGL_lose_context") ?? null;
  const audio = host.createAudio();

  let frame = 0;
  let stopped = false;
  const tick = (time: number) => {
    if (stopped) return;
    if (gl?.clearColor && gl.clear && gl.COLOR_BUFFER_BIT != null) {
      const wave = (Math.sin(time / 700) + 1) / 2;
      gl.clearColor(0.11, 0.32 + wave * 0.16, 0.58, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    frame = host.requestAnimationFrame(tick);
  };
  frame = host.requestAnimationFrame(tick);

  const onResize = () => {};
  const onPointer = () => {
    void audio.resume?.();
  };
  host.addEventListener("resize", onResize);
  host.addEventListener("pointerdown", onPointer);

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      host.cancelAnimationFrame(frame);
      host.removeEventListener("resize", onResize);
      host.removeEventListener("pointerdown", onPointer);
      void audio.close();
      lose?.loseContext();
      canvas.remove();
    },
  };
}

export function bindPage(
  app: RunningApp,
  options: {
    assets?: () => { revokeAll(): void } | undefined;
    target: EventTargetLike;
  },
): { stop(): void } {
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    app.stop();
    options.assets?.()?.revokeAll();
  };
  options.target.addEventListener("pagehide", stop);
  return { stop };
}

export function browserHost(): AppHost {
  return {
    requestAnimationFrame: (callback) => requestAnimationFrame(callback),
    cancelAnimationFrame: (handle) => cancelAnimationFrame(handle),
    addEventListener: (type, listener) => window.addEventListener(type, listener),
    removeEventListener: (type, listener) => window.removeEventListener(type, listener),
    createAudio: () => {
      const audio = new AudioContext();
      return { close: () => audio.close(), resume: () => audio.resume() };
    },
    createCanvas: () => {
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 360;
      return canvas;
    },
    createContext: (canvas) => {
      if (!(canvas instanceof HTMLCanvasElement)) return null;
      const gl = canvas.getContext("webgl", { preserveDrawingBuffer: true, antialias: false });
      if (!gl) return null;
      const extension = gl.getExtension("WEBGL_lose_context");
      return {
        getExtension: (name) => (name === "WEBGL_lose_context" && extension ? { loseContext: () => extension.loseContext() } : null),
        clearColor: (red, green, blue, alpha) => gl.clearColor(red, green, blue, alpha),
        clear: (mask) => gl.clear(mask),
        COLOR_BUFFER_BIT: gl.COLOR_BUFFER_BIT,
      };
    },
  };
}
