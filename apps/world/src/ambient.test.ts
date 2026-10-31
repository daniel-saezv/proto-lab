import { describe, expect, it } from "vitest";
import { pickSlackerLine, SLOUCHER_LINES } from "./ambient";

describe("ambient del lobby", () => {
  it("elige frases perezosas en español de forma estable", () => {
    expect(SLOUCHER_LINES.length).toBeGreaterThan(2);
    expect(pickSlackerLine(0)).toBe(SLOUCHER_LINES[0]);
    expect(pickSlackerLine(1)).toBe(SLOUCHER_LINES[1]);
    expect(pickSlackerLine(99)).toBe(SLOUCHER_LINES[99 % SLOUCHER_LINES.length]);
  });
});
