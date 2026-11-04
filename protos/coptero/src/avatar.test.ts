import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");

function archivos(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entrada) => {
    if (entrada.name === "node_modules" || entrada.name === "dist" || entrada.name.startsWith(".")) return [];
    const ruta = join(dir, entrada.name);
    return entrada.isDirectory() ? archivos(ruta) : [ruta];
  });
}

describe("avatar de serie", () => {
  it("no incluye un archivo de imagen aparte de la vista previa", () => {
    const imagenes = archivos(raiz)
      .filter((ruta) => /\.(webp|png|jpe?g|gif|svg)$/i.test(ruta))
      .map((ruta) => ruta.slice(raiz.length + 1));
    expect(imagenes.filter((ruta) => ruta !== "preview.webp")).toEqual([]);
  });
});
