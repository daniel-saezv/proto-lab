import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

/** Nombres que no se publican desde un export estático. */
export const STATIC_SKIP = new Set(["proto.json", "node_modules", "dist"]);

/**
 * De dónde sale lo que se sirve en `/protos/<slug>/`.
 * Con `package.json`, el build de Vite (`dist/`). Sin él, la propia carpeta
 * (export estático: HTML, JS y binarios ya generados).
 * @param {string} protoDir
 * @returns {{ kind: "build" | "static", dir: string }}
 */
export function resolveProtoOutput(protoDir) {
  const pkg = join(protoDir, "package.json");
  if (existsSync(pkg)) {
    const dist = join(protoDir, "dist");
    if (!statSync(dist, { throwIfNoEntry: false })?.isDirectory()) {
      throw new Error(`Falta el build de ${protoDir}. Ejecuta pnpm build.`);
    }
    return { kind: "build", dir: dist };
  }
  if (!existsSync(join(protoDir, "index.html"))) {
    throw new Error(`El export estático ${protoDir} no tiene index.html`);
  }
  return { kind: "static", dir: protoDir };
}
