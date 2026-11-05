import { describe, expect, it } from "vitest";
import { occupiesScreen, planFullscreen, type FullscreenFacts } from "./fullscreen";

const browser: FullscreenFacts = {
  standardRequest: true,
  webkitRequest: false,
  enabled: true,
  webkitEnabled: undefined,
  occupiesScreen: false,
};

describe("pantalla completa", () => {
  it("distingue la app instalada de una sesión nativa ya abierta", () => {
    expect(
      occupiesScreen({
        displayModeStandalone: true,
        displayModeFullscreen: false,
        fullscreenElement: false,
      }),
    ).toBe(true);
    expect(
      occupiesScreen({
        displayModeStandalone: false,
        displayModeFullscreen: false,
        fullscreenElement: false,
        navigatorStandalone: true,
      }),
    ).toBe(true);
    expect(
      occupiesScreen({
        displayModeStandalone: false,
        displayModeFullscreen: true,
        fullscreenElement: false,
      }),
    ).toBe(true);
    expect(
      occupiesScreen({
        displayModeStandalone: false,
        displayModeFullscreen: true,
        fullscreenElement: true,
      }),
    ).toBe(false);
    expect(
      occupiesScreen({
        displayModeStandalone: false,
        displayModeFullscreen: false,
        fullscreenElement: false,
      }),
    ).toBe(false);
  });

  it("oculta el botón si la ventana ya está ocupada", () => {
    expect(planFullscreen({ ...browser, occupiesScreen: true })).toBe("hidden");
  });

  it("usa la API estándar cuando el motor la ofrece", () => {
    expect(planFullscreen(browser)).toBe("native");
    expect(planFullscreen({ ...browser, enabled: undefined })).toBe("native");
  });

  it("no llama a una API que el motor dice que no puede usarse", () => {
    expect(planFullscreen({ ...browser, enabled: false })).toBe("css");
    expect(
      planFullscreen({
        standardRequest: false,
        webkitRequest: false,
        enabled: false,
        webkitEnabled: false,
        occupiesScreen: false,
      }),
    ).toBe("css");
  });

  it("reserva el prefijo para cuando no existe el método estándar", () => {
    expect(
      planFullscreen({
        standardRequest: false,
        webkitRequest: true,
        enabled: undefined,
        webkitEnabled: true,
        occupiesScreen: false,
      }),
    ).toBe("native");
    expect(
      planFullscreen({
        standardRequest: true,
        webkitRequest: true,
        enabled: false,
        webkitEnabled: true,
        occupiesScreen: false,
      }),
    ).toBe("css");
  });
});
