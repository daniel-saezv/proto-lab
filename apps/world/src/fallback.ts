import type { CatalogEntry } from "./types";
import { createWhiteboardStatus, type WhiteboardStatusController } from "./whiteboard-status";

export function showFallback(options: {
  root: HTMLElement;
  prototypes: CatalogEntry[];
  onTalk: () => void;
  onInstallHelp?: () => void;
  onPlay: (entry: CatalogEntry) => void;
  onPreviews?: (container: HTMLElement) => void;
  onWhiteboardReady?: (controller: WhiteboardStatusController) => void;
}) {
  options.root.hidden = false;
  options.root.replaceChildren();
  const title = document.createElement("h1");
  title.textContent = "El laboratorio, en plano";
  const note = document.createElement("p");
  note.textContent = "Este navegador no puede mostrar el laboratorio en 3D. Puedes hablar con el Inventor y abrir los prototipos igual.";
  const boardSection = document.createElement("section");
  boardSection.className = "fallback-whiteboard";
  boardSection.dataset.testid = "fallback-whiteboard-section";
  const boardHeading = document.createElement("h2");
  boardHeading.textContent = "Tablón de propuestas";
  boardSection.append(boardHeading);
  const whiteboard = createWhiteboardStatus({ attachTo: boardSection });
  options.onWhiteboardReady?.(whiteboard);
  const previews = document.createElement("div");
  previews.className = "fallback-previews";
  previews.dataset.testid = "fallback-previews";
  previews.hidden = true;
  boardSection.append(previews);
  options.onPreviews?.(previews);

  const actions = document.createElement("div");
  actions.className = "fallback-actions";
  const talk = document.createElement("button");
  talk.type = "button";
  talk.className = "solid-button";
  talk.dataset.testid = "fallback-talk";
  talk.textContent = "Hablar con el Inventor";
  talk.addEventListener("click", options.onTalk);
  actions.append(talk);
  if (options.onInstallHelp) {
    const install = document.createElement("button");
    install.type = "button";
    install.className = "text-button";
    install.dataset.testid = "fallback-install";
    install.textContent = "Instalar en el móvil";
    install.addEventListener("click", options.onInstallHelp);
    actions.append(install);
  }
  options.root.append(title, note, boardSection, actions);

  for (const entry of options.prototypes) {
    const card = document.createElement("article");
    card.className = "fallback-card";
    const heading = document.createElement("h2");
    heading.textContent = entry.title;
    const description = document.createElement("p");
    description.textContent = entry.description;
    const meta = document.createElement("p");
    meta.textContent = `${entry.author} · v${entry.version} · ${entry.tags.join(", ")}`;
    const play = document.createElement("button");
    play.type = "button";
    play.className = "solid-button";
    play.textContent = `Jugar a ${entry.title}`;
    play.addEventListener("click", () => options.onPlay(entry));
    card.append(heading, description, meta, play);
    options.root.append(card);
  }
}
