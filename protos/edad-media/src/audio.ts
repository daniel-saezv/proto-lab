export type Sonido = {
  abrir(): void;
  nota(freq: number, dur?: number, tipo?: OscillatorType, ganancia?: number): void;
  cerrar(): void;
};

export function crearSonido(): Sonido {
  let ctx: AudioContext | null = null;
  return {
    abrir() {
      // Safari en iOS sigue exponiendo el contexto solo con prefijo.
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      if (!ctx) ctx = new Ctx();
      if (ctx.state === "suspended") void ctx.resume();
    },
    nota(freq, dur = 0.08, tipo = "square", ganancia = 0.045) {
      if (!ctx || ctx.state !== "running") return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      osc.type = tipo;
      osc.frequency.setValueAtTime(freq, now);
      amp.gain.setValueAtTime(ganancia, now);
      amp.gain.exponentialRampToValueAtTime(0.001, now + dur);
      osc.connect(amp);
      amp.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + dur + 0.02);
    },
    cerrar() {
      const actual = ctx;
      ctx = null;
      void actual?.close();
    },
  };
}
