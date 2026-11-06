import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { LOUNGE_NPCS } from "./lounge-layout";
import {
  NAMEPLATE_GLYPH,
  NAMEPLATE_MARK_BY_ID,
  NAMEPLATE_METRICS as M,
  NAMEPLATE_UPDATE_SUFFIX,
  estimateMarkWidth,
  estimateNameWidth,
  nameplateMark,
  planarGaze,
  projectToScreen,
  resolveNameplates,
  type NameplateCandidate,
  type NameplateMode,
} from "./nameplates";

function marker(partial: Partial<NameplateCandidate> & { id: string }): NameplateCandidate {
  return {
    x: 400,
    y: 300,
    inView: true,
    distance: 4,
    inRange: false,
    gaze: 0.2,
    nameWidth: 90,
    ...partial,
  };
}

function modes(candidates: NameplateCandidate[], previous: string | null = null): Record<string, NameplateMode> {
  const { decisions } = resolveNameplates(candidates, previous);
  return Object.fromEntries(decisions.map((decision) => [decision.id, decision.mode]));
}

describe("etiquetas del lobby", () => {
  it("reserva el nombre para el objetivo en rango y lo marca como cercano", () => {
    const candidates = [
      marker({ id: "arcade", distance: 2, inRange: true, gaze: 0.4, x: 200 }),
      marker({ id: "inventor", distance: 3, gaze: 0.99, x: 900 }),
    ];
    const { focusId, decisions } = resolveNameplates(candidates);
    expect(focusId).toBe("arcade");
    expect(modes(candidates)).toEqual({ arcade: "name", inventor: "pip" });
    expect(decisions.find((item) => item.id === "arcade")?.near).toBe(true);
    expect(decisions.find((item) => item.id === "inventor")?.near).toBe(false);
  });

  it("si hay varios en rango, el nombre es el más cercano, el mismo del botón", () => {
    const candidates = [
      marker({ id: "naipe", distance: 1.6, inRange: true, gaze: 0.95, x: 100 }),
      marker({ id: "remolon", distance: 1.2, inRange: true, gaze: 0.4, x: 700 }),
    ];
    expect(modes(candidates).remolon).toBe("name");
    expect(modes(candidates).naipe).toBe("pip");
  });

  it("no pone otro nombre si el de interacción queda fuera de pantalla", () => {
    const candidates = [
      marker({ id: "remolon", distance: 1.1, inRange: true, inView: false, gaze: 0.2 }),
      marker({ id: "naipe", distance: 3, gaze: 0.99, x: 500 }),
    ];
    const { focusId, decisions } = resolveNameplates(candidates);
    expect(focusId).toBeNull();
    expect(modes(candidates)).toEqual({ remolon: "hidden", naipe: "pip" });
    expect(decisions.every((item) => !item.near)).toBe(true);
  });

  it("sin rango, el nombre es al que se mira y el resto cercano queda en punto", () => {
    const candidates = [
      marker({ id: "brasa", distance: 2.4, gaze: 0.3, x: 80 }),
      marker({ id: "croquis", distance: 4.2, gaze: 0.94, x: 860 }),
    ];
    expect(modes(candidates)).toEqual({ brasa: "pip", croquis: "name" });
    expect(resolveNameplates(candidates).decisions.find((item) => item.id === "croquis")?.near).toBe(false);
  });

  it("no promociona a nombre a quien está lejos o de lado", () => {
    const far = marker({ id: "pizarra", distance: M.pipDistance + 0.2, gaze: 0.99 });
    const aside = marker({ id: "inventor", distance: 3, gaze: M.gazeMin - 0.02, x: 900 });
    expect(modes([far, aside])).toEqual({ pizarra: "hidden", inventor: "pip" });
  });

  it("conserva el foco de mirada hasta que otro destaca de verdad", () => {
    const previous = [
      marker({ id: "brasa", distance: 4, gaze: 0.9, x: 200 }),
      marker({ id: "naipe", distance: 4.1, gaze: 0.93, x: 760 }),
    ];
    expect(resolveNameplates(previous, "brasa").focusId).toBe("brasa");

    const turned = [
      marker({ id: "brasa", distance: 4, gaze: 0.9, x: 200 }),
      marker({ id: "naipe", distance: 4.1, gaze: 0.9 + M.gazeStick + 0.02, x: 760 }),
    ];
    expect(resolveNameplates(turned, "brasa").focusId).toBe("naipe");
  });

  it("cede el foco de mirada si te acercas claramente a otro", () => {
    const candidates = [
      marker({ id: "brasa", distance: 5.4, gaze: 0.91, x: 180 }),
      marker({ id: "naipe", distance: 3.2, gaze: 0.93, x: 780 }),
    ];
    expect(resolveNameplates(candidates, "brasa").focusId).toBe("naipe");
  });

  it("al salir del rango mantiene el nombre, ya sin el ámbar, si sigues mirándolo", () => {
    const inRange = [marker({ id: "inventor", distance: 1.8, inRange: true, gaze: 0.9 })];
    const first = resolveNameplates(inRange);
    expect(first.decisions[0]).toMatchObject({ mode: "name", near: true });

    const steppedOut = [marker({ id: "inventor", distance: 3.2, inRange: false, gaze: 0.9 })];
    const second = resolveNameplates(steppedOut, first.focusId);
    expect(second.focusId).toBe("inventor");
    expect(second.decisions[0]).toMatchObject({ mode: "name", near: false });
  });

  it("al entrar en rango el nombre pasa al objetivo del botón aunque miraras a otro", () => {
    const candidates = [
      marker({ id: "arcade", distance: 2, inRange: true, gaze: 0.4, x: 160 }),
      marker({ id: "inventor", distance: 4, gaze: 0.97, x: 820 }),
    ];
    expect(resolveNameplates(candidates, "inventor").focusId).toBe("arcade");
  });

  it("desempata por mirada y luego por id estable", () => {
    const tied = [
      marker({ id: "naipe", distance: 3, gaze: 0.9, x: 100 }),
      marker({ id: "brasa", distance: 3, gaze: 0.9, x: 800 }),
    ];
    expect(resolveNameplates(tied).focusId).toBe("brasa");
    const closerGaze = [
      marker({ id: "naipe", distance: 3.2, gaze: 0.91, x: 100 }),
      marker({ id: "brasa", distance: 3, gaze: 0.9, x: 800 }),
    ];
    expect(resolveNameplates(closerGaze).focusId).toBe("naipe");
  });

  it("nunca deja dos nombres y esconde el punto que pisa la pastilla", () => {
    const candidates = [
      marker({ id: "remolon", x: 200, y: 200, distance: 1.4, inRange: true, gaze: 0.8, nameWidth: 120 }),
      marker({ id: "brasa", x: 200, y: 190, distance: 2.2, gaze: 0.7 }),
      marker({ id: "croquis", x: 620, y: 200, distance: 3.4, gaze: 0.4 }),
      marker({ id: "pizarra", x: 620, y: 200, distance: M.pipDistance + 1, gaze: 0.99 }),
    ];
    const result = modes(candidates);
    expect(Object.values(result).filter((mode) => mode === "name")).toEqual(["name"]);
    expect(result).toEqual({ remolon: "name", brasa: "hidden", croquis: "pip", pizarra: "hidden" });
  });

  it("entre puntos solapados se queda el más cercano", () => {
    const candidates = [
      marker({ id: "lejos", x: 300, y: 240, distance: 6, gaze: 0.4 }),
      marker({ id: "cerca", x: 304, y: 240, distance: 2.5, gaze: 0.4 }),
      marker({ id: "aparte", x: 900, y: 240, distance: 7, gaze: 0.2 }),
    ];
    expect(modes(candidates)).toEqual({ lejos: "hidden", cerca: "pip", aparte: "pip" });
  });

  it("no muestra nada si no hay candidatos", () => {
    expect(resolveNameplates([])).toEqual({ focusId: null, decisions: [] });
  });

  it("estima la pastilla más ancha con el aviso de prototipo nuevo", () => {
    const plain = estimateNameWidth("Arcade");
    const updated = estimateNameWidth("Arcade", true);
    expect(plain).toBeGreaterThan(estimateNameWidth("Naipe"));
    expect(updated - plain).toBeGreaterThanOrEqual(Math.floor(NAMEPLATE_UPDATE_SUFFIX.length * M.charPx));
    expect(updated - plain).toBeLessThanOrEqual(Math.ceil(NAMEPLATE_UPDATE_SUFFIX.length * M.charPx));
  });

  it("da a cada interactuable un glifo y reserva el ancho del icono", () => {
    expect(nameplateMark("radio")).toBe("note");
    expect(NAMEPLATE_GLYPH.note).toBe("\u266A");
    expect(nameplateMark("chalkboard")).toBe("look");
    expect(NAMEPLATE_GLYPH.look).toBe("\u270E");
    expect(nameplateMark("arcade")).toBe("play");
    expect(NAMEPLATE_GLYPH.play).toBe("\u{1F680}\uFE0E");
    expect(nameplateMark("inventor")).toBe("talk");
    for (const npc of LOUNGE_NPCS) expect(nameplateMark(npc.id), npc.id).toBe("talk");
    expect(NAMEPLATE_GLYPH.talk).toBe("\u{1F5E8}");
    expect(nameplateMark("bench")).toBeNull();
    expect(Object.keys(NAMEPLATE_MARK_BY_ID).sort()).toEqual(
      ["arcade", "brasa", "chalkboard", "croquis", "inventor", "naipe", "radio", "remolon"].sort(),
    );

    expect(estimateMarkWidth()).toBe(M.markWidth);
    expect(estimateMarkWidth(true) - estimateMarkWidth()).toBe(
      Math.ceil(NAMEPLATE_UPDATE_SUFFIX.length * M.charPx),
    );
  });

  it("pinta el glifo en la pastilla y en el punto, sin el texto del nombre", () => {
    const css = readFileSync(new URL("./style.css", import.meta.url), "utf8");
    expect(css).toContain("content: var(--nameplate-glyph)");
    expect(css).not.toContain('content: "♪ "');
    expect(css).toContain(".nameplate-pip--mark");
    expect(css).not.toContain(".nameplate-pip--note");
  });
});

