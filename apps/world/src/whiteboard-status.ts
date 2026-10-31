import { CanvasTexture, LinearFilter, SRGBColorSpace } from "three";
import {
  ANIM_FRAME_MS,
  paintRetryChalk,
  paintSkeletonBoard,
  paintWhiteboardFrame,
  revealComplete,
  revealRowProgress,
} from "./proposals-board-chalk";
import {
  boardDataSignature,
  computeRowLayouts,
  paintBoardHeader,
  paintRowRevealStroke,
  paintSingleRow,
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

export type WhiteboardPhase = "loading" | "reveal" | "live" | "empty";

export type WhiteboardStatusController = {
  texture: CanvasTexture;
  canvas: HTMLCanvasElement;
  setItems: (items: ProposalStatusItem[], partial: boolean) => void;
  setFetchError: (failed: boolean) => void;
  tick: (nowMs: number) => void;
  needsAnimation: () => boolean;
  getPhase: () => WhiteboardPhase;
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
  canvas.dataset.whiteboardPhase = "loading";
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
  let lastAnimDraw = 0;
  let layouts: BoardRowLayout[] = [];
  const paintRows: BoardPaintRow[] = [];
  const lastPhase = new Map<number, ProposalStatusItem["phase"]>();
  const highlightUntil = new Map<number, number>();

  let phase: WhiteboardPhase = "loading";
  let revealStartMs = 0;
  let fetchError = false;
  let receivedData = false;

  const marginX = 28;
  const trackWidth = WHITEBOARD_WIDTH - marginX * 2;

  function setPhase(next: WhiteboardPhase) {
    phase = next;
    canvas.dataset.whiteboardPhase = next;
  }

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

  function paintRetryIfNeeded(nowMs: number) {
    if (!fetchError) return;
    paintRetryChalk(ctx, nowMs, WHITEBOARD_WIDTH - 42, WHITEBOARD_HEIGHT - 28);
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
    paintRetryIfNeeded(nowMs);
    texture.needsUpdate = true;
  }

  function paintLoadingFrame(nowMs: number) {
    paintSkeletonBoard(ctx, nowMs, reducedMotion, receivedData);
    paintRetryIfNeeded(nowMs);
    texture.needsUpdate = true;
  }

  function paintRevealFrame(nowMs: number) {
    paintRows.length = 0;
    paintRows.push(...buildPaintRows(nowMs));
    const rowCount = paintRows.length;
    paintWhiteboardFrame(ctx);
    paintBoardHeader(ctx, partial);
    layouts = computeRowLayouts(rowCount);
    for (let i = 0; i < rowCount; i += 1) {
      const row = paintRows[i]!;
      const layout = layouts[i]!;
      layout.number = row.number;
      const progress = revealRowProgress(revealStartMs, nowMs, i, rowCount);
      if (progress >= 1) {
        paintSingleRow(ctx, layout, row, pulseT, reducedMotion, marginX, trackWidth);
      } else {
        paintRowRevealStroke(ctx, layout, row, progress, marginX, trackWidth);
      }
    }
    const { overflow } = selectBoardRows(items);
    if (overflow > 0 && revealComplete(revealStartMs, nowMs, rowCount)) {
      ctx.fillStyle = "#ffb703";
      ctx.font = "700 24px sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(`+${overflow}`, WHITEBOARD_WIDTH - 32, WHITEBOARD_HEIGHT - 16);
    }
    paintRetryIfNeeded(nowMs);
    texture.needsUpdate = true;
    if (revealComplete(revealStartMs, nowMs, rowCount)) {
      setPhase(rowCount === 0 ? "empty" : "live");
      fullRedraw(nowMs);
    }
  }

  function paintBackgroundOnly() {
    paintWhiteboardFrame(ctx);
    texture.needsUpdate = true;
  }

  paintBackgroundOnly();
  if (reducedMotion) {
    paintSkeletonBoard(ctx, 0, true, false);
  }

  return {
    texture,
    canvas,
    setItems(nextItems, nextPartial) {
      const nextSignature = boardDataSignature(nextItems, nextPartial);
      if (nextSignature === signature && nextPartial === partial && phase !== "loading") return;
      signature = nextSignature;
      items = nextItems;
      partial = nextPartial;
      receivedData = true;
      fetchError = false;
      notifySummary();

      const rowCount = selectBoardRows(items).rows.length;
      if (rowCount === 0) {
        setPhase("empty");
        fullRedraw(performance.now());
        return;
      }

      if (reducedMotion) {
        setPhase("live");
        fullRedraw(performance.now());
        return;
      }

      setPhase("reveal");
      revealStartMs = performance.now();
      paintRevealFrame(revealStartMs);
    },
    setFetchError(failed: boolean) {
      fetchError = failed;
      if (failed && !receivedData) {
        setPhase("loading");
        paintLoadingFrame(performance.now());
        return;
      }
      if (failed && phase === "live") {
        fullRedraw(performance.now());
      }
    },
    tick(nowMs) {
      if (phase === "loading") {
        if (nowMs - lastAnimDraw < ANIM_FRAME_MS) return;
        lastAnimDraw = nowMs;
        paintLoadingFrame(nowMs);
        return;
      }

      if (phase === "reveal") {
        if (nowMs - lastAnimDraw < ANIM_FRAME_MS) return;
        lastAnimDraw = nowMs;
        paintRevealFrame(nowMs);
        return;
      }

      if (fetchError) {
        if (nowMs - lastAnimDraw < ANIM_FRAME_MS) return;
        lastAnimDraw = nowMs;
        fullRedraw(nowMs);
        return;
      }

      if (reducedMotion || phase !== "live") return;
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
    needsAnimation() {
      if (phase === "loading" || phase === "reveal") return true;
      if (fetchError) return true;
      if (reducedMotion || phase !== "live") return false;
      paintRows.length = 0;
      paintRows.push(...buildPaintRows(performance.now()));
      return paintRows.some((row) => rowNeedsAnimation(row));
    },
    getPhase: () => phase,
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
