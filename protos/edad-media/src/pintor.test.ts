import { describe, expect, it } from "vitest";
import { carasHaciaFuera, CARAS, esFrente, ESQUINAS } from "./pintor";
import type { Camara } from "./camara";

describe("cajas", () => {
  it("orienta las caras hacia fuera", () => {
    expect(carasHaciaFuera()).toBe(true);
  });

  it("enseña la cara que mira a la cámara y esconde la de detrás", () => {
    const cam: Camara = { ojo: [0, 0, 6], mira: [0, 0, 0], fov: 0.8, aspecto: 1, cerca: 0.1, lejos: 40 };
    const frente = CARAS[0];
    const espalda = CARAS[1];
    const a = ESQUINAS[frente?.[0] ?? 0];
    const b = ESQUINAS[frente?.[1] ?? 0];
    const c = ESQUINAS[frente?.[2] ?? 0];
    const d = ESQUINAS[espalda?.[0] ?? 0];
    const e = ESQUINAS[espalda?.[1] ?? 0];
    const f = ESQUINAS[espalda?.[2] ?? 0];
    expect(a && b && c && esFrente(cam, a, b, c, 200, 200)).toBe(true);
    expect(d && e && f && esFrente(cam, d, e, f, 200, 200)).toBe(false);
  });
});
