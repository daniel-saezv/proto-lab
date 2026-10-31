import { createAmbienceMusic } from "./ambience-music";
import { sendProposal } from "./api";
import { renderPreviewActions } from "./board-preview";
import catalogFile from "./generated/catalog.json";
import { createDialogue } from "./dialogue";
import { createGameSelector } from "./game-selector";
import { createInstallHelp, type DeferredInstallPrompt } from "./install-help";
import { createOverlay } from "./overlay";
import { createProposalStatusPoller, lobbyPollActive } from "./proposals-status-poller";
import { fetchProposalStatus, type ProposalStatusItem } from "./proposals-status-api";
import type { WhiteboardStatusController } from "./whiteboard-status";
import type { CatalogEntry } from "./types";
import "./style.css";

const catalogPrototypes = catalogFile.prototypes as CatalogEntry[];
const visiblePrototypes = catalogPrototypes.filter((entry) => !entry.hidden);
const params = new URLSearchParams(location.search);
const e2e = params.get("e2e") === "1";
const perf = params.get("perf") === "1";
const batch = params.get("batch") !== "0";
const instant = e2e || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
performance.mark("proto:boot");

const boot = must("#boot");
const shell = must("#shell");
const viewport = must("#viewport");
const labels = must("#labels");
const hint = must("#hint");
const interact = must<HTMLButtonElement>("#interact");
const muteMusic = must<HTMLButtonElement>("#mute-music");
const music = createAmbienceMusic(muteMusic);
const boardBack = must<HTMLButtonElement>("#board-back");
const joystick = must("#joystick");
const knob = must("#knob");
const dialogueRoot = must("#dialogue");
const selectorRoot = must("#game-selector");
const installHelpRoot = must("#install-help");
const stage = must("#stage");
const fallback = must("#fallback");
const boardPreviews = must("#board-previews");

const touch = window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
hint.textContent = touch
  ? "Joystick a la izquierda, arrastra para mirar"
  : "WASD para caminar, arrastra el ratón para mirar, E para usar";
if (touch) {
  joystick.hidden = false;
  shell.classList.add("has-joystick");
}

let inputEnabled = true;
let viewingBoard = false;
let deferredInstallPrompt: DeferredInstallPrompt | null = null;
let lobbyWhiteboard: WhiteboardStatusController | null = null;
let fallbackWhiteboard: WhiteboardStatusController | null = null;
let fallbackAnimFrame = 0;
let latestProposalStatus: { items: ProposalStatusItem[]; partial: boolean } | null = null;
let fallbackPreviews: HTMLElement | null = null;
let fallbackLoopOn = false;

function blockWorldInput() {
  inputEnabled = false;
  world?.setInputEnabled(false);
  interact.hidden = true;
}

function restoreWorldInput() {
  inputEnabled = true;
  world?.setInputEnabled(true);
}

const installHelp = createInstallHelp({
  root: installHelpRoot,
  getDeferredPrompt: () => deferredInstallPrompt,
  clearDeferredPrompt: () => {
    deferredInstallPrompt = null;
  },
  onOpen: blockWorldInput,
  onClose: restoreWorldInput,
});

const dialogue = createDialogue({
  root: dialogueRoot,
  prototypes: visiblePrototypes,
  instant,
  submit: sendProposal,
  getNearbySlug: () => world?.getNearbySlug() ?? null,
  onShowInstallHelp: () => installHelp.open(),
  onOpen: blockWorldInput,
  onClose: restoreWorldInput,
});

const overlay = createOverlay(stage, () => {
  inputEnabled = true;
  world?.setInputEnabled(true);
  world?.setSelectorOpen(false);
  world?.setSuspended(false);
  resumeFallbackWhiteboardLoop();
  music.setPaused(document.visibilityState !== "visible");
  syncPreviewActions();
  statusPoller.refresh();
});

function openPrototype(entry: CatalogEntry) {
  world?.setSuspended(true);
  stopFallbackWhiteboardLoop();
  overlay.open(entry);
  syncPreviewActions();
}

const statusPoller = createProposalStatusPoller({
  fetch: fetchProposalStatus,
  onData: ({ items, partial }) => {
    lobbyWhiteboard?.setFetchError(false);
    fallbackWhiteboard?.setFetchError(false);
    applyProposalStatus(items, partial);
  },
  onError: () => {
    lobbyWhiteboard?.setFetchError(true);
    fallbackWhiteboard?.setFetchError(true);
  },
  shouldPoll: () =>
    lobbyPollActive({
      visible: document.visibilityState === "visible",
      prototypeOpen: overlay.isOpen(),
      lobbyMounted: boot.hasAttribute("hidden"),
    }),
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event as DeferredInstallPrompt;
});

function applyProposalStatus(items: ProposalStatusItem[], partial: boolean) {
  latestProposalStatus = { items, partial };
  lobbyWhiteboard?.setItems(items, partial);
  fallbackWhiteboard?.setItems(items, partial);
  syncPreviewActions();
}

function syncPreviewActions() {
  const items = latestProposalStatus?.items ?? [];
  if (fallbackPreviews) {
    const count = renderPreviewActions(fallbackPreviews, items);
    fallbackPreviews.hidden = count === 0;
  }
  const count = renderPreviewActions(boardPreviews, items);
  boardPreviews.hidden = !(viewingBoard && count > 0 && !overlay.isOpen());
}

function flushProposalStatusToBoards() {
  if (!latestProposalStatus) {
    statusPoller.refresh();
    return;
  }
  applyProposalStatus(latestProposalStatus.items, latestProposalStatus.partial);
}

let world: import("./world").WorldHandle | null = null;

