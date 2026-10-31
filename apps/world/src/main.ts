import { sendProposal } from "./api";
import catalogFile from "./generated/catalog.json";
import { createDialogue } from "./dialogue";
import { showFallback } from "./fallback";
import { createGameSelector } from "./game-selector";
import { createInstallHelp, type DeferredInstallPrompt } from "./install-help";
import { createOverlay } from "./overlay";
import { createProposalStatusPoller, lobbyPollActive } from "./proposals-status-poller";
import { fetchProposalStatus } from "./proposals-status-api";
import type { WhiteboardStatusController } from "./whiteboard-status";
import type { CatalogEntry } from "./types";
import "./style.css";

const catalogPrototypes = catalogFile.prototypes as CatalogEntry[];
const visiblePrototypes = catalogPrototypes.filter((entry) => !entry.hidden);
const params = new URLSearchParams(location.search);
const e2e = params.get("e2e") === "1";
const instant = e2e || window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const boot = must("#boot");
const shell = must("#shell");
const viewport = must("#viewport");
const labels = must("#labels");
const hint = must("#hint");
const interact = must<HTMLButtonElement>("#interact");
const joystick = must("#joystick");
const knob = must("#knob");
const dialogueRoot = must("#dialogue");
const selectorRoot = must("#game-selector");
const installHelpRoot = must("#install-help");
const stage = must("#stage");
const fallback = must("#fallback");

const touch = window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
hint.textContent = touch
  ? "Joystick a la izquierda, arrastra para mirar"
  : "WASD para caminar, arrastra el ratón para mirar, E para usar";
if (touch) {
  joystick.hidden = false;
  shell.classList.add("has-joystick");
}

let inputEnabled = true;
let deferredInstallPrompt: DeferredInstallPrompt | null = null;
let lobbyWhiteboard: WhiteboardStatusController | null = null;
let fallbackWhiteboard: WhiteboardStatusController | null = null;
let fallbackAnimFrame = 0;
let latestProposalStatus: { items: import("./proposals-status-api").ProposalStatusItem[]; partial: boolean } | null =
  null;

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
  statusPoller.refresh();
});

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

function applyProposalStatus(items: import("./proposals-status-api").ProposalStatusItem[], partial: boolean) {
  latestProposalStatus = { items, partial };
  lobbyWhiteboard?.setItems(items, partial);
  fallbackWhiteboard?.setItems(items, partial);
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
    overlay.open(entry);
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

window.addEventListener("keydown", (event) => {
  if (selector.handleKey(event)) return;
  if (installHelp.handleKey(event)) return;
  if (event.key === "Escape") {
    if (overlay.isOpen()) overlay.close();
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
  if (document.visibilityState === "visible") statusPoller.refresh();
});

function startFallbackWhiteboardLoop() {
  const tick = (now: number) => {
    fallbackWhiteboard?.tick(now);
    fallbackAnimFrame = requestAnimationFrame(tick);
  };
  fallbackAnimFrame = requestAnimationFrame(tick);
}

async function bootWorld() {
  shell.hidden = false;
  statusPoller.start();
  if (!hasWebGL()) {
    showFallback({
      root: fallback,
      prototypes: visiblePrototypes,
      onTalk: () => dialogue.open(),
      onInstallHelp: () => installHelp.open(),
      onPlay: (entry) => overlay.open(entry),
      onWhiteboardReady: (controller) => {
        fallbackWhiteboard = controller;
        startFallbackWhiteboardLoop();
        flushProposalStatusToBoards();
      },
    });
    finishBoot();
    return;
  }
  try {
    const module = await import("./world");
    world = module.startWorld({
      viewport,
      labels,
      prototypes: visiblePrototypes,
      joystick,
      knob,
      e2e,
      onReady: () => {
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
          overlay.open(entry);
        };
      },
      onTalk: () => dialogue.open(),
      onOpenSelector: () => {
        const index = 0;
        selector.open(index);
      },
      onTarget: (label) => {
        if (!inputEnabled || overlay.isOpen() || selector.isOpen() || dialogue.isOpen() || installHelp.isOpen()) {
          interact.hidden = true;
          return;
        }
        interact.hidden = label == null;
        interact.textContent = label ?? "";
      },
      onWhiteboardReady: (controller) => {
        lobbyWhiteboard = controller;
        flushProposalStatusToBoards();
      },
    });
  } catch (error) {
    console.error("No se ha podido encender el laboratorio en 3D");
    showFallback({
      root: fallback,
      prototypes: visiblePrototypes,
      onTalk: () => dialogue.open(),
      onInstallHelp: () => installHelp.open(),
      onPlay: (entry) => overlay.open(entry),
      onWhiteboardReady: (controller) => {
        fallbackWhiteboard = controller;
        startFallbackWhiteboardLoop();
        flushProposalStatusToBoards();
      },
    });
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
