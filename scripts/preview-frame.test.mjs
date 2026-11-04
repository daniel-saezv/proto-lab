import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readCatalog } from "./catalog-lib.mjs";
import { runProcess } from "./preview-encode.mjs";
import {
  PREVIEW_STILL_HEIGHT,
  PREVIEW_STILL_MAX_BYTES,
  PREVIEW_STILL_WIDTH,
  imageSize,
  normalizePreviewStill,
  previewStillIssues,
  readImageSize,
} from "./preview-frame.mjs";

const ffmpegOk = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;

const root = fileURLToPath(new URL("..", import.meta.url));

describe("estándar de la foto fija", () => {
  it("usa los mismos píxeles que el cliente", async () => {
    const client = await import("../apps/world/src/preview-frame.ts");
    expect(client.PREVIEW_STILL_WIDTH).toBe(PREVIEW_STILL_WIDTH);
    expect(client.PREVIEW_STILL_HEIGHT).toBe(PREVIEW_STILL_HEIGHT);
    expect(client.PREVIEW_STILL_MAX_BYTES).toBe(PREVIEW_STILL_MAX_BYTES);
    expect(previewStillIssues(PREVIEW_STILL_WIDTH, PREVIEW_STILL_HEIGHT)).toEqual([]);
    expect(previewStillIssues(390, 844)[0]).toMatch(/640×360/);
  });

  it("las fotos del catálogo cumplen el estándar", async () => {
    const entries = readCatalog(root);
    const checked = [];
    for (const entry of entries) {
      if (!entry.preview) continue;
      const file = join(root, "protos", entry.slug, entry.preview);
      const size = await readImageSize(file);
      expect(previewStillIssues(size.width, size.height), entry.slug).toEqual([]);
      expect(statSync(file).size, entry.slug).toBeLessThanOrEqual(PREVIEW_STILL_MAX_BYTES);
      checked.push(entry.slug);
    }
    expect(checked.length).toBeGreaterThan(0);
  });

  it("lee el tamaño en la cabecera, sin ffprobe", () => {
    const png = Buffer.alloc(24);
    png[0] = 0x89;
    png.write("PNG\r\n\x1a\n", 1, "ascii");
    png.writeUInt32BE(13, 8);
    png.write("IHDR", 12, "ascii");
    png.writeUInt32BE(40, 16);
    png.writeUInt32BE(120, 20);
    expect(imageSize(png)).toEqual({ width: 40, height: 120 });

    const payload = Buffer.alloc(10);
    payload[3] = 0x9d;
    payload[4] = 0x01;
    payload[5] = 0x2a;
    payload.writeUInt16LE(640, 6);
    payload.writeUInt16LE(360, 8);
    const chunk = Buffer.alloc(8 + payload.length);
    chunk.write("VP8 ", 0, "ascii");
    chunk.writeUInt32LE(payload.length, 4);
    payload.copy(chunk, 8);
    const webp = Buffer.alloc(12 + chunk.length);
    webp.write("RIFF", 0, "ascii");
    webp.writeUInt32LE(webp.length - 8, 4);
    webp.write("WEBP", 8, "ascii");
    chunk.copy(webp, 12);
    expect(imageSize(webp)).toEqual({ width: 640, height: 360 });
  });

  it("el selector recorta a 16:10 con cover", () => {
    const css = readFileSync(join(root, "apps/world/src/style.css"), "utf8");
    expect(css).toMatch(/\.selector-preview-wrap \{[^}]*aspect-ratio:\s*16\s*\/\s*10/s);
    expect(css).toMatch(/\.selector-preview \{[^}]*object-fit:\s*cover/s);
  });

  // La reescritura usa ffmpeg, que en la CI no está. El marco del catálogo se comprueba arriba, sin ese binario.
  it.skipIf(!ffmpegOk)("normaliza una captura vertical a 16:9 sin perder el centro", async () => {
    const dir = mkdtempSync(join(tmpdir(), "preview-frame-"));
    const file = join(dir, "tall.webp");
    try {
      await runProcess(
        "ffmpeg",
        ["-y", "-f", "lavfi", "-i", "color=c=0x2244aa:s=40x120", "-frames:v", "1", "-c:v", "libwebp", file],
        { pipe: true },
      );
      expect(await normalizePreviewStill(file)).toBe(true);
      expect(await normalizePreviewStill(file)).toBe(false);
      const size = await readImageSize(file);
      expect(size).toEqual({ width: PREVIEW_STILL_WIDTH, height: PREVIEW_STILL_HEIGHT });
      const raw = await runProcess(
        "ffmpeg",
        ["-v", "error", "-i", file, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"],
        { pipe: true },
      );
      const at = (x, y) => {
        const index = (y * PREVIEW_STILL_WIDTH + x) * 3;
        return [raw[index], raw[index + 1], raw[index + 2]];
      };
      const center = at(PREVIEW_STILL_WIDTH / 2, PREVIEW_STILL_HEIGHT / 2);
      const corner = at(2, 2);
      expect(center[2]).toBeGreaterThan(center[0]);
      expect(corner[2]).toBeGreaterThan(100);
      expect(statSync(file).size).toBeLessThanOrEqual(PREVIEW_STILL_MAX_BYTES);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
