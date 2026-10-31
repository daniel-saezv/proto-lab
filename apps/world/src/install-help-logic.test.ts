import { describe, expect, it } from "vitest";
import {
  detectInstallPlatform,
  installHelpKeyAction,
  isStandalonePwa,
} from "./install-help-logic";

describe("install-help-logic", () => {
  it("detecta iOS en iPhone y iPad con MacIntel", () => {
    expect(detectInstallPlatform("Mozilla iPhone", "iPhone", 5)).toBe("ios");
    expect(detectInstallPlatform("Mozilla iPad", "MacIntel", 5)).toBe("ios");
  });

  it("usa Android como plataforma por defecto", () => {
    expect(detectInstallPlatform("Mozilla Android", "Linux armv8l", 5)).toBe("android");
    expect(detectInstallPlatform("Mozilla Chrome", "Win32", 0)).toBe("android");
  });

  it("reconoce modo standalone", () => {
    expect(isStandalonePwa(true, false)).toBe(true);
    expect(isStandalonePwa(false, true)).toBe(true);
    expect(isStandalonePwa(false, false)).toBe(false);
  });

  it("cierra con Escape", () => {
    expect(installHelpKeyAction("Escape", true)).toBe("close");
    expect(installHelpKeyAction("Escape", false)).toBe("none");
    expect(installHelpKeyAction("Enter", true)).toBe("none");
  });
});