describe("proyección y mirada de las etiquetas", () => {
  it("mide la mirada en el plano del suelo", () => {
    expect(planarGaze(0, 0, 0, -1, 0, -5)).toBeCloseTo(1, 5);
    expect(planarGaze(0, 0, 0, -1, 5, 0)).toBeCloseTo(0, 5);
    expect(planarGaze(0, 0, 0, -1, 0, 4)).toBe(0);
    expect(planarGaze(0, 0, 0, -1, 1, -1)).toBeCloseTo(Math.SQRT1_2, 5);
    expect(planarGaze(1, 1, 0, 0, 1,01, 1)).toBe(1);
  });

  it("proyecta al centro lo que está delante y descarta lo de detrás", () => {
    const identity = new Array<number>(16).fill(0);
    identity[0] = 1;
    identity[5] = 1;
    identity[10] = 1;
    identity[15] = 1;
    expect(projectToScreen(0, 0, 0, identity, 200, 100)).toEqual({ x: 100, y: 50, inView: true });
    expect(projectToScreen(0.5, 0, 0, identity, 200, 100).x).toBeCloseTo(150, 5);
    expect(projectToScreen(0, 0, 2, identity, 200, 100).inView).toBe(false);

    const behind = identity.slice();
    behind[15] = 0;
    behind[11] = -1;
    expect(projectToScreen(0, 0, 1, behind, 200, 100).inView).toBe(false);
    expect(projectToScreen(0, 0, 0, identity, 0, 100).inView).toBe(false);
  });
});
