import { trackStepVisuals, type TrackStepVisual } from "./proposals-board-track";
import type { ProposalStatusItem } from "./proposals-status-api";

export const WHITEBOARD_WIDTH = 960;
export const WHITEBOARD_HEIGHT = 540;
export const WHITEBOARD_MAX_ROWS = 5;

const COLORS = {
  bg: "#1d3f36",
  ink: "#f4efe4",
  inkMuted: "rgba(244, 239, 228, 0.55)",
  amber: "#ffb703",
  line: "rgba(244, 239, 228, 0.22)",
  fail: "#ff6b6b",
  highlight: "rgba(255, 183, 3, 0.28)",
};

export type BoardRowLayout = {
  number: number;
  y: number;
  height: number;
  trackY: number;
  trackHeight: number;
};

export type BoardPaintRow = {
  number: number;
  title: string;
  phase: ProposalStatusItem["phase"];
  highlight: number;
};

export type BoardPaintModel = {
  rows: BoardPaintRow[];
  overflow: number;
  partial: boolean;
  pulseT: number;
  reducedMotion: boolean;
  statusLine?: string;
};

export function boardDataSignature(items: ProposalStatusItem[], partial: boolean): string {
  const slice = items.slice(0, WHITEBOARD_MAX_ROWS);
  return JSON.stringify({
    partial,
    items: slice.map((item) => [item.number, item.phase, item.title, item.updatedAt]),
    overflow: Math.max(0, items.length - WHITEBOARD_MAX_ROWS),
  });
}

export function selectBoardRows(items: ProposalStatusItem[]): { rows: ProposalStatusItem[]; overflow: number } {
  const rows = items.slice(0, WHITEBOARD_MAX_ROWS);
  return { rows, overflow: Math.max(0, items.length - WHITEBOARD_MAX_ROWS) };
}

export function computeRowLayouts(rowCount: number): BoardRowLayout[] {
  const header = 72;
  const footer = 36;
  const usable = WHITEBOARD_HEIGHT - header - footer;
  const rowHeight = Math.floor(usable / WHITEBOARD_MAX_ROWS);
  const layouts: BoardRowLayout[] = [];
  for (let i = 0; i < rowCount; i += 1) {
    const y = header + i * rowHeight;
    layouts.push({
      number: 0,
      y,
      height: rowHeight,
      trackY: y + Math.round(rowHeight * 0.52),
      trackHeight: Math.round(rowHeight * 0.38),
    });
  }
  return layouts;
}

