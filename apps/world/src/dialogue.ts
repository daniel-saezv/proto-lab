import { INVENTOR_RESULT_OK, inventorSpeech, type DialoguePhase } from "./dialogue-speech";
import { chooseScript, scriptNode, startScript, type DialogueScript, type ScriptCursor } from "./dialogue-script";
import { LIMITS } from "./limits";
import type { CatalogEntry, ProposalDraft, SubmitOutcome } from "./types";

export const INVENTOR_NAME = "Inventor";

export function dialogueSpeakerName(session: { kind: "inventor" } | { kind: "script"; name: string }): string {
  return session.kind === "inventor" ? INVENTOR_NAME : session.name;
}

type Mode = "propuesta" | "iteracion";

type Phase = DialoguePhase | { name: "done"; text: string; outcome: string };

type SpeakerSession = { kind: "inventor" } | { kind: "script"; cursor: ScriptCursor };

type Choice = { id: string; label: string; run: () => void };

const RESULT: Record<string, string> = {
  ok: INVENTOR_RESULT_OK,
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
  onShowInstallHelp?: () => void;
  onOpen: () => void;
  onClose: () => void;
}) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let phase: Phase = { name: "greet" };
  let session: SpeakerSession = { kind: "inventor" };
  let draft: ProposalDraft = { kind: "propuesta", title: "", description: "" };
  let token = 0;
  let open = false;

  function resetDraft(kind: Mode, slug?: string) {
    draft = { kind, title: "", description: "", slug };
  }

  function speech(): string {
    if (session.kind === "script") return scriptNode(session.cursor).text;
    if (phase.name === "done") return phase.text;
    return inventorSpeech(phase, draft, options.prototypes);
  }

  function choices(): Choice[] {
    if (session.kind === "script") {
      const cursor = session.cursor;
      return scriptNode(cursor).choices.map((choice) => ({
        id: choice.id,
        label: choice.label,
        run: () => {
          const next = chooseScript(cursor, choice.id);
          if (next === "close") close();
          else {
            session = { kind: "script", cursor: next };
            render();
          }
        },
      }));
    }
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
      const list: Choice[] = [];
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

    const speaker = session.kind === "script" ? session.cursor.script.speaker : { id: "inventor", name: INVENTOR_NAME };
    options.root.dataset.speaker = speaker.id;

    const portrait = document.createElement("div");
    portrait.className = speaker.id === "inventor" ? "portrait" : `portrait portrait--${speaker.id}`;
    portrait.setAttribute("aria-hidden", "true");

    const name = document.createElement("p");
    name.className = "dialogue-name";
    name.id = "dialogue-name";
    name.textContent = dialogueSpeakerName(session.kind === "script" ? { kind: "script", name: speaker.name } : { kind: "inventor" });

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
    document.body.classList.remove("dialogue-open");
    options.root.hidden = true;
    options.root.replaceChildren();
    delete options.root.dataset.speaker;
    phase = { name: "greet" };
    session = { kind: "inventor" };
    options.onClose();
  }

  function show() {
    if (open) return;
    open = true;
    session = { kind: "inventor" };
    phase = { name: "greet" };
    draft = { kind: "propuesta", title: "", description: "" };
    document.body.classList.add("dialogue-open");
    options.root.hidden = false;
    options.onOpen();
    render();
  }

  function openIteration(slug: string) {
    const entry = options.prototypes.find((item) => item.slug === slug);
    if (!entry) return;
    open = true;
    session = { kind: "inventor" };
    resetDraft("iteracion", slug);
    phase = { name: "title", mode: "iteracion" };
    document.body.classList.add("dialogue-open");
    options.root.hidden = false;
    options.onOpen();
    render();
  }

  function openScript(script: DialogueScript) {
    if (open) return;
    open = true;
    session = { kind: "script", cursor: startScript(script) };
    phase = { name: "greet" };
    document.body.classList.add("dialogue-open");
    options.root.hidden = false;
    options.onOpen();
    render();
  }

  return {
    open: show,
    openScript,
    openIteration,
    close,
    isOpen: () => open,
  };
}
