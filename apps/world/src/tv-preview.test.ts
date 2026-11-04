import { describe, expect, it } from "vitest";
import {
  TV_BLIT_SECONDS,
  TV_DECODE_RADIUS,
  TV_SCREEN_HEIGHT,
  TV_SCREEN_WIDTH,
  TV_TEXTURE_HEIGHT,
  TV_TEXTURE_WIDTH,
  shouldBlitTv,
  shouldDecodeTv,
} from "./tv-preview";

describe("tele del rincón", () => {
  it("decodifica solo cerca, con clip y sin pausas", () => {
    const near = {
      distance: TV_DECODE_RADIUS,
      reduced: false,
      suspended: false,
      hidden: false,
      hasClip: true,
    };
    expect(shouldDecodeTv(near)).toBe(true);
    expect(shouldDecodeTv({ ...near, distance: TV_DECODE_RADIUS + 0.01 })).toBe(false);
    expect(shouldDecodeTv({ ...near, reduced: true })).toBe(false);
    expect(shouldDecodeTv({ ...near, suspended: true })).toBe(false);
    expect(shouldDecodeTv({ ...near, hidden: true })).toBe(false);
    expect(shouldDecodeTv({ ...near, hasClip: false })).toBe(false);
  });

  it("sube la textura a 8 Hz y cabe en 256×144", () => {
    expect(TV_TEXTURE_WIDTH).toBe(256);
    expect(TV_TEXTURE_HEIGHT).toBe(144);
    expect(TV_SCREEN_WIDTH / TV_SCREEN_HEIGHT).toBeCloseTo(TV_TEXTURE_WIDTH / TV_TEXTURE_HEIGHT, 6);
    expect(TV_TEXTURE_WIDTH / TV_TEXTURE_HEIGHT).toBeCloseTo(16 / 9, 6);
    expect(shouldBlitTv(TV_BLIT_SECONDS)).toBe(true);
    expect(shouldBlitTv(TV_BLIT_SECONDS - 0.01)).toBe(false);
    expect(TV_BLIT_SECONDS).toBeCloseTo(1 / 8);
  });
});
