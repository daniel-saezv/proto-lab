import { describe, expect, it } from "vitest";
import { encodePreviewArgs, evenCrop, motionFilter, motionSeek } from "./preview-encode.mjs";

describe("argumentos del clip", () => {
  it("corta después de abrir el archivo, sin audio y en baseline faststart", () => {
    const args = encodePreviewArgs("in.webm", "out.mp4", { ss: 1.25, crf: 32 });
    expect(args.indexOf("-ss")).toBeGreaterThan(args.indexOf("-i"));
    expect(args).toContain("-an");
    expect(args).toContain("baseline");
    expect(args).toContain("+faststart");
    expect(args).toContain("-bf");
    expect(args).toContain("yuv420p");
    expect(motionFilter()).toContain("320:180");
    expect(motionFilter()).toContain("setsar=1");
    expect(motionFilter()).toContain("fps=12");
    expect(motionFilter({ x: 10, y: 20, w: 100, h: 200 })).toContain("crop=100:200:10:20");
    expect(evenCrop({ x: 1.2, y: 3.8, width: 101, height: 81 })).toEqual({ x: 1, y: 3, w: 100, h: 80 });
  });

  it("busca los últimos 3 s y descarta una grabación corta", () => {
    expect(motionSeek(5.8)).toBe(2.72);
    expect(motionSeek(3.2)).toBe(0.12);
    expect(motionSeek(3.1)).toBeNull();
    expect(motionSeek(Number.NaN)).toBeNull();
  });
});
