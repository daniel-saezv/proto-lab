import { createAmbienceMusic } from "./ambience-music";
import { sendProposal } from "./api";
import catalogFile from "./generated/catalog.json";
import { LAB_ROOT_HREF, type BoardNavAction, type BoardUiSnapshot } from "./proposals-board-actions";
import { renderBoardControls } from "./proposals-board-a11y";
import { createDialogue } from "./dialogue";
import { loungeScript } from "./dialogue-script";
import { createGameSelector } from "./game-selector";
import { createInstallHelp, type DeferredInstallPrompt } from "./install-help";
import { createOverlay } from "./overlay";
import { createProposalStatusPoller, lobbyPollActive } from "./proposals-status-poller";
import { fetchProposalStatus, type ProposalStatusItem } from "./proposals-status-api";
import { readPrototypeSlugFromHash, writePrototypeHash } from "./proto-deep-link";
import { isPrototypeUnseen, markPrototypeSeen } from "./proto-version-seen";
import type { CatalogEntry } from "./types";
import type { WhiteboardStatusController } from "./whiteboard-status-types";
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
const boardA11y = must("#board-a11y");
const touchControls = must("#touch-controls");
const touchZoneMove = must("#touch-zone-move");
const touchZoneLook = must("#touch-zone-look");
const joystickMarker = must("#joystick");
const dialogueRoot = must("#dialogue");
const selectorRoot = must("#game-selector");
const installHelpRoot = must("#install-help");
const stage = must("#stage");
const fallback = must("#fallback");

const touch = window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
hint.textContent = touch
  ? "Toca a la izquierda para caminar y a la derecha para mirar"
  : "WASD para caminar, arrastra el ratón para mirar, E para usar";
if (touch) {
  touchControls.hidden = false;
  shell.classList.add("has-joystick");
}

let inputEnabled = true;
let viewingBoard = false;
let deferredInstallPrompt: DeferredInstallPrompt | null = null;
let lobbyWhiteboard: WhiteboardStatusController | null = null;
let fallbackWhiteboard: WhiteboardStatusController | null = null;
let fallbackAnimFrame = 0;
let latestProposalStatus: { items: ProposalStatusItem[]; partial: boolean } | null = null;
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
  onShowInstallHelp: () => installHelp.open(),
  onOpen: blockWorldInput,
  onClose: () => {
    if (world?.isDialogueFraming()) return;
    restoreWorldInput();
  },
  onFocus: (focus) => {
    world?.setDialogueFocus(focus);
  },
  onEmphasis: () => {
    world?.pulseDialogue();
  },
});

const overlay = createOverlay(
  stage,
  () => {
    inputEnabled = true;
    world?.setInputEnabled(true);
    world?.setSelectorOpen(false);
    world?.setSuspended(false);
    resumeFallbackWhiteboardLoop();
    music.setPaused(document.visibilityState !== "visible");
    music.restorePlayback();
    statusPoller.refresh();
  },
  {
    onOpenEntry: (entry) => {
      markPrototypeSeen(entry.slug, entry.version);
      writePrototypeHash(entry.slug);
    },
    onClosed: () => {
      writePrototypeHash(null);
    },
    onSuggestImprovement: (entry) => {
      overlay.close();
      dialogue.openIteration(entry.slug);
    },
  },
);

function openPrototype(entry: CatalogEntry) {
  world?.setSuspended(true);
  stopFallbackWhiteboardLoop();
  music.releasePlayback();
  overlay.open(entry);
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
}

function performBoardAction(action: BoardNavAction) {
  if (action.kind === "preview" || action.kind === "lab-root") {
    window.open(action.href, "_blank", "noopener,noreferrer");
    return;
  }
  const entry = visiblePrototypes.find((item) => item.slug === action.slug);
  if (!entry) {
    window.open(LAB_ROOT_HREF, "_blank", "noopener,noreferrer");
    return;
  }
  world?.exitWhiteboard();
  openPrototype(entry);
}

function activeBoard(): WhiteboardStatusController | null {
  return lobbyWhiteboard ?? fallbackWhiteboard;
}

function syncBoardControls(ui: BoardUiSnapshot) {
  const focusInside = boardA11y.contains(document.activeElement);
  renderBoardControls(boardA11y, ui, {
    onRow: (number) => activeBoard()?.selectRow(number),
    onBack: () => activeBoard()?.clearSelection(),
    onAction: (action) => performBoardAction(action),
  });
  if (focusInside && ui.interactive) {
    boardA11y.querySelector<HTMLElement>('[tabindex="0"]')?.focus({ preventScroll: true });
  }
}

function focusBoardControl() {
  boardA11y.querySelector<HTMLElement>('[tabindex="0"]')?.focus({ preventScroll: true });
}

