import { LIMITS } from "./limits";
import type { CatalogEntry, ProposalDraft, SubmitOutcome } from "./types";

type Mode = "propuesta" | "iteracion";

type Phase =
  | { name: "greet" }
  | { name: "title"; mode: Mode }
  | { name: "body"; mode: Mode }
  | { name: "pick" }
  | { name: "confirm" }
  | { name: "sending" }
  | { name: "done"; text: string; outcome: string };

type Choice = { id: string; label: string; run: () => void };

const RESULT: Record<string, string> = {
  ok: "Apuntado. Ya está en el tablón del taller. El dueño lo leerá y, si le convence, lo marcará como aprobado. Hasta entonces la máquina sigue como está.",
  limit: "Hoy el cuaderno ya no da más de sí: has dejado varias ideas y conviene dejarlas reposar. Vuelve mañana.",
  unauthorized: "No consigo reconocerte. Esta puerta solo se abre con el pase del laboratorio. Entra desde el enlace del grupo y vuelve a hablarme.",
  config: "El cuaderno está, pero falta la llave del taller. El dueño tiene que terminar de configurarlo.",
  validation: "Algo del texto no cabe en el cuaderno. Dímelo un poco más claro.",
  github: "He intentado dejar la nota y el tablón no ha respondido. Prueba otra vez dentro de un rato.",
  network: "No llego al taller. Cuando vuelva la conexión, me lo repites.",
};

