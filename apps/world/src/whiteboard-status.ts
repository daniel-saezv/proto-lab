import { CanvasTexture, LinearFilter, SRGBColorSpace } from "three";
import { ensureChalkMarkAudio, playChalkMark } from "./chalk-mark-sound";
import {
  boardNavAction,
  buildBoardUi,
  formatBoardDate,
  kindDetailLabel,
  phaseDetailLabel,
  type BoardUiSnapshot,
} from "./proposals-board-actions";
import {
  ANIM_FRAME_MS,
  paintRetryChalk,
  paintSkeletonBoard,
  paintWhiteboardFrame,
  revealComplete,
  revealRowProgress,
} from "./proposals-board-chalk";
import {
  chalkMarkProgress,
  detailActionRect,
  detailBackRect,
  hitBoard,
  MARK_DRAW_MS,
  paintDetailBoard,
  paintListAffordances,
  paintListIncoming,
  paintListOutgoing,
  rowHitRect,
  type BoardHit,
  type BoardRect,
  type ChalkAppearance,
  type DetailEmphasis,
} from "./proposals-board-detail";
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
  type BoardPaintModel,
  type BoardPaintRow,
  type BoardRowLayout,
} from "./proposals-board-paint";
import { BoardSession, drawAppearance, eraseAppearance } from "./proposals-board-session";
import type { ProposalStatusItem } from "./proposals-status-api";
import type { WhiteboardPhase, WhiteboardStatusController, WhiteboardStatusOptions } from "./whiteboard-status-types";

export type { WhiteboardPhase, WhiteboardStatusController } from "./whiteboard-status-types";

const PULSE_INTERVAL_MS = 100;
const HIGHLIGHT_MS = 1400;

