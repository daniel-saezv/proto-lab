import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { chooseClip, clipWithinViewport, largestBox } from "./preview-shot.mjs";

const root = dirname(fileURLToPath(import.meta.url));

describe("recorte de la vista previa", () => {
  const viewport = { width: 390, height: 844 };

  it("elige el canvas más grande y lo recorta a la ventana", () => {
    const clip = chooseClip(
      [
        { x: 10, y: 20, width: 40, height: 40 },
        { x: 0, y: 100, width: 390, height: 900 },
      ],
      viewport,
    );
    expect(clip).toEqual({ x: 0, y: 100, width: 390, height: 744 });
  });

  it("ignora un canvas diminuto y deja la ventana entera", () => {
    expect(largestBox([{ x: 0, y: 0, width: 4, height: 4 }])).toBeNull();
    expect(chooseClip([{ x: 0, y: 0, width: 4, height: 4 }], viewport)).toBeNull();
    expect(chooseClip([], viewport)).toBeNull();
  });

  it("descarta un canvas fuera de la ventana", () => {
    expect(clipWithinViewport({ x: 400, y: 10, width: 80, height: 80 }, viewport)).toBeNull();
  });
});

describe("captura genérica", () => {
  it("no depende del gancho de una aplicación concreta", () => {
    const source = readFileSync(join(root, "capture-previews.mjs"), "utf8");
    expect(source).not.toContain("__chispa");
    expect(source).toContain("__protoLabPreview");
    expect(source).toContain("chooseClip");
    expect(source).toContain("PROTO_LAB_SKIP_PREVIEW_CHECK");
    expect(source).toContain("PREVIEW_MOTION_FILE");
    expect(source).toContain("writePreviewStamp");
    expect(source).toContain("recordMotion");
    expect(source).toContain("motionSeek");
  });
});
