import { CanvasTexture, LinearFilter, SRGBColorSpace } from "three";
import {
  boardDataSignature,
  paintWhiteboard,
  paintWhiteboardRowTrack,
  rowNeedsAnimation,
  selectBoardRows,
  WHITEBOARD_HEIGHT,
  WHITEBOARD_MAX_ROWS,
  WHITEBOARD_WIDTH,
  type BoardPaintRow,
  type BoardRowLayout,
} from "./proposals-board-paint";
import type { ProposalStatusItem } from "./proposals-status-api";

const PULSE_INTERVAL_MS = 100;
const HIGHLIGHT_MS = 1400;

export type WhiteboardStatusController = {
  texture: CanvasTexture;
  canvas: HTMLCanvasElement;
  setItems: (items: ProposalStatusItem[], partial: boolean) => void;
  tick: (nowMs: number) => void;
  getItemSummary: () => string;
  dispose: () => void;
};

export function createWhiteboardStatus(options: {
  reducedMotion?: boolean;
  attachTo?: HTMLElement;
  onSummaryChange?: (summary: string) => void;
}): WhiteboardStatusController {
  const reducedMotion = options.reducedMotion ?? window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const canvas = document.createElement("canvas");
  canvas.width = WHITEBOARD_WIDTH;
  canvas.height = WHITEBOARD_HEIGHT;
  if (options.attachTo) {
    canvas.className = "fallback-whiteboard-canvas";
    canvas.dataset.testid = "fallback-whiteboard";
    options.attachTo.append(canvas);
  }
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2d context");
  const ctx = context;

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;

  let items: ProposalStatusItem[] = [];
  let partial = false;
  let signature = "";
  let pulseT = 0;
  let lastPulseDraw = 0;
  let layouts: BoardRowLayout[] = [];
  const paintRows: BoardPaintRow[] = [];
  const lastPhase = new Map<number, ProposalStatusItem["phase"]>();
  const highlightUntil = new Map<number, number>();

  function buildPaintRows(nowMs: number): BoardPaintRow[] {
    const { rows } = selectBoardRows(items);
    const built: BoardPaintRow[] = [];
    for (const item of rows) {
      const prev = lastPhase.get(item.number);
      if (prev != null && prev !== item.phase) {
        highlightUntil.set(item.number, nowMs + HIGHLIGHT_MS);
      }
      lastPhase.set(item.number, item.phase);
      const until = highlightUntil.get(item.number) ?? 0;
      const highlight = until > nowMs ? (until - nowMs) / HIGHLIGHT_MS : 0;
      built.push({ number: item.number, title: item.title, phase: item.phase, highlight });
    }
    return built;
  }

  function notifySummary() {
    const summary = items
      .slice(0, WHITEBOARD_MAX_ROWS)
      .map((item) => String(item.number))
      .join(",");
    options.onSummaryChange?.(summary);
  }

  function fullRedraw(nowMs: number) {
    paintRows.length = 0;
    paintRows.push(...buildPaintRows(nowMs));
    const { overflow } = selectBoardRows(items);
    layouts = paintWhiteboard(ctx, {
      rows: paintRows,
      overflow,
      partial,
      pulseT,
      reducedMotion,
    });
    texture.needsUpdate = true;
  }

  return {
    texture,
    canvas,
    setItems(nextItems, nextPartial) {
      const nextSignature = boardDataSignature(nextItems, nextPartial);
      if (nextSignature === signature && nextPartial === partial) return;
      signature = nextSignature;
      items = nextItems;
      partial = nextPartial;
      fullRedraw(performance.now());
      notifySummary();
    },
    tick(nowMs) {
      if (reducedMotion) return;
      paintRows.length = 0;
      paintRows.push(...buildPaintRows(nowMs));
      const animating = paintRows.some((row) => rowNeedsAnimation(row));
      if (!animating) return;
      pulseT = (nowMs / 1000) % 1;
      if (nowMs - lastPulseDraw < PULSE_INTERVAL_MS) return;
      lastPulseDraw = nowMs;
      for (let i = 0; i < paintRows.length; i += 1) {
        const row = paintRows[i]!;
        if (!rowNeedsAnimation(row)) continue;
        const layout = layouts[i];
        if (!layout) continue;
        paintWhiteboardRowTrack(ctx, layout, row, pulseT, reducedMotion);
      }
      texture.needsUpdate = true;
    },
    getItemSummary() {
      return items
        .slice(0, WHITEBOARD_MAX_ROWS)
        .map((item) => String(item.number))
        .join(",");
    },
    dispose() {
      texture.dispose();
      canvas.remove();
    },
  };
}
