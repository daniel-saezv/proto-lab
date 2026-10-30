import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const table = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  table[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])), 0);
  return Buffer.concat([length, name, data, crc]);
}

function png(size, paint) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = paint(x, y, size);
      const i = row + 1 + x * 4;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function paint(x, y, size) {
  const nx = (x + 0.5) / size;
  const ny = (y + 0.5) / size;
  const inFrame = nx > 0.08 && nx < 0.92 && ny > 0.08 && ny < 0.92;
  if (!inFrame) return [20, 24, 43, 255];
  const cx = nx - 0.5;
  const cy = ny - 0.52;
  const diamond = Math.abs(cx) * 1.7 + Math.abs(cy) * 1.15;
  if (diamond < 0.22) return [255, 183, 3, 255];
  const glow = Math.hypot(cx, cy - 0.02);
  if (glow < 0.08) return [255, 244, 214, 255];
  const floor = ny > 0.78 && Math.abs(cx) < 0.28;
  if (floor) return [46, 196, 182, 255];
  return [28, 34, 58, 255];
}

const dir = join(dirname(fileURLToPath(import.meta.url)), "../apps/world/public/icons");
mkdirSync(dir, { recursive: true });
for (const size of [32, 180, 192, 512]) {
  const name = size === 180 ? "apple-touch-icon.png" : size === 32 ? "favicon-32.png" : `icon-${size}.png`;
  writeFileSync(join(dir, name), png(size, paint));
}
console.log("Iconos escritos en apps/world/public/icons");
