import type { CanvasTexture } from "three";
import type { ProposalStatusItem } from "./proposals-status-api";

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
