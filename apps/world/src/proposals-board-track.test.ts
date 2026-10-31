import { describe, expect, it } from "vitest";
import { trackAriaLabel, trackStepVisuals, TRACK_STEP_LABELS } from "./proposals-board-track";

describe("proposals-board-track", () => {
  it("marca el paso activo en recibida", () => {
    const visuals = trackStepVisuals("recibida");
    expect(visuals[0]).toBe("active");
    expect(visuals.slice(1).every((v) => v === "empty")).toBe(true);
  });

  it("rellena hasta preview_lista con pulso en preview", () => {
    const visuals = trackStepVisuals("preview_lista");
    expect(visuals.slice(0, 4)).toEqual(["filled", "filled", "filled", "filled"]);
    expect(visuals[4]).toBe("active");
    expect(visuals[5]).toBe("empty");
  });

  it("marca fallo en CI sin avanzar", () => {
    const visuals = trackStepVisuals("ci_con_fallos");
    expect(visuals[3]).toBe("fail");
    expect(visuals[4]).toBe("empty");
  });

  it("celebra publicada con todos los pasos completos", () => {
    const visuals = trackStepVisuals("publicada");
    expect(visuals.filter((v) => v === "filled")).toHaveLength(5);
    expect(visuals[5]).toBe("celebrate");
    expect(trackAriaLabel("publicada")).toContain("Publicada: publicada");
  });

  it("expone etiquetas accesibles por paso", () => {
    expect(TRACK_STEP_LABELS).toHaveLength(6);
    expect(trackAriaLabel("ci_correcta")).toContain("CI: hecho");
  });
});
