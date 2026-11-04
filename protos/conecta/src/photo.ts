import { LIMITES, utf8 } from "./logic";

export async function comprimirFoto(file: Blob, maxBytes = LIMITES.fotoBytes): Promise<string> {
  if (file.size > 8 * 1024 * 1024) throw new Error("grande");
  const bitmap = await createImageBitmap(file);
  try {
    const lado = Math.max(bitmap.width, bitmap.height);
    if (lado < 1) throw new Error("vacia");
    for (const size of [160, 120, 96, 72, 56]) {
      const escala = Math.min(1, size / lado);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * escala));
      canvas.height = Math.max(1, Math.round(bitmap.height * escala));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("lienzo");
      ctx.fillStyle = "#fffaf3";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.72, 0.56, 0.42, 0.3, 0.22]) {
        const url = canvas.toDataURL("image/jpeg", quality);
        if (utf8(url) <= maxBytes) return url;
      }
    }
    throw new Error("grande");
  } finally {
    bitmap.close();
  }
}
