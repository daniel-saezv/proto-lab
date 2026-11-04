import type { CatalogEntry, ProposalDraft } from "./types";
import { WORKSHOP_UI } from "./workshop-view";

export type DialoguePhase =
  | { name: "greet" }
  | { name: "title"; mode: "propuesta" | "iteracion" }
  | { name: "body"; mode: "propuesta" | "iteracion" }
  | { name: "pick" }
  | { name: "confirm" }
  | { name: "workshop" }
  | { name: "sending" };

export const INVENTOR_RESULT_OK =
  "Apuntado. Ya está en el tablón del taller. El dueño lo leerá y, si le convence, lo marcará como aprobado. Hasta entonces no cambia lo que hay en la máquina.";

const ITERATION_FALLBACK = "ese mundo";

const DESK_OFFER =
  "\n\nSi te apetece, la afinamos juntos en el {em}escritorio{/em}. Yo propongo un retoque cada vez y tú decides. Como mucho cinco turnos. No la envío hasta que lo digas.";

export function inventorSpeech(
  phase: DialoguePhase,
  draft: ProposalDraft,
  prototypes: CatalogEntry[],
): string {
  const proto = prototypes.find((entry) => entry.slug === draft.slug);
  switch (phase.name) {
    case "greet":
      return "Eh, has entrado. Soy el {em}Inventor{/em}: cuido la máquina de este laboratorio. Dentro van encendiéndose los mundos, apps y juegos que el grupo va tejiendo. ¿Qué se te ofrece?";
    case "title":
      return phase.mode === "propuesta"
        ? "Eso me gusta. ¿Cómo llamamos a la idea? Algo corto, para el {em}cuaderno{/em}."
        : `Vale, «${proto?.title ?? ITERATION_FALLBACK}». Ponle un título corto a este {em}cambio{/em}.`;
    case "body":
      return phase.mode === "propuesta"
        ? `«${draft.title}». Cuéntame de qué va: qué se hace, cómo se juega o qué problema resuelve.`
        : `¿Qué le cambiarías a «${proto?.title ?? ITERATION_FALLBACK}»? Sé concreto: qué sobra, qué falta, cómo debería sentirse.`;
    case "pick":
      return prototypes.length === 0
        ? "Todavía no hay mundos encendidos que retocar. Cuando alguien deje uno en la máquina, volvemos a hablar."
        : "¿Cuál de estos mundos, apps o juegos quieres {em}retocar{/em}? Elígelo de la lista.";
    case "confirm":
      return (
        (draft.kind === "iteracion"
          ? `Anotaría una {em}mejora{/em} de «${proto?.title ?? draft.slug}», que va por la versión ${proto?.version ?? "?"}.\n\n«${draft.title}»\n${draft.description}\n\n¿Lo envío así?`
          : `A ver si lo he entendido. Dejaría esto en el {em}tablón{/em}, como petición tuya, para que el dueño lo lea:\n\n«${draft.title}»\n${draft.description}\n\n¿Lo envío así?`) +
        DESK_OFFER
      );
    case "workshop":
      return WORKSHOP_UI.intro;
    case "sending":
      return "Un momento, que mojo la {em}pluma{/em}…";
  }
}