function truncateText(context: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (context.measureText(text).width <= maxWidth) return text;
  let trimmed = text;
  while (trimmed.length > 1 && context.measureText(`${trimmed}…`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return `${trimmed}…`;
}

function drawDiamond(
  context: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  fill: string,
  stroke?: string,
) {
  context.save();
  context.translate(cx, cy);
  context.rotate(Math.PI / 4);
  context.fillStyle = fill;
  context.fillRect(-size / 2, -size / 2, size, size);
  if (stroke) {
    context.strokeStyle = stroke;
    context.lineWidth = 2;
    context.strokeRect(-size / 2, -size / 2, size, size);
  }
  context.restore();
}

function drawTrack(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  visuals: TrackStepVisual[],
  pulseT: number,
  reducedMotion: boolean,
) {
  const steps = visuals.length;
  const dotSize = Math.min(16, height * 0.55);
  const segment = width / steps;
  const cy = y + height / 2;
  for (let i = 0; i < steps; i += 1) {
    const cx = x + segment * i + segment / 2;
    const visual = visuals[i]!;
    if (i < steps - 1) {
      const next = visuals[i + 1]!;
      const filled = next !== "empty";
      context.strokeStyle = filled ? COLORS.amber : COLORS.line;
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(cx + dotSize * 0.55, cy);
      context.lineTo(x + segment * (i + 1) + segment / 2 - dotSize * 0.55, cy);
      context.stroke();
    }
    if (visual === "active" && !reducedMotion) {
      const pulse = 0.55 + Math.sin(pulseT * Math.PI * 2) * 0.35;
      context.globalAlpha = 0.35;
      drawDiamond(context, cx, cy, dotSize * (1 + pulse * 0.35), "transparent", COLORS.amber);
      context.globalAlpha = 1;
    }
    if (visual === "celebrate" && !reducedMotion) {
      context.fillStyle = COLORS.amber;
      for (let s = 0; s < 3; s += 1) {
        const angle = pulseT * Math.PI * 2 + s * 2.1;
        const sparkX = cx + Math.cos(angle) * dotSize * 0.9;
        const sparkY = cy + Math.sin(angle) * dotSize * 0.5;
        drawDiamond(context, sparkX, sparkY, 5, COLORS.amber);
      }
    }
    if (visual === "fail") {
      drawDiamond(context, cx, cy, dotSize, "rgba(255, 107, 107, 0.35)", COLORS.fail);
      context.fillStyle = COLORS.fail;
      context.font = `800 ${Math.round(dotSize * 0.75)}px sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText("!", cx, cy + 1);
    } else if (visual === "filled" || visual === "celebrate") {
      drawDiamond(context, cx, cy, dotSize, COLORS.amber);
      context.fillStyle = "#1a1203";
      context.font = `800 ${Math.round(dotSize * 0.55)}px sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText("✓", cx, cy + 1);
    } else if (visual === "active") {
      drawDiamond(context, cx, cy, dotSize, "rgba(255, 183, 3, 0.25)", COLORS.amber);
    } else {
      drawDiamond(context, cx, cy, dotSize, "rgba(20, 24, 43, 0.85)", COLORS.line);
    }
  }
}

export function paintWhiteboard(context: CanvasRenderingContext2D, model: BoardPaintModel): BoardRowLayout[] {
  const { rows, overflow, partial, pulseT, reducedMotion } = model;
  context.fillStyle = COLORS.bg;
  context.fillRect(0, 0, WHITEBOARD_WIDTH, WHITEBOARD_HEIGHT);

  context.fillStyle = COLORS.ink;
  context.font = "700 36px sans-serif";
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.fillText("Tablón", 32, 46);

  if (partial) {
    context.fillStyle = COLORS.inkMuted;
    context.font = "600 22px sans-serif";
    context.textAlign = "right";
    context.fillText("·", WHITEBOARD_WIDTH - 32, 46);
  }

  const layouts = computeRowLayouts(rows.length);
  const marginX = 28;
  const trackWidth = WHITEBOARD_WIDTH - marginX * 2;

  if (rows.length === 0) {
    context.fillStyle = COLORS.inkMuted;
    context.font = "600 26px sans-serif";
    context.textAlign = "center";
    context.fillText("Nada activo ahora", WHITEBOARD_WIDTH / 2, WHITEBOARD_HEIGHT / 2);
    return layouts;
  }

  rows.forEach((row, index) => {
    const layout = layouts[index]!;
    layout.number = row.number;
    if (row.highlight > 0) {
      context.fillStyle = COLORS.highlight;
      context.globalAlpha = row.highlight * 0.85;
      context.fillRect(marginX - 8, layout.y + 4, trackWidth + 16, layout.height - 8);
      context.globalAlpha = 1;
    }
    context.fillStyle = COLORS.ink;
    context.font = "700 26px sans-serif";
    context.textAlign = "left";
    const title = truncateText(context, `#${row.number} · ${row.title}`, trackWidth - 80);
    context.fillText(title, marginX, layout.y + 34);
    const visuals = trackStepVisuals(row.phase);
    drawTrack(context, marginX, layout.trackY, trackWidth, layout.trackHeight, visuals, pulseT, reducedMotion);
  });

  if (overflow > 0) {
    context.fillStyle = COLORS.amber;
    context.font = "700 24px sans-serif";
    context.textAlign = "right";
    context.fillText(`+${overflow}`, WHITEBOARD_WIDTH - 32, WHITEBOARD_HEIGHT - 16);
  }

  return layouts;
}

export function rowNeedsAnimation(row: BoardPaintRow): boolean {
  const visuals = trackStepVisuals(row.phase);
  return visuals.some((v) => v === "active" || v === "celebrate") || row.highlight > 0.02;
}

export function paintWhiteboardRowTrack(
  context: CanvasRenderingContext2D,
  layout: BoardRowLayout,
  row: BoardPaintRow,
  pulseT: number,
  reducedMotion: boolean,
) {
  const marginX = 28;
  const trackWidth = WHITEBOARD_WIDTH - marginX * 2;
  context.fillStyle = COLORS.bg;
  context.fillRect(marginX - 8, layout.trackY - 8, trackWidth + 16, layout.trackHeight + 16);
  if (row.highlight > 0) {
    context.fillStyle = COLORS.highlight;
    context.globalAlpha = row.highlight * 0.85;
    context.fillRect(marginX - 8, layout.y + 4, trackWidth + 16, layout.height - 8);
    context.globalAlpha = 1;
  }
  const visuals = trackStepVisuals(row.phase);
  drawTrack(context, marginX, layout.trackY, trackWidth, layout.trackHeight, visuals, pulseT, reducedMotion);
}
