import { fetchPrototypeDocument } from "./prototype-document";
import { createPrototypeAssetHost } from "./prototype-assets-host";
import type { CatalogEntry } from "./types";

const FAIL = "No he podido abrir el prototipo. Pulsa Volver para salir del laboratorio.";

type FullscreenHost = HTMLElement & { webkitRequestFullscreen?: () => void };
type FullscreenDoc = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => void;
};

function nativeFullscreenElement(): Element | null {
  const doc = document as FullscreenDoc;
  return document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

export function createOverlay(root: HTMLElement, onClose: () => void) {
  let generation = 0;
  let opened = false;
  let frame: HTMLIFrameElement | null = null;
  let objectUrl: string | null = null;
  let aliveTimer = 0;
  let assetHost: ReturnType<typeof createPrototypeAssetHost> | null = null;

  function revoke() {
    if (!objectUrl) return;
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }

  function setPseudo(on: boolean) {
    root.classList.toggle("is-pseudo-fullscreen", on);
    document.documentElement.classList.toggle("is-pseudo-fullscreen", on);
    document.body.classList.toggle("is-pseudo-fullscreen", on);
    if (on) root.dataset.fs = "pseudo";
    else if (root.dataset.fs === "pseudo") delete root.dataset.fs;
  }

  function syncLabel() {
    const button = root.querySelector<HTMLButtonElement>('[data-testid="fullscreen"]');
    if (!button) return;
    const on = nativeFullscreenElement() === root || root.classList.contains("is-pseudo-fullscreen");
    button.textContent = on ? "Salir" : "Pantalla completa";
    button.setAttribute("aria-pressed", on ? "true" : "false");
  }

  function exitFullscreenModes() {
    setPseudo(false);
    if (root.dataset.fs === "native") delete root.dataset.fs;
    if (nativeFullscreenElement() === root) {
      const doc = document as FullscreenDoc;
      const exit = document.exitFullscreen?.bind(document) ?? doc.webkitExitFullscreen?.bind(document);
      if (exit) void Promise.resolve(exit()).catch(() => {});
    }
    syncLabel();
  }

  async function enterFullscreen() {
    const host = root as FullscreenHost;
    const request = root.requestFullscreen?.bind(root) ?? host.webkitRequestFullscreen?.bind(root);
    if (!request) {
      setPseudo(true);
      syncLabel();
      return;
    }
    try {
      await Promise.resolve(request());
    } catch {
      setPseudo(true);
      syncLabel();
      return;
    }
    if (nativeFullscreenElement() === root) {
      setPseudo(false);
      root.dataset.fs = "native";
      syncLabel();
      return;
    }
    setPseudo(true);
    syncLabel();
  }

  function onFullscreenChange() {
    if (nativeFullscreenElement() !== root && root.dataset.fs === "native") delete root.dataset.fs;
    syncLabel();
  }
  document.addEventListener("fullscreenchange", onFullscreenChange);
  document.addEventListener("webkitfullscreenchange", onFullscreenChange);

  function close() {
    if (!opened) return;
    opened = false;
    generation += 1;
    window.clearTimeout(aliveTimer);
    frame = null;
    assetHost = null;
    revoke();
    exitFullscreenModes();
    document.body.classList.remove("prototype-open");
    root.querySelector(".prototype-chrome")?.remove();
    root.replaceChildren();
    root.hidden = true;
    onClose();
  }

  function showFailure(banner: HTMLElement, message: string) {
    window.clearTimeout(aliveTimer);
    frame?.remove();
    frame = null;
    assetHost = null;
    revoke();
    banner.hidden = false;
    banner.dataset.testid = "prototype-error";
    banner.textContent = message;
  }

  function onMessage(event: MessageEvent) {
    if (!frame || event.source !== frame.contentWindow) return;
    const data = event.data as { source?: string; type?: string; message?: string } | null;
    if (data?.source !== "proto-lab") return;
    if (data.type === "asset-request") {
      void assetHost?.onMessage(event, frame);
      return;
    }
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
    exitFullscreenModes();
    document.body.classList.add("prototype-open");
    root.querySelector(".prototype-chrome")?.remove();
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
    full.setAttribute("aria-pressed", "false");
    full.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (nativeFullscreenElement() === root || root.classList.contains("is-pseudo-fullscreen")) exitFullscreenModes();
      else void enterFullscreen();
    });

    const banner = document.createElement("p");
    banner.className = "prototype-banner";
    banner.hidden = true;

    header.append(back, title, full, banner);
    const slot = document.createElement("div");
    slot.className = "prototype-frame";
    const status = document.createElement("p");
    status.className = "prototype-status";
    status.dataset.testid = "prototype-status";
    status.textContent = "Abriendo el prototipo…";
    slot.append(status);
    root.append(header, slot);

    assetHost = createPrototypeAssetHost({ slug: entry.slug, allowedPaths: entry.assets });

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
