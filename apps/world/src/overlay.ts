import { advanceBoot, bootFailureMessage, iframeAllow, type BootPhase } from "./prototype-boot";
import { assertPrototypePage } from "./prototype-document";
import { createSaveBridge } from "./app-save";
import { createPrototypeAssetHost } from "./prototype-assets-host";
import type { CatalogEntry } from "./types";

type FullscreenHost = HTMLElement & { webkitRequestFullscreen?: () => void };
type FullscreenDoc = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => void;
};

type AppWindow = Window & { __protoLabApp?: { stop?: () => void } };

function nativeFullscreenElement(): Element | null {
  const doc = document as FullscreenDoc;
  return document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

export function createOverlay(
  root: HTMLElement,
  onClose: () => void,
  hooks?: {
    onOpenEntry?: (entry: CatalogEntry) => void;
    onClosed?: () => void;
    onSuggestImprovement?: (entry: CatalogEntry) => void;
  },
) {
  let generation = 0;
  let opened = false;
  let frame: HTMLIFrameElement | null = null;
  let readyTimer = 0;
  let boot: BootPhase = "opening";
  let assetHost: ReturnType<typeof createPrototypeAssetHost> | null = null;
  let saveBridge: ReturnType<typeof createSaveBridge> | null = null;

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

  function callStop(current: HTMLIFrameElement) {
    try {
      const app = current.contentWindow as AppWindow | null;
      app?.__protoLabApp?.stop?.();
    } catch {
      // El documento ya no es del mismo origen.
    }
  }

  function blankFrame(current: HTMLIFrameElement): Promise<void> {
    callStop(current);
    return new Promise((resolve) => {
      const timer = window.setTimeout(resolve, 500);
      const done = () => {
        window.clearTimeout(timer);
        resolve();
      };
      current.addEventListener("load", done, { once: true });
      try {
        current.src = "about:blank";
      } catch {
        done();
      }
    });
  }

  async function discardFrame() {
    const current = frame;
    frame = null;
    assetHost = null;
    saveBridge = null;
    if (!current) return;
    current.style.visibility = "hidden";
    await blankFrame(current);
    current.remove();
  }

  function clearBootMarks() {
    delete root.dataset.prototypeReady;
    delete root.dataset.prototypeAlive;
    boot = "opening";
  }

  async function close() {
    if (!opened) return;
    opened = false;
    const mine = ++generation;
    window.clearTimeout(readyTimer);
    exitFullscreenModes();
    await discardFrame();
    if (mine !== generation) return;
    clearBootMarks();
    document.body.classList.remove("prototype-open");
    root.querySelector(".prototype-chrome")?.remove();
    root.replaceChildren();
    root.hidden = true;
    hooks?.onClosed?.();
    onClose();
  }

  async function showFailure(banner: HTMLElement, message: string) {
    const mine = ++generation;
    window.clearTimeout(readyTimer);
    await discardFrame();
    if (mine !== generation || !banner.isConnected) return;
    banner.hidden = false;
    banner.dataset.testid = "prototype-error";
    banner.textContent = message;
  }

  function markReady(status: HTMLElement | null) {
    window.clearTimeout(readyTimer);
    boot = "ready";
    root.dataset.prototypeReady = "1";
    status?.remove();
  }

  function attachFrameGuards(next: HTMLIFrameElement) {
    try {
      next.contentWindow?.addEventListener(
        "keydown",
        (event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          void close();
        },
        true,
      );
    } catch {
      // Si el documento no es del mismo origen, el plazo de ready lo retira.
    }
  }

  function onMessage(event: MessageEvent) {
    if (!frame || event.source !== frame.contentWindow) return;
    const data = event.data as { source?: string; type?: string; message?: string } | null;
    if (data?.source !== "proto-lab") return;
    if (data.type === "asset-request") {
      void assetHost?.onMessage(event, frame);
      return;
    }
    if (data.type === "save") {
      saveBridge?.onMessage(event, frame);
      return;
    }
    if (data.type === "close") {
      void close();
      return;
    }
    if (data.type === "alive") {
      boot = advanceBoot(boot, "alive");
      if (boot === "alive") root.dataset.prototypeAlive = "1";
      return;
    }
    if (data.type === "ready") {
      const status = root.querySelector<HTMLElement>(".prototype-status");
      markReady(status);
      return;
    }
    if (data.type === "error") {
      const banner = root.querySelector<HTMLElement>(".prototype-banner");
      if (!banner) return;
      void showFailure(banner, `La aplicación se ha detenido: ${data.message ?? "error"}. Pulsa Volver para volver al laboratorio.`);
    }
  }
  window.addEventListener("message", onMessage);

  function open(entry: CatalogEntry) {
    generation += 1;
    const mine = generation;
    opened = true;
    frame = null;
    assetHost = null;
    saveBridge = null;
    window.clearTimeout(readyTimer);
    clearBootMarks();
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
      void close();
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

    const suggest = document.createElement("button");
    suggest.type = "button";
    suggest.className = "text-button";
    suggest.dataset.testid = "suggest-improvement";
    suggest.textContent = "Sugerir mejora";
    suggest.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      hooks?.onSuggestImprovement?.(entry);
    });

    const banner = document.createElement("p");
    banner.className = "prototype-banner";
    banner.hidden = true;

    header.append(back, title, suggest, full, banner);
    const slot = document.createElement("div");
    slot.className = "prototype-frame";
    const status = document.createElement("p");
    status.className = "prototype-status";
    status.dataset.testid = "prototype-status";
    status.textContent = "Abriendo la aplicación…";
    slot.append(status);
    root.append(header, slot);

    hooks?.onOpenEntry?.(entry);

    const deadline = entry.readyMs > 0 ? entry.readyMs : 8000;
    void assertPrototypePage(entry.href, { pageOrigin: location.origin })
      .then(() => {
        if (mine !== generation) return;
        const next = document.createElement("iframe");
        next.title = entry.title;
        const declared = entry.capabilities ?? entry.permissions ?? [];
        const allow = iframeAllow(declared);
        if (allow) next.allow = allow;
        next.addEventListener("load", () => {
          if (mine !== generation || frame !== next) return;
          let href = "";
          try {
            href = next.contentWindow?.location.href ?? "";
          } catch {
            href = "";
          }
          if (href === "about:blank") return;
          attachFrameGuards(next);
        });
        assetHost = createPrototypeAssetHost({ slug: entry.slug, allowedPaths: entry.assets });
        saveBridge = createSaveBridge(entry.slug, localStorage, { enabled: declared.includes("save") });
        frame = next;
        slot.append(next);
        next.src = entry.href;
        readyTimer = window.setTimeout(() => {
          if (mine !== generation || boot === "ready") return;
          void showFailure(banner, bootFailureMessage(boot));
        }, deadline);
      })
      .catch(() => {
        if (mine !== generation) return;
        void showFailure(banner, bootFailureMessage("opening"));
      });
  }

  return {
    open,
    close,
    isOpen: () => opened,
  };
}
