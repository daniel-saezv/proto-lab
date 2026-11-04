import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { keyboardOverlap, longTextHasMore, SCROLL_CUE } from "./long-field";

describe("campo largo", () => {
  it("marca que queda texto por debajo y se calla al llegar al final", () => {
    expect(longTextHasMore(400, 120, 0)).toBe(true);
    expect(longTextHasMore(400, 120, 280)).toBe(false);
    expect(longTextHasMore(120, 120, 0)).toBe(false);
    expect(SCROLL_CUE).toMatch(/desliza/i);
  });

  it("mide el solape del teclado y no inventa uno negativo", () => {
    expect(keyboardOverlap(844, 500, 0)).toBe(344);
    expect(keyboardOverlap(844, 520, 20)).toBe(304);
    expect(keyboardOverlap(844, 844, 0)).toBe(0);
    expect(keyboardOverlap(Number.NaN, 100, 0)).toBe(0);
  });

  it("el diálogo usa svh de respaldo y una barra estándar", () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "style.css"), "utf8");
    const dialogue = css.slice(css.indexOf("#dialogue {"), css.indexOf("#dialogue.is-workshop {"));
    const svh = dialogue.indexOf("78svh");
    const dvh = dialogue.indexOf("78dvh");
    expect(svh).toBeGreaterThan(-1);
    expect(dvh).toBeGreaterThan(svh);
    const sheet = css.slice(css.indexOf(".dialogue-sheet {"), css.indexOf(".dialogue-sheet.is-overflowing"));
    expect(sheet).toContain("scrollbar-width: thin");
    expect(sheet).toContain("scrollbar-color:");
    expect(sheet).not.toContain("-webkit-");
    expect(css).not.toContain("::-webkit-scrollbar");
  });
});
