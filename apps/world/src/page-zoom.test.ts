import { describe, expect, it } from "vitest";
import { LOCKED_VIEWPORT, FREE_VIEWPORT, pageZoomAllowed, viewportContentFor } from "./page-zoom";

function host(selectorHit: string | null) {
  return {
    closest(selector: string) {
      if (!selectorHit) return null;
      return selector.includes(selectorHit) ? host(selectorHit) : null;
    },
  };
}

describe("zoom de la página", () => {
  it("cierra el viewport del lobby y lo abre en un campo o en la aplicación", () => {
    expect(LOCKED_VIEWPORT).toContain("user-scalable=no");
    expect(LOCKED_VIEWPORT).toContain("maximum-scale=1");
    expect(FREE_VIEWPORT).not.toContain("user-scalable");
    expect(viewportContentFor(false)).toBe(LOCKED_VIEWPORT);
    expect(viewportContentFor(true)).toBe(FREE_VIEWPORT);
  });

  it("deja escalar un campo y el escenario, y no el lienzo", () => {
    expect(pageZoomAllowed(host("textarea"))).toBe(true);
    expect(pageZoomAllowed(host("input"))).toBe(true);
    expect(pageZoomAllowed(host("#stage"))).toBe(true);
    expect(pageZoomAllowed(host(null))).toBe(false);
    expect(pageZoomAllowed(null)).toBe(false);
  });
});
