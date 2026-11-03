import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

/** Clip de la tele. Lo genera `pnpm previews`; la CI solo lo comprueba. */
export const PREVIEW_MOTION_FILE = "preview.mp4";
export const PREVIEW_STAMP_FILE = "preview-src.sha256";
export const PREVIEW_MAX_BYTES = 160 * 1024;
export const PREVIEW_TARGET_BYTES = 120 * 1024;
export const PREVIEW_MAX_WIDTH = 320;
export const PREVIEW_MAX_HEIGHT = 180;
export const PREVIEW_FPS = 12;
export const PREVIEW_SECONDS = 3;

const SKIP_DIR = new Set(["node_modules", "dist", ".git"]);
const SKIP_FILE = new Set([
  "proto.json",
  "preview.webp",
  "preview.png",
  "preview.jpg",
  "preview.jpeg",
  PREVIEW_MOTION_FILE,
  PREVIEW_STAMP_FILE,
]);

/**
 * Hash de las fuentes que cambian lo que se ve.
 * Fuera: metadatos del manifiesto, las propias previews y dependencias.
 * @param {string} protoDir
 */
export function hashPreviewSources(protoDir) {
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name.startsWith(".")) continue;
      const abs = join(dir, name);
      const info = statSync(abs);
      if (info.isDirectory()) {
        if (SKIP_DIR.has(name)) continue;
        walk(abs);
        continue;
      }
      if (!info.isFile() || SKIP_FILE.has(name)) continue;
      files.push(abs);
    }
  };
  walk(protoDir);
  files.sort((a, b) => relative(protoDir, a).localeCompare(relative(protoDir, b)));
  const hash = createHash("sha256");
  for (const abs of files) {
    const rel = relative(protoDir, abs).split("\\").join("/");
    hash.update(rel);
    hash.update("\0");
    hash.update(readFileSync(abs));
    hash.update("\0");
  }
  return hash.digest("hex");
}

/**
 * @param {string} protoDir
 */
export function writePreviewStamp(protoDir) {
  const hex = hashPreviewSources(protoDir);
  writeFileSync(join(protoDir, PREVIEW_STAMP_FILE), `${hex}\n`);
  return hex;
}

/**
 * @param {Buffer} buf
 * @param {number} start
 * @param {number} end
 */
function* boxes(buf, start, end) {
  let offset = start;
  while (offset + 8 <= end) {
    let size = buf.readUInt32BE(offset);
    const type = buf.toString("latin1", offset + 4, offset + 8);
    let header = 8;
    if (size === 1) {
      if (offset + 16 > end) break;
      size = Number(buf.readBigUInt64BE(offset + 8));
      header = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size < header || offset + size > end) break;
    yield { type, start: offset, header, end: offset + size };
    offset += size;
  }
}

function childBoxes(buf, box) {
  return [...boxes(buf, box.start + box.header, box.end)];
}

function findBox(list, type) {
  return list.find((box) => box.type === type) ?? null;
}

function findDeep(buf, box, type) {
  if (box.type === type) return box;
  for (const child of childBoxes(buf, box)) {
    const found = findDeep(buf, child, type);
    if (found) return found;
  }
  return null;
}

function handlerType(buf, hdlr) {
  const payload = hdlr.start + hdlr.header;
  if (payload + 12 > hdlr.end) return "";
  return buf.toString("latin1", payload + 8, payload + 12);
}

function readTrack(buf, trak) {
  const hdlr = findDeep(buf, trak, "hdlr");
  const kind = hdlr ? handlerType(buf, hdlr) : "";
  const tkhd = findDeep(buf, trak, "tkhd");
  const mdhd = findDeep(buf, trak, "mdhd");
  let width = 0;
  let height = 0;
  let timescale = 0;
  let duration = 0;
  if (tkhd) {
    const payload = tkhd.start + tkhd.header;
    const version = buf[payload] ?? 0;
    const widthAt = payload + (version === 1 ? 88 : 76);
    if (widthAt + 8 <= tkhd.end) {
      width = buf.readUInt32BE(widthAt) / 65536;
      height = buf.readUInt32BE(widthAt + 4) / 65536;
    }
  }
  if (mdhd) {
    const payload = mdhd.start + mdhd.header;
    const version = buf[payload] ?? 0;
    if (version === 1 && payload + 32 <= mdhd.end) {
      timescale = buf.readUInt32BE(payload + 20);
      duration = Number(buf.readBigUInt64BE(payload + 24));
    } else if (payload + 20 <= mdhd.end) {
      timescale = buf.readUInt32BE(payload + 12);
      duration = buf.readUInt32BE(payload + 16);
    }
  }
  const stts = findDeep(buf, trak, "stts");
  let samples = 0;
  let delta = 0;
  if (stts) {
    const payload = stts.start + stts.header;
    if (payload + 8 <= stts.end) {
      const count = buf.readUInt32BE(payload + 4);
      for (let i = 0; i < count; i++) {
        const at = payload + 8 + i * 8;
        if (at + 8 > stts.end) break;
        const sampleCount = buf.readUInt32BE(at);
        samples += sampleCount;
        delta = buf.readUInt32BE(at + 4);
      }
    }
  }
  const stsd = findDeep(buf, trak, "stsd");
  let baseline = false;
  let avc = false;
  if (stsd) {
    const entries = [...boxes(buf, stsd.start + stsd.header + 8, stsd.end)];
    for (const entry of entries) {
      if (entry.type !== "avc1" && entry.type !== "avc3") continue;
      avc = true;
      const avcC = [...boxes(buf, entry.start + 86, entry.end)].find((box) => box.type === "avcC");
      if (!avcC) continue;
      const profile = buf[avcC.start + avcC.header + 1];
      if (profile === 66) baseline = true;
    }
  }
  const seconds = timescale > 0 ? duration / timescale : 0;
  const fps = delta > 0 && timescale > 0 ? timescale / delta : seconds > 0 ? samples / seconds : 0;
  return { kind, width, height, seconds, fps, samples, baseline, avc };
}