export function createWhiteboardStatus(options: WhiteboardStatusOptions): WhiteboardStatusController {
  ensureChalkMarkAudio();
  const reducedMotion = options.reducedMotion ?? window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const canvas = document.createElement("canvas");
  canvas.width = WHITEBOARD_WIDTH;
  canvas.height = WHITEBOARD_HEIGHT;
  canvas.dataset.whiteboardPhase = "loading";
  canvas.setAttribute("aria-hidden", "true");
  if (options.attachTo) {
    canvas.className = "fallback-whiteboard-canvas";
    canvas.dataset.testid = "fallback-whiteboard";
    canvas.style.touchAction = "manipulation";
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
  const session = new BoardSession();
  let hover: BoardHit | null = null;
  const markStart = new Map<string, number>();
  let hotSignature = "";
  let knownSlugs = options.knownSlugs ?? [];
  let uiSignature = "";

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

  function rowNumbers(): number[] {
    return selectBoardRows(items).rows.map((item) => item.number);
  }

  function selectedItem(): ProposalStatusItem | null {
    if (session.selectedNumber == null) return null;
    return selectBoardRows(items).rows.find((item) => item.number === session.selectedNumber) ?? null;
  }

  function currentUi(): BoardUiSnapshot {
    return buildBoardUi({
      interactive: session.interactive,
      moving: session.isMoving(),
      screen: session.screen,
      selectedNumber: session.selectedNumber,
      focus: session.focus,
      items,
      knownSlugs,
    });
  }

  function publishUi() {
    const ui = currentUi();
    const next = JSON.stringify(ui);
    canvas.dataset.boardScreen = ui.screen;
    canvas.dataset.boardSelected = ui.selectedNumber == null ? "" : String(ui.selectedNumber);
    canvas.dataset.boardAction = ui.detail?.action?.kind ?? "";
    canvas.dataset.boardActionLabel = ui.detail?.action?.label ?? "";
    canvas.dataset.boardMotion = ui.moving ? "1" : "0";
    canvas.dataset.boardInteractive = ui.interactive ? "1" : "0";
    if (next === uiSignature) return;
    uiSignature = next;
    options.onUi?.(ui);
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

  function listModel(nowMs: number): BoardPaintModel {
    paintRows.length = 0;
    paintRows.push(...buildPaintRows(nowMs));
    const { overflow } = selectBoardRows(items);
    return { rows: paintRows, overflow, partial, pulseT, reducedMotion };
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

  function markIdOf(hit: BoardHit | null): string | null {
    if (!hit) return null;
    return hit.zone === "row" ? `row:${hit.number}` : hit.zone;
  }

  function hotIds(): string[] {
    const ids: string[] = [];
    if (session.screen === "list") {
      if (session.focus?.zone === "row") ids.push(`row:${session.focus.number}`);
      if (hover?.zone === "row") ids.push(`row:${hover.number}`);
    } else {
      if (session.focus?.zone === "back" || session.focus?.zone === "action") ids.push(session.focus.zone);
      if (hover?.zone === "back" || hover?.zone === "action") ids.push(hover.zone);
    }
    return [...new Set(ids)];
  }

  function syncMarks(nowMs: number) {
    if (session.screen === "detail" && hover?.zone === "row") hover = null;
    if (session.screen === "list" && hover && hover.zone !== "row") hover = null;
    const ids = hotIds();
    const signature = ids.join("|");
    if (signature === hotSignature) return;
    hotSignature = signature;
    for (const id of [...markStart.keys()]) {
      if (!ids.includes(id)) markStart.delete(id);
    }
    for (const id of ids) {
      if (!markStart.has(id)) {
        markStart.set(id, nowMs);
        playChalkMark(nowMs);
      }
    }
  }

  function markProgress(id: string, nowMs: number): number {
    const start = markStart.get(id);
    if (start == null) return 0;
    return chalkMarkProgress(nowMs - start, reducedMotion);
  }

  function marksSettled(nowMs: number): boolean {
    if (reducedMotion || markStart.size === 0) return true;
    for (const start of markStart.values()) {
      if (nowMs - start < MARK_DRAW_MS) return false;
    }
    return true;
  }

  function resetMarks() {
    hover = null;
    markStart.clear();
    hotSignature = "";
  }

  function detailEmphasis(nowMs: number): DetailEmphasis {
    return {
      back: markStart.has("back") ? markProgress("back", nowMs) : null,
      action: markStart.has("action") ? markProgress("action", nowMs) : null,
    };
  }

  function paintAffordances(nowMs: number) {
    if (!session.interactive || session.screen !== "list" || session.isMoving()) return;
    syncMarks(nowMs);
    paintListAffordances(ctx, layouts, paintRows, (number) => {
      const id = `row:${number}`;
      return markStart.has(id) ? markProgress(id, nowMs) : null;
    });
  }

  function fullRedraw(nowMs: number) {
    layouts = paintWhiteboard(ctx, listModel(nowMs));
    paintAffordances(nowMs);
    paintRetryIfNeeded(nowMs);
    texture.needsUpdate = true;
  }

  function detailAppearance(nowMs: number, appearance: ChalkAppearance) {
    const item = selectedItem();
    if (!item) {
      fullRedraw(nowMs);
      return;
    }
    const action = boardNavAction(item, knownSlugs);
    const date = formatBoardDate(item.updatedAt);
    syncMarks(nowMs);
    paintDetailBoard(
      ctx,
      {
        number: item.number,
        title: item.title,
        meta: [kindDetailLabel(item.kind), date].filter((part): part is string => Boolean(part)).join(" · "),
        phaseLabel: phaseDetailLabel(item.phase),
        actionLabel: action?.label ?? null,
      },
      appearance,
      detailEmphasis(nowMs),
    );
    paintRetryIfNeeded(nowMs);
    texture.needsUpdate = true;
  }

  function repaint(nowMs: number) {
    if (phase === "loading" || phase === "reveal") return;
    if (session.screen === "detail" && selectedItem() && !session.isMoving()) {
      detailAppearance(nowMs, { stroke: 1, text: 1 });
      return;
    }
    fullRedraw(nowMs);
  }

  function paintMotion(nowMs: number) {
    const sample = session.motionSample(nowMs, reducedMotion);
    if (sample.stage === "settled") {
      session.settle(nowMs, reducedMotion);
      repaint(nowMs);
      publishUi();
      return;
    }
    if (sample.stage === "erase" && sample.from === "list") {
      layouts = paintListOutgoing(ctx, listModel(nowMs), sample.t);
    } else if (sample.stage === "draw" && sample.to === "list") {
      layouts = paintListIncoming(ctx, listModel(nowMs), sample.t);
    } else if (sample.stage === "erase") {
      detailAppearance(nowMs, eraseAppearance(sample.t));
    } else {
      detailAppearance(nowMs, drawAppearance(sample.t));
    }
    texture.needsUpdate = true;
  }

  function afterInput(nowMs: number) {
    if (session.isMoving()) paintMotion(nowMs);
    else repaint(nowMs);
    publishUi();
  }

  function activateSelection() {
    const item = selectedItem();
    if (!item) return;
    const action = boardNavAction(item, knownSlugs);
    if (!action) return;
    options.onAction?.(action);
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
      repaint(nowMs);
      publishUi();
    }
  }

  function paintBackgroundOnly() {
    paintWhiteboardFrame(ctx);
    texture.needsUpdate = true;
  }

  function hitFromUv(u: number, v: number): BoardHit | null {
    const x = u * WHITEBOARD_WIDTH;
    const y = (1 - v) * WHITEBOARD_HEIGHT;
    const item = selectedItem();
    const hasAction = session.screen === "detail" && item != null && boardNavAction(item, knownSlugs) != null;
    return hitBoard(x, y, session.screen, layouts, hasAction);
  }

  function pointerAt(u: number, v: number) {
    if (!session.interactive || (phase !== "live" && phase !== "empty")) return;
    const hit = hitFromUv(u, v);
    const item = selectedItem();
    const hasAction = session.screen === "detail" && item != null && boardNavAction(item, knownSlugs) != null;
    if (!hit) return;
    const now = performance.now();
    const result = session.pointer(
      hit.zone,
      hit.zone === "row" ? hit.number : undefined,
      rowNumbers(),
      hasAction,
      now,
      reducedMotion,
    );
    if (result.activate) {
      activateSelection();
      return;
    }
    if (result.handled) afterInput(now);
  }

  function hoverAt(u: number, v: number) {
    if (!session.interactive || (phase !== "live" && phase !== "empty")) return;
    const hit = hitFromUv(u, v);
    if (markIdOf(hover) === markIdOf(hit)) return;
    hover = hit;
    const now = performance.now();
    syncMarks(now);
    if (session.isMoving()) return;
    repaint(now);
  }

  function clearHover() {
    if (!hover) return;
    hover = null;
    const now = performance.now();
    syncMarks(now);
    if (!session.interactive || session.isMoving()) return;
    if (phase === "live" || phase === "empty") repaint(now);
  }

  if (options.attachTo) {
    let downX = 0;
    let downY = 0;
    let dragged = false;
    canvas.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      downX = event.clientX;
      downY = event.clientY;
      dragged = false;
    });
    function fallbackUv(event: PointerEvent): { u: number; v: number } | null {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
      const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
      return { u: x / canvas.width, v: 1 - y / canvas.height };
    }
    canvas.addEventListener("pointermove", (event) => {
      if (Math.hypot(event.clientX - downX, event.clientY - downY) > 10) dragged = true;
      const uv = fallbackUv(event);
      if (!uv) clearHover();
      else hoverAt(uv.u, uv.v);
    });
    canvas.addEventListener("pointerleave", () => clearHover());
    canvas.addEventListener("pointerup", (event) => {
      if (event.button !== 0 || dragged) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
      const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
      pointerAt(x / canvas.width, 1 - y / canvas.height);
    });
  }

  paintBackgroundOnly();
  if (reducedMotion) {
    paintSkeletonBoard(ctx, 0, true, false);
  }
  if (options.interactive) session.setInteractive(true, []);
  publishUi();

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
      session.syncRows(rowNumbers());

      if (session.screen === "detail" && selectedItem() && !session.isMoving()) {
        setPhase("live");
        repaint(performance.now());
        publishUi();
        return;
      }

      const rowCount = selectBoardRows(items).rows.length;
      if (rowCount === 0) {
        setPhase("empty");
        fullRedraw(performance.now());
        publishUi();
        return;
      }

      if (reducedMotion) {
        setPhase("live");
        fullRedraw(performance.now());
        publishUi();
        return;
      }

      setPhase("reveal");
      revealStartMs = performance.now();
      paintRevealFrame(revealStartMs);
      publishUi();
    },
    setFetchError(failed: boolean) {
      fetchError = failed;
      if (failed && !receivedData) {
        setPhase("loading");
        paintLoadingFrame(performance.now());
        return;
      }
      if (failed && (phase === "live" || phase === "empty")) {
        repaint(performance.now());
      }
    },
    setInteractive(on: boolean) {
      if (!on) resetMarks();
      const changed = session.setInteractive(on, rowNumbers());
      if (!changed) return;
      if (phase === "live" || phase === "empty") repaint(performance.now());
      publishUi();
    },
    pointerAt,
    hoverAt,
    clearHover,
    selectRow(number: number) {
      if (!session.interactive || (phase !== "live" && phase !== "empty")) return;
      const now = performance.now();
      if (!session.select(number, rowNumbers(), now, reducedMotion)) return;
      afterInput(now);
    },
    handleKey(key: string) {
      if (!session.interactive) return false;
      const item = selectedItem();
      const hasAction = session.screen === "detail" && item != null && boardNavAction(item, knownSlugs) != null;
      const now = performance.now();
      const result = session.key(key, rowNumbers(), hasAction, now, reducedMotion);
      if (result.activate) {
        activateSelection();
        return true;
      }
      if (!result.handled) return false;
      afterInput(now);
      return true;
    },
    clearSelection() {
      return this.handleKey("Escape");
    },
    targetRect(zone, number) {
      if (zone === "back") return detailBackRect();
      if (zone === "action") {
        const item = selectedItem();
        if (!item || !boardNavAction(item, knownSlugs)) return null;
        return detailActionRect();
      }
      const layout = layouts.find((row) => row.number === number);
      return layout ? rowHitRect(layout) : null;
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

      if (session.interactive && session.isMoving()) {
        if (nowMs - lastAnimDraw < ANIM_FRAME_MS) return;
        lastAnimDraw = nowMs;
        paintMotion(nowMs);
        return;
      }

      if (fetchError) {
        if (nowMs - lastAnimDraw < ANIM_FRAME_MS) return;
        lastAnimDraw = nowMs;
        repaint(nowMs);
        return;
      }

      if (session.interactive && !marksSettled(nowMs)) {
        if (nowMs - lastAnimDraw < ANIM_FRAME_MS) return;
        lastAnimDraw = nowMs;
        repaint(nowMs);
        return;
      }

      if (session.screen === "detail") return;
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
      paintAffordances(nowMs);
      texture.needsUpdate = true;
    },
    needsAnimation() {
      if (phase === "loading" || phase === "reveal") return true;
      if (session.interactive && session.isMoving()) return true;
      if (session.interactive && !marksSettled(performance.now())) return true;
      if (fetchError) return true;
      if (session.screen === "detail") return false;
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
    getUi: () => currentUi(),
    dispose() {
      texture.dispose();
      canvas.remove();
    },
  };
}
