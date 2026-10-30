import { sendProposal } from "./api";
import catalogFile from "./generated/catalog.json";
import { createDialogue } from "./dialogue";
import { showFallback } from "./fallback";
import { createOverlay } from "./overlay";
import type { CatalogEntry } from "./types";
import "./style.css";

const prototypes = catalogFile.prototypes as CatalogEntry[];
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
const dialogue = createDialogue({
  root: dialogueRoot,
  prototypes,
  instant,
  submit: sendProposal,
  getNearbySlug: () => world?.getNearbySlug() ?? null,
  onOpen: () => {
    inputEnabled = false;
    world?.setInputEnabled(false);
    interact.hidden = true;
  },
  onClose: () => {
    inputEnabled = true;
    world?.setInputEnabled(true);
  },
});

const overlay = createOverlay(stage, () => {
  inputEnabled = true;
  world?.setInputEnabled(true);
});

let world: import("./world").WorldHandle | null = null;

interact.addEventListener("click", () => world?.interact());

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (overlay.isOpen()) overlay.close();
    else if (dialogue.isOpen()) dialogue.close();
    return;
  }
  if (!inputEnabled || overlay.isOpen() || dialogue.isOpen()) return;
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  if (event.key.toLowerCase() === "e" && !event.repeat) {
    event.preventDefault();
    world?.interact();
  }
});

document.addEventListener("visibilitychange", () => {
  world?.setInputEnabled(document.visibilityState === "visible" && inputEnabled);
});

async function bootWorld() {
  shell.hidden = false;
  if (!hasWebGL()) {
    showFallback({ root: fallback, prototypes, onTalk: () => dialogue.open(), onPlay: (entry) => overlay.open(entry) });
    finishBoot();
    return;
  }
  try {
    const module = await import("./world");
    world = module.startWorld({
      viewport,
      labels,
      prototypes,
      joystick,
      knob,
      e2e,
      onReady: () => {
        viewport.dataset.testid = "world-ready";
        finishBoot();
      },
      onTalk: () => dialogue.open(),
      onPlay: (entry) => {
        inputEnabled = false;
        world?.setInputEnabled(false);
        interact.hidden = true;
        overlay.open(entry);
      },
      onTarget: (label) => {
        if (!inputEnabled || dialogue.isOpen() || overlay.isOpen()) {
          interact.hidden = true;
          return;
        }
        interact.hidden = label == null;
        interact.textContent = label ?? "";
      },
    });
  } catch (error) {
    console.error("No se ha podido encender el laboratorio en 3D");
    showFallback({ root: fallback, prototypes, onTalk: () => dialogue.open(), onPlay: (entry) => overlay.open(entry) });
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
