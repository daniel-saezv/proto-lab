/**
 * Capa de apertura. Sin imágenes: el arco, el punto y las frases son CSS.
 * `loaded` y `total` son bytes. `total` 0 significa que el tamaño no se conoce.
 */
export type BootPaintPhase = "opening" | "download" | "preparing";

/** Frases cortas, una por estado. La rotación es CSS y se apaga si el sistema lo pide. */
export const BOOT_LINES: Record<BootPaintPhase, readonly string[]> = {
  opening: ["Subiendo el telón", "Buscando el interruptor", "Calentando las luces"],
  download: ["Los bytes hacen cola", "Va bajando, con calma", "Un poco más de cable"],
  preparing: ["El motor se ata los cordones", "Colocando los píxeles", "Ya casi sale a escena"],
};

export function bootProgress(
  loaded: unknown,
  total: unknown,
): { percent: number; ratio: number; phase: "download" | "preparing" } | null {
  if (typeof loaded !== "number" || typeof total !== "number") return null;
  if (!Number.isFinite(loaded) || !Number.isFinite(total) || total <= 0 || loaded < 0) return null;
  const ratio = Math.min(1, loaded / total);
  const percent = Math.round(ratio * 100);
  return { ratio, percent, phase: percent >= 100 ? "preparing" : "download" };
}

/** Texto estable para el lector de pantalla. Las frases que rotan no se anuncian. */
export function bootStatusText(phase: BootPaintPhase, percent: number | null): string {
  if (phase === "download" && percent != null) return `${percent} %. Bajando la aplicación`;
  if (phase === "preparing") return "Preparando la aplicación";
  return "Abriendo la aplicación";
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
  status.dataset.boot = "opening";
  status.setAttribute("aria-label", "Abriendo la aplicación");
  status.setAttribute("aria-valuetext", bootStatusText("opening", null));

  const boot = document.createElement("div");
  boot.className = "prototype-boot";

  const stage = document.createElement("div");
  stage.className = "prototype-boot-stage";

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

  const orbit = document.createElement("div");
  orbit.className = "prototype-boot-orbit";
  orbit.setAttribute("aria-hidden", "true");
  const comet = document.createElement("span");
  comet.className = "prototype-boot-comet";
  orbit.append(comet);
  stage.append(spin, orbit);

  const percent = document.createElement("p");
  percent.className = "prototype-boot-percent";
  percent.hidden = true;

  const quips = document.createElement("div");
  quips.className = "prototype-boot-quips";
  quips.setAttribute("aria-hidden", "true");
  for (const phase of ["opening", "download", "preparing"] as const) {
    const lines = document.createElement("div");
    lines.className = "prototype-boot-lines";
    lines.dataset.bootLines = phase;
    for (const text of BOOT_LINES[phase]) {
      const line = document.createElement("span");
      line.textContent = text;
      lines.append(line);
    }
    quips.append(lines);
  }

  boot.append(stage, percent, quips);
  status.append(boot);
  return status;
}

function paintPhase(status: HTMLElement, phase: BootPaintPhase, percent: number | null, ratio: number | null): void {
  const shown = percent == null ? "" : String(percent);
  if (status.dataset.boot === phase && (status.dataset.progress ?? "") === shown) return;
  status.dataset.boot = phase;
  const figure = status.querySelector<HTMLElement>(".prototype-boot-percent");
  if (phase === "download" && percent != null) {
    status.dataset.progress = shown;
    if (ratio != null) status.style.setProperty("--boot-ratio", ratio.toFixed(4));
    if (figure) {
      figure.hidden = false;
      figure.textContent = `${shown} %`;
    }
    status.setAttribute("aria-valuenow", shown);
  } else if (phase === "preparing" && percent != null) {
    status.dataset.progress = shown;
    if (ratio != null) status.style.setProperty("--boot-ratio", ratio.toFixed(4));
    if (figure) {
      figure.hidden = true;
      figure.textContent = "";
    }
    status.setAttribute("aria-valuenow", shown);
  } else {
    delete status.dataset.progress;
    status.style.removeProperty("--boot-ratio");
    if (figure) {
      figure.hidden = true;
      figure.textContent = "";
    }
    status.removeAttribute("aria-valuenow");
  }
  status.setAttribute("aria-valuetext", bootStatusText(phase, percent));
}

export function paintBootProgress(status: HTMLElement, loaded: unknown, total: unknown): void {
  const next = bootProgress(loaded, total);
  if (!next) {
    if (status.dataset.boot === "opening" && !status.hasAttribute("data-progress")) return;
    paintPhase(status, "opening", null, null);
    return;
  }
  paintPhase(status, next.phase, next.percent, next.ratio);
}
