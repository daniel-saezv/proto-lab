/** Solape del teclado virtual respecto al layout viewport. */
export function keyboardOverlap(innerHeight: number, viewportHeight: number, offsetTop: number): number {
  if (!Number.isFinite(innerHeight) || !Number.isFinite(viewportHeight) || !Number.isFinite(offsetTop)) return 0;
  return Math.max(0, Math.round(innerHeight - viewportHeight - offsetTop));
}

/** Queda texto por debajo del borde visible. */
export function longTextHasMore(scrollHeight: number, clientHeight: number, scrollTop: number): boolean {
  if (scrollHeight <= clientHeight + 2) return false;
  return scrollTop + clientHeight < scrollHeight - 4;
}

export const SCROLL_CUE = "Desliza para ver más";

export type LongTextHandle = {
  root: HTMLElement;
  body: HTMLTextAreaElement | HTMLDivElement;
  refresh: () => void;
  destroy: () => void;
};

export function createLongText(options: {
  mode: "edit" | "read";
  value: string;
  label: string;
  testId: string;
  maxLength?: number;
  placeholder?: string;
}): LongTextHandle {
  const root = document.createElement("div");
  root.className = "long-text";

  const cue = document.createElement("p");
  cue.className = "scroll-cue";
  cue.dataset.testid = "scroll-cue";
  cue.textContent = SCROLL_CUE;
  cue.hidden = true;

  let body: HTMLTextAreaElement | HTMLDivElement;
  if (options.mode === "edit") {
    const label = document.createElement("label");
    label.className = "field-label";
    const caption = document.createElement("span");
    caption.textContent = options.label;
    const field = document.createElement("textarea");
    field.className = "dialogue-input long-text-body";
    field.dataset.testid = options.testId;
    field.maxLength = options.maxLength ?? 2000;
    field.autocomplete = "off";
    field.spellcheck = true;
    field.placeholder = options.placeholder ?? "";
    field.setAttribute("aria-label", options.label);
    field.rows = 6;
    field.value = options.value;
    label.append(caption, field);
    root.append(label, cue);
    body = field;
  } else {
    const label = document.createElement("p");
    label.className = "field-label";
    label.id = `${options.testId}-label`;
    label.textContent = options.label;
    const field = document.createElement("div");
    field.className = "long-read";
    field.dataset.testid = options.testId;
    field.tabIndex = 0;
    field.setAttribute("role", "region");
    field.setAttribute("aria-labelledby", label.id);
    field.textContent = options.value;
    root.append(label, field, cue);
    body = field;
  }

  const refresh = () => {
    const more = longTextHasMore(body.scrollHeight, body.clientHeight, body.scrollTop);
    cue.hidden = !more;
    root.classList.toggle("is-overflowing", body.scrollHeight > body.clientHeight + 2);
  };
  body.addEventListener("scroll", refresh, { passive: true });
  if (body instanceof HTMLTextAreaElement) body.addEventListener("input", refresh);
  const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => refresh());
  observer?.observe(body);
  queueMicrotask(refresh);
  requestAnimationFrame(() => refresh());

  return {
    root,
    body,
    refresh,
    destroy: () => observer?.disconnect(),
  };
}
