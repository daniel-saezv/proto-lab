/** Cierre común de los cuadros del laboratorio: aborta sin enviar. */
export const DIALOG_CLOSE_LABEL = "Cerrar";

export function createDialogCloseButton(onClose: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "dialog-dismiss";
  button.dataset.testid = "dialog-close";
  button.setAttribute("aria-label", DIALOG_CLOSE_LABEL);
  button.textContent = "×";
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClose();
  });
  return button;
}
