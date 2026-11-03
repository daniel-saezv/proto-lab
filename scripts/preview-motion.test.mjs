import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  PREVIEW_MAX_BYTES,
  assertPreviewMotion,
  assertPreviewMotionBuffer,
  hashPreviewSources,
  inspectMp4,
  writePreviewStamp,
} from "./preview-motion.mjs";

function u32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value);
  return buffer;
}

function box(type, payload) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.concat(payload);
  const out = Buffer.alloc(8 + body.length);
  out.writeUInt32BE(out.length, 0);
  out.write(type, 4, 4, "latin1");
  body.copy(out, 8);
  return out;
}

function sampleMp4(options = {}) {
  const width = options.width ?? 320;
  const height = options.height ?? 180;
  const timescale = options.timescale ?? 12_000;
  const delta = options.delta ?? 1000;
  const samples = options.samples ?? 36;
  const profile = options.profile ?? 66;
  const audio = options.audio ?? false;
  const faststart = options.faststart ?? true;

  const tkhd = Buffer.alloc(84);
  tkhd.writeUInt32BE(Math.round(width * 65536), 76);
  tkhd.writeUInt32BE(Math.round(height * 65536), 80);
  const mdhd = Buffer.alloc(24);
  mdhd.writeUInt32BE(timescale, 12);
  mdhd.writeUInt32BE(samples * delta, 16);
  const hdlr = Buffer.alloc(24);
  hdlr.write(options.handler ?? "vide", 8, 4, "latin1");
  const stts = Buffer.alloc(16);
  stts.writeUInt32BE(1, 4);
  stts.writeUInt32BE(samples, 8);
  stts.writeUInt32BE(delta, 12);
  const avcC = box("avcC", Buffer.from([1, profile, 0, 1]));
  const avc1 = box("avc1", Buffer.concat([Buffer.alloc(78), avcC]));
  const stsd = box("stsd", Buffer.concat([u32(0), u32(1), avc1]));
  const stbl = box("stbl", Buffer.concat([stsd, box("stts", stts)]));
  const minf = box("minf", stbl);
  const mdia = box("mdia", Buffer.concat([box("mdhd", mdhd), box("hdlr", hdlr), minf]));
  const trak = box("trak", Buffer.concat([box("tkhd", tkhd), mdia]));
  const tracks = [trak];
  if (audio) {
    const sound = Buffer.alloc(24);
    sound.write("soun", 8, 4, "latin1");
    tracks.push(box("trak", box("mdia", box("hdlr", sound))));
  }
  const moov = box("moov", Buffer.concat(tracks));
  const mdat = box("mdat", Buffer.alloc(8));
  const ftyp = box("ftyp", Buffer.concat([Buffer.from("isom"), u32(0)]));
  return Buffer.concat(faststart ? [ftyp, moov, mdat] : [ftyp, mdat, moov]);
}

describe("clip de la tele", () => {
  it("acepta un MP4 baseline, mudo, faststart, 3 s a 12 fps", () => {
    const info = assertPreviewMotionBuffer(sampleMp4(), "muestra");
    expect(info.faststart).toBe(true);
    expect(info.audio).toBe(false);
    expect(info.video?.baseline).toBe(true);
    expect(info.video?.width).toBe(320);
    expect(info.video?.height).toBe(180);
    expect(info.video?.fps).toBeCloseTo(12);
    expect(info.video?.seconds).toBeCloseTo(3);
  });

  it("rechaza audio, moov tardío, otro perfil, otro ritmo y el tope de peso", () => {
    expect(() => assertPreviewMotionBuffer(sampleMp4({ audio: true }), "audio")).toThrow(/audio/);
    expect(() => assertPreviewMotionBuffer(sampleMp4({ faststart: false }), "moov")).toThrow(/faststart/);
    expect(() => assertPreviewMotionBuffer(sampleMp4({ profile: 100 }), "perfil")).toThrow(/Baseline/);
    expect(() => assertPreviewMotionBuffer(sampleMp4({ delta: 500 }), "fps")).toThrow(/fps/);
    expect(() => assertPreviewMotionBuffer(sampleMp4({ width: 640, height: 360 }), "tamaño")).toThrow(/640/);
    const heavy = Buffer.concat([sampleMp4(), Buffer.alloc(PREVIEW_MAX_BYTES)]);
    expect(() => assertPreviewMotionBuffer(heavy, "peso")).toThrow(/tope/);
  });

  it("el sello cambia cuando cambia una fuente y no cuando cambia la propia preview", () => {
    const dir = mkdtempSync(join(tmpdir(), "proto-motion-"));
    writeFileSync(join(dir, "proto.json"), "{}\n");
    writeFileSync(join(dir, "index.html"), "<p>hola</p>");
    writeFileSync(join(dir, "preview.mp4"), sampleMp4());
    const stamp = writePreviewStamp(dir);
    expect(readFileSync(join(dir, "preview-src.sha256"), "utf8").trim()).toBe(stamp);
    expect(() => assertPreviewMotion(dir)).not.toThrow();
    writeFileSync(join(dir, "preview.mp4"), sampleMp4({ samples: 36 }));
    expect(hashPreviewSources(dir)).toBe(stamp);
    writeFileSync(join(dir, "index.html"), "<p>adios</p>");
    expect(() => assertPreviewMotion(dir)).toThrow(/fresca/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("lee un MP4 generado por ffmpeg", () => {
    const probe = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
    if (probe.status !== 0) return;
    const dir = mkdtempSync(join(tmpdir(), "proto-ffmpeg-"));
    const file = join(dir, "clip.mp4");
    const encoded = spawnSync(
      "ffmpeg",
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc=size=320x180:rate=12:duration=3",
        "-an",
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
        "32",
        file,
      ],
      { encoding: "utf8" },
    );
    expect(encoded.status, encoded.stderr).toBe(0);
    const info = inspectMp4(readFileSync(file));
    expect(info.faststart).toBe(true);
    expect(info.audio).toBe(false);
    expect(info.video?.baseline).toBe(true);
    expect(info.video?.fps).toBeCloseTo(12, 0);
    expect(info.video?.seconds).toBeCloseTo(3, 1);
    rmSync(dir, { recursive: true, force: true });
  });
});
