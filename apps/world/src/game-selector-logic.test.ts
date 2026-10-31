import { describe, expect, it } from "vitest";
import { selectorKeyAction, stepIndex, wrapIndex } from "./game-selector-logic";

describe("game-selector-logic", () => {
  it("envuelve el índice", () => {
    expect(wrapIndex(0, 3)).toBe(0);
    expect(wrapIndex(3, 3)).toBe(0);
    expect(wrapIndex(-1, 3)).toBe(2);
    expect(wrapIndex(4, 3)).toBe(1);
  });

  it("avanza y retrocede con wrap-around", () => {
    expect(stepIndex(0, 1, 2)).toBe(1);
    expect(stepIndex(1, 1, 2)).toBe(0);
    expect(stepIndex(0, -1, 2)).toBe(1);
  });

  it("mapea teclado", () => {
    expect(selectorKeyAction("ArrowLeft", true)).toBe("prev");
    expect(selectorKeyAction("ArrowRight", true)).toBe("next");
    expect(selectorKeyAction("Escape", true)).toBe("close");
    expect(selectorKeyAction("Enter", true)).toBe("play");
    expect(selectorKeyAction("Enter", false)).toBe("none");
    expect(selectorKeyAction("a", true)).toBe("none");
  });
});
