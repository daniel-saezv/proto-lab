import { describe, expect, it } from "vitest";
import {
  DBLCLICK_TOUCH_WINDOW_MS,
  LOCKED_VIEWPORT,
  FREE_VIEWPORT,
  pageZoomAllowed,
  shouldCancelDblclick,
  touchStampFromPointer,
  viewportContentFor,
} from "./page-zoom";

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

  it("cancela el doble toque táctil y no el doble clic del ratón", () => {
    expect(touchStampFromPointer({ pointerType: "mouse", timeStamp: 10 })).toBeNull();
    expect(touchStampFromPointer({ pointerType: "pen", timeStamp: 10 })).toBeNull();
    expect(touchStampFromPointer({ pointerType: "touch" })).toBeNull();
    expect(touchStampFromPointer({ pointerType: "touch", timeStamp: 40 })).toBe(40);

    expect(shouldCancelDblclick({ timeStamp: 100 }, 0)).toBe(false);
    expect(shouldCancelDblclick({ timeStamp: 100, sourceCapabilities: { firesTouchEvents: false } }, 0)).toBe(false);
    expect(shouldCancelDblclick({ timeStamp: 100, sourceCapabilities: { firesTouchEvents: true } }, 0)).toBe(true);
    expect(shouldCancelDblclick({ timeStamp: 100 }, 100)).toBe(true);
    expect(shouldCancelDblclick({ timeStamp: 100 + DBLCLICK_TOUCH_WINDOW_MS }, 100)).toBe(true);
    expect(shouldCancelDblclick({ timeStamp: 101 + DBLCLICK_TOUCH_WINDOW_MS }, 100)).toBe(false);
    expect(shouldCancelDblclick({ timeStamp: 50 }, 100)).toBe(false);
    expect(shouldCancelDblclick({}, 100)).toBe(false);
  });
});
