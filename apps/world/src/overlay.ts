import { fetchPrototypeDocument } from "./prototype-document";
import type { CatalogEntry } from "./types";

const FAIL = "No he podido abrir el prototipo. Pulsa Volver para salir del laboratorio.";

export function createOverlay(root: HTMLElement, onClose: () => void) {
  let generation = 0;
  let opened = false;
  let frame: HTMLIFrameElement | null = null;
  let objectUrl: string | null = null;
  let aliveTimer = 0;

  function revoke() {
    if (!objectUrl) return;
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }

  function close() {
    if (!opened) return;
    opened = false;
    generation += 1;
    window.clearTimeout(aliveTimer);
    frame = null;
    revoke();
    document.body.classList.remove("prototype-open");
    document.querySelector(".prototype-chrome")?.remove();
    if (document.fullscreenElement === root) void document.exitFullscreen?.();
    root.replaceChildren();
    root.hidden = true;
    onClose();
  }

  function showFailure(banner: HTMLElement, message: string) {
    window.clearTimeout(aliveTimer);
    frame?.remove();
    frame = null;
    revoke();
    banner.hidden = false;
    banner.dataset.testid = "prototype-error";
    banner.textContent = message;
  }

  function onMessage(event: MessageEvent) {
    if (!frame || event.source !== frame.contentWindow) return;
    const data = event.data as { source?: string; type?: string; message?: string } | null;
    if (data?.source !== "proto-lab") return;
    const banner = document.querySelector<HTMLElement>(".prototype-banner");
    if (!banner) return;
    if (data.type === "close") close();
    if (data.type === "alive") window.clearTimeout(aliveTimer);
    if (data.type === "error") showFailure(banner, `El prototipo se ha detenido: ${data.message ?? "error"}. Pulsa Volver.`);
  }
  window.addEventListener("message", onMessage);

  function open(entry: CatalogEntry) {
    generation += 1;
    const mine = generation;
    opened = true;
    frame = null;
    window.clearTimeout(aliveTimer);
    revoke();
    document.body.classList.add("prototype-open");
    document.querySelector(".prototype-chrome")?.remove();
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

    const banner = document.createElement("p");
    banner.className = "prototype-banner";
    banner.hidden = true;

    header.append(back, title, full, banner);
    document.body.append(header);

    const slot = document.createElement("div");
    slot.className = "prototype-frame";
    const status = document.createElement("p");
    status.className = "prototype-status";
    status.dataset.testid = "prototype-status";
    status.textContent = "Abriendo el prototipo…";
    slot.append(status);
    root.append(slot);

    void fetchPrototypeDocument(entry.href)
      .then((html) => {
        if (mine !== generation) return;
        const next = document.createElement("iframe");
        next.title = entry.title;
        next.setAttribute("sandbox", "allow-scripts");
        next.referrerPolicy = "no-referrer";
        objectUrl = URL.createObjectURL(new Blob([html], { type: "text/html" }));
        frame = next;
        next.src = objectUrl;
        status.remove();
        slot.append(next);
        aliveTimer = window.setTimeout(() => {
          if (mine !== generation) return;
          showFailure(banner, FAIL);
        }, 8000);
      })
      .catch(() => {
        if (mine !== generation) return;
        showFailure(banner, FAIL);
      });
  }

  return {
    open,
    close,
    isOpen: () => opened,
  };
}