export function createDialogue(options: {
  root: HTMLElement;
  prototypes: CatalogEntry[];
  instant: boolean;
  submit: (draft: ProposalDraft) => Promise<SubmitOutcome>;
  getNearbySlug: () => string | null;
  onShowInstallHelp?: () => void;
  onOpen: () => void;
  onClose: () => void;
}) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let phase: Phase = { name: "greet" };
  let draft: ProposalDraft = { kind: "propuesta", title: "", description: "" };
  let token = 0;
  let open = false;

  function prototypeBySlug(slug: string | undefined): CatalogEntry | undefined {
    return options.prototypes.find((entry) => entry.slug === slug);
  }

  function resetDraft(kind: Mode, slug?: string) {
    draft = { kind, title: "", description: "", slug };
  }

  function speech(): string {
    const proto = prototypeBySlug(draft.slug);
    switch (phase.name) {
      case "greet":
        return "Eh, has entrado. Soy el Inventor: cuido las máquinas de este laboratorio. Cada una es un prototipo de alguien del grupo. ¿Qué se te ofrece?";
      case "title":
        return phase.mode === "propuesta"
          ? "Eso me gusta. ¿Cómo llamamos a la idea? Algo corto, para el cuaderno."
          : `Vale, «${proto?.title ?? "esa máquina"}». Ponle un título corto a este cambio.`;
      case "body":
        return phase.mode === "propuesta"
          ? `«${draft.title}». Cuéntame de qué va: qué se hace, cómo se juega o qué problema resuelve.`
          : `¿Qué le cambiarías a «${proto?.title ?? "esa máquina"}»? Sé concreto: qué sobra, qué falta, cómo debería sentirse.`;
      case "pick":
        return options.prototypes.length === 0
          ? "Todavía no hay máquinas que retocar. Cuando alguien deje una encendida, volvemos a hablar."
          : "¿Cuál de estas máquinas quieres retocar? Puedes elegirla de la lista o acercarte a ella y decirme que es esa.";
      case "confirm":
        return draft.kind === "iteracion"
          ? `Anotaría una mejora de «${proto?.title ?? draft.slug}», que va por la versión ${proto?.version ?? "?"}.\n\n«${draft.title}»\n${draft.description}\n\n¿Lo envío así?`
          : `A ver si lo he entendido. Dejaría esto en el tablón, como petición tuya, para que el dueño lo lea:\n\n«${draft.title}»\n${draft.description}\n\n¿Lo envío así?`;
      case "sending":
        return "Un momento, que mojo la pluma…";
      case "done":
        return phase.text;
    }
  }

  function choices(): Choice[] {
    if (phase.name === "greet") {
      return [
        { id: "choice-propose", label: "Quiero proponer un prototipo", run: () => { resetDraft("propuesta"); phase = { name: "title", mode: "propuesta" }; render(); } },
        { id: "choice-iterate", label: "Quiero mejorar uno que ya está", run: () => { resetDraft("iteracion"); phase = { name: "pick" }; render(); } },
        {
          id: "choice-install",
          label: "¿Cómo instalo el laboratorio?",
          run: () => {
            close();
            options.onShowInstallHelp?.();
          },
        },
        { id: "choice-bye", label: "Nada, seguiré mirando", run: () => close() },
      ];
    }
    if (phase.name === "pick") {
      const nearby = options.getNearbySlug();
      const list: Choice[] = [];
      if (nearby) {
        const entry = prototypeBySlug(nearby);
        if (entry) {
          list.push({
            id: "choice-nearest",
            label: `La que tengo delante: ${entry.title}`,
            run: () => {
              draft.slug = entry.slug;
              draft.kind = "iteracion";
              phase = { name: "title", mode: "iteracion" };
              render();
            },
          });
        }
      }
      for (const entry of options.prototypes) {
        list.push({
          id: `choice-proto-${entry.slug}`,
          label: `${entry.title} (v${entry.version})`,
          run: () => {
            draft.slug = entry.slug;
            draft.kind = "iteracion";
            phase = { name: "title", mode: "iteracion" };
            render();
          },
        });
      }
      list.push({ id: "choice-back", label: "Mejor otra cosa", run: () => { phase = { name: "greet" }; render(); } });
      return list;
    }
    if (phase.name === "confirm") {
      return [
        { id: "choice-confirm", label: "Sí, envíalo", run: () => void send() },
        { id: "choice-edit", label: "Quiero cambiarlo", run: () => { phase = { name: "title", mode: draft.kind }; render(); } },
        { id: "choice-cancel", label: "Mejor no", run: () => close() },
      ];
    }
    if (phase.name === "done") {
      return [{ id: "choice-close", label: "Seguir en el laboratorio", run: () => close() }];
    }
    return [];
  }

  function render(notice?: string) {
    const my = ++token;
    options.root.replaceChildren();
    options.root.dataset.outcome = phase.name === "done" ? phase.outcome : "";

    const portrait = document.createElement("div");
    portrait.className = "portrait";
    portrait.setAttribute("aria-hidden", "true");

    const name = document.createElement("p");
    name.className = "dialogue-name";
    name.id = "dialogue-name";
    name.textContent = "Inventor";

    const text = document.createElement("p");
    text.className = "dialogue-text";
    text.dataset.testid = "dialogue-text";
    text.setAttribute("aria-live", "polite");
    const full = notice ? `${notice}\n\n${speech()}` : speech();

    const head = document.createElement("div");
    head.className = "dialogue-head";
    head.append(portrait, name);
    options.root.append(head, text);

    const finish = () => {
      if (my !== token) return;
      if (phase.name === "title" || phase.name === "body") showInput(my);
      else showChoices(my);
    };

    if (options.instant || reduced) {
      text.textContent = full;
      finish();
      return;
    }

    let index = 0;
    let finished = false;
    const step = () => {
      if (my !== token || finished) return;
      index += 1;
      text.textContent = full.slice(0, index);
      if (index >= full.length) {
        finished = true;
        finish();
      } else {
        window.setTimeout(step, 14);
      }
    };
    text.addEventListener("click", () => {
      if (finished || my !== token) return;
      finished = true;
      text.textContent = full;
      finish();
    });
    step();
  }

  function showChoices(my: number) {
    if (my !== token) return;
    for (const choice of choices()) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "dialogue-choice";
      button.dataset.testid = choice.id;
      button.textContent = choice.label;
      button.addEventListener("click", choice.run);
      options.root.append(button);
    }
    const first = options.root.querySelector("button");
    if (first instanceof HTMLButtonElement) first.focus();
  }

  function showInput(my: number) {
    if (my !== token || (phase.name !== "title" && phase.name !== "body")) return;
    const multiline = phase.name === "body";
    const field = document.createElement(multiline ? "textarea" : "input");
    if (field instanceof HTMLInputElement) field.type = "text";
    if (field instanceof HTMLTextAreaElement) field.rows = 3;
    field.className = "dialogue-input";
    field.dataset.testid = "dialogue-input";
    field.maxLength = phase.name === "title" ? LIMITS.titleMax : LIMITS.descriptionMax;
    field.autocomplete = "off";
    field.spellcheck = true;
    field.placeholder = phase.name === "title" ? "Un nombre corto" : "Cuéntaselo al Inventor";
    field.setAttribute("aria-label", phase.name === "title" ? "Título" : "Descripción");
    field.enterKeyHint = "send";
    field.value = phase.name === "title" ? draft.title : draft.description;

    const say = document.createElement("button");
    say.type = "button";
    say.className = "dialogue-choice";
    say.dataset.testid = "dialogue-send";
    say.textContent = "Decir";

    const accept = () => {
      const value = field.value;
      const min = phase.name === "title" ? LIMITS.titleMin : LIMITS.descriptionMin;
      const cleaned = value.trim();
      if (cleaned.length < min) {
        render("Un poco más, que si no no sé qué apuntar.");
        return;
      }
      if (phase.name === "title") {
        draft.title = cleaned.replace(/\s+/g, " ");
        phase = { name: "body", mode: phase.mode };
      } else if (phase.name === "body") {
        draft.description = cleaned;
        phase = { name: "confirm" };
      }
      render();
    };

    say.addEventListener("click", accept);
    field.addEventListener("keydown", (event: Event) => {
      if (!(event instanceof KeyboardEvent)) return;
      if (event.key === "Enter" && !event.shiftKey && !(field instanceof HTMLTextAreaElement)) {
        event.preventDefault();
        accept();
      }
    });
    options.root.append(field, say);
    field.focus();
  }

  async function send() {
    phase = { name: "sending" };
    render();
    const result = await options.submit({ ...draft });
    if (!open) return;
    if (result.ok) {
      phase = { name: "done", text: RESULT.ok, outcome: "ok" };
    } else if (result.error === "validation" && result.message) {
      phase = { name: "done", text: result.message, outcome: "validation" };
    } else {
      phase = { name: "done", text: RESULT[result.error] ?? RESULT.github, outcome: result.error };
    }
    render();
  }

  function close() {
    if (!open) return;
    open = false;
    token += 1;
    options.root.hidden = true;
    options.root.replaceChildren();
    phase = { name: "greet" };
    options.onClose();
  }

  function show() {
    if (open) return;
    open = true;
    phase = { name: "greet" };
    draft = { kind: "propuesta", title: "", description: "" };
    options.root.hidden = false;
    options.onOpen();
    render();
  }

  return {
    open: show,
    close,
    isOpen: () => open,
  };
}
