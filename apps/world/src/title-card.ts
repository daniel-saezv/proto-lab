import type { CatalogEntry } from "./types";

export function drawTitleCard(
  context: CanvasRenderingContext2D,
  entry: CatalogEntry,
  width: number,
  height: number,
): void {
  context.fillStyle = "#101826";
  context.fillRect(0, 0, width, height);
  context.strokeStyle = "#ffb703";
  context.lineWidth = Math.max(4, Math.round(width * 0.02));
  const pad = Math.round(width * 0.03);
  context.strokeRect(pad, pad, width - pad * 2, height - pad * 2);
  context.fillStyle = "#f6f1e7";
  context.font = `700 ${Math.round(width * 0.105)}px sans-serif`;
  context.textAlign = "center";
  const lines = wrapLines(context, entry.title, width * 0.82);
  const lineHeight = Math.round(height * 0.19);
  const startY = height * 0.38 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, index) => context.fillText(line, width / 2, startY + index * lineHeight));
  context.fillStyle = "#ffb703";
  context.font = `${Math.round(width * 0.055)}px sans-serif`;
  context.fillText(entry.tags.join(" · "), width / 2, height * 0.84);
}

export function titleCardDataUrl(entry: CatalogEntry, width = 512, height = 320): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return "data:image/png;base64,";
  drawTitleCard(context, entry, width, height);
  return canvas.toDataURL("image/png");
}

function wrapLines(context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (context.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}