/**
 * @param {Buffer} buf
 */
export function inspectMp4(buf) {
  const top = [...boxes(buf, 0, buf.length)];
  const ftyp = top[0]?.type === "ftyp" ? top[0] : null;
  const moov = findBox(top, "moov");
  const mdat = findBox(top, "mdat");
  const faststart = Boolean(moov && mdat && moov.start < mdat.start);
  const tracks = (moov ? childBoxes(buf, moov) : [])
    .filter((box) => box.type === "trak")
    .map((trak) => readTrack(buf, trak));
  const video = tracks.find((track) => track.kind === "vide") ?? null;
  const audio = tracks.some((track) => track.kind === "soun");
  return {
    bytes: buf.length,
    ftyp: Boolean(ftyp),
    faststart,
    audio,
    video,
  };
}

/**
 * @param {Buffer} buf
 * @param {string} label
 */
export function assertPreviewMotionBuffer(buf, label) {
  if (buf.length > PREVIEW_MAX_BYTES) {
    throw new Error(`${label}: pesa ${buf.length} bytes (tope ${PREVIEW_MAX_BYTES})`);
  }
  const info = inspectMp4(buf);
  if (!info.ftyp || !info.video) throw new Error(`${label}: no es un MP4 con vídeo`);
  if (!info.faststart) throw new Error(`${label}: moov tiene que ir antes de mdat (faststart)`);
  if (info.audio) throw new Error(`${label}: el clip no puede llevar audio`);
  if (!info.video.avc || !info.video.baseline) throw new Error(`${label}: hace falta H.264 Baseline`);
  if (info.video.width > PREVIEW_MAX_WIDTH || info.video.height > PREVIEW_MAX_HEIGHT) {
    throw new Error(`${label}: ${info.video.width}×${info.video.height} pasa de ${PREVIEW_MAX_WIDTH}×${PREVIEW_MAX_HEIGHT}`);
  }
  if (info.video.width < 2 || info.video.height < 2) throw new Error(`${label}: tamaño de vídeo vacío`);
  if (Math.abs(info.video.seconds - PREVIEW_SECONDS) > 0.2) {
    throw new Error(`${label}: dura ${info.video.seconds.toFixed(2)} s (esperado ${PREVIEW_SECONDS})`);
  }
  if (Math.abs(info.video.fps - PREVIEW_FPS) > 0.51) {
    throw new Error(`${label}: va a ${info.video.fps.toFixed(2)} fps (esperado ${PREVIEW_FPS})`);
  }
  return info;
}

/**
 * @param {string} protoDir
 */
export function assertPreviewMotion(protoDir) {
  const slug = protoDir.split("/").pop();
  const file = join(protoDir, PREVIEW_MOTION_FILE);
  const stampPath = join(protoDir, PREVIEW_STAMP_FILE);
  if (!existsSync(file)) throw new Error(`${slug}: falta ${PREVIEW_MOTION_FILE}. Ejecuta pnpm previews y commitea el clip.`);
  if (!existsSync(stampPath)) throw new Error(`${slug}: falta ${PREVIEW_STAMP_FILE}. Ejecuta pnpm previews.`);
  assertPreviewMotionBuffer(readFileSync(file), slug ?? file);
  const expected = hashPreviewSources(protoDir);
  const actual = readFileSync(stampPath, "utf8").trim();
  if (actual !== expected) {
    throw new Error(`${slug}: la preview no está fresca respecto a las fuentes. Ejecuta pnpm previews.`);
  }
}

/**
 * @param {string} repoRoot
 */
export function assertAllPreviewMotion(repoRoot) {
  const protosDir = join(repoRoot, "protos");
  for (const name of readdirSync(protosDir).sort()) {
    const protoDir = join(protosDir, name);
    if (!statSync(protoDir).isDirectory()) continue;
    if (!existsSync(join(protoDir, "proto.json"))) continue;
    assertPreviewMotion(protoDir);
  }
}
