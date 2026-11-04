import { renameSync, statSync, unlinkSync } from "node:fs";
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
 * @param {string} file
 */
export async function readImageSize(file) {
  const raw = await runProcess(
    "ffprobe",
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=s=x:p=0", file],
    { pipe: true },
  );
  const [width, height] = raw.toString().trim().split("x").map((part) => Number(part));
  if (!width || !height) throw new Error(`Sin tamaño de imagen: ${file}`);
  return { width, height };
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
