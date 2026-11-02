import { describe, expect, it } from "vitest";
import { advanceBoot, bootFailureMessage, iframeAllow } from "./prototype-boot";

describe("arranque de la aplicación", () => {
  it("no da el arranque por bueno con alive", () => {
    expect(advanceBoot("opening", "alive")).toBe("alive");
    expect(advanceBoot("alive", "alive")).toBe("alive");
    expect(advanceBoot("alive", "ready")).toBe("ready");
    expect(advanceBoot("opening", "ready")).toBe("ready");
    expect(advanceBoot("ready", "alive")).toBe("ready");
  });

  it("distingue el fallo si el script llegó y no pintó", () => {
    expect(bootFailureMessage("opening")).toContain("volver al laboratorio");
    expect(bootFailureMessage("alive")).toContain("no ha terminado de arrancar");
    expect(bootFailureMessage("alive")).not.toContain("salir del laboratorio");
  });

  it("escribe allow solo con los permisos declarados", () => {
    expect(iframeAllow([])).toBe("");
    expect(iframeAllow(["camera", "geolocation"])).toBe("camera; geolocation");
  });
});
