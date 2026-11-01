import { trackStepVisuals, type TrackStepVisual } from "./proposals-board-track";
import {
  BOARD_SLATE,
  CHALK_STROKE,
  drawChalkSegments,
  paintEmptyChalkIcon,
  paintWhiteboardFrame,
  seg,
  titleChalkSwash,
  type ChalkSegment,
} from "./proposals-board-chalk";
import type { ProposalStatusItem } from "./proposals-status-api";

import {
  computeRowLayouts,
  WHITEBOARD_HEIGHT,
  WHITEBOARD_MAX_ROWS,
  WHITEBOARD_WIDTH,
  type BoardRowLayout,
} from "./proposals-board-metrics";

export {
  computeRowLayouts,
  WHITEBOARD_HEIGHT,
  WHITEBOARD_MAX_ROWS,
  WHITEBOARD_WIDTH,
  type BoardRowLayout,
} from "./proposals-board-metrics";

const COLORS = {
  bg: BOARD_SLATE,
  ink: "#f4efe4",
  inkMuted: "rgba(244, 239, 228, 0.55)",
  amber: "#ffb703",
  line: "rgba(244, 239, 228, 0.22)",
  fail: "#ff6b6b",
  highlight: "rgba(255, 183, 3, 0.28)",
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
    items: slice.map((item) => [item.number, item.phase, item.title, item.updatedAt, item.slug ?? "", item.previewUrl ?? ""]),
    overflow: Math.max(0, items.length - WHITEBOARD_MAX_ROWS),
  });
}

export function selectBoardRows(items: ProposalStatusItem[]): { rows: ProposalStatusItem[]; overflow: number } {
  const rows = items.slice(0, WHITEBOARD_MAX_ROWS);
  return { rows, overflow: Math.max(0, items.length - WHITEBOARD_MAX_ROWS) };
}

