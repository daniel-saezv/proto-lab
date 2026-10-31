import type { ProposalStatusItem } from "./proposals-status-api";

const PAGES_HOST = "proto-lab-3k6.pages.dev";

export type PreviewAction = {
  number: number;
  title: string;
  href: string;
};

/** Enlaces que el tablón ya trae y que apuntan a Pages (preview o producción). */
export function previewActions(items: readonly ProposalStatusItem[]): PreviewAction[] {
  const actions: PreviewAction[] = [];
  for (const item of items) {
    const href = pagesPreviewUrl(item.previewUrl);
    if (!href) continue;
    actions.push({ number: item.number, title: item.title, href });
  }
  return actions;
}

export function pagesPreviewUrl(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname;
  if (host !== PAGES_HOST && !host.endsWith(`.${PAGES_HOST}`)) return null;
  return url.toString();
}

/** Pinta «Probar la preview» con textContent. Devuelve cuántos enlaces hay. */
export function renderPreviewActions(container: HTMLElement, items: readonly ProposalStatusItem[]): number {
  container.replaceChildren();
  const actions = previewActions(items);
  if (actions.length === 0) return 0;
  const list = document.createElement("ul");
  list.className = "board-preview-list";
  for (const action of actions) {
    const item = document.createElement("li");
    item.className = "board-preview-item";
    const title = document.createElement("span");
    title.className = "board-preview-title";
    title.textContent = action.title;
    const link = document.createElement("a");
    link.className = "board-link";
    link.dataset.testid = "board-preview";
    link.href = action.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Probar la preview";
    link.setAttribute("aria-label", `Probar la preview: ${action.title}`);
    item.append(title, link);
    list.append(item);
  }
  container.append(list);
  return actions.length;
}
