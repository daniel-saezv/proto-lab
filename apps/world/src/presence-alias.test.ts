import { describe, expect, it } from "vitest";
import { sanitizePresenceNameInput } from "./presence-alias-shared";

describe("alias de la sala", () => {
  it("recorta y quita control", () => {
    expect(sanitizePresenceNameInput("  Ana  ")).toBe("Ana");
    expect(sanitizePresenceNameInput("a".repeat(40))).toHaveLength(24);
  });

  it("rechaza arroba y vacío tras limpiar", () => {
    expect(sanitizePresenceNameInput("x@y")).toBe("");
    expect(sanitizePresenceNameInput("   ")).toBe("");
  });
});