function truncateText(context: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (context.measureText(text).width <= maxWidth) return text;
  let trimmed = text;
  while (trimmed.length > 1 && context.measureText(`${trimmed}…`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return `${trimmed}…`;
}

function drawChalkDot(
  context: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  fill: string | null,
  stroke?: string,
) {
  context.beginPath();
  context.arc(cx, cy, radius, 0, Math.PI * 2);
  if (fill) {
    context.fillStyle = fill;
    context.fill();
  }
  if (stroke) {
    context.strokeStyle = stroke;
    context.lineWidth = 2;
    context.stroke();
  }
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
    const radius = dotSize / 2;
    if (visual === "active" && !reducedMotion) {
      const pulse = 0.55 + Math.sin(pulseT * Math.PI * 2) * 0.35;
      context.globalAlpha = 0.35;
      drawChalkDot(context, cx, cy, radius * (1 + pulse * 0.35), null, COLORS.amber);
      context.globalAlpha = 1;
    }
    if (visual === "celebrate" && !reducedMotion) {
      for (let s = 0; s < 3; s += 1) {
        const angle = pulseT * Math.PI * 2 + s * 2.1;
        const sparkX = cx + Math.cos(angle) * dotSize * 0.9;
        const sparkY = cy + Math.sin(angle) * dotSize * 0.5;
        drawChalkDot(context, sparkX, sparkY, 2.4, COLORS.amber);
      }
    }
    if (visual === "fail") {
      drawChalkDot(context, cx, cy, radius, "rgba(255, 107, 107, 0.35)", COLORS.fail);
      context.fillStyle = COLORS.fail;
      context.font = `800 ${Math.round(dotSize * 0.75)}px sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText("!", cx, cy + 1);
    } else if (visual === "filled" || visual === "celebrate") {
      drawChalkDot(context, cx, cy, radius, COLORS.amber);
      context.fillStyle = "#1a1203";
      context.font = `800 ${Math.round(dotSize * 0.55)}px sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText("✓", cx, cy + 1);
    } else if (visual === "active") {
      drawChalkDot(context, cx, cy, radius, "rgba(255, 183, 3, 0.22)", COLORS.amber);
    } else {
      drawChalkDot(context, cx, cy, radius, null, "rgba(244, 239, 228, 0.38)");
    }
  }
}

export function paintWhiteboard(context: CanvasRenderingContext2D, model: BoardPaintModel): BoardRowLayout[] {
  paintWhiteboardFrame(context);
  return paintWhiteboardBody(context, model);
}

/** Contenido del listado, sin el fondo. Sirve para fundirlo durante la transición. */
export function paintWhiteboardBody(context: CanvasRenderingContext2D, model: BoardPaintModel): BoardRowLayout[] {
  const { rows, overflow, partial, pulseT, reducedMotion } = model;
  paintBoardHeader(context, partial);

  const layouts = computeRowLayouts(rows.length);
  const marginX = 28;
  const trackWidth = WHITEBOARD_WIDTH - marginX * 2;

  if (rows.length === 0) {
    paintEmptyChalkIcon(context, WHITEBOARD_WIDTH / 2, WHITEBOARD_HEIGHT / 2 - 12);
    context.fillStyle = COLORS.inkMuted;
    context.font = "600 24px sans-serif";
    context.textAlign = "center";
    context.fillText("Nada activo", WHITEBOARD_WIDTH / 2, WHITEBOARD_HEIGHT / 2 + 36);
    return layouts;
  }

  rows.forEach((row, index) => {
    const layout = layouts[index]!;
    layout.number = row.number;
    paintSingleRow(context, layout, row, pulseT, reducedMotion, marginX, trackWidth);
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

export function buildRowRevealSegments(
  layout: BoardRowLayout,
  titleEndX: number,
  trackWidth: number,
  marginX: number,
): ChalkSegment[] {
  const titleY = layout.y + 28;
  const segments = [seg(marginX, titleY, titleEndX, titleY)];
  const cy = layout.trackY + layout.trackHeight / 2;
  const step = trackWidth / 6;
  const d = Math.min(14, layout.trackHeight * 0.45);
  for (let i = 0; i < 6; i += 1) {
    const cx = marginX + step * i + step / 2;
    segments.push(seg(cx - d * 0.6, cy - d * 0.6, cx + d * 0.6, cy - d * 0.6));
    segments.push(seg(cx + d * 0.6, cy - d * 0.6, cx + d * 0.6, cy + d * 0.6));
    segments.push(seg(cx + d * 0.6, cy + d * 0.6, cx - d * 0.6, cy + d * 0.6));
    segments.push(seg(cx - d * 0.6, cy + d * 0.6, cx - d * 0.6, cy - d * 0.6));
    if (i < 5) {
      const nx = marginX + step * (i + 1) + step / 2;
      segments.push(seg(cx + d * 0.55, cy, nx - d * 0.55, cy));
    }
  }
  return segments;
}

export function paintBoardHeader(context: CanvasRenderingContext2D, partial: boolean) {
  context.fillStyle = COLORS.ink;
  context.font = "700 36px sans-serif";
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.fillText("Tablón", 32, 46);
  drawChalkSegments(context, titleChalkSwash(), 1, CHALK_STROKE, 2.2);
  if (partial) {
    context.fillStyle = COLORS.inkMuted;
    context.font = "600 22px sans-serif";
    context.textAlign = "right";
    context.fillText("·", WHITEBOARD_WIDTH - 32, 46);
  }
}

export function paintSingleRow(
  context: CanvasRenderingContext2D,
  layout: BoardRowLayout,
  row: BoardPaintRow,
  pulseT: number,
  reducedMotion: boolean,
  marginX: number,
  trackWidth: number,
) {
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
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
}

export function paintRowRevealStroke(
  context: CanvasRenderingContext2D,
  layout: BoardRowLayout,
  row: BoardPaintRow,
  progress: number,
  marginX: number,
  trackWidth: number,
) {
  context.fillStyle = COLORS.ink;
  context.font = "700 26px sans-serif";
  context.textAlign = "left";
  const title = truncateText(context, `#${row.number} · ${row.title}`, trackWidth - 80);
  const titleWidth = context.measureText(title).width;
  const segments = buildRowRevealSegments(layout, marginX + titleWidth, trackWidth, marginX);
  drawChalkSegments(context, segments, progress, CHALK_STROKE, 2.5);
}
