import { bootTimeoutReason, bootWaitMs, createBootClock, noteBootProgress, type BootClock } from "./boot-deadline";
import { createBootScreen, paintBootProgress } from "./boot-screen";
import { advanceBoot, bootFailureMessage, iframeAllow, type BootPhase } from "./prototype-boot";
import { assertPrototypePage } from "./prototype-document";
import { createSaveBridge } from "./app-save";
import { createPrototypeAssetHost } from "./prototype-assets-host";
import { NATIVE_FULLSCREEN_TIMEOUT_MS, occupiesScreen, planFullscreen, type FullscreenFacts, type FullscreenPlan } from "./fullscreen";
import { HUD_CUE_LABEL, HUD_CUE_MS, nextHudCue, type HudCueEvent, type HudCuePhase } from "./hud-cue";
import type { CatalogEntry } from "./types";

type FullscreenHost = HTMLElement & { webkitRequestFullscreen?: () => void };
type FullscreenDoc = Document & {
  webkitFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
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
  let bootClock: BootClock = createBootClock(0);
  let bootReadyMs = 8000;
  let boot: BootPhase = "opening";
  let assetHost: ReturnType<typeof createPrototypeAssetHost> | null = null;
  let saveBridge: ReturnType<typeof createSaveBridge> | null = null;
  let hudTimer = 0;
  let hudExpanded = false;
  let cuePhase: HudCuePhase = "pending";
  let cueTimer = 0;
  let cueToken = 0;
  const HUD_IDLE_MS = 4000;

  function setPseudo(on: boolean) {
    root.classList.toggle("is-pseudo-fullscreen", on);
    document.documentElement.classList.toggle("is-pseudo-fullscreen", on);
    document.body.classList.toggle("is-pseudo-fullscreen", on);
    if (on) root.dataset.fs = "pseudo";
    else if (root.dataset.fs === "pseudo") delete root.dataset.fs;
  }

  function readFacts(): FullscreenFacts {
    const host = root as FullscreenHost;
    const doc = document as FullscreenDoc;
    const nav = navigator as Navigator & { standalone?: boolean };
    return {
      standardRequest: typeof root.requestFullscreen === "function",
      webkitRequest: typeof host.webkitRequestFullscreen === "function",
      enabled: typeof document.fullscreenEnabled === "boolean" ? document.fullscreenEnabled : undefined,
      webkitEnabled: typeof doc.webkitFullscreenEnabled === "boolean" ? doc.webkitFullscreenEnabled : undefined,
      occupiesScreen: occupiesScreen({
        displayModeStandalone: window.matchMedia("(display-mode: standalone)").matches,
        displayModeFullscreen: window.matchMedia("(display-mode: fullscreen)").matches,
        fullscreenElement: nativeFullscreenElement() != null,
        navigatorStandalone: nav.standalone,
      }),
    };
  }

  function applyPlan(button: HTMLButtonElement, plan: FullscreenPlan) {
    button.dataset.plan = plan;
    button.hidden = plan === "hidden";
  }

  function syncLabel() {
    const button = root.querySelector<HTMLButtonElement>('[data-testid="fullscreen"]');
    if (!button) return;
    const on = nativeFullscreenElement() === root || root.classList.contains("is-pseudo-fullscreen");
    const label = on ? "Salir" : "Pantalla completa";
    const caption = button.querySelector(".hud-caption");
    if (caption) caption.textContent = label;
    else button.textContent = label;
    button.setAttribute("aria-label", on ? "Salir de la pantalla completa" : "Pantalla completa");
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

  function markNative() {
    setPseudo(false);
    root.dataset.fs = "native";
    syncLabel();
  }

  function useCssFullscreen() {
    if (root.dataset.fs === "native") delete root.dataset.fs;
    setPseudo(true);
    syncLabel();
  }

  // La llamada es síncrona, dentro del gesto. Si la promesa no se asienta
  // (PWA o un permiso que ni concede ni deniega), el plazo pasa al modo CSS
  // para que el botón no se quede mudo. El prefijo solo se usa si falta el
  // método estándar; en iOS no cuenta como éxito sobre un div.
  function nativeRequest(): Promise<void> {
    try {
      if (typeof root.requestFullscreen === "function") {
        return Promise.resolve(root.requestFullscreen());
      }
      const webkit = (root as FullscreenHost).webkitRequestFullscreen?.bind(root);
      if (!webkit) return Promise.reject(new Error("sin API"));
      webkit();
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error);
    }
  }

  async function enterFullscreen() {
    const pending = nativeRequest().then(
      () => "ok" as const,
      () => "fail" as const,
    );
    let timer = 0;
    const timed = new Promise<"timeout">((resolve) => {
      timer = window.setTimeout(() => resolve("timeout"), NATIVE_FULLSCREEN_TIMEOUT_MS);
    });
    const outcome = await Promise.race([pending, timed]);
    window.clearTimeout(timer);
    if (nativeFullscreenElement() === root) {
      markNative();
      return;
    }
    if (outcome === "ok") {
      useCssFullscreen();
      return;
    }
    useCssFullscreen();
  }

  function onFullscreenChange() {
    if (nativeFullscreenElement() === root) {
      setPseudo(false);
      root.dataset.fs = "native";
    } else if (root.dataset.fs === "native") {
      delete root.dataset.fs;
    }
    syncLabel();
  }

  function onFullscreenError() {
    if (nativeFullscreenElement() === root) return;
    const button = root.querySelector<HTMLButtonElement>('[data-testid="fullscreen"]');
    if (!button || button.hidden || button.dataset.plan === "hidden") return;
    useCssFullscreen();
  }

  document.addEventListener("fullscreenchange", onFullscreenChange);
  document.addEventListener("webkitfullscreenchange", onFullscreenChange);
  document.addEventListener("fullscreenerror", onFullscreenError);
  document.addEventListener("webkitfullscreenerror", onFullscreenError);
  document.addEventListener("keydown", onHudKey);

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

  function clearHudTimer() {
    window.clearTimeout(hudTimer);
    hudTimer = 0;
  }

  function invalidateCueTimer() {
    cueToken += 1;
    window.clearTimeout(cueTimer);
    cueTimer = 0;
  }

  function renderCue() {
    const header = root.querySelector<HTMLElement>(".prototype-chrome");
    const cue = root.querySelector<HTMLElement>("[data-testid=hud-cue]");
    const showing = cuePhase === "showing";
    if (header) header.dataset.cue = showing ? "on" : "off";
    if (cue) cue.hidden = !showing;
  }

  function armCueTimer() {
    invalidateCueTimer();
    const token = cueToken;
    cueTimer = window.setTimeout(() => {
      if (token !== cueToken) return;
      applyCue("tick");
    }, HUD_CUE_MS);
  }

  function applyCue(event: HudCueEvent) {
    const next = nextHudCue(cuePhase, event);
    const start = next === "showing" && cuePhase !== "showing";
    cuePhase = next;
    if (start) armCueTimer();
    else if (next !== "showing") invalidateCueTimer();
    renderCue();
  }

  function errorPinned(): boolean {
    const banner = root.querySelector<HTMLElement>(".prototype-banner");
    return Boolean(banner && !banner.hidden);
  }

  function setHud(expanded: boolean, focus?: "keyboard") {
    if (!opened) return;
    const panel = root.querySelector<HTMLElement>("[data-testid=prototype-hud]");
    const handle = root.querySelector<HTMLButtonElement>("[data-testid=hud-handle]");
    const catcher = root.querySelector<HTMLElement>("[data-testid=hud-catcher]");
    const header = root.querySelector<HTMLElement>(".prototype-chrome");
    const returning = !expanded && Boolean(panel?.contains(document.activeElement));
    hudExpanded = expanded;
    clearHudTimer();
    if (header) header.dataset.expanded = expanded ? "true" : "false";
    if (handle) {
      handle.setAttribute("aria-expanded", expanded ? "true" : "false");
      handle.setAttribute("aria-label", expanded ? "Ocultar controles" : "Mostrar controles");
    }
    if (panel) panel.hidden = !expanded;
    if (catcher) catcher.hidden = !expanded || errorPinned();
    if (expanded) applyCue("expand");
    if (expanded && !errorPinned()) {
      hudTimer = window.setTimeout(() => setHud(false), HUD_IDLE_MS);
    }
    if (focus === "keyboard") {
      const target = expanded ? root.querySelector<HTMLElement>("[data-testid=close-prototype]") : handle;
      target?.focus();
      return;
    }
    if (returning) handle?.focus();
  }

  function bumpHudIdle() {
    if (!hudExpanded || errorPinned()) return;
    clearHudTimer();
    hudTimer = window.setTimeout(() => setHud(false), HUD_IDLE_MS);
  }

  function onHudKey(event: KeyboardEvent) {
    if (!opened || event.key !== "Escape" || event.repeat) return;
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
    if (target instanceof HTMLElement && target.isContentEditable) return;
    event.preventDefault();
    event.stopPropagation();
    setHud(!hudExpanded, "keyboard");
  }

  async function close() {
    if (!opened) return;
    opened = false;
    clearHudTimer();
    invalidateCueTimer();
    cuePhase = "pending";
    hudExpanded = false;
    const mine = ++generation;
    window.clearTimeout(readyTimer);
    readyTimer = 0;
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
    readyTimer = 0;
    await discardFrame();
    if (mine !== generation || !banner.isConnected) return;
    root.querySelector(".prototype-status")?.remove();
    banner.hidden = false;
    banner.dataset.testid = "prototype-error";
    banner.textContent = message;
    setHud(true);
  }

  function markReady(status: HTMLElement | null) {
    window.clearTimeout(readyTimer);
    readyTimer = 0;
    boot = "ready";
    root.dataset.prototypeReady = "1";
    status?.remove();
    // El aviso espera a que el prototipo se vea: durante la carga no se gasta.
    applyCue("ready");
  }

  function attachFrameGuards(next: HTMLIFrameElement) {
    try {
      next.contentWindow?.addEventListener(
        "keydown",
        (event) => {
          if (event.key !== "Escape" || event.repeat) return;
          event.preventDefault();
          event.stopPropagation();
          setHud(!hudExpanded, "keyboard");
        },
        true,
      );
    } catch {
      // Si el documento no es del mismo origen, el plazo de ready lo retira.
    }
  }

  function onMessage(event: MessageEvent) {
    if (!frame || event.source !== frame.contentWindow) return;
    const data = event.data as { source?: string; type?: string; message?: string; loaded?: unknown; total?: unknown } | null;
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
    if (data.type === "progress") {
      if (boot === "ready") return;
      const status = root.querySelector<HTMLElement>(".prototype-status");
      if (!status) return;
      const nextClock = noteBootProgress(bootClock, data.loaded, data.total, performance.now());
      if (nextClock !== bootClock) {
        bootClock = nextClock;
        const banner = root.querySelector<HTMLElement>(".prototype-banner");
        if (banner) armBootTimer(generation, banner);
      }
      paintBootProgress(status, data.loaded, data.total);
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

  function armBootTimer(mine: number, banner: HTMLElement) {
    window.clearTimeout(readyTimer);
    readyTimer = 0;
    const wait = bootWaitMs(bootClock, performance.now(), bootReadyMs);
    const fire = () => {
      readyTimer = 0;
      if (mine !== generation || boot === "ready") return;
      if (bootTimeoutReason(bootClock, performance.now(), bootReadyMs)) {
        void showFailure(banner, bootFailureMessage(boot));
        return;
      }
      armBootTimer(mine, banner);
    };
    if (wait <= 0) {
      fire();
      return;
    }
    readyTimer = window.setTimeout(fire, wait);
  }

  function open(entry: CatalogEntry) {
    generation += 1;
    const mine = generation;
    opened = true;
    clearHudTimer();
    invalidateCueTimer();
    cuePhase = "pending";
    hudExpanded = false;
    frame = null;
    assetHost = null;
    saveBridge = null;
    window.clearTimeout(readyTimer);
    readyTimer = 0;
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
    back.className = "hud-button";
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
    full.className = "hud-button hud-button--icon";
    full.dataset.testid = "fullscreen";
    full.setAttribute("aria-pressed", "false");
    full.setAttribute("aria-label", "Pantalla completa");
    const enterIcon = fullscreenGlyph("enter");
    const exitIcon = fullscreenGlyph("exit");
    const caption = document.createElement("span");
    caption.className = "hud-caption";
    caption.textContent = "Pantalla completa";
    full.append(enterIcon, exitIcon, caption);
    full.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const plan = planFullscreen(readFacts());
      applyPlan(full, plan);
      if (plan !== "hidden") {
        if (nativeFullscreenElement() === root || root.classList.contains("is-pseudo-fullscreen")) exitFullscreenModes();
        else if (plan === "css") useCssFullscreen();
        else void enterFullscreen();
      }
      setHud(false);
    });

    const suggest = document.createElement("button");
    suggest.type = "button";
    suggest.className = "hud-button hud-button--quiet";
    suggest.dataset.testid = "suggest-improvement";
    suggest.textContent = "Sugerir";
    suggest.setAttribute("aria-label", "Sugerir mejora");
    suggest.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setHud(false);
      hooks?.onSuggestImprovement?.(entry);
    });

    const banner = document.createElement("p");
    banner.className = "prototype-banner";
    banner.hidden = true;

    applyPlan(full, planFullscreen(readFacts()));

    const panel = document.createElement("div");
    panel.id = "prototype-hud";
    panel.className = "prototype-hud";
    panel.dataset.testid = "prototype-hud";
    panel.hidden = true;
    panel.setAttribute("role", "group");
    panel.setAttribute("aria-label", "Controles");
    panel.append(back, title, suggest, full);
    panel.addEventListener("pointerdown", () => bumpHudIdle());

    const catcher = document.createElement("div");
    catcher.className = "hud-catcher";
    catcher.dataset.testid = "hud-catcher";
    catcher.hidden = true;
    catcher.setAttribute("aria-hidden", "true");
    catcher.addEventListener("pointerdown", (event) => {
      if (errorPinned()) return;
      event.preventDefault();
      event.stopPropagation();
      setHud(false);
    });

    const handle = document.createElement("button");
    handle.type = "button";
    handle.className = "hud-handle";
    handle.dataset.testid = "hud-handle";
    handle.setAttribute("aria-expanded", "false");
    handle.setAttribute("aria-controls", "prototype-hud");
    handle.setAttribute("aria-label", "Mostrar controles");
    handle.append(hudGrip());
    handle.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setHud(!hudExpanded);
    });

    header.dataset.expanded = "false";
    header.dataset.cue = "off";
    header.append(catcher, panel, hudCue(), handle);
    const slot = document.createElement("div");
    slot.className = "prototype-frame";
    slot.append(createBootScreen());
    root.append(header, banner, slot);

    hooks?.onOpenEntry?.(entry);

    bootReadyMs = entry.readyMs > 0 ? entry.readyMs : 8000;
    void assertPrototypePage(entry.href, { pageOrigin: location.origin })
      .then(() => {
        if (mine !== generation) return;
        const next = document.createElement("iframe");
        next.title = entry.title;
        const declared = entry.capabilities ?? entry.permissions ?? [];
        // La pantalla completa la pide este documento sobre `#stage`.
        // Un iframe del mismo origen no bloquea esa petición: la política
        // por defecto de `fullscreen` es `self`, y `allow` sigue siendo
        // solo la lista de dispositivos.
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
        bootClock = createBootClock(performance.now());
        armBootTimer(mine, banner);
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

function hudCue(): HTMLParagraphElement {
  const cue = document.createElement("p");
  cue.className = "hud-cue";
  cue.dataset.testid = "hud-cue";
  cue.hidden = true;
  cue.setAttribute("aria-hidden", "true");
  cue.textContent = HUD_CUE_LABEL;
  return cue;
}

function hudGrip(): HTMLSpanElement {
  const grip = document.createElement("span");
  grip.className = "hud-handle-grip";
  grip.setAttribute("aria-hidden", "true");
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.75");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("d", "M5 8h14M5 12h14M5 16h14");
  icon.append(path);
  grip.append(icon);
  return grip;
}

function fullscreenGlyph(kind: "enter" | "exit"): SVGSVGElement {
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  icon.classList.add("fs-glyph", kind === "enter" ? "fs-glyph--enter" : "fs-glyph--exit");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.75");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  path.setAttribute(
    "d",
    kind === "enter" ? "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" : "M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5",
  );
  icon.append(path);
  return icon;
}
