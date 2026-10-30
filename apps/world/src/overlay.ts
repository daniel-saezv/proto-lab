import { fetchPrototypeDocument, type PrototypeScript } from "./prototype-document";
import type { CatalogEntry } from "./types";

export function createOverlay(root: HTMLElement, onClose: () => void) {
  let generation = 0;
  let opened = false;
  let frame: HTMLIFrameElement | null = null;
  let scripts: PrototypeScript[] | null = null;

  function close() {
    if (!opened) return;
    opened = false;
    generation += 1;
    frame = null;
    scripts = null;
    document.body.classList.remove("prototype-open");
    if (document.fullscreenElement === root) void document.exitFullscreen?.();
    root.replaceChildren();
    root.hidden = true;
    onClose();
  }

  function onMessage(event: MessageEvent) {
    if (!frame || event.source !== frame.contentWindow) return;
    const data = event.data as { source?: string; type?: string } | null;
    if (data?.source !== "proto-lab" || !frame || event.source !== frame.contentWindow) return;
    if (data.type === "close") close();
    if (data.type === "ready" && scripts && frame.contentWindow) {
      const payload = scripts;
      scripts = null;
      frame.contentWindow.postMessage({ source: "proto-lab", type: "boot", scripts: payload }, "*");
    }
  }
  window.addEventListener("message", onMessage);

  function open(entry: CatalogEntry) {
    generation += 1;
    const mine = generation;
    opened = true;
    frame = null;
    document.body.classList.add("prototype-open");
    root.hidden = false;
    root.replaceChildren();

    const header = document.createElement("header");
    header.className = "prototype-chrome";
    header.dataset.testid = "prototype-chrome";

    const back = document.createElement("button");
    back.type = "button";
    back.className = "text-button";
    back.dataset.testid = "close-prototype";
    back.textContent = "Volver";
    back.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      close();
    });

    const title = document.createElement("h1");
    title.textContent = entry.title;

    const full = document.createElement("button");
    full.type = "button";
    full.className = "text-button";
    full.dataset.testid = "fullscreen";
    full.textContent = "Pantalla completa";
    full.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (document.fullscreenElement) void document.exitFullscreen();
      else void root.requestFullscreen?.().catch(() => {});
    });

    header.append(back, title, full);

    const slot = document.createElement("div");
    slot.className = "prototype-frame";
    const status = document.createElement("p");
    status.className = "prototype-status";
    status.dataset.testid = "prototype-status";
    status.textContent = "Abriendo el prototipo…";
    slot.append(status);
    root.append(header, slot);

    void fetchPrototypeDocument(entry.href)
      .then((embedded) => {
        if (mine !== generation) return;
        const next = document.createElement("iframe");
        next.title = entry.title;
        next.setAttribute("sandbox", "allow-scripts");
        next.referrerPolicy = "no-referrer";
        frame = next;
        scripts = embedded.scripts;
        next.srcdoc = embedded.html;
        status.remove();
        slot.append(next);
      })
      .catch(() => {
        if (mine !== generation) return;
        status.dataset.testid = "prototype-error";
        status.textContent = "No he podido abrir el prototipo. La sesión no ha llegado hasta el juego. Pulsa Volver.";
      });
  }

  return {
    open,
    close,
    isOpen: () => opened,
  };
}