const selector = createGameSelector({
  root: selectorRoot,
  prototypes: visiblePrototypes,
  onHighlight: (index) => world?.setArcadeHighlight(index),
  onPlay: (entry) => {
    selector.close();
    world?.setSelectorOpen(false);
    inputEnabled = false;
    world?.setInputEnabled(false);
    interact.hidden = true;
    openPrototype(entry);
  },
  onOpen: () => {
    inputEnabled = false;
    world?.setInputEnabled(false);
    world?.setSelectorOpen(true);
    interact.hidden = true;
  },
  onClose: () => {
    inputEnabled = true;
    world?.setInputEnabled(true);
    world?.setSelectorOpen(false);
  },
});

interact.addEventListener("click", () => world?.interact());
boardBack.addEventListener("click", () => world?.exitWhiteboard());

window.addEventListener("keydown", (event) => {
  if (selector.handleKey(event)) return;
  if (installHelp.handleKey(event)) return;
  if (event.key === "Escape") {
    if (overlay.isOpen()) overlay.close();
    else if (world?.isViewingWhiteboard()) world.exitWhiteboard();
    else if (installHelp.isOpen()) installHelp.close();
    else if (selector.isOpen()) selector.close();
    else if (dialogue.isOpen()) dialogue.close();
    return;
  }
  if (!inputEnabled || overlay.isOpen() || selector.isOpen() || dialogue.isOpen() || installHelp.isOpen()) return;
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  if (event.key.toLowerCase() === "e" && !event.repeat) {
    event.preventDefault();
    world?.interact();
  }
});

document.addEventListener("visibilitychange", () => {
  world?.setInputEnabled(document.visibilityState === "visible" && inputEnabled);
  music.setPaused(document.visibilityState !== "visible");
  if (document.visibilityState === "visible") statusPoller.refresh();
});

function stopFallbackWhiteboardLoop() {
  fallbackLoopOn = false;
  if (fallbackAnimFrame) cancelAnimationFrame(fallbackAnimFrame);
  fallbackAnimFrame = 0;
}

function startFallbackWhiteboardLoop() {
  if (fallbackLoopOn || overlay.isOpen()) return;
  fallbackLoopOn = true;
  const tick = (now: number) => {
    if (!fallbackLoopOn || overlay.isOpen()) {
      fallbackLoopOn = false;
      fallbackAnimFrame = 0;
      return;
    }
    fallbackWhiteboard?.tick(now);
    fallbackAnimFrame = requestAnimationFrame(tick);
  };
  fallbackAnimFrame = requestAnimationFrame(tick);
}

function resumeFallbackWhiteboardLoop() {
  if (fallbackWhiteboard) startFallbackWhiteboardLoop();
}

async function mountFallback() {
  const { showFallback } = await import("./fallback");
  showFallback({
    root: fallback,
    prototypes: visiblePrototypes,
    onTalk: () => dialogue.open(),
    onInstallHelp: () => installHelp.open(),
    onPlay: (entry) => openPrototype(entry),
    onPreviews: (container) => {
      fallbackPreviews = container;
      syncPreviewActions();
    },
    onWhiteboardReady: (controller) => {
      fallbackWhiteboard = controller;
      startFallbackWhiteboardLoop();
      flushProposalStatusToBoards();
    },
  });
}

async function bootWorld() {
  shell.hidden = false;
  statusPoller.start();
  if (!hasWebGL()) {
    await mountFallback();
    finishBoot();
    return;
  }
  try {
    performance.mark("proto:world-import");
    const module = await import("./world");
    performance.mark("proto:world-imported");
    performance.measure("proto:import-world", "proto:world-import", "proto:world-imported");
    world = module.startWorld({
      viewport,
      labels,
      prototypes: visiblePrototypes,
      joystick,
      knob,
      e2e,
      perf,
      batch,
      onReady: () => {
        performance.mark("proto:ready");
        performance.measure("proto:to-ready", "proto:boot", "proto:ready");
        viewport.dataset.testid = "world-ready";
        finishBoot();
        statusPoller.refresh();
      },
      onE2eReady: () => {
        if (!window.__protoLab) return;
        window.__protoLab.openPrototype = (slug: string) => {
          const entry = catalogPrototypes.find((item) => item.slug === slug);
          if (!entry) throw new Error(`Prototipo desconocido: ${slug}`);
          if (selector.isOpen()) selector.close();
          world?.setSelectorOpen(false);
          inputEnabled = false;
          world?.setInputEnabled(false);
          interact.hidden = true;
          openPrototype(entry);
        };
      },
      onTalk: () => dialogue.open(),
      onOpenSelector: () => {
        const index = 0;
        selector.open(index);
      },
      onTarget: (label) => {
        if (viewingBoard || !inputEnabled || overlay.isOpen() || selector.isOpen() || dialogue.isOpen() || installHelp.isOpen()) {
          interact.hidden = true;
          return;
        }
        interact.hidden = label == null;
        interact.textContent = label ?? "";
      },
      onBoardView: (open) => {
        viewingBoard = open;
        document.body.classList.toggle("reading-board", open);
        boardBack.hidden = !open;
        if (open) interact.hidden = true;
        syncPreviewActions();
      },
      onWhiteboardReady: (controller) => {
        lobbyWhiteboard = controller;
        flushProposalStatusToBoards();
      },
      onGesture: () => music.unlock(),
    });
  } catch (error) {
    console.error("No se ha podido encender el laboratorio en 3D");
    await mountFallback();
    finishBoot();
    void error;
  }
}

function finishBoot() {
  boot.hidden = true;
  if (import.meta.env.PROD && !e2e && "serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
}

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    return Boolean(gl);
  } catch {
    return false;
  }
}

function must<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector(selector);
  if (!(element instanceof HTMLElement)) throw new Error(`No está ${selector}`);
  return element as T;
}

void bootWorld();
