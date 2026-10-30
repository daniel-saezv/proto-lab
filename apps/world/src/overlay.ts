import type { CatalogEntry } from "./types";

export function createOverlay(root: HTMLElement, onClose: () => void) {
  function close() {
    if (document.fullscreenElement === root) void document.exitFullscreen?.();
    root.replaceChildren();
    root.hidden = true;
    onClose();
  }

  function open(entry: CatalogEntry) {
    root.hidden = false;
    root.replaceChildren();

    const header = document.createElement("header");
    const back = document.createElement("button");
    back.type = "button";
    back.className = "text-button";
    back.dataset.testid = "close-prototype";
    back.textContent = "Volver";
    back.addEventListener("click", close);

    const title = document.createElement("h1");
    title.textContent = entry.title;

    const full = document.createElement("button");
    full.type = "button";
    full.className = "text-button";
    full.dataset.testid = "fullscreen";
    full.textContent = "Pantalla completa";
    full.addEventListener("click", () => {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void root.requestFullscreen?.().catch(() => {});
    });

    header.append(back, title, full);

    const frame = document.createElement("iframe");
    frame.title = entry.title;
    frame.sandbox.add("allow-scripts");
    frame.referrerPolicy = "no-referrer";
    frame.src = entry.href;
    root.append(header, frame);
  }

  return {
    open,
    close,
    isOpen: () => !root.hidden,
  };
}
