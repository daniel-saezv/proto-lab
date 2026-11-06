import { describe, expect, it } from "vitest";
import { proyectar, rayoSuelo, seguir } from "./camara";

describe("cámara", () => {
  it("pone el punto de mira en el centro y no proyecta lo que queda detrás", () => {
    const cam = seguir(0, 6, 390 / 844, 0, true);
    const centro = proyectar(cam, cam.mira, 390, 844);
    expect(centro).not.toBeNull();
    expect(centro?.x).toBeCloseTo(195, 1);
    expect(centro?.y).toBeCloseTo(422, 1);
    expect(proyectar(cam, [cam.ojo[0], cam.ojo[1], cam.ojo[2] + 4], 390, 844)).toBeNull();
  });

  it("devuelve al suelo el mismo punto que acaba de proyectar", () => {
    const cam = seguir(0, 6, 390 / 844, 0, true);
    const mundo = { x: 2.5, z: 4 };
    const proy = proyectar(cam, [mundo.x, 0, mundo.z], 390, 844);
    expect(proy).not.toBeNull();
    if (!proy) return;
    const ndcX = (proy.x / 390) * 2 - 1;
    const ndcY = 1 - (proy.y / 844) * 2;
    const suelo = rayoSuelo(cam, ndcX, ndcY);
    expect(suelo).not.toBeNull();
    expect(suelo?.x).toBeCloseTo(mundo.x, 1);
    expect(suelo?.z).toBeCloseTo(mundo.z, 1);
  });
});
