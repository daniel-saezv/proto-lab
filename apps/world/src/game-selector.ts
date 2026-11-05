import { createDialogCloseButton } from "./dialog-dismiss";
import type { CatalogEntry } from "./types";
import { selectorKeyAction, stepIndex, wrapIndex } from "./game-selector-logic";
import { titleCardDataUrl } from "./title-card";

export function createGameSelector(options: {
  root: HTMLElement;
  prototypes: CatalogEntry[];
  onPlay: (entry: CatalogEntry) => void;
  onHighlight: (index: number) => void;
  onOpen: () => void;
  onClose: () => void;
  isPrototypeUnseen?: (slug: string) => boolean;
}) {
  let open = false;
  let index = 0;
  let touchStartX = 0;
  let touchActive = false;

  function current(): CatalogEntry | undefined {
    return options.prototypes[wrapIndex(index, options.prototypes.length)];
  }

  function setIndex(next: number) {
    if (options.prototypes.length === 0) return;
    index = wrapIndex(next, options.prototypes.length);
    options.onHighlight(index);
    renderCard();
  }

  function previewSrc(entry: CatalogEntry): string {
    return entry.previewHref ?? titleCardDataUrl(entry, 640, 400);
  }

  function renderCard() {
    const entry = current();
    if (!entry) return;
    const title = options.root.querySelector<HTMLElement>("[data-testid='selector-title']");
    const author = options.root.querySelector<HTMLElement>("[data-testid='selector-author']");
    const version = options.root.querySelector<HTMLElement>("[data-testid='selector-version']");
    const description = options.root.querySelector<HTMLElement>("[data-testid='selector-description']");
    const image = options.root.querySelector<HTMLImageElement>("[data-testid='selector-preview']");
    const counter = options.root.querySelector<HTMLElement>("[data-testid='selector-counter']");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (title) title.textContent = entry.title;
    if (author) author.textContent = entry.author;
    if (version) version.textContent = `v${entry.version}`;
    if (description) description.textContent = entry.description;
    if (counter) counter.textContent = `${wrapIndex(index, options.prototypes.length) + 1} / ${options.prototypes.length}`;
    if (image) {
      image.src = previewSrc(entry);
      image.alt = `Vista previa de ${entry.title}`;
      if (!reduceMotion && image.dataset.shown === "1") {
        image.animate([{ opacity: 0.45 }, { opacity: 1 }], { duration: 160, easing: "ease-out" });
      }
      image.dataset.shown = "1";
    }
    const badge = options.root.querySelector<HTMLElement>("[data-testid='selector-update-badge']");
    if (badge) {
      const show = options.isPrototypeUnseen?.(entry.slug) ?? false;
      badge.hidden = !show;
    }
  }

  function buildUi() {
    options.root.replaceChildren();
    options.root.dataset.testid = "game-selector";
    options.root.setAttribute("role", "dialog");
    options.root.setAttribute("aria-modal", "true");
    options.root.setAttribute("aria-labelledby", "selector-heading");

    const panel = document.createElement("div");
    panel.className = "selector-panel";

    const marquee = document.createElement("p");
    marquee.className = "selector-marquee";
    marquee.setAttribute("aria-hidden", "true");
    marquee.textContent = "Proto Arcade";

    const heading = document.createElement("h2");
    heading.id = "selector-heading";
    heading.textContent = "Elige un prototipo";

    const bezel = document.createElement("div");
    bezel.className = "selector-bezel";
    const previewWrap = document.createElement("div");
    previewWrap.className = "selector-preview-wrap";
    const image = document.createElement("img");
    image.className = "selector-preview";
    image.dataset.testid = "selector-preview";
    image.decoding = "async";
    previewWrap.append(image);
    bezel.append(previewWrap);

    const nav = document.createElement("div");
    nav.className = "selector-nav";
    const prev = document.createElement("button");
    prev.type = "button";
    prev.className = "selector-nav-button";
    prev.dataset.testid = "selector-prev";
    prev.setAttribute("aria-label", "Anterior");
    prev.textContent = "‹";
    prev.addEventListener("click", () => setIndex(index - 1));
    const counter = document.createElement("span");
    counter.className = "selector-counter";
    counter.dataset.testid = "selector-counter";
    const next = document.createElement("button");
    next.type = "button";
    next.className = "selector-nav-button";
    next.dataset.testid = "selector-next";
    next.setAttribute("aria-label", "Siguiente");
    next.textContent = "›";
    next.addEventListener("click", () => setIndex(index + 1));
    nav.append(prev, counter, next);

    const meta = document.createElement("div");
    meta.className = "selector-meta";
    const badge = document.createElement("p");
    badge.className = "selector-update-badge";
    badge.dataset.testid = "selector-update-badge";
    badge.hidden = true;
    badge.textContent = "Nuevo / actualizado";
    const title = document.createElement("h3");
    title.dataset.testid = "selector-title";
    const author = document.createElement("p");
    author.className = "selector-author";
    author.dataset.testid = "selector-author";
    const version = document.createElement("p");
    version.className = "selector-version";
    version.dataset.testid = "selector-version";
    const description = document.createElement("p");
    description.className = "selector-description";
    description.dataset.testid = "selector-description";
    meta.append(badge, title, author, version, description);

    const actions = document.createElement("div");
    actions.className = "selector-actions";
    const back = document.createElement("button");
    back.type = "button";
    back.className = "text-button";
    back.dataset.testid = "selector-close";
    back.textContent = "Volver";
    back.addEventListener("click", () => close());
    const play = document.createElement("button");
    play.type = "button";
    play.className = "solid-button";
    play.dataset.testid = "selector-play";
    play.textContent = "Jugar";
    play.addEventListener("click", () => {
      const entry = current();
      if (entry) options.onPlay(entry);
    });
    actions.append(back, play);

    panel.append(createDialogCloseButton(() => close()), marquee, heading, bezel, nav, meta, actions);
    options.root.append(panel);

    previewWrap.addEventListener(
      "touchstart",
      (event) => {
        if (event.touches.length !== 1) return;
        touchActive = true;
        touchStartX = event.touches[0]?.clientX ?? 0;
      },
      { passive: true },
    );
    previewWrap.addEventListener(
      "touchend",
      (event) => {
        if (!touchActive) return;
        touchActive = false;
        const endX = event.changedTouches[0]?.clientX ?? touchStartX;
        const delta = endX - touchStartX;
        if (Math.abs(delta) < 40) return;
        if (delta < 0) setIndex(index + 1);
        else setIndex(index - 1);
      },
      { passive: true },
    );
  }

  function handleKey(event: KeyboardEvent) {
    if (!open) return false;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return false;
    const action = selectorKeyAction(event.key, true);
    if (action === "none") return false;
    event.preventDefault();
    if (action === "prev") setIndex(index - 1);
    if (action === "next") setIndex(index + 1);
    if (action === "close") close();
    if (action === "play") {
      const entry = current();
      if (entry) options.onPlay(entry);
    }
    return true;
  }

  function openAt(startIndex = 0) {
    if (options.prototypes.length === 0) return;
    open = true;
    index = wrapIndex(startIndex, options.prototypes.length);
    buildUi();
    options.root.hidden = false;
    document.body.classList.add("selector-open");
    options.onOpen();
    options.onHighlight(index);
    renderCard();
    const play = options.root.querySelector<HTMLButtonElement>("[data-testid='selector-play']");
    play?.focus();
  }

  function close() {
    if (!open) return;
    open = false;
    options.root.hidden = true;
    options.root.replaceChildren();
    document.body.classList.remove("selector-open");
    options.onClose();
  }

  return {
    open: openAt,
    close,
    isOpen: () => open,
    handleKey,
    setIndex,
    step(delta: number) {
      setIndex(stepIndex(index, delta, options.prototypes.length));
    },
  };
}
