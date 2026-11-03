/**
 * Capa de apertura. Sin imágenes ni bucle propio: el arco indeterminado
 * es una animación CSS y el avance real solo reescribe un porcentaje.
 * `loaded` y `total` son bytes. `total` 0 significa que el tamaño no se conoce.
 */
export function bootProgress(loaded: unknown, total: unknown): { percent: number; ratio: number } | null {
  if (typeof loaded !== "number" || typeof total !== "number") return null;
  if (!Number.isFinite(loaded) || !Number.isFinite(total) || total <= 0 || loaded < 0) return null;
  const ratio = Math.min(1, loaded / total);
  return { ratio, percent: Math.round(ratio * 100) };
}

const SVG = "http://www.w3.org/2000/svg";

function star(cx: number, cy: number, r: number): SVGCircleElement {
  const node = document.createElementNS(SVG, "circle");
  node.setAttribute("cx", String(cx));
  node.setAttribute("cy", String(cy));
  node.setAttribute("r", String(r));
  node.setAttribute("class", "prototype-boot-star");
  return node;
}

export function createBootScreen(): HTMLDivElement {
  const status = document.createElement("div");
  status.className = "prototype-status";
  status.dataset.testid = "prototype-status";
  status.setAttribute("role", "progressbar");
  status.setAttribute("aria-valuemin", "0");
  status.setAttribute("aria-valuemax", "100");
  status.setAttribute("aria-busy", "true");
  status.setAttribute("aria-label", "Abriendo la aplicación");

  const boot = document.createElement("div");
  boot.className = "prototype-boot";

  const spin = document.createElement("div");
  spin.className = "prototype-boot-spin";

  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("class", "prototype-boot-mark");
  svg.setAttribute("viewBox", "0 0 64 64");
  svg.setAttribute("aria-hidden", "true");
  const amber = star(54, 46, 1.05);
  amber.setAttribute("class", "prototype-boot-star is-amber");
  svg.append(star(11, 12, 1.15), star(52, 16, 0.75), star(14, 50, 0.65), amber);

  const track = document.createElementNS(SVG, "circle");
  track.setAttribute("class", "prototype-boot-track");
  track.setAttribute("cx", "32");
  track.setAttribute("cy", "32");
  track.setAttribute("r", "22");

  const arc = document.createElementNS(SVG, "circle");
  arc.setAttribute("class", "prototype-boot-arc");
  arc.setAttribute("cx", "32");
  arc.setAttribute("cy", "32");
  arc.setAttribute("r", "22");

  svg.append(track, arc);
  spin.append(svg);

  const label = document.createElement("p");
  label.className = "prototype-boot-label";
  label.textContent = "Abriendo";

  boot.append(spin, label);
  status.append(boot);
  return status;
}

export function paintBootProgress(status: HTMLElement, loaded: unknown, total: unknown): void {
  const next = bootProgress(loaded, total);
  const label = status.querySelector(".prototype-boot-label");
  if (!next) {
    if (!status.hasAttribute("data-progress")) return;
    delete status.dataset.progress;
    status.style.removeProperty("--boot-ratio");
    status.removeAttribute("aria-valuenow");
    status.removeAttribute("aria-valuetext");
    if (label) label.textContent = "Abriendo";
    return;
  }
  const shown = String(next.percent);
  if (status.dataset.progress === shown) return;
  status.dataset.progress = shown;
  status.style.setProperty("--boot-ratio", next.ratio.toFixed(4));
  status.setAttribute("aria-valuenow", shown);
  status.setAttribute("aria-valuetext", `${shown} %`);
  if (label) label.textContent = `${shown} %`;
}