function flushProposalStatusToBoards() {
  if (!latestProposalStatus) {
    statusPoller.refresh();
    return;
  }
  applyProposalStatus(latestProposalStatus.items, latestProposalStatus.partial);
}

function tryOpenDeepLink() {
  const slug = readPrototypeSlugFromHash();
  if (!slug) return;
  const entry = catalogPrototypes.find((item) => item.slug === slug && !item.hidden);
  if (!entry) {
    writePrototypeHash(null);
    return;
  }
  if (selector.isOpen()) selector.close();
  world?.setSelectorOpen(false);
  inputEnabled = false;
  world?.setInputEnabled(false);
  interact.hidden = true;
  openPrototype(entry);
}

let world: import("./world").WorldHandle | null = null;

const selector = createGameSelector({
  root: selectorRoot,
  prototypes: visiblePrototypes,
  isPrototypeUnseen: (slug) => {
    const entry = visiblePrototypes.find((item) => item.slug === slug);
    return entry ? isPrototypeUnseen(slug, entry.version) : false;
  },
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

function boardArrowKey(key: string): boolean {
  return key === "ArrowUp" || key === "ArrowDown" || key === "Home" || key === "End";
}

window.addEventListener("keydown", (event) => {
  if (selector.handleKey(event)) return;
  if (installHelp.handleKey(event)) return;
  const reading = world?.isViewingWhiteboard() ?? false;
  const fallbackBoard = !world ? fallbackWhiteboard : null;
  if ((reading || fallbackBoard) && boardArrowKey(event.key)) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.repeat) return;
    const handled = reading ? world?.handleBoardKey(event.key) : fallbackBoard?.handleKey(event.key);
    if (handled) focusBoardControl();
    return;
  }
  if (event.key === "Escape") {
    if (overlay.isOpen()) overlay.close();
    else if (reading) {
      if (!world?.clearBoardSelection()) world?.exitWhiteboard();
    } else if (fallbackBoard?.clearSelection()) {
      focusBoardControl();
    } else if (installHelp.isOpen()) installHelp.close();
    else if (selector.isOpen()) selector.close();
    else if (dialogue.isOpen()) dialogue.close();
    return;
  }
  if ((reading || fallbackBoard) && (event.key === "Enter" || event.key === " ") && event.target !== boardBack) {
    if (event.target instanceof Node && boardA11y.contains(event.target)) return;
    if (event.repeat) return;
    const handled = reading ? world?.handleBoardKey(event.key) : fallbackBoard?.handleKey(event.key);
    if (handled) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
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
    knownSlugs: visiblePrototypes.map((entry) => entry.slug),
    onBoardUi: syncBoardControls,
    onBoardAction: performBoardAction,
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
    music.prime();
    await mountFallback();
    finishBoot();
    tryOpenDeepLink();
    return;
  }
  try {
    performance.mark("proto:world-import");
    const module = await import("./world");
    performance.mark("proto:world-imported");
    music.prime();
    performance.measure("proto:import-world", "proto:world-import", "proto:world-imported");
    world = module.startWorld({
      viewport,
      labels,
      prototypes: visiblePrototypes,
      touchControls: touch
        ? { zoneMove: touchZoneMove, zoneLook: touchZoneLook, activeMarker: joystickMarker }
        : undefined,
      e2e,
      perf,
      batch,
      isPrototypeUnseen: (slug) => {
        const entry = visiblePrototypes.find((item) => item.slug === slug);
        return entry ? isPrototypeUnseen(slug, entry.version) : false;
      },
      onReady: () => {
        performance.mark("proto:ready");
        performance.measure("proto:to-ready", "proto:boot", "proto:ready");
        viewport.dataset.testid = "world-ready";
        finishBoot();
        statusPoller.refresh();
        tryOpenDeepLink();
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
      onTalkNpc: (id) => {
        const script = loungeScript(id);
        if (script) dialogue.openScript(script);
      },
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
      },
      onBoardUi: syncBoardControls,
      onBoardAction: performBoardAction,
      onDialogueFrame: (open) => {
        if (open) blockWorldInput();
        else if (!dialogue.isOpen() && !overlay.isOpen() && !selector.isOpen() && !installHelp.isOpen()) {
          restoreWorldInput();
        }
      },
      onWhiteboardReady: (controller) => {
        lobbyWhiteboard = controller;
        flushProposalStatusToBoards();
      },
      onGesture: () => music.unlock(),
    });
  } catch (error) {
    console.error("No se ha podido encender el laboratorio en 3D");
    music.prime();
    await mountFallback();
    finishBoot();
    void error;
  }
}

function finishBoot() {
  boot.hidden = true;
  boot.style.display = "none";
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

window.addEventListener("hashchange", () => {
  if (overlay.isOpen() || !boot.hasAttribute("hidden")) return;
  tryOpenDeepLink();
});
