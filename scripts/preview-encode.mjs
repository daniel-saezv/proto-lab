import { spawn } from "node:child_process";
import { statSync } from "node:fs";
import { PREVIEW_MAX_BYTES, PREVIEW_SECONDS, PREVIEW_TARGET_BYTES } from "./preview-motion.mjs";

export const PREVIEW_CRF_STEPS = [28, 32, 36, 40];

/**
 * Recorta el lienzo si lo conocemos y escala dentro de 320×180.
 * @param {{ w: number, h: number, x: number, y: number } | null | undefined} crop
 */
export function motionFilter(crop) {
  const cut = crop && crop.w >= 2 && crop.h >= 2 ? `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y},` : "";
  return `${cut}scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=12`;
}

/** Caja par, para que yuv420 no rechace el recorte. */
export function evenCrop(box) {
  if (!box || !(box.width >= 2) || !(box.height >= 2)) return null;
  const x = Math.max(0, Math.floor(box.x));
  const y = Math.max(0, Math.floor(box.y));
  let w = Math.floor(box.width);
  let h = Math.floor(box.height);
  if (w % 2) w -= 1;
  if (h % 2) h -= 1;
  if (w < 2 || h < 2) return null;
  return { x, y, w, h };
}

/**
 * `-ss` va después de `-i` para cortar con precisión.
 * @param {string} input
 * @param {string} output
 * @param {{ ss: number, crf: number, crop?: { w: number, h: number, x: number, y: number } | null }} options
 */
export function encodePreviewArgs(input, output, options) {
  return [
    "-y",
    "-i",
    input,
    "-ss",
    options.ss.toFixed(3),
    "-t",
    "3",
    "-an",
    "-vf",
    motionFilter(options.crop),
    "-c:v",
    "libx264",
    "-profile:v",
    "baseline",
    "-level",
    "3.0",
    "-bf",
    "0",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-crf",
    String(options.crf),
    output,
  ];
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {{ pipe?: boolean }} [options]
 */
export function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    const out = [];
    const err = [];
    child.stdout.on("data", (chunk) => {
      if (options.pipe) out.push(chunk);
    });
    child.stderr.on("data", (chunk) => err.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(out));
      else reject(new Error(`${command} salió ${code}: ${Buffer.concat(err).toString().slice(-600)}`));
    });
  });
}

/**
 * @param {string} file
 */
export async function frameSpread(file) {
  const raw = await runProcess(
    "ffmpeg",
    ["-v", "error", "-i", file, "-frames:v", "6", "-f", "rawvideo", "-pix_fmt", "gray", "pipe:1"],
    { pipe: true },
  );
  if (raw.length < 64) return 0;
  let sum = 0;
  for (const value of raw) sum += value;
  const mean = sum / raw.length;
  let variance = 0;
  for (const value of raw) {
    const delta = value - mean;
    variance += delta * delta;
  }
  return Math.sqrt(variance / raw.length);
}

/**
 * El reloj de la grabación no coincide con el de pared.
 * Nos quedamos con los últimos 3 s, que son el tramo ya asentado.
 * @param {number} duration
 * @returns {number | null}
 */
export function motionSeek(duration) {
  if (!Number.isFinite(duration)) return null;
  const tail = PREVIEW_SECONDS + 0.08;
  if (duration < tail + 0.07) return null;
  return Math.round((duration - tail) * 1000) / 1000;
}

/**
 * @param {string} file
 */
export async function mediaDuration(file) {
  const raw = await runProcess(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file],
    { pipe: true },
  );
  const seconds = Number(String(raw).trim());
  return Number.isFinite(seconds) ? seconds : 0;
}

/**
 * Prueba varios CRF hasta quedar cerca de 120 KiB, sin pasar de 160.
 * @param {string} input
 * @param {string} output
 * @param {number} ss
 * @param {{ w: number, h: number, x: number, y: number } | null} [crop]
 */
export async function encodePreviewClip(input, output, ss, crop = null) {
  let size = 0;
  for (const crf of PREVIEW_CRF_STEPS) {
    await runProcess("ffmpeg", encodePreviewArgs(input, output, { ss, crf, crop }));
    size = statSync(output).size;
    if (size <= PREVIEW_TARGET_BYTES) return { crf, size };
  }
  if (size > PREVIEW_MAX_BYTES) {
    throw new Error(`El clip pesa ${size} bytes (tope ${PREVIEW_MAX_BYTES}).`);
  }
  return { crf: PREVIEW_CRF_STEPS[PREVIEW_CRF_STEPS.length - 1], size };
}
