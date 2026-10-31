import type { CanvasTexture } from "three";
import type { BoardNavAction, BoardUiSnapshot } from "./proposals-board-actions";
import type { BoardRect } from "./proposals-board-detail";
import type { ProposalStatusItem } from "./proposals-status-api";

export type WhiteboardPhase = "loading" | "reveal" | "live" | "empty";

export type WhiteboardStatusController = {
  texture: CanvasTexture;
  canvas: HTMLCanvasElement;
  setItems: (items: ProposalStatusItem[], partial: boolean) => void;
  setFetchError: (failed: boolean) => void;
  /** La vista fijada (o el lienzo del respaldo) acepta toques. Fuera de ella no hay trabajo extra. */
  setInteractive: (on: boolean) => void;
  /** UV de Three (v hacia arriba). */
  pointerAt: (u: number, v: number) => void;
  /** Resalta la zona bajo el puntero. Solo tiene efecto con la vista fijada. */
  hoverAt: (u: number, v: number) => void;
  clearHover: () => void;
  handleKey: (key: string) => boolean;
  selectRow: (number: number) => void;
  /** True si había un detalle y se ha vuelto a la lista. */
  clearSelection: () => boolean;
  targetRect: (zone: "row" | "back" | "action", number?: number) => BoardRect | null;
  tick: (nowMs: number) => void;
  needsAnimation: () => boolean;
  getPhase: () => WhiteboardPhase;
  getItemSummary: () => string;
  getUi: () => BoardUiSnapshot;
  dispose: () => void;
};

export type WhiteboardStatusOptions = {
  reducedMotion?: boolean;
  attachTo?: HTMLElement;
  interactive?: boolean;
  knownSlugs?: readonly string[];
  onSummaryChange?: (summary: string) => void;
  onUi?: (ui: BoardUiSnapshot) => void;
  onAction?: (action: BoardNavAction) => void;
};
