import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { HUD_CUE_LABEL, HUD_CUE_MS, nextHudCue } from "./hud-cue";

describe("aviso del tirador", () => {
  it("aparece al quedar listo y no vuelve a salir en la misma apertura", () => {
    expect(nextHudCue("pending", "ready")).toBe("showing");
    expect(nextHudCue("showing", "ready")).toBe("showing");
    expect(nextHudCue("showing", "tick")).toBe("done");
    expect(nextHudCue("showing", "expand")).toBe("done");
    expect(nextHudCue("pending", "expand")).toBe("done");
    expect(nextHudCue("pending", "tick")).toBe("pending");
    expect(nextHudCue("done", "ready")).toBe("done");
    expect(nextHudCue("done", "tick")).toBe("done");
    expect(nextHudCue("showing", "reset")).toBe("pending");
    expect(nextHudCue("done", "reset")).toBe("pending");
  });

  it("dura poco y el texto dice para qué sirve el tirador", () => {
    expect(HUD_CUE_MS).toBeGreaterThanOrEqual(1500);
    expect(HUD_CUE_MS).toBeLessThanOrEqual(3200);
    expect(HUD_CUE_LABEL).toBe("Abrir controles");
  });

  it("el aviso no recibe toques, el pulso se apaga si el sistema lo pide y el tirador crece solo con puntero fino", () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "style.css"), "utf8");
    const cueStart = css.indexOf(".hud-cue {");
    expect(cueStart).toBeGreaterThan(-1);
    const cueRule = css.slice(cueStart, css.indexOf("}", cueStart));
    expect(cueRule).toContain("pointer-events: none");
    expect(css).toContain("--hud-grip: 18px");
    expect(css).toContain("--hud-handle: 44px");
    const fine = css.indexOf("@media (hover: hover) and (pointer: fine)");
    expect(fine).toBeGreaterThan(-1);
    const fineRule = css.slice(fine, css.indexOf("\n}", fine));
    expect(fineRule).toContain("--hud-grip: 36px");
    expect(fineRule).toContain("--hud-handle: 56px");
    expect(css).toContain("@keyframes hud-cue-in");
    expect(css).toContain("@keyframes hud-cue-ring");
    expect(css).toContain('.prototype-chrome[data-cue="on"] .hud-cue { animation: none; }');
    expect(css).toContain('.prototype-chrome[data-cue="on"] .hud-handle-grip { animation: none; }');
  });
});
