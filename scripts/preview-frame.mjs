import { readFileSync, renameSync, statSync, unlinkSync } from "node:fs";
import { runProcess } from "./preview-encode.mjs";

/** Tiene que coincidir con `apps/world/src/preview-frame.ts`. */
export const PREVIEW_STILL_WIDTH = 640;
export const PREVIEW_STILL_HEIGHT = 360;
export const PREVIEW_STILL_MAX_BYTES = 150 * 1024;

/**
 * @param {number} width
 * @param {number} height
 */
export function previewStillIssues(width, height) {
  if (width === PREVIEW_STILL_WIDTH && height === PREVIEW_STILL_HEIGHT) return [];
  return [`mide ${width}×${height}; el estándar es ${PREVIEW_STILL_WIDTH}×${PREVIEW_STILL_HEIGHT} (16:9)`];
}

/**
 * Ancho y alto de un PNG o un WebP (VP8, VP8L o VP8X), sin ffprobe.
 * La CI no instala ffmpeg; el catálogo tiene que poder comprobar el marco igual.
 * @param {Buffer} buffer
 * @returns {{ width: number, height: number } | null}
 */
export function imageSize(buffer) {
  if (buffer.length >= 24 && buffer[0] === 0x89 && buffer.toString("ascii", 1, 4) === "PNG") {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer.length < 12 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") {
    return null;
  }
  let offset = 12;
  /** @type {{ width: number, height: number } | null} */
  let frame = null;
  while (offset + 8 <= buffer.length) {
    const tag = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (tag === "VP8X" && start + 10 <= buffer.length) {
      const width = (buffer[start + 4] | (buffer[start + 5] << 8) | (buffer[start + 6] << 16)) + 1;
      const height = (buffer[start + 7] | (buffer[start + 8] << 8) | (buffer[start + 9] << 16)) + 1;
      return { width, height };
    }
    if (tag === "VP8 " && start + 10 <= buffer.length && (buffer[start] & 1) === 0) {
      frame = {
        width: buffer.readUInt16LE(start + 6) & 0x3fff,
        height: buffer.readUInt16LE(start + 8) & 0x3fff,
      };
    } else if (tag === "VP8L" && start + 5 <= buffer.length && buffer[start] === 0x2f) {
      const bits = buffer.readUInt32LE(start + 1);
      frame = { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    offset = start + size + (size & 1);
  }
  return frame;
}

/**
 * @param {string} file
 */
export async function readImageSize(file) {
  const size = imageSize(readFileSync(file));
  if (!size?.width || !size?.height) throw new Error(`Sin tamaño de imagen: ${file}`);
  return size;
}

/**
 * @param {string} file
 */
async function padColor(file) {
  const { width, height } = await readImageSize(file);
  const raw = await runProcess(
    "ffmpeg",
    ["-v", "error", "-i", file, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"],
    { pipe: true },
  );
  const expected = width * height * 3;
  if (raw.length < expected) throw new Error(`Frame corto al leer ${file}`);
  const patch = Math.max(1, Math.min(4, width, height));
  const corners = [
    [0, 0],
    [width - patch, 0],
    [0, height - patch],
    [width - patch, height - patch],
  ];
  let red = 0;
  let green = 0;
  let blue = 0;
  let count = 0;
  for (const [originX, originY] of corners) {
    for (let y = 0; y < patch; y += 1) {
      for (let x = 0; x < patch; x += 1) {
        const index = ((originY + y) * width + (originX + x)) * 3;
        red += raw[index] ?? 0;
        green += raw[index + 1] ?? 0;
        blue += raw[index + 2] ?? 0;
        count += 1;
      }
    }
  }
  const channel = (sum) => Math.round(sum / count).toString(16).padStart(2, "0");
  return `${channel(red)}${channel(green)}${channel(blue)}`;
}

/**
 * Mete la captura entera en 640×360, centrada. Si ya cumple, no la reescribe.
 * @param {string} file
 */
export async function normalizePreviewStill(file) {
  const current = await readImageSize(file);
  if (current.width === PREVIEW_STILL_WIDTH && current.height === PREVIEW_STILL_HEIGHT) return false;
  const color = await padColor(file);
  const webp = file.endsWith(".webp");
  const tmp = webp ? `${file.slice(0, -".webp".length)}.norm.webp` : `${file}.norm.png`;
  const filter = [
    `scale=${PREVIEW_STILL_WIDTH}:${PREVIEW_STILL_HEIGHT}:force_original_aspect_ratio=decrease:flags=lanczos`,
    `pad=${PREVIEW_STILL_WIDTH}:${PREVIEW_STILL_HEIGHT}:(ow-iw)/2:(oh-ih)/2:0x${color}`,
    "setsar=1",
  ].join(",");
  let quality = 74;
  try {
    for (;;) {
      const codec = webp ? ["-c:v", "libwebp", "-quality", String(quality)] : ["-c:v", "png"];
      await runProcess(
        "ffmpeg",
        ["-y", "-i", file, "-frames:v", "1", "-vf", filter, ...codec, tmp],
        { pipe: true },
      );
      if (!webp || statSync(tmp).size <= PREVIEW_STILL_MAX_BYTES || quality <= 42) break;
      quality -= 8;
    }
    const written = await readImageSize(tmp);
    const issues = previewStillIssues(written.width, written.height);
    if (issues.length > 0) throw new Error(`${file}: ${issues.join("; ")}`);
    renameSync(tmp, file);
  } catch (error) {
    try {
      unlinkSync(tmp);
    } catch {
      // no llegó a escribirse
    }
    throw error;
  }
  return true;
}
