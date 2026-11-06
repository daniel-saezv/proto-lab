import type { DialoguePhase } from "./dialogue-speech";
import type { CatalogEntry, ProposalDraft } from "./types";

export type ChoiceAction =
  | { type: "close" }
  | { type: "install" }
  | { type: "send" }
  | { type: "trip"; dest: "desk" | "home" }
  | { type: "pick"; slug: string }
  | { type: "phase"; phase: DialoguePhase; reset?: "propuesta" | "iteracion" };

export type ChoiceSpec = {
  id: string;
  label: string;
  action: ChoiceAction;
};

export function phaseAfterWorkshopTrip(dest: "desk" | "home"): DialoguePhase {
  return dest === "desk" ? { name: "workshop" } : { name: "confirm" };
}

export function inventorChoices(
  phase: DialoguePhase,
  draft: ProposalDraft,
  prototypes: CatalogEntry[],
): ChoiceSpec[] {
  switch (phase.name) {
    case "greet":
      return [
        {
          id: "choice-propose",
          label: "Quiero proponer un prototipo",
          action: { type: "phase", phase: { name: "title", mode: "propuesta" }, reset: "propuesta" },
        },
        {
          id: "choice-iterate",
          label: "Quiero mejorar uno que ya está",
          action: { type: "phase", phase: { name: "pick" }, reset: "iteracion" },
        },
        { id: "choice-install", label: "¿Cómo instalo el laboratorio?", action: { type: "install" } },
        { id: "choice-bye", label: "Nada, seguiré mirando", action: { type: "close" } },
      ];
    case "pick": {
      const list: ChoiceSpec[] = prototypes.map((entry) => ({
        id: `choice-proto-${entry.slug}`,
        label: `${entry.title} (v${entry.version})`,
        action: { type: "pick", slug: entry.slug },
      }));
      list.push({
        id: "choice-back",
        label: "Mejor otra cosa",
        action: { type: "phase", phase: { name: "greet" } },
      });
      return list;
    }
    case "confirm":
      return [
        { id: "choice-confirm", label: "Sí, envíalo", action: { type: "send" } },
        { id: "choice-workshop", label: "Vamos al escritorio", action: { type: "trip", dest: "desk" } },
        {
          id: "choice-edit",
          label: "Quiero cambiarlo",
          action: { type: "phase", phase: { name: "title", mode: draft.kind } },
        },
        { id: "choice-cancel", label: "Mejor no", action: { type: "close" } },
      ];
    case "author":
      return [];
    case "workshop":
      return [];
    default:
      return [];
  }
}
