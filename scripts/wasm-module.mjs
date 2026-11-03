import { brotliCompressSync, brotliDecompressSync, constants } from "node:zlib";

const WASM_MAGIC = "\0asm";

function readLeb(buf, offset) {
  let result = 0;
  let shift = 0;
  let bytes = 0;
  while (offset + bytes < buf.length && shift <= 28) {
    const byte = buf[offset + bytes];
    bytes += 1;
    result |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return { value: result, bytes };
    shift += 7;
  }
  throw new Error("LEB128 incompleto");
}

/** El bit shared de la sección memory es la prueba de hilos, no una cadena suelta. */
export function inspectWasm(buf) {
  if (buf.length < 8 || buf.toString("utf8", 0, 4) !== WASM_MAGIC) return { wasm: false };
  let offset = 8;
  const memories = [];
  while (offset + 1 < buf.length) {
    const id = buf[offset];
    offset += 1;
    const size = readLeb(buf, offset);
    offset += size.bytes;
    const start = offset;
    const end = start + size.value;
    if (end > buf.length) break;
    if (id === 5) {
      const count = readLeb(buf, start);
      let cursor = start + count.bytes;
      for (let i = 0; i < count.value; i += 1) {
        const flags = buf[cursor];
        cursor += 1;
        const initial = readLeb(buf, cursor);
        cursor += initial.bytes;
        let maximum = null;
        if ((flags & 1) !== 0) {
          const max = readLeb(buf, cursor);
          cursor += max.bytes;
          maximum = max.value;
        }
        memories.push({
          shared: (flags & 2) !== 0,
          memory64: (flags & 4) !== 0,
          flags,
          initialPages: initial.value,
          initialBytes: initial.value * 65536,
          maximumPages: maximum,
        });
      }
    }
    offset = end;
  }
  return { wasm: true, memories };
}

/**
 * Un `.wasm` servido puede ser el módulo en claro o su Brotli q11.
 * @param {Buffer} buf
 * @returns {{ brotli: boolean, module: Buffer } | null}
 */
export function decodeServedWasm(buf) {
  if (buf.length >= 4 && buf.toString("latin1", 0, 4) === WASM_MAGIC) {
    return { brotli: false, module: buf };
  }
  try {
    const module = brotliDecompressSync(buf);
    if (module.length >= 4 && module.toString("latin1", 0, 4) === WASM_MAGIC) {
      return { brotli: true, module };
    }
  } catch {
    /* No es Brotli. */
  }
  return null;
}

/** Brotli q11, el que se commitea y se sirve con Content-Encoding: br. */
export function compressWasmBrotli(module) {
  return brotliCompressSync(module, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: 11,
    },
  });
}

export function assertSingleThreadWasm(module, label) {
  const info = inspectWasm(module);
  if (!info.wasm) throw new Error(`${label}: no es un módulo wasm`);
  for (const memory of info.memories) {
    if (memory.shared) throw new Error(`${label}: el wasm pide memoria compartida`);
  }
  return info;
}
