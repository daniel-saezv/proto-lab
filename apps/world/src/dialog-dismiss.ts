/** Cierre común de los cuadros del laboratorio: aborta sin enviar. */
export const DIALOG_CLOSE_LABEL = "Cerrar";

export function createDialogCloseButton(onClose: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "dialog-dismiss";
  button.dataset.testid = "dialog-close";
  button.setAttribute("aria-label", DIALOG_CLOSE_LABEL);
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  icon.classList.add("dialog-dismiss-icon");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M7 7l10 10M17 7L7 17");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.5");
  path.setAttribute("stroke-linecap", "round");
  icon.append(path);
  button.append(icon);
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClose();
  });
  return button;
}
